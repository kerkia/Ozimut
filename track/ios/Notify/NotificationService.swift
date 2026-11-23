import UserNotifications

/// Words an Ozitrac alert (docs/track/ozitrac.md « Notifications »). The relay knows no name — every name is sealed — so
/// the alert comes with its kind and channel only (`aps.alert.loc-key` = `OZ_ALERT_<KIND>`, the generic sentence) and this
/// extension writes the name of the person followed, as the app holds it for that channel (App Group): « Tom a besoin
/// d'aide ! ». Another notification (Ozimut's own, for a linked iPhone) is left as it came.
final class NotificationService: UNNotificationServiceExtension {
    private var handler: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        handler = contentHandler
        guard let best = request.content.mutableCopy() as? UNMutableNotificationContent else {
            contentHandler(request.content)
            return
        }
        content = best
        let info = request.content.userInfo
        if (info["app"] as? String) == "ozitrac", let kind = info["kind"] as? String {
            let c = (info["c"] as? String) ?? ""
            let names = UserDefaults(suiteName: "group.com.ozimut.ozitrac")?.dictionary(forKey: "names") as? [String: String]
            if let name = names?[c], !name.isEmpty {
                best.title = name
                best.body = alertText(name: name, kind: kind)
            } else {
                best.title = "Ozitrac"
                best.body = L("OZ_ALERT_" + kind.uppercased())
            }
            best.threadIdentifier = c
        }
        contentHandler(best)
    }

    override func serviceExtensionTimeWillExpire() {
        if let handler, let content { handler(content) }
    }
}

/// An alert's sentence, the person's name in it (the app words them alike).
func alertText(name: String, kind: String) -> String {
    switch kind {
    case "start", "end", "help", "silent", "battery", "still", "zone": return L("alert." + kind, name)
    default: return L("alert.other", name)
    }
}
