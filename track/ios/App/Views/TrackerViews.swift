import CoreLocation
import SwiftUI

/// The native tracker: Pair, Start, Running, Ended and the two-minute test.
struct TrackerFlowView: View {
    @EnvironmentObject var m: AppModel
    let closable: Bool

    var body: some View {
        NavigationStack {
            content
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if closable && m.status.phase == .idle {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(L("common.close")) {
                                m.closeSelfTest()
                                m.showTracker = false
                            }
                        }
                    }
                }
        }
    }

    @ViewBuilder private var content: some View {
        if m.screen == .selfTest {
            SelfTestView()
        } else if m.status.phase != .idle {
            RunningView()
        } else if let e = m.ended {
            EndedView(status: e.status, reason: e.reason)
        } else if !m.paired {
            PairView()
        } else {
            StartView()
        }
    }
}

// MARK: Start

struct StartView: View {
    @EnvironmentObject var m: AppModel
    @State private var confirmUnpair = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(m.account?.name ?? "").font(.largeTitle.bold())
                    Text(m.watchers.isEmpty ? L("start.nobody") : L("start.followedBy", m.watchers.joined(separator: ", ")))
                        .foregroundColor(.secondary)
                }

                VStack(spacing: 10) {
                    InfoRow(icon: "location", title: L("start.gps"), value: gpsText, ok: gpsOK)
                    InfoRow(icon: "antenna.radiowaves.left.and.right", title: L("start.network"),
                            value: m.status.online ? L("start.network.on") : L("start.network.off"), ok: m.status.online)
                    InfoRow(icon: "battery.75", title: L("start.battery"),
                            value: m.battery.map { "\($0) %" } ?? "–", ok: (m.battery ?? 100) >= 20)
                }

                Toggle(L("start.share"), isOn: $m.share)

                Button(action: { m.startRun() }) {
                    Text(L("start.go"))
                        .font(.title2.bold())
                        .frame(maxWidth: .infinity, minHeight: 64)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(m.location.denied)

                Text(L("start.privacy")).font(.footnote).foregroundColor(.secondary)

                Divider()

                Button(L("start.test")) { m.screen = .selfTest }
                if m.watchAvailable {
                    Button(L("start.watch")) { m.pairWatch() }
                    if let w = m.watchState { Text(w).font(.footnote).foregroundColor(.secondary) }
                }
                if m.location.denied {
                    Button(L("start.settings")) {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }
                Button(L("start.unpair"), role: .destructive) { confirmUnpair = true }
                    .font(.footnote)
            }
            .padding()
        }
        .navigationTitle(L("start.title"))
        .onAppear { m.location.probe() }
        .confirmationDialog(L("start.unpair.confirm"), isPresented: $confirmUnpair, titleVisibility: .visible) {
            Button(L("start.unpair"), role: .destructive) { m.unpair() }
            Button(L("common.cancel"), role: .cancel) {}
        }
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
                        HStack(spacing: 16) {
                            Label("\(m.status.pending)", systemImage: "tray.and.arrow.up")
                                .accessibilityLabel(L("run.pending"))
                            Text(sentText(now: ctx.date))
                        }
                        .font(.footnote)
                        .foregroundColor(.secondary)
                    }
                }

                if !m.status.online {
                    Text(L("run.offline")).font(.footnote).foregroundColor(.orange)
                }

                if m.status.phase == .ending {
                    ProgressView(L("run.ending"))
                } else {
                    HoldButton(title: L("run.stop"), action: { m.stopRun() })
                    Text(L("run.stop.hint")).font(.footnote).foregroundColor(.secondary)

                    Button(action: { confirmHelp = true }) {
                        Label(L("run.help"), systemImage: "exclamationmark.triangle.fill")
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                }

                if m.status.helpAt != nil {
                    Text(L("run.help.sent")).font(.headline).foregroundColor(.red)
                }
                if let call = m.settings.call, m.status.helpAt != nil,
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
            if let why = reasonText { Text(why).foregroundColor(.secondary) }
            VStack(spacing: 10) {
                InfoRow(icon: "clock", title: L("end.duration"),
                        value: Fmt.clock(Date().timeIntervalSince(status.started ?? Date())), ok: true)
                InfoRow(icon: "point.topleft.down.to.point.bottomright.curvepath", title: L("run.distance"),
                        value: Fmt.distance(status.distance), ok: true)
                InfoRow(icon: "mappin.and.ellipse", title: L("end.fixes"), value: "\(status.fixes)", ok: true)
            }
            Button(L("end.done")) { m.dismissEnded() }
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private var reasonText: String? {
        switch reason {
        case .user: return nil
        case .cap: return L("end.reason.cap")
        case .remote: return L("end.reason.remote")
        case .closed: return L("end.reason.closed")
        }
    }
}

// MARK: Pair

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
                    .onChange(of: code) { v in
                        let n = PairCode.normalise(v)
                        if n != v { code = n }
                    }
                Button(action: { m.pair(code: code, signInWeb: true) }) {
                    if m.pairing { ProgressView() } else { Text(L("pair.go")).frame(maxWidth: .infinity) }
                }
                .buttonStyle(.bordered)
                .disabled(code.count != 8 || m.pairing)

                if let e = m.pairError { Text(e).foregroundColor(.red) }
            }
            .padding()
        }
        .navigationTitle(L("pair.title"))
        .sheet(isPresented: $scanning) {
            QRScannerView(onCode: { text in
                scanning = false
                m.pair(code: text, signInWeb: true)
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
                Button(L("test.back")) { m.closeSelfTest() }
            }
            .padding()
        }
        .navigationTitle(L("test.title"))
    }
}
