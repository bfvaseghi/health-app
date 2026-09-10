"use client";

import { useMemo } from "react";
import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { LiftTrend, Progress } from "../training/progress";
import { buildProgress } from "../training/progress";
import type { Pattern } from "../training/movement";
import { movementPattern } from "../training/movement";

export type StrengthFacts = {
  headline: string;
  subline: string | null;
  tone: "neutral" | "warn" | "empty";
  window: string;
  progress: Progress;
};

/**
 * The lifts this row is really about: a squat, a hinge, a press and a pull.
 *
 * A median percent across fifteen movements is a statistic, not a fact about
 * training — it moves when a lateral raise does, and it says nothing you can
 * act on. Four named lifts with the weight at each end is how the work is
 * actually thought about, so that is what the row shows.
 */
const BIG: Pattern[] = ["squat", "hinge", "press", "pull"];

/**
 * Which lift represents its pattern. Lower wins.
 *
 * Not the heaviest: a leg press moves more absolute weight than a squat and a
 * lat pulldown more than a pull-up, so "heaviest in the pattern" quietly hands
 * every slot to the machines. The bar comes first, then free weights, then the
 * stack. Anything unlabelled — most bodyweight work — sits between dumbbells
 * and cables, which is about where a pull-up belongs.
 */
const EQUIPMENT: Record<string, number> = {
  barbell: 0, "ez bar": 0.5, trap: 0.5, dumbbell: 1, kettlebell: 1,
  smith: 2.5, cable: 3, machine: 3.5, band: 4,
};

function equipmentRank(exercise: string): number {
  const kit = /\(([^)]+)\)\s*$/.exec(exercise)?.[1]?.toLowerCase() ?? "";
  for (const [name, rank] of Object.entries(EQUIPMENT)) if (kit.includes(name)) return rank;
  return 2;
}

export function mainLifts(progress: Progress, count = 4): LiftTrend[] {
  // Ranking by how often a lift is trained sounds right and is not: a face
  // pull and a calf raise are in every session, so they beat the squat on
  // frequency and the row ends up headlined "Standing Calf Raise +14 lb".
  // One lift per pattern is what the question means.
  const better = (a: LiftTrend, b: LiftTrend) => {
    const rankA = equipmentRank(a.exercise);
    const rankB = equipmentRank(b.exercise);
    if (rankA !== rankB) return rankA < rankB ? a : b;
    if (a.sessions !== b.sessions) return a.sessions > b.sessions ? a : b;
    return a.last >= b.last ? a : b;
  };
  const byPattern = new Map<Pattern, LiftTrend>();
  for (const lift of progress.lifts) {
    const pattern = movementPattern(lift.exercise);
    if (!BIG.includes(pattern)) continue;
    const held = byPattern.get(pattern);
    byPattern.set(pattern, held ? better(lift, held) : lift);
  }
  const picked = BIG.map(pattern => byPattern.get(pattern)).filter((lift): lift is LiftTrend => Boolean(lift));
  if (picked.length >= count) return picked.slice(0, count);
  // A record with no barbell work still deserves a row, so the rest is filled
  // with whatever was trained most.
  const rest = [...progress.lifts]
    .filter(lift => !picked.includes(lift))
    .sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise));
  return [...picked, ...rest].slice(0, count);
}

/** An estimated max is not accurate to the tenth of a pound; it reads as if it were. */
const round = (value: number) => Math.round(value);

/** How much a lift moved, in the unit it is loaded with. */
export function liftDelta(lift: LiftTrend): { text: string; direction: "up" | "flat" | "down" } {
  // Taken from the rounded endpoints, so the arithmetic on screen adds up.
  const change = round(lift.last) - round(lift.first);
  if (lift.assisted) {
    // Less assistance is progress, so the sign is inverted before it is read.
    const direction = change < 0 ? "up" : change > 0 ? "down" : "flat";
    return { text: change === 0 ? "held" : `${Math.abs(change)} lb ${change < 0 ? "less" : "more"} help`, direction };
  }
  const unit = lift.bodyweight ? "reps" : "lb";
  if (change === 0) return { text: "held", direction: "flat" };
  return { text: `${change > 0 ? "+" : "−"}${Math.abs(change)} ${unit}`, direction: change > 0 ? "up" : "down" };
}

/** Its start and finish, labelled as the estimate it is. */
export function liftSpan(lift: LiftTrend): string {
  if (lift.bodyweight) return `${round(lift.first)} → ${round(lift.last)} reps`;
  if (lift.assisted) return `${round(lift.first)} → ${round(lift.last)} lb help`;
  return `${round(lift.first)} → ${round(lift.last)} lb`;
}

