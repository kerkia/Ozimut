"""The legibility check's review sheet: one HTML page with a crop of the map round every place a rule flagged (its rule's
paragraph, text and detail, its Lambert 93 coordinates), then the rules no program checks (the manual list) and those still
planned. Drawn here from map_objects.json, with no OCAD or browser: what the generator wrote, as a mapper reads it.

    py sheet.py <map_objects.json> <legibility.json> <out.html> [--per 12] [--size 48] [--ppm 8]

legibility.py's --sheet calls write() itself."""
import base64
import html
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# ISSprOM / ISOM colours, roughly as printed (the overprint's purple for the course and the helpers)
AREA = {"401": (255, 196, 92), "402": (255, 214, 140), "403": (255, 228, 170), "404": (255, 236, 196), "405": (255, 255, 255),
        "406": (204, 238, 180), "407": (204, 238, 180), "408": (150, 216, 118), "409": (150, 216, 118), "410": (72, 182, 72),
        "411": (34, 139, 34), "412": (240, 230, 120), "413": (240, 230, 120), "414": (255, 236, 196), "415": (255, 196, 92),
        "301": (64, 180, 236), "302": (64, 180, 236), "304": (64, 180, 236), "308": (150, 210, 236), "310": (150, 210, 236),
        "501": (232, 200, 166), "501.3": (232, 200, 166), "501.4": (214, 168, 128), "520": (158, 158, 46),
        "521": (128, 128, 128), "522": (196, 196, 196), "529": (90, 90, 90), "709": (214, 96, 214), "993": (230, 230, 255)}
ORDER = ["401", "402", "403", "404", "414", "415", "412", "413", "406", "407", "408", "409", "410", "411", "308", "310", "301",
         "302", "304", "501", "501.3", "501.4", "520", "522", "521", "529", "993", "709"]
BLACK, BROWN, BLUE, PURPLE, GREEN = (0, 0, 0), (186, 86, 20), (0, 120, 220), (180, 60, 180), (0, 130, 0)
LINE = {"101": (BROWN, 0.14), "102": (BROWN, 0.25), "103": (BROWN, 0.14), "104": (BROWN, 0.25), "105": (BROWN, 0.25),
        "305": (BLUE, 0.25), "306": (BLUE, 0.18), "501.1": (BLACK, 0.10), "502": (BLACK, 0.25), "505": (BLACK, 0.35),
        "506": (BLACK, 0.25), "507": (BLACK, 0.25), "509": (BLACK, 0.4), "512.1": (BLACK, 0.14), "512.2": (BLACK, 0.14),
        "512.3": (BLACK, 0.14), "513": (BLACK, 0.21), "514": (BLACK, 0.21), "515": (BLACK, 0.4), "516": (BLACK, 0.21),
        "517": (BLACK, 0.21), "518": (BLACK, 0.4), "521.9": (BLACK, 0.14), "522.9": (BLACK, 0.1), "529": (BLACK, 0.4),
        "532": (BLACK, 0.6), "601": (BLUE, 0.12), "415": (BLACK, 0.1), "995": (PURPLE, 0.3), "201": (BLACK, 0.4),
        "202": (BLACK, 0.25)}
POINT = {"417": (GREEN, 0.55), "418": (GREEN, 0.4), "419": (GREEN, 0.3), "531": (BLACK, 0.4), "526": (BLACK, 0.5),
         "311": (BLUE, 0.4), "204": (BLACK, 0.3), "205": (BLACK, 0.45), "109": (BROWN, 0.35), "110": (BROWN, 0.35),
         "111": (BROWN, 0.35), "112": (BROWN, 0.35), "113": (BROWN, 0.35), "312": (BLUE, 0.4), "530": (BLACK, 0.4)}


def code(sym):
    n, s = divmod(int(sym), 1000)
    return f"{n}.{s}" if s else str(n)


def look(table, c):
    """A code's style: its own, else its base number's (513.1 → 513)."""
    return table.get(c) or table.get(c.split(".")[0])


