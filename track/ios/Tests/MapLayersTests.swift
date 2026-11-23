import XCTest

/// The map's layers as `GET /api/ozitrac/config` gives them (docs/track/ozitrac.md « The map »), as Android's MapLayersTest.
final class MapLayersTests: XCTestCase {
    private let config = """
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
    """

    func testReadsLayersAreasAndElsewhere() throws {
        let set = try XCTUnwrap(MapLayers.parse(config))
        XCTAssertEqual(set.order, ["osm", "ign-plan"])   // a plain http address is refused
        XCTAssertEqual(set.areas.count, 1)
        let fr = set.areas[0]
        XCTAssertEqual(fr.layers, ["ign-plan", "osm"])
        XCTAssertEqual(fr.polys.count, 2)
        XCTAssertEqual(fr.box, [0, 40, 22, 50])
        XCTAssertEqual(set.elsewhere.layers, ["osm"])
        XCTAssertEqual(set.elsewhere.id, MapLayers.elsewhereId)
        XCTAssertEqual(MapLayers.name(fr.names, fr.id, lang: "fr"), "France")
        XCTAssertEqual(MapLayers.name(set.layers["ign-plan"]!.names, "ign-plan", lang: "de"), "IGN map (Plan IGN)")
        XCTAssertEqual(set.layers["ign-plan"]!.url(z: 12, x: 2074, y: 1409)?.absoluteString,
                       "https://data.geopf.fr/wmts?TILEMATRIX=12&TILEROW=1409&TILECOL=2074")
    }

    func testPlacesPointsInTheirArea() throws {
        let set = try XCTUnwrap(MapLayers.parse(config))
        XCTAssertEqual(set.areaAt(lon: 5, lat: 45).id, "FR")
        XCTAssertEqual(set.areaAt(lon: 21, lat: 40.5).id, "FR")            // the second ring
        XCTAssertEqual(set.areaAt(lon: 15, lat: 45).id, MapLayers.elsewhereId)
        XCTAssertEqual(set.areaAt(lon: 21.9, lat: 41.9).id, MapLayers.elsewhereId) // in the box, outside the triangle
        XCTAssertTrue(set.areas[0].contains(lon: 0.5, lat: 49.5))
        XCTAssertFalse(set.areas[0].contains(lon: -0.5, lat: 45))
    }

    /// A tile is the area's only when its four corners lie inside; under zoom 5 always elsewhere.
    func testTheFourCornersRule() throws {
        let set = try XCTUnwrap(MapLayers.parse(config))
        // zoom 10 round lon 5, lat 45: x = (5 + 180) / 360 × 1024 = 526.2, y ≈ 368.6
        XCTAssertEqual(set.tileArea(z: 10, x: 526, y: 368).id, "FR")
        // by the western edge (lon 0): x = 513 spans lon 0.35…0.70, inside; x = 511 spans -0.35…0, outside
        XCTAssertEqual(set.tileArea(z: 10, x: 513, y: 368).id, "FR")
        XCTAssertEqual(set.tileArea(z: 10, x: 511, y: 368).id, MapLayers.elsewhereId)
        // a tile larger than the area at zoom 5 (11.25° wide) never fits inside it
        XCTAssertEqual(set.tileArea(z: 5, x: 16, y: 11).id, MapLayers.elsewhereId)
        // under zoom 5, elsewhere whatever the place
        XCTAssertEqual(set.tileArea(z: 4, x: 8, y: 5).id, MapLayers.elsewhereId)
        // the area's first layer by default, the person's pick when offered, else the default again
        let fr = set.areas[0]
        XCTAssertEqual(set.chosen(fr, pick: nil).id, "ign-plan")
        XCTAssertEqual(set.chosen(fr, pick: "osm").id, "osm")
        XCTAssertEqual(set.chosen(fr, pick: "ch-image").id, "ign-plan")
        XCTAssertEqual(set.chosen(set.elsewhere, pick: "ign-plan").id, "osm")
    }

    func testWithoutLayersThereIsNothingToRead() {
        XCTAssertNil(MapLayers.parse(nil))
        XCTAssertNil(MapLayers.parse(""))
        XCTAssertNil(MapLayers.parse(#"{"tiles":"https://x/{z}/{x}/{y}.png"}"#))
        XCTAssertNil(MapLayers.parse("not json"))
    }

    func testInsideOneRing() {
        let ring: [Double] = [0, 0, 4, 0, 4, 4, 0, 4]
        XCTAssertTrue(MapLayers.inside(ring, lon: 2, lat: 2))
        XCTAssertFalse(MapLayers.inside(ring, lon: 5, lat: 2))
        XCTAssertFalse(MapLayers.inside(ring, lon: 2, lat: -1))
    }
}
