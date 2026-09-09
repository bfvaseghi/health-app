# Dated photo progress pass

## Experience

- Preserves the Workout / Muscles / Progress / Body structure and the full 2/3/4-session planner, core coverage, muscle chart and strength trends. A later selected workout now says “This workout” beside its targets.
- Body opens with progress photos. Timeline starts on the latest photograph and provides previous/next controls, a full dated selector and a short chronological filmstrip.
- Compare dates lets the user select any two distinct photos in chronological order. It shows elapsed calendar time and weight change only when both measurements exist. Same-day photos have distinct labels.
- Images stay uncropped and can be enlarged. Uploads have an explicit date. Every photo's date, weight, body fat and note can be edited. Date edits and deletions repair the active selection.
- Empty, single-photo, missing-image and failed-save states retain a usable next action. New photo records are added only after the image save succeeds.
- Three date-relative generated examples demonstrate six weeks in the disposable demo. All have explicit fictional-image notes and matching synthetic measurements. Demo uploads and deletes never touch private storage.
- Responsive layouts provide 44 px photo controls, 16 px form inputs, full-width phone timelines and equal two-column comparison frames. Main images use object-fit: contain.

## Persistence

Image bytes now use the PHOTOS R2 binding, with dated metadata in the existing private D1 health record. Every image GET, PUT and DELETE requires authenticated ownership. Images use private/no-store responses, no public asset URLs, bounded raster uploads and same-origin mutation checks.

A legacy IndexedDB photo is carried forward when opened on its original device. Tagged caches cannot recreate a remotely deleted image. Per-photo operations serialize migration and deletion. Full erase first drains this client's photo writes and then removes all owner objects, including orphaned uploads. Archive restores save all images before restoring metadata and retain the original supported MIME type.

## Verification

Only synthetic records, bundled generated images and in-memory storage fakes are used for validation. Private records and photos were not opened or modified.

Photo checks cover chronological selection, deletion and date-edit repair, same-day photographs, calendar intervals, rendered empty/single/multiple-photo controls, owner isolation, cross-site rejection, bounded and failed uploads, byte round trips, legacy migration/deletion races, stale-cache resurrection prevention, complete photo erase and archive formats.

The existing model and component suite remains the regression gate for Strong imports, core coverage and 2/3/4-session behavior. The final Worker build and server-rendered app shell are checked before publishing. No new browser or native-device testing is claimed. The repository retains existing Drizzle alias and Cloudflare runtime type-declaration issues in its standalone TypeScript check.
