"use client";

import { useState } from "react";
import type { Habit, HabitEvent, HealthState } from "../health-model";
import { addDays, caffeineSummary, dateLabel, localDateTime } from "../health-model";
import { caffeineEntry } from "../caffeine";
import { recordId } from "../record-id";
import { formatTime } from "./format";
import { Tide } from "./tide";

export function CaffeineSettings({ value, onChange }: {
  value: NonNullable<Habit["caffeine"]>;
  onChange: (value: NonNullable<Habit["caffeine"]>) => void;
}) {
  // Keep the text being typed, including the decimal point in “12.”.
  const [limit, setLimit] = useState(String(value.dailyLimitMg ?? ""));
  const [serving, setServing] = useState(String(value.usualDoseMg ?? ""));
  return <div className="caffeine-fields">
    <label>Daily limit (mg)<input type="number" min="0" step="0.1" inputMode="decimal" value={limit} placeholder="Optional" onChange={event => { setLimit(event.target.value); onChange({ ...value, dailyLimitMg: event.target.value === "" ? null : Number(event.target.value) }); }} /></label>
    <label>Last caffeine by<input type="time" value={value.cutoffTime} onChange={event => onChange({ ...value, cutoffTime: event.target.value })} /></label>
    <label>Usual serving (mg)<input type="number" min="0.1" step="0.1" inputMode="decimal" value={serving} placeholder="From the label" onChange={event => { setServing(event.target.value); onChange({ ...value, usualDoseMg: event.target.value === "" ? null : Number(event.target.value) }); }} /></label>
  </div>;
}

