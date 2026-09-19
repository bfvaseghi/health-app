import UIKit

/// Everything the native shell needs to know about one app.
///
/// The app supplies a value from its `@main` delegate (see `ShellAppDelegate`).
/// The shell itself is app-agnostic: it serves the bundled web folder at
/// `scheme://host/`, mirrors the page's localStorage, and bridges exports,
/// sharing, printing, dialogs, notifications, and chrome colours. Anything the
/// app wants beyond that goes through `extraBootScript` and `appMessageHandler`.
struct ShellConfig {
    /// Shown in native dialogs (alert titles, print job name).
    var appName: String

    /// The custom URL scheme the bundled site is served under, e.g. `tandem`
    /// gives `tandem://localhost/`. Only letters, digits, `+`, `-` and `.`;
    /// never `http`, `https`, `file`, `data` or `blob`.
    var scheme: String

    /// `localhost` is deliberate: WebKit treats a `localhost` host as a
    /// potentially trustworthy origin, so `crypto.subtle`, the clipboard and
    /// the other secure-context APIs work exactly as they do over https.
    var host: String = "localhost"

    /// The bundle folder reference that holds the web app (a *folder*, not a
    /// group, so the directory structure survives into the app bundle).
    var webFolder: String = "Web"

    /// The document served for `/`. Sub-directories serve their own
    /// `index.html`.
    var entryFile: String = "index.html"

    /// Set for an app whose web version lives on a server (sign-in, a synced
    /// record, private uploads) rather than in the bundle: the shell loads
    /// this URL instead of `scheme://host/`, keeps navigation inside that
    /// host and the sign-in hosts it redirects through, and shows a native
    /// "you're offline" page when the site cannot be reached. The bundled
    /// folder and the custom scheme are unused in this mode.
    var remoteURL: URL? = nil

    /// Appended to WebKit's user agent (`applicationNameForUserAgent`), so a
    /// server sees an ordinary Safari-style agent plus the app's name.
    var userAgentSuffix: String? = nil

    /// `true`: the page fills the whole screen and its CSS handles
    /// `env(safe-area-inset-*)` (the page must set `viewport-fit=cover`).
    /// `false`: the page starts below the status bar, the way an installed
    /// web app with an opaque status bar does; the shell paints that strip in
    /// the page's own background colour.
    var extendsUnderStatusBar: Bool = true

    /// Painted behind the page until it reports its real background colour
    /// (matches the launch screen, so there is no flash on start).
    var lightBackground: UIColor
    var darkBackground: UIColor

    /// Edge swipes for history navigation. Off for single-document apps that
    /// route by hash; on for apps that navigate between real documents.
    var allowsBackForwardGestures: Bool = false

    /// Whether the page gets a `Notification` polyfill and the local
    /// notification scheduler (`window.nativeShell.notifications`).
    var notificationsEnabled: Bool = false

    /// Interface orientations are configured in Info.plist; this only decides
    /// whether iPhone rotation is honoured by the shell's view controller.
    var lockedToPortraitOnPhone: Bool = false

    /// Where the storage mirror lives. Defaults to
    /// `Application Support/WebShell/`; an app that shares data with a widget
    /// can point this at its App Group container instead.
    var storageDirectory: URL = ShellConfig.defaultStorageDirectory()

    /// Rolling daily snapshots of the mirror to keep (0 disables them).
    var snapshotDays: Int = 14

    /// JavaScript injected at document start, after the bridge, for the main
    /// frame only. Use it for an app-specific store or bridge object.
    var extraBootScript: String? = nil

    /// Called once on first launch (when the mirror file does not exist yet)
    /// to seed localStorage keys from an older native format. The returned
    /// pairs are restored into the page only where the page has no such key.
    var legacyImport: (() -> [String: String])? = nil

    /// App-specific messages posted from the page as
    /// `window.nativeShell.send(name, payload)` / `request(name, payload)`.
    /// For `request`, call `reply(ok, payload)` exactly once.
    var appMessageHandler: ((AppMessage, WebShellViewController) -> Void)? = nil

    /// `Application Support/WebShell/<bundle id>/`. The bundle id keeps the
    /// apps apart on a Mac, where an unsandboxed Catalyst build shares
    /// `~/Library/Application Support` with every other app.
    static func defaultStorageDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("WebShell", isDirectory: true)
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "app", isDirectory: true)
    }

    /// The origin the page runs at.
    var originURL: URL {
        remoteURL ?? URL(string: "\(scheme)://\(host)/")!
    }

    /// The host the app lives on: the remote site, or `localhost` for a bundle.
    var homeHost: String {
        remoteURL?.host?.lowercased() ?? host.lowercased()
    }
}

/// An app-specific message from the page.
struct AppMessage {
    let name: String
    let payload: Any?
    /// Non-nil when the page used `request(...)` and awaits an answer.
    let reply: ((Bool, Any?) -> Void)?
}
