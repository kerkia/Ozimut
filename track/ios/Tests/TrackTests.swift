import XCTest

final class BatchEncoderTests: XCTestCase {
    private func fixes(_ n: Int, t0: Int64 = 1_795_253_712) -> [TrackFix] {
        var out: [TrackFix] = []
        for i in 0..<n {
            let k = Int64(i)
            let la: Int64 = 48_412_345 + k * 12
            let lo: Int64 = 2_634_567 - k * 20
            out.append(TrackFix(t: t0 + k, la: la, lo: lo, ac: 5 + i % 3, al: 87 + i % 2))
        }
        return out
    }

    func testDeltaFormat() throws {
        let f = [
            TrackFix(t: 1_795_253_712, la: 48_412_345, lo: 2_634_567, ac: 5, al: 87),
            TrackFix(t: 1_795_253_713, la: 48_412_357, lo: 2_634_547, ac: 5, al: 87),
            TrackFix(t: 1_795_253_714, la: 48_412_354, lo: 2_634_529, ac: 6, al: 87),
        ]
        let b = TrackBatch(run: "r_20261121T093512_ab12", seq: 42, state: .run, share: "watchers", fixes: f)
        let d = BatchEncoder.dictionary(b, battery: 71, lowPower: false, left: 0)
        XCTAssertEqual(d["v"] as? Int, 1)
        XCTAssertEqual(d["run"] as? String, "r_20261121T093512_ab12")
        XCTAssertEqual(d["seq"] as? Int, 42)
        XCTAssertEqual(d["state"] as? String, "run")
        XCTAssertEqual(d["share"] as? String, "watchers")
        XCTAssertEqual(d["t0"] as? Int64, 1_795_253_712)
        XCTAssertEqual(d["dt"] as? [Int64], [0, 1, 1])
        XCTAssertEqual(d["la"] as? [Int64], [48_412_345, 12, -3])
        XCTAssertEqual(d["lo"] as? [Int64], [2_634_567, -20, -18])
        XCTAssertEqual(d["ac"] as? [Int], [5, 5, 6])
        XCTAssertEqual(d["al"] as? [Int], [87, 0, 0])
        XCTAssertEqual(d["bat"] as? Int, 71)
        XCTAssertEqual(d["lp"] as? Bool, false)
        XCTAssertEqual(d["left"] as? Int, 0)

        // The JSON text, read back as the server would.
        let data = try BatchEncoder.encode(b, battery: 71, lowPower: false, left: 0)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(BatchEncoder.decode(obj), f)
    }

    func testRoundTripMany() throws {
        let f = fixes(600)
        let b = TrackBatch(run: "r", seq: 1, state: .end, share: "private", fixes: f)
        let data = try BatchEncoder.encode(b, battery: nil, lowPower: true, left: 3)
        let obj = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertNil(obj["bat"])
        XCTAssertEqual(obj["lp"] as? Bool, true)
        XCTAssertEqual(obj["state"] as? String, "end")
        XCTAssertEqual(BatchEncoder.decode(obj), f)
    }

    func testEmptyBatchIsHeartbeat() {
        let now = Date(timeIntervalSince1970: 1_795_253_800.7)
        let b = TrackBatch(run: "r", seq: 3, state: .help, share: "watchers", fixes: [])
        let d = BatchEncoder.dictionary(b, battery: 50, lowPower: false, left: 0, now: now)
        XCTAssertEqual(d["dt"] as? [Int64], [])
        XCTAssertEqual(d["la"] as? [Int64], [])
        XCTAssertEqual(d["t0"] as? Int64, 1_795_253_800)
        XCTAssertNil(d["al"])
        XCTAssertEqual(d["state"] as? String, "help")
    }

    func testNoAltitudeOmitted() {
        let f = [TrackFix(t: 10, la: 1, lo: 2, ac: 3), TrackFix(t: 12, la: 4, lo: 5, ac: 6)]
        let d = BatchEncoder.dictionary(TrackBatch(run: "r", seq: 1, state: .run, share: "watchers", fixes: f),
                                        battery: nil, lowPower: false, left: 0)
        XCTAssertNil(d["al"])
        XCTAssertEqual(d["dt"] as? [Int64], [0, 2])
        XCTAssertEqual(BatchEncoder.decode(d), f)
    }

    func testChunks() {
        let c = BatchEncoder.chunks(fixes(1300))
        XCTAssertEqual(c.map(\.count), [600, 600, 100])
        XCTAssertEqual(BatchEncoder.chunks([]).count, 0)
    }

    func testFixFromLocation() {
        let f = TrackFix(time: Date(timeIntervalSince1970: 100.9), latitude: 48.4123456, longitude: -2.6345674,
                         accuracy: 4.6, altitude: nil)
        XCTAssertEqual(f.t, 100)
        XCTAssertEqual(f.la, 48_412_346)
        XCTAssertEqual(f.lo, -2_634_567)
        XCTAssertEqual(f.ac, 5)
        XCTAssertNil(f.al)
    }
}

