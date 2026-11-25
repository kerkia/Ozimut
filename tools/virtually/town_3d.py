"""The town of a sprint race of « Virtually », in 3D (after town_map.py, mkocd.mjs, dump.mjs and build.py):

  py town_3d.py <race>      writes pkg/town.json and pkg/town.bin, and replaces pkg/ground.jpg by the aerial photograph

- each building of IGN's BD TOPO: its footprint, walls from the ground to its roof's edge, and its roof fitted to the LiDAR's
  building points (class 6) seen from above (town_roofs.py): up to 8 planes found by RANSAC, each roof node taking the plane of
  its nearest points, so that gables, hips and flat roofs come out as they are; a building without points gets a flat roof at
  BD TOPO's height;
- the façades' look from BD TOPO's use (housing, shops, church…) and a seed: the shader (games/vtown.js) draws floors, windows,
  shutters and doors on them; the roofs' colour is the photograph's over the roof;
- walls, fences and hedges (town_map.py's, their heights measured on the LiDAR), street furniture from OpenStreetMap;
- the sports grounds (town_map.py's src/sports.json, town_sports.py): each one's surface in its clean colour, its markings at the
  rules' sizes, goals, rugby posts and nets;
- the ground's texture: IGN's BD ORTHO at 0.25 m, the shade of the buildings lightened.
Everything in the world frame of build.py (x to the map's right, z down, metres), grouped by 64 m chunks as vworld.js streams.

town.bin: the arrays listed in town.json `arrays` (name, type, offset in bytes, count), each 4-byte aligned:
  rpos f32 (x, y, z), rcol u8 (r, g, b, flat + 2 × material), ridx u16 or u32 (chunk-local) — roofs;
  wpos f32 (x, y, z), wuv f32 (u along the wall's side, v above the ground's median along the building), wseg f32 (segment length, eave height,
  floor height, seed), wcol u8 (r, g, b, kind + 10 × material), widx u16 or u32 — walls; wtx f32 (the photo
  façades' atlas coordinates, −1 where none), wtr u16 (the tile's rectangle in the atlas, 0-65535) — town_facadetex.py.
town.json: { arrays, chunks: { "a,b": { r: [v0, nv, i0, ni], w: [v0, nv, i0, ni] } }, foot: [[ [x, z]… ]…] (collision outlines),
  walls: [{ pts, kind, h, imp }], props: [[kind, x, z, angle]], credit }"""
import json, math, os, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, distance_transform_edt, binary_dilation
from scipy.spatial import cKDTree
import shapely
from shapely.geometry import shape, Polygon, Point, LineString
from shapely.ops import unary_union

from town_roofs import roof as roof_of, Neighbours

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
RACE = sys.argv[1]
RD = DATA / RACE; SRC = RD / "src"; PKG = RD / "pkg"
A = json.load(open(RD / "area.json")); race = json.load(open(PKG / "race.json"))
EX0, EY0, EX1, EY1 = A["ext"]
K = race["k"]; M0 = race["mm0"]
MAPC = json.load(open(RD / "map_objects.json"))["realWorld"]
WX0, WZ0 = MAPC["x"] + M0[0] * K, MAPC["y"] + M0[1] * K          # world (0, 0) in Lambert 93
W, H = race["W"], race["H"]
CH = 64
T0 = time.time()
log = lambda *a: print(f"[{time.time() - T0:5.0f}s]", *a, flush=True)
TT = {}                                                            # seconds by step of the buildings' loop
_tk = [time.perf_counter()]


def tick(name):
    t = time.perf_counter(); TT[name] = TT.get(name, 0.0) + t - _tk[0]; _tk[0] = t


rng = np.random.default_rng(11)
wx = lambda X: X - WX0
wz = lambda Y: WZ0 - Y

# the game's own ground heights (h.png), so that walls meet the ground the runner sees
hp = np.asarray(Image.open(PKG / "h.png").convert("RGB")).astype(np.float32)
HG = race["base"] + (hp[..., 0] * 256 + hp[..., 1]) / 100


def ground(x, z):
    j = np.clip(np.asarray(x).astype(int), 0, W - 1); i = np.clip(np.asarray(z).astype(int), 0, H - 1)
    return HG[i, j]


# ---- the aerial photograph, in the world frame at 0.25 m ------------------------------------------------------------------
GR = 0.25
gw, gh = int(W / GR), int(H / GR)
photo = np.zeros((gh, gw, 3), np.float32) + np.array([96, 100, 86], np.float32)
for f in SRC.glob("ortho_rgb_*.jpg"):
    _, _, x0, y0 = f.stem.split("_"); x0, y0 = int(x0), int(y0)
    im = Image.open(f).convert("RGB"); w_m, h_m = im.width / 5, im.height / 5
    im = np.asarray(im.resize((int(round(w_m / GR)), int(round(h_m / GR))), Image.LANCZOS)).astype(np.float32)
    c, r = int(round(wx(x0) / GR)), int(round(wz(y0 + h_m) / GR))
    a0, b0 = max(0, -r), max(0, -c); r1, c1 = min(gh, r + im.shape[0]), min(gw, c + im.shape[1])
    if r1 > max(r, 0) and c1 > max(c, 0):
        photo[max(r, 0):r1, max(c, 0):c1] = im[a0:a0 + r1 - max(r, 0), b0:b0 + c1 - max(c, 0)]
log("photograph", photo.shape)

# ---- buildings -------------------------------------------------------------------------------------------------------------
feats = json.load(open(SRC / "bdtopo_batiment.json"))["features"]
roof = np.load(SRC / "roofpts.npy")                               # x - EX0, y - EY0, z (L93)
roof[:, 0] += EX0 - WX0; roof[:, 1] = WZ0 - (roof[:, 1] + EY0)     # → world x, z
rtree = cKDTree(roof[:, :2])
world_box = shapely.box(0, 0, W, H)
# ---- photo façades (town_facadetex.py): every building's outline in the world, the vegetation's top for the occlusions --------
from town_facadetex import FacadeTex, pack as pack_tiles, PXM as TEX_PXM
WPOLYS = []
for f in feats:
    g = shapely.transform(shapely.force_2d(shape(f["geometry"])).buffer(0), lambda c: np.c_[wx(c[:, 0]), wz(c[:, 1])]).intersection(world_box)
    WPOLYS += [q.simplify(0.1) for q in getattr(g, "geoms", [g]) if q.geom_type == "Polygon" and q.area >= 4]
NEIGH = Neighbours(WPOLYS, roof, rtree)                            # every outline and its height: a roof's points are no other building's
_LG = np.load(SRC / "lidar_grids.npz"); _ZV, _ZB = _LG["zv"], _LG["zb"]


