"""The map's objects from the areas and the sources: areas by class, buildings, bridges and passages, the paved area's edge,
walls and fences, paths, stairways, watercourses, the railway, trees and point features, the hidden helpers.

Objects are {"sym", "otp" (1 point, 2 line, 3 area), "rings" (map mm, y up), "ang"?, "curve"? (a line that bends on the
ground: export.py makes it a curve), "nolr"?}."""
import json, math

import numpy as np
import shapely
import shapely.affinity
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
PT_R = {417: 0.7, 418: 0.4, 526: 0.5, 531: 0.85, 311: 0.59, 524: 0.5}   # point symbols' radii, mm (legibility.json's)
PT_MASK = {417: 0.7, 418: 0.4}                             # a tree symbol's white mask, mm from its centre
PT_GAP = 0.15 + 0.02                                        # mm between two point symbols (0.15 mm, ISSprOM 3.3)
MIN_522 = (2.05, 4.0)                                       # a canopy's minimum width (0.5 mm) and area (0.25 mm²), m and m²
LINE_GAP = 0.15                                             # mm between two black lines side by side (ISSprOM 3.3)
BLACK = {S(513, 1): 0.21, S(513, 2): 0.21, S(515): 0.4, S(516): 0.21, S(518): 0.4, S(521, 9): 0.14, S(522, 9): 0.1, S(529): 0.4}
PASSABLE_MIN = {S(513, 1): 5.65, S(513, 2): 5.65, S(516): 8.85}   # m: 1.4 mm, 2.2 mm
LIDAR_WALLS = False                                         # walls and fences read from the LiDAR on the boundaries to confirm
FENCE_SHORT = 12.0                                          # an impassable fence under 3 mm shows no ticks: an impassable wall
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
    # buildings, with their outline; two that touch (a slot filled, a needle taken out) drawn as one
    for g in polys(union([q.buffer(0.03, join_style="mitre") for q in polys(B)]).buffer(-0.025, join_style="mitre")):   # (a hair less:
        # two that meet at a corner stay one)
        d.area(g, S(521)); d.line(g.boundary, S(521, 9))
    canopy = union([q for q in polys(s.canopy.difference(B)) if q.intersection(a.OLIVE).area < 0.5 * q.area])   # (not a garden's)
    canopy = at_size(canopy, *MIN_522)                     # (a canopy under 0.5 mm across or 0.25 mm² is not drawn: ISSprOM 522)
    d.area(canopy, S(522)); d.line(canopy.boundary if not canopy.is_empty else None, S(522, 9))
    d.area(a.BPASS, S(522), 1)
    # the marsh over the ground (308: blue lines, no fill), outside water, buildings, paving and the ground not to be entered
    if not s.WET.is_empty:
        d.area(at_size(s.WET.intersection(frame).difference(union([G.get("water"), B, a.PAVED_ALL, a.OLIVE_IN])), 2.05, 20), S(308), 20)
    for q in polys(G.get("water")):
        if q.area >= 2:
            d.line(q.exterior, S(301, 9))

    mouths, PASS = levels(env, s, a, d)
    json.dump({"passages": [shapely.geometry.mapping(g) for g in PASS]}, open(env.SRC / "passages.json", "w"))

    B03, B04 = B.buffer(0.3), B.buffer(0.4)                 # (once: a town's buildings are a large geometry)

    # ---- walls and fences, passable or not by the height the LiDAR measures along them (1.5 m) ----------------------------------
    wall_out, fences, passable = [], [], {}
    b_edge = B.boundary if not B.is_empty else None
    for g, kind, ret in s.walls:
        for l in lines(g):
            # (along a building, closer than 0.15 mm between the printed lines: the building's edge is the barrier — ISSprOM 3.3)
            h0 = max(wall_height(env, t, l, ret), 3.0) if kind == "court" else wall_height(env, t, l, ret)
            alongside = (0.07 + (0.2 if h0 >= 1.5 else 0.105) + LINE_GAP) * SCALE / 1000 + 0.1
            for piece in lines(union([off_building_edges(q, b_edge, near=alongside) for q in lines(l.difference(B03))])):
                if piece.length < 2:
                    continue
                h = max(wall_height(env, t, piece, ret), 3.0) if kind == "court" else wall_height(env, t, piece, ret)
                imp = h >= 1.5
                sym = (S(518) if imp else S(516)) if kind in ("fence", "court") else S(515) if imp else (S(513, 2) if ret else S(513, 1))
                for q in lines(piece.difference(a.OLIVE_IN)):   # inside the ground not to be entered: generalised away
                    if q.length >= 2:
                        q = closed_end(q.simplify(0.2), B, a.PAVED_ALL) if imp else q.simplify(0.2)
                        if sym == S(518):
                            fences.append(q)
                        elif imp:
                            d.line(q, sym, 1.5)
                        else:
                            passable.setdefault(sym, []).append(q)
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
                    q = LineString(run_); fences.append(q)
                    wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in q.coords], "kind": "fence", "h": 3.0, "imp": True, "ret": False})
                run_ = []
        if len(run_) >= 2:
            fences.append(LineString(run_))
    # a passable wall or fence shorter than its symbol's minimum (513: 1.4 mm, 516: 2.2 mm), its pieces end to end, is left out:
    # it shows nothing of what it is (ISSprOM)
    for sym, ls in passable.items():
        for q in lines(merge_lines(union(ls))):
            if q.length >= PASSABLE_MIN.get(sym, 0):
                d.line(q, sym, 1.5)
    # an uncrossable fence shorter than 3 mm, end to end with the others, shows no tick: it is drawn as an uncrossable wall
    # (ISSprOM 518: « minimum length 3 mm »)
    if fences:
        joined = lines(merge_lines(union(fences)))
        short = union([l.buffer(0.05) for l in joined if l.length < FENCE_SHORT])
        for q in fences:
            d.line(q, S(515) if not short.is_empty and short.contains(q) else S(518), 1.5)
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
    log("walls and fences", len(wall_out), "impassable", sum(w["imp"] for w in wall_out))

    # ---- sports grounds: goals (531), a grass pitch's edge (415), a hard ground's outline inside the paving (501.1) -------------
    import town_sports
    edge_no = union([B04, frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in s.walls]
                    + [h.buffer(HEDGE_HALF + 0.1) for h in s.hedges])
    paved_core = a.PAVED_ALL.buffer(-0.6)
    goals, sport_edges = [], []
    a.goals = goals
    for x in s.sports:
        grass = x["surface"] in ("grass", "turf")
        if x["sport"] not in NO_ENTRY:
            for p_ in polys(x["g"]):
                posts = [q for q in town_sports.layout(p_, x["sport"], x["surface"])["props"] if q[0] in ("pole", "rpole")]
                for a_, b_ in zip(posts[0::2], posts[1::2]):
                    d.point((a_[1] + b_[1]) / 2, (a_[2] + b_[2]) / 2, S(531)); goals.append(((a_[1] + b_[1]) / 2, (a_[2] + b_[2]) / 2))
            rest = x["g"].boundary.difference(edge_no) if grass else x["g"].boundary.intersection(paved_core).difference(edge_no)
            for piece in lines(rest):
                if piece.length >= 2:
                    if grass:
                        d.line(piece, S(415), 2)
                    else:
                        sport_edges.append(piece)          # (drawn with the paved area's edges, by their rule)

    # ---- boundaries to confirm (995, a hidden helper: the owner's mapper, 2026-11-12): the edge of the ground not to be entered
    # where no wall, fence, hedge or building is known within 1.5 m — on the ground it is one of them. Where the LiDAR sees a wall
    # or a fence standing along it, that is drawn instead (LidarBars) ---------------------------------------------------------------
    known = union([g.buffer(1.5) for g, _, _ in s.walls] + [h.buffer(1.5) for h in s.hedges] + [B.buffer(1.0), frame.boundary.buffer(1.0), CLIP.boundary.buffer(1.0)])
    n, nw, lw = 0, 0, 0.0
    lb = LidarBars(env, t) if LIDAR_WALLS else None
    for piece in lines(a.OLIVE.boundary.difference(known)):
        if piece.length < 4:
            continue
        piece = piece.simplify(0.3)
        for sym, q in (lb.split(piece) if lb else [(None, piece)]):
            if sym is None:
                if q.length >= 4:
                    d.line(q, S(995), 4); n += 1
            else:
                d.line(q, sym, 1); nw += 1; lw += q.length
                wall_out.append({"pts": [[round(x - env.X0, 2), round(env.Y1 - y, 2)] for x, y in q.coords], "kind": "wall",
                                 "h": round(lb.height(q), 2), "imp": sym == S(515), "ret": False})
    log("boundaries to confirm", n, "walls and fences the LiDAR sees on them", nw, round(lw), "m")
    # The ground not to be entered is always outlined (ISSprOM 520: « The area shall always be delineated by a boundary line (at
    # least 0.1 mm in width) »; IOF Best practices 2025, n° 15: « mandatory even if the border in real is hard to identify »):
    # 520.9 wherever no wall, fence, building's outline or paved edge already draws its edge — along a hedge too.
    drawn = union([g.buffer(0.6) for g, _, _ in s.walls] + [B.buffer(0.4), frame.boundary.buffer(1.0), CLIP.boundary.buffer(1.0),
                                                           a.PAVED_ALL.boundary.buffer(0.3)])
    n = 0
    for piece in lines(merge_lines(a.OLIVE.boundary.difference(drawn))):
        if piece.length >= 1.0:
            d.line(piece.simplify(0.2), S(520, 9), 1); n += 1
    log("520 boundary lines", n)
    json.dump({"walls": wall_out, "origin": [env.X0, env.Y1], "res": R}, open(env.SRC / "walls.json", "w"))

    close_ends(env, s, a, d)

    # ---- the paved area's edge (501.1) where it meets anything but a building, a wall, a fence or a hedge. No kerb line inside the
    # paving (the owner, 2026-11-22: four parallel black lines along every street); none closer to another black line than 0.15 mm
    # (ISSprOM 3.3: two lines side by side would print as one) — there that line bounds the paving ---------------------------------
    near = [frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in s.walls] \
        + [G["imp_veg"].buffer(0.3)] * ("imp_veg" in G) + [m.buffer(0.8) for m in mouths]     # (the hedges as drawn)
    near_b = [B04]                                           # (the buildings: apart, see below)
    k_ = SCALE / 1000
    for o in d.objects:
        if o["otp"] == 2 and o["sym"] in BLACK:
            near.append(LineString([(env.CX + x * k_, env.CY + y * k_) for x, y in o["rings"][0]])
                        .buffer((0.05 + BLACK[o["sym"]] / 2 + LINE_GAP) * k_, cap_style="flat"))
    b_gap = (0.05 + 0.07 + LINE_GAP) * k_
    for g in polys(B):                                       # (a building's outline, 521.9)
        near_b.append(g.exterior.buffer(b_gap))
    no_line_o = union(near)
    no_line = union([no_line_o] + near_b)
    # … but an edge that comes up to a building is drawn up to it (the owner, 2026-11-24: « il faut dessiner le bord du jaune
    # jusqu'au bout, je ne sais pas pourquoi il s'arrête »): beside a building it is left out only where it runs along the
    # outline, over 1.5 m or more — there the outline bounds the paving
    outl = union([r for g in polys(B) for r in [g.exterior] + list(g.interiors)]) if not B.is_empty else None
    n = 0
    for piece in lines(merge_lines(union([a.PAVED_ALL.boundary] + sport_edges).difference(no_line_o).difference(B))):
        for q in lines(off_building_edges(piece, outl, near=b_gap + 0.1, run=1.5, step=0.25)):
            if q.length >= 2:
                d.line(q, S(501, 1), 2); n += 1
    log("paved area edges", n)
    # The carriageways' edges inside the paving (the owner, 2026-11-23: without them a town centre is one flat brown, its streets
    # gone — « le bord des routes a disparu, ce qui n'est pas bon »): the outline of the carriageways put together (closed and
    # opened by 1 m: no spike where two sections meet), where paving lies on both sides and no other black line — the paved
    # area's own edge, a building, a wall, a bridge's side — runs within 0.3 mm (there that line is the street's edge).
    KERB_GAP = 0.3 * k_
    carr = s.CARR.buffer(1.0, join_style="round").buffer(-2.0, join_style="round").buffer(1.0, join_style="round")
    k_no = union([no_line.buffer(KERB_GAP - LINE_GAP * k_), a.PAVED_ALL.boundary.buffer(KERB_GAP + 0.07 * k_), union(PASS).buffer(0.5), B])
    n = 0
    for piece in lines(carr.boundary.intersection(a.PAVED_ALL).difference(k_no)):
        if piece.length >= 6:                               # (a shorter piece between two other lines says nothing)
            d.line(piece.simplify(0.1), S(501, 1), 2); n += 1
    log("carriageway edges", n)
    # a passage's side (512.2) only where no other black line bounds the lower level (ISSprOM 512.2), as the lines are drawn
    OB = [LineString([(env.CX + x * k_, env.CY + y * k_) for x, y in o["rings"][0]]) for o in d.objects if o["otp"] == 2
          and o["sym"] in (S(521, 9), S(515), S(501, 1), S(513, 1), S(513, 2), S(516), S(518)) and len(o["rings"][0]) >= 2]
    if OB:
        ot = shapely.STRtree(OB)
        drop = []
        for o in d.objects:
            if o["sym"] == S(512, 2) and o["otp"] == 2:
                g = LineString([(env.CX + x * k_, env.CY + y * k_) for x, y in o["rings"][0]])
                nb = [OB[i] for i in ot.query(g.buffer(0.6))]
                if nb and g.intersection(union([q.buffer(0.6) for q in nb])).length >= 0.5 * g.length:
                    drop.append(id(o))
        d.objects[:] = [o for o in d.objects if id(o) not in drop]

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
    # (and only on paving: a stairway the generalisation left without its paving — a step between two gardens — is not drawn)
    pav = a.PAVED_ALL.buffer(0.3)
    steps = [(g, sw) for g, sw in a.stair_pieces if g.length > 0 and g.intersection(a.OLIVE_IN).length < 0.5 * g.length
             and g.intersection(pav).length >= 0.5 * g.length]
    # a stairway that runs along an uncrossable wall or fence is drawn clear of it, 0.15 mm between the two symbols (the owner,
    # 2026-11-24, east of the church: « pas terrible » — a stairway's boxes drawn into a fence's line and ticks)
    imp_l = [LineString([(env.CX + x * k_, env.CY + y * k_) for x, y in o["rings"][0]]) for o in d.objects
             if o["otp"] == 2 and o["sym"] in (S(515), S(518), S(529)) and len(o["rings"][0]) >= 2]
    imp_t = shapely.STRtree(imp_l) if imp_l else None
    moved = 0
    for i, (g, sw) in enumerate(steps):
        g2 = beside(g, sw, imp_l, imp_t, (0.2 + LINE_GAP) * k_, pav) if imp_t is not None else g
        moved += g2 is not g
        steps[i] = (g2, sw)
        d.line(g2.difference(B), S(532, stairs.symbol_sub(sw)), 1)
    # … and a fence's ticks point away from a stairway beside it (518 draws them on its right): the line is turned round
    flipped = 0
    for o in d.objects:
        if o["otp"] != 2 or o["sym"] != S(518) or len(o["rings"][0]) < 2:
            continue
        cs = [(env.CX + x * k_, env.CY + y * k_) for x, y in o["rings"][0]]
        L = LineString(cs)
        side = 0.0
        for g, sw in steps:
            if g.length < 1 or g.distance(L) > sw / 2 + 1.0 * k_:
                continue
            m = g.interpolate(0.5, normalized=True)
            at = L.project(m)
            p0, p1 = L.interpolate(max(0.0, at - 0.5)), L.interpolate(min(L.length, at + 0.5))
            side += g.length * (1 if (p1.x - p0.x) * (m.y - p0.y) - (p1.y - p0.y) * (m.x - p0.x) < 0 else -1)   # (+: on its right)
        if side > 0:
            o["rings"][0] = o["rings"][0][::-1]; flipped += 1
    log("stairways", len(steps), "drawn clear of a wall or fence", moved, "fences turned round", flipped)


    # ---- water lines, the railway ------------------------------------------------------------------------------------------------
    # (not over a bridge's deck: the deck is above the water — the owner, 2026-11-24, « a horizontal blue line » across a street's
    # bridge between the river's two areas: OSM's waterway line runs on under the bridge, the map's water stops at its sides)
    # Nor over any paving: a stream that passes under a street or a square is in a culvert there, whatever the sources say.
    wat = union([G.get("water", Polygon()).buffer(0.5), s.RUN_DECK.buffer(0.3) if not s.RUN_DECK.is_empty else None, a.PAVED_ALL])
    for g in s.streams:
        d.line(g.difference(wat).difference(B), S(305), 4.05, curve=True)      # (ISSprOM's minimum lengths: 1 mm, 4.11 mm)
    for g in s.ditches:
        d.line(g.difference(wat).difference(B).difference(a.OLIVE_IN), S(306), 16.5, curve=True)
    if not s.RAIL.is_empty:
        # the tracks cut over every underpass (ISSprOM 509)
        under = union(PASS)
        d.line(s.RAIL.intersection(CLIP).difference(under), S(509, 1), 3)
    a.steps_drawn = steps
    points(env, s, t, a, d)
    helpers(env, s, d)
    for o in d.objects:
        o.pop("deck", None)


