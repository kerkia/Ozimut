import MapKit
import SwiftUI
import UIKit

/// The map's raster tiles, from the relay's settings (`GET /api/ozitrac/config`; OpenStreetMap's until a provider is
/// set): Ozitrac draws its own map, never Apple's tiles, never an orienteering map (docs/track/ozitrac.md « The map »).
final class OzTileOverlay: MKTileOverlay {
    static let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.urlCache = URLCache(memoryCapacity: 8 << 20, diskCapacity: 150 << 20, directory: nil)
        c.requestCachePolicy = .returnCacheDataElseLoad
        c.httpAdditionalHeaders = ["User-Agent": "Ozitrac/\(AppConfig.version) (iOS)"]
        return URLSession(configuration: c)
    }()

    init(cfg: RelayConfig.Cfg) {
        super.init(urlTemplate: cfg.tiles)
        canReplaceMapContent = true
        maximumZ = cfg.maxZoom
        minimumZ = 1
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        OzTileOverlay.session.dataTask(with: url(forTilePath: path)) { data, response, error in
            let ok = ((response as? HTTPURLResponse)?.statusCode ?? 0) == 200
            result(ok ? data : nil, error)
        }.resume()
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
        m.addOverlay(OzTileOverlay(cfg: RelayConfig.current), level: .aboveLabels)
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

/// The map with its credit and, for a person's live map, the follow switch and the zoom buttons.
struct LiveMap: View {
    var trail: [TrackFix]
    var position: TrackFix?
    var fitKey: String
    @State private var follow = true

    var body: some View {
        TileMap(trail: trail, position: position, follow: $follow, fitKey: fitKey)
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
            .overlay(alignment: .bottomTrailing) { MapCredit() }
    }
}

struct MapCredit: View {
    var body: some View {
        Text(RelayConfig.current.credit)
            .font(.caption2)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Color.white.opacity(0.8))
            .foregroundColor(.black)
            .padding(4)
    }
}