export function liftName(exercise: string): string {
  return exercise.replace(/\s*\([^)]+\)$/, "");
}

export function strengthFacts(state: HealthState, today: string, weeks: number): StrengthFacts {
  const progress = buildProgress(state, today, weeks);
  const window = `${progress.weeks} weeks to ${dateLabel(progress.end, { month: "short", day: "numeric" })}`;
  if (!progress.lifts.length) {
    return {
      headline: "Not measurable yet",
      subline: "Needs 3 sessions of a lift",
      tone: "empty",
      window: `${weeks} weeks`,
      progress,
    };
  }
  // The headline names one lift and the weight it moved, because that is a
  // fact you can check against the bar. A faller wins the slot over a riser of
  // the same size: it is the one of the two you might need to do something
  // about.
  const main = mainLifts(progress);
  const scored = main.map(lift => ({ lift, delta: liftDelta(lift) }));
  const falling = scored.filter(entry => entry.delta.direction === "down");
  const pick = (falling.length ? falling : scored.filter(entry => entry.delta.direction !== "flat"))
    .sort((a, b) => Math.abs(Math.round(b.lift.last) - Math.round(b.lift.first)) - Math.abs(Math.round(a.lift.last) - Math.round(a.lift.first)))[0];
  return {
    headline: pick ? `${liftName(pick.lift.exercise)} ${pick.delta.text}` : "Holding steady",
    // The table below names every lift, so repeating the winner here would be
    // saying the same thing twice. What it cannot say is what the four are.
    subline: pick
      ? `Biggest move of your ${main.length} main ${main.length === 1 ? "lift" : "lifts"}`
      : `${main.length} main ${main.length === 1 ? "lift" : "lifts"}, none moved`,
    tone: falling.length ? "warn" : "neutral",
    window,
    progress,
  };
}

/**
 * The main lifts, named, with the weight on the bar at each end.
 *
 * Two designs failed here before this one. A sparkline with no axis and no
 * endpoints was a shape you could not read a number off. Fifteen identical
 * marks, one a lift, could be counted against the line above it but told you
 * nothing about WHICH lift — and "13 up · 0 down · 2 holding" is a way of
 * scoring a spreadsheet, not a way of thinking about training. Nobody wants to
 * know how many of their movements are rising. They want to know what the
 * squat is doing.
 */
export function StrengthSpark({ state, today, weeks }: { state: HealthState; today: string; weeks: number }) {
  const progress = useMemo(() => buildProgress(state, today, weeks), [state, today, weeks]);
  const main = useMemo(() => mainLifts(progress), [progress]);
  if (!main.length) return null;
  return <ul className="lift-table">
    {main.map(lift => {
      const delta = liftDelta(lift);
      return <li key={lift.exercise}>
        <span className="lift-table-name">{liftName(lift.exercise)}</span>
        <span className="lift-table-span">{liftSpan(lift)}</span>
        <span className={`lift-table-delta is-${delta.direction}`}>{delta.text}</span>
      </li>;
    })}
    <li className="mini-key">Squat, hinge, press and pull · estimated max, start → now</li>
  </ul>;
}

export type Record30 = { exercise: string; weightLb: number; reps: number; date: string; beat: number | null };

/**
 * A lift's heaviest set ever, where it happened in the last 30 days.
 *
 * The mark it beat is the point: "190 lb × 5" alone is a number, "beat 185" is
 * an event. Computed from the log rather than stored, so it cannot drift.
 */
export function recentRecords(state: HealthState, today: string): Record30[] {
  const byExercise = new Map<string, typeof state.workoutSets>();
  for (const set of state.workoutSets) {
    if (set.date > today || typeof set.weightLb !== "number" || set.weightLb <= 0) continue;
    const list = byExercise.get(set.exercise);
    if (list) list.push(set);
    else byExercise.set(set.exercise, [set]);
  }
  const out: Record30[] = [];
  for (const [exercise, entries] of byExercise) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    let best = 0;
    let record: Record30 | null = null;
    for (const set of sorted) {
      const weight = set.weightLb as number;
      if (weight <= best) continue;
      record = { exercise, weightLb: weight, reps: set.reps ?? 0, date: set.date, beat: best || null };
      best = weight;
    }
    if (record && record.beat !== null && daysAgo(record.date, today) <= 30) out.push(record);
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

function daysAgo(date: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}
