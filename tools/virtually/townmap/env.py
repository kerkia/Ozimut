"""The area being mapped and what every stage shares: its extent and raster grid, the conversions (Lambert 93 ↔ cells ↔ map mm),
the log, and a cache of each stage's result (DATA/<race>/src/stage/<name>.pkl) so that a stage can be run again alone."""
import json, os, pickle, sys, time
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import box as sbox
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent.parent
SCALE = 4000
R = 0.5                                                    # raster cell (m)
S = lambda n, sub=0: n * 1000 + sub                        # a symbol's number: 501.1 → 501001
# the ground classes (codes kept from the first generator: build.py and town_3d.py read src/classes.npz)
K = {"forest": 1, "open": 2, "open_t": 3, "rough": 4, "slow": 5, "walk": 6, "fight": 7, "paved": 8, "private": 9, "building": 10,
     "water": 11, "imp_veg": 12, "paved_t": 13, "heavy": 14}
KNAME = {v: k for k, v in K.items()}
RUNNABLE = {"forest", "open", "open_t", "rough", "slow", "walk", "paved", "paved_t", "heavy"}
BLOCKING = {"private", "building", "water", "imp_veg"}


def data_dir():
    d = os.environ.get("VIRTUAL_DATA")
    if d:
        return Path(d)
    p = HERE.parents[2] / "data" / "virtual"
    if p.exists():
        return p
    sys.path.insert(0, str(HERE.parents[1]))
    return Path(__import__("paths").DATA_DIR) / "virtual"


class Env:
    def __init__(self, race, clip=False, fresh=False):
        self.race, self.RD = race, data_dir() / race
        self.SRC = self.RD / "src"
        self.A = json.load(open(self.RD / "area.json"))
        self.X0, self.Y0, self.X1, self.Y1 = self.A["ext"]
        self.NX, self.NY = int(round((self.X1 - self.X0) / R)), int(round((self.Y1 - self.Y0) / R))
        b = self.A["box"]
        self.CX, self.CY = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        self.frame = sbox(self.X0, self.Y0, self.X1, self.Y1)
        # what the objects are cut to: the area fetched, or (clip) the area asked for — the margin still serves the computation
        self.CLIP = sbox(*b) if clip else self.frame
        self.clip = clip
        self.fresh = fresh
        self.T0 = time.time()
        self.times = []                                        # (stage, seconds)

    # ---- log -----------------------------------------------------------------------------------------------------------------
    def log(self, *a):
        print(f"[{time.time() - self.T0:5.0f}s]", *a, flush=True)

    def step(self, name):
        """A marker for the page that waits (townmap_ci.py reads « @@step <name> »)."""
        print(f"@@step {name}", flush=True)

    # ---- coordinates ---------------------------------------------------------------------------------------------------------
    def to_px(self, x, y):
        return (np.asarray(x) - self.X0) / R, (self.Y1 - np.asarray(y)) / R

    def mm(self, x, y):
        """Lambert 93 → map mm (y up) about the area's centre."""
        return (x - self.CX) * 1000 / SCALE, (y - self.CY) * 1000 / SCALE

    def transform(self):
        from rasterio.transform import from_origin
        return from_origin(self.X0, self.Y1, R, R)

    def burn(self, g, val, arr, all_touched=False):
        from rasterio.features import rasterize
        if g is None or g.is_empty:
            return arr
        m = rasterize([(g, 1)], out_shape=arr.shape, transform=self.transform(), fill=0, all_touched=all_touched, dtype="uint8")
        arr[m == 1] = val
        return arr

    def mask(self, g, all_touched=False):
        return self.burn(g, 1, np.zeros((self.NY, self.NX), np.uint8), all_touched) == 1

    def along(self, line, arr, step=0.5):
        """A raster's values along a line, every `step` m."""
        if line.length <= 0:
            return np.array([])
        pts = shapely.line_interpolate_point(line, np.arange(0, line.length + 1e-6, step))
        px, py = self.to_px(shapely.get_x(pts), shapely.get_y(pts))
        return arr[np.clip(py.astype(int), 0, self.NY - 1), np.clip(px.astype(int), 0, self.NX - 1)]

    # ---- stages --------------------------------------------------------------------------------------------------------------
    def stage(self, name, fn, cache=True):
        """Run a stage, or read its result back (TOWNMAP_FROM=<stage> runs again from that stage on; --fresh runs all)."""
        f = self.SRC / "stage" / f"{name}.pkl"
        t = time.time()
        if cache and not self.fresh and f.exists():
            out = pickle.load(open(f, "rb"))
            self.log(f"stage {name}: read back")
        else:
            self.fresh = True                                  # what follows depends on it
            out = fn()
            if cache:
                f.parent.mkdir(exist_ok=True)
                pickle.dump(out, open(f, "wb"), protocol=pickle.HIGHEST_PROTOCOL)
        self.times.append((name, round(time.time() - t, 1)))
        return out


def polys(g):
    """A geometry's polygons, as a list."""
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [q for q in getattr(g, "geoms", []) for q in polys(q)] if g.geom_type != "Polygon" else [g]


def lines(g):
    """A geometry's line strings, as a list."""
    if g is None or g.is_empty:
        return []
    if g.geom_type in ("LineString", "LinearRing"):
        return [g]
    if g.geom_type == "Polygon":
        return []
    return [q for p in getattr(g, "geoms", []) for q in lines(p)]


def area_of(g):
    """A valid geometry's surfaces only (make_valid may leave lines or points beside them)."""
    if g is None or g.is_empty:
        return shapely.Polygon()
    g = shapely.make_valid(g)
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    ps = polys(g)
    return unary_union(ps) if ps else shapely.Polygon()


def union(gs):
    gs = [g for g in gs if g is not None and not g.is_empty]
    return unary_union(gs) if gs else shapely.Polygon()


def merge_lines(g):
    """shapely's line_merge, which refuses a single line."""
    return shapely.line_merge(g) if g.geom_type in ("MultiLineString", "GeometryCollection") else g
