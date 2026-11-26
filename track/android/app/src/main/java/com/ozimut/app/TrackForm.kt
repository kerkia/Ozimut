package com.ozimut.app

/*
 * Folloz's pure parts (docs/track/folloz.md), in plain Kotlin and the JDK's crypto (no Android class): the sealing of a
 * batch for one watcher, the batch's delta form, the code a watcher scans, a GPX file. Tested by the JVM unit tests, and
 * compiled into the Wear OS app as they are.
 */

import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** base64url without padding, both ways. */
object B64 {
    fun enc(b: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(b)

    fun dec(s: String): ByteArray? = try {
        Base64.getUrlDecoder().decode(s.trim().trimEnd('='))
    } catch (e: IllegalArgumentException) {
        null
    }
}

/** AES-256-GCM: base64url( 12-byte IV ‖ ciphertext ‖ 16-byte tag ), the additional data the UTF-8 bytes of [aad]. */
object Seal {
    private val rnd = SecureRandom()

    fun iv(): ByteArray = ByteArray(12).also { rnd.nextBytes(it) }

    fun seal(key: ByteArray, aad: String, plain: ByteArray, iv: ByteArray = iv()): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad.toByteArray(Charsets.UTF_8))
        return B64.enc(iv + c.doFinal(plain))
    }

    fun sealText(key: ByteArray, aad: String, text: String): String = seal(key, aad, text.toByteArray(Charsets.UTF_8))

    /** The plaintext, or null when the key, the additional data or the bytes are not the right ones. */
    fun open(key: ByteArray, aad: String, sealed: String): ByteArray? {
        val b = B64.dec(sealed) ?: return null
        if (b.size < 12 + 16) return null
        return try {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, b, 0, 12))
            c.updateAAD(aad.toByteArray(Charsets.UTF_8))
            c.doFinal(b, 12, b.size - 12)
        } catch (e: Exception) {
            null
        }
    }

    fun openText(key: ByteArray, aad: String, sealed: String): String? = open(key, aad, sealed)?.toString(Charsets.UTF_8)

    /** The additional data of a batch, and of a watcher's name (sealed before the relay gives the watcher its number). */
    fun batchAad(c: String, w: String, run: String, seq: Int) = "$c|$w|$run|$seq"
    fun nameAad(c: String) = "$c|name"
}

/** Ozimut's batch form: `{ t0, dt, la, lo, ac, al? }`, `dt` `la` `lo` `al` the first value absolute then differences, `ac` plain. */
object TrackForm {
    fun encode(f: List<Fix>): String {
        val sb = StringBuilder(32 + f.size * 22)
        sb.append("{\"t0\":").append(if (f.isEmpty()) 0 else f[0].t)
        list(sb, "dt", f.size) { i -> if (i == 0) 0L else f[i].t - f[i - 1].t }
        list(sb, "la", f.size) { i -> if (i == 0) f[0].la.toLong() else (f[i].la - f[i - 1].la).toLong() }
        list(sb, "lo", f.size) { i -> if (i == 0) f[0].lo.toLong() else (f[i].lo - f[i - 1].lo).toLong() }
        list(sb, "ac", f.size) { i -> f[i].ac.toLong() }
        if (f.isNotEmpty() && f.all { it.al != null }) {
            list(sb, "al", f.size) { i -> if (i == 0) f[0].al!!.toLong() else (f[i].al!! - f[i - 1].al!!).toLong() }
        }
        return sb.append('}').toString()
    }

    /** The fixes of a batch's plaintext; an empty list when it cannot be read. */
    fun decode(s: String): List<Fix> {
        val t0 = Regex("\"t0\"\\s*:\\s*(-?\\d+)").find(s)?.groupValues?.get(1)?.toLongOrNull() ?: return emptyList()
        val dt = nums(s, "dt") ?: return emptyList()
        val la = nums(s, "la") ?: return emptyList()
        val lo = nums(s, "lo") ?: return emptyList()
        val ac = nums(s, "ac")
        val al = nums(s, "al")
        val n = minOf(dt.size, la.size, lo.size)
        val out = ArrayList<Fix>(n)
        var t = t0
        var a = 0L
        var o = 0L
        var h = 0L
        for (i in 0 until n) {
            if (i == 0) { a = la[0]; o = lo[0]; h = al?.getOrNull(0) ?: 0L } else {
                t += dt[i]; a += la[i]; o += lo[i]; h += al?.getOrNull(i) ?: 0L
            }
            out += Fix(t, a.toInt(), o.toInt(), (ac?.getOrNull(i) ?: 0L).toInt(), if (al != null && i < al.size) h.toInt() else null)
        }
        return out
    }

