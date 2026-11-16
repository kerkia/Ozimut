// The course's drawing items: layout objects (tracer/layout.js) turned into paths and texts in map millimetres (y up),
// with their colour role ("upper"/"lower" purple, black, white, 50 % purple, or a CMYK colour) — Purple Pen's symbol
// geometry (CourseObject.cs; BSD licence, assets/tracer/LICENSE-PurplePen.txt). One list of items is drawn on the
// screen (drawItems, a canvas) and in the PDFs (tracer/pdf.js), so the two always match.

import * as M from "./model.js";
import { qrItems } from "./qr.js";
import { sheetItems, describe, widthInCells } from "./descr.js";
import { textWidth, CAP_HEIGHT, wrapText, family, cssFamily } from "./fonts.js";

const DEG = Math.PI / 180;
const K = 0.5522847498;
const rot = ([x, y], deg) => { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
const tr = (pts, deg, [dx, dy], k = 1) => pts.map((p) => { const q = rot([p[0] * k, p[1] * k], deg); return [q[0] + dx, q[1] + dy]; });
const poly = (pts, close) => [...pts.map((p, i) => [i ? "L" : "M", p[0], p[1]]), ...(close ? [["Z"]] : [])];
/** An arc of a circle (counter-clockwise from a0 to a1, degrees) as bezier commands; start with "M" when move. */
export function arcPath(cx, cy, r, a0, a1, move = true) {
  const d = [], n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), step = (a1 - a0) / n;
  let a = a0 * DEG;
  if (move) d.push(["M", cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  for (let i = 0; i < n; i++) {
    const b = a + step * DEG, k = (4 / 3) * Math.tan((b - a) / 4);
    const p0 = [Math.cos(a), Math.sin(a)], p3 = [Math.cos(b), Math.sin(b)];
    d.push(["C", cx + r * (p0[0] - k * p0[1]), cy + r * (p0[1] + k * p0[0]), cx + r * (p3[0] + k * p3[1]), cy + r * (p3[1] - k * p3[0]), cx + r * p3[0], cy + r * p3[1]]);
    a = b;
  }
  return d;
}
export const circlePath = (cx, cy, r) => [...arcPath(cx, cy, r, 0, 360), ["Z"]];
/** A circle with gaps (CircleGap.ArcStartSweeps): the arcs from each gap's end to the next gap's start. */
function gappedCircle(cx, cy, r, gaps) {
  if (!gaps?.length) return [circlePath(cx, cy, r)];
  const out = [];
  for (let i = 0; i < gaps.length; i++) {
    const s = gaps[i][1], e = i === gaps.length - 1 ? gaps[0][0] + 360 : gaps[i + 1][0];
    let sweep = (e - s) % 360; if (sweep < 0) sweep += 360;
    if (sweep > 0.01) out.push(arcPath(cx, cy, r, s, s + sweep));
  }
  return out;
}
/** A polyline minus its gaps ([start, length] along it). */
export function gappedLine(pts, gaps) {
  const L = M.pathLength(pts);
  const g = M.simplifyGaps(gaps, L);
  if (!g) return [pts];
  const pieces = [];
  let start = 0;
  for (const [s, l] of [...g, [L, 0]]) {
    if (s > start + 1e-6) pieces.push(subPath(pts, start, s));
    start = s + l;
  }
  return pieces.filter((p) => p.length >= 2);
}
function subPath(pts, a, b) {
  const out = [M.pointAt(pts, a)];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += M.dist(pts[i - 1], pts[i]);
    if (acc > a && acc < b) out.push(pts[i].slice());
  }
  out.push(M.pointAt(pts, b));
  return out;
}
/** A dashed polyline as pieces (dash on, gap off; Purple Pen's marked route: 2 mm, 0.5 mm). */
function dashes(pts, on, off) {
  const L = M.pathLength(pts), out = [];
  if (L <= on) return [pts];
  // dashes of equal length fitted to the line, starting and ending with a dash
  const n = Math.max(1, Math.round((L + off) / (on + off)));
  const dash = (L - (n - 1) * off) / n;
  for (let i = 0, s = 0; i < n; i++, s += dash + off) out.push(subPath(pts, s, s + dash));
  return out;
}

// the start triangle (Purple Pen's coords2000 / coords2017), the crossing point's two curves, the first aid cross,
// the water cup
const TRIANGLE = { "2000": [[0, 4.041], [3.5, -2.021], [-3.5, -2.021]], "2017": [[0, 3.464], [3.0, -1.732], [-3.0, -1.732]] };
const CROSS2000 = [[-0.5, 1.5], [0.5, 1.5], [0.5, 0.5], [1.5, 0.5], [1.5, -0.5], [0.5, -0.5], [0.5, -1.5], [-0.5, -1.5], [-0.5, -0.5], [-1.5, -0.5], [-1.5, 0.5], [-0.5, 0.5]];
const CROSS2017 = CROSS2000.map(([x, y]) => [x * 4 / 3, y * 4 / 3]);

/** Drawing items for a layout (tracer/layout.js), and the event for the specials' texts and descriptions. */
export function itemsFor(ev, layout, { selected = null, descLines = null } = {}) {
  const items = [];
  const ap = ev.appearance;
  for (const o of layout.objs) {
    const sel = selected && isSelected(o, selected);
    const push = (it) => items.push({ ...it, obj: o, sel });
    switch (o.t) {
      case "control": {
        for (const d of gappedCircle(o.ctr[0], o.ctr[1], o.r, o.gaps)) push({ t: "path", d, stroke: o.lw, cap: "butt", join: "round", color: "lower" });
        if (o.dot) push({ t: "path", d: circlePath(o.ctr[0], o.ctr[1], o.dot / 2), fill: true, color: "upper" });
        if (o.exchangeTriangle != null) {
          const R = o.r;
          const pts = [0, 120, 240].map((a) => rot([0, R], a + o.exchangeTriangle)).map(([x, y]) => [x + o.ctr[0], y + o.ctr[1]]);
          push({ t: "path", d: poly(pts, true), stroke: o.lw, cap: "butt", join: "round", color: "lower" });
        }
        break;
      }
      case "finish":
        for (const r of [o.rIn, o.rOut]) for (const d of gappedCircle(o.ctr[0], o.ctr[1], r, o.gaps)) push({ t: "path", d, stroke: o.lw, cap: "butt", join: "round", color: "lower" });
        break;
      case "start":
        push({ t: "path", d: poly(tr(TRIANGLE[o.size], o.orientation, o.ctr, o.ratio), true), stroke: o.lw, cap: "butt", join: "miter", color: "lower" });
        break;
      case "issue": {
        if (o.style === "none") break;
        const L = M.ISSUE_LENGTH * o.ratio * ap.controlCircleSize;
        push({ t: "path", d: poly(tr([[L / 2, 0], [-L / 2, 0]], o.orientation, o.ctr), false), stroke: M.ISSUE_WIDTH * o.ratio * ap.controlCircleSize, cap: "butt", join: "miter", color: "upper" });
        if (o.style === "tail") push({ t: "path", d: poly(tr([[0, 0], [0, L * 0.6]], o.orientation, o.ctr), false), stroke: M.LINE * o.ratio, cap: "butt", join: "miter", color: "upper" });
        break;
      }
      case "crossing": for (const d of crossingPaths(o)) push({ t: "path", d, stroke: o.lw, cap: "butt", join: "miter", color: o.special ? "upper" : "lower" }); break;
      case "leg": {
        const pieces = gappedLine(o.pts, o.gaps);
        for (const p of pieces) {
          if (o.flagged) for (const dsh of dashes(p, 2.0 * o.ratio, 0.5 * o.ratio)) push({ t: "path", d: poly(dsh, false), stroke: o.lw, cap: "butt", join: "bevel", color: "upper" });
          else push({ t: "path", d: poly(p, false), stroke: o.lw, cap: "butt", join: "bevel", color: "lower" });
        }
        break;
      }
      case "number": case "code":
        push({ t: "text", text: o.text, x: o.ctr[0], y: o.ctr[1] - (CAP_HEIGHT * o.em) / 2, size: o.em, bold: o.bold, align: "center",
          color: o.upper || o.t === "code" ? "upper" : "lower", outline: o.outline, condensed: !!o.condensed, family: o.condensed ? "Roboto Condensed" : family(o.font) });
        break;
      case "string": push({ t: "path", d: poly(o.pts, false), stroke: o.lw, cap: "round", join: "round", color: "lower" }); break;
      case "point": pointSpecial(o, push, ap); break;
      case "line": lineSpecial(o, push); break;
      case "area": areaSpecial(o, push); break;
      case "rect": rectSpecial(o, push); break;
      case "text": textSpecial(o, push); break;
      case "image": push({ t: "image", box: o.box, image: o.image }); break;
      case "qr": for (const it of qrItems(o.box, o.text)) push(it); break;
      // an enlarged section: its white ground and frame here; the map and the course inside are drawn by the page (layoutx.js)
      case "inset": {
        const [l, b, r, t] = o.box;
        push({ t: "path", d: poly([[l, b], [r, b], [r, t], [l, t]], true), fill: true, color: "white" });
        push({ t: "inset", box: o.box, src: o.src, factor: o.factor });
        push({ t: "path", d: poly([[l, b], [r, b], [r, t], [l, t]], true), stroke: 0.35, cap: "butt", join: "miter", color: "black", insetFrame: true });
        break;
      }
      case "descriptions": {
        const sp = ev.specials[o.special];
        const cd = o.cd.course ? o.cd : M.cdAll();
        const lines = descLines?.(o) || describe(ev, cd, { purpose: "map" });
        const descKind = cd.course ? ev.courses[cd.course].descKind : ev.allControls.descKind;
        const sheet = sheetItems(lines, descKind, o.cell, { columns: sp.columns || 1, white: true });
        // sheet coordinates are y down from the top-left corner: flip onto the map
        const [x0, y0] = o.topLeft, flip = (p) => [x0 + p[0], y0 - p[1]];
        let maxX = 0, maxY = 0;
        for (const it of sheet) {
          if (it.t === "path") {
            push({ ...it, d: it.d.map((c) => c[0] === "Z" ? c : [c[0], ...pairs(c.slice(1)).flatMap(flip)]), color: it.white ? "white" : ap.descriptionsPurple ? "upper" : "black", desc: true });
            for (const c of it.d) for (let i = 1; i < c.length; i += 2) { maxX = Math.max(maxX, c[i]); maxY = Math.max(maxY, c[i + 1]); }
          } else push({ ...it, x: x0 + it.x, y: y0 - it.y, color: ap.descriptionsPurple ? "upper" : "black", desc: true });
        }
        o.box = [x0, y0 - maxY, x0 + maxX, y0];
        o.size = [maxX, maxY];
        o.widthCells = widthInCells(descKind);
        break;
      }
      default: break;
    }
  }
  return items;
}
const pairs = (a) => { const out = []; for (let i = 0; i < a.length; i += 2) out.push([a[i], a[i + 1]]); return out; };
const isSelected = (o, s) => (s.special && o.special === s.special) || (s.leg && o.t === "leg" && o.control === s.leg[0] && o.control2 === s.leg[1])
  || (s.control && o.control === s.control && !s.leg && o.t !== "leg");

function crossingPaths(o) {
  const k = o.ratio, h = o.stretch / 2, wide = o.wide ? 0.175 : 0;
  let a, b;
  if (!(o.stretch > 0)) {
    a = [[-0.85 - wide, -1.5], [-0.35 - wide, -0.65], [-0.35 - wide, 0.65], [-0.85 - wide, 1.5]];
    b = [[0.85 + wide, -1.5], [0.35 + wide, -0.65], [0.35 + wide, 0.65], [0.85 + wide, 1.5]];
    const ta = tr(a, o.orientation, o.ctr, k), tb = tr(b, o.orientation, o.ctr, k);
    return [[["M", ...ta[0]], ["C", ...ta[1], ...ta[2], ...ta[3]]], [["M", ...tb[0]], ["C", ...tb[1], ...tb[2], ...tb[3]]]];
  }
  a = [[-0.85, -1.5 - h], [-0.6, -1.08 - h], [-0.48, -0.5 - h], [-0.48, -h], [-0.48, h], [-0.48, 0.5 + h], [-0.6, 1.08 + h], [-0.85, 1.5 + h]].map(([x, y]) => [x - wide, y]);
  b = a.map(([x, y]) => [-x, y]);
  const ta = tr(a, o.orientation, o.ctr, k), tb = tr(b, o.orientation, o.ctr, k);
  const curve = (t) => [["M", ...t[0]], ["C", ...t[1], ...t[2], ...t[3]], ["L", ...t[4]], ["C", ...t[5], ...t[6], ...t[7]]];
  return [curve(ta), curve(tb)];
}
function pointSpecial(o, push) {
  const k = o.ratio;
  switch (o.kind) {
    case "first-aid": push({ t: "path", d: poly(tr(o.std === "2000" ? CROSS2000 : CROSS2017, 0, o.ctr, k), true), fill: true, color: "lower" }); break;
    case "water": {
      const w = o.std === "2000" ? o.lwBase * k : 0.4 * k;
      const top = o.std === "2000" ? [1.5, 1.375, 0.375, 1.5] : [1.55, 1.071, 0.35, 1.55];      // half-width, centre y, half-height of the rim; half width
      const [rx, cy, ry] = top;
      const bot = o.std === "2000" ? [1.0, -1.5, 0.25] : [0.85, -1.529, 0.15];
      const ell = (cx, cyy, ax, ay) => { const d = []; const c = [cx + o.ctr[0], cyy * 1 + o.ctr[1]];
        d.push(["M", c[0] + ax * k, c[1]], ["C", c[0] + ax * k, c[1] + ay * K * k, c[0] + ax * K * k, c[1] + ay * k, c[0], c[1] + ay * k],
          ["C", c[0] - ax * K * k, c[1] + ay * k, c[0] - ax * k, c[1] + ay * K * k, c[0] - ax * k, c[1]],
          ["C", c[0] - ax * k, c[1] - ay * K * k, c[0] - ax * K * k, c[1] - ay * k, c[0], c[1] - ay * k],
          ["C", c[0] + ax * K * k, c[1] - ay * k, c[0] + ax * k, c[1] - ay * K * k, c[0] + ax * k, c[1]]); return d; };
      push({ t: "path", d: ell(0, cy * k, rx, ry), stroke: w, cap: "round", join: "round", color: "lower" });
      const b0 = [o.ctr[0] + bot[0] * k, o.ctr[1] + bot[1] * k], b1 = [o.ctr[0] - bot[0] * k, o.ctr[1] + bot[1] * k];
      push({ t: "path", d: [["M", ...b0], ["C", b0[0], b0[1] - bot[2] * k, o.ctr[0] + bot[0] * K * k, b0[1] - bot[2] * k * 1.0, o.ctr[0], b0[1] - bot[2] * k],
        ["C", o.ctr[0] - bot[0] * K * k, b0[1] - bot[2] * k, b1[0], b1[1] - bot[2] * k, ...b1]], stroke: w, cap: "round", join: "round", color: "lower" });
      push({ t: "path", d: poly([[o.ctr[0] + rx * k, o.ctr[1] + cy * k], b0], false), stroke: w, cap: "round", join: "round", color: "lower" });
      push({ t: "path", d: poly([[o.ctr[0] - rx * k, o.ctr[1] + cy * k], b1], false), stroke: w, cap: "round", join: "round", color: "lower" });
      break;
    }
    case "forbidden-route":
      push({ t: "path", d: poly(tr([[-1.06, -1.06], [1.06, 1.06]], 0, o.ctr, k), false), stroke: 0.35 * k, cap: "butt", join: "miter", color: "upper" });
      push({ t: "path", d: poly(tr([[1.06, -1.06], [-1.06, 1.06]], 0, o.ctr, k), false), stroke: 0.35 * k, cap: "butt", join: "miter", color: "upper" });
      break;
    case "registration-mark":
      push({ t: "path", d: poly(tr([[-2, 0], [2, 0]], 0, o.ctr, k), false), stroke: o.lw, cap: "butt", join: "miter", color: "upper" });
      push({ t: "path", d: poly(tr([[0, -2], [0, 2]], 0, o.ctr, k), false), stroke: o.lw, cap: "butt", join: "miter", color: "upper" });
      break;
    // MTB-O (ISMTBOM 2022, revision 2; sizes read in the specification on 2026-11-16): 717 obstacle across the track, a bar of
    // 2.3 × 0.8 mm across it (lower purple); 718 forbidden to pass, an X of 2.5 mm, line 0.52. The orientation is the track's direction.
    case "mtbo-obstacle":
      push({ t: "path", d: poly(tr([[0, -1.15], [0, 1.15]], o.orientation, o.ctr, k), false), stroke: 0.8 * k, cap: "butt", join: "miter", color: "lower" });
      break;
    case "mtbo-forbidden-pass":
      for (const sg of [-1, 1]) push({ t: "path", d: poly(tr([[-1.25, -1.25 * sg], [1.25, 1.25 * sg]], o.orientation, o.ctr, k), false), stroke: 0.52 * k, cap: "butt", join: "miter", color: "upper" });
      break;
    default: break;
  }
}
const specialColor = (c) => (Array.isArray(c) ? c : c === "black" ? "black" : c === "lower-purple" ? "lower" : "upper");
function lineSpecial(o, push) {
  if (o.kind === "boundary") { push({ t: "path", d: poly(o.pts, false), stroke: o.lw, cap: "butt", join: "miter", color: "lower" }); return; }
  if (o.kind?.startsWith("mtbo-")) { mtboLine(o, push); return; }
  strokeKind(o.pts, false, o, push);
}
/** MTB-O's line symbols along a track (ISMTBOM 2022, revision 2; sizes in map mm at the print scale, k): 841 one-way compulsory —
 *  chevrons pointing the way, arms of 2.5 mm at 35°, line 0.45 —; 716 forbidden route — a zigzag of period 3.0 mm and height 3.0,
 *  line 0.6, closed by a bar at each end —; 719 dangerous section — « !! » 4.0 mm high, 2.5 mm apart, at its middle and every
 *  20 mm of a long one. */
function mtboLine(o, push) {
  const k = o.ratio, L = M.pathLength(o.pts);
  const at = (s) => { const p = M.pointAt(o.pts, s), q = M.pointAt(o.pts, Math.min(L, s + 0.01)), r = M.pointAt(o.pts, Math.max(0, s - 0.01)); const a = Math.atan2(q[1] - r[1], q[0] - r[0]); return [p, a]; };
  if (o.kind === "mtbo-oneway") {
    const step = 8 * k, n = Math.max(1, Math.floor(L / step)), arm = 2.5 * k, half = (35 * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
      const [p, a] = at((i + 0.5) * (L / n));
      const back = (sg) => [p[0] - arm * Math.cos(a + sg * half), p[1] - arm * Math.sin(a + sg * half)];
      push({ t: "path", d: poly([back(1), [p[0], p[1]], back(-1)], false), stroke: 0.45 * k, cap: "butt", join: "miter", color: "lower" });
    }
  } else if (o.kind === "mtbo-forbidden-route") {
    const wl = 3.0 * k, amp = 1.5 * k, n = Math.max(2, 2 * Math.round(L / wl)), pts = [];
    for (let i = 0; i <= n; i++) { const [p, a] = at((i * L) / n), sgn = i % 2 ? 1 : -1, off = i === 0 || i === n ? 0 : sgn * amp; pts.push([p[0] - Math.sin(a) * off, p[1] + Math.cos(a) * off]); }
    push({ t: "path", d: poly(pts, false), stroke: 0.6 * k, cap: "butt", join: "miter", color: "upper" });
    for (const s0 of [0, L]) { const [p, a] = at(s0); push({ t: "path", d: poly([[p[0] + Math.sin(a) * amp, p[1] - Math.cos(a) * amp], [p[0] - Math.sin(a) * amp, p[1] + Math.cos(a) * amp]], false), stroke: 0.6 * k, cap: "butt", join: "miter", color: "upper" }); }
  } else if (o.kind === "mtbo-danger") {
    const n = Math.max(1, Math.round(L / (20 * k)));
    for (let i = 0; i < n; i++) {
      const [p] = at((i + 0.5) * (L / n));
      for (const dx of [-1.25 * k, 1.25 * k]) {
        const x = p[0] + dx, w = 0.3 * k;
        push({ t: "path", d: poly([[x - w, p[1] + 2 * k], [x + w, p[1] + 2 * k], [x + w * 0.7, p[1] - 0.8 * k], [x - w * 0.7, p[1] - 0.8 * k]], true), fill: true, color: "upper" });
        push({ t: "path", d: poly([[x - w, p[1] - 1.35 * k], [x + w, p[1] - 1.35 * k], [x + w, p[1] - 2 * k], [x - w, p[1] - 2 * k]], true), fill: true, color: "upper" });
      }
    }
  }
}
function strokeKind(pts, closed, o, push) {
  const color = specialColor(o.color);
  if (o.lineKind === "double") {
    for (const s of [-1, 1]) push({ t: "path", d: poly(offsetLine(closed ? [...pts, pts[0]] : pts, s * (o.gap + o.lw) / 2), false), stroke: o.lw, cap: "butt", join: "miter", color });
  } else if (o.lineKind === "dashed") {
    for (const d of dashes(closed ? [...pts, pts[0]] : pts, o.dash || 1, o.gap || 0.5)) push({ t: "path", d: poly(d, false), stroke: o.lw, cap: "butt", join: "miter", color });
  } else push({ t: "path", d: poly(pts, closed), stroke: o.lw, cap: "butt", join: "miter", color });
}
function offsetLine(pts, off) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / L) * off, p[1] + (dx / L) * off];
  });
}
function areaSpecial(o, push) {
  const k = o.ratio, d = poly(o.pts, true);
  switch (o.kind) {
    case "out-of-bounds":
      if (o.std === "2000") push({ t: "hatch", d, angles: [90], width: 0.25 * k, spacing: 0.6 * k, color: "upper" });
      else push({ t: "hatch", d, angles: [45, 135], width: 0.2 * k, spacing: 1.2 * k, color: "upper" });
      break;
    case "dangerous-area":
      push({ t: "hatch", d, angles: [45, 135], width: o.std === "2000" ? 0.25 * k : 0.2 * k, spacing: o.std === "2000" ? 0.6 * k : 1.2 * k, color: "upper" });
      break;
    case "temporary-construction":
      push({ t: "path", d, fill: true, color: "purple50" });
      push({ t: "path", d, stroke: 0.1 * k, cap: "butt", join: "miter", color: "upper" });
      break;
    case "white-out": push({ t: "path", d, fill: true, color: "white" }); break;
    // a mask: white outside its holes (even-odd), the map hidden where nothing of the course is (the advanced level)
    case "mask": push({ t: "path", d: [...d, ...(o.holes || []).flatMap((h) => poly(h, true))], fill: true, color: "white" }); break;
    default: break;
  }
}
function rectSpecial(o, push) {
  const [l, b, r, t] = o.box;
  if (o.kind === "ellipse") {
    const cx = (l + r) / 2, cy = (b + t) / 2, ax = (r - l) / 2, ay = (t - b) / 2, n = 48;
    const pts = Array.from({ length: n }, (_, i) => [cx + ax * Math.cos((i / n) * 2 * Math.PI), cy + ay * Math.sin((i / n) * 2 * Math.PI)]);
    strokeKind(pts, true, o, push);
    return;
  }
  const rr = Math.min(o.radiusCorner || 0, (r - l) / 2, (t - b) / 2);
  if (rr > 0 && o.lineKind !== "double") {
    const d = [["M", l + rr, b], ["L", r - rr, b], ...arcPath(r - rr, b + rr, rr, 270, 360, false), ["L", r, t - rr], ...arcPath(r - rr, t - rr, rr, 0, 90, false),
      ["L", l + rr, t], ...arcPath(l + rr, t - rr, rr, 90, 180, false), ["L", l, b + rr], ...arcPath(l + rr, b + rr, rr, 180, 270, false), ["Z"]];
    push({ t: "path", d, stroke: o.lw, cap: "butt", join: "miter", color: specialColor(o.color) });
    return;
  }
  strokeKind([[l, b], [r, b], [r, t], [l, t]], true, o, push);
}
function textSpecial(o, push) {
  const [l, b, r, t] = o.box, bold = !!o.font.bold, fam = family(o.font.name);
  const lines = String(o.text).split(/\r?\n|\|/);
  let size;
  if (o.font.height > 0) size = o.font.height / CAP_HEIGHT;
  else {
    // automatic: the largest size whose lines fill the box
    const wmax = Math.max(...lines.map((x) => textWidth(x, bold, fam, !!o.font.italic))) || 1;
    size = Math.min((r - l) / wmax, (t - b) / (lines.length * 1.15));
  }
  const lh = size * 1.15;
  lines.forEach((line, i) => push({ t: "text", text: line, x: (l + r) / 2, y: t - lh * i - size * 0.95, size, bold, italic: !!o.font.italic, align: "center",
    color: specialColor(o.color), font: o.font.name, family: fam }));
}