final class FixQueueTests: XCTestCase {
    private var dir: URL!
    private var q: FixQueue!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        q = try FixQueue(path: dir.appendingPathComponent("q.sqlite").path)
    }

    override func tearDownWithError() throws {
        q = nil
        try? FileManager.default.removeItem(at: dir)
    }

    private func add(_ n: Int, run: String = "r1", from t0: Int64 = 1000) {
        for i in 0..<n {
            q.add(TrackFix(t: t0 + Int64(i), la: 48_000_000 + Int64(i), lo: 2_000_000, ac: 5), run: run, distance: 1)
        }
    }

    func testSealSendAck() {
        q.openRun("r1", started: 1000, share: "watchers")
        add(5)
        XCTAssertEqual(q.pending("r1"), 5)
        XCTAssertEqual(q.seal("r1", state: .run, heartbeat: false), [1])
        let b = q.nextBatch("r1")
        XCTAssertEqual(b?.seq, 1)
        XCTAssertEqual(b?.state, .run)
        XCTAssertEqual(b?.fixes.count, 5)
        XCTAssertEqual(b?.fixes.first?.t, 1000)
        q.ack("r1", upTo: 1)
        XCTAssertEqual(q.pending("r1"), 0)
        XCTAssertNil(q.nextBatch("r1"))
        let r = q.row("r1")
        XCTAssertEqual(r?.fixes, 5)
        XCTAssertEqual(r?.distance, 5)
        XCTAssertEqual(r?.lastFix?.t, 1004)
    }

    func testHeartbeatAndEnd() {
        q.openRun("r1", started: 1000, share: "watchers")
        XCTAssertEqual(q.seal("r1", state: .run, heartbeat: false), [])
        XCTAssertEqual(q.seal("r1", state: .run, heartbeat: true), [1])
        XCTAssertEqual(q.nextBatch("r1")?.fixes.count, 0)
        XCTAssertEqual(q.seal("r1", state: .end, heartbeat: false), [2])
        XCTAssertEqual(q.row("r1")?.endSeq, 2)
        q.ack("r1", upTo: 1)
        XCTAssertEqual(q.nextBatch("r1")?.state, .end)
    }

    func testLargeEndIsChunked() {
        q.openRun("r1", started: 1000, share: "watchers")
        add(1300)
        let seqs = q.seal("r1", state: .end, heartbeat: true)
        XCTAssertEqual(seqs, [1, 2, 3])
        XCTAssertEqual(q.nextBatch("r1")?.fixes.count, 600)
        XCTAssertEqual(q.nextBatch("r1")?.state, .run)
        q.ack("r1", upTo: 2)
        let last = q.nextBatch("r1")
        XCTAssertEqual(last?.seq, 3)
        XCTAssertEqual(last?.state, .end)
        XCTAssertEqual(last?.fixes.count, 100)
        XCTAssertEqual(q.row("r1")?.endSeq, 3)
    }

    func testResendFromFirstUnacked() {
        q.openRun("r1", started: 1000, share: "watchers")
        add(3)
        q.seal("r1", state: .run, heartbeat: false)
        add(3, from: 2000)
        q.seal("r1", state: .run, heartbeat: false)
        // The server only had batch 1: the next batch is 2 again.
        q.ack("r1", upTo: 1)
        XCTAssertEqual(q.nextBatch("r1")?.seq, 2)
        // An old acknowledgement changes nothing.
        q.ack("r1", upTo: 0)
        XCTAssertEqual(q.nextBatch("r1")?.seq, 2)
        // An acknowledgement beyond what was sent is clamped.
        q.ack("r1", upTo: 99)
        XCTAssertNil(q.nextBatch("r1"))
        XCTAssertEqual(q.row("r1")?.acked, 2)
    }

    func testSplit() {
        q.openRun("r1", started: 1000, share: "watchers")
        add(10)
        q.seal("r1", state: .run, heartbeat: false)
        add(4, from: 3000)
        q.seal("r1", state: .end, heartbeat: false)
        XCTAssertTrue(q.split("r1", seq: 1))
        XCTAssertEqual(q.nextBatch("r1")?.fixes.count, 5)
        q.ack("r1", upTo: 1)
        let b2 = q.nextBatch("r1")
        XCTAssertEqual(b2?.seq, 2)
        XCTAssertEqual(b2?.fixes.first?.t, 1005)
        q.ack("r1", upTo: 2)
        let b3 = q.nextBatch("r1")
        XCTAssertEqual(b3?.seq, 3)
        XCTAssertEqual(b3?.state, .end)
        XCTAssertEqual(b3?.fixes.count, 4)
        XCTAssertEqual(q.row("r1")?.endSeq, 3)
        XCTAssertEqual(q.row("r1")?.lastSeq, 3)
    }

    func testResumeAfterReopen() throws {
        q.openRun("r1", started: 1000, share: "private")
        add(7)
        q = nil
        q = try FixQueue(path: dir.appendingPathComponent("q.sqlite").path)
        let r = try XCTUnwrap(q.openRunRow())
        XCTAssertEqual(r.run, "r1")
        XCTAssertEqual(r.share, "private")
        XCTAssertEqual(q.pending("r1"), 7)
        q.close("r1")
        XCTAssertNil(q.openRunRow())
        XCTAssertEqual(q.pending("r1"), 0)
    }
}

