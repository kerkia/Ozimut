"""Photo façades for a town race of « Virtually » (used by town_3d.py): each side of a building that Panoramax's street photos see
is rectified from them into a tile (`FacadeTex.side`), the tiles packed into one atlas (`pack`).

The photos and their poses come from town_panoramax.py (src/panoramax/*.jpg, src/poses.json); they are CC BY-SA 4.0, so the atlas
made from them is CC BY-SA 4.0 too (race.json says so, with every photo's author and id). Panoramax blurs faces and number plates
on upload; as its blurring can miss one, **nothing below 2.5 m above the street is taken** (`V0`): passers-by and cars stay out,
the ground floor keeps the game's own façade.

**The pose, again, for each photo** (`refine`): a texture needs the camera far more exactly than a colour does (a metre off and the
heights slide along a wall: the façade comes out skewed, the street in it). Every building corner the photo should see (a vertical
line from 2.5 m above the street to the roof's edge, the LiDAR's buildings) and every wall's top are projected, and the pose —
position ± 3 m, heading ± 4°, the camera's height 1.4-2.6 m, its pitch and, for a panorama, its roll (a tilted panorama bends the
horizon into a wave: pitch × cos + roll × sin of the bearing) — is the one under which the photo's gradient along them is
strongest (across the corners, the edge's own direction ignored on the tops), coarse then fine. A photo whose best pose is not
clearly above its own gradient's background is not used.

A side's tile: u along the side (m, as the walls' `wuv`), v from 2.5 m above its highest ground to its top (the gable's too); each
texel the wall's point projected into the best photo (the one that sees most of the side, sharpest, most face-on), the holes filled
from the next ones; a photo's part is kept only when its edges come out upright and level (`axis_share`: a pose still off skews
them, foliage scatters them); a texel is left transparent where the point is above the roof's edge, hidden by another building or a tree
(the LiDAR's vegetation along the ray), or reads as sky or foliage. Each photo's part of a tile is brought to one exposure (its
median lightness to a façade's), a blue cast taken out."""
import itertools, json, math, os
from collections import OrderedDict
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from scipy.ndimage import (binary_erosion, distance_transform_edt, gaussian_filter, map_coordinates, sobel)
from scipy.spatial import cKDTree

PXM = 20            # texels a metre before packing
V0 = 2.5            # m above the street: nothing lower is taken (people, plates)
MAXD = 30.0         # m: photos farther than this from a side's point are not used
MIN_COS = math.cos(math.radians(72))
AXIS_MIN = 0.45     # a photo's part of a tile: at least this share of its edges upright or level (axis_share)
# a tile is kept only when it is anchored where the side's edges are: its top row's horizontal gradient and its two end columns'
# vertical one, each over the tile's mean gradient (`anchors`); pavement or a car seen instead of the wall has neither there
# (set on Gif's 22 candidate tiles of 2026-11-11 so that only the two clean ones passed: it errs on leaving a photo out)
SHARE_MIN = float(os.environ.get("TEX_SHARE_MIN", 0.5))
TOP_MIN = float(os.environ.get("TEX_TOP_MIN", 0.75))
ENDS_MIN = float(os.environ.get("TEX_ENDS_MIN", 0.3))
WIDTH_MIN = 4.0     # m: narrower sides are left drawn
TARGET = 150.0      # a tile's median lightness after the exposure (0-255, as the façades' vertex colours)


