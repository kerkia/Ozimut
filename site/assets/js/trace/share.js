// Traces shared on an analysis (« Analyse club », « Analyse compétition »): what is stored and how it is laid on the map.
// - A shared trace keeps positions and times only — no heart rate, cadence or power — and only the part of the run on
//   the map's area (with 300 m of margin), from the first such point to the last: the drive, the warm-up far away and
//   the way home stay on the runner's device. Stored compactly: whole seconds and millionths of a degree, as deltas.
// - A course's georeference is an affine map from (longitude, latitude) to the image's pixels (fine over a map's few
//   kilometres); each trace's own frame (local metres) gets its transform from it.
// - The passes of a trace at the course's controls, in the course's order: each control's closest approach on the first
//   visit after the previous control; the start's departure (the last moment near the start before control 1) and the
//   finish's arrival after the last control: the pass that ends the race (`finishArrival`), else, every control
//   passed, the first moment near the finish where the runner stops with little left to run (`finishAfterAll`); else
//   no finish — the race runs to the trace's end.

import { fromPoints, finishArrival, finishAfterAll } from "./track.js";
import { toM } from "./geom.js";

/** The track's points back as latitude and longitude. */
function latLonAt(track, i) {
  return [track.lat0 - track.y[i] / track.ky, track.lon0 + track.x[i] / track.kx];
}

/** The part of the track on the map's area: [i0, i1], or null when it never comes on the map. */
export function cropToMap(track, geo, W, H, marginM = 300) {
  const fit = fitFromGeo(geo, track), m = marginM * fit.scale;
  let i0 = -1, i1 = -1;
  for (let i = 0; i < track.n; i++) {
    const px = fit.m11 * track.x[i] + fit.m12 * track.y[i] + fit.tx, py = fit.m21 * track.x[i] + fit.m22 * track.y[i] + fit.ty;
    if (px >= -m && py >= -m && px <= W + m && py <= H + m) { if (i0 < 0) i0 = i; i1 = i; }
  }
  return i0 < 0 || i1 - i0 < 10 ? null : [i0, i1];
}

/** The stored form of the track between two indices: { v, t0, dt, la, lo } (seconds, millionths of a degree, deltas). */
export function encodeTrace(track, i0 = 0, i1 = track.n - 1) {
  const dt = [], la = [], lo = [];
  let pt = 0, pla = 0, plo = 0, first = true;
  const t0 = Math.round(track.ms0 / 1000 + track.t[i0]);
  for (let i = i0; i <= i1; i++) {
    const t = Math.round(track.t[i] - track.t[i0]);
    if (!first && t <= pt) continue;                       // one point per second
    const [lat, lon] = latLonAt(track, i), ila = Math.round(lat * 1e6), ilo = Math.round(lon * 1e6);
    dt.push(first ? 0 : t - pt); la.push(first ? ila : ila - pla); lo.push(first ? ilo : ilo - plo);
    pt = t; pla = ila; plo = ilo; first = false;
  }
  return { v: 1, t0, dt, la, lo };
}

/** A stored trace as a track (null when malformed). */
export function decodeTrace(rec) {
  if (!rec || rec.v !== 1 || !Array.isArray(rec.dt) || rec.dt.length !== rec.la?.length || rec.dt.length !== rec.lo?.length) return null;
  const pts = [];
  let t = 0, la = 0, lo = 0;
  for (let i = 0; i < rec.dt.length; i++) {
    t += rec.dt[i]; la += rec.la[i]; lo += rec.lo[i];
    pts.push({ lat: la / 1e6, lon: lo / 1e6, ms: (rec.t0 + t) * 1000 });
  }
  try { return pts.length >= 2 ? fromPoints(pts) : null; } catch (e) { return null; }
}

