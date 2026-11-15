"""Results PDFs printed by the two timing programs French clubs use: OE (SportSoftware OE2003 / OE2010 / OE12) and
MeOS. Both plain results lists (by circuit or by category) and split-time lists are read.

Plain text extraction is useless on these files: OE prints long club names over the time column, Microsoft "Print to
PDF" re-prints glue a first name to the time ("Obe17:34"), and split lists are multi-column grids. So the page is
rebuilt from the characters themselves:

- words are made from the characters *in content-stream order*, cut at spaces, at gaps, and whenever the pen jumps
  back to the left (that is where one text run was drawn over another);
- words are grouped into lines by their vertical position;
- columns come from the layout: OE prints a header row ("Pl  Doss.  NOM  Né  Club  Temps") whose labels give the
  column positions; MeOS prints no column header for names and clubs, so its columns are the left edges that most
  ranked rows share.

Every row is checked (a place is a number, a time parses, a name holds no time or digits); a row that does not fit
is dropped rather than guessed, and a class whose times do not follow its places is dropped whole.
"""

from __future__ import annotations

import io
import re
from collections import Counter

from .. import model

_MAX_PAGES = 400

# ---------------------------------------------------------------------------------------------------------------
# Tokens

_PLACE_MEOS = re.compile(r"^(\d{1,4})\.$")                     # MeOS: "12."
_MEOS_COUNT = re.compile(r"^\((\d+)(?:/\d+\))?$")             # MeOS class line: "(19" of "(19 / 19)"
_PLACE_OE = re.compile(r"^(\d{1,4})\.?$")                      # OE: "12"
_COUNT = re.compile(r"^\((\d+)(?:/(\d+))?\)$")                 # OE class line: "(13)", "(8/8)"
_CTRL = re.compile(r"^(\d{1,3})\((\d{1,4})\)$")                # OE split header: "1(131)"
_DASH = re.compile(r"^[-–—]+$")
_SPLIT_TOK = re.compile(r"^\(?(?:[-–—]+|(?:\d+:)?\d{1,3}:\d\d(?:[.,]\d+)?)\)?$")  # "0:50", "(1:02:03)", "(–)"
_DIFF = re.compile(r"^[+-]?(?:\d+:)?\d{1,3}:\d\d(?:[.,]\d+)?$")
_DATE_FR = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_DATE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_WEEKDAY = re.compile(r"^(lun|mar|mer|jeu|ven|sam|dim)\.?$", re.I)

# Status words the model does not list but these programs print ("Aband." is MeOS's short form; MeOS prints "OK"
# without a place for a runner who ran without timing, i.e. not ranked).
_EXTRA_STATUS = {"aband": "dnf", "abandonnee": "dnf", "n.p": "dns", "annule": "dns", "annulee": "dns", "ok": "nc",
                 "bandon": "dnf"}                       # OE clips the "A" of "Abandon" in narrow time cells
# Single words that may be part of a multi-word status in the time column ("Non partant", "Hors délai").
_STATUS_PARTS = {p for words in model.STATUS_WORDS.values() for w in words for p in w.split()} | \
                {p for w in _EXTRA_STATUS for p in w.split()}


def _status(text: str) -> str | None:
    st = model.status_of(text)
    if st:
        return st
    return _EXTRA_STATUS.get(model.plain(text).strip(" ."))


def _is_time(text: str) -> bool:
    return model.parse_time(text) is not None


def _is_status_part(text: str) -> bool:
    return model.plain(text).strip(" .") in _STATUS_PARTS or _status(text) is not None


def _cat(text: str | None) -> str | None:
    """An FFCO category from a printed category cell: 'H21', 'H40OL' -> 'H40'; OE's 'H21225' (category + class
    number) -> 'H21'; merged classes such as 'H21-35' are kept as printed; anything else (a course name) -> None."""
    t = (text or "").strip()
    if not t:
        return None
    c = model.category(t)
    if c:
        return c
    m = re.match(r"^([HD])(\d{2})\d{1,3}$", t)       # a narrower column cuts it: 'H2122'
    if m:
        return m.group(1) + m.group(2)
    return t if re.match(r"^[HD]\d{2}\b", t) and len(t) <= 12 else None


def _looks_category(name: str) -> bool:
    return bool(re.match(r"^[HD]\s?\d{2}", name.strip()))


def _bad_name(name: str) -> bool:
    """A name cell that swallowed something else: a time, a number, a club code."""
    if not name or not re.search(r"[A-Za-zÀ-ÿ]", name):
        return True
    return any(ch.isdigit() for ch in name)


# ---------------------------------------------------------------------------------------------------------------
# Page geometry: characters -> words -> lines


class W:
    """A word: text, box, and its characters as (text, x0, x1)."""
    __slots__ = ("text", "x0", "x1", "top", "size", "chars")

    def __init__(self, text, x0, x1, top, size, chars=None):
        self.text, self.x0, self.x1, self.top, self.size = text, x0, x1, top, size
        self.chars = chars if chars is not None else [(text, x0, x1)]

    def __repr__(self):
        return f"{self.x0:.0f}:{self.text}"


