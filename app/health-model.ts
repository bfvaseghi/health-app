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
  waterMl: number | null;
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

/** A recurring worry, with an optional reusable reminder for responding. */
export type ThoughtLoop = {
  id: string;
  name: string;
  /** What helps the person respond, separate from any particular occurrence. */
  reply: string;
  createdAt: string;
  archived: boolean;
};

/** Optional outcome of an occurrence. "noticed" has no recorded outcome. */
export type LoopMove = "noticed" | "passed" | "later" | "hooked";
export type LoopRecurrence = "once" | "few" | "often";

/** One time a loop came up: when, and what happened. */
export type LoopEvent = {
  id: string;
  loopId: string;
  /** Local wall-clock time, "YYYY-MM-DDTHH:MM", so the hour survives export. */
  at: string;
  date: string;
  move: LoopMove;
  /** How often it returned during this occasion; absent on older records. */
  recurrence?: LoopRecurrence;
  /** What the person did in response on this occasion. */
  response?: string;
};

/**
 * A habit you are cutting back. Private by design: it is named in your own
 * words, counted honestly, and never appears in the doctor summary.
 */
export type Habit = {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
  category?: "masturbation";
  caffeine?: { dailyLimitMg: number | null; cutoffTime: string; usualDoseMg: number | null };
};

export type HabitDraft = Pick<Habit, "name" | "caffeine" | "category"> & { id?: string };

/** An urge that passed, or a time it happened. */
export type HabitKind = "urge" | "slip" | "intake";

export type HabitEvent = {
  id: string;
  habitId: string;
  /** Local wall-clock time, "YYYY-MM-DDTHH:MM". */
  at: string;
  date: string;
  kind: HabitKind;
  amountMg?: number | null;
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
 * A progress photo's dated metadata. Image bytes are saved separately in
 * private photo storage and included in portable archives.
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
  /** Marked to bring up at the next appointment, whatever the range says. */
  ask: boolean;
};

/** The only targets this app holds. */
/**
 * A medication you are on, and how often it is due.
 *
 * Named and separate rather than one "did you take it" for everything: a
 * daily tablet, a daily medication and a weekly medication are three different questions
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
  /** maintain, lose (a cut) or gain (a bulk). */
  weightDirection: WeightDirection;
  /** The day the cut or bulk began; empty when none is set. */
  phaseStart: string;
  /** Pounds a week to aim for while cutting or bulking, as a positive number. */
  weeklyRateLb: number | null;
  proteinTargetG: number | null;
  bodyFatTargetPercent: number | null;
  /**
   * Sessions you want in each week of the training block, one entry per week.
   * A zero uses the four-workout goal. Every target permits calendar refitting.
   */
  trainingDays: number[];
  trainingSplit: "full-body" | "upper-lower";
  trainingSessionMinutes: number;
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
  thoughtLoops: ThoughtLoop[];
  loopEvents: LoopEvent[];
  habits: Habit[];
  habitEvents: HabitEvent[];
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
  phaseStart: "",
  weeklyRateLb: null,
  proteinTargetG: null,
  bodyFatTargetPercent: null,
  trainingDays: [],
  trainingSplit: "full-body",
  trainingSessionMinutes: 90,
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
    thoughtLoops: [],
    loopEvents: [],
    habits: [],
    habitEvents: [],
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
    waterMl: null,
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
  if (entry.weightLb !== null && (entry.weightLb < 40 || entry.weightLb > 1_000)) return "Weight: 40–1,000 lb.";
  if (entry.bodyFatPercent !== null && (entry.bodyFatPercent < 3 || entry.bodyFatPercent > 60)) return "Body fat: 3–60%.";
  if (entry.proteinG !== null && (entry.proteinG < 0 || entry.proteinG > 500)) return "Protein: 0–500 g.";
  if (entry.waterMl != null && (!Number.isFinite(entry.waterMl) || entry.waterMl < 0 || entry.waterMl > 20_000)) return "Water: 0–20,000 mL.";
  const meaningful = entry.weightLb !== null || entry.bodyFatPercent !== null || entry.proteinG !== null || entry.waterMl != null || entry.note.trim() !== "";
  return meaningful ? null : "Add at least one value or note.";
}

