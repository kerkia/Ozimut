package com.ozimut.app

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/**
 * Every run kept on this phone (docs/track/folloz.md rule 3): `filesDir/runs/<run>.csv`, a line a fix « t,la,lo,ac,al »,
 * written as the fixes come. A GPX file is made from it when the runner wants one. A run recorded on the Wear OS watch and
 * handed over by it (`WatchRuns`) is kept the same way, with an empty `<run>.watch` beside it.
 */
object RunLog {
    class Info(val run: String, val file: File, val start: Long, val end: Long, val points: Int, val metres: Double,
               val watch: Boolean = false)

    fun dir(c: Context) = File(c.filesDir, "runs").apply { mkdirs() }

    private fun safe(run: String) = run.filter { it.isLetterOrDigit() || it == '_' }

    private fun file(c: Context, run: String) = File(dir(c), safe(run) + ".csv")

    private fun watchMark(c: Context, run: String) = File(dir(c), safe(run) + ".watch")

    @Synchronized fun append(c: Context, run: String, f: Fix) {
        try {
            FileOutputStream(file(c, run), true).use {
                it.write("${f.t},${f.la},${f.lo},${f.ac},${f.al ?: ""}\n".toByteArray(Charsets.US_ASCII))
            }
        } catch (e: Exception) {
            // a full disk: the run still goes to the relay and to Ozimut
        }
    }

    fun read(file: File): List<Fix> {
        val out = ArrayList<Fix>()
        try {
            file.forEachLine { line ->
                val p = line.split(',')
                if (p.size >= 4) {
                    val t = p[0].toLongOrNull() ?: return@forEachLine
                    out += Fix(t, p[1].toIntOrNull() ?: 0, p[2].toIntOrNull() ?: 0, p[3].toIntOrNull() ?: 0, p.getOrNull(4)?.toIntOrNull())
                }
            }
        } catch (e: Exception) {
            // unreadable: what was read
        }
        return out
    }

    /** The runs kept, the latest first. */
    fun runs(c: Context): List<Info> =
        (dir(c).listFiles { f -> f.name.endsWith(".csv") } ?: emptyArray()).mapNotNull { f ->
            val fixes = read(f)
            if (fixes.isEmpty()) return@mapNotNull null
            val run = f.name.removeSuffix(".csv")
            Info(run, f, fixes.first().t, fixes.last().t, fixes.size, Geo.length(fixes), watchMark(c, run).exists())
        }.sortedByDescending { it.start }

    fun delete(c: Context, run: String) {
        file(c, run).delete()
        watchMark(c, run).delete()
    }

    /** A run the watch handed over, kept as the phone's own (a second copy of the same run replaces the first). */
    @Synchronized fun importWatch(c: Context, run: String, csv: ByteArray): Boolean {
        if (safe(run).isEmpty() || csv.isEmpty()) return false
        return try {
            val tmp = File(dir(c), safe(run) + ".part")
            tmp.writeBytes(csv)
            val f = file(c, run)
            f.delete()
            if (!tmp.renameTo(f)) { tmp.delete(); return false }
            watchMark(c, run).createNewFile()
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Keeps the [keep] latest runs (the watch's small storage). */
    fun prune(c: Context, keep: Int) {
        val all = (dir(c).listFiles { f -> f.name.endsWith(".csv") } ?: return).sortedByDescending { it.lastModified() }
        all.drop(keep).forEach { it.delete() }
    }

    /** A GPX file of the fixes in the cache, ready to be shared (`cacheDir/gpx/`). */
    fun gpxFile(c: Context, name: String, fixes: List<Fix>): File {
        val d = File(c.cacheDir, "gpx").apply { mkdirs() }
        val safe = name.replace(Regex("[^\\p{L}\\p{N} _-]"), "").trim().ifBlank { "folloz" }.take(60)
        val f = File(d, "$safe.gpx")
        f.writeText(Gpx.write(name, fixes), Charsets.UTF_8)
        return f
    }
}
