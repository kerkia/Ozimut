// Control descriptions read from the map (owner, 2026-11-16, after OCAD's automatic control description; OCAD and Mapper maps
// only: an image has no objects). When a control is placed, the map object under it — a point symbol first, else a line, else
// the smallest area — gives column D through a table of map symbols (ISOM 2017-2 and ISSprOM 2019-2 numbers, or ISOM 2000's, to
// ISCD's features: the specification's own « ISOM/ISSprOM » column, one feature chosen where it names several), which the setter
// changes for the event (ev.descTable: « Table des symboles »). Two linear features meeting there give columns E and F: a
// junction where three arms leave the spot, a crossing where four do. Dragging while placing the control says where the flag is:
// the drag's direction sets column G — « north-east side » of a point feature or a building, « edge » or « part » of an area,
// « end » of a line. Contours are left out (a re-entrant and a spur are the same line). Everything stays editable in the sheet.

import * as M from "./model.js";
import { symbol, symbolName, symbolsFor, existsIn } from "./symbols.js";
import { modal } from "./dialogs.js";
import { ctrlName } from "./reports.js";
import { t, tn, lang } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// ISCD 2024's number → Purple Pen's symbol id (the Tracer's): four man-made features are numbered otherwise there
const PP = { "5.21": "5.23", "5.22": "5.24", "5.23": "5.25", "5.24": "5.26" };
const ppId = (ref) => PP[ref] || ref;
// map symbol number → ISCD feature (column D), or [D, E] (sandy ground: open land, sandy)
const T2017 = {
  104: "1.4", 105: "1.6", 106: "1.6", 107: "1.7", 108: "1.8", 109: "1.10", 110: "1.10", 111: "1.13", 112: "1.14", 113: "1.15", 114: "1.15", 115: "1.16",
  201: "2.1", 202: "2.1", 203: "2.3", 204: "2.4", 205: "2.4", 206: "2.2", 207: "2.6", 208: "2.5", 209: "2.5", 210: "2.7", 211: "2.7", 212: "2.7", 213: ["4.1", "8.8"], 214: "2.8", 215: "2.10",
  301: "3.1", 302: "3.2", 303: "3.3", 304: "3.4", 305: "3.4", 306: "3.5", 307: "3.7", 308: "3.7", 309: "3.6", 310: "3.7", 311: "3.9", 312: "3.10", 313: "6.1",
  401: "4.1", 402: "4.2", 403: "4.1", 404: "4.2", 406: "4.5", 407: "4.5", 408: "4.5", 409: "4.5", 410: "4.5", 411: "4.6", 412: "4.1", 413: "4.1", 414: "4.1", 415: "4.7", 416: "4.7", 417: "4.9", 418: "4.9", 419: "4.10",
  501: "5.12", 502: "5.1", 503: "5.1", 504: "5.2", 505: "5.2", 506: "5.2", 507: "5.2", 508: "5.3", 509: "5.24", 510: "5.5", 511: "5.5", 512: "5.4", 513: "5.8", 514: "5.8", 515: "5.8", 516: "5.9", 517: "5.9", 518: "5.9",
  519: "5.10", 520: "5.23", 521: "5.11", 522: "5.21", 523: "5.13", 524: "5.15", 525: "5.16", 526: "5.17", 527: "5.18", 528: "5.14", 529: "5.14", 530: "6.2", 531: "6.1", 532: "5.22",
};
const T2000 = {
  106: "1.4", 107: "1.6", 108: "1.6", 109: "1.7", 110: "1.8", 112: "1.10", 113: "1.10", 115: "1.13", 116: "1.14", 117: "1.15", 118: "6.1",
  201: "2.1", 202: "2.2", 203: "2.1", 204: "1.14", 205: "2.3", 206: "2.4", 207: "2.4", 208: "2.5", 209: "2.6", 210: "2.7", 211: ["4.1", "8.8"], 212: "2.8",
  301: "3.1", 302: "3.2", 303: "3.3", 304: "3.4", 305: "3.4", 306: "3.4", 307: "3.5", 308: "3.6", 309: "3.7", 310: "3.7", 311: "3.7", 312: "3.9", 313: "3.10", 314: "6.1",
  401: "4.1", 402: "4.2", 403: "4.1", 404: "4.2", 406: "4.5", 407: "4.5", 408: "4.5", 409: "4.5", 410: "4.5", 412: "4.1", 413: "4.1", 414: "4.7", 415: "4.1", 416: "4.7", 418: "4.9", 419: "4.10", 420: "4.10",
  501: "5.1", 502: "5.1", 503: "5.1", 504: "5.1", 505: "5.2", 506: "5.2", 507: "5.2", 508: "5.2", 509: "5.3", 515: "5.24", 516: "5.5", 517: "5.5", 518: "5.7", 519: "5.8", 520: "5.8", 521: "5.8", 522: "5.9", 523: "5.9", 524: "5.9",
  525: "5.10", 526: "5.11", 528: "5.23", 529: "5.12", 530: "5.13", 533: "5.14", 534: "5.14", 535: "5.15", 536: "5.16", 537: "5.17", 538: "5.18", 539: "6.2", 540: "6.1",
};
const DIRS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];                    // by the angle, counter-clockwise from the east (y up)
const numOf = (d) => Math.floor(parseFloat(d.id));
/** The map's standard for the numbers' meaning: ISOM 2017 / ISSprOM, or ISOM 2000 (trace/vectorroutes.js's test, lighter). */
function oldNumbers(map) {
  let v = 0;
  for (const d of map.symdefs) { const n = numOf(d); if (n === 104) v += d.kind === "point" ? 1 : d.kind === "line" ? -1 : 0; else if (n === 109 || n === 110) v += d.kind === "line" ? 1 : d.kind === "point" ? -1 : 0; }
  return v > 0;
}
/** The table in force: the standard's defaults with the event's changes — { number: { d, e } } (Purple Pen ids; "" = none). */
export function tableOf(E, ev = E.ev) {
  const base = oldNumbers(E.map.vmap) ? T2000 : T2017, std = ev.descStandard || "2018", out = {};
  const ok = (id) => (id && existsIn(id, std) ? id : "");
  for (const [n, v] of Object.entries(base)) { const [d, e] = Array.isArray(v) ? v : [v, ""]; out[n] = { d: ok(ppId(d)), e: ok(e ? ppId(e) : ""), def: true }; }
  for (const [n, v] of Object.entries(ev.descTable || {})) out[n] = { d: ok(v.d || ""), e: ok(v.e || ""), def: false };
  return out;
}

