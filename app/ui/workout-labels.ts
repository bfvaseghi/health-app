import type { PlannedSession } from "../training/coach";
import { classifyExercise } from "../training/muscles";
import type { Muscle } from "../training/muscles";

/**
 * What to call a workout, standing in a gym.
 *
 * "Workout 4" and "Full body A" were the planner's names for its own slots.
 * They said nothing about what you were about to do. A workout's name should be
 * what it trains, and that is already in the exercises it contains — so it is
 * read off them rather than assigned.
 *
 * The catch, and it is the thing that broke the last version: naming every
 * broad session "Full body" gave a week two workouts with the same name,
 * distinguishable only by a minute count, and shipped both into Strong under
 * identical headings. So a name is now the two areas carrying the most work —
 * which are different between two sessions that both touch everything — and
 * "Full body" survives only as the scope line under it.
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

/** Direct sets per area, so a name reflects what the session is mostly for. */
export function sessionAreaSets(session: PlannedSession): Array<{ area: string; sets: number }> {
  const sets = new Map<string, number>();
  for (const exercise of session.exercises) {
    for (const muscle of classifyExercise(exercise.exercise).direct) {
      const entry = AREAS.find((area) => area.muscles.includes(muscle));
      if (entry) sets.set(entry.area, (sets.get(entry.area) ?? 0) + exercise.sets);
    }
  }
  return AREAS.filter((entry) => sets.has(entry.area))
    .map((entry) => ({ area: entry.area, sets: sets.get(entry.area) as number }))
    // Ties break in body order, so a name is stable across rebuilds of the week.
    .sort((a, b) => b.sets - a.sets);
}

/** The two areas carrying the most direct sets — what the session is for. */
export function workoutLabel(session: PlannedSession): string {
  const ranked = sessionAreaSets(session).filter((entry) => entry.area !== "core");
  if (!ranked.length) return sessionAreaSets(session).length ? "Core" : "Workout";
  if (ranked.length === 1) return capitalise(ranked[0].area);
  return capitalise(`${ranked[0].area} + ${ranked[1].area}`);
}

/**
 * The scope word, so a two-area name is never read as a claim about the whole
 * session. "Legs + back" names what it is mostly for; "Full body" underneath
 * says how far it reaches.
 */
export function workoutScope(session: PlannedSession): string {
  return sessionAreas(session).filter((area) => area !== "core").length >= 4 ? "Full body" : "";
}

/**
 * Display names for one plan's sessions, guaranteed distinct.
 *
 * Keyed off the untrimmed `plan.sessions`, so a name cannot drift mid-week as
 * covered work is stripped out and the remainder re-sorted.
 */
export function labelSessions(sessions: PlannedSession[]): Map<string, string> {
  const names = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const label = workoutLabel(session);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const used = new Map<string, number>();
  for (const [index, session] of sessions.entries()) {
    const label = workoutLabel(session);
    if ((counts.get(label) ?? 0) < 2) {
      names.set(session.name, label);
      continue;
    }
    // Two sessions with the same two leading areas. The lift it opens with is
    // the thing he will recognise; failing that, its position in the week.
    const opener = session.exercises[0]?.exercise.replace(/\s*\([^)]+\)$/, "");
    const seen = (used.get(label) ?? 0) + 1;
    used.set(label, seen);
    names.set(session.name, opener ? `${label} · ${opener}` : `${label} ${index + 1}`);
  }
  // Any collision the opener failed to break gets an ordinal rather than a
  // duplicate, because a duplicate is the bug this function exists to stop.
  const final = new Map<string, string>();
  const taken = new Set<string>();
  for (const [key, label] of names) {
    let name = label;
    let suffix = 2;
    while (taken.has(name)) name = `${label} ${suffix++}`;
    taken.add(name);
    final.set(key, name);
  }
  return final;
}

/**
 * Whether the planner built this session as one of the week's opening pair.
 *
 * Deliberately not called "optional" anywhere on screen. The base pair covers
 * every muscle group but does not on its own reach the weekly set targets, so a
 * session labelled optional could be the one a target depended on. What the
 * extra sessions actually carry is stated on the coverage row instead.
 */
export function workoutRequired(session: PlannedSession): boolean {
  return session.tier !== "extra";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
