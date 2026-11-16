// Training maps (the advanced level; owner, 2026-11-05: corridors, windows, maps without paths, contours only). Two tools:
// - a course's map filter (model.mapHideFor, mapview.js): colours and symbols of an OCAD or Mapper map left out for that course;
// - a generated mask (layoutx.js's mask, its `gen`): white everywhere but a corridor along the course's legs and windows round
//   its controls. Its outline is the union of capsules (a leg ± half the corridor's width) and discs (a control ± the window's
//   radius), and of the map's logos (never hidden: owner, 2026-11-04), traced on a grid by marching squares and simplified; the
//   rings are filled even-odd with the mask's frame (draw.js), so an island the course loops round stays white. The mask follows
//   the course: model.syncDerived calls syncExercises after every change, which traces it again when the legs have moved.
// The other way round (owner, 2026-11-16: training map generators, after OCAD's recipes) — gen.mode "hide": the map stays, and
// white patches cover the surroundings of the controls (a disc of the window's radius: the last metres run without the map)
// and/or the middle of each leg (a band of the corridor's width over a share of its length: the direction kept by the compass);
// the same union of discs and capsules, filled instead of left open.

import * as M from "./model.js";

const MAX_CELLS = 3e6;                     // the grid's size at most (cells); its step at least 0.1 mm
const FAR = 1e9;

/** The metres of the ground in map mm. */
const mmOf = (ev, m) => (m * 1000) / (ev.map.scale || 10000);

/** What a generated mask is drawn from: legs [[a, b]] (with their bends), controls [[x, y]], in map mm. */
function shapesOf(ev, courseId, share = 0) {
  const cd = M.cdCourse(courseId), legs = [], pts = [];
  for (const id of M.ccIds(ev, cd)) {
    const c = ev.controls[ev.courseControls[id]?.control];
    if (c) pts.push([c.x, c.y]);
  }
  for (const { cc1, cc2 } of M.enumLegs(ev, cd)) {
    const c1 = ev.courseControls[cc1]?.control, c2 = ev.courseControls[cc2]?.control;
    if (!ev.controls[c1] || !ev.controls[c2]) continue;
    let p = M.legPoints(ev, c1, c2);
    // « hide »: the middle of the leg only, a share of its length
    if (share > 0 && share < 1) {
      const L = M.pathLength(p), a = (L * (1 - share)) / 2, b = (L * (1 + share)) / 2, mid = [M.pointAt(p, a)];
      let acc = 0;
      for (let i = 1; i < p.length; i++) { acc += M.dist(p[i - 1], p[i]); if (acc > a && acc < b) mid.push(p[i]); }
      mid.push(M.pointAt(p, b));
      p = mid;
    }
    for (let i = 1; i < p.length; i++) legs.push([p[i - 1], p[i]]);
  }
  return { legs, pts };
}

/** A signature of what the mask depends on: it is traced again only when it changes. */
export function exerciseSig(ev, gen) {
  const { legs, pts } = shapesOf(ev, gen.course, gen.mode === "hide" ? gen.share || 0.5 : 0), r = (v) => Math.round(v * 100);
  return [gen.mode || "", gen.share || "", gen.width, gen.window, ev.map.scale, legs.map(([a, b]) => [r(a[0]), r(a[1]), r(b[0]), r(b[1])].join(",")).join(";"),
    pts.map((p) => `${r(p[0])},${r(p[1])}`).join(";"), (gen.keep || []).map((b) => b.map(r).join(",")).join(";")].join("|");
}

/**
 * The rings of a course's corridor and windows (map mm): { rings, box } — rings to fill even-odd inside the mask's frame.
 * gen: { course, width (corridor's width, metres; 0 none), window (window's radius, metres; 0 none), keep ([[l, b, r, t]]:
 * areas always shown, the map's logos) }.
 */
