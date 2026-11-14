"""« Virtually »'s events built on GitHub (.github/workflows/virtually.yml; owner, 2026-11-11): each build the site asked for
(functions/api/virtual/events: R2 virtual-build/<id>.json) made into a race package (R2 virtual-ev/<id>/), the event's record
(virtual-events/<id>.json) marked ready or failed, the progress written back into the request as it goes (the Orga tab shows it).

  python tools/virtually/ci.py --reqs <folder of the requests> --work <work folder> --kp <pullauta>
  (env BUCKET=s3://cn-state, R2=<endpoint>: the aws CLI's address; AWS_* as lidarmap.yml)

An organiser's event: their OCAD map (virtual-events/<id>/map.ocd, never published but as the game's map) through dump.mjs and
build.py — in France with IGN's LiDAR HD under it when there is some (the ground and the trees), elsewhere the map's relief —,
then the courses: the organiser's own (coursefile.mjs + filecourses.py) or six proposed (course.py). An administrator's event
from the LiDAR alone (area { lat, lon, size }): mapgen's tiles (karttapullautin + OpenStreetMap) and lidarrace.py first."""
import argparse, json, math, os, shutil, subprocess, sys, threading, time, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
BUCKET = os.environ.get("BUCKET", "s3://cn-state").rstrip("/")
R2 = os.environ.get("R2", "")
PY = sys.executable
sys.stdout.reconfigure(encoding="utf-8", errors="replace"); sys.stderr.reconfigure(encoding="utf-8", errors="replace")
os.environ["PYTHONIOENCODING"] = "utf-8"                 # the steps' output (course names in any language)
# the stages and their share of the bar
STAGES = {"queued": (0, 0.0), "files": (0.0, 0.03), "lidar": (0.03, 0.30), "map": (0.30, 0.45), "build": (0.45, 0.80),
          "courses": (0.80, 0.95), "upload": (0.95, 1.0)}


LOCAL = Path(BUCKET[7:]) if BUCKET.startswith("file://") else None      # a local folder standing for R2 (tests on the PC)


def aws(*args, data: bytes | None = None, check=True):
    if LOCAL:
        op, src, dst = args[0], args[1], args[2] if len(args) > 2 else None
        loc = lambda u: LOCAL / u[len(BUCKET) + 1:]
        try:
            if op == "rm":
                loc(src).unlink(missing_ok=True)
            elif src == "-":
                loc(dst).parent.mkdir(parents=True, exist_ok=True); loc(dst).write_bytes(data)
            elif src.startswith(BUCKET):
                shutil.copyfile(loc(src), dst)
            else:
                loc(dst).parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src, loc(dst))
            return subprocess.CompletedProcess(args, 0)
        except OSError as ex:
            if check:
                raise
            return subprocess.CompletedProcess(args, 1, b"", str(ex).encode())
    cmd = ["aws", "s3", *args] + (["--endpoint-url", R2] if R2 else []) + ["--only-show-errors"]
    return subprocess.run(cmd, input=data, check=check, capture_output=True)


