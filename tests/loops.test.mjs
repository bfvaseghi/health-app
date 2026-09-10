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
    [0, 21, "passed", "minutes", "solving"], [0, 22, "noticed", "hour", "circling"], [1, 20, "passed", "minutes", "solving"],
    [3, 19, "hooked", "day", "circling"], [5, 8, "later", "hour", "circling"],
    [7, 21, "noticed", "day", "circling"], [8, 20, "passed", "minutes", "solving"], [9, 22, "passed", "hour", "circling"],
    [10, 21, "hooked", "day", "circling"], [11, 20, "passed", "minutes", "solving"], [12, 19, "passed", "hour", "solving"], [13, 21, "passed", "minutes", "solving"],
  ];
  taps.forEach(([back, hour, move, grip, mode], index) => {
    state = upsertLoopEvent(state, { id: `e${index}`, loopId: "loop", at: at(back, hour), move, grip, mode });
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

test("old records without loops normalise to none, and last week's names for outcomes still read", () => {
  const legacy = normalizeHealthState({ version: 1, dailyEntries: [] });
  assert.deepEqual([legacy.thoughtLoops, legacy.loopEvents], [[], []]);
  const odd = normalizeHealthState({
    thoughtLoops: [{ id: "a", name: "x" }],
    loopEvents: [
      { id: "1", loopId: "a", at: "2026-08-01T09:30", move: "vanished", passed: "yes" },
      { id: "2", loopId: "a", at: "2026-08-01T10:30", move: "named", passed: true },
      { id: "3", loopId: "a", at: "2026-08-01T11:30", move: "parked" },
      { id: "4", loopId: "a", at: "2026-08-01T12:30", move: "shifted", passed: false },
      { id: "5", loopId: "a", at: "2026-08-01T13:30", move: "noticed", passed: true },
    ],
  });
  const byId = Object.fromEntries(odd.loopEvents.map((event) => [event.id, event.move]));
  assert.deepEqual(byId, { 1: "noticed", 2: "passed", 3: "later", 4: "hooked", 5: "passed" });
  assert.equal(odd.loopEvents.at(-1).date, "2026-08-01");
  assert.equal("passed" in odd.loopEvents[0], false, "the separate yes/no is gone");
  assert.equal(odd.thoughtLoops[0].reply, "");
});

test("the summary counts this week against last, says whether it is fading, and finds the evenings", () => {
  const summary = loopSummary(withLoop(), "loop", AS_OF);
  assert.equal(summary.today, 2);
  assert.equal(summary.week, 5);
  assert.equal(summary.lastWeek, 7);
  assert.equal(summary.trend, "fading");
  assert.equal(summary.quietDays, 0);
  assert.equal(summary.letGoShare, 80, "8 of 10 answered taps were let go or set aside");
  assert.equal(summary.hooked, 2);
  assert.equal(summary.peak, "evenings");
  assert.equal(summary.sentence, "5 this week · 7 last week");

  const fresh = loopSummary(upsertThoughtLoop(emptyHealthState(), { id: "n", name: "New" }), "n", AS_OF);
  assert.equal(fresh.trend, "new");
  assert.equal(fresh.sentence, "not yet this week");
  assert.equal(fresh.quietDays, null);
});

test("the weekly tide is one real count per week, zeros included", () => {
  const weekly = loopWeekly(withLoop(), "loop", AS_OF, 4);
  assert.deepEqual(weekly.map((point) => point.value), [0, 0, 7, 5]);
  assert.equal(weekly.at(-1).date, AS_OF);
});

test("the doctor summary reports how long it held and which kind, never the thought", () => {
  const state = withLoop();
  const report = buildHealthReport(state, AS_OF, 7);
  const row = report.rows.find((entry) => entry.id === "rumination");
  assert.equal(row.group, "Mind");
  assert.equal(row.label, "Rumination");
  assert.match(row.value, /^5 logs on \d+ of 7 days$/);
  // Not a share of thoughts successfully dismissed: how long they held, and how
  // many were circling. Both counted only over the logs that answered.
  assert.match(row.detail, /^7 the 7 days before · held an hour or more 3 of 5 · circling 3 of 5$/);
  assert.doesNotMatch(row.detail, /moved on/);

  // The report is printed and handed over, so the thought's own words must not
  // reach it — not in a label, a value, a detail, or the copied text.
  const text = reportToText(report);
  assert.match(text, /Rumination: 5 logs on/);
  for (const loop of state.thoughtLoops) {
    assert.doesNotMatch(text, new RegExp(loop.name), `the report names "${loop.name}"`);
    assert.ok(report.rows.every((entry) => !entry.id.includes(loop.id)), "a row is still keyed on a loop");
  }

  // Same for the exported table: what was recorded, no name column.
  const csv = thoughtLoopsCsv(state.thoughtLoops, state.loopEvents);
  assert.equal(csv.split("\n")[0], "id,loop_id,at,date,outcome,response,recurrence,grip,mode");
  assert.equal(csv.trim().split("\n").length, 13);
  for (const loop of state.thoughtLoops) assert.doesNotMatch(csv, new RegExp(loop.name));
});

test("the demo record shows a loop that is clearly fading and one just named", () => {
  const state = demoHealthState(AS_OF);
  assert.equal(state.thoughtLoops.length, 2);
  const weekly = loopWeekly(state, "demo-loop-1", AS_OF, 8).map((point) => point.value);
  assert.ok(weekly[0] > weekly.at(-1), `first week ${weekly[0]} should exceed the last ${weekly.at(-1)}`);
  const summary = loopSummary(state, "demo-loop-1", AS_OF);
  assert.equal(summary.trend, "fading");
  assert.ok(summary.letGoShare !== null && summary.letGoShare >= 60, `lately it mostly passes, got ${summary.letGoShare}`);
  assert.ok(state.loopEvents.every((event) => /^demo-loop-/.test(event.id)), "synthetic ids only");
});

test("responses belong to each occurrence and survive edits to a saved reminder", () => {
  let state = withLoop();
  const original = state.loopEvents.find(event => event.id === "e0");
  const response = 'I wrote, "one step is enough", then went outside.\nThe worry was still there.';
  state = upsertLoopEvent(state, { ...original, response });
  state = upsertThoughtLoop(state, { ...state.thoughtLoops[0], reply: "A revised reminder for next time." });
  state = normalizeHealthState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.loopEvents.find(event => event.id === "e0").response, response);
  assert.equal(state.loopEvents.find(event => event.id === "e1").response, undefined, "old events acquire no invented response");
  assert.equal(state.loopEvents.length, 12);
  assert.equal(state.loopEvents.find(event => event.id === "e0").move, "passed");
  const csv = thoughtLoopsCsv(state.thoughtLoops, state.loopEvents);
  assert.match(csv.split("\n")[0], /,outcome,response,recurrence,grip,mode$/);
  assert.ok(csv.includes('"I wrote, ""one step is enough"", then went outside.\nThe worry was still there."'));
  state = upsertLoopEvent(state, { ...state.loopEvents.find(event => event.id === "e0"), response: "" });
  assert.equal(state.loopEvents.find(event => event.id === "e0").response, undefined);
  assert.equal(state.thoughtLoops[0].reply, "A revised reminder for next time.");
});

test("response normalization bounds input without changing old occurrence outcomes", () => {
  const state = withLoop();
  const old = state.loopEvents.find(event => event.move === "later");
  const updated = upsertLoopEvent(state, { ...old, response: "x".repeat(1000) });
  assert.equal(updated.loopEvents.find(event => event.id === old.id).response.length, 800);
  assert.equal(updated.loopEvents.find(event => event.id === old.id).move, "later");
  assert.equal(removeLoopEvent(updated, old.id).loopEvents.length, state.loopEvents.length - 1);
  assert.deepEqual(normalizeHealthState(JSON.parse(JSON.stringify(state))).loopEvents, state.loopEvents);
});
