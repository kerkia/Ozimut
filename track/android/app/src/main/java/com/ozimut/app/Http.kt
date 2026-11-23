package com.ozimut.app

import android.net.Uri
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPOutputStream

class HttpResult(val code: Int, val json: JSONObject?)

/** JSON over HTTPS to Ozimut (its tracking API and Ozitrac's relay). Throws on a network failure. */
object Http {
    fun base(): String = BuildConfig.BASE_URL.trimEnd('/')

    fun host(): String = Uri.parse(base()).host ?: "ozimut.com"

    fun userAgent(): String = "Ozitrac/${BuildConfig.VERSION_NAME} (android; +https://ozimut.com)"

    fun post(path: String, body: String, bearer: String? = null, gzip: Boolean = false): HttpResult =
        request("POST", path, body, bearer, gzip)

    fun get(path: String, bearer: String? = null): HttpResult = request("GET", path, null, bearer)

    fun put(path: String, body: String, bearer: String? = null): HttpResult = request("PUT", path, body, bearer)

    fun delete(path: String, bearer: String? = null): HttpResult = request("DELETE", path, null, bearer)

    fun request(method: String, path: String, body: String?, bearer: String? = null, gzip: Boolean = false): HttpResult {
        val conn = URL(base() + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.useCaches = false
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", userAgent())
            if (bearer != null) conn.setRequestProperty("Authorization", "Bearer $bearer")
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                var data = body.toByteArray(Charsets.UTF_8)
                if (gzip) {
                    data = gzip(data)
                    conn.setRequestProperty("Content-Encoding", "gzip")
                }
                conn.setFixedLengthStreamingMode(data.size)
                conn.outputStream.use { it.write(data) }
            }
            val code = conn.responseCode
            val stream = if (code >= 400) conn.errorStream else conn.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            val json = try { if (text.isBlank()) null else JSONObject(text) } catch (e: Exception) { null }
            return HttpResult(code, json)
        } finally {
            conn.disconnect()
        }
    }

    fun gzip(b: ByteArray): ByteArray {
        val out = ByteArrayOutputStream(b.size / 3 + 64)
        GZIPOutputStream(out).use { it.write(b) }
        return out.toByteArray()
    }
}
