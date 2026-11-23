import Foundation

/// The shell's own texts follow the phone's language (the site's pages follow the account's).
enum Lang {
    static var locale: Locale { .current }
}

/// A text of Localizable.xcstrings (English is the base; French the reference wording). Written by tools/strings.py.
func L(_ key: String) -> String {
    Bundle.main.localizedString(forKey: key, value: nil, table: nil)
}

func L(_ key: String, _ args: CVarArg...) -> String {
    String(format: L(key), locale: Lang.locale, arguments: args)
}