export function exerciseRings(ev, gen) {
  const hide = gen.mode === "hide";
  const { legs, pts: all } = shapesOf(ev, gen.course, hide ? gen.share || 0.5 : 0);
  // « hide » leaves the start and the finish in sight: the patches are for the controls
  const pts = hide ? M.ccIds(ev, M.cdCourse(gen.course)).map((id) => ev.controls[ev.courseControls[id]?.control]).filter((c) => c?.kind === "normal").map((c) => [c.x, c.y]) : all;
  const score = M.isScore?.(ev, gen.course);
  const hw = !score && gen.width > 0 ? mmOf(ev, gen.width) / 2 : 0;
  // a score course has no legs: its windows, of the corridor's half width when no radius is given
  const rad = gen.window > 0 ? mmOf(ev, gen.window) : score && gen.width > 0 ? mmOf(ev, gen.width) / 2 : 0;
  const caps = hw > 0 ? legs : [], discs = rad > 0 ? pts : [], keep = hide ? [] : gen.keep || [];
  if (!caps.length && !discs.length) return { rings: [] };
  // the grid: the shapes' extent with a margin, its step so that it stays under MAX_CELLS
  let l = Infinity, b = Infinity, r = -Infinity, t = -Infinity;
  const grow = (x, y, m) => { l = Math.min(l, x - m); b = Math.min(b, y - m); r = Math.max(r, x + m); t = Math.max(t, y + m); };
  for (const [p, q] of caps) { grow(p[0], p[1], hw); grow(q[0], q[1], hw); }
  for (const p of discs) grow(p[0], p[1], rad);
  for (const k of keep) { grow(k[0], k[1], 0); grow(k[2], k[3], 0); }
  const step = Math.max(0.1, Math.sqrt(((r - l) * (t - b)) / MAX_CELLS));
  l -= 3 * step; b -= 3 * step; r += 3 * step; t += 3 * step;
  const nx = Math.ceil((r - l) / step) + 1, ny = Math.ceil((t - b) / step) + 1;
  const f = new Float32Array(nx * ny).fill(FAR);
  const X = (i) => l + i * step, Y = (j) => b + j * step;
  const span = (lo, hi, n, o) => [Math.max(0, Math.floor((lo - o) / step) - 1), Math.min(n - 1, Math.ceil((hi - o) / step) + 1)];
  // each shape lowers the field (its signed distance) round itself: < 0 inside the union
  for (const [p, q] of caps) {
    const [i0, i1] = span(Math.min(p[0], q[0]) - hw, Math.max(p[0], q[0]) + hw, nx, l);
    const [j0, j1] = span(Math.min(p[1], q[1]) - hw, Math.max(p[1], q[1]) + hw, ny, b);
    const dx = q[0] - p[0], dy = q[1] - p[1], L2 = dx * dx + dy * dy || 1e-12;
    for (let j = j0; j <= j1; j++) {
      const y = Y(j);
      for (let i = i0; i <= i1; i++) {
        const x = X(i), u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L2));
        const d = Math.hypot(x - p[0] - u * dx, y - p[1] - u * dy) - hw, k = j * nx + i;
        if (d < f[k]) f[k] = d;
      }
    }
  }
  for (const p of discs) {
    const [i0, i1] = span(p[0] - rad, p[0] + rad, nx, l), [j0, j1] = span(p[1] - rad, p[1] + rad, ny, b);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(X(i) - p[0], Y(j) - p[1]) - rad, k = j * nx + i;
      if (d < f[k]) f[k] = d;
    }
  }
  for (const [kl, kb, kr, kt] of keep) {
    const [i0, i1] = span(kl, kr, nx, l), [j0, j1] = span(kb, kt, ny, b);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = X(i), y = Y(j), d = Math.max(kl - x, x - kr, kb - y, y - kt), k = j * nx + i;
      if (d < f[k]) f[k] = d;
    }
  }
  return { rings: trace(f, nx, ny, X, Y, step), box: [l, b, r, t] };
}

/** The outlines of { f < 0 } on the grid (marching squares, the saddles by the cell's mean), simplified. */
function trace(f, nx, ny, X, Y, step) {
  const H0 = (nx - 1) * ny;                                   // edge ids: horizontal (i, j)-(i+1, j), then vertical (i, j)-(i, j+1)
  const hE = (i, j) => j * (nx - 1) + i, vE = (i, j) => H0 + j * nx + i;
  const adj = new Map();
  const link = (a, c) => { (adj.get(a) || adj.set(a, []).get(a)).push(c); (adj.get(c) || adj.set(c, []).get(c)).push(a); };
  const v = (i, j) => f[j * nx + i];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v(i, j), bb = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    const code = (a < 0 ? 1 : 0) | (bb < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const e0 = hE(i, j), e1 = vE(i + 1, j), e2 = hE(i, j + 1), e3 = vE(i, j), mid = (a + bb + c + d) / 4 < 0;
    switch (code) {
      case 1: case 14: link(e3, e0); break;
      case 2: case 13: link(e0, e1); break;
      case 3: case 12: link(e3, e1); break;
      case 4: case 11: link(e1, e2); break;
      case 6: case 9: link(e0, e2); break;
      case 7: case 8: link(e3, e2); break;
      case 5: if (mid) { link(e0, e1); link(e2, e3); } else { link(e3, e0); link(e1, e2); } break;
      case 10: if (mid) { link(e3, e0); link(e1, e2); } else { link(e0, e1); link(e2, e3); } break;
      default: break;
    }
  }
  const at = (e) => {
    if (e < H0) { const j = Math.floor(e / (nx - 1)), i = e % (nx - 1), p = v(i, j), q = v(i + 1, j); return [X(i) + step * (p / (p - q)), Y(j)]; }
    const k = e - H0, j = Math.floor(k / nx), i = k % nx, p = v(i, j), q = v(i, j + 1);
    return [X(i), Y(j) + step * (p / (p - q))];
  };
  const seen = new Set(), rings = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let prev = -1, cur = start;
    for (let g = 0; g < 1e7; g++) {
      seen.add(cur); ring.push(at(cur));
      const nb = adj.get(cur) || [];
      const next = nb[0] !== prev ? nb[0] : nb[1] ?? nb[0];
      if (next == null || next === start) break;
      if (seen.has(next)) break;
      prev = cur; cur = next;
    }
    if (ring.length >= 3) rings.push(simplify(ring, step * 0.4));
  }
  return rings.filter((r) => r.length >= 3);
}