GAP_M, TOUCH_M, OPEN_M, HW = 1.6, 0.08, 4.0, 0.8           # 0.4 mm between uncrossable features, 0.02 mm, 1 mm, a 0.4 mm line's half


class LidarBars:
    """The walls and fences the LiDAR sees along a line (the edge of the ground not to be entered where no source draws one): the
    returns that are neither ground, vegetation nor building, across the line every 0.5 m, from 2 m on one side to 2 m on the
    other. A wall is a narrow ridge within 1 m of the line (1.5 m wide at most: a parked car is wider), clear of objects 2 m away
    on one side at least (not a shed, a heap), far from a building (its walls, its eaves). A stretch of 4 m or more standing
    1.5-4 m high is an uncrossable wall (515), 0.6-1.5 m a passable one (513.1); the rest stays a boundary to confirm."""
    OFF = np.arange(-2.0, 2.01, 0.5)

    def __init__(self, env, t):
        from scipy.ndimage import maximum_filter, median_filter
        Z = np.load(env.SRC / "lidar_grids.npz")
        self.env, self.median = env, median_filter
        self.o = np.where(Z["zo"] > -1e8, Z["zo"] - t.dtm, 0.0).astype(np.float32)
        self.bld = maximum_filter(Z["n6"], 7) > 0           # (within 1.5 m of a building's returns)

    def _at(self, x, y, a):
        px, py = self.env.to_px(x, y)
        return a[np.clip(py.astype(int), 0, self.env.NY - 1), np.clip(px.astype(int), 0, self.env.NX - 1)]

    def height(self, l):
        pts = shapely.line_interpolate_point(l, np.arange(0, l.length + 1e-6, 0.5))
        v = self._at(shapely.get_x(pts), shapely.get_y(pts), self.o)
        return float(np.median(v)) if len(v) else 0.0

    def split(self, l):
        L = l.length
        ds = np.arange(0, L + 1e-6, 0.5)
        if len(ds) < 8:
            return [(None, l)]
        p0 = shapely.line_interpolate_point(l, np.clip(ds - 0.25, 0, L)); p1 = shapely.line_interpolate_point(l, np.clip(ds + 0.25, 0, L))
        tx, ty = shapely.get_x(p1) - shapely.get_x(p0), shapely.get_y(p1) - shapely.get_y(p0)
        tn = np.maximum(np.hypot(tx, ty), 1e-9); nx, ny = -ty / tn, tx / tn
        pts = shapely.line_interpolate_point(l, ds); X, Y = shapely.get_x(pts), shapely.get_y(pts)
        prof = np.stack([self._at(X + nx * o, Y + ny * o, self.o) for o in self.OFF], 1)   # (samples, 9 offsets)
        mid = prof[:, 2:7]                                  # within 1 m of the line
        h = mid.max(axis=1)
        wide = (prof >= np.maximum(0.6, 0.5 * h)[:, None]).sum(axis=1)
        clear = (prof[:, 0] < 0.6) | (prof[:, -1] < 0.6)
        b = self._at(X, Y, self.bld)
        c = np.where((h >= 1.5) & (h < 4.0), 2, np.where((h >= 0.6) & (h < 1.5), 1, 0))
        c[b | ~clear | (wide > 3)] = 0
        c = self.median(c, size=5, mode="nearest")          # (a gap of a metre — a gate, a missed return — bridged)
        out, i = [], 0
        while i < len(c):
            j = i
            while j < len(c) and c[j] == c[i]:
                j += 1
            a_, b_ = ds[i], ds[min(j, len(ds) - 1)]
            sym = {2: S(515), 1: S(513, 1)}.get(int(c[i]))
            if sym is not None and (b_ - a_ < 4.0 or (sym == S(513, 1) and b_ - a_ < PASSABLE_MIN[S(513, 1)])):
                sym = None
            if out and out[-1][0] == sym:                   # (neighbouring stretches of one kind joined)
                out[-1][2] = b_
            else:
                out.append([sym, a_, b_])
            i = j
        return [(sym, substring(l, a_, b_)) for sym, a_, b_ in out if b_ > a_]


