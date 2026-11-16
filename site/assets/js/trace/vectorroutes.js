// OCAD and OpenOrienteering Mapper maps for the route choices (administrators, a prototype; 2026-10-24): the map's own
// symbols, read by the Tracer's vector engine (tracer/vmap/, a port of Purple Pen's), say exactly what the terrain is where the
// colours of an image only suggest it — a dashed path is one line, a fence is not a path, a contour is nothing.
//
// The symbols are drawn into the layers trace/routechoice.js's cells read (`layers`), on the pixels of the map shown:
// - areas by their fill colour (or, with none, their hatching's or pattern's): the yellows, greens, blue (water, shallow water),
//   brown (paved), grey and black (buildings; light grey passable), olive or purple (out of bounds) — the colour, not the symbol
//   number, since ISOM 2000, ISOM 2017 and ISSprOM number them differently; drawn colour by colour from the bottom of the map's
//   colour table, so that a green over a yellow wins as on the map;
// - lines by their symbol number, in the map's standard (`STANDARDS`, `standardOf`): roads and vehicle tracks (501-504), footpaths
//   (505), small paths and rides (506-508) — the three kinds of path, solid even when the map dashes them; impassable
//   cliffs, walls and fences (201, 515, 518; ISOM 2000's and ISSOM 2007's 201, 521, 524) block, drawn at their line's own
//   width (not the span of a fence's ticks) and crossed only at a crossing point (519; ISOM 2000's 525: owner, 2026-11-05 — a
//   path crossing an impassable fence or running along it opens nothing, as ISOM says); passable walls, fences and
//   cliffs, vegetation boundaries are handrails; blue lines are streams;
// - what is passable but takes time to get over (owner, 2026-11-10, after Sárközy & Albert's comparison of route models): earth
//   banks and walls, erosion gullies (104-108; ISOM 2000's 106-110), passable cliffs (202; ISOM 2000's 203), passable walls and
//   fences (513, 514, 516, 517; ISOM 2000's 519, 520, 522, 523 and its crossable pipeline 533) — the `cross` layer, at their
//   line's own width: each crossing costs a few seconds (trace/routechoice.js `costs`, the setting `cross`), and they are
//   handrails too;
// - the ground that slows running whatever grows on it, by its number (`slow`: 1 slow running, 2 walk, 3 fight): dense boulder
//   field 209, stony ground 210 (slow), 211 (walk), 212 (fight), sandy ground 213 — ISOM 2000's 210 and 211 both slow — when
//   they are areas (a stony ground drawn as single dots, below the specification's density, is scattered stones), laid
//   over the vegetation instead of taking its place (their black dots were read as slow-running forest, a boulder field's 208
//   too, which ISOM says does not slow); by number also: 409 walk with good visibility (its stripes read as slow running), the
//   uncrossable marsh (307; ISOM 2000's 309) and the impassable vegetation (ISSprOM's 411); 529, a prominent impassable line.
// Contours, points, text and the course are not drawn. A map that is not the one shown is placed through both georeferences.
// A table per symbol (the Tracer's « Vitesses par symbole », owner 2026-11-16, after OCAD's Route Analyzer): `table` { symbol id:
// { role, speed } } overrides what a symbol is (`AREA_ROLES`, `LINE_ROLES`; "none": ignored) and, with `speed` (% of white forest's
// speed; 0: impassable), how fast it is crossed or followed — two more planes, `speed` (areas) and `pspeed` (lines), which the
// cells take over the class's own speed (trace/routechoice.js cells, costs). `symbolRoles` lists a map's symbols with what
// they are read as without a table.

import { A, INK, kindOf } from "./routechoice.js";

export const isVectorName = (name) => /\.(ocd|omap|xmap)$/i.test(name || "");
export const VECTOR_ACCEPT = ".ocd,.omap,.xmap";

