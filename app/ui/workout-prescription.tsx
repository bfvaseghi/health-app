"use client";

import { useState } from "react";
import type { PlannedExercise } from "../training/coach";
import type { LiftTrend } from "../training/progress";
import { dateLabel } from "../health-model";
import { movementPattern, patternIcon, patternLabels } from "../training/movement";
import { classifyExercise, muscleLabels } from "../training/muscles";
import { Icon } from "./icons";

export function timerLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The column head, said once above the list rather than on all eight rows.
 *
 * "Rest timer", not "Rest": the number is Strong's configured timer or this
 * app's suggestion where there was none. It is not a measurement of how long
 * you actually rested, and a column called "Rest" invites reading it as one.
 */
export function PrescriptionColumns() {
  return (
    <div className="lift-columns">
      <span>Weight</span>
      <span>Sets × reps</span>
      <span>Rest timer</span>
      <span>Change</span>
    </div>
  );
}

/** What changed since last time, said as the change rather than as a word for it. */
export function changeChip(exercise: PlannedExercise): { text: string; note?: string; kind: string } {
  const decision = exercise.adjustment;
  const assisted = exercise.assistanceLb !== null;
  const load = assisted ? exercise.assistanceLb : exercise.weightLb;
  const step = decision.previousLoad === null || load === null ? null : Math.abs(load - decision.previousLoad);
  const amount = step ? `${step} lb` : "";
  if (decision.action === "unavailable") return { text: "Check Strong", kind: "unavailable" };
  if (exercise.bodyweight) return { text: "Bodyweight", kind: "keep" };
  if (assisted) {
    if (decision.action === "increase") return { text: `${amount} less help`.trim(), kind: "increase" };
    if (decision.action === "reduce") return { text: `${amount} more help`.trim(), kind: "reduce" };
    return { text: "Same", kind: "keep" };
  }
  if (decision.action === "increase") return { text: `Up ${amount}`.trim(), kind: "increase" };
  if (decision.action === "reduce") {
    // A deliberate deload after a stall and a real regression rendered
    // identically before, which made a planned reset look like losing ground.
    return exercise.stalled
      ? { text: `Reset −${amount}`.trim(), note: "same load 3 visits", kind: "reset" }
      : { text: `Down ${amount}`.trim(), kind: "reduce" };
  }
  return { text: "Same", kind: "keep" };
}

/**
 * One lift, one line.
 *
 * Eight lifts at five lines each was most of the height of the workout screen,
 * and none of those lines is read in the gym — the workout leaves this app as
 * copied text. So the row states the four numbers under the column head above
 * it, and the evidence behind them waits for a tap.
 */
