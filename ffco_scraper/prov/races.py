"""The races the pilot watches, and the organisers' websites.

Two inputs: the agenda (site/data/agenda.json: upcoming and just-past races, with the organiser's website) and
FFCO's competitions already in the database (to cover the past month, and to know when FFCO has published a
race). A race is keyed 'a<agenda id>' when the agenda knows it, else 'f<FFCO course id>'; an agenda race gets its
FFCO id once FFCO publishes it (same day, same organiser, the closest name).

When to look again after a race (next_check): at every run (hourly) for three days, then once a day until the
14th day; a race FFCO has published is looked at a last time, then left alone.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .model import plain

WATCH_DAYS = 14
HOURLY_DAYS = 3
EPREUVE_TERRAIN = {"Sprint": "Sprint", "MD": "Forêt", "LD": "Forêt", "Nuit": "Forêt", "Relais": None}
TIMED = ("Pédestre", "VTT", "Ski")      # the disciplines raced against the clock (not trail-O, rogaines, raids)


def sync_country(con, agenda_path: Path, today: date, back_days: int, country: str) -> dict:
    """Another country's agenda (countries/<cc>: site/data/<cc>/agenda.json) -> its races of the last `back_days` days and
    the coming ones, keyed by the agenda's own ids (they name the country: « es20162444-2 »), `country` set, and the
    platform competitions the agenda already knows (`links`, from its `src`). France's rules (FFCO's competitions, club
    numbers, the merging of duplicates) do not apply."""
    lo = (today - timedelta(days=back_days)).isoformat()
    added = 0
    if not agenda_path.exists():
        return {"added": 0}
    stamp = now_iso()
    for e in json.loads(agenda_path.read_text(encoding="utf-8")).get("events", []):
        if e.get("kind") != "c" or not e.get("id") or e.get("date", "") < lo or e.get("cancelled") or e.get("spec") not in TIMED \
                or is_relay(e.get("name"), e.get("epr")):
            continue
        key = str(e["id"])
        links = {k: v for k, v in (e.get("src") or {}).items() if k != "sico"} or None
        vals = (e["date"], e["name"], e.get("place"), e.get("org"), e.get("terrain") or terrain_of(e), e.get("epr"), e.get("site"),
                json.dumps(links) if links else None)
        if con.execute("SELECT 1 FROM prov_races WHERE key = ?", (key,)).fetchone():
            con.execute("UPDATE prov_races SET date_iso=?, name=?, place=?, org=?, terrain=?, epreuve=?, site=COALESCE(?, site), "
                        "links=COALESCE(?, links) WHERE key=?", (*vals, key))
        else:
            con.execute("""INSERT INTO prov_races (key, date_iso, name, place, org, terrain, epreuve, site, links, cn, country,
                first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)""", (key, *vals, country, stamp, stamp))
            added += 1
    con.commit()
    return {"added": added}


SPEC_TERRAIN = {"VTT": "VTT", "Ski": "Ski"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def org_code(org: str | None) -> str | None:
    m = re.match(r"^\s*(\d{1,4})\s*-", org or "")
    return m.group(1) if m else None


def terrain_of(e: dict) -> str | None:
    if e.get("spec") in SPEC_TERRAIN:
        return SPEC_TERRAIN[e["spec"]]
    return EPREUVE_TERRAIN.get(e.get("epr") or "", "Forêt" if e.get("cn") else None)


# words every race shares: they never tell two races apart
GENERIC = {"de", "la", "le", "du", "des", "et", "en", "a", "au", "aux", "d", "l", "co", "club", "course", "courses", "orientation",
           "regionale", "regional", "departementale", "departemental", "dep", "nationale", "national", "championnat", "chpt", "champ",
           "cdl", "ligue", "sprint", "md", "ld", "moyenne", "longue", "distance", "nuit", "nocturne", "night", "challenge", "urbain",
           "sans", "qualif", "open", "trophee", "etape", "manche", "mass", "start", "vtt", "ski", "pied", "relais", "wre", "o",
           "sport", "sports", "association", "ass", "union", "sportive", "team", "amicale", "laique", "ville"}
# words of a place that do not tell it apart on their own (2026-10-17: « Seillon Nord » took Helga's « NORD#3 - Erpent »,
# a Belgian race of the same day, on « nord » alone): evidence only beside a real place or race word
QUALIFIERS = {"nord", "sud", "est", "ouest", "centre", "haut", "haute", "bas", "basse", "grand", "grande", "petit", "petite",
              "saint", "sainte", "st", "ste", "sur", "sous", "les", "mont", "val", "bois", "foret", "parc", "lac", "pont",
              "vieux", "vieille", "nouveau", "nouvelle", "plateau", "vallee", "col", "chateau", "port", "plage", "camp"}
# abbreviations in file names and titles: « CL_Sprint », « CDL MD », « CF LD »
ABBREV = {"cl": ("championnat", "ligue"), "cdl": ("championnat", "ligue"), "cf": ("championnat", "france"),
          "cdf": ("championnat", "france"), "chpt": ("championnat",), "champ": ("championnat",),
          "md": ("moyenne", "distance"), "ld": ("longue", "distance")}
TYPE_WORDS = {"Sprint": ("sprint",), "MD": ("md", "moyenne"), "LD": ("ld", "longue"), "Nuit": ("nuit", "nocturne", "night")}


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", plain(text).replace("'", " "))


def initials(org: str | None) -> str:
    """'1905 - BRIVE LIMOUSIN COURSE D'ORIENTATION' -> 'blco'; 'CLUB ORIENTATION BUHL ET FLORIVAL' -> 'cobf'."""
    name = re.sub(r"^\s*\d+\s*-\s*", "", org or "")
    return "".join(w[0] for w in _words(name.replace("-", " ")) if w not in ("de", "la", "le", "du", "des", "et", "d", "l") and not w.isdigit())


