package com.ozimut.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BatchEncoderTest {
    private fun sums(a: JSONArray): List<Long> {
        var acc = 0L
        return (0 until a.length()).map { acc += a.getLong(it); acc }
    }

    @Test
    fun encodesDeltasAndDecodesBack() {
        val fixes = listOf(
            Fix(1795253712, 48412345, 2634567, 5, 87),
            Fix(1795253713, 48412357, 2634547, 5, 87),
            Fix(1795253714, 48412354, 2634529, 6, 88),
        )
        val json = JSONObject(BatchEncoder.encode(Batch("r_20261121T093512_ab12", 42, "run", fixes), "watchers", 71, false, 3, 0))
        assertEquals(1, json.getInt("v"))
        assertEquals("r_20261121T093512_ab12", json.getString("run"))
        assertEquals(42, json.getInt("seq"))
        assertEquals("run", json.getString("state"))
        assertEquals("watchers", json.getString("share"))
        assertEquals(1795253712L, json.getLong("t0"))
        assertEquals(listOf(0L, 1L, 1L), (0 until 3).map { json.getJSONArray("dt").getLong(it) })
        assertEquals(listOf(48412345L, 12L, -3L), (0 until 3).map { json.getJSONArray("la").getLong(it) })
        assertEquals(listOf(2634567L, -20L, -18L), (0 until 3).map { json.getJSONArray("lo").getLong(it) })
        assertEquals(fixes.map { it.la.toLong() }, sums(json.getJSONArray("la")))
        assertEquals(fixes.map { it.lo.toLong() }, sums(json.getJSONArray("lo")))
        assertEquals(fixes.map { it.ac.toLong() }, (0 until 3).map { json.getJSONArray("ac").getLong(it) })   // plain values
        assertEquals(fixes.map { it.al!!.toLong() }, sums(json.getJSONArray("al")))
        assertEquals(71, json.getInt("bat"))
        assertFalse(json.getBoolean("lp"))
        assertEquals(3, json.getInt("left"))
    }

    @Test
    fun emptyBatchIsAHeartbeat() {
        val json = JSONObject(BatchEncoder.encode(Batch("r_x", 7, "run", emptyList()), "private", null, true, 0, 1795253999))
        assertEquals(1795253999L, json.getLong("t0"))
        assertEquals(0, json.getJSONArray("dt").length())
        assertEquals(0, json.getJSONArray("la").length())
        assertFalse(json.has("al"))
        assertFalse(json.has("bat"))
        assertTrue(json.getBoolean("lp"))
    }

    @Test
    fun altitudeLeftOutWhenAFixHasNone() {
        val fixes = listOf(Fix(10, 1, 2, 3, 100), Fix(11, 1, 2, 3, null))
        val json = JSONObject(BatchEncoder.encode(Batch("r", 1, "end", fixes), "watchers", 50, false, 0, 0))
        assertFalse(json.has("al"))
        assertEquals("end", json.getString("state"))
    }

    @Test
    fun stringsAreEscaped() {
        val json = JSONObject(BatchEncoder.encode(Batch("r\"\\", 1, "run", emptyList()), "watchers", null, false, 0, 0))
        assertEquals("r\"\\", json.getString("run"))
    }
}
