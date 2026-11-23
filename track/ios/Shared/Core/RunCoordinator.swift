import Foundation

protocol RunCoordinatorDelegate: AnyObject {
    func runChanged(_ status: TrackStatus)
    func runEnded(_ status: TrackStatus, reason: EndReason)
    /// The device was removed from its Ozimut account (the run goes on without it).
    func ozimutRemoved()
    /// The relay no longer knows this device's channel (the run goes on without it).
    func channelGone()
}

/// A run, as Android's TrackerService: one fix a second written at once to the run's file on the device (RunLog) and to
/// the queue of each destination — Ozimut's account when the device is linked (« oz »), Ozitrac's relay when someone
/// follows (« z ») —, each with its own engine. The run ends once every destination has sent its last batch. Its state is
/// kept in the preferences so that a run left open is taken up again after the system ended the app. Used on the main
/// thread; the position comes from the iPhone's LocationTracker or the watch's WorkoutRecorder.
final class RunCoordinator {
    static let oz = "oz"
    static let relay = "z"
    /// Fixes worse than this are kept (their accuracy says so) but not counted in the distance.
    static let goodForDistance = 30
    static let lowBattery = 15
    /// The longest run without Ozimut (Ozimut's account gives its own).
    static let defaultCap = 6 * 3600

    private struct Saved: Codable {
        var run: String
        var started: Double
        var share: Bool
        var dests: [String]
        var helpAt: Double?
        var phase: String
        var cap: Int
        var batteryTold = false
    }

    private final class Link: TrackEngineDelegate {
        weak var owner: RunCoordinator?
        let dest: String

        init(_ dest: String) {
            self.dest = dest
        }

        func trackChanged(_ status: TrackStatus) { owner?.engineChanged(dest, status) }
        func trackEnded(_ status: TrackStatus, reason: EndReason) { owner?.engineEnded(dest, reason) }
        func trackDeviceRemoved() { owner?.engineRemoved(dest) }
    }

    let ozEngine: TrackEngine
    let relayEngine: TrackEngine
    weak var delegate: RunCoordinatorDelegate?
    var startLocation: (() -> Void)?
    var stopLocation: (() -> Void)?
    /// The battery level now (nil: unknown).
    var battery: () -> Int? = { nil }

    private let links: [String: Link]
    private let defaults: UserDefaults
    private var saved: Saved?
    private var engineStatus: [String: TrackStatus] = [:]
    private var reason: EndReason = .user
    private var alertWatch = AlertWatch()
    private var timer: Timer?
    private var fixes = 0
    private var distance = 0.0
    private var prevGood: TrackFix?
    private var lastPublish = Date.distantPast
    private var lastSave = Date.distantPast
    private(set) var status = TrackStatus()

    init(directory: URL, ozimut: TrackDestination, relay: TrackDestination = RelayDestination(), monitorNetwork: Bool = true,
         defaults: UserDefaults = .standard) {
        ozEngine = TrackEngine(directory: directory, file: "track.sqlite", destination: ozimut, monitorNetwork: monitorNetwork)
        relayEngine = TrackEngine(directory: directory, file: "relay.sqlite", destination: relay, monitorNetwork: monitorNetwork)
        self.defaults = defaults
        links = [RunCoordinator.oz: Link(RunCoordinator.oz), RunCoordinator.relay: Link(RunCoordinator.relay)]
        for l in links.values { l.owner = self }
        ozEngine.delegate = links[RunCoordinator.oz]
        relayEngine.delegate = links[RunCoordinator.relay]
        if let d = defaults.data(forKey: "oz.run"), let s = try? JSONDecoder().decode(Saved.self, from: d) { saved = s }
    }

    private func engine(_ dest: String) -> TrackEngine {
        dest == RunCoordinator.oz ? ozEngine : relayEngine
    }

    var active: Bool { saved != nil }

