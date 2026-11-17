// Cartographier's « Mise en page »: the print area, the magnetic north lines (ISOM 601: parallel lines toward magnetic north,
// spaced as the specification says — 30 mm on the paper at 1:15 000 / 1:10 000, 20 mm at 1:4 000 —, drawn over the print area
// with the map's declination and grivation), a scale bar and a legend of the symbols used (as text and graphics objects of the
// layout), logos (layout images, never dropped from any display: owner, 2026-11-04), the sources' credits (OpenStreetMap, IGN)
// added from the objects' sources, a QR code, and the symbol set (replace by the IOF's standards) and colours.

import * as G from "./geom.js";
import * as S from "./store.js";
import { modal, field, sel, num } from "../tracer/dialogs.js";
import * as P from "./panels.js";
import { t, tn, locale } from "./lang.js";
import { scaled, scaleSymbol } from "./symscale.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const NORTH = 601000;

/** A symbol of the map by its number (an exact sub-number first), else null. */
const symOf = (E, n) => E.live.symbol(n) || E.doc.symbols.find((s) => Math.floor(s.sym / 1000) === Math.floor(n / 1000)) || null;
/** A graphics line (OCAD's « graphics » object: its own colour and width), for the layout's frames and bars. */
const gline = (pts, col, w) => ({ sym: -2, otp: 2, ang: 0, coords: pts.map(([x, y]) => G.pt(x, y)), col, lineWidth: Math.round(w * 100), diamFlags: 0 });
const garea = (pts, col) => ({ sym: -2, otp: 3, ang: 0, coords: pts.map(([x, y]) => G.pt(x, y)), col, lineWidth: 0, diamFlags: 0 });
const black = (E) => (E.doc.colors.slice().reverse().find((c) => c.cmyk[3] > 0.95 && c.cmyk[0] < 0.05 && c.cmyk[1] < 0.05) || E.doc.colors[E.doc.colors.length - 1])?.num ?? 0;

export async function act(E, act) {
  if (act === "print-area") return printArea(E);
  if (act === "north-lines") return northLines(E);
  if (act === "scale-bar") return scaleBar(E);
  if (act === "legend") return legend(E);
  if (act === "logo") return logo(E);
  if (act === "credits") return credits(E);
  if (act === "qr") return qr(E);
  if (act === "symbol-set") return symbolSet(E);
  if (act === "colors") { const C = await import("./colors.js"); return C.editColors(E); }
}

// ---- print area: two clicks, or the map's extent with a margin -----------------------------------------------------------
async function printArea(E) {
  const v = await modal(E, { title: t("map.rib.print-area"), ok: t("map.ok.apply"), body: field(t("map.lay.paper"), sel("p", [["draw", t("map.lay.draw")], ["fit", t("map.lay.fit")], ["A4p", "A4 ↕"], ["A4l", "A4 ↔"], ["A3p", "A3 ↕"], ["A3l", "A3 ↔"]], "draw")) });
  if (!v) return;
  const b = E.live.bounds();
  if (v.p === "fit") { E.live.transact(t("map.undo.print"), () => E.live.setDocField("printArea", [b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5])); E.view.overlay(); return; }
  if (v.p !== "draw") {
    const [w, h] = { A4p: [210, 297], A4l: [297, 210], A3p: [297, 420], A3l: [420, 297] }[v.p], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    E.live.transact(t("map.undo.print"), () => E.live.setDocField("printArea", [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]));
    showArea(E); return;
  }
  let a = null;
  E.say(t("map.lay.twoClicks"));
  const prev = { tool: E.tool, name: E.toolName };
  E.tool = { name: "area", cursor: "crosshair",
    down(ev, p) { if (!a) { a = p; return; } E.tool = prev.tool; E.toolName = prev.name; E.live.transact(t("map.undo.print"), () => E.live.setDocField("printArea", [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])])); showArea(E); },
    move(ev, p) { this.cur = p; E.view.overlay(); },
    overlay(g) { if (a && this.cur) frame(g, E, [a[0], a[1], this.cur[0], this.cur[1]]); } };
}
function frame(g, E, r) {
  const m = E.view.matrix(), xs = [m.x(r[0], r[1]), m.x(r[2], r[3])], ys = [m.y(r[0], r[1]), m.y(r[2], r[3])];
  g.setLineDash([8 * E.view.dpr, 4 * E.view.dpr]); g.strokeStyle = "#455a64"; g.lineWidth = 1.5 * E.view.dpr;
  g.strokeRect(Math.min(...xs), Math.min(...ys), Math.abs(xs[1] - xs[0]), Math.abs(ys[1] - ys[0])); g.setLineDash([]);
}
function showArea(E) {
  const prev = E.view.drawOverlay;
  if (prev.__area) return;
  const f = (g) => { prev(g); if (E.doc.printArea) frame(g, E, E.doc.printArea); };
  f.__area = true; E.view.drawOverlay = f; E.view.overlay();
}

