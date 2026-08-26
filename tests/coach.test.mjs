import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  MUSCLES,
  classifyExercise,
  muscleLabels,
  primaryMuscle,
  weeklyTargets,
} from "../app/training/muscles.ts";
import {
  DAY_CHOICES,
  MAX_DAYS,
  MAX_REST_SECONDS,
  buildBlock,
  buildPlan,
  currentBlockWeek,
  muscleVolume,
  nextSession,
  planToText,
  planVolume,
  recommendDays,
  sessionToText,
  suggestedRest,
  trainingHabit,
  unclassifiedExercises,
  VOLUME_STEP,
  adjustChoice,
  effectiveSets,
  fixChoices,
  longestSession,
  maxSetsPerSession,
  minimumDirect,
  muscleDetail,
  remainingSessions,
  weekLabel,
  weekOutlook,
  weekStart,
  withAddedSets,
} from "../app/training/coach.ts";
import { toTable } from "../app/import/csv.ts";
import { strongToRecords } from "../app/import/strong.ts";
import { addDays, emptyHealthState, normalizeGoals, normalizeHealthState } from "../app/health-model.ts";

const FIXTURE = readFileSync(new URL("./fixtures/strong-sample.csv", import.meta.url), "utf8");
const AS_OF = "2026-04-18";

function stateFrom(text, overrides = {}) {
  const records = strongToRecords(toTable(text));
  return normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets: records.workoutSets,
    ...overrides,
  });
}

function set(exercise, extra = {}) {
  return {
    date: "2026-04-14",
    startedAt: "2026-04-14 18:00:00",
    workoutName: "Session",
    exercise,
    setNumber: 1,
    weightLb: 100,
    reps: 10,
    distance: null,
    seconds: null,
    rpe: null,
    restSeconds: null,
    durationSeconds: null,
    ...extra,
  };
}

function ownedMuscles(state) {
  return new Set(
    state.workoutSets.flatMap((entry) => classifyExercise(entry.exercise).direct),
  );
}

test("an exercise is read for what it trains, not for how it is spelled", () => {
  // A leading asterisk is Strong's superset marker and brackets hold the gym.
  assert.deepEqual(classifyExercise("*Cable Row (Mid-Back)").direct, ["back"]);
  assert.deepEqual(classifyExercise("Crunch (437 New York Ave)").direct, ["core"]);

  // Order of the rules is the specification: these would fall to the wrong rule.
  assert.deepEqual(classifyExercise("Seated Leg Curl (Machine)").direct, ["hamstrings"], "not a biceps curl");
  assert.deepEqual(classifyExercise("Reverse Fly (Machine)").direct, ["rearDelts"], "not a chest fly");
  assert.deepEqual(classifyExercise("Lateral Raise (Band)").direct, ["shoulders"], "not a calf or knee raise");
  assert.deepEqual(classifyExercise("Bulgarian Split Squat").direct, ["quads"]);
  assert.deepEqual(classifyExercise("Romanian Deadlift (Barbell)").direct, ["hamstrings", "glutes"]);

  // A press is a chest set and half a triceps set.
  const bench = classifyExercise("Bench Press (Barbell)");
  assert.deepEqual(bench.direct, ["chest"]);
  assert.ok(bench.indirect.includes("triceps"));
  assert.equal(bench.compound, true);
  assert.equal(classifyExercise("Bicep Curl (Dumbbell)").compound, false);

  assert.equal(primaryMuscle("Leg Press"), "quads");
  assert.deepEqual(classifyExercise("Underwater Basket Weaving").direct, [], "nothing is guessed");
});

test("hip adduction does not count as glute work", () => {
  assert.deepEqual(classifyExercise("Hip Adduction (Machine)").direct, []);
  const sets = Array.from({ length: 8 }, (_, index) =>
    set("Hip Adduction (Machine)", { date: AS_OF, setNumber: index + 1 }),
  );
  const glutes = muscleVolume(sets, AS_OF, 1).find((entry) => entry.muscle === "glutes");

  assert.equal(glutes.direct, 0, "adductor sets must not satisfy the glute target");
  assert.equal(glutes.indirect, 0);
});

test("every exercise in a real export is classified", () => {
  const state = stateFrom(FIXTURE);
  assert.ok(state.workoutSets.length >= 30);
  assert.deepEqual(unclassifiedExercises(state.workoutSets), []);
});

test("indirect work counts at half, and never instead of direct work", () => {
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    // Ten bench sets in one week: ten chest, five triceps, five shoulders.
    workoutSets: Array.from({ length: 10 }, (_, index) =>
      set("Bench Press (Barbell)", { setNumber: index + 1, date: "2026-04-18" }),
    ),
  });

  const volume = muscleVolume(state.workoutSets, AS_OF, 1);
  const chest = volume.find((entry) => entry.muscle === "chest");
  const triceps = volume.find((entry) => entry.muscle === "triceps");
  const calves = volume.find((entry) => entry.muscle === "calves");

  assert.equal(chest.direct, 10, "ten sets where the chest was the point");
  assert.equal(chest.indirect, 0);
  assert.equal(chest.effective, 10, "with nothing indirect, the two are the same");
  assert.equal(chest.status, "in");

  // Ten sets of pressing work the triceps hard, and that counts — at half,
  // because it takes more bystander work to buy the same adaptation.
  assert.equal(triceps.direct, 0);
  assert.equal(triceps.indirect, 10);
  assert.equal(triceps.effective, 5, "ten indirect sets are worth five");
  assert.equal(effectiveSets(0, 10), 5);
  // But it is still no direct work, and half of every floor has to be direct.
  assert.equal(triceps.status, "none", "a muscle with no direct work is called out");
  assert.equal(triceps.gap, minimumDirect("triceps"), "and the gap is the direct work it owes");
  assert.ok(minimumDirect("triceps") > 0 && minimumDirect("triceps") < weeklyTargets.triceps.min);

  assert.equal(calves.direct, 0);
  assert.equal(calves.indirect, 0);
  assert.equal(calves.status, "none");
});

test("volume is per week, so a longer window does not inflate it", () => {
  const weekly = Array.from({ length: 8 }, (_, index) =>
    set("Bicep Curl (Dumbbell)", { setNumber: index + 1, date: index < 4 ? "2026-04-18" : "2026-04-11" }),
  );
  const state = normalizeHealthState({ ...emptyHealthState(new Date("2026-04-18T12:00:00Z")), workoutSets: weekly });
  const overTwo = muscleVolume(state.workoutSets, AS_OF, 2).find((entry) => entry.muscle === "biceps");
  assert.equal(overTwo.direct, 4, "eight sets across two weeks is four a week");
});

test("active training weeks use Monday boundaries", () => {
  const sets = [
    set("Bench Press (Barbell)", { date: "2026-04-06", startedAt: "2026-04-06 18:00:00" }),
    set("Bench Press (Barbell)", { date: "2026-04-09", startedAt: "2026-04-09 18:00:00" }),
    set("Bench Press (Barbell)", { date: "2026-04-29", startedAt: "2026-04-29 18:00:00" }),
  ];
  const chest = muscleVolume(sets, "2026-04-29", 4).find((entry) => entry.muscle === "chest");
  assert.equal(chest.activeWeeks, 2, "Monday and Thursday in one calendar week are one week");
  assert.equal(chest.direct, 1.5);
});

test("rest is read off the rep range and applied, not reported", () => {
  // A heavy compound wants longer than a light isolation, and a high-rep
  // compound is not told to rest less than a moderate-rep one.
  assert.deepEqual(suggestedRest(5, true), { min: 180, max: 180 });
  assert.deepEqual(suggestedRest(15, false), { min: 60, max: 90 });
  assert.ok(suggestedRest(5, true).min > suggestedRest(5, false).min);
  assert.ok(suggestedRest(15, true).min >= suggestedRest(10, true).min);

  const state = stateFrom(FIXTURE);
  // The importer still attaches each rest row's seconds to the set above it.
  assert.ok(state.workoutSets.filter((entry) => entry.restSeconds !== null).length > 20);

  // Nothing waits longer than three minutes, whatever the movement.
  for (let reps = 1; reps <= 30; reps += 1) {
    for (const compound of [true, false]) {
      const rest = suggestedRest(reps, compound);
      assert.ok(rest.max <= MAX_REST_SECONDS, `${reps} reps: ${rest.max}s`);
      assert.ok(rest.min <= rest.max, `${reps} reps: ${rest.min} > ${rest.max}`);
    }
  }

  // And every prescribed rest matches what its rep range asks for.
  for (const session of buildPlan(state, AS_OF, 4).sessions) {
    for (const exercise of session.exercises) {
      const low = Number(exercise.repRange.split("\u2013")[0]);
      const want = suggestedRest(low, exercise.compound);
      assert.ok(
        exercise.restSeconds >= want.min && exercise.restSeconds <= want.max,
        `${exercise.exercise}: ${exercise.restSeconds}s against ${want.min}-${want.max}`,
      );
    }
  }
});

test("the habit reads frequency and session size from the log", () => {
  const state = stateFrom(FIXTURE);
  const habit = trainingHabit(state.workoutSets, AS_OF, 1);
  assert.equal(habit.sessions, 2);
  assert.equal(habit.daysPerWeek, 2);
  assert.equal(habit.setsPerSession, 15);
  assert.equal(habit.minutesPerSession, 61, "the Duration column, averaged over 64 and 58 minutes");
});

test("the day count comes from the training log and nothing else", () => {
  const workoutSets = Array.from({ length: 30 }, (_, index) =>
    set("Bench Press (Barbell)", { setNumber: (index % 5) + 1, date: "2026-04-18", startedAt: `2026-04-1${index % 5} 18:00:00` }),
  );
  const base = { ...emptyHealthState(new Date("2026-04-18T12:00:00Z")), workoutSets, goals: { sleepHours: 8, proteinTargetG: 180 } };

  const rested = normalizeHealthState(base);
  // A terrible week of sleep and food. A programme that rewrote itself on this
  // would not be a programme, so the number must not move.
  const wrecked = normalizeHealthState({
    ...base,
    sleepEntries: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-04-1${2 + index}`.slice(0, 10),
      source: "oura",
      durationHours: 4.5,
    })),
    dailyEntries: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-04-1${2 + index}`.slice(0, 10),
      proteinG: 60,
    })),
  });

  assert.equal(recommendDays(wrecked, AS_OF).days, recommendDays(rested, AS_OF).days);
  for (const limit of recommendDays(wrecked, AS_OF).limits) {
    assert.doesNotMatch(limit, /sleep|protein/i, "recovery is not an input");
  }
  assert.ok(recommendDays(rested, AS_OF).days <= MAX_DAYS);
});

test("the plan is built only from movements already logged in Strong", () => {
  const state = stateFrom(FIXTURE);
  const own = new Set(state.workoutSets.map((entry) => entry.exercise));
  const plan = buildPlan(state, AS_OF, 4);

  assert.equal(plan.days, 4);
  assert.equal(plan.sessions.length, 4);

  for (const session of plan.sessions) {
    assert.ok(session.exercises.length > 0, `${session.name} has something in it`);
    for (const exercise of session.exercises) {
      assert.ok(own.has(exercise.exercise), `${exercise.exercise} is not in the Strong history`);
      assert.ok(exercise.sets >= 2 && exercise.sets <= 5, `${exercise.exercise}: ${exercise.sets} sets is doable`);
      assert.ok(exercise.restSeconds >= 60 && exercise.restSeconds <= 300);
    }
    // No muscle gets an unreasonable pile in one session.
    const byMuscle = new Map();
    for (const exercise of session.exercises) {
      byMuscle.set(exercise.muscle, (byMuscle.get(exercise.muscle) ?? 0) + exercise.sets);
    }
    for (const [muscle, sets] of byMuscle) {
      assert.ok(sets <= 9, `${session.name}: ${sets} sets of ${muscle} in one session is too many`);
    }
  }

  const text = planToText(plan);
  assert.match(text, /^This week — .*4 days/);
  // Not "week 3 of the block": the block runs underneath, but nobody was told
  // what a block is, and being told you are in week three of one is worse than
  // being told nothing.
  assert.doesNotMatch(text, /Week \d|block|mesocycle/i);
  assert.match(text, /rest \d+s/);
});

