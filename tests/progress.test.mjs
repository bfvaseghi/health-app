import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { buildProgress } from "../app/training/progress.ts";
import { toTable } from "../app/import/csv.ts";
import { strongToRecords } from "../app/import/strong.ts";
import { addDays, emptyHealthState, normalizeHealthState } from "../app/health-model.ts";

const FIXTURE = readFileSync(new URL("./fixtures/strong-sample.csv", import.meta.url), "utf8");
const NOW = new Date("2026-08-25T12:00:00Z");
const TODAY = "2026-08-25";

function stateOf(overrides = {}) {
  return normalizeHealthState({ ...emptyHealthState(NOW), ...overrides });
}

function set(exercise, date, weightLb, reps, setNumber = 1) {
  return {
    date,
    startedAt: `${date} 18:00:00`,
    workoutName: "Session",
    exercise,
    setNumber,
    weightLb,
    reps,
    distance: null,
    seconds: null,
    rpe: null,
    restSeconds: null,
    durationSeconds: null,
  };
}

/** One session a week for `weeks` weeks, the load walking from `from` to `to`. */
function weekly(exercise, weeks, from, to, reps = 5) {
  return Array.from({ length: weeks }, (_, index) =>
    set(
      exercise,
      addDays(TODAY, -(weeks - 1 - index) * 7),
      Math.round(from + ((to - from) * index) / Math.max(1, weeks - 1)),
      reps,
    ),
  );
}

test("a lift is a trajectory, not two endpoints", () => {
  const progress = buildProgress(stateOf({ workoutSets: weekly("Bench Press (Barbell)", 12, 165, 195) }), TODAY, 12);
  const bench = progress.lifts.find((lift) => lift.exercise === "Bench Press (Barbell)");

  assert.equal(bench.sessions, 12, "one point a session");
  assert.equal(bench.points.length, 12);
  assert.deepEqual(
    [...bench.points].sort((a, b) => a.date.localeCompare(b.date)).map((point) => point.date),
    bench.points.map((point) => point.date),
    "oldest first",
  );
  assert.ok(bench.points.every((point) => point.value > 0));
  assert.ok(bench.last > bench.first, `${bench.first} → ${bench.last}`);
  assert.equal(bench.direction, "up");
  assert.ok(bench.percent > 10, `climbed ${bench.percent}%`);
  assert.ok(bench.percentPerWeek > 0 && bench.percentPerWeek < 3, `${bench.percentPerWeek}%/week is plausible`);
  assert.equal(bench.sessionsSincePeak, 0, "the best session is the most recent one");
});

test("the direction is the slope, so one bad day at the end does not reverse it", () => {
  // Eleven weeks of climbing, then a session where everything went wrong.
  const sets = [
    ...Array.from({ length: 11 }, (_, index) =>
      set("Squat (Barbell)", addDays(TODAY, -(11 - index) * 7), 225 + index * 6, 5),
    ),
    set("Squat (Barbell)", TODAY, 245, 5),
  ];
  const squat = buildProgress(stateOf({ workoutSets: sets }), TODAY, 12).lifts[0];

  assert.equal(squat.direction, "up", "a bad last day is one point among twelve");
  assert.ok(squat.last < squat.best, "and it is still recorded as a step back from the peak");
  assert.equal(squat.sessionsSincePeak, 1);
});

test("a lift going backwards is reported as going backwards", () => {
  const progress = buildProgress(stateOf({ workoutSets: weekly("Bent Over Row (Barbell)", 10, 185, 145, 8) }), TODAY, 12);
  const row = progress.lifts[0];
  assert.equal(row.direction, "down");
  assert.ok(row.percent < -10, `${row.percent}%`);
  assert.equal(progress.falling, 1);
  assert.equal(progress.rising, 0);
});

test("a lift that is holding is not called a move", () => {
  const progress = buildProgress(stateOf({ workoutSets: weekly("Bicep Curl (Dumbbell)", 10, 35, 35, 10) }), TODAY, 12);
  const curl = progress.lifts[0];
  assert.equal(curl.direction, "flat");
  assert.equal(curl.percent, 0);
  assert.equal(progress.rising + progress.falling, 0);
});

test("three sessions before a direction is claimed", () => {
  const twice = [
    set("Leg Press", addDays(TODAY, -14), 300, 10),
    set("Leg Press", TODAY, 360, 10),
  ];
  assert.deepEqual(buildProgress(stateOf({ workoutSets: twice }), TODAY, 12).lifts, [], "two points prove nothing");

  const thrice = [...twice, set("Leg Press", addDays(TODAY, -7), 330, 10)];
  const lifts = buildProgress(stateOf({ workoutSets: thrice }), TODAY, 12).lifts;
  assert.equal(lifts.length, 1);
  assert.equal(lifts[0].sessions, 3);
});