def zv_at(x, z):
    """The vegetation's top (absolute m, NaN where none) at world points."""
    j = ((np.asarray(x) + WX0 - EX0) / 0.5).astype(int); i = ((EY1 - (WZ0 - np.asarray(z))) / 0.5).astype(int)
    inside = (i >= 0) & (i < _ZV.shape[0]) & (j >= 0) & (j < _ZV.shape[1])
    return np.where(inside, _ZV[np.clip(i, 0, _ZV.shape[0] - 1), np.clip(j, 0, _ZV.shape[1] - 1)], np.nan)


def zb_at(x, z):
    """The buildings' top (absolute m, far below the ground where none) at world points."""
    j = ((np.asarray(x) + WX0 - EX0) / 0.5).astype(int); i = ((EY1 - (WZ0 - np.asarray(z))) / 0.5).astype(int)
    return _ZB[np.clip(i, 0, _ZB.shape[0] - 1), np.clip(j, 0, _ZB.shape[1] - 1)]


FT = FacadeTex(SRC, wx, wz, WPOLYS, zv_at, zb_at, lambda x, z: ground(x, z), log) if (SRC / "poses.json").exists() and not os.environ.get("NO_FACADETEX") else None
TILES = {}                                                        # side id → (RGBA tile, v_lo, v_hi)
USE = {"résidentiel": 0, "commercial et services": 1, "religieux": 2, "sportif": 3, "industriel": 4, "agricole": 4, "annexe": 5,
       "indifférencié": 0}
FACADE = [  # plasters of the Île-de-France: cream, sand, grey, white, meulière (millstone)
    (222, 208, 182), (210, 196, 170), (198, 192, 182), (230, 226, 216), (176, 150, 118), (214, 200, 168), (190, 176, 152), (236, 222, 196)]
STONE = (188, 178, 160)


NT = os.cpu_count() or 4
POOL = ThreadPoolExecutor(NT)                                      # numpy and scipy.ndimage release the GIL: exact, in parallel


def strips(fn, a, reach):
    """fn(a) computed over strips of rows in parallel, each strip with `reach` rows of the input around it: the very same values
    wherever a pixel of fn(a) depends only on the input within `reach` rows of it (a filter's kernel; the image's own edges are
    handled by fn as before)."""
    n = a.shape[0]
    if n < 8 * NT or a.size < 2_000_000:
        return fn(a)
    cuts = np.linspace(0, n, NT + 1).astype(int)

    def job(i):
        lo, hi = cuts[i], cuts[i + 1]; a0, a1 = max(0, lo - reach), min(n, hi + reach)
        return fn(a[a0:a1])[lo - a0:hi - a0]
    return np.concatenate(list(POOL.map(job, range(NT))))


def gauss(a, sigma, truncate=4.0):
    """gaussian_filter(a, sigma), the same values, by strips in parallel."""
    s0 = sigma[0] if isinstance(sigma, (tuple, list)) else sigma
    return strips(lambda b: gaussian_filter(b, sigma, truncate=truncate), a, int(truncate * float(s0) + 0.5))


def colour_over(poly):
    """The photograph's median colour inside the outline drawn 1 m in."""
    p = poly.buffer(-1.0)
    if p.is_empty:
        p = poly
    x0, z0, x1, z1 = p.bounds
    xs = np.arange(x0, x1, 0.5); zs = np.arange(z0, z1, 0.5)
    if not len(xs) or not len(zs):
        return (120, 110, 100)
    X, Z = np.meshgrid(xs, zs); X, Z = X.ravel(), Z.ravel()
    inn = shapely.contains_xy(p, X, Z)
    if inn.sum() < 4:
        return (120, 110, 100)
    c = photo[np.clip((Z[inn] / GR).astype(int), 0, gh - 1), np.clip((X[inn] / GR).astype(int), 0, gw - 1)]
    return tuple(int(v) for v in np.median(c, axis=0))


chunks = {}
foot = []
chimneys = []
# the façades' colours read from Panoramax's photos (town_panoramax.py; data only), by BD TOPO's building id
FAC = json.load(open(SRC / "facades.json")) if (SRC / "facades.json").exists() else {"buildings": {}, "authors": []}


