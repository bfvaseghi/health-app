import assert from "node:assert/strict";
import test from "node:test";

import { dailyBrief } from "../app/brief.ts";
import { demoHealthState } from "../app/demo-state.ts";
import { emptyHealthState } from "../app/health-model.ts";
import { adherenceSeries, meditationWeeklyMinutes, sleepWeeklyAverages, weightWeekly } from "../app/series.ts";
import { strengthIndex } from "../app/training/progress.ts";

const AS_OF = "2026-08-25";

const brief = (overrides = {}) =>
  dailyBrief({
    sleepHours: 8.2,
    sleepGoal: 8,
    medsDue: 2,
    medsAnswered: 2,
    medsMissed: false,
    nextSession: { name: "Upper A", sets: 19 },
    sessionsDone: 1,
    sessionsOf: 4,
    proteinG: 191,
    proteinTarget: 180,
    meditated: true,
    journaled: false,
    usualBedtime: "11:40 PM",
    empty: false,
    ...overrides,
  });

test("the daily brief leads with the night and then with what is owed", () => {
  const full = brief();
  assert.deepEqual(full.headline, ["A full night.", "One lift to go."]);
  assert.equal(
    full.detail,
    "Slept 8h 12m, meds are done, protein is at target, and you have meditated. Upper A (19 sets) is ready when you are.",
  );

  assert.deepEqual(brief({ medsAnswered: 1 }).headline, ["A full night.", "One dose to answer."]);
  assert.deepEqual(brief({ sleepHours: 6.4 }).headline[0], "A short night.");
  assert.deepEqual(brief({ sleepHours: 7.3 }).headline[0], "A near-full night.");
  assert.deepEqual(brief({ sleepHours: null }).headline[0], "No night recorded.");
  assert.deepEqual(brief({ nextSession: null, sessionsDone: 4 }).headline[1], "The week is banked.");
  assert.deepEqual(brief({ nextSession: null, sessionsDone: 0, sessionsOf: 0 }).headline[1], "A page unwritten.");
  assert.deepEqual(brief({ nextSession: null, sessionsOf: 0, journaled: true }).headline[1], "Nothing owed.");
  assert.equal(brief({ sessionsDone: 0 }).headline[1], "First lift of the week.");
});

test("the brief never invents: missing inputs leave the sentence shorter", () => {
  const sparse = brief({ sleepHours: null, medsDue: 0, proteinG: null, meditated: false, nextSession: null, sessionsOf: 0, journaled: true });
  assert.equal(sparse.detail, "Your usual bedtime is 11:40 PM.");
  assert.equal(brief({ proteinG: 150 }).detail.includes("protein is 30 g short"), true);
  assert.equal(brief({ medsAnswered: 2, medsMissed: true }).detail.includes("meds are logged"), true);
  assert.deepEqual(dailyBrief({ ...brief(), empty: true }).headline, ["A blank page.", "Start anywhere."]);
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
