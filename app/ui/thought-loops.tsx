"use client";

import { useState } from "react";
import type { HealthState, LoopEvent, LoopMove, LoopRecurrence, ThoughtLoop } from "../health-model";
import { addDays, dateLabel, localDateTime } from "../health-model";
import { recordId } from "../record-id";
import { Icon } from "./icons";
import { DayStrip } from "./spark";
import { ConfirmButton } from "./primitives";
import { Tide } from "./tide";
import { formatTime } from "./format";

export type LoopDraft = { id?: string; name: string; reply: string };
const outcomes: Record<LoopMove, string> = { noticed: "Not recorded", passed: "I moved on", later: "I set it aside", hooked: "I stayed caught up in it" };
export const recurrenceLabels: Record<LoopRecurrence, string> = { once: "Just once", few: "A few times", often: "Kept returning" };

/** How many recent logs to weigh. Enough to see a direction, few enough that a
 *  bad fortnight two months ago is not still being counted against you. */
const OUTCOME_WINDOW = 12;

export type RuminationOutcome = {
  total: number;
  movedOn: number;
  /** Logs where it kept coming back through the occasion. */
  returning: number;
  cells: Array<{ date: string; state: "on" | "miss" | "half"; label: string }>;
};

/**
 * Whether the thought lets go, over the last dozen times it came up.
 *
 * Setting it aside counts as moving on: the point of the exercise is not to
 * win the argument on the spot, it is to stop the day being spent on it. A log
 * with no outcome recorded is drawn as a half mark rather than a failure —
 * "not written down" and "it caught me" are different facts.
 */
export function ruminationOutcome(events: LoopEvent[]): RuminationOutcome | null {
  if (!events.length) return null;
  // `events` arrives newest first; the strip reads oldest on the left like
  // every other strip in the app.
  const recent = events.slice(0, OUTCOME_WINDOW).slice().reverse();
  const cells = recent.map(event => {
    const moved = event.move === "passed" || event.move === "later";
    return {
      date: `${event.id}`,
      state: event.move === "noticed" ? "half" as const : moved ? "on" as const : "miss" as const,
      label: `${dateLabel(event.date, { month: "short", day: "numeric" })}: ${outcomes[event.move]}`,
    };
  });
  return {
    total: recent.length,
    movedOn: cells.filter(cell => cell.state === "on").length,
    returning: recent.filter(event => event.recurrence === "often").length,
    cells,
  };
}

