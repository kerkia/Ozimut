"""« Tous les pays »: every country's competitions in one agenda (owner, 2026-11-21: « the agenda is missing a lot of major
competitions from outside France… adding a "all countries" to the list of countries, at the top with the home country and WRE »).

Not a country but listed as one, as « IOF WRE » is (code XA, ISO 3166's user-assigned range). Run after every other country's
agenda and the WREs' (countries.modules: last), it writes two files under site/data/xa/:

- agenda.json — every country's agenda rows (their own calendars as Ozimut read them today, each row with its `country`), the
  WREs that no host country's list holds (countries/wre.py, a row of their host's), and the competitions of OrienteeringOnline
  (countries/oonline.py, its « All countries » search) that no country's list holds. A row keeps what the list, the map and
  the calendar show and the details' main lines; the long texts (observations, access, contacts, the entries by circuit) stay
  in the country's own file, which the page reads when a row is chosen.
- extra.json — those OrienteeringOnline competitions alone, which the Agenda page adds to their country's own list (as the
  WREs are), and from which a country whose calendar Ozimut cannot read gets a list (the Netherlands, Hungary, Portugal…);
  `pages`: each competition's page as read (its last day, place, organiser, website, entry deadline), read once.

World of O's calendar (worldofo.com), the other complete one, answers robots with a Cloudflare challenge (checked
2026-11-21): not read, as no site that screens robots is.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import paths
from countries import agenda, oonline, wre
from countries.base import Country

COUNTRY = Country(code="XA", federation="", access="all", db=paths.DATA_DIR / "xa.sqlite3", lang="en", results=False)
AGENDA_VERSION = 1
# an agenda row's fields left to the country's own file (the details read it): long texts and what only France's has
HEAVY = {"obs", "email", "contact", "phone", "access", "flechage", "referee", "referee2", "controller", "delegate", "monitor",
         "extra"}
MAX_PAGES = 300                        # OrienteeringOnline's competition pages read in one run (the first: ~150)
SOURCES = {"oo": "OrienteeringOnline", "iof": "IOF World Ranking", "eventor": "IOF Eventor"}


def agenda_path(root: Path) -> Path:
    return COUNTRY.data_dir(root) / "agenda.json"


def extra_path(root: Path) -> Path:
    return COUNTRY.data_dir(root) / "extra.json"


def agenda_current(root: Path) -> bool:
    try:
        return json.loads(agenda_path(root).read_text(encoding="utf-8")).get("v") == AGENDA_VERSION and extra_path(root).exists()
    except (OSError, ValueError):
        return False


def _load(p: Path) -> dict | None:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _countries(root: Path) -> list[tuple[str, dict]]:
    """Every country's agenda file as written today (« IOF WRE » and this one apart)."""
    import countries
    out = []
    for m in countries.modules():
        code = m.COUNTRY.code
        if code in ("XA", wre.COUNTRY.code) or not hasattr(m, "agenda_path"):
            continue
        a = _load(m.agenda_path(root))
        if a and a.get("events"):
            out.append((code, a))
    return out


def _links(e: dict) -> str:
    return " ".join(str(v) for v in [e.get("site"), (e.get("reg") or {}).get("url"), *(e.get("src") or {}).values()] if v)


def match(c: dict, rows: list[dict]) -> dict | None:
    """A country's own row of an OrienteeringOnline competition: one that links its page, else a row of that day (or
    spanning it) whose name shares the most words with the competition's (one at least)."""
    tag = f"CompetitionID={c['id']}"
    for e in rows:
        if tag in _links(e):
            return e
    best, n = None, 0
    ws = wre.words(c["name"])
    for e in rows:
        if not e.get("date") or not (e["date"] <= c["date"] <= (e.get("end") or e["date"])):
            continue
        k = len(ws & wre.words(e.get("name")))
        if k > n:
            best, n = e, k
    return best


def _place(cc: str, e: dict) -> dict:
    """An added row placed in its country's regions (when Ozimut has its places) and on the map: the town of its place or
    of its name, else its country's centre."""
    from countries import places
    if (places.DIR / f"{cc.lower()}.json.gz").exists():
        agenda.locate(cc, e)
    # coordinates written in the place (« Altgralla - Waterpowerstation Eastside - 46.829007, 15.567640 »)
    m = re.search(r"(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})", e.get("place") or "")
    if m and -90 <= float(m.group(1)) <= 90 and -180 <= float(m.group(2)) <= 180:
        e["gps"] = [round(float(m.group(1)), 5), round(float(m.group(2)), 5)]
        return e
    _place_only(cc, e)
    return e


def _place_only(cc: str, e: dict) -> None:
    pos = None
    for text in (e.get("place"), e.get("name")):
        if text and not agenda.abroad_of(cc, text):
            p = wre.position(cc, text)
            if p and len(p) == 2:
                pos = p
                break
            pos = pos or p
    if pos:
        e["pos"] = pos


