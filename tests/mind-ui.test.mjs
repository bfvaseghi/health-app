import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoHealthState } from "../app/demo-state.ts";
import { addDays, emptyHealthState, medicationStatuses, mindSummary, normalizeHealthState, thoughtLoopsCsv, upsertLoopEvent } from "../app/health-model.ts";
import { TodayPractices } from "../app/ui/mind-view.tsx";
import { ThoughtLoops, ResponseForm, ruminationLoad } from "../app/ui/thought-loops.tsx";
import { MedsView } from "../app/ui/meds-view.tsx";

const today = "2026-09-08";
const noop = () => {};
const render = (component, props) => renderToStaticMarkup(createElement(component, props));
const plain = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("meditation leads with calendar-day consistency and exposes saved insights", () => {
  const state = demoHealthState(today);
  const html = render(TodayPractices, { state, today, updateDaily: noop });
  assert.equal(mindSummary(state, today, 7).meditationDays, 4);
  const main = plain(html.slice(0, html.indexOf('<details')));
  // The count is drawn as the fortnight behind it, and a short sitting draws
  // a half cell so a run of ten-minute days does not look like a run of hours.
  assert.match(main, /days meditated/);
  assert.match(html, /aria-label="Meditation, last 14 days"/);
  assert.match(main, /Insights/);
  assert.ok(main.includes(state.dailyEntries.find(entry => entry.date === today).meditationNote));
  const onlyNotes = normalizeHealthState({ ...emptyHealthState(), dailyEntries: [{ date: today, meditationNote: "An insight without minutes" }, { date: addDays(today, -1), meditationMinutes: 0 }, { date: addDays(today, 1), meditationMinutes: 10 }] });
  assert.equal(mindSummary(onlyNotes, today, 7).meditationDays, 0, "notes, zero minutes and future sessions must not inflate completion");
  assert.match(render(TodayPractices, { state: onlyNotes, today, updateDaily: noop }), /An insight without minutes/);
});

test("rumination counts what happened instead of scoring you, and never names the worry", () => {
  const state = demoHealthState(today);
  const html = render(ThoughtLoops, { state, today, onSave: noop, onDelete: noop, onEvent: noop, onDeleteEvent: noop, onNotice: noop });
  assert.match(html, /Log rumination/);
  // The headline is a count of what happened. A share of thoughts successfully
  // seen off is a grade you award yourself once the episode is already over —
  // it sat near the ceiling and could not fall, so it is gone from the panel.
  assert.match(html, /times this week|time this week/);
  assert.doesNotMatch(html, /moved on/);
  // The two facts that qualify the count, and the words that worked, promoted
  // out of the fold they used to sit in.
  assert.match(html, /Held an hour or more/);
  assert.match(html, /Going in circles/);
  assert.match(html, /What helps/);
  assert.doesNotMatch(html, /Needing to be certain|Choose the recurring worry|Recurring worry/);
  const form = render(ResponseForm, { onSave: noop, onCancel: noop });
  assert.match(form, /How long did it hold you/);
  assert.match(form, /A few minutes/);
  assert.match(form, /Most of the day/);
  assert.match(form, /Working it out/);
  // Still no free-text field for the thought itself, and no self-grading.
  assert.doesNotMatch(form, /<input|name="thought"|Recurring worry/);
  assert.doesNotMatch(form, /I moved on|Afterward/);
});

test("the rumination count leaves unanswered questions out rather than filing them as good news", () => {
  const day = (back, extra) => ({ id: `r${back}${JSON.stringify(extra)}`, loopId: "l", move: "noticed", at: `${addDays(today, -back)}T20:00`, date: addDays(today, -back), ...extra });
  // Three logs this week: one short, one long, one that answered neither.
  const events = [
    day(0, { grip: "minutes", mode: "solving" }),
    day(1, { grip: "day", mode: "circling" }),
    day(2, {}),
    // A record from before grip was asked. "Kept returning" is the same fact
    // in the older vocabulary, so it counts as held; "I stayed caught up in
    // it" is circling. A plain "I moved on" says nothing about which kind of
    // thinking it was, so it is left out of the split entirely.
    day(3, { recurrence: "often", move: "hooked" }),
    day(4, { recurrence: "once", move: "passed" }),
  ];
  const load = ruminationLoad(events, today);
  assert.equal(load.week, 5, "all five fall inside the last seven days");
  assert.equal(load.weekly.length, 8);
  assert.equal(load.weekly.at(-1).date, today);
  assert.deepEqual(load.held, { yes: 2, of: 4 }, "the log that answered nothing is not counted as short");
  assert.deepEqual(load.circling, { yes: 2, of: 3 }, "moving on is not evidence of working it out");
  assert.equal(ruminationLoad([], today), null);
});

