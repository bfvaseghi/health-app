import assert from "node:assert/strict";
import test from "node:test";

import {
  COGNITIVE_DISTORTIONS,
  buildTherapyBrief,
  defaultBriefWindow,
  distortionName,
  lastSessionOnOrBefore,
  makeId,
  normalizeJournalEntry,
  normalizeTherapySession,
  normalizeTherapyTopic,
  normalizeThoughtRecord,
  therapyBriefText,
} from "../app/therapy-model.ts";
import {
  buildBriefVitals,
  dayNotesInWindow,
  emptyDailyEntry,
  emptyHealthState,
  emptySleepEntry,
  normalizeHealthState,
  removeTherapyItem,
  upsertJournalEntry,
  upsertTherapyTopic,
  upsertThoughtRecord,
} from "../app/health-model.ts";

const TO = "2026-08-24";
const FROM = "2026-08-18";

/* ------------------------------------------------------------ content ---- */

test("every distortion is uniquely identified and offers a question", () => {
  const ids = new Set();
  for (const item of COGNITIVE_DISTORTIONS) {
    assert.ok(!ids.has(item.id), `duplicate id: ${item.id}`);
    ids.add(item.id);
    assert.ok(item.question.endsWith("?"), `${item.id} should offer a question`);
    assert.equal(distortionName(item.id), item.name);
  }
  assert.equal(distortionName("not-a-real-id"), "not-a-real-id", "unknown ids pass through");
});

test("generated ids are unique within a run", () => {
  const ids = new Set(Array.from({ length: 200 }, () => makeId("topic")));
  assert.equal(ids.size, 200);
});

/* -------------------------------------------------------- normalisers ---- */

test("a topic needs text and defaults the rest safely", () => {
  assert.equal(normalizeTherapyTopic({ text: "   " }), null);
  assert.equal(normalizeTherapyTopic(null), null);

  const topic = normalizeTherapyTopic({ text: "  The argument with my brother  " });
  assert.equal(topic.text, "The argument with my brother");
  assert.equal(topic.status, "open");
  assert.equal(topic.priority, 0);
  assert.equal(topic.source, "manual");
  assert.ok(topic.id.startsWith("topic-"));
  assert.match(topic.date, /^\d{4}-\d{2}-\d{2}$/);

  const starred = normalizeTherapyTopic({ text: "Sleep", priority: 2, status: "discussed", source: "journal", sourceId: "j1" });
  assert.equal(starred.priority, 2);
  assert.equal(starred.status, "discussed");
  assert.equal(starred.source, "journal");
  assert.equal(normalizeTherapyTopic({ text: "x", priority: 9, source: "hacked" }).priority, 0, "out-of-range priority falls back");
  assert.equal(normalizeTherapyTopic({ text: "x", source: "hacked" }).source, "manual");
});

test("a session needs a real date and keeps only usable homework", () => {
  assert.equal(normalizeTherapySession({ date: "not-a-date" }), null);
  const session = normalizeTherapySession({
    date: "2026-08-17",
    notes: "  Talked about work.  ",
    homework: [{ text: "Two walks", done: true }, { text: "   " }, "nonsense", { text: "Read chapter 3" }],
  });
  assert.equal(session.notes, "Talked about work.");
  assert.deepEqual(session.homework.map((item) => item.text), ["Two walks", "Read chapter 3"]);
  assert.equal(session.homework[0].done, true);
  assert.equal(session.homework[1].done, false);
});

test("a journal entry needs a body; a title is optional", () => {
  assert.equal(normalizeJournalEntry({ title: "Just a title" }), null);
  const entry = normalizeJournalEntry({ body: "Could not get started until 3pm.", forTherapy: true });
  assert.equal(entry.title, "");
  assert.equal(entry.forTherapy, true);
});

test("a thought record needs both the situation and the thought", () => {
  assert.equal(normalizeThoughtRecord({ situation: "Email" }), null);
  assert.equal(normalizeThoughtRecord({ thought: "I am about to be fired" }), null);

  const record = normalizeThoughtRecord({
    situation: "Email from my manager",
    thought: "I am about to be fired",
    beliefBefore: 300,
    beliefAfter: -20,
    distortions: ["fortune-telling", "fortune-telling", "not-a-real-distortion", 42],
  });
  assert.equal(record.beliefBefore, 100, "belief is clamped to 0–100");
  assert.equal(record.beliefAfter, 0);
  assert.deepEqual(record.distortions, ["fortune-telling"], "duplicates and unknown ids are dropped");
});

/* --------------------------------------------------------------- state ---- */

test("a version 1 record from before therapy storage still loads", () => {
  const legacy = {
    version: 1,
    updatedAt: "2026-08-01T00:00:00.000Z",
    dailyEntries: [{ date: "2026-08-20", steps: 6000 }],
    sleepEntries: [],
    labResults: [],
    goals: {},
  };
  const state = normalizeHealthState(legacy);
  assert.equal(state.version, 2);
  assert.deepEqual(state.therapyTopics, []);
  assert.deepEqual(state.journalEntries, []);
  assert.deepEqual(state.thoughtRecords, []);
  assert.equal(state.dailyEntries.length, 1, "existing data survives the upgrade");
});

