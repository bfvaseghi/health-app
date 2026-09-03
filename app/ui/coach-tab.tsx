"use client";

import { useMemo, useState } from "react";
import type { AddedSet, GoalSettings, HealthState } from "../health-model";
import type {
  FixChoice,
  MuscleDetail,
  MuscleOutlook,
  Plan,
  PlannedExercise,
  PlannedSession,
} from "../training/coach";
import {
  DAY_CHOICES,
  buildBlock,
  currentBlockWeek,
  minimumDirect,
  planToText,
  recommendDays,
  unclassifiedExercises,
  adjustChoice,
  muscleDetail,
  nextSession,
  remainingSessions,
  weekStart,
  sessionToText,
  weekOutlook,
  withAddedSets,
  trainingAnchorSets,
  workoutWeekStreak,
} from "../training/coach";
import type { Muscle } from "../training/muscles";
import { muscleLabels } from "../training/muscles";
import { strengthIndex } from "../training/progress";
import { Icon } from "./icons";
import { copyText, listWords } from "./format";
import { ConfirmButton, Fold } from "./primitives";
import { Tide } from "./tide";
import type { Modal } from "./types";

/**
 * A four-week block, built from the log. Three weeks that climb and one that
 * backs off, each week taking whatever number of days you have time for.
 *
 * There is no list of adjustments. What the log says is wrong with the
 * programme — a muscle getting nothing, a rest timer set for the wrong rep
 * range, too few sessions — is already applied to the weeks below. Reading
 * about a problem and then fixing it yourself is two jobs; this is one.
 */
