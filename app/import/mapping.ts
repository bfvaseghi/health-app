import type { SleepSource } from "../health-model";
import type { Table } from "./csv";
import { normalizeHeader } from "./csv";

export type FieldKind = "date" | "time" | "duration" | "number" | "percent" | "weight" | "text";

export type ImportField =
  | "date"
  | "bedtime"
  | "wakeTime"
  | "durationHours"
  | "efficiencyPercent"
  | "deepHours"
  | "remHours"
  | "restingHeartRate"
  | "hrvMs"
  | "sleepQuality"
  | "steps"
  | "weightLb"
  | "bodyFatPercent"
  | "proteinG"
  | "caloriesKcal"
  | "note";

type FieldDefinition = {
  field: ImportField;
  label: string;
  kind: FieldKind;
  /** Where the value lands once converted. */
  target: "key" | "sleep" | "daily" | "both";
  /**
   * What to do when several rows share a date. A food log writes one row per
   * meal, so its numbers add up; a weight is simply the latest reading.
   */
  aggregate?: "sum" | "last";
  /** Normalized header text seen in real Oura, Whoop, and Apple exports. */
  aliases: string[];
};

export const importFields: FieldDefinition[] = [
  {
    field: "date",
    label: "Date",
    kind: "date",
    target: "key",
    aliases: ["date", "day", "summarydate", "calendardate", "cyclestarttime", "sleepday", "startdate", "start"],
  },
  {
    field: "bedtime",
    label: "Bedtime",
    kind: "time",
    target: "sleep",
    aliases: ["bedtimestart", "sleeponset", "bedtime", "sleepstart", "starttime", "asleepat", "inbedstart"],
  },
  {
    field: "wakeTime",
    label: "Wake time",
    kind: "time",
    target: "sleep",
    aliases: ["bedtimeend", "wakeonset", "waketime", "sleepend", "endtime", "wakeupat", "inbedend"],
  },
  {
    field: "durationHours",
    label: "Sleep duration",
    kind: "duration",
    target: "sleep",
    aliases: [
      "totalsleepduration",
      "asleepduration",
      "asleepdurationmin",
      "sleepduration",
      "totalsleeptime",
      "timeasleep",
      "durationhours",
      "totalsleep",
      "hoursofsleep",
      "asleeptime",
    ],
  },
  {
    field: "efficiencyPercent",
    label: "Sleep efficiency",
    kind: "percent",
    target: "sleep",
    aliases: ["sleepefficiency", "efficiency", "sleepefficiencypercent"],
  },
  {
    field: "deepHours",
    label: "Deep sleep",
    kind: "duration",
    target: "sleep",
    aliases: ["deepsleepduration", "deepsleepdurationmin", "deepsleeptime", "slowwavesleepduration", "deepsleep", "deepswsduration"],
  },
  {
    field: "remHours",
    label: "REM sleep",
    kind: "duration",
    target: "sleep",
    aliases: ["remsleepduration", "remsleepdurationmin", "remsleeptime", "remduration", "remsleep"],
  },
  {
    field: "restingHeartRate",
    label: "Resting heart rate",
    kind: "number",
    target: "both",
    aliases: [
      "restingheartrate",
      "lowestrestingheartrate",
      "restingheartratebpm",
      "lowestheartrate",
      "rhr",
      "averageheartrate",
    ],
  },
  {
    field: "hrvMs",
    label: "Heart rate variability",
    kind: "number",
    target: "both",
    aliases: ["averagehrv", "heartratevariability", "heartratevariabilityms", "hrv", "hrvms", "rmssd", "heartratevariabilityrmssd"],
  },
  {
    field: "sleepQuality",
    label: "Sleep quality (1–5)",
    kind: "number",
    target: "sleep",
    aliases: ["quality", "sleepquality"],
  },
  {
    field: "steps",
    label: "Steps",
    kind: "number",
    target: "daily",
    aggregate: "sum",
    aliases: ["steps", "stepcount", "totalsteps", "activitysteps"],
  },
  {
    field: "proteinG",
    label: "Protein",
    kind: "number",
    target: "daily",
    aggregate: "sum",
    aliases: ["protein", "proteing", "proteingrams", "proteinsg"],
  },
  {
    field: "caloriesKcal",
    label: "Calories",
    kind: "number",
    target: "daily",
    aggregate: "sum",
    aliases: ["calories", "energy", "kcal", "caloriesкcal", "caloriekcal"],
  },
  {
    field: "bodyFatPercent",
    label: "Body fat",
    kind: "percent",
    target: "daily",
    aliases: ["bodyfat", "bodyfatpercent", "bodyfatpercentage", "fatpercent", "bodyfatratio"],
  },
  {
    field: "weightLb",
    label: "Weight",
    kind: "weight",
    target: "daily",
    aliases: ["weight", "weightlb", "weightkg", "bodymass", "bodyweight"],
  },
  { field: "note", label: "Note", kind: "text", target: "daily", aliases: ["note", "notes", "comment", "journal"] },
];

