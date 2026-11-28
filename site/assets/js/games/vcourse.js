// Pixel's courses set in the browser (owner, 2026-11-12: « courses set in the browser » for the invented terrain): the rules of
// tools/virtually/course.py — FFCO's colour levels Bleu … Violet long, handrails for the easy ones, distinct features, route
// choices on the long ones, no dog-leg, no legs crossing — on a package's arrays. Deterministic (a seeded generator, a fixed
// number of tries, no clock, no trigonometry): one seed gives everyone the same courses, which the « Carte du jour » needs.

import { prng } from "./vgen.js";

export const LEVELS = [
  { id: "blue", n: 8, km: 2.2, leg: [120, 360], site: 15, line: [35, 90], reward: "easy" },
  { id: "yellow", n: 10, km: 3.0, leg: [150, 420], site: 40, line: [80, 160], reward: "easy" },
  { id: "orange_md", n: 12, km: 3.4, leg: [140, 420], site: null, line: null, reward: "features" },
  { id: "orange_ld", n: 10, km: 5.0, leg: [280, 800], site: null, line: null, reward: "choice" },
  { id: "violet_md", n: 15, km: 4.0, leg: [140, 450], site: null, line: null, reward: "hard" },
  { id: "violet_ld", n: 13, km: 7.0, leg: [300, 1150], site: null, line: null, reward: "choice" },
];
// an invented forest's paths are sparser than a real forest's: the Bleu's legs may run a little farther from them (measured on the
// five terrain types, 2026-11-12: 35 / 90 m found no Bleu on three of them, 45 / 110 m on all)
export const GEN_LEVELS = LEVELS.map((L) => (L.id === "blue" ? { ...L, line: [45, 110] } : L));
// the last control and the finish (owner, 2026-11-26), one pair a map: the finish `fin` m from the last control, every course's start
// within `fromStart` m of the finish; tools/virtually/course.py has the same numbers
export const LAST = { fromStart: 350, fin: [60, 150], code: 100 };
// The « compétition de la semaine »'s level sets (owner, 2026-11-28; docs/pixel/competitions.md §5): three courses « a » (the
// longest and hardest), « b », « c » (a level easier), the fields the six levels above have plus these, read only when present
// (so the six levels set exactly the courses they set before):
// - `climb`: the climb's share of the length the course should keep under (else CLIMB by the level's id);
// - `long: [m, k]`: at least k legs of m metres or more (straight), else the course is not kept;
// - `cross`: a leg may cross an earlier leg (at 45° or more, away from its controls): a long course crosses the map several times;
// - `turn`: a reward for changing direction at each control (× (1 − cos of the turn) ÷ 2): a middle distance's legs zigzag;
// - `judge`: the best courses run on the ground (timer below, cells of 4 m): each leg of `long[0]` m or more scores for a real route
//   choice — the best route, then the best one kept 25-40 m away from it, the second within 8 / 15 / 25 % of the first;
// - `min`: the course's target time at the game's ×1 (minutes, the timer's): the best courses ranked closer to it.
// Their legs' straight lines and features are judged as the six levels' are (reward "choice", "hard", "features").
export const WEEK_LEVELS = {
  // long distance on a forest of 1 600 m: few controls, a few very long legs crossing the map, real route choices
  ld: [
    { id: "a", n: 11, km: 8.0, leg: [200, 1500], site: null, line: null, reward: "choice", climb: 0.05, long: [900, 3], cross: true, judge: true, min: 70 },
    { id: "b", n: 10, km: 5.6, leg: [200, 1150], site: null, line: null, reward: "choice", climb: 0.05, long: [800, 2], cross: true, judge: true, min: 50 },
    { id: "c", n: 9, km: 3.6, leg: [220, 750], site: null, line: null, reward: "choice", climb: 0.04, min: 35 },
  ],
  // middle distance on a forest of 1 200 m: many short legs, sites away from the handrails, changes of direction
  md: [
    { id: "a", n: 18, km: 4.0, leg: [80, 330], site: null, line: null, reward: "hard", climb: 0.05, turn: 1.2, min: 30 },
    { id: "b", n: 14, km: 3.0, leg: [80, 330], site: null, line: null, reward: "hard", climb: 0.05, turn: 1.0, min: 23 },
    { id: "c", n: 11, km: 2.2, leg: [90, 330], site: null, line: null, reward: "features", climb: 0.04, turn: 0.6, min: 17 },
  ],
};
// how far a week's level's km may move to meet its target time (setCourses)
export const KM_RANGE = [0.7, 1.35];
/** A terrain's pace (seconds a metre in a straight line, by the router T) on up to n legs of lo-hi m between the points XY drawn by
 *  a generator of the seed; 0 when none could be run. */
