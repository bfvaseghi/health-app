import assert from "node:assert/strict";
import test from "node:test";

import { demoHealthState } from "../app/demo-state.ts";
import { emptyDailyEntry, emptyHealthState, emptySleepEntry } from "../app/health-model.ts";
import { adherenceSeries, daySlice, meditationWeeklyMinutes, sleepTimingSeries, sleepWeeklyAverages, weightWeekly } from "../app/series.ts";
import { strengthIndex } from "../app/training/progress.ts";
import { recordDates, recordDay } from "../app/record-history.ts";
import { comparePeriods, comparisonChange, comparisonToText, comparisonValue, periodReading } from "../app/period-comparison.ts";
import { plotSeries } from "../app/chart-series.ts";

const AS_OF = "2026-08-25";

test("comparisons use equal nonoverlapping windows and exclude outside records", () => {
  const state = emptyHealthState();
  state.dailyEntries = [
    { ...emptyDailyEntry("2026-08-11"), proteinG: 400 },
    { ...emptyDailyEntry("2026-08-12"), proteinG: 100 },
    { ...emptyDailyEntry("2026-08-18"), proteinG: 120 },
    { ...emptyDailyEntry("2026-08-19"), proteinG: 160 },
    { ...emptyDailyEntry("2026-08-25"), proteinG: 180 },
    { ...emptyDailyEntry("2026-08-26"), proteinG: 500 },
  ];
  const row = comparePeriods(state, "2026-08-18", AS_OF, 7).find((row) => row.key === "proteinG");
  assert.equal(row.earlier.start, "2026-08-12");
  assert.equal(row.later.start, "2026-08-19");
  assert.equal(row.earlier.value, 110);
  assert.equal(row.later.value, 170);
  assert.equal(row.difference, 60);
  assert.equal(row.earlier.recorded, 2);
  assert.equal(row.later.possible, 7);
  assert.throws(() => comparePeriods(state, "2026-08-19", AS_OF, 7), /overlap/);
  assert.throws(() => periodReading(state, "sleepHours", "2026-02-30", 7), /Invalid/);
});

test("comparisons retain missing days and explicit zero readings", () => {
  const state = emptyHealthState();
  state.dailyEntries = [{ ...emptyDailyEntry(AS_OF), meditationMinutes: 0 }];
  const row = periodReading(state, "meditationMinutes", AS_OF, 7);
  assert.equal(row.value, 0);
  assert.equal(row.recorded, 1);
  assert.deepEqual(row.points.map((point) => point.value), [null, null, null, null, null, null, 0]);
  const comparison = comparePeriods(state, "2026-08-18", AS_OF, 7).find((row) => row.key === "meditationMinutes");
  assert.equal(comparison.earlier.value, null);
  assert.equal(comparison.difference, null);
});

test("comparison uses one preferred night and falls back to night heart measures", () => {
  const state = emptyHealthState();
  state.sleepEntries = [
    { ...emptySleepEntry(AS_OF), source: "oura", durationHours: 8, hrvMs: 50 },
    { ...emptySleepEntry(AS_OF), source: "apple", durationHours: 6, hrvMs: 10 },
  ];
  state.dailyEntries = [{ ...emptyDailyEntry(AS_OF), restingHeartRate: 60 }];
  assert.equal(periodReading(state, "sleepHours", AS_OF, 7).value, 8);
  assert.equal(periodReading(state, "sleepHours", AS_OF, 7).recorded, 1);
  assert.equal(periodReading(state, "hrvMs", AS_OF, 7).value, 50);
  assert.equal(periodReading(state, "restingHeartRate", AS_OF, 7).value, 60);
});

test("dose comparisons weight recorded doses and retain history after schedule changes", () => {
  const state = emptyHealthState();
  state.medications = [
    { id: "daily", name: "Sample daily", schedule: "daily", dueDay: null, archived: true },
    { id: "weekly", name: "Sample weekly", schedule: "weekly", dueDay: 1, archived: false },
  ];
  state.medicationDoses = [
    { medicationId: "daily", date: "2026-08-24", taken: true },
    { medicationId: "weekly", date: "2026-08-24", taken: false },
    { medicationId: "daily", date: "2026-08-25", taken: true },
    { medicationId: "weekly", date: "2026-08-25", taken: false },
  ];
  const row = periodReading(state, "medication", AS_OF, 7);
  assert.equal(row.recorded, 4);
  assert.equal(row.possible, null);
  assert.equal(row.value, 50);
  assert.equal(row.points.at(-1).value, 50);
  assert.equal(row.points[0].value, null);
  state.medicationDoses.push({ medicationId: "weekly", date: "2026-08-25", taken: true });
  assert.equal(periodReading(state, "medication", AS_OF, 7).recorded, 4);
  assert.equal(periodReading(state, "medication", AS_OF, 7).value, 75);
});

