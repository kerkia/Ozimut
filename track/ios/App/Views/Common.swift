import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The system's share sheet for a file or a text.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

extension UTType {
    /// GPX, declared by its extension (Folloz opens no file: it only writes them).
    static var gpxFile: UTType { UTType(filenameExtension: "gpx", conformingTo: .xml) ?? .xml }
}

/// A GPX file for the file exporter (« Enregistrer »).
struct GPXDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.gpxFile] }
    var text: String

    init(text: String) {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        text = configuration.file.regularFileContents.map { String(decoding: $0, as: UTF8.self) } ?? ""
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}

/// Something shared (a GPX file, an invitation's text) through the share sheet.
struct Shared: Identifiable {
    let id = UUID()
    let items: [Any]
}

/// The first name, asked once before it is needed (a code made, a person followed): « Ton prénom ».
struct NameSheet: View {
    @EnvironmentObject var m: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    let then: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L("name.hint"), text: $name)
                        .textContentType(.givenName)
                        .submitLabel(.done)
                        .onSubmit(save)
                } footer: {
                    Text(L("name.text"))
                }
            }
            .navigationTitle(L("name.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L("common.ok"), action: save)
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { name = m.myName }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        m.setName(name)
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { then() }
    }
}

struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text).font(.title3.bold()).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
    }
}
