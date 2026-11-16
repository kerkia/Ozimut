"""The organiser's own website: where clubs post their result and split-time files after a race.

Every club does it differently (WordPress uploads, a Joomla article, Blogger + Google Drive, the federation's
CMS, Wix, a static page…), so this looks in three ways and keeps what points to this race:
 1. WordPress: the files uploaded since the race (wp-json media) and the posts published since (their links);
 2. Blogger: the posts published since the race (JSON feed);
 3. any site: the race's page (the agenda's link) and the home page, then up to a few pages they link to that
    look like results or this event, collecting links to documents (PDF, HTML, XML, spreadsheets). A site on a
    subdomain (a race's own site, 'ocastor.go78.org') brings in its club's main site ('www.go78.org') too, and a
    home page that only redirects (<meta http-equiv="refresh">) is followed.
A document link is kept when its address or text says results / split times AND names this race (its date,
its place or words of its name), or when it was uploaded after the race on a WordPress site and names nothing
else. Links to platforms (liveresultat, WinSplits, Livelox, Helga) are reported too: WinSplits and
liveresultat ids found here are read directly, and so are Helga's SplitsBrowser links (sources.helga); Helga's
results pages are only noted (they are not open to robots), Livelox's left out (GPS tracks sent, not results).
A link to /competition/<n>/ on another host may be a MeOSDjango site's: reported, and probed (sources.meosdjango).
"""

from __future__ import annotations

import heapq
import html as htmllib
import json
import re
import urllib.parse
from datetime import date, timedelta

from ..model import plain

DOC_EXT = (".pdf", ".htm", ".html", ".xml", ".xls", ".xlsx", ".csv", ".txt")
RESULT_WORDS = ("resultat", "result", "resutat", "classement", "temps", "inter", "split", "provisoire", "circuit", "categorie", "si_", "-si")
NOT_RESULTS = ("relais", "relay", "depart", "horaire", "startlist", "start list", "inscrit", "inscription", "annonce", "invitation", "convocation",
               "reglement", "fleche", "plan d acces")
# start lists (mode "start", before the race): « horaires de départ », « liste de départ », « inscrits »
START_WORDS = ("depart", "horaire", "startlist", "start list", "start-list", "starttime", "inscrits", "engages", "heures de")
NOT_START = ("resultat", "result", "classement", "split", "temps inter", "provisoire", "annonce", "invitation", "convocation",
             "reglement", "fleche", "plan d acces", "acces", "covoiturage", "hebergement", "restauration", "bulletin")
START_DAYS_BEFORE = 21          # a start list (or its announcement) is posted in the weeks before the race
# mode "announce" (run.site_links): the race's announcement and its start-time booking, posted weeks ahead (COLE's of
# 6 December 2026 in October) — the race's own page or post on the organiser's site, when FFCO's page links none
ANNOUNCE_DAYS_BEFORE = 75
# a start-time booking (« Choisir son horaire de départ : https://docs.google.com/spreadsheets/… »): a shared sheet or
# form the organiser links on the race's page, said so by the link's text or the words just before it
BOOK_LINK = re.compile(r"(?i)docs\.google\.com/(?:spreadsheets|forms)/|forms\.gle/|forms\.office\.com/|forms\.microsoft\.com/|"
                       r"framaforms\.org/|framadate\.org/|framacalc\.org/|ethercalc\.|doodle\.com/|"
                       r"(?:sharepoint\.com|onedrive\.live\.com|1drv\.ms)/:x:|/#/horaire\?course=")
BOOK_WORDS = ("horaire", "depart", "heure de", "heures de", "creneau", "start time")
PAGE_WORDS = ("resultat", "result", "organisation", "competition", "course", "evenement", "event", "actualite", "news",
              "archive", "saison", "orga", "programme")
STOP = {"de", "la", "le", "du", "des", "et", "co", "course", "orientation", "club", "d", "l", "les", "en", "a", "au",
        "regionale", "departementale", "nationale", "championnat", "ligue", "dep", "sprint", "md", "ld", "nuit"}
MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]
MAX_PAGES = 14                  # pages read per race and run, at most
NOT_PAGES = ("share=", "trackback", "/feed", "replytocom", "wp-login", "/tag/", "/author/", "print=", "#respond", "/comments",
             "iccaldate", "calendrier", "calendar", "/agenda", "ical", "?date=", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".zip", "albumphoto", "/photos", "photo-", "galerie",
             "gallery", "whatsappimage", "/wp-content/uploads/", "/media/uploaded/", "login", "connexion", "inscription")
# shared hosts: a site on one of their subdomains has nothing to do with the parent domain
SHARED_HOSTS = ("blogspot.", "wixsite.com", "wordpress.com", "e-monsite.com", "over-blog.com", "jimdofree.com", "jimdo.com",
                "free.fr", "webnode.", "sportsregions.fr", "clubeo.com", "kalisport.com", "github.io", "netlify.app",
                "pagesperso-orange.fr", "alwaysdata.net", "assoconnect.com", "helloasso.com", "google.com")
# hosts of uploaded files (no extension in their addresses)
FILE_HOSTS = ("res.cloudinary.com", "dl.dropboxusercontent.com", "www.dropbox.com", "dropbox.com", "1drv.ms",
              "docs.google.com", "drive.google.com")
PLATFORMS = {"liveresultat.orientering.se": "liveresultat", "obasen.orientering.se": "winsplits", "livelox.com": "livelox",
             "helga-o.com": "helga", "helga-o.live": "helga", "co-live.fr": "olive", "routegadget": "routegadget", "heyries.alwaysdata.net": "heyries",
             "oreplay.es": "oreplay", "center.sportident.com": "sportident", "si.events": "sportident",
             # OResults (2026-11-15, Balise 77's Larchant; read by sources.oresults since 2026-11-16)
             "oresults.eu": "oresults"}
MEOSDJANGO_PATH = re.compile(r"^/competition/\d+(?:/|$)")


_HEADING = re.compile(r"(?is)<(h[1-6]|strong|b|th|dt|caption|legend)\b[^>]*>(.*?)</\1>")


def _links(page: str, base: str) -> list[tuple[str, str]]:
    """(absolute url, link text) of every <a href> of a page. A short link text (« Résultats SI », « Télécharger ») gets
    the heading it sits under (« Régionale LIFCO, le 11/10/2026 à Montigny »): on a page listing every event of a club,
    the link alone says neither which race nor which day."""
    out = []
    for m in re.finditer(r'(?is)<a\b[^>]*?href\s*=\s*["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', page):
        href, text = htmllib.unescape(m.group(1).strip()), m.group(2)
        if href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        text = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", text))).strip()
        if len(text) < 30:
            heads = list(_HEADING.finditer(page, max(0, m.start() - 2500), m.start()))
            if heads:
                ctx = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", heads[-1].group(2)))).strip()
                if ctx and len(ctx) <= 200:
                    text = f"{text} — {ctx}"
        url = urllib.parse.urljoin(base, href)
        # a Cloudinary file's address changes at each page load (« /v1791801252/ », « ?_a=… »): its stable form
        if _host(url) == "res.cloudinary.com":
            url = re.sub(r"/v[0-9]+/", "/", url.split("?", 1)[0])
        out.append((url, text))
    return out


def _link_ctx(page: str, base: str) -> list[tuple[str, str, str]]:
    """(absolute url, link text, the text just before the link) of a page's links: « Choisir son horaire de départ : »
    before a bare address says what it is."""
    out = []
    for m in re.finditer(r'(?is)<a\b[^>]*?href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', page):
        href = htmllib.unescape(m.group(1).strip())
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        text = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        before = re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", page[max(0, m.start() - 600):m.start()]))).strip()
        out.append((urllib.parse.urljoin(base, href), text, before[-120:]))
    return out


def _host(url: str) -> str:
    return urllib.parse.urlsplit(url).netloc.lower().removeprefix("www.")


def _domain(url: str) -> str:
    """The club's own domain: 'new.co-lorient.fr' and 'www.co-lorient.fr' are one site; on a shared host
    ('x.wordpress.com', 'y.wixsite.com') a neighbouring subdomain is someone else's, so the whole name."""
    host = _host(url).split(":")[0]
    if any(h in host for h in SHARED_HOSTS):
        return host
    return ".".join(host.split(".")[-2:])


