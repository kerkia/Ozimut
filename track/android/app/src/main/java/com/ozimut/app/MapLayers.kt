package com.ozimut.app

import android.content.Context
import org.json.JSONObject
import java.util.Locale

/**
 * The map's layers by country (docs/track/ozitrac.md « The map »): what `GET /api/ozitrac/config` says — each layer's tile
 * address, credit and last zoom, each area's outline and layers (the first the default), the layers elsewhere — and the
 * layer the person chose for each area. A tile is drawn from an area's layer when its four corners lie inside the area,
 * else from the layer chosen for « elsewhere ».
 */
object MapLayers {
    const val ELSEWHERE = "*"

    class Layer(val id: String, val tiles: String, val credit: String, val maxZoom: Int, val names: JSONObject?) {
        fun name(): String = MapLayers.name(names, id)
    }

    /** An area: [polys] each [lon0, lat0, lon1, lat1…], [box] lon0, lat0, lon1, lat1 of them all. */
    class Area(val id: String, val names: JSONObject?, val layers: List<String>, val polys: List<DoubleArray>, val box: DoubleArray) {
        fun name(): String = MapLayers.name(names, id)

        fun contains(lon: Double, lat: Double): Boolean {
            if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) return false
            for (p in polys) if (inside(p, lon, lat)) return true
            return false
        }
    }

    class LayerSet(val layers: Map<String, Layer>, val areas: List<Area>, val elsewhere: Area) {
        /** The layer drawn for this area (the person's choice when the area offers it, else its first). */
        fun chosen(c: Context, a: Area): Layer {
            val pick = choice(c, a.id)
            val id = if (pick != null && pick in a.layers && pick in layers) pick else a.layers.firstOrNull { it in layers }
            return layers[id] ?: layers.values.first()
        }

        /** The area a point lies in, else « elsewhere ». */
        fun areaAt(lon: Double, lat: Double): Area = areas.firstOrNull { it.contains(lon, lat) } ?: elsewhere
    }

    private var cached: LayerSet? = null
    private var cachedFrom: String? = null

    private fun prefs(c: Context) = c.getSharedPreferences("maplayers", Context.MODE_PRIVATE)

    fun choice(c: Context, area: String): String? = prefs(c).getString("choice.$area", null)

    fun choose(c: Context, area: String, layer: String) {
        prefs(c).edit().putString("choice.$area", layer).apply()
    }

    /** The set the relay last gave (RelayConfig keeps its answer), else OpenStreetMap everywhere. */
    @Synchronized fun get(c: Context): LayerSet {
        val raw = RelayConfig.mapsJson(c)
        cached?.let { if (raw == cachedFrom) return it }
        val set = parse(raw) ?: fallback(c)
        cached = set
        cachedFrom = raw
        return set
    }

    private fun fallback(c: Context): LayerSet {
        val cfg = RelayConfig.get(c)
        val osm = Layer("osm", cfg.tiles, cfg.credit, cfg.maxZoom, null)
        return LayerSet(mapOf("osm" to osm), emptyList(), Area(ELSEWHERE, null, listOf("osm"), emptyList(), doubleArrayOf(-180.0, -90.0, 180.0, 90.0)))
    }

    fun parse(raw: String?): LayerSet? {
        if (raw.isNullOrBlank()) return null
        return try {
            val j = JSONObject(raw)
            val la = j.optJSONArray("layers") ?: return null
            val layers = LinkedHashMap<String, Layer>()
            for (i in 0 until la.length()) {
                val o = la.optJSONObject(i) ?: continue
                val id = o.optString("id")
                val tiles = o.optString("tiles")
                if (id.isEmpty() || !tiles.startsWith("https://") || !tiles.contains("{z}")) continue
                layers[id] = Layer(id, tiles, o.optString("credit"), o.optInt("maxZoom", 19).coerceIn(5, 22), o.optJSONObject("name"))
            }
            if (layers.isEmpty()) return null
            val areas = ArrayList<Area>()
            val aa = j.optJSONArray("areas")
            if (aa != null) for (i in 0 until aa.length()) {
                val o = aa.optJSONObject(i) ?: continue
                val ids = o.optJSONArray("layers") ?: continue
                val polys = ArrayList<DoubleArray>()
                val box = doubleArrayOf(180.0, 90.0, -180.0, -90.0)
                val pa = o.optJSONArray("poly") ?: continue
                for (k in 0 until pa.length()) {
                    val ring = pa.optJSONArray(k) ?: continue
                    val pts = DoubleArray(ring.length() * 2)
                    for (m in 0 until ring.length()) {
                        val p = ring.getJSONArray(m)
                        val lon = p.getDouble(0); val lat = p.getDouble(1)
                        pts[2 * m] = lon; pts[2 * m + 1] = lat
                        if (lon < box[0]) box[0] = lon; if (lat < box[1]) box[1] = lat
                        if (lon > box[2]) box[2] = lon; if (lat > box[3]) box[3] = lat
                    }
                    if (pts.size >= 6) polys += pts
                }
                if (polys.isEmpty()) continue
                areas += Area(o.optString("id"), o.optJSONObject("name"), List(ids.length()) { ids.optString(it) }, polys, box)
            }
            val e = j.optJSONObject("elsewhere")
            val eIds = e?.optJSONArray("layers")?.let { a -> List(a.length()) { a.optString(it) } }?.filter { it in layers }
            val elsewhere = Area(ELSEWHERE, e?.optJSONObject("name"), if (eIds.isNullOrEmpty()) listOf(layers.keys.first()) else eIds,
                emptyList(), doubleArrayOf(-180.0, -90.0, 180.0, 90.0))
            LayerSet(layers, areas, elsewhere)
        } catch (ex: Exception) {
            null
        }
    }

    /** Ray casting on one ring. */
    fun inside(p: DoubleArray, lon: Double, lat: Double): Boolean {
        var hit = false
        val n = p.size / 2
        var j = n - 1
        for (i in 0 until n) {
            val xi = p[2 * i]; val yi = p[2 * i + 1]
            val xj = p[2 * j]; val yj = p[2 * j + 1]
            if ((yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) hit = !hit
            j = i
        }
        return hit
    }

    /** A name in the phone's language among the four the relay gives, else English. */
    fun name(names: JSONObject?, fallback: String): String {
        if (names == null) return fallback
        val lang = Locale.getDefault().language
        return names.optString(lang).ifBlank { names.optString("en") }.ifBlank { fallback }
    }
}
