package com.ozimut.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.HandlerThread

/**
 * Ozimut's destination (the account the phone is linked to): sends the queue to /api/track/push on a thread of its own (design.md « Sending »): the open batches in order,
 * then new ones every `next` seconds; at once for help, at the end, and when a network returns after a failure.
 */
class Uploader(private val ctx: Context, private val store: FixStore, private val events: Events) {
    interface Events {
        /** The run is over on the server: "sent" (end acknowledged) or "closed" (409). */
        fun onFinished(how: String)
        /** The server asked the device to end the run. */
        fun onServerStop()
        /** 401: the device was removed from the account. */
        fun onDeviceRemoved()
    }

    private val thread = HandlerThread("ozimut-upload").apply { start() }
    private val h = Handler(thread.looper)
    private val batcher = Batcher(store)
    private val flushTask = Runnable { flush() }
    @Volatile private var failed = false
    private var backoff = FIRST_BACKOFF
    private var netCallback: ConnectivityManager.NetworkCallback? = null

    fun start() {
        if (netCallback != null) return
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (failed) kick()
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            netCallback = cb
        } catch (e: Exception) {
            // without it, the retries still run
        }
    }

    fun kick() {
        h.removeCallbacks(flushTask)
        h.post(flushTask)
    }

    fun kickIn(ms: Long) {
        h.removeCallbacks(flushTask)
        h.postDelayed(flushTask, ms)
    }

    fun quit() {
        netCallback?.let {
            try {
                (ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it)
            } catch (e: Exception) {
                // already gone
            }
        }
        netCallback = null
        h.removeCallbacksAndMessages(null)
        thread.quitSafely()
    }

    private fun fail(retryInMs: Long = backoff) {
        failed = true
        RunState.failing(ctx)
        Tracker.changed()
        kickIn(retryInMs)
        backoff = (backoff * 2).coerceAtMost(MAX_BACKOFF)
    }

    private fun flush() {
        val key = Device.key(ctx)
        if (key == null) {
            events.onDeviceRemoved()
            return
        }
        var heartbeat = true
        var nextSec = Device.settings(ctx).batch.toLong()
        for (i in 0 until 200) {
            val rs = RunState.get(ctx)
            if (rs.run.isEmpty() || !rs.active) return
            val ending = rs.state == RunState.ENDING
            val help = RunState.helpPending(ctx, RunState.OZ)
            val b = batcher.next(rs.run, ending, help, heartbeat && !ending) ?: break
            heartbeat = false
            if (b.state == States.HELP && help) RunState.helpSent(ctx, RunState.OZ, rs.helpAt)
            val left = (store.count(rs.run) - b.fixes.size).coerceAtLeast(0)
            val nowSec = System.currentTimeMillis() / 1000
            val pace = PaceState.now(ctx, nowSec, nextSec.toInt())
            val body = BatchEncoder.encode(b, rs.share, Phone.battery(ctx), Phone.lowPower(ctx), left, nowSec, pace)
            val res = try {
                Http.post("/api/track/push", body, key, gzip = true)
            } catch (e: Exception) {
                null
            }
            if (res == null) { fail(); return }
            when (res.code) {
                200 -> {
                    val j = res.json
                    val ack = j?.optInt("ack", b.seq) ?: b.seq
                    store.ack(rs.run, ack)
                    failed = false
                    backoff = FIRST_BACKOFF
                    RunState.sent(ctx)
                    if (j != null && j.has("next")) nextSec = j.optLong("next", nextSec)
                    Tracker.changed()
                    if (b.state == States.END && ack >= b.seq) {
                        events.onFinished("sent")
                        return
                    }
                    if (j?.optBoolean("stop", false) == true && !ending) {
                        events.onServerStop()
                    }
                }
                401 -> {
                    RunState.error(ctx, "device")
                    events.onDeviceRemoved()
                    return
                }
                409 -> {
                    store.drop(rs.run)
                    RunState.error(ctx, "closed")
                    events.onFinished("closed")
                    return
                }
                413 -> {
                    if (!store.split(rs.run, b.seq)) { fail(); return }
                }
                429 -> {
                    val n = res.json?.optLong("next", 0) ?: 0
                    fail(maxOf(n * 1000, backoff))
                    return
                }
                else -> { fail(); return }
            }
        }
        val rs = RunState.get(ctx)
        if (!rs.active) return
        if (rs.state == RunState.ENDING || RunState.helpPending(ctx, RunState.OZ)) kickIn(1_000)
        else {
            val now = System.currentTimeMillis() / 1000
            kickIn(PaceRules.nextSend(PaceState.now(ctx, now, nextSec.toInt()), now, nextSec).coerceIn(5, 900) * 1000)
        }
    }

    companion object {
        const val FIRST_BACKOFF = 5_000L
        const val MAX_BACKOFF = 300_000L
    }
}
