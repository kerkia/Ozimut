"""A « Virtually » race package as it is published (R2 virtual/<race>/, virtual-ev/<event>/): its large files also gzipped
(owner, 2026-11-14: Gif's race took « an eternity » to load — town.bin 14 MB and map.ocd 14 MB went uncompressed, Cloudflare
compressing only text), and race.json naming them: `gz` the files the game may ask for as <name>.gz (games/vworld.js inflates
them; the plain files stay for the pages that read them as they are, virtuallyan.js), `bytes` each published file's size (the
game's progress line). The package's folder keeps its plain files; the published race.json is written beside the .gz copies.

    from pkggz import publish_list
    for name, path in publish_list(pkg, tmp): upload(name, path)        # race.json last: never naming a file not yet there
"""
import gzip, json
from pathlib import Path

GZ = ("town.bin", "map.ocd")             # binary, compressing 2.6-3.2 times; images and JSON are not (JSON: Cloudflare does)


def publish_list(pkg: Path, tmp: Path, names=None):
    """[(published name, local file)] for the package in `pkg`, its .gz copies and race.json written into `tmp`; race.json last.
    `names`: the files to publish (default: every file of the folder)."""
    pkg, tmp = Path(pkg), Path(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    files = [f for f in (names or sorted(p.name for p in pkg.iterdir() if p.is_file())) if (pkg / f).exists() and f != "race.json"]
    out, zipped = [(f, pkg / f) for f in files], []
    for f in files:
        if f in GZ:
            z = tmp / f"{f}.gz"
            z.write_bytes(gzip.compress((pkg / f).read_bytes(), compresslevel=9, mtime=0))
            out.append((f"{f}.gz", z)); zipped.append(f)
    if (pkg / "race.json").exists():
        race = json.loads((pkg / "race.json").read_text(encoding="utf-8"))
        race["gz"] = zipped
        race["bytes"] = {name: path.stat().st_size for name, path in out}
        r = tmp / "race.json"
        r.write_text(json.dumps(race, ensure_ascii=False, separators=(",", ":")), encoding="utf-8", newline="\n")
        out.append(("race.json", r))
    return out
