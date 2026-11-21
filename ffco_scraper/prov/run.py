"""One run of the provisional-results pilot: look at the races due, keep what was found, rebuild the admin's files.

    python -m ffco_scraper.prov --db <db> --out site/data [--days 31] [--budget 600]

update.py calls run() at each hourly run (a few minutes at most). The output, site/data/prov/ (index.json and
one <race key>.json per race), is served to administrators only (functions/_middleware.js).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import logging
import re
import time
import urllib.parse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

import privacy
from ..agenda import LIGUES, OUTRE_MER, REGIONS
from . import clubdir, model, races, store
from .compute import Scorer
from .fetch import Fetcher
from .match import Matcher
from .model import plain
from .sources.clubsite import ClubSite, address_other_day, download_url, other_day, other_day_named, other_year, uploaded_before
from .sources.heyries import BASE as HY_BASE, Heyries
from .sources.helga import BASE as HG_BASE, Helga
from .sources import broadcast, declared, upload
from .sources.liveresultat import API as LR_API, LiveResultat
from .sources.meosdjango import MeOSDjango, is_meosdjango
from .sources.olive import BASE as OL_BASE, OLive
from .sources.sportident import PAGE as SI_PAGE, SportIdent
from .sources.oresults import PAGE as OR_PAGE, OResults
from .sources.oreplay import OReplay
from .parsers import VERSION as PARSER_VERSION, coursedata
from .sources.winsplits import BASE as WS_BASE, WinSplits

log = logging.getLogger(__name__)
KEEP_DAYS = 65                  # races kept and matched to the platforms' competitions: a few days beyond the list
SHOW_DAYS = 60                  # races listed on « Récemment » (its text says so; 30 until 2026-10-08)
# Start lists (2026-10-10): the races of the next START_DAYS days whose liveresultat competition already lists its
# runners and their start times (organisers load them a few days before), read again every START_EVERY hours.
START_DAYS = 7
START_EVERY = 6
STARTLIST = "liste de départ (liveresultat)"
PLATFORM_STARTLIST = "liste de départ ({})"         # (MeOSDjango, Orientation Data)
SITE_STARTLIST = "liste de départ (site de l'organisateur)"
MAYBE = " (à vérifier)"                   # (clubsite: a file found on the race's page that says nothing of itself)
START_SITES = 8                 # organisers' sites searched for start lists per run (the longest unsearched first)
START_KINDS = ("startlist", "startfile")       # a start list read, or only linked (a PDF)
ORG_START_DAYS = 90             # an organiser's start list (« Organisation › Horaires ») is published this far ahead
# The race's announcement and start-time booking on its organiser's site (2026-11-11: COLE's of 6 December linked
# both from its own post, FFCO's page neither), for the Agenda: the races of the next LINK_DAYS days, LINK_SITES a run,
# each at most every LINK_EVERY hours, after the results; kept in prov_meta « sitelinks », written to prov/links.json.
LINK_DAYS = 60
LINK_EVERY = 36
LINK_SITES = 4
MATCHED = "rapproché automatiquement (date, nom, organisateur)"
# One address per platform competition, however a club's page spells it (« …?lang=fr&comp=… »): the same document
# is then kept once, whether matched automatically or linked from the organiser's site.
PLATFORM_URL = {"liveresultat": "https://liveresultat.orientering.se/followfull.php?comp={}",
                "winsplits": WS_BASE + "/classes.asp?databaseId={}", "heyries": HY_BASE + "/competition/{}/",
                "helga": HG_BASE + "/splitsbrowser.php?lauf={}", "oreplay": "https://www.oreplay.es/competitions/{}",
                "meosdjango": "https://{}/",            # (its ids: « host/competition/<n> », sources.meosdjango)
                "olive": OL_BASE + "?Action=ChoixResultats&IdCourse={}",
                "sportident": SI_PAGE + "/{}",                # (its ids: « <slug>?event=<n> », sources.sportident)
                "oresults": OR_PAGE + "/{}"}
PLATFORM_ID = {"liveresultat": r"liveresultat\.orientering\.se/.*[?&]comp=(\d+)", "winsplits": r"[?&]databaseId=(\d+)",
               "heyries": r"/competition/(\d+)", "helga": r"helga-o\.live/splits/\w+\.php\?lauf=(\d+)",
               "oreplay": r"oreplay\.es/competitions/([0-9a-f-]{36}/[0-9a-f-]{36})",
               "meosdjango": r"https?://([^/?#]+/competition/\d+)", "olive": r"co-live\.fr/olive/\w+\.php\?(?:.*&)?IdCourse=(\d+)",
               "sportident": r"center\.sportident\.com/results/orienteering/([^#]+?\?event=\d+)",
               "oresults": r"oresults\.eu/events/(\d+)"}
# The live competitions tied to a race, as the live relay numbers them (its /api/live/list): liveresultat's number, an
# organiser's broadcast (« direct:<number> »), a MeOSDjango site's, O'Live's or SPORTident Center's « host/<n> » (the relay
# numbers those itself). The Agenda links a race live now to its « En direct » page (owner, 2026-10-23).
LIVE_IDS = ((re.compile(r"liveresultat\.orientering\.se/.*[?&]comp=(\d+)"), lambda m: int(m[1])),
            (re.compile(r"^direct:(\d+)"), lambda m: int(m[1])),
            (re.compile(r"^https?://([^/?#]+)/competition/(\d+)"), lambda m: f"{m[1]}/{m[2]}"),
            (re.compile(r"^https?://(?:www\.)?(co-live\.fr)/olive/\w+\.php\?(?:.*&)?IdCourse=(\d+)"), lambda m: f"{m[1]}/{m[2]}"),
            (re.compile(r"^https?://(center\.sportident\.com)/results/orienteering/[^#]*\?event=(\d+)"), lambda m: f"{m[1]}/{m[2]}"),
            (re.compile(r"^https?://(oresults\.eu)/events/(\d+)"), lambda m: f"{m[1]}/{m[2]}"))


def live_ids(con, key: str) -> list | None:
    out = []
    for (url,) in con.execute("SELECT url FROM prov_docs WHERE race_key = ? AND source IN "
                              "('liveresultat', 'direct', 'meosdjango', 'heyries', 'olive', 'sportident', 'oresults')", (key,)).fetchall():
        for rx, conv in LIVE_IDS:
            m = rx.search(url or "")
            if m and conv(m) not in out:
                out.append(conv(m))
                break
    return out or None


# the time zones of a race's country, for liveresultat's competitions (a race in France reads only Paris's): the others
# are their country module's (countries/<cc>), any time zone for a country without one
TZ = {None: ("Europe/Paris",), "FR": ("Europe/Paris",)}
# overseas France, for the liveresultat competitions that may be France's (as the live relay's TZ_COUNTRY)
FR_OVERSEAS = ("Indian/Reunion", "Indian/Mayotte", "America/Guadeloupe", "America/Martinique", "America/Cayenne",
               "Pacific/Noumea", "Pacific/Tahiti")


def time_zones(country: str | None) -> tuple[str, ...] | None:
    if country in TZ:
        return TZ[country]
    try:
        import countries
        TZ[country] = countries.get(country).time_zones or None
    except (KeyError, ImportError):
        TZ[country] = None
    return TZ[country]


def platform_id(kind: str, url: str) -> str | None:
    m = re.search(PLATFORM_ID.get(kind, r"^$"), url)
    return m.group(1) if m else None


def canonical_docs(con) -> int:
    """Platform documents saved under another spelling of their address: renamed, or dropped when the race already
    has that document (and Helga notes that name no event: its home page, its lists)."""
    n = 0
    for row in con.execute("SELECT race_key, url, source FROM prov_docs WHERE source IN ('liveresultat', 'winsplits', 'heyries', 'helga', 'oreplay', 'meosdjango', 'olive', 'sportident', 'oresults')").fetchall():
        pid = platform_id(row["source"], row["url"])
        if pid is None:
            if row["source"] == "helga" and "lauf=" not in row["url"]:
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?", (row["race_key"], row["url"]))
                n += 1
            continue
        url = PLATFORM_URL[row["source"]].format(pid)
        if url == row["url"]:
            continue
        if con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (row["race_key"], url)).fetchone():
            con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?", (row["race_key"], row["url"]))
        else:
            con.execute("UPDATE prov_docs SET url = ? WHERE race_key = ? AND url = ?", (url, row["race_key"], row["url"]))
        n += 1
    con.commit()
    return n
CATCH_UP = 4                    # budget multiplier while catching up


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---- reading any document ----------------------------------------------------------------------------------
def parse_any(content: bytes, url: str, ctype: str = "") -> dict | None:
    """The first parser that reads it: PDFs, IOF XML (a result list, else a course setter's CourseData), then HTML
    exports (OE, MeOS), then any HTML table."""
    head = content[:400].lstrip().lower()
    order = (["pdf"] if content[:5] == b"%PDF-" else
             ["iofxml", "coursedata"] if head.startswith(b"<?xml") or b"<resultlist" in head or b"<coursedata" in head else
             ["oe_html", "meos_html", "html_generic"])
    for name in order:
        try:
            mod = __import__(f"ffco_scraper.prov.parsers.{name}", fromlist=["parse"])
        except ImportError:
            continue
        try:
            d = mod.parse(content, url)
        except Exception:                                     # a parser must never stop the run
            log.exception("parser %s failed on %s", name, url)
            d = None
        if d and d.get("classes"):
            return d
    return None


def save(con, race_key: str, url: str, source: str, parsed: dict | None, kind: str | None = None,
         sha: str | None = None, note: str | None = None) -> bool:
    """Record a document; True when it is new or changed."""
    now = _now()
    blob = json.dumps(parsed, ensure_ascii=False) if parsed else None
    sha = sha or (hashlib.sha1(blob.encode()).hexdigest() if blob else None)
    prev = con.execute("SELECT sha FROM prov_docs WHERE race_key = ? AND url = ?", (race_key, url)).fetchone()
    kind = kind or (parsed or {}).get("kind") or "unparsed"
    title = (parsed or {}).get("title")
    if prev and prev["sha"] == sha:
        con.execute("UPDATE prov_docs SET note = COALESCE(?, note) WHERE race_key = ? AND url = ?", (note, race_key, url))
        return False
    if prev:
        con.execute("UPDATE prov_docs SET kind=?, title=?, sha=?, parsed=?, changed_at=?, note=? WHERE race_key=? AND url=?",
                    (kind, title, sha, blob, now, note, race_key, url))
    else:
        con.execute("""INSERT INTO prov_docs (race_key, url, source, kind, title, sha, parsed, found_at, changed_at, note)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""", (race_key, url, source, kind, title, sha, blob, now, now, note))
    return True


def date_ok(parsed: dict | None, race) -> bool:
    """A document that prints another date is someone else's (an old edition, an earlier day of the weekend) — but a
    file is often exported the evening after, and prints that day (Larmor-Plage, 26/09, printed 27/09): up to 2 days
    later is the race's."""
    d = (parsed or {}).get("date")
    if not d:
        return True
    try:
        gap = (date.fromisoformat(d) - date.fromisoformat(race["date_iso"])).days
    except ValueError:
        return True
    if 0 <= gap <= 2:
        return True
    # the competition's date mistyped in the timing software (Morbihan O'Tour, 15/11/2026: MeOS's competition dated
    # « 2026-11-05 », its list printed on the 15th): a date of the month before the race on a list printed on the race's
    # day or up to 2 days after is the race's
    try:
        printed = (date.fromisoformat(parsed["printed"]) - date.fromisoformat(race["date_iso"])).days
    except (KeyError, TypeError, ValueError):
        return False
    return -31 <= gap < 0 and 0 <= printed <= 2


WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def not_this_race(race, text: str) -> bool:
    """A file whose name or printed title gives another format or another day of the week than the race's: the same
    organiser's other race (the Championnats de France week: « Chpt France LD » is not the « D88 MD »; « MD VTT » not a
    foot race; « Vertaco 2026 Samedi » not Sunday's)."""
    low = plain(text)
    says = {k for k, pat in (("vtt", r"\b(vtt|mtbo)\b"), ("ski", r"\bski\b"), ("Sprint", r"\bsprint"),
                             ("MD", r"\bmd\b|moyenne"), ("LD", r"\bld\b|longue")) if re.search(pat, low)}
    if "vtt" in says and race["terrain"] != "VTT" or "ski" in says and race["terrain"] != "Ski":
        return True
    formats = says & {"Sprint", "MD", "LD"}
    if formats and race["terrain"] not in ("VTT", "Ski") and race["epreuve"] in ("Sprint", "MD", "LD") \
            and race["epreuve"] not in formats:
        return True
    days = {w for w in WEEKDAYS if re.search(rf"\b{w}\b", low)}
    return bool(days) and WEEKDAYS[date.fromisoformat(race["date_iso"]).weekday()] not in days


# ---- one race ------------------------------------------------------------------------------------------------
def look(con, race, f: Fetcher, lr: LiveResultat, ws: WinSplits, hy: Heyries, cs: ClubSite, links: dict, reread: bool = False,
         hg: Helga | None = None, md: MeOSDjango | None = None, ol: OLive | None = None, si: SportIdent | None = None,
         orr: OResults | None = None) -> int:
    """links: the platform competitions assigned to this race ({'liveresultat': id, 'winsplits': id, …})."""
    changed = site_docs(con, race, f, lr, ws, hy, cs, reread, hg, md, ol, si, orr)
    matched = []
    # liveresultat and WinSplits: the competition of that day assigned to this race (races.assign); liveresultat's of the
    # race's country only (by its time zone)
    tzs = time_zones(race["country"])
    if links.get("liveresultat") and not f.out_of_time() and (tzs is None or (lr.info(links["liveresultat"]).get("timezone") or "Europe/Paris") in tzs):
        url = PLATFORM_URL["liveresultat"].format(links["liveresultat"])
        matched.append(url)                   # kept even if emptied since: live results are cleared after the event
        d = lr.read(links["liveresultat"])
        if d and d["classes"]:
            changed += save(con, race["key"], url, "liveresultat", d, note=MATCHED)
        elif not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone():
            save(con, race["key"], url, "liveresultat", None, kind="empty", note=MATCHED)     # matched, nothing (left) to read
    if links.get("winsplits") and not f.out_of_time():
        url = PLATFORM_URL["winsplits"].format(links["winsplits"])
        matched.append(url)
        fp = ws.fingerprint(links["winsplits"])
        prev = con.execute("SELECT sha FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone()
        unchanged = fp and prev and prev["sha"] == fp and not reread
        d = None if unchanged else ws.read(links["winsplits"])
        if d and d["classes"]:
            changed += save(con, race["key"], url, "winsplits", d, note=MATCHED, sha=fp)
        elif not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone():
            save(con, race["key"], url, "winsplits", None, kind="empty", note=MATCHED)     # matched, nothing (left) to read
    # MeOSDjango sites (Orientation Data is one): a course at a time, read again only when the competition's page says
    # results came in (its counts of runners ranked and started: the fingerprint); O'Live likewise (its circuits' pages,
    # the split times only when they moved); SPORTident Center's results file is asked for conditionally (304: unchanged),
    # OResults' data likewise
    for kind, reader in (("heyries", hy), ("meosdjango", md), ("olive", ol), ("sportident", si), ("oresults", orr)):
        if not links.get(kind) or reader is None:
            continue
        url = PLATFORM_URL[kind].format(links[kind])
        matched.append(url)
        if f.out_of_time():
            continue
        fp = reader.fingerprint(links[kind])
        prev = con.execute("SELECT sha, kind FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone()
        unchanged = fp and prev and prev["sha"] == fp and prev["kind"] != "startlist" and not reread
        d = None if unchanged else reader.read(links[kind])
        if d and d["classes"]:
            changed += save(con, race["key"], url, kind, d, note=MATCHED, sha=fp)
        elif not prev:
            save(con, race["key"], url, kind, None, kind="empty", note=MATCHED)     # matched, nothing (left) to read
    if links.get("oreplay") and not f.out_of_time():           # the competition the race's agenda names (O-Replay, Spain)
        url = PLATFORM_URL["oreplay"].format(links["oreplay"])
        matched.append(url)
        d = OReplay(f).read(links["oreplay"])
        if d and d["classes"]:
            changed += save(con, race["key"], url, "oreplay", d, note=MATCHED)
        elif not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone():
            save(con, race["key"], url, "oreplay", None, kind="empty", note=MATCHED)     # nothing uploaded (yet)
    # Canada's (countries/ca, 2026-11-11): WhyJustRun's IOF XML results of the event its agenda names, and the club's own
    # results files of that day (Orienteering Ottawa's MeOS split lists, Ramblers' lists) — read again when they change
    if links.get("wjr") and not f.out_of_time():
        m = re.search(r"/events/view/(\d+)", links["wjr"], re.I)
        url = f"https://whyjustrun.ca/iof/3.0/events/{m.group(1)}/result_list.xml" if m else None
        a = f.get(url, conditional=not reread) if url else None
        if a is not None and a.status == 304 and con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?",
                                                             (race["key"], url)).fetchone():
            matched.append(url)
        elif a is not None and a.status == 200:
            d = parse_any(a.content, a.url, a.ctype)
            if d and d["classes"]:
                matched.append(url)
                changed += save(con, race["key"], url, "wjr", d, note=MATCHED)
    files = links.get("file") or []
    for url in [files] if isinstance(files, str) else files:
        if f.out_of_time():
            break
        matched.append(url)
        has = con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone()
        a = f.get(url, conditional=bool(has) and not reread)
        if a.status != 200:
            continue
        d = parse_any(a.content, a.url, a.ctype)
        if d and d["classes"] and date_ok(d, race):
            changed += save(con, race["key"], url, "site", d, note=MATCHED)
    if links.get("helga") and hg and not f.out_of_time():
        url = PLATFORM_URL["helga"].format(links["helga"])
        matched.append(url)
        d = hg.read(links["helga"])
        if d and d["classes"]:
            changed += save(con, race["key"], url, "helga", d, note=MATCHED)
        elif not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone():
            save(con, race["key"], url, "helga", None, kind="empty", note=MATCHED)     # created, no results (yet)
    # an earlier match no longer chosen (a better race took it) is dropped
    con.execute(f"""DELETE FROM prov_docs WHERE race_key = ? AND note = ? AND url NOT IN ({",".join("?" * len(matched)) or "''"})""",
                (race["key"], MATCHED, *matched))
    return changed


_PARSED: dict = {}          # file content hash -> its parse, within one run


def place_words(race) -> set[str]:
    """The words naming a race's place (« Luxeuil (70) » -> luxeuil; « Le Pouldu Clohars Carnoet » -> pouldu…)."""
    return {w for w in re.findall(r"[a-z]{4,}", plain(re.sub(r"\(.*?\)", " ", race["place"] or "")))
            if w not in ("foret", "bois", "parc", "saint", "sainte", "sur", "les", "plage", "ville", "centre")}


def adopt(con, found_by, d: dict, url: str, text: str, sha: str | None) -> str | None:
    """A results file met while looking for one race but about another one of the fortnight (an organiser's site
    posting the week's results together: terres-do.fr's « MD - Luxeuil-les-Bains » found looking for the D88 races):
    it goes to the race whose place it names, whose day and format it fits — the VTT race if it says VTT, else the
    foot race. Returns that race's key, or None when no single race fits."""
    if not d or not d.get("classes"):
        return None
    label = f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text} {d.get('title') or ''}"
    low = plain(label)
    day = date.fromisoformat(found_by["date_iso"])
    near = con.execute(f"SELECT * FROM prov_races WHERE date_iso BETWEEN ? AND ? AND key != ? AND key NOT LIKE '{RELAY}%'",
                       ((day - timedelta(days=7)).isoformat(), (day + timedelta(days=7)).isoformat(), found_by["key"])).fetchall()
    fits = [r for r in near if (not d.get("date") or d["date"] == r["date_iso"]) and date_ok(d, r)
            and any(w in low for w in place_words(r)) and not not_this_race(r, label)
            and not address_other_day(url, date.fromisoformat(r["date_iso"]))]
    bike = bool(re.search(r"\b(vtt|mtbo)\b", low))
    fits = [r for r in fits if (r["terrain"] == "VTT") == bike] or fits
    if len(fits) > 1:
        mine = races.owners(fits, label, False)
        fits = [r for r in fits if r["key"] in mine]
    if len(fits) != 1:
        return None
    to = fits[0]
    if not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (to["key"], url)).fetchone():
        save(con, to["key"], url, "site", d, sha=sha, note=text or None)
    return to["key"]


