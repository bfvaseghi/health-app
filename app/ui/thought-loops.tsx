"use client";

import { useState } from "react";
import type { HealthState, LoopEvent, LoopGrip, LoopMode, LoopMove, LoopRecurrence, ThoughtLoop } from "../health-model";
import { addDays, dateLabel, localDateTime, loopCircling, loopGripHeld } from "../health-model";
import { recordId } from "../record-id";
import { Icon } from "./icons";
import { ConfirmButton } from "./primitives";
import { Tide } from "./tide";
import { formatTime } from "./format";

export type LoopDraft = { id?: string; name: string; reply: string };
const outcomes: Record<LoopMove, string> = { noticed: "Not recorded", passed: "I moved on", later: "I set it aside", hooked: "I stayed caught up in it" };
export const recurrenceLabels: Record<LoopRecurrence, string> = { once: "Just once", few: "A few times", often: "Kept returning" };
export const gripLabels: Record<LoopGrip, string> = { minutes: "A few minutes", hour: "An hour or so", day: "Most of the day" };
export const modeLabels: Record<LoopMode, string> = { circling: "Going in circles", solving: "Working it out" };

/** How many recent logs to weigh. Enough to see a direction, few enough that a
 *  bad fortnight two months ago is not still being counted against you. */
const OUTCOME_WINDOW = 12;
/** Weeks of counts on the curve. Two months is enough to show a direction. */
const WEEKS = 8;

export type RuminationLoad = {
  /** Logs in the last seven days — the headline. */
  week: number;
  /** One point per week, oldest first, for the curve. */
  weekly: Array<{ date: string; value: number }>;
  /** Mean per week across the weeks drawn, to say whether this week is usual. */
  average: number;
  /** Mean per week over the last four weeks and the four before them. Half
   *  against half is steadier than this-week-against-average, which swings on
   *  one quiet week. */
  recent: number;
  prior: number;
  /** Of the recent logs that recorded it, how many held an hour or more. */
  held: { yes: number; of: number };
  /** Of the recent logs that recorded it, how many were circling. */
  circling: { yes: number; of: number };
};

/**
 * How much of you it is taking, rather than how often you saw it off.
 *
 * The panel used to print how many of the last dozen times you moved on, which
 * was the wrong number twice over. You log at the end of an episode, once you
 * are already out of it, so the sample is the ones that ended — it sat at
 * eleven of twelve and could not move. And scoring yourself on making a thought
 * go away rewards pushing it away, which is the response that brings it back.
 *
 * What replaces it is a count, because a count is a fact rather than a grade,
 * it can fall, and it is what the standard measures of rumination actually
 * ask. Beside it, the two things that separate a bad week from a busy one at
 * the same count: how long each one held, and whether you were circling or
 * getting somewhere.
 */
