import type { HealthState, ImportRecords } from "./health-model";
import {
  dailyEntriesCsv,
  goalsCsv,
  labResultsCsv,
  medicationDosesCsv,
  medicationsCsv,
  mergeRecords,
  normalizeHealthState,
  progressPhotosCsv,
  sleepEntriesCsv,
  therapyNotesCsv,
  thoughtJournalCsv,
  workoutSetsCsv,
} from "./health-model";
import { normalizeAppleHealthSyncPayload } from "./apple-health-sync";
import { openZipEntry, readZipDirectory, readZipEntryText } from "./import/zip";
import { loadPhoto, savePhoto } from "./ui/photo-store";

export const SOURCE_REPOSITORY = "https://github.com/bfvaseghi/health-app";
export const SOURCE_ARCHIVE = `${SOURCE_REPOSITORY}/archive/refs/heads/main.zip`;

type BackupEnvelope = {
  format: "baseline-backup";
  backupVersion: 3;
  createdAt: string;
  source: { repository: string; archive: string };
  state: HealthState;
};

export type BackupSummary = {
  createdAt: string | null;
  firstDate: string | null;
  lastDate: string | null;
  days: number;
  nights: number;
  workouts: number;
  sets: number;
  labs: number;
  medications: number;
  therapyNotes: number;
  thoughts: number;
  photos: number;
};

export type ParsedBackup = {
  state: HealthState;
  summary: BackupSummary;
  archive: File | null;
  photoEntries: Array<{ id: string; entryName: string }>;
};

type ZipFile = { name: string; data: Uint8Array };

function envelope(state: HealthState): BackupEnvelope {
  return {
    format: "baseline-backup",
    backupVersion: 3,
    createdAt: new Date().toISOString(),
    source: { repository: SOURCE_REPOSITORY, archive: SOURCE_ARCHIVE },
    state,
  };
}

function dateRange(state: HealthState): [string | null, string | null] {
  const dates = [
    ...state.dailyEntries.map((entry) => entry.date),
    ...state.sleepEntries.map((entry) => entry.date),
    ...state.labResults.map((entry) => entry.date),
    ...state.workoutSets.map((entry) => entry.date),
    ...state.medicationDoses.map((entry) => entry.date),
    ...state.therapyNotes.map((entry) => entry.date),
    ...state.thoughtJournal.map((entry) => entry.date),
    ...state.progressPhotos.map((entry) => entry.date),
  ].sort();
  return [dates[0] ?? null, dates.at(-1) ?? null];
}

export function backupSummary(state: HealthState, createdAt: string | null = null): BackupSummary {
  const [firstDate, lastDate] = dateRange(state);
  return {
    createdAt,
    firstDate,
    lastDate,
    days: state.dailyEntries.length,
    nights: state.sleepEntries.length,
    workouts: new Set(state.workoutSets.map((entry) => entry.startedAt)).size,
    sets: state.workoutSets.length,
    labs: state.labResults.length,
    medications: state.medications.length,
    therapyNotes: state.therapyNotes.length,
    thoughts: state.thoughtJournal.length,
    photos: state.progressPhotos.length,
  };
}

