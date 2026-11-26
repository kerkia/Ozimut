"""Set the courses of a « Virtually » map (build.py first): py course.py <race> [seed] [seconds a course]
Six courses a map, at FFCO's colour levels (owner, 2026-11-11): Bleu, Jaune, Orange court, Orange long, Violet court and
Violet long (« MD » / « LD » dropped from the names, owner 2026-11-12), written as `courses` into pkg/race.json, with a review picture for each (course_review_<id>.png beside pkg/).

The levels follow FFCO's and the IOF's course-setting habits, measured on the package's own ground classes:
- Bleu and Jaune keep near the handrails (paths, tracks, roads, streams): the control sites within 15 m (Bleu) or 40 m (Jaune)
  of one, path junctions among them, the legs short and their straight line never far from a handrail;
- Orange: any distinct point feature, legs of a medium (MD) or long (LD) distance;
- Violet court (MD): many short legs on detailed ground, the sites away from the paths rewarded;
- Violet long (LD): long legs, the ones whose straight line crosses slow or impassable ground (a route choice) rewarded.
Everywhere: no dog-legs, no legs crossing or running close, controls 60 m apart at least, nothing in impassable or very slow
ground, the finish near the start. The last control is easy whatever the level (owner, 2026-11-26: « there is always a last
control very close to the arrival, easy to find for all categories, usually on a trail, and a balisage from it to the arrival »):
a path junction, else a site within 5 m of a path; the finish LAST_FIN m from it, the straight way between them runnable (the game
tapes it and the map draws it as a marked route). One last control (code LAST_CODE) and one finish for all the map's courses (owner,
the same day: « that last control, hence last leg, is always the same for all courses »), near the map's middle; every course's start
within LAST_FROM_START m of that finish. games/vcourse.js has the same rule. A course's length is its straight legs', its climb the ground's rises along them."""
import json, math, os, sys, time
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

race_id = sys.argv[1]
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 7
BUDGET = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
P = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual") / race_id / "pkg"
R = json.load(open(P / "race.json")); F = json.load(open(P / "feats.json"))
cls = np.array(Image.open(P / "cls.png")); H, W = cls.shape
hp = np.array(Image.open(P / "h.png").convert("RGB")).astype(np.float32)
height = R["base"] + (hp[..., 0] * 256 + hp[..., 1]) / 100.0
CL = R["classes"]; C = {n: i for i, n in enumerate(CL)}
speed = np.array(R["speed"], np.float32)[cls]
bad = speed < 0.35
near_bad = distance_transform_edt(~bad) < 8
inside = distance_transform_edt(cls != C["outside"])
pathy = np.isin(cls, [C[k] for k in ("path", "track", "road", "small_path")])
hand = pathy | (cls == C["stream"])
d_hand = distance_transform_edt(~hand)                      # metres to the nearest handrail (the grid is 1 m)

# ---- the levels ----------------------------------------------------------------------------------------------------------
# n controls, target km, leg lengths (m), the sites' and the legs' distance to a handrail (m; None: any), what is rewarded
LEVELS = [
    {"id": "blue", "n": 8, "km": 2.2, "leg": (120, 360), "site": 15, "line": (35, 90), "reward": "easy"},
    {"id": "yellow", "n": 10, "km": 3.0, "leg": (150, 420), "site": 40, "line": (80, 160), "reward": "easy"},
    {"id": "orange_md", "n": 12, "km": 3.4, "leg": (140, 420), "site": None, "line": None, "reward": "features"},
    {"id": "orange_ld", "n": 10, "km": 5.0, "leg": (280, 800), "site": None, "line": None, "reward": "choice"},
    {"id": "violet_md", "n": 15, "km": 4.0, "leg": (140, 450), "site": None, "line": None, "reward": "hard"},
    {"id": "violet_ld", "n": 13, "km": 7.0, "leg": (300, 1150), "site": None, "line": None, "reward": "choice"},
]

LAST_FROM_START, LAST_FIN, LAST_CODE = 350, (60, 150), 100            # games/vcourse.js LAST

# ---- the control sites ---------------------------------------------------------------------------------------------------
GOOD = {"boulder": 1.0, "bigboulder": 1.3, "cluster": 1.0, "knoll": 1.2, "eknoll": 1.1, "depression": 1.2, "pit": 1.0,
        "rockpit": 1.0, "rockface": 1.2, "cairn": 0.9, "mini": 1.0, "vegspec": 0.8, "bigtree": 0.9, "manmade": 0.9, "tower": 0.8,
        "waterhole": 1.0, "cave": 1.0, "landform": 0.8, "junction": 1.0}
