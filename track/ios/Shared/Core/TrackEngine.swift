import Foundation
import Network

enum TrackPhase: String {
    case idle, running, ending
}

enum EndReason: Equatable {
    /// Stop held on the device.
    case user
    /// The server answered `stop: true` (a parent ended it, or the device was removed).
    case remote
    /// The account's cap (`settings.cap` seconds from the start).
    case cap
    /// 409: the server had closed the run.
    case closed
}

/// What the screens show of the tracker.
struct TrackStatus: Equatable {
    var phase: TrackPhase = .idle
    var run: String?
    var started: Date?
    var fixes = 0
    var pending = 0
    var distance = 0.0
    var lastSent: Date?
    var lastError: String?
    var helpAt: Date?
    var online = true
}

protocol TrackEngineDelegate: AnyObject {
    func trackChanged(_ status: TrackStatus)
    func trackEnded(_ status: TrackStatus, reason: EndReason)
    /// 401: the device was removed; it forgets its key.
    func trackDeviceRemoved()
}

/// The tracker's core, shared by the iPhone and the Apple Watch: each fix written at once to the on-disk queue,
/// batches sent on another path every `next` seconds, at once for help, at the end and when the network returns;
/// retries from 5 s doubling to 5 min. Everything runs on one serial queue; the location callback only enqueues.
final class TrackEngine {
    let q = DispatchQueue(label: "com.ozimut.track.engine")
    private let store: FixQueue?
    private let client: TrackPushing
    private let key: () -> String?
    weak var delegate: TrackEngineDelegate?

    private var settings = TrackSettings()
    private var current: QueuedRun?
    private var endReason: EndReason?
    private var timer: DispatchWorkItem?
    private var inFlight = false
    private var backoff: TimeInterval = 5
    private var interval: TimeInterval = 30
    private var battery: Int?
    private var lowPower = false
    private var online = true
    private var lastError: String?
    private var helpAt: Date?
    private var lastPublish = Date.distantPast
    private let monitor: NWPathMonitor?

