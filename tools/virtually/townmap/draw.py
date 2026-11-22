"""The map's objects from the areas and the sources: areas by class, buildings, bridges and passages, the paved area's edge,
walls and fences, paths, stairways, watercourses, the railway, trees and point features, the hidden helpers.

Objects are {"sym", "otp" (1 point, 2 line, 3 area), "rings" (map mm, y up), "ang"?, "curve"? (a line that bends on the
ground: export.py makes it a curve), "nolr"?}."""
import json, math

import numpy as np
import shapely
from scipy.ndimage import gaussian_filter, maximum_filter
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points, substring

from . import stairs
from .areas import wall_height, through_building, HEDGE_HALF
from .env import K, R, S, SCALE, lines, polys, union, merge_lines
from .sources import NO_ENTRY, ROAD_W, is_lower, width_of
from .terrain import height_of

AREA_SYM = {"open": S(401), "open_t": S(402), "slow": S(406), "walk": S(408), "fight": S(410), "paved": S(501), "paved_t": S(501, 3),
            "heavy": S(501, 4), "private": S(520), "water": S(301), "imp_veg": S(411)}       # (forest is the paper's white)
TREE_R = {417: 0.6, 418: 0.4}                               # the tree symbols' radii, mm
TREE_ALONE = 12.0                                           # a LiDAR crown is drawn when no other stands within (m)


class Doc:
    """The objects being made, cut to the map's area."""
    def __init__(self, env):
        self.env, self.objects = env, []

    def area(self, g, sym, min_area=2.0, ang=0):
        if g is None or g.is_empty:
            return
        mm = self.env.mm
        for p in polys(g.intersection(self.env.CLIP)):
            if p.area < min_area:
                continue
            rings = [[mm(x, y) for x, y in p.exterior.coords]] + [[mm(x, y) for x, y in r.coords] for r in p.interiors if Polygon(r).area > 1]
            self.objects.append({"sym": sym, "otp": 3, "rings": rings, **({"ang": ang} if ang else {})})

    def line(self, g, sym, min_len=1.0, curve=False):
        if g is None or g.is_empty:
            return
        mm = self.env.mm
        g = g.intersection(self.env.CLIP)
        for p in polys(g):
            self.line(p.exterior, sym, min_len, curve)
        for l in lines(g):
            if len(l.coords) >= 2 and l.length >= min_len:
                if curve:
                    l = l.simplify(0.6)
                o = {"sym": sym, "otp": 2, "rings": [[mm(x, y) for x, y in l.coords]]}
                if curve and len(l.coords) >= 3:
                    o["curve"] = True
                self.objects.append(o)

    def point(self, x, y, sym, ang=0):
        if self.env.clip and not self.env.CLIP.covers(Point(x, y)):
            return
        self.objects.append({"sym": sym, "otp": 1, "ang": ang, "rings": [[self.env.mm(x, y)]]})


