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
  sleepConsistencyRange,
  sleepDebtHours,
} from "../health-model";
import { sleepWeeklyAverages } from "../series";
import { sleepSeries } from "./charts";
import { MetricPanel } from "./metric-panel";
import { Icon } from "./icons";
import { ConfirmButton, PeriodPicker } from "./primitives";
import { Tide } from "./tide";
import { useWidth } from "./use-width";
import { average, formatTime, hoursLabel } from "./format";
import { Modal, Period, recoveryMetrics } from "./types";

/**
 * How am I sleeping? Last night in numerals, the season as a tide, the usual
 * night as a band on a 24-hour strip, and every night as a row you can edit.
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

  const preferred = useMemo(() => preferredSleepEntries(state.sleepEntries), [state.sleepEntries]);
  const listed = useMemo(() => {
    const source = scope === "preferred" ? preferred : [...state.sleepEntries].sort((a, b) => b.date.localeCompare(a.date));
    return entriesInWindow(source, today, period);
  }, [scope, preferred, state.sleepEntries, today, period]);

  const lastNight = preferred.find((entry) => entry.date <= today) ?? null;
  const recent = entriesInWindow(preferred, today, 7);
  const recentWithDuration = recent.filter((entry) => entry.durationHours !== null);
  const avg = average(recent.map((entry) => entry.durationHours));
  const atGoal = recentWithDuration.filter((entry) => (entry.durationHours as number) >= state.goals.sleepHours).length;
  const regularity = sleepConsistencyRange(recent);
  const debt = sleepDebtHours(state, today, 7);
  const fortnight = entriesInWindow(preferred, today, 14);
  const bedtime = averageBedtime(fortnight);
  const wake = averageWakeTime(fortnight);

  const weekly = useMemo(() => sleepWeeklyAverages(state, today, 8), [state, today]);
  const weeklyRecorded = weekly.filter((point) => point.value !== null);
  const shift =
    weeklyRecorded.length >= 2
      ? Math.round(((weeklyRecorded.at(-1)!.value as number) - (weeklyRecorded[0].value as number)) * 60)
      : null;
  const series = useMemo(() => sleepSeries(state, today, period), [state, today, period]);

  return (
    <div className="page tl-page">
      <div className="tl-section-head">
        <span className="tl-caps">{lastNight ? (lastNight.date === today ? "Sleep · last night" : `Sleep · latest night · ${dateLabel(lastNight.date, { weekday: "short", month: "short", day: "numeric" })}`) : "Sleep"}</span>
        <button type="button" className="text-button" onClick={() => open({ kind: "sleep", date: today })}>
          <Icon name="plus" /> Add a night
        </button>
      </div>

      <h1 className="tl-num" tabIndex={-1}>
        {lastNight?.durationHours != null ? (
          <Duration hours={lastNight.durationHours} />
        ) : (
          <span className="tl-hero" style={{ margin: 0 }}>{lastNight ? "A night, unmeasured." : "No nights yet."}</span>
        )}
      </h1>
      <p className="tl-lede">
        {lastNight ? (
          <>
            {lastNight.bedtime && lastNight.wakeTime ? `${formatTime(lastNight.bedtime)} → ${formatTime(lastNight.wakeTime)} · ` : ""}
            {lastNight.source}
            {lastNight.durationHours != null ? (
              <>
                {" · "}
                <b className={lastNight.durationHours >= state.goals.sleepHours ? "tl-good" : undefined}>
                  {lastNight.durationHours >= state.goals.sleepHours
                    ? "goal met"
                    : `${Math.round((state.goals.sleepHours - lastNight.durationHours) * 60)} min short of the ${state.goals.sleepHours} h goal`}
                </b>
              </>
            ) : null}
            {editableState.sleepEntries.some((item) => item.date === lastNight.date && item.source === lastNight.source) ? (
              <>
                {" · "}
                <button type="button" className="text-button" onClick={() => open({ kind: "sleep", date: lastNight.date, source: lastNight.source })}>
                  Edit
                </button>
              </>
            ) : null}
          </>
        ) : (
          "Add a night by hand, or connect Apple Health and let the ring or watch write them."
        )}
      </p>

      {recentWithDuration.length ? (
        <p className="tl-line">
          {`Last seven nights — ${avg === null ? "" : `${avg.toFixed(1)} h a night, `}${atGoal} of ${recentWithDuration.length} at goal`}
          {regularity === null ? "" : `, bedtimes within ${Math.round(regularity)} min`}
          {debt === null || debt === 0 ? "" : `, ${debt.toFixed(1)} h short in total`}
          {"."}
        </p>
      ) : null}

      <section className="tl-section" aria-label="Weekly average, eight weeks">
        <div className="tl-section-head">
          <span className="tl-caps">Weekly average · 8 weeks</span>
          {shift !== null ? (
            <span className="tl-meta accent">
              <b>{`${shift >= 0 ? "+" : "−"}${Math.abs(shift)} min`}</b>
              {` a night since ${dateLabel(weeklyRecorded[0].date, { month: "long" })}`}
            </span>
          ) : null}
        </div>
        <Tide data={weekly} label="Sleep, weekly average" unit="h" goal={state.goals.sleepHours} format={(value) => value.toFixed(1)} empty="Two weeks of nights draw the first tide." />
      </section>

      {bedtime && wake ? (
        <section className="tl-section" aria-label="Your usual night">
          <div className="tl-section-head">
            <span className="tl-caps">Your usual night · two weeks</span>
            <span className="tl-meta">the bar is last night</span>
          </div>
          <NightBand bedtime={bedtime} wake={wake} lastNight={lastNight} />
        </section>
      ) : null}

      <section className="tl-section" aria-label="Every night in the period">
        <div className="tl-section-head">
          <span className="tl-caps">Every night</span>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        <Tide data={series} label="Sleep, hours a night" unit="h" goal={state.goals.sleepHours} format={(value) => value.toFixed(1)} empty="No sleep data in this period." />
      </section>

      <MetricPanel
        state={state}
        today={today}
        metrics={recoveryMetrics}
        emptyHint="No readings in this period. A ring or watch records these while you sleep."
      />

      <section className="tl-section" aria-labelledby="nights-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="nights-title" style={{ margin: 0 }}>{`Nights · ${period} days`}</h2>
          <div className="tl-tabs" role="group" aria-label="Which records to list">
            <button type="button" aria-pressed={scope === "preferred"} className={scope === "preferred" ? "active" : ""} onClick={() => setScope("preferred")}>
              One per night
            </button>
            <button type="button" aria-pressed={scope === "all"} className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
              Every source
            </button>
          </div>
        </div>
        {listed.length ? (
          <ul className="tl-rows tl-list">
            {(showAllNights ? listed : listed.slice(0, 7)).map((entry) => {
              const editable = editableState.sleepEntries.some((item) => item.date === entry.date && item.source === entry.source);
              return (
                <li className="tl-row is-static" key={`${entry.date}:${entry.source}`}>
                  <span className="tl-row-copy">
                    <b>
                      {dateLabel(entry.date, { weekday: "short", month: "short", day: "numeric" })}
                      <span className="tl-source">{entry.source}</span>
                    </b>
                    <small>
                      {entry.bedtime && entry.wakeTime ? `${formatTime(entry.bedtime)} – ${formatTime(entry.wakeTime)}` : "window not provided"}
                      {entry.quality ? ` · ${entry.quality}/5` : ""}
                    </small>
                  </span>
                  <span className="tl-row-end">{entry.durationHours === null ? "—" : hoursLabel(entry.durationHours)}</span>
                  {editable ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => open({ kind: "sleep", date: entry.date, source: entry.source })}
                        aria-label={`Edit ${entry.source} sleep for ${dateLabel(entry.date)}`}
                      >
                        <Icon name="pencil" />
                      </button>
                      <ConfirmButton
                        label={`Delete ${entry.source} sleep for ${dateLabel(entry.date)}`}
                        onConfirm={() => onDelete(entry.date, entry.source)}
                      />
                    </div>
                  ) : (
                    <span className="tl-lock"><Icon name="lock" /><span className="visually-hidden">Recorded automatically</span></span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="tl-line">
            {"No nights in this period. Import an export from Oura, Whoop, or Apple Health, or add a night by hand."}
            {demo ? null : (
              <>
                {" "}
                <button type="button" className="text-button" onClick={() => open({ kind: "import" })}>Import health data</button>
              </>
            )}
          </p>
        )}
        {listed.length > 7 ? (
          <p className="tl-line">
            <button type="button" className="text-button" onClick={() => setShowAllNights((value) => !value)}>
              {showAllNights ? "Show recent 7" : `Show all ${listed.length} nights`}
            </button>
          </p>
        ) : null}
      </section>
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
 * a strip from 8 PM to 10 AM, with last night laid over it as a bar. It answers
 * "when do I actually sleep?" without a number to interpret.
 */