class Map:
    """map_objects.json in metres (Lambert 93), each object's bounding box kept for the crops."""
    def __init__(self, doc):
        self.k = doc["scale"] / 1000.0
        rw = doc.get("realWorld") or {"x": 0, "y": 0}
        self.cx, self.cy = rw["x"], rw["y"]
        self.objs, bb = [], []
        for o in doc["objects"]:
            rings = [np.asarray(r, float)[:, :2] * self.k + (self.cx, self.cy) for r in o.get("rings", []) if len(r)]
            if not rings:
                continue
            a = np.vstack(rings)
            self.objs.append((code(o["sym"]), o["otp"], rings))
            bb.append((a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max()))
        self.bb = np.asarray(bb) if bb else np.zeros((0, 4))
        self.k_mm = self.k                                     # metres a map mm

    def crop(self, E, N, size=48.0, ppm=8.0):
        W = int(size * ppm)
        x0, y0, x1, y1 = E - size / 2, N - size / 2, E + size / 2, N + size / 2
        hit = np.nonzero((self.bb[:, 2] >= x0) & (self.bb[:, 0] <= x1) & (self.bb[:, 3] >= y0) & (self.bb[:, 1] <= y1))[0]
        im = Image.new("RGB", (W, W), (255, 255, 255))
        dr = ImageDraw.Draw(im)
        tp = lambda a: [((x - x0) * ppm, (y1 - y) * ppm) for x, y in a]
        objs = [self.objs[i] for i in hit]
        rank = {c: i for i, c in enumerate(ORDER)}
        areas = sorted([o for o in objs if o[1] == 3], key=lambda o: rank.get(o[0], rank.get(o[0].split(".")[0], -1)))
        for c, _, rings in areas:
            col = look(AREA, c)
            if col is None:
                continue
            if c == "709":                                     # the setter's hatching: an outline and a few lines
                dr.polygon(tp(rings[0]), outline=col)
                continue
            m = Image.new("L", (W, W), 0)
            md = ImageDraw.Draw(m)
            md.polygon(tp(rings[0]), fill=255)
            for h in rings[1:]:
                md.polygon(tp(h), fill=0)
            im.paste(Image.new("RGB", (W, W), col), (0, 0), m)
        for c, otp, rings in objs:
            if otp != 2:
                continue
            st = look(LINE, c)
            if st is None:
                if c[0] in "89" or c[0] == "6" or c.startswith("99"):
                    continue
                st = (BLACK, 0.12)
            col, w = st
            for r in rings:
                dr.line(tp(r), fill=col, width=max(1, round(w * self.k * ppm)))
        for c, otp, rings in objs:
            if otp != 1:
                continue
            st = look(POINT, c) or (BLACK, 0.3)
            col, r_mm = st
            x, y = tp(rings[0][:1])[0]
            r = max(2, r_mm * self.k * ppm)
            dr.ellipse([x - r, y - r, x + r, y + r], outline=col, width=2)
        # the place flagged, and a 10 m scale bar
        c_ = W / 2
        for rr, wd in ((3.2 * ppm, 3),):
            dr.ellipse([c_ - rr, c_ - rr, c_ + rr, c_ + rr], outline=(230, 0, 0), width=wd)
        dr.line([(8, W - 10), (8 + 10 * ppm, W - 10)], fill=(0, 0, 0), width=3)
        dr.text((10, W - 26), "10 m", fill=(0, 0, 0))
        return im


def b64(im):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=78)
    return base64.b64encode(buf.getvalue()).decode("ascii")


SEV_FR = {"error": "erreur", "warn": "avertissement", "info": "information"}


