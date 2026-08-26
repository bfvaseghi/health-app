import assert from "node:assert/strict";
import test from "node:test";

import { emptyHealthState, mergeRecords, preferredSleepEntries } from "../app/health-model.ts";
import { parseCsv, toTable } from "../app/import/csv.ts";
import {
  autoMap,
  detectSource,
  inferDurationUnit,
  inferWeightUnit,
  tableToRecords,
  weightUnitFromHeader,
  toClock,
  toIsoDate,
} from "../app/import/mapping.ts";
import { parseAppleHealthXml, parseAppleStamp } from "../app/import/apple-health.ts";
import { readZipDirectory, readZipEntryText } from "../app/import/zip.ts";
import { applyImport, combineRecords, inspectFile, itemRecords, previewRecords } from "../app/import/index.ts";
import {
  mergeAppleHealthSyncPayload,
  normalizeAppleHealthSyncPayload,
  parseAppleHealthSync,
} from "../app/apple-health-sync.ts";

/* Shapes taken from what each vendor's own export looks like. Values are synthetic. */

const OURA_CSV = `date,Total Sleep Duration,Total Bedtime,REM Sleep Duration,Deep Sleep Duration,Sleep Efficiency,Bedtime Start,Bedtime End,Average HRV,Lowest Resting Heart Rate,Steps,Sleep Score
2026-08-22,26100,28800,5400,4500,91,2026-08-21T23:12:00-07:00,2026-08-22T07:07:00-07:00,48,54,8231,79
2026-08-23,23400,26100,4800,3600,89,2026-08-23T00:04:00-07:00,2026-08-23T07:19:00-07:00,44,56,6120,74
2026-08-24,,,,,,,,,,9004,`;

const WHOOP_CSV = `Cycle start time,Cycle end time,Sleep onset,Wake onset,"Asleep duration (min)","In bed duration (min)","Deep (SWS) duration (min)","REM duration (min)",Sleep efficiency %,"Resting heart rate (bpm)","Heart rate variability (ms)"
2026-08-21 22:40:00,2026-08-22 22:39:00,2026-08-21 23:20:00,2026-08-22 07:02:00,436,470,88,102,92,53,61
2026-08-22 22:44:00,2026-08-23 22:43:00,2026-08-22 23:58:00,2026-08-23 06:31:00,362,395,71,84,91,55,58`;

const APPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisInBed" startDate="2026-08-21 23:05:00 -0700" endDate="2026-08-22 07:10:00 -0700"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-08-21 23:20:00 -0700" endDate="2026-08-22 03:20:00 -0700"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-08-22 03:20:00 -0700" endDate="2026-08-22 04:50:00 -0700"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepREM" startDate="2026-08-22 04:50:00 -0700" endDate="2026-08-22 07:05:00 -0700"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-08-22 14:00:00 -0700" endDate="2026-08-22 14:35:00 -0700"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-08-22 08:00:00 -0700" endDate="2026-08-22 09:00:00 -0700" value="2200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="2026-08-22 18:00:00 -0700" endDate="2026-08-22 19:00:00 -0700" value="3100"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" startDate="2026-08-22 07:30:00 -0700" endDate="2026-08-22 07:30:00 -0700" value="80"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" unit="count/min" startDate="2026-08-22 07:30:00 -0700" endDate="2026-08-22 07:30:00 -0700" value="56"/>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" unit="ms" startDate="2026-08-22 07:30:00 -0700" endDate="2026-08-22 07:30:00 -0700" value="47" device="&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch&gt;"/>
 <Record type="HKQuantityTypeIdentifierDietaryWater" unit="mL" startDate="2026-08-22 07:30:00 -0700" endDate="2026-08-22 07:30:00 -0700" value="500"/>
