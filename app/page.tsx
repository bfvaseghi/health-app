"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DailyEntry,
  GoalSettings,
  HealthState,
  ImportRecords,
  LabResult,
  Medication,
  ProgressPhoto,
  SleepEntry,
  SleepSource,
  STORAGE_KEY,
  TherapyNote,
  ThoughtJournalEntry,
  emptyDailyEntry,
  emptyHealthState,
  normalizeHealthState,
  mergeRecords,
  removeDailyEntry,
  recordDose,
  removeLabResult,
  removeMedication,
  upsertMedication,
  removeProgressPhoto,
  removeSleepEntry,
  removeTherapyNote,
  removeThoughtJournalEntry,
  removeWorkoutSession,
  todayLocal,
  upsertDailyEntry,
  upsertLabResult,
  upsertProgressPhoto,
  upsertSleepEntry,
  upsertTherapyNote,
  upsertThoughtJournalEntry,
} from "./health-model";
import { demoHealthState } from "./demo-state";
import { applyImport } from "./import";
import { subtractAppleHealthSyncOverlay } from "./apple-health-sync";
import {
  LocalStateEnvelope,
  chooseInitialState,
  localStateEnvelope,
  mergeConcurrentHealthState,
  parseLocalState,
  sameHealthState,
} from "./state-sync";
import { trainingAnchorSets, weekStart } from "./training/coach";
import { Icon } from "./ui/icons";
import { DataView } from "./ui/data-view";
import { FitnessView } from "./ui/fitness-view";
import { ImportDialog } from "./ui/import-dialog";
import { CheckInModal, LabModal, MedicationModal, ShortcutsModal, SleepModal } from "./ui/modals";
import { LabsView } from "./ui/labs-view";
import { MedsView } from "./ui/meds-view";
import { MindView } from "./ui/mind-view";
import { clearAllPhotos, deletePhoto, savePhoto } from "./ui/photo-store";
import { MoreView } from "./ui/more-view";
import { SleepView } from "./ui/sleep-view";
import { SummaryView } from "./ui/summary-view";
import { TodayView } from "./ui/today-view";
import { formatTimestamp } from "./ui/format";
import { Modal, SaveStatus, Theme, Toast, View, mobileNavOrder, navOrder, viewLabels } from "./ui/types";

const THEME_KEY = "bardia-health-theme";
const initialState = emptyHealthState();

type HealthStateUpdate = (current: HealthState) => HealthState;

function persistLocalState(state: HealthState, base: HealthState | null, revision: number): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localStateEnvelope(state, base, revision)));
    return true;
  } catch {
    return false;
  }
}

function recordId(prefix: string): string {
  if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${prefix}-${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

function requestedDemoMode(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "1";
}

/** Says what the server removed, so a one-off cleanup is not a silent one. */
function purgeMessage({
  fields,
  records,
  snapshots,
}: {
  fields: string[];
  records: number;
  snapshots: number;
}): string {
  const named = fields.slice(0, 3).join(", ");
  const rest = fields.length > 3 ? ` and ${fields.length - 3} more` : "";
  const places = [
    records ? `${records} ${records === 1 ? "record" : "records"}` : "",
    snapshots ? `${snapshots} ${snapshots === 1 ? "snapshot" : "snapshots"}` : "",
  ].filter(Boolean);
  return `Purged ${named}${rest} from ${places.join(" and ") || "your saved record"}.`;
}

/** The inline bootstrap in the layout already applied this; read it back on mount. */
function storedTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_KEY);
  return isTheme(stored) ? stored : "system";
}

