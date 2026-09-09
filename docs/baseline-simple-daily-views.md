# Simpler daily views — September 8, 2026

The four daily surfaces now prioritize one task and defer supporting records.

- Fitness leads with the next workout and a compact 2/3/4 choice. Prescription rows keep load changes, sets, reps and rest together. Each row opens its reasoning. The two-workout coverage warning remains visible; complete coverage, direct core allocation, muscle adjustments and plan settings remain available below the lifts. The planning engine is unchanged.
- Meds uses a daily list with one taken action. Corrections and missed doses are available from the row; upcoming doses, schedules, individual histories and the trend remain available. A recorded dose is never represented as an undoable boolean toggle.
- Mind groups recurring thoughts instead of leading with repeated occurrences. Recording opens immediate outcome and undo controls. Journal, Therapy and Meditate are explicit tabs. Habits and caffeine remain accessible through a secondary link, with a keyboard tab stop retained.
- Sleep leads with separately labelled bedtime and wake-up times, then duration. Either clock remains visible when the other is missing. Typical times and a semantic recent-nights table keep schedule prominent. All sources, edit/delete, duration trends, weekly averages and recovery remain available through disclosures. Sleep editing follows the same order; optional notes and recovery fields remain mounted inside a collapsed disclosure so saving does not clear them.
- Native time inputs now listen for input as well as change, and sleep saves read the submitted form values. Browser testing caught a case where a changed visible time previously saved its old value.

Validation uses only isolated synthetic data. The existing 241 model checks pass. Browser checks cover 2/3/4 choices preserving the base prescription, per-lift details, core coverage, dose correction and new-dose logging, thought outcomes/undo, journal saving, therapy and meditation navigation, and editing/clearing bedtime while retaining wake-up. Mobile layouts and overflow are checked at 320, 393 and 430 pixels, with desktop review as well. No real health records are used.
