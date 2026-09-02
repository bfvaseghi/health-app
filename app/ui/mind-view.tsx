"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, TherapyNote, ThoughtJournalEntry } from "../health-model";
import { addDays, dateLabel, mindSummary } from "../health-model";
import { meditationWeeklyMinutes } from "../series";
import { Icon } from "./icons";
import { ConfirmButton, Empty } from "./primitives";
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

      <section className="panel wide-panel mind-agenda">
        <div className="panel-head wrap">
          <div>
            <h2>For therapy</h2>
          </div>
          <span className="panel-meta">{`${open.length} waiting`}</span>
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
          <ul className="therapy-list">
            {open.map((note) => (
              <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
            ))}
          </ul>
        ) : (
          <Empty
            icon="mind"
            title="Nothing waiting"
            body="Add a thought the day it turns up. Whatever is on this list comes out again in the appointment summary."
          />
        )}

        {raised.length ? (
          <>
            <button type="button" className="text-button" onClick={() => setShowRaised((value) => !value)}>
              {showRaised ? "Hide" : `Show ${raised.length} already raised`} <Icon name="chevron" />
            </button>
            {showRaised ? (
              <ul className="therapy-list raised">
                {raised.map((note) => (
                  <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="panel wide-panel mind-history">
        <div className="panel-head">
          <div>
            <h2>Last 14 days</h2>
          </div>
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
        <p className="panel-body">
          The top number is minutes meditated; the bar underneath marks a day you journaled.
        </p>
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
    <section className="panel wide-panel thought-journal" aria-labelledby="thought-journal-title">
      <div className="panel-head wrap">
        <div>
          <p className="kicker">Private reflections</p>
          <h2 id="thought-journal-title">Thought journal</h2>
        </div>
        <button type="button" className="button secondary small" onClick={() => void pasteFromNotes()}>
          <Icon name="copy" /> Paste from Notes
        </button>
      </div>
      <p className="panel-body">Write freely here. Nothing becomes a therapy topic unless you add it to that list yourself.</p>
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
        <ol className="thought-list">
          {shown.map((entry) => (
            <li key={entry.id}>
              <div className="thought-meta">
                <span>{entry.source === "apple-notes" ? "Apple Notes" : "Baseline"}</span>
                <time dateTime={entry.date}>{dateLabel(entry.date, { month: "short", day: "numeric", year: "numeric" })}</time>
              </div>
              {entry.title ? <h3>{entry.title}</h3> : null}
              <p>{entry.text}</p>
              <ConfirmButton label={`Delete thought from ${entry.date}`} onConfirm={() => onDelete(entry.id)} />
            </li>
          ))}
        </ol>
      ) : (
        <Empty icon="journal" title="No thoughts yet" body="Write here or paste text you copied from Apple Notes." />
      )}
      {entries.length > 4 ? (
        <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show recent" : `Show all ${entries.length}`} <Icon name="chevron" />
        </button>
      ) : null}
      <p className="thought-shortcut-note">
        One-tap from Apple Notes: set up the Shortcut in Data & goals.
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
    <li>
      <button
        type="button"
        className={note.shared ? "therapy-check done" : "therapy-check"}
        aria-label={note.shared ? `Move “${note.text}” back to the list` : `Mark “${note.text}” as raised`}
        onClick={() => onToggle(note)}
      >
        <Icon name="check" />
      </button>
      <div>
        <p>{note.text}</p>
        <small>
          {note.shared && note.sharedDate
            ? `Raised ${dateLabel(note.sharedDate, { month: "short", day: "numeric" })}`
            : dateLabel(note.date, { month: "short", day: "numeric" })}
        </small>
      </div>
      <ConfirmButton label={`Delete “${note.text}”`} onConfirm={() => onDelete(note.id)} />
    </li>
  );
}