def run(env, s, t, a, d):
    G = a.GEOM
    B = a.BLOCKS
    frame, CLIP = env.frame, env.CLIP
    log = env.log

    # ---- areas ---------------------------------------------------------------------------------------------------------------
    for k, sym in AREA_SYM.items():
        if k in G:
            d.area(G[k], sym, 2)
    for g in polys(B):                                      # buildings, with their outline
        d.area(g, S(521)); d.line(g.boundary, S(521, 9))
    canopy = union([q for q in polys(s.canopy.difference(B)) if q.intersection(a.OLIVE).area < 0.5 * q.area])   # (not a garden's)
    d.area(canopy, S(522)); d.line(canopy.boundary if not canopy.is_empty else None, S(522, 9))
    d.area(a.BPASS, S(522), 1)
    # the marsh over the ground (308: blue lines, no fill), outside water, buildings, paving and the ground not to be entered
    if not s.WET.is_empty:
        d.area(s.WET.intersection(frame).difference(union([G.get("water"), B, a.PAVED_ALL, a.OLIVE_IN])), S(308), 20)
    for q in polys(G.get("water")):
        if q.area >= 2:
            d.line(q.exterior, S(301, 9))

    mouths, PASS = levels(env, s, a, d)
    json.dump({"passages": [shapely.geometry.mapping(g) for g in PASS]}, open(env.SRC / "passages.json", "w"))

    # ---- the paved area's edge (501.1) where it meets anything but a building, a wall, a fence or a hedge already drawn. No kerb
    # line inside the paving (the owner, 2026-11-22: four parallel black lines along every street) ------------------------------------
    B03, B04 = B.buffer(0.3), B.buffer(0.4)                 # (once: a town's buildings are a large geometry)
    no_line = union([B04, frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in s.walls]
                    + [h.buffer(HEDGE_HALF + 0.1) for h in s.hedges] + [m.buffer(0.8) for m in mouths])
    n = 0
    for piece in lines(a.PAVED_ALL.boundary.difference(no_line)):
        if piece.length >= 2:
            d.line(piece, S(501, 1), 2); n += 1
    log("paved area edges", n)

    # ---- walls and fences, passable or not by the height the LiDAR measures along them (1.5 m) ----------------------------------
    wall_out = []
    b_edge = B.boundary if not B.is_empty else None
    for g, kind, ret in s.walls:
        for l in lines(g):
            for piece in lines(union([off_building_edges(q, b_edge) for q in lines(l.difference(B03))])):
                if piece.length < 2:
                    continue
                h = max(wall_height(env, t, piece, ret), 3.0) if kind == "court" else wall_height(env, t, piece, ret)
                imp = h >= 1.5
                sym = (S(518) if imp else S(516)) if kind in ("fence", "court") else S(515) if imp else (S(513, 2) if ret else S(513, 1))
                for q in lines(piece.difference(a.OLIVE_IN)):   # inside the ground not to be entered: generalised away
                    if q.length >= 2:
                        d.line(closed_end(q.simplify(0.2), B, a.PAVED_ALL) if imp else q.simplify(0.2), sym, 1.5)
                wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in piece.simplify(0.15).coords],
                                 "kind": "fence" if kind == "court" else kind,
                                 "h": round(max(h, 0.8 if kind in ("fence", "court") else 0.6), 2), "imp": bool(imp), "ret": bool(ret)})
    # a multi-sport court's fence where the LiDAR sees one along its outline, in 2 m pieces (a gate, an open side stay open)
    for l in lines(merge_lines(union([x["g"].boundary for x in s.sports if x["sport"] in ("multi", "basketball", "handball")]))):
        run_ = []
        for d0 in np.arange(0, l.length, 2.0):
            piece = substring(l, d0, min(l.length, d0 + 2.0))
            if piece.length > 0.5 and height_of(env, t, piece) >= 1.5:
                run_ += list(piece.coords) if not run_ else list(piece.coords)[1:]
            else:
                if len(run_) >= 2:
                    q = LineString(run_); d.line(q, S(518), 3)
                    wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in q.coords], "kind": "fence", "h": 3.0, "imp": True, "ret": False})
                run_ = []
        if len(run_) >= 2:
            d.line(LineString(run_), S(518), 3)
    for g in s.hedges:
        for piece in lines(g):
            if piece.length >= 2:
                v = env.along(piece, t.chm); v = v[(v > 0.3) & (v < 8)]
                wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in piece.simplify(0.2).coords], "kind": "hedge",
                                 "h": round(float(np.median(v)) if len(v) > 3 else 1.6, 2), "imp": True, "ret": False})
    for g, sw in a.stair_pieces:
        if g.length >= 1.5:
            wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in g.simplify(0.2).coords], "kind": "steps",
                             "h": round(sw, 1), "imp": False, "ret": False})
    json.dump({"walls": wall_out, "origin": [env.X0, env.Y1], "res": R}, open(env.SRC / "walls.json", "w"))
    log("walls and fences", len(wall_out), "impassable", sum(w["imp"] for w in wall_out))

    # ---- sports grounds: goals (531), a grass pitch's edge (415), a hard ground's outline inside the paving (501.1) -------------
    import town_sports
    edge_no = union([B04, frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in s.walls]
                    + [h.buffer(HEDGE_HALF + 0.1) for h in s.hedges])
    paved_core = a.PAVED_ALL.buffer(-0.6)
    for x in s.sports:
        grass = x["surface"] in ("grass", "turf")
        if x["sport"] not in NO_ENTRY:
            for p_ in polys(x["g"]):
                posts = [q for q in town_sports.layout(p_, x["sport"], x["surface"])["props"] if q[0] in ("pole", "rpole")]
                for a_, b_ in zip(posts[0::2], posts[1::2]):
                    d.point((a_[1] + b_[1]) / 2, (a_[2] + b_[2]) / 2, S(531))
            rest = x["g"].boundary.difference(edge_no) if grass else x["g"].boundary.intersection(paved_core).difference(edge_no)
            for piece in lines(rest):
                if piece.length >= 2:
                    d.line(piece, S(415) if grass else S(501, 1), 2)

    # ---- unpaved paths: one network (noded, merged through its junctions; an end 0.3-4 m short of a path or the paving drawn on) --
    paths = []
    paved_in = a.PAVED_ALL.buffer(-0.3)
    for lines_, sym in ((s.path_lines, S(505)), (s.small_lines, S(506))):
        for g in network(lines_):
            paths += [[q, sym] for q in lines(g.difference(paved_in).difference(B).difference(a.OLIVE_IN)) if q.length >= 3]
    tree = shapely.STRtree([q for q, _ in paths]) if paths else None
    pb = a.PAVED_ALL.boundary
    for i, (q, sym) in enumerate(paths):
        cs = list(q.coords)
        for end in (0, -1):
            e = Point(cs[end])
            cand = [(a.PAVED_ALL.distance(e), None)] + [(paths[j][0].distance(e), j) for j in tree.query(e.buffer(4.0)) if j != i]
            d_, j_ = min(cand, key=lambda c: c[0])
            if not (0.3 < d_ < 4.0) or any(c[0] <= 0.3 for c in cand):
                continue
            tp = nearest_points(e, pb if j_ is None else paths[j_][0])[1]
            seg = LineString([e, tp])
            if seg.intersects(B) or seg.intersects(a.OLIVE_IN):
                continue
            cs = ([(tp.x, tp.y)] + cs) if end == 0 else (cs + [(tp.x, tp.y)])
        paths[i][0] = LineString(cs)
    for q, sym in paths:
        d.line(q, sym, 3, curve=True)
    log("unpaved paths", len(paths))

    # ---- stairways (532.1-532.6 by their width), not inside the ground not to be entered -----------------------------------------
    steps = [(g, sw) for g, sw in a.stair_pieces if g.length > 0 and g.intersection(a.OLIVE_IN).length < 0.5 * g.length]
    for g, sw in steps:
        d.line(g.difference(B), S(532, stairs.symbol_sub(sw)), 1)

    # ---- boundaries to confirm (995, a hidden helper: the owner's mapper, 2026-11-12): the edge of the ground not to be entered
    # where no wall, fence, hedge or building is known within 1.5 m — on the ground it is one of them ---------------------------------
    known = union([g.buffer(1.5) for g, _, _ in s.walls] + [h.buffer(1.5) for h in s.hedges] + [B.buffer(1.0), frame.boundary.buffer(1.0), CLIP.boundary.buffer(1.0)])
    n = 0
    for piece in lines(a.OLIVE.boundary.difference(known)):
        if piece.length >= 4:
            d.line(piece.simplify(0.3), S(995), 4); n += 1
    log("boundaries to confirm", n)

    # ---- water lines, the railway ------------------------------------------------------------------------------------------------
    wat = G.get("water", Polygon()).buffer(0.5)
    for g in s.streams:
        d.line(g.difference(wat).difference(B), S(305), 3, curve=True)
    for g in s.ditches:
        d.line(g.difference(wat).difference(B).difference(a.OLIVE_IN), S(306), 3, curve=True)
    if not s.RAIL.is_empty:
        # the tracks cut over every underpass (ISSprOM 509)
        under = union(PASS)
        d.line(s.RAIL.intersection(CLIP).difference(under), S(509, 1), 3)
    a.steps_drawn = steps
    points(env, s, t, a, d)
    helpers(env, s, d)


