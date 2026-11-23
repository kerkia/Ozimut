"""The objects as written to map_objects.json: polylines for what is built, curves for what grows or flows.

A man-made edge is straight on the ground and in its sources (a building, a paved area, a parcel's limit, a wall): it stays a
polyline with its corners. Contours, water, vegetation and open land have no angle: Bézier curves through their points
(Catmull-Rom tangents) — but a point that also belongs to a man-made object is a corner in every object through it, so two areas
that share an edge still share it exactly. (The first generator curved every outline, then clamped the curves: 575 000 curve
points for Gif; the owner, 2026-11-19: « information that is clean in OSM becomes wrongly distorted ».)

Also here, on the finished lines: the unpaved paths' junctions opened (505 is a double line), and the paved edge cut where a
path's band covers it."""
import math

import shapely
import shapely.prepared
from shapely.geometry import LineString, Point

from .env import S, lines, union

NATURAL = {S(101), S(102), S(103), S(305), S(306), S(301), S(301, 9), S(302), S(308), S(401), S(402), S(403), S(406), S(408),
           S(410), S(411), S(505), S(506)}                 # (a hedge grows: no angle on its outline either — the remarks' test 14)
PRIO = [S(301), S(301, 9), S(305), S(306), S(101), S(102), S(308), S(411), S(410), S(408), S(406), S(402), S(401)]
SKIP = {S(990), S(991), S(993), S(601, 1)}
TOL_MM = 0.25                                              # how far a curve may stray from the chord between two of its points
TOL_PATH_MM = 0.075                                        # … a path's (0.3 m: OpenStreetMap's line is the path)
PLAIN = {S(521), S(522), S(512, 3), S(993)}                # areas written as plain rings (no corner flags: no pattern on their edge)
DBL_HALF, DBL_EDGE = 0.31, 0.25                            # 505: its half width and an edge's middle from the centre line, mm
_K = lambda p: (round(p[0], 3), round(p[1], 3))


def _rings(o):
    return o["rings"] if o["otp"] == 3 else o["rings"][:1]


def _closed(r):
    return len(r) >= 4 and _K(r[0]) == _K(r[-1])


def _turn(a, b, c):
    u, v = (b[0] - a[0], b[1] - a[1]), (c[0] - b[0], c[1] - b[1])
    nu, nv = math.hypot(*u), math.hypot(*v)
    return 0.0 if nu < 1e-9 or nv < 1e-9 else math.degrees(math.acos(max(-1.0, min(1.0, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))))


def open_junctions(objects, log):
    """505 is a double line (black edges over a brown fill): at a junction each path's edges would cross the other's fill. Each
    edge is left out wherever it lies inside another path's band — OCAD's « no left line » / « no right line » flags, side by
    side on its own, points inserted where an edge enters or leaves a band. And a paved area's edge (501.1) stops where an
    unpaved path's band covers it."""
    dbl = [o for o in objects if o["sym"] == S(505) and o["otp"] == 2 and len(o["rings"][0]) >= 2]
    dl = [LineString(o["rings"][0]) for o in dbl]
    if not dl:
        return
    tree = shapely.STRtree(dl)
    STEP = 0.05                                            # mm (0.2 m)
    n = 0
    for i, o in enumerate(dbl):
        l = dl[i]
        near = [j for j in tree.query(l.buffer(DBL_HALF + DBL_EDGE)) if j != i]
        if not near or l.length <= 0:
            continue
        band = shapely.prepared.prep(union([dl[j].buffer(DBL_HALF, cap_style="flat") for j in near]))
        vd = [l.project(Point(c)) for c in l.coords]

        def state(d0, d1):
            dm = (d0 + d1) / 2
            a, b = l.interpolate(max(0.0, dm - 0.01)), l.interpolate(min(l.length, dm + 0.01))
            tx, ty = b.x - a.x, b.y - a.y; tn = math.hypot(tx, ty)
            if tn < 1e-9:
                return (False, False)
            nx, ny = -ty / tn, tx / tn
            m = l.interpolate(dm)
            return (band.contains(Point(m.x + nx * DBL_EDGE, m.y + ny * DBL_EDGE)), band.contains(Point(m.x - nx * DBL_EDGE, m.y - ny * DBL_EDGE)))

        ds = sorted(set(vd) | {min(l.length, k * STEP) for k in range(int(l.length / STEP) + 1)} | {l.length})
        sts = [state(ds[k], ds[k + 1]) for k in range(len(ds) - 1)]
        if not any(a or b for a, b in sts):
            continue
        vset = set(round(v, 6) for v in vd)
        keep = [0] + [k for k in range(1, len(ds) - 1) if round(ds[k], 6) in vset or sts[k] != sts[k - 1]] + [len(ds) - 1]
        pts = [l.interpolate(ds[k]) for k in keep]
        o["rings"][0] = [[round(q.x, 3), round(q.y, 3)] for q in pts]
        o["nolr"] = [sts[keep[q]] if q < len(keep) - 1 else (False, False) for q in range(len(keep))]; n += 1
    dband = union([q.buffer(DBL_HALF, cap_style="flat") for q in dl])
    prep = shapely.prepared.prep(dband)
    add = []
    for o in [o for o in objects if o["sym"] == S(501, 1) and o["otp"] == 2 and len(o["rings"][0]) >= 2]:
        l = LineString(o["rings"][0])
        if not prep.intersects(l):
            continue
        parts = [q for q in lines(l.difference(dband)) if q.length >= 0.3]
        o["rings"] = [[[round(x, 3), round(y, 3)] for x, y in parts[0].coords]] if parts else []
        add += [{"sym": S(501, 1), "otp": 2, "rings": [[[round(x, 3), round(y, 3)] for x, y in q.coords]]} for q in parts[1:]]
    objects[:] = [o for o in objects if not (o["sym"] == S(501, 1) and o["otp"] == 2 and not o["rings"])] + add
    log("unpaved paths opened at their junctions", n)


