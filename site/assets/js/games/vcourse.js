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
export function setCourses(pkg, { seed = 7, tries = 260, levels = LEVELS } = {}) {
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

  function make(L, rnd) {
    const [lo, hi] = L.leg;
    const pts = [starts[Math.floor(rnd() * starts.length)]], used = new Set(), kinds = [], legs = [];
    let score = 0;
    for (let c = 0; c < L.n; c++) {
      const last = pts[pts.length - 1], ok = [];
      for (let i = 0; i < XY.length; i++) { const d = dist(XY[i], last); if (d > lo && d < hi && (L.site == null || siteHand[i] <= L.site)) ok.push(i); }
      for (let k = ok.length - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [ok[k], ok[r]] = [ok[r], ok[k]]; }
      let chosen = null;
      for (const i of ok.slice(0, 150)) {
        if (used.has(i)) continue;
        const p = XY[i];
        if (pts.slice(1).some((q) => dist(p, q) < 60)) continue;
        if (pts.length >= 2) {                              // a dog-leg: turning back by more than 150°
          const a = pts[pts.length - 2], ux = last[0] - a[0], uz = last[1] - a[1], vx = p[0] - last[0], vz = p[1] - last[1];
          if ((ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1) < COS150) continue;
        }
        let near = false; for (let j = 0; j < pts.length - 2; j++) if (segDist(last, p, pts[j], pts[j + 1]) < 40) { near = true; break; }
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
    }
    // the finish: near the start, after the last control, crossing nothing
    let fin = null;
    for (let t = 0; t < 80 && !fin; t++) {
      const u = rnd() * 2 - 1, v = rnd() * 2 - 1, l = Math.sqrt(u * u + v * v); if (l < 0.2 || l > 1) continue;
      const r = 40 + rnd() * 100, q = [pts[0][0] + (u / l) * r, pts[0][1] + (v / l) * r];
      if (!(q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H) || speedAt(q[0], q[1]) < 0.6) continue;
      const Lf = dist(q, pts[pts.length - 1]);
      let near = false; for (let j = 1; j < pts.length - 2; j++) if (segDist(pts[pts.length - 1], q, pts[j], pts[j + 1]) < 30) { near = true; break; }
      if (80 < Lf && Lf < Math.max(450, hi) && !near && (L.line == null || lineStats(pts[pts.length - 1], q)[2] <= L.line[0] * 1.5)) fin = q;
    }
    if (!fin) return null;
    const all = [...pts, fin];
    let length = 0; for (let k = 1; k < all.length; k++) length += dist(all[k - 1], all[k]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    score = (score / L.n) * 4 + (2 * new Set(kinds).size) / kinds.length - (8 * Math.abs(length / 1000 - L.km)) / L.km + (2 * (x1 - x0) * (z1 - z0)) / (W * H);
    // the climb kept to the level's (owner, 2026-11-14: more relief, the courses still runnable): beyond its share of the length,
    // the course scores less
    let up = 0; for (let k = 1; k < all.length; k++) up += climb(all[k - 1], all[k]);
    const cap = CLIMB[L.id] ?? 0.05;
    score -= 4 * Math.max(0, up / length / cap - 1);
    return { score, all, kinds, length };
  }

  const out = [];
  levels.forEach((L, k) => {
    const rnd = prng(seed * 100 + k + 1);
    let best = null;
    // the Bleu, held near the handrails, is found more rarely: three times the tries
    for (let t = 0, n = L.id === "blue" ? tries * 3 : tries; t < n; t++) { const r = make(L, rnd); if (r && (!best || r.score > best.score)) best = r; }
    if (!best) return;
    let up = 0; for (let j = 1; j < best.all.length; j++) up += climb(best.all[j - 1], best.all[j]);
    const codes = best.kinds.map((_, i) => 31 + i);
    for (let i = codes.length - 1; i > 0; i--) { const r = Math.floor(rnd() * (i + 1)); [codes[i], codes[r]] = [codes[r], codes[i]]; }
    const r1 = (v) => Math.round(v * 10) / 10;
    const controls = [{ kind: "start", x: r1(best.all[0][0]), z: r1(best.all[0][1]) },
      ...best.all.slice(1, -1).map(([x, z], i) => ({ kind: "control", x: r1(x), z: r1(z), code: String(codes[i]), feature: best.kinds[i] })),
      { kind: "finish", x: r1(best.all[best.all.length - 1][0]), z: r1(best.all[best.all.length - 1][1]) }];
    out.push({ id: L.id, controls, length: Math.round(best.length), climb: Math.round(up / 5) * 5 });
  });
  return out;
}
