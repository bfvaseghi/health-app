/**
 * The journal opens on a question, not an empty box.
 *
 * "What is on your mind?" is the hardest thing to answer on the days you most
 * want a journal, and an empty textarea asks exactly that.
 *
 * Every prompt here is a writing exercise that has actually been trialled,
 * worded as close to the tested instruction as a phone screen allows — which
 * matters more than it sounds. "Three good things" without "and why did it
 * happen" is a list; the causal half is the part that was measured. Expressive
 * writing without the twenty-minute bound is rumination. So each one carries
 * its source, and the sources are honest about what was found rather than
 * promising it will work for you.
 *
 * Plainly worded on purpose. No encouragement and no exclamation marks: the
 * prompt describes the thing to write, and that is all it does.
 */

export type JournalPrompt = {
  id: string;
  /** The short name, used as the entry's title when none is given. */
  label: string;
  /** The question itself, shown above the box. */
  question: string;
  /** Sits in the empty box as an example of the shape of an answer. */
  placeholder: string;
  /** Where the exercise comes from, and what was actually measured. */
  source: string;
};

export const JOURNAL_PROMPTS: JournalPrompt[] = [
  {
    id: "three-good",
    label: "Three good things",
    question: "Three things that went well today. Next to each one, write why it happened.",
    placeholder: "1.  …because\n2.  …because\n3.  …because",
    source: "Seligman, Steen, Park & Peterson (2005). The \u201cthree good things\u201d exercise: a randomised, placebo-controlled trial that measured lower depressive symptoms and higher happiness at one and six months. The \u201cwhy\u201d is the working part, not the list.",
  },
  {
    id: "gratitude-letter",
    label: "A letter you owe",
    question: "Write to someone who was kind to you and was never properly thanked. Say what they did and what it changed.",
    placeholder: "Dear …",
    source: "Seligman et al. (2005), the gratitude visit. Produced the largest short-term rise in the same trial. You do not have to send it.",
  },
  {
    id: "best-self",
    label: "Best possible self",
    question: "Imagine that everything has gone as well as it realistically could, some years from now, after you worked for it. Describe that life.",
    placeholder: "Where you are, what a normal day looks like.",
    source: "King (2001), and replications since: writing about a \u201cbest possible self\u201d for a few sessions raised mood and optimism against a neutral-writing control.",
  },
  {
    id: "savour",
    label: "Savouring",
    question: "One good moment today, described closely — what you saw, heard and felt, and how long it lasted.",
    placeholder: "Where you were, what you noticed.",
    source: "Bryant & Veroff's savouring work: attending to a positive experience in detail, rather than passing over it, is what extends its effect.",
  },
  {
    id: "self-compassion",
    label: "As you would to a friend",
    question: "Take something you are being hard on yourself about. Write to yourself about it in the words you would use for a friend it had happened to.",
    placeholder: "What happened, then what you would say to them.",
    source: "Neff and Germer's self-compassion writing, and Leary et al. (2007): treating your own difficulty the way you would treat someone else's lowers self-criticism without lowering standards.",
  },
  {
    id: "activation",
    label: "One thing tomorrow",
    question: "One thing you will do tomorrow that usually lifts the day, however small. Write when you will do it.",
    placeholder: "The thing, and the time.",
    source: "Behavioural activation (Lewinsohn; Jacobson et al., 1996): scheduling a specific activity at a specific time is the active ingredient, and it works as well alone as inside full cognitive therapy.",
  },
  {
    id: "expressive",
    label: "Twenty minutes on a hard thing",
    question: "Set twenty minutes. Write continuously about something difficult and how you feel about it. Do not stop to tidy it.",
    placeholder: "Keep writing. Spelling does not matter.",
    source: "Pennebaker's expressive-writing paradigm (Pennebaker & Beall, 1986): 15\u201320 minutes on consecutive days. It often feels worse on the day and better over the following weeks. Skip it if you are in crisis.",
  },
  {
    id: "open",
    label: "Anything",
    question: "Anything you want to put down.",
    placeholder: "",
    source: "No protocol. Here for the days none of the others fit.",
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