def _fac_colours(fac):
    """The photos' colours as façade colours: they were read in shade and under an overcast sky (lightness ~0.35, some
    blue casts), so they are taken as relative colours — one exposure gain bringing their median lightness to a plaster's
    (0.68), the lightness then kept within a façade's range (0.42-0.88), a blue cast (the sky's) made neutral, the
    saturation a little raised (shade greys colours) and capped."""
    import colorsys
    good = [v for v in fac.values() if v["n"] >= 2]
    if not good:
        return {}
    ls = sorted(colorsys.rgb_to_hls(*(c / 255 for c in v["rgb"]))[1] for v in good)
    gain = 0.68 / max(ls[len(ls) // 2], 0.05)
    out = {}
    for k, v in fac.items():
        if v["n"] < 2:
            continue
        h, l, sat = colorsys.rgb_to_hls(*(c / 255 for c in v["rgb"]))
        l = min(0.88, max(0.42, l * gain))
        sat = min(0.03, sat) if 0.5 < h < 0.75 else min(0.32, sat * 1.25)
        out[k] = tuple(int(round(c * 255)) for c in colorsys.hls_to_rgb(h, l, sat))
    return out


FACRGB = _fac_colours(FAC["buildings"])
# shops, cafés and the like (OpenStreetMap): a building holding one has a shop front on its ground floor
from l93 import transformer
tr = transformer(4326, 2154)
osm = json.load(open(SRC / "osm.json"))["elements"]
SHOPS = []
for e in osm:
    t = e.get("tags", {})
    if e["type"] == "node" and (t.get("shop") or t.get("amenity") in ("restaurant", "cafe", "bar", "bank", "pharmacy", "fast_food",
                                                                      "pub", "post_office", "hairdresser", "bureau_de_change")):
        X, Y = tr.transform(e["lon"], e["lat"]); SHOPS.append((wx(X), wz(Y)))
shop_tree = cKDTree(SHOPS) if SHOPS else None
stats = {"planes": 0, "flat": 0, "fitted": 0, "panoramax": 0, "shops": 0}


def chunk_of(x, z):
    return f"{int(x // CH)},{int(z // CH)}"


def push(key, part, pos, col, idx, extra=None):
    c = chunks.setdefault(key, {"r": [[], [], []], "w": [[], [], [], [], [], []]})
    if part == "r":
        base = sum(len(p) for p in c["r"][0])
        c["r"][0].append(pos); c["r"][1].append(col); c["r"][2].append(idx + base)
    else:
        base = sum(len(p) for p in c["w"][0])
        c["w"][0].append(pos); c["w"][1].append(extra[0]); c["w"][2].append(extra[1]); c["w"][3].append(col); c["w"][4].append(idx + base)
        c["w"][5].append(extra[2])


# a passage through a building (town_map.py's src/passages.json: a building passage, a tunnel beneath) is cut out of it: the runner
# goes through
_pf = SRC / "passages.json"
PASSES = unary_union([shapely.transform(shape(g), lambda c: np.c_[wx(c[:, 0]), wz(c[:, 1])])
                      for g in (json.load(open(_pf))["passages"] if _pf.exists() else [])] or [Polygon()])
_tk[0] = time.perf_counter()
for f in feats:
    pr = f["properties"]; g = shapely.force_2d(shape(f["geometry"])).buffer(0)
    g = shapely.transform(g, lambda c: np.c_[wx(c[:, 0]), wz(c[:, 1])])
    g = g.intersection(world_box)
    if not PASSES.is_empty and g.intersects(PASSES):
        g = g.difference(PASSES.buffer(0.2))
    for poly in getattr(g, "geoms", [g]):
        if poly.geom_type != "Polygon" or poly.area < 4:
            continue
        poly = poly.simplify(0.1)
        cx, cz = poly.centroid.x, poly.centroid.y
        rings = [np.array(poly.exterior.coords)] + [np.array(r.coords) for r in poly.interiors]
        foot.append([[round(float(x), 2), round(float(z), 2)] for x, z in rings[0]])
        base = float(np.min(ground(rings[0][:, 0], rings[0][:, 1]))) - 0.3
        top_g = float(np.median(ground(rings[0][:, 0], rings[0][:, 1])))
        # the roof's points
        tick("outline")
        cand = rtree.query_ball_point([cx, cz], math.sqrt(poly.area) * 1.2 + 10)
        P = roof[cand] if cand else np.zeros((0, 3), np.float32)
        if len(P):
            P = P[shapely.contains_xy(poly.buffer(-0.25), P[:, 0], P[:, 1])]
        hz = float(pr.get("hauteur") or 0) or 3.0 * (pr.get("nombre_d_etages") or 2)
        z_flat = float(pr.get("altitude_maximale_toit") or 0) or (top_g + max(hz, 3))
        tick("points")
        # the roof (town_roofs.py): its nodes' heights (the walls' tops along the outline), its mesh, its chimneys
        R = roof_of(poly, P, top_g, z_flat, rng, stats, ground(P[:, 0], P[:, 1]) if len(P) else None, NEIGH.around(poly))
        tick("roof")
        if R is None:
            continue
        nz, nb, bnd, rnodes, rz, tri, flat = R["nz"], R["nb"], R["bnd"], R["rnodes"], R["rz"], R["tri"], R["flat"]
        chimneys.extend(R["chimneys"])
        rc = colour_over(poly)
        tick("roof colour")
        use = (pr.get("usage_1") or "indifférencié").lower()
        nat = (pr.get("nature") or "").lower()
        kind = 2 if ("église" in nat or "chapelle" in nat or use.startswith("religieux")) else USE.get(use, 0)
        if poly.buffer(-0.9).is_empty:                                  # a sliver under 1.8 m wide: a wall, no windows
            kind = 5
        elif shop_tree is not None and kind in (0, 1) and any(poly.buffer(2.5).contains(Point(*SHOPS[k]))
                                                              for k in shop_tree.query_ball_point([cx, cz], math.sqrt(poly.area) + 10)):
            kind = 1; stats["shops"] += 1
        rpos = np.c_[rnodes[:, 0], rz, rnodes[:, 1]].astype(np.float32)
        # the roof's material (materiaux_de_la_toiture's first digit): 1 tiles, 2 slates, 3 zinc; its colour the photograph's
        rmat = {"2": 1, "3": 2}.get(str(pr.get("materiaux_de_la_toiture") or "0")[:1], 0)
        canon = {0: (150, 82, 62), 1: (78, 82, 90), 2: (140, 146, 150)}[rmat]
        rc = tuple(int(0.6 * a + 0.4 * b) for a, b in zip(rc, canon)) if not flat else rc
        rcol = np.tile(np.array([*rc, (1 if flat else 0) + 2 * rmat], np.uint8), (len(rnodes), 1))
        key = chunk_of(cx, cz)
        push(key, "r", rpos, rcol, tri.astype(np.uint32))
        tick("kind")
        # walls: each ring's edge where the roof's edge bends (Douglas-Peucker on the height along it, 0.1 m)
        b0 = top_g                                                   # the façade's floors count from the ground's median
        eave = float(np.percentile(nz[:nb], 20)) - b0
        levels = pr.get("nombre_d_etages") or max(1, round((eave - 0.5) / 2.9))
        floor_h = max(2.5, min(3.6, (eave - 0.4) / max(1, levels))) if kind not in (2, 3, 4, 5) else 0
        seed = float(rng.random())
        # the walls' material from the land registry's code (BD TOPO materiaux_des_murs, its first digit): 1 stone, 2 millstone
        # (meulière, Île-de-France's), 4 brick, 6 wood; concrete, blocks and the unknown are rendered (plaster)
        wm = str(pr.get("materiaux_des_murs") or "0")[:1]
        mat = {"1": 1, "2": 2, "4": 3, "6": 4}.get(wm, 0)
        if kind == 2:
            mat = 1
        fac = FAC["buildings"].get(pr.get("cleabs") or "")
        if fac and mat == 0 and fac.get("mat"):                          # the material the photos suggest, where the registry has none
            mat = {"brick": 3, "meuliere": 2}[fac["mat"]]
        fc = {1: STONE, 2: (170, 128, 88), 3: (150, 78, 58), 4: (120, 90, 62)}.get(mat) or (FACADE[int(seed * 997) % len(FACADE)] if kind != 5 else (172, 160, 140))
        if (pr.get("cleabs") or "") in FACRGB:                           # Panoramax's colour (two wall readings at least)
            fc = FACRGB[pr["cleabs"]]; stats["panoramax"] += 1
        style = kind + 10 * mat
        off = 0
        wp, wu, ws, wi, wt = [], [], [], [], []
        for b in bnd:
            n = len(b); zb = nz[off:off + n]; off += n
            # split the ring at the outline's own corners (the original vertices), each side its own segment
            ring0 = np.array(rings[len(wp) and 0 or 0])
            P2 = np.vstack([b, b[:1]]); Z2 = np.concatenate([zb, zb[:1]])
            seglen = np.hypot(*np.diff(P2, axis=0).T)
            # corners: where the direction turns by more than 20°
            d = np.diff(P2, axis=0); ang = np.arctan2(d[:, 1], d[:, 0])
            turn = np.abs((np.diff(np.concatenate([ang[-1:], ang])) + np.pi) % (2 * np.pi) - np.pi) > math.radians(20)
            corners = list(np.nonzero(turn)[0]) or [0]
            corners = sorted(set(corners))
            for ci, s0 in enumerate(corners):
                s1 = corners[(ci + 1) % len(corners)]
                ids = list(range(s0, s1 + 1)) if s1 > s0 else list(range(s0, n + 1)) + list(range(1, s1 + 1))
                ids = [k % (n + 0) if k < n else 0 for k in ids] if False else [k if k <= n else k - n for k in ids]
                pts = P2[[k if k < n + 1 else 0 for k in ids]]; zz = Z2[[k if k < n + 1 else 0 for k in ids]]
                s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])
                Ls = float(s[-1])
                if Ls < 0.3:
                    continue
                # the side's photo texture, if Panoramax's photos see it
                sid = -1
                if FT is not None:
                    tick("walls")
                    got = FT.side(pts, zz, ground(pts[:, 0], pts[:, 1]), b0, poly)
                    if got is not None:
                        sid = len(TILES); TILES[sid] = got
                    tick("façade photos")
                # Douglas-Peucker on (s, z)
                keepi = [0, len(s) - 1]
                stack = [(0, len(s) - 1)]
                while stack:
                    i0, i1 = stack.pop()
                    if i1 <= i0 + 1:
                        continue
                    t = (s[i0 + 1:i1] - s[i0]) / max(s[i1] - s[i0], 1e-6)
                    dev = np.abs(zz[i0 + 1:i1] - (zz[i0] + t * (zz[i1] - zz[i0])))
                    k = int(np.argmax(dev))
                    if dev[k] > 0.1:
                        m_ = i0 + 1 + k; keepi.append(m_); stack += [(i0, m_), (m_, i1)]
                keepi = sorted(set(keepi))
                for qa, qb in zip(keepi, keepi[1:]):
                    ax, az, bx, bz = pts[qa][0], pts[qa][1], pts[qb][0], pts[qb][1]
                    v = len(wp)
                    wp += [[ax, base, az], [bx, base, bz], [bx, zz[qb], bz], [ax, zz[qa], az]]
                    wu += [[s[qa], base - b0], [s[qb], base - b0], [s[qb], zz[qb] - b0], [s[qa], zz[qa] - b0]]
                    ws += [[Ls, eave, floor_h, seed]] * 4
                    wt += [sid] * 4
                    wi += [v, v + 1, v + 2, v, v + 2, v + 3]
        tick("walls")
        if wp:
            push(key, "w", np.array(wp, np.float32), np.tile(np.array([*fc, style], np.uint8), (len(wp), 1)), np.array(wi, np.uint32),
                 extra=(np.array(wu, np.float32), np.array(ws, np.float32), np.array(wt, np.int32)))
