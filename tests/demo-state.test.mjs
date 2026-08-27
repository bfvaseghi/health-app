import assert from "node:assert/strict";
import test from "node:test";

import { demoHealthState } from "../app/demo-state.ts";
import { buildWorkoutSessions } from "../app/health-model.ts";
import {
  buildBlock,
  currentBlockWeek,
  nextSession,
  weekOutlook,
  weekStart,
} from "../app/training/coach.ts";

const AS_OF = "2026-08-25";

test("demo data is populated, date-relative, and normalized", () => {
  const state = demoHealthState(AS_OF);

  assert.equal(state.dailyEntries.length, 60);
  assert.equal(state.dailyEntries[0].date, AS_OF, "the newest daily entry appears first");
  assert.equal(state.sleepEntries.length, 65);
  assert.equal(state.labResults.length, 10);
  assert.equal(state.workoutSets.length, 74);
  assert.equal(state.thoughtJournal.length, 3);
  assert.ok(state.thoughtJournal.some((entry) => entry.source === "apple-notes"));
  assert.equal(buildWorkoutSessions(state.workoutSets).length, 7);
  assert.equal(state.progressPhotos.length, 0, "the demo never invents or loads private photos");

  const monday = weekStart(AS_OF);
  assert.ok(
    state.workoutSets.every((entry) => entry.date < monday),
    "the demo opens before this week's first session so every Coach action is available",
  );
});

test("demo training history drives a useful four-day Coach week", () => {
  const state = demoHealthState(AS_OF);
  const week = currentBlockWeek(state, AS_OF);
  const block = buildBlock(state, AS_OF, state.goals.trainingDays);
  const plan = block[week];
  const next = nextSession(plan, state, AS_OF);

  assert.equal(week, 0);
  assert.equal(plan.days, 4);
  assert.equal(plan.split, "Upper / lower");
  assert.deepEqual(plan.sessions.map((session) => session.sets), [16, 13, 16, 15]);
  assert.deepEqual(plan.shortfall, []);
  assert.equal(next.done, 0);
  assert.equal(next.of, 4);
  assert.equal(next.session?.name, "Upper A");
  assert.ok(next.session?.exercises.some((exercise) => exercise.stepUp), "one lift demonstrates progression");
  assert.ok(next.session?.exercises.some((exercise) => exercise.stalled), "one lift demonstrates stall handling");
  const history = new Set(state.workoutSets.map((entry) => entry.exercise));
  const prescribed = block.flatMap((blockWeek) => blockWeek.sessions.flatMap((session) => session.exercises));
  for (const exercise of prescribed) {
    assert.ok(history.has(exercise.exercise), `${exercise.exercise} is not in the synthetic Strong history`);
  }
  assert.ok(block.every((blockWeek) => blockWeek.missing.length === 0), "every muscle has a synthetic Strong lift");
  assert.ok(weekOutlook(plan, state, AS_OF).every((muscle) => muscle.status === "in"));
});

test("each demo state is a fresh in-memory record", () => {
  const first = demoHealthState(AS_OF);
  const second = demoHealthState(AS_OF);

  first.dailyEntries[0].steps = 1;
  first.goals.trainingDays[0] = 2;

  assert.notEqual(second.dailyEntries[0].steps, 1);
  assert.deepEqual(second.goals.trainingDays, []);
});
