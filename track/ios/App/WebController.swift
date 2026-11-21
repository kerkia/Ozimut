import UIKit
import WebKit

/// Forwards script messages without the user content controller keeping the controller alive.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(c, didReceive: message)
    }
}

/// The app's one web view: the live site, the bridge (design.md « The site ↔ app bridge »), external links in
/// Safari, downloads handed to the share sheet, the site's alert/confirm dialogs.
///
/// WKAppBoundDomains is not used: it would give the site its service worker in the app, but it also limits every
/// navigation, frame and script to the bound domains (Cloudflare's Turnstile frame on the registration page, a
/// Debug base URL) — the site works without its service worker.
final class WebController: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let webView: WKWebView
    /// Answers a bridge call (name, args, done).
    var onCall: ((String, [String: Any], @escaping (Result<Any, Error>) -> Void) -> Void)?
    /// A navigation the app handles itself (pair codes, `ozimut:` links).
    var onAppURL: ((URL) -> Bool)?

    private var pending: [[String: Any]] = []
    private var loaded = false
    private var drainTries = 0
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var started = false

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        // The suffix the site reads (design.md: « OzimutApp/<version> (ios) »), after Safari's own « Mobile/… ».
        cfg.applicationNameForUserAgent = "Mobile/15E148 OzimutApp/\(AppConfig.version) (ios)"
        let ucc = WKUserContentController()
        cfg.userContentController = ucc
        webView = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        ucc.add(WeakHandler(self), name: "ozimut")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
    }

    // MARK: loading

    func startIfNeeded() {
        guard !started else { return }
        started = true
        load(AppConfig.base)
    }

    func load(_ url: URL) {
        started = true
        webView.load(URLRequest(url: url))
    }

    /// Signs the web view in to the device's account (design.md « The web view's session »).
    func signIn(token: String) {
        if let url = URL(string: AppConfig.base.absoluteString + "t/login#" + token) { load(url) }
    }

    static func isSite(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return AppConfig.siteHosts.contains(host)
    }

    // MARK: bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "ozimut", message.frameInfo.isMainFrame else { return }
        let origin = message.frameInfo.securityOrigin
        guard AppConfig.siteHosts.contains(origin.host.lowercased()) else { return }
        guard let body = message.body as? [String: Any], let name = body["name"] as? String else { return }
        let id = body["id"] ?? NSNull()
        let args = (body["args"] as? [String: Any]) ?? [:]
        guard let onCall else {
            reject(id, "unavailable")
            return
        }
        onCall(name, args) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case let .success(v): self?.resolve(id, v)
                case let .failure(e): self?.reject(id, e.localizedDescription)
                }
            }
        }
    }

    private func resolve(_ id: Any, _ value: Any) {
        webView.evaluateJavaScript("window.__ozApp && window.__ozApp.resolve(\(JSON.text(id)), \(JSON.text(value)))", completionHandler: nil)
    }

    private func reject(_ id: Any, _ message: String) {
        webView.evaluateJavaScript("window.__ozApp && window.__ozApp.reject(\(JSON.text(id)), \(JSON.text(message)))", completionHandler: nil)
    }

    /// An event for the page (`window.__ozApp.event`), kept until the page has loaded and the bridge exists.
    func send(event: [String: Any]) {
        pending.append(event)
        drainTries = 0
        drain()
    }

    private func drain() {
        guard loaded, !pending.isEmpty else { return }
        let batch = pending
        let js = """
        (function(list){ if (!window.__ozApp || !window.__ozApp.event) return false;
          for (var i = 0; i < list.length; i++) { try { window.__ozApp.event(list[i]); } catch (e) {} } return true; })(\(JSON.text(batch)))
        """
        webView.evaluateJavaScript(js) { [weak self] result, _ in
            guard let self else { return }
            if (result as? Bool) == true {
                self.pending.removeFirst(min(batch.count, self.pending.count))
            } else if self.drainTries < 30 {
                self.drainTries += 1
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.drain() }
            }
        }
    }

    // MARK: navigation

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        loaded = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        drainTries = 0
        drain()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else {
            decisionHandler(.allow)
            return
        }
        if action.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        switch scheme {
        case "http", "https":
            if action.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
                return
            }
            if Self.isSite(url) {
                if let onAppURL, onAppURL(url) {
                    decisionHandler(.cancel)
                } else {
                    decisionHandler(.allow)
                }
                return
            }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        case "about", "blob", "data", "javascript":
            decisionHandler(.allow)
        case "ozimut":
            _ = onAppURL?(url)
            decisionHandler(.cancel)
        default:
            // tel:, mailto:, sms:, maps…
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition")?.lowercased(),
           disposition.hasPrefix("attachment") {
            decisionHandler(.download)
            return
        }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    // MARK: downloads → share sheet

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let name = suggestedFilename.isEmpty ? "ozimut" : suggestedFilename
        let url = dir.appendingPathComponent(name)
        downloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        DispatchQueue.main.async {
            let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            vc.popoverPresentationController?.sourceView = self.webView
            UIApplication.topViewController()?.present(vc, animated: true)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }

    // MARK: windows and dialogs

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if Self.isSite(url) {
                webView.load(action.request)
            } else if let s = url.scheme?.lowercased(), s == "http" || s == "https" {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: L("common.ok"), style: .default) { _ in completionHandler() })
        guard let top = UIApplication.topViewController() else { completionHandler(); return }
        top.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: L("common.cancel"), style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: L("common.ok"), style: .default) { _ in completionHandler(true) })
        guard let top = UIApplication.topViewController() else { completionHandler(false); return }
        top.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        a.addTextField { $0.text = defaultText }
        a.addAction(UIAlertAction(title: L("common.cancel"), style: .cancel) { _ in completionHandler(nil) })
        a.addAction(UIAlertAction(title: L("common.ok"), style: .default) { _ in completionHandler(a.textFields?.first?.text) })
        guard let top = UIApplication.topViewController() else { completionHandler(nil); return }
        top.present(a, animated: true)
    }
}

extension UIApplication {
    static func topViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        var vc = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}
