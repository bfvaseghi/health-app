import type { HealthState, SleepSource } from "../health-model";
import { mergeRecords } from "../health-model";
import type { Table } from "./csv";
import { toTable } from "./csv";
import { parseAppleHealthXml } from "./apple-health";
import type { ColumnMapping, ParsedRecords } from "./mapping";
import { autoMap, detectSource, emptyRecords, tableToRecords, toIsoDate, toNumber } from "./mapping";
import { isStrongTable, strongToRecords } from "./strong";
import { ZipError, openZipEntry, readZipDirectory, readZipEntryText } from "./zip";

export type ImportItem = {
  id: string;
  fileName: string;
  /** The file inside an archive, when the drop was a zip. */
  entryName?: string;
  label: string;
  source: SleepSource;
  include: boolean;
} & (
  | { kind: "table"; table: Table; mapping: ColumnMapping[] }
  | { kind: "records"; records: ParsedRecords }
  | { kind: "error"; message: string }
);

export type ImportPreview = {
  nights: number;
  days: number;
  labs: number;
  sets: number;
  workouts: number;
  firstDate: string | null;
  lastDate: string | null;
  skipped: number;
  warnings: string[];
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `import-${counter}`;
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

function tableItem(fileName: string, entryName: string | undefined, text: string): ImportItem {
  const table = toTable(text);
  if (!table) {
    return {
      id: nextId(),
      fileName,
      entryName,
      label: "Unreadable",
      source: "other",
      include: false,
      kind: "error",
      message: "This file has no rows under its header.",
    };
  }

  // Strong writes one row per set, not one per day, so its shape is fixed and
  // there is nothing useful to map by hand.
  if (isStrongTable(table)) {
    return {
      id: nextId(),
      fileName,
      entryName,
      label: "Strong workouts",
      source: "other",
      include: true,
      kind: "records",
      records: strongToRecords(table),
    };
  }

  const detected = detectSource(entryName ?? fileName, table.headers);
  return {
    id: nextId(),
    fileName,
    entryName,
    label: `${detected.label} table`,
    source: detected.source,
    include: true,
    kind: "table",
    table,
    mapping: autoMap(table),
  };
}

/* --------------------------------------------------------------- json shapes */

type AutoDailyField = "steps" | "weightLb" | "bodyFatPercent" | "restingHeartRate" | "hrvMs";

const AUTO_EXPORT_METRICS: Record<string, AutoDailyField> = {
  step_count: "steps",
  weight_body_mass: "weightLb",
  body_fat: "bodyFatPercent",
  body_fat_percent: "bodyFatPercent",
  body_fat_percentage: "bodyFatPercent",
  resting_heart_rate: "restingHeartRate",
  heart_rate_variability: "hrvMs",
};

export function isSupportedAutoExportMetric(name: string): boolean {
  return name === "sleep_analysis" || Object.hasOwn(AUTO_EXPORT_METRICS, name);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return toNumber(value);
  return null;
}

/**
 * Health Auto Export writes `{ data: { metrics: [{ name, units, data: [...] }] } }`
 * and is the least painful way to get Apple Health out of a phone on a schedule,
 * so it is worth reading directly.
 */
export function parseAutoExport(value: unknown): ParsedRecords | null {
  const metrics = asRecord(asRecord(value).data).metrics;
  if (!Array.isArray(metrics)) return null;

  const records = emptyRecords();
  const daily = new Map<string, Record<string, unknown>>();
  const samples = new Map<string, { restingHeartRate: number[]; hrvMs: number[] }>();
  const unknown: string[] = [];

  for (const raw of metrics) {
    const metric = asRecord(raw);
    const name = typeof metric.name === "string" ? metric.name : "";
    const units = typeof metric.units === "string" ? metric.units : "";
    const points = Array.isArray(metric.data) ? metric.data : [];
    const asHours = (value: number | null) => {
      if (value === null) return null;
      if (/sec/i.test(units)) return value / 3_600;
      if (/min/i.test(units)) return value / 60;
      return value;
    };

    if (name === "sleep_analysis") {
      for (const point of points) {
        const entry = asRecord(point);
        const date = toIsoDate(String(entry.sleepEnd ?? entry.date ?? ""));
        if (!date) {
          records.skipped += 1;
          continue;
        }
        const asleep = asHours(numberOf(entry.asleep) ?? numberOf(entry.totalSleep));
        const inBed = asHours(numberOf(entry.inBed));
        const duration = asleep ?? inBed;
        if (duration === null) {
          records.skipped += 1;
          continue;
        }
        const clock = (stamp: unknown) => {
          const text = String(stamp ?? "");
          const match = /(\d{2}):(\d{2})/.exec(text);
          return match ? `${match[1]}:${match[2]}` : undefined;
        };
        records.sleepEntries.push({
          date,
          source: "apple",
          durationHours: Math.round(duration * 100) / 100,
          bedtime: clock(entry.sleepStart),
          wakeTime: clock(entry.sleepEnd),
          deepHours: asHours(numberOf(entry.deep)) ?? undefined,
          remHours: asHours(numberOf(entry.rem)) ?? undefined,
        });
      }
      continue;
    }

    const field = AUTO_EXPORT_METRICS[name];
    if (!field) {
      if (points.length) unknown.push(name);
      continue;
    }

    for (const point of points) {
      const entry = asRecord(point);
      const date = toIsoDate(String(entry.date ?? ""));
      const quantity = numberOf(entry.qty);
      if (!date || quantity === null) {
        records.skipped += 1;
        continue;
      }
      const value =
        field === "weightLb" && /kg/i.test(units)
          ? Math.round(quantity * 2.204_62 * 10) / 10
          : field === "bodyFatPercent" && quantity > 0 && quantity <= 1
            ? Math.round(quantity * 10_000) / 100
            : Math.round(quantity * 100) / 100;
      const current = daily.get(date) ?? { date };
      if (field === "steps") {
        current.steps = (numberOf(current.steps) ?? 0) + value;
      } else if (field === "weightLb" || field === "bodyFatPercent") {
        // Auto Export writes points in chronological order. The latest body
        // reading is the day's value, rather than an average of weigh-ins.
        current[field] = value;
      } else {
        const day = samples.get(date) ?? { restingHeartRate: [], hrvMs: [] };
        day[field].push(value);
        samples.set(date, day);
      }
      daily.set(date, current);
    }
  }

  for (const [date, values] of samples) {
    const current = daily.get(date) ?? { date };
    for (const field of ["restingHeartRate", "hrvMs"] as const) {
      const found = values[field];
      if (found.length) current[field] = Math.round((found.reduce((sum, value) => sum + value, 0) / found.length) * 100) / 100;
    }
    daily.set(date, current);
  }

  records.dailyEntries.push(...daily.values());
  if (unknown.length) {
    records.warnings.push(
      `Ignored ${unknown.length} metric ${unknown.length === 1 ? "type" : "types"} this app does not track: ${unknown.slice(0, 4).join(", ")}${unknown.length > 4 ? "…" : ""}.`,
    );
  }
  return records;
}

/** An array of flat objects becomes a table, so the column mapper can handle anything else. */
function tableFromObjects(rows: unknown[]): Table | null {
  const objects = rows.map(asRecord).filter((row) => Object.keys(row).length);
  if (!objects.length) return null;
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))];
  return {
    headers,
    rows: objects.map((row) =>
      headers.map((header) => {
        const value = row[header];
        return value === null || value === undefined ? "" : String(value);
      }),
    ),
  };
}

