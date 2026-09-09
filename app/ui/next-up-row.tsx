"use client";

import { useMemo, useState } from "react";
import type { GoalSettings, HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { Plan, PlannedSession } from "../training/coach";
import {
  DAY_CHOICES, DEFAULT_DAYS, daysLeftInWeek, matchedSessionsThisWeek, nextSession,
  remainingSessions, sessionMinutes, sessionToText, trainingAnchorSets, trainingHabit, weekStart,
} from "../training/coach";
import { buildProgress } from "../training/progress";
import { Icon } from "./icons";
import { copyText, downloadBlob } from "./format";
import { ConfirmButton } from "./primitives";
import { PrescriptionColumns, WorkoutPrescription as Lift } from "./workout-prescription";
import { labelSessions, workoutRequired, workoutScope } from "./workout-labels";

export type NextUpFacts = {
  hero: PlannedSession | null;
  headline: string;
  subline: string;
  daysLeft: number;
  done: number;
  pips: Array<{ name: string; state: "done" | "now" | "todo"; optional: boolean }>;
  copyText: string | null;
  deload: boolean;
};

/**
 * Everything the shut row states, computed once so the row and its body agree.
 *
 * The pips are the piece that does the teaching: one per session this week,
 * filled for the ones the engine has already matched to a real imported
 * workout. He imports an export, a pip fills, and the app has demonstrated that
 * it read his record — which three rounds of paragraphs failed to convey.
 */
export function nextUpFacts(plan: Plan, state: HealthState, today: string): NextUpFacts {
  const names = labelSessions(plan.sessions);
  const label = (session: PlannedSession) => names.get(session.name) ?? session.name;
  const matched = matchedSessionsThisWeek(plan, state, today);
  const next = nextSession(plan, state, today);
  const hero = next.session;
  const pips = plan.sessions.map(session => ({
    name: label(session),
    state: matched.has(session.name) ? "done" as const : session.name === hero?.name ? "now" as const : "todo" as const,
    optional: !workoutRequired(session),
  }));
  const daysLeft = daysLeftInWeek(today);

  if (!hero) {
    return {
      hero: null, headline: "Week's workouts done", daysLeft, done: next.done, pips,
      subline: `${next.done} of ${next.of} · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`,
      copyText: null, deload: plan.deload,
    };
  }
  const scope = workoutScope(hero);
  const lifts = hero.exercises.length;
  const position = plan.sessions.findIndex(session => session.name === hero.name) + 1;
  return {
    hero,
    headline: label(hero),
    subline: [
      position ? `Workout ${position} of ${plan.sessions.length}` : null,
      scope,
      `${sessionMinutes(hero)} min`,
      `${lifts} ${lifts === 1 ? "lift" : "lifts"}`,
    ].filter(Boolean).join(" · "),
    daysLeft,
    done: next.done,
    pips,
    copyText: sessionToText(plan, { ...hero, name: label(hero) }, dateLabel(today, { weekday: "short", month: "short", day: "numeric" })),
    deload: plan.deload,
  };
}

export function NextUpBody({
  plan, state, today, facts, selected, onSelect, onGoals, onMuscle,
}: {
  plan: Plan;
  state: HealthState;
  today: string;
  facts: NextUpFacts;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onMuscle: (muscle: string) => void;
}) {
  const names = labelSessions(plan.sessions);
  const label = (session: PlannedSession) => names.get(session.name) ?? session.name;
  const remaining = useMemo(() => remainingSessions(plan, state, today), [plan, state, today]);
  const shown = remaining.find(session => session.name === selected) ?? facts.hero;
  const habit = useMemo(() => trainingHabit(state.workoutSets, today), [state.workoutSets, today]);
  const trends = useMemo(() => {
    const progress = buildProgress(state, today, 12);
    return new Map(progress.lifts.map(lift => [lift.exercise, lift]));
  }, [state, today]);
  const days = state.goals.trainingDays[0] || 0;

  const drop = (session: PlannedSession, exercise: string) => onGoals(current => ({
    ...current,
    addedSets: current.addedSets.filter(entry => !(entry.weekStart === weekStart(today) && entry.session === session.name && entry.exercise === exercise)),
  }));

  return <>
    <p className="planned-minutes">
      {shown ? `Planned ${sessionMinutes(shown)} min` : "Nothing scheduled"}
      {shown && habit.minutesPerSession ? ` · you usually take ${habit.minutesPerSession}` : ""}
    </p>

    <label className="plan-field inline-field">
      <span>Workouts a week</span>
      <select
        aria-label="Workouts a week"
        value={days || DEFAULT_DAYS}
        onChange={event => {
          const value = Number(event.target.value);
          onGoals(current => ({ ...current, trainingDays: [value, value, value, value] }));
        }}
      >
        {DAY_CHOICES.map(choice => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    </label>
    {/* Two is the default because two is enough — each session is built bigger
        to carry the week. Raising it spreads the same work over more visits. */}
    <p className="field-note">
      {(days || DEFAULT_DAYS) === DEFAULT_DAYS
        ? `Two sessions cover every muscle group. You train ${habit.recentLabel}× a week.`
        : `More sessions spread the same weekly sets over more visits. Two is enough on its own.`}
    </p>

    {remaining.length > 1 ? <div className="session-chips" role="group" aria-label="This week's workouts">
      {remaining.map(session => <button
        key={session.name}
        type="button"
        aria-pressed={session.name === shown?.name}
        className={workoutRequired(session) ? "" : "is-optional"}
        onClick={() => onSelect(session.name === selected ? null : session.name)}
      >
        {label(session)}
        {workoutRequired(session) ? null : <small>extra</small>}
      </button>)}
    </div> : null}

    {shown ? <>
      <PrescriptionColumns />
      <div className="session-exercises" aria-label={`${label(shown)}, exercises`}>
        {shown.exercises.map(exercise => <Lift
          key={`${shown.name}:${exercise.exercise}`}
          exercise={exercise}
          targetLabel={shown.name === facts.hero?.name ? "Next workout" : "This workout"}
          trend={trends.get(exercise.exercise) ?? null}
          onMuscle={onMuscle}
          onDrop={exercise.byHand ? () => drop(shown, exercise.exercise) : undefined}
        />)}
      </div>
    </> : null}

    <details className="plan-settings counted-fold"><summary><Icon name="settings" /> Settings</summary>
      <label className="plan-field"><span>Workout length</span><select aria-label="Time limit per workout" value={state.goals.trainingSessionMinutes} onChange={event => onGoals(current => ({ ...current, trainingSessionMinutes: Number(event.target.value) }))}>{[45, 60, 75, 90, 120].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
      <div className="tl-section-head" style={{ marginTop: 14 }}>
        <span className="tl-caps">Start over</span>
        <ConfirmButton label="Start over" confirmLabel="Reset and rebuild from my record" className="text-button" icon="undo" onConfirm={() => onGoals(current => ({ ...current, trainingBlockStart: weekStart(today), trainingAnchorSets: trainingAnchorSets(state, today), trainingDays: [], addedSets: [] }))} />
      </div>
    </details>
  </>;
}

/** The pips and the copy button, both of which sit on the shut row. */
export function WeekPips({ facts }: { facts: NextUpFacts }) {
  const todo = facts.pips.filter(pip => pip.state !== "done").length;
  return <div className="week-pips">
    {facts.pips.map(pip => <i
      key={pip.name}
      className={`${pip.state === "done" ? "is-done" : pip.state === "now" ? "is-now" : ""}${pip.optional ? " is-optional" : ""}`}
      aria-hidden="true"
    />)}
    <span>{facts.done} done · {todo} to go</span>
  </div>;
}

/** The two ways to take the workout with you: read it big, or copy the text. */
export function TakeItWithYou({ facts, onGym, onNotice }: {
  facts: NextUpFacts;
  onGym: () => void;
  onNotice: (message: string) => void;
}) {
  if (!facts.hero) return null;
  return <div className="take-with-you">
    <button type="button" className="button primary" onClick={onGym}>
      <Icon name="fitness" />
      Open in the gym
    </button>
    <CopyForStrong facts={facts} onNotice={onNotice} />
  </div>;
}

export function CopyForStrong({ facts, onNotice }: {
  facts: NextUpFacts;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!facts.copyText) return null;
  const run = async () => {
    setBusy(true);
    if (await copyText(facts.copyText as string)) onNotice("Workout text copied.");
    else { downloadBlob("baseline-workout.txt", new Blob([facts.copyText as string], { type: "text/plain" })); onNotice("Workout text downloaded."); }
    setBusy(false);
  };
  return <button type="button" className="button secondary copy-strong" disabled={busy} onClick={() => void run()}>
    <Icon name="copy" />
    {/* Strong has no text import, so this cannot load a routine into it. It
        copies the workout as plain text — for Notes, a message, or reading. */}
    Copy as text
  </button>;
}