def _root(url: str) -> str:
    u = urllib.parse.urlsplit(url)
    return f"{u.scheme}://{u.netloc}"


def parent_site(url: str) -> str | None:
    """The main site of a subdomain's domain: 'https://ocastor.go78.org/x' -> 'https://www.go78.org/'."""
    u = urllib.parse.urlsplit(url)
    host = u.netloc.lower().split(":")[0]
    labels = host.split(".")
    if len(labels) < 3 or labels[0] == "www" or any(h in host for h in SHARED_HOSTS) or labels[-1].isdigit():
        return None
    return f"{u.scheme or 'https'}://www.{'.'.join(labels[-2:])}/"


def date_tokens(d: date) -> list[str]:
    """How a race date shows in file names and titles: 2026-10-04, 20261004, 04102026, 04-10-2026, 4 octobre…"""
    y, m, dd = d.year, d.month, d.day
    return [f"{y}-{m:02d}-{dd:02d}", f"{y}{m:02d}{dd:02d}", f"{dd:02d}{m:02d}{y}", f"{dd:02d}-{m:02d}-{y}", f"{dd:02d}_{m:02d}_{y}",
            f"{dd:02d}.{m:02d}.{y}", f"{dd:02d}/{m:02d}/{y}", f"{dd:02d}-{m:02d}-{str(y)[2:]}", f"{dd} {MONTHS[m - 1]}",
            f"{dd:02d} {MONTHS[m - 1]}", f"{dd:02d}{m:02d}{str(y)[2:]}", f"{y}/{m:02d}/{dd:02d}"]


# a month as written in names and titles, accents removed (« juin » and « juillet » both begin « jui »)
MONTH_ABBR = [("janv", "jan"), ("fevr", "fev"), ("mars", "mar"), ("avr",), ("mai",), ("juin",), ("juil",), ("aout",),
              ("sept", "sep"), ("oct",), ("nov",), ("dec",)]


def names_day(text: str, d: date) -> bool:
    """The race's day written in a text (accents removed): « 4 octobre », « 04 oct. 2026 », « 04-oct-2026 », « 04oct »,
    « 04/10/2026 », « dimanche 4 octobre »…"""
    months = "|".join(MONTH_ABBR[d.month - 1])
    # (a weekend's range names its first day too: « 10 et 11 octobre », « 10-11 oct. », « du 10 au 11 octobre »)
    return bool(re.search(rf"(?<!\d)0?{d.day}(?:er)?(?:[\s\-_.,&]*(?:et|au)?[\s\-_.,&]*[0-3]?\d(?:er)?)?[\s\-_.]*(?:{months})", text)
                or any(t in text for t in date_tokens(d)[:8]))


def other_day(text: str, d: date) -> bool:
    """A file named for another day (« 20250309_CRMD… », « 2026-04-11 », « 11-04-2026 ») is another race's."""
    for m in re.finditer(r"(?<!\d)(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)(?!\d)|(?<!\d)([0-3]\d)[-_.]?([01]\d)[-_.]?(20\d\d)(?!\d)", text):
        y, mo, dd = (m.group(1), m.group(2), m.group(3)) if m.group(1) else (m.group(6), m.group(5), m.group(4))
        try:
            other = date(int(y), int(mo), int(dd))
        except ValueError:
            continue
        if abs((other - d).days) > 1:
            return True
    return False


def uploaded_before(url: str, d: date) -> bool:
    """A WordPress file uploaded in a month before the race's (/wp-content/uploads/2019/05/…) cannot be its results."""
    m = re.search(r"/uploads/(20\d\d)/([01]\d)/", url)
    return bool(m) and (int(m.group(1)), int(m.group(2))) < (d.year, d.month)


def other_year(name: str, d: date) -> bool:
    """A file named for another year (« 2025-challenge-poitiers-co… » on a page listing every season's results) is
    another season's race. Only the file's own name and its link's text: a WordPress folder (/uploads/2025/12/) says
    when it was uploaded, not which race it is."""
    years = {int(y) for y in re.findall(r"(?<![0-9a-z])(20\d\d)(?![0-9])", name.lower())}
    return bool(years) and d.year not in years


