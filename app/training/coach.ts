/**
 * Reads a Strong history and says what to do next.
 *
 * Everything here is derived from sets you have already logged: which muscles
 * are getting worked and how hard, how often you actually train, how long your
 * rest timers are set for, and what movements you own. Nothing is invented — a
 * recommendation only ever names an exercise already in your history, spelled
 * the way Strong spells it, so the plan drops back into Strong against the same
 * records.
 */

import type { HealthState, WorkoutSet } from "../health-model";
import { addDays, buildWorkoutSessions, estimateOneRepMax, todayLocal } from "../health-model";
import type { Muscle } from "./muscles";
import {
  MUSCLES,
  classifyExercise,
  muscleLabels,
  muscleRegion,
  weeklyAim,
  weeklyTargets,
} from "./muscles";

/** No single movement gets more than this in a session; past it you are junk-volume. */
const MAX_SETS_PER_EXERCISE = 5;
/**
 * Nor does one muscle, however far behind it is.
 *
 * Past about this many hard sets for one muscle in one session the marginal set
 * stops buying much — the stimulus per set falls away long before the fatigue
 * does. A muscle that wants more than this wants another session, not a longer
 * one, which is what the day count is for.
 */
const MAX_SETS_PER_MUSCLE_PER_SESSION = 8;

/**
 * What a set is worth to a muscle, and the only measure of volume in here.
 *
 * A set counts once where the muscle is the point of the lift and half where it
 * is not. Both count, because both are training it — rowing does build biceps,
 * and a floor that ignored that would have you curling on top of a back day you
 * had already spent. Half rather than one because it takes more bystander work
 * to buy the same adaptation: the muscle is worked less hard, through less
 * range, and usually not to the lengthened position the lift was chosen for.
 *
 * The panel reports this and the plan is built to it. Two definitions of
 * "enough" in one app is how the old version managed to show a week that met
 * its targets and a plan that disagreed.
 */
export const INDIRECT_WEIGHT = 0.5;
export function effectiveSets(direct: number, indirect: number): number {
  return Math.round((direct + indirect * INDIRECT_WEIGHT) * 2) / 2;
}

/**
 * How much of a muscle's floor has to be direct work, whatever the indirect
 * total says.
 *
 * Bystander work is worth something but it is not a substitute. Pressing does
 * train the triceps, and a plan that let twelve sets of pressing stand in for
 * every triceps set would never program an extension — no lengthened-position
 * work, no elbow flexion under load, nothing chosen for the muscle. So half of
 * every floor has to be met head-on, and indirect work covers the rest.
 */
const MIN_DIRECT_SHARE = 0.5;
export function minimumDirect(muscle: Muscle): number {
  return Math.ceil(weeklyTargets[muscle].min * MIN_DIRECT_SHARE);
}

/**
 * How far a muscle is from being served, in direct sets it still needs. Zero
 * when it is served. Both floors have to clear: the work floor, which indirect
 * sets help with, and the direct floor, which only direct sets do.
 */
function shortfallSets(volume: PlannedVolume | undefined, muscle: Muscle): number {
  const direct = volume?.direct ?? 0;
  const effective = volume?.effective ?? 0;
  return Math.max(0, weeklyTargets[muscle].min - effective, minimumDirect(muscle) - direct);
}

/**
 * How much a muscle's weekly volume climbs from what it is already getting.
 *
 * Adding a set or two a week is the standard, and it is standard because it is
 * what someone recovers from while still doing more than last week.
 */
export const VOLUME_STEP = 2;
/**
 * A session someone finishes, by how many sessions the week has.
 *
 * Their own sessions run about fifteen sets in fifty minutes, so twenty-two is
 * a long-but-real workout. But a week of two has eleven muscle groups to serve
 * with the same floors as a week of four, and holding both weeks to the same
 * session length is what made two days structurally unable to cover them. The
 * honest trade is the one a twice-a-week lifter actually makes: fewer, longer
 * sessions. Thirty sets at these rests is roughly ninety minutes — long, and
 * the reason it is still capped rather than uncapped.
 *
 * The day count still means something. Two days at thirty is sixty sets against
 * four days at twenty-two for eighty-eight, so more days is still more work —
 * it is just no longer the difference between covering the week and not.
 */
const SETS_PER_SESSION: Record<number, number> = { 2: 30, 3: 26, 4: 22 };
const MAX_SETS_PER_SESSION = 22;
export function maxSetsPerSession(days: number): number {
  return SETS_PER_SESSION[days] ?? MAX_SETS_PER_SESSION;
}
/**
 * How far one session may run past the nominal length, when another runs short.
 *
 * What a body recovers from is a week, not a Tuesday. Holding every session to
 * the same length sounds tidy and is how a lower day ends up rationing the
 * calves and the core between five muscle groups while an upper day spends its
 * last four sets pushing a chest that was already at the top of its range. The
 * week's total is the real budget; a session is allowed to be longer than its
 * neighbour by about a movement's worth.
 */
const SESSION_SLACK = 2;
/** The longest one session may run, as opposed to the week's budget per day. */
export function longestSession(days: number): number {
  return maxSetsPerSession(days) + SESSION_SLACK;
}
/**
 * And the per-muscle ceiling lifts with it. A muscle trained twice a week has
 * two chances at its week; one trained twice in a week of two has the same two,
 * but nothing else to fall back on, so the session is allowed to carry a little
 * more of it.
 */
function muscleCap(days: number): number {
  return days <= 2 ? 10 : MAX_SETS_PER_MUSCLE_PER_SESSION;
}
/** Four sessions is the ceiling, whatever the arithmetic wants. */
export const MAX_DAYS = 4;
export const DAY_CHOICES = [2, 3, 4];

/**
 * A four-week block: three weeks of building, then a week that backs off.
 *
 * Volume climbs about a tenth a week, which is roughly what a body adapts to,
 * and the fourth week drops to a bit over half — hard weeks stop paying after
 * three or so, and the week that lets you recover is where the last three
 * weeks' work actually shows up. Standard mesocycle shape, not an invention.
 */
export const BLOCK_WEEKS = 4;
const WEEK_SCALE = [1, 1.11, 1.22, 0.55];
/** Nothing in a deload week runs long. */
const DELOAD_SETS_PER_EXERCISE = 3;

/**
 * How often one movement may come back inside a week.
 *
 * Twice is a frequency; three times is the same workout written out three
 * times, and it is what makes a week look thoughtless. A movement that trains
 * three muscle groups at once — a deadlift, a heavy hinge — gets one slot,
 * because the reason to do it is also the reason not to do it often: it taxes
 * everything at once and the recovery is the whole body's, not one muscle's.
 */
const MAX_TIMES_A_WEEK = 2;
const MAX_TIMES_A_WEEK_HEAVY = 1;
const HEAVY_MUSCLES = 3;

function timesAWeek(exercise: string): number {
  const info = classifyExercise(exercise);
  return info.compound && info.direct.length >= HEAVY_MUSCLES ? MAX_TIMES_A_WEEK_HEAVY : MAX_TIMES_A_WEEK;
}

/* ---------------------------------------------------------------- volume */

export type MuscleVolume = {
  muscle: Muscle;
  label: string;
  /** Sets a week where this muscle was the point of the movement. */
  direct: number;
  /** Sets a week where it worked hard but was not the point. */
  indirect: number;
  /** The two combined at their weights. This is what the target is judged on. */
  effective: number;
  target: { min: number; max: number };
  status: "under" | "in" | "over" | "none";
  /** Sets a week away from the nearest edge of the range; negative means over. */
  gap: number;
  /** How many weeks the average is over: the ones you trained, not the calendar. */
  activeWeeks: number;
};

/**
 * The last day with training on it.
 *
 * Every window here is measured back from this rather than from today. An
 * export is a snapshot taken the day you exported it, and a fortnight later
 * "the last four weeks" counted from today is two weeks of your training and
 * two weeks of nothing — which reads as a chest that has stopped and a back
 * that was never trained. What is on the page should be what is in the file.
 */
function lastTrainingDay(sets: WorkoutSet[], asOf: string): string {
  const dates = sets.map((entry) => entry.date).filter((date) => date <= asOf);
  return dates.length ? dates.reduce((latest, date) => (date > latest ? date : latest)) : asOf;
}

/**
 * The last day eligible to set this week's baseline.
 *
 * Once the week has started, a partial Strong import is evidence about work
 * already banked, not a suddenly tiny new weekly habit. Completed prior weeks
 * set the programme; the current week is reconciled against it below. A first
 * ever import still has to be usable, so current-week data is used when there
 * is no earlier history.
 */
function completedHistoryEnd(sets: WorkoutSet[], asOf: string): string {
  const monday = weekStart(asOf);
  return sets.some((entry) => entry.date < monday && entry.date <= asOf) ? addDays(monday, -1) : asOf;
}

/**
 * Weekly sets per muscle, averaged over the weeks you actually trained rather
 * than the weeks on the calendar.
 *
 * The distinction matters. Someone who does a well-built ten-set chest week and
 * then misses three weeks does not have a volume problem, they have a frequency
 * problem, and dividing by four would report the first and hide the second.
 * Frequency is reported on its own, by `trainingHabit`.
 */
export function muscleVolume(sets: WorkoutSet[], asOf = todayLocal(), weeks = 4): MuscleVolume[] {
  const span = Math.max(1, Math.trunc(weeks));
  const end = lastTrainingDay(sets, asOf);
  const start = addDays(weekStart(end), -(span - 1) * 7);
  const window = sets.filter((entry) => entry.date >= start && entry.date <= end);

  const trainedWeeks = new Set(window.map((entry) => weekStart(entry.date)));
  const active = Math.max(1, trainedWeeks.size);

  const direct = new Map<Muscle, number>();
  const indirect = new Map<Muscle, number>();
  for (const entry of window) {
    const { direct: primary, indirect: secondary } = classifyExercise(entry.exercise);
    for (const muscle of primary) direct.set(muscle, (direct.get(muscle) ?? 0) + 1);
    for (const muscle of secondary) indirect.set(muscle, (indirect.get(muscle) ?? 0) + 1);
  }

  return MUSCLES.map((muscle) => {
    const weekly = Math.round(((direct.get(muscle) ?? 0) / active) * 10) / 10;
    const bystander = Math.round(((indirect.get(muscle) ?? 0) / active) * 10) / 10;
    const worth = effectiveSets(weekly, bystander);
    const target = weeklyTargets[muscle];
    // Judged on the same measure the plan is built to and the panel reports. A
    // muscle with no direct work at all is still called out, however much
    // bystander work it picks up, because half of every floor has to be direct.
    const status =
      weekly === 0 ? "none" : worth < target.min ? "under" : worth > target.max ? "over" : "in";
    const gap =
      status === "under" || status === "none"
        ? Math.round(Math.max(target.min - worth, minimumDirect(muscle) - weekly) * 10) / 10
        : status === "over"
          ? Math.round((target.max - worth) * 10) / 10
          : 0;
    return {
      muscle,
      label: muscleLabels[muscle],
      direct: weekly,
      indirect: bystander,
      effective: worth,
      target,
      status,
      gap,
      activeWeeks: active,
    };
  });
}

