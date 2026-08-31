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
import { buildPlan, currentBlockWeek, nextSession, sessionToText, withAddedSets } from "../training/coach";
import { muscleLabels } from "../training/muscles";
import { Icon } from "./icons";
import { Empty, Fold, PageHeading } from "./primitives";
import { average, copyText, formatTime } from "./format";
import type { Modal, View } from "./types";

/**
 * The landing screen says how last night went and takes today's few numbers.
 * The two things to act on — the medication and the session to lift next — sit
 * at the foot of it, where a thumb reaches them on a phone.
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

  const lastNight = nights.find((entry) => entry.date <= today);
  const entry = state.dailyEntries.find((item) => item.date === today);
  const week = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));

  const isEmpty = latestRecordDate(state) === null;
  const hasPriority = (state.goals.trackMedication && medications.length > 0) || state.workoutSets.filter((set) => set.date <= today).length >= 10;
  const lastNightEditable = Boolean(lastNight && editableState.sleepEntries.some(
    (entry) => entry.date === lastNight.date && entry.source === lastNight.source,
  ));

  return (
    <div className="page">
      <PageHeading
        eyebrow={dateLabel(today, { weekday: "long", month: "long", day: "numeric" })}
        title="Today"
        action={
          <div className="heading-actions">
            <button type="button" className="button primary" onClick={() => open({ kind: "sleep", date: today })}>
              <Icon name="plus" />
              Add sleep
            </button>
          </div>
        }
      />

      {hasPriority ? (
        <section className="today-priority" aria-labelledby="do-today-title">
          <div className="section-head compact">
            <div><p className="kicker">Action first</p><h2 id="do-today-title">Do today</h2></div>
          </div>
          {state.goals.trackMedication && medications.length ? (
            <Medication statuses={medications} today={today} go={go} onDose={onDose} />
          ) : null}
          <NextUp state={state} today={today} go={go} onNotice={onNotice} />
          <Tonight state={state} today={today} />
        </section>
      ) : null}

      <section className="today-card solo compact-sleep" aria-label={lastNight?.date === today ? "Last night" : "Latest recorded sleep"}>
        <div className="today-main">
          <span className="moon-orb">
            <Icon name="moon" />
          </span>
          <div>
            <p className="kicker">
              {lastNight
                ? `${lastNight.date === today ? "Last night" : "Latest recorded"} · ${dateLabel(lastNight.date, { weekday: "short", month: "short", day: "numeric" })}`
                : "No nights yet"}
            </p>
            <h2>{lastNight?.durationHours != null ? `${lastNight.durationHours.toFixed(1)} hours` : "Not recorded"}</h2>
            <p>
              {lastNight?.bedtime && lastNight.wakeTime ? (
                <>
                  {`${formatTime(lastNight.bedtime)} – ${formatTime(lastNight.wakeTime)} · `}
                  <span className="source-name">{lastNight.source}</span>
                </>
              ) : lastNight ? (
                <>
                  {"Recorded by "}
                  <span className="source-name">{lastNight.source}</span>
                </>
              ) : (
                "Add a night by hand or connect Apple Health"
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => lastNight && !lastNightEditable ? go("sleep") : open({ kind: "sleep", date: lastNight?.date ?? today, source: lastNight?.source })}
        >
          {lastNight ? lastNightEditable ? "Edit" : "View history" : "Add sleep"} <Icon name="arrow" />
        </button>
      </section>

      <section className="week-strip" aria-label="Last seven days">
        {week.map((date) => {
          const night = nights.find((item) => item.date === date);
          const hours = night?.durationHours ?? null;
          return (
            <button
              key={date}
              type="button"
              onClick={() => open({ kind: "sleep", date, source: night?.source })}
              className={date === today ? "current" : ""}
              aria-label={`${dateLabel(date, { weekday: "long", month: "long", day: "numeric" })}: ${
                hours === null ? "no sleep recorded" : `${hours.toFixed(1)} hours`
              }`}
            >
              <small aria-hidden="true">{dateLabel(date, { weekday: "short" })}</small>
              <span
                aria-hidden="true"
                className={
                  hours === null ? "day-dot" : hours >= state.goals.sleepHours ? "day-dot strong" : "day-dot partial"
                }
              >
                {hours === null ? "—" : hours.toFixed(1)}
              </span>
            </button>
          );
        })}
      </section>

      <LogToday state={state} today={today} entry={entry} updateDaily={updateDaily} open={open} />

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
    </div>
  );
}

/** Three lightweight daily actions. Body measurements belong in the full check-in. */
function LogToday({
  state,
  today,
  entry,
  updateDaily,
  open,
}: {
  state: HealthState;
  today: string;
  entry: DailyEntry | undefined;
  updateDaily: (date: string, update: (current: DailyEntry) => DailyEntry) => void;
  open: (modal: Modal) => void;
}) {
  const target = state.goals.proteinTargetG;

  return (
    <section className="panel wide-panel log-panel">
      <div className="panel-head wrap">
        <div>
          <h2>Log today</h2>
        </div>
        <button type="button" className="text-button" onClick={() => open({ kind: "checkin", date: today })}>
          Everything else <Icon name="arrow" />
        </button>
      </div>

      <div className="log-rows">
        <LogRow
          icon="fuel"
          title="Protein"
          detail={
            entry?.proteinG != null
              ? `${Math.round(entry.proteinG)} g${target ? entry.proteinG >= target ? " · target reached" : ` · ${Math.round(target - entry.proteinG)} g below target` : " · logged"}`
              : "Not logged — MyFitnessPal fills this in"
          }
          done={entry?.proteinG != null}
        >
          <NumberEntry
            key={`protein:${entry?.proteinG ?? ""}`}
            label="Grams of protein today"
            suffix="g"
            value={entry?.proteinG ?? null}
            presets={target ? [target] : []}
            min={0}
            max={500}
            onSet={(value) => updateDaily(today, (current) => ({ ...current, proteinG: value }))}
          />
        </LogRow>

        <LogRow
          icon="mind"
          title="Meditation"
          detail={entry?.meditationMinutes ? `${entry.meditationMinutes} minutes` : "Not logged"}
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

        <LogRow
          icon="journal"
          title="Journal"
          detail={entry?.journaled ? "Written" : "Not written"}
          done={Boolean(entry?.journaled)}
        >
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
    <div className={done ? "log-row done" : "log-row"}>
      <span className="log-icon">
        <Icon name={icon} />
      </span>
      <span className="log-copy">
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

/**
 * The medications due today, each asked about on its own.
 *
 * One tick for "medication" could only ever be a lie about three of them. The
 * daily ones are asked every day; a weekly injection is only asked on the day
 * it is due, and is never counted missed on the six days it is not.
 *
 * It folds shut like the rest of the page. The head carries the answer to the
 * question the page is asking — how many of today's are answered — so opening
 * it is for doing something about that, not for finding it out.
 */
function Medication({
  statuses,
  today,
  go,
  onDose,
}: {
  statuses: MedicationStatus[];
  today: string;
  go: (view: View) => void;
  onDose: (medicationId: string, date: string, taken: boolean) => void;
}) {
  const due = statuses.filter((status) => status.dueToday);
  const answered = due.filter((status) => status.today !== null).length;
  const settled = due.length > 0 && answered === due.length;
  const missedAny = due.some((status) => status.today === false);
  const next = statuses
    .map((status) => status.nextDue)
    .filter((date): date is string => date !== null)
    .sort()[0];
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? !settled;

  const line =
    due.length === 0
      ? next
        ? `Nothing due today — next on ${dateLabel(next, { weekday: "long" })}.`
        : "Nothing due today."
      : settled
        ? missedAny
          ? `Logged for today — ${answered} of ${due.length} answered.`
          : "All taken today."
        : `${answered} of ${due.length} answered.`;

  // With nothing due there is nothing to open onto, so the sentence stands on
  // its own rather than behind a chevron that reveals an empty box.
  if (due.length === 0) {
    return (
      <section className="panel wide-panel med-fold" aria-label="Medication">
        <div className="fold-head is-static">
          <span className="fold-title">
            <b>Meds today</b>
            <small>{line}</small>
          </span>
        </div>
        <MedsLink go={go} />
      </section>
    );
  }

  return (
    <section className="panel wide-panel med-fold" aria-label="Medication">
      <Fold
        title={<b>Meds today</b>}
        summary={<small className={settled ? undefined : "is-open"}>{line}</small>}
        open={open}
        onToggle={() => setManualOpen(!open)}
      >
        <ul className="med-tick-list">
          {due.map((status) => (
            <li key={status.medication.id} className="med-tick">
              <span className="med-tick-name">{status.medication.name}</span>
              <span className="med-tick-answer" role="group" aria-label={`${status.medication.name} today`}>
                <button
                  type="button"
                  className={status.today === true ? "button primary small" : "button secondary small"}
                  aria-pressed={status.today === true}
                  onClick={() => onDose(status.medication.id, today, true)}
                >
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
            </li>
          ))}
        </ul>
        <MedsLink go={go} />
      </Fold>
    </section>
  );
}

function MedsLink({ go }: { go: (view: View) => void }) {
  return (
    <button type="button" className="text-button med-all" onClick={() => go("meds")}>
      All meds <Icon name="arrow" />
    </button>
  );
}

/**
 * The session to do next, and one tap to put it in Strong.
 *
 * This is what the app is for at the door of a gym: not a page to read, but the
 * name of today's session and the button that sends it to the app you actually
 * lift with. Everything behind it — which week of the block, which session of
 * the week, what load each movement has earned — is worked out from the log,
 * so there is nothing here to set up or keep in step.
 */
function NextUp({
  state,
  today,
  go,
  onNotice,
}: {
  state: HealthState;
  today: string;
  go: (view: View) => void;
  onNotice: (message: string) => void;
}) {
  const eligibleState = useMemo(
    () => ({ ...state, workoutSets: state.workoutSets.filter((set) => set.date <= today) }),
    [state, today],
  );
  const week = useMemo(() => currentBlockWeek(eligibleState, today), [eligibleState, today]);
  // Whatever you added to this week on the coach is part of this week here
  // too. One week, one answer, wherever you happen to be looking at it.
  const plan = useMemo(
    () => withAddedSets(buildPlan(eligibleState, today, state.goals.trainingDays[week] || undefined, week), eligibleState, today),
    [eligibleState, state.goals.trainingDays, today, week],
  );
  const next = useMemo(() => nextSession(plan, eligibleState, today), [plan, eligibleState, today]);

  // Nothing lifted yet means nothing to recommend from, and the empty state on
  // Fitness says that better than a card here could.
  if (eligibleState.workoutSets.length < 10 || (next.session && next.session.sets === 0)) return null;

  const trains = [...new Set((next.session?.exercises ?? []).map((exercise) => muscleLabels[exercise.muscle]))];

  return (
    <section className="section-block">
      <div className="section-head">
        <div>
          <h2>Next session</h2>
        </div>
        <span className="section-note">
          {`${next.done} of ${next.of} done this week${plan.deload ? " · an easier week" : ""}`}
        </span>
      </div>

      {next.session ? (
        <div className="next-card">
          <button type="button" className="next-body" onClick={() => go("fitness")}>
            <span className="next-orb">
              <Icon name="dumbbell" />
            </span>
            <span className="next-copy">
              <strong>{next.session.name}</strong>
              <small>{`${next.session.sets} sets · ${trains.slice(0, 4).join(", ").toLowerCase()}${
                trains.length > 4 ? ` +${trains.length - 4}` : ""
              }`}</small>
            </span>
            <Icon name="arrow" />
          </button>
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
            Copy for Strong
          </button>
        </div>
      ) : (
        <div className="next-card">
          <div className="next-body is-done">
            <span className="next-orb">
              <Icon name="check" />
            </span>
            <span className="next-copy">
              <strong>Week done</strong>
              <small>{`All ${next.of} sessions logged. Rest, or add one on Fitness.`}</small>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The evening's one number, computed from your own recent nights: the usual
 * bedtime. "What should I do today" ends at lights-out, so the answer card
 * carries it — a cue, not a control.
 */
function Tonight({ state, today }: { state: HealthState; today: string }) {
  const recent = entriesInWindow(preferredSleepEntries(state.sleepEntries), today, 14);
  const usual = averageBedtime(recent);
  const clock = usual ? formatClock(usual) : null;
  if (!clock) return null;
  return (
    <p className="tonight-line">
      <Icon name="moon" />
      {`Tonight: in bed around ${clock}`}
      <span>{` · your usual, over the last two weeks`}</span>
    </p>
  );
}

/** Four numbers, four destinations: the summary is also the table of contents. */
function ThisWeek({ state, today, go }: { state: HealthState; today: string; go: (view: View) => void }) {
  const sleepHours = average(entriesInWindow(preferredSleepEntries(state.sleepEntries), today, 7).map((n) => n.durationHours));
  const workouts = buildWorkoutSessions(state.workoutSets.filter((set) => set.date > addDays(today, -7) && set.date <= today)).length;
  const protein = proteinSummary(state, today, 7);
  const mind = mindSummary(state, today, 7);

  const cards: Array<{ view: View; icon: string; label: string; value: string; detail: string }> = [
    {
      view: "sleep",
      icon: "moon",
      label: "Sleep",
      value: sleepHours === null ? "—" : `${sleepHours.toFixed(1)} h`,
      detail: `a night · goal ${state.goals.sleepHours} h`,
    },
    {
      view: "fitness",
      icon: "dumbbell",
      label: "Training",
      value: `${workouts}`,
      detail: workouts === 1 ? "workout" : "workouts",
    },
    {
      view: "fitness",
      icon: "fuel",
      label: "Protein",
      value: protein.average === null ? "—" : `${Math.round(protein.average)} g`,
      detail: protein.target === null ? "a day" : `a day · target ${protein.target} g`,
    },
    // Two habits, two tiles. They are different things and one tile could only
    // ever report one of them properly.
    {
      view: "mind",
      icon: "mind",
      label: "Meditated",
      value: `${mind.meditationDays} ${mind.meditationDays === 1 ? "day" : "days"}`,
      detail: "in the last seven",
    },
    {
      view: "mind",
      icon: "journal",
      label: "Journaled",
      value: `${mind.journalDays} ${mind.journalDays === 1 ? "day" : "days"}`,
      detail: "in the last seven",
    },
  ];

  return (
    <section className="section-block">
      <div className="section-head">
        <div>
          <h2>Last 7 days</h2>
        </div>
      </div>
      <div className="week-grid">
        {cards.map((card) => (
          <button key={card.label} type="button" className="week-card" onClick={() => go(card.view)}>
            <span className="week-icon">
              <Icon name={card.icon} />
            </span>
            <span className="week-copy">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.detail}</small>
            </span>
            <Icon name="arrow" />
          </button>
        ))}
      </div>
    </section>
  );
}
