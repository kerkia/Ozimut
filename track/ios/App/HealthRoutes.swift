import CoreLocation
import Foundation
import HealthKit

enum HealthError: LocalizedError {
    case unavailable
    case notFound

    var errorDescription: String? {
        switch self {
        case .unavailable: return L("error.health")
        case .notFound: return L("error.health.notFound")
        }
    }
}

/// The bridge's `healthRoutes` / `healthRoute`: HealthKit workouts that have a route, and a route as a GPX text
/// with every point's time. Read permission is asked on first use.
final class HealthRoutes {
    private let store = HKHealthStore()
    private var authorised = false

    private func authorise() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthError.unavailable }
        if authorised { return }
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), HKSeriesType.workoutRoute()]
        try await store.requestAuthorization(toShare: [], read: read)
        authorised = true
    }

    /// `[{ id, start, end, distance, source, activity }]`, the latest first.
    func list(days: Int) async throws -> [[String: Any]] {
        try await authorise()
        let start = Date().addingTimeInterval(-Double(max(1, min(days, 3650))) * 86_400)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: nil, options: [])
        let workouts = try await samples(type: HKObjectType.workoutType(), predicate: predicate, limit: 300)
            .compactMap { $0 as? HKWorkout }
        var out: [[String: Any]] = []
        for w in workouts {
            let routes = try await routes(of: w)
            if routes.isEmpty { continue }
            out.append([
                "id": w.uuid.uuidString,
                "start": Int(w.startDate.timeIntervalSince1970),
                "end": Int(w.endDate.timeIntervalSince1970),
                "distance": Int((distance(of: w)).rounded()),
                "source": w.sourceRevision.source.name,
                "activity": Int(w.workoutActivityType.rawValue),
            ])
        }
        return out
    }

    /// `{ name, gpx }` for one workout.
    func gpx(id: String) async throws -> [String: Any] {
        try await authorise()
        guard let uuid = UUID(uuidString: id) else { throw HealthError.notFound }
        let found = try await samples(type: HKObjectType.workoutType(), predicate: HKQuery.predicateForObject(with: uuid), limit: 1)
        guard let w = found.first as? HKWorkout else { throw HealthError.notFound }
        var segments: [[CLLocation]] = []
        for r in try await routes(of: w) {
            let locs = try await locations(of: r)
            if !locs.isEmpty { segments.append(locs) }
        }
        let df = DateFormatter()
        df.locale = Lang.locale
        df.dateStyle = .medium
        df.timeStyle = .short
        let name = L("health.name", df.string(from: w.startDate))
        return ["name": name, "gpx": GPX.text(name: name, start: w.startDate, segments: segments)]
    }

    private func distance(of w: HKWorkout) -> Double {
        if let stats = w.statistics(for: HKQuantityType(.distanceWalkingRunning)), let q = stats.sumQuantity() {
            return q.doubleValue(for: .meter())
        }
        if let stats = w.statistics(for: HKQuantityType(.distanceCycling)), let q = stats.sumQuantity() {
            return q.doubleValue(for: .meter())
        }
        return 0
    }

    private func samples(type: HKSampleType, predicate: NSPredicate?, limit: Int) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<[HKSample], Error>) in
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, s, e in
                if let e { c.resume(throwing: e) } else { c.resume(returning: s ?? []) }
            }
            store.execute(q)
        }
    }

    private func routes(of w: HKWorkout) async throws -> [HKWorkoutRoute] {
        try await samples(type: HKSeriesType.workoutRoute(), predicate: HKQuery.predicateForObjects(from: w), limit: HKObjectQueryNoLimit)
            .compactMap { $0 as? HKWorkoutRoute }
            .sorted { $0.startDate < $1.startDate }
    }

    private func locations(of route: HKWorkoutRoute) async throws -> [CLLocation] {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<[CLLocation], Error>) in
            var all: [CLLocation] = []
            var finished = false
            let q = HKWorkoutRouteQuery(route: route) { _, locs, done, error in
                if finished { return }
                if let error {
                    finished = true
                    c.resume(throwing: error)
                    return
                }
                all.append(contentsOf: locs ?? [])
                if done {
                    finished = true
                    c.resume(returning: all)
                }
            }
            store.execute(q)
        }
    }
}

/// A GPX 1.1 text: one track, a segment per route, each point with its time (and elevation when known).
enum GPX {
    static func text(name: String, start: Date, segments: [[CLLocation]]) -> String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        var s = """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="Ozimut iOS" xmlns="http://www.topografix.com/GPX/1/1">
        <metadata><name>\(escape(name))</name><time>\(iso.string(from: start))</time></metadata>
        <trk><name>\(escape(name))</name>

        """
        for seg in segments {
            s += "<trkseg>\n"
            for p in seg {
                s += String(format: "<trkpt lat=\"%.7f\" lon=\"%.7f\">", p.coordinate.latitude, p.coordinate.longitude)
                if p.verticalAccuracy >= 0 { s += String(format: "<ele>%.1f</ele>", p.altitude) }
                s += "<time>" + iso.string(from: p.timestamp) + "</time></trkpt>\n"
            }
            s += "</trkseg>\n"
        }
        s += "</trk>\n</gpx>\n"
        return s
    }

    static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
