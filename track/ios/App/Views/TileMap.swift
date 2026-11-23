import MapKit
import SwiftUI
import UIKit

/// The map's raster tiles (docs/track/ozitrac.md « The map »): each tile from the layer of the country it lies in (MapLayers:
/// Plan IGN in France, swisstopo in Switzerland, OpenStreetMap elsewhere, or the layer the person chose there), fetched by the
/// iPhone itself; past a layer's last zoom, its ancestor's part enlarged. Never Apple's tiles, never an orienteering map.
final class OzTileOverlay: MKTileOverlay {
    let set: MapLayers.LayerSet
    private let picks: [String: String]
    private let memo = NSCache<NSString, NSString>()

    init(set: MapLayers.LayerSet) {
        self.set = set
        var picks: [String: String] = [:]
        for a in set.areas + [set.elsewhere] { picks[a.id] = MapLayers.chosen(set, a).id }
        self.picks = picks
        super.init(urlTemplate: nil)
        canReplaceMapContent = true
        minimumZ = 1
        maximumZ = 21
    }

    /// The layer of tile `z`/`x`/`y`: its area's chosen layer when its four corners lie inside that area, else elsewhere's.
    func layer(z: Int, x: Int, y: Int) -> MapLayers.Layer {
        let key = "\(z)/\(x)/\(y)" as NSString
        if let id = memo.object(forKey: key), let l = set.layers[id as String] { return l }
        let a = set.tileArea(z: z, x: x, y: y)
        let l = set.chosen(a, pick: picks[a.id])
        memo.setObject(l.id as NSString, forKey: key)
        return l
    }

    override func url(forTilePath path: MKTileOverlayPath) -> URL {
        layer(z: path.z, x: path.x, y: path.y).url(z: path.z, x: path.x, y: path.y) ?? URL(string: "about:blank")!
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        let l = layer(z: path.z, x: path.x, y: path.y)
        let up = max(0, path.z - l.maxZoom)
        let ax = path.x >> up, ay = path.y >> up
        TileStore.shared.tile(l, z: path.z - up, x: ax, y: ay) { data in
            guard let data else { return result(nil, nil) }
            if up == 0 { return result(data, nil) }
            result(TileStore.part(data, up: up, dx: path.x - (ax << up), dy: path.y - (ay << up)), nil)
        }
    }
}

/// The tiles kept on this iPhone, per layer, 30 days (`Caches/tiles/<layer>/<z>/<x>/<y>`), each fetched once at a time, with
/// the app's name as User-Agent (OpenStreetMap's tile policy).
final class TileStore {
    static let shared = TileStore()
    private let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.timeoutIntervalForRequest = 20
        c.httpAdditionalHeaders = ["User-Agent": "Ozitrac/\(AppConfig.version) (+https://ozimut.com)"]
        return URLSession(configuration: c)
    }()
    private let mem = NSCache<NSString, NSData>()
    private let lock = NSLock()
    private var waiting: [String: [(Data?) -> Void]] = [:]
    private let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("tiles")
    private static let keep: TimeInterval = 30 * 86_400

    init() {
        mem.totalCostLimit = 24 << 20
    }

    func tile(_ l: MapLayers.Layer, z: Int, x: Int, y: Int, done: @escaping (Data?) -> Void) {
        let key = "\(l.id)/\(z)/\(x)/\(y)"
        if let d = mem.object(forKey: key as NSString) { return done(d as Data) }
        lock.lock()
        if waiting[key] != nil {
            waiting[key]!.append(done)
            lock.unlock()
            return
        }
        waiting[key] = [done]
        lock.unlock()
        let file = dir.appendingPathComponent(key)
        if let at = (try? FileManager.default.attributesOfItem(atPath: file.path))?[.modificationDate] as? Date,
           Date().timeIntervalSince(at) < Self.keep, let d = try? Data(contentsOf: file) {
            return finish(key, d)
        }
        guard let url = l.url(z: z, x: x, y: y) else { return finish(key, nil) }
        session.dataTask(with: url) { data, response, _ in
            let ok = ((response as? HTTPURLResponse)?.statusCode ?? 0) == 200 && !(data?.isEmpty ?? true)
            if ok, let data {
                try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: file, options: .atomic)
            }
            self.finish(key, ok ? data : nil)
        }.resume()
    }

    private func finish(_ key: String, _ data: Data?) {
        if let data { mem.setObject(data as NSData, forKey: key as NSString, cost: data.count) }
        lock.lock()
        let calls = waiting.removeValue(forKey: key) ?? []
        lock.unlock()
        for c in calls { c(data) }
    }

    /// The part `dx`, `dy` of a tile cut in 2^`up` each way, enlarged to the tile's size.
    static func part(_ data: Data, up: Int, dx: Int, dy: Int) -> Data? {
        guard let img = UIImage(data: data)?.cgImage else { return nil }
        let w = img.width, h = img.height
        let side = max(1, w >> up)
        guard let crop = img.cropping(to: CGRect(x: dx * side, y: dy * side, width: side, height: max(1, h >> up))) else { return nil }
        let f = UIGraphicsImageRendererFormat()
        f.scale = 1
        let out = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: f).image { ctx in
            ctx.cgContext.interpolationQuality = .medium
            UIImage(cgImage: crop).draw(in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        return out.pngData()
    }
}

