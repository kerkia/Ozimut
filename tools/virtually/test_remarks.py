"""Regression tests: every remark the owner and their mapper made on the generated town map (Gif-sur-Yvette, 2026-11-12/13), as a
test on what town_map.py writes — map_objects.json (with its curves and point flags) and the sources beside it (src/osm.json,
sports.json, bdtopo_batiment.json, legibility.json). Several remarks came back after a first fix: these say when one does.

    py test_remarks.py <race>                 the race's map (data/virtual/<race>), the legibility report the generator wrote
    py test_remarks.py <race> --recheck       the legibility check run again on the map (minutes) instead of its report
    py test_remarks.py <race> --only 3,15     some remarks only;  --map F  another map_objects.json;  --json F  the results

A remark that needs what the objects do not hold says so and is skipped (S). Exit 1 when one fails. The places named are Gif's
(Lambert 93); on another town those tests are skipped. The remarks: side-session-notes « standard-remarks.md », CLAUDE.md « A
mapper's review », « The mapper's third review », « The owner's review of 2026-11-13 »."""
import json
import math
import os
import sys
import time
from pathlib import Path

import numpy as np
import shapely
import shapely.ops
from shapely.geometry import LineString, Point, Polygon, box as sbox
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def code(sym):
    n, s = divmod(int(sym), 1000)
    return f"{n}.{s}" if s else str(n)


class Map:
    def __init__(self, path, rd):
        self.doc = json.load(open(path, encoding="utf-8"))
        self.k = self.doc["scale"] / 1000.0
        rw = self.doc["realWorld"]
        self.cx, self.cy = rw["x"], rw["y"]
        self.rd = rd
        self.by = {}
        for o in self.doc["objects"]:
            g = self.geom(o)
            if g is not None:
                self.by.setdefault(code(o["sym"]), []).append((o, g))
        area = rd / "area.json"
        bx = json.load(open(area, encoding="utf-8")).get("box") if area.exists() else None
        allg = [g for v in self.by.values() for _, g in v]
        self.frame = sbox(*shapely.total_bounds(allg)) if allg else sbox(0, 0, 1, 1)
        self.box = sbox(*bx) if bx else self.frame
        self._u = {}

    def m(self, r):
        a = np.asarray(r, float)[:, :2]
        return a * self.k + (self.cx, self.cy)

    def geom(self, o):
        rings = [self.m(r) for r in o.get("rings", []) if len(r)]
        if not rings:
            return None
        try:
            if o["otp"] == 3:
                if len(rings[0]) < 3:
                    return None
                return shapely.make_valid(Polygon(rings[0], [h for h in rings[1:] if len(h) >= 3]))
            if o["otp"] == 2:
                return LineString(rings[0]) if len(rings[0]) >= 2 else None
            return Point(rings[0][0])
        except (ValueError, shapely.errors.GEOSException):
            return None

    def gs(self, *codes, otp=None):
        return [g for c in codes for o, g in self.by.get(c, []) if otp is None or o["otp"] == otp]

    def objs(self, *codes):
        return [(o, g) for c in codes for o, g in self.by.get(c, [])]

    def union(self, *codes):
        key = codes
        if key not in self._u:
            self._u[key] = shapely.make_valid(unary_union(self.gs(*codes, otp=3) or [Polygon()]))
        return self._u[key]

    def local(self, codes, g, pad=0.0):
        """The union of the areas of `codes` round g only (a town's paving is one polygon: never cut the whole of it)."""
        key = tuple(codes)
        if ("t",) + key not in self._u:
            ps = self.gs(*codes, otp=3)
            self._u[("t",) + key] = (shapely.STRtree(ps) if ps else None, ps)
        tree, ps = self._u[("t",) + key]
        if tree is None:
            return Polygon()
        q = g.buffer(pad) if pad else g
        hit = [ps[i] for i in tree.query(q)]
        if not hit:
            return Polygon()
        x0, y0, x1, y1 = q.bounds
        cut = [shapely.clip_by_rect(h, x0 - 1, y0 - 1, x1 + 1, y1 + 1) for h in hit]
        return shapely.make_valid(unary_union([shapely.make_valid(c) for c in cut]))

    def src(self, name):
        p = self.rd / "src" / name
        return json.load(open(p, encoding="utf-8")) if p.exists() else None

    def near(self, x, y, r):
        return Point(x, y).buffer(r)

    def at_edge(self, g, d=1.0):
        return g.distance(self.frame.exterior) < d or g.distance(self.box.exterior) < d


def osm_polys(M, pred):
    """OSM ways (closed) whose tags pass pred, as Lambert 93 polygons."""
    d = M.src("osm.json")
    if d is None:
        return None
    from l93 import transformer
    tr = transformer(4326, 2154)
    out = []
    for e in d.get("elements", []):
        if e.get("type") != "way" or not pred(e.get("tags", {})) or not e.get("geometry"):
            continue
        xs, ys = tr.transform([p["lon"] for p in e["geometry"]], [p["lat"] for p in e["geometry"]])
        if len(xs) >= 4 and (xs[0], ys[0]) == (xs[-1], ys[-1]):
            out.append(shapely.make_valid(Polygon(list(zip(xs, ys)))))
    return out


def osm_lines(M, pred):
    d = M.src("osm.json")
    if d is None:
        return None
    from l93 import transformer
    tr = transformer(4326, 2154)
    out = []
    for e in d.get("elements", []):
        if e.get("type") == "way" and pred(e.get("tags", {})) and e.get("geometry") and len(e["geometry"]) >= 2:
            xs, ys = tr.transform([p["lon"] for p in e["geometry"]], [p["lat"] for p in e["geometry"]])
            out.append(LineString(list(zip(xs, ys))))
    return out


class Skip(Exception):
    pass


def fail_list(items, what, show=5):
    """[] passes; else the failure text with the first places."""
    if not items:
        return None
    pl = "; ".join(f"E {p.x:.0f} N {p.y:.0f}" if isinstance(p, Point) else str(p) for p in items[:show])
    return f"{len(items)} {what}: {pl}"


def rp(g):
    if g.is_empty:
        return Point(0, 0)
    return g if isinstance(g, Point) else g.representative_point()


