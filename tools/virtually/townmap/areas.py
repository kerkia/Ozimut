"""The ground's areas as ONE partition: every point of the map belongs to exactly one face, every face to one class.

The first generator stacked layers (raster classes, the cadastre, road bands, OSM outlines), cut each out of the next and
repaired what did not meet: forest was « what nothing covers », so every mismatch showed as a white strip (3 657 of Gif's
4 133 legibility errors, 2026-11-22). Here:

1. base     the ground's cover read on the LiDAR and the photograph, generalised as a mapper would draw it (no patch under a
            readable size), as a raster that covers everything;
2. layers   what has a vector source, in priority order (a building over water over a hedge over … over the base);
3. faces    the outlines of all of them noded together and polygonised once: faces that share their edges exactly; each face
            takes the class of the first layer that holds it, else the base's — and inside one zone of the vector sources (a
            parcel, a square) the base is one class when one class makes most of it: the photograph votes, it does not draw;
4. general  on the faces (generalise): parts under the symbols' minimum width and areas under their minimum area go to the
            neighbour they share most edge with — never back to their own class; runnable ground squeezed under 0.4 mm between
            two uncrossable features (areas, and walls as printed) is closed with the uncrossable feature beside it, unless it is
            a way (a narrow strip joining two places, a path through it, or closing it would shut ground off): kept, and the
            more yielding feature beside it pushed back to 0.4 mm; ground no way reaches is not to be entered (ISSprOM 520), or
            part of the building that encloses it; passes until the areas settle, then the needles taken out — each rule the
            legibility check's own measure, so that the check has nothing to report;
5. dissolve one geometry a class, simplified together (shared edges stay shared).

run(env, s, t) → a namespace: GEOM {class: geometry}, cl (the classes as a raster, for build.py), and the unions the later
stages read (PAVED_ALL, OLIVE, BLOCKS…)."""
import math
from types import SimpleNamespace

import numpy as np
import shapely
import shapely.ops
from scipy.ndimage import binary_dilation, binary_opening, distance_transform_edt, gaussian_filter, label
from shapely.geometry import shape

from . import stairs
from .env import BLOCKING, K, KNAME, R, RUNNABLE, area_of, lines, merge_lines, polys, union
from .sources import NO_ENTRY
from .terrain import height_of

GRID = 0.01                                                # every vertex on a 1 cm grid: no near-coincident edges
# what a mapper can draw and a runner can read at 1:4000 (ISSprOM 2019-2: minimum widths and areas, 1 mm = 4 m)
MIN_W = {"forest": 1.5, "open": 1.5, "open_t": 9.0, "slow": 1.7, "walk": 1.7, "paved": 1.5, "paved_t": 1.6, "heavy": 1.5,
         "private": 1.62, "building": 2.1, "water": 1.3, "imp_veg": 1.62}   # (0.3-0.5 mm; a building 0.5 mm; the olive 0.4 mm —
# the specification's 0.25 mm left strips a metre wide along the paths: the owner, 2026-11-24, « trop petit »)
# (the areas: a piece on its own must be large enough to mean something to a runner — the owner, 2026-11-24, of pieces at the
# specification's bare minimum, 0.5 mm²: a 9 m² triangle of open land by a driveway « mal dessiné », a 260 m² patch of scattered
# trees. Open land 1.5 mm², scattered trees 25 mm²: a few dots. The olive keeps its small pieces — a walled nook no way reaches —
# but not its strips: see MIN_W)
MIN_A = {"forest": 16, "open": 25, "open_t": 400, "slow": 16, "walk": 16, "paved": 8, "paved_t": 16, "heavy": 8, "private": 4,
         "imp_veg": 5, "water": 8, "building": 4}
GAP = 1.7                                                  # two uncrossable features 0.4 mm apart at least (1.6 m)
# a way (a corridor kept narrow) of a class that cannot be drawn narrow is drawn as the class it is a form of: open land with
# scattered trees (402: 2.2 mm wide at least) along a garden path is open land
NARROW_AS = {"open_t": "open", "paved_t": "paved"}
# from what size a narrow part is seen (m²; legibility.py's: 0.6 × the specification's minimum width squared, 0.5 m² at least —
# a white strip from 0.05 m²)
SPEC_W = {"forest": 1.2, "open": 1.2, "open_t": 8.8, "slow": 1.6, "walk": 1.6, "paved": 1.4, "paved_t": 8.8, "heavy": 1.4,
          "private": 1.0, "building": 2.0, "water": 1.2, "imp_veg": 1.6}      # (the specification's minimum widths, m)
SEEN = {k: max(0.6 * (0.95 * w) ** 2, 0.5) for k, w in SPEC_W.items()}
SEEN["forest"] = 0.05
EDGE_TOL = 0.05                                            # the edges simplified within 5 cm (0.1 m broke more than it saved)
SETTLED = 50                                               # faces changed in a pass under which the areas have settled
PASSES = 4                                                 # the generalisation's passes after the first, at most
# the photograph's and the LiDAR's patches are drawn only when large enough to be meant (m²): smaller ones are noise — a car, a
# shadow, a flower bed (the owner, 2026-11-18: ragged edges; 2026-11-22: blobs)
PATCH = {"forest": 400, "open": 60, "open_t": 1500, "paved": 120, "slow": 60, "walk": 60}
WOOD_MIN = 2000                                            # a wood the LiDAR alone finds (m²); 400 with OSM or BD TOPO saying so
HEDGE_HALF = 0.85                                          # a hedge's half width: 411's minimum, 0.4 mm


