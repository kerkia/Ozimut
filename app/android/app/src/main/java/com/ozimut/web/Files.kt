package com.ozimut.web

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

/** Files into the web view (opened with or shared to the app) and out of it (what the site saves). */
object Files {
    /** A file larger than this is left out (docs/app/design.md: the page takes them as base64). */
    const val MAX_IN = 40L * 1024 * 1024

    /** One file as the bridge gives it: `{ name, mime, data }` (blocking); null when unreadable or too large. */
    fun entryOf(c: Context, uri: Uri, mimeHint: String?): JSONObject? {
        return try {
            var name = ""
            var size = -1L
            try {
                c.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cur ->
                    if (cur.moveToFirst()) {
                        val ni = cur.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        val si = cur.getColumnIndex(OpenableColumns.SIZE)
                        if (ni >= 0) name = cur.getString(ni) ?: ""
                        if (si >= 0 && !cur.isNull(si)) size = cur.getLong(si)
                    }
                }
            } catch (e: Exception) {
                // a file: address, or a provider that tells nothing: the address's own name
            }
            if (name.isBlank()) name = uri.lastPathSegment?.substringAfterLast('/') ?: "file"
            if (size > MAX_IN) return null
            val bytes = c.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            if (bytes.isEmpty() || bytes.size > MAX_IN) return null
            JSONObject()
                .put("name", name)
                .put("mime", mimeOf(c, uri, name, mimeHint))
                .put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        } catch (e: Exception) {
            null
        } catch (e: OutOfMemoryError) {
            null
        }
    }

    fun mimeOfName(name: String): String? = when (name.substringAfterLast('.', "").lowercase()) {
        "gpx" -> "application/gpx+xml"
        "fit" -> "application/vnd.ant.fit"
        "tcx" -> "application/vnd.garmin.tcx+xml"
        "kmz" -> "application/vnd.google-earth.kmz"
        "kml" -> "application/vnd.google-earth.kml+xml"
        else -> null
    }

    private fun mimeOf(c: Context, uri: Uri, name: String, hint: String?): String {
        mimeOfName(name)?.let { return it }
        val own: String? = try { c.contentResolver.getType(uri) } catch (e: Exception) { null }
        val t = own ?: hint
        if (!t.isNullOrBlank() && t != "application/octet-stream" && !t.contains('*')) return t
        val ext = name.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    /** A name that is safe as a file's: no path, no character a file system refuses. */
    fun safeName(raw: String, mime: String): String {
        var name = raw.substringAfterLast('/').substringAfterLast('\\').replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().trimStart('.')
        if (name.length > 120) name = name.takeLast(120)
        if (name.isBlank()) {
            val ext = MimeTypeMap.getSingleton()?.getExtensionFromMimeType(mime) ?: "bin"
            name = "ozimut.$ext"
        }
        return name
    }

    /**
     * A file the site made (`saveFile`): written in the app's cache, then offered through the system's share sheet (save
     * to the files, send to another app). Blocking for the writing; -> the chooser's intent, null when it failed.
     */
    fun shareIntent(c: Context, rawName: String, rawMime: String, base64: String): Intent? {
        return try {
            val mime = rawMime.substringBefore(';').trim().ifBlank { "application/octet-stream" }
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val dir = File(c.cacheDir, "share").apply { mkdirs() }
            // yesterday's shared files are no longer needed
            dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 24 * 3600_000L) it.delete() }
            val f = File(dir, safeName(rawName, mime))
            f.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(c, c.packageName + ".files", f)
            val send = Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TITLE, f.name)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = android.content.ClipData.newRawUri(f.name, uri)
            Intent.createChooser(send, c.getString(R.string.share_file)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (e: Exception) {
            null
        } catch (e: OutOfMemoryError) {
            null
        }
    }
}
