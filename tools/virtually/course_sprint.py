"""Sprint courses on a town race of « Virtually » (after town_3d.py):   py course_sprint.py <race> [seed]

Control sites on sprint features: buildings' outer corners (the flag a metre out), monuments, fountains, trees and bushes
standing alone, stairways' feet, impassable walls' ends — never in a building, a garden, a forbidden area or against a wall.
Legs are timed on the ground classes' speeds and the game's own obstacles (buildings, gardens, impassable walls, fences and
hedges at their thickness, parked cars, bins and columns, a runner's body round them; 1 m grid, skimage's geometric MCP). A leg
scores for its route choice: the best route and a second one kept 10 m away from it, within 12 % of its time and round the other
side of something one cannot cross. Legs 60-260 m, no dog-leg, no leg through another control's circle; two controls of a course
near each other only when they follow each other, or when the legs between them are short (the owner, 2026-11-14: « otherwise one
passes the same place many times »); a leg does not run again along an earlier leg's route; flags and the start in open ground. Four courses
(blue, yellow, orange short and orange long — a sprint has no violet, nor middle and long distances; few to many controls,
short to long legs, route choice weighed more and more) into pkg/race.json `courses`; a review picture per course beside the package.
The last control is easy whatever the level and near the finish (owner, 2026-11-26: « there is always a last control very close to the
arrival, easy to find for all categories… and a balisage from that last control to the arrival »): a building's corner, a monument or
a fountain within LAST_FROM_START m of the start, the finish LAST_FIN m from it on a straight way clear of every obstacle by 1.5 m
(the game tapes it and the map draws it as a marked route)."""
import json, math, os, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, binary_dilation, gaussian_filter1d
from skimage.graph import MCP_Geometric

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
RACE = sys.argv[1]; SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 3
P = DATA / RACE / "pkg"
R = json.load(open(P / "race.json")); F = json.load(open(P / "feats.json")); TJ = json.load(open(P / "town.json"))
A = json.load(open(DATA / RACE / "area.json"))
cls = np.array(Image.open(P / "cls.png")); H, W = cls.shape
C = {n: i for i, n in enumerate(R["classes"])}
speed = np.array(R["speed"], np.float32)[cls]
rng = np.random.default_rng(SEED)

# ---- passability: the classes, the buildings' outlines and the impassable lines drawn in -------------------------------------
img = Image.fromarray((speed > 0.05).astype(np.uint8)); dr = ImageDraw.Draw(img)
for ring in TJ["foot"]:
    dr.polygon([tuple(p) for p in ring], fill=0)
for w in TJ["walls"]:
    if w["imp"]:
        dr.line([tuple(p) for p in w["pts"]], fill=0, width=1)
free = np.array(img, bool)
# the game's own obstacles (vtown.js hits(): a body of 0.3 m against walls and fences at their thickness, cars, posts), so that no
# leg and no flag counts on a way the runner cannot take (the owner, 2026-11-14: « the tunnel 3-4 is not accessible »); the thin
# posts (lamps, poles, bollards) are left to the runner, a 1 m grid cannot hold them
BODY = 0.3
PROP_R = {"bin": 0.25, "postbox": 0.3, "column": 0.6, "fountain": 1.2, "memorial": 0.7, "cabinet": 0.35, "phone": 0.4, "rpole": 0.22}
img = Image.fromarray(free.astype(np.uint8)); dr = ImageDraw.Draw(img)
for w in TJ["walls"]:
    if w.get("imp") and len(w["pts"]) >= 2:
        t_ = 0.45 if w["kind"] == "hedge" else 0.08 if w["kind"] in ("fence", "net") else 0.16
        dr.line([tuple(p) for p in w["pts"]], fill=0, width=max(1, int(round(2 * (t_ + BODY)))))
for pr in TJ.get("props", []):
    r_ = PROP_R.get(pr[0])
    if r_:
        r_ += BODY; dr.ellipse([pr[1] - r_, pr[2] - r_, pr[1] + r_, pr[2] + r_], fill=0)
for x_, z_, ang, L_, Wd, *_ in TJ.get("cars", []):
    a_ = math.radians(ang); h_ = max(0.0, L_ / 2 - Wd / 2); ex, ez = math.sin(a_) * h_, math.cos(a_) * h_
    dr.line([(x_ - ex, z_ - ez), (x_ + ex, z_ + ez)], fill=0, width=max(1, int(round(Wd + 2 * BODY))))
