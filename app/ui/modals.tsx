"use client";

import { FormEvent, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  DailyEntry,
  HealthState,
  LabResult,
  Medication,
  SleepEntry,
  SleepSource,
  addDays,
  dateLabel,
  emptyDailyEntry,
  emptySleepEntry,
  estimateSleepHours,
  medicationStatuses,
  todayLocal,
  validateDailyEntry,
  validateLabResult,
  validateMedication,
  validateSleepEntry,
} from "../health-model";
import { Icon } from "./icons";
import { ConfirmButton, Field, ModalFrame, TextAreaField, TextField } from "./primitives";

function number(value: FormDataEntryValue | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Prev / next / today controls so backfilling a missed day never means hunting in a date picker. */
function DateStepper({ date, onChange }: { date: string; onChange: Dispatch<SetStateAction<string>> }) {
  const today = todayLocal();
  return (
    <div className="date-stepper">
      <button type="button" className="icon-button" onClick={() => onChange((current) => addDays(current, -1))} aria-label="Previous day">
        <Icon name="chevron" />
      </button>
      <div>
        <b>{dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}</b>
        <input
          type="date"
          name="date"
          value={date}
          max={today}
          onChange={(event) => onChange(event.target.value || today)}
          aria-label="Date"
        />
      </div>
      <button
        type="button"
        className="icon-button"
        onClick={() => onChange((current) => addDays(current, 1))}
        disabled={date >= today}
        aria-label="Next day"
      >
        <Icon name="chevron" />
      </button>
    </div>
  );
}

export function CheckInModal({
  state,
  date: initialDate,
  onClose,
  onSave,
  onDose,
  onDelete,
}: {
  state: HealthState;
  date: string;
  onClose: () => void;
  onSave: (entry: DailyEntry | null) => void;
  onDose: (medicationId: string, date: string, taken: boolean | null) => void;
  onDelete: (date: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState("");
  const existing = state.dailyEntries.find((entry) => entry.date === date);
  const draft = existing ?? emptyDailyEntry(date);
  // Only the medications actually due that day. A weekly injection is not a
  // question on the six days it is not due.
  const due = medicationStatuses(state, date).filter((status) => status.dueToday);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const doseAnswers = due.map((status) => {
      const answer = data.get(`med:${status.medication.id}`);
      return [status.medication.id, answer === "yes" ? true : answer === "no" ? false : null] as const;
    });
    const entry: DailyEntry = {
      ...draft,
      date,
      weightLb: number(data.get("weight")),
      bodyFatPercent: number(data.get("bodyfat")),
      proteinG: number(data.get("protein")),
      note: String(data.get("note") ?? ""),
    };
    const issue = validateDailyEntry(entry);
    if (issue) {
      if (due.length && issue.startsWith("Add at least")) {
        for (const [medicationId, taken] of doseAnswers) onDose(medicationId, date, taken);
        onSave(null);
        return;
      }
      setError(issue);
      return;
    }
    setError("");
    for (const [medicationId, taken] of doseAnswers) onDose(medicationId, date, taken);
    onSave(entry);
  }

  return (
    <ModalFrame
      title={date === todayLocal() ? "Today" : "Edit day"}
      subtitle="Meds, weight, body fat, protein. Everything else is imported."
      onClose={onClose}
    >
      <DateStepper date={date} onChange={setDate} />
      <form onSubmit={submit} className="form-stack" key={date} noValidate>
        {due.map((status) => (
          <fieldset className="radio-card" key={status.medication.id}>
            <legend>{status.medication.name}</legend>
            <label>
              <input
                type="radio"
                name={`med:${status.medication.id}`}
                value="yes"
                defaultChecked={status.today === true}
              />{" "}
              Taken
            </label>
            <label>
              <input
                type="radio"
                name={`med:${status.medication.id}`}
                value="no"
                defaultChecked={status.today === false}
              />{" "}
              Missed
            </label>
            <label>
              <input
                type="radio"
                name={`med:${status.medication.id}`}
                value="unknown"
                defaultChecked={status.today === null}
              />{" "}
              Not recorded
            </label>
          </fieldset>
        ))}

        <div className="input-grid">
          <Field name="weight" label="Weight" suffix="lb" step="0.1" min="40" max="1000" value={draft.weightLb} />
          <Field name="bodyfat" label="Body fat" suffix="%" step="0.1" min="3" max="60" value={draft.bodyFatPercent} />
        </div>

        <div className="input-grid">
          <Field name="protein" label="Protein" suffix="g" step="1" min="0" max="500" value={draft.proteinG} />
          <div className="field read-only">
            <span>Steps</span>
            <p>{draft.steps === null ? "Not imported" : Math.round(draft.steps).toLocaleString("en-US")}</p>
          </div>
        </div>

        <TextAreaField name="note" label="Optional note" value={draft.note} />

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="modal-actions">
          {existing ? (
            <ConfirmButton
              label="Delete this day"
              confirmLabel="Delete for good"
              className="button danger"
              onConfirm={() => onDelete(date)}
            />
          ) : null}
          <span className="spacer" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function SleepModal({
  state,
  date: initialDate,
  source: initialSource = "manual",
  onClose,
  onSave,
  onDelete,
}: {
  state: HealthState;
  date: string;
  source?: SleepSource;
  onClose: () => void;
  onSave: (entry: SleepEntry) => void;
  onDelete: (date: string, source: SleepSource) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const source = initialSource;
  const existing = state.sleepEntries.find((entry) => entry.date === date && entry.source === source);

  return (
    <ModalFrame
      title={existing ? "Edit sleep" : "Add sleep"}
      subtitle="Use the date you woke up. Each source keeps its own record for the night."
      onClose={onClose}
    >
      <DateStepper date={date} onChange={setDate} />
      <SleepForm
        key={`${date}:${source}`}
        date={date}
        source={source}
        existing={existing}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
      />
    </ModalFrame>
  );
}

/** Remounted whenever the night or the source changes, so the fields always describe one record. */
function SleepForm({
  date,
  source,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  date: string;
  source: SleepSource;
  existing: SleepEntry | undefined;
  onClose: () => void;
  onSave: (entry: SleepEntry) => void;
  onDelete: (date: string, source: SleepSource) => void;
}) {
  const draft = existing ?? emptySleepEntry(date);
  const [bedtime, setBedtime] = useState(draft.bedtime);
  const [wakeTime, setWakeTime] = useState(draft.wakeTime);
  const [duration, setDuration] = useState(draft.durationHours === null ? "" : String(draft.durationHours));
  const [error, setError] = useState("");
  const estimate = estimateSleepHours(bedtime, wakeTime);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const entry: SleepEntry = {
      ...draft,
      date,
      source,
      bedtime,
      wakeTime,
      durationHours: duration === "" ? null : Number(duration),
      quality: number(data.get("quality")) as SleepEntry["quality"],
      efficiencyPercent: number(data.get("efficiency")),
      deepHours: number(data.get("deep")),
      remHours: number(data.get("rem")),
      restingHeartRate: number(data.get("rhr")),
      hrvMs: number(data.get("hrv")),
      note: String(data.get("note") ?? ""),
    };
    const issue = validateSleepEntry(entry);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    onSave(entry);
  }

  return (
    <form onSubmit={submit} className="form-stack" noValidate>
      <div className="input-grid">
        <div className="field read-only">
          <span>Source</span>
          <p>{source === "manual" ? "Manual entry" : `${source[0].toUpperCase() + source.slice(1)} import`}</p>
        </div>
        <Field name="duration" label="Duration" suffix="hours" step="0.1" min="1" max="18" value={duration} onChange={setDuration} />
        <TextField name="bedtime" label="Bedtime" type="time" value={bedtime} onChange={setBedtime} />
        <TextField name="wakeTime" label="Wake time" type="time" value={wakeTime} onChange={setWakeTime} />
      </div>

      {estimate !== null ? (
        <div className="inline-hint">
          <span>That window is {estimate.toFixed(1)} hours in bed.</span>
          <button type="button" className="text-button" onClick={() => setDuration(estimate.toFixed(2))}>
            Use as duration
          </button>
        </div>
      ) : null}

      <div className="form-section">
        <span className="form-label">Optional detail</span>
        <div className="input-grid">
          <Field name="quality" label="Quality" suffix="1–5" min="1" max="5" value={draft.quality} />
          <Field name="efficiency" label="Efficiency" suffix="%" min="0" max="100" value={draft.efficiencyPercent} />
          <Field name="deep" label="Deep sleep" suffix="hours" step="0.1" min="0" max="12" value={draft.deepHours} />
          <Field name="rem" label="REM sleep" suffix="hours" step="0.1" min="0" max="12" value={draft.remHours} />
          <Field name="rhr" label="Resting heart rate" suffix="bpm" min="20" max="250" value={draft.restingHeartRate} />
          <Field name="hrv" label="HRV" suffix="ms" min="0" max="500" value={draft.hrvMs} />
        </div>
      </div>

      <TextAreaField name="note" label="Optional note" value={draft.note} />

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="modal-actions">
        {existing ? (
          <ConfirmButton
            label="Delete this night"
            confirmLabel="Delete for good"
            className="button danger"
            onConfirm={() => onDelete(date, source)}
          />
        ) : null}
        <span className="spacer" />
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" type="submit">
          Save sleep
        </button>
      </div>
    </form>
  );
}

/**
 * What you are on and how often it is due.
 *
 * The schedule is the whole reason this is a form rather than a text box: a
 * weekly injection has to know which day, or every other day of the week reads
 * as one you missed.
 */
export function MedicationModal({
  state,
  id,
  onClose,
  onSave,
  onDelete,
}: {
  state: HealthState;
  id?: string;
  onClose: () => void;
  onSave: (medication: Medication) => void;
  onDelete: (id: string) => void;
}) {
  const existing = id ? state.medications.find((entry) => entry.id === id) : undefined;
  const [weekly, setWeekly] = useState(existing?.schedule === "weekly");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const schedule = data.get("schedule") === "weekly" ? "weekly" : "daily";
    const medication: Medication = {
      id: existing?.id ?? `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "med"}-${crypto.randomUUID()}`,
      name,
      schedule,
      dueDay: schedule === "weekly" ? Number(data.get("dueDay") ?? 1) : null,
      archived: false,
    };
    const issue = validateMedication(medication);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    onSave(medication);
  }

  return (
    <ModalFrame
      title={existing ? "Edit medication" : "Add a medication"}
      subtitle="Only what it is called and how often it is due. Nothing here is advice about taking it."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack" noValidate>
        <TextField name="name" label="Name" value={existing?.name} required placeholder="Example: Finasteride" />
        <fieldset className="field">
          <legend>How often</legend>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name="schedule"
                value="daily"
                defaultChecked={!weekly}
                onChange={() => setWeekly(false)}
              />{" "}
              Every day
            </label>
            <label>
              <input
                type="radio"
                name="schedule"
                value="weekly"
                defaultChecked={weekly}
                onChange={() => setWeekly(true)}
              />{" "}
              Once a week
            </label>
          </div>
        </fieldset>
        {weekly ? (
          <div className="field">
            <label htmlFor="med-day">Day it is due</label>
            <select id="med-day" name="dueDay" defaultValue={String(existing?.dueDay ?? 1)}>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions">
          {existing ? (
            <ConfirmButton
              label="Delete medication"
              confirmLabel="Delete for good"
              onConfirm={() => onDelete(existing.id)}
            />
          ) : (
            <span />
          )}
          <button type="submit" className="button primary">
            Save
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

export function LabModal({
  state,
  id,
  onClose,
  onSave,
  onDelete,
}: {
  state: HealthState;
  id?: string;
  onClose: () => void;
  onSave: (result: LabResult) => void;
  onDelete: (id: string) => void;
}) {
  const existing = id ? state.labResults.find((result) => result.id === id) : undefined;
  const knownNames = useMemo(
    () => [...new Set(state.labResults.map((result) => result.name))].sort((a, b) => a.localeCompare(b)),
    [state.labResults],
  );
  const knownUnits = useMemo(
    () => [...new Set(state.labResults.map((result) => result.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [state.labResults],
  );
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const date = String(data.get("date"));
    const result: LabResult = {
      id: existing?.id ?? `${date}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomUUID()}`,
      name,
      date,
      value: number(data.get("value")),
      unit: String(data.get("unit") ?? ""),
      referenceLow: number(data.get("low")),
      referenceHigh: number(data.get("high")),
      note: String(data.get("note") ?? ""),
      ask: data.get("ask") === "on",
    };
    const issue = validateLabResult(result);
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    onSave(result);
  }

  return (
    <ModalFrame
      title={existing ? "Edit lab result" : "Add lab result"}
      subtitle="Use the exact units and reference range printed by the lab that ran it."
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-stack" noValidate>
        <div className="field">
          <label htmlFor="lab-name">Test name</label>
          <input
            id="lab-name"
            name="name"
            list="known-lab-names"
            required
            placeholder="Example: Ferritin"
            defaultValue={existing?.name}
          />
          <datalist id="known-lab-names">
            {knownNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <TextField name="date" label="Date" type="date" value={existing?.date ?? todayLocal()} max={todayLocal()} required />
        <div className="input-grid">
          <Field name="value" label="Result" step="any" value={existing?.value} />
          <div className="field">
            <label htmlFor="lab-unit">Unit</label>
            <input id="lab-unit" name="unit" list="known-lab-units" placeholder="mg/dL" defaultValue={existing?.unit} />
            <datalist id="known-lab-units">
              {knownUnits.map((unit) => (
                <option key={unit} value={unit} />
              ))}
            </datalist>
          </div>
          <Field name="low" label="Reference low" step="any" value={existing?.referenceLow} />
          <Field name="high" label="Reference high" step="any" value={existing?.referenceHigh} />
        </div>
        <TextAreaField name="note" label="Optional note" value={existing?.note} />
        <label className="check-row">
          <input type="checkbox" name="ask" defaultChecked={existing?.ask ?? false} />
          <span>Ask my doctor about this, whatever the range says</span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="modal-actions">
          {existing ? (
            <ConfirmButton
              label="Delete result"
              confirmLabel="Delete for good"
              className="button danger"
              onConfirm={() => onDelete(existing.id)}
            />
          ) : null}
          <span className="spacer" />
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save result
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

const shortcuts: Array<[string, string]> = [
  ["I", "Import a file"],
  ["S", "Add or edit a night"],
  ["C", "Log today"],
  ["L", "Add a lab result"],
  ["1 – 7", "Jump to a section"],
  ["?", "Show this list"],
  ["Esc", "Close a dialog"],
  ["← →", "Move through a chart once it has focus"],
];

export function ShortcutsModal({ onClose, demo = false }: { onClose: () => void; demo?: boolean }) {
  return (
    <ModalFrame title="Keyboard shortcuts" subtitle="Shortcuts pause while you are typing in a field." onClose={onClose}>
      <dl className="shortcut-list">
        {shortcuts.filter(([key]) => !demo || key !== "I").map(([key, description]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
      <div className="modal-actions">
        <button type="button" className="button primary" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalFrame>
  );
}