def base_raster(env, s, t):
    """The ground's cover, cell by cell, generalised: forest (real woods only), open land, paving (bare ground by buildings),
    slow and walk vegetation. Trees outside the woods stand over what surrounds them — mown grass, paving — (the owner,
    2026-11-22): their cells take the nearest open cell's class."""
    NY, NX = env.NY, env.NX
    tall = (t.chm > 3.0) & (t.n5 > 0)
    canopy = gaussian_filter(tall.astype(np.float32), 6)
    green = t.ndvi > 0.12
    cl = np.full((NY, NX), K["open"], np.uint8)
    # bare, unbuilt ground: paving near buildings and streets (courtyards, forecourts), open land elsewhere (a field out of
    # season) — and by a sports ground (a run-up's bare earth is no paving)
    near_built = env.mask(union([s.B.buffer(12), s.PAVED.buffer(6)]))
    near_sport = env.mask(s.SPORTS.buffer(12).difference(s.SPORTS)) if not s.SPORTS.is_empty else np.zeros((NY, NX), bool)
    bare = binary_opening(~green & (t.lum > 60) & near_built & ~near_sport, iterations=4)   # (no tentacle under 4 m across)
    cl[bare] = K["paved"]
    # the public road space is paved — under its street trees too —, its grass (verges, planted strips) open land
    pub = env.mask(s.PUBLIC)
    cl[pub & ~(green & (t.chm < 2))] = K["paved"]
    cl[pub & green & (t.chm < 2)] = K["open"]
    # undergrowth and scrub by the LiDAR's middle returns
    mid = (t.chm > 0.5) & (t.chm <= 3.0) & ((t.n4 + t.n5) > 1)
    mid_cover = gaussian_filter(mid.astype(np.float32), 2.0)
    scrub = env.mask(s.SCRUB)
    cl[(mid_cover > 0.55) | scrub] = K["slow"]
    cl[mid_cover > 0.8] = K["walk"]
    # under a tree outside the woods: what lies round it
    _, (ri, ci) = distance_transform_edt(tall, return_indices=True)
    cl = cl[ri, ci]
    # woods: dense crowns over 2 000 m², or 400 m² where OpenStreetMap or BD TOPO draws a wood; never in a park, a garden, a
    # cemetery, where the ground under the trees is kept (OSM's own woods apart) …
    lab, _ = label(canopy > 0.6)
    size = np.bincount(lab.ravel())
    known = env.mask(union([s.WOODS, s.BD_WOODS]))
    share = np.bincount(lab.ravel(), weights=known.ravel().astype(float)) / np.maximum(size, 1)
    ok = (size >= WOOD_MIN / R / R) | ((size >= 400 / R / R) & (share > 0.5)); ok[0] = False
    # … nor in the public road space: an avenue's trees join into one long canopy, over a sidewalk (2026-11-22: a white band
    # along the D-road by the station)
    wood = ok[lab] & ~(env.mask(s.PARKS) & ~env.mask(s.WOODS)) & ~pub
    cl[wood] = K["forest"]
    # open land with scattered trees (402): grass under a good share of crowns that is no wood
    cl[(gaussian_filter(tall.astype(np.float32), 12) > 0.35) & ~wood & (cl == K["open"])] = K["open_t"]
    # generalised: each class's presence blurred over 2.5 m, each cell the strongest; then no patch under its class's size
    best = np.full(cl.shape, -1.0, np.float32); out = cl.copy()
    for v in np.unique(cl):
        c = gaussian_filter((cl == v).astype(np.float32), 2.5 / R, mode="nearest")
        m = c > best; out[m] = v; best[m] = c[m]
    for _ in range(2):
        small = np.zeros(out.shape, bool)
        for name, a in PATCH.items():
            lab, _ = label(out == K[name])
            sz = np.bincount(lab.ravel()); sm = sz < a / R / R; sm[0] = False
            small |= sm[lab]
        if not small.any():
            break
        _, (ri, ci) = distance_transform_edt(small, return_indices=True)
        out = out[ri, ci]
    return out, canopy


def vector_layers(env, s, t, stair_pieces):
    """What has a vector source, the first that holds a place wins. (name, class, geometry)"""
    # a shed of under 20 m² inside the ground not to be entered is left out (what lies there is generalised: nobody goes in)
    inner = s.PRIVATE.buffer(1.0)
    B = union([g for g in s.buildings if not (g.area < 20 and inner.contains(g))])
    B = B.buffer(0.35, join_style="mitre").buffer(-0.35, join_style="mitre")      # buildings that touch drawn as one
    # a passage through a building (a porch, a covered driveway) is cut out of it: a canopy over paving (ISSprOM 522)
    bpass = union([pc.buffer(max(2.5, w) / 2, cap_style="flat") for pc, w, _ in s.passages if through_building(s, pc)]).intersection(B)
    B = B.difference(bpass)
    hedge = union([h.buffer(HEDGE_HALF, cap_style="flat") for h in s.hedges]).difference(s.PRIVATE.buffer(-1.0))
    heavy = union([c for c, imp, _ in s.carr if imp <= 3])
    # paved footways and cycle paths at their width with the stairways' footprints (a stairway stands on paving)
    # — the ways of one width joined end to end before they are widened, with the decks that carry them, and the notches under
    # 0.3 mm between their bands closed (each way widened on its own left a wedge open on the outside of every bend where two ways
    # meet, a tooth where a footway reaches its wider bridge: the owner, 2026-11-24, a paved edge « in teeth »)
    byw = {}
    for g, fw in s.paved_paths:
        byw.setdefault(round(max(1.6, fw), 1), []).append(g)
    pp = [q.buffer(w / 2, cap_style="flat", join_style="round") for w, gs in byw.items() for q in lines(merge_lines(union(gs)))]
    if s.paved_paths:
        along = union([g for g, _ in s.paved_paths]).buffer(0.5)
        pp += [d["g"] for d in s.decks if d["kind"] == "path" and d["axis"].intersection(along).length >= 0.6 * d["axis"].length]
    paths_a = union(pp)
    if not paths_a.is_empty:
        paths_a = area_of(paths_a.buffer(0.6, quad_segs=4).buffer(-0.6, join_style="mitre", mitre_limit=2.0))
    # a stairway drawn stands on paving, also at the edge of the ground not to be entered (2026-11-22: one along a garden's edge,
    # hatched over the olive); one inside it is not drawn (draw.py) and makes no paving
    deep = s.PRIVATE.buffer(-1.0)
    stairs_a = union([g.buffer(sw / 2 + 0.2, cap_style="flat", join_style="mitre") for g, sw in stair_pieces
                      if g.length > 0 and g.intersection(deep).length < 0.5 * g.length])
    soft = union(s.paved_soft)
    return [("building", "building", B), ("water", "water", s.water), ("hedge", "imp_veg", hedge),
            ("bpass", "paved", bpass), ("heavy", "heavy", heavy), ("carriageway", "paved", s.CARR), ("stairs", "paved", stairs_a),
            ("private", "private", s.PRIVATE),
            ("paths", "paved", paths_a), ("pitch", "open", s.SP_OPEN), ("court", "paved", s.SP_PAVED), ("lawn", "open", s.GRASS),
            ("paved", "paved", union([s.PAVED, soft, s.PW_CORR])), ("wood", "forest", s.WOODS)], bpass


def through_building(s, pc):
    """A passage that runs through a building and leads out on both sides (not into a garden)."""
    ends = []
    for e, q in ((pc.coords[0], pc.coords[1]), (pc.coords[-1], pc.coords[-2])):
        dx, dy = e[0] - q[0], e[1] - q[1]; n = (dx * dx + dy * dy) ** 0.5 or 1
        ends.append(shapely.Point(e[0] + dx / n * 2, e[1] + dy / n * 2))
    if any(s.PRIVATE.buffer(0.5).contains(q) for q in ends):
        return False
    return pc.length > 0 and pc.intersection(s.B).length >= 0.6 * pc.length and not pc.intersects(s.DECK_ALL) \
        and (s.RAIL.is_empty or not pc.intersects(s.RAIL.buffer(4)))


def polygonise(geoms, frame):
    """The faces the outlines of `geoms` cut the frame into: noded on the grid, polygonised once."""
    b = [shapely.boundary(g) for g in geoms if g is not None and not g.is_empty] + [frame.boundary]
    net = shapely.union_all(np.array(b, dtype=object), grid_size=GRID)
    faces = shapely.get_parts(shapely.polygonize([net]))
    pts = shapely.point_on_surface(faces)
    keep = shapely.contains(shapely.buffer(frame, 0.001), pts) & (shapely.area(faces) > 1e-6)
    return faces[keep], pts[keep]


def lookup(pts, geoms, n_default=-1):
    """For each point, the index of the first geometry of `geoms` (exploded into parts) that holds it."""
    parts, owner = [], []
    for i, g in enumerate(geoms):
        ps = polys(g)
        parts += ps; owner += [i] * len(ps)
    out = np.full(len(pts), 10 ** 9, np.int64)
    if parts:
        a, b = shapely.STRtree(parts).query(pts, predicate="within")
        np.minimum.at(out, a, np.asarray(owner)[b])
    out[out == 10 ** 9] = n_default
    return out


