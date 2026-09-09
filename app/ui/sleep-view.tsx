"use client";

import { useMemo, useState, useRef } from "react";
import {
  HealthState,
  SleepSource,
  averageBedtime,
  averageWakeTime,
  bedtimeMinutes,
  dateLabel,
  entriesInWindow,
  formatClock,
  preferredSleepEntries,
} from "../health-model";
import { sleepTimingSeries, sleepWeeklyAverages } from "../series";
import { sleepSeries } from "./charts";
import { MetricPanel } from "./metric-panel";
import { Icon } from "./icons";
import { ConfirmButton, PeriodPicker, RecordHeading } from "./primitives";
import { Tide } from "./tide";
import { useWidth } from "./use-width";
import { formatClockMinutes, formatTime, hoursLabel } from "./format";
import { Modal, Period, recoveryMetrics } from "./types";

/**
 * Bedtime and wake-up lead; duration supports them. Recent nights stay visible,
 * while detailed records, source alternatives and recovery charts open on demand.
 */
export function SleepView({
  state,
  editableState,
  today,
  open,
  onDelete,
  demo,
}: {
  state: HealthState;
  editableState: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onDelete: (date: string, source: SleepSource) => void;
  demo: boolean;
}) {
  const [period, setPeriod] = useState<Period>(30);
  const [scope, setScope] = useState<"preferred" | "all">("preferred");
  const [showAllNights, setShowAllNights] = useState(false);
  const [trend, setTrend] = useState<"bedtime" | "wakeTime" | "duration">("bedtime");

  const preferred = useMemo(() => preferredSleepEntries(state.sleepEntries), [state.sleepEntries]);
  const listed = useMemo(() => {
    const source = scope === "preferred" ? preferred : [...state.sleepEntries].sort((a, b) => b.date.localeCompare(a.date));
    return entriesInWindow(source, today, period);
  }, [scope, preferred, state.sleepEntries, today, period]);

  const lastNight = preferred.find((entry) => entry.date <= today) ?? null;
  const fortnight = entriesInWindow(preferred, today, 14);
  const bedtime = averageBedtime(fortnight);
  const wake = averageWakeTime(fortnight);

  const weekly = useMemo(() => sleepWeeklyAverages(state, today, 8), [state, today]);
  const weeklyRecorded = weekly.filter((point) => point.value !== null);
  const shift =
    weeklyRecorded.length >= 2
      ? Math.round(((weeklyRecorded.at(-1)!.value as number) - (weeklyRecorded[0].value as number)) * 60)
      : null;
  const series = useMemo(() => trend === "duration" ? sleepSeries(state, today, period) : sleepTimingSeries(state, trend, today, period), [state, trend, today, period]);

  return (
    <div className="page tl-page sleep-page">
      <RecordHeading title="Sleep" action={<button type="button" className="text-button" onClick={() => open({ kind: "sleep", date: today })}><Icon name="plus" /> Add a night</button>} />
      <section className="sleep-brief record-cover" aria-label="Latest sleep record">
        <div className="tl-section-head"><span className="tl-caps">{lastNight ? lastNight.date === today ? "Last night" : `Latest · ${dateLabel(lastNight.date)}` : "Last night"}</span>
          {lastNight && editableState.sleepEntries.some(item => item.date === lastNight.date && item.source === lastNight.source) ? <button type="button" className="text-button" onClick={() => open({ kind: "sleep", date: lastNight.date, source: lastNight.source })}>Edit</button> : null}
        </div>
        <div className="sleep-clock-pair">
          <div><span>Bedtime</span><strong>{lastNight?.bedtime ? formatTime(lastNight.bedtime) : "—"}</strong></div>
          <div><span>Woke up</span><strong>{lastNight?.wakeTime ? formatTime(lastNight.wakeTime) : "—"}</strong></div>
        </div>
        <p className="sleep-total">{lastNight?.durationHours != null ? <><b><Duration hours={lastNight.durationHours} /></b><span>of sleep · {hoursLabel(state.goals.sleepHours)} goal</span></> : <span>{lastNight ? "Duration not recorded" : "Add a night or import your sleep data."}</span>}</p>
        {lastNight ? <span className="sleep-source">{lastNight.source}</span> : <button type="button" className="text-button" onClick={() => open({ kind: "import" })}>Import sleep data</button>}
      </section>

      {(bedtime || wake) ? <section className="usual-sleep" aria-label="Usual sleep times over the last two weeks">
        <h2>Your usual schedule <span>Last 2 weeks</span></h2>
        <div><span>Bedtime <b>{bedtime ? formatTime(bedtime) : "—"}</b></span><span>Wake-up <b>{wake ? formatTime(wake) : "—"}</b></span></div>
      </section> : null}

      <section className="sleep-recent" aria-labelledby="recent-nights-title">
        <h2 id="recent-nights-title">Recent nights</h2>
        <table className="sleep-nights-table"><thead><tr><th scope="col">Night</th><th scope="col">Bedtime</th><th scope="col">Wake-up</th><th scope="col">Sleep</th></tr></thead><tbody>
        {preferred.filter(entry => entry.date <= today).slice(0, 5).map(entry => <tr key={`${entry.date}:${entry.source}`}><th scope="row">{dateLabel(entry.date, { month: "short", day: "numeric" })}</th><td>{entry.bedtime ? formatTime(entry.bedtime) : "—"}</td><td>{entry.wakeTime ? formatTime(entry.wakeTime) : "—"}</td><td>{entry.durationHours === null ? "—" : hoursLabel(entry.durationHours)}</td></tr>)}
        </tbody></table>
        {!preferred.length ? <p className="tl-line">Your nights will appear here.</p> : null}
      </section>

      <details className="simple-history sleep-records"><summary>All nights &amp; sources</summary>
        <div className="tl-section-head"><PeriodPicker value={period} onChange={setPeriod} /><div className="tl-tabs" role="group" aria-label="Which records to list"><button type="button" aria-pressed={scope === "preferred"} className={scope === "preferred" ? "active" : ""} onClick={() => setScope("preferred")}>One per night</button><button type="button" aria-pressed={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All sources</button></div></div>
        <ul className="tl-rows tl-list">
          {(showAllNights ? listed : listed.slice(0, 7)).map(entry => {
            const editable = editableState.sleepEntries.some(item => item.date === entry.date && item.source === entry.source);
            return <li className="tl-row is-static" key={`${entry.date}:${entry.source}`}><span className="tl-row-copy"><b>{dateLabel(entry.date)} <span className="tl-source">{entry.source}</span></b><small>{entry.bedtime ? formatTime(entry.bedtime) : "—"} – {entry.wakeTime ? formatTime(entry.wakeTime) : "—"}{entry.quality ? ` · ${entry.quality}/5` : ""}</small></span><span className="tl-row-end">{entry.durationHours === null ? "—" : hoursLabel(entry.durationHours)}</span>{editable ? <div className="row-actions"><button type="button" className="icon-button" aria-label={`Edit ${entry.source} sleep for ${dateLabel(entry.date)}`} onClick={() => open({ kind: "sleep", date: entry.date, source: entry.source })}><Icon name="pencil" /></button><ConfirmButton label={`Delete ${entry.source} sleep for ${dateLabel(entry.date)}`} onConfirm={() => onDelete(entry.date, entry.source)} /></div> : <span className="tl-lock"><Icon name="lock" /><span className="visually-hidden">Recorded automatically</span></span>}</li>;
          })}
        </ul>
        {!listed.length ? <p className="tl-line">No nights in this period.{!demo ? <button type="button" className="text-button" onClick={() => open({ kind: "import" })}>Import health data</button> : null}</p> : null}
        {listed.length > 7 ? <button type="button" className="text-button" onClick={() => setShowAllNights(value => !value)}>{showAllNights ? "Show recent 7" : `Show all ${listed.length} nights`}</button> : null}
      </details>

      <details className="simple-history"><summary>Sleep trends</summary>
        <div className="sleep-trend-controls"><div className="tl-tabs" role="group" aria-label="Sleep trend"><button type="button" aria-pressed={trend === "bedtime"} className={trend === "bedtime" ? "active" : ""} onClick={() => setTrend("bedtime")}>Bedtime</button><button type="button" aria-pressed={trend === "wakeTime"} className={trend === "wakeTime" ? "active" : ""} onClick={() => setTrend("wakeTime")}>Wake-up</button><button type="button" aria-pressed={trend === "duration"} className={trend === "duration" ? "active" : ""} onClick={() => setTrend("duration")}>Duration</button></div><PeriodPicker value={period} onChange={setPeriod} /></div>
        <Tide key={trend} data={series} label={trend === "duration" ? "Sleep, hours a night" : trend === "bedtime" ? "Bedtime by wake date" : "Wake-up time by date"} unit={trend === "duration" ? "h" : ""} goal={trend === "duration" ? state.goals.sleepHours : null} labelWidth={trend === "duration" ? 52 : 85} format={trend === "duration" ? value => value.toFixed(1) : formatClockMinutes} empty="No sleep data in this period." />
        <details className="simple-history"><summary>Weekly averages &amp; usual window</summary>
          <div className="tl-section-head"><span className="tl-caps">Weekly average · 8 weeks</span>{shift !== null ? <span className="tl-meta">{`${shift >= 0 ? "+" : "−"}${Math.abs(shift)} min a night`}</span> : null}</div>
          <Tide data={weekly} label="Sleep, weekly average" unit="h" goal={state.goals.sleepHours} format={value => value.toFixed(1)} empty="No sleep records in this period." />
          {bedtime && wake ? <><h2 className="mind-section-title">Usual sleep window</h2><NightBand bedtime={bedtime} wake={wake} lastNight={lastNight} /></> : null}
        </details>
      </details>
      <details className="simple-history"><summary>Heart rate &amp; recovery</summary><MetricPanel state={state} today={today} metrics={recoveryMetrics} emptyHint="No readings in this period." /></details>
    </div>
  );
}

/** "8h 12m" with the units set small, as numerals rather than a decimal. */
function Duration({ hours }: { hours: number }) {
  const whole = Math.floor(hours);
  let minutes = Math.round((hours - whole) * 60);
  let h = whole;
  if (minutes === 60) {
    h += 1;
    minutes = 0;
  }
  return (
    <>
      {h}
      <small>h</small>
      {String(minutes).padStart(2, "0")}
      <small>m</small>
    </>
  );
}

/**
 * The usual window (average bedtime to average wake, over two weeks) drawn on
 * a strip fitted to the recorded times, with last night overlaid. It answers
 * "when do I actually sleep?" without a number to interpret.
 */
function NightBand({ bedtime, wake, lastNight }: { bedtime: string; wake: string; lastNight: { bedtime: string; wakeTime: string } | null }) {
  const ref = useRef<SVGSVGElement>(null);
  const width = useWidth(ref, 353);
  const b = bedtimeMinutes(bedtime);
  const wakeMinute = bedtimeMinutes(wake);
  if (b === null || wakeMinute === null) return null;
  const after = (start: number, end: number) => start + ((end - start + 1440) % 1440 || 1440);
  const w = after(b, wakeMinute);
  const lastBed = bedtimeMinutes(lastNight?.bedtime ?? "");
  const lb = lastBed === null ? null : lastBed + 1440 * Math.round((b - lastBed) / 1440);
  const lastWake = bedtimeMinutes(lastNight?.wakeTime ?? "");
  const lw = lb !== null && lastWake !== null ? after(lb, lastWake) : null;
  const start = Math.floor(Math.min(b, lb ?? b) / 60) * 60 - 60;
  const end = Math.ceil(Math.max(w, lw ?? w) / 60) * 60 + 60;
  const at = (minute: number) => (minute - start) / (end - start) * width;
  return (
    <svg ref={ref} className="tl-band" viewBox={`0 0 ${width} 58`} role="img" aria-label={`Usually in bed ${formatClock(bedtime)}, up ${formatClock(wake)}`}>
      <line className="axis" x1="0" y1="30" x2={width} y2="30" />
      <rect className="window" x={at(b)} y="20" width={at(w) - at(b)} height="20" rx="10" />
      {lb !== null && lw !== null ? <rect className="night" x={at(lb)} y="26" width={at(lw) - at(lb)} height="8" rx="4" /> : null}
      <text className="edge" x={at(b)} y="12">{formatClock(bedtime)}</text>
      <text className="edge" x={at(w)} y="12" textAnchor="end">{formatClock(wake)}</text>
      <text x="0" y="54">{formatClockMinutes(start)}</text>
      <text x={width} y="54" textAnchor="end">{formatClockMinutes(end)}</text>
    </svg>
  );
}
