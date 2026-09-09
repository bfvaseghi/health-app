"use client";

import type { HealthState } from "../health-model";
import { dateLabel, daysBetween } from "../health-model";
import { recordAge, sinceLabel } from "../training/recommend";
import { Icon } from "./icons";
import type { Modal } from "./types";

/**
 * Where everything below it came from, in one line at the top of the section.
 *
 * Every number on this page is read off the last Strong export. That was said
 * nowhere, so a plan drawn from a three-week-old record looked exactly like one
 * drawn from yesterday's. It is also the only place the app can show the
 * direction of the loop: `From Strong` while it is reading, `To Strong` while a
 * copied workout is out and no newer record has come back. Two states, both
 * facts, and the second one appears because of something he just did.
 */
export function recordStamp(state: HealthState, today: string): {
  tone: "neutral" | "accent" | "waiting" | "stale";
  text: string;
  cta: string | null;
} {
  const age = recordAge(state, today);
  const copied = state.goals.lastCopied;
  const copiedDay = copied?.at.slice(0, 10) ?? null;

  if (!state.workoutSets.length) {
    return { tone: "accent", text: "From Strong · nothing imported yet", cta: "Import" };
  }
  // A copy is only outstanding while nothing newer has come back, and it
  // expires rather than becoming a standing nag.
  if (copiedDay && (age.date === null || age.date <= copiedDay) && daysBetween(copiedDay, today) <= 10) {
    return {
      tone: "waiting",
      text: `To Strong · copied ${copied!.session} on ${dateLabel(copiedDay, { month: "short", day: "numeric" })}`,
      cta: "Import",
    };
  }
  if (age.days !== null && age.days >= 7) {
    return { tone: "stale", text: `From Strong · last workout ${sinceLabel(age.days)}`, cta: "Import" };
  }
  const count = new Set(state.workoutSets.filter(set => set.date <= today).map(set => set.startedAt)).size;
  const workouts = `${count} ${count === 1 ? "workout" : "workouts"}`;
  if (state.importedAt) {
    const days = daysBetween(state.importedAt.slice(0, 10), today);
    return { tone: "neutral", text: `From Strong · imported ${sinceLabel(days)} · ${workouts}`, cta: null };
  }
  // No import was ever stamped. Saying so is the honest answer; reading it off
  // the newest workout date would be a guess dressed as a record.
  return {
    tone: "neutral",
    text: `From Strong · last workout ${sinceLabel(age.days)} · imported: not recorded`,
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