/** Douglas-Peucker on a closed ring. */
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  // split at the point farthest from the first, then simplify both halves
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const half = (a) => {
    const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
    const stack = [[0, a.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const [x1, y1] = a[s], [x2, y2] = a[e], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
      let k = -1, md = tol;
      for (let i = s + 1; i < e; i++) { const d = Math.abs((a[i][0] - x1) * dy - (a[i][1] - y1) * dx) / L; if (d > md) { md = d; k = i; } }
      if (k > 0) { keep[k] = 1; stack.push([s, k], [k, e]); }
    }
    return a.filter((_, i) => keep[i]);
  };
  const r = (n) => Math.round(n * 1000) / 1000;
  const out = [...half(pts.slice(0, far + 1)), ...half([...pts.slice(far), pts[0]]).slice(1, -1)];
  return out.map(([x, y]) => [r(x), r(y)]);
}

/** The mask's frame: the map, a little beyond its edges. */
const frameOf = (ev) => { const w = ev.map.w || 210, h = ev.map.h || 297; return [[-2, h + 2], [w + 2, h + 2], [w + 2, -2], [-2, -2]]; };

/** Trace a generated mask again (its holes, its signature). */
function retrace(ev, sp) {
  const rings = exerciseRings(ev, sp.gen).rings;
  if (sp.gen.mode === "hide") {
    // the patches themselves are white: the first ring is the area, the others join it (even-odd: disjoint rings all fill)
    sp.pts = rings[0] || [[-9, -9], [-8, -9], [-8, -8]];
    sp.holes = rings.slice(1);
  } else { sp.holes = rings; sp.pts = frameOf(ev); }
  sp.gen.sig = exerciseSig(ev, sp.gen);
}

/**
 * Make (or change) a course's corridor/window mask: shown on that course only. gen: { course, width, window, keep }.
 * Returns the special's id.
 */
export function setExercise(ev, gen) {
  let id = Number(Object.keys(ev.specials).find((k) => ev.specials[k].kind === "mask" && ev.specials[k].gen?.course === gen.course)) || 0;
  if (!id) {
    id = M.addSpecial(ev, "mask", frameOf(ev), { gen: { ...gen } });
    M.setDisplayedCourses(ev, id, [{ course: gen.course, part: -1 }]);
  } else ev.specials[id].gen = { ...ev.specials[id].gen, ...gen };
  retrace(ev, ev.specials[id]);
  return id;
}
/** The course's generated mask, or null. */
export const exerciseOf = (ev, courseId) => Object.values(ev.specials).find((s) => s.kind === "mask" && s.gen?.course === courseId) || null;
/** Remove a course's generated mask. */
export function clearExercise(ev, courseId) {
  for (const [id, s] of Object.entries(ev.specials)) if (s.kind === "mask" && s.gen?.course === courseId) delete ev.specials[id];
}

/** After every change (model.syncDerived): a generated mask follows its course; its course gone, it goes too. */
export function syncExercises(ev) {
  for (const [id, sp] of Object.entries(ev.specials || {})) {
    if (sp.kind !== "mask" || !sp.gen) continue;
    if (!ev.courses[sp.gen.course]) { delete ev.specials[id]; continue; }
    if (sp.gen.sig !== exerciseSig(ev, sp.gen)) retrace(ev, sp);
  }
}

/** The map's logos (OCAD's layout images) in the event's mm, always left visible by a generated mask. */
export function logosOf(map) {
  if (map?.kind !== "vector") return [];
  const out = [];
  for (const d of map.vmap.symdefs) {
    if (d.kind !== "image" || d.layer !== "layout") continue;
    for (const s of d.symbols) if (s.visible !== false && s.bytes && s.bbox) out.push([s.bbox[0] - map.ox, s.bbox[1] - map.oy, s.bbox[2] - map.ox, s.bbox[3] - map.oy]);
  }
  return out;
}
