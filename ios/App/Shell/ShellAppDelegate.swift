import UIKit
import UserNotifications

/// The process-level plumbing every shell app shares. An app subclasses this,
/// marks the subclass `@main`, and overrides `makeConfig()`.
///
/// Info.plist must carry a `UIApplicationSceneManifest` (with
/// `UIApplicationSupportsMultipleScenes` = false and no scene configurations);
/// the scene delegate is supplied from code below, so no class names have to
/// be spelled in the plist.
class ShellAppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// The active configuration, available to every part of the shell.
    /// (Internal on purpose: ShellConfig is internal, and Swift forbids a
    /// more visible property or method than its type.)
    private(set) static var config: ShellConfig!

    /// Overridden by the app's @main subclass.
    func makeConfig() -> ShellConfig {
        fatalError("Override makeConfig() in the app's @main delegate.")
    }

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let config = makeConfig()
        ShellAppDelegate.config = config
        StorageMirror.shared.configure(with: config)
        if config.notificationsEnabled {
            // Foreground banners: a reminder that fires while the app is open
            // must still be seen, exactly like the web version's toast.
            UNUserNotificationCenter.current().delegate = self
        }
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Main", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = ShellSceneDelegate.self
        return configuration
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}

/// One window, one web view. Backgrounding flushes the storage mirror so a
/// suspended-then-killed app never loses the last few writes.
final class ShellSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let config = ShellAppDelegate.config!
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark ? config.darkBackground : config.lightBackground
        }
        let shell = WebShellViewController(config: config)
        // Launched from a widget tap or a link in the app's own scheme. This
        // has to happen before the window is shown: makeKeyAndVisible loads
        // the view, and a loaded view has already started the entry page, so
        // the link would arrive as a second navigation and the reader would
        // watch the app open its home screen and then jump. Handed over now,
        // it is parked and loaded in place of the entry page.
        if let url = connectionOptions.urlContexts.first?.url { shell.open(deepLink: url) }
        window.rootViewController = shell
        self.window = window
        window.makeKeyAndVisible()

        #if targetEnvironment(macCatalyst)
        windowScene.sizeRestrictions?.minimumSize = CGSize(width: 420, height: 600)
        if let titlebar = windowScene.titlebar {
            titlebar.titleVisibility = .visible
            titlebar.toolbar = nil
        }
        #endif
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (window?.rootViewController as? WebShellViewController)?.retryIfOffline()
    }

    /// A widget tap or a link while the app is running: the same URL rules as
    /// at launch. The app registers its scheme under CFBundleURLTypes.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        (window?.rootViewController as? WebShellViewController)?.open(deepLink: url)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        StorageMirror.shared.flush()
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        StorageMirror.shared.flush()
    }
}