export function ruminationLoad(events: LoopEvent[], today: string): RuminationLoad | null {
  if (!events.length) return null;
  const weekly = Array.from({ length: WEEKS }, (_, index) => {
    const date = addDays(today, -(WEEKS - 1 - index) * 7);
    return { date, value: events.filter(item => item.date >= addDays(date, -6) && item.date <= date).length };
  });
  const latest = events.slice(0, OUTCOME_WINDOW);
  const gripped = latest.map(loopGripHeld).filter((value): value is boolean => value !== null);
  const modes = latest.map(loopCircling).filter((value): value is boolean => value !== null);
  const mean = (points: Array<{ value: number }>) => points.reduce((sum, point) => sum + point.value, 0) / points.length;
  return {
    week: weekly[weekly.length - 1].value,
    weekly,
    average: mean(weekly),
    recent: mean(weekly.slice(WEEKS / 2)),
    prior: mean(weekly.slice(0, WEEKS / 2)),
    held: { yes: gripped.filter(Boolean).length, of: gripped.length },
    circling: { yes: modes.filter(Boolean).length, of: modes.length },
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

  if (composer) return <section className="response-workspace" aria-labelledby="response-title">
    <button type="button" className="text-button response-back" onClick={() => setComposer(null)}><Icon name="chevron" /> Rumination</button>
    <h2 id="response-title">How did it go?</h2>
    <ResponseForm key={event?.id ?? "new"} event={event} onCancel={() => setComposer(null)} onDelete={event ? () => { onDeleteEvent(event.id); setComposer(null); } : undefined} onSave={(response, grip, mode) => {
      const existing = event ? byId.get(event.loopId) : loops.find(item => item.name.toLocaleLowerCase() === "rumination");
      const loopId = existing?.id ?? recordId("rumination");
      if (!existing) onSave({ id: loopId, name: "Rumination", reply: "" });
      const at = event?.at ?? localDateTime();
      const id = event?.id ?? recordId("occurrence");
      // The legacy fields ride along untouched when an old record is edited:
      // the two questions they answered are no longer asked, but erasing what
      // the person already wrote down is not this form's business.
      onEvent({
        id, loopId, at, date: event?.date ?? at.slice(0, 10), move: event?.move ?? "noticed",
        ...(event?.recurrence ? { recurrence: event.recurrence } : {}),
        ...(grip ? { grip } : {}), ...(mode ? { mode } : {}), ...(response ? { response } : {}),
      });
      setLastSaved(id);
      setComposer(null);
      onNotice("Rumination logged.");
    }} />
  </section>;

  const load = ruminationLoad(events, today);
  // What you did, in your own words, most recently and without repeats. This is
  // the one part of the panel you can act on — the thing that worked last time
  // — so it sits in the body rather than behind a fold at the bottom.
  const helps = [...new Set(events.map(item => item.response?.trim()).filter((text): text is string => Boolean(text)))].slice(0, 3);
  const reminder = loops.find(item => item.reply)?.reply;
  return <section className="thought-response-home rumination-home" aria-labelledby="loops-title">
    <div className="tl-section-head"><h2 className="mind-section-title" id="loops-title">Rumination</h2><button type="button" className="button primary small" onClick={() => setComposer({})}><Icon name="plus" /> Log rumination</button></div>
    <p className="response-intro">How often it comes up, how long it holds you, and what gets you out.</p>
    {/* The headline is a count, not a score. It used to be how many of the last
        dozen times you moved on, which sat at eleven of twelve because you only
        log once an episode has ended — and which quietly rewarded pushing a
        thought away, the one response that brings it back. A count of what
        happened can fall, and falling is the thing worth seeing. */}
    {load ? <div className="record-block is-flat">
      <div className="record-block-value">
        <strong>{load.week}</strong>
        <span>{load.week === 1 ? "time this week" : "times this week"}</span>
      </div>
      <Tide data={load.weekly} label="Times rumination came up, per week" min={0} format={value => String(Math.round(value))} dateFormat={{ month: "short", day: "numeric" }} readout={false} showValue={false} height={92} />
      <div className="record-block-scale">
        <span>Last {WEEKS} weeks · week ending</span>
        <span>{trendLine(load)}</span>
      </div>
    </div> : null}
    {load && (load.held.of >= 3 || load.circling.of >= 3) ? <dl className="rumination-facts">
      {load.held.of >= 3 ? <div><dt>Held an hour or more</dt><dd>{load.held.yes} <small>of {load.held.of}</small></dd></div> : null}
      {load.circling.of >= 3 ? <div><dt>Going in circles</dt><dd>{load.circling.yes} <small>of {load.circling.of}</small></dd></div> : null}
    </dl> : null}
    {lastSaved && events.some(item => item.id === lastSaved) ? <div className="response-saved" role="status"><Icon name="check" /><span>Saved</span><button type="button" className="text-button" onClick={() => { onDeleteEvent(lastSaved); setLastSaved(null); }}>Undo</button></div> : null}
    {helps.length || reminder ? <section className="rumination-helps" aria-label="What helps">
      <h3>What helps</h3>
      {reminder ? <p className="rumination-reminder">{reminder}</p> : null}
      {helps.length ? <ul>{helps.map(text => <li key={text}>{text}</li>)}</ul> : null}
    </section> : null}
    {events.length ? <section className="response-history rumination-recent" aria-label="Recent rumination logs"><h3>Latest log</h3><ol>
      {events.slice(0, 1).map(item => <RuminationRow key={item.id} event={item} onEdit={() => setComposer({ eventId: item.id })} />)}
    </ol></section> : <p className="mind-status">No rumination logged yet.</p>}
    {events.length ? <details className="simple-history response-history"><summary><Icon name="history" /> Earlier logs</summary>
      <p className="mind-status">Days without a log are unrecorded, not zero.</p>
      <ol>{events.slice(1, count).map(item => <RuminationRow key={item.id} event={item} onEdit={() => setComposer({ eventId: item.id })} />)}</ol>
      {events.length > count ? <button type="button" className="text-button" onClick={() => setCount(value => value + 10)}>Earlier logs</button> : null}
    </details> : null}
    {loops.length ? <details className="simple-history response-patterns"><summary>Edit what helps</summary><button type="button" className="text-button" onClick={() => setEditing(loops.find(item => !item.reply)?.id ?? loops[0].id)}>Add or edit reminder</button>
      {loops.filter(item => item.reply || item.id === editing).map(item => <section key={item.id}>{editing === item.id ? <ReminderForm loop={item} onCancel={() => setEditing(null)} onSave={draft => { onSave({ ...draft, id: item.id }); setEditing(null); }} /> : <><p>{item.reply || "No reminder saved."}</p><div className="tl-actions"><button type="button" className="text-button" onClick={() => setEditing(item.id)}>Edit reminder</button><ConfirmButton label="Delete reminder and linked logs" onConfirm={() => onDelete(item.id)} /></div></>}</section>)}
    </details> : null}
  </section>;
}

/**
 * The last four weeks against the four before them, in a phrase.
 *
 * Half against half rather than this-week-against-average: one quiet week
 * should not read as a recovery, and a single bad one should not read as a
 * relapse. Below a whole log a week of difference it says neither.
 */
function trendLine(load: RuminationLoad): string {
  const shift = load.recent - load.prior;
  // Whole logs. "Down from 9.8 a week" claims a precision that counting things
  // that happened to you does not have.
  if (Math.abs(shift) >= 1) return `${shift < 0 ? "Down" : "Up"} from ${Math.round(load.prior)} a week`;
  return load.average < 0.5 ? "Less than one a week" : `About ${Math.round(load.average)} a week`;
}

/**
 * One log in the list. New records say how long it held and which kind it was;
 * older ones still say what they were asked at the time, rather than showing a
 * gap where a question they never saw would have gone.
 */
function RuminationRow({ event, onEdit }: { event: LoopEvent; onEdit: () => void }) {
  const parts = [
    event.grip ? gripLabels[event.grip] : event.recurrence ? recurrenceLabels[event.recurrence] : null,
    event.mode ? modeLabels[event.mode] : event.move !== "noticed" ? outcomes[event.move] : null,
  ].filter(Boolean);
  return <li><div><span>{dateLabel(event.date, { month: "short", day: "numeric", year: "numeric" })} · {formatTime(event.at.slice(11, 16))}</span><button type="button" className="text-button" aria-label={`Edit rumination on ${event.date} at ${event.at.slice(11, 16)}`} onClick={onEdit}><Icon name="pencil" /> Edit</button></div>
    <h4>{parts.length ? parts.join(" · ") : "Nothing recorded"}</h4>
    {event.response ? <p>{event.response}</p> : null}
  </li>;
}

/**
 * Two taps and a box.
 *
 * How long it held you is the severity measure — the time it takes is what
 * tracks how the day goes. Whether you were circling or working it out is the
 * one distinction that separates a bad week from a busy one at the same count.
 * Neither asks you to grade yourself, and neither asks what the thought was.
 */
export function ResponseForm({ event, onSave, onCancel, onDelete }: { event?: LoopEvent; onSave: (response: string, grip?: LoopGrip, mode?: LoopMode) => void; onCancel: () => void; onDelete?: () => void }) {
  const [response, setResponse] = useState(event?.response ?? "");
  const [grip, setGrip] = useState<LoopGrip | undefined>(event?.grip);
  const [mode, setMode] = useState<LoopMode | undefined>(event?.mode);
  return <form className="response-form" onSubmit={e => { e.preventDefault(); if (grip || event) onSave(response.trim(), grip, mode); }}>
    {event ? <p className="tl-line">Editing {dateLabel(event.date)} · {formatTime(event.at.slice(11, 16))}</p> : null}
    <fieldset className="recurrence-choice"><legend>How long did it hold you?</legend><div>{Object.entries(gripLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={grip === value} onClick={() => setGrip(value as LoopGrip)}>{label}</button>)}</div></fieldset>
    <fieldset className="recurrence-choice"><legend>Which was it? <span className="field-optional">· optional</span></legend><div>{Object.entries(modeLabels).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(mode === value ? undefined : value as LoopMode)}>{label}</button>)}</div></fieldset>
    <label>What I did <span className="field-optional">· optional</span><textarea value={response} onChange={e => setResponse(e.target.value)} placeholder="What helped, or what did you try?" rows={4} maxLength={800} /></label>
    <div className="tl-actions"><button type="submit" className="button primary" disabled={!grip && !event}><Icon name="check" /> Save log</button><button type="button" className="text-button" onClick={onCancel}>Cancel</button></div>
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
