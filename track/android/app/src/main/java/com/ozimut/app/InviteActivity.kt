package com.ozimut.app

import android.graphics.Bitmap
import android.os.Bundle
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeEncoder
import java.util.concurrent.Executors

/**
 * A new code for someone who will follow this phone (docs/track/ozitrac.md « The code a watcher scans »): its QR code to scan
 * with their Ozitrac, or the address to send them. A code serves once and lasts 24 hours.
 */
class InviteActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        root = Ui.column(this)
        Ui.page(this, root)
        make()
    }

    private fun make() {
        root.removeAllViews()
        root.addView(Ui.full(Ui.text(this, getString(R.string.invite_title), 24f, bold = true)))
        val status: TextView = Ui.text(this, getString(R.string.invite_making), color = Ui.GREY)
        root.addView(Ui.full(status))
        io.execute {
            val link = Channel.invite(applicationContext)
            runOnUiThread { if (link == null) failed(status) else show(link) }
        }
    }

    private fun failed(status: TextView) {
        status.text = getString(R.string.net_error)
        status.setTextColor(Ui.RED)
        root.addView(Ui.full(Ui.button(this, getString(R.string.retry), style = 1) { make() }))
    }

    private fun show(link: String) {
        root.removeAllViews()
        root.addView(Ui.full(Ui.text(this, getString(R.string.invite_title), 24f, bold = true)))
        root.addView(Ui.full(Ui.text(this, getString(R.string.invite_text))))
        val size = (resources.displayMetrics.widthPixels * 0.8).toInt().coerceAtMost(Ui.dp(this, 360))
        val qr: Bitmap? = try { BarcodeEncoder().encodeBitmap(link, BarcodeFormat.QR_CODE, size, size) } catch (e: Exception) { null }
        if (qr != null) {
            val img = ImageView(this).apply { setImageBitmap(qr); adjustViewBounds = true }
            root.addView(img, LinearLayout.LayoutParams(size, size).apply {
                gravity = android.view.Gravity.CENTER_HORIZONTAL
                topMargin = Ui.dp(this@InviteActivity, 8); bottomMargin = Ui.dp(this@InviteActivity, 8)
            })
        }
        root.addView(Ui.full(Ui.text(this, getString(R.string.invite_once), 14f, color = Ui.GREY)))
        root.addView(Ui.full(Ui.button(this, getString(R.string.invite_share), style = 1) {
            Screens.shareText(this, getString(R.string.invite_message, Me.name(this), link))
        }))
        root.addView(Ui.full(Ui.button(this, getString(R.string.invite_done)) { finish() }))
    }
}