ok_ground = lambda x, z: (60 < x < W - 60 and 60 < z < H - 60 and not near_bad[int(z), int(x)] and speed[int(z), int(x)] >= 0.6
                          and cls[int(z), int(x)] != C["outside"])
# a rock face's control stands at its foot, beside the rock it describes: the 8 m kept from slow or impassable ground does not
# apply to it (lidarrace.py's cliff sites, 2026-11-14), only the ground it stands on
ok_foot = lambda x, z: (60 < x < W - 60 and 60 < z < H - 60 and speed[int(z), int(x)] >= 0.6 and cls[int(z), int(x)] != C["outside"])
sites = [(f["x"], f["z"], f["k"]) for f in F["features"] if (ok_foot if f["k"] == "rockface" else ok_ground)(f["x"], f["z"])]


def junctions():
    """Path junctions: path cells (every 6 m) where a ring of 8 m around them meets the paths three times or more."""
    zs, xs = np.nonzero(pathy[::6, ::6]); xs = xs * 6.0; zs = zs * 6.0
    keep = (xs > 60) & (xs < W - 60) & (zs > 60) & (zs < H - 60)
    xs, zs = xs[keep], zs[keep]
    a = np.linspace(0, 2 * np.pi, 48, endpoint=False)
    rx = (xs[:, None] + 8 * np.cos(a)[None]).astype(int).clip(0, W - 1); rz = (zs[:, None] + 8 * np.sin(a)[None]).astype(int).clip(0, H - 1)
    ring = pathy[rz, rx]
    arms = (ring & ~np.roll(ring, 1, axis=1)).sum(1)
    out = [(float(x), float(z), "junction") for x, z, n in zip(xs, zs, arms) if n >= 3 and ok_ground(x, z)]
    # one per junction: drop those within 15 m of one kept
    kept = []
    for p in out:
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > 15 for q in kept):
            kept.append(p)
    return kept


sites += junctions()
# distinct sites only: a feature with another of its kind within 12 m is ambiguous
xy = np.array([[s[0], s[1]] for s in sites]); kd = cKDTree(xy)
sites = [s for i, s in enumerate(sites) if sum(1 for j in kd.query_ball_point(xy[i], 12) if j != i and sites[j][2] == s[2]) == 0]
XY = np.array([[s[0], s[1]] for s in sites]); KIND = [s[2] for s in sites]
SITE_HAND = d_hand[XY[:, 1].astype(int), XY[:, 0].astype(int)]
print(race_id, "candidate sites", len(sites), "junctions", sum(1 for k in KIND if k == "junction"), flush=True)
pr, pc = np.nonzero(pathy & ~near_bad & (inside > 200))


def pick_end():
    """The map's last control and finish, shared by all its courses: a path junction (else a site within 5 m of a path) near the
    map's middle, the finish LAST_FIN m from it on a runnable straight way."""
    r = np.random.default_rng(SEED * 100 + 99)
    dc = np.hypot(XY[:, 0] - W / 2, XY[:, 1] - H / 2) * r.uniform(0.75, 1.25, len(XY))
    kinds_ = np.array(KIND)
    order = [i for i in np.argsort(dc) if kinds_[i] == "junction"] + [i for i in np.argsort(dc) if kinds_[i] != "junction" and SITE_HAND[i] <= 5]
    for i in order[:200]:
        lc = (float(XY[i, 0]), float(XY[i, 1]))
        for _ in range(60):
            a = r.uniform(0, 2 * math.pi); rr = r.uniform(*LAST_FIN)
            q = (lc[0] + rr * math.cos(a), lc[1] + rr * math.sin(a))
            if not (60 < q[0] < W - 60 and 60 < q[1] < H - 60) or speed[int(q[1]), int(q[0])] < 0.6:
                continue
            imp, slow, _, _ = line_stats(lc, q)
            if imp == 0 and slow <= 0.15:
                return int(i), lc, q
    return None


def seg_cross(a, b, c, d):
    def o(p, q, r):
        return np.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
    return o(a, b, c) != o(a, b, d) and o(c, d, a) != o(c, d, b)


def seg_dist(a, b, c, d):
    """Least distance between segments ab and cd."""
    def pd(p, q, r):
        qx, qy = r[0] - q[0], r[1] - q[1]; L = qx * qx + qy * qy
        t = 0 if L == 0 else max(0, min(1, ((p[0] - q[0]) * qx + (p[1] - q[1]) * qy) / L))
        return math.hypot(p[0] - q[0] - t * qx, p[1] - q[1] - t * qy)
    if seg_cross(a, b, c, d):
        return 0.0
    return min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b))


