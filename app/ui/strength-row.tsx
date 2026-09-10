"use client";

import { useMemo } from "react";
import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { LiftTrend, Progress } from "../training/progress";
import { buildProgress, strengthIndex } from "../training/progress";
import type { Pattern } from "../training/movement";
import { movementPattern } from "../training/movement";
import { Tide } from "./tide";

const WINDOWS = [8, 12, 26];

const REASONS: Record<string, string> = {
  sessions: "fewer than 3 sessions",
  reps: "reps too high to estimate a max",
  assistance: "assistance changed mid-window",
};

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

export function StrengthBody({
  state, today, weeks, onWeeks, facts,
}: {
  state: HealthState;
  today: string;
  weeks: number;
  onWeeks: (weeks: number) => void;
  facts: StrengthFacts;
}) {
  const progress = facts.progress;
  const index = useMemo(() => strengthIndex(state, today, weeks), [state, today, weeks]);
  const records = useMemo(() => recentRecords(state, today), [state, today]);
  const trainedThisWindow = progress.lifts.length;

  const groups: Array<{ key: "down" | "up" | "flat"; label: string; lifts: LiftTrend[] }> = [
    { key: "down", label: "Falling", lifts: progress.lifts.filter(lift => lift.direction === "down") },
    { key: "up", label: "Rising", lifts: progress.lifts.filter(lift => lift.direction === "up") },
    { key: "flat", label: "Holding", lifts: progress.lifts.filter(lift => lift.direction === "flat") },
  ];

  return <>
    <label className="plan-field inline-field">
      <span>Window</span>
      <select aria-label="Window" value={weeks} onChange={event => onWeeks(Number(event.target.value))}>
        {WINDOWS.map(value => <option key={value} value={value}>{value} weeks</option>)}
      </select>
    </label>

    {/* Falls before gains — he asked for falls by name, and they used to be
        forty rows down a list sorted by the size of the move — and each group
        behind a label carrying its own count, so fifteen sparklines are never
        the thing that greets you. Falling opens itself, because a fall is the
        only one of the three you might need to do something about. */}
    {groups.filter(group => group.lifts.length).map(group => (
      <details key={group.key} className="counted-fold" open={group.key === "down"}>
        <summary>{group.label} ({group.lifts.length})</summary>
        <ul className="trend-list">{group.lifts.map(lift => <Row key={lift.exercise} lift={lift} weeks={progress.weeks} />)}</ul>
      </details>
    ))}

    {progress.excluded.length ? <details className="counted-fold"><summary>Not measured ({progress.excluded.length})</summary>
      <ul className="excluded-list">{progress.excluded.map(entry => (
        <li key={entry.exercise}><span>{entry.exercise}</span><small>{REASONS[entry.reason]}</small></li>
      ))}</ul>
    </details> : null}

    {records.length ? <details className="counted-fold"><summary>Records ({records.length})</summary>
      <ul className="excluded-list">{records.map(record => (
        <li key={`${record.exercise}:${record.date}`}>
          <span>{record.exercise}</span>
          <small>{record.weightLb} lb × {record.reps} · {dateLabel(record.date, { month: "short", day: "numeric" })}{record.beat === null ? "" : ` · beat ${record.beat} lb`}</small>
        </li>
      ))}</ul>
    </details> : null}

    {/* Last, and folded. A median across every movement is a statistic about
        the spreadsheet — it moves when a lateral raise does. It is worth
        having, and it is not worth leading with. */}
    <details className="counted-fold"><summary>Everything together ({trainedThisWindow})</summary>
      <p className="chart-key-caption">Median change from the first week of the window, across the {trainedThisWindow} measured {trainedThisWindow === 1 ? "lift" : "lifts"}.</p>
      <Tide data={index} label="Weekly best, median change from the first week of the window" unit="%" format={value => `${value >= 100 ? "+" : ""}${Math.round((value - 100) * 10) / 10}`} />
    </details>
  </>;
}

type Record30 = { exercise: string; weightLb: number; reps: number; date: string; beat: number | null };

/**
 * A lift's heaviest set ever, where it happened in the last 30 days.
 *
 * The mark it beat is the point: "190 lb × 5" alone is a number, "beat 185" is
 * an event. Computed from the log rather than stored, so it cannot drift.
 */
function recentRecords(state: HealthState, today: string): Record30[] {
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

/** One movement: its name, its line, where it went and where it is. */
function Row({ lift, weeks }: { lift: LiftTrend; weeks: number }) {
  // "est. max" is the two-word fix for a lift reported at 300 lb on one screen
  // and prescribed at 225 lb on another, both printed as a bare "lb".
  const value = lift.assisted ? `${lift.last} lb assistance` : lift.bodyweight ? `${lift.last} reps` : `est. max ${lift.last} lb`;
  const equipment = /\s*\(([^)]+)\)$/.exec(lift.exercise)?.[1];
  const name = equipment ? lift.exercise.replace(/\s*\([^)]+\)$/, "") : lift.exercise;
  return (
    <li className={`trend-row ${lift.direction}`}>
      <span className="trend-name">
        {name}
        <small>{equipment ? `${equipment} · ` : ""}{lift.sessions} sessions{lift.direction === "down" && lift.sessionsSincePeak > 0 ? ` · peaked ${lift.sessionsSincePeak} ago` : ""}</small>
      </span>
      <Spark lift={lift} />
      <span className="trend-percent">{lift.assisted
        ? `${Math.abs(Math.round((lift.last - lift.first) * 10) / 10)} lb ${lift.last < lift.first ? "less" : lift.last > lift.first ? "more" : "change"}`
        : `${lift.percent > 0 ? "+" : ""}${lift.percent}% over ${weeks}w`}</span>
      <span className="trend-value trend-est">{value}</span>
    </li>
  );
}

/**
 * The trajectory itself, drawn against its own range because the shape is the
 * point — the size of the move is the number beside it. The range never shrinks
 * below a few percent of the lift, so rounding noise on a flat movement does
 * not fill the box with a jagged line.
 */
const FLATTEST = 0.06;

function Spark({ lift }: { lift: LiftTrend }) {
  // The box used to be 132×30 stretched to full width with preserveAspectRatio
  // "none", so a twelve-week trajectory was squashed into a flat wobble and a
  // real gain looked like noise. A taller box, and a viewBox whose proportions
  // are close to the space it lands in, so the line is not distorted.
  const width = 320;
  const height = 56;
  const pad = 6;
  const values = lift.points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const span = Math.max(high - low, mean * FLATTEST) || 1;
  const middle = (high + low) / 2;
  const x = (index: number) => values.length < 2 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => height / 2 - ((value - middle) / span) * (height - pad * 2);
  const line = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const last = values.length - 1;

  return (
    <svg className="lift-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} />
      {values.map((value, index) => (
        <line
          key={`${lift.points[index].date}-${index}`}
          className={index === last ? "current" : undefined}
          x1={x(index)} y1={y(value)} x2={x(index)} y2={y(value)}
        />
      ))}
    </svg>
  );
}
