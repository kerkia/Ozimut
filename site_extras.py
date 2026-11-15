"""Second-stage datasets, derived only from what build_site.py already exported.

Everything here reads site/data (snapshots, category/club attributes, the
per-competition result files) rather than the database, so it can be re-run
on its own in a few minutes after a full build:

    py -3 site_extras.py

Outputs (all under site/data/):
    club/{code}.json        club aggregates: "monthly" [n, median, max, sum, top5]
                            per "{method}_{terrain}" and month; "years" and "pts"
                            per season and sex/age group
    elite/{season}.json     points earned in national races (levels A and B1)
    elite_summary.json      the same points summed per club and season
    agecurve.json           CN quantiles per age category and season
    net/{bucket}.json       each runner's most frequent co-runners
    pyramid/{season}.json   competitors of the season counted by category, club and discipline
                            (pyramid/all.json: every competitor once, as at their last race)
    participation.json      competitors and results per season, club and discipline (Réseau · Activité)
    mostraces.json          the runners with the most races, by type, over every season, the last and the current one
    validation.json         how well each method's CN predicts who finishes ahead (season 2025;
                            built once - delete it to rebuild, as a method change does)
    evaluation.json         the same question measured soundly, every season (site_eval.py; built once too)
    cfc.json                the Coupe de France des clubs recomputed with FFCO's 2026 rule, every season
    ask/*.parquet           the tables « IA » queries in the browser (site_ask.py, every build)
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np

from site_io import Courses, club_pack, dump, prune, runner_bucket
from ffco_scraper.cn import title_weight

ROOT = Path(__file__).parent
OUT = ROOT / "site" / "data" / "fr"           # a country's folder (main(out)): France's by default
COURSES = Courses(OUT)

# Points for the first ten of a category, Formula-1 style: a win is worth a
# lot more than a 10th place, but depth still counts.
ELITE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
ELITE_LEVELS = {"A", "B1"}          # national races: championnats, nationales, sélections
ELITE_CATS = {"H21", "D21"}         # the "élite" ranking; "all" keeps every category
CHAMPIONSHIP_COEFF = 2              # a national championship counts double
QUANTILES = list(range(0, 101, 5))
AGE_POOL_FROM = 2012                # the first seasons mostly reflect the seed CNs
NET_TOP = 30                        # co-runners kept per runner
NET_MIN_SHARED = 2
TERRAINS = ("For", "Spr", "VTT", "Ski")


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))





def club_code(club: str | None) -> str | None:
    m = re.match(r"^(\d{4})[A-Z]*$", (club or "").strip())
    return m.group(1) if m else None


def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def snapshot_files(year: int):
    """(method, terrain, snapshot) for every CN snapshot of a season."""
    for f in sorted((OUT / "snap").glob(f"*_{year}.json")):
        if f.name.startswith("attr_"):
            continue
        method, terrain, _ = f.stem.split("_")
        yield method, terrain, load(f)


# -- clubs ---------------------------------------------------------------------
SEXES = ("H", "D", "*")
# J: up to 20 (H/D 10-20), A: 21 and over, E: 21 only (the elite category)
AGE_GROUPS = ("J", "A", "E", "*")


def groups_of(cat: str | None) -> list[str]:
    """Every sex/age combination a category belongs to, as 'HJ', '*A', '**'…"""
    m = re.match(r"^([HD])(\d+)$", (cat or "").strip())
    if not m:
        return ["**"]
    sexe, age = m.group(1), int(m.group(2))
    ages = ["J" if age <= 20 else "A", "*"] + (["E"] if age == 21 else [])
    return [s + a for s in (sexe, "*") for a in ages]


def summarise(values: list[float]) -> list:
    """[n, sum, sum of the best five] — enough for total, mean and top-5 mean."""
    values = sorted(values)
    return [len(values), round(sum(values)), round(sum(values[-5:]))]


def club_files(years: list[int], elite_rows: dict) -> None:
    """Per-club aggregates.

    monthly: [n, median, max, sum, top5] per "{method}_{terrain}" and month, over
      every ranked runner. `sum` rewards size and level together; `top5` is the
      mean of the five best CNs, a missing runner counting 0.
    years: at each season's last month-end, [n, sum, top5 sum] per sex/age group.
    pts: national-race points per season, the same summary over each runner's total."""
    series = defaultdict(lambda: defaultdict(dict))
    years_out = defaultdict(lambda: defaultdict(dict))
    for Y in years:
        attr = load(OUT / "snap" / f"attr_{Y}.json")
        for method, terrain, snap in snapshot_files(Y):
            last = len(snap["months"]) - 1
            grouped = defaultdict(lambda: defaultdict(list))
            for row in snap["rows"]:
                cn = row[1 + last]
                a = attr.get(str(row[0]))
                code = club_code(a[1]) if cn and a else None
                if code:
                    for g in groups_of(a[0]):
                        grouped[code][g].append(cn)
            for code, per in grouped.items():
                years_out[code][f"{method}_{terrain}"][str(Y)] = {g: summarise(v) for g, v in per.items()}
            for i, m in enumerate(snap["months"]):
                per_club = defaultdict(list)
                for row in snap["rows"]:
                    cn = row[1 + i]
                    a = attr.get(str(row[0]))
                    code = club_code(a[1]) if cn and a else None
                    if code:
                        per_club[code].append(cn)
                for code, vals in per_club.items():
                    vals.sort()
                    series[code][f"{method}_{terrain}"][m[:7]] = [
                        len(vals), vals[len(vals) // 2], vals[-1], sum(vals),
                        round(sum(vals[-5:]) / 5)]
    # national-race points: each runner's season total within each group
    comps = load(OUT / "competitions.json")["rows"]
    pts_out = defaultdict(lambda: defaultdict(dict))
    for season, rows in elite_rows.items():
        per_runner = defaultdict(float)             # (club, terrain, group, licence) -> points
        for course, lic, cat, _rank, pts, code in rows:
            if not code:
                continue
            terrain = comps[str(course)][6]
            for g in groups_of(cat):
                per_runner[(code, terrain, g, lic)] += pts
        grouped = defaultdict(list)
        for (code, terrain, g, _lic), v in per_runner.items():
            grouped[(code, terrain, g)].append(v)
        for (code, terrain, g), v in grouped.items():
            pts_out[code][terrain].setdefault(str(season), {})[g] = summarise(v)
    pm_out = member_pm(years)
    codes = set(series) | set(years_out) | set(pts_out)
    one = lambda code: {"monthly": series.get(code, {}), "years": years_out.get(code, {}), "pts": pts_out.get(code, {}),
                        "pm": pm_out.get(code, {})}
    packs = load(OUT / "meta.json").get("club_packs")
    if packs:                                    # a country's clubs packed (build_site CLUB_PACKS)
        by = defaultdict(dict)
        for code in codes:
            by[club_pack(code, packs)][code] = one(code)
        for k, v in by.items():
            dump(OUT / "club" / f"p{k}.json", v)
        prune(OUT / "club", {f"p{k}.json" for k in by})
    else:
        for code in codes:
            dump(OUT / "club" / f"{code}.json", one(code))
    print(f"  {len(codes)} club files")


def member_pm(years: list[int]) -> dict:
    """The club page's « PM 12 mois »: per club, its members' races and mispunches (« pm ») of the 12 months to the latest
    month, per discipline — {club: {licence: {terrain: [n, pm]}}}, as data.pmRate counts them; the page read every member's
    race file for it (up to a hundred requests a club; the packing study of 2026-10-23). A member is of their club of the
    last season's attributes."""
    from datetime import date as _d, timedelta
    months = load(OUT / "meta.json").get("months") or []
    if not months or not years:
        return {}
    last = months[-1]
    since = (_d.fromisoformat(last) - timedelta(days=365)).isoformat()
    attr = load(OUT / "snap" / f"attr_{years[-1]}.json")
    out = defaultdict(dict)
    for f in (OUT / "r").glob("*.json"):
        for lic, races in load(f).items():
            a = attr.get(lic)
            code = club_code(a[1]) if a else None
            if not code:
                continue
            per = defaultdict(lambda: [0, 0])
            for r in races:
                if since < r[4] <= last:                 # R.date, R.terrain, R.status
                    per[r[5]][0] += 1
                    per[r[5]][1] += r[13] == "pm"
            if per:
                out[code][lic] = dict(per)
    return out


# -- the runners who race the most ------------------------------------------------
# Statistiques › « Les plus actifs » (owner, 2026-11-15): every race of a runner's results (pm and abandons included, the
# « nc » rows are in no runner's results), counted by type — forest LD, MD and night, sprint, VTT and ski (all their formats),
# a forest race of no known format apart —, over every season, the last one and the current one.
MOST_TYPES = ("LD", "MD", "Nuit", "Spr", "VTT", "Ski", "Autre")
MOST_TOP = 200                       # runners kept a period for each choice of the page (those tied with the last one too)


def _most_age(cat: str) -> int:
    m = re.search(r"\d+", cat or "")
    return int(m.group()) if m else 0


# the page's choices (mostraces.js GROUPS, sexes): the first MOST_TOP of each are kept, so that each list is whole
MOST_GROUPS = (lambda c: True, lambda c: _most_age(c) == 21, lambda c: 0 < _most_age(c) <= 20, lambda c: _most_age(c) >= 35)


def _most_type(terrain: str, epreuve: str) -> int:
    if terrain == "For":
        return MOST_TYPES.index(epreuve) if epreuve in ("LD", "MD", "Nuit") else MOST_TYPES.index("Autre")
    return MOST_TYPES.index(terrain) if terrain in MOST_TYPES else MOST_TYPES.index("Autre")


def most_races(years: list[int]) -> None:
    """mostraces.json: {types, periods: {all|<season>: {from, to, runners, results, rows}}}, each row
    [licence, races, [count by type], category, club, seasons raced, first day, last day], the category and club those of
    the runner's last race of the period; sorted by races, the MOST_TOP first of each sex and group of categories kept."""
    if not years:
        return
    cur, prev = str(years[-1]), str(years[-2]) if len(years) > 1 else None
    keys = ["all", cur] + ([prev] if prev else [])
    acc = {k: {} for k in keys}            # period -> licence -> [n, counts, cat, club, seasons, first, last]
    results = dict.fromkeys(keys, 0)
    for f in (OUT / "r").glob("*.json"):
        for lic, races in load(f).items():
            for r in races:
                day, terrain, epreuve, cat, club = r[4], r[5], r[6] or "", r[8], r[9]
                season = day[:4]
                k = _most_type(terrain, epreuve)
                for p in ("all", season):
                    if p not in acc:
                        continue
                    x = acc[p].get(lic)
                    if x is None:
                        x = acc[p][lic] = [0, [0] * len(MOST_TYPES), cat, club, set(), day, day]
                    x[0] += 1
                    x[1][k] += 1
                    x[4].add(season)
                    if day >= x[6]:
                        x[2], x[3], x[6] = cat, club, day
                    if day < x[5]:
                        x[5] = day
                    results[p] += 1
    periods = {}
    for p in keys:
        rows = sorted(acc[p].items(), key=lambda kv: (-kv[1][0], kv[1][6]))
        keep = set()
        for sex in ("", "H", "D"):
            for grp in MOST_GROUPS:
                sel = [(lic, x[0]) for lic, x in rows if (x[2] or "").startswith(sex) and grp(x[2] or "")]
                cut = sel[MOST_TOP - 1][1] if len(sel) >= MOST_TOP else 0
                keep.update(lic for lic, n in sel if n >= cut)
        kept = [[lic, x[0], x[1], x[2] or "", x[3] or "", len(x[4]), x[5], x[6]] for lic, x in rows if lic in keep]
        periods[p] = {"from": years[0] if p == "all" else int(p), "to": years[-1] if p == "all" else int(p),
                      "runners": len(acc[p]), "results": results[p], "rows": kept}
    dump(OUT / "mostraces.json", {"v": 1, "top": MOST_TOP, "types": list(MOST_TYPES), "periods": periods})
    print(f"  most races: {len(acc['all']):,} runners, {results['all']:,} results")


# -- elite results ---------------------------------------------------------------
def elite(comps: dict) -> dict:
    """Top-10 finishes per category in national races, with points.

    A category is ranked on the circuit where most of its runners ran, so an
    open 'H21 court' circuit alongside the elite one does not hand out a second
    set of podiums."""
    by_season = defaultdict(list)
    summary = {mode: {t: defaultdict(lambda: defaultdict(int)) for t in TERRAINS}
               for mode in ("elite", "all")}
    for cid, c in comps.items():
        d, title, _, _, groupe, _, terrain, season, *_ = c
        if groupe not in ELITE_LEVELS:
            continue
        res = COURSES.get(cid)
        if res is None:
            continue
        coeff = CHAMPIONSHIP_COEFF if "championnat de france" in fold(title) else 1
        circuits = res["circuits"]
        count = defaultdict(lambda: defaultdict(int))        # cat -> circuit index -> n
        for k, circ in enumerate(circuits):
            for r in circ["rows"]:
                if r[4]:
                    count[r[4]][k] += 1
        for cat, per in count.items():
            k = max(per, key=per.get)
            ranked = sorted((r for r in circuits[k]["rows"]
                             if r[4] == cat and r[3] == "ok" and r[1]), key=lambda r: r[1])
            for rank, r in enumerate(ranked[: len(ELITE_POINTS)], start=1):
                pts = ELITE_POINTS[rank - 1] * coeff
                code = club_code(r[5])
                by_season[season].append([int(cid), r[0], cat, rank, pts, code])
                if code:
                    summary["all"][terrain][code][season] += pts
                    if cat in ELITE_CATS:
                        summary["elite"][terrain][code][season] += pts
    for season, rows in by_season.items():
        rows.sort(key=lambda x: (comps[str(x[0])][0], x[0], x[2], x[3]))
        dump(OUT / "elite" / f"{season}.json", {"rows": rows})
    dump(OUT / "elite_summary.json", {
        "points": ELITE_POINTS, "levels": sorted(ELITE_LEVELS), "cats": sorted(ELITE_CATS),
        "championship_coeff": CHAMPIONSHIP_COEFF,
        "data": {mode: {t: {code: dict(v) for code, v in per.items()} for t, per in d.items()}
                 for mode, d in summary.items()},
    })
    print(f"  elite: {sum(len(v) for v in by_season.values()):,} top-10 finishes over {len(by_season)} seasons")
    return by_season


# -- age curves ------------------------------------------------------------------
def quantiles(sorted_vals: list[int]) -> list[int]:
    a = np.asarray(sorted_vals, dtype=float)
    return [int(round(x)) for x in np.percentile(a, QUANTILES)]


def age_curves(years: list[int]) -> None:
    """CN distribution of each age category at each season's last month-end,
    so a runner's season can be placed against everyone of their category."""
    data = defaultdict(dict)
    pooled = defaultdict(lambda: defaultdict(list))
    months = {}
    for Y in years:
        attr = load(OUT / "snap" / f"attr_{Y}.json")
        for method, terrain, snap in snapshot_files(Y):
            i = len(snap["months"]) - 1
            months[str(Y)] = snap["months"][i]
            per_cat = defaultdict(list)
            for row in snap["rows"]:
                cn = row[1 + i]
                a = attr.get(str(row[0]))
                if cn and a and a[0]:
                    per_cat[a[0]].append(cn)
            key = f"{method}_{terrain}"
            out = {}
            for cat, vals in per_cat.items():
                if len(vals) >= 5:
                    vals.sort()
                    out[cat] = [len(vals), *quantiles(vals)]
                if Y >= AGE_POOL_FROM:
                    pooled[key][cat].extend(vals)
            data[key][str(Y)] = out
    for key, per_cat in pooled.items():
        data[key]["all"] = {cat: [len(v), *quantiles(sorted(v))] for cat, v in per_cat.items() if len(v) >= 5}
    dump(OUT / "agecurve.json", {"q": QUANTILES, "pool_from": AGE_POOL_FROM, "months": months, "data": data})
    print(f"  age curves: {len(data)} method/terrain series")


# -- who runs with whom ----------------------------------------------------------
def network(comps: dict) -> None:
    """For every runner, the runners met most often on the same circuit, with
    how often each finished ahead. A runner who did not finish is behind
    everyone who did; two non-finishers are level.

    Per runner: {"*": every discipline, "For": forest, "Spr": sprint, "VTT",
    "Ski"}; a discipline is "*" when it is the only one the runner raced (same
    list), and absent when they never raced it."""
    size = load(OUT / "meta.json").get("bucket", 10)
    lic_ix: dict[str, int] = {}
    lics: list[str] = []
    circ_idx, circ_place, circ_day, circ_terr = [], [], [], []
    for cid, c in comps.items():
        res = COURSES.get(cid)
        if res is None:
            continue
        day = date.fromisoformat(c[0]).toordinal()
        terrain = c[6]
        for circ in res["circuits"]:
            ix, pl = [], []
            for r in circ["rows"]:
                lic = r[0]
                if lic not in lic_ix:
                    lic_ix[lic] = len(lics)
                    lics.append(lic)
                ix.append(lic_ix[lic])
                pl.append(r[1] if r[3] == "ok" and r[1] else np.inf)
            if len(ix) > 1:
                circ_idx.append(np.asarray(ix, dtype=np.int32))
                circ_place.append(np.asarray(pl, dtype=float))
                circ_day.append(day)
                circ_terr.append(terrain)
    n = len(lics)
    member = defaultdict(list)                   # runner -> [(circuit, position)]
    for k, ix in enumerate(circ_idx):
        for p, a in enumerate(ix):
            member[int(a)].append((k, p))
    print(f"  network: {n:,} runners, {len(circ_idx):,} circuits")

    def co_runners(a: int, mem: list) -> list:
        idx = np.concatenate([circ_idx[k] for k, _ in mem])
        ahead = np.concatenate([circ_place[k] > circ_place[k][p] for k, p in mem])
        behind = np.concatenate([circ_place[k] < circ_place[k][p] for k, p in mem])
        days = np.concatenate([np.full(len(circ_idx[k]), circ_day[k]) for k, _ in mem])
        shared = np.bincount(idx, minlength=n)
        shared[a] = 0
        top = np.argsort(-shared, kind="stable")[:NET_TOP]
        top = top[shared[top] >= NET_MIN_SHARED]
        if not len(top):
            return []
        n_ahead = np.bincount(idx, weights=ahead, minlength=n)
        n_behind = np.bincount(idx, weights=behind, minlength=n)
        last = np.zeros(n, dtype=np.int64)
        np.maximum.at(last, idx, days)
        return [[lics[b], int(shared[b]), int(n_ahead[b]), int(n_behind[b]),
                 date.fromordinal(int(last[b])).isoformat()] for b in top]

    buckets = defaultdict(dict)
    for a, mem in member.items():
        both = co_runners(a, mem)
        if not both:
            continue
        out = {"*": both}
        raced = {circ_terr[k] for k, _ in mem}
        for terrain in TERRAINS:
            if raced == {terrain}:
                out[terrain] = "*"
            elif terrain in raced:
                own = co_runners(a, [m for m in mem if circ_terr[m[0]] == terrain])
                if own:
                    out[terrain] = own
        lic = lics[a]
        buckets[runner_bucket(lic, size)][lic] = out
    for bucket, rows in buckets.items():
        dump(OUT / "net" / f"{bucket}.json", rows)
    print(f"  network: {sum(len(v) for v in buckets.values()):,} runners in {len(buckets):,} files")


# -- age pyramid -----------------------------------------------------------------
PYR_FLAG = {"For": 1, "Spr": 2, "VTT": 4, "Ski": 8}    # disciplines raced, as bits: 3 = forest and sprint…


def pyramid(comps: dict) -> None:
    """The competitors of each season — anyone with a result in it, "nc" rows
    included — counted by category and club (both as at their last race of the
    season) and by the disciplines raced: rows [category, club, flags, n].
    "all" counts each competitor once over every season, as at their last race.
    Counts only, no licences: the age pyramid and the territories need nothing more.
    Also participation.json: per season, [club, terrain, competitors, results],
    each competitor under the club of their last race of the season."""
    per = defaultdict(dict)                  # season | "all" -> licence -> [date, cat, club, flags]
    results = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))   # season -> licence -> terrain -> n
    for cid, c in comps.items():
        res = COURSES.get(cid)
        if res is None:
            continue
        day, terrain, season = c[0], c[6], c[7]
        flag = PYR_FLAG[terrain]
        for circ in res["circuits"]:
            for r in circ["rows"]:
                results[season][r[0]][terrain] += 1
                for key in (season, "all"):
                    x = per[key].get(r[0])
                    if x is None:
                        per[key][r[0]] = [day, r[4], r[5], flag]
                        continue
                    x[3] |= flag
                    if day >= x[0]:
                        x[:3] = [day, r[4], r[5]]
    keep = set()
    for season, runners in per.items():
        count = defaultdict(int)
        for _day, cat, club, flags in runners.values():
            count[(cat or "", club or "", flags)] += 1
        dump(OUT / "pyramid" / f"{season}.json", {"rows": [[*k, n] for k, n in sorted(count.items())]})
        keep.add(f"{season}.json")
    prune(OUT / "pyramid", keep)
    part = {}
    for season, by_lic in results.items():
        agg = defaultdict(lambda: [0, 0])                # (club, terrain) -> [competitors, results]
        for lic, by_t in by_lic.items():
            club = per[season][lic][2] or ""
            for terrain, n in by_t.items():
                a = agg[(club, terrain)]
                a[0] += 1
                a[1] += n
        part[str(season)] = [[*k, *v] for k, v in sorted(agg.items())]
    dump(OUT / "participation.json", {"cols": ["club", "terrain", "runners", "results"], "seasons": part})
    print(f"  pyramid: {len(per) - 1} seasons, {len(per['all']):,} competitors")


