import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";

/**
 * What the record holds, in one sentence, so the Data screen can say what
 * "everything" is before offering to hand it over: counts of each stream and
 * the date the earliest entry was made.
 */
export function recordSummary(state: HealthState): { total: number; sentence: string } {
  const counts: Array<[number, string, string]> = [
    [state.sleepEntries.length, "night", "nights"],
    [state.workoutSets.length, "set", "sets"],
    [state.dailyEntries.length, "daily entry", "daily entries"],
    [state.medications.filter((medication) => !medication.archived).length, "medication", "medications"],
    [state.labResults.length, "lab result", "lab results"],
    [state.thoughtJournal.length, "journal page", "journal pages"],
    [state.loopEvents.length, "noticed thought", "noticed thoughts"],
  ];
  const parts = counts.filter(([count]) => count > 0).map(([count, one, many]) => `${count.toLocaleString()} ${count === 1 ? one : many}`);
  const total = counts.reduce((sum, [count]) => sum + count, 0);
  const dates = [
    ...state.sleepEntries.map((entry) => entry.date),
    ...state.workoutSets.map((entry) => entry.date),
    ...state.dailyEntries.map((entry) => entry.date),
    ...state.labResults.map((entry) => entry.date),
    ...state.thoughtJournal.map((entry) => entry.date),
  ].filter(Boolean);
  const earliest = dates.length ? dates.reduce((low, date) => (date < low ? date : low)) : null;
  const list =
    parts.length <= 1
      ? parts.join("")
      : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const since = earliest ? ` since ${dateLabel(earliest, { month: "long", year: "numeric" })}` : "";
  return { total, sentence: total ? `${list}${since}` : "" };
}
