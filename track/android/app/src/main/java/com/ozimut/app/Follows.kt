package com.ozimut.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/*
 * The people this phone follows (docs/track/ozitrac.md): for each, its channel, this phone's number and secret there, the key
 * of the code scanned and the name the code gave. What was received of their run under way is kept in a file of its own, so
 * that the map and the GPX survive the app being closed.
 */

class Follow(val c: String, val w: String, val ws: String, val k: ByteArray, val name: String, val joined: Long)

/** The state of a person's run as last read, and its fixes. */
class FollowRun(
    val run: String, val state: String, val started: Long, val last: Long, val bat: Int?,
    val alerts: List<Pair<String, Long>>, val since: Int, val fixes: List<Fix>, val readAt: Long,
)

object Follows {
    private fun p(c: Context) = c.getSharedPreferences("follows", Context.MODE_PRIVATE)

    @Synchronized fun list(c: Context): List<Follow> {
        val enc = p(c).getString("list", null) ?: return emptyList()
        val a = try { JSONArray(Secret.decrypt(enc) ?: return emptyList()) } catch (e: Exception) { return emptyList() }
        return (0 until a.length()).mapNotNull { n ->
            val o = a.optJSONObject(n) ?: return@mapNotNull null
            val k = B64.dec(o.optString("k")) ?: return@mapNotNull null
            Follow(o.optString("c"), o.optString("w"), o.optString("ws"), k, o.optString("name"), o.optLong("joined"))
        }
    }

    fun get(c: Context, ch: String): Follow? = list(c).firstOrNull { it.c == ch }

    @Synchronized private fun save(c: Context, list: List<Follow>) {
        val a = JSONArray()
        list.forEach {
            a.put(JSONObject().put("c", it.c).put("w", it.w).put("ws", it.ws).put("k", B64.enc(it.k))
                .put("name", it.name).put("joined", it.joined))
        }
        p(c).edit().putString("list", Secret.encrypt(a.toString())).apply()
    }

    class JoinResult(val follow: Follow?, val error: String?)

    /** Joins a channel with a code scanned (blocking). Errors: "code" (used, expired, unknown), "gone", "many", "network". */
    fun join(c: Context, link: Codes.Link): JoinResult {
        list(c).firstOrNull { it.c == link.c }?.let { return JoinResult(it, null) }
        val sealedName = Seal.sealText(link.k, Seal.nameAad(link.c), Me.name(c))
        val body = JSONObject().put("i", link.i).put("name", sealedName)
        val r = try { Http.post("${RelayConfig.PATH}/${link.c}/join", body.toString()) } catch (e: Exception) { return JoinResult(null, "network") }
        val j = r.json
        return when {
            r.code == 200 && j != null && j.optString("w").isNotBlank() && j.optString("ws").isNotBlank() -> {
                val f = Follow(link.c, j.optString("w"), j.optString("ws"), link.k, link.name, System.currentTimeMillis())
                save(c, list(c) + f)
                PushSupport.token(c) { t -> if (t != null) Thread { registerPush(c, f, t) }.start() }
                JoinResult(f, null)
            }
            r.code == 409 -> JoinResult(null, "code")
            r.code == 404 -> JoinResult(null, "gone")
            r.code == 429 -> JoinResult(null, "many")
            else -> JoinResult(null, "network")
        }
    }

    /** Gives the relay this phone's notification token for one person followed (blocking). */
    fun registerPush(c: Context, f: Follow, token: String): Boolean {
        val body = JSONObject().put("kind", "fcm").put("token", token).put("env", if (BuildConfig.DEBUG) "dev" else "prod")
        return try { Http.put("${RelayConfig.PATH}/${f.c}/w/${f.w}/push", body.toString(), f.ws).code == 200 } catch (e: Exception) { false }
    }

    fun registerPushAll(c: Context, token: String) { list(c).forEach { registerPush(c, it, token) } }

    /** Stops following (blocking): the relay forgets this phone, and so does the phone. */
    fun unfollow(c: Context, f: Follow): Boolean {
        val r = try { Http.delete("${RelayConfig.PATH}/${f.c}/w/${f.w}", f.ws) } catch (e: Exception) { return false }
        if (r.code != 200 && r.code != 401 && r.code != 404) return false
        forget(c, f.c)
        return true
    }

