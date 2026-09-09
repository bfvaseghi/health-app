"use client";

import { useMemo, useState } from "react";
import { addDays, dateLabel, validIsoDate, type HealthState } from "../health-model";
import { comparePeriods, comparisonChange, comparisonToText, comparisonValue, type ComparisonDays, type ComparisonMetric } from "../period-comparison";
import { copyText } from "./format";
import { Icon } from "./icons";
import { RecordHeading } from "./primitives";
import { Tide } from "./tide";
import type { Modal } from "./types";

export function CompareView({ state, today, open, onNotice }: { state: HealthState; today: string; open: (modal: Modal) => void; onNotice: (message: string) => void }) {
  const [days, setDays] = useState<ComparisonDays>(28);
  const [laterEnd, setLaterEnd] = useState(today);
  const [earlierEnd, setEarlierEnd] = useState(addDays(today, -28));
  const [expanded, setExpanded] = useState<ComparisonMetric | null>("sleepHours");
  const [picked, setPicked] = useState<string | null>(null);
  const rows = useMemo(() => comparePeriods(state, earlierEnd, laterEnd, days), [state, earlierEnd, laterEnd, days]);
  const rangeLabel = (start: string, end: string) => `${dateLabel(start, { month: "short", day: "numeric" })} – ${dateLabel(end, { month: "short", day: "numeric", year: "numeric" })}`;
  const changeDays = (next: ComparisonDays) => {
    setDays(next);
    setEarlierEnd(addDays(laterEnd, -next));
    setPicked(null);
  };

  return (
    <div className="page tl-page compare-page">
      <RecordHeading title="Compare" detail="See how your record changes over time" action={<button type="button" className="text-button" onClick={async () => onNotice(await copyText(comparisonToText(rows)) ? "Comparison copied." : "Copy unavailable.")}><Icon name="copy" /> Copy</button>} />
      <section className="tl-section record-sheet" aria-label="Comparison periods">
        <div className="tl-section-head"><span className="tl-caps">Days per period</span><div className="tl-tabs" role="group" aria-label="Days per period">{([7, 28, 90] as const).map((option) => <button key={option} type="button" className={days === option ? "active" : ""} aria-pressed={days === option} onClick={() => changeDays(option)}>{option}</button>)}</div></div>
        <div className="comparison-dates">
          <label><span>Earlier ending</span><input type="date" aria-label="Earlier period ending" value={earlierEnd} max={addDays(laterEnd, -days)} onChange={(event) => { const value = event.target.value; if (validIsoDate(value) && value <= addDays(laterEnd, -days)) { setEarlierEnd(value); setPicked(null); } }} /></label>
          <label><span>Later ending</span><input type="date" aria-label="Later period ending" value={laterEnd} max={today} onChange={(event) => { const value = event.target.value; if (validIsoDate(value) && value <= today) { setLaterEnd(value); setEarlierEnd((current) => current < addDays(value, 1 - days) ? current : addDays(value, -days)); setPicked(null); } }} /></label>
        </div>
      </section>
      <div className="comparison-list record-sheet">
        {rows.map((row) => {
          const visible = expanded === row.key;
          const values = [...row.earlier.points, ...row.later.points].flatMap((point) => point.value === null ? [] : [point.value]);
          const low = values.length ? Math.min(...values) : 0;
          const high = values.length ? Math.max(...values) : 1;
          const padding = Math.max((high - low) * 0.15, 0.5);
          const minimum = Math.max(0, low - padding);
          const maximum = high + padding;
          return (
            <section key={row.key} className="comparison-metric">
              <button type="button" className="comparison-toggle" aria-expanded={visible} aria-controls={`comparison-${row.key}`} onClick={() => { setExpanded(visible ? null : row.key); setPicked(null); }}>
                <span><b>{row.label}</b><small>{row.summary} · {comparisonValue(row.earlier.value, row.unit, row.digits)} → {comparisonValue(row.later.value, row.unit, row.digits)}</small></span>
                <span className="comparison-change">{comparisonChange(row)}<Icon name="chevron" /></span>
              </button>
              {visible ? <div id={`comparison-${row.key}`} className="comparison-expanded">
                <div className="comparison-charts">{([['Earlier', row.earlier], ['Later', row.later]] as const).map(([label, reading]) => <div key={label}>
                  <div className="comparison-chart-head"><span className="tl-caps">{label}</span><b>{comparisonValue(reading.value, row.unit, row.digits)}</b></div>
                  <div className="comparison-range">{rangeLabel(reading.start, reading.end)}</div>
                  <Tide key={`${row.key}:${reading.end}:${days}`} data={reading.points} label={`${row.label}, ${label.toLowerCase()} period`} unit={row.unit ? ` ${row.unit}` : ""} min={minimum} max={maximum} format={(value) => value.toLocaleString("en-US", { maximumFractionDigits: row.digits })} onSelect={setPicked} readout={false} />
                  <div className="comparison-coverage">{row.key === "workouts" ? `On ${reading.recorded} of ${reading.possible} days` : row.key === "medication" ? `${reading.recorded} doses recorded` : `${reading.recorded}/${reading.possible} ${row.coverage} recorded`}</div>
                </div>)}</div>
                <div className="comparison-scale">Scale {comparisonValue(minimum, row.unit, row.digits)} to {comparisonValue(maximum, row.unit, row.digits)}</div>
                {picked ? <div className="record-open"><span>{dateLabel(picked)}</span><button type="button" className="text-button" onClick={() => open({ kind: "record", date: picked })}>Open day <Icon name="arrow" /></button></div> : null}
              </div> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
