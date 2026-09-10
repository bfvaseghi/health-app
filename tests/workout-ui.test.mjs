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
import { GymView } from "../app/ui/gym-view.tsx";
import { loopState } from "../app/ui/loop-state.ts";
import { WorkoutPrescription } from "../app/ui/workout-prescription.tsx";
import { liftName, mainLifts } from "../app/ui/strength-row.tsx";
import { movementPattern } from "../app/training/movement.ts";
import { labelSessions } from "../app/ui/workout-labels.ts";
import { fitnessAllClosed } from "../app/ui/types.ts";

const TODAY = "2026-09-08";
const noop = () => {};
const plain = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
/** plain(), with the entities turned back into the characters a reader sees. */
const spoken = html => plain(html)
  .replaceAll("&#x27;", "'").replaceAll("&quot;", '"')
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const view = (state, rows = fitnessAllClosed, today = TODAY, tab = "training") => renderToStaticMarkup(createElement(FitnessView, {
  state, editableState: state, today, rows: { ...fitnessAllClosed, ...rows }, onRows: noop, open: noop, tab, onTab: noop,
  onAddPhoto: async () => {}, onUpdatePhoto: noop, onDeletePhoto: noop, onDeleteDay: noop, onGoals: noop, onNotice: noop,
}));
/** The Strength half of Fitness. */
const strengthTab = (state, today = TODAY) => view(state, fitnessAllClosed, today, "strength");

test("the shut stack answers every question without opening anything", () => {
  const state = demoHealthState(TODAY);
  const html = view(state);
  // Fitness has two halves — the week, and every lift with its own curve —
  // and they want different room. What was rejected was four tabs named after
  // the app's internals, each of which hid its own number until you opened it.
  // Training still answers everything while shut; that is the invariant.
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /class="step-n"/);
  assert.doesNotMatch(html, /class="answer-headline">Full body</);
  assert.equal((html.match(/class="answer-row/g) ?? []).length, 4);
  assert.equal((html.match(/class="record-card[ "]/g) ?? []).length, 1);
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
  assert.match(html, /class="lift-table"/);
  assert.match(plain(html), /Filled = at or above its weekly sets/);
  assert.match(plain(html), /Squat, hinge, press and pull/);
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
  assert.match(plain(view({ ...base, importedAt: `${TODAY}T09:00:00.000Z` })), /Imported today \d+ workouts in the record/);
  assert.doesNotMatch(plain(view(base)), /Up to date/);

  // A record saved before imports were stamped says so rather than borrowing a
  // date from the newest workout, which measures training, not the log.
  const legacy = plain(view({ ...base, importedAt: null }));
  assert.match(legacy, /Last import not recorded/);
  assert.doesNotMatch(legacy, /Imported today/);

  // Copying a workout out is not a fault, and used to turn the stamp amber.
  assert.doesNotMatch(plain(view(base)), /To Strong|From Strong/);
  assert.doesNotMatch(view(base), /record-card is-stale/);

  // Amber means the IMPORT is behind — the one thing importing would fix.
  const behind = { ...base, importedAt: `${addDays(TODAY, -12)}T09:00:00.000Z` };
  assert.match(view(behind), /record-card is-stale/);
  assert.match(plain(view(behind)), /Last import 12 days ago/);
  assert.match(plain(view(behind)), /Update from Strong/);

  // A record with no import stamp has only the workout date to go on, so an old
  // one keeps the amber and the way out of it. The one state that cannot date
  // itself must not be the calmest line on the screen.
  const unstamped = { ...base, importedAt: null, workoutSets: base.workoutSets.filter(set => set.date <= addDays(TODAY, -9)) };
  assert.match(view(unstamped), /record-card is-stale/);
  assert.match(plain(view(unstamped)), /Last import not recorded/);
  assert.match(plain(view(unstamped)), /Update from Strong/);
});

test("a rest week is not a stale record", () => {
  // Importing today an export whose last session was nine days ago leaves the
  // record perfectly current — he simply did not train. The stamp used to go
  // amber and demand an import that would have changed nothing.
  const base = demoHealthState(TODAY);
  const rested = {
    ...base,
    importedAt: `${TODAY}T09:00:00.000Z`,
    workoutSets: base.workoutSets.filter(set => set.date <= addDays(TODAY, -9)),
  };
  assert.doesNotMatch(view(rested), /record-card is-stale/);
  assert.match(plain(view(rested)), /Imported today \d+ workouts in the record/);
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
    // The rule is that he can decide whether to open a fold without opening
    // it. A trailing count does that — "Falling (3)" — and so does a summary
    // that states the thing itself: "Imported today · 19 workouts in the
    // record" tells him whether he needs the steps inside before he asks for
    // them. What is banned is a fold whose label describes nothing, which is
    // what the second assertion catches.
    const counted = /\(\d+\)$/.test(summary) || /·\s*\d+$/.test(summary) || /\b\d+\s+\w+/.test(summary);
    const allowed = ["Settings", "Edit body targets"].some(label => summary.includes(label));
    assert.ok(counted || allowed, `fold "${summary}" neither counts nor is a settings drawer`);
    assert.doesNotMatch(summary, /^(How|Why|Notes)/, `fold "${summary}" names nothing`);
  }
});

