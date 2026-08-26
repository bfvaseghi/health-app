import { normalizeHealthState } from "./health-model";
import type { GoalSettings, HealthState } from "./health-model";

export type InitialStateChoice = {
  state: HealthState;
  /** The chosen copy has changes the server does not yet hold. */
  needsSync: boolean;
};

/**
 * Chooses one whole-state copy without letting an older server response erase
 * a newer offline edit. HealthState normalization guarantees valid timestamps.
 */
export function chooseInitialState(
  local: HealthState | null,
  remote: HealthState | null,
  fallback: HealthState,
): InitialStateChoice {
  if (local && (!remote || local.updatedAt > remote.updatedAt)) {
    return { state: local, needsSync: true };
  }
  return { state: remote ?? local ?? fallback, needsSync: false };
}

export type ConcurrentMerge = {
  state: HealthState;
  /** Record or goal fields that changed differently in both copies. */
  conflicts: number;
};

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeObject<T extends object>(base: T | undefined, local: T, remote: T): { value: T; conflicts: number } {
  const common = (base ?? {}) as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;
  const keys = new Set([...Object.keys(common), ...Object.keys(localRecord), ...Object.keys(remoteRecord)]);
  const value: Record<string, unknown> = {};
  let conflicts = 0;

  for (const key of keys) {
    const baseField = common[key];
    const localField = localRecord[key];
    const remoteField = remoteRecord[key];
    let chosen: unknown;
    if (equal(localField, baseField)) chosen = remoteField;
    else if (equal(remoteField, baseField) || equal(localField, remoteField)) chosen = localField;
    else {
      chosen = localField;
      conflicts += 1;
    }
    if (chosen !== undefined) value[key] = chosen;
  }

  return { value: value as T, conflicts };
}

/**
 * Keeps changes from both clients after a revision conflict. A side that still
 * matches the common base did not edit that record, so the other side wins. If
 * both edited the same record differently, the edit on this device wins and we
 * report the conflict instead of silently choosing by arrival order.
 */
function mergeList<T>(
  base: T[],
  local: T[],
  remote: T[],
  keyOf: (value: T) => string,
): { values: T[]; conflicts: number } {
  const baseByKey = new Map(base.map((value) => [keyOf(value), value]));
  const localByKey = new Map(local.map((value) => [keyOf(value), value]));
  const remoteByKey = new Map(remote.map((value) => [keyOf(value), value]));
  const keys = new Set([...baseByKey.keys(), ...localByKey.keys(), ...remoteByKey.keys()]);
  const values: T[] = [];
  let conflicts = 0;

  for (const key of keys) {
    const baseValue = baseByKey.get(key);
    const localValue = localByKey.get(key);
    const remoteValue = remoteByKey.get(key);
    let chosen: T | undefined;

    if (equal(localValue, baseValue)) chosen = remoteValue;
    else if (equal(remoteValue, baseValue) || equal(localValue, remoteValue)) chosen = localValue;
    else if (localValue && remoteValue && typeof localValue === "object" && typeof remoteValue === "object") {
      const merged = mergeObject(baseValue && typeof baseValue === "object" ? baseValue : undefined, localValue, remoteValue);
      chosen = merged.value;
      conflicts += merged.conflicts;
    }
    else {
      chosen = localValue;
      conflicts += 1;
    }
    if (chosen !== undefined) values.push(chosen);
  }

  return { values, conflicts };
}

function mergeGoals(base: GoalSettings, local: GoalSettings, remote: GoalSettings) {
  const merged = mergeObject(base, local, remote);
  return { goals: merged.value, conflicts: merged.conflicts };
}

export function mergeConcurrentHealthState(
  base: HealthState | null,
  local: HealthState,
  remote: HealthState,
): ConcurrentMerge {
  const common = base ?? normalizeHealthState({});
  const medications = mergeList(common.medications, local.medications, remote.medications, (value) => value.id);
  const doses = mergeList(
    common.medicationDoses,
    local.medicationDoses,
    remote.medicationDoses,
    (value) => `${value.medicationId}:${value.date}`,
  );
  const daily = mergeList(common.dailyEntries, local.dailyEntries, remote.dailyEntries, (value) => value.date);
  const sleep = mergeList(common.sleepEntries, local.sleepEntries, remote.sleepEntries, (value) => `${value.date}:${value.source}`);
  const labs = mergeList(common.labResults, local.labResults, remote.labResults, (value) => value.id);
  const workouts = mergeList(
    common.workoutSets,
    local.workoutSets,
    remote.workoutSets,
    (value) => `${value.startedAt}:${value.exercise}:${value.setNumber}`,
  );
  const notes = mergeList(common.therapyNotes, local.therapyNotes, remote.therapyNotes, (value) => value.id);
  const photos = mergeList(common.progressPhotos, local.progressPhotos, remote.progressPhotos, (value) => value.id);
  const goals = mergeGoals(common.goals, local.goals, remote.goals);

  return {
    state: normalizeHealthState({
      ...remote,
      updatedAt: new Date().toISOString(),
      medications: medications.values,
      medicationDoses: doses.values,
      dailyEntries: daily.values,
      sleepEntries: sleep.values,
      labResults: labs.values,
      workoutSets: workouts.values,
      therapyNotes: notes.values,
      progressPhotos: photos.values,
      goals: goals.goals,
    }),
    conflicts:
      medications.conflicts +
      doses.conflicts +
      daily.conflicts +
      sleep.conflicts +
      labs.conflicts +
      workouts.conflicts +
      notes.conflicts +
      photos.conflicts +
      goals.conflicts,
  };
}
