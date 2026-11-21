import Foundation
import Security

/// The device key and identity, in the Keychain, readable while the phone is locked after its first unlock
/// (the tracker sends with the screen off).
enum Keychain {
    static let service = "com.ozimut.track"

    static func set(_ value: String?, _ account: String) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value else { return }
        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ account: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

/// What a paired device keeps: its id and key (Keychain), the account, its watchers and settings (preferences).
final class DeviceStore {
    static let shared = DeviceStore()

    private let defaults = UserDefaults.standard
    private var cachedKey: String?

    var key: String? {
        if cachedKey == nil { cachedKey = Keychain.get("key") }
        return cachedKey
    }

    var device: String? { Keychain.get("device") }

    var account: TrackAccount? {
        guard let d = defaults.data(forKey: "oz.account") else { return nil }
        return try? JSONDecoder().decode(TrackAccount.self, from: d)
    }

    var watchers: [String] {
        (defaults.array(forKey: "oz.watchers") as? [String]) ?? []
    }

    var settings: TrackSettings {
        guard let d = defaults.data(forKey: "oz.settings"), let s = try? JSONDecoder().decode(TrackSettings.self, from: d) else {
            return TrackSettings()
        }
        return s
    }

    var isPaired: Bool { key != nil && account != nil }

    func save(device: String, key: String, account: TrackAccount, watchers: [String], settings: TrackSettings) {
        Keychain.set(key, "key")
        Keychain.set(device, "device")
        cachedKey = key
        save(account: account, watchers: watchers, settings: settings)
    }

    func save(account: TrackAccount, watchers: [String], settings: TrackSettings) {
        defaults.set(try? JSONEncoder().encode(account), forKey: "oz.account")
        defaults.set(watchers, forKey: "oz.watchers")
        defaults.set(try? JSONEncoder().encode(settings), forKey: "oz.settings")
    }

    func forget() {
        Keychain.set(nil, "key")
        Keychain.set(nil, "device")
        cachedKey = nil
        defaults.removeObject(forKey: "oz.account")
        defaults.removeObject(forKey: "oz.watchers")
        defaults.removeObject(forKey: "oz.settings")
    }
}

enum AppConfig {
    /// `OZBaseURL` of the Info.plist (the build setting `OZ_BASE_URL`), else https://ozimut.com/.
    static let base: URL = {
        var s = (Bundle.main.object(forInfoDictionaryKey: "OZBaseURL") as? String) ?? ""
        if s.isEmpty || s.contains("$(") { s = "https://ozimut.com/" }
        if !s.hasSuffix("/") { s += "/" }
        return URL(string: s) ?? URL(string: "https://ozimut.com/")!
    }()

    static let version: String = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0.0"

    /// The hardware model (« iPhone15,4 », « Watch6,2 »).
    static let model: String = {
        var info = utsname()
        uname(&info)
        let mirror = Mirror(reflecting: info.machine)
        return mirror.children.reduce("") { acc, el in
            guard let v = el.value as? Int8, v != 0 else { return acc }
            return acc + String(UnicodeScalar(UInt8(v)))
        }
    }()

    /// The hosts the app's web view treats as the site.
    static var siteHosts: Set<String> {
        var h: Set<String> = ["ozimut.com", "www.ozimut.com", "ocn.kerkia.com"]
        if let b = base.host { h.insert(b) }
        return h
    }
}
