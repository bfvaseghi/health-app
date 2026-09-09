import type { PlannedSession } from "../training/coach";

/** Keep internal session identities stable while giving the two base visits clear names. */
export function workoutLabel(session: PlannedSession): string {
  if (session.tier === "base") return session.name === "Workout 1" ? "Full body A" : session.name === "Workout 2" ? "Full body B" : session.name;
  if (session.tier === "extra") return session.name === "Workout 3" ? "Extra workout 1" : session.name === "Workout 4" ? "Extra workout 2" : session.name;
  return session.name;
}
