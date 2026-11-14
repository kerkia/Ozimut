"""A « Virtually » race from the LiDAR alone, without an organiser's map (administrators; owner, 2026-11-11): the generated
orienteering map of mapgen (karttapullautin over the national LiDAR, OpenStreetMap drawn over) is the player's map, and what
build.py needs is made from the same sources, so that the forest one runs through looks like the map one reads.

  py lidarrace.py <race> <lat> <lon> [size m] [--kp pullauta] [--work folder] [--tiles folder]

Writes DATA/<race>/ (DATA = paths.DATA_DIR / "virtual", or env VIRTUAL_DATA), then build.py and course.py run as for a map:
  map.json      the dump.mjs shape, made up: the frame (`frame`, mm), its grid (`epsg`), no map relief (`lidarOnly`), and as
                objects OpenStreetMap's ways and areas (roads, tracks, paths, streams, walls, fences, buildings, water, paved
                ground: their ISOM 2017 symbols), the rock (karttapullautin's cliffs: on sandstone boulders and outcrops,
                elsewhere cliff lines 202) and the knolls and small depressions (karttapullautin's, and those the terrain model
                shows that it left out)
  cls_base.png  the ground classes under them, 1 m: karttapullautin's vegetation brought to ISOM's three greens and generalised
                as a mapper draws it (white forest, 406, 408, 410, open land 401 where the grass is mown or grazed, 403)
  map.webp      the map itself over the frame (0.5 m a pixel), which the game shows instead of an OCAD file: karttapullautin's
                image with its ground repainted from cls_base (the same layer the world uses)
  lidar/laz/    the point clouds (the ground, the trees: build.py)
The tiles come from mapgen (python -m mapgen tiles …, forest style) unless --tiles names a folder that holds them (with its
work/ beside: the point clouds, the terrain model and OpenStreetMap's answer).

The generic rules of 2026-11-14 (owner, after a club's map of Autrans, its neighbour on the Vercors, was looked at as a reference
only — never copied): the vegetation in ISOM's three greens, generalised (karttapullautin's seven shades at a metre gave 53 % of
green in 7 700 patches where a mapper draws a fifth as much in smooth areas), the grass of meadows and pastures as open land 401
(OpenStreetMap's open land, in France IGN's parcel register RPG), the rock from karttapullautin's cliffs only (its c3g marks every
steep spot: rows of boulders on steep earth the map did not show) and, off sandstone, as cliffs rather than rows of boulders,
and the knolls and small depressions of the terrain model of 1 m or more that karttapullautin left out."""
import argparse, json, math, os, shutil, subprocess, sys, time
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from mapgen import grids, osm, run as mg                               # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("race"); ap.add_argument("lat", type=float); ap.add_argument("lon", type=float)
ap.add_argument("size", type=float, nargs="?", default=2000)
ap.add_argument("--kp", default=shutil.which("pullauta") or "pullauta")
ap.add_argument("--work", type=Path, default=None)
ap.add_argument("--tiles", type=Path, default=None)
A = ap.parse_args()
DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
RD = DATA / A.race; RD.mkdir(parents=True, exist_ok=True)
T0 = time.time()
log = lambda *a: print(f"[{time.time() - T0:5.0f}s]", *a, flush=True)

# ---- the country, its grid, the square -----------------------------------------------------------------------------------
def country_at(lat, lon):
    for cc in ("fr", "ch", "nz", "us", "ca"):
        try:
            rings = grids._rings(cc)
        except Exception:
            continue
        for ring in rings:
            inside = False
            for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
                if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-12) + x1:
                    inside = not inside
            if inside:
                return cc
    return None


CC = country_at(A.lat, A.lon)
if not CC:
    sys.exit("no LiDAR source known here (France, Switzerland, the USA, Canada, New Zealand)")
half = A.size / 2
corners = []
ids = grids.ids_for(CC, [(A.lat, A.lon)], margin=half)
EPSG = grids.parse(ids[0]).epsg
cx, cy = grids.from_latlon(EPSG, A.lat, A.lon)
GX0, GX1, GY0, GY1 = cx - half, cx + half, cy - half, cy + half
log(A.race, CC, f"EPSG:{EPSG}", len(ids), "tiles", ids)

# ---- the tiles ---------------------------------------------------------------------------------------------------------------
work = A.work or (DATA / "_mapgen")
tiles = A.tiles or (work / "out")
if not all((tiles / "t" / f"{t}.png").exists() and (tiles / "t" / f"{t}.forest.vege.png").exists() for t in ids):
    r = subprocess.run([sys.executable, "-m", "mapgen", "tiles", *ids, "--style", "forest", "--out", str(tiles), "--work", str(work / "work"),
                        "--kp", str(A.kp)], cwd=ROOT)
    if r.returncode:
        sys.exit("mapgen failed")
mwork = (A.tiles.parent / "work") if A.tiles else (work / "work")
missing = [t for t in ids if not (tiles / "t" / f"{t}.json").exists()]
if missing:                                       # mapgen keeps no tile without its OpenStreetMap: Overpass may have failed
    sys.exit(f"mapgen made no tile for {', '.join(missing)} (OpenStreetMap's Overpass may have failed: try again later)")
