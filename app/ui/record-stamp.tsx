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
 */
export function recordStamp(state: HealthState, today: string): {
  tone: "neutral" | "accent" | "stale";
  text: string;
  cta: string | null;
} {
  const age = recordAge(state, today);

  if (!state.workoutSets.length) {
    return { tone: "accent", text: "No Strong export yet", cta: "Import" };
  }
  if (age.days !== null && age.days >= 7) {
    return { tone: "stale", text: `Last workout ${sinceLabel(age.days)}`, cta: "Import" };
  }
  const count = new Set(state.workoutSets.filter(set => set.date <= today).map(set => set.startedAt)).size;
  const workouts = `${count} ${count === 1 ? "workout" : "workouts"}`;
  if (state.importedAt) {
    const days = daysBetween(state.importedAt.slice(0, 10), today);
    return { tone: "neutral", text: `Imported ${sinceLabel(days)} · ${workouts}`, cta: null };
  }
  // No import was ever stamped. Saying so is the honest answer; reading it off
  // the newest workout date would be a guess dressed as a record.
  return {
    tone: "neutral",
    text: `Last workout ${sinceLabel(age.days)} · last import not recorded`,
    cta: null,
  };
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