def site_docs(con, race, f: Fetcher, lr: LiveResultat, ws: WinSplits, hy: Heyries, cs: ClubSite, reread: bool, hg,
              md: MeOSDjango | None = None, ol: OLive | None = None, si: SportIdent | None = None,
              orr: OResults | None = None) -> int:
    """The organiser's website: its result files, and the platform competitions it links to."""
    changed = 0
    sites = [s for s in dict.fromkeys([race["site"], races.club_site(con, race["org_code"])]) if s]
    # another country's race: its organiser's pages are in another language, which the search's words (« résultats »,
    # French days and months) do not read — the platforms only, until its own words are taught (2026-10-22)
    if race["country"] not in (None, "FR"):
        sites = []
    # files a looser search took earlier that name another day or season (a club's « all our races » page): not this race's
    day = date.fromisoformat(race["date_iso"])
    for row in con.execute(f"""SELECT url, note FROM prov_docs WHERE race_key = ? AND source = 'site'
                               AND kind NOT IN ({",".join("?" * len(START_KINDS))})""", (race["key"], *START_KINDS)).fetchall():
        name = urllib.parse.unquote(urllib.parse.urlsplit(row["url"]).path.rsplit("/", 1)[-1])
        if other_day(urllib.parse.unquote(row["url"]), day) or uploaded_before(row["url"], day) or \
                address_other_day(row["url"], day) or other_day_named(plain(row["note"] or ""), day) or \
                other_year(f"{name} {row['note'] or ''}", day):
            con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], row["url"]))
            changed += 1
    gone = False
    if sites and not f.out_of_time():
        found = cs.find(race, sites)
        # a race its organiser's pages say is cancelled (FFCO's calendar may still list it, as the CF Sprint of 2026-10-24):
        # kept off « Résultats » while it has no results of its own (build), and an O'Live race its page leads to is its
        # replacement, a race of its own (`replacement`)
        gone = cs.cancelled(race) or race["key"] in cancelled_keys(con)
        if not f.out_of_time():
            mark_cancelled(con, race, gone, date.today())
        if gone:
            # (an O'Live document its replacement holds is not the cancelled race's: given to it before 2026-10-24's fix)
            changed += con.execute("""DELETE FROM prov_docs WHERE race_key = ? AND source = 'olive' AND url IN
                                      (SELECT url FROM prov_docs WHERE race_key LIKE 'ol%')""", (race["key"],)).rowcount
        # unreadable files a looser search took earlier (a club's pages taken for results lists): gone once a full
        # look no longer finds them
        if not f.out_of_time():
            for row in con.execute("SELECT url FROM prov_docs WHERE race_key = ? AND source = 'site' AND kind = 'unparsed'",
                                   (race["key"],)).fetchall():
                if row["url"] not in {u for u, _, _ in found["docs"]}:
                    con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], row["url"]))
                    changed += 1
        # the organiser's other races of the day (« Championnat de Ligue » and « Challenge urbain »): a document goes
        # to the race(s) it is about (races.owners); one about another race is not this race's (dropped if saved before)
        # (a weekend's races too: a club posts Saturday's and Sunday's lists together)
        day = date.fromisoformat(race["date_iso"])
        rivals = con.execute(f"SELECT * FROM prov_races WHERE date_iso BETWEEN ? AND ? AND org_code = ? AND key != ? AND key NOT LIKE '{RELAY}%'",
                             ((day - timedelta(days=1)).isoformat(), (day + timedelta(days=1)).isoformat(),
                              race["org_code"], race["key"])).fetchall()
        if rivals:
            label = lambda url, text: f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text}"
            theirs = [u for u, t, _ in found["docs"] if race["key"] not in races.owners([race, *rivals], label(u, t), False)]
            found["docs"] = [d for d in found["docs"] if d[0] not in theirs]
            for u in theirs:
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], u))
        changed += save_announcements(con, race, found, f, rivals)
        for url, text, via in found["docs"]:
            if f.out_of_time():
                break
            # a conditional request only for a file this race has already: one first found for another race is read
            has = con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone()
            # (and not when the weekend has other races: the file read again says whose it is)
            a = f.get(download_url(url), conditional=bool(has) and not reread and not rivals)
            if a.status == 304:
                continue
            if a.status == -1:
                changed += save(con, race["key"], url, "site", None, kind="refused", note="refusé aux robots (robots.txt ou filtrage)")
                continue
            if a.status != 200:
                continue
            # a page of a MeOSDjango site linked as the results (« Résultats CO »): a platform, the site remembered, and
            # the competition it names read as such
            if md and a.content[:5] != b"%PDF-" and is_meosdjango(a.content):
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], url))
                if md.add(urllib.parse.urlsplit(a.url).netloc.lower(), url):
                    log.info("provisional: MeOSDjango site found on %s's site: %s", race["key"], a.url)
                changed += platform_doc(con, race, md, md.probe(a.url))
                continue
            # a file already read for another race (a weekend's races share their organiser's files): its parse, not
            # another one (a split-time PDF can take a minute)
            memo = a.sha or a.url
            if memo not in _PARSED:
                known = None if reread or not a.sha else con.execute(
                    "SELECT parsed FROM prov_docs WHERE sha = ? AND parsed IS NOT NULL LIMIT 1", (a.sha,)).fetchone()
                _PARSED[memo] = json.loads(known["parsed"]) if known else parse_any(a.content, a.url, a.ctype)
            d = copy.deepcopy(_PARSED[memo])
            # another day's or (by the title it prints: « Championnat 2018 GE de sprint - Vittel ») another season's
            # (or another format or weekday, by its name, link and title)
            if d is not None and (not date_ok(d, race) or other_year(d.get("title") or "", day) or
                                  not_this_race(race, f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text} {d.get('title') or ''}")):
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], url))
                if not other_year(d.get("title") or "", day):
                    changed += bool(adopt(con, race, d, url, text, a.sha))      # another race's: given to it
                continue
            # one of the weekend's other races (Le Mans: « 20261003 E1 sprint savigne - result.pdf » is the
            # « SOT2026-E1-Chpt ligue sprint SAVIGNE », the Championnat de Ligue, not the night sprint): the date and
            # title it prints decide, with its address and link
            if d is not None and rivals and (
                    (d.get("date") and d["date"] != race["date_iso"] and any(r["date_iso"] == d["date"] for r in rivals))
                    or race["key"] not in races.owners([race, *[r for r in rivals if not d.get("date") or r["date_iso"] == d["date"]]],
                                                       f"{label(url, text)} {d.get('title') or ''}")):
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], url))
                changed += bool(adopt(con, race, d, url, text, a.sha))
                continue
            if d is None and via.endswith(MAYBE):
                continue                          # read to find out (it said nothing of itself): not results
            changed += save(con, race["key"], url, "site", d, kind=None if d else "unparsed", sha=a.sha, note=text or None)
        # platforms the club links to: read liveresultat and WinSplits ids directly, note the others
        seen = set()
        for url, kind in found["platforms"]:
            if kind == "meosdjango":                  # (a page /competition/<n>/ of another site: is it one?)
                pid = md.probe(url) if md and not f.out_of_time() else None
                if pid and PLATFORM_URL[kind].format(pid) not in seen:
                    seen.add(PLATFORM_URL[kind].format(pid))
                    changed += platform_doc(con, race, md, pid)
                continue
            if kind == "olive":
                # O'Live: the race the link names, else (« Résultats provisoires » -> its home page) the race of that day
                # the link or the page holding it names (clubsite: `contexts`)
                page, named = found.get("contexts", {}).get(url, (None, True))
                pid, how = (platform_id(kind, url), "link") if platform_id(kind, url) else \
                    ol.of_day(race, (cs.page(page) or "") if page else "", named) if ol and not f.out_of_time() else (None, None)
                # the race cancelled, an O'Live race its page leads to but whose name is not the race's is its replacement
                target = race
                if pid and gone and how in ("page", "only"):
                    target = replacement(con, race, ol, pid) or race
                    if target is not race:
                        changed += con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?",
                                               (race["key"], PLATFORM_URL[kind].format(pid))).rowcount
                d = ol.read(pid) if pid and ol and PLATFORM_URL[kind].format(pid) not in seen and not f.out_of_time() else None
                if d and d["classes"] and date_ok(d, race) and (not d.get("date") or d["date"] == race["date_iso"]):
                    seen.add(PLATFORM_URL[kind].format(pid))
                    con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND kind = 'platform'", (race["key"], url))
                    changed += save(con, target["key"], PLATFORM_URL[kind].format(pid), kind, d)
                    continue
                if not named:
                    continue                          # (a link of the club's pages, about another race)
            if kind == "sportident":
                # SPORTident Center: its results page or a si.events short link -> the event (its slug), kept when of the race's day
                pid = si.resolve(url) if si and not f.out_of_time() else None
                if pid and PLATFORM_URL[kind].format(pid) not in seen:
                    seen.add(PLATFORM_URL[kind].format(pid))
                    d = si.read(pid)
                    if d and d["classes"] and date_ok(d, race) and (not d.get("date") or d["date"] == race["date_iso"]):
                        changed += save(con, race["key"], PLATFORM_URL[kind].format(pid), kind, d)
                continue
            if kind == "oresults":
                # OResults: the event its link names (« Résultats (provisoires) », Balise 77 for Larchant), of the race's day
                pid = orr.resolve(url) if orr else None
                if pid and PLATFORM_URL[kind].format(pid) not in seen and not f.out_of_time():
                    seen.add(PLATFORM_URL[kind].format(pid))
                    d = orr.read(pid)
                    if d and d["classes"] and date_ok(d, race) and (not d.get("date") or d["date"] == race["date_iso"]):
                        con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND kind = 'platform'", (race["key"], url))
                        changed += save(con, race["key"], PLATFORM_URL[kind].format(pid), kind, d)
                continue
            pid = platform_id(kind, url)
            if pid and not f.out_of_time() and (kind != "helga" or hg):
                url = PLATFORM_URL[kind].format(pid)
                if url in seen:
                    continue
                seen.add(url)
                reader = {"liveresultat": lr, "winsplits": ws, "heyries": hy, "helga": hg}.get(kind) or OReplay(f)
                d = reader.read(pid if kind == "oreplay" else int(pid))
                if d and d["classes"] and date_ok(d, race):
                    changed += save(con, race["key"], url, kind, d)
            elif kind == "helga" and "lauf=" not in url:
                continue                      # Helga's home page or lists: no event named
            elif kind in ("helga", "olive", "routegadget"):
                # (Livelox is left out: it shows only the runners who sent their GPS track, and it refuses robots)
                if kind == "helga":
                    f.note(url, "refused")
                changed += save(con, race["key"], url, kind, None, kind="platform",
                                note={"helga": "Helga : pages de résultats fermées aux robots",
                                      "olive": "O'Live : résultats en direct", "routegadget": "RouteGadget"}[kind])
    return changed


