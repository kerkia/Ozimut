import UIKit
import VisionKit

/// The bridge's `scanMap`: the system's document scanner (the page's edges found, the perspective straightened) on an
/// orienteering map. The first page as a JPEG; nil when given up.
final class MapScanner: NSObject, VNDocumentCameraViewControllerDelegate {
    private var done: ((Data?) -> Void)?

    static var supported: Bool { VNDocumentCameraViewController.isSupported }

    func scan(done: @escaping (Data?) -> Void) {
        guard Self.supported, self.done == nil, let top = UIApplication.topViewController() else {
            done(nil)
            return
        }
        self.done = done
        let vc = VNDocumentCameraViewController()
        vc.delegate = self
        top.present(vc, animated: true)
    }

    private func finish(_ controller: UIViewController, _ data: Data?) {
        let d = done
        done = nil
        controller.dismiss(animated: true) { d?(data) }
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        guard scan.pageCount > 0 else {
            finish(controller, nil)
            return
        }
        finish(controller, scan.imageOfPage(at: 0).jpegData(compressionQuality: 0.9))
    }

    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        finish(controller, nil)
    }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        finish(controller, nil)
    }
}