def get(key: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    return aws("cp", f"{BUCKET}/{key}", str(dest), check=False).returncode == 0


def put_json(key: str, obj: dict, meta: dict | None = None):
    args = ["cp", "-", f"{BUCKET}/{key}", "--content-type", "application/json"]
    if meta:
        args += ["--metadata", ",".join(f"{k}={v}" for k, v in meta.items())]
    aws(*args, data=json.dumps(obj).encode())


class Progress:
    """The request's stage and share done, written to R2 at most every 8 s (and at each stage)."""
    def __init__(self, req: dict):
        self.req, self.last, self.stage, self.inner = req, 0.0, "queued", 0.0

    def __call__(self, stage: str, inner: float = 0.0, note: str = ""):
        self.stage, self.inner = stage, max(0.0, min(1.0, inner))
        a, b = STAGES[stage]
        self.req.update(stage=stage, frac=round(a + (b - a) * self.inner, 3), note=note[:200], at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        now = time.monotonic()
        if now - self.last > 8 or inner == 0.0:
            self.last = now
            try:
                put_json(f"virtual-build/{self.req['id']}.json", self.req)
            except Exception:
                pass


def run(cmd: list, prog: Progress | None = None, stage: str = "", est: float = 60.0, **kw):
    """A step, its output kept; the bar creeping toward the stage's end by its usual time meanwhile."""
    print("$", " ".join(map(str, cmd)), flush=True)
    t0, done = time.monotonic(), threading.Event()

    def tick():
        while not done.wait(6):
            if prog:
                prog(stage, 1 - math.exp(-(time.monotonic() - t0) / est))
    th = threading.Thread(target=tick, daemon=True); th.start()
    try:
        r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    finally:
        done.set()
    print(r.stdout[-4000:], r.stderr[-4000:], flush=True)
    if r.returncode:
        step = next((Path(str(c)).name for c in cmd if str(c).endswith((".py", ".mjs")) and "shim" not in str(c)), cmd[0])
        last = [l for l in (r.stderr or r.stdout).strip().splitlines() if l.strip()][-1:] or [""]
        raise RuntimeError(f"{step}: {last[0][-240:]}")
    return r.stdout


def in_france(lat: float, lon: float) -> bool:
    """Metropolitan France, by its simplified border (mapgen.grids, the browser's own)."""
    from mapgen import grids
    for ring in grids._rings("fr"):
        inside = False
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            for px, py in ((lon, lat),):
                if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / ((y2 - y1) or 1e-12) + x1:
                    inside = not inside
        if inside:
            return True
    return False


def map_corners(rd: Path):
    """The OCAD map's corners in lat/lon (build.py's frame: its objects' 0.1-99.9 percentiles)."""
    import numpy as np
    from pyproj import Transformer
    D = json.load(open(rd / "map.json"))
    RW, K = D["realWorld"], D["scale"] / 1000
    zone = RW.get("zone") or 0
    epsg = (32700 + (-zone - 2000)) if zone < -2000 else (32600 + zone - 2000) if 2000 < zone < 2100 else 2154
    pts = np.array([[c[0] / 100, c[1] / 100] for o in D["objs"] if 100 <= o["sym"] // 1000 < 600 for c in o["c"]])
    if not len(pts) or not (RW.get("x") or RW.get("y")):
        return None
    lo, hi = np.percentile(pts, 0.1, axis=0), np.percentile(pts, 99.9, axis=0)
    a = -(RW.get("angle") or 0) * math.pi / 180
    to_ll = Transformer.from_crs(epsg, 4326, always_xy=True)
    out = []
    for mx in (lo[0], hi[0]):
        for my in (lo[1], hi[1]):
            X, Y = mx * K, my * K
            lon, lat = to_ll.transform(X * math.cos(a) - Y * math.sin(a) + RW["x"], X * math.sin(a) + Y * math.cos(a) + RW["y"])
            out.append((lat, lon))
    return out


def france_lidar(corners, laz: Path, prog: Progress, max_tiles: int = 12, cache: Path | None = None) -> int:
    """IGN's LiDAR HD point clouds under a map in France (mapgen's catalogue), into laz/ (linked from cache/, kept for the
    run's other builds); the number of clouds."""
    import httpx
    from mapgen import grids, run as mg
    ids = grids.ids_for("fr", corners, margin=100)
    if len(ids) > max_tiles:
        print("LiDAR: the map covers", len(ids), "tiles: none fetched"); return 0
    http = httpx.Client(timeout=120, headers={"User-Agent": mg.UA})
    cat, pace, n = mg.catalogue(ids, http), mg.Pace(), 0
    laz.mkdir(parents=True, exist_ok=True)
    for k, t in enumerate(ids):
        if t in cat and cat[t]["laz"]:
            for attempt in range(3):
                try:
                    src = mg.fetch(http, cat[t]["laz"], (cache or laz) / f"LHD_{t}.copc.laz", pace)
                    if cache:
                        try:
                            os.link(src, laz / src.name)
                        except OSError:
                            shutil.copyfile(src, laz / src.name)
                    n += 1; break
                except Exception as ex:
                    print(t, "attempt", attempt + 1, ex)
        prog("lidar", (k + 1) / len(ids), f"{k + 1}/{len(ids)}")
    return n


def build_one(req: dict, work: Path, kp: str):
    eid = req["id"]
    prog = Progress(req)
    data = work / "virtual"; rd = data / eid
    shutil.rmtree(rd, ignore_errors=True); rd.mkdir(parents=True)
    env = {**os.environ, "VIRTUAL_DATA": str(data)}
    ev_path = work / f"{eid}.event.json"
    if not get(f"virtual-events/{eid}.json", ev_path):
        raise RuntimeError("the event is gone")
    ev = json.load(open(ev_path, encoding="utf-8"))
    prog("files")
    extra = None
    # a race from the LiDAR alone whose organiser sent back the generated OCAD map, edited: built from that map as any OCAD event
    edited = ev.get("source") == "lidar" and get(f"virtual-events/{eid}/map.ocd", rd / "map.ocd")
    if ev.get("source") == "lidar" and not edited:
        a = ev["area"]
        prog("lidar", 0, "mapgen")
        run([PY, HERE / "lidarrace.py", eid, str(a["lat"]), str(a["lon"]), str(a.get("size", 2000)), "--kp", kp,
             "--work", work / "mapgen"], prog, "lidar", est=900, env=env)
        prog("map", 1)
        if (rd / "lidar.ocd").exists():                   # the same map as an OCAD file, for the organiser to edit (never published)
            aws("cp", str(rd / "lidar.ocd"), f"{BUCKET}/virtual-events/{eid}/lidar.ocd")
    else:
        if not edited and not get(f"virtual-events/{eid}/map.ocd", rd / "map.ocd"):
            raise RuntimeError("no map")
        for f in ("courses.xml", "courses.ocd"):
            if get(f"virtual-events/{eid}/{f}", rd / f):
                extra = rd / f
        prog("map", 0)
        run(["node", "--import", (ROOT / "tools/mapper/shim.mjs").as_uri(), HERE / "dump.mjs", rd / "map.ocd", rd / "map.json"], prog, "map", est=30)
        corners = map_corners(rd)
        if corners and in_france(*corners[0]):
            prog("lidar", 0, "IGN LiDAR HD")
            try:
                (work / "lidarcache").mkdir(parents=True, exist_ok=True)
                france_lidar(corners, rd / "lidar" / "laz", prog, cache=work / "lidarcache")
            except Exception as ex:
                print("LiDAR:", ex)
    prog("build", 0)
    run([PY, HERE / "build.py", eid], prog, "build", est=300, env=env)
    prog("courses", 0)
    if not (ev.get("source") == "lidar" and not edited) and ev.get("coursesFrom") == "file":
        run(["node", "--import", (ROOT / "tools/mapper/shim.mjs").as_uri(), HERE / "coursefile.mjs", rd / "map.ocd", rd / "courses.json"]
            + ([extra] if extra else []), prog, "courses", est=20)
        run([PY, HERE / "filecourses.py", eid, rd / "courses.json"], prog, "courses", est=20, env=env)
    else:
        run([PY, HERE / "course.py", eid, "7", "40"], prog, "courses", est=240, env=env)
    race = json.load(open(rd / "pkg" / "race.json", encoding="utf-8"))
    if (rd / "thumb.webp").exists():                      # the page's card (lidarrace.py: the generated map, small)
        shutil.copyfile(rd / "thumb.webp", rd / "pkg" / "thumb.webp")
    elif os.environ.get("CHROME") or os.name == "nt":       # an OCAD map's: drawn by the site's renderer in a headless browser
        try:
            run(["node", HERE / "thumb.mjs", eid, "640"], prog, "courses", est=30, env=env)
        except Exception as ex:
            print("thumbnail:", ex)
    if not race.get("courses"):
        raise RuntimeError("no course could be set on this map")
    prog("upload", 0)
    # as published (pkggz.py): map.ocd also gzipped, race.json naming it, uploaded last
    from pkggz import publish_list
    for name, f in publish_list(rd / "pkg", rd / "publish"):
        aws("cp", str(f), f"{BUCKET}/virtual-ev/{eid}/{name}")
    # the event's record again (it may have changed meanwhile: its settings kept), ready
    get(f"virtual-events/{eid}.json", ev_path)
    ev = json.load(open(ev_path, encoding="utf-8"))
    ev.update(status="ready", error="", std=race.get("std", ""), scale=race.get("scale", 0), lonlat=race.get("lonlat"),
              courses=[{"id": c["id"], "name": c.get("name", ""), "controls": c["controls"], "length": c.get("length", 0),
                        "climb": c.get("climb", 0)} for c in race["courses"]],
              thumb=(rd / "pkg" / "thumb.webp").exists(), lidarOcd=bool(ev.get("lidarOcd") or (rd / "lidar.ocd").exists()),
              edited=bool(edited), built=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    return ev


def save_event(ev: dict):
    put_json(f"virtual-events/{ev['id']}.json", ev, {"by": ev["by"], "t": ev["type"], "s": ev["status"], "p": "1" if ev.get("published") else "0"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reqs", required=True, type=Path)
    ap.add_argument("--work", required=True, type=Path)
    ap.add_argument("--kp", default=shutil.which("pullauta") or "pullauta")
    a = ap.parse_args()
    reqs = sorted((json.load(open(f, encoding="utf-8")) for f in a.reqs.glob("*.json")), key=lambda r: r.get("at", ""))
    stale = lambda r: time.time() - time.mktime(time.strptime(r.get("at", "1970-01-01T00:00:00Z")[:19], "%Y-%m-%dT%H:%M:%S")) > 3 * 3600
    # the queued ones, and those a run stopped short (no word of them for three hours)
    reqs = [r for r in reqs if r.get("stage") in (None, "queued") or stale(r)]
    print(len(reqs), "builds", flush=True)
    for req in reqs:
        eid = req["id"]
        t0 = time.monotonic()
        try:
            ev = build_one(req, a.work, a.kp)
            save_event(ev)
            print(eid, "ready in", round(time.monotonic() - t0), "s", flush=True)
        except Exception as ex:
            traceback.print_exc()
            p = a.work / f"{eid}.event.json"
            if get(f"virtual-events/{eid}.json", p):
                ev = json.load(open(p, encoding="utf-8"))
                ev.update(status="failed", error=str(ex)[:300])
                save_event(ev)
        aws("rm", f"{BUCKET}/virtual-build/{eid}.json", check=False)
        shutil.rmtree(a.work / "virtual" / eid, ignore_errors=True)


if __name__ == "__main__":
    main()
