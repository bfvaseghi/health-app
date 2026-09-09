"use client";

import { useMemo, useState } from "react";
import type { AddedSet, GoalSettings, HealthState } from "../health-model";
import { buildWorkoutSessions, dateLabel } from "../health-model";
import type { FixChoice, MuscleDetail, MuscleOutlook, Plan, PlannedSession } from "../training/coach";
import {
  baseCoverage, currentTrainingWeek, minimumDirect,
  unclassifiedExercises, adjustChoice, muscleDetail, nextSession,
  remainingSessions, weekStart, sessionToText, sessionMinutes, weekOutlook,
  trainingAnchorSets,
} from "../training/coach";
import type { Muscle } from "../training/muscles";
import { muscleLabels } from "../training/muscles";
import { Icon } from "./icons";
import { copyText, downloadBlob, listWords } from "./format";
import { ConfirmButton } from "./primitives";
import { PrescriptionColumns, WorkoutPrescription as Lift } from "./workout-prescription";
import { sessionAreas, workoutLabel, workoutRequired } from "./workout-labels";
import { behindMuscles, muscleFreshness, recordAge, sessionCloses, sinceLabel } from "../training/recommend";
import type { Modal } from "./types";

/** The plan and muscle graph use the same post-import calculation. */
export function CoachTab({
  state, today, open, onGoals, onNotice, mode = "workout", selected = null, onSelect,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
  mode?: "workout" | "muscles";
  selected?: string | null;
  onSelect?: (name: string | null) => void;
}) {
  const { plan, planned } = useMemo(() => currentTrainingWeek(state, today), [state, today]);
  const hasHistory = state.workoutSets.filter(set => set.date <= today).length >= 10;
  const unknown = useMemo(() => unclassifiedExercises(state.workoutSets), [state.workoutSets]);
  const outlook = useMemo(() => weekOutlook(plan, state, today), [plan, state, today]);
  const remaining = useMemo(() => remainingSessions(plan, state, today), [plan, state, today]);
  const foundation = useMemo(() => baseCoverage(planned), [planned]);
  const baseOutlook = useMemo(() => weekOutlook(plan, state, today, { baseOnly: true }), [plan, state, today]);
  const sessions = useMemo(() => buildWorkoutSessions(state.workoutSets.filter(set => set.date <= today)), [state.workoutSets, today]);
  const importedCount = sessions.filter(session => session.date >= weekStart(today)).length;
  const baseGaps = baseOutlook.filter(row => row.shortBy > 0);
  const foundationMinutes = useMemo(() => {
    if ((importedCount ? !baseGaps.length : foundation.complete) || plan.deload || planned.missing.length) return null;
    return [60, 75, 90, 120].find(minutes => {
      if (minutes <= state.goals.trainingSessionMinutes) return false;
      const changed = { ...state, goals: { ...state.goals, trainingSessionMinutes: minutes } };
      const alternative = currentTrainingWeek(changed, today).plan;
      return importedCount ? weekOutlook(alternative, changed, today, { baseOnly: true }).every(row => row.shortBy === 0) : baseCoverage(alternative).complete;
    }) ?? null;
  }, [importedCount, baseGaps.length, foundation.complete, plan.deload, planned.missing.length, state, today]);

  const exportText = async (text: string) => {
    if (await copyText(text)) onNotice("Workout text copied.");
    else { downloadBlob("baseline-workout.txt", new Blob([text], { type: "text/plain" })); onNotice("Workout text downloaded."); }
  };
  const importWorkout = () => open({ kind: "import", source: "strong" });
  // What has gone longest without work, and how old the record is. Both
  // branches below need them: the workout to say what it closes, the coverage
  // page to show every group.
  const behind = behindMuscles(state, today);
  const freshness = muscleFreshness(state, today);
  const age = recordAge(state, today);
  // The muscle graph is the eleven weekly targets. It is worth reading before
  // anything is imported — that is when you most want to know what the week is
  // supposed to add up to — so the empty state announces the missing import
  // rather than standing in for the graph.
  if (mode === "muscles") return <div className="training-workspace muscle-workspace">
    <div className="training-section-heading"><div><h2>Muscle groups</h2><p>Week of {dateLabel(weekStart(today), { month: "short", day: "numeric" })}</p></div></div>
    {hasHistory ? null : <div className="workout-finish"><Icon name="upload" /><div><b>Nothing imported yet</b><p>These are the weekly targets. Import your Strong export to see what you have logged against them.</p></div><button type="button" className="button secondary small" onClick={importWorkout}>Import Strong export</button></div>}
    <Balance outlook={outlook} plan={plan} state={state} today={today} onGoals={onGoals} />
    <section className="coverage-strip" aria-label="When each muscle group was last trained">
      <div className="coverage-strip-head">
        <span className="tl-caps">Every muscle group</span>
        <span>{behind.length ? `${behind.length} behind` : "all current"}</span>
      </div>
      <ul>
        {freshness.map(entry => (
          <li key={entry.muscle} className={entry.days === null || entry.days >= 7 ? "is-behind" : ""}>
            <b>{entry.label}</b>
            <small>{sinceLabel(entry.days)}</small>
          </li>
        ))}
      </ul>
    </section>

    {/* Shown for every plan structure. The two-visit promise is the reason
        this app plans a week at all, so a week that cannot keep it has to say
        so — an upper/lower week most of all, since its opening pair carries
        half the volume rather than the whole body twice. */}
    {hasHistory ? <section className="base-plan-check" aria-label="Two-workout coverage">
      <h3><Icon name="fitness" /> {state.goals.trainingSplit === "full-body" ? "Two-workout base" : "Your first two visits"}</h3>
      <p>{plan.deload ? "Lighter week: fewer sets in the first two workouts." : baseGaps.length ? `${baseOutlook.length - baseGaps.length} of ${baseOutlook.length} muscle targets covered by logged work + the first two workouts.` : "Logged work + your first two workouts cover all muscle targets."}</p>
      {baseGaps.length && !plan.deload ? <p className="training-shortfall">Below target: {listWords(baseGaps.map(row => row.label.toLowerCase()))}.</p> : null}
      {foundationMinutes ? <button type="button" className="button secondary small" onClick={() => onGoals(current => ({ ...current, trainingSessionMinutes: foundationMinutes }))}>Use {foundationMinutes}-minute workouts to fit the base</button> : null}
    </section> : null}
    <details className="training-explanation"><summary>How sets count</summary><p>Direct work counts as 1 set. Work as a supporting muscle counts as ½. Core counts direct sets only. Planned sets are still to do, including any optional visits you selected.</p><p>{plan.deload ? "The chart keeps the usual targets visible during this lighter week." : "The shaded band marks the weekly target. Open a muscle to see its exercises or adjust the remaining sets."}</p></details>
    {hasHistory && (planned.missing.length || unknown.length) ? <Notes missing={planned.missing.map(muscle => muscleLabels[muscle].toLowerCase())} unknown={unknown} /> : null}
  </div>;

  if (!hasHistory) return <div className="training-workspace workout-desk"><section className="week-setup-panel">
    <span className="section-eyebrow"><Icon name="upload" /> Your Strong record</span>
    <h2>Start with your workout history</h2>
    <p>Import your Strong export to get a plan based on the exercises and weights you already use.</p>
    <button type="button" className="button primary" onClick={importWorkout}><Icon name="upload" />Import Strong export</button>
    {state.workoutSets.length ? <p className="field-note">At least 10 logged sets are needed.</p> : null}
  </section></div>;

  const next = nextSession(plan, state, today);
  // Only unfinished workouts can become instructions. A matched import is data,
  // never an old plan with newly calculated targets presented as a completed log.
  const hero = remaining.find(session => session.name === selected) ?? next.session;
  const isNext = hero?.name === next.session?.name;
  const drop = (session: PlannedSession, exercise: string) => onGoals(current => ({
    ...current,
    addedSets: current.addedSets.filter(entry => !(entry.weekStart === weekStart(today) && entry.session === session.name && entry.exercise === exercise)),
  }));

  const others = remaining.filter(session => session.name !== hero?.name);

  const closes = hero ? sessionCloses(hero, behind) : [];

  return <div className="training-workspace workout-desk workout-detail">
    <section className="workout-sheet" aria-label="Next workout plan">
      <header className="workout-sheet-cover next-workout-cover">
        {/* The answer, then what it is for. Nothing about weeks or slots. */}
        <div className="workout-sheet-label"><Icon name="fitness" /><span>{hero ? isNext ? "Do this next" : "Another option" : "Nothing outstanding"}</span></div>
        <div className="workout-sheet-title"><h2 id="fitness-step-heading" tabIndex={-1}>{hero ? workoutLabel(hero) : "You are covered"}</h2>{hero ? <span><Icon name="clock" /> {sessionMinutes(hero)} min</span> : null}</div>
        <p>{!hero
          ? "Every muscle group has been trained recently. Rest, or take one of the sessions below."
          : closes.length
            ? `Closes your longest gap: ${closes.slice(0, 3).map(entry => `${entry.label.toLowerCase()} ${sinceLabel(entry.days)}`).join(", ")}.`
            : "Nothing is behind. This keeps every muscle group current."}</p>
        {/* Where the answer came from, since it is only as current as the last
            export you remembered to bring across. */}
        {age.days === null ? null : <p className="record-age">{`Read from your Strong record, last updated ${sinceLabel(age.days)}.`}</p>}
        {/* What the button does, at the button. It copies text; it does not
            build a Strong routine, and saying so here beats saying it in a
            fold nobody opens. */}
        {hero ? <button type="button" className="button primary small copy-strong" onClick={() => void exportText(sessionToText(plan, { ...hero, name: workoutLabel(hero) }))}><Icon name="copy" /><span>Copy for Strong<small>Copies the text to paste in</small></span></button> : null}
      </header>
      {hero ? <>
        <PrescriptionColumns />
        <div className="session-exercises" aria-label={`${workoutLabel(hero)}, exercises`}>
          {hero.exercises.map(exercise => <Lift key={`${hero.name}:${exercise.exercise}`} exercise={exercise} targetLabel={isNext ? "Next workout" : "This workout"} onDrop={exercise.byHand ? () => drop(hero, exercise.exercise) : undefined} />)}
        </div>
      </> : null}
      {hero ? <details className="why-this">
        <summary>Why this workout</summary>
        <p>{`It trains ${sessionAreas(hero).slice(0, -1).join(", ")} and ${sessionAreas(hero).slice(-1)[0]}.`}</p>
        <p>{closes.length
          ? `It was chosen because ${closes.length === 1 ? "that group has" : "those groups have"} gone longest without work. Every time you open this, it is recalculated from what you have logged, so the answer follows what you actually did rather than a schedule.`
          : "Nothing has gone stale, so this one keeps every group ticking over. Every time you open this, it is recalculated from what you have logged."}</p>
        <p>{`Weights come from what you lifted last time in Strong${plan.deload ? ", and this week is deliberately lighter to let you recover" : ""}. Open any exercise to see the set it was based on.`}</p>
      </details> : null}
    </section>
    {others.length ? <nav className="later-list" aria-label="The rest of this week">
      {others.map(session => <button type="button" key={session.name} onClick={() => onSelect?.(session.name === selected ? null : session.name)}>
        <span><b>{workoutLabel(session)}</b><small>{workoutRequired(session) ? "You need this one" : "Only if you want it"} · starts with {session.exercises[0]?.exercise.replace(/\s*\([^)]+\)$/, "") ?? "nothing"} · {sessionMinutes(session)} min</small></span>
        <Icon name="chevron" />
      </button>)}
      {selected ? <button type="button" className="text-button" onClick={() => onSelect?.(null)}>Back to the next workout</button> : null}
    </nav> : null}
    {/* When you finish, you log it in Strong and import it back. One line, at
        the bottom, where you are when you have finished reading the workout. */}
    <p className="after-line">
      Done? Log it in Strong, then
      {" "}
      <button type="button" className="text-button" onClick={importWorkout}>import your export</button>
      {" "}
      to update what comes next.
    </p>
    <details className="plan-settings standalone-settings plan-settings-fold"><summary><Icon name="settings" /> Settings</summary>
      {/* What is left once the programme stops being something you operate: a
          real preference, and a way to start over. The days-per-week picker,
          the split choice and the week counter were the plan's own controls. */}
      <label className="plan-field"><span>How long you have</span><select aria-label="Time limit per workout" value={state.goals.trainingSessionMinutes} onChange={event => onGoals(current => ({ ...current, trainingSessionMinutes: Number(event.target.value) }))}>{[45, 60, 75, 90, 120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      <div className="tl-section-head" style={{ marginTop: 14 }}>
        <span className="tl-caps">Start over</span>
        <ConfirmButton label="Start over" confirmLabel="Reset and rebuild from my record" className="text-button" icon="undo" onConfirm={() => onGoals(current => ({ ...current, trainingBlockStart: weekStart(today), trainingAnchorSets: trainingAnchorSets(state, today), trainingDays: [], addedSets: [] }))} />
      </div>
    </details>
  </div>;
}

/** Half-set credits stay visible rather than rounding up. */
function sets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Balance({ outlook, plan, state, today, onGoals }: {
  outlook: MuscleOutlook[];
  plan: Plan;
  state: HealthState;
  today: string;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
}) {
  const [row, setRow] = useState<Muscle | null>(null);
  const ceiling = Math.max(...outlook.map(entry => Math.max(entry.target.max, entry.projected)), 1);
  const detail = useMemo(() => row ? muscleDetail(plan, state, row, today) : null, [row, plan, state, today]);
  const adjust = (muscle: Muscle, direction: 1 | -1) => {
    const choice = adjustChoice(plan, state, muscle, direction, today);
    if (!choice) return;
    const same = (entry: AddedSet) => entry.weekStart === weekStart(today) && entry.session === choice.session && entry.exercise === choice.exercise;
    onGoals(current => {
      const total = (current.addedSets.find(same)?.sets ?? 0) + direction;
      return { ...current, addedSets: [
        ...current.addedSets.filter(entry => !same(entry)),
        ...(total === 0 ? [] : [{ weekStart: weekStart(today), session: choice.session, exercise: choice.exercise, sets: total }]),
      ] };
    });
  };
  const label = (name: string) => {
    const session = plan.sessions.find(session => session.name === name);
    return session ? workoutLabel(session) : name;
  };

  return <section className="muscle-chart" aria-label="Weekly muscle group graph">
    <div className="muscle-chart-legend"><span><i className="chart-key logged" />Logged</span><span><i className="chart-key planned" />Remaining plan</span><span><i className="chart-key target" />Target range</span></div>
    <div className="muscle-chart-columns"><span>Muscle</span><span>Logged + planned = total</span></div>
    <ul className="muscle-chart-list">{outlook.map(entry => {
      const width = (value: number) => `${Math.min(100, value / ceiling * 100)}%`;
      const isOpen = row === entry.muscle;
      const directShort = entry.direct < minimumDirect(entry.muscle);
      const status = entry.status === "under" ? "low" : entry.status === "over" ? "high" : "ok";
      const statusLabel = directShort ? "Direct work below target" : entry.status === "under" ? "Below target" : entry.status === "over" ? "Above target" : "Within target";
      const add = isOpen ? adjustChoice(plan, state, entry.muscle, 1, today) : null;
      const remove = isOpen ? adjustChoice(plan, state, entry.muscle, -1, today) : null;
      return <li key={entry.muscle} className={`muscle-chart-item ${status}${isOpen ? " is-open" : ""}`}>
        <button type="button" className="muscle-chart-row" aria-expanded={isOpen} aria-label={`${entry.label}: ${sets(entry.done)} logged plus ${sets(entry.coming)} planned equals ${sets(entry.projected)} sets. Target ${entry.target.min} to ${entry.target.max}. ${statusLabel}. Show exercises`} onClick={() => setRow(current => current === entry.muscle ? null : entry.muscle)}>
          <span className="muscle-chart-name">{entry.label}<Icon name="chevron" /></span>
          <span className="muscle-chart-values">{sets(entry.done)} <i>+</i> {sets(entry.coming)} <i>=</i> <b>{sets(entry.projected)}</b></span>
          <span className="muscle-chart-track" aria-hidden="true"><span className="muscle-chart-band" style={{ left: width(entry.target.min), width: width(entry.target.max - entry.target.min) }} /><span className="muscle-chart-planned" style={{ width: width(entry.projected) }} /><span className="muscle-chart-logged" style={{ width: width(entry.done) }} /></span>
          <span className={`muscle-chart-target ${status}`}>{entry.target.min}–{entry.target.max} sets{entry.status === "under" ? " · low" : entry.status === "over" ? " · high" : ""}</span>
        </button>
        {isOpen && detail ? <Detail detail={{ ...detail, work: detail.work.map(item => ({ ...item, where: item.done ? `Logged ${item.where}` : label(item.where) })) }} row={entry} add={add ? { ...add, session: label(add.session) } : null} remove={remove ? { ...remove, session: label(remove.session) } : null} onAdjust={direction => adjust(entry.muscle, direction)} /> : null}
      </li>;
    })}</ul>
  </section>;
}

/**
 * One muscle's week, itemised: every lift that trains it, what it is worth, and
 * — where the week comes up short — what to add and which session to add it to.
 */
function Detail({
  detail,
  row,
  add,
  remove,
  onAdjust,
}: {
  detail: MuscleDetail;
  row: MuscleOutlook;
  add: FixChoice | null;
  remove: FixChoice | null;
  onAdjust: (direction: 1 | -1) => void;
}) {
  const directFloor = minimumDirect(row.muscle);
  const directPass = row.direct >= directFloor;
  const underGuide = row.projected < row.target.min;
  const overGuide = row.projected > row.target.max;
  return (
    <div className="row-detail">
      <div className="threshold-equation">
        <b>{`${sets(row.direct)} direct + ${sets(row.indirect)} indirect × ½ = ${sets(row.projected)} effective`}</b>
        <span className={directPass ? "threshold-check is-pass" : "threshold-check is-fail"}>
          {`Direct target ≥${directFloor} ${directPass ? "✓" : "✕"}`}
        </span>
        <span
          className={
            underGuide ? "threshold-check is-fail" : overGuide ? "threshold-check is-over" : "threshold-check is-pass"
          }
        >
          {`Weekly target ${row.target.min}–${row.target.max} ${underGuide ? "✕" : overGuide ? "over" : "✓"}`}
        </span>
      </div>
      <div className="muscle-set-adjustments">
        {add ? <button type="button" className="text-button" onClick={() => onAdjust(1)}><Icon name="plus" /><span>Add 1 set<small>{add.exercise} · {add.session}</small></span></button> : null}
        {remove ? <button type="button" className="text-button" onClick={() => onAdjust(-1)}><Icon name="minus" /><span>Remove 1 set<small>{remove.exercise} · {remove.session}</small></span></button> : null}
        {row.status === "under" ? <span className="row-gap">{directPass ? `${sets(row.shortBy)} effective sets short` : `${sets(directFloor - row.direct)} direct sets short`}</span> : null}
      </div>
      {detail.work.length ? (
        <ul>
          {detail.work.map((item) => (
            <li key={`${item.where}:${item.exercise}:${item.done}`} className={item.done ? "is-done" : ""}>
              <span className="detail-where">{item.where}</span>
              <span className="detail-name">{item.exercise}</span>
              <span className="detail-sets">
                {item.direct ? `${item.sets}` : `${item.sets} → ${sets(item.sets * 0.5)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="row-note">
          {add ? "No planned sets." : "No matching exercise in the remaining plan."}
        </p>
      )}
    </div>
  );
}

/**
 * The two things the plan has to admit to, out of the way until asked for.
 *
 * Both are about the log rather than about the training, and neither changes
 * what you do in the gym today.
 */
function Notes({ missing, unknown }: { missing: string[]; unknown: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="coach-notes">
      <button type="button" className="note-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {open ? "Hide notes" : "Notes"}
        <Icon name="chevron" />
      </button>
      {open ? (
        <>
          {missing.length ? (
            <p className="coach-footnote">
              {`No matching exercise: ${listWords(missing)}`}
            </p>
          ) : null}
          {unknown.length ? (
            <p className="coach-footnote">
              {`Unmapped exercises: ${unknown.slice(0, 6).join(", ")}${
                unknown.length > 6 ? ` +${unknown.length - 6}` : ""
              }.`}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
