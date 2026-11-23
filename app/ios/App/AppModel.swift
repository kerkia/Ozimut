import Combine
import HealthKit
import SwiftUI
import UIKit
import UserNotifications

struct BridgeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// The app's state: the web view and its bridge, the notifications' token, the files opened with the app. Used on the
/// main thread. The app holds no credential and calls no server: the page does (docs/app/design.md).
final class AppModel: ObservableObject {
    static let shared = AppModel()

    let web = WebController()
    let health = HealthRoutes()
    let scanner = MapScanner()

    /// The site could not be reached at start: the native screen with « Réessayer ».
    @Published var offline = false
    @Published var notice: String?

    private var pushToken: String?
    /// Bridge calls waiting for the token after the permission was given.
    private var tokenWaiters: [(String?) -> Void] = []
    private var launched = false

    /// Files opened together arrive one by one: gathered for a moment, sent as one event.
    private var fileBatch: [[String: Any]] = []
    private var fileTimer: Timer?

    private init() {
        web.onCall = { [weak self] name, args, done in
            guard let self else { return done(.failure(BridgeError(message: "unavailable"))) }
            self.bridge(name, args, done)
        }
        web.onStartFailed = { [weak self] in self?.offline = true }
        web.onShown = { [weak self] in self?.offline = false }
    }

    // MARK: launch

    func launch() {
        guard !launched else { return }
        launched = true
        web.startIfNeeded()
        // Allowed already: the token is asked again at each launch (it may change).
        UNUserNotificationCenter.current().getNotificationSettings { s in
            if AppModel.allowed(s.authorizationStatus) {
                DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }

    func retry() {
        offline = false
        web.retry()
    }

    // MARK: push

    private static func allowed(_ s: UNAuthorizationStatus) -> Bool {
        s == .authorized || s == .provisional || s == .ephemeral
    }

    /// "on" | "off" | "denied" | "unavailable": the system's permission and whether a token exists.
    private func pushState(done: @escaping (String) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            DispatchQueue.main.async {
                if s.authorizationStatus == .denied {
                    done("denied")
                } else if AppModel.allowed(s.authorizationStatus) {
                    done(self.pushToken != nil ? "on" : "off")
                } else {
                    done("off")
                }
            }
        }
    }

    /// Asks the permission if needed, then the token. -> the token, or nil with the state to answer
    private func pushRegister(done: @escaping (String?, String) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            DispatchQueue.main.async {
                guard ok else {
                    done(nil, "denied")
                    return
                }
                if let t = self.pushToken {
                    done(t, "on")
                    return
                }
                var answered = false
                self.tokenWaiters.append { token in
                    if answered { return }
                    answered = true
                    done(token, token != nil ? "on" : "unavailable")
                }
                UIApplication.shared.registerForRemoteNotifications()
                // No answer from Apple's service (no network, a simulator): given up, the page may ask again.
                DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
                    if answered { return }
                    answered = true
                    done(nil, "unavailable")
                }
            }
        }
    }

    func didRegister(token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        pushToken = hex
        let waiters = tokenWaiters
        tokenWaiters = []
        waiters.forEach { $0(hex) }
    }

    func didFailToRegister() {
        let waiters = tokenWaiters
        tokenWaiters = []
        waiters.forEach { $0(nil) }
    }

    /// A tapped notification: the page follows its address (also when the tap started the app: the event waits for the page).
    func openNotification(url raw: String) {
        guard let url = URL(string: raw, relativeTo: AppConfig.base)?.absoluteURL, NavPolicy.isSite(url, base: AppConfig.base) else { return }
        // As the site writes its own addresses: « /#/… ».
        var address = url.path.isEmpty ? "/" : url.path
        if let q = url.query { address += "?" + q }
        if let f = url.fragment { address += "#" + f }
        web.startIfNeeded()
        web.send(event: ["type": "push", "url": address])
    }

    // MARK: files

    /// A file opened with the app (« Open with / Share to Ozimut »).
    func handle(url: URL) {
        guard url.isFileURL else { return }
        let access = url.startAccessingSecurityScopedResource()
        defer {
            if access { url.stopAccessingSecurityScopedResource() }
            // The system's copy in the app's Inbox.
            try? FileManager.default.removeItem(at: url)
        }
        guard let data = try? Data(contentsOf: url) else { return }
        if data.count > 80_000_000 {
            notice = L("file.tooBig")
            return
        }
        let name = url.lastPathComponent
        fileBatch.append(["name": name, "mime": Mime.of(name: name), "data": data.base64EncodedString()])
        fileTimer?.invalidate()
        fileTimer = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: false) { [weak self] _ in self?.flushFiles() }
    }

    private func flushFiles() {
        fileTimer = nil
        guard !fileBatch.isEmpty else { return }
        let files = fileBatch
        fileBatch = []
        web.startIfNeeded()
        web.send(event: ["type": "files", "files": files])
    }

    // MARK: the bridge (docs/app/design.md « The bridge »)

    private func bridge(_ name: String, _ args: [String: Any], _ done: @escaping (Result<Any, Error>) -> Void) {
        switch name {
        case "info":
            var features = ["push", "files", "save"]
            if HKHealthStore.isHealthDataAvailable() { features.append("health") }
            if MapScanner.supported { features.append("scan") }
            done(.success(["platform": "ios", "version": AppConfig.version, "features": features] as [String: Any]))
            // The page listens from now on: what waited for it goes.
            web.markReady()
        case "pushState":
            pushState { state in done(.success(["state": state])) }
        case "pushRegister":
            pushRegister { token, state in
                if let token {
                    done(.success(["ok": true, "kind": "apns", "token": token, "env": AppConfig.apsEnvironment] as [String: Any]))
                } else {
                    done(.success(["ok": false, "state": state] as [String: Any]))
                }
            }
        case "saveFile":
            guard let b64 = args["data"] as? String, let data = Data(base64Encoded: b64, options: [.ignoreUnknownCharacters]) else {
                return done(.failure(BridgeError(message: "data")))
            }
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            let url = dir.appendingPathComponent(Mime.safeName((args["name"] as? String) ?? ""))
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try data.write(to: url)
            } catch {
                return done(.failure(error))
            }
            done(.success(["ok": web.share(file: url)]))
        case "scanMap":
            scanner.scan { data in
                guard let data else { return done(.success(NSNull())) }
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
                df.dateFormat = "yyyyMMdd-HHmmss"
                done(.success(["name": "map-" + df.string(from: Date()) + ".jpg", "mime": "image/jpeg",
                               "data": data.base64EncodedString()] as [String: Any]))
            }
        case "healthRoutes":
            let days = JSON.int(args["days"]) ?? 30
            Task {
                do { done(.success(try await self.health.list(days: days))) } catch { done(.failure(error)) }
            }
        case "healthRoute":
            guard let id = args["id"] as? String else { return done(.failure(BridgeError(message: "id"))) }
            Task {
                do { done(.success(try await self.health.gpx(id: id))) } catch { done(.failure(error)) }
            }
        case "openSettings":
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            done(.success(true))
        default:
            done(.failure(BridgeError(message: "unknown: " + name)))
        }
    }
}
