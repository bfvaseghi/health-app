import type { HabitEvent } from "./health-model";
import { normalizeHabitEvent } from "./health-model";

/** Validate against the current clock at submission, including on an old open form. */
export function caffeineEntry(input: { id: string; habitId: string; amount: string | number; at: string }, now: string): { event: HabitEvent | null; error: string } {
  const amount = Number(input.amount);
  if (String(input.amount).trim() === "" || !Number.isFinite(amount) || amount < 0.1) {
    return { event: null, error: "Enter an amount of at least 0.1 mg." };
  }
  const event = normalizeHabitEvent({ id: input.id, habitId: input.habitId, amountMg: amount, at: input.at, kind: "intake" }, new Set([input.habitId]));
  if (!event) return { event: null, error: "Enter a valid date and time." };
  if (event.at > now) return { event: null, error: "Choose a time that has already passed." };
  return { event, error: "" };
}
