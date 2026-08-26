import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  bedtimeMinutes,
  compareDailyMetric,
  dateLabel,
  daysBetween,
  emptyHealthState,
  findRetiredFields,
  entriesInWindow,
  labRangeStatus,
  mergeRecords,
  normalizeDailyEntry,
  normalizeGoals,
  normalizeHealthState,
  normalizeLabResult,
  normalizeSleepEntry,
  normalizeWorkoutSet,
  preferredSleepEntries,
  sleepConsistencyRange,
  upsertDailyEntry,
  upsertLabResult,
  upsertSleepEntry,
  validIsoDate,
  averageBedtime,
  averageWakeTime,
  buildHealthReport,
  buildLabTrends,
  dailyEntriesCsv,
  estimateSleepHours,
  filterLabTrends,
  labResultsCsv,
  loggingCoverage,
  removeDailyEntry,
  removeLabResult,
  removeSleepEntry,
  reportToText,
  sleepDebtHours,
  sleepEntriesCsv,
  medicationAdherence,
  isDue,
  medicationStatus,
  medicationStatuses,
  dueToday,
  recordDose,
  upsertMedication,
  removeMedication,
  medicationDosesCsv,
} from "../app/health-model.ts";
import { chooseInitialState } from "../app/state-sync.ts";

const fixedNow = new Date("2030-01-15T12:00:00.000Z");

function daily(overrides = {}) {
  const entry = normalizeDailyEntry({ date: "2030-01-15", ...overrides });
  assert.ok(entry);
  return entry;
}

function sleep(overrides = {}) {
  const entry = normalizeSleepEntry({ date: "2030-01-15", source: "manual", ...overrides });
  assert.ok(entry);
  return entry;
}

function lab(overrides = {}) {
  const result = normalizeLabResult({
    id: "synthetic-marker-1",
    name: "Synthetic marker",
    date: "2030-01-15",
    ...overrides,
  });
  assert.ok(result);
  return result;
}

test("date helpers reject impossible dates and cross calendar boundaries safely", () => {
  assert.equal(validIsoDate("2028-02-29"), true);
  assert.equal(validIsoDate("2030-02-29"), false);
  assert.equal(validIsoDate("2030-02-31"), false);
  assert.equal(validIsoDate("2030-2-01"), false);
  assert.equal(addDays("2030-01-31", 1), "2030-02-01");
  assert.equal(addDays("2030-12-31", 1), "2031-01-01");
  assert.equal(addDays("2030-01-15", Number.NaN), "2030-01-15");
  assert.equal(addDays("2030-01-15", Number.POSITIVE_INFINITY), "2030-01-15");
  assert.equal(daysBetween("2030-03-09", "2030-03-12"), 3);
  assert.equal(daysBetween("invalid", "2030-03-12"), 0);
});

test("a newer offline copy wins initialization and is marked for sync", () => {
  const remote = normalizeHealthState({
    ...emptyHealthState(fixedNow),
    updatedAt: "2030-01-15T10:00:00.000Z",
  });
  const local = normalizeHealthState({
    ...remote,
    updatedAt: "2030-01-15T11:00:00.000Z",
    dailyEntries: [{ date: "2030-01-15", proteinG: 180 }],
  });

  const newerLocal = chooseInitialState(local, remote, emptyHealthState(fixedNow));
  assert.equal(newerLocal.state.dailyEntries[0].proteinG, 180);
  assert.equal(newerLocal.needsSync, true);

  const newerRemote = chooseInitialState(local, { ...remote, updatedAt: "2030-01-15T12:00:00.000Z" }, remote);
  assert.equal(newerRemote.state.dailyEntries.length, 0);
  assert.equal(newerRemote.needsSync, false);

  assert.equal(chooseInitialState(local, null, remote).needsSync, true, "a first local copy must seed an empty server");
});

test("normalization does not silently trim valid history", () => {
  const workoutSets = Array.from({ length: 20_001 }, (_, index) => ({
    date: addDays("2030-01-15", -(index % 365)),
    startedAt: `session-${index.toString(36)}`,
    workoutName: "Synthetic session",
    exercise: "Synthetic lift",
    setNumber: (index % 200) + 1,
    weightLb: 100,
    reps: 10,
  }));
  const state = normalizeHealthState({
    ...emptyHealthState(fixedNow),
    dailyEntries: Array.from({ length: 731 }, (_, index) => ({
      date: addDays("2030-01-15", -index),
      steps: 8_000 + index,
    })),
    labResults: Array.from({ length: 501 }, (_, index) => ({
      id: `synthetic-lab-${index}`,
      name: "Synthetic marker",
      date: addDays("2030-01-15", -index),
      value: index,
    })),
    workoutSets,
  });

  assert.equal(state.dailyEntries.length, 731);
  assert.equal(state.labResults.length, 501);
  assert.equal(state.workoutSets.length, 20_001);
});

