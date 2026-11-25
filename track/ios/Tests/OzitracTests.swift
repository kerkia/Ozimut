import CoreImage
import UIKit
import XCTest

/// Ozitrac's pure parts (docs/track/ozitrac.md), as Android's TrackFormTest: sealing — against a vector made with
/// WebCrypto, so that the relay's readers, Android and the iPhone provably agree —, the batch's delta form, the code link,
/// the GPX file, the relay's batch body, the alerts seen on the device, the runs kept, the QR codes.
final class SealTests: XCTestCase {
    private let key = Data((0..<32).map { UInt8(($0 * 7 + 3) & 255) })
    private let iv = Data((0..<12).map { UInt8($0 + 1) })

    /// Made with Node's WebCrypto (AES-GCM, 128-bit tag) from the same key, IV, additional data and plaintext.
    static let vectorBatch = "AQIDBAUGBwgJCgsMKwAOwgQ8OsM-yW_YKD0AW4hL3rz9Pf9Y"
    static let vectorName = "AQIDBAUGBwgJCgsMk6sWneWpeNtJ86F2PYpA9dV4UcqEysCZ"

    func testSealsAsWebCryptoDoes() {
        let aad = Seal.batchAad(c: "abcdefghijklmnop", w: "w2345678", run: "r_20261123T101500_ab12", seq: 3)
        XCTAssertEqual(aad, "abcdefghijklmnop|w2345678|r_20261123T101500_ab12|3")
        let plain = Data("{\"t0\":1}".utf8)
        let sealed = Seal.seal(key: key, aad: aad, plain: plain, iv: iv)
        XCTAssertEqual(sealed, SealTests.vectorBatch)
        XCTAssertEqual(B64.dec(sealed!)?.count, 12 + plain.count + 16)
        XCTAssertFalse(sealed!.contains { $0 == "=" || $0 == "+" || $0 == "/" })
        XCTAssertEqual(Seal.open(key: key, aad: aad, sealed: SealTests.vectorBatch), plain)
        XCTAssertEqual(B64.enc(key), "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw")
    }

    func testANameIsSealedWithTheChannelOnly() {
        XCTAssertEqual(Seal.nameAad(c: "abcdefghijklmnop"), "abcdefghijklmnop|name")
        XCTAssertEqual(Seal.seal(key: key, aad: "abcdefghijklmnop|name", plain: Data("Éloïse".utf8), iv: iv), SealTests.vectorName)
        XCTAssertEqual(Seal.openText(key: key, aad: "abcdefghijklmnop|name", sealed: SealTests.vectorName), "Éloïse")
        let random = Seal.sealText(key: key, aad: "abcdefghijklmnop|name", text: "Zoé")!
        XCTAssertEqual(Seal.openText(key: key, aad: "abcdefghijklmnop|name", sealed: random), "Zoé")
    }

    func testASealOpensOnlyWithItsKeyAndData() {
        let aad = Seal.batchAad(c: "abcdefghijklmnop", w: "w2345678", run: "r1", seq: 1)
        let sealed = Seal.seal(key: key, aad: aad, plain: Data([1, 2, 3]), iv: iv)!
        XCTAssertNil(Seal.open(key: key, aad: Seal.batchAad(c: "abcdefghijklmnop", w: "w2345678", run: "r1", seq: 2), sealed: sealed))
        XCTAssertNil(Seal.open(key: Data(count: 32), aad: aad, sealed: sealed))
        var bytes = B64.dec(sealed)!
        bytes[14] ^= 1
        XCTAssertNil(Seal.open(key: key, aad: aad, sealed: B64.enc(bytes)))
        XCTAssertNil(Seal.open(key: key, aad: aad, sealed: "not base64 !"))
        XCTAssertNil(Seal.open(key: key, aad: aad, sealed: "AAAA"))
        XCTAssertNil(Seal.seal(key: Data(count: 16), aad: aad, plain: Data()))
    }
}

final class TrackFormTests: XCTestCase {
    func testTheDeltaFormRoundTrips() {
        let fixes = [
            TrackFix(t: 1_763_892_000, la: 48_312_345, lo: -1_234_567, ac: 5, al: 120),
            TrackFix(t: 1_763_892_001, la: 48_312_350, lo: -1_234_560, ac: 4, al: 121),
            TrackFix(t: 1_763_892_003, la: 48_312_340, lo: -1_234_590, ac: 12, al: 119),
        ]
        let s = TrackForm.encode(fixes)
        XCTAssertEqual(s, "{\"t0\":1763892000,\"dt\":[0,1,2],\"la\":[48312345,5,-10],\"lo\":[-1234567,7,-30],\"ac\":[5,4,12],\"al\":[120,1,-2]}")
        XCTAssertEqual(TrackForm.decode(s), fixes)
    }

