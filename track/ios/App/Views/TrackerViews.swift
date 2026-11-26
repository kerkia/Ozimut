import CoreLocation
import SwiftUI

/// The run's screens over the tabs: Start, Running, Ended; and the two-minute test.
struct TrackerFlowView: View {
    @EnvironmentObject var m: AppModel
    let page: Page

    var body: some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if m.status.phase == .idle {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(L("common.close")) {
                                if page == .selfTest { m.closeSelfTest() }
                                m.dismissEnded()
                                m.page = nil
                            }
                        }
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        if page == .selfTest {
            SelfTestView()
        } else if m.status.phase != .idle {
            RunningView()
        } else if let e = m.ended {
            EndedView(status: e.status, reason: e.reason)
        } else {
            StartView()
        }
    }
}

/// Who the run goes to: the people who follow, the Ozimut account, or this iPhone only.
func destinationsText(watchers: [ChannelStore.Watcher], share: Bool, linked: Bool) -> String {
    var lines: [String] = []
    let names = watchers.filter { $0.key != nil }.map { $0.name?.isEmpty == false ? $0.name! : L("watchers.unknown") }
    if share && !names.isEmpty { lines.append(L("start.followedBy", names.joined(separator: ", "))) }
    if linked { lines.append(L("tr.followedOzimut")) }
    if lines.isEmpty { lines.append(share ? L("tr.followedNobody") : L("tr.local")) }
    return lines.joined(separator: "\n")
}

/// A long run's pace for the runner (docs/track/folloz.md « Pace »): « Course longue : une position toutes les 30 s, envoi
/// toutes les 10 min », « En direct jusqu'à 14:35 (demandé par Tom) », and a request refused; nil in a Direct run.
func runnerPaceLine(_ p: PaceState?, watchers: [ChannelStore.Watcher], now: Date = Date()) -> String? {
    guard let p, p.choice.long else { return nil }
    let t = Int64(now.timeIntervalSince1970)
    func name(_ w: String) -> String {
        if let n = watchers.first(where: { $0.w == w })?.name, !n.isEmpty { return n }
        return L("watchers.unknown")
    }
    if p.boosted(now: t), let b = p.boost {
        return L("pace.boost.by", Fmt.time(b.until), name(b.by))
    }
    var line = L("pace.longLine", Fmt.span(p.choice.fix), Fmt.span(p.choice.send))
    if p.refused, let r = p.last, r.until > t {
        line += "\n" + L("pace.refused", name(r.by))
    }
    return line
}

// MARK: Start

struct StartView: View {
    @EnvironmentObject var m: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(destinationsText(watchers: m.watchers, share: m.share, linked: m.linked))
                    .foregroundColor(.secondary)

                VStack(spacing: 10) {
                    InfoRow(icon: "location", title: L("start.gps"), value: gpsText, ok: gpsOK)
                    InfoRow(icon: "antenna.radiowaves.left.and.right", title: L("start.network"),
                            value: m.status.online ? L("start.network.on") : L("start.network.off"), ok: m.status.online)
                    InfoRow(icon: "battery.75", title: L("start.battery"),
                            value: m.battery.map { "\($0) %" } ?? "–", ok: (m.battery ?? 100) >= 20)
                }

                Toggle(L("start.share"), isOn: $m.share)

                PaceChooser()

                Button(action: { m.startRun() }) {
                    Text(L("start.go"))
                        .font(.title2.bold())
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(m.location.denied)

                Text(L("start.privacy")).font(.footnote).foregroundColor(.secondary)

                if m.location.denied {
                    Button(L("start.settings")) {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }
            }
            .padding()
        }
        .navigationTitle(L("start.title"))
        .onAppear { m.location.probe() }
    }

    private var gpsOK: Bool {
        _ = m.locationChanged
        if m.location.denied || !m.location.precise { return false }
        if let p = m.probe { return p.horizontalAccuracy >= 0 && p.horizontalAccuracy <= 20 }
        return true
    }

    private var gpsText: String {
        _ = m.locationChanged
        if m.location.denied { return L("start.gps.off") }
        if m.location.authorization == .notDetermined { return L("start.gps.ask") }
        if !m.location.precise { return L("start.gps.reduced") }
        if let p = m.probe, p.horizontalAccuracy >= 0 { return L("start.gps.ok", Int(p.horizontalAccuracy.rounded())) }
        return L("start.gps.ready")
    }
}