// ---- magnetic north lines -----------------------------------------------------------------------------------------------------------
async function northLines(E) {
  const s = symOf(E, NORTH);
  if (!s) { E.say(t("map.lay.noNorthSymbol"), "bad"); return; }
  const r = E.doc.printArea || E.live.bounds();
  const sprint = E.doc.scale <= 5000;
  const v = await modal(E, { title: t("map.rib.north-lines"), ok: t("map.ok.add"), body: field(t("map.lay.spacing"), `<input name="d" type="number" step="1" min="5" value="${sprint ? 20 : 30}">`, t("map.lay.spacingHint"))
    + field(t("map.props.declination"), `<input name="decl" type="number" step="0.01" value="${E.doc.declination || 0}">`, t("map.props.declinationHint")) });
  if (!v) return;
  const d = num(v.d), decl = num(v.decl) || 0;
  if (!(d > 0)) return;
  // magnetic north on the map: the declination (east positive) less the grid's angle to true north (grivation)
  const a = ((90 - (decl - (E.doc.realWorld?.angle || 0))) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, R = Math.hypot(r[2] - r[0], r[3] - r[1]) / 2;
  const clip = (p, q) => { const pts = G.flatten([[...p, 0], [...q, 0]]); const out = []; for (let i = 0; i <= 200; i++) { const x = p[0] + ((q[0] - p[0]) * i) / 200, y = p[1] + ((q[1] - p[1]) * i) / 200; if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) out.push([x, y]); } void pts; return out.length >= 2 ? [out[0], out[out.length - 1]] : null; };
  E.live.transact(t("map.undo.north"), () => {
    for (const o of E.doc.objects.filter((x) => x.sym === s.sym && x.src === "north")) E.live.remove(o.id);
    if (decl !== E.doc.declination) E.live.setDocField("declination", decl);
    for (let k = -Math.ceil(R / d); k <= Math.ceil(R / d); k++) {
      const ox = cx + nx * k * d, oy = cy + ny * k * d, seg = clip([ox - ux * R, oy - uy * R], [ox + ux * R, oy + uy * R]);
      if (seg) E.live.add({ sym: s.sym, otp: 2, ang: 0, coords: seg.map(([x, y]) => G.pt(x, y)), src: "north", part: E.part });
    }
  });
}

