"use client";

import { useMemo } from "react";
import type { HealthState } from "../health-model";
import { dateLabel, medicationStatuses } from "../health-model";
import { Icon } from "./icons";
import { ConfirmButton, Empty, PageHeading } from "./primitives";
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

  return (
    <div className="page">
      <PageHeading
        eyebrow="What you are on"
        title="Meds"
        body={due.length ? `${answered} of ${due.length} answered today.` : "Nothing due today."}
        action={
          <button type="button" className="button primary" onClick={() => open({ kind: "medication" })}>
            <Icon name="plus" />
            Add a medication
          </button>
        }
      />

      {statuses.length ? (
        <ul className="med-list">
          {statuses.map((status) => (
            <li key={status.medication.id} className="panel med-panel">
              <div className="med-head">
                <div className="med-title">
                  <b>{status.medication.name}</b>
                  <small>
                    {status.medication.schedule === "daily"
                      ? "Every day"
                      : `Every ${WEEKDAYS[status.medication.dueDay ?? 1]}`}
                  </small>
                </div>
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
                <div className="med-answer" role="group" aria-label={`${status.medication.name} today`}>
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
              ) : (
                <p className="med-next">
                  {status.nextDue ? `Not due today — next on ${dateLabel(status.nextDue, { weekday: "long" })}.` : "Not due today."}
                </p>
              )}

              <div className="med-stats">
                <span>
                  <b>{`${status.recorded} / ${status.due}`}</b>
                  <small>due doses answered</small>
                </span>
                <span>
                  <b>{status.percent === null ? "—" : `${status.percent}%`}</b>
                  <small>taken of answered</small>
                </span>
                <span>
                  <b>{status.unanswered}</b>
                  <small>not logged</small>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="panel wide-panel">
          <Empty
            icon="medication"
            title="Nothing added yet"
            body="Add what you are on and how often it is due. A weekly injection is not missed on the six days it is not due, so it is only ever asked about on the day it is."
          />
        </section>
      )}
    </div>
  );
}
