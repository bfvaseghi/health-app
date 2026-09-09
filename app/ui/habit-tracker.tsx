"use client";

import { useState } from "react";
import type { Habit, HabitDraft, HabitEvent, HealthState } from "../health-model";
import { habitSummary, habitWeekly, localDateTime, dateLabel } from "../health-model";
import { CaffeineHabit, CaffeineSettings } from "./caffeine-habit";
import { formatTime } from "./format";
import { Icon } from "./icons";
import { ConfirmButton } from "./primitives";
import { Tide } from "./tide";

export function CuttingBack({
  category,
  state,
  today,
  onSave,
  onDelete,
  onEvent,
  onDeleteEvent,
}: {
  category: "masturbation" | "caffeine" | "other";
  state: HealthState;
  today: string;
  onSave: (habit: HabitDraft) => void;
  onDelete: (id: string) => void;
  onEvent: (event: HabitEvent) => void;
  onDeleteEvent: (id: string) => void;
}) {
  const habits = state.habits.filter(habit => !habit.archived && (category === "caffeine" ? Boolean(habit.caffeine) : !habit.caffeine && (category === "masturbation" ? (habit.category === "masturbation" || /masturbat/i.test(habit.name)) : !(habit.category === "masturbation" || /masturbat/i.test(habit.name)))));
  const title = category === "masturbation" ? "Masturbation" : category === "caffeine" ? "Caffeine" : "Other urges";
  const preset = category === "other" ? undefined : category;
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const log = (habit: Habit, kind: HabitEvent["kind"]) => {
    const at = localDateTime();
    const event: HabitEvent = { id: `${habit.id}-${at}-${Math.random().toString(36).slice(2, 6)}`, habitId: habit.id, at, date: at.slice(0, 10), kind };
    onEvent(event);
    setLast(event.id);
  };
  const lastEvent = last ? state.habitEvents.find((event) => event.id === last) ?? null : null;

  return (
    <section className="mind-panel-section urges-panel" aria-labelledby={`urges-${category}-title`}>
      <div className="tl-section-head">
        <h2 className={preset && habits.length ? "visually-hidden" : "mind-section-title"} id={`urges-${category}-title`}>{title}</h2>
        {editing === "new" || (preset && habits.length > 0) ? null : (
          <button type="button" className="text-button" onClick={() => setEditing("new")}>
            <Icon name="plus" /> {preset ? "Set up tracking" : "Add"}
          </button>
        )}
      </div>
      {!habits.length && editing !== "new" ? (
        <p className="tl-line" style={{ marginTop: 8 }}>
          {category === "caffeine" ? "Track caffeine amounts and times." : category === "masturbation" ? "Record when an urge passes or when you act on it." : "Add something you want to cut back on."}
        </p>
      ) : null}
      {editing === "new" ? (
        <HabitForm preset={preset} onCancel={() => setEditing(null)} onSave={(draft) => { onSave({ ...draft, ...(category === "masturbation" ? { category: "masturbation" } : {}) }); setEditing(null); }} />
      ) : null}
      <ul className="tl-list">
        {habits.map((habit) => {
          const summary = habitSummary(state, habit.id, today);
          const weekly = habitWeekly(state, habit.id, today, 8);
          const records = state.habitEvents.filter(event => event.habitId === habit.id && event.date <= today).sort((a, b) => b.at.localeCompare(a.at));
          const total = records.length;
          const mine = lastEvent && lastEvent.habitId === habit.id ? lastEvent : null;
          return (
            <li key={habit.id} className="tl-loop">
              {editing === habit.id ? (
                <HabitForm habit={habit} onCancel={() => setEditing(null)} onSave={(draft) => { onSave({ ...draft, id: habit.id, category: habit.category ?? (category === "masturbation" ? "masturbation" : undefined) }); setEditing(null); }} />
              ) : (
                <>
                  <div className="tl-section-head" style={{ alignItems: "flex-start" }}>
                    <span className="tl-row-copy">
                      <h3 className="habit-name">{habit.name}</h3>
                      {!habit.caffeine ? <small>{`Acted on it ${summary.week === 1 ? "once" : `${summary.week} times`} this week`}</small> : null}
                    </span>
                    <details className="urge-manage"><summary>Manage</summary><div className="row-actions">
                      <button type="button" className="text-button" aria-label={`Settings for ${habit.name}`} onClick={() => setEditing(habit.id)}>
                        Settings
                      </button>
                      <ConfirmButton label={`Delete ${habit.name} and its history`} onConfirm={() => onDelete(habit.id)} />
                    </div></details>
                  </div>
                  {habit.caffeine ? <CaffeineHabit state={state} habit={habit} today={today} onEvent={onEvent} onDeleteEvent={onDeleteEvent} /> : <>
                  <div className="tl-actions" style={{ alignItems: "center" }}>
                    <button type="button" className="button secondary small" onClick={() => log(habit, "urge")}>
                      <Icon name="check" />
                      Urge passed
                    </button>
                    <button type="button" className="text-button" onClick={() => log(habit, "slip")}>
                      Acted on it
                    </button>
                  </div>
                  {mine ? (
                    <p className="tl-line" role="status" aria-live="polite">
                      Recorded.
                      {" "}
                      <button type="button" className="text-button" onClick={() => { onDeleteEvent(mine.id); setLast(null); }}>Undo</button>
                    </p>
                  ) : null}
                  {total > 0 ? (
                    <details className="simple-history"><summary>History &amp; trend</summary><p className="mind-section-description">{summary.urgesWeek} {summary.urgesWeek === 1 ? "urge" : "urges"} passed this week.</p><Tide
                      data={weekly}
                      label={`${habit.name}, times a week`}
                      min={0}
                      format={(value) => String(Math.round(value))}
                      empty=""
                      dateFormat={{ month: "short", day: "numeric" }}
                      readout={false}
                    /><ul className="urge-event-list">{records.slice(0, 30).map(event => <li key={event.id}><span><b>{event.kind === "urge" ? "Urge passed" : "Acted on it"}</b><small>{dateLabel(event.date)} · {formatTime(event.at.slice(11, 16))}</small></span><ConfirmButton label={`Delete ${event.kind === "urge" ? "urge" : "event"} from ${event.at}`} onConfirm={() => onDeleteEvent(event.id)} /></li>)}</ul></details>
                  ) : null}
                  </>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HabitForm({ habit, preset, onSave, onCancel }: { habit?: Habit; preset?: "masturbation" | "caffeine"; onSave: (draft: HabitDraft) => void; onCancel: () => void }) {
  const [name, setName] = useState(habit?.name ?? (preset === "masturbation" ? "Masturbation" : preset === "caffeine" ? "Caffeine" : ""));
  const [caffeine, setCaffeine] = useState<Habit["caffeine"]>(habit?.caffeine ?? (preset === "caffeine" ? { dailyLimitMg: null, cutoffTime: "", usualDoseMg: null } : undefined));
  return (
    <form
      className="tl-loop-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave({ name: name.trim(), caffeine });
      }}
    >
      {!habit && !preset ? <label className="urge-type-field">Track<select aria-label="Tracking type" value={caffeine ? "caffeine" : "urges"} onChange={event => {
        const enabled = event.target.value === "caffeine";
        setCaffeine(enabled ? { dailyLimitMg: null, cutoffTime: "", usualDoseMg: null } : undefined);
        setName(current => !current || current === "Caffeine" ? enabled ? "Caffeine" : "" : current);
      }}><option value="urges">Urges</option><option value="caffeine">Caffeine intake</option></select></label> : null}
      <input
        value={name}
        maxLength={120}
        placeholder="Habit"
        aria-label="Habit"
        onChange={(event) => setName(event.target.value)}
        autoFocus
      />
      {caffeine ? <CaffeineSettings value={caffeine} onChange={setCaffeine} /> : null}
      <div className="tl-actions" style={{ marginTop: 4 }}>
        <button type="submit" className="button primary" disabled={!name.trim()}>{habit ? "Save" : "Add"}</button>
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
