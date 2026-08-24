/**
 * Therapy preparation and the thoughts journal.
 *
 * Two problems this solves. By Thursday you cannot remember what Monday was
 * like, so the session gets spent on whatever happened that morning; and a
 * thought that felt like a fact at 11pm is much easier to argue with once it
 * is written down and dated.
 *
 * Kept out of `health-model.ts` because that file is already long, and because
 * this content is qualitative — free text you wrote — rather than the numeric
 * series the rest of the dashboard trades in.
 */

import { addDays, dateLabel, todayLocal, validIsoDate } from "./health-dates.ts";

export type TopicStatus = "open" | "discussed";
export type TopicSource = "manual" | "journal" | "thought";

export type TherapyTopic = {
  id: string;
  createdAt: string;
  date: string;
  text: string;
  /** 2 = the one thing you most want to get to. */
  priority: 0 | 2;
  status: TopicStatus;
  discussedAt: string | null;
  source: TopicSource;
  sourceId: string | null;
};

export type HomeworkItem = {
  id: string;
  text: string;
  done: boolean;
};

export type TherapySession = {
  id: string;
  date: string;
  notes: string;
  homework: HomeworkItem[];
};

export type JournalEntry = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  body: string;
  forTherapy: boolean;
};

export type ThoughtRecord = {
  id: string;
  createdAt: string;
  date: string;
  situation: string;
  thought: string;
  /** How much you believed the thought, 0–100. */
  beliefBefore: number;
  distortions: string[];
  evidenceFor: string;
  evidenceAgainst: string;
  balancedThought: string;
  beliefAfter: number;
  forTherapy: boolean;
};

/**
 * The classic cognitive distortions, each with the question that unhooks it.
 * Naming the pattern is most of the work; the question is what you do next.
 */
export const COGNITIVE_DISTORTIONS: { id: string; name: string; question: string }[] = [
  { id: "all-or-nothing", name: "All-or-nothing thinking", question: "Where does this actually sit on a 0–10 scale?" },
  { id: "overgeneralisation", name: "Overgeneralisation", question: "Is this one instance, or genuinely every time?" },
  { id: "mental-filter", name: "Mental filter", question: "What am I leaving out of the picture?" },
  { id: "discounting-positives", name: "Discounting the positive", question: "If someone else did this, would it count?" },
  { id: "mind-reading", name: "Mind reading", question: "What else could explain what they did?" },
  { id: "fortune-telling", name: "Fortune telling", question: "How often have my confident predictions been right?" },
  { id: "catastrophising", name: "Catastrophising", question: "And then what happens? And after that?" },
  { id: "emotional-reasoning", name: "Emotional reasoning", question: "What is true about this apart from how it feels?" },
  { id: "shoulds", name: "Should statements", question: "Whose rule is this, and does it help me?" },
  { id: "labelling", name: "Labelling", question: "What did I actually do, described neutrally?" },
  { id: "personalisation", name: "Personalisation and blame", question: "What share of this was actually mine?" },
  { id: "unfair-comparison", name: "Unfair comparison", question: "Am I comparing my whole day to their highlight?" },
];

const DISTORTION_IDS = new Set(COGNITIVE_DISTORTIONS.map((item) => item.id));

export function distortionName(id: string): string {
  return COGNITIVE_DISTORTIONS.find((item) => item.id === id)?.name ?? id;
}

/* ----------------------------------------------------------------- ids ---- */

let idCounter = 0;

/** Unique within a session; the timestamp keeps it unique across sessions. */
export function makeId(prefix: string, now = new Date()): string {
  idCounter += 1;
  return `${prefix}-${now.getTime().toString(36)}-${idCounter.toString(36)}`;
}

/* ------------------------------------------------------------ empties ---- */

export function emptyJournalEntry(date = todayLocal()): JournalEntry {
  return { id: makeId("journal"), createdAt: new Date().toISOString(), date, title: "", body: "", forTherapy: false };
}

