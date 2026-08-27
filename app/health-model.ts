export type ScaleValue = 1 | 2 | 3 | 4 | 5;
export type SleepSource = "manual" | "apple" | "oura" | "whoop" | "other";
export type WeightDirection = "lose" | "maintain" | "gain";
export type ExerciseLoadMode = "loaded" | "bodyweight" | "assisted";

/** One day: what the devices reported, plus the few things worth a tap. */
export type DailyEntry = {
  date: string;
  weightLb: number | null;
  bodyFatPercent: number | null;
  steps: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  proteinG: number | null;
  caloriesKcal: number | null;
  medicationTaken: boolean | null;
  journaled: boolean;
  meditationMinutes: number | null;
  meditationNote: string;
  note: string;
};

/** One working set, as a lifting app records it. Rest rows are not sets. */
export type WorkoutSet = {
  date: string;
  /** Start of the session, so several workouts on one day stay distinct. */
  startedAt: string;
  workoutName: string;
  exercise: string;
  setNumber: number;
  weightLb: number | null;
  /** Explicit load meaning. Assistance gets easier as this number rises. */
  loadMode?: ExerciseLoadMode;
  assistanceLb?: number | null;
  reps: number | null;
  distance: number | null;
  seconds: number | null;
  rpe: number | null;
  /**
   * The rest timer Strong had set for this set, in seconds. It is the timer, not
   * a stopwatch on what you actually did — Strong records no per-set clock — so
   * treat it as the intent rather than the rest.
   */
  restSeconds: number | null;
  /** How long the whole session ran, repeated on each of its sets as Strong writes it. */
  durationSeconds: number | null;
};

/** Something to raise at the next session, and whether it has been raised. */
export type TherapyNote = {
  id: string;
  date: string;
  text: string;
  shared: boolean;
  sharedDate: string;
};

/** A private free-form reflection, kept separate from the therapy agenda. */
export type ThoughtJournalEntry = {
  id: string;
  date: string;
  text: string;
  source: "manual" | "apple-notes";
  title: string;
  createdAt: string;
};

/**
 * A progress photo's record. The image itself is not here: photos live in this
 * device's own storage, and only what describes them is synced.
 */
export type ProgressPhoto = {
  id: string;
  date: string;
  weightLb: number | null;
  bodyFatPercent: number | null;
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

/** The only targets this app holds. */
/**
 * A medication you are on, and how often it is due.
 *
 * Named and separate rather than one "did you take it" for everything: a
 * finasteride, a fluoxetine and a semaglutide are three different questions
 * with three different answers, and a single tick could only ever be a lie
 * about two of them.
 */
export type Medication = {
  id: string;
  name: string;
  /**
   * Daily or weekly. A weekly injection is not missed on the six days it is
   * not due, and a tracker that says otherwise is one you stop believing.
   */
  schedule: MedicationSchedule;
  /** For a weekly medication: the day it is due, 0 = Sunday. */
  dueDay: number | null;
  /** Kept, but no longer asked about. */
  archived: boolean;
};

export type MedicationSchedule = "daily" | "weekly";

/** One medication, one day, taken or not. */
export type MedicationDose = {
  medicationId: string;
  date: string;
  taken: boolean;
};

export type GoalSettings = {
  sleepHours: number;
  sleepConsistencyMinutes: number;
  trackMedication: boolean;
  weightGoalLb: number | null;
  weightDirection: WeightDirection;
  proteinTargetG: number | null;
  bodyFatTargetPercent: number | null;
  /**
   * Sessions you want in each week of the training block, one entry per week.
   * A zero means "whatever the data suggests"; you set a number when you know
   * a particular week is short on time.
   */
  trainingDays: number[];
  /**
   * Lifts you added to a week yourself, because the coach said a muscle was
   * short and you picked what to do about it. Kept against the Monday of the
   * week they belong to, so last week's additions do not follow you into this
   * one.
   */
  addedSets: AddedSet[];
  /** Monday the current four-week training block was deliberately anchored. */
  trainingBlockStart: string;
  /** Frozen direct-set baseline by muscle for this block. */
  trainingAnchorSets: Record<string, number>;
};

/** One change you made to one lift in one session of one week. */
export type AddedSet = {
  /** Monday of the week it belongs to, as an ISO date. */
  weekStart: string;
  /** The session it applies to, by name. */
  session: string;
  /** Spelled as Strong spells it, like everything else in a plan. */
  exercise: string;
  /** Sets to add, or to take off when negative. Never zero. */
  sets: number;
};

export type HealthState = {
  version: 1;
  updatedAt: string;
  medications: Medication[];
  medicationDoses: MedicationDose[];
  dailyEntries: DailyEntry[];
  sleepEntries: SleepEntry[];
  labResults: LabResult[];
  workoutSets: WorkoutSet[];
  therapyNotes: TherapyNote[];
  thoughtJournal: ThoughtJournalEntry[];
  progressPhotos: ProgressPhoto[];
  goals: GoalSettings;
};




const DAY_MS = 86_400_000;
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
  trackMedication: true,
  weightGoalLb: null,
  weightDirection: "maintain",
  proteinTargetG: null,
  bodyFatTargetPercent: null,
  trainingDays: [],
  addedSets: [],
  trainingBlockStart: "",
  trainingAnchorSets: {},
};

export function emptyHealthState(now = new Date()): HealthState {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    medications: [],
    medicationDoses: [],
    dailyEntries: [],
    sleepEntries: [],
    labResults: [],
    workoutSets: [],
    therapyNotes: [],
    thoughtJournal: [],
    progressPhotos: [],
    goals: { ...defaultGoals },
  };
}