def neighbours(faces):
    """(i, j, shared length), both ways, for the faces that share an edge. The faces come from one noded network, so a shared
    edge is the same segments in both: each segment is keyed by its two ends on the 1 cm grid and matched — no geometry
    operation (intersecting each small face's outline with a large neighbour's took 19 s on Gif)."""
    rings, fi = shapely.get_rings(faces, return_index=True)
    xy, ri = shapely.get_coordinates(rings, return_index=True)
    q = np.round(xy / GRID).astype(np.int64)
    same = ri[1:] == ri[:-1]                               # consecutive points of one ring: a segment
    p0, p1 = q[:-1][same], q[1:][same]
    f = fi[ri[:-1][same]]
    L = np.hypot(*(xy[1:][same] - xy[:-1][same]).T)
    swap = (p0[:, 0] > p1[:, 0]) | ((p0[:, 0] == p1[:, 0]) & (p0[:, 1] > p1[:, 1]))
    lo, hi = np.where(swap[:, None], p1, p0), np.where(swap[:, None], p0, p1)
    key = np.c_[lo, hi]
    order = np.lexsort(key.T[::-1])
    key, f, L = key[order], f[order], L[order]
    eq = (key[1:] == key[:-1]).all(axis=1) & (f[1:] != f[:-1])
    a, b, l = f[:-1][eq], f[1:][eq], L[:-1][eq]
    n = len(faces)
    pair = np.minimum(a, b) * n + np.maximum(a, b)
    u, inv = np.unique(pair, return_inverse=True)
    tot = np.bincount(inv, weights=l)
    i, j = u // n, u % n
    return np.r_[i, j], np.r_[j, i], np.r_[tot, tot]


def run(env, s, t):
    out = SimpleNamespace()
    frame = env.frame
    base, canopy = base_raster(env, s, t)
    env.log("base raster", {KNAME[v]: int((base == v).sum() * R * R) for v in np.unique(base)})
    out.stair_pieces = stairs.pieces(s)
    layers, out.BPASS = vector_layers(env, s, t, out.stair_pieces)
    vec = [area_of(shapely.set_precision(g.intersection(frame), GRID)) for _, _, g in layers]
    vclass = [k for _, k, _ in layers]

    # the base's patches as polygons with smooth shared edges — read where no vector source speaks: under a vector area the base
    # is carried in from outside, so that its edges run up to the vector's edge and stop, never along it
    from rasterio.features import shapes
    vmask = env.mask(union(vec[:-1]))
    _, (ri, ci) = distance_transform_edt(vmask, return_indices=True)
    base_v = base[ri, ci]
    rp, rv = [], []
    for geo, v in shapes(base_v, transform=env.transform()):
        rp.append(shape(geo)); rv.append(int(v))
    rp = shapely.coverage_simplify(np.array(rp, dtype=object), tolerance=1.5)
    rv = np.array(rv)
    env.log("base patches", len(rp))

    # ---- faces ---------------------------------------------------------------------------------------------------------------
    zone_lines = vec + [s.PUBLIC, s.PARCELS.intersection(frame) if not s.PARCELS.is_empty else None] + [p for p in s.parcels if p.intersects(frame)]
    faces, pts = polygonise(zone_lines + list(rp), frame)
    li = lookup(pts, vec)
    cls = np.array([K[vclass[i]] if i >= 0 else 0 for i in li], np.uint8)
    ri_ = lookup(pts, list(rp))
    free = cls == 0
    cls[free] = np.where(ri_[free] >= 0, rv[ri_[free]], K["open"])
    env.log("faces", len(faces), "from vector sources", int((~free).sum()))
    # one zone, one class where one class makes most of it: the zones are the faces of the vector sources alone
    zones, _ = polygonise(zone_lines, frame)
    zi = lookup(pts, list(zones))
    A = shapely.area(faces)
    if free.any():
        za = np.zeros((len(zones) + 1, 16)); np.add.at(za, (zi[free], cls[free]), A[free])
        tot = za.sum(axis=1); dom = za.argmax(axis=1)
        one = (za.max(axis=1) >= 0.85 * np.maximum(tot, 1e-9)) | (tot < 150)
        m = free & one[zi] & (zi >= 0)
        cls[m] = dom[zi[m]]
    out.n_faces = len(faces)
    GEOM, why = generalise(env, s, t, faces, cls)
    out.GEOM = GEOM
    out.why = why
    out.cl = np.zeros((env.NY, env.NX), np.uint8)
    for k, g in GEOM.items():                              # (a through road is paving to town_3d.py, which reads this raster)
        env.burn(g, K["paved" if k == "heavy" else k], out.cl)
    out.canopy = canopy
    out.PAVED_ALL = union([GEOM.get(k) for k in ("paved", "heavy", "paved_t")])
    out.OLIVE = GEOM.get("private", shapely.Polygon())
    out.OLIVE_IN = out.OLIVE.buffer(-1.0)
    out.BLOCKS = GEOM.get("building", shapely.Polygon())
    env.log("areas", {k: round(g.area) for k, g in GEOM.items()})
    return out


def generalise(env, s, t, faces, cls):
    """A first pass on the faces; the ways widened and the ground no way reaches closed on the result; then passes on the areas
    as they then are until they settle — the faces made again from their outlines, which also drops the zero-width whiskers
    the overlays leave —, a last look, the needles out (the owner, 2026-11-22: the generator's own steps make a clean map, no
    repair after it). Returns ({class: geometry}, the olive's origins)."""
    bars = printed_bars(env, s, t)
    # the ways the map draws over the areas (paths, stairways, passages): a gap one runs through is widened, never closed
    # (the paved footways and the streets as much as the unpaved paths: 2026-11-24, a paved footway's entrance into the ground
    # not to be entered, between the two corners of its corridor, was taken for a gap leading nowhere and closed — the way cut)
    env.WAYS = union([l for l in list(s.path_lines) + list(s.small_lines) if l is not None and not l.is_empty]
                     + [g for g, _ in s.paved_paths] + [g for gs in s.carr_lines.values() for g in gs]
                     + [g for g, _ in stairs.pieces(s)] + [p[0] for p in s.passages])
    faces, cls = thin_parts(env, faces=faces, cls=cls, bars=bars)
    cls, corr, _ = merge_small(env, faces, cls)
    GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
    GEOM = widen(env, GEOM, corr)
    GEOM, why = reach(env, s, t, GEOM)
    # simplified, then again until the areas settle (a merge or a widening can leave a narrow part of its own: a strip given to
    # the paving makes a spur of it; a few specks keep moving between neighbours, which more passes would not settle); the ways
    # found in the last pass are widened all the same. (Simplified first: a simplification moves an edge by up to 0.2 m, and a
    # 1.7 m way between two parcels came out under 0.4 mm when it came last — 2026-11-22)
    GEOM = simplify(GEOM)
    for _ in range(PASSES):
        faces, cls = thin_parts(env, GEOM=GEOM, bars=bars)
        cls, corr, n = merge_small(env, faces, cls)
        GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
        GEOM = widen(env, GEOM, corr)
        if n <= SETTLED:
            break
    GEOM = simplify_edges(GEOM, EDGE_TOL)                  # (the points the faces' noding left on straight edges)
    GEOM = sheds_in_olive(GEOM)
    GEOM = slots_in_buildings(GEOM)
    # the needles out, and a last look at the areas as they then are (what the widening, the simplification and the needles left
    # under the minimums) — twice: each can leave a little of the other's work
    n = 0
    for rnd in range(3):
        for _ in range(3):                                 # (an ear taken out can leave the next needle)
            GEOM, n1 = despike(GEOM)
            GEOM, n2 = deslit(GEOM)
            n += n1 + n2
            if not n1 + n2:
                break
        if rnd == 2:
            break
        faces, cls = thin_parts(env, GEOM=GEOM, bars=bars)
        cls, _, m = merge_small(env, faces, cls)
        GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
        if not m:
            break
    GEOM, m = leftovers(GEOM)
    env.log("needles taken out", n, "scraps given away", m)
    return GEOM, why


