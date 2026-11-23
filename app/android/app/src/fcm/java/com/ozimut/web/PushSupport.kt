package com.ozimut.web

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Native notifications through Firebase Cloud Messaging (built only when app/google-services.json exists). */
object PushSupport {
    const val AVAILABLE = true

    fun token(c: Context, cb: (String?) -> Unit) {
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
                cb(if (t.isSuccessful) t.result else null)
            }
        } catch (e: Exception) {
            cb(null)
        }
    }

    /** This phone receives nothing more until it registers again. */
    fun forget(c: Context) {
        try {
            FirebaseMessaging.getInstance().deleteToken()
        } catch (e: Exception) {
            // nothing to forget
        }
    }
}

/**
 * The site's notifications `{ title, body, url }`. In the background the system shows them and a tap starts MainActivity
 * with the message's data as extras (« url »); this runs when the app is in front.
 * A renewed token is not sent from here: the shell holds no credential — the page registers it again at its next start
 * (bridge `pushRegister`, docs/app/design.md).
 */
class OzMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        Notifs.show(
            this,
            d["title"] ?: message.notification?.title,
            d["body"] ?: message.notification?.body,
            d["url"],
            d["tag"]?.takeIf { it.isNotBlank() } ?: message.notification?.tag
        )
    }
}
