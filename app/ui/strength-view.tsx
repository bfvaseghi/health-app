"use client";

import { useMemo } from "react";
import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { LiftTrend } from "../training/progress";
import { buildProgress } from "../training/progress";
import { movementPattern, patternLabels } from "../training/movement";
import { Tide } from "./tide";
import { liftDelta, liftName, mainLifts, recentRecords } from "./strength-row";

const WINDOWS = [8, 12, 26];

const REASONS: Record<string, string> = {
  sessions: "fewer than 3 sessions",
  reps: "reps too high to estimate a max",
  assistance: "assistance changed mid-window",
};

/**
 * Every lift you train, one card each, drawn the same way.
 *
 * The strength row on Fitness has room for a verdict and four numbers. This is
 * the page where the question "how is each of my lifts going" gets the space it
 * needs: a name, what is on the bar now, what it did over the window, and the
 * trajectory itself at a size you can actually read — the same tide curve used
 * for sleep and weight, so the shape means the same thing everywhere.
 *
 * The four main patterns come first, because a squat is not a lateral raise;
 * the rest follow in the order they are trained. Nothing is a percentage: the
 * unit is the plate you put on.
 */
export function StrengthView({ state, today, weeks, onWeeks }: {
  state: HealthState;
  today: string;
  weeks: number;
  onWeeks: (weeks: number) => void;
}) {
  const progress = useMemo(() => buildProgress(state, today, weeks), [state, today, weeks]);
  const main = useMemo(() => mainLifts(progress), [progress]);
  const rest = useMemo(
    () => progress.lifts
      .filter(lift => !main.includes(lift))
      .sort((a, b) => b.sessions - a.sessions || a.exercise.localeCompare(b.exercise)),
    [progress, main],
  );
  const records = useMemo(() => recentRecords(state, today), [state, today]);

  if (!progress.lifts.length) {
    return <div className="strength-view">
      <WindowPicker weeks={weeks} onWeeks={onWeeks} />
      <p className="mind-status">Nothing measurable yet. A lift needs three sessions in the window before a line can be drawn through it.</p>
    </div>;
  }

  return <div className="strength-view">
    {/* The summary sits between the section's tabs and this control, so a row
        of chips directly under a row of tabs cannot read as more navigation. */}
    <p className="strength-window">{progress.weeks} weeks to {dateLabel(progress.end, { month: "long", day: "numeric" })} · {progress.lifts.length} {progress.lifts.length === 1 ? "lift" : "lifts"} measured</p>
    <WindowPicker weeks={weeks} onWeeks={onWeeks} />

    {main.length ? <section aria-label="Main lifts">
      <h3 className="strength-group"><span>Main lifts</span><small>squat · hinge · press · pull</small></h3>
      <div className="lift-cards">{main.map(lift => <LiftCard key={lift.exercise} lift={lift} />)}</div>
    </section> : null}

    {rest.length ? <section aria-label="Everything else">
      <h3 className="strength-group"><span>Everything else</span><small>{rest.length}</small></h3>
      {/* Smaller cards, same anatomy. The page needs a rhythm or fifteen
          identical blocks read as a wall; the four you build a week around
          earn the larger type. */}
      <div className="lift-cards is-quiet">{rest.map(lift => <LiftCard key={lift.exercise} lift={lift} compact />)}</div>
    </section> : null}

    {records.length ? <details className="counted-fold"><summary>Records ({records.length})</summary>
      <ul className="excluded-list">{records.map(record => (
        <li key={`${record.exercise}:${record.date}`}>
          <span>{record.exercise}</span>
          <small>{record.weightLb} lb × {record.reps} · {dateLabel(record.date, { month: "short", day: "numeric" })}{record.beat === null ? "" : ` · beat ${record.beat} lb`}</small>
        </li>
      ))}</ul>
    </details> : null}

    {progress.excluded.length ? <details className="counted-fold"><summary>Not measured ({progress.excluded.length})</summary>
      <ul className="excluded-list">{progress.excluded.map(entry => (
        <li key={entry.exercise}><span>{entry.exercise}</span><small>{REASONS[entry.reason]}</small></li>
      ))}</ul>
    </details> : null}
  </div>;
}