test("strength names lifts and weights, not a tally of directions", () => {
  const state = demoHealthState(TODAY);
  const html = view(state);
  const progress = buildProgress(state, TODAY, 12);
  const main = mainLifts(progress);

  // A count of how many movements are rising is a way of scoring a
  // spreadsheet. What a lifter wants is which lift, and what is on the bar.
  assert.doesNotMatch(plain(html), /\d+ up · \d+ down · \d+ holding/);
  assert.ok(main.length, "no main lifts picked");

  // One lift per pattern, so an accessory that appears in every session cannot
  // outrank the squat by being frequent.
  const patterns = main.map(lift => movementPattern(lift.exercise));
  assert.equal(new Set(patterns).size, patterns.length, `two lifts share a pattern: ${patterns.join(", ")}`);
  for (const lift of main) {
    assert.match(plain(html), new RegExp(liftName(lift.exercise).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  // Every figure on the row is a whole number: an estimated max printed to the
  // tenth of a pound claims a precision it does not have.
  const spans = [...html.matchAll(/class="lift-table-span">([^<]*)</g)].map(m => m[1]);
  assert.equal(spans.length, main.length);
  for (const span of spans) assert.doesNotMatch(span, /\d\.\d/, `${span} is printed to a decimal`);

  // The headline names one of them and says what it did.
  const headline = /class="answer-headline">([^<]*)</g;
  const headlines = [...html.matchAll(headline)].map(m => m[1]);
  assert.ok(headlines.some(text => main.some(lift => text.startsWith(liftName(lift.exercise)))),
    `no headline names a main lift: ${headlines.join(" | ")}`);
  // An estimated max is labelled as one wherever it is printed. It used to be a
  // bare "lb" beside a workout screen prescribing a different, real number for
  // the same lift.
  assert.match(plain(html), /estimated max/);

  // The lifts that cannot be measured, and why, live on the Strength tab where
  // there is room for them — "not measurable" is not the same claim as "not
  // moving", so it is never folded into the counts.
  const tab = strengthTab(state);
  if (progress.excluded.length) assert.match(plain(tab), new RegExp(`Not measured \\(${progress.excluded.length}\\)`));
});

test("the loop strip appears exactly when the record could be behind", () => {
  const base = demoHealthState(TODAY);
  const imported = `${TODAY}T09:00:00.000Z`;

  // Closed: imported today, no gym card opened since. The pips cannot be
  // behind, so neither the strip nor the caveat under them is earned.
  const closed = loopState({ ...base, importedAt: imported }, TODAY, null);
  assert.equal(closed.uncertain, false);
  assert.equal(closed.reason, "closed");
  assert.deepEqual(closed.steps.map(step => step.state), ["now", "todo", "todo"],
    "a closed loop points at the gym, not at an import you do not owe");

  // Mid-loop: he read the workout, so whatever he did is not in the record yet.
  const mid = loopState({ ...base, importedAt: imported }, TODAY, `${TODAY}T18:30:00.000Z`);
  assert.equal(mid.uncertain, true);
  assert.equal(mid.reason, "mid");
  assert.deepEqual(mid.steps.map(step => step.state), ["done", "todo", "now"],
    "mid-loop: the gym is behind you and the export is what is owed");

  // Opening the gym card before the last import is a closed loop, not an open
  // one — the import that followed is what settles it.
  const settled = loopState({ ...base, importedAt: imported }, TODAY, `${addDays(TODAY, -3)}T18:30:00.000Z`);
  assert.equal(settled.uncertain, false);

  // A visit has to be recent to count as an open loop. Without the bound, a
  // phone that opened the card once and never imported strikes step one for
  // the rest of its life and describes a workout from March.
  const ancient = loopState({ ...base, importedAt: null }, TODAY, `${addDays(TODAY, -40)}T18:30:00.000Z`);
  assert.equal(ancient.reason, "first");
  assert.equal(ancient.steps[0].state, "now");

  // Never imported, and an import old enough to doubt.
  assert.equal(loopState({ ...base, importedAt: null }, TODAY, null).reason, "first");
  assert.equal(loopState({ ...base, importedAt: `${addDays(TODAY, -12)}T09:00:00.000Z` }, TODAY, null).reason, "stale");
  assert.equal(loopState({ ...base, importedAt: `${addDays(TODAY, -3)}T09:00:00.000Z` }, TODAY, null).reason, "closed");
});

test("the week pips say what they count, and only while it could be wrong", () => {
  const base = demoHealthState(TODAY);

  // Closed loop: the steps are still on screen — they are what the section
  // does, not a warning — but the count is trustworthy, so it carries no
  // caveat, and the lit step is the gym rather than an import you do not owe.
  const quiet = plain(view({ ...base, importedAt: `${TODAY}T09:00:00.000Z` }));
  assert.match(quiet, /Import the export back here/);
  assert.doesNotMatch(quiet, /In the record up to/);
  assert.doesNotMatch(view({ ...base, importedAt: `${TODAY}T09:00:00.000Z` }), /record-card is-loud/);

  // Behind: the strip states the loop and the pips state their scope, because
  // a hollow pip and an unimported workout look identical on screen.
  const behindState = { ...base, importedAt: `${addDays(TODAY, -12)}T09:00:00.000Z` };
  const behind = plain(view(behindState));
  assert.match(view(behindState), /record-card is-stale is-loud/);
  assert.match(behind, /Open in the gym/);
  assert.match(behind, /Log the sets in Strong/);
  assert.match(behind, /Import the export back here/);
  assert.match(behind, /In the record up to \w+ \d+/);

  // A week with nothing brought across says so rather than implying no training.
  const monday = weekStart(TODAY);
  const empty = { ...base, importedAt: `${addDays(TODAY, -12)}T09:00:00.000Z`, workoutSets: base.workoutSets.filter(set => set.date < monday) };
  assert.match(plain(view(empty)), /Nothing from this week in the record yet/);
});

test("the gym card ends by handing the workout back", () => {
  const state = demoHealthState(TODAY);
  const plan = currentTrainingWeek(state, TODAY).plan;
  const session = nextSession(plan, state, TODAY).session;
  assert.ok(session, "the demo week has no next session");
  const html = renderToStaticMarkup(createElement(GymView, {
    session, label: "Legs + back", onClose: noop, onImport: noop,
  }));
  assert.match(spoken(html), /That’s the workout/);
  assert.match(spoken(html), /Export Strong Data/);
  assert.match(spoken(html), /Import from Strong/);
  // Importing twice is harmless, and saying so is what stops him hesitating.
  assert.match(spoken(html), /importing twice can’t duplicate anything/);
  // Without a way to import there is no button promising one.
  const readOnly = renderToStaticMarkup(createElement(GymView, { session, label: "Legs + back", onClose: noop }));
  assert.doesNotMatch(spoken(readOnly), /Import from Strong/);
  assert.match(spoken(readOnly), /That’s the workout/);
});

test("one loud button at a time, and it is the step you are on", () => {
  const base = demoHealthState(TODAY);
  const loud = /class="button primary"/g;

  // Loop closed: the gym is next, so the gym button is the lit one and the
  // import sits behind it as an outline.
  const before = view({ ...base, importedAt: `${TODAY}T09:00:00.000Z` });
  const beforeLoud = [...before.matchAll(loud)];
  assert.equal(beforeLoud.length, 1, "a closed loop should light exactly one button");
  assert.match(before.slice(before.search(loud)).slice(0, 200), /Open in the gym/);

  // Nothing imported at all: there is no workout to open, so the only loud
  // button on the screen is the import.
  const empty = view(emptyHealthState(new Date(`${TODAY}T12:00:00Z`)));
  assert.equal([...empty.matchAll(loud)].length, 1);
  assert.match(empty.slice(empty.search(loud)).slice(0, 200), /Import from Strong/);
});

test("the Strength tab gives every lift a card and a curve", () => {
  const state = demoHealthState(TODAY);
  const html = strengthTab(state);
  const progress = buildProgress(state, TODAY, 12);

  // Every measured lift, not a chosen four: the tab exists so that "how is
  // each of my lifts going" has somewhere to be answered in full.
  assert.equal((html.match(/class="lift-card /g) ?? []).length, progress.lifts.length);
  // One tide each, the app's own curve, so the shape means the same thing here
  // as it does on Sleep and Body.
  assert.equal((html.match(/class="tide"/g) ?? []).length, progress.lifts.length);

  const spoken_ = spoken(html);
  for (const lift of progress.lifts) {
    assert.match(spoken_, new RegExp(liftName(lift.exercise).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  // The load, in the unit you put on the bar — never a bare percent.
  assert.doesNotMatch(spoken_, /Up \d+(\.\d+)?% *$/);
  assert.match(spoken_, /\d+ → \d+ (lb|reps) over 12 weeks/);

  // Every value reaches a screen reader as a real table, not only as a shape.
  assert.equal((html.match(/<table class="visually-hidden">/g) ?? []).length, progress.lifts.length);

  // The training half is not also rendered underneath it.
  assert.match(html, /id="fitness-panel-training"[^>]*hidden/);
});

test("a record with nothing measurable says so instead of drawing an empty tab", () => {
  const html = strengthTab(emptyHealthState(new Date(`${TODAY}T12:00:00Z`)));
  assert.doesNotMatch(html, /class="lift-card /);
  assert.match(plain(html), /Nothing measurable yet/);
  assert.match(plain(html), /three sessions/);
});