def along(a, b):
    n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
    return np.linspace(a[0], b[0], n).astype(int).clip(0, W - 1), np.linspace(a[1], b[1], n).astype(int).clip(0, H - 1)


def line_stats(a, b):
    """The straight line's share on impassable ground and on slow ground, its mean and largest distance to a handrail."""
    xs, zs = along(a, b)
    s = speed[zs, xs]; d = d_hand[zs, xs]
    return float((s < 0.05).mean()), float((s < 0.6).mean()), float(d.mean()), float(d.max())


def climb(a, b):
    xs, zs = along(a, b)
    h = height[zs, xs][::5]
    dh = np.diff(h)
    return float(dh[dh > 0].sum())


END = pick_end()
if END is None:
    sys.exit("no last control and finish found")
END_I, END_LC, END_FIN = END
_ds = np.hypot(pc - END_FIN[0], pr - END_FIN[1]); _dl = np.hypot(pc - END_LC[0], pr - END_LC[1])
pr, pc = pr[(_ds >= 40) & (_ds <= LAST_FROM_START) & (_dl >= 60)], pc[(_ds >= 40) & (_ds <= LAST_FROM_START) & (_dl >= 60)]
print("last control", KIND[END_I], [round(v) for v in END_LC], "finish", [round(v) for v in END_FIN],
      f"{math.hypot(END_FIN[0] - END_LC[0], END_FIN[1] - END_LC[1]):.0f} m", len(pr), "start cells", flush=True)


def make(L, rng):
    lo, hi = L["leg"]
    if not len(pr):
        return None
    i0 = rng.integers(len(pr)); pts = [(float(pc[i0]), float(pr[i0]))]
    used = {END_I}; kinds = []; score = 0.0; legs = []
    for c_ in range(L["n"] - 1):
        last = pts[-1]
        d = np.hypot(XY[:, 0] - last[0], XY[:, 1] - last[1])
        ok = (d > lo) & (d < hi)
        if c_ == L["n"] - 2:                                          # within a leg of the shared last control
            e = np.hypot(XY[:, 0] - END_LC[0], XY[:, 1] - END_LC[1])
            ok &= (e >= max(60, lo * 0.4)) & (e <= hi)
        if L["site"] is not None:
            ok &= SITE_HAND <= L["site"]
        ok = np.nonzero(ok)[0]; rng.shuffle(ok)
        chosen = None
        for i in ok[:150]:
            if i in used:
                continue
            p = (XY[i, 0], XY[i, 1])
            if any(math.hypot(p[0] - q[0], p[1] - q[1]) < 60 for q in pts[1:]) or math.hypot(p[0] - END_LC[0], p[1] - END_LC[1]) < 60 \
                    or math.hypot(p[0] - END_FIN[0], p[1] - END_FIN[1]) < 40 or seg_dist(last, p, END_LC, END_FIN) < 30:
                continue
            if len(pts) >= 2:
                a1 = math.atan2(last[1] - pts[-2][1], last[0] - pts[-2][0]); a2 = math.atan2(p[1] - last[1], p[0] - last[0])
                if abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi) > math.radians(150):
                    continue                                          # a dog-leg
            if any(seg_dist(last, p, pts[j], pts[j + 1]) < 40 for j in range(len(pts) - 2)):
                continue
            imp, slow, mean_h, max_h = line_stats(last, p)
            if imp > 0.25:
                continue
            if L["line"] and (mean_h > L["line"][0] or max_h > L["line"][1]):
                continue
            chosen = (i, p, imp, slow, mean_h); break
        if chosen is None:
            return None
        i, p, imp, slow, mean_h = chosen
        used.add(i); pts.append(p); kinds.append(KIND[i]); legs.append(math.hypot(p[0] - last[0], p[1] - last[1]))
        rw = L["reward"]
        if rw == "easy":
            score += 1.0 - mean_h / 100 + (0.5 if KIND[i] == "junction" else 0)
        elif rw == "features":
            score += GOOD.get(KIND[i], 0.7) + 0.4 * min(slow, 0.5)
        elif rw == "hard":
            score += GOOD.get(KIND[i], 0.7) + 0.3 * min(SITE_HAND[i], 120) / 120 - (0.6 if KIND[i] == "junction" else 0)
        else:                                                         # choice: long legs across slow or blocked ground
            score += GOOD.get(KIND[i], 0.7) + 1.2 * min(slow, 0.5) + 1.5 * min(imp, 0.2) + 0.6 * (legs[-1] > 0.6 * hi)
    # the last control: the map's own (END), reached by a usual leg; the finish: the map's own
    prev = pts[-1]; p = END_LC; dl = math.hypot(p[0] - prev[0], p[1] - prev[1])
    if dl < max(60, lo * 0.4) or dl > hi:
        return None
    if len(pts) >= 2:
        a1 = math.atan2(prev[1] - pts[-2][1], prev[0] - pts[-2][0]); a2 = math.atan2(p[1] - prev[1], p[0] - prev[0])
        if abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi) > math.radians(150):
            return None
    if any(seg_dist(prev, p, pts[j], pts[j + 1]) < 40 for j in range(len(pts) - 2)) or line_stats(prev, p)[0] > 0.25:
        return None
    pts.append(p); kinds.append(KIND[END_I]); legs.append(dl)
    fin = END_FIN
    if fin is None:
        return None
    allp = pts + [fin]
    length = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(allp, allp[1:]))
    span = (max(p[0] for p in allp) - min(p[0] for p in allp)) * (max(p[1] for p in allp) - min(p[1] for p in allp))
    score = score / L["n"] * 4 + 2.0 * len(set(kinds)) / len(kinds) - 8 * abs(length / 1000 - L["km"]) / L["km"] + 2 * span / (W * H)
    return score, allp, kinds, length


