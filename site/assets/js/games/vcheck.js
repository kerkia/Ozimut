// The ISOM 2017-2 check of an invented map (owner, 2026-11-14: « il faut implémenter un vérificateur de compatibilité de carte avec
// la norme », as the town sprints' legibility.py): what the specification asks that a generator may break, counted rule by rule
// with the first places, on games/vgen.js's objects (world metres, x right, z down) and its heights. The generator holds itself to
// the same numbers while it makes the world (areas under their minimum size given back to their neighbour, paths too short not
// made, features off the black lines), and runs this check at its end: the report says what is left.
//
// The minimum sizes are Cartographier's (mapper/sets/minimums.json, from the specification: map mm at 1:15 000 — a map at 1:10 000
// is its 150 % enlargement, so a minimum on the ground is the same: GROUND metres a mm); the rule ids are those of
// mapper/sets/rules-isom2017-2.json where the catalogue has the rule, « oz.* » for what it leaves to the generator.

export const GROUND = 15;                       // metres on the ground a mm of ISOM's 1:15 000 (and of its 150 % at 1:10 000)
const GAP = 0.15 * GROUND;                      // the general minimum gap between symbols (2.25 m)
const GAP_IMPASSABLE = 0.4 * GROUND;            // between impassable features (6 m)
// point symbols' radii and line symbols' half widths, mm at 1:15 000 (ISOM 2017-2's drawings)
export const POINT_R = { 109: 0.375, 110: 0.5, 111: 0.35, 112: 0.4, 115: 0.5, 204: 0.2, 205: 0.3, 207: 0.4 };
export const LINE_HW = { 201: 0.3, 202: 0.25, 305: 0.09, 504: 0.175, 505: 0.125, 506: 0.09, 508: 0.07 };
const BLACK_LINES = new Set([201, 202, 504, 505, 506, 508]);
// the white openings a screen may hold, their side (mm): ISOM's 405 rule
const OPENING = { 401: 0.7, 402: 1, 403: 1, 404: 1, 406: 1, 407: 1, 408: 0.7, 409: 0.7, 410: 0.55 };

// The minimums the generator holds itself to, copied from minimums.json's `isom` (map mm at 1:15 000): written here so that a world
// never depends on a file fetched (the map of the day is the same everywhere); tools/virtually/gen.mjs says if they part.
export const ISOM_MINS = {
  "101": { length: 0.9, width: 0.6 }, "201": { length: 0.6 }, "202": { length: 0.6 }, "206": { width: 0.25, area: 0.3 }, "214": { area: 1 },
  "301": { width: 0.3, area: 0.3025 }, "305": { length: 1 }, "308": { area: 0.2 }, "401": { width: 0.3 }, "403": { area: 1, width: 0.4 },
  "406": { area: 1, width: 0.4 }, "407": { area: 1.5 }, "408": { area: 0.49, width: 0.3 }, "409": { area: 1 }, "410": { width: 0.25 },
  "504": { length: 6.25 }, "505": { length: 4.25 }, "506": { length: 2.25 }, "508": { length: 3.25 },
};

const code = (sym) => String(Math.floor(sym / 1000));
const len = (p) => { let s = 0; for (let k = 1; k < p.length; k++) { const dx = p[k][0] - p[k - 1][0], dz = p[k][1] - p[k - 1][1]; s += Math.sqrt(dx * dx + dz * dz); } return s; };
const area = (r) => { let s = 0; for (let k = 0; k < r.length - 1; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; return Math.abs(s / 2); };
const closed = (p) => p.length > 3 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];
export function inPoly(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
}
/** The distance from (x, z) to a polyline. */
export function distLine(p, x, z) {
  let best = Infinity;
  for (let k = 1; k < p.length; k++) {
    const [ax, az] = p[k - 1], [bx, bz] = p[k], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0, ex = ax + t * dx - x, ez = az + t * dz - z, d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const bbox = (p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of p) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z; } return [a, b, c, d]; };
