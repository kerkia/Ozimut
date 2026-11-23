import Foundation

/*
 * The people this device follows (docs/track/ozitrac.md), as Android's Follows.kt: for each, its channel, this device's
 * number and secret there, the key of the code scanned and the name the code gave (the list in the Keychain). What was
 * received of their run under way is kept in a file of its own, so that the map and the GPX survive the app being closed.
 * The names alone also go to the App Group, for the notification extension (« Tom a besoin d'aide »).
 */

struct Follow: Codable, Equatable, Identifiable {
    var c: String
    var w: String
    var ws: String
    var k: String
    var name: String
    var joined: Double
    var id: String { c }
    var key: Data? { B64.dec(k) }
}

/// The state of a person's run as last read, and its fixes.
struct FollowRun: Equatable {
    struct Alert: Codable, Equatable {
        var kind: String
        var t: Int64
    }

    var run: String
    var state: String
    var started: Int64
    var last: Int64
    var bat: Int?
    var alerts: [Alert]
    var since: Int
    var fixes: [TrackFix]
    var readAt: Double
}

final class FollowStore {
    static let shared = FollowStore()

    struct Poll {
        var run: FollowRun?
        var next: Int
        var error: String?
    }

    private struct Head: Codable {
        var run: String
        var state: String
        var started: Int64
        var last: Int64
        var bat: Int?
        var alerts: [FollowRun.Alert]
        var since: Int
        var readAt: Double
    }

    private let lock = NSLock()
    private let account = "ozitrac.follows"
    private var cache: [Follow]?

    /// Told (on the main thread) when the list changes.
    var onChange: (() -> Void)?

    private func locked<T>(_ f: () -> T) -> T {
        lock.lock()
        defer { lock.unlock() }
        return f()
    }

    var list: [Follow] {
        locked {
            if let cache { return cache }
            var out: [Follow] = []
            if let s = Keychain.get(account), let l = try? JSONDecoder().decode([Follow].self, from: Data(s.utf8)) { out = l }
            cache = out
            return out
        }
    }

    func get(_ c: String) -> Follow? { list.first { $0.c == c } }

    private func save(_ l: [Follow]) {
        locked { cache = l }
        if let d = try? JSONEncoder().encode(l) { Keychain.set(String(decoding: d, as: UTF8.self), account) }
        FollowStore.shareNames(l)
        let cb = onChange
        DispatchQueue.main.async { cb?() }
    }

    /// The names of the people followed, by channel, for the notification extension.
    static func shareNames(_ l: [Follow]) {
        let names = Dictionary(l.map { ($0.c, $0.name) }, uniquingKeysWith: { a, _ in a })
        UserDefaults(suiteName: AppConfig.group)?.set(names, forKey: "names")
    }

    static func sharedName(_ c: String) -> String? {
        (UserDefaults(suiteName: AppConfig.group)?.dictionary(forKey: "names") as? [String: String])?[c]
    }

    /// Joins a channel with a code scanned. Errors: "code" (used, expired, unknown), "gone", "many", "network".
    func join(_ link: Codes.Link, myName: String) async -> (Follow?, String?) {
        if let f = get(link.c) { return (f, nil) }
        guard let sealedName = Seal.sealText(key: link.k, aad: Seal.nameAad(c: link.c), text: myName) else { return (nil, "network") }
        guard let a = await RelayHTTP.shared.call("POST", link.c + "/join", json: ["i": link.i, "name": sealedName]) else {
            return (nil, "network")
        }
        switch a.status {
        case 200:
            guard let w = a.json?["w"] as? String, let ws = a.json?["ws"] as? String, !w.isEmpty, !ws.isEmpty else {
                return (nil, "network")
            }
            let f = Follow(c: link.c, w: w, ws: ws, k: B64.enc(link.k), name: link.name, joined: Date().timeIntervalSince1970)
            save(list.filter { $0.c != f.c } + [f])
            return (f, nil)
        case 409: return (nil, "code")
        case 404: return (nil, "gone")
        case 429: return (nil, "many")
        default: return (nil, "network")
        }
    }

    /// Gives the relay this device's notification token for one person followed.
    @discardableResult
    func registerPush(_ f: Follow, token: String, env: String) async -> Bool {
        let a = await RelayHTTP.shared.call("PUT", f.c + "/w/" + f.w + "/push",
                                             json: ["kind": "apns", "token": token, "env": env], bearer: f.ws)
        return a?.status == 200
    }

