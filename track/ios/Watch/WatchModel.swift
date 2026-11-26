import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit

/// What the watch shows between runs.
enum WatchPage {
    case home, name, invite, watchers, claim
}

/// Folloz on the Apple Watch (docs/track/folloz.md « The watch »): a followed device only, standalone on cellular or
/// Wi-Fi. Its own channel on the relay and its code shown as a QR code for a watcher's iPhone; its watchers listed and
/// removable; « Relier à Ozimut » by its claim code; the run recorded with a workout session (it keeps the app running
/// wrist down), sent to the relay and Ozimut as the iPhone's, kept on the watch, and sent over to the paired iPhone's
/// « Mes courses » by WatchConnectivity once it has ended.
final class WatchModel: NSObject, ObservableObject, RunCoordinatorDelegate, WCSessionDelegate {
    static let shared = WatchModel()
    /// Runs kept on the watch.
    static let keepRuns = 20

    let store = DeviceStore.shared
    let client = TrackClient(base: AppConfig.base)
    let runs: RunCoordinator
    let recorder = WorkoutRecorder()
    let channel = ChannelStore.shared

    @Published var page: WatchPage = .home
    @Published var linked = false
    @Published var account: TrackAccount?
    @Published var claimCode = ""
    @Published var status = TrackStatus()
    @Published var ended: TrackStatus?
    @Published var message: String?
    @Published var watchers: [ChannelStore.Watcher] = []
    @Published var myName = Me.name
    @Published var inviteLink: String?
    @Published var inviteFailed = false

    private var settings = TrackSettings()
    private var claimTimer: Timer?
    private var batteryTimer: Timer?
    private var battery: Int?
    private let defaults = UserDefaults.standard

    private override init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Tracker", isDirectory: true)
        runs = RunCoordinator(directory: dir, ozimut: OzimutDestination(client: TrackClient(base: AppConfig.base), key: { DeviceStore.shared.key }))
        super.init()
        runs.delegate = self
        runs.battery = { [weak self] in self?.battery }
        runs.startLocation = { [weak self] in self?.recorder.start() }
        runs.stopLocation = { [weak self] in self?.recorder.stop() }
        recorder.onFix = { [weak self] fix in self?.runs.add(fix) }
        channel.onChange = { [weak self] in self?.watchers = self?.channel.watchers ?? [] }
        watchers = channel.watchers
        reload()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
        readBattery()
        batteryTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.readBattery() }
        runs.update(ozimut: settings)
        runs.resume()
        Task {
            await RelayConfig.refresh()
            await self.channel.refresh()
        }
    }

    private func reload() {
        account = store.account
        linked = store.isPaired
        settings = store.settings
        Lang.set(account?.lang)
    }

    private func readBattery() {
        let lvl = WKInterfaceDevice.current().batteryLevel
        battery = lvl >= 0 ? Int((lvl * 100).rounded()) : nil
        runs.setBattery(battery, lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

    func setName(_ n: String) {
        Me.name = n
        myName = Me.name
    }

    // MARK: who follows me

    /// A code for one person, shown as a QR code (their iPhone's Folloz scans it).
    func makeInvite() {
        inviteLink = nil
        inviteFailed = false
        page = .invite
        Task {
            let l = await channel.invite(name: Me.name)
            await MainActor.run {
                self.inviteLink = l
                self.inviteFailed = l == nil
            }
        }
    }

    func refreshWatchers() {
        Task { await channel.refresh() }
    }

    func removeWatcher(_ w: String) {
        Task {
            let ok = await channel.remove(w)
            await MainActor.run { if !ok { self.message = L("net.error") } }
        }
    }

    // MARK: « Relier à Ozimut »: the claim code (design.md « Watches: claim codes »)

    func beginClaim() {
        page = .claim
        var key = Keychain.get("claimKey")
        if key == nil {
            key = RandomCode.key()
            Keychain.set(key, "claimKey")
        }
        var code = defaults.string(forKey: "oz.claimCode") ?? ""
        if code.count != 6 {
            code = RandomCode.string(6, from: RandomCode.claimAlphabet)
            defaults.set(code, forKey: "oz.claimCode")
        }
        claimCode = code
        claimTimer?.invalidate()
        claimTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.pollClaim() }
        pollClaim()
    }

    func endClaim() {
        claimTimer?.invalidate()
        claimTimer = nil
        page = .home
    }

    private func pollClaim() {
        guard !linked, page == .claim, let key = Keychain.get("claimKey") else {
            claimTimer?.invalidate()
            return
        }
        let code = claimCode
        Task {
            do {
                if let got = try await client.claim(claim: code, key: key, kind: "applewatch",
                                                    model: AppConfig.model, version: AppConfig.version) {
                    await MainActor.run {
                        self.store.save(device: "claim:" + code, key: key, account: got.0, watchers: [], settings: got.1)
                        self.claimed()
                    }
                }
            } catch {
                await MainActor.run { self.message = L("pair.error.network") }
            }
        }
    }

    private func claimed() {
        claimTimer?.invalidate()
        claimTimer = nil
        defaults.removeObject(forKey: "oz.claimCode")
        Keychain.set(nil, "claimKey")
        message = nil
        reload()
        runs.update(ozimut: settings)
        page = .home
    }

    /// Unlinks the watch from Ozimut, on the watch only.
    func unlink() {
        guard status.phase == .idle else { return }
        store.forget()
        reload()
    }

    // MARK: the run

    func start() {
        guard status.phase == .idle else { return }
        ended = nil
        message = nil
        recorder.authorize { [weak self] ok in
            guard let self else { return }
            if !ok { self.message = L("watch.health") }
            self.runs.update(ozimut: self.settings)
            self.runs.start(share: true, linked: self.linked, cap: self.linked ? self.settings.cap : nil)
        }
    }

    func stop() {
        runs.stop(reason: .user)
    }

    func help() {
        runs.help()
        WKInterfaceDevice.current().play(.notification)
    }

    func runChanged(_ s: TrackStatus) {
        status = s
    }

    func runEnded(_ s: TrackStatus, reason: EndReason) {
        ended = s
        status = runs.status
        if let run = s.run { sendToPhone(run) }
        RunLog.prune(keep: WatchModel.keepRuns)
    }

    func ozimutRemoved() {
        reload()
        message = L("removed.watch")
    }

    func channelGone() {
        watchers = []
    }

    // MARK: the runs to the iPhone (WatchConnectivity)

    private var sentRuns: Set<String> {
        get { Set(defaults.stringArray(forKey: "oz.sentRuns") ?? []) }
        set { defaults.set(Array(newValue), forKey: "oz.sentRuns") }
    }

    /// A finished run's file to the paired iPhone: the system keeps the transfer until the two are connected.
    private func sendToPhone(_ run: String) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let s = WCSession.default
        if s.outstandingFileTransfers.contains(where: { ($0.file.metadata?["run"] as? String) == run }) { return }
        let url = RunLog.url(run)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        s.transferFile(url, metadata: ["kind": "run", "run": run])
    }

    /// The runs not yet sent (a transfer that failed, or a run ended before the session was ready).
    private func sendWaiting() {
        let sent = sentRuns
        for r in RunLog.runs() where !sent.contains(r.run) && r.run != status.run {
            sendToPhone(r.run)
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        DispatchQueue.main.async { self.sendWaiting() }
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: Error?) {
        guard error == nil, let run = fileTransfer.file.metadata?["run"] as? String else { return }
        DispatchQueue.main.async { self.sentRuns.insert(run) }
    }
}
