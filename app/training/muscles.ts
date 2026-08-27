/**
 * What each exercise actually trains.
 *
 * A set counts once for the muscle the movement is built around (direct) and
 * half for a muscle that works hard but is not the point of the lift
 * (indirect) — a bench press is a chest set and half a triceps set. Halving is
 * the convention most volume guidance is written against; it is a convention,
 * not a measurement.
 *
 * Matching is on keywords rather than exact names, because Strong lets you
 * rename anything: "Crunch (437 New York Ave)" and "*Cable Row (Mid-Back)" are
 * both real entries from a real export, and both have to land somewhere.
 */

export type Muscle =
  | "chest"
  | "back"
  | "shoulders"
  | "rearDelts"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core";

export const MUSCLES: Muscle[] = [
  "chest",
  "back",
  "shoulders",
  "rearDelts",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
];

export const muscleLabels: Record<Muscle, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  rearDelts: "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
};

/** Which half of the body a muscle belongs to, for splitting a week up. */
export const muscleRegion: Record<Muscle, "push" | "pull" | "legs" | "core"> = {
  chest: "push",
  shoulders: "push",
  triceps: "push",
  back: "pull",
  rearDelts: "pull",
  biceps: "pull",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  core: "core",
};

/**
 * Weekly hard sets per muscle, counting a direct set as one and an indirect set
 * as a half.
 *
 * The commonly cited hypertrophy range is roughly ten to twenty hard sets per
 * muscle per week, wider for muscles that recover quickly and narrower for the
 * ones that do not. Published numbers disagree with each other by a good margin
 * and none of them were measured on you, so these are a starting range to
 * argue with, not a prescription.
 */
/**
 * Hard sets a week, per muscle, counting only the sets where that muscle was
 * the point of the movement.
 *
 * The bottom of each range is roughly the least that grows anything — the
 * minimum effective volume in the dose-response literature — and the top is
 * where the returns have flattened out enough that more sets mostly buy
 * fatigue. Ten to twenty hard sets a week is the band most of the evidence
 * lands on for a muscle you are trying to build; the floors here sit under it
 * because a floor is what you must clear, not what you should aim at.
 *
 * These do not move. What you can fit into two sessions is a fact about your
 * week, not about your chest, and a target that quietly shrinks when you train
 * less is a target that can never tell you anything.
 *
 * Calves sit lower on purpose. They are not less trainable — they are less of
 * what anyone comes to the gym for, and every set spent on them is a set not
 * spent on something that matters more.
 */
/**
 * Where a week should be aiming, as opposed to where it must not fall below.
 *
 * The range is a floor and a ceiling — roughly the least that grows anything
 * and the most that is worth recovering from. Neither is the target. The floor
 * is a minimum effective dose, and a programme parked on it is one that keeps
 * you where you are; the ceiling is where the returns have gone and the
 * fatigue has not. What grows is the middle, so that is what a block climbs
 * toward, arriving rather than starting there.
 */
export function weeklyAim(muscle: Muscle): number {
  const target = weeklyTargets[muscle];
  return Math.round((target.min + target.max) / 2);
}

export const weeklyTargets: Record<Muscle, { min: number; max: number }> = {
  chest: { min: 8, max: 20 },
  back: { min: 8, max: 20 },
  shoulders: { min: 6, max: 20 },
  rearDelts: { min: 4, max: 16 },
  biceps: { min: 5, max: 18 },
  triceps: { min: 5, max: 18 },
  quads: { min: 6, max: 18 },
  hamstrings: { min: 5, max: 16 },
  glutes: { min: 4, max: 16 },
  calves: { min: 4, max: 12 },
  core: { min: 8, max: 20 },
};

export type Classification = {
  direct: Muscle[];
  indirect: Muscle[];
  /** More than one joint moving: it belongs early in a session and rests longer. */
  compound: boolean;
};

type Rule = { test: RegExp; direct: Muscle[]; indirect?: Muscle[]; compound?: boolean };

/**
 * First match wins, so the order is the specification. Anything that could be
 * swallowed by a looser rule below it has to come first: "Seated Leg Curl" is a
 * hamstring movement and must be caught before the rule that reads "curl" as
 * biceps, and "Reverse Fly" must be caught before the one that reads "fly" as
 * chest.
 */
