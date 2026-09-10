"use client";

import type { HealthState } from "../health-model";
import { daysBetween } from "../health-model";
import { recordAge, sinceLabel } from "../training/recommend";
import { Icon } from "./icons";
import type { Modal } from "./types";

/**
 * How current the record is, in one line at the top of the section.
 *
 * Every number below it is read off the last Strong export. That was said
 * nowhere, so a plan drawn from a three-week-old record looked exactly like one
 * drawn from yesterday's.
 *
 * It used to also announce which way the loop was pointing — "To Strong" once
 * you had copied a workout out — which turned the stamp amber for doing the
 * right thing and read as a fault. The stamp reports one fact now: how old the
 * record is.
 *
 * And "old" means the IMPORT, not the last workout. The two are different
 * facts that the amber used to conflate: import today an export whose last
 * session was nine days ago and the record is perfectly current — you rested.
 * Flagging that as stale blamed the log for a rest week and, worse, spent the
 * one warning colour on a case where there was nothing to do. Amber now means
 * exactly one thing: your record may be behind, and importing would fix it.
 */
export function recordStamp(state: HealthState, today: string): {
  tone: "neutral" | "accent" | "stale";
  text: string;
  cta: string | null;
} {
  if (!state.workoutSets.length) {
    return { tone: "accent", text: "No Strong export yet", cta: "Import" };
  }
  // No import was ever stamped. Saying so is the honest answer; reading it off
  // the newest workout date would be a guess dressed as a record. The workout
  // date is still the only age we have here, so an old one keeps the amber and
  // the way out of it — dropping those would leave the one state that cannot
  // date its own record as the calmest line on the screen.
  if (!state.importedAt) {
    const age = recordAge(state, today);
    const text = `Last workout ${sinceLabel(age.days)} · last import not recorded`;
    return age.days !== null && age.days >= 7
      ? { tone: "stale", text, cta: "Import" }
      : { tone: "neutral", text, cta: null };
  }
  const days = daysBetween(state.importedAt.slice(0, 10), today);
  if (days >= 7) {
    return { tone: "stale", text: `Last import ${sinceLabel(days)}`, cta: "Update" };
  }
  const count = new Set(state.workoutSets.filter(set => set.date <= today).map(set => set.startedAt)).size;
  const workouts = `${count} ${count === 1 ? "workout" : "workouts"}`;
  return { tone: "neutral", text: `Imported ${sinceLabel(days)} · ${workouts}`, cta: null };
}

export function RecordStamp({ state, today, open }: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
}) {
  const stamp = recordStamp(state, today);
  return (
    <button
      type="button"
      className={`record-stamp is-${stamp.tone}`}
      onClick={() => open({ kind: "import", source: "strong" })}
    >
      <Icon name="upload" />
      <span>{stamp.text}</span>
      {stamp.cta ? <b>{stamp.cta}</b> : null}
    </button>
  );
}