export function WorkoutPrescription({
  exercise,
  onDrop,
  showDetails = false,
  targetLabel = "Next workout",
  trend,
  onMuscle,
}: {
  exercise: PlannedExercise;
  onDrop?: () => void;
  showDetails?: boolean;
  targetLabel?: string;
  /** This lift's trajectory, when there is enough history to draw one. */
  trend?: LiftTrend | null;
  /** Jump to this lift's muscle in the coverage chart. */
  onMuscle?: (muscle: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsVisible = showDetails || expanded;
  const decision = exercise.adjustment;
  const assisted = exercise.assistanceLb !== null;
  const load = assisted ? exercise.assistanceLb : exercise.weightLb;
  const instruction = decision.action === "unavailable" ? "Load unavailable"
    : exercise.bodyweight ? "Bodyweight"
    : assisted ? `${load} lb assist`
    : `${load} lb`;
  const change = changeChip(exercise);
  const lastLoad = decision.previousLoad === null || exercise.bodyweight ? "" : `${decision.previousLoad} lb${assisted ? " assistance" : ""}`;
  const equipment = /\s*\(([^)]+)\)$/.exec(exercise.exercise)?.[1];
  const name = equipment ? exercise.exercise.replace(/\s*\([^)]+\)$/, "") : exercise.exercise;
  // What the movement is, which tells you more than its position in the list —
  // except where the pattern and the name are the same word, which would just
  // print "Squat · Squat".
  const patternName = patternLabels[movementPattern(exercise.exercise)];
  const pattern = new RegExp(`\\b${patternName}\\b`, "i").test(name) ? "" : patternName;
  const fills = classifyExercise(exercise.exercise).direct;
  const falling = trend?.direction === "down";

  return <article className={`lift-row ${decision.action}${falling ? " is-falling" : ""}`}>
    <button
      type="button"
      aria-expanded={detailsVisible}
      aria-label={`${name}: ${instruction}, ${exercise.sets} ${exercise.sets === 1 ? "set" : "sets"} of ${exercise.repRange} reps, rest timer ${timerLabel(exercise.restSeconds)}, ${change.text}. ${detailsVisible ? "Hide" : "Show"} details`}
      onClick={() => setExpanded(value => !value)}
    >
      <span className="lift-row-name">
        <span className="movement-icon"><Icon name={patternIcon(exercise.exercise)} /></span>
        <b>{name}</b>
        {equipment ? <em>{equipment}</em> : null}
        {pattern ? <em className="lift-pattern">{pattern}</em> : null}
        {falling ? <em className="lift-falling" title="Trending down">↘</em> : null}
        <Icon name="chevron" />
      </span>
      <span className="lift-row-values">
        <span>{instruction}</span>
        <span>{exercise.sets} × {exercise.repRange}</span>
        <span>{timerLabel(exercise.restSeconds)}</span>
        <span className={`lift-chip ${change.kind}`}>{change.text}{change.note ? <small>{change.note}</small> : null}</span>
      </span>
    </button>
    {detailsVisible ? <div className="prescription-detail">
      <div className="lift-evidence">
        <span>
          <small>Last logged{decision.lastDate ? ` · ${dateLabel(decision.lastDate, { month: "short", day: "numeric" })}` : ""}</small>
          <b>{exercise.bodyweight ? "Bodyweight" : lastLoad || "Load unavailable"}</b>
          <span>{decision.previousReps.length ? `${decision.previousReps.map(reps => reps ?? "?").join(" / ")} reps` : "Reps unavailable"}</span>
        </span>
        <span>
          <small>{targetLabel}</small>
          <b>{instruction}</b>
          <span>{change.text}</span>
        </span>
      </div>
      <p className="prescription-reason"><b>Weight:</b> {decision.reason.replace(/\.$/, "")}.</p>
      <p className="prescription-reason"><b>Rest timer:</b> {decision.previousRestSeconds !== null
        ? <>Strong timer {timerLabel(decision.previousRestSeconds)} → next {timerLabel(exercise.restSeconds)}.</>
        : <>No timer in the export. Next: {timerLabel(exercise.restSeconds)}.</>}</p>
      {exercise.restAdjustedForTime ? <p className="prescription-reason">Rest shortened to fit the sets within your time limit. Take longer if your reps or form slip.</p> : null}
      {trend ? <p className="prescription-reason lift-trend-line">
        <b>Trend:</b>{" "}
        {trend.bodyweight ? `${trend.last} reps` : trend.assisted ? `${trend.last} lb assistance` : `est. max ${trend.last} lb`}
        {` · ${trend.percent > 0 ? "+" : ""}${trend.percent}% over ${trend.sessions} sessions`}
        {falling && trend.sessionsSincePeak > 0 ? ` · peaked ${trend.sessionsSincePeak} ${trend.sessionsSincePeak === 1 ? "session" : "sessions"} ago` : ""}
      </p> : null}
      {fills.length ? <p className="prescription-reason lift-fills">
        <b>Fills:</b>{" "}
        {fills.map((muscle, index) => <span key={muscle}>
          {index ? ", " : ""}
          {onMuscle
            ? <button type="button" className="text-button" onClick={() => onMuscle(muscle)}>{muscleLabels[muscle].toLowerCase()}</button>
            : muscleLabels[muscle].toLowerCase()}
        </span>)}
      </p> : null}
      {onDrop ? <button type="button" className="text-button" onClick={onDrop} aria-label={`Remove ${exercise.exercise}`}>Remove added exercise</button> : null}
    </div> : null}
  </article>;
}
