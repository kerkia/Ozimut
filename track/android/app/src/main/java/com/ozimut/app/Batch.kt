package com.ozimut.app

/*
 * The tracker's queue and batches, in plain Kotlin (no Android class): docs/track/design.md
 * « Device protocol » › « Sending ». Tested by the JVM unit tests.
 */

/** One GPS fix: whole seconds since 1970 (UTC), millionths of a degree, accuracy and altitude in metres. */
data class Fix(val t: Long, val la: Int, val lo: Int, val ac: Int, val al: Int? = null)

/** A numbered batch of a run. Once numbered, a batch always holds the same fixes (the server ignores a number it holds). */
data class Batch(val run: String, val seq: Int, val state: String, val fixes: List<Fix>)

/** Where the fixes wait until the server acknowledges them. */
interface FixStore {
    fun add(run: String, fix: Fix)
    /** Fixes of the run not yet acknowledged (in batches or not). */
    fun count(run: String): Int
    /** Fixes of the run not yet in a batch. */
    fun unbatchedCount(run: String): Int
    /** The numbered batches not yet acknowledged, lowest number first. */
    fun openBatches(run: String): List<Batch>
    /** Numbers the next batch with the oldest fixes not in a batch (at most [max], possibly none). */
    fun createBatch(run: String, state: String, max: Int): Batch
    /** The server holds every batch up to [seq]: they and their fixes go. */
    fun ack(run: String, seq: Int)
    /** Splits batch [seq] in two (413): its second half becomes seq + 1, the later batches move up by one. */
    fun split(run: String, seq: Int): Boolean
    /** Forgets the whole run. */
    fun drop(run: String)
}

object States {
    const val RUN = "run"
    const val END = "end"
    const val HELP = "help"
}

/** Decides the next batch to send. */
class Batcher(private val store: FixStore, val max: Int = MAX_FIXES) {
    /**
     * The first batch not yet acknowledged, else a new one when there is reason to send:
     * help asked, the run ending (the last batch says « end »), a full batch waiting, or a heartbeat.
     * Null when nothing has to go now.
     */
    fun next(run: String, ending: Boolean, help: Boolean, heartbeat: Boolean): Batch? {
        store.openBatches(run).firstOrNull()?.let { return it }
        val waiting = store.unbatchedCount(run)
        val state = when {
            help -> States.HELP
            ending && waiting <= max -> States.END
            else -> States.RUN
        }
        val wanted = help || ending || heartbeat || waiting >= max
        if (!wanted) return null
        return store.createBatch(run, state, max)
    }

    companion object {
        const val MAX_FIXES = 600
    }
}

/** The batch as the server reads it: in dt, la, lo and al the first value is absolute, the others differences; ac plain. */
object BatchEncoder {
    /** Accuracies are plain values, each its own fix's (docs/track/design.md, settled 2026-11-21 as the iPhone and Garmin send them). */
    var accuracyAsDeltas = false

    /** [pace]: the pace kept (docs/track/ozitrac.md « Pace »; design.md « Sending »), left out when null (Direct). */
    fun encode(b: Batch, share: String, battery: Int?, lowPower: Boolean, left: Int, nowSec: Long, pace: PaceNow? = null): String {
        val f = b.fixes
        val sb = StringBuilder(64 + f.size * 24)
        sb.append("{\"v\":1")
        str(sb, "run", b.run)
        num(sb, "seq", b.seq.toLong())
        str(sb, "state", b.state)
        str(sb, "share", share)
        num(sb, "t0", if (f.isEmpty()) nowSec else f[0].t)
        list(sb, "dt", f.size) { i -> if (i == 0) 0L else f[i].t - f[i - 1].t }
        list(sb, "la", f.size) { i -> if (i == 0) f[0].la.toLong() else (f[i].la - f[i - 1].la).toLong() }
        list(sb, "lo", f.size) { i -> if (i == 0) f[0].lo.toLong() else (f[i].lo - f[i - 1].lo).toLong() }
        list(sb, "ac", f.size) { i ->
            if (i == 0 || !accuracyAsDeltas) f[i].ac.toLong() else (f[i].ac - f[i - 1].ac).toLong()
        }
        if (f.isNotEmpty() && f.all { it.al != null }) {
            list(sb, "al", f.size) { i -> if (i == 0) f[0].al!!.toLong() else (f[i].al!! - f[i - 1].al!!).toLong() }
        }
        if (battery != null) num(sb, "bat", battery.toLong())
        sb.append(",\"lp\":").append(if (lowPower) "true" else "false")
        num(sb, "left", left.toLong())
        if (pace != null) {
            sb.append(",\"pace\":{\"mode\":")
            quoted(sb, pace.mode)
            num(sb, "fix", pace.fix.toLong())
            num(sb, "send", pace.send.toLong())
            sb.append(",\"remote\":").append(if (pace.remote) "true" else "false")
            num(sb, "boost", pace.boost)
            str(sb, "by", pace.by)
            sb.append('}')
        }
        sb.append('}')
        return sb.toString()
    }

