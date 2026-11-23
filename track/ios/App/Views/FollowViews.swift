import SwiftUI

/// « En course depuis 12 min · position il y a 20 s · batterie 54 % », « Course terminée à 14:32 », « Pas de course ».
func followStateLine(_ r: FollowRun?) -> String {
    guard let r, !r.run.isEmpty else { return L("follow.noRun") }
    var bits: [String] = []
    if r.state == "end" {
        bits.append(L("follow.ended", Fmt.time(r.last > 0 ? r.last : r.started)))
    } else {
        bits.append(L("follow.running", Fmt.since(r.started)))
        let lastFix = r.fixes.last?.t ?? r.last
        if lastFix > 0 { bits.append(L("follow.position", Fmt.since(lastFix))) }
    }
    if let b = r.bat { bits.append(L("follow.battery", b)) }
    return bits.joined(separator: " · ")
}

/// An alert's sentence, the person's name in it (the notification extension words them alike).
func alertText(name: String, kind: String) -> String {
    let n = name.isEmpty ? "?" : name
    switch kind {
    case "start", "end", "help", "silent", "battery", "still", "zone": return L("alert." + kind, n)
    default: return L("alert.other", n)
    }
}

/// « Je suis »: the people followed, each with their run's state; « Scanner un code » to follow someone more.
struct FollowListView: View {
    @EnvironmentObject var m: AppModel
    @State private var scanning = false
    @State private var cameraDenied = false
    @State private var tick = 0

    var body: some View {
        List {
            Section {
                Button(action: { scanning = true }) {
                    Label(L("follow.scan"), systemImage: "qrcode.viewfinder")
                        .font(.title3.bold())
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
                if cameraDenied { Text(L("follow.cameraDenied")).font(.footnote).foregroundColor(.orange) }
            }
            .listRowSeparator(.hidden)
            Section {
                if m.followed.isEmpty {
                    Text(L("follow.none")).foregroundColor(.secondary)
                }
                ForEach(m.followed) { f in
                    Button(action: { m.page = .follow(f.c) }) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(f.name.isEmpty ? "?" : f.name).font(.headline).foregroundColor(.primary)
                            Text(followStateLine(m.follows.cached(f.c))).font(.callout).foregroundColor(.secondary)
                        }
                        .id(tick)
                    }
                }
            }
        }
        .navigationTitle(L("tab.follow"))
        .task {
            // the states read again every minute while this tab shows
            while !Task.isCancelled {
                for f in m.follows.list { _ = await m.follows.poll(f) }
                tick += 1
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
        .sheet(isPresented: $scanning) {
            QRScannerView(accept: { Codes.parse($0) != nil }, onCode: { text in
                scanning = false
                if let link = Codes.parse(text) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { m.open(link: link) }
                }
            }, onDenied: {
                scanning = false
                cameraDenied = true
            })
            .ignoresSafeArea()
        }
    }
}

/// A person followed, live: their run read every `next` seconds while this page shows, their trail and position on the
/// map, their alerts, « Enregistrer en GPX » of what was received, « Ne plus suivre ».
struct FollowView: View {
    @EnvironmentObject var m: AppModel
    let c: String
    @State private var run: FollowRun?
    @State private var sharing: Shared?
    @State private var stopping = false
    @State private var working = false

    private var follow: Follow? { m.followed.first { $0.c == c } }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text(followStateLine(run)).font(.callout).foregroundColor(.secondary)
                ForEach(Array((run?.alerts ?? []).suffix(3).reversed().enumerated()), id: \.offset) { _, a in
                    let urgent = a.kind == "help" || a.kind == "silent" || a.kind == "zone"
                    Text(Fmt.time(a.t) + " · " + alertText(name: follow?.name ?? "", kind: a.kind))
                        .font(.callout.weight(urgent ? .bold : .regular))
                        .foregroundColor(urgent ? .red : .primary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
            .padding(.bottom, 8)

            LiveMap(trail: run?.fixes ?? [], position: run?.fixes.last, fitKey: run?.run ?? "")

            HStack(spacing: 10) {
                Button(action: saveGpx) {
                    Label(L("follow.gpx"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                Button(role: .destructive, action: { stopping = true }) {
                    Text(L("follow.stop")).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(working)
            }
            .padding()
        }
        .navigationTitle(follow?.name.isEmpty == false ? follow!.name : "?")
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .onAppear { run = m.follows.cached(c) }
        .task {
            while !Task.isCancelled {
                guard let f = m.follows.get(c) else { return }
                let p = await m.follows.poll(f)
                if p.error == "gone" {
                    m.notice = L("follow.gone")
                    m.page = nil
                    return
                }
                run = p.run
                try? await Task.sleep(nanoseconds: UInt64(p.next) * 1_000_000_000)
            }
        }
        .sheet(item: $sharing) { s in ShareSheet(items: s.items) }
        .confirmationDialog(L("follow.stopAsk", follow?.name ?? "?"), isPresented: $stopping, titleVisibility: .visible) {
            Button(L("follow.stop"), role: .destructive, action: unfollow)
            Button(L("common.cancel"), role: .cancel) {}
        }
    }

    private func saveGpx() {
        let fixes = m.follows.cached(c)?.fixes ?? []
        guard let first = fixes.first else {
            m.notice = L("follow.nothing")
            return
        }
        let name = (follow?.name.isEmpty == false ? follow!.name : "Ozitrac") + " " + Fmt.dateTime(first.t)
        if let url = RunLog.gpxFile(name: name, fixes: fixes) { sharing = Shared(items: [url]) }
    }

    private func unfollow() {
        guard let f = follow else { return }
        working = true
        Task {
            let ok = await m.unfollow(f)
            await MainActor.run {
                working = false
                if ok { m.page = nil } else { m.notice = L("net.error") }
            }
        }
    }
}

/// Follows someone from their code (`https://ozimut.com/z/<c>#…` opened or scanned): asks this iPhone's first name once,
/// joins the channel, then shows the person's map.
struct JoinView: View {
    @EnvironmentObject var m: AppModel
    let link: Codes.Link
    @State private var working = false
    @State private var error: String?
    @State private var asking = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(L("join.text", link.name.isEmpty ? "?" : link.name)).font(.title3)
            Button(action: {
                if m.myName.isEmpty {
                    asking = true
                } else {
                    join()
                }
            }) {
                if working {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 48)
                } else {
                    Text(L("join.go")).font(.title3.bold()).frame(maxWidth: .infinity, minHeight: 48)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .disabled(working)
            if let error { Text(error).foregroundColor(.red) }
            Spacer()
        }
        .padding()
        .navigationTitle(L("join.title"))
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .sheet(isPresented: $asking) {
            NameSheet(then: join).environmentObject(m)
        }
    }

    private func join() {
        working = true
        error = nil
        Task {
            let err = await m.join(link)
            await MainActor.run {
                working = false
                switch err {
                case nil: break
                case "code"?: error = L("join.err.code")
                case "gone"?: error = L("join.err.gone")
                case "many"?: error = L("pair.error.many")
                default: error = L("net.error")
                }
            }
        }
    }
}
