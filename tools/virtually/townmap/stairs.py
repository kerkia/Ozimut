"""Stairways at their width on the ground, which may vary (the owner, 2026-11-12: « a stairway can have a width that varies, and
it must not be on the street »): cut where it reaches a street, then read every metre between the buildings (or the ground not to
be entered) on either side — a stairway squeezed between them is centred in that passage and as wide as it, else the width OSM or
BD TOPO gives (2 m without) —, the widths rounded to 532.1-532.6 (2, 3, 4, 5, 6, 8 m at 1:4000), drawn in pieces of one width."""
import math

import numpy as np
import shapely
from scipy.ndimage import gaussian_filter
from shapely.geometry import LineString

from .env import lines, polys

STAIR_W = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0]
STAIR_MM = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]


def pieces(s):
    """s.steps [(line, width)] → the pieces [(line, one of STAIR_W)]."""
    sides = list(s.buildings) + polys(s.PRIVATE)
    tree = shapely.STRtree(sides) if sides else None

    def side_dist(p, n):
        """Distance from p along n to the nearest building or private ground, within 6 m (None beyond)."""
        ray = LineString([(p.x, p.y), (p.x + n[0] * 6, p.y + n[1] * 6)])
        best = None
        for i in (tree.query(ray) if tree is not None else []):
            x = sides[i].intersection(ray)
            if not x.is_empty:
                d = p.distance(x)
                best = d if best is None else min(best, d)
        return best

    out = []
    for g, w0 in s.steps:
        for line in lines(g.difference(s.STREET)):
            if line.length < 1.5:
                continue
            L = line.length; ds = np.arange(0, L + 1e-6, 1.0) if L >= 2 else np.array([0, L])
            shs, ws, base = [], [], []
            for d in ds:
                p = line.interpolate(d); q0, q1 = line.interpolate(max(0, d - 0.5)), line.interpolate(min(L, d + 0.5))
                tx, ty = q1.x - q0.x, q1.y - q0.y; tn = math.hypot(tx, ty) or 1; n = (-ty / tn, tx / tn)
                dl, dr = side_dist(p, n), side_dist(p, (-n[0], -n[1]))
                if dl is not None and dr is not None and dl + dr < 9:
                    shs.append((dl - dr) / 2); ws.append(max(1.5, dl + dr - 0.4))   # to the passage's middle, as wide as it
                else:
                    shs.append(0.0); ws.append(w0)
                base.append((p.x, p.y, n))
            # the shift smoothed along the stairway and capped (its top zigzagged where one side changed)
            shs = np.clip(gaussian_filter(np.array(shs, float), 2.0, mode="nearest"), -3, 3) if len(shs) > 2 else np.array(shs, float)
            pts = [(x + n[0] * sh, y + n[1] * sh) for (x, y, n), sh in zip(base, shs)]
            ws = np.array([float(np.median(ws[max(0, i - 2):i + 3])) for i in range(len(ws))])
            k = [min(range(len(STAIR_W)), key=lambda j: abs(STAIR_W[j] - min(w, 8.0))) for w in ws]
            runs = []                                      # runs of one width, a run under 5 m joined to the previous one
            for i, kk in enumerate(k):
                if runs and (runs[-1][0] == kk or i - runs[-1][1] < 5):
                    runs[-1][2] = i
                else:
                    runs.append([kk, i, i])
            for kk, i0, i1 in runs:
                seg = pts[max(0, i0 - 1 if i0 else 0):i1 + 1]
                if len(seg) >= 2:
                    out.append((LineString(seg), STAIR_W[kk]))
    return out


def symbol_sub(width):
    """532.<k> for a width on the ground (m)."""
    wmm = width / 4.0
    return min(range(len(STAIR_MM)), key=lambda i: abs(STAIR_MM[i] - wmm)) + 1
