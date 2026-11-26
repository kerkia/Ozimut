// Pixel's invented towns, for sprint (owner, 2026-11-26: « des cartes synthétiques pour le sprint, terrain libre et carte du jour »):
// one town model from a seed, from which the ISSprOM 2019-2 map (1:4000), the 3D world's package (heights, ground classes, the
// ground's picture and surfaces, trees) and the town's buildings, walls, fences, hedges, kerbs, stairs, street furniture and cars
// (games/vtown.js's arrays, as tools/virtually/town_3d.py writes them for a real town) are drawn, so that they agree by construction.
// The forest's sibling (games/vgen.js); the same rules:
// - everything is decided on the 1 m grid of the world (the street network rasterised once, the blocks as its connected pieces),
//   and the map's areas are those cells' regions traced (marching squares), the buildings, walls, fences, hedges, stairs and
//   paths the very polygons and lines the world is made of;
// - deterministic: only + − × ÷, Math.sqrt, Math.floor and integer hashing decide the town (the « Carte du jour »: one town for
//   everyone, whatever the browser); trigonometry only for a lamp's or a car's angle, which nothing else reads. No time budget.
//
// The town: a street grid turned and warped (a jittered lattice through a smooth displacement, so that streets curve and blocks
// differ), one or two main roads, narrow streets and alleys in the old centre, larger blocks merged here and there, a steep bank
// where alleys become stairways; blocks of terraced houses on the street (old town) or of detached houses in their gardens
// (suburb), parks (lawn, woods, shrubs, a pond, gravel paths, often fenced with gates), a square with its church and monument, a
// school behind its wall. Gardens and courts nobody reaches are « shall not be entered » (ISSprOM 520), as on a real sprint map.

import { CL, SPEED, VEG_K, prng, vnoise, noiseField, blur, isolines, inPoly, simplify, chaikin, densify, polyLen, ringArea, smoothstep } from "./vgen.js";

const C = Object.fromEntries(CL.map((n, i) => [n, i]));
const CH = 64;                       // m: vtown's chunks (vworld streams the world by them)
/** The look of an invented town (vworld's biome: greens, haze, sun; the ground's colours are the town's own picture). */
export const TOWN_BIOME = { name: "An invented European town", conifer: 0.12, crown: "broadleaf", fog: "#d4dce2", zenith: "#7da2c8", sun: [-0.45, 0.72, 0.5],
  leaf: ["#56743a", "#4d6c35", "#617d40", "#5a7838", "#486431"], coniferLeaf: ["#2f4d2b", "#365432"], bush: ["#4a6a33", "#557540", "#3f5d2c"],
  low: ["#7f8a4a", "#6f7d42"], trunk: "#5e564c", trunk2: "#6a6156", ground: { open: [118, 138, 70], forest: [86, 84, 56], paved: [128, 126, 122] } };
// the surfaces' codes (games/vtown.js's ground shader: 1 asphalt, 2 paving stones, 3 concrete, 4 grass, 5 gravel, 6 forest floor, 7 water, 8 building)
const SURF = { asphalt: 1, setts: 2, concrete: 3, grass: 4, gravel: 5, floor: 6, water: 7, building: 8 };
// the walls' colours (plaster), bricks, stone; the roofs' tiles and slates
const PLASTER = [[226, 214, 190], [214, 196, 168], [232, 224, 206], [204, 186, 156], [236, 228, 214], [220, 200, 176], [196, 178, 150], [224, 206, 186]];
const BRICK = [150, 82, 62], STONE = [178, 168, 150];
const TILES = [[158, 84, 62], [146, 78, 58], [168, 98, 70], [138, 72, 56]], SLATES = [[80, 84, 92], [72, 76, 84], [92, 94, 100]];
const CAR_COLOURS = [[40, 42, 46], [210, 212, 214], [150, 152, 156], [90, 92, 96], [30, 50, 90], [120, 20, 24], [230, 230, 228], [60, 70, 60]];

