"use client";

import { useMemo, useState } from "react";
import type { HealthState } from "../health-model";
import { addDays, dateLabel, validIsoDate } from "../health-model";
import { recordDates, recordDay } from "../record-history";
import { formatTime, hoursLabel } from "./format";
import { Icon } from "./icons";
import { ModalFrame } from "./primitives";
import { recurrenceLabels } from "./thought-loops";
import type { Modal } from "./types";

export function RecordDay({ state, editableState, initialDate, today, open, onClose }: {
  state: HealthState;
  editableState: HealthState;
  initialDate: string;
  today: string;
  open: (modal: Modal) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const dates = useMemo(() => recordDates(state, today), [state, today]);
  const day = useMemo(() => recordDay(state, date), [state, date]);
  const previous = dates.filter((item) => item < date).at(-1);
  const next = dates.find((item) => item > date);
  const metrics = [
    ["Weight", day.daily?.weightLb, "lb"], ["Body fat", day.daily?.bodyFatPercent, "%"],
    ["Steps", day.daily?.steps, ""], ["Protein", day.daily?.proteinG, "g"],
    ["Calories", day.daily?.caloriesKcal, "kcal"],
    ["Water", day.daily?.waterMl, "mL"],
    ["Resting heart rate", day.daily?.restingHeartRate ?? day.sleep?.restingHeartRate, "bpm"],
    ["HRV", day.daily?.hrvMs ?? day.sleep?.hrvMs, "ms"],
    ["Meditation", day.daily?.meditationMinutes, "min"],
  ] as const;
  const hasRecords = dates.includes(date);
  return (
    <ModalFrame title="Daily record" onClose={onClose}>
      <div className="record-date-nav">
        <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><Icon name="chevron" /></button>
        <label><span className="tl-caps">Date</span><input type="date" value={date} max={today} aria-label="Record date" onChange={(event) => { if (validIsoDate(event.target.value) && event.target.value <= today) setDate(event.target.value); }} /></label>
        <button type="button" className="icon-button next-day" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><Icon name="chevron" /></button>
      </div>
      <div className="record-jumps">
        <button type="button" className="text-button" disabled={!previous} onClick={() => previous && setDate(previous)}>Previous record</button>
        <button type="button" className="text-button" disabled={!next} onClick={() => next && setDate(next)}>Next record</button>
      </div>
      <div className="tl-actions">
        <button type="button" className="button secondary" onClick={() => open({ kind: "checkin", date, returnToRecord: true })}>Edit day</button>
        {!day.sleep ? <button type="button" className="button secondary" onClick={() => open({ kind: "sleep", date, returnToRecord: true })}>Add sleep</button> : null}
      </div>
      {!hasRecords ? <p className="tl-line">No records for {dateLabel(date)}.</p> : null}
      {day.sleep ? (
        <section className="tl-section" aria-label="Sleep record">
          <div className="tl-section-head"><h3 className="tl-caps">Sleep</h3>
            {editableState.sleepEntries.some((row) => row.date === date && row.source === day.sleep!.source) ? <button type="button" className="text-button" onClick={() => open({ kind: "sleep", date, source: day.sleep!.source, returnToRecord: true })}>Edit sleep</button> : null}
          </div>
          <div className="record-fact"><b>{day.sleep.durationHours === null ? "Duration missing" : hoursLabel(day.sleep.durationHours)}</b><span>{day.sleep.source}</span></div>
          {day.sleep.bedtime && day.sleep.wakeTime ? <p className="tl-line">{formatTime(day.sleep.bedtime)} → {formatTime(day.sleep.wakeTime)}</p> : null}
          {day.sleep.note ? <p className="record-note">{day.sleep.note}</p> : null}
          {day.sleepSources.length > 1 ? <details className="record-details"><summary>All sources · {day.sleepSources.length}</summary><ul className="record-list">{day.sleepSources.map((night) => <li key={night.source}><span>{night.source}</span><b>{night.durationHours === null ? "—" : hoursLabel(night.durationHours)}</b></li>)}</ul></details> : null}
        </section>
      ) : null}
      {metrics.some(([, value]) => value != null) ? <dl className="record-metrics">{metrics.filter(([, value]) => value != null).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value!.toLocaleString("en-US", { maximumFractionDigits: 1 })} {unit}</dd></div>)}</dl> : null}
      {day.sessions.length ? <section className="tl-section" aria-label="Workouts"><h3 className="tl-caps">Workouts</h3>{day.sessions.map((session) => <details key={session.startedAt} className="record-details"><summary>{session.name} · {session.sets} sets</summary><ul className="record-list workout-record">{day.sets.filter((set) => set.startedAt === session.startedAt).map((set, index) => <li key={index}><span>{set.exercise}</span><b>{set.reps === null ? `${set.seconds ?? 0}s` : `${set.reps} reps`}{set.loadMode === "assisted" && set.assistanceLb != null ? ` · ${set.assistanceLb} lb assisted` : set.weightLb != null ? ` · ${set.weightLb} lb` : ""}</b></li>)}</ul></details>)}</section> : null}
      {day.doses.length ? <section className="tl-section" aria-label="Recorded doses"><h3 className="tl-caps">Recorded doses</h3><ul className="record-list">{day.doses.map((dose) => <li key={dose.medicationId}><span>{dose.name}</span><b>{dose.taken ? "Taken" : "Missed"}</b></li>)}</ul></section> : null}
      {day.labs.length ? <section className="tl-section" aria-label="Lab results"><h3 className="tl-caps">Labs</h3><ul className="record-list">{day.labs.map((lab) => <li key={lab.id}><button type="button" className="text-button" onClick={() => open({ kind: "lab", id: lab.id })}>{lab.name}</button><b>{lab.value ?? "—"} {lab.unit}</b></li>)}</ul></section> : null}
      {day.daily?.note || day.daily?.meditationNote ? <section className="tl-section" aria-label="Daily notes"><h3 className="tl-caps">Notes</h3>{day.daily.note ? <p className="record-note">{day.daily.note}</p> : null}{day.daily.meditationNote ? <p className="record-note">{day.daily.meditationNote}</p> : null}</section> : null}
      {day.journal.length || day.daily?.journaled ? <section className="tl-section" aria-label="Journal entries"><h3 className="tl-caps">Journal</h3>{day.journal.length ? day.journal.map((entry) => <article key={entry.id} className="record-entry">{entry.title ? <b>{entry.title}</b> : null}<p className="record-note">{entry.text}</p></article>) : <span className="tl-line">Marked as written</span>}</section> : null}
      {day.therapy.length ? <section className="tl-section" aria-label="Therapy topics"><h3 className="tl-caps">Therapy topics</h3>{day.therapy.map((note) => <p key={note.id} className="record-note">{note.text}</p>)}</section> : null}
      {day.thoughts.length ? <section className="tl-section" aria-label="Recurring thoughts"><h3 className="tl-caps">Recurring thoughts</h3><ul className="record-list">{day.thoughts.map((event) => <li key={event.id}><span>{event.recurrence ? recurrenceLabels[event.recurrence] : "Came up"}{event.response ? <span className="record-note record-note-inline">{event.response}</span> : null}</span><b>{event.at.slice(11, 16)} · {event.move === "passed" ? "Passed" : event.move === "hooked" ? "Stuck" : event.move === "later" ? "Later" : "Recorded"}</b></li>)}</ul></section> : null}
      {day.habits.length ? <section className="tl-section" aria-label="Habit records"><h3 className="tl-caps">Habits</h3><ul className="record-list">{day.habits.map((event) => <li key={event.id}><span>{event.name}</span><b>{event.at.slice(11, 16)} · {event.kind === "urge" ? "Urge passed" : event.kind === "intake" ? `${event.amountMg ?? 0} mg` : "Occurred"}</b></li>)}</ul></section> : null}
      {day.photos.length ? <section className="tl-section" aria-label="Photo records"><h3 className="tl-caps">Photos · {day.photos.length}</h3>{day.photos.map((photo) => <p key={photo.id} className="record-note">{photo.note || "Photo recorded"}</p>)}</section> : null}
    </ModalFrame>
  );
}