test("the plan moves every muscle toward its range without overshooting", () => {
  const state = stateFrom(FIXTURE);
  const before = muscleVolume(state.workoutSets, AS_OF, 4);
  const plan = buildPlan(state, AS_OF, 4);
  const after = planVolume(plan);
  const owned = ownedMuscles(state);

  for (const entry of before) {
    const projected = after.get(entry.muscle)?.direct ?? 0;
    if (!owned.has(entry.muscle)) {
      assert.equal(projected, 0, `${entry.label} has no owned direct movement`);
      assert.ok(plan.missing.includes(entry.muscle), `${entry.label} is not reported missing`);
      continue;
    }
    assert.ok(projected > 0, `${entry.label} has an owned movement but gets nothing`);
    assert.ok(
      projected <= entry.target.max,
      `${entry.label} lands at ${projected}, above its ${entry.target.max} ceiling`,
    );
    if (entry.status === "under" || entry.status === "none") {
      assert.ok(projected > entry.direct, `${entry.label} should go up from ${entry.direct}, got ${projected}`);
    }
  }
});

test("asking for fewer days gives fewer sessions, not a broken week", () => {
  const state = stateFrom(FIXTURE);
  for (const days of [2, 3, 4]) {
    const plan = buildPlan(state, AS_OF, days);
    assert.equal(plan.sessions.length, days);
    assert.ok(plan.split.length > 0);
    assert.ok(plan.sessions.every((session) => session.sets > 0));
  }
});

test("a balanced programme is left alone rather than churned", () => {
  // Sized so every muscle gets its own direct work, which is the only kind the
  // targets count.
  const balanced = [];
  const programme = [
    ["Bench Press (Barbell)", 9],
    ["Bent Over Row (Barbell)", 9],
    ["Overhead Press (Barbell)", 7],
    ["Face Pull (Cable)", 6],
    ["Bicep Curl (Dumbbell)", 7],
    ["Triceps Pushdown (Cable)", 7],
    ["Squat (Barbell)", 8],
    ["Romanian Deadlift (Barbell)", 7],
    ["Hip Thrust (Barbell)", 6],
    ["Standing Calf Raise (Machine)", 6],
    ["Hanging Leg Raise", 8],
  ];
  for (const [exercise, count] of programme) {
    for (let index = 0; index < count; index += 1) {
      balanced.push(set(exercise, { setNumber: index + 1, date: "2026-04-18", restSeconds: 120, reps: 10 }));
    }
  }
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets: balanced,
  });

  const volume = muscleVolume(state.workoutSets, AS_OF, 1);
  // Nothing is short. A muscle can sit over its ceiling once the bystander work
  // is counted, which is a fact about the programme rather than a fault here.
  assert.deepEqual(
    volume.filter((entry) => entry.status === "under" || entry.status === "none").map((entry) => entry.muscle),
    [],
    "every muscle is served",
  );

  // Nothing is invented for it, and no muscle is asked to do less.
  const plan = buildPlan(state, AS_OF, 4);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.shortfall, []);
});

test("four sessions is the ceiling, whatever the arithmetic asks for", () => {
  // Someone very far behind: the volume gap alone would argue for far more.
  const workoutSets = Array.from({ length: 4 }, (_, index) =>
    set("Bicep Curl (Dumbbell)", { setNumber: index + 1, date: "2026-04-18", startedAt: "2026-04-18 18:00:00" }),
  );
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets,
  });
  assert.ok(recommendDays(state, AS_OF).days <= MAX_DAYS);
  assert.deepEqual(DAY_CHOICES, [2, 3, 4]);
  // Asking for more than four is clamped rather than accepted.
  assert.equal(buildPlan(state, AS_OF, 6).sessions.length, MAX_DAYS);
});

test("changing the day count changes the direct and indirect a muscle gets", () => {
  const state = stateFrom(FIXTURE);
  const two = planVolume(buildPlan(state, AS_OF, 2));
  const four = planVolume(buildPlan(state, AS_OF, 4));

  // Both halves are reported separately, and both are real numbers.
  for (const totals of [two, four]) {
    for (const [, value] of totals) {
      assert.ok(value.direct >= 0 && value.indirect >= 0);
      assert.equal(
        value.effective,
        effectiveSets(value.direct, value.indirect),
        "the bar draws direct once and indirect at half",
      );
    }
  }

  // What the week owes a muscle does not move with the day count — that was
  // settled deliberately. What moves is how it is packaged: the same work in
  // two long sessions or four short ones.
  const shape = (days) => buildPlan(state, AS_OF, days).sessions.map((session) => session.sets);
  assert.notDeepEqual(shape(2), shape(4), "the plan responds to the number of days");
  assert.equal(shape(2).length, 2);
  assert.equal(shape(4).length, 4);
  assert.ok(Math.max(...shape(2)) > Math.max(...shape(4)), "fewer days, longer sessions");
});

test("a balanced programme is told it is balanced rather than invented problems for", () => {
  // Every muscle gets its own work. Pressing builds triceps and rowing builds
  // biceps, but neither is counted, so the arms carry their own sets — which is
  // what an evidence-based programme prescribes anyway.
  const balanced = [];
  const programme = [
    ["Bench Press (Barbell)", 9],
    ["Bent Over Row (Barbell)", 9],
    ["Overhead Press (Barbell)", 7],
    ["Face Pull (Cable)", 6],
    ["Bicep Curl (Dumbbell)", 7],
    ["Triceps Pushdown (Cable)", 7],
    ["Squat (Barbell)", 8],
    ["Romanian Deadlift (Barbell)", 7],
    ["Hip Thrust (Barbell)", 6],
    ["Standing Calf Raise (Machine)", 6],
    ["Hanging Leg Raise", 8],
  ];
  for (const [exercise, count] of programme) {
    for (let index = 0; index < count; index += 1) {
      balanced.push(set(exercise, { setNumber: index + 1, date: "2026-04-18", restSeconds: 120, reps: 10 }));
    }
  }
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets: balanced,
  });

  const volume = muscleVolume(state.workoutSets, AS_OF, 1);
  // Nothing is short. A muscle can sit over its ceiling once the bystander work
  // is counted, which is a fact about the programme rather than a fault here.
  assert.deepEqual(
    volume.filter((entry) => entry.status === "under" || entry.status === "none").map((entry) => entry.muscle),
    [],
    "every muscle is served",
  );

  // Nothing is invented for it, and no muscle is asked to do less.
  const plan = buildPlan(state, AS_OF, 4);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.shortfall, []);
});

test("four sessions is the ceiling, whatever the arithmetic asks for", () => {
  // Someone very far behind: the volume gap alone would argue for far more.
  const workoutSets = Array.from({ length: 4 }, (_, index) =>
    set("Bicep Curl (Dumbbell)", { setNumber: index + 1, date: "2026-04-18", startedAt: "2026-04-18 18:00:00" }),
  );
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets,
  });
  assert.ok(recommendDays(state, AS_OF).days <= MAX_DAYS);
  assert.deepEqual(DAY_CHOICES, [2, 3, 4]);
  // Asking for more than four is clamped rather than accepted.
  assert.equal(buildPlan(state, AS_OF, 6).sessions.length, MAX_DAYS);
});

test("changing the day count changes the direct and indirect a muscle gets", () => {
  const state = stateFrom(FIXTURE);
  const two = planVolume(buildPlan(state, AS_OF, 2));
  const four = planVolume(buildPlan(state, AS_OF, 4));

  // Both halves are reported separately, and both are real numbers.
  for (const totals of [two, four]) {
    for (const [, value] of totals) {
      assert.ok(value.direct >= 0 && value.indirect >= 0);
      assert.equal(
        value.effective,
        effectiveSets(value.direct, value.indirect),
        "the bar draws direct once and indirect at half",
      );
    }
  }

  // What the week owes a muscle does not move with the day count — that was
  // settled deliberately. What moves is how it is packaged: the same work in
  // two long sessions or four short ones.
  const shape = (days) => buildPlan(state, AS_OF, days).sessions.map((session) => session.sets);
  assert.notDeepEqual(shape(2), shape(4), "the plan responds to the number of days");
  assert.equal(shape(2).length, 2);
  assert.equal(shape(4).length, 4);
  assert.ok(Math.max(...shape(2)) > Math.max(...shape(4)), "fewer days, longer sessions");
});

test("whatever day count you pick, the week meets its own targets", () => {
  const state = stateFrom(FIXTURE);

  for (const days of DAY_CHOICES) {
    // Every building week of the block, not just the first: the deload is meant
    // to come up short and says so by being a deload.
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      if (plan.deload) continue;
      const after = planVolume(plan);
      for (const muscle of MUSCLES) {
        const aim = weeklyTargets[muscle];
        const planned = after.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
        // Either the week carries it, or the week says out loud that this many
        // days cannot. Printing a target nobody could hit is the one thing it
        // must not do. Both floors have to clear: the work floor, which
        // bystander sets help with, and the direct floor, which they do not.
        assert.ok(
          (planned.effective >= aim.min && planned.direct >= minimumDirect(muscle)) ||
            plan.shortfall.includes(muscle),
          `${days} days, ${weekLabel(plan)}: ${muscleLabels[muscle]} gets ${planned.effective} (${planned.direct} direct), aim is ${aim.min}`,
        );
        assert.ok(
          planned.effective <= aim.max,
          `${days} days: ${muscleLabels[muscle]} overshoots at ${planned.effective}`,
        );
      }
    }
  }
});

test("the plan never quietly prescribes less than a short muscle already gets", () => {
  const state = stateFrom(FIXTURE);

  for (const days of DAY_CHOICES) {
    // Judged on the same day count as the plan: choosing to train twice is
    // choosing to do less, and that is a decision, not a regression.
    const now = muscleVolume(state.workoutSets, AS_OF, 4, days);
    const after = planVolume(buildPlan(state, AS_OF, days));
    for (const entry of now) {
      if (entry.status !== "under" && entry.status !== "none") continue;
      const planned = after.get(entry.muscle)?.direct ?? 0;
      assert.ok(
        planned >= entry.direct || buildPlan(state, AS_OF, days).shortfall.includes(entry.muscle),
        `${days} days: ${entry.label} drops from ${entry.direct} to ${planned} without being reported`,
      );
    }
  }
});

