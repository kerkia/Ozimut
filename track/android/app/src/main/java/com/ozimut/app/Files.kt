package com.ozimut.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.MimeTypeMap
import android.widget.Toast
import org.json.JSONObject
import java.io.File

/** Files in and out of the web view. */
object Files {
    private const val MAX_IN = 60L * 1024 * 1024

    /** A file opened with or shared to the app, as the bridge's event `{ type: "file", name, mime, data }` (blocking). */
    fun eventOf(c: Context, uri: Uri, mimeHint: String?): JSONObject? {
        return try {
            var name = ""
            var size = -1L
            c.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cur ->
                if (cur.moveToFirst()) {
                    val ni = cur.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val si = cur.getColumnIndex(OpenableColumns.SIZE)
                    if (ni >= 0) name = cur.getString(ni) ?: ""
                    if (si >= 0 && !cur.isNull(si)) size = cur.getLong(si)
                }
            }
            if (name.isBlank()) name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
            if (size > MAX_IN) return null
            val bytes = c.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            if (bytes.size > MAX_IN) return null
            JSONObject()
                .put("type", "file")
                .put("name", name)
                .put("mime", mimeOf(c, uri, name, mimeHint))
                .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) {
            null
        }
    }

    private fun mimeOf(c: Context, uri: Uri, name: String, hint: String?): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        val known = when (ext) {
            "gpx" -> "application/gpx+xml"
            "fit" -> "application/vnd.ant.fit"
            "tcx" -> "application/vnd.garmin.tcx+xml"
            "kmz" -> "application/vnd.google-earth.kmz"
            "kml" -> "application/vnd.google-earth.kml+xml"
            else -> null
        }
        if (known != null) return known
        val t = c.contentResolver.getType(uri) ?: hint
        if (!t.isNullOrBlank() && t != "application/octet-stream" && !t.contains('*')) return t
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: (t ?: "application/octet-stream")
    }

    fun saveBase64(c: Context, name: String, mime: String, base64: String) {
        val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (e: Exception) { return }
        save(c, name, mime, bytes)
    }

    /** Saves into Downloads (MediaStore from Android 10, the app's own Download folder before). */
    fun save(c: Context, rawName: String, mime: String, bytes: ByteArray) {
        val type = mime.ifBlank { "application/octet-stream" }
        var name = rawName.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        if (name.isBlank()) {
            val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type) ?: "bin"
            name = "ozimut." + ext
        }
        val ok = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val v = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, type)
                }
                val uri = c.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v) ?: throw IllegalStateException()
                c.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException()
            } else {
                val dir = c.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: c.filesDir
                File(dir, name).writeBytes(bytes)
            }
            true
        } catch (e: Exception) {
            false
        }
        if (ok) Handler(Looper.getMainLooper()).post {
            Toast.makeText(c, c.getString(R.string.saved_download, name), Toast.LENGTH_LONG).show()
        }
    }

    /** A data: address (`data:<mime>;base64,<data>`) saved. */
    fun saveDataUrl(c: Context, url: String, name: String) {
        val comma = url.indexOf(',')
        if (comma < 0) return
        val head = url.substring(5, comma)
        val mime = head.substringBefore(';')
        val body = url.substring(comma + 1)
        val bytes = if (head.endsWith(";base64")) {
            try { Base64.decode(body, Base64.DEFAULT) } catch (e: Exception) { return }
        } else {
            Uri.decode(body).toByteArray(Charsets.UTF_8)
        }
        save(c, name, mime, bytes)
    }
}
