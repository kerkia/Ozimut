// The routes of the legs drawn over the map (owner, 2026-11-16: the Tracer's route analyzer, after OCAD's): each leg's routes
// — computed by the engine or drawn by hand — in their colours, the main one (what the course's length and climb follow) solid
// and thicker, the others thinner, a route drawn by hand dashed; and their labels « A · 412 m | +15 m | 2:31 » at the middle
// of each. On the screen and in the routes' image only: nothing of it is printed on the runners' maps.

import * as M from "./model.js";

export const ROUTE_COLOURS = ["#00a651", "#f7941d", "#0072bc", "#e0218a", "#8b5a2b", "#0d9488"];
export const LETTERS = "ABCDEFGH";
/** The pace of a course's routes, minutes per km of white forest on the flat: the course's own, else the event's, else the map's kind's. */
export const isSprintEv = (ev) => ev.appearance?.mapStandard === "Spr2019" || (ev.map.scale || 10000) <= 5000;
export const paceOf = (ev, courseId) => ev.routing?.paces?.[courseId] || ev.routing?.pace || (isSprintEv(ev) ? 4 : 6);
/** m:ss (h:mm:ss over an hour). */
export const clock = (s) => { if (!Number.isFinite(s)) return "—"; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
/** A route's time at a pace (min/km): its model time × the pace; null when the route was not measured. */
export const timeOf = (r, pace) => (r.m?.t > 0 ? r.m.t * ((pace * 60) / 1000) : null);
/**
 * A leg's routes ranked for display: the measured ones by time, then the others; each with its letter and colour:
 * [{ …legRouteList's, rank, letter, colour, len (m, measured else along its points) }].
 */
export function rankedRoutes(ev, c1, c2) {
  const list = M.legRouteList(ev, c1, c2).map((r) => ({ ...r, len: r.m?.len > 0 ? r.m.len : M.mmToM(ev, M.pathLength(r.pts)) }));
  const order = list.slice().sort((a, b) => (a.m?.t > 0 ? a.m.t : Infinity) - (b.m?.t > 0 ? b.m.t : Infinity) || (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.i - b.i);
  order.forEach((r, k) => { r.rank = k; r.letter = LETTERS[k] || "·"; r.colour = ROUTE_COLOURS[k % ROUTE_COLOURS.length]; });
  return order;
}
/** A route's label: « A · 412 m | +15 m | 2:31 » (the climb and the time when measured). */
export function labelOf(r, pace, nf) {
  const parts = [`${nf(Math.round(r.len))} m`];
  if (r.m) { parts.push(`+${Math.round(r.m.up || 0)} m`); const tm = timeOf(r, pace); if (tm != null) parts.push(clock(tm)); }
  return `${r.letter} · ${parts.join(" | ")}`;
}
const midOf = (sp) => {
  let L = 0; for (let q = 1; q < sp.length; q++) L += Math.hypot(sp[q][0] - sp[q - 1][0], sp[q][1] - sp[q - 1][1]);
  let acc = 0;
  for (let q = 1; q < sp.length; q++) {
    const d = Math.hypot(sp[q][0] - sp[q - 1][0], sp[q][1] - sp[q - 1][1]);
    if (acc + d >= L / 2 && d > 0) { const f = (L / 2 - acc) / d; return { x: sp[q - 1][0] + f * (sp[q][0] - sp[q - 1][0]), y: sp[q - 1][1] + f * (sp[q][1] - sp[q - 1][1]), L }; }
    acc += d;
  }
  return { x: sp[0][0], y: sp[0][1], L };
};
/**
 * Draw the routes of legs [[c1, c2]…]. o: { labels ("main" | "all" | "none"), pace (min/km), lit: { c1, c2, i } (a route lit from
 * the list), sel: [c1, c2] (the leg chosen: all its labels), scale (1 on the screen; larger in an image), nf (number format) }.
 */
export function paintRoutes(g, T, ev, legs, o = {}) {
  const sc = o.scale || 1, nf = o.nf || ((v) => String(v)), boxes = [];
  g.save(); g.lineJoin = "round"; g.lineCap = "round";
  const todo = [];
  for (const [c1, c2] of legs) {
    const rs = rankedRoutes(ev, c1, c2).filter((r) => !r.hidden);
    if (!rs.length) continue;
    const chosen = o.sel && o.sel[0] === c1 && o.sel[1] === c2;
    // the main route last: over the others
    for (const r of rs.slice().sort((a, b) => (a.main ? 1 : 0) - (b.main ? 1 : 0))) {
      const lit = o.lit && o.lit.c1 === c1 && o.lit.c2 === c2 && o.lit.i === r.i;
      const sp = r.pts.map((p) => T(...p));
      const line = (w, colour, dash) => { g.setLineDash(dash ? dash.map((d) => d * sc) : []); g.lineWidth = w * sc; g.strokeStyle = colour; g.beginPath(); sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
      const w = lit ? 4.2 : r.main ? 3 : 2;
      line(w + 2.4, "rgba(255,255,255,0.8)", null);
      line(w, r.colour, r.calc ? null : [7, 4]);
      const wanted = o.labels === "none" ? lit : o.labels === "all" || r.main || chosen || lit;
      if (wanted) todo.push({ r, sp, lit });
    }
  }
  // the labels, the lit one and the main ones first; one that would cover another is left out (it shows when its leg is chosen)
  g.setLineDash([]);
  g.font = `600 ${Math.round(11 * sc)}px system-ui, sans-serif`; g.textBaseline = "middle"; g.textAlign = "center";
  todo.sort((a, b) => (b.lit ? 2 : 0) + (b.r.main ? 1 : 0) - ((a.lit ? 2 : 0) + (a.r.main ? 1 : 0)));
  for (const { r, sp, lit } of todo) {
    const m = midOf(sp);
    if (m.L < 46 * sc && !lit) continue;
    const text = labelOf(r, o.pace || 6, nf), tw = g.measureText(text).width, bw = tw + 12 * sc, bh = 17 * sc;
    const b = [m.x - bw / 2, m.y - bh / 2, m.x + bw / 2, m.y + bh / 2];
    if (!lit && boxes.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) continue;
    boxes.push(b);
    g.fillStyle = "rgba(255,255,255,0.93)"; g.strokeStyle = r.colour; g.lineWidth = (lit ? 2 : 1.3) * sc;
    const rad = 4 * sc;
    g.beginPath(); g.moveTo(b[0] + rad, b[1]); g.arcTo(b[2], b[1], b[2], b[3], rad); g.arcTo(b[2], b[3], b[0], b[3], rad); g.arcTo(b[0], b[3], b[0], b[1], rad); g.arcTo(b[0], b[1], b[2], b[1], rad); g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = "#16151a"; g.fillText(text, m.x, m.y + 0.5 * sc);
  }
  g.restore();
}
