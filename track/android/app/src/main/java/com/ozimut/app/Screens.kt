package com.ozimut.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import androidx.core.content.FileProvider
import java.io.File
import java.text.DateFormat
import java.util.Date

/** Small things the screens share: a dialog asking the first name, a confirmation, sharing a file, dates. */
object Screens {
    /** Asks the first name put in the codes (once; [force] to change it). Calls [then] with it. */
    fun askName(a: Activity, force: Boolean = false, then: (String) -> Unit) {
        val now = Me.name(a)
        if (now.isNotBlank() && !force) { then(now); return }
        val field = EditText(a).apply {
            setText(now)
            hint = a.getString(R.string.name_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            setSingleLine()
        }
        val box = LinearLayout(a).apply {
            val p = Ui.dp(a, 20)
            setPadding(p, Ui.dp(a, 8), p, 0)
            addView(field, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        AlertDialog.Builder(a)
            .setTitle(R.string.name_title)
            .setMessage(R.string.name_text)
            .setView(box)
            .setPositiveButton(R.string.ok) { _, _ ->
                val n = field.text.toString().trim()
                if (n.isNotBlank()) {
                    Me.setName(a, n)
                    then(n)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    fun confirm(a: Activity, message: String, ok: String, then: () -> Unit) {
        AlertDialog.Builder(a)
            .setMessage(message)
            .setPositiveButton(ok) { _, _ -> then() }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** Shares a file of the app's (a GPX made in the cache) through the system's sheet. */
    fun shareFile(a: Activity, f: File, mime: String = "application/gpx+xml") {
        val uri = FileProvider.getUriForFile(a, a.packageName + ".files", f)
        val i = Intent(Intent.ACTION_SEND)
            .setType(mime)
            .putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_SUBJECT, f.nameWithoutExtension)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { a.startActivity(Intent.createChooser(i, a.getString(R.string.share_gpx))) } catch (e: Exception) { /* nothing to share with */ }
    }

    fun shareText(a: Activity, text: String) {
        val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        try { a.startActivity(Intent.createChooser(i, a.getString(R.string.invite_share))) } catch (e: Exception) { /* none */ }
    }

    fun dateTime(c: Context, sec: Long): String =
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(sec * 1000))

    fun time(sec: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(sec * 1000))

    /** The time since [sec] (Unix seconds): « 12 s », « 4 min », « 2 h ». */
    fun span(c: Context, sec: Long): String {
        val d = (System.currentTimeMillis() / 1000 - sec).coerceAtLeast(0)
        return when {
            d < 90 -> c.getString(R.string.ago_s, d)
            d < 5400 -> c.getString(R.string.ago_min, d / 60)
            else -> c.getString(R.string.ago_h, d / 3600)
        }
    }
}