def closed_end(l, B, ways, reach=1.6):
    """An uncrossable wall or fence that ends within 0.4 mm of a building is drawn on to it: the gap cannot be read, nor run
    through (ISSprOM: passages under 0.4 mm are closed) — unless paving runs between them (a way: left for the mapper)."""
    if B.is_empty:
        return l
    cs = list(l.coords)
    for end in (0, -1):
        e = Point(cs[end])
        dist = B.distance(e)
        if 0.05 < dist <= reach:
            q = nearest_points(B, e)[0]
            if not LineString([e, q]).buffer(0.2).intersection(ways).area > 0.3:
                cs = ([(q.x, q.y)] + cs) if end == 0 else (cs + [(q.x, q.y)])
    return LineString(cs)


def at_least(l, length):
    """The line drawn on straight at both ends to a minimum length (a symbol's)."""
    if l.length >= length or len(l.coords) < 2:
        return l
    add = (length - l.length) / 2 + 0.05
    cs = list(l.coords)
    for end, nxt in ((0, 1), (-1, -2)):
        dx, dy = cs[end][0] - cs[nxt][0], cs[end][1] - cs[nxt][1]; n = math.hypot(dx, dy) or 1
        p = (cs[end][0] + dx / n * add, cs[end][1] + dy / n * add)
        cs = [p] + cs if end == 0 else cs + [p]
    return LineString(cs)