test("more days never means less work, and fewer days means longer sessions", () => {
  const state = stateFrom(FIXTURE);
  const plans = Object.fromEntries(DAY_CHOICES.map((days) => [days, buildPlan(state, AS_OF, days)]));
  const total = (days) => plans[days].sessions.reduce((sum, session) => sum + session.sets, 0);
  const [two, three, four] = [total(2), total(3), total(4)];
  assert.ok(three >= two, `3 days (${three}) should carry at least as much as 2 (${two})`);
  assert.ok(four >= three, `4 days (${four}) should carry at least as much as 3 (${three})`);

  // What the week owes each muscle is a fact about the muscle, so a week of two
  // does not get to owe less. It pays in longer sessions instead — which is the
  // trade a twice-a-week lifter actually makes, and the reason two days can
  // cover the week at all.
  assert.ok(maxSetsPerSession(2) > maxSetsPerSession(3), "two days allows a longer session than three");
  assert.ok(maxSetsPerSession(3) > maxSetsPerSession(4), "three allows a longer session than four");
  const longest = (days) => Math.max(...plans[days].sessions.map((session) => session.sets));
  assert.ok(longest(2) > longest(4), `2 days runs ${longest(2)} a session, 4 runs ${longest(4)}`);
  // A session may run past the nominal length when another runs short — what a
  // body recovers from is a week, not a Tuesday — but the week's budget holds.
  for (const days of DAY_CHOICES) {
    for (const session of plans[days].sessions) {
      assert.ok(
        session.sets <= longestSession(days),
        `${days} days: ${session.name} is ${session.sets} sets`,
      );
    }
    assert.ok(total(days) <= days * maxSetsPerSession(days), `${days} days carries ${total(days)}`);
  }
});

test("every muscle with an owned movement gets direct work, at every day count", () => {
  const state = stateFrom(FIXTURE);
  const owned = ownedMuscles(state);
  for (const days of [2, 3, 4]) {
    const plan = buildPlan(state, AS_OF, days);
    const after = planVolume(plan);
    for (const muscle of MUSCLES) {
      const value = after.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      if (owned.has(muscle)) {
        assert.ok(value.direct > 0, `${days} days: ${muscle} has history but gets only indirect work`);
      } else {
        assert.equal(value.direct, 0, `${days} days: ${muscle} has no owned direct movement`);
        assert.ok(plan.missing.includes(muscle), `${days} days: ${muscle} is not reported missing`);
      }
    }
    // And no session is longer than someone would actually finish, nor the week
    // bigger than the day count paid for.
    assert.ok(
      plan.sessions.reduce((sum, one) => sum + one.sets, 0) <= days * maxSetsPerSession(days),
      `${days} days carries too much`,
    );
    for (const session of plan.sessions) {
      assert.ok(
        session.sets <= longestSession(days),
        `${days} days: ${session.name} is ${session.sets} sets`,
      );
      const byMuscle = new Map();
      for (const exercise of session.exercises) {
        byMuscle.set(exercise.muscle, (byMuscle.get(exercise.muscle) ?? 0) + exercise.sets);
      }
      for (const [muscle, sets] of byMuscle) {
        assert.ok(sets <= 11, `${session.name}: ${sets} sets of ${muscle}`);
      }
    }
  }
});

test("a muscle trained twice in the week gets two different movements", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const byMuscle = new Map();
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const list = byMuscle.get(exercise.muscle) ?? new Set();
      list.add(exercise.exercise);
      byMuscle.set(exercise.muscle, list);
    }
  }
  // Back appears on both upper days and the history has several rows, so the
  // week should not repeat one lift when it owns more than one.
  const back = byMuscle.get("back");
  assert.ok(back.size >= 2, `back uses only ${[...back].join(", ")}`);
});

test("a day count that cannot carry the week says so", () => {
  const state = stateFrom(FIXTURE);
  const two = buildPlan(state, AS_OF, 2);
  const four = buildPlan(state, AS_OF, 4);
  // Four sessions hold more than two, so it should report at most what two does.
  assert.ok(four.shortfall.length <= two.shortfall.length);
  for (const muscle of two.shortfall) assert.ok(MUSCLES.includes(muscle));
});

test("a block is three weeks that build and one that backs off", () => {
  const state = stateFrom(FIXTURE);
  const block = buildBlock(state, AS_OF);
  assert.equal(block.length, 4);

  const total = (plan) => plan.sessions.reduce((sum, session) => sum + session.sets, 0);
  assert.deepEqual(block.map(weekLabel), ["This week", "This week", "This week", "Easier week"]);
  assert.deepEqual(block.map((plan) => plan.deload), [false, false, false, true]);

  // Volume climbs across the building weeks and drops on the fourth.
  assert.ok(total(block[1]) >= total(block[0]), `${total(block[1])} vs ${total(block[0])}`);
  assert.ok(total(block[2]) >= total(block[1]), `${total(block[2])} vs ${total(block[1])}`);
  for (let week = 0; week < 3; week += 1) {
    assert.ok(total(block[3]) < total(block[week]), `deload ${total(block[3])} vs ${total(block[week])}`);
  }

  // The roster is stable across a block, give or take: a week carrying more
  // volume can need another movement to spread it over, and a muscle that has
  // come down toward its aim to make room for one that was short can retire
  // one. What it must not do is churn — most of a week is the same movements
  // it was last week, or the block is a series of unrelated weeks.
  const roster = (plan) => new Set(plan.sessions.flatMap((s) => s.exercises.map((e) => e.exercise)));
  for (let week = 1; week < block.length; week += 1) {
    const before = [...roster(block[week - 1])];
    const kept = before.filter((exercise) => roster(block[week]).has(exercise));
    assert.ok(
      kept.length >= before.length - 2,
      `${before.length - kept.length} movements dropped after ${weekLabel(block[week - 1])}`,
    );
  }

  // A deload keeps the movements and the loads; it only takes sets away.
  const before = roster(block[2]);
  for (const session of block[3].sessions) {
    for (const exercise of session.exercises) {
      assert.ok(before.has(exercise.exercise), `${exercise.exercise} appears only in the deload`);
      assert.ok(exercise.sets <= 3, `${exercise.exercise}: ${exercise.sets} sets in a deload`);
    }
  }
  // Backing off is the point of the week, so it is never called a shortfall.
  assert.deepEqual(block[3].shortfall, []);
});

test("each week of the block takes its own number of days", () => {
  const state = stateFrom(FIXTURE);
  // A busy second week, everything else on the suggestion.
  const block = buildBlock(state, AS_OF, [0, 2, 0, 0]);
  assert.equal(block[1].days, 2);
  assert.equal(block[1].sessions.length, 2);

  const auto = buildBlock(state, AS_OF);
  assert.equal(block[0].days, auto[0].days, "the other weeks are untouched");
  assert.equal(block[2].days, auto[2].days);
  assert.equal(block[3].days, auto[3].days);

  // Out-of-range choices fall back rather than producing a broken week.
  const odd = buildBlock(state, AS_OF, [9, 1, -3, 0]);
  for (const plan of odd) assert.ok(plan.days >= 2 && plan.days <= MAX_DAYS);
});

test("every week of the block prescribes a load you have actually used", () => {
  const state = stateFrom(FIXTURE);
  const lifted = new Map();
  for (const entry of state.workoutSets) {
    if (entry.weightLb === null) continue;
    lifted.set(entry.exercise, Math.max(lifted.get(entry.exercise) ?? 0, entry.weightLb));
  }

  for (const plan of buildBlock(state, AS_OF)) {
    for (const session of plan.sessions) {
      for (const exercise of session.exercises) {
        if (exercise.weightLb === null) continue;
        assert.ok(lifted.has(exercise.exercise), `${exercise.exercise} has a load but no history`);
        assert.ok(
          exercise.weightLb <= lifted.get(exercise.exercise),
          `${exercise.exercise}: ${exercise.weightLb} lb is above anything logged`,
        );
      }
    }
  }
});

test("the block carries the day choice into the copied text", () => {
  const state = stateFrom(FIXTURE);
  const block = buildBlock(state, AS_OF, [0, 2, 0, 0]);
  assert.match(planToText(block[1]), /^This week — .*2 days/);
  assert.match(planToText(block[3]), /^Easier week —/);
  // Loads come through, so the text is something to lift from.
  assert.match(planToText(block[0]), /@ [\d.]+ lb/);
});

test("trimming an overshoot never creates a shortfall", () => {
  const state = stateFrom(FIXTURE);
  // A row cut to bring the rear delts down also takes sets off the back. The
  // trim exists to correct too much, so it must not manufacture too little.
  const plan = buildPlan(state, AS_OF, 4);
  const after = planVolume(plan);
  const below = [...after.entries()].filter(
    ([muscle, value]) =>
      value.effective < weeklyTargets[muscle].min || value.direct < minimumDirect(muscle),
  );
  assert.ok(
    below.every(([muscle]) => plan.missing.includes(muscle)),
    `owned muscles below minimum: ${below.map(([m, v]) => `${m} ${v.effective}`).join(", ")}`,
  );
  for (const [muscle, value] of after) {
    assert.ok(
      value.effective <= weeklyTargets[muscle].max,
      `${muscle} overshoots at ${value.effective}`,
    );
  }
});

test("more days never puts fewer muscles in range", () => {
  const state = stateFrom(FIXTURE);
  const inRange = (days) => {
    const after = planVolume(buildPlan(state, AS_OF, days));
    return [...after.entries()].filter(
      ([muscle, value]) =>
        value.direct >= weeklyTargets[muscle].min && value.direct <= weeklyTargets[muscle].max,
    ).length;
  };
  const [two, three, four] = [inRange(2), inRange(3), inRange(4)];
  assert.ok(three >= two, `3 days covers ${three}, 2 days covers ${two}`);
  assert.ok(four >= three, `4 days covers ${four}, 3 days covers ${three}`);
});

/* --------------------------------------------------- progressive overload */

/**
 * A history of one movement: `sessions` sessions of `sets` sets at a fixed load
 * and rep count, every third day, the last of them in the evening of the day
 * the plan is built — later than anything in the fixture, so it is the session
 * a progression is judged on.
 *
 * Deliberately more sets than the fixture holds of anything, so the rep range
 * the plan chooses is the one the test asked for rather than an average with
 * the fixture's own sets.
 */
function history(exercise, sessions, weightLb, reps, sets = 3, last = AS_OF) {
  const entries = [];
  for (let index = 0; index < sessions; index += 1) {
    const date = addDays(last, -(sessions - 1 - index) * 3);
    for (let number = 1; number <= sets; number += 1) {
      entries.push(set(exercise, { date, startedAt: `${date} 18:00:00`, setNumber: number, weightLb, reps }));
    }
  }
  return entries;
}

/** The fixture's sets plus a history bolted onto them. */
function withHistory(...entries) {
  return stateFrom(FIXTURE, {
    workoutSets: [...strongToRecords(toTable(FIXTURE)).workoutSets, ...entries.flat()],
  });
}

/** The plan's line for one movement, wherever in the week it landed. */
function planned(plan, exercise) {
  for (const session of plan.sessions) {
    const found = session.exercises.find((entry) => entry.exercise === exercise);
    if (found) return found;
  }
  return null;
}

test("a rep range is prescribed for what the movement is for, not copied from you", () => {
  // The old rule was to bracket whatever you already did, which is a mirror
  // rather than a coach: squat for twelve once and it asks for twelve forever.
  const state = withHistory(
    history("Squat (Barbell)", 6, 225, 12),
    history("Bicep Curl (Dumbbell)", 6, 30, 6),
    history("Deadlift (Barbell)", 6, 275, 12),
  );
  const plan = buildPlan(state, AS_OF, 4);

  // A lift that loads three muscle groups at once goes heavy and short; a
  // single-joint movement has no business being loaded to a heavy five.
  assert.equal(planned(plan, "Deadlift (Barbell)")?.repRange, "5–8");
  assert.equal(planned(plan, "Squat (Barbell)")?.repRange, "6–10");
  assert.equal(planned(plan, "Bicep Curl (Dumbbell)")?.repRange, "8–12");

  // And every range sits inside the window where hypertrophy actually happens.
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const [low, top] = exercise.repRange.split("\u2013").map(Number);
      assert.ok(low >= 5 && top <= 20, `${exercise.exercise}: ${exercise.repRange}`);
      assert.ok(top > low);
    }
  }
});

