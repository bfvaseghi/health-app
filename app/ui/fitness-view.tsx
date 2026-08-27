"use client";

import { useState } from "react";
import type { GoalSettings, HealthState, ProgressPhoto } from "../health-model";
import { BodyTab } from "./body-tab";
import { CoachTab } from "./coach-tab";
import { Icon } from "./icons";
import { LiftingTab } from "./lifting-tab";
import { ProgressTab } from "./progress-tab";
import { PageHeading, Segmented } from "./primitives";
import { fitnessTabs, type FitnessTab, type Modal } from "./types";

/**
 * Training and body composition are one subject, so they are one section with
 * four faces: what to lift next, whether the lifts are moving, what you have
 * lifted, and what the body is doing.
 */
export function FitnessView({
  state,
  editableState,
  today,
  open,
  demo,
  onAddPhoto,
  onDeletePhoto,
  onDeleteSession,
  onDeleteDay,
  onGoals,
  onNotice,
}: {
  state: HealthState;
  editableState: HealthState;
  today: string;
  open: (modal: Modal) => void;
  demo: boolean;
  onAddPhoto: (photo: ProgressPhoto, blob: Blob) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteSession: (startedAt: string) => void;
  onDeleteDay: (date: string) => void;
  onGoals: (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) => void;
  onNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState<FitnessTab>("coach");

  return (
    <div className="page">
      <PageHeading
        title="Fitness"
        action={
          <div className="heading-actions fitness-heading-actions">
            <Segmented
              label="Section"
              value={tab}
              options={fitnessTabs.map((entry) => ({ value: entry.tab, label: entry.label }))}
              onChange={(value) => setTab(value as FitnessTab)}
            />
            {!demo ? (
              <button type="button" className="button secondary" onClick={() => open({ kind: "import" })}>
                <Icon name="upload" />
                Import
              </button>
            ) : null}
          </div>
        }
      />

      {tab === "coach" && (
        <CoachTab state={state} today={today} open={open} demo={demo} onGoals={onGoals} onNotice={onNotice} />
      )}
      {tab === "progress" && <ProgressTab state={state} today={today} />}
      {tab === "lifting" && (
        <LiftingTab state={state} today={today} open={open} demo={demo} onDeleteSession={onDeleteSession} />
      )}
      {tab === "body" && (
        <BodyTab
          state={state}
          editableState={editableState}
          today={today}
          open={open}
          demo={demo}
          onAddPhoto={onAddPhoto}
          onDeletePhoto={onDeletePhoto}
          onDeleteDay={onDeleteDay}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}
