import assert from "node:assert/strict";
import test from "node:test";

import { demoHealthState } from "../app/demo-state.ts";
import { caffeineEntry } from "../app/caffeine.ts";
import {
  addDays,
  buildHealthReport,
  emptyHealthState,
  habitSummary,
  habitWeekly,
  caffeineSummary,
  habitsCsv,
  normalizeHealthState,
  removeHabit,
  removeHabitEvent,
  reportToText,
  upsertHabit,
  upsertHabitEvent,
} from "../app/health-model.ts";

const AS_OF = "2026-08-25";
const at = (daysBack, hour) => `${addDays(AS_OF, -daysBack)}T${String(hour).padStart(2, "0")}:10`;

test("caffeine serving validation uses the submission clock and keeps decimal amounts", () => {
  const entry = { id: "coffee", habitId: "h", amount: "12.5", at: `${AS_OF}T14:30` };
  assert.equal(caffeineEntry(entry, `${AS_OF}T14:31`).event.amountMg, 12.5);
  assert.equal(caffeineEntry(entry, `${AS_OF}T14:00`).event, null, "a future time cannot be saved");
  for (const amount of ["", "0", "0.04", "-10", "invalid", "Infinity"]) assert.equal(caffeineEntry({ ...entry, amount }, `${AS_OF}T14:31`).event, null);
  for (const at of ["2026-02-30T10:00", `${AS_OF}T25:00`, ""]) assert.equal(caffeineEntry({ ...entry, at }, `${AS_OF}T14:31`).event, null);
  const nextDay = `${addDays(AS_OF, 1)}T00:05`;
  assert.equal(caffeineEntry({ ...entry, at: nextDay }, nextDay).event.date, addDays(AS_OF, 1));
  for (const time of ["00:00", "06:15", "12:00"]) {
    const now = `${AS_OF}T${time}`;
    assert.ok(demoHealthState(AS_OF, time).habitEvents.filter(entry => entry.kind === "intake").every(entry => entry.at <= now), "demo servings never begin after the supplied clock");
  }
});

test("caffeine keeps amounts, local serving times and adjustable targets through backup and edits", () => {
  let state = upsertHabit(emptyHealthState(), { id: "coffee", name: "Caffeine", caffeine: { dailyLimitMg: 250, cutoffTime: "14:00", usualDoseMg: 100 } });
  for (const [id, time, amountMg] of [["a", "09:00", 125], ["b", "14:00", 125], ["c", "14:01", 50]]) {
    state = upsertHabitEvent(state, { id, habitId: "coffee", at: `${AS_OF}T${time}`, date: "2026-01-01", kind: "intake", amountMg });
  }
  state = normalizeHealthState(JSON.parse(JSON.stringify(state)));
  let summary = caffeineSummary(state, "coffee", AS_OF);
  assert.deepEqual([summary.totalMg, summary.late, summary.overMg], [300, 1, 50]);
  assert.equal(state.habitEvents[0].date, AS_OF, "the serving timestamp owns its local date");
  assert.match(habitsCsv(state.habits, state.habitEvents), /amount_mg/);
  state = upsertHabitEvent(state, { ...state.habitEvents[0], at: `${AS_OF}T13:00`, amountMg: 25 });
  summary = caffeineSummary(state, "coffee", AS_OF);
  assert.deepEqual([summary.totalMg, summary.late, summary.overMg], [275, 0, 25]);
  state = upsertHabit(state, { ...state.habits[0], name: "Coffee and tea", caffeine: { dailyLimitMg: 0, cutoffTime: "", usualDoseMg: null } });
  assert.deepEqual([caffeineSummary(state, "coffee", AS_OF).overMg, state.habitEvents.length], [275, 3]);
  state = removeHabitEvent(state, "a");
  assert.equal(caffeineSummary(state, "coffee", AS_OF).totalMg, 150);
  assert.equal(caffeineSummary(state, "coffee", addDays(AS_OF, -1)).events.length, 0);
});

