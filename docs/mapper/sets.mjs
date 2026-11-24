// Cartographier's IOF symbol sets, authored as data from the IOF specifications (never from OCAD's or OpenOrienteering
// Mapper's symbol files): ISOM 2017-2 revision 6 (forest, dimensions at 1:15 000) and ISSprOM 2019-2 revision 6 (sprint, 1:4 000).
// ISOM's revision 6 (January 2024; 2026-11-12) read in the Czech federation's translation and its errata: 105.1/105.2, 203.1/203.2,
// 513.1/513.2 and 715, and the widths, colours, screens and minimum sizes the errata of 2020-2024 changed.
// The dimensions are those `site/assets/js/isom.js` draws (read there from the specifications' « exact definition »
// drawings), the minimum sizes those the specifications' texts give (§2.11 and each symbol's text; ISOM 2017-2 read in FFCO's
// bilingual FR/EN edition, ISSprOM in its 2019 bilingual edition, numbers mapped to revision 6).
//
// Writes, as OCAD 9+ symbol records (docs/mapper/model.md: lengths in 0.01 mm, coordinates OCAD integers, angles 0.1°):
//   site/assets/js/mapper/sets/isom2017-2.json, issprom2019-2.json, minimums.json
// Run from the repository: node --import ./tools/mapper/shim.mjs docs/mapper/sets.mjs
//
// Numbering: the specification's numbers (`401` = 401000, `512.1` = 512001). The forms a specification draws as one
// symbol but OCAD needs as several records (white or green dots of 402, the stripes of 406-410…) take the next free
// sub-numbers (402.1, 410.2…); helper symbols (a bank or outline line used as an area's border, slope lines, a single
// boulder-field block, a spot height's figures) take .9 (and .8), so that they never collide with a specification number.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeContext, compileSymbol, symId } from "../../site/assets/js/tracer/vmap/ocad.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "site", "assets", "js", "mapper", "sets");
const VERSION = 2018;                                // the OCAD version the records are compiled as (sub-symbol flags of 11+)

// ---- colours ----------------------------------------------------------------------------------------------------------------
// The specifications' process colours (ISOM 2017-2 Appendix 1 / ISSprOM 2019-2: CMYK of the IOF's colours) and the screens
// the symbols name, from the BOTTOM of the colour table to its TOP: the lighter area colours under the darker, yellow under
// green, white « holes » and stripes just above the colour they cut, brown contours over the vegetation, blue and black above,
// the course's purple on top (overprinted). A set lists the colours its symbols use, keeping this order and these numbers.
const BASE = { yellow: [0, 0.27, 0.79, 0], green: [0.76, 0, 0.91, 0], brown: [0, 0.56, 1, 0.18], blue: [1, 0, 0, 0], black: [0, 0, 0, 1], purple: [0.35, 0.85, 0, 0] };
const screen = (c, p) => BASE[c].map((v) => Math.round(v * p * 1000) / 1000);
const mix = (...cs) => cs.reduce((a, c) => a.map((v, i) => Math.min(1, Math.round((v + c[i]) * 1000) / 1000)), [0, 0, 0, 0]);
const COLORS = [
  ["white", "White (forest)", [0, 0, 0, 0]],
  ["yellow50", "Yellow 50%", screen("yellow", 0.5)],
  ["yellow", "Yellow 100%", BASE.yellow],
  ["whiteY", "White over yellow (holes)", [0, 0, 0, 0]],
  ["green30", "Green 30%", screen("green", 0.3)],
  ["green60", "Green 60%", screen("green", 0.6)],
  ["green", "Green 100%", BASE.green],
  ["whiteG", "White over green (stripes)", [0, 0, 0, 0]],
  ["green20s", "Green 20% (stripes)", screen("green", 0.2)],
  ["green30s", "Green 30% (stripes)", screen("green", 0.3)],
  ["green60s", "Green 60% (stripes)", screen("green", 0.6)],
  ["darkGreen", "Green 100% + Black 50%", mix(BASE.green, screen("black", 0.5))],
  ["olive", "Olive green (Yellow 100% + Green 50%)", mix(BASE.yellow, screen("green", 0.5))],
  ["black30", "Black 30%", screen("black", 0.3)],
  ["black35", "Black 35%", screen("black", 0.35)],
  ["brown30", "Brown 30%", screen("brown", 0.3)],
  ["brown50", "Brown 50%", screen("brown", 0.5)],
  ["whiteB", "White over brown", [0, 0, 0, 0]],
  // the white the specifications put under the green point symbols (417-419) and the green those symbols are drawn in, above
  // their mask: the same ink as Green 100%. Above every yellow and green area AND above the paved areas' brown (2026-11-24: they
  // lay under it, so a tree standing on paving was not printed, one on its edge half printed); numbered as before (EARLY)
  ["whiteMask", "White (mask under green point symbols)", [0, 0, 0, 0]],
  ["greenPt", "Green 100% (point symbols)", BASE.green],
  ["black20", "Black 20%", screen("black", 0.2)],
  ["black50", "Black 50%", screen("black", 0.5)],
  ["black65", "Black 65%", screen("black", 0.65)],
  // 512.3's white stripes (ISSprOM: drawn over every area colour, a building's grey and the olive included, under the lines): above
  // the greys, numbered after the others so that every other colour keeps its number (2026-11-13)
  ["white5123", "White over grey (512.3 stripes)", [0, 0, 0, 0]],
  ["blue30", "Blue 30%", screen("blue", 0.3)],
  ["blue50", "Blue 50%", screen("blue", 0.5)],
  ["brown", "Brown 100%", BASE.brown],
  ["blue", "Blue 100%", BASE.blue],
  ["black", "Black 100%", BASE.black],
  ["whiteK", "White over black", [0, 0, 0, 0]],
  ["purple50", "Purple 50%", screen("purple", 0.5)],
  ["purple", "Purple 100%", BASE.purple],
  // the helper contours' light violet (2026-11-12), last so that every other colour keeps its number
  ["violet", "Violet 30% (helper contours)", screen("purple", 0.3)],
];
const LATE = ["white5123"];                                  // colours inserted in the order after the numbering was fixed: numbered last
const EARLY = { whiteMask: "olive", greenPt: "whiteMask" };     // colours moved up in the order since: numbered where they were (after…)
const NUMBERED = COLORS.map(([k]) => k).filter((k) => !LATE.includes(k) && !EARLY[k]);
for (const [k, after] of Object.entries(EARLY)) NUMBERED.splice(NUMBERED.indexOf(after) + 1, 0, k);
const NUM = Object.fromEntries([...NUMBERED, ...LATE].map((k, i) => [k, i + 1]));
const OVERPRINT = new Set(["purple", "purple50", "violet"]);
const c = (k) => { if (!NUM[k]) throw new Error(`colour ${k}`); return NUM[k]; };

// ---- geometry: map mm, y up; coordinates as OCAD integers ------------------------------------------------------------------
const H = (mm) => Math.round(mm * 100);                    // mm → 0.01 mm
const P = ([x, y, fx = 0, fy = 0]) => ({ x: (H(x) << 8) | fx, y: (H(y) << 8) | fy });
const C1 = (x, y) => [x, y, 1], C2 = (x, y) => [x, y, 2];   // Bézier control points
const HOLE = (q) => [q[0], q[1], q[2] || 0, (q[3] || 0) | 2];
const KAPPA = 0.5522847498;
const rad = (d) => (d * Math.PI) / 180;
/** A circular arc from a0 to a1 degrees (counter-clockwise when a1 > a0) as Bézier points, the first point included. */
function arc(cx, cy, r, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-9)), step = (a1 - a0) / n, k = (4 / 3) * Math.tan(rad(step) / 4);
  const pt = (a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const out = [pt(a0)];
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step, e = s + step, [x0, y0] = pt(s), [x1, y1] = pt(e);
    out.push(C1(x0 - k * r * Math.sin(rad(s)), y0 + k * r * Math.cos(rad(s))), C2(x1 + k * r * Math.sin(rad(e)), y1 - k * r * Math.cos(rad(e))), [x1, y1]);
  }
  return out;
}
/** An ellipse as four Bézier quarters, closed. */
const ellipse = (cx, cy, rx, ry) => [[cx + rx, cy], C1(cx + rx, cy + KAPPA * ry), C2(cx + KAPPA * rx, cy + ry), [cx, cy + ry], C1(cx - KAPPA * rx, cy + ry), C2(cx - rx, cy + KAPPA * ry), [cx - rx, cy],
  C1(cx - rx, cy - KAPPA * ry), C2(cx - KAPPA * rx, cy - ry), [cx, cy - ry], C1(cx + KAPPA * rx, cy - ry), C2(cx + rx, cy - KAPPA * ry), [cx + rx, cy]];
/** A quadratic curve p0-q-p2 as one cubic. */
const quad = (p0, q, p2) => [p0, C1(p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])), C2(p2[0] + (2 / 3) * (q[0] - p2[0]), p2[1] + (2 / 3) * (q[1] - p2[1])), p2];
const rot = (pts, deg, [cx, cy] = [0, 0]) => pts.map(([x, y, ...f]) => { const a = rad(deg), u = x - cx, v = y - cy; return [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a), ...f]; });
const shift = (pts, dx, dy) => pts.map(([x, y, ...f]) => [x + dx, y + dy, ...f]);