def close_ends(env, s, a, d):
    """An uncrossable wall's or fence's end closer than 0.4 mm to another uncrossable feature (a building, the olive, water, a
    hedge, another such line) cannot be read nor run through: drawn on to it — unless a way runs between, then drawn back until
    0.4 mm are clear (ISSprOM 3.3: « closed or widened »). And two walls or fences facing each other under 1 mm apart (ISSprOM's
    least opening in them) are joined, or — a way through — drawn apart to 1 mm. An end already touching another feature closes
    nothing (a fence ending on the fence it crosses)."""
    k = SCALE / 1000
    to_m = lambda r: [(env.CX + x * k, env.CY + y * k) for x, y in r]
    G = a.GEOM
    areas_ = [p for g in (a.BLOCKS, a.OLIVE, G.get("water"), G.get("imp_veg")) for p in polys(g)]
    ways = union([l for l in list(s.path_lines) + list(s.small_lines) if l is not None and not l.is_empty]
                  + [g for g, _ in s.paved_paths] + [g for g, _ in a.stair_pieces] + [p[0] for p in s.passages])
    # (not a bridge's sides: drawn on to the feature beside them they came out as hooks — the owner, 2026-11-24)
    imp = [o for o in d.objects if o["otp"] == 2 and o["sym"] in (S(515), S(518)) and len(o["rings"][0]) >= 2 and not o.get("deck")]
    feats = [(None, p) for p in areas_] + [(o, LineString(to_m(o["rings"][0])).buffer(HW, cap_style="flat")) for o in imp]
    tree = shapely.STRtree([g for _, g in feats])
    n_close = n_back = 0
    for o in imp:
        cs = to_m(o["rings"][0])
        for end in (0, -1):
            e = Point(cs[end])
            near = [(feats[i][1].distance(e), i) for i in tree.query(e.buffer(GAP_M + HW)) if feats[i][0] is not o]
            if not near or min(near)[0] <= TOUCH_M + HW:
                continue                                   # (touching already: closed)
            dd, i = min(near)
            if dd >= GAP_M:
                continue
            f_o, f_g = feats[i]
            tgt = LineString(to_m(f_o["rings"][0])) if f_o is not None else f_g.exterior
            q = nearest_points(tgt, e)[0]
            seg = LineString([e, q])
            L = LineString(cs)
            if not ways.is_empty and seg.buffer(0.3).intersects(ways):
                cut = GAP_M - dd + 0.05
                if L.length > cut + 1.5:
                    cs = list((substring(L, cut, L.length) if end == 0 else substring(L, 0, L.length - cut)).coords); n_back += 1
                continue
            cs = ([(q.x, q.y)] + cs) if end == 0 else (cs + [(q.x, q.y)]); n_close += 1
        o["rings"][0] = [list(env.mm(x, y)) for x, y in cs]
    # openings under 1 mm between two walls' or fences' ends facing each other
    ol = [o for o in d.objects if o["otp"] == 2 and o["sym"] in (S(513, 1), S(515), S(516), S(518)) and len(o["rings"][0]) >= 2
          and not o.get("deck")]
    ends = []
    for o in ol:
        cs = to_m(o["rings"][0])
        if math.dist(cs[0], cs[-1]) < 0.05:
            continue
        for end, nxt in ((0, 1), (-1, -2)):
            dx, dy = cs[end][0] - cs[nxt][0], cs[end][1] - cs[nxt][1]; nn = math.hypot(dx, dy)
            if nn > 1e-6:
                ends.append((o, end, cs[end], (dx / nn, dy / nn)))
    done, n_join = set(), 0
    for u, (oa, ea, pa, da) in enumerate(ends):
        for v in range(u + 1, len(ends)):
            ob, eb, pb, db = ends[v]
            if ob is oa or (id(oa), ea) in done or (id(ob), eb) in done:
                continue
            dd = math.dist(pa, pb)
            if dd <= TOUCH_M or dd >= OPEN_M:
                continue
            vx, vy = (pb[0] - pa[0]) / dd, (pb[1] - pa[1]) / dd
            if da[0] * vx + da[1] * vy < 0.8 or -(db[0] * vx + db[1] * vy) < 0.8:
                continue
            seg = LineString([pa, pb])
            if not ways.is_empty and seg.buffer(0.3).intersects(ways):
                cs = to_m(ob["rings"][0]); L = LineString(cs); cut = OPEN_M - dd + 0.05
                if L.length > cut + 1.5:
                    ob["rings"][0] = [list(env.mm(x, y)) for x, y in (substring(L, cut, L.length) if eb == 0 else substring(L, 0, L.length - cut)).coords]
                    done.add((id(ob), eb))
                continue
            cs = to_m(oa["rings"][0])
            cs = ([pb] + cs) if ea == 0 else (cs + [pb])
            oa["rings"][0] = [list(env.mm(x, y)) for x, y in cs]
            done |= {(id(oa), ea), (id(ob), eb)}; n_join += 1
    env.log("uncrossable ends closed", n_close, "drawn back", n_back, "openings joined", n_join)