recs = {t: json.loads((tiles / "t" / f"{t}.json").read_text(encoding="utf-8")) for t in ids}
if any(r.get("none") for r in recs.values()):
    sys.exit("no LiDAR yet in part of the area: " + ", ".join(t for t, r in recs.items() if r.get("none")))
log("tiles ready")

# ---- the world: 1 m, x east from GX0, z south from GY1 ----------------------------------------------------------------------
W = H = int(round(A.size))
K = 10.0                                    # 1:10 000: 10 m a map mm
SCALE = 10000
# map mm: (gx - GX0) / K east, (gy - GY0) / K north — build.py's frame from `frame` [X0, Y0, X1, Y1] mm
frame = [0.0, 0.0, W / K, H / K]
# vegetation classes, 1 m: each tile's vege.png (1000 px from its north-west corner) put together. karttapullautin paints seven
# greens (MapAnt's thresholds); ISOM has three: its two lightest are white forest (in a fir and beech forest they are the firs'
# low branches and the beeches' seedlings, which a mapper leaves white or stripes), the next two 406, the next two 408, the
# darkest 410 (2026-11-14; before, the two lightest were 406 too)
VEG = {(255, 255, 255): "forest", (255, 219, 166): "rough", (200, 254, 200): "forest", (180, 246, 180): "forest",
       (160, 239, 160): "slow", (140, 231, 140): "slow", (120, 224, 120): "walk", (100, 217, 100): "walk", (80, 209, 80): "fight"}
CL =["forest", "open", "open_t", "rough", "rough_t", "slow", "slow_vis", "walk", "walk_vis", "fight", "paved", "rock",
      "building", "path", "road", "stony", "bfield", "water", "track", "marsh", "marsh_x", "shallow", "cliff", "oob",
      "cultivated", "stream", "rockstep", "outside", "block", "small_path", "stairs"]       # build.py's classes, in its order
C = {n: i for i, n in enumerate(CL)}
cls = np.full((H, W), C["outside"], np.uint8)
MPX = 0.5                                    # the player's map: 0.5 m a pixel
mapimg = Image.new("RGB", (int(W / MPX), int(H / MPX)), (255, 255, 255))
for t, rec in recs.items():
    x0, y1 = rec["x0"], rec["y1"]
    v = np.array(Image.open(tiles / "t" / f"{t}.forest.vege.png").convert("RGB"))
    keys = v[..., 0].astype(np.int32) * 65536 + v[..., 1].astype(np.int32) * 256 + v[..., 2]
    lut = {r * 65536 + g * 256 + b: C[n] for (r, g, b), n in VEG.items()}
    cv = np.full(keys.shape, C["forest"], np.uint8)
    for k_, c_ in lut.items():
        cv[keys == k_] = c_
    # nearest greens for colours not in the table (anti-aliasing)
    j0, i0 = int(round(x0 - GX0)), int(round(GY1 - y1))
    a0, b0 = max(0, i0), max(0, j0); a1, b1 = min(H, i0 + cv.shape[0]), min(W, j0 + cv.shape[1])
    if a1 > a0 and b1 > b0:
        cls[a0:a1, b0:b1] = cv[a0 - i0:a1 - i0, b0 - j0:b1 - j0]
log("classes")

# ---- OpenStreetMap's ways and areas, and karttapullautin's vectors, as map objects --------------------------------------
cache = sorted(mwork.glob("osm_*.json"), key=lambda p: p.stat().st_mtime)
feats = []
if cache:
    data = json.loads(cache[-1].read_text(encoding="utf-8"))
    fwd = None if CC == "fr" else (lambda a, b: grids.from_latlon(EPSG, a, b))
    feats = osm.project(osm.features(data), fwd)
log("OpenStreetMap features", len(feats))


def mm(gx, gy):
    return [int(round((gx - GX0) / K * 100)), int(round((gy - GY0) / K * 100)), 0, 0]


def inside_any(pts, pad=60):
    return any(GX0 - pad <= x <= GX1 + pad and GY0 - pad <= y <= GY1 + pad for x, y in pts)


objs = []
LINE = {"wide": 502, "road": 503, "track": 504, "path": 505, "smallpath": 506, "wall": 513, "lowwall": 514, "fence": 516,
        "power": 510, "stream:river": 304, "stream:canal": 304, "stream:stream": 305, "stream:ditch": 306, "stream:drain": 306}
# OpenStreetMap's open land and pitches are no objects of their own any more (2026-11-14): they make karttapullautin's open land
# 401 in the ground layer below, which the map and the world both read (an object covered its trees too)
AREA = {"building": 521, "canopy": 522, "water": 301, "paved": 501}
GRASS_KINDS = ("open", "pitch")
for f in feats:
    if "line" in f:
        s = LINE.get(f["kind"])
        if s and inside_any(f["line"]):
            objs.append({"sym": s * 1000, "otp": 2, "ang": 0, "c": [mm(x, y) for x, y in f["line"]]})
    else:
        s = AREA.get(f["kind"])
        if not s:
            continue
        for k, (role, ring) in enumerate([r for r in f["rings"] if r[0] == "outer"] + [r for r in f["rings"] if r[0] != "outer"]):
            if not inside_any(ring):
                continue
            c = [mm(x, y) for x, y in ring]
            if role != "outer":
                continue                                         # holes left out (rare in a forest)
            objs.append({"sym": s * 1000, "otp": 3, "ang": 0, "c": c})

