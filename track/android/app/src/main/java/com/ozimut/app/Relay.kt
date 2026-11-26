package com.ozimut.app

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import org.json.JSONArray
import org.json.JSONObject

/*
 * Folloz's relay, the followed phone's side (docs/track/folloz.md): its first name, the relay's settings, its channel and
 * watchers, the alerts it sees itself, its zone, and the sender of its runs to the relay. Shared with the Wear OS app.
 */

/** The person using this phone: the first name put in the codes and sealed for the people followed. */
object Me {
    private fun p(c: Context) = c.getSharedPreferences("me", Context.MODE_PRIVATE)
    fun name(c: Context): String = p(c).getString("name", "") ?: ""
    fun setName(c: Context, n: String) { p(c).edit().putString("name", n.trim().take(40)).apply() }
}

/** The relay's settings (`GET /api/folloz/config`), kept a day. */
object RelayConfig {
    const val PATH = "/api/folloz"
    const val OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    const val OSM_CREDIT = "© OpenStreetMap contributors"

    class Cfg(val tiles: String, val credit: String, val maxZoom: Int, val watched: Int, val idle: Int)

    private fun p(c: Context) = c.getSharedPreferences("relaycfg", Context.MODE_PRIVATE)

    fun get(c: Context): Cfg {
        val p = p(c)
        return Cfg(
            p.getString("tiles", OSM) ?: OSM, p.getString("credit", OSM_CREDIT) ?: OSM_CREDIT,
            p.getInt("maxZoom", 19), p.getInt("watched", 15), p.getInt("idle", 120)
        )
    }

    /** The relay's last answer, for the map's layers (MapLayers, the phone app's). */
    fun mapsJson(c: Context): String? = p(c).getString("maps", null)

    /** Asks the relay again when a day has passed, or when its map layers were never read (blocking). */
    fun refresh(c: Context) {
        if (System.currentTimeMillis() - p(c).getLong("at", 0) < 86_400_000L && p(c).contains("maps")) return
        try {
            val r = Http.get("$PATH/config")
            val j = r.json ?: return
            if (r.code != 200) return
            val tiles = j.optString("tiles", "")
            p(c).edit()
                .putString("maps", if (j.has("layers")) j.toString() else "")
                .putString("tiles", if (tiles.contains("{z}") && tiles.startsWith("https://")) tiles else OSM)
                .putString("credit", j.optString("attribution", OSM_CREDIT).ifBlank { OSM_CREDIT })
                .putInt("maxZoom", j.optInt("maxZoom", 19).coerceIn(10, 22))
                .putInt("watched", j.optInt("watched", 15).coerceIn(5, 60))
                .putInt("idle", j.optInt("idle", 120).coerceIn(30, 600))
                .putLong("at", System.currentTimeMillis()).apply()
        } catch (e: Exception) {
            // the defaults stay
        }
    }
}

/** This phone's channel on the relay: its number, its secret, its codes waiting to be scanned, its watchers and their keys. */
object Channel {
    class Watcher(val w: String, val name: String?, val k: ByteArray?, val since: String, val seen: String)

    private class Invite(val i: String, val k: ByteArray, val at: Long)

    private const val DAY = 86_400_000L

    private fun p(c: Context) = c.getSharedPreferences("channel", Context.MODE_PRIVATE)

    fun exists(c: Context) = id(c) != null

    fun id(c: Context): String? = p(c).getString("c", null)

    fun secret(c: Context): String? = p(c).getString("cs", null)?.let { Secret.decrypt(it) }

    /** Makes the channel when there is none (blocking). -> its number, or null (no network). */
    @Synchronized fun ensure(c: Context): String? {
        id(c)?.let { return it }
        val r = try { Http.post("${RelayConfig.PATH}/channel", "{}") } catch (e: Exception) { return null }
        val j = r.json ?: return null
        if (r.code !in 200..201) return null
        val ch = j.optString("c", "")
        val cs = j.optString("cs", "")
        if (ch.isBlank() || cs.isBlank()) return null
        p(c).edit().putString("c", ch).putString("cs", Secret.encrypt(cs)).apply()
        return ch
    }

