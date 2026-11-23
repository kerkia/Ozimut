package com.ozimut.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PairingTest {
    @Test
    fun codesFromEveryForm() {
        assertEquals("K7QM4TXD", Pairing.normalise("K7QM4TXD"))
        assertEquals("K7QM4TXD", Pairing.normalise(" k7qm-4txd "))
        assertEquals("K7QM4TXD", Pairing.normalise("https://ozimut.com/t/K7QM4TXD"))
        assertEquals("K7QM4TXD", Pairing.normalise("https://ozimut.com/t/K7QM4TXD/?x=1#y"))
        assertEquals("K7QM4TXD", Pairing.normalise("ozimut://t/K7QM4TXD"))
        assertNull(Pairing.normalise("https://ozimut.com/t/login"))
        assertNull(Pairing.normalise("K7QM4T"))
        assertNull(Pairing.normalise(null))
    }
}