def mark_cancelled(con, race, gone: bool, today: date) -> None:
    """The races their organiser's pages say are cancelled (prov_meta 'cancelled', their keys), as the last look found -
    until the race's day: after it, a cancellation stays (2026-10-29: the CF Sprint's notice taken down after the weekend
    brought the cancelled qualification back on « Résultats », with its replacement's O'Live document)."""
    keys, key = set(store.meta_get(con, "cancelled", []) or []), race["key"]
    if not gone and key in keys and today > date.fromisoformat(race["date_iso"]):
        return
    if gone != (key in keys):
        store.meta_set(con, "cancelled", sorted(keys | {key} if gone else keys - {key}))


def _cancel_base(name: str | None) -> str:
    """A race's name as a cancellation names it: its brackets and « - WRE » apart (ClubSite.cancelled)."""
    return plain(re.split(r"\s+-\s+", re.sub(r"\(.*?\)", " ", name or ""))[0])


def cancelled_keys(con) -> set[str]:
    """The cancelled races: those marked (`mark_cancelled`), those holding an O'Live document a replacement race « ol<id> »
    holds (a replacement exists only for a cancelled race), and the organiser's other races of their day under the same
    name (the CF Sprint's qualification and final, cancelled together)."""
    keys = set(store.meta_get(con, "cancelled", []) or [])
    keys |= {r[0] for r in con.execute("""SELECT DISTINCT d.race_key FROM prov_docs d JOIN prov_docs o ON o.url = d.url
                                           WHERE d.source = 'olive' AND o.race_key LIKE 'ol%' AND o.race_key NOT LIKE ?
                                             AND d.race_key NOT LIKE 'ol%'""", (f"{RELAY}%",))}
    if keys:
        rows = con.execute("SELECT key, date_iso, org_code, name FROM prov_races").fetchall()
        marked = {(r["date_iso"], r["org_code"], _cancel_base(r["name"])) for r in rows if r["key"] in keys}
        keys |= {r["key"] for r in rows if not r["key"].startswith("ol") and len(_cancel_base(r["name"]).split()) >= 2
                 and (r["date_iso"], r["org_code"], _cancel_base(r["name"])) in marked}
    return keys


