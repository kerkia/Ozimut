package com.ozimut.web

import com.ozimut.web.Policy.Verdict.ALLOW
import com.ozimut.web.Policy.Verdict.BLOCK
import com.ozimut.web.Policy.Verdict.EXTERNAL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PolicyTest {
    private val base = "https://ozimut.com"

    @Test
    fun ownOriginIsShown() {
        assertEquals(ALLOW, Policy.decide("https://ozimut.com/", base, true))
        assertEquals(ALLOW, Policy.decide("https://ozimut.com/#/agenda?periode=passees", base, true))
        assertEquals(ALLOW, Policy.decide("https://OZIMUT.com:443/data/meta.json", base, true))
        assertEquals(ALLOW, Policy.decide("https://ozimut.com", base, false))
    }

    @Test
    fun otherHostsGoToTheBrowser() {
        assertEquals(EXTERNAL, Policy.decide("https://www.ffcorientation.fr/courses/", base, true))
        assertEquals(EXTERNAL, Policy.decide("http://ozimut.com/", base, true))            // not the same origin
        assertEquals(EXTERNAL, Policy.decide("https://www.ozimut.com/", base, true))
        assertEquals(EXTERNAL, Policy.decide("https://ozimut.com.example.org/", base, true))
        assertEquals(EXTERNAL, Policy.decide("https://ozimut.com@example.org/", base, true))
        assertEquals(EXTERNAL, Policy.decide("https://example.org\\@ozimut.com/", base, true))
        assertEquals(EXTERNAL, Policy.decide("https://ozimut.com:8443/", base, true))
    }

    @Test
    fun framesOfOtherHostsLoad() {
        assertEquals(ALLOW, Policy.decide("https://challenges.cloudflare.com/turnstile/v0/x", base, false))
    }

    @Test
    fun checkoutHostsAreNeverLoadedNorHandedOver() {
        for (mainFrame in listOf(true, false)) {
            assertEquals(BLOCK, Policy.decide("https://checkout.stripe.com/c/pay/cs_live_1", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://buy.stripe.com/abc", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://billing.stripe.com/p/session", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://pay.stripe.com/x", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://sandbox-checkout.paddle.com/x", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://paddle.com/", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://ozimut.lemonsqueezy.com/buy/1", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("https://www.paypal.com./checkoutnow", base, mainFrame))
            assertEquals(BLOCK, Policy.decide("HTTPS://WWW.PAYPAL.COM/", base, mainFrame))
        }
        assertTrue(Policy.isCheckout("checkout.stripe.com"))
        assertFalse(Policy.isCheckout("stripe.com"))             // its documentation, not a checkout
        assertFalse(Policy.isCheckout("notpaypal.com"))
        assertFalse(Policy.isCheckout("mypaddle.com"))
    }

    @Test
    fun otherSchemes() {
        assertEquals(ALLOW, Policy.decide("blob:https://ozimut.com/1b2c", base, true))
        assertEquals(ALLOW, Policy.decide("data:text/plain,hello", base, false))
        assertEquals(ALLOW, Policy.decide("about:blank", base, false))
        assertEquals(EXTERNAL, Policy.decide("mailto:contact@ozimut.com", base, true))
        assertEquals(EXTERNAL, Policy.decide("tel:+33100000000", base, true))
        assertEquals(BLOCK, Policy.decide("intent://scan/#Intent;scheme=zxing;end", base, true))
        assertEquals(BLOCK, Policy.decide("market://details?id=x", base, true))
        assertEquals(BLOCK, Policy.decide("file:///sdcard/x.html", base, true))
        assertEquals(BLOCK, Policy.decide("content://x/y", base, true))
        assertEquals(BLOCK, Policy.decide("not an address", base, true))
        assertEquals(BLOCK, Policy.decide("https:///nohost", base, true))
    }

    @Test
    fun aDebugBaseIsItsOwnOrigin() {
        val dev = "http://10.0.2.2:8788"
        assertEquals(ALLOW, Policy.decide("http://10.0.2.2:8788/#/modules", dev, true))
        assertEquals(EXTERNAL, Policy.decide("https://ozimut.com/", dev, true))
        assertTrue(Policy.sameOrigin("http://10.0.2.2:8788/x", dev))
        assertFalse(Policy.sameOrigin("http://10.0.2.2:8789/x", dev))
    }
}
