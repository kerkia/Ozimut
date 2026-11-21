package com.ozimut.app

import android.content.Context
import android.os.Build
import org.json.JSONObject

/** Pairing a phone with an account (design.md « Pairing a phone »), and the web view's sign-in. */
object Pairing {
    private val CODE = Regex("^[A-Z0-9]{8}$")

    /** The 8-character code of « K7QM4TXD », « k7qm-4txd », « https://ozimut.com/t/K7QM4TXD » or « ozimut://t/K7QM4TXD ». */
    fun normalise(raw: String?): String? {
        if (raw == null) return null
        var s = raw.trim().substringBefore('#').substringBefore('?').trimEnd('/')
        if ('/' in s) s = s.substringAfterLast('/')
        s = s.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }
        return if (CODE.matches(s)) s else null
    }

    class Result(val ok: Boolean, val error: String? = null, val webToken: String? = null, val child: Boolean = false)

    /** Blocking: call off the main thread. */
    fun pair(c: Context, code: String): Result {
        val dev = JSONObject()
            .put("kind", "phone")
            .put("platform", "android")
            .put("version", BuildConfig.VERSION_NAME)
            .put("os", Build.VERSION.RELEASE ?: "")
            .put("model", Build.MODEL ?: "")
        val body = JSONObject().put("code", code).put("device", dev).toString()
        val r = try {
            Http.post("/api/track/pair", body)
        } catch (e: Exception) {
            return Result(false, "network")
        }
        val j = r.json
        return when {
            r.code == 200 && j != null && j.has("key") && j.has("device") -> {
                Device.save(c, j)
                Result(
                    true,
                    webToken = j.optString("webToken", "").takeIf { it.isNotBlank() && it != "null" },
                    child = j.optJSONObject("account")?.optBoolean("child", false) == true,
                )
            }
            r.code == 400 -> Result(false, "code")
            r.code == 429 -> Result(false, "too many")
            else -> Result(false, "network")
        }
    }

    /** A one-time token to sign the web view in to the device's account (blocking). */
    fun webToken(c: Context): String? {
        val key = Device.key(c) ?: return null
        return try {
            val r = Http.post("/api/track/webtoken", "{}", key)
            if (r.code == 200) r.json?.optString("token", "")?.takeIf { it.isNotBlank() } else null
        } catch (e: Exception) {
            null
        }
    }

    fun loginUrl(token: String) = Http.base() + "/t/login#" + token

    fun errorText(c: Context, error: String?): String = c.getString(
        when (error) {
            "code" -> R.string.pair_err_code
            "too many" -> R.string.pair_err_many
            else -> R.string.pair_err_net
        }
    )
}

/** Sends a native push token to the server (blocking). */
object PushTokens {
    fun send(c: Context, token: String): Boolean {
        val key = Device.key(c) ?: return false
        val body = JSONObject().put("kind", "fcm").put("token", token)
            .put("env", if (BuildConfig.DEBUG) "dev" else "prod").toString()
        return try {
            Http.post("/api/track/pushtoken", body, key).code == 200
        } catch (e: Exception) {
            false
        }
    }
}