def at_size(g, w, a):
    """The parts of an area at least w m wide (opened, mitred), the pieces of a m² or more."""
    if g is None or g.is_empty:
        return Polygon()
    o = g.buffer(-w / 2, join_style="mitre").buffer(w / 2, join_style="mitre")
    o = shapely.make_valid(o).intersection(g) if not o.is_empty else o
    return union([q for q in polys(o) if q.area >= a])


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


def beside(g, sw, imp_l, imp_t, gap, pav):
    """The stairway's line moved sideways so that its symbol (sw m wide) stays `gap` m clear of the uncrossable line it runs along
    (half its length or more within that distance); left where it is when the move would take it off the paving."""
    need = sw / 2 + gap
    near = [imp_l[i] for i in imp_t.query(g.buffer(need))]
    near = [l for l in near if l.distance(g) < need]
    if not near or g.length < 0.5:
        return g
    I = union(near)
    if g.intersection(I.buffer(need)).length < 0.5 * g.length:
        return g                                           # (it crosses or meets the wall: not alongside)
    mid = g.interpolate(0.5, normalized=True)
    q = nearest_points(I, mid)[0]
    dx, dy = mid.x - q.x, mid.y - q.y
    n = math.hypot(dx, dy)
    if n < 0.05:                                           # (on the line itself: to the side with more paving)
        a_, b_ = g.interpolate(0.4, normalized=True), g.interpolate(0.6, normalized=True)
        ux, uy = b_.x - a_.x, b_.y - a_.y; m = math.hypot(ux, uy) or 1
        c = [shapely.affinity.translate(g, -uy / m * need * sg, ux / m * need * sg) for sg in (1, -1)]
        best = max(c, key=lambda x: x.intersection(pav).length)
        return best if best.intersection(pav).length >= 0.5 * best.length else g
    sh = need - n + 0.02
    if sh <= 0:
        return g
    g2 = shapely.affinity.translate(g, dx / n * sh, dy / n * sh)
    return g2 if g2.intersection(pav).length >= 0.5 * g2.length and g2.distance(I) >= need - 0.3 else g


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


