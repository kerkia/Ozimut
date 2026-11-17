// Cartographier's tools: what a click, a drag and a key do on the map. One tool at a time (E.tool); each gets the pointer in map
// mm and draws its own feedback on the overlay. Select (click, Shift-click, a box, drag to move, arrows to nudge), Vertices (move
// a point or a Bézier handle, add a point on a segment, Alt-click removes one, double-click turns a corner smooth or sharp),
// Draw (the current symbol: points, lines, areas, texts; straight, curve, freehand, rectangle with right angles, circle), Fill
// (an area from the lines around a click), Cut (a line at a point, an area along a line drawn across it), Cut hole, Measure.
// Snapping (to points and lines of other objects, 45° steps with Shift) applies to every tool that places a point.

import * as G from "./geom.js";
import * as B from "./boolean.js";
import { t } from "./lang.js";

const F = G.F;
const PX = 8;                                              // pick and snap reach, CSS pixels (a mouse; a finger: E.reachPx)
const reach = (E) => (E.reachPx || PX) * E.view.mmPerPx;
const ACCENT = "#a7179b", HANDLE = "#1565c0", SNAP = "#e65100";

// ---- shared helpers -------------------------------------------------------------------------------------------------------
/** The point a click places: snapped to another object's point or line (when snapping is on), else as it is; Shift keeps the
 *  segment from `prev` to a multiple of 45°. */
export function snap(E, p, { prev = null, shift = false, exclude = null } = {}) {
  let [x, y] = p, how = null;
  if (shift && prev) {
    const dx = x - prev[0], dy = y - prev[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(dx, dy) * Math.cos(Math.atan2(dy, dx) - a);
    return { p: [prev[0] + d * Math.cos(a), prev[1] + d * Math.sin(a)], how: "angle" };
  }
  if (!E.snapping) return { p: [x, y], how };
  const r = reach(E);
  let best = r * 1.2, bp = null;
  for (const o of E.live.near([x - r, y - r, x + r, y + r])) {
    if (exclude?.has(o.id) || o.inst?.visible === false) continue;
    for (const part of G.partsOf(o.coords)) for (const q of part.pts) {
      if (q[2] & (F.CTRL1 | F.CTRL2)) continue;
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < best) { best = d; bp = [q[0], q[1]]; how = "point"; }
    }
  }
  if (bp) return { p: bp, how };
  best = r;
  for (const o of E.live.near([x - r, y - r, x + r, y + r])) {
    if (exclude?.has(o.id) || o.inst?.visible === false || o.otp === 1 || o.otp === 4 || o.otp === 5) continue;
    for (const part of G.partsOf(o.coords)) {
      const n = G.nearestOn(G.flatten(part.pts, 0.05), x, y, o.otp === 3);
      if (n.d < best) { best = n.d; bp = [n.x, n.y]; how = "line"; }
    }
  }
  return bp ? { p: bp, how } : { p: [x, y], how: null };
}
/** A path's outline drawn on the overlay (device pixels). */
function strokePath(g, view, pts, { color = ACCENT, width = 1.6, dash = null, closed = false } = {}) {
  const m = view.matrix(), poly = G.flatten(pts, view.mmPerPx * 0.5);
  if (poly.length < 1) return;
  g.beginPath();
  poly.forEach((q, i) => (i ? g.lineTo(m.x(q[0], q[1]), m.y(q[0], q[1])) : g.moveTo(m.x(q[0], q[1]), m.y(q[0], q[1]))));
  if (closed) g.closePath();
  g.setLineDash(dash ? dash.map((v) => v * view.dpr) : []);
  g.lineWidth = width * view.dpr; g.strokeStyle = color; g.stroke();
  g.setLineDash([]);
}
function dot(g, view, x, y, { r = 4, fill = "#fff", stroke = HANDLE, square = false } = {}) {
  const m = view.matrix(), px = m.x(x, y), py = m.y(x, y), R = r * view.dpr;
  g.beginPath();
  if (square) g.rect(px - R, py - R, 2 * R, 2 * R); else g.arc(px, py, R, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill(); g.lineWidth = 1.4 * view.dpr; g.strokeStyle = stroke; g.stroke();
}
/** The selection's outlines. */
export function drawSelection(g, E) {
  for (const id of E.sel) {
    const o = E.live.object(id);
    if (!o) continue;
    const parts = G.partsOf(o.coords);
    if (o.otp === 1 || o.otp === 4 || o.otp === 5 || !parts.length) {
      const b = o.bb; if (!b) continue;
      const m = E.view.matrix(), xs = [m.x(b[0], b[1]), m.x(b[2], b[3]), m.x(b[0], b[3]), m.x(b[2], b[1])], ys = [m.y(b[0], b[1]), m.y(b[2], b[3]), m.y(b[0], b[3]), m.y(b[2], b[1])];
      g.setLineDash([4 * E.view.dpr, 3 * E.view.dpr]); g.lineWidth = 1.4 * E.view.dpr; g.strokeStyle = ACCENT;
      g.strokeRect(Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) - Math.min(...xs) + 6, Math.max(...ys) - Math.min(...ys) + 6);
      g.setLineDash([]);
      continue;
    }
    for (const p of parts) strokePath(g, E.view, p.pts, { closed: o.otp === 3, width: 1.8 });
  }
}
const bezierCircle = (cx, cy, r) => {
  const k = 0.5523 * r, P = [];
  const quads = [[[cx + r, cy], [cx + r, cy + k], [cx + k, cy + r], [cx, cy + r]], [[cx, cy + r], [cx - k, cy + r], [cx - r, cy + k], [cx - r, cy]],
    [[cx - r, cy], [cx - r, cy - k], [cx - k, cy - r], [cx, cy - r]], [[cx, cy - r], [cx + k, cy - r], [cx + r, cy - k], [cx + r, cy]]];
  P.push([...quads[0][0], 0]);
  for (const q of quads) P.push([...q[1], F.CTRL1], [...q[2], F.CTRL2], [...q[3], 0]);
  return P;
};
const recCoords = (pts, hole = false) => G.coordsOf([{ pts, hole }]);