    /** A new code for one watcher (blocking): the address to scan, or null. */
    fun invite(c: Context): String? {
        val ch = ensure(c) ?: return null
        val cs = secret(c) ?: return null
        val i = Codes.random(16)
        val k = Codes.key()
        val r = try { Http.post("${RelayConfig.PATH}/$ch/invite", JSONObject().put("i", i).toString(), cs) } catch (e: Exception) { return null }
        if (r.code == 401 || r.code == 404) { forget(c); return null }
        if (r.code != 200) return null
        val now = System.currentTimeMillis()
        saveInvites(c, invites(c).filter { now - it.at < DAY } + Invite(i, k, now))
        return Codes.link(Http.base(), ch, i, k, Me.name(c))
    }

    /** The watchers as last read. */
    fun watchers(c: Context): List<Watcher> {
        val a = readArray(c, "watchers")
        return (0 until a.length()).mapNotNull { n ->
            val o = a.optJSONObject(n) ?: return@mapNotNull null
            Watcher(
                o.optString("w"), o.optString("name", "").takeIf { it.isNotBlank() },
                o.optString("k", "").takeIf { it.isNotBlank() }?.let { B64.dec(it) },
                o.optString("since", ""), o.optString("seen", "")
            )
        }
    }

    /** The watchers whose key this phone holds: those it can send to. */
    fun keyed(c: Context): List<Watcher> = watchers(c).filter { it.k != null }

    /** Reads the watchers again (blocking); the new ones get the key of the code they scanned. -> false without network. */
    @Synchronized fun refresh(c: Context): Boolean {
        val ch = id(c) ?: return true
        val cs = secret(c) ?: return true
        val r = try { Http.get("${RelayConfig.PATH}/$ch", cs) } catch (e: Exception) { return false }
        if (r.code == 401 || r.code == 404) { forget(c); return true }
        val j = r.json ?: return false
        if (r.code != 200) return false
        val known = watchers(c).associateBy { it.w }
        val now = System.currentTimeMillis()
        val waiting = invites(c).filter { now - it.at < DAY }.toMutableList()
        val out = JSONArray()
        val list = j.optJSONArray("watchers") ?: JSONArray()
        for (n in 0 until list.length()) {
            val o = list.optJSONObject(n) ?: continue
            val w = o.optString("w", "")
            if (w.isBlank()) continue
            val sealed = o.optString("name", "")
            var k = known[w]?.k
            var name = known[w]?.name
            if (k == null && sealed.isNotBlank()) {
                for (inv in waiting) {
                    val opened = Seal.openText(inv.k, Seal.nameAad(ch), sealed) ?: continue
                    k = inv.k
                    name = opened
                    waiting.remove(inv)
                    break
                }
            }
            if (k != null && name == null && sealed.isNotBlank()) name = Seal.openText(k, Seal.nameAad(ch), sealed)
            out.put(JSONObject().put("w", w).put("name", name ?: "").put("k", k?.let { B64.enc(it) } ?: "")
                .put("since", o.optString("since", "")).put("seen", o.optString("seen", "")))
        }
        writeArray(c, "watchers", out)
        saveInvites(c, waiting)
        p(c).edit().putLong("refreshed", now).apply()
        return true
    }

    fun refreshedAt(c: Context): Long = p(c).getLong("refreshed", 0)

