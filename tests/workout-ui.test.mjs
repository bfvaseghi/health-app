import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoHealthState } from "../app/demo-state.ts";
import { addDays, emptyHealthState } from "../app/health-model.ts";
import { applyImport, inspectFile } from "../app/import/index.ts";
import { currentTrainingWeek, nextSession, weekOutlook, weekStart } from "../app/training/coach.ts";
import { MUSCLES } from "../app/training/muscles.ts";
import { FitnessView } from "../app/ui/fitness-view.tsx";
import { WorkoutPrescription } from "../app/ui/workout-prescription.tsx";

const TODAY = "2026-09-08";
const noop = () => {};
const plain = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const view = (state, tab = "coach", today = TODAY) => renderToStaticMarkup(createElement(FitnessView, {
  state, editableState: state, today, tab, onTab: noop, open: noop,
  onAddPhoto: async () => {}, onUpdatePhoto: noop, onDeletePhoto: noop, onDeleteDay: noop, onGoals: noop, onNotice: noop,
}));

test("the workout screen gives compact targets with no separate Train or History tab", () => {
  const state = demoHealthState(TODAY);
  const html = view(state);
  assert.match(html, /role="tab"[^>]*>Muscles<\/button>/);
  assert.doesNotMatch(html, /role="tab"[^>]*>History<\/button>/);
  assert.match(html, /aria-label="Next workout plan"/);
  assert.match(plain(html), /Do this next Workout 2/);
  assert.doesNotMatch(html, />Train<|Step 3/);
  assert.match(plain(html), /Copy for Strong/);
  // What to do when you finish, in one line rather than its own block.
  assert.match(plain(html), /Log it in Strong/);
  assert.doesNotMatch(html, /class="lift-evidence"/, "past evidence stays behind the exercise control");
  assert.match(plain(html), /Same as last time/);
  assert.doesNotMatch(html, /Original plan|View what you logged|Nothing else scheduled/);
  assert.doesNotMatch(html, /<option[^>]*>[^<]*Full body A/,
    "an imported match cannot be selected as fresh workout instructions");
});

test("the column head is stated once, not on every exercise row", () => {
  const state = demoHealthState(TODAY);
  const html = view(state);
  assert.equal((html.match(/class="prescription-columns"/g) ?? []).length, 1);
  // The words appear in the head and nowhere else, however many lifts there are.
  for (const pattern of [/Sets × reps/g, /\bRest\b/g]) {
    assert.equal((plain(html).match(pattern) ?? []).length, 1, `${pattern} is repeated on the rows`);
  }
});

test("Muscles shows the eleven targets before anything is imported", () => {
  // The graph used to be replaced by the workout tab's import prompt, so the
  // one screen that says what a week should add up to was unreachable until
  // you already had a history.
  const html = view(emptyHealthState(new Date(`${TODAY}T12:00:00Z`)), "muscles");
  assert.match(html, /aria-label="Weekly muscle group graph"/);
  assert.equal((html.match(/class="muscle-chart-row"/g) ?? []).length, MUSCLES.length);
  assert.match(plain(html), /Nothing imported yet/);
  assert.match(plain(html), /Import Strong export/);
  assert.doesNotMatch(plain(html), /Start with your workout history/);
});

test("Muscles immediately renders all eleven groups and distinguishes logged from planned sets", () => {
  const state = demoHealthState(TODAY);
  const html = view(state, "muscles");
  assert.match(html, /aria-label="Weekly muscle group graph"/);
  assert.ok(html.indexOf('class="muscle-chart-list"') < html.indexOf("<details"), "the graph is not in a disclosure");
  const outlook = weekOutlook(currentTrainingWeek(state, TODAY).plan, state, TODAY);
  for (const row of outlook) {
    assert.ok(html.includes(`aria-label="${row.label}: ${row.done} logged plus ${row.coming} planned equals ${row.projected} sets. Target ${row.target.min} to ${row.target.max}.`), row.label);
  }
  assert.equal((html.match(/class="muscle-chart-row"/g) ?? []).length, MUSCLES.length);
  assert.doesNotMatch(html, /core-coverage-summary/);
  assert.match(html, /Two-workout base/);
  assert.match(html, /Below target:/, "optional work must not mask a gap in the two-workout base");
  assert.doesNotMatch(html, /role="tab"[^>]*>History<\/button>/);
});

function csv(sets) {
  const cell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight (lb)", "Reps", "Distance", "Seconds", "RPE"]];
  for (const set of sets) {
    rows.push([set.startedAt.replace("T", " "), set.workoutName, "75m", set.exercise, set.setNumber, set.weightLb, set.reps, "", "", ""]);
    if (set.restSeconds !== null) rows.push([set.startedAt.replace("T", " "), set.workoutName, "75m", set.exercise, "Rest Timer", "", "", "", set.restSeconds, ""]);
  }
  return rows.map(row => row.map(cell).join(",")).join("\n");
}

