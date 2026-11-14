"""Build a « Virtually » race package (games/virtually.js) from an OCAD map, the worldwide relief and (where there is one) a
national LiDAR. The inputs live outside git in DATA/<race>/ (DATA = paths.DATA_DIR / "virtual", or env VIRTUAL_DATA):
map.ocd (the club's map: never in the repository), biome.json (ground colours, trees, rocks), lidar/laz/*.laz (lidar.py).

  node --import ../mapper/shim.mjs dump.mjs DATA/<race>/map.ocd DATA/<race>/map.json
  py build.py <race>               the package into DATA/<race>/pkg/
  py course.py <race> [seed] [s]   its six courses (Bleu … Violet long), written into pkg/race.json (review pictures beside)
  node thumb.mjs <race>            its thumbnail, pkg/thumb.webp (npm install here first; headless Edge: run from PowerShell)
  py upload.py <race> [--remote]   the package to R2 virtual/<race>/ (the local dev server's R2 without --remote)
Python: numpy scipy pillow laspy[lazrs] pyproj requests (and httpx apsw for lidar.py, through mapgen).

World frame: the map's own paper frame in metres (x to the map's right, z to the map's bottom), so that the map's north is the
world's -z and the compass agrees with the printed map. Grid 1 m. Outputs in races/<race>/pkg/:
  race.json   frame, size, classes, speeds, biome, sources, (the courses once course.py has run)
  h.png       ground heights, (h - base) * 100 as R * 256 + G
  cls.png     ground classes (CLASSES below)
  veg.png     R trees, G bushes, B low vegetation, per m² densities (TREE_K, BUSH_K, LOW_K)
  ground.jpg  the ground's colours, 1 m
  trees.bin   LiDAR trees: Uint16 x dm, z dm, Uint8 height 0.25 m, crown 0.1 m (6 bytes), when LiDAR
  feats.json  rocks, walls and cliffs, point features
  map.ocd     the map itself, drawn by the game"""
import io, json, math, shutil, sys, time
from collections import defaultdict
from pathlib import Path
import numpy as np
import requests
from PIL import Image, ImageDraw
from l93 import transformer
from scipy.ndimage import gaussian_filter, distance_transform_edt, maximum_filter, binary_dilation
from scipy.sparse import coo_matrix, csr_matrix, diags
from scipy.sparse.linalg import lsqr, cg
from scipy.spatial import cKDTree

import os
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
HERE = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
RACE = sys.argv[1]
RD = HERE / RACE
OUT = RD / "pkg"; OUT.mkdir(parents=True, exist_ok=True)
D = json.load(open(RD / "map.json"))
SCALE = D["scale"]; K = SCALE / 1000.0                   # metres a map mm
RW = D["realWorld"]
T0 = time.time()
log = lambda *a: print(f"[{time.time() - T0:5.0f}s]", *a, flush=True)
rng = np.random.default_rng(hash(RACE) % 2**32)

# ---- the map's grid -----------------------------------------------------------------------------------------------------------
zone = RW.get("zone") or 0
EPSG = D.get("epsg") or ((32700 + (-zone - 2000)) if zone < -2000 else (32600 + zone - 2000) if 2000 < zone < 2100 else 2154)
LIDAR_ONLY = bool(D.get("lidarOnly"))                     # lidarrace.py's: no organiser's map, the generated one
ga = -(RW.get("angle") or 0) * math.pi / 180
cga, sga = math.cos(ga), math.sin(ga)


def mm_to_grid(mx, my):
    X, Y = mx * K, my * K
    return X * cga - Y * sga + RW["x"], X * sga + Y * cga + RW["y"]


TO_LL = transformer(EPSG, 4326)
FROM_LL = transformer(4326, EPSG)

# ---- symbol standard and tables ---------------------------------------------------------------------------------------------
desc = {s["sym"]: (s["desc"] or "") for s in D["syms"]}
num = lambda s: s // 1000
ISO2000 = any(num(s) == 206 and "oulder" in v and "igantic" not in v for s, v in desc.items()) or \
          any(num(s) == 529 and "aved" in v for s, v in desc.items())
# a sprint map (ISSprOM 2019-2): its scale, or a symbol only ISSprOM has (533 area with obstacles)
SPRINT = SCALE <= 5000 or any(num(s) == 533 for s in desc)
ISO2000 = ISO2000 and not SPRINT
STD = "ISSprOM 2019" if SPRINT else "ISOM 2000" if ISO2000 else "ISOM 2017"
CL = ["forest", "open", "open_t", "rough", "rough_t", "slow", "slow_vis", "walk", "walk_vis", "fight", "paved", "rock",
      "building", "path", "road", "stony", "bfield", "water", "track", "marsh", "marsh_x", "shallow", "cliff", "oob",
      "cultivated", "stream", "rockstep", "outside", "block", "small_path", "stairs"]
C = {n: i for i, n in enumerate(CL)}
SPEED = {"forest": 0.82, "open": 1.0, "open_t": 0.95, "rough": 0.78, "rough_t": 0.74, "slow": 0.6, "slow_vis": 0.68,
         "walk": 0.4, "walk_vis": 0.46, "fight": 0.2, "paved": 1.05, "rock": 0.7, "path": 1.0, "road": 1.05, "stony": 0.62,
         "bfield": 0.42, "track": 1.02, "marsh": 0.5, "shallow": 0.3, "cultivated": 0.8, "stream": 0.55, "rockstep": 0.3,
         "small_path": 0.95, "stairs": 0.55, "building": 0, "water": 0, "marsh_x": 0, "cliff": 0, "oob": 0, "outside": 0, "block": 0}