def off_building_edges(l, b_edge, near=1.0, run=2.5, step=0.5):
    """The line less its stretches running along a building's outline (within `near` m over `run` m or more): there the
    building's own edge is the barrier (the owner, 2026-11-18: a fence drawn on a building's edge)."""
    if b_edge is None or l.length < run or l.distance(b_edge) > near:
        return l
    n = max(2, int(math.ceil(l.length / step)))
    pts = shapely.line_interpolate_point(l, np.linspace(0, l.length, n + 1))
    c = shapely.distance(pts, b_edge) <= near
    close = c[:-1] & c[1:]
    seg = l.length / n
    keep, i = [], 0
    while i < n:
        j = i
        while j < n and close[j] == close[i]:
            j += 1
        if not (close[i] and (j - i) * seg >= run):
            keep.append(substring(l, i * seg, j * seg))
        i = j
    keep = [q for q in keep if not q.is_empty and q.length > 0]
    return merge_lines(union(keep)) if keep else LineString()


def network(lines_, snap=4.0):
    """The lines noded and merged through their junctions; an end that stops within `snap` m of another drawn on to it."""
    u = union([l for l in lines_ if l is not None and not l.is_empty])
    if u.is_empty:
        return []
    parts = lines(merge_lines(u))
    out, tree = [], shapely.STRtree(parts)
    for i, l in enumerate(parts):
        cs = list(l.coords)
        for end in (0, -1):
            pt = Point(cs[end])
            near = [parts[j] for j in tree.query(pt.buffer(snap)) if j != i]
            if not near:
                continue
            others = union(near); dist = others.distance(pt)
            if dist < 0.05 or dist > snap:
                continue
            q = nearest_points(others, pt)[0]
            cs = ([(q.x, q.y)] + cs) if end == 0 else (cs + [(q.x, q.y)])
        out.append(LineString(cs))
    return out


