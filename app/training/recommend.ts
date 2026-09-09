import type { HealthState } from "../health-model";
import { todayLocal } from "../health-model";
import type { PlannedSession } from "./coach";
import { classifyExercise, MUSCLES, muscleLabels } from "./muscles";
import type { Muscle } from "./muscles";

/**
 * The two facts a recommendation rests on, and neither of them was ever said.
 *
 * A session that claims to be what you most need has to answer "how do you
 * know" with something better than a weekly budget: when each muscle was last
 * trained, and how old the record it is reading from is. A plan drawn from a
 * three-week-old import is a guess wearing a prescription's clothes.
 */

/** Days since a muscle last got a direct set, or null if it never has. */
export type Freshness = { muscle: Muscle; label: string; days: number | null };

const STALE_DAYS = 7;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);
}

/** When every muscle was last worked, worst first. */
export function muscleFreshness(state: HealthState, asOf = todayLocal()): Freshness[] {
  const last = new Map<Muscle, string>();
  for (const set of state.workoutSets) {
    if (set.date > asOf) continue;
    for (const muscle of classifyExercise(set.exercise).direct) {
      const seen = last.get(muscle);
      if (!seen || set.date > seen) last.set(muscle, set.date);
    }
  }
  return MUSCLES.map((muscle) => {
    const date = last.get(muscle);
    return { muscle, label: muscleLabels[muscle], days: date ? daysBetween(date, asOf) : null };
  }).sort((a, b) => (b.days ?? 9_999) - (a.days ?? 9_999));
}

/** The ones that have gone too long, worst first. A muscle never trained counts. */
export function behindMuscles(state: HealthState, asOf = todayLocal(), staleDays = STALE_DAYS): Freshness[] {
  return muscleFreshness(state, asOf).filter((entry) => entry.days === null || entry.days >= staleDays);
}

/** Of what is behind, the part this session actually puts work into. */
export function sessionCloses(session: PlannedSession, behind: Freshness[]): Freshness[] {
  const trained = new Set<Muscle>();
  for (const exercise of session.exercises) {
    for (const muscle of classifyExercise(exercise.exercise).direct) trained.add(muscle);
  }
  return behind.filter((entry) => trained.has(entry.muscle));
}

/**
 * How old the picture is. Everything the app says rests on the last Strong
 * export you remembered to bring across, so it says which one.
 */
export function recordAge(state: HealthState, asOf = todayLocal()): { date: string | null; days: number | null } {
  let latest: string | null = null;
  for (const set of state.workoutSets) {
    if (set.date > asOf) continue;
    if (!latest || set.date > latest) latest = set.date;
  }
  return { date: latest, days: latest ? daysBetween(latest, asOf) : null };
}

/** "9 days", "today", "never" — the same phrase wherever a gap is named. */
export function sinceLabel(days: number | null): string {
  if (days === null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** The same fact in a column: "today", "2d", "never". */
export function sinceShort(days: number | null): string {
  if (days === null) return "never";
  if (days <= 0) return "today";
  return `${days}d`;
}
