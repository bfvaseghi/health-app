import UIKit

/// Baseline for iPhone, iPad and Mac: the private health record, unchanged,
/// inside the native shell (see App/Shell/). Everything app-specific lives here.
///
/// Baseline is not a bundled page. The record lives on the server (D1),
/// photos in private R2, and the owner signs in through ChatGPT, so the shell
/// runs in remote mode: it loads the live site and adds only what a web view
/// cannot do by itself (share-sheet downloads, the print panel, native
/// dialogs, a status bar that follows the page's theme, a native offline page
/// and the localStorage mirror). No App/Web folder ships with this app.
///
/// The Home Screen widget (Widget/BaselineWidget.swift) reads a small feed the
/// page builds from its own browser-side copy of the record; the script that
/// builds it is `BaselineFeedScript` (App/BaselineFeed.swift).
@main
final class BaselineAppDelegate: ShellAppDelegate {
    /// Shared with the widget extension; both targets carry the entitlement.
    static let appGroup = "group.com.bardia.baseline"

    override func makeConfig() -> ShellConfig {
        var config = ShellConfig(
            appName: "Baseline",
            // Unused in remote mode, but the shell requires a scheme.
            scheme: "baseline",
            entryFile: "index.html",
            // The page's `--canvas` as the live site computes it: app/baseline.css
            // is imported last and overrides globals.css's #edf0eb / #102330
            // with #eff3f5 light and #081119 dark (html and body both paint
            // var(--canvas)). Same values as Assets.xcassets/LaunchBackground.colorset.
            lightBackground: UIColor(red: 0xEF / 255, green: 0xF3 / 255, blue: 0xF5 / 255, alpha: 1),
            darkBackground: UIColor(red: 0x08 / 255, green: 0x11 / 255, blue: 0x19 / 255, alpha: 1)
        )
        // Remote mode: the live site instead of a bundle. Navigation stays in
        // the view for this host and for the hosts the ChatGPT sign-in
        // redirects through; a failed load shows the native offline page.
        config.remoteURL = URL(string: "https://baseline.bardia-faghihvaseghi.chatgpt.site/")
        // A Safari-style agent plus the app's name, so the sign-in flow sees
        // an ordinary browser and the server can tell the app apart. The Mac
        // build's agent already says Macintosh, so it takes Safari's desktop
        // tail; "Mobile" there would be a contradiction.
        #if targetEnvironment(macCatalyst)
        config.userAgentSuffix = "Version/17.0 Safari/605.1.15 Baseline/1.0"
        #else
        config.userAgentSuffix = "Version/17.0 Mobile/15E148 Safari/604.1 Baseline/1.0"
        #endif
        // No dated snapshots of the browser-side copy: the record is on the
        // server, which keeps its own "Earlier versions", and the site's
        // "Erase all data" must not leave fourteen copies of the erased
        // record on the device. The live mirror (one file) stays.
        config.snapshotDays = 0
        // The mirror and the widget feed live in the App Group container,
        // where the widget extension can read the feed. Falls back to the
        // shell's default folder when the group is not set up yet; the widget
        // then shows its placeholder until it is.
        config.storageDirectory = WidgetFeed.storageDirectory(appGroup: Self.appGroup)
        // The widget feed builder, injected after bridge.js on every document
        // the main frame shows; it does nothing where window.nativeShell is
        // absent (the sign-in hosts), and never throws into the page.
        config.extraBootScript = BaselineFeedScript.source
        // The page sets viewport-fit=cover (app/layout.tsx) and .mobile-head
        // pads its top with env(safe-area-inset-top) (app/field-record.css,
        // app/globals.css), so it draws under the status bar itself.
        config.extendsUnderStatusBar = true
        // A signed-in site with real navigation and a sign-in flow the user
        // may need to back out of.
        config.allowsBackForwardGestures = true
        config.notificationsEnabled = false
        // The manifest says portrait, but the CSS handles landscape; leave
        // rotation on everywhere.
        config.lockedToPortraitOnPhone = false
        return config
    }
}
