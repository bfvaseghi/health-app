# Baseline for iPhone, iPad and Mac — the native app

This folder is a complete Xcode project. It runs the real Baseline — the private
site at `baseline.bardia-faghihvaseghi.chatgpt.site` — inside a small native
shell, so it looks and behaves like the web version because it *is* the web
version. Unlike the other shell apps, nothing is bundled: your record lives on
the server (D1), your photos in private storage (R2), and you sign in with
ChatGPT, so a copy of the page on the phone would have none of that. The app
loads the live site and adds only what a web view cannot do by itself.

What the native app adds on top of the web version:

- **Downloads through the share sheet** (a save panel on the Mac): the archive
  ZIP, JSON and CSV exports from Data & goals land in Files, AirDrop, Mail and
  so on instead of vanishing into a web view.
- **Summary → Print** opens the system print panel.
- A status bar that follows the page's theme (System, Light or Dark, chosen
  under Appearance), and native dialogs should the page ever call `alert()` or
  `confirm()` (today it uses its own in-page confirmations).
- **A native "Baseline needs a connection" page** when the site cannot be
  loaded, with a **Try again** button; the app also retries by itself the next
  time you bring it to the foreground.
- **A storage mirror** of the browser-side copy of your record, as insurance
  for WebKit's own storage. It runs only on Baseline's own origin: the sign-in
  hosts the flow passes through never see it.
