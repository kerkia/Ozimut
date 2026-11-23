import Foundation

/*
 * Ozitrac's relay, the followed device's side (docs/track/ozitrac.md), as Android's Relay.kt: the person's first name,
 * the relay's settings, the channel and its watchers (their keys kept in the Keychain), the alerts this device sees
 * itself, the zone, and the destination that sends a run to the relay. Shared by the iPhone and the Apple Watch.
 */

/// The relay's HTTP API under `<base>api/ozitrac/`. Ordinary requests, no cookies.
final class RelayHTTP {
    static let shared = RelayHTTP()

    struct Answer {
        var status: Int
        var json: [String: Any]?
    }

    private let session: URLSession

    init() {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.timeoutIntervalForResource = 60
        c.waitsForConnectivity = false
        c.httpShouldSetCookies = false
        c.httpCookieAcceptPolicy = .never
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.httpAdditionalHeaders = ["User-Agent": "Ozitrac/\(AppConfig.version)"]
        session = URLSession(configuration: c)
    }

    static func url(_ path: String) -> URL? {
        URL(string: "api/ozitrac/" + path, relativeTo: AppConfig.base)?.absoluteURL
    }

    /// nil: no answer (no network).
    func call(_ method: String, _ path: String, json: [String: Any]? = nil, body: Data? = nil, bearer: String? = nil) async -> Answer? {
        guard let url = RelayHTTP.url(path) else { return nil }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { r.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization") }
        if let json { r.httpBody = try? JSONSerialization.data(withJSONObject: json) } else if let body { r.httpBody = body }
        if r.httpBody != nil { r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        do {
            let (data, response) = try await session.data(for: r)
            return Answer(status: (response as? HTTPURLResponse)?.statusCode ?? 0, json: JSON.object(data))
        } catch {
            return nil
        }
    }
}

/// The person using this device: the first name put in the codes and sealed for the people followed.
enum Me {
    static var name: String {
        get { UserDefaults.standard.string(forKey: "oz.me.name") ?? "" }
        set { UserDefaults.standard.set(String(newValue.trimmingCharacters(in: .whitespacesAndNewlines).prefix(40)), forKey: "oz.me.name") }
    }
}

/// The relay's settings (`GET /api/ozitrac/config`), kept a day.
enum RelayConfig {
    static let osm = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    static let osmCredit = "© OpenStreetMap contributors"

    struct Cfg: Equatable {
        var tiles: String
        var credit: String
        var maxZoom: Int
        var watched: Int
        var idle: Int
    }

    private static let d = UserDefaults.standard

    static var current: Cfg {
        Cfg(tiles: d.string(forKey: "oz.cfg.tiles") ?? osm, credit: d.string(forKey: "oz.cfg.credit") ?? osmCredit,
            maxZoom: (d.object(forKey: "oz.cfg.maxZoom") as? Int) ?? 19, watched: (d.object(forKey: "oz.cfg.watched") as? Int) ?? 15,
            idle: (d.object(forKey: "oz.cfg.idle") as? Int) ?? 120)
    }

    /// The relay's last answer, for the map's layers (MapLayers); "" when it gave none.
    static var mapsJson: String? { d.string(forKey: "oz.cfg.maps") }

    /// Asks the relay again when a day has passed, or when its map layers were never read.
    static func refresh() async {
        if Date().timeIntervalSince1970 - d.double(forKey: "oz.cfg.at") < 86_400 && d.string(forKey: "oz.cfg.maps") != nil { return }
        guard let a = await RelayHTTP.shared.call("GET", "config"), a.status == 200, let j = a.json else { return }
        let whole = (try? JSONSerialization.data(withJSONObject: j)).flatMap { String(data: $0, encoding: .utf8) }
        let maps = j["layers"] != nil ? (whole ?? "") : ""
        if maps != d.string(forKey: "oz.cfg.maps") {
            d.set(maps, forKey: "oz.cfg.maps")
            DispatchQueue.main.async { NotificationCenter.default.post(name: MapLayers.changed, object: nil) }
        }
        let tiles = (j["tiles"] as? String) ?? ""
        d.set(tiles.contains("{z}") && tiles.hasPrefix("https://") ? tiles : osm, forKey: "oz.cfg.tiles")
        let credit = (j["attribution"] as? String) ?? ""
        d.set(credit.isEmpty ? osmCredit : credit, forKey: "oz.cfg.credit")
        d.set(min(max(JSON.int(j["maxZoom"]) ?? 19, 10), 22), forKey: "oz.cfg.maxZoom")
        d.set(min(max(JSON.int(j["watched"]) ?? 15, 5), 60), forKey: "oz.cfg.watched")
        d.set(min(max(JSON.int(j["idle"]) ?? 120, 30), 600), forKey: "oz.cfg.idle")
        d.set(Date().timeIntervalSince1970, forKey: "oz.cfg.at")
    }
}

/// This device's channel on the relay: its number, its secret, its codes waiting to be scanned, its watchers and their
/// keys. Kept in the Keychain (readable after the first unlock: a run sends with the screen off).
final class ChannelStore {
    static let shared = ChannelStore()

    struct Watcher: Codable, Equatable, Identifiable {
        var w: String
        var name: String?
        var k: String?
        var since: String
        var seen: String
        var id: String { w }
        var key: Data? { k.flatMap { B64.dec($0) } }
    }

    private struct Invite: Codable {
        var i: String
        var k: String
        var at: Double
    }

    private struct State: Codable {
        var c: String?
        var cs: String?
        var watchers: [Watcher] = []
        var invites: [Invite] = []
        var refreshed: Double = 0
    }

    private static let day: Double = 86_400
    private let lock = NSLock()
    private var state: State
    private let account: String

    /// Told (on the main thread) when the watchers or the channel change.
    var onChange: (() -> Void)?

    init(keychainAccount: String = "ozitrac.channel") {
        account = keychainAccount
        if let s = Keychain.get(keychainAccount), let st = try? JSONDecoder().decode(State.self, from: Data(s.utf8)) {
            state = st
        } else {
            state = State()
        }
    }

    private func locked<T>(_ f: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return f()
    }

    private func save() {
        let s = locked { state }
        if let d = try? JSONEncoder().encode(s) { Keychain.set(String(decoding: d, as: UTF8.self), account) }
        let cb = onChange
        DispatchQueue.main.async { cb?() }
    }

    var id: String? { locked { state.c } }
    var secret: String? { locked { state.cs } }
    var exists: Bool { id != nil }
    var watchers: [Watcher] { locked { state.watchers } }
    var refreshedAt: Date { Date(timeIntervalSince1970: locked { state.refreshed }) }

    /// The watchers whose key this device holds: those it can send to.
    var keyed: [(w: String, k: Data)] {
        watchers.compactMap { w in w.key.map { (w: w.w, k: $0) } }
    }

    /// Makes the channel when there is none. -> its number, or nil (no network).
    func ensure() async -> String? {
        if let c = id { return c }
        guard let a = await RelayHTTP.shared.call("POST", "channel", json: [:]), a.status == 200 || a.status == 201,
              let c = a.json?["c"] as? String, let cs = a.json?["cs"] as? String, !c.isEmpty, !cs.isEmpty else { return nil }
        locked {
            state = State()
            state.c = c
            state.cs = cs
        }
        save()
        return c
    }

    /// A new code for one watcher: the address to scan, or nil.
    func invite(name: String) async -> String? {
        guard let c = await ensure(), let cs = secret else { return nil }
        let i = Codes.random(16)
        let k = Codes.key()
        guard let a = await RelayHTTP.shared.call("POST", c + "/invite", json: ["i": i], bearer: cs) else { return nil }
        if a.status == 401 || a.status == 404 {
            forget()
            return nil
        }
        guard a.status == 200 else { return nil }
        let now = Date().timeIntervalSince1970
        locked {
            state.invites = state.invites.filter { now - $0.at < ChannelStore.day } + [Invite(i: i, k: B64.enc(k), at: now)]
        }
        save()
        return Codes.link(base: AppConfig.base.absoluteString, c: c, i: i, k: k, name: name)
    }

    /// Reads the watchers again; the new ones get the key of the code they scanned. -> false without network.
    @discardableResult
    func refresh() async -> Bool {
        guard let c = id, let cs = secret else { return true }
        guard let a = await RelayHTTP.shared.call("GET", c, bearer: cs) else { return false }
        if a.status == 401 || a.status == 404 {
            forget()
            return true
        }
        guard a.status == 200, let j = a.json else { return false }
        let list = (j["watchers"] as? [[String: Any]]) ?? []
        let now = Date().timeIntervalSince1970
        locked {
            let known = Dictionary(state.watchers.map { ($0.w, $0) }, uniquingKeysWith: { a, _ in a })
            var waiting = state.invites.filter { now - $0.at < ChannelStore.day }
            var out: [Watcher] = []
            for o in list {
                guard let w = o["w"] as? String, !w.isEmpty else { continue }
                let sealed = (o["name"] as? String) ?? ""
                var k = known[w]?.k
                var name = known[w]?.name
                if k == nil && !sealed.isEmpty {
                    for (n, inv) in waiting.enumerated() {
                        guard let key = B64.dec(inv.k),
                              let opened = Seal.openText(key: key, aad: Seal.nameAad(c: c), sealed: sealed) else { continue }
                        k = inv.k
                        name = opened
                        waiting.remove(at: n)
                        break
                    }
                }
                if let kk = k, name == nil, !sealed.isEmpty, let key = B64.dec(kk) {
                    name = Seal.openText(key: key, aad: Seal.nameAad(c: c), sealed: sealed)
                }
                out.append(Watcher(w: w, name: name, k: k, since: (o["since"] as? String) ?? "", seen: (o["seen"] as? String) ?? ""))
            }
            state.watchers = out
            state.invites = waiting
            state.refreshed = now
        }
        save()
        return true
    }

    /// Removes a watcher.
    func remove(_ w: String) async -> Bool {
        guard let c = id, let cs = secret else { return false }
        guard let a = await RelayHTTP.shared.call("DELETE", c + "/w/" + w, bearer: cs) else { return false }
        if a.status == 401 || a.status == 404 {
            forget()
            return true
        }
        guard a.status == 200 else { return false }
        locked { state.watchers.removeAll { $0.w == w } }
        save()
        return true
    }

    /// Deletes the channel on the relay and here.
    func delete() async -> Bool {
        guard let c = id else { return true }
        if let cs = secret {
            guard let a = await RelayHTTP.shared.call("DELETE", c, bearer: cs) else { return false }
            if a.status != 200 && a.status != 401 && a.status != 404 { return false }
        }
        forget()
        return true
    }

    /// The channel is gone (removed here, or unknown to the relay): forget it.
    func forget() {
        locked { state = State() }
        Keychain.set(nil, account)
        let cb = onChange
        DispatchQueue.main.async { cb?() }
    }
}

/// The alerts this device sees itself, waiting for the next batch to the relay.
enum Alerts {
    static let battery = "battery"
    static let still = "still"
    static let zone = "zone"

    private static let lock = NSLock()
    private static let key = "oz.alerts"

    static func add(_ kind: String) {
        lock.lock()
        defer { lock.unlock() }
        var now = UserDefaults.standard.stringArray(forKey: key) ?? []
        if !now.contains(kind) { now.append(kind) }
        UserDefaults.standard.set(now, forKey: key)
    }

    static var pending: [String] {
        lock.lock()
        defer { lock.unlock() }
        return UserDefaults.standard.stringArray(forKey: key) ?? []
    }

    static func sent(_ kinds: [String]) {
        lock.lock()
        defer { lock.unlock() }
        let left = (UserDefaults.standard.stringArray(forKey: key) ?? []).filter { !kinds.contains($0) }
        UserDefaults.standard.set(left, forKey: key)
    }

    static func clear() {
        lock.lock()
        defer { lock.unlock() }
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// The zone set on this device: a centre and a radius; leaving it alerts the watchers.
struct Zone: Equatable {
    var on: Bool
    var la: Int64
    var lo: Int64
    var r: Int

    static var current: Zone {
        get {
            let d = UserDefaults.standard
            return Zone(on: d.bool(forKey: "oz.zone.on"), la: Int64(d.integer(forKey: "oz.zone.la")),
                        lo: Int64(d.integer(forKey: "oz.zone.lo")), r: (d.object(forKey: "oz.zone.r") as? Int) ?? 500)
        }
        set {
            let d = UserDefaults.standard
            d.set(newValue.on, forKey: "oz.zone.on")
            d.set(Int(newValue.la), forKey: "oz.zone.la")
            d.set(Int(newValue.lo), forKey: "oz.zone.lo")
            d.set(min(max(newValue.r, 50), 50_000), forKey: "oz.zone.r")
        }
    }

    var placed: Bool { la != 0 || lo != 0 }
}

/// Standing still and leaving the zone, from the fixes (each said once until it is no longer so).
final class AlertWatch {
    static let stillSeconds: Int64 = 300
    static let stillMetres = 15.0

    private var recent: [TrackFix] = []
    private var stillAt: TrackFix?
    private var out = false
    private let zone: () -> Zone

    init(zone: @escaping () -> Zone = { Zone.current }) {
        self.zone = zone
    }

    /// The alerts this fix raises.
    func onFix(_ f: TrackFix, runStarted: Int64) -> [String] {
        guard f.ac <= 30 else { return [] }
        var raised: [String] = []
        recent.append(f)
        while let first = recent.first, f.t - first.t > AlertWatch.stillSeconds { recent.removeFirst() }
        // still: a run of five minutes at least, every fix of the last five within 15 m of the latest
        if let anchor = stillAt {
            if Geo.distance(anchor, f) > AlertWatch.stillMetres { stillAt = nil }
        } else if f.t - runStarted >= AlertWatch.stillSeconds, let first = recent.first,
                  first.t <= f.t - AlertWatch.stillSeconds + 10,
                  recent.allSatisfy({ Geo.distance($0, f) <= AlertWatch.stillMetres }) {
            stillAt = f
            raised.append(Alerts.still)
        }
        // the zone: out beyond its radius, back once 10 % inside it
        let z = zone()
        guard z.on, z.placed else {
            out = false
            return raised
        }
        let d = Geo.distance(TrackFix(t: 0, la: z.la, lo: z.lo, ac: 0), f)
        if !out && d > Double(z.r) {
            out = true
            raised.append(Alerts.zone)
        } else if out && d < Double(z.r) * 0.9 {
            out = false
        }
        return raised
    }
}

/// A batch for the relay: `{ v, run, seq, state, sealed: { <w>: <sealed> }, alerts, bat?, lp }`.
enum RelayBody {
    static func make(c: String, batch: TrackBatch, watchers: [(w: String, k: Data)], alerts: [String], battery: Int?,
                     lowPower: Bool, iv: Data? = nil) -> Data? {
        let plain = Data(TrackForm.encode(batch.fixes).utf8)
        var sealed: [String: String] = [:]
        for wt in watchers {
            let aad = Seal.batchAad(c: c, w: wt.w, run: batch.run, seq: batch.seq)
            guard let s = Seal.seal(key: wt.k, aad: aad, plain: plain, iv: iv) else { return nil }
            sealed[wt.w] = s
        }
        var d: [String: Any] = [
            "v": 1, "run": batch.run, "seq": batch.seq, "state": batch.state.rawValue,
            "sealed": sealed, "alerts": alerts, "lp": lowPower,
        ]
        if let battery { d["bat"] = battery }
        return try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys])
    }
}

/// Ozitrac's destination: sends the run to the relay (`POST /api/ozitrac/<c>/push`), each batch sealed for each watcher
/// whose key this device holds. Without a watcher it waits (the fixes kept, sent once one joins); at the end with still
/// none the run is not sent (it stays on the device).
final class RelayDestination: TrackDestination {
    /// The watchers read again during a run at most this often (a new one gets the run from its start).
    static let refreshEvery: TimeInterval = 300
    static let minRefresh: TimeInterval = 60

    private let channel: ChannelStore

    init(channel: ChannelStore = .shared) {
        self.channel = channel
    }

    func send(_ batch: TrackBatch, battery: Int?, lowPower: Bool, left: Int, done: @escaping (PushResult) -> Void) {
        let channel = self.channel
        Task {
            guard channel.exists else {
                done(.unauthorized)
                return
            }
            let since = Date().timeIntervalSince(channel.refreshedAt)
            if since > RelayDestination.refreshEvery || (channel.keyed.isEmpty && since > RelayDestination.minRefresh) {
                await channel.refresh()
            }
            guard let c = channel.id, let cs = channel.secret else {
                done(.unauthorized)
                return
            }
            let watchers = channel.keyed
            if watchers.isEmpty {
                done(.noRecipient)
                return
            }
            let alerts = Alerts.pending
            guard let body = RelayBody.make(c: c, batch: batch, watchers: watchers, alerts: alerts, battery: battery,
                                            lowPower: lowPower) else {
                done(.failed("seal"))
                return
            }
            guard let a = await RelayHTTP.shared.call("POST", c + "/push", body: body, bearer: cs) else {
                done(.failed("network"))
                return
            }
            switch a.status {
            case 200:
                Alerts.sent(alerts)
                done(.ok(ack: JSON.int(a.json?["ack"]) ?? batch.seq, next: JSON.int(a.json?["next"]), stop: false))
            case 401, 404:
                channel.forget()
                done(.unauthorized)
            case 409: done(.closed)
            case 413: done(.tooLarge)
            case 429: done(.slow(next: JSON.int(a.json?["next"])))
            default: done(.failed("HTTP \(a.status)"))
            }
        }
    }
}