def match_score(race, name: str, organiser: str) -> float:
    """How surely a platform's competition (name, organiser, same day) is this race: 0 = not it; >= 1 = take it.
    Needs distinctive evidence — a word of the place or of the race's own name, the organiser's initials or club
    number; generic words ("championnat de ligue sprint") count for nothing, and a contradicting race type rules it out."""
    cw = set(_words(f"{name} {organiser}"))
    cw |= {w for a in cw & ABBREV.keys() for w in ABBREV[a]}
    if ("relais" in cw or "relay" in cw) and not is_relay(race["name"], race["epreuve"]):
        return 0.0                            # a relay is never the individual race of the same day
    t = race["epreuve"]
    if t in TYPE_WORDS:
        others = {w for k, ws in TYPE_WORDS.items() if k != t for w in ws}
        if cw & others and not cw & set(TYPE_WORDS[t]):
            return 0.0
    distinct = {w for w in _words(f"{race['name']} {race['place'] or ''}") if w not in GENERIC and not w.isdigit() and len(w) >= 3}
    qual = distinct & QUALIFIERS
    distinct -= QUALIFIERS
    weak = {w for w in _words(race["name"]) if re.fullmatch(r"[a-z]+\d+|\d+[a-z]+", w)}       # md1, e3, j2…
    org_words = {w for w in _words(re.sub(r"^\s*\d+\s*-\s*", "", race["org"] or "")) if w not in GENERIC and len(w) >= 4}
    s = min(2, len(distinct & cw)) * 1.0 + min(1, len(org_words & cw)) * 0.6 + 0.4 * len(weak & cw) + 0.4 * min(2, len(qual & cw))
    # generic words in common only break ties between two races of one organiser that day ("Championnat…" vs
    # "Challenge…"): too weak to make a match alone
    s += 0.15 * len((set(_words(race["name"])) & GENERIC - {"de", "la", "le", "du", "des", "et", "d", "l", "o"}) & cw)
    # the organiser field written as the club's initials (« BLCO »): evidence, not proof (other countries' clubs
    # have initials too), so it needs a race type or a place to agree
    ini = initials(race["org"])
    abbrevs = {re.sub(r"[^a-z0-9]", "", plain(x)) for x in re.split(r"[()\-,/]", organiser or "") if x.strip()}
    if len(ini) >= 3 and any(a and (a == ini or (len(a) >= 3 and (ini.startswith(a) or a.startswith(ini)))) for a in abbrevs):
        s += 0.8
    if race["org_code"] and len(race["org_code"]) == 4 and race["org_code"] in f"{name} {organiser}":
        s += 1.0
    if t in TYPE_WORDS and cw & set(TYPE_WORDS[t]):
        s += 0.3
    # a VTT race and a foot race of the same place and day (Luxeuil, 19/08): the competition's name says which —
    # « MD - Luxeuil-les-Bains » is the foot race's, « MD VTT … » the VTT one's
    bike = bool(cw & {"vtt", "mtbo", "bike"})
    if bike and race["terrain"] != "VTT":
        return 0.0
    if race["terrain"] == "VTT":
        # (below a foot race of that day, but never losing a match a VTT race alone would have)
        s = s + 0.5 if bike else (max(1.0, s - 0.3) if s >= 1.0 else s - 0.3)
    return s


