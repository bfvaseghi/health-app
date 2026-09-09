"use client";

import { useEffect } from "react";
import type { PlannedSession } from "../training/coach";
import { sessionMinutes } from "../training/coach";
import { Icon } from "./icons";
import { changeChip, timerLabel } from "./workout-prescription";

/**
 * The workout at arm's length, for reading while you type it into Strong.
 *
 * Strong has no text import — there is no way to load a routine into it from
 * here, and "Copy for Strong" implied there was. What actually helps is not a
 * better clipboard format but bigger numbers: one line a lift, in the order
 * you will enter them, at a size you can read with a phone on a bench and
 * Strong open in front of you.
 *
 * Nothing here is interactive except leaving. It is a card to look at.
 */
export function GymView({ session, label, onClose }: {
  session: PlannedSession;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gym-view" role="dialog" aria-modal="true" aria-label={`${label}, gym view`}>
      <header>
        <div>
          <span className="tl-caps">{label}</span>
          <b>{session.exercises.length} lifts · {sessionMinutes(session)} min</b>
        </div>
        <button type="button" className="icon-button" aria-label="Close gym view" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <ol>
        {session.exercises.map((exercise, index) => {
          const assisted = exercise.assistanceLb !== null;
          const load = assisted ? exercise.assistanceLb : exercise.weightLb;
          const weight = exercise.adjustment.action === "unavailable" ? "—"
            : exercise.bodyweight ? "Bodyweight"
            : assisted ? `${load} lb assist`
            : `${load} lb`;
          const change = changeChip(exercise);
          return (
            <li key={exercise.exercise}>
              <span className="gym-index">{index + 1}</span>
              <span className="gym-lift">
                <b>{exercise.exercise.replace(/\s*\([^)]+\)$/, "")}</b>
                <small>{/\s*\(([^)]+)\)$/.exec(exercise.exercise)?.[1] ?? ""}</small>
              </span>
              <span className="gym-numbers">
                <b>{weight}</b>
                <span>{exercise.sets} × {exercise.repRange}</span>
                <small>rest {timerLabel(exercise.restSeconds)}{change.kind === "keep" ? "" : ` · ${change.text}`}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="gym-foot">Log the sets in Strong as you go, then import the export back here.</p>
    </div>
  );
}
