import assert from "node:assert/strict";
import test from "node:test";

import { demoHealthState, demoStrongCsv } from "../app/demo-state.ts";
import { DEMO_PHOTO_ASSETS, readDemoPhoto } from "../app/demo-photos.ts";
import { addDays, buildWorkoutSessions, normalizeHealthState } from "../app/health-model.ts";
import {
  buildBlock,
  currentBlockWeek,
  nextSession,
  workoutWeekStreak,
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
  assert.equal(state.workoutSets.length, 157);
  assert.equal(state.thoughtJournal.length, 4);
  assert.ok(state.thoughtJournal.some((entry) => entry.source === "apple-notes"));
  assert.equal(buildWorkoutSessions(state.workoutSets).length, 19);
  assert.equal(state.progressPhotos.length, 3);
  assert.ok(state.progressPhotos.every(photo => DEMO_PHOTO_ASSETS.has(photo.id) && /fictional.*generated/i.test(photo.note)));

  const monday = weekStart(AS_OF);
  assert.ok(
    state.workoutSets.every((entry) => entry.date <= AS_OF),
    "nothing in the demo is dated in the future",
  );
  assert.deepEqual(
    [...new Set(state.workoutSets.map((entry) => weekStart(entry.date)))].sort(),
    Array.from({ length: 7 }, (_, index) => addDays(monday, (index - 6) * 7)),
    "six completed weeks plus one session already banked this week",
  );
  assert.deepEqual(workoutWeekStreak(state, AS_OF), { weeks: 7, currentWeek: true });
});

test("demo training history drives a useful four-day Coach week", () => {
  const state = demoHealthState(AS_OF);
  const week = currentBlockWeek(state, AS_OF);
  const block = buildBlock(state, AS_OF, state.goals.trainingDays);
  const plan = block[week];
  const next = nextSession(plan, state, AS_OF);

  assert.equal(week, 0);
  assert.equal(plan.days, 4);
  assert.equal(plan.split, "Full body 1 / 2");
  assert.equal(plan.sessions.filter(session => session.tier === "base").length, 2);
  assert.ok(plan.sessions.every(session => session.sets > 0));
  assert.deepEqual(plan.shortfall, []);
  assert.equal(next.done, 1);
  assert.equal(next.of, 4);
  assert.equal(next.session?.tier, "base");
  assert.ok(next.session?.exercises.some((exercise) => exercise.stepUp), "one lift demonstrates progression");
  assert.ok(!next.session?.exercises.find((exercise) => exercise.exercise === "Lateral Raise (Dumbbell)")?.stalled, "one-set visits cannot establish a stall");
  const history = new Set(state.workoutSets.map((entry) => entry.exercise));
  const prescribed = block.flatMap((blockWeek) => blockWeek.sessions.flatMap((session) => session.exercises));
  for (const exercise of prescribed) {
    assert.ok(history.has(exercise.exercise), `${exercise.exercise} is not in the synthetic Strong history`);
  }
  assert.ok(block.every((blockWeek) => blockWeek.missing.length === 0), "every muscle has a synthetic Strong lift");
  assert.ok(weekOutlook(plan, state, AS_OF).every((muscle) => muscle.done + muscle.coming === muscle.projected));
});

test("each demo state is a fresh in-memory record", () => {
  const first = demoHealthState(AS_OF);
  const second = demoHealthState(AS_OF);

  first.dailyEntries[0].steps = 1;
  first.goals.trainingDays[0] = 2;

  assert.notEqual(second.dailyEntries[0].steps, 1);
  assert.deepEqual(second.goals.trainingDays, [], "the demo week is on automatic, and a fresh copy stays that way");
});


test("demo includes general rumination and preserves a legacy track", () => {
  const state = demoHealthState("2030-01-15");
  assert.deepEqual(state.thoughtLoops.map((loop) => loop.name), ["Rumination", "Needing to be certain"]);
  assert.ok(state.thoughtLoops.every((loop) => loop.reply.length > 20));
  assert.ok(state.loopEvents.some(event => event.response?.length > 20));
  assert.ok(state.thoughtJournal.every((entry) => entry.text.length > 30 && !/sample|synthetic/i.test(entry.text)));
  assert.ok(state.habits.every((habit) => habit.name === "Masturbation" || habit.name === "Caffeine"));
});

