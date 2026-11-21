package com.ozimut.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** The device's settings as the server gives them at pairing (design.md « Pairing a phone »). */
data class Settings(
    val batch: Int = 30,
    val idle: Int = 120,
    val cap: Int = 9000,
    val call: String? = null,
    val onlyTracker: Boolean = false,
) {
    companion object {
        fun of(o: JSONObject?): Settings {
            if (o == null) return Settings()
            return Settings(
                batch = o.optInt("batch", 30).coerceIn(10, 60),
                idle = o.optInt("idle", 120).coerceIn(10, 600),
                cap = o.optInt("cap", 9000).coerceIn(600, 86400),
                call = o.optString("call", "").takeIf { it.isNotBlank() && it != "null" },
                onlyTracker = o.optBoolean("onlyTracker", false),
            )
        }
    }
}

/** The pairing: the device's id, its key (encrypted by the Android Keystore), the account, its watchers, its settings. */
object Device {
    private const val PREFS = "device"
    @Volatile private var keyCache: String? = null

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun id(c: Context): String? = prefs(c).getString("device", null)

    fun key(c: Context): String? {
        keyCache?.let { return it }
        val enc = prefs(c).getString("key", null) ?: return null
        return Secret.decrypt(enc)?.also { keyCache = it }
    }

    fun paired(c: Context) = key(c) != null

    fun account(c: Context): JSONObject? = prefs(c).getString("account", null)?.let {
        try { JSONObject(it) } catch (e: Exception) { null }
    }

    fun name(c: Context): String = account(c)?.optString("name", "") ?: ""

    fun watchers(c: Context): List<String> {
        val a = try { JSONArray(prefs(c).getString("watchers", "[]")) } catch (e: Exception) { JSONArray() }
        return (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }
    }

    fun settings(c: Context): Settings = Settings.of(prefs(c).getString("settings", null)?.let {
        try { JSONObject(it) } catch (e: Exception) { null }
    })

    /** Keeps what /api/track/pair answered. */
    fun save(c: Context, r: JSONObject) {
        val key = r.getString("key")
        prefs(c).edit()
            .putString("device", r.getString("device"))
            .putString("key", Secret.encrypt(key))
            .putString("account", r.optJSONObject("account")?.toString() ?: "{}")
            .putString("watchers", r.optJSONArray("watchers")?.toString() ?: "[]")
            .putString("settings", r.optJSONObject("settings")?.toString() ?: "{}")
            .apply()
        keyCache = key
    }

    /** The pairing as the bridge's `info.paired`. */
    fun pairedJson(c: Context): Any {
        if (!paired(c)) return JSONObject.NULL
        val acc = account(c)
        return JSONObject()
            .put("device", id(c))
            .put("account", acc?.opt("id") ?: JSONObject.NULL)
            .put("name", acc?.optString("name", "") ?: "")
    }

    fun forget(c: Context) {
        prefs(c).edit().clear().apply()
        keyCache = null
    }
}

/** A secret kept encrypted by a key that never leaves the Android Keystore. */
object Secret {
    private const val ALIAS = "ozimut_device_key"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return g.generateKey()
    }

    fun encrypt(s: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return Base64.encodeToString(c.iv + c.doFinal(s.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    }

    fun decrypt(s: String): String? = try {
        val b = Base64.decode(s, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b, 0, 12))
        String(c.doFinal(b, 12, b.size - 12), Charsets.UTF_8)
    } catch (e: Exception) {
        null
    }
}
