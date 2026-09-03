/**
 * Series the tides are drawn from.
 *
 * Each is a plain list of dated values, oldest first, computed from the record
 * with nothing hidden: a weekly average is the mean of the recorded nights in
 * that week, an adherence point is the taken share of the due doses in the
 * thirty days behind it. Missing weeks are null so a gap draws as a gap.
 */

import type { HealthState } from "./health-model";
import { addDays, buildWorkoutSessions, entriesInWindow, isDue, preferredSleepEntries, todayLocal } from "./health-model";

export type SeriesPoint = { date: string; value: number | null };

function mean(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** The last day of each of the trailing weeks, oldest first, ending on asOf. */
function weekEnds(asOf: string, weeks: number): string[] {
  return Array.from({ length: weeks }, (_, index) => addDays(asOf, -(weeks - 1 - index) * 7));
}

/** Average sleep per trailing week: nights ending on each week's last day. */
export function sleepWeeklyAverages(state: HealthState, asOf = todayLocal(), weeks = 8): SeriesPoint[] {
  const nights = preferredSleepEntries(state.sleepEntries);
  return weekEnds(asOf, weeks).map((date) => ({
    date,
    value: round(
      mean(
        entriesInWindow(nights, date, 7)
          .map((entry) => entry.durationHours)
          .filter((value): value is number => value !== null),
      ),
    ),
  }));
}

/** Minutes meditated in each trailing week. */
export function meditationWeeklyMinutes(state: HealthState, asOf = todayLocal(), weeks = 8): SeriesPoint[] {
  return weekEnds(asOf, weeks).map((date) => ({
    date,
    value: entriesInWindow(state.dailyEntries, date, 7).reduce(
      (total, entry) => total + (entry.meditationMinutes ?? 0),
      0,
    ),
  }));
}

/**
 * Adherence as a rolling figure: for each of the last `days` days, the share of
 * due doses answered "taken" over the `window` days ending there. Unanswered
 * doses are neither taken nor missed, so a day nobody logged does not move it.
 */
export function adherenceSeries(state: HealthState, asOf = todayLocal(), days = 30, window = 30): SeriesPoint[] {
  const medications = state.medications.filter((medication) => !medication.archived);
  const answers = new Map<string, boolean>();
  for (const dose of state.medicationDoses) answers.set(`${dose.medicationId}:${dose.date}`, dose.taken);

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(asOf, -(days - 1 - index));
    let taken = 0;
    let recorded = 0;
    for (let back = 0; back < window; back += 1) {
      const day = addDays(date, -back);
      for (const medication of medications) {
        if (!isDue(medication, day)) continue;
        const answer = answers.get(`${medication.id}:${day}`);
        if (answer === undefined) continue;
        recorded += 1;
        if (answer) taken += 1;
      }
    }
    return { date, value: recorded ? Math.round((taken / recorded) * 100) : null };
  });
}

/** Weight, one point per trailing week: the latest reading in that week. */
export function weightWeekly(state: HealthState, asOf = todayLocal(), weeks = 8): SeriesPoint[] {
  const byDate = [...state.dailyEntries]
    .filter((entry) => typeof entry.weightLb === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
  return weekEnds(asOf, weeks).map((date) => {
    const from = addDays(date, -6);
    const latest = byDate.filter((entry) => entry.date >= from && entry.date <= date).at(-1);
    return { date, value: latest?.weightLb ?? null };
  });
}

/**
 * One day, read across every stream — the night, the training, the doses, the
 * plate and the practice — so a point on a tide can be opened into the day it
 * belongs to. Nothing is inferred: absent means unrecorded.
 */
export type DaySlice = {
  date: string;
  sleepHours: number | null;
  sessions: string[];
  sets: number;
  medsDue: number;
  medsTaken: number;
  medsMissed: number;
  proteinG: number | null;
  meditationMinutes: number | null;
  journaled: boolean;
};

export function daySlice(state: HealthState, date: string): DaySlice {
  const night = preferredSleepEntries(state.sleepEntries).find((entry) => entry.date === date);
  const sets = state.workoutSets.filter((entry) => entry.date === date);
  const sessions = buildWorkoutSessions(sets).map((session) => session.name);
  const day = state.dailyEntries.find((entry) => entry.date === date);
  let medsDue = 0;
  let medsTaken = 0;
  let medsMissed = 0;
  for (const medication of state.medications) {
    if (medication.archived || !isDue(medication, date)) continue;
    medsDue += 1;
    const dose = state.medicationDoses.find((entry) => entry.medicationId === medication.id && entry.date === date);
    if (dose?.taken === true) medsTaken += 1;
    else if (dose?.taken === false) medsMissed += 1;
  }
  return {
    date,
    sleepHours: night?.durationHours ?? null,
    sessions,
    sets: sets.length,
    medsDue,
    medsTaken,
    medsMissed,
    proteinG: day?.proteinG ?? null,
    meditationMinutes: day?.meditationMinutes ?? null,
    journaled: Boolean(day?.journaled) || state.thoughtJournal.some((entry) => entry.date === date),
  };
}
