# Bardia Health

A private, low-friction health dashboard for the commitments that matter most:

- sleep duration and bedtime consistency
- medication adherence
- therapy preparation: what to raise this week, and a summary built from your own record
- a thoughts journal, with CBT thought records
- steps, exercise, and weight direction
- mood, anxiety, energy, and stress
- lab history with user-entered reference ranges

The main screen is intentionally brief. Sleep has a dedicated tracker with interactive 14, 30, and 90-day charts. Deeper trends and records stay one level down.

## Therapy and the thoughts journal

The **Therapy** tab holds four things:

- **To talk about.** Add topics during the week rather than in the waiting room. Star the one that matters most and it sorts to the top.
- **Thought records.** The CBT exercise as seven questions: what happened, what went through your mind, how much you believed it, whether it fits one of the twelve classic cognitive distortions, what the evidence actually is, a fairer way to put it, and how much you believe the original thought now. Selecting a distortion shows the question that unhooks it.
- **Journal.** Free writing, optionally titled, with any entry flaggable to bring to the session.
- **Sessions.** What came out of each one, plus homework. Unfinished homework surfaces in the following week's summary.

These feed a copyable summary for the session. The reason it lives in this app rather than beside it is that the summary reads the dashboard's own record: sleep average and short nights, medication adherence, mood and anxiety averages, and the notes written on daily check-ins all arrive without being typed twice.

Observations are descriptions of what you logged, never advice, and the numbers always state how many days they were built from.

## Privacy model

This repository contains source code only. It must never contain a user's health records, exports, credentials, or wearable data.

The deployed ChatGPT Site is private and owner-only. Authenticated records are saved in its private D1 database. That now includes journal entries and thought records, which are more sensitive than a step count: they are stored the same way as the rest of the record, in the private database behind ChatGPT authentication, and never in this repository. The browser keeps a local fallback so a temporary sync problem does not erase a check-in. The server retains up to 30 prior snapshots for recovery.

## Health in ChatGPT bridge

ChatGPT does not currently document a direct app-to-app feed from the Health app into a standalone Site. Bardia Health uses a visible bridge instead:

1. Open **Goals & data** and choose **Start Health sync**.
2. Copy the prepared request into a chat with the Health app connected.
3. Ask Health to create `bardia-health-sync.json` from available Apple Health, Oura, Whoop, or other connected data.
4. Review and import that file into Bardia Health.

The import validates dates, values, and source names. Missing values remain missing. It does not invent quality scores or double-count overlapping sleep sources.

A future version can expose authenticated MCP tools so ChatGPT can orchestrate both apps. That requires an OAuth-protected server. Health data should never be exposed through unauthenticated write tools.

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
- `goals`

Wearable sleep is preserved by date and source. When the UI needs one nightly value, source priority is Oura, Apple, Whoop, manual, then other. Raw source entries remain available in the record.

## Medical boundary

This app organizes observations and commitments. It does not diagnose conditions, interpret symptoms as medical facts, or replace a clinician. Lab ranges vary by laboratory and context.