export function validateSleepEntry(entry: SleepEntry, asOf = todayLocal()): string | null {
  if (!validIsoDate(entry.date) || entry.date > asOf) return "Choose today or an earlier wake date.";
  if (entry.durationHours === null && (!entry.bedtime || !entry.wakeTime)) return "Add a duration or both bedtime and wake time.";
  if (entry.bedtime && entry.wakeTime && entry.bedtime === entry.wakeTime) return "Bedtime and wake time cannot be the same.";
  if (entry.durationHours !== null && (entry.durationHours < 1 || entry.durationHours > 18)) return "Sleep: 1–18 h.";
  if (entry.deepHours !== null && (entry.deepHours < 0 || entry.deepHours > 12)) return "Deep sleep: 0–12 h.";
  if (entry.remHours !== null && (entry.remHours < 0 || entry.remHours > 12)) return "REM sleep: 0–12 h.";
  if (entry.durationHours !== null && (entry.deepHours ?? 0) + (entry.remHours ?? 0) > entry.durationHours) {
    return "Deep + REM exceeds total sleep.";
  }
  return null;
}

export function validateMedication(medication: Medication): string | null {
  if (!medication.name.trim()) return "Medication name required.";
  if (medication.name.trim().length > 80) return "Medication name: 80 characters maximum.";
  if (medication.schedule === "weekly" && (medication.dueDay === null || medication.dueDay < 0 || medication.dueDay > 6)) {
    return "Weekday required.";
  }
  return null;
}

export function validateLabResult(result: LabResult, asOf = todayLocal()): string | null {
  if (!result.name.trim()) return "Test name required.";
  if (!validIsoDate(result.date) || result.date > asOf) return "Choose today or an earlier result date.";
  if (result.value === null) return "Result required.";
  if (result.referenceLow !== null && result.referenceHigh !== null && result.referenceLow > result.referenceHigh) {
    return "Reference low exceeds high.";
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
    waterMl: finiteNumber(entry.waterMl, 0, 20_000),
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
    ask: result.ask === true,
  };
}

/** Mark or unmark a result to ask about; the record is otherwise untouched. */
export function setLabAsk(state: HealthState, id: string, ask: boolean): HealthState {
  const result = state.labResults.find((entry) => entry.id === id);
  if (!result || result.ask === ask) return state;
  return upsertLabResult(state, { ...result, ask });
}

/** Whether a marker belongs on the doctor list: out of range, or asked about by hand. */
export function labAskReason(trend: Pick<LabTrend, "status" | "results">): "outside range" | "flagged by you" | null {
  if (trend.status === "low" || trend.status === "high") return "outside range";
  if (trend.results.some((result) => result.ask)) return "flagged by you";
  return null;
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
  const text = safeText(note.text, 10_240);
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

const LOOP_MOVES: LoopMove[] = ["noticed", "passed", "later", "hooked"];
/** Earlier names for the same outcomes, so a record written last week still reads. */
const LEGACY_LOOP_MOVES: Record<string, LoopMove> = { named: "passed", shifted: "passed", parked: "later" };

/** "YYYY-MM-DDTHH:MM" in local time; the date is the first ten characters. */
export function localDateTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function normalizeThoughtLoop(value: unknown): ThoughtLoop | null {
  const loop = recordValue(value);
  const name = safeText(loop.name, 120);
  if (!name) return null;
  return {
    id: safeText(loop.id, 120) || `loop-${Math.abs(hashText(name)).toString(36)}`,
    name,
    reply: safeText(loop.reply, 400),
    createdAt: validIsoDate(String(loop.createdAt ?? "").slice(0, 10)) ? String(loop.createdAt) : todayLocal(),
    archived: booleanOrNull(loop.archived) ?? false,
  };
}

export function normalizeLoopEvent(value: unknown, knownLoops: Set<string>): LoopEvent | null {
  const event = recordValue(value);
  const loopId = safeText(event.loopId, 120);
  if (!loopId || !knownLoops.has(loopId)) return null;
  const at = typeof event.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(event.at) ? event.at.slice(0, 16) : null;
  const date = validIsoDate(event.date) ? event.date : at ? at.slice(0, 10) : null;
  if (!date) return null;
  let move: LoopMove = LOOP_MOVES.includes(event.move as LoopMove)
    ? (event.move as LoopMove)
    : LEGACY_LOOP_MOVES[String(event.move)] ?? "noticed";
  // The old shape carried a separate yes/no for "did it pass"; fold it in.
  const legacyPassed = booleanOrNull(event.passed);
  if (legacyPassed === false) move = "hooked";
  else if (legacyPassed === true && move === "noticed") move = "passed";
  return {
    id: safeText(event.id, 120) || `${loopId}-${at ?? date}`,
    loopId,
    at: at ?? `${date}T12:00`,
    date,
    move,
    ...(["once", "few", "often"].includes(String(event.recurrence)) ? { recurrence: event.recurrence as LoopRecurrence } : {}),
    ...(safeText(event.response, 800) ? { response: safeText(event.response, 800) } : {}),
  };
}

export function normalizeHabit(value: unknown): Habit | null {
  const habit = recordValue(value);
  const name = safeText(habit.name, 120);
  if (!name) return null;
  return {
    id: safeText(habit.id, 120) || `habit-${Math.abs(hashText(name)).toString(36)}`,
    name,
    createdAt: validIsoDate(String(habit.createdAt ?? "").slice(0, 10)) ? String(habit.createdAt) : todayLocal(),
    archived: booleanOrNull(habit.archived) ?? false,
    ...(!habit.caffeine && (habit.category === "masturbation" || /masturbat/i.test(name)) ? { category: "masturbation" as const } : {}),
    ...(habit.caffeine && typeof habit.caffeine === "object" ? { caffeine: {
      dailyLimitMg: caffeineAmount(recordValue(habit.caffeine).dailyLimitMg, true),
      cutoffTime: validClock(recordValue(habit.caffeine).cutoffTime),
      usualDoseMg: caffeineAmount(recordValue(habit.caffeine).usualDoseMg),
    } } : {}),
  };
}

function caffeineAmount(value: unknown, allowZero = false): number | null {
  return typeof value === "number" && Number.isFinite(value) && (allowZero ? value >= 0 : value >= 0.1)
    ? Math.round(value * 10) / 10 : null;
}

function validClock(value: unknown): string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "";
}