tick("walls")
log("buildings", len(foot), stats)
log("buildings by step (s)", {k: round(v, 1) for k, v in TT.items()})

# ---- arrays -------------------------------------------------------------------------------------------------------------
out = bytearray(); arrays = {}
NAMES = {"rpos": ("f32", 3), "rcol": ("u8", 4), "ridx": ("u32", 1), "wpos": ("f32", 3), "wuv": ("f32", 2), "wseg": ("f32", 4),
         "wcol": ("u8", 4), "widx": ("u32", 1), "wtx": ("f32", 2), "wtr": ("u16", 4)}
# the photo façades' atlas: each textured side's tile; per wall vertex its place in the atlas (wtx) and its tile's rectangle (wtr,
# 0-65535; all 0 where the side has none)
ATLAS = None
if FT is not None:
    FT.save()
    log("façade tiles kept", len(TILES), "of", len(FT.tilelog), "rectified; photos used", len(FT.used))
if TILES:
    ATLAS, TEX_F, TEX_RECT = pack_tiles({k: t[0] for k, t in TILES.items()})
    SH, SW = ATLAS.shape[:2]
    Image.fromarray(ATLAS, "RGBA").save(PKG / "facades.webp", quality=82, method=6)
    log("façade atlas", SW, "x", SH, "tiles", len(TILES), "scale", round(TEX_F, 3), round((PKG / "facades.webp").stat().st_size / 1e6, 2), "MB")
elif (PKG / "facades.webp").exists():
    (PKG / "facades.webp").unlink()


def tex_attrs(uv, sid):
    tx = np.full((len(uv), 2), -1, np.float32); tr = np.zeros((len(uv), 4), np.uint16)
    if ATLAS is None:
        return tx, tr
    for k in np.unique(sid[sid >= 0]):
        m = sid == k; x0, y0, w, h = TEX_RECT[int(k)]; vhi = TILES[int(k)][2]
        tx[m, 0] = (x0 + uv[m, 0] * TEX_PXM * TEX_F) / SW; tx[m, 1] = (y0 + (vhi - uv[m, 1]) * TEX_PXM * TEX_F) / SH
        tr[m] = np.round(np.array([x0 / SW, y0 / SH, (x0 + w) / SW, (y0 + h) / SH]) * 65535).astype(np.uint16)
    return tx, tr



bufs = {k: [] for k in NAMES}
index = {}
counts = {k: 0 for k in NAMES}
for key, c in chunks.items():
    e = {}
    if c["r"][0]:
        pos = np.vstack(c["r"][0]); e["r"] = [counts["rpos"], len(pos), counts["ridx"], 0]
        bufs["rpos"].append(pos); bufs["rcol"].append(np.vstack(c["r"][1])); idx = np.concatenate([i.ravel() for i in c["r"][2]])
        bufs["ridx"].append(idx); e["r"][3] = len(idx); counts["rpos"] += len(pos); counts["ridx"] += len(idx)
    if c["w"][0]:
        pos = np.vstack(c["w"][0]); e["w"] = [counts["wpos"], len(pos), counts["widx"], 0]
        bufs["wpos"].append(pos); bufs["wuv"].append(np.vstack(c["w"][1])); bufs["wseg"].append(np.vstack(c["w"][2]))
        bufs["wcol"].append(np.vstack(c["w"][3])); idx = np.concatenate(c["w"][4]); bufs["widx"].append(idx)
        t_x, t_r = tex_attrs(np.vstack(c["w"][1]), np.concatenate(c["w"][5])); bufs["wtx"].append(t_x); bufs["wtr"].append(t_r)
        e["w"][3] = len(idx); counts["wpos"] += len(pos); counts["widx"] += len(idx)
    index[key] = e
