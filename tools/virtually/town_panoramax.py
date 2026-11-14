"""The façades' colours of a town race of « Virtually » read from Panoramax's street-level photos (after town_map.py, before
town_3d.py):   py town_panoramax.py <race>      → DATA/<race>/src/facades.json

Panoramax (panoramax.fr, here the OpenStreetMap France instance) publishes its photos under CC BY-SA 4.0 and allows the data
derived from them under Licence Ouverte 2.0, CC BY 4.0 or ODbL: Ozimut keeps **data only** — each building's façade colour,
its walls' texture (a stone or brick hint) — never a photo or a crop; the photos stay in DATA/<race>/src/panoramax/ (outside
git, never uploaded) and their authors are credited with the race (facades.json `authors`).

For each photo (a 360° panorama, or a flat photo of known field of view): its position and heading from Panoramax, its height
1.6 m above the LiDAR's ground; the position (± 4 m), the heading (± 25°) and the pitch corrected by matching the photo's skyline (the top
of what is not sky, column by column) to the one the LiDAR's roof points draw from there — a building predicted where the photo
shows sky costs most, something above a predicted roof (often a tree) a quarter; a photo still showing sky where buildings stand
is left out. Then each wall a photo sees — 3-35 m away,
facing it under 70°, nothing between in 2D — is sampled on a grid (its middle 60 %, from 2.3 m above the ground — above the
gardens' gates, hedges and cars — to under the eaves, 8 m at most), the samples in sky, deep shade (windows) or greenery (a tree in front) dropped, and each building's colour
is the median of its walls' medians over every photo. Polite: our user agent, one download a second, files kept."""
import json, math, os, sys, time
from pathlib import Path

import numpy as np
import requests
from PIL import Image
import shapely
from shapely.geometry import shape, LineString, Point

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
RACE = sys.argv[1]
RD = DATA / RACE; SRC = RD / "src"; PX = SRC / "panoramax"; PX.mkdir(parents=True, exist_ok=True)
A = json.load(open(RD / "area.json")); X0, Y0, X1, Y1 = A["ext"]
UA = {"User-Agent": "Ozimut Virtually builder (https://ozimut.com; contact@ozimut.com)"}
API = "https://api.panoramax.xyz/api/search"
T0 = time.time()
log = lambda *a: print(f"[{time.time() - T0:5.0f}s]", *a, flush=True)
from l93 import transformer
TO = transformer(4326, 2154); FROM = transformer(2154, 4326)

# ---- the photos --------------------------------------------------------------------------------------------------------------
lst = PX / "list.json"
if not lst.exists():
    lon0, lat0 = FROM.transform(X0, Y0); lon1, lat1 = FROM.transform(X1, Y1)
    r = requests.get(API, params={"bbox": f"{lon0},{lat0},{lon1},{lat1}", "limit": 10000}, headers=UA, timeout=120)
    r.raise_for_status(); lst.write_bytes(r.content)
feats = json.load(open(lst))["features"]
photos = []
for f in feats:
    p = f["properties"]; io = p.get("pers:interior_orientation") or {}
    fov = io.get("field_of_view")
    if not fov or p.get("view:azimuth") is None or p.get("geovisio:status") != "ready":
        continue
    x, y = TO.transform(*f["geometry"]["coordinates"])
    if not (X0 < x < X1 and Y0 < y < Y1) or (p.get("quality:horizontal_accuracy") or 5) > 8:
        continue
    photos.append({"id": f["id"], "x": x, "y": y, "az": float(p["view:azimuth"]), "fov": float(fov), "sd": f["assets"]["sd"]["href"],
                   "author": p.get("geovisio:producer") or "", "date": p.get("datetime", "")[:10], "licence": p.get("license", "")})
log("photos", len(photos), "of", len(feats))
for k, ph in enumerate(photos):
    dest = PX / f"{ph['id']}.jpg"
    if (dest.exists() and dest.stat().st_size) or os.environ.get("PX_NODL"):      # PX_NODL=1: read only the photos already here
        continue
    time.sleep(1.0)
    try:
        r = requests.get(ph["sd"], headers=UA, timeout=60); r.raise_for_status(); dest.write_bytes(r.content)
    except requests.RequestException as e:
        log("  skipped", ph["id"], e)
    if k % 50 == 0:
        log("downloaded", k, "/", len(photos))
