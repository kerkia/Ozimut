// Pixel's sprint courses set in the browser (owner, 2026-11-26: the invented towns' courses), after tools/virtually/course_sprint.py:
// four levels — Bleu, Jaune, Orange court, Orange long —, sites on building corners, wall ends, the stairs' feet, monuments, fountains,
// trees; two controls of a course not consecutive at least `sep` apart (or half the way between them along the course); no dog-leg,
// no leg run along another; the orange courses rewarded for legs whose straight line goes through what cannot be crossed (a route
// choice round it), the Bleu for legs along the streets. Each course kept is then run on the ground (A* on the 1 m classes): every
// leg must be reachable and none longer than 2.3 times its straight line. Deterministic (a seeded generator, a fixed number of tries).
// One last control and one finish for all the town's courses (owner, 2026-11-26: « that last control, hence last leg, is always the
// same for all courses »; course_sprint.py pick_end): an easy site — a building's corner, a monument, a fountain — near the town's
// middle, code LAST.code on every course, the finish LAST.fin m from it on a straight way clear of every obstacle by 1.8 m from where
// the game's tape starts (vworld.js finishTape); every course's start within LAST.fromStart m of that finish, the control before the
// shared one within a leg of it.

import { prng } from "./vgen.js";
import { timer, paceOf, KM_RANGE } from "./vcourse.js";

export const SPRINT_LEVELS = [
  { id: "blue", n: 6, km: 1.0, lo: 50, hi: 170, rc: -0.6, sep: 70, easy: true },
  { id: "yellow", n: 8, km: 1.4, lo: 60, hi: 200, rc: 0.3, sep: 70, easy: true },
  { id: "orange_s", n: 10, km: 1.8, lo: 60, hi: 220, rc: 1.0, sep: 90 },
  { id: "orange_l", n: 14, km: 2.8, lo: 80, hi: 280, rc: 2.0, sep: 90 },
];
// The « compétition de la semaine »'s sprint (owner, 2026-11-28; docs/pixel/competitions.md §5): « a » the long orange-level
// sprint, « b » shorter, « c » a level easier, their rules the orange courses'. `min` (read only when present): the course's target
// time at the game's ×1 (minutes, games/vcourse.js timer on cells of 1 m), the best courses ranked closer to it.
export const WEEK_SPRINT_LEVELS = [
  { id: "a", n: 20, km: 2.9, lo: 70, hi: 280, rc: 2.0, sep: 90, min: 14 },
  { id: "b", n: 15, km: 2.2, lo: 70, hi: 250, rc: 1.6, sep: 90, min: 11 },
  { id: "c", n: 11, km: 1.6, lo: 60, hi: 220, rc: 1.0, sep: 80, min: 8 },
];
const GOOD = { corner: 1.0, wallend: 1.1, stairs: 1.2, monument: 1.2, fountain: 1.2, bigtree: 0.9, bush: 0.7 };
const EASY = { corner: 0.8, wallend: 0.6, stairs: 1.0, monument: 1.2, fountain: 1.2, bigtree: 0.7, bush: 0.3 };
const COS150 = -0.8660254037844387;
export const LAST = { fromStart: 220, fin: [40, 100], code: 100, easy: new Set(["corner", "monument", "fountain"]), clear: 1.8 };

/**
 * The courses of an invented town: { W, H, h, cls, classes, speed, features [{ k, x, z }] } (the flags' places); seed; tries a level.
 * Returns race.json's `courses`.
 */
