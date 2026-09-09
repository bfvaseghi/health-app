# Daily flow refinement

The main screens remain compact. This pass improves the actions behind them:

- A dose can be marked taken, changed to missed, or undone in place. Historical dose days offer explicit Taken, Missed and Not recorded choices for that medication only.
- Today opens the journal composer directly. Unfinished new entries and edits have distinct Continue actions, keep their text, and focus the editor. Editing an older entry shows its date.
- Meditation history days open a date-and-minutes editor. Another day can be selected, saved or cleared without changing the rest of that day's daily record.
- Today leads its sleep summary with bedtime and wake-up time, including records without duration. View opens Sleep.
- Sleep trends offer Bedtime, Wake-up and Duration in one chart. Clock series retain missing nights, use one preferred source per night, and cross midnight continuously. The usual-window diagram fits actual clock times instead of fixed evening/morning bounds.
- Workout History opens with the session list; weekly volume is a disclosure. Progress shows a short summary and retains its lift graphs and methodology.

The two-base-workout planner, optional third/fourth sessions, direct core targets, rest logic, imports, data tools and graphs are preserved.

## Validation

- All 242 existing/new model tests pass, including clock-series source priority, missing dates, future exclusion and midnight continuity.
- Browser checks used only `?demo=1` with fictional records on the internal preview.
- Verified dose undo and historical changes, repeated Taken selection staying taken, and clearing a recorded dose.
- Verified changing the meditation date saves that date, clearing it restores an unrecorded day, and editing yesterday keeps today's minutes intact.
- Verified Today opens a new journal editor, preserves a draft across navigation, focuses the textarea, and labels a resumed older edit with its original date.
- Verified a sleep night saved with clocks and no duration appears as recorded on Today, and View opens Sleep. Tested the three sleep chart choices and usual-window disclosure.
- Checked phone widths 320, 393 and 430 for Doses, Mind and Sleep; workout History and Progress at 320; desktop workout navigation at 1348. No horizontal overflow observed. These are Chromium browser checks, not native-device tests.
- Temporary mobile review HTML was removed before packaging.