</HealthData>`;

function fileOf(name, text) {
  return new File([text], name, { type: "text/plain" });
}

test("the csv reader survives quotes, embedded newlines, and ragged rows", () => {
  const rows = parseCsv('a,b,c\r\n1,"two, still two","line\nbreak"\n2,,\n');
  assert.deepEqual(rows[0], ["a", "b", "c"]);
  assert.deepEqual(rows[1], ["1", "two, still two", "line\nbreak"]);
  assert.deepEqual(rows[2], ["2", "", ""]);

  const table = toTable("x,y\n1\n");
  assert.deepEqual(table.headers, ["x", "y"]);
  assert.deepEqual(table.rows, [["1", ""]]);
  assert.equal(toTable("only,a,header"), null);
});

test("the csv reader detects tab and semicolon export variants", () => {
  assert.deepEqual(parseCsv("date\tsteps\n2026-08-25\t9000\n"), [
    ["date", "steps"],
    ["2026-08-25", "9000"],
  ]);
  assert.deepEqual(parseCsv('date;note;steps\n2026-08-25;"easy, steady";9000\n'), [
    ["date", "note", "steps"],
    ["2026-08-25", "easy, steady", "9000"],
  ]);
});

test("units are read from the header first and from the magnitude second", () => {
  assert.equal(inferDurationUnit("Asleep duration (min)", [436, 362]), "minutes");
  assert.equal(inferDurationUnit("Total Sleep Duration", [26100, 23400]), "seconds");
  assert.equal(inferDurationUnit("Sleep", [7.5, 8.1]), "hours");
  assert.equal(inferDurationUnit("Sleep", [455, 470]), "minutes");
  // 82 is a believable reading in either unit, so a bare header stays pounds and warns.
  assert.equal(inferWeightUnit("Weight"), "lb");
  assert.equal(inferWeightUnit("Weight (kg)"), "kg");
  assert.equal(inferWeightUnit("Body mass (lb)"), "lb");
  assert.equal(weightUnitFromHeader("Weight"), null);
});

test("dates and clock times are read literally, never through a timezone", () => {
  assert.equal(toIsoDate("2026-08-24T23:12:00-07:00"), "2026-08-24");
  assert.equal(toIsoDate("2026-08-24 07:15:32 -0700"), "2026-08-24");
  assert.equal(toIsoDate("08/24/2026"), "2026-08-24");
  assert.equal(toIsoDate("2026/08/24 22:47"), "2026-08-24");
  assert.equal(toIsoDate("2026-02-31"), null);
  assert.equal(toIsoDate("not a date"), null);

  assert.equal(toClock("2026-08-24T23:12:00-07:00"), "23:12");
  assert.equal(toClock("11:05 PM"), "23:05");
  assert.equal(toClock("12:30 am"), "00:30");
  assert.equal(toClock("nothing"), null);
});

test("an Oura trends export maps itself, in seconds, keyed by its own date", () => {
  const table = toTable(OURA_CSV);
  const detected = detectSource("oura_trends_2026-08-24.csv", table.headers);
  assert.equal(detected.source, "oura");

  const mapping = autoMap(table);
  const mapped = Object.fromEntries(mapping.filter((column) => column.field).map((column) => [column.column, column.field]));
  assert.equal(mapped["Total Sleep Duration"], "durationHours");
  assert.equal(mapped["Bedtime Start"], "bedtime");
  assert.equal(mapped["Bedtime End"], "wakeTime");
  assert.equal(mapped["Average HRV"], "hrvMs");
  assert.equal(mapped["Lowest Resting Heart Rate"], "restingHeartRate");
  assert.equal(mapped["Steps"], "steps");
  // A 0-100 sleep score is not a 1-5 quality rating, so it stays unmapped.
  assert.equal(mapped["Sleep Score"], undefined);
  assert.equal(mapping.find((column) => column.column === "Total Sleep Duration").unit, "seconds");

  const records = tableToRecords(table, mapping, detected.source);
  assert.equal(records.sleepEntries.length, 2);
  const [first] = records.sleepEntries;
  assert.equal(first.date, "2026-08-22");
  assert.equal(first.durationHours, 7.25);
  assert.equal(first.bedtime, "23:12");
  assert.equal(first.wakeTime, "07:07");
  assert.equal(first.deepHours, 1.25);
  assert.equal(first.efficiencyPercent, 91);
  assert.equal(first.hrvMs, 48);
  assert.equal(records.dailyEntries.length, 3);
  assert.deepEqual(records.dailyEntries.at(-1), { date: "2026-08-24", steps: 9004 });
  assert.equal(records.skipped, 0);
});

test("a Whoop cycle is filed under the morning it ended, in minutes", () => {
  const table = toTable(WHOOP_CSV);
  const detected = detectSource("physiological_cycles.csv", table.headers);
  assert.equal(detected.source, "whoop");

  const records = tableToRecords(table, autoMap(table), detected.source);
  const dates = records.sleepEntries.map((entry) => entry.date);
  // The cycle starts on the 21st at 22:40; the night belongs to the 22nd.
  assert.deepEqual(dates, ["2026-08-22", "2026-08-23"]);
  const [first] = records.sleepEntries;
  assert.equal(first.durationHours, 7.27);
  assert.equal(first.bedtime, "23:20");
  assert.equal(first.wakeTime, "07:02");
  assert.equal(first.deepHours, 1.47);
  assert.equal(first.remHours, 1.7);
  assert.equal(first.restingHeartRate, 53);
});

test("Health Auto Export aggregates intraday samples by metric and converts sleep units", async () => {
  const payload = {
    data: {
      metrics: [
        { name: "step_count", units: "count", data: [
          { date: "2026-08-25 09:00:00 -0400", qty: 1_000 },
          { date: "2026-08-25 18:00:00 -0400", qty: 1_500 },
        ] },
        { name: "resting_heart_rate", units: "count/min", data: [
          { date: "2026-08-25 09:00:00 -0400", qty: 50 },
          { date: "2026-08-25 18:00:00 -0400", qty: 70 },
        ] },
        { name: "sleep_analysis", units: "min", data: [{
          sleepStart: "2026-08-24 22:30:00 -0400",
          sleepEnd: "2026-08-25 06:30:00 -0400",
          asleep: 450,
          deep: 75,
          rem: 120,
        }] },
      ],
    },
  };
  const [item] = await inspectFile(fileOf("auto-export.json", JSON.stringify(payload)));
  const records = itemRecords(item);
  assert.equal(records.dailyEntries[0].steps, 2_500);
  assert.equal(records.dailyEntries[0].restingHeartRate, 60);
  assert.equal(records.sleepEntries[0].durationHours, 7.5);
  assert.equal(records.sleepEntries[0].deepHours, 1.25);
  assert.equal(records.sleepEntries[0].remHours, 2);
});

test("an Apple export yields one night per morning, ignoring naps and untracked types", async () => {
  assert.deepEqual(parseAppleStamp("2026-08-22 07:10:00 -0700"), {
    date: "2026-08-22",
    clock: "07:10",
    epoch: Date.parse("2026-08-22T07:10:00-07:00"),
  });
  assert.equal(parseAppleStamp("nope"), null);

  const records = await parseAppleHealthXml(new Blob([APPLE_XML]).stream());
  assert.equal(records.sleepEntries.length, 1);
  const [night] = records.sleepEntries;
  assert.equal(night.date, "2026-08-22");
  assert.equal(night.source, "apple");
  // 4h core + 1.5h deep + 2.25h REM. The 35-minute afternoon nap is a separate
  // session and does not join the night.
  assert.equal(night.durationHours, 7.75);
  assert.equal(night.deepHours, 1.5);
  assert.equal(night.remHours, 2.25);
  assert.equal(night.bedtime, "23:05");
  assert.equal(night.wakeTime, "07:10");
  assert.equal(night.efficiencyPercent, 96);

  assert.equal(records.dailyEntries.length, 1);
  const [day] = records.dailyEntries;
  assert.equal(day.date, "2026-08-22");
  assert.equal(day.steps, 5300);
  assert.equal(day.weightLb, 176.4);
  assert.equal(day.restingHeartRate, 56);
  assert.equal(day.hrvMs, 47);
});

test("Apple sleep is sessionized across midnight and overlapping summaries count once", async () => {
  const xml = `<HealthData locale="en_US">
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisInBed" startDate="2026-08-24 22:30:00 -0400" endDate="2026-08-25 06:30:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleep" startDate="2026-08-24 22:45:00 -0400" endDate="2026-08-25 06:15:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-08-24 22:45:00 -0400" endDate="2026-08-24 23:45:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-08-24 23:45:00 -0400" endDate="2026-08-25 01:00:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-08-25 01:00:00 -0400" endDate="2026-08-25 03:00:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepREM" startDate="2026-08-25 03:00:00 -0400" endDate="2026-08-25 05:00:00 -0400"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-08-25 05:00:00 -0400" endDate="2026-08-25 06:15:00 -0400"/>
</HealthData>`;

  const records = await parseAppleHealthXml(new Blob([xml]).stream());
  assert.equal(records.sleepEntries.length, 1, "pre-midnight stages are not a second night");
  assert.deepEqual(records.sleepEntries[0], {
    date: "2026-08-25",
    source: "apple",
    bedtime: "22:30",
    wakeTime: "06:30",
    durationHours: 7.5,
    deepHours: 1.25,
    remHours: 2,
    efficiencyPercent: 94,
  });
});

test("a record split across stream chunks is still read once and whole", async () => {
  const bytes = new TextEncoder().encode(APPLE_XML);
  const chunked = new ReadableStream({
    start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
      controller.close();
    },
  });
  const records = await parseAppleHealthXml(chunked);
  assert.equal(records.sleepEntries.length, 1);
  assert.equal(records.sleepEntries[0].durationHours, 7.75);
  assert.equal(records.dailyEntries[0].steps, 5300);
});

async function zipOf(files) {
  // Minimal writer, only used to prove the reader. Everything is stored, not deflated.
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (data) => {
    let crc = 0xffffffff;
    for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, 0, true);
    local.setUint32(14, crc32(data), true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, 0, true);
    entry.setUint32(16, crc32(data), true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const directory = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, directory, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

test("a zip is opened in place, one entry at a time", async () => {
  const blob = await zipOf({ "apple_health_export/export.xml": APPLE_XML, "sleeps.csv": WHOOP_CSV });
  const entries = await readZipDirectory(blob);
  assert.deepEqual(entries.map((entry) => entry.name), ["apple_health_export/export.xml", "sleeps.csv"]);
  assert.equal(await readZipEntryText(blob, entries[1]), WHOOP_CSV);
});

test("dropping a zip produces one previewable item per file inside it", async () => {
  const blob = await zipOf({ "apple_health_export/export.xml": APPLE_XML, "sleeps.csv": WHOOP_CSV });
  const file = new File([blob], "export.zip");
  const items = await inspectFile(file);
  assert.deepEqual(items.map((item) => item.label), ["Apple Health export", "Whoop table"]);

  const preview = previewRecords(combineRecords(items));
  assert.equal(preview.nights, 3);
  assert.equal(preview.firstDate, "2026-08-22");
  assert.equal(preview.lastDate, "2026-08-23");
});

test("a file that is not an export explains itself instead of failing silently", async () => {
  const [item] = await inspectFile(fileOf("notes.json", "{ not json"));
  assert.equal(item.kind, "error");
  assert.equal(item.include, false);
  assert.match(item.message, /not valid JSON/);

  const [zip] = await inspectFile(new File([new Blob(["nothing here"])], "broken.zip"));
  assert.equal(zip.kind, "error");
  assert.match(zip.message, /not a readable zip/);
});

test("importing merges by night and source without blanking what is already recorded", async () => {
  const state = mergeRecords(emptyHealthState(new Date("2026-08-24T12:00:00Z")), {
    dailyEntries: [{ date: "2026-08-22", medicationTaken: true, weightLb: 181 }],
  });
  assert.equal(state.dailyEntries[0].medicationTaken, true);

  const items = await inspectFile(fileOf("oura_trends.csv", OURA_CSV));
  const merged = applyImport(state, items);

  const day = merged.dailyEntries.find((entry) => entry.date === "2026-08-22");
  assert.equal(day.steps, 8231, "steps arrived from the import");
  assert.equal(day.medicationTaken, true, "medication survived the import");
  assert.equal(day.weightLb, 181, "weight the file did not carry survived");

  // A second source for the same night is kept beside the first, not on top of it.
  const withWhoop = applyImport(merged, await inspectFile(fileOf("whoop_cycles.csv", WHOOP_CSV)));
  const nights = withWhoop.sleepEntries.filter((entry) => entry.date === "2026-08-22");
  assert.deepEqual(nights.map((entry) => entry.source).sort(), ["oura", "whoop"]);
  assert.equal(preferredSleepEntries(withWhoop.sleepEntries).find((entry) => entry.date === "2026-08-22").source, "oura");
});

test("re-importing the same file changes nothing", async () => {
  const once = applyImport(emptyHealthState(new Date("2026-08-24T12:00:00Z")), await inspectFile(fileOf("oura.csv", OURA_CSV)));
  const twice = applyImport(once, await inspectFile(fileOf("oura.csv", OURA_CSV)));
  assert.deepEqual(
    { daily: twice.dailyEntries, sleep: twice.sleepEntries },
    { daily: once.dailyEntries, sleep: once.sleepEntries },
  );
});

test("a weight column with no unit in its header says which unit it assumed", () => {
  const table = toTable("date,Weight\n2026-08-22,181");
  const records = tableToRecords(table, autoMap(table), "other");
  assert.equal(records.dailyEntries[0].weightLb, 181);
  assert.match(records.warnings[0], /no unit in the file, so it is being read as pounds/);
});

test("an unmapped date column is reported rather than importing nothing quietly", () => {
  const table = toTable("something,else\n1,2");
  const records = tableToRecords(table, autoMap(table), "other");
  assert.equal(records.sleepEntries.length, 0);
  assert.match(records.warnings[0], /No column is mapped to a date/);
});

test("Health Auto Export JSON is read as Apple data", async () => {
  const payload = JSON.stringify({
    data: {
      metrics: [
        { name: "step_count", units: "count", data: [{ date: "2026-08-22 00:00:00 -0700", qty: 8231 }] },
        { name: "weight_body_mass", units: "kg", data: [{ date: "2026-08-22 07:00:00 -0700", qty: 80 }] },
        {
          name: "sleep_analysis",
          units: "hr",
          data: [
            {
              sleepStart: "2026-08-21 23:12:00 -0700",
              sleepEnd: "2026-08-22 07:07:00 -0700",
              asleep: 7.25,
              inBed: 7.9,
              deep: 1.25,
              rem: 1.5,
            },
          ],
        },
        { name: "vo2_max", units: "ml", data: [{ date: "2026-08-22 00:00:00 -0700", qty: 44 }] },
      ],
    },
  });

  const [item] = await inspectFile(fileOf("HealthAutoExport.json", payload));
  assert.equal(item.label, "Health Auto Export");
  const records = itemRecords(item);
  assert.deepEqual(records.sleepEntries[0], {
    date: "2026-08-22",
    source: "apple",
    durationHours: 7.25,
    bedtime: "23:12",
    wakeTime: "07:07",
    deepHours: 1.25,
    remHours: 1.5,
  });
  assert.deepEqual(records.dailyEntries[0], { date: "2026-08-22", steps: 8231, weightLb: 176.4 });
  assert.match(records.warnings[0], /vo2_max/);
});

test("Apple sync accepts body fat and partial wellness days but isolates workouts and clinical metrics", () => {
  const parsed = parseAppleHealthSync({
    data: {
      metrics: [
        {
          name: "step_count",
          units: "count",
          data: [{ date: "2026-08-25 18:00:00 -0400", qty: 7_250 }],
        },
        {
          name: "body_fat_percentage",
          units: "%",
          data: [{ date: "2026-08-25 07:30:00 -0400", qty: 0.184 }],
        },
        {
          name: "sleep_analysis",
          units: "min",
          data: [{
            sleepStart: "2026-08-24 23:20:00 -0400",
            sleepEnd: "2026-08-25 06:50:00 -0400",
            asleep: 420,
          }],
        },
        {
          name: "workouts",
          units: "count",
          data: [{ date: "2026-08-25 12:00:00 -0400", qty: 1, exercise: "Synthetic Squat" }],
        },
        {
          name: "blood_glucose",
          units: "mg/dL",
          data: [{ date: "2026-08-25 08:00:00 -0400", qty: 91 }],
        },
      ],
    },
    workoutSets: [{ date: "2026-08-25", exercise: "Synthetic Squat", reps: 8 }],
    labResults: [{ date: "2026-08-25", name: "Synthetic lab", value: 91 }],
  });

  assert.ok(parsed);
  assert.deepEqual(parsed.payload.dailyEntries, [{ date: "2026-08-25", steps: 7_250, bodyFatPercent: 18.4 }]);
  assert.deepEqual(parsed.payload.sleepEntries, [{
    date: "2026-08-25",
    source: "apple",
    bedtime: "23:20",
    wakeTime: "06:50",
    durationHours: 7,
  }]);
  assert.equal(parsed.ignoredMetricTypes, 2);
  assert.equal("workoutSets" in parsed.payload, false);
  assert.equal("labResults" in parsed.payload, false);
});

test("Apple sync replays are idempotent and a partial day cannot erase earlier fields", () => {
  const existing = normalizeAppleHealthSyncPayload({
    dailyEntries: [{
      date: "2026-08-25",
      steps: 6_000,
      weightLb: 181.2,
      bodyFatPercent: 18.6,
      note: "must not enter sync storage",
    }],
    sleepEntries: [{
      date: "2026-08-25",
      source: "whoop",
      durationHours: 6.8,
      deepHours: 1.1,
      note: "must not enter sync storage",
    }],
    workoutSets: [{ date: "2026-08-25", exercise: "Synthetic Row" }],
  });
  assert.deepEqual(existing, {
    dailyEntries: [{ date: "2026-08-25", steps: 6_000, weightLb: 181.2, bodyFatPercent: 18.6 }],
    sleepEntries: [{ date: "2026-08-25", source: "apple", durationHours: 6.8, deepHours: 1.1 }],
  });

  const first = mergeAppleHealthSyncPayload(existing, {
    dailyEntries: [{ date: "2026-08-25", steps: 7_250 }],
    sleepEntries: [{ date: "2026-08-25", source: "apple", durationHours: 7.1 }],
  });
  assert.deepEqual(first.payload.dailyEntries, [{
    date: "2026-08-25",
    steps: 7_250,
    weightLb: 181.2,
    bodyFatPercent: 18.6,
  }]);
  assert.deepEqual(first.payload.sleepEntries, [{
    date: "2026-08-25",
    source: "apple",
    durationHours: 7.1,
    deepHours: 1.1,
  }]);
  assert.equal(first.changedDays, 1);
  assert.equal(first.changedNights, 1);

  const replay = mergeAppleHealthSyncPayload(first.payload, {
    dailyEntries: [{ date: "2026-08-25", steps: 7_250 }],
    sleepEntries: [{ date: "2026-08-25", source: "apple", durationHours: 7.1 }],
  });
  assert.deepEqual(replay.payload, first.payload);
  assert.equal(replay.changedDays, 0);
  assert.equal(replay.changedNights, 0);
});

/* ---------------------------------------------------------------- lifting */

import { readFileSync } from "node:fs";
import { isStrongTable, strongToRecords } from "../app/import/strong.ts";
import {
  buildExerciseSummaries,
  buildWorkoutSessions,
  estimateOneRepMax,
  recentPersonalRecords,
  weeklyVolume,
} from "../app/health-model.ts";

const STRONG = readFileSync(new URL("./fixtures/strong-sample.csv", import.meta.url), "utf8");

test("a Strong export is recognized and its rest rows are not sets", () => {
  const table = toTable(STRONG);
  assert.equal(isStrongTable(table), true);
  assert.equal(isStrongTable(toTable("date,steps\n2026-01-01,900")), false);

  const records = strongToRecords(table);
  assert.equal(records.workoutSets.length, 30, "only working sets");
  assert.equal(records.dailyEntries.length, 0, "a lifting log is not a daily record");
  assert.match(records.warnings[0], /Skipped 28 rest-timer rows/);

  const [first] = records.workoutSets;
  assert.equal(first.date, "2026-04-14");
  assert.equal(first.startedAt, "2026-04-14 01:36:45");
  assert.equal(first.workoutName, "Evening Workout");
  assert.equal(first.exercise, "Chest Press (Machine)");
  assert.equal(first.setNumber, 1);
  assert.equal(first.weightLb, 180);
  assert.equal(first.reps, 9);

  // Two sessions on different days stay separate.
  assert.equal(new Set(records.workoutSets.map((entry) => entry.startedAt)).size, 2);
  // A bodyweight movement records reps with no load rather than a zero weight.
  const knee = records.workoutSets.find((entry) => entry.exercise.startsWith("Knee Raise"));
  assert.equal(knee.weightLb, null);
  assert.equal(knee.reps, 30);
});

test("Strong reads per-row units and only attaches a rest timer to its own set", () => {
  const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps,RPE,Distance,Distance Unit,Seconds,Notes,Workout Notes,Workout Duration
2026-08-25 10:00:00,Push,Bench Press (Barbell),1,100,kg,8,8,0,km,0,,,1h 10m
2026-08-25 10:00:00,Push,Bench Press (Barbell),Rest Timer,0,kg,0,,0,km,120,,,1h 10m
2026-08-25 10:00:00,Push,Bench Press (Barbell),2,225,lb,7,9,0,mi,0,,,1h 10m
2026-08-25 18:00:00,Legs,Bench Press (Barbell),Rest Timer,0,lb,0,,0,mi,90,,,45m
2026-08-25 18:00:00,Legs,Squat (Barbell),,315,lb,5,8,0,mi,0,,,45m`;
  const records = strongToRecords(toTable(csv));

  assert.equal(records.workoutSets.length, 2);
  assert.equal(records.workoutSets[0].weightLb, 220.5);
  assert.equal(records.workoutSets[0].durationSeconds, 4200);
  assert.equal(records.workoutSets[0].restSeconds, 120);
  assert.equal(records.workoutSets[1].weightLb, 225);
  assert.equal(records.workoutSets[1].restSeconds, null, "another session cannot rewrite this set's rest");
  assert.equal(records.skipped, 1, "a blank set order is invalid, not a rest row");
  assert.match(records.warnings.join(" "), /no numeric set order/);
});

