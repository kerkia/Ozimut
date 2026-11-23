import Foundation

/// The map's layers by country (docs/track/ozitrac.md « The map »): what `GET /api/ozitrac/config` says — each layer's tile
/// address, credit and last zoom, each area's outline and layers (the first the default), the layers elsewhere — and the
/// layer the person chose for each area. A tile is drawn from an area's layer when its four corners lie inside the area,
/// else from the layer chosen for « elsewhere ». The twin of Android's MapLayers.kt.
enum MapLayers {
    static let elsewhereId = "*"
    /// Posted when the person's choice or the relay's layers change: every map chooses its tiles again.
    static let changed = Notification.Name("oz.map.layers")

    struct Layer: Equatable {
        let id: String
        let tiles: String
        let credit: String
        let maxZoom: Int
        let names: [String: String]

        var name: String { MapLayers.name(names, id) }

        func url(z: Int, x: Int, y: Int) -> URL? {
            URL(string: tiles.replacingOccurrences(of: "{z}", with: String(z))
                .replacingOccurrences(of: "{x}", with: String(x))
                .replacingOccurrences(of: "{y}", with: String(y)))
        }
    }

    /// An area: `polys` each [lon0, lat0, lon1, lat1…], `box` lon0, lat0, lon1, lat1 of them all.
    struct Area {
        let id: String
        let names: [String: String]
        let layers: [String]
        let polys: [[Double]]
        let box: [Double]

        var name: String { MapLayers.name(names, id) }

