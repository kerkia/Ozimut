"""Update everything from the official site, doing only the work changes need.

    py -3 update.py                 # usual run: the last ~3 months, corrections included
    py -3 update.py --new-only      # quick run: only competitions not yet stored,
                                    #   from the last 2 months (run it more often)
    py -3 update.py --dry-run       # report what changed, write nothing
    py -3 update.py --full          # re-check every competition (slow, rare)
    py -3 update.py --use-stamps    # faster, but misses the federation's own
                                    #   later revisions of CN values (not advised)
    py -3 update.py --since 2026-06-01 --no-fetch   # recompute & rebuild only
    py -3 update.py --new-only --deploy             # ... and publish to Cloudflare Pages
    py -3 update.py --deploy-only                   # publish the current site as it is

Schedule: `--new-only` every hour; the full run once a day at 03:00 Paris time
(the two never overlap: a run started while another is going simply skips).

Steps, each skipped when there is nothing to do:
  1. fetch & compare (ffco_scraper.updater) — writes only real differences
     to the scraped tables and logs each change with its date;
  2. recompute the three CN methods from the earliest changed date, resuming
     from the stored state instead of starting again from 2010;
  3. rebuild the site data from that date (earlier seasons' snapshots kept,
     unchanged files left untouched);
  4. with --deploy: publish site/ (and functions/) to Cloudflare Pages with
     wrangler, which uploads only the files that changed. A rebuilt site that
     could not be published is published by the next run, even if nothing
     changed then.

Archived seasons (before 2024) are members-only on the site: set a fresh
FFCO_SESSIONID in the environment for --full to check them. Nothing in the
default run needs it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from ffco_scraper.cn_engine import CnEngine, build_methods

ROOT = Path(__file__).parent
import countries  # noqa: E402  (the countries read: their sources, databases and site data folders)
import countries.fr as france  # noqa: E402
import notify  # noqa: E402  (digest e-mails for subscribed accounts)
import paths  # noqa: E402  (the data folder, outside the project folder)
import relays  # noqa: E402  (the national relays' history: CFC and CNE, from R2 relays/)
import champs  # noqa: E402  (the individual championships' palmarès, from the database)
PAGES_PROJECT = os.environ.get("CN_PAGES_PROJECT", "observatoire-cn")
DEPLOY_PENDING = paths.DATA_DIR / "deploy.pending"     # site rebuilt, not yet published
# Bumped when a method's definition changes: the next run (of any kind) recomputes it once, everywhere.
#   2 (2026-10-03): a Top CN is the aggregate of the published race scores, no factor at the CN level
#   3 (2026-10-03): the monthly anchor is FFCO's: mean of the best 20 % of the CNs at 5600
#   4 (2026-10-05): the factor of a race is that of its day (straight line between monthly factors)
#   5 (2026-10-14): the Top (top6w3) is the weighted arithmetic mean of its 6 places, not the cubic one; the recalage
#                   of fair3 anchors on that Top (Normalisation.anchor_cn_power)
TOP6W_CN_VERSION = 5
# Same for a change of the computation itself: the computed methods recomputed from 2010, then the site.
#   1 (2026-10-03): "nc" (non classé) rows take no part in any calculation; Top: 6 weight slots, not 6 races
#   2 (2026-10-04): Top: 10 slots; weights by name (championnat de France 2, national 1.5, other 1)
#   3 (2026-10-05): Top: circuits valued by the uncapped best 60 %; no fallback first official CN
#   4 (2026-10-05): the 2026 method replaced by "fair" (weighted best 60 %); Top derived from it, 6 places
#   5 (2026-10-06): VTT and ski: windows of 2 and 3 years, best 70 % (their own params, CnParams.by_terrain)
#   6 (2026-10-07): the quadratic variants "fair2" and "top6w2" (circuit value and CN as quadratic means)
#   7 (2026-10-07): the quadratic variants keep FFCO's linear circuit value; only the CN is a quadratic mean
#   8 (2026-10-13): "fair3" and "top6w3" replace the quadratic variants: cubic mean, geometric circuit value (the
#                   whole field in forest, the fastest two-thirds in sprint), recalage anchored on the Top with the
#                   drift of the raw scale corrected (the forest level sat 7 % above 5600)
#   9 (2026-10-14): one method for the four disciplines: VTT and ski take sprint's rules (geometric circuit value over the
#                   fastest two-thirds, cubic usual level); the same recalage everywhere, in calendar months
#  10 (2026-10-15): the share of the field valuing a circuit becomes a dial (tail_k): forest 0, sprint 400, VTT and ski 50
#  11 (2026-10-16): the linear pair becomes the method published: "fair" values circuits by the arithmetic mean over the
#                   fastest 90 % in forest, two-thirds in sprint, 75 % in VTT and ski, with the drift-corrected recalage
#                   anchored on the Top; "top6w" is the Top everyone sees, "top6w3"/"fair3" the geometric analysis pair
#  12 (2026-10-19): the linear pair's juniors' races fade over the window (a race run in H/D 12-20 weighs 1 - its age /
#                   the window in the CN's mean, junior_fade); the race files' CN J-15 is computed on its own day
#  13 (2026-10-19): the geometric pair ("fair3", "top6w3") removed (owner): its data dropped, the site's race files
#                   rebuilt without its columns; "top6w" is published as the Ozimut method
#  14 (2026-10-23): 2 races for a CN instead of 3 (owner): every runner with 2 races in the window is ranked
ENGINE_VERSION = 14
# Same for the second-stage datasets (site_extras.py): the next run rebuilds them once, nothing recomputed.
#   1 (2026-10-06): age pyramid / territory counts (pyramid/), co-runners per discipline (net/)
#   2 (2026-10-06): validation.json, the methods' head-to-head accuracy, for the Méthodes page
#   3 (2026-10-07): participation.json, the statistics moved from the home page to Réseau · Activité
#   4 (2026-10-10): evaluation.json, the methods measured per circuit, out of sample, with intervals (site_eval.py)
#   5 (2026-10-10): cfc.json, the Coupe de France des clubs recomputed (FFCO's 2026 rule), for Comparer des clubs
#   6 (2026-10-14): evaluation.json, the duels called right weighted by each circuit's runners (not once per circuit)
#   7 (2026-10-15): ask/*.parquet, the tables « IA » queries in the browser (site_ask.py)
#   8 (2026-11-15): mostraces.json, the runners with the most races (Statistiques › « Les plus actifs »)
EXTRAS_VERSION = 8
COMPUTED = ("fair", "top6w")   # in this order: the Ozimut method (top6w) is derived from the usual level (fair)


def migrate(db: Path, out: Path) -> bool:
    """One-off recomputation after a method change; True when the site data was rebuilt. `db` and `out`: a country's
    database and site data folder (site/data/fr)."""
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT)")
    meta = dict(con.execute("SELECT key, value FROM engine_meta").fetchall())
    con.close()
    engine_due = int(meta.get("engine", 0)) < ENGINE_VERSION
    top_due = int(meta.get("top6w_cn", 0)) < TOP6W_CN_VERSION
    extras_due = int(meta.get("extras", 0)) < EXTRAS_VERSION
    if not engine_due and not top_due and not extras_due:
        return False
    t0 = time.monotonic()
    (out / "validation.json").unlink(missing_ok=True)     # the methods' accuracy, rebuilt with them
    (out / "evaluation.json").unlink(missing_ok=True)
    if not engine_due and not top_due:
        print("migration: second-stage site data rebuilt")
        import site_extras
        site_extras.main(out)
        _set_versions(db)
        DEPLOY_PENDING.touch()
        print(f"migration done in {time.monotonic() - t0:.0f}s")
        return True
    engine = CnEngine(db)
    if engine_due:
        print("migration: computed methods recomputed from the start")
        methods = build_methods()
        for table in ("scores", "cn_history", "circuit_values", "rescale_factors", "normalisation"):
            engine.conn.execute(f"DELETE FROM {table} WHERE method NOT IN ('official', {', '.join('?' * len(COMPUTED))})",
                                COMPUTED)             # methods that no longer exist (v2026)
        engine.conn.commit()
        for name in COMPUTED:
            t1 = time.monotonic()
            spec = methods[name]
            engine.derive(spec) if spec.derived_from else engine.run_method(spec)
            print(f"  {name}: {time.monotonic() - t1:.0f}s")
        engine.conn.execute("VACUUM")
    else:
        print("migration: Fair and Top — factors, race scores and CN recomputed, every season")
        methods = build_methods()
        for name in COMPUTED:
            spec = methods[name]
            engine.derive(spec) if spec.derived_from else engine._normalise(spec, None)
    engine.write_runners()
    engine.close()
    import build_site
    build_site.main(["--out", str(out), "--db", str(db)])      # site_extras included
    _set_versions(db)
    DEPLOY_PENDING.touch()
    print(f"migration done in {time.monotonic() - t0:.0f}s")
    return True


def _set_versions(db: Path) -> None:
    con = sqlite3.connect(db)
    con.executemany("INSERT OR REPLACE INTO engine_meta (key, value) VALUES (?, ?)",
                    [("top6w_cn", str(TOP6W_CN_VERSION)), ("engine", str(ENGINE_VERSION)),
                     ("extras", str(EXTRAS_VERSION))])
    con.commit()
    con.close()


def write_build_stamp() -> str:
    """A fingerprint of the site's code (site/ without its data), published as assets/build.txt. A page's code is
    loaded once per visit (the modules stay in memory), so an open tab would keep running the old code after a deploy:
    the app compares this file at its changes of page and reloads when it changed (2026-10-15). Data-only deploys
    leave it unchanged."""
    site = ROOT / "site"
    h = hashlib.sha1()
    for p in sorted(site.rglob("*")):
        rel = p.relative_to(site).as_posix()
        # (assets/v/ is the deploy's own copy of the code, front_build below: made from the rest, named by this stamp)
        if not p.is_file() or rel.startswith(("data/", "auth/", "assets/v/")) or rel in ("assets/build.txt", "assets/data.txt"):
            continue
        h.update(rel.encode("utf-8"))
        h.update(p.read_bytes())
    # the tool that makes that copy: a change to it changes what is published under the stamp's name
    if FRONT_BUILD.exists():
        h.update(FRONT_BUILD.read_bytes())
    stamp = h.hexdigest()[:16]
    (site / "assets" / "build.txt").write_text(stamp, encoding="utf-8")
    return stamp


def write_data_stamp() -> str:
    """This deploy's time, published as assets/data.txt. A page keeps the data it read for the whole visit (data.js's
    cache, the pages' own), so a tab left open showed the results of before a deploy (owner, 2026-11-17: Stats' last race
    was 8 November hours after FFCO's 14 and 15 were in): the app compares this file as it does build.txt and reloads at
    its next change of page. Every deploy changes it — a deploy happens only when something new was found. Not part of
    the code's fingerprint (write_build_stamp leaves it out)."""
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    (ROOT / "site" / "assets" / "data.txt").write_text(stamp, encoding="utf-8")
    return stamp