// ---- symbol elements -----------------------------------------------------------------------------------------------------
const JOIN = { bevel: 0, round: 1, miter: 4 };
const elt = (type, color, lineWidth, diameter, pts, flags = 0) => ({ type, flags, color: c(color), lineWidth: H(lineWidth), diameter: H(diameter), nPoly: pts.length, coords: pts.map(P) });
/** A line element (butt ends, bevel joins unless said). */
const L = (color, w, pts, join = "bevel") => elt(1, color, w, 0, pts, JOIN[join]);
/** A filled area element (holes: their first point marked with HOLE). */
const A = (color, pts) => elt(2, color, 0, 0, pts);
/** A ring of OUTER diameter d and line width w (OCAD 9+ stores the diameter to the middle of the line). */
const ring = (color, w, d, x = 0, y = 0) => elt(3, color, w, d - w, [[x, y]]);
const dot = (color, d, x = 0, y = 0) => elt(4, color, 0, d, [[x, y]]);
const eltSize = (es) => es.reduce((s, e) => s + 2 + e.nPoly, 0);

// shapes shared by both sets
/** A V drawn to its outer dimensions as one filled shape (ISOM's pit, rocky pit, waterhole: isom.js veeOM). */
function veeForest(color, w, h, lw) {
  const Ln = Math.hypot(w / 2, h), d = (lw * Ln) / h;
  return A(color, [[-w / 2, h / 2], [0, -h / 2], [w / 2, h / 2], [w / 2 - d, h / 2], [0, -h / 2 + (2 * h * d) / w], [-w / 2 + d, h / 2], [-w / 2, h / 2]]);
}
/** ISSprOM's V (isom.js spVee): its arms cut level at the top. */
function veeSprint(color, w, h, lw) {
  const al = Math.atan2(w / 2, h), t = lw / Math.cos(al), yi = h - lw / Math.sin(al);
  const pts = [[-w / 2, 0], [-w / 2 + t, 0], [0, yi], [w / 2 - t, 0], [w / 2, 0], [0, h]].map(([u, v]) => [u, -(v - h / 2)]);
  return A(color, [...pts, pts[0]]);
}
/** An equilateral triangle, its centroid at the origin, pointing up: solid, or an outline lw thick inside its outer side s. */
function equi(color, s, lw = 0) {
  const tri = (k) => [90, 210, 330, 90].map((a) => [(k / Math.sqrt(3)) * Math.cos(rad(a)), (k / Math.sqrt(3)) * Math.sin(rad(a))]);
  if (!lw) return A(color, tri(s));
  const inner = tri(s - 2 * Math.sqrt(3) * lw);
  return A(color, [...tri(s), HOLE(inner[0]), ...inner.slice(1)]);
}
/** A U open to the north: the lower half of a circle of centre-line radius r, its ends at height h. */
const uArc = (color, lw, r, h) => L(color, lw, arc(0, h, r, 180, 360), "round");
/** A cross whose arms, lw wide on the diagonals, are cut level with an s × s square (isom.js spCross): two exact polygons. */
function squareCross(color, s, lw) {
  // the band |y − x| ≤ e (e = lw / √2: lw measured across the diagonal) inside the square
  const h = s / 2, e = lw / Math.SQRT2;
  const band = [[-h, -h], [-h + e, -h], [h, h - e], [h, h], [h - e, h], [-h, -h + e], [-h, -h]];
  return [A(color, band), A(color, band.map(([x, y]) => [-x, y]))];
}
/** A triangle of a boulder field (vertices in mm, y down as drawn), its centroid at the origin, turned by deg, × k. */
function block(color, verts, deg = 0, k = 1, at = [0, 0]) {
  const g = [verts.reduce((s, v) => s + v[0], 0) / 3, verts.reduce((s, v) => s + v[1], 0) / 3];
  const pts = verts.map(([u, v]) => [(u - g[0]) * k, -(v - g[1]) * k]);
  return A(color, shift(rot([...pts, pts[0]], deg), at[0], at[1]));
}
/** A half dot of diameter d under a line lw wide (on its right side), its flat side `inset` above the line's lower edge. */
function halfDot(color, d, lw, inset) {
  const yc = -(lw / 2 - inset);
  return A(color, [...arc(0, yc, d / 2, 180, 360), [-d / 2, yc]]);
}

// ---- symbol records ----------------------------------------------------------------------------------------------------------
const symNum = (code) => { const [n, s = "0"] = String(code).split("."); return Number(n) * 1000 + Number(s); };
function base(code, otp, description, flags = 0, note = null, status = 0) {
  const r = { sym: symNum(code), otp, symTp: 0, flags, extent: 0, selected: 0, status, nColors: 0, description };
  if (note) r.note = note;
  return r;
}
/** A point symbol (status 2: hidden, OCAD's « hidden » symbol state). */
const point = (code, desc, elts, { rotatable = false, note, status = 0 } = {}) => ({ ...base(code, 1, desc, rotatable ? 1 : 0, note, status), dataSize: eltSize(elts), elts });

/**
 * A line symbol. o: { color, w, ends: "butt"|"round"|"miter"|"pointed", dash: [main, gap, end = main], secGap, endGap,
 * prim: { elts, every, first = every / 2, n = 1, dist = 0 }, dashSym (an element list at each dash's centre), corner,
 * start, end (element lists), dbl: { fill, left, right, gap (between the side lines), lw, rw, dashed: [len, gap], mode },
 * frame: { color, w }, shorten: [start, end] }.
 */
function line(code, desc, o, { note, status = 0 } = {}) {
  const r = base(code, 2, desc, 0, note, status);
  const ends = o.ends || "butt";
  Object.assign(r, {
    lineColor: o.color ? c(o.color) : 0, lineWidth: H(o.w || 0), lineEnds: ends === "round" ? 1 : ends === "miter" ? 4 : ends === "pointed" ? 2 : 0,
    distFromStart: H(o.shorten?.[0] || 0), distToEnd: H(o.shorten?.[1] || 0),
    mainLength: 0, endLength: 0, mainGap: 0, secGap: H(o.secGap || 0), endGap: H(o.endGap || 0), minSym: 0, nPrimSym: 0, primSymDist: 0,
    dblMode: 0, dblFlags: 0, dblFillColor: 0, dblLeftColor: 0, dblRightColor: 0, dblWidth: 0, dblLeftWidth: 0, dblRightWidth: 0, dblLength: 0, dblGap: 0,
    decMode: 0, decLast: 0, decSymbolDistance: true, decSymbolWidth: false, frColor: 0, frWidth: 0, frStyle: 0,
  });
  if (o.dash) { r.mainLength = H(o.dash[0]); r.mainGap = H(o.dash[1]); r.endLength = H(o.dash[2] ?? o.dash[0]); }
  if (o.prim) {
    // symbols spaced along the line: OCAD places them every main length (the gap 0), the first at the end length
    if (!o.dash) { r.mainLength = H(o.prim.every); r.endLength = H(o.prim.first ?? o.prim.every / 2); }
    r.nPrimSym = o.prim.n || 1; r.primSymDist = H(o.prim.dist || 0);
  }
  if (o.dbl) {
    const d = o.dbl;
    r.dblMode = d.mode || (d.dashed ? 3 : 1); r.dblFlags = d.fill ? 1 : 0; r.dblFillColor = d.fill ? c(d.fill) : 0;
    r.dblLeftColor = d.left ? c(d.left) : 0; r.dblRightColor = d.right ? c(d.right) : 0;
    r.dblWidth = H(d.gap); r.dblLeftWidth = H(d.lw || 0); r.dblRightWidth = H(d.rw ?? d.lw ?? 0);
    if (d.dashed) { r.dblLength = H(d.dashed[0]); r.dblGap = H(d.dashed[1]); }
  }
  if (o.frame) { r.frColor = c(o.frame.color); r.frWidth = H(o.frame.w); r.frStyle = 0; }
  r.prim = o.prim?.elts || []; r.sec = o.dashSym || []; r.corner = o.corner || []; r.start = o.start || []; r.end = o.end || [];
  r.primDSize = eltSize(r.prim); r.secDSize = eltSize(r.sec); r.cornerDSize = eltSize(r.corner); r.startDSize = eltSize(r.start); r.endDSize = eltSize(r.end);
  r.useSymbolFlags = (r.sec.length ? 8 : 0) | (r.corner.length ? 4 : 0) | (r.start.length ? 2 : 0) | (r.end.length ? 1 : 0);
  return r;
}

/**
 * An area symbol. o: { fill, border (a line symbol's code), hatch: { color, w, dist (centre to centre), a1, a2 } (degrees),
 * struct: { mode (1 rows, 2 offset rows), w, h, angle, elts, draw (0 clip, 2 centre inside), irr: [x %, y %] }, rotatable }.
 */
function area(code, desc, o, { note } = {}) {
  const r = base(code, 3, desc, o.rotatable ? 1 : 0, note);
  Object.assign(r, {
    borderSym: o.border ? symNum(o.border) : 0, fillColor: o.fill ? c(o.fill) : 0,
    hatchMode: o.hatch ? (o.hatch.a2 != null ? 2 : 1) : 0, hatchColor: o.hatch ? c(o.hatch.color) : 0, hatchLineWidth: H(o.hatch?.w || 0), hatchDist: H(o.hatch?.dist || 0),
    hatchAngle1: Math.round((o.hatch?.a1 || 0) * 10), hatchAngle2: Math.round((o.hatch?.a2 || 0) * 10),
    fillOn: !!o.fill, borderOn: !!o.border,
    structMode: o.struct ? o.struct.mode || 1 : 0, structDraw: o.struct?.draw || 0, structWidth: H(o.struct?.w || 0), structHeight: H(o.struct?.h || 0),
    structAngle: Math.round((o.struct?.angle || 0) * 10), irrX: o.struct?.irr?.[0] || 0, irrY: o.struct?.irr?.[1] || 0, irrMin: 0,
  });
  r.elts = o.struct?.elts || [];
  r.dataSize = eltSize(r.elts);
  return r;
}

