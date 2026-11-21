import Foundation
import SwiftUI
import WatchConnectivity
import WatchKit

/// The Apple Watch app's state: its pairing (claim code, or a pair code from the iPhone), the run.
final class WatchModel: NSObject, ObservableObject, TrackEngineDelegate, WCSessionDelegate {
    static let shared = WatchModel()

    let store = DeviceStore.shared
    let client = TrackClient(base: AppConfig.base)
    let engine: TrackEngine
    let recorder = WorkoutRecorder()

    @Published var paired = false
    @Published var account: TrackAccount?
    @Published var watchers: [String] = []
    @Published var claimCode = ""
    @Published var status = TrackStatus()
    @Published var ended: TrackStatus?
    @Published var message: String?
    @Published var busy = false

    private var settings = TrackSettings()
    private var claimTimer: Timer?
    private var batteryTimer: Timer?
    private let defaults = UserDefaults.standard

    private override init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Tracker", isDirectory: true)
        engine = TrackEngine(directory: dir, client: client, key: { DeviceStore.shared.key })
        super.init()
        engine.delegate = self
        recorder.onFix = { [weak self] fix in self?.engine.add(fix) }
        reload()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
        readBattery()
        batteryTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.readBattery() }
        engine.update(settings: settings)
        if engine.resume() {
            recorder.start()
        }
        if !paired { beginClaim() }
    }

    private func reload() {
        account = store.account
        paired = store.isPaired
        watchers = store.watchers
        settings = store.settings
        Lang.set(account?.lang)
    }

    private func readBattery() {
        let lvl = WKInterfaceDevice.current().batteryLevel
        engine.setBattery(lvl >= 0 ? Int((lvl * 100).rounded()) : nil, lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
    }

    // MARK: claim code (design.md « Watches: claim codes »)

    func beginClaim() {
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

    private func pollClaim() {
        guard !paired, let key = Keychain.get("claimKey") else {
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
        engine.update(settings: settings)
    }

    /// A pair code sent by the iPhone app.
    private func pair(code: String) {
        guard PairCode.isCode(code) else { return }
        busy = true
        let device: [String: Any] = [
            "kind": "applewatch", "platform": "watchos", "version": AppConfig.version,
            "os": WKInterfaceDevice.current().systemVersion, "model": AppConfig.model,
        ]
        Task {
            do {
                let r = try await client.pair(code: code, device: device)
                await MainActor.run {
                    self.store.save(device: r.device, key: r.key, account: r.account, watchers: r.watchers, settings: r.settings)
                    self.busy = false
                    self.claimed()
                }
            } catch {
                await MainActor.run {
                    self.busy = false
                    self.message = AppModelText.pairError(error)
                }
            }
        }
    }

    func unpair() {
        guard status.phase == .idle else { return }
        engine.discard()
        store.forget()
        reload()
        beginClaim()
    }

    // MARK: the run

    func start() {
        guard paired, status.phase == .idle else { return }
        ended = nil
        recorder.authorize { [weak self] ok in
            guard let self else { return }
            if !ok { self.message = L("watch.health") }
            self.recorder.start()
            self.engine.start(share: "watchers")
        }
    }

    func stop() {
        recorder.stop()
        engine.stop(reason: .user)
    }

    func help() {
        engine.help()
        WKInterfaceDevice.current().play(.notification)
    }

    func trackChanged(_ s: TrackStatus) {
        status = s
    }

    func trackEnded(_ s: TrackStatus, reason: EndReason) {
        recorder.stop()
        ended = s
        status = engine.snapshot()
    }

    func trackDeviceRemoved() {
        recorder.stop()
        store.forget()
        reload()
        status = TrackStatus()
        message = L("removed.watch")
        beginClaim()
    }

    // MARK: WatchConnectivity

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receive(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        receive(userInfo)
    }

    private func receive(_ msg: [String: Any]) {
        guard let code = msg["pairCode"] as? String else { return }
        DispatchQueue.main.async {
            if self.status.phase == .idle { self.pair(code: code) }
        }
    }
}

enum AppModelText {
    static func pairError(_ error: Error) -> String {
        switch error as? TrackAPIError {
        case .code?: return L("pair.error.code")
        case .tooMany?: return L("pair.error.many")
        case .network?: return L("pair.error.network")
        default: return L("pair.error.other")
        }
    }
}