export function paceOf(T, XY, seed, lo, hi, n = 30) {
  const rnd = prng(seed * 100 + 77);
  let tt = 0, dd = 0;
  for (let k = 0, i = 0; k < n && i < n * 40 && XY.length > 1; i++) {
    const a = XY[Math.floor(rnd() * XY.length)], b = XY[Math.floor(rnd() * XY.length)], dx = a[0] - b[0], dz = a[1] - b[1], d = Math.sqrt(dx * dx + dz * dz);
    if (d < lo || d > hi) continue;
    const t = T(a, b); if (!(t < Infinity)) continue;
    tt += t; dd += d; k++;
  }
  return dd ? tt / dd : 0;
}
// the game's speed (games/virtually.js RUN): m/s on flat open ground, a good club runner at ×1
export const RUN = 3.7;

/**
 * A shortest-time router on the package's ground, the game's own model (games/virtually.js move): RUN × the class's speed × the
 * slope's factor (up 1 ÷ (1 + 7 × grade), down beyond 12 % 1 ÷ (1 + 2.5 × (− grade − 0.12))). Cells of `step` m (a cell's time a
 * metre is the mean over its 1 m cells that can be run; more than half that cannot be run: closed), 8 neighbours, a diagonal only
 * past two open sides, A*. route(a, b, { block, path, cap }) → seconds (Infinity: no way), or { t, cells } with `path`; `block`
 * a Uint8Array of closed cells (nx × nz). Deterministic (+ − × ÷ only).
 */
