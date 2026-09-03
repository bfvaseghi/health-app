"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoalSettings,
  HealthState,
  ImportRecords,
  WeightDirection,
  normalizeHealthState,
} from "../health-model";
import {
  ParsedBackup,
  SOURCE_ARCHIVE,
  SOURCE_REPOSITORY,
  createBaselineArchive,
  parseBackupFile,
  restoreArchivePhotos,
} from "../portability";
import { Icon } from "./icons";
import { ConfirmButton, Note, NumberSetting, SelectSetting } from "./primitives";
import { downloadBlob, formatBytes, formatTimestamp } from "./format";
import { recordSummary } from "./record-summary";
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
}) {
  const [snapshots, setSnapshots] = useState<SnapshotState>({ status: "idle", items: [], message: "" });
  const [exporting, setExporting] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null);
  const restorePreviewRef = useRef<HTMLElement>(null);

  async function exportEverything() {
    setExporting(true);
    try {
      const archive = await createBaselineArchive(state, appleOverlay);
      downloadBlob(`baseline-everything-${today}.zip`, archive);
      onNotice("Your complete Baseline archive is downloading.");
    } catch {
      onNotice("The complete archive could not be created on this device.");
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
      onNotice(error instanceof Error ? error.message : "That backup could not be read.");
    }
  }

  async function confirmRestore() {
    if (!pendingRestore) return;
    setRestoreBusy(true);
    try {
      const images = await restoreArchivePhotos(pendingRestore);
      onRestoreState(
        pendingRestore.state,
        images ? `Backup restored, including ${images} progress ${images === 1 ? "photo" : "photos"}.` : "Backup restored.",
      );
      setPendingRestore(null);
    } catch {
      onNotice("The backup could not be restored completely. Your current record was not replaced.");
    } finally {
      setRestoreBusy(false);
    }
  }

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

  const summary = recordSummary(state);

  return (
    <div className="page tl-page">
      <span className="tl-caps">Data &amp; goals</span>
      <h1 className="tl-hero" tabIndex={-1}>
        {summary.total === 0 ? "Nothing here yet." : "Yours to keep."}
      </h1>
      <p className="tl-lede">
        {summary.total === 0
          ? "Nothing is stored until you log something or bring a record in. Everything you add stays in your own record, and you can take all of it with you."
          : `${summary.sentence}. Nothing leaves your record unless you export it.`}
      </p>

      <section className="panel wide-panel portability-panel" aria-labelledby="portability-title">
        <div className="portability-hero">
          <div className="connection-icon">
            <Icon name="download" />
          </div>
          <div>
            <p className="kicker">No lock-in</p>
            <h2 id="portability-title">Take everything with you</h2>
            <p className="panel-body">
              One archive: your restorable record, spreadsheet tables, Apple sync data, and every progress photo.
            </p>
          </div>
          <button type="button" className="button primary export-everything" disabled={exporting} onClick={exportEverything}>
            <Icon name="download" />
            {exporting ? "Building archive…" : "Download all data"}
          </button>
        </div>

        <div className="portability-grid">
          <div className="portability-item">
            <small>Your data</small>
            <b>JSON · CSV · photos</b>
            <span>Readable without Baseline and restorable in one step.</span>
          </div>
          <div className="portability-item">
            <small>Your app</small>
            <b>Complete source code</b>
            <span>Clone, fork, download, or hand it to another developer.</span>
            <div className="inline-links">
              <a href={SOURCE_REPOSITORY} target="_blank" rel="noreferrer">Open source</a>
              <a href={SOURCE_ARCHIVE}>Download code</a>
            </div>
          </div>
          <label className="portability-item restore-picker">
            <small>Bring it back</small>
            <b>Restore from archive</b>
            <span>Choose a Baseline ZIP or legacy JSON. Nothing changes until you review it.</span>
            <input
              type="file"
              accept="application/zip,.zip,application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void chooseRestore(file);
              }}
            />
          </label>
        </div>

        {pendingRestore ? (
          <section className="restore-preview" ref={restorePreviewRef} aria-live="polite">
            <div>
              <p className="kicker">Review before replacing</p>
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

        <Note icon="lock">
          The archive contains sensitive health information. It is created on this device and is not uploaded elsewhere.
        </Note>
      </section>

      <section className="tl-section" aria-labelledby="import-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="import-title" style={{ margin: 0 }}>Import · Oura · Whoop · Apple Health · Strong</h2>
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          Drop the export your app already makes — a Whoop or Apple zip, an Oura CSV, a Strong export, or any table with a date
          column. Columns are matched for you, and you see what will land before anything is saved.
        </p>
        <div className="tl-actions">
          <button type="button" className="button primary" onClick={() => open({ kind: "import" })}>
            <Icon name="upload" />
            Import health data
          </button>
        </div>
      </section>

      <AppleHealthSyncPanel onNotice={onNotice} onChanged={onAppleChanged} demo={demo} />
      {demo ? <Note icon="lock">Private recovery snapshots are available in your real record.</Note> : null}

      {/* Keyed so a restored backup or a sync from another device replaces the draft outright. */}
      <GoalsPanel key={JSON.stringify(state.goals)} goals={state.goals} onGoals={onGoals} />

      <section className="tl-section" aria-labelledby="theme-title">
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

      {!demo ? <section className="tl-section" aria-labelledby="snapshots-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="snapshots-title" style={{ margin: 0 }}>Recover an earlier save</h2>
          <button type="button" className="text-button" onClick={loadSnapshots}>
            <Icon name="history" />
            {snapshots.status === "loading" ? "Looking…" : "Find snapshots"}
          </button>
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          Each save keeps the version it replaced, up to the last 30. Restoring is itself a save, so the current
          version is kept too.
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
            <p className="tl-line">No earlier versions are stored yet.</p>
          )
        ) : null}
      </section> : null}

      {!demo ? <section className="tl-section" aria-labelledby="erase-title">
        <div className="tl-section-head">
          <h2 className="tl-caps" id="erase-title" style={{ margin: 0 }}>Start over</h2>
          <ConfirmButton label="Erase all data" confirmLabel="Erase everything" className="button danger" onConfirm={onErase} />
        </div>
        <p className="tl-line" style={{ marginTop: 10 }}>
          Clears every record, photo, snapshot, and sync connection. Goals stay. There is no undo — download a backup
          first.
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

/**
 * The phone sends Apple Health straight to Baseline. ChatGPT Health is not a
 * second writer for the same metrics, and Strong remains the only workout
 * source, so an automatic refresh cannot duplicate a set or choose a winner by
 * accident.
 */
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
        if (!response.ok) throw new Error(data.error ?? "Apple Health sync is unavailable.");
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
        onNotice(error instanceof Error ? error.message : "Apple Health sync is unavailable.");
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
      if (!response.ok || !data.token) throw new Error(data.error ?? "A sync key could not be created.");
      setToken(data.token);
      if (data.endpoint) setEndpoint(new URL(data.endpoint, window.location.origin).toString());
      setStatus((current) => ({ ...current, loading: false, configured: true }));
      onNotice("Your private iPhone connection is ready.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "A sync key could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken() {
    setBusy(true);
    try {
      const response = await fetch("/api/apple-health-sync/setup", { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Apple Health sync could not be turned off.");
      setToken("");
      setStatus({ loading: false, configured: false, lastSyncedAt: null });
      onChanged(null);
      onNotice("The private iPhone connection is off. Saved thoughts remain in Mind.");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Apple Health sync could not be turned off.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(`${label} copied.`);
    } catch {
      onNotice(`Press and hold to copy the ${label.toLowerCase()}.`);
    }
  }

  const bearer = token ? `Bearer ${token}` : "";
  const summary = demo
    ? "Preview only · no connection or key is created"
    : status.loading
    ? "Checking connection…"
    : status.configured
      ? status.lastSyncedAt
        ? `Last received ${formatTimestamp(status.lastSyncedAt)}`
        : "Ready for its first sync"
      : "Off";

  return (
    <section className="panel wide-panel apple-sync-panel">
      <div className="panel-head wrap">
        <div>
          <p className="kicker">Health automation · Notes share sheet</p>
          <h2>Private iPhone connection</h2>
          <p className="panel-body">{summary}</p>
        </div>
        {demo ? (
          <button type="button" className="button secondary small" disabled>Real record only</button>
        ) : !status.configured ? (
          <button type="button" className="button primary small" disabled={status.loading || busy} onClick={createToken}>
            {busy ? "Creating…" : "Create connection"}
          </button>
        ) : (
          <div className="heading-actions">
            <ConfirmButton
              label="Replace shared key"
              confirmLabel="Replace key for both"
              className="button secondary small"
              icon="key"
              disabled={busy}
              onConfirm={createToken}
            />
            <ConfirmButton
              label="Turn off"
              confirmLabel="Turn off both feeds"
              className="button secondary small"
              disabled={busy}
              onConfirm={revokeToken}
            />
          </div>
        )}
      </div>

      {token ? (
        <div className="sync-credentials" aria-label="Private iPhone connection details">
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
        <p className="panel-body">The key shows only once. Need it again? Replace it, then paste the new one everywhere it is used.</p>
      ) : null}

      {!status.configured && !demo ? (
        <p className="panel-body">Create one private connection to reveal the two URLs and shared key.</p>
      ) : null}
      <div className="iphone-connection-guides">
          <div>
            <h3>Health Auto Export</h3>
            <ol className="sync-steps">
              <li>New Automation → REST API → paste the Health URL</li>
              <li>Use JSON · daily totals · last 4 days · every 2 days</li>
              <li>Select steps, sleep, weight, body fat, resting HR and HRV</li>
            </ol>
          </div>
          <div>
            <h3>Apple Notes → Thought Journal</h3>
            <ol className="sync-steps">
              <li>Create a Share Sheet Shortcut named “Send to Mind”</li>
              <li>Get Text from Shortcut Input, then POST JSON to the Notes URL</li>
              <li>Send a JSON field named “text” and use the same Authorization header above</li>
            </ol>
            <p className="panel-body">Then in Notes: Share → Send Copy → Send to Mind. Sending the same note twice is safely ignored.</p>
          </div>
      </div>
      <Note icon="lock">{demo
        ? "This is a setup preview. Open your real record to create the private URLs and key."
        : "These URLs can only write — never read your record. One key serves both; replacing or turning it off affects both."}</Note>
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
    <section className="tl-section" aria-labelledby="goals-title">
      <div className="tl-section-head">
        <h2 className="tl-caps" id="goals-title" style={{ margin: 0 }}>Goals</h2>
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
