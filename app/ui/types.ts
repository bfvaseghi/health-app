import type { SleepSource } from "../health-model";

/**
 * One section per question the dashboard answers:
 *
 *   Today    what do I log now, and how was last night?
 *   Sleep    how am I sleeping, and how is my body recovering?
 *   Fitness  how is my training going, and how is my body changing?
 *   Mind     meditation, journaling, what to raise in therapy
 *   Labs     bloodwork over time
 *   Summary  the page I bring to an appointment
 *
 * Anything that is settings rather than a record lives behind the gear.
 */
export type View = "today" | "sleep" | "fitness" | "mind" | "meds" | "labs" | "summary" | "data" | "more" | "compare" | "urges";

/**
 * The tabs are the loop, in order, numbered.
 *
 * Bring your Strong record in, read what to do, check nothing has been missed,
 * see whether it is working. Naming them after subjects — Plan, Muscles,
 * Strength, Body — told you what each page contained but never what to do with
 * the app. Numbering them says it without a paragraph.
 */
export type FitnessTab = "import" | "workout" | "coverage" | "progress";

export type Period = 14 | 30 | 90;
export type SaveStatus = "loading" | "saved" | "saving" | "local" | "error" | "demo";
export type Theme = "system" | "light" | "dark";

/** Numbers that describe the body itself. */
export type BodyMetric = "weightLb" | "bodyFatPercent" | "proteinG" | "steps";
/** Numbers a ring or watch takes while you sleep, so they sit with sleep. */
export type RecoveryMetric = "restingHeartRate" | "hrvMs";
export type DailyMetric = BodyMetric | RecoveryMetric;

export type Modal =
  | { kind: "record"; date: string }
  | { kind: "checkin"; date: string; returnToRecord?: boolean }
  | { kind: "sleep"; date: string; source?: SleepSource; returnToRecord?: boolean }
  | { kind: "lab"; id?: string }
  | { kind: "medication"; id?: string }
  | { kind: "import"; source?: "strong" }
  | { kind: "shortcuts" }
  | null;

export type Toast = {
  message: string;
  action?: { label: string; run: () => void };
};

export const viewLabels: Record<View, string> = {
  today: "Today",
  sleep: "Sleep",
  fitness: "Fitness",
  mind: "Mind",
  urges: "Urges",
  meds: "Meds",
  labs: "Labs",
  summary: "Summary",
  data: "Data & goals",
  more: "More",
  compare: "Compare",
};

export const navOrder: View[] = ["today", "sleep", "fitness", "mind", "urges", "meds", "labs", "summary", "compare"];
// Urges is a top-level section, so it is in the bar on a phone too. Reaching a
// section you log against several times a day through a "More" menu makes it
// a sub-page of somewhere else, which is what it stopped being.
export const mobileNavOrder: View[] = ["today", "sleep", "fitness", "mind", "urges", "meds", "more"];

export const fitnessTabs: Array<{ tab: FitnessTab; step: number; label: string }> = [
  { tab: "import", step: 1, label: "Import" },
  { tab: "workout", step: 2, label: "Workout" },
  { tab: "coverage", step: 3, label: "Coverage" },
  { tab: "progress", step: 4, label: "Progress" },
];

export const bodyMetrics: Array<{ metric: BodyMetric; label: string; unit: string }> = [
  { metric: "weightLb", label: "Weight", unit: "lb" },
  { metric: "bodyFatPercent", label: "Body fat", unit: "%" },
  { metric: "proteinG", label: "Protein", unit: "g" },
  { metric: "steps", label: "Steps", unit: "" },
];

export const recoveryMetrics: Array<{ metric: RecoveryMetric; label: string; unit: string }> = [
  { metric: "restingHeartRate", label: "Resting heart rate", unit: "bpm" },
  { metric: "hrvMs", label: "HRV", unit: "ms" },
];

export type MindTab = "journal" | "thoughts" | "therapy" | "meditation";
