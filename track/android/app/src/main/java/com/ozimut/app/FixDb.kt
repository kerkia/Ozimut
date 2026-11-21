package com.ozimut.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** The queue on disk: every fix is written here as soon as it comes, and stays until the server acknowledges it. */
class FixDb private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "track.db", null, 1), FixStore {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE fixes (id INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, t INTEGER NOT NULL, " +
                "la INTEGER NOT NULL, lo INTEGER NOT NULL, ac INTEGER NOT NULL, al INTEGER, seq INTEGER)"
        )
        db.execSQL("CREATE INDEX fixes_run_seq ON fixes (run, seq)")
        db.execSQL("CREATE TABLE batches (run TEXT NOT NULL, seq INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY (run, seq))")
        db.execSQL("CREATE TABLE seqs (run TEXT PRIMARY KEY, next INTEGER NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    override fun onConfigure(db: SQLiteDatabase) {
        db.enableWriteAheadLogging()
    }

    override fun add(run: String, fix: Fix) {
        val v = ContentValues().apply {
            put("run", run); put("t", fix.t); put("la", fix.la); put("lo", fix.lo); put("ac", fix.ac)
            if (fix.al != null) put("al", fix.al) else putNull("al")
        }
        writableDatabase.insert("fixes", null, v)
    }

    override fun count(run: String): Int = scalar("SELECT COUNT(*) FROM fixes WHERE run = ?", run)

    override fun unbatchedCount(run: String): Int = scalar("SELECT COUNT(*) FROM fixes WHERE run = ? AND seq IS NULL", run)

    override fun openBatches(run: String): List<Batch> {
        val db = readableDatabase
        val heads = mutableListOf<Pair<Int, String>>()
        db.rawQuery("SELECT seq, state FROM batches WHERE run = ? ORDER BY seq", arrayOf(run)).use { c ->
            while (c.moveToNext()) heads += c.getInt(0) to c.getString(1)
        }
        return heads.map { (seq, state) -> Batch(run, seq, state, fixesOf(db, run, seq)) }
    }

    @Synchronized override fun createBatch(run: String, state: String, max: Int): Batch {
        val db = writableDatabase
        var seq = 0
        db.beginTransaction()
        try {
            seq = nextSeq(db, run)
            db.execSQL("INSERT OR REPLACE INTO seqs (run, next) VALUES (?, ?)", arrayOf<Any>(run, seq + 1))
            db.execSQL(
                "UPDATE fixes SET seq = ? WHERE id IN (SELECT id FROM fixes WHERE run = ? AND seq IS NULL ORDER BY id LIMIT ?)",
                arrayOf<Any>(seq, run, max)
            )
            db.execSQL("INSERT OR REPLACE INTO batches (run, seq, state) VALUES (?, ?, ?)", arrayOf<Any>(run, seq, state))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return Batch(run, seq, state, fixesOf(db, run, seq))
    }

    @Synchronized override fun ack(run: String, seq: Int) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.execSQL("DELETE FROM fixes WHERE run = ? AND seq IS NOT NULL AND seq <= ?", arrayOf<Any>(run, seq))
            db.execSQL("DELETE FROM batches WHERE run = ? AND seq <= ?", arrayOf<Any>(run, seq))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized override fun split(run: String, seq: Int): Boolean {
        val db = writableDatabase
        var st: String? = null
        db.rawQuery("SELECT state FROM batches WHERE run = ? AND seq = ?", arrayOf(run, seq.toString())).use { c ->
            if (c.moveToFirst()) st = c.getString(0)
        }
        val state = st ?: return false
        val n = scalar("SELECT COUNT(*) FROM fixes WHERE run = ? AND seq = ?", run, seq.toString())
        if (n < 2) return false
        val later = mutableListOf<Int>()
        db.rawQuery("SELECT seq FROM batches WHERE run = ? AND seq > ? ORDER BY seq DESC", arrayOf(run, seq.toString())).use { c ->
            while (c.moveToNext()) later += c.getInt(0)
        }
        db.beginTransaction()
        try {
            for (s in later) {
                db.execSQL("UPDATE batches SET seq = ? WHERE run = ? AND seq = ?", arrayOf<Any>(s + 1, run, s))
                db.execSQL("UPDATE fixes SET seq = ? WHERE run = ? AND seq = ?", arrayOf<Any>(s + 1, run, s))
            }
            db.execSQL(
                "UPDATE fixes SET seq = ? WHERE id IN (SELECT id FROM fixes WHERE run = ? AND seq = ? ORDER BY id LIMIT -1 OFFSET ?)",
                arrayOf<Any>(seq + 1, run, seq, n / 2)
            )
            val (a, b) = MemoryFixStore.splitStates(state)
            db.execSQL("UPDATE batches SET state = ? WHERE run = ? AND seq = ?", arrayOf<Any>(a, run, seq))
            db.execSQL("INSERT OR REPLACE INTO batches (run, seq, state) VALUES (?, ?, ?)", arrayOf<Any>(run, seq + 1, b))
            val next = nextSeq(db, run).coerceAtLeast(seq + 1)
            db.execSQL("INSERT OR REPLACE INTO seqs (run, next) VALUES (?, ?)", arrayOf<Any>(run, next + 1))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return true
    }

    @Synchronized override fun drop(run: String) {
        val db = writableDatabase
        db.delete("fixes", "run = ?", arrayOf(run))
        db.delete("batches", "run = ?", arrayOf(run))
        db.delete("seqs", "run = ?", arrayOf(run))
    }

    /** Forgets the fixes of every run but [keep] (a run abandoned, the device removed). */
    fun dropAllBut(keep: String?) {
        val db = writableDatabase
        val k = keep ?: ""
        db.delete("fixes", "run <> ?", arrayOf(k))
        db.delete("batches", "run <> ?", arrayOf(k))
        db.delete("seqs", "run <> ?", arrayOf(k))
    }

    private fun nextSeq(db: SQLiteDatabase, run: String): Int {
        db.rawQuery("SELECT next FROM seqs WHERE run = ?", arrayOf(run)).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 1
        }
    }

    private fun fixesOf(db: SQLiteDatabase, run: String, seq: Int): List<Fix> {
        val out = mutableListOf<Fix>()
        db.rawQuery("SELECT t, la, lo, ac, al FROM fixes WHERE run = ? AND seq = ? ORDER BY id", arrayOf(run, seq.toString())).use { c ->
            while (c.moveToNext()) {
                out += Fix(c.getLong(0), c.getInt(1), c.getInt(2), c.getInt(3), if (c.isNull(4)) null else c.getInt(4))
            }
        }
        return out
    }

    private fun scalar(sql: String, vararg args: String): Int {
        readableDatabase.rawQuery(sql, args).use { c -> return if (c.moveToFirst()) c.getInt(0) else 0 }
    }

    companion object {
        @Volatile private var instance: FixDb? = null
        fun get(ctx: Context): FixDb = instance ?: synchronized(this) {
            instance ?: FixDb(ctx.applicationContext).also { instance = it }
        }
    }
}