test("a load that does not suit the range is re-anchored to your own best effort", () => {
  // Squatting two hundred and twenty-five for twelve is not squatting two
  // hundred and twenty-five for six to ten. The load has to answer the
  // question being asked, and their own estimated max is what answers it.
  const state = withHistory(history("Squat (Barbell)", 6, 225, 12));
  const squat = planned(buildPlan(state, AS_OF, 4), "Squat (Barbell)");
  assert.equal(squat.repRange, "6–10");
  assert.ok(squat.weightLb > 225, `${squat.weightLb} lb should be heavier than 225 for twelve`);
  // Epley on 225 × 12 is about 315; the middle of 6–10 is worth around 249.
  assert.ok(squat.weightLb > 235 && squat.weightLb < 265, `${squat.weightLb} lb`);
  assert.equal(squat.stepUp, false, "re-anchoring is not a progression");
  assert.equal(squat.stalled, false);
});

test("clearing the top of the rep range is what earns the next load", () => {
  // Reps climbing inside the range: the load holds and the reps do the work.
  const climbing = withHistory(
    history("Bench Press (Barbell)", 1, 135, 6, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 135, 7, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 135, 8, 3),
  );
  const holding = planned(buildPlan(climbing, AS_OF, 4), "Bench Press (Barbell)");
  assert.equal(holding.repRange, "6–10");
  assert.equal(holding.weightLb, 135, "the reps have not been earned yet, so the weight holds");
  assert.equal(holding.stepUp, false);
  assert.equal(holding.stalled, false);

  // The same load, but the last session hit the top of the range on every set.
  const earned = withHistory(
    history("Bench Press (Barbell)", 1, 135, 8, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 135, 9, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 135, 10, 3),
  );
  const up = planned(buildPlan(earned, AS_OF, 4), "Bench Press (Barbell)");
  assert.equal(up.stepUp, true, "the range was cleared, so the load goes up");
  assert.ok(up.weightLb > 135, `${up.weightLb} lb`);
});

test("progression and deloads anchor to the latest working load", () => {
  // A median of the last three loads lags an earned rising sequence. It used to
  // label 115 an increase after the lifter had already used 120, and a deload
  // went back to 110 despite promising to hold the working weight.
  const state = withHistory(
    history("Bench Press (Barbell)", 1, 100, 10, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 110, 10, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 120, 10, 3),
  );
  const building = planned(buildPlan(state, AS_OF, 4), "Bench Press (Barbell)");
  const deload = planned(buildPlan(state, AS_OF, 4, 3), "Bench Press (Barbell)");

  assert.equal(building.weightLb, 125, "the earned step starts above the latest 120 lb session");
  assert.equal(building.stepUp, true);
  assert.equal(deload.weightLb, 120, "the easier week holds the latest working load");
  assert.equal(deload.stepUp, false);
});

test("a lift that has not moved in three sessions gets the load taken off it", () => {
  // The coach had no answer for this at all: it held the weight for ever and
  // let someone grind the same session until they gave up.
  const stuck = withHistory(
    history("Bench Press (Barbell)", 1, 135, 7, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 135, 7, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 135, 7, 3),
  );
  const backed = planned(buildPlan(stuck, AS_OF, 4), "Bench Press (Barbell)");
  assert.equal(backed.stalled, true);
  assert.equal(backed.stepUp, false);
  assert.ok(backed.weightLb < 135 && backed.weightLb >= 135 * 0.85, `${backed.weightLb} lb`);

  // Reps that are still climbing are not a stall, however slowly.
  const creeping = withHistory(
    history("Bench Press (Barbell)", 1, 135, 7, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 135, 7, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 135, 8, 3),
  );
  assert.equal(planned(buildPlan(creeping, AS_OF, 4), "Bench Press (Barbell)").stalled, false);

  // And a movement is never told to go up and down at once.
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(stateFrom(FIXTURE), AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        for (const exercise of session.exercises) {
          assert.ok(!(exercise.stepUp && exercise.stalled), `${exercise.exercise} is both`);
        }
      }
    }
  }
});

test("the increment is sized to the movement and to what the gym has", () => {
  const step = (exercise, weightLb, reps) => {
    const state = withHistory(
      history(exercise, 1, weightLb, reps - 2, 3, addDays(AS_OF, -8)),
      history(exercise, 1, weightLb, reps - 1, 3, addDays(AS_OF, -4)),
      history(exercise, 1, weightLb, reps, 3),
    );
    const line = planned(buildPlan(state, AS_OF, 4), exercise);
    assert.ok(line, `${exercise} is not in the plan`);
    assert.equal(line.stepUp, true, `${exercise} did not earn a step`);
    return line.weightLb - weightLb;
  };

  // A squat takes a bigger jump than a curl; both land on something loadable.
  const squat = step("Squat (Barbell)", 225, 10);
  const curl = step("Bicep Curl (Dumbbell)", 30, 12);
  assert.equal(squat, 10, "a lower-body compound moves in tens");
  assert.equal(curl, 2.5, "a light isolation moves in the smallest plate there is");
});

test("an easier week holds the weight and cuts the sets", () => {
  const state = withHistory(
    history("Bench Press (Barbell)", 1, 135, 8, 3, addDays(AS_OF, -8)),
    history("Bench Press (Barbell)", 1, 135, 9, 3, addDays(AS_OF, -4)),
    history("Bench Press (Barbell)", 1, 135, 10, 3),
  );
  const block = buildBlock(state, AS_OF, [4, 4, 4, 4]);
  const week = planned(block[0], "Bench Press (Barbell)");
  const easier = planned(block[3], "Bench Press (Barbell)");

  assert.equal(week.stepUp, true, "the building week earns the increase");
  assert.ok(week.weightLb > 135, "and asks for the next load");
  assert.equal(easier.stepUp, false, "the easier week does not");
  assert.equal(easier.stalled, false, "nor does it back anything off");
  assert.equal(easier.weightLb, 135, "it holds the working weight");
  assert.ok(easier.sets <= week.sets, "what comes off an easier week is the sets");
  assert.match(planToText(block[3]), /easier week on purpose/i);
  assert.match(planToText(block[0]), /top of the rep range/i);
});

test("a plan ignores history after its as-of date", () => {
  const past = addDays(AS_OF, -7);
  const future = addDays(AS_OF, 7);
  const state = stateFrom(FIXTURE, {
    workoutSets: [
      ...history("Bench Press (Barbell)", 1, 100, 8, 2, past),
      ...history("Bench Press (Barbell)", 1, 300, 8, 2, future),
      ...history("Chin Up", 1, null, 8, 2, past),
      ...history("Chin Up", 1, 100, 8, 2, future),
      ...history("Chest Press (Machine)", 1, 250, 8, 2, future),
    ],
  });
  const plan = buildPlan(state, AS_OF, 4);
  const bench = planned(plan, "Bench Press (Barbell)");
  const chin = planned(plan, "Chin Up");

  assert.equal(bench?.weightLb, 100, "a future 300 lb session must not change today's load");
  assert.equal(chin?.bodyweight, true, "a future weighted session must not rewrite today's lift type");
  assert.equal(chin?.weightLb, null);
  assert.equal(planned(plan, "Chest Press (Machine)"), null, "a future-only movement is not owned yet");
});

test("a load never floats between plates", () => {
  const state = stateFrom(FIXTURE);
  for (const plan of buildBlock(state, AS_OF, [2, 3, 4, 4])) {
    for (const session of plan.sessions) {
      for (const exercise of session.exercises) {
        if (exercise.weightLb === null) continue;
        assert.equal(
          Math.round(exercise.weightLb * 2) / 2,
          exercise.weightLb,
          `${exercise.exercise} at ${exercise.weightLb} lb`,
        );
      }
    }
  }
});

/* ------------------------------------------------------- knowing where you are */