def leftovers(GEOM):
    """A piece under its class's minimum area that the last moves left (a needle's ear given to a neighbour it barely touches) goes
    to the neighbour it shares most edge with."""
    keys, parts = [], []
    for k, g in GEOM.items():
        ps = polys(g)
        parts += ps; keys += [k] * len(ps)
    tree = shapely.STRtree(parts)
    give, take = {}, {}
    for i, (k, p) in enumerate(zip(keys, parts)):
        if p.area >= MIN_A.get(k, 0) or p.area < 1e-4:
            continue
        rim = p.exterior.buffer(0.02)
        best, bl = None, 0.0
        for j in tree.query(rim):
            if j != i and keys[j] != k:
                l = parts[j].boundary.intersection(rim).length
                if l > bl:
                    best, bl = keys[j], l
        if best is not None:
            take.setdefault(k, []).append(p); give.setdefault(best, []).append(p)
    for k, ts in take.items():
        GEOM[k] = area_of(shapely.difference(GEOM[k], union(ts), grid_size=GRID))
    for k, ts in give.items():
        GEOM[k] = area_of(shapely.union(GEOM.get(k, shapely.Polygon()), union(ts), grid_size=GRID))
    return {k: g for k, g in GEOM.items() if not g.is_empty}, sum(len(v) for v in take.values())


def slots_in_buildings(GEOM):
    """Ground not to be entered in a slot under 0.4 mm between buildings is the buildings' (the owner, 2026-11-24, of a 1 m band
    of olive between two houses: « why not just removing the kaki band? » — nobody goes there and it cannot be read: buildings
    that close are drawn as one, ISSprOM 521). Runnable ground in such a slot is a way or a dead end: thin_parts' business."""
    B, O = GEOM.get("building"), GEOM.get("private")
    if B is None or O is None or B.is_empty or O.is_empty:
        return GEOM
    slot = area_of(B.buffer(GAP / 2, join_style="mitre").buffer(-GAP / 2, join_style="mitre").difference(B))
    take = [q for q in polys(area_of(shapely.intersection(slot, O, grid_size=GRID))) if q.area > 0.05]
    if take:
        T = union(take)
        GEOM["private"] = area_of(shapely.difference(O, T, grid_size=GRID))
        GEOM["building"] = area_of(shapely.union(B, T, grid_size=GRID))
    return {k: g for k, g in GEOM.items() if not g.is_empty}


def sheds_in_olive(GEOM, small=20.0):
    """A building under 20 m² amid the ground not to be entered (its outline 90 % along the olive) is the olive's: nobody goes
    in, it is generalised away (ISSprOM 520; the check's rule)."""
    if "building" not in GEOM or "private" not in GEOM:
        return GEOM
    ol = polys(GEOM["private"])
    tree = shapely.STRtree(ol)
    gone = []
    for q in polys(GEOM["building"]):
        if q.area < small:
            near = [ol[i] for i in tree.query(q.buffer(0.2))]
            if near and q.exterior.intersection(union(near).buffer(0.1)).length >= 0.9 * q.exterior.length:
                gone.append(q)
    if gone:
        U = union(gone)
        GEOM["building"] = area_of(shapely.difference(GEOM["building"], U, grid_size=GRID))
        GEOM["private"] = area_of(shapely.union(GEOM["private"], U, grid_size=GRID))
    return GEOM


def printed_bars(env, s, t):
    """The uncrossable walls and fences as printed (0.4 mm wide), open at the gates: ground squeezed between one and a building is
    a gap as between two areas (the owner's mapper: a fence 1 m from a house's wall)."""
    out = []
    for g, kind, ret in s.walls:
        for l in lines(g):
            if l.length >= 2 and (kind == "court" or wall_height(env, t, l, ret) >= 1.5):
                out.append(l.buffer(0.8, cap_style="flat"))
    b = union(out)
    return b.difference(s.GATES) if not b.is_empty and not s.GATES.is_empty else b


