import ActivityKit
import Foundation

/// The Live Activity of a run: the clock runs from `started` on the lock screen by itself; the distance, the fixes waiting
/// to be sent and the pace (« Course longue : … », « En direct jusqu'à 14:35 (demandé par Tom) ») are updated by the app.
/// iOS ends a Live Activity after about 8 hours: the run itself goes on, and the app shows a new one when it is opened.
struct TrackActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distance: Double
        var pending: Int
        var help: Bool
        /// The pace in words, already in the app's language (nil in a Direct run).
        var pace: String?
    }

    var name: String
    var started: Date
}
