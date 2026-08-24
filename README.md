# Bardia Health

A private, low-friction health dashboard for the commitments that matter most:

- sleep duration and bedtime consistency
- medication adherence
- therapy and journaling
- steps, exercise, and weight direction
- mood, anxiety, energy, and stress
- lab history with user-entered reference ranges

The main screen is intentionally brief. Sleep has a dedicated tracker with interactive 14, 30, and 90-day charts. Deeper trends and records stay one level down.

## Privacy model

This repository contains source code only. It must never contain a user's health records, exports, credentials, or wearable data.

The deployed ChatGPT Site is private and owner-only. Authenticated records are saved in its private D1 database. The browser keeps a local fallback so a temporary sync problem does not erase a check-in. The server retains up to 30 prior snapshots for recovery.

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