/// « Direct » or « Course longue » with its two intervals and « Mes suiveurs peuvent passer en direct » (the choices kept
/// for the next run).
struct PaceChooser: View {
    @EnvironmentObject var m: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker(L("pace.title"), selection: $m.pace.long) {
                Text(L("pace.live")).tag(false)
                Text(L("pace.long")).tag(true)
            }
            .pickerStyle(.segmented)
            if m.pace.long {
                Text(L("pace.fixEvery")).font(.subheadline)
                Picker(L("pace.fixEvery"), selection: $m.pace.fix) {
                    ForEach(PaceChoice.fixes, id: \.self) { s in Text(Fmt.span(s)).tag(s) }
                }
                .pickerStyle(.segmented)
                Text(L("pace.sendEvery")).font(.subheadline)
                Picker(L("pace.sendEvery"), selection: $m.pace.send) {
                    ForEach(PaceChoice.sends, id: \.self) { s in Text(Fmt.span(s)).tag(s) }
                }
                .pickerStyle(.segmented)
                Toggle(L("pace.remote"), isOn: $m.pace.remote)
                Text(L("pace.long.text")).font(.footnote).foregroundColor(.secondary)
            } else {
                Text(L("pace.live.text")).font(.footnote).foregroundColor(.secondary)
            }
        }
    }
}

struct InfoRow: View {
    let icon: String
    let title: String
    let value: String
    let ok: Bool

    var body: some View {
        HStack(alignment: .top) {
            Image(systemName: icon).frame(width: 24)
            Text(title).fontWeight(.semibold)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
                .foregroundColor(ok ? .primary : .orange)
        }
        .font(.callout)
    }
}

// MARK: Running

struct RunningView: View {
    @EnvironmentObject var m: AppModel
    @State private var confirmHelp = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    VStack(spacing: 6) {
                        Text(Fmt.clock(ctx.date.timeIntervalSince(m.status.started ?? ctx.date)))
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .monospacedDigit()
                        Text(Fmt.distance(m.status.distance)).font(.title2).monospacedDigit()
                        if !m.status.dests.isEmpty {
                            HStack(spacing: 16) {
                                Label("\(m.status.pending)", systemImage: "tray.and.arrow.up")
                                    .accessibilityLabel(L("run.pending"))
                                Text(sentText(now: ctx.date))
                            }
                            .font(.footnote)
                            .foregroundColor(.secondary)
                        }
                    }
                }

                Text(runText).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)

                if let pace = runnerPaceLine(m.status.pace, watchers: m.watchers) {
                    Text(pace)
                        .font(.callout)
                        .foregroundColor(m.status.pace?.boosted(now: Int64(Date().timeIntervalSince1970)) == true ? .orange : .primary)
                        .multilineTextAlignment(.center)
                }

                if !m.status.online && !m.status.dests.isEmpty {
                    Text(L("run.offline")).font(.footnote).foregroundColor(.orange)
                }

                if m.status.phase == .ending {
                    ProgressView(L("run.ending"))
                } else {
                    HoldButton(title: L("run.stop"), action: { m.stopRun() })
                    Text(L("run.stop.hint")).font(.footnote).foregroundColor(.secondary)

                    if !m.status.dests.isEmpty {
                        Button(action: { confirmHelp = true }) {
                            Label(L("run.help"), systemImage: "exclamationmark.triangle.fill")
                                .frame(maxWidth: .infinity, minHeight: 48)
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                    }
                }

                if m.status.helpAt != nil {
                    Text(L("run.help.sent")).font(.headline).foregroundColor(.red)
                }
                if m.linked, let call = m.settings.call, m.status.helpAt != nil,
                   let url = URL(string: "tel:" + call.filter { "+0123456789".contains($0) }) {
                    Link(destination: url) {
                        Label(L("run.call", call), systemImage: "phone.fill")
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }

                Text(L("run.keepApp")).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            }
            .padding()
        }
        .navigationTitle(L("run.title"))
        .confirmationDialog(L("run.help.confirm"), isPresented: $confirmHelp, titleVisibility: .visible) {
            Button(L("run.help.send"), role: .destructive) { m.help() }
            Button(L("common.cancel"), role: .cancel) {}
        }
    }

    private var runText: String {
        let d = m.status.dests
        var lines: [String] = []
        if d.contains(RunCoordinator.relay) {
            let names = m.watchers.filter { $0.key != nil }.map { $0.name?.isEmpty == false ? $0.name! : L("watchers.unknown") }
            lines.append(names.isEmpty ? L("tr.followedNobody") : L("start.followedBy", names.joined(separator: ", ")))
        }
        if d.contains(RunCoordinator.oz) { lines.append(L("tr.followedOzimut")) }
        if lines.isEmpty { lines.append(L("tr.local")) }
        return lines.joined(separator: "\n")
    }

    private func sentText(now: Date) -> String {
        guard let s = m.status.lastSent else { return L("run.never") }
        return L("run.lastSent", max(0, Int(now.timeIntervalSince(s))))
    }
}

