package com.ozimut.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

/** Built without google-services.json: no native push. */
object PushSupport {
    const val AVAILABLE = false

    fun token(c: Context, cb: (String?) -> Unit) = cb(null)
}

/** Declared in the manifest (disabled) so that both builds share it. */
class OzMessagingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null
}
