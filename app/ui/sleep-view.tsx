"use client";

import { useMemo, useState } from "react";
import {
  HealthState,
  SleepSource,
  averageBedtime,
  averageWakeTime,
  dateLabel,
  entriesInWindow,
  preferredSleepEntries,
  sleepConsistencyRange,
  sleepDebtHours,
} from "../health-model";
import { SleepChart, sleepSeries } from "./charts";
import { MetricPanel } from "./metric-panel";
import { Icon } from "./icons";
import { ConfirmButton, Empty, PageHeading, PeriodPicker, Segmented, Stat } from "./primitives";
import { average, formatTime } from "./format";
import { Modal, Period, recoveryMetrics } from "./types";

export function SleepView({
  state,
  today,
  open,
  onDelete,
  demo,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onDelete: (date: string, source: SleepSource) => void;
  demo: boolean;
}) {
  const [period, setPeriod] = useState<Period>(30);
  const [scope, setScope] = useState<"preferred" | "all">("preferred");

  const preferred = useMemo(() => preferredSleepEntries(state.sleepEntries), [state.sleepEntries]);
  const listed = useMemo(() => {
    const source = scope === "preferred" ? preferred : [...state.sleepEntries].sort((a, b) => b.date.localeCompare(a.date));
    return entriesInWindow(source, today, period);
  }, [scope, preferred, state.sleepEntries, today, period]);

  const recent = entriesInWindow(preferred, today, 7);
  const avg = average(recent.map((entry) => entry.durationHours));
  const atGoal = recent.filter(
    (entry) => entry.durationHours !== null && entry.durationHours >= state.goals.sleepHours,
  ).length;
  const regularity = sleepConsistencyRange(recent);
  const debt = sleepDebtHours(state, today, 7);
  const bedtime = averageBedtime(recent);
  const wake = averageWakeTime(recent);
  const series = useMemo(() => sleepSeries(state, today, period), [state, today, period]);

  return (
    <div className="page">
      <PageHeading
        title="Sleep"
        action={
          <div className="heading-actions">
            {!demo ? (
              <button type="button" className="button secondary" onClick={() => open({ kind: "import" })}>
                <Icon name="upload" />
                Import
              </button>
            ) : null}
            <button type="button" className="button primary" onClick={() => open({ kind: "sleep", date: today })}>
              <Icon name="plus" />
              Add sleep
            </button>
          </div>
        }
      />

      <section className="hero-panel">
        <div className="hero-score">
          <span className="moon-orb">
            <Icon name="moon" />
          </span>
          <div>
            <p className="kicker">7-day average</p>
            <strong>{avg === null ? "—" : `${avg.toFixed(1)} h`}</strong>
            <small>Goal {state.goals.sleepHours} hours</small>
          </div>
        </div>
        <div className="stat-row">
          <Stat label="Nights at goal" value={recent.length ? `${atGoal} / ${recent.length}` : "—"} detail="last 7 recorded" />
          <Stat
            label="Bedtime range"
            value={regularity === null ? "—" : `${Math.round(regularity)} min`}
            detail={`guide ≤ ${state.goals.sleepConsistencyMinutes} min`}
          />
          <Stat
            label="Sleep debt"
            value={debt === null ? "—" : `${debt.toFixed(1)} h`}
            detail="hours below goal this week"
          />
          <Stat
            label="Typical window"
            value={bedtime && wake ? `${formatTime(bedtime)} – ${formatTime(wake)}` : "—"}
            detail="average bedtime and wake"
          />
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-head">
          <div>
            <h2>Duration</h2>
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
        <SleepChart data={series} goal={state.goals.sleepHours} />
      </section>

      <MetricPanel
        state={state}
        today={today}
        metrics={recoveryMetrics}
        emptyHint="No readings in this period. A ring or watch records these while you sleep."
      />

      <section className="panel wide-panel">
        <div className="panel-head wrap">
          <div>
            <h2>Nights</h2>
          </div>
          <Segmented
            label="Which records to list"
            value={scope}
            options={[
              { value: "preferred", label: "One per night" },
              { value: "all", label: "Every source" },
            ]}
            onChange={(value) => setScope(value as typeof scope)}
          />
        </div>
        {listed.length ? (
          <ul className="record-list">
            {listed.map((entry) => (
              <li className="record-row sleep-row" key={`${entry.date}:${entry.source}`}>
                <div className="date-tile">
                  <b>{dateLabel(entry.date, { weekday: "short" })}</b>
                  <small>{dateLabel(entry.date)}</small>
                </div>
                <div>
                  <small>Duration</small>
                  <b>{entry.durationHours === null ? "Unknown" : `${entry.durationHours.toFixed(1)} h`}</b>
                </div>
                <div>
                  <small>Window</small>
                  <b>
                    {entry.bedtime && entry.wakeTime
                      ? `${formatTime(entry.bedtime)} – ${formatTime(entry.wakeTime)}`
                      : "Not provided"}
                  </b>
                </div>
                <div>
                  <small>Quality</small>
                  <b>{entry.quality ? `${entry.quality} / 5` : "Not rated"}</b>
                </div>
                <span className={`source-badge ${entry.source}`}>{entry.source}</span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="row-action"
                    onClick={() => open({ kind: "sleep", date: entry.date, source: entry.source })}
                    aria-label={`Edit ${entry.source} sleep for ${dateLabel(entry.date)}`}
                  >
                    <Icon name="pencil" />
                    <span>Edit</span>
                  </button>
                  <ConfirmButton
                    label={`Delete ${entry.source} sleep for ${dateLabel(entry.date)}`}
                    onConfirm={() => onDelete(entry.date, entry.source)}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            icon="moon"
            title="No nights in this period"
            body="Import an export from Oura, Whoop, or Apple Health, or add a night by hand."
            action={demo ? undefined : (
              <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
                Import health data
              </button>
            )}
          />
        )}
      </section>
    </div>
  );
}