/** Exercises in the history that no rule recognises, so they count for nothing. */
export function unclassifiedExercises(sets: WorkoutSet[]): string[] {
  const names = new Set<string>();
  for (const entry of sets) {
    if (classifyExercise(entry.exercise).direct.length === 0) names.add(entry.exercise);
  }
  return [...names].sort();
}

/* ----------------------------------------------------------------- habit */

export type SessionShape = "push" | "pull" | "legs" | "upper" | "full" | "core" | "mixed";

export type TrainingHabit = {
  /** Sessions a week, averaged over the window. */
  daysPerWeek: number;
  setsPerSession: number;
  minutesPerSession: number | null;
  sessions: number;
  weeks: number;
  /** daysPerWeek without a trailing ".0" on whole numbers. */
  recentLabel: string;
};

export function trainingHabit(sets: WorkoutSet[], asOf = todayLocal(), weeks = 6): TrainingHabit {
  const span = Math.max(1, Math.trunc(weeks));
  // Measured over the weeks the export covers, so a fortnight-old file reports
  // how often you train rather than how long ago you exported it.
  const end = lastTrainingDay(sets, asOf);
  const start = addDays(end, -(span * 7 - 1));
  const window = sets.filter((entry) => entry.date >= start && entry.date <= end);
  const sessions = buildWorkoutSessions(window);
  const observedWeeks = Math.max(1, new Set(sessions.map((session) => weekStart(session.date))).size);

  // Strong repeats the session length on every row, so one row per session.
  const byStart = new Map<string, WorkoutSet[]>();
  for (const entry of window) {
    const list = byStart.get(entry.startedAt);
    if (list) list.push(entry);
    else byStart.set(entry.startedAt, [entry]);
  }
  const durations = [...byStart.values()]
    .map((entries) => entries[0]?.durationSeconds ?? null)
    .filter((value): value is number => value !== null && value > 0);

  return {
    daysPerWeek: Math.round((sessions.length / observedWeeks) * 10) / 10,
    setsPerSession: sessions.length ? Math.round(window.length / sessions.length) : 0,
    minutesPerSession: durations.length
      ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length / 60)
      : null,
    sessions: sessions.length,
    weeks: observedWeeks,
    recentLabel: formatDays(sessions.length / observedWeeks),
  };
}

