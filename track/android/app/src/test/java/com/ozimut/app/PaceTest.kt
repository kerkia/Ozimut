package com.ozimut.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pace's rules (docs/track/folloz.md « Pace »): a long run, a watcher's request for Direct, standing still, the cap. */
class PaceTest {
    private val now = 1_795_253_712L
    private val long = PaceChoice.long(30, 600, true)

    @Test
    fun longRunsTakeTheIntervalsOffered() {
        assertEquals(PaceChoice(true, 30, 600, true), long)
        assertEquals(PaceChoice(true, 15, 300, false), PaceChoice.long(10, 200, false))
        assertEquals(PaceChoice(true, 60, 900, true), PaceChoice.long(90, 3600, true))
        assertFalse(PaceChoice.LIVE.long)
    }

    @Test
    fun aRequestIsAppliedOnceAndRefusedWhenItMayNotBe() {
        val b = Boost(now + 900, now, "w2345678")
        assertEquals(PaceRules.Verdict.APPLY, PaceRules.verdict(long, b, 0, 80, now))
        assertEquals(PaceRules.Verdict.APPLY, PaceRules.verdict(long, b, 0, null, now))
        // idempotent on `at`
        assertEquals(PaceRules.Verdict.OLD, PaceRules.verdict(long, b, now, 80, now))
        // the runner did not allow it, a Direct run, a low battery
        assertEquals(PaceRules.Verdict.REFUSE, PaceRules.verdict(PaceChoice.long(30, 600, false), b, 0, 80, now))
        assertEquals(PaceRules.Verdict.REFUSE, PaceRules.verdict(PaceChoice.LIVE, b, 0, 80, now))
        assertEquals(PaceRules.Verdict.REFUSE, PaceRules.verdict(long, b, 0, 19, now))
        assertEquals(PaceRules.Verdict.APPLY, PaceRules.verdict(long, b, 0, 20, now))
        // `min` 0: until = now, the long pace again, whatever the battery
        assertEquals(PaceRules.Verdict.BACK, PaceRules.verdict(long, Boost(now, now, "w"), 0, 5, now))
    }

    @Test
    fun stepsKeepTheRequestUntilItsEnd() {
        val b = Boost(now + 900, now, "w2345678")
        val s1 = PaceRules.step(long, null, 0, b, 80, now)
        assertEquals(b, s1.applied)
        assertEquals(now, s1.lastAt)
        assertTrue(s1.handled)
        assertTrue(PaceRules.live(long, s1.applied, now + 10))
        // the same request again changes nothing
        val s2 = PaceRules.step(long, s1.applied, s1.lastAt, b, 80, now + 10)
        assertEquals(b, s2.applied)
        assertFalse(s2.handled)
        // its end: the long pace again
        val s3 = PaceRules.step(long, s2.applied, s2.lastAt, null, 80, now + 900)
        assertNull(s3.applied)
        assertFalse(PaceRules.live(long, s3.applied, now + 900))
        // the battery comes first
        val s4 = PaceRules.step(long, b, now, null, 15, now + 60)
        assertNull(s4.applied)
        // asked to go back
        val s5 = PaceRules.step(long, b, now, Boost(now + 120, now + 120, "w"), 80, now + 120)
        assertNull(s5.applied)
        assertEquals(now + 120, s5.lastAt)
        assertTrue(s5.handled)
        // refused: seen, nothing kept
        val s6 = PaceRules.step(long, null, 0, b, 10, now)
        assertNull(s6.applied)
        assertEquals(now, s6.lastAt)
        assertTrue(s6.handled)
        // a request said longer than an hour is cut
        val s7 = PaceRules.step(long, null, 0, Boost(now + 86_400, now, "w"), 80, now)
        assertEquals(now + PaceRules.BOOST_MAX_S, s7.applied!!.until)
        // a Direct run never keeps one
        assertNull(PaceRules.step(PaceChoice.LIVE, b, 0, null, 80, now).applied)
    }

    @Test
    fun theBatchSaysThePace() {
        val live = PaceRules.now(PaceChoice.LIVE, null, now, 120)
        assertEquals(PaceNow("live", 1, 120, false, 0, ""), live)
        val slow = PaceRules.now(long, null, now, 120)
        assertEquals(PaceNow("long", 30, 600, true, 0, ""), slow)
        val boosted = PaceRules.now(long, Boost(now + 300, now, "w2345678"), now, 15)
        assertEquals(PaceNow("long", 30, 600, true, now + 300, "w2345678"), boosted)
        assertTrue(boosted.boosted(now))
        assertEquals(slow, PaceRules.now(long, Boost(now - 1, now - 600, "w"), now, 15))

        val j = PaceRules.json(boosted)
        assertEquals("long", j.getString("mode"))
        assertEquals(30, j.getInt("fix"))
        assertEquals(600, j.getInt("send"))
        assertTrue(j.getBoolean("remote"))
        assertEquals(now + 300, j.getLong("boost"))
        assertEquals("w2345678", j.getString("by"))
        assertEquals(boosted, PaceRules.parse(j))
        assertNull(PaceRules.parse(null))
    }