/// The person's choices of layer, as something the maps watch: a change redraws every map.
final class MapLayersModel: ObservableObject {
    static let shared = MapLayersModel()
    @Published private(set) var version = 0
    private var token: NSObjectProtocol?

    init() {
        token = NotificationCenter.default.addObserver(forName: MapLayers.changed, object: nil, queue: .main) { [weak self] _ in
            self?.version += 1
        }
    }
}

/// A trail on the tile map: the line run, the last position and its accuracy, the map following it or not; or, for the
/// zone, a cross at the centre with the zone's circle round it.
struct TileMap: UIViewRepresentable {
    var trail: [TrackFix] = []
    var position: TrackFix?
    @Binding var follow: Bool
    /// The zone screen: the map's centre is the zone's, `radius` metres round it.
    var zoneRadius: Int?
    var onCentre: ((CLLocationCoordinate2D) -> Void)?
    /// Where the map opens when there is nothing to show (France by default).
    var start: (CLLocationCoordinate2D, CLLocationDistance)?
    /// The map is fitted to the trail the first time it has one, then whenever this changes (another run).
    var fitKey: String = ""
    /// A place to show (« Ma position » on the zone screen), once per id.
    var goTo: GoTo?
    /// MapLayersModel's version: when it changes, the tiles are chosen again.
    var layersVersion = 0
    /// The map's centre and the credits of the layers drawn, after each move.
    var onShown: ((CLLocationCoordinate2D, String) -> Void)?