test("comparison changes use minutes for sleep and never display signed zero", () => {
  const rows = comparePeriods(emptyHealthState(), "2026-08-18", AS_OF, 7);
  assert.equal(comparisonChange({ ...rows[0], difference: 0.15 }), "+9 min");
  assert.equal(comparisonChange({ ...rows[0], difference: null }), "—");
  assert.equal(comparisonChange({ ...rows.find((row) => row.key === "proteinG"), difference: -0.1 }), "0 g");
  assert.equal(comparisonChange({ ...rows.find((row) => row.key === "proteinG"), difference: 0.1 }), "0 g");
  assert.equal(comparisonValue(-0.01, "lb", 1), "0.0 lb");
});

test("workout comparison counts sessions rather than sets", () => {
  const state = demoHealthState(AS_OF);
  const reading = periodReading(state, "workouts", AS_OF, 28);
  const sets = state.workoutSets.filter((row) => row.date >= reading.start && row.date <= reading.end);
  assert.equal(reading.value, new Set(sets.map((row) => row.startedAt)).size);
  assert.equal(reading.recorded, new Set(sets.map((row) => row.date)).size);
});

test("copied comparisons contain numeric coverage without private record text", () => {
  const state = demoHealthState(AS_OF);
  const text = comparisonToText(comparePeriods(state, "2026-07-28", AS_OF, 28));
  assert.match(text, /Earlier: 2026-07-01 to 2026-07-28/);
  assert.match(text, /Later: 2026-07-29 to 2026-08-25/);
  assert.match(text, /Recorded: 28\/28 to 28\/28 nights/);
  assert.ok(!text.includes(state.thoughtJournal[0].text));
  assert.ok(!text.includes(state.habits[0].name));
});

test("plots leave gaps and preserve elapsed calendar spacing", () => {
  const plot = plotSeries([
    { date: "2026-08-01", value: 8 },
    { date: "2026-08-02", value: null },
    { date: "2026-08-03", value: 7 },
    { date: "2026-08-09", value: 9 },
  ]);
  assert.deepEqual(plot.points.map((point) => point.position), [0, 0.25, 1]);
  assert.deepEqual(plot.segments.map((segment) => segment.length), [1, 2]);
  assert.deepEqual(plot.gaps.map(([from, to]) => [from.date, to.date]), [["2026-08-01", "2026-08-03"]]);
  assert.equal(plotSeries([{ date: AS_OF, value: 0 }]).points[0].position, 0.5);
  assert.deepEqual(plotSeries([{ date: AS_OF, value: null }]).segments, []);
  assert.deepEqual(plotSeries([]).points, []);
  assert.deepEqual(plotSeries([{ date: "2026-08-01", value: null }, { date: AS_OF, value: 7 }]).gaps, []);
});