def slim(e: dict, cc: str) -> dict:
    out = {k: v for k, v in e.items() if k not in HEAVY}
    out["country"] = e.get("country") or cc
    if isinstance(out.get("reg"), dict) and "circuits" in out["reg"]:
        out["reg"] = {k: v for k, v in out["reg"].items() if k != "circuits"}
    return out


def refresh_agenda(root: Path, today: date | None = None) -> bool:
    from countries.http import Http
    today = today or date.today()
    since = (today - timedelta(days=agenda.BACK_DAYS)).isoformat()
    prev_extra = _load(extra_path(root)) or {}
    pages = {k: v for k, v in (prev_extra.get("pages") or {}).items() if (v.get("end") or v.get("date") or "") >= since}
    own = _countries(root)
    rows_of = {cc: list(a["events"]) for cc, a in own}
    w = _load(wre.agenda_path(root)) or {}
    for x in w.get("events") or []:                      # (a WRE no host's list holds is its host's row here)
        if not x.get("same") and x.get("host"):
            rows_of.setdefault(x["host"], []).append(x)

    # ---- OrienteeringOnline's competitions no country's own list has
    with Http(pause=1.0, lang="en") as http:
        oo = oonline.read_world(http, today)
        extra, read = [], 0
        if oo is None:                                   # (the platform down: yesterday's)
            print("agenda XA: OrienteeringOnline did not answer — its competitions as last read")
            extra = [e for e in prev_extra.get("events") or [] if (e.get("end") or e["date"]) >= since]
        else:
            for c in oo:
                cc = c["cc"]
                if not cc or match(c, rows_of.get(cc, [])):
                    continue
                f = pages.get(c["id"])
                if not f or f.get("date") != c["date"]:
                    if read >= MAX_PAGES:
                        f = {}
                    else:
                        f = {**oonline.page_fields(http, c["id"]), "date": c["date"]}
                        read += 1
                        pages[c["id"]] = f
                extra.append(_place(cc, oonline.row(cc, c, f, id_=f"oo{c['id']}")))
        n = http.requests
    extra = [e for e in extra if (e.get("end") or e["date"]) >= since]
    extra.sort(key=lambda e: (e["date"], e.get("country") or "", e.get("name") or ""))

    # ---- the world's list: every country's rows, the WREs no host's list holds, OrienteeringOnline's others
    wre_of = {str(x["same"]): x for x in w.get("events") or [] if x.get("same")}
    events, sources, specs = [], dict(SOURCES), set()
    for cc, a in own:
        sources.update(a.get("sources") or {})
        for e in a["events"]:
            if (e.get("end") or e.get("date") or "") < since:
                continue
            r = slim(e, cc)
            x = wre_of.get(str(e.get("id")))
            if x is not None:                            # (as the Agenda page marks it in its host's list)
                r.update({"wre": True, **({"wc": True} if x.get("wc") else {})})
                r["src"] = {**(r.get("src") or {}), **{k: v for k, v in (x.get("src") or {}).items() if k in ("iof", "eventor")}}
            events.append(r)
    for x in w.get("events") or []:
        if not x.get("same") and x.get("host") and (x.get("end") or x["date"]) >= since:
            events.append({**slim(x, x["host"]), "country": x["host"]})
    events += [slim(e, e["country"]) for e in extra]
    for e in events:                                     # (a calendar without places: a town of its row, else its country's centre)
        if not e.get("pos") and not e.get("gps") and e.get("country"):
            _place_only(e["country"], e)
    for e in events:
        if e.get("spec"):
            specs.add(e["spec"])
    events.sort(key=lambda e: (e.get("date") or "", e.get("country") or "", e.get("name") or ""))

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new_extra = {"v": AGENDA_VERSION, "country": "XA", "from": since, "generated": now, "sources": {"oo": SOURCES["oo"]},
                 "hosts": sorted({e["country"] for e in extra}), "events": extra, "pages": pages}
    new = {"v": AGENDA_VERSION, "country": "XA", "from": since, "generated": now, "specs": sorted(specs), "depts": {},
           "regions": [], "sources": sources, "countries": sorted({e["country"] for e in events}), "events": events}
    changed = False
    for p, doc, prev in ((extra_path(root), new_extra, prev_extra), (agenda_path(root), new, _load(agenda_path(root)))):
        # (the positions are this file's own, written with it: compared too)
        if prev and {k: v for k, v in prev.items() if k != "generated"} == {k: v for k, v in doc.items() if k != "generated"}:
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        changed = True
    print(f"agenda XA: {len(events)} events of {len(new['countries'])} countries; OrienteeringOnline "
          f"{len(oo or [])} competitions, {len(extra)} added to their country's list ({read} pages read, {n} requests)")
    return changed
