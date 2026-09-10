"use client";

import type { HealthState } from "../health-model";
import { daysBetween } from "../health-model";
import { LoopSteps } from "./next-up-row";
import type { LoopState } from "./loop-state";
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
 * right thing and read as a fault. It reports one fact now: how old the
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
  /** The age, as a headline. */
  text: string;
  /** What is in the record, underneath it. */
  detail: string;
  cta: string;
} {
  if (!state.workoutSets.length) {
    return { tone: "accent", text: "No Strong export yet", detail: "Nothing to plan from", cta: "Import from Strong" };
  }
  const count = new Set(state.workoutSets.filter(set => set.date <= today).map(set => set.startedAt)).size;
  const held = `${count} ${count === 1 ? "workout" : "workouts"} in the record`;

  // No import was ever stamped. Saying so is the honest answer; reading it off
  // the newest workout date would be a guess dressed as a record. The workout
  // date is still the only age we have here, so an old one keeps the amber —
  // the one state that cannot date its own record must not be the calmest
  // thing on the screen.
  if (!state.importedAt) {
    const age = recordAge(state, today);
    return {
      tone: age.days !== null && age.days >= 7 ? "stale" : "neutral",
      text: `Last workout ${sinceLabel(age.days)}`,
      detail: "Last import not recorded",
      cta: "Update from Strong",
    };
  }

  const days = daysBetween(state.importedAt.slice(0, 10), today);
  if (days >= 7) {
    return { tone: "stale", text: `Last import ${sinceLabel(days)}`, detail: held, cta: "Update from Strong" };
  }
  return { tone: "neutral", text: `Imported ${sinceLabel(days)}`, detail: held, cta: "Update from Strong" };
}

/**
 * The record, as the first card on the section rather than a line of small
 * print above it.
 *
 * It was a 13px row you could read past without noticing, which put the only
 * way into the app's one real input behind a piece of text that looked like a
 * caption. Everything below it is derived from that import; it should be the
 * first object on the page, not the smallest.
 *
 * The button is the whole card at rest. The three steps are a reference — you
 * need them the first few weeks and then you know them — so they fold away
 * behind the one line that says whether to press the button at all. A permanent
 * three-line explainer at the top of the section is the bulk this app keeps
 * being asked to stop carrying.
 *
 * How loud the button is stays the state of the loop, said without a sentence:
 * quiet while the record is current, loud the moment you owe it an export.
 */
export function RecordCard({ state, today, loop, open }: {
  state: HealthState;
  today: string;
  loop: LoopState;
  open: (modal: Modal) => void;
}) {
  const stamp = recordStamp(state, today);
  const loud = stamp.tone !== "neutral" || loop.reason === "mid";
  return (
    <section className={`record-card is-${stamp.tone}${loud ? " is-loud" : ""}`} aria-label="Your record">
      <button
        type="button"
        className={`button ${loud ? "primary" : "secondary"}`}
        onClick={() => open({ kind: "import", source: "strong" })}
      >
        <Icon name="upload" />
        {stamp.cta}
      </button>
      {/* Uncontrolled on purpose: it is a reference, not a row you were
          reading, so coming back to it shut is the right resting state. */}
      <details className="record-fold">
        <summary>
          <b>{stamp.text}</b>
          <small>{stamp.detail}</small>
        </summary>
        <LoopSteps loop={loop} />
      </details>
    </section>
  );
}
