package com.ozimut.app

import android.content.Context
import android.content.SharedPreferences
import android.location.Location
import android.os.Looper
import org.json.JSONObject

/*
 * The run's pace (docs/track/ozitrac.md « Pace »): Direct — a fix a second — or « Course longue » — a fix every 15, 30 or
 * 60 s, a batch every 5, 10 or 15 minutes, the phone left asleep in between — and a watcher's request for Direct for a while.
 * The rules are plain Kotlin, unit-tested; PaceState keeps the run's pace with the run (RunState's preferences, cleared at
 * each Start). Shared with the watch, which is never in long mode (its runs are always PaceChoice.LIVE).
 */

/** The pace chosen at the start: Direct, or a long run with its two intervals and whether watchers may ask for Direct. */
data class PaceChoice(val long: Boolean, val fix: Int, val send: Int, val remote: Boolean) {
    companion object {
        val LIVE = PaceChoice(false, 1, 0, false)
        /** The intervals offered at the start, in seconds. */
        val FIXES = listOf(15, 30, 60)
        val SENDS = listOf(300, 600, 900)
        const val FIX_DEFAULT = 30
        const val SEND_DEFAULT = 600

        /** A long run, each interval brought to the nearest one offered (a value kept by an older version stays valid). */
        fun long(fix: Int, send: Int, remote: Boolean) = PaceChoice(true, nearest(FIXES, fix), nearest(SENDS, send), remote)

        private fun nearest(list: List<Int>, v: Int) = list.minByOrNull { kotlin.math.abs(it - v) } ?: list[0]
    }
}

/** A watcher's request for Direct as the relay holds it: Direct until [until], asked at [at] (Unix seconds) by watcher [by]. */
data class Boost(val until: Long, val at: Long, val by: String)

/** The pace kept, as a batch reports it and a watcher reads it (`pace`). */
data class PaceNow(val mode: String, val fix: Int, val send: Int, val remote: Boolean, val boost: Long, val by: String) {
    val long get() = mode == PaceRules.LONG

    /** A long run in Direct for a watcher, still at [nowSec]. */
    fun boosted(nowSec: Long) = long && boost > nowSec
}

object PaceRules {
    const val LIVE = "live"
    const val LONG = "long"
    /** Under this battery % the phone refuses a watcher's request for Direct, and gives up one it keeps. */
    const val BOOST_MIN_BATTERY = 20
    /** Direct's batch interval while a watcher's request holds. */
    const val BOOST_SEND = 15L
    /** The relay takes 1 to 60 minutes; a request said longer is cut to that, with a minute of slack for the clocks. */
    const val BOOST_MAX_S = 3600 + 60
    /** A long run lasts 7 days at most; Direct 6 hours without Ozimut, the account's cap with it. */
    const val LONG_CAP_S = 7 * 86_400
    const val DIRECT_CAP_S = 6 * 3600
    /** Standing still: under [STILL_M] metres for 5 minutes in Direct, 30 in a long run. */
    const val STILL_DIRECT_S = 300
    const val STILL_LONG_S = 1800
    const val STILL_M = 15.0

    /** What a request does: nothing (already seen), refused, Direct until its end, or the long pace again. */
    enum class Verdict { OLD, REFUSE, APPLY, BACK }

    fun verdict(choice: PaceChoice, b: Boost, lastAt: Long, battery: Int?, nowSec: Long): Verdict = when {
        b.at <= lastAt -> Verdict.OLD
        !choice.long || !choice.remote -> Verdict.REFUSE
        b.until <= nowSec -> Verdict.BACK
        battery != null && battery < BOOST_MIN_BATTERY -> Verdict.REFUSE
        else -> Verdict.APPLY
    }

    /** The pace after a request (or none) and the clock: the request kept, the last request's `at` seen, whether one was handled. */
    data class Step(val applied: Boost?, val lastAt: Long, val handled: Boolean)

    fun step(choice: PaceChoice, applied: Boost?, lastAt: Long, pending: Boost?, battery: Int?, nowSec: Long): Step {
        var a = applied
        var at = lastAt
        var handled = false
        if (pending != null) {
            when (verdict(choice, pending, lastAt, battery, nowSec)) {
                Verdict.OLD -> {}
                Verdict.REFUSE -> handled = true
                Verdict.BACK -> { a = null; handled = true }
                Verdict.APPLY -> {
                    a = Boost(minOf(pending.until, nowSec + BOOST_MAX_S), pending.at, pending.by)
                    handled = true
                }
            }
            at = maxOf(at, pending.at)
        }
        // the request's time is over, or the battery came first
        if (a != null && (a.until <= nowSec || (battery != null && battery < BOOST_MIN_BATTERY))) a = null
        if (!choice.long) a = null
        return Step(a, at, handled)
    }