SMALL = {"de", "la", "le", "du", "des", "et", "en", "a", "au", "aux", "d", "l", "o"}
# words of a secondary race beside the day's main one (not formats: a « nocturne » is a race of its own)
MARKERS = {"open", "ko", "challenge", "finale", "qualif", "decouverte", "loisir"}
# words of the day's main race: a WRE race is always a major one, most often a Championnat de France
MAIN = {"wre", "cdf"}


def owners(group, text: str, plain_default: bool = True) -> set:
    """Which of an organiser's races of one day (« Sprint Rouen Centre », « KO Sprint Rouen Centre ») a document is
    about: each race is told apart by the words of its name the others lack (« ko »; « challenge »; « championnat
    ligue », written « CL » too), looked for as words and, for the longer ones, inside run-together file names
    (« RsultatsSprintRouen »). The races naming the most of their own words; if it names none, the plain ones (those
    with the fewest own words: the « Sprint » rather than the « KO Sprint »), or all of them (plain_default False: not
    decided yet). Returns their keys."""
    text = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", text)      # « KOSprintResultat » -> « KO Sprint Resultat »
    toks = set(_words(text))
    toks |= {w for a in toks & ABBREV.keys() for w in ABBREV[a]}
    squash = re.sub(r"[^a-z0-9]", "", plain(text))
    # a document naming a format is about the races of that format (2026-11-15: « MD 1 Morbihan O'Tour - Quiberon » went
    # to « Quiberon 1 », the sprint, by its « 1 », where the format check refused it, and « Quiberon 2 », the MD, lost it):
    # the foot races of another known format are left out, those of an unknown one kept; as run.not_this_race, a VTT or
    # ski race's format is not judged, and a document saying VTT or ski is about such a race only
    named = {k for k, ws in TYPE_WORDS.items() if toks & set(ws)}
    bike, ski = bool(toks & {"vtt", "mtbo"}), "ski" in toks

    def fits(r):
        if bike and r["terrain"] != "VTT" or ski and r["terrain"] != "Ski":
            return False
        return r["terrain"] in ("VTT", "Ski") or not named or r["epreuve"] not in TYPE_WORDS or r["epreuve"] in named
    fit = [r for r in group if fits(r)]
    if fit:
        group = fit
    # (the names with their abbreviations spelled out too: « D88 CF LD Open » and « Championnat de France Longue
    # Distance (WRE) » differ by « open » and « wre », not by « cf », « ld »). A year never tells two races of one day
    # apart (2026-11-23: « Sprint 1 O' Picardie 2026 » and « Sprint 2 O' Picardie », the year in one name only, so the
    # file « …-2026-sprint-compiegne-2 » of « SPRINT 4 » tied « 2026 » against « 2 » and went to both races)
    def spelled(name):
        ws = {w for w in _words(name) if not re.fullmatch(r"(19|20)\d\d", w)}
        ws |= {w for a in ws & ABBREV.keys() for w in ABBREV[a]}
        return (ws | {a for a, full in ABBREV.items() if set(full) <= ws}) - SMALL
    names = {r["key"]: spelled(r["name"]) for r in group}
    own = {k: {w for w in ws if not any(w in names[o] for o in names if o != k)} for k, ws in names.items()}
    hits = {k: sum(1 for w in ws if w in toks or (len(w) >= 4 and w in squash)) for k, ws in own.items()}
    best = max(hits.values(), default=0)
    if best:
        return {k for k, h in hits.items() if h == best}
    if not plain_default:
        return set(names)
    # the main race: no « open », « ko », « challenge »… of its own, a WRE or Championnat de France first, then the
    # fewest words of its own
    rank = lambda ws: (len(ws & MARKERS), -len(ws & MAIN), len(ws))
    plainest = min((rank(ws) for ws in own.values()), default=(0, 0, 0))
    return {k for k, ws in own.items() if rank(ws) == plainest}


