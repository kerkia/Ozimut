import SwiftUI
import WebKit

struct RootView: View {
    @EnvironmentObject var m: AppModel

    var body: some View {
        Group {
            if m.paired && m.settings.onlyTracker {
                // « Mode suivi seul »: the tracker alone, no web view.
                TrackerFlowView(closable: false)
            } else {
                WebScreen(webView: m.web.webView)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .fullScreenCover(isPresented: $m.showTracker) {
                        TrackerFlowView(closable: true).environmentObject(m)
                    }
            }
        }
        .overlay(alignment: .top) {
            if let n = m.notice {
                NoticeBanner(text: n) { m.notice = nil }
            }
        }
    }
}

struct WebScreen: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct NoticeBanner: View {
    let text: String
    let close: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            Text(text).font(.callout).foregroundColor(.white)
            Spacer()
            Button(action: close) {
                Image(systemName: "xmark").foregroundColor(.white)
            }
            .accessibilityLabel(L("common.close"))
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.black.opacity(0.85)))
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { close() }
        }
    }
}
