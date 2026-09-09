# Training workspace and recurring-worry responses

September 8, 2026

The workout page now keeps the two base sessions visible above the selected workout. Optional third and fourth visits have a separate disclosure. Selecting the weekly visit count changes only the current week. The workout, muscle coverage, and plan settings share one workspace. Imported sessions, remaining sessions, and unscheduled originals have distinct labels. An empty remaining schedule no longer claims the week is complete.

The dumbbell and load-direction icons return, with rest-clock icons and a labeled core section. Exercise rows expand to show prior performance and the reason for a target. Copy and Strong import are available together at the top of the selected workout. The planner's allocation, rest fitting, and coverage calculations are unchanged. The only planner-file change exposes its existing imported-session matching helper to the UI.

Thoughts now starts with a short recurring-worry theme and asks how the person handled it. Each occurrence can store its own response, separately from the reusable reminder. Response history supports editing and deletion. Existing names, outcomes, reminders, dates, and occurrences remain intact. The optional response field survives normalization, state persistence, JSON backup, CSV export, and the daily record.

Caffeine has one dedicated destination under More on mobile and in the desktop sidebar. Its repeated Mind footer and pseudo-tab are removed. Urges remain a separate Mind tab. Caffeine intake history now displays the recorded amount in daily records.

## Verification

- All 247 model checks passed, including response persistence, legacy records, edits to reusable reminders, CSV escaping, and existing training coverage tests.
- Browser checks used only fictional data. Verified two/three/four visits, base selection, original-plan labels, target explanations, workout copying, a time-limit change, response creation and editing, and a new recurring worry.
- Verified that none of the five Mind tabs contains the old caffeine button. Tested the More and desktop caffeine destinations, logging, and undo.
- Workout, response, and caffeine layouts fit 320, 393, and 430 CSS-pixel phone widths. Desktop navigation and layout were checked at 1348 pixels. These were Chromium viewport checks, not native iOS or Safari tests.
- The standalone TypeScript check reports the pre-existing API insert-selection and Cloudflare environment declaration errors, with no errors in the changed UI, data model, or planner files.