// ---- select -----------------------------------------------------------------------------------------------------------------
export function selectTool(E) {
  let drag = null;
  return {
    name: "select", cursor: "default",
    down(ev, p) {
      const tol = reach(E);
      const hit = E.live.pick(p[0], p[1], tol);
      if (hit && E.sel.has(hit.id) && !ev.shiftKey) { drag = { kind: "move", from: p, to: p }; return; }
      if (hit) {
        if (ev.shiftKey) { if (E.sel.has(hit.id)) E.sel.delete(hit.id); else E.sel.add(hit.id); }
        else { E.sel.clear(); E.sel.add(hit.id); }
        E.selChanged();
        drag = ev.shiftKey ? null : { kind: "move", from: p, to: p };
        return;
      }
      if (!ev.shiftKey && E.sel.size) { E.sel.clear(); E.selChanged(); }
      drag = { kind: "box", from: p, to: p };
    },
    move(ev, p) {
      if (!drag) { E.hover(E.live.pick(p[0], p[1], reach(E))); return; }
      drag.to = drag.kind === "move" ? snap(E, p, { exclude: E.sel }).p : p;
      if (drag.kind === "move" && drag.anchor == null) {
        // snap the moved objects by the point nearest the press
        drag.anchor = drag.from;
      }
      E.view.overlay();
    },
    up(ev, p) {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.kind === "move") {
        const dx = d.to[0] - d.from[0], dy = d.to[1] - d.from[1];
        if (Math.hypot(dx, dy) > 0.5 * E.view.mmPerPx) E.moveSelection(dx, dy);
      } else {
        const b = [Math.min(d.from[0], d.to[0]), Math.min(d.from[1], d.to[1]), Math.max(d.from[0], d.to[0]), Math.max(d.from[1], d.to[1])];
        if (b[2] - b[0] > 2 * E.view.mmPerPx || b[3] - b[1] > 2 * E.view.mmPerPx) {
          for (const o of E.live.near(b)) if (o.bb && o.bb[0] >= b[0] && o.bb[2] <= b[2] && o.bb[1] >= b[1] && o.bb[3] <= b[3] && o.inst?.visible !== false && o.inst?.def?.visible !== false && !E.lockedPart(o)) E.sel.add(o.id);
          E.selChanged();
        }
      }
      E.view.overlay();
    },
    cancelDrag() { drag = null; E.view.overlay(); },
    key(ev) {
      const step = (ev.shiftKey ? 10 : 1) * E.view.mmPerPx;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (arrows[ev.key] && E.sel.size) { E.moveSelection(...arrows[ev.key]); return true; }
      return false;
    },
    overlay(g) {
      drawSelection(g, E);
      if (drag?.kind === "box") {
        const m = E.view.matrix(), x0 = m.x(drag.from[0], drag.from[1]), y0 = m.y(drag.from[0], drag.from[1]), x1 = m.x(drag.to[0], drag.to[1]), y1 = m.y(drag.to[0], drag.to[1]);
        g.fillStyle = "rgba(167,23,155,.08)"; g.strokeStyle = ACCENT; g.lineWidth = E.view.dpr;
        g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
      if (drag?.kind === "move") {
        const dx = drag.to[0] - drag.from[0], dy = drag.to[1] - drag.from[1];
        for (const id of E.sel) {
          const o = E.live.object(id); if (!o) continue;
          for (const part of G.partsOf(o.coords)) strokePath(g, E.view, part.pts.map((q) => [q[0] + dx, q[1] + dy, q[2]]), { closed: o.otp === 3, dash: [4, 3] });
        }
      }
    },
  };
}

