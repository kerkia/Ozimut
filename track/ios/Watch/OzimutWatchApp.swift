import SwiftUI

@main
struct OzimutWatchApp: App {
    @StateObject private var model = WatchModel.shared

    var body: some Scene {
        WindowGroup {
            WatchRootView().environmentObject(model)
        }
    }
}

struct WatchRootView: View {
    @EnvironmentObject var m: WatchModel

    var body: some View {
        if m.status.phase != .idle {
            WatchRunningView()
        } else if let e = m.ended {
            WatchEndedView(status: e)
        } else if !m.paired {
            WatchClaimView()
        } else {
            WatchStartView()
        }
    }
}

struct WatchClaimView: View {
    @EnvironmentObject var m: WatchModel

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(L("watch.code.title")).font(.headline)
                if m.busy {
                    ProgressView()
                } else {
                    Text(m.claimCode)
                        .font(.system(size: 30, weight: .bold, design: .monospaced))
                        .minimumScaleFactor(0.6)
                        .foregroundColor(.orange)
                }
                Text(L("watch.code.help"))
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                if let msg = m.message {
                    Text(msg).font(.footnote).foregroundColor(.red).multilineTextAlignment(.center)
                }
            }
        }
    }
}

struct WatchStartView: View {
    @EnvironmentObject var m: WatchModel

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(m.account?.name ?? "").font(.headline)
                Text(m.watchers.isEmpty ? L("start.nobody") : L("start.followedBy", m.watchers.joined(separator: ", ")))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                Button(action: { m.start() }) {
                    Text(L("start.go")).font(.title3.bold()).frame(maxWidth: .infinity)
                }
                .tint(.green)
                Text(L("start.privacy")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                if let msg = m.message {
                    Text(msg).font(.footnote).foregroundColor(.orange).multilineTextAlignment(.center)
                }
            }
        }
    }
}

struct WatchRunningView: View {
    @EnvironmentObject var m: WatchModel
    @State private var helpAsked = false

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(spacing: 2) {
                        Text(Fmt.clock(ctx.date.timeIntervalSince(m.status.started ?? ctx.date)))
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        Text(Fmt.distance(m.status.distance)).font(.footnote).monospacedDigit()
                        Text(sentText(now: ctx.date)).font(.footnote).foregroundColor(.secondary)
                    }
                }
                if m.status.phase == .ending {
                    ProgressView()
                    Text(L("run.ending")).font(.footnote)
                } else {
                    HoldButton(title: L("run.stop"), size: 90, action: { m.stop() })
                    Button(action: {
                        m.help()
                        helpAsked = true
                    }) {
                        Label(L("watch.help"), systemImage: "exclamationmark.triangle.fill")
                    }
                    .tint(.red)
                    if helpAsked || m.status.helpAt != nil {
                        Text(L("run.help.sent")).font(.footnote).foregroundColor(.red)
                    }
                }
            }
        }
    }

    private func sentText(now: Date) -> String {
        guard let s = m.status.lastSent else { return L("watch.never") }
        return L("watch.sent", max(0, Int(now.timeIntervalSince(s))))
    }
}

struct WatchEndedView: View {
    @EnvironmentObject var m: WatchModel
    let status: TrackStatus

    var body: some View {
        VStack(spacing: 8) {
            Text(L("end.title")).font(.headline)
            Text(Fmt.distance(status.distance)).monospacedDigit()
            Text(L("watch.fixes", status.fixes)).font(.footnote)
            Button(L("end.done")) { m.ended = nil }
        }
    }
}