const near = (bb, x, z, m) => x >= bb[0] - m && x <= bb[2] + m && z >= bb[1] - m && z <= bb[3] + m;
/** A point inside a ring: its centroid when inside, else the middle of its widest horizontal chord through the centroid's row. */
function inside(r) {
  let cx = 0, cz = 0; for (const [x, z] of r) { cx += x; cz += z; } cx /= r.length; cz /= r.length;
  if (inPoly(r, cx, cz)) return [cx, cz];
  const xs = [];
  for (let k = 1; k < r.length; k++) { const [ax, az] = r[k - 1], [bx, bz] = r[k]; if ((az > cz) !== (bz > cz)) xs.push(ax + ((cz - az) * (bx - ax)) / (bz - az)); }
  xs.sort((a, b) => a - b);
  let best = [r[0][0], r[0][1]], w = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > w) { w = xs[k + 1] - xs[k]; best = [(xs[k] + xs[k + 1]) / 2, cz]; }
  return best;
}
/**
 * The tight bends of a contour round lower ground (the tip of a re-entrant: the line turns by more than 75° over 10 m either
 * side, the ground inside the bend lower), where a mapper puts a slope tick inside the angle, down the re-entrant's axis:
 * [{ x, z, dx, dz }] (the tick's point and its downhill direction, world axes). h(x, z): the ground's height.
 */
export function reentrants(pts, h, { win = 10, tight = 0.25, drop = 0.15 } = {}) {
  const p = [pts[0]];
  for (let k = 1; k < pts.length; k++) {                                   // a point at least every 2 m
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], n = Math.ceil(Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) / 2);
    for (let s = 1; s <= n; s++) p.push([ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n]);
  }
  const s = [0]; for (let k = 1; k < p.length; k++) s.push(s[k - 1] + Math.sqrt((p[k][0] - p[k - 1][0]) ** 2 + (p[k][1] - p[k - 1][1]) ** 2));
  const L = s[s.length - 1], bend = new Float64Array(p.length).fill(1), dirs = [];
  for (let k = 0, a = 0, b = 0; k < p.length; k++) {
    if (s[k] < win || L - s[k] < win) { dirs.push(null); continue; }
    while (s[a + 1] <= s[k] - win) a++;
    while (b < p.length - 1 && s[b] < s[k] + win) b++;
    let ux = p[k][0] - p[a][0], uz = p[k][1] - p[a][1], vx = p[b][0] - p[k][0], vz = p[b][1] - p[k][1];
    const lu = Math.sqrt(ux * ux + uz * uz) || 1, lv = Math.sqrt(vx * vx + vz * vz) || 1; ux /= lu; uz /= lu; vx /= lv; vz /= lv;
    bend[k] = ux * vx + uz * vz;                                            // the cosine of the turn
    let mx = (p[a][0] + p[b][0]) / 2 - p[k][0], mz = (p[a][1] + p[b][1]) / 2 - p[k][1]; const lm = Math.sqrt(mx * mx + mz * mz) || 1;
    dirs.push([mx / lm, mz / lm]);                                           // into the bend
  }
  const out = [];
  for (let k = 1; k < p.length - 1; k++) {
    if (bend[k] > tight || !dirs[k]) continue;
    // the sharpest point of its bend
    let best = true; for (let j = k - 1; j >= 0 && s[k] - s[j] <= win; j--) if (bend[j] < bend[k]) best = false;
    for (let j = k + 1; j < p.length && s[j] - s[k] <= win; j++) if (bend[j] <= bend[k]) best = false;
    if (!best) continue;
    const [x, z] = p[k], [dx, dz] = dirs[k], h0 = h(x, z);
    if (h(x + 4 * dx, z + 4 * dz) < h0 - drop && h(x - 4 * dx, z - 4 * dz) > h0) out.push({ x, z, dx, dz });
  }
  return out;
}
/** Where two polylines cross (the first crossing found), else null. */
function crossing(p, q) {
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    for (let j = 1; j < q.length; j++) {
      const [cx, cz] = q[j - 1], [dx, dz] = q[j];
      const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (!den) continue;
      const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return [ax + t * (bx - ax), az + t * (bz - az)];
    }
  }
  return null;
}
/** Width of a region as twice its area over its perimeter: a strip's width, half a disc's diameter (a cautious measure). */
const width2 = (a, per) => (per ? (2 * a) / per : 0);

/**
 * The area rules alone, on area objects ({ sym, rings }): [{ id, o, ring (the hole, for an opening), x, z }] — the generator runs
 * them on its polygons before it makes the classes, and mends what they find. `checked` (a Set) collects the rule ids.
 */