export function emptyThoughtRecord(date = todayLocal()): ThoughtRecord {
  return {
    id: makeId("thought"),
    createdAt: new Date().toISOString(),
    date,
    situation: "",
    thought: "",
    beliefBefore: 80,
    distortions: [],
    evidenceFor: "",
    evidenceAgainst: "",
    balancedThought: "",
    beliefAfter: 50,
    forTherapy: false,
  };
}

export function emptySession(date = todayLocal()): TherapySession {
  return { id: makeId("session"), date, notes: "", homework: [] };
}

/* --------------------------------------------------------- normalisers ---- */

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max = 20_000): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

function isoTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function dateOf(value: unknown, fallback: string): string {
  return validIsoDate(value) ? value : fallback;
}

function percent(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(0, Math.round(number)));
}

export function normalizeTherapyTopic(value: unknown): TherapyTopic | null {
  const raw = record(value);
  const body = text(raw.text, 500);
  if (!body) return null;
  const createdAt = isoTimestamp(raw.createdAt);
  return {
    id: text(raw.id, 80) || makeId("topic"),
    createdAt,
    date: dateOf(raw.date, createdAt.slice(0, 10)),
    text: body,
    priority: raw.priority === 2 ? 2 : 0,
    status: raw.status === "discussed" ? "discussed" : "open",
    discussedAt: typeof raw.discussedAt === "string" ? isoTimestamp(raw.discussedAt) : null,
    source: raw.source === "journal" || raw.source === "thought" ? raw.source : "manual",
    sourceId: text(raw.sourceId, 80) || null,
  };
}

function normalizeHomework(value: unknown): HomeworkItem | null {
  const raw = record(value);
  const body = text(raw.text, 300);
  if (!body) return null;
  return { id: text(raw.id, 80) || makeId("hw"), text: body, done: raw.done === true };
}

export function normalizeTherapySession(value: unknown): TherapySession | null {
  const raw = record(value);
  if (!validIsoDate(raw.date)) return null;
  const homework = Array.isArray(raw.homework)
    ? raw.homework.map(normalizeHomework).filter((item): item is HomeworkItem => Boolean(item)).slice(0, 40)
    : [];
  return {
    id: text(raw.id, 80) || makeId("session"),
    date: raw.date,
    notes: text(raw.notes, 10_000),
    homework,
  };
}

export function normalizeJournalEntry(value: unknown): JournalEntry | null {
  const raw = record(value);
  const body = text(raw.body);
  if (!body) return null;
  const createdAt = isoTimestamp(raw.createdAt);
  return {
    id: text(raw.id, 80) || makeId("journal"),
    createdAt,
    date: dateOf(raw.date, createdAt.slice(0, 10)),
    title: text(raw.title, 200),
    body,
    forTherapy: raw.forTherapy === true,
  };
}

export function normalizeThoughtRecord(value: unknown): ThoughtRecord | null {
  const raw = record(value);
  const situation = text(raw.situation, 2_000);
  const thought = text(raw.thought, 2_000);
  // Both halves are what makes it a record rather than a note.
  if (!situation || !thought) return null;
  const createdAt = isoTimestamp(raw.createdAt);
  return {
    id: text(raw.id, 80) || makeId("thought"),
    createdAt,
    date: dateOf(raw.date, createdAt.slice(0, 10)),
    situation,
    thought,
    beliefBefore: percent(raw.beliefBefore, 80),
    distortions: Array.isArray(raw.distortions)
      ? [...new Set(raw.distortions.filter((id): id is string => typeof id === "string" && DISTORTION_IDS.has(id)))]
      : [],
    evidenceFor: text(raw.evidenceFor, 4_000),
    evidenceAgainst: text(raw.evidenceAgainst, 4_000),
    balancedThought: text(raw.balancedThought, 4_000),
    beliefAfter: percent(raw.beliefAfter, 50),
    forTherapy: raw.forTherapy === true,
  };
}

/* --------------------------------------------------------------- brief ---- */

export type BriefObservation = { text: string; tone: "note" | "good" | "flag" };

export type TherapyBrief = {
  from: string;
  to: string;
  topics: TherapyTopic[];
  observations: BriefObservation[];
  journal: JournalEntry[];
  thoughts: ThoughtRecord[];
  dayNotes: { date: string; note: string }[];
  lastSession: TherapySession | null;
  openHomework: HomeworkItem[];
};