def thin_parts(env, faces=None, cls=None, GEOM=None, bars=None):
    """The faces cut again along the edge of each class's parts narrower than its minimum width: such a part becomes a face of
    its own, which merge_small() then gives to a neighbour. Returns the new faces and their classes (a thin one: class + 100)."""
    regions, rcls, cuts = [], [], []
    if GEOM is None:
        GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
    for name, g in GEOM.items():
        k = K[name]
        ps = polys(g)
        regions += ps; rcls += [int(k)] * len(ps)
        w = MIN_W.get(name)
        if not w:
            continue
        # (its parts too narrow for it but wide enough for its narrow form: that form)
        n2 = NARROW_AS.get(name)
        narrow = thinned(ps, MIN_W[n2], 0.95 * SPEC_W[n2]) if n2 else None
        cuts.append((int(k), thinned(ps, w, 0.95 * SPEC_W.get(name, w)), narrow))
    extra = [c for _, th, nw in cuts for c in th + (nw or [])]
    # runnable ground squeezed between two uncrossable areas under 0.4 mm apart (ISSprOM 3.3: « closed or widened »): cut out as
    # thin too — merge_small() fills it when it leads nowhere, keeps it as a way (widened) when it joins two places
    I = union([GEOM[k] for k in BLOCKING if k in GEOM] + [bars])
    pinch = area_of(I.buffer(GAP / 2).buffer(-GAP / 2).difference(I)) if not I.is_empty else shapely.Polygon()
    bl = [(p, k) for k in BLOCKING if k in GEOM for p in polys(GEOM[k])] + [(p, "bar") for p in polys(bars)]
    bt = shapely.STRtree([p for p, _ in bl]) if bl else None
    if bt is not None:
        # two corners near each other the closing barely touches: the hull of both features' parts by their nearest points (the
        # check's own measure of a gap: 2026-11-22, the ways between two parcels narrow at their corners)
        hulls = []
        P_ = np.array([p for p, _ in bl], dtype=object)
        ia, ib = bt.query(P_, predicate="dwithin", distance=GAP)
        keep_ = ib > ia
        ia, ib = ia[keep_], ib[keep_]
        dd_ = shapely.distance(P_[ia], P_[ib])
        sel = (dd_ > 0.08) & (dd_ < GAP)
        for i, j, dd in zip(ia[sel], ib[sel], dd_[sel]):
            pa, pb = P_[i], P_[j]
            u, v = shapely.ops.nearest_points(pa, pb)
            disk = shapely.LineString([u, v]).buffer(max(0.8, dd))
            bx = disk.bounds                               # (an olive parcel is large: cut to the disk's box first)
            h = union([shapely.clip_by_rect(pa, *bx).intersection(disk), shapely.clip_by_rect(pb, *bx).intersection(disk)]).convex_hull
            hulls.append(h.difference(union([shapely.clip_by_rect(P_[m], *h.bounds) for m in bt.query(h)])))
        pinch = union([pinch] + hulls)
    pinch = [q for q in polys(pinch) if q.area > 0.02]
    # (the wedge where two uncrossable features meet at an angle is a dead end, not a gap: left as it is — the check's rule)
    if pinch:
        keep = []
        for q in pinch:
            z = q.buffer(3 * GAP)
            nk = [bl[i] for i in bt.query(q.buffer(0.05)) if bl[i][0].distance(q) < 0.05]
            near = [p for p, _ in nk]
            # (nor the fillet the closing leaves in a feature's inner corner: a notch is one from 0.3 m², 0.1 m thick — filled,
            # it only moves the corner and the next pass fills the next fillet)
            if q.buffer(-0.05).is_empty or (len(near) <= 1 and q.area < 0.3):
                continue
            # (but a slot between two buildings is filled whatever: buildings that touch are drawn as one, ISSprOM 521)
            if sum(1 for _, c in nk if c == "building") >= 2:
                keep.append(q)
                continue
            # (between areas: a wall or a fence ending on a building beside the gap makes no wedge of it)
            parts = [p.intersection(z) for p, c in nk if c != "bar"]
            wedge = any(parts[u].distance(parts[v]) <= 0.08 for u in range(len(parts)) for v in range(u + 1, len(parts)))
            if not wedge:
                keep.append(q)
        pinch = keep
    f2, pts = polygonise(regions + extra + pinch, env.frame)
    r = lookup(pts, regions)
    c2 = np.array(rcls, np.int32)[np.maximum(r, 0)]
    c2[r < 0] = K["forest"] + 100                         # (a crack between two regions: a thin face, given to a neighbour)
    for k, th, _ in cuts:
        m = np.nonzero(c2 == k)[0]
        if th and len(m):
            c2[m[lookup(pts[m], th) >= 0]] = k + 100
    # a narrow part too small to be seen (the check's measure) is left as it is: a wedge's tip, which given
    # away comes back as another's (2026-11-22: thousands of slivers swapped between a building and the paving at every pass)
    for k, th, _ in cuts:
        ix = np.nonzero(c2 == k + 100)[0]
        if not len(ix):
            continue
        comps = polys(shapely.coverage_union_all(f2[ix]))
        tiny = [q for q in comps if q.area < SEEN.get(KNAME[k], 0.5)]
        if tiny:
            c2[ix[lookup(pts[ix], tiny) >= 0]] = k
    for k, th, nw in cuts:                                 # the narrow form where it fits
        if nw is None:
            continue
        m = np.nonzero(c2 == k + 100)[0]
        wide2 = lookup(pts[m], nw) < 0 if nw else np.ones(len(m), bool)
        c2[m[wide2]] = K[NARROW_AS[KNAME[k]]]
    if pinch:
        run_codes = np.array([K[k] for k in RUNNABLE])
        m = np.isin(c2 % 100, run_codes) & (lookup(pts, pinch) >= 0)
        c2[m] = c2[m] % 100 + 200
    env.log("faces after the thin parts' cut", len(f2), "thin", int((c2 >= 100).sum()))
    return f2, c2


def thinned(ps, w, w2=None):
    """The polygons' parts narrower than w, as polygons: each polygon less its opening — with the polygon's own edges, so that
    noding them adds no point along the rest of its outline (cutting with the openings themselves added some 20 % to the map's
    points, 2026-11-22). With w2, also what an opening at w2 leaves (the check's own width: a mitred opening is no granulometry,
    a wider one does not always take more)."""
    if not ps:
        return []
    a = np.array(ps, dtype=object)
    o = opened(a, w)
    if w2 and abs(w2 - w) > 1e-6:
        o2 = opened(a, w2)
        both = ~shapely.is_empty(o) & ~shapely.is_empty(o2)
        o = np.where(both, o, None)
        o[both] = shapely.intersection(o[both], o2[both])
        o = np.array([q if q is not None else shapely.Polygon() for q in o], dtype=object)
    # (only surfaces: an intersection or a mitred buffer can leave lines or an invalid ring beside them)
    bad = ~shapely.is_valid(o) | ~np.isin(shapely.get_type_id(o), (3, 6))
    if bad.any():
        o[bad] = [area_of(q) for q in o[bad]]
    full = shapely.is_empty(o)
    d = a.copy()
    if (~full).any():
        d[~full] = shapely.difference(a[~full], o[~full], grid_size=GRID)
    return [x for g in d for x in polys(area_of(g) if not g.is_valid or g.geom_type not in ("Polygon", "MultiPolygon") else g)
            if x.area > 1e-4]


def opened(a, w):
    """Each polygon's parts at least w wide (opened by w/2, mitred: a corner is no narrow part) — not cut to the polygon: only
    what the polygon less it leaves is used."""
    e = shapely.buffer(a, -w / 2, join_style="mitre")
    # (a core where a disk of w barely fits — a few square metres — makes no wide part: dilated, its mitred corners covered the
    # region or not by chance, as the check's own opening at its slightly smaller width; 2026-11-22, a 402 strip 3 m wide kept)
    parts, idx = shapely.get_parts(e, return_index=True)
    if len(parts):
        small = shapely.area(parts) < 0.05 * w * w
        if small.any():
            hit = np.unique(idx[small])
            for i in hit:
                keep = parts[(idx == i) & ~small]
                e[i] = shapely.union_all(keep) if len(keep) else shapely.Polygon()
    o = shapely.buffer(e, w / 2, join_style="mitre")
    bad = ~shapely.is_valid(o)
    if bad.any():
        o[bad] = [area_of(q) for q in o[bad]]
    return o


