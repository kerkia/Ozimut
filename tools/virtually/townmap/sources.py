"""The sources read into feature lists: OpenStreetMap (what each tag becomes: tagmap.py), IGN BD TOPO, the cadastre.

« What one source has exists, the other is incomplete » (the owner's mapper, 2026-11-12) — and where the two disagree,
OpenStreetMap is usually right (the owner, 2026-11-22): OSM's object is taken, BD TOPO's only where OSM has none of its kind
near. BD TOPO stays the source of what OSM seldom gives: a carriageway's width, a building's use and dwellings (which parcels
are private gardens), retaining walls.

load(env) → a namespace; the comments beside each list say what it holds. Geometry in Lambert 93, metres."""
import json, math
from types import SimpleNamespace

import numpy as np
import shapely
from shapely.geometry import shape, LineString, Polygon, Point
from shapely.ops import substring, unary_union

from . import tagmap
from .env import polys, lines, union, merge_lines

PAVED_SURF = {"asphalt", "paving_stones", "concrete", "sett", "paved", "concrete:plates", "cobblestone", "unhewn_cobblestone", "metal",
              "wood", "bricks", "concrete:lanes", "tartan", "rubber"}
UNPAVED_SURF = {"gravel", "ground", "dirt", "grass", "earth", "mud", "sand", "unpaved", "pebblestone", "woodchips"}
# a firm surface is paving whatever its material (ISSprOM 501: « asphalt, hard gravel, tiles, concrete »; the owner, 2026-11-19: a
# 3 m compacted track drawn as a thin path): compacted and fine gravel, and grade-1 tracks, at their width
FIRM_SURF = {"compacted", "fine_gravel"}
ROAD_W = {"motorway": 12, "trunk": 10, "primary": 9, "secondary": 8, "tertiary": 7, "unclassified": 6, "residential": 6,
          "living_street": 5, "service": 4, "track": 3, "pedestrian": 3, "cycleway": 2.5, "bridleway": 2.5, "footway": 2.0,
          "path": 2.0, "steps": 2.0, "corridor": 2.0}
PATH_KINDS = {"footway", "path", "cycleway", "bridleway", "steps", "pedestrian", "track", "corridor"}
SPORT_SURF = {"grass": "grass", "artificial_turf": "turf", "clay": "clay", "tartan": "hard", "acrylic": "hard", "rubber": "hard",
              "asphalt": "asphalt", "concrete": "asphalt", "paved": "asphalt", "fine_gravel": "sand", "sand": "sand", "gravel": "sand",
              "dirt": "sand", "ground": "sand", "compacted": "sand"}
SPORT_DEFAULT = {"soccer": "grass", "rugby": "grass", "tennis": "hard", "athletics": "hard", "multi": "asphalt", "basketball": "asphalt",
                 "boules": "sand", "handball": "asphalt"}
BD_SPORT = {"terrain de rugby": "rugby", "terrain de football": "soccer", "terrain de tennis": "tennis", "stade d'athlétisme": "athletics",
            "piste de sport": "athletics", "terrain de basket-ball": "basketball", "terrain de handball": "handball"}
NO_ENTRY = ("tennis", "padel")                             # fenced all round: not entered
closed_to_all = lambda t: t.get("access") in ("private", "no") or t.get("foot") in ("private", "no")


def width_of(t, default):
    try:
        return max(0.8, min(12.0, float(str(t.get("width", "")).replace(",", ".").split()[0])))
    except (ValueError, IndexError):
        return default


def is_lower(t):
    """An OSM way beneath something: in a tunnel, under a cover or a building, or on a negative layer."""
    return (t.get("tunnel") in ("yes", "building_passage", "covered") or t.get("covered") == "yes"
            or str(t.get("layer", "0")).strip().startswith("-"))


def layer_of(t, d=0):
    try:
        return int(float(str(t.get("layer", d)).split(";")[0]))
    except ValueError:
        return d


class Osm:
    """OpenStreetMap's elements with their kinds and geometry in Lambert 93."""
    def __init__(self, env):
        self._tr = None
        self.el = json.load(open(env.SRC / "osm.json", encoding="utf-8"))["elements"]
        for e in self.el:
            e["k"] = tagmap.kinds(e)

    @property
    def tr(self):
        if self._tr is None:
            from l93 import transformer
            self._tr = transformer(4326, 2154)
        return self._tr

    def __getstate__(self):
        return {"el": self.el, "_tr": None}

    def xy(self, lat, lon):
        return self.tr.transform(lon, lat)

    def _pts(self, geom):
        xs, ys = self.xy(np.array([p["lat"] for p in geom]), np.array([p["lon"] for p in geom]))
        return list(zip(xs, ys))

    def geom(self, e, area=False):
        if e["type"] == "node":
            return Point(*self.xy(e["lat"], e["lon"]))
        if e["type"] == "way" and e.get("geometry"):
            pts = self._pts(e["geometry"])
            if area and len(pts) >= 4 and pts[0] == pts[-1]:
                return Polygon(pts).buffer(0)
            return LineString(pts) if len(pts) >= 2 else None
        if e["type"] == "relation" and area:
            outers, inners = [], []
            for m in e.get("members", []):
                if m.get("type") == "way" and m.get("geometry") and len(m["geometry"]) >= 2:
                    (inners if m.get("role") == "inner" else outers).append(LineString(self._pts(m["geometry"])))
            ps = list(shapely.polygonize(outers).geoms) if outers else []
            g = unary_union(ps) if ps else None
            if g is not None and inners:
                g = g.difference(unary_union(list(shapely.polygonize(inners).geoms)))
            return g
        return None

    def of(self, kind, types=("way", "relation", "node")):
        return [e for e in self.el if kind in e["k"] and e["type"] in types]

    def areas(self, kind):
        """The polygons of a kind's ways and relations, with their elements."""
        out = []
        for e in self.of(kind, ("way", "relation")):
            g = self.geom(e, True)
            if g is not None and not g.is_empty and g.geom_type.endswith("Polygon"):
                out.append((g, e))
        return out


