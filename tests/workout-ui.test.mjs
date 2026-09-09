import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoHealthState } from "../app/demo-state.ts";
import { addDays, emptyHealthState } from "../app/health-model.ts";
import { applyImport, inspectFile } from "../app/import/index.ts";
import { currentTrainingWeek, matchedSessionsThisWeek, nextSession, sessionToText, weekOutlook, weekStart } from "../app/training/coach.ts";
import { buildProgress } from "../app/training/progress.ts";
import { MUSCLES } from "../app/training/muscles.ts";
import { FitnessView } from "../app/ui/fitness-view.tsx";
import { WorkoutPrescription } from "../app/ui/workout-prescription.tsx";
import { labelSessions } from "../app/ui/workout-labels.ts";
import { fitnessAllClosed } from "../app/ui/types.ts";

const TODAY = "2026-09-08";
const noop = () => {};
const plain = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const view = (state, rows = fitnessAllClosed, today = TODAY) => renderToStaticMarkup(createElement(FitnessView, {
  state, editableState: state, today, rows: { ...fitnessAllClosed, ...rows }, onRows: noop, open: noop,
  onAddPhoto: async () => {}, onUpdatePhoto: noop, onDeletePhoto: noop, onDeleteDay: noop, onGoals: noop, onNotice: noop,
}));

