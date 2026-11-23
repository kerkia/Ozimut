import XCTest

/// What is pure in the shell (Core/Shell.swift, compiled into this bundle): where an address goes, who may call the
/// bridge, a call's parsing, a file's MIME type.
final class ShellTests: XCTestCase {
    let base = URL(string: "https://ozimut.com/")!

    private func decide(_ s: String, main: Bool = true) -> NavDecision {
        NavPolicy.decide(url: URL(string: s)!, mainFrame: main, base: base)
    }

    func testTheSiteLoadsInTheView() {
        XCTAssertEqual(decide("https://ozimut.com/"), .allow)
        XCTAssertEqual(decide("https://ozimut.com/#/agenda"), .allow)
        XCTAssertEqual(decide("https://ozimut.com/data/meta.json"), .allow)
        XCTAssertEqual(decide("about:blank"), .allow)
        XCTAssertEqual(decide("blob:https://ozimut.com/0b1f"), .allow)
    }

    func testOtherSitesGoToTheBrowser() {
        XCTAssertEqual(decide("https://www.ffcorientation.fr/"), .external)
        XCTAssertEqual(decide("https://www.ozimut.com/"), .external)
        XCTAssertEqual(decide("http://ozimut.com/"), .external)           // not the base's scheme
        XCTAssertEqual(decide("https://ozimut.com.example.org/"), .external)
        XCTAssertEqual(decide("https://ozimut.com:8443/"), .external)
        XCTAssertEqual(decide("mailto:contact@ozimut.com"), .external)
        XCTAssertEqual(decide("tel:+33100000000"), .external)
    }

    func testFramesOfOtherHostsLoad() {
        XCTAssertEqual(decide("https://challenges.cloudflare.com/turnstile/v0/x", main: false), .allow)
    }

    func testCheckoutHostsAreNeverLoadedNorHandedOver() {
        for host in ["checkout.stripe.com", "buy.stripe.com", "billing.stripe.com", "pay.stripe.com", "paddle.com",
                     "checkout.paddle.com", "app.lemonsqueezy.com", "www.paypal.com", "PayPal.com"] {
            XCTAssertEqual(decide("https://\(host)/c/pay/x"), .block, host)
            XCTAssertEqual(decide("https://\(host)/c/pay/x", main: false), .block, host)
        }
        XCTAssertFalse(NavPolicy.isCheckout(host: "stripe.com"))
        XCTAssertFalse(NavPolicy.isCheckout(host: "notpaypal.com"))
        XCTAssertFalse(NavPolicy.isCheckout(host: "ozimut.com"))
    }

    func testFilesAndEmptySchemesAreBlocked() {
        XCTAssertEqual(decide("file:///etc/hosts"), .block)
        XCTAssertEqual(NavPolicy.decide(url: URL(string: "/relative")!, mainFrame: true, base: base), .block)
    }

    func testADebugBaseIsItsOwnSite() {
        let dev = URL(string: "https://dev.example.test:8443/")!
        XCTAssertEqual(NavPolicy.decide(url: URL(string: "https://dev.example.test:8443/#/x")!, mainFrame: true, base: dev), .allow)
        XCTAssertEqual(NavPolicy.decide(url: URL(string: "https://ozimut.com/")!, mainFrame: true, base: dev), .external)
    }

    func testTheBridgeIsTheSitesMainFrameOnly() {
        XCTAssertTrue(NavPolicy.bridgeAllowed(host: "ozimut.com", scheme: "https", port: 0, mainFrame: true, base: base))
        XCTAssertTrue(NavPolicy.bridgeAllowed(host: "OZIMUT.com", scheme: "https", port: 443, mainFrame: true, base: base))
        XCTAssertFalse(NavPolicy.bridgeAllowed(host: "ozimut.com", scheme: "https", port: 0, mainFrame: false, base: base))
        XCTAssertFalse(NavPolicy.bridgeAllowed(host: "ozimut.com", scheme: "http", port: 0, mainFrame: true, base: base))
        XCTAssertFalse(NavPolicy.bridgeAllowed(host: "challenges.cloudflare.com", scheme: "https", port: 0, mainFrame: true, base: base))
        XCTAssertFalse(NavPolicy.bridgeAllowed(host: "ozimut.com", scheme: "https", port: 8443, mainFrame: true, base: base))
    }

    func testBridgeMessages() {
        let m = BridgeMessage.parse(["id": "c1", "name": "saveFile", "args": ["name": "a.gpx"]] as [String: Any])
        XCTAssertEqual(m?.name, "saveFile")
        XCTAssertEqual(m?.id as? String, "c1")
        XCTAssertEqual(m?.args["name"] as? String, "a.gpx")
        let bare = BridgeMessage.parse(["name": "info"] as [String: Any])
        XCTAssertEqual(bare?.name, "info")
        XCTAssertTrue(bare?.id is NSNull)
        XCTAssertEqual(bare?.args.count, 0)
        XCTAssertNil(BridgeMessage.parse("info"))
        XCTAssertNil(BridgeMessage.parse(["id": "c2"] as [String: Any]))
        XCTAssertNil(BridgeMessage.parse(["name": ""] as [String: Any]))
    }

    func testMimeTypes() {
        XCTAssertEqual(Mime.of(name: "run.GPX"), "application/gpx+xml")
        XCTAssertEqual(Mime.of(name: "run.fit"), "application/vnd.ant.fit")
        XCTAssertEqual(Mime.of(name: "run.tcx"), "application/vnd.garmin.tcx+xml")
        XCTAssertEqual(Mime.of(name: "map.kmz"), "application/vnd.google-earth.kmz")
        XCTAssertEqual(Mime.of(name: "map.kml"), "application/vnd.google-earth.kml+xml")
        XCTAssertEqual(Mime.of(name: "map.pdf"), "application/pdf")
        XCTAssertEqual(Mime.of(name: "map.jpg"), "image/jpeg")
        XCTAssertEqual(Mime.of(name: "map.png"), "image/png")
        XCTAssertEqual(Mime.of(name: "thing.zzzunknown"), "application/octet-stream")
    }

    func testSafeNames() {
        XCTAssertEqual(Mime.safeName("../../etc/passwd"), "passwd")
        XCTAssertEqual(Mime.safeName(".hidden.gpx"), "hidden.gpx")
        XCTAssertEqual(Mime.safeName(""), "ozimut")
        XCTAssertEqual(Mime.safeName("carte du jour.png"), "carte du jour.png")
    }

    func testJSONText() {
        XCTAssertEqual(JSON.text("a\"b"), "\"a\\\"b\"")
        XCTAssertEqual(JSON.text(NSNull()), "null")
        XCTAssertEqual(JSON.text(true), "true")
        XCTAssertEqual(JSON.int("12"), 12)
    }
}
