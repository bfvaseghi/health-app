"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, MedicationStatus } from "../health-model";
import { dateLabel, medicationStatuses, preferredSleepEntries, buildWorkoutSessions } from "../health-model";
import { currentTrainingWeek, nextSession, sessionMinutes, weekStart, workoutWeekStreak } from "../training/coach";
import { Icon } from "./icons";
import { RecordHeading } from "./primitives";
import { DayStrip, Meter } from "./spark";
import { dailyCells, datedCells, medicationCells, streak as daysHit } from "./strips";
import { WaterTracker } from "./water-tracker";
import { workoutLabel } from "./workout-labels";
import { formatTime, hoursLabel } from "./format";
import type { MindTab, Modal, View } from "./types";

export function TodayView({ state, today, go, open, updateDaily, onDose, onWriteJournal, journalDraft }: {
  state: HealthState;
  today: string;
  go: (view: View, mindTab?: MindTab) => void;
  open: (modal: Modal) => void;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  onDose: (medicationId: string, date: string, taken: boolean) => void;
  onWriteJournal: () => void;
  journalDraft: "entry" | "edit" | null;
}) {
  const medications = useMemo(() => medicationStatuses(state, today, 14), [state, today]);
  const meditationCells = dailyCells(state.dailyEntries, today, 14, item => ({
    done: (item?.meditationMinutes ?? 0) > 0,
    partial: (item?.meditationMinutes ?? 0) > 0 && (item?.meditationMinutes ?? 0) < 10,
    detail: (item?.meditationMinutes ?? 0) > 0 ? `${item!.meditationMinutes} min` : "none",
  }));
  const journalCells = datedCells(state.thoughtJournal.map(item => item.date), today, 14, "entry");
  const entry = state.dailyEntries.find(item => item.date === today);
  const journalEntries = state.thoughtJournal.filter(item => item.date === today);
  const journaled = Boolean(entry?.journaled || journalEntries.length);
  const due = state.goals.trackMedication ? medications.filter(status => status.dueToday) : [];
  const lastNight = preferredSleepEntries(state.sleepEntries).find(item => item.date <= today);
  const { plan } = useMemo(() => currentTrainingWeek(state, today), [state, today]);
  const next = nextSession(plan, state, today);
  const hasPlan = state.workoutSets.filter(set => set.date <= today).length >= 10;
  const logged = buildWorkoutSessions(state.workoutSets.filter(set => set.date <= today && set.date >= weekStart(today))).length;
  const streak = workoutWeekStreak(state, today);
  return <div className="page tl-page today-page daily-dashboard">
    <RecordHeading title="Today" detail={dateLabel(today, { weekday: "long", month: "long", day: "numeric" })} action={<button type="button" className="text-button" onClick={() => open({ kind: "record", date: today })}><Icon name="calendar" /> Browse days</button>} />
    <div className="daily-layout">
      <section className="daily-checklist" aria-labelledby="daily-checklist-title">
        <div className="surface-heading"><h2 id="daily-checklist-title">Daily check-in</h2><button type="button" className="text-button" onClick={() => open({ kind: "checkin", date: today })}>Edit day</button></div>
        <div className="tl-rows">
          {state.goals.trackMedication && medications.length ? <MedRows state={state} statuses={medications} due={due} today={today} go={go} onDose={onDose} /> : null}
          <WaterTracker key={today} date={today} value={entry?.waterMl ?? null} target={state.goals.waterTargetMl} updateDaily={updateDaily} />
          <LogRow
            icon="fuel"
            title="Protein"
            detail={entry?.proteinG != null ? `${Math.round(entry.proteinG)} g${state.goals.proteinTargetG ? ` of ${state.goals.proteinTargetG} g` : ""}` : "Not logged today"}
            done={entry?.proteinG != null}
            graphic={state.goals.proteinTargetG
              ? <Meter value={entry?.proteinG ?? 0} target={state.goals.proteinTargetG} label={`Protein ${Math.round(entry?.proteinG ?? 0)} of ${state.goals.proteinTargetG} g`} />
              : null}
          >
            <NumberEntry key={`protein:${entry?.proteinG ?? ""}`} label="Grams of protein today" suffix="g" value={entry?.proteinG ?? null} presets={state.goals.proteinTargetG ? [state.goals.proteinTargetG] : []} min={0} max={500} onSet={value => updateDaily(today, current => ({ ...current, proteinG: value }))} />
          </LogRow>
          <LogRow
            icon="mind"
            title="Meditation"
            detail={`${(entry?.meditationMinutes ?? 0) > 0 ? `${entry!.meditationMinutes} min today` : "Not today"} · ${daysHit(meditationCells).hits} of the last 14 days`}
            done={(entry?.meditationMinutes ?? 0) > 0}
            graphic={<DayStrip size="small" cells={meditationCells} label="Meditation, last 14 days" />}
          >
            {(entry?.meditationMinutes ?? 0) > 0 ? <button type="button" className="chip" onClick={() => go("mind", "meditation")}>Insights</button> : <button type="button" className="chip" onClick={() => updateDaily(today, current => ({ ...current, meditationMinutes: 10 }))}>Log 10 min</button>}
          </LogRow>
          <LogRow
            icon="journal"
            title="Journal"
            detail={`${journalEntries.length ? `${journalEntries.length} today` : entry?.journaled ? "Written elsewhere" : "Not today"} · ${daysHit(journalCells).hits} of the last 14 days`}
            done={journaled}
            graphic={<DayStrip size="small" cells={journalCells} label="Journal, last 14 days" />}
          >
            <button type="button" className="chip" onClick={() => onWriteJournal()}>{journalDraft ? "Continue" : "Write"}</button>
          </LogRow>
        </div>
      </section>
      <div className="daily-side">
        <section className="daily-training" aria-labelledby="today-workout-title">
          <span className="section-eyebrow"><Icon name="fitness" /> Training</span>
          <h2 id="today-workout-title">{hasPlan ? next.session ? workoutLabel(next.session) : "Your week is logged" : "Your workout plan"}</h2>
          <p>{hasPlan && next.session ? `${next.session.exercises.length} exercises · ${sessionMinutes(next.session)} min${next.session.tier === "extra" ? " · optional" : ""}` : hasPlan ? `${logged} workouts logged this week` : "Start with your Strong record"}</p>
          <button type="button" className="button primary small" onClick={() => go("fitness")}>{hasPlan ? "Open workout" : "Set up workouts"}<Icon name="arrow" /></button>
          <div className="daily-training-foot">{next.session ? <span>{logged} logged this week</span> : null}{streak.weeks ? <span>{streak.weeks} weeks in a row</span> : null}</div>
        </section>
        <section className="daily-night" aria-label="Latest sleep">
          <div className="surface-heading"><h2>{lastNight?.date === today ? "Last night" : lastNight ? dateLabel(lastNight.date, { month: "short", day: "numeric" }) : "Last night"}</h2><button type="button" className="text-button" onClick={() => lastNight?.date === today ? go("sleep") : open({ kind: "sleep", date: today })}>{lastNight?.date === today ? "View" : "Add"}</button></div>
          <div className="daily-sleep-times"><span><small>Bedtime</small><b>{lastNight?.bedtime ? formatTime(lastNight.bedtime) : "—"}</b></span><span><small>Woke up</small><b>{lastNight?.wakeTime ? formatTime(lastNight.wakeTime) : "—"}</b></span></div>
          <p>{lastNight?.durationHours != null ? `${hoursLabel(lastNight.durationHours)} asleep` : "No sleep duration recorded"}</p>
        </section>
      </div>
    </div>
  </div>;
}

