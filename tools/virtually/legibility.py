"""The legibility check of a town sprint map (ISSprOM 2019-2), after OCAD's (since OCAD 2018): what the standard asks that the
generator may break, counted rule by rule with the first places in Lambert 93, and fixed where a fix is safe.

  py legibility.py <race> [--fix] [--in FILE] [--out FILE]     DATA/<race>/map_objects.json, the report DATA/<race>/src/legibility.json

town_map.py runs it on its objects before writing them (`check(doc, fix=True)`), so every town map — Pixel's races and
Cartographier's « Plan de ville (sprint) » — comes out checked. The rules (symbols, the 0.4 mm gap…) are
site/assets/js/mapper/sets/legibility.json, which Cartographier's checks (mapper/checks.js) read too; the minimum sizes per symbol
are minimums.json's (docs/mapper/sets.mjs, from the specification).

The rules, and what is fixed (with fix: two passes — a fix can leave a scrap the second takes —, then a plain check, so that
the report says what is really left; about 3.5 min on Gif's 1.4 km²):
- gap: two impassable features (buildings, uncrossable walls and fences, 520 olive, 411, water, 709) less than 0.4 mm apart
  (1.6 m at 1:4000; under 0.02 mm they touch: OCAD's grid is 0.01 mm) — the specification: closed or widened. Closed: a wall's or
  fence's end drawn on to what lies straight ahead of it (one beside it is reported: drawn sideways it made zigzags of short
  parallel pieces), the gap between areas filled with the area's symbol (two buildings: one building; olive on either side:
  olive) — long gaps by a closing, two corners near each other by the hull of their near parts; a gap a path, stairway or passage
  runs through is left for the mapper to widen (`gap_way`); the wedge where two features meet at an angle is a dead end, not a
  gap; a notch or a hole narrower than 0.4 mm in one feature is filled (`notch`); a bridge's sides, two short 515 lines along a
  deck (`decks`, else found by their shape: `bridge_sides`), are no gap;
- width / sliver: an area's part narrower than its symbol's minimum width (minimums.json, else 0.3 mm), and the white strips left
  between areas: a runnable area's strip goes to the neighbour sharing most of its edge, an impassable one (olive, 411, water) is
  widened to its minimum; a building's narrow part is reported only;
- area: an area under its symbol's minimum area: given to its neighbour (a building: reported);
- length: a line under its symbol's minimum length (reported);
- contour_end: a contour that ends in the open, not at a stairway or the map's edge (reported: the mapper's « not allowed »; a
  contour runs through the buildings and across the streets, and is cut only where it crosses a stairway — ISSprOM);
- overlap: a line (path, wall, fence, stream, edge) or a point (tree, monument) inside a building — cut out or dropped —, two
  point symbols drawn over each other (the smaller tree dropped), the LiDAR's vegetation over an area with a vector source
  (cut), any other two ground areas over each other (reported);
- bridge: 512.1 anywhere but at a passage's mouth (reported);
- stairs: a stairway not standing on paving: the paving drawn under it at its width;
- path_paved: a path (505, 506, a paved footway 501.6-501.9) drawn on paving: cut there.
Not yet redrawn after a fix: the paved area's edge (501.1) and the 995 boundaries keep their place where an area moved."""
import json, math, os, re, sys, time
from pathlib import Path

import numpy as np
import shapely
import shapely.ops
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box as sbox
from shapely.ops import unary_union as _union


def unary_union(geoms):
    """shapely's, made tolerant: a geometry left invalid by a fix (a hole touching its shell) is made valid, else everything is
    snapped to a 1 cm grid — one bad piece must not stop a town's map."""
    geoms = [g for g in geoms if g is not None]
    try:
        return _union(geoms)
    except shapely.errors.GEOSException:
        geoms = [shapely.make_valid(g) for g in geoms]
        try:
            return _union(geoms)
        except shapely.errors.GEOSException:
            return shapely.union_all(geoms, grid_size=0.01)

HERE = Path(__file__).resolve()
SETS = HERE.parents[2] / "site" / "assets" / "js" / "mapper" / "sets"
RULES = json.load(open(SETS / "legibility.json", encoding="utf-8"))
SHOW = 5                                                       # places printed per rule


def catalogue(std):
    """The specification's rule catalogue (docs/mapper/standards.py) and its minimum sizes {code: {width|area|length: mm}}."""
    cat = json.load(open(SETS / RULES["catalogues"][std], encoding="utf-8"))
    cat["key"] = std
    mins_ = {}
    for r in cat["rules"]:
        if "value" in r and r["sym"]:
            mins_.setdefault(r["sym"][0], {})[r["check"]] = r["value"]
    return cat, mins_


STD = "issprom2019-2"
CAT, MINS = catalogue(STD)


def code(sym):
    n, sub = divmod(int(sym), 1000)
    return f"{n}.{sub}" if sub else f"{n}"


def sym_of(c):
    n, _, sub = c.partition(".")
    return int(n) * 1000 + (int(sub) if sub else 0)


def mins(c):
    """A symbol's minimums (map mm), its own or its main number's."""
    return MINS.get(c) or MINS.get(c.split(".")[0]) or {}