def assign(races_list, items, min_score: float = 1.0, accept=None) -> dict:
    """One-to-one: each platform competition goes to the watched race of its day it matches best (and each race gets
    at most one), so two races of a weekend never share a competition. items: [(id, name, organiser, date)].
    accept(race, id): a last check of a pair that matched (asked only then: it may cost a request)."""
    pairs = []
    for r in races_list:
        for iid, name, org, d in items:
            if d == r["date_iso"]:
                s = match_score(r, name, org)
                if s >= min_score and (accept is None or accept(r, iid)):
                    pairs.append((s, r["key"], iid))
    taken_r, taken_i, out = set(), set(), {}
    for s, rk, iid in sorted(pairs, key=lambda p: -p[0]):
        if rk in taken_r or iid in taken_i:
            continue
        taken_r.add(rk); taken_i.add(iid)
        out[rk] = iid
    return out


def backfill(con, events: list[dict], lo: str, hi: str) -> int:
    """The agenda's races of [lo, hi] from FFCO's CSV export (events as agenda._csv_event): the races already past
    when the pilot started, which the agenda had dropped. The export has no course id: such a race's key is 'x' + a
    hash of its date, name and organiser. A race already known (FFCO's, the agenda's) is paired with the export's
    closest race of its organiser and day — one each, so « Sprint » and « KO Sprint » stay two — and only gains
    the website it lacked. Returns the number of races added."""
    stamp = now_iso()
    rows = [e for e in events if e.get("date") and lo <= e["date"] <= hi and not e.get("cancelled")
            and not is_relay(e.get("name"), e.get("epr"))]
    for e in rows:                                    # the clubs' websites too (never overwriting a known one)
        code = org_code(e.get("org"))
        if code and e.get("site"):
            con.execute("INSERT OR IGNORE INTO prov_clubs (code, name, site, read_at) VALUES (?,?,?,?)",
                        (code.zfill(4) if len(code) > 2 else code, e["org"], e["site"], stamp))
    added = 0
    for (day, code), group in _groups(rows):
        known = con.execute("SELECT key, name, site FROM prov_races WHERE date_iso = ? AND org_code IS ? AND key NOT LIKE 'olr%'", (day, code)).fetchall()
        both = lambda a, b: len(set(_words(a)) & set(_words(b))) / max(1, len(set(_words(a))), len(set(_words(b))))
        pairs = sorted(((both(k["name"], e["name"]), i, j) for i, k in enumerate(known) for j, e in enumerate(group)
                        if similarity(k["name"], e["name"]) >= 0.5), reverse=True)
        used_k, used_e = set(), set()
        for _, i, j in pairs:
            if i in used_k or j in used_e:
                continue
            used_k.add(i); used_e.add(j)
            if group[j].get("site") and not known[i]["site"]:
                con.execute("UPDATE prov_races SET site = ? WHERE key = ?", (group[j]["site"], known[i]["key"]))
        for j, e in enumerate(group):
            if j in used_e:
                continue
            key = "x" + hashlib.sha1(f"{e['date']}|{e['name']}|{e.get('org')}".encode()).hexdigest()[:10]
            place = re.sub(r"\s*\([^)]*\)\s*$", "", e.get("place") or "")
            con.execute("""INSERT OR IGNORE INTO prov_races (key, date_iso, name, place, org, org_code, terrain, epreuve, cn, site,
                agenda_id, first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)""",
                        (key, e["date"], e["name"], place or None, e.get("org"), code, terrain_of(e), e.get("epr"),
                         int(bool(e.get("cn"))), e.get("site") or club_site(con, code), stamp, stamp))
            added += 1
    con.commit()
    return added


def drop_deleted(con, lo: str) -> int:
    """A race FFCO deleted (« WEOCH 2026 (MD) » published twice, 4935 then deleted): its documents go to its twin of the
    same day, organiser and name, and it goes; without a twin it stays, no longer linked to FFCO."""
    gone = 0
    for r in con.execute("""SELECT * FROM prov_races WHERE ffco_id IS NOT NULL AND date_iso >= ?
                            AND ffco_id NOT IN (SELECT course_id FROM competitions)""", (lo,)).fetchall():
        twins = con.execute("SELECT * FROM prov_races WHERE date_iso = ? AND org_code IS ? AND key != ?",
                            (r["date_iso"], r["org_code"], r["key"])).fetchall()
        twin = next((x for x in twins if similarity(x["name"], r["name"]) >= 0.8), None)
        if twin is None:
            con.execute("UPDATE prov_races SET ffco_id = NULL WHERE key = ?", (r["key"],))
            continue
        con.execute("UPDATE OR IGNORE prov_docs SET race_key = ? WHERE race_key = ?", (twin["key"], r["key"]))
        con.execute("DELETE FROM prov_docs WHERE race_key = ?", (r["key"],))
        con.execute("DELETE FROM prov_races WHERE key = ?", (r["key"],))
        con.execute("UPDATE prov_races SET done = 0, next_check = NULL WHERE key = ?", (twin["key"],))
        gone += 1
    return gone


