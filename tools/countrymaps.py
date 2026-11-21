"""The outline of each country whose agenda Ozimut reads, for the Agenda's map (owner, 2026-10-25: « a map of the chosen
country, the competition's place shown when the mouse is over it in the table »): site/assets/geo/<cc>.json, drawn by the
browser (site/assets/js/agendamap.js) — no map service is asked anything when the page opens.

Made from Natural Earth's 1:10m countries and first-level units (public domain, https://www.naturalearthdata.com), once:

    python tools/countrymaps.py fetch          # download the two GeoJSON files into $CN_DATA_DIR/naturalearth
    python tools/countrymaps.py build [cc …]   # rebuild site/assets/geo/<cc>.json (every agenda's country by default)

A file: { v, source, q, box: [west, south, east, north], land: [ring…], units: [ring…], near: [ring…] } — the country's own
land (the part around its largest piece: overseas lands left out), its first-level units (France's départements, the
German Länder…), the neighbours' land cut to the frame; a ring is [x0, y0, dx1, dy1, …], longitude and latitude × q,
each point after the first as its difference with the one before. Simplified to about a pixel of a 600-pixel-wide map.
"""
from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
OUT = ROOT / "site" / "assets" / "geo"
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/"
FILES = ("ne_10m_admin_0_countries", "ne_10m_admin_1_states_provinces")


def src_dir() -> Path:
    import paths
    return Path(paths.DATA_DIR) / "naturalearth"


def fetch() -> None:
    d = src_dir()
    d.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        if not (d / f"{f}.geojson").exists():
            print("fetch", f)
            urllib.request.urlretrieve(f"{URL}{f}.geojson", d / f"{f}.geojson")


def rings(geom: dict) -> list[list[tuple[float, float]]]:
    """A Polygon's or MultiPolygon's rings, outer and inner alike (drawn with the even-odd rule)."""
    if not geom:
        return []
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"] if geom["type"] == "MultiPolygon" else []
    return [[(p[0], p[1]) for p in ring] for poly in polys for ring in poly]


def bbox(pts) -> tuple[float, float, float, float]:
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def simplify(pts: list, tol: float, cos: float) -> list:
    """Douglas-Peucker on a ring, distances in degrees of latitude (longitude × cos of the country's latitude)."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a][0] * cos, pts[a][1]
        bx, by = pts[b][0] * cos, pts[b][1]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i][0] * cos - ax, pts[i][1] - ay
            d = abs(dx * py - dy * px) / L if L else math.hypot(px, py)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def clip(pts: list, box) -> list:
    """Sutherland-Hodgman: a ring cut to a rectangle (the neighbours' land, to the frame)."""
    w, s, e, n = box
    edges = [(lambda p: p[0] >= w, lambda a, b: (w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0]))),
             (lambda p: p[0] <= e, lambda a, b: (e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0]))),
             (lambda p: p[1] >= s, lambda a, b: (a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s)),
             (lambda p: p[1] <= n, lambda a, b: (a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n))]
    for inside, cut in edges:
        if not pts:
            break
        out = []
        prev = pts[-1]
        for p in pts:
            if inside(p):
                if not inside(prev):
                    out.append(cut(prev, p))
                out.append(p)
            elif inside(prev):
                out.append(cut(prev, p))
            prev = p
        pts = out
    return pts


def encode(pts: list, q: float) -> list[int]:
    out, px, py = [], 0, 0
    for i, (x, y) in enumerate(pts):
        ix, iy = round(x * q), round(y * q)
        if i and ix == px and iy == py:
            continue
        out += [ix, iy] if i == 0 else [ix - px, iy - py]
        px, py = ix, iy
    return out


def code_of(props: dict) -> str:
    a2 = props.get("ISO_A2_EH") or props.get("ISO_A2")
    return a2 if a2 and a2 != "-99" else ""


