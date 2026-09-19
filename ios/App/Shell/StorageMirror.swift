import Foundation

/// A native copy of the page's localStorage.
///
/// WebKit's own storage is the live copy and always wins. This mirror exists
/// so that if WebKit ever loses it (a storage purge, an OS upgrade that moves
/// the data store, a corrupted database), the app starts with the user's data
/// instead of a blank first run. It also gives the app rolling daily
/// snapshots, which the web version could never offer.
///
/// All methods are called on the main thread (script messages arrive there);
/// disk writes happen on a serial queue with the data captured by value.
final class StorageMirror {
    static let shared = StorageMirror()

    private var directory: URL = ShellConfig.defaultStorageDirectory()
    private var fileName = "web-storage.json"
    private var snapshotDays = 14
    private var keys: [String: String] = [:]
    private var dirty = false
    private var loaded = false
    /// Set when the page erased everything or asked for a purge: the next
    /// write deletes the rolling snapshots instead of taking one, so the
    /// state that was just wiped never lingers in a dated copy.
    private var purgeOnNextWrite = false
    private var pendingWrite: DispatchWorkItem?
    private let queue = DispatchQueue(label: "webshell.storage-mirror", qos: .utility)

    private var fileURL: URL { directory.appendingPathComponent(fileName) }

    func configure(with config: ShellConfig) {
        directory = config.storageDirectory
        fileName = "web-storage.json"
        snapshotDays = max(0, config.snapshotDays)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // An app that moved its mirror (into an App Group, for a widget) keeps
        // the data it wrote at the default location before the move, and then
        // removes the old folder: it held the journal and its dated snapshots
        // in plain text, where no later purge or erase would reach them.
        let previous = ShellConfig.defaultStorageDirectory()
        let fm = FileManager.default
        if previous != directory, !directory.path.hasPrefix(previous.path + "/"), fm.fileExists(atPath: previous.path) {
            let old = previous.appendingPathComponent(fileName)
            if !fm.fileExists(atPath: fileURL.path), fm.fileExists(atPath: old.path) {
                try? fm.copyItem(at: old, to: fileURL)
            }
            if fm.fileExists(atPath: fileURL.path) || !fm.fileExists(atPath: old.path) {
                try? fm.removeItem(at: previous)
            }
        }
        load()
        if !FileManager.default.fileExists(atPath: fileURL.path), let importer = config.legacyImport {
            // First launch of the mirror: seed from an older native format so
            // an upgrade never shows an empty app.
            let imported = importer()
            if !imported.isEmpty {
                for (key, value) in imported where keys[key] == nil { keys[key] = value }
                dirty = true
                flush()
            }
        }
    }

    /// The keys to restore into the page at boot.
    func restoreDictionary() -> [String: String] {
        if !loaded { load() }
        return keys
    }

    // MARK: Incremental updates from the page

    func apply(op: String, key: String?, value: String?) {
        switch op {
        case "set":
            guard let key = key else { return }
            keys[key] = value ?? ""
        case "remove":
            guard let key = key else { return }
            keys.removeValue(forKey: key)
        case "clear":
            keys.removeAll()
            purgeOnNextWrite = true
        default:
            return
        }
        dirty = true
        scheduleWrite()
    }

    /// The page's authoritative snapshot (sent when it goes to the
    /// background). Replaces the mirror wholesale.
    func replace(with snapshot: [String: String]) {
        keys = snapshot
        if snapshot.isEmpty { purgeOnNextWrite = true }
        dirty = true
        flush()
    }

    /// An app that erases everything, or turns encryption on, means it: the
    /// rolling snapshots must not keep a fortnight of what was just deleted or
    /// was plain text a moment ago. Reachable from the page through
    /// `window.nativeShell.send("purgeSnapshots")`. Writes the current keys and
    /// deletes every dated copy in the same queued step, so no copy of the
    /// pre-purge file can be taken in between.
    func purgeSnapshots() {
        purgeOnNextWrite = true
        dirty = true
        flush()
    }

    /// Write now if anything changed.
    func flush() {
        pendingWrite?.cancel()
        pendingWrite = nil
        guard dirty else { return }
        dirty = false
        let purge = purgeOnNextWrite
        purgeOnNextWrite = false
        write(keys, purgingSnapshots: purge)
    }

    // MARK: Disk

    private func load() {
        loaded = true
        guard let data = try? Data(contentsOf: fileURL),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let stored = object["keys"] as? [String: String] else {
            keys = [:]
            return
        }
        keys = stored
    }

    private func scheduleWrite() {
        pendingWrite?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.flush() }
        pendingWrite = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: item)
    }

    private func write(_ snapshot: [String: String], purgingSnapshots purge: Bool) {
        let url = fileURL
        let directory = self.directory
        let snapshotDays = self.snapshotDays
        queue.async {
            let payload: [String: Any] = [
                "version": 1,
                "savedAt": ISO8601DateFormatter().string(from: Date()),
                "keys": snapshot
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return }
            if purge {
                Self.deleteSnapshots(in: directory)
            } else if snapshotDays > 0 {
                Self.snapshotDaily(current: url, in: directory, keep: snapshotDays)
            }
            // Atomic: a torn file must never eat the user's data.
            try? data.write(to: url, options: .atomic)
        }
    }

    private static func deleteSnapshots(in directory: URL) {
        guard let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return }
        for name in names where name.hasPrefix("web-storage-") && name.hasSuffix(".json") {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    /// Before the first overwrite of each local day, keep yesterday's file.
    private static func snapshotDaily(current: URL, in directory: URL, keep: Int) {
        let manager = FileManager.default
        guard manager.fileExists(atPath: current.path) else { return }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        let name = "web-storage-\(formatter.string(from: Date())).json"
        let target = directory.appendingPathComponent(name)
        if !manager.fileExists(atPath: target.path) {
            try? manager.copyItem(at: current, to: target)
        }
        guard let names = try? manager.contentsOfDirectory(atPath: directory.path) else { return }
        let snapshots = names.filter { $0.hasPrefix("web-storage-") && $0.hasSuffix(".json") }.sorted(by: >)
        for old in snapshots.dropFirst(keep) {
            try? manager.removeItem(at: directory.appendingPathComponent(old))
        }
    }
}
