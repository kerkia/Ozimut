package com.ozimut.app

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import java.util.concurrent.Executors

/**
 * A person followed, live (docs/track/ozitrac.md « The apps »): their run read every `next` seconds while this screen is
 * open, their trail and position on the map, their alerts, « Enregistrer en GPX » of what was received, « Ne plus suivre ».
 */
class FollowActivity : ComponentActivity() {
    companion object {
        const val EXTRA_C = "c"

        /** « En course depuis 12 min · position il y a 20 s · batterie 54 % », « Course terminée à 14:32 », « Pas de course ». */
        fun stateLine(c: Context, r: FollowRun?): String {
            if (r == null || r.run.isBlank()) return c.getString(R.string.follow_no_run)
            val bits = mutableListOf<String>()
            if (r.state == "end") {
                bits += c.getString(R.string.follow_ended, Screens.time(if (r.last > 0) r.last else r.started))
            } else {
                bits += c.getString(R.string.follow_running, Screens.span(c, r.started))
                val lastFix = r.fixes.lastOrNull()?.t ?: r.last
                if (lastFix > 0) bits += c.getString(R.string.follow_position, Screens.span(c, lastFix))
            }
            r.bat?.let { bits += c.getString(R.string.follow_battery, it) }
            return bits.joinToString(" · ")
        }
    }

    private lateinit var follow: Follow
    private lateinit var map: TileMapView
    private lateinit var state: TextView
    private lateinit var alerts: LinearLayout
    private lateinit var followBtn: Button
    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var visible = false
    private var fitted = false
    private var nextSec = 15

    private val poller = object : Runnable {
        override fun run() {
            if (!visible) return
            io.execute {
                val p = Follows.poll(applicationContext, follow)
                ui.post {
                    if (p.error == "gone") {
                        Toast.makeText(this@FollowActivity, R.string.follow_gone, Toast.LENGTH_LONG).show()
                        finish()
                        return@post
                    }
                    nextSec = p.next
                    show(p.run)
                    if (visible) ui.postDelayed(this, nextSec * 1000L)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val f = Follows.get(this, intent.getStringExtra(EXTRA_C) ?: "")
        if (f == null) { finish(); return }
        follow = f
        val cfg = RelayConfig.get(this)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFFFFFFFF.toInt()) }
        Ui.padForBars(root)
        setContentView(root)
        val head = Ui.column(this, 12)
        head.addView(Ui.full(Ui.text(this, f.name.ifBlank { "?" }, 22f, bold = true)))
        state = Ui.text(this, "", 15f, color = Ui.GREY)
        head.addView(Ui.full(state))
        root.addView(head)

        val frame = FrameLayout(this)
        map = TileMapView(this).apply { template = cfg.tiles; credit = cfg.credit; maxZoom = cfg.maxZoom; setView(46.6, 2.4, 5.0) }
        frame.addView(map, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val tools = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        tools.addView(small("+") { map.zoomBy(1.0) })
        tools.addView(small("−") { map.zoomBy(-1.0) })
        followBtn = small(getString(R.string.map_follow)) { map.follow = !map.follow }
        tools.addView(followBtn)
        frame.addView(tools, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END)
            .apply { val m = Ui.dp(this@FollowActivity, 8); setMargins(m, m, m, m) })
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        map.onFollow = { on -> markFollow(on) }
        markFollow(map.follow)

        val foot = Ui.column(this, 12)
        alerts = Ui.column(this, 0)
        foot.addView(alerts)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        row.addView(Ui.button(this, getString(R.string.follow_gpx)) { saveGpx() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = Ui.dp(this@FollowActivity, 4) })
        row.addView(Ui.button(this, getString(R.string.follow_stop)) { unfollow() },
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = Ui.dp(this@FollowActivity, 4) })
        foot.addView(row)
        root.addView(foot)
        show(Follows.cached(this, f.c))
    }

    private fun small(label: String, onClick: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 16f
        minWidth = Ui.dp(this@FollowActivity, 48)
        minHeight = Ui.dp(this@FollowActivity, 44)
        background = Ui.round(0xEEFFFFFF.toInt(), Ui.dp(this@FollowActivity, 8).toFloat(), Ui.dp(this@FollowActivity, 1), Ui.INK)
        setTextColor(Ui.INK)
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { bottomMargin = Ui.dp(this@FollowActivity, 6) }
    }

    private fun markFollow(on: Boolean) {
        followBtn.background = Ui.round(if (on) Ui.ORANGE else 0xEEFFFFFF.toInt(), Ui.dp(this, 8).toFloat(), Ui.dp(this, 1), Ui.INK)
        followBtn.setTextColor(if (on) 0xFFFFFFFF.toInt() else Ui.INK)
    }

    override fun onResume() {
        super.onResume()
        visible = true
        ui.post(poller)
    }

    override fun onPause() {
        super.onPause()
        visible = false
        ui.removeCallbacks(poller)
    }

    private fun show(r: FollowRun?) {
        state.text = stateLine(this, r)
        val fixes = r?.fixes ?: emptyList()
        map.trail = fixes
        map.position = fixes.lastOrNull()
        if (!fitted && fixes.isNotEmpty() && map.width > 0) {
            map.fit(fixes)
            fitted = true
            map.follow = true
        } else if (!fitted && fixes.isNotEmpty()) {
            map.post { if (!fitted) { map.fit(fixes); fitted = true } }
        }
        alerts.removeAllViews()
        r?.alerts?.takeLast(3)?.reversed()?.forEach { (kind, t) ->
            val urgent = kind == "help" || kind == "silent" || kind == "zone"
            alerts.addView(Ui.full(Ui.text(this, Screens.time(t) + " · " + Notifs.alertText(this, follow.name, kind), 15f,
                bold = urgent, color = if (urgent) Ui.RED else Ui.INK)))
        }
    }

    private fun saveGpx() {
        val r = Follows.cached(this, follow.c)
        val fixes = r?.fixes ?: emptyList()
        if (fixes.isEmpty()) {
            Toast.makeText(this, R.string.follow_nothing, Toast.LENGTH_LONG).show()
            return
        }
        val name = follow.name.ifBlank { "Ozitrac" } + " " + Screens.dateTime(this, fixes.first().t)
        Screens.shareFile(this, RunLog.gpxFile(this, name, fixes))
    }

    private fun unfollow() {
        Screens.confirm(this, getString(R.string.follow_stop_ask, follow.name), getString(R.string.follow_stop)) {
            io.execute {
                val ok = Follows.unfollow(applicationContext, follow)
                ui.post {
                    if (ok) finish() else Toast.makeText(this, R.string.net_error, Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