// ---- vertices -----------------------------------------------------------------------------------------------------------------
export function vertexTool(E) {
  let drag = null, hover = null, picked = null;
  const pick = (h) => { picked = h; E.drawingChanged?.(); E.view.overlay(); };
  const handles = () => {
    const out = [];
    for (const id of E.sel) {
      const o = E.live.object(id);
      if (!o || o.otp === 4 || o.otp === 5) continue;
      o.coords.forEach((c, i) => out.push({ o, i, x: G.mmX(c), y: G.mmY(c), ctrl: G.isCtrl(c), corner: (G.flags(c) & F.CORNER) !== 0 }));
    }
    return out;
  };
  const near = (p) => {
    const r = reach(E);
    let best = null, bd = r;
    for (const h of handles()) { const d = Math.hypot(h.x - p[0], h.y - p[1]); if (d < bd || (best?.ctrl && !h.ctrl && d <= bd * 1.2)) { bd = d; best = h; } }
    return best;
  };
  return {
    name: "vertex", cursor: "crosshair",
    down(ev, p) {
      const h = near(p);
      if (h && (ev.altKey || ev.ctrlKey) && !h.ctrl) { pick(null); E.deleteVertex(h.o.id, h.i); return; }
      if (h) { drag = { h, from: p, to: p }; return; }
      if (picked) pick(null);
      // a click on a selected line adds a point there
      const r = reach(E);
      for (const id of E.sel) {
        const o = E.live.object(id);
        if (!o || o.otp === 1 || o.otp === 4 || o.otp === 5) continue;
        if (E.live.distance(o, p[0], p[1]) <= r) { E.insertVertex(o.id, p); return; }
      }
      const hit = E.live.pick(p[0], p[1], r);
      E.sel.clear(); if (hit) E.sel.add(hit.id); E.selChanged();
    },
    move(ev, p) {
      if (drag) { drag.to = drag.h.ctrl ? p : snap(E, p, { exclude: new Set([drag.h.o.id]) }).p; E.view.overlay(); return; }
      const h = near(p); if (h !== hover) { hover = h; E.view.overlay(); }
    },
    up() {
      if (!drag) return;
      const d = drag; drag = null;
      const dx = d.to[0] - d.from[0], dy = d.to[1] - d.from[1];
      if (Math.hypot(dx, dy) > 0.3 * E.view.mmPerPx) { pick(null); E.moveVertex(d.h.o.id, d.h.i, d.to, { dx, dy }); }
      else pick(d.h.ctrl ? null : { id: d.h.o.id, i: d.h.i });
    },
    cancelDrag() { drag = null; E.view.overlay(); },
    cancel() { picked = null; },
    /** What the touch bar offers (editor.js): the point in hand removed, or turned from a corner to a smooth point and back. */
    touch() { return picked && E.sel.has(picked.id) && E.live.object(picked.id)?.coords[picked.i] != null ? [{ k: "del", icon: "trash", label: t("map.touch.delPoint") }, { k: "corner", icon: "bend", label: t("map.touch.corner") }] : []; },
    touchDo(k) { const h = picked; if (!h || E.live.object(h.id)?.coords[h.i] == null) { pick(null); return; } if (k === "del") { pick(null); E.deleteVertex(h.id, h.i); } else E.toggleCorner(h.id, h.i); E.view.overlay(); },
    dbl(ev, p) {
      const h = near(p);
      if (h && !h.ctrl) E.toggleCorner(h.o.id, h.i);
    },
    overlay(g) {
      drawSelection(g, E);
      const m = E.view.matrix();
      const hs = handles();
      // the handles' lines
      g.strokeStyle = HANDLE; g.lineWidth = E.view.dpr;
      for (const h of hs) if (h.ctrl) {
        const c = h.o.coords, nb = (G.flags(c[h.i]) & F.CTRL1) ? h.i - 1 : h.i + 1;
        if (c[nb]) { g.beginPath(); g.moveTo(m.x(h.x, h.y), m.y(h.x, h.y)); g.lineTo(m.x(G.mmX(c[nb]), G.mmY(c[nb])), m.y(G.mmX(c[nb]), G.mmY(c[nb]))); g.stroke(); }
      }
      const big = E.reachPx > PX ? 1.5 : 1;                 // handles a finger can aim at
      for (const h of hs) dot(g, E.view, h.x, h.y, { r: (h.ctrl ? 3 : 4) * big, square: !h.ctrl && h.corner, fill: h === hover || (picked && h.o.id === picked.id && h.i === picked.i) ? HANDLE : "#fff" });
      if (drag) dot(g, E.view, drag.to[0], drag.to[1], { r: 5, fill: SNAP, stroke: "#fff" });
    },
  };
}

