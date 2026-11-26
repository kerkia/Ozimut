import CoreLocation
import SwiftUI

/// The zone set on this iPhone (docs/track/folloz.md rule 5): its centre is the map's centre (the cross), « Ma position »
/// brings the map to where the iPhone is; a radius; leaving it during a run alerts the people who follow.
struct ZoneView: View {
    @EnvironmentObject var m: AppModel
    @State private var radius = ""
    @State private var on = false
    @State private var centre = CLLocationCoordinate2D(latitude: 46.6, longitude: 2.4)
    @State private var follow = false
    @State private var goTo: TileMap.GoTo?
    @State private var start: (CLLocationCoordinate2D, CLLocationDistance)?
    @State private var ready = false

    var body: some View {
        VStack(spacing: 0) {
            Text(L("zone.text")).font(.footnote).foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
                .padding(.bottom, 8)
            if ready {
                OzMap { version, shown in
                    TileMap(follow: $follow, zoneRadius: Int(radius) ?? 0, onCentre: { centre = $0 }, start: start, goTo: goTo,
                            layersVersion: version, onShown: shown)
                }
                .overlay {
                    Image(systemName: "plus").font(.title.weight(.light)).foregroundColor(.red).allowsHitTesting(false)
                }
            } else {
                Spacer()
            }
            VStack(spacing: 12) {
                HStack {
                    Text(L("zone.radius"))
                    Spacer()
                    TextField("500", text: $radius)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 110)
                        .textFieldStyle(.roundedBorder)
                }
                Toggle(L("zone.alert"), isOn: $on)
                HStack(spacing: 10) {
                    Button(action: locate) {
                        Label(L("zone.here"), systemImage: "location").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    Button(action: save) {
                        Text(L("zone.save")).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                }
            }
            .padding()
        }
        .navigationTitle(L("zone.title"))
        .navigationBarTitleDisplayMode(.inline)
        .closable()
        .onAppear {
            let z = Zone.current
            radius = String(z.r)
            on = z.on
            if z.placed {
                let c = CLLocationCoordinate2D(latitude: Double(z.la) / 1_000_000, longitude: Double(z.lo) / 1_000_000)
                centre = c
                start = (c, Double(z.r) * 3)
            } else if let p = m.probe {
                centre = p.coordinate
                start = (p.coordinate, 2000)
            }
            ready = true
            m.location.onProbe = { loc in
                m.probe = loc
                goTo = TileMap.GoTo(at: loc.coordinate, metres: max(1500, Double(Int(radius) ?? 500) * 3))
            }
        }
        .onDisappear {
            m.location.onProbe = { loc in m.probe = loc }
        }
    }

    private func locate() {
        m.location.probe()
    }

    private func save() {
        guard let r = Int(radius.trimmingCharacters(in: .whitespaces)), r >= 50 else {
            m.notice = L("zone.radiusBad")
            return
        }
        Zone.current = Zone(on: on, la: Int64((centre.latitude * 1_000_000).rounded()),
                            lo: Int64((centre.longitude * 1_000_000).rounded()), r: r)
        m.notice = L("zone.saved")
        m.page = nil
    }
}
