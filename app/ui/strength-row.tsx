"use client";

import { useMemo } from "react";
import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { LiftTrend, Progress } from "../training/progress";
import { buildProgress, strengthIndex } from "../training/progress";
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
 * Whether the lifts are moving, said as one verdict and one count that adds up.
 *
 * The count used to name only risers and fallers, so the lifts holding steady
 * vanished and the fraction on screen described fewer movements than had been
 * trained. Excluded lifts are counted separately rather than folded in, because
 * "not measurable" is not the same claim as "not moving".
 */
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
  const holding = progress.lifts.length - progress.rising - progress.falling;
  const trend = progress.trendPercent;
  return {
    headline: trend === null ? "No change" : trend > 0 ? `Up ${trend}%` : trend < 0 ? `Down ${Math.abs(trend)}%` : "Flat",
    subline: `${progress.rising} up · ${progress.falling} down · ${holding} holding`,
    tone: progress.falling > progress.rising ? "warn" : "neutral",
    window,
    progress,
  };
}

/**
 * The verdict as one mark a lift: rising, holding, falling.
 *
 * It used to be a sparkline with no axis, no scale and no endpoints — a shape
 * you could not read a number off, sitting under a percentage you could not
 * check against it. These segments are the same fifteen lifts the line above
 * counts, so "13 up · 0 down · 2 holding" is something you can verify by
 * looking. The trajectories live inside, where each has its own row.
 */
export function StrengthSpark({ state, today, weeks }: { state: HealthState; today: string; weeks: number }) {
  const progress = useMemo(() => buildProgress(state, today, weeks), [state, today, weeks]);
  if (!progress.lifts.length) return null;
  const order = { up: 0, flat: 1, down: 2 } as const;
  const lifts = [...progress.lifts].sort((a, b) => order[a.direction] - order[b.direction]);
  return <div className="lift-marks">
    {lifts.map(lift => (
      <span key={lift.exercise} className={`is-${lift.direction}`} title={`${lift.exercise}: ${lift.percent > 0 ? "+" : ""}${lift.percent}%`} />
    ))}
    <span className="mini-key">One mark a lift · {progress.rising} rising, {progress.lifts.length - progress.rising - progress.falling} holding, {progress.falling} falling</span>
  </div>;
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

    <section className="tl-section progress-overall" aria-label="Overall strength">
      <div className="tl-section-head"><span className="tl-caps">Overall · median of {trainedThisWindow} measured lifts</span></div>
      <Tide data={index} label="Weekly best, median change from the first week of the window" unit="%" format={value => `${value >= 100 ? "+" : ""}${Math.round((value - 100) * 10) / 10}`} />
    </section>

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
  const width = 132;
  const height = 30;
  const pad = 4;
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
