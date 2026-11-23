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

/// The app's one web view: the live site, the bridge (docs/app/design.md « The bridge »), other sites in the phone's
/// browser, checkout hosts nowhere, downloads handed to the share sheet, the site's alert/confirm dialogs.
final class WebController: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    let webView: WKWebView
    /// Answers a bridge call (name, args, done).
    var onCall: ((String, [String: Any], @escaping (Result<Any, Error>) -> Void) -> Void)?
    /// The site could not be reached before any page was shown.
    var onStartFailed: (() -> Void)?
    /// A page of the site is shown.
    var onShown: (() -> Void)?

    private var pending: [[String: Any]] = []
    /// The page said it is ready (its first `info` call): events may be sent.
    private var pageReady = false
    private var drainTries = 0
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var started = false
    private var shownOnce = false

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()          // cookies and site storage persist
        cfg.applicationNameForUserAgent = AppConfig.userAgentName
        // The site's domain is app-bound (Info.plist WKAppBoundDomains): service workers work, and the main frame cannot
        // leave it. Only when the base address is one of them — otherwise no page could load at all (a Debug build
        // pointed at a host that was not added to OZ_DEV_HOST: its bridge then does not exist, see README.md).
        if let host = AppConfig.base.host?.lowercased(), AppConfig.appBoundDomains.contains(host) {
            cfg.limitsNavigationsToAppBoundDomains = true
        }
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
        webView.load(URLRequest(url: AppConfig.base))
    }

    /// « Réessayer » of the no-network screen.
    func retry() {
        started = true
        if webView.url != nil, shownOnce {
            webView.reload()
        } else {
            webView.load(URLRequest(url: AppConfig.base))
        }
    }

    // MARK: bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "ozimut" else { return }
        let origin = message.frameInfo.securityOrigin
        guard NavPolicy.bridgeAllowed(host: origin.host, scheme: origin.protocol, port: origin.port,
                                      mainFrame: message.frameInfo.isMainFrame, base: AppConfig.base) else { return }
        guard let m = BridgeMessage.parse(message.body) else { return }
        guard let onCall else {
            reject(m.id, "unavailable")
            return
        }
        onCall(m.name, m.args) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case let .success(v): self?.resolve(m.id, v)
                case let .failure(e): self?.reject(m.id, e.localizedDescription)
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

    /// The page called `info`: it listens, the events kept for it may go (a file that started the app is not lost).
    func markReady() {
        pageReady = true
        drainTries = 0
        drain()
    }

    /// An event for the page (`window.__ozApp.event`), kept until the page has said it is ready.
    func send(event: [String: Any]) {
        pending.append(event)
        drainTries = 0
        drain()
    }

    private func drain() {
        guard pageReady, !pending.isEmpty else { return }
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

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // A new document: it will say when it listens.
        pageReady = false
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        shownOnce = true
        onShown?()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let code = (error as NSError).code
        // -999: a navigation given up for another (ours); 102: a load the policy turned away.
        if code == NSURLErrorCancelled || code == 102 { return }
        if !shownOnce { onStartFailed?() }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else {
            decisionHandler(.allow)
            return
        }
        // No target frame: a new window asked for (target=_blank), judged as the main frame.
        let main = action.targetFrame?.isMainFrame ?? true
        switch NavPolicy.decide(url: url, mainFrame: main, base: AppConfig.base) {
        case .allow:
            decisionHandler(action.shouldPerformDownload ? .download : .allow)
        case .external:
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        case .block:
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
        if !response.isForMainFrame {
            decisionHandler(.allow)
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
        let url = dir.appendingPathComponent(Mime.safeName(suggestedFilename))
        downloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        DispatchQueue.main.async { self.share(file: url) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
    }

    /// The system's share / save sheet on a file. -> whether it could be shown
    @discardableResult
    func share(file url: URL) -> Bool {
        guard let top = UIApplication.topViewController() else { return false }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = webView
        vc.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
        top.present(vc, animated: true)
        return true
    }

    // MARK: windows, permissions and dialogs

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open and target=_blank: the site's own pages in this view, other sites in the browser, checkout nowhere.
        if let url = action.request.url {
            switch NavPolicy.decide(url: url, mainFrame: true, base: AppConfig.base) {
            case .allow:
                if let s = url.scheme?.lowercased(), s == "http" || s == "https" { webView.load(action.request) }
            case .external:
                UIApplication.shared.open(url)
            case .block:
                break
            }
        }
        return nil
    }

    /// The camera and the microphone a page asks for (the phone's own permission is asked by the system besides).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let ok = NavPolicy.bridgeAllowed(host: origin.host, scheme: origin.protocol, port: origin.port,
                                         mainFrame: frame.isMainFrame, base: AppConfig.base)
        decisionHandler(ok ? .grant : .deny)
    }

    /// The compass (the map editor's field mode).
    func webView(_ webView: WKWebView, requestDeviceOrientationAndMotionPermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let ok = NavPolicy.bridgeAllowed(host: origin.host, scheme: origin.protocol, port: origin.port,
                                         mainFrame: frame.isMainFrame, base: AppConfig.base)
        decisionHandler(ok ? .grant : .deny)
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