def replacement(con, race, ol: OLive, pid):
    """The race an O'Live competition stands for when the race whose page leads to it is cancelled: a race of its own,
    « ol<id> », on the cancelled race's day, of its organiser, site and discipline, under O'Live's name and the place that
    name gives (« Sprint Labyrinthe - Le Bessat » -> « Le Bessat »). None when O'Live no longer lists it."""
    key = f"ol{pid}"
    row = con.execute("SELECT * FROM prov_races WHERE key = ?", (key,)).fetchone()
    if row:
        return row
    comp = next((c for c in ol.competitions() if c["id"] == int(pid)), None)
    if not comp:
        return None
    parts = re.split(r"\s+-\s+", comp["name"])
    now = races.now_iso()
    # (agenda_id 0, as an upload's race: FFCO's results of it, if they come, are linked to it rather than added twice)
    con.execute("""INSERT INTO prov_races (key, date_iso, name, place, org, org_code, terrain, epreuve, cn, site, agenda_id,
                   first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (key, race["date_iso"], comp["name"], parts[-1] if len(parts) > 1 else race["place"], race["org"], race["org_code"],
                 race["terrain"], race["epreuve"], race["cn"], race["site"], 0, now, now))
    log.info("provisional: %s is cancelled; O'Live's « %s » is its replacement, %s", race["key"], comp["name"], key)
    return con.execute("SELECT * FROM prov_races WHERE key = ?", (key,)).fetchone()


RELAY = "olr"           # an O'Live relay's race: « olr<IdCourse> » (races.split_times_only)


def relays(con, ol: OLive, agenda: Path, today: date) -> int:
    """O'Live's relays of the last days (owner, 2026-10-25: the CNE at Le Bessat), for « Analyse de course » alone: each a
    race « olr<id> » — the organiser, place and site of the agenda's relay of that day whose place O'Live's name gives (else
    the day's only one) —, its split times read as one document whose circuits are its categories' legs (OLive.read_relay),
    again only when the categories' pages moved; looked at every 50 minutes while legs are out or to come, and once more
    the day after; then done. Not on « Résultats », never scored, no alert (build: `relays` apart in the index)."""
    lo = (today - timedelta(days=KEEP_DAYS)).isoformat()
    events = json.loads(agenda.read_text(encoding="utf-8")).get("events", []) if agenda.exists() else []
    changed = 0
    for c in ol.relays():
        if not lo <= c["date"] <= today.isoformat():
            continue
        key = f"{RELAY}{c['id']}"
        if not con.execute("SELECT 1 FROM prov_races WHERE key = ?", (key,)).fetchone():
            day = [e for e in events if e.get("kind") == "c" and e.get("date") == c["date"] and races.is_relay(e.get("name"), e.get("epr"))]
            said = [e for e in day if e.get("place") and set(races._words(e["place"])) & set(races._words(c["name"]))]
            e = (said if len(said) == 1 else day if len(day) == 1 else [{}])[0]
            parts = re.split(r"\s+-\s+", c["name"])
            terrain = races.SPEC_TERRAIN.get(e.get("spec")) or ("Sprint" if "sprint" in plain(c["name"]) else "Forêt")
            now = races.now_iso()
            con.execute("""INSERT INTO prov_races (key, date_iso, name, place, org, org_code, terrain, epreuve, cn, site,
                           first_seen, next_check) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)""",
                        (key, c["date"], c["name"], e.get("place") or (parts[-1] if len(parts) > 1 else None), e.get("org"),
                         races.org_code(e.get("org")), terrain, "Relais", e.get("site"), now, now))
        race = con.execute("SELECT * FROM prov_races WHERE key = ?", (key,)).fetchone()
        if race["done"] or (race["next_check"] and race["next_check"] > _now()) or ol.f.out_of_time():
            continue
        url = PLATFORM_URL["olive"].format(c["id"])
        fp = ol.relay_fingerprint(c["id"])
        prev = con.execute("SELECT sha, parsed FROM prov_docs WHERE race_key = ? AND url = ?", (key, url)).fetchone()
        d = None if fp and prev and prev["sha"] == fp else ol.read_relay(c["id"]) if fp else None
        if d:
            changed += save(con, key, url, "olive", d, sha=fp)
        elif ol.f.out_of_time():
            continue
        live = (d or json.loads(prev["parsed"] if prev and prev["parsed"] else "{}")).get("live")
        now = datetime.now(timezone.utc)
        if not live and fp and c["date"] < today.isoformat():
            con.execute("UPDATE prov_races SET last_check = ?, done = 1 WHERE key = ?", (now.isoformat(timespec="seconds"), key))
        else:
            con.execute("UPDATE prov_races SET last_check = ?, next_check = ? WHERE key = ?",
                        (now.isoformat(timespec="seconds"), (now + timedelta(minutes=50)).isoformat(timespec="seconds"), key))
        con.commit()
    return changed


def platform_doc(con, race, md: MeOSDjango, pid: str | None) -> int:
    """A MeOSDjango competition the organiser's site links to: read, kept when it is of the race's day."""
    if not pid:
        return 0
    d = md.read(pid)
    if d and d["classes"] and date_ok(d, race) and (not d.get("date") or d["date"] == race["date_iso"]):
        return save(con, race["key"], PLATFORM_URL["meosdjango"].format(pid), "meosdjango", d)
    return 0


# ---- the admin's files -----------------------------------------------------------------------------------------
# The shape of index.json; a new one is published at once (a deploy), not with the next result found.
# 2 (2026-10-08): each race's region and its runners' licences, for the list's filters.
# 3 (2026-10-08): the last runs, and whether each race's organiser has a known website.
INDEX_VERSION = 3
# The collection itself: bump it when finding results improves (a source, the club-site search…) — every race of the
# window is looked at once more, the finished ones too (documents already read are not downloaded again).
# 1 (2026-10-09): Helga, the club-site fixes and the 60-day window came after many races' last look.
# 2 (2026-10-09): robots.txt no longer obeyed, the crawl best-first, sibling WordPress sites, a weekend's files told
#   apart by the title they print.
# 3 (2026-10-09): a file about another race of the fortnight goes to that race (the CF week's site posting Luxeuil's).
# 4 (2026-10-17): a place's compass point or qualifier alone no longer matches a platform's competition (« Seillon
#   Nord » took Helga's Belgian « NORD#3 »): the races of the window looked at again, such a match dropped.
# 5 (2026-10-22): MeOSDjango sites (sources.meosdjango), Orientation Data read course by course (each runner once).
# 6 (2026-10-24): SPORTident Center (sources.sportident).
# 7 (2026-11-16): OResults (sources.oresults; Larchant's results, 15 November, were only there).
COLLECT_VERSION = 7
_BY_DEPT = {d: region for region, ds in REGIONS.items() for d in ds.split()}


def race_pos(race) -> list | None:
    """Where a race was run, for Arena's map (owner, 2026-10-30: a past competition shown where the mouse is): its place
    within its organiser's département (France; a name searched in the whole country took « Champs de bataille » of a Finistère
    club to Seine-et-Marne), else in its country — [lat, lon], or [lat, lon, 1] for the centre of the unit when no town of
    that name is known there (countries/places.py, offline tables)."""
    try:
        from countries import places
    except Exception:
        return None
    cc = (race["country"] or "FR").upper()
    code = (race["org_code"] or "")[:2].upper()
    dept = code if cc == "FR" and (code.isdigit() or code in ("2A", "2B")) else None
    try:
        p = places.position(cc, race["place"], dept=dept)
    except Exception:
        return None
    if not p:
        return None
    return [round(p[0], 3), round(p[1], 3)] + ([] if p[2] == "town" else [1])


def region_of(org_code: str | None) -> str | None:
    """The organiser's region: a club number starts with its département ('6804' -> 68), a committee is one ('13')."""
    code = (org_code or "").upper()
    if code in LIGUES:
        return LIGUES[code]
    dep = code[:2]
    if dep in ("2A", "2B"):
        dep = "20"
    if dep in _BY_DEPT:
        return _BY_DEPT[dep]
    return OUTRE_MER if dep.isdigit() and int(dep) >= 96 else None


# The order a race's documents are shown in (the first one opens): the organiser's own files (or a file sent to
# Ozimut) are the reference; liveresultat comes last — live results are not corrected afterwards. A document missing
# half the runners of the fullest one loses its rank; then a list by circuit (scored), with splits, the most runners.
SOURCE_RANK = {"upload": 6, "site": 5, "direct": 5, "winsplits": 4, "heyries": 4, "meosdjango": 4, "oreplay": 4, "sportident": 4, "oresults": 4,
               "helga": 3,
               "olive": 2,
               "liveresultat": 1}


# The copy for the accounts that have not joined France (prov/pub/; owner, 2026-10-20: names and times for everyone, as
# the organisers publish them): what the matching to FFCO's licences and the CN computations add is left out — a runner's
# licence and FFCO figures, provisional scores and CNs, the category read from the CN data, the birth year —, and a
# circuit's values; in the index, the licences recognised. The login gate serves the full files to France only.
PUB_RUNNER_DROP = ("lic", "ffco", "scores", "cnj15", "cnAfter", "catCn", "birth")
PUB_INDEX_DROP = ("lics", "rlics", "matched")


def public_copy(x):
    """`x` (a race file's body, or any part of it) without what only France's members see."""
    if isinstance(x, list):
        return [public_copy(v) for v in x]
    if not isinstance(x, dict):
        return x
    if isinstance(x.get("runners"), list):                  # a class: its runners, without the circuit's values
        return {k: ([{f: v for f, v in r.items() if f not in PUB_RUNNER_DROP} if isinstance(r, dict) else r for r in x["runners"]]
                    if k == "runners" else public_copy(v)) for k, v in x.items() if k != "values"}
    return {k: public_copy(v) for k, v in x.items()}


def doc_priority(entry: dict, most: int) -> int:
    ks = entry.get("classes") or []
    if not ks:
        return 0
    if entry.get("kind") == "startlist":            # a start list: after every list of results
        return 1 + min(sum(len(k["runners"]) for k in ks), 999)
    n = sum(len(k["runners"]) for k in ks)
    return (10**7 * (2 * n >= most) + 10**5 * SOURCE_RANK.get(entry["source"], 2) + 10**4 * (entry.get("by") != "category")
            + 10**3 * any(r.get("splits") for k in ks for r in k["runners"]) + min(n, 999))


def _name_key(name: str) -> str:
    return " ".join(sorted(plain(name).replace(",", " ").split()))


def category_circuits(parsed_docs: list[dict]) -> dict[str, str]:
    """{category: circuit} from the race's lists by circuit that give each runner's category (results, start lists):
    a category goes to the circuit most of its runners ran, when they mostly agree. Several categories share a circuit
    (« A: H20, H21, H35 »): a list by category is scored circuit by circuit with it, not category by category."""
    votes: dict[str, Counter] = defaultdict(Counter)
    for d in parsed_docs:
        if d.get("by") != "circuit":
            continue
        for k in d["classes"]:
            for r in k["runners"]:
                if r.get("category"):
                    votes[r["category"]][k["name"]] += 1
    out = {}
    for cat, v in votes.items():
        circ, n = v.most_common(1)[0]
        if n >= 0.7 * sum(v.values()):
            out[cat] = circ
    # FFCO's registration list (each circuit's categories), then the announcement's table: for the categories no list
    # by circuit placed
    for d in sorted(parsed_docs, key=lambda d: d.get("kind") != "registration"):
        if d.get("kind") in ("registration", "announcement"):
            for name, cats, _ in d.get("circuits") or []:
                for cat in races.expand_categories(cats):
                    out.setdefault(cat, name)
                # the classes it names that are no category (« Open violet »): by their name
                for part in re.split(r"[,;]", cats or ""):
                    if part.strip() and not races.expand_categories(part):
                        out.setdefault(plain(part).strip(), name)
    return out


def _ranked(rs: list[dict]) -> list[dict]:
    """Runners (copies) by time, places recomputed (ties share one), then those without a time."""
    ok = sorted((r for r in rs if r["status"] == "ok" and r.get("time_s")), key=lambda r: r["time_s"])
    last, place = None, 0
    for i, r in enumerate(ok):
        if r["time_s"] != last:
            place, last = i + 1, r["time_s"]
        r["place"] = place
    rest = [r for r in rs if not (r["status"] == "ok" and r.get("time_s"))]
    for r in rest:
        r["place"] = None
    return ok + rest


def category_view(parsed: dict) -> list[dict]:
    """A list by circuit that gives runners' categories, seen by category: each category's runners (from whichever
    circuit), places recomputed; a category on one circuit names it ("circuit") and shows its values."""
    groups: dict[str, list] = {}
    circ: dict[str, set] = {}
    values: dict[str, dict] = {}
    for k in parsed["classes"]:
        for r in k["runners"]:
            c = r.get("category") or r.get("catCn")
            if c:
                groups.setdefault(c, []).append(dict(r))
                circ.setdefault(c, set()).add(k["name"])
                values[k["name"]] = k.get("values")
    out = []
    for c in sorted(groups, key=lambda c: (c[0], int(re.sub(r"\D", "", c) or 0))):
        one = next(iter(circ[c])) if len(circ[c]) == 1 else None
        out.append({"name": c, "length_m": None, "climb_m": None, "controls": None, "runners": _ranked(groups[c]),
                    "circuit": one, "values": values.get(one) if one else None})
    return out


def circuit_view(parsed: dict) -> list[dict]:
    """A list by category scored circuit by circuit, seen by circuit: each circuit's runners (its categories merged),
    the finishers by time with places recomputed, then the others; each runner keeps their category."""
    groups: dict[str, list] = {}
    values: dict[str, dict] = {}
    for k in parsed["classes"]:
        if k.get("circuit"):
            groups.setdefault(k["circuit"], []).extend(dict(r) for r in k["runners"])
            values[k["circuit"]] = k.get("values")
    out = []
    for name in sorted(groups, key=lambda c: (len(c), c)):
        rs = groups[name]
        out.append({"name": name, "length_m": None, "climb_m": None, "controls": None, "runners": _ranked(rs),
                    "values": values.get(name), "categories": sorted({r.get("category") for r in rs if r.get("category")})})
    return out


