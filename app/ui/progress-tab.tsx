"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import { dateLabel } from "../health-model";
import type { LiftTrend } from "../training/progress";
import { buildProgress } from "../training/progress";
import { Empty } from "./primitives";

const WINDOWS = [8, 12, 26];
const VISIBLE_LIFTS = 8;

/**
 * Whether the lifts are moving.
 *
 * One line per movement, drawn session by session, so the answer to "am I
 * getting stronger" is the shape of the line rather than a number to be taken
 * on trust.
 */
export function ProgressTab({ state, today }: { state: HealthState; today: string }) {
  const [weeks, setWeeks] = useState(12);
  const [allLifts, setAllLifts] = useState(false);
  const progress = useMemo(() => buildProgress(state, today, weeks), [state, today, weeks]);

  const shown = allLifts ? progress.lifts : progress.lifts.slice(0, VISIBLE_LIFTS);
  const holding = progress.lifts.length - progress.rising - progress.falling;

  return (
    <>
      <div className="progress-head">
        <div className="range-picker" role="group" aria-label="Period">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === weeks ? "active" : ""}
              aria-pressed={value === weeks}
              onClick={() => setWeeks(value)}
            >
              {`${value}w`}
            </button>
          ))}
        </div>
        <span className="progress-range">
          {`${dateLabel(progress.start, { month: "short", day: "numeric" })} – ${dateLabel(progress.end, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`}
        </span>
      </div>

      {progress.lifts.length ? (
        <>
          <h2 className="tl-hero" style={{ marginTop: 14 }}>
            {progress.rising === progress.lifts.length
              ? "Every lift going up."
              : progress.rising === 0
                ? holding === progress.lifts.length
                  ? "Holding steady."
                  : `${progress.falling} of ${progress.lifts.length} lifts slipping.`
                : `${progress.rising} of ${progress.lifts.length} lifts going up.`}
          </h2>
          <p className="tl-lede">
            {progress.falling ? <><b>{progress.falling}</b>{` ${progress.falling === 1 ? "is" : "are"} down, `}</> : ""}
            <b>{holding}</b>
            {` holding · strength `}
            <b>{progress.trendPercent === null ? "—" : `${progress.trendPercent > 0 ? "+" : ""}${progress.trendPercent}%`}</b>
            {` for the typical lift over ${progress.weeks} weeks`}
            {progress.volume.to === null ? "" : (
              <>
                {" · "}
                <b>{`${Math.round(progress.volume.to / 100) / 10}k lb`}</b>
                {" a week now"}
                {progress.volume.change === null ? "" : ` (${progress.volume.change > 0 ? "+" : ""}${Math.round(progress.volume.change / 100) / 10}k)`}
              </>
            )}
          </p>

          <section className="tl-section" aria-label="Every lift, session by session">
            <div className="tl-section-head">
              <span className="tl-caps">Every lift · session by session</span>
              <span className="tl-meta">{`over ${progress.weeks}w · now`}</span>
            </div>
            <div className="trend-head">
              <span />
              <span />
              <span>Over {progress.weeks}w</span>
              <span>Now</span>
            </div>
            <ul className="trend-list">
              {shown.map((lift) => (
                <Row key={lift.exercise} lift={lift} />
              ))}
            </ul>
            {progress.lifts.length > VISIBLE_LIFTS ? (
              <div className="list-more">
                <button type="button" className="button secondary" onClick={() => setAllLifts((value) => !value)}>
                  {allLifts ? "Fewer" : `All ${progress.lifts.length}`}
                </button>
              </div>
            ) : null}
            <p className="balance-legend">
              Each point is the estimated one-rep max of that session&rsquo;s best set — reps, for bodyweight moves.
            </p>
          </section>
        </>
      ) : (
        <section className="panel wide-panel">
          <Empty
            icon="dumbbell"
            title="Not enough sessions yet"
            body="Three sessions of a lift are needed before a direction means anything. Widen the period, or import more."
          />
        </section>
      )}
    </>
  );
}

/** One movement: its name, its line, where it went and where it is. */
function Row({ lift }: { lift: LiftTrend }) {
  const unit = lift.bodyweight ? "reps" : "lb";
  return (
    <li className={`trend-row ${lift.direction}`}>
      <span className="trend-name">
        {lift.exercise}
        <small>{`${lift.sessions} sessions`}</small>
      </span>
      <Spark lift={lift} />
      <span className="trend-percent">{`${lift.percent > 0 ? "+" : ""}${lift.percent}%`}</span>
      <span className="trend-value">
        {lift.last}
        <small>{unit}</small>
      </span>
    </li>
  );
}

/**
 * The trajectory itself. Drawn against its own range rather than a shared one,
 * because the shape is the point — the size of the move is the number beside it.
 *
 * With one exception: the range it is drawn against never shrinks below a few
 * percent of the lift. Otherwise a movement that has held within a pound of
 * itself all block would fill the box with a jagged line, and rounding noise
 * would read as a lift in trouble.
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
  const x = (index: number) =>
    values.length < 2 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
  // Centred on the middle of the lift's own range, so a small move draws small
  // and a real one fills the box.
  const y = (value: number) => height / 2 - ((value - middle) / span) * (height - pad * 2);
  const line = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const last = values.length - 1;

  return (
    // The numbers either side of it say the same thing in words.
    <svg className="lift-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} />
      {/* Zero-length segments keep their round shape when the box stretches.
          Every session remains visible; the larger final mark says "now". */}
      {values.map((value, index) => (
        <line
          key={lift.points[index].date}
          className={index === last ? "current" : undefined}
          x1={x(index)}
          y1={y(value)}
          x2={x(index)}
          y2={y(value)}
        />
      ))}
    </svg>
  );
}
