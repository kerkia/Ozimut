package com.ozimut.app

import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
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
 * open, their trail and position on the map, the pace of a long run and, when its runner allowed it, « Passer en direct » /
 * « Revenir au rythme lent » (« Pace »), their alerts, « Enregistrer en GPX » of what was received, « Ne plus suivre ».
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

        /** A request for Direct the relay holds and that has not run out (`min` 0 asks for the long pace again: until = at). */
        private fun asking(r: FollowRun, nowSec: Long): Boost? = r.boost?.takeIf { it.until > nowSec && it.until > it.at }

        /**
         * The pace of a long run under way: « Course longue : une position toutes les 30 s, envoi toutes les 10 min », « En
         * direct jusqu'à 14:35 » (« à ta demande » when [me] asked), a request not yet applied or refused. Null for Direct.
         */
        fun paceLine(c: Context, r: FollowRun?, me: String): String? {
            if (r == null || r.run.isBlank() || r.state == "end") return null
            val p = r.pace?.takeIf { it.long } ?: return null
            val now = System.currentTimeMillis() / 1000
            if (p.boosted(now)) {
                val until = Notifs.time(c, p.boost)
                return if (p.by.isNotBlank() && p.by == me) c.getString(R.string.pace_boost_you, until) else c.getString(R.string.pace_boost, until)
            }
            val long = c.getString(R.string.pace_long, p.fix, p.send / 60)
            val b = asking(r, now) ?: return long
            // a batch since the request still without Direct: the phone refused (its battery); none yet: it has not woken
            return long + " · " + c.getString(if (r.last >= b.at) R.string.pace_refused else R.string.pace_asked)
        }

        /** Whether a watcher may ask this run for Direct: a long run under way whose runner allowed it. */
        fun canAsk(r: FollowRun?): Boolean =
            r != null && r.run.isNotBlank() && r.state != "end" && r.pace?.let { it.long && it.remote } == true

        /** Direct asked or kept for a watcher: « Revenir au rythme lent » is offered. */
        fun direct(r: FollowRun?): Boolean {
            if (r == null) return false
            val now = System.currentTimeMillis() / 1000
            return r.pace?.boosted(now) == true || asking(r, now) != null
        }
    }

    private lateinit var follow: Follow
    private lateinit var map: TileMapView
    private lateinit var state: TextView
    private lateinit var paceText: TextView
    private lateinit var paceRow: LinearLayout
    private lateinit var liveBtn: Button
    private lateinit var slowBtn: Button
    private lateinit var alerts: LinearLayout
    private lateinit var followBtn: Button
    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var visible = false
    private var fitted = false
    private var nextSec = 15
    /** After a request for Direct, the run is read every 10 s for two minutes so that the change shows (uptime). */
    private var fastUntil = 0L

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
                    val wait = if (SystemClock.uptimeMillis() < fastUntil) minOf(10_000L, nextSec * 1000L) else nextSec * 1000L
                    if (visible) ui.postDelayed(this, wait)
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
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(0xFFFFFFFF.toInt()) }
        Ui.padForBars(root)
        setContentView(root)
        val head = Ui.column(this, 12)
        head.addView(Ui.full(Ui.text(this, f.name.ifBlank { "?" }, 22f, bold = true)))
        state = Ui.text(this, "", 15f, color = Ui.GREY)
        head.addView(Ui.full(state))
        paceText = Ui.text(this, "", 15f, color = Ui.INK)
        head.addView(Ui.full(paceText))
        paceRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        liveBtn = Ui.button(this, getString(R.string.follow_live)) { askLive() }
        slowBtn = Ui.button(this, getString(R.string.follow_slow)) { ask(0) }
        paceRow.addView(liveBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = Ui.dp(this@FollowActivity, 4) })
        paceRow.addView(slowBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = Ui.dp(this@FollowActivity, 4) })
        head.addView(Ui.full(paceRow))
        root.addView(head)

        val frame = FrameLayout(this)
        map = TileMapView(this).apply { setView(46.6, 2.4, 5.0) }
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
        val pl = paceLine(this, r, follow.w)
        paceText.text = pl ?: ""
        paceText.visibility = if (pl == null) View.GONE else View.VISIBLE
        val askable = canAsk(r)
        val inDirect = direct(r)
        paceRow.visibility = if (askable) View.VISIBLE else View.GONE
        liveBtn.text = getString(if (inDirect) R.string.follow_live_more else R.string.follow_live)
        slowBtn.visibility = if (askable && inDirect) View.VISIBLE else View.GONE
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
            alerts.addView(Ui.full(Ui.text(this, Screens.time(t) + " · " + Notifs.alertText(this, follow.name, kind, r?.pace?.long == true), 15f,
                bold = urgent, color = if (urgent) Ui.RED else Ui.INK)))
        }
    }

    /** « Passer en direct »: for how long. */
    private fun askLive() {
        val mins = intArrayOf(5, 15, 30, 60)
        val labels = mins.map { getString(R.string.follow_live_min, it) }.toTypedArray<CharSequence>()
        AlertDialog.Builder(this)
            .setTitle(getString(R.string.follow_live_title, follow.name.ifBlank { "?" }))
            .setItems(labels) { _, i -> ask(mins[i]) }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /** Asks the relay for Direct for [min] minutes (0: the long pace again), then reads the run more often for a while. */
    private fun ask(min: Int) {
        io.execute {
            val err = Follows.askPace(applicationContext, follow, min)
            ui.post {
                when (err) {
                    null -> {
                        Toast.makeText(this, if (min > 0) R.string.follow_live_sent else R.string.follow_slow_sent, Toast.LENGTH_LONG).show()
                        fastUntil = SystemClock.uptimeMillis() + 120_000L
                        if (visible) {
                            ui.removeCallbacks(poller)
                            ui.postDelayed(poller, 3_000)
                        }
                    }
                    "pace" -> Toast.makeText(this, R.string.follow_live_refused, Toast.LENGTH_LONG).show()
                    "many" -> Toast.makeText(this, R.string.follow_live_wait, Toast.LENGTH_LONG).show()
                    "gone" -> {
                        Toast.makeText(this, R.string.follow_gone, Toast.LENGTH_LONG).show()
                        finish()
                    }
                    else -> Toast.makeText(this, R.string.net_error, Toast.LENGTH_LONG).show()
                }
            }
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