const fieldByName = new Map(importFields.map((definition) => [definition.field, definition]));

export type ColumnMapping = {
  column: string;
  field: ImportField | "";
  /** "hours" | "minutes" | "seconds" for durations, "lb" | "kg" for weight. */
  unit?: string;
};

export function fieldDefinition(field: ImportField): FieldDefinition {
  return fieldByName.get(field)!;
}

/* ------------------------------------------------------------------ values */

export function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The date part of anything an export is likely to write. Timestamps are read
 * literally: an Apple record stamped `2026-08-24 07:15:32 -0700` happened on the
 * 24th wherever the phone was, and re-deriving that through UTC only moves it.
 */
export function toIsoDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  const isoLike = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text);
  if (isoLike) return buildDate(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));

  const usLike = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (usLike) return buildDate(Number(usLike[3]), Number(usLike[1]), Number(usLike[2]));

  return null;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The clock time inside a timestamp, or a bare time, as 24-hour HH:MM. */
export function toClock(value: string): string | null {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m\.?/i.exec(value) ?? /(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "p" && hours < 12) hours += 12;
  if (meridiem === "a" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Oura writes sleep in seconds, Whoop in minutes, a spreadsheet in hours, and
 * nobody agrees on a header. Believe the header when it says a unit, and fall
 * back to the magnitude, which separates the three cleanly for real durations.
 */
export function inferDurationUnit(header: string, samples: number[]): "hours" | "minutes" | "seconds" {
  const text = header.toLowerCase();
  if (/\bsec\b|\(s\)|second/.test(text)) return "seconds";
  if (/\bmin\b|\(m\)|minute/.test(text)) return "minutes";
  if (/\bhr\b|\(h\)|hour/.test(text)) return "hours";

  const middle = median(samples);
  if (middle === null) return "hours";
  if (middle > 1_000) return "seconds";
  if (middle > 45) return "minutes";
  return "hours";
}

export function weightUnitFromHeader(header: string): "lb" | "kg" | null {
  const text = header.toLowerCase();
  if (/\bkg\b|kilogram/.test(text)) return "kg";
  if (/\blb\b|\blbs\b|pound/.test(text)) return "lb";
  return null;
}

/**
 * Unlike a duration, a bare weight cannot be settled by its magnitude — 82 is a
 * plausible reading in either unit. Without a hint in the header this assumes
 * pounds and says so, rather than guessing and silently doubling someone.
 */
export function inferWeightUnit(header: string): "lb" | "kg" {
  return weightUnitFromHeader(header) ?? "lb";
}

/* ----------------------------------------------------------------- mapping */

function columnSamples(table: Table, index: number): number[] {
  return table.rows
    .slice(0, 200)
    .map((row) => toNumber(row[index] ?? ""))
    .filter((value): value is number => value !== null);
}

/**
 * Best guess at what each column holds. Exact alias matches win over partial
 * ones, and a field is only claimed once so a file with both "Bedtime Start"
 * and "Bedtime End" does not map both to the same thing.
 */
export function autoMap(table: Table): ColumnMapping[] {
  const claimed = new Set<ImportField>();
  const mapping: ColumnMapping[] = table.headers.map((column) => ({ column, field: "" }));

  const assign = (index: number, field: ImportField) => {
    claimed.add(field);
    const definition = fieldDefinition(field);
    const header = table.headers[index];
    const samples = columnSamples(table, index);
    mapping[index] = {
      column: header,
      field,
      unit:
        definition.kind === "duration"
          ? inferDurationUnit(header, samples)
          : definition.kind === "weight"
            ? inferWeightUnit(header)
            : undefined,
    };
  };

  for (const exact of [true, false]) {
    table.headers.forEach((header, index) => {
      if (mapping[index].field) return;
      const normalized = normalizeHeader(header);
      if (!normalized) return;
      for (const definition of importFields) {
        if (claimed.has(definition.field)) continue;
        const hit = exact
          ? definition.aliases.includes(normalized)
          : definition.aliases.some((alias) => alias.length > 3 && normalized.includes(alias));
        if (hit) {
          assign(index, definition.field);
          return;
        }
      }
    });
  }

  return mapping;
}

const sourceHints: Array<{ source: SleepSource; label: string; markers: string[] }> = [
  { source: "oura", label: "Oura", markers: ["oura", "bedtimestart", "sleepscore", "readinessscore"] },
  { source: "whoop", label: "Whoop", markers: ["whoop", "cyclestarttime", "sleeponset", "wakeonset", "recoveryscore"] },
  { source: "apple", label: "Apple Health", markers: ["apple", "healthexport", "healthautoexport", "hk"] },
];

export function detectSource(fileName: string, headers: string[]): { source: SleepSource; label: string } {
  const haystack = [normalizeHeader(fileName), ...headers.map(normalizeHeader)].join(" ");
  for (const hint of sourceHints) {
    if (hint.markers.some((marker) => haystack.includes(marker))) return { source: hint.source, label: hint.label };
  }
  return { source: "other", label: "This file" };
}

/* -------------------------------------------------------------- conversion */

export type ParsedRecords = {
  dailyEntries: Record<string, unknown>[];
  sleepEntries: Record<string, unknown>[];
  labResults: Record<string, unknown>[];
  workoutSets: Record<string, unknown>[];
  /** True only for a complete Strong export, which is the lifting source of record. */
  replaceWorkoutHistory: boolean;
  skipped: number;
  warnings: string[];
};

export function emptyRecords(): ParsedRecords {
  return {
    dailyEntries: [],
    sleepEntries: [],
    labResults: [],
    workoutSets: [],
    replaceWorkoutHistory: false,
    skipped: 0,
    warnings: [],
  };
}

function convert(kind: FieldKind, raw: string, unit: string | undefined): unknown {
  if (kind === "time") return toClock(raw);
  if (kind === "text") return raw.trim() || null;

  const value = toNumber(raw);
  if (value === null) return null;
  if (kind === "duration") {
    if (unit === "seconds") return Math.round((value / 3_600) * 100) / 100;
    if (unit === "minutes") return Math.round((value / 60) * 100) / 100;
    return Math.round(value * 100) / 100;
  }
  if (kind === "weight") return unit === "kg" ? Math.round(value * 2.204_62 * 10) / 10 : value;
  // A fraction and a percentage both appear in the wild; only one can be right.
  if (kind === "percent") return value > 0 && value <= 1 ? Math.round(value * 100) : Math.round(value);
  return value;
}

const sleepFields: ImportField[] = [
  "bedtime",
  "wakeTime",
  "durationHours",
  "efficiencyPercent",
  "deepHours",
  "remHours",
  "sleepQuality",
];

const dailyFields: ImportField[] = ["steps", "weightLb", "bodyFatPercent", "proteinG", "caloriesKcal", "note"];

/**
 * Turns a mapped table into records the health model can normalize. A night is
 * dated by the morning it ended, which is how Oura and Apple already file it and
 * what makes a Whoop cycle starting at 22:40 land on the right day.
 */
export function tableToRecords(table: Table, mapping: ColumnMapping[], source: SleepSource): ParsedRecords {
  const records = emptyRecords();
  const used = mapping.filter((column) => column.field);
  if (!used.some((column) => column.field === "date" || column.field === "wakeTime")) {
    records.warnings.push("No column is mapped to a date, so nothing can be imported from this file.");
    return records;
  }

  const bareWeight = used.find((column) => column.field === "weightLb" && !weightUnitFromHeader(column.column));
  if (bareWeight) {
    records.warnings.push(
      `“${bareWeight.column}” has no unit in the file, so it is being read as ${bareWeight.unit === "kg" ? "kilograms" : "pounds"}. Change it above if that is wrong.`,
    );
  }

  // A food log writes one row per meal. Daily values are therefore folded into
  // one record per date — added up where the field is a quantity, latest wins
  // where it is a reading.
  const daily = new Map<string, Record<string, unknown>>();
  let rowsPerDate = 0;

  for (const row of table.rows) {
    const values = new Map<ImportField, unknown>();
    const rawByField = new Map<ImportField, string>();

    mapping.forEach((column, index) => {
      if (!column.field) return;
      const raw = row[index] ?? "";
      if (raw.trim() === "") return;
      rawByField.set(column.field, raw);
      const converted = convert(fieldDefinition(column.field).kind, raw, column.unit);
      if (converted !== null) values.set(column.field, converted);
    });

    const wakeStamp = rawByField.get("wakeTime");
    const date = (wakeStamp ? toIsoDate(wakeStamp) : null) ?? toIsoDate(rawByField.get("date") ?? "");
    if (!date) {
      records.skipped += 1;
      continue;
    }

    const sleep: Record<string, unknown> = { date, source };
    let hasSleep = false;
    for (const field of sleepFields) {
      const value = values.get(field);
      if (value === undefined || value === null) continue;
      sleep[field === "sleepQuality" ? "quality" : field] = value;
      hasSleep = true;
    }

    const existing = daily.get(date);
    if (existing) rowsPerDate += 1;
    const record: Record<string, unknown> = existing ?? { date };
    let hasDaily = Boolean(existing);

    for (const field of dailyFields) {
      const value = values.get(field);
      if (value === undefined || value === null) continue;
      const definition = fieldDefinition(field);
      record[field] =
        definition.aggregate === "sum" && typeof value === "number" && typeof record[field] === "number"
          ? Math.round(((record[field] as number) + value) * 100) / 100
          : value;
      hasDaily = true;
    }

    // Heart measures come off a ring or a band overnight, so they belong to the
    // night; they are also the body trend, so keep them on the day as well.
    for (const field of ["restingHeartRate", "hrvMs"] as ImportField[]) {
      const value = values.get(field);
      if (value === undefined || value === null) continue;
      record[field] = value;
      hasDaily = true;
      if (hasSleep) sleep[field] = value;
    }

    if (hasSleep) records.sleepEntries.push(sleep);
    if (hasDaily) daily.set(date, record);
    if (!hasSleep && !hasDaily) records.skipped += 1;
  }

  records.dailyEntries.push(...daily.values());
  if (rowsPerDate) {
    records.warnings.push(
      `${rowsPerDate.toLocaleString("en-US")} extra ${rowsPerDate === 1 ? "row shared a date" : "rows shared a date"} with another; quantities were added together.`,
    );
  }
  return records;
}