export function areaFindings(areas, mins, checked = new Set()) {
  const out = [];
  for (const o of areas) {
    const c = code(o.sym), m = mins?.[c], outer = o.rings[0], holes = o.rings.slice(1);
    const a = area(outer) - holes.reduce((s, r) => s + area(r), 0), per = o.rings.reduce((s, r) => s + len(r), 0);
    if (m?.area) { checked.add(`fo.min.${c}.area`); if (a < m.area * GROUND * GROUND) out.push({ id: `fo.min.${c}.area`, o, x: outer[0][0], z: outer[0][1] }); }
    if (m?.width) { checked.add(`fo.min.${c}.width`); if (width2(a, per) < m.width * GROUND) out.push({ id: `fo.min.${c}.width`, o, x: outer[0][0], z: outer[0][1] }); }
    if (OPENING[c]) {
      checked.add("fo.405.openings");
      const side = OPENING[c] * GROUND;
      for (const r of holes) {
        if (area(r) >= side * side) continue;
        // a point inside the hole: another area there makes it that area's border, not a white opening
        const [px, pz] = inside(r);
        if (!areas.some((q) => q !== o && inPoly(q.rings[0], px, pz) && !q.rings.slice(1).some((rr) => inPoly(rr, px, pz)))) out.push({ id: "fo.405.openings", o, ring: r, x: px, z: pz });
      }
    }
  }
  return out;
}

/**
 * The report on a world from games/vgen.js: { checked: [rule ids], findings: [{ id, sev, n, at: [[x, z]…] }], ok }.
 * mins: minimums.json's `isom`; scale: the map's.
 */
