"""A building's roof for town_3d.py: its planes fitted to the LiDAR's building points (class 6), its nodes' heights, its mesh
(eaves, creases) and its chimneys. Kept apart from town_3d.py so that a roof can be made and measured alone
(the work folder's roof checks)."""
import math
from concurrent.futures import ThreadPoolExecutor
import os

import numpy as np
from scipy.spatial import cKDTree, Delaunay
import shapely

NT = os.cpu_count() or 4
POOL = ThreadPoolExecutor(NT)


def _inliers(a, b, c, Qx, Qy, Qz, tol, j0, j1, blk=1024):
    """Each plane's inliers (|z − (a x + b y + c)| < tol, the residual computed as written, so exactly) among Q[j0:j1], by blocks
    that stay in the cache."""
    cnt = np.zeros(len(a), np.int64)
    A, B, C = a[:, None], b[:, None], c[:, None]
    for j in range(j0, j1, blk):
        e = min(j1, j + blk)
        r = A * Qx[None, j:e]
        r += B * Qy[None, j:e]
        r += C
        np.subtract(Qz[None, j:e], r, out=r)
        np.abs(r, out=r)
        cnt += np.count_nonzero(r < tol, axis=1)
    return cnt


def ransac_planes(P, rng, max_planes=8, tol=0.15):
    """Planes z = a x + b y + c over roof points P (n×3): [(a, b, c, inlier indices)]."""
    planes = []; left = np.arange(len(P)); n0 = len(P)
    for _ in range(max_planes):
        if len(left) < max(20, 0.05 * n0):
            break
        Q = P[left]
        t = rng.integers(0, len(Q), (300, 3))
        p1, p2, p3 = Q[t[:, 0]], Q[t[:, 1]], Q[t[:, 2]]
        nrm = np.cross(p2 - p1, p3 - p1)
        ok = np.abs(nrm[:, 2]) > 1e-6
        a = -nrm[:, 0] / np.where(ok, nrm[:, 2], 1); b = -nrm[:, 1] / np.where(ok, nrm[:, 2], 1)
        c = p1[:, 2] - a * p1[:, 0] - b * p1[:, 1]
        ok &= np.hypot(a, b) < 1.25                                # roofs steeper than 51° are walls
        Qx, Qy, Qz = np.ascontiguousarray(Q[:, 0]), np.ascontiguousarray(Q[:, 1]), np.ascontiguousarray(Q[:, 2])
        cnt = np.zeros(len(a), np.int64); act = np.nonzero(ok)[0]   # a hypothesis not ok counts 0
        if len(act):
            aa, bb, cc = a[act], b[act], c[act]
            if len(Q) < 3000:
                cnt[act] = _inliers(aa, bb, cc, Qx, Qy, Qz, tol, 0, len(Q))
            else:
                cuts = np.linspace(0, len(Q), NT + 1).astype(int)
                cnt[act] = sum(POOL.map(lambda i: _inliers(aa, bb, cc, Qx, Qy, Qz, tol, cuts[i], cuts[i + 1]), range(NT)))
        k = int(np.argmax(cnt))
        if cnt[k] < max(18, 0.06 * n0):
            break
        inl = np.abs(Qz - (a[k] * Qx + b[k] * Qy + c[k])) < tol
        X = np.c_[Q[inl, 0], Q[inl, 1], np.ones(inl.sum())]
        sol = np.linalg.lstsq(X, Q[inl, 2], rcond=None)[0]
        inl = np.abs(Q[:, 2] - (sol[0] * Q[:, 0] + sol[1] * Q[:, 1] + sol[2])) < tol
        planes.append((*sol, left[inl]))
        left = left[~inl]
    return planes


# the rules a roof's heights keep to (metres)
UNDER_R, UNDER_RISE, UNDER_SLOPE = 0.6, 1.0, 1.25   # a point with another standing over it (within 0.6 m, higher by 1 m + 1.25 × the
                                                     # distance: steeper than any roof) is a façade's, a balcony's, an eave's underside
LOCAL_OFF = 0.8                                      # a node whose plane is that far from its points' median takes the median
LOW_MARGIN = 1.0                                     # no node below the roof's lowest points (2nd percentile) by more than that
EAVE = 0.35                                          # the eaves beyond the walls
EAVE_DROP = 0.45                                     # an eave no lower than the wall's top by more than that (0.35 m at 51°)
LOW_ROOF = 2.0                                       # no roof point under that above its own ground (a yard, a terrace, a car)
NEIGHBOUR = 0.5                                      # no point within that of another building's outline (its eaves, its wall)
NEIGHBOUR_FAR = 1.5                                  # nor, within that, above the building's own roof (its points farther) by 1 m
SPIKE = 1.5                                          # a wall top's node off its two neighbours' mean by that, they agreeing: a spike