// MARK: Ended

struct EndedView: View {
    @EnvironmentObject var m: AppModel
    let status: TrackStatus
    let reason: EndReason

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "flag.checkered").font(.system(size: 56)).foregroundColor(.orange)
            Text(L("end.title")).font(.title.bold())
            if let why = reasonText { Text(why).foregroundColor(.secondary).multilineTextAlignment(.center) }
            VStack(spacing: 10) {
                InfoRow(icon: "clock", title: L("end.duration"),
                        value: Fmt.clock(Date().timeIntervalSince(status.started ?? Date())), ok: true)
                InfoRow(icon: "point.topleft.down.to.point.bottomright.curvepath", title: L("run.distance"),
                        value: Fmt.distance(status.distance), ok: true)
                InfoRow(icon: "mappin.and.ellipse", title: L("end.fixes"), value: "\(status.fixes)", ok: true)
            }
            Text(L("tr.kept")).font(.footnote).foregroundColor(.secondary)
            Button(L("runs.title")) {
                m.dismissEnded()
                m.page = .runs
            }
            Button(L("end.done")) {
                m.dismissEnded()
                m.page = nil
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private var reasonText: String? {
        switch reason {
        case .user, .nobody: return nil
        case .cap: return L("end.reason.cap")
        case .remote: return L("end.reason.remote")
        case .closed: return L("end.reason.closed")
        }
    }
}

// MARK: « Relier à Ozimut »

struct PairView: View {
    @EnvironmentObject var m: AppModel
    @State private var code = ""
    @State private var scanning = false
    @State private var cameraDenied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(L("pair.intro"))
                Button(action: { scanning = true }) {
                    Label(L("pair.scan"), systemImage: "qrcode.viewfinder")
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                if cameraDenied { Text(L("pair.camera.denied")).font(.footnote).foregroundColor(.orange) }

                Text(L("pair.type")).font(.headline)
                TextField("K7QM4TXD", text: $code)
                    .font(.system(.title2, design: .monospaced))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: code) { _, v in
                        let n = PairCode.normalise(v)
                        if n != v { code = n }
                    }
                Button(action: { m.pair(code: code) }) {
                    if m.pairing { ProgressView() } else { Text(L("pair.go")).frame(maxWidth: .infinity) }
                }
                .buttonStyle(.bordered)
                .disabled(code.count != 8 || m.pairing)

                if let e = m.pairError { Text(e).foregroundColor(.red) }
            }
            .padding()
        }
        .navigationTitle(L("pair.title"))
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .onAppear { m.pairError = nil }
        .sheet(isPresented: $scanning) {
            QRScannerView(accept: { PairCode.extract($0) != nil }, onCode: { text in
                scanning = false
                m.pair(code: text)
            }, onDenied: {
                scanning = false
                cameraDenied = true
            })
            .ignoresSafeArea()
        }
    }
}

// MARK: the two-minute test

struct SelfTestView: View {
    @EnvironmentObject var m: AppModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(L("test.intro"))
                if m.status.phase != .idle {
                    Text(L("test.busy")).foregroundColor(.orange)
                } else if m.testing {
                    Text(L("test.running", m.testCount, m.testLeft)).font(.title3.monospacedDigit())
                    ProgressView(value: Double(120 - m.testLeft), total: 120)
                    Text(L("run.keepApp")).font(.footnote).foregroundColor(.secondary)
                    Button(L("common.cancel")) { m.endSelfTest() }
                } else if m.testDone {
                    let good = m.testCount >= 100
                    Label(L(good ? "test.good" : "test.bad", m.testCount),
                          systemImage: good ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                        .foregroundColor(good ? .green : .orange)
                    Button(L("test.again")) { m.startSelfTest() }.buttonStyle(.bordered)
                } else {
                    Button(action: { m.startSelfTest() }) {
                        Text(L("test.start")).frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
        }
        .navigationTitle(L("test.title"))
    }
}
