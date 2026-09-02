/**
 * Whether the lifts are moving.
 *
 * Strength is the thing training is for, so this measures strength and nothing
 * else — what the body weighs and what percentage of it is fat belong with body
 * composition, not here.
 *
 * The question is direction over time rather than one day against another. A
 * single session is noisy: an estimated max swings a few percent on sleep,
 * caffeine and whether the last set was a grind. So every lift is fitted across
 * all of its sessions in the window and reported by the slope of that line,
 * which is what "going up" actually means for a lift.
 */

import type { HealthState, WorkoutSet } from "../health-model";
import { addDays, estimateOneRepMax, setVolume, todayLocal } from "../health-model";

/**
 * Sessions a lift needs before a direction is claimed for it. Two points make a
 * line through anything; three are the fewest that can disagree with each other.
 */
const MIN_SESSIONS = 3;

/**
 * How much of a move counts as a move. An estimated max carries a few percent
 * of noise per session, and a fit across a handful of them takes that down but
 * not away — under this, the honest answer is that the lift is holding.
 */
const FLAT_PERCENT = 2.5;

export type Change = {
  from: number | null;
  to: number | null;
  /** to − from, or null when either end has no data. */
  change: number | null;
  /** Readings behind the comparison, so one drawn from a single session can say so. */
  samples: number;
};

/** One session's best effort at a movement. */
export type LiftPoint = {
  date: string;
  value: number;
};

export type LiftTrend = {
  exercise: string;
  /** Reps, for a movement that never carries weight; otherwise an estimated max. */
  bodyweight: boolean;
  /** Every session in the window, oldest first — the trajectory itself. */
  points: LiftPoint[];
  sessions: number;
  first: number;
  last: number;
  best: number;
  /** Percent a week, from the fitted line rather than from the two end sessions. */
  percentPerWeek: number;
  /** What that slope adds up to across the window. */
  percent: number;
  direction: "up" | "flat" | "down";
  /** Sessions since the best effort: a lift that peaked a while back is stalling. */
  sessionsSincePeak: number;
};

export type Progress = {
  weeks: number;
  start: string;
  end: string;
  lifts: LiftTrend[];
  /** How many of them are going which way. */
  rising: number;
  falling: number;
  /** Median percent across the window, over the lifts with enough history. */
  trendPercent: number | null;
  /** Total pounds moved in a week, the first half of the window against the second. */
  volume: Change;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number | null, digits = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Whole days from one ISO date to the next. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The day the window is split on, for the comparisons that use halves. */
function halfway(start: string, end: string): string {
  return addDays(start, Math.floor(daysBetween(start, end) / 2));
}

/**
 * Pounds moved a week, the first half of the window against the second.
 *
 * Halves rather than a fortnight at each end: training is lumpy, and a fortnight
 * with no session in it is common and would report as a collapse, which is a
 * fact about the calendar rather than about the training.
 */
function volumeChange(sets: WorkoutSet[], start: string, end: string, midpoint: string): Change {
  const lateStart = addDays(midpoint, 1);
  // Both ranges are inclusive. Odd-length windows put one more day in the
  // first half, so each half needs its own divisor or steady daily work appears
  // to fall simply because eighteen days were compared with seventeen.
  const earlyWeeks = Math.max(1, (daysBetween(start, midpoint) + 1) / 7);
  const lateWeeks = Math.max(1, (daysBetween(lateStart, end) + 1) / 7);

  const total = (from: string, to: string) =>
    sets.filter((entry) => entry.date >= from && entry.date <= to).reduce((sum, entry) => sum + setVolume(entry), 0);

  const early = total(start, midpoint) / earlyWeeks;
  const late = total(lateStart, end) / lateWeeks;
  if (!early && !late) return { from: null, to: null, change: null, samples: 0 };
  return {
    from: Math.round(early),
    to: Math.round(late),
    change: Math.round(late - early),
    samples: sets.filter((entry) => entry.date >= start && entry.date <= end).length,
  };
}

/**
 * The slope of a least-squares line through the points, in units a day.
 *
 * Every session counts rather than only the two on the ends, so one bad day at
 * either end moves the answer a little instead of deciding it.
 */
function slopePerDay(points: LiftPoint[]): number {
  const origin = points[0].date;
  const xs = points.map((point) => daysBetween(origin, point.date));
  const ys = points.map((point) => point.value);
  const meanX = xs.reduce((total, value) => total + value, 0) / xs.length;
  const meanY = ys.reduce((total, value) => total + value, 0) / ys.length;
  let top = 0;
  let bottom = 0;
  for (let index = 0; index < xs.length; index += 1) {
    top += (xs[index] - meanX) * (ys[index] - meanY);
    bottom += (xs[index] - meanX) ** 2;
  }
  // Every session on one day — a fit has nothing to lean on, so it is flat.
  if (!bottom || !meanY) return 0;
  return top / bottom;
}

/** One session's best set, as an estimated max or, for bodyweight work, as reps. */
function bestEffort(sets: WorkoutSet[], bodyweight: boolean): number | null {
  if (bodyweight) return Math.max(0, ...sets.map((entry) => entry.reps ?? 0)) || null;
  const maxes = sets
    .map((entry) => estimateOneRepMax(entry.weightLb, entry.reps))
    .filter((value): value is number => value !== null);
  return maxes.length ? Math.max(...maxes) : null;
}

/** Every movement in the window, with its session-by-session trajectory. */
function liftTrends(sets: WorkoutSet[], start: string, end: string): LiftTrend[] {
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const entry of sets) {
    if (entry.date < start || entry.date > end) continue;
    const list = byExercise.get(entry.exercise);
    if (list) list.push(entry);
    else byExercise.set(entry.exercise, [entry]);
  }

  const trends: LiftTrend[] = [];
  for (const [exercise, entries] of byExercise) {
    const bodyweight = entries.every((entry) => entry.weightLb === null || entry.weightLb === 0);

    // One point a session, not one a set: a session is the unit a lift is
    // trained in, and its best set is what it was worth that day.
    const sessions = [...new Set(entries.map((entry) => entry.startedAt))].sort();
    const points: LiftPoint[] = [];
    for (const startedAt of sessions) {
      const group = entries.filter((entry) => entry.startedAt === startedAt);
      const value = bestEffort(group, bodyweight);
      if (value === null || value <= 0) continue;
      points.push({ date: group[0].date, value: round(value) as number });
    }
    if (points.length < MIN_SESSIONS) continue;

    const values = points.map((point) => point.value);
    const meanY = values.reduce((total, value) => total + value, 0) / values.length;
    const span = Math.max(1, daysBetween(points[0].date, points.at(-1)?.date as string));
    const perDay = slopePerDay(points);
    // Relative to the average rather than to the first session, so a low first
    // day cannot turn a small absolute gain into a huge percentage.
    const percentPerWeek = round((perDay * 7 * 100) / meanY, 2) as number;
    const percent = round((perDay * span * 100) / meanY) as number;
    const best = Math.max(...values);
    const peak = values.lastIndexOf(best);

    trends.push({
      exercise,
      bodyweight,
      points,
      sessions: points.length,
      first: values[0],
      last: values[values.length - 1],
      best,
      percentPerWeek,
      percent,
      direction: percent >= FLAT_PERCENT ? "up" : percent <= -FLAT_PERCENT ? "down" : "flat",
      sessionsSincePeak: values.length - 1 - peak,
    });
  }

  // Biggest movers first, in either direction — a lift going backwards is the
  // most useful thing on the page.
  return trends.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
}