    func testABatchWithoutAltitudeLeavesItOut() {
        let s = TrackForm.encode([TrackFix(t: 100, la: 1, lo: 2, ac: 3, al: 10), TrackFix(t: 101, la: 4, lo: 5, ac: 6, al: nil)])
        XCTAssertFalse(s.contains("al"))
        XCTAssertEqual(TrackForm.decode(s), [TrackFix(t: 100, la: 1, lo: 2, ac: 3), TrackFix(t: 101, la: 4, lo: 5, ac: 6)])
        XCTAssertEqual(TrackForm.decode("{}"), [])
        XCTAssertEqual(TrackForm.decode(TrackForm.encode([])), [])
        XCTAssertEqual(TrackForm.encode([]), "{\"t0\":0,\"dt\":[],\"la\":[],\"lo\":[],\"ac\":[]}")
    }

    func testTheCodeLinkRoundTrips() {
        let k = Data((0..<32).map { UInt8($0) })
        let link = Codes.link(base: "https://ozimut.com/", c: "abcdefghijklmn23", i: "qrstuvwxyz234567", k: k, name: "Zoé")
        XCTAssertTrue(link.hasPrefix("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567."))
        let l = Codes.parse(link)
        XCTAssertEqual(l?.c, "abcdefghijklmn23")
        XCTAssertEqual(l?.i, "qrstuvwxyz234567")
        XCTAssertEqual(l?.k, k)
        XCTAssertEqual(l?.name, "Zoé")
        // the key travels as 43 base64url characters
        XCTAssertEqual(link.split(separator: "#")[1].split(separator: ".")[1].count, 43)
    }

