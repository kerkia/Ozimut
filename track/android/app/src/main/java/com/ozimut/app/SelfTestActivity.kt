package com.ozimut.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.LinearLayout
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

/**
 * The two-minute test: the phone locked for two minutes, the fixes received counted against those expected.
 * On failure, the maker's own advice and the way to the battery settings.
 */
class SelfTestActivity : ComponentActivity() {
    private lateinit var root: LinearLayout
    private val ui = Handler(Looper.getMainLooper())
    private var shown = ""
    private var status: android.widget.TextView? = null

    private val perms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r[Manifest.permission.ACCESS_FINE_LOCATION] == true) begin()
    }

    private val ticker = object : Runnable {
        override fun run() {
            SelfTest.check(this@SelfTestActivity)
            render()
            ui.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        root = Ui.column(this)
        Ui.page(this, root)
    }

    override fun onResume() {
        super.onResume()
        shown = ""
        ui.post(ticker)
    }

    override fun onPause() {
        super.onPause()
        ui.removeCallbacks(ticker)
    }

    private fun start() {
        if (RunState.get(this).active) return
        val list = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) list += Manifest.permission.POST_NOTIFICATIONS
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) begin()
        else perms.launch(list.toTypedArray())
    }

    private fun begin() {
        startForegroundService(Intent(this, TrackerService::class.java).setAction(TrackerService.ACTION_TEST))
        shown = ""
        ui.postDelayed({ render() }, 300)
    }

    private fun add(v: android.view.View) = root.addView(Ui.full(v))

    private fun render() {
        val s = SelfTest.get(this)
        val busy = RunState.get(this).active
        val want = when {
            busy && s.state != "running" -> "busy"
            s.state == "running" -> "running"
            s.state == "done" -> "done:" + s.result
            else -> "intro"
        }
        if (want != shown) {
            shown = want
            root.removeAllViews()
            add(Ui.text(this, getString(R.string.test_title), 26f, bold = true))
            when {
                want == "busy" -> add(Ui.text(this, getString(R.string.test_busy)))
                want == "intro" -> {
                    add(Ui.text(this, getString(R.string.test_intro)))
                    add(Ui.button(this, getString(R.string.test_start), style = 1, big = true) { start() })
                }
                want == "running" -> {
                    status = Ui.text(this, "", 20f, bold = true).also { add(it) }
                    add(Ui.button(this, getString(R.string.test_cancel)) {
                        startService(Intent(this, TrackerService::class.java).setAction(TrackerService.ACTION_TEST_CANCEL))
                        SelfTest.reset(this)
                        shown = ""
                        render()
                    })
                }
                else -> buildResult(s)
            }
        }
        if (want == "running") {
            val left = if (s.first > 0) (SelfTest.WINDOW - (System.currentTimeMillis() / 1000 - s.first)).coerceAtLeast(0) else -1
            status?.text = if (left < 0) getString(R.string.test_waiting_gps)
            else getString(R.string.test_running, Ui.clock(left * 1000).removePrefix("0:"))
        }
    }

    private fun buildResult(s: SelfTest.S) {
        when (s.result) {
            "ok" -> add(Ui.text(this, getString(R.string.test_ok, s.count, SelfTest.WINDOW), 18f, color = Ui.GREEN))
            "nofix" -> add(Ui.text(this, getString(R.string.test_nofix), 18f, color = Ui.ORANGE))
            else -> {
                add(Ui.text(this, getString(R.string.test_fail, s.count, SelfTest.WINDOW), 18f, bold = true, color = Ui.RED))
                val advice = when (Phone.maker()) {
                    Phone.Maker.SAMSUNG -> R.string.advice_samsung
                    Phone.Maker.XIAOMI -> R.string.advice_xiaomi
                    Phone.Maker.HUAWEI -> R.string.advice_huawei
                    Phone.Maker.ONEPLUS -> R.string.advice_oneplus
                    Phone.Maker.OTHER -> R.string.advice_other
                }
                add(Ui.text(this, getString(advice)))
                add(Ui.button(this, getString(R.string.test_battery), style = 1) { Phone.openSettings(this, "battery") })
                add(Ui.button(this, getString(R.string.test_app)) { Phone.openSettings(this, "app") })
            }
        }
        add(Ui.gap(this, 12))
        add(Ui.button(this, getString(R.string.test_again)) {
            SelfTest.reset(this)
            shown = ""
            render()
        })
    }
}
