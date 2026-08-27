"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, TherapyNote, ThoughtJournalEntry } from "../health-model";
import { addDays, dateLabel, mindSummary } from "../health-model";
import { Icon } from "./icons";
import { ConfirmButton, Empty, PageHeading, Stat } from "./primitives";

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

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
  }

  return (
    <div className="page mind-page">
      <PageHeading title="Mind" />

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

      <TodayPractices state={state} today={today} updateDaily={updateDaily} />

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

      <section className="hero-panel mind-hero">
        <div className="hero-score">
          <span className="moon-orb">
            <Icon name="mind" />
          </span>
          <div>
            <p className="kicker">Last 30 days</p>
            <strong>{`${summary.meditationDays} ${summary.meditationDays === 1 ? "day" : "days"}`}</strong>
            <small>meditated</small>
          </div>
        </div>
        <div className="stat-row">
          <Stat label="Minutes" value={`${summary.meditationMinutes}`} detail="sat in total" />
          <Stat label="Journaled" value={`${summary.journalDays} / 30`} detail="days written" />
          <Stat label="To raise" value={`${open.length}`} detail="waiting for a session" />
          <Stat label="Raised" value={`${raised.length}`} detail="already covered" />
        </div>
      </section>
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
        Want one-tap transfer? Use the Apple Notes Shortcut URL and private key shown in Data &amp; goals.
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
    <section className="panel wide-panel mind-practices">
      <div className="panel-head wrap">
        <div><p className="kicker">Today</p><h2>Practices</h2></div>
        <span className="panel-meta">{minutes ? `${minutes} min meditated` : "Meditation not logged"}</span>
      </div>
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