    func testACodeIsReadOnlyWhenWhole() {
        let k = B64.enc(Data(count: 32))
        XCTAssertNotNil(Codes.parse("  https://ozimut.com/z/abcdefghijklmn23/#qrstuvwxyz234567.\(k).  "))
        XCTAssertNotNil(Codes.parse("ozitrac://z/abcdefghijklmn23#qrstuvwxyz234567.\(k).Wm9l"))
        XCTAssertNil(Codes.parse(nil))
        XCTAssertNil(Codes.parse("https://ozimut.com/z/abcdefghijklmn23"))
        XCTAssertNil(Codes.parse("https://ozimut.com/t/K7QM4TXD"))
        XCTAssertNil(Codes.parse("https://ozimut.com/z/short#qrstuvwxyz234567.\(k).Wm9l"))
        XCTAssertNil(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#short.\(k).Wm9l"))
        XCTAssertNil(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567.AAAA.Wm9l"))
        XCTAssertNil(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567.\(k)"))
        // a pair code is no Ozitrac code, and the other way round
        XCTAssertNil(PairCode.extract("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567.\(k).Wm9l"))
        XCTAssertEqual(PairCode.extract("ozitrac://t/K7QM4TXD"), "K7QM4TXD")
    }

    func testRandomCodesUseTheAlphabet() {
        let c = Codes.random(16)
        XCTAssertEqual(c.count, 16)
        XCTAssertTrue(c.allSatisfy { Codes.alpha.contains($0) })
        XCTAssertEqual(Codes.key().count, 32)
        XCTAssertNotEqual(Codes.random(16), Codes.random(16))
    }

    func testAGpxFileHoldsEveryFix() {
        let g = Gpx.write(name: "Zoé <run> & co", fixes: [TrackFix(t: 1_763_892_000, la: 48_312_345, lo: -1_234_567, ac: 5, al: 120),
                                                          TrackFix(t: 1_763_892_001, la: 48_312_350, lo: -1_234_560, ac: 4)])
        XCTAssertTrue(g.hasPrefix("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"))
        XCTAssertTrue(g.contains("<name>Zoé &lt;run&gt; &amp; co</name>"))
        XCTAssertTrue(g.contains("<trkpt lat=\"48.312345\" lon=\"-1.234567\"><ele>120</ele><time>2025-11-23T10:00:00Z</time></trkpt>"))
        XCTAssertTrue(g.contains("<trkpt lat=\"48.312350\" lon=\"-1.234560\"><time>2025-11-23T10:00:01Z</time></trkpt>"))
        XCTAssertEqual(g.components(separatedBy: "<trkpt ").count - 1, 2)
        XCTAssertEqual(Gpx.deg(-5), "-0.000005")
    }

    func testARunsLengthCountsGoodFixesOnly() {
        // 0.001° of latitude is about 111 m
        let fixes = [TrackFix(t: 0, la: 48_000_000, lo: 0, ac: 5), TrackFix(t: 1, la: 48_001_000, lo: 0, ac: 5),
                     TrackFix(t: 2, la: 48_050_000, lo: 0, ac: 200), TrackFix(t: 3, la: 48_002_000, lo: 0, ac: 5)]
        XCTAssertEqual(Geo.length(fixes), 222.4, accuracy: 0.5)
    }
}

final class RelayTests: XCTestCase {
    func testABatchIsSealedForEachWatcher() throws {
        let k1 = Data((0..<32).map { UInt8($0) }), k2 = Data((0..<32).map { UInt8(255 - $0) })
        let fixes = [TrackFix(t: 1_763_892_000, la: 48_312_345, lo: -1_234_567, ac: 5, al: 120)]
        let b = TrackBatch(run: "r_20261123T101500_ab12", seq: 4, state: .help, share: "watchers", fixes: fixes)
        let body = try XCTUnwrap(RelayBody.make(c: "abcdefghijklmnop", batch: b, watchers: [(w: "w2345678", k: k1), (w: "w3456789", k: k2)],
                                                alerts: ["zone"], battery: 42, lowPower: true))
        let d = try XCTUnwrap(JSON.object(body))
        XCTAssertEqual(d["v"] as? Int, 1)
        XCTAssertEqual(d["run"] as? String, "r_20261123T101500_ab12")
        XCTAssertEqual(d["seq"] as? Int, 4)
        XCTAssertEqual(d["state"] as? String, "help")
        XCTAssertEqual(d["alerts"] as? [String], ["zone"])
        XCTAssertEqual(d["bat"] as? Int, 42)
        XCTAssertEqual(d["lp"] as? Bool, true)
        let sealed = try XCTUnwrap(d["sealed"] as? [String: String])
        XCTAssertEqual(Set(sealed.keys), ["w2345678", "w3456789"])
        // each watcher opens its own with its key and its own additional data, and only its own
        let a1 = Seal.batchAad(c: "abcdefghijklmnop", w: "w2345678", run: b.run, seq: 4)
        let a2 = Seal.batchAad(c: "abcdefghijklmnop", w: "w3456789", run: b.run, seq: 4)
        XCTAssertEqual(TrackForm.decode(Seal.openText(key: k1, aad: a1, sealed: sealed["w2345678"]!)!), fixes)
        XCTAssertEqual(TrackForm.decode(Seal.openText(key: k2, aad: a2, sealed: sealed["w3456789"]!)!), fixes)
        XCTAssertNil(Seal.open(key: k1, aad: a1, sealed: sealed["w3456789"]!))
        XCTAssertNil(Seal.open(key: k2, aad: a1, sealed: sealed["w3456789"]!))
    }

    func testStillAndZoneAreSaidOnce() {
        let w = AlertWatch(zone: { Zone(on: true, la: 48_000_000, lo: 2_000_000, r: 100) })
        var said: [String] = []
        // five minutes and more on the same spot, inside the zone
        for i in 0...320 { said += w.onFix(TrackFix(t: 1000 + Int64(i), la: 48_000_000, lo: 2_000_000, ac: 5), runStarted: 1000) }
        XCTAssertEqual(said, [Alerts.still])
        // off the spot (still again) and out of the zone (0.002° of latitude is about 222 m)
        said = w.onFix(TrackFix(t: 1400, la: 48_002_000, lo: 2_000_000, ac: 5), runStarted: 1000)
        XCTAssertEqual(said, [Alerts.zone])
        XCTAssertEqual(w.onFix(TrackFix(t: 1401, la: 48_002_100, lo: 2_000_000, ac: 5), runStarted: 1000), [])
        // a bad fix is not looked at
        XCTAssertEqual(w.onFix(TrackFix(t: 1402, la: 49_000_000, lo: 2_000_000, ac: 80), runStarted: 1000), [])
        // back inside, out again: said again
        _ = w.onFix(TrackFix(t: 1403, la: 48_000_100, lo: 2_000_000, ac: 5), runStarted: 1000)
        XCTAssertEqual(w.onFix(TrackFix(t: 1404, la: 48_002_000, lo: 2_000_000, ac: 5), runStarted: 1000), [Alerts.zone])
    }

    func testTimesFromTheRelay() {
        XCTAssertEqual(FollowStore.seconds(1_763_892_000), 1_763_892_000)
        XCTAssertEqual(FollowStore.seconds(1_763_892_000_123), 1_763_892_000)
        XCTAssertEqual(FollowStore.seconds("2025-11-23T10:00:00.000Z"), 1_763_892_000)
        XCTAssertEqual(FollowStore.seconds("2025-11-23T10:00:00Z"), 1_763_892_000)
        XCTAssertEqual(FollowStore.seconds(nil), 0)
    }
}

/// The relay's engine waits while nobody follows, sends once someone does, and gives the run up at its end if nobody
/// ever followed.
final class RelayEngineTests: XCTestCase {
    private final class FakeRelay: TrackDestination {
        var watchers = false
        var sent: [TrackBatch] = []
        func send(_ batch: TrackBatch, battery: Int?, lowPower: Bool, left: Int, done: @escaping (PushResult) -> Void) {
            DispatchQueue.global().async {
                if !self.watchers {
                    done(.noRecipient)
                    return
                }
                self.sent.append(batch)
                done(.ok(ack: batch.seq, next: 15, stop: false))
            }
        }
    }

    private final class Recorder: TrackEngineDelegate {
        var ended: XCTestExpectation?
        var reason: EndReason?
        func trackChanged(_ status: TrackStatus) {}
        func trackEnded(_ status: TrackStatus, reason: EndReason) {
            self.reason = reason
            ended?.fulfill()
        }
        func trackDeviceRemoved() {}
    }

    private func engine(_ d: TrackDestination) -> TrackEngine {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        return TrackEngine(directory: dir, file: "relay.sqlite", destination: d, monitorNetwork: false)
    }

    func testNobodyFollowsThenSomeoneDoes() {
        let relay = FakeRelay()
        let e = engine(relay)
        let rec = Recorder()
        rec.ended = expectation(description: "ended")
        e.delegate = rec
        e.start(run: "r_20261123T101500_ab12", share: "watchers", now: Date(timeIntervalSince1970: 1_763_892_000))
        for i in 0..<10 { e.add(TrackFix(t: 1_763_892_000 + Int64(i), la: 48_000_000 + Int64(i), lo: 2_000_000, ac: 5)) }
        e.help()
        // the help batch found nobody: the fixes are kept
        Thread.sleep(forTimeInterval: 0.5)
        XCTAssertEqual(e.snapshot().pending, 10)
        relay.watchers = true
        e.stop()
        wait(for: [rec.ended!], timeout: 10)
        XCTAssertEqual(rec.reason, .user)
        XCTAssertEqual(relay.sent.flatMap(\.fixes).count, 10)
        XCTAssertEqual(relay.sent.last?.state, .end)
    }

    func testARunNobodyFollowedEndsUnsent() {
        let relay = FakeRelay()
        let e = engine(relay)
        let rec = Recorder()
        rec.ended = expectation(description: "ended")
        e.delegate = rec
        e.start(run: "r1", share: "watchers")
        e.add(TrackFix(t: 1_763_892_000, la: 48_000_000, lo: 2_000_000, ac: 5))
        e.stop()
        wait(for: [rec.ended!], timeout: 10)
        XCTAssertEqual(rec.reason, .nobody)
        XCTAssertTrue(relay.sent.isEmpty)
        XCTAssertEqual(e.snapshot().phase, .idle)
    }
}

final class RunLogTests: XCTestCase {
    func testARunIsKeptAndRead() {
        let run = "r_20261123T101500_" + Codes.random(4)
        defer { RunLog.delete(run) }
        let fixes = [TrackFix(t: 1_763_892_000, la: 48_312_345, lo: -1_234_567, ac: 5, al: 120),
                     TrackFix(t: 1_763_892_001, la: 48_312_350, lo: -1_234_560, ac: 4)]
        for f in fixes { RunLog.append(run: run, fix: f) }
        XCTAssertEqual(RunLog.read(RunLog.url(run)), fixes)
        let info = RunLog.runs().first { $0.run == run }
        XCTAssertEqual(info?.points, 2)
        XCTAssertEqual(info?.fromWatch, false)
    }

    func testARunFromTheWatchIsMarked() throws {
        let run = "r_20261123T111500_" + Codes.random(4)
        defer { RunLog.delete(run) }
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".csv")
        try Data(RunLog.line(TrackFix(t: 1_763_895_600, la: 1, lo: 2, ac: 3)).utf8).write(to: tmp)
        XCTAssertTrue(RunLog.importWatch(file: tmp, run: run))
        XCTAssertEqual(RunLog.runs().first { $0.run == run }?.fromWatch, true)
        RunLog.delete(run)
        XCTAssertNil(RunLog.runs().first { $0.run == run })
    }
}

/// The QR codes drawn without CoreImage (the watch has none): read back by CoreImage's own detector.
final class QRCodeTests: XCTestCase {
    private func image(_ q: QRCode, scale: Int = 6) -> CIImage {
        let n = (q.size + 8) * scale
        let r = UIGraphicsImageRenderer(size: CGSize(width: n, height: n), format: {
            let f = UIGraphicsImageRendererFormat()
            f.scale = 1
            return f
        }())
        let img = r.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
            UIColor.black.setFill()
            for y in 0..<q.size {
                for x in 0..<q.size where q.isDark(x, y) {
                    ctx.fill(CGRect(x: (x + 4) * scale, y: (y + 4) * scale, width: scale, height: scale))
                }
            }
        }
        return CIImage(image: img)!
    }

    private func read(_ ci: CIImage) -> String? {
        let d = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])
        return (d?.features(in: ci).first as? CIQRCodeFeature)?.messageString
    }

    func testSizes() {
        XCTAssertEqual(QRCode.encode("HELLO")?.size, 21)
        let link = Codes.link(base: "https://ozimut.com/", c: Codes.random(16), i: Codes.random(16), k: Codes.key(), name: "Zoé")
        let q = QRCode.encode(link)!
        XCTAssertEqual(q.size, q.version * 4 + 17)
        XCTAssertLessThanOrEqual(q.version, 10)
        // the three finders' dark corners
        XCTAssertTrue(q.isDark(0, 0) && q.isDark(q.size - 1, 0) && q.isDark(0, q.size - 1))
        XCTAssertFalse(q.isDark(7, 7))
    }

    func testCoreImageReadsThem() throws {
        // CoreImage's own code first: if its detector reads nothing here, this environment cannot judge
        let control = CIFilter(name: "CIQRCodeGenerator", parameters: ["inputMessage": Data("control".utf8), "inputCorrectionLevel": "M"])!
            .outputImage!.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let ctx = CIContext()
        let cg = ctx.createCGImage(control.padded(by: 40), from: control.padded(by: 40).extent)!
        guard read(CIImage(cgImage: cg)) == "control" else { throw XCTSkip("no QR detector in this simulator") }
        let texts = [
            "HELLO WORLD",
            Codes.link(base: "https://ozimut.com/", c: Codes.random(16), i: Codes.random(16), k: Codes.key(), name: "Éloïse-Marie"),
            String(repeating: "Ozitrac ", count: 30),
        ]
        for t in texts {
            for mask in [nil, 0, 3, 5, 7] as [Int?] {
                let q = QRCode.encode(bytes: Array(t.utf8), mask: mask)!
                XCTAssertEqual(read(image(q)), t, "mask \(String(describing: mask)), version \(q.version)")
            }
        }
    }
}

