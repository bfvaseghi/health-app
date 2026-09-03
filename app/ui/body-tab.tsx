"use client";

import { useState } from "react";
import type { HealthState, ProgressPhoto } from "../health-model";
import { dateLabel } from "../health-model";
import { Icon } from "./icons";
import { MetricPanel } from "./metric-panel";
import { PhotoCompare } from "./photo-compare";
import { ConfirmButton } from "./primitives";
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

      <section className="tl-section" aria-labelledby="days-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="days-title" style={{ margin: 0 }}>
            {state.dailyEntries.length ? `Day records · ${state.dailyEntries.length.toLocaleString("en-US")}` : "Day records"}
          </h2>
          <button type="button" className="text-button" onClick={() => open({ kind: "checkin", date: today })}>
            <Icon name="plus" /> Add today
          </button>
        </div>
        {days.length ? (
          <>
            <ul className="tl-rows tl-list">
              {days.map((entry) => {
                const facts = [
                  entry.weightLb === null ? null : `${entry.weightLb.toFixed(1)} lb`,
                  entry.bodyFatPercent === null ? null : `${entry.bodyFatPercent}% body fat`,
                  entry.proteinG === null ? null : `${Math.round(entry.proteinG)} g protein`,
                  entry.steps === null ? null : `${Math.round(entry.steps).toLocaleString("en-US")} steps`,
                ].filter((fact): fact is string => fact !== null);
                const editable = editableState.dailyEntries.some((item) => item.date === entry.date);
                return (
                  <li className="tl-row is-static" key={entry.date}>
                    <span className="tl-row-copy">
                      <b>{dateLabel(entry.date, { weekday: "short", month: "short", day: "numeric" })}</b>
                      <small>{facts.length ? facts.join(" · ") : "nothing recorded"}</small>
                    </span>
                    {editable ? (
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => open({ kind: "checkin", date: entry.date })}
                          aria-label={`Edit manual values for ${dateLabel(entry.date)}`}
                        >
                          <Icon name="pencil" />
                        </button>
                        <ConfirmButton
                          label={`Delete the manual values for ${dateLabel(entry.date)}`}
                          onConfirm={() => onDeleteDay(entry.date)}
                        />
                      </div>
                    ) : (
                      <span className="tl-lock"><Icon name="lock" /><span className="visually-hidden">Recorded automatically</span></span>
                    )}
                  </li>
                );
              })}
            </ul>
            {state.dailyEntries.length > visible ? (
              <p className="tl-line">
                <button type="button" className="text-button" onClick={() => setVisible((count) => count + PAGE)}>
                  {`Show ${Math.min(PAGE, state.dailyEntries.length - visible)} more`}
                </button>
              </p>
            ) : null}
          </>
        ) : (
          <p className="tl-line">No days recorded. Import a scale or nutrition export, or add today by hand.</p>
        )}
      </section>
    </>
  );
}
