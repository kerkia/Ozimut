import Foundation

/// One position, as the device protocol carries it (docs/track/design.md « Device protocol »):
/// whole seconds since 1970 (UTC) of the fix itself, millionths of a degree, accuracy and altitude in whole metres.
struct TrackFix: Equatable {
    var t: Int64
    var la: Int64
    var lo: Int64
    var ac: Int
    var al: Int?

    init(t: Int64, la: Int64, lo: Int64, ac: Int, al: Int? = nil) {
        self.t = t
        self.la = la
        self.lo = lo
        self.ac = ac
        self.al = al
    }

    init(time: Date, latitude: Double, longitude: Double, accuracy: Double, altitude: Double?) {
        t = Int64(floor(time.timeIntervalSince1970))
        la = Int64((latitude * 1_000_000).rounded())
        lo = Int64((longitude * 1_000_000).rounded())
        ac = accuracy.isFinite ? max(0, Int(accuracy.rounded())) : 0
        if let altitude, altitude.isFinite { al = Int(altitude.rounded()) } else { al = nil }
    }

    var latitude: Double { Double(la) / 1_000_000 }
    var longitude: Double { Double(lo) / 1_000_000 }
}

/// A batch's state: still running, the end of the run, or a call for help.
enum RunState: String {
    case run, end, help
}

struct TrackBatch: Equatable {
    var run: String
    var seq: Int
    var state: RunState
    var share: String
    var fixes: [TrackFix]
}

/// The settings an account gives its devices (`settings` of the pairing answer).
struct TrackSettings: Codable, Equatable {
    var fix: Int = 1
    var batch: Int = 30
    var idle: Int = 120
    var cap: Int = 9000
    var call: String? = nil
    var onlyTracker: Bool = false

    init() {}

    init(json: [String: Any]?) {
        guard let json else { return }
        fix = JSON.int(json["fix"]) ?? fix
        batch = JSON.int(json["batch"]) ?? batch
        idle = JSON.int(json["idle"]) ?? idle
        cap = JSON.int(json["cap"]) ?? cap
        if let c = json["call"] as? String, !c.isEmpty { call = c }
        onlyTracker = (json["onlyTracker"] as? Bool) ?? false
    }
}

/// The account a device is signed in to.
struct TrackAccount: Codable, Equatable {
    var id: Int
    var name: String
    var child: Bool
    var lang: String?

    init(id: Int, name: String, child: Bool, lang: String?) {
        self.id = id
        self.name = name
        self.child = child
        self.lang = lang
    }

    init?(json: [String: Any]?) {
        guard let json, let id = JSON.int(json["id"]) else { return nil }
        self.id = id
        name = (json["name"] as? String) ?? ""
        child = (json["child"] as? Bool) ?? false
        lang = json["lang"] as? String
    }
}

enum JSON {
    static func int(_ v: Any?) -> Int? {
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s) }
        return nil
    }

    static func int64(_ v: Any?) -> Int64? {
        if let n = v as? NSNumber { return n.int64Value }
        if let s = v as? String { return Int64(s) }
        return nil
    }

    static func object(_ data: Data?) -> [String: Any]? {
        guard let data, !data.isEmpty else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    /// A JSON text of any value (fragments allowed).
    static func text(_ v: Any) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed]),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "null"
    }
}

enum RandomCode {
    static let base36 = Array("0123456789abcdefghijklmnopqrstuvwxyz")
    /// The watches' claim code alphabet (design.md « Watches: claim codes »).
    static let claimAlphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")

    static func string(_ n: Int, from alphabet: [Character]) -> String {
        var out = ""
        for _ in 0..<n {
            out.append(alphabet[Int.random(in: 0..<alphabet.count)])
        }
        return out
    }

    /// 32 random bytes as base64url, without padding.
    static func key(bytes: Int = 32) -> String {
        var g = SystemRandomNumberGenerator()
        let data = Data((0..<bytes).map { _ in UInt8.random(in: 0...255, using: &g) })
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

enum RunId {
    /// `r_20261121T093512_ab12`: the UTC start time and 4 random base36 characters.
    static func make(start: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyyMMdd'T'HHmmss"
        return "r_" + f.string(from: start) + "_" + RandomCode.string(4, from: RandomCode.base36)
    }
}

enum Geo {
    /// Metres between two fixes (haversine).
    static func distance(_ a: TrackFix, _ b: TrackFix) -> Double {
        let r = 6_371_000.0
        let p1 = a.latitude * .pi / 180, p2 = b.latitude * .pi / 180
        let dp = p2 - p1
        let dl = (b.longitude - a.longitude) * .pi / 180
        let h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * asin(min(1, sqrt(h)))
    }
}

/// An Ozimut pair code (8 letters or digits; « Relier à Ozimut ») from what was scanned, typed or opened: the code itself,
/// `https://ozimut.com/t/<code>`, `ozitrac://t/<code>` (or the former `ozimut://t/<code>`, `ozimut://pair/<code>`,
/// `ozimut://<code>`).
enum PairCode {
    static func isCode(_ s: String) -> Bool {
        s.count == 8 && s.allSatisfy { allowed.contains($0) }
    }

    private static let allowed: Set<Character> = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

    static func normalise(_ s: String) -> String {
        String(s.uppercased().filter { allowed.contains($0) }.prefix(8))
    }

    static func extract(_ raw: String) -> String? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if isCode(s.uppercased()) { return s.uppercased() }
        guard let url = URL(string: s), let scheme = url.scheme?.lowercased() else { return nil }
        var parts = url.pathComponents.filter { $0 != "/" }
        let own = scheme == "ozimut" || scheme == "ozitrac"
        if own, let host = url.host, !host.isEmpty { parts.insert(host, at: 0) }
        if scheme == "https" || scheme == "http" {
            guard parts.count == 2, parts[0] == "t" else { return nil }
            let c = parts[1].uppercased()
            return isCode(c) ? c : nil
        }
        if own {
            if let last = parts.last, isCode(last.uppercased()) { return last.uppercased() }
            let opaque = s.dropFirst(scheme.count + 1).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            if isCode(opaque.uppercased()) { return opaque.uppercased() }
        }
        return nil
    }
}