def top_surface(P, r=UNDER_R, rise=UNDER_RISE, slope=UNDER_SLOPE):
    """The points the LiDAR saw from above: a mask leaving out each point another point stands over (within r, higher by more than
    rise + slope × their distance — steeper than any roof). BD TOPO's outlines take in a band of the façades, whose points (and
    a balcony's, an eave's underside) are class 6 too: a roof fitted to them hangs down the walls."""
    if len(P) < 2:
        return np.ones(len(P), bool)
    pr = cKDTree(P[:, :2]).query_pairs(r, output_type="ndarray")
    under = np.zeros(len(P), bool)
    if len(pr):
        i, j = pr[:, 0], pr[:, 1]
        d = np.hypot(P[i, 0] - P[j, 0], P[i, 1] - P[j, 1]); dz = P[j, 2] - P[i, 2]; lim = rise + slope * d
        under[i[dz > lim]] = True; under[j[-dz > lim]] = True
    return ~under


def despike_rings(z, rings):
    """A wall top's lone spikes (a node off its two neighbours' mean by SPIKE, they within a third of that of each other) brought
    to that mean, ring by ring of the outline (z: the outline's heights, in the rings' order). A gable's apex rises at most
    1.25 × 0.9 m over its neighbours: kept."""
    z = z.copy(); off = 0; n_ = 0
    for n in (len(r) for r in rings):
        if n >= 3:
            zz = z[off:off + n]; zp, zn = np.roll(zz, 1), np.roll(zz, -1); m = (zp + zn) / 2
            s = (np.abs(zz - m) > SPIKE) & (np.abs(zp - zn) < np.abs(zz - m) / 3)
            zz[s] = m[s]; n_ += int(s.sum())
        off += n
    return z, n_


def despike_nodes(nodes, z, first):
    """The roof's lone spikes inside (nodes[first:]): a node off the median of its neighbours (within 1.35 m: the lattice's 8,
    the outline's nearby) by SPIKE while they agree (their quartiles within a third of that) is brought to that median — a stray
    point's median, a chimney's foot; a step between two levels (its neighbours on both) and a ridge (its neighbours alike on
    either side) are kept. Twice (a spike of two nodes)."""
    z = z.copy(); n_ = 0
    if len(nodes) - first < 1 or len(nodes) < 5:
        return z, 0
    d, ii = cKDTree(nodes).query(nodes[first:], k=min(13, len(nodes)), distance_upper_bound=1.35)
    d, ii = d[:, 1:], ii[:, 1:]                                    # itself apart
    ok = np.isfinite(d); ii = np.where(ok, ii, 0); enough = ok.sum(1) >= 4
    c = ok.sum(1)

    def quant(S, f):                                               # rows sorted, missing last: numpy's linear quantile of each
        x = np.maximum(c - 1, 0) * f; lo = np.floor(x).astype(int); hi = np.minimum(lo + 1, np.maximum(c - 1, 0))
        a_ = np.take_along_axis(S, lo[:, None], 1)[:, 0]; b_ = np.take_along_axis(S, hi[:, None], 1)[:, 0]
        return a_ + (b_ - a_) * (x - lo)
    for _ in range(2):
        S = np.sort(np.where(ok, z[ii], np.inf), axis=1)
        q1, med, q3 = quant(S, 0.25), quant(S, 0.5), quant(S, 0.75)
        dev = np.abs(z[first:] - med)
        s_ = enough & (dev > SPIKE) & (q3 - q1 < dev / 3)
        if not s_.any():
            break
        zf = z[first:]; zf[s_] = med[s_]; n_ += int(s_.sum())
    return z, n_


