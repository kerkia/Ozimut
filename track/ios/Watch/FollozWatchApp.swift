import SwiftUI

@main
struct FollozWatchApp: App {
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
        } else {
            switch m.page {
            case .home: WatchHomeView()
            case .name: WatchNameView()
            case .invite: WatchInviteView()
            case .watchers: WatchWatchersView()
            case .claim: WatchClaimView()
            }
        }
    }
}

struct WatchHomeView: View {
    @EnvironmentObject var m: WatchModel

    private var followers: [String] {
        m.watchers.filter { $0.key != nil }.map { $0.name?.isEmpty == false ? $0.name! : L("watchers.unknown") }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Button(action: { m.start() }) {
                    Text(L("start.go")).font(.title3.bold()).frame(maxWidth: .infinity)
                }
                .tint(.green)
                Text(followers.isEmpty ? L("watch.nobody") : L("start.followedBy", followers.joined(separator: ", ")))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                if m.linked {
                    Text(L("watch.ozLinked", m.account?.name ?? "")).font(.footnote).multilineTextAlignment(.center)
                }
                if let msg = m.message {
                    Text(msg).font(.footnote).foregroundColor(.orange).multilineTextAlignment(.center)
                }
                Button(L("watchers.add")) {
                    if m.myName.isEmpty { m.page = .name } else { m.makeInvite() }
                }
                Button(L("watchers.title")) {
                    m.refreshWatchers()
                    m.page = .watchers
                }
                if m.linked {
                    HoldButton(title: L("watch.ozUnlink"), seconds: 2, size: 80, color: .gray, action: { m.unlink() })
                } else {
                    Button(L("oz.link")) { m.beginClaim() }
                }
                Button(L("home.changeName")) { m.page = .name }.font(.footnote)
                Text(L("start.privacy")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
        }
        .onAppear { m.refreshWatchers() }
    }
}

struct WatchNameView: View {
    @EnvironmentObject var m: WatchModel
    @State private var name = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(L("name.title")).font(.headline)
                Text(L("watch.nameText")).font(.footnote).multilineTextAlignment(.center)
                TextField(L("name.hint"), text: $name)
                Button(L("common.ok")) {
                    m.setName(name)
                    if m.myName.isEmpty { return }
                    m.page = .home
                }
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                Button(L("test.back")) { m.page = .home }
            }
        }
        .onAppear { name = m.myName }
    }
}

struct WatchInviteView: View {
    @EnvironmentObject var m: WatchModel

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text(L("watch.qrTitle")).font(.footnote).multilineTextAlignment(.center)
                if let link = m.inviteLink {
                    QRView(text: link).frame(maxWidth: .infinity)
                    Text(L("watch.qrOnce")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                } else if m.inviteFailed {
                    Text(L("net.error")).font(.footnote).foregroundColor(.red).multilineTextAlignment(.center)
                    Button(L("retry")) { m.makeInvite() }
                } else {
                    ProgressView()
                    Text(L("invite.making")).font(.footnote)
                }
                Button(L("invite.done")) {
                    m.refreshWatchers()
                    m.page = .home
                }
            }
        }
    }
}

struct WatchWatchersView: View {
    @EnvironmentObject var m: WatchModel
    @State private var removing: ChannelStore.Watcher?

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text(L("watchers.title")).font(.headline)
                if m.watchers.isEmpty {
                    Text(L("watch.nobody")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                }
                ForEach(m.watchers) { w in
                    Button(action: { removing = w }) {
                        HStack {
                            Text(w.name?.isEmpty == false ? w.name! : L("watchers.unknown"))
                            Spacer()
                            Image(systemName: "xmark.circle").foregroundColor(.red)
                        }
                    }
                }
                Button(L("test.back")) { m.page = .home }
            }
        }
        .confirmationDialog(L("watchers.removeAsk", removing?.name ?? "?"), isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button(L("watchers.remove"), role: .destructive) {
                if let w = removing { m.removeWatcher(w.w) }
                removing = nil
            }
            Button(L("common.cancel"), role: .cancel) { removing = nil }
        }
    }
}

struct WatchClaimView: View {
    @EnvironmentObject var m: WatchModel

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(L("watch.code.title")).font(.headline)
                Text(m.claimCode)
                    .font(.system(size: 30, weight: .bold, design: .monospaced))
                    .minimumScaleFactor(0.6)
                    .foregroundColor(.orange)
                Text(L("watch.code.help"))
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                if let msg = m.message {
                    Text(msg).font(.footnote).foregroundColor(.red).multilineTextAlignment(.center)
                }
                Button(L("test.back")) { m.endClaim() }
            }
        }
    }
}

struct WatchRunningView: View {
    @EnvironmentObject var m: WatchModel

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
                    if !m.status.dests.isEmpty {
                        HoldButton(title: L("watch.help"), size: 70, color: .orange, action: { m.help() })
                    }
                    if m.status.helpAt != nil {
                        Text(L("run.help.sent")).font(.footnote).foregroundColor(.red)
                    }
                }
            }
        }
    }

    private func sentText(now: Date) -> String {
        if m.status.dests.isEmpty { return L("watch.local") }
        guard let s = m.status.lastSent else { return L("watch.never") }
        return L("watch.sent", max(0, Int(now.timeIntervalSince(s))))
    }
}

struct WatchEndedView: View {
    @EnvironmentObject var m: WatchModel
    let status: TrackStatus

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text(L("end.title")).font(.headline)
                Text(Fmt.distance(status.distance)).monospacedDigit()
                Text(L("watch.fixes", status.fixes)).font(.footnote)
                Text(L("watch.kept")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                Button(L("end.done")) { m.ended = nil }
            }
        }
    }
}
