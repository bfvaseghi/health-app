export type ScaleValue = 1 | 2 | 3 | 4 | 5;
export type SleepSource = "manual" | "apple" | "oura" | "whoop" | "other";
export type WeightDirection = "lose" | "maintain" | "gain";

export type DailyEntry = {
  date: string;
  mood: ScaleValue | null;
  anxiety: ScaleValue | null;
  energy: ScaleValue | null;
  stress: ScaleValue | null;
  weightLb: number | null;
  steps: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  medicationTaken: boolean | null;
  journaled: boolean;
  therapy: boolean;
  exerciseMinutes: number | null;
  outdoorMinutes: number | null;
  caffeineMg: number | null;
  alcoholDrinks: number | null;
  note: string;
};

export type SleepEntry = {
  date: string;
  source: SleepSource;
  bedtime: string;
  wakeTime: string;
  durationHours: number | null;
  quality: ScaleValue | null;
  efficiencyPercent: number | null;
  deepHours: number | null;
  remHours: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  note: string;
};

export type LabResult = {
  id: string;
  name: string;
  date: string;
  value: number | null;
  unit: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  note: string;
};

export type GoalSettings = {
  sleepHours: number;
  sleepConsistencyMinutes: number;
  stepGoal: number;
  medicationDaysPerWeek: number;
  journalDaysPerWeek: number;
  therapySessionsPerMonth: number;
  exerciseDaysPerWeek: number;
  weightGoalLb: number | null;
  weightDirection: WeightDirection;
  caffeineGuideMg: number;
};

export type HealthState = {
  version: 2;
  updatedAt: string;
  dailyEntries: DailyEntry[];
  sleepEntries: SleepEntry[];
  labResults: LabResult[];
  goals: GoalSettings;
  /** Things to raise at the next session. */
  therapyTopics: TherapyTopic[];
  therapySessions: TherapySession[];
  journalEntries: JournalEntry[];
  thoughtRecords: ThoughtRecord[];
};

export type HealthSyncPacket = {
  kind: "bardia-health-sync";
  version: 1;
  generatedAt: string;
  source: string;
  dailyEntries: unknown[];
  sleepEntries: unknown[];
  labResults: unknown[];
};

export type GoalStatus = "good" | "watch" | "unknown";

export type GoalSummary = {
  id: "sleep" | "steps" | "medication" | "journal" | "therapy" | "weight";
  label: string;
  value: string;
  detail: string;
  progress: number | null;
  status: GoalStatus;
};

export type Insight = {
  id: string;
  title: string;
  body: string;
  tone: "positive" | "attention" | "neutral";
  destination: "overview" | "sleep" | "trends" | "records" | "settings";
};

const SOURCE_PRIORITY: Record<SleepSource, number> = {
  oura: 5,
  apple: 4,
  whoop: 3,
  manual: 2,
  other: 1,
};

export const STORAGE_KEY = "bardia-health-v1";

export const defaultGoals: GoalSettings = {
  sleepHours: 9,
  sleepConsistencyMinutes: 60,
  stepGoal: 8_000,
  medicationDaysPerWeek: 7,
  journalDaysPerWeek: 4,
  therapySessionsPerMonth: 4,
  exerciseDaysPerWeek: 3,
  weightGoalLb: null,
  weightDirection: "maintain",
  caffeineGuideMg: 400,
};

export function emptyHealthState(now = new Date()): HealthState {
  return {
    version: 2,
    updatedAt: now.toISOString(),
    dailyEntries: [],
    sleepEntries: [],
    labResults: [],
    goals: { ...defaultGoals },
    therapyTopics: [],
    therapySessions: [],
    journalEntries: [],
    thoughtRecords: [],
  };
}

export function emptyDailyEntry(date: string): DailyEntry {
  return {
    date: validIsoDate(date) ? date : todayLocal(),
    mood: null,
    anxiety: null,
    energy: null,
    stress: null,
    weightLb: null,
    steps: null,
    restingHeartRate: null,
    hrvMs: null,
    medicationTaken: null,
    journaled: false,
    therapy: false,
    exerciseMinutes: null,
    outdoorMinutes: null,
    caffeineMg: null,
    alcoholDrinks: null,
    note: "",
  };
}