export function CoachTab({
  state,
  today,
  open,
  demo,
  onGoals,
  onNotice,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  demo: boolean;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
}) {
  // Which week of the block it is, worked out from how long you have been
  // training. The block is real — volume climbs for three weeks and the fourth
  // backs off — but it is not something to be understood or kept in step with,
  // so there is nothing here to choose. There is this week's plan.
  const week = useMemo(() => currentBlockWeek(state, today), [state, today]);

  const advice = useMemo(() => recommendDays(state, today), [state, today]);
  const block = useMemo(() => buildBlock(state, today, state.goals.trainingDays), [state, today]);
  const unknown = useMemo(() => unclassifiedExercises(state.workoutSets), [state.workoutSets]);
  const streak = useMemo(() => workoutWeekStreak(state, today), [state, today]);
  const strength = useMemo(() => strengthIndex(state, today, 12), [state, today]);

  // What the coach wrote, plus whatever you added to it yourself.
  const plan = useMemo(
    () => withAddedSets(block[Math.min(week, block.length - 1)], state, today),
    [block, week, state, today],
  );
  // The session you are about to do is the hero of the page. The others fold,
  // and opening one is not a reason to close another.
  const [opened, setOpened] = useState<Set<string> | null>(null);
  const outlook = useMemo(() => weekOutlook(plan, state, today), [plan, state, today]);
  // A Strong import changes the cards themselves, not just the muscle bars:
  // completed direct work is worth one set, indirect work is worth half, and
  // only the useful remainder stays on screen or gets copied back to Strong.
  const remaining = useMemo(() => remainingSessions(plan, state, today), [plan, state, today]);

  if (state.workoutSets.length < 10) {
    return (
      <div className="tl-page">
        <h2 className="tl-hero">Nothing to build from yet.</h2>
        <p className="tl-lede">
          The coach writes a four-week block from your own lifts. Ten logged sets are enough to start; a Strong export brings them in at once.
        </p>
        {demo ? null : (
          <div className="tl-actions">
            <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
              <Icon name="upload" />
              Import from Strong
            </button>
          </div>
        )}
      </div>
    );
  }

  /** A day choice is remembered per week, so a busy week stays a busy week. */
  const setDays = (value: number) => {
    onGoals((current) => {
      const days = [...current.trainingDays];
      while (days.length < block.length) days.push(0);
      // Choosing the suggested number puts that week back on automatic.
      days[week] = value === advice.days ? 0 : value;
      return { ...current, trainingDays: days };
    });
  };

  const setsLeft = remaining.reduce((total, session) => total + session.sets, 0);
  const next = nextSession(plan, state, today);
  const hero = next.session ?? null;
  const others = remaining.filter((session) => session.name !== hero?.name);
  const shown = opened ?? new Set<string>();
  // Minutes a session takes at the rests it prescribes, plus the set itself.
  const minutes = hero
    ? Math.round(hero.exercises.reduce((total, exercise) => total + exercise.sets * (exercise.restSeconds + 45), 0) / 60 / 5) * 5
    : 0;
  const stepUps = hero ? hero.exercises.filter((exercise) => exercise.stepUp).length : 0;
  const easing = hero ? hero.exercises.filter((exercise) => exercise.stalled).length : 0;
  const strengthRecorded = strength.filter((point) => point.value !== null);
  const strengthChange = strengthRecorded.length >= 2 ? Math.round(((strengthRecorded.at(-1)!.value as number) - 100) * 10) / 10 : null;

  const drop = (session: PlannedSession, exercise: string) =>
    onGoals((current) => ({
      ...current,
      addedSets: current.addedSets.filter(
        (entry) => !(entry.weekStart === weekStart(today) && entry.session === session.name && entry.exercise === exercise),
      ),
    }));

  return (
    <>
      <h2 className="tl-hero" style={{ marginTop: 18 }}>
        {hero ? hero.name : "Week done."}
      </h2>
      <p className="tl-lede">
        {hero
          ? `Next · ${hero.sets} sets · about ${minutes} min · `
          : `All ${next.of} sessions logged. Rest, or add one below. · `}
        <b>{`${next.done} of ${next.of}`}</b>
        {` this week${plan.deload ? " · an easier week on purpose" : ""}`}
        {streak.weeks ? (
          <>
            {" · "}
            <b>{streak.weeks}</b>
            {`\u2011week streak${streak.currentWeek ? "" : " — one lift keeps it"}`}
          </>
        ) : null}
      </p>
      <div className="tl-actions">
        {hero ? (
          <button
            type="button"
            className="button primary"
            onClick={async () =>
              onNotice((await copyText(sessionToText(plan, hero))) ? "Session copied. Paste it into Strong." : "Copying is blocked here.")
            }
          >
            <Icon name="copy" />
            Copy for Strong
          </button>
        ) : null}
        {remaining.length > 1 ? (
          <button
            type="button"
            className="button secondary"
            onClick={async () =>
              onNotice(
                (await copyText(planToText({ ...plan, days: remaining.length, sessions: remaining })))
                  ? "The rest of the week is copied."
                  : "Copying is blocked here.",
              )
            }
          >
            {next.done ? "Copy the rest of the week" : "Copy the week"}
          </button>
        ) : null}
      </div>

      {hero ? (
        <section className="tl-section" aria-label={`${hero.name}, every lift`}>
          <div className="tl-rows" style={{ marginTop: 0 }}>
            {hero.exercises.map((exercise) => (
              <Lift key={`${hero.name}:${exercise.exercise}`} exercise={exercise} onDrop={exercise.byHand ? () => drop(hero, exercise.exercise) : undefined} />
            ))}
          </div>
          <p className="tl-line" style={{ marginTop: 10 }}>
            {stepUps ? <><span className="tl-good">↑</span>{` ${stepUps === 1 ? "one load goes" : `${stepUps} loads go`} up — top of the range on every set last time`}</> : null}
            {stepUps && easing ? " · " : ""}
            {easing ? <><span style={{ color: "var(--warn)" }}>↓</span>{` ${easing === 1 ? "one eases" : `${easing} ease`} off after a stall`}</> : null}
            {!stepUps && !easing ? "Every load holds this week." : ""}
          </p>
        </section>
      ) : null}

      {others.length ? (
        <section className="tl-section" aria-label="The rest of the week">
          <div className="tl-section-head">
            <span className="tl-caps">Still to come</span>
            <span className="tl-meta">{`${setsLeft} sets left this week`}</span>
          </div>
          <div className="plan-list" style={{ marginTop: 10 }}>
            {others.map((session) => (
              <SessionCard
                key={session.name}
                session={session}
                isNext={false}
                onDrop={(exercise) => drop(session, exercise)}
                open={shown.has(session.name)}
                onToggle={() =>
                  setOpened((current) => {
                    const changed = new Set(current ?? shown);
                    if (!changed.delete(session.name)) changed.add(session.name);
                    return changed;
                  })
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {strengthRecorded.length >= 2 ? (
        <section className="tl-section" aria-label="Strength, typical lift, twelve weeks">
          <div className="tl-section-head">
            <span className="tl-caps">Strength · typical lift · 12 weeks</span>
            <span className="tl-meta">indexed to the first week</span>
          </div>
          <Tide
            data={strength}
            label="Strength index, typical lift"
            unit="%"
            format={(value) => `${value >= 100 ? "+" : ""}${Math.round((value - 100) * 10) / 10}`}
          />
        </section>
      ) : null}

      <section className="tl-section" aria-label="This block">
        <div className="tl-section-head">
          <span className="tl-caps">{plan.deload ? "Deload · week 4 of 4" : `Build week ${week + 1} of 4`}</span>
          <ConfirmButton
            label="Restart block"
            confirmLabel="Clear choices & restart"
            className="text-button"
            icon="undo"
            onConfirm={() => onGoals((current) => ({
              ...current,
              trainingBlockStart: weekStart(today),
              trainingAnchorSets: trainingAnchorSets(state, today),
              trainingDays: [],
              addedSets: [],
            }))}
          />
        </div>
        <p className="tl-line" style={{ marginTop: 8, display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 8px" }}>
          <span>Train</span>
          <span className="tl-picker" role="group" aria-label="Sessions this week">
            {DAY_CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                className={value === plan.days ? "active" : ""}
                aria-pressed={value === plan.days}
                onClick={() => setDays(value)}
              >
                <b>{value}</b>
                <small>{value === advice.days ? "suggested" : "days"}</small>
              </button>
            ))}
          </span>
          <span>{`days a week — ${["", "one", "two", "three", "four", "five", "six", "seven"][advice.days] ?? advice.days} is suggested from your history${strengthChange !== null ? ` · strength ${strengthChange >= 0 ? "+" : ""}${strengthChange}% over the window` : ""}`}</span>
        </p>
      </section>

      <WeeklyProgression plan={plan} />

      {plan.deload ? <ProgramReview plan={block[2] ?? plan} /> : null}

      <Balance
        outlook={outlook}
        plan={plan}
        state={state}
        today={today}
        onGoals={onGoals}
      />

      {/* The rule the whole load column runs on, said once. */}
      <p className="coach-footnote">
        {plan.deload
          ? "An easier week on purpose: same weights, fewer sets, nothing taken to failure."
          : "Hit the top of the rep range on every set and the load goes up (↑) the next time round."}
      </p>

      {plan.missing.length || unknown.length ? (
        <Notes
          missing={plan.missing.map((muscle) => muscleLabels[muscle].toLowerCase())}
          unknown={unknown}
        />
      ) : null}
    </>
  );
}

/** One lift of the next session: the name and the load, which is what you are looking for at the rack. */
function Lift({ exercise, onDrop }: { exercise: PlannedExercise; onDrop?: () => void }) {
  const tone = exercise.stalled ? "down" : exercise.stepUp ? "up" : "";
  return (
    <div className="tl-row" style={{ minHeight: 48, padding: "8px 0" }}>
      <span className="tl-row-copy">
        <b>{exercise.exercise}</b>
        <small>
          {`${exercise.sets} × ${exercise.repRange} · ${Math.round(exercise.restSeconds / 30) / 2} min rest`}
          {onDrop ? (
            <>
              {" · "}
              <button type="button" className="plan-drop" onClick={onDrop} aria-label={`Remove ${exercise.exercise}`}>Remove</button>
            </>
          ) : null}
        </small>
      </span>
      <span className={`tl-row-end ${tone}`.trim()}>
        {exercise.assistanceLb !== null ? (
          <>{exercise.assistanceLb}<small>lb assist</small></>
        ) : exercise.weightLb !== null ? (
          <>{exercise.weightLb}<small>lb</small></>
        ) : exercise.bodyweight ? (
          <small>bodyweight</small>
        ) : (
          <span aria-label="no load logged for this yet">—</span>
        )}
        {exercise.stepUp ? <Icon name={exercise.assistanceLb !== null ? "down" : "up"} /> : null}
        {exercise.stalled ? <Icon name="down" /> : null}
      </span>
    </div>
  );
}

type ProgressionAction = "increase" | "hold" | "reduce";

type ProgressionLine = {
  exercise: PlannedExercise;
  action: ProgressionAction;
};

/** One decision per Strong exercise, even when a split uses it twice. */
function progressionLines(plan: Plan): ProgressionLine[] {
  const byExercise = new Map<string, PlannedExercise>();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const seen = byExercise.get(exercise.exercise);
      // A back-off takes precedence over an increase, and an increase over a
      // hold, should one exercise appear in more than one session.
      if (!seen || exercise.stalled || (exercise.stepUp && !seen.stalled)) {
        byExercise.set(exercise.exercise, exercise);
      }
    }
  }
  return [...byExercise.values()].map((exercise) => ({
    exercise,
    action: exercise.stalled ? "reduce" : exercise.stepUp ? "increase" : "hold",
  }));
}

function progressionLoad(exercise: PlannedExercise): string {
  if (exercise.assistanceLb !== null) return `${exercise.assistanceLb} lb assistance`;
  if (exercise.weightLb !== null) return `${exercise.weightLb} lb`;
  if (exercise.bodyweight) return "Bodyweight";
  return "No load yet";
}

/**
 * The same load decisions already printed on the session cards, gathered into
 * one weekly check. This is an explanation of the plan, not another engine
 * that can disagree with it.
 */
function WeeklyProgression({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const lines = progressionLines(plan);
  const increases = lines.filter((line) => line.action === "increase").length;
  const reductions = lines.filter((line) => line.action === "reduce").length;
  const holds = lines.length - increases - reductions;

  return (
    <section className="panel wide-panel coach-recommendations">
      <Fold
        title={<h2>Weekly progression</h2>}
        summary={
          <span className="fold-line">
            {`${increases} increase · ${holds} hold · ${reductions} reduce`}
          </span>
        }
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
        <ul className="recommendation-list">
          {lines.map(({ exercise, action }) => (
            <li key={exercise.exercise}>
              <span>{exercise.exercise}</span>
              <b>{action.charAt(0).toUpperCase() + action.slice(1)}</b>
              <small>{progressionLoad(exercise)}</small>
            </li>
          ))}
        </ul>
      </Fold>
    </section>
  );
}

/**
 * After the three building weeks, say which existing Strong lifts have earned
 * another block and which ones deserve a look. Recommendations only: exercise
 * selection still changes in Strong and arrives through the next import.
 */
function ProgramReview({ plan }: { plan: Plan }) {
  const [open, setOpen] = useState(false);
  const lines = progressionLines(plan);
  const review = lines.filter((line) => line.action === "reduce");
  const keep = lines.filter((line) => line.action !== "reduce");

  return (
    <section className="panel wide-panel coach-recommendations program-review">
      <Fold
        title={<h2>Program review</h2>}
        summary={
          <span className={review.length ? "fold-line warn" : "fold-line"}>
            {review.length
              ? `${review.length} ${review.length === 1 ? "lift needs" : "lifts need"} a look after this block.`
              : "Keep the same exercise roster next block."}
          </span>
        }
        open={open}
        onToggle={() => setOpen((current) => !current)}
      >
        <>
          <p className="review-lead">Nothing changes automatically. Make any swap in Strong, then import it.</p>
          <ul className="recommendation-list">
            {review.map(({ exercise }) => (
              <li key={exercise.exercise}>
                <span>{exercise.exercise}</span>
                <b>Review</b>
                <small>Stalled across recent sessions</small>
              </li>
            ))}
            {keep.length ? (
              <li>
                <span>{`${keep.length} ${keep.length === 1 ? "lift" : "lifts"}`}</span>
                <b>Keep</b>
                <small>Still holding or progressing</small>
              </li>
            ) : null}
          </ul>
        </>
      </Fold>
    </section>
  );
}

/** A list of muscle names reads as a sentence, so it starts like one. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Halves are real here — 12.5, not 12.5000 and not 13. */
function sets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Whether every muscle gets enough work this week.
 *
 * One number per muscle against one target. Earlier versions split direct and
 * indirect sets into two columns, then two views, and both were wrong for the
 * same reason: they are not two goals. Rowing trains the biceps. A target that
 * counted only curls would have you curling on top of a back day already spent,
 * and a second target for indirect work is a goal nobody set. So a set counts
 * once where the muscle is the point of the lift and half where it is not, and
 * the total is what the target is met or missed by.
 *
 * The number is a projection, not a score: what is logged since Monday plus
 * what the sessions still to come will add. Midweek that is the only version of
 * the question worth answering — being behind on Wednesday means nothing if
 * Thursday covers it.
 */
function Balance({
  outlook,
  plan,
  state,
  today,
  onGoals,
}: {
  outlook: MuscleOutlook[];
  plan: Plan;
  state: HealthState;
  today: string;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
}) {
  const [open, setOpen] = useState(false);
  const [row, setRow] = useState<Muscle | null>(null);

  const short = outlook.filter((entry) => entry.status === "under");
  const allThresholdsPass = outlook.every(
    (entry) => entry.projected >= entry.target.min && entry.direct >= minimumDirect(entry.muscle),
  );
  const ceiling = Math.max(...outlook.map((entry) => Math.max(entry.target.max, entry.projected)), 1);

  // Only the open row is itemised. Working out every muscle's week to draw one
  // of them is eleven times the work for the same screen.
  const detail = useMemo(
    () => (row ? muscleDetail(plan, state, row, today) : null),
    [row, plan, state, today],
  );

  /**
   * Records a change to one lift in one session, folding it into any change
   * already recorded for it — so a plus and a minus cancel to nothing rather
   * than accumulating into a pile of entries that happen to sum to zero.
   */
  const change = (choice: FixChoice, sets: number) => {
    const monday = weekStart(today);
    const same = (entry: AddedSet) =>
      entry.weekStart === monday && entry.session === choice.session && entry.exercise === choice.exercise;
    // Folded into the goals on record rather than the copy this render closed
    // over, so holding the plus does not throw away every press but the last.
    onGoals((current) => {
      const already = current.addedSets.find(same)?.sets ?? 0;
      const rest = current.addedSets.filter((entry) => !same(entry));
      const total = already + sets;
      return {
        ...current,
        addedSets: total === 0
          ? rest
          : [...rest, { weekStart: monday, session: choice.session, exercise: choice.exercise, sets: total }],
      };
    });
  };
  const adjust = (muscle: Muscle, direction: 1 | -1) => {
    const choice = adjustChoice(plan, state, muscle, direction, today);
    if (choice) change(choice, direction);
  };

  return (
    <section className="panel wide-panel">
      {/* One sentence, and everything behind it. Whether the week is covered is
          the answer; which lifts and how many sets is the follow-up, and a
          follow-up printed next to its question is just more to read.

          A shortfall used to get a second control here, under the verdict, for
          adding a lift to close it. Every row already opens onto a minus and a
          plus that do the same job for any muscle, short or not, so the one up
          here was a second way to do one thing — and the sentence names which
          rows to open. */}
      <Fold
        title={<h2>Enough for every muscle</h2>}
        summary={
          <span className={short.length ? "fold-line warn" : "fold-line"}>
            {short.length
              ? sentence(
                  `${listWords(short.map((entry) => entry.label.toLowerCase()))} ${short.length === 1 ? "falls" : "fall"} short this week.`,
                )
              : allThresholdsPass
                ? `All ${outlook.length} pass the weekly guide and direct minimum.`
                : `All ${outlook.length} get enough this week.`}
          </span>
        }
        open={open}
        onToggle={() => {
          setOpen((current) => !current);
          setRow(null);
        }}
      >
        <>
          <ul className="balance-list">
            {outlook.map((entry) => {
              const width = (value: number) => `${Math.min(100, (value / ceiling) * 100)}%`;
              const status = entry.status === "under" ? "low" : entry.status === "over" ? "high" : "ok";
              const directShort = entry.direct < minimumDirect(entry.muscle);
              const totalShort = entry.projected < entry.target.min;
              const statusLabel = directShort && totalShort
                ? "needs both"
                : directShort
                  ? "needs direct"
                  : totalShort
                    ? "below guide"
                    : entry.projected > entry.target.max
                      ? "above guide"
                      : "on target";
              const isOpen = row === entry.muscle;
              const canRemove = isOpen && Boolean(adjustChoice(plan, state, entry.muscle, -1, today));
              const canAdd = isOpen && Boolean(adjustChoice(plan, state, entry.muscle, 1, today));
              return (
                <li key={entry.muscle} className={isOpen ? "balance-item is-open" : "balance-item"}>
                  {/* The row opens. Which lifts are giving a muscle its week is
                      the question the number provokes, and it is one row's
                      worth of answer, not eleven rows of columns. */}
                  <button
                    type="button"
                    className="balance-row"
                    aria-expanded={isOpen}
                    onClick={() => setRow((current) => (current === entry.muscle ? null : entry.muscle))}
                  >
                    <span className="balance-name">{entry.label}</span>
                    <span className="balance-track">
                      <span
                        className="balance-band"
                        style={{
                          left: width(entry.target.min),
                          width: `${((entry.target.max - entry.target.min) / ceiling) * 100}%`,
                        }}
                      />
                      {/* Pale to where the week ends up, solid over the part
                          already logged: a progress bar, read like one. */}
                      <span className={`bar-coming is-${status}`} style={{ width: width(entry.projected) }} />
                      <span className={`bar-direct is-${status}`} style={{ width: width(entry.done) }} />
                    </span>
                    <span className="balance-sets">
                      <b>{sets(entry.projected)}</b>
                      <small className={`balance-status is-${status}`}>{statusLabel}</small>
                    </span>
                  </button>
                  {isOpen && detail ? (
                    <Detail
                      detail={detail}
                      row={entry}
                      canRemove={canRemove}
                      canAdd={canAdd}
                      onAdjust={(direction) => adjust(entry.muscle, direction)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="balance-legend">
            <span className="key key-direct" /> logged
            <span className="key key-coming" /> still to come
            <span className="key key-band" /> enough
          </p>
        </>
      </Fold>
    </section>
  );
}

/**
 * One muscle's week, itemised: every lift that trains it, what it is worth, and
 * — where the week comes up short — what to add and which session to add it to.
 */
function Detail({
  detail,
  row,
  canRemove,
  canAdd,
  onAdjust,
}: {
  detail: MuscleDetail;
  row: MuscleOutlook;
  canRemove: boolean;
  canAdd: boolean;
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
          {`Direct minimum ${directFloor} ${directPass ? "✓" : "✕"}`}
        </span>
        <span
          className={
            underGuide ? "threshold-check is-fail" : overGuide ? "threshold-check is-over" : "threshold-check is-pass"
          }
        >
          {`Weekly guide ${row.target.min}–${row.target.max} ${underGuide ? "✕" : overGuide ? "over" : "✓"}`}
        </span>
      </div>
      {/* A week is a suggestion. Wanting a bit more chest than the middle of a
          range is not a mistake to be protected from, and the number above goes
          on saying what the change did — which is the only thing that makes
          moving it safe. */}
      <div className="row-tune">
        <button
          type="button"
          aria-label={`One set less of ${row.label.toLowerCase()}`}
          disabled={!canRemove}
          onClick={() => onAdjust(-1)}
        >
          −
        </button>
        <b>{sets(row.projected)}</b>
        <button
          type="button"
          aria-label={`One set more of ${row.label.toLowerCase()}`}
          disabled={!canAdd}
          onClick={() => onAdjust(1)}
        >
          +
        </button>
        {row.status === "under" ? <span className="row-gap">{`${sets(row.shortBy)} short of ${row.target.min}`}</span> : null}
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
          {canAdd ? "Nothing in the week trains it." : "No recent Strong exercise trains it."}
        </p>
      )}
    </div>
  );
}

/**
 * One session, folded. Open it and it is the card it always was.
 */
function SessionCard({
  session,
  isNext,
  open,
  onToggle,
  onDrop,
}: {
  session: PlannedSession;
  isNext: boolean;
  open: boolean;
  onToggle: () => void;
  onDrop: (exercise: string) => void;
}) {
  return (
    <article className={open ? "plan-card is-open" : "plan-card"}>
      <Fold
        title={<b>{session.name}</b>}
        summary={
          <small>
            {isNext ? <em className="plan-next">next</em> : null}
            {`${session.sets} sets · ${session.exercises.length} lifts`}
          </small>
        }
        open={open}
        onToggle={onToggle}
      >
        <ul>
          {session.exercises.map((exercise) => (
            <li
              key={`${session.name}:${exercise.exercise}`}
              className="plan-item"
            >
              {/* The lift and the weight, which is what you are looking for
                  standing at the rack. Everything else is the line underneath,
                  where it does not compete for the glance. */}
              <span className="plan-name">{exercise.exercise}</span>
              {/* Up where you cleared the range last time. Down where the lift
                  has not moved in three sessions and the load comes off to be
                  built back. */}
              <span
                className={exercise.stepUp ? "plan-load up" : exercise.stalled ? "plan-load down" : "plan-load"}
              >
                {exercise.assistanceLb !== null ? (
                  <>
                    {exercise.assistanceLb}
                    <small>lb assist</small>
                  </>
                ) : exercise.weightLb !== null ? (
                  <>
                    {exercise.weightLb}
                    <small>lb</small>
                  </>
                ) : exercise.bodyweight ? (
                  <small>Bodyweight</small>
                ) : (
                  // Logged, but nothing usable to read a load off. Better a
                  // dash than a blank that looks like a bug.
                  <span aria-label="no load logged for this yet">—</span>
                )}
                {exercise.stepUp ? <i aria-label={exercise.assistanceLb !== null ? "less assistance than last time" : "up from last time"}>{exercise.assistanceLb !== null ? "↓" : "↑"}</i> : null}
                {exercise.stalled ? <i aria-label="backed off after a stall">↓</i> : null}
              </span>
              <span className="plan-meta">
                {`${exercise.sets} × ${exercise.repRange}`}
                <i aria-hidden="true">·</i>
                {`${Math.round(exercise.restSeconds / 30) / 2} min rest`}
                {/* You put it here, so you can take it away again. An addition
                    with no way back is a trap, not a feature. */}
                {exercise.byHand ? (
                  <button
                    type="button"
                    className="plan-drop"
                    aria-label={`Remove ${exercise.exercise} from ${session.name}`}
                    onClick={() => onDrop(exercise.exercise)}
                  >
                    Remove
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Fold>
    </article>
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
              {`Not programmed: no recent Strong exercise trains ${listWords(missing)}.`}
            </p>
          ) : null}
          {unknown.length ? (
            <p className="coach-footnote">
              {`Not counted, no rule matches the name: ${unknown.slice(0, 6).join(", ")}${
                unknown.length > 6 ? ` +${unknown.length - 6}` : ""
              }.`}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
