import Foundation
import SQLite3

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// A run as the queue keeps it, so that it survives the app being ended by the system.
struct QueuedRun: Equatable {
    var run: String
    var started: Int64
    var share: String
    var lastSeq: Int
    var acked: Int
    var endSeq: Int
    var closed: Bool
    var distance: Double
    var fixes: Int
    var lastSent: Int64
    var lastFix: TrackFix?
}

enum FixQueueError: Error {
    case open(String)
}

/// The on-disk queue of fixes (plain SQLite, the system's libsqlite3). Not thread-safe: one serial queue uses it
/// (`TrackEngine.q`). Fixes are written one by one as they come; batches are numbered when sealed, kept until the
/// server acknowledges them, and resent in order from the first one not acknowledged.
final class FixQueue {
    private var db: OpaquePointer?

    init(path: String) throws {
        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        guard sqlite3_open_v2(path, &handle, flags, nil) == SQLITE_OK else {
            let msg = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "open"
            sqlite3_close(handle)
            throw FixQueueError.open(msg)
        }
        db = handle
        exec("PRAGMA journal_mode=WAL")
        exec("PRAGMA synchronous=NORMAL")
        exec("""
        CREATE TABLE IF NOT EXISTS runs(run TEXT PRIMARY KEY, started INTEGER NOT NULL, share TEXT NOT NULL,
          last_seq INTEGER NOT NULL DEFAULT 0, acked INTEGER NOT NULL DEFAULT 0, end_seq INTEGER NOT NULL DEFAULT 0,
          closed INTEGER NOT NULL DEFAULT 0, distance REAL NOT NULL DEFAULT 0, fixes INTEGER NOT NULL DEFAULT 0,
          last_sent INTEGER NOT NULL DEFAULT 0, last_t INTEGER, last_la INTEGER, last_lo INTEGER, last_ac INTEGER);
        CREATE TABLE IF NOT EXISTS fixes(id INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, seq INTEGER,
          t INTEGER NOT NULL, la INTEGER NOT NULL, lo INTEGER NOT NULL, ac INTEGER NOT NULL, al INTEGER);
        CREATE INDEX IF NOT EXISTS fixes_run_seq ON fixes(run, seq);
        CREATE TABLE IF NOT EXISTS batches(run TEXT NOT NULL, seq INTEGER NOT NULL, state TEXT NOT NULL,
          PRIMARY KEY(run, seq));
        """)
    }

    deinit {
        sqlite3_close(db)
    }

    // MARK: runs

    func openRun(_ run: String, started: Int64, share: String) {
        write("INSERT OR IGNORE INTO runs(run, started, share) VALUES(?, ?, ?)", [run, started, share])
    }

    /// The run still open (not closed), if any: the one to resume after a relaunch.
    func openRunRow() -> QueuedRun? {
        var name: String?
        read("SELECT run FROM runs WHERE closed = 0 ORDER BY started DESC LIMIT 1", []) { s in name = text(s, 0) }
        return name.flatMap { row($0) }
    }

    func row(_ run: String) -> QueuedRun? {
        var out: QueuedRun?
        read("""
        SELECT run, started, share, last_seq, acked, end_seq, closed, distance, fixes, last_sent,
          last_t, last_la, last_lo, last_ac FROM runs WHERE run = ?
        """, [run]) { s in
            var last: TrackFix?
            if sqlite3_column_type(s, 10) != SQLITE_NULL {
                last = TrackFix(t: sqlite3_column_int64(s, 10), la: sqlite3_column_int64(s, 11),
                                lo: sqlite3_column_int64(s, 12), ac: Int(sqlite3_column_int64(s, 13)))
            }
            out = QueuedRun(run: text(s, 0), started: sqlite3_column_int64(s, 1), share: text(s, 2),
                            lastSeq: Int(sqlite3_column_int64(s, 3)), acked: Int(sqlite3_column_int64(s, 4)),
                            endSeq: Int(sqlite3_column_int64(s, 5)), closed: sqlite3_column_int64(s, 6) != 0,
                            distance: sqlite3_column_double(s, 7), fixes: Int(sqlite3_column_int64(s, 8)),
                            lastSent: sqlite3_column_int64(s, 9), lastFix: last)
        }
        return out
    }

    func setSent(_ run: String, at: Int64) {
        write("UPDATE runs SET last_sent = ? WHERE run = ?", [at, run])
    }

