import Foundation

/// Every run kept on this device (docs/track/ozitrac.md rule 3), as Android's RunLog.kt: `Application Support/Runs/<run>.csv`,
/// a line a fix « t,la,lo,ac,al », written as the fixes come. A run the Apple Watch recorded and sent over
/// (WatchConnectivity) has a marker `<run>.watch` beside it. A GPX file is made from it when the runner wants one.
enum RunLog {
    struct Info: Identifiable, Equatable {
        var run: String
        var url: URL
        var start: Int64
        var end: Int64
        var points: Int
        var metres: Double
        var fromWatch: Bool
        var id: String { run }
    }

    private static let lock = NSLock()

    static let dir: URL = {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Runs", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    static func safe(_ run: String) -> String {
        String(run.filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") })
    }

    static func url(_ run: String) -> URL {
        dir.appendingPathComponent(safe(run) + ".csv")
    }

    private static func marker(_ run: String) -> URL {
        dir.appendingPathComponent(safe(run) + ".watch")
    }

    static func line(_ f: TrackFix) -> String {
        "\(f.t),\(f.la),\(f.lo),\(f.ac),\(f.al.map(String.init) ?? "")\n"
    }

    static func append(run: String, fix: TrackFix) {
        appendLines([fix], to: url(run))
    }

    /// Appends fixes to a file (made when missing). A full disk loses them: the run still goes to its destinations.
    static func appendLines(_ fixes: [TrackFix], to file: URL) {
        let data = Data(fixes.map(line).joined().utf8)
        lock.lock()
        defer { lock.unlock() }
        if !FileManager.default.fileExists(atPath: file.path) {
            FileManager.default.createFile(atPath: file.path, contents: data)
            return
        }
        guard let h = try? FileHandle(forWritingTo: file) else { return }
        defer { try? h.close() }
        _ = try? h.seekToEnd()
        try? h.write(contentsOf: data)
    }

    static func read(_ file: URL) -> [TrackFix] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        var out: [TrackFix] = []
        for line in String(decoding: data, as: UTF8.self).split(separator: "\n") {
            let p = line.split(separator: ",", omittingEmptySubsequences: false)
            guard p.count >= 4, let t = Int64(p[0]) else { continue }
            out.append(TrackFix(t: t, la: Int64(p[1]) ?? 0, lo: Int64(p[2]) ?? 0, ac: Int(p[3]) ?? 0,
                                al: p.count > 4 ? Int(p[4]) : nil))
        }
        return out
    }

    /// The runs kept, the latest first.
    static func runs() -> [Info] {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "csv" }.compactMap { u -> Info? in
            let fixes = read(u)
            guard let first = fixes.first, let last = fixes.last else { return nil }
            let run = u.deletingPathExtension().lastPathComponent
            return Info(run: run, url: u, start: first.t, end: last.t, points: fixes.count, metres: Geo.length(fixes),
                        fromWatch: FileManager.default.fileExists(atPath: marker(run).path))
        }.sorted { $0.start > $1.start }
    }

    static func delete(_ run: String) {
        try? FileManager.default.removeItem(at: url(run))
        try? FileManager.default.removeItem(at: marker(run))
    }

    /// Keeps the `keep` latest runs (the watch's small storage).
    static func prune(keep: Int) {
        let all = runs()
        for r in all.dropFirst(keep) { delete(r.run) }
    }

    /// A run the Apple Watch sent: its file taken in, marked « Enregistrée sur la montre ». An older copy of the same run
    /// is replaced (the watch sends a run once it has ended).
    @discardableResult
    static func importWatch(file: URL, run: String) -> Bool {
        let name = safe(run)
        guard !name.isEmpty, !read(file).isEmpty else { return false }
        let dest = url(name)
        try? FileManager.default.removeItem(at: dest)
        do {
            try FileManager.default.copyItem(at: file, to: dest)
        } catch {
            return false
        }
        FileManager.default.createFile(atPath: marker(name).path, contents: Data())
        return true
    }

    /// A GPX file of the fixes in the temporary folder, ready to be shared or saved.
    static func gpxFile(name: String, fixes: [TrackFix]) -> URL? {
        let d = FileManager.default.temporaryDirectory.appendingPathComponent("gpx", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        var safeName = String(name.filter { $0.isLetter || $0.isNumber || $0 == " " || $0 == "_" || $0 == "-" })
            .trimmingCharacters(in: .whitespaces)
        if safeName.isEmpty { safeName = "ozitrac" }
        let f = d.appendingPathComponent(String(safeName.prefix(60)) + ".gpx")
        do {
            try Data(Gpx.write(name: name, fixes: fixes).utf8).write(to: f, options: .atomic)
            return f
        } catch {
            return nil
        }
    }
}