export function checkMap(world, { mins = ISOM_MINS, scale = 10000 } = {}) {
  const { W, H, h, objects } = world;
  const found = new Map(), checked = new Set();
  const add = (id, sev, x, z) => { let f = found.get(id); if (!f) found.set(id, (f = { id, sev, n: 0, at: [] })); f.n++; if (f.at.length < 6) f.at.push([Math.round(x), Math.round(z)]); };
  const hAt = (x, z) => { const i = Math.min(W - 1, Math.max(0, Math.floor(x))), j = Math.min(H - 1, Math.max(0, Math.floor(z))); return h[j * W + i]; };
  const of = (pred) => objects.filter(pred);
  const areas = of((o) => o.otp === 3), lines = of((o) => o.otp === 2), points = of((o) => o.otp === 1 && o.sym !== 101009);
  const water = areas.filter((o) => o.sym === 301000).map((o) => ({ o, bb: bbox(o.rings[0]) }));
  const cliffs = lines.filter((o) => o.sym === 201000 || o.sym === 202000).map((o) => ({ o, bb: bbox(o.pts) }));
  const inWater = (x, z) => water.some(({ o, bb }) => near(bb, x, z, 0) && inPoly(o.rings[0], x, z) && !o.rings.slice(1).some((r) => inPoly(r, x, z)));

  // the scale, and the north lines 30 mm apart on the paper, parallel to its sides
  checked.add("fo.2.9.scale"); if (scale !== 10000 && scale !== 15000) add("fo.2.9.scale", "error", W / 2, H / 2);
  checked.add("fo.601.north");
  const north = lines.filter((o) => o.sym === 601000).map((o) => o.pts);
  const step = (30 * scale) / 1000;
  if (!north.length) add("fo.601.north", "error", W / 2, H / 2);
  for (const p of north) if (Math.abs(p[0][0] - p[p.length - 1][0]) > 0.01) add("fo.601.north", "error", p[0][0], p[0][1]);
  const xs = north.map((p) => p[0][0]).sort((a, b) => a - b);
  for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - xs[k - 1] - step) > 1) add("fo.601.north", "error", xs[k], 0);

  // areas: the minimum area and width of each symbol, the openings a screen may hold
  for (const f of areaFindings(areas, mins, checked)) add(f.id, "error", f.x, f.z);
  // gaps between impassable features: water and gigantic boulders
  checked.add("fo.2.11.gap"); checked.add("fo.206.gap");
  const giants = areas.filter((o) => o.sym === 206000).map((o) => ({ o, bb: bbox(o.rings[0]) }));
  for (let i = 0; i < water.length; i++) for (let j = i + 1; j < water.length; j++) {
    const A = water[i], B = water[j];
    if (!near(A.bb, (B.bb[0] + B.bb[2]) / 2, (B.bb[1] + B.bb[3]) / 2, (B.bb[2] - B.bb[0]) / 2 + (B.bb[3] - B.bb[1]) / 2 + GAP_IMPASSABLE)) continue;
    const d = Math.min(...B.o.rings[0].map(([x, z]) => distLine(A.o.rings[0], x, z)));
    if (d > 0.01 && d < GAP_IMPASSABLE) add("fo.2.11.gap", "error", B.o.rings[0][0][0], B.o.rings[0][0][1]);
  }
  for (const g of giants) {
    const [x, z] = [(g.bb[0] + g.bb[2]) / 2, (g.bb[1] + g.bb[3]) / 2], r = (g.bb[2] - g.bb[0]) / 2;
    for (const w of water) if (near(w.bb, x, z, r + GAP) && distLine(w.o.rings[0], x, z) - r < GAP) add("fo.206.gap", "error", x, z);
    for (const c of cliffs) if (near(c.bb, x, z, r + GAP) && distLine(c.o.pts, x, z) - r < GAP) add("fo.206.gap", "error", x, z);
  }
  // lines: the minimum length of each symbol; contours: a closed one's width, an open one's ends (at the map's edge, water or a cliff)
  for (const o of lines) {
    const c = code(o.sym), m = mins?.[c === "102" ? "101" : c], L = len(o.pts);
    if (m?.length) { checked.add(`fo.min.${c === "102" ? "101" : c}.length`); if (L < m.length * GROUND) add(`fo.min.${c === "102" ? "101" : c}.length`, "error", o.pts[0][0], o.pts[0][1]); }
    if (c !== "101" && c !== "102") continue;
    if (closed(o.pts)) {
      checked.add("fo.min.101.width");
      if (m?.width && (4 * area(o.pts)) / L < m.width * GROUND) add("fo.min.101.width", "error", o.pts[0][0], o.pts[0][1]);
      continue;
    }
    checked.add("oz.contour.end");
    for (const [x, z] of [o.pts[0], o.pts[o.pts.length - 1]]) {
      if (x < 3 || z < 3 || x > W - 3 || z > H - 3) continue;
      if (water.some(({ o: w, bb }) => near(bb, x, z, 3) && distLine(w.rings[0], x, z) < 3)) continue;
      // at a cliff: within its ticks' reach (0.6 mm), where a short piece too small to draw may have been left out
      if (cliffs.some(({ o: cl, bb }) => near(bb, x, z, 9) && distLine(cl.pts, x, z) < 9)) continue;
      add("oz.contour.end", "warn", x, z);
    }
  }
  // slope ticks point downhill; a closed contour round lower ground carries one (else it reads as a knoll)
  checked.add("oz.tick.downhill"); checked.add("oz.depression.tick");
  const ticks = of((o) => o.sym === 101009);
  for (const t of ticks) {
    const [x, z] = t.pts[0], th = ((t.ang || 0) / 10) * Math.PI / 180, dx = Math.sin(th), dz = Math.cos(th);   // drawing direction: (sin θ, −cos θ) on the paper
    if (!(hAt(x + 3 * dx, z + 3 * dz) < hAt(x - 3 * dx, z - 3 * dz))) add("oz.tick.downhill", "error", x, z);
  }
  for (const o of lines) {
    if ((o.sym !== 101000 && o.sym !== 102000) || !closed(o.pts)) continue;
    const bb = bbox(o.pts), lv = o.pts.reduce((s, [x, z]) => s + hAt(x, z), 0) / o.pts.length;
    const st = Math.max(1, Math.sqrt(((bb[2] - bb[0]) * (bb[3] - bb[1])) / 400));
    let lo = Infinity, hi = -Infinity, n = 0;
    for (let z = bb[1] + st / 2; z < bb[3]; z += st) for (let x = bb[0] + st / 2; x < bb[2]; x += st) {
      if (!inPoly(o.pts, x, z)) continue;
      const v = hAt(x, z); if (v < lo) lo = v; if (v > hi) hi = v; n++;
    }
    if (!n || hi > lv - 0.05) continue;                                   // not clearly a hollow
    if (!ticks.some((t) => near(bb, t.pts[0][0], t.pts[0][1], 1) && distLine(o.pts, t.pts[0][0], t.pts[0][1]) < 1)) add("oz.depression.tick", "error", o.pts[0][0], o.pts[0][1]);
  }
  // a re-entrant's tip (a contour's tight bend round lower ground) carries a slope tick: else the re-entrant does not read
  checked.add("oz.reentrant.tick");
  for (const o of lines) {
    if (o.sym !== 101000 && o.sym !== 102000) continue;
    for (const r of reentrants(o.pts, hAt)) {
      if (r.x < 10 || r.z < 10 || r.x > W - 10 || r.z > H - 10 || inWater(r.x + 2 * r.dx, r.z + 2 * r.dz)) continue;
      if (cliffs.some(({ o: cl, bb }) => near(bb, r.x, r.z, 10) && distLine(cl.pts, r.x, r.z) < 10)) continue;
      if (!ticks.some((t) => Math.abs(t.pts[0][0] - r.x) < 30 && Math.abs(t.pts[0][1] - r.z) < 30)) add("oz.reentrant.tick", "warn", r.x, r.z);
    }
  }
  // a cliff's ticks (on the line's right, as OCAD draws them) on its lower side
  checked.add("oz.cliff.ticks");
  for (const { o } of cliffs) {
    let right = 0, left = 0;
    for (let k = 1; k < o.pts.length; k++) {
      const [ax, az] = o.pts[k - 1], [bx, bz] = o.pts[k], dx = bx - ax, dz = bz - az, L = Math.sqrt(dx * dx + dz * dz) || 1;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, rx = -dz / L, rz = dx / L;          // the paper's right of the line, in world axes
      right += hAt(mx + 3 * rx, mz + 3 * rz); left += hAt(mx - 3 * rx, mz - 3 * rz);
    }
    if (!(right < left)) add("oz.cliff.ticks", "error", o.pts[0][0], o.pts[0][1]);
  }
  // point symbols: 0.15 mm apart from each other and from the black and blue lines; nothing in a lake
  checked.add("fo.417.trees"); checked.add("oz.point.line"); checked.add("oz.in_water");
  const cell = 40, grid = new Map(), key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const marked = lines.filter((l) => BLACK_LINES.has(+code(l.sym)) || +code(l.sym) === 305).map((l) => ({ pts: l.pts, c: +code(l.sym) }));
  points.forEach((p, i) => { p._i = i; const k = key(...p.pts[0]); (grid.get(k) || grid.set(k, []).get(k)).push(p); });
  for (const p of points) {
    const [x, z] = p.pts[0], r = (POINT_R[code(p.sym)] || 0.3) * GROUND;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of grid.get(`${Math.floor(x / cell) + a},${Math.floor(z / cell) + b}`) || []) {
      if (q === p) continue;
      const [qx, qz] = q.pts[0], d = Math.sqrt((qx - x) * (qx - x) + (qz - z) * (qz - z)), rq = (POINT_R[code(q.sym)] || 0.3) * GROUND;
      if (q._i > p._i && d < r + rq + GAP) add("fo.417.trees", "error", x, z);                  // each pair once
    }
    for (const l of marked) {
      const c = l.c;
      const lb = l.bb || (l.bb = bbox(l.pts)), lim = r + LINE_HW[c] * GROUND + GAP;
      if (near(lb, x, z, lim) && distLine(l.pts, x, z) < lim) { add("oz.point.line", "error", x, z); break; }
    }
    if (inWater(x, z)) add("oz.in_water", "error", x, z);
  }
  for (const p of points) delete p._i;
  // no path, track or ride across a cliff (a runner on the path would meet it)
  checked.add("oz.path.cliff");
  const ways = lines.filter((l) => { const c = +code(l.sym); return c >= 504 && c <= 508; }).map((l) => ({ pts: l.pts, bb: bbox(l.pts) }));
  for (const { o: cl, bb } of cliffs) for (const wy of ways) {
    if (wy.bb[0] > bb[2] || wy.bb[2] < bb[0] || wy.bb[1] > bb[3] || wy.bb[3] < bb[1]) continue;
    const x = crossing(cl.pts, wy.pts); if (x) { add("oz.path.cliff", "error", x[0], x[1]); break; }
  }
  for (const l of lines) { delete l.bb; const c = +code(l.sym); if (BLACK_LINES.has(c) && l.pts.some(([x, z], k) => k % 4 === 0 && inWater(x, z))) add("oz.in_water", "error", l.pts[0][0], l.pts[0][1]); }
  const findings = [...found.values()];
  return { checked: [...checked].sort(), findings, ok: !findings.some((f) => f.sev === "error") };
}
