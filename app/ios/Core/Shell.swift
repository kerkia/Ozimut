import Foundation
import UniformTypeIdentifiers

/// What the build says of the app (Info.plist keys written from project.yml's build settings).
enum AppConfig {
    /// `OZBaseURL` (the build setting `OZ_BASE_URL`), else https://ozimut.com/.
    static let base: URL = {
        var s = (Bundle.main.object(forInfoDictionaryKey: "OZBaseURL") as? String) ?? ""
        if s.isEmpty || s.contains("$(") { s = "https://ozimut.com/" }
        if !s.hasSuffix("/") { s += "/" }
        return URL(string: s) ?? URL(string: "https://ozimut.com/")!
    }()

    static let version: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0.0"

    /// "prod" for a Release build, "dev" otherwise: which of Apple's push services holds this build's token.
    static let apsEnvironment: String =
        (Bundle.main.object(forInfoDictionaryKey: "OZApsEnvironment") as? String) == "prod" ? "prod" : "dev"

    /// The domains of the Info.plist's `WKAppBoundDomains`.
    static let appBoundDomains: [String] =
        ((Bundle.main.object(forInfoDictionaryKey: "WKAppBoundDomains") as? [String]) ?? []).map { $0.lowercased() }

    /// The suffix the site and the server read (design.md « Recognising the app »), after Safari's own « Mobile/… ».
    static var userAgentName: String { "Mobile/15E148 OzimutApp/\(version) (ios)" }
}

/// A JSON text of any value (fragments allowed), for the web view.
enum JSON {
    static func int(_ v: Any?) -> Int? {
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s) }
        return nil
    }

    static func text(_ v: Any) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: v, options: [.fragmentsAllowed]),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "null"
    }
}

/// A JSON value or null.
func orNull(_ v: Any?) -> Any {
    v ?? NSNull()
}

/// Where an address asked of the web view goes (design.md « The shells »).
enum NavDecision: Equatable {
    /// Loaded in the web view.
    case allow
    /// Handed to the phone (the browser for a web address; mail, phone, maps for the others).
    case external
    /// Neither loaded nor handed over.
    case block
}

enum NavPolicy {
    /// Checkout hosts (design.md `CHECKOUT_HOSTS`): never loaded and never handed to the browser. An entry starting
    /// with a dot covers the domain and its subdomains.
    static let checkoutHosts = [
        "checkout.stripe.com", "buy.stripe.com", "billing.stripe.com", "pay.stripe.com",
        ".paddle.com", ".lemonsqueezy.com", ".paypal.com",
    ]

    static func isCheckout(host: String) -> Bool {
        let h = host.lowercased()
        for c in checkoutHosts {
            if c.hasPrefix(".") {
                if h == String(c.dropFirst()) || h.hasSuffix(c) { return true }
            } else if h == c {
                return true
            }
        }
        return false
    }

    /// The site's own origin: the base address's scheme, host and port.
    static func isSite(_ url: URL, base: URL) -> Bool {
        guard let host = url.host?.lowercased(), let baseHost = base.host?.lowercased() else { return false }
        return host == baseHost && url.scheme?.lowercased() == base.scheme?.lowercased() && url.port == base.port
    }

    static func decide(url: URL, mainFrame: Bool, base: URL) -> NavDecision {
        let scheme = url.scheme?.lowercased() ?? ""
        switch scheme {
        case "http", "https":
            guard let host = url.host, !host.isEmpty else { return .block }
            if isCheckout(host: host) { return .block }
            // Frames of other hosts load as the site asks (the anti-robot check).
            if !mainFrame { return .allow }
            return isSite(url, base: base) ? .allow : .external
        case "about", "blob", "data", "javascript":
            return .allow
        case "file":
            return .block
        case "":
            return .block
        default:
            // tel:, mailto:, sms:, maps…
            return .external
        }
    }

    /// Whether a script message may reach the bridge: the main frame of the site's own origin only.
    static func bridgeAllowed(host: String, scheme: String, port: Int, mainFrame: Bool, base: URL) -> Bool {
        guard mainFrame, let baseHost = base.host?.lowercased() else { return false }
        // WKSecurityOrigin gives port 0 for a scheme's default port.
        let basePort = base.port ?? 0
        let p = isDefault(port: port, scheme: scheme) ? 0 : port
        let bp = isDefault(port: basePort, scheme: base.scheme ?? "") ? 0 : basePort
        return host.lowercased() == baseHost && scheme.lowercased() == (base.scheme ?? "").lowercased() && p == bp
    }

    private static func isDefault(port: Int, scheme: String) -> Bool {
        port == 0 || (scheme.lowercased() == "https" && port == 443) || (scheme.lowercased() == "http" && port == 80)
    }
}

/// A call of the page: `{ id, name, args }` (design.md « The bridge »).
struct BridgeMessage {
    let id: Any
    let name: String
    let args: [String: Any]

    static func parse(_ body: Any) -> BridgeMessage? {
        guard let d = body as? [String: Any], let name = d["name"] as? String, !name.isEmpty else { return nil }
        return BridgeMessage(id: d["id"] ?? NSNull(), name: name, args: (d["args"] as? [String: Any]) ?? [:])
    }
}

/// A file's MIME type from its name.
enum Mime {
    static let known: [String: String] = [
        "gpx": "application/gpx+xml", "fit": "application/vnd.ant.fit", "tcx": "application/vnd.garmin.tcx+xml",
        "kmz": "application/vnd.google-earth.kmz", "kml": "application/vnd.google-earth.kml+xml", "pdf": "application/pdf",
    ]

    static func of(name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        if let m = known[ext] { return m }
        return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }

    /// A file name safe to write in a folder of the app's: its last component, never empty or hidden.
    static func safeName(_ raw: String, fallback: String = "ozimut") -> String {
        var n = (raw as NSString).lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
        n = n.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        while n.hasPrefix(".") { n.removeFirst() }
        if n.isEmpty { return fallback }
        return String(n.prefix(120))
    }
}
