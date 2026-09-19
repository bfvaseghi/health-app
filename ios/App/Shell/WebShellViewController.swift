import UIKit
import WebKit

/// The whole app: one WKWebView running the unmodified web app from the
/// bundle, plus the native glue the page cannot do for itself.
final class WebShellViewController: UIViewController {
    let config: ShellConfig
    private(set) var webView: WKWebView!
    private let bridge: NativeBridge
    private var chromeIsDark = false
    private var lastReportedBackground: UIColor?
    private var exportPickerDelegate: ExportPickerDelegate?
    private var pendingDownloads: [ObjectIdentifier: URL] = [:]

    init(config: ShellConfig) {
        self.config = config
        self.bridge = NativeBridge(config: config)
        super.init(nibName: nil, bundle: nil)
        bridge.controller = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        chromeIsDark = traitCollection.userInterfaceStyle == .dark
        view.backgroundColor = fallbackBackground()
        webView = makeWebView()
        view.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        let top = config.extendsUnderStatusBar ? view.topAnchor : view.safeAreaLayoutGuide.topAnchor
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: top),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        // Until the page reports its own colours, follow the system so the
        // status bar is legible on the launch background.
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: WebShellViewController, _: UITraitCollection) in
            guard self.lastReportedBackground == nil else { return }
            self.view.backgroundColor = self.fallbackBackground()
            self.chromeIsDark = self.traitCollection.userInterfaceStyle == .dark
            self.setNeedsStatusBarAppearanceUpdate()
        }
        loadEntry()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        chromeIsDark ? .lightContent : .darkContent
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if config.lockedToPortraitOnPhone && traitCollection.userInterfaceIdiom == .phone { return .portrait }
        return .all
    }

    // MARK: Web view

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let webRoot = Bundle.main.url(forResource: config.webFolder, withExtension: nil)
        if config.remoteURL == nil, let webRoot = webRoot {
            configuration.setURLSchemeHandler(BundleSchemeHandler(root: webRoot, entryFile: config.entryFile), forURLScheme: config.scheme)
        }
        if let suffix = config.userAgentSuffix, !suffix.isEmpty {
            configuration.applicationNameForUserAgent = suffix
        }
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.suppressesIncrementalRendering = true
        configuration.dataDetectorTypes = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let controller = WKUserContentController()
        controller.add(WeakScriptMessageHandler(bridge), name: NativeBridge.handlerName)
        installUserScripts(into: controller)
        configuration.userContentController = controller

        let webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = config.allowsBackForwardGestures
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = fallbackBackground()
        webView.scrollView.backgroundColor = fallbackBackground()
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.underPageBackgroundColor = fallbackBackground()
        #if DEBUG
        if #available(iOS 16.4, macCatalyst 16.4, *) {
            webView.isInspectable = true
        }
        #endif
        return webView
    }

    /// Boot config → bridge → app extras, all at document start, main frame only.
    private func installUserScripts(into controller: WKUserContentController) {
        controller.removeAllUserScripts()
        let scripts = [bootScript()] + [bridgeScript(), config.extraBootScript].compactMap { $0 }
        for source in scripts {
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }

    private func bootScript() -> String {
        var boot: [String: Any] = [
            "platform": platformName(),
            "appName": config.appName,
            "notifications": config.notificationsEnabled,
            "notificationPermission": bridge.cachedNotificationPermission,
            "extendsUnderStatusBar": config.extendsUnderStatusBar,
            // Changes whenever the boot script is rebuilt, so the page applies
            // the restore dictionary once per launch and not on every reload.
            "launchId": UUID().uuidString,
            "restore": StorageMirror.shared.restoreDictionary()
        ]
        if !config.notificationsEnabled { boot["notificationPermission"] = "default" }
        guard let data = try? JSONSerialization.data(withJSONObject: boot, options: []),
              let json = String(data: data, encoding: .utf8) else {
            return "window.__shellBoot = {};"
        }
        // JSON is valid JavaScript apart from U+2028/2029 inside strings,
        // which older engines rejected; escape them to be safe.
        let safe = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        return "window.__shellBoot = \(safe);"
    }

    private func bridgeScript() -> String? {
        guard let url = Bundle.main.url(forResource: "bridge", withExtension: "js"),
              let source = try? String(contentsOf: url, encoding: .utf8) else {
            assertionFailure("bridge.js is missing from the app bundle")
            return nil
        }
        return source
    }

    private func platformName() -> String {
        #if targetEnvironment(macCatalyst)
        return "mac"
        #else
        return traitCollection.userInterfaceIdiom == .pad ? "ipad" : "ios"
        #endif
    }

    private func loadEntry() {
        if let remote = config.remoteURL {
            showingOfflinePage = false
            webView.load(URLRequest(url: remote, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
            return
        }
        guard Bundle.main.url(forResource: config.webFolder, withExtension: nil) != nil else {
            webView.loadHTMLString(
                "<body style=\"font-family:-apple-system;padding:40px;text-align:center\"><h2>Web assets missing</h2>" +
                "<p>The app bundle has no <code>\(config.webFolder)</code> folder. Rebuild the web bundle " +
                "(see ios/README-iOS.md) and build again.</p></body>", baseURL: nil)
            return
        }
        webView.load(URLRequest(url: config.originURL))
    }

    /// Rebuild the boot script (the mirror may have moved on) and reload the
    /// document the user was on, hash included, the way a web reload would.
    func reloadFromScratch() {
        installUserScripts(into: webView.configuration.userContentController)
        if !showingOfflinePage, let current = webView.url, isHomeURL(current) {
            webView.load(URLRequest(url: current))
        } else {
            loadEntry()
        }
    }

    /// True for URLs that belong to the app itself: the bundle origin, or the
    /// remote site's host.
    private func isHomeURL(_ url: URL) -> Bool {
        if config.remoteURL != nil {
            return (url.host?.lowercased() ?? "") == config.homeHost
        }
        return url.scheme?.lowercased() == config.scheme.lowercased()
    }

    // MARK: Offline (remote mode)

    private var showingOfflinePage = false
    private var lastFailedURL: URL?

    /// A remote site that cannot be reached shows a native page instead of
    /// WebKit's error sheet, and the app tries again by itself when it comes
    /// back to the foreground or the page's own button is tapped.
    private func showOfflinePage(for url: URL, error: Error) {
        lastFailedURL = url
        showingOfflinePage = true
        let light = ColorParsing.hexString(config.lightBackground)
        let dark = ColorParsing.hexString(config.darkBackground)
        let name = config.appName.replacingOccurrences(of: "<", with: "&lt;")
        let detail = error.localizedDescription.replacingOccurrences(of: "<", with: "&lt;")
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <style>
        :root { color-scheme: light dark; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: -apple-system, system-ui, sans-serif;
               background: \(light); color: #1c1c1e; padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom); text-align: center; }
        @media (prefers-color-scheme: dark) { body { background: \(dark); color: #f2f2f7; } }
        h1 { font-size: 22px; margin: 0 0 8px; } p { margin: 0 0 20px; opacity: .75; line-height: 1.45; max-width: 32ch; }
        button { font: inherit; font-weight: 600; padding: 12px 22px; border-radius: 12px; border: 0; background: #1c1c1e; color: #fff; }
        @media (prefers-color-scheme: dark) { button { background: #f2f2f7; color: #1c1c1e; } }
        small { display: block; margin-top: 24px; opacity: .5; font-size: 12px; }
        </style>
        <div><h1>\(name) needs a connection</h1>
        <p>The app could not reach its site. It will try again when you are back online.</p>
        <button onclick="location.href = '\(url.absoluteString)'">Try again</button>
        <small>\(detail)</small></div>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    /// Called when the scene becomes active: leave the offline page as soon
    /// as the site is reachable again.
    func retryIfOffline() {
        guard showingOfflinePage, let url = lastFailedURL else { return }
        showingOfflinePage = false
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    // MARK: Chrome

    private func fallbackBackground() -> UIColor {
        traitCollection.userInterfaceStyle == .dark ? config.darkBackground : config.lightBackground
    }

    /// The page reported its background; paint everything around it to match.
    func applyChrome(background: String, systemDark: Bool) {
        guard let color = ColorParsing.color(fromCSS: background) else { return }
        lastReportedBackground = color
        view.backgroundColor = color
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.underPageBackgroundColor = color
        let dark = ColorParsing.relativeLuminance(of: color) < 0.4
        if dark != chromeIsDark {
            chromeIsDark = dark
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    // MARK: Presenting native UI

    var presentationAnchor: UIViewController {
        var top: UIViewController = self
        while let presented = top.presentedViewController { top = presented }
        return top
    }

    /// Exports go through the share sheet on iPhone/iPad (which includes
    /// "Save to Files") and a save panel on the Mac.
    func presentExport(fileURL: URL, completion: @escaping (Bool) -> Void) {
        #if targetEnvironment(macCatalyst)
        let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
        let delegate = ExportPickerDelegate { [weak self] completed in
            self?.exportPickerDelegate = nil
            completion(completed)
        }
        exportPickerDelegate = delegate
        picker.delegate = delegate
        presentationAnchor.present(picker, animated: true)
        #else
        presentShareSheet(items: [fileURL], completion: completion)
        #endif
    }

    func presentShareSheet(items: [Any], completion: @escaping (Bool) -> Void) {
        let activity = UIActivityViewController(activityItems: items, applicationActivities: nil)
        activity.completionWithItemsHandler = { _, completed, _, _ in completion(completed) }
        if let popover = activity.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        presentationAnchor.present(activity, animated: true)
    }

    func presentPrint() {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = config.appName
        info.outputType = .general
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        if traitCollection.userInterfaceIdiom == .pad {
            let rect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            controller.present(from: rect, in: view, animated: true, completionHandler: nil)
        } else {
            controller.present(animated: true, completionHandler: nil)
        }
    }

    func presentDialog(message: String, kind: DialogKind, defaultText: String? = nil, completion: @escaping (Bool, String?) -> Void) {
        let alert = UIAlertController(title: config.appName, message: message, preferredStyle: .alert)
        switch kind {
        case .alert:
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion(true, nil) })
        case .confirm:
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(false, nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion(true, nil) })
        case .prompt:
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(false, nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                completion(true, alert?.textFields?.first?.text ?? "")
            })
        }
        presentationAnchor.present(alert, animated: true)
    }

    enum DialogKind { case alert, confirm, prompt }

    func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}

// MARK: - Navigation

extension WebShellViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "about" || scheme == "blob" || scheme == "data" {
            return decisionHandler(.allow)
        }
        if config.remoteURL != nil {
            // Remote mode. The site itself, and whatever it redirects through
            // (a sign-in flow bounces across other hosts), stay in the view.
            // Only a link the user tapped to a foreign host leaves the app.
            let http = scheme == "http" || scheme == "https"
            let foreign = (url.host?.lowercased() ?? "") != config.homeHost
            // A tap on a sign-in page ("Continue with…") must stay here, or the
            // callback would land in Safari's cookies and never sign the app in.
            let currentIsHome = (webView.url?.host?.lowercased() ?? config.homeHost) == config.homeHost
            if http && !(foreign && currentIsHome && navigationAction.navigationType == .linkActivated) {
                if navigationAction.targetFrame == nil {
                    webView.load(navigationAction.request)
                    return decisionHandler(.cancel)
                }
                return decisionHandler(.allow)
            }
            decisionHandler(.cancel)
            openExternally(url)
            return
        }
        if scheme == config.scheme.lowercased() {
            if navigationAction.targetFrame == nil {
                // target=_blank inside the app: keep it in the same view.
                webView.load(navigationAction.request)
                return decisionHandler(.cancel)
            }
            return decisionHandler(.allow)
        }
        // Everything else (https, mailto, tel, sms…) leaves the app.
        decisionHandler(.cancel)
        openExternally(url)
    }

    /// The document itself could not be loaded because the network is not
    /// there (offline, DNS, a timeout). Only the app's own site gets the
    /// offline page, and only for network failures: a file WebKit cannot show
    /// becomes a download instead (below), and a sign-in host failing mid-flow
    /// shows WebKit's own error so the user can go back.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard config.remoteURL != nil else { return }
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain, WebShellViewController.offlineErrorCodes.contains(nsError.code) else { return }
        let failed = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? config.originURL
        guard isHomeURL(failed) else { return }
        showOfflinePage(for: failed, error: error)
    }

    private static let offlineErrorCodes: Set<Int> = [
        NSURLErrorNotConnectedToInternet, NSURLErrorTimedOut, NSURLErrorCannotFindHost,
        NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorDNSLookupFailed,
        NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed, NSURLErrorSecureConnectionFailed
    ]

    /// A real document is on screen again: the offline page is gone, so the
    /// next foregrounding must not reload over the user's work.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if let url = webView.url, isHomeURL(url) { showingOfflinePage = false }
    }

    /// A response WebKit cannot display (a ZIP, a CSV served as an
    /// attachment) is fetched as a download and handed to the share sheet or
    /// the Mac save panel, like a blob export from the page.
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame, !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    /// iOS reclaims the WebContent process under memory pressure, which
    /// leaves a blank screen until the app is force-quit. Reload instead, with
    /// a fresh boot script so the restore data is current.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        StorageMirror.shared.flush()
        reloadFromScratch()
    }
}

// MARK: - Dialogs and popups

extension WebShellViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isHomeURL(url) { webView.load(navigationAction.request) } else { openExternally(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        presentDialog(message: message, kind: .alert) { _, _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        presentDialog(message: message, kind: .confirm) { ok, _ in completionHandler(ok) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        presentDialog(message: prompt, kind: .prompt, defaultText: defaultText) { ok, text in
            completionHandler(ok ? (text ?? "") : nil)
        }
    }
}

// MARK: - Downloads (files WebKit cannot show)

extension WebShellViewController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("Exports", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let name = suggestedFilename.replacingOccurrences(of: "/", with: "-")
        let url = directory.appendingPathComponent(name.isEmpty ? "download" : name)
        // WebKit refuses a destination that already exists.
        try? FileManager.default.removeItem(at: url)
        pendingDownloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = pendingDownloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        presentExport(fileURL: url) { _ in }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        pendingDownloads.removeValue(forKey: ObjectIdentifier(download))
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        presentDialog(message: "The download could not be completed. \(error.localizedDescription)", kind: .alert) { _, _ in }
    }
}

// MARK: - Helpers

/// Breaks the WKUserContentController → handler retain cycle.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// Keeps the export picker's delegate alive for as long as the picker is.
final class ExportPickerDelegate: NSObject, UIDocumentPickerDelegate {
    private let completion: (Bool) -> Void
    init(completion: @escaping (Bool) -> Void) { self.completion = completion }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { completion(true) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { completion(false) }
}

enum ColorParsing {
    /// Parses what `getComputedStyle(...).backgroundColor` returns:
    /// `rgb(r, g, b)`, `rgba(r, g, b, a)`, `#rgb`, `#rrggbb`, `#rrggbbaa`,
    /// and the modern space-separated forms.
    static func color(fromCSS css: String) -> UIColor? {
        let text = css.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.hasPrefix("#") {
            var hex = String(text.dropFirst())
            if hex.count == 3 || hex.count == 4 { hex = hex.map { "\($0)\($0)" }.joined() }
            guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }
            let shift: UInt64 = hex.count == 8 ? 8 : 0
            let r = CGFloat((value >> (16 + shift)) & 0xff) / 255
            let g = CGFloat((value >> (8 + shift)) & 0xff) / 255
            let b = CGFloat((value >> shift) & 0xff) / 255
            let a = hex.count == 8 ? CGFloat(value & 0xff) / 255 : 1
            return UIColor(red: r, green: g, blue: b, alpha: a)
        }
        guard text.hasPrefix("rgb"), let open = text.firstIndex(of: "("), let close = text.lastIndex(of: ")") else { return nil }
        let inner = text[text.index(after: open)..<close]
            .replacingOccurrences(of: "/", with: " ")
            .replacingOccurrences(of: ",", with: " ")
        let parts = inner.split(whereSeparator: { $0 == " " }).map(String.init)
        guard parts.count >= 3 else { return nil }
        func channel(_ part: String) -> CGFloat? {
            if part.hasSuffix("%"), let v = Double(part.dropLast()) { return CGFloat(v / 100) }
            guard let v = Double(part) else { return nil }
            return CGFloat(v / 255)
        }
        guard let r = channel(parts[0]), let g = channel(parts[1]), let b = channel(parts[2]) else { return nil }
        var a: CGFloat = 1
        if parts.count >= 4 {
            let part = parts[3]
            if part.hasSuffix("%"), let v = Double(part.dropLast()) { a = CGFloat(v / 100) }
            else if let v = Double(part) { a = CGFloat(v) }
        }
        if a == 0 { return nil }
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }

    /// `#rrggbb` for a colour, resolved in the light or dark appearance it was
    /// created for (dynamic colours resolve against the current traits).
    static func hexString(_ color: UIColor) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard color.getRed(&r, green: &g, blue: &b, alpha: &a) else { return "#ffffff" }
        func byte(_ c: CGFloat) -> Int { Int((max(0, min(1, c)) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", byte(r), byte(g), byte(b))
    }

    static func relativeLuminance(of color: UIColor) -> CGFloat {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard color.getRed(&r, green: &g, blue: &b, alpha: &a) else { return 1 }
        func linear(_ c: CGFloat) -> CGFloat { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}