def as_lines(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "LineString":
        return [g]
    if g.geom_type in ("MultiLineString", "GeometryCollection"):
        return [x for p in g.geoms for x in as_lines(p)]
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return as_lines(g.boundary)
    return []


def as_polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    if hasattr(g, "geoms"):
        return [x for p in g.geoms for x in as_polys(p)]
    return []


class Local:
    """Polygons indexed: the union of those near a geometry, not a whole class's (a town's paving is one huge polygon)."""
    def __init__(self, geoms):
        self.g = [q for g in geoms for p in as_polys(g) for q in as_polys(shapely.make_valid(p))]
        self.t = shapely.STRtree(self.g) if self.g else None

    def at(self, geom, pad=0.0, margin=3.0):
        """The polygons within `pad` of geom, cut to its box widened by pad + margin (an inward buffer of the result is right
        within `margin` of that box's edge)."""
        if self.t is None:
            return Polygon()
        x0, y0, x1, y1 = geom.bounds
        m = pad + margin
        ix = self.t.query(sbox(x0 - pad, y0 - pad, x1 + pad, y1 + pad))
        if not len(ix):
            return Polygon()
        parts = []
        for i in ix:
            try:
                parts.append(shapely.clip_by_rect(self.g[i], x0 - m, y0 - m, x1 + m, y1 + m))
            except shapely.errors.GEOSException:
                parts.append(self.g[i].intersection(sbox(x0 - m, y0 - m, x1 + m, y1 + m)))
        return shapely.make_valid(unary_union([q for q in parts if not q.is_empty]))


def opened_away(U, w):
    """The parts of U narrower than w (an opening by w/2, polygon by polygon)."""
    out = []
    for p in as_polys(U):
        if p.area < 0.3:
            continue
        o = p.buffer(-w / 2).buffer(w / 2)
        r = p.difference(o) if not o.is_empty else p
        out += as_polys(r)
    return out


def bridge_sides(by, decks=None):
    """The indexes of the 515 objects that are a bridge's sides: along a deck when the generator gives them, else two
    near-parallel 515 lines 1-6 m apart with water, a stream or the railway by them."""
    walls = [f for f in by.get(RULES["bridgeSides"]["line"], []) if f["otp"] == 2]
    if decks is not None and not getattr(decks, "is_empty", True):
        near = decks.buffer(1.0)
        return {f["i"] for f in walls if f["g"].intersection(near).length >= 0.5 * f["g"].length}
    lows = unary_union([f["g"] for c in RULES["bridgeSides"]["low"] for f in by.get(c, []) if f["g"] is not None])
    if lows.is_empty or not walls:
        return set()
    lo, hi = RULES["bridgeSides"]["apartM"]
    tree = shapely.STRtree([f["g"] for f in walls])
    out = set()

    def heading(g):
        (x0, y0), (x1, y1) = g.coords[0], g.coords[-1]
        return math.atan2(y1 - y0, x1 - x0)

    for j, f in enumerate(walls):
        if f["g"].length > RULES["bridgeSides"]["maxLengthM"] or f["g"].distance(lows) > 3.0:
            continue
        for m in tree.query(f["g"].buffer(hi)):
            g = walls[m]
            if m == j or g["g"].length > RULES["bridgeSides"]["maxLengthM"]:
                continue
            d = f["g"].distance(g["g"])
            a = abs((heading(f["g"]) - heading(g["g"]) + math.pi / 2) % math.pi - math.pi / 2)
            if lo <= d <= hi and a < math.radians(25) and g["g"].distance(f["g"].centroid) <= hi + 1:
                out |= {f["i"], g["i"]}
    return out


def overlaps(cover, codes_a, codes_b, min_area=0.05):
    """The pieces where an area of codes_a lies over one of codes_b: {(a, b): [polygons]} (an index, not whole-class
    intersections)."""
    polys, owner = [], []
    for c in set(codes_a) | set(codes_b):
        for p in as_polys(cover[c]):
            polys.append(p); owner.append(c)
    if not polys:
        return {}
    tree = shapely.STRtree(polys)
    out = {}
    ia, ib = tree.query(polys, predicate="intersects")
    for i, j in zip(ia, ib):
        a, b = owner[i], owner[j]
        if i >= j or a == b:
            continue
        if a not in codes_a or b not in codes_b:
            if b in codes_a and a in codes_b:
                a, b, i, j = b, a, j, i
            else:
                continue
        try:
            x = polys[i].intersection(polys[j])
        except shapely.errors.GEOSException:
            x = shapely.make_valid(polys[i]).intersection(shapely.make_valid(polys[j]))
        for q in as_polys(x):
            if q.area >= min_area:
                out.setdefault((a, b), []).append(q)
    return out


CODE_RE = re.compile(r"^(\d{3}(?:\.\d)?)(?![\d.])")


def entry_of(cat, rule, code_=None):
    """The catalogue entry a finding belongs to: its symbol's own (a minimum size), else the rule's general one."""
    cands = [r for r in cat["rules"] if r["check"] == rule]
    if code_:
        own = [r for r in cands if code_ in r["sym"]]
        mins_ = [r for r in own if ".min." in r["id"]]
        if mins_ or own:
            return (mins_ or own)[0]
    gen = [r for r in cands if ".min." not in r["id"]]
    return (gen or cands or [None])[0]


class Report:
    """Findings by check (`rule`), each filed under its catalogue entry; `gate` counts what is left by severity."""
    def __init__(self, cat=None):
        self.found, self.fixed, self.cat = {}, {}, cat or CAT

    def add(self, rule, g, detail="", code=None):
        p = g.representative_point() if not isinstance(g, Point) else g
        if code is None:
            m = CODE_RE.match(detail)
            code = m.group(1) if m else None
        self.found.setdefault(rule, []).append({"at": [round(p.x, 1), round(p.y, 1)], "detail": detail, "code": code})

    def fix(self, rule, n=1):
        self.fixed[rule] = self.fixed.get(rule, 0) + n

    def entries(self):
        """{entry id: {entry, left: [places], fixed}}; findings with no entry under « check:<rule> »."""
        out = {}
        for rule, items in self.found.items():
            for it in items:
                e = entry_of(self.cat, rule, it.get("code"))
                key = e["id"] if e else f"check:{rule}"
                out.setdefault(key, {"entry": e, "rule": rule, "left": [], "fixed": 0})["left"].append(it)
        for rule, n in self.fixed.items():
            e = entry_of(self.cat, rule)
            key = e["id"] if e else f"check:{rule}"
            out.setdefault(key, {"entry": e, "rule": rule, "left": [], "fixed": 0})["fixed"] += n
        return out

    def gate(self):
        g = {"error": 0, "warn": 0, "info": 0}
        for v in self.entries().values():
            g[(v["entry"] or {}).get("sev", "warn")] += len(v["left"])
        g["publishable"] = g["error"] == 0
        return g

    def lines(self):
        out = []
        ents = self.entries()
        for key in sorted(ents, key=lambda k: ({"error": 0, "warn": 1}.get((ents[k]["entry"] or {}).get("sev"), 2), k)):
            v = ents[key]
            e = v["entry"] or {}
            out.append(f"  {key:28s} {e.get('sev', '?'):5s} {len(v['left']):5d} left" + (f", {v['fixed']} fixed" if v["fixed"] else "")
                       + (f"   ({e.get('ref', '')})" if e else ""))
            for it in v["left"][:SHOW]:
                out.append(f"      E {it['at'][0]:.0f} N {it['at'][1]:.0f}  {it['detail']}")
        g = self.gate()
        out.append(f"  gate: {g['error']} errors, {g['warn']} warnings -> " + ("publishable" if g["publishable"]
                                                                                 else "NOT publishable unless listed"))
        return out

    def json(self):
        ents = self.entries()
        return {"standard": self.cat["standard"], "set": self.cat.get("key", STD), "gate": self.gate(),
                "entries": {k: {"ref": (v["entry"] or {}).get("ref"), "sev": (v["entry"] or {}).get("sev", "warn"),
                                "kind": (v["entry"] or {}).get("kind"), "en": (v["entry"] or {}).get("en"),
                                "fr": (v["entry"] or {}).get("fr"), "check": v["rule"], "left": len(v["left"]),
                                "fixed": v["fixed"], "places": v["left"]} for k, v in ents.items()},
                "rules": {r: {"left": len(self.found.get(r, [])), "fixed": self.fixed.get(r, 0), "places": self.found.get(r, [])}
                          for r in sorted(set(self.found) | set(self.fixed))},
                "planned": [r["id"] for r in self.cat["rules"] if r.get("status") == "planned"],
                "manual": [r["id"] for r in self.cat["rules"] if r["kind"] == "manual"]}


def check(doc, fix=False, frame=None, log=print, passes=2, decks=None):
    """Checks a map_objects.json document; with fix, mends it in place in up to `passes` passes (a fix can leave a scrap the
    next one takes), then checks it once more so that the report says what is really left. decks: the bridges' decks (Lambert
    93), whose sides the generator draws as 515 (ISSprOM: « a simple bridge, which cannot be passed underneath, shall be
    represented using symbol Uncrossable wall »); without them, two near-parallel 515 lines 1-6 m apart by water, a stream or the
    railway are taken for a bridge's sides (as Cartographier's checks do)."""
    total = {}
    rep = None
    n = 0
    while n < (passes if fix else 1):
        rep = _once(doc, fix, frame, log, f"pass {n + 1}" if fix else "check", areas_only=n > 0, decks=decks)
        for r, v in rep.fixed.items():
            total[r] = total.get(r, 0) + v
        if not fix or sum(rep.fixed.values()) == 0:
            break
        n += 1
        if n >= passes and rep.fixed.get("enclosed"):      # (ground turned 520 by a pass on areas alone: one full pass more, to
            rep = _once(doc, fix, frame, log, f"pass {n + 1}", decks=decks)   # take out what lies inside it)
            for r, v in rep.fixed.items():
                total[r] = total.get(r, 0) + v
            break
    if fix and sum(rep.fixed.values()):
        rep = _once(doc, False, frame, log, "check", decks=decks)
    rep.fixed = total
    return rep


def _once(doc, fix, frame, log, what, areas_only=False, decks=None):
    """Checks (and with fix, mends) a map_objects.json document in place; returns the Report. Coordinates in map mm about
    doc['realWorld']; frame: the map's box in Lambert 93 (default the extent of its areas)."""
    k = doc["scale"] / 1000.0                                  # metres a map mm
    cx, cy = doc["realWorld"]["x"], doc["realWorld"]["y"]
    to_m = lambda pts: [(cx + x * k, cy + y * k) for x, y in pts]
    to_mm = lambda g: [[round((x - cx) / k, 3), round((y - cy) / k, 3)] for x, y in g.coords]
    std = "isom2017-2" if str(doc.get("set", "")).startswith("isom") else "issprom2019-2"
    cat, MINS_ = catalogue(std)
    mins = lambda c: MINS_.get(c) or MINS_.get(c.split(".")[0]) or {}
    rep = Report(cat)
    objs = doc["objects"]
    t0 = time.time()
    step = lambda st: log(f"  legibility {what} [{time.time() - t0:5.1f}s] {st}") if log else None
    helpers = set(RULES["helpers"])

    # ---- the objects as geometries in metres
    F = []
    for i, o in enumerate(objs):
        c = code(o["sym"])
        try:
            if o["otp"] == 3:
                g = shapely.make_valid(Polygon(to_m(o["rings"][0]), [to_m(r) for r in o["rings"][1:] if len(r) >= 3]))
            elif o["otp"] == 2:
                g = LineString(to_m(o["rings"][0])) if len(o["rings"][0]) >= 2 else None
            else:
                g = Point(to_m(o["rings"][0])[0])
        except Exception:
            g = None
        F.append({"i": i, "c": c, "otp": o["otp"], "g": g})
    by = {}
    for f in F:
        if f["g"] is not None and not f["g"].is_empty:
            by.setdefault(f["c"], []).append(f)
    cover_codes = RULES["cover"]
    cover = {c: unary_union([f["g"] for f in by.get(c, []) if f["otp"] == 3]) for c in cover_codes + ["709"]}
    if frame is None:
        frame = sbox(*unary_union([g for g in cover.values() if not g.is_empty]).bounds)
    elif not hasattr(frame, "geom_type"):
        frame = sbox(*frame)
    changed = set()                                            # area codes rewritten from `cover`
    drop = set()                                               # indexes of objects removed or replaced
    new = []                                                   # objects added

    gap_m = RULES["gap"]["mm"] * k
    touch_m = RULES["gap"].get("touchMm", 0.02) * k               # closer: touching (OCAD's grid is 0.01 mm)
    gap_areas, gap_lines = RULES["gap"]["areas"], RULES["gap"]["lines"]
    hw = {c: RULES["gap"]["lineWidthMm"].get(c, 0.4) * k / 2 for c in gap_lines}
    ways = RULES["gap"]["ways"]
    WAYS = unary_union([f["g"] for c in ways for f in by.get(c, [])])
    PASS = unary_union([f["g"] for f in by.get(RULES["passage"], [])])
    ground = [c for c in cover_codes if c != "521"]
    impassable_ground = ("301", "411", "520")

    def line_feats(codes):
        return [f for c in codes for f in by.get(c, []) if f["otp"] == 2 and f["i"] not in drop]

    def set_line(f, g, rule):
        """Replaces a line object by `g`'s pieces (none: removed)."""
        o = objs[f["i"]]
        drop.add(f["i"])
        mn = 1.0 if f["c"] not in ("505", "506") else 3.0
        for l in as_lines(g):
            if l.length >= mn:
                n = {**o, "rings": [to_mm(l)]}
                n.pop("bez", None)                                 # (a map already curved: the piece goes straight)
                if o.get("curve") and len(l.coords) < 3:
                    n.pop("curve", None)
                new.append(n)

    step("loaded")
    # ---- 1. gap: a wall's or fence's end drawn on to what it stops short of
    def printed(f):
        return f["g"].buffer(hw[f["c"]], cap_style="flat") if f["otp"] == 2 else f["g"]

    # a bridge's sides (two short 515 lines over the water, a stream or the railway it crosses) are no gap to close: left out
    sides = bridge_sides(by, decks)
    imp = [f for c in gap_areas for f in by.get(c, []) if f["otp"] == 3] + [f for f in line_feats(gap_lines) if f["i"] not in sides]
    imp_g = [printed(f) for f in imp]
    # ---- 1a. holes narrower than the gap in an impassable area (what a merge left): filled; a building's holes (a courtyard
    # nothing opens: ISSprOM 520, 521 « areas totally contained within a building are part of the building ») too
    OPENS = unary_union([PASS, WAYS.buffer(0.5) if not WAYS.is_empty else Polygon()]
                        + [f["g"] for f in by.get("522", []) if f["otp"] == 3])
    for j, f in enumerate(imp):
        if f["otp"] != 3:
            continue
        holes, keep = [], []
        for p in as_polys(f["g"]):
            kept = []
            for ring in p.interiors:
                h = Polygon(ring)
                # (a hole under 0.1 m² is the rounding's, below OCAD's grid: dropped, not counted)
                if 0 < h.area < 0.1:
                    if fix:
                        holes.append(h)
                    continue
                narrow = h.area > 0 and h.buffer(-gap_m / 2).is_empty
                courtyard = f["c"] == "521" and h.area > 0 and not narrow and (OPENS.is_empty or not OPENS.intersects(h))
                if courtyard and not fix:
                    rep.add("building_hole", h, f"521 a courtyard of {h.area:.0f} m² inside a building")
                    kept.append(h)
                    continue
                (holes if narrow or courtyard else kept).append(h if h.area > 0 else ring)
            keep.append((p, kept))
        if not holes:
            continue
        if fix:
            f["g"] = shapely.make_valid(unary_union([shapely.make_valid(Polygon(p.exterior, [h.exterior for h in kept if hasattr(h, "exterior")]))
                                                     for p, kept in keep]))
            imp_g[j] = f["g"]
            cover[f["c"]] = unary_union([cover[f["c"]]] + [h.buffer(0.05) for h in holes]); changed.add(f["c"])
            wide = [h for h in holes if not h.buffer(-gap_m / 2).is_empty]
            rep.fix("notch", sum(1 for h in holes if h.area >= 0.1) - len(wide))
            if wide:
                rep.fix("building_hole", len(wide))
        else:
            for h in holes:
                rep.add("notch", h, f"a hole of {h.area:.1f} m² in {f['c']}", code="")
    # the areas cut into 25 m tiles for the search: a merged olive or paving is one polygon of thousands of points (pieces of
    # one feature touch, so they never make a gap between them)
    tiles = []
    for f, g in zip(imp, imp_g):
        if f["otp"] == 3 and g.area > 625:
            x0, y0, x1, y1 = g.bounds
            for tx in range(int((x1 - x0) // 25) + 1):
                for ty in range(int((y1 - y0) // 25) + 1):
                    q = shapely.clip_by_rect(g, x0 + tx * 25, y0 + ty * 25, x0 + (tx + 1) * 25, y0 + (ty + 1) * 25)
                    tiles += [(f, x) for x in as_polys(q)]
        else:
            tiles.append((f, g))
    imp, imp_g = [f for f, _ in tiles], [g if g.is_valid else shapely.make_valid(g) for _, g in tiles]
    tree = shapely.STRtree(imp_g)
    for j, f in enumerate(imp):
        if f["otp"] != 2:
            continue
        cs = list(f["g"].coords)
        moved = False
        for end in (0, -1):
            p = Point(cs[end])
            best = None
            for m in tree.query(p.buffer(gap_m + hw[f["c"]])):
                if m == j:
                    continue
                d = imp_g[m].distance(p)
                if touch_m < d < gap_m and (best is None or d < best[0]):
                    best = (d, m)
            if best is None:
                continue
            tgt = imp[best[1]]["g"] if imp[best[1]]["otp"] == 2 else imp_g[best[1]]
            q = shapely.ops.nearest_points(tgt.boundary if tgt.geom_type in ("Polygon", "MultiPolygon") else tgt, p)[0]
            seg = LineString([cs[end], (q.x, q.y)])
            # only straight on: a wall drawn sideways on to its neighbour makes a zigzag (short parallel pieces)
            prev = cs[1] if end == 0 else cs[-2]
            ux, uy = cs[end][0] - prev[0], cs[end][1] - prev[1]
            vx, vy = q.x - cs[end][0], q.y - cs[end][1]
            nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
            if nv > 0.02 and (nu < 1e-6 or (ux * vx + uy * vy) / (nu * nv) < 0.7):
                rep.add("gap", seg, f"{f['c']} end {best[0]:.1f} m from {imp[best[1]]['c']}, beside it")
                continue
            if not WAYS.is_empty and seg.intersects(WAYS):
                rep.add("gap_way", seg, f"{f['c']} end {best[0]:.1f} m from {imp[best[1]]['c']}, a way between")
                continue
            if fix:
                cs = [(q.x, q.y)] + cs if end == 0 else cs + [(q.x, q.y)]
                moved = True
                rep.fix("gap")
            else:
                rep.add("gap", seg, f"{f['c']} end {best[0]:.1f} m from {imp[best[1]]['c']}")
        if moved:
            f["g"] = LineString(cs)
            set_line(f, f["g"], "gap")
            imp_g[j] = printed(f)

    step("line ends")
    # ---- 1b. gap and notch between areas (and lines' sides): closing by half the gap
    I = unary_union(imp_g)
    r = gap_m / 2
    G = I.buffer(r).buffer(-r).difference(I).intersection(frame)
    tree = shapely.STRtree(imp_g)
    fills = {}
    def wedge(comp, touch):
        zone = comp.buffer(3 * gap_m)
        parts = [(imp[m]["i"], imp_g[m].intersection(zone)) for m in touch]
        for u in range(len(parts)):
            for v in range(u + 1, len(parts)):
                if parts[u][0] != parts[v][0] and not parts[u][1].is_empty and not parts[v][1].is_empty                         and parts[u][1].distance(parts[v][1]) <= touch_m:
                    return True
        return False

    # the closing bridges long gaps (a fence along a building); two corners near each other it barely touches: there, the
    # convex hull of both features' parts by their nearest points, less what is impassable already
    bridges = []
    done_pairs = set()
    for j, a in enumerate(imp_g):
        for m in tree.query(a.buffer(gap_m)):
            if m <= j or (j, m) in done_pairs:
                continue
            b = imp_g[m]
            dd = a.distance(b)
            if not (touch_m < dd < gap_m):
                continue
            done_pairs.add((j, m))
            p, q = shapely.ops.nearest_points(a, b)
            disk = LineString([p, q]).buffer(max(0.8, dd))
            bridges.append(shapely.make_valid(unary_union([a.intersection(disk), b.intersection(disk)])).convex_hull)
    if bridges:
        loose = []
        for x in bridges:
            x = shapely.make_valid(x)
            near_ = [imp_g[m] for m in tree.query(x)]
            loose.append(x.difference(unary_union(near_)) if near_ else x)
        G = unary_union([G] + loose).intersection(frame)
    for comp in as_polys(G):
        if comp.area < 0.02:
            continue
        touch = [m for m in tree.query(comp.buffer(0.05)) if imp_g[m].distance(comp) < 0.05]
        codes_t = {imp[m]["c"] for m in touch}
        feats_t = {imp[m]["i"] for m in touch}
        kind = "notch" if len(feats_t) <= 1 else "gap"
        # a notch in one feature counts from 0.3 m² (the closing also rounds every inner corner a little); a wedge between two
        # features however small (an olive's corner 0.8 m from a building)
        if kind == "notch" and (comp.area < 0.3 or comp.buffer(-0.05).is_empty):
            continue
        # the wedge where two features meet at an angle is a dead end, not a passage: no gap when they touch near it
        if kind == "gap" and wedge(comp, touch):
            continue
        if not WAYS.is_empty and comp.intersects(WAYS):
            rep.add("gap_way", comp, f"{kind} between {'/'.join(sorted(codes_t))}, a way through")
            continue
        areas_t = codes_t & set(gap_areas)
        fill = next((c for c in ("520", "521", "411", "709", "301") if c in areas_t), None)
        if areas_t == {"521"}:
            fill = "521"
        if fill is None:
            rep.add(kind, comp, f"between {'/'.join(sorted(codes_t))}")
            continue
        if fix:
            fills.setdefault(fill, []).append(comp.buffer(0.05))     # over its neighbours' edges: no hairline once rounded
            rep.fix(kind)
        else:
            rep.add(kind, comp, f"{comp.area:.1f} m² between {'/'.join(sorted(codes_t))}")
    if fills:
        cut_ground = unary_union([g for c, gs in fills.items() if c not in ("521", "709") for g in gs])
        for c, gs in fills.items():
            cover[c] = unary_union([cover[c]] + gs); changed.add(c)
        if not cut_ground.is_empty:
            for c in ground:
                if c not in fills and not cover[c].is_empty and cover[c].intersects(cut_ground):
                    cover[c] = shapely.make_valid(cover[c]).difference(cut_ground); changed.add(c)

    step("gaps")
    # ---- 1c. ground areas over each other: the LiDAR's vegetation (401-410) gives way to what has a vector source (water, 411,
    # paving, olive) — as the generator means it; any other pair is reported below
    raster_c = [c for c in ground if c.startswith("4") and c != "411"]
    vector_c = ["301", "411", "501", "501.4", "520"]
    if fix:
        for (a, b), x in overlaps(cover, raster_c, vector_c).items():
            cover[a] = shapely.make_valid(cover[a]).difference(unary_union(x)); changed.add(a)
            rep.fix("combo", sum(1 for p in x if p.area >= 0.5))
    step("overlaps")
    # ---- 3b. ground no way reaches (ISSprOM 520: « areas entirely enclosed within uncrossable features should be filled with this
    # symbol »; 521: inside a building block, part of the building), once the gaps above are closed: the uncrossable areas and
    # lines cut the frame into pieces; a piece that does not reach the frame's edge becomes 520, or 521 when buildings make 85 %
    # of its edge (2026-11-14: courtyards whose 1.5 m entrance the gap fix had closed stayed paving)
    _bar = [cover[c] for c in ("521", "520", "411", "301", "709") if c in cover and not cover[c].is_empty]
    for c_, w_ in (("515", 0.4), ("518", 0.4), ("529", 0.4), ("509.1", 0.3)):
        _bar += [f["g"].buffer(w_ * k / 2, cap_style="flat") for f in line_feats([c_])]
    _opens = unary_union([PASS] + [f["g"] for c_ in ("522", "512.3") for f in by.get(c_, []) if f["otp"] == 3])
    BARR = shapely.make_valid(unary_union(_bar))
    if not _opens.is_empty:
        BARR = BARR.difference(_opens)
    _free = shapely.make_valid(frame.difference(BARR))
    _Bb = shapely.make_valid(cover["521"]).buffer(0.4) if not cover["521"].is_empty else Polygon()
    _ol, _bf = [], []
    for q in as_polys(_free):
        if q.area < 0.5 or q.distance(frame.exterior) <= 1.0:
            continue
        L_ = q.exterior.length
        to_b = L_ > 0 and not _Bb.is_empty and q.exterior.intersection(_Bb).length >= 0.85 * L_
        if fix:
            (_bf if to_b else _ol).append(q)
        else:
            rep.add("enclosed", q, f"{'521' if to_b else '520'} {q.area:.0f} m² no way reaches")
    if fix and (_ol or _bf):
        U_ = unary_union(_ol + _bf).buffer(0.02)
        for c_ in ground:
            if c_ in cover and c_ not in ("520",) and not cover[c_].is_empty and cover[c_].intersects(U_):
                cover[c_] = shapely.make_valid(cover[c_]).difference(U_); changed.add(c_)
        if _ol:
            cover["520"] = unary_union([cover["520"]] + [q.buffer(0.02) for q in _ol]); changed.add("520")
        if _bf:
            cover["521"] = unary_union([cover["521"]] + [q.buffer(0.02) for q in _bf]); changed.add("521")
        rep.fix("enclosed", len(_ol) + len(_bf))
        for f in by.get("522", []):                           # (a canopy over ground no way reaches: that ground's, not drawn)
            if f["otp"] == 3 and f["i"] not in drop and f["g"].area > 0 and f["g"].intersection(U_).area >= 0.5 * f["g"].area:
                drop.add(f["i"])
    step("enclosed")
    # ---- 2. width, slivers and small areas
    def width_of(c):
        return (mins(c).get("width") or RULES["minWidthDefaultMm"]) * k

    idx = {}

    def local(c, geom, pad=0.0):
        if c not in idx:
            idx[c] = Local([cover[c]])
        return idx[c].at(geom, pad)

    tiles_ = {"t": None}

    def tile_index():
        pieces, owner = [], []
        for d in ground + ["521"]:
            for q in as_polys(cover[d]):
                x0, y0, x1, y1 = q.bounds
                if (x1 - x0) * (y1 - y0) <= 2500:
                    pieces.append(q); owner.append(d)
                    continue
                for tx in range(int((x1 - x0) // 50) + 1):
                    for ty in range(int((y1 - y0) // 50) + 1):
                        try:
                            c_ = shapely.clip_by_rect(q, x0 + tx * 50, y0 + ty * 50, x0 + (tx + 1) * 50, y0 + (ty + 1) * 50)
                        except shapely.errors.GEOSException:
                            continue
                        for r_ in as_polys(c_):
                            pieces.append(r_); owner.append(d)
        tiles_["t"] = (shapely.STRtree(pieces) if pieces else None, pieces, owner)

    def neighbour(s, own):
        if tiles_["t"] is None:
            tile_index()
        tree, pieces, owner = tiles_["t"]
        if tree is None:
            return None
        ring = s.boundary
        acc = {}
        for i in tree.query(s.buffer(0.1)):
            d = owner[i]
            if d == own:
                continue
            l = ring.intersection(pieces[i].buffer(0.05)).length
            if l > 0:
                acc[d] = acc.get(d, 0) + l
        best = max(acc, key=acc.get) if acc else None
        return best if best and acc[best] > 0.02 else None

    moves = []                                                 # (sliver, from, to)
    widen = {}
    for c in ground + ["white"]:
        if c == "white":
            U = frame.difference(unary_union([cover[x] for x in cover_codes]))
        else:
            U = cover[c]
        if U.is_empty:
            continue
        w = width_of(c if c != "white" else "405")
        for s in opened_away(U, w * 0.95):
            if s.area < (0.05 if c == "white" else max(w * w * 0.6, 0.5)):
                continue
            if c == "white" and s.distance(frame.exterior) < 0.05:   # the map's edge, not a strip between areas
                continue
            rule = "sliver" if c == "white" else "width"
            if not fix:
                rep.add(rule, s, f"{c} {2 * s.area / max(s.length, 1e-6):.1f} m wide, minimum {w:.1f} m")
                continue
            if c in impassable_ground:
                est = 2 * s.area / max(s.length, 1e-6)
                widen.setdefault(c, []).append(s.buffer(max(0.0, (w - est) / 2 + 0.03)))
                rep.fix(rule)
                continue
            to = neighbour(s, c)
            if to is None:
                rep.add(rule, s, f"{c} {2 * s.area / max(s.length, 1e-6):.1f} m wide, no neighbour")
                continue
            moves.append((s, c, to)); rep.fix(rule)
    step("widths")
    # white openings (forest) under their minimum area: ISSprOM 405, 1 mm² — 0.5 mm² amid 401 or 408
    WHITE = frame.difference(unary_union([cover[x] for x in cover_codes]))
    for p in as_polys(WHITE):
        if p.area < 0.05 or p.area >= RULES["whiteMinMm2"] * k * k or p.distance(frame.exterior) < 0.05:
            continue
        to = neighbour(p, "white")
        thr = (RULES["whiteMinNearMm2"] if to in RULES["whiteNear"] else RULES["whiteMinMm2"]) * k * k
        if p.area >= thr:
            continue
        if fix and to:
            moves.append((p, "white", to)); rep.fix("white_area")
        elif not p.buffer(-RULES.get("crackMm", 0.05) * k / 2).is_empty:
            # (a crack between two areas that touch, narrower than a boundary line, prints as nothing: mended, not reported)
            rep.add("white_area", p, f"405 white opening {p.area:.1f} m², minimum {thr:.0f} m²")
    # areas under their minimum area
    for c in ground + ["521"]:
        a_min = mins(c).get("area")
        if not a_min or cover[c].is_empty:
            continue
        a_min *= k * k
        for p in as_polys(cover[c]):
            if p.area >= a_min or p.area < 0.1:                  # (under 0.1 m²: below OCAD's 0.01 mm grid, noise)
                continue
            to = neighbour(p, c) if fix and c != "521" else None
            if to is None:
                rep.add("area", p, f"{c} {p.area:.1f} m², minimum {a_min:.1f} m²")
                continue
            moves.append((p, c, to)); rep.fix("area")
    if fix and (moves or widen):
        add, sub = {}, {}
        for s, a, b in moves:
            add.setdefault(b, []).append(s)
            if a != "white":
                sub.setdefault(a, []).append(s)
        for c, gs in widen.items():
            add.setdefault(c, []).extend(gs)
            wg = unary_union(gs)
            for d in ground:
                if d != c and cover[d].intersects(wg):
                    sub.setdefault(d, []).append(wg)
        for c, gs in sub.items():
            cover[c] = shapely.make_valid(cover[c]).difference(unary_union(gs)); changed.add(c)
        for c, gs in add.items():
            cover[c] = unary_union([cover[c]] + gs); changed.add(c)
        idx.clear()
        tiles_["t"] = None

    step("areas")
    # ---- 3. stairways on paving; paths off it
    k_stairs = [c for c in by if c.split(".")[0] == RULES["stairs"]]
    paved_ways = unary_union([f["g"].buffer(max(0.7, 0.5 * {"501.6": 1.4, "501.7": 2, "501.8": 3, "501.9": 4}[c]))
                              for c in RULES["pavedWays"] for f in by.get(c, [])])
    PAVE = Local([cover[c] for c in RULES["paving"]] + [paved_ways, PASS])
    under = []
    for f in line_feats(k_stairs):
        sub = f["c"].split(".")[1] if "." in f["c"] else "0"
        wmm = [0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0][min(int(sub), 6)]
        g = f["g"]
        share = g.intersection(PAVE.at(g, 1).buffer(0.2)).length / max(g.length, 1e-6)
        if share >= RULES["stairsOnPavingShare"]:
            continue
        if fix:
            under.append(g.buffer(wmm * k / 2, cap_style="flat")); rep.fix("stairs")
        else:
            rep.add("stairs", g, f"{share:.0%} on paving")
    if under:
        U = unary_union(under).difference(local("521", unary_union(under))).intersection(frame)
        for c in ground:
            if c != "501" and not local(c, U).is_empty:
                cover[c] = shapely.make_valid(cover[c]).difference(U); changed.add(c); idx.pop(c, None)
        cover["501"] = unary_union([cover["501"], U]); changed.add("501"); idx.pop("501", None)
    PAVING = Local([cover[c] for c in RULES["paving"]])
    for f in line_feats(RULES["unpavedPaths"] + RULES["pavedWays"]):
        loc = PAVING.at(f["g"])
        if loc.is_empty:
            continue
        PAVE_IN = loc.buffer(-0.3)
        if not f["g"].intersects(PAVE_IN):
            continue
        on = f["g"].intersection(PAVE_IN).length
        if on < 1.0:
            continue
        if fix:
            set_line(f, f["g"].difference(PAVE_IN), "path_paved"); rep.fix("path_paved")
        else:
            rep.add("path_paved", f["g"].intersection(PAVE_IN), f"{f['c']} {on:.0f} m on paving")

    step("stairs and paths")
    # passes after the first mend the areas their fixes left (scraps, notches): the lines and points are done
    if not areas_only:
        # ---- 4. overlap: lines and points inside buildings, points over points, ground areas over each other
        B = cover["521"]
        BL = Local([B])
        PASS_B = PASS.buffer(0.5)

        def b_in(g):
            loc = BL.at(g)
            return loc.buffer(-0.3).difference(PASS_B) if not loc.is_empty else loc

        if not B.is_empty:
            for f in line_feats(RULES["notInBuildings"]):
                B_IN = b_in(f["g"])
                if f["i"] in drop or B_IN.is_empty or not f["g"].intersects(B_IN):
                    continue
                inside = f["g"].intersection(B_IN).length
                if inside < 0.5:
                    continue
                if fix:
                    set_line(f, f["g"].difference(B_IN), "overlap"); rep.fix("overlap")
                else:
                    rep.add("overlap", f["g"].intersection(B_IN), f"{f['c']} {inside:.1f} m inside a building")
            pts = [f for c in RULES["points"] for f in by.get(c, [])]
            for f in pts:
                if b_in(f["g"]).contains(f["g"]):
                    if fix and f["c"] in ("417", "418"):
                        drop.add(f["i"]); rep.fix("overlap")
                    else:
                        rep.add("overlap", f["g"], f"{f['c']} inside a building")
        step("lines in buildings")
        _sw = lambda f: [0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0][min(int(f["c"].split(".")[1]) if "." in f["c"] else 0, 6)]
        # nothing inside 520 but the very prominent (ISSprOM 520): lines cut, points dropped, sheds and hedges left out
        if not cover["520"].is_empty:
            OLI = shapely.make_valid(shapely.make_valid(cover["520"]).buffer(-1.0))
            shapely.prepare(OLI)
            OLT = Local([OLI])
            keep_c = set(RULES["inOliveKeep"])

            def ol_in(g):
                if not OLI.intersects(g):
                    return Polygon()
                return OLT.at(g, margin=0.5)

            for f in F:
                c0 = f["c"]
                if f["g"] is None or f["i"] in drop or c0 in keep_c or c0 in helpers or c0[0] in "67" or f["otp"] == 3 \
                        or c0.split(".")[0] in ("101", "102", "103", "520"):
                    continue
                oi = ol_in(f["g"])
                if oi.is_empty:
                    continue
                if f["otp"] == 2:
                    if not f["g"].intersects(oi):
                        continue
                    inside = f["g"].intersection(oi).length
                    if inside < 1.0:
                        continue
                    if fix:
                        set_line(f, f["g"].difference(oi), "in_olive"); rep.fix("in_olive")
                    else:
                        rep.add("in_olive", f["g"].intersection(oi), f"{c0} {inside:.0f} m inside 520")
                elif oi.contains(f["g"]):
                    if fix:
                        drop.add(f["i"]); rep.fix("in_olive")
                    else:
                        rep.add("in_olive", f["g"], f"{c0} inside 520")
            for c0, small_m2 in (("521", 20.0), ("411", 1e9)):
                gone = []
                for q in as_polys(cover[c0]):
                    if q.area < small_m2:
                        oi = ol_in(q)
                        if not oi.is_empty and oi.contains(q):
                            gone.append(q)
                if not gone:
                    continue
                if fix:
                    cover[c0] = shapely.make_valid(cover[c0]).difference(unary_union([q.buffer(0.05) for q in gone])); changed.add(c0)
                    rep.fix("in_olive", len(gone))
                else:
                    for q in gone:
                        rep.add("in_olive", q, f"{c0} {q.area:.0f} m² inside 520")
        # touching buildings drawn as one: no outline with building on both sides (ISSprOM 521)
        if not B.is_empty and by.get("521.9"):
            Bp = shapely.make_valid(B)
            shapely.prepare(Bp)
            mids, nrm = [], []
            for f in line_feats(["521.9"]):
                cs = np.asarray(f["g"].coords)
                if len(cs) < 2:
                    continue
                d = cs[1:] - cs[:-1]
                L_ = np.hypot(d[:, 0], d[:, 1])
                ok = L_ > 1.0
                m_ = (cs[1:] + cs[:-1]) / 2
                n_ = np.c_[-d[:, 1], d[:, 0]] / np.maximum(L_, 1e-9)[:, None] * 0.3
                mids.append(m_[ok]); nrm.append(n_[ok])
            if mids:
                M = np.vstack(mids); N = np.vstack(nrm)
                both = shapely.contains_xy(Bp, M[:, 0] + N[:, 0], M[:, 1] + N[:, 1]) & \
                    shapely.contains_xy(Bp, M[:, 0] - N[:, 0], M[:, 1] - N[:, 1])
                seams = M[both]
                if len(seams):
                    if fix:
                        changed.add("521"); rep.fix("building_seam", len(seams))
                    else:
                        for x_, y_ in seams[:200]:
                            rep.add("building_seam", Point(x_, y_), "521 outline between touching buildings")
        # an impassable fence shorter than 3 mm is an impassable wall (ISSprOM 518)
        f518 = line_feats(["518"])
        if f518:
            chains = as_lines(shapely.ops.linemerge(unary_union([f["g"] for f in f518])))
            short = [l for l in chains if l.length < RULES["fenceShortMm"] * k]
            if short:
                SH = unary_union([l.buffer(0.05) for l in short])
                for f in f518:
                    if SH.contains(f["g"]):
                        if fix:
                            objs[f["i"]]["sym"] = sym_of("515"); rep.fix("short_fence")
                        else:
                            rep.add("short_fence", f["g"], f"518 {f['g'].length:.1f} m, minimum {RULES['fenceShortMm'] * k:.0f} m")
        # course planning symbols are the setter's overprint, not the base map's (ISSprOM §4.7)
        for c0 in RULES["courseSymbols"]:
            for f in by.get(c0, []):
                if f["i"] in drop:
                    continue
                if fix:
                    drop.add(f["i"]); rep.fix("course_on_base")
                else:
                    rep.add("course_on_base", f["g"], f"{c0} on the base map")
        # contours cut where they cross a stairway (ISSprOM 101)
        STB = unary_union([f["g"].buffer(_sw(f) * k / 2 + 0.3, cap_style="flat") for f in line_feats(k_stairs)] or [Polygon()])
        # first, two contour ends facing each other under 8 m apart with no stairway left between them are joined again (2026-11-14:
        # a contour cut at a stairway an earlier pass then took out of the olive kept its gap, two ends in the open)
        if fix:
            cf = [f for f in line_feats(RULES["contours"]) if f["g"] is not None and f["g"].length > 0]
            ends_ = []
            for f in cf:
                cs_ = list(f["g"].coords)
                if len(cs_) >= 2 and math.dist(cs_[0], cs_[-1]) > 0.01:
                    for e_, q_ in ((0, 1), (-1, -2)):
                        dx_, dy_ = cs_[e_][0] - cs_[q_][0], cs_[e_][1] - cs_[q_][1]; n_ = math.hypot(dx_, dy_) or 1
                        ends_.append((f, e_, cs_[e_], (dx_ / n_, dy_ / n_)))
            joined = set()
            pairs_ = []
            for ia, (fa, ea, pa, da) in enumerate(ends_):
                for fb, eb, pb, db in ends_[ia + 1:]:
                    d_ = math.dist(pa, pb)
                    if fb is fa or fa["c"] != fb["c"] or d_ > 8 or d_ < 1e-6:
                        continue
                    ux, uy = (pb[0] - pa[0]) / d_, (pb[1] - pa[1]) / d_
                    if da[0] * ux + da[1] * uy < 0.8 or -(db[0] * ux + db[1] * uy) < 0.8:
                        continue
                    seg_ = LineString([pa, pb])
                    if (not STB.is_empty and seg_.intersects(STB)) or seg_.distance(frame.exterior) < 1.0:
                        continue
                    pairs_.append((d_, fa, ea, fb, eb))
            for d_, fa, ea, fb, eb in sorted(pairs_, key=lambda t_: t_[0]):
                if fa["i"] in joined or fb["i"] in joined:
                    continue
                ca, cb = list(fa["g"].coords), list(fb["g"].coords)
                ca = ca if ea == -1 else ca[::-1]
                cb = cb if eb == 0 else cb[::-1]
                g_ = LineString(ca + cb)
                set_line(fa, g_, "contour_end"); drop.add(fb["i"]); joined |= {fa["i"], fb["i"]}
                fa["g"] = g_
                rep.fix("contour_end")
        if not STB.is_empty:
            for f in line_feats(RULES["contours"]):
                if f["i"] in drop or not f["g"].intersects(STB):
                    continue
                cut_ = f["g"].intersection(STB)
                if cut_.length < 0.2:
                    continue
                if fix:
                    set_line(f, f["g"].difference(STB), "contour_cut"); rep.fix("contour_cut")
                else:
                    rep.add("contour_cut", cut_, f"{f['c']} crosses a stairway")
        # openings in walls and fences under 1 mm (4 m): closed when both ends are of one symbol and no way goes through
        ends, done_ = [], set()
        for f in line_feats(RULES["openingLines"]):
            if f["i"] in sides or f["i"] in drop:
                continue
            cs = list(f["g"].coords)
            if len(cs) < 2 or Point(cs[0]).distance(Point(cs[-1])) < 0.05:
                continue
            for e, q, first in ((cs[0], cs[1], True), (cs[-1], cs[-2], False)):
                dx, dy = e[0] - q[0], e[1] - q[1]
                n_ = math.hypot(dx, dy)
                if n_ > 1e-6:
                    ends.append((f, e, (dx / n_, dy / n_), first))
        if ends:
            omax = RULES["openingMm"] * k
            ptree = shapely.STRtree([Point(e[1]) for e in ends])
            for a_i, (fa, ea, da, a0) in enumerate(ends):
                for b_i in ptree.query(Point(ea).buffer(omax)):
                    if b_i <= a_i:
                        continue
                    fb, eb, db, b0 = ends[b_i]
                    if fb is fa:
                        continue
                    d = math.dist(ea, eb)
                    if d <= touch_m or d >= omax or (fa["c"] in gap_lines and fb["c"] in gap_lines and d < gap_m):
                        continue
                    vx, vy = (eb[0] - ea[0]) / d, (eb[1] - ea[1]) / d
                    if da[0] * vx + da[1] * vy < 0.8 or -(db[0] * vx + db[1] * vy) < 0.8:
                        continue
                    seg = LineString([ea, eb])
                    if fix and fa["c"] == fb["c"] and fa["i"] not in done_ and (WAYS.is_empty or not seg.buffer(0.3).intersects(WAYS)):
                        cs = list(fa["g"].coords)
                        fa["g"] = LineString(([eb] + cs) if a0 else (cs + [eb]))
                        set_line(fa, fa["g"], "opening"); done_.add(fa["i"]); rep.fix("opening")
                    else:
                        rep.add("opening", seg, f"{fa['c']} opening {d:.1f} m to {fb['c']}, minimum {omax:.0f} m")
        # point symbols drawn over each other: the trees thinned, the larger kept (a monument, a goal, a fountain first)
        rad = {c: v * k for c, v in RULES["points"].items()}
        pts = [f for c in ("526", "531", "311", "417", "418") for f in by.get(c, []) if f["i"] not in drop]
        cell, grid = 2 * max(rad.values()) + RULES.get("pointGapMm", 0) * k, {}

        def keep(g, c):
            grid.setdefault((int(g.x // cell), int(g.y // cell)), []).append((g, c))

        for f in pts:
            hit = None
            gx, gy = int(f["g"].x // cell), int(f["g"].y // cell)
            for g, c in (q for dx in (-1, 0, 1) for dy in (-1, 0, 1) for q in grid.get((gx + dx, gy + dy), [])):
                if g.distance(f["g"]) < rad[c] + rad[f["c"]] + RULES.get("pointGapMm", 0) * k:
                    hit = c; break
            if hit is None:
                keep(f["g"], f["c"])
                continue
            if fix and f["c"] in ("417", "418"):
                drop.add(f["i"]); rep.fix("point_over")
            else:
                rep.add("point_over", f["g"], f"{f['c']} over {hit}")
                keep(f["g"], f["c"])
        step("points")
        for (a, b), x in overlaps(cover, ground, ground, 0.5).items():
            for p in x:
                rep.add("combo", p, f"{a} over {b}, {p.area:.1f} m²")

        step("overlaps")
        # ---- 5. reported only: line lengths, contour ends, 512.1 away from a passage's mouth
        for c, fs in by.items():
            mn = mins(c).get("length")
            if not mn or c in helpers:
                continue
            for f in fs:
                if f["otp"] == 2 and f["i"] not in drop and f["g"].length < mn * k:
                    rep.add("length", f["g"], f"{c} {f['g'].length:.1f} m, minimum {mn * k:.1f} m")
        near_end = RULES["contourEndMm"] * k
        edge = frame.boundary
        _sw = lambda f: [0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0][min(int(f["c"].split(".")[1]) if "." in f["c"] else 0, 6)]
        STL = Local([unary_union([f["g"].buffer(_sw(f) * k / 2 + 1.0, cap_style="flat") for f in line_feats(k_stairs)] or [Polygon()])])
        for f in line_feats(RULES["contours"]):
            cs = list(f["g"].coords)
            if len(cs) > 2 and Point(cs[0]).distance(Point(cs[-1])) < 0.05:
                continue
            for e in (cs[0], cs[-1]):
                p = Point(e)
                nb = STL.at(p, near_end + 0.1)
                if (nb.is_empty or nb.distance(p) > near_end) and edge.distance(p) > 1.0:
                    rep.add("contour_end", p, f"{f['c']} ends in the open")
        mouths = PASS.boundary if not PASS.is_empty else None
        for f in line_feats([RULES["bridgeMouth"]]):
            if mouths is None or mouths.distance(f["g"].centroid) > 1.5:
                rep.add("bridge", f["g"], "512.1 not at a passage's mouth")

        # the map's scale and format (ISSprOM §3.1, §3.4; ISOM §2.9)
        if doc["scale"] not in RULES["scales"][std]:
            rep.add("scale", frame.centroid, f"1:{doc['scale']:.0f}, expected 1:{RULES['scales'][std][0]}")
        gs_ = [f["g"] for f in F if f["g"] is not None and f["c"] not in helpers and f["c"][0] not in "67"]
        if gs_:
            x0, y0, x1, y1 = shapely.total_bounds(gs_)
            w_, h_ = sorted([(x1 - x0) / k, (y1 - y0) / k])
            if h_ > max(RULES["formatMm"]) or w_ > min(RULES["formatMm"]):
                rep.add("format", frame.centroid, f"map {h_:.0f} × {w_:.0f} mm, beyond A3")
        # a paved area's edge: 501.1, else something that bounds it (ISSprOM 501: « should be bordered »)
        EL = unary_union([f["g"].buffer(0.5) for c in RULES["edgeLines"] for f in by.get(c, []) if f["otp"] == 2 and f["i"] not in drop]
                         or [Polygon()])
        shapely.prepare(EL)
        for pc in RULES["paving"]:
            Pv = shapely.make_valid(cover[pc])
            if Pv.is_empty:
                continue
            others = unary_union([cover[c] if c in cover else unary_union([f["g"] for f in by.get(c, []) if f["otp"] == 3])
                                  for c in RULES["edgeAreas"] if c != pc])
            others = shapely.make_valid(others)
            shapely.prepare(others); shapely.prepare(Pv)
            for poly in as_polys(Pv):
                for ring in [poly.exterior] + list(poly.interiors):
                    L_ = ring.length
                    if L_ < 4:
                        continue
                    # samples at the middle of the ring's pieces of 1 m at most (segmentize: linear, where interpolating
                    # point by point walks the whole ring each time — 90 s on a town's paving)
                    V = shapely.get_coordinates(shapely.segmentize(ring, 1.0))
                    t_ = V[1:] - V[:-1]
                    sl = np.hypot(t_[:, 0], t_[:, 1])
                    P0 = (V[1:] + V[:-1]) / 2
                    n_ = np.c_[-t_[:, 1], t_[:, 0]] / np.maximum(sl, 1e-9)[:, None] * 0.6
                    qa, qb = P0 + n_, P0 - n_
                    out_ = np.where(shapely.contains_xy(Pv, qa[:, 0], qa[:, 1])[:, None], qb, qa)
                    ok = shapely.contains_xy(others, out_[:, 0], out_[:, 1]) | shapely.contains_xy(EL, P0[:, 0], P0[:, 1]) \
                        | (shapely.distance(frame.exterior, shapely.points(P0)) < 1.5)
                    bad = ~ok
                    i_ = 0
                    while i_ < len(bad):
                        if not bad[i_]:
                            i_ += 1
                            continue
                        j_ = i_
                        while j_ < len(bad) and bad[j_]:
                            j_ += 1
                        run_m = float(sl[i_:j_].sum())
                        if run_m >= 3:
                            m_ = P0[(i_ + j_) // 2]
                            if fix:                           # (the area changed under the generator's edge: drawn again there)
                                new.append({"sym": sym_of("501.1"), "otp": 2, "rings": [to_mm(LineString(V[i_:j_ + 1]))]})
                                rep.fix("paved_edge")
                            else:
                                rep.add("paved_edge", Point(m_), f"{pc} {run_m:.0f} m of edge without 501.1")
                        i_ = j_
        # two black lines side by side closer than 0.15 mm (ISSprOM §3.3)
        BLK = RULES["blackLines"]
        bl = [f for c in BLK for f in by.get(c, []) if f["otp"] == 2 and f["i"] not in drop and f["i"] not in sides]
        if bl:
            btree = shapely.STRtree([f["g"] for f in bl])
            pairs_ = set()
            for ia_, fa in enumerate(bl):
                L_ = fa["g"].length
                if L_ < 3:
                    continue
                ha = BLK[fa["c"]] * k / 2
                pts_ = shapely.points(shapely.get_coordinates(shapely.segmentize(fa["g"], 1.0)))
                for ib_ in btree.query(fa["g"].buffer(ha + 1.2 + RULES["lineGapMm"] * k)):
                    if ib_ == ia_ or (min(ia_, ib_), max(ia_, ib_)) in pairs_:
                        continue
                    fb = bl[ib_]
                    hb = BLK[fb["c"]] * k / 2
                    d = shapely.distance(pts_, fb["g"])
                    lo, hi = ha + hb + touch_m, ha + hb + RULES["lineGapMm"] * k
                    hit = (d > lo) & (d < hi)
                    if hit.sum() < 2:
                        continue
                    xy = shapely.get_coordinates(pts_)
                    cum = np.r_[0.0, np.cumsum(np.hypot(*(xy[1:] - xy[:-1]).T))]
                    best, at_ = 0.0, None
                    i_ = 0
                    while i_ < len(hit):                                  # the longest run of samples side by side, in metres
                        if not hit[i_]:
                            i_ += 1
                            continue
                        j_ = i_
                        while j_ + 1 < len(hit) and hit[j_ + 1]:
                            j_ += 1
                        if cum[j_] - cum[i_] > best:
                            best, at_ = cum[j_] - cum[i_], xy[(i_ + j_) // 2]
                        i_ = j_ + 1
                    if best >= 2.0:
                        pairs_.add((min(ia_, ib_), max(ia_, ib_)))
                        rep.add("line_gap", Point(at_), f"{fa['c']} and {fb['c']} side by side under 0.15 mm over {best:.0f} m")
        # north lines: their spacing and direction (ISSprOM 601: 30 mm; ISOM 601: 20 mm at 1:15 000)
        nl = [f for c in ("601", "601.1", "601.2") for f in by.get(c, []) if f["otp"] == 2]
        if nl:
            sp_m = RULES["northMm"][std] * (15.0 if std == "isom2017-2" else 4.0)
            xs = []
            for f in nl:
                (xa, ya), (xb, yb) = f["g"].coords[0], f["g"].coords[-1]
                if abs(xb - xa) > 0.02 * max(abs(yb - ya), 1.0):
                    rep.add("north_lines", f["g"], "601 not parallel to the frame")
                xs.append((xa + xb) / 2)
            xs.sort()
            for a_, b_ in zip(xs, xs[1:]):
                if b_ - a_ > 1.0 and abs((b_ - a_) - sp_m) > 0.5 * k:
                    rep.add("north_lines", Point((a_ + b_) / 2, frame.centroid.y), f"601 lines {(b_ - a_):.0f} m apart, expected {sp_m:.0f} m")
        # 512.2 only where no other line bounds the lower level (ISSprOM 512.2)
        OB = [f["g"] for c in ("521.9", "515", "501.1", "513.1", "513.2", "516", "518") for f in by.get(c, []) if f["otp"] == 2]
        if OB:
            otree = shapely.STRtree(OB)
            for f in line_feats(["512.2"]):
                near_ = [OB[i] for i in otree.query(f["g"].buffer(0.5))]
                if not near_:
                    continue
                share = f["g"].intersection(unary_union([g.buffer(0.5) for g in near_])).length / max(f["g"].length, 1e-6)
                if share >= 0.5:
                    if fix:                                   # (another line bounds the lower level: no 512.2 there)
                        drop.add(f["i"]); rep.fix("pass_side")
                    else:
                        rep.add("pass_side", f["g"], f"512.2 along another black line ({share:.0%})")
        # areas outside the ground's coverage under their minimum width or area (buildings, canopies, marsh…)
        for c0, fs in by.items():
            if c0 in ground or c0 in helpers or c0[0] in "67":
                continue
            m_ = mins(c0)
            if not (m_.get("width") or m_.get("area")):
                continue
            for f in fs:
                if f["otp"] != 3 or f["i"] in drop:
                    continue
                if c0 != "521" and m_.get("area") and 0.1 <= f["g"].area < m_["area"] * k * k:
                    rep.add("area", f["g"], f"{c0} {f['g'].area:.1f} m², minimum {m_['area'] * k * k:.1f} m²")
                if m_.get("width"):
                    w_ = m_["width"] * k
                    for s_ in opened_away(f["g"], w_ * 0.95):
                        if s_.area >= max(w_ * w_ * 0.6, 0.5):
                            rep.add("width", s_, f"{c0} {2 * s_.area / max(s_.length, 1e-6):.1f} m wide, minimum {w_:.1f} m")
        step("lengths, contours, bridges")
    # ---- write back
    if fix:
        for c in changed:
            for f in by.get(c, []):
                if f["otp"] == 3:
                    drop.add(f["i"])
            g = shapely.make_valid(cover[c]).intersection(frame)
            for p in as_polys(g):
                if p.area < 0.5:
                    continue
                rings = [to_mm(p.exterior)] + [to_mm(rr) for rr in p.interiors if Polygon(rr).area > 0.5]
                new.append({"sym": sym_of(c), "otp": 3, "rings": rings})
            if c == "521":                                     # the buildings' outlines again
                for f in by.get("521.9", []):
                    drop.add(f["i"])
                for p in as_polys(g):
                    if p.area >= 0.5:
                        for l in as_lines(p.boundary):
                            new.append({"sym": sym_of("521.9"), "otp": 2, "rings": [to_mm(l)]})
        doc["objects"] = [o for i, o in enumerate(objs) if i not in drop] + new
    return rep


def write_report(rep, path):
    """The report as JSON (UTF-8, the French texts as they are)."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(rep.json() if isinstance(rep, Report) else rep, ensure_ascii=False, indent=1),
                          encoding="utf-8", newline=chr(10))


def blocked(rep_json):
    """The publication gate: the errors left (« shall » rules), {entry id: count}; empty when the map may be published."""
    return {k: v["left"] for k, v in rep_json.get("entries", {}).items() if v.get("sev") == "error" and v.get("left")}


def main():
    """py legibility.py <race> [--fix] [--in F] [--out F] [--sheet F.html] [--gate]
    --sheet: the review sheet (sheet.py), a crop round every place flagged; --gate: exit 2 when errors are left."""
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    a = sys.argv[1:]
    race = a[0]
    DATA = Path(os.environ.get("VIRTUAL_DATA") or HERE.parents[4] / "data" / "virtual")
    if not DATA.exists():
        sys.path.insert(0, str(HERE.parents[2])); DATA = Path(__import__("paths").DATA_DIR) / "virtual"
    rd = DATA / race
    src = Path(a[a.index("--in") + 1]) if "--in" in a else rd / "map_objects.json"
    out = Path(a[a.index("--out") + 1]) if "--out" in a else src
    doc = json.load(open(src, encoding="utf-8"))
    fix = "--fix" in a
    area = rd / "area.json"
    frame = None                                            # the map's edge: its objects' extent…
    if area.exists():                                       # …or its area's box when it was cut to it (town_map.py --clip)
        bx = json.load(open(area, encoding="utf-8")).get("box")
        k_ = doc["scale"] / 1000
        xs = [x for o in doc["objects"] for r in o["rings"] for x, _ in r]
        ys = [y for o in doc["objects"] for r in o["rings"] for _, y in r]
        if bx and xs:
            ext = (doc["realWorld"]["x"] + min(xs) * k_, doc["realWorld"]["y"] + min(ys) * k_,
                   doc["realWorld"]["x"] + max(xs) * k_, doc["realWorld"]["y"] + max(ys) * k_)
            if ext[0] >= bx[0] - 2 and ext[1] >= bx[1] - 2 and ext[2] <= bx[2] + 2 and ext[3] <= bx[3] + 2:
                frame = sbox(*bx)
    rep = check(doc, fix=fix, frame=frame)
    print(f"legibility ({'fixed' if fix else 'checked'}): {src}")
    print(chr(10).join(rep.lines()))
    rj = rep.json()
    write_report(rj, rd / "src" / "legibility.json")
    if fix:
        json.dump(doc, open(out, "w"))
    if "--sheet" in a:
        sys.path.insert(0, str(HERE.parent))
        import sheet
        sp = Path(a[a.index("--sheet") + 1])
        n = sheet.write(doc, rj, catalogue(rj["set"])[0], sp, title=race)
        print(f"review sheet: {sp} ({n} crops)")
    if "--gate" in a and blocked(rj):
        print("gate: not publishable — " + ", ".join(f"{k} {n}" for k, n in blocked(rj).items()))
        sys.exit(2)


if __name__ == "__main__":
    main()
