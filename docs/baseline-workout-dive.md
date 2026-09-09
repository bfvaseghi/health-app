# Workout workflow review

The workout surface mixed completed-plan previews, future prescriptions, import history and muscle projections. That made an instruction such as “Keep 155 lb” ambiguous. The underlying calculation prescribed the next visit, but the screen did not show the imported evidence next to it.

The weekly muscle chart still existed. Two nested disclosures hid it. The History tab duplicated Strong's logging role and also let users leave the plan to inspect records whose numbers served a different purpose.

## Changes

- Workout opens on the next remaining session. A selector contains only unfinished sessions. Completed matches never turn into selectable instructions with freshly recalculated weights.
- Each exercise pairs its last logged weight and reps with the next weight. Direction icons distinguish increase, reduce and same weight. Assistance and bodyweight receive explicit labels.
- Sets, rep range and rest remain visible. Opening an exercise explains the weight decision and compares the imported timer setting with the prescribed timer. The app does not treat the Strong timer as measured rest adherence.
- Import Strong remains available after the last scheduled session. Imports return to the recalculated workout and reset a previously selected session. The existing parser and complete-export replacement behavior remain unchanged.
- Workout, Muscles, Progress and Body replace the old navigation. History has no tab or plan link. Stored workouts remain available to the calculations and exports.
- Muscles opens directly on the graph for all eleven groups. Each row separates logged sets, remaining planned sets and their total. The target band and numerical range stay visible. Core gets a separate direct-set summary.
- Two-workout coverage stays distinct from coverage that depends on optional visits. The existing time-limit adjustment appears when it can resolve a base shortfall. Opening a muscle names the exercise and upcoming session affected by a set adjustment.
- Tab changes return to the top of the selected view and focus the selected tab.

## Recommendation calculation

The UI uses `currentTrainingWeek`, `remainingSessions` and each planned exercise's `adjustment`. It does not introduce a second post-import recommendation calculation. The latest usable sets for each exercise determine the previous weight and reps. Rep-range, progression, plateau, lighter-week and shortened-rest decisions remain in the existing planner. The next session and copied workout use the same planned exercise objects.

The weekly graph combines actual imported work since Monday with the remaining plan. Optional visits cannot conceal a shortfall in the separate two-workout base assessment. The graph shows planned work as planned, even if the total reaches a target.

## Verification

252 model and rendered-component tests passed. New tests render the actual Workout and Muscles components, confirm the removed History tab, check all eleven graph rows, distinguish weight and assistance, and exercise a real Strong CSV import for 2, 3 and 4 visits. The import test omits a core set from the first base workout and confirms that the next visible workout restores it. It also checks that imports preserve unrelated records.

The TypeScript check still reports the pre-existing Drizzle alias and Cloudflare runtime declaration errors. It reported no errors in the changed workout components. This pass uses source rendering and model checks, with no new browser or native-device test.