def score_by_circuit(parsed: dict, circuits: dict[str, str], scorer, race) -> None:
    """A list by category: its categories regrouped into their circuits (circuits: {category: circuit}) and scored as
    such; each class gets its circuit's name ("circuit") and values. Categories of unknown circuit stay unscored."""
    groups: dict[str, list] = defaultdict(list)
    for k in parsed["classes"]:
        circ = (circuits.get(model.category(k["name"]) or "") or circuits.get(plain(k["name"]).strip())
                or (circuits.get(k["runners"][0].get("category") or "") if k["runners"] else None))
        if circ:
            k["circuit"] = circ
            groups[circ] += k["runners"]
    values = {c: scorer.score_class({"name": c, "runners": rs}, race, race["ffco_id"]) for c, rs in groups.items()}
    for k in parsed["classes"]:
        if k.get("circuit"):
            k["values"] = values[k["circuit"]]


def share_starts(parsed_docs: list[dict]) -> None:
    """A split file without start times (an organiser's PDF) gets them from another document of the race that has
    them (liveresultat, WinSplits), runner by runner by name — for the « Groupes » view."""
    starts: dict[str, float | None] = {}
    for d in parsed_docs:
        for k in d["classes"]:
            for r in k["runners"]:
                if r.get("start_s") is not None:
                    key = _name_key(r["name"])
                    starts[key] = r["start_s"] if starts.get(key, r["start_s"]) == r["start_s"] else None   # two values: none
    if not starts:
        return
    for d in parsed_docs:
        for k in d["classes"]:
            if any(r.get("splits") for r in k["runners"]) and not any(r.get("start_s") is not None for r in k["runners"]):
                for r in k["runners"]:
                    r["start_s"] = starts.get(_name_key(r["name"]))


def course_index(cds: list[tuple[str, dict]], lists: list[dict]) -> dict | None:
    """The race's course data (documents of kind "coursedata": « Organisation › Tracer », a setter's IOF XML), the first
    one given winning: its courses by name and by control sequence, the classes' courses ({"src": its address}), and the
    names the race's lists give the courses their codes identify (« Violet court » ran the codes of « P2 »: the same
    class of a list without codes is that course too)."""
    if not cds:
        return None
    idx: dict = {"name": {}, "seq": {}, "assign": {}, "alias": {}}
    for url, d in cds:
        mine: dict[tuple, list] = defaultdict(list)
        for c in d["classes"]:
            c = {**c, "src": url}
            if coursedata.course_key(c["name"]):
                idx["name"].setdefault(coursedata.course_key(c["name"]), c)
            if c.get("controls"):
                mine[coursedata.seq_key(c["controls"])].append(c)
        for s, cs in mine.items():
            idx["seq"].setdefault(s, cs)
        for cls, course in (d.get("assign") or {}).items():
            idx["assign"].setdefault(coursedata.course_key(cls), coursedata.course_key(course))
    alias, mixed = {}, set()
    for d in lists:
        for k in d.get("classes") or []:
            c, key = _by_codes(idx, k), coursedata.course_key(k["name"])
            if c and key and key not in idx["name"]:
                if alias.get(key, c) is not c:
                    mixed.add(key)
                alias[key] = c
    idx["alias"] = {key: c for key, c in alias.items() if key not in mixed}
    return idx


def _by_codes(idx: dict, k: dict) -> dict | None:
    """The course whose controls are the class's (the same codes in the same order), when one length and climb fit."""
    cs = idx["seq"].get(coursedata.seq_key(k["controls"])) if k.get("controls") else None
    return cs[0] if cs and len({(c["length_m"], c["climb_m"]) for c in cs}) == 1 else None


def course_for(idx: dict, k: dict) -> dict | None:
    """The course a results class ran: by its name (« Circuit A » = « A », or the name another list gave that course's
    codes), its circuit's (a list by category), its category's assignment in the course data, else by its controls."""
    names = idx["name"]
    for n in (k.get("name"), k.get("circuit")):
        key = coursedata.course_key(n) if n else ""
        c = (names.get(key) or idx["alias"].get(key)) if key else None
        if c:
            return c
    a = idx["assign"].get(coursedata.course_key(k.get("name")))
    if a and names.get(a):
        return names[a]
    return _by_codes(idx, k)


def fill_class(k: dict, c: dict) -> bool:
    """A class's missing length, climb and controls from its course (what the file gives is kept); the controls only
    when the runners' splits count as many, and in place of a split list's numbers (« #3 », a PDF printing no codes)
    when the codes it does print agree. True when something was added."""
    added = False
    for f in ("length_m", "climb_m"):
        if k.get(f) is None and c.get(f):
            k[f], added = c[f], True
    mine, theirs = k.get("controls"), c.get("controls")
    if theirs and not mine:
        n = {len(r["splits"]) for r in k.get("runners") or [] if r.get("splits")}
        if not n or n == {len(theirs)}:
            k["controls"], added = list(theirs), True
    elif theirs and len(mine) == len(theirs):
        numbered = [a == f"#{i + 1}" for i, a in enumerate(mine)]
        if any(numbered) and all(x or coursedata.seq_key([a]) == coursedata.seq_key([b])
                                 for x, a, b in zip(numbered, mine, theirs)):
            k["controls"], added = [b if x else a for x, a, b in zip(numbered, mine, theirs)], True
    return added


def fill_courses(entry: dict, parsed: dict, idx: dict | None) -> None:
    """A results document's classes, and its views by circuit and by category, given the length, climb and controls
    the file lacks: a category from its circuit's class, any class from the race's course data (the document then
    names that course data: « coursedata »)."""
    own = {k["name"]: k for k in parsed["classes"]}
    used = set()
    for group in (parsed["classes"], entry.get("circuits") or [], entry.get("catview") or []):
        for k in group:
            if k.get("circuit") in own and own[k["circuit"]] is not k:
                fill_class(k, own[k["circuit"]])
            c = course_for(idx, k) if idx else None
            if c and fill_class(k, c):
                used.add(c["src"])
    if used:
        entry["coursedata"] = sorted(used)


def start_lists(con, f: Fetcher, lr: LiveResultat, today: date) -> int:
    """The coming races' start lists, from the liveresultat competition assigned to each (races.assign): a document
    of kind "startlist", replaced by the results once the race has run (same address)."""
    hi = (today + timedelta(days=START_DAYS)).isoformat()
    org = set(store.meta_get(con, "org_starts", []) or [])
    soon = [r for r in con.execute("SELECT * FROM prov_races WHERE date_iso > ? AND date_iso <= ?", (today.isoformat(), hi)).fetchall()
            if r["key"] not in org]
    if not soon:
        return 0
    comps = [(c["id"], c["name"], c["organizer"], c["date"]) for c in lr.competitions() if today.isoformat() < c["date"] <= hi]
    seen = store.meta_get(con, "startlists", {})
    now = datetime.now(timezone.utc)
    changed = 0
    for key, pid in races.assign(soon, comps).items():
        last = seen.get(key)
        if f.out_of_time() or (last and now - datetime.fromisoformat(last) < timedelta(hours=START_EVERY)):
            continue
        if (lr.info(pid).get("timezone") or "Europe/Paris") != "Europe/Paris":
            continue
        d = lr.read(pid, startlist=True)
        seen[key] = now.isoformat(timespec="seconds")
        if d and any(r.get("start_s") for k in d["classes"] for r in k["runners"]):
            changed += save(con, key, PLATFORM_URL["liveresultat"].format(pid), "liveresultat", d, note=STARTLIST)
    # forget the races gone by
    store.meta_set(con, "startlists", {k: v for k, v in seen.items() if any(r["key"] == k for r in soon)})
    con.commit()
    return changed


def platform_start_lists(con, f: Fetcher, kind: str, reader, today: date) -> int:
    """The coming races' start lists from the MeOSDjango competition assigned to each (Orientation Data's too), read
    again every START_EVERY hours, as start_lists does for liveresultat; the results replace it (same address)."""
    hi = (today + timedelta(days=START_DAYS)).isoformat()
    org = set(store.meta_get(con, "org_starts", []) or [])
    soon = [r for r in con.execute("SELECT * FROM prov_races WHERE date_iso > ? AND date_iso <= ?", (today.isoformat(), hi)).fetchall()
            if r["key"] not in org]
    if not soon or reader is None:
        return 0
    comps = [(c["id"], c["name"], c["organizer"], c["date"]) for c in reader.competitions() if today.isoformat() < c["date"] <= hi]
    seen = store.meta_get(con, f"startlists_{kind}", {})
    now = datetime.now(timezone.utc)
    changed = 0
    for key, pid in races.assign(soon, comps).items():
        last = seen.get(key)
        if f.out_of_time() or (last and now - datetime.fromisoformat(last) < timedelta(hours=START_EVERY)):
            continue
        d = reader.read(pid, startlist=True)
        seen[key] = now.isoformat(timespec="seconds")
        if d and d["classes"]:
            changed += save(con, key, PLATFORM_URL[kind].format(pid), kind, d,
                            note=PLATFORM_STARTLIST.format({"heyries": "Orientation Data", "oresults": "OResults"}.get(kind, "MeOSDjango")))
    store.meta_set(con, f"startlists_{kind}", {k: v for k, v in seen.items() if any(r["key"] == k for r in soon)})
    con.commit()
    return changed


def save_announcements(con, race, found: dict, f: Fetcher, rivals) -> int:
    """The announcements the crawl found on the organiser's site: the table of their circuits, when they have one, kept
    as an « annonce » document of the race (a weekend's go to the race they are about)."""
    from .parsers import announcement
    changed = 0
    for url, text in found.get("announcements", []):
        if f.out_of_time() or con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (race["key"], url)).fetchone():
            continue
        a = f.get(download_url(url), conditional=False)
        d = announcement.parse(a.content) if a.status == 200 else None
        if not d:
            continue
        label = re.sub(r"(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])", " ", f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text} {d.get('head', '')}")
        if rivals and race["key"] not in races.owners([race, *rivals], label, False):
            continue
        races.save_circuits_doc(con, race["key"], url, "announcement", "Annonce de course : circuits et catégories",
                                "les catégories de chaque circuit (annonce de course)", d["circuits"], _now(), source="site")
        changed += 1
    return changed


def supersede_starts(con, key: str, kept: set[str]) -> int:
    """An organiser's start list replaced by a new file under another name (2026-10-22: « Departs-par-clubs-V2-22-octobre »
    beside the first one, which still ranked first — a runner more — and gave its old start times to the race page and
    the alerts): a list of the organiser's site goes when a newer one names most of its runners, or when a full look at
    the site found start lists of the race but no longer that one (`kept`). Returns the documents dropped."""
    docs = con.execute(f"""SELECT url, kind, parsed, found_at FROM prov_docs WHERE race_key = ? AND source = 'site'
                           AND kind IN ({",".join("?" * len(START_KINDS))}) ORDER BY found_at DESC""", (key, *START_KINDS)).fetchall()
    names = {x["url"]: {_name_key(r["name"]) for k in json.loads(x["parsed"])["classes"] for r in k["runners"] if r.get("name")}
             for x in docs if x["kind"] == "startlist" and x["parsed"]}
    gone = []
    for i, x in enumerate(docs):
        mine = names.get(x["url"])
        newer = [names[y["url"]] for y in docs[:i] if y["url"] in names and y["found_at"] > x["found_at"] and y["url"] not in gone]
        if kept and x["url"] not in kept or mine and any(len(mine & n) >= 0.8 * len(mine) for n in newer):
            gone.append(x["url"])
    for url in gone:
        con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (key, url))
    return len(gone)