    func registerPushAll(token: String, env: String) async {
        for f in list { await registerPush(f, token: token, env: env) }
    }

    /// Stops following: the relay forgets this device, and so does the device.
    func unfollow(_ f: Follow) async -> Bool {
        guard let a = await RelayHTTP.shared.call("DELETE", f.c + "/w/" + f.w, bearer: f.ws) else { return false }
        if a.status != 200 && a.status != 401 && a.status != 404 { return false }
        forget(f.c)
        return true
    }

    func forget(_ c: String) {
        save(list.filter { $0.c != c })
        try? FileManager.default.removeItem(at: runFile(c))
        UserDefaults.standard.removeObject(forKey: "oz.follow." + c)
    }

    // MARK: what was received

    private static let dir: URL = {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Follow", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private func runFile(_ c: String) -> URL {
        FollowStore.dir.appendingPathComponent(c + ".csv")
    }

    func cached(_ c: String) -> FollowRun? {
        guard let data = UserDefaults.standard.data(forKey: "oz.follow." + c),
              let h = try? JSONDecoder().decode(Head.self, from: data) else { return nil }
        return FollowRun(run: h.run, state: h.state, started: h.started, last: h.last, bat: h.bat, alerts: h.alerts,
                         since: h.since, fixes: RunLog.read(runFile(c)), readAt: h.readAt)
    }

    /// Reads what is new of a person's run: the blobs after the last one held, opened with the code's key; a new run
    /// starts the file again. Errors: "gone" (removed, or the channel deleted: forgotten here), "network".
    func poll(_ f: Follow) async -> Poll {
        let before = cached(f.c)
        var path = f.c + "/w/" + f.w
        if let b = before, !b.run.isEmpty { path += "?run=" + b.run + "&since=" + String(b.since) }
        guard let a = await RelayHTTP.shared.call("GET", path, bearer: f.ws) else { return Poll(run: before, next: 60, error: "network") }
        if a.status == 401 || a.status == 404 {
            forget(f.c)
            return Poll(run: nil, next: 60, error: "gone")
        }
        guard a.status == 200, let j = a.json, let key = f.key else { return Poll(run: before, next: 60, error: "network") }
        let next = min(max(JSON.int(j["next"]) ?? 15, 5), 600)
        let run = (j["run"] as? String) ?? ""
        let sameRun = before?.run == run && !run.isEmpty
        var since = sameRun ? (before?.since ?? 0) : 0
        let file = runFile(f.c)
        if !sameRun { try? FileManager.default.removeItem(at: file) }
        var added: [TrackFix] = []
        for pair in (j["blobs"] as? [[Any]]) ?? [] {
            guard pair.count >= 2, let seq = JSON.int(pair[0]), let sealed = pair[1] as? String, seq > since else { continue }
            guard let plain = Seal.openText(key: key, aad: Seal.batchAad(c: f.c, w: f.w, run: run, seq: seq), sealed: sealed) else { continue }
            added += TrackForm.decode(plain)
            since = max(since, seq)
        }
        added.sort { $0.t < $1.t }
        if !added.isEmpty { RunLog.appendLines(added, to: file) }
        let alerts: [FollowRun.Alert] = ((j["alerts"] as? [[String: Any]]) ?? []).map {
            FollowRun.Alert(kind: ($0["kind"] as? String) ?? "", t: FollowStore.seconds($0["t"]))
        }
        let head = Head(run: run, state: (j["state"] as? String) ?? "", started: FollowStore.seconds(j["started"]),
                        last: FollowStore.seconds(j["last"]), bat: JSON.int(j["bat"]), alerts: alerts, since: since,
                        readAt: Date().timeIntervalSince1970)
        UserDefaults.standard.set(try? JSONEncoder().encode(head), forKey: "oz.follow." + f.c)
        return Poll(run: cached(f.c), next: next, error: nil)
    }

    /// A time the relay gives as Unix seconds, milliseconds or an ISO text -> Unix seconds (0 unknown).
    static func seconds(_ v: Any?) -> Int64 {
        if let n = v as? NSNumber {
            let x = n.int64Value
            return x > 100_000_000_000 ? x / 1000 : x
        }
        if let s = v as? String {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = f.date(from: s) { return Int64(d.timeIntervalSince1970) }
            f.formatOptions = [.withInternetDateTime]
            if let d = f.date(from: s) { return Int64(d.timeIntervalSince1970) }
            return Int64(s) ?? 0
        }
        return 0
    }
}