if SPRINT:
    # ISSprOM 2019-2: 520 (olive) and 709/714 shall not be entered, 411 impassable vegetation, 522 canopies run as paving
    AREA = {401: "open", 402: "open_t", 403: "rough", 404: "rough_t", 405: "forest", 406: "slow", 407: "slow_vis", 408: "walk",
            409: "walk_vis", 410: "fight", 411: "block", 412: "cultivated", 413: "cultivated", 414: "cultivated", 113: "rough",
            206: "cliff", 208: "bfield", 210: "stony", 213: "open", 214: "rock", 301: "water", 302: "shallow", 307: "marsh_x",
            308: "marsh", 310: "marsh", 501: "paved", 512: "paved", 520: "oob", 521: "building", 522: "paved", 533: "slow",
            709: "oob", 714: "oob"}
    LINE = {505: ("path", 1.6), 506: ("small_path", 1.0), 507: ("small_path", 0.7), 508: ("small_path", 0.7), 201: ("cliff", 1.4),
            202: ("rockstep", 1.0), 305: ("stream", 1.2), 306: ("stream", 0.7), 309: ("marsh", 2.5), 509: ("block", 3.0),
            515: ("block", 0.8), 518: ("block", 0.6), 529: ("block", 1.0), 532: ("stairs", 2.5), 708: ("block", 0.8)}
    WALL = {201: ("cliff", 3.0), 202: ("rockface", 1.6), 513: ("stonewall", 0.9), 515: ("stonewall", 2.0), 516: ("fence", 1.1),
            518: ("fence", 2.0), 510: ("powerline", 9), 511: ("powerline", 12), 104: ("bank", 1.2)}
    POINT = {109: "knoll", 110: "eknoll", 111: "depression", 112: "pit", 115: "landform", 203: "rockpit", 204: "boulder",
             205: "bigboulder", 207: "cluster", 303: "waterhole", 311: "fountain", 312: "waterhole", 313: "fountain",
             417: "bigtree", 418: "bush", 419: "vegspec", 524: "tower", 525: "tower", 526: "monument", 527: "manmade",
             530: "manmade", 531: "manmade"}
    TICK = lambda s: s in (101009, 102009, 103009)
    MINI = {}
    CONTOUR = {101: "c", 102: "c", 103: "f"}
elif ISO2000:
    AREA = {401: "open", 402: "open_t", 403: "rough", 404: "rough_t", 405: "forest", 406: "slow", 407: "slow_vis", 408: "walk",
            409: "walk_vis", 410: "fight", 411: "slow", 412: "cultivated", 413: "cultivated", 415: "cultivated",
            202: "cliff", 211: "open", 212: "rock", 301: "water", 302: "water", 309: "marsh_x", 310: "marsh", 311: "marsh",
            526: "building", 527: "paved", 528: "oob", 529: "paved", 501: "paved"}
    LINE = {502: ("road", 7), 503: ("road", 5), 504: ("road", 4), 505: ("track", 3), 506: ("path", 1.6), 507: ("small_path", 1.0),
            508: ("small_path", 0.7), 509: ("small_path", 0.7), 201: ("cliff", 1.4), 203: ("rockstep", 1.0), 304: ("water", 4),
            305: ("stream", 2.2), 306: ("stream", 1.2), 307: ("stream", 0.7), 308: ("marsh", 2.5), 521: ("block", 1.0),
            524: ("block", 0.8), 510: ("road", 3)}
    WALL = {201: ("cliff", 3.0), 203: ("rockface", 1.6), 519: ("stonewall", 0.8), 520: ("stonewall", 0.4), 521: ("stonewall", 1.8),
            522: ("fence", 1.2), 523: ("fence", 0.6), 524: ("fence", 2.2), 516: ("powerline", 9), 106: ("bank", 1.2)}
    POINT = {112: "knoll", 113: "eknoll", 115: "depression", 116: "pit", 117: "broken", 118: "landform", 202: "rockface",
             204: "rockpit", 205: "cave", 206: "boulder", 207: "bigboulder", 208: "bfield", 209: "cluster", 210: "stony",
             303: "waterhole", 418: "vegspec", 419: "vegspec", 420: "vegspec", 412: "orchard", 512: "footbridge",
             535: "tower", 536: "tower", 537: "cairn", 538: "manmade", 539: "manmade", 540: "manmade", 526: "smallbuilding"}
    TICK = lambda s: num(s) == 104
    MINI = {}
    CONTOUR = {101: "c", 102: "c", 103: "f"}
else:
    AREA = {401: "open", 402: "open_t", 403: "rough", 404: "rough_t", 405: "forest", 406: "slow", 407: "slow_vis", 408: "walk",
            409: "walk_vis", 410: "fight", 411: "slow", 412: "cultivated", 413: "cultivated", 414: "cultivated",
            201: "cliff", 206: "cliff", 211: "walk", 212: "fight", 213: "open", 214: "rock", 301: "water", 302: "shallow",
            307: "marsh_x", 308: "marsh", 310: "marsh", 501: "paved", 520: "oob", 521: "building", 522: "paved"}
    LINE = {502: ("road", 7), 503: ("road", 4.5), 504: ("track", 3), 505: ("path", 1.6), 506: ("small_path", 1.0),
            507: ("small_path", 0.7), 508: ("small_path", 0.7), 201: ("cliff", 1.4), 202: ("rockstep", 1.0), 304: ("stream", 3),
            305: ("stream", 1.2), 306: ("stream", 0.7), 309: ("marsh", 2.5), 515: ("block", 1.0), 518: ("block", 0.8),
            509: ("road", 3)}
    WALL = {201: ("cliff", 3.0), 202: ("rockface", 1.6), 513: ("stonewall", 0.9), 514: ("stonewall", 0.4), 515: ("stonewall", 1.8),
            516: ("fence", 1.2), 517: ("fence", 0.6), 518: ("fence", 2.2), 510: ("powerline", 9), 511: ("powerline", 12),
            104: ("bank", 1.2)}
    POINT = {109: "knoll", 110: "eknoll", 111: "depression", 112: "pit", 113: "broken", 115: "landform", 202: "rockface",
             201: "rockface", 203: "rockpit", 204: "boulder", 205: "bigboulder", 207: "cluster", 208: "bfield", 210: "stony",
             303: "waterhole", 417: "bigtree", 418: "vegspec", 419: "vegspec", 524: "tower", 525: "tower", 526: "cairn",
             527: "manmade", 530: "manmade", 531: "manmade", 521: "smallbuilding"}
    TICK = lambda s: s in (101001, 103001)
    MINI = {101002: 1.6, 101003: -1.6, 103002: 0.9, 103003: -0.9}
    CONTOUR = {101: "c", 102: "c", 103: "f"}
if ISO2000 or SPRINT:
    MINI = {}
log(RACE, STD, "scale 1:%d" % SCALE, "EPSG", EPSG)

# ---- extent (mm), world grid ------------------------------------------------------------------------------------------------
objs = [o for o in D["objs"] if 100 <= num(o["sym"]) < 600]
allx = np.array([c[0] / 100 for o in objs for c in o["c"]]); ally = np.array([c[1] / 100 for o in objs for c in o["c"]])
MARGIN_MM = 40 / K
if D.get("frame"):                                        # a frame given (lidarrace.py): the map's square, no margin
    X0, Y0, X1, Y1 = D["frame"]
else:
    X0, X1 = np.percentile(allx, 0.1) - MARGIN_MM, np.percentile(allx, 99.9) + MARGIN_MM
    Y0, Y1 = np.percentile(ally, 0.1) - MARGIN_MM, np.percentile(ally, 99.9) + MARGIN_MM