test("the shut stack answers all four questions with no tabs and no step numbers", () => {
  const state = demoHealthState(TODAY);
  const html = view(state);
  // The rejected designs, gone: a tablist, circled step numbers, and a name
  // shared by two different workouts in the same week.
  assert.doesNotMatch(html, /role="tablist"/);
  assert.doesNotMatch(html, /class="step-n"/);
  assert.doesNotMatch(html, /class="answer-headline">Full body</);
  assert.equal((html.match(/class="answer-row/g) ?? []).length, 4);
  assert.equal((html.match(/class="record-stamp/g) ?? []).length, 1);
  // Every question is answered while shut: the workout, the muscle picture and
  // the strength verdict are all on the resting screen.
  assert.match(plain(html), /NEXT UP/);
  assert.match(plain(html), /COVERAGE/);
  assert.match(plain(html), /STRENGTH/);
  // Strong has no text import, so nothing here claims it can load a routine —
  // and neither button explains itself with a line of encouragement.
  assert.match(plain(html), /Open in the gym/);
  assert.match(plain(html), /Copy as text/);
  assert.doesNotMatch(plain(html), /Copy for Strong|Paste it into Strong|Big numbers|For Notes or reading/);
  assert.match(html, /class="mini-coverage"/);
  assert.match(html, /class="week-pips"/);
  // Both pictures decode without a key you cannot see: one mark a muscle, one
  // mark a lift, each with the words that say which state is which.
  assert.equal((html.match(/class="mini-mark/g) ?? []).length, MUSCLES.length);
  assert.match(html, /class="lift-marks"/);
  assert.match(plain(html), /Filled = at or above its weekly sets/);
  assert.match(plain(html), /One mark a lift/);
  // Every contradictory or unfinished string the old section carried.
  assert.doesNotMatch(plain(html), /Nothing is behind|Two-workout base|ALL CURRENT|last updated|Copies the text to paste in/);
});

test("the column head is stated once, names the rest timer, and reaches assistive tech", () => {
  const html = view(demoHealthState(TODAY), { next: true });
  assert.equal((html.match(/class="lift-columns"/g) ?? []).length, 1);
  for (const pattern of [/Sets × reps/g, /Rest timer/g, /\bWeight\b/g]) {
    assert.equal((plain(html).match(pattern) ?? []).length, 1, `${pattern} is repeated on the rows`);
  }
  // "Rest" alone invited reading the number as how long he actually rested.
  assert.doesNotMatch(html, /<span>Rest<\/span>/);
  assert.doesNotMatch(html, /class="lift-columns"[^>]*aria-hidden/);
});

test("the empty stack draws eleven target notches and opens nothing", () => {
  const html = view(emptyHealthState(new Date(`${TODAY}T12:00:00Z`)));
  // The eleven weekly targets are worth seeing before there is any data to put
  // against them — that is when you most want to know what a week adds up to.
  assert.equal((html.match(/class="mini-mark/g) ?? []).length, MUSCLES.length);
  assert.match(plain(html), /Nothing logged yet/);
  assert.match(plain(html), /No workout yet/);
  assert.match(plain(html), /Needs your Strong export/);
  assert.match(plain(html), /Import from Strong/);
  assert.match(plain(html), /No Strong export yet/);
  // A row with nothing in it renders no button and no chevron, because an
  // empty row that opens onto an empty screen is a promise it cannot keep.
  assert.doesNotMatch(html, /class="answer-row is-empty"[^>]*>\s*<button/);
  assert.doesNotMatch(plain(html), /Start with your workout history/);
  assert.doesNotMatch(html, /class="lift-row/);
});

test("the open chart is one grid, three segments, and one arithmetic", () => {
  const state = demoHealthState(TODAY);
  const html = view(state, { coverage: true });
  const { plan } = currentTrainingWeek(state, TODAY);
  const outlook = weekOutlook(plan, state, TODAY);
  assert.equal((html.match(/class="muscle-chart-item/g) ?? []).length, MUSCLES.length);
  for (const row of outlook) {
    // The segments account for the total exactly: nothing is silently added.
    assert.equal(
      Math.round((row.done + row.comingRequired + row.comingOptional) * 2) / 2,
      Math.round(row.projected * 2) / 2,
      `${row.label} segments do not sum to the total`,
    );
    assert.ok(html.includes(`${row.label}: ${sets(row.done)} logged plus ${sets(row.coming)} planned equals ${sets(row.projected)} sets.`), row.label);
  }
  // The key to the numbers rides on the numbers, not inside a fold called
  // "How sets count" that nobody has a reason to open.
  const caption = html.indexOf("direct 1 · assist ½");
  assert.ok(caption > 0, "the set-weighting caption is missing");
  assert.ok(!/<details/.test(html.slice(0, caption)) || html.slice(0, caption).lastIndexOf("<details") < html.slice(0, caption).lastIndexOf("</details>"),
    "the caption is inside a disclosure");
  assert.match(plain(html), /0 \d+ sets/, "the axis is printed once");
  assert.doesNotMatch(html, /Two-workout base|How sets count|ALL CURRENT|>Notes</);
});

function sets(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function csv(list) {
  const cell = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Date", "Workout Name", "Duration", "Exercise Name", "Set Order", "Weight (lb)", "Reps", "Distance", "Seconds", "RPE"]];
  for (const set of list) {
    rows.push([set.startedAt.replace("T", " "), set.workoutName, "75m", set.exercise, set.setNumber, set.weightLb, set.reps, "", "", ""]);
    if (set.restSeconds !== null) rows.push([set.startedAt.replace("T", " "), set.workoutName, "75m", set.exercise, "Rest Timer", "", "", "", set.restSeconds, ""]);
  }
  return rows.map(row => row.map(cell).join(",")).join("\n");
}

test("a real Strong CSV import advances the workout, fills a pip, and carries omitted core into the visible next plan", async () => {
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
    const imported = applyImport(state, items, `${monday}T19:00:00.000Z`);
    assert.equal(JSON.stringify(state), before, "import does not mutate its source state");
    assert.deepEqual(imported.thoughtLoops, state.thoughtLoops, "workout imports preserve unrelated records");
    assert.equal(imported.importedAt, `${monday}T19:00:00.000Z`, "a workout import stamps when it happened");

    const date = addDays(monday, 3);
    const week = currentTrainingWeek(imported, date);
    const second = nextSession(week.plan, imported, date).session;
    assert.equal(second.tier, "base");
    assert.notEqual(second.name, first.name);
    const coreSets = second.exercises.filter(lift => lift.muscle === "core").reduce((sum, lift) => sum + lift.sets, 0);
    assert.equal(coreSets, 5, "the second base replaces the omitted core set");

    // Two sessions in one week never share a display name — that name ships
    // into Strong as the heading of the copied text.
    const names = labelSessions(week.plan.sessions);
    assert.equal(new Set(names.values()).size, names.size, "two workouts share a name");

    const html = view(imported, { next: true }, date);
    assert.match(plain(html), /NEXT UP/);
    assert.ok(plain(html).includes(names.get(second.name)), "the headline is the session's display name");
    // The import filled a pip: the app showing it read the record.
    assert.equal(matchedSessionsThisWeek(week.plan, imported, date).size, 1);
    assert.equal((html.match(/class="[^"]*is-done[^"]*"/g) ?? []).length >= 1, true, "no pip was filled by the import");
    assert.doesNotMatch(html, /core-divider|workout-part/);
    for (const lift of second.exercises.filter(lift => lift.muscle === "core")) {
      assert.ok(plain(html).includes(lift.exercise.replace(/\s*\([^)]+\)$/, "")), "core exercises remain in the main workout");
    }
    // The copied text carries the day, so two workouts pasted into Strong in
    // one week are not two identical headings.
    assert.match(sessionToText(week.plan, { ...second, name: names.get(second.name) }, "Thu, Sep 10"), /^.+ · copied Thu, Sep 10/);

    const graph = view(imported, { coverage: true }, date);
    assert.match(graph, /Core: 3 logged plus/);
  }
});

test("exercise directions distinguish weight, assistance, bodyweight, a stall reset and missing data", () => {
  const state = demoHealthState(TODAY);
  const exercise = nextSession(currentTrainingWeek(state, TODAY).plan, state, TODAY).session.exercises[0];
  const render = lift => plain(renderToStaticMarkup(createElement(WorkoutPrescription, { exercise: lift, showDetails: true })));
  const lift = { ...exercise, exercise: "Bench Press (Barbell)", bodyweight: false, weightLb: 105, assistanceLb: null, stalled: false,
    adjustment: { ...exercise.adjustment, action: "increase", previousLoad: 100, previousReps: [10, 10], previousRestSeconds: 120, reason: "Rep target met" } };
  assert.match(render(lift), /Last logged.*100 lb.*10 \/ 10 reps.*Next workout.*105 lb.*Up 5 lb/);
  assert.match(render(lift), /Strong timer 2:00 → next/);
  // The imported timer is Strong's setting, never a measurement of rest taken.
  assert.doesNotMatch(render(lift), /Rest was|you rested/);
  assert.match(render({ ...lift, exercise: "Assisted Pull Up", weightLb: null, assistanceLb: 0 }), /Next workout.*0 lb assist.*less help/);
  assert.match(render({ ...lift, bodyweight: true, weightLb: null, adjustment: { ...lift.adjustment, action: "keep", previousLoad: 0 } }), /Last logged.*Bodyweight.*Next workout.*Bodyweight/);

  // A planned deload after a stall used to render identically to losing
  // ground. They call for opposite responses.
  const reset = render({ ...lift, weightLb: 80, stalled: true, adjustment: { ...lift.adjustment, action: "reduce", previousLoad: 100 } });
  assert.match(reset, /Reset −20 lb/);
  assert.match(reset, /same load 3 visits/);
  assert.doesNotMatch(reset, /Down 20 lb/);
  assert.match(render({ ...lift, weightLb: 80, stalled: false, adjustment: { ...lift.adjustment, action: "reduce", previousLoad: 100 } }), /Down 20 lb/);

  const missing = render({ ...lift, weightLb: null, adjustment: { ...lift.adjustment, action: "unavailable", previousLoad: null, previousReps: [] } });
  assert.match(missing, /Load unavailable/);
  assert.match(missing, /Check Strong/);
  assert.doesNotMatch(missing, /null lb|Keep 0/);
});

test("the stamp reports how old the record is, and nothing else", () => {
  const base = demoHealthState(TODAY);
  assert.match(plain(view({ ...base, importedAt: `${TODAY}T09:00:00.000Z` })), /Imported today · \d+ workouts/);
  assert.doesNotMatch(plain(view(base)), /Up to date/);

  // A record saved before imports were stamped says so rather than borrowing a
  // date from the newest workout, which measures training, not the log.
  const legacy = plain(view({ ...base, importedAt: null }));
  assert.match(legacy, /last import not recorded/);
  assert.doesNotMatch(legacy, /Imported today/);

  // Copying a workout out is not a fault, and used to turn the stamp amber.
  assert.doesNotMatch(plain(view(base)), /To Strong|From Strong/);
  assert.doesNotMatch(view(base), /record-stamp is-waiting/);

  const stale = { ...base, workoutSets: base.workoutSets.filter(set => set.date <= addDays(TODAY, -9)) };
  assert.match(view(stale), /record-stamp is-stale/);
  assert.match(plain(view(stale)), /Last workout \d+ days ago/);
});

test("rows open independently, so a number and its working can be read together", () => {
  const html = view(demoHealthState(TODAY), { next: true, coverage: true });
  assert.match(html, /id="fitness-next-body"[^>]*role="region"/);
  assert.match(html, /id="fitness-coverage-body"[^>]*role="region"/);
  assert.doesNotMatch(html, /id="fitness-next-body"[^>]*hidden/);
  assert.doesNotMatch(html, /id="fitness-coverage-body"[^>]*hidden/);
  assert.match(html, /class="lift-row/);
  assert.match(html, /class="muscle-chart-item/);
});

test("no fold hides the key to a number above it", () => {
  const html = view(demoHealthState(TODAY), { next: true, coverage: true, strength: true, body: true });
  const summaries = [...html.matchAll(/<summary[^>]*>(.*?)<\/summary>/gs)].map(match => plain(match[1]).trim());
  assert.ok(summaries.length, "no disclosures rendered");
  for (const summary of summaries) {
    // Every fold either carries a count, so he can decide whether to open it
    // without opening it, or is a named settings drawer.
    const counted = /\(\d+\)$/.test(summary) || /·\s*\d+$/.test(summary);
    const allowed = ["Settings", "Edit body targets"].some(label => summary.includes(label));
    assert.ok(counted || allowed, `fold "${summary}" neither counts nor is a settings drawer`);
    assert.doesNotMatch(summary, /^(How|Why|Notes)/, `fold "${summary}" names nothing`);
  }
});

test("the strength counts sum to the lifts that were actually measured", () => {
  const state = demoHealthState(TODAY);
  const html = view(state, { strength: true });
  const progress = buildProgress(state, TODAY, 12);
  const match = /(\d+) up · (\d+) down · (\d+) holding/.exec(plain(html));
  assert.ok(match, "the strength subline is missing");
  const [, up, down, holding] = match.map(Number);
  assert.equal(up + down + holding, progress.lifts.length, "the counts do not add up to the measured lifts");
  // Lifts that cannot be measured are counted separately, because "not
  // measurable" is not the same claim as "not moving".
  if (progress.excluded.length) assert.match(plain(html), new RegExp(`Not measured \\(${progress.excluded.length}\\)`));
  // An estimated max is labelled as one. It used to print bare "lb" beside a
  // workout screen prescribing a different, real number for the same lift.
  if (progress.lifts.some(lift => !lift.bodyweight && !lift.assisted)) assert.match(plain(html), /est\. max \d+ lb/);
});