export function emptySleepEntry(date: string): SleepEntry {
  return {
    date: validIsoDate(date) ? date : todayLocal(),
    source: "manual",
    bedtime: "",
    wakeTime: "",
    durationHours: null,
    quality: null,
    efficiencyPercent: null,
    deepHours: null,
    remHours: null,
    restingHeartRate: null,
    hrvMs: null,
    note: "",
  };
}

export {
  addDays,
  dateLabel,
  daysBetween,
  todayLocal,
  validIsoDate,
} from "./health-dates.ts";
import { addDays, daysBetween, todayLocal, validIsoDate } from "./health-dates.ts";
// Types and runtime values are imported separately: Node's type stripping
// leaves a plain `import { SomeType }` as a real runtime binding that does not
// exist, so type-only names must travel through `import type`.
import type {
  BriefVitals,
  JournalEntry,
  TherapySession,
  TherapyTopic,
  ThoughtRecord,
} from "./therapy-model.ts";
import {
  normalizeJournalEntry,
  normalizeTherapySession,
  normalizeTherapyTopic,
  normalizeThoughtRecord,
} from "./therapy-model.ts";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function finiteNumber(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  if (value === null || value === undefined || value === "") return null;
  let number: number;
  if (typeof value === "number") {
    number = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    number = Number(value.trim());
  } else {
    return null;
  }
  if (!Number.isFinite(number)) return null;
  return Math.min(maximum, Math.max(minimum, number));
}

function scaleValue(value: unknown): ScaleValue | null {
  const number = finiteNumber(value, 1, 5);
  return number === null ? null : (Math.round(number) as ScaleValue);
}

function booleanOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return null;
}

