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

/** Receives the site's notifications: `{ title, body, url }`, the url opened in the web view when tapped. */
class OzMessagingService : FirebaseMessagingService() {
    private val io = Executors.newSingleThreadExecutor()

    override fun onNewToken(token: String) {
        if (Device.paired(this)) io.execute { PushTokens.send(applicationContext, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: message.notification?.title
        val body = d["body"] ?: message.notification?.body
        Notifs.push(this, title, body, d["url"])
    }
}