test("caffeine rejects invalid amounts and times without rewriting ordinary habits", () => {
  let state = upsertHabit(emptyHealthState(), { id: "coffee", name: "Caffeine", caffeine: { dailyLimitMg: -1, cutoffTime: "25:00", usualDoseMg: Infinity } });
  assert.deepEqual(state.habits[0].caffeine, { dailyLimitMg: null, cutoffTime: "", usualDoseMg: null });
  for (const [amountMg, time] of [[0, "10:00"], [-1, "10:00"], [Infinity, "10:00"], [100, "25:00"]]) {
    state = upsertHabitEvent(state, { id: "invalid", habitId: "coffee", at: `${AS_OF}T${time}`, kind: "intake", amountMg });
  }
  assert.equal(state.habitEvents.length, 0);
  const plain = withHabit();
  assert.deepEqual(normalizeHealthState(JSON.parse(JSON.stringify(plain))), plain);
});

function withHabit() {
  let state = upsertHabit(emptyHealthState(), { id: "h", name: "Sample habit", createdAt: addDays(AS_OF, -30) });
  const events = [
    [0, 22, "urge"], [1, 23, "urge"], [2, 23, "slip"], [4, 22, "urge"], [6, 23, "slip"],
    [8, 23, "slip"], [9, 22, "slip"], [11, 23, "slip"], [13, 23, "urge"],
  ];
  events.forEach(([back, hour, kind], index) => {
    state = upsertHabitEvent(state, { id: `e${index}`, habitId: "h", at: at(back, hour), kind });
  });
  return state;
}

test("a habit keeps its urges and slips, and deleting it takes them along", () => {
  const state = withHabit();
  assert.equal(state.habits.length, 1);
  assert.equal(state.habitEvents.length, 9);
  assert.equal(state.habitEvents[0].kind, "urge");
  assert.equal(upsertHabitEvent(state, { id: "x", habitId: "nope", at: at(0, 9), kind: "slip" }).habitEvents.length, 9);
  assert.deepEqual([removeHabit(state, "h").habits, removeHabit(state, "h").habitEvents], [[], []]);
  assert.equal(removeHabitEvent(state, "e0").habitEvents.length, 8);
  const odd = normalizeHealthState({ habits: [{ id: "a", name: "x" }], habitEvents: [{ id: "1", habitId: "a", at: "2026-08-01T09:30", kind: "whatever" }] });
  assert.equal(odd.habitEvents[0].kind, "urge", "an unknown kind is the kinder one");
  assert.deepEqual(normalizeHealthState({ version: 1 }).habits, []);
});

test("the summary is the clean streak, slips this week against last, and urges that passed", () => {
  const summary = habitSummary(withHabit(), "h", AS_OF);
  assert.equal(summary.cleanDays, 2);
  assert.equal(summary.week, 2);
  assert.equal(summary.lastWeek, 3);
  assert.equal(summary.urgesWeek, 3);
  assert.equal(summary.sentence, "2 days since last occurrence · 2 this week · 3 last week · 3 urges passed");
  assert.ok(summary.bestCleanDays >= 15, `the run from the start to the first slip, got ${summary.bestCleanDays}`);

  const fresh = habitSummary(upsertHabit(emptyHealthState(), { id: "n", name: "New" }), "n", AS_OF);
  assert.equal(fresh.cleanDays, null);
  assert.equal(fresh.sentence, "No occurrences logged · 0 this week · 0 last week");
  assert.deepEqual(habitWeekly(withHabit(), "h", AS_OF, 3).map((point) => point.value), [0, 3, 2]);
});

test("cutting back stays out of the doctor summary and inside the archive", () => {
  const state = withHabit();
  const report = buildHealthReport(state, AS_OF, 30);
  assert.equal(report.rows.some((row) => /scrolling|habit/i.test(row.label)), false);
  assert.doesNotMatch(reportToText(report), /scrolling/i);
  const csv = habitsCsv(state.habits, state.habitEvents);
  assert.match(csv.split("\n")[0], /^id,habit_id,habit,at,date,kind/);
  assert.equal(csv.trim().split("\n").length, 10);
});

test("the demo habit is clearly being cut back, under a concrete fictional example", () => {
  const state = demoHealthState(AS_OF);
  assert.equal(state.habits.length, 2);
  assert.equal(state.habits.find(habit => !habit.caffeine).name, "Masturbation");
  assert.equal(state.habits.find(habit => habit.caffeine).name, "Caffeine");
  const weekly = habitWeekly(state, "demo-habit-1", AS_OF, 7).map((point) => point.value);
  assert.ok(weekly[0] > weekly.at(-1), `slips fall: ${weekly.join(",")}`);
});
