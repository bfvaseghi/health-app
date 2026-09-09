"use client";

import { useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { BodyTab } from "./body-tab";
import { CoachTab } from "./coach-tab";
import { ProgressTab } from "./progress-tab";
import { RecordHeading } from "./primitives";
import { fitnessTabs, type FitnessTab, type Modal } from "./types";

/**
 * Training and body composition are one subject, so they are one section with
 * four views: the next workout, weekly muscle coverage, strength trends, and
 * body composition. Strong remains the workout log.
 */
export function FitnessView({
  state,
  tab, onTab, loadImage, startAtWorkout = false,
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
  startAtWorkout?: boolean;
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
  const [stage, setStage] = useState<"week" | "workout">(startAtWorkout ? "workout" : "week");
  const [selected, setSelected] = useState<string | null>(null);
  const changeStage = (step: "week" | "workout") => {
    setStage(step);
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.fitness-flow [aria-current="step"]')?.focus({ preventScroll: true }));
  };
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
      <div id="fitness-panel-coach" role="tabpanel" aria-labelledby="fitness-tab-coach" hidden={tab !== "coach"}>
      {tab === "coach" && (
        <CoachTab stage={stage} onStage={changeStage} selected={selected} onSelect={setSelected} state={state} today={today} open={open} onGoals={onGoals} onNotice={onNotice} onMuscles={() => navigate("muscles")} />
      )}
      </div>
      <div id="fitness-panel-progress" role="tabpanel" aria-labelledby="fitness-tab-progress" hidden={tab !== "progress"}>
      {tab === "progress" && <ProgressTab state={state} today={today} />}
      </div>
      <div id="fitness-panel-muscles" role="tabpanel" aria-labelledby="fitness-tab-muscles" hidden={tab !== "muscles"}>
      {tab === "muscles" && (
        <CoachTab stage={stage} onStage={changeStage} selected={selected} onSelect={setSelected} state={state} today={today} open={open} onGoals={onGoals} onNotice={onNotice} mode="muscles" onMuscles={() => navigate("muscles")} onWorkout={() => navigate("coach")} />
      )}
      </div>
      <div id="fitness-panel-body" role="tabpanel" aria-labelledby="fitness-tab-body" hidden={tab !== "body"}>
      {tab === "body" && (
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
      )}
      </div>
    </div>
  );
}