def curves(objects, log):
    """o["bez"] for every line and area: [x, y, x flag (1, 2: a curve's handles; 4: no left edge), y flag (1: a corner point,
    where a line's pattern starts again; 4: no right edge)]."""
    MM = set()                                             # the points of what is built
    for o in objects:
        if o["otp"] == 1 or o["sym"] in NATURAL or o["sym"] in SKIP:
            continue
        for r in _rings(o):
            MM.update(_K(p) for p in r)
    VT = {}                                                # point → unit tangent, set by the most natural object through it
    nat = [o for o in objects if o["otp"] != 1 and o["sym"] in NATURAL]
    for o in sorted(nat, key=lambda o: PRIO.index(o["sym"]) if o["sym"] in PRIO else len(PRIO)):
        for r in _rings(o):
            cl = o["otp"] == 3 or _closed(r); pts = r[:-1] if cl and _K(r[0]) == _K(r[-1]) else r; n = len(pts)
            if n < 3:
                continue
            for i, b in enumerate(pts):
                kk = _K(b)
                if kk in VT or kk in MM or (not cl and (i == 0 or i == n - 1)):
                    continue
                a, c = pts[(i - 1) % n], pts[(i + 1) % n]
                tx, ty = c[0] - a[0], c[1] - a[1]; tn = math.hypot(tx, ty)
                if tn > 1e-9:
                    VT[kk] = (tx / tn, ty / tn)

    def bez(r, closed, nolr=None, tol=TOL_MM):
        pts = r[:-1] if closed and _K(r[0]) == _K(r[-1]) else list(r); n = len(pts)
        if n < 3:
            return [[x, y, 0, 0] for x, y in r]
        cor = [(not closed and (i == 0 or i == n - 1)) or _K(pts[i]) not in VT for i in range(n)]

        def h(i, j):                                       # the handle at point i toward j: along the point's tangent, a third of the segment
            tx, ty = VT[_K(pts[i])]; L = math.dist(pts[i], pts[j]) / 3
            cx, cy = pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]
            sg = 1 if cx * tx + cy * ty >= 0 else -1
            hx, hy = sg * tx * L, sg * ty * L
            cn = math.hypot(cx, cy)
            if cn > 1e-9:                                  # (the same in both objects that share the segment)
                perp = abs(hx * cy - hy * cx) / cn
                if perp > tol / 0.75:
                    hx, hy = hx * tol / 0.75 / perp, hy * tol / 0.75 / perp
            return [round(pts[i][0] + hx, 3), round(pts[i][1] + hy, 3)]

        cp = [cor[i] and (closed or 0 < i < n - 1) and _turn(pts[(i - 1) % n], pts[i], pts[(i + 1) % n]) >= 30 for i in range(n)]
        nl = [bool(nolr and i < len(nolr) and nolr[i][0]) for i in range(n)]
        nr = [bool(nolr and i < len(nolr) and nolr[i][1]) for i in range(n)]
        A = lambda j: [pts[j][0], pts[j][1], 4 if nl[j] else 0, (1 if cp[j] else 0) | (4 if nr[j] else 0)]
        out = [A(0)]
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            if cor[i] and cor[j]:
                out.append(A(j)); continue
            h1 = h(i, j) if not cor[i] else [pts[i][0], pts[i][1]]
            h2 = h(j, i) if not cor[j] else [pts[j][0], pts[j][1]]
            out += [h1 + [1, 0], h2 + [2, 0], A(j)]
        return out

    def straight(r, closed):
        """A polyline, its angles of 30° or more flagged as corner points."""
        pts = r[:-1] if closed and _K(r[0]) == _K(r[-1]) else list(r); n = len(pts)
        res = [[x, y, 0, 1 if (closed or 0 < i < n - 1) and n >= 3 and _turn(pts[(i - 1) % n], pts[i], pts[(i + 1) % n]) >= 30 else 0]
               for i, (x, y) in enumerate(pts)]
        return res + [list(res[0])] if closed else res

    n_c = 0
    for o in objects:
        if o["otp"] == 1 or o["sym"] in SKIP:
            o.pop("curve", None); continue
        if o["sym"] in NATURAL:
            tol = TOL_PATH_MM if o["sym"] in (S(505), S(506)) else TOL_MM
            o["bez"] = [bez(r, o["otp"] == 3 or _closed(r), o.get("nolr") if k == 0 else None, tol) for k, r in enumerate(_rings(o))]; n_c += 1
        elif o["otp"] == 2 or o["sym"] not in PLAIN:
            o["bez"] = [straight(r, o["otp"] == 3 or _closed(r)) for r in _rings(o)]
        o.pop("nolr", None); o.pop("curve", None)
    log("curved objects", n_c, "of", len(objects))


def rounded(objects):
    """Coordinates to the micron."""
    for o in objects:
        o["rings"] = [[[round(float(x), 3), round(float(y), 3)] for x, y in r] for r in o["rings"]]