FRONT_BUILD = ROOT / "tools" / "front_build.mjs"


def front_build(stamp: str) -> bytes | None:
    """The code as browsers keep it (2026-11-17, tools/front_build.mjs): a copy of site/assets/js and app.css under
    site/assets/v/<stamp>/ — served « immutable » (site/_headers), so a returning visitor asks the server for none of it —,
    the texts cut to what each page says, each page's list of modules, and index.html pointing at that copy. -> index.html's
    own bytes, for the caller to put back once the site is uploaded (the page in git stays the one the local server shows);
    None when the copy could not be made: the site is then published as it is written, as before."""
    node = shutil.which("node.exe") or shutil.which("node")
    index = ROOT / "site" / "index.html"
    if not node or not FRONT_BUILD.exists():
        print("   front build: skipped (no node)")
        return None
    before = index.read_bytes()
    try:
        r = subprocess.run([node, str(FRONT_BUILD), "--stamp", stamp], cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=300)
    except Exception as e:                                  # noqa: BLE001 (whatever fails, the site is published as written)
        r = None
        print(f"   front build: FAILED ({e})")
    if r is not None and r.returncode == 0:
        for ln in r.stdout.splitlines()[-2:]:
            print(f"   {ln}")
        return before
    if r is not None:
        print("   front build: FAILED, the site is published as written")
        for ln in (r.stdout + r.stderr).splitlines()[-6:]:
            print(f"   {ln}")
    index.write_bytes(before)
    shutil.rmtree(ROOT / "site" / "assets" / "v", ignore_errors=True)
    return None


