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
 * as « <name> : <alert> » for the person followed on channel c —, a watcher's request for Direct to this phone's own channel
 * — `{ app: "ozitrac", c, kind: "pace", until, at, by }` (« Pace »), never shown as a notification of its own: the run's
 * notification says it once applied — and the Ozimut account's own notifications `{ title, body }`.
 */
class OzMessagingService : FirebaseMessagingService() {
    private val io = Executors.newSingleThreadExecutor()

    override fun onNewToken(token: String) {
        io.execute {
            if (Device.paired(applicationContext)) PushTokens.send(applicationContext, token)
            Follows.registerPushAll(applicationContext, token)
            Channel.setToken(applicationContext, token)
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        if (d["app"] == "ozitrac") {
            val ch = d["c"] ?: return
            val kind = d["kind"] ?: return
            if (kind == "pace") {
                // only for this phone's own channel, during a run; the service settles it (or a batch's answer brings it later)
                if (ch != Channel.id(this) || RunState.get(this).state != RunState.RUNNING) return
                val at = PaceRules.secs(d["at"])
                if (at > 0 && PaceState.offer(this, Boost(PaceRules.secs(d["until"]), at, d["by"] ?: ""))) Tracker.pace(this)
                return
            }
            Notifs.alert(this, ch, kind)
            return
        }
        Notifs.plain(this, d["title"] ?: message.notification?.title, d["body"] ?: message.notification?.body)
    }
}