    fun forget(c: Context, ch: String) {
        save(c, list(c).filter { it.c != ch })
        runFile(c, ch).delete()
        p(c).edit().remove("run_$ch").apply()
    }

    // ---- what was received

    private fun runFile(c: Context, ch: String) = File(File(c.filesDir, "follow").apply { mkdirs() }, "$ch.csv")

    fun cached(c: Context, ch: String): FollowRun? {
        val head = p(c).getString("run_$ch", null) ?: return null
        val o = try { JSONObject(head) } catch (e: Exception) { return null }
        val al = o.optJSONArray("alerts") ?: JSONArray()
        val alerts = (0 until al.length()).mapNotNull { n ->
            val a = al.optJSONObject(n) ?: return@mapNotNull null
            a.optString("kind") to a.optLong("t")
        }
        return FollowRun(
            o.optString("run"), o.optString("state"), o.optLong("started"), o.optLong("last"),
            if (o.has("bat") && !o.isNull("bat")) o.optInt("bat") else null, alerts, o.optInt("since"),
            RunLog.read(runFile(c, ch)), o.optLong("readAt")
        )
    }

    class Poll(val run: FollowRun?, val next: Int, val error: String?)

    /**
     * Reads what is new of a person's run (blocking): the blobs after the last one held, opened with the code's key; a new run
     * starts the file again. Errors: "gone" (removed, or the channel deleted: forgotten here), "network".
     */
    fun poll(c: Context, f: Follow): Poll {
        val before = cached(c, f.c)
        val q = if (before != null && before.run.isNotBlank()) "?run=${before.run}&since=${before.since}" else ""
        val r = try { Http.get("${RelayConfig.PATH}/${f.c}/w/${f.w}$q", f.ws) } catch (e: Exception) { return Poll(before, 60, "network") }
        if (r.code == 401 || r.code == 404) {
            forget(c, f.c)
            return Poll(null, 60, "gone")
        }
        val j = r.json
        if (r.code != 200 || j == null) return Poll(before, 60, "network")
        val next = j.optInt("next", 15).coerceIn(5, 600)
        val run = j.optString("run", "").takeIf { it.isNotBlank() && it != "null" } ?: ""
        val sameRun = before != null && before.run == run
        var since = if (sameRun) before!!.since else 0
        val file = runFile(c, f.c)
        if (!sameRun) file.delete()
        val blobs = j.optJSONArray("blobs") ?: JSONArray()
        val added = ArrayList<Fix>()
        for (n in 0 until blobs.length()) {
            val pair = blobs.optJSONArray(n) ?: continue
            val seq = pair.optInt(0)
            if (seq <= since) continue
            val plain = Seal.openText(f.k, Seal.batchAad(f.c, f.w, run, seq), pair.optString(1)) ?: continue
            added += TrackForm.decode(plain)
            since = maxOf(since, seq)
        }
        added.sortBy { it.t }
        if (added.isNotEmpty()) {
            try {
                file.appendText(added.joinToString("") { "${it.t},${it.la},${it.lo},${it.ac},${it.al ?: ""}\n" })
            } catch (e: Exception) { /* full disk */ }
        }
        val alerts = JSONArray()
        val ja = j.optJSONArray("alerts") ?: JSONArray()
        for (n in 0 until ja.length()) ja.optJSONObject(n)?.let { alerts.put(JSONObject().put("kind", it.optString("kind")).put("t", seconds(it.opt("t")))) }
        val head = JSONObject().put("run", run).put("state", j.optString("state", "")).put("started", seconds(j.opt("started")))
            .put("last", seconds(j.opt("last"))).put("bat", if (j.has("bat") && !j.isNull("bat")) j.optInt("bat") else JSONObject.NULL)
            .put("alerts", alerts).put("since", since).put("readAt", System.currentTimeMillis())
        p(c).edit().putString("run_${f.c}", head.toString()).apply()
        return Poll(cached(c, f.c), next, null)
    }

    /** A time the relay gives as Unix seconds, milliseconds or an ISO text -> Unix seconds (0 unknown). */
    fun seconds(v: Any?): Long = when (v) {
        is Number -> v.toLong().let { if (it > 100_000_000_000L) it / 1000 else it }
        is String -> try { java.time.Instant.parse(v).epochSecond } catch (e: Exception) { v.toLongOrNull() ?: 0L }
        else -> 0L
    }
}