test("date-only labels do not shift to the prior day west of UTC", { concurrency: false }, () => {
  const originalTimezone = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    assert.equal(dateLabel("2030-08-24"), "Aug 24");
    assert.equal(dateLabel("invalid"), "Unknown date");
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("daily normalization accepts numeric text, rejects coercion traps, and applies bounds", () => {
  const entry = normalizeDailyEntry({
    date: "2030-01-15",
    weightLb: [],
    steps: true,
    restingHeartRate: " 72 ",
    hrvMs: 900,
    medicationTaken: "false",
    proteinG: "182.5",
    caloriesKcal: 2_400,
    bodyFatPercent: 96,
    meditationMinutes: "12",
    meditationNote: "  box breathing  ",
    journaled: 1,
    note: "  synthetic note  ",
    // Fields an older version of this app recorded, now dropped on the way in.
    mood: 4,
    caffeineMg: 250,
  });

  assert.ok(entry);
  assert.equal(entry.weightLb, null, "an array is not a number");
  assert.equal(entry.steps, null, "true is not a number");
  assert.equal(entry.restingHeartRate, 72);
  assert.equal(entry.hrvMs, 500, "clamped to the physiological bound");
  assert.equal(entry.medicationTaken, false);
  assert.equal(entry.proteinG, 182.5);
  assert.equal(entry.caloriesKcal, 2_400);
  assert.equal(entry.bodyFatPercent, 70, "clamped to the plausible bound");
  assert.equal(entry.meditationMinutes, 12);
  assert.equal(entry.meditationNote, "box breathing");
  assert.equal(entry.journaled, true);
  assert.equal(entry.note, "synthetic note");
  assert.deepEqual(Object.keys(entry).sort(), [
    "bodyFatPercent",
    "caloriesKcal",
    "date",
    "hrvMs",
    "journaled",
    "medicationTaken",
    "meditationMinutes",
    "meditationNote",
    "note",
    "proteinG",
    "restingHeartRate",
    "steps",
    "weightLb",
  ]);
  assert.equal(normalizeDailyEntry({ date: "2030-02-31" }), null);
});

test("sleep normalization validates sources, times, scales, and physiological bounds", () => {
  const entry = normalizeSleepEntry({
    date: "2030-01-15",
    source: " OURA ",
    bedtime: "23:45",
    wakeTime: "7:05",
    durationHours: 30,
    quality: 3.6,
    efficiencyPercent: 150,
    deepHours: -1,
    remHours: "2.25",
    restingHeartRate: false,
    hrvMs: "75",
    note: "  synthetic sleep note  ",
  });

  assert.ok(entry);
  assert.equal(entry.source, "oura");
  assert.equal(entry.bedtime, "23:45");
  assert.equal(entry.wakeTime, "");
  assert.equal(entry.durationHours, 24);
  assert.equal(entry.quality, 4);
  assert.equal(entry.efficiencyPercent, 100);
  assert.equal(entry.deepHours, 0);
  assert.equal(entry.remHours, 2.25);
  assert.equal(entry.restingHeartRate, null);
  assert.equal(entry.hrvMs, 75);
  assert.equal(entry.note, "synthetic sleep note");
  assert.equal(normalizeSleepEntry({ date: "not-a-date" }), null);
});

test("lab and goal normalization produce safe, deterministic records", () => {
  const result = normalizeLabResult({
    name: "  Synthetic marker  ",
    date: "2030-01-15",
    value: "12.5",
    unit: " units ",
    referenceLow: "10",
    referenceHigh: "20",
  });
  assert.ok(result);
  assert.equal(result.id, "2030-01-15-synthetic-marker");
  assert.equal(result.name, "Synthetic marker");
  assert.equal(result.value, 12.5);
  assert.equal(result.unit, "units");
  assert.equal(labRangeStatus(result), "within");
  assert.equal(labRangeStatus({ ...result, value: 5 }), "low");
  assert.equal(labRangeStatus({ ...result, value: 25 }), "high");
  assert.equal(labRangeStatus({ ...result, referenceLow: 30, referenceHigh: 20 }), "unrated");
  assert.equal(normalizeLabResult({ date: "2030-01-15", name: "  " }), null);

  const goals = normalizeGoals({
    sleepHours: 99,
    sleepConsistencyMinutes: 0,
    trackMedication: "false",
    weightGoalLb: true,
    weightDirection: "gain",
    // Targets this app no longer keeps are dropped rather than carried forever.
    stepGoal: 8_000,
    journalDaysPerWeek: 4,
  });
  assert.equal(goals.sleepHours, 14);
  assert.equal(goals.sleepConsistencyMinutes, 15);
  assert.equal(goals.trackMedication, false);
  assert.equal(goals.weightGoalLb, null);
  assert.equal(goals.weightDirection, "gain");
  assert.deepEqual(Object.keys(goals).sort(), [
    "addedSets",
    "bodyFatTargetPercent",
    "proteinTargetG",
    "sleepConsistencyMinutes",
    "sleepHours",
    "trackMedication",
    "trainingDays",
    "weightDirection",
    "weightGoalLb",
  ]);

  // Lifts added by hand are the one part of the goals a button writes to, so
  // what arrives is bounded, de-duplicated, and dropped unless it is complete.
  const added = normalizeGoals({
    addedSets: [
      { weekStart: "2030-01-14", session: "Lower A", exercise: "  Hip Thrust (Barbell) ", sets: "2" },
      { weekStart: "2030-01-14", session: "Lower A", exercise: "Hip Thrust (Barbell)", sets: 3 },
      { weekStart: "not a date", session: "Lower A", exercise: "Hip Thrust (Barbell)", sets: 2 },
      { weekStart: "2030-01-14", session: "  ", exercise: "Hip Thrust (Barbell)", sets: 2 },
      { weekStart: "2030-01-14", session: "Lower A", exercise: "Cable Crunch", sets: 99 },
      "nonsense",
    ],
  }).addedSets;
  assert.deepEqual(added, [
    { weekStart: "2030-01-14", session: "Lower A", exercise: "Hip Thrust (Barbell)", sets: 2 },
    // Out of range is clamped rather than dropped: the intent was clear.
    { weekStart: "2030-01-14", session: "Lower A", exercise: "Cable Crunch", sets: 5 },
  ]);
  assert.deepEqual(normalizeGoals({ addedSets: "no" }).addedSets, []);
  assert.equal(normalizeGoals({ addedSets: Array.from({ length: 200 }, (_, i) => ({
    weekStart: "2030-01-14", session: "Lower A", exercise: `Lift ${i}`, sets: 2,
  })) }).addedSets.length, 40);
});

test("state normalization removes invalid records, deduplicates keys, and sorts newest first", () => {
  const state = normalizeHealthState({
    updatedAt: "2030-01-15T12:30:00Z",
    dailyEntries: [
      { date: "2030-01-14", steps: 4_000, note: "first" },
      { date: "2030-01-15", steps: 5_000 },
      { date: "2030-01-14", steps: 1_000, note: "duplicate" },
      { date: "2030-02-31", steps: 3_000 },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "apple", durationHours: 8 },
      { date: "2030-01-15", source: "oura", durationHours: 9 },
      { date: "2030-01-15", source: "apple", durationHours: 2 },
    ],
    labResults: [
      { id: "marker-a", name: "Synthetic marker", date: "2030-01-12", value: 1 },
      { id: "marker-a", name: "Synthetic marker", date: "2030-01-11", value: 2 },
    ],
    goals: {},
  });

  assert.deepEqual(state.dailyEntries.map((entry) => entry.date), ["2030-01-15", "2030-01-14"]);
  assert.equal(state.dailyEntries[1].note, "first");
  assert.equal(state.sleepEntries.length, 2);
  assert.equal(state.sleepEntries.find((entry) => entry.source === "apple")?.durationHours, 8);
  assert.equal(state.labResults.length, 1);
  assert.equal(state.labResults[0].value, 1);
  assert.equal(state.updatedAt, "2030-01-15T12:30:00.000Z");
});

test("upsert helpers replace only matching records", () => {
  let state = emptyHealthState(fixedNow);
  state = upsertDailyEntry(state, { date: "2030-01-15", steps: 2_000 });
  state = upsertDailyEntry(state, { date: "2030-01-15", steps: 5_000 });
  assert.equal(state.dailyEntries.length, 1);
  assert.equal(state.dailyEntries[0].steps, 5_000);

  state = upsertSleepEntry(state, { date: "2030-01-15", source: "apple", durationHours: 7 });
  state = upsertSleepEntry(state, { date: "2030-01-15", source: "oura", durationHours: 8 });
  state = upsertSleepEntry(state, { date: "2030-01-15", source: "apple", durationHours: 9 });
  assert.equal(state.sleepEntries.length, 2);
  assert.equal(state.sleepEntries.find((entry) => entry.source === "apple")?.durationHours, 9);

  state = upsertLabResult(state, lab({ value: 1 }));
  state = upsertLabResult(state, lab({ value: 2 }));
  assert.equal(state.labResults.length, 1);
  assert.equal(state.labResults[0].value, 2);
});

test("merging records normalizes values, drops bad dates, and never blanks a field", () => {
  const initial = mergeRecords(emptyHealthState(fixedNow), {
    dailyEntries: [{ date: "2030-01-15", medicationTaken: true, weightLb: 180 }],
  });

  const merged = mergeRecords(initial, {
    dailyEntries: [
      { date: "2030-01-15", steps: "10000", weightLb: null },
      { date: "invalid", steps: 1 },
    ],
    sleepEntries: [{ date: "2030-01-15", source: "whoop", durationHours: "8.5" }],
    labResults: [{ id: "marker-b", name: "Synthetic marker B", date: "2030-01-10", value: "3" }],
  });

  assert.equal(merged.dailyEntries.length, 1, "the unparseable date is dropped");
  assert.equal(merged.dailyEntries[0].steps, 10_000);
  assert.equal(merged.dailyEntries[0].medicationTaken, true, "medication the file did not carry survives");
  assert.equal(merged.dailyEntries[0].weightLb, 180, "an explicit null does not blank a recorded weight");
  assert.equal(merged.sleepEntries[0].source, "whoop");
  assert.equal(merged.sleepEntries[0].durationHours, 8.5);
  assert.equal(merged.labResults[0].value, 3);
});

test("preferred sleep entries select one source per date by declared priority", () => {
  const entries = [
    sleep({ date: "2030-01-15", source: "manual", durationHours: 6 }),
    sleep({ date: "2030-01-15", source: "apple", durationHours: 7 }),
    sleep({ date: "2030-01-15", source: "oura", durationHours: 8 }),
    sleep({ date: "2030-01-14", source: "whoop", durationHours: 9 }),
  ];
  const preferred = preferredSleepEntries(entries);
  assert.equal(preferred.length, 2);
  assert.equal(preferred[0].source, "oura");
  assert.equal(preferred[1].source, "whoop");
});

test("window and comparison helpers use adjacent, non-overlapping calendar periods", () => {
  const entries = [];
  for (let index = 0; index < 14; index += 1) {
    entries.push(daily({ date: addDays("2030-01-01", index), steps: index < 7 ? 2_000 : 4_000 }));
  }
  const comparison = compareDailyMetric(entries, "steps", "2030-01-14", 7);
  assert.equal(comparison.current, 4_000);
  assert.equal(comparison.previous, 2_000);
  assert.equal(comparison.change, 2_000);
  assert.equal(comparison.currentCount, 7);
  assert.equal(comparison.previousCount, 7);
  assert.equal(entriesInWindow(entries, "invalid", 7).length, 0);
  assert.equal(entriesInWindow(entries, "2030-01-14", Number.NaN).length, 1);
});

test("bedtime consistency handles the midnight boundary", () => {
  assert.equal(bedtimeMinutes("23:45"), 1_425);
  assert.equal(bedtimeMinutes("00:15"), 1_455);
  assert.equal(bedtimeMinutes("24:00"), null);
  assert.equal(
    sleepConsistencyRange([
      sleep({ date: "2030-01-14", bedtime: "23:45" }),
      sleep({ date: "2030-01-15", bedtime: "00:15" }),
    ]),
    30,
  );
});

test("medication adherence counts only the days that were recorded", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", weightLb: 180, medicationTaken: true },
      { date: "2030-01-14", weightLb: 181, medicationTaken: false },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "apple", durationHours: 5, bedtime: "23:30" },
      { date: "2030-01-15", source: "oura", durationHours: 9, bedtime: "22:45" },
      { date: "2030-01-14", source: "manual", durationHours: 8, bedtime: "23:55" },
    ],
    labResults: [],
    goals: { sleepHours: 9, sleepConsistencyMinutes: 60, weightGoalLb: 170, weightDirection: "lose" },
  });

  const adherence = medicationAdherence(state, "2030-01-15", 14);
  assert.deepEqual(adherence, { taken: 1, missed: 1, recorded: 2, percent: 50 });
  // Twelve unrecorded days are unknown, not missed.
  assert.equal(medicationAdherence(emptyHealthState(fixedNow), "2030-01-15").percent, null);

  // Oura wins the night over Apple, so a week's average is 8.5 and not 7.3.
  const nights = entriesInWindow(preferredSleepEntries(state.sleepEntries), "2030-01-15", 7);
  assert.equal(nights.length, 2);
  assert.equal(nights.map((entry) => entry.durationHours).reduce((a, b) => a + b, 0) / 2, 8.5);
});