W, H = int(math.ceil((X1 - X0) * K)), int(math.ceil((Y1 - Y0) * K))
log(f"world {W} x {H} m")
wx = lambda mx: (mx - X0) * K
wz = lambda my: (Y1 - my) * K


def flatten(c):
    """OCAD coords -> rings of world (x, z) points, Béziers flattened."""
    rings, cur, i = [], [], 0
    P = lambda k: (wx(c[k][0] / 100), wz(c[k][1] / 100))
    while i < len(c):
        fx, fy = c[i][2], c[i][3]
        if i > 0 and (fy & 2) and not (fx & 3):
            rings.append(cur); cur = []
        if (fx & 3) and i + 2 < len(c) and cur:
            p0 = cur[-1]; p1, p2, p3 = P(i), P(i + 1), P(i + 2)
            for k in range(1, 9):
                t = k / 8; u = 1 - t
                cur.append((u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]))
            i += 3
            continue
        cur.append(P(i)); i += 1
    if cur:
        rings.append(cur)
    return rings


# world cell centres -> projected grid -> lat/lon (at 8 m nodes, then bilinear)
def world_to_proj(x, z):
    return mm_to_grid(X0 + x / K, Y1 - z / K)


def node_field(fn, step=8):
    cs = np.arange(0, W + step, step, dtype=float); rs = np.arange(0, H + step, step, dtype=float)
    CX, RZ = np.meshgrid(cs, rs)
    v = fn(CX + 0.5, RZ + 0.5)
    return np.array(Image.fromarray(v.astype(np.float32), "F").resize((W, H), Image.BILINEAR), np.float32) if v.ndim == 2 else v


# ---- classes ------------------------------------------------------------------------------------------------------------------
cls = np.full((H, W), C["forest"], np.uint8)
if (RD / "cls_base.png").exists():                        # the ground's classes under the map's objects (lidarrace.py)
    cls = np.array(Image.open(RD / "cls_base.png"))[:H, :W].copy()
ORDER = ["cultivated", "open", "open_t", "rough", "rough_t", "marsh", "slow_vis", "slow", "walk_vis", "walk", "fight", "stony",
         "bfield", "rock", "paved", "shallow", "water", "marsh_x", "building", "cliff", "oob"]


def draw_area(rings, val):
    allp = [p for r in rings for p in r]
    xs = [p[0] for p in allp]; zs = [p[1] for p in allp]
    c0, r0 = max(int(min(xs)) - 1, 0), max(int(min(zs)) - 1, 0)
    c1, r1 = min(int(max(xs)) + 2, W), min(int(max(zs)) + 2, H)
    if c0 >= c1 or r0 >= r1:
        return
    m = Image.new("L", (c1 - c0, r1 - r0), 0); dr = ImageDraw.Draw(m)
    for k, r in enumerate(rings):
        if len(r) >= 3:
            dr.polygon([(x - c0, z - r0) for x, z in r], fill=0 if k else 1)
    cls[r0:r1, c0:c1][np.array(m, bool)] = val


areas = defaultdict(list)
for o in objs:
    n = num(o["sym"])
    if o["otp"] == 3 and n in AREA:
        areas[AREA[n]].append(o)
for name in ORDER:
    for o in areas.get(name, []):
        draw_area(flatten(o["c"]), C[name])
img = Image.fromarray(cls); dr = ImageDraw.Draw(img)
walls, lines_c, ticks, points = [], [], [], []
for o in objs:
    n, s = num(o["sym"]), o["sym"]
    if o["otp"] == 2:
        rings = flatten(o["c"])
        if not rings or len(rings[0]) < 2:
            continue
        if n in LINE:
            name, w = LINE[n]
            dr.line(rings[0], fill=C[name], width=max(1, round(w)), joint="curve")
        elif SPRINT and 501006 <= s <= 501009:                     # a paved footway drawn as a line (town_map.py): paved at its width
            dr.line(rings[0], fill=C["paved"], width=round([1.4, 2, 3, 4][s - 501006] + 0.4), joint="curve")
        if n in WALL:
            kind, h = WALL[n]
            walls.append({"kind": kind, "h": h, "pts": [[round(x, 2), round(z, 2)] for x, z in rings[0]]})
        if n in CONTOUR:
            lines_c.append({"kind": CONTOUR[n], "pts": rings[0]})
    elif o["otp"] == 1:
        x, z = wx(o["c"][0][0] / 100), wz(o["c"][0][1] / 100)
        a = (o["ang"] or 0) / 10
        if TICK(s):
            ticks.append((x, z, a, s))
        elif s in MINI:
            points.append({"k": "mini", "x": x, "z": z, "a": a, "h": MINI[s]})
        elif n in POINT:
            points.append({"k": POINT[n], "x": x, "z": z, "a": a, "sub": s % 1000})
cls = np.array(img)
# a passage beneath a bridge, the railway or a building (town_map.py's hidden 993): runnable whatever lies above it
for o in D["objs"]:                                        # (the hidden helpers are not in `objs`)
    if o["otp"] == 3 and o["sym"] == 993000:
        draw_area(flatten(o["c"]), C["paved"])
# and round its mouths, the railway's own stroke (3 m wide) where it overruns the passage (2026-11-14, the owner: « the tunnel
# 3-4 is not accessible »: a road under the RER had a track 0.8 m from its mouth, its block across the way in); walls stay walls
if SPRINT:
    _rail = Image.new("L", (W, H), 0); _dr = ImageDraw.Draw(_rail)
    for o in objs:
        if o["otp"] == 2 and num(o["sym"]) == 509:
            rr = flatten(o["c"])
            if rr and len(rr[0]) >= 2:
                _dr.line(rr[0], fill=1, width=max(1, round(LINE[509][1])), joint="curve")
    _near = Image.new("L", (W, H), 0); _dn = ImageDraw.Draw(_near)
    for o in D["objs"]:
        if o["otp"] == 3 and o["sym"] == 993000:
            rr = flatten(o["c"])
            if rr and len(rr[0]) >= 3:
                _dn.polygon(rr[0], fill=1)
    _near = binary_dilation(np.array(_near, bool), iterations=2)
    cls[_near & np.array(_rail, bool) & (cls == C["block"])] = C["paved"]
# stony ground and boulder fields as ground patches; buildings drawn as points
img = Image.fromarray(cls); dr = ImageDraw.Draw(img)
for p in points:
    if p["k"] in ("stony", "bfield"):
        rr = 2.0 if p["k"] == "stony" else 3.0
        dr.ellipse([p["x"] - rr, p["z"] - rr, p["x"] + rr, p["z"] + rr], fill=C["stony" if p["k"] == "stony" else "bfield"])
