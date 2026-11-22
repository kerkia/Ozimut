"""The terrain's rasters at 0.5 m: the LiDAR's grids (ground, heights and returns by class; kept in src/lidar_grids.npz, which
town_3d.py reads too) and the photograph's vegetation index."""
from types import SimpleNamespace

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, maximum_filter

from .env import R


def grids(env):
    cache = env.SRC / "lidar_grids.npz"
    if cache.exists():
        return dict(np.load(cache))
    import laspy
    X0, Y0, X1, Y1, NX, NY = env.X0, env.Y0, env.X1, env.Y1, env.NX, env.NY
    N = NX * NY
    gs, gc = np.zeros(N), np.zeros(N)
    zmax = {k: np.full(N, -1e9, np.float32) for k in ("v", "b", "o")}  # vegetation 3-5, building 6, other non-ground
    cnt = {k: np.zeros(N, np.int32) for k in (0, 2, 3, 4, 5, 6)}
    roofs = []

    def chunks(f):
        """The points within the area: a COPC file read by its octree (only the nodes the area touches, only the fields used),
        else every point in chunks."""
        from laspy import DecompressionSelection as D
        try:
            rd = laspy.CopcReader.open(f, decompression_selection=D.XY_RETURNS_CHANNEL | D.Z | D.CLASSIFICATION)
        except Exception:
            rd = None
        if rd is not None:
            with rd:
                yield rd.query(laspy.copc.Bounds(mins=np.array([X0, Y0], float), maxs=np.array([X1, Y1], float)))
            return
        with laspy.open(f) as rd:
            yield from rd.chunk_iterator(4_000_000)
    for f in sorted((env.RD / "lidar" / "laz").glob("*.laz")):
        for ch in chunks(f):
            x, y = np.asarray(ch.x), np.asarray(ch.y)
            m = (x >= X0) & (x < X1) & (y > Y0) & (y <= Y1)
            if not m.any():
                continue
            x, y, z, c = x[m], y[m], np.asarray(ch.z)[m], np.asarray(ch.classification)[m]
            px, py = env.to_px(x, y); idx = py.astype(np.int64) * NX + px.astype(np.int64)
            cnt[0] += np.bincount(idx[c != 7], minlength=N).astype(np.int32)
            for k in (2, 3, 4, 5, 6):
                cnt[k] += np.bincount(idx[c == k], minlength=N).astype(np.int32)
            g = c == 2
            gs += np.bincount(idx[g], weights=z[g], minlength=N); gc += np.bincount(idx[g], minlength=N)
            for key, sel in (("v", (c >= 3) & (c <= 5)), ("b", c == 6), ("o", (c == 1) | (c == 9) | (c == 17) | (c >= 64) & (c <= 66))):
                np.maximum.at(zmax[key], idx[sel], z[sel].astype(np.float32))
            b = c == 6
            roofs.append(np.c_[x[b] - X0, y[b] - Y0, z[b]].astype(np.float32))
        env.log("LiDAR", f.name)
    dtm = np.where(gc > 0, gs / np.maximum(gc, 1), np.nan).reshape(NY, NX)
    # holes (under buildings): the nearest ground, smoothed
    _, (ri, ci) = distance_transform_edt(np.isnan(dtm), return_indices=True)
    dtm = gaussian_filter(dtm[ri, ci], 1.0)
    Z = {"dtm": dtm.astype(np.float32), **{f"z{k}": v.reshape(NY, NX) for k, v in zmax.items()},
         **{f"n{k}": v.reshape(NY, NX) for k, v in cnt.items()}}
    np.savez_compressed(cache, **Z); np.save(env.SRC / "roofpts.npy", np.concatenate(roofs))
    return Z


def mosaic(env, tag):
    """town_fetch.py's photographs put together at the raster's resolution (ortho_… at 5 pixels a metre, ortho<ppm>_… else)."""
    W, H = env.NX, env.NY
    out = np.zeros((H, W, 3), np.uint8)
    for f in env.SRC.glob(f"ortho*_{tag}_*.jpg"):
        pre, _, x0, y0 = f.stem.split("_"); x0, y0 = int(x0), int(y0)
        ppm = float(pre[5:] or 5)
        im = Image.open(f).convert("RGB")
        w_m, h_m = im.width / ppm, im.height / ppm
        im = im.resize((int(round(w_m / R)), int(round(h_m / R))), Image.BILINEAR, reducing_gap=2.0)
        c, r = int(round((x0 - env.X0) / R)), int(round((env.Y1 - (y0 + h_m)) / R))
        a = np.asarray(im); out[r:r + a.shape[0], c:c + a.shape[1]] = a[: H - r, : W - c]
    return out


def load(env):
    Z = grids(env)
    t = SimpleNamespace()
    t.dtm = Z["dtm"]
    t.chm = np.where(Z["zv"] > -1e8, Z["zv"] - t.dtm, 0).astype(np.float32)   # the vegetation's height above the ground
    t.n4, t.n5 = Z["n4"], Z["n5"]
    # the highest non-vegetation returns (walls, fences), for their height along a line
    t.zo = np.maximum(maximum_filter(Z["zo"], 3), maximum_filter(Z["zb"], 3))
    irc = mosaic(env, "irc").astype(np.float32)
    t.ndvi = gaussian_filter((irc[..., 0] - irc[..., 1]) / (irc[..., 0] + irc[..., 1] + 1), 0.7)
    t.lum = mosaic(env, "rgb").astype(np.float32).mean(axis=2)
    env.log("terrain", t.dtm.shape, f"ground {t.dtm.min():.1f}-{t.dtm.max():.1f} m", f"NDVI {np.percentile(t.ndvi, 5):.2f}…{np.percentile(t.ndvi, 95):.2f}")
    return t


def height_of(env, t, line):
    """A wall or fence's height above the ground: the median of the highest non-vegetation returns along it."""
    v = env.along(line, t.zo) - env.along(line, t.dtm)
    v = v[(v > 0.2) & (v < 8)]
    return float(np.median(v)) if len(v) > 3 else 0.0
