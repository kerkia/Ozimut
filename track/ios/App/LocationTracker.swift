import CoreLocation
import Foundation

/// The phone's position during a run (and the two-minute test), one fix a second.
///
/// CLLocationManager with background updates rather than `CLLocationUpdate.liveUpdates`: on iOS 17 the live
/// updates pause while the phone does not move (« isStationary ») and their cadence is the system's, while the
/// manager with `pausesLocationUpdatesAutomatically = false` and no distance filter keeps one fix a second, the
/// contract's rule 4, and is the long-proven way for workout apps. A `CLBackgroundActivitySession` is held for the
/// whole run too (iOS 17+): with the « When In Use » authorisation it keeps the session alive in the background.
///
/// A long run (docs/track/ozitrac.md « Pace ») asks the system for less (`setSaving`: 10 m accuracy) and keeps one fix every
/// 15-60 s (RunCoordinator drops the others). The updates themselves go on, without a distance filter: stopping them would
/// let the system suspend the app between fixes, and a runner standing still must still give a fix now and then (standing
/// still is told from the fixes).
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
        setSaving(false)
    }

    /// A long run's own pace (true: 10 m asked of the system) or Direct (false: the best accuracy). May change during a run.
    func setSaving(_ on: Bool) {
        manager.desiredAccuracy = on ? kCLLocationAccuracyNearestTenMeters : kCLLocationAccuracyBest
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