export function normalizeHabitEvent(value: unknown, knownHabits: Set<string>): HabitEvent | null {
  const event = recordValue(value);
  const habitId = safeText(event.habitId, 120);
  if (!habitId || !knownHabits.has(habitId)) return null;
  const at = typeof event.at === "string" && validIsoDate(event.at.slice(0, 10)) && event.at[10] === "T" && validClock(event.at.slice(11, 16)) ? event.at.slice(0, 16) : null;
  const date = at ? at.slice(0, 10) : validIsoDate(event.date) ? event.date : null;
  if (!date) return null;
  if (event.kind === "intake" && (!at || caffeineAmount(event.amountMg) === null)) return null;
  return {
    id: safeText(event.id, 120) || `${habitId}-${at ?? date}`,
    habitId,
    at: at ?? `${date}T12:00`,
    date,
    kind: event.kind === "intake" ? "intake" : event.kind === "slip" ? "slip" : "urge",
    ...(event.kind === "intake" ? { amountMg: caffeineAmount(event.amountMg) } : {}),
  };
}

export function caffeineSummary(state: HealthState, habitId: string, date = todayLocal()) {
  const habit = state.habits.find(entry => entry.id === habitId);
  const events = state.habitEvents.filter(event => event.habitId === habitId && event.kind === "intake" && event.date === date);
  const totalMg = Math.round(events.reduce((sum, event) => sum + (event.amountMg ?? 0), 0) * 10) / 10;
  const cutoff = habit?.caffeine?.cutoffTime ?? "";
  const late = cutoff ? events.filter(event => event.at.slice(11, 16) > cutoff).length : 0;
  const limit = habit?.caffeine?.dailyLimitMg;
  return { events, totalMg, late, overMg: limit == null ? null : Math.max(0, Math.round((totalMg - limit) * 10) / 10) };
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
    phaseStart: validIsoDate(goals.phaseStart) ? goals.phaseStart : "",
    weeklyRateLb: finiteNumber(goals.weeklyRateLb, 0.1, 5),
    proteinTargetG: finiteNumber(goals.proteinTargetG, 0, 1_000),
    bodyFatTargetPercent: finiteNumber(goals.bodyFatTargetPercent, 1, 70),
    trainingDays: Array.isArray(goals.trainingDays)
      ? goals.trainingDays.slice(0, 8).map((value) => {
          const days = finiteNumber(value, 0, 7);
          return days === null || days < 2 ? 0 : Math.min(4, Math.round(days));
        })
      : [],
    trainingSplit: goals.trainingSplit === "upper-lower" ? "upper-lower" : "full-body",
    trainingSessionMinutes: finiteNumber(goals.trainingSessionMinutes, 45, 120) ?? 90,
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
  const loops = dedupeByKey(
    Array.isArray(state.thoughtLoops)
      ? state.thoughtLoops.map(normalizeThoughtLoop).filter((loop): loop is ThoughtLoop => Boolean(loop))
      : [],
    (loop) => loop.id,
  );
  const loopIds = new Set(loops.map((loop) => loop.id));
  const loopEvents = Array.isArray(state.loopEvents)
    ? state.loopEvents.map((event) => normalizeLoopEvent(event, loopIds)).filter((event): event is LoopEvent => Boolean(event))
    : [];
  const habits = dedupeByKey(
    Array.isArray(state.habits) ? state.habits.map(normalizeHabit).filter((habit): habit is Habit => Boolean(habit)) : [],
    (habit) => habit.id,
  );
  const habitIds = new Set(habits.map((habit) => habit.id));
  const habitEvents = Array.isArray(state.habitEvents)
    ? state.habitEvents.map((event) => normalizeHabitEvent(event, habitIds)).filter((event): event is HabitEvent => Boolean(event))
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
      .sort((a, b) => compareWorkoutStarts(b.startedAt, a.startedAt) || a.exercise.localeCompare(b.exercise) || a.setNumber - b.setNumber),
    therapyNotes: dedupeByKey(therapy, (note) => note.id).sort((a, b) => b.date.localeCompare(a.date)),
    thoughtJournal: dedupeByKey(thoughts, (entry) => entry.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date)),
    thoughtLoops: loops.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    loopEvents: dedupeByKey(loopEvents, (event) => event.id).sort((a, b) => b.at.localeCompare(a.at)),
    habits: habits.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    habitEvents: dedupeByKey(habitEvents, (event) => event.id).sort((a, b) => b.at.localeCompare(a.at)),
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

