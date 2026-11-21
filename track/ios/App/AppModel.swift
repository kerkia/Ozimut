import Combine
import CoreLocation
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import UserNotifications

enum TrackerScreen: Equatable {
    case main
    case selfTest
}

struct BridgeError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// The app's state: the pairing, the tracker, the web view and its bridge. Used on the main thread.
final class AppModel: ObservableObject, TrackEngineDelegate {
    static let shared = AppModel()

    let store = DeviceStore.shared
    let client = TrackClient(base: AppConfig.base)
    let engine: TrackEngine
    let location = LocationTracker()
    let web = WebController()
    let live = LiveActivityController()
    let health = HealthRoutes()
    let watch = WatchLink()

    @Published var paired = false
    @Published var account: TrackAccount?
    @Published var watchers: [String] = []
    @Published var settings = TrackSettings()
    @Published var status = TrackStatus()
    @Published var ended: (status: TrackStatus, reason: EndReason)?
    @Published var showTracker = false
    @Published var screen: TrackerScreen = .main
    @Published var notice: String?
    @Published var pairing = false
    @Published var pairError: String?
    @Published var share = true
    @Published var probe: CLLocation?
    @Published var battery: Int?
    @Published var watchState: String?
    @Published var watchAvailable = false
    @Published var locationChanged = 0

    // The two-minute self-test.
    @Published var testCount = 0
    @Published var testLeft = 0
    @Published var testDone = false
    @Published var testing = false
    private var testTimer: Timer?