def merge_duplicates(con) -> int:
    """A race FFCO published after the agenda export added it (« REGIONALE 1 » twice): FFCO's copy goes into the other
    one — its course id, its documents — one each, by name, for an organiser and day. Returns the races merged."""
    merged = 0
    for f in con.execute("SELECT * FROM prov_races WHERE key LIKE 'f%'").fetchall():
        others = con.execute("""SELECT * FROM prov_races WHERE date_iso = ? AND org_code IS ? AND key != ? AND key NOT LIKE 'f%'
                                AND (ffco_id IS NULL OR ffco_id = ?) AND country IS NULL AND key NOT LIKE 'olr%'""", (f["date_iso"], f["org_code"], f["key"], f["ffco_id"])).fetchall()
        # the same name, both ways: a « Sprint » and a « KO Sprint » of the same day are two races
        same = lambda r: len(set(_words(r["name"])) & set(_words(f["name"]))) / max(1, len(set(_words(r["name"]))), len(set(_words(f["name"]))))
        best = max(others, key=same, default=None)
        if not best or same(best) < 0.8:
            continue
        con.execute("UPDATE prov_races SET ffco_id = ?, cn = MAX(cn, ?), place = COALESCE(place, ?), site = COALESCE(site, ?), "
                    "done = 0, next_check = NULL WHERE key = ?", (f["ffco_id"], f["cn"], f["place"], f["site"], best["key"]))
        con.execute("UPDATE OR IGNORE prov_docs SET race_key = ? WHERE race_key = ?", (best["key"], f["key"]))
        con.execute("DELETE FROM prov_docs WHERE race_key = ?", (f["key"],))
        con.execute("DELETE FROM prov_races WHERE key = ?", (f["key"],))
        merged += 1
    return merged


def _groups(rows):
    out: dict = {}
    for e in rows:
        out.setdefault((e["date"], org_code(e.get("org"))), []).append(e)
    return out.items()


def similarity(a: str, b: str) -> float:
    """Share of the shorter name's words found in the other (accents, case and punctuation ignored)."""
    wa = set(re.findall(r"[a-z0-9]+", plain(a))) - {"de", "la", "le", "du", "des", "et", "co", "course"}
    wb = set(re.findall(r"[a-z0-9]+", plain(b))) - {"de", "la", "le", "du", "des", "et", "co", "course"}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / min(len(wa), len(wb))


# ---- the organisers' websites -----------------------------------------------------------------------------------
DIR = "https://api.ffcorientation.fr/iframe"


def read_directory(con, f, per_run: int = 40, every_days: int = 30) -> int:
    """FFCO's club directory: the club's own website, by club number. Its map lists the clubs (clubs.geojson, once a
    month) and a popup per club gives its number, website and contacts (« Bureau », phone, e-mail: clubdir.contact, shown
    to FFCO's licensees only) — read a few per run, the oldest first (a popup whose contacts were never kept first). Its
    robots.txt forbids robots: read anyway (the owner's decision, 2026-10-09), on the admin's list of sites."""
    from . import clubdir
    clubdir.connect(con)
    stamp = now_iso()
    last = con.execute("SELECT v FROM prov_meta WHERE k = 'club_dir_list'").fetchone()
    if not last or last["v"] < (datetime.now(timezone.utc) - timedelta(days=every_days)).isoformat():
        a = f.get(f"{DIR}/clubs.geojson", conditional=False)
        if a.status != 200:
            return 0
        try:
            ids = [int(x["id"]) for x in json.loads(a.content.decode("utf-8"))["features"]]
        except (ValueError, KeyError, TypeError):
            return 0
        for i in ids:
            con.execute("INSERT OR IGNORE INTO prov_club_dir (id, read_at) VALUES (?, '')", (i,))
        con.execute("INSERT OR REPLACE INTO prov_meta (k, v) VALUES ('club_dir_list', ?)", (stamp,))
    old = (datetime.now(timezone.utc) - timedelta(days=every_days)).isoformat()
    n = 0
    for row in con.execute("SELECT id FROM prov_club_dir WHERE read_at < ? OR contact IS NULL "
                           "ORDER BY contact IS NOT NULL, read_at LIMIT ?", (old, per_run)).fetchall():
        if f.out_of_time():
            break
        a = f.get(f"{DIR}/clubs/popup/", conditional=False, params={"id": row["id"]})
        if a.status != 200:
            continue
        text = a.content.decode("utf-8", "replace")
        code = re.search(r"Num[ée]ro FFCO(?:&nbsp;|\s)*:\s*(\d{2,4})", text)
        site = re.search(r"Site web(?:&nbsp;|\s)*:\s*<a href=\"([^\"]+)\"", text)
        con.execute("UPDATE prov_club_dir SET code = ?, site = ?, contact = ?, read_at = ? WHERE id = ?",
                    (code.group(1).zfill(4) if code else None, site.group(1).strip() if site else None,
                     json.dumps(clubdir.contact(text), ensure_ascii=False), stamp, row["id"]))
        n += 1
    con.commit()
    return n