    struct GoTo {
        let id = UUID()
        var at: CLLocationCoordinate2D
        var metres: CLLocationDistance
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> MKMapView {
        let m = MKMapView()
        m.delegate = context.coordinator
        m.isRotateEnabled = false
        m.isPitchEnabled = false
        m.showsCompass = false
        let o = OzTileOverlay(set: MapLayers.current)
        m.addOverlay(o, level: .aboveLabels)
        context.coordinator.tiles = o
        context.coordinator.version = layersVersion
        let s = start ?? (CLLocationCoordinate2D(latitude: 46.6, longitude: 2.4), 1_200_000)
        m.setRegion(MKCoordinateRegion(center: s.0, latitudinalMeters: s.1, longitudinalMeters: s.1), animated: false)
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handMoved(_:)))
        pan.delegate = context.coordinator
        m.addGestureRecognizer(pan)
        return m
    }

    func updateUIView(_ m: MKMapView, context: Context) {
        let c = context.coordinator
        c.parent = self
        if c.version != layersVersion {
            c.version = layersVersion
            if let old = c.tiles { m.removeOverlay(old) }
            let o = OzTileOverlay(set: MapLayers.current)
            m.insertOverlay(o, at: 0, level: .aboveLabels)
            c.tiles = o
            c.report(m)
        }
        if trail.count != c.shown || trail.last != c.lastShown {
            c.shown = trail.count
            c.lastShown = trail.last
            if let line = c.line { m.removeOverlay(line) }
            c.line = nil
            if trail.count >= 2 {
                var pts = trail.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
                let line = MKPolyline(coordinates: &pts, count: pts.count)
                m.addOverlay(line, level: .aboveLabels)
                c.line = line
            }
        }
        if position != c.positionShown {
            c.positionShown = position
            if let a = c.accuracy { m.removeOverlay(a) }
            c.accuracy = nil
            if let p = c.pin { m.removeAnnotation(p) }
            c.pin = nil
            if let f = position {
                let at = CLLocationCoordinate2D(latitude: f.latitude, longitude: f.longitude)
                let a = MKCircle(center: at, radius: CLLocationDistance(max(f.ac, 3)))
                m.addOverlay(a, level: .aboveLabels)
                c.accuracy = a
                let p = MKPointAnnotation()
                p.coordinate = at
                m.addAnnotation(p)
                c.pin = p
            }
        }
        if !trail.isEmpty && c.fitted != fitKey {
            c.fitted = fitKey
            fit(m)
        } else if follow, let f = position {
            m.setCenter(CLLocationCoordinate2D(latitude: f.latitude, longitude: f.longitude), animated: true)
        }
        if let g = goTo, g.id != c.wentTo {
            c.wentTo = g.id
            m.setRegion(MKCoordinateRegion(center: g.at, latitudinalMeters: g.metres, longitudinalMeters: g.metres), animated: true)
        }
        c.drawZone(m)
    }

    private func fit(_ m: MKMapView) {
        var r = MKMapRect.null
        for f in trail {
            let p = MKMapPoint(CLLocationCoordinate2D(latitude: f.latitude, longitude: f.longitude))
            r = r.union(MKMapRect(x: p.x, y: p.y, width: 0, height: 0))
        }
        let minSide = 600 * MKMapPointsPerMeterAtLatitude(trail[0].latitude)
        if r.size.width < minSide || r.size.height < minSide {
            r = r.insetBy(dx: -(minSide - r.size.width) / 2, dy: -(minSide - r.size.height) / 2)
        }
        m.setVisibleMapRect(r, edgePadding: UIEdgeInsets(top: 40, left: 30, bottom: 40, right: 30), animated: false)
    }

    final class Coordinator: NSObject, MKMapViewDelegate, UIGestureRecognizerDelegate {
        var parent: TileMap
        var line: MKPolyline?
        var accuracy: MKCircle?
        var pin: MKPointAnnotation?
        var zone: MKCircle?
        var shown = -1
        var lastShown: TrackFix?
        var positionShown: TrackFix?
        var fitted: String?
        var wentTo: UUID?
        var tiles: OzTileOverlay?
        var version = 0
        private var reported: (Double, Double, String)?

        init(_ p: TileMap) {
            parent = p
        }

        /// The map moved by hand: it no longer follows the person.
        @objc func handMoved(_ g: UIPanGestureRecognizer) {
            if g.state == .began && parent.follow {
                DispatchQueue.main.async { self.parent.follow = false }
            }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }

        func drawZone(_ m: MKMapView) {
            if let z = zone { m.removeOverlay(z) }
            zone = nil
            guard let r = parent.zoneRadius, r > 0 else { return }
            let z = MKCircle(center: m.centerCoordinate, radius: CLLocationDistance(r))
            m.addOverlay(z, level: .aboveLabels)
            zone = z
        }

        func mapView(_ m: MKMapView, regionDidChangeAnimated animated: Bool) {
            if parent.zoneRadius != nil {
                drawZone(m)
                parent.onCentre?(m.centerCoordinate)
            }
            report(m)
        }

        func mapViewDidFinishRenderingMap(_ m: MKMapView, fullyRendered: Bool) {
            report(m)
        }

        /// Tells the map's owner its centre and the credits of the layers drawn on the tiles in view.
        func report(_ m: MKMapView) {
            guard let o = tiles, m.bounds.width > 0 else { return }
            let world = MKMapSize.world.width
            let rect = m.visibleMapRect
            guard rect.size.width > 0 else { return }
            let zf = log2(world / rect.size.width * Double(m.bounds.width) * Double(m.traitCollection.displayScale) / 256)
            var z = min(max(Int(zf.rounded(.down)), 0), 21)
            func span(_ z: Int) -> (Int, Int, Int, Int) {
                let n = Double(1 << z)
                let x0 = Int(floor(rect.minX / world * n)), x1 = Int(floor(rect.maxX / world * n))
                let y0 = max(0, Int(floor(rect.minY / world * n))), y1 = min((1 << z) - 1, Int(floor(rect.maxY / world * n)))
                return (x0, x1, y0, y1)
            }
            var b = span(z)
            while (b.1 - b.0 + 1) * (b.3 - b.2 + 1) > 120 && z > 0 {
                z -= 1
                b = span(z)
            }
            let n = 1 << z
            var seen: [String] = []
            var credits: [String] = []
            if b.2 <= b.3 {
                for ty in b.2...b.3 {
                    for tx in b.0...b.1 {
                        let l = o.layer(z: z, x: ((tx % n) + n) % n, y: ty)
                        if seen.contains(l.id) { continue }
                        seen.append(l.id)
                        if !l.credit.isEmpty && !credits.contains(l.credit) { credits.append(l.credit) }
                    }
                }
            }
            let c = m.centerCoordinate
            let text = credits.joined(separator: " · ")
            if let r = reported, r.0 == c.latitude, r.1 == c.longitude, r.2 == text { return }
            reported = (c.latitude, c.longitude, text)
            DispatchQueue.main.async { self.parent.onShown?(c, text) }
        }

        func mapView(_ m: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let t = overlay as? MKTileOverlay { return MKTileOverlayRenderer(tileOverlay: t) }
            if let l = overlay as? MKPolyline {
                let r = MKPolylineRenderer(polyline: l)
                r.strokeColor = UIColor(red: 0.91, green: 0.39, blue: 0.11, alpha: 0.95)
                r.lineWidth = 4
                r.lineJoin = .round
                r.lineCap = .round
                return r
            }
            if let c = overlay as? MKCircle {
                let r = MKCircleRenderer(circle: c)
                if c === zone {
                    r.strokeColor = UIColor.systemRed
                    r.lineWidth = 2
                    r.fillColor = UIColor.systemRed.withAlphaComponent(0.06)
                } else {
                    r.fillColor = UIColor.systemBlue.withAlphaComponent(0.15)
                    r.strokeColor = UIColor.systemBlue.withAlphaComponent(0.5)
                    r.lineWidth = 1
                }
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func mapView(_ m: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            let v = m.dequeueReusableAnnotationView(withIdentifier: "pos") ?? MKAnnotationView(annotation: annotation, reuseIdentifier: "pos")
            v.annotation = annotation
            let size: CGFloat = 18
            v.image = UIGraphicsImageRenderer(size: CGSize(width: size, height: size)).image { ctx in
                UIColor.white.setFill()
                ctx.cgContext.fillEllipse(in: CGRect(x: 0, y: 0, width: size, height: size))
                UIColor.systemBlue.setFill()
                ctx.cgContext.fillEllipse(in: CGRect(x: 3, y: 3, width: size - 6, height: size - 6))
            }
            return v
        }
    }
}

/// A tile map with its « Fond de carte » button top left and the credits of the layers drawn bottom right; `map` builds the
/// TileMap from the layers' version and the report of what it shows.
struct OzMap<M: View>: View {
    @ObservedObject private var layers = MapLayersModel.shared
    @State private var centre = CLLocationCoordinate2D(latitude: 46.6, longitude: 2.4)
    @State private var credit = ""
    @State private var choosing = false
    let map: (Int, @escaping (CLLocationCoordinate2D, String) -> Void) -> M

    init(map: @escaping (Int, @escaping (CLLocationCoordinate2D, String) -> Void) -> M) {
        self.map = map
    }

    var body: some View {
        map(layers.version) { c, t in
            centre = c
            credit = t
        }
        .overlay(alignment: .topLeading) {
            Button(action: { choosing = true }) {
                Image(systemName: "square.3.layers.3d")
                    .font(.title3)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color(.systemBackground).opacity(0.92)))
                    .foregroundColor(.primary)
            }
            .padding(8)
            .accessibilityLabel(L("map.layers"))
        }
        .overlay(alignment: .bottomTrailing) {
            if !credit.isEmpty { MapCredit(text: credit) }
        }
        .sheet(isPresented: $choosing) { MapLayersSheet(centre: centre) }
    }
}

