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
4. general  on the faces: parts under the symbols' minimum width and faces under their minimum area go to the neighbour they
            share most edge with; a narrow strip that joins two places is a way: kept, and widened to 0.4 mm; ground no way
            reaches is not to be entered (ISSprOM 520), or part of the building that encloses it;
5. dissolve one geometry a class, simplified together (shared edges stay shared).

run(env, s, t) → a namespace: GEOM {class: geometry}, cl (the classes as a raster, for build.py), and the unions the later
stages read (PAVED_ALL, OLIVE, BLOCKS…)."""
from types import SimpleNamespace

import numpy as np
import shapely
from scipy.ndimage import binary_dilation, binary_opening, distance_transform_edt, gaussian_filter, label
from shapely.geometry import shape

from . import stairs
from .env import K, KNAME, R, RUNNABLE, area_of, lines, polys, union
from .sources import NO_ENTRY
from .terrain import height_of

GRID = 0.01                                                # every vertex on a 1 cm grid: no near-coincident edges
# what a mapper can draw and a runner can read at 1:4000 (ISSprOM 2019-2: minimum widths and areas, 1 mm = 4 m)
MIN_W = {"forest": 1.5, "open": 1.5, "open_t": 9.0, "slow": 1.6, "walk": 1.6, "paved": 1.5, "paved_t": 1.6, "heavy": 1.5,
         "private": 1.0}                                   # (0.3-0.4 mm; 0.4 mm between uncrossable features; olive 0.25 mm)
MIN_A = {"forest": 16, "open": 8, "open_t": 100, "slow": 16, "walk": 16, "paved": 8, "paved_t": 16, "heavy": 8, "private": 4,
         "imp_veg": 4, "water": 8}
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
    pp = [g.buffer(max(1.6, fw) / 2, cap_style="flat", join_style="round") for g, fw in s.paved_paths]
    pp += [g.buffer(sw / 2 + 0.2, cap_style="flat", join_style="mitre") for g, sw in stair_pieces]
    paths_a = union(pp)
    soft = union(s.paved_soft)
    return [("building", "building", B), ("water", "water", s.water), ("hedge", "imp_veg", hedge),
            ("bpass", "paved", bpass), ("heavy", "heavy", heavy), ("carriageway", "paved", s.CARR), ("private", "private", s.PRIVATE),
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

    # ---- generalised ---------------------------------------------------------------------------------------------------------
    # a first pass on the faces; the ways widened and the ground no way reaches closed on the result; then a second pass, on
    # the areas as they then are: the faces are made again from their outlines, which also drops the zero-width whiskers the
    # two overlays leave (2026-11-22: 18 spikes in the paving)
    faces, cls = thin_parts(env, faces=faces, cls=cls)
    cls, corr = merge_small(env, faces, cls)
    GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
    GEOM = widen(env, GEOM, corr)
    GEOM, why = reach(env, s, t, GEOM)
    faces, cls = thin_parts(env, GEOM=GEOM)
    cls, _ = merge_small(env, faces, cls)
    GEOM = {KNAME[int(k)]: area_of(shapely.coverage_union_all(faces[cls == k])) for k in np.unique(cls)}
    GEOM = simplify(GEOM)
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


def thin_parts(env, faces=None, cls=None, GEOM=None):
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
        core = shapely.buffer(shapely.buffer(np.array(ps, dtype=object), -w / 2, join_style="mitre"), w / 2 * 1.02, join_style="mitre")
        cuts.append((int(k), core))
    extra = [c for _, core in cuts for c in core if not c.is_empty]
    f2, pts = polygonise(regions + extra, env.frame)
    r = lookup(pts, regions)
    c2 = np.array(rcls, np.int32)[np.maximum(r, 0)]
    c2[r < 0] = K["forest"] + 100                         # (a crack between two regions: a thin face, given to a neighbour)
    for k, core in cuts:
        m = c2 == k
        inside = lookup(pts[m], [c for c in core if not c.is_empty]) >= 0
        idx = np.nonzero(m)[0][~inside]
        c2[idx] = k + 100
    env.log("faces after the thin parts' cut", len(f2), "thin", int((c2 >= 100).sum()))
    return f2, c2


def merge_small(env, faces, cls):
    """Thin parts and faces under their class's minimum area go to the neighbouring class they share most edge with — but a
    thin strip of runnable ground that joins two places is a way (an alley between two houses, an entrance): it stays, and is
    widened afterwards. Returns the classes and the corridors' geometry."""
    A = shapely.area(faces)
    thin = cls >= 100
    base = np.where(thin, cls - 100, cls).astype(np.uint8)
    runnable = np.isin(base, [K[k] for k in RUNNABLE])
    small = ~thin & (A < np.array([MIN_A.get(KNAME[int(k)], 0) for k in base]))
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
    # first — several rounds: a chain of thin faces resolves in turn
    res = base.copy()
    todo = flag.copy()
    by = {}
    for i, j, l in zip(a, b, L):
        by.setdefault(int(i), []).append((int(j), float(l)))
    run_codes = {K[k] for k in RUNNABLE}
    for _ in range(8):
        changed = False
        for i in np.nonzero(todo)[0]:
            tally = {}
            for j, l in by.get(int(i), []):
                if not todo[j]:
                    tally[int(res[j])] = tally.get(int(res[j]), 0.0) + l
            if runnable[i] and any(c in run_codes for c in tally):
                tally = {c: l for c, l in tally.items() if c in run_codes}
            if tally:
                res[i] = max(tally, key=tally.get); todo[i] = False; changed = True
        if not changed:
            break
    corr = union(list(faces[corridor]))
    env.log("thin or small faces merged", int(flag.sum() - todo.sum()), "left", int(todo.sum()), "corridors", len(keep_root))
    return res, corr


def widen(env, GEOM, corr):
    """A way narrower than 0.4 mm between uncrossable features is widened to it (ISSprOM: « closed or widened »; the owner,
    2026-11-15: « widen the entrances just enough »): each corridor grows by what it lacks, taken from the olive, the hedge or
    the building beside it — never from water."""
    if corr.is_empty:
        return GEOM
    grow = []
    for q in polys(corr):
        w = 2 * q.area / max(q.length, 1e-6)
        d = min(0.5, max(0.0, (1.7 - w) / 2))
        if d > 0.02:
            grow.append(q.buffer(d, quad_segs=2))               # (round: a mitred corner would be a spike)
    if not grow:
        return GEOM
    W = shapely.set_precision(union(grow), GRID)
    take = shapely.Polygon()
    for k in ("private", "imp_veg", "building"):
        if k in GEOM:
            x = area_of(shapely.intersection(GEOM[k], W, grid_size=GRID))
            if not x.is_empty:
                GEOM[k] = area_of(shapely.difference(GEOM[k], x, grid_size=GRID)); take = take.union(x)
    if not take.is_empty:
        GEOM["paved"] = area_of(shapely.union(GEOM.get("paved", shapely.Polygon()), take, grid_size=GRID))
    env.log("corridors widened", len(grow), round(take.area), "m² taken")
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
