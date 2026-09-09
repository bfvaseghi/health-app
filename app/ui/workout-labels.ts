import type { PlannedSession } from "../training/coach";
import { classifyExercise } from "../training/muscles";
import type { Muscle } from "../training/muscles";

/**
 * What to call a workout, standing in a gym.
 *
 * "Workout 4" and "Full body A" were the planner's names for its own slots.
 * They said nothing about what you were about to do. A workout's name should
 * be what it trains, and that is already in the exercises it contains — so it
 * is read off them rather than assigned.
 */

/** Plain words for the body, in the order people say them. */
const AREAS: Array<{ area: string; muscles: Muscle[] }> = [
  { area: "chest", muscles: ["chest"] },
  { area: "back", muscles: ["back", "rearDelts"] },
  { area: "shoulders", muscles: ["shoulders"] },
  { area: "arms", muscles: ["biceps", "triceps"] },
  { area: "legs", muscles: ["quads", "hamstrings", "glutes", "calves"] },
  { area: "core", muscles: ["core"] },
];

/** The areas a session trains directly, in body order. */
export function sessionAreas(session: PlannedSession): string[] {
  const trained = new Set<Muscle>();
  for (const exercise of session.exercises) {
    for (const muscle of classifyExercise(exercise.exercise).direct) trained.add(muscle);
  }
  return AREAS.filter((entry) => entry.muscles.some((muscle) => trained.has(muscle))).map((entry) => entry.area);
}

/**
 * The name. A session that reaches the whole body is called that, because
 * listing six areas is not a name. Anything narrower is named by what it is.
 */
export function workoutLabel(session: PlannedSession): string {
  const areas = sessionAreas(session);
  const whole = areas.filter((area) => area !== "core");
  if (whole.length >= 4) return "Full body";
  if (!areas.length) return "Workout";
  if (areas.length === 1) return capitalise(areas[0]);
  return capitalise(`${areas.slice(0, -1).join(", ")} and ${areas[areas.length - 1]}`);
}

/**
 * Whether skipping it leaves a gap. The only question anyone actually asks of
 * a workout they are looking at.
 */
export function workoutRequired(session: PlannedSession): boolean {
  return session.tier !== "extra";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