class FacadeTex:
    def __init__(self, src: Path, wx, wz, polys, zv_at, zb_at, gnd_at, log=print):
        """src: the race's src folder; wx, wz: Lambert 93 → world; polys: the buildings' outlines (world); zv_at / zb_at (x, z): the
        vegetation's / the buildings' top (absolute m; NaN / below the ground where none); gnd_at(x, z): the ground (absolute m)."""
        self.dir = src / "panoramax"
        self.poses = [p for p in json.load(open(src / "poses.json")) if (self.dir / f"{p['id']}.jpg").exists()]
        for p in self.poses:
            p["wx"], p["wz"] = float(wx(p["x"])), float(wz(p["y"]))
            p.setdefault("roll", 0.0)
        self.kd = cKDTree([[p["wx"], p["wz"]] for p in self.poses]) if self.poses else None
        self.polys = polys
        self.tree = shapely.STRtree(polys)
        self.zv_at, self.zb_at, self.gnd_at = zv_at, zb_at, gnd_at
        self.log = log
        self.cache = OrderedDict()
        self.dims = {}                                  # photo id → (h, w), read from the file's header
        self.refined = {}                               # photo id → refined pose, or None (not used)
        self.ref_file = src / "poses_refined.json"      # kept between runs: refining is the slow part
        # the poses are in the world's frame: kept only while the area is the same (a race enlarged moves its origin)
        self.frame = json.load(open(src.parent / "area.json"))["ext"]
        if self.ref_file.exists() and not os.environ.get("TEX_REFINE"):
            kept = json.load(open(self.ref_file))
            if kept.pop("_frame", None) == self.frame:
                self.refined = kept
        self.tilelog = []
        self.debug = os.environ.get("TEX_DEBUG")
        self.used = {}                                  # photo id → pose (those a kept tile was taken from)
        # the buildings' corners and wall tops, for the poses: (a, e, outward normal, points, ground, top) per side
        self.sides = []
        for poly in polys:
            c = np.array(poly.exterior.coords); ccw = poly.exterior.is_ccw
            for a, e in zip(c[:-1], c[1:]):
                d = e - a; L = math.hypot(*d)
                if L < 2.5:
                    continue
                n = np.array([d[1], -d[0]]) / L if ccw else np.array([-d[1], d[0]]) / L
                if poly.contains(shapely.Point(*((a + e) / 2 + n * 0.4))):
                    n = -n
                ts = np.linspace(0.1, 0.9, max(2, int(L / 0.8)))
                P = a[None, :] + (e - a)[None, :] * ts[:, None]
                inner = P - n[None, :] * 0.7
                top = self.zb_at(inner[:, 0], inner[:, 1])
                g = self.gnd_at(P[:, 0], P[:, 1])
                ok = top > g + 3.0
                if ok.sum() < 2:
                    continue
                self.sides.append((a, e, n, P[ok], g[ok], top[ok]))
        self.side_mid = cKDTree([(s[0] + s[1]) / 2 for s in self.sides])

    def save(self):
        json.dump({"_frame": self.frame, **self.refined}, open(self.ref_file, "w"))
        if self.debug:
            json.dump(self.tilelog, open(Path(self.debug) / "tiles.json", "w"), indent=0)

    def img(self, p):
        k = p["id"]
        if k in self.cache:
            self.cache.move_to_end(k); return self.cache[k]
        a = np.asarray(Image.open(self.dir / f"{k}.jpg").convert("RGB"), np.float32)
        self.cache[k] = a
        if len(self.cache) > 24:
            self.cache.popitem(last=False)
        return a

    # ---- geometry -----------------------------------------------------------------------------------------------------------------
    @staticmethod
    def proj(p, X, Z, Y, h, w, cx, cz, cy, yaw, pitch, roll):
        """World points → photo pixels (u, v), NaN outside, and pixels a metre at that distance, for the camera given."""
        dx, dz = X - cx, Z - cz
        d = np.hypot(dx, dz) + 1e-6
        az = np.degrees(np.arctan2(dx, -dz))                        # world z is south: north is −z
        el = np.degrees(np.arctan2(Y - cy, d))
        da = (az - yaw + 540) % 360 - 180
        if p["fov"] >= 359:
            tilt = pitch * np.cos(np.radians(da)) + roll * np.sin(np.radians(da))
            u = (da / 360 + 0.5) * w; v = (0.5 - (el - tilt) / 180) * h
            ppm = (w / (2 * math.pi)) / d
        else:
            f = (w / 2) / math.tan(math.radians(p["fov"] / 2))
            ok = np.abs(da) < p["fov"] / 2
            dac = np.radians(np.clip(da, -89, 89))
            u = w / 2 + np.tan(dac) * f
            v = h / 2 - np.tan(np.radians(el - pitch)) * f / np.cos(dac)
            ok &= (u >= 0) & (u < w)
            u = np.where(ok, u, np.nan)
            ppm = f / d
        v = np.where((v >= 1) & (v < h - 1), v, np.nan)
        return u, v, ppm

    def project(self, p, X, Z, Y, h, w):
        r = self.refined[p["id"]]
        return self.proj(p, X, Z, Y, h, w, r["wx"], r["wz"], r["cy"], r["yaw"], r["pitch"], r["roll"])

    def refine(self, p):
        """The photo's pose, refined on the buildings' edges (see the module's text); None when they cannot be found in it."""
        if p["id"] in self.refined:
            return self.refined[p["id"]]
        img = self.img(p); h, w = img.shape[:2]
        gray = img.mean(axis=2)
        gx = np.abs(sobel(gray, axis=1)); gy = np.abs(sobel(gray, axis=0))
        gm = gaussian_filter(np.hypot(gx, gy), 1.5); gx = gaussian_filter(gx, 1.5)
        base = float(np.median(gm)) + 1e-3
        # the edges it should see: sides within 35 m facing it, not hidden behind another building (their middle)
        V, T = [], []                                    # vertical corner points; wall-top points
        for i in self.side_mid.query_ball_point([p["wx"], p["wz"]], 35):
            a, e, n, P, g, top = self.sides[i]
            m = (a + e) / 2; v = np.array([p["wx"], p["wz"]]) - m; d = math.hypot(*v)
            if d < 3 or float(np.dot(v / d, n)) < 0.2:
                continue
            line = shapely.LineString([(p["wx"], p["wz"]), tuple(m + n * 0.3)])
            if any(self.polys[j].intersects(line) for j in self.tree.query(line)):
                continue
            for k in (0, -1):
                if top[k] - 0.3 > g[k] + V0:
                    V += [(P[k][0], P[k][1], y) for y in np.linspace(g[k] + V0, top[k] - 0.3, 6)]
            T += [(x, z, t) for (x, z), t in zip(P, top)]
        if len(V) < 12 or len(T) < 12:
            self.refined[p["id"]] = None; return None
        V = np.array(V); T = np.array(T)
        pano = p["fov"] >= 359

        def score(cx, cz, cy, yaw, pitch, roll):
            s = 0.0
            for A, G in ((V, gx), (T, gm)):
                u, v, _ = self.proj(p, A[:, 0], A[:, 1], A[:, 2], h, w, cx, cz, cy, yaw, pitch, roll)
                ok = np.isfinite(u) & np.isfinite(v)
                if ok.sum() < 6:
                    return 0.0
                uu = u[ok] % w if pano else u[ok]
                s += float(map_coordinates(G, [v[ok], uu], order=1, mode="nearest").mean()) * ok.mean()
            return s / 2

        x0, z0, y0 = p["wx"], p["wz"], p["cam_z"]
        best = (score(x0, z0, y0, p["yaw"], p["pitch"], p["roll"]), (0.0, 0.0, 0.0, 0.0, p["pitch"], 0.0))
        rolls = (-2, 0, 2) if pano else (0,)
        for dx, dz, dyaw, dh, pt, rl in itertools.product((-3, -2, -1, 0, 1, 2, 3), (-3, -2, -1, 0, 1, 2, 3), (-3, -1.5, 0, 1.5, 3),
                                                          (-0.2, 0.4), (p["pitch"] - 2, p["pitch"], p["pitch"] + 2), rolls):
            sc = score(x0 + dx, z0 + dz, y0 + dh, p["yaw"] + dyaw, pt, rl)
            if sc > best[0]:
                best = (sc, (dx, dz, dyaw, dh, pt, rl))
        for step in (0.5, 0.25):                         # fine: one coordinate at a time, around the best
            for _ in range(2):
                for k, (lo, hi) in enumerate(((-3.5, 3.5), (-3.5, 3.5), (-4, 4), (-0.3, 1.0), (-8, 8), (-3, 3))):
                    if k == 5 and not pano:
                        continue
                    d_ = step / 2 if k == 3 else step
                    for sgn in (-1, 1):
                        c = list(best[1]); c[k] = min(hi, max(lo, c[k] + sgn * d_))
                        sc = score(x0 + c[0], z0 + c[1], y0 + c[3], p["yaw"] + c[2], c[4], c[5])
                        if sc > best[0]:
                            best = (sc, tuple(c))
        sc, (dx, dz, dyaw, dh, pt, rl) = best
        if sc < 2.2 * base:                              # the edges are not clearly in the photo: not used
            self.refined[p["id"]] = None; return None
        r = {"wx": x0 + dx, "wz": z0 + dz, "cy": y0 + dh, "yaw": p["yaw"] + dyaw, "pitch": float(pt), "roll": float(rl), "fit": float(sc / base)}
        self.refined[p["id"]] = r
        return r

    def hidden(self, p, X, Z, Y):
        """True where the ray from the camera to the point crosses a building's outline or a tree's crown."""
        r = self.refined[p["id"]]; cx, cz, cy = r["wx"], r["wz"], r["cy"]
        out = np.zeros(X.shape, bool); flat = out.ravel()
        cols = {}
        for i, (x, z) in enumerate(zip(X.ravel(), Z.ravel())):
            cols.setdefault((round(float(x), 2), round(float(z), 2)), []).append(i)
        for (x, z), ids in cols.items():
            dx, dz = cx - x, cz - z; d = math.hypot(dx, dz) + 1e-6
            line = shapely.LineString([(cx, cz), (x + dx / d * 0.25, z + dz / d * 0.25)])
            if any(self.polys[j].intersects(line) for j in self.tree.query(line)):
                flat[ids] = True
        d = np.hypot(X - cx, Z - cz)
        n = int(np.ceil(d.max() / 0.7)) + 1
        t = np.linspace(0, 1, n)[1:-1, None]
        if len(t):
            Xs = cx + (X.ravel()[None, :] - cx) * t; Zs = cz + (Z.ravel()[None, :] - cz) * t
            Ys = cy + (Y.ravel()[None, :] - cy) * t
            near = (1 - t) * d.ravel()[None, :] < 1.0
            tree = np.nan_to_num(self.zv_at(Xs, Zs), nan=-1e9) > Ys + 0.3
            flat |= (tree & ~near).any(axis=0)
        return out

    def size(self, p):
        """The photo's (height, width) in pixels, without decoding it (a photo is decoded only where its pixels are read)."""
        k = p["id"]
        if k not in self.dims:
            if k in self.cache:
                self.dims[k] = self.cache[k].shape[:2]
            else:
                with Image.open(self.dir / f"{k}.jpg") as im:
                    self.dims[k] = (im.height, im.width)
        return self.dims[k]

    def gray(self, p):
        k = ("g", p["id"])
        if k not in self.cache:
            self.cache[k] = self.img(p).mean(axis=2)
            if len(self.cache) > 48:
                self.cache.popitem(last=False)
        return self.cache[k]

    def local(self, p, X, Z, Y, Tm):
        """The pose for this one side, around the photo's refined one: the side rectified at 6 texels a metre should come out
        straight (its edges upright and level, `axis_share`) and anchored (a strong edge along its top — the eaves — and at both
        its ends — the corners —, which straightness alone cannot tell from a wall slid up or down). A small grid of positions,
        then each of position, height, heading, pitch (and a panorama's roll) stepped while the score grows. None when no pose
        makes it straight enough."""
        r = self.refined[p["id"]]; h, w = self.size(p); gray = self.gray(p); pano = p["fov"] >= 359
        k = max(1, PXM // 6)
        Xs, Zs, Ys, Ts = X[::k, ::k], Z[::k, ::k], Y[::k, ::k], Tm[::k, ::k]
        below = Ys <= Ts + 0.05
        top = below & ~np.roll(below, 1, axis=0)          # the first texel row under the side's top, column by column
        top[0] = below[0]

        def score(c):
            u, v, _ = self.proj(p, Xs, Zs, Ys, h, w, *c)
            ok = below & np.isfinite(u) & np.isfinite(v)
            if ok.mean() < 0.25 * below.mean() or ok.sum() < 40:
                return -1.0
            uu = np.where(ok, u % w if pano else u, 0); vq = np.where(ok, v, 0)
            g = map_coordinates(gray, [vq, uu], order=1, mode="nearest")
            share, mag, gx, gy = axis_stats(g, ok)
            if mag <= 0:
                return -1.0
            et = float(gy[top & ok].mean()) / mag if (top & ok).any() else 0.0
            ends = np.zeros_like(ok); ends[:, :2] = True; ends[:, -2:] = True; ends &= ok
            es = float(gx[ends].mean()) / mag if ends.any() else 0.0
            return share + 0.12 * min(et, 3.0) + 0.08 * min(es, 3.0)

        c0 = [r["wx"], r["wz"], r["cy"], r["yaw"], r["pitch"], r["roll"]]
        best = (score(c0), c0)
        for dx in (-1.5, -0.75, 0.75, 1.5, 0):
            for dz in (-1.5, -0.75, 0.75, 1.5, 0):
                c = [c0[0] + dx, c0[1] + dz, *c0[2:]]
                sc = score(c)
                if sc > best[0]:
                    best = (sc, c)
        steps = ((0.5, 0.5, 0.2, 1.0, 1.0, 1.0), (0.25, 0.25, 0.1, 0.5, 0.5, 0.5), (0.12, 0.12, 0.05, 0.25, 0.25, 0.25))
        for st in steps:
            moved = True; n = 0
            while moved and n < 6:
                moved = False; n += 1
                for j in range(6 if pano else 5):
                    for sgn in (-1, 1):
                        c = list(best[1]); c[j] += sgn * st[j]
                        sc = score(c)
                        if sc > best[0] + 1e-4:
                            best = (sc, c); moved = True
        u, v, _ = self.proj(p, Xs, Zs, Ys, h, w, *best[1])
        ok = below & np.isfinite(u) & np.isfinite(v)
        if ok.sum() < 40:
            return None
        g = map_coordinates(gray, [np.where(ok, v, 0), np.where(ok, u % w if pano else u, 0)], order=1, mode="nearest")
        if axis_stats(g, ok)[0] < AXIS_MIN:
            return None
        return best[1]

    # ---- a side ---------------------------------------------------------------------------------------------------------------------
    def side(self, pts, ztop, gnd, b0, own):
        """pts (k × 2, world x, z) the side's outline, ztop (k) its top (absolute), gnd (k) the ground along it, b0 the building's
        ground median, own the building's outline (world). → (RGBA tile, v_lo, v_hi) in the walls' (u, v) frame, or None."""
        if self.kd is None:
            return None
        seg = np.hypot(*np.diff(pts, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)]); Ls = float(s[-1])
        vlo = float(gnd.max()) - b0 + V0; vhi = float(ztop.max()) - b0
        if Ls < 2.0 or vhi - vlo < 1.2:
            return None
        nu, nv = max(2, int(math.ceil(Ls * PXM))), max(2, int(math.ceil((vhi - vlo) * PXM)))
        su = (np.arange(nu) + 0.5) / PXM; sv = vhi - (np.arange(nv) + 0.5) / PXM
        X1 = np.interp(su, s, pts[:, 0]); Z1 = np.interp(su, s, pts[:, 1]); T1 = np.interp(su, s, ztop)
        ch = pts[-1] - pts[0]; L = math.hypot(*ch) + 1e-9; nrm = np.array([ch[1], -ch[0]]) / L
        mid = pts[len(pts) // 2] if len(pts) > 2 else (pts[0] + pts[-1]) / 2
        if own.contains(shapely.Point(mid + nrm * 0.4)):
            nrm = -nrm
        cand = self.kd.query_ball_point(mid, MAXD + Ls / 2)
        cu = np.arange(0.5, Ls, 1.0); cv = np.arange(vhi - 0.5, vlo, -1.5)
        if len(cu) == 0 or len(cv) == 0:
            return None
        CX, CV = np.meshgrid(np.interp(cu, s, pts[:, 0]), cv); CZ, _ = np.meshgrid(np.interp(cu, s, pts[:, 1]), cv)
        CT, _ = np.meshgrid(np.interp(cu, s, ztop), cv); CY = b0 + CV
        below = CY <= CT + 0.05
        scored = []
        for i in cand:
            p = self.poses[i]
            v = np.array([p["wx"], p["wz"]]) - mid; d = math.hypot(*v)
            if d < 3 or float(np.dot(v / d, nrm)) < MIN_COS:
                continue
            if self.refine(p) is None:
                continue
            h, w = self.size(p)
            u, vv, ppm = self.project(p, CX, CZ, CY, h, w)
            ok = below & np.isfinite(u) & np.isfinite(vv)
            if ok.sum() < 3:
                continue
            ok &= ~self.hidden(p, CX, CZ, CY)
            if ok.sum() < 3:
                continue
            sharp = np.minimum(ppm / PXM, 1.2)
            scored.append((float((sharp * ok).sum()) * float(np.dot(v / d, nrm)) * min(1.0, self.refined[p["id"]]["fit"] / 3), i))
        if not scored:
            return None
        scored.sort(reverse=True)
        X = np.broadcast_to(X1, (nv, nu)); Z = np.broadcast_to(Z1, (nv, nu)); Y = b0 + np.broadcast_to(sv[:, None], (nv, nu))
        Tm = np.broadcast_to(T1, (nv, nu))
        rgb = np.zeros((nv, nu, 3), np.float32); have = np.zeros((nv, nu), bool); took = []
        for sc, i in scored[:3]:
            if sc < 0.3 * scored[0][0] or have.all():
                break
            p = self.poses[i]; h, w = self.size(p)
            cam = self.local(p, X, Z, Y, Tm)
            if cam is None:
                continue
            img = self.img(p)
            u, vv, _ = self.proj(p, X, Z, Y, h, w, *cam)
            ok = (Y <= Tm + 0.05) & np.isfinite(u) & np.isfinite(vv) & ~have
            if ok.sum() < 50:
                continue
            step = max(1, PXM // 2)
            sub = (slice(step // 2, None, step), slice(step // 2, None, step))
            hid = self.hidden(p, X[sub], Z[sub], Y[sub])
            hidf = np.repeat(np.repeat(hid, step, 0), step, 1)
            hidf = np.pad(hidf, ((0, max(0, nv - hidf.shape[0])), (0, max(0, nu - hidf.shape[1]))), mode="edge")[:nv, :nu]
            ok &= ~hidf
            uu = np.where(ok, u, 0); vq = np.where(ok, vv, 0)
            if p["fov"] >= 359:
                uu = uu % w
            col = np.dstack([map_coordinates(img[..., c], [vq, uu], order=1, mode="nearest") for c in range(3)])
            mx, mn = col.max(axis=2), col.min(axis=2); r_, g_, b_ = col[..., 0], col[..., 1], col[..., 2]
            sky = ((mx > 160) & (b_ >= r_ - 8) & ((mx - mn) / (mx + 1) < 0.45) & (Y > Tm - 1.0)) | (mx > 238)
            leaf = (g_ > r_ + 10) & (g_ > b_ + 6)
            ok &= ~sky & ~leaf
            if ok.sum() < 50 or axis_share(col, ok) < AXIS_MIN:      # skewed (a pose still off) or not a wall: not taken
                continue
            pix = col[ok]; med = np.median(pix, axis=0); lum = float(med.mean())
            gain = np.full(3, TARGET / max(lum, 20.0))
            if med[2] > med[0]:
                gain[2] *= med[0] / med[2]
            col = np.clip(col * gain, 0, 255)
            rgb[ok] = col[ok]; have |= ok
            took.append(p)
        if have.mean() < 0.3:
            return None
        have = binary_erosion(have, iterations=1)
        if not have.any():
            return None
        a = np.clip(gaussian_filter(have.astype(np.float32), 1.2) * 1.6 - 0.3, 0, 1)
        _, (ii, jj) = distance_transform_edt(~have, return_indices=True)
        rgb = rgb[ii, jj]
        tile = np.dstack([np.nan_to_num(rgb), a[..., None] * 255]).astype(np.uint8)
        share, et, es = anchors(rgb, have, Y <= Tm + 0.05)
        keep = share >= SHARE_MIN and et >= TOP_MIN and es >= ENDS_MIN and Ls >= WIDTH_MIN
        n = len(self.tilelog)
        self.tilelog.append({"n": n, "share": round(share, 3), "top": round(et, 3), "ends": round(es, 3), "keep": keep,
                             "photos": sorted({self.poses[i]["id"][:8] for _, i in scored[:3]})})
        if self.debug:
            Image.fromarray(tile).save(Path(self.debug) / f"{n:03d}.png")
        if not keep:
            return None
        for q in took:
            self.used[q["id"]] = q
        return tile, vlo, vhi


def axis_stats(g, ok):
    """(the share of the strong gradients' energy within 10° of upright or level, the mean gradient, |gx|, |gy|) of a grey image
    where `ok`."""
    gx, gy = sobel(g, axis=1), sobel(g, axis=0)
    inside = binary_erosion(ok, iterations=1)
    m = np.hypot(gx, gy) * inside
    if (m > 0).sum() < 30:
        return 0.0, 0.0, np.abs(gx), np.abs(gy)
    strong = m > np.percentile(m[m > 0], 70)
    ang = np.degrees(np.arctan2(gy[strong], gx[strong])) % 90
    near = (ang < 10) | (ang > 80)
    return float((m[strong] * near).sum() / m[strong].sum()), float(m[inside].mean()), np.abs(gx), np.abs(gy)


def anchors(rgb, have, inside):
    """(straightness, the top row's horizontal edge, the end columns' vertical edge) of a finished tile, the edges over its mean
    gradient: the side's top is the first texel row under it, column by column, the ends its two first and last columns."""
    g = rgb.mean(axis=2)
    share, mag, gx, gy = axis_stats(g, have)
    if mag <= 0:
        return 0.0, 0.0, 0.0
    first = inside & ~np.roll(inside, 1, axis=0); first[0] = inside[0]
    band = np.zeros_like(first)
    for d in range(-2, 3):
        band |= np.roll(first, d, axis=0)
    band &= np.roll(have, 3, axis=0) | have
    et = float(gy[band].mean()) / mag if band.any() else 0.0
    ends = np.zeros_like(have); ends[:, :4] = True; ends[:, -4:] = True; ends &= have
    es = float(gx[ends].mean()) / mag if ends.any() else 0.0
    return share, et, es


def axis_share(col, ok):
    """The share of the strong gradients' energy within 10° of the vertical or the horizontal, where `ok`: a façade rectified right
    has its edges upright and level (windows, floors, corners), a skewed one or foliage has them at every angle (~0.22)."""
    g = col.mean(axis=2)
    gx, gy = sobel(g, axis=1), sobel(g, axis=0)
    m = np.hypot(gx, gy) * binary_erosion(ok, iterations=2)
    strong = m > np.percentile(m[m > 0], 70) if (m > 0).sum() > 100 else m > 0
    if strong.sum() < 50:
        return 0.0
    ang = np.degrees(np.arctan2(gy[strong], gx[strong])) % 90
    near = (ang < 10) | (ang > 80)
    return float((m[strong] * near).sum() / m[strong].sum())


def pack(tiles, size=4096, pad=4):
    """tiles: {key: RGBA array at PXM}. → (atlas RGBA, scale, {key: (x0, y0, w, h)} in atlas pixels): shelves by height, the
    tiles scaled down together until they fit, each padded with its own edge (no bleeding between tiles when mipmapped)."""
    area = sum(t.shape[0] * t.shape[1] for t in tiles.values())
    f = min(1.0, math.sqrt(0.8 * size * size / max(area, 1)))
    while True:
        dims = {k: (max(2, round(t.shape[1] * f)), max(2, round(t.shape[0] * f))) for k, t in tiles.items()}
        order = sorted(dims, key=lambda k: -dims[k][1])
        x = y = sh = 0; rect = {}; fit = True
        for k in order:
            w, h = dims[k]
            if w + 2 * pad > size:
                fit = False; break
            if x + w + 2 * pad > size:
                x = 0; y += sh; sh = 0
            if y + h + 2 * pad > size:
                fit = False; break
            rect[k] = (x + pad, y + pad, w, h); x += w + 2 * pad; sh = max(sh, h + 2 * pad)
        if fit:
            break
        f *= 0.93
    H = min(size, y + sh)
    H = 1 << math.ceil(math.log2(max(H, 2)))
    atlas = np.zeros((H, size, 4), np.uint8)
    for k, (x0, y0, w, h) in rect.items():
        t = np.asarray(Image.fromarray(tiles[k]).resize((w, h), Image.Resampling.LANCZOS))
        t = np.pad(t, ((pad, pad), (pad, pad), (0, 0)), mode="edge")
        atlas[y0 - pad:y0 + h + pad, x0 - pad:x0 + w + pad] = t
    return atlas, f, rect