const rules: Rule[] = [
  // Shoulders — rear delts first, since they read as flies and rows otherwise.
  { test: /rear delt|reverse fly|rear fly|face pull|reverse pec/, direct: ["rearDelts"], indirect: ["back"] },
  // A lateral raise is a side-delt movement; the rear delt barely participates.
  { test: /lateral raise|side raise|lat raise/, direct: ["shoulders"] },
  { test: /front raise/, direct: ["shoulders"] },
  { test: /upright row/, direct: ["shoulders"], indirect: ["back"] },
  {
    test: /shoulder press|overhead press|military press|arnold press|push press|landmine press|behind neck press/,
    direct: ["shoulders"],
    indirect: ["triceps", "chest"],
    compound: true,
  },
  { test: /shrug/, direct: ["back"] },

  // Legs — the hinge and knee-flexion family before anything that says "curl".
  { test: /glute ham raise|ghr/, direct: ["hamstrings", "glutes"], compound: true },
  { test: /reverse nordic/, direct: ["quads"] },
  { test: /leg curl|lying curl|nordic|ham curl/, direct: ["hamstrings"] },
  {
    test: /romanian|rdl|stiff.?leg|good morning|pull through|kettlebell swing/,
    direct: ["hamstrings", "glutes"],
    indirect: ["back"],
    compound: true,
  },
  // A deadlift is one of the largest back stimuli there is; half a set understates it.
  { test: /deadlift/, direct: ["hamstrings", "glutes", "back"], indirect: ["quads"], compound: true },
  { test: /back extension|hyperextension|hip extension/, direct: ["hamstrings", "glutes"], indirect: ["back"] },
  // Adduction trains the adductors, which this eleven-muscle model does not
  // track. It must not silently satisfy the glute target just because the two
  // machine names sit beside each other.
  { test: /hip adduction/, direct: [] },
  {
    test: /hip thrust|glute bridge|glute kickback|kickback.*glute|glute.*kickback|hip abduction/,
    direct: ["glutes"],
    indirect: ["hamstrings"],
  },
  { test: /leg extension|knee extension/, direct: ["quads"] },
  // Specific calf variants must land before the generic leg-press rule.
  { test: /calf|soleus/, direct: ["calves"] },
  // The hamstring works near-isometrically in a squat pattern; it earns nothing.
  {
    test: /squat|leg press|lunge|step.?up|hack|sissy/,
    direct: ["quads"],
    indirect: ["glutes"],
    compound: true,
  },

  // Back. \brow\b, or "narrow" and "rowing machine" would both land here.
  {
    test: /pulldown|pull.?up|chin.?up|lat pull/,
    direct: ["back"],
    indirect: ["biceps", "rearDelts"],
    compound: true,
  },
  { test: /pullover/, direct: ["back"], indirect: ["chest"] },
  { test: /\brows?\b/, direct: ["back"], indirect: ["biceps", "rearDelts"], compound: true },

  // Arms before chest, so a close-grip or JM press is not read as a bench.
  { test: /close.?grip|jm press/, direct: ["triceps", "chest"], indirect: ["shoulders"], compound: true },
  { test: /bench dip|tricep dip|triceps dip/, direct: ["triceps"] },

  // Chest.
  { test: /fly|crossover|pec deck/, direct: ["chest"], indirect: ["shoulders"] },
  {
    test: /incline (bench|chest|press)|incline .*press|incline press/,
    direct: ["chest"],
    indirect: ["shoulders", "triceps"],
    compound: true,
  },
  { test: /dip/, direct: ["chest", "triceps"], indirect: ["shoulders"], compound: true },
  {
    test: /bench press|chest press|push.?up|floor press/,
    direct: ["chest"],
    indirect: ["triceps", "shoulders"],
    compound: true,
  },

  // Arms.
  { test: /pushdown|skull|triceps|tricep|kickback|overhead extension/, direct: ["triceps"] },
  // Forearm work is not biceps work — a reverse wrist curl trains the extensors —
  // and there is no forearm group here, so it deliberately counts for nothing.
  { test: /wrist|forearm|grip trainer|farmer/, direct: [] },
  { test: /curl/, direct: ["biceps"] },

  // Core.
  { test: /crunch|sit.?up|knee raise|leg raise|plank|pallof|russian twist|ab wheel|hanging|wood.?chop|\bab\b/, direct: ["core"] },
];


const unknown: Classification = { direct: [], indirect: [], compound: false };

const cache = new Map<string, Classification>();

/** What a named exercise trains. An unrecognised name classifies to nothing. */
export function classifyExercise(name: string): Classification {
  const key = name.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  // Strong marks a superset with a leading asterisk and puts the gym or the
  // machine in brackets; neither says anything about the muscle.
  const cleaned = key.replace(/^\*+/, "").replace(/\(([^)]*)\)/g, " $1 ").replace(/\s+/g, " ").trim();

  let result = unknown;
  for (const rule of rules) {
    if (rule.test.test(cleaned)) {
      result = { direct: rule.direct, indirect: rule.indirect ?? [], compound: rule.compound ?? false };
      break;
    }
  }
  cache.set(key, result);
  return result;
}

/** The muscle a movement is built around, for grouping a session by its focus. */
export function primaryMuscle(name: string): Muscle | null {
  return classifyExercise(name).direct[0] ?? null;
}
