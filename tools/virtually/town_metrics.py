"""A town map measured, and two versions of one compared — the yardstick for every change to the generator (townmap/).

    py town_metrics.py <race> [--map F] [--json OUT]                 the measures of DATA/<race>/map_objects.json
    py town_metrics.py <race> --sheet OUT.html --old OLD.json [--map NEW.json] [--size 200] [--ppm 4]
                                                                     twelve fixed places (a 4 × 3 grid over the area), old beside new

The measures:
- objects and vertices (a mapper redraws what is too heavy to edit), by symbol for the main ones;
- the legibility report's counts (src/legibility.json: errors, warnings, the white strips and openings apart);
- OpenStreetMap's areas shown: for each kind of area the generator reads (tagmap.py) — lawns, woods, water, pitches, paved
  areas, buildings —, the share of its surface that the map draws with a symbol of that kind, outside the ground not to be
  entered and the buildings (what lies in a garden is generalised away on purpose);
- the tags the table does not know (src/osm_unknown.json) and the stages' times (src/timing.json)."""
import json, sys
from pathlib import Path

import shapely
from shapely.geometry import Polygon, box as sbox
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from townmap import env as E, sources  # noqa: E402

# the symbols (their numbers' integer part, with sub-number where it matters) that show each kind of OSM area
SHOWS = {"lawn": {401000, 402000, 415000}, "water": {301000}, "pitch": {401000, 501000, 520000},
         "paved": {501000, 501003, 501004}, "building": {521000, 522000}}
GROUND = {401000, 402000, 403000, 406000, 408000, 410000, 411000, 501000, 501003, 501004, 520000, 301000, 521000}


def poly_of(o, k, cx, cy):
    try:
        f = lambda r: [(x * k + cx, y * k + cy) for x, y in (p[:2] for p in r)]
        g = Polygon(f(o["rings"][0]), [f(r) for r in o["rings"][1:] if len(r) >= 4])
        return g if g.is_valid else g.buffer(0)
    except Exception:
        return Polygon()


def measures(race, map_file=None):
    env = E.Env(race)
    doc = json.load(open(map_file or env.RD / "map_objects.json", encoding="utf-8"))
    objs = doc["objects"]
    k = doc["scale"] / 1000; cx, cy = doc["realWorld"]["x"], doc["realWorld"]["y"]
    out = {"objects": len(objs), "vertices": sum(len(r) for o in objs for r in o["rings"]),
           "curve_points": sum(len(r) for o in objs for r in o.get("bez", []))}
    by = {}
    for o in objs:
        by[o["sym"]] = by.get(o["sym"], 0) + 1
    out["by_symbol"] = {str(s): by.get(s, 0) for s in (401000, 402000, 501000, 501001, 520000, 521000, 417000, 418000, 995000)}
    out["trees"] = by.get(417000, 0) + by.get(418000, 0)
    leg = env.SRC / "legibility.json"
    if map_file is None and leg.exists():
        r = json.load(open(leg, encoding="utf-8"))
        ent = r.get("entries", {})
        out["legibility"] = {"errors": r["gate"]["error"], "warnings": r["gate"]["warn"],
                             "white_strips_openings": sum(ent.get(x, {}).get("left", 0) for x in ("sp.3.3.sliver", "sp.405.openings"))}
    # OpenStreetMap's areas shown
    area = {}
    for o in objs:
        if o["otp"] == 3 and o["sym"] in GROUND:
            area.setdefault(o["sym"], []).append(poly_of(o, k, cx, cy))
    U = {s: unary_union(v) for s, v in area.items()}
    box = sbox(*env.A["box"]).buffer(-5)
    hidden = unary_union([U.get(520000, Polygon()), U.get(521000, Polygon())])
    osm = sources.Osm(env)
    shown = {}
    for kind in ("lawn", "water", "pitch", "paved", "building", "wood"):
        tot = got = 0.0
        for g, e in osm.areas(kind):
            g = g.intersection(box)
            if kind not in ("building", "pitch"):
                g = g.difference(hidden)
            if g.is_empty or g.area < 20:
                continue
            if kind == "wood":                             # forest is the paper's white: no ground symbol over it
                cov = g.area - sum(g.intersection(u).area for s, u in U.items() if s not in (406000, 408000, 410000))
            else:
                cov = unary_union([U[s] for s in SHOWS[kind] if s in U] or [Polygon()]).intersection(g).area
            tot += g.area; got += cov
        if tot:
            shown[kind] = {"m2": round(tot), "shown": round(100 * got / tot, 1)}
    out["osm_areas_shown"] = shown
    tot = sum(v["m2"] for v in shown.values()); out["osm_areas_shown_all"] = round(sum(v["m2"] * v["shown"] for v in shown.values()) / max(tot, 1), 1)
    for name in ("osm_unknown", "timing"):
        f = env.SRC / f"{name}.json"
        if map_file is None and f.exists():
            out[name] = json.load(open(f, encoding="utf-8"))
    return out


def sheet(race, old, new, out_file, size=200.0, ppm=4.0):
    """Twelve places, old beside new, drawn by the review sheet's renderer (sheet.py)."""
    import base64, io
    import sheet as SH
    env = E.Env(race)
    b = env.A["box"]
    maps = [SH.Map(json.load(open(f, encoding="utf-8"))) for f in (old, new)]

    def img(M, x, y):
        im = M.crop(x, y, size, ppm)
        buf = io.BytesIO(); im.save(buf, "WEBP", quality=80)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

    rows = []
    for j in range(3):
        for i in range(4):
            x = b[0] + (i + 0.5) * (b[2] - b[0]) / 4; y = b[3] - (j + 0.5) * (b[3] - b[1]) / 3
            rows.append(f"<h2>{j * 4 + i + 1}. E {x:.0f} · N {y:.0f}</h2><div class='pair'><figure><img src='{img(maps[0], x, y)}'><figcaption>{Path(old).name}</figcaption></figure>"
                        f"<figure><img src='{img(maps[1], x, y)}'><figcaption>{Path(new).name}</figcaption></figure></div>")
    Path(out_file).write_text("<!doctype html><meta charset='utf-8'><title>" + race + " — before / after</title><style>body{font:14px system-ui;margin:16px;background:#f4f3ee}"
                              ".pair{display:flex;gap:8px;flex-wrap:wrap}figure{margin:0;flex:1 1 420px;max-width:820px}img{width:100%;border:1px solid #bbb}h2{font-size:15px}</style>"
                              f"<h1>{race}: {size:.0f} m crops, old (left) and new (right)</h1>" + "".join(rows), encoding="utf-8")
    print(out_file)


if __name__ == "__main__":
    a = sys.argv[1:]
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    if "--sheet" in a:
        env = E.Env(a[0])
        sheet(a[0], opt("--old"), opt("--map", str(env.RD / "map_objects.json")), opt("--sheet"), float(opt("--size", 200)), float(opt("--ppm", 4)))
    else:
        m = measures(a[0], opt("--map"))
        print(json.dumps(m, indent=1, ensure_ascii=False))
        if "--json" in a:
            json.dump(m, open(opt("--json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