function formatDays(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* ------------------------------------------------------------------ rest */

/**
 * Nothing rests longer than this.
 *
 * A heavy compound would take five minutes if you let it, and the research does
 * say more strength comes back the longer you wait. But a session is a budget:
 * five-minute rests turn four working exercises into a two-hour evening, and
 * the session you abandon builds nothing. Three minutes is where most of the
 * recovery has already happened, so that is the ceiling.
 */
export const MAX_REST_SECONDS = 180;

/** What rest a set deserves, from how heavy it is rather than what it is called. */
export function suggestedRest(reps: number, compound: boolean): { min: number; max: number } {
  const band = restBand(reps, compound);
  return { min: Math.min(band.min, MAX_REST_SECONDS), max: Math.min(band.max, MAX_REST_SECONDS) };
}

function restBand(reps: number, compound: boolean): { min: number; max: number } {
  if (reps <= 5) return compound ? { min: 180, max: 300 } : { min: 120, max: 180 };
  if (reps <= 12) return compound ? { min: 120, max: 180 } : { min: 90, max: 120 };
  // A set of fifteen squats is more systemically fatiguing than a set of eight,
  // so the high-rep compound band is not shorter than the moderate one.
  return compound ? { min: 120, max: 180 } : { min: 60, max: 90 };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/* ------------------------------------------------------- days to train */

export type DayAdvice = {
  days: number;
  /** What they have actually been doing, for comparison. */
  recent: number;
  /** Why the number is not simply what the volume gap asked for. */
  limits: string[];
};

/**
 * How many sessions a week. The sets you are short over the sets you do in a
 * session, capped at two days above the current habit — a jump from two
 * sessions to six is a plan people abandon in a fortnight.
 *
 * Nothing outside the training log is consulted. Sleep and food matter, but a
 * programme that rewrites itself on last night's numbers is not a programme.
 */
export function recommendDays(state: HealthState, asOf = todayLocal()): DayAdvice {
  const historyEnd = completedHistoryEnd(state.workoutSets, asOf);
  const habit = trainingHabit(state.workoutSets, historyEnd, 6);
  const volume = muscleVolume(state.workoutSets, historyEnd, 4);
  const limits: string[] = [];

  const needed = volume.reduce((total, entry) => total + Math.max(0, entry.gap), 0);
  const perSession = habit.setsPerSession || 15;
  const base = habit.daysPerWeek || 3;

  let days = Math.min(MAX_DAYS, Math.max(2, Math.round(base + needed / Math.max(8, perSession))));

  const ceiling = Math.min(MAX_DAYS, Math.max(3, Math.ceil(habit.daysPerWeek) + 2));
  if (days > ceiling) {
    limits.push(`held to ${ceiling} — you train ${habit.recentLabel} now`);
    days = ceiling;
  }

  return { days, recent: habit.daysPerWeek, limits };
}

/* ------------------------------------------------------------------ plan */

export type PlannedExercise = {
  /** Exactly as Strong spells it, so the routine lines up with your history. */
  exercise: string;
  sets: number;
  repRange: string;
  restSeconds: number;
  muscle: Muscle;
  compound: boolean;
  /**
   * The load you have been using for this movement lately, so the card is
   * something you can walk up to a machine with. Null where there is no load
   * to give: a movement carrying no weight, or one with nothing usable logged
   * against it — `bodyweight` says which, so the card can too.
   */
  weightLb: number | null;
  /** Pounds of assistance for assisted movements; lower is harder. */
  assistanceLb: number | null;
  /** The movement carries no external load, so there is no number to give. */
  bodyweight: boolean;
  /** The load is a step up on what you have been lifting, because you earned it. */
  stepUp: boolean;
  /** The load is a step down, because the lift has not moved in three sessions. */
  stalled: boolean;
  /** True when this is here to close a gap rather than to keep something up. */
  added: boolean;
  /** You put this here, so you can take it away again. */
  byHand: boolean;
  /** Explicitly added sets; importing a workout may trim around, never through, these. */
  manualSets?: number;
};

export type PlannedSession = {
  name: string;
  shape: SessionShape;
  exercises: PlannedExercise[];
  sets: number;
};

export type Plan = {
  days: number;
  /** Which week of the block this is, from zero. */
  week: number;
  /** The last week of the block, which backs off rather than building. */
  deload: boolean;
  split: string;
  sessions: PlannedSession[];
  /** Muscles with no matching exercise in the recent Strong history. */
  missing: Muscle[];
  /**
   * Muscles this many days leaves under their floor.
   *
   * Two sessions hold about forty-four sets between them, and eleven muscle
   * groups asking for their minimum want more than that, so something has to go
   * without. Naming it is the point — a target that quietly shrank to whatever
   * fits would never be able to tell you that two days is not enough.
   */
  shortfall: Muscle[];
};

export type PlannedVolume = { direct: number; indirect: number; effective: number };

/**
 * What the plan would give each muscle. Direct and indirect are kept apart so a
 * row can be opened and read; `effective` is the one number the floors are
 * judged on, and the same one the panel puts on screen.
 */
export function planVolume(plan: Plan): Map<Muscle, PlannedVolume> {
  const totals = new Map<Muscle, PlannedVolume>();
  const add = (muscle: Muscle, direct: number, indirect: number) => {
    const current = totals.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
    totals.set(muscle, { direct: current.direct + direct, indirect: current.indirect + indirect, effective: 0 });
  };

  for (const session of plan.sessions) {
    for (const exercise of session.exercises) {
      const info = classifyExercise(exercise.exercise);
      for (const muscle of info.direct) add(muscle, exercise.sets, 0);
      for (const muscle of info.indirect) add(muscle, 0, exercise.sets);
    }
  }
  for (const [muscle, value] of totals) {
    totals.set(muscle, {
      direct: value.direct,
      indirect: value.indirect,
      effective: effectiveSets(value.direct, value.indirect),
    });
  }
  return totals;
}

/**
 * A week's shape at each day count.
 *
 * Every template aims to hit each muscle twice, because the notes tell you to
 * and a plan that contradicts its own advice is worse than no plan. Two days
 * cannot quite manage it for the small groups; three and four can.
 */
/**
 * A week's shape at each day count, and every muscle in two of its sessions.
 *
 * Twice a week is the frequency the same weekly volume grows more on, and it
 * is not a detail a split gets to skip for the muscles nobody thinks about:
 * rear delts, glutes and calves were being trained once a week here because
 * they only appeared in one session, which is a fact about the template rather
 * than about them. The same reasoning covers the heavier emphasis on core —
 * eight sets is two sessions of four, not one session of eight, and the second
 * session is the one that gets trained rather than survived.
 */
const splitTemplates: Record<number, Array<{ name: string; shape: SessionShape; regions: Muscle[] }>> = {
  // Two sessions, so twice a week means both of them. The order differs between
  // the two because a muscle's second slot is given a different movement.
  2: [
    {
      name: "Full body A",
      shape: "full",
      regions: ["chest", "back", "quads", "hamstrings", "shoulders", "triceps", "biceps", "rearDelts", "glutes", "calves", "core"],
    },
    {
      name: "Full body B",
      shape: "full",
      regions: ["back", "chest", "hamstrings", "quads", "shoulders", "biceps", "triceps", "glutes", "rearDelts", "calves", "core"],
    },
  ],
  3: [
    { name: "Upper", shape: "upper", regions: ["chest", "back", "shoulders", "rearDelts", "triceps", "biceps", "core"] },
    { name: "Lower", shape: "legs", regions: ["quads", "hamstrings", "glutes", "calves", "core"] },
    {
      name: "Full",
      shape: "full",
      regions: ["back", "chest", "quads", "hamstrings", "shoulders", "rearDelts", "biceps", "triceps", "glutes", "calves"],
    },
  ],
  4: [
    { name: "Upper A", shape: "upper", regions: ["chest", "back", "shoulders", "triceps", "biceps", "rearDelts"] },
    { name: "Lower A", shape: "legs", regions: ["quads", "hamstrings", "glutes", "calves", "core"] },
    { name: "Upper B", shape: "upper", regions: ["back", "chest", "shoulders", "rearDelts", "biceps", "triceps"] },
    { name: "Lower B", shape: "legs", regions: ["hamstrings", "quads", "glutes", "calves", "core"] },
  ],
};

const splitNames: Record<number, string> = {
  2: "Full body, twice",
  3: "Upper / lower / full",
  4: "Upper / lower",
};

/** Movements you already own for a muscle, compounds first, most recent first. */
function vocabulary(sets: WorkoutSet[], asOf: string): Map<Muscle, string[]> {
  const seen = new Map<string, { last: string; count: number }>();
  const start = addDays(asOf, -180);
  for (const entry of sets) {
    if (entry.date < start || entry.date > asOf) continue;
    const record = seen.get(entry.exercise);
    if (record) {
      record.count += 1;
      if (entry.date > record.last) record.last = entry.date;
    } else {
      seen.set(entry.exercise, { last: entry.date, count: 1 });
    }
  }

  const byMuscle = new Map<Muscle, string[]>();
  const ranked = [...seen.entries()].sort(
    (a, b) => b[1].last.localeCompare(a[1].last) || b[1].count - a[1].count,
  );
  for (const [exercise] of ranked) {
    const info = classifyExercise(exercise);
    for (const muscle of info.direct) {
      const list = byMuscle.get(muscle) ?? [];
      list.push(exercise);
      byMuscle.set(muscle, list);
    }
  }
  // A compound leads a session; isolation finishes it.
  for (const [muscle, list] of byMuscle) {
    byMuscle.set(
      muscle,
      list.sort((a, b) => Number(classifyExercise(b).compound) - Number(classifyExercise(a).compound)),
    );
  }
  return byMuscle;
}

/**
 * How much to load a movement with, and which way that load is moving.
 *
 * Three things happen here, in order.
 *
 * First, the load has to suit the range being asked for. Someone squatting a
 * hundred kilos for twelve is not squatting a hundred kilos for five, so when
 * the prescribed range is nowhere near what they have been doing, the load is
 * re-anchored: their own best set gives an estimated max, and the max gives the
 * load that should be good for the bottom of the new range. Nothing is invented
 * — the number comes out of their own history — but it is their history
 * answering the right question.
 *
 * Second, double progression, which is how progressive overload is actually
 * run: hold the load, work up the range, and when the top of it is cleared on
 * at least two working sets, the load goes up and the reps reset.
 *
 * Third, and the thing the coach had no answer for: what happens when it does
 * not go up. Three sessions at the same weight with reps that have not moved is
 * a stall, and grinding a fourth is how people stay there for months. The load
 * comes off about a tenth and is built back — which is what a coach does, and
 * what nothing in here did before.
 */
function workingLoad(
  sets: WorkoutSet[],
  exercise: string,
  range: { low: number; top: number },
  deload: boolean,
  asOf: string,
): { weightLb: number | null; stepUp: boolean; stalled: boolean } {
  const held = { weightLb: null, stepUp: false, stalled: false };
  const history = sets.filter((entry) => entry.exercise === exercise && entry.date <= asOf);
  const sessions = [...new Set(history.map((entry) => entry.startedAt))]
    .sort()
    .slice(-3);
  const recent = history.filter((entry) => sessions.includes(entry.startedAt) && entry.weightLb !== null);
  if (!recent.length) return held;

  const bySession = sessions
    .map((startedAt) => recent.filter((entry) => entry.startedAt === startedAt))
    .filter((group) => group.length);
  // The load repeated most in a session is its working load. This ignores a
  // one-off top set when there are repeated work sets, while a pyramid (where
  // every load appears once) still resolves to its heaviest set.
  const sessionLoad = (group: WorkoutSet[]) => {
    const counts = new Map<number, number>();
    for (const entry of group) {
      const load = entry.weightLb as number;
      counts.set(load, (counts.get(load) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  };
  const loads = bySession.map(sessionLoad);
  // Progression and a deload both start from the latest load actually used.
  // A median of three sessions lags a legitimate rising sequence and can call
  // a reduction an increase (100 → 110 → 120 used to prescribe 115).
  const working = loads[loads.length - 1] ?? 0;
  if (!working) return held;
  // A deload holds the latest working load. Rep-range re-anchoring below is a
  // building-week tool and must never turn an easier week into a heavier one.
  if (deload) return { weightLb: plate(working), stepUp: false, stalled: false };

  // Whether the load suits the range is a question about reps, not about
  // pounds: if the reps you have been getting fall inside the range being
  // asked for, the load is already right. Comparing loads instead would put
  // anyone working at the top of their range on the edge of a re-anchor.
  const last = bySession[bySession.length - 1] ?? [];
  const atWorking = last.filter((entry) => (entry.weightLb as number) >= working);
  const usual = Math.round(median(atWorking.map((entry) => entry.reps ?? 0).filter(Boolean)));
  if (usual < range.low || usual > range.top) {
    // Their own best effort, asked the right question. Epley inverted: a max of
    // M is good for R reps at M / (1 + R/30).
    const best = Math.max(0, ...recent.map((entry) => estimateOneRepMax(entry.weightLb, entry.reps) ?? 0));
    const middle = (range.low + range.top) / 2;
    return { weightLb: plate(best ? best / (1 + middle / 30) : working), stepUp: false, stalled: false };
  }
  // Earned when the most recent session cleared the top of the range at that
  // load on at least two sets — one good set is a good set, not a pattern.
  const cleared = last.filter(
    (entry) => (entry.weightLb as number) >= working && (entry.reps ?? 0) >= range.top,
  ).length;
  if (cleared >= 2) {
    return { weightLb: plate(working + loadStep(exercise, working)), stepUp: true, stalled: false };
  }

  // Stalled: three sessions, the same load, and the best set no better than it
  // was. A fourth grind is not a plan.
  if (bySession.length >= 3 && loads.every((value) => value === loads[0])) {
    const reps = bySession.map((group) => Math.max(...group.map((entry) => entry.reps ?? 0)));
    if (reps[reps.length - 1] <= reps[0]) {
      return { weightLb: plate(working * 0.9), stepUp: false, stalled: true };
    }
  }

  return { weightLb: plate(working), stepUp: false, stalled: false };
}

/** Loads land on something the gym actually has. */
/**
 * The nearest load that exists.
 *
 * Rounding to the half pound produces numbers like 156.5, which is arithmetic
 * rather than a prescription: nothing in a gym loads to it, so the first thing
 * it does is make you do the rounding yourself. Two and a half pounds is the
 * smallest step anything here moves in — a pair of 1.25s on a bar, one pin on
 * a stack — so it is the grid every prescribed load lands on.
 */
const SMALLEST_STEP = 2.5;
function plate(value: number): number {
  return Math.max(SMALLEST_STEP, Math.round(value / SMALLEST_STEP) * SMALLEST_STEP);
}

/**
 * The next increment for a movement.
 *
 * A squat takes a bigger jump than a lateral raise, and both take a jump the
 * gym can actually make — plates come in fives and stacks in tens, so the step
 * is sized to the movement and then floored at a percentage so a very light
 * exercise does not get a jump it cannot absorb.
 */
function loadStep(exercise: string, current: number): number {
  const info = classifyExercise(exercise);
  const lower = info.direct.some((muscle) => muscleRegion[muscle] === "legs");
  const nominal = info.compound ? (lower ? 10 : 5) : 5;
  // Six percent of the bar, rounded to a plate, but never more than the
  // movement's own step: adding five pounds to a fifteen-pound lateral raise is
  // a third heavier, which is not a progression, it is a different exercise.
  return Math.min(nominal, Math.max(2.5, Math.round((current * 0.06) / 2.5) * 2.5));
}

/**
 * The rep range a movement is worth training in.
 *
 * This used to be whatever you already did, bracketed. That is a mirror, not a
 * coach: squat for twelve once and it prescribes twelve forever, and nothing
 * ever gets heavy. Hypertrophy happens anywhere from about five to thirty reps
 * taken near failure, so the range is not the question — what the range is *for*
 * is. A lift that puts three muscle groups under load is where strength is
 * built and where fatigue is bought, so it goes heavy and short. A single-joint
 * movement has no business being loaded to a heavy five, and buys its stimulus
 * more cheaply higher up. Anything that can never be loaded progresses on reps
 * alone, so its range has to be wide enough to progress inside.
 */
function repRange(exercise: string, muscle: Muscle, bodyweight: boolean): { label: string; low: number; top: number } {
  if (bodyweight) return { label: "12–20", low: 12, top: 20 };
  if (muscle === "core") return { label: "10–15", low: 10, top: 15 };
  const info = classifyExercise(exercise);
  if (info.compound && info.direct.length >= HEAVY_MUSCLES) return { label: "5–8", low: 5, top: 8 };
  if (info.compound) return { label: "6–10", low: 6, top: 10 };
  return { label: "8–12", low: 8, top: 12 };
}

/** A movement that has never carried weight progresses on reps, not on load. */
function isBodyweight(sets: WorkoutSet[], exercise: string, asOf: string): boolean {
  const own = sets.filter((entry) => entry.exercise === exercise && entry.date <= asOf);
  return own.length > 0 && own.every((entry) => entry.loadMode === "bodyweight" || (!entry.loadMode && (entry.weightLb === null || entry.weightLb === 0)));
}

function assistedLoad(
  sets: WorkoutSet[],
  exercise: string,
  range: { top: number },
  deload: boolean,
  asOf: string,
): { assistanceLb: number | null; stepUp: boolean } {
  const own = sets.filter(
    (entry) => entry.exercise === exercise && entry.date <= asOf && entry.loadMode === "assisted" && entry.assistanceLb !== null,
  );
  if (!own.length) return { assistanceLb: null, stepUp: false };
  const latestStart = own.map((entry) => entry.startedAt).sort().at(-1) as string;
  const latest = own.filter((entry) => entry.startedAt === latestStart);
  const assistance = latest[latest.length - 1]?.assistanceLb ?? null;
  if (assistance === null || deload) return { assistanceLb: assistance, stepUp: false };
  const cleared = latest.filter((entry) => (entry.reps ?? 0) >= range.top).length;
  if (cleared < 2) return { assistanceLb: assistance, stepUp: false };
  return { assistanceLb: Math.max(0, plate(assistance - loadStep(exercise, assistance))), stepUp: true };
}

/**
 * A week built from the movements already in the history, with sets distributed
 * so that every muscle lands inside its range.
 */
/**
 * One lift, worked out: how many reps, how long to rest, and what to put on it.
 *
 * The same answer whether the plan put the lift there or you did, which is the
 * point of it being one function — a lift you add to close a gap should not be
 * prescribed differently from the same lift the coach chose for you.
 */
function prescribe(
  state: HealthState,
  exercise: string,
  muscle: Muscle,
  sets: number,
  deload: boolean,
  asOf: string,
): PlannedExercise {
  const info = classifyExercise(exercise);
  const bodyweight = isBodyweight(state.workoutSets, exercise, asOf);
  const assisted = state.workoutSets.some((entry) => entry.exercise === exercise && entry.date <= asOf && entry.loadMode === "assisted");
  const range = repRange(exercise, muscle, bodyweight);
  const rest = suggestedRest(range.low, info.compound);
  const load = bodyweight || assisted
    ? { weightLb: null, stepUp: false, stalled: false }
    : workingLoad(state.workoutSets, exercise, range, deload, asOf);
  const assistance = assistedLoad(state.workoutSets, exercise, range, deload, asOf);
  return {
    exercise,
    sets,
    repRange: range.label,
    restSeconds: Math.round((rest.min + rest.max) / 2),
    muscle,
    compound: info.compound,
    // A deload keeps the load and drops the sets, which is the half of it that
    // matters; cutting both turns a deload into a week off.
    weightLb: load.weightLb,
    assistanceLb: assistance.assistanceLb,
    bodyweight,
    stepUp: assisted ? assistance.stepUp : load.stepUp,
    stalled: load.stalled,
    added: false,
    byHand: false,
    manualSets: 0,
  };
}

export function buildPlan(state: HealthState, asOf = todayLocal(), daysOverride?: number, week = 0): Plan {
  const advice = recommendDays(state, asOf);
  const days = Math.min(MAX_DAYS, Math.max(2, daysOverride ?? advice.days));
  const index = Math.min(BLOCK_WEEKS - 1, Math.max(0, Math.trunc(week)));
  const scale = WEEK_SCALE[index];
  const deload = index === BLOCK_WEEKS - 1;
  const template = splitTemplates[days];
  const volume = muscleVolume(state.workoutSets, completedHistoryEnd(state.workoutSets, asOf), 4);
  const owned = vocabulary(state.workoutSets, asOf);
  const frozen = Object.keys(state.goals.trainingAnchorSets).length
    ? state.goals.trainingAnchorSets
    : trainingAnchorSets(state, asOf);

  // Where each muscle should land next week.
  //
  // Two rules, in this order, because the order is the whole thing.
  //
  // Nobody goes below their floor. That used to be patched on afterwards, out
  // of whatever session budget the history-driven prescription had left over —
  // so a log full of pressing claimed the week, and the core and calves were
  // handed what was left, which on an upper-heavy history was nothing. A floor
  // allocated last is not a floor.
  //
  // Then everybody converges on the aim: the middle of the range, a couple of
  // sets a week, from either direction. A muscle below it climbs, and a muscle
  // above it comes down to make room for one that is short. Prescribing a
  // muscle exactly what it has been getting is not a programme, it is a
  // description of last month with the dates changed — and it is what kept
  // this amplifying whatever imbalance you arrived with.
  const targetSets = new Map<Muscle, number>();
  for (const entry of volume) {
    // Both are stated on all the work a muscle gets, so what has to be
    // prescribed is what is left after the work it picks up as a bystander.
    // Aiming direct sets at the middle of the range would hand the triceps
    // twelve extensions on top of eleven sets of pressing.
    const carried = INDIRECT_WEIGHT * entry.indirect;
    const floor = Math.max(minimumDirect(entry.muscle), Math.round(entry.target.min - carried));
    const aim = Math.max(floor, Math.round(weeklyAim(entry.muscle) - carried));
    // A set or two a week is how volume is added. A third more of whatever you
    // are on is a percentage pretending to be a prescription: it hands someone
    // on fifteen sets an extra five in one step, and someone on two an extra
    // one. Sets are the unit the body answers in, so sets are the unit here.
    const calculated = Math.max(floor, Math.min(Math.round(entry.direct) + VOLUME_STEP, aim));
    const baseline = Math.max(floor, frozen[entry.muscle] ?? calculated);
    // The deload is the one week allowed to go under the floor; that is what a
    // deload is. The building weeks climb from it.
    targetSets.set(
      entry.muscle,
      deload
        ? Math.max(2, Math.round(baseline * scale))
        : Math.min(entry.target.max, Math.round(baseline * scale)),
    );
  }

  // Slots per muscle across the week, so its sets can be shared out evenly.
  const slots = new Map<Muscle, number>();
  for (const day of template) {
    for (const muscle of day.regions) slots.set(muscle, (slots.get(muscle) ?? 0) + 1);
  }

  const missing = new Set<Muscle>();
  const slotUsed = new Map<Muscle, number>();
  // How many times each movement has been placed this week, so nothing comes
  // back more often than it should.
  const placed = new Map<string, number>();
  const sessions: PlannedSession[] = template.map((day) => {
    const exercises: PlannedExercise[] = [];
    for (const muscle of day.regions) {
      // The coach may arrange and progress only movements already present in
      // Strong. If the history has nothing for a muscle, the gap stays visible
      // instead of being filled with an exercise the lifter never chose.
      const mine = owned.get(muscle) ?? [];
      if (!mine.length) {
        missing.add(muscle);
        continue;
      }
      const weekly = targetSets.get(muscle) ?? weeklyTargets[muscle].min;
      const perSlot = Math.min(
        muscleCap(days),
        Math.max(2, Math.round(weekly / Math.max(1, slots.get(muscle) ?? 1))),
      );
      // Use as much of the owned vocabulary as this slot needs. If one known
      // movement cannot carry the whole target safely, the plan reports the
      // resulting shortfall rather than inventing another movement.
      const room = Math.max(1, Math.ceil(perSlot / MAX_SETS_PER_EXERCISE));
      const wanted = Math.min(mine.length, room);
      // A muscle that appears twice in the week gets a different movement the
      // second time, so the vocabulary is used rather than one lift repeated.
      const seen = slotUsed.get(muscle) ?? 0;
      slotUsed.set(muscle, seen + 1);
      const rotated = mine.length > 1 ? [...mine.slice(seen % mine.length), ...mine.slice(0, seen % mine.length)] : mine;
      // A movement at its limit for the week is not offered again — and never one this
      // session already has. A Romanian deadlift is direct work for the
      // hamstrings and for the glutes, so a lower day that asks each muscle
      // for its own movements will reach for the same lift twice and print it
      // twice unless the session it is being built for is taken into account.
      const already = new Set(exercises.map((entry) => entry.exercise));
      const free = rotated.filter(
        (name) => !already.has(name) && (placed.get(name) ?? 0) < timesAWeek(name),
      );
      const unused = free.filter((name) => !placed.has(name));
      const picks = [...unused, ...free.filter((name) => placed.has(name))].slice(0, wanted);
      if (!picks.length) continue;
      for (const name of picks) placed.set(name, (placed.get(name) ?? 0) + 1);
      // Rounding up across movements can breach the per-muscle ceiling, so the
      // share is capped by what is actually left of it.
      const share = Math.min(
        deload ? DELOAD_SETS_PER_EXERCISE : MAX_SETS_PER_EXERCISE,
        Math.max(2, Math.min(Math.round(perSlot / picks.length), Math.floor(perSlot / picks.length) || 2)),
      );
      const wasUnder = volume.find((entry) => entry.muscle === muscle)?.status;

      for (const exercise of picks) {
        const cap = deload ? DELOAD_SETS_PER_EXERCISE : MAX_SETS_PER_EXERCISE;
        exercises.push({
          ...prescribe(state, exercise, muscle, Math.min(share, cap), deload, asOf),
          added: wasUnder === "under" || wasUnder === "none",
        });
      }
    }
    // Compounds first: they deserve the session's best effort.
    exercises.sort((a, b) => Number(b.compound) - Number(a.compound));
    return {
      name: day.name,
      shape: day.shape,
      exercises,
      sets: exercises.reduce((total, entry) => total + entry.sets, 0),
    };
  });

  const plan: Plan = {
    days,
    week: index,
    deload,
    split: splitNames[days],
    sessions,
    missing: [...missing],
    shortfall: [],
  };
  fitSessions(plan);
  trimOvershoot(plan, targetSets);
  fitWeek(plan);
  // A deload is meant to come up short, so it is left alone.
  if (!deload) {
    topUp(plan);
    // What the week asked for, or what it has room for, whichever is smaller.
    const asked = [...targetSets.values()].reduce((total, value) => total + value, 0);
    climb(plan, Math.min(days * maxSetsPerSession(days), asked));
    fitWeek(plan);
  }

  // A deload is meant to give you less, so it is never a shortfall.
  if (!deload) {
    const delivered = planVolume(plan);
    plan.shortfall = MUSCLES.filter((muscle) => shortfallSets(delivered.get(muscle), muscle) > 0);
  }

  return plan;
}

/** Freezes the direct-set starting line for one four-week block. */
export function trainingAnchorSets(state: HealthState, asOf = todayLocal()): Record<string, number> {
  const volume = muscleVolume(state.workoutSets, completedHistoryEnd(state.workoutSets, asOf), 4);
  return Object.fromEntries(volume.map((entry) => {
    const carried = INDIRECT_WEIGHT * entry.indirect;
    const floor = Math.max(minimumDirect(entry.muscle), Math.round(entry.target.min - carried));
    const aim = Math.max(floor, Math.round(weeklyAim(entry.muscle) - carried));
    return [entry.muscle, Math.max(floor, Math.min(Math.round(entry.direct) + VOLUME_STEP, aim))];
  }));
}

/**
 * The whole block. Each week takes its own number of days, so a week you know
 * is short on time can be two sessions without disturbing the others.
 */
export function buildBlock(state: HealthState, asOf = todayLocal(), chosen: number[] = []): Plan[] {
  const advice = recommendDays(state, asOf);
  return Array.from({ length: BLOCK_WEEKS }, (_, index) => {
    const picked = chosen[index];
    const days = picked && picked >= 2 ? Math.min(MAX_DAYS, picked) : advice.days;
    return buildPlan(state, asOf, days, index);
  });
}

/* ------------------------------------------------------------ where you are */

/**
 * The Monday of the week a date falls in.
 *
 * A training week is a calendar week — you do three or four sessions and the
 * count starts again — so this is what "so far this week" is measured from.
 */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  // Sunday is 0 in JavaScript and the end of the week here, not the start.
  return addDays(date, -((day + 6) % 7));
}

/** Whole weeks from one Monday to another. */
function weeksBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 86_400_000));
}

/**
 * A gap this long ends a block. Two clear weeks off is a holiday or an injury,
 * not a light week, and what follows it is a fresh start rather than the middle
 * of something.
 */
const BLOCK_BREAK_WEEKS = 3;

/**
 * Which week of the four-week block you are in.
 *
 * Counted in whole weeks from the start of your current run of training, so the
 * block turns over by itself every Monday and there is nothing to set. It
 * anchors to the run rather than to the first session you ever logged, because
 * a deload is only worth anything three weeks after you started building — put
 * it at an arbitrary phase and it is just a light week for no reason.
 *
 * Come back from a long break and you are at the start of a block again, which
 * is where someone coming back from a long break should be.
 */
export function currentBlockWeek(state: HealthState, asOf = todayLocal()): number {
  if (state.goals.trainingBlockStart) {
    const offset = weeksBetween(state.goals.trainingBlockStart, weekStart(asOf));
    return ((offset % BLOCK_WEEKS) + BLOCK_WEEKS) % BLOCK_WEEKS;
  }
  const weeks = [
    ...new Set(state.workoutSets.filter((entry) => entry.date <= asOf).map((entry) => weekStart(entry.date))),
  ].sort();
  if (!weeks.length) return 0;

  const here = weekStart(asOf);
  // Still in the break: the block starts when the training does.
  if (weeksBetween(weeks[weeks.length - 1], here) >= BLOCK_BREAK_WEEKS) return 0;

  let anchor = weeks[0];
  for (let index = 1; index < weeks.length; index += 1) {
    if (weeksBetween(weeks[index - 1], weeks[index]) >= BLOCK_BREAK_WEEKS) anchor = weeks[index];
  }
  const offset = weeksBetween(anchor, here);
  return ((offset % BLOCK_WEEKS) + BLOCK_WEEKS) % BLOCK_WEEKS;
}

export type NextSession = {
  /** The session to do next, or null once the week's are all done. */
  session: PlannedSession | null;
  /** Sessions logged since Monday, and how many the week asks for. */
  done: number;
  of: number;
};

/**
 * The one session to do next.
 *
 * Which one it is comes from what you have already logged this week rather than
 * from a calendar: do two sessions by Wednesday and the third is next, whatever
 * day you get to it. Nothing is scheduled, so nothing can be missed.
 */
/** Direct and indirect work logged for each muscle since Monday. */
function bankedThisWeek(state: HealthState, asOf: string): Map<Muscle, PlannedVolume> {
  const monday = weekStart(asOf);
  const banked = new Map<Muscle, PlannedVolume>();
  const add = (muscle: Muscle, direct: number, indirect: number) => {
    const current = banked.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
    banked.set(muscle, {
      direct: current.direct + direct,
      indirect: current.indirect + indirect,
      effective: 0,
    });
  };
  for (const entry of state.workoutSets) {
    if (entry.date < monday || entry.date > asOf) continue;
    const info = classifyExercise(entry.exercise);
    for (const muscle of info.direct) add(muscle, 1, 0);
    for (const muscle of info.indirect) add(muscle, 0, 1);
  }
  for (const [muscle, volume] of banked) {
    banked.set(muscle, { ...volume, effective: effectiveSets(volume.direct, volume.indirect) });
  }
  return banked;
}

function sessionVolume(sessions: PlannedSession[]): Map<Muscle, PlannedVolume> {
  const totals = new Map<Muscle, PlannedVolume>();
  const add = (muscle: Muscle, direct: number, indirect: number) => {
    const current = totals.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
    totals.set(muscle, {
      direct: current.direct + direct,
      indirect: current.indirect + indirect,
      effective: 0,
    });
  };
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const info = classifyExercise(exercise.exercise);
      for (const muscle of info.direct) add(muscle, exercise.sets, 0);
      for (const muscle of info.indirect) add(muscle, 0, exercise.sets);
    }
  }
  for (const [muscle, volume] of totals) {
    totals.set(muscle, { ...volume, effective: effectiveSets(volume.direct, volume.indirect) });
  }
  return totals;
}