test("recurrence survives saved-state normalization and exports without inventing legacy frequency", () => {
  const state = demoHealthState(today);
  const event = { id: "recurrence-test", loopId: state.thoughtLoops[0].id, date: today, at: `${today}T12:00`, move: "later", recurrence: "often", response: "Returned to cooking" };
  const saved = normalizeHealthState(JSON.parse(JSON.stringify(upsertLoopEvent(state, event))));
  assert.deepEqual(saved.loopEvents.find(item => item.id === event.id), event);
  assert.match(thoughtLoopsCsv(saved.thoughtLoops, [event]), /often/);
  const legacy = { ...event, recurrence: undefined };
  assert.equal(upsertLoopEvent(saved, legacy).loopEvents.find(item => item.id === event.id).recurrence, undefined);
});

test("medications show today's completion and honest scheduled-dose counts above history", () => {
  for (const asOf of [today, addDays(today, 1)]) {
    const state = demoHealthState(today);
    const html = render(MedsView, { state, today: asOf, open: noop, onDose: noop, onDeleteMedication: noop });
    const main = plain(html.slice(0, html.indexOf('<details')));
    for (const status of medicationStatuses(state, asOf, 30)) {
      assert.match(main, new RegExp(`${status.taken}\\s*/${status.due}`), `${status.medication.name} count`);
      // The count is drawn as the days it was counted from, so a run is
      // something you can see rather than something you have to trust.
      assert.ok(html.includes(`aria-label="${status.medication.name}, last 30 days"`), `${status.medication.name} strip`);
    }
    assert.match(html, /aria-label="Medication consistency period"/);
    assert.match(main, asOf === today ? /Taken today/ : /Not due today/);
    assert.doesNotMatch(main, /consecutive|Percentage|not logged\./);
  }
});

test("Today puts daily actions before its workout and sleep summaries", async () => {
  const { TodayView } = await import("../app/ui/today-view.tsx");
  const html = render(TodayView, { state: demoHealthState(today), today, go: noop, open: noop, updateDaily: noop, onDose: noop, onWriteJournal: noop, journalDraft: null });
  assert.ok(html.indexOf("Daily check-in") < html.indexOf("today-workout-title"));
  for (const label of ["Water", "Protein", "Meditation", "Journal", "Taken today", "Bedtime", "Woke up", "Open workout"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Copy workout|class="lift-summary"|Sleep trend/);
});

test("renaming a built-in urge keeps its category and earlier events", async () => {
  const { upsertHabit } = await import("../app/health-model.ts");
  const { CuttingBack } = await import("../app/ui/habit-tracker.tsx");
  const state = demoHealthState(today);
  const habit = state.habits.find(item => item.category === "masturbation");
  assert.ok(habit);
  const renamed = normalizeHealthState(upsertHabit(state, { ...habit, name: "Private track" }));
  assert.deepEqual(renamed.habitEvents, state.habitEvents);
  const html = render(CuttingBack, { state: renamed, today, category: "masturbation", onSave: noop, onDelete: noop, onEvent: noop, onDeleteEvent: noop });
  assert.match(html, /Private track/);
  assert.match(html, /urge-event-list/);
  const other = render(CuttingBack, { state: renamed, today, category: "other", onSave: noop, onDelete: noop, onEvent: noop, onDeleteEvent: noop });
  assert.doesNotMatch(other, /Private track/);
});
