import SwiftUI
import WebKit

struct RootView: View {
    @EnvironmentObject var m: AppModel

    var body: some View {
        ZStack {
            WebScreen(webView: m.web.webView)
                .ignoresSafeArea(.container, edges: .bottom)
            if m.offline {
                OfflineView { m.retry() }
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

/// No network at start: said, with a way to try again.
struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 44))
                .foregroundColor(.secondary)
                .accessibilityHidden(true)
            Text(L("offline.title")).font(.title2).bold()
            Text(L("offline.text"))
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button(action: retry) {
                Text(L("offline.retry")).bold().padding(.horizontal, 20).padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
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