# -- Coupe de France des clubs ------------------------------------------------------
# FFCO's « Classement National des Clubs » (Règlement des compétitions 2026, annexe 2): each competitor brings the sum
# of their 5 best official CN race scores of the year in foot races (forest and sprint together) and of their 5 best in
# VTT or ski, a woman's points x 1.4; a club's points are its competitors'. Applied to every season, though the cup was
# not awarded from 2023 to 2025. Not known here: who holds a « compétition » licence (every ranked runner counts) and
# which club gets a runner who changed club during the year (here: the club of their last race of the year).
CFC_BEST = 5
CFC_WOMEN = 1.4
CFC_FOOT = ("For", "Spr")


def cfc(comps: dict) -> None:
    per = defaultdict(lambda: {"foot": [], "other": [], "last": ("", None, None)})      # (season, lic) -> scores, last race
    for cid, c in comps.items():
        res = COURSES.get(cid)
        if res is None or c[6] not in TERRAINS:
            continue
        season, day, foot = str(c[7]), c[0], c[6] in CFC_FOOT
        for circ in res["circuits"]:
            for r in circ["rows"]:
                if r[3] == "nc" or r[6] is None:
                    continue
                p = per[(season, r[0])]
                (p["foot"] if foot else p["other"]).append(r[6])
                if day >= p["last"][0]:
                    p["last"] = (day, (r[5] or "")[:4], (r[4] or "")[:1])
    clubs = defaultdict(lambda: defaultdict(lambda: [0.0, 0, 0.0, 0.0, 0.0]))         # club -> season -> [pts, n, foot, other, women]
    for (season, lic), p in per.items():
        _, club, sex = p["last"]
        if not club or not club.isdigit():
            continue
        f = sum(sorted(p["foot"], reverse=True)[:CFC_BEST])
        o = sum(sorted(p["other"], reverse=True)[:CFC_BEST])
        k = CFC_WOMEN if sex == "D" else 1.0
        if not f + o:
            continue
        a = clubs[club][season]
        a[0] += (f + o) * k
        a[1] += 1
        a[2] += f * k
        a[3] += o * k
        if sex == "D":
            a[4] += (f + o) * k
    out = defaultdict(dict)
    seasons = sorted({s for d in clubs.values() for s in d})
    for s in seasons:
        ranked = sorted(((code, d[s]) for code, d in clubs.items() if s in d), key=lambda x: -x[1][0])
        for i, (code, a) in enumerate(ranked):
            out[code][s] = [i + 1, round(a[0]), a[1], round(a[2]), round(a[3]), round(a[4])]
    dump(OUT / "cfc.json", {"seasons": seasons, "best": CFC_BEST, "women": CFC_WOMEN, "cols": ["rank", "points", "runners", "foot", "other", "women"],
                            "clubs": out})
    print(f"  cfc: {len(out)} clubs, {len(seasons)} seasons")


