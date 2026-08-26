import type { HealthState } from "./health-model";

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