_MONTH_RE = "|".join(a for abbrs in MONTH_ABBR for a in abbrs)


def days_named(text: str) -> set[tuple[int, int]]:
    """The (month, day) a text names (accents removed): « 11-oct-2026 », « le 4 octobre », « 2026/10/03 », « 03/10/2026 »."""
    out = set()
    for m in re.finditer(rf"(?<!\d)([0-3]?\d)(?:er)?[\s\-_.]*({_MONTH_RE})", text):
        month = next((i + 1 for i, abbrs in enumerate(MONTH_ABBR) if any(m.group(2).startswith(a) for a in abbrs)), None)
        if month and 1 <= int(m.group(1)) <= 31:
            out.add((month, int(m.group(1))))
    for m in re.finditer(r"(?<!\d)20\d\d[/-]([01]\d)[/-]([0-3]\d)(?!\d)", text):
        out.add((int(m.group(1)), int(m.group(2))))
    for m in re.finditer(r"(?<!\d)([0-3]\d)[/.-]([01]\d)[/.-]20\d\d(?!\d)", text):
        out.add((int(m.group(2)), int(m.group(1))))
    return out


def posted_before(text: str, d: date) -> set[tuple[int, int]]:
    """The publication day of a post in the four weeks before the race, from its address (WordPress:
    « …/2026/09/24/duathlo-2026-et-championnat-de-ligue-md… »): the race's announcement, often updated with its
    results — that day is not « another day »."""
    out = set()
    for m in re.finditer(r"/(20\d\d)/([01]\d)/([0-3]\d)/", text):
        try:
            p = date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            continue
        if timedelta(0) <= d - p <= timedelta(days=28):      # (O'Jura posted its page 22 days before)
            out.add((p.month, p.day))
    return out


def other_day_named(text: str, d: date) -> bool:
    """A page about another day (a post « 11 oct. 2026 CO en forêt de Fontainebleau » on a club's site): not worth a visit
    for this race — it names days, and none within a day of this one."""
    named = days_named(text) - posted_before(text, d)
    near = set()
    for k in (-1, 0, 1):                     # a weekend's event page gives its first day: the day before or after counts
        x = d + timedelta(days=k)
        near.add((x.month, x.day))
    return bool(named) and not (named & near)


def address_other_day(url: str, d: date) -> bool:
    """A file's address spelling another day (« …/oyonnax-dimanche-5-octobre-2025/… »). Not a WordPress upload folder:
    « /uploads/2026/09/12-00-Resultat… » is not the 12 September."""
    path = plain(urllib.parse.unquote(urllib.parse.urlsplit(url).path))
    return other_day_named(re.sub(r"/uploads/20\d\d/[01]\d/", "/", path), d)


