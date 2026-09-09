# Baseline usability refinement

The blue ink, record paper, green accents, and simple chart mark continue throughout desktop and mobile. All preview records are fictional. No private health record or photo store was read or modified during this work.

## Interface

- Increased small text and control labels, softened the background grid, and reduced header spacing on phones.
- Moved the 2/3/4-workout choice above the next-workout card. Full-body base workouts, optional sessions, load adjustments, rest instructions, Strong imports, and every fitness tab remain available.
- Condensed completed medication doses on Today into one review row. Unanswered or missed doses still expose their individual actions. Daily logging has explicit Save controls and unit labels.
- Journal rows show short text previews, an identifiable date, and a clearer writing prompt. Saving, editing, searching, and adding an entry to therapy remain available. Clipboard failures now explain how to paste manually.
- Kept progress photos above body trends. A single photo uses a full card, and multiple photos retain comparison selectors. New photos can be assigned a past date before upload. Same-day photos receive distinct selector labels.
- Added a current journal entry, caffeine entry, a concrete habit example, and a clearly labeled generated progress photo to the disposable demo.

## Interaction repairs

- Daily and sleep forms protect unsaved edits when changing the date or dismissing the dialog. Keep editing preserves the entered values. Discard continues the requested action.
- Corrected initial Shift+Tab wrapping in dialogs.
- Caffeine quick logging, another row edit, deletion, and undo cannot replace an active form before it is saved or canceled.
- The demo photo loader only resolves known bundled assets or in-memory demo uploads. Removed/restored examples cannot silently reappear, and unknown IDs never fall back to private photo storage. Bundled assets use the Site's own same-origin access credentials.

## Verification

- Actual Chromium review at 320, 393, and 430 px phone frame widths and a 1363 px desktop viewport, including light and dark appearance.
- No page-level horizontal overflow in the checked Today, Sleep, Fitness Plan/Body, Journal, Habits, Meds, Compare, Labs, Summary, and Data views.
- Clicked all workout-frequency choices. Saved a fictional journal entry and a decimal caffeine correction, checking the displayed results.
- Exercised daily and sleep edit protection, retained a draft, explicitly discarded another, and saved a sleep entry. Checked initial Shift+Tab remains inside the dialog.
- Verified the generated photo loads and the photo date controls fit on phones.
- All 237 model/import/coach/progress/demo/series/loops/habits/source-archive tests passed before final packaging. The final build and rendered-shell checks are recorded by the release workflow.

These checks do not emulate actual iOS Safari, browser chrome, or a native on-screen keyboard. All existing health calculations and data integrations were preserved.

## Demo image provenance

`public/demo/progress-recent.png` was generated with the built-in image tool. Brief: a fictional adult man in navy training shorts, relaxed front-facing posture, neutral gray wall and soft daylight, non-identifying head crop, normal body proportions, no text or logos. It is an illustration for sample data, not a real person's progress or a claim about body composition. A second generated candidate was unsuitable and was not included.

## Release

Saved for review on the existing Site source branch. This change does not publish to the live Site.