const hashU = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const segD = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L)) : 0;
  const ex = px - ax - t * dx, ez = pz - az - t * dz; return Math.sqrt(ex * ex + ez * ez);
};
const lineD = (p, x, z) => { let d = Infinity; for (let k = 1; k < p.length; k++) d = Math.min(d, segD(x, z, p[k - 1][0], p[k - 1][1], p[k][0], p[k][1])); return d; };
const dist = (a, b) => { const dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); };
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * One town. opts: seed (uint32), size (m, the square's side), buildings (how built-up), gardens (how much of it detached houses in
 * their gardens rather than the old town's terraces), parks (how many parks) — each 0 … 1; onStep(name, share).
 * Returns { W, H, base, h, cls, veg, ground (RGBA, `gres` px a metre), gres, surf, trees (6 bytes a tree, vworld's trees.bin), objects
 * (ISSprOM: { sym, otp, pts | rings, ang }), features (the course setter's sites: { k, x, z } where the flag stands), feats, town:
 * { meta, arrays } (games/vtown.js), interval, biome, gen }.
 */
export function generateTown({ seed = 1, size = 700, buildings = 0.5, gardens = 0.5, parks = 0.5, onStep = () => {} } = {}) {
  const W = Math.max(400, Math.min(1000, Math.round(size / 2) * 2)), H = W, N = W * H;
  const R = prng(seed);
  const inside = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const cellOf = (x, z) => Math.floor(z) * W + Math.floor(x);

  // ---- the relief: gentle hills on a 2 m grid, and a steep bank across the town (the alleys climbing it become stairways) ----
  onStep("relief", 0);
  const S = 2, nx = W / S + 1, ny = H / S + 1;
  const hg = noiseField(nx, ny, S, [[520, 5], [210, 2.4], [80, 0.6]], seed + 11);
  let snx = R.range(-1, 1), snz = R.range(-1, 1); { const l = Math.sqrt(snx * snx + snz * snz) || 1; snx /= l; snz /= l; }
  const sx0 = W * R.range(0.3, 0.7), sz0 = H * R.range(0.3, 0.7), sH = R.range(6, 10), sW = R.range(14, 24);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = (i * S - sx0) * snx + (j * S - sz0) * snz;
    hg[j * nx + i] += 50 + sH * smoothstep(-sW, sW, s);
  }
  const hAt = (x, z) => {
    const gx = Math.max(0, Math.min(nx - 1.000001, x / S)), gz = Math.max(0, Math.min(ny - 1.000001, z / S));
    const i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, o = j * nx + i;
    return hg[o] * (1 - u) * (1 - v) + hg[o + 1] * u * (1 - v) + hg[o + nx] * (1 - u) * v + hg[o + nx + 1] * u * v;
  };
  const hm = new Float32Array(N);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) hm[z * W + x] = hAt(x + 0.5, z + 0.5);
  let base = Infinity; for (let q = 0; q < N; q++) if (hm[q] < base) base = hm[q];
  base = Math.floor(base);
  onStep("relief", 1);

  // ---- the street grid: a lattice turned, jittered and warped (F maps grid coordinates to world metres, continuously) ----
  onStep("streets", 0);
  let ux = 1, uz = R.range(-0.45, 0.45); { const l = Math.sqrt(ux * ux + uz * uz); ux /= l; uz /= l; }
  const vx = -uz, vz = ux;
  const bx = R.range(80, 100) * (1.12 - 0.24 * buildings), by = bx * R.range(0.6, 0.82);
  const cx = W / 2, cz = H / 2, reach = Math.sqrt(W * W + H * H) / 2 + 80;
  const NI = Math.ceil(reach / bx) + 1, NJ = Math.ceil(reach / by) + 1, GW = 2 * NI + 2, GH = 2 * NJ + 2;
  const jit = new Float32Array(GW * GH * 2);
  for (let k = 0; k < GW * GH; k++) { jit[k * 2] = R.range(-0.13, 0.13) * bx; jit[k * 2 + 1] = R.range(-0.13, 0.13) * by; }
  const WA = 13, WS = 250, ws1 = seed + 101, ws2 = seed + 202;
  const J = (i, j, c) => jit[(Math.max(0, Math.min(GH - 1, j + NJ)) * GW + Math.max(0, Math.min(GW - 1, i + NI))) * 2 + c];
  const F = (gi, gj) => {
    const i = Math.floor(gi), j = Math.floor(gj), u = gi - i, v = gj - j;
    const jj = (c) => J(i, j, c) * (1 - u) * (1 - v) + J(i + 1, j, c) * u * (1 - v) + J(i, j + 1, c) * (1 - u) * v + J(i + 1, j + 1, c) * u * v;
    const px = cx + gi * bx * ux + gj * by * vx + jj(0), pz = cz + gi * bx * uz + gj * by * vz + jj(1);
    return [px + WA * vnoise(px / WS, pz / WS, ws1), pz + WA * vnoise(px / WS + 37.1, pz / WS + 11.3, ws2)];
  };
  // the old centre: round the town's middle, its edge wavy; the more gardens, the smaller
  const tcx = cx + R.range(-0.12, 0.12) * W, tcz = cz + R.range(-0.12, 0.12) * H;
  const oldR = (0.62 - 0.42 * gardens) * W * 0.5 + 40;
  const isOld = (x, z) => { const dx = x - tcx, dz = z - tcz; return Math.sqrt(dx * dx + dz * dz) + 45 * vnoise(x / 160, z / 160, seed + 303) < oldR; };

  // the edges: h<i>,<j> from (i, j) to (i + 1, j), v<i>,<j> from (i, j) to (i, j + 1); a block split in two by a passage: m<i>,<j>
  const E = new Map(), edges = [];
  const mkEdge = (key, a, b) => {
    const [ax, az] = F(a[0], a[1]), [qx, qz] = F(b[0], b[1]), n = Math.max(2, Math.ceil(Math.sqrt((qx - ax) ** 2 + (qz - az) ** 2) / 3));
    const pts = []; for (let k = 0; k <= n; k++) pts.push(F(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    const e = { key, a, b, pts, len: polyLen(pts), kind: "street", idx: edges.length, out: x1 < -40 || z1 < -40 || x0 > W + 40 || z0 > H + 40 };
    const [mx, mz] = pts[Math.floor(pts.length / 2)]; e.old = isOld(mx, mz);
    E.set(key, e); edges.push(e); return e;
  };
  const mainJ = R.int(-1, 1), mainI = R.int(-1, 1);
  for (let j = -NJ; j <= NJ; j++) for (let i = -NI; i < NI; i++) { const e = mkEdge(`h${i},${j}`, [i, j], [i + 1, j]); if (j === mainJ) e.kind = "main"; }
  for (let i = -NI; i <= NI; i++) for (let j = -NJ; j < NJ; j++) { const e = mkEdge(`v${i},${j}`, [i, j], [i, j + 1]); if (i === mainI) e.kind = "main"; }
  // blocks merged two by two along the rows (the vertical edge between them gone), never across a main road
  const pMerge = 0.1 + 0.16 * parks + 0.08 * (1 - buildings);
  for (let j = -NJ; j < NJ; j++) {
    let prev = false;
    for (let i = -NI + 1; i < NI; i++) {
      const e = E.get(`v${i},${j}`);
      if (!prev && e.kind !== "main" && R() < pMerge) { e.kind = "none"; prev = true; } else prev = false;
    }
  }
  // the grade along an edge, at its steepest 6 m
  const steepness = (pts) => { let g = 0; const d = densify(pts, 2); for (let k = 3; k < d.length; k++) { const L = dist(d[k], d[k - 3]); if (L > 0.5) g = Math.max(g, Math.abs(hAt(d[k][0], d[k][1]) - hAt(d[k - 3][0], d[k - 3][1])) / L); } return g; };
  for (const e of edges) {
    if (e.kind !== "street") continue;
    if (R() < (e.old ? 0.2 : 0.09)) e.kind = "alley";
    else if (steepness(e.pts) > 0.14) e.kind = "alley";                 // too steep for a street: a footway, its steps (below)
  }
  // the blocks, in grid coordinates (rectangles [i0, i1] × [j0, j1]); an old block now and then split by a passage
  const rects = [];
  for (let j = -NJ; j < NJ; j++) for (let i = -NI; i < NI;) {
    const merge = i + 1 < NI && E.get(`v${i + 1},${j}`).kind === "none";
    const r = { i0: i, i1: i + (merge ? 2 : 1), j0: j, j1: j + 1 }; i = r.i1;
    const corners = [F(r.i0, r.j0), F(r.i1, r.j0), F(r.i0, r.j1), F(r.i1, r.j1)];
    if (corners.every(([x]) => x < -10) || corners.every(([x]) => x > W + 10) || corners.every(([, z]) => z < -10) || corners.every(([, z]) => z > H + 10)) continue;
    const [mx, mz] = F((r.i0 + r.i1) / 2, (r.j0 + r.j1) / 2);
    if (!merge && isOld(mx, mz) && R() < 0.22) {
      const m = mkEdge(`m${i - 1},${j}`, [i - 0.5, j], [i - 0.5, j + 1]); m.kind = "alley";
      rects.push({ i0: r.i0, i1: r.i0 + 0.5, j0: j, j1: j + 1 }, { i0: r.i0 + 0.5, i1: r.i1, j0: j, j1: j + 1 });
    } else rects.push(r);
  }
  const WIDTH = { main: [4.2, 2.8], street: [3.0, 1.8], oldStreet: [2.6, 1.3], alley: [0, 1.7] };
  for (const e of edges) {
    const [car, walk] = e.kind === "main" ? WIDTH.main : e.kind === "alley" ? WIDTH.alley : e.old ? WIDTH.oldStreet : WIDTH.street;
    e.car = car; e.hw = car + walk;
  }

  // ---- the streets on the 1 m grid: each cell's nearest street (by how far inside it is) and its nearest carriageway ----
  const ex = new Float32Array(N).fill(1e9), carD = new Float32Array(N).fill(1e9), eid = new Int32Array(N).fill(-1);
  for (const e of edges) {
    if (e.kind === "none" || e.out) continue;
    const p = e.pts, R_ = e.hw + 1;
    for (let k = 1; k < p.length; k++) {
      const [ax, az] = p[k - 1], [qx, qz] = p[k];
      const x0 = Math.max(0, Math.floor(Math.min(ax, qx) - R_)), x1 = Math.min(W - 1, Math.floor(Math.max(ax, qx) + R_));
      const z0 = Math.max(0, Math.floor(Math.min(az, qz) - R_)), z1 = Math.min(H - 1, Math.floor(Math.max(az, qz) + R_));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const q = z * W + x, d = segD(x + 0.5, z + 0.5, ax, az, qx, qz), v = d - e.hw;
        if (v < ex[q]) { ex[q] = v; eid[q] = e.idx; }
        if (e.car > 0 && d - e.car < carD[q]) carD[q] = d - e.car;
      }
    }
  }
  const street = (q) => ex[q] <= 0;
  onStep("streets", 0.5);

  // stairways: the alleys' steep stretches (grade over 9 %), whole steps from end to end
  const stairs = [];
  for (const e of edges) {
    if (e.kind !== "alley" || e.out) continue;
    const d = densify(e.pts, 1.5);
    let run = null;
    const flush = () => { if (run && polyLen(run) >= 5) stairs.push({ pts: run, w: 2.8, e }); run = null; };
    for (let k = 1; k < d.length; k++) {
      const g = Math.abs(hAt(d[k][0], d[k][1]) - hAt(d[k - 1][0], d[k - 1][1])) / Math.max(0.1, dist(d[k], d[k - 1]));
      if (g > 0.09) { if (!run) run = [d[k - 1]]; run.push(d[k]); } else flush();
    }
    flush();
  }
  for (const s of stairs) {
    // the foot is the lower end
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    if (hAt(a[0], a[1]) > hAt(b[0], b[1])) s.pts.reverse();
  }

  // ---- the blocks: the connected pieces of the ground left between the streets ----
  const comp = new Int32Array(N).fill(-1);
  let ncomp = 0;
  { const stack = new Int32Array(N);
    for (let q0 = 0; q0 < N; q0++) {
      if (street(q0) || comp[q0] >= 0) continue;
      let sp = 0; stack[sp++] = q0; comp[q0] = ncomp;
      while (sp) {
        const q = stack[--sp], x = q % W, z = (q - x) / W;
        if (x > 0 && !street(q - 1) && comp[q - 1] < 0) { comp[q - 1] = ncomp; stack[sp++] = q - 1; }
        if (x < W - 1 && !street(q + 1) && comp[q + 1] < 0) { comp[q + 1] = ncomp; stack[sp++] = q + 1; }
        if (z > 0 && !street(q - W) && comp[q - W] < 0) { comp[q - W] = ncomp; stack[sp++] = q - W; }
        if (z < H - 1 && !street(q + W) && comp[q + W] < 0) { comp[q + W] = ncomp; stack[sp++] = q + W; }
      }
      ncomp++;
    } }
  const compArea = new Int32Array(ncomp); for (let q = 0; q < N; q++) if (comp[q] >= 0) compArea[comp[q]]++;
  const compType = new Array(ncomp).fill(null), compRect = new Array(ncomp).fill(null);
  // each block's kind: the one holding the town's middle a square; parks, a school, other squares; old or suburb by the centre
  const pPark = 0.03 + 0.17 * parks;
  let squareDone = false;
  rects.sort((p, q) => { const a = F((p.i0 + p.i1) / 2, (p.j0 + p.j1) / 2), b = F((q.i0 + q.i1) / 2, (q.j0 + q.j1) / 2);
    return ((a[0] - tcx) ** 2 + (a[1] - tcz) ** 2) - ((b[0] - tcx) ** 2 + (b[1] - tcz) ** 2); });
  for (const r of rects) {
    const c = F((r.i0 + r.i1) / 2, (r.j0 + r.j1) / 2);
    r.c = c;
    // its block on the grid: the cell at its middle, else (a block cut by the map's edge) the first block cell met going in
    let k = -1;
    for (let t = 0; t <= 12 && k < 0; t++) {
      const x = Math.max(2, Math.min(W - 3, lerp(c[0], cx, t / 12))), z = Math.max(2, Math.min(H - 3, lerp(c[1], cz, t / 12))), kk = comp[cellOf(x, z)];
      if (kk >= 0 && !compRect[kk] && (t === 0 || dist([x, z], c) < 0.6 * Math.max(bx, by) * (r.i1 - r.i0 + 1))) k = kk;
    }
    if (k < 0) { r.type = "skip"; continue; }
    compRect[k] = r; r.comp = k;
    const old = isOld(c[0], c[1]), big = compArea[k] > 2600;
    const roll = R();
    if (!squareDone && compArea[k] > 1200) { r.type = "square"; squareDone = true; }
    else if (roll < pPark * (r.i1 - r.i0 > 1 ? 2 : 1) && big) r.type = "park";
    else if (old && roll > 0.93) r.type = "square";
    else if (!old && roll > 0.955 && big) r.type = "school";
    else if (!old && roll > 0.9 - 0.3 * (1 - gardens) && compArea[k] > 1800) r.type = "estate";
    else r.type = old ? "old" : "suburb";
    compType[k] = r.type;
  }
  onStep("streets", 1);

  // ---- along the blocks' sides: the front lines (the street's edge, offset into the block) ----
  onStep("buildings", 0);
  const sidesOf = (r) => {
    const out = [], hp = (gj) => { for (let a = r.i0; a < r.i1 - 1e-9;) { const b = Math.min(r.i1, Math.floor(a + 1e-9) + 1); out.push({ e: E.get(`h${Math.floor(a + 1e-9)},${gj}`), a: [a, gj], b: [b, gj] }); a = b; } };
    const vp = (gi) => out.push({ e: Number.isInteger(gi) ? E.get(`v${gi},${r.j0}`) : E.get(`m${gi - 0.5},${r.j0}`), a: [gi, r.j0], b: [gi, r.j1] });
    hp(r.j0); vp(r.i1); hp(r.j1); vp(r.i0);
    return out.filter((s) => s.e && s.e.kind !== "none");
  };
  /** A side's line `off` m into the block from the street's axis: { P (points), N (inward normals), s (arc length) }. */
  const frontLine = (side, r, off) => {
    const [ax, az] = F(...side.a), [qx, qz] = F(...side.b), n = Math.max(2, Math.ceil(Math.sqrt((qx - ax) ** 2 + (qz - az) ** 2) * 1.05));
    const C0 = [], P = [], NN = [], s = [0];
    for (let k = 0; k <= n; k++) C0.push(F(lerp(side.a[0], side.b[0], k / n), lerp(side.a[1], side.b[1], k / n)));
    for (let k = 0; k <= n; k++) {
      const a = C0[Math.max(0, k - 1)], b = C0[Math.min(n, k + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.sqrt(tx * tx + tz * tz) || 1; tx /= l; tz /= l;
      let nx_ = -tz, nz_ = tx;
      if (nx_ * (r.c[0] - C0[k][0]) + nz_ * (r.c[1] - C0[k][1]) < 0) { nx_ = -nx_; nz_ = -nz_; }
      NN.push([nx_, nz_]); P.push([C0[k][0] + nx_ * off, C0[k][1] + nz_ * off]);
      if (k) s.push(s[k - 1] + dist(P[k], P[k - 1]));
    }
    return { P, N: NN, s, L: s[s.length - 1] };
  };
  const at = (fl, s) => {
    let k = 1; while (k < fl.s.length - 1 && fl.s[k] < s) k++;
    const t = Math.max(0, Math.min(1, (s - fl.s[k - 1]) / ((fl.s[k] - fl.s[k - 1]) || 1)));
    let nx_ = lerp(fl.N[k - 1][0], fl.N[k][0], t), nz_ = lerp(fl.N[k - 1][1], fl.N[k][1], t); const l = Math.sqrt(nx_ * nx_ + nz_ * nz_) || 1;
    return [lerp(fl.P[k - 1][0], fl.P[k][0], t), lerp(fl.P[k - 1][1], fl.P[k][1], t), nx_ / l, nz_ / l];
  };
  const occ = new Int32Array(N);                     // a building's run id + 1
  const eachCell = (ring, margin, fn) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of ring) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    for (let z = Math.max(0, Math.floor(z0 - margin)); z <= Math.min(H - 1, Math.floor(z1 + margin)); z++)
      for (let x = Math.max(0, Math.floor(x0 - margin)); x <= Math.min(W - 1, Math.floor(x1 + margin)); x++) {
        const px = x + 0.5, pz = z + 0.5;
        if (inPoly(ring, px, pz) || (margin > 0 && lineD([...ring, ring[0]], px, pz) < margin)) if (fn(z * W + x) === false) return false;
      }
    return true;
  };
  // a house fits when its footprint stays off the street and in its block, and keeps 0.45 m from the other buildings
  const fits = (quad, comp_, own) => quad.every(([x, z]) => x > 1 && z > 1 && x < W - 1 && z < H - 1)
    && eachCell(quad, 0, (q) => (ex[q] > -0.2 && comp[q] === comp_) || false)
    && eachCell(quad, 0.45, (q) => !occ[q] || occ[q] === own + 1 || false);
  const runs = [], houses = [];
  const addRun = (kind) => { const r = { id: runs.length, kind, F: [], B: [], houses: [] }; runs.push(r); return r; };
  const putHouse = (run, F0, F1, B1, B0, o) => {
    const h = { run: run.id, F0, F1, B1, B0, ...o }; houses.push(h); run.houses.push(h);
    if (!run.F.length) { run.F.push(F0); run.B.push(B0); }
    run.F.push(F1); run.B.push(B1);
    eachCell([F0, F1, B1, B0], 0, (q) => { occ[q] = run.id + 1; });
  };
  // a house's look: its floors, roof and colours
  const look = (old, rnd, opts = {}) => {
    const levels = opts.levels ?? (old ? rnd.int(2, 2 + Math.round(1 + 1.4 * buildings)) : rnd.int(1, 2));
    const fh = rnd.range(2.85, 3.15), mat = opts.mat ?? (rnd() < (old ? 0.12 : 0.18) ? 3 : old && rnd() < 0.1 ? 1 : 0);
    const col = mat === 3 ? BRICK : mat === 1 ? STONE : PLASTER[rnd.int(0, PLASTER.length - 1)];
    const slate = opts.slate ?? rnd() < (old ? 0.4 : 0.25);
    return { levels, fh, eave: levels * fh + 0.4, mat, col, roof: opts.roof || "gable", pitch: opts.pitch ?? rnd.range(0.55, 0.85),
      rmat: slate ? 1 : 0, rcol: slate ? SLATES[rnd.int(0, SLATES.length - 1)] : TILES[rnd.int(0, TILES.length - 1)], sty: opts.sty ?? 0, seed: rnd() };
  };
  const walls3 = [], mapLines = [], hedges = [], props = [], trees = [], features = [], chimneys = [], cars = [];
  const lineObj = (sym, pts) => { if (pts.length > 1 && polyLen(pts) >= 2) mapLines.push({ sym, otp: 2, pts }); };
  // a line along a front line, cut where it would cross a street, a building or leave the block (each point judged by the cell
  // 0.7 m inside it: the line itself runs along the street's edge, where the cells' centres fall either side)
  const cutLine = (fl, compK, from = 0, to = fl.L, okCell = null) => {
    const out = []; let cur = [];
    for (let s = from; s <= to + 1e-6; s += 1) {
      const [x, z, nx_, nz_] = at(fl, Math.min(s, to)), ix = x + nx_ * 0.7, iz = z + nz_ * 0.7, q = inside(ix, iz) ? cellOf(ix, iz) : -1;
      const ok = q >= 0 && ex[q] > 0.15 && comp[q] === compK && !occ[q] && (!okCell || okCell(q));
      if (ok) cur.push([x, z]); else { if (cur.length > 2) out.push(cur); cur = []; }
    }
    if (cur.length > 2) out.push(cur);
    return out;
  };

  for (const r of rects) {
    if (r.type !== "old" && r.type !== "suburb") continue;
    const rnd = prng((seed * 31 + Math.round(r.i0 * 2) * 977 + Math.round(r.j0) * 7919) >>> 0), old = r.type === "old";
    r.court = old && rnd() > 0.45 + 0.4 * gardens;      // the old block's inner court: public paving (else private gardens)
    const fence = old ? null : ["hedge", "wall", "fence", "none"][rnd.int(0, 3)];
    const setback = old ? 0.1 : rnd.range(4, 7);
    for (const side of sidesOf(r)) {
      const fl = frontLine(side, r, side.e.hw + setback);
      let s = 0, run = null, depth = 0;
      const main = side.e.kind === "main";
      while (s < fl.L - 5) {
        let w = old ? rnd.range(6, 12) : rnd.range(9, 13);
        if (s + w > fl.L) w = fl.L - s;
        if (w < (old ? 5 : 8)) break;
        if (!run) depth = old ? rnd.range(9, 14) : rnd.range(8, 11);
        const [x0, z0, n0x, n0z] = at(fl, s), [x1, z1, n1x, n1z] = at(fl, s + w);
        const F0 = [x0, z0], F1 = [x1, z1], B0 = [x0 + n0x * depth, z0 + n0z * depth], B1 = [x1 + n1x * depth, z1 + n1z * depth];
        if (fits([F0, F1, B1, B0], r.comp, run ? run.id : -2)) {
          if (!run) run = addRun(old ? "terrace" : "house");
          putHouse(run, F0, F1, B1, B0, look(old, rnd, { sty: old && (main || side.e.kind === "street") && rnd() < 0.35 ? 1 : 0 }));
          s += w;
          if (!old || rnd() < 0.28 - 0.22 * buildings) { run = null; s += old ? rnd.range(3, 6) : rnd.range(4, 6) + 8 * (1 - buildings); }
        } else { run = null; s += 1.5; }
      }
      // a suburb's garden boundary along the street, and fences between the gardens (3D only: the gardens are not entered)
      if (!old && fence !== "none") {
        const bl = frontLine(side, r, side.e.hw + (fence === "hedge" ? 0.95 : 0.35));
        for (const pts of cutLine(bl, r.comp)) {
          const p = simplify(pts, 0.15);
          if (fence === "hedge") { hedges.push(p); walls3.push({ pts: p, kind: "hedge", h: 1.6, imp: true }); }
          else if (fence === "wall") { lineObj(513001, p); walls3.push({ pts: p, kind: "wall", h: 1.0, imp: true }); }
          else { lineObj(516000, p); walls3.push({ pts: p, kind: "fence", h: 1.2, imp: true }); }
        }
      }
    }
  }
  // fences between neighbouring gardens (3D only), at the middle of the gap between two detached houses on one side
  for (let k = 1; k < houses.length; k++) {
    const a = houses[k - 1], b = houses[k];
    if (runs[a.run].kind !== "house" || runs[b.run].kind !== "house") continue;
    const g = dist(a.F1, b.F0); if (g > 16 || g < 2) continue;
    const m = [(a.F1[0] + b.F0[0]) / 2, (a.F1[1] + b.F0[1]) / 2], mb = [(a.B1[0] + b.B0[0]) / 2, (a.B1[1] + b.B0[1]) / 2];
    const dx = mb[0] - m[0], dz = mb[1] - m[1], l = Math.sqrt(dx * dx + dz * dz) || 1;
    const p0 = [m[0] - (dx / l) * 4, m[1] - (dz / l) * 4], p1 = [mb[0] + (dx / l) * 6, mb[1] + (dz / l) * 6];
    if (inside(p0[0], p0[1]) && inside(p1[0], p1[1]) && ex[cellOf(p0[0], p0[1])] > 0.5) walls3.push({ pts: [p0, p1], kind: hashU(k, 3, seed) < 0.5 ? "hedge" : "fence", h: 1.5, imp: true });
  }
  onStep("buildings", 0.6);

  // ---- squares, parks and schools ----
  const plazas = [], paths = [], ponds = [], fences = [], walks = [];
  for (const r of rects) {
    if (r.type !== "square" && r.type !== "park" && r.type !== "school" && r.type !== "estate") continue;
    const rnd = prng((seed * 17 + Math.round(r.i0 * 2) * 1597 + Math.round(r.j0) * 3571) >>> 0);
    const sides = sidesOf(r).map((side) => ({ side, fl: frontLine(side, r, side.e.hw + 0.1) })).sort((p, q) => q.fl.L - p.fl.L);
    if (!sides.length) continue;
    if (r.type === "square") {
      // the church on the square's longest side, its monument or fountain in the middle, trees round it
      const { side } = sides[0], fl = frontLine(side, r, side.e.hw + 1.2);
      if (fl.L > 34 && rnd() < 0.75) {
        const w = Math.min(22, fl.L * 0.55), s0 = (fl.L - w) / 2, depth = rnd.range(26, 34);
        const [x0, z0, n0x, n0z] = at(fl, s0), [x1, z1, n1x, n1z] = at(fl, s0 + w);
        const quad = [[x0, z0], [x1, z1], [x1 + n1x * depth, z1 + n1z * depth], [x0 + n0x * depth, z0 + n0z * depth]];
        if (fits(quad, r.comp, -2)) putHouse(addRun("church"), ...quad, look(true, rnd, { levels: 1, sty: 2, mat: 1, slate: true, pitch: 1.0 }));
        const run = runs[runs.length - 1]; if (run?.kind === "church") { const hh = run.houses[0]; hh.eave = rnd.range(10, 13); hh.fh = 0; }
      }
      // the monument at the middle of the square's free ground
      let sx = 0, sz = 0, n = 0;
      for (let q = 0; q < N; q++) if (comp[q] === r.comp && !occ[q]) { sx += q % W; sz += Math.floor(q / W); n++; }
      if (n) {
        let mx = sx / n + 0.5, mz = sz / n + 0.5;
        if (occ[cellOf(mx, mz)]) [mx, mz] = r.c;
        if (!occ[cellOf(mx, mz)]) {
          const kind = rnd() < 0.5 ? "fountain" : "monument";
          props.push([kind === "fountain" ? "fountain" : "memorial", mx, mz, 0]);
          mapLines.push({ sym: kind === "fountain" ? 311000 : 526000, otp: 1, pts: [[mx, mz]] });
          features.push({ k: kind, x: mx + (kind === "fountain" ? 2.2 : 1.6), z: mz, obj: [mx, mz] });
          plazas.push({ x: mx, z: mz, r: 4 });
        }
      }
      // trees along the square's sides
      for (const { side } of sides) {
        const tl = frontLine(side, r, side.e.hw + 3.5);
        for (let s = 6; s < tl.L - 6; s += 11) {
          const [x, z] = at(tl, s), q = cellOf(x, z);
          if (!inside(x, z) || comp[q] !== r.comp || occ[q] || rnd() < 0.3) continue;
          trees.push([x, z, rnd.range(8, 11), 2.8, "small"]);
        }
      }
    } else if (r.type === "park") {
      // gravel paths from each side's middle to a round place in the park's middle
      const [mx, mz] = r.c, ends = [];
      for (const { side } of sides) {
        const fl = frontLine(side, r, side.e.hw + 0.4);
        if (fl.L < 20) continue;
        const [x, z] = at(fl, fl.L * rnd.range(0.35, 0.65));
        if (!inside(x, z) || comp[cellOf(x, z)] !== r.comp) continue;
        const mid = [(x + mx) / 2 + rnd.range(-6, 6), (z + mz) / 2 + rnd.range(-6, 6)];
        const p = chaikin([[x, z], mid, [mx, mz]], 2);
        paths.push({ pts: p, comp: r.comp }); ends.push([x, z]);
      }
      plazas.push({ x: mx, z: mz, r: 6, comp: r.comp });
      const kind = rnd() < 0.5 ? "fountain" : "monument";
      props.push([kind === "fountain" ? "fountain" : "memorial", mx, mz, 0]);
      mapLines.push({ sym: kind === "fountain" ? 311000 : 526000, otp: 1, pts: [[mx, mz]] });
      features.push({ k: kind, x: mx + 2.2, z: mz, obj: [mx, mz] });
      // a pond in a large park, away from the paths
      if (compArea[r.comp] > 5000 && rnd() < 0.55) {
        for (let t = 0; t < 30; t++) {
          const px = mx + rnd.range(-0.35, 0.35) * bx * (r.i1 - r.i0), pz = mz + rnd.range(-0.3, 0.3) * by;
          const a = rnd.range(8, 14), b = a * rnd.range(0.55, 0.8);
          if (!inside(px, pz) || comp[cellOf(px, pz)] !== r.comp) continue;
          if (paths.some((p) => lineD(p.pts, px, pz) < a + 5) || dist([px, pz], [mx, mz]) < a + 9) continue;
          let ok = true; for (let k = 0; k < 16 && ok; k++) { const qx = px + a * ((k % 4) / 1.5 - 1), qz = pz + b * (Math.floor(k / 4) / 1.5 - 1); if (!inside(qx, qz) || comp[cellOf(qx, qz)] !== r.comp || ex[cellOf(qx, qz)] < 6) ok = false; }
          if (ok) { ponds.push({ x: px, z: pz, a, b, ux, uz }); break; }
        }
      }
      // a fence round it (often), gates where the paths come in
      if (rnd() < 0.55) {
        for (const { side } of sides) {
          const fl = frontLine(side, r, side.e.hw + 0.6);
          for (const pts of cutLine(fl, r.comp, 0, fl.L, (q) => !ends.some((e) => dist(e, [q % W + 0.5, Math.floor(q / W) + 0.5]) < 2))) {
            const p = simplify(pts, 0.15); if (polyLen(p) < 4) continue;
            fences.push(p); lineObj(518000, p); walls3.push({ pts: p, kind: "fence", h: 1.8, imp: true });
          }
        }
      }
      // benches along the paths
      for (const p of paths.filter((p) => p.comp === r.comp)) {
        const d = densify(p.pts, 1);
        for (let k = 8; k < d.length - 6; k += 18) {
          if (rnd() < 0.45) continue;
          const a = d[k - 1], b = d[k + 1], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
          const x = d[k][0] - (tz / l) * 2.2, z = d[k][1] + (tx / l) * 2.2;
          props.push(["bench", x, z, (Math.atan2(tx, tz) * 180) / Math.PI]);
        }
      }
    } else if (r.type === "estate") {
      // a housing estate: blocks of flats on open lawns, a paved footway from each to the street
      const slabs = [];
      for (let t = 0; t < 70 && slabs.length < 6; t++) {
        const gi = lerp(r.i0, r.i1, rnd.range(0.15, 0.85)), gj = lerp(r.j0, r.j1, rnd.range(0.2, 0.8));
        const [x, z] = F(gi, gj), along = rnd() < 0.7, L = rnd.range(26, 46), D = rnd.range(11, 13);
        const ax = along ? ux : vx, az = along ? uz : vz, bx_ = -az, bz_ = ax;
        const quad = [[x - ax * L / 2 - bx_ * D / 2, z - az * L / 2 - bz_ * D / 2], [x + ax * L / 2 - bx_ * D / 2, z + az * L / 2 - bz_ * D / 2],
          [x + ax * L / 2 + bx_ * D / 2, z + az * L / 2 + bz_ * D / 2], [x - ax * L / 2 + bx_ * D / 2, z - az * L / 2 + bz_ * D / 2]];
        if (!fits(quad, r.comp, -2) || !eachCell(quad, 4, (q) => ex[q] > 0 || false) || !eachCell(quad, 9, (q) => !occ[q] || false)) continue;
        putHouse(addRun("flats"), ...quad, look(false, rnd, { levels: rnd.int(3, 5), roof: "flat", mat: rnd() < 0.3 ? 3 : 0 }));
        slabs.push({ x, z, bx: bx_, bz: bz_, D });
      }
      // a footway from each building's long side, straight out to the street
      for (const sl of slabs) {
        const sg = rnd() < 0.5 ? 1 : -1, p0 = [sl.x + sl.bx * sg * (sl.D / 2), sl.z + sl.bz * sg * (sl.D / 2)], pts = [p0];
        for (let d = 1; d < 70; d++) {
          const x = p0[0] + sl.bx * sg * d, z = p0[1] + sl.bz * sg * d;
          if (!inside(x, z)) break;
          const q = cellOf(x, z); pts.push([x, z]);
          if (ex[q] <= 0 || (occ[q] && d > 2)) break;
        }
        if (pts.length > 2 && ex[cellOf(...pts[pts.length - 1])] <= 0) walks.push({ pts, comp: r.comp });
      }
    } else {
      // a school: its building set back on the longest side, a paved yard, a wall round it with a gate or two
      const { side } = sides[0], fl = frontLine(side, r, side.e.hw + 6);
      const w = Math.min(56, fl.L * 0.7), s0 = (fl.L - w) / 2, depth = rnd.range(14, 18);
      const [x0, z0, n0x, n0z] = at(fl, s0), [x1, z1, n1x, n1z] = at(fl, s0 + w);
      const quad = [[x0, z0], [x1, z1], [x1 + n1x * depth, z1 + n1z * depth], [x0 + n0x * depth, z0 + n0z * depth]];
      if (fits(quad, r.comp, -2)) putHouse(addRun("school"), ...quad, look(false, rnd, { levels: rnd.int(2, 3), roof: "flat", mat: 3, sty: 0 }));
      let gates = 0;
      sides.forEach(({ side: sd }, k) => {
        const bl = frontLine(sd, r, sd.e.hw + 0.4);
        const g = k === 0 || rnd() < 0.45 ? bl.L * rnd.range(0.3, 0.7) : -99;
        for (const pts of cutLine(bl, r.comp, 0, bl.L)) {
          // the gate: a 4 m gap
          const pieces = []; let cur = [];
          for (const p of pts) { const near = g > 0 && dist(p, at(bl, g)) < 2; if (near) { if (cur.length > 1) pieces.push(cur); cur = []; } else cur.push(p); }
          if (cur.length > 1) pieces.push(cur);
          if (pieces.length > 1) gates++;
          for (const pc of pieces) {
            const p = simplify(pc, 0.15); if (polyLen(p) < 3) continue;
            lineObj(515000, p); fences.push(p); walls3.push({ pts: p, kind: "wall", h: 1.9, imp: true });
            // a wall's end at the gate: the flag beside it, on the street's side
            for (const [e, f] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
              if (pieces.length < 2 || dist(e, at(bl, g)) > 3) continue;
              const tx = e[0] - f[0], tz = e[1] - f[1], l = Math.sqrt(tx * tx + tz * tz) || 1, [, , nnx, nnz] = at(bl, g);
              features.push({ k: "wallend", x: e[0] + (tx / l) * 0.5 - nnx * 1.1, z: e[1] + (tz / l) * 0.5 - nnz * 1.1, obj: e });
            }
          }
        }
      });
      void gates;
    }
  }
  onStep("buildings", 1);

  // ---- the ground classes and surfaces ----
  onStep("classes", 0);
  const cls = new Uint8Array(N).fill(C.oob), surf = new Uint8Array(N).fill(SURF.grass);
  const ground = new Uint8Array(N);                  // the map's ground under each cell: 0 olive, 1 paved, 2 lawn, 3 white (wood), 4 shrubs, 5 water
  const isCourt = (k) => compRect[k]?.court;
  const woods = noiseField(W / 4 + 1, H / 4 + 1, 4, [[40, 1], [14, 0.4]], seed + 404), shrub = noiseField(W / 4 + 1, H / 4 + 1, 4, [[22, 1], [8, 0.35]], seed + 505);
  const n4 = (F_, x, z) => F_[Math.floor(z / 4) * (W / 4 + 1) + Math.floor(x / 4)];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const q = z * W + x;
    if (street(q)) {
      const e = edges[eid[q]];
      if (carD[q] <= 0 && e.kind !== "alley") { cls[q] = C.road; surf[q] = SURF.asphalt; }
      else { cls[q] = C.paved; surf[q] = e.kind === "alley" || e.old ? SURF.setts : SURF.concrete; }
      ground[q] = 1; continue;
    }
    const k = comp[q], t = k >= 0 ? compType[k] : null;
    if (t === "square") { cls[q] = C.paved; surf[q] = SURF.setts; ground[q] = 1; }
    else if (t === "estate") { cls[q] = C.open; surf[q] = SURF.grass; ground[q] = 2; }
    else if (t === "school") { cls[q] = C.paved; surf[q] = SURF.concrete; ground[q] = 1; }
    else if (t === "park") {
      const w = n4(woods, x, z), sb = n4(shrub, x, z);
      if (w > 0.32) { cls[q] = C.forest; surf[q] = SURF.floor; ground[q] = 3; }
      else if (sb > 0.62) { cls[q] = C.slow; surf[q] = SURF.grass; ground[q] = 4; }
      else { cls[q] = C.open; surf[q] = SURF.grass; ground[q] = 2; }
    } else if (t === "old" && isCourt(k)) { cls[q] = C.paved; surf[q] = SURF.setts; ground[q] = 1; }
    else { cls[q] = C.oob; surf[q] = SURF.grass; ground[q] = 0; }
  }
  // stairways, park paths and places, ponds
  const stamp = (pts, r, fn) => { for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [qx, qz] = pts[k];
    for (let z = Math.max(0, Math.floor(Math.min(az, qz) - r)); z <= Math.min(H - 1, Math.floor(Math.max(az, qz) + r)); z++)
      for (let x = Math.max(0, Math.floor(Math.min(ax, qx) - r)); x <= Math.min(W - 1, Math.floor(Math.max(ax, qx) + r)); x++)
        if (segD(x + 0.5, z + 0.5, ax, az, qx, qz) <= r) fn(z * W + x); } };
  for (const s of stairs) stamp(s.pts, s.w / 2, (q) => { if (street(q)) { cls[q] = C.stairs; surf[q] = SURF.setts; } });
  for (const p of paths) stamp(p.pts, 1.3, (q) => { if (comp[q] === p.comp && !occ[q]) { cls[q] = C.path; surf[q] = SURF.gravel; ground[q] = 2; } });
  for (const p of walks) stamp(p.pts, 1.2, (q) => { if (comp[q] === p.comp && !occ[q]) { cls[q] = C.paved; surf[q] = SURF.concrete; ground[q] = 1; } });
  for (const p of plazas) if (p.comp != null) stamp([[p.x, p.z], [p.x + 0.01, p.z]], p.r, (q) => { if (comp[q] === p.comp && !occ[q]) { cls[q] = C.paved; surf[q] = SURF.setts; ground[q] = 1; } });
  const inPond = (p, x, z) => { const dx = x - p.x, dz = z - p.z, a_ = (dx * p.ux + dz * p.uz) / p.a, b_ = (-dx * p.uz + dz * p.ux) / p.b; return a_ * a_ + b_ * b_ <= 1; };
  for (const p of ponds) for (let z = Math.floor(p.z - p.a - 1); z <= p.z + p.a + 1; z++) for (let x = Math.floor(p.x - p.a - 1); x <= p.x + p.a + 1; x++)
    if (inside(x, z) && inPond(p, x + 0.5, z + 0.5)) { const q = z * W + x; cls[q] = C.water; surf[q] = SURF.water; ground[q] = 5; }
  // what the runner cannot cross: fences, walls, hedges (lines), the buildings (their cells: the town's outlines stop the runner)
  for (const p of fences) stamp(p, 0.75, (q) => { if (!street(q)) cls[q] = C.block; });
  for (const p of hedges) stamp(p, 0.8, (q) => { if (!street(q)) { cls[q] = C.block; } });
  for (let q = 0; q < N; q++) if (occ[q]) { cls[q] = C.building; surf[q] = SURF.building; }
  // ground nobody reaches from the streets is « shall not be entered » (a court shut in by houses, a corner of a park behind its fence)
  { const seen = new Uint8Array(N), stack = new Int32Array(N); let sp = 0;
    for (let q = 0; q < N; q++) if (cls[q] === C.road) { seen[q] = 1; stack[sp++] = q; }
    const SP_ = CL.map((n) => SPEED[n] || 0), go = (q) => SP_[cls[q]] > 0;
    const visit = (n) => { if (!seen[n] && go(n)) { seen[n] = 1; stack[sp++] = n; } };
    while (sp) {
      const q = stack[--sp], x = q % W;
      if (x > 0) visit(q - 1); if (x < W - 1) visit(q + 1); if (q >= W) visit(q - W); if (q < N - W) visit(q + W);
    }
    for (let q = 0; q < N; q++) if (!seen[q] && go(q) && cls[q] !== C.water) { cls[q] = C.oob; surf[q] = SURF.grass; ground[q] = 0; }
  }
  onStep("classes", 1);

  // ---- street furniture, cars, street trees, the parks' trees ----
  onStep("ground", 0);
  const kerbs = [];
  for (const e of edges) {
    if (e.kind === "none" || e.kind === "alley" || e.out) continue;
    const d = densify(e.pts, 1);
    for (const sgn of [1, -1]) {
      let cur = []; const pieces = [];
      for (let k = 0; k < d.length; k++) {
        const a = d[Math.max(0, k - 1)], b = d[Math.min(d.length - 1, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
        const nx_ = (-tz / l) * sgn, nz_ = (tx / l) * sgn, px = d[k][0] + nx_ * e.car, pz = d[k][1] + nz_ * e.car;
        const qo = [px + nx_ * 0.7, pz + nz_ * 0.7], qi = [px - nx_ * 0.7, pz - nz_ * 0.7];
        const ok = inside(qo[0], qo[1]) && inside(qi[0], qi[1]) && carD[cellOf(...qo)] > 0 && ex[cellOf(...qo)] <= 0 && carD[cellOf(...qi)] <= 0 && eid[cellOf(...qo)] === e.idx;
        if (ok) cur.push([px, pz, nx_, nz_, k]); else { if (cur.length > 3) pieces.push(cur); cur = []; }
      }
      if (cur.length > 3) pieces.push(cur);
      for (const pc of pieces) {
        const line = pc.map(([x, z]) => [x, z]);
        kerbs.push(line);
        const p = simplify(line, 0.12);
        mapLines.push({ sym: 501001, otp: 2, pts: p });
        walls3.push({ pts: p, kind: "kerb", h: 0.13, imp: false });
        // lamps on the sidewalk, parked cars by the kerb, trees along the main roads
        for (let k = 3; k < pc.length - 3; k++) {
          const [x, z, nx_, nz_, kk] = pc[k];
          if (kk % 27 === (sgn > 0 ? 3 : 16)) props.push(["lamp", x + nx_ * 0.45, z + nz_ * 0.45, (Math.atan2(-nx_, -nz_) * 180) / Math.PI]);
          if (e.kind === "main" && kk % 11 === 6) trees.push([x + nx_ * 1.6, z + nz_ * 1.6, 9 + 3 * hashU(kk, sgn, seed), 2.6, "street"]);
          if (e.kind === "street" && k > 6 && k < pc.length - 6 && kk % 6 === 0 && hashU(kk, e.idx * 2 + (sgn > 0 ? 1 : 0), seed) < 0.38) {
            const a = pc[k - 1], b = pc[k + 1], tx = b[0] - a[0], tz = b[1] - a[1];
            cars.push([x - nx_ * 1.05, z - nz_ * 1.05, (Math.atan2(tx, tz) * 180) / Math.PI, 3.8 + 0.8 * hashU(kk, 7, seed), 1.8, Math.floor(hashU(kk, e.idx, seed) * CAR_COLOURS.length)]);
          }
          if (kk % 41 === 20 && hashU(kk, e.idx, seed + 1) < 0.5) props.push([["bin", "postbox", "bollard", "bikes"][Math.floor(hashU(kk, e.idx, seed + 2) * 4)], x + nx_ * 0.9, z + nz_ * 0.9, (Math.atan2(-nx_, -nz_) * 180) / Math.PI]);
        }
      }
    }
  }
  // the parks' lone trees and bushes, on their lawns
  for (let z = 4; z < H - 4; z += 9) for (let x = 4; x < W - 4; x += 9) {
    const px = x + 6 * hashU(x, z, seed + 9), pz = z + 6 * hashU(z, x, seed + 10), q = cellOf(px, pz);
    if (cls[q] !== C.open) continue;
    if (paths.some((p) => p.comp === comp[q] && lineD(p.pts, px, pz) < 3.5)) continue;
    const r = hashU(x, z, seed + 11);
    if (r < 0.28) trees.push([px, pz, 13 + 8 * hashU(x, z, seed + 12), 4.5, "big"]);
    else if (r < 0.36) trees.push([px, pz, 3.5, 1.5, "bush"]);
  }
  // keep trees apart (their symbols must not touch: 3.5 m between big ones), and off what is built
  const keptTrees = [];
  for (const t of trees) {
    const q = inside(t[0], t[1]) ? cellOf(t[0], t[1]) : -1;
    if (q < 0 || cls[q] === C.building || cls[q] === C.block || cls[q] === C.water || cls[q] === C.road) continue;
    const gap = t[4] === "big" ? 7 : 4.5;
    if (keptTrees.some((u) => Math.abs(u[0] - t[0]) < gap && Math.abs(u[1] - t[1]) < gap && dist(u, t) < gap)) continue;
    keptTrees.push(t);
  }
  for (const t of keptTrees) {
    if (t[4] === "big") { mapLines.push({ sym: 417000, otp: 1, pts: [[t[0], t[1]]] }); features.push({ k: "bigtree", x: t[0] + 1.4, z: t[1], obj: [t[0], t[1]] }); }
    else if (t[4] === "bush") { mapLines.push({ sym: 418000, otp: 1, pts: [[t[0], t[1]]] }); features.push({ k: "bush", x: t[0] + 1.0, z: t[1], obj: [t[0], t[1]] }); }
    else mapLines.push({ sym: 418000, otp: 1, pts: [[t[0], t[1]]] });
  }

  // ---- vegetation densities, the ground's picture (2 px a metre) ----
  const veg = new Uint8Array(N * 3);
  for (let q = 0; q < N; q++) {
    const c = cls[q], v = hashU(q, 1, seed);
    if (c === C.forest) { veg[q * 3] = Math.round((1 / 40) * VEG_K[0]); veg[q * 3 + 1] = Math.round((1 / 300) * VEG_K[1]); veg[q * 3 + 2] = Math.round((1 / 30) * VEG_K[2]); }
    else if (c === C.slow) { veg[q * 3 + 1] = Math.round((1 / 7) * VEG_K[1]); veg[q * 3 + 2] = Math.round((1 / 6) * VEG_K[2]); }
    else if (c === C.open) veg[q * 3 + 2] = Math.round((1 / 20) * VEG_K[2]);
    else if (c === C.oob) {                      // the gardens: a tree here and there, shrubs, grass
      veg[q * 3] = v < 0.5 ? Math.round((1 / 380) * VEG_K[0]) : 0; veg[q * 3 + 1] = Math.round((1 / 70) * VEG_K[1]); veg[q * 3 + 2] = Math.round((1 / 16) * VEG_K[2]);
    }
  }
  const gres = 2, GWp = W * gres, GHp = H * gres, img = new Uint8ClampedArray(GWp * GHp * 4);
  const COLS = { [SURF.asphalt]: [74, 75, 78], [SURF.setts]: [138, 126, 112], [SURF.concrete]: [156, 153, 146], [SURF.grass]: [98, 124, 64],
    [SURF.gravel]: [176, 164, 136], [SURF.floor]: [92, 84, 60], [SURF.water]: [52, 74, 86], [SURF.building]: [112, 108, 102] };
  const bil4 = (A, x, z) => { const nx4 = W / 4 + 1, fx = x / 4, fz = z / 4, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * nx4 + i;
    return A[o] * (1 - u) * (1 - v) + A[o + 1] * u * (1 - v) + A[o + nx4] * (1 - u) * v + A[o + nx4 + 1] * u * v; };
  const bil = (A, x, z) => {
    const fx = Math.max(0, Math.min(W - 1.0001, x - 0.5)), fz = Math.max(0, Math.min(H - 1.0001, z - 0.5)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, o = j * W + i;
    return A[o] * (1 - u) * (1 - v) + A[o + 1] * u * (1 - v) + A[o + W] * (1 - u) * v + A[o + W + 1] * u * v;
  };
  // a broad variation of the ground's tone (every 4 m, bilinear)
  const tone = noiseField(W / 4 + 1, H / 4 + 1, 4, [[9, 0.06]], seed + 22);
  const OLIVE = [88, 116, 58], HEDGE = [44, 64, 34], STEPS = [150, 146, 138];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const q = z * W + x, c = cls[q], s0 = surf[q], hu = hashU(x, z, seed + 21);
    const tn = 0.9 + bil4(tone, x + 0.5, z + 0.5);
    // the streets' edges drawn smooth (the carriageway and the street's own edge from their distances), each half metre
    const edge = (c === C.road || c === C.paved) && (Math.abs(ex[q]) < 1.5 || Math.abs(carD[q]) < 1.5);
    const e = edge ? edges[eid[q]] : null;
    for (let sz = 0; sz < gres; sz++) for (let sx = 0; sx < gres; sx++) {
      let s = s0;
      if (edge) {
        const fx = x + (sx + 0.5) / gres, fz = z + (sz + 0.5) / gres, e2 = bil(ex, fx, fz), c2 = bil(carD, fx, fz);
        if (e2 <= 0) s = c2 <= 0 && e?.kind !== "alley" ? SURF.asphalt : e?.kind === "alley" || e?.old ? SURF.setts : SURF.concrete;
      }
      const col = c === C.oob ? OLIVE : c === C.block ? HEDGE : c === C.stairs ? STEPS : COLS[s] || COLS[SURF.grass];
      const n = tn + 0.2 * hu * (s === SURF.asphalt ? 0.4 : 1);
      const o = ((z * gres + sz) * GWp + x * gres + sx) * 4;
      img[o] = col[0] * n; img[o + 1] = col[1] * n; img[o + 2] = col[2] * n; img[o + 3] = 255;
    }
  }
  // a dashed white line down the main roads
  for (const e of edges) {
    if (e.kind !== "main" || e.out) continue;
    const d = densify(e.pts, 0.5);
    for (let k = 0; k < d.length; k++) {
      if (k % 12 >= 6) continue;
      const [x, z] = d[k], ppx = Math.floor(x * gres), ppz = Math.floor(z * gres);
      if (ppx < 0 || ppz < 0 || ppx >= GWp || ppz >= GHp || cls[cellOf(x, z)] !== C.road) continue;
      const o = (ppz * GWp + ppx) * 4; img[o] = 222; img[o + 1] = 222; img[o + 2] = 214;
    }
  }
  onStep("ground", 1);

  // ---- the map (ISSprOM 2019-2): areas traced from the ground, buildings, lines and points as they are ----
  onStep("map", 0);
  const objects = [];
  const traceArea = (want, sym, minA = 6) => {
    const nx1 = W + 2, ny1 = H + 2, pad = new Float32Array(nx1 * ny1);
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) pad[(z + 1) * nx1 + x + 1] = want(z * W + x) ? 1 : 0;
    // a 3 × 3 mean (one pass: the outline a cell's corner rounded, not the forest's three-pass blur), less a half
    const F_ = new Float32Array(nx1 * ny1);
    for (let j = 1; j < ny1 - 1; j++) for (let i = 1, o = j * nx1 + 1; i < nx1 - 1; i++, o++)
      F_[o] = (pad[o - nx1 - 1] + pad[o - nx1] + pad[o - nx1 + 1] + pad[o - 1] + pad[o] + pad[o + 1] + pad[o + nx1 - 1] + pad[o + nx1] + pad[o + nx1 + 1]) / 9 - 0.5;
    for (let i = 0; i < nx1; i++) { F_[i] = -0.5; F_[(ny1 - 1) * nx1 + i] = -0.5; } for (let j = 0; j < ny1; j++) { F_[j * nx1] = -0.5; F_[j * nx1 + nx1 - 1] = -0.5; }
    const outers = [], holes = [];
    for (let r of isolines(F_, nx1, ny1, 0)) {
      if (r.length < 4) continue;
      r = simplify(r.map(([i, j]) => [i - 0.5, j - 0.5]), 0.35);
      if (r.length < 4) continue;
      const a = ringArea(r); if (Math.abs(a) < minA) continue;
      const [ax, az] = r[0], [qx, qz] = r[1], dx = qx - ax, dz = qz - az, L = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = (ax + qx) / 2 - (dz / L) * 0.3, pz = (az + qz) / 2 + (dx / L) * 0.3;
      const xi = Math.max(0, Math.min(W - 1, Math.floor(px))), zi = Math.max(0, Math.min(H - 1, Math.floor(pz)));
      const leftIn = inPoly(r, px, pz), leftWant = F_[(zi + 1) * nx1 + xi + 1] > 0;
      (leftIn === leftWant ? outers : holes).push({ r, a: Math.abs(a) });
    }
    outers.sort((p, q) => p.a - q.a);
    const box = (r) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z; } return [a, b, c, d]; };
    for (const o of outers) o.b = box(o.r);
    const out = outers.map((o) => ({ sym, otp: 3, rings: [o.r] }));
    for (const hl of holes) {
      const [x, z] = hl.r[0];
      const k = outers.findIndex((o) => o.a > hl.a && x >= o.b[0] && x <= o.b[2] && z >= o.b[1] && z <= o.b[3] && inPoly(o.r, x, z));
      if (k >= 0) out[k].rings.push(hl.r);
    }
    objects.push(...out);
  };
  // the ground under a building is its block's (the building is drawn over it)
  const under = new Uint8Array(N);
  for (let q = 0; q < N; q++) under[q] = ground[q];
  for (let q = 0; q < N; q++) if (cls[q] === C.building || cls[q] === C.block) {
    const k = comp[q], t = k >= 0 ? compType[k] : null;
    under[q] = t === "square" || t === "school" || (t === "old" && isCourt(k)) ? 1 : t === "park" || t === "estate" ? 2 : 0;
  }
  traceArea((q) => under[q] === 0, 520000, 8);
  traceArea((q) => under[q] === 1, 501000, 6);
  traceArea((q) => under[q] === 2 || cls[q] === C.path, 401000, 8);
  traceArea((q) => cls[q] === C.slow, 406000, 8);
  traceArea((q) => cls[q] === C.water, 301000, 6);
  // hedges as their 411 strips (1.6 m: the symbol's least width at 1:4000)
  for (const p of hedges) {
    const L = [], Rr = [];
    for (let k = 0; k < p.length; k++) {
      const a = p[Math.max(0, k - 1)], b = p[Math.min(p.length - 1, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.sqrt(tx * tx + tz * tz) || 1;
      L.push([p[k][0] - (tz / l) * 0.8, p[k][1] + (tx / l) * 0.8]); Rr.push([p[k][0] + (tz / l) * 0.8, p[k][1] - (tx / l) * 0.8]);
    }
    objects.push({ sym: 411000, otp: 3, rings: [[...L, ...Rr.reverse(), L[0]]] });
  }
  // the buildings: each run (houses that touch) one polygon
  for (const run of runs) if (run.F.length > 1) objects.push({ sym: 521000, otp: 3, rings: [[...run.F, ...[...run.B].reverse(), run.F[0]]] });
  // paths, stairways
  for (const p of paths) objects.push({ sym: 505000, otp: 2, pts: simplify(p.pts, 0.2) });
  for (const s of stairs) objects.push({ sym: 532002, otp: 2, pts: simplify(s.pts, 0.1) });
  objects.push(...mapLines);
  // contours every 2.5 m (an index contour every 12.5 m)
  const hs = blur(hg, nx, ny, 1), IV = 2.5;
  let hmin = Infinity, hmax = -Infinity; for (const v of hs) { if (v < hmin) hmin = v; if (v > hmax) hmax = v; }
  for (let lv = Math.ceil(hmin / IV) * IV; lv <= hmax; lv += IV) {
    const index = Math.round(lv / IV) % 5 === 0;
    for (const raw of isolines(hs, nx, ny, lv)) {
      const line = chaikin(simplify(raw.map(([i, j]) => [i * S, j * S]), 0.5), 1);
      if (polyLen(line) >= 15) objects.push({ sym: index ? 102000 : 101000, otp: 2, pts: line });
    }
  }
  // north lines every 80 m (20 mm at 1:4000)
  for (let x = 40; x < W; x += 80) objects.push({ sym: 601000, otp: 2, pts: [[x, 0], [x, H]] });
  onStep("map", 1);

  // ---- the course setter's sites: building corners (the flag 1.1 m out), wall ends, the stairs' feet, monuments, fountains, trees ----
  for (const run of runs) {
    if (run.F.length < 2) continue;
    const ring = [...run.F, ...[...run.B].reverse()];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[(k - 1 + ring.length) % ring.length], p = ring[k], b = ring[(k + 1) % ring.length];
      const d1 = [p[0] - a[0], p[1] - a[1]], d2 = [p[0] - b[0], p[1] - b[1]], l1 = Math.sqrt(d1[0] ** 2 + d1[1] ** 2), l2 = Math.sqrt(d2[0] ** 2 + d2[1] ** 2);
      if (l1 < 3 || l2 < 3) continue;
      const bxv = d1[0] / l1 + d2[0] / l2, bzv = d1[1] / l1 + d2[1] / l2, bl = Math.sqrt(bxv * bxv + bzv * bzv);
      if (bl < 0.4) continue;                                        // a straight run of the wall, not a corner
      const fx = p[0] + (bxv / bl) * 1.1, fz = p[1] + (bzv / bl) * 1.1;
      if (inPoly([...ring, ring[0]], fx, fz)) continue;              // an inside corner
      features.push({ k: "corner", x: fx, z: fz, obj: p });
    }
  }
  for (const s of stairs) { const [a, b] = s.pts, l = dist(a, b) || 1; features.push({ k: "stairs", x: a[0] - ((b[0] - a[0]) / l) * 1.5, z: a[1] - ((b[1] - a[1]) / l) * 1.5, obj: a }); }
  const feats = features.filter((f) => inside(f.x, f.z)).map((f) => ({ k: f.k, x: +f.x.toFixed(1), z: +f.z.toFixed(1) }));

  // ---- the 3D town (games/vtown.js's arrays) ----
  onStep("town", 0);
  const town = buildTown({ W, H, houses, runs, walls3, props, cars, chimneys, hAt, seed });
  // the trees as vworld's trees.bin (x, z in decimetres, height × 4, crown radius × 10)
  const tb = new Uint8Array(keptTrees.length * 6), tv = new DataView(tb.buffer);
  keptTrees.forEach(([x, z, h, cr], i) => { tv.setUint16(i * 6, Math.round(x * 10), true); tv.setUint16(i * 6 + 2, Math.round(z * 10), true); tv.setUint8(i * 6 + 4, Math.min(255, Math.round(h * 4))); tv.setUint8(i * 6 + 5, Math.min(255, Math.round(cr * 10))); });
  onStep("town", 1);
  // what stops the runner besides the ground's classes (vtown.js hits, vworld's trunks), [x, z, r] flat: the course setter keeps the
  // taped last leg clear of them
  const PR = { lamp: 0.12, bollard: 0.12, bin: 0.25, postbox: 0.3, fountain: 1.2, memorial: 0.7 }, obst = [];
  for (const [k, x, z] of props) if (PR[k]) obst.push(x, z, PR[k]);
  for (const [x, z, , L] of cars) obst.push(x, z, L / 2);       // a car as the disc round it (no trigonometry: the same everywhere)
  for (const [x, z, h, cr] of keptTrees) obst.push(x, z, h > 5 ? 0.45 : cr * 0.6);

  return { W, H, base, h: hm, cls, veg, ground: img, gres, surf, trees: tb, objects, features: feats, interval: IV, biome: TOWN_BIOME, obst,
    feats: { rocks: [], walls: [], points: [], features: feats }, town,
    gen: { sprint: true, seed, size: W, buildings, gardens, parks }, check: null,
    counts: { houses: houses.length, buildings: runs.length, parks: rects.filter((r) => r.type === "park").length, stairs: stairs.length } };
}