test("today has a consistent journal and caffeine entry even before the usual morning time", () => {
  const state = demoHealthState(AS_OF, "06:15");
  const journal = state.thoughtJournal.find(entry => entry.date === AS_OF);
  const caffeine = state.habitEvents.filter(entry => entry.date === AS_OF && entry.kind === "intake");
  assert.ok(state.dailyEntries[0].journaled);
  assert.equal(journal.createdAt, new Date(`${AS_OF}T06:15:00`).toISOString());
  assert.equal(caffeine.length, 1);
  assert.equal(caffeine[0].at, `${AS_OF}T06:15`);
  assert.equal(caffeine[0].amountMg, 150);
  assert.equal(state.progressPhotos[0].weightLb, state.dailyEntries[0].weightLb);
});

test("demo photo loading only fetches known bundled examples and respects removals", async () => {
  const photos = new Map();
  const requests = [];
  const fetchAsset = async (path, options) => {
    requests.push({ path, options });
    return new Response(new Blob(["fake-image"], { type: "image/png" }));
  };
  assert.equal(await readDemoPhoto("private-photo-id", photos, fetchAsset), null);
  assert.equal(await readDemoPhoto("/api/photos/private-photo-id", photos, fetchAsset), null);
  assert.equal(requests.length, 0);
  const photo = await readDemoPhoto("demo-progress-recent", photos, fetchAsset);
  assert.equal(photo.type, "image/png");
  assert.equal(await readDemoPhoto("demo-progress-recent", photos, fetchAsset), photo);
  assert.deepEqual(requests, [{ path: "/demo/progress-recent.png", options: { credentials: "same-origin" } }]);
  photos.set("demo-progress-recent", null);
  assert.equal(await readDemoPhoto("demo-progress-recent", photos, fetchAsset), null);
  assert.equal(requests.length, 1, "a removed example is not silently loaded again");
});

test("missing demo photos stay missing without falling back to private storage", async () => {
  const photos = new Map();
  assert.equal(await readDemoPhoto("demo-progress-recent", photos, async () => new Response("Missing", { status: 404 })), null);
  assert.equal(await readDemoPhoto("demo-progress-recent", photos, async () => new Response("Not an image")), null);
  assert.equal(await readDemoPhoto("demo-progress-recent", photos, async () => { throw new Error("Offline"); }), null);
  assert.equal(photos.size, 0);
});


test("the demo includes each elapsed workout day across the whole week", () => {
  const monday = "2026-08-31";
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(monday, day);
    const state = demoHealthState(date);
    const sessions = buildWorkoutSessions(state.workoutSets);
    assert.equal(sessions.length, 19 + (day >= 2 ? 1 : 0) + (day >= 4 ? 1 : 0));
    assert.ok(sessions.every((session) => session.date <= date));
    assert.ok(sessions.filter((session) => session.date >= monday).every((session) => session.sets >= 12));
  }
});


test("sample Strong export round trips sets and timers without duplicate sessions", async () => {
  const { toTable } = await import("../app/import/csv.ts");
  const { strongToRecords, strongNeedsWeightUnit } = await import("../app/import/strong.ts");
  const { applyImport } = await import("../app/import/index.ts");
  const table = toTable(demoStrongCsv(AS_OF));
  assert.equal(strongNeedsWeightUnit(table), false);
  const records = strongToRecords(table);
  const state = demoHealthState(AS_OF);
  const parsed = normalizeHealthState({ ...state, workoutSets: records.workoutSets });
  assert.equal(parsed.workoutSets.length, state.workoutSets.length);
  assert.equal(buildWorkoutSessions(parsed.workoutSets).length, buildWorkoutSessions(state.workoutSets).length);
  assert.ok(parsed.workoutSets.every(set => set.restSeconds > 0));
  const item = { id: "sample", fileName: "sample.csv", label: "Strong workouts", source: "other", include: true, kind: "records", records };
  const once = applyImport(state, [item]);
  const twice = applyImport(once, [item]);
  assert.deepEqual(twice.workoutSets, once.workoutSets);
});
