"""The open data of a town for a sprint race of « Virtually » (town_map.py, then the usual build.py, then town_3d.py), into
DATA/<race>/src/ (outside git; DATA = paths.DATA_DIR / "virtual", or env VIRTUAL_DATA):

  py town_fetch.py <race> <lat> <lon> <width m> <height m> [--lidar-remote]

- IGN LiDAR HD: the classified point clouds (COPC LAZ) of the 1 km tiles the area touches, into DATA/<race>/lidar/laz/ where
  build.py reads them (Licence Ouverte 2.0; the tile list from IGN's public WFS, one download a second, as mapgen does);
  --lidar-remote (the town plan made on GitHub, townmap_ci.py; 2026-11-22): the tiles are not downloaded, src/lidar.json keeps
  their addresses (« remote »), and townmap/terrain.py reads only the area's points on IGN's server by range requests, at once
  in the LiDAR's thread, into src/lidar_grids.npz (a 500 × 500 m area of Gif: 131 MB in 55 requests instead of four tiles'
  771 MB) — for town_map.py only: build.py and town_3d.py need the whole files;
- IGN BD TOPO V3 (WFS, Licence Ouverte 2.0): buildings with their heights and uses, roads with their widths, walls, hedges,
  watercourses, sports grounds, parkings — GeoJSON in Lambert 93, one file a layer;
- IGN BD ORTHO / ORTHO HR (WMS, Licence Ouverte 2.0): the colour photograph and the colour-infrared one at 0.2 m, for the
  ground's texture, the roofs' colours and grass (the infrared's vegetation index);
- OpenStreetMap (Overpass, ODbL): what IGN does not hold — footways, steps, surfaces, barriers, street furniture, trees,
  gardens and private ground, roof shapes and colours.
Only the area's extent is sent to these services. Polite: our user agent, a request a second to each service, files kept (a
second run reuses them). The area in Lambert 93 is written to DATA/<race>/area.json.

The services are asked at the same time, each by a thread of its own (2026-11-12, the town plan's wait: one after the other, a slow
Overpass held everything up): IGN's download service (the point clouds, two at a time), IGN's WFS and WMS (BD TOPO, then BD ORTHO),
the cadastre, OpenStreetMap. Each source prints « @@done <source> » once it is in (townmap_ci.py tells the page what is still
awaited). TOWN_ORTHO_PPM (pixels a metre, 5 by default: 0.2 m) asks the photographs at a coarser resolution — Cartographier's town
plan reads them at 0.5 m (2), Virtually's 3D scene wants 0.2 m —, such files named ortho<ppm>_… ."""
import json, math, os, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from mapgen import lambert93                                        # noqa: E402

DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
UA = {"User-Agent": "Ozimut Virtually builder (https://ozimut.com; contact@ozimut.com)"}
WFS = "https://data.geopf.fr/wfs/ows"
WMS = "https://data.geopf.fr/wms-r/wms"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
BDTOPO = ["batiment", "troncon_de_route", "construction_lineaire", "construction_ponctuelle", "construction_surfacique", "haie",
          "zone_de_vegetation", "troncon_hydrographique", "surface_hydrographique", "terrain_de_sport", "equipement_de_transport",
          "ligne_orographique", "troncon_de_voie_ferree", "zone_d_activite_ou_d_interet"]
MARGIN = 60                                                          # m fetched beyond the area (the 3D scene's horizon)
REMOTE = False                                                       # --lidar-remote: the point clouds not downloaded


class Pace:
    """A request a second to a service, whatever the threads asking it."""
    def __init__(self, s: float = 1.1):
        self.s, self.last, self.lock = s, 0.0, threading.Lock()

    def wait(self):
        with self.lock:
            dt = self.s - (time.monotonic() - self.last)
            if dt > 0:
                time.sleep(dt)
            self.last = time.monotonic()


PACE = {"dl": Pace(), "ign": Pace(), "cad": Pace()}           # IGN's downloads, IGN's WFS/WMS, the cadastre
ORTHO_PPM = float(os.environ.get("TOWN_ORTHO_PPM") or 5)


