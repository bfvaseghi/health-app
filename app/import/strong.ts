import type { Table } from "./csv";
import { normalizeHeader } from "./csv";
import type { ParsedRecords } from "./mapping";
import { emptyRecords, toIsoDate, toNumber } from "./mapping";

/**
 * Strong exports one row per set rather than one row per day, so it gets its own
 * reader rather than the column mapper. Its shape:
 *
 *   Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE
 *
 * `Date` is the session's start and repeats on every row of that session, which
 * is what keeps two workouts on one day apart. `Set Order` is a number for a
 * working set and the literal "Rest Timer" for the rows between them.
 *
 * A rest row is not a set, but it is not noise either: its Seconds column is the
 * rest timer that was set for the set above it, which is the only thing in the
 * export that says anything about pacing. It is attached to that set rather than
 * dropped.
 */

const REQUIRED = ["exercisename", "setorder"];

/** Strong writes a session length as "1h 4m" or "47m". */
function parseDuration(text: string): number | null {
  if (!text) return null;
  const hours = /(\d+)\s*h/i.exec(text);
  const minutes = /(\d+)\s*m/i.exec(text);
  if (!hours && !minutes) return null;
  return Number(hours?.[1] ?? 0) * 3_600 + Number(minutes?.[1] ?? 0) * 60;
}

export function isStrongTable(table: Table): boolean {
  const headers = table.headers.map(normalizeHeader);
  return REQUIRED.every((name) => headers.includes(name));
}

function columnIndex(table: Table, ...names: string[]): number {
  const headers = table.headers.map(normalizeHeader);
  for (const name of names) {
    const index = headers.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

export function strongToRecords(table: Table): ParsedRecords {
  const records = emptyRecords();
  const at = {
    date: columnIndex(table, "date"),
    workout: columnIndex(table, "workoutname"),
    exercise: columnIndex(table, "exercisename"),
    order: columnIndex(table, "setorder"),
    duration: columnIndex(table, "duration", "workoutduration"),
    weight: columnIndex(table, "weight", "weightlb", "weightkg"),
    weightUnit: columnIndex(table, "weightunit"),
    reps: columnIndex(table, "reps"),
    distance: columnIndex(table, "distance"),
    seconds: columnIndex(table, "seconds"),
    rpe: columnIndex(table, "rpe"),
  };

  if (at.date === -1 || at.exercise === -1) {
    records.warnings.push("This looks like a Strong export but has no date or exercise column.");
    return records;
  }

  const weightHeader = table.headers[at.weight] ?? "";
  const headerKilos = normalizeHeader(weightHeader) === "weightkg" || /\bkg\b|kilogram/i.test(weightHeader);
  let rest = 0;
  let invalidOrder = 0;
  let repeatedOrder = 0;
  const usedOrders = new Map<string, Set<number>>();
  let previous: { set: Record<string, unknown>; stamp: string; exercise: string } | null = null;

  for (const row of table.rows) {
    const cell = (index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

    // A rest row's seconds belong only to the immediately preceding set of the
    // same exercise in the same session. Blank or tagged set orders are not rest.
    const order = cell(at.order);
    if (/^rest\s*timer$/i.test(order)) {
      rest += 1;
      const seconds = toNumber(cell(at.seconds));
      const stamp = cell(at.date);
      const exercise = cell(at.exercise);
      if (previous && previous.stamp === stamp && previous.exercise === exercise && seconds !== null) {
        previous.set.restSeconds = seconds;
      }
      previous = null;
      continue;
    }

    const parsedSetNumber = toNumber(order);
    if (parsedSetNumber === null) {
      invalidOrder += 1;
      records.skipped += 1;
      previous = null;
      continue;
    }

    const stamp = cell(at.date);
    const date = toIsoDate(stamp);
    const exercise = cell(at.exercise);
    if (!date || !exercise) {
      records.skipped += 1;
      previous = null;
      continue;
    }

    // Strong can restart Set Order when the same exercise appears in two blocks
    // of one workout (common around supersets). The canonical record key includes
    // this number, so leaving the duplicate intact would silently replace a set.
    const orderKey = `${stamp}\u0000${exercise}`;
    const orders = usedOrders.get(orderKey) ?? new Set<number>();
    let setNumber = Math.round(parsedSetNumber);
    if (orders.has(setNumber)) {
      repeatedOrder += 1;
      setNumber = orders.size ? Math.max(...orders) + 1 : setNumber;
      while (orders.has(setNumber)) setNumber += 1;
    }
    orders.add(setNumber);
    usedOrders.set(orderKey, orders);

    const weight = toNumber(cell(at.weight));
    const unit = cell(at.weightUnit);
    const kilos = unit ? /\bkg\b|kilogram/i.test(unit) : headerKilos;
    const set: Record<string, unknown> = {
      date,
      // The full timestamp keeps a morning and an evening session apart.
      startedAt: stamp,
      workoutName: cell(at.workout),
      exercise,
      setNumber,
      weightLb: weight === null || weight === 0 ? null : kilos ? Math.round(weight * 2.204_62 * 10) / 10 : weight,
      reps: toNumber(cell(at.reps)),
      distance: toNumber(cell(at.distance)) || null,
      seconds: toNumber(cell(at.seconds)) || null,
      rpe: toNumber(cell(at.rpe)),
      restSeconds: null,
      durationSeconds: parseDuration(cell(at.duration)),
    };
    records.workoutSets.push(set);
    previous = { set, stamp, exercise };
  }

  if (rest) {
    records.warnings.push(`Skipped ${rest.toLocaleString("en-US")} rest-timer ${rest === 1 ? "row" : "rows"}.`);
  }
  if (invalidOrder) {
    records.warnings.push(
      `Skipped ${invalidOrder.toLocaleString("en-US")} ${invalidOrder === 1 ? "set" : "sets"} with no numeric set order.`,
    );
  }
  if (repeatedOrder) {
    records.warnings.push(
      `Renumbered ${repeatedOrder.toLocaleString("en-US")} repeated Strong ${repeatedOrder === 1 ? "set" : "sets"} so none are overwritten.`,
    );
  }
  return records;
}
