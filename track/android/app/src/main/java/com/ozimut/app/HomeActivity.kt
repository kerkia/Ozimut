package com.ozimut.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.util.concurrent.Executors

/**
 * Ozitrac's home (docs/track/ozitrac.md « The apps »): « Ma course » — the runs of this phone, who follows it, its zone, its
 * link to Ozimut — and « Je suis » — the people this phone follows. Everything native: no web page.
 */
class HomeActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private lateinit var body: LinearLayout
    private lateinit var tabMe: TextView
    private lateinit var tabFollow: TextView
    private val ui = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private var tab = "me"
    private var visible = false

    private val refresher = object : Runnable {
        override fun run() {
            if (!visible) return
            refreshInBackground()
            ui.postDelayed(this, 60_000)
        }
    }
    private val ticker = object : Runnable {
        override fun run() {
            if (!visible) return
            if (tab == "me") updateRunLine()
            ui.postDelayed(this, 1_000)
        }
    }
    private val listener = Runnable { if (tab == "me") render() }

    private val scan = registerForActivityResult(ScanContract()) { r ->
        val raw = r.contents ?: return@registerForActivityResult
        if (Codes.parse(raw) == null) {
            Toast.makeText(this, R.string.join_bad, Toast.LENGTH_LONG).show()
            return@registerForActivityResult
        }
        startActivity(Intent(this, JoinActivity::class.java).setData(Uri.parse(raw)))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        tab = prefs().getString("tab", "me") ?: "me"
        root = Ui.column(this)
        Ui.page(this, root)
        root.addView(Ui.full(Ui.text(this, getString(R.string.app_name), 28f, bold = true, color = Ui.ORANGE)))
        val tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        tabMe = tabButton(getString(R.string.tab_me)) { select("me") }
        tabFollow = tabButton(getString(R.string.tab_follow)) { select("follow") }
        tabs.addView(tabMe, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { rightMargin = Ui.dp(this@HomeActivity, 4) })
        tabs.addView(tabFollow, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { leftMargin = Ui.dp(this@HomeActivity, 4) })
        root.addView(Ui.full(tabs))
        body = Ui.column(this, 0)
        root.addView(body)
        TileMapView.pruneCache(this)
    }

    private fun prefs() = getSharedPreferences("ui", Context.MODE_PRIVATE)

    private fun tabButton(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 17f
        gravity = Gravity.CENTER
        minHeight = Ui.dp(this@HomeActivity, 48)
        setOnClickListener { onClick() }
    }

    private fun select(t: String) {
        tab = t
        prefs().edit().putString("tab", t).apply()
        render()
    }

    override fun onResume() {
        super.onResume()
        visible = true
        Tracker.listen(listener)
        Tracker.ensureService(this)
        render()
        ui.post(refresher)
        ui.post(ticker)
    }

    override fun onPause() {
        super.onPause()
        visible = false
        Tracker.unlisten(listener)
        ui.removeCallbacks(refresher)
        ui.removeCallbacks(ticker)
    }

    /** The watchers, the people followed and the relay's settings read again (a network thread). */
    private fun refreshInBackground() {
        io.execute {
            RelayConfig.refresh(applicationContext)
            Channel.refresh(applicationContext)
            for (f in Follows.list(applicationContext)) Follows.poll(applicationContext, f)
            ui.post { if (visible) render() }
        }
    }

    private fun add(v: View) = body.addView(Ui.full(v))

    private fun render() {
        val me = tab == "me"
        for ((t, on) in listOf(tabMe to me, tabFollow to !me)) {
            t.background = Ui.round(if (on) Ui.INK else Ui.PALE, Ui.dp(this, 10).toFloat())
            t.setTextColor(if (on) 0xFFFFFFFF.toInt() else Ui.INK)
        }
        body.removeAllViews()
        runLine = null
        if (me) renderMe() else renderFollow()
    }

    // ---- « Ma course »

    private var runLine: TextView? = null

    private fun renderMe() {
        val s = RunState.get(this)
        if (s.active) {
            runLine = Ui.text(this, "", 18f, bold = true).also { add(it) }
            add(Ui.button(this, getString(R.string.home_open_run), style = 1, big = true) { openTracker() })
            updateRunLine()
        } else {
            add(Ui.button(this, getString(R.string.home_start), style = 1, big = true) { openTracker() })
        }
        val name = Me.name(this)
        add(Ui.text(this, if (name.isBlank()) getString(R.string.home_no_name) else getString(R.string.home_name, name), color = Ui.GREY))
        add(Ui.button(this, getString(R.string.home_change_name)) { Screens.askName(this, force = true) { render() } })

        add(Ui.gap(this, 8))
        add(Ui.text(this, getString(R.string.watchers_title), 20f, bold = true))
        val ws = Channel.watchers(this)
        if (ws.isEmpty()) add(Ui.text(this, getString(R.string.watchers_none), color = Ui.GREY))
        for (w in ws) add(watcherRow(w))
        add(Ui.button(this, getString(R.string.watchers_add), style = 1) {
            Screens.askName(this) { startActivity(Intent(this, InviteActivity::class.java)) }
        })

        add(Ui.gap(this, 8))
        add(Ui.button(this, getString(R.string.runs_title)) { startActivity(Intent(this, RunsActivity::class.java)) })
        val z = Zone.get(this)
        add(Ui.button(this, if (z.on) getString(R.string.zone_on, z.r) else getString(R.string.zone_off)) {
            startActivity(Intent(this, ZoneActivity::class.java))
        })
        add(Ui.button(this, getString(R.string.tr_selftest)) { startActivity(Intent(this, SelfTestActivity::class.java)) })

        add(Ui.gap(this, 8))
        add(Ui.text(this, getString(R.string.oz_title), 20f, bold = true))
        if (Device.paired(this)) {
            add(Ui.text(this, getString(R.string.oz_linked, Device.name(this))))
            add(Ui.text(this, getString(R.string.oz_linked_text), 14f, color = Ui.GREY))
            add(Ui.button(this, getString(R.string.oz_unlink)) {
                Screens.confirm(this, getString(R.string.oz_unlink_ask), getString(R.string.oz_unlink)) {
                    if (RunState.get(this).active) {
                        Toast.makeText(this, R.string.test_busy, Toast.LENGTH_LONG).show()
                    } else {
                        Device.forget(this)
                        render()
                    }
                }
            })
        } else {
            add(Ui.text(this, getString(R.string.oz_text), 14f, color = Ui.GREY))
            add(Ui.button(this, getString(R.string.oz_link)) { startActivity(Intent(this, PairActivity::class.java)) })
        }

        // « Effacer mes données » (the privacy page and the stores' rules): the channel and every follow go from the relay
        add(Ui.gap(this, 8))
        add(Ui.text(this, getString(R.string.data_title), 20f, bold = true))
        add(Ui.text(this, getString(R.string.data_text), 14f, color = Ui.GREY))
        add(Ui.button(this, getString(R.string.data_erase)) {
            Screens.confirm(this, getString(R.string.data_erase_ask), getString(R.string.data_erase)) { eraseRelayData() }
        })
    }

    private fun eraseRelayData() {
        if (RunState.get(this).active) {
            Toast.makeText(this, R.string.test_busy, Toast.LENGTH_LONG).show()
            return
        }
        io.execute {
            var ok = Channel.delete(applicationContext)
            for (f in Follows.list(applicationContext)) ok = Follows.unfollow(applicationContext, f) && ok
            ui.post {
                Toast.makeText(this, if (ok) R.string.data_erased else R.string.net_error, Toast.LENGTH_LONG).show()
                if (visible) render()
            }
        }
    }

    private fun watcherRow(w: Channel.Watcher): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val label = Ui.text(this, w.name?.takeIf { it.isNotBlank() } ?: getString(R.string.watchers_unknown), 17f)
        row.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(Ui.button(this, getString(R.string.watchers_remove)) {
            Screens.confirm(this, getString(R.string.watchers_remove_ask, w.name ?: "?"), getString(R.string.watchers_remove)) {
                io.execute {
                    val ok = Channel.remove(applicationContext, w.w)
                    ui.post {
                        if (!ok) Toast.makeText(this, R.string.net_error, Toast.LENGTH_LONG).show()
                        render()
                    }
                }
            }
        })
        return row
    }

    private fun updateRunLine() {
        val t = runLine ?: return
        val s = RunState.get(this)
        t.text = when (s.state) {
            RunState.RUNNING -> getString(R.string.home_running, Ui.clock(System.currentTimeMillis() - s.started), Ui.km(s.distance))
            RunState.ENDING -> getString(R.string.tr_ended_sending)
            else -> ""
        }
    }

    private fun openTracker() = startActivity(Intent(this, TrackerActivity::class.java))

    // ---- « Je suis »

    private fun renderFollow() {
        add(Ui.button(this, getString(R.string.follow_scan), style = 1, big = true) {
            scan.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt(getString(R.string.follow_scan_prompt))
                    .setBeepEnabled(false)
                    .setOrientationLocked(false)
            )
        })
        val list = Follows.list(this)
        if (list.isEmpty()) {
            add(Ui.text(this, getString(R.string.follow_none), color = Ui.GREY))
            return
        }
        for (f in list) {
            val st = Follows.cached(this, f.c)
            val card = Ui.column(this, 14).apply {
                background = Ui.round(Ui.PALE, Ui.dp(this@HomeActivity, 12).toFloat())
                isClickable = true
                setOnClickListener {
                    startActivity(Intent(this@HomeActivity, FollowActivity::class.java).putExtra(FollowActivity.EXTRA_C, f.c))
                }
            }
            card.addView(Ui.text(this, f.name.ifBlank { "?" }, 19f, bold = true))
            card.addView(Ui.text(this, FollowActivity.stateLine(this, st), 15f, color = Ui.GREY))
            add(card)
        }
    }
}