def done(name: str):
    print(f"@@done {name}", flush=True)


def get(url, dest: Path, pace: str = "ign", **kw):
    if dest.exists() and dest.stat().st_size:
        return dest
    for attempt in range(4):
        PACE[pace].wait()
        try:
            r = requests.get(url, headers=UA, timeout=600, stream=True, **kw)
            r.raise_for_status()
            part = dest.with_suffix(dest.suffix + ".part")
            with open(part, "wb") as f:
                for ch in r.iter_content(1 << 20):
                    f.write(ch)
            part.replace(dest)
            return dest
        except requests.RequestException as e:
            print("  retry", attempt + 1, e, flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")


def main():
    global REMOTE
    REMOTE = "--lidar-remote" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    race, lat, lon, w, h = args[0], float(args[1]), float(args[2]), float(args[3]), float(args[4])
    rd = DATA / race; src = rd / "src"; src.mkdir(parents=True, exist_ok=True)
    cx, cy = lambert93.forward(lat, lon)
    box = [round(cx - w / 2), round(cy - h / 2), round(cx + w / 2), round(cy + h / 2)]
    ext = [box[0] - MARGIN, box[1] - MARGIN, box[2] + MARGIN, box[3] + MARGIN]
    json.dump({"race": race, "lat": lat, "lon": lon, "box": box, "ext": ext, "epsg": 2154}, open(rd / "area.json", "w"), indent=1)
    print("area L93", box, "fetched", ext, flush=True)
    corners = [lambert93.inverse(x, y) for x in (ext[0], ext[2]) for y in (ext[1], ext[3])]
    s, n = min(c[0] for c in corners), max(c[0] for c in corners)
    wl, e = min(c[1] for c in corners), max(c[1] for c in corners)
    t0 = time.monotonic()
    ll = (s, wl, n, e)
    jobs = {"lidar": lambda: lidar(rd, src, ext, ll), "ign": lambda: ign(src, ext), "cadastre": lambda: cadastre(src, ext, corners, lat, lon),
            "osm": lambda: osm(src, ll)}
    errors = []
    with ThreadPoolExecutor(len(jobs)) as pool:
        futs = {k: pool.submit(f) for k, f in jobs.items()}
        for k, f in futs.items():
            try:
                f.result()
            except Exception as ex:                          # every source is waited for; any failure then stops the map
                errors.append(f"{k}: {ex}")
    if errors:
        raise RuntimeError("; ".join(errors))
    print(f"done in {time.monotonic() - t0:.0f} s", flush=True)


def lidar(rd: Path, src: Path, ext, ll):
    """IGN LiDAR HD: the tiles' list from the WFS, then the point clouds, two at a time (a request a second)."""
    s, wl, n, e = ll
    tids = [f"{x:04d}_{y:04d}" for y in range(math.floor(ext[1] / 1000) + 1, math.ceil(ext[3] / 1000) + 1)
            for x in range(math.floor(ext[0] / 1000), math.ceil(ext[2] / 1000))]
    PACE["ign"].wait()
    r = requests.get(WFS, headers=UA, timeout=60, params={"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
                     "TYPENAMES": "IGNF_LIDAR-HD_METADONNEE:metadata", "OUTPUTFORMAT": "application/json",
                     "BBOX": f"{wl},{s},{e},{n},urn:ogc:def:crs:OGC:1.3:CRS84"})
    r.raise_for_status()
    laz = rd / "lidar" / "laz"; laz.mkdir(parents=True, exist_ok=True)
    cat = {}
    for f in r.json().get("features", []):
        p = f["properties"]; tid = (p.get("coordonnees_nw") or "").replace("-", "_")
        if tid in tids:
            cat[tid] = {"laz": p.get("url_npl"), "date": (p.get("date_fin_acquisition") or "")[:10]}
    if REMOTE:                                                       # read on IGN's server by townmap/terrain.py
        for c in cat.values():
            c["remote"] = True
    json.dump(cat, open(src / "lidar.json", "w"), indent=1)
    print("LiDAR tiles", {k: v["date"] for k, v in cat.items()}, "(the area's points read by ranges)" if REMOTE else "", flush=True)
    if REMOTE:
        # the area's points read on IGN's server now, beside the other sources (Overpass is often the slowest), into the grids
        # town_map.py's terrain stage reads back (src/lidar_grids.npz); a tile not served by ranges is downloaded whole there
        if cat:
            os.environ["VIRTUAL_DATA"] = str(DATA)
            from townmap.env import Env
            from townmap import terrain
            terrain.grids(Env(rd.name))
        done("lidar")
        return

    def one(item):
        tid, c = item
        t0 = time.time(); get(c["laz"], laz / f"{tid}.copc.laz", "dl")
        print(" ", tid, round((laz / f"{tid}.copc.laz").stat().st_size / 1e6), "MB", round(time.time() - t0), "s", flush=True)
    with ThreadPoolExecutor(2) as pool:
        list(pool.map(one, cat.items()))
    done("lidar")


def ign(src: Path, ext):
    """IGN's WFS and WMS: BD TOPO's layers, then BD ORTHO, colour and infrared, in requests of 2 000 pixels a side."""
    for layer in BDTOPO:
        dest = src / f"bdtopo_{layer}.json"
        if dest.exists():
            continue
        feats = []
        for page in range(20):
            for attempt in range(4):                                  # a page that is not JSON (seen once: a 200 with no
                PACE["ign"].wait()                                    # JSON, 2026-11-22) asked again
                r = requests.get(WFS, headers=UA, timeout=120, params={"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
                                 "TYPENAMES": f"BDTOPO_V3:{layer}", "SRSNAME": "EPSG:2154", "OUTPUTFORMAT": "application/json",
                                 "BBOX": f"{ext[0]},{ext[1]},{ext[2]},{ext[3]},urn:ogc:def:crs:EPSG::2154", "COUNT": "5000",
                                 "STARTINDEX": str(page * 5000)})
                if r.status_code != 200:
                    break
                try:
                    body = r.json()
                    break
                except ValueError:
                    print("  BD TOPO", layer, "not JSON:", repr(r.text[:120]), "retry", attempt + 1, flush=True)
                    time.sleep(5 * (attempt + 1))
            else:
                raise RuntimeError(f"BD TOPO {layer}: the WFS answered no JSON")
            if r.status_code != 200:
                print("  BD TOPO", layer, r.status_code, r.text[:200]); break
            got = body.get("features", [])
            feats += got
            if len(got) < 5000:
                break
        json.dump({"type": "FeatureCollection", "features": feats}, open(dest, "w"))
        print("BD TOPO", layer, len(feats), flush=True)
    done("bdtopo")
    ppm = ORTHO_PPM
    pre = "ortho" if ppm == 5 else f"ortho{ppm:g}"
    step = int(round(2000 / ppm))                                     # metres a request: 2 000 pixels a side
    for layer, tag, fmt in (("ORTHOIMAGERY.ORTHOPHOTOS", "rgb", "image/jpeg"), ("ORTHOIMAGERY.ORTHOPHOTOS.IRC", "irc", "image/jpeg")):
        for y0 in range(ext[1], ext[3], step):
            for x0 in range(ext[0], ext[2], step):
                x1, y1 = min(x0 + step, ext[2]), min(y0 + step, ext[3])
                dest = src / f"{pre}_{tag}_{x0}_{y0}.jpg"
                get(WMS, dest, params={"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "STYLES": "",
                                       "CRS": "EPSG:2154", "BBOX": f"{x0},{y0},{x1},{y1}", "WIDTH": str(round((x1 - x0) * ppm)),
                                       "HEIGHT": str(round((y1 - y0) * ppm)), "FORMAT": fmt})
        print("BD ORTHO", tag, "done", flush=True)
    done("ortho")


def cadastre(src: Path, ext, corners, lat, lon):
    """The cadastre's parcels (Etalab, Licence Ouverte 2.0): which ground is a private garden. The communes at the area's corners
    and centre, a city's municipal arrondissement first (Paris, Lyon and Marseille are filed by them); a commune Etalab cannot serve,
    or no answer from geo.api.gouv.fr: IGN's PCI parcels over the area instead (the same DGFiP parcels, « Parcellaire Express », on
    the WFS, in longitude/latitude as Etalab's)."""
    codes, missed = set(), False
    for la, lo in corners + [(lat, lon)]:
        for kind in ("arrondissement-municipal", None):
            try:
                PACE["cad"].wait()
                r = requests.get("https://geo.api.gouv.fr/communes", params={"lat": la, "lon": lo, "fields": "code", **({"type": kind} if kind else {})},
                                 headers=UA, timeout=60)
                found = [c["code"] for c in r.json()] if r.ok else []
            except (requests.RequestException, ValueError):
                found, missed = [], True
            if found:
                codes.update(found); break
    for code in sorted(codes):
        try:
            get(f"https://cadastre.data.gouv.fr/bundler/cadastre-etalab/communes/{code}/geojson/parcelles", src / f"parcelles_{code}.json", "cad")
        except RuntimeError:
            missed = True
    if missed or not codes:
        for f in src.glob("parcelles_*.json"):
            f.unlink()
        feats = []
        for page in range(20):
            PACE["ign"].wait()
            r = requests.get(WFS, headers=UA, timeout=120, params={"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
                             "TYPENAMES": "CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle", "SRSNAME": "urn:ogc:def:crs:OGC:1.3:CRS84",
                             "OUTPUTFORMAT": "application/json", "BBOX": f"{ext[0]},{ext[1]},{ext[2]},{ext[3]},urn:ogc:def:crs:EPSG::2154",
                             "COUNT": "5000", "STARTINDEX": str(page * 5000)})
            r.raise_for_status()
            got = r.json().get("features", [])
            feats += got
            if len(got) < 5000:
                break
        json.dump({"type": "FeatureCollection", "features": feats}, open(src / "parcelles_pci.json", "w"))
        print("cadastre: IGN's PCI parcels", len(feats), flush=True)
    else:
        print("cadastre", sorted(codes), flush=True)
    done("cadastre")


def osm(src: Path, ll):
    """OpenStreetMap through Overpass (two servers in turn); « @@retry osm <n> » for each new try."""
    s, wl, n, e = ll
    dest = src / "osm.json"
    if not dest.exists():
        b = f"{s:.6f},{wl:.6f},{n:.6f},{e:.6f}"
        q = f"""[out:json][timeout:120];
(
  way["highway"]({b}); way["area:highway"]({b});
  way["building"]({b}); relation["building"]({b}); way["building:part"]({b}); relation["building:part"]({b});
  way["barrier"]({b}); node["barrier"]({b});
  way["landuse"]({b}); relation["landuse"]({b}); way["leisure"]({b}); relation["leisure"]({b});
  way["natural"]({b}); relation["natural"]({b}); node["natural"="tree"]({b}); way["natural"="tree_row"]({b});
  way["amenity"]({b}); relation["amenity"]({b}); node["amenity"]({b});
  way["man_made"]({b}); node["man_made"]({b}); node["highway"]({b});
  node["leisure"]({b}); node["tourism"]({b}); node["historic"]({b});
  way["waterway"]({b}); way["railway"]({b}); way["place"="square"]({b}); way["access"]({b}); way["garden:type"]({b});
);
out geom;"""
        for attempt in range(6):
            try:
                r = requests.post(OVERPASS[attempt % 2], data={"data": q}, headers=UA, timeout=200)
                r.raise_for_status(); dest.write_bytes(r.content); break
            except requests.RequestException as ex:
                print("  Overpass retry", attempt + 1, ex, flush=True)
                print(f"@@retry osm {attempt + 2}", flush=True)
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("OpenStreetMap's Overpass did not answer")
        print("OSM", len(json.load(open(dest))["elements"]), "elements", flush=True)
    done("osm")


if __name__ == "__main__":
    main()
