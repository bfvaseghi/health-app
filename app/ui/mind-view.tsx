"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, LoopEvent, LoopMove, TherapyNote, ThoughtJournalEntry, ThoughtLoop } from "../health-model";
import { DEFAULT_LOOP_OUTCOMES, addDays, dateLabel, localDateTime, loopSummary, loopWeekly, mindSummary } from "../health-model";
import { meditationWeeklyMinutes } from "../series";
import { Icon } from "./icons";
import { ConfirmButton } from "./primitives";
import { Tide } from "./tide";

/**
 * Meditation, journaling, and the running list of things to raise. The list is
 * the point of the page: a thought is only ever captured on the day it turns
 * up, and trying to recall it in the room is how it gets lost.
 */
export function MindView({
  state,
  today,
  updateDaily,
  onAddNote,
  onToggleNote,
  onDeleteNote,
  onAddThought,
  onDeleteThought,
  onSaveLoop,
  onDeleteLoop,
  onLoopEvent,
  onDeleteLoopEvent,
  onNotice,
}: {
  state: HealthState;
  today: string;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  onAddNote: (text: string) => void;
  onToggleNote: (note: TherapyNote) => void;
  onDeleteNote: (id: string) => void;
  onAddThought: (entry: { title: string; text: string; source: ThoughtJournalEntry["source"] }) => void;
  onDeleteThought: (id: string) => void;
  onSaveLoop: (loop: LoopDraft) => void;
  onDeleteLoop: (id: string) => void;
  onLoopEvent: (event: LoopEvent) => void;
  onDeleteLoopEvent: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [showRaised, setShowRaised] = useState(false);

  const summary = useMemo(() => mindSummary(state, today, 30), [state, today]);
  const open = state.therapyNotes.filter((note) => !note.shared);
  const raised = state.therapyNotes.filter((note) => note.shared);
  const week = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));
  const thoughtDates = new Set(state.thoughtJournal.map((entry) => entry.date));
  const weekly = useMemo(() => meditationWeeklyMinutes(state, today, 8), [state, today]);
  const recentWeek = useMemo(() => mindSummary(state, today, 7), [state, today]);
  const todayEntry = state.dailyEntries.find((item) => item.date === today);
  const minutes = todayEntry?.meditationMinutes ?? 0;
  const journaled = Boolean(todayEntry?.journaled) || thoughtDates.has(today);
  const loopsToday = state.loopEvents.filter((event) => event.date === today).length;
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen"];
  const headline = minutes
    ? `${minutes <= 15 && words[minutes] ? words[minutes] : minutes} quiet ${minutes === 1 ? "minute" : "minutes"}.`
    : journaled
      ? "A page written."
      : "A quiet mind, unlogged.";
  const lede = [
    minutes ? "meditated today" : "no meditation logged yet",
    journaled ? "journal written" : "journal not yet written",
    open.length ? `${open.length} ${open.length === 1 ? "thing" : "things"} waiting for therapy` : "nothing waiting for therapy",
    ...(loopsToday ? [`${loopsToday} ${loopsToday === 1 ? "loop" : "loops"} noticed today`] : []),
  ].join(" · ");

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
  }

  return (
    <div className="page mind-page">
      <span className="tl-caps">Mind · today</span>
      <h1 className="tl-hero" tabIndex={-1}>{headline}</h1>
      <p className="tl-lede">{lede}</p>

      <TodayPractices state={state} today={today} updateDaily={updateDaily} />

      <ThoughtLoops
        state={state}
        today={today}
        onSave={onSaveLoop}
        onDelete={onDeleteLoop}
        onEvent={onLoopEvent}
        onDeleteEvent={onDeleteLoopEvent}
        onNotice={onNotice}
      />

      <section className="tl-section" aria-label="Meditation, minutes a week">
        <div className="tl-section-head">
          <span className="tl-caps">Meditation · minutes a week · 8 weeks</span>
          <span className="tl-meta"><b>{recentWeek.meditationDays}</b>{` of the last 7 days`}</span>
        </div>
        <Tide data={weekly} label="Meditation, minutes a week" unit=" min" min={0} format={(value) => String(Math.round(value))} empty="Sit a few times and the tide appears." />
      </section>

      <ThoughtJournal
        entries={state.thoughtJournal}
        onAdd={onAddThought}
        onDelete={onDeleteThought}
        onNotice={onNotice}
      />

      <section className="tl-section" aria-labelledby="therapy-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="therapy-title" style={{ margin: 0 }}>For therapy</h2>
          <span className="tl-meta">{open.length ? `${open.length} waiting` : "nothing waiting"}</span>
        </div>

        <form className="note-form" onSubmit={submitNote}>
          <input
            value={draft}
            placeholder="Something to bring up next session"
            aria-label="Something to bring up next session"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="button primary" disabled={!draft.trim()}>
            <Icon name="plus" />
            Add
          </button>
        </form>

        {open.length ? (
          <ul className="tl-rows tl-list">
            {open.map((note) => (
              <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
            ))}
          </ul>
        ) : (
          <p className="tl-line">Add a thought the day it turns up. Whatever is on this list comes out again in the appointment summary.</p>
        )}

        {raised.length ? (
          <>
            <p className="tl-line">
              <button type="button" className="text-button" onClick={() => setShowRaised((value) => !value)}>
                {showRaised ? "Hide the raised" : `Show ${raised.length} already raised`}
              </button>
            </p>
            {showRaised ? (
              <ul className="tl-rows tl-list">
                {raised.map((note) => (
                  <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="tl-section" aria-label="Meditation and journaling, last fourteen days">
        <div className="tl-section-head">
          <span className="tl-caps">Last 14 days</span>
          <span className="tl-meta">minutes sat · a mark under a journaled day</span>
        </div>
        <ol className="mind-strip" aria-label="Meditation and journaling, last fourteen days">
          {week.map((date) => {
            const entry = state.dailyEntries.find((item) => item.date === date);
            const minutes = entry?.meditationMinutes ?? 0;
            const journaled = Boolean(entry?.journaled) || thoughtDates.has(date);
            return (
              <li
                key={date}
                className={date === today ? "current" : ""}
                aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}: ${
                  minutes ? `${minutes} minutes meditated` : "no meditation"
                }, ${journaled ? "journaled" : "not journaled"}.`}
              >
                <small aria-hidden="true">{dateLabel(date, { weekday: "narrow" })}</small>
                <span aria-hidden="true" className={minutes ? "day-dot strong" : "day-dot"}>
                  {minutes || "—"}
                </span>
                <i aria-hidden="true" className={journaled ? "med-pip is-taken" : "med-pip"} />
              </li>
            );
          })}
        </ol>
      </section>

      <p className="tl-line">
        {`Last 30 days — `}
        <b>{summary.meditationDays}</b>
        {` ${summary.meditationDays === 1 ? "day" : "days"} meditated, `}
        <b>{summary.meditationMinutes}</b>
        {` minutes in total, journaled `}
        <b>{summary.journalDays}</b>
        {` of 30, `}
        <b>{open.length}</b>
        {` to raise and `}
        <b>{raised.length}</b>
        {` already covered.`}
      </p>
    </div>
  );
}

function ThoughtJournal({
  entries,
  onAdd,
  onDelete,
  onNotice,
}: {
  entries: ThoughtJournalEntry[];
  onAdd: (entry: { title: string; text: string; source: ThoughtJournalEntry["source"] }) => void;
  onDelete: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<ThoughtJournalEntry["source"]>("manual");
  const [showAll, setShowAll] = useState(false);

  async function pasteFromNotes() {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) {
        onNotice("Copy a note in Apple Notes first.");
        return;
      }
      setText((current) => current.trim() ? `${current.trimEnd()}\n\n${value}` : value);
      setSource("apple-notes");
      onNotice(text.trim() ? "Apple Notes text added below your draft." : "Apple Notes text pasted. Review it before saving.");
    } catch {
      onNotice("Copy the note, then press and hold in the journal box to paste it.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd({ title: title.trim(), text: value, source });
    setTitle("");
    setText("");
    setSource("manual");
  }

  const shown = showAll ? entries : entries.slice(0, 4);
  return (
    <section className="tl-section" aria-labelledby="thought-journal-title">
      <div className="tl-section-head">
        <h2 className="tl-caps" id="thought-journal-title" style={{ margin: 0 }}>
          {entries.length ? `Thought journal · ${entries.length}` : "Thought journal"}
        </h2>
        <button type="button" className="text-button" onClick={() => void pasteFromNotes()}>
          <Icon name="copy" /> Paste from Notes
        </button>
      </div>
      <form className="thought-form" onSubmit={submit}>
        <input
          value={title}
          maxLength={160}
          placeholder="Title (optional)"
          aria-label="Thought title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          value={text}
          maxLength={10_000}
          placeholder="What is on your mind?"
          aria-label="Thought journal entry"
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value) setSource("manual");
          }}
        />
        <div className="thought-form-foot">
          <small>{source === "apple-notes" ? "Pasted from Apple Notes" : "Saved to your private Baseline record"}</small>
          <button type="submit" className="button primary" disabled={!text.trim()}>
            <Icon name="plus" /> Save thought
          </button>
        </div>
      </form>

      {shown.length ? (
        <ol className="tl-rows tl-list">
          {shown.map((entry) => (
            <li key={entry.id} className="tl-row is-static" style={{ alignItems: "flex-start" }}>
              <div className="tl-row-copy">
                <b>
                  {entry.title || dateLabel(entry.date, { weekday: "long", month: "long", day: "numeric" })}
                  <span className="tl-source">{entry.source === "apple-notes" ? "Apple Notes" : "Baseline"}</span>
                </b>
                {entry.title ? <small>{dateLabel(entry.date, { month: "long", day: "numeric", year: "numeric" })}</small> : null}
                <p className="tl-thought-text">{entry.text}</p>
              </div>
              <ConfirmButton label={`Delete thought from ${entry.date}`} onConfirm={() => onDelete(entry.id)} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="tl-line">No thoughts yet. Write here or paste text you copied from Apple Notes.</p>
      )}
      {entries.length > 4 ? (
        <p className="tl-line">
          <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show recent" : `Show all ${entries.length}`}
          </button>
        </p>
      ) : null}
      <p className="tl-line">
        Nothing here becomes a therapy topic unless you add it to that list yourself. One tap from Apple Notes: set up the Shortcut in Data &amp; goals.
      </p>
    </section>
  );
}

function TodayPractices({
  state,
  today,
  updateDaily,
}: {
  state: HealthState;
  today: string;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
}) {
  const entry = state.dailyEntries.find((item) => item.date === today);
  const minutes = entry?.meditationMinutes ?? null;
  return (
    <section className="tl-actions mind-practices" aria-label="Today's practices">
      <div className="practice-actions">
        <span role="group" aria-label="Meditation minutes">
          {[10, 20].map((value) => (
            <button
              type="button"
              key={value}
              className={minutes === value ? "chip primary" : "chip"}
              aria-pressed={minutes === value}
              onClick={() => updateDaily(today, (current) => ({ ...current, meditationMinutes: minutes === value ? null : value }))}
            >
              <Icon name="mind" /> {value} min
            </button>
          ))}
        </span>
        <button
          type="button"
          className={entry?.journaled ? "button primary" : "button secondary"}
          aria-pressed={entry?.journaled === true}
          onClick={() => updateDaily(today, (current) => ({ ...current, journaled: !current.journaled }))}
        >
          <Icon name="journal" /> {entry?.journaled ? "Journaled" : "Mark journaled"}
        </button>
      </div>
    </section>
  );
}

function TherapyRow({
  note,
  onToggle,
  onDelete,
}: {
  note: TherapyNote;
  onToggle: (note: TherapyNote) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className={note.shared ? "tl-row is-static done" : "tl-row is-static"}>
      <button
        type="button"
        className={note.shared ? "therapy-check done" : "therapy-check"}
        aria-label={note.shared ? `Move “${note.text}” back to the list` : `Mark “${note.text}” as raised`}
        onClick={() => onToggle(note)}
      >
        <Icon name="check" />
      </button>
      <span className="tl-row-copy">
        <b className="tl-plain">{note.text}</b>
        <small>
          {note.shared && note.sharedDate
            ? `Raised ${dateLabel(note.sharedDate, { month: "short", day: "numeric" })}`
            : dateLabel(note.date, { month: "short", day: "numeric" })}
        </small>
      </span>
      <ConfirmButton label={`Delete “${note.text}”`} onConfirm={() => onDelete(note.id)} />
    </li>
  );
}

export type LoopDraft = { id?: string; name: string; reply: string; outcomes?: ThoughtLoop["outcomes"]; laterAt?: string };

const SUGGESTED_REPLIES = ["Not now.", "It's a thought.", "Later, at six.", "It passed before."];

const OUTCOME_KEYS: Array<Exclude<LoopMove, "noticed">> = ["passed", "later", "hooked"];

/** "18:00" as "6 PM", "18:30" as "6:30 PM". */
function clock(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Thought loops. Three things have evidence behind them for a thought that keeps
 * coming back: noticing it as the loop rather than as news, returning to what
 * you were doing, and giving it a set time later instead of now. Trying not to
 * think it is the one thing that makes it louder. So: name it once, choose what
 * you will say back, tap it every time it comes up, then say what happened.
 */
function ThoughtLoops({
  state,
  today,
  onSave,
  onDelete,
  onEvent,
  onDeleteEvent,
  onNotice,
}: {
  state: HealthState;
  today: string;
  onSave: (loop: LoopDraft) => void;
  onDelete: (id: string) => void;
  onEvent: (event: LoopEvent) => void;
  onDeleteEvent: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const loops = state.thoughtLoops.filter((loop) => !loop.archived);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  // The reply card stays up for the loop you just tapped, holding the event so
  // a move or "it passed" lands on that tap and not a new one.
  const [live, setLive] = useState<{ loopId: string; eventId: string } | null>(() => {
    // A tap from the last ten minutes is still the moment: leaving the page and
    // coming back finds the card where it was.
    const recent = state.loopEvents.find((event) => Date.parse(event.at) >= Date.now() - 10 * 60_000);
    return recent ? { loopId: recent.loopId, eventId: recent.id } : null;
  });

  const cameUp = (loop: ThoughtLoop) => {
    const at = localDateTime();
    const event: LoopEvent = { id: `${loop.id}-${at}-${Math.random().toString(36).slice(2, 6)}`, loopId: loop.id, at, date: at.slice(0, 10), move: "noticed" };
    onEvent(event);
    setLive({ loopId: loop.id, eventId: event.id });
  };
  const current = live ? state.loopEvents.find((event) => event.id === live.eventId) ?? null : null;

  return (
    <section className="tl-section" aria-labelledby="loops-title">
      <div className="tl-section-head">
        <h2 className="tl-caps" id="loops-title" style={{ margin: 0 }}>
          {loops.length ? `Thought loops · ${loops.length}` : "Thought loops"}
        </h2>
        {editing === "new" ? null : (
          <button type="button" className="text-button" onClick={() => setEditing("new")}>
            <Icon name="plus" /> Add a thought
          </button>
        )}
      </div>
      {!loops.length && editing !== "new" ? (
        <p className="tl-line" style={{ marginTop: 8 }}>
          A thought that keeps coming back, and the line you answer it with. Tap it each time it comes up.
        </p>
      ) : null}
      {editing === "new" ? (
        <LoopForm
          onCancel={() => setEditing(null)}
          onSave={(draft) => {
            onSave(draft);
            setEditing(null);
            onNotice("Added.");
          }}
        />
      ) : null}

      <ul className="tl-list">
        {loops.map((loop) => {
          const summary = loopSummary(state, loop.id, today);
          const weekly = loopWeekly(state, loop.id, today, 8);
          const total = state.loopEvents.filter((event) => event.loopId === loop.id).length;
          const isLive = live?.loopId === loop.id && current !== null;
          return (
            <li key={loop.id} className="tl-loop">
              {editing === loop.id ? (
                <LoopForm
                  loop={loop}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) => {
                    onSave({ ...draft, id: loop.id });
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <div className="tl-section-head" style={{ alignItems: "flex-start" }}>
                    <span className="tl-row-copy">
                      <b>{loop.name}</b>
                      <small>{summary.sentence}</small>
                    </span>
                    <div className="row-actions">
                      <button type="button" className="icon-button" aria-label={`Edit ${loop.name}`} onClick={() => setEditing(loop.id)}>
                        <Icon name="pencil" />
                      </button>
                      <ConfirmButton
                        label={`Delete ${loop.name} and every time it came up`}
                        onConfirm={() => onDelete(loop.id)}
                      />
                    </div>
                  </div>
                  <div className="tl-actions" style={{ alignItems: "center" }}>
                    <button type="button" className="button primary" onClick={() => cameUp(loop)}>
                      <Icon name="mind" />
                      It came up
                    </button>
                    <span className="tl-meta" style={{ textAlign: "left" }}>
                      {summary.today ? `${summary.today} ${summary.today === 1 ? "time" : "times"} today` : "not yet today"}
                    </span>
                  </div>
                  {isLive && current ? (
                    <div className="tl-reply" role="status" aria-live="polite">
                      <p className="tl-reply-line">{loop.reply || "Not now."}</p>
                      <div className="tl-reply-moves" role="group" aria-label="What happened">
                        {OUTCOME_KEYS.map((move) => (
                          <button
                            key={move}
                            type="button"
                            className={current.move === move ? "chip primary small" : "chip small"}
                            aria-pressed={current.move === move}
                            onClick={() => onEvent({ ...current, move: current.move === move ? "noticed" : move })}
                          >
                            {loop.outcomes[move]}
                          </button>
                        ))}
                      </div>
                      {current.move === "later" ? <p className="tl-reply-ask">{`${clock(loop.laterAt)} today. It is on Today until then.`}</p> : null}
                      <p className="tl-line" style={{ marginTop: 10 }}>
                        <button type="button" className="text-button" onClick={() => { onDeleteEvent(current.id); setLive(null); }}>
                          Undo this tap
                        </button>
                        {" · "}
                        <button type="button" className="text-button" onClick={() => setLive(null)}>
                          Close
                        </button>
                      </p>
                    </div>
                  ) : null}
                  {total >= 3 ? (
                    <Tide
                      data={weekly}
                      label={`${loop.name}, times a week`}
                      min={0}
                      format={(value) => String(Math.round(value))}
                      empty=""
                      dateFormat={{ month: "short", day: "numeric" }}
                    />
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LoopForm({
  loop,
  onSave,
  onCancel,
}: {
  loop?: ThoughtLoop;
  onSave: (draft: Omit<LoopDraft, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(loop?.name ?? "");
  const [reply, setReply] = useState(loop?.reply ?? "");
  const [outcomes, setOutcomes] = useState<ThoughtLoop["outcomes"]>(loop?.outcomes ?? DEFAULT_LOOP_OUTCOMES);
  const [laterAt, setLaterAt] = useState(loop?.laterAt ?? "18:00");
  return (
    <form
      className="tl-loop-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        onSave({ name: name.trim(), reply: reply.trim(), outcomes, laterAt });
      }}
    >
      <input
        value={name}
        maxLength={120}
        placeholder="The thought, in a few words"
        aria-label="The thought, in a few words"
        onChange={(event) => setName(event.target.value)}
        autoFocus
      />
      <input
        value={reply}
        maxLength={400}
        placeholder="What you say back"
        aria-label="What you say back"
        onChange={(event) => setReply(event.target.value)}
      />
      <div className="tl-suggest" role="group" aria-label="Some lines">
        {SUGGESTED_REPLIES.map((line) => (
          <button key={line} type="button" className={reply === line ? "chip primary small" : "chip small"} onClick={() => setReply(line)}>
            {line}
          </button>
        ))}
      </div>
      {loop ? (
        <>
          <span className="tl-caps" style={{ marginTop: 6 }}>Your words for what happened</span>
          <div className="tl-loop-words">
            {OUTCOME_KEYS.map((move) => (
              <input
                key={move}
                value={outcomes[move]}
                maxLength={40}
                aria-label={`Your words for ${DEFAULT_LOOP_OUTCOMES[move].toLowerCase()}`}
                placeholder={DEFAULT_LOOP_OUTCOMES[move]}
                onChange={(event) => setOutcomes((current) => ({ ...current, [move]: event.target.value }))}
              />
            ))}
          </div>
          <label className="tl-loop-time">
            <span>Later means</span>
            <input type="time" value={laterAt} aria-label="Time for later" onChange={(event) => setLaterAt(event.target.value || "18:00")} />
          </label>
        </>
      ) : null}
      <div className="tl-actions" style={{ marginTop: 4 }}>
        <button type="submit" className="button primary" disabled={!name.trim()}>
          {loop ? "Save" : "Add"}
        </button>
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