private extension CIImage {
    func padded(by p: CGFloat) -> CIImage {
        let white = CIImage(color: .white).cropped(to: extent.insetBy(dx: -p, dy: -p))
        return composited(over: white)
    }
}

/// The pace of a run (docs/track/ozitrac.md « Pace »): Direct or a long run, a watcher's request for Direct applied once,
/// refused when not allowed or on a low battery, over by itself; the batch's `pace`; the watcher's reading of it.
final class PaceTests: XCTestCase {
    private let long = PaceChoice(long: true, fix: 30, send: 600, remote: true)

    func testThePaceOfABatch() {
        let direct = PaceState(choice: .direct).json(now: 1000, liveSend: 15)
        XCTAssertEqual(direct["mode"] as? String, "live")
        XCTAssertEqual(direct["fix"] as? Int, 1)
        XCTAssertEqual(direct["send"] as? Int, 15)
        XCTAssertEqual(direct["remote"] as? Bool, false)
        XCTAssertEqual(JSON.int64(direct["boost"]), 0)
        XCTAssertEqual(direct["by"] as? String, "")

        var p = PaceState(choice: long)
        var j = p.json(now: 1000, liveSend: 15)
        XCTAssertEqual(j["mode"] as? String, "long")
        XCTAssertEqual(j["fix"] as? Int, 30)
        XCTAssertEqual(j["send"] as? Int, 600)
        XCTAssertEqual(j["remote"] as? Bool, true)
        XCTAssertEqual(JSON.int64(j["boost"]), 0)

        XCTAssertEqual(p.apply(Boost(until: 1900, at: 1000, by: "w2345678"), battery: 80, now: 1000), .applied)
        j = p.json(now: 1100, liveSend: 15)
        XCTAssertEqual(j["mode"] as? String, "long")
        XCTAssertEqual(j["fix"] as? Int, 30)
        XCTAssertEqual(JSON.int64(j["boost"]), 1900)
        XCTAssertEqual(j["by"] as? String, "w2345678")
        // once over, the batch says so even before the coordinator's tick
        XCTAssertEqual(JSON.int64(p.json(now: 1900, liveSend: 15)["boost"]), 0)
        XCTAssertEqual(p.json(now: 1900, liveSend: 15)["by"] as? String, "")
        // as JSON, the relay reads plain numbers
        let text = String(decoding: try! JSONSerialization.data(withJSONObject: p.json(now: 1100, liveSend: 15), options: [.sortedKeys]),
                          as: UTF8.self)
        XCTAssertEqual(text, "{\"boost\":1900,\"by\":\"w2345678\",\"fix\":30,\"mode\":\"long\",\"remote\":true,\"send\":600}")
    }