// The symbols' meaning by their number, in each standard (read on the test maps, 2026-11-10): ISOM 2017, whose numbers ISSprOM
// shares; ISOM 2000, whose numbers ISSOM 2007 (the sprint standard before ISSprOM) shares — 505 a vehicle track, 506 a footpath,
// 507-509 the small paths and the ride, 515 the railway, 516-517 power lines, 518 a tunnel, 519 and 520 the stone wall and the
// ruined one, 521 the high (impassable) wall, 522-524 the same for fences, 525 the crossing point, 533 and 534 the crossable and
// uncrossable pipelines, 106-110 the earth banks, walls and gullies, 203 the passable rock face, 309 the uncrossable marsh (Purple
// Pen's SampleMap and Ormeau) —; and an ISOM 2000 template numbered one more from 516 on (Purple Pen's Penistone Hill and
// Woodland): 516 the railway, 517-518 power lines, 520-525 the walls and fences, 535-536 the pipelines, 525 a high fence.
// (Before, every map's 515 and 518 blocked: ISOM 2000's railway and tunnel.)
// paths: the path layer's kinds (routechoice.js PATH); blocks: impassable lines; hand: handrails; cross: passable but each crossing
// costs time; slow: the ground that slows running, laid over the vegetation (1 slow running, 2 walk, 3 fight; 0: no slowing, nor any
// area class — a boulder field); area: areas whose number says more than their colour (walk with good visibility, whose stripes read
// as slow running; the uncrossable marsh, whose blue hatching read as marsh; ISSprOM's impassable vegetation, drawn as a building:
// impassable but a path opens it); crossing: the crossing point of an impassable wall or fence.
const OLD_PATHS = new Map([[501, 3], [502, 3], [503, 3], [504, 3], [505, 3], [506, 2], [507, 1], [508, 1], [509, 1]]);
const OLD_SLOW = new Map([[208, 0], [210, 1], [211, 1]]), OLD_AREA = new Map([[409, A.G2], [309, A.WATER]]);
const STANDARDS = {
  2017: {
    paths: new Map([[501, 3], [502, 3], [503, 3], [504, 3], [505, 2], [506, 1], [507, 1], [508, 1]]),
    blocks: new Set([201, 515, 518, 521, 529]),
    hand: new Set([202, 416, 415, 513, 514, 516, 517, 519, 520, 522, 523]),
    cross: new Set([104, 105, 106, 107, 108, 202, 513, 514, 516, 517]),
    slow: new Map([[208, 0], [209, 1], [210, 1], [211, 2], [212, 3], [213, 1]]),
    area: new Map([[409, A.G2], [307, A.WATER], [411, A.BUILDING]]),
    crossing: 519,
  },
  2000: {
    paths: OLD_PATHS,
    blocks: new Set([201, 521, 524, 534]),
    hand: new Set([203, 414, 415, 416, 515, 516, 517, 519, 520, 522, 523, 533]),
    cross: new Set([106, 107, 108, 109, 110, 203, 519, 520, 522, 523, 533]),
    slow: OLD_SLOW, area: OLD_AREA,
    crossing: 525,
  },
  "2000+1": {
    paths: OLD_PATHS,
    blocks: new Set([201, 522, 525, 536]),
    hand: new Set([203, 414, 415, 416, 516, 517, 518, 520, 521, 523, 524, 535]),
    cross: new Set([106, 107, 108, 109, 110, 203, 520, 521, 523, 524, 535]),
    slow: OLD_SLOW, area: OLD_AREA,
    crossing: null,
  },
};
/** The map's standard (2017, 2000 or "2000+1"), from what its own symbols are where the standards differ: 104 is ISOM 2017's
 *  earth bank (a line) and the older standards' slope line (a point), 109 and 110 ISOM 2017's knolls (points) and their erosion
 *  gullies (lines), 113 ISOM 2017's broken ground (an area) and their small depression or knoll (a point); then 525 is ISOM 2000's
 *  crossing point (a point) and the shifted template's high fence (a line). The definitions count, used or not. */
export function standardOf(map) {
  let v = 0, shifted = 0;
  for (const d of map.symdefs) {
    const n = Math.floor(parseFloat(d.id));
    if (n === 104) v += d.kind === "point" ? 1 : d.kind === "line" ? -1 : 0;
    else if (n === 109 || n === 110) v += d.kind === "line" ? 1 : d.kind === "point" ? -1 : 0;
    else if (n === 113) v += d.kind === "point" ? 1 : d.kind === "area" ? -1 : 0;
    else if (n === 525) shifted += d.kind === "line" ? 1 : d.kind === "point" ? -1 : 0;
  }
  return v <= 0 ? 2017 : shifted > 0 ? "2000+1" : 2000;
}
const CROSSING_M = 3, CROSSING_MM = 0.6;                       // a crossing point's opening: its symbol's half size, at least so many metres and mm