def anchors(o, ring=0):
    """bez's anchors of a ring: [(x, y, xflag, yflag, before_is_handle, after_is_handle)] in map mm."""
    b = (o.get("bez") or [None])[ring]
    if not b:
        return [(x, y, 0, 0, False, False) for x, y in o["rings"][ring]]
    out = []
    for i, p in enumerate(b):
        if len(p) >= 3 and p[2] in (1, 2):
            continue
        prev_h = i > 0 and len(b[i - 1]) >= 3 and b[i - 1][2] in (1, 2)
        next_h = i + 1 < len(b) and len(b[i + 1]) >= 3 and b[i + 1][2] in (1, 2)
        out.append((p[0], p[1], p[2] if len(p) > 2 else 0, p[3] if len(p) > 3 else 0, prev_h, next_h))
    return out


def heading_at(a, p, b):
    """The angle (0-90°) between lines a and b where they cross at p."""
    def h(l):
        d = l.project(p)
        q0, q1 = l.interpolate(max(0.0, d - 0.5)), l.interpolate(min(l.length, d + 0.5))
        return math.atan2(q1.y - q0.y, q1.x - q0.x)
    x = abs(math.degrees(h(a) - h(b))) % 180
    return min(x, 180 - x)


def turn(a, b, c):
    u, v = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
    nu, nv = math.hypot(*u), math.hypot(*v)
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))))


# ---------------------------------------------------------------------------------------------------------------- the remarks
T = {}


def test(n, title):
    def deco(f):
        T[n] = (title, f)
        return f
    return deco


def left(M, rule):
    rep = M.leg
    if rule not in rep.get("rules", {}):
        if "set" in rep:                                            # (the catalogue's report lists only the rules with findings)
            return []
        raise Skip(f"the legibility report has no « {rule} » (an older check)")
    r = rep["rules"][rule]
    return [Point(*p["at"]) for p in r.get("places", [])]


@test(1, "paved areas have their 501.1 edge; no spike where two sections meet")
def t1(M):
    msgs = [fail_list(left(M, "paved_edge"), "stretches of paved edge without 501.1")]
    spikes = []
    for o, g in M.objs("501", "501.4"):
        if o["otp"] != 3:
            continue
        for r in [g.exterior] + list(g.interiors) if g.geom_type == "Polygon" else []:
            cs = list(r.coords)[:-1]
            n = len(cs)
            for i in range(n):
                a, b, c = cs[i - 1], cs[i], cs[(i + 1) % n]
                if math.dist(a, b) > 0.5 and math.dist(b, c) > 0.5 and turn(a, b, c) > 170:
                    spikes.append(Point(b))
    msgs.append(fail_list(spikes, "spikes in paved areas (an angle under 10°)"))
    return [m for m in msgs if m]


@test(2, "paved footways are part of the paved area: no 501.6-501.9, no overlapping paving, no crossed 501.1 edges")
def t2(M):
    out = []
    extra = [rp(g) for c in ("501.6", "501.7", "501.8", "501.9") for g in M.gs(c)]
    out.append(fail_list(extra, "paved footways drawn as 501.6-501.9 lines"))
    pav = M.gs("501", otp=3)
    tree = shapely.STRtree(pav) if pav else None
    ov = []
    for i, g in enumerate(pav):
        for j in tree.query(g, predicate="overlaps"):
            if j > i:
                x = g.intersection(pav[j])
                if x.area > 0.5:
                    ov.append(rp(x))
    out.append(fail_list(ov, "paved areas over each other (not one union)"))
    ed = M.gs("501.1", otp=2)
    et = shapely.STRtree(ed) if ed else None
    cross = []
    for i, g in enumerate(ed):
        for j in et.query(g):
            if j <= i:
                continue
            x = g.intersection(ed[j])
            for p in getattr(x, "geoms", [x]):
                if p.geom_type != "Point" or min(Point(c).distance(p) for c in (g.coords[0], g.coords[-1], ed[j].coords[0], ed[j].coords[-1])) <= 0.3:
                    continue
                if heading_at(g, p, ed[j]) >= 20:                 # (a nearly parallel crossing is a doubled edge, not a junction's)
                    cross.append(p)
    out.append(fail_list(cross, "501.1 edges crossing each other at a junction"))
    return [m for m in out if m]


@test(3, "an unpaved path loses each edge inside another path's band (x flag 4 left, y flag 4 right): junctions open")
def t3(M):
    half, edge = 0.31, 0.25                                         # town_map.py's DBL_HALF and DBL_EDGE, mm
    ps = [o for o, _ in M.objs("505") if o["otp"] == 2]
    lines = [LineString(o["rings"][0]) for o in ps]
    tree = shapely.STRtree(lines) if lines else None
    bad = []
    for i, o in enumerate(ps):
        near = [j for j in tree.query(lines[i].buffer(half)) if j != i]
        if not near:
            continue
        # each edge on its own (the owner, 2026-11-18: at a narrow fork the outer edges had gone with the inner ones); the other
        # paths' bands with flat ends, as the generator's
        band = unary_union([lines[j].buffer(half, cap_style="flat") for j in near])
        an = anchors(o)
        for (x0, y0, fx, fy, _, _), (x1, y1, *_r) in zip(an, an[1:]):
            L_ = math.hypot(x1 - x0, y1 - y0)
            if L_ <= 0.05:
                continue
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2; nx, ny = -(y1 - y0) / L_, (x1 - x0) / L_
            left_in = band.contains(Point(mx + nx * edge, my + ny * edge))
            right_in = band.contains(Point(mx - nx * edge, my - ny * edge))
            if (left_in and not fx & 4) or (right_in and not fy & 4):
                bad.append(Point(M.cx + mx * M.k, M.cy + my * M.k))
    return [m for m in [fail_list(bad, "505 segments inside another path's band with their edges drawn")] if m]


@test(4, "no sliver under 1 m (given to the neighbour with the longest shared edge)")
def t4(M):
    return [m for m in [fail_list(left(M, "sliver"), "slivers left")] if m]