/** A text symbol whose DIGITS stand h mm high, as the specifications measure 603 and 704 (Arial's digits: 0.716 of the size). */
function text(code, desc, color, h, { align = 0, note } = {}) {
  const r = base(code, 4, desc, 0, note);
  const pt = ((h / 0.716) / 25.4) * 72;
  Object.assign(r, {
    fontName: "Arial", fontColor: c(color), fontSize: Math.round(pt * 10), weight: 400, italic: false, charSpace: 0, wordSpace: 100, alignment: align,
    lineSpace: 100, paraSpace: 0, indentFirst: 0, indentOther: 0, nTabs: 0, tabs: new Array(32).fill(0), lbOn: false, lbColor: 0, lbWidth: 0, lbDist: 0,
    frMode: 0, frFlags: 0, frName: "", frColor: 0, frSize: 0, frWeight: 400, frItalic: false, frOfX: 0, frOfY: 0, frLeft: 0, frTop: 0, frRight: 0, frBottom: 0,
    pointSymOn: false, pointSym: 0, frWidth: 0,
  });
  return r;
}

// ---- line and area patterns used by both sets -----------------------------------------------------------------------------
/** Tags on the right of the line's direction (OCAD's convention: draw a cliff with its foot on the right). */
const tagged = (color, w, tw, len, every, first) => ({ color, w, prim: { elts: [L(color, tw, [[0, 0], [0, -len]])], every, first } });
/** A dotted line: dots of diameter d every `every`, one at each end. */
const dotted = (color, d, every) => ({ prim: { elts: [dot(color, d)], every, first: 0 } });
/** Dots on a line every `every` (the first half a step in). */
const dotsOn = (color, w, d, every, n = 1, dist = 0) => ({ color, w, prim: { elts: [dot(color, d)], every, first: every / 2, n, dist } });
/** Randomly placed dots or blocks: a triangular lattice for the density (dots a mm²), each element moved at random within
 *  what keeps it beyond the minimum centre distance (OCAD 12's irregular structure). `per` elements per cell (a block field's
 *  cell holds three blocks turned differently, so that neighbours are not all turned alike). */
function scatter(density, dmin, elts, per = 1) {
  const a = Math.sqrt(2 / (Math.sqrt(3) * density)), w = a * per, h = (a * Math.sqrt(3)) / 2;
  const j = Math.max(0.03 * a, 0.48 * (a - dmin));                     // the largest random move: two neighbours moving toward each other stay beyond the minimum
  const irr = Math.max(5, Math.min(90, Math.round(((2 * j) / w) * 100)));
  return { mode: 2, w, h, angle: 0, elts, draw: 2, irr: [irr, Math.max(5, Math.min(90, Math.round(((2 * j) / h) * 100)))] };
}
/** Dots on a square grid of side s turned 45° (the specifications' « s (CC) at 45° » screens). */
const screen45 = (color, d, s) => ({ mode: 1, w: s, h: s, angle: 45, elts: [dot(color, d)] });
const grid = (color, d, s) => ({ mode: 1, w: s, h: s, angle: 0, elts: [dot(color, d)] });