def refresh_clubs(con, agenda_path: Path) -> int:
    """Club number -> a website, from the agenda (each event names a site: often the event's own, so FFCO's club
    directory comes first when it has one — read_directory, club_site)."""
    if not agenda_path.exists():
        return 0
    n = 0
    for e in json.loads(agenda_path.read_text(encoding="utf-8")).get("events", []):
        code = org_code(e.get("org"))
        if code and e.get("site"):
            con.execute("INSERT OR REPLACE INTO prov_clubs (code, name, site, read_at) VALUES (?,?,?,?)",
                        (code.zfill(4) if len(code) > 2 else code, e["org"], e["site"], now_iso()))
            n += 1
    con.commit()
    return n


def club_site(con, code: str | None) -> str | None:
    """The club's website: FFCO's directory's, else the one the agenda gave for one of its events."""
    if not code:
        return None
    code = code.zfill(4) if len(code) > 2 else code
    row = con.execute("SELECT site FROM prov_club_dir WHERE code = ? AND site LIKE 'http%'", (code,)).fetchone() or \
        con.execute("SELECT site FROM prov_clubs WHERE code = ?", (code,)).fetchone()
    return row["site"] if row else None


# ---- the races ---------------------------------------------------------------------------------------------
def is_relay(name: str | None, epreuve: str | None = None) -> bool:
    """Relays are out of the pilot's scope (team races: neither individual results nor a CN)."""
    return epreuve == "Relais" or "relais" in plain(name) or "relay" in plain(name)


CAT_AGES = (10, 12, 14, 16, 18, 20, 21, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95)


def expand_categories(text: str) -> set[str]:
    """The categories a registration list gives a circuit: « D20/35, H40/45, Open violet » -> D20 D21 D35 H40 H45;
    « H60 et + » -> H60 … H95; « HD14/18 », « H/D 16 » both sexes; anything else (« Open violet ») nothing."""
    out = set()
    for part in re.split(r"[,;]| et (?![+])", text or ""):
        m = re.match(r"^\s*(H\s*/\s*D|D\s*/\s*H|HD|DH|H|D)\s*(\d{2})[A-Z]?(?:\s*[/-]\s*(\d{2}))?\s*(et\s*\+|\+|et plus)?\s*$",
                     part.strip(), re.I)
        if not m:
            continue
        sexes = "HD" if len(re.sub(r"[^HD]", "", m.group(1).upper())) == 2 else m.group(1).upper()
        lo = int(m.group(2))
        hi = 95 if m.group(4) else int(m.group(3)) if m.group(3) else lo
        for s in sexes:
            out |= {f"{s}{a}" for a in CAT_AGES if lo <= a <= hi}
    return out


def save_circuits_doc(con, key: str, url: str, kind: str, title: str, note: str, circuits: list, stamp: str,
                      source: str = "ffco") -> None:
    """A document giving each circuit's categories (FFCO's registration list, an announcement): [[circuit, categories
    text, count or None]]."""
    parsed = json.dumps({"kind": kind, "by": "circuit", "title": title, "date": None, "classes": [], "circuits": circuits},
                        ensure_ascii=False)
    cur = con.execute("SELECT parsed FROM prov_docs WHERE race_key = ? AND url = ?", (key, url)).fetchone()
    if cur and cur["parsed"] == parsed:
        return
    if cur:
        con.execute("UPDATE prov_docs SET parsed = ?, changed_at = ? WHERE race_key = ? AND url = ?", (parsed, stamp, key, url))
    else:
        con.execute("""INSERT INTO prov_docs (race_key, url, source, kind, title, sha, parsed, found_at, changed_at, note)
                       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)""", (key, url, source, kind, title, parsed, stamp, stamp, note))