for k, (tp, n) in NAMES.items():
    a = np.concatenate(bufs[k]) if bufs[k] else np.zeros(0)
    if tp == "u32" and (not len(a) or a.max() < 65536):              # chunk-local indices: 16 bits are enough
        tp = "u16"
    a = a.astype({"f32": np.float32, "u8": np.uint8, "u16": np.uint16, "u32": np.uint32}[tp])
    while len(out) % 4:
        out += b"\0"
    arrays[k] = [tp, len(out), int(a.size)]
    out += a.tobytes()
(PKG / "town.bin").write_bytes(bytes(out))
log("town.bin")

# ---- walls, fences, hedges; street furniture -------------------------------------------------------------------------------
WJ = json.load(open(SRC / "walls.json")); ox, oy = WJ["origin"]
walls = []
for w in WJ["walls"]:
    pts = [[round(EX0 + x - WX0, 2), round(WZ0 - (oy - z), 2)] for x, z in w["pts"]]
    walls.append({"pts": pts, "kind": w["kind"], "h": w["h"], "imp": w["imp"]})
props = []
PROP = {("highway", "street_lamp"): "lamp", ("amenity", "bench"): "bench", ("leisure", "picnic_table"): "bench",
        ("amenity", "waste_basket"): "bin", ("barrier", "bollard"): "bollard", ("amenity", "post_box"): "postbox",
        ("amenity", "bicycle_parking"): "bikes", ("amenity", "fountain"): "fountain", ("amenity", "recycling"): "recycling",
        ("amenity", "telephone"): "phone", ("highway", "traffic_signals"): "signals", ("highway", "bus_stop"): "busstop",
        ("amenity", "drinking_water"): "tap", ("man_made", "street_cabinet"): "cabinet", ("advertising", "column"): "column",
        ("historic", "memorial"): "memorial", ("tourism", "artwork"): "memorial"}
for e in osm:
    if e["type"] != "node":
        continue
    t = e.get("tags", {})
    k = next((v for (a, b), v in PROP.items() if t.get(a) == b), None)
    if not k:
        continue
    X, Y = tr.transform(e["lon"], e["lat"]); x, z = wx(X), wz(Y)
    if 0 < x < W and 0 < z < H:
        props.append([k, round(x, 2), round(z, 2), round(float(t.get("direction", "0").split(";")[0]) if t.get("direction", "0").replace(".", "").isdigit() else rng.uniform(0, 360), 0)])
# street lamps along the streets where OpenStreetMap has none: every 26 m on one side of BD TOPO's town roads, none within 15 m
# of a lamp OpenStreetMap places
lamps = cKDTree([[p[1], p[2]] for p in props if p[0] == "lamp"] or [[-1e6, -1e6]])
if True:
    for f in json.load(open(SRC / "bdtopo_troncon_de_route.json"))["features"]:
        p = f["properties"]
        if (p.get("nature") or "").lower() not in ("route à 1 chaussée", "route à 2 chaussées", "rond-point"):
            continue
        g = shapely.force_2d(shape(f["geometry"])); g = shapely.transform(g, lambda c: np.c_[wx(c[:, 0]), wz(c[:, 1])])
        w = float(p.get("largeur_de_chaussee") or 5) / 2 + 1.2
        for l in getattr(g, "geoms", [g]):
            side = l.offset_curve(w)
            for d in np.arange(8, side.length, 26):
                q = side.interpolate(d)
                if 0 < q.x < W and 0 < q.y < H and lamps.query([q.x, q.y])[0] > 15:
                    o = l.interpolate(l.project(q))                    # the lamp's arm over the road
                    props.append(["lamp", round(q.x, 2), round(q.y, 2), round(-math.degrees(math.atan2(o.x - q.x, o.y - q.y)), 0)])
# ---- the ground's surfaces (surf.png, 0.5 m: what vtown.js draws the ground's grain by) -------------------------------------------
# 0 earth, 1 asphalt, 2 paving stones, 3 concrete (sidewalks, yards), 4 grass, 5 gravel, 6 forest floor, 7 water, 8 building,
# 9 clay (a tennis court), 10 synthetic (a hard court, the athletics track)
from rasterio.features import rasterize
from rasterio.transform import Affine
from scipy.ndimage import grey_opening, binary_erosion, label as nd_label, find_objects
cl1 = np.asarray(Image.open(PKG / "cls.png")); CN = race["classes"]
SURF = {"paved": 3, "road": 1, "stairs": 3, "open": 4, "open_t": 4, "rough": 4, "rough_t": 4, "forest": 6, "slow": 6, "slow_vis": 6,
        "walk": 6, "walk_vis": 6, "fight": 6, "path": 5, "track": 5, "small_path": 5, "water": 7, "shallow": 7, "building": 8,
        "block": 4, "oob": 4, "cultivated": 4, "marsh": 4}
lut_s = np.array([SURF.get(n, 0) for n in CN] + [0] * (256 - len(CN)), np.uint8)
surf = np.repeat(np.repeat(lut_s[cl1], 4, axis=0), 4, axis=1)[:gh, :gw]        # 0.25 m, the world's frame
TRW = Affine(GR, 0, 0, 0, GR, 0)                                                  # world x right, z down: column = x / GR, row = z / GR


def burn(geoms, val):
    gs = [g for g in geoms if g is not None and not g.is_empty]
    if not gs:
        return np.zeros((gh, gw), bool)
    m = rasterize([(g, 1) for g in gs], out_shape=(gh, gw), transform=TRW, fill=0, dtype="uint8") == 1
    surf[m] = val
    return m


to_w = lambda g: shapely.transform(shapely.force_2d(g), lambda c: np.c_[wx(c[:, 0]), wz(c[:, 1])])
cz = np.load(SRC / "classes.npz")
gx = (np.arange(gw) + 0.5) * GR + WX0; gy = WZ0 - (np.arange(gh) + 0.5) * GR
ci = np.clip(((gx - EX0) / 0.5).astype(int), 0, cz["cl"].shape[1] - 1); ri = np.clip(((EY1 - gy) / 0.5).astype(int), 0, cz["cl"].shape[0] - 1)
clz = cz["cl"][ri[:, None], ci[None, :]]
surf[(surf == 4) & (clz == 8)] = 3                                                # bare ground the map draws paved: concrete
# carriageways (BD TOPO's width) and parkings are asphalt; OpenStreetMap's paving stones and setts
roads = []
for f in json.load(open(SRC / "bdtopo_troncon_de_route.json"))["features"]:
    pr_ = f["properties"]; nat = (pr_.get("nature") or "").lower()
    if (pr_.get("position_par_rapport_au_sol") or "0").startswith("-") or nat in ("sentier", "escalier", "chemin", "route empierrée"):
        continue
    w_ = float(pr_.get("largeur_de_chaussee") or 0) or {"rond-point": 7, "bretelle": 6, "piste cyclable": 2.5}.get(nat, 5)
    roads.append((to_w(shape(f["geometry"])), w_))
