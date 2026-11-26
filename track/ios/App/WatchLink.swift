import Foundation
import WatchConnectivity

/// The iPhone's side of WatchConnectivity: the runs the Apple Watch recorded come over by `transferFile` (queued by the
/// system until the two are connected) and go to « Mes courses », marked « Enregistrée sur la montre »
/// (docs/track/folloz.md « The watch »). Nothing goes through the relay or Ozimut.
final class WatchLink: NSObject, WCSessionDelegate {
    /// A run came from the watch (on the main thread).
    var onRun: (() -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        // The file is deleted when this returns: taken in at once.
        guard (file.metadata?["kind"] as? String) == "run", let run = file.metadata?["run"] as? String else { return }
        if RunLog.importWatch(file: file.fileURL, run: run) {
            DispatchQueue.main.async { self.onRun?() }
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}
