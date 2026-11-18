"""A sprint map (ISSprOM 2019-2, 1:4000) of a town from open data, for « Virtually » (town_fetch.py first):

  py town_map.py <race> [--clip] [--no-fix | --no-check]    DATA/<race>/map_objects.json, then  node --import ../mapper/shim.mjs mkocd.mjs … map.ocd

--no-check: no legibility check at all (neither its repairs nor its report) — the maps made for a user (Cartographier's « Plan de
ville », townmap_ci.py; owner, 2026-11-18): the check and test_remarks.py are the developer's extensive tests, run on Pixel's
town races (town_all.py) to keep improving the generator, and a user would not know what to do with their outcome.

--clip: the objects cut to the area asked for (area.json `box`) instead of the area fetched with its margin (`ext`, the 3D
scene's horizon) — Cartographier's « Plan de ville » (townmap_ci.py), whose map is exactly that area; the margin still serves the
computation (a street's paving, a parcel, a contour crossing the area's edge).

What each symbol comes from:
- 521 buildings, 522 canopies: IGN BD TOPO's buildings, those that touch drawn as one (OpenStreetMap's building=roof for
  canopies); inside the ground not to be entered (520) its sheds, hedges, walls, fences, paths and lone trees are left out;
- contours, streams and paths as Bézier curves through their points (mkocd.mjs `curve`);
- 501 paved area with its edge (501.1, « step or edge of paved area »: OpenOrienteering Mapper's 501 is the area with it) where
  it meets anything but a building, and the carriageways' kerbs in town; the through roads (BD TOPO's importance 1-3) as paved area
  with heavy traffic (501.4, brown 50 %: Mapper's 501.10 with its edge); the paving: the public road space the cadastre leaves between its parcels (streets and their sidewalks up to the property
  line, squares; its grass open land), BD TOPO's roads at their carriageway width, OpenStreetMap's pedestrian areas, squares,
  parkings and paved footways, and unbuilt ground the photograph's infrared shows bare near buildings (courtyards);
- 401 open land, 405 forest (a wood of 400 m² or more), 406-410 green: the LiDAR's vegetation heights and cover over the
  infrared's vegetation index (lawns, parks, woods), no 402 ring round the woods; the areas as one coverage simplified together
  (shapely `coverage_simplify`: smooth edges, still shared); 411 hedges (BD TOPO, OpenStreetMap);
- 520 area not to be entered: the cadastre's parcels holding a house (gardens), schools, the railway's corridor;
- 501.6-501.9 paved footways and cycle paths as lines, the paved strip with its edges at their width (1.4, 2, 3, 4 m: Mapper's
  « paved area, footprint »; mkocd.mjs makes them);
- 505/506 unpaved paths (OpenStreetMap; BD TOPO's only where OSM has none within 4 m), 532 stairways at their width on the ground
  (OSM's `width`, else 2 m: variants 532.1-532.6 made by mkocd.mjs; BD TOPO's where OSM has no stairway within 4 m); 509 railway;
  301 water (BD TOPO's and OpenStreetMap's areas, cut under bridges), 305 streams, 306 ditches and drains, cut in culverts;
  308 marsh (OpenStreetMap's wetlands);
- bridges and passages: 512.1 across a passage's mouths only (one can go beneath), 515 along the sides of a bridge one cannot
  pass beneath (over water, a stream or the railway: ISSprOM's text for 512.1), 512.2 along every passage, 512.3 over the
  part of a bridge one runs on at both levels; the passages for the game on a hidden area (993) and in src/passages.json (town_3d.py);
- 995 « boundary to confirm » (purple 50 %, a helper the race's map does not draw): the edge of the ground not to be entered where
  no wall, fence, hedge or building is known — on the ground it is one of them, the mapper says which;
- 990 / 991 every OpenStreetMap way and tagged node of the area, on hidden helper symbols, for the mapper to use;
- 513/515 walls and 516/518 fences, passable or not by the height the LiDAR measures along them (1.5 m); the tennis and
  multi-sport courts' fences along their outline where the LiDAR sees one;
- sports grounds (OpenStreetMap's pitches and tracks, else BD TOPO's): grass and turf pitches 401, hard ones, the courts and the
  athletics track 501 (runnable, its edges 501.1); the tennis courts fenced, the multi-sport courts under 709 (out of bounds: not to be
  entered), the goals and rugby posts a 531 cross (prominent man-made feature) each;
  their sport, surface and outline in src/sports.json for town_3d.py;
- 101/102 contours every 2.5 m from the LiDAR's ground smoothed over 4 m, each line rounded, dropped whole or kept whole (no loop
  under 600 m², no line under 40 m), cut exactly at the buildings: a contour ends at a building or the map's edge, nowhere else; 417/418 trees outside the woods, each (the LiDAR's crowns); 526 monuments,
  311 fountains (OpenStreetMap); 601 north lines.
Also writes DATA/<race>/src/rasters.npz (the LiDAR's grids, the classes) and src/roofpts.npy (class 6 points) for town_3d.py."""
import json, math, os, re, sys, time
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import (binary_closing, binary_opening, distance_transform_edt, gaussian_filter, maximum_filter,
                           median_filter, binary_dilation, label)
import shapely
from shapely.geometry import shape, LineString, Polygon, MultiPolygon, Point, box as sbox
from shapely.ops import unary_union


def merge_lines(g):
    """shapely's linemerge, which refuses a single line (2026-11-18: one passage in a 500 m square stopped the map)"""
    from shapely.ops import linemerge as _lm
    return _lm(g) if g.geom_type in ("MultiLineString", "GeometryCollection") else g

DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__file__).resolve().parents[4] / "data" / "virtual")
if not DATA.exists():
    sys.path.insert(0, str(Path(__file__).resolve().parents[2])); DATA = Path(__import__("paths").DATA_DIR) / "virtual"
RACE = sys.argv[1]
CLIP_TO_BOX = "--clip" in sys.argv
RD = DATA / RACE; SRC = RD / "src"
A = json.load(open(RD / "area.json"))
X0, Y0, X1, Y1 = A["ext"]
R = 0.5                                                   # raster cell (m)
NX, NY = int(round((X1 - X0) / R)), int(round((Y1 - Y0) / R))
SCALE = 4000
CX, CY = (A["box"][0] + A["box"][2]) / 2, (A["box"][1] + A["box"][3]) / 2
T0 = time.time()
log = lambda *a: print(f"[{time.time() - T0:5.0f}s]", *a, flush=True)
# the computation's steps for the page that waits (townmap_ci.py reads « @@step <name> »: points, photo, vectors, areas, lines,
# contours, objects)
step = lambda name: print(f"@@step {name}", flush=True)
S = lambda n, sub=0: n * 1000 + sub


def to_px(x, y):
    return (np.asarray(x) - X0) / R, (Y1 - np.asarray(y)) / R


def mm(x, y):
    """Lambert 93 → map mm (y up) about the area's centre."""
    return (x - CX) * 1000 / SCALE, (y - CY) * 1000 / SCALE


def bdtopo(layer):
    f = SRC / f"bdtopo_{layer}.json"
    return json.load(open(f))["features"] if f.exists() else []


def geom2d(g):
    return shapely.force_2d(shape(g)) if g else None


# ---- the LiDAR, rasterised at 0.5 m ------------------------------------------------------------------------------------------
cache = SRC / "lidar_grids.npz"
if cache.exists():
    Z = dict(np.load(cache)); roof = np.load(SRC / "roofpts.npy")
else:
    import laspy
    N = NX * NY
    gs, gc = np.zeros(N), np.zeros(N)
    zmax = {k: np.full(N, -1e9, np.float32) for k in ("v", "b", "o")}  # vegetation 3-5, building 6, other non-ground (1, 9…)
    cnt = {k: np.zeros(N, np.int32) for k in (0, 2, 3, 4, 5, 6)}
    roofs = []

    def chunks(f):
        """The point cloud's points within the area: a COPC file (IGN's) read by its octree, only the nodes the area touches and
        only the fields used (2026-11-12: whole 1 km tiles were read for a few hundred metres, ~20 s a tile; now ~2 s), else
        every point in chunks."""
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
    step("points")
    for f in sorted((RD / "lidar" / "laz").glob("*.laz")):
        for ch in chunks(f):
            x, y = np.asarray(ch.x), np.asarray(ch.y)
            m = (x >= X0) & (x < X1) & (y > Y0) & (y <= Y1)
            if not m.any():
                continue
            x, y, z, c = x[m], y[m], np.asarray(ch.z)[m], np.asarray(ch.classification)[m]
            px, py = to_px(x, y); idx = py.astype(np.int64) * NX + px.astype(np.int64)
            keep = c != 7
            cnt[0] += np.bincount(idx[keep], minlength=N).astype(np.int32)
            for k in (2, 3, 4, 5, 6):
                cnt[k] += np.bincount(idx[c == k], minlength=N).astype(np.int32)
            g = c == 2
            gs += np.bincount(idx[g], weights=z[g], minlength=N); gc += np.bincount(idx[g], minlength=N)
            for key, sel in (("v", (c >= 3) & (c <= 5)), ("b", c == 6), ("o", (c == 1) | (c == 9) | (c == 17) | (c == 64) | (c == 65) | (c == 66))):
                np.maximum.at(zmax[key], idx[sel], z[sel].astype(np.float32))
            b = c == 6
            roofs.append(np.c_[x[b] - X0, y[b] - Y0, z[b]].astype(np.float32))
        log("LiDAR", f.name)
    has = gc > 0
    dtm = np.where(has, gs / np.maximum(gc, 1), np.nan).reshape(NY, NX)
    # holes (under buildings): a membrane would be best; the nearest ground smoothed is enough for a town
    _, (ri, ci) = distance_transform_edt(np.isnan(dtm), return_indices=True)
    dtm = gaussian_filter(dtm[ri, ci], 1.0)
    Z = {"dtm": dtm.astype(np.float32), **{f"z{k}": v.reshape(NY, NX) for k, v in zmax.items()},
         **{f"n{k}": v.reshape(NY, NX) for k, v in cnt.items()}}
    roof = np.concatenate(roofs)
    np.savez_compressed(cache, **Z); np.save(SRC / "roofpts.npy", roof)
dtm = Z["dtm"]
chm = np.where(Z["zv"] > -1e8, Z["zv"] - dtm, 0).astype(np.float32)
nall = Z["n0"].astype(np.float32) + 1e-3
cover5 = gaussian_filter(Z["n5"] / nall, 1.0)              # share of returns from high vegetation
cover4 = gaussian_filter(Z["n4"] / nall, 1.0)
log("LiDAR grids", dtm.shape, f"ground {dtm.min():.1f}-{dtm.max():.1f} m", "roof points", len(roof))

# ---- the photograph's infrared: a vegetation index ---------------------------------------------------------------------------
step("photo")
def mosaic(tag, res):
    W, H = int(round((X1 - X0) / res)), int(round((Y1 - Y0) / res))
    out = np.zeros((H, W, 3), np.uint8)
    # town_fetch.py's photographs: ortho_… at 5 pixels a metre, ortho<ppm>_… at another resolution (Cartographier's: 2)
    for f in SRC.glob(f"ortho*_{tag}_*.jpg"):
        pre, _, x0, y0 = f.stem.split("_"); x0, y0 = int(x0), int(y0)
        ppm = float(pre[5:] or 5)
        im = Image.open(f).convert("RGB")
        w_m, h_m = im.width / ppm, im.height / ppm
        im = im.resize((int(round(w_m / res)), int(round(h_m / res))), Image.LANCZOS)
        c, r = int(round((x0 - X0) / res)), int(round((Y1 - (y0 + h_m)) / res))
        a = np.asarray(im); out[r:r + a.shape[0], c:c + a.shape[1]] = a[: H - r, : W - c]
    return out
irc = mosaic("irc", R).astype(np.float32)
ndvi = gaussian_filter((irc[..., 0] - irc[..., 1]) / (irc[..., 0] + irc[..., 1] + 1), 0.7)
rgb = mosaic("rgb", R).astype(np.float32)
lum = rgb.mean(axis=2)
log("NDVI", f"{np.percentile(ndvi, 5):.2f}…{np.percentile(ndvi, 95):.2f}")

# ---- vectors -----------------------------------------------------------------------------------------------------------------
step("vectors")
osm = json.load(open(SRC / "osm.json"))["elements"]
L93 = None


def osm_xy(lat, lon):
    from l93 import transformer
    global L93
    L93 = L93 or transformer(4326, 2154)
    return L93.transform(lon, lat)


def osm_geom(e, area=False):
    if e["type"] == "node":
        return Point(*osm_xy(e["lat"], e["lon"]))
    if e["type"] == "way" and e.get("geometry"):
        xs, ys = osm_xy(np.array([p["lat"] for p in e["geometry"]]), np.array([p["lon"] for p in e["geometry"]]))
        pts = list(zip(xs, ys))
        if area and len(pts) >= 4 and pts[0] == pts[-1]:
            return Polygon(pts).buffer(0)
        return LineString(pts) if len(pts) >= 2 else None
    if e["type"] == "relation" and area:
        outers, inners = [], []
        for m in e.get("members", []):
            if m.get("type") == "way" and m.get("geometry"):
                xs, ys = osm_xy(np.array([p["lat"] for p in m["geometry"]]), np.array([p["lon"] for p in m["geometry"]]))
                (inners if m.get("role") == "inner" else outers).append(LineString(list(zip(xs, ys))))
        polys = list(shapely.polygonize(outers).geoms) if outers else []
        g = unary_union(polys) if polys else None
        if g is not None and inners:
            g = g.difference(unary_union(list(shapely.polygonize(inners).geoms)))
        return g
    return None


tags = lambda e: e.get("tags", {})
frame = sbox(X0, Y0, X1, Y1)
# what the objects are cut to: the area fetched, or with --clip the area asked for (the computation keeps the margin)
CLIP = sbox(*A["box"]) if CLIP_TO_BOX else frame
buildings = []
for f in bdtopo("batiment"):
    g = geom2d(f["geometry"])
    if g is None or g.is_empty:
        continue
    g = g.buffer(0).intersection(frame)
    if g.area > 3:
        buildings.append((g, f["properties"]))
B = unary_union([g for g, _ in buildings])
canopy = unary_union([g for e in osm if tags(e).get("building") in ("roof", "carport") for g in [osm_geom(e, True)] if g is not None and g.geom_type.endswith("Polygon")] or [Polygon()])
log("buildings", len(buildings), "canopies", 0 if canopy.is_empty else len(getattr(canopy, "geoms", [canopy])))

PAVED_SURF = {"asphalt", "paving_stones", "concrete", "sett", "paved", "concrete:plates", "cobblestone", "unhewn_cobblestone", "metal", "wood", "bricks"}
UNPAVED_SURF = {"gravel", "fine_gravel", "ground", "dirt", "compacted", "grass", "earth", "mud", "sand", "unpaved", "pebblestone", "woodchips"}
paved, path_lines, small_lines, steps, rail = [], [], [], [], []
PUBLIC_WAYS = []                                           # OSM's unpaved paths open to all: a right of way through any olive
# what one source has exists, the other is incomplete (the owner's mapper, 2026-11-12): BD TOPO's paths and stairs are kept
# wherever OSM has none of the same kind within 4 m (they doubled), never dropped because some other way passes near
bd_paths, bd_steps, osm_hw = [], [], []
paved_paths = []                                           # OSM's paved footways and cycle paths: (line, width) — a path, not a surface
carr = []                                                  # the carriageways: (area, BD TOPO's importance, in town)
carr_lines = {}                                            # (half width, importance, in town) → the sections' centre lines


def width_of(t, default):
    try:
        return max(0.8, min(12.0, float(str(t.get("width", "")).replace(",", ".").split()[0])))
    except (ValueError, IndexError):
        return default
