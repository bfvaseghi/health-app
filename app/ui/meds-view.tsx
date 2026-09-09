"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { HealthState, Medication } from "../health-model";
import { addDays, dateLabel, isDue, medicationStatuses } from "../health-model";
import { adherenceSeries } from "../series";
import { Icon } from "./icons";
import { ConfirmButton, RecordHeading } from "./primitives";
import { Tide } from "./tide";
import type { Modal } from "./types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * What you are on, and whether you took it.
 *
 * One tick a day could only ever be a lie about two of them. A daily tablet, a
 * daily medication and a weekly medication are three different questions: two are daily and
 * one is a weekly injection, and a tracker that marked the injection missed on
 * the six days it was not due is one you would stop reading.
 */
export function MedsView({
  state,
  today,
  open,
  onDose,
  onDeleteMedication,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onDose: (medicationId: string, date: string, taken: boolean | null) => void;
  onDeleteMedication: (id: string) => void;
}) {
  const [windowDays, setWindowDays] = useState<7 | 30>(30);
  const statuses = useMemo(() => medicationStatuses(state, today, windowDays), [state, today, windowDays]);
  const adherence = useMemo(() => adherenceSeries(state, today, 30, 30), [state, today]);
  const [changing, setChanging] = useState<string | null>(null);

  return (
    <div className="page tl-page meds-page">
      <RecordHeading title="Meds" action={<button type="button" className="text-button" onClick={() => open({ kind: "medication" })}><Icon name="plus" /> Add</button>} />
      <div className="daily-dose-heading"><h2>Today</h2><div className="period-picker" role="group" aria-label="Medication consistency period">{([7, 30] as const).map(days => <button key={days} type="button" aria-pressed={windowDays === days} onClick={() => setWindowDays(days)}>{days} days</button>)}</div></div>
      {!statuses.length ? <p className="tl-line">Add your medication and its schedule to get started.</p> : null}
      <section className="dose-list clean-doses" aria-label="Medication completion and consistency">
        {statuses.map(status => <article key={status.medication.id} className="dose-card" aria-label={status.medication.name}>
          <div className="dose-card-heading"><h3><Icon name="medication" />{status.medication.name}</h3><button type="button" className="text-button" aria-label={`Options for ${status.medication.name}`} aria-expanded={changing === status.medication.id} onClick={() => setChanging(value => value === status.medication.id ? null : status.medication.id)}>Edit</button></div>
          <div className="dose-card-body">
            <div className="dose-today-status">
              {status.dueToday ? <button type="button" className={`dose-completion${status.today === true ? " is-taken" : ""}`} aria-pressed={status.today === true} aria-label={`${status.medication.name}: ${status.today === true ? "taken today; undo" : "mark taken today"}`} onClick={() => onDose(status.medication.id, today, status.today === true ? null : true)}><span className="completion-check"><Icon name="check" /></span><span>{status.today === true ? "Taken today" : status.today === false ? "Missed today" : "Mark taken today"}</span></button> : <strong className="dose-not-due">Not due today</strong>}
              <span className="dose-schedule">{status.medication.schedule === "daily" ? "Daily" : status.dueToday ? "Weekly dose" : status.nextDue ? `Next ${dateLabel(status.nextDue, { weekday: "short", month: "short", day: "numeric" })}` : "Weekly dose"}</span>
            </div>
            <div className="consistency-number" role="status"><strong>{status.taken} <span>out of {status.due}</span></strong><span>{status.medication.schedule === "daily" ? "days taken" : "scheduled doses taken"} · last {windowDays} days</span></div>
          </div>
          {changing === status.medication.id ? <div className="dose-options" role="group" aria-label={`${status.medication.name} options`}>
            {status.dueToday ? <><button type="button" className="text-button" onClick={() => { onDose(status.medication.id, today, status.today === true ? false : true); setChanging(null); }}>{status.today === true ? "Mark missed" : "Mark taken"}</button>{status.today == null ? <button type="button" className="text-button" onClick={() => { onDose(status.medication.id, today, false); setChanging(null); }}>Mark missed</button> : <button type="button" className="text-button" onClick={() => { onDose(status.medication.id, today, null); setChanging(null); }}>Clear today</button>}</> : null}
            <button type="button" className="text-button" onClick={() => open({ kind: "medication", id: status.medication.id })}>Edit schedule</button>
          </div> : null}
        </article>)}
      </section>
      {statuses.length ? <details className="simple-history dose-management"><summary>Past doses &amp; schedules</summary>
        {statuses.map(status => <MedHistory key={status.medication.id} state={state} medicationId={status.medication.id} medication={status.medication} today={today} onDose={onDose}>
          <div className="medication-management"><span>{status.medication.schedule === "daily" ? "Daily" : `Every ${WEEKDAYS[status.medication.dueDay ?? 1]}`}</span><div className="row-actions"><button type="button" className="text-button" aria-label={`Edit ${status.medication.name}`} onClick={() => open({ kind: "medication", id: status.medication.id })}>Edit schedule</button><ConfirmButton label={`Delete ${status.medication.name} and dose history`} onConfirm={() => onDeleteMedication(status.medication.id)} /></div></div>
          <p className="medication-history-summary">Last {windowDays} days: {status.taken} taken · {status.missed} missed · {status.unanswered} not logged.</p>
        </MedHistory>)}
        <details className="simple-history medication-trend"><summary>Dose trend</summary><p className="medication-history-summary">Percentage of logged doses marked taken over the previous 30 days. Unlogged doses are excluded.</p><Tide data={adherence} label="Logged doses marked taken, rolling 30-day percentage" unit="%" min={Math.max(0, Math.min(90, ...adherence.map(point => point.value ?? 100)) - 4)} max={100.5} format={value => String(Math.round(value))} empty="No dose history yet." /></details>
      </details> : null}
    </div>
  );
}

