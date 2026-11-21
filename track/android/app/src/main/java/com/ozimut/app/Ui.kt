package com.ozimut.app

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** The native screens are built in code: few, plain views. */
object Ui {
    val ORANGE = 0xFFE8590C.toInt()
    val INK = 0xFF1F2933.toInt()
    val GREY = 0xFF6B7280.toInt()
    val RED = 0xFFC92A2A.toInt()
    val GREEN = 0xFF2B8A3E.toInt()
    val PALE = 0xFFF3F4F6.toInt()

    fun dp(c: Context, v: Int) = (v * c.resources.displayMetrics.density).toInt()

    /** A scrolling page under the system bars (edge to edge since Android 15). */
    fun page(act: ComponentActivity, content: View): ScrollView {
        val sv = ScrollView(act).apply {
            isFillViewport = true
            setBackgroundColor(0xFFFFFFFF.toInt())
            addView(content)
        }
        padForBars(sv)
        act.setContentView(sv)
        return sv
    }

    fun padForBars(v: View) {
        ViewCompat.setOnApplyWindowInsetsListener(v) { view, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    fun column(c: Context, pad: Int = 20): LinearLayout = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(c, pad)
        setPadding(p, p, p, p)
    }

    fun text(c: Context, s: CharSequence = "", size: Float = 16f, bold: Boolean = false, color: Int = INK): TextView =
        TextView(c).apply {
            text = s
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(c, 4), 0, dp(c, 4))
        }

    fun round(color: Int, radius: Float, stroke: Int = 0, strokeColor: Int = 0) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = radius
        if (stroke > 0) setStroke(stroke, strokeColor)
    }

    fun button(c: Context, label: String, style: Int = 0, big: Boolean = false, onClick: () -> Unit): Button =
        Button(c).apply {
            text = label
            isAllCaps = false
            textSize = if (big) 22f else 16f
            val r = dp(c, 12).toFloat()
            when (style) {
                1 -> { background = round(ORANGE, r); setTextColor(0xFFFFFFFF.toInt()) }
                2 -> { background = round(RED, r); setTextColor(0xFFFFFFFF.toInt()) }
                else -> { background = round(0xFFFFFFFF.toInt(), r, dp(c, 2), INK); setTextColor(INK) }
            }
            minHeight = dp(c, if (big) 72 else 52)
            setOnClickListener { onClick() }
        }

    fun gap(c: Context, h: Int = 12): View = View(c).apply {
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, h))
    }

    fun full(v: View): View {
        v.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { topMargin = dp(v.context, 6); bottomMargin = dp(v.context, 6) }
        return v
    }

    fun clock(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        return String.format(java.util.Locale.ROOT, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60)
    }

    fun km(m: Double): String = String.format(java.util.Locale.getDefault(), "%.2f", m / 1000.0)
}

/** A button that acts only once held for [holdMs] (Stop: two seconds), filling as it is held. */
@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
class HoldButton(c: Context, label: String, private val holdMs: Long, private val onDone: () -> Unit) : TextView(c) {
    private var downAt = 0L
    private var progress = 0f
    private val paint = Paint().apply { color = 0x66FFFFFF }
    private val tick = object : Runnable {
        override fun run() {
            if (downAt == 0L) return
            progress = ((SystemClock.uptimeMillis() - downAt).toFloat() / holdMs).coerceAtMost(1f)
            invalidate()
            if (progress >= 1f) {
                downAt = 0
                progress = 0f
                performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                onDone()
            } else {
                postDelayed(this, 16)
            }
        }
    }

    init {
        text = label
        textSize = 22f
        gravity = Gravity.CENTER
        setTextColor(0xFFFFFFFF.toInt())
        background = Ui.round(Ui.RED, Ui.dp(c, 12).toFloat())
        minHeight = Ui.dp(c, 80)
        isClickable = true
        isFocusable = true
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downAt = SystemClock.uptimeMillis()
                removeCallbacks(tick)
                post(tick)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                downAt = 0
                progress = 0f
                removeCallbacks(tick)
                invalidate()
            }
        }
        return true
    }

    override fun onDraw(canvas: Canvas) {
        if (progress > 0f) canvas.drawRect(0f, 0f, width * progress, height.toFloat(), paint)
        super.onDraw(canvas)
    }
}