def code_fingerprint() -> str:
    """What a deploy publishes besides the data: site/ without data/ and auth/ (the build stamp) and functions/."""
    h = hashlib.sha1(write_build_stamp().encode())
    fn = ROOT / "functions"
    for p in sorted(fn.rglob("*")):
        if p.is_file():
            h.update(p.relative_to(fn).as_posix().encode("utf-8"))
            h.update(p.read_bytes())
    return h.hexdigest()[:16]


def code_changed(db: Path) -> bool:
    """True when the code differs from the last deploy's (2026-10-18: a push's own run is often cancelled by the next
    scheduled one queued behind the running one, and a scheduled run published only when it found new data — the
    pushed code waited for the next results)."""
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT)")
    row = con.execute("SELECT value FROM engine_meta WHERE key = 'deployed_code'").fetchone()
    con.close()
    return not row or row[0] != code_fingerprint()


def deploy(db: Path | None = None) -> bool:
    """Publish site/ with the Pages Functions in functions/. True on success; with `db`, the code's fingerprint is
    recorded there (`code_changed`)."""
    npx = shutil.which("npx.cmd") or shutil.which("npx")
    if not npx:
        print("4. deploy: npx not found (install Node.js)")
        return False
    code = code_fingerprint()
    write_data_stamp()
    t0 = time.monotonic()
    stamp = (ROOT / "site" / "assets" / "build.txt").read_text(encoding="utf-8").strip()
    index = front_build(stamp)
    cmd = [npx, "--yes", "wrangler", "pages", "deploy", "site", "--project-name", PAGES_PROJECT,
           "--branch", "main", "--commit-dirty=true"]
    # run from the project root: wrangler picks up ./functions from the working directory
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    finally:
        if index is not None:                                # the page as it is written, back in its place
            (ROOT / "site" / "index.html").write_bytes(index)
    tail = [ln for ln in (r.stdout + r.stderr).splitlines() if ln.strip()][-4:]
    print(f"4. deploy to {PAGES_PROJECT}: {'ok' if r.returncode == 0 else 'FAILED'} in {time.monotonic() - t0:.0f}s")
    for ln in tail:
        print(f"   {ln}")
    if r.returncode == 0 and db is not None:
        con = sqlite3.connect(db)
        con.execute("CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT)")
        con.execute("INSERT OR REPLACE INTO engine_meta (key, value) VALUES ('deployed_code', ?)", (code,))
        con.commit()
        con.close()
    return r.returncode == 0



