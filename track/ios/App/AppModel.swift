import Combine
import CoreLocation
import SwiftUI
import UIKit
import UserNotifications

enum Tab: String {
    case me, follow
}

/// What a sheet or a full-screen page shows over the tabs.
enum Page: Identifiable, Equatable {
    case tracker
    case selfTest
    case invite
    case runs
    case zone
    case pair
    case join(Codes.Link)
    case follow(String)

    var id: String {
        switch self {
        case .tracker: return "tracker"
        case .selfTest: return "selfTest"
        case .invite: return "invite"
        case .runs: return "runs"
        case .zone: return "zone"
        case .pair: return "pair"
        case let .join(l): return "join:" + l.c
        case let .follow(c): return "follow:" + c
        }
    }
}

/// Ozitrac's state on the iPhone (docs/track/ozitrac.md « The apps »): the run (RunCoordinator: Ozimut's account when
/// linked, the relay when someone follows), the channel and its watchers, the people followed, the link to Ozimut, the
/// notifications and the runs the Apple Watch sends over. Used on the main thread.
final class AppModel: ObservableObject, RunCoordinatorDelegate {
    static let shared = AppModel()

    let store = DeviceStore.shared
    let client = TrackClient(base: AppConfig.base)
    let runs: RunCoordinator
    let location = LocationTracker()
    let live = LiveActivityController()
    let watch = WatchLink()
    let channel = ChannelStore.shared
    let follows = FollowStore.shared

    @Published var tab: Tab = .me
    @Published var page: Page?
    @Published var linked = false
    @Published var account: TrackAccount?
    @Published var settings = TrackSettings()
    @Published var status = TrackStatus()
    @Published var ended: (status: TrackStatus, reason: EndReason)?
    @Published var notice: String?
    @Published var pairing = false
    @Published var pairError: String?
    @Published var share = true
    @Published var probe: CLLocation?
    @Published var battery: Int?
    @Published var locationChanged = 0
    @Published var watchers: [ChannelStore.Watcher] = []
    @Published var followed: [Follow] = []
    @Published var runsChanged = 0
    @Published var myName = Me.name

    // The two-minute self-test.
    @Published var testCount = 0
    @Published var testLeft = 0
    @Published var testDone = false
    @Published var testing = false
    private var testTimer: Timer?

    private var pushToken: String?
    private var batteryTimer: Timer?
    private var refreshTimer: Timer?
    private var launched = false

