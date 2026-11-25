package com.ozimut.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifs.channels(this)
        // a long run's fixes batched by Play services' fused location (LongRun.kt); the platform's location without it
        FixSources.long = { FusedFixes() }
        OwnPush.sync(this)
    }
}