    /// Ozimut's settings for its engine (the cap is the coordinator's), the relay's own.
    func update(ozimut settings: TrackSettings) {
        var s = settings
        s.cap = Int(Int32.max)
        ozEngine.update(settings: s)
        var r = TrackSettings()
        r.batch = RelayConfig.current.watched
        r.cap = Int(Int32.max)
        relayEngine.update(settings: r)
    }

    func setBattery(_ level: Int?, lowPower: Bool) {
        ozEngine.setBattery(level, lowPower: lowPower)
        relayEngine.setBattery(level, lowPower: lowPower)
    }

    // MARK: the run

    /// Starts a run from the visible Start screen. `share`: live to the people who follow (the relay).
    @discardableResult
    func start(share: Bool, linked: Bool, cap: Int?, now: Date = Date()) -> String? {
        guard saved == nil else { return nil }
        let run = RunId.make(start: now)
        var dests: [String] = []
        if linked { dests.append(RunCoordinator.oz) }
        if share && ChannelStore.shared.exists { dests.append(RunCoordinator.relay) }
        Alerts.clear()
        alertWatch = AlertWatch()
        fixes = 0
        distance = 0
        prevGood = nil
        reason = .user
        engineStatus = [:]
        saved = Saved(run: run, started: now.timeIntervalSince1970, share: share, dests: dests, helpAt: nil, phase: "running",
                      cap: cap ?? RunCoordinator.defaultCap)
        save(force: true)
        ozEngine.discard()
        relayEngine.discard()
        for d in dests { engine(d).start(run: run, share: share ? "watchers" : "private", now: now) }
        startLocation?()
        startTimer()
        publish(force: true)
        return run
    }

    /// After a relaunch: takes up a run left open. Answers whether there was one.
    @discardableResult
    func resume() -> Bool {
        guard var s = saved else { return false }
        let kept = RunLog.read(RunLog.url(s.run))
        fixes = kept.count
        distance = Geo.length(kept, maxAcc: RunCoordinator.goodForDistance)
        prevGood = kept.last { $0.ac <= RunCoordinator.goodForDistance }
        s.dests = s.dests.filter { engine($0).resume() }
        saved = s
        save(force: true)
        if s.phase == "running" {
            startLocation?()
            startTimer()
        } else {
            for d in s.dests { engine(d).stop(reason: reason) }
            if s.dests.isEmpty { finish() }
        }
        publish(force: true)
        return true
    }

    func add(_ f: TrackFix) {
        guard let s = saved, s.phase == "running" else { return }
        RunLog.append(run: s.run, fix: f)
        for d in s.dests { engine(d).add(f) }
        fixes += 1
        if f.ac <= RunCoordinator.goodForDistance {
            if let p = prevGood, f.t > p.t { distance += Geo.distance(p, f) }
            prevGood = f
        }
        let raised = alertWatch.onFix(f, runStarted: Int64(s.started))
        if !raised.isEmpty && s.dests.contains(RunCoordinator.relay) {
            for a in raised { Alerts.add(a) }
            relayEngine.sendNow()
        }
        publish(force: false)
    }

    /// « J'ai besoin d'aide »: a help batch to every destination at once.
    func help() {
        guard var s = saved, s.phase == "running" else { return }
        s.helpAt = Date().timeIntervalSince1970
        saved = s
        save(force: true)
        for d in s.dests { engine(d).help() }
        publish(force: true)
    }

    func stop(reason r: EndReason = .user) {
        guard var s = saved, s.phase == "running" else { return }
        reason = r
        s.phase = "ending"
        saved = s
        save(force: true)
        stopLocation?()
        timer?.invalidate()
        timer = nil
        if s.dests.isEmpty {
            finish()
            return
        }
        for d in s.dests { engine(d).stop(reason: r) }
        publish(force: true)
    }

    /// The network came back, or the app returned to the foreground.
    func sendNow() {
        guard let s = saved else { return }
        for d in s.dests { engine(d).sendNow() }
    }