export function emptyDailyEntry(date: string): DailyEntry {
  return {
    date: validIsoDate(date) ? date : todayLocal(),
    weightLb: null,
    bodyFatPercent: null,
    steps: null,
    restingHeartRate: null,
    hrvMs: null,
    proteinG: null,
    caloriesKcal: null,
    medicationTaken: null,
    journaled: false,
    meditationMinutes: null,
    meditationNote: "",
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

export function todayLocal(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Manual health entry is rejected, never silently clamped into a different fact. */
export function validateDailyEntry(entry: DailyEntry, asOf = todayLocal()): string | null {
  if (!validIsoDate(entry.date) || entry.date > asOf) return "Choose today or an earlier date.";
  if (entry.weightLb !== null && (entry.weightLb < 40 || entry.weightLb > 1_000)) return "Weight must be between 40 and 1,000 lb.";
  if (entry.bodyFatPercent !== null && (entry.bodyFatPercent < 3 || entry.bodyFatPercent > 60)) return "Body fat must be between 3% and 60%.";
  if (entry.proteinG !== null && (entry.proteinG < 0 || entry.proteinG > 500)) return "Protein must be between 0 and 500 g.";
  const meaningful = entry.weightLb !== null || entry.bodyFatPercent !== null || entry.proteinG !== null || entry.note.trim() !== "";
  return meaningful ? null : "Add at least one value or note before saving this check-in.";
}

export function validateSleepEntry(entry: SleepEntry, asOf = todayLocal()): string | null {
  if (!validIsoDate(entry.date) || entry.date > asOf) return "Choose today or an earlier wake date.";
  if (entry.durationHours === null && (!entry.bedtime || !entry.wakeTime)) return "Add a duration or both bedtime and wake time.";
  if (entry.bedtime && entry.wakeTime && entry.bedtime === entry.wakeTime) return "Bedtime and wake time cannot be the same.";
  if (entry.durationHours !== null && (entry.durationHours < 1 || entry.durationHours > 18)) return "Sleep duration must be between 1 and 18 hours.";
  if (entry.deepHours !== null && (entry.deepHours < 0 || entry.deepHours > 12)) return "Deep sleep must be between 0 and 12 hours.";
  if (entry.remHours !== null && (entry.remHours < 0 || entry.remHours > 12)) return "REM sleep must be between 0 and 12 hours.";
  if (entry.durationHours !== null && (entry.deepHours ?? 0) + (entry.remHours ?? 0) > entry.durationHours) {
    return "Deep and REM sleep cannot add up to more than total sleep.";
  }
  return null;
}

export function validateMedication(medication: Medication): string | null {
  if (!medication.name.trim()) return "Enter a medication name.";
  if (medication.name.trim().length > 80) return "Medication name must be 80 characters or fewer.";
  if (medication.schedule === "weekly" && (medication.dueDay === null || medication.dueDay < 0 || medication.dueDay > 6)) {
    return "Choose the day this medication is due.";
  }
  return null;
}

export function validateLabResult(result: LabResult, asOf = todayLocal()): string | null {
  if (!result.name.trim()) return "Enter the test name.";
  if (!validIsoDate(result.date) || result.date > asOf) return "Choose today or an earlier result date.";
  if (result.value === null) return "Enter the result value.";
  if (result.referenceLow !== null && result.referenceHigh !== null && result.referenceLow > result.referenceHigh) {
    return "The reference low cannot be greater than the reference high.";
  }
  return null;
}

export function addDays(value: string, amount: number): string {
  const safe = validIsoDate(value) ? value : todayLocal();
  const [year, month, day] = safe.split("-").map(Number);
  const safeAmount = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  const date = new Date(Date.UTC(year, month - 1, day + safeAmount));
  return date.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  if (!validIsoDate(a) || !validIsoDate(b)) return 0;
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function dateLabel(value: string, options?: Intl.DateTimeFormatOptions): string {
  if (!validIsoDate(value)) return "Unknown date";
  const [year, month, day] = value.split("-").map(Number);
  const formatOptions = options ?? { month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", {
    ...formatOptions,
    timeZone: formatOptions.timeZone ?? "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

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
  // Fields from older versions of this app are dropped here rather than carried.
  return {
    date: entry.date,
    weightLb: finiteNumber(entry.weightLb, 40, 1_000),
    bodyFatPercent: finiteNumber(entry.bodyFatPercent, 1, 70),
    steps: finiteNumber(entry.steps, 0, 200_000),
    restingHeartRate: finiteNumber(entry.restingHeartRate, 20, 250),
    hrvMs: finiteNumber(entry.hrvMs, 0, 500),
    proteinG: finiteNumber(entry.proteinG, 0, 1_000),
    caloriesKcal: finiteNumber(entry.caloriesKcal, 0, 20_000),
    medicationTaken: booleanOrNull(entry.medicationTaken),
    journaled: booleanOrNull(entry.journaled) ?? false,
    meditationMinutes: finiteNumber(entry.meditationMinutes, 0, 1_440),
    meditationNote: safeText(entry.meditationNote),
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

export function normalizeWorkoutSet(value: unknown): WorkoutSet | null {
  const entry = recordValue(value);
  if (!validIsoDate(entry.date)) return null;
  // Strong marks a lift that was part of a superset with a leading asterisk.
  // It is a note about the sitting, not part of the lift's name, and leaving it
  // on splits one exercise's history into two.
  const exercise = safeText(entry.exercise, 160).replace(/^\*+\s*/, "").trim();
  if (!exercise) return null;
  const setNumber = finiteNumber(entry.setNumber, 1, 200);
  if (setNumber === null) return null;
  const rawWeight = finiteNumber(entry.weightLb, -2_000, 2_000);
  const explicitMode = entry.loadMode === "assisted" || entry.loadMode === "bodyweight" || entry.loadMode === "loaded"
    ? entry.loadMode
    : null;
  const loadMode: ExerciseLoadMode = explicitMode ?? (
    /assisted/i.test(exercise) || (rawWeight !== null && rawWeight < 0)
      ? "assisted"
      : rawWeight === null || rawWeight === 0
        ? "bodyweight"
        : "loaded"
  );
  const assistance = finiteNumber(entry.assistanceLb, 0, 2_000)
    ?? (loadMode === "assisted" && rawWeight !== null ? Math.abs(rawWeight) : null);
  return {
    date: entry.date,
    startedAt: safeText(entry.startedAt, 40) || entry.date,
    workoutName: safeText(entry.workoutName, 120),
    exercise,
    setNumber: Math.round(setNumber),
    weightLb: loadMode === "loaded" ? finiteNumber(rawWeight, 0, 2_000) : null,
    loadMode,
    assistanceLb: loadMode === "assisted" ? assistance : null,
    reps: finiteNumber(entry.reps, 0, 1_000),
    distance: finiteNumber(entry.distance, 0, 1_000_000),
    seconds: finiteNumber(entry.seconds, 0, 86_400),
    rpe: finiteNumber(entry.rpe, 1, 10),
    restSeconds: finiteNumber(entry.restSeconds, 0, 3_600),
    durationSeconds: finiteNumber(entry.durationSeconds, 0, 86_400),
  };
}

export function normalizeTherapyNote(value: unknown): TherapyNote | null {
  const note = recordValue(value);
  const text = safeText(note.text, 2_000);
  if (!text) return null;
  const date = validIsoDate(note.date) ? note.date : todayLocal();
  return {
    id: safeText(note.id, 120) || `${date}-${Math.abs(hashText(text)).toString(36)}`,
    date,
    text,
    shared: booleanOrNull(note.shared) ?? false,
    sharedDate: validIsoDate(note.sharedDate) ? note.sharedDate : "",
  };
}

export function normalizeThoughtJournalEntry(value: unknown): ThoughtJournalEntry | null {
  const entry = recordValue(value);
  const text = safeText(entry.text, 10_000);
  if (!text) return null;
  const date = validIsoDate(entry.date) ? entry.date : todayLocal();
  const source = entry.source === "apple-notes" ? "apple-notes" : "manual";
  const createdAt = typeof entry.createdAt === "string" && Number.isFinite(Date.parse(entry.createdAt))
    ? new Date(entry.createdAt).toISOString()
    : `${date}T12:00:00.000Z`;
  return {
    id: safeText(entry.id, 160) || `thought-${date}-${Math.abs(hashText(`${source}:${text}`)).toString(36)}`,
    date,
    text,
    source,
    title: safeText(entry.title, 160),
    createdAt,
  };
}

export function normalizeProgressPhoto(value: unknown): ProgressPhoto | null {
  const photo = recordValue(value);
  const id = safeText(photo.id, 120);
  if (!id || !validIsoDate(photo.date)) return null;
  return {
    id,
    date: photo.date,
    weightLb: finiteNumber(photo.weightLb, 40, 1_000),
    bodyFatPercent: finiteNumber(photo.bodyFatPercent, 1, 70),
    note: safeText(photo.note, 500),
  };
}

/** Small stable hash, only used to give an id to a note that arrived without one. */
function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
}

export function normalizeGoals(value: unknown): GoalSettings {
  const goals = recordValue(value);
  const direction = goals.weightDirection;
  // Goals removed in an earlier version are simply dropped here; a saved state
  // that still carries them stays loadable.
  return {
    sleepHours: finiteNumber(goals.sleepHours, 4, 14) ?? defaultGoals.sleepHours,
    sleepConsistencyMinutes:
      finiteNumber(goals.sleepConsistencyMinutes, 15, 360) ?? defaultGoals.sleepConsistencyMinutes,
    trackMedication: booleanOrNull(goals.trackMedication) ?? defaultGoals.trackMedication,
    weightGoalLb: finiteNumber(goals.weightGoalLb, 40, 1_000),
    weightDirection: direction === "lose" || direction === "gain" ? direction : "maintain",
    proteinTargetG: finiteNumber(goals.proteinTargetG, 0, 1_000),
    bodyFatTargetPercent: finiteNumber(goals.bodyFatTargetPercent, 1, 70),
    trainingDays: Array.isArray(goals.trainingDays)
      ? goals.trainingDays.slice(0, 8).map((value) => {
          const days = finiteNumber(value, 0, 7);
          return days === null || days < 2 ? 0 : Math.min(4, Math.round(days));
        })
      : [],
    addedSets: normalizeAddedSets(goals.addedSets),
    trainingBlockStart: validIsoDate(goals.trainingBlockStart) ? goals.trainingBlockStart : "",
    trainingAnchorSets: Object.fromEntries(
      Object.entries(recordValue(goals.trainingAnchorSets))
        .map(([key, value]) => [key, finiteNumber(value, 0, 30)] as const)
        .filter((entry): entry is [string, number] => entry[1] !== null),
    ),
  };
}

/**
 * Changes made by hand, cleaned up on the way in.
 *
 * De-duplicated because this is the one part of the goals a button writes to
 * rather than a settings form. A change of nothing is dropped rather than
 * stored, so pressing plus and then minus leaves no trace. We intentionally do
 * not cap the list: silently losing the 41st deliberate adjustment is worse
 * than retaining a few extra small records.
 */
function normalizeAddedSets(value: unknown): AddedSet[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const found: AddedSet[] = [];
  for (const item of value) {
    const entry = recordValue(item);
    const weekStart = validIsoDate(entry.weekStart) ? entry.weekStart : "";
    const session = typeof entry.session === "string" ? entry.session.trim().slice(0, 80) : "";
    const exercise = typeof entry.exercise === "string" ? entry.exercise.trim().slice(0, 120) : "";
    const sets = finiteNumber(entry.sets, -5, 5);
    if (!weekStart || !session || !exercise || sets === null || Math.round(sets) === 0) continue;
    const key = `${weekStart}:${session}:${exercise}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ weekStart, session, exercise, sets: Math.round(sets) });
  }
  return found;
}

/**
 * What the single daily tick becomes when a record written before medications
 * had names is opened.
 */
const LEGACY_MEDICATION: Medication = {
  id: "medication",
  name: "Medication",
  schedule: "daily",
  dueDay: null,
  archived: false,
};

/** A medication a person would recognise, or nothing. */
function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "med";
}
/** Adds or replaces a medication, keeping the list in the order it was built. */
export function upsertMedication(state: HealthState, medication: Medication): HealthState {
  const rest = state.medications.filter((entry) => entry.id !== medication.id);
  const at = state.medications.findIndex((entry) => entry.id === medication.id);
  const medications = at >= 0
    ? [...state.medications.slice(0, at), medication, ...state.medications.slice(at + 1)]
    : [...rest, medication];
  return { ...state, medications, updatedAt: new Date().toISOString() };
}

/** Removes a medication and everything recorded against it. */
export function removeMedication(state: HealthState, id: string): HealthState {
  return {
    ...state,
    medications: state.medications.filter((entry) => entry.id !== id),
    medicationDoses: state.medicationDoses.filter((dose) => dose.medicationId !== id),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Records one day's answer, or takes it back.
 *
 * Null clears it: a day you have not answered and a day you answered "missed"
 * are different things, and pressing a button twice should be able to undo it.
 */
export function recordDose(
  state: HealthState,
  medicationId: string,
  date: string,
  taken: boolean | null,
): HealthState {
  const rest = state.medicationDoses.filter(
    (dose) => !(dose.medicationId === medicationId && dose.date === date),
  );
  return {
    ...state,
    medicationDoses: taken === null
      ? rest
      : [{ medicationId, date, taken }, ...rest].sort(
          (a, b) => b.date.localeCompare(a.date) || a.medicationId.localeCompare(b.medicationId),
        ),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeMedication(value: unknown): Medication | null {
  const entry = recordValue(value);
  const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 80) : "";
  if (!name) return null;
  const schedule = entry.schedule === "weekly" ? "weekly" : "daily";
  const day = finiteNumber(entry.dueDay, 0, 6);
  return {
    id: typeof entry.id === "string" && entry.id.trim() ? entry.id.trim().slice(0, 80) : slug(name),
    name,
    schedule,
    // A weekly medication is due on a day; a daily one is due every day, and
    // carrying a day for it would be a number nothing reads.
    dueDay: schedule === "weekly" ? (day === null ? 1 : Math.round(day)) : null,
    archived: booleanOrNull(entry.archived) ?? false,
  };
}

function normalizeMedications(value: unknown): Medication[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const found: Medication[] = [];
  for (const item of value) {
    const medication = normalizeMedication(item);
    if (!medication || seen.has(medication.id)) continue;
    seen.add(medication.id);
    found.push(medication);
  }
  return found;
}

function normalizeDoses(value: unknown, known: Set<string>): MedicationDose[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const found: MedicationDose[] = [];
  for (const item of value) {
    const entry = recordValue(item);
    const medicationId = typeof entry.medicationId === "string" ? entry.medicationId.trim() : "";
    const date = validIsoDate(entry.date) ? entry.date : "";
    const taken = booleanOrNull(entry.taken);
    // A dose for a medication that is gone is a dose about nothing.
    if (!medicationId || !date || taken === null || !known.has(medicationId)) continue;
    const key = `${medicationId}:${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ medicationId, date, taken });
  }
  return found.sort((a, b) => b.date.localeCompare(a.date) || a.medicationId.localeCompare(b.medicationId));
}

function newestIsoTimestamp(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

/**
 * Keys earlier versions of this app wrote onto a stored record. Normalization
 * already drops them on the way in, but a payload sitting in the database keeps
 * them until something rewrites it, which is what the purge is for.
 */
const retiredDailyFields = [
  "mood",
  "anxiety",
  "energy",
  "stress",
  "therapy",
  "exerciseMinutes",
  "outdoorMinutes",
  "caffeineMg",
  "alcoholDrinks",
];

const retiredGoalFields = [
  "stepGoal",
  "medicationDaysPerWeek",
  "journalDaysPerWeek",
  "therapySessionsPerMonth",
  "exerciseDaysPerWeek",
  "caffeineGuideMg",
];

export type RetiredData = {
  /** Distinct retired field names present, sorted. */
  fields: string[];
  /** Daily records carrying at least one of them. */
  records: number;
};

/**
 * Looks for retired fields in a raw stored payload. A key counts even when its
 * value is null: the name is still written in the database.
 */
export function findRetiredFields(value: unknown): RetiredData {
  const state = recordValue(value);
  const found = new Set<string>();
  let records = 0;

  if (Array.isArray(state.dailyEntries)) {
    for (const entry of state.dailyEntries) {
      const record = recordValue(entry);
      let carries = false;
      for (const field of retiredDailyFields) {
        if (field in record) {
          found.add(field);
          carries = true;
        }
      }
      if (carries) records += 1;
    }
  }

  const goals = recordValue(state.goals);
  for (const field of retiredGoalFields) {
    if (field in goals) found.add(field);
  }

  return { fields: [...found].sort(), records };
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

  const workouts = Array.isArray(state.workoutSets)
    ? state.workoutSets.map(normalizeWorkoutSet).filter((entry): entry is WorkoutSet => Boolean(entry))
    : [];
  const therapy = Array.isArray(state.therapyNotes)
    ? state.therapyNotes.map(normalizeTherapyNote).filter((note): note is TherapyNote => Boolean(note))
    : [];
  const thoughts = Array.isArray(state.thoughtJournal)
    ? state.thoughtJournal.map(normalizeThoughtJournalEntry).filter((entry): entry is ThoughtJournalEntry => Boolean(entry))
    : [];
  const photos = Array.isArray(state.progressPhotos)
    ? state.progressPhotos.map(normalizeProgressPhoto).filter((photo): photo is ProgressPhoto => Boolean(photo))
    : [];

  // Medications first: a dose is only meaningful against one that exists.
  const medications = normalizeMedications(state.medications);
  // Every record written before medications had names carried one tick a day.
  // It becomes a medication called what it was, so a year of ticks survives
  // the change rather than being thrown away by it.
  const legacy = daily.filter((entry) => entry.medicationTaken !== null);
  if (legacy.length && !medications.some((entry) => entry.id === LEGACY_MEDICATION.id)) {
    medications.unshift({ ...LEGACY_MEDICATION });
  }
  const known = new Set(medications.map((entry) => entry.id));
  const carried = legacy.map((entry) => ({
    medicationId: LEGACY_MEDICATION.id,
    date: entry.date,
    taken: entry.medicationTaken === true,
  }));

  return {
    version: 1,
    updatedAt: newestIsoTimestamp(state.updatedAt),
    medications,
    // What was already recorded against a medication wins over what is being
    // carried across, so a migrated day is never resurrected over an edit.
    medicationDoses: dedupeByKey(
      [...normalizeDoses(state.medicationDoses, known), ...normalizeDoses(carried, known)],
      (dose) => `${dose.medicationId}:${dose.date}`,
    )
      .sort((a, b) => b.date.localeCompare(a.date) || a.medicationId.localeCompare(b.medicationId)),
    dailyEntries: dedupeByKey(daily, (entry) => entry.date).sort((a, b) => b.date.localeCompare(a.date)),
    sleepEntries: dedupeByKey(sleep, (entry) => `${entry.date}:${entry.source}`).sort((a, b) => b.date.localeCompare(a.date)),
    labResults: dedupeByKey(labs, (result) => result.id).sort((a, b) => b.date.localeCompare(a.date)),
    workoutSets: dedupeByKey(workouts, (entry) => `${entry.startedAt}:${entry.exercise}:${entry.setNumber}`)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.exercise.localeCompare(b.exercise) || a.setNumber - b.setNumber),
    therapyNotes: dedupeByKey(therapy, (note) => note.id).sort((a, b) => b.date.localeCompare(a.date)),
    thoughtJournal: dedupeByKey(thoughts, (entry) => entry.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date)),
    progressPhotos: dedupeByKey(photos, (photo) => photo.id).sort((a, b) => b.date.localeCompare(a.date)),
    goals: normalizeGoals(state.goals),
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

export type ImportRecords = {
  dailyEntries: unknown[];
  sleepEntries: unknown[];
  labResults: unknown[];
  workoutSets: unknown[];
  /** A complete Strong export owns lifting history and replaces older imports. */
  replaceWorkoutHistory?: boolean;
};

/** Keys an import did not actually provide, so a partial file cannot blank a field. */
function providedOnly(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ""),
  );
}

/**
 * Folds imported records into the state in a single pass. Fields are merged
 * rather than replaced: a file that only carries steps must not wipe the
 * medication and weight already recorded for that day.
 */
export function mergeRecords(state: HealthState, records: Partial<ImportRecords>): HealthState {
  const daily = new Map(state.dailyEntries.map((entry) => [entry.date, entry]));
  const sleep = new Map(state.sleepEntries.map((entry) => [`${entry.date}:${entry.source}`, entry]));
  const labs = new Map(state.labResults.map((result) => [result.id, result]));

  for (const value of records.dailyEntries ?? []) {
    const incoming = providedOnly(recordValue(value));
    if (!validIsoDate(incoming.date)) continue;
    const merged = normalizeDailyEntry({ ...(daily.get(incoming.date) ?? emptyDailyEntry(incoming.date)), ...incoming });
    if (merged) daily.set(merged.date, merged);
  }

  for (const value of records.sleepEntries ?? []) {
    const incoming = providedOnly(recordValue(value));
    if (!validIsoDate(incoming.date)) continue;
    const candidate = normalizeSleepEntry(incoming);
    if (!candidate) continue;
    const key = `${candidate.date}:${candidate.source}`;
    const merged = normalizeSleepEntry({
      ...(sleep.get(key) ?? emptySleepEntry(candidate.date)),
      ...incoming,
      source: candidate.source,
    });
    if (merged) sleep.set(key, merged);
  }

  for (const value of records.labResults ?? []) {
    const merged = normalizeLabResult(value);
    if (merged) labs.set(merged.id, merged);
  }

  const workouts = new Map(
    records.replaceWorkoutHistory
      ? []
      : state.workoutSets.map((entry) => [`${entry.startedAt}:${entry.exercise}:${entry.setNumber}`, entry]),
  );
  for (const value of records.workoutSets ?? []) {
    const merged = normalizeWorkoutSet(value);
    if (merged) workouts.set(`${merged.startedAt}:${merged.exercise}:${merged.setNumber}`, merged);
  }

  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    dailyEntries: [...daily.values()],
    sleepEntries: [...sleep.values()],
    labResults: [...labs.values()],
    workoutSets: [...workouts.values()],
  });
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

/** Adherence over the days that were actually recorded, not over the calendar. */
/**
 * Whether a medication is due on a given day.
 *
 * A weekly injection is not missed on the six days it is not due. A tracker
 * that marks those days red is one you stop reading, and then it is not a
 * tracker.
 */
export function isDue(medication: Medication, date: string): boolean {
  if (medication.archived) return false;
  if (medication.schedule === "daily") return true;
  return new Date(`${date}T12:00:00Z`).getUTCDay() === medication.dueDay;
}

/** Every day in the window on which this medication was actually due. */
function dueDates(medication: Medication, asOf: string, days: number): string[] {
  const found: string[] = [];
  for (let back = 0; back < Math.max(1, days); back += 1) {
    const date = addDays(asOf, -back);
    if (isDue(medication, date)) found.push(date);
  }
  return found;
}

export type MedicationStatus = {
  medication: Medication;
  /** Due today, and answered or not. */
  dueToday: boolean;
  today: boolean | null;
  /** Over the days it was due in the window. */
  taken: number;
  missed: number;
  /** Doses expected in the selected window, whether answered or not. */
  due: number;
  /** Due doses that still have no answer. */
  unanswered: number;
  recorded: number;
  percent: number | null;
  /** Consecutive due days taken, ending at the last one that has been answered. */
  streak: number;
  /** The next day it is due, when it is not due today. */
  nextDue: string | null;
};

/** One medication, read against the days it was actually due. */
export function medicationStatus(
  state: HealthState,
  medication: Medication,
  asOf = todayLocal(),
  days = 30,
): MedicationStatus {
  const answers = new Map(
    state.medicationDoses
      .filter((dose) => dose.medicationId === medication.id)
      .map((dose) => [dose.date, dose.taken] as const),
  );
  const due = dueDates(medication, asOf, days);
  const recorded = due.filter((date) => answers.has(date));
  const taken = recorded.filter((date) => answers.get(date) === true).length;

  // The streak runs back from the most recent due day that has an answer, so
  // an unanswered today does not read as a broken run.
  let streak = 0;
  for (const date of due) {
    const answer = answers.get(date);
    if (answer === undefined) {
      if (streak === 0 && date === asOf) continue;
      break;
    }
    if (!answer) break;
    streak += 1;
  }

  let nextDue: string | null = null;
  if (!isDue(medication, asOf)) {
    for (let ahead = 1; ahead <= 7; ahead += 1) {
      const date = addDays(asOf, ahead);
      if (isDue(medication, date)) {
        nextDue = date;
        break;
      }
    }
  }

  return {
    medication,
    dueToday: isDue(medication, asOf),
    today: answers.get(asOf) ?? null,
    taken,
    missed: recorded.length - taken,
    due: due.length,
    unanswered: due.length - recorded.length,
    recorded: recorded.length,
    percent: recorded.length ? Math.round((taken / recorded.length) * 100) : null,
    streak,
    nextDue,
  };
}

/** Every medication still being asked about, read the same way. */
export function medicationStatuses(
  state: HealthState,
  asOf = todayLocal(),
  days = 30,
): MedicationStatus[] {
  return state.medications
    .filter((medication) => !medication.archived)
    .map((medication) => medicationStatus(state, medication, asOf, days));
}

/** Everything due today that has not been answered yet. */
export function dueToday(state: HealthState, asOf = todayLocal()): MedicationStatus[] {
  return medicationStatuses(state, asOf).filter((status) => status.dueToday && status.today === null);
}

/**
 * Adherence across every medication, over the days each was due.
 *
 * Counted per dose rather than per day: a week in which the daily tablet was
 * taken every day and the weekly injection was skipped is not a perfect week.
 */
export function medicationAdherence(
  state: HealthState,
  asOf = todayLocal(),
  days = 14,
): { taken: number; missed: number; unanswered: number; due: number; recorded: number; percent: number | null; coveragePercent: number | null } {
  let taken = 0;
  let recorded = 0;
  let due = 0;
  for (const status of medicationStatuses(state, asOf, days)) {
    taken += status.taken;
    recorded += status.recorded;
    due += status.due;
  }
  return {
    taken,
    missed: recorded - taken,
    unanswered: due - recorded,
    due,
    recorded,
    percent: recorded ? Math.round((taken / recorded) * 100) : null,
    coveragePercent: due ? Math.round((recorded / due) * 100) : null,
  };
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

export function latestRecordDate(state: HealthState): string | null {
  const dates = [
    state.dailyEntries[0]?.date,
    preferredSleepEntries(state.sleepEntries)[0]?.date,
    // Training counts. Someone whose only import is a Strong export has a
    // record, and telling them the app is empty is plainly wrong.
    state.workoutSets.length
      ? state.workoutSets.reduce((latest, entry) => (entry.date > latest ? entry.date : latest), "")
      : undefined,
    // So does a medication answered. Someone who has only ticked off today's
    // tablets has a record, and Today should be the day, not the import screen.
    state.medicationDoses[0]?.date,
    state.labResults[0]?.date,
    state.therapyNotes[0]?.date,
    state.thoughtJournal[0]?.date,
    state.progressPhotos[0]?.date,
  ].filter((date): date is string => Boolean(date));
  return dates.length ? dates.sort().at(-1)! : null;
}

/** At most three, and only about sleep, medication, and whether data is arriving. */
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

export type LabTrend = {
  key: string;
  name: string;
  unit: string;
  results: LabResult[];
  latest: LabResult;
  previous: LabResult | null;
  change: number | null;
  status: ReturnType<typeof labRangeStatus>;
};

export type CoverageSummary = {
  days: number;
  medicationDays: number;
  medicationDosesDue: number;
  medicationDosesAnswered: number;
  sleepNights: number;
  medicationPercent: number;
  sleepPercent: number;
};

export type ReportRow = {
  id: string;
  group: "Sleep" | "Medication" | "Body" | "Training" | "Mind";
  label: string;
  value: string;
  detail: string;
};

export type HealthReport = {
  start: string;
  end: string;
  days: number;
  coverage: CoverageSummary;
  rows: ReportRow[];
  flaggedLabs: LabResult[];
  notes: Array<{ date: string; note: string }>;
  /** Open items to raise, newest first — the reason to bring this page along. */
  toRaise: TherapyNote[];
};

export function upsertTherapyNote(state: HealthState, value: unknown): HealthState {
  const note = normalizeTherapyNote(value);
  if (!note) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    therapyNotes: [note, ...state.therapyNotes.filter((item) => item.id !== note.id)],
  });
}

export function removeTherapyNote(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    therapyNotes: state.therapyNotes.filter((note) => note.id !== id),
  });
}

