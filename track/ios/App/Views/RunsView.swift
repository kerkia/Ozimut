import SwiftUI

/// « Mes courses »: the runs kept on this iPhone (and those the Apple Watch sent over), each shared or saved as GPX, seen
/// on the map, deleted.
struct RunsView: View {
    @EnvironmentObject var m: AppModel
    @State private var runs: [RunLog.Info] = []
    @State private var sharing: Shared?
    @State private var exporting = false
    @State private var document = GPXDocument(text: "")
    @State private var exportName = "folloz"
    @State private var deleting: RunLog.Info?
    @State private var seeing: RunLog.Info?

    var body: some View {
        List {
            Section {
                Text(L("runs.text")).font(.footnote).foregroundColor(.secondary)
            }
            if runs.isEmpty {
                Text(L("runs.none")).foregroundColor(.secondary)
            }
            ForEach(runs) { r in
                VStack(alignment: .leading, spacing: 8) {
                    Text(L("runs.line", Fmt.dateTime(r.start), Fmt.distance(r.metres))).font(.headline)
                    HStack(spacing: 6) {
                        Text(Fmt.clock(TimeInterval(r.end - r.start)))
                        if r.fromWatch {
                            Label(L("runs.watch"), systemImage: "applewatch").labelStyle(.titleAndIcon)
                        }
                    }
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    HStack(spacing: 8) {
                        Button(L("runs.view")) { seeing = r }
                        Button(L("runs.share")) { share(r) }
                        Button(L("runs.save")) { save(r) }
                        Spacer()
                        Button(L("runs.delete"), role: .destructive) { deleting = r }
                    }
                    .buttonStyle(.bordered)
                    .font(.callout)
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle(L("runs.title"))
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .onAppear(perform: reload)
        .onChange(of: m.runsChanged) { _, _ in reload() }
        .sheet(item: $sharing) { s in ShareSheet(items: s.items) }
        .sheet(item: $seeing) { r in
            NavigationStack {
                LiveMap(trail: RunLog.read(r.url), position: nil, fitKey: r.run)
                    .ignoresSafeArea(edges: .bottom)
                    .navigationTitle(Fmt.dateTime(r.start))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(L("common.close")) { seeing = nil }
                        }
                    }
            }
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: .gpxFile, defaultFilename: exportName) { result in
            switch result {
            case .success: m.notice = L("runs.saved")
            case .failure: m.notice = L("runs.saveFailed")
            }
        }
        .confirmationDialog(L("runs.deleteAsk"), isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
                            titleVisibility: .visible) {
            Button(L("runs.delete"), role: .destructive) {
                if let r = deleting { RunLog.delete(r.run) }
                deleting = nil
                reload()
            }
            Button(L("common.cancel"), role: .cancel) { deleting = nil }
        }
    }

    private func reload() {
        runs = RunLog.runs()
    }

    private func name(_ r: RunLog.Info) -> String {
        (m.myName.isEmpty ? "Folloz" : m.myName) + " " + Fmt.dateTime(r.start)
    }

    private func share(_ r: RunLog.Info) {
        if let url = RunLog.gpxFile(name: name(r), fixes: RunLog.read(r.url)) { sharing = Shared(items: [url]) }
    }

    private func save(_ r: RunLog.Info) {
        document = GPXDocument(text: Gpx.write(name: name(r), fixes: RunLog.read(r.url)))
        exportName = "folloz-" + r.run
        exporting = true
    }
}
