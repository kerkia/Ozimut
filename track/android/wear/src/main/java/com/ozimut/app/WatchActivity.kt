package com.ozimut.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import java.util.Locale

/**
 * The watch's one screen: the claim code while unpaired, then Start; during a run the time, the distance, the GPS,
 * whether positions get through, and two buttons held two seconds — Help and Stop — so that a sleeve never presses them.
 */
class WatchActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var box: LinearLayout
    private var shown = ""
    private var claimNote = ""
    private var helpSentAt = 0L
    private var visible = false

    private val refresh = Runnable { draw() }
    private val tick = object : Runnable {
        override fun run() {
            draw()
            main.postDelayed(this, 1_000)
        }
    }
    private val claimLoop = object : Runnable {
        override fun run() {
            if (!visible || Device.paired(this@WatchActivity)) return
            Thread {
                val r = Claim.ask(this@WatchActivity)
                main.post {
                    claimNote = when (r) {
                        Claim.Result.Offline -> getString(R.string.w_offline)
                        Claim.Result.TooMany -> getString(R.string.w_too_many)
                        else -> ""
                    }
                    shown = ""
                    draw()
                    if (r !is Claim.Result.Paired) main.postDelayed(this, 10_000)
                }
            }.start()
        }
    }

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) startRun()
        else { claimNote = getString(R.string.w_need_location); shown = ""; draw() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val dm = resources.displayMetrics
        val side = minOf(dm.widthPixels, dm.heightPixels)
        // a round screen: the content kept inside the square the circle holds
        val inset = if (resources.configuration.isScreenRound) (side * 0.146).toInt() else (side * 0.05).toInt()
        box.setPadding(inset, inset / 2, inset, inset)
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.BLACK)
            addView(box)
        })
    }

    override fun onResume() {
        super.onResume()
        visible = true
        Tracker.listen(refresh)
        Tracker.ensureService(this)
        shown = ""
        draw()
        main.post(tick)
        main.post(claimLoop)
    }

    override fun onPause() {
        visible = false
        Tracker.unlisten(refresh)
        main.removeCallbacks(tick)
        main.removeCallbacks(claimLoop)
        super.onPause()
    }

    private fun startRun() {
        Tracker.start(this, "watchers")
        shown = ""
        draw()
    }

    private fun askStart() {
        val need = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.ACCESS_FINE_LOCATION
            need += Manifest.permission.ACCESS_COARSE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need += Manifest.permission.POST_NOTIFICATIONS
        }
        if (need.isEmpty()) startRun() else askPermissions.launch(need.toTypedArray())
    }

    // ---------------------------------------------------------------------------------------------------------------

    private fun draw() {
        val name = Tracker.stateName(this)
        val s = RunState.get(this)
        // the screen is built again only when its kind changes; the figures are set each second
        val kind = when (name) {
            "none" -> "code"
            "running" -> "run"
            "ending" -> "ending"
            else -> "ready"
        }
        window.apply {
            if (kind == "run") addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        if (kind != shown) {
            shown = kind
            box.removeAllViews()
            when (kind) {
                "code" -> buildCode()
                "run" -> buildRun()
                "ending" -> buildEnding()
                else -> buildReady(s)
            }
        }
        if (kind == "run") fillRun(s)
    }

    private fun buildCode() {
        text(getString(R.string.w_code_title), 15f, bold = true)
        text(ClaimCodes.shown(Claim.code(this)), 30f, bold = true, color = ORANGE, mono = true)
        text(getString(R.string.w_code_text), 12f, color = GREY)
        if (claimNote.isNotEmpty()) text(claimNote, 12f, color = ORANGE)
        button(getString(R.string.w_new_code), filled = false) { Claim.renew(this); shown = ""; draw() }
    }

    private fun buildReady(s: RunState.S) {
        text(getString(R.string.app_name), 15f, bold = true, color = ORANGE)
        val who = Device.name(this)
        if (who.isNotBlank()) text(getString(R.string.w_for, who), 13f)
        val w = Device.watchers(this)
        text(if (w.isEmpty()) getString(R.string.w_nobody) else getString(R.string.w_watchers, w.joinToString(", ")), 11f, color = GREY)
        if (s.state == RunState.ENDED && System.currentTimeMillis() - s.endedAt < 30 * 60_000L) {
            text(getString(if (s.error == "closed") R.string.w_closed else R.string.w_sent), 12f, color = GREEN)
        }
        if (claimNote.isNotEmpty()) text(claimNote, 12f, color = ORANGE)
        button(getString(R.string.w_start), filled = true) { claimNote = ""; askStart() }
    }

    private lateinit var tTime: TextView
    private lateinit var tDist: TextView
    private lateinit var tGps: TextView
    private lateinit var tNet: TextView

    private fun buildRun() {
        tTime = text("", 30f, bold = true, mono = true)
        tDist = text("", 15f)
        tGps = text("", 11f, color = GREY)
        tNet = text("", 11f, color = GREY)
        holdButton(getString(R.string.w_help), RED) {
            Tracker.help(this)
            helpSentAt = System.currentTimeMillis()
        }
        holdButton(getString(R.string.w_stop), ORANGE) { Tracker.stop(this) }
    }

    private fun fillRun(s: RunState.S) {
        val sec = ((System.currentTimeMillis() - s.started) / 1000).coerceAtLeast(0)
        tTime.text = String.format(Locale.ROOT, "%d:%02d:%02d", sec / 3600, sec / 60 % 60, sec % 60)
        tDist.text = String.format(Locale.getDefault(), "%.2f km", s.distance / 1000)
        val fresh = s.lastFixAt > 0 && System.currentTimeMillis() - s.lastFixAt < 15_000
        tGps.text = if (fresh) getString(R.string.w_acc, s.lastAcc) else getString(R.string.w_gps_wait)
        tNet.text = when {
            System.currentTimeMillis() - helpSentAt < 60_000 -> getString(R.string.w_help_sent)
            s.failing -> getString(R.string.w_net_fail)
            s.lastSent > 0 -> getString(R.string.w_net_ok)
            else -> ""
        }
        tNet.setTextColor(if (s.failing) ORANGE else GREY)
    }

    private fun buildEnding() {
        text(getString(R.string.w_sending), 14f, bold = true)
        text(getString(R.string.notif_sending_text), 11f, color = GREY)
    }

    // ---------------------------------------------------------------------------------------------------------------

    private fun lp() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(4)
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float, bold: Boolean = false, color: Int = Color.WHITE, mono: Boolean = false): TextView =
        TextView(this).apply {
            text = s
            textSize = size
            setTextColor(color)
            gravity = Gravity.CENTER
            typeface = when {
                mono && bold -> Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
                bold -> Typeface.DEFAULT_BOLD
                else -> Typeface.DEFAULT
            }
            box.addView(this, lp())
        }

    private fun pill(fill: Int, filled: Boolean) = GradientDrawable().apply {
        cornerRadius = dp(24).toFloat()
        if (filled) setColor(fill) else { setColor(Color.TRANSPARENT); setStroke(dp(1), GREY) }
    }

    private fun button(label: String, filled: Boolean, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 14f
            setTextColor(Color.WHITE)
            background = pill(ORANGE, filled)
            minHeight = dp(44)
            setOnClickListener { onClick() }
            box.addView(this, lp().apply { topMargin = dp(10) })
        }

    /** A button that acts only once held [HOLD_MS]; its text counts down meanwhile. */
    @SuppressLint("ClickableViewAccessibility")
    private fun holdButton(label: String, fill: Int, onHeld: () -> Unit): Button {
        val b = button(label, filled = true) {}
        b.background = pill(fill, true)
        var downAt = 0L
        val step = object : Runnable {
            override fun run() {
                val left = HOLD_MS - (System.currentTimeMillis() - downAt)
                if (left <= 0) {
                    b.text = label
                    b.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                    downAt = 0
                    onHeld()
                    return
                }
                b.text = getString(R.string.w_hold, (left + 999) / 1000)
                main.postDelayed(this, 100)
            }
        }
        b.setOnTouchListener { _: View, e: MotionEvent ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downAt = System.currentTimeMillis(); main.post(step) }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { main.removeCallbacks(step); downAt = 0; b.text = label }
            }
            true
        }
        return b
    }

    companion object {
        const val HOLD_MS = 2_000L
        val ORANGE = Color.parseColor("#E8590C")
        val RED = Color.parseColor("#C92A2A")
        val GREEN = Color.parseColor("#51CF66")
        val GREY = Color.parseColor("#ADB5BD")
    }
}