/** The numbers the dashboard already holds, summarised for the session. */
export type BriefVitals = {
  sleepAverage: number | null;
  shortNights: number;
  medicationTaken: number;
  medicationLogged: number;
  moodAverage: number | null;
  anxietyAverage: number | null;
  daysLogged: number;
  days: number;
};

export function lastSessionOnOrBefore(sessions: TherapySession[], date: string): TherapySession | null {
  return [...sessions].filter((session) => session.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/**
 * Assembles everything worth having in front of you when the session starts.
 * `vitals` comes from the dashboard's own daily and sleep entries, which is
 * the whole point of these living in the health app rather than beside it.
 */
export function buildTherapyBrief(
  input: {
    topics: TherapyTopic[];
    sessions: TherapySession[];
    journal: JournalEntry[];
    thoughts: ThoughtRecord[];
    dayNotes: { date: string; note: string }[];
    vitals: BriefVitals;
  },
  from: string,
  to: string,
): TherapyBrief {
  const inWindow = (date: string) => date >= from && date <= to;
  const lastSession = lastSessionOnOrBefore(input.sessions, to);
  const openHomework = (lastSession?.homework ?? []).filter((item) => !item.done);

  return {
    from,
    to,
    topics: [...input.topics]
      .filter((topic) => topic.status === "open")
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt)),
    observations: buildObservations(input, from, to, lastSession, openHomework),
    journal: input.journal.filter((entry) => inWindow(entry.date)).sort((a, b) => b.date.localeCompare(a.date)),
    thoughts: input.thoughts.filter((entry) => inWindow(entry.date)).sort((a, b) => b.date.localeCompare(a.date)),
    dayNotes: input.dayNotes.filter((entry) => inWindow(entry.date) && entry.note.trim() !== "").sort((a, b) => b.date.localeCompare(a.date)),
    lastSession,
    openHomework,
  };
}

function buildObservations(
  input: Parameters<typeof buildTherapyBrief>[0],
  from: string,
  to: string,
  lastSession: TherapySession | null,
  openHomework: HomeworkItem[],
): BriefObservation[] {
  const out: BriefObservation[] = [];
  const add = (text: string, tone: BriefObservation["tone"] = "note") => out.push({ text, tone });
  const { vitals } = input;

  if (vitals.daysLogged === 0) {
    add("No check-ins were logged in this period, so there are no numbers to go on.", "flag");
  }

  if (vitals.medicationLogged > 0) {
    const missed = vitals.medicationLogged - vitals.medicationTaken;
    const dayWord = vitals.medicationLogged === 1 ? "day" : "days";
    if (missed > 0) {
      add(`Medication missed on ${missed} of ${vitals.medicationLogged} recorded ${dayWord}.`, "flag");
    } else {
      add(`Medication taken on all ${vitals.medicationLogged} recorded ${dayWord}.`, "good");
    }
  }

  if (vitals.sleepAverage !== null) {
    add(`Slept ${vitals.sleepAverage}h a night on average.`, vitals.sleepAverage < 6.5 ? "flag" : "note");
  }
  if (vitals.shortNights > 0) {
    add(`${vitals.shortNights} night${vitals.shortNights === 1 ? "" : "s"} under 6 hours.`, "flag");
  }
  if (vitals.moodAverage !== null) add(`Mood averaged ${vitals.moodAverage} out of 5.`, vitals.moodAverage <= 2.5 ? "flag" : "note");
  if (vitals.anxietyAverage !== null && vitals.anxietyAverage >= 3.5) {
    add(`Anxiety averaged ${vitals.anxietyAverage} out of 5 — high for the week.`, "flag");
  }

  const thoughts = input.thoughts.filter((entry) => entry.date >= from && entry.date <= to);
  if (thoughts.length > 0) {
    const tally = new Map<string, number>();
    for (const entry of thoughts) {
      for (const id of entry.distortions) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      add(`"${distortionName(top[0])}" showed up in ${top[1]} thought records — a pattern worth naming.`, "flag");
    }

    const shifted = thoughts.filter((entry) => entry.beliefBefore - entry.beliefAfter >= 20);
    if (shifted.length > 0) {
      add(`${shifted.length} of ${thoughts.length} thought record${thoughts.length === 1 ? "" : "s"} moved the belief by 20 points or more.`, "good");
    }
  }

  if (openHomework.length > 0 && lastSession) {
    add(`Homework not finished since ${dateLabel(lastSession.date)}: ${openHomework.map((item) => item.text).join("; ")}.`, "flag");
  }

  return out;
}