// ---- draw ---------------------------------------------------------------------------------------------------------------------
/** Draw with the current symbol: its kind (point, line, area, text) decides; `mode` straight | curve | free | rect | circle. */
export function drawTool(E) {
  let pts = [], dragging = null, free = null, cursor = null, snapHow = null, press = null;
  const sym = () => E.currentSymbol();
  const kind = () => { const s = sym(); return !s ? null : s.otp === 1 ? "point" : s.otp === 3 ? "area" : s.otp === 4 || s.otp === 6 ? "text" : s.otp === 2 && s.symTp === 1 ? "text" : "line"; };
  const reset = () => { pts = []; dragging = null; free = null; press = null; E.view.overlay(); E.drawingChanged?.(false); };
  const enough = () => pts.length >= (kind() === "area" ? 3 : 2);
  const finish = () => {
    const k = kind();
    if (k === "area" && pts.length >= 3) E.addShape(sym(), pts, true);
    else if (k === "line" && pts.length >= 2) E.addShape(sym(), pts, false);
    reset();
  };
  const mode = () => E.drawMode || "straight";
  return {
    name: "draw", cursor: "crosshair",
    get busy() { return pts.length > 0 || !!free; },
    down(ev, p) {
      const k = kind();
      if (!k) { E.say(t("map.tool.pickSymbol")); return; }
      const s = snap(E, p, { prev: pts.length ? pts[pts.length - 1] : null, shift: ev.shiftKey });
      press = { n: pts.length };
      cursor = s.p;
      if (k === "point") { dragging = { at: s.p, angle: 0 }; return; }
      if (k === "text") { dragging = { text: s.p }; return; }
      const m = mode();
      if (m === "free") { free = [[s.p[0], s.p[1], 0]]; return; }
      if (m === "circle") { dragging = { centre: s.p, r: 0 }; return; }
      if (m === "rect" && pts.length >= 2) {
        // each side at a right angle to the one before
        const a = pts[pts.length - 2], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
        const nx = -dy / n, ny = dx / n, d = (s.p[0] - b[0]) * nx + (s.p[1] - b[1]) * ny;
        pts.push([b[0] + nx * d, b[1] + ny * d, F.CORNER]);
        if (pts.length >= 4 && Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]) < reach(E)) { pts.pop(); finish(); }
        E.view.overlay(); return;
      }
      // closing an area on its first point
      if (pts.length >= 3 && Math.hypot(s.p[0] - pts[0][0], s.p[1] - pts[0][1]) < reach(E) && kind() === "area") { finish(); return; }
      if (m === "curve") { dragging = { at: s.p }; pts.push([s.p[0], s.p[1], 0]); }
      else pts.push([s.p[0], s.p[1], m === "rect" ? F.CORNER : 0]);
      E.drawingChanged?.(true);
      E.view.overlay();
    },
    move(ev, p) {
      const s = snap(E, p, { prev: pts.length ? pts[pts.length - 1] : null, shift: ev.shiftKey });
      cursor = s.p; snapHow = s.how;
      if (free) { const l = free[free.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 1.5 * E.view.mmPerPx) free.push([p[0], p[1], 0]); }
      if (dragging?.centre) dragging.r = Math.hypot(p[0] - dragging.centre[0], p[1] - dragging.centre[1]);
      if (dragging?.angle != null && dragging.at) dragging.angle = Math.atan2(p[1] - dragging.at[1], p[0] - dragging.at[0]);
      if (dragging && mode() === "curve" && dragging.at && kind() !== "point") {
        // a curve point: the drag sets its tangent (the handles before and after it, symmetrical)
        const last = pts.length - 1, a = dragging.at, hx = p[0] - a[0], hy = p[1] - a[1];
        dragging.handle = Math.hypot(hx, hy) > 2 * E.view.mmPerPx ? [hx, hy] : null;
        pts[last].handle = dragging.handle;
      }
      E.view.overlay();
    },
    up(ev, p) {
      const k = kind();
      press = null;
      if (dragging?.text) { const at = dragging.text; dragging = null; E.addText(sym(), at); return; }
      if (k === "point" && dragging) {
        const s = sym(), rot = (s.flags & 1) !== 0, moved = Math.hypot(p[0] - dragging.at[0], p[1] - dragging.at[1]) > 3 * E.view.mmPerPx;
        E.addPoint(s, dragging.at, rot && moved ? (dragging.angle * 180) / Math.PI : 0);
        dragging = null; E.view.overlay(); return;
      }
      if (free) {
        const poly = G.simplify(free, 0.6 * E.view.mmPerPx);
        const smooth = G.smoothCurve(poly, k === "area");
        if (poly.length >= 2) E.addShape(sym(), smooth, k === "area");
        free = null; E.view.overlay(); return;
      }
      if (dragging?.centre) {
        if (dragging.r > 0.2) E.addShape(sym(), bezierCircle(dragging.centre[0], dragging.centre[1], dragging.r), k === "area");
        dragging = null; E.view.overlay(); return;
      }
      dragging = null;
    },
    dbl() { if (pts.length) finish(); },
    key(ev) {
      if (ev.key === "Enter") { finish(); return true; }
      if (ev.key === "Escape" && (pts.length || free)) { reset(); return true; }
      if (ev.key === "Backspace" && pts.length) { pts.pop(); cursor = null; E.view.overlay(); E.drawingChanged?.(pts.length > 0); return true; }
      return false;
    },
    /** A second finger came down (a pinch, a two-finger move): what the first one started is given up. */
    cancelDrag() {
      if (!press) return;
      pts.length = Math.min(pts.length, press.n); press = null; dragging = null; free = null; cursor = null;
      E.view.overlay(); E.drawingChanged?.(pts.length > 0);
    },
    /** What the touch bar offers while a line or an area is being drawn (a finger has no Enter, Escape or Backspace). */
    touch() {
      if (!pts.length) return [];
      return [{ k: "undo", icon: "undo", label: t("map.touch.undoPoint") }, { k: "cancel", icon: "close", label: t("map.touch.cancel") },
        { k: "finish", icon: "check", label: t("map.touch.finish"), primary: true, off: !enough() }];
    },
    touchDo(k) { if (k === "undo") this.key({ key: "Backspace" }); else if (k === "cancel") reset(); else if (enough()) finish(); },
    cancel: reset,
    finish,
    /** The points drawn, with curves made from their tangents: [x, y, flags] with CTRL1/CTRL2 controls. */
    path() { return curvePath(pts); },
    overlay(g) {
      const k = kind();
      const path = curvePath(cursor && pts.length && !dragging ? [...pts, [cursor[0], cursor[1], 0]] : pts);
      if (path.length) strokePath(g, E.view, path, { closed: k === "area" && pts.length >= 2, dash: [5, 3] });
      for (const q of pts) dot(g, E.view, q[0], q[1], { r: 3.5, square: (q[2] & F.CORNER) !== 0 });
      if (free) strokePath(g, E.view, free, { dash: [3, 3] });
      if (dragging?.centre) strokePath(g, E.view, bezierCircle(dragging.centre[0], dragging.centre[1], dragging.r), { closed: true, dash: [5, 3] });
      if (cursor && snapHow) dot(g, E.view, cursor[0], cursor[1], { r: 4, fill: SNAP, stroke: "#fff", square: snapHow === "point" });
    },
  };
}
/** Points with tangents (from the curve mode's drags) as a Bézier path. */
export function curvePath(pts) {
  if (!pts.some((q) => q.handle)) return pts.map((q) => [q[0], q[1], q[2]]);
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i];
    if (i > 0) {
      const a = pts[i - 1];
      const ha = a.handle || [0, 0], hb = q.handle || [0, 0];
      if (a.handle || q.handle) {
        const L = Math.hypot(q[0] - a[0], q[1] - a[1]) / 3, na = Math.hypot(...ha) || 1, nb = Math.hypot(...hb) || 1;
        out.push([a[0] + (a.handle ? ha[0] / na * L : (q[0] - a[0]) / 3), a[1] + (a.handle ? ha[1] / na * L : (q[1] - a[1]) / 3), F.CTRL1]);
        out.push([q[0] - (q.handle ? hb[0] / nb * L : (q[0] - a[0]) / 3), q[1] - (q.handle ? hb[1] / nb * L : (q[1] - a[1]) / 3), F.CTRL2]);
      }
    }
    out.push([q[0], q[1], q[2]]);
  }
  return out;
}