    /**
     * Gives the relay this phone's push token (`PUT /<c>/token`), or drops it with `{}` when [token] is null: how a watcher's
     * request for Direct wakes the phone during a long run (docs/track/folloz.md « Pace »). Sent again only when it changed
     * (blocking). -> false without network.
     */
    @Synchronized fun setToken(c: Context, token: String?): Boolean {
        val ch = id(c) ?: return true
        val cs = secret(c) ?: return true
        val sent = p(c).getString("token", null)
        if (token == null && sent.isNullOrEmpty()) return true
        if (token != null && token == sent) return true
        val body = if (token == null) "{}" else
            JSONObject().put("kind", "fcm").put("token", token).put("env", if (BuildConfig.DEBUG) "dev" else "prod").toString()
        val r = try { Http.put("${RelayConfig.PATH}/$ch/token", body, cs) } catch (e: Exception) { return false }
        if (r.code == 401 || r.code == 404) { forget(c); return true }
        if (r.code != 200) return false
        p(c).edit().putString("token", token ?: "").apply()
        return true
    }

    /** Removes a watcher (blocking). */
    fun remove(c: Context, w: String): Boolean {
        val ch = id(c) ?: return false
        val cs = secret(c) ?: return false
        val r = try { Http.delete("${RelayConfig.PATH}/$ch/w/$w", cs) } catch (e: Exception) { return false }
        if (r.code == 401 || r.code == 404) { forget(c); return true }
        if (r.code != 200) return false
        val keep = JSONArray()
        watchers(c).filter { it.w != w }.forEach {
            keep.put(JSONObject().put("w", it.w).put("name", it.name ?: "").put("k", it.k?.let { k -> B64.enc(k) } ?: "")
                .put("since", it.since).put("seen", it.seen))
        }
        writeArray(c, "watchers", keep)
        return true
    }

    /** Deletes the channel on the relay and here (blocking). */
    fun delete(c: Context): Boolean {
        val ch = id(c) ?: return true
        val cs = secret(c)
        if (cs != null) {
            try {
                val r = Http.delete("${RelayConfig.PATH}/$ch", cs)
                if (r.code != 200 && r.code != 401 && r.code != 404) return false
            } catch (e: Exception) {
                return false
            }
        }
        forget(c)
        return true
    }

    /** The channel is gone (removed here, or unknown to the relay): forget it. */
    fun forget(c: Context) { p(c).edit().clear().apply() }

    private fun invites(c: Context): List<Invite> {
        val a = readArray(c, "invites")
        return (0 until a.length()).mapNotNull { n ->
            val o = a.optJSONObject(n) ?: return@mapNotNull null
            val k = B64.dec(o.optString("k")) ?: return@mapNotNull null
            Invite(o.optString("i"), k, o.optLong("at"))
        }
    }

    private fun saveInvites(c: Context, list: List<Invite>) {
        val a = JSONArray()
        list.forEach { a.put(JSONObject().put("i", it.i).put("k", B64.enc(it.k)).put("at", it.at)) }
        writeArray(c, "invites", a)
    }

    // the keys are kept encrypted by the Android Keystore, as the device's own key
    private fun readArray(c: Context, key: String): JSONArray {
        val enc = p(c).getString(key, null) ?: return JSONArray()
        val plain = Secret.decrypt(enc) ?: return JSONArray()
        return try { JSONArray(plain) } catch (e: Exception) { JSONArray() }
    }

    private fun writeArray(c: Context, key: String, a: JSONArray) {
        p(c).edit().putString(key, Secret.encrypt(a.toString())).apply()
    }
}

/** The alerts this phone sees itself, waiting for the next batch to the relay. */
object Alerts {
    const val BATTERY = "battery"
    const val STILL = "still"
    const val ZONE = "zone"

    private fun p(c: Context) = c.getSharedPreferences("alerts", Context.MODE_PRIVATE)

    @Synchronized fun add(c: Context, kind: String) {
        val now = pending(c)
        if (kind !in now) p(c).edit().putString("k", (now + kind).joinToString(",")).commit()
    }

    @Synchronized fun pending(c: Context): List<String> =
        (p(c).getString("k", "") ?: "").split(',').filter { it.isNotBlank() }

    @Synchronized fun sent(c: Context, kinds: List<String>) {
        p(c).edit().putString("k", pending(c).filter { it !in kinds }.joinToString(",")).commit()
    }

    fun clear(c: Context) { p(c).edit().clear().commit() }
}