free = np.array(img, bool)
cost = np.where(free, 1.0 / np.maximum(speed, 0.05), np.inf)
cost[~free] = np.inf
# the course's area: the map's box, 25 m in from its edge (the world is the box plus the 3D scenery's margin)
WX0 = R["mm0"][0] * R["k"] + json.load(open(DATA / RACE / "map_objects.json"))["realWorld"]["x"]
WZ0 = R["mm0"][1] * R["k"] + json.load(open(DATA / RACE / "map_objects.json"))["realWorld"]["y"]
bx0, by0, bx1, by1 = A["box"]
X0, X1 = bx0 - WX0 + 25, bx1 - WX0 - 25
Z0, Z1 = WZ0 - by1 + 25, WZ0 - by0 - 25
inbox = lambda x, z: X0 < x < X1 and Z0 < z < Z1
near_block = distance_transform_edt(free) < 1.5                   # within 1.5 m of a wall or a building
ok_ground = free & np.isin(cls, [C[k] for k in ("paved", "open", "open_t", "path", "road", "track", "small_path", "forest", "stairs")])
# a flag stands on runnable ground in the ground that joins the rest of the town (not a pocket between a wall and a garden, which
# no route reaches)
from scipy.ndimage import label as _label
_lab, _n = _label(free)
MAIN = _lab == (np.argmax(np.bincount(_lab.ravel())[1:]) + 1) if _n else free
ok_ground = ok_ground & MAIN
# a flag in open ground (the owner, 2026-11-14: controls 1 and 2 « very hard to take »): half the ground within 3 m runnable
from scipy.ndimage import convolve
_disk = (np.hypot(*np.mgrid[-3:4, -3:4]) <= 3).astype(np.float32)
OPEN3 = convolve(free.astype(np.float32), _disk / _disk.sum(), mode="constant") >= 0.5
ok_ground = ok_ground & OPEN3
CLEAR = distance_transform_edt(free)                               # metres to the nearest obstacle

# ---- control sites ----------------------------------------------------------------------------------------------------------
sites = []


def site(x, z, kind):
    x, z = round(float(x), 1), round(float(z), 1)        # as race.json keeps it: the cell tested is the one the game reads
    i, j = int(z), int(x)
    i2, j2 = min(H - 1, int(round(z))), min(W - 1, int(round(x)))          # and the next one, however it is rounded
    if not inbox(x, z) or not (0 <= i < H and 0 <= j < W) or not ok_ground[i, j] or not ok_ground[i2, j2]:
        return
    sites.append((x, z, kind))


for ring in TJ["foot"]:
    p = np.array(ring[:-1]); n = len(p)
    if n < 4:
        continue
    area = 0.5 * abs(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]))
    if area < 50:
        continue
    sgn = np.sign(np.sum(p[:, 0] * np.roll(p[:, 1], -1) - np.roll(p[:, 0], -1) * p[:, 1]))
    for k in range(n):
        a, b, c = p[k - 1], p[k], p[(k + 1) % n]
        u, v = b - a, c - b
        if np.hypot(*u) < 3 or np.hypot(*v) < 3:
            continue
        cross = (u[0] * v[1] - u[1] * v[0]) * sgn
        ang = math.degrees(math.acos(np.clip(np.dot(-u, v) / np.hypot(*u) / np.hypot(*v), -1, 1)))
        if cross <= 0 or not (60 < ang < 120):                      # an outer corner, near square
            continue
        out = (u / np.hypot(*u) - v / np.hypot(*v)); out /= np.hypot(*out) or 1
        q = b + out * 1.1
        # open on both sides: 4 m along each wall's prolongation free
        if all(free[int(np.clip(t[1], 0, H - 1)), int(np.clip(t[0], 0, W - 1))] for t in (b + u / np.hypot(*u) * 4, b - v / np.hypot(*v) * 4)):
            site(q[0], q[1], "corner")
for f in F["features"]:
    k = {"monument": "monument", "fountain": "fountain", "bush": "bush", "bigtree": "bigtree", "manmade": "manmade"}.get(f["k"])
    if k:
        site(f["x"] + 0.8, f["z"], k)
