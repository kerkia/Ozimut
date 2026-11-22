"""The terrain's rasters at 0.5 m: the LiDAR's grids (ground, heights and returns by class; kept in src/lidar_grids.npz, which
town_3d.py reads too) and the photograph's vegetation index.

The point clouds are the files in DATA/<race>/lidar/laz/, or — a tile town_fetch.py did not download (--lidar-remote, the town
plan made on GitHub; 2026-11-22) — IGN's COPC file itself, read by HTTP range requests: the file's head and its octree's
hierarchy, then only the nodes the area touches (nodes under GAP apart in one request), the same points as from the whole file.
IGN's download service asks for a request a second: one pace for every request, a tile's requests one after the other, two
tiles at a time. A tile that cannot be read so (no range answered, the connection lost five times) is downloaded whole instead."""
import json, threading, time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter, maximum_filter

from .env import R

UA = {"User-Agent": "Ozimut Virtually builder (https://ozimut.com; contact@ozimut.com)"}
PACE_S = 1.05                    # s between two requests to IGN's download service (its stated limit: one a second)
GAP = 2 << 20                    # nodes less than this apart read in one request (a request costs a second, a MB 0.15-0.3 s)
HEAD = 1 << 16                   # the least read when the file's head and hierarchy are asked for
TRIES = 5


class RemoteError(RuntimeError):
    pass


class _Pace:
    """A request every PACE_S seconds, whatever the threads asking."""
    def __init__(self, s):
        self.s, self.last, self.lock = s, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            dt = self.s - (time.monotonic() - self.last)
            if dt > 0:
                time.sleep(dt)
            self.last = time.monotonic()


PACE = _Pace(PACE_S)
STATS = {"requests": 0, "bytes": 0}
_session = None


def session():
    global _session
    if _session is None:
        import requests
        _session = requests.Session()
        _session.headers.update(UA)
    return _session


class Remote:
    """A COPC file on IGN's server as a file object laspy's CopcReader can read (read, readinto, seek, tell): every read served
    from the blocks fetched, a missing one fetched by a range request (HEAD bytes at least); prefetch() fetches a query's ranges."""
    def __init__(self, url):
        self.url, self.pos, self.size, self.blocks = url, 0, None, []          # blocks: [(start, bytes)]
        self.requests, self.bytes = 0, 0

    def _get(self, a, b):
        """Bytes [a, b) by one range request, paced, retried on a dropped connection, a 429 or a 5xx."""
        import requests
        if self.size is not None:
            b = min(b, self.size)
        last = None
        for attempt in range(TRIES):
            PACE.wait()
            try:
                r = session().get(self.url, headers={"Range": f"bytes={a}-{b - 1}"}, timeout=180)
                if r.status_code == 429 or r.status_code >= 500:
                    last = f"HTTP {r.status_code}"
                    time.sleep(float(r.headers.get("Retry-After") or 0) or 3 * (attempt + 1))
                    continue
                if r.status_code != 206:
                    raise RemoteError(f"HTTP {r.status_code} to a range request (ranges not served?)")
                total = (r.headers.get("Content-Range") or "").rpartition("/")[2]
                if total.isdigit():
                    self.size = int(total)
                    b = min(b, self.size)
                data = r.content
                self.requests += 1; self.bytes += len(data)
                STATS["requests"] += 1; STATS["bytes"] += len(data)
                if len(data) != b - a:
                    last = f"{len(data)} bytes of {b - a}"
                    time.sleep(3 * (attempt + 1))
                    continue
                return data
            except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as ex:
                last = ex
                time.sleep(3 * (attempt + 1))
        raise RemoteError(f"{TRIES} tries: {last}")

    def _have(self, a, n):
        for s, d in self.blocks:
            if s <= a and a + n <= s + len(d):
                return memoryview(d)[a - s:a - s + n]
        return None

    def read(self, n=-1):
        if n is None or n < 0:
            raise RemoteError("a read to the file's end")
        if n == 0:
            return b""
        got = self._have(self.pos, n)
        if got is None:
            d = self._get(self.pos, self.pos + max(n, HEAD))
            self.blocks.append((self.pos, d))
            got = memoryview(d)[:n]
            if len(got) < n:
                raise RemoteError("read past the file's end")
        self.pos += n
        return bytes(got)

    def readinto(self, buf):
        n = len(buf)
        buf[:] = self.read(n)
        return n

    def seek(self, pos, whence=0):
        if whence == 0:
            self.pos = pos
        elif whence == 1:
            self.pos += pos
        else:
            if self.size is None:
                raise RemoteError("seek from the end before the size is known")
            self.pos = self.size + pos
        return self.pos

    def tell(self):
        return self.pos

    def seekable(self):
        return True

    def readable(self):
        return True

    def prefetch(self, ranges):
        """The byte ranges [(start, end)] a query will read: those under GAP apart joined, each fetched once."""
        spans = []
        for a, b in sorted(ranges):
            if spans and a - spans[-1][1] <= GAP:
                spans[-1][1] = max(spans[-1][1], b)
            else:
                spans.append([a, b])
        for a, b in spans:
            if self._have(a, b - a) is None:
                self.blocks.append((a, self._get(a, b)))

    def close(self):
        self.blocks = []