/** The town's buildings and lines as games/vtown.js reads a package's town.json and town.bin: { meta, arrays }. */
function buildTown({ W, H, houses, runs, walls3, props, cars, chimneys, hAt, seed }) {
  const chunks = new Map();
  const chunk = (x, z) => { const k = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; let c = chunks.get(k); if (!c) chunks.set(k, (c = { rp: [], rc: [], ri: [], wp: [], wu: [], ws: [], wc: [], wi: [] })); return c; };
  for (const h of houses) {
    // a gable's ridge runs along the house's longer side (a church's down its nave)
    let { F0, F1, B1, B0 } = h;
    if (h.roof !== "flat" && dist(F0, B0) > dist(F0, F1) * 1.15) [F0, F1, B1, B0] = [F1, B1, B0, F0];
    const cxm = (F0[0] + F1[0] + B0[0] + B1[0]) / 4, czm = (F0[1] + F1[1] + B0[1] + B1[1]) / 4, c = chunk(cxm, czm);
    const gs = [F0, F1, B1, B0].map(([x, z]) => hAt(x, z)), g = (gs[0] + gs[1] + gs[2] + gs[3]) / 4, low = Math.min(...gs) - 0.4;
    const E = g + h.eave, depth = (dist(F0, B0) + dist(F1, B1)) / 2, R = h.roof === "flat" ? E : E + h.pitch * depth / 2;
    const M0 = [(F0[0] + B0[0]) / 2, (F0[1] + B0[1]) / 2], M1 = [(F1[0] + B1[0]) / 2, (F1[1] + B1[1]) / 2];
    // walls: each side from the lowest ground to the roof's edge (a gable end up to the ridge), facing out
    const style = h.sty + 10 * h.mat, col = h.col;
    const side = (pts, tops) => {
      // the side's direction: outward normal (−dz, dx) must point away from the house's middle, else reversed
      const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dz = b[1] - a[1];
      if (-dz * ((a[0] + b[0]) / 2 - cxm) + dx * ((a[1] + b[1]) / 2 - czm) < 0) { pts = [...pts].reverse(); tops = [...tops].reverse(); }
      let s = 0; const L = polyLen(pts);
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k - 1], q = pts[k], l = dist(p, q), v = c.wp.length / 3;
        c.wp.push(p[0], low, p[1], q[0], low, q[1], q[0], tops[k], q[1], p[0], tops[k - 1], p[1]);
        c.wu.push(s, low - g, s + l, low - g, s + l, tops[k] - g, s, tops[k - 1] - g);
        for (let r = 0; r < 4; r++) { c.ws.push(L, h.eave, h.fh, h.seed); c.wc.push(col[0], col[1], col[2], style); }
        c.wi.push(v, v + 1, v + 2, v, v + 2, v + 3);
        s += l;
      }
    };
    side([F0, F1], [E, E]); side([B1, B0], [E, E]);
    if (h.roof === "flat") { side([F1, B1], [E, E]); side([B0, F0], [E, E]); }
    else { side([F1, M1, B1], [E, R, E]); side([B0, M0, F0], [E, R, E]); }
    // the roof: two slopes with 0.3 m eaves, or flat
    const kind = (h.roof === "flat" ? 1 : 0) + 2 * h.rmat, rc = h.rcol, v0 = c.rp.length / 3;
    const out = (P, M, d) => { const dx = P[0] - M[0], dz = P[1] - M[1], l = Math.sqrt(dx * dx + dz * dz) || 1; return [P[0] + (dx / l) * d, P[1] + (dz / l) * d]; };
    if (h.roof === "flat") {
      for (const P of [F0, F1, B1, B0]) c.rp.push(P[0], E + 0.15, P[1]);
      c.ri.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    } else {
      const o = 0.3, Eo = E - h.pitch * o;
      const f0 = out(F0, M0, o), f1 = out(F1, M1, o), b1 = out(B1, M1, o), b0 = out(B0, M0, o);
      for (const [P, y] of [[f0, Eo], [f1, Eo], [M1, R], [M0, R], [b1, Eo], [b0, Eo]]) c.rp.push(P[0], y, P[1]);
      c.ri.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3, v0 + 4, v0 + 5, v0 + 3, v0 + 4, v0 + 3, v0 + 2);
      // a chimney on some
      if (hashU(Math.round(cxm * 10), Math.round(czm * 10), seed) < 0.45) {
        const t = 0.25 + 0.5 * hashU(Math.round(czm), Math.round(cxm), seed + 1);
        chimneys.push([lerp(M0[0], M1[0], t), lerp(M0[1], M1[1], t), R - 0.5, 1.4, 0.6, 0.8]);
      }
    }
    const n = c.rp.length / 3 - v0;
    for (let k = 0; k < n; k++) c.rc.push(rc[0], rc[1], rc[2], kind);
  }
  // the arrays, chunk after chunk (indices local to each chunk), 4-byte aligned in one buffer
  const lists = { rpos: [], rcol: [], ridx: [], wpos: [], wuv: [], wseg: [], wcol: [], widx: [] }, index = {};
  const count = { r: 0, ri: 0, w: 0, wi: 0 };
  for (const [k, c] of chunks) {
    const e = {};
    if (c.rp.length) { e.r = [count.r, c.rp.length / 3, count.ri, c.ri.length]; count.r += c.rp.length / 3; count.ri += c.ri.length;
      lists.rpos.push(c.rp); lists.rcol.push(c.rc); lists.ridx.push(c.ri); }
    if (c.wp.length) { e.w = [count.w, c.wp.length / 3, count.wi, c.wi.length]; count.w += c.wp.length / 3; count.wi += c.wi.length;
      lists.wpos.push(c.wp); lists.wuv.push(c.wu); lists.wseg.push(c.ws); lists.wcol.push(c.wc); lists.widx.push(c.wi); }
    index[k] = e;
  }
  const flat = (T, ls) => { const n = ls.reduce((s, l) => s + l.length, 0), a = new T(n); let o = 0; for (const l of ls) { a.set(l, o); o += l.length; } return a; };
  const arrays = { rpos: flat(Float32Array, lists.rpos), rcol: flat(Uint8Array, lists.rcol), ridx: flat(Uint32Array, lists.ridx),
    wpos: flat(Float32Array, lists.wpos), wuv: flat(Float32Array, lists.wuv), wseg: flat(Float32Array, lists.wseg), wcol: flat(Uint8Array, lists.wcol), widx: flat(Uint32Array, lists.widx) };
  const foot = runs.filter((r) => r.F.length > 1).map((r) => { const ring = [...r.F, ...[...r.B].reverse()]; ring.push(ring[0]); return ring.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]); });
  const meta = { chunks: index, foot, walls: walls3.map((w) => ({ ...w, pts: w.pts.map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)]) })),
    props: props.filter(([, x, z]) => x >= 0 && z >= 0 && x < W && z < H), chunk: CH, chimneys, cars, carColours: CAR_COLOURS };
  return { meta, arrays };
}

/** The race.json of an invented town (games/vworld.js's frame at 1:4000: world = (mm − mm0) × 4, z down). */
export function raceOfTown(world, { id, courses = [] } = {}) {
  const scale = 4000, k = scale / 1000;
  return { id, scale, std: "ISSprOM 2019", W: world.W, H: world.H, res: 1, base: world.base, mm0: [0, world.H / k], k,
    interval: world.interval, source: "gentown", lidarTrees: world.trees.length / 6, classes: CL, speed: CL.map((n) => SPEED[n]), vegK: VEG_K,
    biome: world.biome, map: "ocd", gen: world.gen, courses, town: { gen: true }, groundRes: 1 / world.gres };
}