def merge_small(env, faces, cls):
    """Thin parts and faces under their class's minimum area go to the neighbouring class they share most edge with — but a
    thin strip of runnable ground that joins two places is a way (an alley between two houses, an entrance): it stays, and is
    widened afterwards. Returns the classes and the corridors' geometry."""
    A = shapely.area(faces)
    thin = cls >= 100
    pinch = cls >= 200                                     # (thin_parts: runnable ground between uncrossable areas)
    base = (cls % 100).astype(np.uint8)
    runnable = np.isin(base, [K[k] for k in RUNNABLE])
    # an area under its class's minimum: the faces a class's wide parts make together (a region is cut into several faces by the
    # cores and the gaps: a face's own size says nothing — 2026-11-22, pieces of buildings given away at every pass)
    small = np.zeros(len(faces), bool)
    pts = shapely.point_on_surface(faces)
    for k in np.unique(base):
        amin = MIN_A.get(KNAME[int(k)], 0)
        ix = np.nonzero((base == k) & ~thin)[0]
        if not amin or not len(ix) or A[ix].min() >= amin:
            continue
        tiny = [q for q in polys(shapely.coverage_union_all(faces[ix])) if q.area < amin]
        if tiny:
            small[ix[lookup(pts[ix], tiny) >= 0]] = True
    flag = thin | small
    a, b, L = neighbours(faces)
    m = flag[a]
    a, b, L = a[m], b[m], L[m]
    # corridors: connected groups of thin runnable faces that touch two or more different wide runnable faces
    n = len(faces); par = np.arange(n)

    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    tr = thin & runnable
    for i, j in zip(a, b):
        if tr[i] and tr[j]:
            par[find(i)] = find(j)
    # a corridor has uncrossable ground along its sides (60 % of its edge at least) and wide runnable ground at two ends: a thin
    # strip between two runnable areas is no way, only a strip too thin to draw
    blocking = ~runnable
    touch, blk, opn = {}, {}, {}
    for i, j, l in zip(a, b, L):
        if not tr[i]:
            continue
        r = find(i)
        if blocking[j]:
            blk[r] = blk.get(r, 0.0) + l
        elif not (tr[j] and find(j) == r):
            opn[r] = opn.get(r, 0.0) + l
            if not flag[j] and l > 0.5:
                touch.setdefault(r, set()).add(int(j))
    keep_root = {r for r, v in touch.items() if len(v) >= 2 and blk.get(r, 0.0) >= 0.6 * (blk.get(r, 0.0) + opn.get(r, 0.0))}
    corridor = np.array([bool(tr[i]) and find(i) in keep_root for i in range(n)])
    flag &= ~corridor
    # the rest: to the class sharing most of its edge (runnable ground to runnable ground when it has such a neighbour), wide faces
    # first — several rounds: a chain of thin faces resolves in turn. A thin part never goes back to its own class (its own core
    # is beside it: a spur, a strip along the edge stayed as it was — 2026-11-22, the white strips and parts under the minimum
    # widths), unless that is all there is; a thin runnable part with no other runnable ground beside it is a dead end: filled
    res = base.copy()
    todo = flag.copy()
    by = {}
    for i, j, l in zip(a, b, L):
        by.setdefault(int(i), []).append((int(j), float(l)))
    run_codes = {K[k] for k in RUNNABLE}
    # a gap that is no way is closed whole, with the uncrossable class beside it most (face by face, its middle waited for its
    # edges to be filled: a pass each — 2026-11-22)
    gp = np.arange(n)

    def gfind(x):
        while gp[x] != x:
            gp[x] = gp[gp[x]]; x = gp[x]
        return x
    pz = pinch & todo
    for i, j in zip(a, b):
        if pz[i] and pz[j]:
            gp[gfind(i)] = gfind(j)
    gtally = {}
    for i, j, l in zip(a, b, L):
        if pz[i] and blocking[j] and not todo[j]:
            d_ = gtally.setdefault(gfind(i), {}); d_[int(base[j])] = d_.get(int(base[j]), 0.0) + l
    # … unless a path or a stairway runs through it, or closing it shuts ground off that a way reached (the check's own test; a
    # way's mouth at a junction of corridors through the olive is no corridor by its shape — 2026-11-22: two pieces of a public
    # way's ground enclosed): then it is a way
    groups = {}
    for i in np.nonzero(pz)[0]:
        groups.setdefault(gfind(i), []).append(int(i))
    ftree = shapely.STRtree(faces)
    ways = []
    WAYS = getattr(env, "WAYS", None)
    wtree = shapely.STRtree(lines(WAYS)) if WAYS is not None and not WAYS.is_empty else None
    for r_, ix in groups.items():
        g_ = union(list(faces[ix]))
        crossed = wtree is not None and any(g_.intersects(l) for l in wtree.geometries.take(wtree.query(g_)))
        if r_ in gtally and (crossed or shuts(faces, runnable, ftree, ix)):
            gtally.pop(r_)
            cs = {}
            for i in ix:
                cs[int(base[i])] = cs.get(int(base[i]), 0.0) + A[i]
            k_ = max(cs, key=cs.get)
            k_ = K.get(NARROW_AS.get(KNAME[k_]), k_)          # (one area, of the class most of it has)
            for i in ix:
                todo[i] = False; res[i] = k_
            ways.append((g_, KNAME[k_]))
    for i in np.nonzero(pz)[0]:
        t_ = gtally.get(gfind(i))
        if t_:
            res[i] = max(t_, key=t_.get); todo[i] = False
    patient = True
    for _ in range(12):
        changed = waited = False
        for i in np.nonzero(todo)[0]:
            if pinch[i] and not any(blocking[j] for j, _l in by.get(int(i), [])):
                todo[i] = False; changed = True             # (a gap between two walls alone: the walls' ends are draw.py's)
                continue
            tally = {}
            for j, l in by.get(int(i), []):
                if not todo[j]:
                    tally[int(res[j])] = tally.get(int(res[j]), 0.0) + l
            if thin[i] and len(tally) > 1:
                tally.pop(int(base[i]), None)
            elif thin[i] and patient and set(tally) <= {int(base[i])} and any(todo[j] for j, _l in by.get(int(i), [])):
                waited = True                              # (its other neighbours not decided yet: wait for them)
                continue
            if pinch[i] and any(c not in run_codes for c in tally):   # (a gap that is no way: closed)
                tally = {c: l for c, l in tally.items() if c not in run_codes}
            elif runnable[i] and any(c in run_codes for c in tally):
                tally = {c: l for c, l in tally.items() if c in run_codes}
            if tally:
                res[i] = max(tally, key=tally.get); todo[i] = False; changed = True
        if not changed:
            if waited and patient:
                patient = False                            # (all waiting on each other: settle as they are)
                continue
            break
    # the corridors, each with its class (the one most of its surface has): its widening is that class too
    corr = []
    for r in keep_root:
        ix = [i for i in np.nonzero(corridor)[0] if find(i) == r]
        cs = {}
        for i in ix:
            cs[int(base[i])] = cs.get(int(base[i]), 0.0) + A[i]
        k_ = max(cs, key=cs.get)
        k_ = K.get(NARROW_AS.get(KNAME[k_]), k_)
        res[ix] = k_
        corr.append((union(list(faces[ix])), KNAME[k_]))
    corr += ways
    env.log("thin or small faces merged", int((res != base)[flag].sum()), "of", int(flag.sum()), "left", int(todo.sum()), "corridors", len(keep_root),
            "gaps kept as ways", len(ways))
    return res, corr, int((res != base)[flag].sum())


def shuts(faces, runnable, tree, ix, r=12.0):
    """Would the faces ix, made uncrossable, cut off a piece of the runnable ground round them (20 m² or more) that reached
    beyond a window of r m before?"""
    G_ = union(list(faces[ix]))
    W_ = G_.buffer(r)
    own = set(ix)
    bx = W_.bounds                                         # (a street's paving is one face: cut to the window first)
    rf = [shapely.clip_by_rect(faces[m], *bx) for m in tree.query(W_) if runnable[m] and m not in own]
    rf = [q for q in rf if not q.is_empty]
    if not rf:
        return False
    rim = W_.exterior
    free0 = union(rf + [G_]).intersection(W_)
    free1 = union(rf).intersection(W_)
    out0 = union([q for q in polys(free0) if q.distance(rim) < 0.05])
    return any(q.area >= 20 and q.distance(rim) >= 0.05 and q.intersects(out0) for q in polys(free1))