def levels(env, s, a, d):
    """The two levels on the map: 512.1 across a passage's mouths (the triangles toward the lower level outside), 512.2 along its
    sides, 512.3 over it where the upper level is run on too; a deck's sides over water, a stream or the railway as 515 (ISSprOM:
    « a simple bridge, which cannot be passed underneath, shall be represented using Uncrossable wall »); a hidden area (993) for
    the game."""
    B, frame = s.B, env.frame
    mouths, sides = [], []
    b_in, f_in = B.buffer(-0.3), frame.buffer(-1)
    pass_mouth = union([p[0].buffer(p[1] / 2 + 1.5) for p in s.passages])
    low_w = union([s.WATER_ALL] + [g.buffer(1.0) for g in s.streams + s.ditches if g is not None and not g.is_empty])
    # a way joining a bridge at an angle is not cut by its sides: they stop at the joining ways' bands
    join = []
    for e in s.osm.el:
        t = e.get("tags", {}); hw = t.get("highway")
        if e["type"] != "way" or not hw or t.get("bridge") not in (None, "no") or is_lower(t) or t.get("area") == "yes":
            continue
        g = s.osm.geom(e)
        if g is not None and g.geom_type == "LineString" and g.intersects(s.DECK_ALL.buffer(3)):
            join.append(g.buffer(width_of(t, ROAD_W.get(hw, 3.0)) / 2 + 0.3, cap_style="flat"))
    join = union(join)
    for dk in s.decks:
        low = union([low_w] + ([s.RAIL.buffer(4)] if dk["kind"] != "rail" else [])).intersection(dk["g"].buffer(2))
        if low.is_empty:
            continue
        for off in (dk["w"] / 2, -dk["w"] / 2):
            try:
                ln = dk["axis"].offset_curve(off)
            except Exception:
                continue
            sides += [l for l in lines(ln.difference(pass_mouth).difference(a.OLIVE_IN).difference(join).intersection(low.buffer(1.0))) if l.length >= 1.0]
    PASS = []
    black = union([B.boundary] + [g for g, _, _ in s.walls] + sides).buffer(0.6)
    if s.passages:
        widths = [(p[0].buffer(0.5), p[1]) for p in s.passages]
        merged = [pc for pc in lines(merge_lines(union([p[0] for p in s.passages]))) if pc.length >= 1]
        for i, pc in enumerate(merged):
            others = union([q for j, q in enumerate(merged) if j != i])
            w = max([w for b, w in widths if b.intersects(pc)] or [2.0])
            PASS.append(pc.buffer(w / 2, cap_style="flat"))
            if through_building(s, pc):                    # a canopy (522), no 512 symbol
                continue
            cs = list(pc.coords)
            for e, q in ((cs[0], cs[1]), (cs[-1], cs[-2])):    # a mouth at each end out in the open
                if b_in.contains(Point(e)) or not f_in.contains(Point(e)) \
                        or (not others.is_empty and others.distance(Point(e)) < 0.5):
                    continue
                dx, dy = e[0] - q[0], e[1] - q[1]; n = math.hypot(dx, dy)
                if n < 1e-6:
                    continue
                dx, dy, h = dx / n, dy / n, max(w / 2 + 0.5, 0.7 * SCALE / 1000)   # two triangles at least: 1.4 mm
                m = LineString([(e[0] + dy * h, e[1] - dx * h), (e[0] - dy * h, e[1] + dx * h)])
                mouths.append(m); d.line(m, S(512, 1), 0.5)
            up = pc.buffer(w / 2, cap_style="flat").difference(B)
            if not up.is_empty and up.area >= 2:           # its stripes at about 45° to the passage's axis
                c0, c1 = pc.coords[0], pc.coords[-1]
                d.area(up, S(512, 3), 2, ang=round(math.degrees(math.atan2(c1[1] - c0[1], c1[0] - c0[0])) % 180 * 10))
            gap = 0.2 * SCALE / 1000                       # 512.2: two full dashes at least, 0.2 mm from each end —
            if pc.length >= 2.8 + 2 * gap:                 # and only where no other black line bounds the lower level
                core = substring(pc, gap, pc.length - gap)
                for off in (w / 2, -w / 2):
                    try:
                        side = core.offset_curve(off)
                    except Exception:
                        continue
                    if side.intersection(black).length < 0.5 * side.length:
                        d.line(side, S(512, 2), 2)
        for g in PASS:
            d.area(g, S(993), 0.5)
    mo = union([m.buffer(0.8) for m in mouths])
    kept = []                                              # two bridges side by side: a side within 2.9 m of a longer one left out
    for pc in sorted(sides, key=lambda l: -l.length):
        if not any(pc.intersection(k.buffer(2.9)).length >= 0.6 * pc.length for k in kept):
            kept.append(pc)
    n = 0
    for pc in kept:
        for q in lines(pc.difference(mo)):
            if q.length >= 1.0:
                d.line(at_least(q, 4.0), S(515), 1); n += 1    # (515's minimum: 1 mm)
    env.log("bridges: deck sides", n, "passage mouths", len(mouths), "passages", len(PASS))
    return mouths, PASS


