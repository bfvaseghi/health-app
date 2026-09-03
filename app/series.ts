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

/**
 * The one thing that moved most this week: each stream's last seven days set
 * against the seven before, and the largest change that clears a floor of
 * noise is the answer. Nothing crossing its floor returns null, which the page
 * says plainly rather than inventing a trend.
 */
export type Movement = { metric: string; direction: "up" | "down"; sentence: string; ratio: number };

export function weeklyMovement(state: HealthState, asOf = todayLocal()): Movement | null {
  const week = (from: number, to: number) => {
    const dates: string[] = [];
    for (let back = from; back < to; back += 1) dates.push(addDays(asOf, -back));
    return dates;
  };
  const thisWeek = new Set(week(0, 7));
  const lastWeek = new Set(week(7, 14));
  const nights = preferredSleepEntries(state.sleepEntries);
  const days = state.dailyEntries;
  const pick = <T extends { date: string }>(rows: T[], set: Set<string>, value: (row: T) => number | null) =>
    rows.filter((row) => set.has(row.date)).map(value).filter((v): v is number => v !== null && Number.isFinite(v));
  const compare = (
    metric: string,
    now: number[],
    before: number[],
    floor: number,
    phrase: (delta: number, direction: "up" | "down") => string,
    reduce: (values: number[]) => number | null = mean,
  ): Movement | null => {
    if (now.length < 3 || before.length < 3) return null;
    const a = reduce(now);
    const b = reduce(before);
    if (a === null || b === null || b === 0) return null;
    const delta = a - b;
    if (Math.abs(delta) < floor) return null;
    const direction: "up" | "down" = delta > 0 ? "up" : "down";
    return { metric, direction, ratio: Math.abs(delta) / Math.abs(b), sentence: phrase(delta, direction) };
  };
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const candidates = [
    compare("sleep", pick(nights, thisWeek, (n) => n.durationHours), pick(nights, lastWeek, (n) => n.durationHours), 10 / 60,
      (delta, direction) => `Sleep is ${direction} ${Math.round(Math.abs(delta) * 60)} min a night on last week.`),
    compare("weight", pick(days, thisWeek, (d) => d.weightLb), pick(days, lastWeek, (d) => d.weightLb), 0.5,
      (delta, direction) => `Weight is ${direction} ${Math.abs(delta).toFixed(1)} lb on last week.`),
    compare("steps", pick(days, thisWeek, (d) => d.steps), pick(days, lastWeek, (d) => d.steps), 750,
      (delta, direction) => `Steps are ${direction} ${Math.round(Math.abs(delta)).toLocaleString("en-US")} a day on last week.`),
    compare("protein", pick(days, thisWeek, (d) => d.proteinG), pick(days, lastWeek, (d) => d.proteinG), 10,
      (delta, direction) => `Protein is ${direction} ${Math.round(Math.abs(delta))} g a day on last week.`),
    compare("resting heart rate", pick(nights, thisWeek, (n) => n.restingHeartRate), pick(nights, lastWeek, (n) => n.restingHeartRate), 2,
      (delta, direction) => `Resting heart rate is ${direction} ${Math.round(Math.abs(delta))} bpm on last week.`),
    compare("meditation", pick(days, thisWeek, (d) => d.meditationMinutes ?? 0), pick(days, lastWeek, (d) => d.meditationMinutes ?? 0), 10,
      (delta, direction) => `Meditation is ${direction} ${Math.round(Math.abs(delta))} minutes on last week.`, sum),
  ].filter((movement): movement is Movement => movement !== null);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.ratio - a.ratio)[0];
}
