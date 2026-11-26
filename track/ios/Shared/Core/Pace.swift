import Foundation

/*
 * The pace of a run (docs/track/folloz.md « Pace »): Direct — one fix a second — or « Course longue » — one fix every 15,
 * 30 or 60 s, batches every 5, 10 or 15 minutes —, and a watcher's request for Direct for a while. Pure: RunCoordinator keeps
 * the state, the watcher's screens read the phone's, the tests check the rules. Shared by the iPhone, the watch (always
 * Direct) and the tests.
 */

/// The runner's choice at the start.
struct PaceChoice: Codable, Equatable {
    /// « Course longue » (false: Direct).
    var long: Bool
    /// Seconds between fixes in a long run.
    var fix: Int
    /// Seconds between batches in a long run.
    var send: Int
    /// Watchers may ask for Direct for a while.
    var remote: Bool

    static let fixes = [15, 30, 60]
    static let sends = [300, 600, 900]
    static let direct = PaceChoice(long: false, fix: 30, send: 600, remote: true)
    /// A long run lasts this long at most (Direct: 6 hours, or the Ozimut account's cap).
    static let longCap = 7 * 86_400
    /// The batches while a watcher's request for Direct holds.
    static let boostSend = 15
    /// Under this battery level (%) a request for Direct is refused, and one under way ends.
    static let boostBattery = 20

    private static func nearest(_ v: Int, _ list: [Int]) -> Int {
        list.min { abs($0 - v) < abs($1 - v) } ?? v
    }

    /// The same with figures the contract allows (the nearest of each list).
    var clamped: PaceChoice {
        PaceChoice(long: long, fix: PaceChoice.nearest(fix, PaceChoice.fixes), send: PaceChoice.nearest(send, PaceChoice.sends),
                   remote: remote)
    }

    /// The last choice made on this device (Direct the first time).
    static func load(_ d: UserDefaults = .standard) -> PaceChoice {
        guard let data = d.data(forKey: "oz.pace"), let p = try? JSONDecoder().decode(PaceChoice.self, from: data) else {
            return .direct
        }
        return p.clamped
    }

    func save(_ d: UserDefaults = .standard) {
        if let data = try? JSONEncoder().encode(self) { d.set(data, forKey: "oz.pace") }
    }
}

/// A watcher's request for Direct, as the relay gives it (`{ until, at, by }`, a batch's answer, a background notification,
/// a watcher's read): Direct until `until` (Unix seconds), asked at `at` by the watcher `by`; `until <= at` asks for the long
/// pace again.
struct Boost: Codable, Equatable {
    var until: Int64
    var at: Int64
    var by: String

    init(until: Int64, at: Int64, by: String) {
        self.until = until
        self.at = at
        self.by = by
    }

    /// From the relay's object (numbers, or numbers written as texts); nil for null or anything else.
    init?(json: Any?) {
        guard let d = json as? [String: Any], let u = JSON.int64(d["until"]), let a = JSON.int64(d["at"]) else { return nil }
        until = u
        at = a
        by = (d["by"] as? String) ?? ""
    }
}

/// The pace a run keeps: the runner's choice, and a watcher's request for Direct when one holds.
struct PaceState: Codable, Equatable {
    enum Outcome: Equatable {
        /// Already looked at (the same request again: every answer carries the relay's last one).
        case seen
        /// A Direct run: there is nothing to change.
        case notLong
        /// The runner did not allow it, or the battery is low: the long pace stays.
        case refused
        /// Direct until the request's `until`.
        case applied
        /// The long pace again (asked, or the request was already over).
        case back
    }

    var choice: PaceChoice
    /// The request for Direct being kept (nil: the choice's own pace).
    var boost: Boost?
    /// The last request looked at: each is applied or refused once.
    var last: Boost?
    /// The last request was refused.
    var refused: Bool

    init(choice: PaceChoice) {
        self.choice = choice
        boost = nil
        last = nil
        refused = false
    }

    /// A watcher's request for Direct is under way at `now`.
    func boosted(now: Int64) -> Bool {
        choice.long && (boost?.until ?? 0) > now
    }

    /// One fix a second at `now`: a Direct run, or a long run a watcher asked to see live.
    func live(now: Int64) -> Bool {
        !choice.long || boosted(now: now)
    }

    /// Seconds between the fixes kept.
    func fixEvery(now: Int64) -> Int {
        live(now: now) ? 1 : choice.fix
    }