function MedRows({
  state,
  statuses,
  due,
  today,
  go,
  onDose,
}: {
  state: HealthState;
  statuses: MedicationStatus[];
  due: MedicationStatus[];
  today: string;
  go: (view: View) => void;
  onDose: (medicationId: string, date: string, taken: boolean) => void;
}) {
  if (!due.length) {
    const next = statuses
      .map((status) => status.nextDue)
      .filter((date): date is string => date !== null)
      .sort()[0];
    return (
      <div className="tl-row">
        <span className="tl-well"><Icon name="medication" /></span>
        <button type="button" className="tl-row-copy tl-row-link" onClick={() => go("meds")}>
          <b>Meds</b>
          <small>{next ? `No doses due · next on ${dateLabel(next, { weekday: "long" })}` : "No doses due"}</small>
        </button>
      </div>
    );
  }
  return (
    <>
      {due.map((status) => (
        <div key={status.medication.id} className={`tl-row ${status.today === true ? "done" : ""}`.trim()}>
          <span className="tl-well"><Icon name="medication" /></span>
          <button type="button" className="tl-row-copy tl-row-link" onClick={() => go("meds")}>
            <b>{status.medication.name}</b>
            <small>{status.taken} of {status.due} {status.medication.schedule === "daily" ? "days" : "doses"} · last 14 days</small>
            <DayStrip size="small" cells={medicationCells(state, status.medication, today, 14)} label={`${status.medication.name}, last 14 days`} />
          </button>
          <button type="button" className={`chip${status.today === true ? " primary" : ""}`} aria-label={`${status.medication.name}: ${status.today === true ? "taken today; undo" : "mark taken today"}`} aria-pressed={status.today === true} onClick={() => onDose(status.medication.id, today, true)}><Icon name="check" />{status.today === true ? "Taken today" : status.today === false ? "Missed · change" : "Mark taken"}</button>
        </div>
      ))}
    </>
  );
}