// ==== ISOM 2017-2 ================================================================================================================
function forest() {
  const S = [];
  const add = (r) => (S.push(r), r);
  const N = (k) => NAMES.isom[k] || (() => { throw new Error(`name ${k}`); })();
  // 1 landforms
  add(line(101, N(101), { color: "brown", w: 0.14 }));
  add(point(101.9, "Slope line (contour)", [L("brown", 0.14, [[0, 0], [0, -0.47]])], { rotatable: true }));
  add(line(102, N(102), { color: "brown", w: 0.25 }));
  add(point(102.9, "Slope line (index contour)", [L("brown", 0.14, [[0, 0], [0, -0.525]])], { rotatable: true }));
  add(text(102.8, "Index contour value", "brown", 1.5, { align: 1, note: "The specification asks for figures 1.5 mm high in a sans-serif font; Arial chosen." }));
  add(line(103, N(103), { color: "brown", w: 0.1, dash: [2.0, 0.2] }));
  add(point(103.9, "Slope line (form line)", [L("brown", 0.1, [[0, 0], [0, -0.45]])], { rotatable: true }));
  add(line(104, N(104), tagged("brown", 0.25, 0.14, 0.525, 0.5, 0.25)));
  add(line(105.1, N(105.1), dotsOn("brown", 0.18, 0.45, 2.0)));
  add(line(105.2, N(105.2), { color: "brown", w: 0.18, prim: { elts: [halfDot("brown", 0.45, 0.18, 0.02)], every: 1.0 } },
    { note: "Draw it with the lower ground on the right: the half dots point to the lower level." }));
  add(line(106, N(106), { color: "brown", w: 0.18, dash: [1.65, 0.35], dashSym: [dot("brown", 0.45)] },
    { note: "The dots are OCAD secondary symbols, centred on the dashes between the first and the last." }));
  add(line(107, N(107), { color: "brown", w: 0.25, ends: "pointed", shorten: [1.0, 1.0] },
    { note: "Tapered over its first and last 1.0 mm (OCAD's pointed ends); the specification draws the whole line tapering." }));
  add(line(108, N(108), dotted("brown", 0.25, 0.45)));
  add(point(109, N(109), [dot("brown", 0.5)]));
  add(point(110, N(110), [A("brown", ellipse(0, 0, 0.4, 0.2))], { rotatable: true }));
  add(point(111, N(111), [uArc("brown", 0.18, 0.31, 0.15)]));
  add(point(112, N(112), [veeForest("brown", 0.7, 0.8, 0.18)]));
  add(area(113, N(113), { struct: scatter(3.4, 0.5, [dot("brown", 0.2)]) }));
  add(area(114, N(114), { struct: scatter(8, 0.25, [dot("brown", 0.2)]) }));
  add(point(115, N(115), [equi("brown", 0.9, 0.18)]));
  // 2 rock and boulders
  add(line(201, N(201), tagged("black", 0.35, 0.12, 0.575, 0.5, 0.25)));
  add(line(202, N(202), tagged("black", 0.25, 0.12, 0.525, 0.5, 0.25)));
  add(line(202.1, "Cliff, without tags", { color: "black", w: 0.25, ends: "round" }));
  add(point(203.1, N(203.1), [veeForest("black", 0.7, 0.8, 0.16)]));
  add(point(203.2, N(203.2), [ring("black", 0.35, 0.9)]));
  add(point(204, N(204), [dot("black", 0.4)]));
  add(point(205, N(205), [dot("black", 0.6)]));
  add(area(206, N(206), { fill: "black" }));
  add(point(207, N(207), [block("black", [[-0.4, 0.23], [0.4, 0.23], [0, -0.46]])]));
  const T865 = [[0, 0], [0.8, 0], [0.46875, -0.37458]];
  const field = (d) => { const a = Math.sqrt(2 / (Math.sqrt(3) * d)); return [block("black", T865, 15, 1, [-a, 0]), block("black", T865, 135, 1, [0, 0]), block("black", T865, 255, 1, [a, 0])]; };
  const fieldNote = "Triangles of sides 8:6:5 on an irregular lattice of the specification's density, three orientations in turn (OCAD's structures cannot turn each element at random).";
  add(area(208, N(208), { struct: scatter(0.9, 0.75, field(0.9), 3) }, { note: fieldNote }));
  add(point(208.9, "Boulder field, single block", [block("black", T865)], { rotatable: true }));
  add(area(209, N(209), { struct: scatter(2.5, 0.45, field(2.5), 3) },
    { note: fieldNote + " Spacing from the density (2.5 a mm²), slightly over the 0.6 mm maximum the text gives." }));
  add(area(210, N(210), { struct: scatter(3.4, 0.45, [dot("black", 0.2)]) }));
  add(area(211, N(211), { struct: scatter(7, 0.32, [dot("black", 0.2)]) }));
  add(area(212, N(212), { struct: scatter(11, 0.25, [dot("black", 0.2)]) }));
  add(area(213, N(213), { fill: "yellow50", struct: screen45("black", 0.16, 0.45) }));
  add(area(214, N(214), { fill: "black35" }));
  add(line(215, N(215), { dbl: { left: "black", right: "black", lw: 0.1, gap: 0.1 } }));
  // 3 water and marsh
  add(line(301.9, "Uncrossable body of water, bank line", { color: "black", w: 0.18 }));
  add(area(301, N(301), { fill: "blue", border: 301.9 }));
  add(line(302.9, "Shallow body of water, outline", { color: "blue", w: 0.1 }));
  add(line(302.8, "Shallow body of water, seasonal outline", { color: "blue", w: 0.1, dash: [1.25, 0.25] }));
  add(area(302, N(302), { fill: "blue50", border: 302.9 }));
  add(area(302.1, "Shallow body of water, seasonal", { fill: "blue50", border: 302.8 }));
  add(point(303, N(303), [veeForest("blue", 0.7, 0.8, 0.18)]));
  add(line(304, N(304), { color: "blue", w: 0.3 }));
  add(line(305, N(305), { color: "blue", w: 0.18 }));
  add(line(306, N(306), { color: "blue", w: 0.18, dash: [1.25, 0.25] }));
  add(line(307.9, "Uncrossable marsh, outline", { color: "black", w: 0.12 }));
  add(area(307, N(307), { hatch: { color: "blue", w: 0.25, dist: 0.5, a1: 0 }, border: 307.9 }));
  add(area(308, N(308), { hatch: { color: "blue", w: 0.1, dist: 0.3, a1: 0 } }));
  add(line(309, N(309), dotted("blue", 0.25, 0.45)));
  add(area(310, N(310), { struct: { mode: 2, w: 1.15, h: 0.3, angle: 0, elts: [L("blue", 0.1, [[-0.45, 0], [0.45, 0]])] } },
    { note: "Dashes 0.9, gaps 0.25, rows 0.3 apart; OCAD's offset rows shift by half a period (0.575 mm, the drawing 0.55)." }));
  add(point(311, N(311), [L("blue", 0.18, [[-0.31, -0.31], [0.31, -0.31], [0.31, 0.31], [-0.31, 0.31], [-0.31, -0.31]], "miter")]));
  add(point(312, N(312), [uArc("blue", 0.18, 0.36, 0.18)], { rotatable: true }));
  add(point(313, N(313), [0, 72, 144, 216, 288].map((a) => L("blue", 0.16, [[0, 0], [0.45 * Math.sin(rad(a)), 0.45 * Math.cos(rad(a))]]))));
  // 4 vegetation
  add(area(401, N(401), { fill: "yellow" }));
  add(area(402, N(402), { fill: "yellow", struct: screen45("whiteY", 0.4, 0.7) }));
  add(area(402.1, "Open land with scattered bushes", { fill: "yellow", struct: screen45("green60", 0.4, 0.7) }));
  add(area(403, N(403), { fill: "yellow50" }));
  add(area(404, N(404), { fill: "yellow50", struct: screen45("whiteY", 0.5, 0.8) }));
  add(area(404.1, "Rough open land with scattered bushes", { fill: "yellow50", struct: screen45("green60", 0.5, 0.8) }));
  add(area(405, N(405), { fill: "white" }, { note: "White at the bottom of the colour table: forest is the paper, this area hides nothing." }));
  const stripes = (color) => ({ color, w: 0.4, dist: 1.5, a1: 0 });
  add(area(406, N(406), { fill: "green30" }));
  add(area(406.1, "Vegetation, slow running, better running direction", { fill: "green30", hatch: stripes("whiteG"), rotatable: true }));
  add(area(407, N(407), { hatch: { color: "green", w: 0.12, dist: 0.84, a1: 90 } }));
  add(area(408, N(408), { fill: "green60" }));
  add(area(408.1, "Vegetation, walk, better running direction (white)", { fill: "green60", hatch: stripes("whiteG"), rotatable: true }));
  add(area(408.2, "Vegetation, walk, better running direction (green 30%)", { fill: "green60", hatch: stripes("green30s"), rotatable: true }));
  add(area(409, N(409), { hatch: { color: "green", w: 0.14, dist: 0.42, a1: 90 } }));
  add(area(410, N(410), { fill: "green" }));
  add(area(410.1, "Vegetation, fight, better running direction (white)", { fill: "green", hatch: stripes("whiteG"), rotatable: true }));
  add(area(410.2, "Vegetation, fight, better running direction (green 30%)", { fill: "green", hatch: stripes("green30s"), rotatable: true }));
  add(area(410.3, "Vegetation, fight, better running direction (green 60%)", { fill: "green", hatch: stripes("green60s"), rotatable: true }));
  add(area(412, N(412), { fill: "yellow", struct: grid("black", 0.2, 0.8) }));
  add(area(413, N(413), { fill: "yellow50", struct: grid("green", 0.45, 0.8), rotatable: true }));
  add(area(413.1, "Orchard, on open land", { fill: "yellow", struct: grid("green", 0.45, 0.8), rotatable: true }));
  const vine = (fill) => ({ fill, rotatable: true, struct: { mode: 2, w: 1.9, h: 0.85, angle: 90, elts: [L("green", 0.2, [[0, -0.65], [0, 0.65]])] } });
  add(area(414, N(414), vine("yellow50")));
  add(area(414.1, "Vineyard or similar, on open land", vine("yellow")));
  add(line(415, N(415), { color: "black", w: 0.1 }));
  add(line(416, N(416), dotted("black", 0.22, 0.45)));
  add(line(416.1, "Distinct vegetation boundary, green line", { color: "darkGreen", w: 0.14, dash: [0.3, 0.2] }));
  // over their white mask (417: 1.1 outside; 418: its white centre; 419: lines 0.36, 0.18 longer at each end along the arms)
  add(point(417, N(417), [dot("whiteMask", 1.1), ring("greenPt", 0.18, 0.9)]));
  add(point(418, N(418), [dot("whiteMask", 0.2), ring("greenPt", 0.2, 0.6)]));
  {
    const m = 0.3865 + 0.18 / Math.SQRT2;
    add(point(419, N(419), [L("whiteMask", 0.36, [[-m, -m], [m, m]]), L("whiteMask", 0.36, [[-m, m], [m, -m]]),
      L("greenPt", 0.18, [[-0.3865, -0.3865], [0.3865, 0.3865]]), L("greenPt", 0.18, [[-0.3865, 0.3865], [0.3865, -0.3865]])]));
  }
  // 5 man-made features
  add(line(501.9, "Paved area, bounding line", { color: "black", w: 0.14 }));
  add(area(501, N(501), { fill: "brown50" }, { note: "Bordered with 501.9 where the paved area has a distinct boundary." }));
  add(line(502, N(502), { dbl: { fill: "brown50", left: "black", right: "black", lw: 0.14, gap: 0.3 } }));
  add(line(503, N(503), { color: "black", w: 0.35 }));
  add(line(504, N(504), { color: "black", w: 0.35, dash: [3.0, 0.25] }));
  add(line(505, N(505), { color: "black", w: 0.25, dash: [2.0, 0.25] }));
  add(line(506, N(506), { color: "black", w: 0.18, dash: [1.0, 0.25] }));
  add(line(507, N(507), { color: "black", w: 0.18, dash: [2.25, 0.8], secGap: 0.25, endGap: 0.25 }));
  add(line(508, N(508), { color: "black", w: 0.14, dash: [2.0, 0.25] }));
  add(line(509, N(509), { color: "whiteK", w: 0.1, dash: [1.0, 1.5], frame: { color: "black", w: 0.35 } },
    { note: "Black 0.35 as OCAD's framing line, the white dashes 0.1 its main line (a white above black)." }));
  const pylon = (lw, h) => [L("black", lw, [[0, -h], [0, h]])];
  add(line(510, N(510), { color: "black", w: 0.14, corner: pylon(0.14, 0.37), start: pylon(0.14, 0.37), end: pylon(0.14, 0.37) },
    { note: "Pylon bars at both ends and at the vertices marked as corners." }));
  add(line(511, N(511), { dbl: { left: "black", right: "black", lw: 0.14, gap: 0.26 }, corner: pylon(0.2, 0.57), start: pylon(0.2, 0.57), end: pylon(0.2, 0.57) },
    { note: "Pylon bars at both ends and at the vertices marked as corners." }));
  const flare = (dir) => [-1, 1].map((s) => L("black", 0.18, [[0, s * 0.45], [dir * 0.4 * Math.cos(rad(60)), s * (0.45 + 0.4 * Math.sin(rad(60)))]]));
  add(line(512, N(512), { dbl: { left: "black", right: "black", lw: 0.18, gap: 0.72 }, start: flare(-1), end: flare(1) },
    { note: "Drawn along the path it carries: the two side lines, their ends turned away at 60°." }));
  add(line(513.1, N(513.1), dotsOn("black", 0.14, 0.4, 2.0)));
  add(line(513.2, N(513.2), { color: "black", w: 0.14, prim: { elts: [halfDot("black", 0.4, 0.14, 0.02)], every: 1.0 } },
    { note: "Draw it with the lower ground on the right: the half dots point to the lower level." }));
  add(line(514, N(514), { color: "black", w: 0.14, dash: [1.65, 0.35], dashSym: [dot("black", 0.4)] },
    { note: "The dots are OCAD secondary symbols, centred on the dashes between the first and the last." }));
  add(line(515, N(515), dotsOn("black", 0.25, 0.6, 3.0, 2, 0.8)));
  const tick60 = (len, lw) => [L("black", lw, [[0, 0], [len * 0.5, -len * 0.866]])];
  add(line(516, N(516), { color: "black", w: 0.14, prim: { elts: tick60(0.4, 0.14), every: 2.0 } }));
  add(line(517, N(517), { color: "black", w: 0.14, dash: [1.65, 0.35], dashSym: tick60(0.4, 0.14) },
    { note: "The ticks are OCAD secondary symbols, on the dashes between the first and the last." }));
  add(line(518, N(518), { color: "black", w: 0.25, prim: { elts: tick60(0.4, 0.14), every: 2.5, n: 2, dist: 0.6 } }));
  add(point(519, N(519), [L("black", 0.18, [[-0.3, -0.5], [-0.3, 0.5]]), L("black", 0.18, [[0.3, -0.5], [0.3, 0.5]])], { rotatable: true }));
  add(line(520.9, "Area that shall not be entered, boundary line", { color: "black", w: 0.18 }));
  add(area(520, N(520), { fill: "olive" }, { note: "Olive green as one colour: yellow 100% + green 50%. Bounded with 520.9 where needed. Revision 6: a path open to the runners goes through on white, 0.15 mm beyond the path on both sides (its black stripes are gone)." }));
  add(line(521.9, "Building, outline", { color: "black", w: 0.2 }));
  add(area(521, N(521), { fill: "black" }));
  add(area(521.1, "Building, large (urban areas)", { fill: "black50", border: 521.9 }));
  add(line(522.9, "Canopy, outline", { color: "black", w: 0.1 }));
  add(area(522, N(522), { fill: "black20", border: 522.9 }));
  add(line(523, N(523), { color: "black", w: 0.16, dash: [0.5, 0.25] }));
  add(point(524, N(524), [dot("black", 0.8), L("black", 0.16, [[-0.7, 0], [0.7, 0]]), L("black", 0.16, [[0, -0.7], [0, 0.7]])]));
  add(point(525, N(525), [L("black", 0.16, [[-0.5, 0.42], [0.5, 0.42]]), L("black", 0.16, [[0, 0.42], [0, -0.5]])]));
  add(point(526, N(526), [ring("black", 0.16, 0.8), dot("black", 0.14)]));
  {
    const a = 0.41, top = 0.354 - 0.092, d = a * Math.tan(rad(30));
    add(point(527, N(527), [L("black", 0.16, [[-a, top - d], [0, top], [a, top - d]]), L("black", 0.16, [[0, top], [0, top + 0.092 - 0.9]])]));
  }
  const chevron = (s, lw) => [L("black", lw, [[-s, s], [0, 0], [-s, -s]])];
  add(line(528, N(528), { color: "black", w: 0.14, prim: { elts: chevron(0.28, 0.14), every: 2.0 } }));
  add(line(529, N(529), { color: "black", w: 0.25, prim: { elts: chevron(0.28, 0.14), every: 2.0, n: 2, dist: 0.6 } }));
  add(point(530, N(530), [ring("black", 0.16, 0.8)]));
  add(point(531, N(531), [L("black", 0.16, [[-0.3435, -0.3435], [0.3435, 0.3435]]), L("black", 0.16, [[-0.3435, 0.3435], [0.3435, -0.3435]])]));
  add(line(532, N(532), { dbl: { left: "black", right: "black", lw: 0.1, gap: 0.4 }, prim: { elts: [L("black", 0.1, [[0, -0.25], [0, 0.25]])], every: 0.25, first: 0 } },
    { note: "Drawn 0.4 mm wide inside (the minimum); the specification draws a stairway to its width on the ground." }));
  // 6 technical symbols
  add(line(601, N(601), { color: "black", w: 0.1 }));
  add(line(601.1, "Magnetic north line, blue", { color: "blue", w: 0.12 }));
  add(point(602, N(602), [L("black", 0.1, [[-1.1, 0], [1.1, 0]]), L("black", 0.1, [[0, -1.1], [0, 1.1]])]));
  add(point(603, N(603), [dot("black", 0.3)]));
  add(text(603.9, "Spot height, figures", "black", 1.5, { note: "Figures 1.5 mm high (Arial)." }));
  course(add, N, false);
  // the LiDAR's helper contours (2026-11-12): karttapullautin's dense contours, every 0.5 or 1 m, in a thin light violet, for
  // drawing form lines by hand; a helper (900 and up), never printed
  add(line(996, N(996), { color: "violet", w: 0.08 }, { note: "A helper: the LiDAR's dense contours, to draw form lines and small landforms by; never printed." }));
  return S;
}