    static var apsEnv: String {
        (Bundle.main.object(forInfoDictionaryKey: "OZApsEnvironment") as? String) == "prod" ? "prod" : "dev"
    }

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Tracker", isDirectory: true)
        let ozimut = OzimutDestination(client: client, key: { DeviceStore.shared.key })
        runs = RunCoordinator(directory: dir, ozimut: ozimut)
        runs.delegate = self
        runs.battery = { [weak self] in self?.battery }
        runs.startLocation = { [weak self] in self?.location.start() }
        runs.stopLocation = { [weak self] in self?.location.stop() }
        location.onFix = { [weak self] fix in
            guard let self else { return }
            if self.testing {
                self.testCount += 1
            } else {
                self.runs.add(fix)
            }
        }
        location.onProbe = { [weak self] loc in self?.probe = loc }
        location.onAuthorization = { [weak self] in self?.locationChanged += 1 }
        channel.onChange = { [weak self] in self?.watchers = self?.channel.watchers ?? [] }
        follows.onChange = { [weak self] in self?.followed = self?.follows.list ?? [] }
        watch.onRun = { [weak self] in
            self?.runsChanged += 1
            self?.notice = L("runs.watch.received")
        }
        watchers = channel.watchers
        followed = follows.list
        FollowStore.shareNames(followed)
        reloadLink()
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
            self.runs.sendNow()
            self.refreshInBackground()
        }
        runs.update(ozimut: settings)
        if runs.resume() {
            // A run was still open when the system ended the app: take it up again.
            if let st = runs.status.started { live.start(name: Me.name, started: st) }
            page = .tracker
        }
        refreshInBackground()
        if !followed.isEmpty { registerForPushIfAllowed() }
    }

    private func readBattery() {
        let lvl = UIDevice.current.batteryLevel
        battery = lvl >= 0 ? Int((lvl * 100).rounded()) : nil
        runs.setBattery(battery, lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

    /// The relay's settings, the watchers and the people followed read again.
    func refreshInBackground() {
        Task {
            await RelayConfig.refresh()
            await self.channel.refresh()
        }
    }

    private func reloadLink() {
        account = store.account
        linked = store.isPaired
        settings = store.settings
        Lang.set(account?.lang)
    }

    func setName(_ n: String) {
        Me.name = n
        myName = Me.name
    }

    // MARK: « Relier à Ozimut »

    func pair(code raw: String) {
        guard let code = PairCode.extract(raw) else {
            pairError = L("pair.error.code")
            return
        }
        pairing = true
        pairError = nil
        let device: [String: Any] = [
            "kind": "phone", "platform": "ios", "app": "ozitrac", "version": AppConfig.version,
            "os": UIDevice.current.systemVersion, "model": AppConfig.model,
        ]
        Task {
            do {
                let r = try await client.pair(code: code, device: device)
                await MainActor.run {
                    self.store.save(device: r.device, key: r.key, account: r.account, watchers: r.watchers, settings: r.settings)
                    self.reloadLink()
                    self.runs.update(ozimut: r.settings)
                    self.pairing = false
                    self.notice = L("pair.done", r.account.name)
                    if self.page == .pair { self.page = nil }
                    self.sendOzimutPushToken()
                }
            } catch {
                await MainActor.run {
                    self.pairing = false
                    self.pairError = Self.message(error)
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

    /// Unlinks this iPhone from Ozimut, on this iPhone only (the account removes the device on the site).
    func unlink() {
        guard status.phase == .idle else {
            notice = L("test.busy")
            return
        }
        store.forget()
        reloadLink()
    }

    // MARK: the run

    func startRun() {
        guard status.phase == .idle else { return }
        ended = nil
        testing = false
        runs.update(ozimut: settings)
        let cap = linked ? settings.cap : nil
        guard runs.start(share: share, linked: linked, cap: cap) != nil else { return }
        live.start(name: Me.name, started: Date())
    }

    func stopRun() {
        runs.stop(reason: .user)
    }

    func help() {
        runs.help()
    }

    func dismissEnded() {
        ended = nil
    }

    func runChanged(_ s: TrackStatus) {
        status = s
        live.update(s)
    }

    func runEnded(_ s: TrackStatus, reason: EndReason) {
        live.end()
        ended = (s, reason)
        status = runs.status
        runsChanged += 1
    }

    func ozimutRemoved() {
        reloadLink()
        notice = L("removed")
    }

    func channelGone() {
        watchers = []
    }

    // MARK: who follows me

    /// A new code for someone who will follow this iPhone: the address, or nil (no network).
    func invite() async -> String? {
        await channel.invite(name: Me.name)
    }

    func removeWatcher(_ w: String) {
        Task {
            let ok = await channel.remove(w)
            await MainActor.run { if !ok { self.notice = L("net.error") } }
        }
    }

    /// « Effacer mes données »: the channel and every follow go from the relay.
    func eraseRelayData() {
        guard status.phase == .idle else {
            notice = L("test.busy")
            return
        }
        Task {
            var ok = await channel.delete()
            for f in follows.list {
                let gone = await follows.unfollow(f)
                ok = ok && gone
            }
            await MainActor.run { self.notice = L(ok ? "data.erased" : "net.error") }
        }
    }

    // MARK: following

    /// A code scanned or opened: the person's page when already followed, else the question.
    func open(link: Codes.Link) {
        tab = .follow
        if follows.get(link.c) != nil {
            page = .follow(link.c)
        } else {
            page = .join(link)
        }
    }

    func join(_ link: Codes.Link) async -> String? {
        let (f, err) = await follows.join(link, myName: Me.name)
        guard let f else { return err ?? "network" }
        await MainActor.run {
            self.page = .follow(f.c)
            self.registerPush(f)
            self.askForPush()
        }
        return nil
    }

    func unfollow(_ f: Follow) async -> Bool {
        await follows.unfollow(f)
    }

    // MARK: the self-test

    func startSelfTest() {
        guard status.phase == .idle else { return }
        testCount = 0
        testLeft = 120
        testDone = false
        testing = true
        location.start()
        testTimer?.invalidate()
        let t = Timer(timeInterval: 1, repeats: true) { [weak self] t in
            guard let self else { return t.invalidate() }
            self.testLeft -= 1
            if self.testLeft <= 0 {
                t.invalidate()
                self.endSelfTest()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        testTimer = t
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
        page = nil
    }

    // MARK: notifications

    /// After a first person followed: their alerts come by notification.
    func askForPush() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            DispatchQueue.main.async {
                if ok { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
    }

    private func registerForPushIfAllowed() {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func didRegister(token: Data) {
        let t = token.map { String(format: "%02x", $0) }.joined()
        let changed = t != pushToken
        pushToken = t
        let env = Self.apsEnv
        Task { await self.follows.registerPushAll(token: t, env: env) }
        if changed { sendOzimutPushToken() }
    }

    private func sendOzimutPushToken() {
        guard let token = pushToken, let key = store.key else { return }
        let env = Self.apsEnv
        Task { try? await client.pushToken(key: key, kind: "apns", token: token, env: env) }
    }

    /// A person just followed gets this iPhone's token at once (when it has one).
    func registerPush(_ f: Follow) {
        guard let token = pushToken else { return }
        let env = Self.apsEnv
        Task { await self.follows.registerPush(f, token: token, env: env) }
    }

    /// A tapped notification: the person's page (an Ozitrac alert), else the app.
    func openNotification(_ info: [AnyHashable: Any]) {
        if (info["app"] as? String) == "ozitrac", let c = info["c"] as? String, follows.get(c) != nil {
            tab = .follow
            page = .follow(c)
        }
    }

    // MARK: links

    /// A URL opened with the app: an Ozitrac code (`/z/…`), an Ozimut pair code (`/t/<code>`).
    func handle(url: URL) {
        if let link = Codes.parse(url.absoluteString) {
            open(link: link)
            return
        }
        if PairCode.extract(url.absoluteString) != nil {
            tab = .me
            page = .pair
            pair(code: url.absoluteString)
        }
    }
}
