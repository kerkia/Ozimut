import CoreLocation
import Foundation
import HealthKit

/// The watch's recording: an outdoor-run `HKWorkoutSession` (it keeps the app running with the wrist down) and the
/// position once a second; the route is also written to HealthKit with the workout.
final class WorkoutRecorder: NSObject, CLLocationManagerDelegate, HKWorkoutSessionDelegate {
    private let health = HKHealthStore()
    private let manager = CLLocationManager()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var route: HKWorkoutRouteBuilder?
    private var buffer: [CLLocation] = []
    private var lastSecond: Int64 = 0
    private(set) var active = false

    var onFix: ((TrackFix) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .fitness
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
    }

    func authorize(done: @escaping (Bool) -> Void) {
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        guard HKHealthStore.isHealthDataAvailable() else {
            done(false)
            return
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKSeriesType.workoutRoute()]
        health.requestAuthorization(toShare: share, read: nil) { ok, _ in
            DispatchQueue.main.async { done(ok) }
        }
    }

    func start() {
        guard !active else { return }
        active = true
        lastSecond = 0
        buffer = []
        let cfg = HKWorkoutConfiguration()
        cfg.activityType = .running
        cfg.locationType = .outdoor
        if HKHealthStore.isHealthDataAvailable(), let s = try? HKWorkoutSession(healthStore: health, configuration: cfg) {
            session = s
            s.delegate = self
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: health, workoutConfiguration: cfg)
            builder = b
            route = HKWorkoutRouteBuilder(healthStore: health, device: nil)
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
        }
        manager.startUpdatingLocation()
    }

    func stop() {
        guard active else { return }
        active = false
        manager.stopUpdatingLocation()
        flushRoute()
        guard let s = session, let b = builder else { return }
        let routeBuilder = route
        session = nil
        builder = nil
        route = nil
        let end = Date()
        s.end()
        b.endCollection(withEnd: end) { _, _ in
            b.finishWorkout { workout, _ in
                if let workout, let routeBuilder {
                    routeBuilder.finishRoute(with: workout, metadata: nil) { _, _ in }
                }
            }
        }
    }

    private func flushRoute() {
        guard let route, !buffer.isEmpty else {
            buffer = []
            return
        }
        let points = buffer
        buffer = []
        route.insertRouteData(points) { _, _ in }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active else { return }
        for loc in locations where loc.horizontalAccuracy >= 0 {
            let second = Int64(floor(loc.timestamp.timeIntervalSince1970))
            if second <= lastSecond { continue }
            lastSecond = second
            buffer.append(loc)
            onFix?(TrackFix(time: loc.timestamp, latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude,
                            accuracy: loc.horizontalAccuracy, altitude: loc.verticalAccuracy >= 0 ? loc.altitude : nil))
        }
        if buffer.count >= 30 { flushRoute() }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                        from fromState: HKWorkoutSessionState, date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
}