@test(5, "olive only for houses' gardens: not round a block of flats (3 dwellings or more) or shops")
def t5(M):
    d = M.src("bdtopo_batiment.json")
    if d is None:
        raise Skip("no src/bdtopo_batiment.json")
    # schools are 520 on purpose (CLAUDE.md « olive 520 for … schools »), though BD TOPO files their buildings under « Commercial et
    # services »: the generator's own test for a school (its activity zones, « Science et enseignement »)
    zones = M.src("bdtopo_zone_d_activite_ou_d_interet.json")
    schools = []
    for f in (zones or {}).get("features", []):
        p = f["properties"]; cat = (p.get("categorie") or "").lower(); nat = (p.get("nature") or "").lower()
        if cat.startswith("science et enseignement") and any(w in nat for w in ("école", "collège", "lycée", "enseignement")):
            schools.append(shapely.force_2d(shapely.make_valid(shapely.geometry.shape(f["geometry"]))))
    SCH = unary_union(schools) if schools else Polygon()
    parcels = []
    import glob
    from l93 import transformer
    tr = transformer(4326, 2154)
    for fn in glob.glob(str(M.rd / "src" / "parcelles_*.json")):
        for f in json.load(open(fn, encoding="utf-8"))["features"]:
            q = shapely.transform(shapely.geometry.shape(f["geometry"]), lambda c: np.c_[tr.transform(c[:, 0], c[:, 1])])
            if q.intersects(M.box):
                parcels.append(shapely.make_valid(q))
    # open ground one comes from: runnable ground joined to the map's edge (a pocket of paving wedged between a building and the
    # olive is no way in; 2026-11-15)
    R = runnable(M)
    REACHED = unary_union([q for q in getattr(R, "geoms", [R]) if q.geom_type == "Polygon" and q.distance(M.box.exterior) <= 1.0]
                          or [Polygon()])
    bad = []
    for f in d["features"]:
        p = f["properties"]
        flats = (p.get("nombre_de_logements") or 0) >= 3
        shops = (p.get("usage_1") or "") in ("Commercial et services",) or (p.get("usage_2") or "") in ("Commercial et services",)
        if not (flats or shops):
            continue
        g = shapely.make_valid(shapely.geometry.shape(f["geometry"]))
        g = shapely.force_2d(g)
        if not M.box.intersects(g) or g.area < 30 or SCH.contains(g.representative_point()):
            continue
        # the building's own parcel: its olive is wrong where it lies against open ground or paving with no wall, fence or hedge
        # between (what the parcel rule would have made); olive that open ground reaches only through buildings or other olive is
        # the enclosed or island ground of remarks 6 and 7, and right
        own = [pg for pg in parcels if pg.intersection(g).area > 0.5 * g.area] if parcels else [g.buffer(4)]
        if not own:
            continue
        free = unary_union(own).difference(M.local(["521"], g, pad=30))
        op = free.intersection(M.local(["520"], g, pad=30))
        op = unary_union([q for q in getattr(op, "geoms", [op]) if q.geom_type in ("Polygon", "MultiPolygon")] or [Polygon()])
        # (the cadastre's parcels and the map's boundaries differ by a metre or so: olive within 1 m of the parcel's edge is the
        # neighbour's garden, not this parcel's; 2026-11-15)
        op = shapely.make_valid(op.difference(unary_union(own).boundary.buffer(1.0)))
        if op.area < 5 or op.area < 0.3 * free.area:
            continue
        acc = M.local(ACC, op, pad=1.0).intersection(REACHED.buffer(0.05))
        walls = unary_union([x.buffer(0.6) for c in ("411", "513.1", "513.2", "515", "516", "518", "529") for x in M.gs(c, otp=2)
                             if x.distance(op) < 2] or [Polygon()])
        if op.boundary.intersection(acc.buffer(0.3)).difference(walls).length >= 3.0:
            bad.append(rp(g))
    return [m for m in [fail_list(bad, "blocks of flats or shops whose parcel is olive by open ground")] if m]


ACC = ["501", "501.3", "501.4", "401", "402", "403", "404", "405", "406", "408"]


def runnable(M):
    k = M.k
    barrier = [M.union("521"), M.union("520"), M.union("411"), M.union("301"), M.union("709")]
    for c, w in (("515", 0.4), ("518", 0.4), ("529", 0.4), ("509.1", 0.3)):
        barrier += [g.buffer(w * k / 2, cap_style="flat") for g in M.gs(c, otp=2)]
    B = shapely.make_valid(unary_union(barrier))
    opens = unary_union(M.gs("993", "522", "512.3", otp=3) or [Polygon()])
    return shapely.make_valid(M.box.difference(B.difference(opens)))


@test(6, "ground enclosed by uncrossable features is 520 (or part of the building)")
def t6(M):
    R = runnable(M)
    W = M.union("301").buffer(0.5)
    # an island (water bounds most of its edge) stays as it is: the owner, 2026-11-18, « nothing in OSM says it is olive »
    bad = [rp(p) for p in getattr(R, "geoms", [R]) if p.geom_type == "Polygon" and p.area > 2.0
           and p.distance(M.box.exterior) > 1.0 and p.exterior.intersection(W).length < 0.6 * p.exterior.length]
    return [m for m in [fail_list(bad, "pieces of ground no street or open space reaches")] if m]


@test(7, "ground reached only through 520 is 520, with nothing inside it")
def t7(M):
    return [m for m in [fail_list(left(M, "in_olive"), "objects inside olive")] if m]


@test(8, "OSM's lawns (grass, village green, meadow, grassland) are 401, in squares too")
def t8(M):
    lawns = osm_polys(M, lambda t: t.get("landuse") in ("grass", "village_green", "meadow") or t.get("natural") == "grassland"
                      or t.get("leisure") == "village_green")
    if lawns is None:
        raise Skip("no src/osm.json")
    bad = []
    for p in lawns:
        p = p.intersection(M.box)
        if p.area < 100:
            continue
        den = p.difference(M.local(["521", "520", "301", "501.4"], p))
        if den.area > 50 and den.intersection(M.local(["401", "402", "403"], p)).area / den.area < 0.5:
            bad.append(rp(p))
    return [m for m in [fail_list(bad, "OSM lawns not drawn as open land")] if m]


@test(9, "public space is paving only beside a street: no paved strip along the Mérantaise by the tennis courts")
def t9(M):
    if not M.box.contains(Point(636130, 6844650)):
        raise Skip("not Gif")
    zone = M.near(636130, 6844650, 30)
    st = [g for g in M.gs("305", otp=2) if g.intersects(zone)]
    if not st:
        return ["no stream drawn by the tennis courts (E 636130 N 6844650)"]
    pav = M.local(["501"], zone).intersection(unary_union([g.buffer(2.5) for g in st])).intersection(zone)
    # an OSM way drawn there is no public-space strip (2026-11-19: the compacted footway along the stream is paving at its width)
    ways = osm_lines(M, lambda t: t.get("highway") is not None) or []
    if ways:
        pav = pav.difference(unary_union([g.buffer(2.0) for g in ways if g.intersects(zone.buffer(5))] or [Polygon()]))
    return [f"{pav.area:.0f} m² of paving within 2.5 m of the Mérantaise by the tennis courts"] if pav.area > 2 else []