# ---- the ground layer (2026-11-14): open land where the grass is mown or grazed, the vegetation generalised ------------------
from PIL import ImageDraw
from scipy import ndimage
from scipy.signal import fftconvolve

grassm = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(grassm)


def fill_ring(d, ring):
    pts = [(x - GX0, GY1 - y) for x, y in ring]
    if len(pts) >= 3:
        d.polygon(pts, fill=1)


for f in feats:                                                       # OpenStreetMap's lawns, meadows, grassland, pitches
    if "rings" in f and f["kind"] in GRASS_KINDS:
        for role, ring in f["rings"]:
            if role == "outer" and inside_any(ring):
                fill_ring(gd, ring)
RPG_GROUPS = {"18", "19"}       # IGN's RPG: « prairies permanentes », « prairies temporaires » (Licence Ouverte 2.0)
SOURCES_EXTRA = {}


def rpg_grass():
    """France's declared grassland parcels in the square (IGN's parcel register, the latest year, WFS data.geopf.fr), kept
    beside the point clouds; none elsewhere, nor when the service fails (never a reason to fail the race)."""
    if EPSG != 2154:
        return []
    p = mwork / f"rpg_{int(GX0)}_{int(GY0)}_{W}.json"
    if not p.exists():
        import urllib.request
        url = ("https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
               "&TYPENAMES=RPG.LATEST:parcelles_graphiques&SRSNAME=EPSG:2154&OUTPUTFORMAT=application/json&COUNT=10000"
               f"&BBOX={GX0:.0f},{GY0:.0f},{GX1:.0f},{GY1:.0f},EPSG:2154")
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": osm.UA}), timeout=120) as r:
                p.write_bytes(r.read())
        except Exception as ex:
            log("RPG not read:", ex)
            return []
    try:
        fs = json.loads(p.read_text(encoding="utf-8")).get("features", [])
    except ValueError:
        return []
    out = []
    for f in fs:
        if str((f.get("properties") or {}).get("code_group")) not in RPG_GROUPS or not f.get("geometry"):
            continue
        g = f["geometry"]
        for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]):
            out.append([tuple(c[:2]) for c in poly[0]])
    SOURCES_EXTRA["rpg"] = "IGN – RPG (Licence Ouverte 2.0)"
    return out


rpg = rpg_grass()
for ring in rpg:
    fill_ring(gd, ring)
grass = np.array(grassm) > 0
cls[grass & (cls == C["rough"])] = C["open"]
log(f"open land 401: OpenStreetMap and {len(rpg)} RPG grassland parcels, {int((cls == C['open']).sum() / 1e4)} ha")

# The generalisation a mapper makes: each cell takes the class most present within GEN_R m (a disc), then every patch under
# its class's least area (ISOM's minimum sizes at 1:10 000, rounded up: a mapper does not draw a green of 10 m) and every hole
# of white forest under GEN_HOLE goes to its surroundings. Measured on Autrans (2026-11-14): green 53 % in 7 700 patches → 32 %
# in 640 (karttapullautin's lightest shades as white forest included).
GEN_R = 6
GEN_MIN = {"open": 300, "rough": 300, "slow": 400, "walk": 300, "fight": 200}
GEN_HOLE = 200
GEN_KINDS = ["forest", "open", "rough", "slow", "walk", "fight"]


def generalise(c):
    veg = np.isin(c, [C[k] for k in GEN_KINDS])
    yy, xx = np.mgrid[-GEN_R:GEN_R + 1, -GEN_R:GEN_R + 1]
    disc = ((xx * xx + yy * yy) <= GEN_R * GEN_R).astype(np.float32)
    best = np.full(c.shape, -1.0, np.float32); arg = c.copy()
    for k in GEN_KINDS:
        s = fftconvolve((c == C[k]).astype(np.float32), disc, mode="same")
        m = veg & (s > best + 1e-3)
        best[m] = s[m]; arg[m] = C[k]
    c = np.where(veg, arg, c).astype(np.uint8)
    for _ in range(3):
        changed = 0
        for k, least in list(GEN_MIN.items()) + [("forest", GEN_HOLE)]:
            lab, n = ndimage.label(c == C[k])
            if not n:
                continue
            sz = ndimage.sum(np.ones(c.shape, np.int32), lab, np.arange(1, n + 1))
            small = np.isin(lab, np.nonzero(sz < least)[0] + 1)
            if small.any():
                ind = ndimage.distance_transform_edt(small, return_distances=False, return_indices=True)
                c[small] = c[tuple(ind)][small]; changed += int(small.sum())
        if not changed:
            break
    return np.where(veg & ~np.isin(c, [C[k] for k in GEN_KINDS]), C["forest"], c).astype(np.uint8)