def is_lower(t):
    """An OSM way beneath something: in a tunnel, under a cover or a building, or on a negative layer."""
    return (t.get("tunnel") in ("yes", "building_passage", "covered") or t.get("covered") == "yes"
            or str(t.get("layer", "0")).strip().startswith("-"))


def put_way(g, hw, t, is_area):
    """An OSM way of a path's kind on the map: a stairway, a sidewalk or a paved area, a paved footway (a line at its width), an
    unpaved path or a small path."""
    if hw == "steps":
        steps.append((g, width_of(t, 2.0))); return
    surf = t.get("surface", "")
    if t.get("footway") in ("sidewalk", "crossing", "traffic_island") or t.get("cycleway") == "sidewalk":
        paved.append(g.buffer(1.0, cap_style="flat", join_style="round")); return
    if is_area and g.geom_type.endswith("Polygon"):
        if surf not in UNPAVED_SURF:
            paved.append(g)
        return
    if surf in UNPAVED_SURF or (hw in ("path", "track", "bridleway") and surf not in PAVED_SURF):
        (small_lines if hw == "path" and t.get("informal") == "yes" else path_lines).append(g)
        if t.get("access") not in ("private", "no") and t.get("foot") not in ("private", "no"):
            PUBLIC_WAYS.append(g)
    elif hw in ("footway", "path", "cycleway", "bridleway"):
        paved_paths.append((g, width_of(t, 2.0)))
    else:
        paved.append(g.buffer({"service": 2.2, "living_street": 2.5, "pedestrian": 2.5, "track": 1.5}.get(hw, 1.1), cap_style="flat", join_style="round"))


under, bd_under = [], []                                   # OSM's ways beneath something; BD TOPO's roads below ground
for f in bdtopo("troncon_de_route"):
    p = f["properties"]; g = geom2d(f["geometry"])
    if g is None:
        continue
    if (p.get("position_par_rapport_au_sol") or "0").startswith("-"):
        if g.geom_type == "LineString":
            nat = (p.get("nature") or "").lower()
            bd_under.append((g, 2.0 if ("sentier" in nat or "escalier" in nat or "chemin" in nat) else float(p.get("largeur_de_chaussee") or 0) or 5.0))
        continue
    nat = (p.get("nature") or "").lower()
    if "escalier" in nat:
        bd_steps.append(g); continue
    if "sentier" in nat or "chemin" in nat or "empierr" in nat:
        bd_paths.append(g); continue
    w = float(p.get("largeur_de_chaussee") or 0) or {"route à 1 chaussée": 5.5, "rond-point": 7, "bretelle": 6, "piste cyclable": 2.5}.get(nat, 5)
    side = 1.8 if p.get("urbain") not in (False, "false", 0) else 0.3        # sidewalks in town
    carr_lines.setdefault((round(w / 2, 2), int(p.get("importance") or 6), side > 1), []).append(g)
    paved.append(g.buffer(w / 2 + side, cap_style="flat", join_style="round"))
for e in osm:
    t = tags(e); hw = t.get("highway")
    if e["type"] != "way" or not e.get("geometry"):
        continue
    if hw in ("footway", "path", "cycleway", "bridleway", "track", "steps", "pedestrian", "service", "living_street", "corridor"):
        g0 = osm_geom(e)                                   # OSM's ways of a path's kind (a street is not one)
        if g0 is not None:
            osm_hw.append(g0)
    if hw in ("pedestrian", "footway", "path", "cycleway", "service", "living_street", "track", "bridleway", "steps", "corridor") or t.get("area:highway"):
        if t.get("indoor") == "yes":
            continue
        is_area = t.get("area") == "yes" or bool(t.get("area:highway"))
        g = osm_geom(e, area=is_area)
        if g is None:
            continue
        if is_lower(t) and g.geom_type == "LineString":         # a passage beneath something: placed below, with the bridges
            under.append((g, hw, t)); continue
        put_way(g, hw, t, is_area)
    if t.get("place") == "square" or t.get("amenity") in ("parking", "marketplace") or t.get("leisure") == "schoolyard":
        g = osm_geom(e, area=True)
        if g is not None and g.geom_type.endswith("Polygon") and t.get("parking") not in ("underground", "multi-storey"):
            paved.append(g)
for f in bdtopo("equipement_de_transport"):
    p = f["properties"]
    if "parking" in (p.get("nature") or "").lower():
        g = geom2d(f["geometry"])
        if g is not None and g.geom_type.endswith("Polygon"):
            paved.append(g)
# the railway track by track (the owner's mapper, 2026-11-12: « the RER has two tracks, both in OSM »): OpenStreetMap's tracks,
# BD TOPO's axis only where OSM has none within 10 m (its axis stands for every track of a line)
osm_rail = []
for e in osm:
    t = tags(e)
    if e["type"] == "way" and t.get("railway") in ("rail", "light_rail", "tram", "narrow_gauge", "subway") and not is_lower(t):
        g = osm_geom(e)
        if g is not None and g.geom_type == "LineString":
            osm_rail.append(g)
rail += osm_rail
OSM_RAIL = unary_union([g.buffer(10) for g in osm_rail] or [Polygon()])
for f in bdtopo("troncon_de_voie_ferree"):
    p = f["properties"]; g = geom2d(f["geometry"])
    if g is not None and not (p.get("position_par_rapport_au_sol") or "0").startswith("-") and g.difference(OSM_RAIL).length > 0.5 * g.length:
        rail.append(g)
# the sections of one kind merged through their joins, then widened: no wedge left open where two sections meet at an angle
from shapely.ops import linemerge as _linemerge
for (half, imp, urb), gs in carr_lines.items():
    u = unary_union(gs)
    m = _linemerge(u) if u.geom_type in ("MultiLineString", "GeometryCollection") else u
    carr.append((m.buffer(half, cap_style="flat", join_style="round"), imp, urb))
# ---- two levels: the bridges and what passes beneath (the owner, 2026-11-12: « bridges and tunnels need to be shown ») ------------
# a deck is a bridge's top: OpenStreetMap's bridge ways (roads, paths, railways) at their width, else BD TOPO's roads and railways
# above ground and its « Pont » lines (axes: « Passerelle » a footbridge). What passes beneath a deck — a way on a lower layer
# crossing it, a way in a tunnel, under a cover or a building, or on a negative layer (its part beneath a deck, the railway, a
# building or a carriageway) — is a passage: on the map 512.1 (« bridge / tunnel entrance ») across each of its mouths, the
# triangles toward the lower level outside, 512.2 (« underpass or tunnel ») along its sides, 512.3 over it where the upper level is run on too (a road, a footbridge);
# for the game a hidden area (993) that build.py makes runnable over whatever lies above (the railway's block line, a
# building), and src/passages.json, which town_3d.py cuts out of the buildings it stops the runner with. Over water, a stream or a
# railway beneath, a deck's sides are 515, uncrossable wall (ISSprOM: « a simple bridge, which cannot be passed underneath, shall be
# represented using symbol Uncrossable wall (515) »; 512.1 is a passage's mouth and nothing else — the owner's mapper, 2026-11-12);
# the water and the streams are cut under it (a road or path deck runnable).
def lay(t, d=0):
    try:
        return int(float(str(t.get("layer", d)).split(";")[0]))
    except ValueError:
        return d


ROAD_W = {"motorway": 12, "trunk": 10, "primary": 9, "secondary": 8, "tertiary": 7, "unclassified": 6, "residential": 6,
          "living_street": 5, "service": 4, "track": 3, "pedestrian": 3, "cycleway": 2.5, "bridleway": 2.5, "footway": 2.0,
          "path": 2.0, "steps": 2.0, "corridor": 2.0}
PATH_KINDS = {"footway", "path", "cycleway", "bridleway", "steps", "pedestrian", "track", "corridor"}
RAIL_L = unary_union(rail) if rail else LineString()
decks = []                                                 # {"g": the deck, "axis", "w", "layer", "kind": road | path | rail}
for e in osm:
    t = tags(e)
    if e["type"] != "way" or t.get("bridge") in (None, "no") or not (t.get("highway") or t.get("railway")):
        continue
    g = osm_geom(e)
    if g is None or g.geom_type != "LineString" or not g.intersects(frame.buffer(30)):
        continue
    hw = t.get("highway")
    kind = "rail" if t.get("railway") else "path" if hw in PATH_KINDS else "road"
    w = width_of(t, 8.0 if kind == "rail" else ROAD_W.get(hw, 6.0))
    # a bridge drawn 0.4 mm wide between its sides' lines at least (the owner, 2026-11-13: a footbridge's two 515 made one black bar;
    # ISSprOM's 0.4 mm between uncrossable features): its half-width the line's half-width and half that gap
    w = max(w, (0.4 + 0.5) * SCALE / 1000)
    decks.append({"g": g.buffer(w / 2, cap_style="flat"), "axis": g, "w": w, "layer": max(1, lay(t, 1)), "kind": kind})
OSM_DECK = unary_union([d["axis"].buffer(3) for d in decks]) if decks else Polygon()
for layer_name in ("troncon_de_route", "troncon_de_voie_ferree", "construction_lineaire"):
    for f in bdtopo(layer_name):
        p = f["properties"]; g = geom2d(f["geometry"])
        if g is None or g.geom_type != "LineString" or g.length < 2:
            continue
        nat, det = (p.get("nature") or "").lower(), (p.get("nature_detaillee") or "").lower()
        if layer_name == "construction_lineaire":
            if nat != "pont":
                continue
            kind, w = ("path", 2.5) if "passerelle" in det else ("road", 6.0)
            if not RAIL_L.is_empty and RAIL_L.buffer(5).contains(g):     # along the railway: the railway's own bridge
                kind, w = "rail", 8.0
        elif (p.get("position_par_rapport_au_sol") or "0").lstrip("+")[:1] not in ("1", "2", "3"):
            continue
        elif layer_name == "troncon_de_voie_ferree":
            kind, w = "rail", 8.0
        else:
            kind = "path" if ("sentier" in nat or "escalier" in nat or "chemin" in nat) else "road"
            w = float(p.get("largeur_de_chaussee") or 0) or (2.0 if kind == "path" else 6.0)
        if g.difference(OSM_DECK).length < 0.5 * g.length:  # OpenStreetMap has this bridge already
            continue
        w = max(w, (0.4 + 0.5) * SCALE / 1000)
        decks.append({"g": g.buffer(w / 2, cap_style="flat"), "axis": g, "w": w, "layer": 1, "kind": kind})
# one deck a bridge (2026-11-14, remark 23's test: an OSM way and a BD TOPO « Pont », or two ways side by side, drew three or four
# sides on one bridge): the widest kept, a deck whose axis lies for 60 % within one kept dropped
_kept = []
for d in sorted(decks, key=lambda d: -d["w"]):
    U_ = unary_union([e["g"].buffer(1.0) for e in _kept if (e["kind"] == "rail") == (d["kind"] == "rail")] or [Polygon()])
    if U_.is_empty or d["axis"].intersection(U_).length < 0.6 * d["axis"].length:
        _kept.append(d)
decks = _kept
DECK_ALL = unary_union([d["g"] for d in decks]) if decks else Polygon()


def pieces_in(g, area):
    x = g.intersection(area)
    return [l for l in getattr(x, "geoms", [x]) if l.geom_type == "LineString" and l.length >= 1.0]


def across(piece, d):
    """The piece runs across the deck (a way passing beneath), not along it (a road reaching its own bridge)."""
    a = d["axis"]; m = piece.interpolate(0.5, normalized=True); s0 = a.project(m)
    p0, p1 = a.interpolate(max(0.0, s0 - 1)), a.interpolate(min(a.length, s0 + 1))
    q0, q1 = piece.coords[0], piece.coords[-1]
    ax, ay, px, py = p1.x - p0.x, p1.y - p0.y, q1[0] - q0[0], q1[1] - q0[1]
    na, npc = math.hypot(ax, ay), math.hypot(px, py)
    if not (na > 1e-6 and npc > 1e-6 and abs(ax * py - ay * px) / (na * npc) > 0.5):
        return False
    # and from one side of the deck to the other (the owner's mapper, 2026-11-12: a path meeting a footbridge's end at an angle
    # was taken for one going under it): both ends on the deck's sides, on either side of its axis, away from its ends
    sides = []
    for q in (q0, q1):
        P = Point(q); sq = a.project(P)
        if sq < 0.5 or sq > a.length - 0.5 or a.distance(P) < 0.35 * d["w"]:
            return False
        c0, c1 = a.interpolate(max(0.0, sq - 0.5)), a.interpolate(min(a.length, sq + 0.5))
        sides.append((c1.x - c0.x) * (q[1] - c0.y) - (c1.y - c0.y) * (q[0] - c0.x) > 0)
    return sides[0] != sides[1]


passages = []                                              # (the line beneath, its width)
UNDER_NEAR = unary_union([g.buffer(3) for g, _, _ in under] or [Polygon()])   # those come from the tunnels' own ways (below)
for e in osm:                                              # ways on a lower layer crossing a deck (a road under the railway)
    t = tags(e); hw = t.get("highway")
    if e["type"] != "way" or not hw or t.get("bridge") not in (None, "no") or t.get("area") == "yes" or t.get("indoor") == "yes" or is_lower(t):
        continue
    g = osm_geom(e)
    if g is None or g.geom_type != "LineString" or not g.intersects(DECK_ALL):
        continue
    for d in decks:
        # a footbridge makes no passage of a way not tagged beneath it (the owner's mapper, 2026-11-12: false ones by the river)
        if d["kind"] != "path" and d["layer"] > lay(t, 0) and g.intersects(d["g"]):
            passages += [(pc, width_of(t, ROAD_W.get(hw, 4.0)), f"way {e['id']} ({hw}) under a {d['kind']} deck") for pc in pieces_in(g, d["g"])
                         if across(pc, d) and not UNDER_NEAR.contains(pc)]
UPPER = unary_union([DECK_ALL, RAIL_L.buffer(4), B] + [c for c, _, _ in carr]).buffer(0.5)
for g, hw, t in under:                                     # tunnels, covered ways, ways on a negative layer
    w = width_of(t, ROAD_W.get(hw, 2.0))
    if t.get("tunnel") in ("yes", "building_passage", "covered") or t.get("covered") == "yes":
        pcs, rest = [g], None                              # the whole way is beneath
    else:
        pcs, rest = pieces_in(g, UPPER), g.difference(UPPER)
        if not pcs and g.length < 40:
            pcs, rest = [g], None
    passages += [(pc, w, f"{hw} tunnel={t.get('tunnel')} covered={t.get('covered')} layer={t.get('layer')}") for pc in pcs]
    for r in getattr(rest, "geoms", [rest]) if rest is not None else []:
        if r.geom_type == "LineString" and r.length >= 2:  # the rest of it runs in the open
            put_way(r, hw, t, False)
UNDER_OSM = unary_union([g.buffer(8) for g, _, _ in under] + [p[0].buffer(8) for p in passages] or [Polygon()])   # (BD TOPO's lie metres off)
for g, w in bd_under:                                      # BD TOPO's ways below ground that OpenStreetMap does not have
    if g.difference(UNDER_OSM).length > 0.5 * g.length:
        passages.append((g, w, "BD TOPO way below ground"))
for f in bdtopo("construction_lineaire"):
    g = geom2d(f["geometry"])
    if (f["properties"].get("nature") or "").lower() == "tunnel" and g is not None and g.geom_type == "LineString" \
            and g.difference(UNDER_OSM).length > 0.5 * g.length:
        passages.append((g, 2.5, "BD TOPO tunnel line"))
for pc, w, why in passages:
    log("  passage", round(pc.centroid.x), round(pc.centroid.y), round(pc.length, 1), "m:", why)
# a passage whose end stops inside a building is drawn on until it comes out (2026-11-14: OSM's ways through a porch or under a
# station's building stop short of its far wall, and in the game the passage ended against it; the owner: « the tunnel 3-4 is not
# accessible »): along its last direction, 10 m at most


