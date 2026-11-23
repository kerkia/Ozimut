import ActivityKit
import Foundation

/// The run's Live Activity (lock screen, Dynamic Island). Updated at most every 15 s by the app; the clock runs
/// on its own from the start time.
final class LiveActivityController {
    private var activity: Activity<TrackActivityAttributes>?
    private var lastUpdate = Date.distantPast
    private var lastState: TrackActivityAttributes.ContentState?

    func start(name: String, started: Date) {
        let name = name.isEmpty ? "Ozitrac" : name
        if activity == nil { activity = Activity<TrackActivityAttributes>.activities.first }
        if activity != nil { return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attrs = TrackActivityAttributes(name: name, started: started)
        let state = TrackActivityAttributes.ContentState(distance: 0, pending: 0, help: false)
        activity = try? Activity.request(attributes: attrs, content: ActivityContent(state: state, staleDate: nil), pushType: nil)
    }

    func update(_ s: TrackStatus) {
        guard let activity else { return }
        let state = TrackActivityAttributes.ContentState(distance: s.distance, pending: s.pending, help: s.helpAt != nil)
        let now = Date()
        let urgent = state.help != (lastState?.help ?? false)
        if !urgent && now.timeIntervalSince(lastUpdate) < 15 { return }
        if state == lastState { return }
        lastUpdate = now
        lastState = state
        Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
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