// ---- course symbols (7xx), both sets -------------------------------------------------------------------------------------------
function course(add, N, sprint) {
  const tri = (side) => { const R = side / Math.sqrt(3); return [90, 210, 330, 90].map((a) => [R * Math.cos(rad(a)), R * Math.sin(rad(a))]); };
  add(point(701, N(701), [L("purple", 0.35, tri(sprint ? 7.0 : 6.0), "miter")], { rotatable: true }));
  add(point(702, N(702), [L("purple", 0.6, [[0, -1.25], [0, 1.25]])], { rotatable: true }));
  add(point(703, N(703), [ring("purple", 0.35, (sprint ? 6.0 : 5.0) + 0.35)]));
  add(text(704, N(704), "purple", 4.0, { align: 1, note: "Figures 4.0 mm high (Arial)." }));
  add(line(705, N(705), { color: "purple", w: 0.35 }));
  add(point(706, N(706), [ring("purple", 0.35, (sprint ? 7.0 : 6.0) + 0.35), ring("purple", 0.35, (sprint ? 5.0 : 4.0) + 0.35)]));
  add(line(707, N(707), { color: "purple", w: 0.35, dash: [2.0, 0.5] }));
  add(line(708, N(708), { color: "purple", w: sprint ? 1.0 : 0.7 }));
  const [hw, hd, bw] = sprint ? [0.2, 1.2, 0.4] : [0.2, 1.2, 0.25];
  add(area(709, N(709), { hatch: { color: "purple", w: hw, dist: hd, a1: 45, a2: 135 } }));
  add(line(709.1, "Out-of-bounds area, boundary marked continuously", { color: "purple", w: bw }));
  add(line(709.2, "Out-of-bounds area, boundary marked intermittently", { color: "purple", w: bw, dash: [3.0, 0.5] }));
  if (!sprint) {
    add(point(710, N(710), [-1, 1].map((s) => L("purple", 0.35, quad([s * 0.75, -1.5], [s * 0.2, 0], [s * 0.75, 1.5]))), { rotatable: true }));
    const cross = (h) => [L("purple", 0.35, [[-h, -h], [h, h]]), L("purple", 0.35, [[-h, h], [h, -h]])];
    add(line(711, N(711), { prim: { elts: cross(1.5 / Math.SQRT2), every: 5.0 } }, { note: "Crosses every 5.0 mm (the specification: 4.0 to 6.0)." }));
    add(point(712, N(712), [A("purple", [[-0.67, 2], [0.67, 2], [0.67, 0.67], [2, 0.67], [2, -0.67], [0.67, -0.67], [0.67, -2], [-0.67, -2], [-0.67, -0.67], [-2, -0.67], [-2, 0.67], [-0.67, 0.67], [-0.67, 2]])]));
    const ye = 1.2, yb = -1.55;
    add(point(713, N(713), [
      L("purple", 0.4, [[-1.55, ye], [-0.92, yb + 0.3], ...quad([-0.92, yb + 0.3], [-0.85, yb], [0, yb]).slice(1), ...quad([0, yb], [0.85, yb], [0.92, yb + 0.3]).slice(1), [1.55, ye]], "round"),
      L("purple", 0.4, ellipse(0, ye, 1.55, 0.35), "round"),
    ]));
  } else {
    add(point(710.1, N(710.1), [-1, 1].map((s) => L("purple", 0.5, quad([-2.25, s * 1.1], [0, s * 0.4], [2.25, s * 1.1]))), { rotatable: true }));
    const fl = (dir) => [-1, 1].map((s) => L("purple", 0.35, [[0, s * 0.75], [dir * 1.0, s * 1.5]]));
    add(line(710.2, N(710.2), { dbl: { left: "purple", right: "purple", lw: 0.35, gap: 1.15 }, start: fl(-1), end: fl(1) },
      { note: "The two purple lines along the passage, their ends turned away from it." }));
    add(line(714.9, "Temporary construction or closed area, outline", { color: "purple", w: 0.1 }));
    add(area(714, N(714), { fill: "purple50", border: 714.9 }));
  }
  // a circle as 703 and the triangle inside it, pointing to the next control
  const r = sprint ? 3 : 2.5, h = (r * Math.sqrt(3)) / 2;
  add(point(715, N(715), [ring("purple", 0.35, 2 * r + 0.35), L("purple", 0.35, [[0, r], [-h, -r / 2], [h, -r / 2], [0, r]], "miter")], { rotatable: true }));
}