/**
 * Read a vector map: { map (VMap), format, version, scale, ox, oy, w, h (the frame in mm, as the Tracer opens it), geo (the
 * affine (lon, lat) → frame mm, or null), geoName }.
 */
export async function readVector(bytes, name = "") {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ocad = u8.length > 4 && u8[0] === 0xad && u8[1] === 0x0c;
  const mod = ocad ? await import("../tracer/vmap/ocad.js") : await import("../tracer/vmap/oom.js");
  const { map, version } = ocad ? mod.readOcad(u8) : mod.readOom(u8);
  const b = map.bounds(), M = 2;                       // the frame of tracer/mapsrc.js openVector: 2 mm around what is drawn
  const ox = Math.floor(b[0] - M), oy = Math.floor(b[1] - M), w = Math.max(10, Math.ceil(b[2] + M - ox)), h = Math.max(10, Math.ceil(b[3] + M - oy));
  let geo = null, geoName = "";
  try { const { geoFromVector } = await import("../tracer/vmap/georef.js"); const g = await geoFromVector(map, { ox, oy, w, h }); if (g) { geo = g.geo; geoName = g.name; } }
  catch (e) { console.warn(e); }
  return { map, format: ocad ? "ocad" : "oom", version, scale: map.scale, ox, oy, w, h, geo, geoName, name };
}

/** The map drawn as an image (the map shown when no image of it is given): { image (canvas), k (px per mm) }. */
export async function renderVector(bytes, name) {
  const { openMap } = await import("../tracer/mapsrc.js");
  const src = await openMap(bytes, "", name);
  return { image: src.image, k: src.pxW / src.w };
}

/** The frame's mm to [lat, lon] (the georeference's inverse), or null without one. */
export function latLonOf(v) {
  const g = v.geo;
  if (!g) return null;
  const det = g.a * g.e - g.b * g.d;
  return (x, y) => { const u = x - g.c, w = y - g.f; return [(g.a * w - g.d * u) / det, (g.e * u - g.b * w) / det]; };
}
/** The affine from the file's mm to the pixels of the image rendered at k px per mm (renderVector's). */
export const ownImage = (v, k) => ({ a: k, b: 0, c: -v.ox * k, d: 0, e: -k, f: (v.oy + v.h) * k });
/**
 * The affine from the file's mm to the pixels of another image of the map, through the vector map's georeference and the
 * image's toPx(lat, lon); null when the vector map has none.
 */
export function throughGeo(v, toPx) {
  const ll = latLonOf(v);
  if (!ll) return null;
  const src = [[0, 0], [v.w, 0], [v.w, v.h], [0, v.h], [v.w / 2, v.h / 2]], dst = src.map(([x, y]) => toPx(...ll(x, y)));
  // least squares: px = a X + b Y + c, py = d X + e Y + f, X, Y the file's mm
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  src.forEach(([x, y], i) => { const r = [x + v.ox, y + v.oy, 1]; for (let p = 0; p < 3; p++) { for (let q = 0; q < 3; q++) S[p][q] += r[p] * r[q]; bx[p] += r[p] * dst[i][0]; by[p] += r[p] * dst[i][1]; } });
  const X = solve3(S, bx), Y = solve3(S, by);
  return X && Y ? { a: X[0], b: X[1], c: X[2], d: Y[0], e: Y[1], f: Y[2] } : null;
}
/** The share of a W × H image the vector map covers once placed by T (its frame's corners' box): under a fifth, it is another
 *  map, or a georeference gone wrong. */