/** The zone set on this phone: a centre and a radius; leaving it alerts the watchers. */
object Zone {
    class Z(val on: Boolean, val la: Int, val lo: Int, val r: Int)

    private fun p(c: Context) = c.getSharedPreferences("zone", Context.MODE_PRIVATE)

    fun get(c: Context): Z {
        val p = p(c)
        return Z(p.getBoolean("on", false), p.getInt("la", 0), p.getInt("lo", 0), p.getInt("r", 500))
    }

    fun set(c: Context, on: Boolean, la: Int, lo: Int, r: Int) {
        p(c).edit().putBoolean("on", on).putInt("la", la).putInt("lo", lo).putInt("r", r.coerceIn(50, 50_000)).apply()
    }
}

/**
 * Standing still and leaving the zone, from the fixes (each said once until it is no longer so). Still is « under 15 m in
 * 5 minutes », 30 in a long run (docs/track/folloz.md rule 5), whatever a watcher's request for Direct does meanwhile.
 */
class AlertWatch(private val ctx: Context, private val onAlert: () -> Unit) {
    private val still = PaceState.choice(ctx).let { StillDetector(PaceRules.stillWindow(it), PaceRules.stillSlack(it)) }
    private var out = false

    fun onFix(f: Fix, runStartedSec: Long) {
        if (f.ac > 30) return
        if (still.onFix(f, runStartedSec)) {
            Alerts.add(ctx, Alerts.STILL)
            onAlert()
        }
        // the zone: out beyond its radius, back once 10 % inside it
        val z = Zone.get(ctx)
        if (!z.on) { out = false; return }
        val d = Geo.metres(z.la, z.lo, f.la, f.lo)
        if (!out && d > z.r) {
            out = true
            Alerts.add(ctx, Alerts.ZONE)
            onAlert()
        } else if (out && d < z.r * 0.9) {
            out = false
        }
    }
}

/**
 * Folloz's destination: sends the run to the relay (POST /api/folloz/<c>/push), each batch sealed for each watcher whose key
 * this phone holds, from the queue « z: » + run that TrackerService fills beside Ozimut's. Without a watcher it waits (the
 * fixes kept, sent once one joins); at the end with still none the queue is dropped. Each batch says the pace kept; the
 * answer's `boost` (a watcher's request for Direct) goes to [onBoost].
 */