PAL = np.array([[235, 240, 228], [255, 222, 130], [250, 215, 130], [245, 205, 150], [235, 200, 145], [180, 225, 160], [195, 235, 175],
                [110, 195, 110], [150, 215, 140], [50, 150, 70], [160, 160, 160], [130, 130, 130], [40, 40, 40], [230, 150, 90],
                [80, 80, 80], [190, 190, 180], [150, 150, 140], [90, 160, 230], [210, 150, 90], [130, 190, 210], [70, 140, 200],
                [120, 180, 220], [20, 20, 20], [200, 40, 120], [230, 230, 120], [80, 150, 230], [60, 60, 60], [250, 250, 250],
                [10, 10, 10], [220, 170, 110]], np.uint8)
base = Image.fromarray(PAL[np.minimum(cls, len(PAL) - 1)]).convert("RGB")


def review(cid, allp):
    img = base.copy(); dr = ImageDraw.Draw(img)
    for a, b in zip(allp, allp[1:]):
        dr.line([a, b], fill=(200, 0, 160), width=3)
    for i, (x, z) in enumerate(allp):
        if i == 0:
            dr.polygon([(x, z - 22), (x - 19, z + 11), (x + 19, z + 11)], outline=(200, 0, 160), width=3)
        else:
            dr.ellipse([x - 18, z - 18, x + 18, z + 18], outline=(200, 0, 160), width=3)
            if i < len(allp) - 1:
                dr.text((x + 20, z - 20), str(i), fill=(200, 0, 160))
    img.save(P.parent / f"course_review_{cid}.png")


courses = []
for k, L in enumerate(LEVELS):
    rng = np.random.default_rng(SEED * 100 + k)
    best, t0, tries = None, time.time(), 0
    while time.time() - t0 < BUDGET:
        tries += 1
        r = make(L, rng)
        if r and (best is None or r[0] > best[0]):
            best = r
    if best is None:
        print(f"{L['id']}: no course found in {tries} tries", flush=True)
        continue
    score, allp, kinds, length = best
    up = sum(climb(a, b) for a, b in zip(allp, allp[1:]))
    legs = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(allp, allp[1:])]
    print(f"{L['id']}: {len(allp) - 2} controls, {length / 1000:.2f} km, climb {up:.0f} m, legs {min(legs):.0f}-{max(legs):.0f} m, "
          f"score {score:.2f}, {tries} tries, kinds {kinds}", flush=True)
    codes = list(range(31, 31 + len(kinds) - 1)); rng.shuffle(codes); codes.append(LAST_CODE)   # the shared last control's code
    ctl = [{"kind": "start", "x": round(allp[0][0], 1), "z": round(allp[0][1], 1)}]
    for (x, z), kd_, code in zip(allp[1:-1], kinds, codes):
        ctl.append({"kind": "control", "x": round(x, 1), "z": round(z, 1), "code": str(code), "feature": kd_})
    ctl.append({"kind": "finish", "x": round(allp[-1][0], 1), "z": round(allp[-1][1], 1)})
    courses.append({"id": L["id"], "controls": ctl, "length": round(length), "climb": int(round(up / 5.0) * 5)})
    review(L["id"], allp)

R.pop("course", None)
R["courses"] = courses
json.dump(R, open(P / "race.json", "w"), indent=1)
print("written", P / "race.json", len(courses), "courses")
