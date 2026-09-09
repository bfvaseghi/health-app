"use client";

import { useMemo, useState } from "react";
import type { AddedSet, GoalSettings, HealthState } from "../health-model";
import { buildWorkoutSessions, dateLabel } from "../health-model";
import type { FixChoice, MuscleDetail, MuscleOutlook, Plan, PlannedSession } from "../training/coach";
import {
  DAY_CHOICES, baseCoverage, currentTrainingWeek, minimumDirect, planToText,
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
import { workoutLabel } from "./workout-labels";
import type { Modal } from "./types";

/** The plan and muscle graph use the same post-import calculation. */
export function CoachTab({
  state, today, open, onGoals, onNotice, onMuscles, onWorkout, mode = "workout", selected = null, onSelect,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
  onMuscles: () => void;
  onWorkout?: () => void;
  mode?: "workout" | "muscles";
  selected?: string | null;
  onSelect?: (name: string | null) => void;
}) {
  const { week, block, plan, planned } = useMemo(() => currentTrainingWeek(state, today), [state, today]);
  const hasHistory = state.workoutSets.filter(set => set.date <= today).length >= 10;
  const unknown = useMemo(() => unclassifiedExercises(state.workoutSets), [state.workoutSets]);
  const outlook = useMemo(() => weekOutlook(plan, state, today), [plan, state, today]);
  const remaining = useMemo(() => remainingSessions(plan, state, today), [plan, state, today]);
  const foundation = useMemo(() => baseCoverage(planned), [planned]);
  const baseOutlook = useMemo(() => weekOutlook(plan, state, today, { baseOnly: true }), [plan, state, today]);
  const sessions = useMemo(() => buildWorkoutSessions(state.workoutSets.filter(set => set.date <= today)), [state.workoutSets, today]);
  const latest = sessions[0];
  const importedCount = sessions.filter(session => session.date >= weekStart(today)).length;
  const baseGaps = baseOutlook.filter(row => row.shortBy > 0);
  const allGaps = outlook.filter(row => row.shortBy > 0);
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
  const setDays = (value: number) => {
    onSelect?.(null);
    onGoals(current => ({ ...current, trainingDays: Array.from({ length: block.length }, (_, index) => index === week ? value : current.trainingDays[index] ?? 4) }));
  };
  const targetDays = state.goals.trainingDays[week] || 4;
  const frequency = <div className="training-frequency">
    <div><b>Workouts this week</b><span>{state.goals.trainingSplit === "full-body" ? `2 full-body${targetDays > 2 ? ` + ${targetDays - 2} optional` : ""}` : "Upper / lower"}</span></div>
    <div className="frequency-picker" role="group" aria-label="Weekly workout goal">{DAY_CHOICES.map(value => <button type="button" key={value} aria-label={`${value} workouts`} aria-pressed={targetDays === value} onClick={() => setDays(value)}>{value}</button>)}</div>
  </div>;

  // The muscle graph is the eleven weekly targets. It is worth reading before
  // anything is imported — that is when you most want to know what the week is
  // supposed to add up to — so the empty state announces the missing import
  // rather than standing in for the graph.
  if (mode === "muscles") return <div className="training-workspace muscle-workspace">
    <div className="training-section-heading"><div><h2>Muscle groups</h2><p>Week of {dateLabel(weekStart(today), { month: "short", day: "numeric" })}</p></div>{hasHistory ? <button type="button" className="text-button" onClick={onWorkout}>Open workout <Icon name="arrow" /></button> : null}</div>
    {hasHistory ? frequency : <div className="workout-finish"><Icon name="upload" /><div><b>Nothing imported yet</b><p>These are the weekly targets. Import your Strong export to see what you have logged against them.</p></div><button type="button" className="button secondary small" onClick={importWorkout}>Import Strong export</button></div>}
    <Balance outlook={outlook} plan={plan} state={state} today={today} onGoals={onGoals} />
    {hasHistory && state.goals.trainingSplit === "full-body" ? <section className="base-plan-check" aria-label="Two-workout coverage">
      <h3><Icon name="fitness" /> Two-workout base</h3>
      <p>{plan.deload ? "Lighter week: fewer sets in A and B." : baseGaps.length ? `${baseOutlook.length - baseGaps.length} of ${baseOutlook.length} muscle targets covered by logged work + remaining base workouts.` : "Logged work + remaining A and B cover all muscle targets."}</p>
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

  // One screen, not two. The week used to be a step you completed before you
  // were allowed to see the workout, and the step's own panel then previewed
  // the workout it was gating. What the week actually contributes is a line of
  // context, so that is what it is now: the workout is the page.
  const others = remaining.filter(session => session.name !== hero?.name);

  return <div className="training-workspace workout-desk workout-detail">
    <div className="week-line">
      <span><b>Week of {dateLabel(weekStart(today), { month: "short", day: "numeric" })}</b>{` · ${importedCount} of ${targetDays} logged`}{plan.deload ? " · lighter week" : ""}</span>
      <button type="button" className="text-button" onClick={importWorkout}><Icon name="upload" />{latest ? `Import · last ${dateLabel(latest.date, { month: "short", day: "numeric" })}` : "Import from Strong"}</button>
    </div>
    <section className="workout-sheet" aria-label="Next workout plan">
      <header className="workout-sheet-cover next-workout-cover">
        <div className="workout-sheet-label"><Icon name="fitness" /><span>{hero ? isNext ? "Next workout" : "Later this week" : "No workouts remaining"}{hero?.tier === "extra" ? " · optional" : ""}</span></div>
        <div className="workout-sheet-title"><h2 id="fitness-step-heading" tabIndex={-1}>{hero ? workoutLabel(hero) : "Your week is logged"}</h2>{hero ? <span><Icon name="clock" /> {sessionMinutes(hero)} min</span> : null}</div>
        <p>{hero ? `${hero.exercises.length} exercises · ${hero.sets} sets` : `${importedCount} workouts logged this week`}</p>
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
    </section>
    {others.length ? <nav className="later-list" aria-label="The rest of this week">
      {others.map(session => <button type="button" key={session.name} onClick={() => onSelect?.(session.name === selected ? null : session.name)}>
        <span><b>{workoutLabel(session)}</b><small>{session.tier === "extra" ? "optional · " : ""}{session.exercises.length} exercises · {sessionMinutes(session)} min</small></span>
        <Icon name="chevron" />
      </button>)}
      {selected ? <button type="button" className="text-button" onClick={() => onSelect?.(null)}>Back to the next workout</button> : null}
    </nav> : null}
    <div className="workout-finish"><Icon name="upload" /><div><b>{hero ? "After this workout" : "Update your record"}</b><p>{hero ? "Log it in Strong, then import the updated export." : "Import your latest Strong export to update the plan."}</p></div><button type="button" className="button secondary small" onClick={importWorkout}>Import completed workout</button></div>
    <button type="button" className="coverage-link" onClick={onMuscles}><Icon name="baseline" /><span><b>Muscle coverage</b><small>{allGaps.length && !plan.deload ? `${allGaps.length} groups below target in the current plan` : "See how this workout fits your week"}</small></span><Icon name="chevron" /></button>
    <details className="plan-settings standalone-settings plan-settings-fold"><summary><Icon name="settings" /> Plan settings</summary>
      <div className="tl-section-head"><span className="tl-caps">{plan.deload ? "Lighter week · 4 of 4" : `Week ${week + 1} of 4`}</span><ConfirmButton label="Restart block" confirmLabel="Clear choices & restart" className="text-button" icon="undo" onConfirm={() => onGoals(current => ({ ...current, trainingBlockStart: weekStart(today), trainingAnchorSets: trainingAnchorSets(state, today), trainingDays: [], addedSets: [] }))} /></div>
      {frequency}
      <label className="plan-field"><span>Plan structure</span><select aria-label="Plan structure" value={state.goals.trainingSplit} onChange={event => onGoals(current => ({ ...current, trainingSplit: event.target.value as GoalSettings["trainingSplit"] }))}><option value="full-body">Two full-body workouts + optional extras</option><option value="upper-lower">Upper / lower split</option></select></label>
      <label className="plan-field"><span>Time limit per workout</span><select aria-label="Time limit per workout" value={state.goals.trainingSessionMinutes} onChange={event => onGoals(current => ({ ...current, trainingSessionMinutes: Number(event.target.value) }))}>{[45, 60, 75, 90, 120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      {remaining.length > 1 ? <button type="button" className="text-button" onClick={() => void exportText(planToText({ ...plan, days: remaining.length, sessions: remaining.map(session => ({ ...session, name: workoutLabel(session) })) }))}>Copy remaining week</button> : null}
    </details>
    <details className="training-explanation"><summary>How these targets are calculated</summary><p>Targets use your imported Strong history. Open each exercise to see the previous workout and why its weight or rest changed.</p><p>Strong exports its rest timer setting, not a measurement of how long you rested.</p></details>
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
