import Foundation

/// The body of `POST /api/track/push` (design.md « Sending »): in each list the first value is absolute,
/// the others differences from the previous one; `dt` starts at 0 (from `t0`).
enum BatchEncoder {
    /// More than this many fixes in one batch is refused (413): batches are cut before.
    static let maxFixes = 600

    /// `pace`: Folloz's pace of the run (`{ mode, fix, send, remote, boost, by }`, design.md « Sending »), left out when nil.
    static func dictionary(_ b: TrackBatch, battery: Int?, lowPower: Bool, left: Int, pace: [String: Any]? = nil,
                           now: Date = Date()) -> [String: Any] {
        var d: [String: Any] = [
            "v": 1,
            "run": b.run,
            "seq": b.seq,
            "state": b.state.rawValue,
            "share": b.share,
            "lp": lowPower,
            "left": max(0, left),
        ]
        if let battery { d["bat"] = battery }
        if let pace { d["pace"] = pace }
        let t0 = b.fixes.first?.t ?? Int64(floor(now.timeIntervalSince1970))
        var dt: [Int64] = [], la: [Int64] = [], lo: [Int64] = [], ac: [Int] = [], al: [Int] = []
        dt.reserveCapacity(b.fixes.count)
        la.reserveCapacity(b.fixes.count)
        lo.reserveCapacity(b.fixes.count)
        ac.reserveCapacity(b.fixes.count)
        let withAltitude = b.fixes.contains { $0.al != nil }
        var pt = t0, pla: Int64 = 0, plo: Int64 = 0, pal = 0
        for (i, f) in b.fixes.enumerated() {
            dt.append(f.t - pt)
            pt = f.t
            if i == 0 {
                la.append(f.la)
                lo.append(f.lo)
            } else {
                la.append(f.la - pla)
                lo.append(f.lo - plo)
            }
            pla = f.la
            plo = f.lo
            ac.append(f.ac)
            if withAltitude {
                let a = f.al ?? pal
                al.append(i == 0 ? a : a - pal)
                pal = a
            }
        }
        d["t0"] = t0
        d["dt"] = dt
        d["la"] = la
        d["lo"] = lo
        d["ac"] = ac
        if withAltitude { d["al"] = al }
        return d
    }

    static func encode(_ b: TrackBatch, battery: Int?, lowPower: Bool, left: Int, pace: [String: Any]? = nil,
                       now: Date = Date()) throws -> Data {
        try JSONSerialization.data(withJSONObject: dictionary(b, battery: battery, lowPower: lowPower, left: left, pace: pace,
                                                              now: now),
                                   options: [.sortedKeys])
    }

    /// The fixes a body holds (the server's reading; used by the tests).
    static func decode(_ d: [String: Any]) -> [TrackFix] {
        guard let t0 = JSON.int64(d["t0"]),
              let dt = d["dt"] as? [Any], let la = d["la"] as? [Any], let lo = d["lo"] as? [Any] else { return [] }
        let ac = (d["ac"] as? [Any]) ?? []
        let al = d["al"] as? [Any]
        var out: [TrackFix] = []
        var t = t0, a: Int64 = 0, o: Int64 = 0, h = 0
        for i in 0..<min(dt.count, la.count, lo.count) {
            t += JSON.int64(dt[i]) ?? 0
            a = i == 0 ? (JSON.int64(la[i]) ?? 0) : a + (JSON.int64(la[i]) ?? 0)
            o = i == 0 ? (JSON.int64(lo[i]) ?? 0) : o + (JSON.int64(lo[i]) ?? 0)
            var alt: Int? = nil
            if let al, i < al.count {
                h = i == 0 ? (JSON.int(al[i]) ?? 0) : h + (JSON.int(al[i]) ?? 0)
                alt = h
            }
            out.append(TrackFix(t: t, la: a, lo: o, ac: i < ac.count ? (JSON.int(ac[i]) ?? 0) : 0, al: alt))
        }
        return out
    }

    /// Cuts a list of fixes into batches of at most `maxFixes`.
    static func chunks(_ fixes: [TrackFix], size: Int = maxFixes) -> [[TrackFix]] {
        guard !fixes.isEmpty else { return [] }
        return stride(from: 0, to: fixes.count, by: size).map { Array(fixes[$0..<min($0 + size, fixes.count)]) }
    }
}