for w in TJ["walls"]:
    if w["imp"] and w["kind"] == "wall" and len(w["pts"]) >= 2:
        for e, nb in ((w["pts"][0], w["pts"][1]), (w["pts"][-1], w["pts"][-2])):
            d = np.array(e) - np.array(nb); d /= np.hypot(*d) or 1
            q = np.array(e) + d * 1.0
            site(q[0], q[1], "wallend")
for w in TJ["walls"]:                                                  # a stairway's foot (its lower end, by the ground's height)
    if w["kind"] == "steps" and len(w["pts"]) >= 2:
        hh = np.array(Image.open(P / "h.png").convert("RGB"), np.float32) if "hh" not in globals() else hh
        lv = [hh[int(p[1]), int(p[0]), 0] * 256 + hh[int(p[1]), int(p[0]), 1] for p in (w["pts"][0], w["pts"][-1])]
        e, nb = (w["pts"][0], w["pts"][1]) if lv[0] <= lv[1] else (w["pts"][-1], w["pts"][-2])
        d = np.array(e) - np.array(nb); d /= np.hypot(*d) or 1
        q = np.array(e) + d * 1.2
        site(q[0], q[1], "stairs")
xy = np.array([[s[0], s[1]] for s in sites]); kinds = [s[2] for s in sites]
# thin out the corners: one in 12 m (a street's long row of house corners is one choice, not ten)
keep = np.ones(len(sites), bool)
from scipy.spatial import cKDTree
kd = cKDTree(xy)
for i in rng.permutation(len(sites)):
    if keep[i]:
        for j in kd.query_ball_point(xy[i], 12):
            if j != i:
                keep[j] = False
xy = xy[keep]; kinds = [k for k, m in zip(kinds, keep) if m]
print(RACE, "sites", len(xy), {k: kinds.count(k) for k in set(kinds)})

# ---- legs ---------------------------------------------------------------------------------------------------------------------
# each site's cost field over a window round it, computed once and kept compact (float16): a leg's time and route come from its
# first control's field, its route choice from the two fields added
from collections import OrderedDict
from scipy.ndimage import label as _lab2
RW = 380                                                            # the window's half side: the longest leg and a margin
_F, _M = OrderedDict(), OrderedDict()                               # fields (z0, x0, costs), and the searches kept for tracebacks


def field(i, keep=False):
    if i in _F and (not keep or i in _M):
        _F.move_to_end(i); return _F[i]
    x, z = int(xy[i][0]), int(xy[i][1])
    x0, x1, z0, z1 = max(0, x - RW), min(W, x + RW + 1), max(0, z - RW), min(H, z + RW + 1)
    m = MCP_Geometric(cost[z0:z1, x0:x1], fully_connected=True)
    cc, _ = m.find_costs([(z - z0, x - x0)])
    _F[i] = (z0, x0, np.minimum(cc, 6e4).astype(np.float16))
    if len(_F) > 300:
        _F.popitem(last=False)
    if keep:
        _M[i] = m
        if len(_M) > 6:
            _M.popitem(last=False)
    return _F[i]


def trace(i, z, x):
    if i not in _M or i not in _F:
        field(i, keep=True)
    z0, x0, _ = _F[i]
    return [(a + z0, b + x0) for a, b in _M[i].traceback((z - z0, x - x0))]


_legs, _ch = {}, {}
CHOICE_E = (0.03, 0.06, 0.09, 0.12)


def leg(i, j):
    """(best time, the second route's time over the best's, unused, best route, second route, ground enclosed between them);
    the choice (r2, p2, enclosed) only once asked for (choice())."""
    if (i, j) in _legs:
        t1, p1 = _legs[(i, j)]
        r2, p2, blk = _ch.get((i, j), (9, [], 0))
        return t1, r2, 0, p1, p2, blk
    fi = field(i, keep=True)
    zj, xj = int(xy[j][1]), int(xy[j][0])
    if not (fi[0] <= zj < fi[0] + fi[2].shape[0] and fi[1] <= xj < fi[1] + fi[2].shape[1]):
        _legs[(i, j)] = (math.inf, [])
    else:
        t1 = float(fi[2][zj - fi[0], xj - fi[1]])
        _legs[(i, j)] = (t1, trace(i, zj, xj)) if t1 < 6e4 else (math.inf, [])
    return leg(i, j)


