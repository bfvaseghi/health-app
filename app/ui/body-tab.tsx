"use client";

import { useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { dateLabel, phaseProgress } from "../health-model";
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
  onGoals, loadImage,
  onAddPhoto,
  onUpdatePhoto,
  onDeletePhoto,
  onDeleteDay,
  onNotice,
}: {
  state: HealthState;
  editableState: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  loadImage?: (id: string) => Promise<Blob | null>;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => Promise<void>;
  onUpdatePhoto: (photo: ProgressPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteDay: (date: string) => void;
  onNotice: (message: string) => void;
}) {
  const [visible, setVisible] = useState(PAGE);
  const days = state.dailyEntries.slice(0, visible);
  const phase = phaseProgress(state, today);

  return (
    <>
      <PhotoCompare state={state} today={today} onAddPhoto={onAddPhoto} onUpdatePhoto={onUpdatePhoto} onDeletePhoto={onDeletePhoto} onNotice={onNotice} loadImage={loadImage} />
      <h2 className="body-goal-heading">Body goal</h2>
      <div className="body-goals" role="group" aria-label="Body goal">
        {([["maintain", "Maintain", "Hold weight"], ["lose", "Cut", "Lose weight"], ["gain", "Bulk", "Gain weight"]] as const).map(([value, label, detail]) => <button key={value} type="button" aria-pressed={state.goals.weightDirection === value} className={state.goals.weightDirection === value ? "active" : ""} onClick={() => onGoals(current => current.weightDirection === value ? current : ({ ...current, weightDirection: value, phaseStart: value === "maintain" ? "" : today, weightGoalLb: null, weeklyRateLb: null }))}><b>{label}</b><small>{detail}</small></button>)}
      </div>
      <details className="body-targets"><summary>Edit body targets</summary>
        <form key={`${state.goals.weightDirection}:${state.goals.phaseStart}`} onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const number = (name: string) => form.get(name) === "" ? null : Number(form.get(name));
          onGoals(current => ({ ...current, weightGoalLb: number("weight"), weeklyRateLb: number("rate"), proteinTargetG: number("protein"), phaseStart: String(form.get("start") ?? "") }));
          event.currentTarget.closest("details")?.removeAttribute("open");
          onNotice("Body targets saved.");
        }}>
          <label>Weight target (lb)<input name="weight" type="number" min="40" max="1000" step="0.1" defaultValue={state.goals.weightGoalLb ?? ""} /></label>
          <label>Protein (g/day)<input name="protein" type="number" min="0" max="1000" defaultValue={state.goals.proteinTargetG ?? ""} /></label>
          {state.goals.weightDirection !== "maintain" ? <><label>Weekly weight change (lb)<input name="rate" type="number" min="0.1" max="5" step="0.1" defaultValue={state.goals.weeklyRateLb ?? ""} /></label><label>Start date<input name="start" type="date" max={today} defaultValue={state.goals.phaseStart} /></label></> : <><input name="rate" type="hidden" value="" /><input name="start" type="hidden" value="" /></>}
          <button type="submit" className="button primary">Save targets</button>
        </form>
      </details>
      {phase ? <div className="phase-brief"><div><strong>{phase.changeLb !== null ? `${Math.abs(phase.changeLb).toFixed(1)} lb ${phase.changeLb < 0 ? "down" : phase.changeLb > 0 ? "up" : "change"}` : "Building your baseline"}</strong><span>over {phase.weeks} {phase.weeks === 1 ? "week" : "weeks"}</span></div><p>{phase.ratePerWeek !== null ? `Average ${Math.abs(phase.ratePerWeek).toFixed(2)} lb/week` : ""}{phase.targetRateLb !== null ? `${phase.ratePerWeek !== null ? " · " : ""}Target ${phase.targetRateLb} lb/week` : ""}</p></div> : null}
      <MetricPanel state={state} today={today} metrics={bodyMetrics} emptyHint="No records in this period." />

      <details className="tl-section"><summary>Day records · {state.dailyEntries.length}</summary>
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
                      <small>{facts.length ? facts.join(" · ") : "not recorded"}</small>
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
          <p className="tl-line">No daily records.</p>
        )}
      </section>
      </details>
    </>
  );
}
