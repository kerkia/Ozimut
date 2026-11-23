package com.ozimut.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Ozitrac's pure parts (docs/track/ozitrac.md): sealing, the batch's delta form, the code link, the GPX file. */
class TrackFormTest {
    private val key = ByteArray(32) { (it * 7 + 3).toByte() }
    private val iv = ByteArray(12) { (it + 1).toByte() }

    /** The same AES-256-GCM, written out here with the JDK alone, as the relay's other readers do. */
    private fun reference(aad: String, plain: ByteArray): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        c.updateAAD(aad.toByteArray(Charsets.UTF_8))
        val out = iv + c.doFinal(plain)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(out)
    }

    @Test
    fun sealsAsTheContractSays() {
        val aad = Seal.batchAad("abcdefghijklmnop", "w2345678", "r_20261123T101500_ab12", 3)
        assertEquals("abcdefghijklmnop|w2345678|r_20261123T101500_ab12|3", aad)
        val plain = "{\"t0\":1}".toByteArray(Charsets.UTF_8)
        val sealed = Seal.seal(key, aad, plain, iv)
        assertEquals(reference(aad, plain), sealed)
        // IV ‖ ciphertext ‖ tag, base64url without padding
        assertEquals(12 + plain.size + 16, Base64.getUrlDecoder().decode(sealed).size)
        assertTrue(sealed.none { it == '=' || it == '+' || it == '/' })
        assertArrayEquals(plain, Seal.open(key, aad, sealed))
    }

    /** The vectors made with Node's WebCrypto, which the iPhone's tests check too (track/ios/Tests/OzitracTests.swift). */
    @Test
    fun sealsAsWebCryptoDoes() {
        assertEquals("AQIDBAUGBwgJCgsMKwAOwgQ8OsM-yW_YKD0AW4hL3rz9Pf9Y",
            Seal.seal(key, "abcdefghijklmnop|w2345678|r_20261123T101500_ab12|3", "{\"t0\":1}".toByteArray(Charsets.UTF_8), iv))
        assertEquals("AQIDBAUGBwgJCgsMk6sWneWpeNtJ86F2PYpA9dV4UcqEysCZ",
            Seal.seal(key, "abcdefghijklmnop|name", "Éloïse".toByteArray(Charsets.UTF_8), iv))
    }

    @Test
    fun aNameIsSealedWithTheChannelOnly() {
        assertEquals("abcdefghijklmnop|name", Seal.nameAad("abcdefghijklmnop"))
        val sealed = Seal.sealText(key, Seal.nameAad("abcdefghijklmnop"), "Éloïse")
        assertEquals("Éloïse", Seal.openText(key, "abcdefghijklmnop|name", sealed))
    }

    @Test
    fun aSealOpensOnlyWithItsKeyAndData() {
        val aad = Seal.batchAad("abcdefghijklmnop", "w2345678", "r1", 1)
        val sealed = Seal.seal(key, aad, byteArrayOf(1, 2, 3), iv)
        assertNull(Seal.open(key, Seal.batchAad("abcdefghijklmnop", "w2345678", "r1", 2), sealed))
        assertNull(Seal.open(ByteArray(32), aad, sealed))
        val bytes = Base64.getUrlDecoder().decode(sealed)
        bytes[14] = (bytes[14].toInt() xor 1).toByte()
        assertNull(Seal.open(key, aad, Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)))
        assertNull(Seal.open(key, aad, "not base64 !"))
        assertNull(Seal.open(key, aad, "AAAA"))
    }

    @Test
    fun theDeltaFormRoundTrips() {
        val fixes = listOf(
            Fix(1_763_892_000, 48_312_345, -1_234_567, 5, 120),
            Fix(1_763_892_001, 48_312_350, -1_234_560, 4, 121),
            Fix(1_763_892_003, 48_312_340, -1_234_590, 12, 119),
        )
        val s = TrackForm.encode(fixes)
        assertEquals(
            "{\"t0\":1763892000,\"dt\":[0,1,2],\"la\":[48312345,5,-10],\"lo\":[-1234567,7,-30],\"ac\":[5,4,12],\"al\":[120,1,-2]}",
            s,
        )
        assertEquals(fixes, TrackForm.decode(s))
    }

    @Test
    fun aBatchWithoutAltitudeLeavesItOut() {
        val fixes = listOf(Fix(100, 1, 2, 3, 10), Fix(101, 4, 5, 6, null))
        val s = TrackForm.encode(fixes)
        assertTrue("al" !in s)
        assertEquals(listOf(Fix(100, 1, 2, 3, null), Fix(101, 4, 5, 6, null)), TrackForm.decode(s))
        assertEquals(emptyList<Fix>(), TrackForm.decode("{}"))
        assertEquals(emptyList<Fix>(), TrackForm.decode(TrackForm.encode(emptyList())))
    }

    @Test
    fun theCodeLinkRoundTrips() {
        val k = ByteArray(32) { it.toByte() }
        val link = Codes.link("https://ozimut.com/", "abcdefghijklmn23", "qrstuvwxyz234567", k, "Zoé")
        assertTrue(link.startsWith("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567."))
        val l = Codes.parse(link)
        assertNotNull(l)
        assertEquals("abcdefghijklmn23", l!!.c)
        assertEquals("qrstuvwxyz234567", l.i)
        assertArrayEquals(k, l.k)
        assertEquals("Zoé", l.name)
        // the key travels as 43 base64url characters
        assertEquals(43, link.substringAfter('#').split('.')[1].length)
    }

    @Test
    fun aCodeIsReadOnlyWhenWhole() {
        val k = B64.enc(ByteArray(32))
        assertNotNull(Codes.parse("  https://ozimut.com/z/abcdefghijklmn23/#qrstuvwxyz234567.$k.  "))
        assertNull(Codes.parse(null))
        assertNull(Codes.parse("https://ozimut.com/z/abcdefghijklmn23"))
        assertNull(Codes.parse("https://ozimut.com/t/K7QM4TXD"))
        assertNull(Codes.parse("https://ozimut.com/z/short#qrstuvwxyz234567.$k.Wm9l"))
        assertNull(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#short.$k.Wm9l"))
        assertNull(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567.AAAA.Wm9l"))
        assertNull(Codes.parse("https://ozimut.com/z/abcdefghijklmn23#qrstuvwxyz234567.$k"))
    }

    @Test
    fun randomCodesUseTheAlphabet() {
        val c = Codes.random(16)
        assertEquals(16, c.length)
        assertTrue(c.all { it in Codes.ALPHA })
        assertEquals(32, Codes.key().size)
    }

    @Test
    fun aGpxFileHoldsEveryFix() {
        val g = Gpx.write("Zoé <run> & co", listOf(Fix(1_763_892_000, 48_312_345, -1_234_567, 5, 120), Fix(1_763_892_001, 48_312_350, -1_234_560, 4, null)))
        assertTrue(g.startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"))
        assertTrue("<name>Zoé &lt;run&gt; &amp; co</name>" in g)
        assertTrue("<trkpt lat=\"48.312345\" lon=\"-1.234567\"><ele>120</ele><time>2025-11-23T10:00:00Z</time></trkpt>" in g)
        assertTrue("<trkpt lat=\"48.312350\" lon=\"-1.234560\"><time>2025-11-23T10:00:01Z</time></trkpt>" in g)
        assertEquals(2, Regex("<trkpt ").findAll(g).count())
    }

    @Test
    fun aRunsLengthCountsGoodFixesOnly() {
        // 0.001° of latitude is about 111 m
        val fixes = listOf(Fix(0, 48_000_000, 0, 5), Fix(1, 48_001_000, 0, 5), Fix(2, 48_050_000, 0, 200), Fix(3, 48_002_000, 0, 5))
        assertEquals(222.4, Geo.length(fixes), 0.5)
    }
}