// ==== ISSprOM 2019-2 (revision 6) ==================================================================================================
function sprint() {
  const S = [];
  const add = (r) => (S.push(r), r);
  const N = (k) => NAMES.issprom[k] || (() => { throw new Error(`name ${k}`); })();
  // 1 landforms
  add(line(101, N(101), { color: "brown", w: 0.21 }));
  add(point(101.9, "Slope line (contour)", [L("brown", 0.21, [[0, 0], [0, -0.86]])], { rotatable: true }));
  add(line(102, N(102), { color: "brown", w: 0.3 }));
  add(point(102.9, "Slope line (index contour)", [L("brown", 0.21, [[0, 0], [0, -0.9]])], { rotatable: true }));
  add(line(103, N(103), { color: "brown", w: 0.15, dash: [3.0, 0.3] }));
  add(point(103.9, "Slope line (form line)", [L("brown", 0.15, [[0, 0], [0, -0.83]])], { rotatable: true }));
  add(line(104, N(104), tagged("brown", 0.27, 0.21, 0.75, 0.75, 0.105)));
  add(line(105.1, N(105.1), dotsOn("brown", 0.27, 0.7, 3.75)));
  add(line(105.2, N(105.2), { color: "brown", w: 0.27, prim: { elts: [halfDot("brown", 0.7, 0.27, 0.11)], every: 1.9 } }));
  add(line(107, N(107), { color: "brown", w: 0.38, ends: "pointed", shorten: [1.0, 1.0] },
    { note: "Tapered over its first and last 1.0 mm (OCAD's pointed ends); the specification draws the whole line tapering." }));
  add(line(108, N(108), dotted("brown", 0.37, 0.6)));
  add(point(109, N(109), [dot("brown", 0.75)]));
  add(point(110, N(110), [A("brown", ellipse(0, 0, 0.6, 0.3))], { rotatable: true }));
  add(point(111, N(111), [uArc("brown", 0.25, 0.475, 0.3)]));
  add(point(112, N(112), [veeSprint("brown", 1.1, 1.25, 0.25)]));
  add(area(113, N(113), { struct: scatter(1.53, 0.45, [dot("brown", 0.3)]) },
    { note: "Density 1.5 dots a mm² as the specification's drawing shows it (its text gives none), never closer than 0.15 mm edge to edge." }));
  add(point(115, N(115), [equi("brown", 1.35, 0.25)]));
  // 2 rock and boulders
  add(line(201, N(201), tagged("black", 0.5, 0.18, 0.75, 0.75, 0.09)));
  add(line(202, N(202), tagged("black", 0.3, 0.18, 0.75, 0.75, 0.09)));
  add(line(202.1, "Passable rock face, without tags", { color: "black", w: 0.3, ends: "round" }));
  add(point(203, N(203), [veeSprint("black", 1.1, 1.25, 0.25)], { rotatable: true }));
  add(point(204, N(204), [dot("black", 0.6)]));
  add(point(205, N(205), [dot("black", 0.9)]));
  add(area(206, N(206), { fill: "black" }));
  add(point(207, N(207), [equi("black", 1.2)]));
  add(point(207.1, "Boulder cluster, enlarged (120%)", [equi("black", 1.44)]));
  const TB = [[0, 0], [0.96, 0], [0.3975, -0.4495]];
  const a8 = Math.sqrt(2 / (Math.sqrt(3) * 0.86));
  add(area(208, N(208), { struct: scatter(0.86, 1.11, [block("black", TB, 15, 1, [-a8, 0]), block("black", TB, 135, 1, [0, 0]), block("black", TB, 255, 1.2, [a8, 0])], 3) },
    { note: "Blocks 0.96 × 0.72 × 0.6 on an irregular lattice, three orientations in turn, one block in three at 120%; density 0.86 a mm² as drawn in the specification." }));
  add(point(208.9, "Boulder field, single block", [block("black", TB)], { rotatable: true }));
  add(area(210, N(210), { struct: scatter(1.15, 0.4, [dot("black", 0.25)]) },
    { note: "Density 1.15 dots a mm² as the specification's drawing shows it, never closer than 0.15 mm edge to edge." }));
  add(area(213, N(213), { fill: "yellow50", struct: screen45("black", 0.18, 0.5) }));
  add(area(214, N(214), { fill: "black35" }));
  // 3 water and marsh
  add(line(301.9, "Uncrossable body of water, bank line", { color: "black", w: 0.18 }));
  add(area(301, N(301), { fill: "blue", border: 301.9 }));
  add(line(302.9, "Shallow body of water, outline", { color: "blue", w: 0.18 }));
  add(area(302, N(302), { fill: "blue30", border: 302.9 }));
  add(point(303, N(303), [veeSprint("blue", 1.1, 1.25, 0.25)]));
  add(line(305, N(305), { color: "blue", w: 0.21 }));
  add(line(306, N(306), { color: "blue", w: 0.21, dash: [1.87, 0.37] }));
  add(line(307.9, "Uncrossable marsh, outline", { color: "black", w: 0.18 }));
  add(area(307, N(307), { hatch: { color: "blue", w: 0.25, dist: 0.5, a1: 0 }, border: 307.9 }));
  add(area(308, N(308), { hatch: { color: "blue", w: 0.12, dist: 0.38, a1: 0 } }));
  add(line(309, N(309), dotted("blue", 0.37, 0.6)));
  add(area(310, N(310), { struct: { mode: 2, w: 1.35, h: 0.38, angle: 0, elts: [L("blue", 0.12, [[-0.5, 0], [0.5, 0]])] } },
    { note: "Dashes 1.0, gaps 0.35, rows 0.38 apart; OCAD's offset rows shift by half a period (0.675 mm, the drawing 0.67)." }));
  add(point(311, N(311), [L("blue", 0.25, [[-0.325, -0.325], [0.325, -0.325], [0.325, 0.325], [-0.325, 0.325], [-0.325, -0.325]], "miter")]));
  add(point(312, N(312), [uArc("blue", 0.25, 0.475, 0.3)], { rotatable: true }));
  add(point(313, N(313), [0, 72, 144, 216, 288].map((a) => L("blue", 0.25, [[0, 0], [0.59 * Math.sin(rad(a)), 0.59 * Math.cos(rad(a))]]))));
  // 4 vegetation
  add(area(401, N(401), { fill: "yellow" }));
  add(area(402, N(402), { fill: "yellow", struct: screen45("whiteY", 0.6, 0.75) }));
  add(area(402.1, "Open land with scattered bushes", { fill: "yellow", struct: screen45("green60", 0.6, 0.75) }));
  add(area(403, N(403), { fill: "yellow50" }));
  add(area(404, N(404), { fill: "yellow50", struct: screen45("whiteY", 0.7, 1.0) }));
  add(area(404.1, "Rough open land with scattered bushes", { fill: "yellow50", struct: screen45("green60", 0.7, 1.0) }));
  add(area(405, N(405), { fill: "white" }, { note: "White at the bottom of the colour table: forest is the paper, this area hides nothing." }));
  const stripes = (color) => ({ color, w: 0.4, dist: 1.5, a1: 0 });
  add(area(406, N(406), { fill: "green30" }));
  add(area(406.1, "Vegetation: slow running, better running direction", { fill: "green30", hatch: stripes("whiteG"), rotatable: true }));
  add(area(407, N(407), { hatch: { color: "green", w: 0.12, dist: 0.84, a1: 90 } }));
  add(area(408, N(408), { fill: "green60" }));
  add(area(408.1, "Vegetation: walk, better running direction (white)", { fill: "green60", hatch: stripes("whiteG"), rotatable: true }));
  add(area(408.2, "Vegetation: walk, better running direction (green 30%)", { fill: "green60", hatch: stripes("green30s"), rotatable: true }));
  add(area(409, N(409), { hatch: { color: "green", w: 0.14, dist: 0.42, a1: 90 } }));
  add(area(410, N(410), { fill: "green" }));
  add(area(410.1, "Vegetation: fight, better running direction (white)", { fill: "green", hatch: stripes("whiteG"), rotatable: true }));
  add(area(410.2, "Vegetation: fight, better running direction (green 30%)", { fill: "green", hatch: stripes("green30s"), rotatable: true }));
  add(area(410.3, "Vegetation: fight, better running direction (green 60%)", { fill: "green", hatch: stripes("green60s"), rotatable: true }));
  add(area(411, N(411), { fill: "darkGreen" }, { note: "Dark green as green 100% + black 50%." }));
  add(area(412, N(412), { fill: "yellow", struct: grid("black", 0.2, 0.8) }));
  add(area(413, N(413), { fill: "yellow50", struct: grid("green", 0.68, 1.2), rotatable: true }));
  add(area(413.1, "Orchard, on open land", { fill: "yellow", struct: grid("green", 0.68, 1.2), rotatable: true }));
  const vine = (fill) => ({ fill, rotatable: true, struct: { mode: 2, w: 2.9, h: 1.3, angle: 90, elts: [L("green", 0.3, [[0, -1.0], [0, 1.0]])] } });
  add(area(414, N(414), vine("yellow50")));
  add(area(414.1, "Vineyard or similar, on open land", vine("yellow")));
  add(line(415, N(415), { color: "black", w: 0.15 }));
  add(line(416, N(416), dotted("black", 0.25, 0.6)));
  // over their white mask (417: 1.4 outside; 418: its white centre; 419: lines 0.50, 0.25 longer at each end along the arms)
  add(point(417, N(417), [dot("whiteMask", 1.4), ring("greenPt", 0.25, 1.2)]));
  add(point(418, N(418), [dot("whiteMask", 0.2), ring("greenPt", 0.3, 0.8)]));
  add(point(419, N(419), [...squareCross("whiteMask", 1.2 + 0.5 / Math.SQRT2, 0.5), ...squareCross("greenPt", 1.2, 0.25)]));
  // 5 man-made features
  add(area(501, N(501), { fill: "brown30" }));
  add(area(501.4, "Paved area, heavy traffic (brown 50%)", { fill: "brown50" }, { note: "The specification's 50% form of 501; numbered 501.4 by Ozimut." }));
  add(line(501.1, N(501.1), { color: "black", w: 0.1 }));
  add(line(501.2, N(501.2), { color: "black", w: 0.1, dash: [0.7, 0.2], shorten: [0.15, 0.15] },
    { note: "Dashed as the specification draws it, a gap of 0.15 mm left at both ends." }));
  add(area(501.3, N(501.3), { fill: "brown30", struct: screen45("whiteB", 0.6, 0.75) }));
  // a paved footway or cycle path as a line (a mapper's review, 2026-11-12: « a paved area without edge is very seldom useful
  // — and there it is a path »): the paved strip in brown 30 % between two thin black edges, at its width on the ground —
  // OpenOrienteering Mapper's 501.6-501.9 « paved area, footprint 1.4 / 2 / 3 / 4 m » (1:4 000: 0.35 to 1 mm)
  [1.4, 2, 3, 4].forEach((m, i) => add(line(`501.${6 + i}`, N(`501.${6 + i}`), { dbl: { fill: "brown30", left: "black", right: "black", lw: 0.1, gap: (m * 1000) / 4000 } },
    { note: "A paved path drawn at its width on the ground (OpenOrienteering Mapper's numbering); the strip between the edges' centres." })));
  add(line(505, N(505), { dbl: { fill: "brown30", left: "black", right: "black", lw: 0.12, gap: 0.38, dashed: [2.0, 0.25], mode: 3 } },
    { note: "OCAD fills between the side lines only: the brown band is 0.38 mm wide under the dashes' gaps (0.5 in the drawing, the same outer width)." }));
  add(line(506, N(506), { color: "black", w: 0.27, dash: [1.5, 0.37] }));
  add(line(507, N(507), { color: "black", w: 0.27, dash: [3.37, 1.5], secGap: 0.37, endGap: 0.37 }));
  add(line(508, N(508), { color: "black", w: 0.21, dash: [4.5, 0.75] }));
  add(line(509.1, N(509.1), { color: "whiteK", w: 0.1, dash: [1.0, 1.5], frame: { color: "black", w: 0.35 } },
    { note: "Black 0.35 as OCAD's framing line, the white dashes 0.1 its main line (a white above black)." }));
  add(line(509.2, N(509.2), { dbl: { left: "black", right: "black", lw: 0.08, gap: 0.14 } }));
  const pylon = (lw, h) => [L("black", lw, [[0, -h], [0, h]])];
  add(line(510, N(510), { color: "black", w: 0.14, corner: pylon(0.14, 0.37), start: pylon(0.14, 0.37), end: pylon(0.14, 0.37) },
    { note: "Pylon bars at both ends and at the vertices marked as corners." }));
  const big = [...pylon(0.2, 1.12), L("black", 0.2, [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3], [-0.3, -0.3]], "miter")];
  add(line(511, N(511), { dbl: { left: "black", right: "black", lw: 0.14, gap: 1.36 }, corner: big, start: big, end: big },
    { note: "Pylon (bar and 0.8 mm footprint) at both ends and at the vertices marked as corners." }));
  const tw = 0.7, th = (tw * Math.sqrt(3)) / 2;
  add(line(512.1, N(512.1), { prim: { elts: [A("black", [[-tw / 2, 0], [tw / 2, 0], [0, -th], [-tw / 2, 0]])], every: tw } },
    { note: "Drawn along the bridge's edge, the triangles on the right of the line's direction (toward the lower level)." }));
  add(line(512.2, N(512.2), { color: "black", w: 0.2, dash: [0.2, 0.25] }));
  add(area(512.3, N(512.3), { hatch: { color: "white5123", w: 0.3, dist: 0.6, a1: 45 }, rotatable: true },
    { note: "White stripes drawn over the area's own colour (draw it over the paved area)." }));
  add(line(513.1, N(513.1), dotsOn("black", 0.21, 0.6, 3.75)));
  add(line(513.2, N(513.2), { color: "black", w: 0.21, prim: { elts: [halfDot("black", 0.6, 0.21, 0.09)], every: 1.9 } }));
  add(line(515, N(515), { color: "black", w: 0.4 }));
  const tick60 = (len, lw) => [L("black", lw, [[0, 0], [len * 0.5, -len * 0.866]])];
  add(line(516, N(516), { color: "black", w: 0.21, prim: { elts: tick60(0.75, 0.14), every: 3.75 } }));
  add(line(518, N(518), { color: "black", w: 0.4, prim: { elts: tick60(0.75, 0.14), every: 3.75, n: 2, dist: 0.9 } }));
  add(point(519, N(519), [L("black", 0.25, [[-0.625, -0.7], [-0.625, 0.7]]), L("black", 0.25, [[0.625, -0.7], [0.625, 0.7]])], { rotatable: true }));
  add(line(520.9, "Area that shall not be entered, boundary line", { color: "black", w: 0.1 }));
  add(area(520, N(520), { fill: "olive", border: 520.9 }, { note: "Olive green as one colour: yellow 100% + green 50%." }));
  add(line(521.9, "Building, outline", { color: "black", w: 0.14 }));
  add(area(521, N(521), { fill: "black50", border: 521.9 }));
  add(line(522.9, "Canopy, outline", { color: "black", w: 0.1 }));
  add(area(522, N(522), { fill: "black20", border: 522.9 }));
  add(area(522.1, N(522.1), { fill: "black" }, { note: "Drawn in the pillar's own shape, at least 0.5 × 0.5 mm." }));
  add(point(524, N(524), [dot("black", 1.2), L("black", 0.25, [[-1.05, 0], [1.05, 0]]), L("black", 0.25, [[0, -1.05], [0, 1.05]])]));
  add(point(525, N(525), [L("black", 0.22, [[-0.75, 0.64], [0.75, 0.64]]), L("black", 0.22, [[0, 0.64], [0, -0.75]])]));
  add(point(526, N(526), [ring("black", 0.22, 1.0), dot("black", 0.2)]));
  {
    const t = 0.64, dx = 0.87 * Math.sin(rad(60)), dy = 0.87 * Math.cos(rad(60));
    add(point(527, N(527), [L("black", 0.22, [[-dx, t - dy], [0, t], [dx, t - dy]]), L("black", 0.22, [[0, t], [0, -0.75]])]));
  }
  const chevron = (s, lw) => [L("black", lw, [[-s, s], [0, 0], [-s, -s]])];
  add(line(528, N(528), { color: "black", w: 0.21, prim: { elts: chevron(0.53, 0.14), every: 3.75 } }));
  add(line(529, N(529), { color: "black", w: 0.4, prim: { elts: chevron(0.53, 0.14), every: 3.75, n: 2, dist: 0.9 } }));
  add(point(530, N(530), [ring("black", 0.22, 1.0)]));
  add(point(531, N(531), squareCross("black", 1.2, 0.22)));
  add(line(532, N(532), { dbl: { left: "black", right: "black", lw: 0.1, gap: 1.56 }, prim: { elts: [L("black", 0.1, [[0, -0.83], [0, 0.83]])], every: 0.47, first: 0 } },
    { note: "Drawn 1.66 mm wide outside, as the specification's drawing; a stairway is drawn to its width on the ground (at least 0.4 mm inside)." }));
  // stairways at their width on the ground (a mapper's review, 2026-11-12: one width for all drew 6.6 m over a street): the
  // side lines 0.5 to 2 mm apart (2 to 8 m at 1:4 000), the treads 0.05 mm beyond them, as 532
  [0.5, 0.75, 1.0, 1.25, 1.5, 2.0].forEach((w, i) => add(line(`532.${i + 1}`, N(`532.${i + 1}`),
    { dbl: { left: "black", right: "black", lw: 0.1, gap: w }, prim: { elts: [L("black", 0.1, [[0, -(w / 2 + 0.05)], [0, w / 2 + 0.05]])], every: 0.47, first: 0 } },
    { note: `A stairway ${w} mm wide between its side lines' centres (${w * 4} m at 1:4 000).` })));
  add(area(533, N(533), { struct: screen45("black50", 0.55, 0.75) }));
  // 6 technical symbols
  add(line(601, N(601), { color: "black", w: 0.14 }));
  add(line(601.1, "Magnetic north line, blue", { color: "blue", w: 0.18 }));
  course(add, N, true);
  // helpers (900 and up: never printed, Cartographier's exports leave them out): a « boundary to confirm » — the edge of ground
  // not to be entered where no wall, fence or hedge is known, for the mapper to replace on the ground (a mapper's review,
  // 2026-11-12) — and OpenStreetMap's ways and tagged nodes, kept hidden for the mapper to show at will
  add(line(995, N(995), { color: "purple50", w: 0.25 }, { note: "A helper: replace it by a wall, a fence, a hedge or nothing once seen on the ground." }));
  add(line(990, N(990), { color: "purple50", w: 0.1 }, { status: 2, note: "Hidden: every OpenStreetMap way of the area, for reference." }));
  add(point(991, N(991), [ring("purple50", 0.1, 0.3)], { status: 2, note: "Hidden: every tagged OpenStreetMap node of the area, for reference." }));
  // a passage beneath a bridge, the railway or a building (tools/virtually/town_map.py): hidden, for the game, which makes it runnable
  add({ ...area(993, N(993), { fill: "brown30" }, { note: "Hidden: a passage at the lower level, which Pixel's game makes runnable whatever lies above it." }), status: 2 });
  // the LiDAR's helper contours (2026-11-12): karttapullautin's dense contours, every 0.5 or 1 m, in a thin light violet, for
  // drawing form lines by hand; a helper (900 and up), never printed
  add(line(996, N(996), { color: "violet", w: 0.08 }, { note: "A helper: the LiDAR's dense contours, to draw form lines and small landforms by; never printed." }));
  return S;
}