test("record dates include journal-only, lab-only and archived-medication days", () => {
  const state = emptyHealthState();
  state.thoughtJournal = [{ id: "journal", date: "2026-08-01", title: "Sample", text: "Sample entry", source: "manual", createdAt: "2026-08-01T12:00" }];
  state.medications = [{ id: "med", name: "Sample medication", schedule: "daily", dueDay: null, archived: true }];
  state.medicationDoses = [{ medicationId: "med", date: "2026-08-02", taken: true }];
  state.labResults = [{ id: "lab", date: "2026-08-03", name: "Sample marker", value: 12, unit: "units", referenceLow: null, referenceHigh: null, note: "", ask: false }];
  state.progressPhotos = [{ id: "photo", date: "2026-08-01", weightLb: null, bodyFatPercent: null, note: "" }];
  state.therapyNotes = [{ id: "future", date: "2026-09-01", text: "Future topic", shared: false, sharedDate: "" }];
  assert.deepEqual(recordDates(state, AS_OF), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.equal(recordDay(state, "2026-08-02").doses[0].name, "Sample medication");
  assert.equal(recordDay(state, "2026-08-01").doses.length, 0);
  assert.equal(recordDay(state, "2026-08-01").journal.length, 1);
  assert.equal(recordDay(state, "2026-08-01").photos.length, 1);
});

test("a daily record keeps source alternatives and separates sessions", () => {
  const state = demoHealthState(AS_OF);
  const day = recordDay(state, AS_OF);
  assert.equal(day.sleep?.durationHours, daySlice(state, AS_OF).sleepHours);
  assert.deepEqual(day.sleepSources, state.sleepEntries.filter((row) => row.date === AS_OF));
  assert.ok(day.sets.every((set) => set.date === AS_OF));
  assert.equal(day.sessions.reduce((sum, session) => sum + session.sets, 0), day.sets.length);
  assert.equal(recordDay(state, "2000-01-01").daily, null);
  assert.deepEqual(recordDates(emptyHealthState(), AS_OF), []);
});

test("weekly sleep averages end on the as-of day and skip empty weeks", () => {
  const state = demoHealthState(AS_OF);
  const weeks = sleepWeeklyAverages(state, AS_OF, 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks.at(-1).date, AS_OF);
  assert.equal(weeks[0].date, "2026-07-07");
  assert.ok(weeks.every((point) => point.value === null || (point.value > 5 && point.value < 10)));
  assert.ok(weeks.filter((point) => point.value !== null).length >= 8, "the demo has sleep in every week");

  const blank = sleepWeeklyAverages(emptyHealthState(), AS_OF, 4);
  assert.deepEqual(blank.map((point) => point.value), [null, null, null, null]);
});

test("rolling adherence counts only answered doses on due days", () => {
  const state = demoHealthState(AS_OF);
  const series = adherenceSeries(state, AS_OF, 30, 30);
  assert.equal(series.length, 30);
  assert.equal(series.at(-1).date, AS_OF);
  const last = series.at(-1).value;
  assert.ok(last !== null && last >= 0 && last <= 100);
  assert.ok(series.every((point) => point.value === null || (point.value >= 0 && point.value <= 100)));
  assert.deepEqual(adherenceSeries(emptyHealthState(), AS_OF, 3).map((point) => point.value), [null, null, null]);
});

test("meditation minutes and weight come one point a week", () => {
  const state = demoHealthState(AS_OF);
  const minutes = meditationWeeklyMinutes(state, AS_OF, 8);
  assert.equal(minutes.length, 8);
  assert.ok(minutes.every((point) => Number.isInteger(point.value) && point.value >= 0));
  const weight = weightWeekly(state, AS_OF, 8);
  assert.equal(weight.length, 8);
  assert.ok(weight.some((point) => point.value !== null));
});

test("the strength index starts near 100 and stays finite", () => {
  const state = demoHealthState(AS_OF);
  const index = strengthIndex(state, AS_OF, 12);
  assert.equal(index.length, 12);
  const recorded = index.filter((point) => point.value !== null);
  assert.ok(recorded.length >= 4, "the demo trains most weeks");
  assert.ok(Math.abs(recorded[0].value - 100) < 1, `first recorded week indexes to 100, got ${recorded[0].value}`);
  assert.ok(recorded.every((point) => point.value > 50 && point.value < 200));
  assert.deepEqual(strengthIndex(emptyHealthState(), AS_OF, 4).map((point) => point.value), [null, null, null, null]);
});

test("a day slice reads one date across every stream without inventing", () => {
  const state = demoHealthState(AS_OF);
  const slice = daySlice(state, AS_OF);
  assert.equal(slice.date, AS_OF);
  assert.ok(slice.sleepHours === null || slice.sleepHours > 0);
  assert.ok(Array.isArray(slice.sessions));
  assert.ok(slice.medsDue >= slice.medsTaken + slice.medsMissed);
  const blank = daySlice(emptyHealthState(), "2026-01-01");
  assert.deepEqual(blank, {
    date: "2026-01-01",
    sleepHours: null,
    sessions: [],
    sets: 0,
    medsDue: 0,
    medsTaken: 0,
    medsMissed: 0,
    proteinG: null,
    meditationMinutes: null,
    journaled: false,
  });
});


test("sleep timing follows midnight without inventing missing nights or merging sources", () => {
  const state = emptyHealthState();
  state.sleepEntries = [
    { ...emptySleepEntry("2026-08-21"), source: "oura", bedtime: "23:50", wakeTime: "07:30" },
    { ...emptySleepEntry("2026-08-21"), source: "apple", bedtime: "21:00", wakeTime: "05:00" },
    { ...emptySleepEntry("2026-08-22"), source: "oura", bedtime: "00:10", wakeTime: "07:40" },
    { ...emptySleepEntry("2026-08-24"), source: "oura", bedtime: "23:55", wakeTime: "" },
    { ...emptySleepEntry("2026-08-26"), source: "oura", bedtime: "03:00", wakeTime: "12:00" },
  ];
  assert.deepEqual(sleepTimingSeries(state, "bedtime", AS_OF, 5).map(point => point.value), [1430, 1450, null, 1435, null]);
  assert.deepEqual(sleepTimingSeries(state, "wakeTime", AS_OF, 5).map(point => point.value), [1890, 1900, null, null, null]);
  assert.equal(sleepTimingSeries(state, "bedtime", AS_OF, 5).at(-1).date, AS_OF);
});