def site_links(con, f: Fetcher, cs: ClubSite, today: date) -> int:
    """The coming races' announcement and start-time booking on their organiser's site (ClubSite.find mode
    "announce"): {key: {"ann", "book", "page", "date", "agenda_id", "at"}} in prov_meta « sitelinks ». A weekend's
    announcements go to the race they are about (races.owners), as in save_announcements. Returns the races whose
    links changed."""
    hi = (today + timedelta(days=LINK_DAYS)).isoformat()
    links = store.meta_get(con, "sitelinks", {}) or {}
    now = datetime.now(timezone.utc)
    due = [r for r in con.execute(f"SELECT * FROM prov_races WHERE date_iso >= ? AND date_iso <= ? AND COALESCE(country, 'FR') = 'FR' "
                                  f"AND key NOT LIKE '{RELAY}%' AND key NOT LIKE 'd%' ORDER BY date_iso", (today.isoformat(), hi)).fetchall()
           if not links.get(r["key"]) or now - datetime.fromisoformat(links[r["key"]]["at"]) >= timedelta(hours=LINK_EVERY)]
    due.sort(key=lambda r: (links.get(r["key"]) or {}).get("at", ""))
    changed = 0
    for race in due[:LINK_SITES]:
        if f.out_of_time():
            break
        sites = [s for s in dict.fromkeys([race["site"], races.club_site(con, race["org_code"])]) if s]
        old = links.get(race["key"]) or {}
        entry = {"date": race["date_iso"], "agenda_id": race["agenda_id"] or None, "at": now.isoformat(timespec="seconds")}
        if sites:
            f.race = race["key"]
            try:
                found = cs.find(race, sites, mode="announce")
            except Exception:
                log.exception("site links: %s", race["key"])
                found = None
            if found is None:                         # (a failed look keeps what an earlier one found)
                entry |= {k: old[k] for k in ("ann", "book", "page") if k in old}
            else:
                day = date.fromisoformat(race["date_iso"])
                rivals = con.execute(f"SELECT * FROM prov_races WHERE date_iso BETWEEN ? AND ? AND org_code = ? AND key != ? AND key NOT LIKE '{RELAY}%'",
                                     ((day - timedelta(days=1)).isoformat(), (day + timedelta(days=1)).isoformat(),
                                      race["org_code"], race["key"])).fetchall()
                # (a file, not a page: co-paca.info's season table, its link saying « annonce », is every race's)
                anns = [(u, t) for u, t in found.get("announcements") or []
                        if re.search(r"(?i)\.(pdf|docx?|odt)$", urllib.parse.urlsplit(u).path)
                        or re.search(r"drive\.google\.com/file|docs\.google\.com/document|1drv\.ms|dropbox", u)]
                if rivals:          # the weekend's other races: an announcement goes to the race it names
                    anns = [(u, t) for u, t in anns if race["key"] in races.owners(
                        [race, *rivals], re.sub(r"(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])", " ",
                                                f"{urllib.parse.unquote(u.rsplit('/', 1)[-1])} {t}"), False)]
                # the best placed: the race's own page or post before a file only naming it; two equally placed
                # with a sister race beside it, neither (the Agenda would show the wrong one)
                # (only a word in common is no evidence: rank 2 never shown)
                rank = found.get("ann_rank") or {}
                anns = [(u, t) for u, t in anns if rank.get(u, 2) <= 1]
                best = [u for u, _ in anns if rank.get(u, 2) == min((rank.get(x, 2) for x, _ in anns), default=2)]
                if len(best) == 1 or (best and not rivals):
                    entry["ann"] = best[0]
                books = found.get("bookings") or []
                if books:
                    entry["book"], entry["page"] = books[0][0], books[0][2]
                try:
                    changed += save_announcements(con, race, found, f, rivals)      # their circuits' table, when they have one
                except Exception:
                    log.exception("site links: announcement of %s", race["key"])
        if {k: entry.get(k) for k in ("ann", "book")} != {k: old.get(k) for k in ("ann", "book")}:
            changed += 1
        links[race["key"]] = entry
        con.commit()
    # the races past (and those gone from prov_races) forgotten
    keys = {r[0] for r in con.execute("SELECT key FROM prov_races WHERE date_iso >= ?", (today.isoformat(),))}
    store.meta_set(con, "sitelinks", {k: v for k, v in links.items() if k in keys and v.get("date", "") >= today.isoformat()})
    con.commit()
    return changed


def site_start_lists(con, f: Fetcher, cs: ClubSite, today: date) -> int:
    """The start lists and entry lists organisers post on their own sites before the race (« horaires de départ »):
    the races of today and the next START_DAYS days, START_SITES a run, each at most every START_EVERY hours. A list
    read becomes a document of kind "startlist"; a file not read (a PDF), a link (kind "startfile")."""
    from .parsers import startlist
    hi = (today + timedelta(days=START_DAYS)).isoformat()
    seen = store.meta_get(con, "startsites", {})
    now = datetime.now(timezone.utc)
    org = set(store.meta_get(con, "org_starts", []) or [])          # their organiser gave it: nothing to look for
    # (France's races: the search reads French words, site_docs)
    due = [r for r in con.execute(f"SELECT * FROM prov_races WHERE date_iso >= ? AND date_iso <= ? AND COALESCE(country, 'FR') = 'FR' AND key NOT LIKE '{RELAY}%' "
                                  "ORDER BY date_iso", (today.isoformat(), hi)).fetchall()
           if r["key"] not in org and (not seen.get(r["key"]) or now - datetime.fromisoformat(seen[r["key"]]) >= timedelta(hours=START_EVERY))]
    due.sort(key=lambda r: seen.get(r["key"], ""))
    changed = 0
    for race in due[:START_SITES]:
        if f.out_of_time():
            break
        sites = [s for s in dict.fromkeys([race["site"], races.club_site(con, race["org_code"])]) if s]
        seen[race["key"]] = now.isoformat(timespec="seconds")
        if not sites:
            continue
        f.race = race["key"]
        try:
            found = cs.find(race, sites, mode="start")
        except Exception:
            log.exception("start lists: %s", race["key"])
            continue
        day = date.fromisoformat(race["date_iso"])
        rivals = con.execute(f"SELECT * FROM prov_races WHERE date_iso BETWEEN ? AND ? AND org_code = ? AND key != ? AND key NOT LIKE '{RELAY}%'",
                             ((day - timedelta(days=1)).isoformat(), (day + timedelta(days=1)).isoformat(),
                              race["org_code"], race["key"])).fetchall()
        kept: set[str] = set()                        # the files this look found (all of them, once it ends)
        for url, text, via in found["docs"]:
            if f.out_of_time():
                break
            kept.add(url)                             # still linked (a file not ours is dropped below all the same)
            a = f.get(download_url(url), conditional=False)
            if a.status != 200:
                continue
            d = startlist.parse(a.content, a.url or url)
            head = (d or {}).get("head") or startlist.first_lines(a.content)
            # read to find out (it said nothing of itself): a start list by its content or its title, else not ours
            if d is None and via.endswith(MAYBE) and not re.search(r"(?i)d[ée]part|horaire|start ?list|inscrits", head):
                continue
            # the days it prints: this race's makes it ours; only a sister race's (« CL-Nuit-10-Oct-26 » for Sunday's
            # race), or a later one, makes it theirs; an earlier lone date is when it was printed
            days = startlist.all_dates(f"{url} {text} {head}")
            # (2026-10-17: O'Bugey's night list, « samedi 17 octobre », went to Sunday's race too: the sheet's own title
            # lines now count, and another format or weekday rules a file out, as for results; one already kept goes)
            if race["date_iso"] not in days and (days & {r["date_iso"] for r in rivals} or any(x > race["date_iso"] for x in days))                     or not_this_race(race, f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text} {head}"):
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], url))
                continue
            # the weekend's other races: a file goes to the race it is about, by its name, link and first lines
            # (« SPRINT1 » read as « SPRINT 1 »; the page numbers and clock times of the header left out)
            head = re.sub(r"(?i)\bpage\s*\d+|\d{1,2}:\d{2}(:\d{2})?|\(\d+/\d+\)", " ", head)
            label = re.sub(r"(?<=[A-Za-z])(?=[0-9])|(?<=[0-9])(?=[A-Za-z])", " ",
                           f"{urllib.parse.unquote(url.rsplit('/', 1)[-1])} {text} {head}")
            if rivals and race["key"] not in races.owners([race, *rivals], label, False):
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ? AND source = 'site'", (race["key"], url))
                continue
            # the file's hash with the reader's version: a better reader replaces an unchanged file's old reading (2026-10-17:
            # O'Bugey's sheet, read anew, was kept as first read because its content had not changed)
            changed += save(con, race["key"], url, "site", d, kind=None if d else "startfile", sha=f"{a.sha}|p{PARSER_VERSION}" if a.sha else None,
                            note=SITE_STARTLIST if d else f"{SITE_STARTLIST} · {text}".strip(" ·"))
        else:
            changed += supersede_starts(con, race["key"], kept)
        # the announcement on the organiser's site: its circuits' table, when it has one
        changed += save_announcements(con, race, found, f, rivals)
    store.meta_set(con, "startsites", {k: v for k, v in seen.items() if v >= (now - timedelta(days=START_DAYS + 2)).isoformat()})
    con.commit()
    return changed


ONGOING_QUIET_S = 5400         # a race still counts as under way this long after its latest finish (runners left « out »)


def ongoing(lives: list[dict], final: bool, now_s: float) -> int | None:
    """A race of today still under way, from what its live lists said when read (model.live_state): the number of
    runners out or yet to start, else None. Not when a list without that mark is published (the organiser's file,
    `final`), nor once the latest finish is ONGOING_QUIET_S old with no start to come (the runners a platform still
    shows « out » never came back: an organiser does not always mark them)."""
    if final:
        return None
    on = [x for x in lives if x.get("out") and (x.get("last") is None or now_s - x["last"] < ONGOING_QUIET_S
                                                  or (x.get("next") or 0) > now_s)]
    return max(x["out"] for x in on) if on else None


