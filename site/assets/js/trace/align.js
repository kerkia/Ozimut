// Laying the trace on the map without split times: the similarity (rotation, scale, translation) that makes the
// trace run through the controls read on the map.
// RANSAC: two of the trace's corners (Douglas-Peucker vertices) matched to two controls give a similarity; the
// controls are brought back to the trace's metres and looked up in a distance field of the trace (a chamfer grid):
// the hypothesis with the most controls within 20 m wins, after the best forty are refined by ICP (each control to
// its nearest trace point, least squares, eight rounds). The scale is bounded by the circle's radius (2 to 3.5 mm on
// a map at 1:3000 to 1:15000), the rotation by ± 30° about each way up a photo may be: north at the top, or a quarter,
// a half or three quarters of a turn from it (a map photographed sideways; 2026-11-17 — a box « carte orientée au nord »
// before, which the calibration never waited for).
// Five controls at least must lie on the trace: two are placed there by construction, and three or four of four points
// — the letters of a title read as controls — fit somewhere along any trace.
// visitOrder: once the geometry is known, the controls' passing times (the closest approach), their visiting order,
// the start's departure and the finish's arrival.

import { toM, fitSimilarity, fitAffine, similarityFrom2, simplify, distanceField, spatialHash } from "./geom.js";
import { finishArrival } from "./track.js";

const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** pts: [{ x, y, kind }] in image px, unordered. `min`: the points that must lie on the trace (5 for points read on
 *  the map; 3 for points a person placed). Returns { fit, inliers, rms, rotationDeg, pxPerM } or null. */
