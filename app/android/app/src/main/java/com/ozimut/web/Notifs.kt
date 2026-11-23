package com.ozimut.web

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * The account's notifications (docs/app/design.md « Native notifications »). The server names the channel: « alerts », and
 * « help » for an urgent one. In the background the system shows them itself; with the app in front, [show] does.
 */
object Notifs {
    const val CH_ALERTS = "alerts"
    const val CH_HELP = "help"
    private var nextId = 100

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERTS, c.getString(R.string.notif_channel_alerts), NotificationManager.IMPORTANCE_DEFAULT)
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_HELP, c.getString(R.string.notif_channel_help), NotificationManager.IMPORTANCE_HIGH)
        )
    }

    fun enabled(c: Context): Boolean =
        c.getSystemService(NotificationManager::class.java)?.areNotificationsEnabled() ?: false

    /** A notification whose tap opens the app on [url] (a site address, « /#/… »). */
    fun show(c: Context, title: String?, body: String?, url: String?, tag: String?) {
        if (title.isNullOrBlank() && body.isNullOrBlank()) return
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val id = nextId++
        val open = Intent(c, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_URL, url ?: "/")
        val pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = Notification.Builder(c, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat)
            .setColor(c.getColor(R.color.oz_orange))
            .setContentTitle(title ?: c.getString(R.string.app_name))
            .setContentText(body ?: "")
            .setStyle(Notification.BigTextStyle().bigText(body ?: ""))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        try {
            if (tag.isNullOrBlank()) nm.notify(id, n) else nm.notify(tag, 1, n)
        } catch (e: SecurityException) {
            // notifications are not allowed
        }
    }
}