test("the block turns over by itself, one week at a time", () => {
  // Training every week from a Monday. Each following Monday is the next week
  // of the block, and the fifth comes back round to the first.
  const first = "2026-03-02";
  const trained = (weeks) =>
    stateFrom(FIXTURE, {
      workoutSets: weeks.map((week) =>
        set("Bench Press (Barbell)", {
          date: addDays(first, week * 7),
          startedAt: `${addDays(first, week * 7)} 18:00:00`,
        }),
      ),
    });

  const every = trained([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  for (let week = 0; week < 9; week += 1) {
    const monday = addDays(first, week * 7);
    assert.equal(currentBlockWeek(every, monday), week % 4, `week ${week} from ${monday}`);
    // Any day of that week is the same week of the block: it turns over on a
    // Monday, not mid-session.
    assert.equal(currentBlockWeek(every, addDays(monday, 6)), week % 4, `sunday of week ${week}`);
  }

  // Nothing logged is week one, not a crash.
  assert.equal(currentBlockWeek(stateFrom(FIXTURE, { workoutSets: [] }), AS_OF), 0);
});

test("a long break starts a new block rather than landing mid-one", () => {
  const first = "2026-03-02";
  const session = (week) =>
    set("Bench Press (Barbell)", {
      date: addDays(first, week * 7),
      startedAt: `${addDays(first, week * 7)} 18:00:00`,
    });

  // Trained weeks 0 and 1, then nothing until week 6, then every week after.
  // Week 6 is the start of a block, not its third week.
  const afterBreak = stateFrom(FIXTURE, {
    workoutSets: [session(0), session(1), session(6), session(7), session(8), session(9)],
  });
  assert.equal(currentBlockWeek(afterBreak, addDays(first, 6 * 7)), 0, "the run restarts the count");
  assert.equal(currentBlockWeek(afterBreak, addDays(first, 7 * 7)), 1);
  assert.equal(currentBlockWeek(afterBreak, addDays(first, 9 * 7)), 3, "and the deload lands three weeks in");

  // A single week off is a light week, not a break, so the block carries on.
  const oneOff = stateFrom(FIXTURE, { workoutSets: [session(0), session(1), session(3)] });
  assert.equal(currentBlockWeek(oneOff, addDays(first, 2 * 7)), 2, "the week off is still week three");
  assert.equal(currentBlockWeek(oneOff, addDays(first, 3 * 7)), 3, "week four of the same block");

  // And while you are still in a break, you are at the start of the next block.
  const stopped = stateFrom(FIXTURE, { workoutSets: [session(0), session(1)] });
  assert.equal(currentBlockWeek(stopped, addDays(first, 5 * 7)), 0);
});

test("which session is next is the one that covers what is missing", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  // AS_OF is a Saturday; the Monday of its week is the 13th.
  const monday = "2026-04-13";

  const afterDoing = (exercises) =>
    stateFrom(FIXTURE, {
      workoutSets: exercises.flatMap((exercise, day) =>
        Array.from({ length: 4 }, (_, index) =>
          set(exercise, {
            date: addDays(monday, day),
            startedAt: `${addDays(monday, day)} 18:00:00`,
            setNumber: index + 1,
          }),
        ),
      ),
    });

  // Nothing logged: the week as it was written, in order.
  const fresh = nextSession(plan, afterDoing([]), AS_OF);
  assert.equal(fresh.done, 0);
  assert.equal(fresh.of, plan.sessions.length);
  assert.equal(fresh.session?.name, plan.sessions[0].name, "a fresh week is the week as planned");
  assert.deepEqual(
    remainingSessions(plan, afterDoing([]), AS_OF).map((session) => session.name),
    plan.sessions.map((session) => session.name),
  );

  // A day of pressing spent: what is left is ranked by what it closes, not by
  // where it sat in the list, so the sessions carrying the untouched muscles
  // come up rather than the next index.
  const pressed = afterDoing(["Bench Press (Barbell)"]);
  const left = remainingSessions(plan, pressed, AS_OF);
  assert.equal(left.length, plan.sessions.length - 1, "one session is spent");
  const covered = (sessions) => {
    const total = new Map();
    for (const session of sessions) {
      for (const exercise of session.exercises) {
        for (const muscle of classifyExercise(exercise.exercise).direct) {
          total.set(muscle, (total.get(muscle) ?? 0) + exercise.sets);
        }
      }
    }
    return total;
  };
  // What is left covers more of what is missing than simply carrying on down
  // the list would have.
  const need = (sessions) =>
    MUSCLES.reduce((sum, muscle) => sum + Math.min(covered(sessions).get(muscle) ?? 0, weeklyTargets[muscle].min), 0);
  assert.ok(
    need(left) >= need(plan.sessions.slice(1)),
    `picked ${left.map((s) => s.name).join(", ")} over ${plan.sessions.slice(1).map((s) => s.name).join(", ")}`,
  );

  // Every session done is a week finished, not a fifth session invented.
  const finished = afterDoing(plan.sessions.map(() => "Bench Press (Barbell)"));
  assert.equal(nextSession(plan, finished, AS_OF).session, null);
  assert.equal(remainingSessions(plan, finished, AS_OF).length, 0);
});

test("current-week Strong work counts direct and indirect credit and consumes matching prescriptions", () => {
  const monday = weekStart(AS_OF);
  const imported = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 6 }, (_, index) =>
      set("Bench Press (Barbell)", {
        date: monday,
        startedAt: `${monday} 18:00:00`,
        setNumber: index + 1,
      }),
    ),
  });
  const plannedBench = (sets) => ({
    exercise: "Bench Press (Barbell)",
    sets,
    muscle: "chest",
  });
  const plan = {
    days: 2,
    week: 0,
    deload: false,
    split: "Synthetic",
    sessions: [
      { name: "Upper A", shape: "upper", exercises: [plannedBench(4)], sets: 4 },
      { name: "Upper B", shape: "upper", exercises: [plannedBench(4)], sets: 4 },
    ],
    missing: [],
    shortfall: [],
  };

  const outlook = weekOutlook(plan, imported, AS_OF);
  const chest = outlook.find((row) => row.muscle === "chest");
  const triceps = outlook.find((row) => row.muscle === "triceps");
  const shoulders = outlook.find((row) => row.muscle === "shoulders");
  assert.equal(chest.done, 6, "one bench set is one direct chest set");
  assert.equal(triceps.done, 3, "one bench set is half an indirect triceps set");
  assert.equal(shoulders.done, 3, "one bench set is half an indirect shoulder set");

  const left = remainingSessions(plan, imported, AS_OF);
  assert.equal(left.length, 1, "one imported Strong session consumes one planned session");
  assert.equal(left[0].exercises[0].sets, 2, "six completed sets consume six of the eight prescribed sets");
  assert.equal(left[0].sets, 2);
  assert.equal(chest.coming, 2);
  assert.equal(triceps.coming, 1);
  assert.equal(chest.projected, 8, "completed plus remaining work preserves the intended week");
  assert.equal(triceps.projected, 4);
  assert.deepEqual(nextSession(plan, imported, AS_OF), { session: left[0], done: 1, of: 2 });
});

test("last week's sessions do not count against this week", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  // Four sessions, all in the week before the one AS_OF falls in.
  const lastWeek = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 4 }, (_, index) =>
      set("Bench Press (Barbell)", {
        date: addDays("2026-04-06", index),
        startedAt: `${addDays("2026-04-06", index)} 18:00:00`,
      }),
    ),
  });
  const next = nextSession(plan, lastWeek, AS_OF);
  assert.equal(next.done, 0, "the count starts again on Monday");
  assert.equal(next.session?.name, plan.sessions[0].name);
});

test("a session copies on its own, not as part of the week", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const [first, second] = plan.sessions;
  const text = sessionToText(plan, first);

  assert.ok(text.startsWith(`${first.name} — ${weekLabel(plan)}`), text.split("\n")[0]);
  for (const exercise of first.exercises) {
    assert.ok(text.includes(exercise.exercise), `${exercise.exercise} is missing`);
  }
  assert.ok(!text.includes(second.name), "the other sessions stay out of it");
  assert.match(text, /rest \d+s/);
  assert.match(text, /top of the rep range/i);

  // The whole week still copies as the whole week.
  const week = planToText(plan);
  for (const session of plan.sessions) assert.ok(week.includes(session.name), `${session.name} is missing`);

  // A deload says what a deload is, on either route.
  const deload = buildBlock(state, AS_OF, [4, 4, 4, 4])[3];
  assert.match(sessionToText(deload, deload.sessions[0]), /easier week on purpose/i);
});

test("no rest in any plan runs past three minutes", () => {
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        for (const exercise of session.exercises) {
          assert.ok(
            exercise.restSeconds <= MAX_REST_SECONDS,
            `${exercise.exercise} rests ${exercise.restSeconds}s on ${days} days`,
          );
          // And the card rounds to a half minute, so three is what it shows.
          assert.ok(Math.round(exercise.restSeconds / 30) / 2 <= 3);
        }
      }
    }
  }
});

/* ------------------------------------------------ what a week is asked for */

test("a target is a fact about the muscle, not about your week", () => {
  const state = stateFrom(FIXTURE);

  // The same numbers whatever you pick. What fits into two sessions is a fact
  // about your week; a target that shrinks to meet it can never tell you that
  // two sessions are not enough.
  for (const muscle of MUSCLES) {
    const aim = weeklyTargets[muscle];
    for (const days of DAY_CHOICES) {
      const shown = muscleVolume(state.workoutSets, AS_OF, 4).find((entry) => entry.muscle === muscle);
      assert.deepEqual(shown.target, aim, `${muscle} at ${days} days`);
    }
    // Shaped like the dose-response literature: a floor that grows something,
    // a ceiling where the returns have gone.
    assert.ok(aim.min >= 4 && aim.min <= 10, `${muscle} floor ${aim.min}`);
    assert.ok(aim.max >= 12 && aim.max <= 22, `${muscle} ceiling ${aim.max}`);
    assert.ok(aim.min < aim.max);
  }

  // The floors remain fixed. A muscle without a Strong movement stays short
  // instead of getting an invented exercise to make the test pass.
  const missing = MUSCLES.filter((muscle) => !ownedMuscles(state).has(muscle));
  for (const days of DAY_CHOICES) {
    const plan = buildPlan(state, AS_OF, days);
    assert.deepEqual([...plan.missing].sort(), [...missing].sort(), `${days} days reports missing vocabulary`);
    for (const muscle of missing) {
      assert.ok(plan.shortfall.includes(muscle), `${days} days hides the ${muscle} shortfall`);
    }
  }
});

test("calves are not treated like quads", () => {
  // Nobody comes to the gym for calves, and every set spent on them is a set
  // not spent on something short.
  assert.ok(
    weeklyTargets.calves.min < weeklyTargets.quads.min,
    `calves ${weeklyTargets.calves.min} vs quads ${weeklyTargets.quads.min}`,
  );
  assert.ok(weeklyTargets.calves.max < weeklyTargets.quads.max);

  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    const volume = planVolume(buildPlan(state, AS_OF, days));
    const calves = volume.get("calves")?.direct ?? 0;
    for (const muscle of ["chest", "back", "quads", "hamstrings"]) {
      assert.ok(
        (volume.get(muscle)?.direct ?? 0) >= calves,
        `${days} days: calves get ${calves} direct, ${muscle} gets ${volume.get(muscle)?.direct}`,
      );
    }
    // And strictly less than the ones anybody actually trains for.
    for (const muscle of ["chest", "back", "quads"]) {
      assert.ok(
        (volume.get(muscle)?.effective ?? 0) > (volume.get("calves")?.effective ?? 0),
        `${days} days: calves ${volume.get("calves")?.effective}, ${muscle} ${volume.get(muscle)?.effective}`,
      );
    }
  }
});

test("a muscle is never trained only as a bystander", () => {
  // Bystander work counts toward a floor, which is why a week of two can cover
  // eleven muscle groups at all. What it must never do is cover one on its own:
  // twelve sets of pressing would otherwise stand in for every triceps set, and
  // the plan would program no extension, no lengthened-position work, nothing
  // chosen for the muscle. Half of every floor has to be met head-on.
  const pressing = Array.from({ length: 20 }, (_, index) =>
    set("Bench Press (Barbell)", { setNumber: index + 1, date: "2026-04-18", reps: 8 }),
  );
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets: pressing,
  });
  const triceps = muscleVolume(state.workoutSets, AS_OF, 1).find((entry) => entry.muscle === "triceps");
  assert.ok(triceps.indirect >= 20, "the pressing is recorded");
  assert.equal(triceps.direct, 0, "and none of it counts as direct work");
  assert.equal(triceps.status, "none");

  // Which is also true of every week the coach builds.
  const fixture = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(fixture, AS_OF, [days, days, days, days])) {
      if (plan.deload) continue;
      const volume = planVolume(plan);
      for (const muscle of MUSCLES) {
        const got = volume.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
        assert.equal(got.effective, effectiveSets(got.direct, got.indirect), muscle);
        assert.ok(
          got.direct >= minimumDirect(muscle) || plan.shortfall.includes(muscle),
          `${days} days, ${weekLabel(plan)}: ${muscleLabels[muscle]} gets ${got.direct} direct, floor is ${minimumDirect(muscle)}`,
        );
      }
    }
  }
});

test("the panel and the plan count the same way", () => {
  // Two definitions of "enough" in one app is how a week could meet its targets
  // and the plan behind it disagree. There is one, and both sides use it.
  const state = stateFrom(FIXTURE);
  const now = muscleVolume(state.workoutSets, AS_OF, 4);
  const planned = planVolume(buildPlan(state, AS_OF, 4));

  for (const entry of now) {
    const week = planned.get(entry.muscle) ?? { direct: 0, indirect: 0, effective: 0 };
    assert.equal(week.effective, effectiveSets(week.direct, week.indirect), entry.muscle);
    assert.equal(entry.effective, effectiveSets(entry.direct, entry.indirect), entry.muscle);
    assert.deepEqual(entry.target, weeklyTargets[entry.muscle], entry.muscle);
    // Both sides are whole sets, or a half only because a week was averaged.
    for (const value of [entry.direct, week.direct]) {
      assert.equal(Math.round(value * 10) / 10, value, `${entry.muscle}: ${value}`);
      assert.ok(value >= 0);
    }
  }
});