cls = np.array(img)
# outside the drawn map: the dilated cover of every object
cover = Image.new("L", (W, H), 0); dc = ImageDraw.Draw(cover)
for o in objs:
    for r in flatten(o["c"]):
        if len(r) >= 2:
            dc.line(r, fill=1, width=3)
        else:
            dc.point(r, fill=1)
cov = np.array(cover, bool)
inside = distance_transform_edt(~cov) < 60
from scipy.ndimage import binary_fill_holes
inside = binary_fill_holes(inside)
if LIDAR_ONLY:
    inside = cls != C["outside"]
cls[~inside] = C["outside"]
log("classes", {CL[i]: int(n) // 10000 for i, n in zip(*np.unique(cls, return_counts=True)) if n > 20000}, "ha",
    "walls", len(walls), "points", len(points), "ticks", len(ticks), "contour lines", len(lines_c))

# ---- coarse worldwide relief (AWS Terrain Tiles) ----------------------------------------------------------------------------
Z14 = 14
def tile_of(lat, lon):
    n = 2 ** Z14
    return (np.asarray(lon) + 180) / 360 * n, (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n


def ll_nodes(CX, RZ):
    gx, gy = world_to_proj(CX, RZ)
    lon, lat = TO_LL.transform(gx, gy)
    return lat, lon


cs = np.arange(0, W + 8, 8.0); rs = np.arange(0, H + 8, 8.0); CX, RZ = np.meshgrid(cs, rs)
lat, lon = ll_nodes(CX, RZ)
px, py = tile_of(lat, lon)
tx0, tx1, ty0, ty1 = int(px.min()), int(px.max()), int(py.min()), int(py.max())
cache = HERE / "_tiles"; cache.mkdir(exist_ok=True)
mos = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256), np.float32)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        f = cache / f"{Z14}_{tx}_{ty}.png"
        if not f.exists():
            r = requests.get(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z14}/{tx}/{ty}.png", timeout=60,
                             headers={"User-Agent": "Ozimut-prototype/1.0"})
            r.raise_for_status(); f.write_bytes(r.content)
        a = np.array(Image.open(f).convert("RGB"), np.float32)
        mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
fx_ = (px - tx0) * 256 - 0.5; fy_ = (py - ty0) * 256 - 0.5
i0 = np.floor(fy_).astype(int); j0 = np.floor(fx_).astype(int); u = fx_ - j0; v = fy_ - i0
cv = mos[i0, j0] * (1 - u) * (1 - v) + mos[i0, j0 + 1] * u * (1 - v) + mos[i0 + 1, j0] * (1 - u) * v + mos[i0 + 1, j0 + 1] * u * v
coarse = np.array(Image.fromarray(cv.astype(np.float32), "F").resize((W, H), Image.BILINEAR), np.float32)
log("coarse relief", round(float(coarse.min()), 1), "-", round(float(coarse.max()), 1), "m")

# ---- LiDAR, where there is one ----------------------------------------------------------------------------------------------
lid = None
lazs = sorted((RD / "lidar" / "laz").glob("*.la[sz]")) if (RD / "lidar" / "laz").exists() else []
lazs = [f for f in lazs if not f.name.startswith("edge_")]
if lazs:
    import laspy
    # world cell -> projected coordinates for every cell (exact affine), then each point -> world cell
    # inverse: projected (gx, gy) -> mm -> world
    def proj_to_world(gx, gy):
        X, Y = gx - RW["x"], gy - RW["y"]
        mx = (X * cga + Y * sga) / K; my = (-X * sga + Y * cga) / K
        return (mx - X0) * K, (Y1 - my) * K
    N = W * H
    gsum = np.zeros(N); gcnt = np.zeros(N); cnt = {k: np.zeros(N, np.int32) for k in (0, 2, 3, 4, 5)}
    zmax = np.full(N, -1e9, np.float32)
    zveg = []
    for f in lazs:
        with laspy.open(f) as rd:
            for ch in rd.chunk_iterator(5_000_000):
                x, z = proj_to_world(np.asarray(ch.x), np.asarray(ch.y))
                m = (x >= 0) & (x < W) & (z >= 0) & (z < H)
                if not m.any():
                    continue
                x, z = x[m], z[m]; zz = np.asarray(ch.z)[m]; cl = np.asarray(ch.classification)[m]
                idx = z.astype(np.int64) * W + x.astype(np.int64)
                cnt[0] += np.bincount(idx, minlength=N).astype(np.int32)
                g = cl == 2
                gsum += np.bincount(idx[g], weights=zz[g], minlength=N); gcnt += np.bincount(idx[g], minlength=N)
                for k in (3, 4, 5):
                    cnt[k] += np.bincount(idx[cl == k], minlength=N).astype(np.int32)
                cnt[2] += np.bincount(idx[g], minlength=N).astype(np.int32)
                vv = (cl >= 3) & (cl <= 5)
                np.maximum.at(zmax, idx[vv], zz[vv].astype(np.float32))
        log("LiDAR", f.name)
    has = gcnt > 0
    if has.mean() > 0.3:
        dtm = np.where(has, gsum / np.maximum(gcnt, 1), np.nan).reshape(H, W)
        holes = np.isnan(dtm)
        _, (ri, ci) = distance_transform_edt(holes, return_indices=True)
        dtm = dtm[ri, ci]
        dtm = gaussian_filter(dtm, 0.6)
        chm = np.maximum(zmax.reshape(H, W) - dtm, 0); chm[zmax.reshape(H, W) < -1e8] = 0
        lid = {"dtm": dtm.astype(np.float32), "chm": chm.astype(np.float32), "holes": holes,
               **{f"n{k}": v.reshape(H, W).astype(np.float32) for k, v in cnt.items()}}
        log(f"LiDAR ground on {100 * has.mean():.0f} % of the cells")
    else:
        log("LiDAR covers too little of the map: not used")

# ---- relief from the map (always computed; the ground when there is no LiDAR) ----------------------------------------------
def densify(pts, step=1.0):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return np.array(out)


def sample(a, x, z):
    return a[np.clip(np.asarray(z).astype(int), 0, a.shape[0] - 1), np.clip(np.asarray(x).astype(int), 0, a.shape[1] - 1)]


