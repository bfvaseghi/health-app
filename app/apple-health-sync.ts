import type { DailyEntry, HealthState, SleepEntry } from "./health-model";
import { normalizeDailyEntry, normalizeHealthState, normalizeSleepEntry } from "./health-model";
import { isSupportedAutoExportMetric, parseAutoExport } from "./import/index";

const DAILY_FIELDS = ["steps", "weightLb", "bodyFatPercent", "restingHeartRate", "hrvMs"] as const;
const SLEEP_TEXT_FIELDS = ["bedtime", "wakeTime"] as const;
const SLEEP_NUMBER_FIELDS = [
  "durationHours",
  "efficiencyPercent",
  "deepHours",
  "remHours",
  "restingHeartRate",
  "hrvMs",
] as const;

export type AppleHealthSyncDailyEntry = Pick<DailyEntry, "date"> &
  Partial<Pick<DailyEntry, (typeof DAILY_FIELDS)[number]>>;

export type AppleHealthSyncSleepEntry = Pick<SleepEntry, "date" | "source"> &
  Partial<Pick<SleepEntry, (typeof SLEEP_TEXT_FIELDS)[number] | (typeof SLEEP_NUMBER_FIELDS)[number]>>;

export type AppleHealthSyncPayload = {
  dailyEntries: AppleHealthSyncDailyEntry[];
  sleepEntries: AppleHealthSyncSleepEntry[];
};

export type ParsedAppleHealthSync = {
  payload: AppleHealthSyncPayload;
  ignoredMetricTypes: number;
  skippedSamples: number;
};