// ---- scale bar, legend, credits ------------------------------------------------------------------------------------------------------
async function placePoint(E, msg) {
  E.say(msg);
  const prev = { tool: E.tool, name: E.toolName };
  return new Promise((res) => { E.tool = { name: "place", cursor: "copy", down(ev, p) { E.tool = prev.tool; E.toolName = prev.name; E.say(""); res(p); } }; });
}
function textSymbol(E) { return E.doc.symbols.find((s) => s.otp === 4 && Math.floor(s.sym / 1000) >= 900) || E.doc.symbols.find((s) => s.otp === 4) || null; }
async function scaleBar(E) {
  const p = await placePoint(E, t("map.lay.where"));
  const col = black(E), m = E.doc.scale / 1000, step = E.doc.scale <= 5000 ? 25 : E.doc.scale <= 10000 ? 100 : 200, n = 4, w = step / m, h = 1.2;
  const ts = textSymbol(E);
  E.live.transact(t("map.undo.layout"), () => {
    for (let i = 0; i < n; i++) {
      const x = p[0] + i * w;
      if (i % 2 === 0) E.live.add({ ...garea([[x, p[1]], [x + w, p[1]], [x + w, p[1] + h], [x, p[1] + h]], col), part: E.part, src: "layout" });
      else E.live.add({ ...gline([[x, p[1]], [x + w, p[1]], [x + w, p[1] + h], [x, p[1] + h], [x, p[1]]], col, 0.15), part: E.part, src: "layout" });
    }
    if (ts) for (let i = 0; i <= n; i += 2) E.live.add({ sym: ts.sym, otp: 4, ang: 0, coords: [G.pt(p[0] + i * w - 1, p[1] + h + 1)], text: `${i * step} m`, part: E.part, src: "layout" });
    if (ts) E.live.add({ sym: ts.sym, otp: 4, ang: 0, coords: [G.pt(p[0], p[1] - 4)], text: `1:${nf(E.doc.scale)}`, part: E.part, src: "layout" });
  });
}
async function legend(E) {
  const used = new Set(E.doc.objects.filter((o) => o.sym > 0 && !o.draft && o.src !== "layout" && o.src !== "north").map((o) => o.sym));
  const list = E.doc.symbols.filter((s) => used.has(s.sym) && Math.floor(s.sym / 1000) < 600).sort((a, b) => a.sym - b.sym);
  if (!list.length) { E.say(t("map.lay.nothingUsed")); return; }
  const ts = textSymbol(E);
  if (!ts) { E.say(t("map.lay.noText"), "bad"); return; }
  const p = await placePoint(E, t("map.lay.where"));
  const row = 6, sw = 8, col2 = 70, rows = Math.ceil(list.length / 2);
  E.live.transact(t("map.undo.layout"), () => {
    list.forEach((s, i) => {
      const x = p[0] + (i >= rows ? col2 : 0), y = p[1] - (i % rows) * row;
      if (s.otp === 1) E.live.add({ sym: s.sym, otp: 1, ang: 0, coords: [G.pt(x + sw / 2, y)], part: E.part, src: "layout" });
      else if (s.otp === 3) E.live.add({ sym: s.sym, otp: 3, ang: 0, coords: [[x, y - 2], [x + sw, y - 2], [x + sw, y + 2], [x, y + 2]].map(([a, b]) => G.pt(a, b)), part: E.part, src: "layout" });
      else if (s.otp === 2) E.live.add({ sym: s.sym, otp: 2, ang: 0, coords: [G.pt(x, y), G.pt(x + sw, y)], part: E.part, src: "layout" });
      E.live.add({ sym: ts.sym, otp: 4, ang: 0, coords: [G.pt(x + sw + 2, y - 1)], text: P.symName(s), part: E.part, src: "layout" });
    });
  });
}
async function credits(E) {
  const srcs = new Set(E.doc.objects.map((o) => o.src).filter(Boolean));
  const lines = [];
  if (srcs.has("osm")) lines.push(t("map.data.osm.credit"));
  if (srcs.has("lidar")) {
    // the point clouds' owner, by the country at the map's middle (trace/lidarmap.js CREDITS)
    const LM = await import("../trace/lidarmap.js");
    let c = LM.CREDITS.fr;
    try { const f = await (await import("./data/frame.js")).frameOf(E.doc), b = E.live.bounds(); c = LM.CREDITS[LM.countryAt(...f.toLatLon((b[0] + b[2]) / 2, (b[1] + b[3]) / 2))] || c; } catch (e) { /* France's */ }
    lines.push(t("map.lay.creditLidar", { src: c.text }));
  }
  if (srcs.has("dem")) lines.push(t("map.lay.creditDem"));
  if (srcs.has("bdtopo")) lines.push(t("map.lay.creditBdtopo"));
  if (srcs.has("swisstopo")) lines.push(t("map.lay.creditSwisstopo"));
  if (srcs.has("tnm")) lines.push(t("map.lay.creditTnm"));
  lines.push(t("map.lay.creditOzimut"));
  const ts = textSymbol(E);
  if (!ts) { E.say(t("map.lay.noText"), "bad"); return; }
  const p = await placePoint(E, t("map.lay.where"));
  E.live.transact(t("map.undo.layout"), () => lines.forEach((l, i) => E.live.add({ sym: ts.sym, otp: 4, ang: 0, coords: [G.pt(p[0], p[1] - i * 4)], text: l, part: E.part, src: "layout" })));
}
async function qr(E) {
  const v = await modal(E, { title: t("map.rib.qr"), ok: t("map.ok.add"), body: field(t("map.lay.qrUrl"), `<input name="u" type="url" required placeholder="https://">`) });
  if (!v?.u) return;
  const { QRCODE } = await import("../vendor.js");
  const mod = await import(QRCODE), q = (mod.default || mod.qrcode || window.qrcode)(0, "M");
  q.addData(v.u); q.make();
  const n = q.getModuleCount(), cell = 0.5, p = await placePoint(E, t("map.lay.where")), col = black(E);
  E.live.transact(t("map.undo.layout"), () => {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) { const x = p[0] + c * cell, y = p[1] - r * cell; E.live.add({ ...garea([[x, y], [x + cell, y], [x + cell, y - cell], [x, y - cell]], col), part: E.part, src: "layout" }); }
  });
}
async function logo(E) {
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/png,image/jpeg";
  const f = await new Promise((res) => { i.onchange = () => res(i.files[0] || null); i.click(); });
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer()), im = await createImageBitmap(f);
  const p = await placePoint(E, t("map.lay.where"));
  const wmm = 30, u = wmm / im.width;
  // an OCAD layout image (parameter string 27, the file kept in it): drawn with the map wherever it is shown
  let s = ""; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  const str = `${f.name}\tr1\ts1\tx${p[0].toFixed(2)}\ty${p[1].toFixed(2)}\tu${u.toFixed(5)}\tv${u.toFixed(5)}\tF${btoa(s)}`;
  E.live.transact(t("map.undo.layout"), () => E.live.setDocField("params", [...E.doc.params, { type: 27, objIndex: 0, str }]));
  E.live.compile(); E.view.setLive(E.live); await E.live.map.ready; E.view.clearTiles();
}