def map_relief(E, verbose=False):
    lines = [l for l in lines_c if len(l["pts"]) >= 2]
    FORM = np.array([l["kind"] == "f" for l in lines]); NL = len(lines)
    for l in lines:
        l["d"] = densify(l["pts"])
        p = np.array(l["pts"])
        l["closed"] = len(p) > 3 and math.hypot(*(p[0] - p[-1])) < 0.5
        if l["closed"]:
            A = 0.5 * np.sum(p[:-1, 0] * p[1:, 1] - p[1:, 0] * p[:-1, 1]); l["inside"] = 1 if A > 0 else -1

    def normal_at(l, q):
        d = l["d"]; k = int(np.argmin(np.hypot(d[:, 0] - q[0], d[:, 1] - q[1])))
        a, b = d[max(k - 2, 0)], d[min(k + 2, len(d) - 1)]
        t = b - a; n = math.hypot(*t) or 1.0
        return np.array([-t[1] / n, t[0] / n]), d[k]
    parent = list(range(NL)); par = [1] * NL

    def find(i):
        if parent[i] == i:
            return i, 1
        r, p = find(parent[i]); parent[i] = r; par[i] *= p
        return r, par[i]

    def unite(a, b, rel):
        ra, pa = find(a); rb, pb = find(b)
        if ra == rb:
            return pa * pb == rel
        parent[rb] = ra; par[rb] = pa * pb * rel
        return True
    ends = []
    for i, l in enumerate(lines):
        if not l["closed"] and len(l["d"]) > 3:
            d = l["d"]
            ends.append((i, 0, d[0], d[0] - d[min(3, len(d) - 1)])); ends.append((i, 1, d[-1], d[-1] - d[max(-4, -len(d))]))
    E_ = np.array([e[2] for e in ends]) if ends else np.zeros((0, 2))
    tree = cKDTree(E_) if len(ends) else None
    cands = []
    if tree is not None:
        for a, b in tree.query_pairs(8):
            i, ei, pi, ti = ends[a]; j, ej, pj, tj = ends[b]
            if i == j or FORM[i] != FORM[j]:
                continue
            ti_ = ti / (np.linalg.norm(ti) or 1); tj_ = tj / (np.linalg.norm(tj) or 1)
            if np.dot(ti_, tj_) > -0.5:
                continue
            cands.append((math.hypot(*(pj - pi)), a, b))
    used = set(); joins = 0
    for g, a, b in sorted(cands):
        if a in used or b in used:
            continue
        i, ei, _, _ = ends[a]; j, ej, _, _ = ends[b]
        if unite(i, j, 1 if ei != ej else -1):
            used.update((a, b)); joins += 1
    lab = Image.new("I", (W, H), 0); dl = ImageDraw.Draw(lab)
    for i, l in enumerate(lines):
        dl.line([tuple(p) for p in l["pts"]], fill=i + 1, width=2)
    lab = np.array(lab)
    rel = defaultdict(lambda: defaultdict(float))
    for i, l in enumerate(lines):
        p = l["d"]
        for k in range(2, len(p) - 2, 3):
            t = p[k + 2] - p[k - 2]; n = math.hypot(*t)
            if n < 1e-6:
                continue
            nrm = np.array([-t[1] / n, t[0] / n])
            for sg in (1, -1):
                for s_ in np.arange(2.0, 60, 0.7):
                    q = p[k] + sg * nrm * s_
                    if not (0 <= q[0] < W and 0 <= q[1] < H):
                        break
                    j = lab[int(q[1]), int(q[0])] - 1
                    if j >= 0 and j != i:
                        nj, qj = normal_at(lines[j], q)
                        rel[(i, j)][(sg, 1 if np.dot(p[k] - qj, nj) > 0 else -1)] += 1
                        break
    pairs = []
    for (i, j), votes in rel.items():
        (sg, tau), w = max(votes.items(), key=lambda kv: kv[1])
        if w >= 2:
            pairs.append((i, j, sg, tau, w))
    tick_vote = defaultdict(float)
    tick_elt = {}
    for s in D["syms"]:
        if s.get("elts"):
            far = max((pt for e in s["elts"] for pt in e), key=lambda pt: math.hypot(*pt), default=[0, 1])
            tick_elt[s["sym"]] = math.atan2(far[1], far[0])          # the tick's own direction in the symbol (rad)
    starts = np.array([[l["d"][k] for k in range(0, len(l["d"]), 2)] for l in lines], dtype=object)
    allpts = np.concatenate([l["d"] for l in lines]); owner = np.concatenate([[i] * len(l["d"]) for i, l in enumerate(lines)])
    ptree = cKDTree(allpts)
    for x, z, a, s in ticks:
        ang = math.radians(a) + tick_elt.get(s, math.pi / 2)
        mx, my = math.cos(ang), math.sin(ang)                          # map mm, y up
        v = np.array([mx, -my])                                         # world: z down
        dd, ii = ptree.query([x, z])
        if dd < 1.5 * K / 10 + 1.0:
            i = int(owner[ii]); nrm, _ = normal_at(lines[i], (x, z))
            tick_vote[i] += 1 if np.dot(v, nrm) > 0 else -1
    prior = np.zeros(NL)
    for i, l in enumerate(lines):
        if tick_vote.get(i):
            prior[i] = 10 * np.sign(tick_vote[i])
        elif l["closed"]:
            prior[i] = -3 * l["inside"]
    groups = defaultdict(list)
    for i in range(NL):
        r, p = find(i); groups[r].append((i, p))
    gid = {r: k for k, r in enumerate(groups)}; NG = len(gid)
    gp = np.zeros(NG)
    for r, mem in groups.items():
        gp[gid[r]] = sum(prior[i] * p for i, p in mem)
    edges = defaultdict(float)
    for i, j, sg, tau, w in pairs:
        ri, pi = find(i); rj, pj = find(j)
        if ri != rj:
            edges[(gid[ri], gid[rj])] += -sg * tau * pi * pj * w
    nbr = defaultdict(list)
    for (a, b), s in edges.items():
        nbr[a].append((b, s)); nbr[b].append((a, s))
    med = np.array([float(np.median(sample(coarse, l["d"][:, 0], l["d"][:, 1]))) for l in lines])
    weak = np.zeros(NG)
    for i, j, sg, tau, w in pairs:
        ri, pi = find(i)
        if abs(med[j] - med[i]) > 0.3:
            weak[gid[ri]] += 0.05 * w * (sg if med[j] < med[i] else -sg) * pi
    Dg = np.sign(gp + weak); Dg[Dg == 0] = 1
    for it in range(60):
        ch_ = 0
        for g in range(NG):
            if abs(gp[g]) >= 10:
                continue
            sc = gp[g] + weak[g] + sum(s * Dg[b] for b, s in nbr[g])
            vv = 1 if sc > 0 else -1 if sc < 0 else Dg[g]
            if vv != Dg[g]:
                Dg[g] = vv; ch_ += 1
        if not ch_:
            break
    d = np.array([Dg[gid[find(i)[0]]] * find(i)[1] for i in range(NL)])
    rows, cols, vals, rhs = [], [], [], []; eq = 0
    for i, j, sg, tau, w in pairs:
        step = E * (0.5 if FORM[i] != FORM[j] else 1.0)
        jd = sg == d[i]; idn = tau == d[j]
        diff = -step if (jd and not idn) else step if (not jd and idn) else 0.0
        ww = math.sqrt(w); rows += [eq, eq]; cols += [j, i]; vals += [ww, -ww]; rhs.append(ww * diff); eq += 1
    for i in range(NL):
        r, _ = find(i)
        if r != i:
            rows += [eq, eq]; cols += [i, r]; vals += [3, -3]; rhs.append(0); eq += 1
    for i in range(NL):
        rows.append(eq); cols.append(i); vals.append(0.01); rhs.append(0.01 * med[i]); eq += 1
    lv0 = lsqr(coo_matrix((vals, (rows, cols)), shape=(eq, NL)).tocsr(), np.array(rhs), atol=1e-12, btol=1e-12, iter_lim=50000)[0]
    half = FORM * 0.5; best = None
    for off in np.arange(0, E, 0.05):
        lv = np.round((lv0 - off) / E - half) * E + off + half * E
        c_ = np.abs(lv - lv0).sum()
        if best is None or c_ < best[0]:
            best = (c_, lv)
    levels = best[1]
    # the surface: a membrane through the lines, pulled gently toward the coarse relief (brought to the map's levels)
    S = 2; w2, h2 = (W + S - 1) // S, (H + S - 1) // S
    val = np.zeros((h2, w2)); cn = np.zeros((h2, w2))
    for l, lv in zip(lines, levels):
        p = l["d"]; c_ = np.clip((p[:, 0] / S).astype(int), 0, w2 - 1); r_ = np.clip((p[:, 1] / S).astype(int), 0, h2 - 1)
        np.add.at(val, (r_, c_), lv); np.add.at(cn, (r_, c_), 1)
    fx = cn > 0; val[fx] /= cn[fx]
    c2 = np.array(Image.fromarray(coarse).resize((w2, h2), Image.BILINEAR), np.float64) + np.median(levels - med)
    N2 = w2 * h2; ix = np.arange(N2).reshape(h2, w2); rr, cc_, dv = [], [], []; dg = np.zeros(N2)
    for dr_, dc_ in ((0, 1), (1, 0)):
        a = ix[: h2 - dr_, : w2 - dc_].ravel(); b = ix[dr_:, dc_:].ravel()
        rr += [a, b]; cc_ += [b, a]; dv += [-np.ones(len(a))] * 2; np.add.at(dg, a, 1); np.add.at(dg, b, 1)
    Lp = csr_matrix((np.concatenate(dv), (np.concatenate(rr), np.concatenate(cc_))), shape=(N2, N2)) + diags(dg)
    f = fx.ravel(); fr = ~f; lam = 0.0005
    A2 = (Lp + diags(np.full(N2, lam)))[fr][:, fr]
    b2 = lam * c2.ravel()[fr] - Lp[fr][:, f] @ val.ravel()[f]
    sol, _ = cg(A2, b2, x0=c2.ravel()[fr], rtol=1e-8, maxiter=6000)
    h = c2.ravel().copy(); h[f] = val.ravel()[f]; h[fr] = sol
    h1 = gaussian_filter(np.array(Image.fromarray(h.reshape(h2, w2).astype(np.float32)).resize((W, H), Image.BILINEAR), np.float32), 1.0)
    # tops and bottoms inside the innermost closed lines
    add = np.zeros((H, W), np.float32)
    for i, l in enumerate(lines):
        if not l["closed"]:
            continue
        p = np.array(l["pts"]); c0, r0 = max(int(p[:, 0].min()) - 1, 0), max(int(p[:, 1].min()) - 1, 0)
        c1, r1 = min(int(p[:, 0].max()) + 2, W), min(int(p[:, 1].max()) + 2, H)
        if c1 - c0 < 2 or r1 - r0 < 2:
            continue
        m = Image.new("L", (c1 - c0, r1 - r0), 0); ImageDraw.Draw(m).polygon([(x - c0, z - r0) for x, z in p], fill=1)
        m = np.array(m, bool)
        inner = lab[r0:r1, c0:c1][m] - 1
        if m.sum() < 3 or np.isin(inner, [j for j in np.unique(inner) if j >= 0 and j != i]).any():
            continue
        dist = distance_transform_edt(m); t = dist / max(dist.max(), 1e-6)
        sign = 1 if d[i] == -l["inside"] else -1
        add[r0:r1, c0:c1] += (sign * 0.45 * E * (0.5 if FORM[i] else 1.0) * min(1.0, dist.max() / 6) * (1 - (1 - t) ** 2) * m).astype(np.float32)
    if verbose:
        log(f"map relief E={E}: {NL} lines, {joins} joins, {sum(1 for v in tick_vote.values() if v)} ticked lines, {len(pairs)} pairs")
    return h1 + add, levels, lines, lab