/**
 * One thing to log, its number, and the days that number came from.
 *
 * The row used to be a name and a bare statistic — "4 of 7 days" — which tells
 * you nothing a picture of those seven days would not tell you better.
 */
function LogRow({
  icon,
  title,
  detail,
  done,
  graphic,
  children,
}: {
  icon: string;
  title: string;
  detail: string;
  done: boolean;
  graphic?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={done ? "tl-row log-row done" : "tl-row log-row"}>
      <span className="tl-well">
        <Icon name={icon} />
      </span>
      <span className="tl-row-copy">
        <b>{title}</b>
        <small>{detail}</small>
        {graphic}
      </span>
      {children}
    </div>
  );
}

/** Presets for the common answer, a box for the rest, and a way back to nothing. */
function NumberEntry({
  label,
  suffix,
  value,
  presets,
  min,
  max,
  onSet,
}: {
  label: string;
  suffix: string;
  value: number | null;
  presets: number[];
  min: number;
  max: number;
  onSet: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [editing, setEditing] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < min || parsed > max) return;
    onSet(parsed);
    setDraft(String(parsed));
    setEditing(false);
  }

  if (!editing) return <button type="button" className="chip" aria-label={`${value === null ? "Add" : "Edit"} ${label}`} aria-expanded={false} onClick={() => setEditing(true)}>{value === null ? "Add" : "Edit"}</button>;

  return (
    <form className="minute-form" onSubmit={submit}>
      {presets.map((preset) => (
        <button key={preset} type="button" className="chip" onClick={() => { setDraft(String(preset)); onSet(preset); setEditing(false); }}>
          {`${preset} ${suffix}`}
        </button>
      ))}
      <input
        autoFocus
        type="number"
        min={min}
        max={max}
        step="any"
        inputMode="decimal"
        value={draft}
        placeholder={suffix}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className="chip primary" aria-label={`Save ${label}`}>
        Save
      </button>
      {value !== null ? (
        <button type="button" className="chip clear-chip" onClick={() => { setDraft(""); onSet(null); setEditing(false); }} aria-label={`Clear ${label}`}>
          <Icon name="close" />
        </button>
      ) : null}
      <button type="button" className="chip" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}
