"use client";

import { useEffect, useRef, useState } from "react";
import { RecordHeading } from "./primitives";
import {
  GoalSettings,
  HealthState,
  ImportRecords,
  WeightDirection,
  normalizeHealthState,
  todayLocal,
} from "../health-model";
import {
  ParsedBackup,
  SOURCE_ARCHIVE,
  createBaselineArchive,
  parseBackupFile,
  restoreArchivePhotos,
} from "../portability";
import { mergeRestoredAppleHealthSyncPayload } from "../apple-health-sync";
import { Icon } from "./icons";
import { ConfirmButton, DateSetting, Note, NumberSetting, SelectSetting } from "./primitives";
import { downloadBlob, formatBytes, formatTimestamp } from "./format";
import { Modal, Theme } from "./types";

type Snapshot = { id: number; createdAt: string; bytes: number };
type SnapshotState = { status: "idle" | "loading" | "ready" | "error"; items: Snapshot[]; message: string };

export function DataView({
  state,
  appleOverlay,
  today,
  theme,
  onTheme,
  onGoals,
  open,
  onRestoreState,
  onErase,
  onAppleChanged,
  onNotice,
  demo = false,
  loadImage, restoreImages,
}: {
  state: HealthState;
  appleOverlay: Partial<ImportRecords> | null;
  today: string;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onGoals: (goals: GoalSettings) => void;
  open: (modal: Modal) => void;
  onRestoreState: (state: HealthState, label: string) => void;
  onErase: () => void | Promise<void>;
  onAppleChanged: (overlay: Partial<ImportRecords> | null) => void;
  onNotice: (message: string) => void;
  demo?: boolean;
  loadImage?: (id: string) => Promise<Blob | null>;
  restoreImages?: (photos: Array<{ id: string; blob: Blob }>) => Promise<void>;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotState>({ status: "idle", items: [], message: "" });
  const [exporting, setExporting] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null);
  const restorePreviewRef = useRef<HTMLElement>(null);

  async function exportEverything() {
    setExporting(true);
    try {
      const archive = await createBaselineArchive(state, appleOverlay, undefined, demo ? loadImage ?? (async () => null) : loadImage);
      downloadBlob(`baseline-everything-${today}.zip`, archive);
      onNotice("Archive downloaded.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Archive failed.");
    } finally {
      setExporting(false);
    }
  }

  async function chooseRestore(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = await parseBackupFile(file);
      setPendingRestore(parsed);
      window.setTimeout(() => restorePreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unreadable backup.");
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setRestoreBusy(true);
    let appleRestored = false;
    try {
      const archivedApple = pendingRestore.appleOverlay;
      if (archivedApple && (archivedApple.dailyEntries.length || archivedApple.sleepEntries.length)) {
        if (demo) {
          onAppleChanged(mergeRestoredAppleHealthSyncPayload(archivedApple, appleOverlay));
        } else {
          const response = await fetch("/api/apple-health-sync/setup", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(archivedApple),
            signal: AbortSignal.timeout(12_000),
          });
          const data = await response.json() as { appleOverlay?: Partial<ImportRecords>; error?: string };
          if (!response.ok || !data.appleOverlay) throw new Error(data.error ?? "Apple Health restore failed.");
          onAppleChanged(data.appleOverlay);
          appleRestored = true;
        }
      }
      const images = await restoreArchivePhotos(pendingRestore, demo ? restoreImages ?? (async () => {}) : restoreImages);
      onRestoreState(
        pendingRestore.state,
        images ? `Backup restored · ${images} ${images === 1 ? "photo" : "photos"}` : "Backup restored.",
      );
      setPendingRestore(null);
    } catch (error) {
      onNotice(`${appleRestored ? "Apple Health restored. " : ""}${error instanceof Error ? error.message : "Restore failed."}`);
    } finally {
      setRestoreBusy(false);
    }
  }

  async function loadSnapshots() {
    setSnapshots({ status: "loading", items: [], message: "" });
    try {
      const response = await fetch("/api/health-state/history", { cache: "no-store" });
      const data = (await response.json()) as { snapshots?: Snapshot[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Snapshots unavailable.");
      setSnapshots({ status: "ready", items: data.snapshots ?? [], message: "" });
    } catch (error) {
      setSnapshots({
        status: "error",
        items: [],
        message: error instanceof Error ? error.message : "Snapshots unavailable.",
      });
    }
  }

  async function restoreSnapshot(snapshot: Snapshot) {
    try {
      const response = await fetch(`/api/health-state/history?id=${snapshot.id}`, { cache: "no-store" });
      const data = (await response.json()) as { state?: unknown; error?: string };
      if (!response.ok || !data.state) throw new Error(data.error ?? "Unreadable snapshot.");
      onRestoreState(normalizeHealthState(data.state), `Restored: ${formatTimestamp(snapshot.createdAt)}`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Unreadable snapshot.");
    }
  }


  return (
    <div className="page tl-page">
      <RecordHeading title="Data & goals" detail="Your imports, settings & backups" />

      <section className="tl-section record-sheet" aria-labelledby="portability-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="portability-title" style={{ margin: 0 }}>Export & restore</h2>

        </div>
        <p className="tl-line" style={{ marginTop: 8 }}>
          JSON · CSV · photos · Apple Health · source code
        </p>
        <div className="tl-actions">
          <button type="button" className="button primary export-everything" disabled={exporting} onClick={exportEverything}>
            <Icon name="download" />
            {exporting ? "Building archive…" : "Download archive"}
          </button>
          <label className="button secondary restore-button">
            <Icon name="upload" />
            Restore from archive
            <input
              type="file"
              className="visually-hidden"
              accept="application/zip,.zip,application/json,.json"
              aria-label="Restore from a Baseline ZIP or legacy JSON archive"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void chooseRestore(file);
              }}
            />
          </label>
        </div>
        <div className="tl-actions">
          <a className="text-button" href={SOURCE_ARCHIVE}>Download code</a>
        </div>

        {pendingRestore ? (
          <section className="restore-preview" ref={restorePreviewRef} aria-live="polite">
            <div>
              <p className="kicker">Replaces current data</p>
              <h3>Backup contents</h3>
              <p>
                {pendingRestore.summary.firstDate && pendingRestore.summary.lastDate
                  ? `${pendingRestore.summary.firstDate} to ${pendingRestore.summary.lastDate}`
                  : "No dated records"}
              </p>
            </div>
            <dl>
              <div><dt>Days</dt><dd>{pendingRestore.summary.days}</dd></div>
              <div><dt>Nights</dt><dd>{pendingRestore.summary.nights}</dd></div>
              <div><dt>Workouts</dt><dd>{pendingRestore.summary.workouts}</dd></div>
              <div><dt>Labs</dt><dd>{pendingRestore.summary.labs}</dd></div>
              <div><dt>Thoughts</dt><dd>{pendingRestore.summary.thoughts}</dd></div>
              {pendingRestore.appleOverlay ? <div><dt>Apple Health</dt><dd>{pendingRestore.appleOverlay.dailyEntries.length} {pendingRestore.appleOverlay.dailyEntries.length === 1 ? "day" : "days"} · {pendingRestore.appleOverlay.sleepEntries.length} {pendingRestore.appleOverlay.sleepEntries.length === 1 ? "night" : "nights"}</dd></div> : null}
              <div><dt>Photos</dt><dd>{pendingRestore.photoEntries.length} available</dd></div>
            </dl>
            <div className="heading-actions">
              <button type="button" className="button secondary" disabled={restoreBusy} onClick={() => setPendingRestore(null)}>
                Cancel
              </button>
              <button type="button" className="button danger" disabled={restoreBusy} onClick={() => void confirmRestore()}>
                {restoreBusy ? "Restoring…" : "Replace current data"}
              </button>
            </div>
          </section>
        ) : null}

      </section>

      <section className="tl-section record-sheet" aria-labelledby="import-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="import-title" style={{ margin: 0 }}>Import</h2>
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          ZIP · CSV · JSON · XML
        </p>
        <div className="tl-actions">
          <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
            <Icon name="upload" />
            Import health data
          </button>
        </div>
      </section>

      <AppleHealthSyncPanel onNotice={onNotice} onChanged={onAppleChanged} demo={demo} />
      {demo ? <Note icon="lock">Snapshots unavailable in demo.</Note> : null}

      {/* Keyed so a restored backup or a sync from another device replaces the draft outright. */}
      <GoalsPanel key={JSON.stringify(state.goals)} goals={state.goals} onGoals={onGoals} />

      <section className="tl-section record-sheet" aria-labelledby="theme-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="theme-title" style={{ margin: 0 }}>Appearance</h2>
          <div className="tl-tabs" role="group" aria-label="Theme">
            {(["system", "light", "dark"] as Theme[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={theme === option}
                className={theme === option ? "active" : ""}
                onClick={() => onTheme(option)}
              >
                {option === "system" ? "System" : option === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
        <p className="tl-line">
          <button type="button" className="text-button" onClick={() => open({ kind: "shortcuts" })}>
            <Icon name="keyboard" />
            Keyboard shortcuts
          </button>
        </p>
      </section>

      {!demo ? <section className="tl-section record-sheet" aria-labelledby="snapshots-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="snapshots-title" style={{ margin: 0 }}>Earlier versions</h2>
          <button type="button" className="text-button" onClick={loadSnapshots}>
            <Icon name="history" />
            {snapshots.status === "loading" ? "Looking…" : "Find snapshots"}
          </button>
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          Last 30 saves
        </p>
        {snapshots.status === "error" ? <p className="tl-line" role="alert">{snapshots.message}</p> : null}
        {snapshots.status === "ready" ? (
          snapshots.items.length ? (
            <ul className="tl-rows tl-list">
              {snapshots.items.map((snapshot) => (
                <li className="tl-row is-static" key={snapshot.id}>
                  <span className="tl-row-copy">
                    <b className="tl-plain">{formatTimestamp(snapshot.createdAt)}</b>
                    <small>{formatBytes(snapshot.bytes)}</small>
                  </span>
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
            <p className="tl-line">No earlier versions.</p>
          )
        ) : null}
      </section> : null}

      {!demo ? <section className="tl-section record-sheet" aria-labelledby="erase-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="erase-title" style={{ margin: 0 }}>Erase data</h2>
          <ConfirmButton label="Erase all data" confirmLabel="Erase everything" className="button danger" onConfirm={onErase} />
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          Permanently deletes records, photos, snapshots, and connections.
        </p>
      </section> : null}
    </div>
  );
}

type AppleSyncStatus = {
  loading: boolean;
  configured: boolean;
  lastSyncedAt: string | null;
};

function AppleHealthSyncPanel({
  onNotice,
  onChanged,
  demo = false,
}: {
  onNotice: (message: string) => void;
  onChanged: (overlay: Partial<ImportRecords> | null) => void;
  demo?: boolean;
}) {
  const [status, setStatus] = useState<AppleSyncStatus>({ loading: !demo, configured: false, lastSyncedAt: null });
  const [token, setToken] = useState("");
  const [endpoint, setEndpoint] = useState(() =>
    typeof window === "undefined"
      ? "/api/apple-health-sync"
      : new URL("/api/apple-health-sync", window.location.origin).toString(),
  );
  const notesEndpoint = typeof window === "undefined"
    ? "/api/thought-journal"
    : new URL("/api/thought-journal", window.location.origin).toString();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    let active = true;
    void fetch("/api/apple-health-sync/setup", { cache: "no-store", signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        const data = (await response.json()) as {
          configured?: boolean;
          lastSyncedAt?: string | null;
          appleOverlay?: Partial<ImportRecords> | null;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Apple Health sync unavailable.");
        if (active) {
          setStatus({
            loading: false,
            configured: data.configured === true,
            lastSyncedAt: data.lastSyncedAt ?? null,
          });
          onChanged(data.appleOverlay ?? null);
        }
      })
      .catch((error) => {
        if (!active) return;
        setStatus((current) => ({ ...current, loading: false }));
        onNotice(error instanceof Error ? error.message : "Apple Health sync unavailable.");
      });
    return () => {
      active = false;
    };
  }, [demo, onNotice, onChanged]);

  async function createToken() {
    setBusy(true);
    try {
      const response = await fetch("/api/apple-health-sync/setup", { method: "POST", signal: AbortSignal.timeout(10_000) });
      const data = (await response.json()) as { token?: string; endpoint?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error ?? "Connection key failed.");
      setToken(data.token);
      if (data.endpoint) setEndpoint(new URL(data.endpoint, window.location.origin).toString());
      setStatus((current) => ({ ...current, loading: false, configured: true }));
      onNotice("Connection created.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Connection key failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken() {
    setBusy(true);
    try {
      const response = await fetch("/api/apple-health-sync/setup", { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Disconnect failed.");
      setToken("");
      setStatus({ loading: false, configured: false, lastSyncedAt: null });
      onChanged(null);
      onNotice("Connection off.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Disconnect failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(`${label} copied.`);
    } catch {
      onNotice(`Copy failed. Select ${label.toLowerCase()} manually.`);
    }
  }

  const bearer = token ? `Bearer ${token}` : "";
  const summary = demo
    ? "Demo"
    : status.loading
    ? "Checking connection…"
    : status.configured
      ? status.lastSyncedAt
        ? `Last received ${formatTimestamp(status.lastSyncedAt)}`
        : "No sync received"
      : "Off";

  return (
    <section className="tl-section record-sheet" aria-labelledby="apple-title">
      <div className="tl-section-head">
        <h2 className="tl-caps" id="apple-title" style={{ margin: 0 }}>iPhone connection</h2>
        <span className="tl-meta">{summary}</span>
      </div>
      <p className="tl-line" style={{ marginTop: 8 }}>
        Apple Health · Apple Notes
      </p>
      <div className="tl-actions">
        {demo ? (
          <button type="button" className="button secondary" disabled>Real record only</button>
        ) : !status.configured ? (
          <button type="button" className="button primary" disabled={status.loading || busy} onClick={createToken}>
            {busy ? "Creating…" : "Create connection"}
          </button>
        ) : (
          <>
            <ConfirmButton
              label="Replace shared key"
              confirmLabel="Replace key for both"
              className="button secondary"
              icon="key"
              disabled={busy}
              onConfirm={createToken}
            />
            <ConfirmButton
              label="Turn off"
              confirmLabel="Turn off both feeds"
              className="button secondary"
              disabled={busy}
              onConfirm={revokeToken}
            />
          </>
        )}
      </div>

      {token ? (
        <div className="sync-credentials" aria-label="iPhone connection details">
          <div>
            <small>Health URL</small>
            <code>{endpoint}</code>
            <button type="button" className="text-button" onClick={() => copy(endpoint, "Health URL")}>Copy</button>
          </div>
          <div>
            <small>Notes URL</small>
            <code>{notesEndpoint}</code>
            <button type="button" className="text-button" onClick={() => copy(notesEndpoint, "Notes URL")}>Copy</button>
          </div>
          <div>
            <small>Header</small>
            <code>Authorization</code>
          </div>
          <div>
            <small>Value</small>
            <code>{bearer}</code>
            <button type="button" className="text-button" onClick={() => copy(bearer, "Key")}>Copy</button>
          </div>
        </div>
      ) : status.configured ? (
        <p className="tl-line">New key required to reconnect.</p>
      ) : null}
      <details className="setup-details">
        <summary>Connection setup</summary>
      <div className="iphone-connection-guides">
          <div>
            <h3>Health Auto Export</h3>
            <ol className="sync-steps">
              <li>New Automation → REST API → Health URL</li>
              <li>JSON · daily totals · last 4 days · every 2 days</li>
              <li>Steps · sleep · weight · body fat · resting HR · HRV</li>
            </ol>
          </div>
          <div>
            <h3>Apple Notes → Thought Journal</h3>
            <ol className="sync-steps">
              <li>Share Sheet Shortcut: Send to Mind</li>
              <li>Get Text from Shortcut Input → POST JSON → Notes URL</li>
              <li>JSON field: text · Header: Authorization</li>
            </ol>
            <p className="panel-body">Notes → Share → Send Copy → Send to Mind</p>
          </div>
      </div>
      </details>
    </section>
  );
}

/** Owns the unsaved goal draft. Remounting on a change from elsewhere is the reset. */
function GoalsPanel({ goals, onGoals }: { goals: GoalSettings; onGoals: (goals: GoalSettings) => void }) {
  const [draft, setDraft] = useState(goals);
  const dirty = (Object.keys(draft) as Array<keyof GoalSettings>).some((key) => draft[key] !== goals[key]);
  const set = (key: keyof GoalSettings, value: number | string | boolean | null) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <details className="tl-section setup-details">
      <summary>Goals</summary>
      <div className="tl-section-head">

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
              Saved
            </span>
          )}
        </div>
      </div>
      <div className="settings-grid">
        <NumberSetting
          label="Sleep"
          detail="h/night"
          value={draft.sleepHours}
          min={4}
          max={14}
          step={0.25}
          onChange={(value) => set("sleepHours", value)}
        />
        <NumberSetting
          label="Bedtime consistency"
          detail="min"
          value={draft.sleepConsistencyMinutes}
          min={15}
          max={360}
          step={15}
          onChange={(value) => set("sleepConsistencyMinutes", value)}
        />
        <SelectSetting
          label="Daily medication"
          detail="Today"
          value={draft.trackMedication ? "yes" : "no"}
          options={[
            { value: "yes", label: "Show" },
            { value: "no", label: "Hide" },
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
          label="Phase"
          detail=""
          value={draft.weightDirection}
          options={[
            { value: "maintain", label: "Maintain" },
            { value: "lose", label: "Cut" },
            { value: "gain", label: "Bulk" },
          ]}
          onChange={(value) => set("weightDirection", value as WeightDirection)}
        />
        {draft.weightDirection !== "maintain" ? (
          <>
            <DateSetting
              label={draft.weightDirection === "lose" ? "Cut started" : "Bulk started"}
              detail=""
              value={draft.phaseStart}
              max={todayLocal()}
              onChange={(value) => set("phaseStart", value)}
            />
            <NumberSetting
              label="Rate"
              detail="lb/week"
              value={draft.weeklyRateLb ?? ""}
              min={0.1}
              max={5}
              step={0.25}
              optional
              onChange={(value) => set("weeklyRateLb", value === "" ? null : value)}
            />
          </>
        ) : null}
        <NumberSetting
          label="Protein"
          detail="g/day"
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
    </details>
  );
}
