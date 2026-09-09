# Workouts, water, and urges

September 8, 2026

The workout screen now opens with one session and a plain exercise list. Each exercise shows its load, sets, reps, and rest. Prior performance and the reason for a target sit behind “Why?”. The weekly schedule and plan settings have separate screens. Base workouts have consistent A/B names, optional visits remain separate, and core has a labeled section. The training planner and its coverage rules are unchanged.

Water appears first in Today’s daily log. Add 250 mL, add a 500 mL bottle, correct the total, clear it, or undo the latest add. Water is included in daily records, fictional demo data, exports, restore, mapped CSV imports, and Apple Health XML imports. Existing records without water remain unlogged. Removing an Apple overlay preserves manual water-only days.

Mind has a dedicated Urges tab with “Urge passed” and “Acted on it” actions. Management and history remain available in disclosures. Caffeine has a separate screen. Undoing an urge or caffeine event no longer creates a second, competing undo notice.

## Verification

- 245 model tests passed, including water persistence, import units, repeated imports, and preservation of manual data when an Apple overlay is removed.
- Browser checks used fictional records exclusively. Tested workout navigation, 2/3/4 visits, time-limit changes, copied workout text, water additions and corrections, water undo from an unlogged day, urge creation and logging, undo, and the separate caffeine screen.
- Checked phone layouts at 320, 393, and 430 CSS pixels and a desktop layout at 1348 pixels. No horizontal overflow in the exercised workout, water, and urge flows. These were Chromium viewport checks, not native iOS or Safari tests.
- The standalone TypeScript check still reports the pre-existing API insert-selection and Cloudflare environment declaration errors. It reports no errors in the changed UI or water code.