function ServingForm({ habit, entry, onSave, onCancel }: {
  habit: Habit; entry?: HabitEvent;
  onSave: (event: HabitEvent) => void; onCancel: () => void;
}) {
  const now = localDateTime();
  const [amount, setAmount] = useState(String(entry?.amountMg ?? habit.caffeine?.usualDoseMg ?? ""));
  const [when, setWhen] = useState(entry ? "earlier" : "now");
  const [date, setDate] = useState((entry?.at ?? now).slice(0, 10));
  const [time, setTime] = useState((entry?.at ?? now).slice(11, 16));
  const [error, setError] = useState("");
  return <form className="tl-loop-form caffeine-entry-form" onSubmit={event => {
    event.preventDefault();
    const clock = localDateTime();
    // Native date/time pickers can commit their value without an intervening
    // React change event. Save the visible form values at submission time.
    const fields = new FormData(event.currentTarget);
    const submittedAmount = String(fields.get("amount") ?? "");
    const submittedAt = when === "now" ? clock : `${fields.get("date")}T${fields.get("time")}`;
    const result = caffeineEntry({ id: entry?.id ?? recordId("caffeine"), habitId: habit.id, amount: submittedAmount, at: submittedAt }, clock);
    if (!result.event) { setError(result.error); return; }
    onSave(result.event);
  }}>
    <label>Amount (mg)<input name="amount" type="number" min="0.1" step="0.1" inputMode="decimal" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
    {!entry ? <div className="caffeine-when" role="group" aria-label="When you had caffeine"><button type="button" className={`button ${when === "now" ? "primary" : "secondary"}`} aria-pressed={when === "now"} onClick={() => setWhen("now")}>Now</button><button type="button" className={`button ${when === "earlier" ? "primary" : "secondary"}`} aria-pressed={when === "earlier"} onClick={() => setWhen("earlier")}>Earlier</button></div> : null}
    {when === "earlier" ? <div className="caffeine-fields"><label>Date<input name="date" type="date" required max={now.slice(0, 10)} value={date} onChange={event => setDate(event.target.value)} /></label><label>Time<input name="time" type="time" required value={time} onChange={event => setTime(event.target.value)} /></label></div> : null}
    {error ? <p className="caffeine-error" role="alert">{error}</p> : null}
    <div className="tl-actions"><button className="button primary" type="submit">{entry ? "Save changes" : "Log caffeine"}</button><button type="button" className="button secondary" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export function CaffeineHabit({ state, habit, today, onEvent, onDeleteEvent }: {
  state: HealthState; habit: Habit; today: string;
  onEvent: (event: HabitEvent) => void; onDeleteEvent: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; previous?: HabitEvent } | null>(null);
  const [message, setMessage] = useState("");
  const summary = caffeineSummary(state, habit.id, today);
  const entries = state.habitEvents.filter(event => event.habitId === habit.id && event.kind === "intake").sort((a, b) => b.at.localeCompare(a.at));
  const todayEntries = entries.filter(entry => entry.date === today);
  const pastEntries = entries.filter(entry => entry.date !== today);
  const usual = habit.caffeine?.usualDoseMg;
  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    const day = caffeineSummary(state, habit.id, date);
    return { date, value: day.events.length ? day.totalMg : null };
  });
  function save(event: HabitEvent) {
    const previous = entries.find(entry => entry.id === event.id);
    onEvent(event);
    setUndo({ id: event.id, previous });
    setMessage(previous ? "Caffeine entry updated." : `${event.amountMg} mg logged at ${formatTime(event.at.slice(11, 16))}.`);
    setAdding(false);
    setEditing(null);
  }
  function renderEntry(entry: HabitEvent) {
    return <li key={entry.id} className="caffeine-history-row">
      {editing === entry.id ? <ServingForm key={entry.id} habit={habit} entry={entry} onSave={save} onCancel={() => setEditing(null)} /> : <>
        <span><b>{entry.amountMg} mg</b><small>{entry.date === today ? formatTime(entry.at.slice(11, 16)) : `${dateLabel(entry.date)} · ${formatTime(entry.at.slice(11, 16))}`}</small></span>
        <div className="row-actions">
          <button type="button" className="text-button" disabled={adding || editing !== null} aria-label={`Edit ${entry.amountMg} mg on ${entry.at}`} onClick={() => { setEditing(entry.id); setAdding(false); }}>Edit</button>
          <button type="button" className="text-button" disabled={adding || editing !== null} aria-label={`Remove ${entry.amountMg} mg on ${entry.at}`} onClick={() => { onDeleteEvent(entry.id); setUndo({ id: entry.id, previous: entry }); setMessage("Caffeine entry removed."); }}>Remove</button>
        </div>
      </>}
    </li>;
  }
  return <div className="caffeine-habit">
    <div className={`caffeine-today${summary.events.length ? "" : " is-unlogged"}`}><strong>{summary.events.length ? `${summary.totalMg} mg` : "None logged"}<span>today{habit.caffeine?.dailyLimitMg != null ? ` · ${habit.caffeine.dailyLimitMg} mg limit` : ""}</span></strong></div>
    {habit.caffeine?.cutoffTime ? <p className="caffeine-detail">Last caffeine by {formatTime(habit.caffeine.cutoffTime)}{summary.late ? ` · ${summary.late} ${summary.late === 1 ? "serving" : "servings"} after this time` : ""}</p> : null}
    {summary.overMg ? <p className="caffeine-detail">{summary.overMg} mg above your limit</p> : null}
    {!adding && editing === null ? <div className="tl-actions">
      {usual != null ? <button type="button" className="button primary" onClick={() => {
        const clock = localDateTime();
        const result = caffeineEntry({ id: recordId("caffeine"), habitId: habit.id, amount: usual, at: clock }, clock);
        if (result.event) save(result.event);
        else setMessage(result.error);
      }}>Log {usual} mg</button> : null}
      <button type="button" className={usual == null ? "button primary" : "text-button"} onClick={() => { setAdding(true); setEditing(null); }}>{usual == null ? "Log caffeine" : "Other amount or time"}</button>
    </div> : adding ? <ServingForm habit={habit} onSave={save} onCancel={() => setAdding(false)} /> : null}
    {message ? <p className="caffeine-feedback" role="status">{message}{undo ? <> <button type="button" className="text-button" disabled={adding || editing !== null} onClick={() => {
      if (undo.previous) onEvent(undo.previous);
      else onDeleteEvent(undo.id);
      setUndo(null);
      setMessage("Change undone.");
    }}>Undo</button></> : null}</p> : null}
    {todayEntries.length ? <section className="caffeine-today-entries" aria-label="Today’s caffeine entries">
      <h4>Logged today</h4>
      <ul className="tl-list">{todayEntries.map(renderEntry)}</ul>
    </section> : null}
    {entries.length ? <details className="caffeine-history"><summary>Earlier entries &amp; trend</summary>
      {daily.some(day => day.value !== null) ? <><p className="caffeine-hint">Daily amount · last 14 days</p><Tide data={daily} label={`${habit.name}, daily amount`} min={0} goal={habit.caffeine?.dailyLimitMg ?? null} unit=" mg" empty="No amounts logged in this period." dateFormat={{ month: "short", day: "numeric" }} /><p className="caffeine-hint">Gaps mean no record</p></> : null}
      {pastEntries.length ? <ul className="tl-list">{pastEntries.map(renderEntry)}</ul> : <p className="caffeine-hint">No earlier entries.</p>}
    </details> : null}
  </div>;
}