def green_share(c):
    land = c != C["outside"]
    return 100 * np.isin(c, [C["slow"], C["walk"], C["fight"]])[land].mean()


before = (green_share(cls), sum(ndimage.label(cls == C[k])[1] for k in GEN_KINDS[1:]))
cls = generalise(cls)
log(f"vegetation generalised: green {before[0]:.0f} % in {before[1]} patches -> {green_share(cls):.0f} % in "
    f"{sum(ndimage.label(cls == C[k])[1] for k in GEN_KINDS[1:])}")

# The map image: karttapullautin's own (contours, cliffs, knolls) with OpenStreetMap over it, its ground repainted from the
# layer above in ISOM 2017's colours, so that the map shows what the world is
ISOM_RGB = {"forest": (255, 255, 255), "open": (255, 186, 54), "rough": (255, 221, 154), "slow": (197, 236, 181),
            "walk": (140, 214, 118), "fight": (62, 177, 48)}
LAYER_RGB = np.zeros((len(CL), 3), np.uint8)
for k, rgb in ISOM_RGB.items():
    LAYER_RGB[C[k]] = rgb
PAL = np.array(list(VEG), np.int16)
for t, rec in recs.items():
    x0, y1 = rec["x0"], rec["y1"]
    px = rec["px"]
    a = np.array(Image.open(tiles / "t" / f"{t}.png").convert("RGB"))
    ground = np.zeros(a.shape[:2], bool)
    for col in PAL:
        ground |= (np.abs(a.astype(np.int16) - col).max(axis=-1) <= 6)
    jj = np.floor(x0 - GX0 + (np.arange(a.shape[1]) + 0.5) * px).astype(int)
    ii = np.floor(GY1 - y1 + (np.arange(a.shape[0]) + 0.5) * px).astype(int)
    okj = (jj >= 0) & (jj < W); oki = (ii >= 0) & (ii < H)
    sub = cls[np.clip(ii, 0, H - 1)][:, np.clip(jj, 0, W - 1)]
    paint = ground & oki[:, None] & okj[None, :] & (sub != C["outside"])
    a[paint] = LAYER_RGB[sub[paint]]
    im = Image.fromarray(a)
    n = int(round(im.width * px / MPX))
    im = im.resize((n, n), Image.Resampling.LANCZOS)
    mapimg.paste(im, (int(round((x0 - GX0) / MPX)), int(round((GY1 - y1) / MPX))))
log("map image")


def decode(enc, x0, y0, q, has_z):
    vals = enc[1:] if has_z else enc
    x, y = vals[0], vals[1]; out = [(x0 + x * q, y0 + y * q)]
    for i in range(2, len(vals) - 1, 2):
        x += vals[i]; y += vals[i + 1]; out.append((x0 + x * q, y0 + y * q))
    return out


rocks = cliffs = knolls = 0
# karttapullautin draws its cliffs as short strokes (c2g, « cliff2 »; its c3g, « cliff3 », marks every steep spot). On sandstone
# (Fontainebleau's chaos) they are drawn on the 1 m grid and gathered by contact: a small group is one boulder, a large one an
# outcrop — boulders along it, about one every 3 m — and the steep marks count. Elsewhere (2026-11-14) only its cliffs are rock,
# chained into cliff lines 202 where it drew them: the steep marks made rows of boulders on steep earth the map did not show
# (Autrans: 49 of 139 outcrops and 70 of 236 boulders), and a limestone step is a small cliff, not a row of boulders.
from scipy.spatial import cKDTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
import biomes                                                          # noqa: E402
SAND = biomes.sandstone(A.lat, A.lon)
rockm = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(rockm)
strokes = []
for t, kind in ((t, kind) for t in ids for kind in ("vec", "steep")):       # c3g's steep marks apart since 2026-11-12 (mapgen)
    p = tiles / "t" / f"{t}.forest.{kind}.json"
    if not p.exists():
        continue
    v = json.loads(p.read_text(encoding="utf-8"))
    x0, y0, q = v["x0"], v["y0"], v["q"]
    for layer, lines in v.get("lines", {}).items():
        if layer not in (("cliff2", "cliff3") if SAND else ("cliff2",)):
            continue
        for enc in lines:
            g = decode(enc, x0, y0, q, True)
            pts = [(gx - GX0, GY1 - gy) for gx, gy in g]
            if any(0 <= x < W and 0 <= z < H for x, z in pts):
                dr.line(pts, fill=2 if layer == "cliff3" else 1, width=1)
                strokes.append(g)


