# Baseline

A private dashboard for the health record nothing else on your phone is keeping:

- sleep duration, timing, and bedtime consistency, read from Oura, Whoop, or Apple Health
- daily medication adherence
- weight, resting heart rate, variability, and steps as your devices report them
- lab history with the reference ranges printed by the lab that ran them

It does not track training, mood, journaling, or therapy, and those fields are not in the record at
all. Apps that already do them well keep that data.

## Importing from Oura, Whoop, and Apple Health

Import is the main way data arrives. Press **Import** on any screen and drop the file your app
already makes — the whole archive, unopened:

| Device | What to look for | What lands here |
| --- | --- | --- |
| Oura | Sign in at cloud.ouraring.com and download your data as CSV | nights, heart measures, steps |
| Whoop | Ask for your data in the app; Whoop emails a zip of CSVs | nights, heart measures |
| Apple Health | Health app → your picture → Export All Health Data → `export.zip` | nights, steps, weight, heart measures |

Anything else with one row per day works too, including a sync file from the Health app in ChatGPT.

What happens when you drop a file:

1. **Zips are opened in place.** Only the central directory and the one entry being read are
   loaded, so a multi-gigabyte Apple export never has to fit in memory.
2. **Apple's `export.xml` is streamed**, not buffered, and only sleep, steps, weight, resting heart
   rate, and HRV are kept. Nights are assembled from their sleep stages, split into sessions, and
   the longest session per morning becomes the night — an afternoon nap does not inflate it.
3. **Columns are matched for you**, with units inferred from the header and, for durations, from the
   magnitude: Oura writes seconds, Whoop writes minutes, a spreadsheet writes hours. Every guess is
   shown and can be corrected before importing.
4. **You see what will land** — nights, days, date range, and anything skipped — before anything is
   saved.

Timestamps are read literally. A record stamped `2026-08-24 07:15:32 -0700` happened at 07:15 where
the phone was, so no timezone conversion is applied that could move a night onto the wrong day. A
night is filed under the morning it ended, which is how Oura and Apple already file it and what puts
a Whoop cycle starting at 22:40 on the right date.

Importing never overwrites what you already have. A night from a second device is kept beside the
first (source priority for a single nightly figure is Oura, Apple, Whoop, manual, then other), and a
file carrying only steps cannot blank the medication and weight already recorded for that day.

## Sections

- **Today** — last night, medication in one tap, the last seven nights, and the short list of goals.
- **Sleep** — 7-day average, nights at goal, bedtime range, sleep debt, typical window, and a log
  you can filter to one record per night or every source.
- **Body** — weight, resting heart rate, HRV, and steps as they arrive, plus the day records
  themselves. It opens on a metric you actually have.
- **Labs** — results grouped by test, with history, change, and a search.
- **Summary** — a dated page for an appointment: figures with the number of recorded days behind
  each one, the latest out-of-range labs, and copy-as-text or print.
- **Data & goals** — import, the five targets, theme, export, restore, and snapshot recovery.

Every deletion offers an undo for a few seconds. Keyboard shortcuts: `I` import, `S` a night,
`C` medication, `L` a lab result, `1`–`5` sections, `?` the full list.

## Privacy model

This repository contains source code only. It must never contain a user's health records, exports, credentials, or wearable data.

The deployed ChatGPT Site is private and owner-only. Authenticated records are saved in its private D1 database. The browser keeps a local fallback so a temporary sync problem does not erase a check-in. The server retains up to 30 prior snapshots, which **Goals & data → Recover an earlier save** lists and restores. The snapshot list asks D1 for payload sizes rather than payloads, so browsing history never ships thirty copies of a health record to the browser.

ChatGPT does not currently document a direct app-to-app feed from the Health app into a standalone
Site, so there is no silent connection to configure. Every import is a file you chose, read in your
browser. A future version could expose authenticated MCP tools; that needs an OAuth-protected
server, and health data should never be reachable through unauthenticated write tools.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run lint
npm run test:model
npm test
npm run db:generate
```

The Sites runtime injects the D1 `DB` binding declared in `.openai/hosting.json`.

## Data shape

The full local and server state is versioned JSON with four top-level fields:

- `dailyEntries`
- `sleepEntries`
- `labResults`
- `goals` — five settings: nightly sleep hours, bedtime consistency minutes, whether medication is
  tracked, and an optional weight goal with its direction

A daily entry holds only `date`, `medicationTaken`, `weightLb`, `steps`, `restingHeartRate`,
`hrvMs`, and `note`.

Fields an earlier version wrote — mood, anxiety, energy, stress, journaling, therapy, exercise,
outdoor minutes, caffeine, alcohol, and the goals that went with them — are **purged**, not just
ignored. The first time the app loads after this change it rewrites the saved record, every one of
the retained snapshots, and the browser's local copy without them, and reports what it removed. A
save can never carry them back in: the snapshot it writes is the previous record in the current
shape. Nothing else is touched, and the purge cannot be undone from inside the app — a JSON backup
taken beforehand is the only copy.

Wearable sleep is preserved by date and source; raw source entries remain available in the record.

## Interpretation boundaries

Two rules hold across the model and the UI:

- A number is only ever computed from days that were recorded, and every figure that could look
  confident carries the count it came from. Coverage sits next to the averages that depend on it.
- Nothing is invented on the way in. A 0–100 sleep score is not mapped onto a 1–5 quality rating, a
  weight column with no unit says which unit it assumed rather than guessing and silently doubling
  someone, and a row with no readable date is counted as skipped instead of being placed somewhere.

## Medical boundary

This app organizes observations. It does not diagnose conditions, interpret symptoms as medical
facts, or replace a clinician. Lab ranges vary by laboratory and context.