    private var pushToken: String?
    private var batteryTimer: Timer?
    private var launched = false

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Tracker", isDirectory: true)
        engine = TrackEngine(directory: dir, client: client, key: { DeviceStore.shared.key })
        engine.delegate = self
        location.onFix = { [weak self] fix in
            guard let self else { return }
            if self.testing {
                self.testCount += 1
            } else {
                self.engine.add(fix)
            }
        }
        location.onProbe = { [weak self] loc in self?.probe = loc }
        location.onAuthorization = { [weak self] in self?.locationChanged += 1 }
        web.onCall = { [weak self] name, args, done in
            guard let self else { return done(.failure(BridgeError(message: "unavailable"))) }
            self.bridge(name, args, done)
        }
        web.onAppURL = { [weak self] url in self?.handleSiteNavigation(url) ?? false }
        watch.onChange = { [weak self] in self?.watchAvailable = self?.watch.available ?? false }
        reloadPairing()
    }

    // MARK: launch

    func launch() {
        guard !launched else { return }
        launched = true
        watch.activate()
        UIDevice.current.isBatteryMonitoringEnabled = true
        readBattery()
        batteryTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.readBattery() }
        NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self else { return }
            self.readBattery()
            if self.status.phase != .idle { self.engine.sendNow() }
        }
        engine.update(settings: settings)
        if engine.resume() {
            // A run was still open when the app was ended: take it up again.
            location.start()
            if let st = engine.snapshot().started { live.start(name: account?.name ?? "Ozimut", started: st) }
            showTracker = true
        }
        if paired && settings.onlyTracker {
            showTracker = true
        } else {
            web.startIfNeeded()
        }
    }

    private func readBattery() {
        let lvl = UIDevice.current.batteryLevel
        battery = lvl >= 0 ? Int((lvl * 100).rounded()) : nil
        engine.setBattery(battery, lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

    private func reloadPairing() {
        account = store.account
        paired = store.isPaired
        watchers = store.watchers
        settings = store.settings
        Lang.set(account?.lang)
    }

    // MARK: pairing

    func pair(code raw: String, signInWeb: Bool, done: ((Result<Any, Error>) -> Void)? = nil) {
        guard let code = PairCode.extract(raw) else {
            pairError = L("pair.error.code")
            done?(.failure(BridgeError(message: "code")))
            return
        }
        pairing = true
        pairError = nil
        let device: [String: Any] = [
            "kind": "phone", "platform": "ios", "version": AppConfig.version,
            "os": UIDevice.current.systemVersion, "model": AppConfig.model,
        ]
        Task {
            do {
                let r = try await client.pair(code: code, device: device)
                await MainActor.run {
                    self.store.save(device: r.device, key: r.key, account: r.account, watchers: r.watchers, settings: r.settings)
                    self.reloadPairing()
                    self.engine.update(settings: r.settings)
                    self.pairing = false
                    self.notice = L("pair.done", r.account.name)
                    if signInWeb, let t = r.webToken, !r.settings.onlyTracker { self.web.signIn(token: t) }
                    if r.settings.onlyTracker { self.showTracker = true }
                    self.sendPushToken()
                    done?(.success(self.pairedInfo()))
                }
            } catch {
                await MainActor.run {
                    self.pairing = false
                    self.pairError = Self.message(error)
                    done?(.failure(error))
                }
            }
        }
    }

    static func message(_ error: Error) -> String {
        switch error as? TrackAPIError {
        case .code?: return L("pair.error.code")
        case .tooMany?: return L("pair.error.many")
        case .network?: return L("pair.error.network")
        default: return L("pair.error.other")
        }
    }

    func unpair() {
        if status.phase != .idle {
            location.stop()
            live.end()
        }
        engine.discard()
        store.forget()
        reloadPairing()
    }

    private func pairedInfo() -> Any {
        guard paired, let a = account else { return NSNull() }
        return ["device": store.device ?? "", "account": a.id, "name": a.name] as [String: Any]
    }

    /// The iPhone pairs its own Apple Watch: a pair code for this account, sent over WatchConnectivity.
    func pairWatch() {
        guard let key = store.key, let a = account else { return }
        watchState = L("start.watch.working")
        Task {
            do {
                let code = try await client.pairCodeForAccount(key: key, account: a.id)
                await MainActor.run {
                    self.watch.send(pairCode: code)
                    self.watchState = L("start.watch.sent")
                }
            } catch {
                await MainActor.run { self.watchState = L("start.watch.fail") }
            }
        }
    }

    // MARK: the run

    func startRun() {
        guard paired, status.phase == .idle else { return }
        ended = nil
        testing = false
        location.start()
        let run = engine.start(share: share ? "watchers" : "private")
        live.start(name: account?.name ?? "Ozimut", started: Date())
        web.send(event: ["type": "tracker", "state": "running", "run": run])
    }

    func stopRun() {
        location.stop()
        engine.stop(reason: .user)
    }

    func help() {
        engine.help()
    }

    func dismissEnded() {
        ended = nil
    }

    func trackChanged(_ s: TrackStatus) {
        let before = status.phase
        status = s
        live.update(s)
        if before != s.phase {
            web.send(event: ["type": "tracker", "state": Self.stateName(s.phase), "run": orNull(s.run)])
        }
    }

    func trackEnded(_ s: TrackStatus, reason: EndReason) {
        location.stop()
        live.end()
        ended = (s, reason)
        status = engine.snapshot()
        web.send(event: ["type": "tracker", "state": "ready", "run": orNull(s.run)])
    }

    func trackDeviceRemoved() {
        location.stop()
        live.end()
        store.forget()
        reloadPairing()
        status = TrackStatus()
        notice = L("removed")
        web.send(event: ["type": "tracker", "state": "none", "run": NSNull()])
    }

    static func stateName(_ p: TrackPhase) -> String {
        switch p {
        case .idle: return "ready"
        case .running: return "running"
        case .ending: return "ending"
        }
    }

    // MARK: the self-test

    func openSelfTest() {
        screen = .selfTest
        showTracker = true
    }

    func startSelfTest() {
        guard status.phase == .idle else { return }
        testCount = 0
        testLeft = 120
        testDone = false
        testing = true
        location.start()
        testTimer?.invalidate()
        testTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] t in
            guard let self else { return t.invalidate() }
            self.testLeft -= 1
            if self.testLeft <= 0 {
                t.invalidate()
                self.endSelfTest()
            }
        }
        RunLoop.main.add(testTimer!, forMode: .common)
    }

    func endSelfTest() {
        testTimer?.invalidate()
        testTimer = nil
        if testing { location.stop() }
        testing = false
        testDone = true
    }

    func closeSelfTest() {
        if testing { endSelfTest() }
        testDone = false
        screen = .main
    }

    // MARK: push

    func requestPush(done: @escaping (Bool) -> Void) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            DispatchQueue.main.async {
                if ok { UIApplication.shared.registerForRemoteNotifications() }
                done(ok)
            }
        }
    }

    func didRegister(token: Data) {
        pushToken = token.map { String(format: "%02x", $0) }.joined()
        sendPushToken()
    }

    private func sendPushToken() {
        guard let token = pushToken, let key = store.key else { return }
        let env = (Bundle.main.object(forInfoDictionaryKey: "OZApsEnvironment") as? String) == "prod" ? "prod" : "dev"
        Task { try? await client.pushToken(key: key, kind: "apns", token: token, env: env) }
    }

    /// A tapped notification: its page in the web view.
    func openNotification(url raw: String) {
        guard let url = URL(string: raw, relativeTo: AppConfig.base)?.absoluteURL else { return }
        if WebController.isSite(url) {
            showTracker = false
            web.load(url)
        }
        web.send(event: ["type": "push", "url": url.absoluteString])
    }

    // MARK: links and files

    /// A URL opened with the app: a pair code (universal link or `ozimut:`), a file, a page of the site.
    func handle(url: URL) {
        if url.isFileURL {
            deliverFile(url)
            return
        }
        if let code = PairCode.extract(url.absoluteString) {
            showTracker = true
            screen = .main
            pair(code: code, signInWeb: true)
            return
        }
        if WebController.isSite(url) {
            web.load(url)
        }
    }

    /// A navigation of the web view to the site: `/t/<code>` pairs (« In the app it pairs »).
    private func handleSiteNavigation(_ url: URL) -> Bool {
        if url.path.hasPrefix("/t/"), let code = PairCode.extract(url.absoluteString) {
            showTracker = true
            screen = .main
            pair(code: code, signInWeb: true)
            return true
        }
        return false
    }

    private func deliverFile(_ url: URL) {
        let access = url.startAccessingSecurityScopedResource()
        defer {
            if access { url.stopAccessingSecurityScopedResource() }
            try? FileManager.default.removeItem(at: url)
        }
        guard let data = try? Data(contentsOf: url) else { return }
        if data.count > 80_000_000 {
            notice = L("file.tooBig")
            return
        }
        let name = url.lastPathComponent
        showTracker = false
        web.startIfNeeded()
        web.send(event: ["type": "file", "name": name, "mime": Self.mime(name), "data": data.base64EncodedString()])
    }

    static func mime(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        let known: [String: String] = [
            "gpx": "application/gpx+xml", "fit": "application/vnd.ant.fit", "tcx": "application/vnd.garmin.tcx+xml",
            "kmz": "application/vnd.google-earth.kmz", "kml": "application/vnd.google-earth.kml+xml", "pdf": "application/pdf",
        ]
        if let m = known[ext] { return m }
        return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    // MARK: the bridge (design.md « The site ↔ app bridge »)

    private func bridge(_ name: String, _ args: [String: Any], _ done: @escaping (Result<Any, Error>) -> Void) {
        switch name {
        case "info":
            var features = ["tracker", "health", "push", "files"]
            if watch.paired { features.append("watch") }
            done(.success(["platform": "ios", "version": AppConfig.version, "features": features, "paired": pairedInfo()] as [String: Any]))
        case "pair":
            guard let code = args["code"] as? String else { return done(.failure(BridgeError(message: "code"))) }
            pair(code: code, signInWeb: false, done: done)
        case "unpair":
            unpair()
            done(.success(true))
        case "openTracker":
            screen = .main
            showTracker = true
            done(.success(true))
        case "trackerState":
            done(.success(trackerState()))
        case "selfTest":
            openSelfTest()
            done(.success(true))
        case "pushRegister":
            requestPush { ok in done(.success(["ok": ok])) }
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

    private func trackerState() -> [String: Any] {
        guard paired else { return ["state": "none", "run": NSNull(), "since": NSNull(), "fixes": 0, "pending": 0] }
        let s = engine.snapshot()
        return [
            "state": Self.stateName(s.phase),
            "run": orNull(s.run),
            "since": orNull(s.started.map { Int($0.timeIntervalSince1970) }),
            "fixes": s.fixes,
            "pending": s.pending,
        ]
    }
}

/// A JSON value or null.
func orNull(_ v: Any?) -> Any {
    v ?? NSNull()
}