def chains(strokes, tol=0.9):
    """karttapullautin's strokes joined end to end (its cliffs come as 3 m pieces whose ends meet) into lines."""
    if not strokes:
        return []
    ends = np.array([s[0] for s in strokes] + [s[-1] for s in strokes])
    tree = cKDTree(ends); n = len(strokes); used = np.zeros(n, bool); out = []

    def nxt(pt):
        d, ix = tree.query(pt, k=min(8, 2 * n))
        for dd, i in zip(np.atleast_1d(d), np.atleast_1d(ix)):
            if dd > tol:
                break
            k = i % n
            if not used[k]:
                return k, i >= n
        return None

    for s in range(n):
        if used[s]:
            continue
        used[s] = True; line = list(strokes[s])
        for _ in range(2):                                           # forward from the tail, then from the (reversed) head
            while True:
                hit = nxt(line[-1])
                if hit is None:
                    break
                k, at_end = hit; used[k] = True
                seg = list(strokes[k])[::-1] if at_end else list(strokes[k])
                line.extend(seg[1:])
            line.reverse()
        out.append(line)
    return out


rk = np.array(rockm)
cliff_sites = []
if not SAND:
    for line in chains(strokes):
        objs.append({"sym": 202000, "otp": 2, "ang": 0, "c": [mm(x, y) for x, y in line]}); cliffs += 1
        seg = np.hypot(*np.diff(np.array(line), axis=0).T)
        if seg.sum() >= 8:                                           # a cliff one can tell: a control site at its foot (below)
            at = min(int(np.searchsorted(np.cumsum(seg), seg.sum() / 2)), len(line) - 2)
            (ax, ay), (bx, by) = line[at], line[at + 1]
            L = math.hypot(bx - ax, by - ay) or 1.0
            cliff_sites.append(((ax + bx) / 2, (ay + by) / 2, -(by - ay) / L, (bx - ax) / L))
    rk = np.zeros_like(rk)                                            # no boulders made from them
lab, n = ndimage.label(ndimage.binary_dilation(rk > 0, iterations=1))
rng = np.random.default_rng(5)
idx = ndimage.find_objects(lab)
outm = np.zeros((H, W), bool)                                         # the outcrops: one area each in the editable OCAD (206)
for k, sl in enumerate(idx, start=1):
    if sl is None:
        continue
    zz, xx = np.nonzero(lab[sl] == k)
    zz = zz + sl[0].start; xx = xx + sl[1].start
    big = (rk[zz, xx] == 2).any()
    if len(zz) < 30:
        mx, mz = xx.mean() + 0.5, zz.mean() + 0.5
        # an isolated boulder: drawn on the map as ISOM's dot, at the very spot the world's boulder stands (build.py places a
        # 204/205 point without spreading it)
        objs.append({"sym": 205000 if len(zz) > 10 or big else 204000, "otp": 1, "ang": 0, "c": [mm(GX0 + mx, GY1 - mz)], "dot": True}); rocks += 1
        continue
    outm[zz, xx] = True
    pts = np.c_[xx, zz].astype(float) + rng.uniform(0, 1, (len(xx), 2))
    kept = []
    tree = None
    for i in rng.permutation(len(pts)):
        if all((pts[i][0] - a) ** 2 + (pts[i][1] - b) ** 2 > 9 for a, b in kept[-60:]):
            kept.append(tuple(pts[i]))
    for mx, mz in kept:
        objs.append({"sym": 205000, "otp": 1, "ang": 0, "c": [mm(GX0 + mx, GY1 - mz)]}); rocks += 1
    cliffs += 1
kp_pts = []
for t in ids:
    p = tiles / "t" / f"{t}.forest.vec.json"
    if not p.exists():
        continue
    v = json.loads(p.read_text(encoding="utf-8"))
    x0, y0, q = v["x0"], v["y0"], v["q"]
    for layer, flat in v.get("points", {}).items():
        sym = {"dotknoll": 109000, "udepression": 111000}.get(layer)
        if not sym:
            continue
        for gx, gy in decode([0] + flat, x0, y0, q, True):
            if GX0 <= gx <= GX1 and GY0 <= gy <= GY1:
                objs.append({"sym": sym, "otp": 1, "ang": 0, "c": [mm(gx, gy)]}); knolls += 1; kp_pts.append((gx, gy))
log(f"objects {len(objs)}: boulders {rocks} ({'outcrops' if SAND else 'cliff lines'} {cliffs}), knolls and depressions {knolls}")