test("nothing comes back three times in a week", () => {
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      const times = new Map();
      for (const session of plan.sessions) {
        for (const exercise of session.exercises) {
          times.set(exercise.exercise, (times.get(exercise.exercise) ?? 0) + 1);
        }
        // Nor twice in the same session, which would just be one longer entry.
        const names = session.exercises.map((exercise) => exercise.exercise);
        assert.equal(new Set(names).size, names.length, `${session.name} lists a movement twice`);
      }
      for (const [exercise, count] of times) {
        const info = classifyExercise(exercise);
        // A lift that trains three muscle groups at once taxes the whole body,
        // and the reason to do it is the reason not to do it often.
        const cap = info.compound && info.direct.length >= 3 ? 1 : 2;
        assert.ok(count <= cap, `${days} days, ${weekLabel(plan)}: ${count}× ${exercise} (cap ${cap})`);
      }
    }
  }
});

test("every muscle is trained twice a week, not once with twice the sets", () => {
  // The same weekly volume grows more spread over two sessions than piled into
  // one, and that is not a detail a split gets to skip for the muscles nobody
  // thinks about. Rear delts, glutes and calves were being trained once a week
  // because they appeared in one session of the three-day template — a fact
  // about the template rather than about them.
  const state = stateFrom(FIXTURE);
  const owned = ownedMuscles(state);
  for (const days of DAY_CHOICES.filter((value) => value >= 3)) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      if (plan.deload) continue;
      const times = new Map();
      for (const session of plan.sessions) {
        const trained = new Set();
        for (const exercise of session.exercises) {
          for (const muscle of classifyExercise(exercise.exercise).direct) trained.add(muscle);
        }
        for (const muscle of trained) times.set(muscle, (times.get(muscle) ?? 0) + 1);
      }
      for (const muscle of owned) {
        assert.ok(
          (times.get(muscle) ?? 0) >= 2,
          `${days} days, ${weekLabel(plan)}: ${muscleLabels[muscle]} trained ${times.get(muscle) ?? 0}×`,
        );
      }
    }
  }
});

test("no block ever introduces a movement absent from Strong history", () => {
  const state = stateFrom(FIXTURE);
  const owned = new Set(state.workoutSets.map((entry) => entry.exercise));
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        for (const exercise of session.exercises) {
          assert.ok(owned.has(exercise.exercise), `${days} days: invented ${exercise.exercise}`);
        }
      }
    }
  }
  assert.ok(!owned.has("Hip Thrust (Barbell)"), "the fixture must not already own the regression movement");
  assert.ok(
    buildPlan(state, AS_OF, 4).sessions.every((session) =>
      session.exercises.every((exercise) => exercise.exercise !== "Hip Thrust (Barbell)"),
    ),
    "a hip thrust was prescribed without one in Strong",
  );
});

test("limited history stays limited instead of being supplemented with invented lifts", () => {
  // One owned chest movement may leave volume on the table, but it may not be
  // supplemented with a bench the person has never logged.
  const crossover = stateFrom(FIXTURE, {
    workoutSets: [0, 1, 2, 3].flatMap((week) =>
      Array.from({ length: 10 }, (_, index) =>
        set("Cable Crossover", {
          date: addDays(AS_OF, -week * 7),
          startedAt: `${addDays(AS_OF, -week * 7)} 18:00:00`,
          setNumber: index + 1,
        }),
      ),
    ),
  });
  const supplemented = buildPlan(crossover, AS_OF, 4, 2);
  const prescribed = supplemented.sessions.flatMap((session) => session.exercises);
  assert.ok(prescribed.length, "the one owned movement should still be usable");
  assert.ok(prescribed.every((exercise) => exercise.exercise === "Cable Crossover"));
  assert.ok(!prescribed.some((exercise) => exercise.exercise === "Bench Press (Barbell)"));

  // A missing muscle has no automatic fix choice, and an older saved payload
  // cannot smuggle an unknown movement back into the plan.
  const blank = stateFrom(FIXTURE, { workoutSets: [] });
  const emptyPlan = {
    days: 2,
    week: 0,
    deload: false,
    split: "Synthetic",
    sessions: [
      { name: "A", shape: "full", exercises: [], sets: 0 },
      { name: "B", shape: "full", exercises: [], sets: 0 },
    ],
    missing: [],
    shortfall: [],
  };
  assert.deepEqual(fixChoices(emptyPlan, blank, "chest", AS_OF), []);

  const changed = withAddedSets(
    emptyPlan,
    {
      ...blank,
      goals: {
      ...blank.goals,
      addedSets: [
          { weekStart: weekStart(AS_OF), session: "A", exercise: "Bench Press (Barbell)", sets: 5 },
        ],
      },
    },
    AS_OF,
  );
  assert.deepEqual(changed.sessions.flatMap((session) => session.exercises), []);
});

test("a block never goes backwards, at any day count", () => {
  // Volume climbs for three weeks; that is the whole shape of a mesocycle. It
  // used not to hold once the session cap started binding: what gets trimmed is
  // not perfectly monotone in what was prescribed, so a third week could come
  // out carrying less than the second.
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    const block = buildBlock(state, AS_OF, [days, days, days, days]);
    const total = (plan) => plan.sessions.reduce((sum, session) => sum + session.sets, 0);
    for (let week = 1; week < 3; week += 1) {
      assert.ok(
        total(block[week]) >= total(block[week - 1]),
        `${days} days: week ${week + 1} carries ${total(block[week])}, week ${week} carried ${total(block[week - 1])}`,
      );
    }
    assert.ok(total(block[3]) < total(block[2]), `${days} days: the easier week is not easier`);
    // And no week is ever asked for more than it can hold.
    for (const plan of block) {
      assert.ok(total(plan) <= days * maxSetsPerSession(days), `${days} days: ${total(plan)} sets`);
      for (const session of plan.sessions) {
        assert.ok(session.sets <= longestSession(days), `${days} days: ${session.name} is ${session.sets}`);
      }
    }
  }
});

test("core is trained like something that matters", () => {
  // A muscle that recovers in a day and is asked for eight sets a week gets
  // them across sessions, not in one sitting.
  assert.ok(weeklyTargets.core.min >= 8, `core floor is ${weeklyTargets.core.min}`);
  assert.ok(weeklyTargets.core.min > weeklyTargets.calves.min, "core is not a calf");
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    const plan = buildPlan(state, AS_OF, days);
    const core = plan.sessions.filter((session) =>
      session.exercises.some((exercise) => classifyExercise(exercise.exercise).direct.includes("core")),
    );
    assert.ok(core.length >= 2, `${days} days: core in ${core.length} of ${plan.sessions.length} sessions`);
    const sets = planVolume(plan).get("core")?.effective ?? 0;
    assert.ok(sets >= weeklyTargets.core.min, `${days} days: core gets ${sets}`);
  }
});

test("a session never lists the same lift twice", () => {
  // A Romanian deadlift is direct work for the hamstrings and for the glutes.
  // A lower day that asks each muscle in turn for its own movements will reach
  // for it twice, and print it twice, unless the session being built is taken
  // into account — which is how a card ended up prescribing two separate
  // Romanian deadlifts on the same day.
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        const names = session.exercises.map((exercise) => exercise.exercise);
        assert.equal(
          new Set(names).size,
          names.length,
          `${days} days, ${weekLabel(plan)}, ${session.name}: ${names.join(", ")}`,
        );
      }
    }
  }
});

test("a prescribed load is one a gym can actually be loaded to", () => {
  // Rounding to the half pound produced numbers like 156.5: arithmetic rather
  // than a prescription, since the first thing it makes you do is round it
  // yourself. Two and a half pounds is the smallest step anything here moves
  // in — a pair of 1.25s on a bar, one pin on a stack.
  const state = stateFrom(FIXTURE);
  let seen = 0;
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        for (const exercise of session.exercises) {
          // A movement carrying no external load never gets a number, and a
          // number is never a lie about one: the card reads the two apart to
          // decide between "Bodyweight" and a dash.
          assert.equal(
            exercise.bodyweight && exercise.weightLb !== null,
            false,
            `${exercise.exercise} is bodyweight and prescribes ${exercise.weightLb}`,
          );
          if (exercise.weightLb === null) continue;
          seen += 1;
          assert.equal(
            (exercise.weightLb * 10) % 25,
            0,
            `${exercise.exercise} prescribes ${exercise.weightLb}`,
          );
          assert.ok(exercise.weightLb >= 2.5, `${exercise.exercise} prescribes ${exercise.weightLb}`);
        }
      }
    }
  }
  assert.ok(seen > 20, `only ${seen} loads were checked`);
});

test("a week uses the vocabulary it has rather than repeating one lift", () => {
  // Someone who owns four chest movements should not be given the same one
  // twice while three sit unused.
  const workoutSets = [];
  for (const exercise of [
    "Bench Press (Barbell)",
    "Incline Bench Press (Dumbbell)",
    "Chest Press (Machine)",
    "Cable Crossover",
    "Bent Over Row (Barbell)",
    "Lat Pulldown (Cable)",
    "Squat (Barbell)",
    "Romanian Deadlift (Barbell)",
    "Bicep Curl (Dumbbell)",
    "Triceps Pushdown (Cable)",
    "Lateral Raise (Dumbbell)",
    "Face Pull (Cable)",
    "Standing Calf Raise (Machine)",
    "Hanging Leg Raise",
    "Hip Thrust (Barbell)",
  ]) {
    for (let index = 0; index < 6; index += 1) {
      workoutSets.push(
        set(exercise, { setNumber: (index % 3) + 1, date: index < 3 ? "2026-04-18" : "2026-04-15", reps: 8 }),
      );
    }
  }
  const state = normalizeHealthState({
    ...emptyHealthState(new Date("2026-04-18T12:00:00Z")),
    workoutSets,
  });

  const plan = buildPlan(state, AS_OF, 4);
  const chest = [];
  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      if (primaryMuscle(exercise.exercise) === "chest") chest.push(exercise.exercise);
    }
  }
  assert.ok(chest.length >= 2, `only ${chest.length} chest slots`);
  assert.equal(new Set(chest).size, chest.length, `repeated a chest movement: ${chest.join(", ")}`);
});

test("now is what is in the export, not what the calendar has done since", () => {
  // An export is a snapshot taken the day you exported it. A fortnight later,
  // four weeks counted back from today is two weeks of training and two weeks
  // of nothing — which reads as muscles that stopped and muscles never trained.
  const stale = stateFrom(FIXTURE);
  const lastDay = stale.workoutSets
    .map((entry) => entry.date)
    .reduce((latest, date) => (date > latest ? date : latest));

  const onTheDay = muscleVolume(stale.workoutSets, lastDay, 4);
  for (const gap of [7, 14, 30, 90]) {
    const later = muscleVolume(stale.workoutSets, addDays(lastDay, gap), 4);
    assert.deepEqual(
      later.map((entry) => [entry.muscle, entry.direct, entry.indirect]),
      onTheDay.map((entry) => [entry.muscle, entry.direct, entry.indirect]),
      `${gap} days after the export, the same file reads differently`,
    );
  }

  // How often you train is read off the export too, not off how long ago you
  // exported it.
  const habit = trainingHabit(stale.workoutSets, lastDay, 6);
  for (const gap of [7, 30]) {
    assert.equal(trainingHabit(stale.workoutSets, addDays(lastDay, gap), 6).daysPerWeek, habit.daysPerWeek, `${gap} days later`);
  }

  // And every muscle that has sets in the file is reported as having them.
  const trained = new Set();
  for (const entry of stale.workoutSets) {
    if (entry.date < addDays(lastDay, -27)) continue;
    for (const muscle of classifyExercise(entry.exercise).direct) trained.add(muscle);
  }
  for (const muscle of trained) {
    const shown = onTheDay.find((entry) => entry.muscle === muscle);
    assert.ok(shown.direct > 0, `${muscle} is in the export but reads as zero`);
  }
});

