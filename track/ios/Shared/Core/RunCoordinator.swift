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
/// the queue of each destination — Ozimut's account when the device is linked (« oz »), Folloz's relay when someone
/// follows (« z ») —, each with its own engine. The run ends once every destination has sent its last batch. Its state is
/// kept in the preferences so that a run left open is taken up again after the system ended the app. Used on the main
/// thread; the position comes from the iPhone's LocationTracker or the watch's WorkoutRecorder.
///
/// Its pace (docs/track/folloz.md « Pace », `PaceState`): Direct, or a long run keeping one fix every `fix` seconds and
/// sending every `send` seconds, switched to Direct for a while when a watcher asks it (`applyBoost`: from a background
/// notification or a batch's answer) and back by itself when that time is over. The watch only runs Direct.
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
        /// nil: a run saved before paces existed (Direct).
        var pace: PaceState?
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
    /// The location's saving changed: true for a long run's own pace (a lower accuracy asked), false for Direct. Told before
    /// `startLocation` and whenever a watcher's request starts or ends.
    var setLocationSaving: ((Bool) -> Void)?
    /// The battery level now (nil: unknown).
    var battery: () -> Int? = { nil }

    private let links: [String: Link]
    private let paceBox = PaceBox()
    private var ozSettings = TrackSettings()
    /// The time of the last fix kept (a long run keeps one every `fix` seconds).
    private var lastKept: Int64 = 0
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
        paceBox.set(saved?.pace)
        let box = paceBox
        ozEngine.paceJson = { box.json(interval: $0) }
        relayEngine.paceJson = { box.json(interval: $0) }
        (relay as? RelayDestination)?.onBoost = { [weak self] b in
            DispatchQueue.main.async { self?.applyBoost(b) }
        }
    }

    private func engine(_ dest: String) -> TrackEngine {
        dest == RunCoordinator.oz ? ozEngine : relayEngine
    }

    var active: Bool { saved != nil }

    /// The run's longest duration in seconds (nil: no run).
    var cap: Int? { saved?.cap }

    private static func seconds(_ d: Date = Date()) -> Int64 {
        Int64(floor(d.timeIntervalSince1970))
    }

    /// Ozimut's settings for its engine (the cap is the coordinator's), the relay's own.
    func update(ozimut settings: TrackSettings) {
        ozSettings = settings
        applyEngineSettings()
    }

    /// The engines' settings: the account's and the relay's in Direct, the long pace's batches in a long run.
    private func applyEngineSettings() {
        var s = ozSettings
        s.cap = Int(Int32.max)
        var r = TrackSettings()
        r.batch = RelayConfig.current.watched
        r.cap = Int(Int32.max)
        let now = RunCoordinator.seconds()
        if let every = saved?.pace?.sendEvery(now: now) {
            s.batch = every
            r.batch = every
        }
        ozEngine.update(settings: s)
        relayEngine.update(settings: r)
        let b = RunCoordinator.bounds(saved?.pace, now: now)
        ozEngine.setBounds(minimum: b.lo, maximum: b.hi)
        relayEngine.setBounds(minimum: b.lo, maximum: b.hi)
    }

    /// The bounds of the interval between batches a server may ask: a long run keeping its own pace sends every `send`
    /// seconds whatever it is told (a request for Direct it refused never makes it send faster), one a watcher asked to see
    /// live every 15 s at most; Direct follows the server from 5 s to 15 min.
    private static func bounds(_ p: PaceState?, now: Int64) -> (lo: Int, hi: Int) {
        guard let p, p.choice.long else { return (5, 900) }
        return p.boosted(now: now) ? (5, PaceChoice.boostSend) : (p.choice.send, 900)
    }

    func setBattery(_ level: Int?, lowPower: Bool) {
        ozEngine.setBattery(level, lowPower: lowPower)
        relayEngine.setBattery(level, lowPower: lowPower)
    }

    // MARK: the run

    /// Starts a run from the visible Start screen. `share`: live to the people who follow (the relay). `pace`: Direct (the
    /// watch's always) or a long run, which lasts 7 days at most whatever `cap` says.
    @discardableResult
    func start(share: Bool, linked: Bool, cap: Int?, pace: PaceChoice = .direct, now: Date = Date()) -> String? {
        guard saved == nil else { return nil }
        let run = RunId.make(start: now)
        var dests: [String] = []
        if linked { dests.append(RunCoordinator.oz) }
        if share && ChannelStore.shared.exists { dests.append(RunCoordinator.relay) }
        let p = PaceState(choice: pace.clamped)
        Alerts.clear()
        alertWatch = AlertWatch(window: p.stillSeconds, slack: p.stillSlack)
        fixes = 0
        distance = 0
        prevGood = nil
        lastKept = 0
        reason = .user
        engineStatus = [:]
        saved = Saved(run: run, started: now.timeIntervalSince1970, share: share, dests: dests, helpAt: nil, phase: "running",
                      cap: p.choice.long ? PaceChoice.longCap : (cap ?? RunCoordinator.defaultCap), pace: p)
        paceBox.set(p)
        save(force: true)
        applyEngineSettings()
        ozEngine.discard()
        relayEngine.discard()
        for d in dests { engine(d).start(run: run, share: share ? "watchers" : "private", now: now) }
        setLocationSaving?(!p.live(now: RunCoordinator.seconds(now)))
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
        lastKept = kept.last?.t ?? 0
        let now = RunCoordinator.seconds()
        if var p = s.pace {
            // a request for Direct that ended while the app was away
            _ = p.expire(now: now, battery: battery())
            s.pace = p
        }
        alertWatch = AlertWatch(window: s.pace?.stillSeconds ?? AlertWatch.stillSeconds, slack: s.pace?.stillSlack ?? 10)
        paceBox.set(s.pace)
        saved = s
        applyEngineSettings()
        s.dests = s.dests.filter { engine($0).resume() }
        saved = s
        save(force: true)
        if s.phase == "running" {
            setLocationSaving?(!(s.pace?.live(now: now) ?? true))
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
        // a long run keeps one fix every `fix` seconds (Direct, and a watcher's request for it, every fix)
        if let p = s.pace, lastKept > 0 {
            let every = Int64(p.fixEvery(now: f.t))
            if every > 1 && f.t - lastKept < every { return }
        }
        lastKept = f.t
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

    // MARK: the pace

    /// A watcher's request for Direct (a background notification, or a batch's answer, docs/track/folloz.md « Pace »):
    /// looked at once; refused when the runner did not allow it or the battery is under 20 %; else Direct until its
    /// `until`, then the long pace again by itself. A batch reporting the pace kept goes within a few seconds.
    @discardableResult
    func applyBoost(_ b: Boost, now: Date = Date()) -> PaceState.Outcome {
        guard var s = saved, s.phase == "running", var p = s.pace else { return .notLong }
        let out = p.apply(b, battery: battery(), now: RunCoordinator.seconds(now))
        if out == .seen || out == .notLong { return out }
        s.pace = p
        saved = s
        save(force: true)
        paceChanged(soon: true)
        return out
    }

    /// The pace changed during the run: the location's accuracy, the engines' cadence, and (`soon`) a batch within a few
    /// seconds so that the watchers read the pace kept.
    private func paceChanged(soon: Bool) {
        guard let s = saved, let p = s.pace else { return }
        paceBox.set(p)
        let now = RunCoordinator.seconds()
        setLocationSaving?(!p.live(now: now))
        let every = p.sendEvery(now: now) ?? RelayConfig.current.watched
        let b = RunCoordinator.bounds(p, now: now)
        for e in [ozEngine, relayEngine] { e.repace(interval: every, minimum: b.lo, maximum: b.hi, soon: soon ? 5 : nil) }
        publish(force: true)
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
        paceBox.set(nil)
        save(force: true)
        engineStatus = [:]
        publish(force: true)
        delegate?.runEnded(final, reason: reason)
    }

    // MARK: every ten seconds: the cap, a request for Direct over, a channel made during the run, the battery

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
        // a watcher's request for Direct over (its time, or the battery now low): the long pace again
        if var p = s.pace, p.expire(now: RunCoordinator.seconds(), battery: battery()) {
            s.pace = p
            saved = s
            save(force: true)
            paceChanged(soon: false)
        }
        // a channel made during the run (a first code shown): the relay joins from now on
        if s.share && !s.dests.contains(RunCoordinator.relay) && ChannelStore.shared.exists {
            s.dests.append(RunCoordinator.relay)
            saved = s
            save(force: true)
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
        st.pace = s.pace
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