export function alignTrack(track, pts, { rStar = null, tol = 20, min = 5 } = {}) {
  const n = track.n;
  if (n < 10 || pts.length < min) return null;
  let V = simplify(track.x, track.y, n, 12);
  if (V.length > 130) {                              // the sharpest corners
    const turn = (k) => { const i = V[k], a = V[k - 1], b = V[k + 1];
      return Math.abs(angleDiff(Math.atan2(track.y[i] - track.y[a], track.x[i] - track.x[a]), Math.atan2(track.y[b] - track.y[i], track.x[b] - track.x[i]))); };
    const kept = V.slice(1, -1).map((i, k) => [turn(k + 1), i]).sort((a, b) => b[0] - a[0]).slice(0, 128).map((x) => x[1]).sort((a, b) => a - b);
    V = [V[0], ...kept, V[V.length - 1]];
  }
  const D = distanceField(track.x, track.y, n, 2.5);
  const Q = pts.map((p) => [p.x, p.y]);
  let sLo, sHi;
  if (rStar) { sLo = rStar / 60; sHi = rStar / 5; }
  else {
    const ext = (A, k) => Math.max(...A.map((p) => p[k])) - Math.min(...A.map((p) => p[k]));
    const diagQ = Math.hypot(ext(Q, 0), ext(Q, 1));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const i of V) { x0 = Math.min(x0, track.x[i]); x1 = Math.max(x1, track.x[i]); y0 = Math.min(y0, track.y[i]); y1 = Math.max(y1, track.y[i]); }
    const s0 = diagQ / Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    sLo = s0 / 6; sHi = s0 * 6;
  }
  const rotMax = (30 * Math.PI) / 180;
  const K = 40, tops = [[], [], [], []];
  const consider = (top, inl, sum, h) => {
    if (top.length === K && (inl < top[K - 1].inl || (inl === top[K - 1].inl && sum >= top[K - 1].sum))) return;
    let k = top.length;
    while (k > 0 && (top[k - 1].inl < inl || (top[k - 1].inl === inl && top[k - 1].sum > sum))) k--;
    top.splice(k, 0, { inl, sum, h });
    if (top.length > K) top.pop();
  };
  for (let ii = 0; ii < V.length; ii++) for (let jj = ii + 1; jj < V.length; jj++) {
    const i = V[ii], j = V[jj], px0 = track.x[i], py0 = track.y[i], dpx = track.x[j] - px0, dpy = track.y[j] - py0, Lp = Math.hypot(dpx, dpy);
    if (Lp < 25) continue;
    const angP = Math.atan2(dpy, dpx);
    for (let a = 0; a < Q.length; a++) for (let b = 0; b < Q.length; b++) {
      if (a === b) continue;
      const dqx = Q[b][0] - Q[a][0], dqy = Q[b][1] - Q[a][1], sc = Math.hypot(dqx, dqy) / Lp;
      if (sc < sLo || sc > sHi) continue;
      const rot = angleDiff(angP, Math.atan2(dqy, dqx)), turn = Math.round(rot / (Math.PI / 2));
      if (Math.abs(rot - (turn * Math.PI) / 2) > rotMax) continue;
      const c = Math.cos(rot) / sc, s = Math.sin(rot) / sc;        // the inverse: m = R(-rot)(q - q_a)/sc + p_i
      let inl = 0, sum = 0;
      for (let k = 0; k < Q.length; k++) {
        const wx = Q[k][0] - Q[a][0], wy = Q[k][1] - Q[a][1];
        const d = D.lookup(c * wx + s * wy + px0, -s * wx + c * wy + py0);
        if (d <= tol) { inl++; sum += d; }
      }
      if (inl >= 3) consider(tops[(turn + 4) % 4], inl, sum, [i, j, a, b]);
    }
  }
  const hash = spatialHash(track.x, track.y, n, tol * 1.5);
  const turned = [];
  for (const top of tops) {
    let mine = null;
    for (const { h } of top) {
      let f = similarityFrom2([track.x[h[0]], track.y[h[0]]], [track.x[h[1]], track.y[h[1]]], Q[h[2]], Q[h[3]]);
      if (!f) continue;
      let res = null;
      for (let it = 0; it < 8; it++) {
        const S = [], T = [];
        for (const q of Q) { const [mx, my] = toM(f, q[0], q[1]); const k = hash.nearest(mx, my); if (k >= 0) { S.push([track.x[k], track.y[k]]); T.push(q); } }
        if (S.length < 2) break;
        const g = fitSimilarity(S, T);
        if (!g) break;
        f = g;
        let inl = 0;
        for (const q of Q) { const [mx, my] = toM(f, q[0], q[1]); const k = hash.nearest(mx, my); if (k >= 0 && hash.dist(mx, my, k) <= tol) inl++; }
        res = { f, inl, rms: g.rms };
      }
      if (res && (!mine || res.inl > mine.inl || (res.inl === mine.inl && res.rms < mine.rms))) mine = res;
    }
    turned.push(mine);
  }
  // which way up: a wrong one, laid at a large scale, passes most controls too — within 20 m of a trace that then
  // covers the map — but loosely (8 to 12 m from it, against 2 to 6 for the right one, on five photos). Of the ways
  // up that pass 80 % of the most controls passed, the closest fit; the upright one if it is about as close
  const most = Math.max(0, ...turned.map((m) => (m ? m.inl : 0))), loose = (m) => m.rms / m.f.scale;
  let best = null;
  for (const m of turned) if (m && m.inl >= 0.8 * most && (!best || loose(m) < loose(best))) best = m;
  if (best && turned[0] && turned[0].inl >= 0.8 * most && loose(turned[0]) <= 1.25 * loose(best)) best = turned[0];
  if (!best || best.inl < Math.max(min, Math.ceil(0.5 * pts.length))) return null;
  // a photographed or scanned map is slightly skewed: with enough controls, an affine fit absorbs it
  if (best.inl >= 6) {
    const S = [], T = [];
    for (const q of Q) { const [mx, my] = toM(best.f, q[0], q[1]); const k = hash.nearest(mx, my); if (k >= 0 && hash.dist(mx, my, k) <= tol) { S.push([track.x[k], track.y[k]]); T.push(q); } }
    const g = S.length >= 6 ? fitAffine(S, T) : null;
    if (g) {
      let inl = 0;
      for (const q of Q) { const [mx, my] = toM(g, q[0], q[1]); const k = hash.nearest(mx, my); if (k >= 0 && hash.dist(mx, my, k) <= tol) inl++; }
      if (inl >= best.inl && g.rms <= best.rms) best = { f: g, inl, rms: g.rms };
    }
  }
  return { fit: best.f, inliers: best.inl, rms: best.rms, rotationDeg: (best.f.rotation * 180) / Math.PI, pxPerM: best.f.scale };
}

/**
 * The passes of the trace at each point, once the geometry is known: for every point, the local minima of its
 * distance along the trace (within 1.5 tol), each with its time; the controls' visiting order (their closest pass);
 * the start's departure (the last pass before the first control, left when the trace leaves tol) and the finish's
 * arrival (after the last control found, the pass that ends the race: `finishArrival`). pts: [{ x, y, kind }].
 * `leg(a, b)` (course.js's, image points): the share of the way between two symbols inked as a printed leg. A control
 * passed twice — run past on an earlier leg, then visited (the Fougères photo's 8, passed between 4 and 5: 2026-10-31)
 * — takes the pass that puts it, in time, next to the controls the legs join it to.
 */
