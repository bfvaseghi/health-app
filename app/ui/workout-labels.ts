import type { PlannedSession } from "../training/coach";

/**
 * What to call a workout on screen.
 *
 * "Full body A" and "Extra workout 2" were the planner's words, not anybody
 * else's: they said nothing about what the workout was for or whether it
 * mattered. A number says where you are in the week, and the line underneath
 * says the rest.
 */
export function workoutLabel(session: PlannedSession): string {
  const slot = /Workout (\d)/.exec(session.name)?.[1];
  return slot ? `Workout ${slot}` : session.name;
}

/** One plain sentence about what this workout is for. */
export function workoutPurpose(session: PlannedSession): string {
  if (session.tier === "extra") return "Adds more on top of a week that is already covered";
  return "One of the two that cover your whole body";
}

/** Whether skipping it leaves a gap. This is the thing people actually ask. */
export function workoutRequired(session: PlannedSession): string {
  return session.tier === "extra" ? "Only if you have time" : "Do this one";
}
