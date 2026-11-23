import Foundation

/// The texts' language: the Ozimut account's (`account.lang`) when the device is linked to one, else the system's.
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

    /// The time of day of a Unix time (« 14:32 »).
    static func time(_ t: Int64) -> String {
        let f = DateFormatter()
        f.locale = Lang.locale
        f.dateStyle = .none
        f.timeStyle = .short
        return f.string(from: Date(timeIntervalSince1970: TimeInterval(t)))
    }

    /// A day and time (« 23 nov. 2026 14:32 »).
    static func dateTime(_ t: Int64) -> String {
        let f = DateFormatter()
        f.locale = Lang.locale
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: Date(timeIntervalSince1970: TimeInterval(t)))
    }

    /// A span of time: « 20 s », « 12 min », « 2 h ».
    static func span(_ seconds: Int) -> String {
        let s = max(0, seconds)
        if s < 90 { return L("ago.s", s) }
        if s < 5400 { return L("ago.min", s / 60) }
        return L("ago.h", s / 3600)
    }

    /// The span from a Unix time to now.
    static func since(_ t: Int64, now: Date = Date()) -> String {
        span(Int(now.timeIntervalSince1970) - Int(t))
    }
}