if os.environ.get("PX_DLONLY"):                                            # PX_DLONLY=1: the downloads only
    sys.exit(0)

# ---- the scene: the ground, the buildings with their roofs' heights -------------------------------------------------------------
Z = np.load(SRC / "lidar_grids.npz"); dtm = Z["dtm"]; R = 0.5
def ground(x, y):
    j = np.clip(((np.asarray(x) - X0) / R).astype(int), 0, dtm.shape[1] - 1); i = np.clip(((Y1 - np.asarray(y)) / R).astype(int), 0, dtm.shape[0] - 1)
    return dtm[i, j]
roof = np.load(SRC / "roofpts.npy")
from scipy.spatial import cKDTree
rt = cKDTree(roof[:, :2])
bld = []
for f in json.load(open(SRC / "bdtopo_batiment.json"))["features"]:
    g = shapely.force_2d(shape(f["geometry"])).buffer(0)
    if g.is_empty or g.area < 8:
        continue
    for poly in getattr(g, "geoms", [g]):
        if poly.geom_type != "Polygon" or poly.area < 8:
            continue
        c = poly.centroid
        ids = rt.query_ball_point([c.x - X0, c.y - Y0], math.sqrt(poly.area) + 5)
        P = roof[ids] if ids else np.zeros((0, 3))
        if len(P):
            P = P[shapely.contains_xy(poly, P[:, 0] + X0, P[:, 1] + Y0)]
        gz = float(np.median(ground(*np.array(poly.exterior.coords).T)))
        top = float(np.percentile(P[:, 2], 85)) if len(P) > 10 else gz + float(f["properties"].get("hauteur") or 6)
        eave = float(np.percentile(P[:, 2], 15)) if len(P) > 10 else top
        bld.append({"key": f["properties"].get("cleabs") or f["id"], "poly": poly, "g": gz, "top": top, "eave": eave})
polys = [b["poly"] for b in bld]
tree = shapely.STRtree(polys)
log("buildings", len(bld))

# the walls, each side of an outline 3 m long or more, its outward normal
walls = []
for bi, b in enumerate(bld):
    for ring in [b["poly"].exterior]:
        c = np.array(ring.coords); ccw = ring.is_ccw
        for a, e in zip(c[:-1], c[1:]):
            d = e - a; L = math.hypot(*d)
            if L < 3:
                continue
            n = np.array([d[1], -d[0]]) / L if ccw else np.array([-d[1], d[0]]) / L       # outward
            walls.append((bi, a, e, L, n))
wa = np.array([w[1] for w in walls]); we = np.array([w[2] for w in walls]); wm = (wa + we) / 2
wtree = cKDTree(wm)
log("walls", len(walls))


def project(ph, az, el, yaw, pitch, w, h):
    """Azimuth / elevation (degrees) → pixel (u, v), or None outside the image."""
    da = (az - yaw + 540) % 360 - 180
    if ph["fov"] >= 359:
        u = (da / 360 + 0.5) * w; v = (0.5 - (el - pitch) / 180) * h
        return u, v
    f = (w / 2) / math.tan(math.radians(ph["fov"] / 2))
    if abs(da) > ph["fov"] / 2 + 2:
        return None
    x = math.tan(math.radians(da)) * f
    y = math.tan(math.radians(el - pitch)) * f / math.cos(math.radians(da))
    u, v = w / 2 + x, h / 2 - y
    return (u, v) if 0 <= u < w and 0 <= v < h else None


def sky_mask(img):
    a = img.astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(axis=2), a.min(axis=2); sat = (mx - mn) / (mx + 1)
    return ((mx > 160) & (b >= r - 8) & (sat < 0.45)) | (mx > 235)


def observed_skyline(img, cols):
    """Per column: the first row from the top below which 4 pixels in a row are not sky."""
    sk = sky_mask(img); h = sk.shape[0]
    out = np.full(len(cols), -1.0)
    for k, c in enumerate(cols):
        col = sk[: int(h * 0.75), c]
        run = 0
        for v in range(len(col)):
            run = run + 1 if not col[v] else 0
            if run >= 4:
                out[k] = v - 3; break
    return out


