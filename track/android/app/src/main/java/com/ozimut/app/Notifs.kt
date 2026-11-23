package com.ozimut.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** The run's notifications (the API the shared TrackerService calls) and the alerts of the people followed. */
object Notifs {
    const val CH_RUN = "run"
    const val CH_ALERTS = "alerts"
    const val CH_HELP = "help"
    const val ID_RUN = 1
    const val ID_RESUME = 2
    private var nextId = 100

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH_RUN, c.getString(R.string.notif_channel_run), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERTS, c.getString(R.string.notif_channel_alerts), NotificationManager.IMPORTANCE_DEFAULT)
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_HELP, c.getString(R.string.notif_channel_help), NotificationManager.IMPORTANCE_HIGH)
        )
    }

    private fun trackerIntent(c: Context, confirmStop: Boolean, req: Int): PendingIntent {
        val i = Intent(c, TrackerActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(TrackerActivity.EXTRA_CONFIRM_STOP, confirmStop)
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** The persistent notification of a run: the elapsed time, and « Stop… » that only opens the screen (hold to stop). */
    fun run(c: Context, startedAt: Long): Notification =
        Notification.Builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_run_title))
            .setContentText(c.getString(R.string.notif_run_text))
            .setWhen(startedAt)
            .setUsesChronometer(true)
            .setShowWhen(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setContentIntent(trackerIntent(c, false, 1))
            .addAction(Notification.Action.Builder(null, c.getString(R.string.notif_stop), trackerIntent(c, true, 2)).build())
            .build()

    fun sending(c: Context): Notification =
        Notification.Builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_sending_title))
            .setContentText(c.getString(R.string.notif_sending_text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(trackerIntent(c, false, 1))
            .build()

    fun test(c: Context): Notification =
        Notification.Builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_test_title))
            .setContentText(c.getString(R.string.notif_test_text))
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    c, 3, Intent(c, SelfTestActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            .build()

    /** The run could not be resumed from the background: one tap on this brings it back. */
    fun resume(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val n = Notification.Builder(c, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_resume_title))
            .setContentText(c.getString(R.string.notif_resume_text))
            .setAutoCancel(true)
            .setContentIntent(trackerIntent(c, false, 4))
            .build()
        try { nm.notify(ID_RESUME, n) } catch (e: SecurityException) { /* notifications refused */ }
    }

    /** An alert about a person followed (docs/track/ozitrac.md « Notifications »): opens their map. */
    fun alert(c: Context, ch: String, kind: String) {
        val f = Follows.get(c, ch) ?: return
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val urgent = kind == "help" || kind == "silent" || kind == "zone"
        val i = Intent(c, FollowActivity::class.java)
            .putExtra(FollowActivity.EXTRA_C, ch)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val id = 1000 + (ch.hashCode() and 0xffff)
        val n = Notification.Builder(c, if (urgent) CH_HELP else CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(f.name.ifBlank { c.getString(R.string.app_name) })
            .setContentText(alertText(c, f.name, kind))
            .setAutoCancel(true)
            .setCategory(if (urgent) Notification.CATEGORY_ALARM else Notification.CATEGORY_STATUS)
            .setContentIntent(PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build()
        try { nm.notify(id, n) } catch (e: SecurityException) { /* notifications refused */ }
    }

    /** Another notification (an Ozimut account's own tracking alerts): its title and text, opening the app. */
    fun plain(c: Context, title: String?, body: String?) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val id = nextId++
        val i = Intent(c, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val n = Notification.Builder(c, CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title ?: c.getString(R.string.app_name))
            .setContentText(body ?: "")
            .setStyle(Notification.BigTextStyle().bigText(body ?: ""))
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build()
        try { nm.notify(id, n) } catch (e: SecurityException) { /* notifications refused */ }
    }

    /** An alert's sentence, the person's name in it. */
    fun alertText(c: Context, name: String, kind: String): String {
        val n = name.ifBlank { "?" }
        return c.getString(
            when (kind) {
                "start" -> R.string.alert_start
                "end" -> R.string.alert_end
                "help" -> R.string.alert_help
                "silent" -> R.string.alert_silent
                "battery" -> R.string.alert_battery
                "still" -> R.string.alert_still
                "zone" -> R.string.alert_zone
                else -> R.string.alert_other
            },
            n
        )
    }
}
