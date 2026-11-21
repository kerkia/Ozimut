import Foundation

/// The texts' language: the account's (`account.lang`) when the app has it, else the system's.
enum Lang {
    private(set) static var bundle: Bundle = .main
    private(set) static var code: String?

    static func set(_ lang: String?) {
        if let lang, let path = Bundle.main.path(forResource: lang, ofType: "lproj"), let b = Bundle(path: path) {
            bundle = b
            code = lang
        } else {
            bundle = .main
            code = nil
        }
    }

    static var locale: Locale { code.map { Locale(identifier: $0) } ?? .current }
}

/// A text of Localizable.xcstrings (English is the base; French the reference wording).
func L(_ key: String) -> String {
    let s = Lang.bundle.localizedString(forKey: key, value: nil, table: nil)
    if s == key, Lang.bundle != .main { return Bundle.main.localizedString(forKey: key, value: nil, table: nil) }
    return s
}

func L(_ key: String, _ args: CVarArg...) -> String {
    String(format: L(key), locale: Lang.locale, arguments: args)
}

enum Fmt {
    static func clock(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        return s >= 3600
            ? String(format: "%ld:%02ld:%02ld", s / 3600, (s / 60) % 60, s % 60)
            : String(format: "%ld:%02ld", s / 60, s % 60)
    }

    static func distance(_ metres: Double) -> String {
        let km = metres / 1000
        let f = NumberFormatter()
        f.locale = Lang.locale
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return (f.string(from: NSNumber(value: km)) ?? String(format: "%.2f", km)) + " km"
    }
}