# ---- the knolls and small depressions karttapullautin left out (2026-11-14): those of the terrain model (France: IGN's MNT of the
#      LiDAR HD at 0.5 m, which mapgen fetched beside the point clouds; elsewhere the tiles' 2 m model) rising or sinking 1 m or
#      more over 10 to 600 m² (a knoll too small for a 5 m contour; 300 for a hollow), roundish, away from roads, paths, buildings, water and cliffs (their banks and
#      cuts are no landforms) and 12 m from karttapullautin's own; Autrans' slopes held about 20 knolls and 10 hollows of 1 m it
#      had mostly left out (8 knolls drawn)
def terrain_model():
    zs = np.full((H, W), np.nan, np.float32)
    cx_ = GX0 + np.arange(W) + 0.5; cy_ = GY1 - np.arange(H) - 0.5
    tifs = sorted(mwork.glob("mnt_*.tif"))
    if tifs:
        import rasterio
        for f in tifs:
            with rasterio.open(f) as r:
                a = r.read(1).astype(np.float32); b = r.bounds; rx, ry = r.res
                if r.nodata is not None:
                    a[a == r.nodata] = np.nan
            cols = np.floor((cx_ - b.left) / rx).astype(int); rows = np.floor((b.top - cy_) / ry).astype(int)
            okc = (cols >= 0) & (cols < a.shape[1]); okr = (rows >= 0) & (rows < a.shape[0])
            if okc.any() and okr.any():
                blk = a[np.ix_(rows[okr], cols[okc])]
                cur = zs[np.ix_(okr, okc)]
                zs[np.ix_(okr, okc)] = np.where(np.isnan(cur), blk, cur)
    if np.isnan(zs).mean() > 0.05:                                   # the tiles' own model (Terrarium PNG, 2 m)
        for t, rec in recs.items():
            p = tiles / "t" / f"{t}.dem.png"
            if not p.exists() or not rec.get("dem"):
                continue
            d = np.array(Image.open(p).convert("RGB")).astype(np.float32)
            z = d[..., 0] * 256 + d[..., 1] + d[..., 2] / 256 - 32768
            step = rec["dem"]["step"]
            cols = np.floor((cx_ - rec["x0"]) / step).astype(int); rows = np.floor((rec["y1"] - cy_) / step).astype(int)
            okc = (cols >= 0) & (cols < z.shape[1]); okr = (rows >= 0) & (rows < z.shape[0])
            if okc.any() and okr.any():
                cur = zs[np.ix_(okr, okc)]
                zs[np.ix_(okr, okc)] = np.where(np.isnan(cur), z[np.ix_(rows[okr], cols[okc])], cur)
    if np.isnan(zs).all():
        return None
    holes = np.isnan(zs)
    if holes.any():
        ind = ndimage.distance_transform_edt(holes, return_distances=False, return_indices=True)
        zs = zs[tuple(ind)]
    return ndimage.gaussian_filter(zs, 1.0), holes


def landforms(tm):
    if tm is None:
        return []
    from skimage.morphology import reconstruction
    h, holes = tm
    busy = Image.new("L", (W, H), 0); bd = ImageDraw.Draw(busy)
    for f in feats:
        if "line" in f and (f["kind"] in LINE or f["kind"].startswith("stream")):
            bd.line([(x - GX0, GY1 - y) for x, y in f["line"]], fill=1, width=11)
        elif "rings" in f and f["kind"] in AREA:
            for role, ring in f["rings"]:
                if role == "outer":
                    fill_ring(bd, ring)
    busy = ndimage.binary_dilation(np.array(busy) > 0, iterations=3) | ndimage.binary_dilation(np.array(rockm) > 0, iterations=4)
    busy |= holes | (cls == C["outside"])
    busy[:8] = busy[-8:] = True; busy[:, :8] = busy[:, -8:] = True
    found = []
    dome = h - reconstruction(h - 1.5, h, method="dilation")          # what rises up to 1.5 m above its surroundings
    seed = h.copy(); seed[1:-1, 1:-1] = h.max()
    sink = reconstruction(seed, h, method="erosion") - h              # what water would fill
    for field, sym, biggest in ((dome, 109000, 600), (sink, 111000, 300)):
        lab, n = ndimage.label(field > 0.3)
        for k, sl in enumerate(ndimage.find_objects(lab), start=1):
            if sl is None:
                continue
            m = lab[sl] == k; area = int(m.sum())
            if not 10 <= area <= biggest:
                continue
            f_ = np.where(m, field[sl], 0)
            if f_.max() < 1.0:
                continue
            dz, dx = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if max(dz, dx) > 2.5 * max(1, min(dz, dx)) or area < 0.35 * dz * dx:
                continue                                              # long or ragged: a bank, a ditch, not a knoll
            iz, ix = np.unravel_index(int(np.argmax(f_)), f_.shape)
            z_, x_ = sl[0].start + iz, sl[1].start + ix
            if busy[z_, x_]:
                continue
            found.append((float(f_.max()), sym, GX0 + x_ + 0.5, GY1 - z_ - 0.5))
    found.sort(reverse=True)
    kept = []
    taken = list(kp_pts)
    for v_, sym, gx, gy in found:
        if all((gx - a) ** 2 + (gy - b) ** 2 > (12 if i < len(kp_pts) else 15) ** 2 for i, (a, b) in enumerate(taken)):
            kept.append((sym, gx, gy)); taken.append((gx, gy))
    return kept


try:
    TM = terrain_model()
except Exception as ex:                                              # never a reason to fail the race
    TM = None
    log("terrain model not read:", ex)
try:
    lf = landforms(TM)
except Exception as ex:
    lf = []
    log("landforms not read:", ex)
