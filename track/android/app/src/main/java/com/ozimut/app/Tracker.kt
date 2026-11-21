package com.ozimut.app

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.CopyOnWriteArraySet
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The current run, kept in SharedPreferences so that it survives the process being killed.
 * state: "" (none), "running", "ending" (stopped, the last batches being sent), "ended".
 */
object RunState {
    data class S(
        val run: String,
        val state: String,
        val started: Long,
        val share: String,
        val help: Boolean,
        val helpAt: Long,
        val distance: Double,
        val fixes: Int,
        val lastFixAt: Long,
        val lastAcc: Int,
        val lastSent: Long,
        val failing: Boolean,
        val error: String,
        val endedAt: Long,
        val cap: Int,
    ) {
        val active get() = state == RUNNING || state == ENDING
    }

    const val RUNNING = "running"
    const val ENDING = "ending"
    const val ENDED = "ended"

    private fun p(c: Context) = c.getSharedPreferences("run", Context.MODE_PRIVATE)

    @Synchronized fun get(c: Context): S {
        val p = p(c)
        return S(
            run = p.getString("run", "") ?: "",
            state = p.getString("state", "") ?: "",
            started = p.getLong("started", 0),
            share = p.getString("share", "watchers") ?: "watchers",
            help = p.getBoolean("help", false),
            helpAt = p.getLong("helpAt", 0),
            distance = p.getFloat("distance", 0f).toDouble(),
            fixes = p.getInt("fixes", 0),
            lastFixAt = p.getLong("lastFixAt", 0),
            lastAcc = p.getInt("lastAcc", -1),
            lastSent = p.getLong("lastSent", 0),
            failing = p.getBoolean("failing", false),
            error = p.getString("error", "") ?: "",
            endedAt = p.getLong("endedAt", 0),
            cap = p.getInt("cap", 9000),
        )
    }

    @Synchronized fun begin(c: Context, run: String, share: String, cap: Int) {
        p(c).edit().clear()
            .putString("run", run).putString("state", RUNNING).putLong("started", System.currentTimeMillis())
            .putString("share", share).putInt("cap", cap).commit()
    }

    @Synchronized fun setState(c: Context, state: String) {
        val e = p(c).edit().putString("state", state)
        if (state == ENDED || state == ENDING) e.putLong("endedAt", get(c).endedAt.takeIf { it > 0 } ?: System.currentTimeMillis())
        e.commit()
    }

    @Synchronized fun setHelp(c: Context, on: Boolean) {
        val e = p(c).edit().putBoolean("help", on)
        if (on) e.putLong("helpAt", System.currentTimeMillis())
        e.commit()
    }

    @Synchronized fun onFix(c: Context, addMetres: Double, acc: Int) {
        val s = get(c)
        p(c).edit().putFloat("distance", (s.distance + addMetres).toFloat()).putInt("fixes", s.fixes + 1)
            .putLong("lastFixAt", System.currentTimeMillis()).putInt("lastAcc", acc).apply()
    }

    @Synchronized fun sent(c: Context) {
        p(c).edit().putLong("lastSent", System.currentTimeMillis()).putBoolean("failing", false).apply()
    }

    @Synchronized fun failing(c: Context) {
        p(c).edit().putBoolean("failing", true).apply()
    }

    @Synchronized fun error(c: Context, e: String) {
        p(c).edit().putString("error", e).commit()
    }

    @Synchronized fun clear(c: Context) {
        p(c).edit().clear().commit()
    }
}

/** The tracker as the screens and the bridge see it. */
object Tracker {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<Runnable>()
    private val rnd = SecureRandom()

    fun listen(l: Runnable) { listeners += l }
    fun unlisten(l: Runnable) { listeners -= l }
    fun changed() { main.post { listeners.forEach { it.run() } } }