    /** Whether the phone runs Direct now: a Direct run, or a long run while a watcher's request holds. */
    fun live(choice: PaceChoice, applied: Boost?, nowSec: Long) = !choice.long || (applied != null && applied.until > nowSec)

    fun cap(choice: PaceChoice, paired: Boolean, accountCap: Int) = when {
        choice.long -> LONG_CAP_S
        paired -> accountCap
        else -> DIRECT_CAP_S
    }

    fun stillWindow(choice: PaceChoice) = if (choice.long) STILL_LONG_S else STILL_DIRECT_S

    /** A fix may come this much after the window's start and still open it (a long run's fixes come every `fix` seconds). */
    fun stillSlack(choice: PaceChoice) = if (choice.long) choice.fix + 10 else 10

    /**
     * The pace a batch reports. Direct: one fix a second, [liveSend] the sender's interval (15 or 120). A long run keeps its
     * own intervals whether a watcher's request holds or not; `boost` says until when it runs Direct, `by` who asked.
     */
    fun now(choice: PaceChoice, applied: Boost?, nowSec: Long, liveSend: Int): PaceNow {
        if (!choice.long) return PaceNow(LIVE, 1, liveSend, false, 0, "")
        val a = applied?.takeIf { it.until > nowSec }
        return PaceNow(LONG, choice.fix, choice.send, choice.remote, a?.until ?: 0, a?.by ?: "")
    }

    /**
     * The seconds a sender waits before its next batch: the server's [next], but in a long run without a request never less
     * than the long pace's `send` (a server not yet told the pace would otherwise wake the phone), and while a request holds
     * never more than Direct's 15 s.
     */
    fun nextSend(pace: PaceNow, nowSec: Long, next: Long): Long = when {
        pace.boosted(nowSec) -> minOf(next, BOOST_SEND)
        pace.long -> maxOf(next, pace.send.toLong())
        else -> next
    }

    fun json(p: PaceNow): JSONObject = JSONObject()
        .put("mode", p.mode).put("fix", p.fix).put("send", p.send).put("remote", p.remote).put("boost", p.boost).put("by", p.by)

    /** `pace` as a watcher reads it; null when absent (a batch without it is Direct). */
    fun parse(o: JSONObject?): PaceNow? {
        if (o == null) return null
        val mode = o.optString("mode", LIVE).takeIf { it == LONG } ?: LIVE
        return PaceNow(
            mode, o.optInt("fix", 1), o.optInt("send", 0), o.optBoolean("remote", false),
            secs(o.opt("boost")), o.optString("by", "").takeIf { it != "null" } ?: ""
        )
    }

    /** `boost` as the relay gives it, `{ until, at, by }`, or null. */
    fun parseBoost(o: JSONObject?): Boost? {
        if (o == null) return null
        val at = secs(o.opt("at"))
        if (at <= 0) return null
        return Boost(secs(o.opt("until")), at, o.optString("by", "").takeIf { it != "null" } ?: "")
    }

    /** A time as Unix seconds, milliseconds or a number in a text -> Unix seconds (0 unknown). */
    fun secs(v: Any?): Long = when (v) {
        is Number -> v.toLong().let { if (it > 100_000_000_000L) it / 1000 else it }
        is String -> v.toLongOrNull()?.let { if (it > 100_000_000_000L) it / 1000 else it }
            ?: try { java.time.Instant.parse(v).epochSecond } catch (e: Exception) { 0L }
        else -> 0L
    }
}

/** Standing still: every good fix of the last [windowS] seconds within 15 m of the latest; said once until the runner moves. */
class StillDetector(private val windowS: Int, private val slackS: Int) {
    private val recent = ArrayDeque<Fix>()
    private var anchor: Fix? = null

    /** True when this fix makes the runner newly still. */
    fun onFix(f: Fix, runStartedSec: Long): Boolean {
        if (f.ac > 30) return false
        recent.addLast(f)
        while (recent.isNotEmpty() && f.t - recent.first().t > windowS) recent.removeFirst()
        val a = anchor
        if (a != null) {
            if (Geo.metres(a.la, a.lo, f.la, f.lo) > PaceRules.STILL_M) anchor = null
            return false
        }
        if (f.t - runStartedSec >= windowS && recent.first().t <= f.t - windowS + slackS &&
            recent.all { Geo.metres(it.la, it.lo, f.la, f.lo) <= PaceRules.STILL_M }
        ) {
            anchor = f
            return true
        }
        return false
    }
}