# a cliff of 8 m or more is a control site (build.py's « rockface »), 2.5 m from its middle on its lower side: its foot
for mx_, my_, nx_, ny_ in cliff_sites:
    side = 1.0
    if TM is not None:
        hz = lambda gx, gy: TM[0][min(H - 1, max(0, int(GY1 - gy))), min(W - 1, max(0, int(gx - GX0)))]
        side = 1.0 if hz(mx_ + 3 * nx_, my_ + 3 * ny_) < hz(mx_ - 3 * nx_, my_ - 3 * ny_) else -1.0
    objs.append({"sym": 202000, "otp": 1, "ang": 0, "c": [mm(mx_ + 2.5 * side * nx_, my_ + 2.5 * side * ny_)], "site": True})
for sym, gx, gy in lf:
    objs.append({"sym": sym, "otp": 1, "ang": 0, "c": [mm(gx, gy)], "drawn": True}); knolls += 1
log(f"terrain model: {sum(1 for s, _, _ in lf if s == 109000)} knolls and {sum(1 for s, _, _ in lf if s == 111000)} small "
    f"depressions more; {len(cliff_sites)} cliffs as control sites")

# ---- the isolated boulders on the player's map: ISOM 2017-2's dots at 1:10 000 (204 ø 0.6 mm, 205 ø 0.9 mm: 150 % of 1:15 000) ----
dmap = ImageDraw.Draw(mapimg)
for o in objs:
    if o.get("dot"):
        x, y = o["c"][0][0] / 100 * K / MPX, (H - o["c"][0][1] / 100 * K) / MPX
        r = (0.45 if o["sym"] == 205000 else 0.3) * K / MPX
        dmap.ellipse([x - r, y - r, x + r, y + r], fill=(0, 0, 0))
log("boulder dots", sum(1 for o in objs if o.get("dot")))
# the knolls and small depressions added from the terrain model, in karttapullautin's brown: 109 a dot ø 1.1 mm, 111 a half circle
# 1.4 mm across, line 0.37 mm (ISOM 2017-2's 0.75, 0.95 and 0.25 mm at 1:15 000, × 1.5)
BROWN = (166, 85, 43)
for o in objs:
    if o.get("drawn"):
        x, y = o["c"][0][0] / 100 * K / MPX, (H - o["c"][0][1] / 100 * K) / MPX
        if o["sym"] == 109000:
            r = 0.5625 * K / MPX
            dmap.ellipse([x - r, y - r, x + r, y + r], fill=BROWN)
        else:
            r = 0.71 * K / MPX
            dmap.arc([x - r, y - r - 0.3 * r, x + r, y + r - 0.3 * r], 0, 180, fill=BROWN, width=round(0.375 * K / MPX))

