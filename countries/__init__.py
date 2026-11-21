"""The countries Ozimut reads, and the index of them the site publishes (site/data/meta.json `countries`).

    from countries import registry, get
    for c in registry(): ...

See countries/base.py for what a country is and how its data is laid out.
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import ACCESS, SITE_DATA, Country

__all__ = ["ACCESS", "SITE_DATA", "Country", "modules", "registry", "get", "write_index", "move_legacy_layout"]


# the countries whose agenda alone Ozimut reads (countries/agenda.py; 2026-10-23: the IOF members with a clean source;
# GE, HR, MK from OrienteeringOnline, countries/oonline.py)
AGENDA_ONLY = ("at", "be", "bg", "br", "by", "ch", "cz", "de", "dk", "ee", "gb", "ge", "hk", "hr", "ie", "il", "it", "jp",
               "kr", "lt", "mk", "pl", "ro", "rs", "si", "sk", "tr", "ua", "za")


def modules() -> list:
    """Every country's module (countries/fr, countries/es, countries/ch…), France first: its COUNTRY, and what it can do —
    refresh_agenda(root), agenda_path(root)…"""
    import importlib
    from . import ca, es, fr, world, wre
    # « IOF WRE » (countries/wre.py) after the countries: it matches each WRE to its host country's agenda as just refreshed;
    # « Tous les pays » (countries/world.py) last: every country's agenda and the WREs in one list
    return [fr, es, ca] + [importlib.import_module(f"{__name__}.{k}") for k in AGENDA_ONLY] + [wre, world]


def registry() -> list[Country]:
    """Every country, France first (its default)."""
    return [m.COUNTRY for m in modules()]


def get(code: str) -> Country:
    code = code.upper()
    for c in registry():
        if c.code == code:
            return c
    raise KeyError(code)


SHOWN = ("official", "top6w")         # the methods the pages offer (the usual level, "fair", only values circuits)


def summary(c: Country, root: Path = SITE_DATA) -> dict | None:
    """What the site's index says of a country: who may read it, what it has. None when nothing is built for it yet."""
    d = c.data_dir(root)
    try:
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        meta = None
    agenda = (d / "agenda.json").exists()
    if not meta and not agenda:
        return None
    out = {"access": c.access, "federation": c.federation, "agenda": agenda, "ranking": bool(meta)}
    if c.code == "XW" and agenda:                # « IOF WRE »: the countries its events take place in (their own lists show them)
        try:
            ev = json.loads((d / "agenda.json").read_text(encoding="utf-8")).get("events") or []
            out["hosts"] = sorted({e["host"] for e in ev if e.get("host")})
        except (OSError, ValueError):
            pass
    if c.code == "XA" and agenda:                # « Tous les pays »: the countries whose own list gains OrienteeringOnline's
        try:
            out["hosts"] = json.loads((d / "extra.json").read_text(encoding="utf-8")).get("hosts") or []
        except (OSError, ValueError):
            pass
    if meta:
        out.update({"built": meta.get("built"), "methods": [m for m in meta.get("methods", {}) if m in SHOWN],
                    "seasons": meta.get("seasons", []), "counts": meta.get("counts", {})})
        if meta.get("official_table"):           # the federation's ranking as a table of its own (Spain's FEDO)
            out["official_table"] = meta["official_table"]
    if c.official:
        out["official"] = c.official
    return out


def write_index(root: Path = SITE_DATA) -> bool:
    """site/data/meta.json: the countries the site has data for (country.js reads it; public, as the login page's
    figures). True when it changed."""
    from site_io import dump, WRITES
    countries = {}
    for c in registry():
        s = summary(c, root)
        if s:
            countries[c.code] = s
    before = WRITES["written"]
    # (no date of its own: the file changes only when a country's does, and each change costs a deploy)
    dump(root / "meta.json", {"v": 2, "countries": countries})
    return WRITES["written"] > before


# France's files as they were before the countries (2026-10-22): at the root of site/data
LEGACY = ("runners.json", "competitions.json", "agenda.json", "cfc.json", "elite_summary.json", "evaluation.json",
          "validation.json", "participation.json", "agecurve.json",
          "r", "c", "snap", "club", "club_courses", "net", "elite", "pyramid", "ask")


def move_legacy_layout(root: Path = SITE_DATA) -> bool:
    """Once: France's site data, built at the root of site/data before the countries, moved into site/data/fr/ (its
    meta.json too; the root's becomes the countries' index). True when something moved."""
    old_meta = root / "meta.json"
    try:
        legacy_meta = "countries" not in json.loads(old_meta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        legacy_meta = False
    names = [n for n in LEGACY if (root / n).exists()]
    if not names and not legacy_meta:
        return False
    fr = get("FR").data_dir(root)
    fr.mkdir(parents=True, exist_ok=True)
    for n in names:
        dest = fr / n
        if dest.exists():                    # already there (a run cut short): the root's copy is the older one
            _remove(root / n)
            continue
        _move(root / n, dest)
    if legacy_meta:
        dest = fr / "meta.json"
        if dest.exists():
            old_meta.unlink()
        else:
            old_meta.rename(dest)
    print(f"countries: France's site data moved into {fr.relative_to(root.parent)}/ ({len(names) + legacy_meta} entries)")
    return True


def _move(src: Path, dest: Path) -> None:
    """A rename; on Windows a folder of thousands of files just written can stay locked a while (an antivirus reading
    them): a few tries, then a copy and the original removed."""
    import shutil
    import time
    for i in range(6):
        try:
            src.rename(dest)
            return
        except PermissionError:
            time.sleep(2 + 2 * i)
    if src.is_dir():
        shutil.copytree(src, dest)
    else:
        shutil.copy2(src, dest)
    _remove(src)


def _remove(p: Path) -> None:
    """Gone, or as much of it as can be: what stays (a locked file) is removed by the next run."""
    import shutil
    if p.is_dir():
        shutil.rmtree(p, ignore_errors=True)
    else:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass
    if p.exists():
        print(f"countries: {p} could not be removed yet (locked): the next run tries again")