def through(pc):
    cs = list(pc.coords)
    for end in (0, -1):
        e, q = cs[end], cs[1 if end == 0 else -2]
        if not B.contains(Point(e)):
            continue
        dx, dy = e[0] - q[0], e[1] - q[1]; n_ = math.hypot(dx, dy) or 1; dx, dy = dx / n_, dy / n_
        for d in np.arange(0.5, 10.01, 0.5):
            pt = (e[0] + dx * d, e[1] + dy * d)
            if not B.contains(Point(pt)):
                pt = (e[0] + dx * (d + 0.5), e[1] + dy * (d + 0.5))
                cs = [pt] + cs if end == 0 else cs + [pt]
                break
    return LineString(cs)


passages = [(through(pc), w, why) for pc, w, why in passages]
log("decks", len(decks), {k: sum(1 for d in decks if d["kind"] == k) for k in ("road", "path", "rail")}, "passages", len(passages))
OSM_HW = unary_union([g.buffer(10) for g in osm_hw]) if osm_hw else Polygon()      # (BD TOPO's lie up to 10 m off: the same path)
for g in bd_paths:
    rest = g.difference(OSM_HW)
    for piece in getattr(rest, "geoms", [rest]):
        if piece.geom_type == "LineString" and piece.length > 10:
            path_lines.append(piece)
# a BD TOPO stairway goes only where OSM has a stairway already (the owner, 2026-11-12: a real one had gone because OSM mapped a
# footway along it)
OSM_STEPS = unary_union([g.buffer(4) for g, _ in steps]) if steps else Polygon()
for g in bd_steps:
    if g.length and g.difference(OSM_STEPS).length > 0.5 * g.length:
        steps.append((g, 2.0))
STREET = unary_union([c.buffer(1.8 if urb else 0.3) for c, _, urb in carr] or [Polygon()]).buffer(0.2)
PAVED = unary_union(paved).intersection(frame)
RAIL = unary_union(rail) if rail else LineString()
water = unary_union([geom2d(f["geometry"]).buffer(0) for f in bdtopo("surface_hydrographique")] or [Polygon()])
streams = [geom2d(f["geometry"]) for f in bdtopo("troncon_hydrographique")
           if not (f["properties"].get("position_par_rapport_au_sol") or "0").startswith("-")]
# what one source has exists (the owner's mapper, 2026-11-12): OpenStreetMap's water areas join BD TOPO's — not a basin that is
# dry most of the time —, its streams, ditches and drains where BD TOPO has none within 4 m (a ditch or a drain as 306, minor
# watercourse), never a culvert's; a watercourse is cut where it runs in a culvert or beneath a deck
osm_water, ditches, culverts = [], [], []
for e in osm:
    t = tags(e)
    if t.get("natural") == "water" and t.get("intermittent") != "yes" and t.get("basin") not in ("detention", "retention", "infiltration"):
        g = osm_geom(e, area=True)
        if g is not None and g.geom_type.endswith("Polygon"):
            osm_water.append(g)
    if e["type"] == "way" and t.get("waterway") in ("river", "stream", "canal", "ditch", "drain"):
        g = osm_geom(e)
        if g is None or g.geom_type != "LineString":
            continue
        if t.get("tunnel") in ("yes", "culvert") or str(t.get("layer", "0")).startswith("-"):
            culverts.append(g)
        elif t["waterway"] in ("ditch", "drain"):
            ditches.append(g)
        else:
            streams.append(("osm", g))
BD_STREAM = unary_union([g.buffer(12) for g in streams if not isinstance(g, tuple) and g is not None] or [Polygon()])   # (they lie metres apart: one stream)
# OSM's stretches that BD TOPO lacks, not the whole way (the owner, 2026-11-13: « still the double stream »: a long OSM way beside
# BD TOPO's for part of its length came in whole)
_extra = []
for _, g in (x for x in streams if isinstance(x, tuple)):
    rest = g.difference(BD_STREAM)
    _extra += [q for q in getattr(rest, "geoms", [rest]) if q.geom_type == "LineString" and q.length >= 10]
streams = [g for g in streams if not isinstance(g, tuple)] + _extra
CULV = unary_union([g.buffer(2.5) for g in culverts]) if culverts else Polygon()
water = unary_union([water] + osm_water)
WATER_ALL = water                                          # with what the decks cover, for their sides
RUN_DECK = unary_union([d["g"] for d in decks if d["kind"] != "rail"] or [Polygon()])
water = water.difference(DECK_ALL)
# a watercourse runs on under a bridge (the owner, 2026-11-14: « OpenStreetMap is right here, there is no discontinuity »: the
# Mérantaise was cut under a road bridge): its line is drawn across, between the deck's 515 sides; it is cut only where the data
# says it runs underground — an OSM culvert or tunnel, and only along it (a culvert of the Ru Beaucain meeting the Mérantaise
# cut the Mérantaise too)


def off_culverts(g):
    if g is None or g.is_empty or not culverts:
        return g
    cut = []
    for cv in culverts:
        if not g.intersects(cv.buffer(2.5)):
            continue
        along_ = g.intersection(cv.buffer(2.5, cap_style="flat"))
        if along_.length >= 0.5 * cv.length:                  # (it runs along the culvert, not across its end)
            cut.append(cv.buffer(2.5, cap_style="flat"))
    return g.difference(unary_union(cut)) if cut else g


streams = [off_culverts(g) for g in streams if g is not None]
ditches = [off_culverts(g) for g in ditches]
# wetlands (the owner, 2026-11-12: « you completely ignored the wetland »): OpenStreetMap's natural=wetland — marsh, wet meadow,
# reed bed, a detention basin's floor — as 308 marsh, over the ground's own colour; open water and buildings stay what they are
WET = unary_union([g for e in osm if tags(e).get("natural") == "wetland" for g in [osm_geom(e, True)]
                   if g is not None and g.geom_type.endswith("Polygon")] or [Polygon()])
log("water: OSM areas", len(osm_water), "ditches", len(ditches), "culverts", len(culverts), "wetland", round(WET.area), "m²")
hedges = [geom2d(f["geometry"]) for f in bdtopo("haie")] + [osm_geom(e) for e in osm if e["type"] == "way" and tags(e).get("barrier") == "hedge"]
hedges = [h for h in hedges if h is not None]
walls = []                                                  # (line, kind, retaining)
for f in bdtopo("construction_lineaire"):
    nat = (f["properties"].get("nature") or "").lower(); g = geom2d(f["geometry"])
    if g is None:
        continue
    if nat.startswith("mur"):
        walls.append((g, "wall", "soutènement" in nat))
for e in osm:
    t = tags(e)
    if e["type"] == "way" and t.get("barrier") in ("wall", "city_wall", "retaining_wall", "fence", "guard_rail", "handrail"):
        g = osm_geom(e)
        if g is not None:
            kind = "fence" if t["barrier"] in ("fence", "guard_rail", "handrail") else "wall"
            walls.append((g, kind, t["barrier"] == "retaining_wall"))
# an OSM wall within 1 m along a BD TOPO wall is the same wall
kept = []
for g, kind, ret in walls:
    if any(k[1] == kind and g.length > 0 and g.buffer(1.2).contains(k[0].interpolate(0.5, normalized=True)) and k[0].hausdorff_distance(g) < 2 for k in kept):
        continue
    kept.append((g, kind, ret))
walls = kept
log("paved", round(PAVED.area), "m²; walls/fences", len(walls), "hedges", len(hedges), "steps", len(steps), "paths", len(path_lines))

# ---- sports grounds: OpenStreetMap's pitches and tracks (their sport and surface), BD TOPO's « terrains de sport » where OSM has
# none; the map draws a grass or turf pitch as open land, a hard one (clay, a court, the track) as paved area; town_3d.py draws
# their surface, markings, goals and nets from src/sports.json ---------------------------------------------------------------------
SPORT_SURF = {"grass": "grass", "artificial_turf": "turf", "clay": "clay", "tartan": "hard", "acrylic": "hard", "rubber": "hard",
              "asphalt": "asphalt", "concrete": "asphalt", "paved": "asphalt", "fine_gravel": "sand", "sand": "sand", "gravel": "sand",
              "dirt": "sand", "ground": "sand", "compacted": "sand"}
SPORT_DEFAULT = {"soccer": "grass", "rugby": "grass", "tennis": "hard", "athletics": "hard", "multi": "asphalt", "basketball": "asphalt",
                 "boules": "sand", "handball": "asphalt"}
# courts and the track are paved areas one may not enter (the owner, 2026-11-11: « not crossable »; the owner's mapper, 2026-11-12:
# « the track is obviously a paved area »): 501 on the map, the tennis courts fenced all round, the others under the course
# setter's 709 out-of-bounds hatching (ISSprOM's way for ground that exists but is not to be entered)
# the athletics track is paving one may run on (the owner, 2026-11-12, changing the rule of 2026-11-11): 501 with its edges, no
# hatching
NO_ENTRY = ("tennis", "padel")
# no 709 on a sports ground: it is the course setter's purple overprint, not a base-map symbol (the owner, 2026-11-13: « use the
# standard »); a multi-sport court is paving with its edge, like the track, fenced only where the LiDAR sees a fence
HATCHED = ()
SPORT_NAME = lambda s: "rugby" if s.startswith("rugby") else "athletics" if s in ("athletics", "running") else s
sports = []
for e in osm:
    t = tags(e)
    if t.get("leisure") not in ("pitch", "track") or e["type"] == "node" or t.get("indoor") == "yes":
        continue
    g = osm_geom(e, area=True)
    if g is None or g.is_empty or not g.geom_type.endswith("Polygon") or not g.intersects(frame):
        continue
    sp = SPORT_NAME((t.get("sport") or ("athletics" if t.get("leisure") == "track" else "multi")).split(";")[0])
    sports.append({"sport": sp, "surface": SPORT_SURF.get(t.get("surface", ""), SPORT_DEFAULT.get(sp, "sand")), "g": g, "src": "osm"})
BD_SPORT = {"terrain de rugby": "rugby", "terrain de football": "soccer", "terrain de tennis": "tennis", "stade d'athlétisme": "athletics",
            "piste de sport": "athletics", "terrain de basket-ball": "basketball", "terrain de handball": "handball"}
for f in bdtopo("terrain_de_sport"):
    p = f["properties"]; g = geom2d(f["geometry"])
    if g is None or not g.geom_type.endswith("Polygon") or not g.intersects(frame):
        continue
    g = g.buffer(0)
    if any(s["g"].intersection(g).area > 0.5 * min(g.area, s["g"].area) for s in sports):
        continue                                                      # OpenStreetMap has it, with its surface
    sp = BD_SPORT.get((p.get("nature_detaillee") or p.get("nature") or "").lower(), "multi")
    if sp == "athletics" and g.buffer(-9).area > 0:
        g = g.difference(g.buffer(-8.5))                              # a filled oval: its track, ~7 lanes
    sports.append({"sport": sp, "surface": SPORT_DEFAULT.get(sp, "sand"), "g": g, "src": "bdtopo"})
json.dump([{"sport": s["sport"], "surface": s["surface"], "src": s["src"],
            "polys": [[list(map(lambda c: [round(c[0], 2), round(c[1], 2)], p.exterior.coords))] + [[[round(x, 2), round(y, 2)] for x, y in r.coords] for r in p.interiors]
                      for p in getattr(s["g"], "geoms", [s["g"]])]} for s in sports], open(SRC / "sports.json", "w"))
log("sports grounds", len(sports), {k: sum(1 for s in sports if s["sport"] == k) for k in sorted({s["sport"] for s in sports})})

# ---- private ground: the cadastre's parcels holding houses, schools, the railway ----------------------------------------------
parcels = []
for f in SRC.glob("parcelles_*.json"):
    from l93 import transformer
    tr = transformer(4326, 2154)
    for p in json.load(open(f))["features"]:
        g = shape(p["geometry"])
        g = shapely.transform(g, lambda c: np.c_[tr.transform(c[:, 0], c[:, 1])])
        if g.intersects(frame):
            parcels.append(g.buffer(0))
bidx = shapely.STRtree([g for g, _ in buildings])
private = []
PUBLIC_USE = ("religieux", "sportif")
for pg in parcels:
    if pg.area > 6000:
        continue
    hits = bidx.query(pg)
    res = sum(buildings[i][0].intersection(pg).area for i in hits
              if (buildings[i][1].get("usage_1") or "").lower().startswith("résidentiel") and buildings[i][1].get("nature", "").lower() not in ("église", "chapelle"))
    pub = any((buildings[i][1].get("usage_1") or "").lower().startswith(PUBLIC_USE) for i in hits if buildings[i][0].intersection(pg).area > 20)
    # a house's garden only (the owner's mapper, 2026-11-12: an accessible courtyard came out olive): not the ground of a block of
    # flats (3 dwellings or more) nor of a building with shops or services, which is open to whoever passes
    def open_to_all(pr, g):
        u = ((pr.get("usage_1") or "") + " " + (pr.get("usage_2") or "")).lower()
        return "commercial" in u or (pr.get("nombre_de_logements") or (0 if g.area < 250 else 3)) >= 3
    flats = any(open_to_all(buildings[i][1], buildings[i][0]) for i in hits if buildings[i][0].intersection(pg).area > 20)
    if res > 25 and not pub and not flats:
        private.append(pg)
for f in bdtopo("zone_d_activite_ou_d_interet"):
    p = f["properties"]; cat = (p.get("categorie") or "").lower(); nat = (p.get("nature") or "").lower()
    if cat.startswith("science et enseignement") and any(k in nat for k in ("école", "collège", "lycée", "enseignement")):
        g = geom2d(f["geometry"])
        if g is not None and g.geom_type.endswith("Polygon"):
            private.append(g.buffer(0))
for e in osm:
    t = tags(e)
    if t.get("access") in ("private", "no") and (t.get("landuse") or t.get("leisure") or t.get("amenity")) and t.get("amenity") != "parking":
        g = osm_geom(e, area=True)
        if g is not None and g.geom_type.endswith("Polygon"):
            private.append(g)
PRIVATE = unary_union(private) if private else Polygon()
if not RAIL.is_empty:
    PRIVATE = PRIVATE.union(RAIL.buffer(5, cap_style="flat"))
# the streets and paths are public whatever the cadastre says; the buildings are drawn as buildings
PRIVATE = PRIVATE.difference(PAVED.buffer(0.3)).difference(B)
# a bridge's deck is no ground not to be entered (2026-11-14: a road bridge over the railway's corridor had its margins in olive,
# its 515 sides inside it); the railway's own decks apart
PRIVATE = PRIVATE.difference(unary_union([d["g"] for d in decks if d["kind"] != "rail"] or [Polygon()]))
# a path open to all runs through the ground not to be entered on a corridor of its own (2026-11-14, remark 17's test: paths cut by a
# garden's olive left two ends facing each other a few metres apart; a public path is a right of way, the olive is what is wrong)
PW_CORR = unary_union([g.buffer(1.1, cap_style="flat") for g in PUBLIC_WAYS] or [Polygon()])   # (2.2 m: wider than the open land's minimum)
PRIVATE = PRIVATE.difference(PW_CORR)
log("private ground", round(PRIVATE.area), "m²")
# the public road space (the owner's mapper, 2026-11-12: « a paved area in town nearly always has a definite edge, and the strip at
# its side is a sidewalk »): what the cadastre leaves between its parcels — the streets with their sidewalks up to the property
# line, the squares —, within the parcels' own reach (beyond the commune the cadastre says nothing)
PARCELS = unary_union(parcels) if parcels else Polygon()
PUBLIC = Polygon()
if parcels:
    PUBLIC = PARCELS.buffer(20, join_style="mitre").buffer(-20, join_style="mitre").difference(PARCELS).intersection(frame).difference(B)
    PUBLIC = PUBLIC.buffer(-0.25).buffer(0.25)                    # the slivers between two parcels' edges
    # only by a street or a square (the owner, 2026-11-13: the strip the cadastre leaves along a stream came out as a paved path):
    # a watercourse's own strip, a field's, are no road space
    _roads = unary_union([c for c, _, _ in carr] + [paved_poly for paved_poly in paved if paved_poly.area > 200] or [Polygon()])
    PUBLIC = PUBLIC.intersection(_roads.buffer(15))
