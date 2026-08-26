"use client";

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { HealthState, addDays, dateLabel, preferredSleepEntries } from "../health-model";
import { Icon } from "./icons";
import { formatMetric } from "./format";
import type { DailyMetric } from "./types";

export type DataPoint = { date: string; value: number | null };

export function sleepSeries(state: HealthState, end: string, days: number): DataPoint[] {
  const sleep = new Map(preferredSleepEntries(state.sleepEntries).map((entry) => [entry.date, entry]));
  return datesEndingAt(end, days).map((date) => ({ date, value: sleep.get(date)?.durationHours ?? null }));
}

export function dailySeries(state: HealthState, metric: DailyMetric, end: string, days: number): DataPoint[] {
  const daily = new Map(state.dailyEntries.map((entry) => [entry.date, entry]));
  const nights = new Map(preferredSleepEntries(state.sleepEntries).map((entry) => [entry.date, entry]));
  return datesEndingAt(end, days).map((date) => {
    const day = daily.get(date);
    // A ring writes heart measures onto the night; a phone writes them onto the day.
    const night = nights.get(date);
    const value =
      day?.[metric] ??
      (metric === "restingHeartRate" ? night?.restingHeartRate : metric === "hrvMs" ? night?.hrvMs : null) ??
      null;
    return { date, value };
  });
}

function datesEndingAt(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => addDays(end, index - days + 1));
}