    /// Closes a run: its fixes and batches go (acknowledged or given up), its row stays as a record.
    func close(_ run: String) {
        exec("BEGIN")
        write("UPDATE runs SET closed = 1 WHERE run = ?", [run])
        write("DELETE FROM fixes WHERE run = ?", [run])
        write("DELETE FROM batches WHERE run = ?", [run])
        exec("COMMIT")
    }

    /// Forgets everything (the device was removed from its account).
    func wipe() {
        exec("DELETE FROM fixes; DELETE FROM batches; DELETE FROM runs;")
    }

    // MARK: fixes

    func add(_ f: TrackFix, run: String, distance: Double) {
        exec("BEGIN")
        write("INSERT INTO fixes(run, t, la, lo, ac, al) VALUES(?, ?, ?, ?, ?, ?)", [run, f.t, f.la, f.lo, f.ac, f.al])
        write("""
        UPDATE runs SET fixes = fixes + 1, distance = distance + ?, last_t = ?, last_la = ?, last_lo = ?, last_ac = ?
        WHERE run = ?
        """, [distance, f.t, f.la, f.lo, f.ac, run])
        exec("COMMIT")
    }

    /// Fixes not yet acknowledged (sealed or not).
    func pending(_ run: String) -> Int {
        count("SELECT COUNT(*) FROM fixes WHERE run = ?", [run])
    }

    func unassigned(_ run: String) -> Int {
        count("SELECT COUNT(*) FROM fixes WHERE run = ? AND seq IS NULL", [run])
    }

    func hasUnackedBatch(_ run: String) -> Bool {
        guard let r = row(run) else { return false }
        return count("SELECT COUNT(*) FROM batches WHERE run = ? AND seq > ?", [run, r.acked]) > 0
    }

    /// Numbers the fixes not yet in a batch into batches of at most `max` fixes; the last one takes `state`, the
    /// others "run". With no such fix, an empty batch is made when `state` is not "run" or `heartbeat` is set.
    /// Returns the numbers made.
    @discardableResult
    func seal(_ run: String, state: RunState, heartbeat: Bool, max: Int = BatchEncoder.maxFixes) -> [Int] {
        guard let r = row(run), !r.closed else { return [] }
        var seq = r.lastSeq
        var made: [Int] = []
        exec("BEGIN")
        var left = unassigned(run)
        while left > 0 {
            var ids: [Int64] = []
            read("SELECT id FROM fixes WHERE run = ? AND seq IS NULL ORDER BY t, id LIMIT ?", [run, max]) { s in
                ids.append(sqlite3_column_int64(s, 0))
            }
            if ids.isEmpty { break }
            seq += 1
            left -= ids.count
            write("UPDATE fixes SET seq = ? WHERE id IN (" + ids.map(String.init).joined(separator: ",") + ")", [seq])
            write("INSERT INTO batches(run, seq, state) VALUES(?, ?, ?)", [run, seq, (left > 0 ? RunState.run : state).rawValue])
            made.append(seq)
        }
        if made.isEmpty && (state != .run || heartbeat) {
            seq += 1
            write("INSERT INTO batches(run, seq, state) VALUES(?, ?, ?)", [run, seq, state.rawValue])
            made.append(seq)
        }
        let endSeq = state == .end ? (made.last ?? r.endSeq) : r.endSeq
        write("UPDATE runs SET last_seq = ?, end_seq = ? WHERE run = ?", [seq, endSeq, run])
        exec("COMMIT")
        return made
    }

    /// The first batch the server has not acknowledged, with its fixes in order.
    func nextBatch(_ run: String) -> TrackBatch? {
        guard let r = row(run) else { return nil }
        var found: (Int, RunState)?
        read("SELECT seq, state FROM batches WHERE run = ? AND seq > ? ORDER BY seq LIMIT 1", [run, r.acked]) { s in
            found = (Int(sqlite3_column_int64(s, 0)), RunState(rawValue: text(s, 1)) ?? .run)
        }
        guard let hit = found else { return nil }
        let seq = hit.0, state = hit.1
        var fixes: [TrackFix] = []
        read("SELECT t, la, lo, ac, al FROM fixes WHERE run = ? AND seq = ? ORDER BY t, id", [run, seq]) { s in
            let al: Int? = sqlite3_column_type(s, 4) == SQLITE_NULL ? nil : Int(sqlite3_column_int64(s, 4))
            fixes.append(TrackFix(t: sqlite3_column_int64(s, 0), la: sqlite3_column_int64(s, 1),
                                  lo: sqlite3_column_int64(s, 2), ac: Int(sqlite3_column_int64(s, 3)), al: al))
        }
        return TrackBatch(run: run, seq: seq, state: state, share: r.share, fixes: fixes)
    }