export function upsertThoughtJournalEntry(state: HealthState, value: unknown): HealthState {
  const entry = normalizeThoughtJournalEntry(value);
  if (!entry) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    thoughtJournal: [entry, ...state.thoughtJournal.filter((item) => item.id !== entry.id)],
  });
}

export function removeThoughtJournalEntry(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    thoughtJournal: state.thoughtJournal.filter((entry) => entry.id !== id),
  });
}

export function upsertProgressPhoto(state: HealthState, value: unknown): HealthState {
  const photo = normalizeProgressPhoto(value);
  if (!photo) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    progressPhotos: [photo, ...state.progressPhotos.filter((item) => item.id !== photo.id)],
  });
}

export function removeProgressPhoto(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    progressPhotos: state.progressPhotos.filter((photo) => photo.id !== id),
  });
}

export function removeWorkoutSession(state: HealthState, startedAt: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    workoutSets: state.workoutSets.filter((entry) => entry.startedAt !== startedAt),
  });
}

export function removeDailyEntry(state: HealthState, date: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    dailyEntries: state.dailyEntries.filter((entry) => entry.date !== date),
  });
}

export function removeSleepEntry(state: HealthState, date: string, source: SleepSource): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    sleepEntries: state.sleepEntries.filter((entry) => entry.date !== date || entry.source !== source),
  });
}