    /// `directory`: where the queue lives. `monitorNetwork`: off in tests.
    init(directory: URL, client: TrackPushing, key: @escaping () -> String?, monitorNetwork: Bool = true) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        store = try? FixQueue(path: directory.appendingPathComponent("track.sqlite").path)
        self.client = client
        self.key = key
        monitor = monitorNetwork ? NWPathMonitor() : nil
        monitor?.pathUpdateHandler = { [weak self] path in
            self?.pathChanged(path.status == .satisfied)
        }
        monitor?.start(queue: q)
    }

    // MARK: called from anywhere

    func update(settings s: TrackSettings) {
        q.async { self.settings = s }
    }

    func setBattery(_ level: Int?, lowPower lp: Bool) {
        q.async {
            self.battery = level
            self.lowPower = lp
        }
    }

    /// Opens a run; the first batch goes within a few seconds so that the run opens on the server.
    @discardableResult
    func start(share: String, now: Date = Date()) -> String {
        let run = RunId.make(start: now)
        q.sync {
            store?.openRun(run, started: Int64(floor(now.timeIntervalSince1970)), share: share)
            current = store?.row(run)
            endReason = nil
            helpAt = nil
            lastError = nil
            backoff = 5
            interval = TimeInterval(settings.batch)
            schedule(after: 5)
            publish(force: true)
        }
        return run
    }

    /// After a relaunch: takes up a run still open. Answers whether there was one.
    func resume() -> Bool {
        q.sync {
            guard current == nil, let r = store?.openRunRow() else { return current != nil }
            current = r
            endReason = r.endSeq > 0 ? .user : nil
            interval = TimeInterval(settings.batch)
            schedule(after: 1)
            publish(force: true)
            return true
        }
    }

    /// A new fix: returns at once, the write happens on the engine's queue.
    func add(_ fix: TrackFix) {
        q.async { self.insert(fix) }
    }

    /// « J'ai besoin d'aide »: a help batch, sent at once.
    func help() {
        q.async {
            guard let r = self.current, self.endReason == nil else { return }
            self.store?.seal(r.run, state: .help, heartbeat: true)
            self.helpAt = Date()
            self.backoff = 5
            self.flush(seal: false)
            self.publish(force: true)
        }
    }

    func stop(reason: EndReason = .user) {
        q.async { self.beginEnd(reason) }
    }

    /// The network came back (also called by the app when it returns to the foreground).
    func sendNow() {
        q.async {
            self.backoff = 5
            self.flush(seal: true)
        }
    }

    /// Forgets the run and its fixes (the device was removed).
    func discard() {
        q.async {
            self.timer?.cancel()
            self.timer = nil
            self.store?.wipe()
            self.current = nil
            self.endReason = nil
            self.publish(force: true)
        }
    }

    func snapshot() -> TrackStatus {
        q.sync { status() }
    }

    // MARK: on the queue

    private func insert(_ f: TrackFix) {
        guard var r = current, endReason == nil, let store else { return }
        var d = 0.0
        if let last = r.lastFix {
            if f.t <= last.t { return }
            if f.ac <= 50 && last.ac <= 50 { d = Geo.distance(last, f) }
        }
        store.add(f, run: r.run, distance: d)
        r.fixes += 1
        r.distance += d
        r.lastFix = f
        current = r
        if f.t - r.started >= Int64(settings.cap) {
            beginEnd(.cap)
            return
        }
        publish(force: false)
    }

    private func beginEnd(_ reason: EndReason) {
        guard let r = current, endReason == nil else { return }
        endReason = reason
        store?.seal(r.run, state: .end, heartbeat: true)
        current = store?.row(r.run) ?? current
        backoff = 5
        timer?.cancel()
        timer = nil
        flush(seal: false)
        publish(force: true)
    }

    private func pathChanged(_ up: Bool) {
        let was = online
        online = up
        if up && !was && current != nil {
            backoff = 5
            flush(seal: true)
        }
        publish(force: true)
    }

    private func schedule(after t: TimeInterval) {
        timer?.cancel()
        let w = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.timer = nil
            self.flush(seal: true)
        }
        timer = w
        q.asyncAfter(deadline: .now() + max(1, t), execute: w)
    }

    /// Sends the first batch not acknowledged. `seal`: first number the fixes waiting into batches (a scheduled send);
    /// without it only batches already made go (after an acknowledgement, so that a backlog drains without making
    /// a batch of each new fix).
    private func flush(seal: Bool) {
        guard let store, let r = current, !inFlight else { return }
        if seal && endReason == nil {
            store.seal(r.run, state: .run, heartbeat: !store.hasUnackedBatch(r.run))
        }
        guard let batch = store.nextBatch(r.run) else {
            if endReason != nil { finish() } else { schedule(after: interval) }
            return
        }
        guard let key = key() else {
            lastError = "device"
            schedule(after: 60)
            publish(force: true)
            return
        }
        let left = store.pending(r.run) - batch.fixes.count
        guard let body = try? BatchEncoder.encode(batch, battery: battery, lowPower: lowPower, left: left) else { return }
        inFlight = true
        timer?.cancel()
        timer = nil
        client.push(key: key, body: body) { [weak self] result in
            self?.q.async { self?.handle(result, batch: batch) }
        }
    }

    private func handle(_ result: PushResult, batch: TrackBatch) {
        inFlight = false
        guard let store, let r = current, r.run == batch.run else { return }
        switch result {
        case let .ok(ack, next, stop):
            if let next { interval = TimeInterval(min(max(next, 5), 600)) }
            if ack < batch.seq && ack <= r.acked {
                // The server did not take it (a gap): try again a little later.
                lastError = "ack"
                retry()
                return
            }
            store.ack(r.run, upTo: ack)
            let now = Date()
            store.setSent(r.run, at: Int64(now.timeIntervalSince1970))
            current = store.row(r.run)
            backoff = 5
            lastError = nil
            if stop && endReason == nil {
                beginEnd(.remote)
                return
            }
            if let c = current, endReason != nil, c.endSeq > 0, c.acked >= c.endSeq {
                finish()
                return
            }
            if store.hasUnackedBatch(r.run) {
                flush(seal: false)
            } else {
                schedule(after: interval)
            }
        case .unauthorized:
            timer?.cancel()
            timer = nil
            store.wipe()
            current = nil
            endReason = nil
            lastError = "device"
            let d = delegate
            DispatchQueue.main.async { d?.trackDeviceRemoved() }
        case .closed:
            if endReason == nil { endReason = .closed }
            finish()
        case .tooLarge:
            if !store.split(r.run, seq: batch.seq) {
                // A batch of one fix refused: give it up rather than block the run.
                store.ack(r.run, upTo: batch.seq)
            }
            current = store.row(r.run)
            flush(seal: false)
        case let .slow(next):
            lastError = "slow"
            schedule(after: TimeInterval(next ?? Int(backoff)))
            backoff = min(backoff * 2, 300)
        case let .failed(msg):
            lastError = msg
            retry()
        }
        publish(force: true)
    }

    private func retry() {
        schedule(after: backoff)
        backoff = min(backoff * 2, 300)
    }

    private func finish() {
        guard let r = current else { return }
        let reason = endReason ?? .user
        var st = status()
        st.phase = .idle
        timer?.cancel()
        timer = nil
        store?.close(r.run)
        current = nil
        endReason = nil
        helpAt = nil
        let d = delegate
        DispatchQueue.main.async { d?.trackEnded(st, reason: reason) }
        publish(force: true)
    }

    private func status() -> TrackStatus {
        var s = TrackStatus()
        s.online = online
        s.lastError = lastError
        guard let r = current else { return s }
        s.phase = endReason == nil ? .running : .ending
        s.run = r.run
        s.started = Date(timeIntervalSince1970: TimeInterval(r.started))
        s.fixes = r.fixes
        s.pending = store?.pending(r.run) ?? 0
        s.distance = r.distance
        s.lastSent = r.lastSent > 0 ? Date(timeIntervalSince1970: TimeInterval(r.lastSent)) : nil
        s.helpAt = helpAt
        return s
    }

    private func publish(force: Bool) {
        let now = Date()
        if !force && now.timeIntervalSince(lastPublish) < 1 { return }
        lastPublish = now
        let s = status()
        let d = delegate
        DispatchQueue.main.async { d?.trackChanged(s) }
    }
}
