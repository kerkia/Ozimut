package com.ozimut.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object Notifs {
    const val CH_RUN = "run"
    const val CH_PUSH = "push"
    const val ID_RUN = 1
    const val ID_RESUME = 2
    private var pushId = 100

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH_RUN, c.getString(R.string.notif_channel_run), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_PUSH, c.getString(R.string.notif_channel_push), NotificationManager.IMPORTANCE_DEFAULT)
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
        val n = Notification.Builder(c, CH_PUSH)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_resume_title))
            .setContentText(c.getString(R.string.notif_resume_text))
            .setAutoCancel(true)
            .setContentIntent(trackerIntent(c, false, 4))
            .build()
        try { nm.notify(ID_RESUME, n) } catch (e: SecurityException) { /* notifications refused */ }
    }

    /** A notification of the site's (FCM): its url opens in the web view. */
    fun push(c: Context, title: String?, body: String?, url: String?) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val i = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (!url.isNullOrBlank()) i.putExtra(MainActivity.EXTRA_URL, url)
        val id = pushId++
        val n = Notification.Builder(c, CH_PUSH)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(title ?: c.getString(R.string.app_name))
            .setContentText(body ?: "")
            .setStyle(Notification.BigTextStyle().bigText(body ?: ""))
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build()
        try { nm.notify(id, n) } catch (e: SecurityException) { /* notifications refused */ }
    }
}
