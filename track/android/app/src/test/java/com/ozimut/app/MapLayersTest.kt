package com.ozimut.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The map's layers as `GET /api/folloz/config` gives them (docs/track/folloz.md « The map »). */
class MapLayersTest {
    private val config = """
        {"tiles":"https://tile.openstreetmap.org/{z}/{x}/{y}.png","attribution":"© OpenStreetMap contributors","maxZoom":19,
         "layers":[
           {"id":"osm","tiles":"https://tile.openstreetmap.org/{z}/{x}/{y}.png","credit":"© OpenStreetMap contributors","maxZoom":19,
            "name":{"fr":"OpenStreetMap","en":"OpenStreetMap"}},
           {"id":"ign-plan","tiles":"https://data.geopf.fr/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}","credit":"© IGN","maxZoom":19,
            "name":{"fr":"Plan IGN","en":"IGN map (Plan IGN)"}},
           {"id":"bad","tiles":"http://example.com/{z}/{x}/{y}.png","credit":"","maxZoom":19}
         ],
         "areas":[{"id":"FR","name":{"fr":"France","en":"France"},"layers":["ign-plan","osm"],
                   "poly":[[[0,40],[10,40],[10,50],[0,50],[0,40]],[[20,40],[22,40],[21,42],[20,40]]]}],
         "elsewhere":{"name":{"fr":"Ailleurs","en":"Elsewhere"},"layers":["osm"]},
         "watched":15,"idle":120}
    """.trimIndent()

    @Test
    fun readsLayersAreasAndElsewhere() {
        val set = MapLayers.parse(config)
        assertNotNull(set)
        set!!
        assertEquals(listOf("osm", "ign-plan"), set.layers.keys.toList())   // a plain http address is refused
        assertEquals(1, set.areas.size)
        val fr = set.areas[0]
        assertEquals(listOf("ign-plan", "osm"), fr.layers)
        assertEquals(2, fr.polys.size)
        assertEquals(0.0, fr.box[0], 0.0); assertEquals(40.0, fr.box[1], 0.0)
        assertEquals(22.0, fr.box[2], 0.0); assertEquals(50.0, fr.box[3], 0.0)
        assertEquals(listOf("osm"), set.elsewhere.layers)
        assertEquals(MapLayers.ELSEWHERE, set.elsewhere.id)
    }

    @Test
    fun placesPointsInTheirArea() {
        val set = MapLayers.parse(config)!!
        assertEquals("FR", set.areaAt(5.0, 45.0).id)
        assertEquals("FR", set.areaAt(21.0, 40.5).id)           // the second ring
        assertEquals(MapLayers.ELSEWHERE, set.areaAt(15.0, 45.0).id)
        assertEquals(MapLayers.ELSEWHERE, set.areaAt(21.9, 41.9).id) // in the box, outside the triangle
        assertTrue(set.areas[0].contains(0.5, 49.5))
        assertFalse(set.areas[0].contains(-0.5, 45.0))
    }

    @Test
    fun withoutLayersThereIsNothingToRead() {
        assertNull(MapLayers.parse(null))
        assertNull(MapLayers.parse(""))
        assertNull(MapLayers.parse("""{"tiles":"https://x/{z}/{x}/{y}.png"}"""))
        assertNull(MapLayers.parse("not json"))
    }

    @Test
    fun insideOneRing() {
        val ring = doubleArrayOf(0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0)
        assertTrue(MapLayers.inside(ring, 2.0, 2.0))
        assertFalse(MapLayers.inside(ring, 5.0, 2.0))
        assertFalse(MapLayers.inside(ring, 2.0, -1.0))
    }
}
