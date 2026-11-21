import ActivityKit
import Foundation

/// The Live Activity of a run: the clock runs from `started` on the lock screen by itself; the distance and the
/// fixes waiting are updated by the app.
struct TrackActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distance: Double
        var pending: Int
        var help: Bool
    }

    var name: String
    var started: Date
}