    private fun nums(s: String, key: String): List<Long>? {
        val m = Regex("\"$key\"\\s*:\\s*\\[([^\\]]*)]").find(s) ?: return null
        val body = m.groupValues[1].trim()
        if (body.isEmpty()) return emptyList()
        return body.split(',').map { it.trim().toLongOrNull() ?: 0L }
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

/** The numbers, secrets and the code a watcher scans: `https://ozimut.com/z/<c>#<i>.<k>.<name>`. */
object Codes {
    const val ALPHA = "abcdefghijklmnopqrstuvwxyz234567"
    private val rnd = SecureRandom()

    fun random(n: Int): String = (1..n).map { ALPHA[rnd.nextInt(ALPHA.length)] }.joinToString("")

    fun key(): ByteArray = ByteArray(32).also { rnd.nextBytes(it) }

    class Link(val c: String, val i: String, val k: ByteArray, val name: String)

    fun link(base: String, c: String, i: String, k: ByteArray, name: String): String =
        base.trimEnd('/') + "/z/" + c + "#" + i + "." + B64.enc(k) + "." + B64.enc(name.toByteArray(Charsets.UTF_8))

    private val CH = Regex("^[a-z2-7]{16}$")
    private val TOKEN = Regex("^[a-z2-7]{16}$")

    /** A code read from a link or a QR code (`https://…/z/<c>#…` or `folloz://z/<c>#…`); null when it is not one. */
    fun parse(raw: String?): Link? {
        if (raw == null) return null
        val s = raw.trim()
        val hash = s.indexOf('#')
        if (hash < 0) return null
        val path = s.substring(0, hash).substringBefore('?').trimEnd('/')
        val zi = path.lastIndexOf("/z/")
        if (zi < 0) return null
        val c = path.substring(zi + 3).lowercase(Locale.ROOT)
        if (!CH.matches(c)) return null
        val parts = s.substring(hash + 1).split('.')
        if (parts.size < 3) return null
        val i = parts[0].lowercase(Locale.ROOT)
        if (!TOKEN.matches(i)) return null
        val k = B64.dec(parts[1]) ?: return null
        if (k.size != 32) return null
        val name = B64.dec(parts[2])?.toString(Charsets.UTF_8)?.trim()?.take(60) ?: ""
        return Link(c, i, k, name)
    }
}

/** A run as a GPX 1.1 file. */
object Gpx {
    fun write(name: String, fixes: List<Fix>): String {
        val sb = StringBuilder(200 + fixes.size * 110)
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<gpx version=\"1.1\" creator=\"Folloz\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n")
        sb.append("<metadata><name>").append(esc(name)).append("</name>")
        if (fixes.isNotEmpty()) sb.append("<time>").append(Instant.ofEpochSecond(fixes[0].t)).append("</time>")
        sb.append("</metadata>\n<trk><name>").append(esc(name)).append("</name><trkseg>\n")
        for (f in fixes) {
            sb.append("<trkpt lat=\"").append(deg(f.la)).append("\" lon=\"").append(deg(f.lo)).append("\">")
            if (f.al != null) sb.append("<ele>").append(f.al).append("</ele>")
            sb.append("<time>").append(Instant.ofEpochSecond(f.t)).append("</time></trkpt>\n")
        }
        sb.append("</trkseg></trk>\n</gpx>\n")
        return sb.toString()
    }

    private fun deg(v: Int) = String.format(Locale.ROOT, "%.6f", v / 1e6)

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}

/** Distances on the ground, between fixes in millionths of a degree. */
object Geo {
    fun metres(la1: Int, lo1: Int, la2: Int, lo2: Int): Double {
        val r = 6_371_000.0
        val p1 = Math.toRadians(la1 / 1e6)
        val p2 = Math.toRadians(la2 / 1e6)
        val dp = p2 - p1
        val dl = Math.toRadians((lo2 - lo1) / 1e6)
        val h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }

    /** The distance run over fixes good enough to count (accuracy within [maxAcc] metres). */
    fun length(fixes: List<Fix>, maxAcc: Int = 30): Double {
        var d = 0.0
        var p: Fix? = null
        for (f in fixes) {
            if (f.ac > maxAcc) continue
            p?.let { d += metres(it.la, it.lo, f.la, f.lo) }
            p = f
        }
        return d
    }
}
