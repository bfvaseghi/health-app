"use client";

import { ChangeEvent, useState } from "react";
import {
  GoalSettings,
  HealthState,
  WeightDirection,
  dailyEntriesCsv,
  labResultsCsv,
  medicationDosesCsv,
  normalizeHealthState,
  sleepEntriesCsv,
} from "../health-model";
import { Icon } from "./icons";
import { ConfirmButton, Note, NumberSetting, PageHeading, SelectSetting, Segmented } from "./primitives";
import { downloadCsv, downloadJson, formatBytes, formatTimestamp } from "./format";
import { Modal, Theme } from "./types";

type Snapshot = { id: number; createdAt: string; bytes: number };
type SnapshotState = { status: "idle" | "loading" | "ready" | "error"; items: Snapshot[]; message: string };

export function DataView({
  state,
  today,
  theme,
  onTheme,
  onGoals,
  open,
  onRestoreFile,
  onRestoreState,
  onErase,
  onNotice,
}: {
  state: HealthState;
  today: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onGoals: (goals: GoalSettings) => void;
  open: (modal: Modal) => void;
  onRestoreFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRestoreState: (state: HealthState, label: string) => void;
  onErase: () => void;
  onNotice: (message: string) => void;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotState>({ status: "idle", items: [], message: "" });

  async function loadSnapshots() {
    setSnapshots({ status: "loading", items: [], message: "" });
    try {
      const response = await fetch("/api/health-state/history", { cache: "no-store" });
      const data = (await response.json()) as { snapshots?: Snapshot[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Snapshots are unavailable.");
      setSnapshots({ status: "ready", items: data.snapshots ?? [], message: "" });
    } catch (error) {
      setSnapshots({
        status: "error",
        items: [],
        message: error instanceof Error ? error.message : "Snapshots are unavailable.",
      });
    }
  }

  async function restoreSnapshot(snapshot: Snapshot) {
    try {
      const response = await fetch(`/api/health-state/history?id=${snapshot.id}`, { cache: "no-store" });
      const data = (await response.json()) as { state?: unknown; error?: string };
      if (!response.ok || !data.state) throw new Error(data.error ?? "That snapshot could not be read.");
      onRestoreState(normalizeHealthState(data.state), `Restored the snapshot from ${formatTimestamp(snapshot.createdAt)}.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "That snapshot could not be read.");
    }
  }

  return (
    <div className="page">
      <PageHeading
        title="Data & goals"
      />

      <section className="panel wide-panel import-panel">
        <div className="connection-icon">
          <Icon name="upload" />
        </div>
        <div>
          <p className="kicker">Oura · Whoop · Apple Health</p>
          <h2>Import</h2>
          <p>
            Drop the export your app already makes — a Whoop or Apple zip, an Oura CSV, or any table with a date
            column. Columns are matched for you, and you see what will land before anything is saved.
          </p>
          <div className="connection-actions">
            <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
              <Icon name="upload" />
              Import health data
            </button>
          </div>
        </div>
      </section>

      {/* Keyed so a restored backup or a sync from another device replaces the draft outright. */}
      <GoalsPanel key={JSON.stringify(state.goals)} goals={state.goals} onGoals={onGoals} />

      <section className="panel wide-panel">
        <div className="panel-head wrap">
          <div>
            <p className="kicker">Appearance</p>
            <h2>Theme</h2>
          </div>
          <Segmented
            label="Theme"
            value={theme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(value) => onTheme(value as Theme)}
          />
        </div>
        <button type="button" className="text-button" onClick={() => open({ kind: "shortcuts" })}>
          <Icon name="keyboard" />
          Keyboard shortcuts
        </button>
      </section>

      <section className="panel wide-panel">
        <div className="panel-head">
          <div>
            <p className="kicker">Your copy</p>
            <h2>Export and restore</h2>
          </div>
        </div>
        <div className="data-actions">
          <button
            type="button"
            className="data-action"
            onClick={() => downloadJson(`baseline-backup-${today}.json`, state)}
          >
            <span>
              <Icon name="download" />
            </span>
            <b>Full backup (JSON)</b>
            <small>Every record and goal, in the format this app restores from.</small>
          </button>
          <button
            type="button"
            className="data-action"
            onClick={() => {
              downloadCsv(`baseline-daily-${today}.csv`, dailyEntriesCsv(state.dailyEntries));
              downloadCsv(`baseline-sleep-${today}.csv`, sleepEntriesCsv(state.sleepEntries));
              downloadCsv(`baseline-labs-${today}.csv`, labResultsCsv(state.labResults));
              const meds = state.medicationDoses.length;
              if (meds) downloadCsv(`baseline-meds-${today}.csv`, medicationDosesCsv(state));
              onNotice(
                meds
                  ? "Four CSV files downloaded: days, nights, labs, and meds."
                  : "Three CSV files downloaded: days, nights, and labs.",
              );
            }}
          >
            <span>
              <Icon name="table" />
            </span>
            <b>Spreadsheet export (CSV)</b>
            <small>Days, nights, labs and meds as separate files for a spreadsheet.</small>
          </button>
          <label className="data-action">
            <span>
              <Icon name="upload" />
            </span>
            <b>Restore a backup</b>
            <small>Replace this dashboard with a prior JSON export.</small>
            <input type="file" accept="application/json,.json" onChange={onRestoreFile} />
          </label>
        </div>
        <Note icon="lock">
          Records are stored in your private Site database and in this browser as a fallback. Imported files never
          leave this device.
        </Note>
      </section>

      <section className="panel wide-panel">
        <div className="panel-head wrap">
          <div>
            <p className="kicker">Server history</p>
            <h2>Recover an earlier save</h2>
          </div>
          <button type="button" className="button secondary small" onClick={loadSnapshots}>
            <Icon name="history" />
            {snapshots.status === "loading" ? "Looking…" : "Find snapshots"}
          </button>
        </div>
        <p className="panel-body">
          Each save keeps the version it replaced, up to the last 30. Restoring is itself a save, so the current
          version is kept too.
        </p>
        {snapshots.status === "error" ? <p className="panel-body error">{snapshots.message}</p> : null}
        {snapshots.status === "ready" ? (
          snapshots.items.length ? (
            <ul className="record-list">
              {snapshots.items.map((snapshot) => (
                <li className="record-row snapshot-row" key={snapshot.id}>
                  <div>
                    <small>Saved</small>
                    <b>{formatTimestamp(snapshot.createdAt)}</b>
                  </div>
                  <div>
                    <small>Size</small>
                    <b>{formatBytes(snapshot.bytes)}</b>
                  </div>
                  <div className="row-actions">
                    <ConfirmButton
                      label="Restore this version"
                      confirmLabel="Replace current data"
                      className="row-action"
                      icon="undo"
                      onConfirm={() => restoreSnapshot(snapshot)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-body">No earlier versions are stored yet.</p>
          )
        ) : null}
      </section>

      <section className="panel wide-panel danger-panel">
        <div className="panel-head wrap">
          <div>
            <p className="kicker">Start over</p>
            <h2>Erase every record</h2>
          </div>
          <ConfirmButton label="Erase all data" confirmLabel="Erase everything" className="button danger" onConfirm={onErase} />
        </div>
        <p className="panel-body">
          Clears every night, day, and lab result from this dashboard and your private database. Goals are kept. Undo
          is offered for a few seconds and a server snapshot is kept, but export a backup first.
        </p>
      </section>
    </div>
  );
}

/** Owns the unsaved goal draft. Remounting on a change from elsewhere is the reset. */
function GoalsPanel({ goals, onGoals }: { goals: GoalSettings; onGoals: (goals: GoalSettings) => void }) {
  const [draft, setDraft] = useState(goals);
  const dirty = (Object.keys(draft) as Array<keyof GoalSettings>).some((key) => draft[key] !== goals[key]);
  const set = (key: keyof GoalSettings, value: number | string | boolean | null) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel wide-panel">
      <div className="panel-head wrap">
        <div>
          <h2>Goals</h2>
        </div>
        <div className="heading-actions">
          {dirty ? (
            <>
              <button type="button" className="button secondary small" onClick={() => setDraft(goals)}>
                Discard changes
              </button>
              <button type="button" className="button primary small" onClick={() => onGoals(draft)}>
                Save goals
              </button>
            </>
          ) : (
            <span className="saved-flag">
              <Icon name="check" />
              All goals saved
            </span>
          )}
        </div>
      </div>
      <div className="settings-grid">
        <NumberSetting
          label="Sleep"
          detail="hours per night"
          value={draft.sleepHours}
          min={4}
          max={14}
          step={0.25}
          onChange={(value) => set("sleepHours", value)}
        />
        <NumberSetting
          label="Bedtime consistency"
          detail="minutes of range"
          value={draft.sleepConsistencyMinutes}
          min={15}
          max={360}
          step={15}
          onChange={(value) => set("sleepConsistencyMinutes", value)}
        />
        <SelectSetting
          label="Daily medication"
          detail="show it on the home screen"
          value={draft.trackMedication ? "yes" : "no"}
          options={[
            { value: "yes", label: "Track it" },
            { value: "no", label: "Hide it" },
          ]}
          onChange={(value) => set("trackMedication", value === "yes")}
        />
        <NumberSetting
          label="Weight goal"
          detail="pounds"
          value={draft.weightGoalLb ?? ""}
          min={40}
          max={1_000}
          step={0.5}
          optional
          onChange={(value) => set("weightGoalLb", value === "" ? null : value)}
        />
        <SelectSetting
          label="Weight direction"
          detail="how the goal is read"
          value={draft.weightDirection}
          options={[
            { value: "maintain", label: "Maintain" },
            { value: "lose", label: "Lose" },
            { value: "gain", label: "Gain" },
          ]}
          onChange={(value) => set("weightDirection", value as WeightDirection)}
        />
        <NumberSetting
          label="Protein"
          detail="grams a day"
          value={draft.proteinTargetG ?? ""}
          min={30}
          max={400}
          step={5}
          optional
          onChange={(value) => set("proteinTargetG", value === "" ? null : value)}
        />
        <NumberSetting
          label="Body fat"
          detail="percent"
          value={draft.bodyFatTargetPercent ?? ""}
          min={3}
          max={60}
          step={0.5}
          optional
          onChange={(value) => set("bodyFatTargetPercent", value === "" ? null : value)}
        />
      </div>
    </section>
  );
}
