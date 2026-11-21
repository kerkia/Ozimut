package com.ozimut.app

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings as SystemSettings

/** What the phone says about itself. */
object Phone {
    fun battery(c: Context): Int? {
        val bm = c.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val v = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (v in 0..100) v else null
    }

    fun lowPower(c: Context): Boolean =
        (c.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true

    fun online(c: Context): Boolean {
        val cm = c.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    enum class Maker { SAMSUNG, XIAOMI, HUAWEI, ONEPLUS, OTHER }

    fun maker(): Maker {
        val m = (Build.MANUFACTURER + " " + Build.BRAND).lowercase()
        return when {
            "samsung" in m -> Maker.SAMSUNG
            "xiaomi" in m || "redmi" in m || "poco" in m -> Maker.XIAOMI
            "huawei" in m || "honor" in m -> Maker.HUAWEI
            "oneplus" in m || "oppo" in m || "realme" in m -> Maker.ONEPLUS
            else -> Maker.OTHER
        }
    }

    /**
     * Opens the system's battery optimisation list, or the app's own page. Never asks for
     * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (Play forbids it for this use).
     */
    fun openSettings(c: Context, which: String): Boolean {
        val app = Intent(SystemSettings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.packageName))
        val tries = if (which == "battery") listOf(Intent(SystemSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), app) else listOf(app)
        for (i in tries) {
            try {
                c.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: Exception) {
                // next
            }
        }
        return false
    }
}