class Line:
    __slots__ = ("words", "top", "page")

    def __init__(self, words, page):
        self.words = sorted(words, key=lambda w: w.x0)
        self.top = min(w.top for w in words)
        self.page = page

    @property
    def text(self):
        return " ".join(w.text for w in self.words)

    def __repr__(self):
        return f"<{self.top:.0f} {self.words}>"


def _words(chars) -> list[W]:
    """Words from characters in content-stream order. A word ends at a space, at a gap, at a change of line, and
    when the next character is drawn to the left of the previous one's right edge (an overprint: two text runs
    drawn over each other, e.g. an OE club name running over the time, or a re-print gluing two cells)."""
    words, cur = [], None
    for c in chars:
        t = c.get("text") or ""
        if not c.get("upright", True):
            cur = None
            continue
        if not t.strip():
            cur = None
            continue
        size = float(c.get("size") or 10.0)
        if cur is not None:
            tol = 0.2 * size
            gap = c["x0"] - cur.x1
            if abs(c["top"] - cur.top) <= 0.3 * size and -tol <= gap <= tol:
                cur.text += t
                cur.x1 = max(cur.x1, c["x1"])
                cur.chars.append((t, c["x0"], c["x1"]))
                continue
        cur = W(t, c["x0"], c["x1"], c["top"], size)
        words.append(cur)
    return [p for w in words for p in _unglue(w)]


_TIME_CHARS = set("0123456789:.,")


def _unglue(w: W) -> list[W]:
    """A name and a time printed over each other in one run of characters: 'Catherine18:03', or interleaved,
    'A1u6d:3e2' (Microsoft "Print to PDF" re-prints of OE lists sort characters by position). Names hold no digits,
    so the digits and separators are the time when they spell one, and the rest is the name."""
    if ":" not in w.text or not re.search(r"[^\W\d_]", w.text):
        return [w]
    tc = [c for c in w.chars if c[0] in _TIME_CHARS]
    oc = [c for c in w.chars if c[0] not in _TIME_CHARS]
    tt = "".join(c[0] for c in tc)
    if len(oc) < 2 or not tc or model.parse_time(tt) is None:
        return [w]
    parts = [W("".join(c[0] for c in cs), min(c[1] for c in cs), max(c[2] for c in cs), w.top, w.size, cs)
             for cs in (oc, tc)]
    return sorted(parts, key=lambda x: x.x0)


