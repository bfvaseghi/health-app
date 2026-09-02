"use client";

import { useMemo } from "react";
import type { HealthState, Medication } from "../health-model";
import { addDays, dateLabel, isDue, medicationStatuses } from "../health-model";
import { adherenceSeries } from "../series";
import { Icon } from "./icons";
import { ConfirmButton, Empty } from "./primitives";
import { Tide } from "./tide";
import type { Modal } from "./types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * What you are on, and whether you took it.
 *
 * One tick a day could only ever be a lie about two of them. A finasteride, a
 * fluoxetine and a semaglutide are three different questions: two are daily and
 * one is a weekly injection, and a tracker that marked the injection missed on
 * the six days it was not due is one you would stop reading.
 */
export function MedsView({
  state,
  today,
  open,
  onDose,
  onDeleteMedication,
}: {
  state: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onDose: (medicationId: string, date: string, taken: boolean) => void;
  onDeleteMedication: (id: string) => void;
}) {
  const statuses = useMemo(() => medicationStatuses(state, today, 30), [state, today]);
  const due = statuses.filter((status) => status.dueToday);
  const answered = due.filter((status) => status.today !== null).length;
  const missed = due.filter((status) => status.today === false).length;
  const adherence = useMemo(() => adherenceSeries(state, today, 30, 30), [state, today]);
  const longestRun = Math.max(0, ...statuses.map((status) => status.streak));

  const headline = !statuses.length
    ? "Nothing added yet."
    : !due.length
      ? "Nothing due today."
      : answered < due.length
        ? due.length - answered === 1
          ? "One to answer."
          : `${due.length - answered} to answer.`
        : missed
          ? "Logged for today."
          : due.length === 1
            ? "Taken."
            : due.length === 2
              ? "Both taken."
              : "All taken.";

  const lede = !statuses.length
    ? "Add what you are on and how often. Each medication is only asked about on the days it is due."
    : due.length
      ? due
          .map((status) => `${status.medication.name}${status.today === true ? " · taken" : status.today === false ? " · missed" : " · due"}`)
          .join(" · ")
      : statuses
          .map((status) => status.nextDue ? `${status.medication.name} next ${dateLabel(status.nextDue, { weekday: "long" })}` : status.medication.name)
          .join(" · ");

  return (
    <div className="page tl-page">
      <div className="tl-section-head">
        <span className="tl-caps">Meds · today</span>
        <button type="button" className="text-button" onClick={() => open({ kind: "medication" })}>
          <Icon name="plus" /> Add a medication
        </button>
      </div>
      <h1 className="tl-hero" tabIndex={-1}>{headline}</h1>
      <p className="tl-lede">{lede}</p>

      {statuses.length ? (
        <section className="tl-section" aria-label="Adherence, rolling 30 days">
          <div className="tl-section-head">
            <span className="tl-caps">Adherence · rolling 30 days</span>
            {longestRun ? (
              <span className="tl-meta">
                <b>{longestRun}</b>
                {` ${longestRun === 1 ? "dose" : "in a row"}`}
              </span>
            ) : null}
          </div>
          <Tide data={adherence} label="Adherence, percent of due doses taken" unit="%" min={Math.max(0, Math.min(90, ...adherence.map((point) => point.value ?? 100)) - 4)} max={100.5} format={(value) => String(Math.round(value))} empty="Answer a few doses and the tide appears." />
        </section>
      ) : null}

      {statuses.length ? (
        <section className="tl-section" aria-label="Each medication">
          <div className="tl-rows">
            {statuses.map((status) => (
              <div key={status.medication.id} className="tl-row tl-med" style={{ alignItems: "flex-start", flexDirection: "column", gap: 10, padding: "16px 0" }}>
                <div className="tl-section-head" style={{ width: "100%" }}>
                  <span className="tl-row-copy">
                    <b>{status.medication.name}</b>
                    <small>
                      {status.medication.schedule === "daily" ? "every day" : `every ${WEEKDAYS[status.medication.dueDay ?? 1]}`}
                      {status.dueToday ? "" : status.nextDue ? ` · next ${dateLabel(status.nextDue, { weekday: "long" })}` : ""}
                    </small>
                  </span>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${status.medication.name}`}
                      onClick={() => open({ kind: "medication", id: status.medication.id })}
                    >
                      <Icon name="pencil" />
                    </button>
                    <ConfirmButton
                      label={`Delete ${status.medication.name} and everything recorded against it`}
                      onConfirm={() => onDeleteMedication(status.medication.id)}
                    />
                  </div>
                </div>

                {status.dueToday ? (
                  <div className="med-answer" role="group" aria-label={`${status.medication.name} today`} style={{ width: "100%", marginTop: 0 }}>
                    <button
                      type="button"
                      className={status.today === true ? "button primary" : "button secondary"}
                      aria-pressed={status.today === true}
                      onClick={() => onDose(status.medication.id, today, true)}
                    >
                      <Icon name="check" />
                      Taken
                    </button>
                    <button
                      type="button"
                      className={status.today === false ? "button warn" : "button secondary"}
                      aria-pressed={status.today === false}
                      onClick={() => onDose(status.medication.id, today, false)}
                    >
                      Missed
                    </button>
                  </div>
                ) : null}

                <MedHistory state={state} medicationId={status.medication.id} medication={status.medication} today={today} />

                <p className="tl-line" style={{ margin: 0 }}>
                  {`Last 30 days — `}
                  <b>{status.percent === null ? "—" : `${status.percent}%`}</b>
                  {` taken, ${status.recorded} of ${status.due} answered`}
                  {status.streak ? <>{", "}<b>{status.streak}</b>{" in a row"}</> : ""}
                  {status.unanswered ? `, ${status.unanswered} not logged` : ""}
                  {"."}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel wide-panel" style={{ marginTop: 28 }}>
          <Empty
            icon="medication"
            title="Nothing added yet"
            body="Add what you are on and how often. Each medication is only asked about on the days it is due."
            action={
              <button type="button" className="button primary" onClick={() => open({ kind: "medication" })}>
                <Icon name="plus" />
                Add a medication
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}

/**
 * Fourteen days of one medication, oldest first: taken, missed, unlogged, or
 * simply not due — enough to see a lapse without opening a report.
 */
function MedHistory({
  state,
  medicationId,
  medication,
  today,
}: {
  state: HealthState;
  medicationId: string;
  medication: Medication;
  today: string;
}) {
  const answers = new Map(
    state.medicationDoses
      .filter((dose) => dose.medicationId === medicationId)
      .map((dose) => [dose.date, dose.taken] as const),
  );
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    const dueDay = isDue(medication, date);
    const answer = answers.get(date);
    const kind = !dueDay ? "off" : answer === true ? "taken" : answer === false ? "missed" : "open";
    return { date, kind };
  });
  return (
    <ol className="tl-dots" aria-label={`${medication.name}, last 14 days`}>
      {days.map((day) => (
        <li
          key={day.date}
          className={`is-${day.kind}`}
          title={`${dateLabel(day.date, { weekday: "short", month: "short", day: "numeric" })}: ${
            day.kind === "off" ? "not due" : day.kind === "open" ? "not logged" : day.kind
          }`}
        />
      ))}
    </ol>
  );
}