def recompute(db: Path, since: str) -> None:
    engine = CnEngine(db)
    methods = build_methods()
    for name in ("official", *COMPUTED):
        t0 = time.monotonic()
        if name == "official":
            stats = engine.populate_official(since=since)
        elif methods[name].derived_from:
            stats = engine.derive(methods[name], since=since)
        else:
            stats = engine.run_method(methods[name], since=since)
        print(f"  {name}: {time.monotonic() - t0:.0f}s  " + "  ".join(f"{k}={v:,}" for k, v in stats.items()))
    engine.write_runners()
    engine.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", type=Path, default=paths.DB)
    ap.add_argument("--out", type=Path, default=ROOT / "site" / "data",
                    help="the site data root (France's files in its fr/ folder, the provisional results in prov/)")
    ap.add_argument("--cache-dir", type=Path, default=paths.CACHE)
    ap.add_argument("--recent-days", type=int, default=None,
                    help="how far back results can still appear or change "
                         "(default 100; 60 with --new-only)")
    ap.add_argument("--new-only", action="store_true",
                    help="quick run: fetch only competitions not yet in the database; "
                         "nothing stored is re-read")
    ap.add_argument("--audit-every", type=int, default=0,
                    help="also re-check a rotating 1/N of the archive each run (default off)")
    ap.add_argument("--full", action="store_true", help="re-check every competition")
    ap.add_argument("--use-stamps", action="store_true",
                    help="skip competitions whose results upload is unchanged; faster, but "
                         "misses the federation's later revisions of CN values")
    ap.add_argument("--seasons", type=int, nargs="*", default=None)
    ap.add_argument("--dry-run", action="store_true", help="report only")
    ap.add_argument("--no-fetch", action="store_true", help="skip step 1 (use with --since)")
    ap.add_argument("--no-site", action="store_true", help="skip step 3")
    ap.add_argument("--since", default=None, help="recompute from this date even if nothing changed")
    ap.add_argument("--deploy", action="store_true", help="publish to Cloudflare Pages when the site changed")
    ap.add_argument("--deploy-only", action="store_true", help="publish the current site, nothing else")
    ap.add_argument("--agenda-only", action="store_true",
                    help="refresh the agenda of upcoming events (site/data/agenda.json) and publish it if it changed")
    ap.add_argument("--prov-only", action="store_true",
                    help="provisional results only (organisers' results before FFCO); publish if something new was found")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if args.recent_days is None:
        args.recent_days = 60 if args.new_only else 100
    t0 = time.monotonic()
    since = args.since

    # the quick and the regular runs may be scheduled close together: never overlap
    lock = args.db.with_suffix(".update.lock")
    try:
        if lock.exists() and time.time() - lock.stat().st_mtime > 3 * 3600:
            lock.unlink()                       # left by a crashed run
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
    except FileExistsError:
        print("another update is running — skipped")
        sys.exit(0)
    fr_out = france.COUNTRY.data_dir(args.out)                  # site/data/fr
    try:
        if not args.dry_run:
            if countries.move_legacy_layout(args.out):          # once (2026-10-22): France's files into site/data/fr
                DEPLOY_PENDING.touch()
            sync_privacy(args.db)                               # before any build: the anonymised runners' list
            migrate(args.db, fr_out)                            # no-op once done
            apply_privacy(args.db, fr_out, args.out)            # no-op unless the anonymised runners changed
            if ensure_public(args.db, fr_out):                  # France's public copy, written once if missing
                DEPLOY_PENDING.touch()
            if relays.build(fr_out):                            # « Relais nationaux »: fr/relays.json, when its CSVs changed
                DEPLOY_PENDING.touch()
            if champs.build(args.db, fr_out):                   # « Palmarès »: fr/champs.json and fr/champs/, from the database
                DEPLOY_PENDING.touch()
            if countries.write_index(args.out):                 # site/data/meta.json: the countries and what they have
                DEPLOY_PENDING.touch()
            if args.deploy and code_changed(args.db):
                print("code changed since the last deploy: to be published")
                DEPLOY_PENDING.touch()
            # an agenda missing, or built by an older version of its scraper: rebuilt by any run (2026-11-05: a
            # Python-only push starts no run, and the hourly ones did not look, so a bump waited for 06:00)
            for m in countries.modules() if not args.agenda_only else []:
                if hasattr(m, "refresh_agenda") and not m.agenda_current(args.out):
                    _agenda(m, args.out)
                    countries.write_index(args.out)
                    DEPLOY_PENDING.touch()
                    print(f"agenda {m.COUNTRY.code}: rebuilt")
        if args.deploy_only:
            for m in countries.modules():
                if hasattr(m, "refresh_agenda"):
                    _agenda_positions(m, args.out)              # (no-op once placed by the current POS_VERSION)
            ok = deploy(args.db)
            if ok:
                DEPLOY_PENDING.unlink(missing_ok=True)
            sys.exit(0 if ok else 1)
        if args.agenda_only:
            changed = False
            for m in countries.modules():                       # each country's calendar (France's: FFCO's; Spain's: SICO…)
                if hasattr(m, "refresh_agenda"):
                    got = _agenda(m, args.out)
                    print(f"agenda {m.COUNTRY.code}: {'updated' if got else 'unchanged'} in {time.monotonic() - t0:.0f}s")
                    changed = changed or got
            if changed:
                countries.write_index(args.out)
                DEPLOY_PENDING.touch()
            if args.deploy and DEPLOY_PENDING.exists() and deploy(args.db):
                DEPLOY_PENDING.unlink(missing_ok=True)
            if args.deploy and not DEPLOY_PENDING.exists():       # the courses are online: alert the subscribers
                notify.run_agenda(france.agenda_path(args.out))
            sys.exit(0)
        if args.prov_only:
            _provisional(args)
            if args.deploy and DEPLOY_PENDING.exists() and deploy(args.db):
                DEPLOY_PENDING.unlink(missing_ok=True)
            if args.deploy and not args.dry_run and not DEPLOY_PENDING.exists():
                notify.run(args.db, args.out)               # the organisers' results just published (owner, 2026-10-17)
            print(f"provisional run done in {time.monotonic() - t0:.0f}s")
            sys.exit(0)
        rebuilt = _run(args, since, t0)
        if rebuilt:
            countries.write_index(args.out)
            DEPLOY_PENDING.touch()
        # 4b. provisional results (an admin pilot): what organisers publish before FFCO does (ffco_scraper/prov).
        # Published only when something new was found: a mere "looked again" must not cost a deploy.
        if not args.dry_run:
            _provisional(args)
        # 4c. the other countries' rankings (Spain's: its archive, who is who, the engine), once a day, in the full run
        if not args.dry_run and not args.new_only:
            _countries(args)
        if args.deploy and DEPLOY_PENDING.exists() and deploy(args.db):
            DEPLOY_PENDING.unlink(missing_ok=True)
        # 5. e-mail the subscribers (only once nothing is waiting to be published) and drain the mail queue
        if args.deploy and not args.dry_run and not DEPLOY_PENDING.exists():
            notify.run(args.db, args.out)
    finally:
        lock.unlink(missing_ok=True)