@test(10, "trees: woods of 400 m² are forest, lone trees kept apart, no 402 ring round a wood")
def t10(M):
    out = [fail_list(left(M, "point_over"), "trees drawn over each other")]
    F = M.union("405") if "405" in M.by else Polygon()
    ring = []
    for g in M.gs("402", otp=3):
        L = g.length
        if L > 0 and not F.is_empty and g.boundary.intersection(F.buffer(0.5)).length / L > 0.6:
            ring.append(rp(g))
    out.append(fail_list(ring, "402 rings round a wood"))
    return [m for m in out if m]


@test(11, "bare ground within 12 m of a sports ground is open land, not paving")
def t11(M):
    raise Skip("the photograph's bare-ground class is not in the objects: the rule is the generator's (town_map.py)")


@test(12, "buildings that touch are drawn as one, with no line between them")
def t12(M):
    out = [fail_list(left(M, "building_seam"), "outlines between touching buildings")]
    bs = M.gs("521", otp=3)
    tree = shapely.STRtree(bs) if bs else None
    touch = []
    for i, g in enumerate(bs):
        for j in tree.query(g.buffer(0.02)):
            if j > i and g.distance(bs[j]) < 0.02:
                touch.append(rp(g.intersection(bs[j].buffer(0.05))) if g.intersects(bs[j].buffer(0.05)) else rp(g))
    out.append(fail_list(touch, "pairs of 521 objects that touch"))
    return [m for m in out if m]


@test(13, "inside 520: no sheds under 20 m², hedges, walls, fences, paths or lone trees")
def t13(M):
    OL = M.union("520")
    if OL.is_empty:
        return []
    OI = OL.buffer(-1.0)
    shapely.prepare(OI)
    bad = []
    for c in ("411", "513.1", "513.2", "515", "516", "518", "505", "506", "417", "418"):
        for o, g in M.objs(c):
            if (o["otp"] == 1 and OI.contains(g)) or (o["otp"] == 2 and g.intersection(OI).length > 1.0) or \
                    (o["otp"] == 3 and OI.contains(g)):
                bad.append(rp(g))
    for g in M.gs("521", otp=3):
        if g.area < 20 and OI.contains(g):
            bad.append(rp(g))
    return [m for m in [fail_list(bad, "objects drawn inside olive")] if m]


SMOOTH = ["101", "102", "103", "305", "306", "301", "301.9", "302", "308", "401", "402", "403", "406", "408", "410", "411", "415"]
STRAIGHT = ["521", "521.9", "522", "522.9", "513.1", "513.2", "515", "516", "518", "709", "993"] + \
    [f"532.{i}" for i in range(1, 7)] + ["532", "512.1", "512.2", "512.3"]