def choice(i, j):
    """A real choice is a piece of ground one cannot cross, 150 m² at least, that the ground every route within e of the best
    passes over goes round on both sides (the owner, 2026-11-14: « non-trivial route choices »): r2 = 1 + the smallest e."""
    if (i, j) in _ch:
        return _ch[(i, j)]
    t1, p1 = _legs[(i, j)]
    fi, fj = field(i), field(j)
    oz0, ox0 = max(fi[0], fj[0]), max(fi[1], fj[1])
    oz1, ox1 = min(fi[0] + fi[2].shape[0], fj[0] + fj[2].shape[0]), min(fi[1] + fi[2].shape[1], fj[1] + fj[2].shape[1])
    T = fi[2][oz0 - fi[0]:oz1 - fi[0], ox0 - fi[1]:ox1 - fi[1]].astype(np.float32) +         fj[2][oz0 - fj[0]:oz1 - fj[0], ox0 - fj[1]:ox1 - fj[1]].astype(np.float32)
    blocked = ~np.isfinite(cost[oz0:oz1, ox0:ox1])
    r2, blk, p2 = 9, 0, []
    for e in CHOICE_E:
        near = T <= t1 * (1 + e)
        lab, n = _lab2(~near)
        if n == 0:
            continue
        edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        nb = np.bincount(lab[blocked], minlength=n + 1)
        nb[edge] = 0; nb[0] = 0
        k = int(np.argmax(nb))
        if nb[k] >= 150:
            r2, blk = 1 + e, int(nb[k])
            line = np.zeros(T.shape, bool); pa = np.array(p1) - [oz0, ox0]
            ok_ = (pa[:, 0] >= 0) & (pa[:, 0] < T.shape[0]) & (pa[:, 1] >= 0) & (pa[:, 1] < T.shape[1])
            line[pa[ok_, 0], pa[ok_, 1]] = True
            dd = distance_transform_edt(~line)
            ring = near & binary_dilation(lab == k, iterations=2)
            if ring.any():
                c = np.unravel_index(np.argmax(np.where(ring, dd, -1)), T.shape)
                cz, cx = int(c[0]) + oz0, int(c[1]) + ox0
                p2 = trace(i, cz, cx) + trace(j, cz, cx)[::-1]
            break
    _ch[(i, j)] = (r2, p2, blk)
    return _ch[(i, j)]


def seg_cross(a, b, c, d):
    o = lambda p, q, r: np.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
    return o(a, b, c) != o(a, b, d) and o(c, d, a) != o(c, d, b)


# the colour levels at a sprint's lengths (the Coach page names them, vt.lvl.<id>): no violet in sprint, and its orange is short
# or long, not middle or long distance (owner, 2026-11-11)
LEVELS = {"blue": dict(n=6, km=1.0, lo=50, hi=170, rc=0.0, sep=70), "yellow": dict(n=8, km=1.4, lo=60, hi=200, rc=0.3, sep=70),
          "orange_s": dict(n=10, km=1.8, lo=60, hi=220, rc=1.0, sep=90), "orange_l": dict(n=14, km=2.8, lo=80, hi=280, rc=2.0, sep=90)}


LAST_FROM_START, LAST_FIN, LAST_EASY = 220, (40, 100), {"corner", "monument", "fountain"}


def clear_line(a, b, m=1.5):
    """Is the straight way from a to b at least m metres from every obstacle (the corridor's tape on both sides)?"""
    n = int(math.hypot(*(b - a)) * 2) + 2
    xs = np.linspace(a[0], b[0], n).astype(int).clip(0, W - 1); zs = np.linspace(a[1], b[1], n).astype(int).clip(0, H - 1)
    return bool((CLEAR[zs, xs] >= m).all())


def apart(q, seq, L):
    """May a point q follow the course seq? Not near an earlier control but the last, unless the legs between them are short:
    `sep` metres, or half the way along the course between them when that is less."""
    along = math.hypot(*(q - xy[seq[-1]]))
    for m in range(len(seq) - 2, -1, -1):
        along += math.hypot(*(xy[seq[m + 1]] - xy[seq[m]]))
        if math.hypot(*(q - xy[seq[m]])) < min(L["sep"], 0.5 * along):
            return False
    return True