// ---- fill: an area from the lines around a click ---------------------------------------------------------------------------------
/** The region a click falls in, bounded by the lines and area edges drawn around it: drawn on a small raster (a tenth of a mm),
 *  flood-filled from the click, its outline traced and simplified. */
export function fillRegion(E, p, reach = 120) {
  const res = Math.max(0.05, Math.min(0.25, reach / 1200));
  const N = Math.round((2 * reach) / res), x0 = p[0] - reach, y0 = p[1] - reach;
  const c = new OffscreenCanvas(N, N), g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff"; g.fillRect(0, 0, N, N);
  g.strokeStyle = "#000"; g.lineWidth = Math.max(1.5, 0.12 / res); g.lineJoin = "round";
  const X = (x) => (x - x0) / res, Y = (y) => N - (y - y0) / res;
  for (const o of E.live.near([x0, y0, x0 + 2 * reach, y0 + 2 * reach])) {
    if (o.otp !== 2 && o.otp !== 3) continue;
    if (o.inst?.visible === false) continue;
    for (const part of G.partsOf(o.coords)) {
      const poly = G.flatten(part.pts, res);
      g.beginPath(); poly.forEach((q, i) => (i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1])))); if (o.otp === 3) g.closePath(); g.stroke();
    }
  }
  const img = g.getImageData(0, 0, N, N).data, inside = new Uint8Array(N * N);
  const sx = Math.round(X(p[0])), sy = Math.round(Y(p[1]));
  if (img[(sy * N + sx) * 4] < 128) return null;
  const stack = [sy * N + sx]; inside[sy * N + sx] = 1;
  let touches = false;
  while (stack.length) {
    const i = stack.pop(), x = i % N, y = (i / N) | 0;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) { touches = true; continue; }
    for (const j of [i - 1, i + 1, i - N, i + N]) if (!inside[j] && img[j * 4] >= 128) { inside[j] = 1; stack.push(j); }
  }
  if (touches) return null;                               // not closed within reach
  // grow by half the line width, so that the area meets the lines' middles
  const grow = Math.round(Math.max(1.5, 0.12 / res) / 2) + 1;
  let cur = inside;
  for (let k = 0; k < grow; k++) { const nx = cur.slice(); for (let i = N; i < N * N - N; i++) if (!cur[i] && (cur[i - 1] || cur[i + 1] || cur[i - N] || cur[i + N])) nx[i] = 1; cur = nx; }
  const ring = traceOutline(cur, N);
  if (!ring || ring.length < 3) return null;
  const mm = ring.map(([x, y]) => [x0 + x * res, y0 + (N - y) * res, 0]);
  return G.simplify([...mm, mm[0]], res * 0.8).slice(0, -1);
}
/** The outer boundary of a binary mask (Moore neighbour tracing), in pixel coordinates. */
function traceOutline(m, N) {
  let s = -1;
  for (let i = 0; i < N * N; i++) if (m[i]) { s = i; break; }
  if (s < 0) return null;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x];
  let x = s % N, y = (s / N) | 0, d = 7;
  const sx = x, sy = y, out = [[x, y]];
  for (let guard = 0; guard < 4 * N * N; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (d + 6 + k) % 8, nx = x + dirs[nd][0], ny = y + dirs[nd][1];
      if (at(nx, ny)) { x = nx; y = ny; d = nd; found = true; break; }
    }
    if (!found || (x === sx && y === sy)) break;
    out.push([x, y]);
  }
  return out;
}
export function fillTool(E) {
  return {
    name: "fill", cursor: "copy",
    down(ev, p) {
      const s = E.currentSymbol();
      if (!s || s.otp !== 3) { E.say(t("map.tool.pickArea")); return; }
      const ring = fillRegion(E, p);
      if (!ring) { E.say(t("map.tool.notClosed")); return; }
      E.addShape(s, ring, true);
    },
  };
}

