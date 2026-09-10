import type { HealthState } from "../health-model";
import { daysBetween } from "../health-model";

/**
 * Where you are in the week's round trip, and whether to say so.
 *
 * The app plans the workout, Strong records it, and the plan only moves when
 * the export comes back. That is the whole loop, and until now the app said it
 * nowhere — so a screen that was simply waiting on an import looked exactly
 * like one that was up to date and wrong.
 *
 * The strip is not a tutorial that runs once and retires. It appears exactly
 * when the record could be behind and disappears the moment it isn't, which
 * means it doubles as the answer to "why does it still say 1 done?".
 */

/** How far an import can fall behind before the loop is worth restating. */
export const LOOP_STALE_DAYS = 7;

/**
 * done — struck through: we know it happened in this pass round the loop.
 * now  — the step to take next, and the only one carrying a filled numeral.
 * todo — ahead of you, drawn quiet.
 */
export type StepState = "done" | "now" | "todo";

export type LoopStep = {
  key: "gym" | "log" | "import";
  label: string;
  note: string | null;
  state: StepState;
};

export type LoopState = {
  /**
   * The record may be behind, so a count of imported workouts is not a count
   * of workouts. Gates the caveat under the week pips.
   */
  uncertain: boolean;
  /**
   * "mid" is the one that earns the loud treatment — you have opened the
   * workout since your last import, so the record is knowingly behind.
   */
  reason: "mid" | "first" | "stale" | "closed";
  steps: LoopStep[];
};

export function loopState(state: HealthState, today: string, gymOpenedAt: string | null): LoopState {
  const imported = state.importedAt;
  // Opened the gym card since the last import: the workout you just read is not
  // in the record yet, whatever else is.
  //
  // Compared as parsed instants, not as strings. The two timestamps come from
  // different places — one from this device's clock, one from whatever wrote
  // the record — and a string compare quietly gives the wrong answer the moment
  // they are not both UTC in the same shape.
  //
  // A visit also has to be recent to count. Without the bound, a phone that
  // opened the card once and never imported would strike step one for the rest
  // of its life, and the strip would describe a workout from March.
  const openedAt = gymOpenedAt === null ? NaN : Date.parse(gymOpenedAt);
  const importedAt = imported === null ? NaN : Date.parse(imported);
  const visitFresh = Number.isFinite(openedAt)
    && daysBetween((gymOpenedAt as string).slice(0, 10), today) < LOOP_STALE_DAYS;
  const midLoop = visitFresh && (!Number.isFinite(importedAt) || openedAt > importedAt);
  const behind = imported !== null && daysBetween(imported.slice(0, 10), today) >= LOOP_STALE_DAYS;
  const reason = midLoop ? "mid" : !imported ? "first" : behind ? "stale" : "closed";

  return {
    uncertain: reason !== "closed",
    reason,
    // The steps are always on screen, so they have to say where you are and not
    // only what the loop is. Mid-loop the workout has been read and the export
    // is what is owed; otherwise the gym is what is next. Step two is the one
    // the app can neither do nor observe, so it is never "now".
    steps: [
      { key: "gym", label: "Open in the gym", note: null, state: midLoop ? "done" : "now" },
      { key: "log", label: "Log the sets in Strong", note: null, state: "todo" },
      {
        key: "import",
        label: "Import the export back here",
        // Not "the plan doesn't move until you do" — the week rolls over on
        // Monday and a set added by hand in Coverage moves the plan too. What
        // is true, and what matters in the gym, is the load on each lift.
        note: "Your weights only change when you import",
        state: midLoop ? "now" : "todo",
      },
    ],
  };
}