function safeText(value: unknown, maximum = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeTime(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
  return value;
}

function sleepSource(value: unknown): SleepSource {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "manual";
  return normalized === "apple" || normalized === "oura" || normalized === "whoop" || normalized === "other"
    ? normalized
    : "manual";
}

export function normalizeDailyEntry(value: unknown): DailyEntry | null {
  const entry = recordValue(value);
  if (!validIsoDate(entry.date)) return null;
  return {
    date: entry.date,
    mood: scaleValue(entry.mood),
    anxiety: scaleValue(entry.anxiety),
    energy: scaleValue(entry.energy),
    stress: scaleValue(entry.stress),
    weightLb: finiteNumber(entry.weightLb, 40, 1_000),
    steps: finiteNumber(entry.steps, 0, 200_000),
    restingHeartRate: finiteNumber(entry.restingHeartRate, 20, 250),
    hrvMs: finiteNumber(entry.hrvMs, 0, 500),
    medicationTaken: booleanOrNull(entry.medicationTaken),
    journaled: booleanOrNull(entry.journaled) ?? false,
    therapy: booleanOrNull(entry.therapy) ?? false,
    exerciseMinutes: finiteNumber(entry.exerciseMinutes, 0, 1_440),
    outdoorMinutes: finiteNumber(entry.outdoorMinutes, 0, 1_440),
    caffeineMg: finiteNumber(entry.caffeineMg, 0, 3_000),
    alcoholDrinks: finiteNumber(entry.alcoholDrinks, 0, 100),
    note: safeText(entry.note),
  };
}

export function normalizeSleepEntry(value: unknown): SleepEntry | null {
  const entry = recordValue(value);
  if (!validIsoDate(entry.date)) return null;
  return {
    date: entry.date,
    source: sleepSource(entry.source),
    bedtime: safeTime(entry.bedtime),
    wakeTime: safeTime(entry.wakeTime),
    durationHours: finiteNumber(entry.durationHours, 0, 24),
    quality: scaleValue(entry.quality),
    efficiencyPercent: finiteNumber(entry.efficiencyPercent, 0, 100),
    deepHours: finiteNumber(entry.deepHours, 0, 12),
    remHours: finiteNumber(entry.remHours, 0, 12),
    restingHeartRate: finiteNumber(entry.restingHeartRate, 20, 250),
    hrvMs: finiteNumber(entry.hrvMs, 0, 500),
    note: safeText(entry.note),
  };
}

export function normalizeLabResult(value: unknown): LabResult | null {
  const result = recordValue(value);
  if (!validIsoDate(result.date) || !safeText(result.name, 120)) return null;
  return {
    id: safeText(result.id, 120) || `${result.date}-${safeText(result.name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: safeText(result.name, 120),
    date: result.date,
    value: finiteNumber(result.value, -1_000_000, 1_000_000),
    unit: safeText(result.unit, 40),
    referenceLow: finiteNumber(result.referenceLow, -1_000_000, 1_000_000),
    referenceHigh: finiteNumber(result.referenceHigh, -1_000_000, 1_000_000),
    note: safeText(result.note, 1_000),
  };
}

export function normalizeGoals(value: unknown): GoalSettings {
  const goals = recordValue(value);
  const direction = goals.weightDirection;
  return {
    sleepHours: finiteNumber(goals.sleepHours, 4, 14) ?? defaultGoals.sleepHours,
    sleepConsistencyMinutes:
      finiteNumber(goals.sleepConsistencyMinutes, 15, 360) ?? defaultGoals.sleepConsistencyMinutes,
    stepGoal: Math.round(finiteNumber(goals.stepGoal, 0, 100_000) ?? defaultGoals.stepGoal),
    medicationDaysPerWeek: Math.round(
      finiteNumber(goals.medicationDaysPerWeek, 0, 7) ?? defaultGoals.medicationDaysPerWeek,
    ),
    journalDaysPerWeek: Math.round(
      finiteNumber(goals.journalDaysPerWeek, 0, 7) ?? defaultGoals.journalDaysPerWeek,
    ),
    therapySessionsPerMonth: Math.round(
      finiteNumber(goals.therapySessionsPerMonth, 0, 31) ?? defaultGoals.therapySessionsPerMonth,
    ),
    exerciseDaysPerWeek: Math.round(
      finiteNumber(goals.exerciseDaysPerWeek, 0, 7) ?? defaultGoals.exerciseDaysPerWeek,
    ),
    weightGoalLb: finiteNumber(goals.weightGoalLb, 40, 1_000),
    weightDirection: direction === "lose" || direction === "gain" ? direction : "maintain",
    caffeineGuideMg: Math.round(
      finiteNumber(goals.caffeineGuideMg, 0, 3_000) ?? defaultGoals.caffeineGuideMg,
    ),
  };
}

function newestIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export function normalizeHealthState(value: unknown): HealthState {
  const state = recordValue(value);
  const daily = Array.isArray(state.dailyEntries)
    ? state.dailyEntries.map(normalizeDailyEntry).filter((entry): entry is DailyEntry => Boolean(entry))
    : [];
  const sleep = Array.isArray(state.sleepEntries)
    ? state.sleepEntries.map(normalizeSleepEntry).filter((entry): entry is SleepEntry => Boolean(entry))
    : [];
  const labs = Array.isArray(state.labResults)
    ? state.labResults.map(normalizeLabResult).filter((result): result is LabResult => Boolean(result))
    : [];

  // A version 1 record predates therapy and journal storage; the missing
  // sections simply normalise to empty rather than failing to load.
  const list = <T>(value: unknown, normalize: (item: unknown) => T | null): T[] =>
    Array.isArray(value) ? value.map(normalize).filter((item): item is T => Boolean(item)) : [];

  const topics = list(state.therapyTopics, normalizeTherapyTopic);
  const sessions = list(state.therapySessions, normalizeTherapySession);
  const journal = list(state.journalEntries, normalizeJournalEntry);
  const thoughts = list(state.thoughtRecords, normalizeThoughtRecord);

  return {
    version: 2,
    updatedAt: newestIsoTimestamp(state.updatedAt),
    dailyEntries: dedupeByKey(daily, (entry) => entry.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 730),
    sleepEntries: dedupeByKey(sleep, (entry) => `${entry.date}:${entry.source}`).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1_460),
    labResults: dedupeByKey(labs, (result) => result.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500),
    goals: normalizeGoals(state.goals),
    therapyTopics: dedupeByKey(topics, (topic) => topic.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500),
    therapySessions: dedupeByKey(sessions, (session) => session.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 500),
    journalEntries: dedupeByKey(journal, (entry) => entry.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2_000),
    thoughtRecords: dedupeByKey(thoughts, (entry) => entry.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2_000),
  };
}

function dedupeByKey<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const current = key(value);
    if (seen.has(current)) return false;
    seen.add(current);
    return true;
  });
}

export function upsertDailyEntry(state: HealthState, value: unknown): HealthState {
  const entry = normalizeDailyEntry(value);
  if (!entry) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    dailyEntries: [entry, ...state.dailyEntries.filter((item) => item.date !== entry.date)],
  });
}

export function upsertSleepEntry(state: HealthState, value: unknown): HealthState {
  const entry = normalizeSleepEntry(value);
  if (!entry) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    sleepEntries: [
      entry,
      ...state.sleepEntries.filter((item) => item.date !== entry.date || item.source !== entry.source),
    ],
  });
}

export function upsertLabResult(state: HealthState, value: unknown): HealthState {
  const result = normalizeLabResult(value);
  if (!result) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    labResults: [result, ...state.labResults.filter((item) => item.id !== result.id)],
  });
}

export function mergeHealthSyncPacket(state: HealthState, value: unknown): HealthState {
  const packet = recordValue(value);
  if (packet.kind !== "bardia-health-sync" || packet.version !== 1) {
    throw new Error("This is not a Bardia Health sync file.");
  }

  let next = state;
  if (Array.isArray(packet.dailyEntries)) {
    for (const entry of packet.dailyEntries) next = upsertDailyEntry(next, entry);
  }
  if (Array.isArray(packet.sleepEntries)) {
    for (const entry of packet.sleepEntries) next = upsertSleepEntry(next, entry);
  }
  if (Array.isArray(packet.labResults)) {
    for (const result of packet.labResults) next = upsertLabResult(next, result);
  }
  return normalizeHealthState({ ...next, updatedAt: new Date().toISOString() });
}

/* --------------------------------------------- therapy and journal ---- */

function replaceById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [next, ...items];
  const copy = [...items];
  copy[index] = next;
  return copy;
}

export function upsertTherapyTopic(state: HealthState, value: unknown): HealthState {
  const topic = normalizeTherapyTopic(value);
  if (!topic) return state;
  return normalizeHealthState({ ...state, updatedAt: new Date().toISOString(), therapyTopics: replaceById(state.therapyTopics, topic) });
}

export function upsertTherapySession(state: HealthState, value: unknown): HealthState {
  const session = normalizeTherapySession(value);
  if (!session) return state;
  return normalizeHealthState({ ...state, updatedAt: new Date().toISOString(), therapySessions: replaceById(state.therapySessions, session) });
}

export function upsertJournalEntry(state: HealthState, value: unknown): HealthState {
  const entry = normalizeJournalEntry(value);
  if (!entry) return state;
  return normalizeHealthState({ ...state, updatedAt: new Date().toISOString(), journalEntries: replaceById(state.journalEntries, entry) });
}

export function upsertThoughtRecord(state: HealthState, value: unknown): HealthState {
  const entry = normalizeThoughtRecord(value);
  if (!entry) return state;
  return normalizeHealthState({ ...state, updatedAt: new Date().toISOString(), thoughtRecords: replaceById(state.thoughtRecords, entry) });
}

type TherapyCollection = "therapyTopics" | "therapySessions" | "journalEntries" | "thoughtRecords";

export function removeTherapyItem(state: HealthState, collection: TherapyCollection, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    [collection]: state[collection].filter((item: { id: string }) => item.id !== id),
  });
}

/** The lines written on the daily check-in, which the summary reads back. */
export function dayNotesInWindow(state: HealthState, from: string, to: string): { date: string; note: string }[] {
  return state.dailyEntries
    .filter((entry) => entry.date >= from && entry.date <= to && entry.note.trim() !== "")
    .map((entry) => ({ date: entry.date, note: entry.note }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Summarises the dashboard's own numbers for the session. This is what makes
 * keeping therapy notes inside the health app worth more than keeping them
 * beside it: the sleep and medication figures are already here.
 */
export function buildBriefVitals(state: HealthState, from: string, to: string): BriefVitals {
  const days = Math.max(0, daysBetween(from, to)) + 1;
  const daily = state.dailyEntries.filter((entry) => entry.date >= from && entry.date <= to);
  const sleep = preferredSleepEntries(state.sleepEntries.filter((entry) => entry.date >= from && entry.date <= to));

  const sleepHours = sleep.map((entry) => entry.durationHours).filter((value): value is number => value !== null);
  const medicationLogged = daily.filter((entry) => entry.medicationTaken !== null);
  const moods = daily.map((entry) => entry.mood).filter((value): value is ScaleValue => value !== null);
  const anxieties = daily.map((entry) => entry.anxiety).filter((value): value is ScaleValue => value !== null);
  const mean = (values: number[]) => (values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10);

  return {
    sleepAverage: mean(sleepHours),
    shortNights: sleepHours.filter((value) => value < 6).length,
    medicationTaken: medicationLogged.filter((entry) => entry.medicationTaken === true).length,
    medicationLogged: medicationLogged.length,
    moodAverage: mean(moods),
    anxietyAverage: mean(anxieties),
    daysLogged: daily.length,
    days,
  };
}

export function preferredSleepEntries(entries: SleepEntry[]): SleepEntry[] {
  const byDate = new Map<string, SleepEntry>();
  for (const entry of entries) {
    const current = byDate.get(entry.date);
    if (!current || SOURCE_PRIORITY[entry.source] > SOURCE_PRIORITY[current.source]) byDate.set(entry.date, entry);
  }
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function entriesInWindow<T extends { date: string }>(entries: T[], end: string, days: number): T[] {
  if (!validIsoDate(end)) return [];
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.trunc(days)) : 1;
  const start = addDays(end, -(windowDays - 1));
  return entries.filter((entry) => entry.date >= start && entry.date <= end);
}

function average(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatAverage(value: number | null, digits = 1): string {
  return value === null ? "No data" : value.toFixed(digits);
}

function goalProgress(value: number, goal: number): number {
  if (goal <= 0) return 1;
  return Math.max(0, Math.min(1, value / goal));
}

export function bedtimeMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const raw = hours * 60 + minutes;
  return raw < 12 * 60 ? raw + 24 * 60 : raw;
}

export function sleepConsistencyRange(entries: SleepEntry[]): number | null {
  const values = entries.map((entry) => bedtimeMinutes(entry.bedtime)).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

export function buildGoalSummaries(state: HealthState, asOf = todayLocal()): GoalSummary[] {
  const daily = entriesInWindow(state.dailyEntries, asOf, 7);
  const sleep = entriesInWindow(preferredSleepEntries(state.sleepEntries), asOf, 7);
  const sleepDurations = sleep.map((entry) => entry.durationHours);
  const sleepAverage = average(sleepDurations);
  const stepAverage = average(daily.map((entry) => entry.steps));
  const medicationLogged = daily.filter((entry) => entry.medicationTaken !== null);
  const medicationTaken = medicationLogged.filter((entry) => entry.medicationTaken).length;
  const journaled = daily.filter((entry) => entry.journaled).length;
  const month = asOf.slice(0, 7);
  const monthEntries = state.dailyEntries.filter(
    (entry) => entry.date <= asOf && entry.date.startsWith(month),
  );
  const therapy = monthEntries.filter((entry) => entry.therapy).length;
  const latestWeight = [...state.dailyEntries]
    .filter((entry) => entry.date <= asOf && entry.weightLb !== null)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightLb ?? null;
  const weightStatus: GoalStatus = (() => {
    const goal = state.goals.weightGoalLb;
    if (latestWeight === null || goal === null) return "unknown";
    if (state.goals.weightDirection === "lose") return latestWeight <= goal ? "good" : "watch";
    if (state.goals.weightDirection === "gain") return latestWeight >= goal ? "good" : "watch";
    return Math.abs(latestWeight - goal) <= 2 ? "good" : "watch";
  })();
  const nightsAtGoal = sleep.filter(
    (entry) => entry.durationHours !== null && entry.durationHours >= state.goals.sleepHours,
  ).length;

  return [
    {
      id: "sleep",
      label: "Sleep",
      value: sleepAverage === null ? "No data" : `${formatAverage(sleepAverage)} h`,
      detail: sleep.length ? `${nightsAtGoal} of ${sleep.length} nights at ${state.goals.sleepHours} hours` : "Add or sync a night",
      progress: sleepAverage === null ? null : goalProgress(sleepAverage, state.goals.sleepHours),
      status: sleepAverage === null ? "unknown" : sleepAverage >= state.goals.sleepHours - 0.25 ? "good" : "watch",
    },
    {
      id: "steps",
      label: "Steps",
      value: stepAverage === null ? "No data" : Math.round(stepAverage).toLocaleString("en-US"),
      detail: daily.some((entry) => entry.steps !== null)
        ? `Average across ${daily.filter((entry) => entry.steps !== null).length} recorded ${daily.filter((entry) => entry.steps !== null).length === 1 ? "day" : "days"} · goal ${state.goals.stepGoal.toLocaleString("en-US")}`
        : "Add or sync steps",
      progress: stepAverage === null ? null : goalProgress(stepAverage, state.goals.stepGoal),
      status: stepAverage === null ? "unknown" : stepAverage >= state.goals.stepGoal ? "good" : "watch",
    },
    {
      id: "medication",
      label: "Medication",
      value: `${medicationTaken} / ${state.goals.medicationDaysPerWeek}`,
      detail: medicationLogged.length
        ? `${medicationLogged.length} days recorded in the last 7 days`
        : "No days recorded",
      progress: medicationLogged.length ? goalProgress(medicationTaken, state.goals.medicationDaysPerWeek) : null,
      status: state.goals.medicationDaysPerWeek === 0
        ? "unknown"
        : medicationLogged.length < state.goals.medicationDaysPerWeek
          ? "unknown"
          : medicationTaken >= state.goals.medicationDaysPerWeek ? "good" : "watch",
    },
    {
      id: "journal",
      label: "Journaling",
      value: `${journaled} / ${state.goals.journalDaysPerWeek}`,
      detail: "days in the last 7 days",
      progress: daily.length ? goalProgress(journaled, state.goals.journalDaysPerWeek) : null,
      status: daily.length ? journaled >= state.goals.journalDaysPerWeek ? "good" : "watch" : "unknown",
    },
    {
      id: "therapy",
      label: "Therapy",
      value: `${therapy} / ${state.goals.therapySessionsPerMonth}`,
      detail: "sessions this month",
      progress: monthEntries.length ? goalProgress(therapy, state.goals.therapySessionsPerMonth) : null,
      status: monthEntries.length
        ? therapy >= state.goals.therapySessionsPerMonth ? "good" : "watch"
        : "unknown",
    },
    {
      id: "weight",
      label: "Weight",
      value: latestWeight === null ? "No data" : `${latestWeight.toFixed(1)} lb`,
      detail: state.goals.weightGoalLb === null ? "Set a goal to track direction" : `goal ${state.goals.weightGoalLb.toFixed(1)} lb`,
      progress: null,
      status: weightStatus,
    },
  ];
}

function metricAverage(entries: DailyEntry[], field: keyof DailyEntry): number | null {
  return average(entries.map((entry) => (typeof entry[field] === "number" ? (entry[field] as number) : null)));
}

export function compareDailyMetric(
  entries: DailyEntry[],
  field: keyof DailyEntry,
  asOf = todayLocal(),
  days = 7,
): { current: number | null; previous: number | null; change: number | null; currentCount: number; previousCount: number } {
  const currentEntries = entriesInWindow(entries, asOf, days);
  const previousEnd = addDays(asOf, -days);
  const previousEntries = entriesInWindow(entries, previousEnd, days);
  const current = metricAverage(currentEntries, field);
  const previous = metricAverage(previousEntries, field);
  return {
    current,
    previous,
    change: current === null || previous === null ? null : current - previous,
    currentCount: currentEntries.filter((entry) => typeof entry[field] === "number").length,
    previousCount: previousEntries.filter((entry) => typeof entry[field] === "number").length,
  };
}

export function buildInsights(state: HealthState, asOf = todayLocal()): Insight[] {
  const daily = entriesInWindow(state.dailyEntries, asOf, 7);
  const sleep = entriesInWindow(preferredSleepEntries(state.sleepEntries), asOf, 7);
  const insights: Insight[] = [];
  const sleepAverage = average(sleep.map((entry) => entry.durationHours));
  const regularity = sleepConsistencyRange(sleep);
  const mood = compareDailyMetric(state.dailyEntries, "mood", asOf, 7);
  const anxietyAverage = metricAverage(daily, "anxiety");
  const stepAverage = metricAverage(daily, "steps");
  const medicationLogged = daily.filter((entry) => entry.medicationTaken !== null);
  const missedMedication = medicationLogged.filter((entry) => entry.medicationTaken === false).length;
  const journaled = daily.filter((entry) => entry.journaled).length;

  if (!daily.length && !sleep.length) {
    return [{
      id: "first-data",
      title: "Build the baseline",
      body: "A few quick check-ins will show which habits actually move sleep, mood, and energy.",
      tone: "neutral",
      destination: "overview",
    }];
  }

  if (sleepAverage !== null && sleepAverage < state.goals.sleepHours - 0.5) {
    insights.push({
      id: "sleep-duration",
      title: "Protect sleep first",
      body: `Your recent average is ${sleepAverage.toFixed(1)} hours, ${Math.abs(state.goals.sleepHours - sleepAverage).toFixed(1)} below your goal.`,
      tone: "attention",
      destination: "sleep",
    });
  } else if (sleepAverage !== null) {
    insights.push({
      id: "sleep-duration-good",
      title: "Sleep duration is holding",
      body: `Your recent average is ${sleepAverage.toFixed(1)} hours against a ${state.goals.sleepHours}-hour goal.`,
      tone: "positive",
      destination: "sleep",
    });
  }

  if (regularity !== null && regularity > state.goals.sleepConsistencyMinutes) {
    insights.push({
      id: "sleep-regularity",
      title: "Bedtime is moving around",
      body: `Recent bedtimes span ${Math.round(regularity)} minutes. Your consistency guide is ${state.goals.sleepConsistencyMinutes} minutes.`,
      tone: "attention",
      destination: "sleep",
    });
  }

  if (medicationLogged.length >= 3 && missedMedication > 0) {
    insights.push({
      id: "medication",
      title: "Make medication automatic",
      body: `${missedMedication} recorded ${missedMedication === 1 ? "day was" : "days were"} missed in the last 7 days. Pair it with the same daily cue.`,
      tone: "attention",
      destination: "overview",
    });
  }

  if (mood.change !== null && mood.currentCount >= 3 && mood.previousCount >= 3 && mood.change <= -0.5) {
    insights.push({
      id: "mood-trend",
      title: "Mood has been lower",
      body: `Your 7-day mood average is ${Math.abs(mood.change).toFixed(1)} points below the prior week. Consider bringing the pattern to therapy.`,
      tone: "attention",
      destination: "trends",
    });
  }

  if (anxietyAverage !== null && anxietyAverage >= 4) {
    insights.push({
      id: "anxiety",
      title: "Anxiety is elevated",
      body: `Your recent average is ${anxietyAverage.toFixed(1)} out of 5. Add a short note about triggers so the pattern is easier to discuss.`,
      tone: "attention",
      destination: "trends",
    });
  }

  if (stepAverage !== null && stepAverage < state.goals.stepGoal * 0.75) {
    insights.push({
      id: "steps",
      title: "Movement has room to rise",
      body: `Your recent daily average is ${Math.round(stepAverage).toLocaleString("en-US")} steps. A short walk would close part of the gap without adding much friction.`,
      tone: "neutral",
      destination: "trends",
    });
  }

  if (journaled < state.goals.journalDaysPerWeek) {
    insights.push({
      id: "journal",
      title: "A short journal still counts",
      body: `${journaled} of ${state.goals.journalDaysPerWeek} planned days are recorded in the last 7 days. Two honest sentences are enough.`,
      tone: "neutral",
      destination: "overview",
    });
  }

  if (!insights.length) {
    insights.push({
      id: "first-data",
      title: "Build the baseline",
      body: "A few quick check-ins will show which habits actually move sleep, mood, and energy.",
      tone: "neutral",
      destination: "overview",
    });
  }

  return insights.slice(0, 3);
}

export function labRangeStatus(result: LabResult): "low" | "within" | "high" | "unrated" {
  if (result.value === null) return "unrated";
  if (
    result.referenceLow !== null &&
    result.referenceHigh !== null &&
    result.referenceLow > result.referenceHigh
  ) return "unrated";
  if (result.referenceLow !== null && result.value < result.referenceLow) return "low";
  if (result.referenceHigh !== null && result.value > result.referenceHigh) return "high";
  if (result.referenceLow !== null || result.referenceHigh !== null) return "within";
  return "unrated";
}

export function buildHealthSyncPrompt(days = 30): string {
  const safeDays = Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 30;
  const dayWord = safeDays === 1 ? "day" : "days";
  return `Use Health to retrieve my connected Apple Health, Oura, Whoop, and other wellness data for the last ${safeDays} ${dayWord}. Create a JSON file named bardia-health-sync.json. Use this exact top-level shape: {"kind":"bardia-health-sync","version":1,"generatedAt":"ISO timestamp","source":"Health in ChatGPT","dailyEntries":[],"sleepEntries":[],"labResults":[]}. For dailyEntries, include date plus available steps, weightLb, restingHeartRate, and hrvMs. For sleepEntries, make one record per local sleep date and source with date, source (apple, oura, whoop, manual, or other), bedtime and wakeTime as HH:MM, durationHours, quality from 1 to 5 only if directly supported, efficiencyPercent, deepHours, remHours, restingHeartRate, and hrvMs. Do not invent missing values. Use null or omit fields that Health does not provide. Preserve local dates and do not double-count overlapping sleep samples.`;
}
