"""Contours every 2.5 m from the LiDAR's ground (ISSprOM: 2 or 2.5 m).

A town's ground holds kerbs, walls, embankments and the LiDAR's gaps: the ground is smoothed over 4 m, each line simplified and
rounded; a contour is kept whole or dropped whole — no loop under 600 m², no line under 40 m (the owner's mapper, 2026-11-12:
« parasite relief », « contours that stop in the middle of nowhere »). It runs through the buildings (the brown is printed
over their grey) and is cut only where it crosses a stairway (ISSprOM).

« Contour lines shall be drawn at right angles crossing streets »: the ground is made level across each carriageway before the
lines are traced — every cell of a street takes the height of the nearest point of its axis —, so a contour crosses a street
squarely by construction (the first generator bent each crossing afterwards: rectangular jogs)."""
import math

import numpy as np
import shapely
from scipy.ndimage import distance_transform_edt, gaussian_filter
from shapely.geometry import LineString, Polygon

from .env import R, S, lines, merge_lines, union

INTERVAL = 2.5


def spaced(pts, d, closed=False):
    """The points that define a line at least d apart (its ends kept): no wiggle for the curve to follow."""
    out = [pts[0]]
    for q in pts[1:-1]:
        if math.dist(q, out[-1]) >= d:
            out.append(q)
    if math.dist(pts[-1], out[-1]) < d * 0.5 and len(out) > 1 and not closed:
        out.pop()
    out.append(pts[-1])
    return np.array(out, float) if len(out) >= 2 else np.asarray(pts, float)


def chaikin(pts, n=2, closed=False):
    pts = np.asarray(pts, float)
    for _ in range(n):
        a, b = pts[:-1], pts[1:]
        q, r = 0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b
        mid = np.empty((len(q) * 2, 2)); mid[0::2] = q; mid[1::2] = r
        pts = np.vstack([mid, mid[:1]]) if closed else np.vstack([pts[:1], mid, pts[-1:]])
    return pts


def ground(env, s, t):
    """The ground smoothed, level across the streets."""
    sm = gaussian_filter(t.dtm, 8.0)
    axes = union([g for gs in s.carr_lines.values() for g in gs])
    if axes.is_empty or s.STREET.is_empty:
        return sm
    ax = env.mask(axes, all_touched=True)
    street = env.mask(s.STREET)
    _, (ri, ci) = distance_transform_edt(~ax, return_indices=True)
    flat = np.where(street, sm[ri, ci], sm)
    return gaussian_filter(flat, 1.5)                      # the step at the street's edge eased


def run(env, s, t, a, d):
    from skimage.measure import find_contours
    sm = ground(env, s, t)
    lo, hi = math.floor(sm.min() / INTERVAL) * INTERVAL, math.ceil(sm.max() / INTERVAL) * INTERVAL
    stair_a = union([g.buffer(sw / 2 + 0.3, cap_style="flat") for g, sw in a.steps_drawn])
    n = 0
    for lv in np.arange(lo, hi + 0.01, INTERVAL):
        index = abs((lv / INTERVAL) % 5) < 1e-6
        for c in find_contours(sm, lv):
            if len(c) < 6:
                continue
            closed = np.hypot(*(c[0] - c[-1])) < 1e-6
            xy = np.c_[env.X0 + (c[:, 1] + 0.5) * R, env.Y1 - (c[:, 0] + 0.5) * R]
            if closed and Polygon(xy).area < 600:
                continue
            l = LineString(chaikin(spaced(np.array(LineString(xy).simplify(0.8).coords), 4.0, closed), 3, closed))
            if (not closed and l.length < 40) or (closed and Polygon(l.coords).area < 600):
                continue
            cut = l.difference(stair_a) if not stair_a.is_empty else l
            for piece in lines(merge_lines(cut)):          # (a loop's difference splits it at its first point too: rejoined)
                if piece.length >= 3:
                    d.line(piece, S(102) if index else S(101), curve=True); n += 1
    env.log("contour pieces", n, f"{lo}-{hi} m")
