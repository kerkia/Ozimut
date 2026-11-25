package com.ozimut.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** The watch's notifications, with the API the shared TrackerService calls. Each one opens the watch's screen. */
object Notifs {
    const val CH_RUN = "run"
    const val ID_RUN = 1
    const val ID_RESUME = 2

    fun channels(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CH_RUN, c.getString(R.string.notif_channel_run), NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            }
        )
    }

    private fun open(c: Context, req: Int): PendingIntent =
        PendingIntent.getActivity(
            c, req, Intent(c, WatchActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun base(c: Context, title: Int, text: Int) =
        Notification.Builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(title))
            .setContentText(c.getString(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_WORKOUT)
            .setContentIntent(open(c, 1))

    /** The run's notification. The watch is never in long mode (docs/track/ozitrac.md « The apps »): [pace] and [askedBy] say nothing here. */
    @Suppress("UNUSED_PARAMETER")
    fun run(c: Context, startedAt: Long, pace: PaceNow? = null, askedBy: String? = null): Notification =
        base(c, R.string.notif_run_title, R.string.notif_run_text).setWhen(startedAt).setUsesChronometer(true).setShowWhen(true).build()

    fun sending(c: Context): Notification = base(c, R.string.notif_sending_title, R.string.notif_sending_text).build()

    /** The shared service's self-test; the watch never starts one, but the service names it. */
    fun test(c: Context): Notification = base(c, R.string.notif_sending_title, R.string.notif_sending_text).build()

    /** The run could not be resumed from the background: one tap on this brings it back. */
    fun resume(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java) ?: return
        val n = Notification.Builder(c, CH_RUN)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(c.getString(R.string.notif_resume_title))
            .setContentText(c.getString(R.string.notif_resume_text))
            .setAutoCancel(true)
            .setContentIntent(open(c, 4))
            .build()
        try { nm.notify(ID_RESUME, n) } catch (e: SecurityException) { /* notifications refused */ }
    }
}