def widen(env, GEOM, corr):
    """A way narrower than 0.4 mm between uncrossable features is widened to it (ISSprOM: « closed or widened »; the owner,
    2026-11-15: « widen the entrances just enough »): each corridor grows by what it lacks, taken from the olive, the hedge or
    the building beside it — the water under a footbridge too —, with what that leaves of the feature under its minimum width;
    what it takes is the corridor's own class (a way is one area, not an alley of open land between two strips of paving)."""
    grow = {}
    for g, cname in corr:
        for q in polys(g):
            w = 2 * q.area / max(q.length, 1e-6)
            d = min(0.9, max(0.0, (GAP - w) / 2))
            if d > 0.02:
                grow.setdefault(cname, []).append(q.buffer(d, quad_segs=2))     # (round: a mitred corner would be a spike)
    # and wherever two uncrossable features beside a way are closer than 0.4 mm, the more yielding one (the olive, then a hedge, a
    # building, water) is pushed back to 0.4 mm from the other — a corridor's mean width hid its narrowest point (2026-11-22)
    order = ("private", "imp_veg", "building", "water")
    bl = [(p, k) for k in order if k in GEOM for p in polys(GEOM[k])]
    bt = shapely.STRtree([p for p, _ in bl]) if bl else None
    for g, cname in corr:
        if bt is None:
            break
        for q in polys(g):
            zone = q.buffer(GAP)
            nb = [bl[i] for i in bt.query(zone) if bl[i][0].distance(q) < 0.1]
            for u in range(len(nb)):
                for v in range(u + 1, len(nb)):
                    (pa, ka), (pb, kb) = nb[u], nb[v]
                    if pa.distance(pb) >= GAP:
                        continue
                    victim, other = (pa, pb) if order.index(ka) <= order.index(kb) else (pb, pa)
                    bx = zone.buffer(GAP + 0.1).bounds         # (an olive parcel can be large: cut to the place first)
                    cut = shapely.clip_by_rect(victim, *bx).intersection(shapely.clip_by_rect(other, *bx).buffer(GAP + 0.05)).intersection(zone)
                    if not cut.is_empty and cut.area > 0.01:
                        grow.setdefault(cname, []).append(cut)
    n, taken = 0, 0.0
    for cname, gs in grow.items():
        W = shapely.set_precision(union(gs), GRID)
        take = shapely.Polygon()
        for k in ("private", "imp_veg", "building", "water"):    # (a footbridge over a stream too: drawn 0.4 mm wide)
            if k in GEOM:
                x = area_of(shapely.intersection(GEOM[k], W, grid_size=GRID))
                if not x.is_empty:
                    GEOM[k] = area_of(shapely.difference(GEOM[k], x, grid_size=GRID)); take = take.union(x)
                    # (and what that leaves of the feature too narrow for it: a strip of a building along the way)
                    bx = W.buffer(3 * MIN_W[k]).bounds           # (cut to the place: the clip's own edges are far from W)
                    Wb = W.buffer(MIN_W[k])
                    near = [q for q in (shapely.clip_by_rect(p, *bx) for p in polys(GEOM[k]) if p.intersects(Wb)) for q in polys(q)]
                    th = [q for q in thinned(near, MIN_W[k]) if q.intersects(W.buffer(0.05))]
                    if th:
                        y = area_of(union(th))
                        GEOM[k] = area_of(shapely.difference(GEOM[k], y, grid_size=GRID)); take = take.union(y)
        if not take.is_empty:
            GEOM[cname] = area_of(shapely.union(GEOM.get(cname, shapely.Polygon()), take, grid_size=GRID))
        n += len(gs); taken += take.area
    env.log("corridors widened", n, round(taken), "m² taken")
    return GEOM


def reach(env, s, t, GEOM):
    """Ground no way reaches (ISSprOM: « areas entirely enclosed within uncrossable features should be filled with 520 »,
    « inaccessible areas inside building blocks are part of the building »): the runnable ground less the uncrossable lines
    (walls and fences 1.5 m high or more, open at the gates; the railway, open under the road decks) falls into pieces; a piece
    that does not touch the map's edge is not reached — the building's when buildings make 85 % of its edge, an island's left as
    it is when water makes 60 %, else olive."""
    bars = []
    for g, kind, ret in s.walls:
        for l in lines(g):
            if l.length >= 2 and (kind == "court" or wall_height(env, t, l, ret) >= 1.5):
                bars.append(l.buffer(0.3, cap_style="flat"))
    bar = union(bars).difference(s.GATES).difference(s.PASSES)
    if not s.RAIL.is_empty:
        bar = union([bar, s.RAIL.buffer(0.6).difference(s.RUN_DECK).difference(s.PASSES)])
    run_ = union([GEOM[k] for k in GEOM if k in RUNNABLE])
    free = area_of(shapely.difference(run_, bar, grid_size=GRID)) if not bar.is_empty else run_
    # the passages join what the buildings and the railway part
    free = union([free, s.PASSES.intersection(env.frame)])
    edge = env.frame.exterior
    Bb = GEOM.get("building", shapely.Polygon()).buffer(0.4)
    Wb = GEOM.get("water", shapely.Polygon()).buffer(0.5)
    olive, build = [], []
    for q in polys(free):
        if q.area < 0.5 or q.distance(edge) <= 1.0:
            continue
        L = q.exterior.length
        if not Wb.is_empty and q.exterior.intersection(Wb).length >= 0.6 * L:
            continue
        (build if q.exterior.intersection(Bb).length >= 0.85 * L else olive).append(q)
    why = {"parcel_school_private_rail": s.PRIVATE, "reach": union(olive)}
    if olive or build:
        # the pieces with the bars' own strips inside them, cut from the runnable classes exactly
        U = shapely.set_precision(union([q.buffer(0.31) for q in olive + build]).intersection(run_), GRID)
        UB = shapely.set_precision(union([q.buffer(0.31) for q in build]).intersection(run_), GRID) if build else shapely.Polygon()
        for k in [k for k in GEOM if k in RUNNABLE]:
            GEOM[k] = area_of(shapely.difference(GEOM[k], U, grid_size=GRID))
        if not UB.is_empty:
            GEOM["building"] = area_of(shapely.union(GEOM.get("building", shapely.Polygon()), UB, grid_size=GRID))
        GEOM["private"] = area_of(shapely.union(GEOM.get("private", shapely.Polygon()), shapely.difference(U, UB, grid_size=GRID), grid_size=GRID))
    env.log("ground no way reaches: 520", len(olive), round(sum(q.area for q in olive)), "m², building", len(build), round(sum(q.area for q in build)), "m²")
    return {k: g for k, g in GEOM.items() if not g.is_empty}, why


_WH = {}


def wall_height(env, t, piece, ret):
    """A wall's height: the LiDAR's along it, and for a retaining wall the drop of the ground between its two sides."""
    key = (piece.wkb, ret)
    if key not in _WH:
        h = height_of(env, t, piece)
        if ret:
            a, b = piece.parallel_offset(1.2, "left"), piece.parallel_offset(1.2, "right")
            if not a.is_empty and not b.is_empty:
                h = max(h, abs(float(np.median(env.along(a, t.dtm))) - float(np.median(env.along(b, t.dtm)))))
        _WH[key] = h
    return _WH[key]


def simplify(GEOM, tol=0.2):
    """Every class's outline simplified together, 5 cm on the map: shared edges stay shared."""
    keys, parts = [], []
    for k, g in GEOM.items():
        ps = polys(g)
        parts += ps; keys += [k] * len(ps)
    simp = shapely.coverage_simplify(np.array(parts, dtype=object), tolerance=tol)
    out = {}
    for k, g in zip(keys, simp):
        if not g.is_empty:
            out.setdefault(k, []).append(g)
    return {k: area_of(shapely.coverage_union_all(np.array(v, dtype=object))) for k, v in out.items()}