class Neighbours:
    """Every building's outline, to find a building's neighbours: their eaves overhang its outline, their walls' points fall
    inside it (BD TOPO's outlines are a metre off here and there), and a narrow building between two tall ones took their roofs.
    With the roof points (pts, n×3, and their tree), each neighbour's own height: the 90th percentile of its points 0.5 m in."""

    def __init__(self, polys, pts=None, tree=None):
        self.polys = list(polys); self.tree = shapely.STRtree(self.polys); self.pts, self.ptree = pts, tree; self.tops = {}

    def top(self, i):
        if self.pts is None:
            return None
        if i not in self.tops:
            q = self.polys[i]; c = q.centroid; inner = q.buffer(-0.5); t = None
            if not inner.is_empty:
                j = self.ptree.query_ball_point([c.x, c.y], math.sqrt(q.area) * 1.2 + 10)
                Q = self.pts[j] if j else np.zeros((0, 3))
                Q = Q[shapely.contains_xy(inner, Q[:, 0], Q[:, 1])] if len(Q) else Q
                t = float(np.percentile(Q[:, 2], 90)) if len(Q) >= 10 else None
            self.tops[i] = t
        return self.tops[i]

    def around(self, poly, reach=1.0):
        """The outlines near poly (within reach), not poly itself (an outline covering half of it is taken for it), each as
        (outline, its height or None)."""
        idx = [i for i in self.tree.query(poly.buffer(reach))
               if self.polys[i].intersection(poly).area < 0.5 * min(self.polys[i].area, poly.area)]
        return [(self.polys[i], self.top(i)) for i in idx]


