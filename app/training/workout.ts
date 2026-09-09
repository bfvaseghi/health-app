import { localDateTime, validIsoDate } from "../health-model";
import type { ExerciseLoadMode, WorkoutSet } from "../health-model";
import type { PlannedSession } from "./coach";

export type DraftSet = {
  exercise: string;
  setNumber: number;
  mode: ExerciseLoadMode;
  load: string;
  reps: string;
  target: string;
  restSeconds: number;
  done: boolean;
};

export type WorkoutDraft = {
  version: 1;
  name: string;
  startedAt: string;
  sets: DraftSet[];
};

export function startWorkout(session: PlannedSession, now = new Date()): WorkoutDraft {
  const startedAt = `${localDateTime(now)}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
  return {
    version: 1,
    name: session.name,
    startedAt,
    sets: session.exercises.flatMap((exercise) => Array.from({ length: exercise.sets }, (_, index) => ({
      exercise: exercise.exercise,
      setNumber: index + 1,
      mode: exercise.assistanceLb !== null ? "assisted" as const : exercise.bodyweight ? "bodyweight" as const : "loaded" as const,
      load: String(exercise.assistanceLb ?? exercise.weightLb ?? ""),
      reps: "",
      target: exercise.repRange,
      restSeconds: exercise.restSeconds,
      done: false,
    }))),
  };
}

export function validDraftSet(set: DraftSet): boolean {
  const reps = Number(set.reps);
  const load = Number(set.load);
  return set.reps.trim() !== "" && Number.isInteger(reps) && reps > 0 && reps <= 1_000
    && (set.mode === "bodyweight" || (set.load.trim() !== "" && Number.isFinite(load) && load >= 0 && load <= 2_000));
}

export function finishWorkout(draft: WorkoutDraft, now = new Date()): WorkoutSet[] {
  const durationSeconds = Math.min(86_400, Math.max(0, Math.round((now.getTime() - Date.parse(draft.startedAt)) / 1_000)));
  return draft.sets.filter((set) => set.done && validDraftSet(set)).map((set) => ({
    date: draft.startedAt.slice(0, 10),
    startedAt: draft.startedAt,
    workoutName: draft.name,
    exercise: set.exercise,
    setNumber: set.setNumber,
    loadMode: set.mode,
    weightLb: set.mode === "loaded" ? Number(set.load) : null,
    assistanceLb: set.mode === "assisted" ? Number(set.load) : null,
    reps: Number(set.reps),
    distance: null,
    seconds: null,
    rpe: null,
    restSeconds: set.restSeconds,
    durationSeconds,
  }));
}

export function restoreWorkout(value: unknown, exerciseNames: Set<string>): WorkoutDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<WorkoutDraft>;
  if (draft.version !== 1 || typeof draft.name !== "string" || !draft.name.trim() || draft.name.length > 120
    || typeof draft.startedAt !== "string" || !validIsoDate(draft.startedAt.slice(0, 10))
    || !Number.isFinite(Date.parse(draft.startedAt)) || !Array.isArray(draft.sets)
    || draft.sets.length === 0 || draft.sets.length > 200) return null;
  const keys = new Set<string>();
  for (const set of draft.sets) {
    if (!set || typeof set !== "object" || !exerciseNames.has(set.exercise)
      || !Number.isInteger(set.setNumber) || set.setNumber < 1 || set.setNumber > 200
      || !["loaded", "assisted", "bodyweight"].includes(set.mode)
      || typeof set.load !== "string" || typeof set.reps !== "string" || typeof set.target !== "string"
      || set.load.length > 20 || set.reps.length > 20 || set.target.length > 30
      || !Number.isFinite(set.restSeconds) || set.restSeconds < 0 || set.restSeconds > 3_600
      || typeof set.done !== "boolean" || (set.done && !validDraftSet(set))) return null;
    const key = `${set.exercise}:${set.setNumber}`;
    if (keys.has(key)) return null;
    keys.add(key);
  }
  return draft as WorkoutDraft;
}