function matchedSessionsThisWeek(plan: Plan, state: HealthState, asOf: string): Set<string> {
  const monday = weekStart(asOf);
  const groups = new Map<string, WorkoutSet[]>();
  for (const entry of state.workoutSets.filter((set) => set.date >= monday && set.date <= asOf)) {
    const group = groups.get(entry.startedAt);
    if (group) group.push(entry);
    else groups.set(entry.startedAt, [entry]);
  }
  const matched = new Set<string>();
  const actual = [...groups.values()].sort((a, b) => (a[0]?.startedAt ?? "").localeCompare(b[0]?.startedAt ?? ""));

  for (const sets of actual) {
    const actualExercises = new Set(sets.map((set) => set.exercise));
    const actualMuscles = new Set(
      sets.flatMap((set) => {
        const info = classifyExercise(set.exercise);
        return [...info.direct, ...info.indirect];
      }),
    );
    let best: { name: string; score: number; threshold: number } | null = null;
    for (const session of plan.sessions) {
      if (matched.has(session.name)) continue;
      const exact = session.exercises.filter((exercise) => actualExercises.has(exercise.exercise)).length;
      const plannedMuscles = new Set(
        session.exercises.flatMap((exercise) => {
          const info = classifyExercise(exercise.exercise);
          return [...info.direct, ...info.indirect];
        }),
      );
      const overlap = [...plannedMuscles].filter((muscle) => actualMuscles.has(muscle)).length;
      const score = exact * 4 + overlap;
      const threshold = Math.max(3, Math.ceil(session.sets * 0.35));
      if (score > 0 && (!best || score > best.score)) best = { name: session.name, score, threshold };
    }
    // One abandoned warm-up or an unrelated session contributes volume but
    // does not consume a planned slot.
    if (best && sets.length >= best.threshold) matched.add(best.name);
  }
  return matched;
}

