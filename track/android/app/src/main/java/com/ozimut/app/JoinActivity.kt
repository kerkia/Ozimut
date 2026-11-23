package com.ozimut.app

import android.content.Intent
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import java.util.concurrent.Executors

/**
 * Follows someone from their code: `https://ozimut.com/z/<c>#…` opened (App Link) or scanned in the app. Asks this phone's
 * first name once, joins the channel, then shows the person's map.
 */
class JoinActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private val io = Executors.newSingleThreadExecutor()
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        root = Ui.column(this)
        Ui.page(this, root)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(i: Intent?) {
        root.removeAllViews()
        root.addView(Ui.full(Ui.text(this, getString(R.string.join_title), 24f, bold = true)))
        status = Ui.text(this, "", 16f)
        root.addView(Ui.full(status))
        val link = Codes.parse(i?.dataString ?: i?.getStringExtra(Intent.EXTRA_TEXT))
        if (link == null) {
            status.text = getString(R.string.join_bad)
            status.setTextColor(Ui.RED)
            root.addView(Ui.full(Ui.button(this, getString(R.string.invite_done)) { home() }))
            return
        }
        Follows.get(this, link.c)?.let { open(it.c); return }
        root.addView(Ui.full(Ui.text(this, getString(R.string.join_text, link.name.ifBlank { "?" }))))
        root.addView(Ui.full(Ui.button(this, getString(R.string.join_go), style = 1, big = true) {
            Screens.askName(this) { join(link) }
        }))
        root.addView(Ui.full(Ui.button(this, getString(R.string.cancel)) { home() }))
    }

    private fun join(link: Codes.Link) {
        if (busy) return
        busy = true
        status.text = getString(R.string.join_working)
        status.setTextColor(Ui.GREY)
        io.execute {
            val r = Follows.join(applicationContext, link)
            runOnUiThread {
                busy = false
                val f = r.follow
                if (f != null) {
                    // the alerts reach this phone through its push token, when the app is built with one
                    val app = applicationContext
                    PushSupport.token(app) { t -> if (t != null) Executors.newSingleThreadExecutor().execute { Follows.registerPush(app, f, t) } }
                    open(f.c)
                    return@runOnUiThread
                }
                status.setTextColor(Ui.RED)
                status.text = getString(
                    when (r.error) {
                        "code" -> R.string.join_err_code
                        "gone" -> R.string.join_err_gone
                        "many" -> R.string.pair_err_many
                        else -> R.string.net_error
                    }
                )
            }
        }
    }

    private fun open(c: String) {
        startActivity(Intent(this, FollowActivity::class.java).putExtra(FollowActivity.EXTRA_C, c))
        finish()
    }

    private fun home() {
        startActivity(Intent(this, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }
}
