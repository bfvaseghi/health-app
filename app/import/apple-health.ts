import type { ParsedRecords } from "./mapping";
import { emptyRecords } from "./mapping";

/**
 * Apple's export is one flat list of <Record> elements and can run to hundreds
 * of megabytes, so it is read as a stream and only the handful of types this app
 * shows are kept. Timestamps are read literally — a record stamped
 * `2026-08-24 07:15:32 -0700` happened at 07:15 where the phone was, and pushing
 * it through UTC would only move it to another day.
 */

const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const QUANTITIES: Record<string, "steps" | "weight" | "restingHeartRate" | "hrv"> = {
  HKQuantityTypeIdentifierStepCount: "steps",
  HKQuantityTypeIdentifierBodyMass: "weight",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
};

type Stamp = { date: string; clock: string; epoch: number };

export function parseAppleStamp(value: string): Stamp | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}):?(\d{2})?/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offsetHours, offsetMinutes = "00"] = match;
  const epoch = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetHours}:${offsetMinutes}`,
  );
  if (!Number.isFinite(epoch)) return null;
  return { date: `${year}-${month}-${day}`, clock: `${hour}:${minute}`, epoch };
}

type Interval = {
  start: number;
  end: number;
  startClock: string;
  endClock: string;
  /** The literal local date in Apple's timestamp, used after the whole session is assembled. */
  endDate: string;
  stage: "asleep" | "inBed" | "deep" | "rem";
};

type Accumulator = {
  sleep: Interval[];
  steps: Map<string, number>;
  weight: Map<string, { value: number; epoch: number }>;
  restingHeartRate: Map<string, number[]>;
  hrv: Map<string, number[]>;
};

function sleepStage(value: string): Interval["stage"] | null {
  if (value.endsWith("InBed")) return "inBed";
  if (value.endsWith("AsleepDeep")) return "deep";
  if (value.endsWith("AsleepREM")) return "rem";
  if (value.includes("Asleep")) return "asleep";
  return null;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function handleRecord(attributes: Map<string, string>, accumulator: Accumulator) {
  const type = attributes.get("type");
  if (!type) return;

  const start = parseAppleStamp(attributes.get("startDate") ?? "");
  const end = parseAppleStamp(attributes.get("endDate") ?? "");
  if (!start || !end) return;

  if (type === SLEEP) {
    const stage = sleepStage(attributes.get("value") ?? "");
    if (!stage || end.epoch <= start.epoch) return;
    accumulator.sleep.push({
      start: start.epoch,
      end: end.epoch,
      startClock: start.clock,
      endClock: end.clock,
      endDate: end.date,
      stage,
    });
    return;
  }

  const quantity = QUANTITIES[type];
  if (!quantity) return;
  const value = Number(attributes.get("value"));
  if (!Number.isFinite(value)) return;
  const unit = attributes.get("unit") ?? "";

  if (quantity === "steps") {
    accumulator.steps.set(start.date, (accumulator.steps.get(start.date) ?? 0) + value);
  } else if (quantity === "weight") {
    const pounds = /kg/i.test(unit) ? value * 2.204_62 : value;
    const current = accumulator.weight.get(start.date);
    if (!current || start.epoch >= current.epoch) {
      accumulator.weight.set(start.date, { value: Math.round(pounds * 10) / 10, epoch: start.epoch });
    }
  } else if (quantity === "restingHeartRate") {
    push(accumulator.restingHeartRate, start.date, value);
  } else {
    // SDNN is normally milliseconds, but some writers use seconds.
    push(accumulator.hrv, start.date, /^s$/i.test(unit) ? value * 1_000 : value);
  }
}

const SESSION_GAP_MS = 3 * 60 * 60 * 1_000;

/** Splits all intervals by elapsed time. Doing this before assigning a date keeps pre-midnight stages with their morning. */
function splitSessions(intervals: Interval[]): Interval[][] {
  const ordered = [...intervals].sort((a, b) => a.start - b.start);
  const sessions: Interval[][] = [];
  let current: Interval[] = [];
  let reach = 0;

  for (const interval of ordered) {
    if (current.length && interval.start - reach > SESSION_GAP_MS) {
      sessions.push(current);
      current = [];
    }
    current.push(interval);
    reach = Math.max(reach, interval.end);
  }
  if (current.length) sessions.push(current);
  return sessions;
}

/** Duration covered by at least one interval. Apple can export overlapping aggregate and staged samples. */
function unionMs(intervals: Interval[]): number {
  const ordered = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  let total = 0;
  let start = 0;
  let reach = 0;

  for (const interval of ordered) {
    if (reach <= start || interval.start > reach) {
      if (reach > start) total += reach - start;
      start = interval.start;
      reach = interval.end;
    } else {
      reach = Math.max(reach, interval.end);
    }
  }
  if (reach > start) total += reach - start;
  return total;
}

function sessionDuration(session: Interval[]): number {
  const asleep = unionMs(session.filter((entry) => entry.stage !== "inBed"));
  return asleep || unionMs(session.filter((entry) => entry.stage === "inBed"));
}

function hours(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function summarize(accumulator: Accumulator): ParsedRecords {
  const records = emptyRecords();
  let inBedOnly = 0;
  const byDate = new Map<string, Interval[][]>();

  for (const session of splitSessions(accumulator.sleep)) {
    const last = session.reduce((latest, entry) => (entry.end > latest.end ? entry : latest));
    const nights = byDate.get(last.endDate);
    if (nights) nights.push(session);
    else byDate.set(last.endDate, [session]);
  }

  for (const [date, sessions] of byDate) {
    // One sleep record per morning. A separated afternoon nap must not inflate it.
    const session = sessions.sort((a, b) => sessionDuration(b) - sessionDuration(a))[0] ?? [];
    if (!session.length) continue;

    const total = (stage: Interval["stage"] | "any") =>
      unionMs(session.filter((entry) => (stage === "any" ? entry.stage !== "inBed" : entry.stage === stage)));

    const asleepMs = total("any");
    const inBedMs = total("inBed");
    const durationMs = asleepMs || inBedMs;
    // Under an hour it is a nap or a stray reading, not a night.
    if (durationMs < 3_600_000) {
      records.skipped += 1;
      continue;
    }
    if (!asleepMs) inBedOnly += 1;

    const first = session.reduce((earliest, entry) => (entry.start < earliest.start ? entry : earliest));
    const last = session.reduce((latest, entry) => (entry.end > latest.end ? entry : latest));
    const deepMs = total("deep");
    const remMs = total("rem");

    records.sleepEntries.push({
      date,
      source: "apple",
      bedtime: first.startClock,
      wakeTime: last.endClock,
      durationHours: hours(durationMs),
      deepHours: deepMs ? hours(deepMs) : null,
      remHours: remMs ? hours(remMs) : null,
      efficiencyPercent: asleepMs && inBedMs ? Math.min(100, Math.round((asleepMs / inBedMs) * 100)) : null,
    });
  }

  const dates = new Set([
    ...accumulator.steps.keys(),
    ...accumulator.weight.keys(),
    ...accumulator.restingHeartRate.keys(),
    ...accumulator.hrv.keys(),
  ]);
  const mean = (values: number[] | undefined) =>
    values?.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;

  for (const date of dates) {
    const steps = accumulator.steps.get(date);
    records.dailyEntries.push({
      date,
      steps: steps === undefined ? null : Math.round(steps),
      weightLb: accumulator.weight.get(date)?.value ?? null,
      restingHeartRate: mean(accumulator.restingHeartRate.get(date)),
      hrvMs: mean(accumulator.hrv.get(date)),
    });
  }

  if (inBedOnly) {
    records.warnings.push(
      `${inBedOnly} ${inBedOnly === 1 ? "night has" : "nights have"} time in bed but no asleep samples, so time in bed was used as the duration.`,
    );
  }
  return records;
}

/** Index just past the tag's closing angle bracket, ignoring one inside a quoted value. */
function tagEnd(text: string, from: number): number {
  let quoted = false;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    else if (char === ">" && !quoted) return index + 1;
  }
  return -1;
}

const ATTRIBUTE = /([A-Za-z]+)="([^"]*)"/g;

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  ATTRIBUTE.lastIndex = 0;
  let match = ATTRIBUTE.exec(tag);
  while (match) {
    found.set(match[1], match[2]);
    match = ATTRIBUTE.exec(tag);
  }
  return found;
}

export async function parseAppleHealthXml(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (charactersRead: number) => void,
): Promise<ParsedRecords> {
  const accumulator: Accumulator = {
    sleep: [],
    steps: new Map(),
    weight: new Map(),
    restingHeartRate: new Map(),
    hrv: new Map(),
  };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let read = 0;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    buffer += text;
    read += value.byteLength;

    let cursor = 0;
    for (;;) {
      const start = buffer.indexOf("<Record", cursor);
      if (start === -1) {
        cursor = Math.max(cursor, buffer.length - 8);
        break;
      }
      const end = tagEnd(buffer, start);
      if (end === -1) {
        cursor = start;
        break;
      }
      handleRecord(attributes(buffer.slice(start, end)), accumulator);
      cursor = end;
    }

    buffer = buffer.slice(cursor);
    onProgress?.(read);
  }

  return summarize(accumulator);
}
