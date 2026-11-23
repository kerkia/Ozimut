package com.ozimut.web

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifs.channels(this)
    }
}