/**
 * Completed work replaces the matching part of what was still prescribed.
 *
 * A full plan is the intended shape of the week. After a Strong import, remove
 * a remaining set only when the actual work plus everything else still coming
 * continues to deliver that intended direct and effective volume for every
 * muscle the set touches. This lets five bench sets consume later pressing
 * without letting their indirect triceps credit erase the direct-work floor.
 */
function trimCoveredWork(
  sessions: PlannedSession[],
  banked: Map<Muscle, PlannedVolume>,
  intended: Map<Muscle, PlannedVolume>,
): PlannedSession[] {
  const trimmed = sessions.map((session) => ({
    ...session,
    exercises: session.exercises.map((exercise) => ({ ...exercise })),
  }));

  for (let guard = 0; guard < 200; guard += 1) {
    const coming = sessionVolume(trimmed);
    const combined = new Map<Muscle, PlannedVolume>();
    for (const muscle of MUSCLES) {
      const done = banked.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      const left = coming.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      combined.set(muscle, {
        direct: done.direct + left.direct,
        indirect: done.indirect + left.indirect,
        effective: effectiveSets(done.direct + left.direct, done.indirect + left.indirect),
      });
    }

    let best: { session: PlannedSession; exercise: PlannedExercise; score: number } | null = null;
    for (const session of trimmed) {
      for (const exercise of session.exercises) {
        if (exercise.sets <= (exercise.manualSets ?? 0)) continue;
        const info = classifyExercise(exercise.exercise);
        const affected = new Set([...info.direct, ...info.indirect]);
        let removable = true;
        let score = 0;
        for (const muscle of affected) {
          const now = combined.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
          const goal = intended.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
          const afterDirect = now.direct - (info.direct.includes(muscle) ? 1 : 0);
          const afterIndirect = now.indirect - (info.indirect.includes(muscle) ? 1 : 0);
          const afterEffective = effectiveSets(afterDirect, afterIndirect);
          if (afterDirect < goal.direct || afterEffective < goal.effective) {
            removable = false;
            break;
          }
          score += Math.max(0, now.direct - goal.direct) + Math.max(0, now.effective - goal.effective);
        }
        if (removable && (!best || score > best.score)) best = { session, exercise, score };
      }
    }
    if (!best) break;
    const removed = best.exercise;
    best.exercise.sets -= 1;
    best.session.sets -= 1;
    if (best.exercise.sets <= 0) {
      best.session.exercises = best.session.exercises.filter((entry) => entry !== removed);
    }
  }

  return trimmed.filter((session) => session.exercises.length > 0);
}

/**
 * The sessions of this week's plan still worth doing, most useful first.
 *
 * Not the next ones in a list. A week is four sessions that between them cover
 * eleven muscle groups, and the moment one of them is spent on something the
 * plan did not expect — a day you felt like pressing, a session cut short —
 * going down the list in order leaves the gap where it was. So what is left is
 * ranked by what is missing: every session is scored by how many sets it puts
 * into the muscles furthest below their target, and the one that closes the
 * most of that gap is the one offered next.
 *
 * The effect is that the week repairs itself. Skip the day with all the arm
 * work and the arm session comes up next, rather than fourth.
 */