// ---- minimum sizes ------------------------------------------------------------------------------------------------------------
// Map mm at the set's scale; area in mm², length and width in mm, gap = the clear space to the next symbol (passages between
// impassable features). Only what the specifications state: a symbol's own text, else the general rules of §2.11 (ISOM:
// widths 0.25 for 100% green, 0.3 for 100% yellow, 0.4 for screens; passages between impassable features 0.4) — marked
// « general » in MIN_NOTES. « n dashes / dots » lengths as the text converts them.
const MIN = {
  isom: {
    101: { length: 0.9, width: 0.6 }, 103: { length: 1.1 }, 104: { length: 0.6 }, "105.1": { length: 1.4 }, "105.2": { length: 1.4 }, 106: { length: 3.65 }, 107: { length: 1.15 },
    108: { length: 0.7 }, 201: { length: 0.6 }, 202: { length: 0.6 }, 206: { width: 0.25, area: 0.3 }, 213: { area: 1 }, 214: { area: 1 },
    215: { length: 1.0 }, 301: { width: 0.3, area: 0.3025 }, 302: { width: 0.3, area: 0.49 }, 304: { length: 1.0 }, 305: { length: 1.0 }, 306: { length: 2.75 },
    307: { width: 0.8 }, 308: { area: 0.2 }, 309: { length: 0.7 }, 310: { area: 1.4 }, 401: { width: 0.3 }, 402: { width: 1.5, area: 4 },
    403: { area: 1, width: 0.4 }, 404: { width: 1.5, area: 6.25 }, 405: { area: 1 }, 406: { area: 1, width: 0.4 }, 407: { area: 1.5 }, 408: { area: 0.49, width: 0.3 },
    409: { area: 1 }, 410: { width: 0.25 }, 412: { area: 9 }, 413: { area: 4 }, 414: { area: 4 }, 415: { length: 2.0 }, 416: { length: 2.0 }, "416.1": { length: 1.8 },
    501: { area: 1 }, 502: { width: 0.58 }, 504: { length: 6.25 }, 505: { length: 4.25 }, 506: { length: 2.25 }, 507: { length: 5.3 }, 508: { length: 3.25 },
    509: { length: 4.0 }, 510: { length: 5.0 }, 512: { length: 0.4 }, "513.1": { length: 1.4 }, "513.2": { length: 1.4 }, 514: { length: 3.65 }, 515: { length: 3.0, gap: 0.4 },
    516: { length: 1.5 }, 517: { length: 3.65 }, 518: { length: 2.0, gap: 0.4 }, 519: { gap: 0.4 }, 520: { area: 1, gap: 0.4 }, 521: { area: 0.25, gap: 0.4 },
    522: { area: 0.36, width: 0.4 }, 523: { area: 0.64 }, 528: { length: 1.5 }, 529: { length: 2.0 }, 532: { width: 0.4 }, 707: { length: 4.5 },
    708: { length: 1.0 }, 709: { width: 3, area: 9 }, 711: { length: 6.0 },
  },
  issprom: {
    "105.1": { length: 1.4 }, 107: { length: 2.0 }, 108: { length: 1.6 }, 201: { length: 0.9 }, 202: { length: 0.9 }, 206: { width: 0.3, area: 0.75 },
    213: { width: 0.3, area: 1 }, 214: { width: 0.25, area: 1 }, 301: { width: 0.3, area: 0.5 }, 302: { width: 0.3, area: 0.5 }, 305: { length: 1.0 },
    306: { length: 4.11 }, 307: { width: 0.75 }, 308: { width: 0.5 }, 309: { length: 1.0 }, 401: { width: 0.3, area: 0.5 }, 402: { width: 2.2, area: 6.25 },
    403: { area: 1, width: 0.4 }, 404: { width: 2.5, area: 6.25 }, 405: { width: 0.3, area: 1 }, 406: { width: 0.4, area: 1 }, 407: { width: 0.96 },
    408: { width: 0.4, area: 0.5 }, 409: { width: 0.56 }, 410: { width: 0.25, area: 0.5 }, 411: { width: 0.4, area: 0.3 }, 412: { width: 3, area: 9 },
    413: { width: 2, area: 4 }, 414: { width: 2, area: 4 }, 415: { length: 1.0 }, 416: { length: 2.65 }, "501.3": { width: 2.2, area: 6.25 },
    506: { length: 3.4 }, 507: { length: 7.9 }, 508: { length: 9.75 }, "509.1": { length: 4.0 }, "512.2": { length: 0.75 }, "513.1": { length: 1.4 },
    "513.2": { length: 1.4 }, 515: { gap: 0.4 }, 516: { length: 2.2 }, 518: { length: 3.0, gap: 0.4 }, 520: { width: 0.25, area: 0.25, gap: 0.4 },
    521: { width: 0.5, area: 0.25, gap: 0.4 }, 522: { width: 0.5, area: 0.25 }, 528: { length: 2.2 }, 529: { length: 3.0 }, 532: { width: 0.4 },
    709: { width: 2, area: 4 }, 714: { width: 0.5, area: 0.25 },
  },
};
const MIN_NOTES = {
  general: "Gaps between symbols: 0.15 mm in general (both specifications); passages between impassable features and openings in impassable lines: 0.4 mm; openings in other lines: 0.25 mm (ISOM 2017-2 §2.11.3).",
  isom: {
    101: "A contour knoll: 0.9 mm long, 0.6 mm wide (outside); a depression: 1.1 × 0.7 mm.",
    103: "A closed form line (knoll or depression): 1.1 mm outside; an open one: two dashes.",
    301: "Inside the bank line: 0.55 × 0.55 mm.", 302: "Inside the outline: 0.7 × 0.7 mm; without outline (full colour): 0.55 × 0.55 mm.",
    307: "Revision 6: « 2 lines or 0.8 mm (inside) ».", 416: "Revision 6: the dotted line 5 dots (2.0 mm), the green dashed line 4 dashes (1.8 mm).",
    108: "Revision 6: two dots (0.7 mm).",
    401: "general (100% yellow).", 403: "width: general (screens).", 410: "general (100% green).",
    405: "For openings in screens; in 408 and 401 0.7 × 0.7 mm, in 410 0.55 × 0.55 mm.", 502: "0.3 + 2 × 0.14 mm.",
    515: "gap: general (passages between impassable features).", 518: "gap: general.", 519: "The opening in an impassable wall or fence (general rule).",
    520: "gap: general.", 521: "Passages between buildings and other impassable features 0.4 mm; passages through buildings at least 0.3 mm wide.",
  },
  issprom: {
    _source: "ISSprOM 2019 (bilingual edition) mapped to revision 6's numbers: 2019's 105 is 105.1, its 410 « Impassable vegetation » is 411.",
    307: "« 2 lines »: two of its lines, 0.5 + 0.25 mm.", 308: "« 2 lines »: 0.38 + 0.12 mm.", 407: "« 2 lines »: 0.84 + 0.12 mm.", 409: "« 2 lines »: 0.42 + 0.14 mm.",
    403: "width: general (screens).", 410: "Revision 6's « Vegetation: fight » has no text in 2019: the general rules (100% green: width 0.25, area 0.5 mm²).",
    405: "Openings; in 408 and 401 0.5 mm².", 515: "gap: general.", 518: "gap: general (shorter than 3 mm: symbol 515).", 521: "gap: the text's 0.40 mm between buildings and other impassable features.",
  },
};

