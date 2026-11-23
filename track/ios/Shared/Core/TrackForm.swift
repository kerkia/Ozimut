import CryptoKit
import Foundation
import Security

/*
 * Ozitrac's pure parts (docs/track/ozitrac.md), as Android's TrackForm.kt: random numbers and keys, base64url, the
 * sealing of a batch for one watcher (AES-256-GCM, CryptoKit), the batch's delta form, the code a watcher scans, a GPX
 * file, the length of a run. Compiled into the iPhone app, the watch app and the tests.
 */

/// Cryptographically secure random bytes (the system's generator).
enum Rand {
    static func bytes(_ n: Int) -> Data {
        var d = Data(count: n)
        let ok = d.withUnsafeMutableBytes { buf -> Bool in
            guard let p = buf.baseAddress else { return false }
            return SecRandomCopyBytes(kSecRandomDefault, n, p) == errSecSuccess
        }
        if ok { return d }
        var g = SystemRandomNumberGenerator()
        return Data((0..<n).map { _ in UInt8.random(in: 0...255, using: &g) })
    }
}

/// base64url without padding, both ways.
enum B64 {
    static func enc(_ d: Data) -> String {
        d.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func dec(_ s: String) -> Data? {
        var t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        while t.hasSuffix("=") { t.removeLast() }
        let allowed = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        guard t.allSatisfy({ allowed.contains($0) }) else { return nil }
        if t.count % 4 == 1 { return nil }
        t = t.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        t += String(repeating: "=", count: (4 - t.count % 4) % 4)
        return Data(base64Encoded: t)
    }
}

/// AES-256-GCM: base64url( 12-byte IV ‖ ciphertext ‖ 16-byte tag ), the additional data the UTF-8 bytes of `aad`.
enum Seal {
    static func iv() -> Data { Rand.bytes(12) }

    static func seal(key: Data, aad: String, plain: Data, iv: Data? = nil) -> String? {
        guard key.count == 32 else { return nil }
        do {
            let nonce = try AES.GCM.Nonce(data: iv ?? Seal.iv())
            let box = try AES.GCM.seal(plain, using: SymmetricKey(data: key), nonce: nonce, authenticating: Data(aad.utf8))
            guard let combined = box.combined else { return nil }
            return B64.enc(combined)
        } catch {
            return nil
        }
    }

    static func sealText(key: Data, aad: String, text: String) -> String? {
        seal(key: key, aad: aad, plain: Data(text.utf8))
    }

    /// The plaintext, or nil when the key, the additional data or the bytes are not the right ones.
    static func open(key: Data, aad: String, sealed: String) -> Data? {
        guard key.count == 32, let b = B64.dec(sealed), b.count >= 12 + 16 else { return nil }
        do {
            let box = try AES.GCM.SealedBox(combined: b)
            return try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: Data(aad.utf8))
        } catch {
            return nil
        }
    }

    static func openText(key: Data, aad: String, sealed: String) -> String? {
        open(key: key, aad: aad, sealed: sealed).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// The additional data of a batch, and of a watcher's name (sealed before the relay gives the watcher its number).
    static func batchAad(c: String, w: String, run: String, seq: Int) -> String { "\(c)|\(w)|\(run)|\(seq)" }
    static func nameAad(c: String) -> String { "\(c)|name" }
}

/// Ozimut's batch form: `{ t0, dt, la, lo, ac, al? }`, `dt` `la` `lo` `al` the first value absolute then differences,
/// `ac` plain; `al` only when every fix has one.
enum TrackForm {
    static func encode(_ f: [TrackFix]) -> String {
        var s = "{\"t0\":\(f.first?.t ?? 0)"
        func list(_ k: String, _ value: (Int) -> Int64) {
            s += ",\"\(k)\":["
            for i in 0..<f.count {
                if i > 0 { s += "," }
                s += String(value(i))
            }
            s += "]"
        }
        list("dt") { i in i == 0 ? 0 : f[i].t - f[i - 1].t }
        list("la") { i in i == 0 ? f[0].la : f[i].la - f[i - 1].la }
        list("lo") { i in i == 0 ? f[0].lo : f[i].lo - f[i - 1].lo }
        list("ac") { i in Int64(f[i].ac) }
        if !f.isEmpty && f.allSatisfy({ $0.al != nil }) {
            list("al") { i in i == 0 ? Int64(f[0].al!) : Int64(f[i].al! - f[i - 1].al!) }
        }
        return s + "}"
    }