export function timer(pkg, step = 2) {
  const { W, H, h, cls, speed: SP } = pkg, s = step;
  const nx = Math.ceil(W / s), nz = Math.ceil(H / s), N = nx * nz;
  const tpm = new Float32Array(N), hc = new Float32Array(N);
  let fast = 0; for (const v of SP) if (v > fast) fast = v;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let n = 0, bad = 0, sum = 0, hs = 0;
    for (let z = j * s; z < Math.min(H, j * s + s); z++) for (let x = i * s; x < Math.min(W, i * s + s); x++) {
      const q = z * W + x, v = SP[cls[q]]; n++; hs += h[q];
      if (v < 0.05) bad++; else sum += 1 / v;
    }
    const c = j * nx + i; hc[c] = hs / n; tpm[c] = bad * 2 > n ? 0 : sum / (n - bad) / RUN;
  }
  const g = new Float64Array(N), seen = new Int32Array(N), shut = new Int32Array(N), par = new Int32Array(N);
  let cap4 = Math.max(1024, N), heapA = new Int32Array(cap4), heapK = new Float64Array(cap4), stamp = 0;
  const hk = s / (RUN * fast);
  // the neighbours: offsets in x and z, the step's length in cells; a diagonal only past its two sides (SA, SB: their indices)
  const OX = [-1, 1, 0, 0, -1, 1, -1, 1], OZ = [0, 0, -1, 1, -1, -1, 1, 1], OD = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
  const SA = [0, 0, 0, 0, 0, 1, 0, 1], SB = [0, 0, 0, 0, 2, 2, 3, 3], ok = new Uint8Array(8);
  const cellOf = (p) => Math.min(nz - 1, Math.max(0, Math.floor(p[1] / s))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(p[0] / s)));
  return (a, b, { block = null, path = false, cap = Infinity } = {}) => {
    const s0 = cellOf(a), t0 = cellOf(b), tx = t0 % nx, tz = (t0 - tx) / nx;
    if (!(tpm[s0] > 0) || !(tpm[t0] > 0)) return path ? { t: Infinity, cells: [] } : Infinity;
    stamp++;
    let n = 0;
    const push = (q, k) => {
      if (n >= cap4) { cap4 *= 2; const A = new Int32Array(cap4), K = new Float64Array(cap4); A.set(heapA); K.set(heapK); heapA = A; heapK = K; }
      let i = n++; while (i) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapA[i] = heapA[p]; heapK[i] = heapK[p]; i = p; } heapA[i] = q; heapK[i] = k; };
    const hd = (x, z) => { const dx = x > tx ? x - tx : tx - x, dz = z > tz ? z - tz : tz - z; return (dx > dz ? dx + 0.41421356 * dz : dz + 0.41421356 * dx) * hk; };
    seen[s0] = stamp; g[s0] = 0; par[s0] = -1; push(s0, hd(s0 % nx, (s0 - (s0 % nx)) / nx));
    let found = Infinity;
    while (n) {
      const q = heapA[0], lq = heapA[--n], lk = heapK[n]; let i = 0;   // the heap's smallest
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mk = lk; if (l < n && heapK[l] < mk) { m = l; mk = heapK[l]; } if (r < n && heapK[r] < mk) m = r; if (m < 0) break; heapA[i] = heapA[m]; heapK[i] = heapK[m]; i = m; }
      heapA[i] = lq; heapK[i] = lk;
      if (shut[q] === stamp) continue;                     // a stale copy (the heuristic is consistent: a cell shut is done)
      shut[q] = stamp;
      const gq = g[q];
      if (q === t0) { found = gq; break; }
      const x = q % nx, z = (q - x) / nx;
      if (gq + hd(x, z) > cap) break;
      const tq = tpm[q], hq = hc[q];
      for (let k = 0; k < 8; k++) {
        ok[k] = 0;
        const mx = x + OX[k], mz = z + OZ[k];
        if (mx < 0 || mz < 0 || mx >= nx || mz >= nz || (k >= 4 && !(ok[SA[k]] && ok[SB[k]]))) continue;
        const m = mz * nx + mx, tm = tpm[m];
        if (!(tm > 0) || (block !== null && block[m])) continue;
        ok[k] = 1;
        if (shut[m] === stamp) continue;
        const dist = OD[k] * s, gr = (hc[m] - hq) / dist;
        const sl = gr > 0 ? 1 + 7 * gr : gr < -0.12 ? 1 + 2.5 * (-gr - 0.12) : 1;
        const ng = gq + dist * 0.5 * (tq + tm) * sl;
        if (seen[m] !== stamp || ng < g[m]) { seen[m] = stamp; g[m] = ng; par[m] = q; push(m, ng + hd(mx, mz)); }
      }
    }
    if (!path) return found;
    const cells = []; if (found < Infinity) for (let c = t0; c >= 0; c = par[c]) cells.push(c);
    return { t: found, cells: cells.reverse(), nx, nz, step: s };
  };
}
const GOOD = { boulder: 1.0, bigboulder: 1.3, cluster: 1.0, knoll: 1.2, eknoll: 1.1, depression: 1.2, pit: 1.0, rockface: 1.2, junction: 1.0 };
const COS150 = -0.8660254037844387;
// the climb a course should keep under, a share of its length (IOF's guidance: little for beginners, 4-5 % at most for the others)
const CLIMB = { blue: 0.025, yellow: 0.03, orange: 0.04, orange_md: 0.04, orange_ld: 0.04, orange_s: 0.04, orange_l: 0.04, violet_md: 0.05, violet_ld: 0.05 };

/** Chamfer distance (metres, 3-4 weights ÷ 3) from the cells where `src` is true, on a W × H grid of 1 m. */
function distance(src, W, H) {
  const d = new Float32Array(W * H), INF = 1e9;
  for (let q = 0; q < W * H; q++) d[q] = src[q] ? 0 : INF;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const q = z * W + x; let v = d[q];
    if (x > 0) v = Math.min(v, d[q - 1] + 1);
    if (z > 0) { v = Math.min(v, d[q - W] + 1); if (x > 0) v = Math.min(v, d[q - W - 1] + 1.4142135623730951); if (x < W - 1) v = Math.min(v, d[q - W + 1] + 1.4142135623730951); }
    d[q] = v;
  }
  for (let z = H - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const q = z * W + x; let v = d[q];
    if (x < W - 1) v = Math.min(v, d[q + 1] + 1);
    if (z < H - 1) { v = Math.min(v, d[q + W] + 1); if (x < W - 1) v = Math.min(v, d[q + W + 1] + 1.4142135623730951); if (x > 0) v = Math.min(v, d[q + W - 1] + 1.4142135623730951); }
    d[q] = v;
  }
  return d;
}

/**
 * The courses of a package: { W, H, h (Float32, m), cls, classes (names), speed (by class), features [{ k, x, z }] }; seed;
 * tries a level (course.py's time budget made a count). Returns race.json's `courses`.
 */
