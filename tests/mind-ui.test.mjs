import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoHealthState } from "../app/demo-state.ts";
import { addDays, emptyHealthState, medicationStatuses, mindSummary, normalizeHealthState, thoughtLoopsCsv, upsertLoopEvent } from "../app/health-model.ts";
import { TodayPractices } from "../app/ui/mind-view.tsx";
import { ThoughtLoops, ResponseForm } from "../app/ui/thought-loops.tsx";
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
  assert.match(main, /Done today/);
  assert.match(main, /4 out of 7/);
  assert.match(main, /Insights/);
  assert.ok(main.includes(state.dailyEntries.find(entry => entry.date === today).meditationNote));
  const onlyNotes = normalizeHealthState({ ...emptyHealthState(), dailyEntries: [{ date: today, meditationNote: "An insight without minutes" }, { date: addDays(today, -1), meditationMinutes: 0 }, { date: addDays(today, 1), meditationMinutes: 10 }] });
  assert.equal(mindSummary(onlyNotes, today, 7).meditationDays, 0, "notes, zero minutes and future sessions must not inflate completion");
  assert.match(render(TodayPractices, { state: onlyNotes, today, updateDaily: noop }), /An insight without minutes/);
});

test("rumination uses recurrence and responses without requiring or displaying worry titles", () => {
  const state = demoHealthState(today);
  const html = render(ThoughtLoops, { state, today, onSave: noop, onDelete: noop, onEvent: noop, onDeleteEvent: noop, onNotice: noop });
  assert.match(html, /Log rumination/);
  assert.match(html, /with a rumination log/);
  assert.doesNotMatch(html, /Needing to be certain|Choose the recurring worry|Recurring worry/);
  const form = render(ResponseForm, { onSave: noop, onCancel: noop });
  assert.match(form, /Just once/);
  assert.match(form, /A few times/);
  assert.match(form, /Kept returning/);
  assert.doesNotMatch(form, /<input|name="thought"|Recurring worry/);
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
      assert.ok(main.includes(`${status.taken} out of ${status.due}`));
    }
    assert.match(main, /last 30 days/);
    assert.match(html, /aria-label="Medication consistency period"/);
    assert.match(main, asOf === today ? /Taken today/ : /Not due today/);
    assert.doesNotMatch(main, /consecutive|Percentage|not logged\./);
  }
});

test("Today puts daily actions before its workout and sleep summaries", async () => {
  const { TodayView } = await import("../app/ui/today-view.tsx");
  const html = render(TodayView, { state: demoHealthState(today), today, go: noop, open: noop, demo: true, updateDaily: noop, onDose: noop, onWriteJournal: noop, journalDraft: null });
  assert.ok(html.indexOf("Daily check-in") < html.indexOf("today-workout-title"));
  for (const label of ["Water", "Protein", "Meditation", "Journal", "Taken today", "Bedtime", "Woke up", "Plan my workout"]) assert.ok(html.includes(label), label);
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