    func testFixesAndBatchesByPace() {
        let d = PaceState(choice: .direct)
        XCTAssertEqual(d.fixEvery(now: 0), 1)
        XCTAssertNil(d.sendEvery(now: 0))
        XCTAssertEqual(d.stillSeconds, 300)
        var p = PaceState(choice: long)
        XCTAssertEqual(p.fixEvery(now: 0), 30)
        XCTAssertEqual(p.sendEvery(now: 0), 600)
        XCTAssertEqual(p.stillSeconds, 1800)
        XCTAssertFalse(p.live(now: 0))
        _ = p.apply(Boost(until: 600, at: 0, by: "w"), battery: nil, now: 0)
        XCTAssertTrue(p.live(now: 599))
        XCTAssertEqual(p.fixEvery(now: 599), 1)
        XCTAssertEqual(p.sendEvery(now: 599), 15)
        XCTAssertEqual(p.fixEvery(now: 600), 30)
        XCTAssertEqual(p.sendEvery(now: 600), 600)
    }

    func testARequestIsLookedAtOnce() {
        var p = PaceState(choice: long)
        let b = Boost(until: 1300, at: 1000, by: "w1")
        XCTAssertEqual(p.apply(b, battery: 50, now: 1000), .applied)
        // every answer carries the relay's last request: the same one is not applied again
        XCTAssertEqual(p.apply(b, battery: 50, now: 1010), .seen)
        XCTAssertEqual(p.apply(Boost(until: 2000, at: 990, by: "w2"), battery: 50, now: 1010), .seen)
        XCTAssertTrue(p.boosted(now: 1100))
        // back to the long pace (`min` 0: until = at)
        XCTAssertEqual(p.apply(Boost(until: 1100, at: 1100, by: "w1"), battery: 50, now: 1100), .back)
        XCTAssertFalse(p.boosted(now: 1101))
        // a later request again
        XCTAssertEqual(p.apply(Boost(until: 1500, at: 1200, by: "w2"), battery: nil, now: 1200), .applied)
        XCTAssertEqual(p.boost?.by, "w2")
        // a Direct run has nothing to change
        var d = PaceState(choice: .direct)
        XCTAssertEqual(d.apply(b, battery: 50, now: 1000), .notLong)
    }

