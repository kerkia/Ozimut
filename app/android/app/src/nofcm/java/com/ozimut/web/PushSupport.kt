package com.ozimut.web

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

/** Built without google-services.json: no native notifications. */
object PushSupport {
    const val AVAILABLE = false

    fun token(c: Context, cb: (String?) -> Unit) = cb(null)

    fun forget(c: Context) {}
}

/** Declared in the manifest (disabled) so that both builds share it. */
class OzMessagingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
