package com.ozimut.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BatcherTest {
    private val run = "r_20261121T093512_ab12"

    private fun fill(store: FixStore, n: Int, from: Long = 1000) {
        for (i in 0 until n) store.add(run, Fix(from + i, 48_000_000 + i, 2_000_000 - i, 5, null))
    }

    @Test
    fun heartbeatWhenNothingWaits() {
        val store = MemoryFixStore()
        val b = Batcher(store)
        assertNull(b.next(run, ending = false, help = false, heartbeat = false))
        val hb = b.next(run, ending = false, help = false, heartbeat = true)
        assertNotNull(hb)
        assertEquals(1, hb!!.seq)
        assertTrue(hb.fixes.isEmpty())
    }

    @Test
    fun batchesHoldAtMostTheMaximumAndStayTheSameUntilAcknowledged() {
        val store = MemoryFixStore()
        val b = Batcher(store, max = 600)
        fill(store, 1500)
        val first = b.next(run, false, false, true)!!
        assertEquals(600, first.fixes.size)
        // Not acknowledged: the same batch again, with the same fixes.
        val again = b.next(run, false, false, false)!!
        assertEquals(first, again)
        store.ack(run, 1)
        assertEquals(900, store.count(run))
        val second = b.next(run, false, false, false)!!
        assertEquals(2, second.seq)
        assertEquals(1600L, second.fixes.first().t)
        store.ack(run, 2)
        // 300 left, below the maximum: nothing to send before the next heartbeat.
        assertNull(b.next(run, false, false, false))
        assertEquals(300, b.next(run, false, false, true)!!.fixes.size)
    }

    @Test
    fun gapInAcknowledgementResendsFromTheNext() {
        val store = MemoryFixStore()
        val b = Batcher(store, max = 10)
        fill(store, 30)
        val one = b.next(run, false, false, true)!!
        // Imagine 1 was sent but answered with ack 0: it is resent.
        store.ack(run, 0)
        assertEquals(one, b.next(run, false, false, false))
        store.ack(run, 1)
        assertEquals(2, b.next(run, false, false, false)!!.seq)
    }

    @Test
    fun endIsTheLastBatch() {
        val store = MemoryFixStore()
        val b = Batcher(store, max = 10)
        fill(store, 25)
        val a = b.next(run, ending = true, help = false, heartbeat = false)!!
        assertEquals("run", a.state)
        store.ack(run, a.seq)
        val c = b.next(run, true, false, false)!!
        assertEquals("run", c.state)
        store.ack(run, c.seq)
        val e = b.next(run, true, false, false)!!
        assertEquals("end", e.state)
        assertEquals(5, e.fixes.size)
        store.ack(run, e.seq)
        assertEquals(0, store.count(run))
    }

    @Test
    fun helpGoesAtOnceEvenEmpty() {
        val store = MemoryFixStore()
        val b = Batcher(store)
        val h = b.next(run, ending = false, help = true, heartbeat = false)!!
        assertEquals("help", h.state)
        assertTrue(h.fixes.isEmpty())
    }

    @Test
    fun splitKeepsOrderAndEnd() {
        val store = MemoryFixStore()
        val b = Batcher(store, max = 10)
        fill(store, 15)
        val one = b.next(run, false, false, true)!!       // seq 1: 10 fixes
        val two = store.createBatch(run, "end", 10)          // seq 2: 5 fixes, end
        assertEquals(2, two.seq)
        assertTrue(store.split(run, one.seq))
        val open = store.openBatches(run)
        assertEquals(listOf(1, 2, 3), open.map { it.seq })
        assertEquals(listOf(5, 5, 5), open.map { it.fixes.size })
        assertEquals(listOf("run", "run", "end"), open.map { it.state })
        assertEquals((1000L until 1015L).toList(), open.flatMap { b2 -> b2.fixes.map { it.t } })
        // The next new batch is numbered after them.
        store.ack(run, 3)
        fill(store, 1, 2000)
        assertEquals(4, store.createBatch(run, "run", 10).seq)
    }

    @Test
    fun singleFixCannotSplit() {
        val store = MemoryFixStore()
        fill(store, 1)
        val one = Batcher(store).next(run, false, false, true)!!
        assertFalse(store.split(run, one.seq))
    }

    @Test
    fun dropForgetsTheRun() {
        val store = MemoryFixStore()
        fill(store, 5)
        store.add("other", Fix(1, 1, 1, 1))
        store.drop(run)
        assertEquals(0, store.count(run))
        assertEquals(1, store.count("other"))
        assertEquals(1, store.createBatch(run, "run", 10).seq)
    }
}
