"use client";

import { useId } from "react";
import { dateLabel } from "../health-model";
import type { DataPoint } from "./charts";

/**
 * The tide: Baseline's one signature graphic.
 *
 * A smooth curve with a soft fill and a lit point for now, drawn the same way
 * for sleep, strength, adherence and weight so the eye learns it once. It is a
 * shape to read, not a chart to study — the number beside the last point says
 * where things stand, the dashed hairline says what the goal is, and nothing
 * else competes. Marks are thin, the grid is a single baseline, and every
 * value is also in a real table for a screen reader.
 */
export function Tide({
  data,
  label,
  unit = "",
  goal = null,
  min,
  max,
  format = (value) => String(Math.round(value * 10) / 10),
  empty = "Nothing recorded yet.",
}: {
  data: DataPoint[];
  /** What the series is, for the hidden table and the accessible name. */
  label: string;
  unit?: string;
  goal?: number | null;
  /** Floor and ceiling of the drawn range; default to the data with a small margin. */
  min?: number;
  max?: number;
  format?: (value: number) => string;
  empty?: string;
}) {
  const gradientId = useId().replace(/:/g, "");
  const points = data.filter((point): point is DataPoint & { value: number } => point.value !== null);
  if (points.length < 2) {
    return <p className="tide-empty">{empty}</p>;
  }

  const width = 353;
  const height = 104;
  const pad = { l: 2, r: 52, t: 16, b: 14 };
  const values = points.map((point) => point.value);
  const lo = min ?? Math.min(...values, goal ?? Infinity) - (Math.max(...values) - Math.min(...values) || 1) * 0.25;
  const hi = max ?? Math.max(...values, goal ?? -Infinity) + (Math.max(...values) - Math.min(...values) || 1) * 0.25;
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const x = (index: number) => pad.l + (index / (points.length - 1)) * w;
  const y = (value: number) => pad.t + h - ((Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo || 1)) * h;
  const xy = points.map((point, index) => [x(index), y(point.value)] as const);

  // Catmull-Rom through every point, as cubic Béziers: the curve passes through
  // each recorded value rather than approximating it.
  let path = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let index = 0; index < xy.length - 1; index += 1) {
    const p0 = xy[index - 1] ?? xy[index];
    const p1 = xy[index];
    const p2 = xy[index + 1];
    const p3 = xy[index + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const baseline = pad.t + h + 6;
  const area = `${path} L${xy.at(-1)![0].toFixed(1)},${baseline} L${xy[0][0].toFixed(1)},${baseline} Z`;
  const last = xy.at(-1)!;
  const lastValue = points.at(-1)!.value;

  return (
    <figure className="tide" aria-label={`${label}: ${format(lastValue)}${unit} now`}>
      <svg viewBox={`0 0 ${width} ${height}`} className="tide-plot" aria-hidden="true">
        <defs>
          <linearGradient id={`tide-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tide-fill-0)" />
            <stop offset="1" stopColor="var(--tide-fill-1)" />
          </linearGradient>
        </defs>
        <line className="tide-base" x1={pad.l} y1={baseline} x2={pad.l + w} y2={baseline} />
        {goal !== null ? (
          <>
            <line className="tide-goal" x1={pad.l} y1={y(goal)} x2={pad.l + w} y2={y(goal)} />
            <text className="tide-goal-label" x={pad.l} y={Math.abs(y(points[0].value) - y(goal)) < 16 && y(points[0].value) <= y(goal) ? y(goal) + 13 : y(goal) - 6}>
              {`GOAL ${format(goal)}${unit.trim().toUpperCase()}`}
            </text>
          </>
        ) : null}
        <path className="tide-area" d={area} fill={`url(#tide-${gradientId})`} />
        <path className="tide-line" d={path} />
        <circle className="tide-now" cx={last[0]} cy={last[1]} r={4.5} />
        <text className="tide-value" x={last[0] + 10} y={last[1] + 4}>
          {format(lastValue)}
          <tspan className="tide-unit">{unit}</tspan>
        </text>
      </svg>
      <table className="visually-hidden">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{dateLabel(point.date, { month: "short", day: "numeric" })}</th>
              <td>{`${format(point.value)}${unit}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
