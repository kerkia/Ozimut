"""The national relays' history (« Relais nationaux », menu « Classement »; owner, 2026-10-26): the Championnat de France des
Clubs (CFC, since 1999) and the Critérium National des Équipes (CNE, since 2006), every team of every edition found in the
archives, each tied to its club, for the page `site/assets/js/pages/relayhistory.js`; since 2026-11-05 the sprint relay
championship (crs.csv), since 2026-11-15 the relay championship by category (rc.csv, 2003 on).

The rankings were gathered by hand on 2026-10-26 from the archives (LIFCO, FFCO's former site archives.ffcorientation.fr,
CO Mulhouse's former site, the organisers' own files, O'Live): two CSV files, kept out of the public repository like every
result, in R2 `relays/` (cfc.csv, cne.csv), which the workflow copies to `$CN_DATA_DIR/relays/`. `build(fr_out)` turns
them into `site/data/fr/relays.json` at every run (cheap: ~12 000 rows); a new edition = new rows in the CSV, uploaded
again with `npx wrangler r2 object put cn-state/relays/cne.csv --file … --remote`.

The files print a team's club number in some editions only: the others are tied by name (`club_of`): the team's name
folded and stripped of its category words and its number, then its first words looked up among the names the numbered
teams and FFCO's club list use (a prefix must point to one club in three quarters of its uses), else `ALIAS`. Open,
mixed, military, league and foreign teams have no club: they keep their place in the edition's ranking but score
nothing on the page.
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import paths

SRC = paths.DATA_DIR / "relays"
NAMES = paths.CACHE / "reference_names.json"       # FFCO's club list (build_site.reference_names)
VERSION = 3   # 2026-11-05: the sprint relay championship (crs); 2026-11-15: the relay championship by category (rc*)

# the categories of the page: CFC's four divisions (D1-D4 2000-2006, N1/N2/Promotion Nationale/Promotion 2007-2009,
# N1-N4 since 2010) and its youth relay, the Trophée Thierry Gueorgiou (since 2008); CNE's four relays. The open
# trophies run beside both are left out.
CFC_DIV = {"D1": "cfc1", "N1": "cfc1", "D2": "cfc2", "N2": "cfc2", "D3": "cfc3", "N3": "cfc3", "Promotion Nationale": "cfc3",
           "D4": "cfc4", "N4": "cfc4", "Promotion": "cfc4", "Trophée Thierry Gueorgiou": "ttg"}
CNE_CAT = {"Hommes": "cneH", "Dames": "cneD", "Jeunes": "cneJ", "Mini-relais": "cneM"}
# the Championnat de France de Relais Sprint (CFRS, since 2017; owner, 2026-11-05): one mixed relay of four, a woman's leg first
# and last; gathered on 2026-11-05 from FFCO's archive (archives.ffcorientation.fr, each edition's « Résultats complets »): crs.csv
CRS_CAT = {"Mixte": "crs"}
# the Championnat de France de Relais par catégorie (owner, 2026-11-15): one relay a category (H/D 21, 35, 45…, the juniors'), each
# team of two or three runners of one club; gathered on 2026-11-15 from the archives into rc.csv (`category` "H21", "D35"…): one
# key a category, « rcH21 »
RC_CAT = re.compile(r"[HD]\d{1,2}")
STATUS = {"ok": "", "pm": "pm", "abandon": "ab", "aband": "ab", "absent": "abs", "disq": "dsq", "nc": "nc",
          "hors délai": "hd", "temps max": "hd"}

# Each edition: where, and how complete the archive is — "full" every team, "partial" some (2004-2005: LIFCO's extracts;
# CNE 2019: ECHO 73's extract of Helga's results; CNE 2015: the podium places the clubs' news give), "winner" only the
# champion (CFC 1999-2003: NOSE's newsletter « ECO NOSE n°19 », a 2014 press article), "none" nothing, "cancelled" (Covid).
EDITIONS = {
    "cfc": {
        1999: ("Fontainebleau", "77", "winner"), 2000: ("Blois", "41", "winner"), 2001: ("Saint-Astier", "24", "winner"),
        2002: ("La Bresse", "88", "none"), 2003: ("Forêt de Poligny (Nemours)", "77", "winner"),
        2004: ("Mulhouse", "68", "partial"), 2005: ("Loches", "37", "partial"), 2006: ("Sédières", "19", "full"),
        2007: ("Guérigny", "58", "full"), 2008: ("Marlhes", "42", "full"), 2009: ("Viam", "19", "full"),
        2010: ("Bouilland", "21", "full"), 2011: ("Rombas", "57", "full"), 2012: ("Font d'Urle", "26", "full"),
        2013: ("Bonneuil-Matours", "86", "full"), 2014: ("Locquignol", "59", "full"), 2015: ("Val du Pâtre (Buhl)", "68", "full"),
        2016: ("Sault", "84", "full"), 2017: ("Casteljaloux", "47", "full"), 2018: ("Saint-Léger-en-Yvelines", "78", "full"),
        2019: ("Gérardmer", "88", "full"), 2020: ("", "", "cancelled"), 2021: ("", "", "cancelled"),
        2022: ("Auriac", "19", "full"), 2023: ("Retord", "01", "full"), 2024: ("Mazaugues", "83", "full"),
        2025: ("Bombannes", "33", "full"), 2026: ("Bourbach-le-Bas", "68", "full"),
    },
    "cne": {
        2006: ("Schweighouse-Thann", "68", "full"), 2007: ("Fontainebleau", "77", "full"), 2008: ("Sédières", "19", "full"),
        2009: ("Grès de Cernay", "78", "full"), 2010: ("Reilhac", "46", "full"), 2011: ("Frigolet", "13", "full"),
        2012: ("Rennes", "35", "full"), 2013: ("Nérac", "47", "full"), 2014: ("Oléron", "17", "full"),
        2015: ("Chalmazel", "42", "partial"), 2016: ("Sédières", "19", "full"), 2017: ("Villecartier", "35", "full"),
        2018: ("Pavoux", "04", "full"), 2019: ("Cheillé", "37", "partial"), 2020: ("", "", "cancelled"),
        2021: ("Les Rives", "34", "full"), 2022: ("Saint-Jean-de-Braye", "45", "full"), 2023: ("La Palmyre", "17", "full"),
        2024: ("Fameck", "57", "full"), 2025: ("Arbonne-la-Forêt", "77", "full"), 2026: ("Le Bessat", "42", "full"),
    },
    # 2018 and 2021: the département only (Rambouillet and the Corrèze's town not confirmed)
    "crs": {
        2017: ("Casteljaloux", "47", "full"), 2018: ("Yvelines", "78", "full"), 2019: ("Le Bourget-du-Lac", "73", "full"),
        2020: ("", "", "cancelled"), 2021: ("Corrèze", "19", "full"), 2022: ("Argentat", "19", "full"),
        2023: ("Oyonnax-Bellignat", "01", "full"), 2024: ("Saint-Maximin-la-Sainte-Baume", "83", "full"),
        2025: ("Lacanau", "33", "full"), 2026: ("Mulhouse", "68", "full"),
    },
    # the category relays (rc.csv): 2001 and 2003's complete lists are on the Wayback Machine (ffco.asso.fr), which refused the PC;
    # 2002 and 2006 nowhere found; 2005 cancelled (weather); 2007's venue not found (the CF week in the Tarn, 81); 2012 with the CF MD
    "rc": {
        2001: ("", "", "none"), 2002: ("", "", "none"), 2003: ("Besançon", "25", "partial"),
        2004: ("La Tremblade", "17", "full"), 2005: ("Saint-Genest-Malifaux", "42", "cancelled"),
        2006: ("Boucq", "54", "none"), 2007: ("", "", "full"), 2008: ("Mûr-de-Bretagne", "22", "full"),
        2009: ("Antheuil", "21", "full"), 2010: ("Saint-Pée-sur-Nivelle", "64", "full"), 2011: ("Viam", "19", "full"),
        2012: ("Chaud Clapier (Vercors)", "26", "full"), 2013: ("Couchey", "21", "full"),
        2014: ("Dévoluy (Superdévoluy)", "05", "full"), 2015: ("Chartrier-Ferrière", "19", "full"),
        2016: ("Huelgoat", "29", "full"), 2017: ("Saint-Jean-de-Bœuf", "21", "full"), 2018: ("Lans-en-Vercors", "38", "full"),
        2019: ("Aillons-Margériaz", "73", "full"), 2020: ("", "", "cancelled"), 2021: ("La Plagne", "73", "full"),
        2022: ("Risoul", "05", "full"), 2023: ("Gréalou", "46", "full"), 2024: ("Chenecey-Buillon", "25", "full"),
        2025: ("Bugeat", "19", "full"), 2026: ("Claudon", "88", "full"),
    },
}
# what is known of the editions without a file: the champion of CFC's first division, CNE 2015's podium places
KNOWN = {
    ("cfc1", 1999): [(1, "4201")], ("cfc1", 2000): [(1, "4201")], ("cfc1", 2001): [(1, "4201")], ("cfc1", 2003): [(1, "7703")],
    ("cneH", 2015): [(1, "7309"), (2, "2517")], ("cneD", 2015): [(1, "2517")],
}

# A club's name on the page: the short name orienteers use (the teams' own), else FFCO's name.
SHORT = {
    "4201": "NOSE", "2517": "OTB", "5907": "TAD", "8809": "HVO", "6911": "ASUL", "1307": "ACA", "7807": "GO78",
    "4203": "OE42", "2606": "LOUP", "7703": "CSLG Melun", "2508": "Balise 25", "6307": "Balise 63", "7716": "Balise 77",
    "0404": "Balise 04", "7404": "ASO Annecy", "5116": "ASO Sillery", "2109": "AS Quetigny", "2105": "ADO Chenôve",
    "3705": "COTS", "6803": "CO Mulhouse", "6804": "CO Colmar", "6806": "CO Buhl Florival", "6707": "ASOP Erstein",
    "7305": "ECHO 73", "7309": "COCS", "3810": "Orient'Alp", "3913": "O'Jura", "0111": "CO Ambérieu", "0109": "O'Bugey",
    "7707": "OPA Montigny", "8404": "OPA Avignon", "3105": "TOAC", "2904": "Quimper Orientation", "5906": "VALMO",
    "4012": "BROS", "3308": "SAGC Cestas", "8903": "Auxerre Ycone", "6208": "Boussole Audomaroise", "1705": "CMO",
    "5402": "SCAPA Nancy", "7407": "SOS GO", "8311": "POLES", "6913": "Crapahut", "0207": "Vervins Orientation",
    "5604": "CO Lorient", "3914": "JSO", "8105": "BOA", "2407": "POP", "0705": "Raidlink's 07", "1303": "MARCO",
    "3319": "SMOG", "0615": "VSAO", "3318": "ASM", "4709": "PSNO", "2704": "COBS", "7605": "COBS Montivilliers",
    "5703": "TA Fameck", "6008": "Noyon CO", "1905": "Brive Limousin CO", "7720": "TOM Meaux", "4601": "FiNO 46",
    "4204": "Boussole en Forez", "3323": "US Cenon", "8607": "Poitiers CO", "7715": "AS Samois", "3408": "AMSO",
    "8812": "Ozone", "8807": "LOS", "1403": "Orientation Caennaise", "7109": "Givry SO", "7717": "JS La Ferté-Gaucher",
    "3801": "Dauphiné Orientation", "7311": "ANO Albertville", "4504": "ASCO Orléans", "2108": "Talant SO",
    "6709": "SC Barr", "7205": "LMA 72", "0406": "POIL", "9211": "DSA", "9105": "COL Étréchy", "3502": "CRCO Rennes",
    "2605": "Valence SO", "1408": "Vik'Azim", "9404": "AS IGN", "6205": "Opale Orientation", "8702": "Orientation 87",
    "0103": "CSA BA 278",
}
# Names the teams use that the numbered teams never did (folded, without category words: see `words`)
ALIAS = {
    "ORIENTA GUYANCOURT": "7807", "GUYANCOURT": "7807", "ORIENTATION 78": "7807", "OTEAM BESANCON": "2517", "OT BESANCON": "2517",
    "SC BARR": "6709", "ASSAMOIS": "7715", "AS SAMOIS": "7715", "BALISE B25": "2508", "BALISE25": "2508", "B25": "2508",
    "BA77": "7716", "BALISE77": "7716", "BALISE63": "6307", "BALISE04": "0404", "AMBERIEU": "0111", "AUXERRE YCONE": "8903",
    "ASQORIENTATION": "2109", "SPORTS ORI ANNECY": "7404", "CLUB ADOC": "2105", "ADOCHENOVE": "2105", "ANIMSILLERYORIENTATION": "5116",
    "ASO SILLER": "5116", "CESTAS": "3308", "SAGC CESTA": "3308", "OPA MONTIG": "7707", "OPAVIGNON": "8404", "RILLEUX CSM": "6911",
    "CSM RILLEUX": "6911", "HAUTE VOSGES ORIENTATION": "8809", "HAUTES VOSGES ORIENTATION": "8809", "VERVINSO": "0207",
    "VERVINSOTTG": "0207", "VERVINSETCIETTG": "0207", "VERVINSOHOMMES": "0207", "VERVINSODAMES": "0207", "VERVINSOJEUNES": "0207",
    "ORIENTATIO DAUPHINE": "3801", "SPORT ORIE GIVRY": "7109", "ORIENTATION CAEN": "1403", "JS FERTE GAUCHER": "7717",
    "CO UR DE SAVOIE": "7309", "COCS ECHO": "7309", "TOUS AZIMU DOUAI": "5907", "TOUT AZIMU FAMECK": "5703", "TAF": "5703",
    "TA FAMEC": "5703", "NO SAINT ETIENNE": "4201", "CO COLMAR": "6804", "COCOLMAR": "6804", "CO BUHL FLORIVAL": "6806",
    "CO BUHL": "6806", "COBF": "6806", "OTEAM": "2517", "ASOP ERSTEIN": "6707", "AS QUETIGNY": "2109", "BALISE B": "2508",
    "OPA": "7707", "QO": "2904", "QUIMPER": "2904", "TOAC": "3105", "ADOC": "2105", "ADOCARNOTAURUS": "2105",
    "ADOCHARONOSAURUS": "2105", "ADOCHRONOS": "2105", "TOACTIVES": "3105", "TOACCROCHEZ": "3105", "ORIENTALP": "3810",
    "ACA": "1307", "AMSO": "3408", "OZONE": "8812", "ARO BIS": "6208", "COMULHOUSE": "6803", "ECHO 73 CHAMBERY": "7305",
    "ASC ORLEANS": "4504", "AS SAMOIS ASSAMOIS": "7715", "POITIERS C": "8607", "TALANT SO": "2108", "OE": "4203",
    "OE42D": "4203", "CO BOUCLE DE LA SEINE": "2704", "BEF BALISE": "2508", "O87": "8702", "OE42D1": "4203", "SO VALENCE": "2605", "COCSINELLES": "7309",
    "O JURA": "3913", "OJURA": "3913", "COC COLMAR": "6804", "CORREZE": "1905", "CORREZE CO": "1905", "CORREZE C CORREZE CO": "1905", "BRIVE": "1905", "NCO": "6008",
}
# whole names (folded) a club gave its teams: TAD's puns of 2021-2022 (« Full MeTAD Jacket », « La Grande TADrouille »)
TEAM_RE = [(re.compile(r"METAD JACKET|TADROUILLE|TADASHIAN|NAKTADMURA|INSTADGRAM|INGLORIOUS BASTADS|STAD WARS|TIC ET TAD"), "5907")]
# club numbers a file misprints: FFCO's 2009 CFC file gives TAD (5907) as 5709
CODE_FIX = {"5709": "5907"}
# words that name the team's category or its rank in the club, not the club
NOISE = set("HOMMES HOMME DAMES DAME FEMMES FEMME JEUNES JEUNE JEUNS JUNIOR JUNIORS MINI RELAIS MINIRELAIS MR TTG OPEN "
            "EQUIPE EQ N° NO H D J M F G A B C TEAM HOM FEM REL".split())
# teams that are no club's: open and mixed teams, military teams, leagues' and départements' selections, empty places
NOT_CLUB = re.compile(r"^(?:ECHO ASUL|VACANT|ABANDON|NONPARTAN|MIL |PASSO|LIGUE|CDCO|LARCO|LGECO|LHFCO|LNACO|HNOCCITANIE|"
                      r"LBRCO|BELGIQUE|IFK |OL ZIMMERBERG|OLK |OLG |SLOW LONDON|DELAI|PM$|EQUIPE$|$)")
OPEN = re.compile(r"\bOPEN\b")
# words too common to name a club alone (« S.O. VALENCE » is not SO Lunéville's)
GENERIC = set("CO SO AS US CS CLUB ORIENTATION ORIENTA ORIENTATIO SPORT SPORTS NATURE LES LA LE ASS ASSOCIATION RAID AZIMUT "
              "BALISE CSA ASC AL ESPACE COURSE".split())
NUMBERED = re.compile(r"\b(BALISE|ECHO|OE|ORIENTATION|ARO|LMA|QUIMPER|CDCO) (\d{2})\b")


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).upper()


def words(team: str) -> list[str]:
    """A team's name as words that may name its club: folded, without club numbers, category words, the team's
    number (« NOSE 2 », « OPA7 »), repeated words."""
    t = fold(team)
    t = re.sub(r"\b\d{3,5}[A-Z]{0,2}\b", " ", t)
    t = re.sub(r"[.'’`]", "", t)
    t = re.sub(r"[^A-Z0-9²]+", " ", t)
    t = NUMBERED.sub(r"\1\2", t)
    out = []
    for w in t.split():
        w = re.sub(r"(?<=[A-Z]{2})\d$", "", w)                   # « OPA7 », « ACA5 »: the team's number glued on
        if w in NOISE or re.fullmatch(r"\d{1,2}|[IVX]+", w):
            continue
        if w not in out:
            out.append(w)
    return out


class Clubs:
    """Who a team is: its club number when the file prints it, else by its name (see the module's text)."""

    def __init__(self, rows: list[dict], names: dict[str, str]):
        self.votes: dict[str, Counter] = defaultdict(Counter)
        for r in rows:
            m = re.fullmatch(r"(\d{4})[A-Z]{0,2}", r["club_code"])
            if m and m.group(1) != "9998":                    # 9998: FFCO's number for open teams
                self._add(words(r["team"]), CODE_FIX.get(m.group(1), m.group(1)), 1)
        for code, name in names.items():
            self._add(words(name), code, 3)
        self.known = {c for v in self.votes.values() for c in v}

    def _add(self, ws, code, w):
        for n in range(1, min(3, len(ws)) + 1):
            self.votes[" ".join(ws[:n])][code] += w

    def of(self, team: str, code: str) -> str:
        m = re.fullmatch(r"(\d{4})[A-Z]{0,2}", code or "")
        if m:
            return "" if m.group(1) == "9998" else CODE_FIX.get(m.group(1), m.group(1))
        if OPEN.search(fold(team)):      # an open team (FFCO's numbered files give them its number 9998)
            return ""
        m = re.search(r"(?<![\d.:])(\d{4})(?:[A-Z]{2})?\b(?![:.]\d)", team)    # « BA 6208 B.A. Homme »: the number in the name
        if m and m.group(1) in self.known:
            return CODE_FIX.get(m.group(1), m.group(1))
        f = fold(team)
        for rx, c in TEAM_RE:
            if rx.search(f):
                return c
        ws = words(team)
        key = " ".join(ws)
        if NOT_CLUB.match(key):
            return ""
        for n in range(min(3, len(ws)), 0, -1):
            k = " ".join(ws[:n])
            if k in ALIAS:
                return ALIAS[k]
            c = None if n == 1 and k in GENERIC else self.votes.get(k)
            if c:
                top, v = c.most_common(1)[0]
                if v >= 0.75 * sum(c.values()):
                    return top
        return ""


SMALL = {"De", "Du", "Des", "La", "Le", "Les", "Et", "D", "L", "En", "Sur", "Sous", "Aux", "Au"}


def _title(name: str) -> str:
    """FFCO's name in capitals, as a title: « CLUB ORIENTATION LOISIR ETRECHY » → « Club Orientation Loisir Etrechy »."""
    if not name:
        return ""
    ws = re.split(r"(\s+|-|')", name.title())
    return "".join(w.lower() if i and w in SMALL else w for i, w in enumerate(ws))


def _read(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [r for r in csv.DictReader(f, delimiter=";") if r.get("year", "").isdigit()]


def _team(name: str) -> str:
    """The team's name as shown: the club number the files print before or after it dropped."""
    ws = re.sub(r"\s*\b\d{4}[A-Z]{2}\b\s*", " ", name).split()
    s = " ".join(w for i, w in enumerate(ws) if not i or fold(w) != fold(ws[i - 1]))     # « NOSE NOSE N1 »
    return s.strip(" -") or name


def compile_(cfc: list[dict], cne: list[dict], names: dict[str, str], crs: list[dict] | None = None,
             rc: list[dict] | None = None) -> dict:
    crs, rc = crs or [], rc or []
    clubs = Clubs(cfc + cne + crs + rc, names)
    rc_cat = {r["category"]: "rc" + r["category"] for r in rc if RC_CAT.fullmatch(r["category"])}
    rows: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    divs: dict[int, dict[str, str]] = defaultdict(dict)        # CFC: the divisions' names of each year
    used = Counter()
    for src, key, table in ((cfc, "division", CFC_DIV), (cne, "category", CNE_CAT), (crs, "category", CRS_CAT), (rc, "category", rc_cat)):
        for r in src:
            cat = table.get(r[key])
            st = STATUS.get(r["status"].strip().lower())
            if not cat or st is None:
                continue
            y = int(r["year"])
            if src is cfc and cat != "ttg":
                divs[y][cat] = r[key]
            club = clubs.of(r["team"], r["club_code"])
            used[club] += 1
            place = int(r["place"]) if r["place"].strip().isdigit() else None
            rows[cat][str(y)].append([place, _team(r["team"]), club, r["time"].strip() or None, st])
    for (cat, y), known in KNOWN.items():
        if str(y) not in rows[cat]:
            rows[cat][str(y)] = [[p, SHORT.get(c, c), c, None, ""] for p, c in known]
            used.update(c for _, c in known)
    for cat in rows:
        for y in rows[cat]:
            rows[cat][y].sort(key=lambda r: (r[0] is None, r[0] or 0))
    editions = {}
    for comp, eds in EDITIONS.items():
        editions[comp] = {str(y): {"at": at, "dep": dep, "st": st, **({"div": divs[y]} if comp == "cfc" and divs.get(y) else {})}
                          for y, (at, dep, st) in eds.items()}
    used.pop("", None)
    club_names = {c: [SHORT.get(c) or _title(names.get(c, "")), names.get(c, "")] for c in sorted(used)}
    for c, (short, full) in club_names.items():
        if not short:                        # a club FFCO no longer lists: the name its teams used most
            ws = Counter(" ".join(words(r[1])[:2]) for cat in rows.values() for y in cat.values() for r in y if r[2] == c)
            club_names[c][0] = ws.most_common(1)[0][0].title() if ws else c
    return {"v": VERSION, "clubs": club_names, "editions": editions,
            "rows": {cat: dict(sorted(ys.items())) for cat, ys in rows.items()}}


def build(fr_out: Path, src: Path = SRC) -> bool:
    """Write fr_out/relays.json from the CSV files when they are there; True when the file changed."""
    if not (src / "cfc.csv").exists() or not (src / "cne.csv").exists():
        return False
    names = json.loads(NAMES.read_text(encoding="utf-8"))["clubs"] if NAMES.exists() else {}
    opt = lambda name: _read(src / name) if (src / name).exists() else []
    out = compile_(_read(src / "cfc.csv"), _read(src / "cne.csv"), names, opt("crs.csv"), opt("rc.csv"))
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    path = fr_out / "relays.json"
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


if __name__ == "__main__":
    import sys
    fr = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "site" / "data" / "fr"
    print("relays.json:", "written" if build(fr) else "unchanged or no source")
