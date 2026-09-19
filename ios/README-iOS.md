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
- Native confirm and alert dialogs, and a status bar that follows the page's
  theme (System, Light or Dark, chosen under Appearance).
- **A native "you're offline" page** with automatic retry when the site cannot
  be reached.
- **A storage mirror with daily snapshots** of the browser-side copy of your
  record, as insurance for WebKit's own storage.

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
5. Plug in the iPhone, pick it in the device menu at the top of the window, and
   press **▶ Run**. Xcode builds, installs, and launches Baseline.
6. First install only: on the iPhone go to **Settings → General → VPN & Device
   Management** and trust your developer certificate. Then reopen the app.
7. The first launch takes you through **Sign in with ChatGPT** inside the app,
   exactly as Safari would. The sign-in bounces through ChatGPT's own hosts and
   back; the shell keeps that whole chain inside the app window. Once you are
   in, the session cookie lives in the app's own web storage, so you stay
   signed in on later launches.

If Xcode says the bundle identifier is unavailable, change **Bundle Identifier**
on the Baseline target to something unique (e.g. `com.yourname.baseline`).

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

The same project builds a native Mac app — **Mac Catalyst** is enabled. In the
device menu pick **My Mac (Mac Catalyst)** and press ▶ Run: you get Baseline
with a menu bar and a Dock icon. Downloads save through a normal save panel,
and **Print** in Summary opens the Mac print dialog. (The project deliberately
turns off the "Designed for iPad" Mac destination, so Catalyst is the Mac path.)

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
collects nothing and adds no analytics, tracking or third-party requests.
`ITSAppUsesNonExemptEncryption` is already set to `NO` in `App/Info.plist`:
the app uses only the system's TLS, which is exempt.

## How it works (for the curious)

- `App/BaselineApp.swift` is the whole per-app configuration: the name, the
  launch colours (`#eff3f5` light, `#081119` dark — the `--canvas` token as
  `app/baseline.css`, the last stylesheet, finally sets it; `html` and `body`
  both paint it), and the two lines that put the shell in **remote mode**:
  `remoteURL` pointing at the live site, and a `userAgentSuffix` so the server
  sees a Safari-style user agent plus `Baseline/1.0`. `App/Shell/` is the
  shared native shell, vendored verbatim; do not edit it here.
- In remote mode the shell does not serve a bundle and there is no `App/Web`
  folder. It loads `https://baseline.bardia-faghihvaseghi.chatgpt.site/` in a
  WKWebView with the default (persistent) website data store, which is where
  the ChatGPT session cookie and the page's `localStorage` live.
- **Navigation policy.** Anything on the site's own host, and anything the
  page is *redirected* through (the sign-in flow crosses other hosts), stays in
  the app. A link you *tap* to a foreign host opens in Safari. `target=_blank`
  links to the site itself open in the same view.
- **Offline.** If the document itself cannot be loaded (no network, DNS, a
  timeout), the shell shows its own "Baseline needs a connection" page in the
  page's colours, with a **Try again** button, and reloads by itself the next
  time the app comes to the foreground. A sign-in host failing mid-flow shows
  WebKit's usual error instead, and you can swipe back.
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
  **`Library/Application Support/WebShell/com.bardia.baseline/web-storage.json`**
  inside the app's container, and keeps **14 rolling daily snapshots** next to
  it as `web-storage-YYYY-MM-DD.json`. On the Mac the Catalyst build is not
  sandboxed, so the same folder is
  `~/Library/Application Support/WebShell/maccatalyst.com.bardia.baseline/`
  (the Catalyst build's bundle identifier carries the `maccatalyst.` prefix;
  the per-app folder is what keeps this app's mirror apart from any other
  shell app on the same Mac). If WebKit ever loses its storage, the mirror is
  restored on the next launch — once per launch, so data you erase stays
  erased — and a live key always wins over the mirror. The mirror holds plain
  JSON, covered by the same iOS data protection as the rest of the app's
  container and by your device backup.

The mirror is a copy of the browser-side cache, not a backup of the record.
**Download archive** in Data & goals is the backup, and it goes through the
share sheet. The `source/baseline-source.zip` inside that archive still comes
from the site itself — the app bundle carries no source. **Download code**
next to it is a plain link to that same ZIP on the site rather than an export
the page builds, so it is one for a browser; in the app, take the archive,
which already contains the source.

Deleting the app deletes the cookie, the local copy and the mirror. The record
on the server is untouched; sign in again and it is back.

## If the project won't open

The `.xcodeproj` was generated by XcodeGen from `project.yml`. If Xcode ever
rejects it: `brew install xcodegen`, then `cd ios && xcodegen generate` —
`project.yml` rebuilds an equivalent project (same names, signing, and Catalyst
support).
