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
  const [pending, setPending] = useState<"maintain" | "lose" | "gain" | null>(null);
  const days = state.dailyEntries.slice(0, visible);
  const phase = phaseProgress(state, today);
  const directions = [["maintain", "Maintain", "Hold weight"], ["lose", "Cut", "Lose weight"], ["gain", "Bulk", "Gain weight"]] as const;

  return (
    <>
      <PhotoCompare state={state} today={today} onAddPhoto={onAddPhoto} onUpdatePhoto={onUpdatePhoto} onDeletePhoto={onDeletePhoto} onNotice={onNotice} loadImage={loadImage} />
      <h2 className="body-goal-heading">Body goal</h2>
      <div className="body-goals" role="group" aria-label="Body goal">
        {directions.map(([value, label, detail]) => <button key={value} type="button" aria-pressed={state.goals.weightDirection === value} className={state.goals.weightDirection === value ? "active" : ""} onClick={() => setPending(current => current === value ? null : state.goals.weightDirection === value ? null : value)}><b>{label}</b><small>{detail}</small></button>)}
      </div>
      {/* Switching phase clears the weight target, the weekly rate and the
          phase clock. That used to happen on one tap with nothing on screen
          predicting it and nothing reporting it afterwards. */}
      {pending ? <div className="phase-confirm">
        <p>Change to {directions.find(([value]) => value === pending)?.[1]}? This clears your weight target and rate, and restarts the phase from today.</p>
        <button type="button" className="button primary small" onClick={() => {
          onGoals(current => ({ ...current, weightDirection: pending, phaseStart: pending === "maintain" ? "" : today, weightGoalLb: null, weeklyRateLb: null }));
          setPending(null);
          onNotice("Body goal changed.");
        }}>Change</button>
        <button type="button" className="text-button" onClick={() => setPending(null)}>Keep</button>
      </div> : null}
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
      {/* The total and the rate are computed differently — the first is
          end-to-end, the second a fitted trend — so dividing one by the other
          does not reconcile. Both now say which they are. */}
      {phase ? <div className="phase-brief"><div><strong>{phase.changeLb !== null ? `${Math.abs(phase.changeLb).toFixed(1)} lb ${phase.changeLb < 0 ? "down" : phase.changeLb > 0 ? "up" : "change"}` : "Building your baseline"}</strong><span>first to latest reading, over {phase.weeks} {phase.weeks === 1 ? "week" : "weeks"}</span></div><p>{phase.ratePerWeek !== null ? `Trend ${Math.abs(phase.ratePerWeek).toFixed(2)} lb/week` : ""}{phase.targetRateLb !== null ? `${phase.ratePerWeek !== null ? " · " : ""}Target ${phase.targetRateLb} lb/week` : ""}</p></div> : null}
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