    private fun str(sb: StringBuilder, k: String, v: String) {
        sb.append(",\"").append(k).append("\":")
        quoted(sb, v)
    }

    private fun quoted(sb: StringBuilder, v: String) {
        sb.append('"')
        for (c in v) {
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c < ' ' -> sb.append(String.format("\\u%04x", c.code))
                else -> sb.append(c)
            }
        }
        sb.append('"')
    }

    private fun num(sb: StringBuilder, k: String, v: Long) {
        sb.append(",\"").append(k).append("\":").append(v)
    }

    private inline fun list(sb: StringBuilder, k: String, n: Int, value: (Int) -> Long) {
        sb.append(",\"").append(k).append("\":[")
        for (i in 0 until n) {
            if (i > 0) sb.append(',')
            sb.append(value(i))
        }
        sb.append(']')
    }
}

/** The same contract in memory: the tests' store, and the model the SQLite store follows. */
class MemoryFixStore : FixStore {
    private class Row(val run: String, val fix: Fix, var seq: Int?)

    private val rows = mutableListOf<Row>()
    private val batches = mutableMapOf<Pair<String, Int>, String>()
    private val nextSeq = mutableMapOf<String, Int>()

    @Synchronized override fun add(run: String, fix: Fix) {
        rows += Row(run, fix, null)
    }

    @Synchronized override fun count(run: String) = rows.count { it.run == run }

    @Synchronized override fun unbatchedCount(run: String) = rows.count { it.run == run && it.seq == null }

    @Synchronized override fun openBatches(run: String): List<Batch> =
        batches.keys.filter { it.first == run }.map { it.second }.sorted().map { s ->
            Batch(run, s, batches.getValue(run to s), rows.filter { it.run == run && it.seq == s }.map { it.fix })
        }

    @Synchronized override fun createBatch(run: String, state: String, max: Int): Batch {
        val s = nextSeq[run] ?: 1
        nextSeq[run] = s + 1
        val take = rows.filter { it.run == run && it.seq == null }.take(max)
        take.forEach { it.seq = s }
        batches[run to s] = state
        return Batch(run, s, state, take.map { it.fix })
    }

    @Synchronized override fun ack(run: String, seq: Int) {
        rows.removeAll { it.run == run && it.seq != null && it.seq!! <= seq }
        batches.keys.removeAll { it.first == run && it.second <= seq }
    }

    @Synchronized override fun split(run: String, seq: Int): Boolean {
        val st = batches[run to seq] ?: return false
        val mine = rows.filter { it.run == run && it.seq == seq }
        if (mine.size < 2) return false
        val later = batches.keys.filter { it.first == run && it.second > seq }.map { it.second }.sortedDescending()
        for (s in later) {
            val state = batches.remove(run to s)!!
            batches[run to s + 1] = state
            rows.filter { it.run == run && it.seq == s }.forEach { it.seq = s + 1 }
        }
        mine.drop(mine.size / 2).forEach { it.seq = seq + 1 }
        val (a, b) = splitStates(st)
        batches[run to seq] = a
        batches[run to seq + 1] = b
        nextSeq[run] = (nextSeq[run] ?: (seq + 1)) + 1
        return true
    }

    @Synchronized override fun drop(run: String) {
        rows.removeAll { it.run == run }
        batches.keys.removeAll { it.first == run }
        nextSeq.remove(run)
    }

    companion object {
        /** « end » stays on the last half, « help » on the first. */
        fun splitStates(st: String): Pair<String, String> = when (st) {
            States.END -> States.RUN to States.END
            States.HELP -> States.HELP to States.RUN
            else -> st to st
        }
    }
}