/** The brief as plain text, for pasting into notes or reading off a phone. */
export function therapyBriefText(brief: TherapyBrief, vitals: BriefVitals): string {
  const lines: string[] = [`Therapy notes — ${dateLabel(brief.from)} to ${dateLabel(brief.to)}`, ""];

  if (brief.lastSession) {
    lines.push(`Last session: ${dateLabel(brief.lastSession.date)}`);
    if (brief.openHomework.length > 0) {
      lines.push("Still open from last time:");
      for (const item of brief.openHomework) lines.push(`  - ${item.text}`);
    }
    lines.push("");
  }

  lines.push("TO TALK ABOUT");
  if (brief.topics.length === 0) {
    lines.push("  (nothing flagged yet this week)");
  } else {
    for (const topic of brief.topics) {
      lines.push(`  - ${topic.priority === 2 ? "** " : ""}${topic.text}`);
    }
  }
  lines.push("");

  lines.push("THE WEEK IN NUMBERS");
  if (vitals.sleepAverage !== null) lines.push(`  - Sleep: ${vitals.sleepAverage}h average, ${vitals.shortNights} night(s) under 6`);
  if (vitals.medicationLogged > 0) lines.push(`  - Medication: taken on ${vitals.medicationTaken} of ${vitals.medicationLogged} recorded days`);
  if (vitals.moodAverage !== null) lines.push(`  - Mood: ${vitals.moodAverage}/5 average`);
  if (vitals.anxietyAverage !== null) lines.push(`  - Anxiety: ${vitals.anxietyAverage}/5 average`);
  lines.push(`  - Check-ins logged: ${vitals.daysLogged} of ${vitals.days} days`);
  lines.push("");

  if (brief.observations.length > 0) {
    lines.push("PATTERNS I NOTICED");
    for (const observation of brief.observations) lines.push(`  - ${observation.text}`);
    lines.push("");
  }

  const flaggedThoughts = brief.thoughts.filter((entry) => entry.forTherapy);
  if (flaggedThoughts.length > 0) {
    lines.push("THOUGHT RECORDS I WANT TO GO THROUGH");
    for (const entry of flaggedThoughts) {
      lines.push(`  - ${dateLabel(entry.date)}: ${entry.situation}`);
      lines.push(`      thought: "${entry.thought}" (believed ${entry.beliefBefore}% -> ${entry.beliefAfter}%)`);
      if (entry.distortions.length > 0) lines.push(`      patterns: ${entry.distortions.map(distortionName).join(", ")}`);
      if (entry.balancedThought) lines.push(`      balanced view: ${entry.balancedThought}`);
    }
    lines.push("");
  }

  const flaggedJournal = brief.journal.filter((entry) => entry.forTherapy);
  if (flaggedJournal.length > 0) {
    lines.push("JOURNAL ENTRIES I FLAGGED");
    for (const entry of flaggedJournal) {
      lines.push(`  - ${dateLabel(entry.date)}${entry.title ? ` — ${entry.title}` : ""}`);
      lines.push(`      ${entry.body.replace(/\s+/g, " ").slice(0, 400)}`);
    }
    lines.push("");
  }

  if (brief.dayNotes.length > 0) {
    lines.push("NOTES FROM THE WEEK");
    for (const entry of brief.dayNotes) lines.push(`  - ${dateLabel(entry.date)}: ${entry.note.replace(/\s+/g, " ").slice(0, 300)}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** The seven days ending today, which is the window a weekly session covers. */
export function defaultBriefWindow(asOf = todayLocal()): { from: string; to: string } {
  return { from: addDays(asOf, -6), to: asOf };
}