def off_building_edges(l, b_edge, near=1.0, run=2.0, step=0.5):
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
    # one line where two sources draw the same way a little apart (a path and the piece of it carried over a bridge: 2026-11-24,
    # two 505 lines over each other, their dashes out of step): the longer kept, the other only where it runs on alone
    kept = []
    for l in sorted(lines(merge_lines(u)), key=lambda q: -q.length):
        near = [k for k in kept if k.distance(l) < 0.6]
        if near:
            l = l.difference(union([k.buffer(0.6, cap_style="flat") for k in near]))
        kept += [q for q in lines(l) if q.length >= 2.0]
    parts = lines(merge_lines(union(kept))) if kept else []
    if not parts:
        return []
    # (each end against the lines as they then are: two ends facing each other across a footbridge were each drawn on to the
    # other — the bridge drawn twice, 2026-11-24)
    out, tree = list(parts), shapely.STRtree(parts)
    for i, l in enumerate(parts):
        cs = list(l.coords)
        for end in (0, -1):
            pt = Point(cs[end])
            near = [out[j] for j in tree.query(pt.buffer(snap)) if j != i]
            if not near:
                continue
            others = union(near); dist = others.distance(pt)
            if dist < 0.05 or dist > snap:
                continue
            q = nearest_points(others, pt)[0]
            cs = ([(q.x, q.y)] + cs) if end == 0 else (cs + [(q.x, q.y)])
        out[i] = LineString(cs)
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
            if not up.is_empty and up.area >= 2:           # its stripes at about 45° to the passage's axis — a short piece
                ax = pc                                    # joining a longer passage takes that one's: one hatching where they meet
                if pc.length < 6:
                    longer = [q for q in merged if q is not pc and q.length > pc.length and q.distance(pc) < 0.5]
                    ax = max(longer, key=lambda q: q.length) if longer else pc
                c0, c1 = ax.coords[0], ax.coords[-1]
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
                k0 = len(d.objects)
                d.line(at_least(q, 4.0), S(515), 1); n += 1    # (515's minimum: 1 mm)
                for o in d.objects[k0:]:
                    o["deck"] = True                       # (a bridge's side: straight along the deck, never drawn on to a neighbour)
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
    kept = [(p.x, p.y, 526) for p in s.monuments] + [(p.x, p.y, 311) for p in s.fountains] + [(p.x, p.y, 524) for p in s.masts]         + [(x, y, 531) for x, y in getattr(a, "goals", [])]             # (no tree over another point symbol)
    lone = 0
    n0 = len(kept)
    # (in open land or paving « with scattered trees » a prominent tree may stand: ISSprOM 402, « Symbols 417 and 418 may be added »)
    no = union([a.OLIVE_IN, a.BLOCKS, a.GEOM.get("water"), a.GEOM.get("forest")])
    shapely.prepare(no)
    # a tree's white mask over a hedge opens it on the map (the owner, 2026-11-24: « les deux arbres qui font qu'on peut traverser
    # la haie, c'est très problématique »): no tree symbol whose mask reaches an uncrossable hedge — the hedge is what matters
    hedge = a.GEOM.get("imp_veg")
    hedge = None if hedge is None or hedge.is_empty else hedge
    if hedge is not None:
        shapely.prepare(hedge)
    for pr, x, y, sym in cand:
        if no.contains(Point(x, y)):
            continue
        if hedge is not None and hedge.distance(Point(x, y)) < PT_MASK[sym] * SCALE / 1000 + 0.2:
            continue
        if any(math.dist((x, y), (k[0], k[1])) < (PT_R[sym] + PT_R[k[2]] + PT_GAP) * SCALE / 1000 for k in kept):
            continue                                       # no two symbols over each other
        kept.append((x, y, sym)); d.point(x, y, S(sym)); lone += pr == 2
    for p in s.fountains:
        d.point(p.x, p.y, S(311))
    clear_points(env, a, d, [(p.x, p.y, 526) for p in s.monuments] + [(p.x, p.y, 524) for p in s.masts])
    env.log("trees", len(kept) - n0, "of which LiDAR crowns standing alone", lone, "of", len(xy), "crowns")