function textFile(name: string, contents: string): ZipFile {
  return { name, data: new TextEncoder().encode(contents) };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function storedZip(files: ZipFile[]): Blob {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const checksum = crc32(file.data);
    const local = new ArrayBuffer(30 + name.length);
    const localView = new DataView(local);
    localView.setUint32(0, 0x0403_4b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, name.length, true);
    new Uint8Array(local, 30).set(name);
    localParts.push(local, file.data);

    const central = new ArrayBuffer(46 + name.length);
    const centralView = new DataView(central);
    centralView.setUint32(0, 0x0201_4b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    new Uint8Array(central, 46).set(name);
    centralParts.push(central);
    offset += local.byteLength + file.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + (part as ArrayBuffer).byteLength, 0);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0, 0x0605_4b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function photoExtension(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function createBaselineArchive(
  state: HealthState,
  automaticApple: Partial<ImportRecords> | null = null,
): Promise<Blob> {
  const backup = envelope(state);
  const automatic = normalizeAppleHealthSyncPayload(automaticApple);
  const combined = mergeRecords(state, automatic);
  const manifest = {
    product: "Baseline",
    format: "baseline-portable-archive",
    archiveVersion: 1,
    createdAt: backup.createdAt,
    summary: backupSummary(combined, backup.createdAt),
    editableSummary: backupSummary(state, backup.createdAt),
    automaticAppleSummary: {
      days: automatic.dailyEntries.length,
      nights: automatic.sleepEntries.length,
    },
    source: backup.source,
  };
  const files: ZipFile[] = [
    textFile("README.txt", [
      "BASELINE PORTABLE ARCHIVE",
      "",
      "baseline-backup.json restores the editable record in Baseline.",
      "automatic/apple-health.json preserves the read-only automatic Apple lane separately.",
      "The csv folder contains human-readable tables, including automatic Apple values.",
      "The photos folder contains locally available progress-photo images.",
      "source.json points to the complete app source and a one-click source download.",
      "",
      "This archive may contain sensitive health information. Store it securely.",
    ].join("\n")),
    textFile("manifest.json", JSON.stringify(manifest, null, 2)),
    textFile("source.json", JSON.stringify(backup.source, null, 2)),
    textFile("baseline-backup.json", JSON.stringify(backup, null, 2)),
    textFile("automatic/apple-health.json", JSON.stringify(automatic, null, 2)),
    textFile("csv/daily.csv", dailyEntriesCsv(combined.dailyEntries)),
    textFile("csv/sleep.csv", sleepEntriesCsv(combined.sleepEntries)),
    textFile("csv/apple-daily.csv", dailyEntriesCsv(normalizeHealthState({ dailyEntries: automatic.dailyEntries }).dailyEntries)),
    textFile("csv/apple-sleep.csv", sleepEntriesCsv(normalizeHealthState({ sleepEntries: automatic.sleepEntries }).sleepEntries)),
    textFile("csv/workouts.csv", workoutSetsCsv(state.workoutSets)),
    textFile("csv/labs.csv", labResultsCsv(state.labResults)),
    textFile("csv/medications.csv", medicationsCsv(state.medications)),
    textFile("csv/medication-doses.csv", medicationDosesCsv(state)),
    textFile("csv/therapy-notes.csv", therapyNotesCsv(state.therapyNotes)),
    textFile("csv/thought-journal.csv", thoughtJournalCsv(state.thoughtJournal)),
    textFile("csv/progress-photos.csv", progressPhotosCsv(state.progressPhotos)),
    textFile("csv/goals.csv", goalsCsv(state.goals)),
  ];

  const photoMap: Array<{ id: string; file: string; mimeType: string }> = [];
  for (const [index, photo] of state.progressPhotos.entries()) {
    const blob = await loadPhoto(photo.id);
    if (!blob) continue;
    const file = `photos/photo-${String(index + 1).padStart(4, "0")}.${photoExtension(blob.type)}`;
    photoMap.push({ id: photo.id, file, mimeType: blob.type || "image/jpeg" });
    files.push({ name: file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  files.push(textFile("photos/map.json", JSON.stringify(photoMap, null, 2)));
  return storedZip(files);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonBackup(value: unknown): { state: HealthState; createdAt: string | null } {
  const record = asRecord(value);
  if (record.format === "baseline-backup" && (record.backupVersion === 2 || record.backupVersion === 3) && record.state) {
    return {
      state: normalizeHealthState(record.state),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    };
  }
  const recognized = record.version === 1 && [
    "dailyEntries", "sleepEntries", "labResults", "workoutSets", "medications", "goals",
  ].some((key) => key in record);
  if (!recognized) throw new Error("This is not a Baseline backup.");
  return { state: normalizeHealthState(record), createdAt: typeof record.updatedAt === "string" ? record.updatedAt : null };
}

export async function parseBackupFile(file: File): Promise<ParsedBackup> {
  if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
    const entries = await readZipDirectory(file);
    const backupEntry = entries.find((entry) => entry.name === "baseline-backup.json");
    if (!backupEntry) throw new Error("This archive does not contain a Baseline backup.");
    const parsed = parseJsonBackup(JSON.parse(await readZipEntryText(file, backupEntry)));
    const known = new Set(parsed.state.progressPhotos.map((photo) => photo.id));
    const photoMapEntry = entries.find((entry) => entry.name === "photos/map.json");
    let photoEntries: Array<{ id: string; entryName: string }> = [];
    if (photoMapEntry) {
      const raw = JSON.parse(await readZipEntryText(file, photoMapEntry));
      const available = new Set(entries.map((entry) => entry.name));
      photoEntries = Array.isArray(raw)
        ? raw.flatMap((value) => {
            const record = asRecord(value);
            const id = typeof record.id === "string" ? record.id : "";
            const entryName = typeof record.file === "string" ? record.file : "";
            return known.has(id) && /^photos\/photo-\d{4}\.(?:jpe?g|png|webp)$/i.test(entryName) && available.has(entryName)
              ? [{ id, entryName }]
              : [];
          })
        : [];
    } else {
      // Version 1 archives used the photo id as the filename.
      photoEntries = entries
        .filter((entry) => /^photos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(entry.name))
        .map((entry) => ({ id: entry.name.replace(/^photos\//, "").replace(/\.[^.]+$/, ""), entryName: entry.name }))
        .filter((entry) => known.has(entry.id));
    }
    return {
      state: parsed.state,
      summary: backupSummary(parsed.state, parsed.createdAt),
      archive: file,
      photoEntries,
    };
  }
  const parsed = parseJsonBackup(JSON.parse(await file.text()));
  return {
    state: parsed.state,
    summary: backupSummary(parsed.state, parsed.createdAt),
    archive: null,
    photoEntries: [],
  };
}

export async function restoreArchivePhotos(parsed: ParsedBackup): Promise<number> {
  if (!parsed.archive) return 0;
  const entries = await readZipDirectory(parsed.archive);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  let restored = 0;
  for (const photo of parsed.photoEntries) {
    const entry = byName.get(photo.entryName);
    if (!entry) continue;
    const blob = await new Response(await openZipEntry(parsed.archive, entry)).blob();
    await savePhoto(photo.id, blob);
    restored += 1;
  }
  return restored;
}