// ---- the object under a point ---------------------------------------------------------------------------------------------------
const flatPts = (path) => { const f = path.flat(), P = f.fp, out = []; for (let i = 0; i < P.length; i += 2) out.push([P[i], P[i + 1]]); return out; };
const inBox = (b, x, y, m) => b && x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
/** How many times a polyline crosses the circle of radius r round c: the arms that leave the spot along it. */
function arms(pts, c, r) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) { const a = M.dist(pts[i - 1], c) < r, b = M.dist(pts[i], c) < r; if (a !== b) n++; }
  return n;
}
/**
 * The map objects at a point of the event's frame (mm), the most telling first: [{ kind ("point" | "line" | "area"), n (symbol
 * number), name, d (distance, mm), pts (a line's points), area, endDist (a line's nearer end), size (an area's box) }].
 */
export function objectsAt(E, p) {
  const map = E.map.vmap, X = p[0] + (E.map.ox || 0), Y = p[1] + (E.map.oy || 0), out = [];
  for (const d of map.symdefs) {
    const n = numOf(d);
    if (!d.visible || !(n >= 100 && n < 600)) continue;
    for (const s of d.symbols) {
      if (s.visible === false) continue;
      if (d.kind === "point" && Number.isFinite(s.x)) {
        const half = s.bbox ? Math.max(s.bbox[2] - s.bbox[0], s.bbox[3] - s.bbox[1]) / 2 : 0, dd = Math.hypot(s.x - X, s.y - Y);
        if (dd <= Math.max(0.7, half + 0.25)) out.push({ kind: "point", n, name: d.name, d: dd, at: [s.x, s.y] });
      } else if (d.kind === "line" && s.path && inBox(s.path.bbox, X, Y, 1)) {
        const pts = flatPts(s.path), nr = M.nearest(pts, [X, Y]), w = (d.maxThick || d.width || 0.25) / 2;
        if (nr.d <= 0.45 + w) out.push({ kind: "line", n, name: d.name, d: nr.d, pts, endDist: Math.min(M.dist(pts[0], [X, Y]), M.dist(pts[pts.length - 1], [X, Y])), end: M.dist(pts[0], [X, Y]) < M.dist(pts[pts.length - 1], [X, Y]) ? 0 : 1 });
      } else if (d.kind === "area" && s.area && inBox(s.area.bbox, X, Y, 0) && s.area.isInside(X, Y)) {
        const b = s.area.bbox;
        out.push({ kind: "area", n, name: d.name, d: 0, area: s.area, size: (b[2] - b[0]) * (b[3] - b[1]) });
      }
    }
  }
  const rank = { point: 0, line: 1, area: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || (a.kind === "area" ? a.size - b.size : a.d - b.d));
}
/** How far inside an area a point is, roughly (mm): the nearest of eight probes that leaves the area. */
function depthIn(area, X, Y) {
  for (const r of [0.4, 0.8, 1.2, 2, 3]) for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; if (!area.isInside(X + r * Math.cos(a), Y + r * Math.sin(a))) return r; }
  return 4;
}
/**
 * The description read at a point: { symbols: { 1: D, 2: E, 3: F, 4: G } (the boxes it fills, Purple Pen ids), what } or null
 * when nothing with a description lies there. dir: the drag's direction in degrees (counter-clockwise from the east), or null.
 */