# -- validation ------------------------------------------------------------------
VAL_METHODS = ("official", "fair", "top6w")
VAL_CNJ15 = (7, 9, 11)                       # c/ row columns: each method's CN 15 days before the race
VAL_GROUPS = {"J": lambda a: a <= 20, "V": lambda a: a >= 55}     # juniors, 55 and over — against the 21s
VAL_SEASON = "2025"                          # the reference season: complete, so built once per method change


def validation(comps: dict) -> None:
    """The yardstick every method change was judged by: for each pair of finishers
    on a circuit, does the higher CN 15 days before the race predict who finished
    ahead? All methods on the same pairs (both runners hold a CN in each), per
    terrain and season: "all" races, and "nat" (championnats de France, national
    races) alone. "bias": over pairs of a junior (J) or a 55+ runner (V) and a
    21, the share where that runner finished ahead and where each method put
    them ahead - a method that over- or under-rates a group shows here.
    Only VAL_SEASON, and only when the file is missing: its results are final, so
    the figures change only with a method (update.migrate deletes the file)."""
    if (OUT / "validation.json").exists():
        return
    nm = len(VAL_METHODS)
    acc = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0] * (1 + nm))))   # [pairs, right per method]
    bias = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0] * (2 + nm))))  # [pairs, ahead, pred per method]
    for cid, c in comps.items():
        res = COURSES.get(cid)
        if res is None:
            continue
        terrain, season = c[6], str(c[7])
        if season != VAL_SEASON:
            continue
        scopes = ("all", "nat") if title_weight(c[1]) > 1 else ("all",)
        for circ in res["circuits"]:
            rows = [r for r in circ["rows"] if r[3] == "ok" and r[2] and all(r[k] for k in VAL_CNJ15)]
            if len(rows) < 2:
                continue
            t = np.array([r[2] for r in rows], dtype=float)
            cn = [np.array([r[k] for r in rows], dtype=float) for k in VAL_CNJ15]
            iu = np.triu_indices(len(rows), 1)
            dt = np.sign(t[iu[0]] - t[iu[1]])             # -1: the first finished ahead
            keep = dt != 0
            dt = dt[keep]
            right = [int(np.sum(np.sign(x[iu[0]] - x[iu[1]])[keep] == -dt)) for x in cn]
            for s in scopes:
                a = acc[terrain][s][season]
                a[0] += len(dt)
                for i in range(nm):
                    a[1 + i] += right[i]
            # group bias: pairs of one runner of the group and one 21
            age = np.array([int(m.group(1)) if (m := re.match(r"^[HD](\d+)$", r[4] or "")) else -1 for r in rows])
            for g, inside in VAL_GROUPS.items():
                gi, ai = np.vectorize(inside)(age) & (age >= 0), age == 21
                if not gi.any() or not ai.any():
                    continue
                pairs = [(i, j) for i in np.flatnonzero(gi) for j in np.flatnonzero(ai) if t[i] != t[j]]
                if not pairs:
                    continue
                i, j = np.array(pairs).T
                b = bias[terrain][g][season]
                b[0] += len(pairs)
                b[1] += int(np.sum(t[i] < t[j]))
                for k, x in enumerate(cn):
                    b[2 + k] += int(np.sum(x[i] > x[j]))
    dump(OUT / "validation.json", {
        "season": VAL_SEASON, "methods": list(VAL_METHODS), "lag_days": 15,
        "acc": {t: {s: dict(sorted(v.items())) for s, v in d.items()} for t, d in acc.items()},
        "bias": {t: {g: dict(sorted(v.items())) for g, v in d.items()} for t, d in bias.items()},
    })
    print(f"  validation: {sum(v[0] for d in acc.values() for v in d['all'].values()):,} pairs")


def main(out: Path | None = None) -> None:
    global OUT, COURSES
    if out is not None:
        OUT = out
    COURSES = Courses(OUT)                      # the competitions' results (c/), read a group at a time
    t0 = time.monotonic()
    meta = load(OUT / "meta.json")
    years = meta["seasons"]
    comps = load(OUT / "competitions.json")["rows"]
    print("extras:")
    # France's own (meta `country`, build_site --country): FFCO's elite levels, the Coupe de France des clubs, the methods
    # measured against the official CN on France's seasons; another country's are its own study's
    fr = meta.get("country", "FR") == "FR"
    elite_rows = elite(comps) if fr else {}
    club_files(years, elite_rows)
    age_curves(years)
    network(comps)
    pyramid(comps)
    most_races(years)
    if fr:
        validation(comps)
        cfc(comps)
        import site_eval
        site_eval.evaluation(comps, out=OUT)
    import site_ask
    try:                                        # « IA »'s tables: never a reason for the site's update to fail
        site_ask.build(OUT)
    except Exception as e:
        print(f"  ask: not built ({e})")
    print(f"extras done in {time.monotonic() - t0:.0f}s")


if __name__ == "__main__":
    main()
