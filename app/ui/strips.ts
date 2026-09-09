import type { DailyEntry, HealthState, Medication } from "../health-model";
import { addDays, dateLabel, isDue } from "../health-model";
import type { DayCell } from "./spark";

/**
 * The day-by-day series behind each count on screen.
 *
 * Kept apart from the components so the number and its picture are computed
 * from the same walk over the same days, and cannot drift into saying different
 * things — which is how "all current" ended up two inches above "nine of eleven
 * short" on the old training screen.
 */

function windowDates(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(today, index - (days - 1)));
}

const dayName = (date: string) => dateLabel(date, { weekday: "short", month: "short", day: "numeric" });

/** Did you take it, on each day it was actually due. */
export function medicationCells(state: HealthState, medication: Medication, today: string, days: number): DayCell[] {
  const answers = new Map(
    state.medicationDoses
      .filter(dose => dose.medicationId === medication.id)
      .map(dose => [dose.date, dose.taken] as const),
  );
  return windowDates(today, days).map(date => {
    if (!isDue(medication, date)) return { date, state: "none" as const, label: `${dayName(date)}: not due` };
    const answer = answers.get(date);
    if (answer === true) return { date, state: "on" as const, label: `${dayName(date)}: taken` };
    if (answer === false) return { date, state: "miss" as const, label: `${dayName(date)}: missed` };
    return { date, state: "open" as const, label: `${dayName(date)}: not logged` };
  });
}

/** Whether a day carried any value at all, for the things that are yes or no. */
export function dailyCells(
  entries: DailyEntry[],
  today: string,
  days: number,
  read: (entry: DailyEntry | undefined) => { done: boolean; partial?: boolean; detail: string },
): DayCell[] {
  const byDate = new Map(entries.map(entry => [entry.date, entry] as const));
  return windowDates(today, days).map(date => {
    const answer = read(byDate.get(date));
    return {
      date,
      state: answer.done ? (answer.partial ? "half" : "on") : "open",
      label: `${dayName(date)}: ${answer.detail}`,
    };
  });
}

/** A number a day, for the things where how much matters. */
export function dailyValues(
  entries: DailyEntry[],
  today: string,
  days: number,
  read: (entry: DailyEntry) => number | null,
): Array<{ date: string; value: number | null }> {
  const byDate = new Map(entries.map(entry => [entry.date, entry] as const));
  return windowDates(today, days).map(date => {
    const entry = byDate.get(date);
    return { date, value: entry ? read(entry) : null };
  });
}

/** Days that carry at least one record of the given kind. */
export function datedCells(dates: Iterable<string>, today: string, days: number, what: string): DayCell[] {
  const marked = new Set(dates);
  return windowDates(today, days).map(date => ({
    date,
    state: marked.has(date) ? "on" as const : "open" as const,
    label: `${dayName(date)}: ${marked.has(date) ? what : `no ${what}`}`,
  }));
}

/** How many of the last N days carry a mark, and the current run of them. */
export function streak(cells: DayCell[]): { hits: number; run: number } {
  const hits = cells.filter(cell => cell.state === "on" || cell.state === "half").length;
  let run = 0;
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const state = cells[index].state;
    if (state === "on" || state === "half") run += 1;
    else if (state === "none") continue;
    else break;
  }
  return { hits, run };
}