export function describeAt(E, ev, p, dir = null) {
  if (E.map?.kind !== "vector" || !E.map.vmap) return null;
  const table = tableOf(E, ev), std = ev.descStandard || "2018", X = p[0] + (E.map.ox || 0), Y = p[1] + (E.map.oy || 0);
  const list = objectsAt(E, p).filter((o) => table[o.n]?.d);
  if (!list.length) return null;
  const o = list[0], row = table[o.n], out = { 1: row.d };
  if (row.e) out[2] = row.e;
  // two linear features meeting: the second in column E, a junction (three arms) or a crossing (four or more) in column F
  if (o.kind === "line") {
    const lines = list.filter((x) => x.kind === "line"), n = lines.reduce((sum, x) => sum + arms(x.pts, [X, Y], 1.1), 0);
    if (lines.length >= 2 && n >= 3) { out[2] = table[lines[1].n].d; out[3] = n >= 4 ? "10.1" : "10.2"; }
    else if (lines.length === 1 && n >= 3) { out[2] = row.d; out[3] = n >= 4 ? "10.1" : "10.2"; }      // one object looping back on itself
  }
  // column G from the drag: where the flag stands
  if (dir != null && !out[3]) {
    const D = DIRS[((Math.round(dir / 45) % 8) + 8) % 8];
    let g = "";
    if (o.kind === "point" || /^5\.(11|23|13)$/.test(row.d)) g = `11.1${D}`;                             // a side (a building's, a canopy's, a ruin's too)
    else if (o.kind === "area") g = depthIn(o.area, X, Y) <= 0.8 ? `11.2${D}` : `11.3${D}`;            // the edge, else a part
    else if (o.kind === "line" && o.endDist <= 1) g = `11.8${D}`;                                        // an end
    if (g && existsIn(g, std)) out[4] = g;
  }
  return { symbols: out, what: o.name || String(o.n) };
}
/** A new control's description filled from the map (inside a change): the boxes read, only those the control has empty. */
export function autoFill(E, ev, id, dir = null) {
  if (!E.opts?.autoDesc || E.map?.kind !== "vector") return null;
  const c = ev.controls[id];
  if (!c || c.kind !== "normal") return null;
  let r = null;
  try { r = describeAt(E, ev, [c.x, c.y], dir); } catch (err) { console.error(err); }
  if (!r) return null;
  c.symbols = c.symbols || [null, null, null, null, null, null];
  for (const [box, sym] of Object.entries(r.symbols)) if (!c.symbols[box]) c.symbols[box] = sym;
  if (r.symbols[3]) c.colF = null;
  return r;
}
/** The drag's direction between two map points, degrees counter-clockwise from the east; null under 1.5 mm (a click). */
export const dragDir = (a, b) => (M.dist(a, b) < 1.5 ? null : (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
/** The words of a direction for the help line (« nord-est »). */
export const dirWord = (dir) => t(`trc.ad.dir.${DIRS[((Math.round(dir / 45) % 8) + 8) % 8]}`);

// ---- the table's dialog ------------------------------------------------------------------------------------------------------------
/**
 * « Table des symboles »: each symbol of the map with the feature its controls get in column D (and E), changed for this event;
 * « Réinitialiser » goes back to ISCD's own correspondence. From it, the controls still without a description are filled.
 */
export async function tableDialog(E) {
  const ev = E.ev;
  if (E.map?.kind !== "vector" || !E.map.vmap) { E.toast(t("trc.ad.needVector")); return; }
  const std = ev.descStandard || "2018", map = E.map.vmap, own = JSON.parse(JSON.stringify(ev.descTable || {}));
  const seen = new Map();
  for (const d of map.symdefs) { const n = numOf(d); if (!d.visible || !(n >= 100 && n < 600) || !["point", "line", "area"].includes(d.kind)) continue; const c = d.symbols.filter((s) => s.visible !== false).length; if (!c) continue; const x = seen.get(n) || { n, name: d.name, count: 0, kinds: new Set() }; x.count += c; x.kinds.add(d.kind); seen.set(n, x); }
  const rows = [...seen.values()].sort((a, b) => a.n - b.n);
  const feats = symbolsFor("D", std), looks = symbolsFor("E", std);
  const opts = (list, cur) => `<option value="">—</option>${list.map((s) => `<option value="${esc(s.id)}" ${s.id === cur ? "selected" : ""}>${esc(symbolName(s, lang()))}</option>`).join("")}`;
  const cur = () => { const x = { ...ev, descTable: own }; return tableOf(E, x); };
  const body = (q = "") => { const tb = cur(); return rows.filter((r) => !q || `${r.n} ${r.name}`.toLowerCase().includes(q)).map((r) => { const v = tb[r.n] || { d: "", e: "", def: true }; return `<tr data-n="${r.n}" class="${v.def ? "" : "tr-rt-changed"}"><td class="r">${r.n}</td><td>${esc(r.name)}</td><td class="r">${r.count}</td>
      <td><select data-k="d">${opts(feats, v.d)}</select></td><td><select data-k="e">${opts([...looks, ...feats], v.e)}</select></td>
      <td><button type="button" class="tr-icon" data-k="reset" title="${esc(t("trc.ad.resetRow"))}" ${v.def ? "hidden" : ""}>↺</button></td></tr>`; }).join(""); };
  const empty = () => Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === "normal" && !ev.controls[id].symbols?.[1]);
  const v = await modal(E, { title: t("trc.ad.tableTitle"), wide: true, ok: t("trc.ad.save"), extra: `<button type="button" class="btn" data-reset>${esc(t("trc.ad.reset"))}</button>`, body: `
    <p>${esc(t("trc.ad.tableIntro"))}</p>
    <div class="tr-rt-bar"><input type="search" id="tr-ad-q" placeholder="${esc(t("trc.ad.search"))}" data-fresh><span class="tr-hint" id="tr-ad-n"></span></div>
    <div class="table-wrap tr-rt-wrap"><table class="tr-table tr-rt"><thead><tr><th class="r">${esc(t("trc.ad.thNumber"))}</th><th>${esc(t("trc.ad.thSymbol"))}</th><th class="r">${esc(t("trc.ad.thObjects"))}</th><th>${esc(t("trc.ad.thD"))}</th><th>${esc(t("trc.ad.thE"))}</th><th></th></tr></thead>
      <tbody id="tr-ad-body">${body()}</tbody></table></div>
    ${empty().length ? `<label class="tr-check"><input type="checkbox" name="fill" checked data-fresh> ${esc(tn("trc.ad.fillEmpty", empty().length))}</label>` : ""}
    <p class="tr-hint">${esc(t("trc.ad.tableFoot"))}</p>`,
  onOpen: (f) => {
    const tb = f.querySelector("#tr-ad-body"), q = f.querySelector("#tr-ad-q");
    const redraw = () => { tb.innerHTML = body(q.value.trim().toLowerCase()); f.querySelector("#tr-ad-n").textContent = tn("trc.ad.changed", Object.keys(own).length); };
    q.addEventListener("input", redraw);
    f.querySelector("[data-reset]").addEventListener("click", () => { for (const k of Object.keys(own)) delete own[k]; redraw(); });
    tb.addEventListener("change", (e) => { const tr = e.target.closest("tr[data-n]"); if (!tr) return; own[tr.dataset.n] = { d: tr.querySelector('[data-k="d"]').value, e: tr.querySelector('[data-k="e"]').value }; redraw(); });
    tb.addEventListener("click", (e) => { const b = e.target.closest('[data-k="reset"]'); if (!b) return; delete own[b.closest("tr").dataset.n]; redraw(); });
    redraw();
  } });
  if (!v) return;
  const ids = v.fill ? empty() : [];
  let filled = 0;
  const changed = JSON.stringify(own) !== JSON.stringify(ev.descTable || {});
  if (!changed && !ids.length) return;
  E.change((x) => {
    if (Object.keys(own).length) x.descTable = own; else delete x.descTable;
    for (const id of ids) { const c = x.controls[id], r = describeAt(E, x, [c.x, c.y], null); if (!r) continue; c.symbols = c.symbols || [null, null, null, null, null, null]; for (const [box, sym] of Object.entries(r.symbols)) if (!c.symbols[box]) c.symbols[box] = sym; filled++; }
  }, t("trc.ad.undo"));
  if (ids.length) E.toast(tn("trc.ad.filled", filled, { of: ids.length }), 6000);
}
void symbol; void ctrlName;
