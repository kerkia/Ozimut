"""The stages in order.   py town_map.py <race> [--clip] [--no-check] [--fresh | --from <stage>]"""
import json, sys, time

import numpy as np
import shapely

from . import areas, contours, draw, export, sources, terrain
from .env import Env, SCALE

STAGES = ("sources", "terrain", "areas")                   # those whose result is kept (the rest takes seconds)


def main(argv):
    race = argv[0]
    env = Env(race, clip="--clip" in argv, fresh="--fresh" in argv)
    if "--from" in argv:                                   # run again from a stage: its cache and the later ones are dropped
        first = argv[argv.index("--from") + 1]
        for name in STAGES[STAGES.index(first):]:
            (env.SRC / "stage" / f"{name}.pkl").unlink(missing_ok=True)
    env.step("vectors")
    s = env.stage("sources", lambda: sources.load(env))
    env.step("points")
    t = env.stage("terrain", lambda: terrain.load(env))
    env.step("areas")
    a = env.stage("areas", lambda: areas.run(env, s, t))
    env.step("lines")
    t0 = time.time()
    d = draw.Doc(env)
    draw.run(env, s, t, a, d)
    env.times.append(("draw", round(time.time() - t0, 1))); t0 = time.time()
    env.step("contours")
    contours.run(env, s, t, a, d)
    env.times.append(("contours", round(time.time() - t0, 1))); t0 = time.time()
    env.step("objects")
    objects = d.objects
    export.rounded(objects)
    doc = {"title": f"{race} sprint", "scale": SCALE, "set": "issprom2019-2", "realWorld": {"x": env.CX, "y": env.CY, "epsg": 2154},
           "objects": objects}
    # the legibility check: a report and a gate, never a repair (what it finds is fixed in the stages above)
    leg = env.SRC / "legibility.json"
    if "--no-check" in argv:
        leg.unlink(missing_ok=True)
    else:
        env.step("legibility")
        import legibility
        rep = legibility.check(doc, fix=False, frame=env.CLIP, log=env.log, decks=s.DECK_ALL)
        for line in ["legibility"] + rep.lines():
            env.log(line)
        legibility.write_report(rep, leg)
        env.times.append(("check", round(time.time() - t0, 1))); t0 = time.time()
    export.open_junctions(objects, env.log)
    export.curves(objects, env.log)
    json.dump(doc, open(env.RD / "map_objects.json", "w"), separators=(",", ":"))
    np.savez_compressed(env.SRC / "classes.npz", cl=a.cl, chm=t.chm, canopy=a.canopy)
    json.dump({k: shapely.geometry.mapping(v.simplify(0.2)) for k, v in a.why.items() if v is not None and not v.is_empty},
              open(env.SRC / "olive_origin.json", "w"))
    env.times.append(("export", round(time.time() - t0, 1)))
    json.dump({"seconds": dict(env.times), "total": round(time.time() - env.T0, 1), "objects": len(objects),
               "vertices": sum(len(r) for o in objects for r in o["rings"])}, open(env.SRC / "timing.json", "w"), indent=1)
    by = {}
    for o in objects:
        by[o["sym"]] = by.get(o["sym"], 0) + 1
    env.log("objects", len(objects), dict(sorted(by.items())))
    env.log("times", env.times)


if __name__ == "__main__":
    main(sys.argv[1:])