def sync_privacy(db: Path) -> None:
    """The anonymised runners' list (privacy.FILE, copied from R2 by the workflow) is kept in the database too: when the
    copy is missing (a failed download, a run on the PC), the last one known is used — an empty list would publish
    the names again."""
    import privacy
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT)")
    if privacy.FILE.exists():
        text = privacy.FILE.read_text(encoding="utf-8")
        if privacy.load().people or '"people"' in text:      # a list the admin page wrote (possibly empty)
            con.execute("INSERT OR REPLACE INTO engine_meta (key, value) VALUES ('anonymized_list', ?)", (text,))
            con.commit()
    else:
        row = con.execute("SELECT value FROM engine_meta WHERE key = 'anonymized_list'").fetchone()
        if row:
            privacy.FILE.parent.mkdir(parents=True, exist_ok=True)
            privacy.FILE.write_text(row[0], encoding="utf-8")
            print("privacy: the list was not downloaded — the last one known is used")
    con.close()


def apply_privacy(db: Path, out: Path, root: Path) -> bool:
    """The anonymised runners (privacy.py) changed since the site data was built: rebuild all of it once — the earlier
    seasons' snapshots too, which an incremental build keeps — and the provisional results' files, then publish.
    `out`: France's site data folder; `root`: the site data root (the provisional results)."""
    import privacy
    anon = privacy.load()
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE IF NOT EXISTS engine_meta (key TEXT PRIMARY KEY, value TEXT)")
    row = con.execute("SELECT value FROM engine_meta WHERE key = 'anonymized'").fetchone()
    con.close()
    applied = row[0] if row else privacy.Anon([]).fingerprint      # never set: built without anyone anonymised
    if applied == anon.fingerprint:
        return False
    t0 = time.monotonic()
    print(f"privacy: the anonymised runners changed ({len(anon.by_lic)} now) — the site data rebuilt in full")
    import build_site
    build_site.main(["--out", str(out), "--db", str(db)])
    try:
        import ffco_scraper.prov.run as prov
        prov.main(["--db", str(db), "--out", str(root), "--build-only"])
    except Exception as e:                       # the pilot must never stop the update; its next run rebuilds the files
        print(f"privacy: provisional results not rebuilt — {type(e).__name__}: {e}")
    con = sqlite3.connect(db)
    con.execute("INSERT OR REPLACE INTO engine_meta (key, value) VALUES ('anonymized', ?)", (anon.fingerprint,))
    con.commit()
    con.close()
    DEPLOY_PENDING.touch()
    print(f"privacy: done in {time.monotonic() - t0:.0f}s")
    return True