def load(env):
    s = SimpleNamespace()
    o = s.osm = Osm(env)
    tags = lambda e: e.get("tags", {})
    frame = env.frame

    def bdtopo(layer):
        f = env.SRC / f"bdtopo_{layer}.json"
        return json.load(open(f, encoding="utf-8"))["features"] if f.exists() else []

    def g2(g):
        return shapely.force_2d(shape(g)) if g else None

    # ---- buildings: OpenStreetMap's, and BD TOPO's where OSM draws none over them --------------------------------------------
    s.bd_buildings = []                                    # (polygon, BD TOPO's properties): uses, dwellings (the gardens' rule)
    for f in bdtopo("batiment"):
        g = g2(f["geometry"])
        if g is not None and not g.is_empty:
            g = g.buffer(0).intersection(frame)
            if g.area > 3:
                s.bd_buildings.append((g, f["properties"]))
    osm_b = [g.intersection(frame) for g, e in o.areas("building") if tags(e).get("building") != "construction"]
    osm_b = [g for g in osm_b if g.area > 3]
    OB = union(osm_b)
    kept = [g for g, _ in s.bd_buildings if OB.is_empty or g.intersection(OB).area < 0.5 * g.area]
    s.buildings = osm_b + kept                             # the map's buildings
    s.B = union(s.buildings)
    s.canopy = union([g for g, _ in o.areas("canopy")]).difference(s.B)
    env.log("buildings: OSM", len(osm_b), "BD TOPO beside them", len(kept), "of", len(s.bd_buildings))

    # ---- ways ----------------------------------------------------------------------------------------------------------------
    s.paved = []            # paved polygons (streets' bands, squares, parkings, sidewalks)
    s.paved_soft = []       # paving that is no way for all (a private drive): drawn only outside the ground not to be entered
    s.path_lines, s.small_lines = [], []                   # unpaved paths (505), small or informal paths (506)
    s.steps = []            # (line, width)
    s.paved_paths = []      # paved footways and cycle paths: (line, width)
    s.public_ways = []      # ways open to all: a right of way through ground not to be entered
    s.carr = []             # the carriageways: (area, BD TOPO's importance, in town)
    s.carr_lines = {}       # (half width, importance, in town) → the sections' centre lines
    s.under, bd_under, bd_paths, bd_steps, osm_hw, bd_secs = [], [], [], [], [], []

    def put_way(g, hw, t, is_area):
        """An OSM way of a path's kind: a stairway, a sidewalk or a paved area, a paved footway (a line at its width), an unpaved
        path or a small path. One closed to all (access=private|no, a house's driveway) is paving only outside private ground."""
        if hw == "steps":
            if not closed_to_all(t):
                s.steps.append((g, width_of(t, 2.0)))
            return
        surf = t.get("surface", "")
        firm = surf in FIRM_SURF or t.get("tracktype") == "grade1"
        shut = closed_to_all(t) or t.get("service") == "driveway"
        if t.get("footway") in ("sidewalk", "crossing", "traffic_island") or t.get("cycleway") == "sidewalk":
            s.paved.append(g.buffer(1.0, cap_style="flat", join_style="round")); return
        if is_area and g.geom_type.endswith("Polygon"):
            if surf not in UNPAVED_SURF or firm:
                (s.paved_soft if shut else s.paved).append(g)
            return
        if not firm and (surf in UNPAVED_SURF or (hw in ("path", "track", "bridleway") and surf not in PAVED_SURF)):
            if shut:
                return                                     # a private path: not mapped (ISSprOM 520)
            (s.small_lines if hw == "path" and t.get("informal") == "yes" else s.path_lines).append(g)
            s.public_ways.append(g)
        elif hw in ("footway", "path", "cycleway", "bridleway", "track"):
            if shut:
                s.paved_soft.append(g.buffer(1.0, cap_style="flat")); return
            s.paved_paths.append((g, width_of(t, 3.0 if hw == "track" else 2.0)))
            s.public_ways.append(g)
        else:
            w = width_of(t, 2 * {"service": 2.2, "living_street": 2.5, "pedestrian": 2.5, "track": 1.5}.get(hw, 1.1)) / 2
            (s.paved_soft if shut else s.paved).append(g.buffer(w, cap_style="flat", join_style="round"))

    for f in bdtopo("troncon_de_route"):
        p = f["properties"]; g = g2(f["geometry"])
        if g is None:
            continue
        nat = (p.get("nature") or "").lower()
        if (p.get("position_par_rapport_au_sol") or "0").startswith("-"):
            if g.geom_type == "LineString":
                bd_under.append((g, 2.0 if ("sentier" in nat or "escalier" in nat or "chemin" in nat) else float(p.get("largeur_de_chaussee") or 0) or 5.0))
            continue
        if "escalier" in nat:
            bd_steps.append(g); continue
        if "sentier" in nat or "chemin" in nat or "empierr" in nat:
            bd_paths.append(g); continue
        w = float(p.get("largeur_de_chaussee") or 0) or {"route à 1 chaussée": 5.5, "rond-point": 7, "bretelle": 6, "piste cyclable": 2.5}.get(nat, 5)
        if g.geom_type == "LineString":
            bd_secs.append((g, w, int(p.get("importance") or 6), p.get("urbain") not in (False, "false", 0)))
    for e in o.el:
        t = tags(e); hw = t.get("highway")
        if e["type"] != "way" or not e.get("geometry"):
            continue
        if "way" in e["k"] or "steps" in e["k"]:
            g0 = o.geom(e)
            if g0 is not None:
                osm_hw.append(g0)
            is_area = t.get("area") == "yes"
            g = o.geom(e, area=is_area)
            if g is None:
                continue
            if is_lower(t) and g.geom_type == "LineString":   # a passage beneath something: placed below, with the bridges
                s.under.append((g, hw, t)); continue
            put_way(g, hw, t, is_area)
        elif "paved" in e["k"] and t.get("parking") not in ("underground", "multi-storey"):
            g = o.geom(e, area=True)
            if g is not None and g.geom_type.endswith("Polygon"):
                (s.paved_soft if closed_to_all(t) else s.paved).append(g)
            elif g is not None and g.geom_type == "LineString" and (t.get("railway") == "platform" or t.get("public_transport") == "platform"):
                s.paved.append(g.buffer(width_of(t, 2.5) / 2, cap_style="flat"))
    for e in o.of("paved", ("relation",)):
        g = o.geom(e, True)
        if g is not None and g.geom_type.endswith("Polygon"):
            s.paved.append(g)
    # The streets are OpenStreetMap's lines (the owner, 2026-11-23: « OSM (correct) inputs are not captured properly » — they were
    # BD TOPO's sections, metres off OSM's in places, OSM's only where BD TOPO had none), bridges included; BD TOPO gives what
    # OSM seldom has, the carriageway's width, its importance and whether it is in town, from the section lying along the way.
    # A BD TOPO section with no OSM way of any kind within 6 m is still a street.
    def carriageway(g, w, imp, urb):
        s.carr_lines.setdefault((round(w / 2, 2), imp, urb), []).append(g)
        s.paved.append(g.buffer(w / 2 + (1.8 if urb else 0.3), cap_style="flat", join_style="round"))   # (sidewalks in town)

    sec_tree = shapely.STRtree([q[0] for q in bd_secs]) if bd_secs else None
    n = 0
    for e in o.of("street", ("way",)):
        t = tags(e)
        if is_lower(t) or t.get("area") == "yes" or closed_to_all(t):
            continue
        g = o.geom(e)
        if g is None or g.geom_type != "LineString" or g.length < 1:
            continue
        best, along = None, 0.0
        for j in (sec_tree.query(g.buffer(6)) if sec_tree is not None else []):
            l_ = g.intersection(bd_secs[j][0].buffer(6)).length
            if l_ > along:
                best, along = bd_secs[j], l_
        if best is not None and along >= min(5.0, 0.3 * g.length):
            carriageway(g, width_of(t, best[1]), best[2], best[3])
        else:
            hw = t["highway"]
            carriageway(g, width_of(t, ROAD_W.get(hw, 6.0)), {"motorway": 1, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4}.get(hw, 5), True)
        n += 1
    OSM_WAYS = union([g.buffer(6) for g in osm_hw])
    nb = 0
    for g, w, imp, urb in bd_secs:
        for q in lines(g.difference(OSM_WAYS)):
            if q.length >= 10:
                carriageway(q, w, imp, urb); nb += 1
    env.log("streets: OpenStreetMap's", n, "BD TOPO's where OSM has no way", nb)
    for f in bdtopo("equipement_de_transport"):
        if "parking" in (f["properties"].get("nature") or "").lower():
            g = g2(f["geometry"])
            if g is not None and g.geom_type.endswith("Polygon"):
                s.paved.append(g)
    # the railway track by track: OpenStreetMap's tracks, BD TOPO's axis only where OSM has none within 10 m
    s.rail = [g for e in o.of("rail", ("way",)) if not is_lower(tags(e)) for g in [o.geom(e)] if g is not None and g.geom_type == "LineString"]
    osm_rail = union([g.buffer(10) for g in s.rail])
    for f in bdtopo("troncon_de_voie_ferree"):
        p = f["properties"]; g = g2(f["geometry"])
        if g is not None and not (p.get("position_par_rapport_au_sol") or "0").startswith("-") and g.difference(osm_rail).length > 0.5 * g.length:
            s.rail.append(g)
    s.RAIL = unary_union(s.rail) if s.rail else LineString()
    # the sections of one kind merged through their joins, then widened: no wedge left open where two sections meet at an angle
    for (half, imp, urb), gs in s.carr_lines.items():
        s.carr.append((merge_lines(unary_union(gs)).buffer(half, cap_style="flat", join_style="round"), imp, urb))
    s.CARR = union([c for c, _, _ in s.carr])
    s.STREET = union([c.buffer(1.8 if urb else 0.3) for c, _, urb in s.carr]).buffer(0.2)

    _water_areas(env, s, bdtopo, g2)
    _levels(env, s, bdtopo, g2, bd_under)

    # BD TOPO's paths where OSM has no way within 10 m (they lie metres off: the same path), its stairways where OSM has none
    OSM_HW = union([g.buffer(10) for g in osm_hw])
    for g in bd_paths:
        s.path_lines += [q for q in lines(g.difference(OSM_HW)) if q.length > 10]
    OSM_STEPS = union([g.buffer(4) for g, _ in s.steps])
    for g in bd_steps:
        if g.length and g.difference(OSM_STEPS).length > 0.5 * g.length:
            s.steps.append((g, 2.0))

    _water(env, s, bdtopo, g2)
    _barriers(env, s, bdtopo, g2)
    _sports(env, s, bdtopo, g2)
    _ground(env, s, bdtopo, g2)
    _points(env, s)
    s.PAVED = union(s.paved).intersection(frame)
    _private(env, s, bdtopo, g2)
    unk = tagmap.unknown()
    json.dump(unk, open(env.SRC / "osm_unknown.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    env.log("OSM tags the table does not know", len(unk), list(unk)[:8])
    return s


def _levels(env, s, bdtopo, g2, bd_under):
    """Two levels: the bridges' decks and what passes beneath (the owner, 2026-11-12: « bridges and tunnels need to be shown »).
    A deck is a bridge's top: OSM's bridge ways at their width, else BD TOPO's roads and railways above ground and its « Pont »
    lines. What passes beneath — a way on a lower layer crossing a deck, a way in a tunnel, under a cover or a building, or on a
    negative layer — is a passage."""
    o, frame = s.osm, env.frame
    tags = lambda e: e.get("tags", {})
    RAIL_L = s.RAIL
    decks = []                                             # {"g", "axis", "w", "layer", "kind": road | path | rail}
    MINW = (0.4 + 0.5) * 4                                 # 0.4 mm between a bridge's two side lines at least
    for e in o.el:
        t = tags(e)
        if e["type"] != "way" or t.get("bridge") in (None, "no") or not (t.get("highway") or t.get("railway")):
            continue
        g = o.geom(e)
        if g is None or g.geom_type != "LineString" or not g.intersects(frame.buffer(30)):
            continue
        hw = t.get("highway")
        kind = "rail" if t.get("railway") else "path" if hw in PATH_KINDS else "road"
        w = max(width_of(t, 8.0 if kind == "rail" else ROAD_W.get(hw, 6.0)), MINW)
        decks.append({"g": g.buffer(w / 2, cap_style="flat"), "axis": g, "w": w, "layer": max(1, layer_of(t, 1)), "kind": kind})
    OSM_DECK = union([d["axis"].buffer(3) for d in decks])
    for layer_name in ("troncon_de_route", "troncon_de_voie_ferree", "construction_lineaire"):
        for f in bdtopo(layer_name):
            p = f["properties"]; g = g2(f["geometry"])
            if g is None or g.geom_type != "LineString" or g.length < 2:
                continue
            nat, det = (p.get("nature") or "").lower(), (p.get("nature_detaillee") or "").lower()
            if layer_name == "construction_lineaire":
                if nat != "pont":
                    continue
                kind, w = ("path", 2.5) if "passerelle" in det else ("road", 6.0)
                if not RAIL_L.is_empty and RAIL_L.buffer(5).contains(g):
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
            w = max(w, MINW)
            decks.append({"g": g.buffer(w / 2, cap_style="flat"), "axis": g, "w": w, "layer": 1, "kind": kind})
    # A way that crosses water is on a bridge from bank to bank, whatever length OSM's bridge way has (the owner, 2026-11-23: the
    # main street stopped at the Yvette — its bridge way is 6 m long, the river's area 15 m wide, and the water was drawn over
    # the rest). The ways of a kind joined end to end, each stretch inside the water that runs across it (the middle of its
    # chord well inside the water: not a path along the bank) is a deck, 1.5 m onto each bank; a tagged bridge on it is carried on.
    W = s.WATER_ALL
    if not W.is_empty:
        Wb = W.boundary
        groups = {"road": [], "path": []}
        for e in o.el:
            t = tags(e); hw = t.get("highway")
            if e["type"] != "way" or not hw or is_lower(t) or t.get("area") == "yes" or t.get("ford") not in (None, "no") or hw == "steps":
                continue
            g = o.geom(e)
            if g is not None and g.geom_type == "LineString" and g.intersects(W.buffer(2)):
                groups["path" if hw in PATH_KINDS else "road"].append((g, width_of(t, ROAD_W.get(hw, 6.0))))
        for (half, _, urb), gs in s.carr_lines.items():    # (the streets as wide as they are paved: carriageway and sidewalks)
            groups["road"] += [(g, 2 * half + (3.6 if urb else 0.6)) for g in gs if g.intersects(W.buffer(2))]
        n_x = 0
        for kind, ws in groups.items():
            if not ws:
                continue
            wt = shapely.STRtree([g for g, _ in ws])
            for ln in lines(merge_lines(unary_union([g for g, _ in ws]))):
                for pc in lines(ln.intersection(W)):
                    if pc.length < 1.0 or pc.length > 150:
                        continue
                    a_, b_ = Point(pc.coords[0]), Point(pc.coords[-1])
                    mid = Point((a_.x + b_.x) / 2, (a_.y + b_.y) / 2); ch = a_.distance(b_)
                    if ch < 1.0 or not W.contains(mid) or Wb.distance(mid) < 0.25 * ch or Wb.distance(a_) > 0.5 or Wb.distance(b_) > 0.5:
                        continue
                    s0, s1 = sorted((ln.project(a_), ln.project(b_)))
                    ext = substring(ln, max(0.0, s0 - 1.5), min(ln.length, s1 + 1.5))
                    if ext.geom_type != "LineString" or ext.length < 2:
                        continue
                    w = max([ws[j][1] for j in wt.query(pc.buffer(0.3)) if ws[j][0].intersection(pc.buffer(0.3)).length > 0.5 * min(pc.length, ws[j][0].length)] or [2.0])
                    w = max(w, MINW)
                    hit = [d for d in decks if d["kind"] != "rail" and (d["axis"].intersection(ext.buffer(3)).length >= 0.6 * d["axis"].length
                                                                         or ext.intersection(d["g"].buffer(1)).length >= 0.6 * ext.length)]
                    if hit:
                        d = max(hit, key=lambda d: d["w"])
                        if ext.length > d["axis"].intersection(ext.buffer(3)).length + 0.5:
                            d["w"] = max(d["w"], w); d["axis"] = ext; d["g"] = ext.buffer(d["w"] / 2, cap_style="flat"); n_x += 1
                    else:
                        decks.append({"g": ext.buffer(w / 2, cap_style="flat"), "axis": ext, "w": w, "layer": 1, "kind": kind}); n_x += 1
        env.log("decks carried across the water they cross", n_x)
    # one deck a bridge: the widest kept, a deck whose axis lies for 60 % within one kept dropped
    kept = []
    for d in sorted(decks, key=lambda d: -d["w"]):
        U = union([e["g"].buffer(1.0) for e in kept if (e["kind"] == "rail") == (d["kind"] == "rail")])
        if U.is_empty or d["axis"].intersection(U).length < 0.6 * d["axis"].length:
            kept.append(d)
    s.decks = decks = kept
    s.DECK_ALL = DECK_ALL = union([d["g"] for d in decks])
    s.RUN_DECK = union([d["g"] for d in decks if d["kind"] != "rail"])

    def pieces_in(g, area):
        return [l for l in lines(g.intersection(area)) if l.length >= 1.0]

    def across(piece, d):
        """The piece runs across the deck (a way passing beneath), from one side to the other, not along it."""
        a = d["axis"]; m = piece.interpolate(0.5, normalized=True); s0 = a.project(m)
        p0, p1 = a.interpolate(max(0.0, s0 - 1)), a.interpolate(min(a.length, s0 + 1))
        q0, q1 = piece.coords[0], piece.coords[-1]
        ax, ay, px, py = p1.x - p0.x, p1.y - p0.y, q1[0] - q0[0], q1[1] - q0[1]
        na, npc = math.hypot(ax, ay), math.hypot(px, py)
        if not (na > 1e-6 and npc > 1e-6 and abs(ax * py - ay * px) / (na * npc) > 0.5):
            return False
        sides = []
        for q in (q0, q1):
            P = Point(q); sq = a.project(P)
            if sq < 0.5 or sq > a.length - 0.5 or a.distance(P) < 0.35 * d["w"]:
                return False
            c0, c1 = a.interpolate(max(0.0, sq - 0.5)), a.interpolate(min(a.length, sq + 0.5))
            sides.append((c1.x - c0.x) * (q[1] - c0.y) - (c1.y - c0.y) * (q[0] - c0.x) > 0)
        return sides[0] != sides[1]

    passages = []                                          # (the line beneath, its width, why)
    UNDER_NEAR = union([g.buffer(3) for g, _, _ in s.under])
    for e in o.el:                                         # ways on a lower layer crossing a deck (a road under the railway)
        t = tags(e); hw = t.get("highway")
        if e["type"] != "way" or not hw or t.get("bridge") not in (None, "no") or t.get("area") == "yes" or t.get("indoor") == "yes" or is_lower(t):
            continue
        g = o.geom(e)
        if g is None or g.geom_type != "LineString" or not g.intersects(DECK_ALL):
            continue
        for d in decks:
            # a footbridge makes no passage of a way not tagged beneath it
            if d["kind"] != "path" and d["layer"] > layer_of(t, 0) and g.intersects(d["g"]):
                passages += [(pc, width_of(t, ROAD_W.get(hw, 4.0)), f"way {e['id']} ({hw}) under a {d['kind']} deck")
                             for pc in pieces_in(g, d["g"]) if across(pc, d) and not UNDER_NEAR.contains(pc)]
    UPPER = union([DECK_ALL, RAIL_L.buffer(4), s.B, s.CARR]).buffer(0.5)
    s.open_parts = []                                      # the parts of lower ways that run in the open: (line, highway, tags)
    for g, hw, t in s.under:                               # tunnels, covered ways, ways on a negative layer
        w = width_of(t, ROAD_W.get(hw, 2.0))
        if t.get("tunnel") in ("yes", "building_passage", "covered") or t.get("covered") == "yes":
            pcs, rest = [g], None                          # the whole way is beneath
        else:
            pcs, rest = pieces_in(g, UPPER), g.difference(UPPER)
            if not pcs and g.length < 40:
                pcs, rest = [g], None
        passages += [(pc, w, f"{hw} tunnel={t.get('tunnel')} covered={t.get('covered')} layer={t.get('layer')}") for pc in pcs]
        for r in lines(rest):
            if r.length >= 2:
                s.open_parts.append((r, hw, t))
    for r, hw, t in s.open_parts:                          # as any other way (put_way's rules, the common cases)
        surf = t.get("surface", "")
        if hw == "steps":
            s.steps.append((r, width_of(t, 2.0)))
        elif surf in UNPAVED_SURF and surf not in FIRM_SURF:
            s.path_lines.append(r); s.public_ways.append(r)
        elif hw in PATH_KINDS:
            s.paved_paths.append((r, width_of(t, 2.0))); s.public_ways.append(r)
        else:
            s.paved.append(r.buffer(width_of(t, ROAD_W.get(hw, 4.0)) / 2, cap_style="flat"))
    UNDER_OSM = union([g.buffer(8) for g, _, _ in s.under] + [p[0].buffer(8) for p in passages])   # (BD TOPO's lie metres off)
    for g, w in bd_under:                                  # BD TOPO's ways below ground that OpenStreetMap does not have
        if g.difference(UNDER_OSM).length > 0.5 * g.length:
            passages.append((g, w, "BD TOPO way below ground"))
    for f in bdtopo("construction_lineaire"):
        g = g2(f["geometry"])
        if (f["properties"].get("nature") or "").lower() == "tunnel" and g is not None and g.geom_type == "LineString" \
                and g.difference(UNDER_OSM).length > 0.5 * g.length:
            passages.append((g, 2.5, "BD TOPO tunnel line"))
    B = s.B

    def through(pc):
        """A passage whose end stops inside a building is drawn on until it comes out, 10 m at most (OSM's ways through a porch
        stop short of the far wall)."""
        cs = list(pc.coords)
        for end in (0, -1):
            e, q = cs[end], cs[1 if end == 0 else -2]
            if not B.contains(Point(e)):
                continue
            dx, dy = e[0] - q[0], e[1] - q[1]; n_ = math.hypot(dx, dy) or 1; dx, dy = dx / n_, dy / n_
            for d in np.arange(0.5, 10.01, 0.5):
                if not B.contains(Point(e[0] + dx * d, e[1] + dy * d)):
                    pt = (e[0] + dx * (d + 0.5), e[1] + dy * (d + 0.5))
                    cs = [pt] + cs if end == 0 else cs + [pt]
                    break
        return LineString(cs)

    s.passages = [(through(pc), w, why) for pc, w, why in passages]
    s.PASSES = union([pc.buffer(w / 2 + 0.5, cap_style="flat") for pc, w, _ in s.passages])
    env.log("decks", len(decks), {k: sum(1 for d in decks if d["kind"] == k) for k in ("road", "path", "rail")}, "passages", len(s.passages))


def _water_areas(env, s, bdtopo, g2):
    o = s.osm
    tags = lambda e: e.get("tags", {})
    # OpenStreetMap's water areas, and BD TOPO's permanent ones where OSM has none over them (an intermittent « Retenue » of
    # BD TOPO covered OSM's grassland — the owner, 2026-11-19)
    osm_water = [g for g, e in o.areas("water") if tags(e).get("intermittent") != "yes"
                 and tags(e).get("basin") not in ("detention", "retention", "infiltration")]
    OW = union(osm_water)
    bd_water = [g for f in bdtopo("surface_hydrographique")
                if (f["properties"].get("persistance") or "").lower() not in ("intermittent", "sec")
                for g in [g2(f["geometry"]).buffer(0)] if OW.is_empty or g.intersection(OW).area < 0.5 * g.area]
    s.pools = [g for g, e in o.areas("pool") if not closed_to_all(tags(e))]
    water = union(osm_water + [g.difference(OW.buffer(2)) for g in bd_water])
    s.WATER_ALL = water                                    # with what the decks cover, for their sides
    s.n_water = (len(osm_water), len(bd_water))


def _water(env, s, bdtopo, g2):
    o = s.osm
    tags = lambda e: e.get("tags", {})
    water = s.WATER_ALL
    s.water = water.difference(s.DECK_ALL)
    culverts, osm_streams, s.ditches = [], [], []
    for e in o.el:
        if e["type"] != "way" or not ({"stream", "ditch"} & e["k"]):
            continue
        t = tags(e); g = o.geom(e)
        if g is None or g.geom_type != "LineString":
            continue
        if t.get("tunnel") in ("yes", "culvert") or str(t.get("layer", "0")).startswith("-"):
            culverts.append(g)
        elif "ditch" in e["k"]:
            s.ditches.append(g)
        else:
            osm_streams.append(g)
    # OSM's watercourses, BD TOPO's stretches where OSM has none within 12 m (they lie metres apart: one stream)
    OS = union([g.buffer(12) for g in osm_streams + culverts])
    bd = [g2(f["geometry"]) for f in bdtopo("troncon_hydrographique")
          if not (f["properties"].get("position_par_rapport_au_sol") or "0").startswith("-")
          and (f["properties"].get("persistance") or "").lower() not in ("intermittent", "sec")]
    extra = [q for g in bd if g is not None for q in lines(g.difference(OS)) if q.length >= 10]

    def off_culverts(g):
        """A watercourse is cut only along an OSM culvert or tunnel (it runs on under a bridge: the owner, 2026-11-14)."""
        cut = [cv.buffer(2.5, cap_style="flat") for cv in culverts
               if g.intersects(cv.buffer(2.5)) and g.intersection(cv.buffer(2.5, cap_style="flat")).length >= 0.5 * cv.length]
        return g.difference(unary_union(cut)) if cut else g
    s.streams = [off_culverts(g) for g in osm_streams + extra]
    s.ditches = [off_culverts(g) for g in s.ditches]
    s.WET = union([g for g, _ in o.areas("wetland")])
    env.log("water: OSM areas", s.n_water[0], "BD TOPO's beside", s.n_water[1], "streams", len(s.streams), "ditches", len(s.ditches),
            "culverts", len(culverts), "wetland", round(s.WET.area), "m²")


def _barriers(env, s, bdtopo, g2):
    o = s.osm
    tags = lambda e: e.get("tags", {})
    s.hedges = [g for e in o.of("hedge", ("way",)) for g in [o.geom(e)] if g is not None]
    OH = union([h.buffer(3) for h in s.hedges])
    s.hedges += [q for f in bdtopo("haie") for g in [g2(f["geometry"])] if g is not None for q in lines(g.difference(OH)) if q.length > 3]
    walls = []                                             # (line, kind: wall | fence | court, retaining)
    for e in o.of("wall", ("way",)) + o.of("fence", ("way",)):
        g = o.geom(e)
        if g is not None:
            walls.append((g, "fence" if "fence" in e["k"] else "wall", tags(e).get("barrier") == "retaining_wall"))
    for f in bdtopo("construction_lineaire"):
        nat = (f["properties"].get("nature") or "").lower(); g = g2(f["geometry"])
        if g is None or not nat.startswith("mur"):
            continue
        # an OSM wall within 1 m along it is the same wall
        if any(k[1] == "wall" and g.length > 0 and k[0].buffer(1.2).contains(g.interpolate(0.5, normalized=True)) and k[0].hausdorff_distance(g) < 2 for k in walls):
            continue
        walls.append((g, "wall", "soutènement" in nat))
    s.walls = walls
    # openings: OSM's gates and entrances (nodes, and gates drawn as ways)
    gates = [o.geom(e).buffer(1.5) for e in o.of("gate", ("node",))]
    gates += [g.buffer(1.0) for e in o.of("gate", ("way",)) for g in [o.geom(e)] if g is not None]
    s.GATES = union(gates)
    env.log("walls/fences", len(walls), "hedges", len(s.hedges), "gates", len(gates))


def _sports(env, s, bdtopo, g2):
    o, frame = s.osm, env.frame
    name = lambda v: "rugby" if v.startswith("rugby") else "athletics" if v in ("athletics", "running") else v
    s.sports, s.infields = [], []                          # {"sport", "surface", "g", "src"}; a filled oval track's infield
    for e in o.of("pitch", ("way", "relation")) + o.of("track_sport", ("way", "relation")):
        t = e.get("tags", {})
        g = o.geom(e, area=True)
        if g is None or g.is_empty or not g.geom_type.endswith("Polygon") or not g.intersects(frame):
            continue
        sp = name((t.get("sport") or ("athletics" if t.get("leisure") == "track" else "multi")).split(";")[0])
        if sp == "athletics" and g.geom_type == "Polygon":   # (as OSM draws it, its 100 m straight's ends included)
            if not g.interiors and g.buffer(-9).area > 0:  # a filled oval: its lanes, ~7; the infield cut exactly to them
                s.infields.append(g.buffer(-8.5)); g = g.difference(g.buffer(-8.5))
        s.sports.append({"sport": sp, "surface": SPORT_SURF.get(t.get("surface", ""), SPORT_DEFAULT.get(sp, "sand")), "g": g, "src": "osm"})
    for f in bdtopo("terrain_de_sport"):
        p = f["properties"]; g = g2(f["geometry"])
        if g is None or not g.geom_type.endswith("Polygon") or not g.intersects(frame):
            continue
        g = g.buffer(0)
        if any(x["g"].intersection(g).area > 0.5 * min(g.area, x["g"].area) for x in s.sports):
            continue                                       # OpenStreetMap has it, with its surface
        sp = BD_SPORT.get((p.get("nature_detaillee") or p.get("nature") or "").lower(), "multi")
        if sp == "athletics" and g.geom_type == "Polygon":
            if g.buffer(-9).area > 0:
                g = g.difference(g.buffer(-8.5))
        s.sports.append({"sport": sp, "surface": SPORT_DEFAULT.get(sp, "sand"), "g": g, "src": "bdtopo"})
    json.dump([{"sport": x["sport"], "surface": x["surface"], "src": x["src"],
                "polys": [[[[round(c[0], 2), round(c[1], 2)] for c in p.exterior.coords]] + [[[round(x_, 2), round(y_, 2)] for x_, y_ in r.coords] for r in p.interiors]
                          for p in polys(x["g"])]} for x in s.sports], open(env.SRC / "sports.json", "w"))
    grass = lambda x: x["sport"] not in NO_ENTRY and x["surface"] in ("grass", "turf")
    s.SP_OPEN = union([x["g"] for x in s.sports if grass(x)] + s.infields)
    s.SP_PAVED = union([x["g"] for x in s.sports if not grass(x)])
    s.SPORTS = union([x["g"] for x in s.sports])
    # a tennis court is fenced all round (OSM gives each court as its own object)
    for l in lines(merge_lines(union([x["g"].boundary for x in s.sports if x["sport"] in NO_ENTRY]))):
        s.walls.append((l, "court", False))
    env.log("sports grounds", len(s.sports), {k: sum(1 for x in s.sports if x["sport"] == k) for k in sorted({x["sport"] for x in s.sports})})


def _ground(env, s, bdtopo, g2):
    """What OpenStreetMap and BD TOPO say of the ground's cover: lawns, woods, scrub."""
    o = s.osm
    # lawns (the owner's mapper, 2026-11-12: « lawns in front of the town hall are in OSM and not on the map »)
    s.GRASS = union([g for g, _ in o.areas("lawn")])
    s.WOODS = union([g for g, _ in o.areas("wood")])       # OpenStreetMap's woods: forest
    s.SCRUB = union([g for g, _ in o.areas("scrub")])
    # BD TOPO's woods: a hint for the LiDAR's own reading (its « zones de végétation » take in any group of trees)
    s.BD_WOODS = union([g2(f["geometry"]).buffer(0) for f in bdtopo("zone_de_vegetation")
                        if any(k in (f["properties"].get("nature") or "").lower() for k in ("bois", "forêt", "foret", "peupleraie"))])
    # places where trees stand over mown grass or paving, never a forest's floor: parks, gardens, playgrounds, cemeteries
    s.PARKS = union([g for g, e in o.areas("zone") if e["tags"].get("leisure") in ("park", "garden", "playground", "dog_park")
                     or e["tags"].get("landuse") in ("cemetery", "allotments")])
    env.log("OSM lawns", round(s.GRASS.area), "m², woods", round(s.WOODS.area), "scrub", round(s.SCRUB.area), "BD TOPO woods", round(s.BD_WOODS.area),
            "parks", round(s.PARKS.area))


def _points(env, s):
    o = s.osm
    inside = lambda p: env.X0 < p.x < env.X1 and env.Y0 < p.y < env.Y1
    pt = lambda kind: [p for e in o.of(kind, ("node",)) for p in [o.geom(e)] if inside(p)]
    s.trees = pt("tree")                                   # OpenStreetMap's trees: a mapper saw each one
    s.tree_rows = [g for e in o.of("tree_row", ("way",)) for g in [o.geom(e)] if g is not None and g.geom_type == "LineString"]
    s.monuments, s.fountains, s.masts = pt("monument"), pt("fountain"), pt("mast")
    env.log("OSM points: trees", len(s.trees), "tree rows", len(s.tree_rows), "monuments", len(s.monuments), "fountains", len(s.fountains),
            "masts", len(s.masts))


def _private(env, s, bdtopo, g2):
    """Ground not to be entered (520): the cadastre's parcels holding a house (its garden), schools, OSM's private areas, the
    railway's corridor — less the streets and the ways open to all."""
    o, frame = s.osm, env.frame
    s.parcels = []
    for f in env.SRC.glob("parcelles_*.json"):
        for p in json.load(open(f, encoding="utf-8"))["features"]:
            g = shape(p["geometry"])
            g = shapely.transform(g, lambda c: np.c_[o.tr.transform(c[:, 0], c[:, 1])])
            if g.intersects(frame):
                s.parcels.append(g.buffer(0))
    bg = [g for g, _ in s.bd_buildings]
    bidx = shapely.STRtree(bg) if bg else None
    private = []

    def open_to_all(pr, g):
        """Not a house: a block of flats (3 dwellings or more) or a building with shops or services — its ground is open to
        whoever passes (the owner's mapper, 2026-11-12: an accessible courtyard came out olive)."""
        u = ((pr.get("usage_1") or "") + " " + (pr.get("usage_2") or "")).lower()
        return "commercial" in u or (pr.get("nombre_de_logements") or (0 if g.area < 250 else 3)) >= 3

    for pg in s.parcels:
        if pg.area > 6000 or bidx is None:
            continue
        hits = [i for i in bidx.query(pg) if bg[i].intersection(pg).area > 20]
        pr = [s.bd_buildings[i][1] for i in hits]
        res = sum(bg[i].intersection(pg).area for i, p in zip(hits, pr)
                  if (p.get("usage_1") or "").lower().startswith("résidentiel") and (p.get("nature") or "").lower() not in ("église", "chapelle"))
        pub = any((p.get("usage_1") or "").lower().startswith(("religieux", "sportif")) for p in pr)
        if res > 25 and not pub and not any(open_to_all(p, bg[i]) for i, p in zip(hits, pr)):
            private.append(pg)
    for f in bdtopo("zone_d_activite_ou_d_interet"):
        p = f["properties"]; cat = (p.get("categorie") or "").lower(); nat = (p.get("nature") or "").lower()
        if cat.startswith("science et enseignement") and any(k in nat for k in ("école", "collège", "lycée", "enseignement")):
            g = g2(f["geometry"])
            if g is not None and g.geom_type.endswith("Polygon"):
                private.append(g.buffer(0))
    for e in o.el:
        t = e.get("tags", {})
        if closed_to_all(t) and ({"zone", "lawn", "pool", "private"} & e["k"]) and e["type"] != "node":
            g = o.geom(e, area=True)
            if g is not None and g.geom_type.endswith("Polygon"):
                private.append(g)
    PRIVATE = union(private)
    if not s.RAIL.is_empty:
        PRIVATE = PRIVATE.union(s.RAIL.buffer(5, cap_style="flat"))
    # the streets and paths are public whatever the cadastre says; a bridge's deck is no ground not to be entered
    PRIVATE = PRIVATE.difference(s.PAVED.buffer(0.3)).difference(s.RUN_DECK)
    # a way open to all that crosses the ground not to be entered keeps a corridor of its own (a right of way: the olive is what
    # is wrong) — only where it leads through: a way that ends inside (a path to a house's door) is the garden's
    corr = []
    for g in s.public_ways:
        for pc in lines(g.intersection(PRIVATE)):
            ends = [Point(pc.coords[0]), Point(pc.coords[-1])]
            if pc.length >= 1 and all(PRIVATE.boundary.distance(q) < 0.5 for q in ends):
                corr.append(pc.buffer(1.1, cap_style="flat"))
    s.PW_CORR = union(corr)
    s.PRIVATE = PRIVATE.difference(s.PW_CORR)
    # the public road space (the owner's mapper, 2026-11-12: « the strip at a paved area's side is a sidewalk »): what the cadastre
    # leaves between its parcels, within their reach, by a street or a square
    s.PARCELS = union(s.parcels)
    s.PUBLIC = shapely.Polygon()
    if s.parcels:
        P = s.PARCELS.buffer(20, join_style="mitre").buffer(-20, join_style="mitre").difference(s.PARCELS).intersection(frame).difference(s.B)
        P = P.buffer(-0.25).buffer(0.25)
        roads = union([s.CARR] + [q for q in s.paved if q.area > 200])
        s.PUBLIC = P.intersection(roads.buffer(15))
    env.log("private ground", round(s.PRIVATE.area), "m², rights of way through it", len(corr), "public road space", round(s.PUBLIC.area), "m²")