    @Test
    fun theBatchToOzimutCarriesThePace() {
        val fixes = listOf(Fix(now, 48412345, 2634567, 5))
        val p = PaceNow("long", 60, 900, false, 0, "")
        val j = JSONObject(BatchEncoder.encode(Batch("r_x", 1, "run", fixes), "watchers", 50, false, 0, now, p))
        val o = j.getJSONObject("pace")
        assertEquals("long", o.getString("mode"))
        assertEquals(60, o.getInt("fix"))
        assertEquals(900, o.getInt("send"))
        assertFalse(o.getBoolean("remote"))
        assertEquals(0L, o.getLong("boost"))
        assertEquals("", o.getString("by"))
        assertFalse(JSONObject(BatchEncoder.encode(Batch("r_x", 1, "run", fixes), "watchers", 50, false, 0, now)).has("pace"))
    }

    @Test
    fun theRelaysBoostIsRead() {
        val b = PaceRules.parseBoost(JSONObject().put("until", now + 300).put("at", now).put("by", "w2345678"))
        assertEquals(Boost(now + 300, now, "w2345678"), b)
        // milliseconds and texts too
        assertEquals(Boost(now + 300, now, ""), PaceRules.parseBoost(JSONObject().put("until", (now + 300) * 1000).put("at", "$now")))
        assertNull(PaceRules.parseBoost(null))
        assertNull(PaceRules.parseBoost(JSONObject()))
    }

    @Test
    fun theSendersWaitAsThePaceSays() {
        val slow = PaceRules.now(long, null, now, 0)
        assertEquals(600L, PaceRules.nextSend(slow, now, 120))
        assertEquals(900L, PaceRules.nextSend(slow, now, 900))
        val boosted = PaceRules.now(long, Boost(now + 300, now, "w"), now, 0)
        assertEquals(15L, PaceRules.nextSend(boosted, now, 600))
        assertEquals(10L, PaceRules.nextSend(boosted, now, 10))
        assertEquals(120L, PaceRules.nextSend(PaceRules.now(PaceChoice.LIVE, null, now, 120), now, 120))
    }

    @Test
    fun capsAndStillWindows() {
        assertEquals(7 * 86_400, PaceRules.cap(long, paired = true, accountCap = 9000))
        assertEquals(9000, PaceRules.cap(PaceChoice.LIVE, paired = true, accountCap = 9000))
        assertEquals(6 * 3600, PaceRules.cap(PaceChoice.LIVE, paired = false, accountCap = 0))
        assertEquals(300, PaceRules.stillWindow(PaceChoice.LIVE))
        assertEquals(1800, PaceRules.stillWindow(long))
    }

    @Test
    fun standingStillInDirect() {
        val d = StillDetector(PaceRules.stillWindow(PaceChoice.LIVE), PaceRules.stillSlack(PaceChoice.LIVE))
        val start = now
        var said = 0
        for (t in 0..400) if (d.onFix(Fix(start + t, 48412345, 2634567, 5), start)) said++
        assertEquals(1, said)
        // moving on, then still again: said again
        var lo = 2634567
        for (t in 401..460) { lo += 100; d.onFix(Fix(start + t, 48412345, lo, 5), start) }
        for (t in 461..800) if (d.onFix(Fix(start + t, 48412345, lo, 5), start)) said++
        assertEquals(2, said)
    }

    @Test
    fun standingStillInALongRunTakesHalfAnHour() {
        val ch = PaceChoice.long(60, 600, true)
        val d = StillDetector(PaceRules.stillWindow(ch), PaceRules.stillSlack(ch))
        val start = now + 7 // fixes a minute apart, not on the run's second
        var firstSaid = -1L
        var t = start + 3
        while (t < start + 3600) {
            if (d.onFix(Fix(t, 48412345, 2634567, 8), start) && firstSaid < 0) firstSaid = t - start
            t += 60
        }
        assertTrue("said at $firstSaid", firstSaid in 1800L..1900L)
        // five minutes still is not enough in a long run
        val d2 = StillDetector(PaceRules.stillWindow(ch), PaceRules.stillSlack(ch))
        var said = false
        for (k in 0..10) said = d2.onFix(Fix(start + k * 60L, 48412345, 2634567 + (k / 6) * 1000, 8), start) || said
        assertFalse(said)
    }
}
