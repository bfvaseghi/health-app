import UIKit
import UserNotifications
import WebKit

/// Receives every message `bridge.js` posts and answers it.
///
/// Message shapes (all dictionaries with a `type`):
///   storage {op, key?, value?}            storageSnapshot {data}
///   exportFile {id, name, mime, base64}   share {id, title, text, url, files:[{name,mime,base64}]}
///   print                                  chrome {background, systemDark}
///   haptic {kind}                          notifications {id?, action, items?, title?, body?}
///   app {id?, name, payload}
/// Requests that carry an `id` are settled with `window.__shell.settle(id, ok, payload)`.
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "shell"

    weak var controller: WebShellViewController?
    private let config: ShellConfig
    /// The last permission the system reported, kept in UserDefaults so the
    /// boot script can hand the page an accurate value synchronously; the
    /// asynchronous refresh below corrects it moments later if it changed.
    private(set) var cachedNotificationPermission: String
    /// The last items the page asked to schedule. UNUserNotificationCenter
    /// refuses requests while permission is undetermined or denied, so a
    /// reminder set before the permission prompt is re-armed the moment the
    /// user grants it.
    private var lastScheduledItems: [[String: Any]] = []
    private static let notificationPrefix = "webshell.daily."
    private static let immediatePrefix = "webshell.now."
    private static let permissionDefaultsKey = "webshell.notificationPermission"

    init(config: ShellConfig) {
        self.config = config
        self.cachedNotificationPermission = UserDefaults.standard.string(forKey: NativeBridge.permissionDefaultsKey) ?? "default"
        super.init()
        if config.notificationsEnabled { refreshNotificationPermission() }
    }

    // MARK: Dispatch

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == NativeBridge.handlerName,
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }
        let requestID = body["id"] as? Int
        switch type {
        case "storage":
            StorageMirror.shared.apply(op: body["op"] as? String ?? "",
                                       key: body["key"] as? String,
                                       value: body["value"] as? String)
        case "storageSnapshot":
            if let data = body["data"] as? [String: String] { StorageMirror.shared.replace(with: data) }
        case "exportFile":
            handleExport(body, requestID: requestID)
        case "share":
            handleShare(body, requestID: requestID)
        case "print":
            controller?.presentPrint()
        case "chrome":
            controller?.applyChrome(background: body["background"] as? String ?? "", systemDark: body["systemDark"] as? Bool ?? false)
        case "haptic":
            playHaptic(body["kind"] as? String ?? "light")
        case "notifications":
            handleNotifications(body, requestID: requestID)
        case "app":
            switch body["name"] as? String {
            case "purgeSnapshots":
                StorageMirror.shared.purgeSnapshots()
                settle(requestID, ok: true)
            case "widgetFeed":
                // The page hands over what its widget should show; the file
                // lands next to the storage mirror (an App Group container
                // when the app has a widget) and the timelines reload.
                if let json = NativeBridge.jsonString(body["payload"]) {
                    WidgetFeed.save(json, in: config.storageDirectory)
                    settle(requestID, ok: true)
                } else {
                    settle(requestID, ok: false, payload: "The widget feed must be JSON.")
                }
            default:
                handleAppMessage(body, requestID: requestID)
            }
        default:
            break
        }
    }

    // MARK: Answering the page

    func settle(_ requestID: Int?, ok: Bool, payload: Any? = nil) {
        guard let id = requestID, let webView = controller?.webView else { return }
        let encoded: String
        if let payload = payload, JSONSerialization.isValidJSONObject(payload),
           let data = try? JSONSerialization.data(withJSONObject: payload),
           let json = String(data: data, encoding: .utf8) {
            encoded = json
        } else if let text = payload as? String,
                  let data = try? JSONSerialization.data(withJSONObject: [text]),
                  let json = String(data: data, encoding: .utf8) {
            encoded = String(json.dropFirst().dropLast()) // the bare string literal
        } else {
            encoded = "null"
        }
        let script = "window.__shell && window.__shell.settle(\(id), \(ok ? "true" : "false"), \(encoded));"
        DispatchQueue.main.async { webView.evaluateJavaScript(script, completionHandler: nil) }
    }

    // MARK: Files

    private func handleExport(_ body: [String: Any], requestID: Int?) {
        guard let controller = controller,
              let url = writeTemporaryFile(name: body["name"] as? String, base64: body["base64"] as? String) else {
            settle(requestID, ok: false, payload: "The export could not be written.")
            return
        }
        controller.presentExport(fileURL: url) { [weak self] completed in
            self?.settle(requestID, ok: true, payload: ["completed": completed])
        }
    }

    private func handleShare(_ body: [String: Any], requestID: Int?) {
        guard let controller = controller else { return settle(requestID, ok: false, payload: "Sharing is unavailable.") }
        var items: [Any] = []
        for entry in body["files"] as? [[String: Any]] ?? [] {
            if let url = writeTemporaryFile(name: entry["name"] as? String, base64: entry["base64"] as? String) {
                items.append(url)
            }
        }
        if items.isEmpty {
            let text = (body["text"] as? String ?? "")
            let urlString = body["url"] as? String ?? ""
            if !text.isEmpty { items.append(text) }
            if let url = URL(string: urlString), !urlString.isEmpty { items.append(url) }
            if items.isEmpty, let title = body["title"] as? String, !title.isEmpty { items.append(title) }
        }
        guard !items.isEmpty else { return settle(requestID, ok: false, payload: "Nothing to share.") }
        controller.presentShareSheet(items: items) { [weak self] completed in
            // Web Share rejects with AbortError when the sheet is dismissed.
            self?.settle(requestID, ok: completed, payload: completed ? nil : "AbortError")
        }
    }

    /// Exports are staged under tmp/Exports with the page's own filename, so
    /// the share sheet and save panel show a sensible name.
    private func writeTemporaryFile(name: String?, base64: String?) -> URL? {
        guard let base64 = base64, let data = Data(base64Encoded: base64, options: [.ignoreUnknownCharacters]) else { return nil }
        let rawName = (name ?? "download").trimmingCharacters(in: .whitespacesAndNewlines)
        let safeName = rawName.isEmpty ? "download" : rawName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: "\\", with: "-")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("Exports", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appendingPathComponent(safeName)
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    // MARK: Haptics

    private func playHaptic(_ kind: String) {
        #if !targetEnvironment(macCatalyst)
        switch kind {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "soft": UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "selection": UISelectionFeedbackGenerator().selectionChanged()
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
        #endif
    }

    // MARK: Notifications

    private func handleNotifications(_ body: [String: Any], requestID: Int?) {
        guard config.notificationsEnabled else {
            settle(requestID, ok: false, payload: "Notifications are not enabled for this app.")
            return
        }
        let center = UNUserNotificationCenter.current()
        switch body["action"] as? String ?? "" {
        case "request":
            center.requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] _, _ in
                self?.refreshNotificationPermission { permission in
                    guard let self = self else { return }
                    if permission == "granted", !self.lastScheduledItems.isEmpty {
                        self.scheduleDaily(self.lastScheduledItems)
                    }
                    self.settle(requestID, ok: true, payload: ["permission": permission])
                }
            }
        case "status":
            center.getPendingNotificationRequests { [weak self] requests in
                let scheduled = requests.map(\.identifier)
                    .filter { $0.hasPrefix(NativeBridge.notificationPrefix) }
                    .map { String($0.dropFirst(NativeBridge.notificationPrefix.count)) }
                self?.refreshNotificationPermission { permission in
                    self?.settle(requestID, ok: true, payload: ["permission": permission, "scheduled": scheduled])
                }
            }
        case "schedule":
            let items = body["items"] as? [[String: Any]] ?? []
            lastScheduledItems = items
            scheduleDaily(items)
        case "clear":
            lastScheduledItems = []
            center.getPendingNotificationRequests { requests in
                let ours = requests.map(\.identifier).filter { $0.hasPrefix(NativeBridge.notificationPrefix) }
                center.removePendingNotificationRequests(withIdentifiers: ours)
            }
        case "now":
            let content = UNMutableNotificationContent()
            content.title = (body["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? config.appName
            content.body = body["body"] as? String ?? ""
            content.sound = .default
            let id = NativeBridge.immediatePrefix + UUID().uuidString
            center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
        default:
            settle(requestID, ok: false, payload: "Unknown notification action.")
        }
    }

    /// Replaces every repeating daily notification with `items`.
    private func scheduleDaily(_ items: [[String: Any]]) {
        let center = UNUserNotificationCenter.current()
        let appName = config.appName
        center.getPendingNotificationRequests { requests in
            let stale = requests.map(\.identifier).filter { $0.hasPrefix(NativeBridge.notificationPrefix) }
            center.removePendingNotificationRequests(withIdentifiers: stale)
            for item in items {
                guard let hour = item["hour"] as? Int, let minute = item["minute"] as? Int,
                      (0...23).contains(hour), (0...59).contains(minute) else { continue }
                let id = (item["id"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "t\(hour)-\(minute)"
                let content = UNMutableNotificationContent()
                content.title = (item["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? appName
                content.body = item["body"] as? String ?? ""
                content.sound = .default
                var components = DateComponents()
                components.hour = hour
                components.minute = minute
                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                // Errors (typically "not allowed" before permission) are not
                // fatal: the items are kept and re-armed once permission lands.
                center.add(UNNotificationRequest(identifier: NativeBridge.notificationPrefix + id, content: content, trigger: trigger)) { _ in }
            }
        }
    }

    private func refreshNotificationPermission(_ completion: ((String) -> Void)? = nil) {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            let permission: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: permission = "granted"
            case .denied: permission = "denied"
            default: permission = "default"
            }
            DispatchQueue.main.async {
                self?.cachedNotificationPermission = permission
                UserDefaults.standard.set(permission, forKey: NativeBridge.permissionDefaultsKey)
                if let webView = self?.controller?.webView {
                    let script = "window.nativeShell && window.nativeShell.notifications && window.nativeShell.notifications._setPermission(\"\(permission)\");"
                    webView.evaluateJavaScript(script, completionHandler: nil)
                }
                completion?(permission)
            }
        }
    }

    /// A message payload as a JSON string: a string is taken as already
    /// encoded, anything else is serialised.
    static func jsonString(_ payload: Any?) -> String? {
        if let text = payload as? String { return text }
        guard let payload = payload, JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: App-specific messages

    private func handleAppMessage(_ body: [String: Any], requestID: Int?) {
        guard let controller = controller, let name = body["name"] as? String else { return }
        guard let handler = config.appMessageHandler else {
            settle(requestID, ok: false, payload: "No handler for \(name).")
            return
        }
        let reply: ((Bool, Any?) -> Void)? = requestID == nil ? nil : { [weak self] ok, payload in
            self?.settle(requestID, ok: ok, payload: payload)
        }
        handler(AppMessage(name: name, payload: body["payload"], reply: reply), controller)
    }
}