/**
 * The last day with training on it. The window ends here rather than today: a
 * fortnight without an export would otherwise read as a fortnight of no
 * training, and a comparison against zero is not a comparison.
 */
function lastRecorded(state: HealthState, asOf: string): string {
  const dates = state.workoutSets.map((entry) => entry.date).filter((date) => date <= asOf);
  return dates.length ? dates.reduce((latest, date) => (date > latest ? date : latest)) : asOf;
}

export function buildProgress(state: HealthState, asOf = todayLocal(), weeks = 12): Progress {
  const span = Math.max(4, Math.trunc(weeks));
  const end = lastRecorded(state, asOf);
  const start = addDays(end, -(span * 7 - 1));

  const lifts = liftTrends(state.workoutSets, start, end);

  return {
    weeks: span,
    start,
    end,
    lifts,
    rising: lifts.filter((lift) => lift.direction === "up").length,
    falling: lifts.filter((lift) => lift.direction === "down").length,
    trendPercent: round(median(lifts.map((lift) => lift.percent))),
    volume: volumeChange(state.workoutSets, start, end, halfway(start, end)),
  };
}

/**
 * Strength as one line: the typical lift, week by week, indexed to the first
 * week of the window. Each lift contributes its best estimated max in each
 * week it was trained, relative to its own first week; the point is the median
 * of those ratios across lifts, so one movement cannot carry or sink the line.
 * Bodyweight movements index on reps instead. Weeks with no training are null.
 */
export function strengthIndex(state: HealthState, asOf = todayLocal(), weeks = 12): Array<{ date: string; value: number | null }> {
  const span = Math.max(4, Math.trunc(weeks));
  const end = lastRecorded(state, asOf);
  const start = addDays(end, -(span * 7 - 1));
  const lifts = liftTrends(state.workoutSets, start, end);

  return Array.from({ length: span }, (_, index) => {
    const weekEnd = addDays(start, index * 7 + 6);
    const weekStart = addDays(weekEnd, -6);
    const ratios: number[] = [];
    for (const lift of lifts) {
      const base = lift.points[0]?.value;
      if (!base) continue;
      const inWeek = lift.points.filter((point) => point.date >= weekStart && point.date <= weekEnd);
      if (!inWeek.length) continue;
      ratios.push((Math.max(...inWeek.map((point) => point.value)) / base) * 100);
    }
    return { date: weekEnd, value: round(median(ratios)) };
  });
}
