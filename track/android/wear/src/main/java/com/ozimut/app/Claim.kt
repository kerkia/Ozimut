package com.ozimut.app

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.security.SecureRandom

/** A claim code and a key, in plain Kotlin (the JVM tests): docs/track/design.md « Watches: claim codes ». */
object ClaimCodes {
    const val ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   // no 0/O, 1/I: read on a watch, typed by hand
    private const val KEY_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    fun code(rnd: java.util.Random = SecureRandom()): String = (1..6).map { ALPHA[rnd.nextInt(ALPHA.length)] }.joinToString("")

    fun key(rnd: java.util.Random = SecureRandom()): String = (1..43).map { KEY_ALPHA[rnd.nextInt(KEY_ALPHA.length)] }.joinToString("")

    /** The code as shown: « ABC DEF ». */
    fun shown(code: String) = if (code.length == 6) code.substring(0, 3) + " " + code.substring(3) else code
}

/**
 * The watch's own pairing: it makes a key and a code, shows the code, and asks /api/track/claim every 10 s until an
 * account claims it on the site (« Associer une montre »). The key and the code wait, encrypted, in the watch's storage.
 */
object Claim {
    sealed class Result {
        object Waiting : Result()
        object Paired : Result()
        object Offline : Result()
        object TooMany : Result()
    }

    private fun prefs(c: Context) = c.getSharedPreferences("claim", Context.MODE_PRIVATE)

    /** The code shown while unpaired (made once, kept until paired). */
    fun code(c: Context): String {
        prefs(c).getString("code", null)?.let { return it }
        val code = ClaimCodes.code()
        prefs(c).edit().putString("code", code).putString("key", Secret.encrypt(ClaimCodes.key())).commit()
        return code
    }

    private fun key(c: Context): String? = prefs(c).getString("key", null)?.let { Secret.decrypt(it) }

    /** A new code (the old one may have been seen by someone else). */
    fun renew(c: Context) {
        prefs(c).edit().clear().commit()
        code(c)
    }

    /** One ask; on « paired » the device keeps what the server answered, as a phone keeps its pairing. Network thread only. */
    fun ask(c: Context): Result {
        val code = code(c)
        val key = key(c) ?: run { renew(c); key(c) } ?: return Result.Offline
        val body = JSONObject()
            .put("claim", code).put("key", key).put("kind", "wearos")
            .put("model", (Build.MANUFACTURER + " " + Build.MODEL).trim().take(60))
            .put("version", BuildConfig.VERSION_NAME)
            .toString()
        val r = try { Http.post("/api/track/claim", body) } catch (e: Exception) { return Result.Offline }
        return when {
            r.code == 200 && r.json?.optBoolean("paired") == true -> {
                Device.save(c, r.json!!.put("key", key))
                prefs(c).edit().clear().commit()
                Result.Paired
            }
            r.code == 429 -> Result.TooMany
            r.code == 401 -> { renew(c); Result.Waiting }   // a key the site removed: start again with a new one
            r.code in 200..299 -> Result.Waiting
            else -> Result.Offline
        }
    }
}