export function visitOrder(track, fit, pts, tol = 20, { leg = null, ordered = false } = {}) {
  if (ordered) return passesInOrder(track, fit, pts, tol);
  const n = track.n, { passes, inlier, cost } = passesOf(track, fit, pts, tol);
  const cands = pts.map((p, i) => i).filter((i) => pts[i].kind === "control" && inlier(i))
    .map((i) => ({ i, list: passes[i].out.filter((p) => p.d <= 1.5 * tol) }));
  const pick = cands.map(({ list }) => list.reduce((a, p, j) => (cost(p) < cost(list[a]) ? j : a), 0));
  if (leg && cands.some((c) => c.list.length > 1)) {
    // the passes chosen together: the most printed legs between controls consecutive in time (the start before the
    // first, the finish after the last), then the least cost; one control's pass changed at a time while it gains
    const si0 = pts.findIndex((p) => p.kind === "start"), fi0 = pts.findIndex((p) => p.kind === "finish"), memo = new Map();
    const linked = (a, b) => {
      if (a < 0 || b < 0) return 0;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!memo.has(key)) memo.set(key, leg([pts[a].x, pts[a].y], [pts[b].x, pts[b].y]) >= 0.6 ? 1 : 0);
      return memo.get(key);
    };
    const value = (choice) => {
      const seq = cands.map((c, j) => [c.list[choice[j]].t, c.i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      let v = seq.length ? linked(si0, seq[0]) + linked(seq[seq.length - 1], fi0) : 0;
      for (let j = 1; j < seq.length; j++) v += linked(seq[j - 1], seq[j]);
      return v - 1e-4 * cands.reduce((s, c, j) => s + cost(c.list[choice[j]]), 0);
    };
    let cur = value(pick);
    for (let round = 0, better = true; better && round < 10; round++) {
      better = false;
      cands.forEach((c, j) => {
        for (let m = 0; m < c.list.length; m++) {
          if (m === pick[j]) continue;
          const was = pick[j]; pick[j] = m;
          const v = value(pick);
          if (v > cur + 1e-9) { cur = v; better = true; } else pick[j] = was;
        }
      });
    }
  }
  const controls = cands.map((c, j) => { const p = c.list[pick[j]]; return { i: c.i, t: p.t, k: p.k, d: p.d }; }).sort((a, b) => a.t - b.t);
  const firstT = controls.length ? controls[0].t : Infinity, lastT = controls.length ? controls[controls.length - 1].t : -Infinity;
  let startT = null, finishT = null;
  const si = pts.findIndex((p) => p.kind === "start"), fi = pts.findIndex((p) => p.kind === "finish");
  if (si >= 0) {
    const before = passes[si].out.filter((p) => p.d <= 1.5 * tol && p.t < firstT);
    if (before.length) {
      let k = before[before.length - 1].k;
      while (k + 1 < n && passes[si].d[k + 1] <= 1.5 * tol && track.t[k + 1] < firstT) k++;      // the departure
      startT = track.t[k];
    }
  }
  if (fi >= 0) {
    // the controls found may be the first few only: a pass by the finish after them is the arrival only if it ends the race
    let k0 = 0;
    while (k0 < n && track.t[k0] < lastT) k0++;
    const k = finishArrival(track, passes[fi].d, k0, 1.5 * tol);
    if (k >= 0) finishT = track.t[k];
  }
  const pass = new Map(controls.map((c) => [c.i, c.t]));
  if (startT != null) pass.set(si, startT);
  if (finishT != null) pass.set(fi, finishT);
  return { order: controls.map((c) => c.i), pass, startT, finishT, inliers: pts.map((p, i) => i).filter(inlier) };
}

/** Each point's passes: the local minima of its distance along the trace within 1.5 tol (one per 20 s), and the cost of
 *  a pass — its distance less a bonus for the heading change around it (± 10 s): a runner punching turns away, a
 *  passer-by does not. */
function passesOf(track, fit, pts, tol, reach = 1.5) {
  const n = track.n;
  const passes = pts.map((p) => {
    const [mx, my] = toM(fit, p.x, p.y), d = new Float32Array(n);
    for (let k = 0; k < n; k++) d[k] = Math.hypot(track.x[k] - mx, track.y[k] - my);
    const out = [];
    for (let k = 0; k < n; k++) {
      if (d[k] > reach * tol) continue;
      if ((k === 0 || d[k] < d[k - 1]) && (k === n - 1 || d[k] <= d[k + 1])) {
        const last = out[out.length - 1];
        if (last && track.t[k] - last.t < 20) { if (d[k] < last.d) { last.k = k; last.d = d[k]; last.t = track.t[k]; } }
        else out.push({ k, d: d[k], t: track.t[k] });
      }
    }
    return { d, out };
  });
  const inlier = (i) => passes[i].out.some((p) => p.d <= 1.5 * tol);           // a hand-placed point on a photo is rough
  const turnAt = (k) => {
    const a = Math.max(0, k - 10), b = Math.min(n - 1, k + 10);
    if (a === k || b === k) return 0;
    const h1 = Math.atan2(track.y[k] - track.y[a], track.x[k] - track.x[a]), h2 = Math.atan2(track.y[b] - track.y[k], track.x[b] - track.x[k]);
    let d = Math.abs(h2 - h1); if (d > Math.PI) d = 2 * Math.PI - d;
    return (d * 180) / Math.PI;
  };
  const cost = (p) => p.d - 0.15 * Math.min(120, turnAt(p.k));
  return { passes, inlier, cost };
}

/**
 * The passes of a course read in its order on the map (course.js `order`: start, controls, finish): each control takes
 * the pass that keeps the times rising along the course — the most controls passed, then the least cost — so that a
 * control run past on an earlier leg keeps its real visit (2026-11-01). The trace times the course; it does not order it.
 * Returns visitOrder's shape: `order` the controls passed, in the course's order; `missed` the others.
 */
export function passesInOrder(track, fit, pts, tol = 20) {
  const n = track.n, { passes, inlier, cost } = passesOf(track, fit, pts, tol, 2.5);
  const idx = pts.map((p, i) => i).filter((i) => pts[i].kind === "control");
  // within 1.5 tol as elsewhere; a control with none, within 2.5 (a circle read off its centre on a photo: the photo's
  // 15, 7 px off; its neighbours in the course keep its time in place)
  const cand = idx.map((i) => { const near = passes[i].out.filter((p) => p.d <= 1.5 * tol); return near.length ? near : passes[i].out; });
  // best[j][m]: the best chain whose last control passed is j, at its pass m — [count, -cost], and where it came from
  const best = cand.map((list) => list.map(() => null));
  for (let j = 0; j < idx.length; j++) for (let m = 0; m < cand[j].length; m++) {
    const p = cand[j][m];
    let b = { count: 1, cost: cost(p), from: null };
    for (let i = 0; i < j; i++) for (let l = 0; l < cand[i].length; l++) {
      const q = best[i][l];
      if (!q || cand[i][l].t >= p.t) continue;
      const c = { count: q.count + 1, cost: q.cost + cost(p), from: [i, l] };
      if (c.count > b.count || (c.count === b.count && c.cost < b.cost)) b = c;
    }
    best[j][m] = b;
  }
  let top = null;
  best.forEach((row, j) => row.forEach((b, m) => { if (b && (!top || b.count > top.b.count || (b.count === top.b.count && b.cost < top.b.cost))) top = { j, m, b }; }));
  const chosen = new Map();
  for (let at = top && [top.j, top.m]; at; at = best[at[0]][at[1]].from) chosen.set(idx[at[0]], cand[at[0]][at[1]]);
  const order = idx.filter((i) => chosen.has(i)), firstT = order.length ? chosen.get(order[0]).t : Infinity;
  const lastT = order.length ? chosen.get(order[order.length - 1]).t : -Infinity;
  let startT = null, finishT = null;
  const si = pts.findIndex((p) => p.kind === "start"), fi = pts.findIndex((p) => p.kind === "finish");
  if (si >= 0) {
    const before = passes[si].out.filter((p) => p.d <= 1.5 * tol && p.t < firstT);
    if (before.length) {
      let k = before[before.length - 1].k;
      while (k + 1 < n && passes[si].d[k + 1] <= 1.5 * tol && track.t[k + 1] < firstT) k++;
      startT = track.t[k];
    }
  }
  if (fi >= 0) {
    let k0 = 0;
    while (k0 < n && track.t[k0] < lastT) k0++;
    const k = finishArrival(track, passes[fi].d, k0, 1.5 * tol);
    if (k >= 0) finishT = track.t[k];
  }
  const pass = new Map(order.map((i) => [i, chosen.get(i).t]));
  if (startT != null) pass.set(si, startT);
  if (finishT != null) pass.set(fi, finishT);
  return { order, pass, startT, finishT, inliers: pts.map((p, i) => i).filter(inlier), missed: idx.filter((i) => !chosen.has(i)),
    count: order.length, cost: top ? top.b.cost : 0 };
}
