package com.ozimut.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import kotlin.math.roundToInt

/**
 * The run's screens: Start (with the pace, Direct or « Course longue »: docs/track/folloz.md « Pace »), Running (hold to
 * stop, help) and Ended. A run is kept on this phone; it goes to the people who follow it (Folloz's relay) and to the Ozimut
 * account the phone is linked to, when there are any.
 */
class TrackerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_CONFIRM_STOP = "confirmStop"
        private const val GOOD_START = 20 // metres: the first fix better than this enables Start
    }

    private lateinit var root: LinearLayout
    private var shown = ""
    private val ui = Handler(Looper.getMainLooper())
    private val listener = Runnable { render() }

    // Start screen
    private var gpsText: TextView? = null
    private var netText: TextView? = null
    private var batText: TextView? = null
    private var startBtn: View? = null
    private var waitText: TextView? = null
    private var permBtn: View? = null
    private var previewAcc = -1f
    private var previewAt = 0L
    private var previewOn = false

    // Running screen
    private var clockText: TextView? = null
    private var distText: TextView? = null
    private var pendText: TextView? = null
    private var sentText: TextView? = null
    private var accText: TextView? = null
    private var paceText: TextView? = null
    private var helpBox: LinearLayout? = null
    /** The watcher whose request for Direct is shown, and the name this phone holds for them (read once per request). */
    private var askerW = ""
    private var askerName: String? = null

    // Ended screen
    private var endStatus: TextView? = null
    private var endButton: View? = null

    private val perms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        shown = ""
        render()
    }

    private val preview = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            previewAcc = if (location.hasAccuracy()) location.accuracy else 999f
            previewAt = System.currentTimeMillis()
            updateStart()
        }
        override fun onProviderEnabled(provider: String) { updateStart() }
        override fun onProviderDisabled(provider: String) { updateStart() }
        @Deprecated("Deprecated in Java")
        @Suppress("DEPRECATION")
        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }

    private val ticker = object : Runnable {
        override fun run() {
            when (shown) {
                "running" -> updateRunning()
                "start" -> updateStart()
                "ended" -> updateEnded()
            }
            ui.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        root = Ui.column(this)
        Ui.page(this, root)
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    Device.paired(this@TrackerActivity) && Device.settings(this@TrackerActivity).onlyTracker -> moveTaskToBack(true)
                    isTaskRoot -> { startActivity(Intent(this@TrackerActivity, HomeActivity::class.java)); finish() }
                    else -> finish()
                }
            }
        })
        confirmStopHint(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        confirmStopHint(intent)
    }

    private fun confirmStopHint(i: Intent?) {
        if (i?.getBooleanExtra(EXTRA_CONFIRM_STOP, false) == true) {
            Toast.makeText(this, R.string.tr_hold_hint, Toast.LENGTH_LONG).show()
        }
    }

    override fun onResume() {
        super.onResume()
        Tracker.listen(listener)
        Tracker.ensureService(this)
        shown = ""
        render()
        ui.removeCallbacks(ticker)
        ui.post(ticker)
    }

    override fun onPause() {
        super.onPause()
        Tracker.unlisten(listener)
        ui.removeCallbacks(ticker)
        stopPreview()
    }

    private fun hasLocation() = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun askPermissions() {
        val list = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) list += Manifest.permission.POST_NOTIFICATIONS
        perms.launch(list.toTypedArray())
    }

    private fun render() {
        val s = RunState.get(this)
        val want = when {
            s.state == RunState.RUNNING -> "running"
            s.state == RunState.ENDING || s.state == RunState.ENDED -> "ended"
            else -> "start"
        }
        if (want != shown) {
            shown = want
            root.removeAllViews()
            if (want != "start") stopPreview()
            when (want) {
                "running" -> buildRunning()
                "ended" -> buildEnded()
                else -> buildStart()
            }
        }
        when (shown) {
            "running" -> updateRunning()
            "start" -> updateStart()
            "ended" -> updateEnded()
        }
    }

    private fun add(v: View) = root.addView(Ui.full(v))

    // ---- Start

    private fun buildStart() {
        val name = Me.name(this).ifBlank { Device.name(this) }
        add(Ui.text(this, name.ifBlank { getString(R.string.tr_title) }, 26f, bold = true))
        val w = followers()
        add(Ui.text(this, when {
            w.isNotEmpty() -> getString(R.string.tr_followed_by, w.joinToString(", "))
            Device.paired(this) -> getString(R.string.tr_followed_ozimut)
            else -> getString(R.string.tr_followed_nobody)
        }, color = Ui.GREY))
        add(Ui.gap(this, 4))
        gpsText = Ui.text(this, "", 18f).also { add(it) }
        netText = Ui.text(this, "").also { add(it) }
        batText = Ui.text(this, "").also { add(it) }
        permBtn = Ui.button(this, getString(R.string.tr_gps_allow), style = 1) { askPermissions() }.also { add(it) }
        add(Ui.gap(this, 4))
        add(Ui.text(this, getString(R.string.tr_privacy), 15f, color = Ui.GREY))
        val prefs = getSharedPreferences("ui", Context.MODE_PRIVATE)
        val share = CheckBox(this).apply {
            text = getString(R.string.tr_share)
            textSize = 16f
            isChecked = prefs.getBoolean("share", true)
            setOnCheckedChangeListener { _, on -> prefs.edit().putBoolean("share", on).apply() }
        }
        add(share)
        val pace = paceChooser(prefs)
        add(Ui.gap(this, 8))
        startBtn = Ui.button(this, getString(R.string.tr_start), style = 1, big = true) {
            if (!goodFix()) return@button
            val choice = pace()
            Tracker.start(this, if (share.isChecked) "watchers" else "private", choice)
            // a watcher's request for Direct wakes the phone through its push token
            if (choice.long && choice.remote) OwnPush.sync(this)
            render()
        }.also { add(it) }
        waitText = Ui.text(this, getString(R.string.tr_wait_gps), 14f, color = Ui.GREY).also { add(it) }
        add(Ui.gap(this, 16))
        add(Ui.button(this, getString(R.string.tr_selftest)) { startActivity(Intent(this, SelfTestActivity::class.java)) })
        if (hasLocation()) startPreview()
    }

    /**
     * The pace: « Direct » (the default) or « Course longue » with its two intervals and whether watchers may ask for Direct;
     * the last choices kept. -> what is chosen when Start is pressed.
     */
    private fun paceChooser(prefs: android.content.SharedPreferences): () -> PaceChoice {
        add(Ui.gap(this, 4))
        add(Ui.text(this, getString(R.string.tr_pace_title), 18f, bold = true))
        val modes = RadioGroup(this).apply { orientation = RadioGroup.VERTICAL }
        val live = radio(getString(R.string.tr_pace_live))
        val long = radio(getString(R.string.tr_pace_long))
        modes.addView(live)
        modes.addView(long)
        add(modes)
        val box = Ui.column(this, 0)
        add(box)
        box.addView(Ui.full(Ui.text(this, getString(R.string.tr_pace_long_text), 14f, color = Ui.GREY)))
        box.addView(Ui.full(Ui.text(this, getString(R.string.tr_pace_fix))))
        val fixes = row(PaceChoice.FIXES.map { getString(R.string.unit_s, it) })
        box.addView(Ui.full(fixes.first))
        box.addView(Ui.full(Ui.text(this, getString(R.string.tr_pace_send))))
        val sends = row(PaceChoice.SENDS.map { getString(R.string.unit_min, it / 60) })
        box.addView(Ui.full(sends.first))
        val remote = CheckBox(this).apply {
            text = getString(R.string.tr_pace_remote)
            textSize = 16f
            isChecked = prefs.getBoolean("pace_remote", true)
        }
        box.addView(Ui.full(remote))

        val fixAt = PaceChoice.FIXES.indexOf(prefs.getInt("pace_fix", PaceChoice.FIX_DEFAULT)).takeIf { it >= 0 } ?: 1
        val sendAt = PaceChoice.SENDS.indexOf(prefs.getInt("pace_send", PaceChoice.SEND_DEFAULT)).takeIf { it >= 0 } ?: 1
        fixes.second[fixAt].isChecked = true
        sends.second[sendAt].isChecked = true
        val isLong = prefs.getBoolean("pace_long", false)
        (if (isLong) long else live).isChecked = true
        box.visibility = if (isLong) View.VISIBLE else View.GONE

        fun chosen(): PaceChoice {
            if (!long.isChecked) return PaceChoice.LIVE
            val f = PaceChoice.FIXES[fixes.second.indexOfFirst { it.isChecked }.coerceAtLeast(0)]
            val s = PaceChoice.SENDS[sends.second.indexOfFirst { it.isChecked }.coerceAtLeast(0)]
            return PaceChoice.long(f, s, remote.isChecked)
        }
        fun keep() {
            val c = chosen()
            prefs.edit().putBoolean("pace_long", c.long).putBoolean("pace_remote", remote.isChecked).apply()
            if (c.long) prefs.edit().putInt("pace_fix", c.fix).putInt("pace_send", c.send).apply()
        }
        modes.setOnCheckedChangeListener { _, _ ->
            box.visibility = if (long.isChecked) View.VISIBLE else View.GONE
            keep()
        }
        fixes.second.forEach { b -> b.setOnCheckedChangeListener { _, on -> if (on) keep() } }
        sends.second.forEach { b -> b.setOnCheckedChangeListener { _, on -> if (on) keep() } }
        remote.setOnCheckedChangeListener { _, _ -> keep() }
        return { chosen() }
    }

    private fun radio(label: String) = RadioButton(this).apply {
        id = View.generateViewId()
        text = label
        textSize = 16f
    }

    /** A row of choices, one checked at a time. */
    private fun row(labels: List<String>): Pair<RadioGroup, List<RadioButton>> {
        val g = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        val buttons = labels.map { radio(it) }
        buttons.forEach { g.addView(it, RadioGroup.LayoutParams(0, RadioGroup.LayoutParams.WRAP_CONTENT, 1f)) }
        return g to buttons
    }

    /** Who follows this phone: Folloz's watchers by name, and those of the Ozimut account it is linked to. */
    private fun followers(): List<String> {
        val names = Channel.keyed(this).mapNotNull { it.name?.takeIf { n -> n.isNotBlank() } }
        val oz = if (Device.paired(this)) Device.watchers(this) else emptyList()
        return (names + oz).distinct()
    }

    /** The run goes nowhere but this phone. */
    private fun local() = RunState.get(this).dests.isEmpty()

    private fun goodFix() = previewAcc in 0f..GOOD_START.toFloat() && System.currentTimeMillis() - previewAt < 10_000

    private fun gpsEnabled(): Boolean = try {
        (getSystemService(LOCATION_SERVICE) as LocationManager).isProviderEnabled(LocationManager.GPS_PROVIDER)
    } catch (e: Exception) { false }

    private fun updateStart() {
        val g = gpsText ?: return
        val located = hasLocation()
        permBtn?.visibility = if (located) View.GONE else View.VISIBLE
        val fresh = System.currentTimeMillis() - previewAt < 10_000
        when {
            !located -> { g.text = getString(R.string.tr_gps_need); g.setTextColor(Ui.RED) }
            !gpsEnabled() -> { g.text = getString(R.string.tr_gps_off); g.setTextColor(Ui.RED) }
            !fresh || previewAcc < 0 -> { g.text = getString(R.string.tr_gps_searching); g.setTextColor(Ui.GREY) }
            else -> {
                g.text = getString(R.string.tr_gps_acc, previewAcc.roundToInt())
                g.setTextColor(if (previewAcc <= GOOD_START) Ui.GREEN else Ui.ORANGE)
            }
        }
        if (located && !previewOn) startPreview()
        val online = Phone.online(this)
        netText?.text = getString(if (online) R.string.tr_net_on else R.string.tr_net_off)
        netText?.setTextColor(if (online) Ui.INK else Ui.ORANGE)
        val b = Phone.battery(this)
        batText?.text = if (b != null) getString(R.string.tr_battery, b) else ""
        val ok = located && goodFix()
        startBtn?.isEnabled = ok
        startBtn?.alpha = if (ok) 1f else 0.4f
        waitText?.visibility = if (ok || !located) View.GONE else View.VISIBLE
    }

    private fun startPreview() {
        if (previewOn || !hasLocation()) return
        try {
            (getSystemService(LOCATION_SERVICE) as LocationManager)
                .requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, preview, Looper.getMainLooper())
            previewOn = true
        } catch (e: SecurityException) {
            // permission withdrawn
        } catch (e: IllegalArgumentException) {
            // no GPS on this device
        }
    }

    private fun stopPreview() {
        if (!previewOn) return
        try { (getSystemService(LOCATION_SERVICE) as LocationManager).removeUpdates(preview) } catch (e: Exception) { /* off */ }
        previewOn = false
    }

    // ---- Running

    private fun buildRunning() {
        clockText = Ui.text(this, "0:00:00", 56f, bold = true).also { add(it) }
        distText = Ui.text(this, "", 22f).also { add(it) }
        accText = Ui.text(this, "", 15f, color = Ui.GREY).also { add(it) }
        paceText = Ui.text(this, "", 15f, color = Ui.INK).also { add(it) }
        pendText = Ui.text(this, "", 15f, color = Ui.GREY).also { add(it) }
        sentText = Ui.text(this, "", 15f, color = Ui.GREY).also { add(it) }
        add(Ui.gap(this, 12))
        add(HoldButton(this, getString(R.string.tr_hold_stop), 2000) {
            Tracker.stop(this)
            render()
        })
        add(Ui.text(this, getString(R.string.tr_hold_hint), 14f, color = Ui.GREY))
        add(Ui.gap(this, 20))
        add(Ui.button(this, getString(R.string.tr_help)) {
            Tracker.help(this)
            updateRunning()
        })
        helpBox = Ui.column(this, 0).also { add(it) }
    }

    private fun updateRunning() {
        val s = RunState.get(this)
        clockText?.text = Ui.clock(System.currentTimeMillis() - s.started)
        distText?.text = getString(R.string.tr_distance, Ui.km(s.distance))
        val pace = PaceState.now(this, System.currentTimeMillis() / 1000, 0)
        // a long run's fixes come every 15-60 s, delivered together: its GPS line says the last accuracy without waiting
        val fresh = if (pace.long) 2 * pace.send * 1000L else 15_000L
        accText?.text = if (s.lastAcc >= 0 && System.currentTimeMillis() - s.lastFixAt < fresh)
            getString(R.string.tr_gps_acc, s.lastAcc) else getString(R.string.tr_gps_searching)
        if (pace.boosted(System.currentTimeMillis() / 1000) && pace.by != askerW) {
            askerW = pace.by
            askerName = Channel.watchers(this).firstOrNull { it.w == pace.by }?.name?.takeIf { it.isNotBlank() }
        }
        val pt = Notifs.paceText(this, pace, askerName)
        paceText?.text = pt ?: ""
        paceText?.visibility = if (pt == null) View.GONE else View.VISIBLE
        if (local()) {
            pendText?.text = getString(R.string.tr_local)
            sentText?.text = ""
        } else {
            pendText?.text = getString(R.string.tr_pending, Tracker.pending(this))
            sentText?.text = when {
                s.failing -> getString(R.string.tr_send_failed)
                s.lastSent == 0L -> getString(R.string.tr_never_sent)
                else -> getString(R.string.tr_last_sent, ((System.currentTimeMillis() - s.lastSent) / 1000).toString() + " s")
            }
            sentText?.setTextColor(if (s.failing) Ui.ORANGE else Ui.GREY)
        }
        val box = helpBox ?: return
        val helped = s.helpAt > 0
        if (helped && box.childCount == 0) {
            box.addView(Ui.full(Ui.text(this, getString(R.string.tr_help_sent), 17f, bold = true, color = Ui.RED)))
            Device.settings(this).call?.let { number ->
                box.addView(Ui.full(Ui.button(this, getString(R.string.tr_help_call, number), style = 2) {
                    try { startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + number))) } catch (e: Exception) { /* no dialer */ }
                }))
            }
        }
    }

    // ---- Ended

    private fun buildEnded() {
        val s = RunState.get(this)
        add(Ui.text(this, getString(R.string.tr_ended), 26f, bold = true))
        val end = if (s.endedAt > 0) s.endedAt else System.currentTimeMillis()
        add(Ui.text(this, getString(R.string.tr_duration, Ui.clock(end - s.started)), 18f))
        add(Ui.text(this, getString(R.string.tr_dist_label, Ui.km(s.distance)), 18f))
        endStatus = Ui.text(this, "", 17f).also { add(it) }
        add(Ui.gap(this, 12))
        endButton = Ui.button(this, getString(R.string.tr_new_run), style = 1, big = true) {
            val st = RunState.get(this)
            if (st.state == RunState.ENDING) {
                Tracker.send(this, TrackerService.ACTION_RESUME)
            } else {
                RunState.clear(this)
                FixDb.get(this).dropAllBut(null)
                shown = ""
                render()
            }
        }.also { add(it) }
        add(Ui.button(this, getString(R.string.runs_title)) { startActivity(Intent(this, RunsActivity::class.java)) })
        add(Ui.button(this, getString(R.string.tr_home)) { home() })
    }

    private fun updateEnded() {
        val s = RunState.get(this)
        val pending = Tracker.pending(this)
        val t = endStatus ?: return
        when {
            s.error == "device" -> { t.text = getString(R.string.tr_err_device); t.setTextColor(Ui.RED) }
            s.error == "closed" -> { t.text = getString(R.string.tr_err_closed); t.setTextColor(Ui.ORANGE) }
            s.state == RunState.ENDING && pending > 0 -> {
                t.text = if (s.failing) getString(R.string.tr_waiting, pending) else getString(R.string.tr_ended_sending)
                t.setTextColor(Ui.ORANGE)
            }
            s.state == RunState.ENDING -> { t.text = getString(R.string.tr_ended_sending); t.setTextColor(Ui.GREY) }
            s.dests.isEmpty() && s.lastSent == 0L -> { t.text = getString(R.string.tr_kept); t.setTextColor(Ui.GREEN) }
            else -> { t.text = getString(R.string.tr_all_sent); t.setTextColor(Ui.GREEN) }
        }
        (endButton as? TextView)?.text = getString(if (s.state == RunState.ENDING) R.string.tr_send_now else R.string.tr_new_run)
    }

    private fun home() {
        startActivity(Intent(this, HomeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }
}
