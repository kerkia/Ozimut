// The route choices' worker (trace/routechoice.js): the map read once, then the legs asked one by one, off the page's thread.
// Messages { id, op, ... } answered { id, ok, ... }, and while the map is read { id, progress } (0-1): init (the image's bytes,
// its size, the metres of a pixel step, the map's kind) or layers (a vector map's, drawn by trace/vectorroutes.js), dem (the
// ground's heights), settings (the map read again when its kind changes: the thickness test's width), leg (two map points),
// decision (the leg's decision map), line (a runner's route), picture (the terrain as read), controls (the course's controls:
// the overprint near them is theirs); for a tour through many controls (the Tracer's): forbid (the setter's out-of-bounds areas
// and boundaries, kept over a new reading), tour (the costs from each control to its nearest ones), path (one leg's best route).

import { classify, cells, cellSize, costs, context, legSearch, lineRoute, matchRoute, picture, decisionPicture, releaseAround, DEFAULTS,
  freeCells, cellOf, costsFrom, bestPath, forbidCells, courseInk, sprintObjects, sprintLayers, SPRINT_SCALE } from "./routechoice.js";
import { heightAt } from "./terrain.js";

let G = null, h = null, em = null, mpc = 1, cs = 1, W = 0, H = 0, settings = { ...DEFAULTS }, X = null;
let image = null, mppRead = 1, kindRead = "forest", facts = null, ctrlPts = [], ctrlR = 0;
let sprintRead = null;                               // a sprint photo's reading and its objects (sprintObjects): its layers made
                                                     // again when the course's controls come (its lines are no walls)
let forbidden = null, tourCells = [];                // the setter's objects (map px of the image read), a tour's controls (cells)
const scratch = {};                                  // costsFrom's arrays, kept between its calls
const decisions = new Map();                         // the last legs' decision maps, by their points
/** The overprint released round the course's controls (its circles, numbers): 75 m on a forest map, less on a sprint map. */
const released = () => releaseAround(G, em, ctrlPts, kindRead === "sprint" ? 75 * SPRINT_SCALE : 75);
/** The course's circles and legs and a pixel of blend, slowed (an image's only: a vector map's course is not drawn). */
const inked = () => (image ? courseInk(G, ctrlPts, ctrlR, 1, kindRead === "sprint" ? mppRead : 0) : null);

/** The grid's size and the metres of a pixel step (J's columns): the cell size (routechoice `cellSize`: 1.5 m, 0.8 m on a
 *  sprint map's sharp image), 4 million cells at most. */
let Jlast = null;
function start(w, hh, J, kind = "forest") {
  W = w; H = hh; Jlast = J;
  const mpp = Math.sqrt(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]));
  cs = cellSize(mpp, kind);
  while ((W / cs) * (H / cs) > 4e6) cs++;
  em = [[J[0][0] * cs, J[1][0] * cs], [J[0][1] * cs, J[1][1] * cs]];
  mpc = Math.min(Math.hypot(...em[0]), Math.hypot(...em[1]));
  h = null;
  return mpp;
}
function finish(px) {
  const hOld = h;
  G = cells(px, W, H, cs);
  if (forbidden) forbidCells(G, forbidden.areas, forbidden.lines);
  G.release = released();
  G.inkBand = inked();
  h = hOld && hOld.length === G.nx * G.ny ? hOld : null;
  rebuild();
  const counts = new Array(13).fill(0), paths = [0, 0, 0, 0];
  for (const c of G.cls) counts[c]++;
  for (const v of G.path) paths[v]++;
  facts = { cs, mpc, nx: G.nx, ny: G.ny, lw: px.lw, ms: px.ms, counts, paths, north: px.northLines?.length || 0, chains: px.lines?.chains || 0, kind: kindRead };
  return facts;
}
function rebuild() { decisions.clear(); if (G) X = context(G, costs(G, settings, mpc), h, em, settings); }
function read(id) {
  const P = classify(image, W, H, mppRead, { map: kindRead }, (f) => postMessage({ id, progress: f }));
  sprintRead = null;
  // a sprint photo read as an OCAD map is (routechoice.js 1b): its lines as objects, given to the engine as a vector map's
  if (kindRead === "sprint") { sprintRead = { P, O: sprintObjects(P, W, H, mppRead, image) }; return finish(sprintPx()); }
  return finish(P);
}
const sprintPx = () => sprintLayers(sprintRead.O, sprintRead.P, ctrlPts, ctrlR);