/** The georeference (lon, lat) -> px of a transform in a track's frame (metres -> px). */
export function geoFromFit(fit, frame) {
  const { kx, ky, lon0, lat0 } = frame;
  return {
    a: fit.m11 * kx, b: -fit.m12 * ky, c: fit.tx - fit.m11 * kx * lon0 + fit.m12 * ky * lat0,
    d: fit.m21 * kx, e: -fit.m22 * ky, f: fit.ty - fit.m21 * kx * lon0 + fit.m22 * ky * lat0,
  };
}
/** The transform in a track's frame (metres -> px) of a georeference. */
export function fitFromGeo(geo, frame) {
  const { kx, ky, lon0, lat0 } = frame;
  const f = { kind: "affine", m11: geo.a / kx, m12: -geo.b / ky, tx: geo.a * lon0 + geo.b * lat0 + geo.c,
    m21: geo.d / kx, m22: -geo.e / ky, ty: geo.d * lon0 + geo.e * lat0 + geo.f, n: 0, rms: 0 };
  f.scale = Math.sqrt(Math.abs(f.m11 * f.m22 - f.m12 * f.m21));
  f.rotation = Math.atan2(f.m21, f.m11);
  return f;
}
/** A frame (local metres) around a point, for the georeferenced inputs that come without a trace. */
export function frameAt(lat, lon) {
  const R = 6371000;
  return { lat0: lat, lon0: lon, kx: (Math.PI / 180) * R * Math.cos((lat * Math.PI) / 180), ky: (Math.PI / 180) * R };
}
/** A georeference is usable: finite, not degenerate. */
export const validGeo = (g) => !!g && ["a", "b", "c", "d", "e", "f"].every((k) => Number.isFinite(g[k])) && Math.abs(g.a * g.e - g.b * g.d) > 1e-6;

/**
 * A score course's passes (owner, 2026-11-02, after RouteGadget: the controls in any order): each control's first visit
 * (within tol, its closest point) wherever it comes; the start's departure before the first control visited; the finish's
 * arrival after the last one. Trace seconds by the course's controls, null where not visited.
 */
export function scorePasses(track, fit, controls, tol = 25) {
  const n = track.n, out = new Array(controls.length).fill(null);
  const dist = (c) => { const [mx, my] = toM(fit, c.x, c.y), d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = Math.hypot(track.x[k] - mx, track.y[k] - my); return d; };
  let lastK = -1, firstT = Infinity;
  controls.forEach((c, j) => {
    if (c.kind !== "control") return;
    const d = dist(c);
    let k = 0;
    while (k < n && d[k] > tol) k++;
    if (k >= n) return;
    let best = k;
    while (k < n && d[k] <= 1.6 * tol) { if (d[k] < d[best]) best = k; k++; }
    out[j] = track.t[best]; lastK = Math.max(lastK, best); firstT = Math.min(firstT, track.t[best]);
  });
  const si = controls.findIndex((c) => c.kind === "start");
  if (si >= 0) {
    const d = dist(controls[si]);
    let last = -1;
    for (let k = 0; k < n && track.t[k] < firstT; k++) if (d[k] <= tol) last = k;
    if (last >= 0) out[si] = track.t[last];
  }
  const fi = controls.findIndex((c) => c.kind === "finish");
  if (fi >= 0) {
    const d = dist(controls[fi]), from = Math.max(0, lastK);
    let k = finishArrival(track, d, from, tol);
    if (k < 0) k = finishArrival(track, d, from, 1.6 * tol);
    if (k < 0) k = finishAfterAll(track, d, from, 1.6 * tol);
    if (k >= 0) out[fi] = track.t[k];
  }
  return out;
}

/**
 * Every visit of a track to each control, in any order (for finding the circuit a track runs: 2026-11-23): by the course's
 * controls, the list of trace seconds — one per stay within tol, at its closest point —, empty where never visited, null for
 * the start and finish. Also each control's place in the track's metres (`at`), to compare controls across circuits, and the
 * track's closest approach to it (`near`, metres).
 */
export function controlVisits(track, fit, controls, tol = 25) {
  const n = track.n;
  return controls.map((c) => {
    const [mx, my] = toM(fit, c.x, c.y);
    if (c.kind !== "control") return { at: [mx, my], t: null };
    const out = [];
    let best = -1, bd = Infinity, near = Infinity;
    for (let k = 0; k <= n; k++) {
      const d = k < n ? Math.hypot(track.x[k] - mx, track.y[k] - my) : Infinity;
      if (d < near) near = d;
      if (d <= tol) { if (d < bd) { bd = d; best = k; } }
      else if (best >= 0 && d > 1.6 * tol) { out.push(track.t[best]); best = -1; bd = Infinity; }
    }
    return { at: [mx, my], t: out, near };
  });
}

/** The most controls of a course passed in its order, any of each control's visits counting (a forgotten control, or one run
 *  past at another moment, no longer cuts the rest off as the first-visit chain does). */
export function inOrder(visits) {
  let states = [[-Infinity, 0]];                          // (time of the last control taken, controls taken), Pareto front
  for (const v of visits) {
    if (!v.t || !v.t.length) continue;
    const next = [...states];
    for (const [t0, k] of states) {
      const t1 = v.t.find((x) => x > t0);
      if (t1 != null) next.push([t1, k + 1]);
    }
    next.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    states = [];
    for (const s of next) if (!states.length || s[1] > states[states.length - 1][1]) states.push(s);
  }
  return states.reduce((m, s) => Math.max(m, s[1]), 0);
}
/** inOrder, the course also allowed to be run from any control on, then from the start up to it: loops taken in the other
 *  order (a butterfly's second wing first) still count as run in order. */