def points(env, s, t, a, d):
    """Trees and point features. A tree symbol is for a prominent tree (ISSprOM 417, 418): OpenStreetMap's trees and tree rows —
    a mapper saw each —, then the LiDAR's crowns that stand alone on ground open to all; a group of trees is no set of symbols
    (the owner, 2026-11-22: 1 833 symbols; « few remarkable trees over grass make sense mapping »)."""
    c = gaussian_filter(t.chm, 1.0)
    ii, jj = np.nonzero((c == maximum_filter(c, size=9)) & (c > 5))
    xy = np.c_[env.X0 + (jj + 0.5) * R, env.Y1 - (ii + 0.5) * R]
    hh = c[ii, jj]
    ok_cls = np.isin(a.cl[ii, jj], [K["paved"], K["open"], K["heavy"]])
    kd = cKDTree(xy) if len(xy) else None
    cand = []                                              # (priority, x, y, symbol)
    for p in s.trees:
        i = kd.query([p.x, p.y])[1] if kd is not None else None
        h = hh[i] if i is not None and math.dist(xy[i], (p.x, p.y)) < 4 else 8
        cand.append((0, p.x, p.y, 417 if h > 14 else 418))
    for row in s.tree_rows:                                # the row's own crowns, else a tree every 8 m
        got = []
        if kd is not None:
            for q in shapely.line_interpolate_point(row, np.arange(0, row.length + 0.1, 3.0)):
                got += kd.query_ball_point([q.x, q.y], 3.5)
        got = sorted(set(got))
        if len(got) >= max(2, row.length / 15):
            cand += [(1, xy[i][0], xy[i][1], 417 if hh[i] > 14 else 418) for i in got]
        else:
            cand += [(1, q.x, q.y, 418) for q in shapely.line_interpolate_point(row, np.arange(0, row.length + 0.1, 8.0))]
    if kd is not None:
        nn = kd.query(xy, k=2)[0][:, 1] if len(xy) > 1 else np.full(len(xy), 99.0)
        for i in np.nonzero(ok_cls & (nn >= TREE_ALONE) & (hh > 6))[0]:
            cand.append((2, xy[i][0], xy[i][1], 417 if hh[i] > 14 else 418))
    cand.sort(key=lambda q: (q[0], -q[3]))
    kept, lone = [(p.x, p.y, 417) for p in s.monuments + s.fountains + s.masts], 0     # (no tree over another point symbol)
    n0 = len(kept)
    no = union([a.OLIVE_IN, a.BLOCKS, a.GEOM.get("water"), a.GEOM.get("forest")])
    shapely.prepare(no)
    for pr, x, y, sym in cand:
        if no.contains(Point(x, y)):
            continue
        if any(math.dist((x, y), (k[0], k[1])) < (TREE_R[sym] + TREE_R[k[2]] + 0.3) * SCALE / 1000 for k in kept):
            continue                                       # no two symbols over each other
        kept.append((x, y, sym)); d.point(x, y, S(sym)); lone += pr == 2
    for p in s.monuments:
        d.point(p.x, p.y, S(526))
    for p in s.fountains:
        d.point(p.x, p.y, S(311))
    for p in s.masts:
        d.point(p.x, p.y, S(524))
    env.log("trees", len(kept) - n0, "of which LiDAR crowns standing alone", lone, "of", len(xy), "crowns")


def helpers(env, s, d):
    """Every OpenStreetMap way and tagged node on hidden helper symbols (990, 991) for the mapper to use; north lines every
    30 mm (601)."""
    o, frame = s.osm, env.frame
    n = 0
    for e in o.el:
        if e["type"] == "way" and e.get("geometry"):
            g = o.geom(e)
            if g is not None and g.intersects(frame):
                d.line(g, S(990), 0); n += 1
        elif e["type"] == "relation":
            for m in e.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 2:
                    g = LineString(o._pts(m["geometry"]))
                    if g.intersects(frame):
                        d.line(g, S(990), 0); n += 1
        elif e["type"] == "node" and e.get("tags"):
            x, y = o.xy(e["lat"], e["lon"])
            if env.X0 < x < env.X1 and env.Y0 < y < env.Y1:
                d.point(x, y, S(991)); n += 1
    for xm in np.arange(math.floor((env.X0 - env.CX) / 120) * 120, (env.X1 - env.CX) + 1, 120):
        d.objects.append({"sym": S(601, 1), "otp": 2, "rings": [[env.mm(env.CX + xm, env.Y0), env.mm(env.CX + xm, env.Y1)]]})
    env.log("OpenStreetMap objects kept hidden", n)