function jsonItem(fileName: string, entryName: string | undefined, text: string): ImportItem {
  const base = { id: nextId(), fileName, entryName, include: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...base, label: "Unreadable", source: "other", include: false, kind: "error", message: "This file is not valid JSON." };
  }

  const record = asRecord(parsed);
  if (record.kind === "bardia-health-sync") {
    return {
      ...base,
      label: "Baseline sync file",
      source: "other",
      include: false,
      kind: "error",
      message: "Use Restore a backup in Data & goals so every record and goal is restored together.",
    };
  }

  if (Array.isArray(record.dailyEntries) || Array.isArray(record.sleepEntries)) {
    return {
      ...base,
      label: "Baseline backup",
      source: "other",
      include: false,
      kind: "error",
      message: "Use Restore a backup in Data & goals so every record and goal is restored together.",
    };
  }

  const autoExport = parseAutoExport(parsed);
  if (autoExport && (autoExport.dailyEntries.length || autoExport.sleepEntries.length)) {
    return { ...base, label: "Health Auto Export", source: "apple", kind: "records", records: autoExport };
  }

  const rows = Array.isArray(parsed) ? parsed : Array.isArray(record.data) ? record.data : [];
  const table = tableFromObjects(rows);
  if (table) {
    const detected = detectSource(entryName ?? fileName, table.headers);
    return {
      ...base,
      label: `${detected.label} records`,
      source: detected.source,
      kind: "table",
      table,
      mapping: autoMap(table),
    };
  }

  return {
    ...base,
    label: "Unrecognized",
    source: "other",
    include: false,
    kind: "error",
    message: "Nothing in this file looks like daily or nightly records.",
  };
}