export function upsertThoughtLoop(state: HealthState, value: unknown): HealthState {
  const loop = normalizeThoughtLoop(value);
  if (!loop) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    thoughtLoops: [...state.thoughtLoops.filter((item) => item.id !== loop.id), loop],
  });
}

/** Removing a loop removes every time it came up; the history is the loop's. */
export function removeThoughtLoop(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    thoughtLoops: state.thoughtLoops.filter((loop) => loop.id !== id),
    loopEvents: state.loopEvents.filter((event) => event.loopId !== id),
  });
}

export function upsertLoopEvent(state: HealthState, value: unknown): HealthState {
  const event = normalizeLoopEvent(value, new Set(state.thoughtLoops.map((loop) => loop.id)));
  if (!event) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    loopEvents: [event, ...state.loopEvents.filter((item) => item.id !== event.id)],
  });
}

export function removeLoopEvent(state: HealthState, id: string): HealthState {
  if (!state.loopEvents.some((event) => event.id === id)) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    loopEvents: state.loopEvents.filter((event) => event.id !== id),
  });
}

export type LoopSummary = {
  today: number;
  week: number;
  lastWeek: number;
  month: number;
  priorMonth: number;
  /** Days since it last came up; 0 if today, null if never. */
  quietDays: number | null;
  /** Of the answered taps in 30 days, how many you let pass or set aside rather than got pulled into; null under three answers. */
  letGoShare: number | null;
  /** Times it pulled you in over 30 days. */
  hooked: number;
  /** When it tends to come up over 30 days; null with fewer than three events. */
  peak: "mornings" | "afternoons" | "evenings" | "nights" | null;
  trend: "fading" | "steady" | "louder" | "new";
  sentence: string;
};

function partOfDay(at: string): "mornings" | "afternoons" | "evenings" | "nights" {
  const hour = Number(at.slice(11, 13));
  if (hour >= 5 && hour < 12) return "mornings";
  if (hour >= 12 && hour < 17) return "afternoons";
  if (hour >= 17 && hour < 22) return "evenings";
  return "nights";
}

/** How one loop is going: counted, compared with the week before, and said plainly. */
export function loopSummary(state: HealthState, loopId: string, asOf = todayLocal()): LoopSummary {
  const events = state.loopEvents.filter((event) => event.loopId === loopId && event.date <= asOf);
  const inWindow = (from: number, to: number) => events.filter((event) => event.date > addDays(asOf, -to) && event.date <= addDays(asOf, -from));
  const today = events.filter((event) => event.date === asOf).length;
  const week = inWindow(0, 7).length;
  const lastWeek = inWindow(7, 14).length;
  const month = inWindow(0, 30);
  const priorMonth = inWindow(30, 60).length;
  const latest = events[0]?.date ?? null;
  const quietDays = latest ? daysBetween(latest, asOf) : null;
  const answered = month.filter((event) => event.move !== "noticed");
  const hooked = answered.filter((event) => event.move === "hooked").length;
  const letGoShare = answered.length >= 3 ? Math.round(((answered.length - hooked) / answered.length) * 100) : null;
  let peak: LoopSummary["peak"] = null;
  if (month.length >= 3) {
    const counts = new Map<string, number>();
    for (const event of month) counts.set(partOfDay(event.at), (counts.get(partOfDay(event.at)) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / month.length >= 0.4) peak = top[0] as LoopSummary["peak"];
  }
  // A change counts when it is at least two taps and at least a quarter of last
  // week; one tap either way is a day, not a direction.
  const step = Math.max(2, Math.ceil(lastWeek * 0.25));
  const trend: LoopSummary["trend"] =
    week + lastWeek < 3 && !lastWeek ? "new" : week <= lastWeek - step ? "fading" : week >= lastWeek + step ? "louder" : "steady";
  // Two numbers and, when it has stayed away, how long. Nothing else.
  const parts: string[] = [];
  if (trend === "new") parts.push(week ? `${week} this week` : "not yet this week");
  else parts.push(`${week} this week · ${lastWeek} last week`);
  if (quietDays !== null && quietDays >= 2) parts.push(`last logged ${quietDays} days ago`);
  return { today, week, lastWeek, month: month.length, priorMonth, quietDays, letGoShare, hooked, peak, trend, sentence: parts.join(" · ") };
}

/** Times a loop came up in each trailing week, oldest first; a zero is a real zero. */
export function loopWeekly(state: HealthState, loopId: string, asOf = todayLocal(), weeks = 8): Array<{ date: string; value: number }> {
  const events = state.loopEvents.filter((event) => event.loopId === loopId);
  return Array.from({ length: weeks }, (_, index) => {
    const end = addDays(asOf, -(weeks - 1 - index) * 7);
    const start = addDays(end, -6);
    return { date: end, value: events.filter((event) => event.date >= start && event.date <= end).length };
  });
}

export function upsertHabit(state: HealthState, value: unknown): HealthState {
  const habit = normalizeHabit(value);
  if (!habit) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    habits: [...state.habits.filter((item) => item.id !== habit.id), habit],
  });
}