test("retired fields are found in a stored payload even when their values are null", () => {
  const stored = {
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", mood: 4, therapy: true, steps: 8_000 },
      { date: "2030-01-14", mood: null, caffeineMg: 250 },
      // Journaling came back, so it is a live field and not a retired one.
      { date: "2030-01-13", steps: 6_000, journaled: true },
    ],
    sleepEntries: [{ date: "2030-01-15", source: "oura", durationHours: 8 }],
    labResults: [],
    goals: { sleepHours: 9, stepGoal: 8_000, journalDaysPerWeek: 4 },
  };

  const found = findRetiredFields(stored);
  // A key counts even when it holds null: the name is still written in the row.
  assert.deepEqual(found.fields, ["caffeineMg", "journalDaysPerWeek", "mood", "stepGoal", "therapy"]);
  assert.equal(found.records, 2, "the third day carries nothing retired");

  // Normalizing is what removes them, so a normalized payload reports clean.
  assert.deepEqual(findRetiredFields(normalizeHealthState(stored)), { fields: [], records: 0 });
  assert.deepEqual(findRetiredFields(emptyHealthState(fixedNow)), { fields: [], records: 0 });
  assert.deepEqual(findRetiredFields("not a record"), { fields: [], records: 0 });
});

test("removal helpers drop exactly one record and leave the rest untouched", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [daily(), daily({ date: "2030-01-14" })],
    sleepEntries: [sleep(), sleep({ source: "oura" }), sleep({ date: "2030-01-14" })],
    labResults: [lab(), lab({ id: "synthetic-marker-2", date: "2030-01-10" })],
    goals: {},
  });

  assert.deepEqual(removeDailyEntry(state, "2030-01-14").dailyEntries.map((entry) => entry.date), ["2030-01-15"]);
  assert.equal(removeDailyEntry(state, "2029-12-01").dailyEntries.length, 2);

  const withoutOura = removeSleepEntry(state, "2030-01-15", "oura");
  assert.deepEqual(
    withoutOura.sleepEntries.map((entry) => `${entry.date}:${entry.source}`).sort(),
    ["2030-01-14:manual", "2030-01-15:manual"],
  );

  assert.deepEqual(removeLabResult(state, "synthetic-marker-1").labResults.map((result) => result.id), [
    "synthetic-marker-2",
  ]);
});