export function inOrderAnyStart(visits) {
  let best = inOrder(visits);
  for (let j = 1; j < visits.length; j++) if (visits[j].t?.length) best = Math.max(best, inOrder([...visits.slice(j), ...visits.slice(0, j)]));
  return best;
}

/**
 * The passes at a course's controls (px, in order: start, controls, finish), in trace seconds, null where not found.
 * tol: metres. A control's pass is the closest approach on the first visit (within tol, else 1.6 tol) after the
 * previous control's pass; the start's, the departure before control 1; the finish's, the arrival after the last one.
 * When the course's loops were run in another order (the course taken from one of its controls on, then from the start up to it,
 * passes more controls), that order is used: the start's departure is before the first control passed in time, the finish's
 * arrival after the last, and the legs not run as such are listed in the result's `cut`.
 */
export function coursePasses(track, fit, controls, tol = 25) {
  const n = track.n, out = new Array(controls.length).fill(null);
  const dist = (c) => { const [mx, my] = toM(fit, c.x, c.y), d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = Math.hypot(track.x[k] - mx, track.y[k] - my); return d; };
  const visit = (d, from, lim) => {                       // the first visit from `from`: its closest point
    let k = from;
    while (k < n && d[k] > lim) k++;
    if (k >= n) return -1;
    let best = k;
    while (k < n && d[k] <= 1.6 * lim) { if (d[k] < d[best]) best = k; k++; }
    return best;
  };
  // the controls, chained in an order: each one's first visit after the previous one's pass
  const D = new Map(), distOf = (j) => { if (!D.has(j)) D.set(j, dist(controls[j])); return D.get(j); };
  const chain = (order) => {
    const got = new Map();
    let from = 0;
    for (const j of order) {
      const d = distOf(j);
      let k = visit(d, from, tol);
      if (k < 0) k = visit(d, from, 1.6 * tol);
      if (k >= 0) { got.set(j, k); from = k; }
    }
    return got;
  };
  const ctl = controls.map((c, j) => (c.kind === "control" ? j : -1)).filter((j) => j >= 0);
  let got = chain(ctl), rotated = false;
  // the course's loops run in another order (2026-11-24: OPA's Marcel Sol ran E's second loop first; chained in the printed order,
  // his race began when he came back to the start, an hour in): the course from any control on, then from the start up to it,
  // when that passes more controls
  if (got.size < ctl.length) {
    for (let r = 1; r < ctl.length; r++) {
      const g = chain([...ctl.slice(r), ...ctl.slice(0, r)]);
      if (g.size > got.size) { got = g; rotated = true; }
    }
  }
  for (const [j, k] of got) out[j] = track.t[k];
  const from = got.size ? Math.max(...got.values()) : 0;  // the last control passed, in time
  const fi = controls.findIndex((c) => c.kind === "finish");
  if (fi >= 0) {                                          // the arrival: after the last control, the pass that ends the race
    const d = dist(controls[fi]);
    let k = finishArrival(track, d, from, tol);
    if (k < 0) k = finishArrival(track, d, from, 1.6 * tol);
    if (k < 0 && got.size === ctl.length) k = finishAfterAll(track, d, from, 1.6 * tol);
    if (k >= 0) out[fi] = track.t[k];
  }
  // the start: the departure, the last point near it before the first control passed (in time)
  const si = controls.findIndex((c) => c.kind === "start");
  if (si >= 0) {
    const firstPass = got.size ? track.t[Math.min(...got.values())] : out[fi] ?? null;
    const d = dist(controls[si]);
    let last = -1;
    for (let k = 0; k < n && (firstPass == null || track.t[k] < firstPass); k++) if (d[k] <= tol) last = k;
    if (last >= 0) out[si] = track.t[last];
  }
  // loops run in another order: the legs not run as such (their two controls not one after the other in time) have no time —
  // `cut`, the indices j of the legs j-1 -> j
  if (rotated) {
    const times = out.filter((v) => v != null).sort((a, b) => a - b);
    out.cut = new Set();
    for (let j = 1; j < out.length; j++) {
      const a = out[j - 1], b = out[j];
      if (a == null || b == null) continue;
      if (b < a || times.some((v) => v > a && v < b)) out.cut.add(j);
    }
  }
  return out;
}
