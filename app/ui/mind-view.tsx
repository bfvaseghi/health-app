"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { DailyEntry, HealthState, LoopEvent, TherapyNote, ThoughtJournalEntry } from "../health-model";
import { ThoughtLoops, type LoopDraft } from "./thought-loops";
import { addDays, dateLabel } from "../health-model";
import { meditationWeeklyMinutes } from "../series";
import { Icon } from "./icons";
import { JOURNAL_PROMPTS, promptForDate, promptsById } from "./journal-prompts";
import { DayStrip } from "./spark";
import { dailyCells, datedCells, streak } from "./strips";
import { ConfirmButton, RecordHeading } from "./primitives";
import { Tide } from "./tide";
import type { MindTab } from "./types";

export function MindView({
  tab,
  composeRequest = 0,
  onJournalDraftChange,
  onTab,
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
  tab: MindTab;
  composeRequest?: number;
  onJournalDraftChange: (draft: "entry" | "edit" | null) => void;
  onTab: (tab: MindTab) => void;
  state: HealthState;
  today: string;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  onAddNote: (text: string) => void;
  onToggleNote: (note: TherapyNote) => void;
  onDeleteNote: (id: string) => void;
  onAddThought: (entry: { id?: string; title: string; text: string; source: ThoughtJournalEntry["source"]; prompt: string }) => void;
  onDeleteThought: (id: string) => void;
  onSaveLoop: (loop: LoopDraft) => void;
  onDeleteLoop: (id: string) => void;
  onLoopEvent: (event: LoopEvent) => void;
  onDeleteLoopEvent: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const activeTab = tab;
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [showRaised, setShowRaised] = useState(false);

  const open = state.therapyNotes.filter((note) => !note.shared);
  const raised = state.therapyNotes.filter((note) => note.shared);
  function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onAddNote(text);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="page mind-page">
      <RecordHeading title="Mind" />
      <div className="mind-tabs record-tabs" role="tablist" aria-label="Mind">
        {(["thoughts", "journal", "therapy", "meditation"] as const).map((value, index, tabs) => (
          <button key={value} type="button" role="tab" id={`mind-tab-${value}`} aria-controls={`mind-panel-${value}`} aria-selected={activeTab === value} tabIndex={activeTab === value ? 0 : -1}
            onClick={() => onTab(value)} onKeyDown={event => {
              const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
              if (next === null) return;
              event.preventDefault();
              onTab(tabs[next]);
              (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
            }}>{value === "thoughts" ? "Rumination" : value === "journal" ? "Journal" : value === "therapy" ? "Therapy" : "Meditation"}</button>
        ))}
      </div>

      <div id="mind-panel-thoughts" role="tabpanel" aria-labelledby="mind-tab-thoughts" hidden={activeTab !== "thoughts"}>
      <ThoughtLoops
        state={state}
        today={today}
        onSave={onSaveLoop}
        onDelete={onDeleteLoop}
        onEvent={onLoopEvent}
        onDeleteEvent={onDeleteLoopEvent}
        onNotice={onNotice}
      />

      </div>
      <div id="mind-panel-journal" role="tabpanel" aria-labelledby="mind-tab-journal" hidden={activeTab !== "journal"}>
      <ThoughtJournal
        composeRequest={composeRequest}
        onDraftChange={onJournalDraftChange}
        entries={state.thoughtJournal}
        today={today}
        therapyNotes={state.therapyNotes}
        onAddToTherapy={onAddNote}
        onAdd={onAddThought}
        onDelete={onDeleteThought}
        onNotice={onNotice}
      />
      </div>

      <div id="mind-panel-meditation" role="tabpanel" aria-labelledby="mind-tab-meditation" hidden={tab !== "meditation"}>
        <TodayPractices state={state} today={today} updateDaily={updateDaily} />
      </div>

      <div id="mind-panel-therapy" role="tabpanel" aria-labelledby="mind-tab-therapy" hidden={tab !== "therapy"}>
      <section className="mind-panel-section" aria-labelledby="therapy-title">
        <div className="tl-section-head">
          <h2 className="mind-section-title" id="therapy-title">Topics for your next session</h2>
          {adding ? null : (
            <button type="button" className="text-button" onClick={() => setAdding(true)}>
              <Icon name="plus" /> Add topic
            </button>
          )}
        </div>


        {adding ? (
          <form className="note-form" onSubmit={submitNote}>
            <input
              value={draft}
              placeholder="Topic"
              aria-label="Topic"
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <button type="submit" className="button primary" disabled={!draft.trim()}>
              Add
            </button>
            <button type="button" className="button secondary" onClick={() => { setAdding(false); setDraft(""); }}>
              Cancel
            </button>
          </form>
        ) : null}

        {open.length ? (
          <ul className="tl-rows tl-list">
            {open.map((note) => (
              <TherapyRow key={note.id} note={note} onToggle={onToggleNote} onDelete={onDeleteNote} />
            ))}
          </ul>
        ) : (
          <p className="mind-status">No topics saved for your next session.</p>
        )}

        {raised.length ? (
          <>
            <p className="tl-line">
              <button type="button" className="text-button" onClick={() => setShowRaised((value) => !value)}>
                {showRaised ? "Hide discussed" : `Discussed · ${raised.length}`}
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

      </div>
    </div>
  );
}

function ThoughtJournal({
  composeRequest,
  onDraftChange,
  entries,
  today,
  therapyNotes,
  onAddToTherapy,
  onAdd,
  onDelete,
  onNotice,
}: {
  composeRequest: number;
  onDraftChange: (draft: "entry" | "edit" | null) => void;
  entries: ThoughtJournalEntry[];
  today: string;
  therapyNotes: TherapyNote[];
  onAddToTherapy: (text: string) => void;
  onAdd: (entry: { id?: string; title: string; text: string; source: ThoughtJournalEntry["source"]; prompt: string }) => void;
  onDelete: (id: string) => void;
  onNotice: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<ThoughtJournalEntry["source"]>("manual");
  const [editingId, setEditingId] = useState<string | undefined>();
  const [showAll, setShowAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Today's question, rotated by date so it holds still while you answer it
  // and is a different one tomorrow. Changing it is a deliberate act.
  const suggested = promptForDate(today);
  const [promptId, setPromptId] = useState(suggested.id);
  const prompt = promptsById.get(promptId) ?? suggested;
  useEffect(() => { if (composeRequest > 0) setWriting(true); }, [composeRequest]);
  useEffect(() => { onDraftChange(writing ? editingId ? "edit" : "entry" : null); }, [writing, editingId, onDraftChange]);

  async function pasteFromNotes() {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) {
        onNotice("Clipboard empty.");
        return;
      }
      setText((current) => current.trim() ? `${current.trimEnd()}\n\n${value}` : value);
      setSource("apple-notes");
      setWriting(true);
      onNotice(text.trim() ? "Text appended." : "Text pasted.");
    } catch {
      onNotice("Paste into the entry field using your device’s paste command.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onAdd({ id: editingId, title: title.trim() || prompt.label, text: value, source, prompt: prompt.id });
    setEditingId(undefined);
    setTitle("");
    setText("");
    setSource("manual");
    setPromptId(suggested.id);
    setWriting(false);
  }

  const writtenCells = datedCells(entries.map(entry => entry.date), today, 14, "entry");
  const written = streak(writtenCells);
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matched = words.length ? entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.text} ${entry.date} ${dateLabel(entry.date, { month: "long", day: "numeric", year: "numeric" })}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  }) : entries;
  const shown = showAll ? matched : matched.slice(0, 4);
  const therapyText = (entry: ThoughtJournalEntry) => `${dateLabel(entry.date, { month: "short", day: "numeric", year: "numeric" })}${entry.title ? ` · ${entry.title}` : ""}\n${entry.text}`;
  return (
    <section className="mind-panel-section" aria-labelledby="thought-journal-title">
      <div className="tl-section-head">
        <h2 className="mind-section-title" id="thought-journal-title">
          Journal
        </h2>
        {writing ? (
          <button type="button" className="text-button" onClick={() => void pasteFromNotes()}>
            <Icon name="copy" /> Paste from Notes
          </button>
        ) : (
          <button type="button" className="button primary small" onClick={() => setWriting(true)}>
            <Icon name="pencil" /> Write entry
          </button>
        )}
      </div>
      {/* The question, always on screen. An empty box asks "what do you want
          to say?", which is the hardest thing to answer on the days this is
          most worth doing. */}
      {editingId ? null : <div className="journal-prompt">
        <span className="tl-caps">{prompt.label}</span>
        <p>{prompt.question}</p>
        <label className="plan-field inline-field">
          <span>Write about</span>
          <select aria-label="Journal prompt" value={promptId} onChange={event => setPromptId(event.target.value)}>
            {JOURNAL_PROMPTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>}
      {writing ? (
      <form className="thought-form" onSubmit={submit}>
        {editingId ? <p className="mind-section-description">Editing entry from {dateLabel(entries.find(entry => entry.id === editingId)?.date ?? today, { month: "short", day: "numeric", year: "numeric" })}</p> : null}
        <input
          value={title}
          maxLength={160}
          placeholder={editingId ? "Title (optional)" : `Title — defaults to "${prompt.label}"`}
          aria-label="Entry title"
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          autoFocus
          value={text}
          maxLength={10_000}
          placeholder={prompt.placeholder}
          aria-label={`Journal entry: ${prompt.question}`}
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value) setSource("manual");
          }}
        />
        <div className="thought-form-foot">
          <small>{source === "apple-notes" ? "Pasted from Apple Notes" : ""}</small>
          <span className="tl-actions" style={{ margin: 0 }}>
            <button type="button" className="button secondary" onClick={() => { setWriting(false); setText(""); setTitle(""); setSource("manual"); setEditingId(undefined); }}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={!text.trim()}>
              {editingId ? "Save changes" : "Save entry"}
            </button>
          </span>
        </div>
      </form>
      ) : null}

      {entries.length ? <div className="journal-history">
        {/* How often you have written, drawn. A number on its own cannot show
            a run or where the gap fell, which is the only thing worth knowing
            about a habit. No streak celebration: the record is the record. */}
        <div className="journal-record">
          <span>
            <strong>{written.hits}</strong> of the last 14 days
            {written.run ? <em>{written.run} in a row</em> : null}
          </span>
          <DayStrip cells={writtenCells} label="Journal entries, last 14 days" />
        </div>
        <div className="journal-history-head"><h3 className="journal-history-title">Recent entries</h3>
      {entries.length ? (
        searching ? <div className="journal-search">
          <input type="search" autoFocus placeholder="Search entries" aria-label="Search journal entries" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} />
          <button type="button" className="text-button" onClick={() => { setSearching(false); setQuery(""); }}>Close</button>
        </div> : <button type="button" className="text-button" onClick={() => setSearching(true)}>Search entries</button>
      ) : null}
        </div>
      {shown.length ? (
        <ol className="tl-rows tl-list">
          {shown.map((entry) => (
            <li key={entry.id} className="journal-entry">
              <details>
                <summary>
                  <span className="entry-date" aria-hidden="true"><b>{dateLabel(entry.date, { day: "numeric" })}</b><small>{dateLabel(entry.date, { month: "short" })}</small></span>
                  <span className="entry-summary-copy"><b>{entry.title || dateLabel(entry.date, { weekday: "long", month: "long", day: "numeric" })}</b>
                  <small>{entry.date === today ? "Today" : dateLabel(entry.date, { month: "short", day: "numeric", year: "numeric" })}{entry.prompt && promptsById.has(entry.prompt) ? ` · ${promptsById.get(entry.prompt)!.label}` : ""}{entry.source === "apple-notes" ? " · Apple Notes" : ""}</small>
                  <span className="entry-preview">{entry.text}</span></span>
                  <Icon name="chevron" />
                </summary>
                <p className="tl-thought-text">{entry.text}</p>
                <div className="journal-tools">
                  <button type="button" className="text-button" disabled={writing} onClick={() => { setEditingId(entry.id); setTitle(entry.title); setText(entry.text); setSource(entry.source); setPromptId(entry.prompt || "open"); setWriting(true); document.getElementById("thought-journal-title")?.scrollIntoView({ block: "start" }); }}>Edit entry</button>
                  <button type="button" className="text-button" disabled={therapyNotes.some((note) => note.text === therapyText(entry))} onClick={() => { onAddToTherapy(therapyText(entry)); onNotice("Added to therapy topics."); }}>
                    {therapyNotes.some((note) => note.text === therapyText(entry)) ? "Added to therapy" : "Add to therapy"}
                  </button>
                  <ConfirmButton label={`Delete entry from ${entry.date}`} onConfirm={() => onDelete(entry.id)} />
                </div>
              </details>
            </li>
          ))}
        </ol>
      ) : (
        <p className="tl-line">{words.length ? "No matching entries." : "No entries."}</p>
      )}
      {matched.length > 4 ? (
        <p className="tl-line">
          <button type="button" className="text-button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show recent" : `Show all ${matched.length}`}
          </button>
        </p>
      ) : null}
      </div> : null}
      {!entries.length && !writing ? <p className="mind-status">Saved entries appear here, newest first.</p> : null}
    </section>
  );
}