def _agenda(module, root: Path) -> bool:
    """A country's agenda refreshed, then its events placed on the map; a failure (its source down) never stops the
    others' nor the run."""
    try:
        got = bool(module.refresh_agenda(root))
    except Exception as e:
        print(f"agenda {module.COUNTRY.code}: failed — {type(e).__name__}: {e}")
        got = False
    return _agenda_positions(module, root) or got


def _agenda_positions(module, root: Path) -> bool:
    """The Agenda map's positions of a country's events (countries/agenda.py `add_positions`), when the file changed or
    was placed by an older POS_VERSION."""
    from countries.agenda import add_positions
    try:
        return add_positions(module.COUNTRY.code, module.agenda_path(root))
    except Exception as e:
        print(f"agenda {module.COUNTRY.code}: not placed on the map — {type(e).__name__}: {e}")
        return False


def _countries(args) -> None:
    """Each other country's daily update (countries/<cc>/ranking.py); a failure never stops the run."""
    for m in countries.modules():
        if m.COUNTRY.code == "FR":
            continue
        try:
            import importlib
            ranking = importlib.import_module(f"countries.{m.COUNTRY.key}.ranking")
        except ImportError:
            continue
        try:
            st = ranking.update(args.out, prov_db=args.db, budget_s=float(os.environ.get("COUNTRY_BUDGET", "900")))
            print(f"{m.COUNTRY.code}: {st}")
            if st.get("built") or st.get("agenda"):
                countries.write_index(args.out)
                DEPLOY_PENDING.touch()
        except Exception as e:
            print(f"{m.COUNTRY.code}: failed — {type(e).__name__}: {e}")