// ---- the screen ---------------------------------------------------------------------------------------------------------
export const SCREEN = { upper: "#a7179b", lower: "#a7179b", black: "#000000", white: "#ffffff", purple50: "#d38bcd" };
export function cmykToRgb([c, m, y, k]) {
  const f = (v) => Math.round(255 * (1 - Math.min(1, v)) * (1 - k));
  return `rgb(${f(c)}, ${f(m)}, ${f(y)})`;
}
/**
 * Draw items on a canvas: `T(x, y)` gives screen pixels for map mm, `px` is the screen pixels per mm. Purple is drawn
 * with the Multiply blend (black map features show through) unless blend is "none". highlight: the selected objects'
 * colour.
 */
export function drawItems(ctx, items, T, px, { blend = "blend", purple = null, alpha = 1, highlight = "#0a84ff", dim = null, onInset = null } = {}) {
  const colorOf = (c) => (Array.isArray(c) ? cmykToRgb(c) : c === "upper" || c === "lower" ? (purple || SCREEN.upper) : SCREEN[c] || "#000");
  ctx.save();
  ctx.globalAlpha = alpha;
  for (const it of items) {
    const isPurple = it.color === "upper" || it.color === "lower" || it.color === "purple50";
    ctx.globalCompositeOperation = isPurple && blend !== "none" && !it.sel ? "multiply" : "source-over";
    const col = it.sel ? highlight : dim && !it.desc && isPurple ? dim : colorOf(it.color);
    if (it.t === "path") {
      ctx.beginPath();
      tracePath(ctx, it.d, T);
      if (it.fill) { ctx.fillStyle = it.color === "white" ? "#fff" : col; ctx.fill("evenodd"); }
      if (it.stroke) {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, it.stroke * px);
        ctx.lineCap = it.cap || "butt"; ctx.lineJoin = it.join || "miter";
        ctx.stroke();
      }
    } else if (it.t === "hatch") {
      ctx.save();
      ctx.beginPath(); tracePath(ctx, it.d, T); ctx.clip();
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, it.width * px);
      const xs = [], ys = [];
      for (const c of it.d) for (let i = 1; i < c.length; i += 2) { xs.push(c[i]); ys.push(c[i + 1]); }
      const l = Math.min(...xs), r = Math.max(...xs), b = Math.min(...ys), t = Math.max(...ys), R = Math.hypot(r - l, t - b);
      const cx = (l + r) / 2, cy = (b + t) / 2;
      ctx.beginPath();
      for (const a of it.angles) {
        const dx = Math.cos(a * DEG), dy = Math.sin(a * DEG), nx = -dy, ny = dx;
        for (let s = -R; s <= R; s += it.spacing) {
          const [x1, y1] = T(cx + nx * s - dx * R, cy + ny * s - dy * R), [x2, y2] = T(cx + nx * s + dx * R, cy + ny * s + dy * R);
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
      }
      ctx.stroke();
      ctx.restore();
    } else if (it.t === "text") {
      const [x, y] = T(it.x, it.y), size = it.size * px;
      if (size < 1.5) continue;
      ctx.font = `${it.italic ? "italic " : ""}${it.bold ? "700" : "400"} ${size}px ${cssFamily(it.family || (it.condensed ? "Roboto Condensed" : "Roboto"))}`;
      ctx.textAlign = it.align === "center" ? "center" : "left"; ctx.textBaseline = "alphabetic";
      if (it.outline > 0) { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = "#fff"; ctx.lineWidth = it.outline * px * 2; ctx.lineJoin = "round"; ctx.strokeText(it.text, x, y); }
      ctx.fillStyle = col; ctx.fillText(it.text, x, y);
    } else if (it.t === "inset") {
      // an enlarged section: the page draws the map and the course inside it (layoutx.js), then the frame that follows
      if (onInset) { ctx.save(); ctx.globalCompositeOperation = "source-over"; onInset(it); ctx.restore(); }
    } else if (it.t === "image" && it.image?.data) {
      const img = imageOf(it.image);
      if (img.complete && img.naturalWidth) {
        const [x1, y1] = T(it.box[0], it.box[3]), [x2, y2] = T(it.box[2], it.box[1]);
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(img, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      }
    }
  }
  ctx.restore();
}
const IMAGES = new Map();
function imageOf(im) {
  const key = im.data.slice(0, 64) + im.data.length;
  if (!IMAGES.has(key)) {
    const i = new Image();
    const fmt = (im.format || "png").toLowerCase().replace("jpg", "jpeg");
    i.src = `data:image/${fmt};base64,${im.data}`;
    IMAGES.set(key, i);
  }
  return IMAGES.get(key);
}
export function tracePath(ctx, d, T) {
  for (const c of d) {
    if (c[0] === "M") ctx.moveTo(...T(c[1], c[2]));
    else if (c[0] === "L") ctx.lineTo(...T(c[1], c[2]));
    else if (c[0] === "C") ctx.bezierCurveTo(...T(c[1], c[2]), ...T(c[3], c[4]), ...T(c[5], c[6]));
    else if (c[0] === "Z") ctx.closePath();
  }
}
/** Text lines for wrapping (re-exported for the panes). */
export { wrapText };