export function removeHabit(state: HealthState, id: string): HealthState {
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    habits: state.habits.filter((habit) => habit.id !== id),
    habitEvents: state.habitEvents.filter((event) => event.habitId !== id),
  });
}

export function upsertHabitEvent(state: HealthState, value: unknown): HealthState {
  const event = normalizeHabitEvent(value, new Set(state.habits.map((habit) => habit.id)));
  if (!event) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    habitEvents: [event, ...state.habitEvents.filter((item) => item.id !== event.id)],
  });
}

export function removeHabitEvent(state: HealthState, id: string): HealthState {
  if (!state.habitEvents.some((event) => event.id === id)) return state;
  return normalizeHealthState({
    ...state,
    updatedAt: new Date().toISOString(),
    habitEvents: state.habitEvents.filter((event) => event.id !== id),
  });
}

export type HabitSummary = {
  /** Slips this week and last. */
  week: number;
  lastWeek: number;
  /** Urges that passed this week. */
  urgesWeek: number;
  /** Days since the last slip; 0 if today, null if there has never been one. */
  cleanDays: number | null;
  /** The longest run of clean days in the last 90, counting the current one. */
  bestCleanDays: number;
  sentence: string;
};

/** Slips this week against last, urges that passed, and the clean streak. */
export function habitSummary(state: HealthState, habitId: string, asOf = todayLocal()): HabitSummary {
  const events = state.habitEvents.filter((event) => event.habitId === habitId && event.date <= asOf);
  const slips = events.filter((event) => event.kind === "slip");
  const inWindow = (list: HabitEvent[], from: number, to: number) =>
    list.filter((event) => event.date > addDays(asOf, -to) && event.date <= addDays(asOf, -from)).length;
  const week = inWindow(slips, 0, 7);
  const lastWeek = inWindow(slips, 7, 14);
  const urgesWeek = inWindow(events.filter((event) => event.kind === "urge"), 0, 7);
  const lastSlip = slips[0]?.date ?? null;
  const cleanDays = lastSlip ? daysBetween(lastSlip, asOf) : null;
  // Longest gap between slips over ninety days, including the run up to today.
  const habit = state.habits.find((entry) => entry.id === habitId);
  const floor = addDays(asOf, -90);
  const marks = [...new Set(slips.filter((event) => event.date >= floor).map((event) => event.date))].sort();
  let bestCleanDays = 0;
  const from = habit && habit.createdAt > floor ? habit.createdAt : floor;
  const points = [from, ...marks, asOf];
  for (let index = 1; index < points.length; index += 1) {
    const gap = daysBetween(points[index - 1], points[index]) - (index === points.length - 1 ? 0 : 1);
    bestCleanDays = Math.max(bestCleanDays, gap);
  }
  const parts: string[] = [];
  if (cleanDays === null) parts.push("No occurrences logged");
  else parts.push(cleanDays === 0 ? "today" : cleanDays === 1 ? "1 day since last occurrence" : `${cleanDays} days since last occurrence`);
  parts.push(`${week} this week · ${lastWeek} last week`);
  if (urgesWeek) parts.push(`${urgesWeek} ${urgesWeek === 1 ? "urge" : "urges"} passed`);
  return { week, lastWeek, urgesWeek, cleanDays, bestCleanDays, sentence: parts.join(" · ") };
}

