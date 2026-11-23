package com.ozimut.web

/**
 * Where an address may go (docs/app/design.md « The shells »): the main frame only ever shows the site's own origin, any
 * other address opens in the phone's browser, and a checkout host is neither loaded nor handed over. Pure: no Android class,
 * so that the unit tests run it as it is.
 */
object Policy {
    enum class Verdict { ALLOW, EXTERNAL, BLOCK }

    /** Never loaded, never handed to the browser. A leading « *. » also covers the domain itself. */
    val CHECKOUT_HOSTS = listOf(
        "checkout.stripe.com", "buy.stripe.com", "billing.stripe.com", "pay.stripe.com",
        "*.paddle.com", "*.lemonsqueezy.com", "*.paypal.com"
    )

    /** Schemes a page uses for itself. */
    private val INNER = setOf("blob", "data", "about", "javascript")

    /** Schemes another app of the phone answers (the mail app, the dialler, a map). */
    private val HANDED = setOf("mailto", "tel", "sms", "geo")

    data class Parts(val scheme: String, val host: String, val port: Int)

    /** The scheme, host (lower case, no trailing dot) and port of an address; null when it has no scheme. */
    fun parts(url: String): Parts? {
        val u = url.trim()
        val colon = u.indexOf(':')
        if (colon <= 0) return null
        val scheme = u.substring(0, colon).lowercase()
        if (!scheme.all { it.isLetterOrDigit() || it == '+' || it == '-' || it == '.' }) return null
        if (scheme != "http" && scheme != "https") return Parts(scheme, "", -1)
        var rest = u.substring(colon + 1)
        if (!rest.startsWith("//")) return Parts(scheme, "", -1)
        rest = rest.substring(2)
        // a browser reads « \ » as « / » in these schemes
        val end = rest.indexOfFirst { it == '/' || it == '?' || it == '#' || it == '\\' }
        var authority = if (end >= 0) rest.substring(0, end) else rest
        val at = authority.lastIndexOf('@')
        if (at >= 0) authority = authority.substring(at + 1)
        var host = authority
        var port = -1
        if (authority.startsWith("[")) {
            val close = authority.indexOf(']')
            if (close < 0) return Parts(scheme, "", -1)
            host = authority.substring(0, close + 1)
            val tail = authority.substring(close + 1)
            if (tail.startsWith(":")) port = tail.substring(1).toIntOrNull() ?: -1
        } else {
            val pc = authority.lastIndexOf(':')
            if (pc >= 0) {
                host = authority.substring(0, pc)
                port = authority.substring(pc + 1).toIntOrNull() ?: -1
            }
        }
        if (port == -1) port = if (scheme == "https") 443 else 80
        return Parts(scheme, host.lowercase().trimEnd('.'), port)
    }

    fun isCheckout(host: String): Boolean {
        val h = host.lowercase().trimEnd('.')
        if (h.isEmpty()) return false
        return CHECKOUT_HOSTS.any { p ->
            if (p.startsWith("*.")) h == p.substring(2) || h.endsWith(p.substring(1)) else h == p
        }
    }

    /** Is this address on the site's own origin (scheme, host and port)? */
    fun sameOrigin(url: String, base: String): Boolean {
        val a = parts(url) ?: return false
        val b = parts(base) ?: return false
        return a.host.isNotEmpty() && a.scheme == b.scheme && a.host == b.host && a.port == b.port
    }

    /** What to do with a navigation to [url]; [base] is the site's address, [mainFrame] whether the whole page would go there. */
    fun decide(url: String, base: String, mainFrame: Boolean): Verdict {
        val p = parts(url) ?: return Verdict.BLOCK
        if (p.scheme == "http" || p.scheme == "https") {
            if (p.host.isEmpty() || isCheckout(p.host)) return Verdict.BLOCK
            if (sameOrigin(url, base)) return Verdict.ALLOW
            // another host: a frame of the page loads it (the anti-robot check), the whole page never does
            return if (mainFrame) Verdict.EXTERNAL else Verdict.ALLOW
        }
        if (p.scheme in INNER) return Verdict.ALLOW
        if (p.scheme in HANDED) return if (mainFrame) Verdict.EXTERNAL else Verdict.BLOCK
        return Verdict.BLOCK
    }
}
