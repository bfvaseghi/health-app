import assert from "node:assert/strict";
import test from "node:test";

import { demoHealthState } from "../app/demo-state.ts";
import {
  addDays,
  buildHealthReport,
  emptyHealthState,
  loopSummary,
  loopWeekly,
  normalizeHealthState,
  removeLoopEvent,
  removeThoughtLoop,
  reportToText,
  thoughtLoopsCsv,
  upsertLoopEvent,
  upsertThoughtLoop,
} from "../app/health-model.ts";

const AS_OF = "2026-08-25";
const at = (daysBack, hour) => `${addDays(AS_OF, -daysBack)}T${String(hour).padStart(2, "0")}:10`;

function withLoop() {
  let state = upsertThoughtLoop(emptyHealthState(), { id: "loop", name: "Replaying the call", reply: "A thought, not a verdict." });
  const taps = [
    [0, 21, "named", true], [0, 22, "noticed", null], [1, 20, "shifted", true], [3, 19, "named", false], [5, 8, "parked", true],
    [7, 21, "noticed", null], [8, 20, "named", true], [9, 22, "noticed", true], [10, 21, "named", false], [11, 20, "noticed", true], [12, 19, "named", true], [13, 21, "noticed", true],
  ];
  taps.forEach(([back, hour, move, passed], index) => {
    state = upsertLoopEvent(state, { id: `e${index}`, loopId: "loop", at: at(back, hour), move, passed });
  });
  return state;
}

test("a loop is named once and every tap on it is kept, with its hour", () => {
  const state = withLoop();
  assert.equal(state.thoughtLoops.length, 1);
  assert.equal(state.loopEvents.length, 12);
  assert.equal(state.loopEvents[0].at, at(0, 22), "newest first");
  assert.equal(state.loopEvents.at(-1).date, addDays(AS_OF, -13));
  // A tap for a loop that does not exist is dropped, and so are a deleted loop's taps.
  assert.equal(upsertLoopEvent(state, { id: "ghost", loopId: "nope", at: at(0, 9) }).loopEvents.length, 12);
  const gone = removeThoughtLoop(state, "loop");
  assert.deepEqual([gone.thoughtLoops, gone.loopEvents], [[], []]);
  assert.equal(removeLoopEvent(state, "e0").loopEvents.length, 11);
  assert.equal(removeLoopEvent(state, "missing"), state);
});

test("old records without loops normalise to none, and a bad move becomes noticed", () => {
  const legacy = normalizeHealthState({ version: 1, dailyEntries: [] });
  assert.deepEqual([legacy.thoughtLoops, legacy.loopEvents], [[], []]);
  const odd = normalizeHealthState({
    thoughtLoops: [{ id: "a", name: "x" }],
    loopEvents: [{ id: "1", loopId: "a", at: "2026-08-01T09:30", move: "vanished", passed: "yes" }],
  });
  assert.equal(odd.loopEvents[0].move, "noticed");
  assert.equal(odd.loopEvents[0].passed, null);
  assert.equal(odd.loopEvents[0].date, "2026-08-01");
  assert.equal(odd.thoughtLoops[0].reply, "");
});

test("the summary counts this week against last, says whether it is fading, and finds the evenings", () => {
  const summary = loopSummary(withLoop(), "loop", AS_OF);
  assert.equal(summary.today, 2);
  assert.equal(summary.week, 5);
  assert.equal(summary.lastWeek, 7);
  assert.equal(summary.trend, "fading");
  assert.equal(summary.quietDays, 0);
  assert.equal(summary.passedShare, 80, "8 of 10 answered taps passed");
  assert.equal(summary.peak, "evenings");
  assert.equal(summary.sentence, "5 this week, 7 last week — fading. Passed 80% of the time you answered. Mostly evenings.");

  const fresh = loopSummary(upsertThoughtLoop(emptyHealthState(), { id: "n", name: "New" }), "n", AS_OF);
  assert.equal(fresh.trend, "new");
  assert.equal(fresh.sentence, "Not yet this week.");
  assert.equal(fresh.quietDays, null);
});

test("the weekly tide is one real count per week, zeros included", () => {
  const weekly = loopWeekly(withLoop(), "loop", AS_OF, 4);
  assert.deepEqual(weekly.map((point) => point.value), [0, 0, 7, 5]);
  assert.equal(weekly.at(-1).date, AS_OF);
});

test("the doctor summary carries each loop as a row, in the text too", () => {
  const report = buildHealthReport(withLoop(), AS_OF, 7);
  const row = report.rows.find((entry) => entry.id === "loop-loop");
  assert.equal(row.group, "Mind");
  assert.equal(row.label, "Thought loop: Replaying the call");
  assert.equal(row.value, "5 times in 7 days");
  assert.match(row.detail, /^7 the 7 days before · passed 75% when answered$/);
  assert.match(reportToText(report), /Thought loop: Replaying the call: 5 times in 7 days/);
  const csv = thoughtLoopsCsv(withLoop().thoughtLoops, withLoop().loopEvents);
  assert.match(csv.split("\n")[0], /^id,loop_id,loop,at,date,move,passed/);
  assert.equal(csv.trim().split("\n").length, 13);
});

test("the demo record shows a loop that is clearly fading and one just named", () => {
  const state = demoHealthState(AS_OF);
  assert.equal(state.thoughtLoops.length, 2);
  const weekly = loopWeekly(state, "demo-loop-1", AS_OF, 8).map((point) => point.value);
  assert.ok(weekly[0] > weekly.at(-1), `first week ${weekly[0]} should exceed the last ${weekly.at(-1)}`);
  assert.equal(loopSummary(state, "demo-loop-1", AS_OF).trend, "fading");
  assert.ok(state.loopEvents.every((event) => /^demo-loop-/.test(event.id)), "synthetic ids only");
});