/** Slips in each trailing week, oldest first; a zero is a real zero. */
export function habitWeekly(state: HealthState, habitId: string, asOf = todayLocal(), weeks = 8): Array<{ date: string; value: number }> {
  const slips = state.habitEvents.filter((event) => event.habitId === habitId && event.kind === "slip");
  return Array.from({ length: weeks }, (_, index) => {
    const end = addDays(asOf, -(weeks - 1 - index) * 7);
    const start = addDays(end, -6);
    return { date: end, value: slips.filter((event) => event.date >= start && event.date <= end).length };
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
  return count ? `${count}/${total} ${count === 1 ? unit.replace(/s$/, "") : unit}` : "not recorded";
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
    detail: `≥${state.goals.sleepHours} h`,
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
    detail: "",
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
        : `${every} · no doses logged`,
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
        : "not recorded",
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
        ? `${weightChange >= 0 ? "+" : ""}${weightChange.toFixed(1)} lb change`
        : weights.length
          ? "1 reading"
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
        ? `${fatChange >= 0 ? "+" : ""}${fatChange.toFixed(1)} points change`
        : fats.length
          ? "1 reading"
          : "not recorded",
  });

  const protein = proteinSummary(state, asOf, safeDays);
  rows.push({
    id: "protein",
    group: "Body",
    label: "Protein",
    value: protein.average === null ? "No data" : `${Math.round(protein.average)} g/day`,
    detail:
      protein.target === null
        ? describeCount(protein.recorded, safeDays)
        : `${protein.daysAtTarget}/${protein.recorded} days ≥ ${protein.target} g`,
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
      ? `${(sessions.length / (safeDays / 7)).toFixed(1)}/week · ${periodSets.length} sets`
      : "No sessions",
  });
  rows.push({
    id: "volume",
    group: "Training",
    label: "Volume lifted",
    value: volume ? `${Math.round(volume).toLocaleString("en-US")} lb` : "No data",
    detail: volume ? `${new Set(periodSets.map((entry) => entry.exercise)).size} exercises` : "No Strong records",
  });
  const prs = recentPersonalRecords(buildExerciseSummaries(state.workoutSets), asOf, safeDays);
  rows.push({
    id: "records",
    group: "Training",
    label: "Personal records",
    value: `${prs.length}`,
    detail: prs.length
      ? `${prs.slice(0, 2).map((record) => record.exercise).join(", ")}${prs.length > 2 ? ` and ${prs.length - 2} more` : ""}`
      : "No new records",
  });

  const mind = mindSummary(state, asOf, safeDays);
  rows.push({
    id: "meditation",
    group: "Mind",
    label: "Meditation",
    value: mind.meditationDays ? `${mind.meditationDays} of ${safeDays} days` : "No data",
    detail: mind.meditationMinutes ? `${mind.meditationMinutes} min` : "Not recorded",
  });
  // Rumination reports how often thoughts came back and whether they could be
  // let go — never what any of them was about. A row per named thought put the
  // content of the thought in a document meant to be printed and handed over,
  // so there is one row, keyed on nothing but the dates.
  {
    const live = new Set(state.thoughtLoops.filter((entry) => !entry.archived).map((entry) => entry.id));
    const inWindow = state.loopEvents.filter((event) => live.has(event.loopId) && event.date >= start && event.date <= asOf);
    const before = state.loopEvents.filter(
      (event) => live.has(event.loopId) && event.date >= addDays(start, -safeDays) && event.date < start,
    );
    const answered = inWindow.filter((event) => event.move !== "noticed");
    const letGo = answered.filter((event) => event.move !== "hooked").length;
    const days = new Set(inWindow.map((event) => event.date)).size;
    rows.push({
      id: "rumination",
      group: "Mind",
      label: "Rumination",
      value: inWindow.length
        ? `${inWindow.length} ${inWindow.length === 1 ? "log" : "logs"} on ${days} of ${safeDays} days`
        : "No data",
      detail: inWindow.length
        ? `${before.length} the ${safeDays} days before${
            answered.length >= 3 ? ` · moved on ${Math.round((letGo / answered.length) * 100)}%` : ""
          }`
        : "Not recorded",
    });
  }
  rows.push({
    id: "journal",
    group: "Mind",
    label: "Journaling",
    value: mind.journalDays ? `${mind.journalDays} of ${safeDays} days` : "No data",
    detail: mind.journalDays ? `${Math.round((mind.journalDays / safeDays) * 100)}% of days` : "Not recorded",
  });

  return {
    start,
    end: asOf,
    days: safeDays,
    coverage: loggingCoverage(state, asOf, safeDays),
    rows,
    // The most recent result for each test only: a marker corrected two years ago
    // is history, not something to raise at this appointment.
    // Out of range, or marked to ask about by hand; either way the latest result speaks.
    flaggedLabs: buildLabTrends(state.labResults.filter((result) => result.date <= asOf))
      .filter((trend) => labAskReason(trend) !== null)
      .map((trend) => (labAskReason(trend) === "flagged by you" ? { ...trend.latest, ask: true } : trend.latest)),
    toRaise: state.therapyNotes.filter((note) => !note.shared && note.date <= asOf),
    notes: daily
      .filter((entry) => entry.note !== "")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((entry) => ({ date: entry.date, note: entry.note })),
  };
}

