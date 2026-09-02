/**
 * The one sentence Today opens with.
 *
 * Baseline's first question is "what should I do today?", and the honest answer
 * is usually short. This writes it from the record — how last night went, what
 * is still owed, what is next — as a headline and a line beneath it. Nothing
 * here is inferred beyond what the model already computed; the sentence only
 * chooses what to say first.
 */

export type BriefInput = {
  /** Last night's hours, when a night was recorded. */
  sleepHours: number | null;
  sleepGoal: number;
  /** Doses due today, how many are answered, and whether any was marked missed. */
  medsDue: number;
  medsAnswered: number;
  medsMissed: boolean;
  /** The session the coach puts next, or null when the week is done or there is no plan. */
  nextSession: { name: string; sets: number } | null;
  sessionsDone: number;
  sessionsOf: number;
  proteinG: number | null;
  proteinTarget: number | null;
  meditated: boolean;
  journaled: boolean;
  /** Usual bedtime as a clock label, when there is enough history to know it. */
  usualBedtime: string | null;
  /** True when the record has nothing in it yet. */
  empty: boolean;
};

export type Brief = {
  /** Two short clauses; the second is set in italic by the view. */
  headline: [string, string];
  detail: string;
};

function hours(value: number): string {
  const whole = Math.floor(value);
  const minutes = Math.round((value - whole) * 60);
  if (minutes === 60) return `${whole + 1}h`;
  return minutes ? `${whole}h ${String(minutes).padStart(2, "0")}m` : `${whole}h`;
}

/** Joins clauses with commas and a final "and", dropping empties. */
function sentence(parts: string[]): string {
  const kept = parts.filter(Boolean);
  if (!kept.length) return "";
  if (kept.length === 1) return kept[0];
  return `${kept.slice(0, -1).join(", ")}, and ${kept.at(-1)}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dailyBrief(input: BriefInput): Brief {
  if (input.empty) {
    return {
      headline: ["A blank page.", "Start anywhere."],
      detail: "Add a night, a dose, or a workout — or bring in your history with an import.",
    };
  }

  // First clause: the night.
  const night =
    input.sleepHours === null
      ? "No night recorded."
      : input.sleepHours >= input.sleepGoal
        ? "A full night."
        : input.sleepHours >= input.sleepGoal - 1
          ? "A near-full night."
          : "A short night.";

  // Second clause: what is still owed, in the order it matters.
  const medsOpen = input.medsDue - input.medsAnswered;
  let owed: string;
  if (medsOpen > 0) owed = medsOpen === 1 ? "One dose to answer." : `${medsOpen} doses to answer.`;
  else if (input.nextSession) owed = input.sessionsDone === 0 ? "First lift of the week." : "One lift to go.";
  else if (input.sessionsOf > 0 && input.sessionsDone >= input.sessionsOf) owed = "The week is banked.";
  else if (!input.journaled) owed = "A page unwritten.";
  else owed = "Nothing owed.";

  // The line beneath says what the clauses left out.
  const facts: string[] = [];
  if (input.sleepHours !== null) facts.push(`slept ${hours(input.sleepHours)}`);
  if (input.medsDue > 0) {
    facts.push(
      medsOpen === 0
        ? input.medsMissed
          ? "meds are logged"
          : "meds are done"
        : `${input.medsAnswered} of ${input.medsDue} meds answered`,
    );
  }
  if (input.proteinTarget !== null && input.proteinG !== null) {
    facts.push(input.proteinG >= input.proteinTarget ? "protein is at target" : `protein is ${Math.round(input.proteinTarget - input.proteinG)} g short`);
  }
  if (input.meditated) facts.push("you have meditated");
  const first = capitalise(sentence(facts));

  let second = "";
  if (input.nextSession) {
    second = `${input.nextSession.name} (${input.nextSession.sets} sets) is ready when you are.`;
  } else if (input.usualBedtime) {
    second = `Your usual bedtime is ${input.usualBedtime}.`;
  }

  return {
    headline: [night, owed],
    detail: [first ? `${first}.` : "", second].filter(Boolean).join(" "),
  };
}