/* ------------------------------------------------- where the week ends up */

test("the outlook still requires direct work when indirect work reaches the floor", () => {
  const monday = weekStart(AS_OF);
  const pressed = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 10 }, (_, index) =>
      set("Bench Press (Barbell)", {
        date: monday,
        startedAt: `${monday} ${index < 5 ? "08" : "18"}:00:00`,
        setNumber: (index % 5) + 1,
      }),
    ),
  });
  const plan = {
    days: 3,
    week: 0,
    deload: false,
    split: "Synthetic",
    sessions: [
      { name: "A", shape: "full", exercises: [], sets: 0 },
      { name: "B", shape: "full", exercises: [], sets: 0 },
      { name: "C", shape: "full", exercises: [], sets: 0 },
    ],
    missing: [],
    shortfall: [],
  };

  const triceps = weekOutlook(plan, pressed, AS_OF).find((row) => row.muscle === "triceps");
  assert.equal(triceps.projected, 5, "ten indirect sets are worth five");
  assert.equal(triceps.direct, 0);
  assert.equal(triceps.status, "under", "indirect work cannot replace the direct-work floor");
  assert.equal(triceps.shortBy, minimumDirect("triceps"));
  assert.deepEqual(
    fixChoices(plan, pressed, "triceps", AS_OF),
    [],
    "the gap stays visible when Strong history has no direct triceps movement",
  );
});

test("the outlook is what is banked plus what is still coming", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  // AS_OF is a Saturday; Monday of its week is the 13th.
  const monday = "2026-04-13";

  // Nothing logged yet: every muscle's projection is the whole plan.
  const fresh = weekOutlook(plan, stateFrom(FIXTURE, { workoutSets: [] }), AS_OF);
  for (const row of fresh) {
    assert.equal(row.done, 0, `${row.muscle} has nothing banked`);
    assert.equal(row.projected, row.coming, `${row.muscle}: projected is what is coming`);
  }

  // A session of pressing logged on Monday is banked, and the sessions left in
  // the plan are what is still to come.
  const pressed = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 5 }, (_, index) =>
      set("Bench Press (Barbell)", { date: monday, startedAt: `${monday} 18:00:00`, setNumber: index + 1 }),
    ),
  });
  const after = weekOutlook(plan, pressed, AS_OF);
  const chest = after.find((row) => row.muscle === "chest");
  assert.equal(chest.done, 5, "five sets of pressing are five chest sets in the bank");
  assert.equal(chest.projected, chest.done + chest.coming);
  // And the pressing counts toward the triceps at half, against the same
  // target: rowing does build biceps, and a second target for work done as a
  // bystander is a goal nobody set.
  const triceps = after.find((row) => row.muscle === "triceps");
  assert.equal(triceps.done, 2.5, "five sets of pressing are worth half that to the triceps");
  assert.equal(triceps.indirect >= 5, true, "and the raw sets behind it are kept");
  for (const row of after) {
    assert.equal(row.done + row.coming, row.projected, `${row.muscle}: the two halves are the whole`);
    assert.equal(
      row.projected,
      Math.round((row.direct + row.indirect * 0.5) * 2) / 2,
      `${row.muscle}: direct counts once, indirect counts half`,
    );
  }

  // Doing a session takes it out of what is still to come.
  const before = weekOutlook(plan, stateFrom(FIXTURE, { workoutSets: [] }), AS_OF);
  const left = after.reduce((total, row) => total + row.coming, 0);
  const all = before.reduce((total, row) => total + row.coming, 0);
  assert.ok(left < all, `${left} still to come, was ${all}`);

  // Every projection is judged against the muscle's own fixed target, and the
  // shortfall is the larger of its total-work and direct-work gaps — the number
  // the panel puts on screen.
  for (const row of after) {
    assert.deepEqual(row.target, weeklyTargets[row.muscle]);
    const gap = Math.max(row.target.min - row.projected, minimumDirect(row.muscle) - row.direct);
    const want = gap > 0 ? "under" : row.projected > row.target.max ? "over" : "in";
    assert.equal(row.status, want, row.muscle);
    assert.equal(row.shortBy, Math.max(0, Math.round(gap * 2) / 2), row.muscle);
    assert.equal(row.shortBy > 0, row.status === "under", `${row.muscle}: short only when under`);
  }
});

test("a row opens onto the lifts behind it, and what would close a gap", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const monday = "2026-04-13";
  // A Monday of pressing, so there is something banked as well as something
  // planned — the two halves the row has to itemise.
  const pressed = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 4 }, (_, index) =>
      set("Bench Press (Barbell)", { date: monday, startedAt: `${monday} 18:00:00`, setNumber: index + 1 }),
    ),
  });

  const chest = muscleDetail(plan, pressed, "chest", AS_OF);
  const banked = chest.work.filter((item) => item.done);
  assert.equal(banked.length, 1, "one line a lift a day, not one a set");
  assert.equal(banked[0].sets, 4);
  assert.equal(banked[0].exercise, "Bench Press (Barbell)");
  assert.ok(banked[0].direct, "the chest is the point of a bench press");
  // Banked first, then what is coming — the order the bar reads in.
  assert.deepEqual(
    chest.work.map((item) => item.done),
    [...chest.work.map((item) => item.done)].sort((a, b) => Number(b) - Number(a)),
  );
  // The pressing shows up under the triceps too, marked as the passenger it is.
  const triceps = muscleDetail(plan, pressed, "triceps", AS_OF);
  const carried = triceps.work.find((item) => item.exercise === "Bench Press (Barbell)" && item.done);
  assert.ok(carried && !carried.direct, "pressing trains the triceps, but is not for them");

  // Everything named is either in the log or in a session still to come; a row
  // never itemises work that has already been done and counted.
  const names = new Set(
    remainingSessions(plan, pressed, AS_OF).flatMap((session) =>
      session.exercises.map((exercise) => exercise.exercise),
    ),
  );
  for (const item of chest.work) {
    assert.ok(item.done || names.has(item.exercise), `${item.exercise} is not in the week`);
  }

  // A row itemises; a short muscle only offers a fix when Strong history has a
  // movement that can provide it directly.
  const owned = ownedMuscles(pressed);
  for (const row of weekOutlook(plan, pressed, AS_OF)) {
    const choices = fixChoices(plan, pressed, row.muscle, AS_OF);
    assert.equal(
      choices.length > 0,
      row.status === "under" && owned.has(row.muscle),
      `${row.muscle}: ${choices.length} offered`,
    );
  }
});

test("what closes a gap is offered as a choice, not handed down", () => {
  // A week with one session left and a muscle it does not cover. The panel can
  // say the muscle is short; this has to say what to do about it.
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 3);
  const monday = "2026-04-13";
  const prior = state.workoutSets.map((entry) => ({
    ...entry,
    date: "2026-04-11",
    startedAt: "2026-04-11 18:00:00",
  }));
  const legsOnly = stateFrom(FIXTURE, {
    workoutSets: [
      ...prior,
      ...Array.from({ length: 10 }, (_, index) =>
        set("Leg Press", { date: monday, startedAt: `${monday} 18:00:00`, setNumber: index + 1 }),
      ),
    ],
  });

  const outlook = weekOutlook(plan, legsOnly, AS_OF);
  const short = outlook.filter((row) => row.status === "under");
  assert.ok(short.length, "a week of leg presses leaves something short");

  const left = remainingSessions(plan, legsOnly, AS_OF);
  const sessions = new Set(left.map((session) => session.name));
  for (const row of short) {
    const choices = fixChoices(plan, legsOnly, row.muscle, AS_OF);
    const hasOwnedMovement = ownedMuscles(legsOnly).has(row.muscle);
    if (!hasOwnedMovement) assert.deepEqual(choices, [], `${row.muscle} has no owned movement`);
    // Every one of them would do the job, so picking is a preference rather
    // than a puzzle: what closes a gap is partly a fact about the muscle and
    // partly a fact about the gym you are standing in.
    for (const fix of choices) {
      assert.ok(fix.sets > 0 && fix.sets <= 5, `${fix.exercise}: ${fix.sets} sets`);
      assert.ok(sessions.has(fix.session), `${fix.exercise} goes in ${fix.session}, which is not a session left`);
      // It trains the muscle head-on. Closing a gap with more bystander work is
      // how a muscle ends up with no direct sets at all.
      assert.ok(
        classifyExercise(fix.exercise).direct.includes(row.muscle),
        `${fix.exercise} does not train ${row.muscle} directly`,
      );
      // And it is a movement they already have — either one the week is
      // already doing or one out of their Strong log.
      const inWeek = left.some((session) =>
        session.exercises.some((exercise) => exercise.exercise === fix.exercise),
      );
      const logged = legsOnly.workoutSets.some((entry) => entry.exercise === fix.exercise);
      assert.ok(inWeek || logged, `${fix.exercise} is absent from Strong history`);
    }
    // No two entries offer the same lift in the same session.
    const keys = choices.map((fix) => `${fix.exercise}:${fix.session}`);
    assert.equal(new Set(keys).size, keys.length, keys.join(", "));
  }
});

test("a known movement is offered on a day that already trains the muscle", () => {
  // A known leg movement belongs on a day already training legs rather than
  // being squeezed into a shorter upper day.
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const nothingDone = stateFrom(FIXTURE, {
    workoutSets: state.workoutSets.map((entry) => ({ ...entry, date: "2026-04-11" })),
  });

  for (const row of weekOutlook(plan, nothingDone, AS_OF)) {
    for (const fix of fixChoices(plan, nothingDone, row.muscle, AS_OF)) {
      assert.ok(nothingDone.workoutSets.some((entry) => entry.exercise === fix.exercise));
      const session = plan.sessions.find((entry) => entry.name === fix.session);
      const here = session.exercises.some((entry) =>
        classifyExercise(entry.exercise).direct.includes(row.muscle),
      );
      if (here) continue;
      // It landed somewhere that does not train the muscle, so nowhere left
      // does — otherwise it was put in the wrong session.
      const anywhere = remainingSessions(plan, nothingDone, AS_OF).some((entry) =>
        entry.exercises.some((item) => classifyExercise(item.exercise).direct.includes(row.muscle)),
      );
      assert.equal(anywhere, false, `${fix.exercise} went to ${fix.session}, which does not train ${row.muscle}`);
    }
  }
});

test("a muscle can be moved a set at a time, in either direction", () => {
  // A week is a suggestion. Wanting a bit more chest than the middle of a range
  // is not a mistake to be protected from — what makes moving it safe is that
  // the number goes on saying what the change did.
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const monday = weekStart(AS_OF);
  const withChange = (entries) => withAddedSets(plan, { ...state, goals: { ...state.goals, addedSets: entries } }, AS_OF);
  const worth = (week, muscle) => weekOutlook(week, state, AS_OF).find((row) => row.muscle === muscle).projected;

  for (const muscle of ["chest"]) {
    // Up, from a muscle that is not short at all.
    const up = adjustChoice(plan, state, muscle, 1, AS_OF);
    assert.ok(up, `${muscle}: nowhere to add a set`);
    assert.equal(up.sets, 1);
    assert.ok(
      classifyExercise(up.exercise).direct.includes(muscle),
      `${up.exercise} does not train ${muscle} directly`,
    );
    const more = withChange([{ weekStart: monday, session: up.session, exercise: up.exercise, sets: 1 }]);
    assert.ok(worth(more, muscle) > worth(plan, muscle), `${muscle}: ${worth(plan, muscle)} → ${worth(more, muscle)}`);

    // And down, off whatever is carrying the most of it.
    const down = adjustChoice(plan, state, muscle, -1, AS_OF);
    assert.ok(down, `${muscle}: nowhere to take a set from`);
    const carrying = plan.sessions
      .find((entry) => entry.name === down.session)
      .exercises.find((entry) => entry.exercise === down.exercise);
    assert.ok(carrying, `${down.exercise} is not in ${down.session}`);
    const others = plan.sessions.flatMap((entry) =>
      entry.exercises.filter((one) => classifyExercise(one.exercise).direct.includes(muscle)),
    );
    assert.equal(carrying.sets, Math.max(...others.map((one) => one.sets)), `${muscle}: took from the wrong lift`);
    const less = withChange([{ weekStart: monday, session: down.session, exercise: down.exercise, sets: -1 }]);
    assert.ok(worth(less, muscle) < worth(plan, muscle), `${muscle}: ${worth(plan, muscle)} → ${worth(less, muscle)}`);
  }
});

