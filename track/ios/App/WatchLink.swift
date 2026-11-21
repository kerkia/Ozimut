import Foundation
import WatchConnectivity

/// The iPhone's side of WatchConnectivity: hands the Apple Watch a pair code for this phone's account
/// (design.md « Watches »: the watch then calls `/api/track/pair` with kind "applewatch").
final class WatchLink: NSObject, WCSessionDelegate {
    var onChange: (() -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// A watch is paired with this phone and has the Ozimut app.
    var available: Bool {
        guard WCSession.isSupported() else { return false }
        let s = WCSession.default
        return s.activationState == .activated && s.isPaired && s.isWatchAppInstalled
    }

    var paired: Bool {
        WCSession.isSupported() && WCSession.default.activationState == .activated && WCSession.default.isPaired
    }

    func send(pairCode: String) {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        let msg: [String: Any] = ["pairCode": pairCode, "base": AppConfig.base.absoluteString]
        if s.isReachable {
            s.sendMessage(msg, replyHandler: nil) { _ in s.transferUserInfo(msg) }
        } else {
            s.transferUserInfo(msg)
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async { self.onChange?() }
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        DispatchQueue.main.async { self.onChange?() }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
