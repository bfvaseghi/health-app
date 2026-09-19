import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// The file a Home Screen widget reads.
///
/// The page decides what the widget shows and hands it over as JSON through
/// `window.nativeShell.widgetFeed(feed)`; the shell writes it beside the
/// storage mirror and asks WidgetKit to reload. Both the app and its widget
/// extension compile this file, so they agree on the path: the app points
/// `ShellConfig.storageDirectory` at the App Group container, and the widget
/// calls `load(appGroup:)` with the same group identifier.
enum WidgetFeed {
    static let fileName = "widget-feed.json"

    static func url(in directory: URL) -> URL {
        directory.appendingPathComponent(fileName)
    }

    /// Atomic write, then a timeline reload. Called on the main thread with a
    /// small payload, so the write is synchronous on purpose: the reload must
    /// not race ahead of the file.
    static func save(_ json: String, in directory: URL) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? json.data(using: .utf8)?.write(to: url(in: directory), options: .atomic)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    static func load(from directory: URL) -> Data? {
        try? Data(contentsOf: url(in: directory))
    }

    /// Reads the feed the way a widget extension does: from the App Group the
    /// app writes into. Nil when the app has not run yet or the group is not
    /// set up on this device.
    static func load(appGroup: String, subdirectory: String = "WebShell") -> Data? {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return nil }
        return load(from: container.appendingPathComponent(subdirectory, isDirectory: true))
    }

    /// The App Group directory an app should hand to `ShellConfig.storageDirectory`
    /// so its mirror, snapshots and widget feed live where the widget can read
    /// them. Falls back to the shell's default location when the group is
    /// unavailable (the capability not yet enabled), so the app still works;
    /// the widget then shows its placeholder until the group does.
    ///
    /// This file is the only shell file a widget extension compiles, so the
    /// fallback is spelled out here rather than taken from ShellConfig (which
    /// pulls in the whole shell): `Application Support/WebShell/<bundle id>/`.
    static func storageDirectory(appGroup: String, subdirectory: String = "WebShell") -> URL {
        if let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) {
            return container.appendingPathComponent(subdirectory, isDirectory: true)
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("WebShell", isDirectory: true)
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "app", isDirectory: true)
    }
}
