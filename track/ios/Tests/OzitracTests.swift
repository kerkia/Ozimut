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
