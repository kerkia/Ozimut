import CoreLocation
import Foundation

/// The phone's position during a run (and the two-minute test), one fix a second.
///
/// CLLocationManager with background updates rather than `CLLocationUpdate.liveUpdates`: on iOS 17 the live
/// updates pause while the phone does not move (« isStationary ») and their cadence is the system's, while the
/// manager with `pausesLocationUpdatesAutomatically = false` and no distance filter keeps one fix a second, the
/// contract's rule 4, and is the long-proven way for workout apps. A `CLBackgroundActivitySession` is held for the
/// whole run too (iOS 17+): with the « When In Use » authorisation it keeps the session alive in the background.
final class LocationTracker: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var session: CLBackgroundActivitySession?
    private var lastSecond: Int64 = 0
    private var probing = false
    private(set) var active = false

    /// Each new fix (on the main thread; keep it quick).
    var onFix: ((TrackFix) -> Void)?
    /// The authorisation or the accuracy changed.
    var onAuthorization: (() -> Void)?
    /// A single position asked by `probe()` (the Start screen's GPS quality).
    var onProbe: ((CLLocation) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .fitness
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
    }

    var authorization: CLAuthorizationStatus { manager.authorizationStatus }
    var precise: Bool { manager.accuracyAuthorization == .fullAccuracy }
    var denied: Bool { authorization == .denied || authorization == .restricted }

    func requestAuthorization() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
    }

    func start() {
        requestAuthorization()
        if manager.authorizationStatus != .notDetermined && manager.accuracyAuthorization == .reducedAccuracy {
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TrackRun")
        }
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        if session == nil { session = CLBackgroundActivitySession() }
        lastSecond = 0
        active = true
        probing = false
        manager.startUpdatingLocation()
    }

    func stop() {
        active = false
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        session?.invalidate()
        session = nil
    }

    /// One position, for the Start screen (not while running).
    func probe() {
        guard !active, !denied else { return }
        requestAuthorization()
        guard manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways else { return }
        probing = true
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            if !active {
                if probing {
                    probing = false
                    onProbe?(loc)
                }
                continue
            }
            guard loc.horizontalAccuracy >= 0 else { continue }
            let second = Int64(floor(loc.timestamp.timeIntervalSince1970))
            if second <= lastSecond { continue }
            lastSecond = second
            let fix = TrackFix(time: loc.timestamp, latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude,
                               accuracy: loc.horizontalAccuracy, altitude: loc.verticalAccuracy >= 0 ? loc.altitude : nil)
            onFix?(fix)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        probing = false
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if active && manager.accuracyAuthorization == .reducedAccuracy {
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "TrackRun")
        }
        onAuthorization?()
    }
}