log("public road space", round(PUBLIC.area), "m²")

# ---- the classes raster (priority: water > building > private > paved > vegetation/ground) --------------------------------------
step("areas")
def burn(g, val, arr, all_touched=False):
    from rasterio.features import rasterize
    from rasterio.transform import from_origin
    if g is None or g.is_empty:
        return
    m = rasterize([(g, 1)], out_shape=arr.shape, transform=from_origin(X0, Y1, R, R), fill=0, all_touched=all_touched, dtype="uint8")
    arr[m == 1] = val


K = {"forest": 1, "open": 2, "open_t": 3, "rough": 4, "slow": 5, "walk": 6, "fight": 7, "paved": 8, "private": 9, "building": 10,
     "water": 11, "imp_veg": 12, "paved_t": 13}
cl = np.zeros((NY, NX), np.uint8)
# vegetation and ground from the LiDAR and the infrared
tall = (chm > 3.0) & (Z["n5"] > 0)
canopy_cover = gaussian_filter(tall.astype(np.float32), 6)            # share of 0.5 m cells under crowns within ~6 m
mid = (chm > 0.5) & (chm <= 3.0) & ((Z["n4"] + Z["n5"]) > 1)
mid_cover = gaussian_filter(mid.astype(np.float32), 2.0)
green_ground = ndvi > 0.12
cl[:] = K["open"]
# bare, unbuilt ground: paving near buildings and streets (courtyards, schoolyards, forecourts), open land elsewhere (a field
# out of season, a sports ground's earth)
near_built = np.zeros((NY, NX), np.uint8); burn(B.buffer(12).union(PAVED.buffer(6)), 1, near_built)
# — but not by a sports ground (the owner's mapper, 2026-11-12: a run-up's or a stand's bare ground came out as paving jutting from
# the track): there it is open land, unless OSM or BD TOPO says paved (burned below)
near_sport = np.zeros((NY, NX), np.uint8)
if sports:
    _su = unary_union([s["g"] for s in sports]); burn(_su.buffer(12).difference(_su), 1, near_sport)
cl[~green_ground & (lum > 60) & (near_built == 1) & (near_sport == 0)] = K["paved"]
cl[~green_ground & (lum <= 60)] = K["open"]
# the public road space is paved — under its street trees too —, its grass (verges, planted strips) open land
pub = np.zeros((NY, NX), np.uint8); burn(PUBLIC, 1, pub)
cl[(pub == 1) & ~(green_ground & (chm < 2))] = K["paved"]
cl[(pub == 1) & green_ground & (chm < 2)] = K["open"]
# woods of 400 m² or more are forest; smaller groups and lone trees are drawn tree by tree (below): no 402 ring round them
# (the owner's mapper, 2026-11-12: « that transition does not exist on the ground »)
wood = canopy_cover > 0.6
wl, _ = label(wood); wsz = np.bincount(wl.ravel()); big = wsz >= 1600; big[0] = False
WOOD = big[wl]
cl[WOOD] = K["forest"]
cl[(mid_cover > 0.55) & ~WOOD] = K["slow"]
cl[(mid_cover > 0.8) & ~WOOD] = K["walk"]
for k in ("forest", "slow", "walk", "paved"):                          # no speck: a class keeps patches of 25 m² at least
    m = cl == K[k]; m2 = binary_opening(m, iterations=2)
    lab, n = label(m2); sz = np.bincount(lab.ravel())
    small = (sz < 100); small[0] = False
    cl[m & ~m2] = K["open"]; cl[small[lab] & m2] = K["open"]
burn(PAVED, K["paved"], cl)
burn(PRIVATE, K["private"], cl)
for s in sports:                       # a sports ground is no garden: a pitch open or paved, a court and the track not to be entered
    burn(s["g"], K["paved"] if s["sport"] in NO_ENTRY else K["open"] if s["surface"] in ("grass", "turf") else K["paved"], cl)
burn(unary_union([h.buffer(0.7, cap_style="flat") for h in hedges]) if hedges else None, K["imp_veg"], cl)
burn(water, K["water"], cl)
burn(B, K["building"], cl)
# paved under the trees: a street tree is a point symbol, the paving stays
log("classes", {k: int((cl == v).sum() * R * R) for k, v in K.items()})

# ---- vectorising ------------------------------------------------------------------------------------------------------------
def shapes_of(mask, simplify=0.35, min_area=4.0):
    from rasterio.features import shapes
    from rasterio.transform import from_origin
    out = []
    for geo, v in shapes(mask.astype(np.uint8), mask=mask, transform=from_origin(X0, Y1, R, R)):
        g = shape(geo).simplify(simplify, preserve_topology=True)
        if g.area >= min_area:
            out.append(g)
    return out


objects = []


def add_area(g, sym, min_area=2.0, ang=0):
    if g is None or g.is_empty:
        return
    g = g.intersection(CLIP)
    for p in getattr(g, "geoms", [g]):
        if p.geom_type != "Polygon" or p.area < min_area:
            continue
        rings = [[mm(x, y) for x, y in p.exterior.coords]] + [[mm(x, y) for x, y in r.coords] for r in p.interiors if Polygon(r).area > 1]
        objects.append({"sym": sym, "otp": 3, "rings": rings, **({"ang": ang} if ang else {})})


def add_line(g, sym, min_len=1.0, curve=False):
    """A line object; curve: drawn as OCAD Bézier curves through its points (mkocd.mjs), for what bends on the ground — contours,
    streams, paths (the owner's mapper, 2026-11-12: « for many line features a curve suits better than a polyline »)."""
    if g is None or g.is_empty:
        return
    g = g.intersection(CLIP)
    if g.geom_type == "GeometryCollection":
        g = shapely.MultiLineString([x for x in g.geoms if x.geom_type == "LineString"]) if any(x.geom_type == "LineString" for x in g.geoms) else None
        if g is None:
            return
    for l in getattr(g, "geoms", [g]):
        if l.geom_type in ("LineString", "LinearRing") and not l.is_empty and len(l.coords) >= 2 and l.length >= min_len:
            if curve:
                l = l.simplify(0.6)
            o = {"sym": sym, "otp": 2, "rings": [[mm(x, y) for x, y in l.coords]]}
            if curve and len(l.coords) >= 3:
                o["curve"] = True
            objects.append(o)
        elif l.geom_type == "Polygon":
            add_line(l.exterior, sym, min_len, curve)


def add_point(x, y, sym, ang=0):
    if CLIP_TO_BOX and not CLIP.covers(Point(x, y)):
        return
    objects.append({"sym": sym, "otp": 1, "ang": ang, "rings": [[mm(x, y)]]})


AREA_SYM = {"forest": None, "open": S(401), "open_t": S(402), "slow": S(406), "walk": S(408), "fight": S(410), "paved": S(501),
            "private": S(520), "water": S(301), "imp_veg": S(411)}
# the areas as one coverage, simplified together (the owner's mapper, 2026-11-12: « smooth the objects' edges »): the 0.5 m cells'
# staircases go, two neighbours keep one shared edge (no gap, no overlap)
from rasterio.features import shapes as _shapes
from rasterio.transform import from_origin as _from_origin
_cov, _val = [], []
for geo, v in _shapes(cl, transform=_from_origin(X0, Y1, R, R)):
    _cov.append(shape(geo)); _val.append(int(v))
log("coverage", len(_cov), "pieces")
_cov = shapely.coverage_simplify(np.array(_cov, dtype=object), tolerance=1.2)
log("coverage simplified")
KNAME = {v: k for k, v in K.items()}
# what has a vector source is drawn from it, exactly: the water, the hedges, the ground not to be entered (the cadastre's
# parcels, the railway, the courts), the sports grounds, the paving (the streets, the public road space but its grass, the
# squares); the LiDAR's areas fill the rest, cut to those edges — and stretched under them where the raster's own cells of a
# vector class stood, so that no hairline of white (forest) opens between the two
HEDGE_G = unary_union([h.buffer(0.7, cap_style="flat") for h in hedges]) if hedges else Polygon()
HEDGE_G = HEDGE_G.difference(PRIVATE.buffer(-1.0))          # a hedge inside the ground not to be entered says nothing: left out
OPEN_R = unary_union([g for g, v in zip(_cov, _val) if KNAME.get(v) == "open"])
GREEN_PUB = OPEN_R.intersection(PUBLIC) if not PUBLIC.is_empty else Polygon()
SP_OPEN = unary_union([s["g"] for s in sports if s["sport"] not in NO_ENTRY and s["surface"] in ("grass", "turf")] or [Polygon()])
SP_PAVED = unary_union([s["g"] for s in sports if s["sport"] in NO_ENTRY or s["surface"] not in ("grass", "turf")] or [Polygon()])
def along(line, arr, step=0.5):
    pts = [line.interpolate(d) for d in np.arange(0, line.length + 1e-6, step)]
    if not pts:
        return np.array([])
    px, py = to_px([p.x for p in pts], [p.y for p in pts])
    return arr[np.clip(py.astype(int), 0, NY - 1), np.clip(px.astype(int), 0, NX - 1)]


ZO = np.maximum(maximum_filter(Z["zo"], 3), maximum_filter(Z["zb"], 3))      # the highest non-vegetation returns, once


def height_of(line):
    """A wall or fence's height above the ground: the highest non-vegetation return within 0.5 m along it (LiDAR)."""
    v = along(line, ZO) - along(line, dtm)
    v = v[(v > 0.2) & (v < 8)]
    return float(np.median(v)) if len(v) > 3 else 0.0


# the courts' enclosures (tennis, multi-sport): their outline, fenced where the LiDAR sees something 1.5 m high along it, in 2 m
# pieces (a gate, an open side stay open)
from shapely.ops import linemerge
# a tennis court is fenced all round (the owner's mapper, 2026-11-12: OSM gives each court as its own object); a multi-sport
# court where the LiDAR sees its fence
tennis = [s["g"].boundary for s in sports if s["sport"] in ("tennis", "padel")]
if tennis:
    tl = merge_lines(unary_union(tennis))
    for l in getattr(tl, "geoms", [tl]):
        walls.append((l, "court", False))
encl = [s["g"].boundary for s in sports if s["sport"] in ("multi", "basketball", "handball")]
n_encl = len(tennis)
if encl:
    ln = merge_lines(unary_union(encl))
    for l in getattr(ln, "geoms", [ln]):
        run = []
        for d in np.arange(0, l.length, 2.0):
            piece = shapely.ops.substring(l, d, min(l.length, d + 2.0))
            if piece.length > 0.5 and height_of(piece) >= 1.5:
                run += list(piece.coords) if not run else list(piece.coords)[1:]
            elif len(run) >= 2:
                walls.append((LineString(run), "fence", False)); run = []; n_encl += 1
            else:
                run = []
        if len(run) >= 2:
            walls.append((LineString(run), "fence", False)); n_encl += 1
log("courts' fences", n_encl)


_WH = {}


def wall_class(piece, kind, ret):
    """(height, uncrossable?) of a wall or fence piece: the drawing and the reachability below use the same."""
    key = (piece.wkb, kind, ret)
    if key not in _WH:
        h = max(height_of(piece), 3.0) if kind == "court" else height_of(piece)
        if ret:                                                    # a retaining wall: the ground on its two sides differs
            a = piece.parallel_offset(1.2, "left"); b_ = piece.parallel_offset(1.2, "right")
            drop = abs(float(np.median(along(a, dtm))) - float(np.median(along(b_, dtm)))) if not a.is_empty and not b_.is_empty else 0
            h = max(h, drop)
        _WH[key] = (h, h >= 1.5)
    return _WH[key]


# ---- ground enclosed (the owner, 2026-11-13, from ISSprOM: « areas that are entirely enclosed within uncrossable features such as
# hedges and fences should be filled with symbol 520 », and « inaccessible areas inside building blocks are part of the building »):
# the uncrossable features rasterised at 0.5 m — buildings (less the passages through them), walls and fences 1.5 m high or more
# (the LiDAR along them), hedges, water, the railway —, opened at OpenStreetMap's gates and entrances; every piece of ground no way
# reaches from a street, the public road space or the map's edge is enclosed: part of the building when buildings make most of
# its edge, else 520. The sports grounds are left as they are.
step("enclosures")
bar = np.zeros((NY, NX), np.uint8)
_passes = unary_union([pc.buffer(w / 2 + 0.5, cap_style="flat") for pc, w, _ in passages] or [Polygon()])
burn(B.difference(_passes), 2, bar)
_imp = []
for g, kind, ret in walls:
    for l in getattr(g, "geoms", [g]):
        if l.geom_type == "LineString" and l.length >= 1 and height_of(l) >= 1.5:
            _imp.append(l.buffer(0.35))
_gates = unary_union([osm_geom(e).buffer(1.5) for e in osm if e["type"] == "node" and tags(e).get("barrier") in
                      ("gate", "entrance", "lift_gate", "swing_gate", "kissing_gate", "turnstile", "stile", "bollard", "cycle_barrier")]
                     or [Polygon()])
_lines_bar = unary_union(_imp + [h.buffer(0.5, cap_style="flat") for h in hedges]
                         + ([RAIL_L.buffer(2.0)] if not RAIL_L.is_empty else []) or [Polygon()]).difference(_gates)
burn(_lines_bar, 1, bar)
burn(water, 1, bar)
free = bar == 0
lab, nlab = label(free)
seed = np.zeros((NY, NX), bool)
_sd = np.zeros((NY, NX), np.uint8); burn(unary_union([PAVED, PUBLIC] + ([unary_union([pc.buffer(w / 2) for pc, w, _ in passages])] if passages else [])), 1, _sd)
seed |= _sd == 1
seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
reach = np.zeros(nlab + 1, bool); reach[np.unique(lab[seed & free])] = True; reach[0] = True
encl = free & ~reach[lab]
_sp = np.zeros((NY, NX), np.uint8)
if sports:
    burn(unary_union([s_["g"].buffer(1) for s_ in sports]), 1, _sp)
ENCL_OLIVE, ENCL_BUILD = [], []
if encl.any():
    el, ne = label(encl)
    sizes = np.bincount(el.ravel())
    from scipy.ndimage import find_objects
    for k, sl in enumerate(find_objects(el), start=1):
        if sl is None or sizes[k] < 8:                            # under 2 m²: nothing to draw
            continue
        sl2 = (slice(max(0, sl[0].start - 1), sl[0].stop + 1), slice(max(0, sl[1].start - 1), sl[1].stop + 1))
        m = el[sl2] == k
        if (_sp[sl2][m] == 1).mean() > 0.5:
            continue
        ring = binary_dilation(m) & ~m
        nb = bar[sl2][ring]
        frac_b = float((nb == 2).sum()) / max(1, int((nb > 0).sum()))
        for geo, v in _shapes(m.astype(np.uint8), mask=m, transform=_from_origin(X0 + sl2[1].start * R, Y1 - sl2[0].start * R, R, R)):
            g = shape(geo).buffer(0.3).buffer(-0.3)                # the cells' staircase smoothed a little
            (ENCL_BUILD if frac_b >= 0.85 else ENCL_OLIVE).append(g)
ENCL_OLIVE = unary_union(ENCL_OLIVE or [Polygon()]).buffer(0.26).difference(B)   # up to the features that close it
ENCL_BUILD = unary_union(ENCL_BUILD or [Polygon()]).buffer(0.26)
log("enclosed ground: 520", round(ENCL_OLIVE.area), "m², part of a building", round(ENCL_BUILD.area), "m²")