test("a session is worth its best set, not its average one", () => {
  const date = addDays(TODAY, -7);
  const sets = [
    ...weekly("Overhead Press (Barbell)", 4, 95, 95, 8),
    set("Overhead Press (Barbell)", date, 95, 8, 1),
    set("Overhead Press (Barbell)", date, 135, 5, 2),
    set("Overhead Press (Barbell)", date, 65, 12, 3),
  ];
  const press = buildProgress(stateOf({ workoutSets: sets }), TODAY, 12).lifts[0];
  const day = press.points.find((point) => point.date === date);
  // 135 × 5 estimates higher than 95 × 8, so that is the session's number.
  assert.ok(day.value > 140, `best set carried the day: ${day.value}`);
});

test("a bodyweight movement is compared on reps, not on a load it never had", () => {
  const sets = Array.from({ length: 10 }, (_, index) =>
    set("Chin Up", addDays(TODAY, -(9 - index) * 7), null, 6 + index),
  );
  const chin = buildProgress(stateOf({ workoutSets: sets }), TODAY, 12).lifts[0];
  assert.equal(chin.bodyweight, true);
  assert.equal(chin.direction, "up");
  assert.equal(chin.last, 15);
});

test("the window ends at the last recorded day, not today", () => {
  // The log stops three weeks ago. Anchoring to today would read that as three
  // weeks of no training and report the volume as having collapsed.
  const lastDay = addDays(TODAY, -21);
  const sets = [];
  for (let week = 0; week < 14; week += 1) {
    const date = addDays(lastDay, -week * 7);
    for (let index = 0; index < 4; index += 1) sets.push(set("Bench Press (Barbell)", date, 185, 6, index + 1));
  }
  const progress = buildProgress(stateOf({ workoutSets: sets }), TODAY, 12);

  assert.equal(progress.end, lastDay);
  assert.ok(progress.volume.from > 0 && progress.volume.to > 0, "both ends have training in them");
  assert.ok(Math.abs(progress.volume.change) < progress.volume.from * 0.5, "no phantom collapse");
});

test("weekly volume normalizes each inclusive half by its own length", () => {
  // Five weeks split into eighteen days and seventeen. Identical daily work is
  // still 700 lb a week on both sides; sharing one divisor manufactured a drop.
  const sets = Array.from({ length: 35 }, (_, index) =>
    set("Bench Press (Barbell)", addDays(TODAY, -34 + index), 100, 1),
  );
  const volume = buildProgress(stateOf({ workoutSets: sets }), TODAY, 5).volume;

  assert.deepEqual(volume, { from: 700, to: 700, change: 0, samples: 35 });
});

test("biggest movers first, in either direction", () => {
  const sets = [
    ...weekly("Bench Press (Barbell)", 8, 165, 175),
    ...weekly("Bent Over Row (Barbell)", 8, 185, 130, 8),
    ...weekly("Bicep Curl (Dumbbell)", 8, 35, 35, 10),
  ];
  const lifts = buildProgress(stateOf({ workoutSets: sets }), TODAY, 12).lifts;
  assert.equal(lifts[0].exercise, "Bent Over Row (Barbell)", "the collapse is the headline");
  assert.deepEqual(
    lifts.map((lift) => Math.abs(lift.percent)),
    [...lifts.map((lift) => Math.abs(lift.percent))].sort((a, b) => b - a),
  );
});

test("a real export produces a comparison without throwing", () => {
  const records = strongToRecords(toTable(FIXTURE));
  const progress = buildProgress(stateOf({ workoutSets: records.workoutSets }), TODAY, 26);
  assert.ok(progress.end <= TODAY);
  assert.ok(progress.start < progress.end);
  for (const lift of progress.lifts) {
    assert.ok(Number.isFinite(lift.percent), `${lift.exercise} has a non-finite change`);
    assert.ok(Number.isFinite(lift.percentPerWeek));
    assert.ok(lift.points.length >= 3);
  }

  // An empty record is a blank page, not a crash.
  const empty = buildProgress(stateOf(), TODAY, 12);
  assert.deepEqual(empty.lifts, []);
  assert.equal(empty.trendPercent, null);
  assert.equal(empty.volume.change, null);
  assert.equal(empty.rising, 0);
});

test("body composition has moved out: progress is about the lifts", () => {
  const state = stateOf({
    dailyEntries: [
      { date: addDays(TODAY, -60), weightLb: 195, bodyFatPercent: 22 },
      { date: TODAY, weightLb: 180, bodyFatPercent: 18 },
    ],
    progressPhotos: [{ id: "one", date: TODAY }],
  });
  const progress = buildProgress(state, TODAY, 12);
  assert.equal(progress.weight, undefined);
  assert.equal(progress.bodyFat, undefined);
  assert.equal(progress.photos, undefined);
  // And a weigh-in on its own does not move the window: it ends where the
  // training ends.
  assert.equal(progress.end, TODAY);
  assert.deepEqual(progress.lifts, []);
});
