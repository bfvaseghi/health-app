"use client";

import { useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { BodyTab } from "./body-tab";
import { CoachTab } from "./coach-tab";
import { ProgressTab } from "./progress-tab";
import { RecordHeading } from "./primitives";
import { fitnessTabs, type FitnessTab, type Modal } from "./types";

/**
 * Two tabs, because there are two questions.
 *
 * Workout answers the one you came for: what am I doing today. Progress
 * answers the other one, occasionally: is this working. Muscle coverage used
 * to be a third tab of equal weight, which put the planner's own diagnostic
 * beside the thing you actually wanted; it now sits under progress, where you
 * go when you want to check the week adds up.
 */
export function FitnessView({
  state,
  tab, onTab, loadImage,
  editableState,
  today,
  open,
  onAddPhoto,
  onUpdatePhoto,
  onDeletePhoto,
  onDeleteDay,
  onGoals,
  onNotice,
}: {
  state: HealthState;
  tab: FitnessTab;
  onTab: (tab: FitnessTab) => void;
  loadImage?: (id: string) => Promise<Blob | null>;
  editableState: HealthState;
  today: string;
  open: (modal: Modal) => void;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => Promise<void>;
  onUpdatePhoto: (photo: ProgressPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteDay: (date: string) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const navigate = (next: FitnessTab) => {
    onTab(next);
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => document.getElementById(`fitness-tab-${next}`)?.focus({ preventScroll: true }));
  };

  return (
    <div className="page fitness-page">
      <RecordHeading title="Fitness" />
        <div className="record-tabs" role="tablist" aria-label="Workouts">
          {fitnessTabs.map((entry) => (
            <button
              key={entry.tab}
              type="button"
              role="tab"
              id={`fitness-tab-${entry.tab}`}
              aria-controls={`fitness-panel-${entry.tab}`}
              aria-selected={tab === entry.tab}
              tabIndex={tab === entry.tab ? 0 : -1}
              className={tab === entry.tab ? "active" : ""}
              onClick={() => navigate(entry.tab)}
              onKeyDown={event => {
                const index = fitnessTabs.findIndex(item => item.tab === entry.tab);
                const next = event.key === "ArrowRight" ? (index + 1) % fitnessTabs.length : event.key === "ArrowLeft" ? (index + fitnessTabs.length - 1) % fitnessTabs.length : event.key === "Home" ? 0 : event.key === "End" ? fitnessTabs.length - 1 : null;
                if (next === null) return;
                event.preventDefault();
                navigate(fitnessTabs[next].tab);
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      <div id="fitness-panel-workout" role="tabpanel" aria-labelledby="fitness-tab-workout" hidden={tab !== "workout"}>
      {tab === "workout" && (
        <CoachTab selected={selected} onSelect={setSelected} state={state} today={today} open={open} onGoals={onGoals} onNotice={onNotice} />
      )}
      </div>
      <div id="fitness-panel-progress" role="tabpanel" aria-labelledby="fitness-tab-progress" hidden={tab !== "progress"}>
      {tab === "progress" && (
        <>
          <ProgressTab state={state} today={today} />
          {/* The week's coverage, where you come to check whether it adds up
              rather than while you are reading today's lifts. */}
          <CoachTab selected={selected} onSelect={setSelected} state={state} today={today} open={open} onGoals={onGoals} onNotice={onNotice} mode="muscles" />
          <BodyTab
          state={state}
          editableState={editableState}
          today={today}
          open={open}
          onAddPhoto={onAddPhoto}
          onUpdatePhoto={onUpdatePhoto}
          onDeletePhoto={onDeletePhoto}
          onDeleteDay={onDeleteDay}
          onNotice={onNotice}
          onGoals={onGoals}
          loadImage={loadImage}
        />
        </>
      )}
      </div>
    </div>
  );
}
