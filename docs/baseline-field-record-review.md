# Baseline field record redesign

## Direction

The Forge reference was inspected in its live mobile viewport and source. The useful principles were a consistent identity, recognisable controls, and short paths to everyday actions. Baseline uses its own visual language: blue ink, pale record paper, a green reference line, a simple chart mark, and compact dated entries.

The shared palette supports light, dark, and system appearance. Navigation, headings, buttons, tabs, forms, charts, journal entries, medication rows, and installation icons now use the same system. Serif type is reserved for the user's written journal text. The existing fonts and dependencies are retained.

## Changes

- A shared section heading keeps orientation consistent across every main view.
- Today pairs a clear next-workout card with the daily log on desktop and stacks them on phones.
- Fitness retains its Plan, Progress, History, and Body tabs. Exercise numbers and explicit load instructions make the next workout easier to scan. Target explanations remain beside the exercise list. The tab controls support arrow keys, Home, and End.
- Mind retains Journal, Thoughts, Habits, and Therapy. Journal history uses dated rows, with writing and search close to the list.
- Medication actions stay next to their dose status. History, schedule editing, and deletion remain available inside each entry.
- Charts, comparisons, labs, imports, goals, and appointment summaries use the same paper sections and controls.
- The mobile header always identifies Baseline, including in demo mode. Bottom navigation accounts for the device safe area.
- The vector mark and installed-app icons match the new identity.

## Preserved capabilities

Training prescriptions and adjustments, rest targets, 2/3/4-workout choices, the two-workout full-body base, optional sessions, Strong imports and workout copying, progress charts, body goals and photos, sleep and recovery metrics, medication schedules and history, journal editing and search, recurring thoughts, therapy topics, meditation, caffeine amount and time tracking, lab results, comparisons, appointment privacy controls, exports and restore, Apple Health connections, theme settings, and keyboard shortcuts remain available. Health data models and calculation logic were not changed.

## Verification

- Reviewed the actual app in Chromium at 320, 393, and 430 px phone viewport widths, plus a 1363 px desktop viewport. The phone checks used temporary same-origin viewport frames, removed before the release build.
- No page-level horizontal overflow was found in the checked main views. Dense checks included expanded training settings and target explanations, workout history, labs, comparisons, summaries, and the journal editor.
- The 320 px daily-log dialog fits within the viewport and scrolls vertically. Form fields retain mobile font sizing and primary actions retain 44 px touch targets.
- Exercised all three workout-frequency choices, opened target explanations, saved a synthetic journal entry, and saved a custom caffeine entry for 09:30. The displayed confirmation matched the selected time.
- Checked both light and dark appearance. Fixed the sidebar brand contrast discovered during desktop review.
- Existing health-model, import, coach, progress, demo-state, series, loops, and habits tests passed. Changed TypeScript components passed ESLint.
- The final production build, rendered-shell/PWA metadata check, and source-archive tests passed.

All browser interactions used disposable demo data. The screenshots show synthetic records. Actual iOS Safari, Android browser chrome, and a native on-screen keyboard were not exercised. The existing standalone TypeScript errors in unchanged API/database code remain outside this visual change.

## Release

Saved as a new Site version for review. The redesign has not been deployed to the existing live Site.
