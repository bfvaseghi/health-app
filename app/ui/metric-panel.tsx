"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import { compareDailyMetric } from "../health-model";
import { LineChart, dailySeries } from "./charts";
import { PeriodPicker } from "./primitives";
import { formatMetric } from "./format";
import type { DailyMetric, Period } from "./types";

type Definition = { metric: DailyMetric; label: string; unit: string };

const CHART_RULES: Record<DailyMetric, { maximumGap: number; minimumSpan: number }> = {
  weightLb: { maximumGap: 6, minimumSpan: 5 },
  bodyFatPercent: { maximumGap: 13, minimumSpan: 2 },
  proteinG: { maximumGap: 2, minimumSpan: 30 },
  steps: { maximumGap: 1, minimumSpan: 3_000 },
  restingHeartRate: { maximumGap: 2, minimumSpan: 10 },
  hrvMs: { maximumGap: 2, minimumSpan: 20 },
};

/**
 * One panel drives every set of daily numbers: pick a metric, pick a period,
 * read the line and the week-on-week change. Sleep and Fitness both use it, so
 * the two pages behave the same way rather than being near-copies.
 */
export function MetricPanel({
  state,
  today,
  metrics,
  emptyHint,
}: {
  state: HealthState;
  today: string;
  metrics: Definition[];
  emptyHint: string;
}) {
  // Open on something the user actually has: a ring reports heart measures long
  // before it reports a weight, and an empty chart is a poor first impression.
  const [metric, setMetric] = useState<DailyMetric>(
    () =>
      metrics.find((entry) => dailySeries(state, entry.metric, today, 90).some((point) => point.value !== null))?.metric ??
      metrics[0].metric,
  );
  const [period, setPeriod] = useState<Period>(30);

  const definition = metrics.find((entry) => entry.metric === metric) ?? metrics[0];
  const series = useMemo(() => dailySeries(state, metric, today, period), [state, metric, today, period]);
  const recorded = series.filter((point) => point.value !== null);
  const changes = metrics
    .map((entry) => ({ entry, comparison: compareDailyMetric(state.dailyEntries, entry.metric, today) }))
    .filter(({ comparison }) => comparison.current !== null);

  return (
    <section className="panel wide-panel">
      <div className="panel-head wrap">
        <div className="metric-tabs" role="group" aria-label="Metric">
          {metrics.map((entry) => (
            <button
              key={entry.metric}
              type="button"
              className={metric === entry.metric ? "active" : ""}
              aria-pressed={metric === entry.metric}
              onClick={() => setMetric(entry.metric)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="trend-title">
        <p className="kicker">{definition.label}</p>
        <h2>{recorded.length ? `${period}-day view` : "Nothing recorded yet"}</h2>
      </div>

      <LineChart
        data={series}
        label={definition.label}
        empty={emptyHint}
        maximumGap={CHART_RULES[metric].maximumGap}
        minimumSpan={CHART_RULES[metric].minimumSpan}
      />

      {/* A card per metric reading "— / not enough days" is four ways of saying
          nothing, stacked. The ones with a number are the row; if none have
          one, the chart above has already said so. */}
      {changes.length ? (
        <div className="change-row">
          {changes.map(({ entry, comparison }) => {
          return (
              <article key={entry.metric} className="change-card">
                <span>{entry.label}</span>
                <strong>{formatMetric(entry.label, comparison.current as number)}</strong>
                <small>
                  {comparison.change === null
                    ? "not enough days"
                    : `${comparison.change > 0 ? "+" : ""}${
                        Math.abs(comparison.change) < 10 ? comparison.change.toFixed(1) : Math.round(comparison.change)
                      } from last week`}
                </small>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
