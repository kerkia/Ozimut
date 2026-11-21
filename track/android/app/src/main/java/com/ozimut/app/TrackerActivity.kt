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
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import kotlin.math.roundToInt

/** The native tracker's screens: Start, Running (hold to stop, help) and Ended. */
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
    private var helpBox: LinearLayout? = null

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
                    isTaskRoot -> { startActivity(Intent(this@TrackerActivity, MainActivity::class.java)); finish() }
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
            !Device.paired(this) -> "unpaired"
            else -> "start"
        }
        if (want != shown) {
            shown = want
            root.removeAllViews()
            if (want != "start") stopPreview()
            when (want) {
                "running" -> buildRunning()
                "ended" -> buildEnded()
                "unpaired" -> buildUnpaired()
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

    // ---- Not paired

    private fun buildUnpaired() {
        add(Ui.text(this, getString(R.string.tr_title), 26f, bold = true))
        add(Ui.text(this, getString(R.string.tr_not_paired)))
        add(Ui.button(this, getString(R.string.tr_pair), style = 1, big = true) {
            startActivity(Intent(this, PairActivity::class.java))
        })
        add(Ui.button(this, getString(R.string.tr_open_site)) { openSite() })
    }

    // ---- Start

    private fun buildStart() {
        val name = Device.name(this)
        add(Ui.text(this, name.ifBlank { getString(R.string.tr_title) }, 26f, bold = true))
        val w = Device.watchers(this)
        add(Ui.text(this, if (w.isEmpty()) getString(R.string.tr_followed_nobody) else getString(R.string.tr_followed_by, w.joinToString(", ")), color = Ui.GREY))
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
        add(Ui.gap(this, 8))
        startBtn = Ui.button(this, getString(R.string.tr_start), style = 1, big = true) {
            if (!goodFix()) return@button
            Tracker.start(this, if (share.isChecked) "watchers" else "private")
            render()
        }.also { add(it) }
        waitText = Ui.text(this, getString(R.string.tr_wait_gps), 14f, color = Ui.GREY).also { add(it) }
        add(Ui.gap(this, 16))
        add(Ui.button(this, getString(R.string.tr_selftest)) { startActivity(Intent(this, SelfTestActivity::class.java)) })
        if (!Device.settings(this).onlyTracker) add(Ui.button(this, getString(R.string.tr_open_site)) { openSite() })
        if (hasLocation()) startPreview()
    }

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
        accText?.text = if (s.lastAcc >= 0 && System.currentTimeMillis() - s.lastFixAt < 15_000)
            getString(R.string.tr_gps_acc, s.lastAcc) else getString(R.string.tr_gps_searching)
        val pending = if (s.run.isNotEmpty()) FixDb.get(this).count(s.run) else 0
        pendText?.text = getString(R.string.tr_pending, pending)
        sentText?.text = when {
            s.failing -> getString(R.string.tr_send_failed)
            s.lastSent == 0L -> getString(R.string.tr_never_sent)
            else -> getString(R.string.tr_last_sent, ((System.currentTimeMillis() - s.lastSent) / 1000).toString() + " s")
        }
        sentText?.setTextColor(if (s.failing) Ui.ORANGE else Ui.GREY)
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
        if (!Device.settings(this).onlyTracker) add(Ui.button(this, getString(R.string.tr_open_site)) { openSite() })
    }

    private fun updateEnded() {
        val s = RunState.get(this)
        val pending = if (s.run.isNotEmpty()) FixDb.get(this).count(s.run) else 0
        val t = endStatus ?: return
        when {
            s.error == "device" -> { t.text = getString(R.string.tr_err_device); t.setTextColor(Ui.RED) }
            s.error == "closed" -> { t.text = getString(R.string.tr_err_closed); t.setTextColor(Ui.ORANGE) }
            s.state == RunState.ENDING && pending > 0 -> {
                t.text = if (s.failing) getString(R.string.tr_waiting, pending) else getString(R.string.tr_ended_sending)
                t.setTextColor(Ui.ORANGE)
            }
            s.state == RunState.ENDING -> { t.text = getString(R.string.tr_ended_sending); t.setTextColor(Ui.GREY) }
            else -> { t.text = getString(R.string.tr_all_sent); t.setTextColor(Ui.GREEN) }
        }
        (endButton as? TextView)?.text = getString(if (s.state == RunState.ENDING) R.string.tr_send_now else R.string.tr_new_run)
    }

    private fun openSite() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }
}