carriage = unary_union([g.buffer(w_ / 2, cap_style="flat", join_style="round") for g, w_ in roads])
park = [to_w(shape(f["geometry"])) for f in json.load(open(SRC / "bdtopo_equipement_de_transport.json"))["features"]
        if "parking" in (f["properties"].get("nature") or "").lower() and f["geometry"]["type"].endswith("Polygon")]
A_ = burn([carriage] + park, 1)
paving = []
for e in osm:
    t = e.get("tags", {})
    if t.get("surface") in ("paving_stones", "sett", "cobblestone", "unhewn_cobblestone", "bricks") and e["type"] == "way" and e.get("geometry"):
        xs, ys = tr.transform(np.array([q["lon"] for q in e["geometry"]]), np.array([q["lat"] for q in e["geometry"]]))
        pts = list(zip(wx(xs), wz(ys)))
        if len(pts) >= 4 and pts[0] == pts[-1] and (t.get("area") == "yes" or t.get("place") == "square" or t.get("area:highway")):
            paving.append(Polygon(pts).buffer(0))
        elif len(pts) >= 2:
            paving.append(LineString(pts).buffer(1.2, cap_style="flat"))
burn(paving, 2)
# sports grounds (town_map.py's src/sports.json, laid out by town_sports.py): their surface; their colours, markings, goals and nets below
import town_sports
SPORTS = []
SPORT_CODE = {"grass": 4, "turf": 4, "clay": 9, "sand": 5, "hard": 10, "asphalt": 1}
if (SRC / "sports.json").exists():
    from shapely.geometry import box as _box
    for s_ in json.load(open(SRC / "sports.json")):
        for pr_ in s_["polys"]:
            g_ = to_w(Polygon(pr_[0], pr_[1:])).buffer(0)
            if g_.is_empty or not g_.intersects(_box(0, 0, W, H)):
                continue
            SPORTS.append(town_sports.layout(g_, s_["sport"], s_["surface"]) | {"sport": s_["sport"]})
    for s_ in SPORTS:
        burn([s_["g"]], SPORT_CODE.get(s_["surface"], 5))
    log("sports grounds", len(SPORTS), {k: sum(1 for s_ in SPORTS if s_["sport"] == k) for k in sorted({s_["sport"] for s_ in SPORTS})})
burn([Polygon(r) for r in foot if len(r) >= 4], 8)
A_ = surf == 1
log("surfaces m²", {k: int((surf == k).sum() * GR * GR) for k in range(11)})

# ---- the ground's picture: the photograph's shade lightened, its asphalt cleaned (no car lies flat on it), the road markings kept
# and the zebra crossings painted; the class colours under the trees' crowns (the photograph shows their tops) and outside it --------
lumi = photo.mean(axis=2)
local = gauss(lumi, 40)                                            # 10 m
shade = np.clip(1 - lumi / np.maximum(local * 0.8, 1), 0, 0.75)
shade = gauss(shade, 2)
img = photo * (1 + 1.6 * shade)[..., None]
img[..., 2] *= 1 - 0.12 * shade                                    # shade is bluish
mx_, mn_ = img.max(axis=2), img.min(axis=2); sat_ = (mx_ - mn_) / (mx_ + 1)
lum2 = img.mean(axis=2)
road_med = float(np.median(lum2[A_])) if A_.any() else 100.0
log("ground: shade lightened")
# asphalt: the road's own colour, blurred over ~4 m from its plain pixels only (cars, people, markings and shade left out)
plain = A_ & (sat_ < 0.16) & (np.abs(lum2 - road_med) < 28)
wgt = gauss(plain.astype(np.float32), 16) + 1e-3
base = np.dstack([gauss(img[..., c] * plain, 16) / wgt for c in range(3)])
base[wgt < 0.02] = road_med
# the markings: thin white strokes (a white top-hat 0.75 m across); cars and their shine are wider
tophat = lum2 - strips(lambda b: grey_opening(b, size=(3, 3)), lum2, 2)
mark = A_ & (tophat > 38) & (sat_ < 0.18) & (lum2 > road_med + 45)
mark &= ~binary_dilation(binary_erosion(mark, iterations=2), iterations=2)   # a blob over 1 m across is no marking
log("ground: asphalt cleaned, markings found")
road_img = base.copy()
road_img[mark] = 0.55 * img[mark] + 0.45 * 235
# zebra crossings OpenStreetMap marks: 0.5 m white bands across the carriageway, 3 m long
zebras = 0
bands = []
for e in osm:
    t = e.get("tags", {})
    if e["type"] != "node" or t.get("highway") != "crossing" or t.get("crossing") not in ("marked", "zebra", "traffic_signals", "uncontrolled"):
        continue
    X, Y = tr.transform(e["lon"], e["lat"]); q = Point(wx(X), wz(Y))
    best = None
    for g, w_ in roads:
        d = g.distance(q)
        if d < 3 and (best is None or d < best[0]):
            best = (d, g, w_)
    if not best:
        continue
    _, g, w_ = best
    l = g if g.geom_type == "LineString" else min(g.geoms, key=lambda l_: l_.distance(q))
    s0 = l.project(q); a_ = l.interpolate(max(0, s0 - 1)); b_ = l.interpolate(min(l.length, s0 + 1))
    ux, uz = b_.x - a_.x, b_.y - a_.y; L_ = math.hypot(ux, uz) or 1; ux, uz = ux / L_, uz / L_
    c0 = l.interpolate(s0)
    for k in range(-int(w_ / 2), int(w_ / 2) + 1):
        cxk, czk = c0.x - uz * k, c0.y + ux * k                      # along the crossing, every metre
        bands.append(Polygon([(cxk - uz * 0.25 - ux * 1.5, czk + ux * 0.25 - uz * 1.5), (cxk + uz * 0.25 - ux * 1.5, czk - ux * 0.25 - uz * 1.5),
                              (cxk + uz * 0.25 + ux * 1.5, czk - ux * 0.25 + uz * 1.5), (cxk - uz * 0.25 + ux * 1.5, czk + ux * 0.25 + uz * 1.5)]))
    zebras += 1
