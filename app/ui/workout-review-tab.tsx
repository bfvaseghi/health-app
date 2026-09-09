"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import { buildWorkoutSessions, dateLabel } from "../health-model";
import { reviewWorkout } from "../training/coach";
import { muscleLabels } from "../training/muscles";
import { Icon } from "./icons";
import { LiftingTab } from "./lifting-tab";
import type { Modal } from "./types";

export function timerLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function WorkoutReviewTab({ state, today, open, demo, onDeleteSession }: {
  state: HealthState; today: string; open: (modal: Modal) => void; demo: boolean;
  onDeleteSession: (startedAt: string) => void;
}) {
  const [selected, setSelected] = useState<string | undefined>();
  const sessions = useMemo(() => buildWorkoutSessions(state.workoutSets.filter(set => set.date <= today)), [state, today]);
  const review = useMemo(() => reviewWorkout(state, sessions.some(session => session.startedAt === selected) ? selected : undefined, today), [state, sessions, selected, today]);
  return <>
    <h2 className="tl-hero" style={{ marginTop: 20 }}>Workout review.</h2>
    <div className="tl-actions"><button type="button" className="button primary" onClick={() => open({ kind: "import", source: "strong" })}><Icon name="upload" />Import Strong CSV</button></div>
    {review ? <>
      <label className="review-session"><span className="tl-caps">Workout</span>
        <select value={review.startedAt} onChange={event => setSelected(event.target.value)} aria-label="Workout to review">
          {sessions.map((session, index) => <option key={session.startedAt} value={session.startedAt}>{index === 0 ? "Latest · " : ""}{dateLabel(session.date)} · {session.name} · {session.startedAt.slice(11, 16)}</option>)}
        </select>
      </label>
      <p className="tl-line">{review.exercises.length} {review.exercises.length === 1 ? "lift" : "lifts"} · {review.sets} {review.sets === 1 ? "set" : "sets"}</p>
      <ul className="review-lifts">
        {review.exercises.map(lift => {
          const next = lift.nextLoad === null ? lift.repRange ? `${lift.repRange} reps` : "No target" : `${lift.nextLoad} lb${lift.assistance ? " assistance" : ""}`;
          const sameLoad = lift.loads.length > 0 && lift.loads.every(load => load === lift.loads[0]);
          const recorded = sameLoad ? `${lift.loads[0] === null ? "" : `${lift.loads[0]} lb${lift.assistance ? " assistance" : ""} × `}${lift.reps.map(reps => reps ?? "?").join(" / ")} reps`
            : lift.reps.map((reps, index) => `${lift.loads[index] ?? "?"} lb × ${reps ?? "?"}`).join(" · ");
          const action = lift.action === "increase" ? lift.assistance ? "Less assistance" : "Increase to" : lift.action === "reduce" ? lift.assistance ? "More assistance" : "Reduce to" : lift.action === "keep" ? "Keep" : "Unavailable";
          const timers = [...new Set(lift.rest?.timers ?? [])].sort((a, b) => a - b);
          const suggested = lift.rest ? Math.round((lift.rest.min + lift.rest.max) / 2) : null;
          return <li key={lift.exercise} className="review-lift">
            <h3>{lift.exercise}</h3>
            <strong className={`review-decision ${lift.action}`}>{action}{lift.action === "unavailable" ? "" : ` ${next}`}</strong>
            <span className="review-reps">Logged: {recorded}</span>
            {lift.nextLoad !== null || !lift.reason.startsWith("Target") ? <span className="review-reason">{lift.reason}{lift.nextLoad !== null && lift.repRange && !lift.reason.includes(lift.repRange) ? ` · ${lift.repRange} reps/set` : ""}</span> : null}
            {suggested !== null ? <div className="review-rest"><b>{lift.rest!.timers.length && !lift.rest!.below && !lift.rest!.above ? "Keep rest timer" : "Suggested rest timer"} · {lift.rest!.timers.length && !lift.rest!.below && !lift.rest!.above ? timers.map(timerLabel).join(" / ") : timerLabel(suggested)}</b><small>{timers.length ? `Imported ${timers.map(timerLabel).join(" / ")}` : "Timer absent from export"} · target {timerLabel(lift.rest!.min)}–{timerLabel(lift.rest!.max)}</small></div> : null}
          </li>;
        })}
      </ul>
      <details className="tl-section"><summary>Muscles trained · {review.muscles.length}</summary><p className="tl-line">{review.muscles.map(muscle => muscleLabels[muscle]).join(" · ")}</p></details>
      <details className="tl-section imported-history"><summary>Workout history & records</summary><LiftingTab state={state} today={today} open={open} demo={demo} onDeleteSession={onDeleteSession} compact /></details>
    </> : <p className="tl-line">No imported workouts.</p>}
  </>;
}
