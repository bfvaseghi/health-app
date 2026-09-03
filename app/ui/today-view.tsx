"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DailyEntry, HealthState, MedicationStatus } from "../health-model";
import {
  addDays,
  buildWorkoutSessions,
  dateLabel,
  averageBedtime,
  entriesInWindow,
  formatClock,
  latestRecordDate,
  medicationStatuses,
  mindSummary,
  preferredSleepEntries,
  proteinSummary,
} from "../health-model";
import { dailyBrief } from "../brief";
import { daySlice } from "../series";
import { buildPlan, currentBlockWeek, nextSession, sessionToText, withAddedSets, workoutWeekStreak } from "../training/coach";
import { sleepSeries } from "./charts";
import { Icon } from "./icons";
import { Empty } from "./primitives";
import { Tide } from "./tide";
import { average, copyText, formatTime, hoursLabel } from "./format";
import type { Modal, View } from "./types";

/**
 * The landing screen answers the first question — what should I do today? —
 * in a sentence, then shows the night as a tide and the day's few actions as
 * rows. Everything you could do here before you still can: answer a dose, copy
 * the next session, log protein and meditation, mark the journal, open any
 * night, and reach the full check-in.
 */
export function TodayView({
  state,
  editableState,
  today,
  go,
  open,
  demo,
  updateDaily,
  onDose,
  onNotice,
}: {
  state: HealthState;
  editableState: HealthState;
  today: string;
  go: (view: View) => void;
  open: (modal: Modal) => void;
  demo: boolean;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  onDose: (medicationId: string, date: string, taken: boolean) => void;
  onNotice: (message: string) => void;
}) {
  const nights = useMemo(() => preferredSleepEntries(state.sleepEntries), [state.sleepEntries]);
  const medications = useMemo(() => medicationStatuses(state, today, 30), [state, today]);
  const streak = useMemo(() => workoutWeekStreak(state, today), [state, today]);

  // The coach's answer for this week, worked out from the log the same way the
  // Fitness screen does, so the two never disagree.
  const eligibleState = useMemo(
    () => ({ ...state, workoutSets: state.workoutSets.filter((set) => set.date <= today) }),
    [state, today],
  );
  const week = useMemo(() => currentBlockWeek(eligibleState, today), [eligibleState, today]);
  const plan = useMemo(
    () => withAddedSets(buildPlan(eligibleState, today, state.goals.trainingDays[week] || undefined, week), eligibleState, today),
    [eligibleState, state.goals.trainingDays, today, week],
  );
  const next = useMemo(() => nextSession(plan, eligibleState, today), [plan, eligibleState, today]);
  const hasPlan = eligibleState.workoutSets.length >= 10 && !(next.session && next.session.sets === 0);

  const lastNight = nights.find((entry) => entry.date <= today);
  const entry = state.dailyEntries.find((item) => item.date === today);
  const isEmpty = latestRecordDate(state) === null;
  const due = state.goals.trackMedication ? medications.filter((status) => status.dueToday) : [];
  const answered = due.filter((status) => status.today !== null).length;
  const usual = averageBedtime(entriesInWindow(nights, today, 14));
  const usualClock = usual ? formatClock(usual) : null;
  const lastNightEditable = Boolean(
    lastNight && editableState.sleepEntries.some((item) => item.date === lastNight.date && item.source === lastNight.source),
  );

  const brief = dailyBrief({
    sleepHours: lastNight && lastNight.date === today ? lastNight.durationHours : null,
    sleepGoal: state.goals.sleepHours,
    medsDue: due.length,
    medsAnswered: answered,
    medsMissed: due.some((status) => status.today === false),
    nextSession: hasPlan && next.session ? { name: next.session.name, sets: next.session.sets } : null,
    sessionsDone: hasPlan ? next.done : 0,
    sessionsOf: hasPlan ? next.of : 0,
    proteinG: entry?.proteinG ?? null,
    proteinTarget: state.goals.proteinTargetG ?? null,
    meditated: Boolean(entry?.meditationMinutes),
    journaled: Boolean(entry?.journaled),
    usualBedtime: usualClock,
    empty: isEmpty,
  });

  const fortnight = useMemo(() => sleepSeries(state, today, 14), [state, today]);
  // A point on the tide opens into its day: the night, the session, the doses, the plate.
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const slice = useMemo(() => (pickedDay && pickedDay !== today ? daySlice(state, pickedDay) : null), [state, pickedDay, today]);
  const fortnightAverage = average(fortnight.map((point) => point.value));
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));

  return (
    <div className="page tl-page">
      <div className="tl-section-head">
        <span className="tl-caps">{dateLabel(today, { weekday: "long", month: "long", day: "numeric" })}</span>
        {streak.weeks ? (
          <span className="tl-meta">
            <b>{streak.weeks}</b>
            {`\u2011week streak${streak.currentWeek ? "" : " · one lift keeps it"}`}
          </span>
        ) : null}
      </div>

      <h1 className="tl-hero" tabIndex={-1}>
        {brief.headline[0]}
        <br />
        <em>{brief.headline[1]}</em>
      </h1>
      <p className="tl-lede">
        {brief.detail}
        {brief.detail ? " " : ""}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            lastNight && !lastNightEditable
              ? go("sleep")
              : open({ kind: "sleep", date: lastNight?.date === today ? today : today, source: lastNight?.date === today ? lastNight.source : undefined })
          }
        >
          {lastNight?.date === today ? (lastNightEditable ? "Edit last night" : "See the night") : "Add last night"}
        </button>
      </p>

      <section className="tl-section" aria-label="Sleep, last 14 nights">
        <div className="tl-section-head">
          <span className="tl-caps">Sleep · last 14 nights</span>
          <span className="tl-meta">
            {fortnightAverage === null ? "no nights yet" : <>avg <b>{`${fortnightAverage.toFixed(1)}h`}</b></>}
          </span>
        </div>
        <Tide data={fortnight} label="Sleep, hours a night" unit="h" goal={state.goals.sleepHours} format={(value) => value.toFixed(1)} empty="Two recorded nights draw the first tide." onSelect={setPickedDay} />
        {slice ? (
          <p className="tl-slice" aria-live="polite">
            <b>{dateLabel(slice.date, { weekday: "long", month: "short", day: "numeric" })}</b>
            {" — "}
            {[
              slice.sleepHours === null ? "no night recorded" : `slept ${hoursLabel(slice.sleepHours)}`,
              slice.sessions.length ? `${slice.sessions.join(" and ")} · ${slice.sets} sets` : "rest day",
              slice.medsDue ? `${slice.medsTaken} of ${slice.medsDue} ${slice.medsDue === 1 ? "dose" : "doses"} taken${slice.medsMissed ? `, ${slice.medsMissed} missed` : ""}` : "",
              slice.proteinG === null ? "" : `${Math.round(slice.proteinG)} g protein`,
              slice.meditationMinutes ? `meditated ${slice.meditationMinutes} min` : "",
              slice.journaled ? "journaled" : "",
            ]
              .filter(Boolean)
              .join(", ")}
            {". "}
            <button type="button" className="text-button" onClick={() => open({ kind: "sleep", date: slice.date, source: nights.find((item) => item.date === slice.date)?.source })}>
              Open the night
            </button>
          </p>
        ) : null}
        <div className="tl-days" role="group" aria-label="Last seven nights">
          {weekDays.map((date) => {
            const night = nights.find((item) => item.date === date);
            const hours = night?.durationHours ?? null;
            return (
              <button
                key={date}
                type="button"
                className={`${date === today ? "current" : ""} ${hours !== null && hours >= state.goals.sleepHours ? "goal" : ""}`.trim()}
                onClick={() => open({ kind: "sleep", date, source: night?.source })}
                aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}: ${hours === null ? "no sleep recorded" : `${hours.toFixed(1)} hours`}`}
              >
                {dateLabel(date, { weekday: "short" })}
                <b>{hours === null ? "—" : hours.toFixed(1)}</b>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tl-section" aria-label="Today">
        <div className="tl-section-head">
          <span className="tl-caps">Today</span>
          <button type="button" className="text-button" onClick={() => open({ kind: "checkin", date: today })}>
            Everything else <Icon name="arrow" />
          </button>
        </div>
        <div className="tl-rows">
          {state.goals.trackMedication && medications.length ? (
            <MedRows statuses={medications} due={due} today={today} go={go} onDose={onDose} />
          ) : null}

          {hasPlan ? (
            <div className="tl-row">
              <span className="tl-well"><Icon name="dumbbell" /></span>
              <button type="button" className="tl-row-copy tl-row-link" onClick={() => go("fitness")}>
                {next.session ? (
                  <>
                    <b>{`${next.session.name} · ${next.session.sets} sets`}</b>
                    <small>{`${next.done} of ${next.of} this week${plan.deload ? " · an easier week" : ""}${
                      next.session.exercises.some((exercise) => exercise.stepUp) ? " · a load steps up" : ""
                    }`}</small>
                  </>
                ) : (
                  <>
                    <b>Week done</b>
                    <small>{`All ${next.of} sessions logged. Rest, or add one on Fitness.`}</small>
                  </>
                )}
              </button>
              {next.session ? (
                <button
                  type="button"
                  className="button primary"
                  onClick={async () =>
                    onNotice(
                      (await copyText(sessionToText(plan, next.session as NonNullable<typeof next.session>)))
                        ? "Session copied. Paste it into Strong."
                        : "Copying is blocked here.",
                    )
                  }
                >
                  <Icon name="copy" />
                  Copy
                </button>
              ) : (
                <span className="tl-done"><Icon name="check" /></span>
              )}
            </div>
          ) : null}

          {usualClock ? (
            <div className="tl-row is-static">
              <span className="tl-well"><Icon name="moon" /></span>
              <span className="tl-row-copy">
                <b>{`In bed by ${usualClock}`}</b>
                <small>your usual, over the last two weeks</small>
              </span>
            </div>
          ) : null}

          <LogRow
            icon="fuel"
            title="Protein"
            detail={
              entry?.proteinG != null
                ? `${Math.round(entry.proteinG)} g${state.goals.proteinTargetG ? entry.proteinG >= state.goals.proteinTargetG ? " · at target" : ` · ${Math.round(state.goals.proteinTargetG - entry.proteinG)} g short` : ""}`
                : "not logged — MyFitnessPal fills this in"
            }
            done={entry?.proteinG != null}
          >
            <NumberEntry
              key={`protein:${entry?.proteinG ?? ""}`}
              label="Grams of protein today"
              suffix="g"
              value={entry?.proteinG ?? null}
              presets={state.goals.proteinTargetG ? [state.goals.proteinTargetG] : []}
              min={0}
              max={500}
              onSet={(value) => updateDaily(today, (current) => ({ ...current, proteinG: value }))}
            />
          </LogRow>

          <LogRow
            icon="mind"
            title="Meditation"
            detail={entry?.meditationMinutes ? `${entry.meditationMinutes} minutes` : "not logged"}
            done={Boolean(entry?.meditationMinutes)}
          >
            <NumberEntry
              key={`meditation:${entry?.meditationMinutes ?? ""}`}
              label="Minutes meditated today"
              suffix="min"
              value={entry?.meditationMinutes ?? null}
              presets={[10, 20]}
              min={1}
              max={240}
              onSet={(value) => updateDaily(today, (current) => ({ ...current, meditationMinutes: value }))}
            />
          </LogRow>

          <LogRow icon="journal" title="Journal" detail={entry?.journaled ? "written" : "not written"} done={Boolean(entry?.journaled)}>
            <button
              type="button"
              className={entry?.journaled ? "chip primary" : "chip"}
              aria-pressed={entry?.journaled === true}
              onClick={() => updateDaily(today, (current) => ({ ...current, journaled: !current.journaled }))}
            >
              <Icon name="check" />
              {entry?.journaled ? "Done" : "Mark done"}
            </button>
          </LogRow>
        </div>
      </section>

      <ThisWeek state={state} today={today} go={go} />

      {isEmpty && !demo ? (
        <section className="panel wide-panel setup-card">
          <Empty
            icon="upload"
            title="Bring in your history when you are ready"
            body="Manual logging already works. Import Oura, Whoop, Apple Health, Strong, or a dated table to add context."
            action={<button type="button" className="button secondary" onClick={() => open({ kind: "import" })}><Icon name="upload" />Import history</button>}
          />
        </section>
      ) : null}

      {lastNight && lastNight.date !== today ? (
        <p className="tl-line">
          {`Latest recorded night: ${dateLabel(lastNight.date, { weekday: "short", month: "short", day: "numeric" })}, ${
            lastNight.durationHours === null ? "duration unknown" : hoursLabel(lastNight.durationHours)
          }${lastNight.bedtime && lastNight.wakeTime ? `, ${formatTime(lastNight.bedtime)} – ${formatTime(lastNight.wakeTime)}` : ""} · ${lastNight.source}.`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The medications, one row each. A dose that is due and unanswered gets its
 * two buttons; an answered one gets its mark; one not due today says when it
 * is. A finasteride, a fluoxetine and a semaglutide are three questions, and a
 * weekly injection is never counted missed on the six days it is not due.
 */
function MedRows({
  statuses,
  due,
  today,
  go,
  onDose,
}: {
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
          <small>{next ? `nothing due today · next on ${dateLabel(next, { weekday: "long" })}` : "nothing due today"}</small>
        </button>
      </div>
    );
  }
  const settled = due.every((status) => status.today !== null);
  return (
    <>
      {due.map((status) => (
        <div key={status.medication.id} className={`tl-row ${status.today === true ? "done" : ""}`.trim()}>
          <span className="tl-well"><Icon name="medication" /></span>
          <button type="button" className="tl-row-copy tl-row-link" onClick={() => go("meds")}>
            <b>{status.medication.name}</b>
            <small className={status.today === false ? "warn" : undefined}>
              {status.today === true
                ? "taken today"
                : status.today === false
                  ? "marked missed"
                  : status.medication.schedule === "daily"
                    ? "due today"
                    : "due today — the weekly dose"}
            </small>
          </button>
          {status.today === true ? (
            <span className="tl-done"><Icon name="check" /></span>
          ) : (
            <span className="tl-row-end" role="group" aria-label={`${status.medication.name} today`}>
              <button type="button" className="button primary small" aria-pressed={false} onClick={() => onDose(status.medication.id, today, true)}>
                <Icon name="check" />
                Taken
              </button>
              <button
                type="button"
                className={status.today === false ? "button warn small" : "button secondary small"}
                aria-pressed={status.today === false}
                onClick={() => onDose(status.medication.id, today, false)}
              >
                Missed
              </button>
            </span>
          )}
        </div>
      ))}
      {settled ? null : null}
    </>
  );
}

function LogRow({
  icon,
  title,
  detail,
  done,
  children,
}: {
  icon: string;
  title: string;
  detail: string;
  done: boolean;
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
    onSet(parsed);
    setDraft(String(parsed));
  }

  return (
    <form className="minute-form" onSubmit={submit}>
      {presets.map((preset) => (
        <button key={preset} type="button" className="chip" onClick={() => { setDraft(String(preset)); onSet(preset); }}>
          {`${preset}${suffix === "min" ? "m" : suffix}`}
        </button>
      ))}
      <input
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
        <Icon name="check" />
      </button>
      {value !== null ? (
        <button type="button" className="chip clear-chip" onClick={() => { setDraft(""); onSet(null); }} aria-label={`Clear ${label}`}>
          <Icon name="close" />
        </button>
      ) : null}
    </form>
  );
}

/** The week in one sentence; each number is also the way to its section. */
function ThisWeek({ state, today, go }: { state: HealthState; today: string; go: (view: View) => void }) {
  const sleepHours = average(entriesInWindow(preferredSleepEntries(state.sleepEntries), today, 7).map((n) => n.durationHours));
  const workouts = buildWorkoutSessions(state.workoutSets.filter((set) => set.date > addDays(today, -7) && set.date <= today)).length;
  const protein = proteinSummary(state, today, 7);
  const mind = mindSummary(state, today, 7);

  const link = (view: View, text: string) => (
    <button type="button" className="text-button" onClick={() => go(view)}>
      {text}
    </button>
  );

  return (
    <p className="tl-line" aria-label="Last seven days">
      {"This week so far — "}
      {link("sleep", sleepHours === null ? "no nights recorded" : `${sleepHours.toFixed(1)} h of sleep a night`)}
      {", "}
      {link("fitness", `${workouts} ${workouts === 1 ? "workout" : "workouts"}`)}
      {", "}
      {link("fitness", protein.average === null ? "no protein logged" : `${Math.round(protein.average)} g protein a day`)}
      {", "}
      {link("mind", `${mind.meditationDays} ${mind.meditationDays === 1 ? "meditation" : "meditations"}`)}
      {", "}
      {link("mind", mind.journalDays ? `journaled ${mind.journalDays} ${mind.journalDays === 1 ? "day" : "days"}` : "journal not yet written")}
      {"."}
    </p>
  );
}