/** The run's pace on this phone, kept in RunState's preferences (so it goes with the run). */
object PaceState {
    private fun p(c: Context) = c.getSharedPreferences("run", Context.MODE_PRIVATE)

    /** Written with the run at its start (RunState.begin). */
    fun write(e: SharedPreferences.Editor, choice: PaceChoice): SharedPreferences.Editor =
        e.putBoolean("pace_long", choice.long).putInt("pace_fix", choice.fix).putInt("pace_send", choice.send)
            .putBoolean("pace_remote", choice.remote)

    fun choice(c: Context): PaceChoice {
        val p = p(c)
        if (!p.getBoolean("pace_long", false)) return PaceChoice.LIVE
        return PaceChoice.long(
            p.getInt("pace_fix", PaceChoice.FIX_DEFAULT), p.getInt("pace_send", PaceChoice.SEND_DEFAULT), p.getBoolean("pace_remote", true)
        )
    }

    /** The watcher's request the phone keeps now, if any. */
    fun applied(c: Context): Boost? {
        val p = p(c)
        val until = p.getLong("pace_until", 0)
        if (until <= 0) return null
        return Boost(until, p.getLong("pace_uat", 0), p.getString("pace_by", "") ?: "")
    }

    private fun pending(c: Context): Boost? {
        val p = p(c)
        val at = p.getLong("pace_p_at", 0)
        if (at <= 0) return null
        return Boost(p.getLong("pace_p_until", 0), at, p.getString("pace_p_by", "") ?: "")
    }

    /** A request heard (a push, or a batch's answer): kept until the service settles it. True when it is new. */
    @Synchronized fun offer(c: Context, b: Boost): Boolean {
        val p = p(c)
        if (b.at <= maxOf(p.getLong("pace_at", 0), p.getLong("pace_p_at", 0))) return false
        p.edit().putLong("pace_p_until", b.until).putLong("pace_p_at", b.at).putString("pace_p_by", b.by).commit()
        return true
    }

    class Settled(val liveBefore: Boolean, val liveAfter: Boolean, val handled: Boolean, val changed: Boolean)

    /** Settles a request waiting and the clock (a request over, a low battery). */
    @Synchronized fun settle(c: Context, nowSec: Long, battery: Int?): Settled {
        val ch = choice(c)
        val before = applied(c)
        val waiting = pending(c)
        val s = PaceRules.step(ch, before, p(c).getLong("pace_at", 0), waiting, battery, nowSec)
        // nothing heard and nothing over: nothing written (this runs every 10 s)
        if (waiting == null && s.applied == before) {
            val live = PaceRules.live(ch, before, nowSec)
            return Settled(live, live, false, false)
        }
        val e = p(c).edit().remove("pace_p_until").remove("pace_p_at").remove("pace_p_by").putLong("pace_at", s.lastAt)
        val a = s.applied
        if (a == null) e.remove("pace_until").remove("pace_uat").remove("pace_by")
        else e.putLong("pace_until", a.until).putLong("pace_uat", a.at).putString("pace_by", a.by)
        e.commit()
        return Settled(PaceRules.live(ch, before, nowSec), PaceRules.live(ch, a, nowSec), s.handled, a != before)
    }

    fun live(c: Context, nowSec: Long) = PaceRules.live(choice(c), applied(c), nowSec)

    fun now(c: Context, nowSec: Long, liveSend: Int): PaceNow = PaceRules.now(choice(c), applied(c), nowSec, liveSend)
}

/**
 * Fixes delivered together, for a long run: the phone app's own uses Google Play services' fused location (LongRun.kt), set
 * at the app's start in [FixSources]; without it (the watch, a phone without Play services) TrackerService asks the
 * platform's location, which batches from Android 12.
 */
interface BatchedFixes {
    /**
     * Fixes every [fixMs], delivered on [looper] up to [maxDelayMs] late so that the processor sleeps in between. False when
     * it cannot start; [onFailed] when it fails later (the caller then asks the platform).
     */
    fun start(c: Context, fixMs: Long, maxDelayMs: Long, looper: Looper, onFixes: (List<Location>) -> Unit, onFailed: () -> Unit): Boolean

    fun stop()
}

object FixSources {
    @Volatile var long: (() -> BatchedFixes)? = null
}