const ops = {
  init({ id, rgba, w, h: hh, J, map }) {
    kindRead = map === "sprint" ? "sprint" : "forest";
    mppRead = start(w, hh, J, kindRead);
    image = new Uint8ClampedArray(rgba);
    return read(id);
  },
  /** A vector map's layers, drawn on the page (trace/vectorroutes.js): no colours to read. */
  layers({ area, path, blue, block, hand, cross, slow, speed, pspeed, w, h: hh, J }) {
    start(w, hh, J);
    image = null;
    const t0 = Date.now();
    return { ...finish({ area: new Uint8Array(area), path: new Uint8Array(path), blue: new Uint8Array(blue), block: new Uint8Array(block), hand: new Uint8Array(hand), cross: new Uint8Array(cross), slow: new Uint8Array(slow),
      ...(speed ? { speed: new Uint8Array(speed) } : {}), ...(pspeed ? { pspeed: new Uint8Array(pspeed) } : {}), lw: 0, ms: 0 }), ms: Date.now() - t0, vector: true };
  },
  dem({ grid }) {
    if (!G) return {};
    h = new Float32Array(G.nx * G.ny);
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) h[j * G.nx + i] = heightAt(grid, W, H, (i + 0.5) * cs, (j + 0.5) * cs);
    rebuild();
    return {};
  },
  settings({ id, s }) {
    settings = { ...DEFAULTS, ...s, speeds: { ...DEFAULTS.speeds, ...(s.speeds || {}) } };
    const kind = settings.map === "sprint" ? "sprint" : "forest";
    if (image && kind !== kindRead) { kindRead = kind; start(W, H, Jlast, kind); return { reread: true, facts: read(id) }; }
    rebuild();
    return {};
  },
  leg({ a, b }) {
    if (!X) return { routes: null };
    const r = legSearch(X, a, b);
    decisions.set(`${a}|${b}`, r.dec);
    while (decisions.size > 12) decisions.delete(decisions.keys().next().value);
    return { routes: r.routes };
  },
  decision({ a, b }) {
    if (!X) return { rgba: null };
    let dec = decisions.get(`${a}|${b}`);
    if (!dec) { dec = legSearch(X, a, b).dec; decisions.set(`${a}|${b}`, dec); }
    if (!dec) return { rgba: null };
    return { rgba: decisionPicture(dec, settings.extra ?? DEFAULTS.extra), i0: dec.i0, j0: dec.j0, rw: dec.rw, rh: dec.rh, cs };
  },
  line({ pts }) { return { route: X ? lineRoute(X, pts) : null }; },
  match({ a, b, pts, tol, routes }) { return { route: X ? matchRoute(X, a, b, pts, tol, routes) : null }; },
  picture() { return { rgba: picture(X), nx: G.nx, ny: G.ny, cs }; },
  /** The setter's out-of-bounds areas and boundaries (map px), closed on the cells now and after any new reading. */
  forbid({ areas, lines }) {
    forbidden = { areas: areas || [], lines: lines || [] };
    if (G) { forbidCells(G, forbidden.areas, forbidden.lines); rebuild(); }
    return {};
  },
  /** The costs and times between controls (map px): from each, a search stopped once its k nearest (as the crow flies) are
   *  reached. Flat arrays n × n, Infinity where not reached. */
  tour({ id, pts, k }) {
    if (!X) return { cost: null };
    const n = pts.length, cost = new Float64Array(n * n).fill(Infinity), time = new Float64Array(n * n).fill(Infinity);
    tourCells = pts.map((p) => cellOf(X, p));
    const undo = freeCells(X, tourCells), ppm = cs / mpc;
    try {
      for (let i = 0; i < n; i++) {
        const d = pts.map((p, j) => [Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) / ppm, j]).filter(([, j]) => j !== i).sort((u, v) => u[0] - v[0]);
        const want = d.slice(0, k).map(([, j]) => j), far = d.length ? d[Math.min(k, d.length) - 1][0] : 0;
        const r = costsFrom(X, tourCells[i], tourCells, want, Math.max(900, 12 * far), scratch);
        r.forEach(([c, t], j) => { cost[i * n + j] = c; time[i * n + j] = t; });
        cost[i * n + i] = 0; time[i * n + i] = 0;
        postMessage({ id, progress: (i + 1) / n });
      }
    } finally { undo(); }
    return { cost, time };
  },
  /** One leg's best route (map px), the tour's controls passable as in « tour ». */
  path({ a, b }) {
    if (!X) return { route: null };
    const undo = freeCells(X, tourCells.length ? tourCells : [cellOf(X, a), cellOf(X, b)]);
    try { return { route: bestPath(X, a, b) }; } finally { undo(); }
  },
  controls({ pts, r }) {
    ctrlPts = pts || []; ctrlR = r || 0;
    if (sprintRead && image) { finish(sprintPx()); return {}; }
    if (G) { G.release = released(); G.inkBand = inked(); rebuild(); }
    return {};
  },
};

self.onmessage = (e) => {
  const m = e.data;
  try {
    const out = ops[m.op](m);
    postMessage({ id: m.id, ok: true, ...out }, out.rgba ? [out.rgba.buffer] : []);
  } catch (err) {
    postMessage({ id: m.id, ok: false, error: String(err?.stack || err) });
  }
};