# the contour interval: the one whose relief best matches the coarse relief's large shapes
best = None
for E in (() if LIDAR_ONLY or not lines_c else (2.5, 5.0)):
    h, lv, ln, _ = map_relief(E)
    a = gaussian_filter(h, 40); b = gaussian_filter(coarse, 40)
    m = cls != C["outside"]
    e = float(np.sqrt((((a - b) - (a - b)[m].mean()) ** 2)[m].mean()))
    log(f"interval {E} m: large-scale difference to the coarse relief {e:.2f} m")
    if best is None or e < best[0]:
        best = (e, E)
if best:
    E = best[1]
    hmap, levels, clines, clab = map_relief(E, verbose=True)
else:                                                     # no contour lines to read: the coarse relief (the LiDAR's ground)
    E, hmap, levels, clines = 5.0, coarse.copy(), np.zeros(0), []


def bump(add, x, z, rx, rz, height, ang=0.0, power=2.0):
    r = int(max(rx, rz) * 2.5) + 2
    c0, c1 = max(int(x) - r, 0), min(int(x) + r, W); r0, r1 = max(int(z) - r, 0), min(int(z) + r, H)
    if c0 >= c1 or r0 >= r1:
        return
    XX, ZZ = np.meshgrid(np.arange(c0, c1) + 0.5, np.arange(r0, r1) + 0.5)
    dx = XX - x; dz = ZZ - z; a = math.radians(ang)
    u_ = dx * math.cos(a) - dz * math.sin(a); v_ = dx * math.sin(a) + dz * math.cos(a)
    add[r0:r1, c0:c1] += height * np.exp(-(((u_ / rx) ** 2 + (v_ / rz) ** 2) ** (power / 2)))


