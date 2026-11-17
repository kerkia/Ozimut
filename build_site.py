"""Export the CN database into the static JSON the website reads.

    python build_site.py                      # full archive
    python build_site.py --min-season 2024    # public build: open seasons only
    python build_site.py --since 2026-07-01   # after an update: redo only what
                                              # can have changed from that date

Files are only rewritten when their content changes, so an incremental build
touches few files (and uploads few, once hosted).

The site is static (no server): everything it needs is precomputed here and
laid out so each page loads only what it shows.

    site/data/meta.json            methods, params & the monthly recalage
                                   schedules, reference names, months, stats
    site/data/runners.json         identity & attributes, one row per runner
    site/data/competitions.json    competition metadata
    site/data/snap/attr_{Y}.json   runner category & club as of each year
    site/data/snap/{m}_{t}_{Y}.json  CN at each month-end of year Y
    site/data/r/{bucket}.json      race-by-race detail, 10 runners per file
    site/data/c/g{id // 5}.json    full results of the competitions, five to a file by id
    site/data/club/{code}.json     monthly club aggregates (via site_extras.py)

Month-end CNs for the computed methods are *recomputed* here from the stored
score history with the same functions the engine uses, not read from the
event log: between two races a CN still moves as old races leave the 365-day
window, and a ranking "as of" a date must reflect that.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import unicodedata
import json
import re
import shutil
import sqlite3
import statistics
import time
from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import httpx
from lxml import html as lhtml

from ffco_scraper.cn import TITLE_WEIGHTS, CnParams, Decimal_round, fade_factors, ffco_cn, is_junior, is_nc, top_n_weighted
from ffco_scraper.cn_engine import build_methods, daily_knots, factor_on
from ffco_scraper import ffco_scale
import privacy
import site_extras
from site_io import COURSE_GROUP, WRITES, club_pack, course_file, dump, prune, runner_bucket

ROOT = Path(__file__).parent
import paths  # noqa: E402
DB = paths.DB
CLUB_PACKS = 67                  # a prime: club codes share their endings, 64 left files empty (54 of 64 used)
OUT = ROOT / "site" / "data" / "fr"           # a country's folder (--out): France's by default
NAMES_CACHE = paths.CACHE / "reference_names.json"
TERRAINS = {"Forêt": "For", "Sprint": "Spr", "VTT": "VTT", "Ski": "Ski"}
TERRAIN_CODES = list(TERRAINS.values())
TERRAIN_NAMES = {v: k for k, v in TERRAINS.items()}
SPLIT_YEAR = 2026
FOOT = ("For", "Spr")            # one pooled official ranking ("Ped") before SPLIT_YEAR


def official_terrain(t: str, year: int) -> str:
    """Where the official CN of a terrain is filed: forest and sprint shared FFCO's
    pedestrian ranking until SPLIT_YEAR; VTT and ski always had their own."""
    return "Ped" if t in FOOT and year < SPLIT_YEAR else t


def paris_today() -> date:
    """Today in Paris (the site's day): the CI runs in UTC; without the time-zone database (Windows without tzdata),
    the machine's own date - the PC is in Paris."""
    try:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Paris")).date()
    except Exception:
        return date.today()


def month_ends(first: date, last: date) -> list[date]:
    out = []
    y, m = first.year, first.month
    while (y, m) <= (last.year, last.month):
        out.append(date(y, m, calendar.monthrange(y, m)[1]))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


# ---------------------------------------------------------------------------
# reference names (clubs, leagues, departments)
# ---------------------------------------------------------------------------
def _recent_unnamed_clubs(conn: sqlite3.Connection, names: dict, days: int = 100) -> set[str]:
    """Club numbers seen in recent results that have no name yet — a new club."""
    since = (date.today() - timedelta(days=days)).isoformat()
    codes = set()
    for (club,) in conn.execute(
            """SELECT DISTINCT r.club FROM results r JOIN circuits c USING (circuit_id)
               JOIN competitions k ON k.course_id = c.course_id WHERE k.date_iso >= ?""", (since,)):
        code = club_parts(club)[0]
        if code and code not in names["clubs"]:
            codes.add(code)
    return codes


def reference_names(conn: sqlite3.Connection) -> dict:
    """Club/league/department names from the ranking page's filter lists,
    completed from competition organisers for clubs that no longer exist.

    The lists are cached; they are fetched again when a club number seen in
    recent results has no name (a new club), at most once a day."""
    names = None
    if NAMES_CACHE.exists():
        names = json.loads(NAMES_CACHE.read_text(encoding="utf-8"))
        stale = time.time() - NAMES_CACHE.stat().st_mtime > 86400
        if stale and _recent_unnamed_clubs(conn, names):
            names = None
    if names is None:
        r = httpx.get("https://cn.ffcorientation.fr/classement/?specialite=For", timeout=30)
        r.raise_for_status()
        doc = lhtml.fromstring(r.text)
        names = {"clubs": {}, "ligues": {}, "depts": {}}
        for sel in doc.xpath("//select"):
            opts = [o.text_content().strip() for o in sel.xpath(".//option")]
            for o in opts:
                m = re.match(r"^(\d{4}) - (.+)$", o)
                if m:
                    names["clubs"][m.group(1)] = m.group(2).strip()
                    continue
                m = re.match(r"^([A-Z]{2}) - (.+)$", o)
                if m:
                    names["ligues"][m.group(1)] = m.group(2).strip()
                    continue
                m = re.match(r"^(\d{2}) - (.+)$", o)
                if m:
                    names["depts"][m.group(1)] = m.group(2).strip()
        NAMES_CACHE.write_text(json.dumps(names, ensure_ascii=False), encoding="utf-8")

    for (org,) in conn.execute("SELECT DISTINCT organizer FROM competitions"):
        m = re.match(r"^(\d{4}) - (.+)$", org or "")
        if m and m.group(1) not in names["clubs"]:
            names["clubs"][m.group(1)] = m.group(2).strip()
    return names


def name_key(name: str | None) -> str:
    """Normalised login name — the same rule as functions/_middleware.js and
    assets/js/auth.js: accents, case, punctuation and word order don't matter."""
    s = unicodedata.normalize("NFKD", name or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return " ".join(sorted(re.sub(r"[^a-z0-9]+", " ", s).split()))


AUTH = ROOT / "site" / "auth"      # the login index: never under site/data (France's files are in site/data/fr since 2026-10-22)


def write_auth_index(runners: list, real: list | None = None) -> None:
    """Credentials index for the server-side login (never served publicly):
    auth/{licence // 100}.json -> {licence: [sha256(name key), name]}. An anonymised runner is in it under their real
    licence and name (`real`: [(licence, name)]), never under their pseudonym: they can still sign up."""
    buckets = defaultdict(dict)
    for lic, nom, *_ in [*(r for r in runners if not privacy.is_pseudo(r[0])), *(real or [])]:
        lic = str(lic)
        if not nom:
            continue
        b = int(lic) // 100 if lic.isdigit() else 999999
        buckets[b][lic] = [hashlib.sha256(name_key(nom).encode()).hexdigest(), nom]
    folder = AUTH
    for b, content in buckets.items():
        dump(folder / f"{b}.json", content)
    prune(folder, {f"{b}.json" for b in buckets})


def club_parts(club: str | None) -> tuple[str | None, str | None, str | None]:
    """'7707IF' -> ('7707', '77', 'IF')."""
    if not club:
        return None, None, None
    m = re.match(r"^(\d{4})([A-Z]*)$", club.strip())
    if not m:
        return None, None, None
    code = m.group(1)
    return code, code[:2], (m.group(2) or None)


# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> None:
    global OUT, DB, AUTH
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-season", type=int, default=None,
                    help="Only export seasons >= this (e.g. 2024 for the open seasons).")
    ap.add_argument("--clean", action="store_true",
                    help="wipe the output folder first (by default files are updated in place and "
                         "obsolete ones pruned, which suits a synced folder far better)")
    ap.add_argument("--since", default=None,
                    help="Incremental: data before this date (YYYY-MM-DD) is unchanged, so "
                         "earlier seasons' snapshots are kept as they are.")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default site/data)")
    ap.add_argument("--db", type=Path, default=None)
    ap.add_argument("--auth", type=Path, default=None, help="the login index's folder (default site/auth)")
    ap.add_argument("--country", default="FR", help="the country built (countries/<cc>): its names, its rules")
    ap.add_argument("--anon", type=Path, default=None,
                    help="the anonymised runners' list (default: privacy.FILE, copied from R2 by the workflow)")
    args = ap.parse_args(argv)
    if args.out:
        OUT = args.out
    if args.db:
        DB = args.db
    if args.auth:
        AUTH = args.auth
    for k in WRITES:
        WRITES[k] = 0

    t0 = time.monotonic()
    conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    min_season = args.min_season or 0
    since = date.fromisoformat(args.since) if args.since else None
    old_meta = None
    if since:
        if not (OUT / "meta.json").exists():
            raise SystemExit("--since needs an existing build in the output folder")
        old_meta = json.loads((OUT / "meta.json").read_text(encoding="utf-8"))

    if OUT.exists() and args.clean and not since:
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)

    import countries
    methods = countries.get(args.country).methods()   # France's parameters, or the country's own (Country.method_params)
    COMPUTED = list(methods)                       # fair, top6w
    PARAMS: dict[str, CnParams] = {n: methods[n].params for n in COMPUTED}
    BASE = {n: methods[n].derived_from or n for n in COMPUTED}   # whose scores and recalage a method uses
    BASES = [n for n in COMPUTED if BASE[n] == n]
    pf: CnParams = PARAMS["fair"]
    norm_cfg = methods["fair"].normalisation       # every Top shares its Fair's scores and recalage

    # the anonymised runners (privacy.py): every licence read below goes through anon.lic, so that their pseudonym,
    # never their licence, is in the files; their names are replaced in runners.json, the only file that has names
    # France's list (the admin page's « Anonymisés »); another country's runners have their own numbers: none listed yet
    fr = args.country.upper() == "FR"
    anon = privacy.load(args.anon) if fr else privacy.Anon([])
    # the files' packing (Pages takes 20 000 files a deployment): France's runners ten to a file of r/ and net/, one file
    # a club; another country's sequential numbers a hundred to a file, its clubs in CLUB_PACKS files
    RB, PACKS = (10, 0) if fr else (100, CLUB_PACKS)
    if anon:
        print(f"anonymised runners: {len(anon.by_lic)}")
    if fr:
        names = reference_names(conn)
    else:                                      # the country's own: its clubs' numbers and regions (countries/<cc>/clubs.py)
        import importlib
        names = importlib.import_module(f"countries.{args.country.lower()}.clubs").names(conn)
    print(f"names: {len(names['clubs'])} clubs, {len(names['ligues'])} ligues, "
          f"{len(names['depts'])} depts")

    # -- competitions & circuits -------------------------------------------
    comps = {}
    for r in conn.execute(
        """SELECT course_id, date_iso, season, title, location, organizer, groupe,
                  epreuve, terrain FROM competitions
           WHERE specialite IN ('Pédestre', 'VTT', 'Ski') AND date_iso IS NOT NULL AND season >= ?""",
        (min_season,),
    ):
        comps[r["course_id"]] = [r["date_iso"], r["title"], r["location"], r["organizer"],
                                 r["groupe"], r["epreuve"], TERRAINS.get(r["terrain"], "For"),
                                 r["season"]]
    circuits = {}
    for r in conn.execute("SELECT circuit_id, course_id, name, distance_km FROM circuits"):
        if r["course_id"] in comps:
            circuits[r["circuit_id"]] = [r["course_id"], r["name"], r["distance_km"]]
    cvals = defaultdict(dict)
    for r in conn.execute("SELECT method, circuit_id, valeur FROM circuit_values"):
        if r["circuit_id"] in circuits:
            cvals[r["circuit_id"]][r["method"]] = r["valeur"]
    for r in conn.execute("SELECT circuit_id, valeur FROM circuits"):
        if r["circuit_id"] in circuits:
            cvals[r["circuit_id"]]["official"] = r["valeur"]
    print(f"{len(comps)} competitions, {len(circuits)} circuits")

    # -- the monthly recalage schedules (each Fair's, shared by its Top) ----------
    knots_of = {}
    for base in BASES:
        norm = defaultdict(list)
        for r in conn.execute(
            "SELECT terrain, date_iso, factor, top_mean_raw FROM normalisation "
            "WHERE method=? ORDER BY date_iso", (base,)
        ):
            norm[TERRAINS[r["terrain"]]].append((r["date_iso"], r["factor"], r["top_mean_raw"]))
        knots_of[base] = {t: daily_knots([(date.fromisoformat(d), f) for d, f, _ in v]) for t, v in norm.items()}
    knots = knots_of["fair"]                     # meta.normalisation: the published method's factors (the Top's, since 2026-10-16)

    def factor_at(t: str, d: date, base: str = "fair") -> float:
        return factor_on(knots_of[base].get(t, []), d)


    # -- load every result row once ----------------------------------------
    by_method = defaultdict(dict)   # method -> (licence, circuit) -> row
    for r in conn.execute(
        """SELECT method, licence, circuit_id, date_iso, terrain, categorie, club, status,
                  temps_s, cn_j15, score, score_raw, counts_for_cn, poids
           FROM scores WHERE season >= ?""",
        (min_season,),
    ):
        if r["circuit_id"] in circuits:
            by_method[r["method"]][(anon.lic(r["licence"]), r["circuit_id"])] = r
    cn_after = defaultdict(dict)    # method -> (licence, date, terrain) -> cn
    for r in conn.execute(
        f"SELECT method, licence, date_iso, terrain, cn FROM cn_history "
        f"WHERE method IN ({','.join('?' * len(COMPUTED))}) AND cn IS NOT NULL", COMPUTED
    ):
        cn_after[r["method"]][(anon.lic(r["licence"]), r["date_iso"], r["terrain"])] = r["cn"]
    # histories per runner/terrain for each method (its published scores, fixed at their race's day): the month-end
    # snapshots and the CN J-15 of the race files are aggregated from them on their own day, so that a race leaving
    # the window, or a junior's race fading (params.junior_fade), shows on that day
    hist_of = {b: defaultdict(lambda: ([], [], [], [])) for b in BASES}   # base -> (lic, t) -> dates, scores, weights, juniors
    for base in BASES:
        for (lic, cid), v in sorted(by_method[base].items(), key=lambda kv: kv[1]["date_iso"]):
            if v["counts_for_cn"] and v["score"] is not None:
                k = (lic, TERRAINS.get(v["terrain"], "For"))
                hist_of[base][k][0].append(date.fromisoformat(v["date_iso"]))
                hist_of[base][k][1].append(v["score"])
                hist_of[base][k][2].append(v["poids"] or 1.0)
                hist_of[base][k][3].append(is_junior(v["categorie"]))

    def agg_at(dates, scores, weights, juniors, X: date, p: CnParams):
        # the aggregate of the published scores (each fixed with its race's factor): no factor here
        lo = bisect_left(dates, X - timedelta(days=p.window_days))
        hi = bisect_right(dates, X)
        fade = fade_factors(dates[lo:hi], juniors[lo:hi], X, p) if p.junior_fade else None
        cn, kept = top_n_weighted(scores[lo:hi], weights[lo:hi], p, fade)
        return Decimal_round(cn) if cn and kept else None

    j15_memo = {}

    def cn_j15(method, lic, terrain, d):
        """The runner's published CN 15 days before a race, computed on that day (the engine's cn_j15 is on its internal
        scale; the last CN after a race is not it either: a race may have left the window since, a junior's faded)."""
        key = (method, lic, terrain, d)
        if key not in j15_memo:
            h = hist_of[BASE[method]].get((lic, TERRAINS.get(terrain, "For")))
            j15_memo[key] = h and agg_at(*h, date.fromisoformat(d) - timedelta(days=pf.lag_days),
                                          PARAMS[method].for_terrain(terrain))
        return j15_memo[key]
    raw_res = {}
    real_names = {}                  # pseudonym -> (licence, name): the anonymised, for the auth index only
    for r in conn.execute(
        "SELECT circuit_id, licence, nom, place, temps, nouveau_cn, points, cn_j15 FROM results"
    ):
        if r["circuit_id"] in circuits:
            raw_res[(anon.lic(r["licence"]), r["circuit_id"])] = r
            if anon.has(r["licence"]) and r["nom"]:
                real_names[anon.lic(r["licence"])] = (r["licence"], r["nom"])
    # "nc" (non classé): no points, not part of the race for the CN. Such a row is
    # dropped from every method, so it is in no runner's results and no statistic;
    # the race's own page still lists it, as FFCO does.
    nc_rows = {}
    for key, r in raw_res.items():
        if is_nc(r["place"]):
            nc_rows[key] = by_method["official"].get(key)
            for m in by_method.values():
                m.pop(key, None)
    for key in nc_rows:
        del raw_res[key]
    n_per_circuit = defaultdict(int)
    for (lic, cid), r in raw_res.items():
        n_per_circuit[cid] += 1
    print(f"loaded {len(raw_res):,} results")

    def to_int(v):
        try:
            return int(str(v).replace("+", "").strip())
        except (TypeError, ValueError):
            return None

    # -- runners ---------------------------------------------------------------
    per_runner = defaultdict(list)   # licence -> list of (date, circuit)
    for (lic, cid), r in by_method["official"].items():
        per_runner[lic].append((r["date_iso"], cid))
    names_by_lic = {lic: privacy.label(lic) if privacy.is_pseudo(lic) else r["nom"] for (lic, cid), r in raw_res.items()}
    # a country whose runners Ozimut tells apart itself (countries/identity.py): the name its persons table keeps
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'persons'").fetchone():
        names_by_lic.update({str(i): n for i, n in conn.execute("SELECT id, name FROM persons")})

    runners = []
    attrs_timeline = {}              # licence -> [(date, cat, club)]
    for lic, lst in per_runner.items():
        lst.sort()
        tl = []
        per_t = dict.fromkeys(TERRAIN_CODES, 0)
        for d, cid in lst:
            o = by_method["official"][(lic, cid)]
            tl.append((d, o["categorie"], o["club"]))
            per_t[comps[circuits[cid][0]][6]] += 1
        attrs_timeline[lic] = tl
        last = tl[-1]
        sexe = (last[1] or "")[:1] if (last[1] or "")[:1] in ("H", "D") else None
        runners.append([lic, names_by_lic.get(lic, ""), sexe, lst[0][0], lst[-1][0],
                        len(lst), *per_t.values(), last[1], last[2]])
    runners.sort(key=lambda x: x[1])
    if fr:                                    # the registration's check of an FFCO licence (functions/_lib/api.js)
        write_auth_index(runners, list(real_names.values()))
    dump(OUT / "runners.json", {
        "cols": ["licence", "nom", "sexe", "first", "last", "n", *(f"n{t}" for t in TERRAIN_CODES), "cat", "club"],
        "rows": runners,
    })
    print(f"{len(runners):,} runners")

    # -- runner detail files ------------------------------------------------
    def method_cols(lic, cid, terr_full, d, fm, tm):
        """A Fair method's published score, CN J-15, CN after, counts; its Top's raw score, published
        score (= the Fair's), CN J-15, CN after, counts, weight."""
        v, t = by_method[fm].get((lic, cid)), by_method[tm].get((lic, cid))
        return [v["score"] if v else None, cn_j15(fm, lic, terr_full, d) if v else None,
                cn_after[fm].get((lic, d, terr_full)), v["counts_for_cn"] if v else 0,
                t["score_raw"] if t else None, t["score"] if t else None,
                cn_j15(tm, lic, terr_full, d) if t else None, cn_after[tm].get((lic, d, terr_full)),
                t["counts_for_cn"] if t else 0, t["poids"] if t else None]

    buckets = defaultdict(dict)
    for lic, lst in per_runner.items():
        races = []
        for d, cid in lst:
            course_id, cname, dist = circuits[cid]
            c = comps[course_id]
            o = by_method["official"][(lic, cid)]
            raw = raw_res.get((lic, cid))
            terr_full = o["terrain"]
            races.append([
                cid, course_id, cname, dist, d, TERRAINS.get(terr_full, "For"),
                c[5], c[4], o["categorie"], o["club"],
                to_int(raw["place"]) if raw else None, n_per_circuit[cid],
                o["temps_s"], o["status"],
                # official: score, cn j-15, cn after
                o["score"], o["cn_j15"], to_int(raw["nouveau_cn"]) if raw else None,
                # fair + top6w (see method_cols; the geometric pair's columns, appended here, went on 2026-10-19)
                *method_cols(lic, cid, terr_full, d, "fair", "top6w"),
            ])
        buckets[runner_bucket(lic, RB)][lic] = races
    for b, content in buckets.items():
        dump(OUT / "r" / f"{b}.json", content)
    prune(OUT / "r", {f"{b}.json" for b in buckets})
    print(f"{len(buckets):,} runner bucket files")

    # -- competition files --------------------------------------------------
    by_course = defaultdict(lambda: defaultdict(list))
    for (lic, cid), o in by_method["official"].items():
        raw = raw_res.get((lic, cid))
        row = [lic, to_int(raw["place"]) if raw else None, o["temps_s"], o["status"],
               o["categorie"], o["club"], o["score"], o["cn_j15"]]
        for m in COMPUTED:                          # fair, top6w: score, CN J-15
            v = by_method[m].get((lic, cid))
            row += [v["score"] if v else None, cn_j15(m, lic, o["terrain"], o["date_iso"]) if v else None]
        by_course[circuits[cid][0]][cid].append(row)
    for (lic, cid), o in nc_rows.items():
        if o is not None:
            by_course[circuits[cid][0]][cid].append([
                lic, None, o["temps_s"], "nc", o["categorie"], o["club"],
                None, o["cn_j15"], *([None, None] * len(COMPUTED)),
            ])
    c_files = defaultdict(dict)                 # c/: five competitions a file (site_io.course_file)
    for course_id, circ in by_course.items():
        out = []
        for cid, rows in circ.items():
            rows.sort(key=lambda x: (x[1] is None, x[1] or 0, x[2] or 10**9))
            cv = cvals.get(cid, {})
            d = date.fromisoformat(comps[course_id][0])
            value = {"official": cv.get("official")}
            for m in COMPUTED:                      # a Top's circuits are its Fair's
                fv = cv.get(BASE[m])
                value[m] = Decimal_round(fv * factor_at(comps[course_id][6], d, BASE[m])) if fv else None
            out.append({
                "id": cid, "name": circuits[cid][1], "dist": circuits[cid][2],
                "value": value, "rows": rows,
            })
        out.sort(key=lambda c: c["name"] or "")
        c_files[course_file(course_id)][str(course_id)] = {"course": course_id, "circuits": out}
    for name, group in c_files.items():
        dump(OUT / "c" / name, dict(sorted(group.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0)))
    prune(OUT / "c", set(c_files))

    # which competitions each club took part in (the "Courses" tab, club mode)
    club_courses = defaultdict(set)
    for course_id, circ in by_course.items():
        for rows in circ.values():
            for row in rows:
                code = club_parts(row[5])[0]
                if code:
                    club_courses[code].add(course_id)
    if PACKS:
        packs = defaultdict(dict)
        for code, ids in club_courses.items():
            packs[club_pack(code, PACKS)][code] = sorted(ids)
        for k, v in packs.items():
            dump(OUT / "club_courses" / f"p{k}.json", v)
        prune(OUT / "club_courses", {f"p{k}.json" for k in packs})
    else:
        for code, ids in club_courses.items():
            dump(OUT / "club_courses" / f"{code}.json", sorted(ids))
        prune(OUT / "club_courses", {f"{code}.json" for code in club_courses})
    print(f"{len(by_course):,} competition files")
    # listing columns: + number of results and of circuits
    comps_out = {cid: [*v, sum(len(r) for r in by_course.get(cid, {}).values()), len(by_course.get(cid, {}))]
                 for cid, v in comps.items()}
    dump(OUT / "competitions.json", {
        "cols": ["date", "title", "location", "organizer", "groupe", "epreuve", "terrain", "season", "n", "circuits"],
        "rows": comps_out,
    })

    # -- month-end snapshots ------------------------------------------------
    last_race = max(date.fromisoformat(v[0]) for v in comps.values())
    first_race = min(date.fromisoformat(v[0]) for v in comps.values())
    # the last point is today, not the last race (owner, 2026-10-19): a junior's CN moves by the day as their races
    # fade (CnParams.junior_fade), so the rankings' latest column is each runner's CN on the day the site was built
    last_point = max(last_race, paris_today())
    months = month_ends(first_race, last_point)
    months[-1] = min(months[-1], last_point)
    print(f"{len(months)} month-ends {months[0]} .. {months[-1]}")

    hoff = defaultdict(lambda: ([], []))           # (lic, t|Ped) -> dates, cn
    # Before 2026 the official pedestrian ranking was a single one, so its
    # history is pooled under "Ped"; from 2026 it is per terrain (VTT and ski: always).
    # FFCO's CN after each race, and the CN J-15 it printed for each race, dated 15 days before (owner, 2026-10-26: the CN
    # also moves between races - a race leaving FFCO's window -, which only the next race's CN J-15 tells; « En direct »
    # read a runner's CN after their race of late August where FFCO's own was some 190 points higher); on one day the CN
    # after a race comes last
    off_events = []
    for (lic, cid), raw in raw_res.items():
        o = by_method["official"].get((lic, cid))
        if not o:
            continue
        d = date.fromisoformat(o["date_iso"])
        t = official_terrain(TERRAINS.get(o["terrain"], "For"), d.year)
        j15 = to_int(raw["cn_j15"])
        if j15:
            off_events.append((d - timedelta(days=pf.lag_days), 0, lic, t, j15))
        ncn = to_int(raw["nouveau_cn"])
        if ncn:
            off_events.append((d, 1, lic, t, ncn))
    off_events.sort()
    for d, _, lic, t, ncn in off_events:
        hoff[(lic, t)][0].append(d)
        hoff[(lic, t)][1].append(ncn)

    def off_at(dates, cns, X: date):
        hi = bisect_right(dates, X)
        if hi == 0 or dates[hi - 1] < X - timedelta(days=365):
            return None
        return cns[hi - 1]

    # the official CN computed on any day from FFCO's race points, its 2026 rule (`ffco_cn`), so that a race leaving the
    # window shows on its day as in the Ozimut index (owner, 2026-10-26) - in forest and sprint from 2026, across FFCO's
    # yearly rescale (every 1 January since 2026: the previous season's points × one factor per speciality; in 2026 after
    # a re-run of 2025 under the 2026 rules): ffco_scale.py; in VTT and ski (not measured) and before 2026, FFCO's
    # published values above
    races_off, printed_off = [], []
    for (lic, cid), o in by_method["official"].items():
        t = TERRAINS.get(o["terrain"], "For")
        if t not in FOOT:
            continue
        d = date.fromisoformat(o["date_iso"])
        if d < date(ffco_scale.FIRST - 3, 1, 1):
            continue
        raw = raw_res.get((lic, cid))
        place = str(raw["place"] or "").strip() if raw else ""
        races_off.append(ffco_scale.Race(cid, lic, d, t, o["temps_s"], place.isdigit(), o["score"]))
        if raw and d.year >= ffco_scale.FIRST:
            for X, v, mr in ((d - timedelta(days=pf.lag_days), to_int(raw["cn_j15"]), 1), (d, to_int(raw["nouveau_cn"]), 2)):
                if v:
                    printed_off.append(ffco_scale.Printed(lic, t, X, d.year, mr, v))
    oscale = ffco_scale.OfficialScale(races_off, printed_off, max(last_point.year, paris_today().year))
    off_keys = {(r.lic, r.t) for r in races_off if r.day.year >= ffco_scale.FIRST - 1}

    def off_value(lic, t, X: date, min_races: int = 2, scale: int | None = None):
        """The official CN on day X (2 races for the CN FFCO publishes, 1 for the CN J-15 it values circuits with), on
        the scale of X's season (a race's CN J-15: the race's season)."""
        S = scale or X.year
        if t in FOOT and S >= ffco_scale.FIRST:
            return oscale.cn(lic, t, X, min_races, S)
        h = hoff.get((lic, t))
        return off_at(*h, X) if h else None

    # how close that is to what FFCO prints, run after run: its CN after each race and its CN J-15 from 2026, each
    # computed without itself (anchored on FFCO's value of before): windows of the season alone, and holding the
    # previous season's rescaled races
    print("official CN computed against FFCO's: " + ", ".join(
        f"{t} {k} {ok}/{n} ({100 * ok / n:.2f} %, within 10: {100 * w / n:.1f} %)"
        for (t, k), (n, ok, w) in sorted(oscale.check().items()) if n), flush=True)

    years = sorted({m.year for m in months if m.year >= min_season})
    snap_stats = {}
    levels = defaultdict(list)   # "method_terrain" -> [[yyyy-mm, n, median, top30mean]]
    if since:
        # seasons before the change are unchanged: keep their snapshots and levels
        # (in meta_more.json since 2026-11-17, in meta.json before)
        more_file = OUT / "meta_more.json"
        old_more = json.loads(more_file.read_text(encoding="utf-8")) if more_file.exists() else old_meta
        for key, rows in old_more.get("levels", {}).items():
            levels[key] = [r for r in rows if int(r[0][:4]) < since.year]
    snap_keep: set[str] = set()
    for Y in years:
        if since and Y < since.year:
            snap_keep.update(f.name for f in (OUT / "snap").glob(f"*_{Y}.json"))
            continue
        ym = [m for m in months if m.year == Y]
        idx = {m: i for i, m in enumerate(ym)}
        files = defaultdict(dict)   # (method, t) -> lic -> [12]
        for base in BASES:
            family = [n for n in COMPUTED if BASE[n] == base]      # the Fair and its Top
            for (lic, t), (ds, ss, ws, js) in hist_of[base].items():
                full_t = TERRAIN_NAMES[t]                 # params are keyed by the database's terrain
                ps = {n: PARAMS[n].for_terrain(full_t) for n in family}
                for m in ym:
                    if ds and ds[0] <= m and ds[-1] >= m - timedelta(days=ps[base].window_days + 1):
                        for mth in family:
                            cn = agg_at(ds, ss, ws, js, m, ps[mth])
                            if cn:
                                files[(mth, t)].setdefault(lic, [0] * 12)[idx[m]] = cn
        for (lic, t) in set(hoff) | off_keys:
            if t != official_terrain(t if t != "Ped" else "For", Y):     # pooled before, split after
                continue
            for m in ym:
                cn = off_value(lic, t, m)
                if cn:
                    files[("official", t)].setdefault(lic, [0] * 12)[idx[m]] = cn
        active = set()
        snap_keep.add(f"attr_{Y}.json")
        snap_keep.update(f"{mth}_{t}_{Y}.json" for (mth, t) in files)
        for (mth, t), rows in files.items():
            dump(OUT / "snap" / f"{mth}_{t}_{Y}.json",
                 {"months": [m.isoformat() for m in ym],
                  "rows": [[lic, *v[: len(ym)]] for lic, v in rows.items()]})
            active.update(rows)
            snap_stats[f"{mth}_{t}_{Y}"] = len(rows)
            for i, m in enumerate(ym):
                vals = sorted((v[i] for v in rows.values() if v[i]), reverse=True)
                if vals:
                    levels[f"{mth}_{t}"].append([
                        m.isoformat()[:7], len(vals), vals[len(vals) // 2],
                        round(sum(vals[:30]) / min(30, len(vals)))])
        # category & club as of the year's end (latest race on or before it)
        attr = {}
        year_end = date(Y, 12, 31)
        for lic in sorted(active):        # sorted: identical data must give identical files
            tl = attrs_timeline.get(lic)
            if not tl:
                continue
            ds = [x[0] for x in tl]
            i = bisect_right(ds, year_end.isoformat()) - 1
            if i >= 0:
                attr[lic] = [tl[i][1], tl[i][2]]
        dump(OUT / "snap" / f"attr_{Y}.json", attr)
        print(f"  snapshots {Y}: " + ", ".join(
            f"{m}/{t}={len(r):,}" for (m, t), r in sorted(files.items())), flush=True)

    # the official CN 15 days before today, for « En direct »: the CN FFCO will value today's circuits with (a month-end
    # snapshot can be weeks off it)
    j15_day = paris_today() - timedelta(days=pf.lag_days)
    j15_cn = defaultdict(dict)
    for (lic, t) in set(hoff) | off_keys:
        if t == official_terrain(t if t != "Ped" else "For", paris_today().year):
            cn = off_value(lic, t, j15_day, 1, paris_today().year)
            if cn:
                j15_cn[t][lic] = cn
    dump(OUT / "snap" / "official_j15.json", {"date": j15_day.isoformat(), "cn": {t: dict(sorted(v.items())) for t, v in sorted(j15_cn.items())}})
    snap_keep.add("official_j15.json")
    # the rescale's factors and circuit multipliers, for the provisional results' official scores (prov/compute.py)
    if fr:
        dump(OUT / "snap" / "official_scale.json", oscale.saved())
        snap_keep.add("official_scale.json")
    prune(OUT / "snap", snap_keep)
    # a synced folder (OneDrive…) leaves conflict copies behind: never publish them
    for f in OUT.rglob("*Name clash*"):
        f.unlink()
        WRITES["deleted"] += 1

    # club aggregates, elite points, age curves and the co-runner network are
    # derived from the files above by site_extras.py, called once meta.json exists

    # -- overview statistics ------------------------------------------------
    per_year = defaultdict(lambda: {t: [0, set(), 0] for t in TERRAIN_CODES})
    for cid_, c in comps.items():
        per_year[c[7]][c[6]][0] += 1
    for (lic, cid), o in by_method["official"].items():
        c = comps[circuits[cid][0]]
        per_year[c[7]][c[6]][1].add(lic)
        per_year[c[7]][c[6]][2] += 1
    overview = {str(y): {t: [v[0], len(v[1]), v[2]] for t, v in d.items()}
                for y, d in sorted(per_year.items())}

    # method agreement on a common cohort: same runner, same month-end
    agree = {}
    for t in TERRAIN_CODES:
        pairs = []
        Y = years[-1]
        try:
            snaps = [json.loads((OUT / "snap" / f"{m}_{t}_{Y}.json").read_text(encoding="utf-8"))
                     for m in ("official", *COMPUTED)]
        except FileNotFoundError:
            continue
        last = len(snaps[0]["months"]) - 1
        ds = [{r[0]: r[1 + last] for r in s["rows"]} for s in snaps]
        for lic in sorted(set.intersection(*(set(d) for d in ds))):   # sorted: the sample below is then stable
            if all(d[lic] for d in ds):
                pairs.append([d[lic] for d in ds])     # official, fair, top6w
        agree[t] = pairs[:4000]

    def by_terrain(p):            # a discipline's own values, by site code (see CnParams.by_terrain)
        return {TERRAINS.get(t, t): o for t, o in p.by_terrain.items()}

    def params_meta(p: CnParams) -> dict:
        return {
            **({"top_n": p.top_n} if p.top_n < 10 ** 5 else {}),
            "eligible_fraction": p.eligible_fraction, "weights": TITLE_WEIGHTS,
            "min_scores": p.min_scores_for_cn, "min_ranked": p.min_ranked,
            "window_days": p.window_days, "lag_days": p.lag_days, "by_terrain": by_terrain(p),
            "cv_power": p.cv_power, "cn_power": p.cn_power, "sample_fraction": p.sample_fraction,
            "junior_fade": p.junior_fade,
            "anchor_top_k": norm_cfg.anchor_top_k, "anchor_top_fraction": norm_cfg.anchor_top_fraction,
            "anchor_target": norm_cfg.target, "anchor_lag_months": norm_cfg.lag_months}

    COLOR = {"fair": 2, "top6w": 4}      # palette slots, as in the browser (charts.METHOD_SLOT)
    # the official ranking, when the country's federation publishes values Ozimut has (France's CN; Spain's: none yet)
    has_official = bool(off_events) or any(o["score"] is not None for o in by_method["official"].values())
    methods_meta = {**({"official": {"color": 1}} if has_official else {}),
                    **{n: {"color": COLOR[n], "params": params_meta(PARAMS[n])} for n in COMPUTED}}
    meta = {
        "built": date.today().isoformat(),
        "country": args.country.upper(),
        "bucket": RB,                    # r/ and net/: a runner's number // bucket
        **({"club_packs": PACKS} if PACKS else {}),   # club/ and club_courses/: p<club_pack(code)>.json
        "min_season": min_season or None,
        "seasons": years,
        "months": [m.isoformat() for m in months if m.year >= min_season],
        "split_year": SPLIT_YEAR,
        "c_group": COURSE_GROUP,         # c/: a competition's results in g<id // c_group>.json
        "methods": methods_meta,
        # the knots of the daily factor: a straight line between them
        "normalisation": {t: [[d.isoformat(), round(f, 6)] for d, f in k] for t, k in knots.items()},
        "names": names,
        "counts": {"runners": len(runners), "competitions": len(comps),
                   "circuits": len(circuits), "results": len(raw_res)},
        "overview": overview,
    }
    # The ranking's level month by month and the methods' agreement (the Documentation's chart), 230 of the 270 KB this file
    # weighed: in a file of their own since 2026-11-17 — every visit reads meta.json before it draws anything, and nothing
    # read at the start needs them (the pages read them from either place: data.metaMore).
    dump(OUT / "meta_more.json", {"levels": levels, "agreement": agree})
    # another country's federation ranking as it publishes it (Spain: FEDO's season tables, countries/es/official.py)
    if not fr:
        import importlib
        try:
            off_mod = importlib.import_module(f"countries.{args.country.lower()}.official")
        except ModuleNotFoundError:
            off_mod = None
        table = off_mod.site_table(conn) if off_mod and hasattr(off_mod, "site_table") else {}
        if table:
            dump(OUT / "official.json", {"federation": countries.get(args.country).federation, "seasons": table})
            meta["official_table"] = sorted(table)
        else:
            prune(OUT, set(), "official.json")
    dump(OUT / "meta.json", meta)
    site_extras.main(OUT)
    # France's public copy (owner, 2026-10-30): its data from the first season FFCO shows without a login, for visitors
    # without an account and the accounts that have not joined France (site_public.py)
    if fr:
        import site_public
        from countries.fr import public_period
        site_public.write(OUT, public_period.public_from(conn))
    total = sum(f.stat().st_size for f in OUT.rglob("*.json"))
    nfiles = sum(1 for _ in OUT.rglob("*.json"))
    print(f"done in {time.monotonic()-t0:.0f}s: {nfiles:,} files, {total/1e6:.1f} MB — "
          f"{WRITES['written']:,} written, {WRITES['unchanged']:,} unchanged, {WRITES['deleted']:,} deleted")


if __name__ == "__main__":
    main()
