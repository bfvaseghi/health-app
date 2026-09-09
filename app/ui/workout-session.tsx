"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { HealthState, WorkoutSet } from "../health-model";
import type { PlannedSession } from "../training/coach";
import { finishWorkout, restoreWorkout, startWorkout, validDraftSet, type WorkoutDraft } from "../training/workout";
import { ConfirmButton, ModalFrame } from "./primitives";
import { Icon } from "./icons";

const DRAFT_KEY = "baseline-workout-draft";
export function clearWorkoutDraft() { window.localStorage.removeItem(DRAFT_KEY); }
const WorkoutContext = createContext<{ draft: WorkoutDraft | null; open: (session: PlannedSession | null) => void }>({ draft: null, open: () => {} });

export function WorkoutProvider({ state, demo, onSave, children }: {
  state: HealthState;
  demo: boolean;
  onSave: (sets: WorkoutSet[]) => void;
  children: ReactNode;
}) {
  const [draft, setDraft] = useState<WorkoutDraft | null>(() => {
    if (demo || typeof window === "undefined") return null;
    try {
      return restoreWorkout(JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? "null"), new Set(state.workoutSets.map((set) => set.exercise)));
    } catch { return null; }
  });
  const [visible, setVisible] = useState(false);
  const [stored, setStored] = useState(true);

  function update(next: WorkoutDraft | null) {
    setDraft(next);
    if (demo) return;
    try {
      if (next) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(DRAFT_KEY);
      setStored(true);
    } catch { setStored(false); }
  }

  return (
    <WorkoutContext.Provider value={{ draft, open: (session) => {
      if (!draft && session) update(startWorkout(session));
      if (draft || session) setVisible(true);
    } }}>
      {children}
      {visible && draft ? (
        <ModalFrame title={draft.name} subtitle="Workout in progress" onClose={() => setVisible(false)}>
          <div className="workout-log">
            {!stored ? <p role="alert">Draft not saved. Keep this page open.</p> : null}
            {Array.from(new Set(draft.sets.map((set) => set.exercise))).map((exercise) => {
              const rows = draft.sets.map((set, index) => ({ ...set, index })).filter((set) => set.exercise === exercise);
              return <fieldset key={exercise}>
                <legend>{exercise}</legend>
                <span className="workout-target">{rows.length} {rows.length === 1 ? "set" : "sets"} · {rows[0].target} reps · {rows[0].restSeconds}s rest</span>
                <div className="workout-set-head" aria-hidden="true"><span>Set</span><span>{rows[0].mode === "assisted" ? "Assist lb" : rows[0].mode === "bodyweight" ? "Load" : "lb"}</span><span>Reps</span><span>Done</span></div>
                {rows.map((set) => <div className={`workout-set${set.done ? " done" : ""}`} key={set.index}>
                  <span>{set.setNumber}</span>
                  {set.mode === "bodyweight" ? <small>Bodyweight</small> : <input type="number" inputMode="decimal" min="0" max="2000" step="any"
                    aria-label={`${exercise} set ${set.setNumber} ${set.mode === "assisted" ? "assistance" : "weight"} in pounds`} value={set.load}
                    onChange={(event) => update({ ...draft, sets: draft.sets.map((row, index) => index === set.index ? { ...row, load: event.target.value, done: false } : row) })} />}
                  <input type="number" inputMode="numeric" min="1" max="1000" placeholder={set.target}
                    aria-label={`${exercise} set ${set.setNumber} reps`} value={set.reps}
                    onChange={(event) => update({ ...draft, sets: draft.sets.map((row, index) => index === set.index ? { ...row, reps: event.target.value, done: false } : row) })} />
                  <button type="button" className={`chip${set.done ? " primary" : ""}`} aria-label={`${exercise} set ${set.setNumber} done`} aria-pressed={set.done}
                    disabled={!validDraftSet(set)} onClick={() => update({ ...draft, sets: draft.sets.map((row, index) => index === set.index ? { ...row, done: !row.done } : row) })}><Icon name="check" /></button>
                </div>)}
              </fieldset>;
            })}
            <div className="workout-save">
              <span aria-live="polite">{draft.sets.filter((set) => set.done).length} of {draft.sets.length} sets done</span>
              <button type="button" className="button primary" disabled={!draft.sets.some((set) => set.done)} onClick={() => {
                const sets = finishWorkout(draft);
                if (!sets.length) return;
                onSave(sets);
                update(null);
                setVisible(false);
              }}>Save {draft.sets.filter((set) => set.done).length || ""} completed {draft.sets.filter((set) => set.done).length === 1 ? "set" : "sets"}</button>
              <button type="button" className="text-button" onClick={() => setVisible(false)}>Continue later</button>
              <ConfirmButton label="Discard workout" confirmLabel="Discard unsaved sets" className="text-button" onConfirm={() => { update(null); setVisible(false); }} />
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </WorkoutContext.Provider>
  );
}

export function StartWorkoutButton({ session }: { session: PlannedSession | null }) {
  const workout = useContext(WorkoutContext);
  if (!session && !workout.draft) return null;
  return <button type="button" className="button primary" onClick={() => workout.open(session)}><Icon name="dumbbell" />{workout.draft ? "Resume workout" : "Start workout"}</button>;
}