test("upserting replaces by id rather than appending a duplicate", () => {
  let state = emptyHealthState();
  state = upsertTherapyTopic(state, { id: "t1", text: "First wording" });
  state = upsertTherapyTopic(state, { id: "t1", text: "Second wording", priority: 2 });
  assert.equal(state.therapyTopics.length, 1);
  assert.equal(state.therapyTopics[0].text, "Second wording");
  assert.equal(state.therapyTopics[0].priority, 2);
});

test("removing an item only touches the collection named", () => {
  let state = emptyHealthState();
  state = upsertTherapyTopic(state, { id: "t1", text: "Keep me" });
  state = upsertJournalEntry(state, { id: "j1", body: "Delete me" });
  state = removeTherapyItem(state, "journalEntries", "j1");
  assert.equal(state.journalEntries.length, 0);
  assert.equal(state.therapyTopics.length, 1);
});

test("invalid input leaves the state untouched", () => {
  const state = emptyHealthState();
  assert.equal(upsertTherapyTopic(state, { text: "" }), state);
  assert.equal(upsertThoughtRecord(state, { situation: "only half" }), state);
});

/* -------------------------------------------------------------- vitals ---- */

function stateWithWeek() {
  let state = emptyHealthState();
  const daily = [
    { date: "2026-08-20", mood: 2, anxiety: 4, medicationTaken: true, note: "Argument with my brother." },
    { date: "2026-08-21", mood: 3, anxiety: 4, medicationTaken: false, note: "" },
    { date: "2026-08-22", mood: 4, anxiety: 3, medicationTaken: true, note: "Better day." },
  ];
  const sleep = [
    { date: "2026-08-20", durationHours: 5 },
    { date: "2026-08-21", durationHours: 7 },
    { date: "2026-08-22", durationHours: 8 },
  ];
  state = {
    ...state,
    dailyEntries: daily.map((entry) => ({ ...emptyDailyEntry(entry.date), ...entry })),
    sleepEntries: sleep.map((entry) => ({ ...emptySleepEntry(entry.date), ...entry })),
  };
  return normalizeHealthState(state);
}

test("vitals summarise the dashboard's own numbers for the window", () => {
  const vitals = buildBriefVitals(stateWithWeek(), FROM, TO);
  assert.equal(vitals.days, 7);
  assert.equal(vitals.daysLogged, 3);
  assert.equal(vitals.sleepAverage, 6.7);
  assert.equal(vitals.shortNights, 1);
  assert.equal(vitals.medicationTaken, 2);
  assert.equal(vitals.medicationLogged, 3);
  assert.equal(vitals.moodAverage, 3);
  assert.equal(vitals.anxietyAverage, 3.7);
});

test("vitals stay null rather than inventing an average from nothing", () => {
  const vitals = buildBriefVitals(emptyHealthState(), FROM, TO);
  assert.equal(vitals.sleepAverage, null);
  assert.equal(vitals.moodAverage, null);
  assert.equal(vitals.medicationLogged, 0);
  assert.equal(vitals.daysLogged, 0);
});

test("day notes come back, blank ones do not", () => {
  const notes = dayNotesInWindow(stateWithWeek(), FROM, TO);
  assert.deepEqual(notes.map((entry) => entry.date), ["2026-08-22", "2026-08-20"], "newest first, blanks skipped");
});

/* --------------------------------------------------------------- brief ---- */

function briefInput(overrides = {}) {
  return {
    topics: [],
    sessions: [],
    journal: [],
    thoughts: [],
    dayNotes: [],
    vitals: buildBriefVitals(stateWithWeek(), FROM, TO),
    ...overrides,
  };
}

test("the default window is the seven days ending today", () => {
  assert.deepEqual(defaultBriefWindow(TO), { from: FROM, to: TO });
});

test("the brief lists open topics only, priority first", () => {
  const topics = [
    normalizeTherapyTopic({ id: "a", text: "Ordinary", createdAt: "2026-08-19T10:00:00.000Z" }),
    normalizeTherapyTopic({ id: "b", text: "Already covered", status: "discussed" }),
    normalizeTherapyTopic({ id: "c", text: "The important one", priority: 2, createdAt: "2026-08-21T10:00:00.000Z" }),
  ];
  const brief = buildTherapyBrief(briefInput({ topics }), FROM, TO);
  assert.deepEqual(brief.topics.map((topic) => topic.text), ["The important one", "Ordinary"]);
});

test("the brief windows journal and thought records by date", () => {
  const journal = [
    normalizeJournalEntry({ id: "in", body: "inside", date: "2026-08-20" }),
    normalizeJournalEntry({ id: "out", body: "outside", date: "2026-07-04" }),
  ];
  const brief = buildTherapyBrief(briefInput({ journal }), FROM, TO);
  assert.deepEqual(brief.journal.map((entry) => entry.body), ["inside"]);
});