test("sleep timing helpers cross midnight instead of averaging to noon", () => {
  assert.equal(estimateSleepHours("23:30", "07:15"), 7.75);
  assert.equal(estimateSleepHours("01:00", "09:00"), 8);
  assert.equal(estimateSleepHours("07:00", "07:00"), 24);
  assert.equal(estimateSleepHours("bad", "07:00"), null);

  const nights = [
    sleep({ bedtime: "23:50", wakeTime: "07:10" }),
    sleep({ date: "2030-01-14", bedtime: "00:10", wakeTime: "06:50" }),
  ];
  assert.equal(averageBedtime(nights), "00:00");
  assert.equal(averageWakeTime(nights), "07:00");
  assert.equal(averageBedtime([sleep({ bedtime: "" })]), null);
});

test("sleep debt counts only nights below goal", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [],
    sleepEntries: [
      { date: "2030-01-15", source: "manual", durationHours: 7 },
      { date: "2030-01-14", source: "manual", durationHours: 10 },
      { date: "2030-01-13", source: "manual", durationHours: 8 },
    ],
    labResults: [],
    goals: { sleepHours: 9 },
  });
  assert.equal(sleepDebtHours(state, "2030-01-15", 7), 3);
  assert.equal(sleepDebtHours(emptyHealthState(fixedNow), "2030-01-15", 7), null);
});