/// « Fond de carte »: the layers offered, area by area — the one the map's centre lies in first, then the others, then
/// « elsewhere ». A choice applies at once, to every map, and is kept on this iPhone.
struct MapLayersSheet: View {
    let centre: CLLocationCoordinate2D
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var model = MapLayersModel.shared

    private var areas: [MapLayers.Area] {
        let set = MapLayers.current
        var out = [set.areaAt(lon: centre.longitude, lat: centre.latitude)]
        for a in set.areas + [set.elsewhere] where !out.contains(where: { $0.id == a.id }) { out.append(a) }
        return out.filter { a in a.layers.contains { set.layers[$0] != nil } }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(areas, id: \.id) { a in
                    AreaSection(area: a, version: model.version)
                }
            }
            .navigationTitle(L("map.layers"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(L("map.done")) { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private struct AreaSection: View {
        let area: MapLayers.Area
        let version: Int

        var body: some View {
            let set = MapLayers.current
            let current = MapLayers.chosen(set, area).id
            Section(area.id == MapLayers.elsewhereId && area.names.isEmpty ? L("map.elsewhere") : area.name) {
                ForEach(area.layers.compactMap { set.layers[$0] }, id: \.id) { l in
                    Button(action: { MapLayers.choose(area: area.id, layer: l.id) }) {
                        HStack {
                            Text(l.name).foregroundColor(.primary)
                            Spacer()
                            if l.id == current { Image(systemName: "checkmark").foregroundColor(.orange) }
                        }
                    }
                    .accessibilityAddTraits(l.id == current ? .isSelected : [])
                }
            }
        }
    }
}

/// The map with its credits, its layers and, for a person's live map, the follow switch.
struct LiveMap: View {
    var trail: [TrackFix]
    var position: TrackFix?
    var fitKey: String
    @State private var follow = true

    var body: some View {
        OzMap { version, shown in
            TileMap(trail: trail, position: position, follow: $follow, fitKey: fitKey, layersVersion: version, onShown: shown)
        }
        .overlay(alignment: .topTrailing) {
            Button(action: { follow.toggle() }) {
                Label(L("map.follow"), systemImage: follow ? "location.fill" : "location")
                    .font(.callout.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 8).fill(follow ? Color.orange : Color(.systemBackground).opacity(0.9)))
                    .foregroundColor(follow ? .white : .primary)
            }
            .padding(8)
            .accessibilityAddTraits(follow ? .isSelected : [])
        }
    }
}

struct MapCredit: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .lineLimit(2)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.8))
            .foregroundColor(.black)
            .padding(4)
    }
}
