"""Cartographier's « Plan de ville (sprint) » made on GitHub (.github/workflows/townmap.yml; owner, 2026-11-12: one engine for a
town's sprint map — the generator Pixel's races use —, quality before speed): each request the site wrote (functions/api/townmap:
R2 townmap/req/<id>.json, { id, lat, lon, w, h, by, at, status }) made by town_fetch.py (IGN's LiDAR HD, BD TOPO, BD ORTHO and
its infrared, the cadastre, OpenStreetMap) and town_map.py --clip --no-check (the ISSprOM 2019-2 objects, cut to the area asked
for; no legibility check: the developer's tests, owner 2026-11-18), the objects written gzipped to R2 townmap/out/<id>.json.gz, the request marked done or
failed, its progress written into it as it goes.

  python tools/virtually/townmap_ci.py --reqs <folder of the requests> --work <work folder>
  (env BUCKET=s3://cn-state, R2=<endpoint>: the aws CLI's address, AWS_* as lidarmap.yml; BUCKET=file://<folder> on the PC)

  python tools/virtually/townmap_ci.py --setup --reqs <folder>      (the job's first step: the queued requests marked « setup »)

Requests and results older than 30 days are deleted. The work folder (the point clouds: hundreds of MB a km²) goes after each.

What the page is told (2026-11-12, the owner saw « waiting for a computing server » then « computing the map · 8:34 » and nothing
in between): « setup » while the runner GitHub started installs Python's libraries, then « fetch » with the sources still awaited
(town_fetch.py's « @@done <source> », the sources being read at the same time), then « map » with the computation's step
(town_map.py's « @@step <name> »), then « upload ». Measured on the PC for 500 × 500 m of Gif-sur-Yvette: the sources 2:14 → about
1:30 (Overpass alone, read beside the rest), the map 95 s → about 55 s (the point clouds read by their COPC octree, only the area)."""
import argparse, gzip, json, math, os, shutil, subprocess, sys, threading, time, traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ci                                                            # noqa: E402  (aws, get, put_json, run: the same R2 helpers)

PY = sys.executable
Q, OUT = "townmap/req/", "townmap/out/"
# the stages and their share of the bar
STAGES = {"queued": (0.0, 0.0), "setup": (0.0, 0.0), "fetch": (0.0, 0.45), "map": (0.45, 0.95), "upload": (0.95, 1.0)}
SOURCES = ["lidar", "bdtopo", "ortho", "cadastre", "osm"]          # town_fetch.py's sources, as it names them
KEEP_DAYS = 30
now_iso = lambda: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
age_days = lambda iso: (time.time() - time.mktime(time.strptime((iso or "1970-01-01T00:00:00")[:19], "%Y-%m-%dT%H:%M:%S"))) / 86400


class Progress:
    """The request's stage and share done, written to R2 at most every 8 s (and at each new stage)."""
    def __init__(self, req: dict):
        self.req, self.last, self.extra = req, 0.0, {}

    def __call__(self, stage: str, inner: float = 0.0, note: str = "", force: bool = False):
        a, b = STAGES[stage]
        self.req["progress"] = {"stage": stage, "frac": round(a + (b - a) * max(0.0, min(1.0, inner)), 3), "note": note[:200], "at": now_iso(),
                                **self.extra}
        now = time.monotonic()
        if now - self.last > 8 or inner == 0.0 or force:
            self.last = now
            try:
                ci.put_json(f"{Q}{self.req['id']}.json", self.req)
            except Exception:
                pass


def stream(cmd: list, prog: Progress, stage: str, est: float, on_line=None, **kw) -> str:
    """A step whose output is read as it comes: on_line(line) for each line (the « @@ » markers), the bar creeping toward the
    stage's end by its usual time meanwhile. Returns the output; raises with its last line when the step fails."""
    print("$", " ".join(map(str, cmd)), flush=True)
    t0, done, lines = time.monotonic(), threading.Event(), []

    def tick():
        while not done.wait(6):
            prog(stage, 1 - math.exp(-(time.monotonic() - t0) / est))
    th = threading.Thread(target=tick, daemon=True); th.start()
    try:
        pr = subprocess.Popen([str(c) for c in cmd], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                              errors="replace", **kw)
        for line in pr.stdout:
            line = line.rstrip("\n")
            print(line, flush=True)
            lines.append(line)
            if on_line and line.startswith("@@"):
                try:
                    on_line(line)
                except Exception as ex:                                  # a marker misread never stops the map
                    print("marker:", ex)
        pr.wait()
    finally:
        done.set()
    if pr.returncode:
        step = next((Path(str(c)).name for c in cmd if str(c).endswith(".py")), cmd[0])
        last = [l for l in lines if l.strip() and not l.startswith("@@")][-1:] or [""]
        raise RuntimeError(f"{step}: {last[0][-240:]}")
    return "\n".join(lines)


