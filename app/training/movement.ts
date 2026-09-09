/**
 * What a lift asks your body to do, which is a different question from what it
 * trains. A leg curl and a Romanian deadlift are both hamstrings; only one of
 * them is a hinge. Standing at the rack the pattern is what you recognise
 * first, so it is what the row is marked with.
 */
export type Pattern =
  | "press"
  | "pull"
  | "squat"
  | "hinge"
  | "curl"
  | "extension"
  | "raise"
  | "calf"
  | "core"
  | "carry"
  | "cardio"
  | "lift";

type Rule = { test: RegExp; pattern: Pattern };

/**
 * First match wins, so the order is the specification. Anything a looser rule
 * below would swallow has to come first: a leg curl is a hinge and must be
 * caught before the rule reading "curl" as an arm, and a calf raise is its own
 * pattern and must beat the rule reading "raise" as a delt.
 */
const rules: Rule[] = [
  { test: /calf|soleus/, pattern: "calf" },
  { test: /crunch|sit.?up|knee raise|leg raise|plank|pallof|russian twist|ab wheel|hanging|wood.?chop|\bab\b/, pattern: "core" },
  { test: /leg curl|lying curl|nordic|ham curl/, pattern: "hinge" },
  {
    test: /deadlift|romanian|rdl|stiff.?leg|good morning|pull through|kettlebell swing|hip thrust|glute bridge|back extension|hyperextension|glute ham|ghr/,
    pattern: "hinge",
  },
  { test: /squat|leg press|lunge|step.?up|hack|sissy|leg extension|knee extension/, pattern: "squat" },
  { test: /lateral raise|side raise|lat raise|front raise|rear delt|reverse fly|rear fly|\bfly\b|crossover|pec deck|reverse pec|shrug/, pattern: "raise" },
  { test: /face pull|pulldown|pull.?up|chin.?up|lat pull|pullover|\brows?\b|upright row/, pattern: "pull" },
  { test: /pushdown|skull|overhead extension|triceps extension|tricep extension|kickback/, pattern: "extension" },
  { test: /curl/, pattern: "curl" },
  { test: /press|\bdips?\b|push.?up/, pattern: "press" },
  { test: /farmer|carry|wrist|forearm|grip/, pattern: "carry" },
  { test: /run|jog|treadmill|bike|cycling|elliptical|stair|rowing machine|erg|swim|walk/, pattern: "cardio" },
];

const cache = new Map<string, Pattern>();

/** The pattern a named exercise belongs to. An unrecognised name is just a lift. */
export function movementPattern(name: string): Pattern {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  // Strong marks a superset with a leading asterisk and puts the gym or the
  // machine in brackets; neither says anything about the movement.
  const cleaned = key.replace(/^\*+/, "").replace(/\(([^)]*)\)/g, " $1 ").replace(/\s+/g, " ").trim();

  let result: Pattern = "lift";
  for (const rule of rules) {
    if (rule.test.test(cleaned)) {
      result = rule.pattern;
      break;
    }
  }
  cache.set(key, result);
  return result;
}

export const patternLabels: Record<Pattern, string> = {
  press: "Press",
  pull: "Pull",
  squat: "Squat",
  hinge: "Hinge",
  curl: "Curl",
  extension: "Extension",
  raise: "Raise",
  calf: "Calf raise",
  core: "Core",
  carry: "Carry",
  cardio: "Cardio",
  lift: "Lift",
};

/** The icon key for a pattern, so a caller never has to know both names. */
export function patternIcon(name: string): string {
  return `pattern-${movementPattern(name)}`;
}