    // MARK: the engines

    private func engineChanged(_ dest: String, _ st: TrackStatus) {
        engineStatus[dest] = st
        // An engine ending a run the runner did not stop: Ozimut answered `stop` (a parent ended it).
        if let s = saved, s.phase == "running", s.dests.contains(dest), st.phase == .ending {
            stop(reason: .remote)
            return
        }
        publish(force: true)
    }

    private func engineEnded(_ dest: String, _ r: EndReason) {
        drop(dest)
    }

    private func engineRemoved(_ dest: String) {
        if dest == RunCoordinator.oz {
            DeviceStore.shared.forget()
            delegate?.ozimutRemoved()
        } else {
            ChannelStore.shared.forget()
            delegate?.channelGone()
        }
        drop(dest)
    }

    private func drop(_ dest: String) {
        engineStatus[dest] = nil
        guard var s = saved else { return }
        s.dests.removeAll { $0 == dest }
        saved = s
        save(force: true)
        if s.phase == "ending" && s.dests.isEmpty {
            finish()
        } else {
            publish(force: true)
        }
    }

    private func finish() {
        guard saved != nil else { return }
        var final = aggregate()
        final.phase = .idle
        timer?.invalidate()
        timer = nil
        saved = nil
        save(force: true)
        engineStatus = [:]
        publish(force: true)
        delegate?.runEnded(final, reason: reason)
    }

    // MARK: every ten seconds: the cap, a channel made during the run, the battery

    private func startTimer() {
        timer?.invalidate()
        let t = Timer(timeInterval: 10, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard var s = saved, s.phase == "running" else { return }
        if Date().timeIntervalSince1970 - s.started >= Double(s.cap) {
            stop(reason: .cap)
            return
        }
        // a channel made during the run (a first code shown): the relay joins from now on
        if s.share && !s.dests.contains(RunCoordinator.relay) && ChannelStore.shared.exists {
            s.dests.append(RunCoordinator.relay)
            saved = s
            relayEngine.discard()
            relayEngine.start(run: s.run, share: "watchers", now: Date(timeIntervalSince1970: s.started))
        }
        if let b = battery(), b < RunCoordinator.lowBattery, s.dests.contains(RunCoordinator.relay), !s.batteryTold {
            s.batteryTold = true
            saved = s
            Alerts.add(Alerts.battery)
            relayEngine.sendNow()
        }
        save(force: false)
    }

    // MARK: state

    private func save(force: Bool) {
        let now = Date()
        if !force && now.timeIntervalSince(lastSave) < 10 { return }
        lastSave = now
        if let s = saved, let d = try? JSONEncoder().encode(s) {
            defaults.set(d, forKey: "oz.run")
        } else {
            defaults.removeObject(forKey: "oz.run")
        }
    }

    private func aggregate() -> TrackStatus {
        var st = TrackStatus()
        st.online = engineStatus.values.allSatisfy { $0.online } || engineStatus.isEmpty
        guard let s = saved else { return st }
        st.phase = s.phase == "running" ? .running : .ending
        st.run = s.run
        st.started = Date(timeIntervalSince1970: s.started)
        st.fixes = fixes
        st.distance = distance
        st.helpAt = s.helpAt.map { Date(timeIntervalSince1970: $0) }
        st.dests = s.dests
        st.pending = s.dests.reduce(0) { $0 + (engineStatus[$1]?.pending ?? 0) }
        st.lastSent = s.dests.compactMap { engineStatus[$0]?.lastSent }.max()
        st.lastError = s.dests.compactMap { engineStatus[$0]?.lastError }.first
        return st
    }

    private func publish(force: Bool) {
        let now = Date()
        if !force && now.timeIntervalSince(lastPublish) < 1 { return }
        lastPublish = now
        status = aggregate()
        delegate?.runChanged(status)
    }
}