def build(con, out: Path, today: date) -> int:
    """site/data/prov/: index.json and one file per race of the last SHOW_DAYS days, and the coming races with a start
    list (« soon »)."""
    d = out / "prov"
    pub = d / "pub"
    pub.mkdir(parents=True, exist_ok=True)
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    lo = (today - timedelta(days=SHOW_DAYS)).isoformat()
    matcher, scorer = Matcher(con, today), Scorer(con, out / "fr" / "snap" / "official_scale.json")
    anon = privacy.load()                # the anonymised runners: their rows by licence, the unmatched ones by name
    index, relay_index, written = [], [], 0      # (O'Live's relays apart: « Analyse de course » alone lists them)
    hi = (today + timedelta(days=START_DAYS)).isoformat()
    far = (today + timedelta(days=ORG_START_DAYS)).isoformat()
    org_starts = set(store.meta_get(con, "org_starts", []) or [])
    cancelled = cancelled_keys(con)                 # (site_docs: its organiser's pages say so)
    # the O'Live documents a replacement race holds: its own, not the cancelled race's
    replaced = {r[0] for r in con.execute("SELECT url FROM prov_docs WHERE source = 'olive' AND race_key LIKE 'ol%' AND race_key NOT LIKE ?",
                                          (f"{RELAY}%",))}
    clock = datetime.now(ZoneInfo("Europe/Paris"))           # (a race's live lists: its times of day)
    now_s = clock.hour * 3600 + clock.minute * 60 + clock.second
    for race in con.execute("""SELECT * FROM prov_races WHERE date_iso >= ? AND (date_iso <= ? OR (date_iso <= ? AND EXISTS
                                 (SELECT 1 FROM prov_docs d WHERE d.race_key = prov_races.key AND d.kind IN ('startlist', 'startfile')))
                                 OR (date_iso <= ? AND EXISTS (SELECT 1 FROM prov_docs d WHERE d.race_key = prov_races.key
                                     AND d.kind = 'startlist' AND d.source = 'upload'))
                                 OR (date_iso <= ? AND key LIKE 'd%'))
                               ORDER BY date_iso DESC, name""", (lo, today.isoformat(), hi, far, far)).fetchall():
        docs = con.execute("SELECT * FROM prov_docs WHERE race_key = ? ORDER BY source, found_at", (race["key"],)).fetchall()
        if not race["key"].startswith("ol"):
            docs = [x for x in docs if not (x["source"] == "olive" and x["url"] in replaced)]
        # the same file under two addresses (http and https, with or without www): shown once, the https one
        docs.sort(key=lambda x: x["url"].startswith("http:"))
        seen_sha: set[str] = set()
        docs = [x for x in docs if not x["parsed"] or not x["sha"] or not (x["sha"] in seen_sha or seen_sha.add(x["sha"]))]
        if race["key"] in org_starts:                 # the organiser's start list alone (« Organisation › Horaires »)
            docs = [x for x in docs if x["kind"] not in START_KINDS or x["source"] == "upload"]
        ffco = scorer.ffco_figures(race["ffco_id"]) if race["ffco_id"] else {}
        # a race of another country (a declared one): its runners are not France's licensees, nothing scored on France's CN
        foreign = (race["country"] or "FR") != "FR"
        relay = race["key"].startswith(RELAY)          # a relay's legs (relays): split times only, nothing scored
        out_docs, n_run, n_lic, splits, lics = [], 0, 0, False, set()
        rlics, results = set(), False          # the runners recognised in lists of results (not start lists): the alert's
        lives, final = [], False               # the lists read while the race was under way; the organiser's own file
        all_parsed = [json.loads(doc["parsed"]) if doc["parsed"] else None for doc in docs]
        # a cancelled race (its organiser's pages say so) is not listed while it has no results of its own
        if race["key"] in cancelled and not any(p and p.get("classes") and p.get("kind") not in (*START_KINDS, "registration", "announcement", coursedata.KIND)
                                                for p in all_parsed):
            continue
        # the course setter's data (« Organisation › Tracer »): no list of results; the uploads first, the newest first.
        # Courses are secret until the race (the setters' own pages): used from the race's day (results come after the
        # runners' finish), its courses listed from the day after
        cds = sorted(((doc, p) for doc, p in zip(docs, all_parsed) if p and p.get("kind") == coursedata.KIND),
                     key=lambda x: x[0]["changed_at"] or "", reverse=True)
        cds.sort(key=lambda x: x[0]["source"] != "upload")
        lists = [p for p in all_parsed if p and p.get("kind") != coursedata.KIND]
        courses = course_index([(doc["url"], p) for doc, p in cds], lists) if race["date_iso"] <= today.isoformat() else None
        share_starts(lists)
        circuits = category_circuits(lists)
        for doc, parsed in zip(docs, all_parsed):
            entry = {"url": doc["url"], "source": doc["source"], "kind": doc["kind"], "title": doc["title"],
                     "found": doc["found_at"], "changed": doc["changed_at"], "note": doc["note"]}
            if parsed and parsed.get("kind") == coursedata.KIND:
                if race["date_iso"] > today.isoformat():
                    continue
                if race["date_iso"] < today.isoformat():
                    entry["courses"] = [{f: c.get(f) for f in ("name", "length_m", "climb_m", "controls")} for c in parsed["classes"]]
                out_docs.append(entry)
                continue
            if parsed:
                # a list whose classes are mostly categories is one by category, whatever an older reading said
                names = [k["name"] for k in parsed["classes"]]
                if names and parsed.get("kind") not in ("startlist", "registration", "announcement"):
                    parsed["by"] = "category" if sum(1 for n in names if model.category(n)) >= 0.6 * len(names) else parsed.get("by")
                entry["by"] = parsed.get("by")
                for k in parsed["classes"]:
                    for r in k["runners"]:
                        r["lic"] = None if foreign else matcher.match(r)
                        if r["lic"] and not r.get("category"):       # lists by circuit rarely print it: the CN data's
                            r["catCn"] = matcher.info[r["lic"]]["cat"]
                        if r["lic"] and r["lic"] in ffco:
                            r["ffco"] = ffco[r["lic"]]
                        privacy.anonymise_row(anon, r)
                        r.pop("card", None)              # a SportIdent number tells runners apart (the matching), never shown
                    if parsed.get("by") != "category" and parsed.get("kind") != "startlist" and not foreign and not relay:
                        k["values"] = scorer.score_class(k, race, race["ffco_id"])
                    if any(r.get("splits") for r in k["runners"]):
                        splits = True
                if parsed.get("by") == "category" and parsed.get("kind") != "startlist" and circuits and not foreign:
                    score_by_circuit(parsed, circuits, scorer, race)
                    entry["circuits"] = circuit_view(parsed)
                # a list by circuit giving most runners' categories: seen by category too
                runners_all = [r for k in parsed["classes"] for r in k["runners"]]
                if parsed.get("by") != "category" and parsed.get("kind") != "startlist" and runners_all and not relay and \
                        sum(1 for r in runners_all if r.get("category") or r.get("catCn")) >= 0.6 * len(runners_all):
                    entry["catview"] = category_view(parsed)
                    for k in parsed["classes"]:          # each circuit's categories, for its heading
                        k["categories"] = sorted({r.get("category") or r.get("catCn") for r in k["runners"]} - {None})
                if parsed.get("kind") not in START_KINDS:
                    fill_courses(entry, parsed, courses)
                entry["classes"] = parsed["classes"]
                runners = [r for k in parsed["classes"] for r in k["runners"]]
                n_run = max(n_run, len(runners))
                n_lic = max(n_lic, sum(1 for r in runners if r["lic"]))
                lics.update(r["lic"] for r in runners if r["lic"])
                if parsed.get("kind") not in ("startlist", "registration", "announcement") and runners:
                    results = True
                    rlics.update(r["lic"] for r in runners if r["lic"])
                    if parsed.get("live") and race["date_iso"] == clock.date().isoformat():
                        lives.append(parsed["live"])
                    elif doc["source"] in ("upload", "site", "direct"):
                        final = True               # the organiser's own file (or broadcast, nobody out): the race is over
            out_docs.append(entry)
        most = max((sum(len(k["runners"]) for k in e.get("classes") or []) for e in out_docs), default=0)
        for e in out_docs:
            e["prio"] = doc_priority(e, most)
        out_docs.sort(key=lambda e: -e["prio"])
        body = {k: race[k] for k in ("key", "date_iso", "name", "place", "org", "org_code", "terrain", "epreuve", "cn", "site",
                                      "agenda_id", "ffco_id", "first_seen", "last_check", "next_check", "done", "country")}
        on = ongoing(lives, final, now_s)
        if on:
            body["ongoing"] = on
        body["docs"] = out_docs
        (d / f"{race['key']}.json").write_text(dump(body), encoding="utf-8")
        (pub / f"{race['key']}.json").write_text(dump(public_copy(body)), encoding="utf-8")
        written += 1
        (relay_index if relay else index).append({k: race[k] for k in ("key", "date_iso", "name", "place", "org", "terrain", "epreuve", "cn", "ffco_id",
                                           "last_check", "next_check", "done", "country")} |
                     {"docs": len([x for x in out_docs if x.get("classes")]), "refused": len([x for x in out_docs if x["kind"] in ("refused", "platform")]),
                      "runners": n_run, "matched": n_lic, "splits": splits, "region": region_of(race["org_code"]),
                      "pos": race_pos(race),
                      "site": bool(race["site"] or races.club_site(con, race["org_code"])),
                      "agenda_id": race["agenda_id"] or None, "soon": race["date_iso"] > today.isoformat() or None,
                      "startlist": any(x["kind"] in START_KINDS for x in out_docs) or None,
                      "lics": sorted(lics),
                      # a list of results among them (notify.py: « mise en ligne »), and its runners when they differ from lics
                      "results": results or None, "rlics": sorted(rlics) if results and rlics != lics else None,
                      # the race under way: its lists are partial (the runners out or yet to start); notify.py waits
                      "ongoing": on,
                      "live": live_ids(con, race["key"]) if race["date_iso"] >= (today - timedelta(days=1)).isoformat() else None,
                      "sources": sorted({x["source"] for x in out_docs if x.get("classes")})} |
                     ({"url": race["site"]} if race["key"].startswith("d") and race["site"] else {}))
    names = {r["key"]: {"key": r["key"], "name": r["name"], "date": r["date_iso"]} for r in index}
    blocked = [{"host": b["host"], "kind": b["kind"], "example": b["example"], "first": b["first_seen"], "last": b["last_seen"],
                "hits": b["hits"], "races": [names.get(k) or {"key": k} for k in json.loads(b["races"] or "[]")]}
               for b in con.execute("SELECT * FROM prov_blocked ORDER BY last_seen DESC").fetchall()]
    (d / "blocked.json").write_text(json.dumps({"generated": _now(), "sites": blocked}, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
    whole = {"generated": _now(), "races": index, "relays": relay_index, "runs": store.meta_get(con, "runs", [])[-12:],
             "due": len(races.due(con, today, _now()))}
    (d / "index.json").write_text(dump(whole), encoding="utf-8")
    # the coming races' announcement and start-time booking found on their organisers' sites (site_links), by the
    # Agenda's event id: public links, the same for every reader
    found = {str(v["agenda_id"]): {k: v[k] for k in ("ann", "book") if v.get(k)}
             for v in (store.meta_get(con, "sitelinks", {}) or {}).values()
             if v.get("agenda_id") and v.get("date", "") >= today.isoformat() and (v.get("ann") or v.get("book"))}
    for folder in (d, pub):
        (folder / "links.json").write_text(dump({"generated": _now(), "events": found}), encoding="utf-8")
    (pub / "index.json").write_text(dump(whole | {k: [{f: v for f, v in r.items() if f not in PUB_INDEX_DROP} for r in rs]
                                                  for k, rs in (("races", index), ("relays", relay_index))}), encoding="utf-8")
    keep = {f"{r['key']}.json" for r in index + relay_index} | {"index.json", "blocked.json", "links.json"}
    for folder in (d, pub):
        for old in folder.glob("*.json"):
            if old.name not in keep:
                old.unlink()
    return written


def run(db: Path, out: Path, agenda: Path | None = None, days: int = KEEP_DAYS - 4, budget_s: float = 240,
        today: date | None = None) -> dict:
    t0 = time.monotonic()
    today = today or date.today()
    con = store.connect(db)
    # (OResults was put on the owner's list of sites refusing robots by mistake for a run on 2026-11-15: it refuses nothing)
    con.execute("DELETE FROM prov_blocked WHERE host = 'oresults.eu'")
    # catching up (the first runs: the WinSplits backlog, races never looked at): a larger budget until done
    if WinSplits(None, con).catching_up() or con.execute("SELECT COUNT(*) FROM prov_races WHERE last_check IS NULL").fetchone()[0] > 10:
        budget_s *= CATCH_UP
    f = Fetcher(con, budget_s=budget_s)
    try:
        agenda = agenda or (out / "fr" / "agenda.json")     # France's (site/data/fr since 2026-10-22)
        races.refresh_clubs(con, agenda)
        stats = races.sync(con, agenda, today, days)
        # the other countries' agendas (countries/<cc>: Spain's from 2026-10-22): their races, keyed by their own ids
        try:
            import countries
            for m in countries.modules():
                if m.COUNTRY.code != "FR" and m.COUNTRY.results and hasattr(m, "agenda_path"):
                    got = races.sync_country(con, m.agenda_path(out), today, days, m.COUNTRY.code)
                    stats[f"added_{m.COUNTRY.key}"] = got["added"]
        except Exception:
            log.exception("provisional: another country's agenda failed")
        stats["renamed"] = canonical_docs(con)
        try:
            stats["club_dir"] = races.read_directory(con, f, every_days=14)
        except Exception:
            log.exception("provisional: club directory failed")
        # FFCO's ligues and committees with their websites, and the clubs each lists (Stats › Clubs › « Annuaire »)
        try:
            stats["structures"] = clubdir.read(con, f)["read"]
        except Exception:
            log.exception("provisional: structures directory failed")
        # the races already past when the pilot started, or before a longer window (the agenda drops a race once
        # run), from FFCO's agenda export — one request each time the window reaches further back than the last one
        # (agreed with the owner: the first month, 2026-10-08; back to early August when the list went to 60 days)
        lo_bf = (today - timedelta(days=days)).isoformat()
        covered = store.meta_get(con, "agenda_backfill_from", None)
        if covered is None or lo_bf < covered:
            try:
                from .. import agenda as ffco_agenda
                rows = [ffco_agenda._csv_event(x, "c") for x in ffco_agenda.read_csv("cou", lo_bf)]
                stats["backfilled"] = races.backfill(con, rows, lo_bf, today.isoformat())
                store.meta_set(con, "agenda_backfill_from", lo_bf)
            except Exception:
                log.exception("provisional: agenda backfill failed")
        # the competitions organisers declared outside France (sources.declared): their races, before their files
        stats["declared"] = declared.apply(con, Path(db).parent / "declared")
        # the files organisers uploaded on « Récemment » (sources.upload): read first, they are the freshest news
        uploaded = upload.apply(con, Path(db).parent / "uploads", save, parse_any,
                                reread=store.meta_get(con, "parser_version") != PARSER_VERSION)
        stats["uploads"] = uploaded
        # the organisers' live broadcasts tied to a competition (sources.broadcast): their results or start list
        stats["broadcasts"] = broadcast.apply(con, Path(db).parent / "broadcasts", save)
        ws = WinSplits(f, con)
        # a share of the budget only (2-3 s per WinSplits page): a long catch-up never leaves the races unlooked at
        stats["winsplits_new"] = len(ws.discover(limit=max(30, int(budget_s / 6))))
        lr, cs, hy, hg, md, ol = LiveResultat(f), ClubSite(f), Heyries(f), Helga(f, con), MeOSDjango(f, con), OLive(f)
        si, orr = SportIdent(f), OResults(f)
        stats["helga_new"] = hg.discover(limit=max(20, int(budget_s / 4)))
        looked = failed = 0
        changed = uploaded + stats["declared"] + stats["broadcasts"]
        # a new parser version reads again the documents already seen (an unchanged file is otherwise skipped)
        reread = store.meta_get(con, "parser_version") != PARSER_VERSION
        recollect = store.meta_get(con, "collect_version", None) != COLLECT_VERSION
        # the coming races' start lists, read again at once for a new reader version (site_start_lists): its own marker,
        # set at once — « parser_version » is only stored by a run the budget did not cut, so `reread` may hold run after
        # run, and clearing the start lists' memory each time left the week's later races unsearched (2026-10-17)
        if store.meta_get(con, "startlist_version", None) != PARSER_VERSION:
            store.meta_set(con, "startsites", {})
            store.meta_set(con, "startlist_version", PARSER_VERSION)
        if reread or recollect:             # including the races already finished with, of the period shown
            con.execute("UPDATE prov_races SET done = 0, next_check = ? WHERE date_iso >= ?",
                        (_now(), (today - timedelta(days=KEEP_DAYS)).isoformat()))
            store.meta_set(con, "collect_version", COLLECT_VERSION)
        # the platforms' competitions, assigned to the races of the period one-to-one (races.assign)
        period = con.execute("SELECT * FROM prov_races WHERE date_iso >= ? AND date_iso <= ?",
                             ((today - timedelta(days=KEEP_DAYS)).isoformat(), today.isoformat())).fetchall()
        # a cancelled race takes no platform's competition (2026-10-24: WinSplits' « Sprint-labyrinthe Le Bessat, NOSE », the
        # replacement's, went to the cancelled CF Sprint final by its organiser and day): its replacement, when there is one, does
        cancelled = cancelled_keys(con)
        period = [r for r in period if r["key"] not in cancelled and not r["key"].startswith(RELAY)]     # (relays: their own)
        lo = (today - timedelta(days=KEEP_DAYS)).isoformat()
        # liveresultat lists every country's competitions: one goes to a race only in its country's time zones, as
        # LiveResultat.candidates does (2026-10-30: Sweden's « Halloween-Natta » had gone to Nouméa's « Kids Halloween » by
        # the one word they share, and the Agenda offered its live results)
        # (no time zone declared: a Swedish race, liveresultat's home — the live relay's rule, live/src/index.js countryOf;
        # « timediff » cannot tell: Sweden and France share a clock; overseas France counts as France)
        def lr_here(country, cid):
            zones = time_zones(country)
            if zones and "Europe/Paris" in zones:
                zones = zones + FR_OVERSEAS
            return zones is None or (lr.info(cid).get("timezone") or "Europe/Stockholm") in zones
        lr_map = races.assign(period, [(c["id"], c["name"], c["organizer"], c["date"]) for c in lr.competitions() if c["date"] >= lo],
                              accept=lambda r, cid: lr_here(r["country"], cid))
        # and a liveresultat document kept before from another country's time zone goes
        for d in con.execute("SELECT d.race_key, d.url, r.country FROM prov_docs d JOIN prov_races r ON r.key = d.race_key "
                             "WHERE d.source = 'liveresultat' AND r.date_iso >= ?", (lo,)).fetchall():
            m = LIVE_IDS[0][0].search(d["url"] or "")
            if m and not lr_here(d["country"], int(m[1])):
                log.info("provisional: %s drops %s (another country's time zone)", d["race_key"], d["url"])
                con.execute("DELETE FROM prov_docs WHERE race_key = ? AND url = ?", (d["race_key"], d["url"]))
                changed += 1
        ws_events = store.meta_get(con, "winsplits", {"events": {}})["events"]
        ws_map = races.assign(period, [(int(k), e["name"], e["organiser"], e["date"]) for k, e in ws_events.items() if e["date"] >= lo])
        hy_map = races.assign(period, [(c["id"], c["name"], c["organizer"], c["date"]) for c in hy.competitions() if c["date"] >= lo])
        hg_map = races.assign(period, [(int(k), e["name"], "", e["date"]) for k, e in hg.events().items() if e["date"] >= lo])
        md_map = races.assign(period, [(c["id"], c["name"], c["organizer"], c["date"]) for c in md.competitions() if c["date"] >= lo])
        ol_map = races.assign(period, [(c["id"], c["name"], c["organizer"], c["date"]) for c in ol.competitions() if c["date"] >= lo])
        # SPORTident Center: each country's events (France: a race without one), matched to that country's races only
        si_map = {}
        for cc in sorted({r["country"] or "FR" for r in period}):
            mine = [r for r in period if (r["country"] or "FR") == cc]
            si_map.update(races.assign(mine, [(c["id"], c["name"], c["organizer"], c["date"])
                                              for c in si.competitions(cc, lo, today.isoformat())]))
        # OResults likewise (one list of every listed event, relays apart)
        or_map = {}
        for cc in sorted({r["country"] or "FR" for r in period}):
            mine = [r for r in period if (r["country"] or "FR") == cc]
            or_map.update(races.assign(mine, [(c["id"], c["name"], c["organizer"], c["date"])
                                              for c in orr.competitions(cc, lo, today.isoformat())]))
        # a race comes back at once when a platform competition is newly matched to it (a WinSplits event found later
        # by the backward fill, a Helga event, an Orientation Data competition published after the last look) — a race
        # still watched too, rather than at its next daily look
        for kind, mp in (("liveresultat", lr_map), ("winsplits", ws_map), ("heyries", hy_map), ("helga", hg_map), ("meosdjango", md_map),
                         ("olive", ol_map), ("sportident", si_map), ("oresults", or_map)):
            for key, pid in mp.items():
                if not con.execute("SELECT 1 FROM prov_docs WHERE race_key = ? AND url = ?", (key, PLATFORM_URL[kind].format(pid))).fetchone():
                    con.execute("UPDATE prov_races SET done = 0, next_check = ? WHERE key = ? AND (done = 1 OR next_check > ?)",
                                (_now(), key, _now()))
        changed += start_lists(con, f, lr, today)
        changed += platform_start_lists(con, f, "meosdjango", md, today) + platform_start_lists(con, f, "heyries", hy, today)
        changed += platform_start_lists(con, f, "oresults", orr, today)
        changed += site_start_lists(con, f, cs, today)
        try:
            changed += relays(con, ol, agenda, today)
        except Exception:
            log.exception("provisional: O'Live's relays failed")
        due = [r for r in races.due(con, today, _now()) if not r["key"].startswith(RELAY)]
        # a race its organiser gave results for (sources.upload): those are used as they are, nothing looked for elsewhere
        org_races = set(store.meta_get(con, "org_races", []) or [])
        cut = False
        for race in due:
            if f.out_of_time():
                cut = True
                break
            if race["key"] in org_races:
                races.schedule(con, race, today)
                con.commit()
                continue
            f.race = race["key"]
            try:
                links = {"liveresultat": lr_map.get(race["key"]), "winsplits": ws_map.get(race["key"]), "heyries": hy_map.get(race["key"]),
                         "helga": hg_map.get(race["key"]), "meosdjango": md_map.get(race["key"]), "olive": ol_map.get(race["key"]),
                         "sportident": si_map.get(race["key"]), "oresults": or_map.get(race["key"]),
                         **json.loads(race["links"] or "{}")}
                changed += look(con, race, f, lr, ws, hy, cs, links, reread, hg, md, ol, si, orr)
            except Exception:                         # one race's odd page must not stop the others
                log.exception("provisional: %s failed", race["key"])
                failed += 1
            if f.out_of_time() and looked:            # cut short by the budget: first in the next run (unless it had it all)
                cut = True
                break
            races.schedule(con, race, today)
            con.commit()
            looked += 1
        if not f.out_of_time():
            try:
                changed += site_links(con, f, cs, today)
            except Exception:
                log.exception("provisional: the organisers' announcements failed")
        stats.update(looked=looked, changed=changed, failed=failed, requests=f.requests)
        log_runs = store.meta_get(con, "runs", []) + [{"at": _now(), "due": len(due), "looked": looked, "changed": changed,
                                                        "failed": failed, "requests": f.requests, "cut": cut,
                                                        "seconds": round(time.monotonic() - t0), "budget": round(budget_s)}]
        store.meta_set(con, "runs", log_runs[-48:])
        if reread and not f.out_of_time():
            store.meta_set(con, "parser_version", PARSER_VERSION)
        stats["built"] = build(con, out, today)
        try:
            if clubdir.build(con, out / "fr"):      # France's clubdir.json, when a website or a club changed
                stats["clubdir"] = True
                stats["changed"] = stats.get("changed", 0) + 1
        except Exception:
            log.exception("provisional: clubdir.json failed")
        if store.meta_get(con, "index_version", None) != INDEX_VERSION:
            store.meta_set(con, "index_version", INDEX_VERSION)
            stats["reshaped"] = True
        con.commit()
    finally:
        f.close()
        con.close()
    stats["seconds"] = round(time.monotonic() - t0)
    return stats


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--db", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("site/data"))
    ap.add_argument("--days", type=int, default=KEEP_DAYS - 4, help="races of the last N days taken in (each looked at, then watched 14 days)")
    ap.add_argument("--budget", type=float, default=240, help="seconds of fetching, at most")
    ap.add_argument("--build-only", action="store_true", help="rebuild the files from what is stored, fetch nothing")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if a.build_only:
        con = store.connect(a.db)
        print("built", build(con, a.out, date.today()))
        return
    print(run(a.db, a.out, days=a.days, budget_s=a.budget))