test("Strong preserves an exercise whose set order restarts later in one session", () => {
  const csv = `Date,Workout Name,Exercise Name,Set Order,Weight,Reps
2026-08-25 10:00:00,Upper,Bench Press (Barbell),1,185,10
2026-08-25 10:00:00,Upper,Row (Cable),1,150,10
2026-08-25 10:00:00,Upper,Bench Press (Barbell),1,185,9`;
  const records = strongToRecords(toTable(csv));
  const state = mergeRecords(emptyHealthState(new Date("2026-08-25T12:00:00Z")), records);

  assert.equal(state.workoutSets.length, 3, "the restarted bench set is not overwritten by the first");
  assert.deepEqual(
    state.workoutSets.filter((set) => set.exercise === "Bench Press (Barbell)").map((set) => set.setNumber),
    [1, 2],
  );
  assert.match(records.warnings.join(" "), /Renumbered 1 repeated Strong set/);
});

test("a Strong file imports through the same dialog as everything else", async () => {
  const [item] = await inspectFile(fileOf("strong_workouts.csv", STRONG));
  assert.equal(item.label, "Strong workouts");
  assert.equal(item.kind, "records");

  const preview = previewRecords(itemRecords(item));
  assert.equal(preview.sets, 30);
  assert.equal(preview.workouts, 2);
  assert.equal(preview.firstDate, "2026-04-14");

  const state = applyImport(emptyHealthState(new Date("2026-08-24T12:00:00Z")), [item]);
  assert.equal(state.workoutSets.length, 30);
  // Importing twice changes nothing: a set is keyed by session, exercise, and number.
  assert.equal(applyImport(state, [item]).workoutSets.length, 30);
});

