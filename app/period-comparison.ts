import type { HealthState } from "./health-model";
import { addDays, buildWorkoutSessions, preferredSleepEntries, validIsoDate } from "./health-model";
import type { SeriesPoint } from "./series";

export const comparisonMetrics = [
  { key: "sleepHours", label: "Sleep", unit: "h", digits: 1, summary: "Average", coverage: "nights" },
  { key: "weightLb", label: "Weight", unit: "lb", digits: 1, summary: "Average", coverage: "days" },
  { key: "bodyFatPercent", label: "Body fat", unit: "%", digits: 1, summary: "Average", coverage: "days" },
  { key: "proteinG", label: "Protein", unit: "g", digits: 0, summary: "Average", coverage: "days" },
  { key: "steps", label: "Steps", unit: "", digits: 0, summary: "Average", coverage: "days" },
  { key: "caloriesKcal", label: "Calories", unit: "kcal", digits: 0, summary: "Average", coverage: "days" },
  { key: "restingHeartRate", label: "Resting heart rate", unit: "bpm", digits: 0, summary: "Average", coverage: "days" },
  { key: "hrvMs", label: "HRV", unit: "ms", digits: 0, summary: "Average", coverage: "days" },
  { key: "meditationMinutes", label: "Meditation", unit: "min", digits: 0, summary: "Average recorded", coverage: "days" },
  { key: "workouts", label: "Workouts logged", unit: "", digits: 0, summary: "Total", coverage: "days" },
  { key: "medication", label: "Doses taken", unit: "%", digits: 0, summary: "Of recorded doses", coverage: "doses" },
] as const;

export type ComparisonMetric = typeof comparisonMetrics[number]["key"];
export type ComparisonDays = 7 | 28 | 90;
export type PeriodReading = { start: string; end: string; points: SeriesPoint[]; value: number | null; recorded: number; possible: number | null };

function comparisonIndex(state: HealthState) {
  const daily = new Map(state.dailyEntries.map((row) => [row.date, row]));
  const nights = new Map(preferredSleepEntries(state.sleepEntries).map((row) => [row.date, row]));
  const sessions = new Map<string, number>();
  for (const session of buildWorkoutSessions(state.workoutSets)) sessions.set(session.date, (sessions.get(session.date) ?? 0) + 1);
  const doses = new Map<string, { taken: number; recorded: number }>();
  const uniqueDoses = new Map(state.medicationDoses.map((row) => [`${row.medicationId}:${row.date}`, row]));
  for (const dose of uniqueDoses.values()) {
    const count = doses.get(dose.date) ?? { taken: 0, recorded: 0 };
    count.recorded += 1;
    if (dose.taken) count.taken += 1;
    doses.set(dose.date, count);
  }
  return { daily, nights, sessions, doses };
}

export function periodReading(state: HealthState, metric: ComparisonMetric, end: string, days: ComparisonDays): PeriodReading {
  return indexedReading(comparisonIndex(state), metric, end, days);
}

function indexedReading(index: ReturnType<typeof comparisonIndex>, metric: ComparisonMetric, end: string, days: ComparisonDays): PeriodReading {
  if (!validIsoDate(end) || ![7, 28, 90].includes(days)) throw new Error("Invalid comparison period");
  const start = addDays(end, 1 - days);
  const { daily, nights, sessions, doses } = index;
  let taken = 0;
  let answered = 0;
  const points = Array.from({ length: days }, (_, index) => {
    const date = addDays(start, index);
    const day = daily.get(date);
    const night = nights.get(date);
    let value: number | null;
    if (metric === "sleepHours") value = night?.durationHours ?? null;
    else if (metric === "workouts") value = sessions.get(date) ?? 0;
    else if (metric === "medication") {
      const count = doses.get(date);
      taken += count?.taken ?? 0;
      answered += count?.recorded ?? 0;
      value = count?.recorded ? 100 * count.taken / count.recorded : null;
    } else value = day?.[metric] ?? (metric === "restingHeartRate" ? night?.restingHeartRate : metric === "hrvMs" ? night?.hrvMs : null) ?? null;
    return { date, value: value !== null && Number.isFinite(value) ? value : null };
  });
  const values = points.flatMap((point) => point.value === null ? [] : [point.value]);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    start, end, points,
    value: metric === "medication" ? (answered ? 100 * taken / answered : null) : metric === "workouts" ? total : values.length ? total / values.length : null,
    recorded: metric === "medication" ? answered : metric === "workouts" ? values.filter((value) => value > 0).length : values.length,
    possible: metric === "medication" ? null : days,
  };
}

export function comparePeriods(state: HealthState, earlierEnd: string, laterEnd: string, days: ComparisonDays) {
  if (!validIsoDate(earlierEnd) || !validIsoDate(laterEnd) || earlierEnd >= addDays(laterEnd, 1 - days)) throw new Error("Periods overlap");
  const index = comparisonIndex(state);
  return comparisonMetrics.map((metric) => {
    const earlier = indexedReading(index, metric.key, earlierEnd, days);
    const later = indexedReading(index, metric.key, laterEnd, days);
    return { ...metric, earlier, later, difference: earlier.value === null || later.value === null ? null : later.value - earlier.value };
  });
}

export function comparisonValue(value: number | null, unit: string, digits: number): string {
  if (value === null) return "No records";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits || 0;
  return `${rounded.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
}

export function comparisonChange(row: ReturnType<typeof comparePeriods>[number]): string {
  if (row.difference === null) return "—";
  const sleep = row.key === "sleepHours";
  const value = Math.round(row.difference * (sleep ? 60 : 10 ** row.digits)) / (sleep ? 1 : 10 ** row.digits) || 0;
  const unit = sleep ? "min" : row.key === "medication" || row.key === "bodyFatPercent" ? "points" : row.unit;
  return `${value > 0 ? "+" : ""}${comparisonValue(value, unit, sleep ? 0 : row.digits)}`;
}

export function comparisonToText(rows: ReturnType<typeof comparePeriods>): string {
  if (!rows.length) return "";
  return ["Period comparison", `Earlier: ${rows[0].earlier.start} to ${rows[0].earlier.end}`, `Later: ${rows[0].later.start} to ${rows[0].later.end}`, "", ...rows.map((row) => {
    const change = row.difference === null ? "" : ` · change ${comparisonChange(row)}`;
    const coverage = row.key === "medication" ? `${row.earlier.recorded} to ${row.later.recorded} doses` : `${row.earlier.recorded}/${row.earlier.possible} to ${row.later.recorded}/${row.later.possible} ${row.coverage}`;
    return `${row.label} (${row.summary.toLowerCase()}): ${comparisonValue(row.earlier.value, row.unit, row.digits)} to ${comparisonValue(row.later.value, row.unit, row.digits)}${change}. Recorded: ${coverage}.`;
  })].join("\n");
}
