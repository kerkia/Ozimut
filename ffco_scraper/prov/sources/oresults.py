"""OResults (oresults.eu): a live results service MeOS, OE and SiTiming feed (« Résultats (provisoires) » on Balise 77's
site for Larchant, 15 November 2026; Burgundy's, Provence's and Jura's clubs use it too, Central Europe most). Read the way
its own public pages read it (no login, no key; no robots.txt, 2026-11-16), none of its code used:

    https://api.oresults.eu/events          every listed event (JSON, ~160 KB): id, name, organizer / organization.name,
                                            date (UTC), timezone, place, countryCode, isRelay, hasResults, hasStartList,
                                            hasSplits, splitsPublicFrom, resultsPublicFrom
    https://api.oresults.eu/events/<id>     one event, as above
    https://cdn.oresults.eu/events/<id>/changes?since=0
                                            the event's data (its pages poll it every 2 s with `since` = lastChangeId):
                                            classes (id, name, length, climb), runners (id, className, name, club,
                                            cardNum, startNum, startTime, finishTime — epoch ms —, resultStatus), the
                                            radio punches, lastChangeId
    https://api.oresults.eu/events/<id>/splits[/<classId>]
                                            the split tables, once the organiser makes them public (else 401: never
                                            asked around — an organiser keeping them back is respected): columns (control
                                            codes, the finish last with code null), each runner's cells (cumMs)
    https://oresults.eu/events/<id>         the page people open

An event is one race. Its classes are circuits (« BLANC », « VIOLET LONG ») or categories, as the organiser's software made
them: by « unknown », the build decides. Relays (isRelay) are not read. Runners still out, not started yet or finished but
not yet read are left out and counted in the document's `live`.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..model import category, doc, klass, live_state, runner

API = "https://api.oresults.eu"
CDN = "https://cdn.oresults.eu"
PAGE = "https://oresults.eu/events"

STATUS = {"OK": "ok", "MissingPunch": "mp", "DidNotFinish": "dnf", "Disqualified": "dsq", "OverTime": "ot",
          "DidNotStart": "dns", "NotCompeting": "nc", "SportingWithdrawal": "dnf", "Cancelled": "dns", "DidNotEnter": "dns"}
OUT = {"Active", "Inactive", "Finished", "", None}     # out, not started yet, finished but not read: not listed yet
NOT_LISTED = {"Moved", "MovedUp", "DidNotEnter", "Cancelled"}


def _zone(e: dict) -> ZoneInfo:
    try:
        return ZoneInfo(e.get("timezone") or "Europe/Paris")
    except Exception:
        return ZoneInfo("Europe/Paris")


def local_day(e: dict) -> str | None:
    """The event's day where it is run (its date is UTC)."""
    try:
        t = datetime.fromisoformat((e.get("date") or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return t.astimezone(_zone(e)).date().isoformat()


def organiser(e: dict) -> str:
    return ((e.get("organization") or {}).get("name") or e.get("organizer") or "").strip()


def _secs(ms, zone: ZoneInfo) -> float | None:
    """Epoch milliseconds -> seconds after the local midnight of that day."""
    if not isinstance(ms, (int, float)) or ms <= 0:
        return None
    t = datetime.fromtimestamp(ms / 1000, timezone.utc).astimezone(zone)
    return t.hour * 3600 + t.minute * 60 + t.second + t.microsecond / 1e6


def _public(at: str | None) -> bool:
    if not at:
        return False
    try:
        return datetime.fromisoformat(at.replace("Z", "+00:00")) <= datetime.now(timezone.utc)
    except ValueError:
        return False


def to_doc(e: dict, data: dict, splits: dict | None = None, startlist: bool = False) -> dict | None:
    """The changes payload as a model.doc (kind « oresults »); splits: {classId: split table} when published. startlist:
    the runners with a start time, status « start », kind « startlist » (None when fewer than two start times)."""
    zone = _zone(e)
    now = datetime.now(timezone.utc).timestamp() * 1000
    by_class: dict[str, list] = {}
    for x in data.get("runners") or []:
        by_class.setdefault(x.get("className") or "", []).append(x)
    out_n, nxt, last, starts, classes = 0, None, None, set(), []
    for c in data.get("classes") or []:
        name = c.get("name") or ""
        table = (splits or {}).get(c.get("id")) or {}
        codes = [str(k["code"]) for k in table.get("columns") or [] if k.get("code") is not None]
        cells = {r.get("runnerId"): r.get("cells") or [] for r in table.get("rows") or []}
        rows = []
        for x in by_class.get(name, []):
            raw = x.get("resultStatus")
            st0, fin = x.get("startTime"), x.get("finishTime")
            if raw in NOT_LISTED:
                continue
            st = STATUS.get(raw)
            if raw == "OK" and not fin:
                st = None                                   # (OK, no finish yet: still out)
            if st is None:
                if startlist:
                    st = "start"
                else:
                    out_n += 1
                    if isinstance(st0, (int, float)) and st0 > now:
                        nxt = min(nxt, _secs(st0, zone)) if nxt is not None else _secs(st0, zone)
                    continue
            elif startlist and st == "dns":
                continue
            elif startlist:
                st = "start"
            t = (fin - st0) / 1000 if st == "ok" and isinstance(fin, (int, float)) and isinstance(st0, (int, float)) and fin > st0 else None
            if st == "ok" and isinstance(fin, (int, float)):
                last = max(last or 0, _secs(fin, zone) or 0)
            sp = None
            if codes and not startlist:
                cs = cells.get(x.get("id")) or []
                sp = [(k.get("cumMs") / 1000 if isinstance(k.get("cumMs"), (int, float)) and not k.get("missing") else None)
                      for k in cs[:len(codes)]]
                sp = sp + [None] * (len(codes) - len(sp)) if any(v is not None for v in sp) else None
            start = _secs(st0, zone)
            if start is not None:
                starts.add(start)
            rows.append(runner(x.get("name") or "", club=(x.get("club") or "").strip() or None, time_s=t, status=st,
                               category=category(name) or None, bib=str(x["startNum"]) if x.get("startNum") else None,
                               splits=sp, start_s=start, card=str(x["cardNum"]) if x.get("cardNum") else None))
        if not startlist:
            ok = sorted(r["time_s"] for r in rows if r["status"] == "ok" and r["time_s"] is not None)
            for r in rows:
                if r["status"] == "ok" and r["time_s"] is not None:
                    r["place"] = ok.index(r["time_s"]) + 1
            rows.sort(key=lambda r: (r["place"] is None, r["place"] or 0, r["name"]))
        else:
            rows.sort(key=lambda r: (r["start_s"] is None, r["start_s"] or 0, r["name"]))
        classes.append(klass(name, rows, controls=codes or None, length_m=c.get("length") or None, climb_m=c.get("climb") or None))
    if startlist and len(starts) < 2:
        return None
    d = doc("oresults", classes, by="unknown", title=(e.get("name") or "").strip() or None, date=local_day(e))
    if startlist:
        d["kind"] = "startlist"
    elif live := live_state(out_n, nxt, last):
        d["live"] = live
    return d if d["classes"] else None


def splits_public(e: dict) -> bool:
    """The event's split times are shown to anyone: the organiser set the day they become public, and it is past."""
    return bool(e.get("hasSplits")) and _public(e.get("splitsPublicFrom"))


class OResults:
    """OResults' public events (ids: its numbers), read as documents of kind « oresults »."""

    def __init__(self, fetcher):
        self.f = fetcher
        self._all: list | None = None
        self._events: dict[int, dict] = {}
        self._data: dict[int, bytes] = {}

    def _json(self, url: str, conditional: bool = False):
        a = self.f.get(url, conditional=conditional)
        if a.status != 200:
            return None
        try:
            return json.loads(a.content)
        except ValueError:
            return None

    def events(self) -> list[dict]:
        if self._all is None:
            rows = self._json(f"{API}/events")
            self._all = [e for e in rows if isinstance(e, dict) and e.get("id")] if isinstance(rows, list) else []
            for e in self._all:
                self._events[e["id"]] = e
        return self._all

    def competitions(self, country: str = "FR", lo: str | None = None, hi: str | None = None) -> list[dict]:
        """[{id, name, organizer, date}] of a country's individual events with results or a start list, from lo to hi."""
        out = []
        for e in self.events():
            day = local_day(e)
            if e.get("countryCode") != country or e.get("isRelay") or not day or not (e.get("hasResults") or e.get("hasStartList")):
                continue
            if (lo and day < lo) or (hi and day > hi):
                continue
            name = (e.get("name") or "").strip()
            place = (e.get("place") or "").strip()
            out.append({"id": e["id"], "name": f"{name} {place}" if place and place.lower() not in name.lower() else name,
                        "organizer": organiser(e), "date": day})
        return out

    def event(self, eid: int) -> dict | None:
        eid = int(eid)
        if eid not in self._events:
            e = self._json(f"{API}/events/{eid}")
            if not isinstance(e, dict) or e.get("id") != eid:
                return None
            self._events[eid] = e
        return self._events[eid]

    def resolve(self, url: str) -> int | None:
        m = re.search(r"oresults\.eu/events/(\d+)", url or "")
        return int(m[1]) if m else None

    def _changes(self, eid: int, conditional: bool):
        a = self.f.get(f"{CDN}/events/{eid}/changes?since=0", conditional=conditional)
        if a.status == 200:
            self._data[eid] = a.content
        return a

    def fingerprint(self, eid) -> str | None:
        """The data's hash and whether its split times are public yet: unchanged when nothing moved."""
        e = self.event(eid)
        if not e:
            return None
        a = self._changes(int(eid), True)
        if a.status not in (200, 304) or not a.sha:
            return None
        return f"{a.sha}:{int(splits_public(e))}"

    def read(self, eid, startlist: bool = False) -> dict | None:
        eid = int(eid)
        e = self.event(eid)
        if not e or e.get("isRelay"):
            return None
        body = self._data.get(eid)
        if body is None:
            a = self._changes(eid, False)
            body = a.content if a.status == 200 else None
        try:
            data = json.loads(body) if body else None
        except ValueError:
            data = None
        if not isinstance(data, dict):
            return None
        e = {**e, **(data.get("event") or {})}
        splits = None
        if not startlist and splits_public(e):
            # published split times only (an organiser keeping them back answers 401: never asked around)
            lst = self._json(f"{API}/events/{eid}/splits")
            if isinstance(lst, dict):
                splits = {}
                for c in lst.get("classes") or []:
                    if self.f.out_of_time():
                        return None                         # never a part of an event: the next run reads it whole
                    t = self._json(f"{API}/events/{eid}/splits/{c['id']}") if c.get("id") and not c.get("leg") else None
                    if isinstance(t, dict):
                        splits[c["id"]] = t
        return to_doc(e, data, splits, startlist)
