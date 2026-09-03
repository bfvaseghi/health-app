"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import { compareDailyMetric } from "../health-model";
import { dailySeries } from "./charts";
import { PeriodPicker } from "./primitives";
import { Tide } from "./tide";
import { formatMetric } from "./format";
import type { DailyMetric, Period } from "./types";

type Definition = { metric: DailyMetric; label: string; unit: string };

/** Smallest useful vertical range, in each metric's own unit, so a steady weight draws steady. */
const MINIMUM_SPAN: Record<DailyMetric, number> = {
  weightLb: 5,
  bodyFatPercent: 2,
  proteinG: 30,
  steps: 3_000,
  restingHeartRate: 10,
  hrvMs: 20,
};

/**
 * One panel drives every set of daily numbers: pick a metric, pick a period,
 * read the tide and the week-on-week change. Sleep and Fitness both use it, so
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
  const recorded = series.filter((point): point is { date: string; value: number } => point.value !== null);
  const changes = metrics
    .map((entry) => ({ entry, comparison: compareDailyMetric(state.dailyEntries, entry.metric, today) }))
    .filter(({ comparison }) => comparison.current !== null);

  // The drawn range never shrinks below a few units, or rounding noise reads
  // as a body in trouble.
  const values = recorded.map((point) => point.value);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const shortfall = Math.max(0, MINIMUM_SPAN[metric] - (high - low)) / 2;
  const margin = Math.max(shortfall, (high - low) * 0.2 || MINIMUM_SPAN[metric] / 4);

  return (
    <section className="tl-section" aria-label={definition.label}>
      <div className="tl-section-head">
        <div className="tl-tabs" role="tablist" aria-label="Metric">
          {metrics.map((entry) => (
            <button
              key={entry.metric}
              type="button"
              role="tab"
              aria-selected={metric === entry.metric}
              className={metric === entry.metric ? "active" : ""}
              onClick={() => setMetric(entry.metric)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="tl-section-head" style={{ marginTop: 14 }}>
        <span className="tl-caps">{`${definition.label} · ${period} days`}</span>
        <span className="tl-meta">{recorded.length ? `${recorded.length} readings` : "nothing recorded"}</span>
      </div>
      <Tide
        data={series}
        label={definition.label}
        unit={definition.unit ? ` ${definition.unit}` : ""}
        min={low - margin}
        max={high + margin}
        format={(value) => formatMetric(definition.label, value).replace(/\s*[a-z%]+$/i, "")}
        empty={emptyHint}
      />

      {/* A card per metric reading "— / not enough days" is four ways of saying
          nothing, stacked. The ones with a number are the sentence. */}
      {changes.length ? (
        <p className="tl-line">
          {changes.map(({ entry, comparison }, index) => (
            <span key={entry.metric}>
              {index ? " · " : ""}
              {`${entry.label} `}
              <b>{formatMetric(entry.label, comparison.current as number)}</b>
              {comparison.change === null
                ? ""
                : ` (${comparison.change > 0 ? "+" : ""}${
                    Math.abs(comparison.change) < 10 ? comparison.change.toFixed(1) : Math.round(comparison.change)
                  } from last week)`}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}