export function cover(v, T, W, H) {
  const P = [[0, 0], [v.w, 0], [v.w, v.h], [0, v.h]].map(([x, y]) => [T.a * (x + v.ox) + T.b * (y + v.oy) + T.c, T.d * (x + v.ox) + T.e * (y + v.oy) + T.f]);
  const x0 = Math.max(0, Math.min(...P.map((p) => p[0]))), x1 = Math.min(W, Math.max(...P.map((p) => p[0])));
  const y0 = Math.max(0, Math.min(...P.map((p) => p[1]))), y1 = Math.min(H, Math.max(...P.map((p) => p[1])));
  return x1 > x0 && y1 > y0 ? ((x1 - x0) * (y1 - y0)) / (W * H) : 0;
}
function solve3(M, v) {
  const m = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// ---- the symbols' meaning ----------------------------------------------------------------------------------------------------
const rgbOf = (c) => { const [C, M, Y, K] = c.cmyk || [0, 0, 0, 0]; return [255 * Math.max(0, 1 - C - K), 255 * Math.max(0, 1 - M - K), 255 * Math.max(0, 1 - Y - K)]; };
/** An area colour's class, or null (no meaning for the route). */
function colourClass(c) {
  if (!c?.cmyk) return null;
  const v = kindOf(...rgbOf(c)), [C, , , K] = c.cmyk;
  if (v < 20) return v;
  if (v === INK.BLUE) return C >= 0.65 ? A.WATER : A.SHALLOW;
  if (v === INK.BROWN) return A.PAVED;
  if (v === INK.GREY) return K >= 0.45 ? A.BUILDING : A.PAVED;     // a canopy, bare rock: passable
  if (v === INK.BLACK) return A.BUILDING;
  if (v === INK.OLIVE || v === INK.PURPLE) return A.OOB;
  return null;
}
/** An area symbol's class: its fill's, else its hatching's (blue: marsh, green: slow running, purple: out of bounds) or its
 *  pattern's (green or black dots: slow running). */
function areaClass(def, map) {
  if (def.partsDefs) { for (const p of def.partsDefs) if (p.kind === "area") { const c = areaClass(p, map); if (c != null) return c; } return null; }
  if (def.fill) return colourClass(def.fill);
  const hc = def.hatches?.[0]?.color || (def.patterns?.length ? map.colors.find((c) => def.patterns[0].glyph.hasColor?.(c)) : null);
  if (!hc?.cmyk) return null;
  const v = kindOf(...rgbOf(hc));
  if (v === INK.BLUE) return A.MARSH;
  if (v === INK.PURPLE || v === INK.OLIVE) return A.OOB;
  if (v === A.G1 || v === A.G2 || v === A.G3 || v === INK.BLACK || v === INK.GREY) return A.G1;
  return null;
}
/** The colour an area is drawn in, for its place among the map's colours (bottom to top). */
function areaColour(def, map) {
  if (def.partsDefs) { for (const p of def.partsDefs) if (p.kind === "area") { const c = areaColour(p, map); if (c) return c; } return null; }
  return def.fill || def.hatches?.[0]?.color || (def.patterns?.length ? map.colors.find((c) => def.patterns[0].glyph.hasColor?.(c)) : null) || null;
}
const lineColours = (def) => (def.partsDefs ? def.partsDefs.flatMap(lineColours) : [def.color, def.double?.fill, def.double?.left, def.second?.color].filter(Boolean));
const num = (def) => Math.floor(parseFloat(def.id));
/** A line symbol's role in the standard std: "path1", "path2", "path3" (small, path, track), "block", "hand", "blue" or null. */
function lineRole(def, std) {
  const n = num(def);
  // 6xx-9xx: the north lines (blue ones were read as streams, and a strip of marsh along each), the course, the margins
  if (n >= 600) return null;
  if (std.paths.has(n)) return `path${std.paths.get(n)}`;
  if (std.blocks.has(n)) return "block";
  if (lineColours(def).some((c) => c.cmyk && kindOf(...rgbOf(c)) === INK.BLUE)) return "blue";
  if (std.hand.has(n) || std.cross.has(n)) return "hand";
  return null;
}
/** Whether a line symbol is passable but takes time to cross (an earth bank, a passable cliff, wall or fence). */
const crossLine = (def, std) => std.cross.has(num(def));
/** An area symbol's slowing of the ground (1-3), 0 for a boulder field (no slowing, no class of its own), undefined for the
 *  others; and the class its number gives, if any. */
const slowOf = (def, std) => std.slow.get(num(def));
const classByNumber = (def, std) => std.area.get(num(def));

// ---- the table per symbol (the Tracer) ----------------------------------------------------------------------------------------
/** What an area symbol may be, by name: the engine's classes, the slowing ground's three levels, "none" (ignored). */
export const AREA_ROLES = { white: A.WHITE, open: A.OPEN, rough: A.ROUGH, g1: A.G1, g2: A.G2, g3: A.G3, marsh: A.MARSH, paved: A.PAVED, grey: A.GREY,
  shallow: A.SHALLOW, water: A.WATER, building: A.BUILDING, oob: A.OOB };
const SLOW_ROLES = { slow1: 1, slow2: 2, slow3: 3 };
/** What a line symbol may be: a path of three kinds, impassable, a handrail, passable but slow to cross, a stream, or ignored. */
export const LINE_ROLES = ["track", "path", "small", "block", "cross", "hand", "stream", "none"];
const LINE_OF = { track: "path3", path: "path2", small: "path1", block: "block", hand: "hand", stream: "blue", cross: "hand" };
const NAME_OF_CLASS = Object.fromEntries(Object.entries(AREA_ROLES).map(([k, v]) => [v, k]));
/** The speed (% of white forest) a role has in the settings' speeds, or null (impassable, or no speed of its own). */
export function roleSpeed(role, speeds) {
  const sp = speeds || {};
  switch (role) {
    case "white": return 100;
    case "open": case "rough": case "g1": case "g2": case "g3": case "marsh": case "paved": case "grey": case "shallow": case "track": case "path": case "small":
    case "slow1": case "slow2": case "slow3": return sp[role] ?? null;
    default: return null;
  }
}
/**
 * A map's area and line symbols as the routes read them without a table: [{ id, name, kind ("area" | "line"), n (objects),
 * role (see AREA_ROLES, "slow1"…"slow3", LINE_ROLES; "none": not read), rgb (the symbol's main colour, for a swatch) }], in the
 * order of their numbers; the symbols with no object are left out.
 */
export function symbolRoles(map) {
  const std = STANDARDS[standardOf(map)], out = [];
  for (const d of map.symdefs) {
    if (!d.visible || (d.kind !== "area" && d.kind !== "line")) continue;
    const n = d.symbols.filter((s) => s.visible !== false && (d.kind === "area" ? s.area : s.path)).length;
    if (!n || num(d) >= 600 || !(num(d) > 0)) continue;
    let role = "none", col = null;
    if (d.kind === "area") {
      const sl = slowOf(d, std), cls = classByNumber(d, std) ?? areaClass(d, map);
      col = areaColour(d, map);
      if (sl) role = `slow${sl}`;
      else if (sl === 0 && !d.fill) role = "none";
      else if (cls != null && col) role = NAME_OF_CLASS[cls] || "none";
    } else {
      const r = lineRole(d, std);
      col = lineColours(d)[0] || null;
      role = r === "path3" ? "track" : r === "path2" ? "path" : r === "path1" ? "small" : r === "block" ? "block" : r === "blue" ? "stream" : crossLine(d, std) ? "cross" : r === "hand" ? "hand" : "none";
    }
    out.push({ id: String(d.id), name: d.name || "", kind: d.kind, n, role, rgb: col?.cmyk ? rgbOf(col).map((v) => Math.round(v)) : null });
  }
  return out.sort((a, b) => parseFloat(a.id) - parseFloat(b.id) || a.id.localeCompare(b.id));
}

// ---- drawing the layers ------------------------------------------------------------------------------------------------------
function path2d(cmds) {
  const p = new Path2D();
  for (const c of cmds) {
    if (c[0] === "M") p.moveTo(c[1], c[2]);
    else if (c[0] === "L") p.lineTo(c[1], c[2]);
    else if (c[0] === "C") p.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else if (c[0] === "Z") p.closePath();
  }
  return p;
}

/**
 * The layers of trace/routechoice.js on a W × H grid: T the affine from the file's mm to the grid's pixels; extra: the course
 * setter's own objects, in the file's mm — { areas: [[x, y]…] out of bounds (ISCD 709, dangerous areas), lines: [[x, y]…]
 * not to be crossed (708) }, which the Tracer keeps apart from the map; table: the Tracer's table per symbol (see above), or
 * null. Returns { area, path, blue, block, hand, cross, slow } (Uint8Array, one per pixel) — with a table that sets speeds also
 * speed and pspeed (1-250: % of white forest's speed; 255: impassable) — and counts of what was drawn.
 */
export function layers(v, T, W, H, extra = null, table = null) {
  const t0 = Date.now(), N = W * H, map = v.map;
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = cv.getContext("2d", { willReadFrequently: true });
  const pxPerMm = Math.sqrt(Math.abs(T.a * T.e - T.b * T.d));
  const begin = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(T.a, T.d, T.b, T.e, T.c, T.f); g.fillStyle = "#000"; g.strokeStyle = "#000"; };
  const read = (into, value) => { const d = g.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < N; i++) if (d[4 * i + 3] > 110) { into[i] = value; n++; } return n; };
  const area = new Uint8Array(N), path = new Uint8Array(N), blue = new Uint8Array(N), block = new Uint8Array(N), hand = new Uint8Array(N);
  const cross = new Uint8Array(N), slow = new Uint8Array(N), slowAreas = [null, [], [], []];
  // the table's speeds: areas (in the colour table's order) and lines, each with its value (1-250 %, 255 impassable)
  const speedAreas = [], speedLines = [], spv = (x) => (x <= 0 ? 255 : Math.max(1, Math.min(250, Math.round(x))));
  // the areas, colour by colour from the bottom of the colour table
  const z = new Map(map.colors.map((c, i) => [c, i]));
  const groups = new Map();
  const counts = { areas: 0, paths: 0, blocks: 0, hands: 0, streams: 0, crossings: 0, crosses: 0, slows: 0 };
  // the numbers' meaning in the map's standard (ISOM 2000 numbers its symbols otherwise)
  const standard = standardOf(map), std = STANDARDS[standard];
  counts.standard = standard;
  const crossings = [];
  for (const d of map.symdefs) {
    if (!d.visible) continue;
    const isArea = d.kind === "area", isLine = d.kind === "line";
    if (d.kind === "point") {
      const n = Math.floor(parseFloat(d.id));
      if (std.crossing && n === std.crossing) for (const s of d.symbols) if (s.visible !== false && Number.isFinite(s.x)) crossings.push([s.x, s.y, s.bbox ? Math.max(s.bbox[2] - s.bbox[0], s.bbox[3] - s.bbox[1]) / 2 : 0]);
      continue;
    }
    if (!isArea && !isLine) continue;
    // the table's word on this symbol: another role, a speed of its own
    const ov = table?.[String(d.id)] || null, orole = ov?.role || "", ospeed = Number.isFinite(ov?.speed) ? ov.speed : null;
    if (orole === "none") continue;
    for (const s of d.symbols) {
      if (s.visible === false) continue;
      if (isArea && s.area) {
        const col = areaColour(d, map), zc = col ? z.get(col) ?? -1 : 1e6;
        if (ospeed != null) speedAreas.push({ area: s.area, z: zc, v: spv(ospeed) });
        if (SLOW_ROLES[orole]) { slowAreas[SLOW_ROLES[orole]].push(s.area); counts.slows++; continue; }
        // stony or sandy ground, a boulder field: over the vegetation, not in its place (a fill of its own still counts)
        const sl = orole ? undefined : slowOf(d, std);
        if (sl !== undefined) { if (sl) { slowAreas[sl].push(s.area); counts.slows++; } if (!d.fill) continue; }
        const cls = orole in AREA_ROLES ? AREA_ROLES[orole] : classByNumber(d, std) ?? areaClass(d, map);
        if (cls == null || (!col && !(orole in AREA_ROLES))) continue;
        const key = `${zc}|${cls}`;
        if (!groups.has(key)) groups.set(key, { z: zc, cls, list: [] });
        groups.get(key).list.push(s.area);
        counts.areas++;
      } else if (isLine && s.path) {
        const own = Math.max(d.color && d.width > 0 ? d.width : d.maxThick || d.width || 0.25, 0.1);
        // passable but slow to get over: at the line's own width (an earth bank's tags, a fence's ticks are not the line)
        if (orole ? orole === "cross" : crossLine(d, std)) {
          if (!groups.has("line|cross")) groups.set("line|cross", { role: "cross", list: [] });
          groups.get("line|cross").list.push({ path: s.path, width: own });
          counts.crosses++;
        }
        let role = orole ? LINE_OF[orole] || null : lineRole(d, std);
        // a speed of its own makes a line a way to follow (a small path when the table names no kind); 0: it blocks
        if (ospeed != null) {
          if (ospeed <= 0) role = "block";
          else { if (!/^path/.test(role || "")) role = "path1"; speedLines.push({ path: s.path, width: Math.max(d.maxThick || d.width || 0.25, 0.1), v: spv(ospeed) }); }
        }
        if (!role) continue;
        const key = `line|${role}`;
        if (!groups.has(key)) groups.set(key, { role, list: [] });
        // what blocks, at its line's own width: a fence's ticks span 1.8 mm and would swallow the track beside it
        const width = role === "block" && d.color && d.width > 0 ? d.width : d.maxThick || d.width || 0.25;
        groups.get(key).list.push({ path: s.path, width: Math.max(width, 0.1) });
        counts[{ path1: "paths", path2: "paths", path3: "paths", block: "blocks", hand: "hands", blue: "streams" }[role]]++;
      }
    }
  }
  for (const grp of [...groups.values()].filter((x) => x.cls != null).sort((a, b) => a.z - b.z)) {
    begin();
    for (const ar of grp.list) g.fill(path2d(ar.commands()), "evenodd");
    read(area, grp.cls);
  }
  // the lines, each at least one and a half pixels wide
  const minMm = 1.5 / pxPerMm;
  // the paths from the slowest kind to the fastest: where two meet, the faster is kept
  for (const [role, into, value] of [["path1", path, 1], ["path2", path, 2], ["path3", path, 3], ["block", block, 1], ["hand", hand, 1], ["blue", blue, 1], ["cross", cross, 1]]) {
    const grp = groups.get(`line|${role}`);
    if (!grp) continue;
    begin(); g.lineCap = "round"; g.lineJoin = "round";
    for (const l of grp.list) { g.lineWidth = Math.max(l.width, minMm); g.stroke(path2d(l.path.commands())); }
    read(into, value);
  }
  // an impassable line is crossed at its crossing points only; a path drawn over it or along it opens nothing
  if (crossings.length && groups.has("line|block")) {
    const r0 = Math.max(CROSSING_MM, CROSSING_M / ((map.scale || 10000) / 1000));
    begin();
    for (const [x, y, r] of crossings) { g.beginPath(); g.arc(x, y, Math.max(r0, r), 0, 2 * Math.PI); g.fill(); }
    const hole = new Uint8Array(N);
    read(hole, 1);
    for (let i = 0; i < N; i++) if (hole[i] && block[i]) block[i] = 0;
    counts.crossings = crossings.length;
  }
  for (let i = 0; i < N; i++) if (block[i]) { path[i] = 0; cross[i] = 0; }
  // the slowing ground, the stronger over the weaker
  for (let lv = 1; lv <= 3; lv++) {
    if (!slowAreas[lv].length) continue;
    begin();
    for (const ar of slowAreas[lv]) g.fill(path2d(ar.commands()), "evenodd");
    read(slow, lv);
  }
  // the setter's out-of-bounds areas over everything, their boundaries as walls (a path stays closed across them)
  const poly = (pts, close) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (close) p.closePath(); return p; };
  if (extra?.areas?.length) {
    begin();
    for (const pts of extra.areas) if (pts.length >= 3) g.fill(poly(pts, true), "evenodd");
    counts.oob = read(area, A.OOB);
    for (let i = 0; i < N; i++) if (area[i] === A.OOB) path[i] = 0;
  }
  if (extra?.lines?.length) {
    begin(); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(0.5, minMm);
    for (const pts of extra.lines) if (pts.length >= 2) g.stroke(poly(pts, false));
    const mark = new Uint8Array(N);
    counts.bounds = read(mark, 1);
    for (let i = 0; i < N; i++) if (mark[i]) { block[i] = 1; path[i] = 0; }
  }
  // the table's speeds: the areas in the colour table's order (the upper one wins), the lines over them
  let speed = null, pspeed = null;
  if (speedAreas.length) {
    speed = new Uint8Array(N);
    const byZ = new Map();
    for (const a of speedAreas) { const k = `${a.z}|${a.v}`; if (!byZ.has(k)) byZ.set(k, { z: a.z, v: a.v, list: [] }); byZ.get(k).list.push(a.area); }
    for (const grp of [...byZ.values()].sort((a, b) => a.z - b.z)) { begin(); for (const ar of grp.list) g.fill(path2d(ar.commands()), "evenodd"); read(speed, grp.v); }
  }
  if (speedLines.length) {
    pspeed = new Uint8Array(N);
    const byV = new Map();
    for (const l of speedLines) { if (!byV.has(l.v)) byV.set(l.v, []); byV.get(l.v).push(l); }
    // the slower first: where two meet, the faster is kept
    for (const [val, list] of [...byV.entries()].sort((a, b) => a[0] - b[0])) {
      begin(); g.lineCap = "round"; g.lineJoin = "round";
      for (const l of list) { g.lineWidth = Math.max(l.width, minMm); g.stroke(path2d(l.path.commands())); }
      read(pspeed, val);
    }
    for (let i = 0; i < N; i++) if (block[i]) pspeed[i] = 0;
  }
  counts.table = table ? Object.keys(table).length : 0;
  return { area, path, blue, block, hand, cross, slow, ...(speed ? { speed } : {}), ...(pspeed ? { pspeed } : {}), counts, ms: Date.now() - t0 };
}