def save_registration(con, key: str, reg: dict, stamp: str) -> None:
    """FFCO's registration list of a race, kept as a document: each circuit's categories (« Circuit B : D20/35, H40/45 »)
    — how a list by category is regrouped into circuits for its scores, before FFCO publishes the race."""
    circuits = [[c[0], c[2], c[1]] for c in reg.get("circuits") or [] if len(c) > 2 and c[2]]
    if circuits:
        save_circuits_doc(con, key, reg["url"], "registration", "Inscriptions FFCO : circuits et catégories",
                          "les catégories de chaque circuit (liste publique des inscrits)", circuits, stamp)


def sync(con, agenda_path: Path, today: date, back_days: int) -> dict:
    """Add the races of the last `back_days` days (agenda + FFCO) to prov_races and link them to FFCO."""
    lo = (today - timedelta(days=back_days)).isoformat()
    hi = today.isoformat()
    added = linked = 0
    stamp = now_iso()
    # the agenda: competitions (kind 'c') of the period, with their organiser's website
    if agenda_path.exists():
        a = json.loads(agenda_path.read_text(encoding="utf-8"))
        for e in a.get("events", []):
            # upcoming races too: the agenda drops a race a few days after it, and its website and place go with it
            if e.get("kind") != "c" or not e.get("id") or e.get("date", "") < lo or e.get("cancelled") or is_relay(e.get("name"), e.get("epr")):
                continue
            key = f"a{e['id']}"
            code = org_code(e.get("org"))
            site = e.get("site") or club_site(con, code)
            cur = con.execute("SELECT key FROM prov_races WHERE key = ?", (key,)).fetchone()
            if cur:                                   # what the organiser changed since overwrites what was kept
                con.execute("UPDATE prov_races SET date_iso=?, name=?, place=?, org=?, org_code=?, terrain=?, epreuve=?, cn=?, site=COALESCE(?, site) WHERE key=?",
                            (e["date"], e["name"], e.get("place"), e.get("org"), code, terrain_of(e), e.get("epr"), int(bool(e.get("cn"))), site, key))
            else:
                con.execute("""INSERT INTO prov_races (key, date_iso, name, place, org, org_code, terrain, epreuve, cn, site, agenda_id,
                    first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (key, e["date"], e["name"], e.get("place"), e.get("org"), code, terrain_of(e), e.get("epr"),
                             int(bool(e.get("cn"))), site, e["id"], stamp, stamp))
                added += 1
            if (e.get("reg") or {}).get("circuits"):
                save_registration(con, key, e["reg"], stamp)
            if e.get("annCircuits") and e.get("annSrc"):
                save_circuits_doc(con, key, e["annSrc"], "announcement", "Annonce de course : circuits et catégories",
                                  "les catégories de chaque circuit (annonce de course)", e["annCircuits"], stamp)
        # the last days' races, gone from the events: the list's own fields, changed on the race's day after the
        # morning's run (2026-10-22: a race no longer counting for the CN kept « CN » for good)
        for e in a.get("recent", []):
            if e.get("id") and e.get("date") and e.get("name"):
                con.execute("UPDATE prov_races SET date_iso=?, name=?, place=COALESCE(?, place), terrain=COALESCE(?, terrain), "
                            "epreuve=?, cn=? WHERE key=?", (e["date"], e["name"], e.get("place") or None, terrain_of(e),
                                                            e.get("epr") or None, int(bool(e.get("cn"))), f"a{e['id']}"))
    # the agenda export's races (x…) and the uploads' (u…) are linked to FFCO's results like the agenda's own: agenda_id 0
    con.execute("UPDATE prov_races SET agenda_id = 0 WHERE (key LIKE 'x%' OR key LIKE 'u%') AND agenda_id IS NULL")
    # FFCO's competitions of the period: link the agenda's races, add the others (the past month's pilot)
    for c in con.execute("SELECT course_id, date_iso, title, organizer, terrain, epreuve, location FROM competitions WHERE date_iso BETWEEN ? AND ?",
                         (lo, hi)).fetchall():
        if is_relay(c["title"], c["epreuve"]):
            continue
        code = org_code(c["organizer"])
        same = con.execute("SELECT key, name, ffco_id FROM prov_races WHERE date_iso = ? AND org_code IS ? AND agenda_id IS NOT NULL",
                           (c["date_iso"], code)).fetchall()
        best = max(same, key=lambda r: similarity(r["name"], c["title"] or ""), default=None)
        if best and (best["ffco_id"] in (None, c["course_id"])) and similarity(best["name"], c["title"] or "") >= 0.5:
            if best["ffco_id"] is None:
                con.execute("UPDATE prov_races SET ffco_id = ? WHERE key = ?", (c["course_id"], best["key"]))
                linked += 1
            continue
        key = f"f{c['course_id']}"
        if con.execute("SELECT 1 FROM prov_races WHERE key = ? OR ffco_id = ?", (key, c["course_id"])).fetchone():
            # a race only FFCO knows: its place (FFCO's location) and website, once known, help find its results;
            # its name as FFCO writes it now
            con.execute("UPDATE prov_races SET name = ?, place = COALESCE(place, ?), site = COALESCE(site, ?) WHERE key = ?",
                        (c["title"], c["location"], club_site(con, code), key))
            continue
        con.execute("""INSERT INTO prov_races (key, date_iso, name, place, org, org_code, terrain, epreuve, cn, site, ffco_id,
            first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?)""",
                    (key, c["date_iso"], c["title"], c["location"], c["organizer"], code, c["terrain"], c["epreuve"],
                     club_site(con, code), c["course_id"], stamp, stamp))
        added += 1
    drop_deleted(con, lo)
    merge_duplicates(con)
    # relays taken in before they were left out, and relay files found next to an individual race — O'Live's relays apart
    # (« olr<id> », run.relays: their split times, for « Analyse de course » alone)
    con.execute("DELETE FROM prov_docs WHERE race_key NOT LIKE 'olr%' AND (lower(url) LIKE '%relais%' OR lower(url) LIKE '%relay%' "
                "OR lower(COALESCE(title, '')) LIKE '%relais%')")
    # Cloudinary files saved under the address of one page load (« /v1791801252/ », « ?_a=… »): found again under
    # their stable one (clubsite._links)
    con.execute("DELETE FROM prov_docs WHERE url LIKE 'https://res.cloudinary.com/%' AND (url LIKE '%?_a=%' OR url GLOB '*/v[0-9]*/*')")
    # Livelox links noted before it was left out (only the runners who sent their GPS track, and closed to robots)
    con.execute("DELETE FROM prov_docs WHERE source = 'livelox'")
    con.execute("DELETE FROM prov_blocked WHERE host LIKE '%livelox.com'")
    for (key,) in con.execute("SELECT key FROM prov_races WHERE key NOT LIKE 'olr%'").fetchall():
        r = con.execute("SELECT name, epreuve FROM prov_races WHERE key = ?", (key,)).fetchone()
        if is_relay(r["name"], r["epreuve"]):
            con.execute("DELETE FROM prov_docs WHERE race_key = ?", (key,))
            con.execute("DELETE FROM prov_races WHERE key = ?", (key,))
    con.commit()
    return {"added": added, "linked": linked}


def due(con, today: date, now: str) -> list:
    """Races to look at in this run: raced already, not done, and their next check has come — the longest waiting
    first (never looked at, then the earliest due), so a short budget never leaves the same races out run after run."""
    return con.execute("""SELECT * FROM prov_races WHERE done = 0 AND date_iso <= ? AND (next_check IS NULL OR next_check <= ?)
                          ORDER BY next_check IS NOT NULL, next_check, date_iso DESC""", (today.isoformat(), now)).fetchall()


def schedule(con, race, today: date) -> None:
    """After a look: when to look again, or stop."""
    age = (today - date.fromisoformat(race["date_iso"])).days
    now = datetime.now(timezone.utc)
    if age > WATCH_DAYS:                      # FFCO publishing a race does not stop it: FFCO never has the splits
        con.execute("UPDATE prov_races SET last_check = ?, done = 1 WHERE key = ?", (now.isoformat(timespec="seconds"), race["key"]))
        return
    step = timedelta(minutes=50) if age < HOURLY_DAYS else timedelta(hours=23)
    con.execute("UPDATE prov_races SET last_check = ?, next_check = ? WHERE key = ?",
                (now.isoformat(timespec="seconds"), (now + step).isoformat(timespec="seconds"), race["key"]))