// ---- names: the catalogue's English (ms.s.<code>, ms.sp.s.<code>) -------------------------------------------------------------
const NAMES = { isom: {}, issprom: {} };
{
  const { default: dict } = await import("../../site/assets/js/i18n/en.js");
  for (const [k, v] of Object.entries(dict)) {
    let m = /^ms\.s\.(\d{3}(?:\.\d)?)$/.exec(k); if (m) NAMES.isom[m[1]] = v;
    m = /^ms\.sp\.s\.(\d{3}(?:\.\d)?)$/.exec(k); if (m) NAMES.issprom[m[1]] = v;
  }
}

// ---- build -----------------------------------------------------------------------------------------------------------------------
function finish(standard, scale, symbols, minKey) {
  const used = new Set();
  const addC = (n) => { if (n) used.add(n); };
  for (const s of symbols) {
    const cs = new Set();
    const els = [...(s.elts || []), ...(s.prim || []), ...(s.sec || []), ...(s.corner || []), ...(s.start || []), ...(s.end || [])];
    els.forEach((e) => cs.add(e.color));
    if (s.otp === 2) { if (s.lineWidth) cs.add(s.lineColor); if (s.frWidth) cs.add(s.frColor); if (s.dblMode) { if (s.dblFlags & 1) cs.add(s.dblFillColor); if (s.dblLeftWidth) cs.add(s.dblLeftColor); if (s.dblRightWidth) cs.add(s.dblRightColor); } }
    if (s.otp === 3) { if (s.fillOn) cs.add(s.fillColor); if (s.hatchMode) cs.add(s.hatchColor); }
    if (s.otp === 4) cs.add(s.fontColor);
    cs.forEach(addC);
    s.nColors = cs.size;
    s.set = standard;
    // the specification's own number, else (a form Ozimut numbered, not a .8/.9 helper) the number it is a form of
    const n = Math.floor(s.sym / 1000), sub = s.sym % 1000, code = sub ? `${n}.${sub}` : `${n}`;
    const min = MIN[minKey][code] ?? (sub && sub < 8 && !NAMES[minKey][code] ? MIN[minKey][n] : undefined);
    if (min) s.min = { ...min };
  }
  const colors = COLORS.map(([k, name, cmyk]) => ({ num: NUM[k], name, cmyk, overprint: OVERPRINT.has(k) })).filter((x) => used.has(x.num));
  // compile once to measure the extents, and to fail loudly on a record the renderer refuses
  const ctx = makeContext(VERSION, colors);
  for (const s of symbols) if (s.otp !== 3 && s.otp !== 4) compileSymbol(s, ctx);
  for (const s of symbols) if (s.otp === 3 || s.otp === 4) compileSymbol(s, ctx);
  for (const s of symbols) {
    const d = ctx.symdefs.get(symId(s.sym, VERSION));
    if (!d) throw new Error(`${standard} ${s.sym}: not compiled ${ctx.map.notes.join("; ")}`);
    let ext = 0;
    if (s.otp === 1) ext = d.glyph.radius;
    else if (s.otp === 2) ext = (d.maxThick ?? 0) / 2;
    else if (s.otp === 3) ext = d.border ? d.border.maxThick / 2 : 0;
    s.extent = H(ext);
  }
  const ids = new Set();
  for (const s of symbols) { if (ids.has(s.sym)) throw new Error(`${standard}: ${s.sym} twice`); ids.add(s.sym); }
  return { format: "ozimut-symbolset", version: 1, standard, scale, colors, symbols };
}
function write(name, set) {
  const lines = [
    `{"format":"${set.format}","version":${set.version},"standard":"${set.standard}","scale":${set.scale},`,
    `"colors":[`, set.colors.map((x) => JSON.stringify(x)).join(",\n"), `],`,
    `"symbols":[`, set.symbols.map((x) => JSON.stringify(x)).join(",\n"), `]}`,
  ];
  writeFileSync(join(OUT, name), lines.join("\n") + "\n");
}

mkdirSync(OUT, { recursive: true });
const sets = { forest: finish("ISOM2017-2", 15000, forest(), "isom"), sprint: finish("ISSprOM2019-2", 4000, sprint(), "issprom") };
write("isom2017-2.json", sets.forest);
write("issprom2019-2.json", sets.sprint);
const mins = { format: "ozimut-minimums", version: 1, units: "map mm at the standard's own scale (ISOM 1:15 000, ISSprOM 1:4 000); area in mm²",
  isom: Object.fromEntries(Object.entries(MIN.isom).map(([k, v]) => [String(k), v])), issprom: Object.fromEntries(Object.entries(MIN.issprom).map(([k, v]) => [String(k), v])), notes: MIN_NOTES };
writeFileSync(join(OUT, "minimums.json"), JSON.stringify(mins, null, 1) + "\n");
for (const [k, s] of Object.entries(sets)) console.log(k, s.standard, "symbols", s.symbols.length, "colours", s.colors.length, "with min", s.symbols.filter((x) => x.min).length);
