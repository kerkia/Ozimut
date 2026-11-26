import ActivityKit
import SwiftUI
import WidgetKit

@main
struct FollozWidgetBundle: WidgetBundle {
    var body: some Widget {
        TrackLiveActivity()
    }
}

/// The run on the lock screen and in the Dynamic Island: the clock (counted by the system from the start), the
/// distance, the fixes waiting to be sent, and a long run's pace.
struct TrackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrackActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.75))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(timerInterval: context.attributes.started...Date.distantFuture, countsDown: false)
                            .monospacedDigit()
                    } icon: {
                        Image(systemName: "location.fill")
                    }
                    .foregroundColor(.orange)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(km(context.state.distance)).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.help ? NSLocalizedString("live.help", comment: "")
                         : context.state.pace ?? context.attributes.name)
                        .font(.caption)
                        .lineLimit(2)
                        .foregroundColor(context.state.help ? .red : .secondary)
                }
            } compactLeading: {
                Image(systemName: "location.fill").foregroundColor(.orange)
            } compactTrailing: {
                Text(timerInterval: context.attributes.started...Date.distantFuture, countsDown: false)
                    .monospacedDigit()
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: "location.fill").foregroundColor(.orange)
            }
        }
    }
}

private func km(_ metres: Double) -> String {
    String(format: "%.2f km", metres / 1000)
}

struct LockScreenView: View {
    let context: ActivityViewContext<TrackActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            row
            if let pace = context.state.pace {
                Text(pace)
                    .font(.caption)
                    .lineLimit(2)
                    .foregroundColor(.white.opacity(0.85))
            }
        }
        .padding()
    }

    private var row: some View {
        HStack(alignment: .center, spacing: 16) {
            Image(systemName: context.state.help ? "exclamationmark.triangle.fill" : "location.fill")
                .font(.title2)
                .foregroundColor(context.state.help ? .red : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(NSLocalizedString("live.title", comment: ""))
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
                Text(timerInterval: context.attributes.started...Date.distantFuture, countsDown: false)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(km(context.state.distance))
                    .font(.title3.bold())
                    .monospacedDigit()
                    .foregroundColor(.white)
                if context.state.pending > 0 {
                    Text(String(format: NSLocalizedString("live.pending", comment: ""), context.state.pending))
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
            }
        }
    }
}