- **A Home Screen and Lock Screen widget** (WidgetKit): the record card — last
  night's sleep in Baseline's serif, a 14-night line, and a short ledger of
  today's doses, water, protein and training in the app's own typography and
  colours. See [Add the widget](#add-the-widget).

## What you need

- A Mac with **Xcode** installed (free from the Mac App Store — a big download,
  start it first).
- Your iPhone and its cable.
- Your **Apple Developer Program** account. Paid membership means the app stays
  installed indefinitely (no 7-day re-signing) and unlocks TestFlight and the
  App Store.
- A connection. Baseline is a server-backed app: with no network you get the
  offline page, not a stale copy of the record.

## Install it on your iPhone (about 10 minutes)

1. On the Mac, clone this repo (or copy the whole folder over).
2. Open Xcode → **Settings…** → **Accounts** → **+** → **Apple ID**, and sign in
   with the Apple ID that holds your developer membership.
3. Double-click **`ios/Baseline.xcodeproj`**.
4. In the left sidebar click the blue **Baseline** project icon. In the target
   list select **Baseline** → **Signing & Capabilities** tab:
   - **Team**: choose your developer team.
   - **Automatically manage signing**: ticked.
   - Under **App Groups** you should see `group.com.bardia.baseline` checked. If
     it shows an error, press the refresh/repair arrow — Xcode registers the
     group on your account for you.
5. Select the **BaselineWidgetExtension** target and repeat step 4 (same Team,
   same App Group). Both targets must share the group or the widget can't read
   your record.
6. Plug in the iPhone, pick it in the device menu at the top of the window, and
   press **▶ Run**. Xcode builds, installs, and launches Baseline.
7. First install only: on the iPhone go to **Settings → General → VPN & Device
   Management** and trust your developer certificate. Then reopen the app.
8. The first launch takes you through **Sign in with ChatGPT** inside the app,
   exactly as Safari would. The sign-in bounces through ChatGPT's own hosts and
   back; the shell keeps that whole chain inside the app window. Once you are
   in, the session cookie lives in the app's own web storage, so you stay
   signed in on later launches.

If Xcode says the bundle identifier is unavailable, change **Bundle Identifier**
on the Baseline target to something unique (e.g. `com.yourname.baseline`), then
make the widget's identifier match it with `.widget` on the end
(`com.yourname.baseline.widget`). Leave the App Group alone.

## Add the widget

Long-press the Home Screen → **+** (top-left) → search **Baseline** → pick the
**small**, **medium** or **large** size → **Add Widget**. For the Lock Screen,
long-press the Lock Screen → **Customize** → tap the widget strip → **Baseline**
(a circle, a rectangle, or the one-line slot above the clock).

- It is the record card in Baseline's own look: the brand mark and the date,
  the rule with the green reference mark, last night's sleep in the serif
  (`7h 24m`, `Last night` — or `Latest · Sep 19` when the newest night is
  older), then a ledger of today's facts with hairlines between the rows:
  **Meds** (`1 of 2`, in the amber warning colour when a dose is marked
  missed), **Water** (`750 mL of 2.5 L`), **Protein** (`120 of 180 g`),
  **Training** (`2 this week`, else `Yesterday` / `9 days ago`), and on the
  large size **Meditation** (`10 min`) and **Journal** (`Written`).
- **Small** shows the sleep figure and the first two rows. **Medium** adds the
  14-night sleep line with the goal as a dashed rule, the night's clock times,
  four rows, and one line about what is still owed today (`1 dose left today`,
  `Water 1.5 L to go`, `All logged for today`). **Large** shows sleep and the
  latest weight side by side (`190.0 lb · −1.0 lb over 14 days`), the sleep
  line at full width, six rows each with the app's 14-day strip, and a footer
  with what is left and when the record was last written to. When there is no
  night in the browser-side copy the weight leads instead, then today's doses.
- **Lock Screen**: the circle shows the sleep hours under the mark (or today's
  doses as `1/2`); the rectangle `BASELINE`, `7h 24m last night` and
  `1 of 2 doses · 750 mL of 2.5 L`; the inline slot reads
  `Baseline · 1 dose left · 7h 24m`.
- It fills in as soon as you open Baseline once (the page writes the widget's
  data), and updates the moment you change anything. If the app has not been
  opened today it says so — `Opened 3 days ago`, in amber — and shows a dash
  for today's rows rather than yesterday's water as today's. Signed out, it
  says `Signed out`; a denied account, `Baseline is private`; an empty record,
  `Nothing recorded yet`. Every state keeps the header and the rule, so the
  card is always recognisably Baseline.
- With **Show Widget Previews While Locked** off, iOS blurs the health figures
  and leaves the header, the labels and the date readable.
- Tapping it opens Baseline on Today.
- It follows the system light/dark appearance (not the theme chosen inside the
  app), so it matches the widgets around it.

## Your data is already there

There is nothing to move over. The record is the one on the server, so the app
shows the same Today, Sleep, Workouts, Mind, Meds, Labs, Summary and Data &
goals you see in the browser, with the same edits, the same photos and the same
snapshots. The **Apple Health** (Health Auto Export) and **Apple Notes**
(Shortcut) connections keep working unchanged: they talk to the server, not to
the app, so nothing about them needs to be set up again.

Open **`?demo=1`** in a browser if you want to look at the synthetic record; the
app itself always opens the real one.

## The Mac app

The same project builds a native Mac app — **Mac Catalyst** is enabled on both
targets. In the device menu pick **My Mac (Mac Catalyst)** and press ▶ Run: you
get Baseline with a menu bar and a Dock icon, and the widget in the Mac widget
gallery. Downloads save through a normal save panel, and **Print** in Summary
opens the Mac print dialog. (The project deliberately turns off the "Designed
for iPad" Mac destination, so Catalyst is the Mac path.)

No Xcode at all? Open the site in Safari on the Mac → **File → Add to Dock**.
macOS turns it into a standalone web app.

## TestFlight and the App Store

With the paid account you can install without a cable and keep builds fresh:

1. In the device menu choose **Any iOS Device (arm64)**.
2. **Product → Archive**, wait for the build.
3. In the Organizer window: **Distribute App → TestFlight (Internal Testing)**.
4. Create the app record at [App Store Connect](https://appstoreconnect.apple.com)
   if prompted, then install through the TestFlight app on your phone.

Builds live 90 days; re-archiving renews them. For an App Store submission the
privacy label describes what the site does, not the shell: the shell itself
collects nothing and adds no analytics, tracking or third-party requests. The
widget adds nothing to that label either — its data (`widget-feed.json`) is
written by the app into its own App Group container on the device and never
leaves it, and it holds numbers, dates and category words only.
`ITSAppUsesNonExemptEncryption` is already set to `NO` in `App/Info.plist`:
the app uses only the system's TLS, which is exempt. The two bundled typefaces
(Instrument Serif, Hanken Grotesk) are under the SIL Open Font License 1.1;
their licence texts ship inside the widget (`Widget/Fonts/*-OFL.txt`).

## How it works (for the curious)

- `App/BaselineApp.swift` is the per-app configuration: the name, the
  launch colours (`#eff3f5` light, `#081119` dark — the `--canvas` token as
  `app/baseline.css`, the last stylesheet, finally sets it; `html` and `body`
  both paint it), the two lines that put the shell in **remote mode**
  (`remoteURL` pointing at the live site, and a `userAgentSuffix` so the
  server sees a Safari-style user agent plus `Baseline/1.0`), the App Group
  the storage mirror lives in, and the widget feed script below.
  `App/Shell/` is the shared native shell, vendored verbatim; do not edit it
  here.
- `App/BaselineFeed.swift` holds the **widget feed builder**, a small
  JavaScript the shell injects after `bridge.js` on Baseline's own origin only
  (it returns at once wherever `window.nativeShell` is absent, which is every
  sign-in host). It reads the page's own `localStorage["bardia-health-v1"]`
  copy of the record and posts a reduced feed through
  `window.nativeShell.widgetFeed(...)`: at document start, 1.5 s after load,
  500 ms after the page writes that key (and only when the content changed,
  so a tap does not reload the widget), and whenever the page goes to the
  background. The feed holds the goals (sleep hours, water and protein
  targets, whether medication is tracked), each active medication as its
  schedule and its last 14 days of yes/no answers, the last 14 days' weight,
  protein, water, meditation minutes and journaled flag, the last 14 nights
  (one per night, preferring Oura > Apple > Whoop > manual), up to 30 weights
  from the last 90 days, the last workout date, this week's session count and
  the dates trained, and the date of the newest entry. It carries **no**
  medication names, exercise or workout names, notes, journal text, lab
  results, photos, ids or anything from the Apple Health sync lane (which the
  page keeps out of the browser-side copy). Sign-out is not visible in that
  copy, so the script also watches the status of the page's own
  `/api/health-state` request — never its body — and the sign-out link: a
  `401` or the link makes the widget say `Signed out`, a `403` `Baseline is
  private`, and those feeds carry no figures at all. Nothing is fetched by
  the script itself, and it never touches `location`.
- `Widget/BaselineWidget.swift` is the widget (WidgetKit + SwiftUI). It reads
  only `widget-feed.json` through `App/Shell/WidgetFeed.swift` — never the
  storage mirror beside it — and recomputes everything about "today" (due
  doses, today's water, `Last night`, the stale note) when it draws, from the
  device's own calendar day, so nothing about today is baked into the feed.
  Its timeline turns over at local midnight on its own; every write in the
  app reloads it immediately. `Widget/Fonts/` carries the site's two typefaces
  as TTFs (Instrument Serif Regular; Hanken Grotesk Medium, SemiBold and
  Bold, static instances built from the family's variable font), listed in
  `Widget/Info.plist` under `UIAppFonts`; if a file were missing the widget
  falls back to the system fonts rather than failing.
- `Tests/WidgetPreview/` renders the widget at every size, light and dark, to
  PNG on an iPhone simulator (the `BaselineWidgetPreviews` scheme; the
  "Widget previews" GitHub workflow uploads the images), so the card can be
  looked at without a device.
- In remote mode the shell does not serve a bundle and there is no `App/Web`
  folder. It loads `https://baseline.bardia-faghihvaseghi.chatgpt.site/` in a
  WKWebView with the default (persistent) website data store, which is where
  the ChatGPT session cookie and the page's `localStorage` live.
- **Navigation policy.** Anything on the site's own host, and anything the
  page is *redirected* through (the sign-in flow crosses other hosts), stays in
  the app. A link you *tap* from the site to a foreign host opens in Safari;
  taps on a sign-in page ("Continue with…") stay in the app so the callback
  lands in the app's own cookies. `target=_blank` links to the site itself
  open in the same view.
- **Offline.** If the site's own document cannot be loaded, the shell shows
  its own page in the page's colours with a **Try again** button: "Baseline
  needs a connection" for a network failure (no connection, DNS, a timeout),
  "Baseline could not load" for anything else (a captive portal's
  certificate, a wrong clock), so a failed first load never leaves a blank
  screen. The app retries by itself the next time it comes to the foreground.
  A failed sign-in callback is retried from the site's root rather than by
  replaying the one-time callback URL. A sign-in host failing mid-flow leaves
  the previous page in place, and you can swipe back.
- **One origin only.** The bridge below runs in every document the view
  shows, including the sign-in hosts the flow redirects through, but it hands
  the storage mirror, the restore data, notifications and app messages only
  to Baseline's own origin; the native side checks the sending frame's origin
  again before accepting any of those messages. On other origins the page gets
  share, print and download support and nothing else.
- **Files the web view cannot show** (a ZIP served by the site, such as
  **Download code**) are fetched as a download and handed to the share sheet,
  or the Mac save panel, the same way the page's own exports are.
- `App/Shell/bridge.js` is injected before the page's own scripts. It mirrors
  every `localStorage` write to native storage, and turns `<a download>` clicks
  on blob: URLs (`downloadBlob` in `app/ui/format.ts`, which every export uses),
  `navigator.share`, `window.print()` and `confirm()` into their native
  equivalents. The page does not need to know any of this.
- The page draws under the status bar: it already declares `viewport-fit=cover`
  and `.mobile-head` pads its top with `env(safe-area-inset-top)`.
- Edge swipes go back and forward, as in Safari, because the site has real
  navigation and a sign-in flow you may need to back out of. Rotation stays on.

## Where the data lives

The record itself is on the server. What is on the device:

- **WebKit's website data** for the site's origin — the ChatGPT session cookie,
  and the page's own `localStorage` copy of the record under the same
  `bardia-health-v1` key (and `bardia-health-theme`) the web version uses. The
  page merges that copy with the server on every load, exactly as in Safari.
- As insurance for that copy, the shell mirrors every `localStorage` write to
  **`WebShell/web-storage.json`** inside the **App Group container**
  `group.com.bardia.baseline`, next to the widget's `widget-feed.json` — the
  group is what lets the widget read the feed. This app keeps **no dated
  snapshots** of the mirror: the record lives on the server, which keeps its
  own "Earlier versions", and the site's **Erase all data** must not leave
  old copies of the erased record on the device. A mirror written by an
  earlier build of this app (in `Library/Application Support/WebShell/
  com.bardia.baseline/`, before the App Group) is moved into the container on
  first launch and the old folder is deleted. If the group is not set up on
  the device (the capability missing on a target), the mirror falls back to
  that older folder and the widget shows its placeholder until it is. If
  WebKit ever loses its storage, the mirror is restored on the next launch —
  once per launch, so data you erase stays erased — and a live key always
  wins over the mirror. The mirror and the feed hold plain JSON, covered by
  the same iOS data protection as the rest of the app's container and by
  your device backup; the widget itself opens only the feed, never the
  mirror.

The mirror is a copy of the browser-side cache, not a backup of the record.
**Download archive** in Data & goals is the backup, and it goes through the
share sheet. The `source/baseline-source.zip` inside that archive still comes
from the site itself — the app bundle carries no source. **Download code**
next to it is a plain link to that ZIP on the site; the shell downloads it and
offers the same share sheet.

Deleting the app deletes the cookie, the local copy, the mirror and the widget's
feed. The record on the server is untouched; sign in again and it is back.

## If the project won't open

The `.xcodeproj` was generated by XcodeGen from `project.yml`. If Xcode ever
rejects it: `brew install xcodegen`, then `cd ios && xcodegen generate` —
`project.yml` rebuilds an equivalent project (same three targets — the app, the
widget extension and the preview-render tests — the same names, signing,
entitlements and Catalyst support).