def _provisional(args) -> None:
    """Provisional results (an admin pilot, ffco_scraper/prov); marks a deploy when something new was found."""
    try:
        import ffco_scraper.prov.run as prov
        st = prov.run(args.db, args.out, agenda=france.agenda_path(args.out),
                      budget_s=float(os.environ.get("PROV_BUDGET", "240")))
        print(f"provisional: {st}")
        if st.get("changed") or st.get("added") or st.get("reshaped"):
            DEPLOY_PENDING.touch()
    except Exception as e:                       # the pilot must never stop the site's update
        print(f"provisional: failed — {type(e).__name__}: {e}")


def day_point_due(out: Path) -> bool:
    """The published rankings' latest point (meta.json's last month) is older than today in Paris."""
    import build_site
    try:
        last = json.loads((out / "meta.json").read_text(encoding="utf-8"))["months"][-1]
    except (OSError, ValueError, KeyError, IndexError):
        return False                         # no site data here: nothing to move
    return last < build_site.paris_today().isoformat()


def ensure_public(db: Path, out: Path) -> bool:
    """France's public copy (site_public.py; owner, 2026-10-30), written from the published files when a build has not
    made it yet (the first run after it came, a deploy-only run). -> True when written."""
    if (out / "pub" / "meta.json").exists() or not (out / "meta.json").exists():
        return False
    import site_public
    from countries.fr import public_period
    con = sqlite3.connect(db)
    try:
        start = public_period.public_from(con)
    finally:
        con.close()
    site_public.write(out, start)
    return True


def _run(args, since, t0) -> bool:
    """Steps 1-3 for France; True when the site data was rebuilt."""
    out = france.COUNTRY.data_dir(args.out)
    # FFCO's open seasons, checked once a month (countries/fr/public_period.py): a change rebuilds the public copy
    if not args.dry_run and not args.new_only:
        from countries.fr import public_period
        con = sqlite3.connect(args.db)
        try:
            before = public_period.public_from(con)
        finally:
            con.close()
        try:
            first = public_period.check(args.db)
            if first != before:
                import site_public
                site_public.write(out, first)
        except Exception as e:                  # never a reason to stop a run
            print(f"FFCO's open seasons not checked: {e}")
    # ---- 1. fetch & compare -------------------------------------------------------
    if not args.no_fetch:
        earliest, changes = france.fetch(args)
        if not args.dry_run:
            notify.remember(changes)                # announced by main() once the site is deployed
        if earliest:
            since = min(since, earliest) if since else earliest
        if args.dry_run:
            return False

    if not since:
        if args.no_site or not day_point_due(out):
            print(f"nothing changed — done in {time.monotonic() - t0:.0f}s")
            return False
        # nothing new, but a new day: the rankings' latest point (a junior's CN fades by the day) moves to today -
        # the current season's snapshots only, once a day, at the first run after midnight in Paris
        import build_site
        today = build_site.paris_today().isoformat()
        print(f"3. nothing changed; the rankings' latest point moves to {today}")
        build_site.main(["--since", today, "--out", str(out), "--db", str(args.db)])
        print(f"done in {time.monotonic() - t0:.0f}s")
        return True

    # ---- 2. recompute from the earliest change ------------------------------------
    print(f"2. recompute CN from {since}")
    recompute(args.db, since)

    # ---- 3. rebuild the site data ---------------------------------------------------
    if not args.no_site:
        print(f"3. site data from {since}")
        import build_site
        build_site.main(["--since", since, "--out", str(out), "--db", str(args.db)])
    print(f"done in {time.monotonic() - t0:.0f}s")
    return not args.no_site


if __name__ == "__main__":
    main()
