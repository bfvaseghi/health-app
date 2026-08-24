import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  bedtimeMinutes,
  buildGoalSummaries,
  buildHealthSyncPrompt,
  buildInsights,
  compareDailyMetric,
  dateLabel,
  daysBetween,
  emptyHealthState,
  entriesInWindow,
  labRangeStatus,
  mergeHealthSyncPacket,
  normalizeDailyEntry,
  normalizeGoals,
  normalizeHealthState,
  normalizeLabResult,
  normalizeSleepEntry,
  preferredSleepEntries,
  sleepConsistencyRange,
  upsertDailyEntry,
  upsertLabResult,
  upsertSleepEntry,
  validIsoDate,
} from "../app/health-model.ts";

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
    mood: "4.6",
    anxiety: -10,
    energy: "2.4",
    stress: 3,
    weightLb: [],
    steps: true,
    restingHeartRate: " 72 ",
    hrvMs: 900,
    medicationTaken: "false",
    journaled: 1,
    therapy: "unexpected",
    exerciseMinutes: 2_000,
    outdoorMinutes: " ",
    caffeineMg: "250",
    alcoholDrinks: -4,
    note: "  synthetic note  ",
  });

  assert.ok(entry);
  assert.equal(entry.mood, 5);
  assert.equal(entry.anxiety, 1);
  assert.equal(entry.energy, 2);
  assert.equal(entry.weightLb, null);
  assert.equal(entry.steps, null);
  assert.equal(entry.restingHeartRate, 72);
  assert.equal(entry.hrvMs, 500);
  assert.equal(entry.medicationTaken, false);
  assert.equal(entry.journaled, true);
  assert.equal(entry.therapy, false);
  assert.equal(entry.exerciseMinutes, 1_440);
  assert.equal(entry.outdoorMinutes, null);
  assert.equal(entry.caffeineMg, 250);
  assert.equal(entry.alcoholDrinks, 0);
  assert.equal(entry.note, "synthetic note");
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
    stepGoal: "12345.6",
    medicationDaysPerWeek: 20,
    journalDaysPerWeek: -2,
    therapySessionsPerMonth: "6.4",
    exerciseDaysPerWeek: " ",
    weightGoalLb: true,
    weightDirection: "gain",
    caffeineGuideMg: Number.NaN,
  });
  assert.equal(goals.sleepHours, 14);
  assert.equal(goals.sleepConsistencyMinutes, 15);
  assert.equal(goals.stepGoal, 12_346);
  assert.equal(goals.medicationDaysPerWeek, 7);
  assert.equal(goals.journalDaysPerWeek, 0);
  assert.equal(goals.therapySessionsPerMonth, 6);
  assert.equal(goals.exerciseDaysPerWeek, 3);
  assert.equal(goals.weightGoalLb, null);
  assert.equal(goals.weightDirection, "gain");
  assert.equal(goals.caffeineGuideMg, 400);
});

