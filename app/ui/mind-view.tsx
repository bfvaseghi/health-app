"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, TherapyNote } from "../health-model";
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
}: {
  state: HealthState;
  today: string;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  onAddNote: (text: string) => void;
  onToggleNote: (note: TherapyNote) => void;
  onDeleteNote: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [showRaised, setShowRaised] = useState(false);

  const summary = useMemo(() => mindSummary(state, today, 30), [state, today]);
  const open = state.therapyNotes.filter((note) => !note.shared);
  const raised = state.therapyNotes.filter((note) => note.shared);
  const week = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13));

  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
  }

  return (
    <div className="page">
      <PageHeading title="Mind" />

      <section className="hero-panel">
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

      <section className="panel wide-panel">
        <div className="panel-head">
          <div>
            <h2>Last 14 days</h2>
          </div>
        </div>
        <div className="mind-strip" aria-label="Meditation and journaling, last fourteen days">
          {week.map((date) => {
            const entry = state.dailyEntries.find((item) => item.date === date);
            const minutes = entry?.meditationMinutes ?? 0;
            return (
              <button
                key={date}
                type="button"
                className={date === today ? "current" : ""}
                onClick={() => updateDaily(date, (current) => ({ ...current, journaled: !current.journaled }))}
                aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}: ${
                  minutes ? `${minutes} minutes meditated` : "no meditation"
                }, ${entry?.journaled ? "journaled" : "not journaled"}. Press to toggle journaled.`}
              >
                <small aria-hidden="true">{dateLabel(date, { weekday: "narrow" })}</small>
                <span aria-hidden="true" className={minutes ? "day-dot strong" : "day-dot"}>
                  {minutes || "—"}
                </span>
                <i aria-hidden="true" className={entry?.journaled ? "med-pip is-taken" : "med-pip"} />
              </button>
            );
          })}
        </div>
        <p className="panel-body">
          The top number is minutes meditated; the bar underneath marks a day you journaled. Tap a day to change it.
        </p>
      </section>

      <section className="panel wide-panel">
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
                {raised.slice(0, 30).map((note) => (
                  <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
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
