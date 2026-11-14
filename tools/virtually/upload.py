"""A « Virtually » race package (build.py, course.py) into R2 cn-state virtual/<race>/, where functions/api/virtual serves it to
the administrators.   py upload.py <race>             the local dev server's R2 (wrangler --local)
                      py upload.py <race> --remote    the live site's R2: only a map Ozimut may use (made from open data, or a club's map
                                     with its written permission; owner, 2026-11-12)
                      --accept-violations   publish a map whose legibility check left errors: the list goes with the package
A map made by town_map.py carries its legibility report (src/legibility.json): with errors left (the specification's « shall »
rules) it is not published unless --accept-violations, and then its list is published with it (legibility.json)."""
import json, os, shutil, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
DATA = Path(os.environ.get("VIRTUAL_DATA") or Path(__import__("paths").DATA_DIR) / "virtual")
race = sys.argv[1]
where = "--remote" if "--remote" in sys.argv else "--local"
pkg = DATA / race / "pkg"
repo = Path(__file__).resolve().parents[2]
leg = DATA / race / "src" / "legibility.json"
if leg.exists():
    rep = json.load(open(leg, encoding="utf-8"))
    errors = {k: v["left"] for k, v in rep.get("entries", {}).items() if v.get("sev") == "error" and v.get("left")}
    if errors:
        print("legibility: " + ", ".join(f"{k} {n}" for k, n in sorted(errors.items(), key=lambda kv: -kv[1])), flush=True)
        if "--accept-violations" not in sys.argv:
            sys.exit(f"{race}: {sum(errors.values())} legibility errors left — not uploaded (see src/legibility.json, "
                     "legibility.py --sheet; --accept-violations publishes them with their list)")
    shutil.copyfile(leg, pkg / "legibility.json")             # the list goes with the package, errors or none
# the package as published (pkggz.py): town.bin and map.ocd also gzipped, race.json naming them, uploaded last
from pkggz import publish_list
NAMES = ("h.png", "cls.png", "veg.png", "ground.jpg", "feats.json", "trees.bin", "map.ocd", "map.webp", "thumb.webp", "town.json", "town.bin", "surf.png", "facades.webp", "legibility.json", "race.json")
for name, f in publish_list(pkg, DATA / race / "publish", NAMES):
    cmd = f'npx wrangler r2 object put "cn-state/virtual/{race}/{name}" {where} --file "{f}"'
    for attempt in range(3):                                   # the local store is sometimes busy (the dev server): again
        r = subprocess.run(cmd, cwd=repo, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode == 0:
            break
    print(name, "ok" if r.returncode == 0 else (r.stderr.strip() or r.stdout.strip())[-300:], flush=True)
