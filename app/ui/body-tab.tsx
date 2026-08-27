"use client";

import { useState } from "react";
import type { HealthState, ProgressPhoto } from "../health-model";
import { dateLabel } from "../health-model";
import { Icon } from "./icons";
import { MetricPanel } from "./metric-panel";
import { PhotoCompare } from "./photo-compare";
import { ConfirmButton, Empty, RecordPill } from "./primitives";
import { bodyMetrics, type Modal } from "./types";

const PAGE = 20;

/**
 * Weight, body fat, protein and steps — what the body is doing, day by day —
 * and the photographs those numbers get checked against.
 */
export function BodyTab({
  state,
  editableState,
  today,
  open,
  demo,
  onAddPhoto,
  onDeletePhoto,
  onDeleteDay,
  onNotice,
}: {
  state: HealthState;
  editableState: HealthState;
  today: string;
  open: (modal: Modal) => void;
  demo: boolean;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteDay: (date: string) => void;
  onNotice: (message: string) => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  const days = state.dailyEntries.slice(0, visible);

  return (
    <>
      <MetricPanel
        state={state}
        today={today}
        metrics={bodyMetrics}
        emptyHint="Nothing recorded in this period. A scale export or a MyFitnessPal export fills this in."
      />

      {!demo ? (
        <PhotoCompare
          state={state}
          today={today}
          onAddPhoto={onAddPhoto}
          onDeletePhoto={onDeletePhoto}
          onNotice={onNotice}
        />
      ) : null}

      <section className="panel wide-panel">
        <div className="panel-head">
          <div>
            <h2>Day records</h2>
          </div>
        </div>
        {days.length ? (
          <>
            <ul className="record-list">
              {days.map((entry) => (
                <li className="record-row daily-row" key={entry.date}>
                  <div className="date-tile">
                    <b>{dateLabel(entry.date, { weekday: "short" })}</b>
                    <small>{dateLabel(entry.date)}</small>
                  </div>
                  <RecordPill label="Weight" value={entry.weightLb === null ? "—" : `${entry.weightLb.toFixed(1)} lb`} />
                  <RecordPill label="Body fat" value={entry.bodyFatPercent === null ? "—" : `${entry.bodyFatPercent}%`} />
                  <RecordPill label="Protein" value={entry.proteinG === null ? "—" : `${Math.round(entry.proteinG)} g`} />
                  <RecordPill
                    label="Steps"
                    value={entry.steps === null ? "—" : Math.round(entry.steps).toLocaleString("en-US")}
                  />
                  {editableState.dailyEntries.some((item) => item.date === entry.date) ? (
                    <div className="row-actions">
                      <button
                        type="button"
                        className="row-action"
                        onClick={() => open({ kind: "checkin", date: entry.date })}
                        aria-label={`Edit manual values for ${dateLabel(entry.date)}`}
                      >
                        <Icon name="pencil" />
                        <span>Edit</span>
                      </button>
                      <ConfirmButton
                        label={`Delete the manual values for ${dateLabel(entry.date)}`}
                        onConfirm={() => onDeleteDay(entry.date)}
                      />
                    </div>
                  ) : (
                    <span className="readonly-label"><Icon name="lock" /> Automatic</span>
                  )}
                </li>
              ))}
            </ul>
            {state.dailyEntries.length > visible ? (
              <div className="list-more">
                <button type="button" className="button secondary" onClick={() => setVisible((count) => count + PAGE)}>
                  {`Show ${Math.min(PAGE, state.dailyEntries.length - visible)} more`}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <Empty
            icon="body"
            title="No days recorded"
            body="Import a scale or nutrition export, or add today by hand."
            action={
              <button type="button" className="button primary" onClick={() => open({ kind: "checkin", date: today })}>
                <Icon name="plus" />
                Add today
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