def route_mask(pth, r=6):
    """The cells within r m of a route."""
    m = np.zeros((H, W), bool)
    if pth:
        pa = np.array(pth); m[pa[:, 0], pa[:, 1]] = True
        z0, z1, x0, x1 = max(0, pa[:, 0].min() - r - 1), pa[:, 0].max() + r + 2, max(0, pa[:, 1].min() - r - 1), pa[:, 1].max() + r + 2
        m[z0:z1, x0:x1] = binary_dilation(m[z0:z1, x0:x1], iterations=r)
    return m


def make(level, tries=60):
    L = LEVELS[level]; best = None
    # the start: a site near the box's middle-south (the map's bottom), the finish near it
    starts = [k for k in range(len(xy)) if CLEAR[int(xy[k][1]), int(xy[k][0])] >= 2.5] or list(range(len(xy)))
    for t in range(tries):
        s = int(starts[int(rng.integers(len(starts)))])          # the start in the open: a runner sees where to go
        seq = [s]; score = 0.0; legs_ = []
        used = np.zeros((H, W), bool); last_mask = None
        while len(seq) < L["n"] + 1:
            last = seq[-1]
            d = np.hypot(xy[:, 0] - xy[last, 0], xy[:, 1] - xy[last, 1])
            cand = [int(c) for c in np.nonzero((d > L["lo"]) & (d < L["hi"]))[0] if c not in seq]
            final = len(seq) == L["n"]                          # the last control: easy, near the start (the finish beside it)
            if final:
                cand = [c for c in cand if math.hypot(*(xy[c] - xy[s])) <= LAST_FROM_START]
                easy = [c for c in cand if kinds[c] in LAST_EASY]
                cand = easy or cand
            rng.shuffle(cand)
            goods = []
            for c in cand[:40]:
                if any(math.hypot(*(xy[c] - xy[q])) < 25 for q in seq) or not apart(xy[c], seq, L):
                    continue
                if len(seq) >= 2:
                    a1 = math.atan2(*(xy[last] - xy[seq[-2]])[::-1]); a2 = math.atan2(*(xy[c] - xy[last])[::-1])
                    if abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi) > math.radians(145):
                        continue
                if any(seg_cross(xy[last], xy[c], xy[seq[k]], xy[seq[k + 1]]) for k in range(len(seq) - 2)):
                    continue
                t1, r2, gap, p1, p2, blk = leg(last, c)
                if not math.isfinite(t1) or t1 > 2.6 * d[c]:
                    continue
                # not again along an earlier leg's route (the leg before excepted: they share a control)
                pa_ = np.array(p1)
                if used[pa_[:, 0], pa_[:, 1]].mean() > 0.2:
                    continue
                # no leg through another control's circle (15 m)
                pa = np.array(p1)
                if any(np.min(np.hypot(pa[:, 1] - xy[q][0], pa[:, 0] - xy[q][1])) < 15 for q in seq[:-1]):
                    continue
                if L["rc"] > 0 and not final:
                    r2, p2, blk = choice(last, c)
                choice_ = max(0.0, 1.15 - r2) / 0.12 if blk >= 150 else 0.0
                goods.append((c, choice_, t1))
                # the levels that want route choices look at a few legs and take the one with the best (the first otherwise)
                if len(goods) >= (4 if L["rc"] >= 1 and not final else 1):
                    break
            got = max(goods, key=lambda g_: g_[1]) if goods else None
            if got is None:
                break
            if last_mask is not None:
                used |= last_mask
            last_mask = route_mask(leg(last, got[0])[3])
            seq.append(got[0]); legs_.append(got); score += L["rc"] * got[1] + 0.2 * (got[2] / d[got[0]] > 1.25)
        if len(seq) < L["n"] + 1:
            continue
        # the finish: a free cell LAST_FIN m from the last control, near the start, the straight way to it clear (taped)
        fin = None
        for _ in range(300):
            a = rng.uniform(0, 2 * math.pi); r = rng.uniform(*LAST_FIN)
            q = xy[seq[-1]] + r * np.array([math.cos(a), math.sin(a)])
            if inbox(*q) and ok_ground[int(q[1]), int(q[0])] and not near_block[int(q[1]), int(q[0])] \
                    and math.hypot(*(q - xy[s])) < LAST_FROM_START \
                    and all(math.hypot(*(q - xy[k])) >= min(L["sep"], 60) for k in seq[1:-1]) and clear_line(xy[seq[-1]], q):
                fin = q; break
        if fin is None:
            continue
        pts = [xy[k] for k in seq] + [fin]
        length = sum(math.hypot(*(b - a)) for a, b in zip(pts, pts[1:]))
        kinds_ = [kinds[k] for k in seq[1:]]
        score += 1.5 * len(set(kinds_)) / len(kinds_) - 4 * abs(length / 1000 - L["km"])
        if best is None or score > best[0]:
            best = (score, seq, fin, length, legs_)
    return best