function NightBand({ bedtime, wake, lastNight }: { bedtime: string; wake: string; lastNight: { bedtime: string; wakeTime: string } | null }) {
  const ref = useRef<SVGSVGElement>(null);
  const width = useWidth(ref, 353);
  const startHour = 20;
  const span = 14;
  // Positions on the night clock: 20:00 is the left edge, 10:00 the next morning the right.
  const at = (clock: string | null): number | null => {
    if (!clock) return null;
    const minutes = bedtimeMinutes(clock);
    if (minutes === null) return null;
    // bedtimeMinutes puts evening times before midnight at negative offsets and
    // morning times after; re-anchor to 8 PM.
    const fromEight = minutes + 24 * 60 - startHour * 60;
    const hours = ((fromEight % (24 * 60)) + 24 * 60) % (24 * 60) / 60;
    return Math.max(0, Math.min(width, (hours / span) * width));
  };
  const b = at(bedtime);
  const w = at(wake);
  const lb = at(lastNight?.bedtime ?? null);
  const lw = at(lastNight?.wakeTime ?? null);
  if (b === null || w === null) return null;
  return (
    <svg ref={ref} className="tl-band" viewBox={`0 0 ${width} 58`} role="img" aria-label={`Usually in bed ${formatClock(bedtime)}, up ${formatClock(wake)}`}>
      <line className="axis" x1="0" y1="30" x2={width} y2="30" />
      <rect className="window" x={Math.min(b, w)} y="20" width={Math.max(6, Math.abs(w - b))} height="20" rx="10" />
      {lb !== null && lw !== null ? <rect className="night" x={Math.min(lb, lw)} y="26" width={Math.max(4, Math.abs(lw - lb))} height="8" rx="4" /> : null}
      <text className="edge" x={Math.min(b, w)} y="12">{formatClock(bedtime)}</text>
      <text className="edge" x={Math.max(b, w)} y="12" textAnchor="end">{formatClock(wake)}</text>
      <text x="0" y="54">8 PM</text>
      <text x={width} y="54" textAnchor="end">10 AM</text>
    </svg>
  );
}
