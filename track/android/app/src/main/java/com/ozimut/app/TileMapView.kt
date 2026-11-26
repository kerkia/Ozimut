package com.ozimut.app

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.util.LruCache
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.tan

/**
 * A small map of raster tiles (Web Mercator, 256 px; docs/track/folloz.md « The map »): each tile from the layer of the
 * country it lies in (MapLayers: Plan IGN in France, swisstopo in Switzerland, OpenStreetMap elsewhere, or the layer the
 * person chose there) fetched by the phone itself, a memory cache and a disk cache per layer, two loaders, pan, pinch and
 * double tap; a trail, a position with its accuracy, a zone's circle, the credits of the layers drawn bottom right,
 * « Fond de carte » top left, and « follow » (the position kept in the middle until the map is moved by hand). No map library.
 */
@SuppressLint("ViewConstructor")
class TileMapView(c: Context) : View(c) {
    var maxZoom = 19
    private var layers = MapLayers.get(c)

    /** The map's centre in world units (0..1 both ways) and its zoom (fractional). */
    private var cx = 0.5
    private var cy = 0.5
    var zoom = 3.0
        private set

    var follow = true
        set(v) { field = v; onFollow?.invoke(v); if (v) recentre() }
    var onFollow: ((Boolean) -> Unit)? = null

    /** The trail (fixes), the position, its accuracy in metres; a zone. */
    var trail: List<Fix> = emptyList()
        set(v) { field = v; invalidate() }
    var position: Fix? = null
        set(v) { field = v; if (follow) recentre(); invalidate() }
    var zoneCentre: Pair<Int, Int>? = null
    var zoneRadius = 0
    var crosshair = false