/** The same series a sighted reader sees in the chart, exposed as a real table. */
function ChartTable({ data, label, format }: { data: DataPoint[]; label: string; format: (value: number) => string }) {
  const recorded = data.filter((point) => point.value !== null);
  // A div wrapper, not the table itself: Chromium does not clip overflow on a
  // table box, so a bare hidden table still stretches the page's scroll height.
  return (
    <div className="visually-hidden">
      <table>
        <caption>{`${label} by day`}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{label}</th>
          </tr>
        </thead>
        <tbody>
          {recorded.map((point) => (
            <tr key={point.date}>
              <th scope="row">{dateLabel(point.date, { year: "numeric", month: "short", day: "numeric" })}</th>
              <td>{format(point.value as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Moves the readout between recorded points with the arrow, Home, and End keys. */
function useSeriesCursor(indexes: number[], fallback: number) {
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected !== null && indexes.includes(selected) ? selected : fallback;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!indexes.length) return;
    const position = indexes.indexOf(active);
    let next: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = indexes[Math.max(0, position - 1)];
    else if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = indexes[Math.min(indexes.length - 1, position + 1)];
    else if (event.key === "Home") next = indexes[0];
    else if (event.key === "End") next = indexes.at(-1)!;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
  }

  return { active, select: setSelected, onKeyDown };
}

/** Keeps the keyboard/readout cursor in the visible part of a horizontally scrolling phone chart. */
function useCursorScroll(active: number, points: number) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || node.scrollWidth <= node.clientWidth) return;
    const position = (active / Math.max(1, points - 1)) * node.scrollWidth;
    const edge = 44;
    if (position < node.scrollLeft + edge) node.scrollLeft = Math.max(0, position - edge);
    else if (position > node.scrollLeft + node.clientWidth - edge) {
      node.scrollLeft = Math.min(node.scrollWidth - node.clientWidth, position - node.clientWidth + edge);
    }
  }, [active, points]);

  return ref;
}

export function LineChart({ data, label, empty }: { data: DataPoint[]; label: string; empty: string }) {
  const gradientId = useId().replace(/:/g, "");
  const valid = useMemo(
    () =>
      data
        .map((point, index) => ({ ...point, index }))
        .filter((point): point is DataPoint & { value: number; index: number } => point.value !== null),
    [data],
  );
  const cursor = useSeriesCursor(
    valid.map((point) => point.index),
    valid.at(-1)?.index ?? 0,
  );
  const scroll = useCursorScroll(cursor.active, data.length);

  if (!valid.length) {
    return (
      <div className="chart-empty">
        <Icon name="chart" />
        <p>{empty}</p>
      </div>
    );
  }

  const width = 760;
  const height = 250;
  const right = 18;
  const top = 26;
  const bottom = 38;
  const values = valid.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = Math.max((maxValue - minValue) * 0.22, Math.abs(maxValue) * 0.06, 1);
  const min = Math.max(0, minValue - pad);
  const max = maxValue + pad;
  const gridlines = [0, 0.5, 1];
  const axisLabels = gridlines.map((portion) => formatMetric(label, max - portion * (max - min)));
  // A gutter fixed in advance clips five-figure volumes; size it to the labels
  // this chart will actually draw.
  const left = Math.max(46, Math.max(...axisLabels.map((text) => text.length)) * 6.2 + 10);
  const x = (index: number) => left + (index / Math.max(1, data.length - 1)) * (width - left - right);
  const y = (value: number) => top + ((max - value) / Math.max(0.001, max - min)) * (height - top - bottom);
  // A missing day is a gap, not a straight line between two readings. Keep the
  // runs separate so the picture says exactly what the table beneath it says.
  const runs = valid.reduce<Array<typeof valid>>((groups, point) => {
    const current = groups.at(-1);
    if (!current || point.index !== current.at(-1)!.index + 1) groups.push([point]);
    else current.push(point);
    return groups;
  }, []);
  const pathFor = (run: typeof valid) =>
    run.map((point, index) => `${index ? "L" : "M"} ${x(point.index)} ${y(point.value)}`).join(" ");
  const selectedPoint = valid.find((point) => point.index === cursor.active) ?? valid.at(-1)!;
  const format = (value: number) => formatMetric(label, value);

  return (
    <div
      className="line-chart"
      tabIndex={0}
      role="group"
      aria-label={`${label} trend. Use the arrow keys to move between recorded days.`}
      onKeyDown={cursor.onKeyDown}
    >
      <div className="chart-readout" aria-live="polite">
        <b>{format(selectedPoint.value)}</b>
        <span>{dateLabel(selectedPoint.date, { weekday: "short", month: "short", day: "numeric" })}</span>
      </div>
      <div className="chart-scroll" ref={scroll}>
        <svg
          className="chart-plot"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pressed = ((event.clientX - bounds.left) / bounds.width) * width;
            const nearest = valid.reduce((best, point) =>
              Math.abs(x(point.index) - pressed) < Math.abs(x(best.index) - pressed) ? point : best,
            );
            cursor.select(nearest.index);
          }}
        >
          <defs>
            <linearGradient id={`fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-line)" stopOpacity=".24" />
              <stop offset="100%" stopColor="var(--chart-line)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridlines.map((portion, index) => {
            const lineY = top + portion * (height - top - bottom);
            return (
              <g key={portion}>
                <line x1={left} x2={width - right} y1={lineY} y2={lineY} className="grid-line" />
                <text x={left - 8} y={lineY + 4} textAnchor="end" className="axis-label">
                  {axisLabels[index]}
                </text>
              </g>
            );
          })}
          {runs.map((run) => {
            const path = pathFor(run);
            return (
              <g key={run[0].date}>
                <path
                  className="line-area"
                  d={`${path} L ${x(run.at(-1)!.index)} ${height - bottom} L ${x(run[0].index)} ${height - bottom} Z`}
                  fill={`url(#fill-${gradientId})`}
                />
                <path d={path} className="line-path" />
              </g>
            );
          })}
          {valid.map((point) => (
            <circle
              key={point.date}
              cx={x(point.index)}
              cy={y(point.value)}
              r={cursor.active === point.index ? 6 : 4}
              className={cursor.active === point.index ? "point selected" : "point"}
            >
              <title>
                {dateLabel(point.date)}: {format(point.value)}
              </title>
            </circle>
          ))}
          <text x={left} y={height - 12} className="axis-label">
            {dateLabel(data[0].date)}
          </text>
          <text x={width - right} y={height - 12} textAnchor="end" className="axis-label">
            {dateLabel(data.at(-1)!.date)}
          </text>
        </svg>
      </div>
      <ChartTable data={data} label={label} format={format} />
    </div>
  );
}

