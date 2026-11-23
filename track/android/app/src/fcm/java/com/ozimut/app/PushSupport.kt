package com.ozimut.app

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.concurrent.Executors

/** Native push through Firebase Cloud Messaging (built only when app/google-services.json exists). */
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
}

/**
 * Receives Ozitrac's alerts — data messages `{ app: "ozitrac", c, kind, t, run }` (docs/track/ozitrac.md « Alerts »), shown
 * as « <name> : <alert> » for the person followed on channel c — and the Ozimut account's own notifications `{ title, body }`.
 */
class OzMessagingService : FirebaseMessagingService() {
    private val io = Executors.newSingleThreadExecutor()

    override fun onNewToken(token: String) {
        io.execute {
            if (Device.paired(applicationContext)) PushTokens.send(applicationContext, token)
            Follows.registerPushAll(applicationContext, token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        if (d["app"] == "ozitrac") {
            val ch = d["c"] ?: return
            val kind = d["kind"] ?: return
            Notifs.alert(this, ch, kind)
            return
        }
        Notifs.plain(this, d["title"] ?: message.notification?.title, d["body"] ?: message.notification?.body)
    }
}