    private val density = resources.displayMetrics.density
    private val tilePaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 4 * density; color = 0xFFC92A2A.toInt()
        strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND
    }
    private val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE8590C.toInt() }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2 * density; color = 0xFFFFFFFF.toInt() }
    private val accPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33E8590C }
    private val zonePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 3 * density; color = 0xCC1F2933.toInt()
    }
    private val zoneFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x141F2933 }
    private val creditPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 11 * density; color = 0xFF333333.toInt() }
    private val creditBack = Paint().apply { color = 0xCCFFFFFF.toInt() }
    private val emptyPaint = Paint().apply { color = 0xFFEDEAE4.toInt() }

    // ---- projection

    private fun worldX(lon: Double) = (lon + 180.0) / 360.0
    private fun worldY(lat: Double): Double {
        val r = Math.toRadians(lat.coerceIn(-85.0, 85.0))
        return (1.0 - ln(tan(r) + 1.0 / cos(r)) / PI) / 2.0
    }
    private fun lonOf(x: Double) = x * 360.0 - 180.0
    private fun latOf(y: Double) = Math.toDegrees(atan(kotlin.math.sinh(PI * (1 - 2 * y))))
    private fun worldPx() = 256.0 * 2.0.pow(zoom) * density
    private fun sx(wx: Double) = ((wx - cx) * worldPx() + width / 2.0).toFloat()
    private fun sy(wy: Double) = ((wy - cy) * worldPx() + height / 2.0).toFloat()

    fun setView(lat: Double, lon: Double, z: Double = zoom) {
        cx = worldX(lon)
        cy = worldY(lat)
        zoom = z.coerceIn(2.0, maxZoom.toDouble())
        invalidate()
    }

    fun centre(): Pair<Double, Double> = latOf(cy) to lonOf(cx)

    /** Shows every point of [fixes] (the trail), else the position. */
    fun fit(fixes: List<Fix>) {
        if (fixes.isEmpty() || width == 0 || height == 0) return
        var x0 = 1.0; var x1 = 0.0; var y0 = 1.0; var y1 = 0.0
        for (f in fixes) {
            val x = worldX(f.lo / 1e6); val y = worldY(f.la / 1e6)
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        }
        cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
        val span = maxOf(x1 - x0, (y1 - y0) * width / height.coerceAtLeast(1), 1e-7)
        val z = ln(width * 0.8 / (256.0 * density * span)) / ln(2.0)
        zoom = z.coerceIn(2.0, 17.0)
        invalidate()
    }

    private fun recentre() {
        val p = position ?: return
        cx = worldX(p.lo / 1e6)
        cy = worldY(p.la / 1e6)
        invalidate()
    }

    fun zoomBy(d: Double) {
        zoom = (zoom + d).coerceIn(2.0, maxZoom.toDouble())
        invalidate()
    }

    // ---- gestures

    private val scaler = ScaleGestureDetector(c, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScale(d: ScaleGestureDetector): Boolean {
            val fx = d.focusX.toDouble(); val fy = d.focusY.toDouble()
            val before = worldPx()
            val wx = cx + (fx - width / 2.0) / before
            val wy = cy + (fy - height / 2.0) / before
            zoom = (zoom + ln(d.scaleFactor.toDouble()) / ln(2.0)).coerceIn(2.0, maxZoom.toDouble())
            val after = worldPx()
            if (!follow) {
                cx = wx - (fx - width / 2.0) / after
                cy = wy - (fy - height / 2.0) / after
            }
            invalidate()
            return true
        }
    })

    private val gestures = GestureDetector(c, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent) = true
        override fun onSingleTapUp(e: MotionEvent): Boolean {
            if (layersButton.contains(e.x, e.y)) { openLayers(); return true }
            return false
        }
        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
            if (scaler.isInProgress) return false
            if (follow) follow = false
            cx += dx / worldPx()
            cy += dy / worldPx()
            cy = cy.coerceIn(0.0, 1.0)
            invalidate()
            return true
        }
        override fun onDoubleTap(e: MotionEvent): Boolean {
            if (layersButton.contains(e.x, e.y)) return true
            val wx = cx + (e.x - width / 2.0) / worldPx()
            val wy = cy + (e.y - height / 2.0) / worldPx()
            zoom = (zoom + 1).coerceIn(2.0, maxZoom.toDouble())
            if (!follow) { cx = (cx + wx) / 2; cy = (cy + wy) / 2 }
            invalidate()
            return true
        }
    })

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        parent?.requestDisallowInterceptTouchEvent(true)
        scaler.onTouchEvent(e)
        gestures.onTouchEvent(e)
        return true
    }

    // ---- tiles

    private val mem = object : LruCache<String, Bitmap>(64) {}
    private val pending = ConcurrentHashMap.newKeySet<String>()
    private val failedAt = ConcurrentHashMap<String, Long>()
    private val loaders = Executors.newFixedThreadPool(2)
    private val diskDir = File(c.cacheDir, "tiles")
    private val layerOf = object : LruCache<String, MapLayers.Layer>(2048) {}

    /** The relay's layers or the person's choice changed: every tile is chosen again. */
    fun reloadLayers() {
        layers = MapLayers.get(context)
        layerOf.evictAll()
        invalidate()
    }

    /** The layer of tile [z]/[x]/[y]: an area's when its four corners lie inside that area, else elsewhere's. */
    private fun layerFor(z: Int, x: Int, y: Int): MapLayers.Layer {
        val key = "$z/$x/$y"
        layerOf.get(key)?.let { return it }
        val n = (1 shl z).toDouble()
        val lon0 = lonOf(x / n); val lon1 = lonOf((x + 1) / n)
        val lat0 = latOf(y / n); val lat1 = latOf((y + 1) / n)
        val area = if (z < 5) null else layers.areas.firstOrNull {
            it.contains(lon0, lat0) && it.contains(lon1, lat0) && it.contains(lon0, lat1) && it.contains(lon1, lat1)
        }
        val l = layers.chosen(context, area ?: layers.elsewhere)
        layerOf.put(key, l)
        return l
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        loaders.shutdownNow()
    }

    private fun tile(l: MapLayers.Layer, z: Int, x: Int, y: Int): Bitmap? {
        val key = "${l.id}/$z/$x/$y"
        mem.get(key)?.let { return it }
        if (pending.contains(key)) return null
        if ((failedAt[key] ?: 0L) > System.currentTimeMillis() - 30_000) return null
        pending.add(key)
        try {
            loaders.execute {
                val bmp = load(l, z, x, y)
                if (bmp != null) mem.put(key, bmp) else failedAt[key] = System.currentTimeMillis()
                pending.remove(key)
                postInvalidate()
            }
        } catch (e: Exception) {
            pending.remove(key)
        }
        return null
    }

    private fun load(l: MapLayers.Layer, z: Int, x: Int, y: Int): Bitmap? {
        val f = File(diskDir, "${l.id}/$z/$x/$y")
        if (f.exists() && System.currentTimeMillis() - f.lastModified() < 30L * 86_400_000L) {
            BitmapFactory.decodeFile(f.path)?.let { return it }
        }
        return try {
            val url = l.tiles.replace("{z}", z.toString()).replace("{x}", x.toString()).replace("{y}", y.toString())
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("User-Agent", "Folloz/${BuildConfig.VERSION_NAME} (+https://ozimut.com)")
            try {
                if (conn.responseCode != 200) return null
                val bytes = conn.inputStream.use { it.readBytes() }
                try { f.parentFile?.mkdirs(); f.writeBytes(bytes) } catch (e: Exception) { /* no disk cache */ }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            null
        }
    }

    // ---- drawing

    private val src = Rect()
    private val dst = RectF()

    override fun onDraw(canvas: Canvas) {
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), emptyPaint)
        drawn.clear()
        val tz = floor(zoom + 1e-6).toInt().coerceIn(0, maxZoom)
        val n = 1 shl tz
        val tilePx = 256.0 * density * 2.0.pow(zoom - tz)
        val left = cx * n - width / 2.0 / tilePx
        val top = cy * n - height / 2.0 / tilePx
        val x0 = floor(left).toInt(); val y0 = floor(top).toInt()
        val x1 = floor(left + width / tilePx).toInt(); val y1 = floor(top + height / tilePx).toInt()
        for (ty in y0..y1) {
            if (ty < 0 || ty >= n) continue
            for (tx in x0..x1) {
                val wx = ((tx % n) + n) % n
                val px = ((tx - left) * tilePx).toFloat(); val py = ((ty - top) * tilePx).toFloat()
                dst.set(px, py, (px + tilePx).toFloat(), (py + tilePx).toFloat())
                val l = layerFor(tz, wx, ty)
                drawn += l
                // past the layer's last zoom, its ancestor's part enlarged; while a tile loads, its parent's quarter
                if (!drawPart(canvas, l, tz, wx, ty, (tz - l.maxZoom).coerceAtLeast(0)) && tz > 0 && tz <= l.maxZoom) {
                    drawPart(canvas, l, tz, wx, ty, 1, load = false)
                }
            }
        }
        drawZone(canvas)
        drawTrail(canvas)
        drawPosition(canvas)
        if (crosshair) {
            val m = width / 2f; val h = height / 2f; val r = 14 * density
            canvas.drawLine(m - r, h, m + r, h, zonePaint)
            canvas.drawLine(m, h - r, m, h + r, zonePaint)
        }
        drawCredit(canvas)
    }

    private val drawn = LinkedHashSet<MapLayers.Layer>()

    /** Draws tile [z]/[x]/[y] from its ancestor [up] levels higher (0: itself); false when that one is not there yet. */
    private fun drawPart(canvas: Canvas, l: MapLayers.Layer, z: Int, x: Int, y: Int, up: Int, load: Boolean = true): Boolean {
        val az = z - up
        val ax = x shr up; val ay = y shr up
        val b = if (load) tile(l, az, ax, ay) else mem.get("${l.id}/$az/$ax/$ay")
        if (b == null) return false
        if (up == 0) {
            canvas.drawBitmap(b, null, dst, tilePaint)
        } else {
            val part = (b.width shr up).coerceAtLeast(1)
            val sx0 = (x - (ax shl up)) * part; val sy0 = (y - (ay shl up)) * part
            src.set(sx0, sy0, sx0 + part, sy0 + part)
            canvas.drawBitmap(b, src, dst, tilePaint)
        }
        return true
    }

    private fun metresPerPx(lat: Double) = 156_543.03392 * cos(Math.toRadians(lat)) / 2.0.pow(zoom) / density

    private fun drawZone(canvas: Canvas) {
        val zc = zoneCentre ?: return
        if (zoneRadius <= 0) return
        val lat = zc.first / 1e6
        val x = sx(worldX(zc.second / 1e6)); val y = sy(worldY(lat))
        val r = (zoneRadius / metresPerPx(lat)).toFloat()
        canvas.drawCircle(x, y, r, zoneFill)
        canvas.drawCircle(x, y, r, zonePaint)
    }

    private fun drawTrail(canvas: Canvas) {
        val t = trail
        if (t.size < 2) return
        val path = Path()
        var started = false
        for (f in t) {
            if (f.ac > 50) continue
            val x = sx(worldX(f.lo / 1e6)); val y = sy(worldY(f.la / 1e6))
            if (!started) { path.moveTo(x, y); started = true } else path.lineTo(x, y)
        }
        canvas.drawPath(path, linePaint)
    }

    private fun drawPosition(canvas: Canvas) {
        val p = position ?: return
        val lat = p.la / 1e6
        val x = sx(worldX(p.lo / 1e6)); val y = sy(worldY(lat))
        val acc = (p.ac / metresPerPx(lat)).toFloat()
        if (acc > 8 * density) canvas.drawCircle(x, y, acc, accPaint)
        canvas.drawCircle(x, y, 8 * density, dotPaint)
        canvas.drawCircle(x, y, 8 * density, ringPaint)
    }

    private fun drawCredit(canvas: Canvas) {
        val credit = drawn.map { it.credit }.filter { it.isNotBlank() }.distinct().joinToString(" · ")
        if (credit.isNotEmpty()) {
            val w = creditPaint.measureText(credit)
            val pad = 4 * density
            val h = creditPaint.textSize + 2 * pad
            canvas.drawRect(width - w - 2 * pad, height - h, width.toFloat(), height.toFloat(), creditBack)
            canvas.drawText(credit, width - w - pad, height - pad - creditPaint.descent(), creditPaint)
        }
        drawLayersButton(canvas)
    }

    // ---- « Fond de carte »

    private val layersButton = RectF()
    private val buttonPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xEEFFFFFF.toInt() }
    private val buttonLine = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 1.5f * density; color = 0xFF1F2933.toInt(); strokeJoin = Paint.Join.ROUND
    }

    /** Two stacked sheets, top left (the zoom and « follow » sit top right). */
    private fun drawLayersButton(canvas: Canvas) {
        val m = 8 * density; val side = 44 * density
        layersButton.set(m, m, m + side, m + side)
        canvas.drawRoundRect(layersButton, 8 * density, 8 * density, buttonPaint)
        canvas.drawRoundRect(layersButton, 8 * density, 8 * density, buttonLine)
        val mx = layersButton.centerX(); val my = layersButton.centerY(); val r = 11 * density
        for (dy in floatArrayOf(4 * density, -4 * density)) {
            val p = Path()
            p.moveTo(mx, my + dy - r / 2); p.lineTo(mx + r, my + dy); p.lineTo(mx, my + dy + r / 2); p.lineTo(mx - r, my + dy); p.close()
            canvas.drawPath(p, buttonPaint)
            canvas.drawPath(p, buttonLine)
        }
    }

    /** The layers offered, the area the map's centre lies in first; a choice applies at once, to every map. */
    private fun openLayers() {
        val c = context
        val (lat, lon) = centre()
        val here = layers.areaAt(lon, lat)
        val areas = (listOf(here) + layers.areas + layers.elsewhere).distinctBy { it.id }
        val box = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        val pad = (20 * density).toInt()
        box.setPadding(pad, pad / 2, pad, 0)
        for (a in areas) {
            val offered = a.layers.mapNotNull { layers.layers[it] }
            if (offered.isEmpty()) continue
            box.addView(Ui.text(c, a.name(), 17f, bold = true).apply { setPadding(0, pad / 2, 0, 0) })
            val group = RadioGroup(c)
            val current = layers.chosen(c, a).id
            for (l in offered) {
                val b = RadioButton(c).apply { text = l.name(); textSize = 16f; id = View.generateViewId() }
                group.addView(b)
                if (l.id == current) b.isChecked = true
                b.setOnCheckedChangeListener { _, on ->
                    if (on) { MapLayers.choose(c, a.id, l.id); reloadLayers() }
                }
            }
            box.addView(group)
        }
        AlertDialog.Builder(c)
            .setTitle(R.string.map_layers)
            .setView(ScrollView(c).apply { addView(box) })
            .setPositiveButton(R.string.ok, null)
            .show()
    }

    companion object {
        /** Keeps the tile cache from growing for ever: the files older than 30 days go. */
        fun pruneCache(c: Context) {
            val d = File(c.cacheDir, "tiles")
            val old = System.currentTimeMillis() - 30L * 86_400_000L
            d.walkBottomUp().forEach { f -> if (f.isFile && f.lastModified() < old) f.delete() }
        }
    }
}