    fun newRunId(now: Date = Date()): String {
        val f = SimpleDateFormat("yyyyMMdd'T'HHmmss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val a = "0123456789abcdefghijklmnopqrstuvwxyz"
        val tail = (1..4).map { a[rnd.nextInt(a.length)] }.joinToString("")
        return "r_" + f.format(now) + "_" + tail
    }

    /** Called from the visible Start screen only. */
    fun start(c: Context, share: String) {
        FixDb.get(c).dropAllBut(null)
        RunState.begin(c, newRunId(), share, Device.settings(c).cap)
        c.startForegroundService(Intent(c, TrackerService::class.java).setAction(TrackerService.ACTION_START))
        changed()
    }

    fun stop(c: Context) = send(c, TrackerService.ACTION_STOP)

    fun help(c: Context) {
        RunState.setHelp(c, true)
        send(c, TrackerService.ACTION_HELP)
        changed()
    }

    /** Sends to the running service, or restarts it for a run left open (the process was killed). */
    fun send(c: Context, action: String) {
        val i = Intent(c, TrackerService::class.java).setAction(action)
        try {
            if (TrackerService.running) c.startService(i) else c.startForegroundService(i)
        } catch (e: Exception) {
            // not allowed from the background: the next visible screen restarts it
        }
    }

    /** From a visible screen: a run left open gets its service back. */
    fun ensureService(c: Context) {
        val s = RunState.get(c)
        if (s.active && !TrackerService.running && !TrackerService.testing) send(c, TrackerService.ACTION_RESUME)
    }

    /** "none" (not paired), "ready", "running", "ending". */
    fun stateName(c: Context): String {
        val s = RunState.get(c)
        return when {
            s.state == RunState.RUNNING -> "running"
            s.state == RunState.ENDING -> "ending"
            !Device.paired(c) -> "none"
            else -> "ready"
        }
    }

    fun stateJson(c: Context): JSONObject {
        val s = RunState.get(c)
        val name = stateName(c)
        val active = name == "running" || name == "ending"
        return JSONObject()
            .put("state", name)
            .put("run", if (s.run.isNotEmpty()) s.run else JSONObject.NULL)
            .put("since", if (active) s.started / 1000 else JSONObject.NULL)
            .put("fixes", s.fixes)
            .put("pending", if (s.run.isNotEmpty()) FixDb.get(c).count(s.run) else 0)
    }

    fun haversine(la1: Int, lo1: Int, la2: Int, lo2: Int): Double {
        val r = 6_371_000.0
        val p1 = Math.toRadians(la1 / 1e6)
        val p2 = Math.toRadians(la2 / 1e6)
        val dp = p2 - p1
        val dl = Math.toRadians((lo2 - lo1) / 1e6)
        val h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }
}

/** The two-minute test's state (design.md « The native apps »). */
object SelfTest {
    const val WINDOW = 120
    private fun p(c: Context) = c.getSharedPreferences("selftest", Context.MODE_PRIVATE)

    data class S(val state: String, val started: Long, val first: Long, val last: Long, val count: Int, val maxGap: Long, val result: String)

    @Synchronized fun get(c: Context): S {
        val p = p(c)
        return S(
            p.getString("state", "") ?: "", p.getLong("started", 0), p.getLong("first", 0), p.getLong("last", 0),
            p.getInt("count", 0), p.getLong("maxGap", 0), p.getString("result", "") ?: ""
        )
    }

    @Synchronized fun begin(c: Context) {
        p(c).edit().clear().putString("state", "running").putLong("started", System.currentTimeMillis()).commit()
    }

    @Synchronized fun reset(c: Context) { p(c).edit().clear().commit() }

    /** A fix at [t] seconds. */
    @Synchronized fun record(c: Context, t: Long) {
        val s = get(c)
        if (s.state != "running") return
        val e = p(c).edit()
        if (s.first == 0L) {
            e.putLong("first", t).putLong("last", t).putInt("count", 1)
        } else if (t > s.last) {
            e.putLong("last", t).putLong("maxGap", maxOf(s.maxGap, t - s.last))
            if (t - s.first < WINDOW) e.putInt("count", s.count + 1)
        }
        e.commit()
    }

    /** Ends the test when its time is up; true once done. */
    @Synchronized fun check(c: Context): Boolean {
        val s = get(c)
        if (s.state != "running") return s.state == "done"
        val now = System.currentTimeMillis()
        val result = when {
            s.first == 0L && now - s.started > 120_000 -> "nofix"
            s.first > 0 && now / 1000 - s.first >= WINDOW + 3 -> {
                val end = minOf(now / 1000, s.first + WINDOW)
                val gap = maxOf(s.maxGap, end - s.last)
                if (s.count >= WINDOW * 9 / 10 && gap <= 10) "ok" else "fail"
            }
            else -> return false
        }
        p(c).edit().putString("state", "done").putString("result", result).commit()
        return true
    }
}
