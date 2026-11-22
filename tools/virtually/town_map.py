"""A sprint map (ISSprOM 2019-2, 1:4000) of a town from open data (town_fetch.py first):

  py town_map.py <race> [--clip] [--no-check] [--fresh | --from sources|terrain|areas]

DATA/<race>/map_objects.json, then  node --import ../mapper/shim.mjs mkocd.mjs … map.ocd  (town_all.py runs every step).
The generator is the package townmap/ (its __init__ lists the stages; each module says its rules). It replaced the single
script of November 2026 on 2026-11-22: areas as one partition instead of stacked layers, the OSM tags in one table
(townmap/tagmap.py), no repair pass. Measure a change with town_metrics.py (the measures, and a before/after sheet), the
legibility report (src/legibility.json, written unless --no-check) and test_remarks.py.

--clip      the objects cut to the area asked for (area.json `box`) instead of the area fetched with its margin — Cartographier's
            « Plan de ville » (townmap_ci.py)
--no-check  no legibility report (a user's map: the report is the developer's test)
--fresh     every stage run again; --from <stage>: from that stage on (the stages' results are kept in src/stage/)

Also written, for build.py and town_3d.py: src/classes.npz (the ground's classes as a raster), walls.json, passages.json,
sports.json, lidar_grids.npz, roofpts.npy; for the review: olive_origin.json, osm_unknown.json, timing.json."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from townmap import run  # noqa: E402

if __name__ == "__main__":
    run.main(sys.argv[1:])