test("taking a lift to nothing takes the lift with it", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const monday = weekStart(AS_OF);
  const session = plan.sessions.find((entry) => entry.exercises.some((one) => one.sets <= 3));
  const small = [...session.exercises].sort((a, b) => a.sets - b.sets)[0];

  const gone = withAddedSets(plan, {
    ...state,
    goals: {
      ...state.goals,
      addedSets: [{ weekStart: monday, session: session.name, exercise: small.exercise, sets: -small.sets }],
    },
  }, AS_OF);
  const after = gone.sessions.find((entry) => entry.name === session.name);
  assert.equal(
    after.exercises.some((entry) => entry.exercise === small.exercise),
    false,
    `${small.exercise} is still there at nothing sets`,
  );
  assert.equal(after.sets, session.sets - small.sets, "the session did not lose those sets");
  // A change of nothing is not stored, so a plus and a minus leave no trace.
  assert.deepEqual(normalizeGoals({ addedSets: [{ weekStart: monday, session: "Upper A", exercise: "X", sets: 0 }] }).addedSets, []);
});

test("a known lift you add reduces the gap", () => {
  // The point of choosing is that the choice lands: the week you are shown
  // afterwards has an owned lift in it, prescribed the way the coach prescribes
  // its own, and the gap moves in the right direction.
  const monday = weekStart(AS_OF);
  const state = stateFrom(FIXTURE, {
    workoutSets: [set("Bench Press (Barbell)", {
      date: addDays(monday, -2),
      startedAt: `${addDays(monday, -2)} 18:00:00`,
    })],
  });
  const plan = {
    days: 2,
    week: 0,
    deload: false,
    split: "Synthetic",
    sessions: [
      { name: "A", shape: "upper", exercises: [], sets: 0 },
      { name: "B", shape: "upper", exercises: [], sets: 0 },
    ],
    missing: [],
    shortfall: [],
  };
  const target = "chest";
  const choice = fixChoices(plan, state, target, AS_OF)[0];
  assert.ok(choice, "chest is short and its known bench was not offered");
  assert.equal(choice.exercise, "Bench Press (Barbell)");

  const after = withAddedSets(plan, {
    ...state,
    goals: {
      ...state.goals,
      addedSets: [
        { weekStart: monday, session: choice.session, exercise: choice.exercise, sets: choice.sets },
      ],
    },
  }, AS_OF);

  const session = after.sessions.find((entry) => entry.name === choice.session);
  const landed = session.exercises.find((entry) => entry.exercise === choice.exercise);
  assert.ok(landed, `${choice.exercise} is not in ${choice.session}`);
  assert.ok(landed.added, "what you added is marked as added");
  // Marked as yours, so there can be a way back out of it. An addition with no
  // way back is a trap rather than a feature.
  assert.ok(landed.byHand, "what you added is not marked as yours");
  const theirs = after.sessions.flatMap((entry) => entry.exercises).filter((entry) => entry.byHand);
  assert.equal(theirs.length, 1, `${theirs.length} lifts marked as added by hand`);
  for (const entry of plan.sessions.flatMap((one) => one.exercises)) {
    assert.equal(entry.byHand, false, `${entry.exercise} claims to be yours in a plan you did not touch`);
  }
  // Prescribed like anything else: a rep range, a rest, and a load off your own
  // history rather than a blank.
  assert.match(landed.repRange, /^\d+[–-]\d+$/);
  assert.ok(landed.restSeconds >= 60 && landed.restSeconds <= MAX_REST_SECONDS);
  assert.ok(landed.weightLb === null || (landed.weightLb * 10) % 25 === 0, `${landed.weightLb}`);
  assert.ok(landed.sets >= 1 && landed.sets <= 5);
  assert.ok(state.workoutSets.some((entry) => entry.exercise === landed.exercise));

  const before = weekOutlook(plan, state, AS_OF).find((row) => row.muscle === target);
  const now = weekOutlook(after, state, AS_OF).find((row) => row.muscle === target);
  assert.ok(now.projected > before.projected, `${target}: ${before.projected} → ${now.projected}`);
  if (now.status === "under") {
    assert.ok(now.shortBy < before.shortBy, `${target}: gap ${before.shortBy} → ${now.shortBy}`);
  }

  // And a week is not haunted by what you added to a different one.
  const lastWeek = withAddedSets(plan, {
    ...state,
    goals: {
      ...state.goals,
      addedSets: [
        { weekStart: addDays(monday, -7), session: choice.session, exercise: choice.exercise, sets: 3 },
      ],
    },
  }, AS_OF);
  assert.deepEqual(
    lastWeek.sessions.map((entry) => entry.sets),
    plan.sessions.map((entry) => entry.sets),
    "an addition from another week followed this one",
  );
});

test("a week that skips a muscle says so before the week is over", () => {
  // The thing a four-week average could never do: it is Wednesday, the session
  // you did left the shoulders out, and you should know now rather than on
  // Sunday.
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 3);
  const monday = "2026-04-13";
  const legsOnly = stateFrom(FIXTURE, {
    workoutSets: Array.from({ length: 12 }, (_, index) =>
      set("Leg Press", { date: monday, startedAt: `${monday} 18:00:00`, setNumber: index + 1 }),
    ),
  });

  const outlook = weekOutlook(plan, legsOnly, AS_OF);
  const quads = outlook.find((row) => row.muscle === "quads");
  assert.ok(quads.done >= 12, "the legs are in the bank");
  // Something upper-body has to come up short, because a third of the week went
  // on one movement.
  assert.ok(
    outlook.some((row) => row.status === "under"),
    "nothing is reported short after a session that trained one muscle",
  );
});

test("volume climbs by sets a week, not by a percentage of wherever you are", () => {
  // A third more of whatever you are on is a percentage pretending to be a
  // prescription: it hands someone on fifteen sets an extra five in one step
  // and someone on two an extra one. The jump is in sets, so it is the same
  // size wherever you start — except when a muscle is under its floor, where
  // reaching the floor is the point and is allowed to be a bigger step.
  const state = stateFrom(FIXTURE);
  const now = muscleVolume(state.workoutSets, AS_OF, 4);

  for (const days of DAY_CHOICES) {
    const week = planVolume(buildPlan(state, AS_OF, days));
    for (const entry of now) {
      const planned = week.get(entry.muscle)?.direct ?? 0;
      if (entry.direct < entry.target.min) continue;
      assert.ok(
        planned <= entry.direct + VOLUME_STEP + 2,
        `${days} days: ${entry.label} goes from ${entry.direct} to ${planned}`,
      );
    }
  }

  // The other direction is not an invariant and should not be asserted as one:
  // a week has a session budget, so a muscle already taking fourteen sets of it
  // can legitimately be trimmed to make room for eleven muscles' floors.
});

test("no muscle is given more than one session can use", () => {
  const state = stateFrom(FIXTURE);
  for (const days of DAY_CHOICES) {
    for (const plan of buildBlock(state, AS_OF, [days, days, days, days])) {
      for (const session of plan.sessions) {
        const perMuscle = new Map();
        for (const exercise of session.exercises) {
          for (const muscle of classifyExercise(exercise.exercise).direct) {
            perMuscle.set(muscle, (perMuscle.get(muscle) ?? 0) + exercise.sets);
          }
        }
        for (const [muscle, sets] of perMuscle) {
          // Past eight hard sets for one muscle in one session the marginal set
          // stops buying much, and the fatigue does not.
          assert.ok(sets <= 8, `${days} days, ${session.name}: ${muscle} gets ${sets} sets`);
        }
      }
    }
  }
});

test("a lift you added is in the routine you copy into Strong", () => {
  // The copy button is how a plan leaves this app, so anything you added to the
  // week has to survive the trip. A week that reads one way on screen and
  // another in Strong is worse than no week at all.
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const monday = weekStart(AS_OF);
  const session = plan.sessions[1];
  const added = state.workoutSets
    .map((entry) => entry.exercise)
    .find((exercise) => !session.exercises.some((entry) => entry.exercise === exercise));
  assert.ok(added, "every Strong movement is already in the target session");

  const after = withAddedSets(plan, {
    ...state,
    goals: { ...state.goals, addedSets: [{ weekStart: monday, session: session.name, exercise: added, sets: 2 }] },
  }, AS_OF);

  const pattern = new RegExp(added.replace(/[()]/g, "\\$&"));
  assert.match(planToText(after), pattern, "the added lift is missing from the copied week");
  const one = sessionToText(after, after.sessions.find((entry) => entry.name === session.name));
  assert.match(one, pattern, "the added lift is missing from the copied session");

  // And it lands in exactly one more place than before — a lift the plan
  // already uses elsewhere is not evidence that yours arrived.
  const count = (text) => (text.match(new RegExp(pattern.source, "g")) ?? []).length;
  assert.equal(
    count(planToText(after)),
    count(planToText(plan)) + 1,
    "the added lift did not land exactly once",
  );
  for (const entry of after.sessions) {
    if (entry.name === session.name) continue;
    const before = plan.sessions.find((one2) => one2.name === entry.name);
    assert.equal(
      count(sessionToText(after, entry)),
      count(sessionToText(plan, before)),
      `${entry.name} changed, and it should not have`,
    );
  }
});

test("what you add goes at the end of the session, not over what was planned", () => {
  const state = stateFrom(FIXTURE);
  const plan = buildPlan(state, AS_OF, 4);
  const monday = weekStart(AS_OF);
  const ownedCompounds = [...new Set(state.workoutSets.map((entry) => entry.exercise))]
    .filter((exercise) => classifyExercise(exercise).compound);
  const session = plan.sessions.find((candidate) =>
    ownedCompounds.some((exercise) => !candidate.exercises.some((entry) => entry.exercise === exercise)),
  );
  assert.ok(session, "every session already contains every owned compound");
  const before = session.exercises.map((entry) => entry.exercise);

  // A compound, which is what would have sorted itself over the planned lifts.
  const added = ownedCompounds.find((exercise) => !before.includes(exercise));
  assert.ok(added, "there is no owned compound to add to this session");

  const after = withAddedSets(plan, {
    ...state,
    goals: { ...state.goals, addedSets: [{ weekStart: monday, session: session.name, exercise: added, sets: 2 }] },
  }, AS_OF);
  const now = after.sessions.find((entry) => entry.name === session.name).exercises.map((entry) => entry.exercise);

  assert.equal(now.at(-1), added, "the addition should sit at the end of the card");
  assert.deepEqual(now.slice(0, -1), before, "and nothing the coach planned should move");
});