def write(doc, rep, cat, out, per=12, size=48.0, ppm=8.0, title=""):
    """rep: legibility.py's report as JSON (Report.json()); cat: the standard's catalogue."""
    M = Map(doc)
    g = rep["gate"]
    ents = rep["entries"]
    order = sorted(ents, key=lambda k: ({"error": 0, "warn": 1}.get(ents[k]["sev"], 2), -ents[k]["left"], k))
    esc = html.escape
    parts = [f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Lisibilité — {esc(title)}</title><style>
body{{font:14px/1.45 system-ui,sans-serif;margin:16px;background:#f6f6f2;color:#222}}
h1{{font-size:20px}} h2{{font-size:16px;margin:28px 0 6px;border-top:1px solid #ccc;padding-top:12px}}
.gate{{padding:8px 12px;border-radius:6px;display:inline-block;font-weight:600}}
.ok{{background:#d8f0d0}} .no{{background:#f8d8d0}}
.sev-error{{color:#b00}} .sev-warn{{color:#a60}} .sev-info{{color:#666}}
.grid{{display:flex;flex-wrap:wrap;gap:10px}} figure{{margin:0;width:260px;background:#fff;border:1px solid #ddd;padding:4px}}
figure img{{width:256px;height:256px;display:block}} figcaption{{font-size:12px}}
table{{border-collapse:collapse}} td,th{{border-bottom:1px solid #ddd;padding:3px 8px;text-align:left;vertical-align:top}}
.ref{{color:#666;font-size:12px}}
</style></head><body><h1>Contrôle de lisibilité — {esc(title)}</h1>
<p>Norme : {esc(rep.get('standard', ''))}. Chaque vignette : {size:.0f} m de côté, centrée sur l'endroit signalé (cercle rouge),
coordonnées en Lambert 93.</p>
<p class="gate {'ok' if g['publishable'] else 'no'}">{g['error']} erreurs, {g['warn']} avertissements —
{'publiable' if g['publishable'] else 'non publiable sans la liste des écarts'}</p>
<h2>Résumé</h2><table><tr><th>Règle</th><th>Gravité</th><th>Restants</th><th>Référence</th></tr>"""]
    for key in order:
        v = ents[key]
        parts.append(f"<tr><td><a href='#{esc(key)}'>{esc(key)}</a></td><td class='sev-{v['sev']}'>{SEV_FR.get(v['sev'], v['sev'])}"
                     f"</td><td>{v['left']}</td><td class='ref'>{esc(v.get('ref') or '')}</td></tr>")
    parts.append("</table>")
    n_img = 0
    for key in order:
        v = ents[key]
        if not v["left"]:
            continue
        parts.append(f"<h2 id='{esc(key)}'><span class='sev-{v['sev']}'>{esc(key)}</span> — {v['left']} "
                     f"restant{'s' if v['left'] > 1 else ''}<br><span class='ref'>{esc(v.get('ref') or '')}</span></h2>"
                     f"<p>{esc(v.get('fr') or v.get('en') or v['check'])}</p><div class='grid'>")
        places = v["places"]
        step = max(1, len(places) // per)                       # spread over the map, not the first few
        for it in places[::step][:per]:
            E, N = it["at"]
            im = M.crop(E, N, size, ppm).resize((256, 256), Image.LANCZOS)
            parts.append(f"<figure><img alt='' src='data:image/webp;base64,{b64(im)}'><figcaption>{esc(it['detail'])}"
                         f"<br>E {E:.0f} N {N:.0f}</figcaption></figure>")
            n_img += 1
        if len(places) > per:
            parts.append(f"<p class='ref'>{per} vignettes sur {len(places)} ; toutes les coordonnées dans legibility.json.</p>")
        parts.append("</div>")
    man = [r for r in cat["rules"] if r["kind"] == "manual"]
    if man:
        parts.append("<h2>À vérifier à la main (aucun programme ne le peut)</h2><table>")
        for r in man:
            parts.append(f"<tr><td>☐</td><td>{esc(r['fr'])}<br><span class='ref'>{esc(r['ref'])} · {esc(r['id'])}</span></td></tr>")
        parts.append("</table>")
    plan = [r for r in cat["rules"] if r.get("status") == "planned"]
    if plan:
        parts.append("<h2>Contrôles prévus, pas encore programmés</h2><table>")
        for r in plan:
            parts.append(f"<tr><td>{esc(r['fr'])}<br><span class='ref'>{esc(r['ref'])} · {esc(r['id'])}</span></td></tr>")
        parts.append("</table>")
    parts.append("</body></html>")
    Path(out).write_text("".join(parts), encoding="utf-8", newline="\n")
    return n_img


def main():
    a = sys.argv[1:]
    doc = json.load(open(a[0], encoding="utf-8"))
    rep = json.load(open(a[1], encoding="utf-8"))
    sys.path.insert(0, str(Path(__file__).parent))
    import legibility
    cat, _ = legibility.catalogue(rep.get("standard") or "issprom2019-2")
    opt = lambda n, d: float(a[a.index(n) + 1]) if n in a else d
    n = write(doc, rep, cat, a[2], per=int(opt("--per", 12)), size=opt("--size", 48.0), ppm=opt("--ppm", 8.0),
              title=Path(a[0]).parent.name)
    print(f"sheet: {a[2]}, {n} crops")


if __name__ == "__main__":
    main()