    /// The server holds every batch up to `upTo`: their fixes go.
    func ack(_ run: String, upTo: Int) {
        guard let r = row(run) else { return }
        let a = min(upTo, r.lastSeq)
        guard a > r.acked else { return }
        exec("BEGIN")
        write("UPDATE runs SET acked = ? WHERE run = ?", [a, run])
        write("DELETE FROM fixes WHERE run = ? AND seq IS NOT NULL AND seq <= ?", [run, a])
        write("DELETE FROM batches WHERE run = ? AND seq <= ?", [run, a])
        exec("COMMIT")
    }

    /// Cuts a batch in two (the server answered 413): its second half becomes `seq + 1`, later batches move up one.
    @discardableResult
    func split(_ run: String, seq: Int) -> Bool {
        guard let r = row(run) else { return false }
        var ids: [Int64] = []
        read("SELECT id FROM fixes WHERE run = ? AND seq = ? ORDER BY t, id", [run, seq]) { s in ids.append(sqlite3_column_int64(s, 0)) }
        guard ids.count >= 2 else { return false }
        var state = RunState.run
        read("SELECT state FROM batches WHERE run = ? AND seq = ?", [run, seq]) { s in state = RunState(rawValue: text(s, 0)) ?? .run }
        exec("BEGIN")
        write("UPDATE batches SET seq = -(seq + 1) WHERE run = ? AND seq > ?", [run, seq])
        write("UPDATE batches SET seq = -seq WHERE run = ? AND seq < 0", [run])
        write("UPDATE fixes SET seq = seq + 1 WHERE run = ? AND seq > ?", [run, seq])
        let second = ids[(ids.count / 2)...]
        write("UPDATE fixes SET seq = ? WHERE id IN (" + second.map(String.init).joined(separator: ",") + ")", [seq + 1])
        write("UPDATE batches SET state = 'run' WHERE run = ? AND seq = ?", [run, seq])
        write("INSERT INTO batches(run, seq, state) VALUES(?, ?, ?)", [run, seq + 1, state.rawValue])
        let endSeq = r.endSeq >= seq && r.endSeq > 0 ? r.endSeq + 1 : r.endSeq
        write("UPDATE runs SET last_seq = last_seq + 1, end_seq = ? WHERE run = ?", [endSeq, run])
        exec("COMMIT")
        return true
    }

    // MARK: SQLite

    @discardableResult
    private func exec(_ sql: String) -> Bool {
        sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK
    }

    private func prepare(_ sql: String, _ args: [Any?]) -> OpaquePointer? {
        var s: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &s, nil) == SQLITE_OK else { return nil }
        for (i, a) in args.enumerated() {
            let idx = Int32(i + 1)
            guard let a else {
                sqlite3_bind_null(s, idx)
                continue
            }
            switch a {
            case let v as Int: sqlite3_bind_int64(s, idx, Int64(v))
            case let v as Int64: sqlite3_bind_int64(s, idx, v)
            case let v as Double: sqlite3_bind_double(s, idx, v)
            case let v as Bool: sqlite3_bind_int64(s, idx, v ? 1 : 0)
            case let v as String: sqlite3_bind_text(s, idx, v, -1, SQLITE_TRANSIENT)
            default: sqlite3_bind_null(s, idx)
            }
        }
        return s
    }

    private func write(_ sql: String, _ args: [Any?]) {
        guard let s = prepare(sql, args) else { return }
        sqlite3_step(s)
        sqlite3_finalize(s)
    }

    private func read(_ sql: String, _ args: [Any?], _ each: (OpaquePointer) -> Void) {
        guard let s = prepare(sql, args) else { return }
        while sqlite3_step(s) == SQLITE_ROW { each(s) }
        sqlite3_finalize(s)
    }

    private func count(_ sql: String, _ args: [Any?]) -> Int {
        var n = 0
        read(sql, args) { s in n = Int(sqlite3_column_int64(s, 0)) }
        return n
    }
}

private func text(_ s: OpaquePointer, _ i: Int32) -> String {
    guard let c = sqlite3_column_text(s, i) else { return "" }
    return String(cString: c)
}
