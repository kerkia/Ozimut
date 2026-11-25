import ActivityKit
import Foundation

/// The run's Live Activity (lock screen, Dynamic Island). Updated at most every 15 s by the app (at once for help or a
/// change of pace); the clock runs on its own from the start time. iOS ends a Live Activity after about 8 hours: a long run
/// goes on without it (nothing of the tracking depends on it), and `start` makes a new one when the app comes to the
/// foreground again.
final class LiveActivityController {
    private var activity: Activity<TrackActivityAttributes>?
    private var lastUpdate = Date.distantPast
    private var lastState: TrackActivityAttributes.ContentState?

    private static func alive(_ a: Activity<TrackActivityAttributes>) -> Bool {
        a.activityState != .ended && a.activityState != .dismissed
    }

    /// Shows the run's Live Activity, unless one is already shown (only from the foreground: the system refuses otherwise).
    func start(name: String, started: Date) {
        let name = name.isEmpty ? "Ozitrac" : name
        if let a = activity, !LiveActivityController.alive(a) { activity = nil }
        if activity == nil { activity = Activity<TrackActivityAttributes>.activities.first(where: LiveActivityController.alive) }
        if activity != nil { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attrs = TrackActivityAttributes(name: name, started: started)
        let state = TrackActivityAttributes.ContentState(distance: 0, pending: 0, help: false, pace: nil)
        lastState = nil
        lastUpdate = .distantPast
        activity = try? Activity.request(attributes: attrs, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
    }

    /// `pace`: the run's pace in words (nil in a Direct run).
    func update(_ s: TrackStatus, pace: String?) {
        guard let current = activity else { return }
        if !LiveActivityController.alive(current) {
            // ended by the system (about 8 hours): the run goes on without it
            activity = nil
            lastState = nil
            return
        }
        let state = TrackActivityAttributes.ContentState(distance: s.distance, pending: s.pending, help: s.helpAt != nil, pace: pace)
        let now = Date()
        let urgent = state.help != (lastState?.help ?? false) || state.pace != lastState?.pace
        if !urgent && now.timeIntervalSince(lastUpdate) < 15 { return }
        if state == lastState { return }
        lastUpdate = now
        lastState = state
        Task { await current.update(ActivityContent(state: state, staleDate: nil)) }
    }

    func end() {
        let all = Activity<TrackActivityAttributes>.activities
        activity = nil
        lastState = nil
        for a in all {
            Task { await a.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
