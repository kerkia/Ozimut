import UserNotifications

/// Words an Ozitrac alert (docs/track/ozitrac.md « Notifications »). The relay knows no name — every name is sealed — so
/// the alert comes with its kind and channel only (`aps.alert.loc-key` = `OZ_ALERT_<KIND>`, the generic sentence) and this
/// extension writes the name of the person followed, as the app holds it for that channel (App Group): « Tom a besoin
/// d'aide ! ». In a long run (the app shares each person's `send` there) standing still and silence are worded for its own
/// times. Another notification (Ozimut's own, for a linked iPhone) is left as it came.
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
            if kind == "pace" {
                // A watcher's request for this phone's run comes as a background notification, never shown: should one
                // ever come here, nothing is written in it.
                best.title = ""
                best.subtitle = ""
                best.body = ""
                best.sound = nil
                contentHandler(best)
                return
            }
            let c = (info["c"] as? String) ?? ""
            let group = UserDefaults(suiteName: "group.com.ozimut.ozitrac")
            let names = group?.dictionary(forKey: "names") as? [String: String]
            let longSend = (group?.dictionary(forKey: "long") as? [String: Int])?[c]
            if let name = names?[c], !name.isEmpty {
                best.title = name
                best.body = alertText(name: name, kind: kind, longSend: longSend)
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

/// An alert's sentence, the person's name in it (the app words them alike); `longSend`: the seconds between batches of a
/// long run (standing still is 30 minutes there, silence 3 batches and 2 minutes).
func alertText(name: String, kind: String, longSend: Int? = nil) -> String {
    if let s = longSend, s > 0 {
        if kind == "still" { return L("alert.still.long", name) }
        if kind == "silent" { return L("alert.silent.long", name, (3 * s + 120) / 60) }
    }
    switch kind {
    case "start", "end", "help", "silent", "battery", "still", "zone": return L("alert." + kind, name)
    default: return L("alert.other", name)
    }
}