    /// Seconds between batches the phone keeps by itself; nil in a Direct run (the relay's or the account's `next`).
    func sendEvery(now: Int64) -> Int? {
        guard choice.long else { return nil }
        return boosted(now: now) ? PaceChoice.boostSend : choice.send
    }

    /// Standing still: under 15 m in this many seconds (rule 5).
    var stillSeconds: Int64 { choice.long ? 1800 : 300 }

    /// How far the oldest fix of the still window may lie from its start (the fixes are `fix` seconds apart in a long run).
    var stillSlack: Int64 { choice.long ? Int64(2 * choice.fix) : 10 }

    /// A watcher's request: applied once (the same request again is `seen`), refused when the runner did not allow it or
    /// the battery is under 20 % (unknown: allowed).
    mutating func apply(_ b: Boost, battery: Int?, now: Int64) -> Outcome {
        guard choice.long else { return .notLong }
        if let l = last, b == l || b.at < l.at { return .seen }
        last = b
        if b.until <= now {
            boost = nil
            refused = false
            return .back
        }
        if !choice.remote || (battery ?? 100) < PaceChoice.boostBattery {
            boost = nil
            refused = true
            return .refused
        }
        boost = b
        refused = false
        return .applied
    }

    /// Ends a request whose time is over, or any request once the battery is low. -> whether the pace changed.
    mutating func expire(now: Int64, battery: Int?) -> Bool {
        guard let b = boost else { return false }
        if b.until <= now || (battery ?? 100) < PaceChoice.boostBattery {
            boost = nil
            return true
        }
        return false
    }

    /// The batch's `pace`: `{ mode, fix, send, remote, boost, by }`. A Direct run says `fix` 1 and `liveSend`, the
    /// interval in use; a long run its own figures, `boost` the end of a request under way (0: none).
    func json(now: Int64, liveSend: Int) -> [String: Any] {
        guard choice.long else {
            return ["mode": "live", "fix": 1, "send": liveSend, "remote": false, "boost": 0, "by": ""]
        }
        let b = boosted(now: now) ? boost : nil
        return ["mode": "long", "fix": choice.fix, "send": choice.send, "remote": choice.remote,
                "boost": b?.until ?? 0, "by": b?.by ?? ""]
    }
}

/// The pace of the run under way, read by the engines on their own queues for each batch.
final class PaceBox {
    private let lock = NSLock()
    private var state: PaceState?

    func set(_ s: PaceState?) {
        lock.lock()
        state = s
        lock.unlock()
    }

    /// `pace` for a batch sent every `interval` seconds; nil without a run.
    func json(interval: Int, now: Date = Date()) -> [String: Any]? {
        lock.lock()
        let s = state
        lock.unlock()
        return s?.json(now: Int64(now.timeIntervalSince1970), liveSend: interval)
    }
}

/// The pace a followed phone says it keeps (`pace` of a watcher's read).
struct RemotePace: Codable, Equatable {
    var long: Bool
    var fix: Int
    var send: Int
    var remote: Bool
    /// The end of a watcher's request for Direct the phone keeps (0: none).
    var boost: Int64
    /// The watcher who asked it.
    var by: String

    init(long: Bool, fix: Int, send: Int, remote: Bool, boost: Int64, by: String) {
        self.long = long
        self.fix = fix
        self.send = send
        self.remote = remote
        self.boost = boost
        self.by = by
    }

    init?(json: Any?) {
        guard let d = json as? [String: Any], let mode = d["mode"] as? String else { return nil }
        long = mode == "long"
        fix = JSON.int(d["fix"]) ?? 1
        send = JSON.int(d["send"]) ?? 0
        remote = (d["remote"] as? Bool) ?? false
        boost = JSON.int64(d["boost"]) ?? 0
        by = (d["by"] as? String) ?? ""
    }

    /// Direct asked by a watcher and kept by the phone at `now`.
    func boosted(now: Int64) -> Bool {
        long && boost > now
    }

    /// A watcher may ask for Direct: a long run allowing it, under way (`state` of the watcher's read).
    static func canAsk(_ p: RemotePace?, state: String) -> Bool {
        guard let p, p.long, p.remote else { return false }
        return !state.isEmpty && state != "end"
    }

    /// « Revenir au rythme lent » is offered: Direct kept by the phone, or asked and not over yet.
    static func canStop(_ p: RemotePace?, state: String, request: Boost?, now: Int64) -> Bool {
        guard canAsk(p, state: state), let p else { return false }
        if p.boosted(now: now) { return true }
        if let r = request, r.until > now, r.until > r.at { return true }
        return false
    }
}