def roof(poly, P, top_g, z_flat, rng, stats, gP=None, others=None):
    """A building's roof over its outline `poly` (world x, z) from its class-6 points P (n×3: x, z, height), the ground's median
    along it top_g, the height to give a building without points z_flat, the ground under each point gP, the outlines of the
    buildings around it others (Neighbours.around). Returns a dict: nodes (the outline densified, then a lattice inside) and
    their heights nz, nb the outline's count, bnd its rings, the mesh (rnodes, rz, tri: its triangles), flat, chimneys
    [[x, z, y, h, sx, sz]] (three at most), or None when no mesh can be made.

    The rules: only the points seen from above count (top_surface), none within LOW_ROOF of its ground nor within NEIGHBOUR of
    another building (nor within NEIGHBOUR_FAR above its own roof); each node takes the lowest of its candidate planes (those
    of its 8 nearest fitted points within 3 m: a gable's or a hip's ridge exact), its points' median where that plane is
    LOCAL_OFF away; nothing below the roof's lowest points by LOW_MARGIN; lone spikes smoothed (despike_rings, despike_nodes);
    the eaves follow the plane of the wall's node beside them, never above that wall's top nor more than EAVE_DROP below it; a
    crease (where two planes meet along a triangle's edge) only where it lies on the roof's envelope; a building left with a
    few points flat at their median."""
    edge = shapely.segmentize(poly, 0.9)
    bnd = [np.array(edge.exterior.coords)[:-1]] + [np.array(r.coords)[:-1] for r in edge.interiors]
    x0, z0, x1, z1 = poly.bounds
    xs, zs = np.meshgrid(np.arange(x0 + 0.45, x1, 0.9), np.arange(z0 + 0.45, z1, 0.9))
    xs, zs = xs.ravel(), zs.ravel()
    inner = poly.buffer(-0.3)
    keep = shapely.contains_xy(inner, xs, zs) if not inner.is_empty else np.zeros(len(xs), bool)
    nodes = np.vstack(bnd + [np.c_[xs[keep], zs[keep]]])
    nb = sum(len(b) for b in bnd)
    if len(P) and gP is not None:
        hi = P[:, 2] > np.asarray(gP) + LOW_ROOF
        stats["low pts"] = stats.get("low pts", 0) + int((~hi).sum())
        P = P[hi]
    if len(P) and others:
        near = shapely.union_all([q.buffer(NEIGHBOUR, quad_segs=2) for q, _ in others])
        mine = ~shapely.contains_xy(near, P[:, 0], P[:, 1])
        # a taller neighbour's eaves reach further in (BD TOPO's outlines a metre off): the band along it holds nothing higher
        # than the building's own roof away from it (its 90th percentile: a ridge is within 1 m of it; a building all within
        # that band: than the median of its points) that the neighbour's own roof reaches (up to its height + 0.5 m: no
        # taller part of the building itself beside a lower neighbour is taken away)
        bands = [(shapely.contains_xy(q.buffer(NEIGHBOUR_FAR, quad_segs=2), P[:, 0], P[:, 1]), t) for q, t in others]
        band = np.any([m for m, _ in bands], axis=0)
        own = mine & ~band
        if own.sum() >= 15 or mine.sum() >= 15:
            ref = float(np.percentile(P[own, 2], 90)) if own.sum() >= 15 else float(np.median(P[mine, 2]))
            for m, t in bands:
                if t is not None and t > ref + 1.0:
                    mine &= ~(m & (P[:, 2] > ref + 1.0) & (P[:, 2] < t + 0.5))
        stats["neighbours' pts"] = stats.get("neighbours' pts", 0) + int((~mine).sum())
        P = P[mine]
    if len(P):
        seen = top_surface(P)
        stats["under"] = stats.get("under", 0) + int((~seen).sum())
        P = P[seen]
    planes = []
    if len(P) >= 15:
        planes = ransac_planes(P.astype(np.float64), rng)
        stats["planes"] += len(planes); stats["fitted"] += 1
    arg = np.full(len(nodes), -1)
    if len(P) >= 15:
        zmax = float(P[:, 2].max()) + 0.2
        zmin = max(top_g + 2.2, float(np.percentile(P[:, 2], 2)) - LOW_MARGIN)
        pt = cKDTree(P[:, :2])
    if planes:
        pa = np.array([[p[0], p[1], p[2]] for p in planes])
        lab = np.full(len(P), -1)
        for k, pl in enumerate(planes):
            lab[pl[3]] = k
        Lm = lab >= 0
        kt = cKDTree(P[Lm, :2]); plab = lab[Lm]

        def cands(q):
            """Each point's candidate planes, as a mask (points × planes): those of its 8 nearest labelled points within 3 m
            (else the nearest's)."""
            d, ii = kt.query(q, k=min(8, int(Lm.sum())))
            d, ii = np.atleast_2d(d), np.atleast_2d(ii)
            ok = d < 3.0
            ok[~ok.any(1), 0] = True
            m = np.zeros((len(d), len(pa)), bool)
            m[np.broadcast_to(np.arange(len(d))[:, None], ok.shape)[ok], plab[ii[ok]]] = True
            return m

        def lowest(q, cs):
            zp = np.where(cs, pa[:, 0][None, :] * q[:, 0:1] + pa[:, 1][None, :] * q[:, 1:2] + pa[:, 2][None, :], np.inf)
            arg = zp.argmin(1)
            return zp[np.arange(len(zp)), arg], arg

        def envelope(q, cs):
            """The roof's height at points q: the lowest of their candidate planes, the points' own median where that is
            LOCAL_OFF off (a step between two levels, a dormer); within the roof's points' range."""
            z, arg = lowest(q, cs)
            dd, jj = pt.query(q, k=min(8, len(P)))
            zloc = np.median(P[np.atleast_2d(jj), 2], axis=1)
            bad = np.abs(z - zloc) > LOCAL_OFF
            z[bad] = zloc[bad]; arg[bad] = -1
            return np.clip(z, zmin, zmax), arg

        cand = cands(nodes)
        nz, arg = envelope(nodes, cand)
    elif len(P) >= 15:
        dd, jj = pt.query(nodes, k=min(5, len(P)))
        nz = np.clip(np.median(P[np.atleast_2d(jj), 2], axis=1), zmin, zmax)
    else:
        stats["flat"] += 1                                         # a few points: flat at their median; none: BD TOPO's height
        nz = np.full(len(nodes), max(float(np.median(P[:, 2])) if len(P) >= 3 else z_flat, top_g + 2.5))
    if len(P) >= 15:
        z0_ = nz.copy()
        nz[:nb], n_ = despike_rings(nz[:nb], bnd)
        nz, n2 = despike_nodes(nodes, nz, nb); n_ += n2
        arg[nz != z0_] = -1                                        # a node smoothed is on no plane (no eave or crease from it)
        stats["despiked"] = stats.get("despiked", 0) + n_
    flat = (nz.max() - nz.min()) < 0.6
    rnodes, rz, rpoly = nodes, nz, poly
    chim = []
    if planes and not flat:
        rpoly = poly.buffer(EAVE, join_style="mitre", mitre_limit=2.0)
        ob = shapely.segmentize(rpoly.exterior, 0.9); ob = np.array(ob.coords)[:-1]
        # each eave point follows the plane of the wall's node nearest to it (that node's height if it took its points' median),
        # between that wall's top and EAVE_DROP below it
        near = cKDTree(nodes[:nb]).query(ob)[1]
        ka = arg[near]; wt = nz[near]
        oz = np.where(ka >= 0, (pa[np.maximum(ka, 0)] * np.c_[ob, np.ones(len(ob))]).sum(1), wt)
        oz = np.clip(oz, wt - EAVE_DROP, wt)
        rnodes = np.vstack([ob, nodes]); rz = np.concatenate([oz, nz])
        ra = np.concatenate([np.full(len(ob), -1), arg])
        try:
            t0 = Delaunay(rnodes).simplices
            # the triangles' edges, each once, in the order a set of them gives (the creases' order makes the mesh's); only those
            # between two different planes can hold a crease
            ed = np.sort(t0[:, [0, 1, 1, 2, 0, 2]].reshape(-1, 3, 2), axis=2).reshape(-1, 2)
            E = np.array(list(set(map(tuple, ed.tolist()))), np.int64).reshape(-1, 2)
            ke = ra[E]
            E = E[(ke[:, 0] >= 0) & (ke[:, 1] >= 0) & (ke[:, 0] != ke[:, 1])]
            nx = 0
            if len(E):
                ka_, kb_ = ra[E[:, 0]], ra[E[:, 1]]
                p0, p1 = rnodes[E[:, 0]], rnodes[E[:, 1]]
                dp = pa[ka_] - pa[kb_]
                f0 = (dp * np.c_[p0, np.ones(len(p0))]).sum(1); f1 = (dp * np.c_[p1, np.ones(len(p1))]).sum(1)
                ok = np.nonzero(f0 * f1 < 0)[0]
                t_ = f0[ok] / (f0[ok] - f1[ok])
                q = p0[ok] + (p1[ok] - p0[ok]) * t_[:, None]
                zq = (pa[ka_[ok]] * np.c_[q, np.ones(len(q))]).sum(1)
                # on the roof's envelope: no candidate plane of the crease's own place, nor of either end, lower there
                o = len(ob)
                cs = cands(q) | cand[E[ok, 0] - o] | cand[E[ok, 1] - o]
                zl, _ = lowest(q, cs)
                on = zl > zq - 0.05
                if on.any():
                    rnodes = np.vstack([rnodes, q[on]])
                    rz = np.concatenate([rz, np.clip(zq[on], zmin, zmax)])
                nx = int(on.sum())
            stats["creases"] = stats.get("creases", 0) + nx
        except Exception:
            rnodes, rz, rpoly = nodes, nz, poly
        # chimneys: the points standing 0.9-3.5 m above their roof in a tight group
        # (against the planes alone: a chimney's own points are the median round it, its foot's points being under it)
        res = P[:, 2] - np.clip(lowest(P[:, :2].astype(np.float64), cands(P[:, :2]))[0], zmin, zmax)
        up = np.nonzero((res > 0.9) & (res < 3.5))[0]
        if len(up) >= 4:
            ut = cKDTree(P[up, :2]); seen_ = set()
            nbr = ut.query_ball_point(P[up, :2], 0.7, return_sorted=False)   # each point's neighbours, as one query each gives them
            for s0 in range(len(up)):
                if s0 in seen_:
                    continue
                grp, stack = [], [s0]
                while stack:
                    q_ = stack.pop()
                    if q_ in seen_:
                        continue
                    seen_.add(q_); grp.append(q_); stack += nbr[q_]
                if len(grp) < 5:
                    continue
                G = P[up[grp]]
                ext_ = G[:, :2].max(0) - G[:, :2].min(0)
                if ext_.max() > 1.4:                                   # a dormer or a skylight is wider
                    continue
                cxy = G[:, :2].mean(0); top = float(G[:, 2].max())
                base_z = float(np.clip(lowest(cxy[None].astype(np.float64), cands(cxy[None]))[0][0], zmin, zmax))
                if not 0.9 < top - base_z < 3.5:                       # its foot's roof is not the points' (a box down a wall)
                    continue
                chim.append([round(float(cxy[0]), 2), round(float(cxy[1]), 2), round(base_z - 0.3, 2), round(top - base_z + 0.3, 2),
                             round(float(max(0.45, ext_[0])), 2), round(float(max(0.45, ext_[1])), 2)])
            chim = sorted(chim, key=lambda c_: -c_[3])[:3]               # three a building at most
    try:
        tri = Delaunay(rnodes).simplices
    except Exception:
        return None
    cen = rnodes[tri].mean(axis=1)
    tri = tri[shapely.contains_xy(rpoly, cen[:, 0], cen[:, 1])]
    if not len(tri):
        return None
    return {"nodes": nodes, "nz": nz, "nb": nb, "bnd": bnd, "rnodes": rnodes, "rz": rz, "tri": tri, "flat": flat, "chimneys": chim,
            "planes": planes}
