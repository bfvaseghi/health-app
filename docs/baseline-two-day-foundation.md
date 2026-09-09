# Two workouts that stand alone

The full-body planner builds workouts 1 and 2 independently of the 2/3/4 visit choice. This update allocates the existing weekly minimums before allocating additional volume. Each base workout reserves four direct core sets. Core follows compound lifts and precedes smaller accessories.

When essential sets need more time, rests shorten in 15-second steps, accessories first. Moderate accessory work stays within 60–120 seconds, moderate compounds within 120–180 seconds, and heavy compounds retain at least 180 seconds. The time estimate still includes its existing ten-minute warm-up/transition allowance and 45 seconds per set. Neither the time estimate nor the muscle-volume targets were reduced to produce a passing result.

A load increase earned with a longer rest is held at the previous load while the shorter rest is introduced. Each exercise keeps its actual prescribed timer in the UI and copied workout. Target details explain time-driven changes and advise taking longer when reps or form deteriorate.

Strong imports repair omitted work in the remaining base before considering optional visits. One omitted core set in workout 1 becomes five core sets in workout 2 when the time and volume budgets allow. Only imported work receives completion credit. Manual set changes and weekly ceilings remain respected.

The summary switches from the unperformed template to actual imported work plus the remaining base once a week has records. Optional volume cannot hide a shortfall there. A leg-only visit in place of the first full-body workout can still leave gaps in a two-visit week, which are named explicitly. Core then shows logged and remaining sets separately. A longer time suggestion is offered only after that actual projected base passes at the suggested duration.

## Fake-data result

With the fictional Strong history, a fresh week starting September 7, 2026, and a 75-minute cap:

| Visits | Base 1 | Base 2 | Optional work |
| --- | --- | --- | --- |
| 2 | 26 sets, 75 min, 4 core sets | 25 sets, 75 min, 4 core sets | None |
| 3 | Same base | Same base | Workout 3, 75 min |
| 4 | Same base | Same base | Workout 3, 64 min; Workout 4, 62 min |

The two base workouts meet all eleven existing weekly effective-set minimums and direct-work minimums. Core receives eight direct sets without optional visits. Extra workouts may differ between the three- and four-visit choices. Build weeks 1–3 retain the completed base. The fourth week intentionally reduces volume for recovery.

The fake demo now uses a 75-minute cap. Its fictional bench history records successful sets with a two-minute timer so an earned increase can remain visible alongside held and reduced loads.

## Limits shown in the interface

- At 60 minutes, this history still leaves chest and quads below their minimums in the base. Core retains four sets per visit. The base summary reports these gaps even if optional workouts cover them, and offers a tested 75-minute alternative.
- Missing Strong exercises remain missing. The planner never invents a movement or credits absent core work.
- These targets and fractional indirect-set credits are the app's programming model, not a guarantee of individual training outcomes. Actual session time can exceed the estimate when more recovery or setup time is needed.

## Rest rationale

Shorter rest is a time tradeoff, not a claim of better growth. The implementation retains longer compound rests and uses shorter accessory rests only within the prescribed band. Background evidence reviewed:

- [ACSM's updated resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/) emphasizes consistent major-muscle training and tailoring volume to goals.
- [Singer et al., 2024](https://pubmed.ncbi.nlm.nih.gov/39205815/) reports a modest advantage for longer rests over very short intervals, with uncertainty in the estimates.
- [Schoenfeld et al., 2016](https://pubmed.ncbi.nlm.nih.gov/26605807/) found advantages to three-minute rests over one-minute rests in trained men, supporting the decision to protect compound recovery.

## Verification

Regression checks cover the identical base across 2/3/4 choices, weekly minimums at 75 and 90 minutes, direct core placement at 60/75/90 minutes, lighter weeks, time and volume caps, copied rest timers, earned load changes, missing core history, and sequential Strong imports including a missed core set. Mobile review covers 320/393/430 px frames and the 60-to-75-minute correction. All records used for QA are synthetic.
