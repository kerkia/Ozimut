package com.ozimut.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifs.channels(this)
    }
}