def build(cc: str, countries: list, units: list) -> dict | None:
    own = [f for f in countries if code_of(f["properties"]) == cc]
    if not own:
        return None
    land = [r for f in own for r in rings(f["geometry"])]
    # the country around its largest piece: the pieces whose centre lies within half its size of it (Corsica, the
    # Balearics, Bornholm; not French Guiana nor the Canaries)
    main = max(land, key=lambda r: (lambda b: (b[2] - b[0]) * (b[3] - b[1]))(bbox(r)))
    w, s, e, n = bbox(main)
    mw, mh = (e - w) * 0.5, (n - s) * 0.5
    near_main = lambda r: (lambda b: w - mw <= (b[0] + b[2]) / 2 <= e + mw and s - mh <= (b[1] + b[3]) / 2 <= n + mh)(bbox(r))
    land = [r for r in land if near_main(r)]
    w, s, e, n = bbox([p for r in land for p in r])
    lat0 = (s + n) / 2
    cos = math.cos(math.radians(lat0))
    span = max((e - w) * cos, n - s)
    tol = span / 900                                      # (about a pixel of a 600-pixel map, zoomed in a little)
    q = 10 ** max(2, math.ceil(math.log10(8 / tol)))      # (a tenth of the tolerance or finer)
    pad = span * 0.04
    box = [w - pad / cos, s - pad, e + pad / cos, n + pad]
    frame = [box[0] - span * 0.3 / cos, box[1] - span * 0.3, box[2] + span * 0.3 / cos, box[3] + span * 0.3]

    def small(r):
        b = bbox(r)
        return max((b[2] - b[0]) * cos, b[3] - b[1]) < tol * 2.5

    def done(rs, cut=None):
        out = []
        for r in rs:
            if small(r):
                continue
            if cut:
                b = bbox(r)
                if b[2] < cut[0] or b[0] > cut[2] or b[3] < cut[1] or b[1] > cut[3]:
                    continue
                r = clip(r, cut)
                if len(r) < 3:
                    continue
            r = simplify(r, tol, cos)
            if len(r) >= 4:
                out.append(encode(r, q))
        return out

    unit_rings = [r for f in units if f["properties"].get("iso_a2") == cc for r in rings(f["geometry"]) if near_main(r)]
    near = [r for f in countries if code_of(f["properties"]) != cc for r in rings(f["geometry"])]
    return {"v": 1, "source": "Natural Earth (public domain), https://www.naturalearthdata.com", "q": q,
            "box": [round(x, 4) for x in box], "land": done(land), "units": done(unit_rings), "near": done(near, frame)}


def build_world(countries: list) -> dict:
    """« IOF WRE »'s map (countries/wre.py, code XW; owner, 2026-11-04): the world's land, every country's outline (its borders
    drawn by the land's edge), Antarctica left out; simplified for a map a few hundred pixels wide."""
    w, s, e, n = -170.0, -56.0, 180.0, 78.0
    cos = math.cos(math.radians((s + n) / 2))
    span = max((e - w) * cos, n - s)
    tol = span / 1800                     # (zoomed in on a continent, its coasts still hold)
    q = 100
    out = []
    for f in countries:
        if code_of(f["properties"]) == "AQ":
            continue
        for r in rings(f["geometry"]):
            b = bbox(r)
            if max((b[2] - b[0]) * cos, b[3] - b[1]) < tol * 3:
                continue
            r = simplify(r, tol, cos)
            if len(r) >= 4:
                out.append(encode(r, q))
    return {"v": 1, "source": "Natural Earth (public domain), https://www.naturalearthdata.com", "q": q,
            "box": [w, s, e, n], "land": out, "units": [], "near": []}


def main(argv) -> None:
    cmd = argv[0] if argv else "build"
    if cmd == "fetch":
        fetch()
        return
    import countries
    # every agenda's country, and every country the IOF's WRE calendar may name (countries/wre.py: their WREs have a list)
    from countries import wre
    ccs = [c.upper() for c in argv[1:]] or [m.COUNTRY.code for m in countries.modules()] + sorted(set(wre.IOC.values()))
    d = src_dir()
    load = lambda f: json.loads((d / f"{f}.geojson").read_text(encoding="utf-8"))["features"]
    world, units = load(FILES[0]), load(FILES[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for cc in dict.fromkeys(ccs):
        if cc == "XA":                 # (« Tous les pays » draws IOF WRE's world map)
            continue
        m = build_world(world) if cc == "XW" else build(cc, world, units)
        if not m:
            print(f"{cc}: not in Natural Earth")
            continue
        p = OUT / f"{cc.lower()}.json"
        p.write_text(json.dumps(m, separators=(",", ":")), encoding="utf-8")
        print(f"{cc}: {len(m['land'])} land rings, {len(m['units'])} unit rings, {len(m['near'])} neighbours' rings, "
              f"{p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