export function remainingSessions(plan: Plan, state: HealthState, asOf = todayLocal()): PlannedSession[] {
  const matched = matchedSessionsThisWeek(plan, state, asOf);
  const left = Math.max(0, plan.sessions.length - matched.size);
  if (!left) return [];

  // Which sessions the week can least afford to skip.
  //
  // This used to choose what to keep, greedily, and the choice was biased by
  // how a session was shaped rather than by what it was for: an upper day with
  // eight movements closes more total gap than a leg day with four, so with a
  // session or two gone the projection dropped a leg day and reported the core
  // and calves short — while the week it was describing had two upper days in
  // it and one lower. Nobody trains like that, and the plan did not say to.
  //
  // So it chooses what to drop, by what is lost: a session is measured by the
  // coverage that would go missing if it alone were skipped and everything else
  // kept. A second upper day is cheap to lose when the first one covers the
  // same muscles; the only leg day is not.
  const banked = bankedThisWeek(state, asOf);
  const intended = planVolume(plan);
  const need = new Map(
    MUSCLES.map((muscle) => {
      const done = banked.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      const goal = intended.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      return [muscle, {
        direct: Math.max(0, goal.direct - done.direct),
        effective: Math.max(0, goal.effective - done.effective),
      }] as const;
    }),
  );
  // How much of what is still needed a set of sessions covers, counted as a
  // share of each muscle's floor so a muscle is not outvoted by having fewer
  // movements available to train it.
  const covers = (sessions: PlannedSession[]) => {
    const totals = sessionVolume(sessions);
    let score = 0;
    for (const [muscle, short] of need) {
      const total = totals.get(muscle) ?? { direct: 0, indirect: 0, effective: 0 };
      if (short.direct > 0) score += Math.min(total.direct, short.direct) / short.direct;
      if (short.effective > 0) score += Math.min(total.effective, short.effective) / short.effective;
    }
    return score;
  };

  let kept = plan.sessions.filter((session) => !matched.has(session.name));
  while (kept.length > left) {
    let drop = 0;
    let best = -Infinity;
    // A row-stepper change belongs to the session the user changed. Keep that
    // session when there are ordinary sessions available to drop; otherwise a
    // minus can silently switch the week to another day and change nothing.
    const manuallyChanged = new Set(
      state.goals.addedSets
        .filter((entry) => entry.weekStart === weekStart(asOf))
        .map((entry) => entry.session),
    );
    const ordinary = kept
      .map((session, index) => ({ session, index }))
      .filter(({ session }) => !manuallyChanged.has(session.name) && !session.exercises.some((exercise) => exercise.byHand));
    const candidates = ordinary.length ? ordinary.map(({ index }) => index) : kept.map((_, index) => index);
    for (const index of candidates) {
      // What is left if this one goes. The most that remains is the one to go.
      const value = covers(kept.filter((_, other) => other !== index));
      if (value > best) {
        best = value;
        drop = index;
      }
    }
    kept = kept.filter((_, index) => index !== drop);
  }
  return trimCoveredWork(kept, banked, intended);
}

export function nextSession(plan: Plan, state: HealthState, asOf = todayLocal()): NextSession {
  const left = remainingSessions(plan, state, asOf);
  const matched = matchedSessionsThisWeek(plan, state, asOf);
  return {
    session: left[0] ?? null,
    done: matched.size,
    of: plan.sessions.length,
  };
}

/**
 * Where each muscle will end the week, if the rest of the plan gets done.
 *
 * This is the question the panel exists to answer, and a four-week average
 * could never answer it. What matters on a Wednesday is what you have already
 * banked this week and what the sessions you have not done yet will add — the
 * two together are what the target is met or missed by.
 *
 * Banked is real: sets logged since Monday, read straight out of the log.
 * Coming is the plan minus the sessions already done, on the same reading of
 * "done" the next-session card uses. Neither is a projection of a projection.
 */
export type MuscleOutlook = {
  muscle: Muscle;
  label: string;
  /** Work already banked this week, sets logged since Monday. */
  done: number;
  /** Work the sessions still to come will add. */
  coming: number;
  /** done + coming: where the week ends up if the rest of it gets done. */
  projected: number;
  /** The sets behind those numbers, for anyone who wants to see them. */
  direct: number;
  indirect: number;
  target: { min: number; max: number };
  status: "under" | "in" | "over";
  /** How far under the floor the week ends up, in sets. Zero when it does not. */
  shortBy: number;
};

function workValue(direct: number, indirect: number): number {
  return effectiveSets(direct, indirect);
}

/**
 * Where each muscle will end the week.
 *
 * Banked is out of the log: sets since Monday. Coming is what the sessions
 * still to do will add. Together they are the number the target is met or
 * missed by, which is the only number worth putting on a screen midweek — a
 * four-week average is a fact about last month and a whole planned week is a
 * fact about a hypothetical.
 */
export function weekOutlook(plan: Plan, state: HealthState, asOf = todayLocal()): MuscleOutlook[] {
  const monday = weekStart(asOf);
  const doneDirect = new Map<Muscle, number>();
  const doneIndirect = new Map<Muscle, number>();
  for (const entry of state.workoutSets) {
    if (entry.date < monday || entry.date > asOf) continue;
    const info = classifyExercise(entry.exercise);
    for (const muscle of info.direct) doneDirect.set(muscle, (doneDirect.get(muscle) ?? 0) + 1);
    for (const muscle of info.indirect) doneIndirect.set(muscle, (doneIndirect.get(muscle) ?? 0) + 1);
  }

  const comingDirect = new Map<Muscle, number>();
  const comingIndirect = new Map<Muscle, number>();
  for (const session of remainingSessions(plan, state, asOf)) {
    for (const exercise of session.exercises) {
      const info = classifyExercise(exercise.exercise);
      for (const muscle of info.direct) comingDirect.set(muscle, (comingDirect.get(muscle) ?? 0) + exercise.sets);
      for (const muscle of info.indirect) {
        comingIndirect.set(muscle, (comingIndirect.get(muscle) ?? 0) + exercise.sets);
      }
    }
  }

  return MUSCLES.map((muscle) => {
    const direct = (doneDirect.get(muscle) ?? 0) + (comingDirect.get(muscle) ?? 0);
    const indirect = (doneIndirect.get(muscle) ?? 0) + (comingIndirect.get(muscle) ?? 0);
    const done = workValue(doneDirect.get(muscle) ?? 0, doneIndirect.get(muscle) ?? 0);
    const coming = workValue(comingDirect.get(muscle) ?? 0, comingIndirect.get(muscle) ?? 0);
    const projected = workValue(direct, indirect);
    const target = weeklyTargets[muscle];
    const shortBy = Math.max(
      0,
      Math.round(Math.max(target.min - projected, minimumDirect(muscle) - direct) * 2) / 2,
    );
    return {
      muscle,
      label: muscleLabels[muscle],
      done,
      coming,
      projected,
      direct,
      indirect,
      target,
      status: shortBy > 0 ? "under" : projected > target.max ? "over" : "in",
      shortBy,
    };
  });
}

/* ------------------------------------------------- opening a single row */

export type MuscleWork = {
  /** The day it was logged, or the session it is planned in. */
  where: string;
  exercise: string;
  sets: number;
  /** Whether the muscle is the point of the lift or a passenger on it. */
  direct: boolean;
  /** Already in the log, as opposed to still to come. */
  done: boolean;
};