@test(14, "lines and outlines are Bézier curves (no angle on water, contours, vegetation); man-made features stay straight")
def t14(M):
    flat, curved = [], []
    # a sports ground's outline keeps its corners, in open land too (the owner, 2026-11-18: « terrains de sport en ellipse »)
    sp = M.src("sports.json") or []
    SPE = unary_union([shapely.make_valid(Polygon(q[0], q[1:])).boundary for s in sp for q in s["polys"]] or [Polygon()]).buffer(0.6)
    on_sport = lambda a: not SPE.is_empty and SPE.contains(Point(a[0] * M.k + M.cx, a[1] * M.k + M.cy))
    # a corner a man-made outline turns at is a corner of whatever shares it (2026-11-19: a straight canal between pavings, a
    # lawn strip in a square: « clean in OSM » means its angles kept)
    # — and so is a point where an area was cut square on a man-made outline (water at a bridge's deck)
    mmk = {(round(p[0], 3), round(p[1], 3)) for c in M.by if c not in SMOOTH and c not in ("990", "991", "993") for o, _ in M.by[c] if o["otp"] != 1
           for r in o.get("rings", []) for p in r}
    _mml = [g.boundary if g.geom_type in ("Polygon", "MultiPolygon") else g for c in M.by if c not in SMOOTH
            and c not in ("990", "991", "993") for o, g in M.by[c] if o["otp"] != 1]
    _mmt = shapely.STRtree(_mml) if _mml else None
    def on_mm(a):
        if (round(a[0], 3), round(a[1], 3)) in mmk:
            return True
        q = Point(a[0] * M.k + M.cx, a[1] * M.k + M.cy)
        return _mmt is not None and len(_mmt.query(q, predicate="dwithin", distance=0.4)) > 0
    for c in SMOOTH:
        for o, g in M.objs(c):
            if o["otp"] == 1 or len(o["rings"][0]) < 4:
                continue
            if (g.area < 30 if o["otp"] == 3 else g.length < 20):    # (a scrap — water between two decks — has no shape to keep)
                continue
            b = o.get("bez")
            an = anchors(o)
            if not b or not any(len(p) > 2 and p[2] in (1, 2) for p in b[0]):
                # (a pitch: straight sides, kept corners; an area all of whose points lie on something built — a lawn in a
                # square — has only man-made edges: straight, by townmap/export.py's rule, 2026-11-22)
                if not all(on_sport(a) or on_mm(a) for a in an):
                    flat.append(rp(g))
                continue
            hard = [a for a in an[1:-1] if not a[4] and not a[5] and not on_sport(a) and not on_mm(a)]
            if len(hard) > max(1, len(an) // 4):
                flat.append(rp(g))
    for c in STRAIGHT:
        for o, g in M.objs(c):
            if any(len(p) > 2 and p[2] in (1, 2) for r in (o.get("bez") or []) for p in r):
                curved.append(rp(g))
    out = [fail_list(flat, "objects that should be curved drawn with angles"),
           fail_list(curved, "man-made objects drawn as curves")]
    return [m for m in out if m]


@test(15, "OCAD corner points (y flag 1) at every angle of 30° or more")
def t15(M):
    bad = []
    for c, lst in M.by.items():
        for o, g in lst:
            if o["otp"] == 1 or not o.get("bez"):
                continue
            for ri in range(len(o["bez"])):
                an = anchors(o, ri)
                closed = len(an) >= 4 and math.dist(an[0][:2], an[-1][:2]) < 1e-6
                pts = an[:-1] if closed else an
                n = len(pts)
                for i in range(n):
                    if not closed and (i == 0 or i == n - 1):
                        continue
                    a, b, cc = pts[i - 1], pts[i], pts[(i + 1) % n]
                    if b[4] or b[5]:
                        continue                                    # a curve's point: its handles make it smooth
                    if turn(a, b, cc) >= 30 and not (b[3] & 1):
                        bad.append(Point(M.cx + b[0] * M.k, M.cy + b[1] * M.k))
    return [m for m in [fail_list(bad, "angles of 30° or more without the corner flag")] if m]


@test(16, "contours: no loop under 600 m², no line under 40 m, cut only at stairways and the map's edge")
def t16(M):
    out = []
    small, short = [], []
    stairs = unary_union([g.buffer(2.0) for c in [f"532.{i}" for i in range(1, 7)] + ["532"] for g in M.gs(c, otp=2)] or [Polygon()])
    for o, g in M.objs("101", "102", "103"):
        if o["otp"] != 2:
            continue
        cs = list(g.coords)
        if len(cs) >= 4 and math.dist(cs[0], cs[-1]) < 0.01:
            if Polygon(cs).area < 600:
                small.append(rp(g))
        elif g.length < 40 and not M.at_edge(g) and not g.intersects(stairs):
            short.append(rp(g))
    out.append(fail_list(small, "contour loops under 600 m²"))
    out.append(fail_list(short, "contour lines under 40 m"))
    out.append(fail_list(left(M, "contour_end"), "contours ending in the open"))
    try:
        out.append(fail_list(left(M, "contour_cut"), "contours crossing a stairway"))
    except Skip:
        pass
    return [m for m in out if m]


@test(17, "paths: one network (no gap under 4 m), unpaved paths not drawn on paving")
def t17(M):
    out = [fail_list(left(M, "path_paved"), "unpaved paths on paving")]
    ls = M.gs("505", "506", otp=2)
    tree = shapely.STRtree(ls) if ls else None
    gaps = []
    for i, g in enumerate(ls):
        for e in (Point(g.coords[0]), Point(g.coords[-1])):
            if M.at_edge(e, 2.0):
                continue
            d_line = min([ls[j].distance(e) for j in tree.query(e.buffer(4.0)) if j != i] or [99])
            pl = M.local(["501"], e, pad=4.5)
            d_pav = pl.distance(e) if not pl.is_empty else 99
            d = min(d_line, d_pav)
            if 0.3 < d < 4.0 and d_line > 0.3 and d_pav > 0.3:
                # (a join across a building or the olive is no gap: the path stops at what may not be crossed, remark 13)
                tgt = pl if d_pav <= d_line else min((ls[j] for j in tree.query(e.buffer(4.0)) if j != i), key=lambda q_: q_.distance(e))
                tp = shapely.ops.nearest_points(e, tgt)[1]
                seg = LineString([e, tp])
                if seg.intersection(M.local(["521", "520"], seg, pad=1.0)).length > 0.02:
                    continue
                gaps.append(e)
    out.append(fail_list(gaps, "path ends 0.3-4 m from another path or the paving"))
    return [m for m in out if m]


@test(18, "watercourses: one per stream (no OSM copy beside BD TOPO's); OSM's ditches and drains are 306")
def t18(M):
    ws = M.gs("305", otp=2)
    dup = []
    for i, a in enumerate(ws):
        if a.length < 20:
            continue
        P = [a.interpolate(t) for t in np.arange(1, a.length, 2.0)]
        for j, b in enumerate(ws):
            if j == i:
                continue
            ends = [Point(b.coords[0]), Point(b.coords[-1]), Point(a.coords[0]), Point(a.coords[-1])]
            run = [p for p in P if b.distance(p) < 12 and min(e.distance(p) for e in ends) > 12]
            if len(run) >= 10:
                dup.append(run[len(run) // 2])
                break
    out = [fail_list(dup, "watercourses doubled within 12 m")]
    ditches = osm_lines(M, lambda t: t.get("waterway") in ("ditch", "drain") and t.get("tunnel") not in ("yes", "culvert"))
    if ditches is not None:
        D = unary_union([g.buffer(3) for g in M.gs("306", "305", otp=2)] + [M.union("301", "301.9", "308")])
        miss = [rp(g.intersection(M.box)) for g in ditches if g.intersection(M.box).length > 20 and
                g.intersection(M.box).intersection(D).length / g.intersection(M.box).length < 0.5]
        out.append(fail_list(miss, "OSM ditches or drains not drawn as 306"))
    return [m for m in out if m]


@test(19, "stairways: 532.1-532.6 at their width, always on paving")
def t19(M):
    plain = [rp(g) for g in M.gs("532")]
    out = [fail_list(plain, "stairways drawn with the plain 532 (no width)")]
    out.append(fail_list(left(M, "stairs"), "stairways not standing on paving"))
    return [m for m in out if m]


@test(20, "the railway is drawn track by track (the RER's two tracks)")
def t20(M):
    if not M.box.contains(Point(636508, 6844580)):
        raise Skip("not Gif")
    z = M.near(636508, 6844580, 60)
    tr = [g for c in ("509", "509.1", "509.2") for g in M.gs(c, otp=2) if g.intersects(z)]
    if len(tr) < 2:
        return [f"{len(tr)} railway line(s) by the station, two tracks expected"]
    d = min(tr[0].distance(g) for g in tr[1:] if g.distance(tr[0]) > 0.5) if any(g.distance(tr[0]) > 0.5 for g in tr[1:]) else 0
    return [] if 2.0 <= d <= 12.0 else [f"the station's railway lines {d:.1f} m apart, two tracks 3-5 m apart expected"]


@test(21, "a grass pitch's edge is 415")
def t21(M):
    sp = M.src("sports.json")
    if sp is None:
        raise Skip("no src/sports.json")
    E = unary_union([g.buffer(1.0) for g in M.gs("415", otp=2)] or [Polygon()])
    bad = []
    for s in sp:
        if s.get("surface") != "grass" or s.get("sport") not in ("soccer", "rugby"):
            continue
        for poly in s["polys"]:
            p = shapely.make_valid(Polygon(poly[0], poly[1:])).intersection(M.box)
            if p.area < 500:
                continue
            ring = p.boundary.difference(M.box.exterior.buffer(1.0))
            if ring.length > 20 and ring.intersection(E).length / ring.length < 0.5:
                bad.append(rp(p))
    return [m for m in [fail_list(bad, "grass pitches without their 415 edge")] if m]


@test(22, "512.1 only at a passage's mouth, two triangles at least (1.4 mm)")
def t22(M):
    short = [rp(g) for g in M.gs("512.1", otp=2) if g.length < 1.4 * M.k - 0.1]
    out = [fail_list(short, "512.1 shorter than two triangles"), fail_list(left(M, "bridge"), "512.1 away from a passage's mouth")]
    return [m for m in out if m]


@test(23, "a bridge's 515 sides at least 0.4 mm of clear space apart; no 515 across a passage's mouth")
def t23(M):
    k = M.k
    water = unary_union([g.buffer(6) for g in M.gs("305", "306", "509.1", otp=2)] + [M.union("301").buffer(6)])
    sides = [g for g in M.gs("515", otp=2) if g.length <= 40 and g.intersects(water)]
    narrow = []
    for i, a in enumerate(sides):
        for b in sides[i + 1:]:
            d = a.distance(b)
            if d > 6 or d < 0.05:
                continue
            ha = math.atan2(a.coords[-1][1] - a.coords[0][1], a.coords[-1][0] - a.coords[0][0])
            hb = math.atan2(b.coords[-1][1] - b.coords[0][1], b.coords[-1][0] - b.coords[0][0])
            if abs(math.sin(ha - hb)) > 0.26:
                continue
            mid = 0.5 * (a.distance(b.interpolate(0.5, normalized=True)) + b.distance(a.interpolate(0.5, normalized=True)))
            if mid < (0.4 + 0.4) * k - 0.1:
                narrow.append(a.interpolate(0.5, normalized=True))
    out = [fail_list(narrow, f"pairs of bridge sides under 0.4 mm clear ({0.8 * k:.1f} m between their lines)")]
    mouths = M.gs("512.1", otp=2)
    across = [rp(g.intersection(m.buffer(0.2))) for g in M.gs("515", otp=2) for m in mouths if g.intersects(m.buffer(0.2))
              and g.intersection(m.buffer(0.2)).length > 0.5]
    out.append(fail_list(across, "515 lines across a passage's mouth"))
    return [m for m in out if m]


@test(24, "512.2 only from 2.8 m (drawn 0.2 mm short of each end), not along another black line")
def t24(M):
    short = [rp(g) for g in M.gs("512.2", otp=2) if g.length < 2.8 - 2 * 0.2 * M.k - 0.1]
    out = [fail_list(short, "512.2 on a passage under 2.8 m")]
    try:
        out.append(fail_list(left(M, "pass_side"), "512.2 along another black line"))
    except Skip:
        pass
    return [m for m in out if m]


@test(25, "512.3 over every passage, its stripes at about 45° to the passage's axis")
def t25(M):
    covers = M.gs("512.3", otp=3)
    C = unary_union([g.buffer(3) for g in covers] or [Polygon()])
    miss = [rp(g) for g in M.gs("512.2", otp=2) if not g.intersects(C)]
    out = [fail_list(miss, "passages (512.2) without 512.3")]
    bad = []
    sides = M.gs("512.2", otp=2)
    for o, g in M.objs("512.3"):
        if o["otp"] != 3 or g.area < 8:                              # (a ramp's or a junction's scrap has no axis of its own)
            continue
        ang = (o.get("ang", 0) / 10.0) % 180
        near = [l for l in sides if l.distance(g) < 1.0]              # the passage's own sides give its axis
        if near:
            l = max(near, key=lambda l: l.intersection(g.buffer(1.0)).length)
            c = list(l.coords)
            axis = math.degrees(math.atan2(c[-1][1] - c[0][1], c[-1][0] - c[0][0])) % 180
            dlt = abs((ang - axis) % 180)
            if min(dlt, 180 - dlt) > 12:
                bad.append(rp(g))
            continue
        r = g.minimum_rotated_rectangle
        cs = list(r.exterior.coords) if r.geom_type == "Polygon" else []
        if len(cs) < 4:
            continue
        e1, e2 = (cs[0], cs[1]), (cs[1], cs[2])
        e = e1 if math.dist(*e1) >= math.dist(*e2) else e2
        axis = math.degrees(math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0])) % 180
        dlt = abs((ang - axis) % 180)
        dlt = min(dlt, 180 - dlt)
        if dlt > 12 and math.dist(*e) > 1.5 * min(math.dist(*e1), math.dist(*e2)):   # (the symbol's hatching adds the 45°)
            bad.append(rp(g))
    out.append(fail_list(bad, "512.3 stripes not at about 45° to the passage"))
    return [m for m in out if m]


@test(26, "a passage through a building is a 522 cut out of it, not a 512")
def t26(M):
    BI = M.union("521").buffer(-0.5)
    bad = [rp(g.intersection(BI)) for c in ("512.1", "512.2") for g in M.gs(c, otp=2) if g.intersection(BI).length > 0.5]
    return [m for m in [fail_list(bad, "512 lines inside a building")] if m]


@test(27, "a footbridge makes no passage of a way not tagged beneath it (the Mérantaise footbridge)")
def t27(M):
    if not M.box.contains(Point(636065, 6844695)):
        raise Skip("not Gif")
    z = M.near(636065, 6844695, 15)
    pas = [g for c in ("512.1", "512.2") for g in M.gs(c, otp=2) if g.intersects(z)]
    return [f"{len(pas)} passage symbol(s) under the Mérantaise footbridge"] if pas else []


@test(28, "no 709 on a sports ground; track and multi-sport courts paved; tennis courts fenced")
def t28(M):
    sp = M.src("sports.json")
    if sp is None:
        raise Skip("no src/sports.json")
    O = M.union("709")
    F = unary_union([g.buffer(1.0) for g in M.gs("518", otp=2)] or [Polygon()])
    P = M.union("501")
    b709, unpaved, unfenced = [], [], []
    for s in sp:
        for poly in s["polys"]:
            p = shapely.make_valid(Polygon(poly[0], poly[1:])).intersection(M.box)
            if p.area < 50:
                continue
            if not O.is_empty and p.intersection(O).area > 1:
                b709.append(rp(p))
            if s["sport"] in ("athletics", "multi") and p.intersection(P).area / p.area < 0.6:
                unpaved.append(rp(p))
            if s["sport"] == "tennis" and p.intersection(M.local(["520"], p)).area / p.area < 0.5:
                ring = p.boundary.difference(M.box.exterior.buffer(1.0))
                if ring.length > 10 and ring.intersection(F).length / ring.length < 0.8:
                    unfenced.append(rp(p))
    out = [fail_list(b709, "sports grounds under 709"), fail_list(unpaved, "track or courts not paved"),
           fail_list(unfenced, "tennis courts not fenced all round")]
    return [m for m in out if m]


@test(29, "goals and rugby posts are 531, never 528")
def t29(M):
    bad = [rp(g) for g in M.gs("528")]
    out = [fail_list(bad, "528 objects")]
    sp = M.src("sports.json") or []
    pitches = [shapely.make_valid(Polygon(pl[0], pl[1:])) for s in sp if s.get("sport") in ("soccer", "rugby") for pl in s["polys"]]
    pitches = [p for p in pitches if M.box.contains(p.representative_point()) and p.area > 2000]
    if pitches and not any(p.buffer(10).contains(g) for p in pitches for g in M.gs("531")):
        out.append(f"{len(pitches)} pitches and no 531 on any")
    return [m for m in out if m]


@test(30, "helpers (990, 991, 993, 995) are never printed")
def t30(M):
    raise Skip("a property of the exports (virtually.js, thumb.mjs, Cartographier's print), not of the objects")


@test(31, "OSM's wetland is 308; its water areas join BD TOPO's (not a dry basin)")
def t31(M):
    wet = osm_polys(M, lambda t: t.get("natural") == "wetland")
    if wet is None:
        raise Skip("no src/osm.json")
    W = M.union("308", "301", "301.9")                                # (a reedbed under a pond's water is the pond)
    miss = [rp(p.intersection(M.box)) for p in wet if p.intersection(M.box).area > 50 and
            p.intersection(M.box).intersection(W).area / p.intersection(M.box).area < 0.5]
    water = osm_polys(M, lambda t: (t.get("natural") == "water" or t.get("landuse") == "reservoir")
                      and t.get("basin") not in ("detention", "infiltration") and t.get("intermittent") != "yes")
    A = M.union("301", "301.9", "302")
    dry = [rp(p.intersection(M.box)) for p in water if p.intersection(M.box).area > 50 and
           p.intersection(M.box).intersection(A).area / p.intersection(M.box).area < 0.5]
    out = [fail_list(miss, "OSM wetlands not drawn as 308"), fail_list(dry, "OSM water areas not drawn as water")]
    return [m for m in out if m]


# ---- the known places in Gif
@test(32, "Chemin du Bras Mort under Rue Alphonse Pécard: 512.1 at both mouths, 512.2, 512.3")
def t32(M):
    if not M.box.contains(Point(636420, 6844813)):
        raise Skip("not Gif")
    z = M.near(636420, 6844813, 30)
    n = {c: len([g for g in M.gs(c) if g.intersects(z)]) for c in ("512.1", "512.2", "512.3")}
    out = []
    if n["512.1"] < 2:
        out.append(f"{n['512.1']} 512.1 at the Bras Mort passage, two mouths expected")
    if n["512.3"] < 1:
        out.append("no 512.3 over the Bras Mort passage")
    if n["512.2"] < 1:
        out.append("no 512.2 along the Bras Mort passage")
    return out


@test(33, "the station's pedestrian tunnel under the RER")
def t33(M):
    if not M.box.contains(Point(636508, 6844580)):
        raise Skip("not Gif")
    z = M.near(636508, 6844580, 35)
    n1 = len([g for g in M.gs("512.1") if g.intersects(z)])
    n3 = len([g for g in M.gs("512.3") if g.intersects(z)])
    return ([f"{n1} 512.1 at the station tunnel, two mouths expected"] if n1 < 2 else []) + \
        (["no 512.3 over the station tunnel"] if n3 < 1 else [])


@test(34, "the town hall lawns are open land")
def t34(M):
    if not M.box.contains(Point(636320, 6844960)):
        raise Skip("not Gif")
    z = M.near(636320, 6844960, 20)
    g = z.difference(M.local(["521"], z))
    s = g.intersection(M.local(["401", "402"], z)).area / max(g.area, 1)     # (402: its trees stand over the grass)
    return [] if s >= 0.4 else [f"the town hall lawns {s:.0%} open land"]


@test(35, "the long stairway between buildings: one 532 at least 10 m long, on paving")
def t35(M):
    if not M.box.contains(Point(636270, 6845045)):
        raise Skip("not Gif")
    z = M.near(636270, 6845045, 20)
    st = [g for c in [f"532.{i}" for i in range(1, 7)] for g in M.gs(c, otp=2) if g.intersects(z)]
    if not st or sum(g.length for g in st) < 10:
        return [f"the long stairway: {sum(g.length for g in st):.0f} m of stairway drawn"]
    P = M.local(["501"], z, pad=10)
    off = sum(g.difference(P.buffer(0.3)).length for g in st)
    return [f"the long stairway: {off:.1f} m off paving"] if off > 1.0 else []


# the owner, 2026-11-19: « a lot of information that is clean in OSM becomes wrongly distorted in this map … at a minimum, OSM
# information needs to be preserved, even if drawn with IOF symbols instead »
NATURAL = {"101", "102", "103", "301", "301.9", "302", "305", "306", "308", "401", "402", "403", "406", "408", "410", "411", "415"}


@test(36, "curves stay on their lines: a Bézier segment within 0.3 m of its chord on man-made features, 1 m on natural ones")
def t36(M):
    bad = []
    for o in M.doc["objects"]:
        tol = 1.05 if code(o["sym"]) in NATURAL else 0.35
        for r in o.get("bez") or []:
            i = 0
            while i + 3 < len(r):
                if len(r[i + 1]) > 2 and r[i + 1][2] == 1:
                    a, b, c, e = (np.asarray(q[:2], float) for q in r[i:i + 4])
                    ch = e - a; L = float(np.hypot(*ch))
                    t = np.linspace(0, 1, 17)[1:-1, None]; u = 1 - t
                    pts = u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * e
                    if L > 1e-9:
                        q = np.clip(((pts - a) @ ch) / (L * L), 0, 1)[:, None]
                        dv = float(np.max(np.hypot(*(pts - a - q * ch).T))) * M.k
                    else:
                        dv = float(np.max(np.hypot(*(pts - a).T))) * M.k
                    if dv > tol:
                        bad.append(Point(*(a * M.k + (M.cx, M.cy))))
                    i += 3
                else:
                    i += 1
    return [m for m in [fail_list(bad, f"curve segments straying off their chord")] if m]


@test(37, "OpenStreetMap's ways are on the map with a fitting symbol: 98 % of their length, each kind 95 %")
def t37(M):
    d = M.src("osm.json")
    if d is None:
        raise Skip("no src/osm.json")
    from l93 import transformer
    tr = transformer(4326, 2154)
    paved_s = {"asphalt", "paved", "concrete", "paving_stones", "sett", "cobblestone", "concrete:plates", "metal", "wood",
               "unhewn_cobblestone", "bricks", "compacted", "fine_gravel"}
    pave = shapely.make_valid(unary_union(M.gs("501", "501.3", "501.4", otp=3) + [g.buffer(0.8) for g in M.gs("501.1", otp=2)]))
    path = unary_union([pave] + [g.buffer(0.8) for g in M.gs("505", "506", "507", "508", otp=2)])
    stair = unary_union([pave] + [g.buffer(0.5) for c in [f"532.{i}" for i in range(1, 7)] for g in M.gs(c)])
    wall = unary_union([g.buffer(0.8) for g in M.gs("513", "513.1", "513.2", "515", "516", "517", "518", "519", otp=2)]
                       + [M.union("521").buffer(0.8)])
    hedge = unary_union([M.union("520"), M.union("411")] + [g.buffer(0.8) for g in M.gs("411", otp=2)])
    water = unary_union([M.union("301").buffer(4.0)] + [g.buffer(6.0) for g in M.gs("305", "306", otp=2)])   # (BD TOPO's lie metres off OSM's)
    for g_ in (pave, path, stair, wall, hedge, water):
        shapely.prepare(g_)
    frame = M.box.buffer(-5)
    olive_in = M.union("520").buffer(0.5)
    res, worst = {}, []
    for e in d.get("elements", []):
        t = e.get("tags") or {}; geo = e.get("geometry")
        if e.get("type") != "way" or not geo or len(geo) < 2:
            continue
        if t.get("tunnel") in ("yes", "culvert", "building_passage") or t.get("covered") == "yes" \
                or str(t.get("layer", "0")).startswith("-") or t.get("area") == "yes" or t.get("indoor") == "yes" \
                or t.get("access") in ("private", "no"):
            continue
        hw, bar, ww = t.get("highway"), t.get("barrier"), t.get("waterway")
        if hw == "steps":
            kind, ok = "steps", stair
        elif hw in ("footway", "path", "cycleway", "bridleway", "track", "pedestrian", "service", "residential", "living_street",
                    "unclassified", "tertiary", "secondary", "primary", "trunk"):
            p = t.get("surface") in paved_s or t.get("tracktype") == "grade1" or (t.get("surface") is None and hw not in ("path", "track", "bridleway"))
            kind, ok = ("paved " if p else "unpaved ") + ("way" if hw in ("footway", "path", "cycleway", "bridleway", "track", "pedestrian") else "street"), pave if p else path
        elif bar in ("wall", "retaining_wall", "fence", "city_wall"):
            kind, ok = "wall or fence", wall
        elif bar == "hedge":
            kind, ok = "hedge", hedge
        elif ww in ("stream", "river", "ditch", "drain", "canal"):
            kind, ok = "watercourse", water
        else:
            continue
        xs, ys = tr.transform([p["lon"] for p in geo], [p["lat"] for p in geo])
        L = LineString(list(zip(xs, ys))).intersection(frame)
        if hw:                                             # what lies in ground not to be entered is not mapped (ISSprOM 520): a house's drive
            L = L.difference(olive_in)
        if L.is_empty or L.length < 1:
            continue
        try:
            okl = shapely.clip_by_rect(ok, *L.buffer(3).bounds)
        except shapely.errors.GEOSException:                # (GEOS's fast clip can leave a ring of three points: the exact one)
            okl = ok.intersection(sbox(*L.buffer(3).bounds))
        shown = L.intersection(okl).length
        r = res.setdefault(kind, [0.0, 0.0]); r[0] += L.length; r[1] += shown
        if L.length - shown > 5:
            miss = L.difference(okl)
            worst.append((L.length - shown, kind, miss.representative_point() if not miss.is_empty else L.centroid))
    msgs = []
    tot, sh = sum(v[0] for v in res.values()), sum(v[1] for v in res.values())
    if tot and sh / tot < 0.98:
        msgs.append(f"{100 * sh / tot:.1f} % of OSM's ways shown (98 % at least)")
    for k_, (ln, s_) in sorted(res.items()):
        if ln > 100 and s_ / ln < 0.95:
            msgs.append(f"{k_}: {100 * s_ / ln:.1f} % of {ln:.0f} m shown")
    if msgs:
        worst.sort(key=lambda w: -w[0])
        msgs.append("most missing: " + "; ".join(f"{k_} {m:.0f} m at E {p.x:.0f} N {p.y:.0f}" for m, k_, p in worst[:5]))
    return msgs


def run(M, only=None):
    res = {}
    for n in sorted(T):
        if only and n not in only:
            continue
        title, f = T[n]
        t0 = time.monotonic()
        try:
            msgs = f(M)
            res[n] = {"title": title, "status": "fail" if msgs else "ok", "msgs": msgs, "s": round(time.monotonic() - t0, 1)}
        except Skip as e:
            res[n] = {"title": title, "status": "skip", "msgs": [str(e)]}
    return res


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    a = sys.argv[1:]
    race = a[0]
    DATA = Path(os.environ.get("VIRTUAL_DATA") or HERE.parents[2] / "data" / "virtual")
    if not DATA.exists():
        sys.path.insert(0, str(HERE.parents[1])); DATA = Path(__import__("paths").DATA_DIR) / "virtual"
    rd = DATA / race
    mp = Path(a[a.index("--map") + 1]) if "--map" in a else rd / "map_objects.json"
    M = Map(mp, rd)
    if "--recheck" in a:
        import copy
        import legibility
        print("legibility check (minutes)…", flush=True)
        M.leg = legibility.check(copy.deepcopy(M.doc), fix=False, frame=M.box, log=lambda *x: None).json()
    else:
        M.leg = M.src("legibility.json") or {}
        if not M.leg:
            print("(no src/legibility.json: the tests that read it are skipped; --recheck runs the check)")
    only = {int(x) for x in a[a.index("--only") + 1].split(",")} if "--only" in a else None
    res = run(M, only)
    for n, r in res.items():
        mark = {"ok": "ok  ", "fail": "FAIL", "skip": "skip"}[r["status"]]
        print(f"{mark} {n:2d}. {r['title']}" + (f"  ({r['s']} s)" if r.get("s", 0) >= 5 else ""))
        for m in r["msgs"]:
            print(f"         {m}")
    nf = sum(1 for r in res.values() if r["status"] == "fail")
    print(f"{sum(1 for r in res.values() if r['status'] == 'ok')} ok, {nf} failed, "
          f"{sum(1 for r in res.values() if r['status'] == 'skip')} skipped")
    if "--json" in a:
        Path(a[a.index("--json") + 1]).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.exit(1 if nf else 0)


if __name__ == "__main__":
    main()