// ---- cut, cut a hole, measure -------------------------------------------------------------------------------------------------------
export function cutTool(E) {
  const d = drawTool(E);
  let line = null;
  return {
    name: "cut", cursor: "crosshair",
    down(ev, p) {
      const r = reach(E);
      // a line under the click: cut there
      const lineHit = E.live.pick(p[0], p[1], r, { filter: (o) => o.otp === 2 });
      if (lineHit && !line) { E.splitLine(lineHit.id, p); return; }
      // else draw a line across an area; Enter or a double-click cuts
      if (!line) line = [];
      line.push(snap(E, p).p.concat(0));
      this.cursor_ = null;
      E.view.overlay(); E.drawingChanged?.(true);
    },
    move(ev, p) { this.cursor_ = p; E.view.overlay(); },
    dbl() { this.apply(); },
    key(ev) { if (ev.key === "Enter") { this.apply(); return true; } if (ev.key === "Escape" && line) { this.drop(); return true; } return false; },
    drop() { line = null; E.view.overlay(); E.drawingChanged?.(false); },
    async apply() {
      if (!line || line.length < 2) { this.drop(); return; }
      const l = line; line = null; E.drawingChanged?.(false);
      await E.cutAreas(l);
      E.view.overlay();
    },
    cancelDrag() { if (line?.length) { line.pop(); if (!line.length) line = null; E.view.overlay(); E.drawingChanged?.(!!line); } },
    touch() { return line ? [{ k: "cancel", icon: "close", label: t("map.touch.cancel") }, { k: "apply", icon: "scan", label: t("map.touch.cut"), primary: true, off: line.length < 2 }] : []; },
    touchDo(k) { if (k === "cancel") this.drop(); else this.apply(); },
    overlay(g) { drawSelection(g, E); if (line) strokePath(g, E.view, this.cursor_ ? [...line, [...this.cursor_, 0]] : line, { color: "#d32f2f", dash: [4, 3] }); void d; },
  };
}
export function holeTool(E) {
  let pts = [];
  return {
    name: "hole", cursor: "crosshair",
    down(ev, p) {
      if (!pts.length) {
        const hit = [...E.sel].map((id) => E.live.object(id)).find((o) => o?.otp === 3);
        if (!hit) { const a = E.live.pick(p[0], p[1], reach(E), { filter: (o) => o.otp === 3 }); if (!a) { E.say(t("map.tool.pickAreaFirst")); return; } E.sel.clear(); E.sel.add(a.id); E.selChanged(); }
      }
      const s = snap(E, p).p;
      if (pts.length >= 3 && Math.hypot(s[0] - pts[0][0], s[1] - pts[0][1]) < reach(E)) { this.finish(); return; }
      pts.push([s[0], s[1], 0]); this.cur = null; E.view.overlay(); E.drawingChanged?.(true);
    },
    move(ev, p) { this.cur = p; E.view.overlay(); },
    dbl() { this.finish(); },
    key(ev) { if (ev.key === "Enter") { this.finish(); return true; } if (ev.key === "Escape" && pts.length) { this.drop(); return true; } return false; },
    drop() { pts = []; E.view.overlay(); E.drawingChanged?.(false); },
    finish() { const area = [...E.sel].map((id) => E.live.object(id)).find((o) => o?.otp === 3); if (area && pts.length >= 3) E.addHole(area.id, pts); this.drop(); },
    cancelDrag() { if (pts.length) { pts.pop(); E.view.overlay(); E.drawingChanged?.(pts.length > 0); } },
    touch() { return pts.length ? [{ k: "cancel", icon: "close", label: t("map.touch.cancel") }, { k: "finish", icon: "check", label: t("map.touch.finish"), primary: true, off: pts.length < 3 }] : []; },
    touchDo(k) { if (k === "cancel") this.drop(); else this.finish(); },
    overlay(g) { drawSelection(g, E); if (pts.length) strokePath(g, E.view, this.cur ? [...pts, [...this.cur, 0]] : pts, { closed: true, dash: [4, 3], color: "#d32f2f" }); },
  };
}
/** The hand: a drag moves the view, whatever is under it (owner, 2026-11-12: the middle button and Space + drag were not
 *  found; OpenOrienteering Mapper has its « Pan » tool). */