export function setCourses(pkg, { seed = 7, tries = 260, levels = LEVELS, ends = 3 } = {}) {
  const { W, H, h, cls, classes, speed: SP, features } = pkg;
  const C = Object.fromEntries(classes.map((n, i) => [n, i]));
  const speedAt = (x, z) => SP[cls[Math.floor(z) * W + Math.floor(x)]];
  const n = W * H, bad = new Uint8Array(n), hand = new Uint8Array(n), pathy = new Uint8Array(n);
  const PATHS = new Set(["path", "track", "road", "small_path"].map((k) => C[k]));
  for (let q = 0; q < n; q++) { const c = cls[q]; bad[q] = SP[c] < 0.35 ? 1 : 0; pathy[q] = PATHS.has(c) ? 1 : 0; hand[q] = pathy[q] || c === C.stream ? 1 : 0; }
  const dBad = distance(bad, W, H), dHand = distance(hand, W, H);
  const M = 60;
  const okGround = (x, z) => x > M && x < W - M && z > M && z < H - M && dBad[Math.floor(z) * W + Math.floor(x)] >= 8 && speedAt(x, z) >= 0.6;
  let sites = features.filter((f) => okGround(f.x, f.z)).map((f) => [f.x, f.z, f.k]);
  // distinct sites only: another of its kind within 12 m makes it ambiguous
  sites = sites.filter((s, i) => !sites.some((t, j) => j !== i && t[2] === s[2] && (t[0] - s[0]) * (t[0] - s[0]) + (t[1] - s[1]) * (t[1] - s[1]) < 144));
  const XY = sites.map((s) => [s[0], s[1]]), KIND = sites.map((s) => s[2]);
  const siteHand = XY.map(([x, z]) => dHand[Math.floor(z) * W + Math.floor(x)]);
  // the starts: path cells away from slow ground and from the edges (every 4 m)
  const starts = [];
  for (let z = 120; z < H - 120; z += 4) for (let x = 120; x < W - 120; x += 4) { const q = z * W + x; if (pathy[q] && dBad[q] >= 8) starts.push([x + 0.5, z + 0.5]); }
  if (!starts.length || XY.length < 8) return [];

  const along = (a, b) => {
    const m = Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))) + 1, out = [];
    for (let k = 0; k < m; k++) { const t = m > 1 ? k / (m - 1) : 0, x = Math.min(W - 1, Math.max(0, Math.floor(a[0] + (b[0] - a[0]) * t))), z = Math.min(H - 1, Math.max(0, Math.floor(a[1] + (b[1] - a[1]) * t))); out.push(z * W + x); }
    return out;
  };
  const lineStats = (a, b) => {
    const qs = along(a, b); let imp = 0, slow = 0, dsum = 0, dmax = 0;
    for (const q of qs) { const s = SP[cls[q]]; if (s < 0.05) imp++; if (s < 0.6) slow++; const d = dHand[q]; dsum += d; if (d > dmax) dmax = d; }
    return [imp / qs.length, slow / qs.length, dsum / qs.length, dmax];
  };
  const climb = (a, b) => { const qs = along(a, b); let up = 0; for (let k = 5; k < qs.length; k += 5) { const d = h[qs[k]] - h[qs[k - 5]]; if (d > 0) up += d; } return up; };
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cross = (a, b, c, d) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  const pd = (p, q, r) => { const qx = r[0] - q[0], qy = r[1] - q[1], L = qx * qx + qy * qy, t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - q[0]) * qx + (p[1] - q[1]) * qy) / L));
    const dx = p[0] - q[0] - t * qx, dy = p[1] - q[1] - t * qy; return Math.sqrt(dx * dx + dy * dy); };
  const segDist = (a, b, c, d) => (cross(a, b, c, d) ? 0 : Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b)));
  const dist = (a, b) => { const dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); };
  // the week's long courses (a level's `cross`): a leg may cross an earlier one, at 45° or more and 60 m from that leg's controls
  const crossing = (a, b, c, d) => {
    if (!cross(a, b, c, d) || pd(c, a, b) < 60 || pd(d, a, b) < 60 || pd(a, c, d) < 60 || pd(b, c, d) < 60) return false;
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - c[0], vz = d[1] - c[1];
    return Math.abs(ux * vx + uz * vz) <= 0.7071067811865476 * Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz);
  };

  // the last control and the finish, one pair for the whole map (owner, 2026-11-26: « that last control, hence last leg, is always
  // the same for all courses »): a path junction (else a site within 5 m of a path) near the map's middle, the finish LAST.fin m
  // from it on a runnable straight way (it is taped); every course's start within LAST.fromStart m of that finish
  // up to ENDS candidate pairs, their last controls 150 m apart at least: the courses are set with the first, and with the next while
  // a level finds none (the Bleu, held near the handrails, may need another)
  const ENDS = (() => {
    const rnd = prng(seed * 100 + 99), cx = W / 2, cz = H / 2, found = [];
    // where the Bleu has room: the most sites within 15 m of a path within 400 m, the map's middle breaking ties
    const easy = XY.map((_, i) => i).filter((i) => siteHand[i] <= 15);
    const room = (i) => easy.reduce((n, j) => n + (dist(XY[i], XY[j]) <= 400 ? 1 : 0), 0);
    const order = (arr) => arr.map((i) => [i, -room(i) * (0.9 + 0.2 * rnd()) + dist(XY[i], [cx, cz]) / 50]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
    const junc = [], nearp = [];
    for (let i = 0; i < XY.length; i++) { if (KIND[i] === "junction") junc.push(i); else if (siteHand[i] <= 5) nearp.push(i); }
    for (const i of [...order(junc), ...order(nearp)].slice(0, 400)) {
      const lc = XY[i];
      if (found.some((e) => dist(e.lc, lc) < 150)) continue;
      for (let t = 0; t < 60; t++) {
        const u = rnd() * 2 - 1, v = rnd() * 2 - 1, l = Math.sqrt(u * u + v * v); if (l < 0.2 || l > 1) continue;
        const r = LAST.fin[0] + rnd() * (LAST.fin[1] - LAST.fin[0]), q = [lc[0] + (u / l) * r, lc[1] + (v / l) * r];
        if (!(q[0] > M && q[0] < W - M && q[1] > M && q[1] < H - M) || speedAt(q[0], q[1]) < 0.6) continue;
        const [imp, slow] = lineStats(lc, q);
        if (imp === 0 && slow <= 0.15) { found.push({ i, lc, fin: q }); break; }
      }
      if (found.length >= ends) break;
    }
    return found;
  })();
  let END = null, near = [];

  function make(L, rnd) {
    const [lo, hi] = L.leg;
    const pts = [near[Math.floor(rnd() * near.length)]], used = new Set([END.i]), kinds = [], legs = [];
    let score = 0;
    for (let c = 0; c < L.n - 1; c++) {
      const last = pts[pts.length - 1], ok = [];
      const toEnd = c === L.n - 2;                          // the course's last control before the shared one: within a leg of it
      for (let i = 0; i < XY.length; i++) {
        const d = dist(XY[i], last); if (!(d > lo && d < hi && (L.site == null || siteHand[i] <= L.site))) continue;
        if (toEnd) { const e = dist(XY[i], END.lc); if (e < Math.max(60, lo * 0.4) || e > hi) continue; }
        ok.push(i);
      }
      for (let k = ok.length - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [ok[k], ok[r]] = [ok[r], ok[k]]; }
      if (L.long) {                                         // the week's long legs still wanted: offered first, the more the fewer legs left
        const need = L.long[1] - legs.filter((d) => d >= L.long[0]).length, left = L.n - 1 - c;
        if (need > 0 && rnd() < (need + 0.5) / left) { const far = ok.filter((i) => dist(XY[i], last) >= L.long[0]); ok.splice(0, ok.length, ...far, ...ok.filter((i) => dist(XY[i], last) < L.long[0])); }
      }
      let chosen = null;
      for (const i of ok.slice(0, 150)) {
        if (used.has(i)) continue;
        const p = XY[i];
        if (pts.slice(1).some((q) => dist(p, q) < 60) || dist(p, END.lc) < 60 || dist(p, END.fin) < 40) continue;
        if (segDist(last, p, END.lc, END.fin) < 30) continue;   // nor across the taped last leg
        if (pts.length >= 2) {                              // a dog-leg: turning back by more than 150°
          const a = pts[pts.length - 2], ux = last[0] - a[0], uz = last[1] - a[1], vx = p[0] - last[0], vz = p[1] - last[1];
          if ((ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1) < COS150) continue;
        }
        let near = false; for (let j = 0; j < pts.length - 2; j++) if (segDist(last, p, pts[j], pts[j + 1]) < 40 && !(L.cross && crossing(last, p, pts[j], pts[j + 1]))) { near = true; break; }
        if (near) continue;
        const [imp, slow, meanH, maxH] = lineStats(last, p);
        if (imp > 0.25) continue;
        if (L.line && (meanH > L.line[0] || maxH > L.line[1])) continue;
        chosen = [i, p, imp, slow, meanH]; break;
      }
      if (!chosen) return null;
      const [i, p, imp, slow, meanH] = chosen;
      used.add(i); pts.push(p); kinds.push(KIND[i]); legs.push(dist(p, last));
      const g = GOOD[KIND[i]] ?? 0.7;
      if (L.reward === "easy") score += 1 - meanH / 100 + (KIND[i] === "junction" ? 0.5 : 0);
      else if (L.reward === "features") score += g + 0.4 * Math.min(slow, 0.5);
      else if (L.reward === "hard") score += g + (0.3 * Math.min(siteHand[i], 120)) / 120 - (KIND[i] === "junction" ? 0.6 : 0);
      else score += g + 1.2 * Math.min(slow, 0.5) + 1.5 * Math.min(imp, 0.2) + (legs[legs.length - 1] > 0.6 * hi ? 0.6 : 0);
      if (L.turn && pts.length >= 3) {                      // the week's levels: a change of direction at the control left
        const a = pts[pts.length - 3], b = pts[pts.length - 2], ux = b[0] - a[0], uz = b[1] - a[1], vx = p[0] - b[0], vz = p[1] - b[1];
        score += (L.turn * (1 - (ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1))) / 2;
      }
    }
    // the last control: the map's own (END), reached by a usual leg from the course's last control
    const prev = pts[pts.length - 1], lcp = END.lc, dl = dist(lcp, prev);
    if (dl < Math.max(60, lo * 0.4) || dl > hi) return null;
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], ux = prev[0] - a[0], uz = prev[1] - a[1], vx = lcp[0] - prev[0], vz = lcp[1] - prev[1];
      if ((ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1) < COS150) return null;
    }
    for (let j = 0; j < pts.length - 2; j++) if (segDist(prev, lcp, pts[j], pts[j + 1]) < 40 && !(L.cross && crossing(prev, lcp, pts[j], pts[j + 1]))) return null;
    if (lineStats(prev, lcp)[0] > 0.25) return null;
    pts.push(lcp); kinds.push(KIND[END.i]); legs.push(dl);
    if (L.long && legs.filter((d) => d >= L.long[0]).length < L.long[1]) return null;   // the week's long legs
    const fin = END.fin;
    if (!fin) return null;
    const all = [...pts, fin];
    let length = 0; for (let k = 1; k < all.length; k++) length += dist(all[k - 1], all[k]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    score = (score / L.n) * 4 + (2 * new Set(kinds).size) / kinds.length - (8 * Math.abs(length / 1000 - L.km)) / L.km + (2 * (x1 - x0) * (z1 - z0)) / (W * H);
    // the climb kept to the level's (owner, 2026-11-14: more relief, the courses still runnable): beyond its share of the length,
    // the course scores less
    let up = 0; for (let k = 1; k < all.length; k++) up += climb(all[k - 1], all[k]);
    const cap = L.climb ?? CLIMB[L.id] ?? 0.05;
    score -= 4 * Math.max(0, up / length / cap - 1);
    return { score, all, kinds, length };
  }

  // the week's levels (WEEK_LEVELS): a course run on the ground, cells of 4 m. With `judge`, each leg of long[0] m or more: the
  // best route, then the best one kept clear of it (a corridor of 25-40 m each side blocked, away from the leg's ends) — the
  // closer the second's time to the first's, the more real the route choice. With `min`, the course's time against the target.
  let T4 = null;
  const judge = (L, c) => {
    T4 ||= timer(pkg, 4);
    let bonus = 0, t = 0;
    const longM = L.judge && L.long ? L.long[0] : Infinity;
    for (let k = 1; k < c.all.length; k++) {
      const a = c.all[k - 1], b = c.all[k], d = dist(a, b);
      if (d < longM) { const tt = T4(a, b); if (!(tt < Infinity)) return -100; t += tt; continue; }
      const r1 = T4(a, b, { path: true });
      if (!(r1.t < Infinity)) return -100;
      t += r1.t;
      const R = Math.max(25, Math.min(40, 0.03 * d)), Rc = Math.ceil(R / 4), block = new Uint8Array(r1.nx * r1.nz), keep = R + 30;
      for (const cell of r1.cells) {
        const ci = cell % r1.nx, cj = (cell - ci) / r1.nx, cx = ci * 4 + 2, cz = cj * 4 + 2;
        if (dist([cx, cz], a) < keep || dist([cx, cz], b) < keep) continue;
        for (let j = Math.max(0, cj - Rc); j <= Math.min(r1.nz - 1, cj + Rc); j++) for (let i = Math.max(0, ci - Rc); i <= Math.min(r1.nx - 1, ci + Rc); i++)
          if ((i - ci) * (i - ci) + (j - cj) * (j - cj) <= Rc * Rc) block[j * r1.nx + i] = 1;
      }
      const q = T4(a, b, { block, cap: r1.t * 1.25 }) / r1.t;
      bonus += q <= 1.08 ? 1 : q <= 1.15 ? 0.6 : q <= 1.25 ? 0.25 : 0;
    }
    return (L.judge ? (4 * bonus) / L.n : 0) - (L.min ? 8 * Math.abs(t / 60 / L.min - 1) : 0);
  };

  // the week's levels with a target time: the length from the terrain's own pace (a hilly karst runs at 11-13 min a km, a flat
  // moraine at 7: one length cannot give one time), measured on legs of the level's lengths between the sites; the km and the legs'
  // lengths scaled together, by KM_RANGE at most
  if (levels.some((L) => L.min)) {
    T4 ||= timer(pkg, 4);
    levels = levels.map((L) => {
      const pace = L.min ? paceOf(T4, XY, seed, L.leg[0], Math.min(1200, L.leg[1])) : 0;
      if (!(pace > 0)) return L;
      const f = Math.max(KM_RANGE[0], Math.min(KM_RANGE[1], (L.min * 60) / pace / 1000 / L.km)), m = (v) => Math.round(v * f);
      return { ...L, km: L.km * f, leg: L.leg.map(m), ...(L.long ? { long: [m(L.long[0]), L.long[1]] } : {}) };   // the legs in step
    });
  }

  const setAll = () => {
  const out = [];
  levels.forEach((L, k) => {
    const rnd = prng(seed * 100 + k + 1);
    let best = null;
    // the Bleu, held near the handrails, is found more rarely: three times the tries
    if (L.judge || L.min) {
      // the week's levels: the best courses (by the score above) run on the ground, then ranked again
      const found = [];
      for (let t = 0; t < tries; t++) { const r = make(L, rnd); if (r) found.push(r); }
      found.sort((a, b) => b.score - a.score);
      for (const c of found.slice(0, L.judge ? 6 : 16)) { const s = c.score + judge(L, c); if (!best || s > best.s) best = { ...c, s }; }
    } else
    for (let t = 0, n = L.id === "blue" ? tries * 3 : tries; t < n; t++) { const r = make(L, rnd); if (r && (!best || r.score > best.score)) best = r; }
    if (!best) return;
    let up = 0; for (let j = 1; j < best.all.length; j++) up += climb(best.all[j - 1], best.all[j]);
    // the codes shuffled, but the shared last control's: LAST.code on every course
    const codes = best.kinds.slice(0, -1).map((_, i) => 31 + i);
    for (let i = codes.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); [codes[i], codes[r]] = [codes[r], codes[i]]; }
    codes.push(LAST.code);
    const r1 = (v) => Math.round(v * 10) / 10;
    const controls = [{ kind: "start", x: r1(best.all[0][0]), z: r1(best.all[0][1]) },
      ...best.all.slice(1, -1).map(([x, z], i) => ({ kind: "control", x: r1(x), z: r1(z), code: String(codes[i]), feature: best.kinds[i] })),
      { kind: "finish", x: r1(best.all[best.all.length - 1][0]), z: r1(best.all[best.all.length - 1][1]) }];
    out.push({ id: L.id, controls, length: Math.round(best.length), climb: Math.round(up / 5) * 5 });
  });
  return out;
  };
  let best = [];
  for (const e of ENDS) {
    END = e;
    near = starts.filter((p) => { const d = dist(p, END.fin); return d >= 40 && d <= LAST.fromStart && dist(p, END.lc) >= 60; });
    if (!near.length) continue;
    const out = setAll();
    if (out.length > best.length) best = out;
    if (best.length === levels.length) break;
  }
  return best;
}