/* ------------------------------------------------------------------ reading */

const APPLE_XML = /export\.xml$/i;
const IGNORED_IN_ZIP = /(export_cda|workout-routes|electrocardiograms)/i;

async function readOne(
  file: File,
  name: string,
  entryName: string | undefined,
  text: () => Promise<string>,
): Promise<ImportItem> {
  const extension = extensionOf(name);
  if (extension === "csv" || extension === "tsv" || extension === "txt") return tableItem(file.name, entryName, await text());
  if (extension === "json") return jsonItem(file.name, entryName, await text());
  return {
    id: nextId(),
    fileName: file.name,
    entryName,
    label: "Skipped",
    source: "other",
    include: false,
    kind: "error",
    message: `${name} is not a CSV, JSON, or Apple Health export.`,
  };
}

async function appleItem(
  file: File,
  entryName: string | undefined,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (fraction: number) => void,
  size?: number,
): Promise<ImportItem> {
  const records = await parseAppleHealthXml(stream, (read) => {
    if (size) onProgress?.(Math.min(1, read / size));
  });
  return {
    id: nextId(),
    fileName: file.name,
    entryName,
    label: "Apple Health export",
    source: "apple",
    include: true,
    kind: "records",
    records,
  };
}

/**
 * Turns whatever was dropped into a list of things that can be previewed. Zips
 * are opened in place, so the file Apple or Whoop emailed can be used as-is.
 */
export async function inspectFile(file: File, onProgress?: (fraction: number) => void): Promise<ImportItem[]> {
  const extension = extensionOf(file.name);

  try {
    if (extension === "zip") {
      const entries = await readZipDirectory(file);
      const wanted = entries.filter(
        (entry) => !IGNORED_IN_ZIP.test(entry.name) && /\.(csv|json|xml)$/i.test(entry.name),
      );
      if (!wanted.length) throw new ZipError("This archive has no CSV, JSON, or Apple Health export inside it.");

      const items: ImportItem[] = [];
      for (const entry of wanted) {
        if (APPLE_XML.test(entry.name)) {
          items.push(
            await appleItem(file, entry.name, await openZipEntry(file, entry), onProgress, entry.uncompressedSize),
          );
        } else if (/\.xml$/i.test(entry.name)) {
          continue;
        } else {
          items.push(await readOne(file, entry.name, entry.name, () => readZipEntryText(file, entry)));
        }
      }
      return items;
    }

    if (extension === "xml") {
      return [await appleItem(file, undefined, file.stream(), onProgress, file.size)];
    }

    return [await readOne(file, file.name, undefined, () => file.text())];
  } catch (error) {
    return [
      {
        id: nextId(),
        fileName: file.name,
        label: "Could not be read",
        source: "other",
        include: false,
        kind: "error",
        message: error instanceof Error ? error.message : "This file could not be read.",
      },
    ];
  }
}

export function itemRecords(item: ImportItem): ParsedRecords {
  if (item.kind === "records") return item.records;
  if (item.kind === "table") return tableToRecords(item.table, item.mapping, item.source);
  return emptyRecords();
}

export function previewRecords(records: ParsedRecords): ImportPreview {
  const dates = [...records.dailyEntries, ...records.sleepEntries, ...records.workoutSets]
    .map((entry) => (typeof entry.date === "string" ? entry.date : ""))
    .filter(Boolean)
    .sort();
  return {
    nights: records.sleepEntries.length,
    days: records.dailyEntries.length,
    labs: records.labResults.length,
    sets: records.workoutSets.length,
    workouts: new Set(
      records.workoutSets.map((entry) => (typeof entry.startedAt === "string" ? entry.startedAt : "")),
    ).size,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    skipped: records.skipped,
    warnings: records.warnings,
  };
}

export function combineRecords(items: ImportItem[]): ParsedRecords {
  const combined = emptyRecords();
  for (const item of items) {
    if (!item.include || item.kind === "error") continue;
    const records = itemRecords(item);
    combined.dailyEntries.push(...records.dailyEntries);
    combined.sleepEntries.push(...records.sleepEntries);
    combined.labResults.push(...records.labResults);
    combined.workoutSets.push(...records.workoutSets);
    combined.replaceWorkoutHistory ||= records.replaceWorkoutHistory;
    combined.skipped += records.skipped;
    combined.warnings.push(...records.warnings);
  }
  return combined;
}

export function applyImport(state: HealthState, items: ImportItem[]): HealthState {
  const records = combineRecords(items);
  return mergeRecords(state, records);
}