// ---- the layers kept with a map analysis's circuit (owner, 2026-11-05) ---------------------------------------------------------
// Drawn once by the organiser's browser at publication, from the OCAD or Mapper map the course was set on, on the pixels of the
// circuit's image; the runners' pages read them instead of the image's colours (exact, and the map need not be read). The map
// file itself is not sent: only what the routes need. « OZL2 », the width and height (u32, little-endian), then two planes deflated:
// area | path << 4 | blue << 6 | block << 7, and hand | cross << 1 | slow << 2 (2026-11-10; « OZL1 », read still, had hand alone:
// layers kept before have no crossings nor slowing ground until the analysis is published again).
const MAGIC = [0x4f, 0x5a, 0x4c, 0x32], MAGIC_1 = [0x4f, 0x5a, 0x4c, 0x31];
async function stream(bytes, how, compress) {
  const s = new Blob([bytes]).stream().pipeThrough(compress ? new CompressionStream(how) : new DecompressionStream(how));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** The layers as a Blob to store. */
export async function packLayers(L, W, H) {
  const N = W * H, planes = new Uint8Array(2 * N);
  for (let i = 0; i < N; i++) {
    planes[i] = (L.area[i] & 15) | ((L.path[i] & 3) << 4) | ((L.blue[i] ? 1 : 0) << 6) | ((L.block[i] ? 1 : 0) << 7);
    planes[N + i] = (L.hand[i] ? 1 : 0) | ((L.cross?.[i] ? 1 : 0) << 1) | ((L.slow?.[i] || 0) << 2);
  }
  const head = new Uint8Array(12);
  head.set(MAGIC); new DataView(head.buffer).setUint32(4, W, true); new DataView(head.buffer).setUint32(8, H, true);
  return new Blob([head, await stream(planes, "deflate", true)], { type: "application/octet-stream" });
}
/** The stored layers read back: { w, h, area, path, blue, block, hand, cross, slow }, or null (not this format). */
export async function unpackLayers(buf) {
  const u8 = new Uint8Array(buf), is = (m) => m.every((b, i) => u8[i] === b);
  if (u8.length < 12 || !(is(MAGIC) || is(MAGIC_1))) return null;
  const two = is(MAGIC);
  const dv = new DataView(u8.buffer, u8.byteOffset), w = dv.getUint32(4, true), h = dv.getUint32(8, true), N = w * h;
  const planes = await stream(u8.subarray(12), "deflate", false);
  if (planes.length !== 2 * N) return null;
  const area = new Uint8Array(N), path = new Uint8Array(N), blue = new Uint8Array(N), block = new Uint8Array(N), hand = new Uint8Array(N), cross = new Uint8Array(N), slow = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const v = planes[i], u = planes[N + i];
    area[i] = v & 15; path[i] = (v >> 4) & 3; blue[i] = (v >> 6) & 1; block[i] = v >> 7;
    hand[i] = u & 1;
    if (two) { cross[i] = (u >> 1) & 1; slow[i] = (u >> 2) & 3; }
  }
  return { w, h, area, path, blue, block, hand, cross, slow };
}
/** The planes a vector map's layers carry; OPTIONAL_KEYS: those only a table per symbol makes (the Tracer). */
export const LAYER_KEYS = ["area", "path", "blue", "block", "hand", "cross", "slow"];
export const OPTIONAL_KEYS = ["speed", "pspeed"];
/** Layers of W0 × H0 taken to W × H, nearest pixel (a map too large for the routes' grid is read smaller). */
export function resampleLayers(L, W, H) {
  if (L.w === W && L.h === H) return L;
  const out = { w: W, h: H };
  const xs = Int32Array.from({ length: W }, (_, x) => Math.min(L.w - 1, Math.floor(((x + 0.5) * L.w) / W)));
  for (const k of [...LAYER_KEYS, ...OPTIONAL_KEYS.filter((x) => L[x])]) {
    const src = L[k] || new Uint8Array(L.w * L.h), dst = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) { const r = Math.min(L.h - 1, Math.floor(((y + 0.5) * L.h) / H)) * L.w, o = y * W; for (let x = 0; x < W; x++) dst[o + x] = src[r + xs[x]]; }
    out[k] = dst;
  }
  return out;
}