    func testARequestIsRefusedWhenNotAllowedOrOnALowBattery() {
        var p = PaceState(choice: long)
        XCTAssertEqual(p.apply(Boost(until: 1300, at: 1000, by: "w1"), battery: 19, now: 1000), .refused)
        XCTAssertTrue(p.refused)
        XCTAssertFalse(p.boosted(now: 1100))
        XCTAssertEqual(JSON.int64(p.json(now: 1100, liveSend: 15)["boost"]), 0)
        XCTAssertEqual(p.apply(Boost(until: 1400, at: 1100, by: "w1"), battery: 20, now: 1100), .applied)
        XCTAssertFalse(p.refused)
        var q = PaceState(choice: PaceChoice(long: true, fix: 60, send: 900, remote: false))
        XCTAssertEqual(q.apply(Boost(until: 1300, at: 1000, by: "w1"), battery: 90, now: 1000), .refused)
        XCTAssertFalse(q.live(now: 1001))
    }

    func testARequestEndsByItself() {
        var p = PaceState(choice: long)
        _ = p.apply(Boost(until: 1300, at: 1000, by: "w1"), battery: 50, now: 1000)
        XCTAssertFalse(p.expire(now: 1299, battery: 50))
        XCTAssertTrue(p.expire(now: 1300, battery: 50))
        XCTAssertNil(p.boost)
        XCTAssertFalse(p.expire(now: 1301, battery: 50))
        // the battery always comes first
        _ = p.apply(Boost(until: 2000, at: 1400, by: "w1"), battery: 50, now: 1400)
        XCTAssertTrue(p.expire(now: 1500, battery: 12))
        XCTAssertFalse(p.boosted(now: 1500))
    }