test("lab trends group repeated tests, expose the change, and filter by name", () => {
  const trends = buildLabTrends([
    lab({ id: "a", name: "Ferritin", date: "2030-01-15", value: 40, unit: "ng/mL", referenceLow: 30, referenceHigh: 300 }),
    lab({ id: "b", name: " ferritin ", date: "2029-07-01", value: 25, unit: "ng/mL", referenceLow: 30, referenceHigh: 300 }),
    lab({ id: "c", name: "Vitamin D", date: "2029-02-01", value: 20, unit: "ng/mL" }),
  ]);

  assert.deepEqual(trends.map((trend) => trend.name), ["Ferritin", "Vitamin D"]);
  assert.equal(trends[0].results.length, 2);
  assert.equal(trends[0].change, 15);
  assert.equal(trends[0].status, "within");
  assert.equal(trends[1].change, null);
  assert.deepEqual(filterLabTrends(trends, " VITAMIN ").map((trend) => trend.name), ["Vitamin D"]);
  assert.equal(filterLabTrends(trends, "  ").length, 2);
});

test("coverage counts recorded medication days and nights, once each", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", medicationTaken: true },
      { date: "2030-01-14", medicationTaken: false },
      { date: "2030-01-13", weightLb: 180 },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "manual", durationHours: 8 },
      { date: "2030-01-15", source: "oura", durationHours: 8.2 },
    ],
    labResults: [],
    goals: {},
  });
  const coverage = loggingCoverage(state, "2030-01-15", 10);
  assert.equal(coverage.medicationDays, 2);
  assert.equal(coverage.sleepNights, 1, "two sources, one night");
  assert.equal(coverage.medicationPercent, 20);
});