export type MergedAppleHealthSync = {
  payload: AppleHealthSyncPayload;
  changedDays: number;
  changedNights: number;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function normalizeDaily(value: unknown): AppleHealthSyncDailyEntry | null {
  const raw = recordOf(value);
  const normalized = normalizeDailyEntry(raw);
  if (!normalized) return null;

  const entry: AppleHealthSyncDailyEntry = { date: normalized.date };
  for (const field of DAILY_FIELDS) {
    if (hasValue(raw[field]) && normalized[field] !== null) entry[field] = normalized[field];
  }
  return Object.keys(entry).length > 1 ? entry : null;
}

function normalizeSleep(value: unknown): AppleHealthSyncSleepEntry | null {
  const raw = recordOf(value);
  const normalized = normalizeSleepEntry({ ...raw, source: "apple" });
  if (!normalized) return null;

  const entry: AppleHealthSyncSleepEntry = { date: normalized.date, source: "apple" };
  for (const field of SLEEP_TEXT_FIELDS) {
    if (hasValue(raw[field]) && normalized[field]) entry[field] = normalized[field];
  }
  for (const field of SLEEP_NUMBER_FIELDS) {
    if (hasValue(raw[field]) && normalized[field] !== null) entry[field] = normalized[field];
  }
  return Object.keys(entry).length > 2 ? entry : null;
}

function mergeByDate<T extends { date: string }>(values: T[]): T[] {
  const merged = new Map<string, T>();
  for (const value of values) {
    const current = merged.get(value.date);
    merged.set(value.date, current ? { ...current, ...value } : value);
  }
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Reduces any stored value to the small Apple wellness shape Baseline accepts.
 * Workout, lab, clinical, nutrition and note fields have no path into this
 * payload, even if a caller includes them in the JSON.
 */
export function normalizeAppleHealthSyncPayload(value: unknown): AppleHealthSyncPayload {
  const raw = recordOf(value);
  const daily = Array.isArray(raw.dailyEntries) ? raw.dailyEntries.map(normalizeDaily).filter(Boolean) : [];
  const sleep = Array.isArray(raw.sleepEntries) ? raw.sleepEntries.map(normalizeSleep).filter(Boolean) : [];

  return {
    dailyEntries: mergeByDate(daily as AppleHealthSyncDailyEntry[]),
    sleepEntries: mergeByDate(sleep as AppleHealthSyncSleepEntry[]),
  };
}

/** Reads only the supported Health Auto Export metric list. */
export function parseAppleHealthSync(value: unknown): ParsedAppleHealthSync | null {
  const root = recordOf(value);
  const metrics = recordOf(root.data).metrics;
  if (!Array.isArray(metrics)) return null;

  const parsed = parseAutoExport(value);
  if (!parsed) return null;

  const ignored = new Set<string>();
  for (const rawMetric of metrics) {
    const metric = recordOf(rawMetric);
    const points = Array.isArray(metric.data) ? metric.data : [];
    if (!points.length) continue;
    const name = typeof metric.name === "string" ? metric.name : "";
    if (!isSupportedAutoExportMetric(name)) ignored.add(name || "unnamed");
  }

  return {
    payload: normalizeAppleHealthSyncPayload(parsed),
    ignoredMetricTypes: ignored.size,
    skippedSamples: parsed.skipped,
  };
}

/**
 * Merges overlapping two-day exports field by field. A steps-only day cannot
 * erase an earlier weight reading, and replaying the same export changes zero
 * records.
 */
export function mergeAppleHealthSyncPayload(
  currentValue: unknown,
  incomingValue: unknown,
): MergedAppleHealthSync {
  const current = normalizeAppleHealthSyncPayload(currentValue);
  const incoming = normalizeAppleHealthSyncPayload(incomingValue);
  const daily = new Map(current.dailyEntries.map((entry) => [entry.date, entry]));
  const sleep = new Map(current.sleepEntries.map((entry) => [entry.date, entry]));
  let changedDays = 0;
  let changedNights = 0;

  for (const entry of incoming.dailyEntries) {
    const before = daily.get(entry.date);
    const after = before ? { ...before, ...entry } : entry;
    if (JSON.stringify(before) !== JSON.stringify(after)) changedDays += 1;
    daily.set(entry.date, after);
  }

  for (const entry of incoming.sleepEntries) {
    const before = sleep.get(entry.date);
    const after = before ? { ...before, ...entry, source: "apple" as const } : entry;
    if (JSON.stringify(before) !== JSON.stringify(after)) changedNights += 1;
    sleep.set(entry.date, after);
  }

  return {
    payload: {
      dailyEntries: [...daily.values()].sort((a, b) => b.date.localeCompare(a.date)),
      sleepEntries: [...sleep.values()].sort((a, b) => b.date.localeCompare(a.date)),
    },
    changedDays,
    changedNights,
  };
}

export function emptyAppleHealthSyncPayload(): AppleHealthSyncPayload {
  return { dailyEntries: [], sleepEntries: [] };
}

function meaningfulDaily(entry: DailyEntry): boolean {
  return [
    entry.weightLb,
    entry.bodyFatPercent,
    entry.steps,
    entry.restingHeartRate,
    entry.hrvMs,
    entry.proteinG,
    entry.caloriesKcal,
    entry.medicationTaken,
    entry.meditationMinutes,
  ].some((value) => value !== null) || entry.journaled || Boolean(entry.meditationNote || entry.note);
}

function meaningfulSleep(entry: SleepEntry): boolean {
  return Boolean(entry.bedtime || entry.wakeTime || entry.note) || [
    entry.durationHours,
    entry.quality,
    entry.efficiencyPercent,
    entry.deepHours,
    entry.remHours,
    entry.restingHeartRate,
    entry.hrvMs,
  ].some((value) => value !== null);
}

/**
 * Version 7 displayed the Apple lane by composing it into the ordinary state,
 * so a later edit could persist that composed copy. Remove only values that
 * exactly match the authoritative overlay; a different manual value or note is
 * preserved. This makes the V8 lane split a migration rather than a promise
 * that applies only to new records.
 */
export function subtractAppleHealthSyncOverlay(state: HealthState, overlayValue: unknown): HealthState {
  const overlay = normalizeAppleHealthSyncPayload(overlayValue);
  const dailyByDate = new Map(overlay.dailyEntries.map((entry) => [entry.date, entry]));
  const sleepByDate = new Map(overlay.sleepEntries.map((entry) => [entry.date, entry]));

  const dailyEntries = state.dailyEntries.flatMap((entry) => {
    const automatic = dailyByDate.get(entry.date);
    if (!automatic) return [entry];
    const cleaned = { ...entry };
    for (const field of DAILY_FIELDS) {
      if (automatic[field] !== undefined && cleaned[field] === automatic[field]) cleaned[field] = null;
    }
    return meaningfulDaily(cleaned) ? [cleaned] : [];
  });

  const sleepEntries = state.sleepEntries.flatMap((entry) => {
    const automatic = entry.source === "apple" ? sleepByDate.get(entry.date) : undefined;
    if (!automatic) return [entry];
    const cleaned = { ...entry };
    for (const field of SLEEP_TEXT_FIELDS) {
      if (automatic[field] !== undefined && cleaned[field] === automatic[field]) cleaned[field] = "";
    }
    for (const field of SLEEP_NUMBER_FIELDS) {
      if (automatic[field] !== undefined && cleaned[field] === automatic[field]) cleaned[field] = null;
    }
    return meaningfulSleep(cleaned) ? [cleaned] : [];
  });

  return normalizeHealthState({ ...state, dailyEntries, sleepEntries });
}

export function generateAppleHealthSyncToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return `blh_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export async function hashAppleHealthSyncToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