    func testTheChoiceIsKeptWithAllowedFigures() throws {
        let suite = "oz.pace.test." + UUID().uuidString
        let d = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { d.removePersistentDomain(forName: suite) }
        XCTAssertEqual(PaceChoice.load(d), .direct)
        PaceChoice(long: true, fix: 45, send: 1000, remote: false).save(d)
        let back = PaceChoice.load(d)
        XCTAssertTrue(back.long)
        XCTAssertFalse(back.remote)
        XCTAssertTrue(PaceChoice.fixes.contains(back.fix))
        XCTAssertEqual(back.send, 900)
        XCTAssertEqual(PaceChoice(long: true, fix: 1, send: 1, remote: true).clamped,
                       PaceChoice(long: true, fix: 15, send: 300, remote: true))
    }

    func testTheRelaysObjects() {
        XCTAssertEqual(Boost(json: ["until": 1900, "at": 1000, "by": "w2345678"]), Boost(until: 1900, at: 1000, by: "w2345678"))
        XCTAssertEqual(Boost(json: ["until": "1900", "at": "1000"]), Boost(until: 1900, at: 1000, by: ""))
        XCTAssertNil(Boost(json: NSNull()))
        XCTAssertNil(Boost(json: nil))
        XCTAssertNil(Boost(json: ["until": 1900]))

        let r = RemotePace(json: ["mode": "long", "fix": 30, "send": 600, "remote": true, "boost": 2000, "by": "w1"])
        XCTAssertEqual(r, RemotePace(long: true, fix: 30, send: 600, remote: true, boost: 2000, by: "w1"))
        XCTAssertEqual(r?.boosted(now: 1999), true)
        XCTAssertEqual(r?.boosted(now: 2000), false)
        XCTAssertNil(RemotePace(json: nil))
        let live = RemotePace(json: ["mode": "live", "fix": 1, "send": 15, "remote": false, "boost": 0, "by": ""])
        XCTAssertEqual(live?.long, false)

        // « Passer en direct » only in a long run allowing it, under way; « Revenir au rythme lent » while asked or kept
        XCTAssertTrue(RemotePace.canAsk(r, state: "run"))
        XCTAssertFalse(RemotePace.canAsk(r, state: "end"))
        XCTAssertFalse(RemotePace.canAsk(live, state: "run"))
        XCTAssertFalse(RemotePace.canAsk(RemotePace(long: true, fix: 30, send: 600, remote: false, boost: 0, by: ""), state: "run"))
        let slow = RemotePace(long: true, fix: 30, send: 600, remote: true, boost: 0, by: "")
        XCTAssertFalse(RemotePace.canStop(slow, state: "run", request: nil, now: 1000))
        XCTAssertTrue(RemotePace.canStop(slow, state: "run", request: Boost(until: 1300, at: 1000, by: "w1"), now: 1100))
        XCTAssertFalse(RemotePace.canStop(slow, state: "run", request: Boost(until: 1100, at: 1100, by: "w1"), now: 1100))
        XCTAssertTrue(RemotePace.canStop(r, state: "run", request: nil, now: 1500))
    }

    func testBatchesCarryThePace() throws {
        let b = TrackBatch(run: "r_20261125T101500_ab12", seq: 2, state: .run, share: "watchers",
                           fixes: [TrackFix(t: 1_795_253_712, la: 48_000_000, lo: 2_000_000, ac: 8)])
        let pace = PaceState(choice: long).json(now: 1_795_253_712, liveSend: 15)
        let relay = try XCTUnwrap(JSON.object(RelayBody.make(c: "abcdefghijklmnop", batch: b,
                                                              watchers: [(w: "w2345678", k: Data(count: 32))], alerts: [],
                                                              battery: 60, lowPower: false, pace: pace)))
        XCTAssertEqual((relay["pace"] as? [String: Any])?["mode"] as? String, "long")
        XCTAssertEqual((relay["pace"] as? [String: Any])?["send"] as? Int, 600)
        let ozimut = try XCTUnwrap(JSON.object(BatchEncoder.encode(b, battery: 60, lowPower: false, left: 0, pace: pace)))
        XCTAssertEqual((ozimut["pace"] as? [String: Any])?["fix"] as? Int, 30)
        // without a pace (a batch of before), none is written
        XCTAssertNil(JSON.object(try BatchEncoder.encode(b, battery: 60, lowPower: false, left: 0))?["pace"])
    }

