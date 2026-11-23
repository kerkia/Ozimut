import SwiftUI

/// A new code for someone who will follow this iPhone (docs/track/ozitrac.md « The code a watcher scans »): its QR code
/// to scan with their Ozitrac, or the address to send them. A code serves once and lasts 24 hours.
struct InviteView: View {
    @EnvironmentObject var m: AppModel
    @State private var link: String?
    @State private var failed = false
    @State private var sharing: Shared?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                if let link {
                    Text(L("invite.text")).frame(maxWidth: .infinity, alignment: .leading)
                    QRView(text: link)
                        .frame(maxWidth: 320)
                        .padding(.vertical, 4)
                    Text(L("invite.once")).font(.footnote).foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button(action: { sharing = Shared(items: [L("invite.message", m.myName, link)]) }) {
                        Label(L("invite.share"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    Button(L("invite.done")) { m.page = nil }
                } else if failed {
                    Text(L("net.error")).foregroundColor(.red)
                    Button(L("retry")) { Task { await make() } }.buttonStyle(.borderedProminent)
                } else {
                    ProgressView(L("invite.making"))
                }
            }
            .padding()
        }
        .navigationTitle(L("invite.title"))
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .task { await make() }
        .onDisappear { m.refreshInBackground() }
        .sheet(item: $sharing) { s in ShareSheet(items: s.items) }
    }

    private func make() async {
        failed = false
        link = nil
        let l = await m.invite()
        link = l
        failed = l == nil
    }
}