def _download(url, dest, log):
    """A tile whole, as town_fetch.py does without --lidar-remote (paced, retried)."""
    import requests
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(4):
        PACE.wait()
        try:
            with session().get(url, timeout=600, stream=True) as r:
                r.raise_for_status()
                with open(part, "wb") as f:
                    for ch in r.iter_content(1 << 20):
                        f.write(ch)
            part.replace(dest)
            return dest
        except requests.RequestException as ex:
            log("  download retry", attempt + 1, ex)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"IGN LiDAR HD: neither read by ranges nor downloaded: {url}")


def tiles(env):
    """The point clouds: (name, local file or None, url or None), by name. A local file wins; a tile of src/lidar.json without
    one is read on IGN's server."""
    laz = env.RD / "lidar" / "laz"
    out = {f.name.split(".")[0]: (f, None) for f in (laz.glob("*.laz") if laz.exists() else [])}
    cat = env.SRC / "lidar.json"
    if cat.exists():
        for tid, c in json.load(open(cat, encoding="utf-8")).items():
            if tid not in out and c.get("laz"):
                out[tid] = (None, c["laz"])
    return [(k, *out[k]) for k in sorted(out)]


def grids(env):
    cache = env.SRC / "lidar_grids.npz"
    if cache.exists():
        return dict(np.load(cache))
    import laspy
    from laspy import DecompressionSelection as D
    from laspy.copc import Bounds, load_octree_for_query
    X0, Y0, X1, Y1, NX, NY = env.X0, env.Y0, env.X1, env.Y1, env.NX, env.NY
    N = NX * NY
    gs, gc = np.zeros(N), np.zeros(N)
    zmax = {k: np.full(N, -1e9, np.float32) for k in ("v", "b", "o")}  # vegetation 3-5, building 6, other non-ground
    cnt = {k: np.zeros(N, np.int32) for k in (0, 2, 3, 4, 5, 6)}
    roofs = []
    SEL = D.XY_RETURNS_CHANNEL | D.Z | D.CLASSIFICATION
    bounds = Bounds(mins=np.array([X0, Y0], float), maxs=np.array([X1, Y1], float))

    def chunks(f):
        """The points within the area: a COPC file read by its octree (only the nodes the area touches, only the fields used),
        else every point in chunks."""
        try:
            rd = laspy.CopcReader.open(f, decompression_selection=SEL)
        except Exception:
            rd = None
        if rd is not None:
            with rd:
                yield rd.query(bounds)
            return
        with laspy.open(f) as rd:
            yield from rd.chunk_iterator(4_000_000)

    def opened(url):
        """IGN's file opened remotely, the area's nodes fetched (a worker thread: the network only)."""
        t0 = time.monotonic()
        src = Remote(url)
        rd = laspy.CopcReader(src, decompression_selection=SEL)
        nodes = load_octree_for_query(rd.source, rd.copc_info, rd.root_page,
                                      query_bounds=bounds.ensure_3d(rd.header.mins, rd.header.maxs))
        src.prefetch([(n.offset, n.offset + n.byte_size) for n in nodes])
        return rd, src, len(nodes), time.monotonic() - t0

    def fetch(tile):
        name, f, url = tile
        if f is not None:
            return tile, None
        try:
            return tile, opened(url)
        except Exception as ex:                                  # anything: the tile downloaded whole instead
            return tile, ex

    work = tiles(env)
    with ThreadPoolExecutor(2) as pool:                          # two tiles at a time; the points added in the tiles' order
        for i, fut in enumerate([pool.submit(fetch, t) for t in work]):
            (name, f, url), got = fut.result()
            if isinstance(got, tuple):
                rd, src, nn, dt = got
                try:
                    with rd:
                        parts = [rd.query(bounds)]
                    env.log("LiDAR", name, f"read on IGN's server: {nn} nodes, {src.requests} requests, {src.bytes / 1e6:.1f} MB",
                            f"of {(src.size or 0) / 1e6:.0f}, {dt:.0f} s")
                except Exception as ex:
                    got = ex
            if isinstance(got, Exception):
                env.log("LiDAR", name, f"not read by ranges ({got}): downloaded whole")
                f = _download(url, env.RD / "lidar" / "laz" / f"{name}.copc.laz", env.log)
            if f is not None:
                parts = chunks(f)
            for ch in parts:
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
            parts = None
            env.log("LiDAR", name)
            print(f"@@tile {i + 1} {len(work)}", flush=True)           # townmap_ci.py moves the bar on
    if STATS["requests"]:
        env.log("LiDAR read on IGN's server:", STATS["requests"], "requests,", f"{STATS['bytes'] / 1e6:.1f} MB")
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
