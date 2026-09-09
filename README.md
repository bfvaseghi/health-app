# Baseline

Private, mobile-first health record for one person. React, vinext, Cloudflare Workers, D1 and private R2 photo storage.

## Screens

- Today: doses, next workout, sleep, protein, meditation and journal status.
- Sleep: last night, weekly averages, bedtime and wake time, heart measures and night history.
- Workouts: Workout, Muscles, Progress and Body. Body opens on a dated photo timeline with any-two-photo comparisons.
- Mind: practices, thought journal, therapy topics, recurring thoughts and habit logs.
- Meds: scheduled doses, history and adherence.
- Labs: results, reference ranges, history and questions for an appointment.
- Summary: dated report with optional therapy topics and recurring thoughts. Copy or print.
- Data & goals: imports, archive export, restore, snapshots, connections, goals and appearance.

Mobile navigation keeps Sleep and Meds visible. Forms open from Add or Edit. Charts share one style; fonts are bundled locally. Light and dark themes use the same layout.

## Imports and connections

Import ZIP, CSV, JSON or XML in Data & goals. Supported exports include Apple Health, Oura, Whoop, Strong and MyFitnessPal. Preview records and column mappings before saving. Apple XML is streamed. Sleep dates use the morning a night ended. Complete Strong exports replace lifting history; other health records merge by their record keys.

The optional iPhone connection provides two write-only endpoints:

- Apple Health: Health Auto Export sends steps, sleep, weight, body fat, resting heart rate and HRV.
- Apple Notes: a Share Sheet Shortcut sends text to the thought journal. Repeated submissions are deduplicated.

The connection key is shown once and stored as a hash. Synced Apple records remain separate from the editable record. Setup details are under Data & goals → Connection setup.

## Training

The Coach uses only exercises recorded in Strong. It retains 2/3/4-day weeks, automatic refitting, four-week blocks, weekly progression, stall detection, workout streaks and direct plus half-indirect set accounting. Today and Coach use the same current-week calculation, including weekends.

Volume thresholds are program targets. They are not personalized biological limits. This update does not change the exercise-selection algorithm, progression rules or target values.

Design decisions retain recording and progression without adding behavioral prompts:

- Harkin et al. (2016), [progress monitoring meta-analysis](https://doi.org/10.1037/bul0000025): 138 randomized studies found improved goal attainment from progress monitoring.
- Plotkin et al. (2022), [repetition versus load progression](https://doi.org/10.7717/peerj.14142): both methods supported adaptation over eight weeks in trained adults.
- Pelland et al. (2026), [training dose-response analysis](https://doi.org/10.1007/s40279-025-02344-w): fractional indirect-set accounting fit the pooled data best, with diminishing returns. The app's exact per-muscle targets are not validated by that pooled analysis.

## Demo

Open `?demo=1` for a synthetic record. Changes remain in memory and reset on reload or exit. Strong imports, photo uploads, edits and archive restores use this disposable record. Three clearly labeled generated progress photos span six weeks. Bundled demo photos never resolve through private photo storage. Private connection creation is disabled.

## Export and restore

Download archive produces one ZIP containing:

- `baseline-backup.json`: editable record.
- `automatic/apple-health.json`: separate Apple Health records.
- `csv/`: readable tables.
- `photos/`: available progress photos from private storage, or bundled/in-memory photos in demo.
- `source/baseline-source.zip`: source, dependencies manifest, schema migrations, scripts, fonts and app assets.

Source bytes come from the running app's own origin. No GitHub request is needed. The source ZIP excludes credentials, runtime storage, backups, unapproved data files and symlinks. Shell scripts retain executable permissions. The installed app caches the source archive for offline exports.

Restore accepts the full ZIP and legacy JSON backups. Archived Apple records fill gaps while existing synced values, connection keys and last-sync timestamps remain unchanged. Every archived photo is saved privately before restored photo metadata is made visible. Image MIME types are retained. Apple restore precedes photo writes; a later failure reports the partial Apple restore explicitly. Up to 30 server snapshots remain available for earlier editable-record versions.

## Privacy

No analytics, hosted fonts or external runtime requests. Health records, wearable exports, credentials and backups must never enter this repository. Test fixtures and the demo are synthetic.

The deployed app is owner-only. Access requires the existing owner record or a matching configured `BASELINE_OWNER_HASH`. An unconfigured new record fails closed. API routes check ownership. Automatic feeds use hashed bearer keys. D1 holds the private record; the browser retains a local copy and merges concurrent edits. Photo bytes are stored in private R2 objects and only served after the same owner check. New photos follow the signed-in owner across devices. Legacy IndexedDB photos migrate when opened on their original device. Browser copies are caches, and a remotely deleted cached photo is never automatically re-uploaded. Full erase includes all owner photo objects and local copies on the current device.

## Development

Node.js 22.13 or newer:

```bash
npm ci
npm run dev
```

Required checks:

```bash
npm run test:model
npm run lint
npx tsc --noEmit -p .
npm run build
npm run test:render
```

The database binding is declared in `.openai/hosting.json`. Use `npm run db:generate` for schema migrations.

Keyboard shortcuts: `I` import, `S` sleep entry, `C` daily entry, `L` lab result, `1`–`7` sections, `?` shortcut list.

## Mind and Forge

Baseline Mind contains recurring thoughts, therapy topics, meditation records, and health-related patterns. The mental health journal sits within Thoughts. Existing notes keep their original records, IDs, imports, and exports.

Forge Lessons is the single home for aphorisms, personal principles, and lessons from work and life. Baseline has no second lessons collection and does not copy entries between apps.