test("the appointment report reports thin data as thin and flags entered ranges only", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", medicationTaken: true, steps: 9_000, weightLb: 180, restingHeartRate: 54, note: "steady" },
      { date: "2030-01-14", medicationTaken: false, steps: 3_000, weightLb: 182, restingHeartRate: 58 },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "oura", durationHours: 9.5, bedtime: "23:00", wakeTime: "08:30", restingHeartRate: 54 },
      { date: "2030-01-14", source: "manual", durationHours: 7, bedtime: "00:30", wakeTime: "07:30", restingHeartRate: 58 },
    ],
    labResults: [
      { id: "low-one", name: "Ferritin", date: "2030-01-02", value: 10, unit: "ng/mL", referenceLow: 30, referenceHigh: 300 },
      { id: "no-range", name: "Copper", date: "2030-01-02", value: 90, unit: "mcg/dL" },
      { id: "old-low", name: "Vitamin D", date: "2028-01-02", value: 9, unit: "ng/mL", referenceLow: 30, referenceHigh: 100 },
      { id: "new-fine", name: "Vitamin D", date: "2029-06-02", value: 52, unit: "ng/mL", referenceLow: 30, referenceHigh: 100 },
    ],
    goals: { sleepHours: 9 },
  });

  const report = buildHealthReport(state, "2030-01-15", 7);
  assert.equal(report.start, "2030-01-09");
  assert.equal(report.end, "2030-01-15");
  const row = (id) => report.rows.find((item) => item.id === id);
  assert.equal(row("sleep-duration").value, "8.3 h");
  assert.match(row("sleep-duration").detail, /from 2 recorded nights of 7/);
  assert.equal(row("sleep-goal-nights").value, "1 of 2");
  assert.match(row("sleep-consistency").detail, /typical 11:45 PM to 8:00 AM/);
  // The old single tick migrates to one medication, and the report counts it
  // over the doses it was due rather than over the days in the period.
  assert.equal(row("medication-medication").label, "Medication");
  assert.equal(row("medication-medication").value, "50%");
  assert.match(row("medication-medication").detail, /1 taken, 1 missed of 2 daily doses due · 1 in a row/);
  assert.equal(row("medication"), undefined, "no roll-up row when there is only one");
  assert.equal(row("sleep-source").value, "Oura, Manual");
  assert.equal(row("weight").value, "180.0 lb");
  assert.equal(row("weight").detail, "-2.0 lb across the period");
  assert.equal(row("resting-heart-rate").value, "56 bpm");
  // The same reading on the day and on the night is one reading, not two.
  assert.equal(row("resting-heart-rate").detail, "from 2 recorded readings of 7");
  assert.equal(row("hrv").value, "No data");
  assert.equal(row("steps").value, "6,000");
  // Mood scales are gone for good; journalling and meditation are deliberately back.
  assert.equal(report.rows.some((row) => /mood|anxiety|stress|energy/i.test(row.label)), false);
  assert.equal(row("meditation").value, "No data");
  assert.equal(row("journal").value, "No data");
  assert.equal(row("workouts").value, "0");
  assert.equal(row("body-fat").value, "No data");
  assert.equal(row("protein").value, "No data");
  assert.deepEqual(report.toRaise, []);
  // Only the newest result per test is judged, so a corrected marker drops off.
  assert.deepEqual(report.flaggedLabs.map((result) => result.id), ["low-one"]);
  assert.deepEqual(report.notes, [{ date: "2030-01-15", note: "steady" }]);

  const text = reportToText(report);
  assert.match(text, /Health summary: 2030-01-09 to 2030-01-15 \(7 days\)/);
  assert.match(text, /Medication: 50%/);
  assert.match(text, /Ferritin 10 ng\/mL on 2030-01-02/);
  assert.doesNotMatch(text, /Vitamin D/);
  assert.match(text, /not a diagnosis/);
  assert.doesNotMatch(text, /Copper/);
});

test("csv export quotes separators and preserves missing values as empty cells", () => {
  const csv = dailyEntriesCsv([
    daily({ date: "2030-01-14", medicationTaken: true, steps: 8_000, note: 'comma, "quote" and\nnewline' }),
    daily({ date: "2030-01-15" }),
  ]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "date,medication_taken,weight_lb,steps,resting_heart_rate,hrv_ms,note");
  assert.match(lines[1], /^2030-01-14,yes,,8000,,,/);
  assert.match(csv, /"comma, ""quote"" and\nnewline"/);
  assert.equal(lines.at(-1), "2030-01-15,,,,,,");

  assert.match(sleepEntriesCsv([sleep({ bedtime: "23:00", durationHours: 8 })]), /2030-01-15,manual,23:00,,8,/);
  assert.match(
    labResultsCsv([lab({ value: 12, unit: "ng/mL", referenceLow: 30, referenceHigh: 300 })]),
    /2030-01-15,Synthetic marker,12,ng\/mL,30,300,low,/,
  );
});