UNCROSS = {S(515): 0.4, S(518): 0.4, S(529): 0.4, S(521, 9): 0.14}   # black lines one may not open: the point symbol moves
THIN = {S(501, 1): 0.1, S(513, 1): 0.21, S(513, 2): 0.21, S(516): 0.21, S(522, 9): 0.1, S(520, 9): 0.1}   # those that give way


def clear_points(env, a, d, pts):
    """Black point symbols never overlap nor touch another black symbol (IOF, Best practices for sprint mapping 2025: « shifting -
    so that the symbols do not overlap, do not touch and have sufficiently large gaps between them »; ISSprOM 3.3: « When a
    feature is enlarged, neighbouring features must be displaced so that the correct relative positions are maintained », and
    0.15 mm between symbols of one colour). A point symbol on or by an uncrossable wall, fence or building is moved off it, to
    0.15 mm, on the side open to the runner (the barrier is never shortened: that would open it on the map); a thin passable
    line — a paved edge, a passable wall — is cut back 0.15 mm round the symbol instead. The goals' crosses (531, placed
    earlier) get the same clearance from the thin lines."""
    k = SCALE / 1000
    to_m = lambda r: [(env.CX + x * k, env.CY + y * k) for x, y in r]
    hard = [(LineString(to_m(o["rings"][0])), UNCROSS[o["sym"]]) for o in d.objects
            if o["otp"] == 2 and o["sym"] in UNCROSS and len(o["rings"][0]) >= 2]
    ht = shapely.STRtree([g for g, _ in hard]) if hard else None
    closed = union([a.BLOCKS, a.OLIVE, a.GEOM.get("water"), a.GEOM.get("imp_veg")])
    moved, placed = 0, []
    for x, y, sym in pts:
        r = PT_R[sym]
        for _ in range(4):
            p = Point(x, y)
            worst = None
            for i in (ht.query(p.buffer((r + 1.0) * k)) if ht is not None else []):
                g, w = hard[i]
                need = (r + LINE_GAP + w / 2) * k
                dd = g.distance(p)
                if dd < need - 0.02 and (worst is None or need - dd > worst[0]):
                    worst = (need - dd, g, need)
            if worst is None:
                break
            _, g, need = worst
            q = nearest_points(g, p)[0]
            dx, dy = x - q.x, y - q.y
            n = math.hypot(dx, dy)
            cands = []
            if n > 0.05:
                cands.append((q.x + dx / n * need, q.y + dy / n * need))
            at = g.project(p)
            u0, u1 = g.interpolate(max(0.0, at - 0.5)), g.interpolate(min(g.length, at + 0.5))
            ux, uy = u1.x - u0.x, u1.y - u0.y
            m = math.hypot(ux, uy) or 1.0
            cands += [(q.x - uy / m * need * sg, q.y + ux / m * need * sg) for sg in (1, -1)]
            ok = [c for c in cands if not closed.contains(Point(c))] or cands
            x, y = ok[0]
            moved += 1
        placed.append((x, y, sym))
        d.point(x, y, S(sym))
    # the thin lines give way round every black point symbol
    marks = placed + [(g_[0], g_[1], 531) for g_ in getattr(a, "goals", [])]
    if marks:
        tree = cKDTree([(env.mm(x, y)) for x, y, _ in marks])
        out, cut = [], 0
        for o in d.objects:
            if o["otp"] != 2 or o["sym"] not in THIN or len(o["rings"][0]) < 2:
                out.append(o); continue
            g = LineString(o["rings"][0])
            hits = tree.query_ball_point(g.interpolate(0.5, normalized=True).coords[0], g.length / 2 + 2.0)
            discs = [Point(env.mm(*marks[i][:2])).buffer(PT_R[marks[i][2]] + LINE_GAP + THIN[o["sym"]] / 2) for i in hits]
            discs = [c for c in discs if c.intersects(g)]
            if not discs:
                out.append(o); continue
            cut += 1
            for q in lines(g.difference(union(discs))):
                if q.length >= 0.5:                        # (mm: a shorter stub says nothing)
                    out.append({**o, "rings": [[list(c) for c in q.coords]]})
        d.objects[:] = out
        env.log("black point symbols moved off a barrier", moved, "thin lines cut back round them", cut)


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