def predicted_skyline(ph, cam_z, azs):
    """The buildings' skyline (degrees above the horizon) seen from the camera at each azimuth: the LiDAR's roof points
    themselves (a ridge set back from the wall stays lower than its height would be on the wall)."""
    best = np.full(len(azs), -90.0)
    ids = rt.query_ball_point([ph["x"] - X0, ph["y"] - Y0], 70)
    if not ids:
        return best
    Q = roof[ids]
    dx, dy = Q[:, 0] + X0 - ph["x"], Q[:, 1] + Y0 - ph["y"]; d = np.hypot(dx, dy)
    ok = d > 2.0
    az = (np.degrees(np.arctan2(dx[ok], dy[ok])) + 360) % 360
    el = np.degrees(np.arctan2(Q[ok, 2] - cam_z, d[ok]))
    idx = ((az - azs[0]) % 360 / (azs[1] - azs[0])).astype(int)
    good = idx < len(azs)
    np.maximum.at(best, idx[good], el[good])
    return best


samples = {}                               # building index → list of (rgb, wall id, photo id)
poses = []                                 # the photos used, with their corrected pose
authors = {}
used = 0
for k, ph in enumerate(photos):
    f = PX / f"{ph['id']}.jpg"
    if not f.exists():
        continue
    try:
        img = np.asarray(Image.open(f).convert("RGB"))
    except Exception:
        continue
    h, w = img.shape[:2]
    cam_z = float(ground(ph["x"], ph["y"])) + 1.6
    # the heading and pitch by the skyline
    span = 360 if ph["fov"] >= 359 else ph["fov"]
    azs = np.arange(ph["az"] - span / 2, ph["az"] + span / 2, 1.0) % 360 if span < 359 else np.arange(0, 360, 1.0)
    # the pose: the position (± 4 m: Panoramax gives ± 5), the heading (± 25°) and the pitch (± 8°) whose predicted skyline best
    # meets the photo's
    cols = np.linspace(0, w - 1, min(w, 360)).astype(int)
    obs_v = observed_skyline(img, cols)
    ok = obs_v >= 0
    cc, vv = cols[ok].astype(float), obs_v[ok]
    if ph["fov"] >= 359:
        base_az = (cc / w - 0.5) * 360; base_el = (0.5 - vv / h) * 180
    else:
        fpx = (w / 2) / math.tan(math.radians(ph["fov"] / 2))
        da = np.degrees(np.arctan((cc - w / 2) / fpx)); base_az = da
        base_el = np.degrees(np.arctan((h / 2 - vv) * np.cos(np.radians(da)) / fpx))
    best = (0, 0, 1e9, -1, 0.0, 0.0, 1e9)
    PITCHES = np.arange(-4, 4.1, 1.0) if ph["fov"] >= 359 else np.arange(-8, 8.1, 2.0)
    for ox in (-4, -2, 0, 2, 4):
        for oy in (-4, -2, 0, 2, 4):
            q = {"x": ph["x"] + ox, "y": ph["y"] + oy}
            pred = predicted_skyline(q, float(ground(q["x"], q["y"])) + 1.6, np.arange(0, 361, 1.0))
            if (pred > 3).sum() < 20:
                continue
            for dyaw in range(-25, 26):
                pe = pred[((ph["az"] + dyaw + base_az) % 360).astype(int) % 360]
                m = pe > 3
                if m.sum() < 15:
                    continue
                # the cost of a pose: a building predicted where the photo shows sky is wrong (full weight); something seen above a
                # predicted roof is often a tree (a quarter)
                d_ = base_el[m][None, :] + PITCHES[:, None] - pe[m][None, :]
                cost = np.maximum(-d_, 0).mean(axis=1) + 0.25 * np.maximum(d_, 0).mean(axis=1)
                kb = int(np.argmin(cost))
                # a small penalty on the distance moved: of two equal fits, the one nearer Panoramax's own pose
                c_ = float(cost[kb]) + 0.05 * (abs(ox) + abs(oy)) + 0.01 * abs(dyaw)
                if c_ < best[2]:
                    best = (dyaw, float(PITCHES[kb]), c_, int(m.sum()), ox, oy, float(np.maximum(-d_[kb], 0).mean()))
    # a photo whose skyline does not match the buildings' (trees in the frame, a pose too far off) is not used: a colour read on
    # the wrong wall is worse than none
    if best[3] < 30 or best[6] > (1.2 if ph["fov"] >= 359 else 0.8):     # still buildings where the photo shows sky: not used
        continue
    ph = {**ph, "x": ph["x"] + best[4], "y": ph["y"] + best[5]}
    cam_z = float(ground(ph["x"], ph["y"])) + 1.6
    yaw, pitch = ph["az"] + best[0], best[1]
    # the pose kept for the façades' textures (town_facadetex.py)
    poses.append({"id": ph["id"], "x": ph["x"], "y": ph["y"], "cam_z": cam_z, "yaw": yaw, "pitch": pitch, "fov": ph["fov"],
                  "w": w, "h": h, "author": ph["author"], "licence": ph["licence"], "date": ph["date"], "fit": round(best[6], 3)})
    # the walls it sees
    took = 0
    for wi in wtree.query_ball_point([ph["x"], ph["y"]], 35):
        bi, a, e, L, n = walls[wi]; m = (a + e) / 2
        v = np.array([ph["x"], ph["y"]]) - m; d = float(np.hypot(*v))
        if d < 3 or float(np.dot(v / d, n)) < math.cos(math.radians(70)):
            continue
        b = bld[bi]
        top = min(b["eave"] - b["g"] - 0.5, 8.0)
        if top < 3.0:
            continue
        cells = []
        for t in np.linspace(0.2, 0.8, 6):
            p = a + (e - a) * t + n * 0.05
            sight = LineString([(ph["x"], ph["y"]), (p[0], p[1])])
            if any(j != bi and polys[j].intersects(sight) for j in tree.query(sight)):
                continue
            dd = math.hypot(p[0] - ph["x"], p[1] - ph["y"])
            az = (math.degrees(math.atan2(p[0] - ph["x"], p[1] - ph["y"])) + 360) % 360
            for z in np.linspace(2.3, top, 4):                       # above the gates, hedges and cars of the front gardens
                el = math.degrees(math.atan2(b["g"] + z - cam_z, dd))
                uv = project(ph, az, el, yaw, pitch, w, h)
                if uv is None:
                    continue
                u, vv = int(uv[0]) % w, int(uv[1])
                if not (1 <= vv < h - 1):
                    continue
                px = img[vv - 1:vv + 2, max(0, u - 1):u + 2].reshape(-1, 3).astype(np.float32).mean(axis=0)
                mx = px.max(); r_, g_, b_ = px
                if mx < 40 or (mx > 160 and b_ >= r_ - 8 and (mx - px.min()) / (mx + 1) < 0.45 and vv < h * 0.45):
                    continue                                        # deep shade (a window) or sky
                if g_ > r_ + 12 and g_ > b_ + 8:
                    continue                                        # a tree in front
                cells.append(px)
        if len(cells) >= 6:
            samples.setdefault(bi, []).append((np.median(np.array(cells), axis=0), wi, ph["id"], float(np.std(np.array(cells).mean(axis=1)))))
            took += 1
    if took:
        used += 1; authors[ph["author"]] = authors.get(ph["author"], 0) + 1
    if k % 50 == 0:
        log("photo", k, "/", len(photos), "moved", best[4], best[5], "heading", best[0], "pitch", best[1], f"cost {best[2]:.2f} sky-miss {best[6]:.2f}", "walls", took)

out = {}
for bi, ss in samples.items():
    cols = np.array([s[0] for s in ss]); tex = np.array([s[3] for s in ss])
    rgb = np.median(cols, axis=0)
    # a hint of the material: brick is red and saturated, meulière brown-orange and rough; else plaster
    r_, g_, b_ = rgb; sat = (rgb.max() - rgb.min()) / (rgb.max() + 1)
    mat = "brick" if (r_ > g_ * 1.25 and r_ > b_ * 1.35 and sat > 0.28) else "meuliere" if (r_ > b_ * 1.2 and float(np.median(tex)) > 22 and sat > 0.18) else None
    out[bld[bi]["key"]] = {"rgb": [int(v) for v in rgb], "n": len(ss), "photos": len({s[2] for s in ss}), "mat": mat}
json.dump({"source": "Panoramax (panoramax.openstreetmap.fr), CC BY-SA 4.0 photos; data derived under Licence Ouverte 2.0",
           "authors": sorted(authors, key=lambda a: -authors[a]), "photos": used, "buildings": out}, open(SRC / "facades.json", "w"), indent=1)
json.dump(poses, open(SRC / "poses.json", "w"), indent=0)
log("buildings coloured", len(out), "of", len(bld), "from", used, "photos; authors", authors)