        func contains(lon: Double, lat: Double) -> Bool {
            if lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3] { return false }
            return polys.contains { MapLayers.inside($0, lon: lon, lat: lat) }
        }
    }

    struct LayerSet {
        let layers: [String: Layer]
        /// The layers' ids in the relay's order.
        let order: [String]
        let areas: [Area]
        let elsewhere: Area

        /// The layer drawn for this area: `pick` (the person's choice) when the area offers it, else the area's first.
        func chosen(_ a: Area, pick: String?) -> Layer {
            if let p = pick, a.layers.contains(p), let l = layers[p] { return l }
            if let id = a.layers.first(where: { layers[$0] != nil }), let l = layers[id] { return l }
            return layers[order[0]]!
        }

        /// The area a point lies in, else « elsewhere ».
        func areaAt(lon: Double, lat: Double) -> Area {
            areas.first { $0.contains(lon: lon, lat: lat) } ?? elsewhere
        }

        /// The area tile `z`/`x`/`y` is drawn for: the one holding its four corners, else « elsewhere » (always under zoom 5).
        func tileArea(z: Int, x: Int, y: Int) -> Area {
            if z < 5 { return elsewhere }
            let n = Double(1 << z)
            let lon0 = MapLayers.lon(Double(x) / n), lon1 = MapLayers.lon(Double(x + 1) / n)
            let lat0 = MapLayers.lat(Double(y) / n), lat1 = MapLayers.lat(Double(y + 1) / n)
            return areas.first {
                $0.contains(lon: lon0, lat: lat0) && $0.contains(lon: lon1, lat: lat0)
                    && $0.contains(lon: lon0, lat: lat1) && $0.contains(lon: lon1, lat: lat1)
            } ?? elsewhere
        }
    }

    static func lon(_ wx: Double) -> Double { wx * 360 - 180 }
    static func lat(_ wy: Double) -> Double { atan(sinh(Double.pi * (1 - 2 * wy))) * 180 / Double.pi }

    // MARK: the relay's answer

    static func parse(_ raw: String?) -> LayerSet? {
        guard let raw, !raw.isEmpty, let data = raw.data(using: .utf8),
              let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let la = j["layers"] as? [Any] else { return nil }
        var layers: [String: Layer] = [:]
        var order: [String] = []
        for case let o as [String: Any] in la {
            let id = (o["id"] as? String) ?? ""
            let tiles = (o["tiles"] as? String) ?? ""
            if id.isEmpty || !tiles.hasPrefix("https://") || !tiles.contains("{z}") || layers[id] != nil { continue }
            let mz = min(max(JSON.int(o["maxZoom"]) ?? 19, 5), 22)
            layers[id] = Layer(id: id, tiles: tiles, credit: (o["credit"] as? String) ?? "", maxZoom: mz, names: names(o["name"]))
            order.append(id)
        }
        if order.isEmpty { return nil }
        var areas: [Area] = []
        for case let o as [String: Any] in (j["areas"] as? [Any]) ?? [] {
            guard let ids = o["layers"] as? [Any], let pa = o["poly"] as? [Any] else { continue }
            var polys: [[Double]] = []
            var box = [180.0, 90.0, -180.0, -90.0]
            for case let ring as [Any] in pa {
                var pts: [Double] = []
                for case let p as [Any] in ring {
                    guard p.count >= 2, let lon = num(p[0]), let lat = num(p[1]) else { continue }
                    pts.append(lon)
                    pts.append(lat)
                    box[0] = min(box[0], lon); box[1] = min(box[1], lat)
                    box[2] = max(box[2], lon); box[3] = max(box[3], lat)
                }
                if pts.count >= 6 { polys.append(pts) }
            }
            if polys.isEmpty { continue }
            areas.append(Area(id: (o["id"] as? String) ?? "", names: names(o["name"]), layers: ids.compactMap { $0 as? String },
                              polys: polys, box: box))
        }
        let e = j["elsewhere"] as? [String: Any]
        let eIds = ((e?["layers"] as? [Any]) ?? []).compactMap { $0 as? String }.filter { layers[$0] != nil }
        let elsewhere = Area(id: elsewhereId, names: names(e?["name"]), layers: eIds.isEmpty ? [order[0]] : eIds, polys: [],
                             box: [-180, -90, 180, 90])
        return LayerSet(layers: layers, order: order, areas: areas, elsewhere: elsewhere)
    }

    private static func num(_ v: Any) -> Double? {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        return nil
    }

    private static func names(_ v: Any?) -> [String: String] {
        ((v as? [String: Any]) ?? [:]).compactMapValues { $0 as? String }
    }

    /// Ray casting on one ring.
    static func inside(_ p: [Double], lon: Double, lat: Double) -> Bool {
        var hit = false
        let n = p.count / 2
        var j = n - 1
        for i in 0..<n {
            let xi = p[2 * i], yi = p[2 * i + 1]
            let xj = p[2 * j], yj = p[2 * j + 1]
            if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi { hit.toggle() }
            j = i
        }
        return hit
    }

    /// A name in the phone's language among the four the relay gives, else English.
    static func name(_ names: [String: String], _ fallback: String, lang: String? = nil) -> String {
        if let s = names[lang ?? appLanguage], !s.isEmpty { return s }
        if let s = names["en"], !s.isEmpty { return s }
        return fallback
    }

    static var appLanguage: String {
        String((Bundle.main.preferredLocalizations.first ?? "en").prefix(2))
    }

    // MARK: on this phone

    private static let d = UserDefaults.standard
    private static let lock = NSLock()
    private static var cached: LayerSet?
    private static var cachedFrom: String??

    /// The set the relay last gave (RelayConfig keeps its answer), else OpenStreetMap everywhere.
    static var current: LayerSet {
        let raw = RelayConfig.mapsJson
        lock.lock()
        defer { lock.unlock() }
        if let c = cached, cachedFrom == .some(raw) { return c }
        let set = parse(raw) ?? fallback
        cached = set
        cachedFrom = .some(raw)
        return set
    }

    private static var fallback: LayerSet {
        let cfg = RelayConfig.current
        let osm = Layer(id: "osm", tiles: cfg.tiles, credit: cfg.credit, maxZoom: cfg.maxZoom, names: [:])
        return LayerSet(layers: ["osm": osm], order: ["osm"], areas: [],
                        elsewhere: Area(id: elsewhereId, names: [:], layers: ["osm"], polys: [], box: [-180, -90, 180, 90]))
    }

    static func choice(_ area: String) -> String? { d.string(forKey: "oz.map.choice." + area) }

    static func choose(area: String, layer: String) {
        d.set(layer, forKey: "oz.map.choice." + area)
        NotificationCenter.default.post(name: changed, object: nil)
    }

    /// The layer drawn for this area on this phone.
    static func chosen(_ set: LayerSet, _ a: Area) -> Layer { set.chosen(a, pick: choice(a.id)) }
}