HG = (lambda a: R["base"] + (a[..., 0] * 256 + a[..., 1]) / 100)(np.asarray(Image.open(P / "h.png").convert("RGB")).astype(np.float32))


def do_level(level):
    """One level's course and its review picture (each level in a process of its own: the levels are set side by side)."""
    import time
    global rng
    rng = np.random.default_rng(SEED * 100 + list(LEVELS).index(level))
    t0 = time.time()
    b = make(level, 40 if level in ("blue", "yellow") else 50)                 # the orange courses searched longer: route choices
    if b is None:
        print(level, "no course found", flush=True); return None
    score, seq, fin, length, legs_ = b
    codes = list(range(31, 31 + len(seq) - 1)); rng.shuffle(codes)
    ctl = [{"kind": "start", "x": round(float(xy[seq[0]][0]), 1), "z": round(float(xy[seq[0]][1]), 1)}]
    for k, code in zip(seq[1:], codes):
        ctl.append({"kind": "control", "x": round(float(xy[k][0]), 1), "z": round(float(xy[k][1]), 1), "code": str(code), "feature": kinds[k]})
    ctl.append({"kind": "finish", "x": round(float(fin[0]), 1), "z": round(float(fin[1]), 1)})
    rc = sum(1 for l in legs_ if l[1] > 0.3)
    print(f"{level}: {len(seq) - 1} controls, {length / 1000:.2f} km, {rc} legs with a route choice, score {score:.2f}, "
          f"{time.time() - t0:.0f} s", flush=True)
    up = 0.0                                                         # the climb along the best routes
    for i0, i1 in zip(seq, seq[1:]):
        pa = np.array(leg(i0, i1)[3]); hz = gaussian_filter1d(HG[pa[:, 0], pa[:, 1]], 3); up += float(np.clip(np.diff(hz), 0, None).sum())
    # review picture
    rv = Image.fromarray(np.where(free[..., None], np.array([250, 250, 245], np.uint8), np.array([60, 60, 60], np.uint8))).convert("RGB")
    d_ = ImageDraw.Draw(rv)
    for (c, ch, t1), (i0, i1) in zip(legs_, zip(seq, seq[1:])):
        _, _, _, p1, p2, _ = leg(i0, i1)
        d_.line([(x, z) for z, x in p1], fill=(0, 120, 255), width=2)
        if ch > 0 and p2:
            d_.line([(x, z) for z, x in p2], fill=(0, 200, 90), width=2)
    pts = [tuple(xy[k]) for k in seq] + [tuple(fin)]
    for a_, b_ in zip(pts, pts[1:]):
        d_.line([a_, b_], fill=(200, 0, 160), width=2)
    for i, (x, z) in enumerate(pts):
        d_.ellipse([x - 12, z - 12, x + 12, z + 12], outline=(200, 0, 160), width=2)
        d_.text((x + 13, z - 13), "S" if i == 0 else "F" if i == len(pts) - 1 else str(i), fill=(200, 0, 160))
    rv.save(P.parent / f"course_review_{level}.png")
    return {"id": level, "controls": ctl, "length": round(length), "climb": int(round(up / 5.0) * 5)}


if __name__ == "__main__":
    from multiprocessing import Pool
    with Pool(len(LEVELS)) as pool:
        out = [o for o in pool.map(do_level, list(LEVELS)) if o]
    R.pop("course", None)
    R["courses"] = out
    json.dump(R, open(P / "race.json", "w"), indent=1)