test("a full Baseline backup is rejected by the partial import path", async () => {
  const backup = {
    ...emptyHealthState(new Date("2026-08-25T12:00:00Z")),
    medications: [{ id: "synthetic-med", name: "Synthetic medication", schedule: "daily", dueDay: null, archived: false }],
  };
  const [item] = await inspectFile(fileOf("baseline-backup.json", JSON.stringify(backup)));
  assert.equal(item.kind, "error");
  assert.match(item.message, /Restore a backup in Data & goals/);
});

test("one-rep max declines to guess past the range the formula describes", () => {
  assert.equal(estimateOneRepMax(230, 5), 268.3);
  assert.equal(estimateOneRepMax(100, 1), 103.3);
  assert.equal(estimateOneRepMax(100, 20), null, "endurance, not strength");
  assert.equal(estimateOneRepMax(null, 5), null);
  assert.equal(estimateOneRepMax(0, 30), null, "a bodyweight set has no load to extrapolate");
});

test("exercise summaries rank by estimated max, and by reps when nothing is loaded", () => {
  const records = strongToRecords(toTable(STRONG));
  const state = applyImport(emptyHealthState(new Date("2026-08-24T12:00:00Z")), [
    { id: "x", fileName: "s.csv", label: "Strong workouts", source: "other", include: true, kind: "records", records },
  ]);
  const summaries = buildExerciseSummaries(state.workoutSets);

  const chest = summaries.find((entry) => entry.name === "Chest Press (Machine)");
  assert.equal(chest.bodyweight, false);
  assert.equal(chest.sets, 3);
  assert.equal(chest.best.weightLb, 230);
  assert.equal(chest.best.reps, 6, "230x6 beats 230x5 and 180x9");
  assert.equal(chest.bestOneRepMax, 276);
  assert.equal(chest.totalVolumeLb, 180 * 9 + 230 * 5 + 230 * 6);

  const knee = summaries.find((entry) => entry.name.startsWith("Knee Raise"));
  assert.equal(knee.bodyweight, true);
  assert.equal(knee.bestOneRepMax, null);
  assert.equal(knee.best.reps, 31, "31 beats 30 with no load either way");

  const sessions = buildWorkoutSessions(state.workoutSets);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].date, "2026-04-18", "newest first");
  assert.equal(sessions[0].name, "Evening Workout");
  assert.ok(sessions[0].exercises.length >= 4);

  const volume = weeklyVolume(state.workoutSets, "2026-04-19", 2);
  assert.equal(volume.length, 2);
  assert.ok((volume.at(-1).value ?? 0) > 0, "the most recent week carries the last session");
});