# ---- trees outside the woods: the LiDAR's crowns over paved or open ground, each a point 417 (large) or 418 — unless they stand
# closer than their symbols can (the owner, 2026-11-13: « the minimum distance between the trees is not kept; then 402/404 for a
# large area, 405 if small »): the symbols' radii and a gap of 0.15 mm apart at least; two too close keep the larger; three or more
# become an area — scattered trees (402 on open ground, 501.3 on paving) when it covers 300 m² or more, else forest (405)
from scipy.spatial import cKDTree
_c = gaussian_filter(chm, 1.0)
_olin = unary_union([PRIVATE, ENCL_OLIVE]).buffer(-1.0)
trees = []
for i, j in zip(*np.nonzero((_c == maximum_filter(_c, size=9)) & (_c > 4))):
    if cl[i, j] in (K["paved"], K["open"], K["slow"]) and not WOOD[i, j]:
        x, y = X0 + (j + 0.5) * R, Y1 - (i + 0.5) * R
        if not _olin.contains(Point(x, y)):
            trees.append((x, y, 417 if _c[i, j] > 14 else 418, int(cl[i, j])))
TREE_R = {417: 0.6, 418: 0.4}                                         # the symbols' radii, mm
TREE_POINTS, TREE_AREA = [], {"open_t": [], "paved_t": [], "forest": []}
if trees:
    xy = np.array([(t_[0], t_[1]) for t_ in trees]); par = list(range(len(trees)))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for a, b in cKDTree(xy).query_pairs((0.6 + 0.6 + 0.15) * SCALE / 1000):
        if math.dist(xy[a], xy[b]) < (TREE_R[trees[a][2]] + TREE_R[trees[b][2]] + 0.15) * SCALE / 1000:
            par[find(a)] = find(b)
    groups = {}
    for k in range(len(trees)):
        groups.setdefault(find(k), []).append(k)
    for ks in groups.values():
        if len(ks) == 1:
            TREE_POINTS.append(trees[ks[0]])
        elif len(ks) == 2:
            TREE_POINTS.append(max((trees[k] for k in ks), key=lambda t_: t_[2]))
        else:
            g = unary_union([Point(trees[k][0], trees[k][1]).buffer(3.0) for k in ks]).buffer(2.0).buffer(-2.0)
            paved_n = sum(1 for k in ks if trees[k][3] == K["paved"])
            TREE_AREA["forest" if g.area < 300 else "paved_t" if paved_n * 2 > len(ks) else "open_t"].append(g)
TREE_AREA = {k: unary_union(v).difference(B) if v else Polygon() for k, v in TREE_AREA.items()}
AREA_SYM["paved_t"] = S(501, 3)
log("trees: points", len(TREE_POINTS), "of", len(trees), "areas", {k: round(v.area) for k, v in TREE_AREA.items()})
OLIVE_A = unary_union([PRIVATE, ENCL_OLIVE]).difference(PW_CORR)
# where each piece of olive comes from (src/olive_origin.json, for the review: parcel, school, private access or railway; enclosure;
# island; no way reaches; a hedge taken in)
OLIVE_WHY = {"parcel_school_private_rail": PRIVATE, "enclosed": ENCL_OLIVE}
# a stairway at its width on the ground, which may vary (the owner, 2026-11-12: « a stairway can have a width that varies, and it
# must not be on the street »): cut where it reaches a street (its carriageway and sidewalks), then read every metre between the
# buildings (or the ground not to be entered) on either side — a stairway squeezed between them is centred in that passage, the shift
# smoothed over a few metres, and as wide as it, else the
# width OSM or BD TOPO gives (2 m without) —, the widths smoothed and rounded to 532.1-532.6 (2, 3, 4, 5, 6, 8 m at 1:4000), the
# stairway drawn in pieces of one width each (3 m at least)
STAIR_W = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0]
STREET = unary_union([c.buffer(1.8 if urb else 0.3) for c, _, urb in carr] or [Polygon()]).buffer(0.2)
_SIDES = [g for g, _ in buildings] + [q for q in getattr(OLIVE_A, "geoms", [OLIVE_A]) if q.geom_type == "Polygon"]
B_TREE = shapely.STRtree(_SIDES) if _SIDES else None


def side_dist(p, n):
    """Distance from p along n to the nearest building or ground not to be entered, within 6 m (None beyond)."""
    ray = LineString([(p.x, p.y), (p.x + n[0] * 6, p.y + n[1] * 6)])
    best = None
    for i in (B_TREE.query(ray) if B_TREE is not None else []):
        x = _SIDES[i].intersection(ray)
        if not x.is_empty:
            d = p.distance(x)
            best = d if best is None else min(best, d)
    return best


def stair_pieces(g, w0):
    out = []
    for line in getattr(g, "geoms", [g]):
        if line.geom_type != "LineString" or line.length < 1.5:
            continue
        L = line.length; ds = np.arange(0, L + 1e-6, 1.0) if L >= 2 else np.array([0, L])
        shs, ws, base = [], [], []
        for d in ds:
            p = line.interpolate(d); q0, q1 = line.interpolate(max(0, d - 0.5)), line.interpolate(min(L, d + 0.5))
            tx, ty = q1.x - q0.x, q1.y - q0.y; tn = math.hypot(tx, ty) or 1; n = (-ty / tn, tx / tn)
            dl, dr = side_dist(p, n), side_dist(p, (-n[0], -n[1]))
            if dl is not None and dr is not None and dl + dr < 9:
                shs.append((dl - dr) / 2); ws.append(max(1.5, dl + dr - 0.4))   # to the passage's middle, as wide as it
            else:
                shs.append(0.0); ws.append(w0)
            base.append((p.x, p.y, n))
        # the shift smoothed along the stairway and capped (the owner, 2026-11-13: its top zigzagged where one side changed)
        shs = np.clip(gaussian_filter(np.array(shs, float), 2.0, mode="nearest"), -3, 3) if len(shs) > 2 else np.array(shs, float)
        pts = [(x + n[0] * sh, y + n[1] * sh) for (x, y, n), sh in zip(base, shs)]
        ws = np.array([float(np.median(ws[max(0, i - 2):i + 3])) for i in range(len(ws))])
        k = [min(range(len(STAIR_W)), key=lambda j: abs(STAIR_W[j] - min(w, 8.0))) for w in ws]
        # runs of one width, a run under 5 m joined to the previous one
        runs = []
        for i, kk in enumerate(k):
            if runs and (runs[-1][0] == kk or i - runs[-1][1] < 5):
                runs[-1][2] = i
            else:
                runs.append([kk, i, i])
        for kk, i0, i1 in runs:
            seg = pts[max(0, i0 - 1 if i0 else 0):i1 + 1]
            if len(seg) >= 2:
                out.append((LineString(seg), STAIR_W[kk]))
    return out


_steps = []
for g, w in steps:
    g = g.difference(STREET)
    if not g.is_empty:
        _steps += stair_pieces(g, w)
steps = _steps
log("stairways", len(steps), "pieces", {w: sum(1 for _, x in steps if x == w) for w in STAIR_W})
# OpenStreetMap's lawns (the owner's mapper, 2026-11-12: « lawns in front of the town hall are in OSM and not on the map »: the
# photograph's infrared saw them bare, and the public road space made them paving): grass, village greens, meadows, grassland as
# open land, drawn from their outline, but where a street or a paved area of OSM or BD TOPO lies
GRASS = unary_union([g for e in osm if (tags(e).get("landuse") in ("grass", "village_green", "meadow")
                                       or tags(e).get("natural") == "grassland")
                     for g in [osm_geom(e, True)] if g is not None and g.geom_type.endswith("Polygon")] or [Polygon()])
# the paved footways and cycle paths as one paved area with the streets (the owner's mapper, 2026-11-12: « the intersections are
# still anything » — each drawn as its own double line, their edges crossed at every junction and where one met a sidewalk): the
# union of each at its width on the ground (OSM's `width`, else 2 m) and the stairways' footprints, merged into the paving, its edge 501.1 drawn with the rest;
# a piece under 16 m² touching no other paving is a scrap (a stairway's landing, a station's corridor) and left out
_pp = [g.buffer(max(1.2, fw) / 2, cap_style="flat", join_style="round") for g, fw in paved_paths]
# a stairway stands on paving (the owner's mapper, 2026-11-12: « nobody has seen a grass stairway »): its footprint at its width
_pp += [g.buffer(sw / 2 + 0.2, cap_style="flat", join_style="mitre") for g, sw in steps]
PATHS_A = unary_union(_pp).difference(B).difference(PRIVATE.buffer(-1.0)) if _pp else Polygon()
_touch = PAVED.buffer(0.5)
PATHS_A = unary_union([q for q in getattr(PATHS_A, "geoms", [PATHS_A]) if q.geom_type == "Polygon"
                       and (q.area >= 16 or q.intersects(_touch))] or [Polygon()])
log("paved footways", len(paved_paths), round(PATHS_A.area), "m²")
# a lawn in a square stays a lawn (the owner, 2026-11-13: the town hall's lawns lie in its paved « Square de la Mairie »): it gives
# way to the carriageways and the paved paths only
GRASS = GRASS.difference(unary_union([c for c, _, _ in carr] or [Polygon()])).difference(PATHS_A).difference(B) if not GRASS.is_empty else GRASS
log("OSM lawns", round(GRASS.area), "m²")
VEC_ORDER = [("bfill", ENCL_BUILD), ("water", water), ("imp_veg", HEDGE_G), ("private", OLIVE_A),
             ("forest", TREE_AREA["forest"]), ("open_t", TREE_AREA["open_t"]), ("paved_t", TREE_AREA["paved_t"]), ("open", unary_union([SP_OPEN, GRASS])),
             ("paved", unary_union([SP_PAVED, PAVED, PUBLIC.difference(GREEN_PUB), PATHS_A]))]
taken = Polygon()
COVER = {}
def _poly(g):
    """A valid geometry's surfaces only (make_valid may leave lines or points beside them)."""
    g = shapely.make_valid(g)
    if g.geom_type in ("Polygon", "MultiPolygon"):
        return g
    ps = [q for q in getattr(g, "geoms", [g]) if q.geom_type in ("Polygon", "MultiPolygon")]
    return unary_union(ps) if ps else Polygon()


for k, g in VEC_ORDER:                                              # (on a 1 cm grid: near-coincident outlines made GEOS fail)
    g = _poly(shapely.difference(_poly(shapely.intersection(_poly(g), frame, grid_size=0.01)), taken, grid_size=0.01))
    if not g.is_empty:
        COVER.setdefault(k, []).append(g)
        taken = _poly(shapely.union(taken, g, grid_size=0.01))
VECU = shapely.make_valid(taken)
RVEC = unary_union([g for g, v in zip(_cov, _val) if KNAME.get(v) in ("private", "water", "imp_veg", "building")])
log("vector areas", round(VECU.area), "m²")
# both cut once into 50 m tiles: a piece's neighbourhood is then a few tiles, not the whole map's geometry (quadratic on a large
# town)
TILE = 50.0