export function SleepChart({ data, goal }: { data: DataPoint[]; goal: number }) {
  const recorded = data.map((point, index) => ({ ...point, index })).filter((point) => point.value !== null);
  const cursor = useSeriesCursor(
    recorded.map((point) => point.index),
    recorded.at(-1)?.index ?? 0,
  );
  const scroll = useCursorScroll(cursor.active, data.length);

  if (!recorded.length) {
    return (
      <div className="chart-empty">
        <Icon name="moon" />
        <p>No sleep data in this period.</p>
      </div>
    );
  }

  const width = 760;
  const height = 250;
  const left = 40;
  const right = 18;
  const top = 26;
  const bottom = 38;
  const max = Math.max(12, goal + 1, ...data.map((point) => point.value ?? 0));
  const xSpace = (width - left - right) / Math.max(1, data.length);
  const barWidth = Math.max(3, Math.min(22, xSpace * 0.62));
  const y = (value: number) => top + ((max - value) / max) * (height - top - bottom);
  const goalY = y(goal);
  const selectedPoint = data[cursor.active];
  const format = (value: number) => `${value.toFixed(1)} h`;

  return (
    <div
      className="sleep-chart"
      tabIndex={0}
      role="group"
      aria-label="Sleep duration by night. Use the arrow keys to move between recorded nights."
      onKeyDown={cursor.onKeyDown}
    >
      <div className="chart-readout" aria-live="polite">
        <b>{selectedPoint?.value === null || !selectedPoint ? "—" : format(selectedPoint.value)}</b>
        <span>
          {selectedPoint
            ? dateLabel(selectedPoint.date, { weekday: "short", month: "short", day: "numeric" })
            : "Select a night"}
        </span>
      </div>
      <div className="chart-scroll" ref={scroll}>
        <svg
          className="chart-plot"
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pressed = ((event.clientX - bounds.left) / bounds.width) * width;
            const nearest = recorded.reduce((best, point) => {
              const pointX = left + point.index * xSpace + xSpace / 2;
              const bestX = left + best.index * xSpace + xSpace / 2;
              return Math.abs(pointX - pressed) < Math.abs(bestX - pressed) ? point : best;
            });
            cursor.select(nearest.index);
          }}
        >
          <line x1={left} x2={width - right} y1={goalY} y2={goalY} className="goal-line" />
          <text x={width - right} y={goalY - 7} textAnchor="end" className="goal-label">
            {goal}h goal
          </text>
          {data.map((point, index) => {
            const barX = left + index * xSpace + xSpace / 2 - barWidth / 2;
            const value = point.value ?? 0;
            const missing = point.value === null;
            return (
              <rect
                key={point.date}
                x={barX}
                y={missing ? height - bottom - 2 : y(value)}
                width={barWidth}
                height={missing ? 2 : height - bottom - y(value)}
                rx={barWidth / 2}
                className={`${missing ? "sleep-bar missing" : value >= goal ? "sleep-bar goal" : "sleep-bar"} ${
                  cursor.active === index && !missing ? "selected" : ""
                }`}
              >
                <title>
                  {dateLabel(point.date)}: {missing ? "No data" : format(value)}
                </title>
              </rect>
            );
          })}
          <text x={left} y={height - 12} className="axis-label">
            {dateLabel(data[0].date)}
          </text>
          <text x={width - right} y={height - 12} textAnchor="end" className="axis-label">
            {dateLabel(data.at(-1)!.date)}
          </text>
        </svg>
      </div>
      <ChartTable data={data} label="Sleep" format={format} />
    </div>
  );
}

/** A compact history line for one repeated lab marker. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 92;
  const height = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.0001);
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 3 - ((value - min) / span) * (height - 6);
      return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <path d={path} />
    </svg>
  );
}
