/**
 * The journal opens on a question, not an empty box.
 *
 * "What is on your mind?" is the hardest thing to answer on the days you most
 * want a journal, and an empty textarea asks exactly that. Every prompt here
 * asks for something small and specific instead, and every one of them points
 * at what went well, what you managed, or how you would speak to someone else
 * in your position — because a record of only the bad days is a record that
 * makes bad days look like all of them.
 *
 * Plainly worded on purpose. No encouragement, no exclamation marks, and no
 * claims about what writing will do for you: the prompt describes the thing to
 * write, and that is all it does.
 */

export type JournalPrompt = {
  id: string;
  /** The short name, used as the entry's title when none is given. */
  label: string;
  /** The question itself, shown above the box. */
  question: string;
  /** Sits in the empty box as an example of the shape of an answer. */
  placeholder: string;
};

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  {
    id: "three-good",
    label: "Three good things",
    question: "Three things that went well today. For each one, why did it happen?",
    placeholder: "1.\n2.\n3.",
  },
  {
    id: "savour",
    label: "One good moment",
    question: "One good moment from today, described closely enough to bring it back.",
    placeholder: "Where you were, what you noticed, how long it lasted.",
  },
  {
    id: "managed",
    label: "What you got through",
    question: "Something difficult you got through today, however small.",
    placeholder: "What it was, and what you did about it.",
  },
  {
    id: "kindness",
    label: "As you would to a friend",
    question: "Take a hard part of today and write to yourself about it the way you would write to a friend it happened to.",
    placeholder: "What happened, then what you would say to them.",
  },
  {
    id: "helped",
    label: "What helped",
    question: "Something you did today that made the day better. How would you do it again?",
    placeholder: "The thing, and what made it possible.",
  },
  {
    id: "person",
    label: "Someone who mattered",
    question: "Someone who made a difference today, and what they did.",
    placeholder: "Who, and what happened.",
  },
  {
    id: "ahead",
    label: "Looking forward",
    question: "One thing coming up that you want to happen.",
    placeholder: "What it is, and when.",
  },
  {
    id: "open",
    label: "Anything",
    question: "Anything you want to put down.",
    placeholder: "",
  },
];

export const promptsById = new Map(JOURNAL_PROMPTS.map(prompt => [prompt.id, prompt]));

/**
 * Which prompt today gets.
 *
 * Rotated by date rather than picked at random: stable while the day lasts, so
 * it cannot change under you mid-sentence, and different tomorrow, so the
 * journal is not the same question every day. "Anything" is never the automatic
 * choice — it is there to be chosen, and offering it by default would put the
 * blank box back.
 */
export function promptForDate(date: string): JournalPrompt {
  const rotating = JOURNAL_PROMPTS.filter(prompt => prompt.id !== "open");
  const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const index = Number.isFinite(days) ? ((days % rotating.length) + rotating.length) % rotating.length : 0;
  return rotating[index];
}