/** Plain text version of the report, for pasting into a message or a visit note. */
export type ReportOptions = {
  groups?: ReportRow["group"][];
  includeLabs?: boolean;
  includeTherapy?: boolean;
  includeNotes?: boolean;
};

export type ReportAudience = "doctor" | "therapy" | "all";

export function reportOptionsFor(audience: ReportAudience): ReportOptions {
  return {
    groups: audience === "therapy" ? ["Sleep", "Medication", "Mind"]
      : audience === "doctor" ? ["Sleep", "Medication", "Body", "Training"]
      : ["Sleep", "Medication", "Body", "Training", "Mind"],
    includeLabs: audience !== "therapy",
    includeTherapy: audience !== "doctor",
    includeNotes: false,
  };
}

export function reportRows(report: HealthReport, includeTherapy = true, groups?: ReportRow["group"][]): ReportRow[] {
  return report.rows.filter(
    (row) => (!groups || groups.includes(row.group)) && (includeTherapy || row.id !== "rumination"),
  );
}

export function reportToText(
  report: HealthReport,
  options: ReportOptions = { includeTherapy: true, includeNotes: true },
): string {
  const coverage: string[] = [];
  if (!options.groups || options.groups.includes("Sleep")) coverage.push(`sleep ${report.coverage.sleepNights}/${report.days} nights`);
  if (!options.groups || options.groups.includes("Medication")) coverage.push(`medication ${report.coverage.medicationDosesAnswered}/${report.coverage.medicationDosesDue} due doses`);
  const lines: string[] = [
    `Health summary: ${report.start} to ${report.end} (${report.days} days)`,
    ...(coverage.length ? [`Recorded: ${coverage.join(" · ")}`] : []),
    "",
  ];

  for (const group of ["Sleep", "Medication", "Body", "Training", "Mind"] as const) {
    const rows = reportRows(report, options.includeTherapy !== false, options.groups).filter((row) => row.group === group);
    if (!rows.length) continue;
    lines.push(`${group}`);
    for (const row of rows) lines.push(`  ${row.label}: ${row.value}${row.detail ? ` (${row.detail})` : ""}`);
    lines.push("");
  }

  if (options.includeLabs !== false && report.flaggedLabs.length) {
    lines.push("Flagged labs: latest result per test");
    for (const lab of report.flaggedLabs) {
      const status = labRangeStatus(lab);
      const reason = status === "low" || status === "high" ? status : "flagged";
      lines.push(
        `  ${lab.name} ${lab.value ?? "—"} ${lab.unit} on ${lab.date} (range ${lab.referenceLow ?? "—"} to ${lab.referenceHigh ?? "—"} · ${reason})`,
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
    "Self-recorded data",
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
      "water_ml",
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
        entry.waterMl,
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
      .sort((a, b) => compareWorkoutStarts(a.startedAt, b.startedAt) || a.exercise.localeCompare(b.exercise) || a.setNumber - b.setNumber)
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

/**
 * Rumination as a table: when it came back, what was done, whether it passed.
 * Not what it was about — the thought's own words stay in the editable JSON
 * backup and out of the sheet somebody might open in front of you.
 */
export function thoughtLoopsCsv(loops: ThoughtLoop[], events: LoopEvent[]): string {
  const live = new Set(loops.map((loop) => loop.id));
  return toCsv(
    ["id", "loop_id", "at", "date", "outcome", "response", "recurrence"],
    [...events]
      .filter((event) => live.has(event.loopId))
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((event) => [
        event.id, event.loopId, event.at, event.date, event.move, event.response ?? "", event.recurrence ?? "",
      ]),
  );
}

export function habitsCsv(habits: Habit[], events: HabitEvent[]): string {
  const names = new Map(habits.map((habit) => [habit.id, habit.name]));
  return toCsv(
    ["id", "habit_id", "habit", "at", "date", "kind", "amount_mg"],
    [...events].sort((a, b) => a.at.localeCompare(b.at)).map((event) => [
      event.id, event.habitId, names.get(event.habitId) ?? "", event.at, event.date, event.kind, event.amountMg ?? "",
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

/**
 * The photo table. `files` maps a photo id to the name the archive actually
 * wrote for it; without it the column guessed a name and pointed every row at
 * a file that was never in the zip. A photo whose bytes could not be read is
 * in the table with an empty file, because the record of it is still true.
 */
export function progressPhotosCsv(entries: ProgressPhoto[], files?: Map<string, string>): string {
  return toCsv(
    ["id", "date", "weight_lb", "body_fat_percent", "note", "image_file"],
    [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((entry) => [
      entry.id, entry.date, entry.weightLb, entry.bodyFatPercent, entry.note, files?.get(entry.id) ?? "",
    ]),
  );
}

export type PhaseProgress = {
  phase: "cut" | "bulk";
  start: string;
  weeks: number;
  startWeightLb: number | null;
  latestWeightLb: number | null;
  changeLb: number | null;
  /** Signed pounds a week, from the first week's average to the latest week's. */
  ratePerWeek: number | null;
  targetRateLb: number | null;
  pace: "on pace" | "slow" | "fast" | null;
  /** Protein for the phase: a gram per pound cutting, 0.8 bulking, to the nearest 5. */
  proteinSuggestedG: number | null;
  sentence: string;
};

/**
 * How a cut or bulk is going: the average of the first week's weights against
 * the average of the latest week's, as pounds a week, set against the rate you
 * asked for. Weekly averages, because a scale reading is water first and fat
 * second. Nothing while maintaining.
 */
export function phaseProgress(state: HealthState, asOf = todayLocal()): PhaseProgress | null {
  const { weightDirection, phaseStart, weeklyRateLb } = state.goals;
  if (weightDirection === "maintain") return null;
  const phase = weightDirection === "lose" ? "cut" : "bulk";
  const start = phaseStart && phaseStart <= asOf ? phaseStart : addDays(asOf, -28);
  const weights = state.dailyEntries.filter((entry) => typeof entry.weightLb === "number" && entry.date >= start && entry.date <= asOf);
  const avg = (from: string, to: string) => {
    const values = weights.filter((entry) => entry.date >= from && entry.date <= to).map((entry) => entry.weightLb as number);
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  };
  const startWeightLb = avg(start, addDays(start, 6));
  const latestWeightLb = avg(addDays(asOf, -6), asOf);
  const days = Math.max(1, daysBetween(start, asOf) + 1);
  const weeks = Math.max(1, Math.ceil(days / 7));
  const spanWeeks = Math.max(1, (days - 1) / 7);
  const changeLb = startWeightLb !== null && latestWeightLb !== null && days > 7 ? latestWeightLb - startWeightLb : null;
  const ratePerWeek = changeLb === null ? null : changeLb / spanWeeks;
  const targetRateLb = weeklyRateLb;
  let pace: PhaseProgress["pace"] = null;
  if (ratePerWeek !== null && targetRateLb !== null) {
    const towards = phase === "cut" ? -ratePerWeek : ratePerWeek;
    pace = towards >= targetRateLb * 0.75 && towards <= targetRateLb * 1.25 ? "on pace" : towards < targetRateLb * 0.75 ? "slow" : "fast";
  }
  const proteinSuggestedG = latestWeightLb === null ? null : Math.round((latestWeightLb * (phase === "cut" ? 1.0 : 0.8)) / 5) * 5;
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const parts: string[] = [`week ${weeks}`];
  if (latestWeightLb !== null) parts.push(`${round1(latestWeightLb)} lb`);
  if (changeLb !== null) parts.push(`${changeLb < 0 ? "down" : "up"} ${round1(Math.abs(changeLb))} lb since ${dateLabel(start, { month: "short", day: "numeric" })}`);
  if (ratePerWeek !== null) parts.push(`${round1(Math.abs(ratePerWeek))} lb/week${targetRateLb !== null ? ` (target ${targetRateLb})` : ""}${pace ? ` · ${pace}` : ""}`);
  return { phase, start, weeks, startWeightLb, latestWeightLb, changeLb, ratePerWeek, targetRateLb, pace, proteinSuggestedG, sentence: parts.join(" · ") };
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
      ["phase_start", goals.phaseStart],
      ["weekly_rate_lb", goals.weeklyRateLb],
      ["protein_target_g", goals.proteinTargetG],
      ["body_fat_target_percent", goals.bodyFatTargetPercent],
      ["training_days_by_block_week", goals.trainingDays.join("|")],
      ["training_split", goals.trainingSplit],
      ["training_session_minutes", goals.trainingSessionMinutes],
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

/** Compare imported timestamp formats without changing session identifiers. */
export function compareWorkoutStarts(a: string, b: string): number {
  return a.replace("T", " ").localeCompare(b.replace("T", " "));
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
    .sort((a, b) => compareWorkoutStarts(b.startedAt, a.startedAt));
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
      .sort((a, b) => compareWorkoutStarts(a.startedAt, b.startedAt));

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