def tiles_of(geom):
    out = {}
    for ty in range(int((Y1 - Y0) // TILE) + 1):
        for tx in range(int((X1 - X0) // TILE) + 1):
            x = shapely.make_valid(shapely.clip_by_rect(geom, X0 + tx * TILE, Y0 + ty * TILE, X0 + (tx + 1) * TILE, Y0 + (ty + 1) * TILE))
            if not x.is_empty:
                out[(tx, ty)] = x
    return out


def near(tiles, bx):
    t0, t1 = int((bx[0] - X0) // TILE), int((bx[2] - X0) // TILE)
    u0, u1 = int((bx[1] - Y0) // TILE), int((bx[3] - Y0) // TILE)
    parts = [tiles[(tx, ty)] for tx in range(t0, t1 + 1) for ty in range(u0, u1 + 1) if (tx, ty) in tiles]
    return shapely.make_valid(unary_union(parts).intersection(sbox(*bx))) if parts else Polygon()


VT, RT = tiles_of(VECU), tiles_of(RVEC)
log("tiles", len(VT), len(RT))
for g, v in zip(_cov, _val):
    k = KNAME.get(v)
    if k in ("private", "water", "imp_veg", "building") or g.is_empty:
        continue
    bx = g.buffer(0.6).bounds
    local_v = near(VT, bx)
    local_r = near(RT, bx)
    g = shapely.make_valid(g)
    if not local_r.is_empty:
        g = g.union(g.buffer(0.4).intersection(local_r))
    if not local_v.is_empty:
        g = g.difference(local_v)
    if not g.is_empty:
        COVER.setdefault(k, []).append(g)
log("areas cut")
# no sliver (the owner's mapper, 2026-11-12: thin white, yellow and paved strips between a garden and a building; « small things
# should be removed if they don't exist or aren't useful »): any part of an area under 1 m across goes to the area it shares the
# longest edge with (a strip between two buildings stays what it is)
GEOM = {k: shapely.make_valid(unary_union(v)).buffer(0) for k, v in COVER.items() if v}
BT = {k: tiles_of(g.boundary) for k, g in GEOM.items()}     # each class's edges in 50 m tiles: a strip's neighbours, read locally
moved, n_bits = {}, 0
for k in list(GEOM):
    if k == "water":
        continue
    g = GEOM[k]
    thin = g.difference(g.buffer(-0.5).buffer(0.55))
    for q in getattr(thin, "geoms", [thin]):
        if q.geom_type != "Polygon" or q.area < 0.01:
            continue
        qb = q.buffer(0.05)
        best = max(((qb.intersection(near(BT[o], qb.bounds)).length, o) for o in GEOM if o not in (k, "water")), default=(0, None))
        if best[0] > 0.3:
            moved.setdefault(k, []).append(q); moved.setdefault("+" + best[1], []).append(q); n_bits += 1
for k, qs in moved.items():
    if k.startswith("+"):
        GEOM[k[1:]] = GEOM[k[1:]].union(unary_union(qs)).buffer(0)
    else:
        GEOM[k] = GEOM[k].difference(unary_union(qs)).buffer(0)
# ground reached only through the ground not to be entered is not to be entered either (the owner, 2026-11-13: an island of open
# land inside a garden, with its trees): an area piece whose edge is olive or building for 95 % of its length becomes olive, and
# what lies in it is left out with the rest of the olive
if GEOM.get("private") is not None and not GEOM["private"].is_empty:
    OT = tiles_of(GEOM["private"].buffer(0.1)); BT_ = tiles_of(B.buffer(0.1))
    isl = []
    for k in [k for k in GEOM if k not in ("private", "water", "bfill")]:
        keep = []
        for q in getattr(GEOM[k], "geoms", [GEOM[k]]):
            if q.geom_type != "Polygon" or q.area > 3000 or q.intersection(PW_CORR).area > 0.3 * q.area:
                keep.append(q); continue                              # (a public path's corridor stays)
            bd = q.exterior; bx = q.buffer(0.2).bounds
            o_len = bd.intersection(near(OT, bx)).length
            # (open on less than a metre: an entrance wider than that is a way in — the check widens it to 0.4 mm if needed;
            # the owner, 2026-11-15: « widen the entrances just enough »)
            if o_len > 0 and bd.length - (o_len + bd.intersection(near(BT_, bx)).length) < 1.0:
                isl.append(q)
            else:
                keep.append(q)
        GEOM[k] = unary_union(keep) if keep else Polygon()
    if isl:
        GEOM["private"] = unary_union([GEOM["private"]] + isl).buffer(0)
    OLIVE_WHY["island"] = unary_union(isl) if isl else Polygon()
    log("islands given to the olive", len(isl), round(sum(q.area for q in isl)), "m²")
# ---- ground no way reaches, on the cover as drawn (2026-11-14, remarks 6 and 7 as the tests read them): the uncrossable features
# (buildings less the passages through them, the olive, water, hedges, walls and fences 1.5 m high or more open at the gates, the
# railway open under the decks) cut the map into pieces; a piece that does not touch the map's edge is ground no runner reaches
# from the streets: part of the building when buildings make 85 % of its edge, else 520. The enclosures above (on the ground
# before the olive) leave out ground closed by the olive itself, by a pond, by a fenced court
step("reach")
_wb = []
for g, kind, ret in walls:
    for l in getattr(g, "geoms", [g]):
        l = l.difference(B.buffer(0.3))
        for piece in getattr(l, "geoms", [l]):
            if piece.geom_type == "LineString" and piece.length >= 2 and wall_class(piece, kind, ret)[1]:
                _wb.append(piece.buffer(0.8, cap_style="flat"))
_open_decks = unary_union([d["g"] for d in decks if d["kind"] != "rail"] or [Polygon()])
_bar_l = unary_union(_wb or [Polygon()]).difference(_gates)
if not RAIL.is_empty:
    _bar_l = unary_union([_bar_l, RAIL.buffer(0.6).difference(_open_decks)])
_bar_a = [B.difference(_passes)] + [GEOM[k] for k in ("private", "water", "imp_veg", "bfill") if k in GEOM]
BARR = shapely.make_valid(unary_union(_bar_a + [_bar_l])).difference(_passes)
_free = _poly(shapely.difference(CLIP, BARR, grid_size=0.01))
_edge = CLIP.exterior
U_OL, U_BF = [], []
_Bb = B.buffer(0.4)
for q in getattr(_free, "geoms", [_free]):
    if q.geom_type != "Polygon" or q.area < 0.5 or q.distance(_edge) <= 1.0:
        continue
    L = q.exterior.length
    (U_BF if L > 0 and q.exterior.intersection(_Bb).length >= 0.85 * L else U_OL).append(q)
if U_OL or U_BF:
    _U = unary_union(U_OL + U_BF)
    for k in [k for k in GEOM if k not in ("private", "water", "imp_veg", "bfill")]:
        GEOM[k] = _poly(GEOM[k].difference(_U))
    if U_OL:
        GEOM["private"] = _poly(unary_union([GEOM.get("private", Polygon()), unary_union(U_OL).difference(B)]))
    if U_BF:
        GEOM["bfill"] = _poly(unary_union([GEOM.get("bfill", Polygon()), unary_union(U_BF)]))
OLIVE_WHY["reach"] = unary_union(U_OL) if U_OL else Polygon()
log("ground no way reaches: 520", len(U_OL), round(sum(q.area for q in U_OL)), "m², building", len(U_BF), round(sum(q.area for q in U_BF)), "m²")
# a hedge whose edge is olive for most of its length lies in the ground not to be entered: generalised into it (remark 13)
if GEOM.get("imp_veg") is not None and not GEOM["imp_veg"].is_empty and GEOM.get("private") is not None:
    _ob = GEOM["private"].buffer(0.3)
    _in, _keep = [], []
    for q in getattr(GEOM["imp_veg"], "geoms", [GEOM["imp_veg"]]):
        # (90 %: a hedge between a garden and the street is the garden's boundary, kept; 2026-11-15, remark 5's test)
        (_in if q.geom_type == "Polygon" and q.exterior.intersection(_ob).length >= 0.9 * q.exterior.length else _keep).append(q)
    if _in:
        GEOM["imp_veg"] = unary_union(_keep) if _keep else Polygon()
        GEOM["private"] = _poly(unary_union([GEOM["private"]] + _in))
        OLIVE_WHY["hedge"] = unary_union(_in)
    log("hedges inside the olive", len(_in))
json.dump({k: shapely.geometry.mapping(v.simplify(0.2)) for k, v in OLIVE_WHY.items() if v is not None and not v.is_empty},
          open(SRC / "olive_origin.json", "w"))
COVER = {k: [g] for k, g in GEOM.items() if not g.is_empty}
log("slivers merged into a neighbour", n_bits)
# the through roads (BD TOPO's importance 1-3: the départementales) as paved area with heavy traffic (the owner's mapper,
# 2026-11-12: OpenOrienteering Mapper's 501 / 501.10, each with its edge)
PAVED_ALL = shapely.make_valid(unary_union(COVER.get("paved", []))).buffer(0)
HEAVY = unary_union([c for c, imp, _ in carr if imp <= 3] or [Polygon()]).intersection(PAVED_ALL).buffer(0)
if not HEAVY.is_empty:
    COVER["paved"] = [PAVED_ALL.difference(HEAVY)]
    COVER["heavy"] = [HEAVY]
    AREA_SYM["heavy"] = S(501, 4)
if COVER.get("paved_t"):                                            # (paving with scattered trees: the same paving, no edge between)
    PAVED_ALL = shapely.make_valid(unary_union([PAVED_ALL] + COVER["paved_t"])).buffer(0)
for k, sym in AREA_SYM.items():                                     # one geometry a class: no seam between two pieces
    if sym and COVER.get(k):
        add_area(shapely.make_valid(unary_union(COVER[k])).buffer(0), sym, 6 if k != "water" else 2)
inside = frame.buffer(-0.01)
# buildings that touch are drawn as one, no line between them (the owner's mapper, 2026-11-12: « adjoining buildings: don't show
# the borders, nobody cares »); a shed of under 20 m² inside the ground not to be entered is left out (what lies there is
# generalised: the runner never goes in)
OLIVE_IN = unary_union([PRIVATE] + COVER.get("private", [])).buffer(-1.0)     # (the olive as drawn: its islands too)
# (welded within 0.7 m: a notch narrower than that in an outline is drawn closed — an outline with building on both sides of it;
# 2026-11-15, remark 12's test)
blocks = unary_union([g.buffer(0.35, join_style="mitre") for g, _ in buildings] + [ENCL_BUILD]).buffer(-0.35, join_style="mitre")
# a passage through a building (a porch, a covered driveway) is no tunnel: the building cut there and the passage a canopy, 522
# (ISSprOM: a roofed area one runs under), no 512 symbol (the owner's mapper, 2026-11-12)
def _beyond(pc, d):
    """The two points d metres beyond a line's ends."""
    out = []
    for e, q in ((pc.coords[0], pc.coords[1]), (pc.coords[-1], pc.coords[-2])):
        dx, dy = e[0] - q[0], e[1] - q[1]; n_ = math.hypot(dx, dy) or 1
        out.append(Point(e[0] + dx / n_ * d, e[1] + dy / n_ * d))
    return out


def through_building(pc):
    # (2026-11-14, remark 6's test: a porch opening on a garden made a canopy no way reaches: it must lead out on both sides)
    if any(OLIVE_IN.buffer(1.5).contains(q) for q in _beyond(pc, 2.0)):
        return False
    return pc.length > 0 and pc.intersection(B).length >= 0.6 * pc.length and not pc.intersects(DECK_ALL)         and (RAIL_L.is_empty or not pc.intersects(RAIL_L.buffer(4)))


BPASS = unary_union([pc.buffer(max(2.5, w) / 2, cap_style="flat") for pc, w, _ in passages if through_building(pc)] or [Polygon()]).intersection(B)
if not BPASS.is_empty:
    blocks = blocks.difference(BPASS)
for g in getattr(blocks, "geoms", [blocks]):
    if g.geom_type != "Polygon" or (g.area < 20 and OLIVE_IN.contains(g)):
        continue
    g = g.simplify(0.15)
    add_area(g, S(521))
    add_line(g.boundary, S(521, 9))
if not canopy.is_empty:
    cg = canopy.difference(B)
    add_area(cg, S(522)); add_line(cg.boundary if not cg.is_empty else None, S(522, 9))
if not BPASS.is_empty:
    add_area(BPASS, S(522), 1)
# the marsh over the ground (308: blue lines, no fill), outside water, buildings, paving and the ground not to be entered
if not WET.is_empty:
    add_area(WET.intersection(frame).difference(water).difference(B).difference(PAVED_ALL).difference(PRIVATE.buffer(-1.0)), S(308), 20)
# the two levels (see « two levels » above)
def right_out(l, inside):
    """The line turned so that its right side (512.1's triangles) looks out of `inside`."""
    m = l.interpolate(0.5, normalized=True); q = l.interpolate(min(l.length, l.project(m) + 0.3))
    p0 = l.interpolate(max(0.0, l.project(m) - 0.3)); dx, dy = q.x - p0.x, q.y - p0.y; n = math.hypot(dx, dy) or 1
    return LineString(l.coords[::-1]) if inside.contains(Point(m.x + dy / n * 0.6, m.y - dx / n * 0.6)) else l


from shapely.ops import linemerge
mouths, n_side, SIDES = [], 0, []
# no 515 where a passage comes out from under the bridge (the owner's mapper, 2026-11-12: a stream and a path under one street)
PASS_MOUTH = unary_union([p[0].buffer(p[1] / 2 + 1.5) for p in passages] or [Polygon()])
LOW_W = unary_union([WATER_ALL] + [g.buffer(1.0) for g in streams + ditches if g is not None and not g.is_empty])
for d in decks:                                            # a deck's sides over water, a stream or the railway beneath
    low = unary_union([LOW_W] + ([RAIL_L.buffer(4)] if d["kind"] != "rail" else [])).intersection(d["g"].buffer(2))
    if low.is_empty:
        continue
    for side in (d["w"] / 2, -d["w"] / 2):
        try:
            ln = d["axis"].offset_curve(side)
        except Exception:
            continue
        for pc in pieces_in(ln.difference(PASS_MOUTH).difference(OLIVE_IN), low.buffer(1.0)):   # a bridge one cannot pass beneath: its sides 515 (ISSprOM 512.1's text)
            SIDES.append(pc)
PASS = []
if passages:
    widths = [(p[0].buffer(0.5), p[1]) for p in passages]
    merged = merge_lines(unary_union([p[0] for p in passages]))
    lines_m = [pc for pc in getattr(merged, "geoms", [merged]) if pc.geom_type == "LineString" and pc.length >= 1]
    for i, pc in enumerate(lines_m):
        others = unary_union([q for j, q in enumerate(lines_m) if j != i] or [LineString()])
        w = max([w for b, w in widths if b.intersects(pc)] or [2.0])
        PASS.append(pc.buffer(w / 2, cap_style="flat"))
        if through_building(pc):                           # a canopy (above), no 512 symbol
            continue
        cs = list(pc.coords)
        for e, q in ((cs[0], cs[1]), (cs[-1], cs[-2])):    # a mouth at each end out in the open
            if B.buffer(-0.3).contains(Point(e)) or not frame.buffer(-1).contains(Point(e))                     or (not others.is_empty and others.distance(Point(e)) < 0.5):   # an end joining the rest of the passage: no mouth
                continue
            dx, dy = e[0] - q[0], e[1] - q[1]; n = math.hypot(dx, dy)
            if n < 1e-6:
                continue
            # long enough for two triangles at least (the owner's mapper, 2026-11-12): 1.4 mm on the map
            dx, dy, h = dx / n, dy / n, max(w / 2 + 0.5, 0.7 * SCALE / 1000)
            m = LineString([(e[0] + dy * h, e[1] - dx * h), (e[0] - dy * h, e[1] + dx * h)])
            mouths.append(m); add_line(m, S(512, 1), 0.5)
        # its sides, 512.2, wherever it runs under cover (the owner's mapper, 2026-11-12: the underpass under a street had only 512.1);
        # and where what lies above is run on too — a road or a footbridge, not the railway nor a building — 512.3 over it
        if True:
            up = pc.buffer(w / 2, cap_style="flat").difference(B)      # (the owner, 2026-11-13: under the railway too)
            if not up.is_empty and up.area >= 2:
                # its stripes at about 45° to the passage's axis (ISSprOM's 512.3; the symbol's hatching turns with the object, in 0.1°)
                c0, c1 = pc.coords[0], pc.coords[-1]
                add_area(up, S(512, 3), 2, ang=round(math.degrees(math.atan2(c1[1] - c0[1], c1[0] - c0[0])) % 180 * 10))
            # 512.2 (ISSprOM rev. 6): only at least 2 full dashes long (2.8 m), a 0.2 mm gap from the upper area's edge at each end;
            # a shorter passage is shown by its 512.3 alone
            gap_m = 0.2 * SCALE / 1000
            if pc.length >= 2.8 + 2 * gap_m:
                core = shapely.ops.substring(pc, gap_m, pc.length - gap_m)
                for side in (w / 2, -w / 2):
                    try:
                        add_line(core.offset_curve(side), S(512, 2), 2)
                    except Exception:
                        pass
    for g in PASS:
        add_area(g, S(993), 0.5)
# the sides, off the passages' mouths (2026-11-14, remark 23's test: a side ran along a mouth's 512.1)
_MO = unary_union([m.buffer(0.8) for m in mouths] or [Polygon()])
# two bridges side by side: a side within 2.9 m of a longer one along most of it is left out (one deck's own sides are 3.6 m apart;
# 0.1 mm spare on the 0.8 mm the 0.4 mm gap needs: a curved axis's offset sides come closer)
_sk = []
for pc in sorted(SIDES, key=lambda l_: -l_.length):
    if not any(pc.intersection(k_.buffer(2.9)).length >= 0.6 * pc.length for k_ in _sk):
        _sk.append(pc)
SIDES = _sk
for pc in SIDES:
    for q in getattr(pc.difference(_MO), "geoms", [pc.difference(_MO)]):
        if q.geom_type == "LineString" and q.length >= 1.0:
            add_line(q, S(515), 1); n_side += 1
json.dump({"passages": [shapely.geometry.mapping(g) for g in PASS]}, open(SRC / "passages.json", "w"))
log("bridges: deck sides", n_side, "passage mouths", len(mouths), "passages", len(PASS))
# the paved area's edge (501.1) where it meets anything but a building, a wall, a fence or a hedge already drawn, and the
# carriageways' kerbs in town — the 13 cm kerbs the 3D draws (the owner's mapper, 2026-11-12: « the paved area lacks its edge »)
NOLINE = unary_union([B.buffer(0.4), frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in walls] + [h.buffer(0.8) for h in hedges]
                     + [m.buffer(0.8) for m in mouths])
# the kerbs: the outline of the town carriageways put together, so that no line crosses a street where two sections meet
URB = unary_union([c for c, _, urb in carr if urb] or [Polygon()]).buffer(0.01)
# no sliver or spike where two sections meet at a narrow angle (the owner's mapper, 2026-11-12: a spike off a roundabout)
URB = URB.buffer(1.0, join_style="round").buffer(-2.0, join_style="round").buffer(1.0, join_style="round") if not URB.is_empty else URB
kerbs = (URB.boundary if not URB.is_empty else LineString()).intersection(PAVED_ALL.buffer(-0.5))
n_edge = 0
for line in (PAVED_ALL.boundary, kerbs):
    rest = line.difference(NOLINE)
    for piece in getattr(rest, "geoms", [rest]):
        if piece.geom_type == "LineString" and piece.length >= 2:
            add_line(piece, S(501, 1), 2); n_edge += 1        # (the areas' own vertices: the curves below then coincide)
log("paved area edges and kerbs", n_edge, "heavy traffic", round(HEAVY.area), "m²")
for g in COVER.get("water", []):
    for q in getattr(g, "geoms", [g]):
        if q.geom_type == "Polygon" and q.area >= 2:
            add_line(q.exterior, S(301, 9))

# ---- lines ------------------------------------------------------------------------------------------------------------------
step("lines")

wall_out = []
zo_cache = None
for g, kind, ret in walls:
    for l in getattr(g, "geoms", [g]):
        l = l.difference(B.buffer(0.3))
        for piece in getattr(l, "geoms", [l]):
            if piece.is_empty or piece.length < 2:
                continue
            h, imp = wall_class(piece, kind, ret)
            sym = (S(518) if imp else S(516)) if kind in ("fence", "court") else S(515) if imp else (S(513, 2) if ret else S(513, 1))
            # inside the ground not to be entered: generalised away, the part inside too (2026-11-14, remark 13's test: a retaining
            # wall half inside a garden kept its whole length)
            for q in getattr(piece.difference(OLIVE_IN), "geoms", [piece.difference(OLIVE_IN)]):
                if q.geom_type == "LineString" and q.length >= 2:
                    add_line(q.simplify(0.2), sym, 1.5)
            wall_out.append({"pts": [[round(x - X0, 2), round(Y1 - y, 2)] for x, y in piece.simplify(0.15).coords],
                             "kind": "fence" if kind == "court" else kind,
                             "h": round(max(h, 0.8 if kind in ("fence", "court") else 0.6), 2), "imp": bool(imp), "ret": bool(ret)})
for g in hedges:
    for piece in getattr(g, "geoms", [g]):
        if piece.geom_type != "LineString" or piece.length < 2:
            continue
        v = along(piece, chm); v = v[(v > 0.3) & (v < 8)]
        wall_out.append({"pts": [[round(x - X0, 2), round(Y1 - y, 2)] for x, y in piece.simplify(0.2).coords], "kind": "hedge",
                         "h": round(float(np.median(v)) if len(v) > 3 else 1.6, 2), "imp": True, "ret": False})
for g, sw in steps:                                                   # stairways, for the 3D steps (h: their width) and the control sites
    for piece in getattr(g, "geoms", [g]):
        if piece.geom_type == "LineString" and piece.length >= 1.5:
            wall_out.append({"pts": [[round(x - X0, 2), round(Y1 - y, 2)] for x, y in piece.simplify(0.2).coords], "kind": "steps",
                             "h": round(sw, 1), "imp": False, "ret": False})
log("walls and fences", len(wall_out), "impassable", sum(w["imp"] for w in wall_out))
# the goals and rugby posts on the pitches one may cross: a black cross, 531 (prominent man-made feature), at the middle of the
# goal mouth (the owner's mapper, 2026-11-12: 528, a line feature of 8.8 m at least — a pipeline, a bobsleigh track —, does not fit)
import town_sports
n_goals = 0
for s in sports:
    if s["sport"] in NO_ENTRY:
        continue
    for p_ in getattr(s["g"], "geoms", [s["g"]]):
        posts = [q for q in town_sports.layout(p_, s["sport"], s["surface"])["props"] if q[0] in ("pole", "rpole")]
        for a_, b_ in zip(posts[0::2], posts[1::2]):
            add_point((a_[1] + b_[1]) / 2, (a_[2] + b_[2]) / 2, S(531)); n_goals += 1
log("goals on the map", n_goals)
# a paved footway or cycle path is a path, not a surface (the owner's mapper, 2026-11-12: « a paved area without edge is very
# seldom useful — and there it is a path »): OpenOrienteering Mapper's 501.6-501.9, « paved area, footprint 1.4 / 2 / 3 / 4 m »,
# the paved strip with its edges at the width on the ground (OSM's `width`, else 2 m); nothing where it runs on paving already
# the path network joined before it is drawn (the owner's mapper, 2026-11-12: « the intersections are not done cleanly »): the
# lines noded and merged through their junctions, an end that stops short of another path within 4 m drawn on to it
def network(lines, snap=4.0):
    from shapely.ops import nearest_points
    u = unary_union([l for l in lines if l is not None and not l.is_empty])
    if u.is_empty:
        return []
    m = linemerge(u) if u.geom_type in ("MultiLineString", "GeometryCollection") else u
    parts = [l for l in getattr(m, "geoms", [m]) if l.geom_type == "LineString"]
    out, tree = [], shapely.STRtree(parts)
    for i, l in enumerate(parts):
        cs = list(l.coords)
        for end in (0, -1):
            pt = Point(cs[end])
            near = [parts[j] for j in tree.query(pt.buffer(snap)) if j != i]
            if not near:
                continue
            others = unary_union(near)
            d = others.distance(pt)
            if d < 0.05 or d > snap:
                continue
            q = nearest_points(others, pt)[0]
            cs = ([(q.x, q.y)] + cs) if end == 0 else (cs + [(q.x, q.y)])
        out.append(LineString(cs))
    return out


from shapely.ops import linemerge
FOOT_M = [1.4, 2.0, 3.0, 4.0]
PAVED_IN = PAVED_ALL.buffer(-0.3)                                      # once: a large polygon
# (the paved footways are part of the paved area above; an unpaved path is not drawn where it runs on paving)
_pp = []
for lines_, sym_ in ((path_lines, S(505)), (small_lines, S(506))):
    for g in network(lines_):
        r_ = g.difference(PAVED_IN).difference(B).difference(OLIVE_IN)
        _pp += [[q, sym_] for q in getattr(r_, "geoms", [r_]) if q.geom_type == "LineString" and q.length >= 3]
# one network (the owner's mapper, 2026-11-12; 2026-11-14, remark 17's test: paths stopping 0.3-4 m short of the paving or of
# another path): such an end is drawn on straight to the nearest point, unless that crosses a building or the olive
from shapely.ops import nearest_points
_pt = shapely.STRtree([q for q, _ in _pp]) if _pp else None
_PB = PAVED_ALL.boundary
n_ext = 0
for i_, (q, sym_) in enumerate(_pp):
    cs = list(q.coords)
    for end in (0, -1):
        e = Point(cs[end])
        cand = [(PAVED_ALL.distance(e), None)] + [(_pp[j][0].distance(e), j) for j in _pt.query(e.buffer(4.0)) if j != i_]
        d_, j_ = min(cand, key=lambda t_: t_[0])
        if not (0.3 < d_ < 4.0) or any(c_[0] <= 0.3 for c_ in cand):
            continue
        tp = nearest_points(e, _PB if j_ is None else _pp[j_][0])[1]
        seg = LineString([e, tp])
        if seg.intersects(B) or seg.intersects(OLIVE_IN):
            continue
        cs = ([(tp.x, tp.y)] + cs) if end == 0 else (cs + [(tp.x, tp.y)])
        n_ext += 1
    _pp[i_][0] = LineString(cs)
for q, sym_ in _pp:
    add_line(q, sym_, 3, curve=True)
log("path ends drawn on to the network", n_ext)
# stairways at their width on the ground (the owner's mapper, 2026-11-12: one width for all drew 6.6 m over the street): the
# variant of 532 nearest to it, 0.4 mm at least (mkocd.mjs makes 532.1-532.6 from the set's 532)
STAIR_MM = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
# a stairway inside the ground not to be entered is generalised away with the rest (remark 13), and cuts no contour (2026-11-14: a
# contour cut by a stairway the check then took out kept its gap, two ends in the open)
steps = [(g, sw) for g, sw in steps if g.length > 0 and g.intersection(OLIVE_IN).length < 0.5 * g.length]
for g, sw in steps:
    wmm = sw * 1000 / SCALE
    k = min(range(len(STAIR_MM)), key=lambda i: abs(STAIR_MM[i] - wmm)) + 1
    add_line(g.difference(B), S(532, k), 1)
# boundaries to confirm (the owner's mapper, 2026-11-12: « whether a thing's edge is a wall, a fence or a hedge you have to have
# been there to know; a symbol 'automatic fence' to be replaced or confirmed »): the edge of the ground not to be entered (gardens,
# schools, the railway, courts) where no wall, fence, hedge or building is known within 1.5 m — 995, purple 50 %, a helper
# the edge of a grass or turf pitch (football, rugby…): 415, a distinct cultivation boundary (the owner's mapper, 2026-11-12),
# not where a building, wall, fence or hedge already stands
EDGE_NO = unary_union([B.buffer(0.4), frame.boundary.buffer(0.6), CLIP.boundary.buffer(0.6)] + [g.buffer(0.6) for g, _, _ in walls] + [h.buffer(0.8) for h in hedges])
for s in sports:
    if s["sport"] not in NO_ENTRY and s["surface"] in ("grass", "turf"):
        rest = s["g"].boundary.difference(EDGE_NO)
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 2:
                add_line(piece, S(415), 2)
# a paved sports ground's outline — the track's two edges, a hard pitch, a multi-sport court — as 501.1 (the owner's mapper,
# 2026-11-12: « the track's edge, well drawn in OSM, is not on the map »: the ground round it came out paved too, and one paved
# area has no edge inside); the tennis courts have their fence
# — only inside the paving and off its own edge (2026-11-14, the remarks' tests: a court's OSM outline running out of the paving crossed
# the paving's 501.1 edge at a junction; where the two coincide, the paving's edge is the one drawn)
PAVED_CORE = PAVED_ALL.buffer(-0.6)
for s in sports:
    if s["surface"] not in ("grass", "turf") and s["sport"] not in ("tennis", "padel"):
        rest = s["g"].boundary.intersection(PAVED_CORE).difference(EDGE_NO)
        for piece in getattr(rest, "geoms", [rest]):
            if piece.geom_type == "LineString" and piece.length >= 2:
                add_line(piece, S(501, 1), 2)
OLIVE = PRIVATE
for s in sports:                                                       # the track and the multi-sport courts: 709 over the paving
    if s["sport"] in HATCHED:
        add_area(s["g"], S(709))
KNOWN = unary_union([g.buffer(1.5) for g, _, _ in walls] + [h.buffer(1.5) for h in hedges] + [B.buffer(1.0), frame.boundary.buffer(1.0), CLIP.boundary.buffer(1.0)])
n_conf = 0
if not OLIVE.is_empty:
    edge = OLIVE.boundary.difference(KNOWN)
    for piece in getattr(edge, "geoms", [edge]):
        if piece.geom_type == "LineString" and piece.length >= 4:
            add_line(piece.simplify(0.3), S(995), 4); n_conf += 1
log("boundaries to confirm", n_conf)
for g in streams:
    if g is not None:
        add_line(g.difference(water.buffer(0.5)).difference(B), S(305), 3, curve=True)
for g in ditches:
    add_line(g.difference(water.buffer(0.5)).difference(B).difference(OLIVE_IN), S(306), 3, curve=True)
if not RAIL.is_empty:
    add_line(RAIL.intersection(CLIP), S(509, 1), 3)

# contours: every 2.5 m from the LiDAR's ground, smoothed, through the buildings, square across the streets, cut at the stairways
step("contours")
from skimage.measure import find_contours
# the owner's mapper, 2026-11-12: « parasite relief » and « contours that stop in the middle of nowhere — not allowed »: the
# ground smoothed over 4 m (a town's ground holds kerbs, walls, embankments and the LiDAR's gaps), each line rounded (Chaikin);
# a contour is dropped whole or kept whole — a closed loop under 600 m², a line under 40 m at the map's edge.
# The owner, 2026-11-13, from ISSprOM: a contour is not cut at the buildings (the brown is printed over their grey: cut, a town's
# contours could be seen nowhere); « contour lines shall be drawn at right angles crossing streets » (each crossing of a street
# shorter than three times its width laid square across it, the street's direction read from its carriageway's axis); « contour
# lines shall be cut when crossing stairs »; the line simplified before it is rounded (no small kink left)
def spaced(pts, d, closed=False):
    """The points that define a line at least d apart (its ends kept): no wiggle for the curve to follow (the owner, 2026-11-13)."""
    out = [pts[0]]
    for q in pts[1:-1]:
        if math.dist(q, out[-1]) >= d:
            out.append(q)
    if math.dist(pts[-1], out[-1]) < d * 0.5 and len(out) > 1 and not closed:
        out.pop()
    out.append(pts[-1])
    return np.array(out, float) if len(out) >= 2 else np.asarray(pts, float)


def chaikin(pts, n=2, closed=False):
    pts = np.asarray(pts, float)
    for _ in range(n):
        a, b = pts[:-1], pts[1:]
        q, r = 0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b
        mid = np.empty((len(q) * 2, 2)); mid[0::2] = q; mid[1::2] = r
        pts = np.vstack([mid, mid[:1]]) if closed else np.vstack([pts[:1], mid, pts[-1:]])
    return pts


sm = gaussian_filter(dtm, 8.0)
lo, hi = math.floor(sm.min() / 2.5) * 2.5, math.ceil(sm.max() / 2.5) * 2.5
STAIR_A = unary_union([g.buffer(sw / 2 + 0.3, cap_style="flat") for g, sw in steps] or [Polygon()])
_axes = [(l, h) for (h, _, _), ls in carr_lines.items() for g in ls for l in getattr(g, "geoms", [g]) if l.geom_type == "LineString"]
AX_TREE = shapely.STRtree([l for l, _ in _axes]) if _axes else None


def square_streets(line):
    """The line's crossings of the streets laid square across them."""
    if AX_TREE is None or STREET.is_empty or not line.intersects(STREET):
        return line
    L = line.length; ds = np.arange(0, L + 1e-6, 0.5)
    pts = [line.interpolate(d) for d in ds]
    inside = shapely.contains_xy(STREET, [q.x for q in pts], [q.y for q in pts])
    out, i, n = [], 0, len(pts)
    while i < n:
        if not inside[i]:
            out.append((pts[i].x, pts[i].y)); i += 1; continue
        j = i
        while j < n and inside[j]:
            j += 1
        if i == 0 or j >= n:                                   # the line begins or ends in the street: left as it is
            out += [(q.x, q.y) for q in pts[i:j]]; i = j; continue
        A, Bp = pts[i - 1], pts[j]; mid = Point((A.x + Bp.x) / 2, (A.y + Bp.y) / 2)
        ax = _axes[AX_TREE.nearest(mid)][0]; s0 = ax.project(mid)
        p0, p1 = ax.interpolate(max(0, s0 - 1.5)), ax.interpolate(min(ax.length, s0 + 1.5))
        tx, ty = p1.x - p0.x, p1.y - p0.y; tn = math.hypot(tx, ty) or 1; nx_, ny_ = -ty / tn, tx / tn
        across = LineString([(mid.x - nx_ * 40, mid.y - ny_ * 40), (mid.x + nx_ * 40, mid.y + ny_ * 40)]).intersection(STREET)
        seg = None
        for q in getattr(across, "geoms", [across]):
            if q.geom_type == "LineString" and q.distance(mid) < 0.5:
                seg = q; break
        run = (j - i) * 0.5
        if seg is None or run > 3 * seg.length + 4:            # along the street rather than across: left as it is
            out += [(q.x, q.y) for q in pts[i:j]]; i = j; continue
        e0, e1 = seg.coords[0], seg.coords[-1]
        if math.dist(e0, (A.x, A.y)) > math.dist(e1, (A.x, A.y)):
            e0, e1 = e1, e0
        # the line comes to the street over 3 m (the points nearer its edge dropped: they made a loop) and crosses it straight, two
        # points within the crossing holding the curve to it
        while out and STREET.distance(Point(out[-1])) < 3.0 and len(out) > 1:
            out.pop()
        dx, dy = e1[0] - e0[0], e1[1] - e0[1]
        out += [e0, (e0[0] + dx * 0.2, e0[1] + dy * 0.2), (e1[0] - dx * 0.2, e1[1] - dy * 0.2), e1]
        k = j
        while k < n and STREET.distance(pts[k]) < 3.0:
            k += 1
        i = k if k < n else j
    if len(out) < 2:
        return line
    c0, c1 = tuple(line.coords[0]), tuple(line.coords[-1])    # (the samples every 0.5 m end short of the line's end: a loop came
    if math.dist(out[0], c0) > 1e-6:                          # out 0.4 m open, two ends in the open)
        out.insert(0, c0)
    if math.dist(out[-1], c1) > 1e-6:
        out.append(c1)
    return LineString(out)


nc = 0
for lv in np.arange(lo, hi + 0.01, 2.5):
    idx = abs((lv / 2.5) % 5) < 1e-6
    for c in find_contours(sm, lv):
        if len(c) < 6:
            continue
        closed = np.hypot(*(c[0] - c[-1])) < 1e-6
        xy = np.c_[X0 + (c[:, 1] + 0.5) * R, Y1 - (c[:, 0] + 0.5) * R]
        if closed and Polygon(xy).area < 600:
            continue
        l = LineString(chaikin(spaced(np.array(LineString(xy).simplify(0.8).coords), 4.0, closed), 3, closed))
        if not closed and l.length < 40:
            continue
        l = square_streets(l)
        if closed and Polygon(l.coords).area < 600:            # (smoothed, a loop shrinks)
            continue
        cut = l.difference(STAIR_A)
        if cut.geom_type == "MultiLineString":                # (a loop's difference splits it at its first point too: rejoined)
            cut = linemerge(cut)
        for piece in getattr(cut, "geoms", [cut]):
            if piece.geom_type == "LineString" and piece.length >= 3:
                add_line(piece, S(102) if idx else S(101), curve=True); nc += 1
log("contour pieces", nc, f"{lo}-{hi} m")

# ---- points -----------------------------------------------------------------------------------------------------------------
step("objects")
# trees standing alone: the LiDAR's crowns over paved or open ground
lone = 0
for x, y, sym, _ in TREE_POINTS:                                       # (made above: those far enough apart)
    if not OLIVE_IN.contains(Point(x, y)):
        add_point(x, y, S(sym)); lone += 1
for e in osm:
    t = tags(e)
    if e["type"] != "node":
        continue
    x, y = osm_xy(e["lat"], e["lon"])
    if not (X0 < x < X1 and Y0 < y < Y1):
        continue
    if t.get("historic") in ("memorial", "monument", "wayside_cross") or t.get("tourism") == "artwork" or t.get("man_made") == "cross":
        add_point(x, y, S(526))
    elif t.get("amenity") in ("fountain", "drinking_water") or t.get("man_made") in ("water_well", "water_tap"):
        add_point(x, y, S(311))
log("points: lone trees", lone)
# every OpenStreetMap object of the area on hidden helper symbols (the owner's mapper, 2026-11-12: « OSM's objects should always be
# at hand in the editor, even when the map does not show them »): its ways and relations' members as lines (990), its tagged
# nodes as points (991); hidden in the file, shown at will in Cartographier or OCAD
n_osm = 0
for e in osm:
    if e["type"] == "way" and e.get("geometry"):
        g = osm_geom(e)
        if g is not None and g.intersects(frame):
            add_line(g, S(990), 0); n_osm += 1
    elif e["type"] == "relation":
        for m in e.get("members", []):
            if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 2:
                xs, ys = osm_xy(np.array([p["lat"] for p in m["geometry"]]), np.array([p["lon"] for p in m["geometry"]]))
                g = LineString(list(zip(xs, ys)))
                if g.intersects(frame):
                    add_line(g, S(990), 0); n_osm += 1
    elif e["type"] == "node" and e.get("tags"):
        x, y = osm_xy(e["lat"], e["lon"])
        if X0 < x < X1 and Y0 < y < Y1:
            add_point(x, y, S(991)); n_osm += 1
log("OpenStreetMap objects kept hidden", n_osm)
# north lines, 30 mm apart (120 m), blue
for xm in np.arange(math.floor((X0 - CX) / 120) * 120, (X1 - CX) + 1, 120):
    objects.append({"sym": S(601, 1), "otp": 2, "rings": [[mm(CX + xm, Y0), mm(CX + xm, Y1)]]})

# the legibility check (legibility.py: ISSprOM's rules, shared with Cartographier's checks), on the polylines before they are
# curved: what can be mended safely is (gaps under 0.4 mm between impassable features closed, slivers given to their
# neighbour…), the rest reported in src/legibility.json
import legibility
DOC = {"title": f"{RACE} sprint", "scale": SCALE, "set": "issprom2019-2", "realWorld": {"x": CX, "y": CY, "epsg": 2154},
       "objects": objects}
if "--no-check" in sys.argv:                 # a user's map: no test run (an earlier report would be read as this map's)
    (SRC / "legibility.json").unlink(missing_ok=True)
else:
    step("legibility")
    _pass = [0]
    def leg_log(s):                          # each new pass also as a marker (townmap_ci.py: « corrections, pass n »)
        log(s)
        m_ = re.search(r"legibility pass (\d+) ", s)
        if m_ and int(m_.group(1)) != _pass[0]:
            _pass[0] = int(m_.group(1))
            print(f"@@pass {_pass[0]}", flush=True)
    LEG = legibility.check(DOC, fix="--no-fix" not in sys.argv, frame=CLIP, log=leg_log, decks=DECK_ALL)   # (its sides: 515, no gap)
    for line in ["legibility"] + LEG.lines():
        log(line)
    legibility.write_report(LEG, SRC / "legibility.json")
objects = DOC["objects"]
# path ends the check cut short (lines in buildings, in the olive, on paving) drawn on again to the paving or the path within
# 4 m, unless that crosses a building or the olive (2026-11-15, remark 17's test: six ends 0.3-4 m short after the check)
_K4 = SCALE / 1000
_pl = [o for o in objects if o["otp"] == 2 and o["sym"] in (S(505), S(506)) and len(o["rings"][0]) >= 2]
_pg = [LineString(o["rings"][0]) for o in _pl]


def _poly_of(o):
    try:
        return shapely.make_valid(Polygon(o["rings"][0], [r for r in o["rings"][1:] if len(r) >= 3]))
    except Exception:
        return Polygon()


_PAV = _poly(unary_union([_poly_of(o) for o in objects if o["otp"] == 3 and o["sym"] in (S(501), S(501, 4), S(501, 3))
                          and len(o["rings"][0]) >= 3] or [Polygon()]))
_BLK = unary_union([_poly_of(o) for o in objects if o["otp"] == 3 and o["sym"] in (S(521), S(520))
                    and len(o["rings"][0]) >= 3] or [Polygon()])
_ptree = shapely.STRtree(_pg) if _pg else None
n_join = 0
for i_, o in enumerate(_pl):
    cs = [tuple(c) for c in o["rings"][0]]
    for end in (0, -1):
        e = Point(cs[end])
        dl = [(_pg[j].distance(e), j) for j in _ptree.query(e.buffer(4.0 / _K4)) if j != i_]
        d_line, j_ = min(dl) if dl else (99.0, None)
        d_pav = _PAV.distance(e) if not _PAV.is_empty else 99.0
        if min(d_line, d_pav) * _K4 <= 0.3 or min(d_line, d_pav) * _K4 >= 4.0:
            continue
        tgt = _PAV if d_pav <= d_line else _pg[j_]
        if tgt is None or tgt.is_empty:
            continue
        tp = shapely.ops.nearest_points(e, tgt)[1]
        seg = LineString([e, tp])
        if not _BLK.is_empty and seg.intersection(_BLK).length > 0.02:
            continue
        cs = ([(round(tp.x, 3), round(tp.y, 3))] + cs) if end == 0 else (cs + [(round(tp.x, 3), round(tp.y, 3))])
        n_join += 1
    o["rings"][0] = [list(c) for c in cs]
    _pg[i_] = LineString(cs)
log("path ends joined after the check", n_join)
# the unpaved paths' junctions (the owner, 2026-11-13: « the intersections are still wrong »): 505 is a double line (black edges over
# a brown 30 % fill, the black printed above), so at a junction each path's edges cross the other's fill. A path loses its edges
# wherever it runs inside another path's band — OCAD's « no left line / no right line » flags (x and y flag 4) on those segments,
# a point inserted where it enters and leaves the band
DBL_HALF = 0.31                                                      # 505's half width, mm: half its 0.38 mm gap and one 0.12 mm edge
_dbl = [o for o in objects if o["sym"] == S(505) and o["otp"] == 2 and len(o["rings"][0]) >= 2]
_dl = [LineString(o["rings"][0]) for o in _dbl]
_dtree = shapely.STRtree(_dl) if _dl else None
n_cut = 0
for i, o in enumerate(_dbl):
    l = _dl[i]
    near_ = [j for j in _dtree.query(l.buffer(DBL_HALF)) if j != i]
    if not near_:
        continue
    band = unary_union([_dl[j].buffer(DBL_HALF) for j in near_])
    if not l.intersects(band):
        continue
    parts = shapely.ops.split(l, band.boundary) if not band.boundary.is_empty else shapely.GeometryCollection([l])
    pts, cut = [], []
    for q in parts.geoms:
        if q.geom_type != "LineString" or q.length == 0:
            continue
        inside = band.contains(q.interpolate(0.5, normalized=True))
        cs = list(q.coords)
        if pts:
            cs = cs[1:]
            cut[-1] = inside                                         # the segment from the shared point on lies in this part
        for k, c in enumerate(cs):
            pts.append(c); cut.append(inside if k < len(cs) - 1 else False)
    if len(pts) >= 2 and any(cut):
        o["rings"][0] = [[round(x, 3), round(y, 3)] for x, y in pts]; o["nolr"] = cut; n_cut += 1
log("unpaved paths opened at their junctions", n_cut)

# ---- curves (the owner's mapper, 2026-11-12: « polylines not turned into curves, as OOM does and as I said last time »): every
# line and every area's outline becomes Bézier curves through its points (Catmull-Rom tangents), as OpenOrienteering Mapper's
# « smooth » does — but the buildings, canopies, walls, fences, stairways, the courts' hatching and the helpers, which keep their
# corners. A point stays a corner (no handles) where the line turns by more than 50°, at a line's ends, and wherever two objects
# that pass through it do not go on to the same neighbours (a junction of three areas, where an edge leaves an outline): every
# shared stretch then gets the same curve in each object that holds it, so two areas that touch still touch.
STRAIGHT = {S(521), S(521, 9), S(522), S(522, 9), S(513, 1), S(513, 2), S(515), S(516), S(518), S(709), S(993), S(990), S(991),
            S(601, 1)} | {S(532, k) for k in range(0, 7)} | {S(512, k) for k in range(0, 4)}
_K = lambda p: (round(p[0], 3), round(p[1], 3))


def _rings(o):
    return o["rings"] if o["otp"] == 3 else o["rings"][:1]


def _closed(r):
    return len(r) >= 4 and _K(r[0]) == _K(r[-1])


def _turn(a, b, c):
    u, v = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
    nu, nv = math.hypot(*u), math.hypot(*v)
    return 0.0 if nu < 1e-9 or nv < 1e-9 else math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))))


# one tangent at each point, set by the most natural object through it and used by every other (the owner, 2026-11-13: a pond
# half curved, half angular — its points shared with its neighbours had been made corners): water, contours, watercourses,
# vegetation and open land have no angle; the man-made keep theirs past 50°; two areas sharing an edge still share its curve
SMOOTH = {S(101), S(102), S(103), S(305), S(306), S(301), S(301, 9), S(302), S(308), S(401), S(402), S(403), S(406), S(408),
          S(410), S(411), S(415)}
PRIO = [S(301), S(301, 9), S(302), S(305), S(306), S(101), S(102), S(103), S(308), S(411), S(410), S(408), S(406), S(401), S(402),
        S(403), S(415)]
VT = {}                                                  # point → (corner?, unit tangent)
for o in sorted([o for o in objects if o["otp"] != 1 and o["sym"] not in STRAIGHT],
                key=lambda o: PRIO.index(o["sym"]) if o["sym"] in PRIO else len(PRIO)):
    sm = o["sym"] in SMOOTH
    for r in _rings(o):
        cl_ = o["otp"] == 3 or _closed(r); pts = r[:-1] if cl_ and _K(r[0]) == _K(r[-1]) else r; n = len(pts)
        for i, b in enumerate(pts):
            kk = _K(b)
            if kk in VT:
                continue
            if not cl_ and (i == 0 or i == n - 1) or n < 3:
                VT[kk] = (True, (0.0, 0.0)); continue
            a, c = pts[(i - 1) % n], pts[(i + 1) % n]
            tx, ty = c[0] - a[0], c[1] - a[1]; tn = math.hypot(tx, ty)
            VT[kk] = ((not sm and _turn(a, b, c) >= 50) or tn < 1e-9, (tx / tn, ty / tn) if tn > 1e-9 else (0.0, 0.0))


def _bez(r, closed, smooth=False, nolr=None):
    pts = r[:-1] if closed and _K(r[0]) == _K(r[-1]) else list(r); n = len(pts)
    if n < 3 if not closed else n < 3:
        return [[x, y, 0] for x, y in r]

    def corner(i):
        if not closed and (i == 0 or i == n - 1):
            return True
        return VT.get(_K(pts[i]), (True, None))[0]

    cor = [corner(i) for i in range(n)]

    def h(i, j):                                           # the handle at point i toward j: along the point's one tangent, a third of the segment
        if cor[i]:
            return pts[i]
        tx, ty = VT[_K(pts[i])][1]; L = math.dist(pts[i], pts[j]) / 3
        sg = 1 if (pts[j][0] - pts[i][0]) * tx + (pts[j][1] - pts[i][1]) * ty >= 0 else -1
        return (pts[i][0] + sg * tx * L, pts[i][1] + sg * ty * L)

    # an angle of 30° or more is an OCAD corner point (y flag 1): a line's pattern (ticks, triangles, dashes) starts again from it
    # rather than falling on it (the owner, 2026-11-13: « nothing should be on the corner »)
    cp = [cor[i] and (closed or 0 < i < n - 1) and _turn(pts[(i - 1) % n], pts[i], pts[(i + 1) % n]) >= 30 for i in range(n)]
    cut = [bool(nolr and i < len(nolr) and nolr[i]) for i in range(n)]      # (no edge on the segment from this point: x, y flag 4)
    A = lambda j: [pts[j][0], pts[j][1], 4 if cut[j] else 0, (1 if cp[j] else 0) | (4 if cut[j] else 0)]
    out = [A(0)]
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        if cor[i] and cor[j]:
            out.append(A(j)); continue
        h1, h2 = h(i, j), h(j, i)
        out += [[round(h1[0], 3), round(h1[1], 3), 1, 0], [round(h2[0], 3), round(h2[1], 3), 2, 0], A(j)]
    return out


def _corners_only(r, closed):
    """A line kept straight, its angles of 30° or more flagged as corner points."""
    pts = r[:-1] if closed and _K(r[0]) == _K(r[-1]) else list(r); n = len(pts)
    res = [[x, y, 0, 1 if (closed or 0 < i < n - 1) and n >= 3 and _turn(pts[(i - 1) % n], pts[i], pts[(i + 1) % n]) >= 30 else 0]
           for i, (x, y) in enumerate(pts)]
    return res + [res[0][:3] + [res[0][3]]] if closed else res


# no needle (2026-11-14, remark 1's test: 37 spikes in the paving, rings running out and back along themselves after the areas'
# overlays): a vertex where a ring turns back (over 170°) on a triangle under 0.5 m², or a needle under 0.25 m wide, is taken out,
# again until none is left — legibility.despike_doc, which the check already runs before and after each of its passes (what is
# checked is what is published; the points two areas share stay, 2026-11-17): here for a map made with --no-fix or --no-check
n_spk = legibility.despike_doc(DOC)
log("ring points of needles taken out", n_spk)
n_curved = 0
for o in objects:
    if o["otp"] == 1:
        continue
    if o["sym"] in STRAIGHT:
        if o["otp"] == 2 and o["sym"] not in (S(990), S(993)):
            o["bez"] = [_corners_only(r, _closed(r)) for r in _rings(o)]
        continue
    o["bez"] = [_bez(r, o["otp"] == 3 or _closed(r), o["sym"] in SMOOTH, o.get("nolr") if k == 0 else None) for k, r in enumerate(_rings(o))]
    o.pop("nolr", None)
    o.pop("curve", None); n_curved += 1
log("curved objects", n_curved)
json.dump(DOC, open(RD / "map_objects.json", "w"))
np.savez_compressed(SRC / "classes.npz", cl=cl, chm=chm, canopy=canopy_cover)
json.dump({"walls": wall_out, "origin": [X0, Y1], "res": R}, open(SRC / "walls.json", "w"))
log("objects", len(objects), {s: sum(1 for o in objects if o["sym"] == s) for s in sorted({o["sym"] for o in objects})})