export function panTool(E) {
  let from = null;
  return {
    name: "pan", cursor: "grab",
    down(ev) { from = [ev.clientX, ev.clientY]; E.$("#mp-map").style.cursor = "grabbing"; },
    move(ev) { if (!from) return; E.view.panPx(ev.clientX - from[0], ev.clientY - from[1]); from = [ev.clientX, ev.clientY]; },
    up() { from = null; E.$("#mp-map").style.cursor = "grab"; },
    cancel() { from = null; },
  };
}
export function measureTool(E) {
  let pts = [], cur = null;
  return {
    name: "measure", cursor: "crosshair",
    down(ev, p) {
      if (pts.length >= 2 && ev.detail === 1 && !ev.shiftKey && this.done) { pts = []; this.done = false; }
      pts.push(snap(E, p).p.concat(0)); cur = null;
      E.view.overlay(); E.showMeasure(this.lengths()); E.drawingChanged?.(true);      // a finger does not hover: the length at each point
    },
    move(ev, p) { cur = p; E.view.overlay(); E.showMeasure(this.lengths()); },
    dbl() { this.done = true; },
    key(ev) { if (ev.key === "Escape") { this.drop(); return true; } return false; },
    drop() { pts = []; cur = null; this.done = false; E.view.overlay(); E.showMeasure(null); E.drawingChanged?.(false); },
    cancel() { E.showMeasure(null); },
    cancelDrag() { if (pts.length) { pts.pop(); E.view.overlay(); E.showMeasure(this.lengths()); } },
    touch() { return pts.length ? [{ k: "clear", icon: "close", label: t("map.touch.clear") }] : []; },
    touchDo() { this.drop(); },
    lengths() { const l = cur && !this.done ? [...pts, [...cur, 0]] : pts; return l.length >= 2 ? { mm: G.polyLength(l), area: l.length >= 3 ? Math.abs(G.ringArea(l)) : 0 } : null; },
    overlay(g) { if (pts.length) strokePath(g, E.view, cur && !this.done ? [...pts, [...cur, 0]] : pts, { color: "#0d47a1", dash: [6, 3] }); for (const q of pts) dot(g, E.view, q[0], q[1], { r: 3 }); },
  };
}
export { strokePath, dot, bezierCircle, recCoords };