class RelaySender(
    private val ctx: Context,
    private val store: FixStore,
    private val events: Uploader.Events,
    private val onBoost: (Boost) -> Unit = {},
) {
    private val thread = HandlerThread("folloz-relay").apply { start() }
    private val h = Handler(thread.looper)
    private val batcher = Batcher(store)
    private val flushTask = Runnable { flush() }
    private var backoff = Uploader.FIRST_BACKOFF

    fun kick() {
        h.removeCallbacks(flushTask)
        h.post(flushTask)
    }

    private fun kickIn(ms: Long) {
        h.removeCallbacks(flushTask)
        h.postDelayed(flushTask, ms)
    }

    fun quit() {
        h.removeCallbacksAndMessages(null)
        thread.quitSafely()
    }

    private fun fail(retryInMs: Long = backoff) {
        RunState.failing(ctx)
        Tracker.changed()
        kickIn(retryInMs)
        backoff = (backoff * 2).coerceAtMost(Uploader.MAX_BACKOFF)
    }

    private fun flush() {
        val ch = Channel.id(ctx)
        val cs = Channel.secret(ctx)
        if (ch == null || cs == null) {
            events.onDeviceRemoved()
            return
        }
        val first = RunState.get(ctx)
        if (first.run.isEmpty() || !first.active) return
        val key = RunState.queueKey(RunState.RELAY, first.run)
        if (System.currentTimeMillis() - Channel.refreshedAt(ctx) > REFRESH_MS || Channel.keyed(ctx).isEmpty()) {
            if (System.currentTimeMillis() - Channel.refreshedAt(ctx) > MIN_REFRESH_MS) Channel.refresh(ctx)
            if (!Channel.exists(ctx)) { store.drop(key); events.onDeviceRemoved(); return }
        }
        var watchers = Channel.keyed(ctx)
        if (watchers.isEmpty()) {
            if (first.state == RunState.ENDING) {
                store.drop(key)
                events.onFinished("none")
            } else {
                kickIn(MIN_REFRESH_MS)
            }
            return
        }
        var heartbeat = true
        var nextSec = RelayConfig.get(ctx).idle.toLong()
        for (n in 0 until 200) {
            val rs = RunState.get(ctx)
            if (rs.run.isEmpty() || !rs.active) return
            val ending = rs.state == RunState.ENDING
            val help = RunState.helpPending(ctx, RunState.RELAY)
            val alerts = Alerts.pending(ctx)
            val b = batcher.next(key, ending, help, (heartbeat || alerts.isNotEmpty()) && !ending) ?: break
            heartbeat = false
            val plain = TrackForm.encode(b.fixes).toByteArray(Charsets.UTF_8)
            val sealed = JSONObject()
            for (wt in watchers) sealed.put(wt.w, Seal.seal(wt.k!!, Seal.batchAad(ch, wt.w, rs.run, b.seq), plain))
            val pace = PaceState.now(ctx, System.currentTimeMillis() / 1000, nextSec.toInt())
            val body = JSONObject()
                .put("v", 1).put("run", rs.run).put("seq", b.seq).put("state", b.state)
                .put("sealed", sealed).put("alerts", JSONArray(alerts)).put("lp", Phone.lowPower(ctx))
                .put("pace", PaceRules.json(pace))
            Phone.battery(ctx)?.let { body.put("bat", it) }
            val res = try {
                Http.post("${RelayConfig.PATH}/$ch/push", body.toString(), cs, gzip = true)
            } catch (e: Exception) {
                null
            }
            if (res == null) { fail(); return }
            when (res.code) {
                200 -> {
                    val j = res.json
                    val ack = j?.optInt("ack", b.seq) ?: b.seq
                    store.ack(key, ack)
                    backoff = Uploader.FIRST_BACKOFF
                    RunState.sent(ctx)
                    Alerts.sent(ctx, alerts)
                    if (b.state == States.HELP && help) RunState.helpSent(ctx, RunState.RELAY, rs.helpAt)
                    if (j != null && j.has("next")) nextSec = j.optLong("next", nextSec)
                    PaceRules.parseBoost(j?.optJSONObject("boost"))?.let { onBoost(it) }
                    Tracker.changed()
                    if (b.state == States.END && ack >= b.seq) {
                        events.onFinished("sent")
                        return
                    }
                }
                401, 404 -> {
                    Channel.forget(ctx)
                    store.drop(key)
                    events.onDeviceRemoved()
                    return
                }
                409 -> {
                    store.drop(key)
                    events.onFinished("closed")
                    return
                }
                413 -> {
                    if (!store.split(key, b.seq)) { fail(); return }
                }
                429 -> {
                    val wait = res.json?.optLong("next", 0) ?: 0
                    fail(maxOf(wait * 1000, backoff))
                    return
                }
                else -> { fail(); return }
            }
            watchers = Channel.keyed(ctx)
            if (watchers.isEmpty()) break
        }
        val rs = RunState.get(ctx)
        if (!rs.active) return
        if (rs.state == RunState.ENDING || RunState.helpPending(ctx, RunState.RELAY) || Alerts.pending(ctx).isNotEmpty()) kickIn(1_000)
        else {
            val now = System.currentTimeMillis() / 1000
            kickIn(PaceRules.nextSend(PaceState.now(ctx, now, nextSec.toInt()), now, nextSec).coerceIn(5, 900) * 1000)
        }
    }

    companion object {
        /** The watchers read again during a run at most this often (a new one gets the run from then on). */
        const val REFRESH_MS = 5 * 60_000L
        const val MIN_REFRESH_MS = 60_000L
    }
}