test("the report carries training, nutrition and mind, and the list of things to raise", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", bodyFatPercent: 18.4, proteinG: 190, meditationMinutes: 20, journaled: true },
      { date: "2030-01-13", bodyFatPercent: 19.6, proteinG: 120, meditationMinutes: 10 },
      // Outside the window: it must not move body fat, protein, or the counts.
      { date: "2029-12-01", bodyFatPercent: 30, proteinG: 400, meditationMinutes: 90, journaled: true },
    ],
    workoutSets: [
      { date: "2030-01-15", startedAt: "2030-01-15 07:00", workoutName: "Push", exercise: "Bench Press", setNumber: 1, weightLb: 185, reps: 5 },
      { date: "2030-01-15", startedAt: "2030-01-15 07:00", workoutName: "Push", exercise: "Bench Press", setNumber: 2, weightLb: 185, reps: 5 },
      { date: "2030-01-13", startedAt: "2030-01-13 07:00", workoutName: "Pull", exercise: "Barbell Row", setNumber: 1, weightLb: 135, reps: 10 },
    ],
    therapyNotes: [
      { id: "raise-me", date: "2030-01-14", text: "The commute is the worst part of the week." },
      { id: "already", date: "2030-01-10", text: "Already covered", shared: true, sharedDate: "2030-01-12" },
    ],
    goals: { proteinTargetG: 180 },
  });

  const report = buildHealthReport(state, "2030-01-15", 7);
  const row = (id) => report.rows.find((item) => item.id === id);

  assert.equal(row("body-fat").value, "18.4%");
  assert.equal(row("body-fat").detail, "-1.2 points across the period");
  assert.equal(row("protein").value, "155 g a day");
  assert.equal(row("protein").detail, "1 of 2 recorded days at or above 180 g");

  assert.equal(row("workouts").value, "2");
  assert.match(row("workouts").detail, /3 working sets/);
  // 185 × 5 × 2 + 135 × 10 = 3,200
  assert.equal(row("volume").value, "3,200 lb");
  assert.equal(row("volume").detail, "2 distinct exercises");
  // Both lifts appear once, and a first attempt is a baseline rather than a record.
  assert.equal(row("records").value, "0");
  assert.equal(row("records").detail, "none set in this period");

  assert.equal(row("meditation").value, "2 of 7 days");
  assert.equal(row("meditation").detail, "30 minutes in total");
  assert.equal(row("journal").value, "1 of 7 days");

  // Only what has not been raised yet, and it survives into the copied text.
  assert.deepEqual(report.toRaise.map((note) => note.id), ["raise-me"]);
  const text = reportToText(report);
  assert.match(text, /To raise\n {2}The commute is the worst part of the week\./);
  assert.doesNotMatch(text, /Already covered/);
});

// --- Medications, each with its own schedule ---------------------------------

function meds(overrides = {}) {
  return normalizeHealthState(
    {
      medications: [
        { id: "fin", name: "Finasteride", schedule: "daily", dueDay: null, archived: false },
        { id: "ozem", name: "Ozempic", schedule: "weekly", dueDay: 2, archived: false },
      ],
      ...overrides,
    },
    fixedNow,
  );
}

test("a weekly medication is only due on its day", () => {
  const state = meds();
  const [fin, ozempic] = state.medications;

  // 2030-01-15 is a Tuesday.
  assert.equal(new Date("2030-01-15T12:00:00Z").getUTCDay(), 2);
  assert.equal(isDue(fin, "2030-01-15"), true);
  assert.equal(isDue(fin, "2030-01-16"), true, "a daily one is due every day");
  assert.equal(isDue(ozempic, "2030-01-15"), true);
  assert.equal(isDue(ozempic, "2030-01-16"), false, "and not on the six days it is not");
  assert.equal(isDue({ ...fin, archived: true }, "2030-01-15"), false, "archived is never due");
});

test("a weekly medication says when it is next due instead of reading missed", () => {
  const state = meds();
  const ozempic = state.medications[1];
  const wednesday = medicationStatus(state, ozempic, "2030-01-16");

  assert.equal(wednesday.dueToday, false);
  assert.equal(wednesday.today, null);
  assert.equal(wednesday.missed, 0, "an undue day is not a missed day");
  assert.equal(wednesday.nextDue, "2030-01-22", "the following Tuesday");
});

test("a dose is recorded against one medication and tapping again clears it", () => {
  let state = meds();
  state = recordDose(state, "fin", "2030-01-15", true);
  state = recordDose(state, "ozem", "2030-01-15", false);

  const [fin, ozempic] = medicationStatuses(state, "2030-01-15");
  assert.equal(fin.today, true);
  assert.equal(ozempic.today, false, "answering one answers only that one");

  state = recordDose(state, "fin", "2030-01-15", null);
  assert.equal(medicationStatus(state, state.medications[0], "2030-01-15").today, null);
  assert.equal(
    state.medicationDoses.filter((dose) => dose.medicationId === "fin").length,
    0,
    "clearing removes the dose rather than storing a third state",
  );
});

