# Baseline

A private, mobile-first health record and personal coach. It turns the exports your devices
already make into four answers:

1. **What should I do today?** — Today leads with the meds still due, the next session to lift,
   and tonight's usual bedtime.
2. **How are things changing?** — Sleep, body, medication, mind, and lab markers, each with its
   own history.
3. **What should I lift this week?** — the Coach writes a 2, 3, or 4-day week from your own Strong
   history, runs four-week blocks, and says when each load goes up.
4. **What do I bring to my doctor or therapist?** — Summary prints a dated, controlled report.

## Importing

Press **Import** on any screen and drop the file your app already makes — the whole archive,
unopened:

| Source | What to look for | What lands here |
| --- | --- | --- |
| Oura | cloud.ouraring.com → download your data as CSV | nights, heart measures, steps |
| Whoop | Ask for your data in the app; Whoop emails a zip | nights, heart measures |
| Apple Health | Health app → your picture → Export All Health Data | nights, steps, weight, body fat, heart measures |
| Strong | Settings → Export Strong Data | every set, powering the whole Fitness section |

Anything else with one row per day works too. Zips are opened in place; Apple's `export.xml` is
streamed, and only sleep, steps, weight, body fat, resting heart rate, and HRV are kept. Column
matches and unit guesses are shown before anything is saved, and importing never overwrites what
you already have — a night from a second device is kept beside the first, and a file carrying only
steps cannot blank the medication already recorded for that day.

Timestamps are read literally: a record stamped `2026-08-24 07:15:32 -0700` happened at 07:15
where the phone was. A night is filed under the morning it ended.

## Automatic feeds (optional)

**Data & goals → Private iPhone connection** creates one bearer key and two write-only URLs:

- **Apple Health sync** — point the Health Auto Export app at the Health URL and steps, sleep,
  weight, body fat, resting heart rate, and HRV arrive on their own. Apple data stays in its own
  lane: it overlays the record for display and is subtracted before anything is written back.
- **Apple Notes → Thought Journal** — a Share Sheet Shortcut posts a note's text to the Notes URL
  and it appears in Mind. Sending the same note twice is safely ignored.

The key is stored only as a hash and shown once. Neither URL can read the record.

## Sections

Mobile navigation: **Today · Sleep · Fitness · Mind · Meds · More** (More holds Labs, Summary,
and Data & goals; the desktop sidebar lists all seven).

- **Today** — do today (meds, next session, tonight's usual bedtime), last night, quick logging,
  and the last seven days.
- **Sleep** — 7-day average, nights at goal, bedtime range, sleep debt, typical window, charts,
  and the night log.
- **Fitness** — four faces on the Deep Water theme: **Coach** (the week, the streak, weekly
  progression, and whether every muscle clears the direct + ½ × indirect thresholds), **Progress**
  (every lift, session by session), **Lifting** (records and history), **Body** (weight, body fat,
  protein, steps, progress photos).
- **Mind** — thought journal, topics for therapy, meditation and journaling practice.
- **Meds** — each medication asked about only on the days it is due, with its streak and a
  14-day history strip.
- **Labs** — results grouped by test with reference ranges, history, and search.
- **Summary** — a dated page for an appointment: copy as text or print.

The Coach prescribes only movements found in your Strong history — never a lift you have not
logged. Loads follow double progression with stall detection; every fourth week is a deload.

Keyboard shortcuts: `I` import, `S` a night, `C` log today, `L` a lab result, `1`–`7` sections,
`?` the full list.

## Demo mode

Open the app with `?demo=1` for a fully populated, synthetic record. Nothing in demo mode is ever
saved; **Open my record** returns to the real one.

## Backups and leaving

**Data & goals → Take everything with you** downloads one archive: a restorable backup,
spreadsheet CSVs, the Apple sync lane, every progress photo, and a pointer to this source. The same
panel restores from an archive, lists up to 30 server snapshots for point-in-time recovery, and can
erase everything.

## Privacy model

This repository contains source code only. It must never contain a user's health records, exports,
credentials, or wearable data.

The deployed Site is private and owner-only: the first authenticated user (or the email hash in
`BASELINE_OWNER_HASH`) claims the record, and every API route checks ownership. Records live in a
private D1 database; the browser keeps a local copy so a sync problem never erases a check-in, and
concurrent edits are three-way merged. The automatic feeds are write-only and key-hashed as
described above.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful commands:

```bash
npm run lint
npm run test:model   # model, import, coach, progress, and demo tests
npm test             # model tests + production build + rendered-HTML check
npm run db:generate
```

The Sites runtime injects the D1 `DB` binding declared in `.openai/hosting.json`.