/**
 * Fourteen days of one medication, oldest first: taken, missed, unlogged, or
 * simply not due — enough to see a lapse without opening a report.
 */
function MedHistory({
  state,
  medicationId,
  medication,
  today,
  onDose,
  children,
}: {
  state: HealthState;
  medicationId: string;
  medication: Medication;
  today: string;
  onDose: (medicationId: string, date: string, taken: boolean | null) => void;
  children: ReactNode;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const answers = new Map(
    state.medicationDoses
      .filter((dose) => dose.medicationId === medicationId)
      .map((dose) => [dose.date, dose.taken] as const),
  );
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    const dueDay = isDue(medication, date);
    const answer = answers.get(date);
    const kind = !dueDay ? "off" : answer === true ? "taken" : answer === false ? "missed" : "open";
    return { date, kind };
  });
  return (
    <details className="med-history-fold">
      <summary>{medication.name}</summary>
    {children}
    <p className="medication-history-summary">{dateLabel(addDays(today, -13))}–{dateLabel(today)} · Select a day to edit</p>
    <ol className="med-history" aria-label={`${medication.name}, last 14 days`}>
      {days.map((day) => (
        <li key={day.date}>
          <button type="button" className={`is-${day.kind}${selectedDay === day.date ? " selected" : ""}`} disabled={day.kind === "off"} aria-pressed={selectedDay === day.date} onClick={() => setSelectedDay(value => value === day.date ? null : day.date)}
            aria-label={`${medication.name}, ${dateLabel(day.date, { weekday: "short", month: "short", day: "numeric" })}: ${day.kind === "off" ? "not due" : day.kind === "open" ? "not logged" : day.kind}`}>
            <span>{dateLabel(day.date, { day: "numeric" })}</span><i aria-hidden="true" />
          </button>
        </li>
      ))}
    </ol>
    {selectedDay ? <div className="dose-day-editor" role="group" aria-label={`${medication.name}, ${dateLabel(selectedDay)}`}>
      <div><b>{dateLabel(selectedDay, { weekday: "long", month: "short", day: "numeric" })}</b><span role="status">{answers.get(selectedDay) === true ? "Taken" : answers.get(selectedDay) === false ? "Missed" : "Not recorded"}</span></div>
      <div className="dose-day-choices">{([{ label: "Taken", value: true }, { label: "Missed", value: false }, { label: "Not recorded", value: null }] as const).map(choice => <button type="button" key={choice.label} className="chip" aria-pressed={(answers.get(selectedDay) ?? null) === choice.value} onClick={() => onDose(medicationId, selectedDay, choice.value)}>{choice.label}</button>)}</div>
    </div> : null}
    </details>
  );
}
