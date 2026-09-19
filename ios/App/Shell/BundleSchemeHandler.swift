import Foundation
import WebKit

/// Serves the bundled web folder at `scheme://host/...`.
///
/// Why a custom scheme rather than `loadFileURL`: a `file://` origin is
/// treated as opaque by WebKit, so ES modules fail to load, localStorage may
/// not persist across launches, and absolute paths such as `/fonts/x.woff2`
/// resolve against the filesystem root. Under `scheme://localhost/` the page
/// has a normal, stable, secure-context origin and every relative or absolute
/// path resolves exactly as it does on the web.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private let entryFile: String

    init(root: URL, entryFile: String) {
        self.root = root.standardizedFileURL
        self.entryFile = entryFile
    }

    // Requests are answered synchronously on the main thread, so a task can
    // never be stopped between our response callbacks (which WebKit forbids).
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        guard let file = resolve(url) else {
            respond(task, url: url, status: 404, mime: "text/html; charset=utf-8",
                    data: Data("<!doctype html><meta charset=utf-8><title>Not found</title><p style=\"font-family:-apple-system;padding:2em\">Not found: \(escapeHTML(url.path))</p>".utf8))
            return
        }
        guard let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            respond(task, url: url, status: 500, mime: "text/plain; charset=utf-8", data: Data("Unreadable resource".utf8))
            return
        }
        respond(task, url: url, status: 200, mime: BundleSchemeHandler.mimeType(for: file.pathExtension), data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        // Nothing is in flight after `start` returns.
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, mime: String, data: Data) {
        let headers = [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            // Everything is local and versioned by the app build; never let a
            // stale cached copy outlive an update.
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*"
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    /// Maps a request URL to a file inside the web folder, or nil.
    func resolve(_ url: URL) -> URL? {
        var path = url.path
        if path.isEmpty || path == "/" { path = "/" + entryFile }
        if path.hasSuffix("/") { path += "index.html" }
        let components = path.split(separator: "/").map(String.init)
        // Refuse anything that could escape the folder.
        if components.contains("..") || components.contains(where: { $0.hasPrefix(".") && $0 != "." }) { return nil }
        var candidate = root
        for component in components where component != "." {
            candidate.appendPathComponent(component)
        }
        candidate = candidate.standardizedFileURL
        guard candidate.path.hasPrefix(root.path + "/") else { return nil }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory) else { return nil }
        if isDirectory.boolValue {
            let index = candidate.appendingPathComponent("index.html")
            return FileManager.default.fileExists(atPath: index.path) ? index : nil
        }
        return candidate
    }

    static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "map": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "txt": return "text/plain; charset=utf-8"
        case "md": return "text/markdown; charset=utf-8"
        case "csv": return "text/csv; charset=utf-8"
        case "tsv": return "text/tab-separated-values; charset=utf-8"
        case "xml": return "application/xml; charset=utf-8"
        case "pdf": return "application/pdf"
        case "wasm": return "application/wasm"
        case "mp3": return "audio/mpeg"
        case "mp4": return "video/mp4"
        default: return "application/octet-stream"
        }
    }

    private func escapeHTML(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