function WindowPicker({ weeks, onWeeks }: { weeks: number; onWeeks: (weeks: number) => void }) {
  return <div className="tl-tabs lens-tabs" role="group" aria-label="Window">
    {WINDOWS.map(value => (
      <button key={value} type="button" className={weeks === value ? "active" : ""} aria-pressed={weeks === value} onClick={() => onWeeks(value)}>
        {value} weeks
      </button>
    ))}
  </div>;
}

/**
 * One lift: where it stands, what it did, and the line it did it along.
 *
 * The headline number is the load, not a percent — a percent is a thing you
 * have to convert back into plates before it means anything. The peak is named
 * only when it is behind you, because that is the one case where the last
 * point does not tell the whole story.
 */
function LiftCard({ lift, compact = false }: { lift: LiftTrend; compact?: boolean }) {
  const delta = liftDelta(lift);
  const unit = lift.bodyweight ? "reps" : "lb";
  const name = liftName(lift.exercise);
  const equipment = /\(([^)]+)\)\s*$/.exec(lift.exercise)?.[1];
  const stalled = lift.direction !== "up" && lift.sessionsSincePeak > 0;
  const points = lift.points.map(point => ({ date: point.date, value: point.value }));
  // A squat's pattern is "Squat"; printing both reads as a stutter. It earns
  // its place on the accessories, where the name does not say what it is.
  const pattern = patternLabels[movementPattern(lift.exercise)];
  const kind = pattern.toLowerCase() === name.toLowerCase() ? null : pattern;
  const first = lift.points[0];
  const last = lift.points[lift.points.length - 1];
  // The drawn range. Tide's default pads a quarter of the spread at both ends,
  // which on a lift that sat flat and then jumped left the low run sitting on
  // the baseline as though it were zero. More room underneath than above lifts
  // the whole curve off the floor and gives the fill something to be, while
  // still keeping the peak clear of the top edge. A lift that never moved gets
  // a band around its own value instead, or it would be pinned there too.
  const values = lift.points.map(point => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const flat = high - low < 0.5;
  const spread = high - low;
  const range = flat
    ? { min: last.value - Math.max(2, Math.abs(last.value) * 0.04), max: last.value + Math.max(2, Math.abs(last.value) * 0.04) }
    : { min: low - spread * 0.34, max: high + spread * 0.20 };

  return (
    <article className={`lift-card is-${delta.direction}${compact ? " is-compact" : ""}`}>
      <header>
        <div className="lift-card-title">
          <h4>{name}</h4>
          <small>{[equipment, kind, `${lift.sessions} sessions`].filter(Boolean).join(" · ")}</small>
        </div>
        <div className="lift-card-now">
          <b>{Math.round(lift.last)}<span>{unit}</span></b>
          <small className={`lift-card-delta is-${delta.direction}`}>{delta.text}</small>
        </div>
      </header>

      <Tide
        data={points}
        label={`${name}, ${lift.bodyweight ? "reps" : "estimated max"} each session`}
        unit={` ${unit}`}
        format={value => String(Math.round(value))}
        dateFormat={{ month: "short", day: "numeric" }}
        readout={false}
        showValue={false}
        min={range.min}
        max={range.max}
        // A compact card is meant to be quieter, and a lift that never moved
        // needs least of all: at the full height its level line floated in an
        // empty white field, which reads as a chart that failed to draw rather
        // than as a lift that held. Shrunk to a slim band, the same line reads
        // as a deliberate flat. Set here rather than in CSS: the plot is an SVG
        // with a viewBox, so a pixel height in a stylesheet letterboxes it.
        height={flat ? 54 : compact ? 78 : 96}
      />

      {/* The two ends of the curve, under the ends of the curve. Where it began
          and where it is now, in the order the eye already read them — which
          the old "285 → 300 lb over 12 weeks" said in the middle of nowhere
          while repeating a number already twice the size above it. */}
      <footer>
        <span>{Math.round(first.value)} {unit} · {dateLabel(first.date, { month: "short", day: "numeric" })}</span>
        <span className="lift-card-end">{Math.round(last.value)} {unit} · {dateLabel(last.date, { month: "short", day: "numeric" })}</span>
      </footer>
      {stalled ? <p className="lift-card-peak">Best was {Math.round(lift.best)} {unit}, {lift.sessionsSincePeak} {lift.sessionsSincePeak === 1 ? "session" : "sessions"} ago</p> : null}
    </article>
  );
}