test("last session is the most recent on or before the window end", () => {
  const sessions = [
    normalizeTherapySession({ id: "old", date: "2026-08-03" }),
    normalizeTherapySession({ id: "recent", date: "2026-08-17" }),
    normalizeTherapySession({ id: "future", date: "2026-09-01" }),
  ];
  assert.equal(lastSessionOnOrBefore(sessions, TO).id, "recent");
  assert.equal(lastSessionOnOrBefore(sessions, "2026-08-01"), null);
});

test("observations read the health data, not just the notes", () => {
  const brief = buildTherapyBrief(briefInput(), FROM, TO);
  const text = brief.observations.map((item) => item.text).join("\n");
  assert.match(text, /Medication missed on 1 of 3 recorded days\./);
  assert.match(text, /Slept 6\.7h a night on average/);
  assert.match(text, /1 night under 6 hours/);
  assert.match(text, /Mood averaged 3 out of 5/);
});

test("a repeated distortion is called out as a pattern", () => {
  const thoughts = ["2026-08-19", "2026-08-20", "2026-08-21"].map((date, index) =>
    normalizeThoughtRecord({ id: `r${index}`, date, situation: "s", thought: "t", distortions: ["shoulds"], beliefBefore: 90, beliefAfter: 85 }));
  const brief = buildTherapyBrief(briefInput({ thoughts }), FROM, TO);
  const text = brief.observations.map((item) => item.text).join("\n");
  assert.match(text, /"Should statements" showed up in 3 thought records/);
});

test("a thought record that shifted the belief is credited", () => {
  const thoughts = [normalizeThoughtRecord({ id: "r", date: "2026-08-20", situation: "s", thought: "t", beliefBefore: 90, beliefAfter: 30 })];
  const brief = buildTherapyBrief(briefInput({ thoughts }), FROM, TO);
  const shift = brief.observations.find((item) => item.text.includes("moved the belief"));
  assert.ok(shift, "the shift is reported");
  assert.equal(shift.tone, "good");
});

test("unfinished homework from the last session is chased, finished homework is not", () => {
  const sessions = [normalizeTherapySession({
    id: "s", date: "2026-08-17",
    homework: [{ text: "Two walks before Friday" }, { text: "Read chapter 3", done: true }],
  })];
  const brief = buildTherapyBrief(briefInput({ sessions }), FROM, TO);
  assert.deepEqual(brief.openHomework.map((item) => item.text), ["Two walks before Friday"]);
  const text = brief.observations.map((item) => item.text).join("\n");
  assert.match(text, /Two walks before Friday/);
  assert.doesNotMatch(text, /Read chapter 3/);
});

test("the brief renders as text you could read out loud", () => {
  const input = briefInput({
    topics: [normalizeTherapyTopic({ id: "t", text: "Work stress", priority: 2 })],
    thoughts: [normalizeThoughtRecord({
      id: "r", date: "2026-08-20", situation: "Email from my manager",
      thought: "I am about to be fired", beliefBefore: 85, beliefAfter: 30,
      balancedThought: "It was a scheduling question", distortions: ["fortune-telling"], forTherapy: true,
    })],
    dayNotes: dayNotesInWindow(stateWithWeek(), FROM, TO),
  });
  const text = therapyBriefText(buildTherapyBrief(input, FROM, TO), input.vitals);

  assert.match(text, /^Therapy notes — Aug 18 to Aug 24/);
  assert.match(text, /\*\* Work stress/);
  assert.match(text, /Sleep: 6\.7h average, 1 night\(s\) under 6/);
  assert.match(text, /Medication: taken on 2 of 3 recorded days/);
  assert.match(text, /believed 85% -> 30%/);
  assert.match(text, /patterns: Fortune telling/);
  assert.match(text, /Argument with my brother\./);
});

test("an empty brief still produces usable text", () => {
  const input = briefInput({ vitals: buildBriefVitals(emptyHealthState(), FROM, TO) });
  const text = therapyBriefText(buildTherapyBrief(input, FROM, TO), input.vitals);
  assert.match(text, /\(nothing flagged yet this week\)/);
  assert.match(text, /Check-ins logged: 0 of 7 days/);
});

test("medication wording stays grammatical for a single recorded day", () => {
  let state = emptyHealthState();
  state = normalizeHealthState({
    ...state,
    dailyEntries: [{ ...emptyDailyEntry("2026-08-20"), medicationTaken: false }],
  });
  const vitals = buildBriefVitals(state, FROM, TO);
  const missed = buildTherapyBrief(briefInput({ vitals }), FROM, TO).observations.map((item) => item.text).join("\n");
  assert.match(missed, /Medication missed on 1 of 1 recorded day\./);

  let taken = normalizeHealthState({ ...emptyHealthState(), dailyEntries: [{ ...emptyDailyEntry("2026-08-20"), medicationTaken: true }] });
  const takenText = buildTherapyBrief(briefInput({ vitals: buildBriefVitals(taken, FROM, TO) }), FROM, TO)
    .observations.map((item) => item.text).join("\n");
  assert.match(takenText, /Medication taken on all 1 recorded day\./);
});