/// A server in memory: acknowledges every batch in order.
private final class FakeServer: TrackPushing {
    var received: [[String: Any]] = []
    var answer: (Int) -> PushResult = { .ok(ack: $0, next: 30, stop: false) }

    func push(key: String, body: Data, done: @escaping (PushResult) -> Void) {
        let obj = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        DispatchQueue.global().async {
            self.received.append(obj)
            done(self.answer(JSON.int(obj["seq"]) ?? 0))
        }
    }
}

private final class Recorder: TrackEngineDelegate {
    var ended: XCTestExpectation?
    var removed: XCTestExpectation?
    var reason: EndReason?
    func trackChanged(_ status: TrackStatus) {}
    func trackEnded(_ status: TrackStatus, reason: EndReason) {
        self.reason = reason
        ended?.fulfill()
    }
    func trackDeviceRemoved() { removed?.fulfill() }
}

final class TrackEngineTests: XCTestCase {
    private func engine(_ server: FakeServer) -> TrackEngine {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        return TrackEngine(directory: dir, client: server, key: { "test-key" }, monitorNetwork: false)
    }

    func testRunToEnd() {
        let server = FakeServer()
        let e = engine(server)
        let rec = Recorder()
        rec.ended = expectation(description: "ended")
        e.delegate = rec
        let run = e.start(share: "watchers", now: Date(timeIntervalSince1970: 1_795_253_712))
        for i in 0..<20 {
            e.add(TrackFix(t: 1_795_253_712 + Int64(i), la: 48_412_345 + Int64(i), lo: 2_634_567, ac: 5))
        }
        e.stop()
        wait(for: [rec.ended!], timeout: 10)
        XCTAssertEqual(rec.reason, .user)
        let sent = server.received.flatMap { BatchEncoder.decode($0) }
        XCTAssertEqual(sent.count, 20)
        XCTAssertEqual(server.received.last?["state"] as? String, "end")
        XCTAssertEqual(server.received.first?["run"] as? String, run)
        XCTAssertEqual(e.snapshot().phase, .idle)
    }

    func testStopFromServer() {
        let server = FakeServer()
        server.answer = { .ok(ack: $0, next: 30, stop: true) }
        let e = engine(server)
        let rec = Recorder()
        rec.ended = expectation(description: "ended")
        e.delegate = rec
        e.start(share: "watchers")
        e.help()
        wait(for: [rec.ended!], timeout: 10)
        XCTAssertEqual(rec.reason, .remote)
        XCTAssertEqual(server.received.first?["state"] as? String, "help")
    }

    func testRemovedDevice() {
        let server = FakeServer()
        server.answer = { _ in .unauthorized }
        let e = engine(server)
        let rec = Recorder()
        rec.removed = expectation(description: "removed")
        e.delegate = rec
        e.start(share: "watchers")
        e.help()
        wait(for: [rec.removed!], timeout: 10)
        XCTAssertEqual(e.snapshot().phase, .idle)
    }
}

final class PairCodeTests: XCTestCase {
    func testExtract() {
        XCTAssertEqual(PairCode.extract("K7QM4TXD"), "K7QM4TXD")
        XCTAssertEqual(PairCode.extract(" k7qm4txd "), "K7QM4TXD")
        XCTAssertEqual(PairCode.extract("https://ozimut.com/t/K7QM4TXD"), "K7QM4TXD")
        XCTAssertEqual(PairCode.extract("ozimut://t/K7QM4TXD"), "K7QM4TXD")
        XCTAssertEqual(PairCode.extract("ozimut://pair/K7QM4TXD"), "K7QM4TXD")
        XCTAssertEqual(PairCode.extract("ozimut:K7QM4TXD"), "K7QM4TXD")
        XCTAssertNil(PairCode.extract("https://ozimut.com/t/login"))
        XCTAssertNil(PairCode.extract("https://ozimut.com/#/agenda"))
        XCTAssertNil(PairCode.extract("K7QM4"))
        XCTAssertEqual(PairCode.normalise("k7-qm 4txd99"), "K7QM4TXD")
    }

    func testRunId() {
        let id = RunId.make(start: Date(timeIntervalSince1970: 1_795_253_712))
        XCTAssertTrue(id.hasPrefix("r_"))
        XCTAssertEqual(id.count, "r_20261121T093512_ab12".count)
    }

    func testClaimCode() {
        let c = RandomCode.string(6, from: RandomCode.claimAlphabet)
        XCTAssertEqual(c.count, 6)
        XCTAssertTrue(c.allSatisfy { RandomCode.claimAlphabet.contains($0) })
        XCTAssertEqual(RandomCode.key().count, 43)
    }
}