export function ThoughtLoops({ state, today, onSave, onDelete, onEvent, onDeleteEvent, onNotice }: {
  state: HealthState;
  today: string;
  onSave: (loop: LoopDraft) => void;
  onDelete: (id: string) => void;
  onEvent: (event: LoopEvent) => void;
  onDeleteEvent: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  // Keep old associations intact; new records share a general rumination track.
  const loops = state.thoughtLoops.filter(loop => !loop.archived);
  const byId = new Map(state.thoughtLoops.map(loop => [loop.id, loop]));
  const events = state.loopEvents.filter(event => byId.has(event.loopId) && event.date <= today).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const [composer, setComposer] = useState<{ eventId?: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const event = composer?.eventId ? events.find(item => item.id === composer.eventId) : undefined;
  const weekly = Array.from({ length: 8 }, (_, index) => {
    const date = addDays(today, -(7 - index) * 7);
    return { date, value: events.filter(item => item.date >= addDays(date, -6) && item.date <= date).length };
  });

  if (composer) return <section className="response-workspace" aria-labelledby="response-title">
    <button type="button" className="text-button response-back" onClick={() => setComposer(null)}><Icon name="chevron" /> Rumination</button>
    <h2 id="response-title">Did it keep coming back?</h2>
    <ResponseForm key={event?.id ?? "new"} event={event} onCancel={() => setComposer(null)} onDelete={event ? () => { onDeleteEvent(event.id); setComposer(null); } : undefined} onSave={(response, move, recurrence) => {
      const existing = event ? byId.get(event.loopId) : loops.find(item => item.name.toLocaleLowerCase() === "rumination");
      const loopId = existing?.id ?? recordId("rumination");
      if (!existing) onSave({ id: loopId, name: "Rumination", reply: "" });
      const at = event?.at ?? localDateTime();
      const id = event?.id ?? recordId("occurrence");
      onEvent({ id, loopId, at, date: event?.date ?? at.slice(0, 10), move, ...(recurrence ? { recurrence } : {}), ...(response ? { response } : {}) });
      setLastSaved(id);
      setComposer(null);
      onNotice("Rumination logged.");
    }} />
  </section>;

  const outcome = ruminationOutcome(events);
  return <section className="thought-response-home rumination-home" aria-labelledby="loops-title">
    <div className="tl-section-head"><h2 className="mind-section-title" id="loops-title">Rumination</h2><button type="button" className="button primary small" onClick={() => setComposer({})}><Icon name="plus" /> Log rumination</button></div>
    <p className="response-intro">How often it returned, and what helped you move on.</p>
    {/* This used to count the days you remembered to open the app, which is a
        measure of the app and not of you — and one where more was somehow
        better, so a bad fortnight and a diligent one drew the same picture.
        What the panel is actually for is whether the thought lets go, so that
        is the number: of the times it came up, how often you moved on. */}
    {outcome ? <div className="record-block is-flat">
      <div className="record-block-value">
        <strong>{outcome.movedOn}<span className="of">/{outcome.total}</span></strong>
        <span>times you moved on</span>
      </div>
      <DayStrip cells={outcome.cells} label={`Rumination outcomes, last ${outcome.total} ${outcome.total === 1 ? "log" : "logs"}, oldest first`} />
      <div className="record-block-scale">
        <span>Filled = you moved on</span>
        <span>{outcome.returning ? `${outcome.returning} kept returning` : "none kept returning"}</span>
      </div>
    </div> : null}
    {lastSaved && events.some(item => item.id === lastSaved) ? <div className="response-saved" role="status"><Icon name="check" /><span>Saved</span><button type="button" className="text-button" onClick={() => { onDeleteEvent(lastSaved); setLastSaved(null); }}>Undo</button></div> : null}
    {events.length ? <section className="response-history rumination-recent" aria-label="Recent rumination logs"><h3>Latest log</h3><ol>
      {events.slice(0, 1).map(item => <RuminationRow key={item.id} event={item} onEdit={() => setComposer({ eventId: item.id })} />)}
    </ol></section> : <p className="mind-status">No rumination logged yet.</p>}
    {events.length ? <details className="simple-history response-history"><summary><Icon name="history" /> Earlier logs &amp; frequency</summary>
      <p className="mind-status">Logs per week. Days without a log are unrecorded.</p>
      <Tide data={weekly} label="Rumination logs per week" min={0} format={value => String(Math.round(value))} readout={false} />
      <ol>{events.slice(1, count).map(item => <RuminationRow key={item.id} event={item} onEdit={() => setComposer({ eventId: item.id })} />)}</ol>
      {events.length > count ? <button type="button" className="text-button" onClick={() => setCount(value => value + 10)}>Earlier logs</button> : null}
    </details> : null}
    {loops.length ? <details className="simple-history response-patterns"><summary>What helps me</summary><button type="button" className="text-button" onClick={() => setEditing(loops.find(item => !item.reply)?.id ?? loops[0].id)}>Add or edit reminder</button>
      {loops.filter(item => item.reply || item.id === editing).map(item => <section key={item.id}>{editing === item.id ? <ReminderForm loop={item} onCancel={() => setEditing(null)} onSave={draft => { onSave({ ...draft, id: item.id }); setEditing(null); }} /> : <><p>{item.reply || "No reminder saved."}</p><div className="tl-actions"><button type="button" className="text-button" onClick={() => setEditing(item.id)}>Edit reminder</button><ConfirmButton label="Delete reminder and linked logs" onConfirm={() => onDelete(item.id)} /></div></>}</section>)}
    </details> : null}
  </section>;
}

function RuminationRow({ event, onEdit }: { event: LoopEvent; onEdit: () => void }) {
  return <li><div><span>{dateLabel(event.date, { month: "short", day: "numeric", year: "numeric" })} · {formatTime(event.at.slice(11, 16))}</span><button type="button" className="text-button" aria-label={`Edit rumination on ${event.date} at ${event.at.slice(11, 16)}`} onClick={onEdit}><Icon name="pencil" /> Edit</button></div>
    <h4>{event.recurrence ? recurrenceLabels[event.recurrence] : "Frequency not recorded"}{event.move !== "noticed" ? ` · ${outcomes[event.move]}` : ""}</h4>
    {event.response ? <p>{event.response}</p> : null}
  </li>;
}

export function ResponseForm({ event, onSave, onCancel, onDelete }: { event?: LoopEvent; onSave: (response: string, move: LoopMove, recurrence?: LoopRecurrence) => void; onCancel: () => void; onDelete?: () => void }) {
  const [response, setResponse] = useState(event?.response ?? "");
  const [move, setMove] = useState<LoopMove>(event?.move ?? "noticed");
  const [recurrence, setRecurrence] = useState<LoopRecurrence | undefined>(event?.recurrence);
  return <form className="response-form" onSubmit={e => { e.preventDefault(); if (recurrence || event) onSave(response.trim(), move, recurrence); }}>
    {event ? <p className="tl-line">Editing {dateLabel(event.date)} · {formatTime(event.at.slice(11, 16))}</p> : null}
    <fieldset className="recurrence-choice"><legend>How often?</legend><div>{Object.entries(recurrenceLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={recurrence === value} onClick={() => setRecurrence(value as LoopRecurrence)}>{label}</button>)}</div></fieldset>
    <label>What I did <span className="field-optional">· optional</span><textarea value={response} onChange={e => setResponse(e.target.value)} placeholder="What helped, or what did you try?" rows={4} maxLength={800} /></label>
    <label>Afterward <span className="field-optional">· optional</span><select value={move} onChange={e => setMove(e.target.value as LoopMove)}>{Object.entries(outcomes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="tl-actions"><button type="submit" className="button primary" disabled={!recurrence && !event}><Icon name="check" /> Save log</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
    {onDelete ? <ConfirmButton label="Delete this record" confirmLabel="Delete this record" className="text-button record-only" onConfirm={onDelete} /> : null}
  </form>;
}

function ReminderForm({ loop, onSave, onCancel }: { loop: ThoughtLoop; onSave: (draft: Omit<LoopDraft, "id">) => void; onCancel: () => void }) {
  const [reply, setReply] = useState(loop.reply);
  return <form className="response-form" onSubmit={e => { e.preventDefault(); onSave({ name: loop.name, reply: reply.trim() }); }}>
    <label>What helps me respond<textarea value={reply} onChange={e => setReply(e.target.value)} maxLength={400} rows={3} /></label>
    <div className="tl-actions"><button type="submit" className="button primary small">Save reminder</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
  </form>;
}