test("state normalization removes invalid records, deduplicates keys, and sorts newest first", () => {
  const state = normalizeHealthState({
    updatedAt: "2030-01-15T12:30:00Z",
    dailyEntries: [
      { date: "2030-01-14", mood: 4, note: "first" },
      { date: "2030-01-15", mood: 5 },
      { date: "2030-01-14", mood: 1, note: "duplicate" },
      { date: "2030-02-31", mood: 3 },
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
  state = upsertDailyEntry(state, { date: "2030-01-15", mood: 2 });
  state = upsertDailyEntry(state, { date: "2030-01-15", mood: 5 });
  assert.equal(state.dailyEntries.length, 1);
  assert.equal(state.dailyEntries[0].mood, 5);

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

test("sync packets merge valid synthetic records and reject unrelated files", () => {
  const initial = emptyHealthState(fixedNow);
  assert.throws(
    () => mergeHealthSyncPacket(initial, { kind: "unrelated", version: 1 }),
    /not a Bardia Health sync file/i,
  );

  const merged = mergeHealthSyncPacket(initial, {
    kind: "bardia-health-sync",
    version: 1,
    dailyEntries: [{ date: "2030-01-15", steps: "10000" }, { date: "invalid", steps: 1 }],
    sleepEntries: [{ date: "2030-01-15", source: "whoop", durationHours: "8.5" }],
    labResults: [{ id: "marker-b", name: "Synthetic marker B", date: "2030-01-10", value: "3" }],
  });
  assert.equal(merged.dailyEntries.length, 1);
  assert.equal(merged.dailyEntries[0].steps, 10_000);
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
    entries.push(daily({ date: addDays("2030-01-01", index), mood: index < 7 ? 2 : 4 }));
  }
  const comparison = compareDailyMetric(entries, "mood", "2030-01-14", 7);
  assert.equal(comparison.current, 4);
  assert.equal(comparison.previous, 2);
  assert.equal(comparison.change, 2);
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

test("goal summaries use preferred sleep, disclose recorded-day coverage, and evaluate weight direction", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", steps: 10_000, weightLb: 180, therapy: true },
      { date: "2030-01-14", steps: 6_000, weightLb: 181 },
      { date: "2030-01-31", therapy: true },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "apple", durationHours: 5 },
      { date: "2030-01-15", source: "oura", durationHours: 9 },
      { date: "2030-01-14", source: "manual", durationHours: 8 },
    ],
    labResults: [],
    goals: { sleepHours: 9, stepGoal: 8_000, weightGoalLb: 170, weightDirection: "lose" },
  });
  const summaries = buildGoalSummaries(state, "2030-01-15");
  assert.equal(summaries.find((item) => item.id === "sleep")?.value, "8.5 h");
  assert.equal(summaries.find((item) => item.id === "steps")?.value, "8,000");
  assert.match(summaries.find((item) => item.id === "steps")?.detail ?? "", /2 recorded days/);
  assert.equal(summaries.find((item) => item.id === "therapy")?.value, "1 / 4");
  assert.equal(summaries.find((item) => item.id === "weight")?.value, "180.0 lb");
  assert.equal(summaries.find((item) => item.id === "weight")?.status, "watch");

  const atGoal = buildGoalSummaries(
    normalizeHealthState({ ...state, dailyEntries: [{ date: "2030-01-15", weightLb: 170 }] }),
    "2030-01-15",
  );
  assert.equal(atGoal.find((item) => item.id === "weight")?.status, "good");
});

test("an empty recent window produces a baseline insight before habit coaching", () => {
  const empty = emptyHealthState(fixedNow);
  const summaries = buildGoalSummaries(empty, "2030-01-15");
  assert.equal(summaries.find((item) => item.id === "journal")?.status, "unknown");
  assert.equal(summaries.find((item) => item.id === "therapy")?.status, "unknown");

  const insights = buildInsights(empty, "2030-01-15");
  assert.equal(insights.length, 1);
  assert.equal(insights[0].id, "first-data");
  assert.equal(insights[0].title, "Build the baseline");
});

test("medication status stays unknown until enough days are recorded to judge the goal", () => {
  const partial = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", medicationTaken: true },
      { date: "2030-01-14", medicationTaken: true },
      { date: "2030-01-13", medicationTaken: true },
    ],
    sleepEntries: [],
    labResults: [],
    goals: { medicationDaysPerWeek: 7 },
  });
  assert.equal(
    buildGoalSummaries(partial, "2030-01-15").find((item) => item.id === "medication")?.status,
    "unknown",
  );

  const complete = normalizeHealthState({
    ...partial,
    dailyEntries: Array.from({ length: 7 }, (_, index) => ({
      date: addDays("2030-01-09", index),
      medicationTaken: index !== 0,
    })),
  });
  assert.equal(
    buildGoalSummaries(complete, "2030-01-15").find((item) => item.id === "medication")?.status,
    "watch",
  );
});

test("insights prioritize material synthetic signals and remain capped", () => {
  const state = normalizeHealthState({
    updatedAt: fixedNow.toISOString(),
    dailyEntries: [
      { date: "2030-01-15", mood: 2, anxiety: 5, steps: 1_000, medicationTaken: false },
      { date: "2030-01-14", mood: 2, anxiety: 4, steps: 2_000, medicationTaken: true },
      { date: "2030-01-13", mood: 2, anxiety: 4, steps: 2_000, medicationTaken: true },
      { date: "2030-01-08", mood: 4 },
      { date: "2030-01-07", mood: 4 },
      { date: "2030-01-06", mood: 4 },
    ],
    sleepEntries: [
      { date: "2030-01-15", source: "manual", durationHours: 6, bedtime: "00:30" },
      { date: "2030-01-14", source: "manual", durationHours: 7, bedtime: "22:30" },
    ],
    labResults: [],
    goals: { sleepHours: 9, sleepConsistencyMinutes: 60, stepGoal: 8_000 },
  });
  const insights = buildInsights(state, "2030-01-15");
  assert.equal(insights.length, 3);
  assert.deepEqual(insights.map((item) => item.id), ["sleep-duration", "sleep-regularity", "medication"]);
});

test("health sync prompt normalizes unsafe day counts", () => {
  assert.match(buildHealthSyncPrompt(30.4), /last 30 days/);
  assert.match(buildHealthSyncPrompt(-5), /last 1 day\./);
  assert.match(buildHealthSyncPrompt(999), /last 365 days/);
  assert.match(buildHealthSyncPrompt(Number.NaN), /last 30 days/);
});