export function removeLabResult(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    labResults: state.labResults.filter((result) => result.id !== id),
  });
}

/** Hours between a bedtime and a wake time, treating a wake time at or before bedtime as the next morning. */
export function estimateSleepHours(bedtime: string, wakeTime: string): number | null {
  const bed = timeToMinutes(bedtime);
  const wake = timeToMinutes(wakeTime);
  if (bed === null || wake === null) return null;
  const span = wake > bed ? wake - bed : wake + 24 * 60 - bed;
  return Math.round((span / 60) * 100) / 100;
}

function timeToMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

/** A 24-hour HH:MM string as a 12-hour clock label, or null when it is not a time. */
export function formatClock(value: string): string | null {
  const minutes = timeToMinutes(value);
  if (minutes === null) return null;
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function minutesToTime(value: number): string {
  const rounded = ((Math.round(value) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

/** Average bedtime as HH:MM, measured on the "night" clock so 23:50 and 00:10 average to midnight. */
export function averageBedtime(entries: SleepEntry[]): string | null {
  const values = entries
    .map((entry) => bedtimeMinutes(entry.bedtime))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return minutesToTime(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function averageWakeTime(entries: SleepEntry[]): string | null {
  const values = entries
    .map((entry) => timeToMinutes(entry.wakeTime))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  return minutesToTime(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** Total hours below the nightly goal across recorded nights. Nights above goal do not repay debt. */
export function sleepDebtHours(state: HealthState, asOf = todayLocal(), days = 7): number | null {
  const nights = entriesInWindow(preferredSleepEntries(state.sleepEntries), asOf, days).filter(
    (entry) => entry.durationHours !== null,
  );
  if (!nights.length) return null;
  const debt = nights.reduce(
    (total, entry) => total + Math.max(0, state.goals.sleepHours - (entry.durationHours as number)),
    0,
  );
  return Math.round(debt * 10) / 10;
}

export function labKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Groups repeated tests so a marker measured over years reads as one history. */
export function buildLabTrends(results: LabResult[]): LabTrend[] {
  const groups = new Map<string, LabResult[]>();
  for (const result of results) {
    // Units are part of a measurement's identity. A raw mg/dL value cannot be
    // compared with a mmol/L value unless an explicit conversion exists.
    const key = `${labKey(result.name)}::${result.unit.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort((a, b) => b.date.localeCompare(a.date));
      const [latest, previous = null] = ordered;
      const change =
        latest.value !== null && previous?.value !== null && previous !== null ? latest.value - previous.value : null;
      return {
        key,
        name: latest.name,
        unit: latest.unit,
        results: ordered,
        latest,
        previous,
        change,
        status: labRangeStatus(latest),
      };
    })
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date) || a.name.localeCompare(b.name));
}

export function filterLabTrends(trends: LabTrend[], query: string): LabTrend[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return trends;
  return trends.filter(
    (trend) => trend.name.toLowerCase().includes(needle) || trend.latest.note.toLowerCase().includes(needle),
  );
}

export function loggingCoverage(state: HealthState, asOf = todayLocal(), days = 30): CoverageSummary {
  const safeDays = Math.max(1, Math.trunc(days));
  // A day counts as covered when every medication due that day was answered.
  const answered = new Set(state.medicationDoses.map((dose) => `${dose.medicationId}:${dose.date}`));
  let medicationDays = 0;
  let medicationDosesDue = 0;
  let medicationDosesAnswered = 0;
  for (let back = 0; back < safeDays; back += 1) {
    const date = addDays(asOf, -back);
    const due = state.medications.filter((medication) => isDue(medication, date));
    medicationDosesDue += due.length;
    medicationDosesAnswered += due.filter((medication) => answered.has(`${medication.id}:${date}`)).length;
    if (due.length && due.every((medication) => answered.has(`${medication.id}:${date}`))) medicationDays += 1;
  }
  const sleepNights = entriesInWindow(preferredSleepEntries(state.sleepEntries), asOf, safeDays).length;
  return {
    days: safeDays,
    medicationDays,
    medicationDosesDue,
    medicationDosesAnswered,
    sleepNights,
    medicationPercent: Math.round((medicationDays / safeDays) * 100),
    sleepPercent: Math.round((sleepNights / safeDays) * 100),
  };
}

function describeCount(count: number, total: number, unit = "days"): string {
  return count ? `from ${count} recorded ${count === 1 ? unit.replace(/s$/, "") : unit} of ${total}` : "not recorded";
}

/**
 * A dated summary for an appointment. Every row carries how many days it came
 * from, so a thin week is visible as a thin week rather than a confident number.
 */
export function buildHealthReport(state: HealthState, asOf = todayLocal(), days = 30): HealthReport {
  const safeDays = Math.max(1, Math.trunc(days));
  const start = addDays(asOf, -(safeDays - 1));
  const daily = entriesInWindow(state.dailyEntries, asOf, safeDays);
  const nights = entriesInWindow(preferredSleepEntries(state.sleepEntries), asOf, safeDays);
  const rows: ReportRow[] = [];

  const durations = nights.filter((entry) => entry.durationHours !== null);
  const sleepAverage = average(durations.map((entry) => entry.durationHours));
  const atGoal = durations.filter((entry) => (entry.durationHours as number) >= state.goals.sleepHours).length;
  const regularity = sleepConsistencyRange(nights);
  const bedtime = averageBedtime(nights);
  const wake = averageWakeTime(nights);
  const sources = [...new Set(entriesInWindow(state.sleepEntries, asOf, safeDays).map((entry) => entry.source))];

  rows.push({
    id: "sleep-duration",
    group: "Sleep",
    label: "Average sleep",
    value: sleepAverage === null ? "No data" : `${sleepAverage.toFixed(1)} h`,
    detail: `goal ${state.goals.sleepHours} h · ${describeCount(durations.length, safeDays, "nights")}`,
  });
  rows.push({
    id: "sleep-goal-nights",
    group: "Sleep",
    label: "Nights at goal",
    value: durations.length ? `${atGoal} of ${durations.length}` : "No data",
    detail: `nights of at least ${state.goals.sleepHours} hours`,
  });
  rows.push({
    id: "sleep-consistency",
    group: "Sleep",
    label: "Bedtime range",
    value: regularity === null ? "No data" : `${Math.round(regularity)} min`,
    detail: `guide ${state.goals.sleepConsistencyMinutes} min · typical ${
      bedtime ? formatClock(bedtime) : "—"
    } to ${wake ? formatClock(wake) : "—"}`,
  });
  rows.push({
    id: "sleep-source",
    group: "Sleep",
    label: "Measured by",
    value: sources.length ? sources.map((source) => source[0].toUpperCase() + source.slice(1)).join(", ") : "No data",
    detail: "devices that contributed nights in this period",
  });

  // One row per medication, counted over the days each was actually due. A
  // weekly injection taken four times out of four is not 4 of 30.
  const statuses = medicationStatuses(state, asOf, safeDays);
  for (const status of statuses) {
    const every = status.medication.schedule === "daily" ? "daily" : "weekly";
    rows.push({
      id: `medication-${status.medication.id}`,
      group: "Medication",
      label: status.medication.name,
      value: status.percent === null ? "No data" : `${status.percent}%`,
      detail: status.recorded
        ? `${status.taken} taken, ${status.missed} missed of ${status.recorded} ${every} ${
            status.recorded === 1 ? "dose" : "doses"
          } due · ${status.streak} in a row`
        : `${every} · nothing recorded`,
    });
  }
  if (statuses.length > 1) {
    const medication = medicationAdherence(state, asOf, safeDays);
    rows.push({
      id: "medication",
      group: "Medication",
      label: "All medications",
      value: medication.percent === null ? "No data" : `${medication.percent}%`,
      detail: medication.recorded
        ? `${medication.taken} taken, ${medication.missed} missed of ${medication.recorded} ${
            medication.recorded === 1 ? "dose" : "doses"
          } due`
        : "nothing recorded",
    });
  }

  const weights = daily.filter((entry) => entry.weightLb !== null).sort((a, b) => a.date.localeCompare(b.date));
  const weightChange =
    weights.length >= 2 ? (weights.at(-1)!.weightLb as number) - (weights[0].weightLb as number) : null;
  rows.push({
    id: "weight",
    group: "Body",
    label: "Weight",
    value: weights.length ? `${(weights.at(-1)!.weightLb as number).toFixed(1)} lb` : "No data",
    detail:
      weightChange !== null
        ? `${weightChange >= 0 ? "+" : ""}${weightChange.toFixed(1)} lb across the period`
        : weights.length
          ? "one reading in this period"
          : "not recorded",
  });

  for (const [id, label, unit, source] of [
    ["resting-heart-rate", "Resting heart rate", "bpm", "restingHeartRate"],
    ["hrv", "Heart rate variability", "ms", "hrvMs"],
  ] as Array<[string, string, string, "restingHeartRate" | "hrvMs"]>) {
    // An import writes these onto both the day and the night, so collect one
    // value per date — pooling them counts the same measurement twice.
    const byDate = new Map<string, number>();
    for (const night of nights) {
      if (night[source] !== null) byDate.set(night.date, night[source] as number);
    }
    for (const day of daily) {
      if (day[source] !== null) byDate.set(day.date, day[source] as number);
    }
    const mean = average([...byDate.values()]);
    rows.push({
      id,
      group: "Body",
      label,
      value: mean === null ? "No data" : `${Math.round(mean)} ${unit}`,
      detail: describeCount(byDate.size, safeDays, "readings"),
    });
  }

  const steps = average(daily.map((entry) => entry.steps));
  rows.push({
    id: "steps",
    group: "Body",
    label: "Average steps",
    value: steps === null ? "No data" : Math.round(steps).toLocaleString("en-US"),
    detail: describeCount(daily.filter((entry) => entry.steps !== null).length, safeDays),
  });

  const fats = daily.filter((entry) => entry.bodyFatPercent !== null).sort((a, b) => a.date.localeCompare(b.date));
  const fatChange =
    fats.length >= 2 ? (fats.at(-1)!.bodyFatPercent as number) - (fats[0].bodyFatPercent as number) : null;
  rows.push({
    id: "body-fat",
    group: "Body",
    label: "Body fat",
    value: fats.length ? `${(fats.at(-1)!.bodyFatPercent as number).toFixed(1)}%` : "No data",
    detail:
      fatChange !== null
        ? `${fatChange >= 0 ? "+" : ""}${fatChange.toFixed(1)} points across the period`
        : fats.length
          ? "one reading in this period"
          : "not recorded",
  });

  const protein = proteinSummary(state, asOf, safeDays);
  rows.push({
    id: "protein",
    group: "Body",
    label: "Protein",
    value: protein.average === null ? "No data" : `${Math.round(protein.average)} g a day`,
    detail:
      protein.target === null
        ? describeCount(protein.recorded, safeDays)
        : `${protein.daysAtTarget} of ${protein.recorded} recorded days at or above ${protein.target} g`,
  });

  const periodSets = state.workoutSets.filter((entry) => entry.date >= start && entry.date <= asOf);
  const sessions = buildWorkoutSessions(periodSets);
  const volume = sessions.reduce((total, session) => total + session.volumeLb, 0);
  rows.push({
    id: "workouts",
    group: "Training",
    label: "Workouts",
    value: `${sessions.length}`,
    detail: sessions.length
      ? `${(sessions.length / (safeDays / 7)).toFixed(1)} a week across ${periodSets.length} working sets`
      : "no sessions recorded in this period",
  });
  rows.push({
    id: "volume",
    group: "Training",
    label: "Volume lifted",
    value: volume ? `${Math.round(volume).toLocaleString("en-US")} lb` : "No data",
    detail: volume ? `${new Set(periodSets.map((entry) => entry.exercise)).size} distinct exercises` : "import a Strong export",
  });
  const prs = recentPersonalRecords(buildExerciseSummaries(state.workoutSets), asOf, safeDays);
  rows.push({
    id: "records",
    group: "Training",
    label: "Personal records",
    value: `${prs.length}`,
    detail: prs.length
      ? `${prs.slice(0, 2).map((record) => record.exercise).join(", ")}${prs.length > 2 ? ` and ${prs.length - 2} more` : ""}`
      : "none set in this period",
  });

  const mind = mindSummary(state, asOf, safeDays);
  rows.push({
    id: "meditation",
    group: "Mind",
    label: "Meditation",
    value: mind.meditationDays ? `${mind.meditationDays} of ${safeDays} days` : "No data",
    detail: mind.meditationMinutes ? `${mind.meditationMinutes} minutes in total` : "nothing recorded in this period",
  });
  rows.push({
    id: "journal",
    group: "Mind",
    label: "Journaling",
    value: mind.journalDays ? `${mind.journalDays} of ${safeDays} days` : "No data",
    detail: mind.journalDays ? `${Math.round((mind.journalDays / safeDays) * 100)}% of days` : "nothing recorded in this period",
  });

  return {
    start,
    end: asOf,
    days: safeDays,
    coverage: loggingCoverage(state, asOf, safeDays),
    rows,
    // The most recent result for each test only: a marker corrected two years ago
    // is history, not something to raise at this appointment.
    flaggedLabs: buildLabTrends(state.labResults.filter((result) => result.date <= asOf))
      .map((trend) => trend.latest)
      .filter((result) => {
        const status = labRangeStatus(result);
        return status === "low" || status === "high";
      }),
    toRaise: state.therapyNotes.filter((note) => !note.shared && note.date <= asOf),
    notes: daily
      .filter((entry) => entry.note !== "")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => ({ date: entry.date, note: entry.note })),
  };
}

/** Plain text version of the report, for pasting into a message or a visit note. */
export function reportToText(
  report: HealthReport,
  options: { includeTherapy?: boolean; includeNotes?: boolean } = { includeTherapy: true, includeNotes: true },
): string {
  const lines: string[] = [
    `Health summary: ${report.start} to ${report.end} (${report.days} days)`,
    `Recorded: ${report.coverage.sleepNights} nights of sleep, ${report.coverage.medicationDosesAnswered} of ${report.coverage.medicationDosesDue} due medication doses answered.`,
    "",
  ];

  for (const group of ["Sleep", "Medication", "Body", "Training", "Mind"] as const) {
    const rows = report.rows.filter((row) => row.group === group);
    if (!rows.length) continue;
    lines.push(`${group}`);
    for (const row of rows) lines.push(`  ${row.label}: ${row.value} (${row.detail})`);
    lines.push("");
  }

  if (report.flaggedLabs.length) {
    lines.push("Most recent result per test, outside the entered reference range");
    for (const lab of report.flaggedLabs) {
      lines.push(
        `  ${lab.name} ${lab.value ?? "—"} ${lab.unit} on ${lab.date} (range ${lab.referenceLow ?? "—"} to ${lab.referenceHigh ?? "—"})`,
      );
    }
    lines.push("");
  }

  if (options.includeTherapy !== false && report.toRaise.length) {
    lines.push("To raise");
    for (const note of report.toRaise) lines.push(`  ${note.text}`);
    lines.push("");
  }

  if (options.includeNotes !== false && report.notes.length) {
    lines.push("Notes");
    for (const note of report.notes) lines.push(`  ${note.date}: ${note.note}`);
    lines.push("");
  }

  lines.push(
    "These are self-recorded observations and user-entered reference ranges. They are not a diagnosis or a clinical measurement.",
  );
  return lines.join("\n");
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  // A journal entry may legitimately start with any character. Spreadsheet
  // apps must still treat it as text rather than executing it as a formula.
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

/** Every dose recorded, with the name and schedule it was recorded against. */
export function medicationDosesCsv(state: HealthState): string {
  const byId = new Map(state.medications.map((medication) => [medication.id, medication]));
  return toCsv(
    ["date", "medication", "schedule", "taken"],
    [...state.medicationDoses]
      .sort((a, b) => a.date.localeCompare(b.date) || a.medicationId.localeCompare(b.medicationId))
      .map((dose) => [
        dose.date,
        byId.get(dose.medicationId)?.name ?? dose.medicationId,
        byId.get(dose.medicationId)?.schedule ?? "",
        dose.taken,
      ]),
  );
}

export function dailyEntriesCsv(entries: DailyEntry[]): string {
  return toCsv(
    [
      "date",
      "medication_taken",
      "weight_lb",
      "body_fat_percent",
      "steps",
      "resting_heart_rate",
      "hrv_ms",
      "protein_g",
      "calories_kcal",
      "journaled",
      "meditation_minutes",
      "meditation_note",
      "note",
    ],
    [...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => [
        entry.date,
        entry.medicationTaken,
        entry.weightLb,
        entry.bodyFatPercent,
        entry.steps,
        entry.restingHeartRate,
        entry.hrvMs,
        entry.proteinG,
        entry.caloriesKcal,
        entry.journaled,
        entry.meditationMinutes,
        entry.meditationNote,
        entry.note,
      ]),
  );
}

export function workoutSetsCsv(entries: WorkoutSet[]): string {
  return toCsv(
    [
      "date", "started_at", "workout", "exercise", "set_number", "weight_lb", "reps",
      "load_mode", "assistance_lb", "distance", "seconds", "rpe", "rest_timer_seconds", "workout_duration_seconds",
    ],
    [...entries]
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.exercise.localeCompare(b.exercise) || a.setNumber - b.setNumber)
      .map((entry) => [
        entry.date, entry.startedAt, entry.workoutName, entry.exercise, entry.setNumber, entry.weightLb,
        entry.reps, entry.loadMode ?? "", entry.assistanceLb ?? null, entry.distance, entry.seconds, entry.rpe, entry.restSeconds, entry.durationSeconds,
      ]),
  );
}

export function medicationsCsv(entries: Medication[]): string {
  return toCsv(
    ["id", "name", "schedule", "due_day", "archived"],
    entries.map((entry) => [entry.id, entry.name, entry.schedule, entry.dueDay, entry.archived]),
  );
}

export function therapyNotesCsv(entries: TherapyNote[]): string {
  return toCsv(
    ["id", "date", "text", "raised", "raised_date"],
    [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => [
      entry.id, entry.date, entry.text, entry.shared, entry.sharedDate,
    ]),
  );
}

export function thoughtJournalCsv(entries: ThoughtJournalEntry[]): string {
  return toCsv(
    ["id", "date", "created_at", "source", "title", "text"],
    [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((entry) => [
      entry.id, entry.date, entry.createdAt, entry.source, entry.title, entry.text,
    ]),
  );
}

export function progressPhotosCsv(entries: ProgressPhoto[]): string {
  return toCsv(
    ["id", "date", "weight_lb", "body_fat_percent", "note", "image_file"],
    [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => [
      entry.id, entry.date, entry.weightLb, entry.bodyFatPercent, entry.note, `photos/${entry.id}.jpg`,
    ]),
  );
}

export function goalsCsv(goals: GoalSettings): string {
  return toCsv(
    ["setting", "value"],
    [
      ["sleep_hours", goals.sleepHours],
      ["sleep_consistency_minutes", goals.sleepConsistencyMinutes],
      ["track_medication", goals.trackMedication],
      ["weight_goal_lb", goals.weightGoalLb],
      ["weight_direction", goals.weightDirection],
      ["protein_target_g", goals.proteinTargetG],
      ["body_fat_target_percent", goals.bodyFatTargetPercent],
      ["training_days_by_block_week", goals.trainingDays.join("|")],
      ["training_block_start", goals.trainingBlockStart],
      ["training_anchor_sets", JSON.stringify(goals.trainingAnchorSets)],
    ],
  );
}

export function sleepEntriesCsv(entries: SleepEntry[]): string {
  return toCsv(
    [
      "date",
      "source",
      "bedtime",
      "wake_time",
      "duration_hours",
      "quality",
      "efficiency_percent",
      "deep_hours",
      "rem_hours",
      "resting_heart_rate",
      "hrv_ms",
      "note",
    ],
    [...entries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source))
      .map((entry) => [
        entry.date,
        entry.source,
        entry.bedtime,
        entry.wakeTime,
        entry.durationHours,
        entry.quality,
        entry.efficiencyPercent,
        entry.deepHours,
        entry.remHours,
        entry.restingHeartRate,
        entry.hrvMs,
        entry.note,
      ]),
  );
}

export function labResultsCsv(results: LabResult[]): string {
  return toCsv(
    ["date", "name", "value", "unit", "reference_low", "reference_high", "status", "note"],
    [...results]
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      .map((result) => [
        result.date,
        result.name,
        result.value,
        result.unit,
        result.referenceLow,
        result.referenceHigh,
        labRangeStatus(result),
        result.note,
      ]),
  );
}

/* ------------------------------------------------------------------ lifting */

export type ExerciseSession = {
  startedAt: string;
  date: string;
  sets: number;
  volumeLb: number;
  oneRepMax: number | null;
  topWeightLb: number | null;
  topReps: number | null;
};

export type ExerciseSummary = {
  name: string;
  /** No set ever carried weight, so reps are the only thing to rank. */
  bodyweight: boolean;
  sessions: number;
  sets: number;
  firstDate: string;
  lastDate: string;
  totalVolumeLb: number;
  best: WorkoutSet | null;
  bestOneRepMax: number | null;
  history: ExerciseSession[];
};

export type WorkoutSession = {
  startedAt: string;
  date: string;
  name: string;
  exercises: string[];
  sets: number;
  volumeLb: number;
};

export type PersonalRecord = {
  exercise: string;
  date: string;
  bodyweight: boolean;
  weightLb: number | null;
  reps: number | null;
  oneRepMax: number | null;
  /** The best before this one, so the jump is visible. */
  previous: number | null;
};

/**
 * Epley: weight × (1 + reps / 30). Past about fifteen reps the formula stops
 * describing strength and starts describing endurance, so it declines to guess.
 */
export function estimateOneRepMax(weightLb: number | null, reps: number | null): number | null {
  if (weightLb === null || reps === null || weightLb <= 0 || reps <= 0 || reps > 15) return null;
  return Math.round(weightLb * (1 + reps / 30) * 10) / 10;
}

export function setVolume(entry: WorkoutSet): number {
  return (entry.weightLb ?? 0) * (entry.reps ?? 0);
}

/** Ranks two sets of the same exercise: by estimated max, or by reps when nothing is loaded. */
function betterSet(candidate: WorkoutSet, current: WorkoutSet | null): boolean {
  if (!current) return true;
  const a = estimateOneRepMax(candidate.weightLb, candidate.reps);
  const b = estimateOneRepMax(current.weightLb, current.reps);
  if (a !== null || b !== null) return (a ?? 0) > (b ?? 0);
  return (candidate.reps ?? 0) > (current.reps ?? 0);
}

export function buildWorkoutSessions(sets: WorkoutSet[]): WorkoutSession[] {
  const sessions = new Map<string, WorkoutSession>();
  for (const entry of sets) {
    const session = sessions.get(entry.startedAt) ?? {
      startedAt: entry.startedAt,
      date: entry.date,
      name: entry.workoutName,
      exercises: [] as string[],
      sets: 0,
      volumeLb: 0,
    };
    if (!session.exercises.includes(entry.exercise)) session.exercises.push(entry.exercise);
    session.sets += 1;
    session.volumeLb += setVolume(entry);
    sessions.set(entry.startedAt, session);
  }
  return [...sessions.values()]
    .map((session) => ({ ...session, volumeLb: Math.round(session.volumeLb) }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function buildExerciseSummaries(sets: WorkoutSet[]): ExerciseSummary[] {
  const byExercise = new Map<string, WorkoutSet[]>();
  for (const entry of sets) {
    const list = byExercise.get(entry.exercise);
    if (list) list.push(entry);
    else byExercise.set(entry.exercise, [entry]);
  }

  const summaries: ExerciseSummary[] = [];
  for (const [name, entries] of byExercise) {
    const bySession = new Map<string, WorkoutSet[]>();
    for (const entry of entries) {
      const list = bySession.get(entry.startedAt);
      if (list) list.push(entry);
      else bySession.set(entry.startedAt, [entry]);
    }

    const history: ExerciseSession[] = [...bySession.values()]
      .map((session) => {
        let top: WorkoutSet | null = null;
        let volume = 0;
        for (const entry of session) {
          volume += setVolume(entry);
          if (betterSet(entry, top)) top = entry;
        }
        return {
          startedAt: session[0].startedAt,
          date: session[0].date,
          sets: session.length,
          volumeLb: Math.round(volume),
          oneRepMax: top ? estimateOneRepMax(top.weightLb, top.reps) : null,
          topWeightLb: top?.weightLb ?? null,
          topReps: top?.reps ?? null,
        };
      })
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    let best: WorkoutSet | null = null;
    for (const entry of entries) if (betterSet(entry, best)) best = entry;
    const dates = entries.map((entry) => entry.date).sort();

    summaries.push({
      name,
      bodyweight: entries.every((entry) => !entry.weightLb),
      sessions: bySession.size,
      sets: entries.length,
      firstDate: dates[0],
      lastDate: dates.at(-1)!,
      totalVolumeLb: Math.round(entries.reduce((total, entry) => total + setVolume(entry), 0)),
      best,
      bestOneRepMax: best ? estimateOneRepMax(best.weightLb, best.reps) : null,
      history,
    });
  }

  return summaries.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

/**
 * Exercises whose best-ever set happened inside the window, with whatever stood
 * before it. A first-ever attempt is not a record — there is nothing to beat.
 */
export function recentPersonalRecords(
  summaries: ExerciseSummary[],
  asOf = todayLocal(),
  days = 30,
): PersonalRecord[] {
  const start = addDays(asOf, -(Math.max(1, Math.trunc(days)) - 1));
  const records: PersonalRecord[] = [];

  for (const summary of summaries) {
    if (!summary.best || summary.best.date < start || summary.best.date > asOf) continue;
    if (summary.sessions < 2) continue;

    const rank = (session: ExerciseSession) =>
      summary.bodyweight ? (session.topReps ?? 0) : (session.oneRepMax ?? 0);
    const earlier = summary.history.filter((session) => session.startedAt < summary.best!.startedAt);
    if (!earlier.length) continue;
    const previous = Math.max(...earlier.map(rank));
    const current = summary.bodyweight ? (summary.best.reps ?? 0) : (summary.bestOneRepMax ?? 0);
    if (current <= previous) continue;

    records.push({
      exercise: summary.name,
      date: summary.best.date,
      bodyweight: summary.bodyweight,
      weightLb: summary.best.weightLb,
      reps: summary.best.reps,
      oneRepMax: summary.bestOneRepMax,
      previous: previous || null,
    });
  }

  return records.sort((a, b) => b.date.localeCompare(a.date));
}

/** Training volume per week, newest week last, for a bar chart. */
export function weeklyVolume(sets: WorkoutSet[], asOf = todayLocal(), weeks = 12): Array<{ date: string; value: number | null }> {
  const buckets: Array<{ date: string; value: number | null }> = [];
  const day = new Date(`${asOf}T00:00:00Z`).getUTCDay();
  const currentMonday = addDays(asOf, -((day + 6) % 7));
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = addDays(currentMonday, -index * 7);
    const end = addDays(start, 6);
    const volume = sets
      .filter((entry) => entry.date >= start && entry.date <= end && entry.date <= asOf)
      .reduce((total, entry) => total + setVolume(entry), 0);
    buckets.push({ date: start, value: volume > 0 ? Math.round(volume) : null });
  }
  return buckets;
}

/* ------------------------------------------------------------------- fuel */

export type ProteinSummary = {
  days: number;
  recorded: number;
  average: number | null;
  daysAtTarget: number;
  target: number | null;
};

export function proteinSummary(state: HealthState, asOf = todayLocal(), days = 7): ProteinSummary {
  const window = entriesInWindow(state.dailyEntries, asOf, days).filter((entry) => entry.proteinG !== null);
  const target = state.goals.proteinTargetG;
  return {
    days: Math.max(1, Math.trunc(days)),
    recorded: window.length,
    average: average(window.map((entry) => entry.proteinG)),
    daysAtTarget: target === null ? 0 : window.filter((entry) => (entry.proteinG as number) >= target).length,
    target,
  };
}

/* ------------------------------------------------------------------- mind */

export type MindSummary = {
  days: number;
  meditationDays: number;
  meditationMinutes: number;
  journalDays: number;
  openTherapyNotes: number;
};

export function mindSummary(state: HealthState, asOf = todayLocal(), days = 7): MindSummary {
  const window = entriesInWindow(state.dailyEntries, asOf, days);
  const start = addDays(asOf, -(Math.max(1, Math.trunc(days)) - 1));
  const journalDates = new Set([
    ...window.filter((entry) => entry.journaled).map((entry) => entry.date),
    ...state.thoughtJournal
      .filter((entry) => entry.date >= start && entry.date <= asOf)
      .map((entry) => entry.date),
  ]);
  return {
    days: Math.max(1, Math.trunc(days)),
    meditationDays: window.filter((entry) => (entry.meditationMinutes ?? 0) > 0).length,
    meditationMinutes: Math.round(window.reduce((total, entry) => total + (entry.meditationMinutes ?? 0), 0)),
    journalDays: journalDates.size,
    openTherapyNotes: state.therapyNotes.filter((note) => !note.shared).length,
  };
}
