import SwiftUI

/// « Ma course »: the run, the first name given to the people invited, who follows me, my runs, the zone, the two-minute
/// test, the link to Ozimut, and « Effacer mes données » (docs/track/ozitrac.md « The apps »).
struct MeView: View {
    @EnvironmentObject var m: AppModel
    @State private var asking = false
    @State private var afterName: (() -> Void)?
    @State private var removing: ChannelStore.Watcher?
    @State private var unlinking = false
    @State private var erasing = false

    var body: some View {
        List {
            Section {
                if m.status.phase != .idle {
                    TimelineView(.periodic(from: .now, by: 1)) { ctx in
                        Text(m.status.phase == .ending ? L("run.ending")
                             : L("home.running", Fmt.clock(ctx.date.timeIntervalSince(m.status.started ?? ctx.date)),
                                 Fmt.distance(m.status.distance)))
                            .font(.headline)
                            .monospacedDigit()
                    }
                    Button(action: { m.page = .tracker }) {
                        Text(L("home.openRun")).font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                } else {
                    Button(action: { m.page = .tracker }) {
                        Text(L("home.start")).font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
                Text(m.myName.isEmpty ? L("home.noName") : L("home.name", m.myName))
                    .font(.callout)
                    .foregroundColor(.secondary)
                Button(L("home.changeName")) { askName(force: true) {} }
            }
            .listRowSeparator(.hidden)

            Section(L("watchers.title")) {
                if m.watchers.isEmpty {
                    Text(L("watchers.none")).foregroundColor(.secondary)
                }
                ForEach(m.watchers) { w in
                    HStack {
                        Text(w.name?.isEmpty == false ? w.name! : L("watchers.unknown"))
                        Spacer()
                        Button(L("watchers.remove"), role: .destructive) { removing = w }
                            .buttonStyle(.borderless)
                    }
                }
                Button(action: { askName(force: false) { m.page = .invite } }) {
                    Label(L("watchers.add"), systemImage: "qrcode")
                }
            }

            Section {
                Button(action: { m.page = .runs }) {
                    Label(L("runs.title"), systemImage: "list.bullet.rectangle")
                }
                Button(action: { m.page = .zone }) {
                    let z = Zone.current
                    Label(z.on && z.placed ? L("zone.on", z.r) : L("zone.off"), systemImage: "circle.dashed")
                }
                Button(action: { m.page = .selfTest }) {
                    Label(L("start.test"), systemImage: "stopwatch")
                }
            }

            Section(L("oz.title")) {
                if m.linked {
                    Text(L("oz.linked", m.account?.name ?? ""))
                    Text(L("oz.linkedText")).font(.footnote).foregroundColor(.secondary)
                    Button(L("oz.unlink"), role: .destructive) { unlinking = true }
                } else {
                    Text(L("oz.text")).font(.footnote).foregroundColor(.secondary)
                    Button(L("oz.link")) { m.page = .pair }
                }
            }

            Section(L("data.title")) {
                Text(L("data.text")).font(.footnote).foregroundColor(.secondary)
                Button(L("data.erase"), role: .destructive) { erasing = true }
            }
        }
        .navigationTitle("Ozitrac")
        .refreshable { await m.channel.refresh() }
        .onAppear { m.refreshInBackground() }
        .sheet(isPresented: $asking) {
            NameSheet(then: { afterName?() }).environmentObject(m)
        }
        .confirmationDialog(L("watchers.removeAsk", removing?.name ?? "?"), isPresented: Binding(
            get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button(L("watchers.remove"), role: .destructive) {
                if let w = removing { m.removeWatcher(w.w) }
                removing = nil
            }
            Button(L("common.cancel"), role: .cancel) { removing = nil }
        }
        .confirmationDialog(L("oz.unlinkAsk"), isPresented: $unlinking, titleVisibility: .visible) {
            Button(L("oz.unlink"), role: .destructive) { m.unlink() }
            Button(L("common.cancel"), role: .cancel) {}
        }
        .confirmationDialog(L("data.eraseAsk"), isPresented: $erasing, titleVisibility: .visible) {
            Button(L("data.erase"), role: .destructive) { m.eraseRelayData() }
            Button(L("common.cancel"), role: .cancel) {}
        }
    }

    /// The first name, asked when it is missing (or to change it), then `then`.
    private func askName(force: Bool, then: @escaping () -> Void) {
        if !force && !m.myName.isEmpty {
            then()
            return
        }
        afterName = then
        asking = true
    }
}