export type MuscleDetail = {
  muscle: Muscle;
  label: string;
  /** Everything that trains it this week, logged first and planned after. */
  work: MuscleWork[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * One muscle's week, itemised.
 *
 * Every lift giving it work, what each is worth, and where each sits. This is
 * the answer to "why is that number what it is" — what to do about the number
 * being too small is `adjustChoice`, which is a different question and gets a
 * different function.
 */
export function muscleDetail(
  plan: Plan,
  state: HealthState,
  muscle: Muscle,
  asOf = todayLocal(),
): MuscleDetail {
  const monday = weekStart(asOf);
  const work: MuscleWork[] = [];

  // What is banked, one line per lift per day rather than one per set.
  const logged = new Map<string, MuscleWork>();
  for (const entry of state.workoutSets) {
    if (entry.date < monday || entry.date > asOf) continue;
    const info = classifyExercise(entry.exercise);
    const direct = info.direct.includes(muscle);
    if (!direct && !info.indirect.includes(muscle)) continue;
    const key = `${entry.date}:${entry.exercise}`;
    const seen = logged.get(key);
    if (seen) seen.sets += 1;
    else {
      logged.set(key, {
        where: WEEKDAYS[new Date(`${entry.date}T12:00:00Z`).getUTCDay()],
        exercise: entry.exercise,
        sets: 1,
        direct,
        done: true,
      });
    }
  }
  work.push(...logged.values());

  const left = remainingSessions(plan, state, asOf);
  for (const session of left) {
    for (const exercise of session.exercises) {
      const info = classifyExercise(exercise.exercise);
      const direct = info.direct.includes(muscle);
      if (!direct && !info.indirect.includes(muscle)) continue;
      work.push({ where: session.name, exercise: exercise.exercise, sets: exercise.sets, direct, done: false });
    }
  }

  // Banked first, then what is coming — the same order the bar reads in, and
  // direct work above bystander work within each half.
  work.sort((a, b) => Number(b.done) - Number(a.done) || Number(b.direct) - Number(a.direct) || b.sets - a.sets);

  return { muscle, label: muscleLabels[muscle], work };
}

/* ------------------------------------------------------- closing it yourself */

export type FixChoice = {
  /** Spelled as Strong spells it. */
  exercise: string;
  /** The session it would go in. */
  session: string;
  /** How many sets of it would close the gap, capped at what one lift can hold. */
  sets: number;
};

/**
 * The lifts that would close a muscle's gap, best first.
 *
 * Every recent movement in the Strong log that trains the muscle head-on, in
 * the order the coach would have picked them. `adjustChoice` takes the head of
 * this list when you press plus; an empty list leaves the gap visible instead
 * of inventing an exercise.
 */
export function fixChoices(
  plan: Plan,
  state: HealthState,
  muscle: Muscle,
  asOf = todayLocal(),
): FixChoice[] {
  const row = weekOutlook(plan, state, asOf).find((entry) => entry.muscle === muscle);
  const gap = Math.ceil(row?.shortBy ?? 0);
  if (gap <= 0) return [];
  return liftsFor(plan, state, muscle, Math.min(MAX_SETS_PER_EXERCISE, Math.max(1, gap)), asOf);
}

/**
 * One set more of this muscle, and where it would go — or one set less, and
 * where it would come from.
 *
 * The same list `fixChoices` offers, without the shortfall as the reason for
 * asking. A week is a suggestion; wanting a bit more chest than the middle of
 * a range is not a mistake to be protected from, and the panel goes on saying
 * what the change did.
 */
export function adjustChoice(
  plan: Plan,
  state: HealthState,
  muscle: Muscle,
  direction: 1 | -1,
  asOf = todayLocal(),
): FixChoice | null {
  if (direction === 1) return liftsFor(plan, state, muscle, 1, asOf)[0] ?? null;

  // Taking one off comes from whatever is carrying the most of this muscle,
  // so a lift never disappears while another sits on five sets.
  const left = remainingSessions(plan, state, asOf);
  const carrying = left
    .flatMap((session) =>
      session.exercises
        .filter((exercise) => classifyExercise(exercise.exercise).direct.includes(muscle))
        .map((exercise) => ({ session, exercise })),
    )
    .sort((a, b) => b.exercise.sets - a.exercise.sets);
  const most = carrying[0];
  if (!most) return null;
  return { exercise: most.exercise.exercise, session: most.session.name, sets: 1 };
}

function liftsFor(
  plan: Plan,
  state: HealthState,
  muscle: Muscle,
  sets: number,
  asOf: string,
): FixChoice[] {
  const left = remainingSessions(plan, state, asOf);
  if (!left.length) return [];

  // A session that already trains the muscle first, and the shortest of those,
  // so adding a known lift evens the week out rather than tipping it.
  const trains = (session: PlannedSession) =>
    session.exercises.some((entry) => classifyExercise(entry.exercise).direct.includes(muscle));
  const host = [...left].sort(
    (a, b) => Number(trains(b)) - Number(trains(a)) || a.sets - b.sets,
  )[0];
  const inWeek = new Map<string, PlannedSession>();
  for (const session of left) {
    for (const exercise of session.exercises) {
      if (!inWeek.has(exercise.exercise)) inWeek.set(exercise.exercise, session);
    }
  }

  const owned = (vocabulary(state.workoutSets, asOf).get(muscle) ?? []).filter((name) =>
    classifyExercise(name).direct.includes(muscle),
  );
  const choices: FixChoice[] = [];
  // Something already in the week first: more of a lift you are doing anyway is
  // the cheapest way to close a gap.
  for (const name of owned) {
    const already = inWeek.get(name);
    if (!already) continue;
    const room = MAX_SETS_PER_EXERCISE - (already.exercises.find((e) => e.exercise === name)?.sets ?? 0);
    if (room <= 0) continue;
    choices.push({ exercise: name, session: already.name, sets: Math.min(sets, room) });
  }
  for (const name of owned) {
    if (inWeek.has(name)) continue;
    choices.push({ exercise: name, session: host.name, sets });
  }
  return choices;
}

/**
 * Folds the lifts you added into the week.
 *
 * They are prescribed exactly as the coach's own choices are — same reps, same
 * rest, same load off your own history — because a lift is a lift whoever put
 * it there. Anything belonging to another week is ignored rather than dropped,
 * so last week's additions stay last week's.
 */
export function withAddedSets(plan: Plan, state: HealthState, asOf = todayLocal()): Plan {
  const monday = weekStart(asOf);
  const mine = state.goals.addedSets.filter((entry) => entry.weekStart === monday);
  if (!mine.length) return plan;

  const sessions = plan.sessions.map((session) => {
    const additions = mine.filter((entry) => entry.session === session.name);
    if (!additions.length) return session;

    const exercises = [...session.exercises];
    for (const entry of additions) {
      const known = state.workoutSets.some((item) => item.exercise === entry.exercise && item.date <= asOf);
      if (!known) continue;
      const info = classifyExercise(entry.exercise);
      const muscle = info.direct[0];
      if (!muscle) continue;
      const existing = exercises.findIndex((item) => item.exercise === entry.exercise);
      if (existing >= 0) {
        // A change to a lift already there is more or fewer sets of it, not a
        // second copy. Taken to nothing, the lift goes with it.
        const next = Math.min(exerciseCap(plan), exercises[existing].sets + entry.sets);
        if (next <= 0) {
          exercises.splice(existing, 1);
          continue;
        }
        exercises[existing] = {
          ...exercises[existing],
          sets: next,
          added: true,
          byHand: true,
          manualSets: Math.max(0, next - exercises[existing].sets),
        };
        continue;
      }
      // Nothing to take sets off, so there is nothing to do.
      if (entry.sets <= 0) continue;
      const cap = plan.deload ? DELOAD_SETS_PER_EXERCISE : MAX_SETS_PER_EXERCISE;
      exercises.push({
        ...prescribe(state, entry.exercise, muscle, Math.min(entry.sets, cap), plan.deload, asOf),
        added: true,
        byHand: true,
        manualSets: Math.min(entry.sets, cap),
      });
    }
    // Deliberately not re-sorted. The coach's own list is already compounds
    // first, and re-sorting would lift an added compound over lifts that were
    // planned before it — what you add belongs at the end, where you added it.
    return { ...session, exercises, sets: exercises.reduce((total, item) => total + item.sets, 0) };
  });

  const next: Plan = { ...plan, sessions };
  // What you added can close the shortfall, so the shortfall is recomputed
  // rather than left saying something that stopped being true.
  if (!next.deload) {
    const delivered = planVolume(next);
    next.shortfall = MUSCLES.filter((muscle) => shortfallSets(delivered.get(muscle), muscle) > 0);
  }
  return next;
}

/**
 * What to call the week.
 *
 * Not "week 3 of the block". The block is real and it runs underneath, but
 * being told you are in week three of something nobody explained is worse than
 * being told nothing. There is this week, and every fourth one is easier.
 */
export function weekLabel(plan: Plan): string {
  return plan.deload ? "Easier week" : "This week";
}

/**
 * Brings any session that ran long back to a length someone would finish.
 *
 * What gets cut matters more than that something does. Trimming the smallest
 * movement first would always take the rear delt and calf work, because that is
 * always isolation — and those are exactly the muscles the plan was built to
 * rescue. So sets come off the movements already carrying a muscle that is well
 * served, and anything added to close a gap is touched last.
 */
function fitSessions(plan: Plan): void {
  const cap = longestSession(plan.days);
  for (const session of plan.sessions) {
    let guard = 0;
    while (session.sets > cap && guard < 200) {
      guard += 1;
      // Anything not there to close a gap goes first, and among those the one
      // whose muscles are furthest past where they are trying to get — so the
      // cut lands on the muscle with the most to spare rather than on whatever
      // happens to carry the most sets.
      const totals = planVolume(plan);
      const spare = (exercise: PlannedExercise) => {
        const info = classifyExercise(exercise.exercise);
        const over = info.direct.map(
          (muscle) => ((totals.get(muscle)?.effective ?? 0) - weeklyAim(muscle)) / weeklyAim(muscle),
        );
        return over.length ? Math.min(...over) : 1;
      };
      const order = [...session.exercises].sort(
        (a, b) => Number(a.added) - Number(b.added) || spare(b) - spare(a) || b.sets - a.sets,
      );
      const target = order.find((entry) => entry.sets > 2) ?? order[0];
      if (!target) break;

      if (target.sets > 2) target.sets -= 1;
      else session.exercises = session.exercises.filter((entry) => entry !== target);
      session.sets = session.exercises.reduce((total, entry) => total + entry.sets, 0);
    }
  }
}

/**
 * Sizing each muscle's own sets is not enough: a squat feeds the glutes and a
 * bench feeds the triceps, so a muscle can sail past what was intended for it
 * on work done for something else. This walks the plan back down against the
 * ramp it was built to, cutting the sets that target the offending muscle
 * directly rather than the compound another muscle depends on.
 *
 * The ramp, not the top of the range, is the ceiling here: a chest getting four
 * sets a week does not want fourteen next week just because fourteen is legal.
 */
/**
 * Adds back the sets that rounding lost.
 *
 * Sizing a week means dividing whole sets between whole movements, and every
 * division rounds down somewhere: a chest that wanted ten comes out at nine and
 * the panel reports a goal missed by one, which is arithmetic, not training.
 * This closes those gaps where there is room to — never past a muscle's own
 * ceiling, never past what a session or a movement can carry.
 */
function topUp(plan: Plan): void {
  const perExercise = plan.deload ? DELOAD_SETS_PER_EXERCISE : MAX_SETS_PER_EXERCISE;
  const cap = longestSession(plan.days);
  // Only movements that train the muscle directly are candidates. A muscle
  // short on work can be closed either way in principle, but the set has to be
  // put somewhere, and putting it on a lift chosen for the muscle is the one
  // choice that closes both floors at once.

  // Bounded: each pass adds one set, and a week has nowhere near this many to
  // give. The loop ends when nothing is short or nothing has room.
  for (let guard = 0; guard < 60; guard += 1) {
    const totals = planVolume(plan);
    const short = MUSCLES.map((muscle) => ({ muscle, gap: shortfallSets(totals.get(muscle), muscle) }))
      .filter((entry) => entry.gap > 0)
      .sort((a, b) => b.gap - a.gap);
    if (!short.length) return;

    let added = false;
    for (const { muscle } of short) {
      const options = plan.sessions.flatMap((session) =>
        session.sets >= cap
          ? []
          : session.exercises
              .filter((exercise) => exercise.muscle === muscle && exercise.sets < exerciseCap(plan))
              .map((exercise) => ({ session, exercise })),
      );
      // A set here also lands on whatever else the movement works, so it only
      // goes in if nothing it touches is already at its ceiling.
      const room = options.filter(({ exercise }) => {
        const info = classifyExercise(exercise.exercise);
        return (
          info.direct.every((other) => (totals.get(other)?.effective ?? 0) + 1 <= weeklyTargets[other].max) &&
          info.indirect.every(
            (other) => (totals.get(other)?.effective ?? 0) + INDIRECT_WEIGHT <= weeklyTargets[other].max,
          )
        );
      });
      if (!room.length) continue;

      // Into the shortest session, so the week stays even.
      room.sort((a, b) => a.session.sets - b.session.sets);
      room[0].exercise.sets += 1;
      room[0].session.sets += 1;
      added = true;
      break;
    }
    if (added) continue;

    // Every session is full. Take the set from whatever has the most to spare
    // and let the next pass spend it: a week at capacity is a week that has to
    // choose, and a muscle already past its floor is what gives.
    if (!borrow(plan, totals, short.map((entry) => entry.muscle), perExercise)) return;
  }
}

/** What one movement may carry in a session this week. */
function exerciseCap(plan: Plan): number {
  return plan.deload ? DELOAD_SETS_PER_EXERCISE : MAX_SETS_PER_EXERCISE;
}

/**
 * Holds the week to its budget, whatever shape the sessions take.
 *
 * Sessions are allowed to differ in length; a week is not allowed to grow. The
 * set comes off the longest session, and within it off whichever movement's
 * muscles are furthest past where they are trying to get — so a week over
 * budget loses its fourteenth set of chest rather than its fourth of calves.
 */
function fitWeek(plan: Plan): void {
  const budget = plan.days * maxSetsPerSession(plan.days);
  for (let guard = 0; guard < 200; guard += 1) {
    const total = plan.sessions.reduce((sum, session) => sum + session.sets, 0);
    if (total <= budget) return;
    const totals = planVolume(plan);
    const spare = (exercise: PlannedExercise) => {
      const info = classifyExercise(exercise.exercise);
      const over = info.direct.map(
        (muscle) => ((totals.get(muscle)?.effective ?? 0) - weeklyAim(muscle)) / weeklyAim(muscle),
      );
      return over.length ? Math.min(...over) : 1;
    };
    const longest = [...plan.sessions].sort((a, b) => b.sets - a.sets)[0];
    const target = [...longest.exercises]
      .filter((entry) => entry.sets > 2)
      .sort((a, b) => spare(b) - spare(a))[0];
    if (!target) return;
    target.sets -= 1;
    longest.sets -= 1;
  }
}

/**
 * Spends the room the week still has.
 *
 * Topping up fills to the floors and stops, which can leave a session a set or
 * two under its cap. That is fine on its own and not fine across a block:
 * because what gets trimmed is not perfectly monotone in what was prescribed,
 * a third week could come out carrying less than the second, and a block that
 * goes backwards is not a block. So once the floors are met, whatever capacity
 * is left is spent — on the movement the session is built around first, and
 * never past any ceiling.
 */
function climb(plan: Plan, wanted: number): void {
  const cap = longestSession(plan.days);
  const muscleRoom = muscleCap(plan.days);

  for (let guard = 0; guard < 200; guard += 1) {
    if (plan.sessions.reduce((sum, session) => sum + session.sets, 0) >= wanted) return;
    const totals = planVolume(plan);

    const options = plan.sessions.flatMap((session) => {
      if (session.sets >= cap) return [];
      // What that session already gives each muscle, so nothing goes past what
      // one session can use.
      const here = new Map<Muscle, number>();
      for (const entry of session.exercises) {
        for (const muscle of classifyExercise(entry.exercise).direct) {
          here.set(muscle, (here.get(muscle) ?? 0) + entry.sets);
        }
      }
      return session.exercises
        .filter((exercise) => exercise.sets < exerciseCap(plan))
        .filter((exercise) => {
          const info = classifyExercise(exercise.exercise);
          return (
            info.direct.every(
              (muscle) =>
                (here.get(muscle) ?? 0) + 1 <= muscleRoom &&
                (totals.get(muscle)?.effective ?? 0) + 1 <= weeklyTargets[muscle].max,
            ) &&
            info.indirect.every(
              (muscle) => (totals.get(muscle)?.effective ?? 0) + INDIRECT_WEIGHT <= weeklyTargets[muscle].max,
            )
          );
        })
        .map((exercise) => ({ session, exercise }));
    });
    if (!options.length) return;

    // To whoever needs it most.
    //
    // This used to go to the compounds, on the reasoning that a set is worth
    // most on the lift a session is built around. That is true of one set and
    // false of a week: spending every spare set on rows and presses is how a
    // back ends up at fourteen while the calves sit on four. What a spare set
    // is worth is a question about the muscle it lands on, and the muscle it
    // is worth most to is the one furthest from where it is trying to get.
    const need = (exercise: PlannedExercise) => {
      const info = classifyExercise(exercise.exercise);
      const gaps = info.direct.map(
        (muscle) => (weeklyAim(muscle) - (totals.get(muscle)?.effective ?? 0)) / weeklyAim(muscle),
      );
      return gaps.length ? Math.max(...gaps) : -1;
    };
    options.sort(
      (a, b) => need(b.exercise) - need(a.exercise) || a.session.sets - b.session.sets || a.exercise.sets - b.exercise.sets,
    );
    options[0].exercise.sets += 1;
    options[0].session.sets += 1;
  }
}

/**
 * Frees one set for a muscle that is short, from a movement that can spare it.
 *
 * The donor has to sit in the same session as the movement that needs the set,
 * so the set actually lands rather than moving the crowding somewhere else —
 * which is also what stops this trading sets back and forth: every borrow
 * strictly reduces how far the week is from its floors.
 */
function borrow(plan: Plan, totals: Map<Muscle, PlannedVolume>, short: Muscle[], perExercise: number): boolean {
  const donors: Array<{ session: PlannedSession; exercise: PlannedExercise; slack: number }> = [];
  for (const session of plan.sessions) {
    const needs = session.exercises.some(
      (exercise) => short.includes(exercise.muscle) && exercise.sets < perExercise,
    );
    if (!needs) continue;
    for (const exercise of session.exercises) {
      if (short.includes(exercise.muscle) || exercise.sets <= 2) continue;
      // Only if nothing the movement trains drops below its own floor — either
      // the work floor or the direct one.
      const info = classifyExercise(exercise.exercise);
      const spare = [
        ...info.direct.flatMap((muscle) => [
          (totals.get(muscle)?.effective ?? 0) - 1 - weeklyTargets[muscle].min,
          (totals.get(muscle)?.direct ?? 0) - 1 - minimumDirect(muscle),
        ]),
        ...info.indirect.map(
          (muscle) => (totals.get(muscle)?.effective ?? 0) - INDIRECT_WEIGHT - weeklyTargets[muscle].min,
        ),
      ];
      if (!spare.length || spare.some((value) => value < 0)) continue;
      donors.push({ session, exercise, slack: Math.min(...spare) });
    }
  }
  if (!donors.length) return false;

  // The one with the most to spare gives.
  donors.sort((a, b) => b.slack - a.slack);
  const donor = donors[0];
  donor.exercise.sets -= 1;
  donor.session.sets -= 1;
  return true;
}

function trimOvershoot(plan: Plan, intended: Map<Muscle, number>): void {
  for (let pass = 0; pass < 40; pass += 1) {
    const totals = planVolume(plan);
    let trimmed = false;

    for (const [muscle, value] of totals) {
      // A quarter over what was intended is allowed. Trimming to the exact
      // number sets off a cascade: a back two sets over its intent should not
      // cost the pulldowns that put it there, when it is comfortably inside its
      // range either way.
      //
      // Two different things are being kept in bounds and they are measured
      // differently. What was intended is a prescription of direct sets, so it
      // is checked against direct sets. The ceiling on a muscle's week is a
      // ceiling on all its work, so it is checked against the combined measure
      // — otherwise a muscle could be handed twenty-five sets' worth of
      // pressing and rowing and nothing would notice.
      const allowance = Math.min(
        weeklyTargets[muscle].max,
        Math.max(weeklyTargets[muscle].min, Math.round((intended.get(muscle) ?? 0) * 1.25)),
      );
      // The ceiling is where the returns have gone; the aim is where the week
      // was pointed. A muscle a quarter past its aim is holding sets another
      // muscle is short of, and the ceiling is too far away to notice.
      const roof = Math.max(weeklyTargets[muscle].min, weeklyAim(muscle) * 1.25);
      if (value.direct <= allowance && value.effective <= Math.min(weeklyTargets[muscle].max, roof)) continue;

      const candidates = plan.sessions
        .flatMap((session) => session.exercises.map((exercise) => ({ session, exercise })))
        .filter(({ exercise }) => classifyExercise(exercise.exercise).direct.includes(muscle))
        // A trim corrects an overshoot; it must not create a shortfall. A row
        // cut to bring the rear delts down also takes sets off the back, and
        // dropping the back under its own minimum to tidy a neighbour is a
        // worse programme than leaving the neighbour a little high.
        .filter(({ exercise }) => {
          const info = classifyExercise(exercise.exercise);
          const cut = exercise.sets > 2 ? 1 : exercise.sets;
          return (
            info.direct.every(
              (other) =>
                (totals.get(other)?.effective ?? 0) - cut >= weeklyTargets[other].min &&
                (totals.get(other)?.direct ?? 0) - cut >= minimumDirect(other),
            ) &&
            info.indirect.every(
              (other) => (totals.get(other)?.effective ?? 0) - cut * INDIRECT_WEIGHT >= weeklyTargets[other].min,
            )
          );
        })
        .sort((a, b) => b.exercise.sets - a.exercise.sets);
      if (!candidates.length) continue;

      const target = candidates[0];
      if (target.exercise.sets > 2) {
        target.exercise.sets -= 1;
      } else if (candidates.length > 1) {
        // Already at the floor and not the last of its kind: it leaves.
        target.session.exercises = target.session.exercises.filter((entry) => entry !== target.exercise);
      } else {
        // The only direct work this muscle has in the week. Indirect credit from
        // other lifts is real but it is not a substitute — rows do something for
        // the rear delts and it is not what a face pull does — so two direct
        // sets stay and the muscle is allowed to sit over its intended number.
        continue;
      }
      target.session.sets = target.session.exercises.reduce((total, entry) => total + entry.sets, 0);
      trimmed = true;
      break;
    }

    if (!trimmed) return;
  }
}

/* --------------------------------------------------------------- export */

/** One session's exercises, the way Strong's routine builder takes them. */
function sessionLines(session: PlannedSession): string[] {
  return session.exercises.map(
    (exercise) =>
      `  ${exercise.exercise} — ${exercise.sets} × ${exercise.repRange}${
        exercise.assistanceLb !== null
          ? ` @ ${exercise.assistanceLb} lb assistance${exercise.stepUp ? " (less next time)" : ""}`
          : exercise.weightLb === null
          ? ""
          : ` @ ${exercise.weightLb} lb${exercise.stepUp ? " (up)" : exercise.stalled ? " (back off)" : ""}`
      }, rest ${exercise.restSeconds}s`,
  );
}

/** The rule the loads run on, said the way the week it belongs to needs it. */
function progressionNote(plan: Plan): string {
  return plan.deload
    ? "An easier week on purpose: same weights, fewer sets, nothing to failure."
    : "Hit the top of the rep range on every set, then the weight goes up.";
}

/** A single session as text — what you paste in on the way to the gym. */
export function sessionToText(plan: Plan, session: PlannedSession): string {
  const lines = [`${session.name} — ${weekLabel(plan)}`, "", ...sessionLines(session), ""];
  lines.push(progressionNote(plan));
  return lines.join("\n").trimEnd();
}

/** The plan as text laid out the way Strong's routine builder takes it. */
export function planToText(plan: Plan): string {
  const lines = [`${weekLabel(plan)} — ${plan.split}, ${plan.days} days`, ""];
  for (const session of plan.sessions) {
    lines.push(session.name);
    lines.push(...sessionLines(session));
    lines.push("");
  }
  if (plan.missing.length) {
    lines.push(
      `Not programmed: no recent Strong exercise trains ${plan.missing
        .map((muscle) => muscleLabels[muscle].toLowerCase())
        .join(", ")}.`,
    );
  }
  lines.push(progressionNote(plan));
  return lines.join("\n").trimEnd();
}