if bands:
    zm = rasterize([(b, 1) for b in bands], out_shape=(gh, gw), transform=TRW, fill=0, dtype="uint8") == 1
    road_img[zm & A_] = 232
img[A_] = road_img[A_]
log("ground: zebras", zebras)


def crop_mask(g, pad=2.0, ss=1):
    """(the image's rows and columns round g, g's mask there), at the ground picture's 0.25 m; with ss > 1 the share of each pixel
    g covers, drawn ss × ss finer (a 12 cm line is thinner than a pixel: drawn whole it would break into dots)."""
    if g is None or g.is_empty:
        return None
    x0, z0, x1, z1 = g.bounds
    c0, r0 = max(0, int((x0 - pad) / GR)), max(0, int((z0 - pad) / GR)); c1, r1 = min(gw, int((x1 + pad) / GR) + 1), min(gh, int((z1 + pad) / GR) + 1)
    if c1 <= c0 or r1 <= r0:
        return None
    m = rasterize([(g, 1)], out_shape=((r1 - r0) * ss, (c1 - c0) * ss), transform=Affine(GR / ss, 0, c0 * GR, 0, GR / ss, r0 * GR),
                  fill=0, dtype="uint8")
    if ss > 1:
        return (slice(r0, r1), slice(c0, c1)), m.reshape(r1 - r0, ss, c1 - c0, ss).mean(axis=(1, 3))
    return (slice(r0, r1), slice(c0, c1)), m == 1


# the sports grounds: each part in its own clean colour (the photograph's median there: no player, shadow or worn line), a gentle
# variation of the photograph's lightness over ~3 m kept, a grass pitch's mowing stripes, the markings painted white
line_m2 = 0
for s_ in SPORTS:
    for reg in s_["regions"]:
        cm = crop_mask(reg)
        if not cm or cm[1].sum() < 20:
            continue
        sl, m = cm; sub = img[sl]; px = sub[m]; l_ = px.mean(1); ml = float(np.median(l_))
        ok = (l_ < ml + 22) & (l_ > ml - 45)
        col = np.median(px[ok] if ok.sum() > 10 else px, axis=0)
        L_ = sub.mean(2); okm = (m & (np.abs(L_ - ml) < 22)).astype(np.float32)
        wv = gaussian_filter(okm, 12)
        var = np.where(wv > 0.05, np.clip(gaussian_filter(L_ * okm, 12) / (wv + 1e-3) / max(ml, 1), 0.94, 1.06), 1.0)
        new = col[None, None, :] * var[..., None]
        if s_["stripes"] is not None:
            F_ = s_["stripes"]
            zz_, xx_ = (np.mgrid[sl][0] + 0.5) * GR, (np.mgrid[sl][1] + 0.5) * GR
            su = (xx_ - F_[0][0]) * F_[1][0] + (zz_ - F_[0][1]) * F_[1][1]
            nb = max(2, int(round(F_[3] / 12)) * 2)
            new = new * np.where(np.floor((su + F_[3] / 2) / (F_[3] / nb)) % 2 == 1, 1.035, 0.965)[..., None]
        sub[m] = new[m]
    cm = crop_mask(s_["lines"], 0.5, ss=4)
    if cm:
        sl, cov = cm; sub = img[sl]; a_ = np.clip(cov * 1.8, 0, 0.9)[..., None]
        sub[...] = sub * (1 - a_) + np.array([236, 236, 230], np.float32) * a_; line_m2 += cov.sum() * GR * GR
if SPORTS:
    log("sports grounds painted; markings", int(line_m2), "m²")
GC = {"paved": (112, 110, 106), "road": (100, 100, 98), "open": (98, 122, 64), "open_t": (92, 114, 60), "forest": (82, 80, 58),
      "oob": (94, 116, 62), "building": (118, 112, 104), "water": (52, 74, 86), "stairs": (130, 128, 124), "path": (150, 132, 100),
      "small_path": (140, 124, 96), "slow": (76, 92, 54), "walk": (70, 86, 50), "block": (70, 90, 50)}
lut = np.array([GC.get(n, (96, 104, 70)) for n in CN] + [(96, 104, 70)] * (256 - len(CN)), np.float32)
cg = np.repeat(np.repeat(lut[cl1], 4, axis=0), 4, axis=1)[:gh, :gw]
can = (cz["chm"] > 2.5).astype(np.float32)
canw = gauss(can, 1.5)[ri[:, None], ci[None, :]]
canw[A_] = 0                                                       # the cleaned asphalt already shows the road under a street tree
outside = ((gx < EX0) | (gx > EX1))[None, :] | ((gy < EY0) | (gy > EY1))[:, None]
grain = np.clip(lumi / np.maximum(gauss(lumi, 6), 1), 0.75, 1.25)[..., None]
m = np.clip(np.maximum(canw * 1.3 - 0.15, outside.astype(np.float32)), 0, 1)[..., None]
cg = gauss(cg, (3, 3, 0))
log("ground: class colours")
img = (img * (1 - m) + cg * (0.9 + 0.1 * grain) * m) * 0.8          # the photograph's colours are lit already: the scene lights them again
# the street's ambient occlusion: the ground darker where it meets a building (26 % at the wall, half that 0.8 m out)
# (by strips with 50 m of rows around each: a distance over ~42 m darkens nothing — 1 − 0.26 e^(−d/1.15) rounds to 1 —, one under
# 50 m is the same whether measured in the strip or the whole image, and a strip with no building within 50 m is all far)
_nb = surf != 8
dwall = (strips(lambda b: np.full(b.shape, np.inf) if b.all() else distance_transform_edt(b), _nb, int(50 / GR)) if not _nb.all()
         else distance_transform_edt(_nb)) * GR
log("ground: occlusion")
img = img * (1 - 0.26 * np.exp(-dwall / 1.15) * (surf != 8))[..., None]
img = np.clip(img, 0, 255).astype(np.uint8)
Image.fromarray(img).save(PKG / "ground.jpg", quality=88)
Image.fromarray(surf[::2, ::2]).save(PKG / "surf.png", optimize=True)
log("ground.jpg", img.shape, round((PKG / "ground.jpg").stat().st_size / 1e6, 2), "MB; markings", int(mark.sum() * GR * GR), "m²; zebras", zebras)

# ---- kerbs along the carriageways (13 cm, not in the buildings) ----------------------------------------------------------------
Bw = unary_union([Polygon(r) for r in foot if len(r) >= 4]).buffer(0.3)
kerb = carriage.boundary.difference(Bw)
for l in getattr(kerb, "geoms", [kerb]):
    if l.geom_type == "LineString" and l.length > 2:
        walls.append({"pts": [[round(x, 2), round(z, 2)] for x, z in l.simplify(0.15).coords], "kind": "kerb", "h": 0.13, "imp": False})