    func testStandingStillInALongRun() {
        let p = PaceState(choice: long)
        let w = AlertWatch(zone: { Zone(on: false, la: 0, lo: 0, r: 500) }, window: p.stillSeconds, slack: p.stillSlack)
        var said: [String] = []
        var at: Int64 = 0
        // a fix every 30 s or so on the same spot: said once, after 30 minutes, not after 5
        for i in 0...70 {
            let t = 10_000 + Int64(i) * 30 + Int64(i % 3)
            let now = w.onFix(TrackFix(t: t, la: 48_000_000, lo: 2_000_000, ac: 10), runStarted: 10_000)
            if !now.isEmpty && at == 0 { at = t }
            said += now
        }
        XCTAssertEqual(said, [Alerts.still])
        XCTAssertGreaterThanOrEqual(at - 10_000, 1800)
        XCTAssertLessThan(at - 10_000, 1900)
    }
}

/// A long run through the coordinator: its cap, one fix kept every `fix` seconds, a watcher's request applied once.
final class LongRunTests: XCTestCase {
    private final class Nowhere: TrackDestination {
        func send(_ batch: TrackBatch, battery: Int?, lowPower: Bool, left: Int, done: @escaping (PushResult) -> Void) {
            done(.noRecipient)
        }
    }

    private func coordinator(_ suite: String) -> RunCoordinator {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        return RunCoordinator(directory: dir, ozimut: Nowhere(), relay: Nowhere(), monitorNetwork: false,
                              defaults: UserDefaults(suiteName: suite)!)
    }

    func testALongRunsCapFixesAndRequests() throws {
        let suite = "oz.longrun.test." + UUID().uuidString
        defer { UserDefaults().removePersistentDomain(forName: suite) }
        let c = coordinator(suite)
        var level: Int? = 80
        c.battery = { level }
        var saving: [Bool] = []
        c.setLocationSaving = { saving.append($0) }
        let start = Date()
        let t0 = Int64(floor(start.timeIntervalSince1970))
        let run = try XCTUnwrap(c.start(share: false, linked: false, cap: 3600,
                                        pace: PaceChoice(long: true, fix: 30, send: 600, remote: true), now: start))
        defer { RunLog.delete(run) }
        XCTAssertEqual(c.cap, PaceChoice.longCap)
        XCTAssertEqual(saving, [true])
        // one fix a second from the system: one kept every 30 s
        for i in 0...90 { c.add(TrackFix(t: t0 + Int64(i), la: 48_000_000, lo: 2_000_000 + Int64(i), ac: 5)) }
        XCTAssertEqual(RunLog.read(RunLog.url(run)).map(\.t), [t0, t0 + 30, t0 + 60, t0 + 90])

        // a watcher asks for Direct: every fix kept until its end, the location at its best
        let b = Boost(until: t0 + 300, at: t0, by: "w2345678")
        XCTAssertEqual(c.applyBoost(b, now: start), .applied)
        XCTAssertEqual(saving.last, false)
        XCTAssertEqual(c.status.pace?.boosted(now: t0 + 100), true)
        for i in 91...95 { c.add(TrackFix(t: t0 + Int64(i), la: 48_000_000, lo: 2_000_000 + Int64(i), ac: 5)) }
        XCTAssertEqual(RunLog.read(RunLog.url(run)).count, 9)
        XCTAssertEqual(c.applyBoost(b, now: start), .seen)

        // a request on a low battery is refused
        level = 10
        XCTAssertEqual(c.applyBoost(Boost(until: t0 + 900, at: t0 + 1, by: "w3456789"), now: start), .refused)
        XCTAssertEqual(c.status.pace?.refused, true)
        XCTAssertEqual(c.status.pace?.boosted(now: t0 + 100), false)
        XCTAssertEqual(saving.last, true)
        c.stop()

        // Direct: the caller's cap, every fix kept, no request to apply
        let d = coordinator(suite)
        let run2 = try XCTUnwrap(d.start(share: false, linked: false, cap: nil, now: start))
        defer { RunLog.delete(run2) }
        XCTAssertEqual(d.cap, RunCoordinator.defaultCap)
        for i in 0..<5 { d.add(TrackFix(t: t0 + Int64(i), la: 48_000_000, lo: 2_000_000, ac: 5)) }
        XCTAssertEqual(RunLog.read(RunLog.url(run2)).count, 5)
        XCTAssertEqual(d.applyBoost(Boost(until: t0 + 300, at: t0, by: "w1"), now: start), .notLong)
        d.stop()
    }
}