test("a real Strong CSV import advances the workout and carries omitted core into the visible next plan", async () => {
  const monday = weekStart(TODAY);
  for (const visits of [2, 3, 4]) {
    let state = demoHealthState(monday);
    state.workoutSets = state.workoutSets.filter(set => set.date < monday);
    state.goals.trainingDays = [visits, visits, visits, visits];
    const before = JSON.stringify(state);
    const first = nextSession(currentTrainingWeek(state, monday).plan, state, monday).session;
    assert.equal(first.tier, "base");
    const finished = first.exercises.flatMap(lift => Array.from({ length: lift.sets - Number(lift.muscle === "core") }, (_, index) => ({
      date: monday, startedAt: `${monday}T18:00:00`, workoutName: first.name,
      exercise: lift.exercise, setNumber: index + 1, weightLb: lift.weightLb,
      reps: Number(lift.repRange.split("–")[0]), restSeconds: lift.restSeconds,
    })));
    const items = await inspectFile(new File([csv([...state.workoutSets, ...finished])], "fictional-strong.csv", { type: "text/csv" }));
    const imported = applyImport(state, items);
    assert.equal(JSON.stringify(state), before, "import does not mutate its source state");
    assert.deepEqual(imported.thoughtLoops, state.thoughtLoops, "workout imports preserve unrelated records");
    const date = addDays(monday, 3);
    const second = nextSession(currentTrainingWeek(imported, date).plan, imported, date).session;
    assert.equal(second.tier, "base");
    assert.notEqual(second.name, first.name);
    const coreSets = second.exercises.filter(lift => lift.muscle === "core").reduce((sum, lift) => sum + lift.sets, 0);
    assert.equal(coreSets, 5, "the second base replaces the omitted core set");
    const html = view(imported, "coach", date);
    assert.match(plain(html), /Do this next Workout 2/);
    assert.doesNotMatch(html, /core-divider|workout-part/);
    for (const lift of second.exercises.filter(lift => lift.muscle === "core")) {
      assert.ok(plain(html).includes(lift.exercise.replace(/\s*\([^)]+\)$/, "")), "core exercises remain in the main workout");
    }
    assert.doesNotMatch(html, /<option[^>]*>[^<]*Full body A/);
    const graph = view(imported, "muscles", date);
    assert.match(graph, /aria-label="Core: 3 logged plus/);
  }
});

test("exercise directions distinguish ordinary weight, assistance, bodyweight and missing data", () => {
  const state = demoHealthState(TODAY);
  const exercise = nextSession(currentTrainingWeek(state, TODAY).plan, state, TODAY).session.exercises[0];
  const render = lift => plain(renderToStaticMarkup(createElement(WorkoutPrescription, { exercise: lift, showDetails: true })));
  const lift = { ...exercise, exercise: "Bench Press (Barbell)", bodyweight: false, weightLb: 105, assistanceLb: null,
    adjustment: { ...exercise.adjustment, action: "increase", previousLoad: 100, previousReps: [10, 10], previousRestSeconds: 120, reason: "Rep target met" } };
  assert.match(render(lift), /Last logged.*100 lb.*10 \/ 10 reps.*Next workout.*105 lb.*Up 5 lb from last time/);
  assert.match(render(lift), /Strong timer 2:00 → next/);
  assert.doesNotMatch(render(lift), /Rest was|you rested/);
  assert.match(render({ ...lift, exercise: "Assisted Pull Up", weightLb: null, assistanceLb: 0 }), /Next workout.*0 lb assistance.*less help than last time/);
  assert.match(render({ ...lift, bodyweight: true, weightLb: null, adjustment: { ...lift.adjustment, action: "keep", previousLoad: 0 } }), /Last logged.*Bodyweight.*Next workout.*Bodyweight/);
  const missing = render({ ...lift, weightLb: null, adjustment: { ...lift.adjustment, action: "unavailable", previousLoad: null, previousReps: [] } });
  assert.match(missing, /Load unavailable/);
  assert.doesNotMatch(missing, /null lb|Keep 0/);
});

test("missing imports show an actionable first step and no invented workout", () => {
  const state = emptyHealthState(new Date(`${TODAY}T12:00:00Z`));
  const html = view(state);
  assert.match(html, /Start with your workout history/);
  assert.match(html, /Import Strong export/);
  assert.doesNotMatch(html, /class="lift-summary"/);
});


test("Fitness opens on the workout itself, with no step to complete first", () => {
  const state = demoHealthState(TODAY);
  const html = view(state, "coach", TODAY);
  // The rejected design: a numbered stepper whose first step was a settings
  // screen, and whose second step was the workout it had just previewed.
  assert.doesNotMatch(html, /aria-label="Workout steps"/);
  assert.doesNotMatch(html, /aria-current="step"/);
  assert.doesNotMatch(plain(html), /Set your week|Show my workout/);
  // The exercise instructions are on screen the moment the section opens.
  assert.match(html, /class="lift-summary"/);
  assert.match(plain(html), /Copy for Strong/);
  // The week is a line of context, and the import stays reachable from it.
  assert.match(html, /class="week-line"/);
  // The week says what you have done in words, and the screen carries only
  // the workout: muscle coverage lives on its own tab now.
  assert.match(plain(html), /You have done \d+ workouts? this week/);
  assert.doesNotMatch(plain(html), /Muscle coverage/);
});
