"""OrienteeringOnline.net, the entry platform of the Balkans and the Caucasus: the agenda of a country whose federation
publishes no calendar of its own that Ozimut can read (Croatia's is a PDF, North Macedonia's and Georgia's none).

Its competition search (studied 2026-10-23), the form the page itself posts: one GET for the form's state, then a POST
with the country and a window of dates — date, name, the number of entries, the competition's page. The list shows
30 rows at most: a window that fills it is cut in two. Each competition's page gives its last day, organiser, place,
website and entry deadline (an e-mail too, never kept): read once, when the competition is first seen. Only the
competitions taking entries there are listed: a part of each country's calendar.

Every country's (owner, 2026-11-21: « complete the international agenda »): `read_world` searches « All countries » at once
(the list then gives each competition's country); countries/world.py adds those no country's own list has — about 200 a year,
the Balkans, Germany, Italy, the Netherlands, Hungary, Portugal… — to « Tous les pays » and to their country's list.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta, timezone

from countries import agenda

BASE = "https://www.orienteeringonline.net/"
SEARCH = BASE + "CompetitionSearch.aspx"
EVENT = BASE + "CompetitionBasicInfo.aspx?CompetitionID={}"
F = "ctl00$ctl00$PH_Main$PH_Lg$"
ROWS = 30                                           # (the list's page)
OFF = re.compile(r"\s*[-–]?\s*\b(otkazano|odgođeno|cancell?ed|postponed)\b(?:\s*/\s*\w+)?", re.I)
TRAINING = re.compile(r"\b(training|trening|camp|kamp)\b", re.I)


def _form(content: bytes) -> dict:
    from lxml import html as lh
    doc = lh.fromstring(content.decode("utf-8", "replace"))
    return {i.get("name"): i.get("value") or "" for i in doc.cssselect("input")
            if i.get("name") and (i.get("type") or "text") in ("hidden", "text")}


def _ms(d: date) -> str:
    return str(int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp() * 1000))


def search(http, country: int, lo: date, hi: date, state: dict, depth: int = 0) -> list[dict]:
    """The competitions of a country between two days: [{id, date, name, entries}]. `state`: the form's fields, kept
    from one answer to the next (ASP.NET's view state)."""
    from lxml import html as lh
    form = dict(state)
    form.update({"ctl00_ctl00_PH_Main_PH_Lg_CountryComboBox_VI": str(country),
                 F + "FromDateEdit": lo.strftime("%d.%m.%Y"), F + "ToDateEdit": hi.strftime("%d.%m.%Y"),
                 # (the date pickers' own state: without it the search starts today)
                 F + "FromDateEdit$State": json.dumps({"rawValue": _ms(lo)}),
                 F + "ToDateEdit$State": json.dumps({"rawValue": _ms(hi)}), F + "SearchButton": "Search"})
    a = http.post(SEARCH, data=form)
    if a.status != 200:
        return []
    state.update(_form(a.content))
    out = []
    for link in lh.fromstring(a.content.decode("utf-8", "replace")).cssselect('a[href*="CompetitionBasicInfo.aspx?CompetitionID="]'):
        tr = next((p for p in link.iterancestors("tr")), None)
        cells = [re.sub(r"\s+", " ", td.text_content()).strip() for td in tr.cssselect("td")] if tr is not None else []
        d = re.fullmatch(r"(\d\d)\.(\d\d)\.(\d{4})", cells[0]) if cells else None
        cid = re.search(r"CompetitionID=(\d+)", link.get("href") or "")
        if d and cid:
            out.append({"id": cid.group(1), "date": f"{d.group(3)}-{d.group(2)}-{d.group(1)}",
                        "name": link.text_content().strip() or cells[3],
                        "country": cells[1] if len(cells) > 1 else "",
                        "entries": int(cells[-1]) if cells[-1].isdigit() else None})
    if len(out) >= ROWS and depth < 5 and hi > lo:           # (a full page: the rest is on the next one)
        mid = lo + (hi - lo) / 2
        return search(http, country, lo, mid, state, depth + 1) + search(http, country, mid + timedelta(days=1), hi, state, depth + 1)
    return out


def info(http, cid: str) -> dict:
    """A competition's page: its labelled fields ({"Start date": "07.11.2026", "Organizer": …, "Competition website": …})."""
    from lxml import html as lh
    a = http.get(EVENT.format(cid))
    if a.status != 200:
        return {}
    out = {}
    for item in lh.fromstring(a.content.decode("utf-8", "replace")).cssselect(".new-basic-info-read-item"):
        k, v = item.cssselect("span"), item.cssselect("strong")
        if k and v:
            href = v[0].cssselect("a")
            out[k[0].text_content().strip()] = (v[0].text_content().strip(), href[0].get("href") if href else None)
    return out


def _day(s: str | None) -> str | None:
    d = re.findall(r"(\d\d)\.(\d\d)\.(\d{4})", s or "")
    return f"{d[-1][2]}-{d[-1][1]}-{d[-1][0]}" if d else None


def page_fields(http, cid: str) -> dict:
    """What a competition's page adds to the list: {end, place, org, site, close, entries} (entries: does it take its entries
    on the platform)."""
    page = info(http, cid)
    got = {k: v for k, (v, _) in page.items()}
    site = page.get("Competition website", (None, None))
    return {"end": _day(got.get("End date")), "close": _day(got.get("Entry dates")),
            "place": got.get("Location (city, area, ...)") or None, "org": got.get("Organizer") or None,
            "site": next((u for u in (site[1], site[0]) if u and u.startswith("http")), None),
            "entries": got.get("Use our online entries system", "Yes") != "No"}


def row(cc: str, c: dict, f: dict, id_=None) -> dict:
    """A competition of the list (`c`) and of its page (`f`, page_fields) as an agenda row of country `cc`."""
    name = c["name"]
    cancelled = bool(OFF.search(name))
    name = OFF.sub("", name).strip(" -–") or name
    url = EVENT.format(c["id"])
    reg = {k: v for k, v in (("url", url), ("close", f.get("close")), ("count", c.get("entries"))) if v is not None}
    return agenda.event(
        cc, id_ if id_ is not None else c["id"], c["date"], name, kind="e" if TRAINING.search(name) else "c", end=f.get("end"),
        place=f.get("place"), org=f.get("org"), site=f.get("site"), cancelled=cancelled, reg=reg if f.get("entries") else None,
        src={"oo": url})


def kept_fields(old: dict) -> dict:
    """page_fields as an earlier day's row of the agenda keeps them (its page not read again)."""
    return {"end": old.get("end"), "place": old.get("place"), "org": old.get("org"), "site": old.get("site"),
            "close": (old.get("reg") or {}).get("close"), "entries": bool(old.get("reg"))}


def read_country(cc: str, country: int, http, today: date, prev: dict | None) -> list[dict]:
    """A country's agenda from the platform: the window's competitions, each one's page read when first seen."""
    lo, hi = today - timedelta(days=agenda.BACK_DAYS), today + timedelta(days=366)
    a = http.get(SEARCH)
    if a.status != 200:
        return []
    known = {e["id"]: e for e in (prev or {}).get("events", [])}
    out = []
    for c in search(http, country, lo, hi, _form(a.content)):
        old = known.get(f"{cc.lower()}{c['id']}")
        # (its page read on an earlier day)
        f = kept_fields(old) if old and old.get("date") == c["date"] else page_fields(http, c["id"])
        out.append(row(cc, c, f))
    return out


# the platform's countries (its search's own list, 2026-11-21) -> ISO 3166-1 alpha-2
ISO = {
    "Albania": "AL", "Algeria": "DZ", "Andorra": "AD", "Australia": "AU", "Austria": "AT", "Azerbaijan": "AZ", "Belarus": "BY",
    "Belgium": "BE", "Bosnia and Herzegovina": "BA", "Brazil": "BR", "Bulgaria": "BG", "China": "CN", "Colombia": "CO",
    "Croatia": "HR", "Cyprus": "CY", "Czech Republic": "CZ", "Czechia": "CZ", "Denmark": "DK", "Ecuador": "EC", "Egypt": "EG",
    "Estonia": "EE", "Finland": "FI", "France": "FR", "Georgia": "GE", "Germany": "DE", "Greece": "GR", "Greenland": "GL",
    "Guatemala": "GT", "Hong Kong S.A.R., China": "HK", "Hungary": "HU", "Iceland": "IS", "Ireland": "IE", "Israel": "IL",
    "Italy": "IT", "Japan": "JP", "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU", "Macedonia": "MK",
    "North Macedonia": "MK", "Malaysia": "MY", "Mauritius": "MU", "Moldova": "MD", "Montenegro": "ME", "Netherlands": "NL",
    "New Caledonia": "NC", "New Zealand": "NZ", "North Korea": "KP", "Poland": "PL", "Portugal": "PT", "Romania": "RO",
    "Serbia": "RS", "Slovakia": "SK", "Slovenia": "SI", "South Africa": "ZA", "Spain": "ES", "Sweden": "SE",
    "Switzerland": "CH", "Turkey": "TR", "Türkiye": "TR", "Uganda": "UG", "Ukraine": "UA", "United States": "US"}


def read_world(http, today: date) -> list[dict] | None:
    """Every country's competitions on the platform over the agenda's window (its search for « All countries »: about 200 a
    year in 2026, ~20 requests): [{id, date, name, cc, entries}], `cc` None for a country not in ISO. None when the platform
    did not answer."""
    lo, hi = today - timedelta(days=agenda.BACK_DAYS), today + timedelta(days=366)
    a = http.get(SEARCH)
    if a.status != 200:
        return None
    got = search(http, 0, lo, hi, _form(a.content))
    seen, out = set(), []
    for c in got:
        if c["id"] not in seen:
            seen.add(c["id"])
            out.append({**c, "cc": ISO.get(c.get("country") or "")})
    return out


SOURCES = {"oo": "OrienteeringOnline"}