def _sharp(xy, turn):
    """The points of a ring (its last point not repeated) where the outline turns by `turn` degrees or more, with the lengths of
    the segments before and after each point."""
    u = xy - np.roll(xy, 1, axis=0); v = np.roll(xy, -1, axis=0) - xy
    nu, nv = np.hypot(u[:, 0], u[:, 1]), np.hypot(v[:, 0], v[:, 1])
    cos = (u * v).sum(axis=1) / np.maximum(nu * nv, 1e-18)
    return np.nonzero((nu > 1e-9) & (nv > 1e-9) & (cos <= math.cos(math.radians(turn))))[0], nu, nv


def deslit(GEOM, turn=165.0, area=0.05):
    """A needle too thin to be cut on the 1 cm grid (a slit: the outline goes out and comes back along itself) has its tip taken
    out of every ring it is a needle of — the area on the other side has the same tip as a crack: both lose it, and stay one
    coverage."""
    out, n = {}, 0
    for k, g in GEOM.items():
        ps, touched = [], False
        for p in polys(g):
            rings, hit = [], False
            for ring in [p.exterior] + list(p.interiors):
                xy = np.asarray(ring.coords)[:-1]
                if len(xy) > 3 and len(_sharp(xy, turn)[0]):
                    cs = [tuple(q) for q in xy]
                    changed = True
                    while changed and len(cs) > 3:
                        changed = False
                        for i in _sharp(np.asarray(cs), turn)[0]:
                            a, b, c = cs[i - 1], cs[i], cs[(i + 1) % len(cs)]
                            if abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2 < area:
                                del cs[i]; n += 1; changed = hit = True
                                break
                    rings.append(cs)
                else:
                    rings.append(None)
            if not hit:
                ps.append(p); continue
            touched = True
            ext = rings[0] if rings[0] is not None else list(p.exterior.coords)[:-1]
            holes = [r if r is not None else list(h.coords)[:-1] for r, h in zip(rings[1:], p.interiors)]
            if len(ext) >= 3:
                q = shapely.Polygon(ext, [r for r in holes if len(r) >= 3])
                ps.append(q if q.is_valid else area_of(q))
        out[k] = (area_of(union(ps)) if ps else shapely.Polygon()) if touched else g
    return {k: g for k, g in out.items() if not g.is_empty}, n


def despike(GEOM, turn=165.0, seg=0.3):
    """Needles out of the outlines: a point where an outline turns back on itself (an angle under 15°, both sides 0.3 m long or
    more) is a spike of one area into its neighbour, or a crack of the neighbour into it — read nowhere, drawn as a black
    hairline (2026-11-22: 19 spikes in the paving, the remarks' test 1). The ear (the point and its two neighbours) goes to the
    area on the far side of its tip, all areas at once: shared edges stay shared."""
    keys, parts = [], []
    for k, g in GEOM.items():
        ps = polys(g)
        parts += ps; keys += [k] * len(ps)
    tree = shapely.STRtree(parts)
    give = {}                                              # class → [triangles it gains]; take: class → [triangles it loses]
    take, done = {}, []
    n = 0
    for k, p in zip(keys, parts):
        for ring in [p.exterior] + list(p.interiors):
            xy = np.asarray(ring.coords)[:-1]
            m = len(xy)
            if m < 4:
                continue
            ix, nu, nv = _sharp(xy, turn)
            cs = [tuple(q) for q in xy] if len(ix) else []
            for i in ix:
                a, b, c = cs[i - 1], cs[i], cs[(i + 1) % m]
                if nu[i] < seg or nv[i] < seg:
                    continue
                tri = shapely.Polygon([a, b, c])
                if tri.area < 1e-4 or any(tri.intersection(q).area > 1e-4 for q in done if q.intersects(tri)):
                    continue                               # (the same needle seen from the area beside it: one move)
                mid = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
                dx, dy = b[0] - mid[0], b[1] - mid[1]; dn = math.hypot(dx, dy) or 1
                beyond = shapely.Point(b[0] + dx / dn * 0.05, b[1] + dy / dn * 0.05)
                inside = p.contains(tri.representative_point())
                other = [keys[j] for j in tree.query(beyond if inside else tri.representative_point())
                         if parts[j] is not p and parts[j].contains(beyond if inside else tri.representative_point())]
                if not other:
                    continue
                done.append(tri)
                if inside:                                 # a spike of k: to the area beyond its tip
                    take.setdefault(k, []).append(tri); give.setdefault(other[0], []).append(tri)
                else:                                      # a crack of the neighbour into k: filled
                    take.setdefault(other[0], []).append(tri); give.setdefault(k, []).append(tri)
                n += 1
    for k, ts in take.items():
        GEOM[k] = area_of(shapely.difference(GEOM[k], union(ts), grid_size=GRID))
    for k, ts in give.items():
        GEOM[k] = area_of(shapely.union(GEOM.get(k, shapely.Polygon()), union(ts), grid_size=GRID))
    return {k: g for k, g in GEOM.items() if not g.is_empty}, n


def _turn(a, b, c):
    """The turn at b in degrees (0: straight on, 180: straight back)."""
    u, v = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
    nu, nv = math.hypot(*u), math.hypot(*v)
    if nu < 1e-9 or nv < 1e-9:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))))


def simplify_edges(GEOM, tol=0.05):
    """The coverage's points that say nothing taken out: every edge between two areas simplified on its own (Douglas-Peucker,
    within tol; its ends — where three areas meet — kept), so the areas still share their edges exactly; an edge that would then
    cross or lie along another keeps all its points. (The faces' noding leaves a point wherever another class's outline once
    passed; coverage_simplify, by area, kept those a centimetre off a long edge — 2026-11-22, 90 000 points.) Unchanged if the
    edges do not make the same surface again."""
    keys, parts = [], []
    for k, g in GEOM.items():
        ps = polys(g)
        parts += ps; keys += [k] * len(ps)
    if not parts:
        return GEOM
    net = shapely.union_all(np.array([p.boundary for p in parts], dtype=object), grid_size=GRID)
    edges = lines(shapely.line_merge(net))
    simp = []
    for e in edges:
        q = e.simplify(tol) if len(e.coords) > 2 else e
        simp.append(q if q.length > 0 and (not q.is_ring or len(q.coords) >= 4) else e)
    tree = shapely.STRtree(simp)
    bad = set()
    for pred in ("crosses", "overlaps"):
        ia, ib = tree.query(simp, predicate=pred)
        bad |= set(ia.tolist()) | set(ib.tolist())
    simp = [edges[i] if i in bad else q for i, q in enumerate(simp)]
    faces = shapely.get_parts(shapely.polygonize(simp))
    total = sum(p.area for p in parts)
    if not len(faces) or abs(float(shapely.area(faces).sum()) - total) > 1e-4 * total:
        return GEOM
    pt = shapely.STRtree(parts)
    pos = shapely.point_on_surface(faces)
    a_, b_ = pt.query(pos, predicate="within")
    owner = dict(zip(a_.tolist(), b_.tolist()))
    out = {}
    for i, f in enumerate(faces):
        j = owner.get(i)
        if j is None:                                      # (a face whose inner point fell on an edge moved: the most overlap)
            cand = pt.query(f)
            if not len(cand):
                continue
            j = max(cand, key=lambda j: parts[j].intersection(f).area)
        out.setdefault(keys[j], []).append(f)
    return {k: area_of(shapely.coverage_union_all(np.array(v, dtype=object))) for k, v in out.items()}