def make(req: dict, work: Path) -> dict:
    """One request: the open data fetched, the map made, the objects uploaded. Returns the result's summary."""
    rid, prog = req["id"], Progress(req)
    # the photographs at 0.5 m, as town_map.py reads them (Virtually's 0.2 m: six times the pixels for nothing here)
    env = {**os.environ, "VIRTUAL_DATA": str(work), "PYTHONIOENCODING": "utf-8", "TOWN_ORTHO_PPM": "2"}
    w, h = max(100, min(2000, float(req["w"]))), max(100, min(2000, float(req["h"])))
    if not ci.in_france(float(req["lat"]), float(req["lon"])):          # the API's box is rough: the border itself here
        raise RuntimeError("outside metropolitan France (IGN's data)")
    pending = list(SOURCES)
    prog.extra = {"pending": list(pending)}
    prog("fetch", 0, "IGN LiDAR HD, BD TOPO, BD ORTHO, cadastre, OpenStreetMap")

    def fetched(line: str):
        parts = line.split()
        if parts[0] == "@@done" and parts[1] in pending:
            pending.remove(parts[1])
            prog.extra = {"pending": list(pending)}
        elif parts[0] == "@@retry" and parts[1] == "osm":
            prog.extra = {"pending": list(pending), "osmTry": int(parts[2])}
        prog("fetch", 1 - len(pending) / len(SOURCES), force=True)
    t0 = time.monotonic()
    stream([PY, HERE / "town_fetch.py", rid, req["lat"], req["lon"], w, h], prog, "fetch", est=40 + w * h / 8000, on_line=fetched, env=env, cwd=HERE)
    timing = {"fetch": round(time.monotonic() - t0)}
    if not json.load(open(work / rid / "src" / "lidar.json", encoding="utf-8")):
        raise RuntimeError("no IGN LiDAR HD over this area yet")
    prog.extra = {"step": "points"}
    prog("map", 0)

    def stepped(line: str):
        parts = line.split()
        if parts[0] == "@@step":
            prog.extra = {"step": parts[1]}
            prog("map", STEPS.get(parts[1], 0), force=True)
    t0 = time.monotonic()
    stream([PY, HERE / "town_map.py", rid, "--clip", "--no-check"], prog, "map", est=30 + w * h / 5000, on_line=stepped, env=env, cwd=HERE)
    timing["map"] = round(time.monotonic() - t0)
    prog.extra = {}
    rd = work / rid
    out = json.load(open(rd / "map_objects.json", encoding="utf-8"))
    area = json.load(open(rd / "area.json", encoding="utf-8"))
    lidar = json.load(open(rd / "src" / "lidar.json", encoding="utf-8")) if (rd / "src" / "lidar.json").exists() else {}
    out.update(area=area["box"], made=now_iso(), lidar={k: v.get("date", "") for k, v in lidar.items()},
               cadastre="pci" if (rd / "src" / "parcelles_pci.json").exists() else "etalab")
    prog("upload", 0)
    data = gzip.compress(json.dumps(out, separators=(",", ":")).encode("utf-8"))
    ci.aws("cp", "-", f"{ci.BUCKET}/{OUT}{rid}.json.gz", "--content-type", "application/json", data=data)
    return {"objects": len(out["objects"]), "bytes": len(data), "lidar": sorted(set(out["lidar"].values())), "s": timing}


# town_map.py's steps and the share of the map's time they usually start at (500 × 500 m of Gif, 2026-11-12)
STEPS = {"points": 0.0, "photo": 0.1, "vectors": 0.12, "areas": 0.2, "enclosures": 0.35, "lines": 0.45, "contours": 0.75,
         "objects": 0.82}


def setup(reqs: Path):
    """The job's first step: every request still waiting marked « setup » (the runner is installing Python's libraries), so that
    the page says so instead of « waiting for a server »."""
    for f in sorted(reqs.glob("*.json")):
        r = json.load(open(f, encoding="utf-8"))
        if r.get("status") == "queued" and not r.get("progress"):
            r["progress"] = {"stage": "setup", "frac": 0, "at": now_iso()}
            try:
                ci.put_json(f"{Q}{r['id']}.json", r)
            except Exception as ex:
                print("setup mark:", ex)


def sweep(reqs: list):
    """Requests and results older than KEEP_DAYS deleted (their objects were imported long ago or never will be)."""
    for r in reqs:
        if age_days(r.get("at")) > KEEP_DAYS:
            ci.aws("rm", f"{ci.BUCKET}/{Q}{r['id']}.json", check=False)
            ci.aws("rm", f"{ci.BUCKET}/{OUT}{r['id']}.json.gz", check=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reqs", required=True, type=Path)
    ap.add_argument("--work", type=Path)
    ap.add_argument("--setup", action="store_true", help="only mark the waiting requests « setup »")
    a = ap.parse_args()
    if a.setup:
        return setup(a.reqs)
    reqs = sorted((json.load(open(f, encoding="utf-8")) for f in a.reqs.glob("*.json")), key=lambda r: r.get("at", ""))
    sweep(reqs)
    # the queued ones, and those a run stopped short (no word of them for three hours)
    todo = [r for r in reqs if r.get("status") == "queued" and (not r.get("progress") or r["progress"].get("stage") == "setup"
                                                              or age_days(r["progress"].get("at")) > 0.125)]
    print(len(todo), "town maps to make", flush=True)
    for req in todo:
        t0 = time.monotonic()
        try:
            req.update(status="done", result=make(req, a.work), done=now_iso(), progress=None)
            print(req["id"], "done in", round(time.monotonic() - t0), "s", req["result"], flush=True)
        except Exception as ex:
            traceback.print_exc()
            req.update(status="failed", error=str(ex)[:300], done=now_iso(), progress=None)
        ci.put_json(f"{Q}{req['id']}.json", req)
        shutil.rmtree(a.work / req["id"], ignore_errors=True)


if __name__ == "__main__":
    main()