export default function Home() {
  // Fixed for the lifetime of this document. Leaving demo mode performs a hard
  // navigation, so synthetic memory can never turn into a saveable real state.
  const [demoMode] = useState(requestedDemoMode);
  const [view, setView] = useState<View>("today");
  const [modal, setModal] = useState<Modal>(null);
  const [state, setState] = useState<HealthState>(initialState);
  const [appleOverlay, setAppleOverlay] = useState<Partial<ImportRecords> | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [savedAt, setSavedAt] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [theme, setTheme] = useState<Theme>(() => demoMode ? "system" : storedTheme());
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const stateRef = useRef(initialState);
  const skipNextSave = useRef(false);
  const saveVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const destructiveChange = useRef(false);
  const serverRevision = useRef(0);
  const serverBase = useRef<HealthState | null>(null);
  const [today, setToday] = useState(todayLocal);

  /** Keeps event handlers on one live snapshot even when several fire before React paints. */
  const updateState = useCallback((update: HealthStateUpdate): HealthState => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    const refreshDate = () => setToday(todayLocal());
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || demoMode) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/health-state", {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok || !active) return;
        const data = (await response.json()) as {
          state?: unknown;
          updatedAt?: string;
          revision?: number;
          appleOverlay?: Partial<ImportRecords> | null;
        };
        const overlay = data.appleOverlay ?? null;
        setAppleOverlay(overlay);
        const revision = Number.isSafeInteger(data.revision) ? data.revision ?? 0 : 0;
        if (!data.state || revision <= serverRevision.current) return;

        const storedRemote = normalizeHealthState({
          ...(data.state as object),
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        });
        const remote = overlay ? subtractAppleHealthSyncOverlay(storedRemote, overlay) : storedRemote;
        const merged = mergeConcurrentHealthState(serverBase.current, stateRef.current, remote);
        serverBase.current = storedRemote;
        serverRevision.current = revision;
        updateState(() => merged.state);
        persistLocalState(merged.state, storedRemote, revision);
        setToast({
          message: merged.conflicts
            ? `Received synced data and kept ${merged.conflicts} newer local ${merged.conflicts === 1 ? "edit" : "edits"}.`
            : "New synced data added.",
        });
      } catch {
        // The current record remains usable while a background refresh is unavailable.
      }
    };
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [demoMode, hydrated, updateState]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let active = true;
    async function load() {
      // Demo mode branches before the private browser fallback or D1 record is
      // touched. It owns one synthetic in-memory state and drops it on reload.
      if (demoMode) {
        updateState(() => demoHealthState(todayLocal()));
        setSaveStatus("demo");
        setHydrated(true);
        return;
      }

      let local: LocalStateEnvelope | HealthState | null = null;
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) local = parseLocalState(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      try {
        const response = await fetch("/api/health-state", {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          window.location.replace(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
          return;
        }
        if (response.status === 403) {
          setAccessDenied(true);
          return;
        }
        if (!response.ok) throw new Error("Private sync unavailable");
        const data = (await response.json()) as {
          state?: unknown;
          updatedAt?: string;
          revision?: number;
          purged?: { fields: string[]; records: number; snapshots: number };
          appleOverlay?: Partial<ImportRecords> | null;
        };
        if (!active) return;

        const readRemote = data.state ? normalizeHealthState(data.state) : null;
        const storedRemote = readRemote && data.updatedAt
          ? normalizeHealthState({ ...readRemote, updatedAt: data.updatedAt })
          : readRemote;
        const overlay = data.appleOverlay ?? null;
        const remote = storedRemote && overlay ? subtractAppleHealthSyncOverlay(storedRemote, overlay) : storedRemote;
        const cleanedLocal = local && overlay
          ? "format" in local
            ? localStateEnvelope(
                subtractAppleHealthSyncOverlay(local.state, overlay),
                local.acknowledgedBase ? subtractAppleHealthSyncOverlay(local.acknowledgedBase, overlay) : null,
                local.acknowledgedRevision,
              )
            : subtractAppleHealthSyncOverlay(local, overlay)
          : local;
        const laneMigrationNeeded = Boolean(storedRemote && remote && !sameHealthState(storedRemote, remote));
        serverRevision.current = Number.isSafeInteger(data.revision) ? data.revision ?? 0 : 0;
        setAppleOverlay(overlay);
        // This is the exact server base, including any V7 Apple contamination.
        // The first V8 save subtracts that contamination revision-safely.
        serverBase.current = storedRemote;
        const choice = chooseInitialState(cleanedLocal, remote, initialState);
        const chosen = choice.state;
        const needsSync = choice.needsSync || laneMigrationNeeded;

        // A server copy is already durable. A newer local copy, or the first
        // local copy against an empty server, must flow through the save effect.
        skipNextSave.current = !needsSync;
        updateState(() => chosen);
        persistLocalState(chosen, storedRemote, serverRevision.current);
        setSaveStatus(needsSync ? "saving" : "saved");
        setSavedAt(needsSync ? "" : data.updatedAt ?? "");
        if (choice.recoveryState) {
          const recovery = choice.recoveryState;
          setToast({
            message: "An older offline copy differs from private sync. The server copy is shown.",
            action: {
              label: "Use offline copy",
              run: () => updateState(() => recovery),
            },
          });
        } else if (choice.conflicts) {
          setToast({
            message: `Kept this device's edits in ${choice.conflicts} startup ${choice.conflicts === 1 ? "conflict" : "conflicts"}.`,
          });
        } else if (data.purged?.fields.length) setToast({ message: purgeMessage(data.purged) });
      } catch {
        if (!active) return;
        const chosen = local && "format" in local ? local.state : local ?? initialState;
        skipNextSave.current = false;
        updateState(() => chosen);
        const savedLocally = persistLocalState(chosen, local && "format" in local ? local.acknowledgedBase : null, local && "format" in local ? local.acknowledgedRevision : 0);
        setSaveStatus(savedLocally ? "local" : "error");
      } finally {
        if (active) setHydrated(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [demoMode, updateState]);

  useEffect(() => {
    // A demo interaction may exercise every state handler, but none of those
    // changes may reach localStorage or the private API.
    if (!hydrated || demoMode) return;
    const savedLocally = persistLocalState(state, serverBase.current, serverRevision.current);
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const version = ++saveVersion.current;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      const save = async () => {
        if (destructiveChange.current) return;
        try {
          // Coalesce queued edits: every worker sends the newest live state,
          // never the snapshot captured when an older timer was created.
          const desired = stateRef.current;
          const response = await fetch("/api/health-state", {
            method: "PUT",
            headers: {
              "content-type": "application/json",
              "if-match": `"${serverRevision.current}"`,
            },
            body: JSON.stringify(desired),
            signal: AbortSignal.timeout(12_000),
          });
          if (response.status === 409) {
            const data = (await response.json()) as { state?: unknown; updatedAt?: string; revision?: number; error?: string };
            if (!data.state || !Number.isSafeInteger(data.revision)) {
              throw new Error(data.error ?? "A newer save could not be merged.");
            }
            const remote = normalizeHealthState({
              ...(data.state as object),
              updatedAt: data.updatedAt ?? new Date().toISOString(),
            });
            const merged = mergeConcurrentHealthState(serverBase.current, stateRef.current, remote);
            serverBase.current = remote;
            serverRevision.current = data.revision ?? 0;
            updateState(() => merged.state);
            setToast({
              message: merged.conflicts
                ? `Kept this device's edits in ${merged.conflicts} save ${merged.conflicts === 1 ? "conflict" : "conflicts"}.`
                : "Combined a newer save with this device's changes.",
            });
            return;
          }
          if (!response.ok) throw new Error("Save failed");
          const data = (await response.json()) as { state?: unknown; updatedAt?: string; revision?: number };
          if (Number.isSafeInteger(data.revision)) serverRevision.current = data.revision ?? serverRevision.current;
          serverBase.current = data.state
            ? normalizeHealthState(data.state)
            : normalizeHealthState({ ...desired, updatedAt: data.updatedAt ?? new Date().toISOString() });
          persistLocalState(stateRef.current, serverBase.current, serverRevision.current);
          if (version === saveVersion.current) {
            setSaveStatus("saved");
            setSavedAt(data.updatedAt ?? new Date().toISOString());
          }
        } catch {
          if (version === saveVersion.current) {
            setSaveStatus(savedLocally ? "local" : "error");
            if (!savedLocally) {
              setToast({ message: "This change is not saved. Export a backup before leaving this page." });
            }
          }
        }
      };
      // Whole-state writes must arrive in the order they were made. Otherwise
      // a slow old PUT can land after a fast new one and erase the new state.
      saveQueue.current = saveQueue.current.then(save, save);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [demoMode, hydrated, state, saveAttempt, updateState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.action ? 7_000 : 3_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = useCallback((next: View) => {
    setView(next);
    // A section change is a new screen. An animated carry-over can leave the
    // next heading above the viewport for several frames, especially on iOS.
    window.scrollTo({ top: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#main h1")?.focus({ preventScroll: true }));
    });
  }, []);

  const notice = useCallback((message: string) => setToast({ message }), []);

  const openModal = useCallback((next: Modal) => {
    if (demoMode && next?.kind === "import") {
      notice("Import is available in your real record.");
      return;
    }
    setModal(next);
  }, [demoMode, notice]);

  /** Applies a whole-state change and offers a single-step undo for the ones that remove data. */
  /**
   * Write, say what happened, and offer a way back.
   *
   * The write takes a function of the current record rather than a finished
   * one, because two taps can land in the same tick — the one-tap medication
   * offers and the set steppers invite exactly that — and a record built from
   * the state a stale closure captured would throw the first tap away. Undo
   * still restores what was on screen when you pressed, which is what undo
   * means to the person pressing it.
   */
  const commit = useCallback(
    (update: (current: HealthState) => HealthState, message: string, undoable = false) => {
      const previous = stateRef.current;
      const applied = updateState(update);
      setToast({
        message,
        action: undoable
          ? {
              label: "Undo",
              // A newer action replaces this toast. The identity check also
              // prevents an old callback from rolling back intervening edits.
              run: () => updateState((current) => (current === applied ? previous : current)),
            }
          : undefined,
      });
    },
    [updateState],
  );

  const saveDaily = (entry: DailyEntry) => updateState((current) => upsertDailyEntry(current, entry));
  const updateDaily = (date: string, update: (current: DailyEntry) => DailyEntry) =>
    updateState((current) => {
      const entry = current.dailyEntries.find((item) => item.date === date) ?? emptyDailyEntry(date);
      return upsertDailyEntry(current, update(entry));
    });
  const saveSleep = (entry: SleepEntry) => updateState((current) => upsertSleepEntry(current, entry));
  const saveLab = (result: LabResult) => updateState((current) => upsertLabResult(current, result));
  // Takes either the goals to write or a function of the ones on record. The
  // set steppers on the Coach tab fire faster than React re-renders, and three
  // presses built from one captured copy of the goals are two presses lost.
  const saveGoals = (goals: GoalSettings | ((current: GoalSettings) => GoalSettings)) =>
    updateState((current) =>
      normalizeHealthState({
        ...current,
        updatedAt: new Date().toISOString(),
        goals: typeof goals === "function" ? goals(current.goals) : goals,
      }),
    );

  useEffect(() => {
    if (!hydrated || state.workoutSets.length < 10 || state.goals.trainingBlockStart) return;
    updateState((current) => normalizeHealthState({
      ...current,
      updatedAt: new Date().toISOString(),
      goals: {
        ...current.goals,
        trainingBlockStart: weekStart(today),
        trainingAnchorSets: trainingAnchorSets(current, today),
      },
    }));
  }, [hydrated, state.goals.trainingBlockStart, state.workoutSets.length, today, updateState]);

  const deleteDaily = (date: string) => {
    setModal(null);
    commit((current) => removeDailyEntry(current, date), "Check-in deleted.", true);
  };
  const deleteSleep = (date: string, source: SleepSource) => {
    setModal(null);
    commit((current) => removeSleepEntry(current, date, source), "Sleep record deleted.", true);
  };
  const saveMedication = (medication: Medication) => {
    setModal(null);
    commit((current) => upsertMedication(current, medication), "Medication saved.", true);
  };
  const deleteMedication = (id: string) => {
    setModal(null);
    commit((current) => removeMedication(current, id), "Medication deleted.", true);
  };
  // A dose is a tap, and taps are undone by tapping again rather than by a
  // toast — so this one does not announce itself.
  const setDose = (medicationId: string, date: string, taken: boolean | null) =>
    updateState((current) => recordDose(current, medicationId, date, taken));
  const toggleDose = (medicationId: string, date: string, taken: boolean) =>
    updateState((current) => {
      const existing = current.medicationDoses.find(
        (dose) => dose.medicationId === medicationId && dose.date === date,
      );
      return recordDose(current, medicationId, date, existing?.taken === taken ? null : taken);
    });

  const deleteLab = (id: string) => {
    setModal(null);
    commit((current) => removeLabResult(current, id), "Lab result deleted.", true);
  };

  const addPhoto = async (photo: ProgressPhoto, blob: Blob) => {
    if (demoMode) {
      notice("Progress photos stay out of demo mode.");
      return;
    }
    try {
      await savePhoto(photo.id, blob);
    } catch {
      // Without the image there is nothing to show, so the record is not written
      // either — a card that can never load is worse than no card.
      notice("This browser would not store the photo.");
      return;
    }
    updateState((current) => upsertProgressPhoto(current, photo));
  };

  const deletePhotoRecord = (id: string) => {
    if (demoMode) return;
    void deletePhoto(id);
    // The image itself is deleted from IndexedDB, so restoring only its metadata
    // would create a card that can never load.
    commit((current) => removeProgressPhoto(current, id), "Photo deleted.");
  };

  const deleteSession = (startedAt: string) =>
    commit((current) => removeWorkoutSession(current, startedAt), "Workout deleted.", true);

  const addTherapyNote = (text: string) =>
    updateState((current) =>
      upsertTherapyNote(current, {
        id: recordId("note"),
        date: todayLocal(),
        text,
        shared: false,
        sharedDate: "",
      }),
    );

  const toggleTherapyNote = (note: TherapyNote) =>
    updateState((current) => {
      const latest = current.therapyNotes.find((entry) => entry.id === note.id);
      if (!latest) return current;
      return upsertTherapyNote(current, {
        ...latest,
        shared: !latest.shared,
        sharedDate: latest.shared ? "" : todayLocal(),
      });
    });

  const deleteTherapyNote = (id: string) => commit((current) => removeTherapyNote(current, id), "Note deleted.", true);

  const addThought = ({ title, text, source }: { title: string; text: string; source: ThoughtJournalEntry["source"] }) =>
    updateState((current) =>
      upsertThoughtJournalEntry(current, {
        id: recordId("thought"),
        date: todayLocal(),
        createdAt: new Date().toISOString(),
        title,
        text,
        source,
      }),
    );

  const deleteThought = (id: string) =>
    commit((current) => removeThoughtJournalEntry(current, id), "Thought deleted.", true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || modal) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      const key = event.key.toLowerCase();
      if (key === "i" && !demoMode) setModal({ kind: "import" });
      else if (key === "s") setModal({ kind: "sleep", date: todayLocal() });
      else if (key === "c") setModal({ kind: "checkin", date: todayLocal() });
      else if (key === "l") setModal({ kind: "lab" });
      else if (event.key === "?") setModal({ kind: "shortcuts" });
      else if (/^[1-7]$/.test(key)) go(navOrder[Number(key) - 1]);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, go, demoMode]);

  const syncLabel = useMemo(() => {
    if (saveStatus === "demo") return "Demo · resets on reload";
    if (saveStatus === "saving") return "Saving";
    if (saveStatus === "loading") return "Loading";
    if (saveStatus === "saved") return savedAt ? `Synced ${formatTimestamp(savedAt)}` : "Private sync on";
    if (saveStatus === "error") return "Not saved";
    return "Saved on this device";
  }, [saveStatus, savedAt]);
  const mobileActive: View = ["meds", "labs", "summary", "data"].includes(view) ? "more" : view;
  const visibleState = useMemo(
    () => appleOverlay ? mergeRecords(state, appleOverlay) : state,
    [state, appleOverlay],
  );

  const eraseEverything = async () => {
    if (destructiveChange.current) return;
    destructiveChange.current = true;
    try {
      await saveQueue.current;
      const response = await fetch("/api/health-state", {
        method: "DELETE",
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await response.json()) as { state?: unknown; updatedAt?: string; revision?: number; error?: string };
      if (!response.ok || !data.state || !Number.isSafeInteger(data.revision)) {
        throw new Error(data.error ?? "The record could not be erased.");
      }
      const cleared = normalizeHealthState(data.state);
      serverRevision.current = data.revision ?? 0;
      serverBase.current = cleared;
      setAppleOverlay(null);
      skipNextSave.current = true;
      updateState(() => cleared);
      persistLocalState(cleared, cleared, serverRevision.current);
      await clearAllPhotos();
      setSaveStatus("saved");
      setSavedAt(data.updatedAt ?? cleared.updatedAt);
      setToast({ message: "Every record, snapshot, photo, and Apple connection was erased." });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "The record could not be erased." });
    } finally {
      destructiveChange.current = false;
    }
  };

  // Do not accept edits against the empty module-level state while the local
  // and server copies are still being reconciled.
  if (!hydrated) {
    return (
      <main className="boot-screen" aria-busy="true" aria-label="Loading Baseline">
        <span className="brand-mark">
          <Icon name="pulse" />
        </span>
        <strong>Baseline</strong>
        <small>Opening Baseline…</small>
      </main>
    );
  }

  if (accessDenied) {
    return (
      <main className="boot-screen" aria-label="Private Baseline record">
        <span className="brand-mark">
          <Icon name="lock" />
        </span>
        <strong>Baseline is private</strong>
        <small>This ChatGPT account does not have access.</small>
        <a className="button secondary small" href="/signout-with-chatgpt?return_to=/">
          Use another account
        </a>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar" aria-label="Primary navigation">
        <button type="button" className="brand" onClick={() => go("today")}>
          <span className="brand-mark">
            <Icon name="pulse" />
          </span>
          <span>
            <strong>Baseline</strong>
            <small>{demoMode ? "Demo data" : "Private record"}</small>
          </span>
        </button>
        <nav className="nav-list">
          {navOrder.map((item) => (
            <button
              key={item}
              type="button"
              className={view === item ? "nav-item active" : "nav-item"}
              aria-current={view === item ? "page" : undefined}
              onClick={() => go(item)}
            >
              <Icon name={item} />
              <span>{viewLabels[item]}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className={view === "data" ? "nav-item active data-link" : "nav-item data-link"}
          aria-current={view === "data" ? "page" : undefined}
          onClick={() => go("data")}
        >
          <Icon name="settings" />
          <span>{viewLabels.data}</span>
        </button>
        {!demoMode ? (
          <>
            <div className="sidebar-foot">
              <span className={`sync-dot ${saveStatus}`} />
              <span>{syncLabel}</span>
              {saveStatus === "local" || saveStatus === "error" ? (
                <button type="button" className="text-button" onClick={() => setSaveAttempt((count) => count + 1)}>
                  Retry
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>

      <main className="main-content" id="main">
        {demoMode ? (
          <aside className="demo-banner" aria-label="Demo mode">
            <span>
              <b>Demo data</b>
              <span className="demo-banner-detail"> · changes reset when you leave</span>
            </span>
            <button type="button" onClick={() => window.location.assign("/")}>Open my record</button>
          </aside>
        ) : (
          <header className="mobile-head">
            <div className="brand compact">
              <span className="brand-mark">
                <Icon name="pulse" />
              </span>
              <strong>Baseline</strong>
            </div>
            <span className={`mobile-save-state ${saveStatus}`} aria-live="polite">{syncLabel}</span>
          </header>
        )}

        {!demoMode && (saveStatus === "local" || saveStatus === "error") ? (
          <aside className="mobile-sync-alert" role="status">
            <span><b>{saveStatus === "error" ? "Not saved" : "Saved on this device only"}</b><small>Your latest edit has not reached private sync.</small></span>
            <button type="button" className="button secondary small" onClick={() => setSaveAttempt((count) => count + 1)}>Retry</button>
          </aside>
        ) : null}

        {view === "today" && (
          <TodayView
            state={visibleState}
            editableState={state}
            today={today}
            go={go}
            open={openModal}
            demo={demoMode}
            updateDaily={updateDaily}
            onDose={toggleDose}
            onNotice={notice}
          />
        )}
        {view === "sleep" && (
          <SleepView state={visibleState} editableState={state} today={today} open={openModal} onDelete={deleteSleep} demo={demoMode} />
        )}
        {view === "fitness" && (
          <FitnessView
            state={visibleState}
            editableState={state}
            today={today}
            open={openModal}
            demo={demoMode}
            onAddPhoto={(photo, blob) => void addPhoto(photo, blob)}
            onDeletePhoto={deletePhotoRecord}
            onDeleteSession={deleteSession}
            onDeleteDay={deleteDaily}
            onGoals={saveGoals}
            onNotice={notice}
          />
        )}
        {view === "mind" && (
          <MindView
            state={visibleState}
            today={today}
            updateDaily={updateDaily}
            onAddNote={addTherapyNote}
            onToggleNote={toggleTherapyNote}
            onDeleteNote={deleteTherapyNote}
            onAddThought={addThought}
            onDeleteThought={deleteThought}
            onNotice={notice}
          />
        )}
        {view === "meds" && (
          <MedsView
            state={visibleState}
            today={today}
            open={openModal}
            onDose={toggleDose}
            onDeleteMedication={deleteMedication}
          />
        )}
        {view === "labs" && <LabsView state={visibleState} open={openModal} onDeleteLab={deleteLab} />}
        {view === "summary" && <SummaryView state={visibleState} today={today} onNotice={notice} />}
        {view === "more" && <MoreView go={go} demo={demoMode} />}
        {view === "data" && (
          <DataView
            state={state}
            appleOverlay={appleOverlay}
            today={today}
            theme={theme}
            onTheme={(next) => {
              setTheme(next);
              window.localStorage.setItem(THEME_KEY, next);
            }}
            onGoals={saveGoals}
            open={openModal}
            onRestoreState={(restored, message) => commit(() => restored, message)}
            onErase={eraseEverything}
            onAppleChanged={setAppleOverlay}
            onNotice={notice}
            demo={demoMode}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Sections">
        {mobileNavOrder.map((item) => (
          <button
            key={item}
            type="button"
            className={mobileActive === item ? "active" : ""}
            aria-current={mobileActive === item ? "page" : undefined}
            onClick={() => go(item)}
          >
            <Icon name={item} />
            <span>{viewLabels[item]}</span>
          </button>
        ))}
      </nav>

      {modal?.kind === "checkin" && (
        <CheckInModal
          state={state}
          date={modal.date}
          onClose={() => setModal(null)}
          onDose={setDose}
          onSave={(entry) => {
            if (entry) saveDaily(entry);
            setModal(null);
            notice(entry ? (entry.date === today ? "Today is saved." : `Saved for ${entry.date}.`) : "Medication answers saved.");
          }}
          onDelete={deleteDaily}
        />
      )}
      {modal?.kind === "sleep" && (
        <SleepModal
          state={state}
          date={modal.date}
          source={modal.source}
          onClose={() => setModal(null)}
          onSave={(entry) => {
            saveSleep(entry);
            setModal(null);
            notice("Sleep is saved.");
          }}
          onDelete={deleteSleep}
        />
      )}
      {modal?.kind === "medication" && (
        <MedicationModal
          state={state}
          id={modal.id}
          onClose={() => setModal(null)}
          onSave={saveMedication}
          onDelete={deleteMedication}
        />
      )}
      {modal?.kind === "lab" && (
        <LabModal
          state={state}
          id={modal.id}
          onClose={() => setModal(null)}
          onSave={(result) => {
            saveLab(result);
            setModal(null);
            notice("Result saved.");
          }}
          onDelete={deleteLab}
        />
      )}
      {!demoMode && modal?.kind === "import" && (
        <ImportDialog
          onClose={() => setModal(null)}
          onImport={(items) => {
            const before = stateRef.current;
            const next = applyImport(before, items);
            const added = [
              [next.sleepEntries.length - before.sleepEntries.length, "night", "nights"],
              [next.dailyEntries.length - before.dailyEntries.length, "day", "days"],
              [next.workoutSets.length - before.workoutSets.length, "set", "sets"],
            ] as const;
            const parts = added
              .filter(([count]) => count > 0)
              .map(([count, one, many]) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`);
            setModal(null);
            commit(
              (current) => applyImport(current, items),
              parts.length
                ? `Imported ${parts.join(", ")}.`
                : "Import finished. Existing records were updated in place.",
              true,
            );
          }}
        />
      )}
      {modal?.kind === "shortcuts" && <ShortcutsModal onClose={() => setModal(null)} demo={demoMode} />}

      {toast ? (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
            >
              <Icon name="undo" />
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