small = np.zeros((H, W), np.float32)
for p in points:
    k = p["k"]
    if k == "knoll": bump(small, p["x"], p["z"], 3.5, 3.5, 1.3)
    elif k == "eknoll": bump(small, p["x"], p["z"], 6, 2.8, 1.2, -p["a"])
    elif k == "depression": bump(small, p["x"], p["z"], 3.5, 3.5, -1.2)
    elif k in ("pit", "rockpit"): bump(small, p["x"], p["z"], 1.8, 1.8, -1.3, power=4)
    elif k == "landform": bump(small, p["x"], p["z"], 2, 2, 0.8)
    elif k == "mini": bump(small, p["x"], p["z"], 5, 4, p["h"], -p["a"])
    elif k == "broken":
        for _ in range(4):
            bump(small, p["x"] + rng.uniform(-5, 5), p["z"] + rng.uniform(-5, 5), 1.2, 1.2, rng.uniform(-0.6, 0.6))
for w_ in walls:
    if w_["kind"] == "bank":
        for x, z in densify(w_["pts"], 1.0):
            bump(small, x, z, 1.4, 1.4, 0.3)
hmap = hmap + small
if lid is not None and len(clines):
    m = (~lid["holes"]) & (cls != C["outside"])
    dd = (hmap - lid["dtm"])[m]
    lid_lv = np.array([np.nanmedian(sample(lid["dtm"], l["d"][:, 0], l["d"][:, 1])) for l in clines])
    q = levels - lid_lv; q -= np.median(q)
    log(f"map relief vs LiDAR: {100 * (np.abs(q) < 0.6 * E / 2.5 + 0.05).mean():.0f} % of lines at their level, "
        f"RMS {np.sqrt(((dd - dd.mean()) ** 2).mean()):.2f} m; coarse relief RMS "
        f"{np.sqrt((((coarse - lid['dtm'])[m] - (coarse - lid['dtm'])[m].mean()) ** 2).mean()):.2f} m")
if lid is not None:
    ground = lid["dtm"]
    SOURCE = "lidaronly" if LIDAR_ONLY else "lidar"
else:
    ground = hmap
    SOURCE = "map"
ground = np.where(cls == C["outside"], gaussian_filter(ground, 8), ground).astype(np.float32)
base = float(math.floor(ground.min()))
hh = np.clip(np.round((ground - base) * 100), 0, 65535).astype(np.uint16)
Image.fromarray(np.dstack([(hh >> 8).astype(np.uint8), (hh & 255).astype(np.uint8), np.zeros_like(hh, np.uint8)]), "RGB").save(OUT / "h.png", optimize=True)
Image.fromarray(cls, "L").save(OUT / "cls.png", optimize=True)

# ---- vegetation densities -----------------------------------------------------------------------------------------------------
TREE = {"forest": 1 / 42, "open_t": 1 / 450, "rough_t": 1 / 260, "slow": 1 / 38, "slow_vis": 1 / 42, "walk": 1 / 32,
        "walk_vis": 1 / 38, "fight": 1 / 28, "marsh": 1 / 500, "stony": 1 / 70, "bfield": 1 / 120, "rock": 1 / 400,
        "cultivated": 1 / 900}
BUSH = {"forest": 1 / 400, "rough": 1 / 160, "rough_t": 1 / 140, "slow": 1 / 9, "walk": 1 / 4.5, "fight": 1 / 2.2,
        "marsh": 1 / 90, "stony": 1 / 200, "open_t": 1 / 600}
LOW = {"forest": 1 / 35, "open": 1 / 18, "open_t": 1 / 14, "rough": 1 / 2.6, "rough_t": 1 / 2.8, "slow_vis": 1 / 1.6,
       "walk_vis": 1 / 0.9, "marsh": 1 / 1.8, "marsh_x": 1 / 1.2, "slow": 1 / 6, "walk": 1 / 5, "cultivated": 1 / 25}
if SPRINT:                                                 # a town's lawns are mown; its parks' ground is clear
    LOW.update({"open": 1 / 400, "open_t": 1 / 120, "forest": 1 / 60, "paved": 0})
    BUSH.update({"forest": 1 / 900, "open_t": 1 / 2000})
TREE_K, BUSH_K, LOW_K = 255 / 0.05, 255 / 0.5, 255 / 1.2


def dens(table):
    lut = np.zeros(256, np.float32)
    for k_, v_ in table.items():
        lut[C[k_]] = v_
    return lut[cls]


td, bd, ld = dens(TREE), dens(BUSH), dens(LOW)
trees_out = None
if lid is not None:
    low = lid["n2"] + lid["n3"] + lid["n4"] + 1e-3
    f3 = gaussian_filter(lid["n3"], 1.5) / gaussian_filter(low, 1.5); f4 = gaussian_filter(lid["n4"], 1.5) / gaussian_filter(low, 1.5)
    g4 = np.clip((f4 - 0.08) / 0.35, 0, 1); g3 = np.clip((f3 - 0.15) / 0.5, 0, 1)
    bd = bd * (0.5 + g4) + 0.06 * g4; ld = ld * (0.5 + g3) + 0.15 * g3
    c = gaussian_filter(lid["chm"], 0.8)
    pk = (c == maximum_filter(c, size=5)) & (c > 4) & (cls != C["outside"]) & (~np.isin(cls, [C["water"], C["building"]]))
    r_, c_ = np.nonzero(pk); h_ = c[r_, c_]
    o_ = np.argsort(-h_); r_, c_, h_ = r_[o_], c_[o_], h_[o_]
    kd = cKDTree(np.c_[c_, r_]); keep = np.ones(len(h_), bool)
    for i in range(len(h_)):
        if keep[i]:
            for j in kd.query_ball_point([c_[i], r_[i]], 0.6 + 0.09 * h_[i]):
                if j > i:
                    keep[j] = False
    tx = c_[keep] + rng.uniform(0, 1, keep.sum()); tz = r_[keep] + rng.uniform(0, 1, keep.sum()); th = h_[keep]
    crown = np.clip(0.9 + 0.13 * th, 1.4, 6) * rng.uniform(0.8, 1.2, len(th))
    buf = np.zeros(len(th), dtype=[("x", "<u2"), ("z", "<u2"), ("h", "u1"), ("c", "u1")])
    buf["x"] = np.clip(tx * 10, 0, 65535); buf["z"] = np.clip(tz * 10, 0, 65535)
    buf["h"] = np.clip(th * 4, 0, 255); buf["c"] = np.clip(crown * 10, 0, 255)
    (OUT / "trees.bin").write_bytes(buf.tobytes())
    td = td * 0                                            # the LiDAR's trees, none invented
    trees_out = int(len(th))
    log("LiDAR trees", trees_out)