def headline(page: str) -> str:
    """A page's own title and the lines under it (« Résultats Sprint et KO Sprint — Publiée le 04 oct. 2026 … »), not
    its menus and margins, which list the club's other events."""
    m = re.search(r"(?is)<h1\b.*?</h1>", page) or re.search(r"(?is)<title\b.*?</title>", page)
    if not m:
        return ""
    rest = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page[m.start():m.start() + 6000])
    return plain(re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", " ", rest))))[:700]


def race_words(race) -> set[str]:
    words = set(re.findall(r"[a-z0-9]+", plain(f"{race['name']} {race['place'] or ''}")))
    return {w for w in words - STOP if len(w) >= 4 and not w.isdigit()}


class ClubSite:
    def __init__(self, fetcher):
        self.f = fetcher
        self.pages: dict[str, str | None] = {}            # url -> html, within one run
        self.bases: dict[str, str] = {}                   # url -> where its html came from (a refresh's target)

    def cancelled(self, race) -> bool:
        """Do the pages read for this race say it is cancelled? A sentence holding « annul… », the race's name (its brackets
        and « - WRE » apart: « Championnat de France de Sprint ») and its day (« samedi 24/10 » too). 2026-10-24: FFCO's
        calendar still listed both CF Sprint races, which the organiser's page announced cancelled, replaced by a labyrinth
        sprint at Le Bessat."""
        base = plain(re.split(r"\s+-\s+", re.sub(r"\(.*?\)", " ", race["name"] or ""))[0])
        if len(base.split()) < 2:
            return False
        d = date.fromisoformat(race["date_iso"])
        short = re.compile(rf"(?<!\d)0?{d.day}\s*/\s*0?{d.month}(?!\d)")
        for text in self.pages.values():
            if not text or "annul" not in text.lower():
                continue
            words = plain(htmllib.unescape(re.sub(r"<[^>]+>", " ", text)))
            for sentence in re.split(r"[.!?…]+\s", words):
                if "annul" in sentence and base in sentence and (names_day(sentence, d) or short.search(sentence)):
                    return True
        return False

    def page(self, url: str) -> str | None:
        if url not in self.pages:
            a = self.f.get(url, conditional=False)
            ok = a.status == 200 and ("html" in a.ctype or a.content[:200].lstrip().lower().startswith((b"<!doctype", b"<html")))
            text = a.content.decode("utf-8", "replace") if ok else None
            if ok and a.url and a.url != url:
                self.bases[url] = a.url                     # an HTTP redirect: links are relative to its target
            # a page that only redirects ('www.go78.org' -> '/joomla3'): its target, one hop
            m = text and len(text) < 3000 and re.search(r'(?is)<meta[^>]+http-equiv=["\']?refresh["\']?[^>]+content=["\'][^"\']*url=([^"\'>]+)', text)
            if m:
                target = urllib.parse.urljoin(url, htmllib.unescape(m.group(1).strip()))
                if target != url and _host(target) == _host(url):
                    b = self.f.get(target, conditional=False)
                    if b.status == 200:
                        text = b.content.decode("utf-8", "replace")
                        self.bases[url] = target
            self.pages[url] = text
        return self.pages[url]

    def find(self, race, sites: list[str], mode: str = "results") -> dict:
        """{'docs': [(url, text, via)], 'platforms': [(kind, url)]} for this race: its result files, or (mode "start",
        before the race) its start lists and entry lists; mode "announce", weeks before it: its announcement
        ('announcements') and its start-time booking ('bookings': [(url, text, page)])."""
        announce = mode == "announce"
        start = mode == "start" or announce
        WANT = START_WORDS if start else RESULT_WORDS
        SKIP = NOT_START if start else NOT_RESULTS
        sites = list(dict.fromkeys(sites + [p for p in map(parent_site, sites) if p]))
        d = date.fromisoformat(race["date_iso"])
        dt = date_tokens(d)
        # a word of the club's own address names every page of its site (« poitiers » on poitiersco.org): it says
        # nothing of the race
        hosts = [_host(s).replace(".", " ") for s in sites]
        words = {w for w in race_words(race) if not any(w in h for h in hosts)}
        own = {_host(s) for s in sites}
        found: dict[str, tuple[str, str]] = {}
        platforms: dict[str, str] = {}
        contexts: dict[str, tuple] = {}                # an O'Live link: (the page holding it, whether it names the race)
        announcements: dict[str, str] = {}             # the race's announcement: its circuits' table
        ann_rank: dict[str, int] = {}
        bookings: dict[str, tuple[str, str]] = {}      # mode "announce": the start-time booking -> (its words, the page)

        def booking(url: str, text: str, before: str, page: str) -> None:
            """A link of the race's own page or post to a shared sheet or form for choosing one's start time."""
            if not BOOK_LINK.search(url):
                return
            said = plain(f"{text} {before}")
            if any(w in said for w in BOOK_WORDS) and not any(w in plain(text) for w in RESULT_WORDS[:3]):
                bookings.setdefault(url, (text if text and not text.startswith("http") else before[-80:], page))

        def consider(url: str, text: str, via: str, posted_after: bool = False, on_race_page: bool = False,
                     weekend_page: bool = False):
            low = plain(urllib.parse.unquote(url)) + " " + plain(text)
            if weekend_page:                # « Résultats MD pédestre » on the weekend's page names the « Moyenne Distance »
                low += "".join(f" {full}" for ab, full in (("md", "moyenne distance"), ("ld", "longue distance"))
                               if re.search(rf"\b{ab}\b", low))
            host = _host(url)
            names_race = any(t in low for t in dt) or names_day(low, d) or any(w in low for w in words) or on_race_page
            for h, kind in PLATFORMS.items():
                if h in host or h in url:
                    # a club page lists its whole season's links: only those naming this race (or posted after it); an
                    # O'Live link names no race (« Résultats provisoires » -> its home page) — kept with the page holding
                    # it, whose words say which of the day's O'Live races it is, if any (sources.olive.OLive.of_day)
                    if names_race or posted_after or (kind == "olive" and via.startswith("page ")):
                        platforms[url] = kind
                    if kind == "olive" and url not in contexts:
                        contexts[url] = (via[5:] if via.startswith("page ") else None, bool(names_race or posted_after))
                    return
            # a competition's page on another site of the shape MeOSDjango gives them (/competition/<n>/): probed once
            # (sources.meosdjango), read as a platform when it is one
            if MEOSDJANGO_PATH.match(urllib.parse.urlsplit(url).path) and host not in own and (names_race or posted_after):
                platforms[url] = "meosdjango"
                return
            # (a file on the race's own page may sit in an older upload folder: WordPress keeps a replaced file's
            # first address — Fougères' October results in /uploads/2026/09/; its printed date decides then)
            if other_day(urllib.parse.unquote(url), d) or (not start and uploaded_before(url, d) and not (on_race_page or weekend_page)) or \
                    address_other_day(url, d) or \
                    other_year(urllib.parse.unquote(urllib.parse.urlsplit(url).path.rsplit("/", 1)[-1]) + " " + text, d):
                return                                          # a file of another day's (or season's) race
            path = urllib.parse.urlsplit(url).path.lower()
            is_doc = path.endswith(DOC_EXT) or "drive.google.com/file" in url or "document-download" in url or "/ugd/" in url
            # a file without an extension (a Cloudinary upload: « …/organisations/resultat_si69 »), or a link saying
            # what it holds: read to find out (kept only if it reads as such)
            last = path.rsplit("/", 1)[-1]
            noext = not is_doc and "." not in last and (_host(url) in FILE_HOSTS or any(w in plain(text) for w in (
                "resultat", "result", "depart", "horaire", "annonce", "inscrit", "temps inter", "splits")))
            if noext:
                is_doc = True
            if not is_doc:
                return
            if path.endswith((".htm", ".html")) and not any(w in low for w in WANT):
                return                                          # an ordinary page, not an exported list
            if any(w in low for w in ("annonce", "invitation")) and (names_race or on_race_page or weekend_page) and                     not other_day_named(low, d) and \
                    not path.endswith((".htm", ".html")):
                # (an upload over six months before the race is an older race's: COLE's 2024 « TROPHEE-SAINT-QUENTIN »
                # announcement, on a page sharing a word with its race of December 2026)
                if start and uploaded_before(url, d - timedelta(days=183)):
                    return
                announcements.setdefault(url, text)             # the announcement: perhaps the table of its circuits
                # the race's own page or post first, then a file whose name or link gives its day, last one sharing a
                # word with it (« liguepaca » for a « Challenge PACA »: a youth camp's announcement)
                r = 0 if on_race_page or weekend_page else 1 if any(t in low for t in dt) or names_day(low, d) else 2
                ann_rank[url] = min(ann_rank.get(url, 3), r)
                return
            if any(w in low for w in SKIP):
                return                                          # start lists, entries, invitations: their times are not results
            says_result = any(w in low for w in WANT)           # (mode "start": says start list)
            names_race = any(t in low for t in dt) or names_day(low, d) or any(w in low for w in words) or on_race_page
            # (on a page about the race's weekend, a results file need not name the race: the weekend's races share
            # them out by their words afterwards, races.owners — « Résutats Nuit » at Fougères)
            if (says_result and (names_race or weekend_page)) or (posted_after and (says_result or names_race and not start)):
                found.setdefault(url, (text, f"{via} (à vérifier)" if noext else via))
            elif (on_race_page or weekend_page) and not any(w in low for w in (RESULT_WORDS[:3] if start else START_WORDS[:3])):
                # a file on the race's (or its weekend's) page that says nothing of what it is (« Fougeres-OTour-Sprint.pdf »,
                # a start list): read to find out — kept only if it reads as what is looked for
                found.setdefault(url, (text, f"{via} (à vérifier)"))

        # 1. WordPress: uploads and posts since the race (a start list: in the weeks before it)
        after = (d - timedelta(days=ANNOUNCE_DAYS_BEFORE if announce else START_DAYS_BEFORE if start else 1)).isoformat() + "T00:00:00"
        before = (d + timedelta(days=1 if start else 21)).isoformat() + "T00:00:00"
        probed: set[str] = set()

        def wordpress(root: str) -> None:
            host = _host(root)
            if host in probed:
                return
            probed.add(host)
            api = (f"https://public-api.wordpress.com/wp/v2/sites/{host}" if host.endswith(".wordpress.com")
                   else f"{root}/wp-json/wp/v2")
            a = self.f.get(f"{api}/media", conditional=False, params={"after": after, "before": before, "per_page": 100})
            if a.status == 200 and a.content[:1] in (b"[", b"{"):
                try:
                    for m in json.loads(a.content.decode("utf-8", "replace")):
                        if isinstance(m, dict) and m.get("source_url"):
                            consider(m["source_url"], htmllib.unescape(str((m.get("title") or {}).get("rendered", ""))), "wordpress media", True)
                except ValueError:
                    pass
                p = self.f.get(f"{api}/posts", conditional=False, params={"after": after, "before": before, "per_page": 30})
                if p.status == 200 and p.content[:1] == b"[":
                    try:
                        for post in json.loads(p.content.decode("utf-8", "replace")):
                            content = str((post.get("content") or {}).get("rendered", ""))
                            link = post.get("link") or root
                            title = plain(urllib.parse.unquote(link) + " " + htmllib.unescape(str((post.get("title") or {}).get("rendered", ""))))
                            # (announce: a post about this race — its title or address names its day or its words —
                            # holds its announcement and its booking; the club's other posts say nothing of it)
                            if announce and (names_day(title, d) or any(t in title for t in dt) or any(w in title for w in words))                                     and not other_day_named(title, d):
                                for u, t, b in _link_ctx(content, link):
                                    consider(u, t, "wordpress post", True, weekend_page=True)
                                    booking(u, t, b, link)
                                continue
                            for u, t in _links(content, link):
                                consider(u, t, "wordpress post", True)
                    except ValueError:
                        pass

        for site in sites:
            root = _root(site)
            wordpress(root)
            # 2. Blogger
            if "blogspot." in root or (self.page(site) or "").find("blogger.com") >= 0:
                b = self.f.get(f"{root}/feeds/posts/default", conditional=False,
                               params={"alt": "json", "published-min": after + "+00:00", "max-results": 25})
                if b.status == 200:
                    try:
                        for e in json.loads(b.content.decode("utf-8", "replace")).get("feed", {}).get("entry", []):
                            for u, t in _links((e.get("content") or {}).get("$t", ""), root):
                                consider(u, t, "blogger", True)
                    except ValueError:
                        pass

        # 3. the site's pages: the race's page and the home page, then the best pages found so far, across the whole
        # crawl — a page naming this race (Le Mans: « …/evenements/2026/10/03/sarthe-otour-2026 », two pages down)
        # before any generic results page (a multi-sport club's results of its athletics groups would eat the budget)
        siblings: set[str] = set()
        queue: list[tuple[float, int, str]] = []
        for s in sites:
            heapq.heappush(queue, (-1, len(queue), s))
            heapq.heappush(queue, (-1, len(queue), _root(s) + "/"))
        seq = len(queue)
        # the club's own section of a multi-sport site (/course-dorientation-s1799/…): its pages before the others'
        sections = set()
        seen, n = set(), 0
        while queue and n < MAX_PAGES and not self.f.out_of_time():
            _, _, url = heapq.heappop(queue)
            if url in seen:
                continue
            seen.add(url)
            page = self.page(url)
            n += 1
            if not page:
                continue
            if url in sites:
                first = urllib.parse.urlsplit(self.bases.get(url, url)).path.strip("/").split("/")[0]
                if first:
                    sections.add(first)
            # a page about this race's results (« Les résultats du sprint … à Rouen », the race's own page): its
            # result files need not name the race themselves
            about = plain(urllib.parse.unquote(url)) + " " + headline(page)
            # (its address or title says results and the title's lines give the race's day: a mention of the town or
            # of the day in a menu or a margin listing the club's events is not enough)
            # (nor a page naming another day too: a list of the club's results, or the day before's race page
            # « Etape 1 … 26 au 26 Septembre 2026 », modified the 27th)
            on_race_page = url in sites or (any(w in about for w in WANT[:3]) and names_day(about, d)
                                            and not days_named(about) - {(d.month, d.day)} - posted_before(about, d))
            # a page about the race's weekend (it names a day within one of the race's)
            weekend_page = url not in [_root(s) + "/" for s in sites] and bool(days_named(about)) and \
                not other_day_named(about, d)
            before = len(found)
            links = _links(page, self.bases.get(url, url))
            if announce and (weekend_page or (on_race_page and url not in [_root(s) + "/" for s in sites])):
                for u, t, b in _link_ctx(page, self.bases.get(url, url)):
                    booking(u, t, b, url)
            for u, t in links:
                consider(u, t, f"page {url}", on_race_page=on_race_page and url not in [_root(s) + "/" for s in sites],
                         weekend_page=weekend_page)
                low = plain(urllib.parse.unquote(u)) + " " + plain(t)
                same_site = any(_domain(u) == _domain(s) for s in sites)      # its other subdomains too
                path = urllib.parse.urlsplit(u).path.lower()
                if not same_site or u in seen or (path.endswith(DOC_EXT) and not path.endswith((".htm", ".html"))) or \
                        any(x in low for x in NOT_PAGES):
                    continue
                if _host(u) not in [_host(s) for s in sites]:
                    siblings.add(_root(u))                  # new.co-lorient.fr from www.co-lorient.fr: its WordPress too
                # another season's pages (saison-2015-2016/resultats) or another day's (« 11 oct. 2026 … »): not this race's
                if other_year(low, d) or other_day_named(low, d):
                    continue
                race_named = any(t2 in low for t2 in dt) or names_day(low, d) or any(w in low for w in words)
                results = any(w in low for w in WANT[:3])
                past = not start and any(w in low for w in ("passe", "archive", "anciens", "past"))
                posted = bool(posted_before(low, d))        # the race's announcement, often updated with its results
                if race_named or results or past or posted or any(w in low for w in PAGE_WORDS):
                    # the most specific pages first: results naming this race, then pages naming it, then results and
                    # lists of past events, then the rest; a list's next pages (?page=2) last; outside the club's
                    # section of a multi-sport site, after the same pages inside it
                    rank: float = 0 if race_named and results else 1 if race_named else \
                        2 if results or past or posted else 3
                    if re.search(r"[?&]page=\d|/page/\d", u):
                        rank = 3
                    if sections and rank > 1 and urllib.parse.urlsplit(u).path.strip("/").split("/")[0] not in sections:
                        rank += 0.5
                    heapq.heappush(queue, (rank, seq, u))
                    seq += 1
            if url in found and len(found) > before and len(links) > 15:
                del found[url]                      # a site's page leading to the results, not an exported list
        for root in sorted(siblings):
            if not self.f.out_of_time():
                wordpress(root)
        return {"docs": [(u, t, v) for u, (t, v) in found.items()], "platforms": sorted(platforms.items(), key=lambda x: x[1]),
                "announcements": sorted(announcements.items(), key=lambda x: (ann_rank.get(x[0], 2), x[0])),
                "ann_rank": ann_rank, "contexts": contexts,
                "bookings": [(u, t, pg) for u, (t, pg) in bookings.items()]}


def download_url(url: str) -> str:
    """A shared file's direct download address (Google Drive's viewer pages are not the file)."""
    m = re.search(r"drive\.google\.com/file/d/([\w-]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}"
    # a Google Sheets page shows its first 100 rows or so (2026-10-18: SpOC's start list, 129 rows, read as 38 runners):
    # its CSV export has them all, the sheet's tab kept
    m = re.search(r"docs\.google\.com/spreadsheets/d/([\w-]+)", url)
    if m and "/export" not in url:
        gid = re.search(r"[#&?]gid=(\d+)", url)
        return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=csv" + (f"&gid={gid.group(1)}" if gid else "")
    return url
