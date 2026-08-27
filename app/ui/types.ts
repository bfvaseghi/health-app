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
export type View = "today" | "sleep" | "fitness" | "mind" | "meds" | "labs" | "summary" | "data" | "more";

/** Fitness is one section with three faces rather than three sections. */
export type FitnessTab = "coach" | "progress" | "lifting" | "body";

export type Period = 14 | 30 | 90;
export type SaveStatus = "loading" | "saved" | "saving" | "local" | "error" | "demo";
export type Theme = "system" | "light" | "dark";

/** Numbers that describe the body itself. */
export type BodyMetric = "weightLb" | "bodyFatPercent" | "proteinG" | "steps";
/** Numbers a ring or watch takes while you sleep, so they sit with sleep. */
export type RecoveryMetric = "restingHeartRate" | "hrvMs";
export type DailyMetric = BodyMetric | RecoveryMetric;

export type Modal =
  | { kind: "checkin"; date: string }
  | { kind: "sleep"; date: string; source?: SleepSource }
  | { kind: "lab"; id?: string }
  | { kind: "medication"; id?: string }
  | { kind: "import" }
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
  meds: "Meds",
  labs: "Labs",
  summary: "Summary",
  data: "Data & goals",
  more: "More",
};

export const navOrder: View[] = ["today", "sleep", "fitness", "mind", "meds", "labs", "summary"];
export const mobileNavOrder: View[] = ["today", "sleep", "fitness", "mind", "more"];

export const fitnessTabs: Array<{ tab: FitnessTab; label: string }> = [
  { tab: "coach", label: "Coach" },
  { tab: "progress", label: "Progress" },
  { tab: "lifting", label: "Lifting" },
  { tab: "body", label: "Body" },
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