// ---- symbol sets: replace or add the IOF's standards ---------------------------------------------------------------------------
const SETS = { "isom2017-2": "ISOM2017-2", "issprom2019-2": "ISSprOM2019-2" };
export async function loadSet(name) {
  const r = await fetch(new URL(`./sets/${name}.json`, import.meta.url));
  if (!r.ok) throw new Error(t("map.lay.noSet"));
  return r.json();
}
// the symbols' scaling lives in symscale.js (light: Pixel's invented maps use it without Cartographier's interface)
export { scaled, scaleSymbol };
/** The symbol set's colours a map lacks, added at the top of its table (matched by name): { cols, recolor(symbol) } — the
 *  map's colour table (changed when cols.length grew) and a function giving a set's symbol the map's colour numbers. */
function mergeColors(E, set) {
  const cols = E.doc.colors.slice(), byName = new Map(cols.map((c) => [c.name.toLowerCase(), c]));
  const remap = new Map();
  let next = Math.max(0, ...cols.map((c) => c.num)) + 1;
  for (const c of set.colors) { const have = byName.get(c.name.toLowerCase()); if (have) remap.set(c.num, have.num); else { const nc = { ...c, num: next++ }; cols.push(nc); remap.set(c.num, nc.num); } }
  const recolor = (s) => JSON.parse(JSON.stringify(s), (k, x) => (/(^|[a-z])Color$|^color$/.test(k) && typeof x === "number" && remap.has(x) ? remap.get(x) : x));
  return { cols, recolor };
}
/**
 * Symbols of the map's own IOF set (ISSprOM for a sprint map, else ISOM) the map lacks, added at its scale with the colours they
 * need (the LiDAR's helper contours, 996, on a map made before them). nums: OCAD numbers (996000). Resolves the numbers added.
 */
export async function addSetSymbols(E, nums) {
  const miss = nums.filter((n) => !E.live.symbol(n));
  if (!miss.length) return [];
  const key = /ISSprOM/i.test(E.doc.standard || "") || (!E.doc.standard && E.doc.scale <= 5000) ? "issprom2019-2" : "isom2017-2";
  const set = await loadSet(key);
  const want = scaled(set, E.doc.scale).filter((s) => miss.includes(s.sym));
  if (!want.length) return [];
  const used = new Set(want.flatMap((s) => JSON.stringify(s).match(/"(?:[a-z]*Color|color)":\d+/gi) || []).map((m) => +m.split(":")[1]));
  const { cols, recolor } = mergeColors(E, { colors: set.colors.filter((c) => used.has(c.num)) });
  E.live.transact(t("map.undo.set"), () => {
    if (cols.length !== E.doc.colors.length) E.live.setColors(cols);
    for (const s0 of want) E.live.addSymbol({ ...recolor(s0), set: key });
  });
  E.live.compile(); E.view.setLive(E.live); E.view.clearTiles();
  const Pn = await import("./panels.js"); Pn.drawLeft(E);
  return want.map((s) => s.sym);
}
async function symbolSet(E) {
  const v = await modal(E, { title: t("map.rib.symbol-set"), ok: t("map.ok.apply"), body: field(t("map.lay.set"), sel("s", Object.entries(SETS).map(([k, n]) => [k, n]), E.doc.scale <= 5000 ? "issprom2019-2" : "isom2017-2"))
    + `<fieldset class="mp-choice"><legend>${esc(t("map.lay.setHow"))}</legend><label><input type="radio" name="h" value="add" checked> ${esc(t("map.lay.setAdd"))}</label><label><input type="radio" name="h" value="replace"> ${esc(t("map.lay.setReplace"))}</label></fieldset>` });
  if (!v) return;
  const set = await loadSet(v.s), syms = scaled(set, E.doc.scale);
  let added = 0, replaced = 0;
  // the set's colours the map lacks are added at the top of its table (by name)
  const { cols, recolor } = mergeColors(E, set);
  E.live.transact(t("map.undo.set"), () => {
    if (cols.length !== E.doc.colors.length) E.live.setColors(cols);
    for (const s0 of syms) {
      const s = { ...recolor(s0), set: v.s };
      if (E.live.symbol(s.sym)) { if (v.h === "replace") { E.live.updateSymbol(s.sym, s); replaced++; } }
      else { E.live.addSymbol(s); added++; }
    }
    if (!E.doc.standard) E.live.setDocField("standard", SETS[v.s]);
  });
  E.live.compile(); E.view.setLive(E.live); E.view.clearTiles();
  const P = await import("./panels.js"); P.drawLeft(E);
  E.say(t("map.lay.setDone", { a: added, r: replaced }));
}
void S;