test("a first attempt is not a personal record, and a beaten one is", () => {
  const base = {
    date: "2026-05-01",
    startedAt: "2026-05-01 10:00:00",
    workoutName: "Session",
    distance: null,
    seconds: null,
    rpe: null,
  };
  const state = applyImport(emptyHealthState(new Date("2026-05-20T12:00:00Z")), [
    {
      id: "x",
      fileName: "s.csv",
      label: "Strong workouts",
      source: "other",
      include: true,
      kind: "records",
      records: {
        ...emptyRecordsShim(),
        workoutSets: [
          { ...base, exercise: "Squat", setNumber: 1, weightLb: 200, reps: 5 },
          { ...base, date: "2026-05-08", startedAt: "2026-05-08 10:00:00", exercise: "Squat", setNumber: 1, weightLb: 225, reps: 5 },
          { ...base, exercise: "Bench", setNumber: 1, weightLb: 150, reps: 5 },
        ],
      },
    },
  ]);

  const summaries = buildExerciseSummaries(state.workoutSets);
  const records = recentPersonalRecords(summaries, "2026-05-20", 30);
  assert.deepEqual(records.map((record) => record.exercise), ["Squat"], "Bench was only ever done once");
  assert.equal(records[0].weightLb, 225);
  assert.equal(records[0].previous, estimateOneRepMax(200, 5));
  assert.deepEqual(recentPersonalRecords(summaries, "2026-06-30", 7), [], "outside the window");
});

function emptyRecordsShim() {
  return { dailyEntries: [], sleepEntries: [], labResults: [], workoutSets: [], skipped: 0, warnings: [] };
}