test("adherence and streak count only the days a medication was due", () => {
  let state = meds();
  for (const date of ["2030-01-15", "2030-01-14", "2030-01-13"]) {
    state = recordDose(state, "fin", date, true);
  }
  state = recordDose(state, "fin", "2030-01-12", false);

  const daily = medicationStatus(state, state.medications[0], "2030-01-15", 30);
  assert.equal(daily.taken, 3);
  assert.equal(daily.missed, 1);
  assert.equal(daily.recorded, 4);
  assert.equal(daily.percent, 75);
  assert.equal(daily.streak, 3);

  // Two Tuesdays back, both taken: a weekly one is at 100% on two doses, not
  // at 2 of 30 days.
  let weekly = state;
  weekly = recordDose(weekly, "ozem", "2030-01-15", true);
  weekly = recordDose(weekly, "ozem", "2030-01-08", true);
  const shot = medicationStatus(weekly, weekly.medications[1], "2030-01-15", 30);
  assert.equal(shot.recorded, 2);
  assert.equal(shot.percent, 100);
  assert.equal(shot.streak, 2);
});

test("a day of ticks written before medications had names survives the change", () => {
  const state = normalizeHealthState(
    {
      dailyEntries: [
        { date: "2030-01-15", medicationTaken: true },
        { date: "2030-01-14", medicationTaken: false },
      ],
    },
    fixedNow,
  );

  assert.equal(state.medications.length, 1, "the old tick becomes one medication");
  const carried = medicationStatus(state, state.medications[0], "2030-01-15");
  assert.equal(carried.today, true);
  assert.equal(carried.taken, 1);
  assert.equal(carried.missed, 1);
});

test("adding, editing and deleting a medication", () => {
  let state = meds();
  state = upsertMedication(state, {
    id: "prozac",
    name: "Prozac",
    schedule: "daily",
    dueDay: null,
    archived: false,
  });
  assert.deepEqual(
    state.medications.map((medication) => medication.name),
    ["Finasteride", "Ozempic", "Prozac"],
  );

  state = upsertMedication(state, { ...state.medications[2], name: "Fluoxetine" });
  assert.equal(state.medications[2].name, "Fluoxetine", "an edit keeps its place in the list");
  assert.equal(state.medications.length, 3);

  state = recordDose(state, "prozac", "2030-01-15", true);
  state = removeMedication(state, "prozac");
  assert.equal(state.medications.length, 2);
  assert.equal(
    state.medicationDoses.some((dose) => dose.medicationId === "prozac"),
    false,
    "and takes what was recorded against it",
  );
});

test("dueToday lists what is still to answer", () => {
  let state = meds();
  assert.deepEqual(
    dueToday(state, "2030-01-15").map((status) => status.medication.name),
    ["Finasteride", "Ozempic"],
  );
  assert.deepEqual(
    dueToday(state, "2030-01-16").map((status) => status.medication.name),
    ["Finasteride"],
    "the weekly one is not asked about on a Wednesday",
  );

  state = recordDose(state, "fin", "2030-01-15", true);
  assert.deepEqual(
    dueToday(state, "2030-01-15").map((status) => status.medication.name),
    ["Ozempic"],
    "and an answered one drops off",
  );
});

test("the doses export names the medication rather than its id", () => {
  let state = meds();
  state = recordDose(state, "fin", "2030-01-15", true);
  state = recordDose(state, "ozem", "2030-01-15", false);

  const csv = medicationDosesCsv(state);
  assert.equal(csv.split("\n")[0], "date,medication,schedule,taken");
  assert.match(csv, /2030-01-15,Finasteride,daily,yes/);
  assert.match(csv, /2030-01-15,Ozempic,weekly,no/);
});

test("a superset marker is not part of the lift's name", () => {
  const starred = normalizeWorkoutSet({
    date: "2030-01-15",
    exercise: "*Cable Row (Mid-Back)",
    setNumber: 1,
    weightLb: 115,
    reps: 9,
  });
  assert.equal(starred?.exercise, "Cable Row (Mid-Back)");

  // So a lift supersetted on one day and not on the next is one history, not two.
  const plain = normalizeWorkoutSet({ date: "2030-01-16", exercise: "Cable Row (Mid-Back)", setNumber: 1 });
  assert.equal(starred?.exercise, plain?.exercise);

  // A name that is nothing but the marker is not a lift.
  assert.equal(normalizeWorkoutSet({ date: "2030-01-15", exercise: "*", setNumber: 1 }), null);
});
