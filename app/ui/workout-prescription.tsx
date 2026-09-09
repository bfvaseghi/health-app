"use client";

import { useState } from "react";
import type { PlannedExercise } from "../training/coach";
import { dateLabel } from "../health-model";
import { movementPattern, patternIcon, patternLabels } from "../training/movement";
import { Icon } from "./icons";

export function timerLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The column head, said once above the list rather than on all eight rows. */
export function PrescriptionColumns() {
  return (
    <div className="prescription-columns" aria-hidden="true">
      <span>Weight</span>
      <span>Sets × reps</span>
      <span>Rest</span>
    </div>
  );
}

export function WorkoutPrescription({ exercise, onDrop, showDetails = false, targetLabel = "Next workout" }: { exercise: PlannedExercise; onDrop?: () => void; showDetails?: boolean; targetLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const detailsVisible = showDetails || expanded;
  const decision = exercise.adjustment;
  const assisted = exercise.assistanceLb !== null;
  const load = assisted ? exercise.assistanceLb : exercise.weightLb;
  const instruction = decision.action === "unavailable" ? "Load unavailable"
    : exercise.bodyweight ? "Bodyweight"
    : assisted ? `${load} lb assistance`
    : `${load} lb`;
  const change = decision.action === "unavailable" ? "Check your Strong record"
    : exercise.bodyweight ? "Bodyweight"
    : assisted ? decision.action === "increase" ? "Less assistance" : decision.action === "reduce" ? "More assistance" : "Same assistance"
    : decision.action === "increase" ? "Increase" : decision.action === "reduce" ? "Reduce" : "Same weight";
  const lastLoad = decision.previousLoad === null || exercise.bodyweight ? "" : `${decision.previousLoad} lb${assisted ? " assistance" : ""}`;
  const equipment = /\s*\(([^)]+)\)$/.exec(exercise.exercise)?.[1];
  const name = equipment ? exercise.exercise.replace(/\s*\([^)]+\)$/, "") : exercise.exercise;
  // What the movement is, which tells you more than its position in the list —
  // except on a squat, where the pattern and the name are the same word and
  // printing both just says "Squat · Squat".
  const patternName = patternLabels[movementPattern(exercise.exercise)];
  const pattern = new RegExp(`\\b${patternName}\\b`, "i").test(name) ? "" : patternName;
  return <article className={`workout-prescription compact-lift ${decision.action}`}>
    <button type="button" className="lift-summary" aria-expanded={detailsVisible} aria-label={`${name}: ${instruction}, ${exercise.sets} ${exercise.sets === 1 ? "set" : "sets"} of ${exercise.repRange} reps, rest ${timerLabel(exercise.restSeconds)}. ${detailsVisible ? "Hide" : "Show"} details`} onClick={() => setExpanded(value => !value)}>
      {/* The pattern, not a barbell on every row: a session reads as press,
          pull, hinge before it reads as eight names parsed one at a time. */}
      <span className="compact-lift-title"><span className="movement-icon" title={patternLabels[movementPattern(exercise.exercise)]}><Icon name={patternIcon(exercise.exercise)} /></span><span><span className="lift-name">{name}</span><small>{[pattern, equipment].filter(Boolean).join(" · ")}</small></span><Icon name="chevron" /></span>
      {/* The three numbers, unlabelled: the column head above the list says
          what they are once, instead of every row saying it again. */}
      <span className="compact-targets">
        <span className="compact-load"><strong>{instruction}</strong><span className={`lift-change ${decision.action}`}><Icon name={decision.action === "increase" ? "up" : decision.action === "reduce" ? "down" : "arrow"} />{change}</span></span>
        <span><strong>{exercise.sets} × {exercise.repRange}</strong></span>
        <span><strong>{timerLabel(exercise.restSeconds)}</strong></span>
      </span>
    </button>
    {detailsVisible ? <div className="prescription-detail">
      <div className="lift-evidence"><span><small>Last logged{decision.lastDate ? ` · ${dateLabel(decision.lastDate, { month: "short", day: "numeric" })}` : ""}</small><b>{exercise.bodyweight ? "Bodyweight" : lastLoad || "Load unavailable"}</b><span>{decision.previousReps.length ? `${decision.previousReps.map(reps => reps ?? "?").join(" / ")} reps` : "Reps unavailable"}</span></span><span><small>{targetLabel}</small><b>{instruction}</b><span>{change}</span></span></div>
      <p className="prescription-reason"><b>Weight:</b> {decision.reason.replace(/\.$/, "")}.</p>
      <p className="prescription-reason"><b>Rest:</b> {decision.previousRestSeconds !== null ? <>Strong timer {timerLabel(decision.previousRestSeconds)} → next {timerLabel(exercise.restSeconds)}.</> : <>No timer in the export. Next: {timerLabel(exercise.restSeconds)}.</>}</p>
      {exercise.restAdjustedForTime ? <p className="prescription-reason">Rest shortened to fit the sets within your time limit. Take longer if your reps or form slip.</p> : null}
      {onDrop ? <button type="button" className="text-button" onClick={onDrop} aria-label={`Remove ${exercise.exercise}`}>Remove added exercise</button> : null}
    </div> : null}
  </article>;
}
