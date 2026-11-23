package com.ozimut.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

class ClaimCodesTest {
    @Test fun codeIsSixReadableCharacters() {
        val rnd = Random(1)
        repeat(500) {
            val c = ClaimCodes.code(rnd)
            assertEquals(6, c.length)
            assertTrue(c, c.all { it in ClaimCodes.ALPHA })
            assertTrue(c, c.none { it in "01OI" })
        }
    }

    @Test fun keyIsWhatTheServerTakes() {
        val rnd = Random(2)
        repeat(200) {
            val k = ClaimCodes.key(rnd)
            // functions/api/track/[[path]].js claim(): /^[A-Za-z0-9_-]{32,80}$/
            assertTrue(k, Regex("^[A-Za-z0-9_-]{32,80}$").matches(k))
        }
    }

    @Test fun shownInTwoHalves() {
        assertEquals("ABC DEF", ClaimCodes.shown("ABCDEF"))
        assertEquals("AB", ClaimCodes.shown("AB"))
    }
}