log("kerbs")
# ---- parked cars, from the LiDAR (2023): 1.1-2.3 m tall objects of a car's size and shape on paved ground ---------------------------
Zl = np.load(SRC / "lidar_grids.npz")
hgt = np.where(Zl["zo"] > -1e8, Zl["zo"] - Zl["dtm"], 0)
vegh = np.where(Zl["zv"] > -1e8, Zl["zv"] - Zl["dtm"], 0)
carm = (hgt > 1.1) & (hgt < 2.3) & (cz["cl"] == 8) & ~((vegh > 1.0) & (Zl["n4"] + Zl["n5"] > 1))
lab_, n_ = nd_label(binary_dilation(carm, iterations=1))
cars = []
CARCOL = [(40, 42, 46), (210, 212, 214), (150, 152, 156), (90, 92, 96), (30, 50, 90), (120, 20, 24), (230, 230, 228), (60, 70, 60)]
# each component read within its own bounding box (find_objects), never over the whole grid; the sports grounds' and passages'
# exclusion zones buffered once
_size = np.bincount(lab_.ravel(), minlength=n_ + 1)
_nocar = [s_["g"].buffer(5) for s_ in SPORTS] + [PASSES.buffer(4)]
for g_ in _nocar:
    shapely.prepare(g_)
for k, sl in enumerate(find_objects(lab_), 1):
    if sl is None or not (14 <= _size[k] <= 70):                    # 3.5-17.5 m² of 0.5 m cells
        continue
    ii, jj = np.nonzero(lab_[sl] == k); ii = ii + sl[0].start; jj = jj + sl[1].start
    xw, zw = wx(EX0 + (jj + 0.5) * 0.5), wz(EY1 - (ii + 0.5) * 0.5)
    c_ = np.c_[xw, zw]; mu = c_.mean(0)
    ev, evec = np.linalg.eigh(np.cov((c_ - mu).T))
    Lc, Wc = 4 * math.sqrt(max(ev[1], 1e-6)), 4 * math.sqrt(max(ev[0], 1e-6))
    if not (3.2 <= Lc <= 5.8 and 1.3 <= Wc <= 2.5 and Lc / Wc > 1.5):
        continue
    ang = math.degrees(math.atan2(evec[0, 1], evec[1, 1]))
    if 0 < mu[0] < W and 0 < mu[1] < H and not any(g_.contains(Point(*mu)) for g_ in _nocar):  # a pitch's dugouts, a tunnel's mouth are no cars
        cars.append([round(float(mu[0]), 2), round(float(mu[1]), 2), round(ang, 1), round(min(Lc, 4.8), 2), round(min(Wc, 1.9), 2),
                     int(rng.integers(len(CARCOL)))])
log("cars", len(cars), "kerbs", sum(1 for w_ in walls if w_["kind"] == "kerb"))
for s_ in SPORTS:                                                    # goals, rugby posts, nets
    props += [p_ for p_ in s_["props"] if 0 < p_[1] < W and 0 < p_[2] < H]
    walls += s_["walls"]
log("sports props", sum(len(s_["props"]) for s_ in SPORTS), "nets", sum(len(s_["walls"]) for s_ in SPORTS))

json.dump({"arrays": arrays, "chunks": index, "foot": foot, "walls": walls, "props": props, "chunk": CH, "chimneys": chimneys,
           "cars": cars, "carColours": CARCOL, "surfRes": GR * 2, **({"facadeTex": "facades.webp"} if ATLAS is not None else {}),
           "panoramax": {"authors": FAC.get("authors", []), "buildings": stats.get("panoramax", 0)},
           "credit": "© IGN (LiDAR HD, BD TOPO, BD ORTHO), Licence Ouverte 2.0; © OpenStreetMap contributors, ODbL; "
                     "Panoramax (" + ", ".join(FAC.get("authors", [])) + "), façade colours derived from CC BY-SA 4.0 photos"},
          open(PKG / "town.json", "w"), separators=(",", ":"))
log("town.bin", round(len(out) / 1e6, 2), "MB; town.json", round((PKG / "town.json").stat().st_size / 1e6, 2), "MB; walls", len(walls),
    "props", len(props), "chimneys", len(chimneys), stats)
# features.json: the town's walls are drawn by vtown.js, not as the forest's strips
F = json.load(open(PKG / "feats.json")); F["walls"] = []
# a goal's or rugby posts' cross on the map (531) is drawn by this town's own props: no « man-made » box of vworld.js there
GOALS = [(p_[1], p_[2]) for s_ in SPORTS for p_ in s_["props"] if p_[0] in ("goal", "goal5", "rugby", "citygoal")]
F["features"] = [f for f in F.get("features", []) if not (f.get("k") == "manmade" and any(math.hypot(f["x"] - x, f["z"] - z) < 4 for x, z in GOALS))]
json.dump(F, open(PKG / "feats.json", "w"))
race["town"] = {"file": "town.json", "bin": "town.bin", "surf": "surf.png", **({"tex": "facades.webp"} if ATLAS is not None else {})}
race["source"] = "town"
# Panoramax's photos read for the façades' colours and textures, credited: their authors, and every photo by its id
# every photo the façades were read from (town_panoramax.py's poses: the colours; the textures' photos are among them)
used = {p["id"]: p for p in (json.load(open(SRC / "poses.json")) if (SRC / "poses.json").exists() else [])}
authors = sorted(set(FAC.get("authors", [])) | {p["author"] for p in used.values() if p.get("author")})
race["photoAuthors"] = authors
race["photoCredits"] = [{"id": p["id"], "author": p["author"], "date": p.get("date", ""), "licence": p.get("licence") or "CC-BY-SA-4.0",
                         "url": f"https://panoramax.openstreetmap.fr/#focus=pic&pic={p['id']}"} for p in sorted(used.values(), key=lambda p: p["id"])]
if ATLAS is not None:
    race["textures"] = {"facades.webp": {
        "licence": "CC BY-SA 4.0", "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "note": "Façade textures rectified from Panoramax street photos (CC BY-SA 4.0); this derived work is itself CC BY-SA 4.0. "
                "Nothing below 2.5 m above the street is taken (people, number plates).",
        "sources": "photoCredits"}}
else:
    race.pop("textures", None)
race["groundRes"] = GR
json.dump(race, open(PKG / "race.json", "w"), indent=1)
log("ground.jpg", img.shape, round((PKG / "ground.jpg").stat().st_size / 1e6, 2), "MB")