    /// The fixes of a batch's plaintext; an empty list when it cannot be read.
    static func decode(_ s: String) -> [TrackFix] {
        guard let d = JSON.object(Data(s.utf8)), let t0 = JSON.int64(d["t0"]),
              let dt = nums(d["dt"]), let la = nums(d["la"]), let lo = nums(d["lo"]) else { return [] }
        let ac = nums(d["ac"]) ?? []
        let al = nums(d["al"])
        let n = min(dt.count, la.count, lo.count)
        var out: [TrackFix] = []
        out.reserveCapacity(n)
        var t = t0, a: Int64 = 0, o: Int64 = 0, h: Int64 = 0
        for i in 0..<n {
            if i == 0 {
                a = la[0]
                o = lo[0]
                h = al?.first ?? 0
            } else {
                t += dt[i]
                a += la[i]
                o += lo[i]
                if let al, i < al.count { h += al[i] }
            }
            let alt: Int? = (al != nil && i < al!.count) ? Int(h) : nil
            out.append(TrackFix(t: t, la: a, lo: o, ac: i < ac.count ? Int(ac[i]) : 0, al: alt))
        }
        return out
    }

    private static func nums(_ v: Any?) -> [Int64]? {
        guard let a = v as? [Any] else { return nil }
        return a.map { JSON.int64($0) ?? 0 }
    }
}

/// The numbers, secrets and the code a watcher scans: `https://ozimut.com/z/<c>#<i>.<k>.<name>`.
enum Codes {
    static let alpha = Array("abcdefghijklmnopqrstuvwxyz234567")

    static func random(_ n: Int) -> String {
        String(Rand.bytes(n).map { alpha[Int($0 & 31)] })
    }

    static func key() -> Data { Rand.bytes(32) }

    struct Link: Equatable {
        var c: String
        var i: String
        var k: Data
        var name: String
    }

    static func link(base: String, c: String, i: String, k: Data, name: String) -> String {
        var b = base
        while b.hasSuffix("/") { b.removeLast() }
        return b + "/z/" + c + "#" + i + "." + B64.enc(k) + "." + B64.enc(Data(name.utf8))
    }

    private static func isId(_ s: String) -> Bool {
        s.count == 16 && s.allSatisfy { alpha.contains($0) }
    }

    /// A code read from a link or a QR code (`https://…/z/<c>#…` or `ozitrac://z/<c>#…`); nil when it is not one.
    static func parse(_ raw: String?) -> Link? {
        guard let raw else { return nil }
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let hash = s.firstIndex(of: "#") else { return nil }
        var path = String(s[..<hash])
        if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
        while path.hasSuffix("/") { path.removeLast() }
        guard let zi = path.range(of: "/z/", options: .backwards) else { return nil }
        let c = String(path[zi.upperBound...]).lowercased()
        guard isId(c) else { return nil }
        let parts = s[s.index(after: hash)...].split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 3 else { return nil }
        let i = parts[0].lowercased()
        guard isId(i), let k = B64.dec(parts[1]), k.count == 32 else { return nil }
        let name = B64.dec(parts[2]).map { String(decoding: $0, as: UTF8.self) } ?? ""
        return Link(c: c, i: i, k: k, name: String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60)))
    }
}

/// A run as a GPX 1.1 file.
enum Gpx {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()

    static func time(_ t: Int64) -> String {
        iso.string(from: Date(timeIntervalSince1970: TimeInterval(t)))
    }

    static func write(name: String, fixes: [TrackFix]) -> String {
        var s = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        s += "<gpx version=\"1.1\" creator=\"Ozitrac\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n"
        s += "<metadata><name>" + esc(name) + "</name>"
        if let f = fixes.first { s += "<time>" + time(f.t) + "</time>" }
        s += "</metadata>\n<trk><name>" + esc(name) + "</name><trkseg>\n"
        for f in fixes {
            s += "<trkpt lat=\"" + deg(f.la) + "\" lon=\"" + deg(f.lo) + "\">"
            if let al = f.al { s += "<ele>\(al)</ele>" }
            s += "<time>" + time(f.t) + "</time></trkpt>\n"
        }
        s += "</trkseg></trk>\n</gpx>\n"
        return s
    }

    /// Millionths of a degree written with six decimals, whatever the device's locale.
    static func deg(_ v: Int64) -> String {
        let neg = v < 0
        let a = neg ? -v : v
        let frac = String(a % 1_000_000)
        return (neg ? "-" : "") + String(a / 1_000_000) + "." + String(repeating: "0", count: 6 - frac.count) + frac
    }

    private static func esc(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    }
}

extension Geo {
    /// The distance run over fixes good enough to count (accuracy within `maxAcc` metres).
    static func length(_ fixes: [TrackFix], maxAcc: Int = 30) -> Double {
        var d = 0.0
        var p: TrackFix?
        for f in fixes where f.ac <= maxAcc {
            if let p { d += distance(p, f) }
            p = f
        }
        return d
    }
}