# ---- the magnetic north lines (ISOM 601, owner 2026-11-11: a map turned to the leg needs them): blue, 30 mm apart at 1:10 000 =
#      300 m, 0.27 mm wide (0.18 at 1:15 000 × 1.5), on the grid's round hundreds so they agree from one race to the next; drawn
#      parallel to the frame's sides, the game's north being the grid's (its compass points to the map's top)
NORTH_M = 300
north_x = [gx for gx in range(int(-(-GX0 // NORTH_M) * NORTH_M), int(GX1) + 1, NORTH_M)]
for gx in north_x:
    x = (gx - GX0) / MPX
    dmap.line([(x, 0), (x, mapimg.height)], fill=(0, 152, 220), width=max(2, round(0.27 * K / MPX)))
log("north lines", len(north_x))


# ---- an OCAD file of the same map, for an organiser to edit before building (Cartographier's own writer, mkocd.mjs) -------------
def editable_ocd():
    """map_objects.json in mkocd's shape (map mm, y up): the contours, the vegetation as areas, OpenStreetMap's ways and areas,
    the boulders, knolls and depressions — then lidar.ocd, ISOM 2017-2 at 1:10 000, in the race's grid."""
    import rasterio.features
    from rasterio.transform import Affine
    from shapely.geometry import shape
    from scipy.ndimage import median_filter
    out = []
    for o in objs:                                                    # what map.json holds (dump.mjs units: mm × 100)
        if (o["sym"] == 205000 and not o.get("dot")) or o.get("site"):
            continue                                                  # an outcrop's boulders: its area below instead
        sym = 513001 if o["sym"] == 513000 else o["sym"]               # ISOM 2017-2 revision 6: the wall is 513.1
        out.append({"sym": sym, "otp": o["otp"], "ang": 0, "rings": [[[c[0] / 100, c[1] / 100] for c in o["c"]]]})
    # the contours, form lines and index contours karttapullautin drew
    CSYM = {"contour": 101000, "contour_index": 102000, "formline": 103000, "small_depression": 101000, "depression_intermed": 103000}
    for t in ids:
        p = tiles / "t" / f"{t}.forest.vec.json"
        if not p.exists():
            continue
        v = json.loads(p.read_text(encoding="utf-8"))
        x0, y0, q = v["x0"], v["y0"], v["q"]
        for layer, lines in v.get("lines", {}).items():
            sym = CSYM.get(layer)
            if not sym:
                continue
            for enc in lines:
                pts = [((gx - GX0) / K, (gy - GY0) / K) for gx, gy in decode(enc, x0, y0, q, True)]
                pts = [pt for pt in pts if -2 <= pt[0] <= W / K + 2 and -2 <= pt[1] <= H / K + 2]
                if len(pts) >= 2:
                    out.append({"sym": sym, "otp": 2, "ang": 0, "rings": [pts]})
    # the vegetation, from the classes the world uses: each class's patches as areas (a 3 m median first, the smallest left out)
    VSYM = {C["open"]: 401000, C["rough"]: 403000, C["slow_vis"]: 406000, C["slow"]: 406000, C["walk_vis"]: 408000, C["walk"]: 408000, C["fight"]: 410000}
    code = np.zeros_like(cls)
    for c_, s_ in VSYM.items():
        code[cls == c_] = {403000: 1, 406000: 2, 408000: 3, 410000: 4, 401000: 5}[s_]
    code = median_filter(code, size=3)
    tr = Affine(1 / K, 0, 0, 0, -1 / K, H / K)                         # world pixel (x right, z down) -> map mm (y up)
    back = {1: 403000, 2: 406000, 3: 408000, 4: 410000, 5: 401000}
    for geom, val in rasterio.features.shapes(code, mask=code > 0, transform=tr):
        poly = shape(geom).simplify(0.08, preserve_topology=True)       # 0.08 mm = 0.8 m
        if poly.is_empty or poly.area * K * K < (150 if val in (1, 5) else 80):
            continue
        for part in getattr(poly, "geoms", [poly]):
            rings = [list(part.exterior.coords)] + [list(r.coords) for r in part.interiors if r.area * K * K >= 40]
            out.append({"sym": back[int(val)], "otp": 3, "ang": 0, "rings": [[list(pt) for pt in r] for r in rings]})
    # the outcrops as gigantic boulders / rock pillars (206: a black area), as karttapullautin draws them
    for geom, val in rasterio.features.shapes(outm.astype(np.uint8), mask=outm, transform=tr):
        poly = shape(geom).simplify(0.05, preserve_topology=True)
        for part in getattr(poly, "geoms", [poly]):
            if not part.is_empty and part.area * K * K >= 4:
                out.append({"sym": 206000, "otp": 3, "ang": 0, "rings": [[list(pt) for pt in part.exterior.coords]]})
    for gx in north_x:                                                # the north lines (601.1, blue)
        out.append({"sym": 601001, "otp": 2, "ang": 0, "rings": [[[(gx - GX0) / K, 0], [(gx - GX0) / K, H / K]]]})
    J = {"title": f"{A.race} (LiDAR)", "scale": SCALE, "set": "isom2017-2", "realWorld": {"x": GX0, "y": GY0, "epsg": EPSG}, "objects": out}
    json.dump(J, open(RD / "map_objects.json", "w"))
    shim = (ROOT / "tools" / "mapper" / "shim.mjs").as_uri()
    r = subprocess.run(["node", "--import", shim, str(ROOT / "tools" / "virtually" / "mkocd.mjs"), str(RD / "map_objects.json"),
                        str(RD / "lidar.ocd")], cwd=ROOT / "tools" / "virtually", capture_output=True, text=True, encoding="utf-8", errors="replace")
    log("editable OCAD:", (r.stdout or r.stderr).strip()[-300:])


try:
    editable_ocd()
except Exception as ex:                                               # never a reason to fail the race
    log("editable OCAD not written:", ex)

# ---- write ---------------------------------------------------------------------------------------------------------------
lat_c, lon_c = grids.to_latlon(EPSG, cx, cy)
D = {"version": 0, "scale": SCALE, "realWorld": {"x": GX0, "y": GY0, "angle": 0, "zone": 0}, "epsg": EPSG, "frame": frame,
     "lidarOnly": True, "std": "ISOM 2017", "syms": [], "objs": objs, "courseSetting": None,
     "sources": {"lidar": recs[ids[0]].get("src", ""), "lidarDate": max(r.get("lidar", "") for r in recs.values()), "osm": recs[ids[0]].get("osm", ""), **SOURCES_EXTRA}}
json.dump(D, open(RD / "map.json", "w"))
Image.fromarray(cls, "L").save(RD / "cls_base.png", optimize=True)
mapimg.save(RD / "map.webp", quality=90, method=6)
th = mapimg.copy(); th.thumbnail((640, 640), Image.Resampling.LANCZOS); th.save(RD / "thumb.webp", quality=82)   # the page's card
if not (RD / "biome.json").exists():
    # the place's biome (biomes.py: Fontainebleau's sandstone forests, else a temperate European forest)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import biomes
    json.dump(biomes.for_place(lat_c, lon_c), open(RD / "biome.json", "w"))
laz = RD / "lidar" / "laz"; laz.mkdir(parents=True, exist_ok=True)
for t in ids:
    for f in (mwork / "laz").glob(f"*{t}*.la[sz]"):
        dst = laz / f.name
        if not dst.exists():
            try:
                os.link(f, dst)
            except OSError:
                shutil.copyfile(f, dst)
log("written", RD, {f.name: f"{f.stat().st_size / 1e6:.1f} MB" for f in RD.iterdir() if f.is_file()},
    f"centre {lat_c:.5f}, {lon_c:.5f}")