def _dedupe(chars) -> list:
    """Fake bold: the same character drawn twice with a small offset (within 1 pt) — the second one dropped, in
    content-stream order. pdfplumber's own dedupe_chars does the same but sorts groups over and over: minutes on a
    100-page split list (the Championnats de France's)."""
    seen: dict = {}                                # (char, font, size, x cell, y cell) -> [(x0, top)]
    out = []
    for c in chars:
        x, y = c["x0"], c["top"]
        key = (c.get("text"), c.get("fontname"), round(float(c.get("size") or 0), 1))
        cx, cy = int(x // 1), int(y // 1)
        if any(abs(x - x2) <= 1 and abs(y - y2) <= 1
               for dx in (-1, 0, 1) for dy in (-1, 0, 1) for x2, y2 in seen.get((key, cx + dx, cy + dy), ())):
            continue
        seen.setdefault((key, cx, cy), []).append((x, y))
        out.append(c)
    return out


def _lines(page, pno: int) -> list[Line]:
    words = sorted(_words(_dedupe(page.chars)), key=lambda w: (w.top, w.x0))
    groups: list[list[W]] = []
    for w in words:
        if groups and abs(w.top - groups[-1][0].top) <= max(1.5, 0.35 * w.size):
            groups[-1].append(w)
        else:
            groups.append([w])
    return [Line(g, pno) for g in groups]


# ---------------------------------------------------------------------------------------------------------------
# Entry point


def parse(content: bytes, url: str) -> dict | None:
    try:
        return _parse(content, url)
    except Exception:
        return None


def _parse(content: bytes, url: str) -> dict | None:
    if not content or b"%PDF" not in content[:1024]:
        return None
    import pdfplumber  # imported here so the rest of the package does not need it

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        if not pdf.pages or len(pdf.pages) > _MAX_PAGES:
            return None
        meta = {k: str(v) for k, v in (pdf.metadata or {}).items()}
        pages = [_lines(p, i) for i, p in enumerate(pdf.pages)]
    if not any(pages):
        return None                          # scanned image, nothing to read

    gen = _generator(meta, pages)
    if gen == "meos":
        d = _parse_meos(pages, meta)
        kind = "pdf_meos"
    elif gen == "oe":
        d = _parse_oe(pages)
        kind = "pdf_oe"
    else:
        # Unknown producer (a re-print that lost the metadata and the banner): accept a layout only if it parses
        # cleanly into a substantial list.
        kind = "pdf"
        d = _parse_oe(pages)
        if not d or _timed(d) < 5:
            d = _parse_meos(pages, meta)
        if d and _timed(d) < 5:
            d = None
    if not d:
        return None
    classes = [c for c in (_check_class(c) for c in d["classes"]) if c]
    if not any(r["time_s"] is not None for c in classes for r in c["runners"]):
        return None
    return model.doc(kind, classes, by=d["by"], title=d.get("title"), date=d.get("date"), printed=d.get("printed"))


def _timed(d: dict) -> int:
    return sum(1 for c in d["classes"] for r in c["runners"] if r["time_s"] is not None)


def _generator(meta: dict, pages: list[list[Line]]) -> str | None:
    m = " ".join(meta.get(k, "") for k in ("Creator", "Producer", "Title", "Subject")).lower()
    head = " ".join(l.text for l in pages[0][:8])
    if "meos" in m or re.match(r"MeOS\b", head):
        return "meos"
    if "sportsoftware" in m or re.search(r"\boe\s?(2003|2010|12)\b", m) or \
            re.search(r"SportSoftware|\bOE\s?(2003|2010|12)\s*©", head):
        return "oe"
    return None


def _check_class(c: dict) -> dict | None:
    """Last line of defence: ranked runners must have a time, places must not go down, and times must follow the
    places. A class that breaks this was misread somewhere: drop it whole rather than publish a wrong order."""
    runners = [r for r in c["runners"] if not _bad_name(r["name"])]
    ranked = [r for r in runners if r["place"] is not None and r["status"] == "ok"]
    for a, b in zip(ranked, ranked[1:]):
        if a["time_s"] is None or b["time_s"] is None or b["place"] < a["place"] or b["time_s"] + 0.5 < a["time_s"]:
            return None
    if ranked and ranked[0]["time_s"] is None:
        return None
    if c.get("controls"):
        n = len(c["controls"])
        for r in runners:
            if r["splits"] is not None and len(r["splits"]) != n:
                r["splits"] = None
    c["runners"] = runners
    return c if runners else None


# ---------------------------------------------------------------------------------------------------------------
# Shared split helpers


def _monotone(cum: list[float | None]) -> list[float | None]:
    """Cumulative times can only grow: a value below one already seen (a control punched out of order, a misread
    cell) is dropped."""
    out, best = [], 0.0
    for v in cum:
        if v is not None and v + 0.5 < best:
            out.append(None)
        else:
            out.append(v)
            if v is not None:
                best = max(best, v)
    return out


def _split_val(text: str) -> float | None:
    t = text.strip("()")
    return None if _DASH.match(t) else model.parse_time(t)


# ---------------------------------------------------------------------------------------------------------------
# MeOS
#
# Results:    "1.  Paul DURAND      B.A        13:57   +0:30   0:00"   (place, name, club, time, behind, lost)
# By circuit: "1.  Lucie MOREAU   Bleu   COMulhouse   12:33"            (place, name, class, club, time)
# Class line: "Orange Long  (19 / 19)  Temps  Retard  Temps perdu", or just "Bleu" / "Parcours A" by circuit.
# Splits:     after each runner line, lines of "leg (cumulative)" pairs, 5 or 6 per line; the last pair is the
#             finish. MeOS prints no control codes — except in its other split list: "1 (54): 2:32 (2:32)  2 (55): …
#             Arrivée: 0:07 (14:44)" (number, code, leg, cumulative; "– (–)" for a missing punch), its class line then
#             giving the course too: "Open H10 Vert 2280 m, 20 m (35 / 35)" (CF LD 2026).

_CODED_PAIR = re.compile(r"(\d+)\s*\((\d+)\)\s*:\s*(\S+)\s*\(([^()]*)\)")
_CODED_FIN = re.compile(r"(?:Arriv\w*|Finish|Ziel|M[åa]l)\s*:\s*(\S+)\s*\(([^()]*)\)", re.I)
# where two cells touch, the PDF's characters come out interleaved: "(1:48:281)7 (109)" for "(1:48:28) 17 (109)"
_CODED_GLUED = re.compile(r"\((\d+:\d\d(?::\d\d)?)(\d)\)(\d*)")
_COURSE_SIZE = re.compile(r"\s+\d[\d ]*\s?m\s*,\s*\d+\s?m$")


def _meos_coded_split(text: str) -> list[tuple[str, float | None]] | None:
    """A line of the coded split list: [(control code, cumulative time)…], the finish as "F"; None if it is not one."""
    t = _CODED_GLUED.sub(r"(\1) \2\3", text)
    pairs = [(m.group(2), _split_val(m.group(4))) for m in _CODED_PAIR.finditer(t)]
    fin = _CODED_FIN.search(t)
    if not pairs and not fin or _CODED_FIN.sub("", _CODED_PAIR.sub("", t)).strip():
        return None
    return pairs + ([("F", _split_val(fin.group(2)))] if fin else [])


def _parse_meos(pages: list[list[Line]], meta: dict) -> dict | None:
    title, date, printed, lines = None, None, None, []
    for lines_p in pages:
        for i, l in enumerate(lines_p):
            t = l.text
            if i == 0 and re.match(r"MeOS\b", t):                     # page banner: program, print time, class
                m = re.match(r"MeOS\s+(\d{4}-\d{2}-\d{2})\b", t)
                printed = printed or (m and m.group(1))
                continue
            m = re.match(r"^R[ée]sultats?\b.*?[–-]\s*(.+)$", t)
            if m and i < 4 and not any(_PLACE_MEOS.match(w.text) for w in l.words):
                title = title or m.group(1).strip()
                continue
            if _DATE_ISO.match(t) and i < 5:
                date = date or t
                continue
            lines.append(l)
    mt = meta.get("Title", "")
    if not title and "," in mt:
        title = mt.rsplit(",", 1)[0].strip() or None
    by_circuit = "par circuit" in model.plain(mt) or any("par circuit" in model.plain(l.text) for l in pages[0][:4])

    placed = [l for l in lines if len(l.words) >= 3 and _PLACE_MEOS.match(l.words[0].text)]
    if len(placed) < 2:
        return None
    margin = Counter(round(l.words[0].x0) for l in placed).most_common(1)[0][0]
    placed = [l for l in placed if abs(l.words[0].x0 - margin) <= 3]
    name_x = Counter(round(l.words[1].x0) for l in placed).most_common(1)[0][0]
    counts = Counter(round(w.x0) for l in lines for w in l.words[1:6] if _MEOS_COUNT.match(w.text))
    count_x = counts.most_common(1)[0][0] if counts else None
    cols = _meos_columns(placed, name_x, by_circuit, count_x)
    if not cols:
        return None
    by_cat_col = by_circuit and cols.get("cat") is not None

    classes, cur, last = [], None, None
    for l in lines:
        w0 = l.words[0]
        coded = _meos_coded_split(l.text)
        if coded is not None:
            if last is not None and last.get("_raw") is not None:
                last["_raw"].extend(v for _, v in coded)
                last.setdefault("_codes", []).extend(c for c, _ in coded)
            continue
        if _meos_split_line(l):
            if last is not None and last.get("_raw") is not None:
                last["_raw"].extend(_split_val(w.text) for w in l.words if w.text.startswith("("))
            continue
        last = None
        if _PLACE_MEOS.match(w0.text) and abs(w0.x0 - margin) <= 3:
            r = _meos_row(l, cols, place=int(_PLACE_MEOS.match(w0.text).group(1)))
        elif abs(w0.x0 - name_x) <= 3:
            r = _meos_row(l, cols, place=None)
        elif abs(w0.x0 - margin) <= 3:
            name = _meos_class_name(l, cols)
            if name and not (cur is not None and name == cur["name"]):   # a repeated header continues the class
                cur = model.klass(name)
                classes.append(cur)
            continue
        else:
            continue
        if r is None or cur is None:
            continue
        if by_cat_col:
            r["category"] = _cat(r.pop("_cat", None))
        else:
            r.pop("_cat", None)
            r["category"] = _cat(cur["name"])
        cur["runners"].append(r)
        r["_raw"] = []
        last = r

    by = "circuit" if by_circuit else _by_names(classes)
    for c in classes:
        _meos_finish_splits(c)
        if by == "circuit" and not by_cat_col:
            for r in c["runners"]:
                r["category"] = None             # the class is a course, its name is not a category
    return {"by": by, "title": title, "date": date, "printed": printed, "classes": classes}


def _by_names(classes: list[dict]) -> str:
    names = [c["name"] for c in classes if c["runners"]]
    if names and sum(_looks_category(n) for n in names) >= 0.8 * len(names):
        return "category"
    return "circuit"


def _meos_columns(placed: list[Line], name_x: float, by_circuit: bool, count_x: float | None) -> dict | None:
    """Columns of a MeOS list. Every MeOS column is left-aligned, so a column is a left edge that the ranked rows
    share. The time column is the first such edge holding times. The club column of a list by class starts where
    the class line prints its count ("Orange Long  (19 / 19)"); a list by circuit has no such line but a class
    column then a club column, both filled on every row (a second word shared by many rows, as in "Orange Long"
    or "LMA 72", is not filled on every row)."""
    edges = Counter()
    for l in placed:
        for x in {round(w.x0) for w in l.words[2:]}:
            edges[x] += 1
    groups: list[list[int]] = []                     # merge edges within 2 pt
    for x in sorted(edges):
        if groups and x - groups[-1][0] <= 2:
            groups[-1].append(x)
        else:
            groups.append([x])
    cols = []                                        # (left, right, share of rows with a word starting there)
    for g in groups:
        hit = sum(1 for l in placed if any(g[0] - 0.6 <= w.x0 <= g[-1] + 0.6 for w in l.words[2:]))
        if hit >= max(1, 0.4 * len(placed)) and g[0] > name_x + 5:
            cols.append((g[0] - 1, g[-1] + 1, hit / len(placed)))
    time_i = None
    for i, (a, b, _) in enumerate(cols):
        toks = [w.text for l in placed for w in l.words[2:] if a - 0.5 <= w.x0 <= b + 0.5]
        if toks and sum(_is_time(t) for t in toks) >= 0.6 * len(toks):
            time_i = i
            break
    if time_i is None:
        return None
    time_x = cols[time_i][0]
    full = [a for a, _, share in cols[:time_i] if share >= 0.85] or [a for a, _, _ in cols[:time_i][:1]]
    if by_circuit:
        if len(full) < 2:
            return None
        cat, club = full[0], full[1]
    else:
        cat = None
        club = count_x - 1 if count_x and name_x < count_x < time_x else (full[0] if full else None)
        if club is None:
            return None
    return {"cat": cat, "club": club, "time": time_x}


def _meos_row(l: Line, cols: dict, place: int | None) -> dict | None:
    words = l.words[1:] if place is not None else l.words
    name = " ".join(w.text for w in words if w.x0 < (cols["cat"] or cols["club"]) - 1)
    cat = [w.text for w in words if cols["cat"] and cols["cat"] - 1 <= w.x0 < cols["club"] - 1]
    club = [w.text for w in words if cols["club"] - 1 <= w.x0 < cols["time"] - 1]
    # The time cell: its first word, plus the next ones while they spell a status ("Non partant"); what follows
    # (time behind, time lost) is not ours.
    tw = [w.text for w in words if w.x0 >= cols["time"] - 1]
    tim = tw[0] if tw else ""
    for t in tw[1:]:
        if model.parse_time(tim) is not None or not _is_status_part(t):
            break
        tim += " " + t
    if _bad_name(name) or not tim:
        return None
    t = model.parse_time(tim)
    st = "ok" if t is not None else _status(tim)
    if st is None:
        return None                                  # "En forêt", or something misread
    if place is not None and t is None:
        return None                                  # a rank without a time: misread
    if place is None and st == "ok":
        st = "nc"                                    # a time but no rank: not classified
    r = model.runner(name, place=place, club=" ".join(club) or None, time_s=t, status=st)
    r["_cat"] = " ".join(cat) or None
    return r


def _meos_split_line(l: Line) -> bool:
    return all(_SPLIT_TOK.match(w.text) for w in l.words) and any(w.text.startswith("(") for w in l.words)


def _meos_class_name(l: Line, cols: dict) -> str | None:
    """'Jaune (PDC)  (2 / 2)  Temps  Après' -> 'Jaune (PDC)'; by circuit the line is just the name."""
    out = []
    for w in l.words:
        if _MEOS_COUNT.match(w.text) or model.plain(w.text) in ("temps", "retard", "apres") or w.x0 >= cols["time"] - 1:
            break
        out.append(w.text)
    name = " ".join(out).strip()
    # "Open H10 Vert 2280 m, 20 m": the class, then its course's name, length and climb
    short = _COURSE_SIZE.sub("", name)
    if short != name:
        words = short.split(" ")
        cut = 2 if len(words) > 2 and words[-1].lower() in ("bis", "ter") else 1      # "Open H14 S bis 5250 m, 60 m"
        name = " ".join(words[:-cut]) if len(words) > cut else short
    return name or None


def _meos_finish_splits(c: dict) -> None:
    """MeOS split rows end with the finish: the class's control count is the usual number of pairs minus one.
    A runner whose row has another count, or whose finish disagrees with the result time, gets no splits."""
    raws = [r.pop("_raw", None) for r in c["runners"]]
    codes = Counter(tuple(x) for x in (r.pop("_codes", None) for r in c["runners"]) if x)
    lens = Counter(len(x) for x in raws if x)
    if not lens:
        return
    n = lens.most_common(1)[0][0] - 1
    if n < 1:
        return
    usual = [k for k, _ in codes.most_common() if len(k) == n + 1]
    c["controls"] = list(usual[0][:n]) if usual else [f"#{i}" for i in range(1, n + 1)]
    for r, raw in zip(c["runners"], raws):
        if not raw or len(raw) != n + 1:
            continue
        fin = raw[-1]
        if r["time_s"] is not None and fin is not None and abs(fin - r["time_s"]) > 1.5:
            continue
        sp = _monotone(raw[:n] + [r["time_s"] or fin])[:n]
        if any(v is not None for v in sp):
            r["splits"] = sp


# ---------------------------------------------------------------------------------------------------------------
# OE (SportSoftware)
#
# Page top:   "<title>   sam. 19/09/2026 19:27" / "Résultats ... Page 1" / "OE2010 © Stephan Krämer SportSoftware"
# Header row: "Pl  Doss.  NOM  Né  Club  Catg.  Temps  Diff." (a subset, in this order or close)
# Class line: "H21 (9)  10,6 km  0 m  27 P"     ("A H20 H21 (13)" by circuit: the course, then its categories)
# Results:    "1  59  BERNARD Louis  05  0705AR  50:23"
# Splits:     the class line is followed by one or more rows of "n(code)" control labels ("Arr" = finish); each
#             runner then has, per row of labels, a line of cumulative times and a line of leg times (the first
#             cumulative line is the runner's own line, the first leg line also carries the club).
#             Extra punches follow on further lines ("7:56" / "*174"); they are ignored.

_OE_LABELS = {
    "pl": "place", "place": "place", "rg": "place", "rang": "place",
    "ss": "bib", "doss": "bib", "dos": "bib", "dossard": "bib", "no": "bib",
    "nom": "name", "name": "name", "prenom": "name", "nom prenom": "name",
    "e": "birth", "ne": "birth", "nee": "birth", "an": "birth", "annee": "birth", "yb": "birth",
    "s": "sex", "sexe": "sex",
    "club": "club", "equipe": "club",
    "cat": "cat", "catg": "cat", "categ": "cat", "categorie": "cat",
    "temps": "time", "time": "time",
    "diff": "diff", "ecart": "diff", "retard": "diff", "behind": "diff",
    # OE12 in Spanish (FEDO's PDFs): « Pos Dorsal Nombre Club Tiempo Diff. »
    "pos": "place", "puesto": "place", "dorsal": "bib", "nombre": "name", "ano": "birth", "sexo": "sex",
    "clase": "cat", "categoria": "cat", "tiempo": "time", "dif": "diff",
}
_OE_TEXT = ("name", "club", "cat")                # left-aligned text columns that run until the next column


class _Col:
    __slots__ = ("kind", "x0", "x1")

    def __init__(self, kind, x0, x1):
        self.kind, self.x0, self.x1 = kind, x0, x1


def _oe_header(l: Line) -> list[_Col] | None:
    kinds = [(_OE_LABELS.get(model.plain(w.text).strip(" .")), w) for w in l.words]
    found = {k for k, _ in kinds if k}
    if not {"name", "time"} <= found or len([k for k, _ in kinds if not k]) > 2:
        return None
    cols = []
    for k, w in kinds:
        if not k:
            continue
        if cols and cols[-1].kind == k == "name":
            continue                               # "Nom Prénom": one column
        cols.append(_Col(k, w.x0, w.x1))
    return cols


def _oe_fits(kind: str, text: str) -> bool:
    if kind == "place":
        return bool(_PLACE_OE.match(text)) or _status(text) == "nc"
    if kind == "bib":
        return bool(re.match(r"^\d{1,6}$", text))
    if kind == "birth":
        return bool(re.match(r"^(\d{2}|(19|20)\d{2})$", text))
    if kind == "sex":
        return bool(re.match(r"^[HFMDW]$", text))
    if kind == "time":
        return _is_time(text) or _is_status_part(text)
    if kind == "diff":
        return bool(_DIFF.match(text))
    return False


def _oe_assign(l: Line, cols: list[_Col], overflow: bool = True) -> dict[str, list[W]]:
    """Cells of one OE row. A word goes to a typed column (place, bib, year, sex, time, behind) when it overlaps
    the column's label and has the right shape; otherwise to the text column (name, club, category) it starts in.
    The shape check is what separates an OE club name printed over the time column from the time itself."""
    pad = 3.0
    out: dict[str, list[W]] = {}
    for w in l.words:
        best, best_ov = None, 0.0
        for c in cols:
            if c.kind in _OE_TEXT:
                continue
            ov = min(w.x1, c.x1 + pad) - max(w.x0, c.x0 - pad)
            if ov > best_ov and _oe_fits(c.kind, w.text):
                best, best_ov = c, ov
        if best is None:
            # The column the word starts in. A text column runs until the next column; a word that starts in a
            # typed column without fitting it is a text cell running over (OE does not clip long club names),
            # unless it is a time: then it is a split time to the right of the result time, not a cell of ours.
            starts = [c for c in cols if c.x0 - pad <= w.x0]
            if not starts:
                continue
            home = max(starts, key=lambda c: c.x0)
            if home.kind not in _OE_TEXT:
                if _SPLIT_TOK.match(w.text) or _DIFF.match(w.text):
                    continue
                if not overflow and w.x0 > home.x1 + pad:
                    continue                           # split lists: right of the time is the split grid
                texts = [c for c in starts if c.kind in _OE_TEXT]
                if not texts:
                    continue
                home = max(texts, key=lambda c: c.x0)
            best = home
        out.setdefault(best.kind, []).append(w)
    # A time cell holding a time holds nothing else: words taken there as parts of a status ("Non partant") are
    # in fact the end of a club name drawn over the time ("... SPORTIVE 13:05 DE L'IGN").
    tcell = out.get("time", [])
    if any(_is_time(w.text) for w in tcell) and len(tcell) > 1:
        out["time"] = [w for w in tcell if _is_time(w.text)][:1]
        texts = [c for c in cols if c.kind in _OE_TEXT]
        for w in tcell:
            if w is out["time"][0]:
                continue
            left = [c for c in texts if c.x0 - pad <= w.x0]
            if left:
                kind = max(left, key=lambda c: c.x0).kind
                out.setdefault(kind, []).append(w)
                out[kind].sort(key=lambda x: x.x0)
    return out


def _oe_class_line(l: Line, time_col: _Col) -> tuple | None:
    """'H21 (9) 10,6 km 0 m 27 P' -> (name, length_m, climb_m, n_controls, continued)."""
    ws = l.words
    # OE's provisional lists stamp each class line « Etat de: 16:53 » (the time of the list, not a race time), and give
    # the count only on the class's first line: such a line is a class line, the words before « Etat » its name
    etat = next((i for i, w in enumerate(ws) if model.plain(w.text).rstrip(":") == "etat"), None)
    if etat and etat + 2 < len(ws) + 1 and any(model.plain(w.text).startswith("de") for w in ws[etat + 1:etat + 2]):
        ws = ws[:etat]
        if not any(_COUNT.match(w.text) for w in ws[:8]):
            # (a count cut short by the next column: « Violet court hommes (19/2 »)
            name = re.sub(r"\s*\(\d*(?:/\d*)?\)?\s*$", "", " ".join(w.text for w in ws)).strip()
            return (name, None, None, None, False) if name and not any(_is_time(w.text) for w in ws) else None
    ci = next((i for i, w in enumerate(ws[:8]) if _COUNT.match(w.text)), None)
    if not ci:
        return None
    if any(w.x0 < time_col.x1 + 3 and w.x1 > time_col.x0 - 3 and _is_time(w.text) for w in ws):
        return None
    name = " ".join(w.text for w in ws[:ci])
    rest = " ".join(w.text for w in ws[ci + 1:])
    km = re.search(r"(\d+(?:[.,]\d+)?)\s*km\b", rest)
    climb = re.search(r"km\s+(\d+)\s*m\b", rest)
    npc = re.search(r"\b(\d+)\s*[PC]\b", rest)                    # « 27 P » (postes), « 25 C » (controles)
    return (name, round(float(km.group(1).replace(",", ".")) * 1000) if km else None,
            int(climb.group(1)) if climb else None, int(npc.group(1)) if npc else None,
            "suite" in model.plain(rest))


def _oe_ctrl_line(l: Line) -> list[tuple[int | None, str | None, float]] | None:
    """A row of control labels: [(number, code, right edge)], number None for the finish ('Arr')."""
    out, junk = [], 0
    for w in l.words:
        m = _CTRL.match(w.text)
        if m:
            out.append((int(m.group(1)), m.group(2), w.x1))
        elif model.plain(w.text).strip(" .") in ("arr", "arrivee", "finish", "a", "meta", "llegada"):
            out.append((None, None, w.x1))
        else:
            junk += 1
    if not any(n for n, _, _ in out) or junk > max(1, len(out) // 4):
        return None
    return out


def _oe_row(l: Line, cols: list[_Col], overflow: bool = True) -> dict | None:
    cells = _oe_assign(l, cols, overflow)
    tim = " ".join(w.text for w in cells.get("time", []))
    pl = " ".join(w.text for w in cells.get("place", []))
    name = " ".join(w.text for w in cells.get("name", [])).replace(" ,", ",").strip()
    name = re.sub(r",\s*", " ", name).strip()           # "DURAND, paul" -> "DURAND paul"
    if not name or _bad_name(name) or (not tim and _status(pl) != "nc"):
        return None
    t = model.parse_time(tim) if tim else None
    st = "ok" if t is not None else (_status(tim) if tim else None)
    place = None
    if pl:
        m = _PLACE_OE.match(pl)
        if m:
            place = int(m.group(1))
        elif _status(pl) == "nc":
            st = "nc"                                  # OE prints "nc" in the place column, the time stays
        else:
            return None
    if st is None or (place is not None and (t is None or st != "ok")):
        return None
    if place is None and st == "ok":
        st = "nc"
    bib = " ".join(w.text for w in cells.get("bib", [])) or None
    birth = model.birth_year(" ".join(w.text for w in cells.get("birth", [])))
    club = " ".join(w.text for w in cells.get("club", [])) or None
    cat = " ".join(w.text for w in cells.get("cat", [])) or None
    r = model.runner(name, place=place, bib=bib, birth=birth, club=club, time_s=t, status=st)
    r["_cat"] = cat
    return r


def _parse_oe(pages: list[list[Line]]) -> dict | None:
    title = date = None
    stream: list[tuple[Line, list[_Col]]] = []
    cols = None
    for pno, lines in enumerate(pages):
        hi = next((i for i, l in enumerate(lines) if _oe_header(l)), None)
        if hi is not None:
            if title is None:
                title, date = _oe_title(lines[:hi])
            cols = _oe_header(lines[hi])
            body = lines[hi + 1:]
        elif cols is not None:
            body = [l for l in lines if not re.search(r"\bPage\s+\d+|©", l.text)]
        else:
            continue
        stream.extend((l, cols) for l in body)
    if not stream:
        return None
    has_cat = any(c.kind == "cat" for _, cs in stream[:1] for c in cs)
    splits_doc = any(_oe_ctrl_line(l) for l, _ in stream)

    classes, cur, last, prev_ctrl = [], None, None, False
    for l, cs in stream:
        time_col = next(c for c in cs if c.kind == "time")
        ctrl = _oe_ctrl_line(l)
        if ctrl is not None:
            if cur is not None:
                if not prev_ctrl:
                    cur["_blocks"] = []
                cur["_blocks"].append(ctrl)
            prev_ctrl, last = True, None
            continue
        prev_ctrl = False
        cl = _oe_class_line(l, time_col)
        if cl:
            name, length, climb, npc, cont = cl
            if has_cat:
                name = _strip_cats(name)
            if cur is not None and (cont or name == cur["name"]):
                last = None
                continue                                        # the same class, continued on a new page
            cur = model.klass(name, length_m=length, climb_m=climb)
            cur["_npc"], cur["_blocks"], cur["_time_col"] = npc, [], time_col
            classes.append(cur)
            last = None
            continue
        r = _oe_row(l, cs, overflow=not splits_doc) if cur is not None else None
        if r is not None:
            r["_lines"] = [l]
            cur["runners"].append(r)
            last = r
        elif last is not None:
            last["_lines"].append(l)                           # split lines (and extra punches) of that runner

    by = "circuit" if has_cat else _by_names(classes)
    for c in classes:
        for r in c["runners"]:
            cat = r.pop("_cat", None)
            r["category"] = _cat(cat) if has_cat else (_cat(c["name"]) if by == "category" else None)
            lines = r.pop("_lines")
            if c["_blocks"] and len(lines) > 1 and not r["club"]:
                tc = c["_time_col"]
                club = " ".join(w.text for w in lines[1].words if w.x0 < tc.x0 - 3 and not _SPLIT_TOK.match(w.text))
                if club and not _is_time(club):
                    r["club"], r["club_code"] = club, model.club_code(club)
            r["_lines"] = lines
        _oe_splits(c)
        for k in ("_npc", "_blocks", "_time_col"):
            c.pop(k, None)
        for r in c["runners"]:
            r.pop("_lines", None)
    return {"by": by, "title": title, "date": date, "classes": classes}


def _strip_cats(name: str) -> str:
    """'C H17 H40 H50' -> 'C': by circuit, OE prints the course name followed by the categories that ran it."""
    toks = name.split()
    i = len(toks)
    while i > 1 and _looks_category(toks[i - 1]):
        i -= 1
    return " ".join(toks[:i]) if i < len(toks) and not _looks_category(toks[0]) else name


def _oe_title(lines: list[Line]) -> tuple[str | None, str | None]:
    title = date = None
    for l in lines:
        m = _DATE_FR.search(l.text)
        if m and date is None:
            d, mo, y = map(int, m.groups())
            if 1 <= mo <= 12 and 1 <= d <= 31:
                date = f"{y:04d}-{mo:02d}-{d:02d}"
            words = []
            for w in l.words:
                if _WEEKDAY.match(w.text) or _DATE_FR.search(w.text):
                    break
                words.append(w.text)
            title = " ".join(words).strip() or None
    return title, date


def _oe_splits(c: dict) -> None:
    blocks = c.get("_blocks") or []
    if not blocks:
        return
    cols = [x for b in blocks for x in b]
    nums = [n for n, _, _ in cols if n]
    npc = c.get("_npc") or max(nums)
    if max(nums) > npc or len(set(nums)) != len(nums):
        return                                                # labels we do not understand: no splits
    codes = {n: code for n, code, _ in cols if n}
    # A control missing from the labels (OE sometimes clips the last label of a row) keeps its place with a
    # placeholder code, so the following controls stay aligned.
    c["controls"] = [codes.get(i, f"#{i}") for i in range(1, npc + 1)]
    tc = c["_time_col"]
    for r in c["runners"]:
        lines = r.get("_lines") or []
        rows = []
        for i, l in enumerate(lines):
            ws = [w for w in l.words if w.x0 > tc.x1 + 3] if i == 0 else l.words
            rows.append(ws)
        cum, leg = {}, {}
        ok = True
        for b, block in enumerate(blocks):
            for target, ri in ((cum, 2 * b), (leg, 2 * b + 1)):
                if ri >= len(rows):
                    continue
                if not _oe_fill(rows[ri], block, target):
                    ok = False
        if not ok or not cum:
            continue
        sp = [cum.get(i) for i in range(1, npc + 1)]
        # Recover a control whose column is missing: its time is the next control's minus the next leg.
        for i in range(1, npc + 1):
            if i not in codes and sp[i - 1] is None and i < npc and cum.get(i + 1) and leg.get(i + 1):
                v = cum[i + 1] - leg[i + 1]
                prev = max([x for x in sp[:i - 1] if x is not None], default=0.0)
                sp[i - 1] = v if v > prev + 0.5 else None
        if not _oe_legs_agree(sp, leg, npc):
            continue
        sp = _monotone(sp + [r["time_s"]] if r["time_s"] is not None else sp)[:npc]
        if r["time_s"] is not None and any(v is not None and v > r["time_s"] + 0.5 for v in sp):
            continue
        if any(v is not None for v in sp):
            r["splits"] = sp


def _oe_fill(words: list[W], block, target: dict) -> bool:
    """Put the times of one split line under the control labels of `block` (right-aligned, like the labels).
    Returns False when the line clearly is not a split line of this block."""
    xs = sorted(x for _, _, x in block)
    gaps = [b - a for a, b in zip(xs, xs[1:])]
    tol = min(14.0, 0.45 * min(gaps)) if gaps else 14.0
    taken = {}
    for w in words:
        if not _SPLIT_TOK.match(w.text):
            continue
        n, x, d = min(((n, x, abs(w.x1 - x)) for n, _, x in block), key=lambda t: t[2])
        if d > tol:
            continue
        if n is None:
            continue                                           # the finish column
        if n in taken and taken[n] <= d:
            continue
        taken[n] = d
        target[n] = _split_val(w.text)
    return True


def _oe_legs_agree(sp: list[float | None], leg: dict, npc: int) -> bool:
    """OE prints each leg under its cumulative time: when the two lines were paired right, leg = this cumulative
    minus the previous punched one. A runner whose lines disagree is misread: no splits rather than wrong ones."""
    good = bad = 0
    prev = 0.0
    for i in range(1, npc + 1):
        v = sp[i - 1]
        if v is None:
            continue
        lg = leg.get(i)
        if lg is not None:
            if abs((v - prev) - lg) <= 1.5:
                good += 1
            else:
                bad += 1
        prev = v
    return bad <= max(1, good // 10) if (good + bad) else True