export function setSprintCourses(pkg, { seed = 7, tries = 160, levels = SPRINT_LEVELS, ends = 6 } = {}) {
  const { W, H, h, cls, classes, speed: SP, features, obst = [] } = pkg;
  const C = Object.fromEntries(classes.map((n, i) => [n, i]));
  const N = W * H, sp = new Float32Array(N);
  for (let q = 0; q < N; q++) sp[q] = SP[cls[q]] || 0;
  // a building's cells run as paving in the game (its outline stops the runner): here they stop
  for (let q = 0; q < N; q++) if (cls[q] === C.building) sp[q] = 0;
  const go = (q) => sp[q] > 0.3;
  // the ground one can reach from the streets (the main piece)
  const main = new Uint8Array(N);
  { const stack = new Int32Array(N); let n = 0;
    for (let q = 0; q < N; q++) if (cls[q] === C.road) { main[q] = 1; stack[n++] = q; }
    const visit = (m) => { if (!main[m] && go(m)) { main[m] = 1; stack[n++] = m; } };
    while (n) { const q = stack[--n], x = q % W;
      if (x > 0) visit(q - 1); if (x < W - 1) visit(q + 1); if (q >= W) visit(q - W); if (q < N - W) visit(q + W); } }
  const ok = (x, z) => x > 25 && z > 25 && x < W - 25 && z < H - 25 && main[Math.floor(z) * W + Math.floor(x)] === 1;
  // a site needs room round its flag (2 m of ground one can run on, 60 % of the cells within 3 m)
  const roomy = (x, z) => { let n = 0, g = 0; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { if (dx * dx + dz * dz > 9) continue; n++; const q = Math.floor(z + dz) * W + Math.floor(x + dx); if (q >= 0 && q < N && go(q)) g++; } return g / n >= 0.55; };
  let sites = features.filter((f) => ok(f.x, f.z) && roomy(f.x, f.z));
  // distinct sites: another of its kind within 8 m makes it ambiguous (a corner within 8 m of another corner)
  sites = sites.filter((s, i) => !sites.some((t, j) => j !== i && t.k === s.k && (t.x - s.x) ** 2 + (t.z - s.z) ** 2 < 64));
  const XY = sites.map((s) => [s.x, s.z]), KIND = sites.map((s) => s.k);
  // the starts: on a street, away from the edges (every 6 m)
  const starts = [];
  for (let z = 60; z < H - 60; z += 6) for (let x = 60; x < W - 60; x += 6) { const q = z * W + x; if ((cls[q] === C.road || cls[q] === C.paved) && main[q] && roomy(x + 0.5, z + 0.5)) starts.push([x + 0.5, z + 0.5]); }
  if (!starts.length || XY.length < 16) return [];

  // the clearance: metres from each cell's centre to the nearest thing that stops the runner (the ground's classes, and the
  // props, cars and trunks the town places), by a two-pass chamfer distance
  const CLEAR = new Float32Array(N);
  for (let q = 0; q < N; q++) CLEAR[q] = go(q) ? 1e9 : 0;
  for (let k = 0; k + 2 < obst.length; k += 3) {
    const ox = obst[k], oz = obst[k + 1], r = obst[k + 2];
    for (let z = Math.max(0, Math.floor(oz - r - 1)); z <= Math.min(H - 1, Math.floor(oz + r + 1)); z++)
      for (let x = Math.max(0, Math.floor(ox - r - 1)); x <= Math.min(W - 1, Math.floor(ox + r + 1)); x++) {
        const dx = x + 0.5 - ox, dz = z + 0.5 - oz, d = Math.max(0, Math.sqrt(dx * dx + dz * dz) - r), q = z * W + x; if (d < CLEAR[q]) CLEAR[q] = d;
      }
  }
  { const D = 1.41421356;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const q = z * W + x; let v = CLEAR[q];
      if (x > 0) v = Math.min(v, CLEAR[q - 1] + 1); if (z > 0) { v = Math.min(v, CLEAR[q - W] + 1); if (x > 0) v = Math.min(v, CLEAR[q - W - 1] + D); if (x < W - 1) v = Math.min(v, CLEAR[q - W + 1] + D); } CLEAR[q] = v; }
    for (let z = H - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) { const q = z * W + x; let v = CLEAR[q];
      if (x < W - 1) v = Math.min(v, CLEAR[q + 1] + 1); if (z < H - 1) { v = Math.min(v, CLEAR[q + W] + 1); if (x < W - 1) v = Math.min(v, CLEAR[q + W + 1] + D); if (x > 0) v = Math.min(v, CLEAR[q + W - 1] + D); } CLEAR[q] = v; } }
  // a blocked cell's centre is half a metre inside it: what is left of the clearance from its edge
  const clearAt = (x, z) => CLEAR[Math.floor(z) * W + Math.floor(x)] - 0.5;

  const dist = (a, b) => { const dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); };
  const along = (a, b) => {
    const m = Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))) + 1, out = [];
    for (let k = 0; k < m; k++) { const t = m > 1 ? k / (m - 1) : 0, x = Math.min(W - 1, Math.max(0, Math.floor(a[0] + (b[0] - a[0]) * t))), z = Math.min(H - 1, Math.max(0, Math.floor(a[1] + (b[1] - a[1]) * t))); out.push(z * W + x); }
    return out;
  };
  const blocked = (a, b) => { const qs = along(a, b); let n = 0; for (const q of qs) if (!go(q)) n++; return n / qs.length; };
  const climb = (a, b) => { const qs = along(a, b); let up = 0; for (let k = 5; k < qs.length; k += 5) { const d = h[qs[k]] - h[qs[k - 5]]; if (d > 0) up += d; } return up; };
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cross = (a, b, c, d) => orient(a, b, c) !== orient(a, b, d) && orient(c, d, a) !== orient(c, d, b);
  const pd = (p, q, r) => { const qx = r[0] - q[0], qy = r[1] - q[1], L = qx * qx + qy * qy, t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - q[0]) * qx + (p[1] - q[1]) * qy) / L));
    const dx = p[0] - q[0] - t * qx, dy = p[1] - q[1] - t * qy; return Math.sqrt(dx * dx + dy * dy); };
  const segDist = (a, b, c, d) => (cross(a, b, c, d) ? 0 : Math.min(pd(a, c, d), pd(b, c, d), pd(c, a, b), pd(d, a, b)));
  // the straight way from a to b clear by LAST.clear m from where the game's tape starts (min(8 m, a fifth of the way) after a)
  const clearLine = (a, b) => {
    const L = dist(a, b), s0 = Math.min(8, 0.2 * L), n = Math.ceil((L - s0) * 2) + 1;
    for (let k = 0; k <= n; k++) { const t = (s0 + ((L - s0) * k) / n) / L; if (clearAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t) < LAST.clear) return false; }
    return true;
  };

  // the town's last control and finish, up to `ends` candidate pairs whose last controls lie 120 m apart: the courses are set with
  // the first, and with the next while a level finds none; the pair where the most levels find a course is kept
  const ENDS = (() => {
    const rnd = prng(seed * 100 + 99), cx = W / 2, cz = H / 2, found = [];
    const order = XY.map((p, i) => [i, dist(p, [cx, cz]) * (0.75 + 0.5 * rnd())]).filter(([i]) => LAST.easy.has(KIND[i]))
      .sort((a, b) => a[1] - b[1]).map((a) => a[0]).slice(0, 150);
    for (const i of order) {
      const lc = XY[i];
      if (found.some((e) => dist(e.lc, lc) < 120)) continue;
      for (let t = 0; t < 80; t++) {
        // a direction drawn in the unit disc (sqrt only: every browser finds the same, no trigonometry)
        const u = rnd() * 2 - 1, v = rnd() * 2 - 1, l = Math.sqrt(u * u + v * v); if (l < 0.2 || l > 1) continue;
        const r = LAST.fin[0] + rnd() * (LAST.fin[1] - LAST.fin[0]), q = [lc[0] + (u / l) * r, lc[1] + (v / l) * r];
        if (!ok(q[0], q[1]) || clearAt(q[0], q[1]) < 2 || !clearLine(lc, q)) continue;
        found.push({ i, lc, fin: q }); break;
      }
      if (found.length >= ends) break;
    }
    return found;
  })();
  let END = null, near = [];

  // ---- the run on the ground: A* on the 1 m cells (8 neighbours, a diagonal only past two free sides) ----
  const gScore = new Float32Array(N), seen = new Int32Array(N), heapA = new Int32Array(N * 4), heapK = new Float32Array(N * 4);
  let stamp = 0;
  const route = (a, b, cap) => {
    stamp++;
    const s0 = Math.floor(a[1]) * W + Math.floor(a[0]), t0 = Math.floor(b[1]) * W + Math.floor(b[0]), tx = t0 % W, tz = (t0 - tx) / W;
    let n = 0;
    const push = (q, k) => { let i = n++; while (i) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapA[i] = heapA[p]; heapK[i] = heapK[p]; i = p; } heapA[i] = q; heapK[i] = k; };
    const pop = () => { const top = heapA[0], lq = heapA[--n], lk = heapK[n]; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, mk = lk; if (l < n && heapK[l] < mk) { m = l; mk = heapK[l]; } if (r < n && heapK[r] < mk) m = r; if (m < 0) break; heapA[i] = heapA[m]; heapK[i] = heapK[m]; i = m; }
      heapA[i] = lq; heapK[i] = lk; return top; };
    const hd = (q) => { const x = q % W, z = (q - x) / W, dx = Math.abs(x - tx), dz = Math.abs(z - tz); return Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz); };
    seen[s0] = stamp; gScore[s0] = 0; push(s0, hd(s0));
    const D = 1.41421356;
    while (n) {
      const q = pop(), g = gScore[q];
      if (q === t0) return g;
      if (g + hd(q) > cap) return Infinity;
      const x = q % W;
      const step = (m, d) => { if (m < 0 || m >= N || !go(m)) return; const ng = g + d; if (seen[m] !== stamp || ng < gScore[m] - 1e-4) { seen[m] = stamp; gScore[m] = ng; if (n < heapA.length) push(m, ng + hd(m)); } };
      const L = x > 0, R = x < W - 1, U = q >= W, Dn = q < N - W;
      if (L) step(q - 1, 1); if (R) step(q + 1, 1); if (U) step(q - W, 1); if (Dn) step(q + W, 1);
      if (L && U && go(q - 1) && go(q - W)) step(q - W - 1, D); if (R && U && go(q + 1) && go(q - W)) step(q - W + 1, D);
      if (L && Dn && go(q - 1) && go(q + W)) step(q + W - 1, D); if (R && Dn && go(q + 1) && go(q + W)) step(q + W + 1, D);
    }
    return Infinity;
  };

  function make(L, rnd) {
    const pts = [near[Math.floor(rnd() * near.length)]], used = new Set([END.i]), kinds = [], legs = [];
    let score = 0;
    for (let c = 0; c < L.n - 1; c++) {
      const last = pts[pts.length - 1], cand = [], toEnd = c === L.n - 2;     // the control before the shared one: within a leg of it
      for (let i = 0; i < XY.length; i++) {
        const d = dist(XY[i], last); if (!(d > L.lo && d < L.hi)) continue;
        if (toEnd) { const e = dist(XY[i], END.lc); if (e <= L.lo || e >= L.hi) continue; }
        cand.push(i);
      }
      for (let k = cand.length - 1; k > 0; k--) { const r = Math.floor(rnd() * (k + 1)); [cand[k], cand[r]] = [cand[r], cand[k]]; }
      let chosen = null;
      for (const i of cand.slice(0, 120)) {
        if (used.has(i)) continue;
        const p = XY[i];
        // two controls not consecutive: `sep` apart, or half the way between them along the course
        let ok_ = true, way = dist(p, last);
        for (let j = pts.length - 2; j >= 1 && ok_; j--) { way += legs[j]; if (dist(p, pts[j]) < Math.min(L.sep, 0.5 * way)) ok_ = false; }
        if (!ok_ || dist(p, pts[0]) < 30 || dist(p, END.lc) < 25 || dist(p, END.fin) < 25) continue;
        if (segDist(last, p, END.lc, END.fin) < 15) continue;             // nor across the taped last leg
        if (pts.length >= 2) {                              // a dog-leg: turning back by more than 150°
          const a = pts[pts.length - 2], ux = last[0] - a[0], uz = last[1] - a[1], vx = p[0] - last[0], vz = p[1] - last[1];
          if ((ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1) < COS150) continue;
        }
        let near = false; for (let j = 0; j < pts.length - 2; j++) if (segDist(last, p, pts[j], pts[j + 1]) < 20) { near = true; break; }
        if (near) continue;
        chosen = [i, p, blocked(last, p)]; break;
      }
      if (!chosen) return null;
      const [i, p, blk] = chosen;
      used.add(i); legs.push(dist(p, last)); pts.push(p); kinds.push(KIND[i]);
      score += (L.easy ? EASY : GOOD)[KIND[i]] ?? 0.6;
      score += L.rc * Math.min(blk, 0.5);
    }
    // the last control: the town's own (END), by a usual leg from the course's last one; then the shared finish
    const prev = pts[pts.length - 1], lc = END.lc, dl = dist(lc, prev);
    { let way = dl; for (let j = pts.length - 2; j >= 1; j--) { way += legs[j]; if (dist(lc, pts[j]) < Math.min(L.sep, 0.5 * way)) return null; } }
    if (pts.length >= 2) {
      const a = pts[pts.length - 2], ux = prev[0] - a[0], uz = prev[1] - a[1], vx = lc[0] - prev[0], vz = lc[1] - prev[1];
      if ((ux * vx + uz * vz) / (Math.sqrt(ux * ux + uz * uz) * Math.sqrt(vx * vx + vz * vz) || 1) < COS150) return null;
    }
    for (let j = 0; j < pts.length - 2; j++) if (segDist(prev, lc, pts[j], pts[j + 1]) < 20) return null;
    pts.push(lc); kinds.push(KIND[END.i]); legs.push(dl);
    score += (L.easy ? EASY : GOOD)[KIND[END.i]] ?? 0.6;
    score += L.rc * Math.min(blocked(prev, lc), 0.5);
    const fin = END.fin;
    const all = [...pts, fin];
    let length = 0; for (let k = 1; k < all.length; k++) length += dist(all[k - 1], all[k]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of all) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    score = (score / L.n) * 4 + (1.5 * new Set(kinds).size) / kinds.length - (4 * Math.abs(length / 1000 - L.km)) / L.km + (1.5 * (x1 - x0) * (z1 - z0)) / (W * H);
    return { score, all, kinds, length };
  }

  let T1 = null;                                           // the week's levels: the game's own time on the ground (vcourse.js timer)
  // and their length from the town's own pace (vcourse.js setCourses does the same)
  if (levels.some((L) => L.min)) {
    levels = levels.map((L) => {
      const pace = L.min ? paceOf((T1 ||= timer(pkg, 1)), XY, seed, L.lo, L.hi) : 0;
      if (!(pace > 0)) return L;
      const f = Math.max(KM_RANGE[0], Math.min(KM_RANGE[1], (L.min * 60) / pace / 1000 / L.km));
      return { ...L, km: L.km * f, lo: Math.round(L.lo * f), hi: Math.round(L.hi * f) };   // the legs in step
    });
  }
  const setAll = () => {
  const out = [];
  levels.forEach((L, k) => {
    const rnd = prng(seed * 100 + k + 1);
    const found = [];
    // the orange courses twice the tries (course_sprint.py: 40 and 80): their 10-14 controls must end at the shared last control
    for (let t = 0, n = L.easy ? tries : tries * 2; t < n; t++) { const r = make(L, rnd); if (r) found.push(r); }
    found.sort((a, b) => b.score - a.score);
    // the best that runs: each leg reachable and not over 2.3 × its straight line; the orange courses a bonus for the detours
    let best = null;
    for (const c of found.slice(0, L.min ? 12 : 8)) {
      let fine = true, extra = 0, way = 0;
      for (let j = 1; j < c.all.length && fine; j++) {
        const d = dist(c.all[j - 1], c.all[j]), r = route(c.all[j - 1], c.all[j], d * 2.3 + 20);
        if (!Number.isFinite(r)) fine = false; else { extra += Math.min(0.6, r / Math.max(d, 1) - 1); if (L.min) way += (T1 ||= timer(pkg, 1))(c.all[j - 1], c.all[j]); }
      }
      if (!fine) continue;
      let s = c.score + (L.easy ? -1 : 1) * (extra / (c.all.length - 1));
      if (L.min) s -= 8 * Math.abs(way / 60 / L.min - 1);   // the week's: the time against the target
      if (!best || s > best.s) best = { ...c, s };
    }
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
    near = starts.filter((p) => { const d = dist(p, END.fin); return d >= 30 && d <= LAST.fromStart && dist(p, END.lc) >= 40; });
    if (!near.length) continue;
    const out = setAll();
    if (out.length > best.length) best = out;
    if (best.length === levels.length) break;
  }
  return best;
}