export function TodayPractices({ state, today, updateDaily }: {
  state: HealthState;
  today: string;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
}) {
  const currentDay = state.dailyEntries.find(item => item.date === today);
  const minutes = currentDay?.meditationMinutes ?? null;
  const weekly = useMemo(() => meditationWeeklyMinutes(state, today, 8), [state, today]);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const notes = state.dailyEntries.filter(entry => entry.date <= today && entry.meditationNote.trim()).sort((a, b) => b.date.localeCompare(a.date));
  const editDay = (date: string) => {
    const recorded = state.dailyEntries.find(entry => entry.date === date);
    setDraft(recorded?.meditationMinutes == null ? "" : String(recorded.meditationMinutes));
    setNote(recorded?.meditationNote ?? "");
    setEditingDate(date);
  };
  const logMinutes = (value: number) => updateDaily(today, current => ({ ...current, meditationMinutes: value }));
  // Ten minutes or more reads as a full cell, less as a half — so a run of
  // short sittings does not look identical to a run of long ones.
  const meditationCells = dailyCells(state.dailyEntries, today, 14, item => ({
    done: (item?.meditationMinutes ?? 0) > 0,
    partial: (item?.meditationMinutes ?? 0) > 0 && (item?.meditationMinutes ?? 0) < 10,
    detail: (item?.meditationMinutes ?? 0) > 0 ? `${item!.meditationMinutes} min` : "none",
  }));
  const sat = streak(meditationCells);
  return <section className="mind-panel-section meditation-practice" aria-labelledby="meditation-title">
    <h2 className="mind-section-title" id="meditation-title">Meditation</h2>
    {/* The count, then the fortnight it was counted from. Cells are taller
        where more minutes were done, so the shape of a practice shows. */}
    <div className="record-block is-flat">
      <div className="record-block-value">
        <strong>{sat.hits}<span className="of">/14</span></strong>
        <span>days meditated · {sat.run ? `${sat.run} in a row` : (minutes ?? 0) > 0 ? `${minutes} min today` : "not today"}</span>
      </div>
      <DayStrip cells={meditationCells} label="Meditation, last 14 days" />
      <div className="record-block-scale"><span>{dateLabel(addDays(today, -13), { month: "short", day: "numeric" })}</span><span>today</span></div>
    </div>
    {editingDate ? <form className="meditation-form insight-form" onSubmit={event => {
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      const date = String(fields.get("date") ?? editingDate);
      const entered = String(fields.get("minutes") ?? "").trim();
      const insight = String(fields.get("insight") ?? "").trim();
      const value = entered ? Number(entered) : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || (value !== null && (!Number.isInteger(value) || value < 0 || value > 240))) return;
      updateDaily(date, current => ({ ...current, meditationMinutes: value, meditationNote: insight }));
      setEditingDate(null);
    }}>
      <div className="meditation-edit-fields"><label>Date<input type="date" name="date" required max={today} value={editingDate} onChange={event => { if (event.target.value) editDay(event.target.value); }} /></label><label>Minutes · optional<input type="number" name="minutes" min="0" max="240" step="1" inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} /></label></div>
      <label>Insights<textarea name="insight" autoFocus value={note} onChange={event => setNote(event.target.value)} placeholder="What did you notice or learn?" rows={4} maxLength={2000} /></label>
      <div className="tl-actions"><button type="submit" className="button primary">Save</button><button type="button" className="text-button" onClick={() => setEditingDate(null)}>Cancel</button>{state.dailyEntries.some(entry => entry.date === editingDate && entry.meditationMinutes != null) ? <button type="button" className="text-button" onClick={() => setDraft("")}>Clear minutes</button> : null}</div>
    </form> : <>
      <div className="tl-actions">
        {(minutes ?? 0) <= 0 ? [10, 20].map(value => <button key={value} type="button" className="button secondary" onClick={() => logMinutes(value)}>Log {value} min</button>) : null}
        <button type="button" className="text-button" onClick={() => editDay(today)}><Icon name="pencil" />{minutes === null ? "Other duration" : "Edit minutes"}</button>
      </div>
      <section className="meditation-insights" aria-label="Meditation insights"><div className="tl-section-head"><h3>Insights</h3><button type="button" className="text-button" onClick={() => editDay(today)}>{currentDay?.meditationNote ? "Edit today" : "Add insight"}</button></div>
        {notes.length ? <ol>{notes.slice(0, 1).map(entry => <li key={entry.date}><div><span>{entry.date === today ? "Today" : dateLabel(entry.date, { month: "short", day: "numeric", year: "numeric" })}{entry.meditationMinutes ? ` · ${entry.meditationMinutes} min` : ""}</span><button type="button" className="text-button" aria-label={`Edit insight for ${entry.date}`} onClick={() => editDay(entry.date)}>Edit</button></div><p>{entry.meditationNote}</p></li>)}</ol> : <p className="mind-status">Save what you noticed during meditation.</p>}
      </section>
    </>}
    <details className="simple-history">
      <summary>Past days &amp; insights</summary>
      <Tide data={weekly} label="Meditation, minutes a week" unit=" min" min={0} format={value => String(Math.round(value))} empty="No meditation records." />
      <ol className="practice-history" aria-label="Meditation minutes, last 14 days">
        {Array.from({ length: 14 }, (_, index) => addDays(today, index - 13)).map(date => {
          const day = state.dailyEntries.find(entry => entry.date === date);
          return <li key={date} className={date === today ? "current" : ""}><button type="button" aria-label={`Edit meditation for ${date}: ${day?.meditationMinutes == null ? "not recorded" : `${day.meditationMinutes} minutes`}`} onClick={() => { editDay(date); document.getElementById("meditation-title")?.scrollIntoView({ block: "start" }); }}><small>{dateLabel(date, { weekday: "short" })}</small><b>{day?.meditationMinutes ?? "—"}</b></button></li>;
        })}
      </ol>
      <button type="button" className="text-button" onClick={() => editDay(addDays(today, -1))}>Log another day</button>
      {notes.length > 1 ? <ol className="earlier-insights">{notes.slice(1).map(entry => <li key={entry.date}><button type="button" className="text-button" onClick={() => editDay(entry.date)}>{dateLabel(entry.date, { month: "short", day: "numeric", year: "numeric" })} · Edit</button><p>{entry.meditationNote}</p></li>)}</ol> : null}
    </details>
  </section>;
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
        aria-label={note.shared ? `Move “${note.text}” back to the list` : `Mark “${note.text}” as discussed`}
        onClick={() => onToggle(note)}
      >
        <Icon name="check" />
      </button>
      <span className="tl-row-copy">
        <b className="tl-plain">{note.text}</b>
        <small>
          {note.shared && note.sharedDate
            ? `Discussed ${dateLabel(note.sharedDate, { month: "short", day: "numeric" })}`
            : dateLabel(note.date, { month: "short", day: "numeric" })}
        </small>
      </span>
      <ConfirmButton label={`Delete “${note.text}”`} onConfirm={() => onDelete(note.id)} />
    </li>
  );
}
