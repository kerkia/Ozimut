package com.ozimut.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import java.util.Locale

/**
 * Ozitrac on the watch (docs/track/ozitrac.md « The apps »): Start; during a run the time, the distance, the GPS, whether
 * positions get through, and two buttons held two seconds — Help and Stop — so that a sleeve never presses them. Between
 * runs, the people who follow the watch (their codes shown as QR codes for their phones, each removable) and its link to
 * an Ozimut account (the claim code typed on the site).
 */
class WatchActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var box: LinearLayout
    private var shown = ""
    /** The page shown between runs: home, code (Ozimut's claim code), qr (a code to follow), watchers, name. */
    private var page = "home"
    private var note = ""
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
            if (!visible || page != "code" || Device.paired(this@WatchActivity)) return
            Thread {
                val r = Claim.ask(this@WatchActivity)
                main.post {
                    note = when (r) {
                        Claim.Result.Offline -> getString(R.string.w_offline)
                        Claim.Result.TooMany -> getString(R.string.w_too_many)
                        else -> ""
                    }
                    if (r is Claim.Result.Paired) page = "home"
                    redraw()
                    if (r !is Claim.Result.Paired) main.postDelayed(this, 10_000)
                }
            }.start()
        }
    }

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) startRun()
        else { note = getString(R.string.w_need_location); redraw() }
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
        // a watch keeps its last runs only (small storage)
        Thread { RunLog.prune(applicationContext, KEEP_RUNS) }.start()
    }

    override fun onResume() {
        super.onResume()
        visible = true
        Tracker.listen(refresh)
        Tracker.ensureService(this)
        redraw()
        main.post(tick)
        if (page == "code") main.post(claimLoop)
        refreshWatchers()
    }

    override fun onPause() {
        visible = false
        Tracker.unlisten(refresh)
        main.removeCallbacks(tick)
        main.removeCallbacks(claimLoop)
        super.onPause()
    }

    private fun redraw() {
        shown = ""
        draw()
    }

    private fun go(p: String) {
        page = p
        note = ""
        redraw()
        if (p == "code") { main.removeCallbacks(claimLoop); main.post(claimLoop) }
    }

    /** The watchers named again from the relay (a network thread), then the page drawn again. */
    private fun refreshWatchers() {
        if (!Channel.exists(this)) return
        val app = applicationContext
        Thread {
            RelayConfig.refresh(app)
            Channel.refresh(app)
            main.post { if (visible && (page == "home" || page == "watchers")) redraw() }
        }.start()
    }

    private fun startRun() {
        Tracker.start(this, "watchers")
        redraw()
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
        val s = RunState.get(this)
        // the screen is built again only when its kind changes; the figures are set each second
        val kind = when (Tracker.stateName(this)) {
            "running" -> "run"
            "ending" -> "ending"
            else -> page
        }
        window.apply {
            if (kind == "run" || kind == "qr") addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        if (kind != shown) {
            shown = kind
            box.removeAllViews()
            when (kind) {
                "run" -> buildRun()
                "ending" -> buildEnding()
                "code" -> buildCode()
                "qr" -> buildQr()
                "watchers" -> buildWatchers()
                "name" -> buildName()
                else -> buildHome(s)
            }
        }
        if (kind == "run") fillRun(s)
    }

    private fun followers(): List<String> {
        val names = Channel.keyed(this).mapNotNull { it.name?.takeIf { n -> n.isNotBlank() } }
        val oz = if (Device.paired(this)) Device.watchers(this) else emptyList()
        return (names + oz).distinct()
    }

    private fun buildHome(s: RunState.S) {
        text(getString(R.string.app_name), 15f, bold = true, color = ORANGE)
        val me = Me.name(this).ifBlank { Device.name(this) }
        if (me.isNotBlank()) text(me, 13f)
        val w = followers()
        text(if (w.isEmpty()) getString(R.string.w_nobody) else getString(R.string.w_watchers, w.joinToString(", ")), 11f, color = GREY)
        if (s.state == RunState.ENDED && System.currentTimeMillis() - s.endedAt < 30 * 60_000L) {
            val done = when {
                s.error == "closed" -> R.string.w_closed
                s.lastSent > 0 -> R.string.w_sent
                else -> R.string.w_kept
            }
            text(getString(done), 12f, color = GREEN)
        }
        if (note.isNotEmpty()) text(note, 12f, color = ORANGE)
        button(getString(R.string.w_start), filled = true) { note = ""; askStart() }
        button(getString(R.string.w_add), filled = false) { go(if (Me.name(this).isBlank()) "name" else "qr") }
        if (Channel.keyed(this).isNotEmpty()) button(getString(R.string.w_who), filled = false) { go("watchers") }
        if (Device.paired(this)) {
            text(getString(R.string.w_oz_linked, Device.name(this)), 11f, color = GREY)
            holdButton(getString(R.string.w_oz_unlink), GREY_DARK) {
                if (!RunState.get(this).active) Device.forget(this)
                redraw()
            }
        } else {
            button(getString(R.string.w_oz_link), filled = false) { go("code") }
        }
    }

    private fun buildCode() {
        text(getString(R.string.w_code_title), 15f, bold = true)
        text(ClaimCodes.shown(Claim.code(this)), 30f, bold = true, color = ORANGE, mono = true)
        text(getString(R.string.w_code_text), 12f, color = GREY)
        if (note.isNotEmpty()) text(note, 12f, color = ORANGE)
        button(getString(R.string.w_new_code), filled = false) { Claim.renew(this); redraw() }
        button(getString(R.string.w_back), filled = false) { go("home") }
    }

    private fun buildName() {
        text(getString(R.string.w_name_title), 14f, bold = true)
        text(getString(R.string.w_name_text), 11f, color = GREY)
        val field = EditText(this).apply {
            setText(Me.name(this@WatchActivity).ifBlank { Device.name(this@WatchActivity) })
            setTextColor(Color.WHITE)
            setHintTextColor(GREY)
            hint = getString(R.string.w_name_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            imeOptions = EditorInfo.IME_ACTION_DONE
            setSingleLine()
            gravity = Gravity.CENTER
        }
        box.addView(field, lp())
        val save = {
            val n = field.text.toString().trim()
            if (n.isNotBlank()) { Me.setName(this, n); go("qr") }
        }
        field.setOnEditorActionListener { _, _, _ -> save(); true }
        button(getString(R.string.w_ok), filled = true) { save() }
        button(getString(R.string.w_back), filled = false) { go("home") }
    }

    /** A new code for one person, as a QR code their phone's Ozitrac scans. */
    private fun buildQr() {
        text(getString(R.string.w_qr_title), 13f, bold = true)
        val wait = text(getString(R.string.w_qr_making), 11f, color = GREY)
        val app = applicationContext
        Thread {
            val link = Channel.invite(app)
            main.post {
                if (shown != "qr") return@post
                if (link == null) {
                    wait.text = getString(R.string.w_offline)
                    wait.setTextColor(ORANGE)
                    return@post
                }
                val size = box.width - box.paddingLeft - box.paddingRight
                val bmp = qr(link, size.coerceAtLeast(dp(120)))
                if (bmp == null) {
                    wait.text = getString(R.string.w_offline)
                    return@post
                }
                wait.text = getString(R.string.w_qr_once)
                val img = ImageView(this).apply { setImageBitmap(bmp); adjustViewBounds = true }
                box.addView(img, 1, LinearLayout.LayoutParams(bmp.width, bmp.height).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(4) })
            }
        }.start()
        button(getString(R.string.w_done), filled = false) { go("home"); refreshWatchers() }
    }

    private fun buildWatchers() {
        text(getString(R.string.w_who), 14f, bold = true)
        val list = Channel.keyed(this)
        if (list.isEmpty()) text(getString(R.string.w_nobody), 11f, color = GREY)
        for (w in list) {
            text(w.name?.takeIf { it.isNotBlank() } ?: getString(R.string.w_someone), 13f)
            holdButton(getString(R.string.w_remove), GREY_DARK) {
                val app = applicationContext
                Thread {
                    val ok = Channel.remove(app, w.w)
                    main.post {
                        note = if (ok) "" else getString(R.string.w_offline)
                        redraw()
                    }
                }.start()
            }
        }
        if (note.isNotEmpty()) text(note, 11f, color = ORANGE)
        button(getString(R.string.w_back), filled = false) { go("home") }
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
            s.dests.isEmpty() -> getString(R.string.w_local)
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

    /** A QR code drawn black on white, a module of quiet zone around it. */
    private fun qr(text: String, size: Int): Bitmap? = try {
        val m = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
        val w = m.width
        val h = m.height
        val px = IntArray(w * h) { i -> if (m.get(i % w, i / w)) Color.BLACK else Color.WHITE }
        Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    } catch (e: Exception) {
        null
    }

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
        const val KEEP_RUNS = 5
        val ORANGE = Color.parseColor("#E8590C")
        val RED = Color.parseColor("#C92A2A")
        val GREEN = Color.parseColor("#51CF66")
        val GREY = Color.parseColor("#ADB5BD")
        val GREY_DARK = Color.parseColor("#495057")
    }
}
