package com.ozimut.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifs.channels(this)
        // a run ended (or kept from before) goes to the phone's « Mes courses » (RunSync)
        Tracker.listen(Runnable { RunSync.soon(this) })
        RunSync.soon(this)
    }
}