veg = np.dstack([np.clip(td * TREE_K, 0, 255), np.clip(bd * BUSH_K, 0, 255), np.clip(ld * LOW_K, 0, 255)]).astype(np.uint8)
Image.fromarray(veg, "RGB").save(OUT / "veg.png", optimize=True)

# ---- the ground's colours -----------------------------------------------------------------------------------------------------
BIOME = json.load(open(RD / "biome.json")) if (RD / "biome.json").exists() else {}
COL = {"forest": (98, 82, 58), "open": (176, 168, 96), "open_t": (166, 160, 92), "rough": (150, 136, 92), "rough_t": (142, 128, 88),
       "slow": (86, 84, 54), "slow_vis": (92, 92, 58), "walk": (74, 78, 48), "walk_vis": (80, 86, 52), "fight": (64, 72, 44),
       "paved": (110, 108, 104), "rock": (150, 146, 138), "building": (120, 110, 100), "path": (196, 178, 140),
       "small_path": (170, 150, 112), "road": (90, 90, 92), "stony": (140, 134, 120), "bfield": (148, 144, 134),
       "water": (52, 74, 86), "track": (186, 168, 130), "marsh": (84, 96, 70), "marsh_x": (70, 88, 74), "shallow": (78, 98, 104),
       "cliff": (132, 128, 120), "oob": (110, 100, 80), "cultivated": (150, 156, 90), "stream": (70, 90, 96),
       "rockstep": (140, 136, 128), "outside": (110, 104, 86), "block": (100, 94, 84)}
COL.update({k_: tuple(v_) for k_, v_ in BIOME.get("ground", {}).items()})
lut = np.zeros((256, 3), np.float32)
for k_, v_ in COL.items():
    lut[C[k_]] = v_
rgb = lut[cls]


def noise(shape, scales, seed):
    r = np.random.default_rng(seed); out = np.zeros(shape, np.float32)
    for s_, a_ in scales:
        out += a_ * gaussian_filter(r.standard_normal(shape).astype(np.float32), s_)
    return out / (np.abs(out).max() + 1e-6)


rgb *= (1 + 0.18 * noise((H, W), ((30, 0.5), (8, 0.3), (2, 0.2)), 3))[..., None]
if lid is not None:
    lrm = lid["dtm"] - gaussian_filter(lid["dtm"], 5)
    gy, gx = np.gradient(gaussian_filter(lid["dtm"], 0.5))
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rk = gaussian_filter((((lrm > 0.35) & (slope > 30)) | (slope > 48)).astype(np.float32), 0.7)
    rgb += rk[..., None] * (np.array(COL["rock"]) - rgb)
Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(OUT / "ground.jpg", quality=88)

# ---- features --------------------------------------------------------------------------------------------------------------
ROCK = {"boulder": (1.0, 0.25), "bigboulder": (2.4, 0.4), "cluster": (0.9, 0.2), "bfield": (0.7, 0.2), "stony": (0.35, 0.08),
        "rockpit": (0.8, 0.5), "rockface": (2.0, 0.3), "cairn": (0.9, 0.1)}
rocks = []
for p in points:
    k = p["k"]
    if k not in ROCK:
        continue
    size, sink = ROCK[k]
    if k == "boulder" and p["sub"] == 1:
        size = 1.4
    n_ = {"cluster": 4, "bfield": 6, "stony": 6, "rockface": 1}.get(k, 1)
    spread = {"cluster": 2.5, "bfield": 3.5, "stony": 2.2}.get(k, 0)
    for _ in range(n_):
        s_ = size * rng.uniform(0.75, 1.25)
        rocks.append([round(p["x"] + rng.uniform(-spread, spread), 2), round(p["z"] + rng.uniform(-spread, spread), 2), round(s_, 2),
                      round(s_ * rng.uniform(0.55, 0.85) * (1.4 if k == "rockface" else 1), 2), round(rng.uniform(0, 6.28), 2), sink,
                      1 if k in ("bigboulder", "rockface") or (k == "boulder" and s_ > 1.1) else 0])
other = [{"k": p["k"], "x": round(p["x"], 2), "z": round(p["z"], 2), "a": p["a"]} for p in points
         if p["k"] in ("bigtree", "vegspec", "tower", "manmade", "smallbuilding", "waterhole", "footbridge", "cave", "orchard")
         and not (SPRINT and lid is not None and p["k"] in ("bigtree", "vegspec"))]      # a town's trees: the LiDAR's
json.dump({"rocks": rocks, "walls": walls, "points": other,
           "features": [{"k": p["k"], "x": round(p["x"], 1), "z": round(p["z"], 1)} for p in points
                        if p["k"] in ("boulder", "bigboulder", "cluster", "knoll", "eknoll", "depression", "pit", "rockpit", "rockface",
                                      "cairn", "mini", "vegspec", "bigtree", "manmade", "tower", "waterhole", "cave", "landform",
                                      "fountain", "bush", "monument")]},
          open(OUT / "feats.json", "w"))
for old in ("map.ocd", "map.webp"):
    (OUT / old).unlink(missing_ok=True)
MAPFILE = "map.webp" if LIDAR_ONLY else "map.ocd"
shutil.copy(RD / MAPFILE, OUT / MAPFILE)

# the map's frame for the game: world = (mm - [X0, Y1]) * K, z down; the map drawn from its own mm
race = json.load(open(OUT / "race.json")) if (OUT / "race.json").exists() else {}
race.update({"id": RACE, "scale": SCALE, "std": STD, "W": W, "H": H, "res": 1, "base": base, "mm0": [X0, Y1], "k": K,
             "interval": E, "source": SOURCE, "lidarTrees": trees_out, "classes": CL, "speed": [SPEED[n] for n in CL],
             "vegK": [TREE_K, BUSH_K, LOW_K], "biome": BIOME,
             "lonlat": list(TO_LL.transform(*world_to_proj(W / 2, H / 2))),
             # the player's map: the club's OCAD file, or the generated map's image over the world (0.5 m a pixel)
             "map": "webp" if LIDAR_ONLY else "ocd", **({"mapPx": 0.5, "credits": D.get("sources", {})} if LIDAR_ONLY else {})})
json.dump(race, open(OUT / "race.json", "w"), indent=1)
log("done:", {f.name: f"{f.stat().st_size / 1e6:.1f} MB" for f in OUT.iterdir()})
