// « Fonds et relief » (owner, 2026-11-16, after the OCAD study: OpenStreetMap as a background « especially critical »): what the
// Tracer draws over the event's map, under the course — online layers placed by the map's georeference (OpenStreetMap
// everywhere; aerial photos and national maps where Ozimut knows a free service: IGN, swisstopo, USGS; in France IGN's LiDAR HD
// layers: the ground's relief, the height of the vegetation, the points' classes), and the relief of the event's own elevation
// model (relief.js): its shading, lit from the north-west, and its slopes in colours. Each layer has its opacity; the map's own
// is the editor's intensity slider. To check a map's age, place a sprint control, plan the pick-up, read a scanned map's relief.
// An event without a map (a training set on OpenStreetMap) prints its background in the map's place (pdf.js, exports.js:
// `backdropCanvas`). What is shown is this device's choice for the event (localStorage ocn.tr.bg.<event>): a working aid, not
// part of the courses. Tiles are fetched by the browser from each service, never by Ozimut; each service's credit shows on the
// map while its layer is on, and is printed with it.
// Also here: GPS tracks imported as line objects (a recce walk: GPX, TCX, FIT, NMEA sentences, or text rows of latitude and
// longitude as FRWD and other loggers write), and « Voir ici sur… », a clicked point opened in other map services.

import * as M from "./model.js";
import { hasGeo, toLatLon, toMm } from "./geo.js";
import { ONLINE, LIDAR_FR, tileUrl, tileOf, latLonOfTile, zoomFor } from "../onlinemaps.js";
import { modal, field, sel, num, popupMenu } from "./dialogs.js";
import { svg } from "./icons.js";
import { where } from "./ribbon-data.js";
import { t, tn } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const LAYERS = { ...ONLINE, ...LIDAR_FR };
const ORDER = ["osm", "plan", "chmap", "ustopo", "ortho", "swissimage", "usimagery", "nzaerial", "lidarrelief", "lidarveg", "lidarclass"];
const RELIEF = ["shade", "slope"];
const DEFAULT_OPACITY = { shade: 0.7, slope: 0.8, lidarrelief: 0.6, lidarveg: 0.6, lidarclass: 0.55 };
const MAX_TILES = 110, CACHE = 420;
const key = (E) => `ocn.tr.bg.${E.meta?.id || "x"}`;

// ---- state ------------------------------------------------------------------------------------------------------------------
/** The editor's backdrop: created at first use, with this device's choice for the event. */
export function attach(E) {
  if (E.backdrop) return E.backdrop;
  let on = {};
  try { on = JSON.parse(localStorage.getItem(key(E)) || "{}") || {}; } catch (e) { on = {}; }
  // an event without a map file shows OpenStreetMap from the start: it is its map
  if (!Object.keys(on).length && E.ev.map.kind === "none" && hasGeo(E.ev)) on = { osm: 1 };
  E.backdrop = { on, tiles: new Map(), rel: {}, relFor: null, panel: null, country: undefined, timer: null, paint: (g, T, W, H) => paint(E, g, T, W, H) };
  E.closeHooks?.push(() => { E.backdrop?.panel?.remove(); E.root.querySelector(".tr-credit")?.remove(); });
  credits(E);
  return E.backdrop;
}
const persist = (E) => { try { const on = E.backdrop.on; if (Object.keys(on).length) localStorage.setItem(key(E), JSON.stringify(on)); else localStorage.removeItem(key(E)); } catch (e) { /* this visit */ } };
/** Whether this device has a backdrop choice kept for the event (the editor attaches the module at opening only then). */
export const hasState = (E) => { try { return !!localStorage.getItem(key(E)) || (E.ev.map.kind === "none" && hasGeo(E.ev)); } catch (e) { return false; } };
/** The layers offered at the map's place: OpenStreetMap everywhere, the others by country. */
async function offered(E) {
  const st = E.backdrop;
  if (st.country === undefined && hasGeo(E.ev)) {
    try { const [lat, lon] = toLatLon(E.ev, (E.ev.map.w || 210) / 2, (E.ev.map.h || 297) / 2); st.country = (await import("../trace/terrain.js")).countryAt(lat, lon); } catch (e) { st.country = null; }
  }
  return ORDER.filter((k) => LAYERS[k] && !LAYERS[k].off && (!LAYERS[k].country || LAYERS[k].country === st.country));
}

// ---- drawing ------------------------------------------------------------------------------------------------------------------
const dpr = () => window.devicePixelRatio || 1;
function tile(E, id, z, x, y) {
  const st = E.backdrop, k = `${id}/${z}/${x}/${y}`;
  let it = st.tiles.get(k);
  if (it) { st.tiles.delete(k); st.tiles.set(k, it); return it; }            // most recently used last
  const img = new Image();
  img.crossOrigin = "anonymous";
  it = { img, ok: false, failed: false };
  img.onload = () => { it.ok = true; clearTimeout(st.timer); st.timer = setTimeout(() => E.redraw(), 60); };
  img.onerror = () => { it.failed = true; };
  img.src = tileUrl(LAYERS[id], z, x, y);
  st.tiles.set(k, it);
  if (st.tiles.size > CACHE) for (const old of st.tiles.keys()) { if (st.tiles.size <= CACHE) break; st.tiles.delete(old); }
  return it;
}
/** The tiles of a layer over the map box [l, b, r, t] (mm) at about mpp metres a pixel: { z, list: [[x, y]…] }. */
function tilesOver(ev, id, box, mpp, max = MAX_TILES) {
  const L = LAYERS[id], n = (z) => 2 ** z;
  const [latc] = toLatLon(ev, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
  let z = Math.max(2, Math.min(L.max, Math.round(zoomFor(mpp, latc))));
  for (;;) {
    const c = [[box[0], box[3]], [box[2], box[3]], [box[2], box[1]], [box[0], box[1]]].map(([x, y]) => tileOf(...toLatLon(ev, x, y), z));
    const x0 = Math.max(0, Math.floor(Math.min(...c.map((p) => p[0])))), x1 = Math.min(n(z) - 1, Math.floor(Math.max(...c.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...c.map((p) => p[1])))), y1 = Math.min(n(z) - 1, Math.floor(Math.max(...c.map((p) => p[1]))));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= max || z <= 2) {
      const list = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) list.push([x, y]);
      return { z, list };
    }
    z--;
  }
}
/** One tile image drawn by the affine through three of its corners (T: map mm → canvas px). */
function drawTile(g, ev, T, img, x, y, z) {
  const P = (tx, ty) => { const [lat, lon] = latLonOfTile(tx, ty, z); return T(...toMm(ev, lat, lon)); };
  const p00 = P(x, y), p10 = P(x + 1, y), p01 = P(x, y + 1), w = img.naturalWidth || 256, h = img.naturalHeight || 256;
  g.save();
  g.transform((p10[0] - p00[0]) / w, (p10[1] - p00[1]) / w, (p01[0] - p00[0]) / h, (p01[1] - p00[1]) / h, p00[0], p00[1]);
  g.drawImage(img, 0, 0, w + 0.6, h + 0.6);                                   // a hair over its neighbours: no seams
  g.restore();
}
function paint(E, g, T, W, H) {
  const st = E.backdrop, ev = E.ev;
  if (!st) return;
  const geo = hasGeo(ev);
  for (const id of ORDER) {
    const op = st.on[id];
    if (!(op > 0) || !geo || !LAYERS[id]) continue;
    const [l, tp] = E.toMap(0, 0), [r, b] = E.toMap(W, H);
    const mpp = ((ev.map.scale || 10000) / 1000) / E.view.k / Math.min(2, dpr());
    const { z, list } = tilesOver(ev, id, [l, b, r, tp], mpp);
    g.save(); g.globalAlpha = Math.min(1, op);
    for (const [x, y] of list) { const it = tile(E, id, z, x, y); if (it.ok) drawTile(g, ev, T, it.img, x, y, z); }
    g.restore();
  }
  for (const kind of RELIEF) {
    const op = st.on[kind];
    if (!(op > 0)) continue;
    const R = E.relief;
    if (!R) { needRelief(E); continue; }
    if (st.relFor !== R) { st.rel = {}; st.relFor = R; }
    if (!st.rel[kind]) { st.rel[kind] = null; import("./relief.js").then((RL) => { st.rel[kind] = RL.reliefImage(R, kind); E.redraw(); }); continue; }
    const c = st.rel[kind], hx = (0.5 / (R.nx - 1)) * R.w, hy = (0.5 / (R.ny - 1)) * R.h;
    const [x0, y0] = T(-hx, R.h + hy), [x1, y1] = T(R.w + hx, -hy);
    g.save(); g.globalAlpha = Math.min(1, op);
    if (kind === "shade") g.globalCompositeOperation = "multiply";
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(c, x0, y0, x1 - x0, y1 - y0);
    g.restore();
  }
}
/** The event's elevation model asked for once (the relief layers wait for it). */
function needRelief(E) {
  const st = E.backdrop;
  if (st.asking) return;
  st.asking = true;
  import("./relief.js").then((RL) => RL.reliefFor(E)).then((R) => {
    st.asking = false;
    if (!R) { for (const k of RELIEF) delete st.on[k]; persist(E); drawPanel(E); }
    E.redraw();
  }).catch(() => { st.asking = false; });
}
/** The credits of the layers shown, at the map's bottom left. */
function credits(E) {
  const st = E.backdrop, wrap = E.root.querySelector(".tr-mapwrap");
  let el = wrap.querySelector(".tr-credit");
  const seen = new Map();
  for (const id of ORDER) if (st.on[id] > 0 && LAYERS[id] && hasGeo(E.ev)) seen.set(LAYERS[id].credit, LAYERS[id].page);
  if (!seen.size) { el?.remove(); return; }
  if (!el) { el = document.createElement("div"); el.className = "tr-credit"; wrap.appendChild(el); }
  el.innerHTML = [...seen].map(([c, p]) => `<a href="${esc(p)}" target="_blank" rel="noopener">${esc(c)}</a>`).join(" · ");
}
/** The credit line of a layer (prints, exports). */
export const creditOf = (id) => LAYERS[id]?.credit || "";

// ---- the panel ------------------------------------------------------------------------------------------------------------------
/** « Fonds et relief »: the panel shown or hidden (the ribbon's button). */
export function toggle(E) {
  const st = attach(E);
  if (st.panel) { st.panel.remove(); st.panel = null; E.ribbon?.update(); return; }
  const el = document.createElement("div");
  el.className = "tr-bg";
  el.setAttribute("role", "region"); el.setAttribute("aria-label", t("trc.bg.title"));
  E.root.querySelector(".tr-mapwrap").appendChild(el);
  st.panel = el;
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); toggle(E); } });
  drawPanel(E);
  E.ribbon?.update();
}
async function drawPanel(E) {
  const st = E.backdrop, el = st?.panel;
  if (!el) return;
  const geo = hasGeo(E.ev), ids = geo ? await offered(E) : [];
  if (!st.panel) return;
  const row = (id, name, tip = "") => {
    const op = st.on[id] || 0, def = DEFAULT_OPACITY[id] || (id === "osm" && E.ev.map.kind === "none" ? 1 : 0.6);
    return `<div class="tr-bg-row${op ? " on" : ""}" title="${esc(tip)}"><label class="tr-check"><input type="checkbox" data-id="${id}" data-def="${def}" ${op ? "checked" : ""}> ${esc(name)}</label>
      <input type="range" min="0.1" max="1" step="0.05" value="${op || def}" data-op="${id}" aria-label="${esc(t("trc.bg.opacity", { name }))}" ${op ? "" : "disabled"}></div>`;
  };
  el.innerHTML = `<div class="tr-tour-head"><b>${esc(t("trc.bg.title"))}</b><button type="button" class="tr-icon" data-x title="${esc(t("trc.bg.close"))}">${svg("close", 16)}</button></div>
    <div class="tr-bg-body">
      ${geo ? `<h4>${esc(t("trc.bg.online"))}</h4>${ids.map((id) => row(id, t(`trc.bg.l.${id}`), t(`trc.bg.tip.${id}`))).join("")}` : `<p class="tr-hint">${esc(t("trc.bg.needGeo", { where: where("georef") }))}</p>`}
      <h4>${esc(t("trc.bg.relief"))}</h4>
      ${RELIEF.map((k) => row(k, t(`trc.bg.l.${k}`), t(`trc.bg.tip.${k}`))).join("")}
      <div class="tr-bg-row on" title="${esc(t("trc.bg.mapTip"))}"><span>${esc(t("trc.bg.map"))}</span><input type="range" min="0.2" max="1" step="0.05" value="${E.opts.intensity}" data-map aria-label="${esc(t("trc.bg.map"))}"></div>
      <div class="tr-bg-foot"><button type="button" class="btn btn-sm" data-act="dem">${esc(t("trc.bg.dem"))}</button>
        <button type="button" class="btn btn-sm" data-act="import-track">${esc(t("trc.bg.track"))}</button></div>
      ${geo && st.country && !ids.some((id) => LAYERS[id].country) ? `<p class="tr-hint">${esc(t("trc.bg.onlyOsm"))}</p>` : ""}
    </div>`;
  el.querySelector("[data-x]").addEventListener("click", () => toggle(E));
  el.querySelectorAll("input[data-id]").forEach((c) => c.addEventListener("change", () => {
    const id = c.dataset.id;
    if (c.checked) st.on[id] = Number(el.querySelector(`[data-op="${id}"]`).value) || Number(c.dataset.def); else delete st.on[id];
    persist(E); credits(E); drawPanel(E); E.redraw();
  }));
  el.querySelectorAll("input[data-op]").forEach((r) => r.addEventListener("input", () => { if (st.on[r.dataset.op]) { st.on[r.dataset.op] = Number(r.value); persist(E); E.redraw(); } }));
  el.querySelector("[data-map]").addEventListener("input", (e) => E.setIntensity(Number(e.target.value)));
}

// ---- printing: a layer as an image of a box --------------------------------------------------------------------------------------
/**
 * A layer over the map box [l, b, r, t] (mm) at pxPerMm, as a canvas — for the prints and images of an event set on a background
 * (exports.js courseImage, pdf.js): every tile awaited (600 at most: a coarser zoom beyond), drawn through the georeference.
 */
export async function backdropCanvas(E, id, box, pxPerMm, onProgress = null) {
  const ev = E.ev;
  if (!hasGeo(ev) || !LAYERS[id]) return null;
  const W = Math.max(1, Math.round((box[2] - box[0]) * pxPerMm)), H = Math.max(1, Math.round((box[3] - box[1]) * pxPerMm));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  const T = (x, y) => [(x - box[0]) * pxPerMm, (box[3] - y) * pxPerMm];
  const { z, list } = tilesOver(ev, id, box, ((ev.map.scale || 10000) / 1000) / pxPerMm, 600);
  let done = 0;
  const load = ([x, y]) => new Promise((ok) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => ok(img); img.onerror = () => ok(null);
    img.src = tileUrl(LAYERS[id], z, x, y);
  }).then((img) => { onProgress?.(++done / list.length); if (img) drawTile(g, ev, T, img, x, y, z); });
  // a few at a time: a tile server is not asked for hundreds at once
  for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(load));
  return c;
}
/** The layers that can stand in for the map in a print (the PDF's and the images' « Contenu »): [[id, name]…]. */
export async function printable(E) {
  if (!hasGeo(E.ev)) return [];
  attach(E);
  return (await offered(E)).filter((id) => !/^lidar/.test(id)).map((id) => [id, t(`trc.bg.l.${id}`)]);
}

// ---- GPS tracks as line objects -------------------------------------------------------------------------------------------------
/** NMEA 0183 sentences: the positions of GGA and RMC lines → [[lat, lon]…]. */
function parseNmea(text) {
  const out = [], deg = (v, h) => { const x = Number(v); if (!Number.isFinite(x)) return NaN; const d = Math.floor(x / 100); return (d + (x - d * 100) / 60) * (h === "S" || h === "W" ? -1 : 1); };
  for (const line of text.split(/\r?\n/)) {
    const f = line.trim().split("*")[0].split(",");
    let la, lo;
    if (/^\$..GGA/.test(f[0]) && f.length > 5) { la = deg(f[2], f[3]); lo = deg(f[4], f[5]); }
    else if (/^\$..RMC/.test(f[0]) && f.length > 6 && f[2] !== "V") { la = deg(f[3], f[4]); lo = deg(f[5], f[6]); }
    else continue;
    if (Number.isFinite(la) && Number.isFinite(lo) && (la || lo)) { const p = out[out.length - 1]; if (!p || p[0] !== la || p[1] !== lo) out.push([la, lo]); }
  }
  return out;
}
/** Text rows holding a latitude and a longitude (loggers' exports, CSV): the two neighbouring columns that read as a position
 *  and vary like one over the file. Decimal degrees, or degrees and minutes written « ddmm.mmmm » as NMEA does — FRWD's export
 *  (a tab-separated text: a few header lines, then a row a second with the elapsed time, a lap mark, the latitude and the
 *  longitude in its 5th and 6th columns, altitude, heart rate; decimal commas in a Finnish Windows). A row's columns are split
 *  on tabs when it has some (empty fields kept: a lap mark must not shift the others), else on « ; », else on commas or spaces;
 *  with tabs or « ; » a comma is a decimal sign. Rows at 0, 0 (no fix yet) are left out. */
export function parseRows(text) {
  const num = (x) => (x.trim() === "" ? NaN : Number(x.trim().replace(",", ".")));
  const rows = text.split(/\r?\n/).map((l) => (l.includes("\t") ? l.split("\t").map(num) : l.includes(";") ? l.split(";").map(num) : l.trim().split(/[, ]+/).map(Number))).filter((r) => r.length >= 2);
  const dm = (v) => { const a = Math.abs(v), d = Math.floor(a / 100), m = a - 100 * d; return m < 60 ? Math.sign(v) * (d + m / 60) : NaN; };
  let best = null;
  for (const conv of [(v) => v, dm]) {
    for (let c = 0; c < 12; c++) {
      const ok = rows.map((r) => [conv(r[c]), conv(r[c + 1]), r[c], r[c + 1]])
        .filter(([la, lo, a, b]) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (a % 1 || b % 1) && (la || lo));
      if (ok.length < 5) continue;
      const span = (k) => Math.max(...ok.map((r) => r[k])) - Math.min(...ok.map((r) => r[k]));
      if (span(0) > 1 || span(1) > 2 || !(span(0) > 0)) continue;             // a track spans far less than a degree
      // degrees and minutes are only taken where the numbers cannot be decimal degrees (a latitude beyond 90)
      if (conv === dm && !ok.some(([, , a, b]) => Math.abs(a) > 90 || Math.abs(b) > 180)) continue;
      if (!best || ok.length > best.length) best = ok;
    }
    if (best) break;
  }
  return best ? best.map(([la, lo]) => [la, lo]) : [];
}
/** A track file's positions, in pieces: [[[lat, lon]…]…]; null when the file is none Ozimut reads. */
async function readTrack(file) {
  const buf = await file.arrayBuffer(), name = file.name || "";
  const bytes = new Uint8Array(buf), fit = bytes.length > 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === ".FIT";
  const text = fit ? "" : new TextDecoder().decode(buf);
  // a GPX's track and route points as they are (a route drawn elsewhere has no times: trace/track.js would refuse it)
  if (/<gpx[\s>]/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "application/xml"), pieces = [];
    for (const seg of [...doc.getElementsByTagNameNS("*", "trkseg"), ...doc.getElementsByTagNameNS("*", "rte")]) {
      const pts = [...seg.children].filter((c) => /^(trkpt|rtept)$/.test(c.localName)).map((c) => [Number(c.getAttribute("lat")), Number(c.getAttribute("lon"))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      if (pts.length > 1) pieces.push(pts);
    }
    return pieces.length ? pieces : null;
  }
  if (fit || /<TrainingCenterDatabase/i.test(text)) {
    const { parseTrace } = await import("../trace/track.js");
    const tr = parseTrace(name, buf);
    if (!tr?.n) return null;
    const pts = [];
    for (let i = 0; i < tr.n; i++) pts.push([tr.lat0 - tr.y[i] / tr.ky, tr.lon0 + tr.x[i] / tr.kx]);
    return [pts];
  }
  const nm = /\$..(GGA|RMC),/.test(text) ? parseNmea(text) : [];
  if (nm.length > 1) return [nm];
  const rows = parseRows(text);
  return rows.length > 1 ? [rows] : null;
}
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) { const d = M.nearest([pts[a], pts[b]], pts[i]).d; if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const TRACK_COLOURS = [["blue", [0.85, 0.35, 0, 0]], ["red", [0, 0.9, 0.85, 0]], ["green", [0.75, 0, 1, 0.1]], ["black", "black"], ["purple", "purple"]];
/**
 * « Trace GPS »: tracks imported as line objects of the event (owner, 2026-11-16, after OCAD: the setter's own recce walk on the
 * map) — the part of each inside the map, lightened (0.15 mm), cut where the logger lost its fix for over 150 m; shown on
 * « Tous les postes » only, or on every course (then printed with them).
 */
export async function importTrack(E) {
  const ev = E.ev;
  if (!hasGeo(ev)) { E.toast(t("trc.bg.trackNeedGeo", { where: where("georef") }), 6000); return; }
  const v = await modal(E, { title: t("trc.bg.trackTitle"), ok: t("trc.bg.trackOk"), remember: "track", body: `
    <p>${esc(t("trc.bg.trackIntro"))}</p>
    ${field(t("trc.bg.trackFiles"), '<input type="file" name="f" multiple accept=".gpx,.tcx,.fit,.nmea,.log,.txt,.csv,.frwd,application/gpx+xml,text/plain,application/octet-stream">')}
    <div class="tr-grid2">${field(t("trc.bg.trackColour"), sel("colour", TRACK_COLOURS.map(([k]) => [k, t(`trc.bg.col.${k}`)]), "blue"))}
    ${field(t("trc.bg.trackWidth"), '<input name="w" value="0.35" inputmode="decimal">')}</div>
    <label class="tr-check"><input type="checkbox" name="all"> ${esc(t("trc.bg.trackAll"))}</label>`,
  validate: (o) => (!o.f?.length ? t("trc.bg.trackChoose") : null) });
  if (!v) return;
  const mPerMm = (ev.map.scale || 10000) / 1000, lines = [], bad = [];
  for (const file of v.f) {
    const pieces = await readTrack(file).catch(() => null);
    if (!pieces) { bad.push(file.name); continue; }
    for (const piece of pieces) {
      let cur = [];
      const steps = piece.slice(1).map((q, i) => { const a = toMm(ev, piece[i][0], piece[i][1]), b = toMm(ev, q[0], q[1]); return M.dist(a, b) * mPerMm; }).sort((a, b) => a - b);
      const jump = Math.max(150, 8 * (steps[Math.floor(steps.length / 2)] || 0));
      const flush = () => { if (cur.length > 1) lines.push(simplify(cur, 0.15)); cur = []; };
      for (const [lat, lon] of piece) {
        const p = toMm(ev, lat, lon), inside = p[0] >= -5 && p[1] >= -5 && p[0] <= (ev.map.w || 210) + 5 && p[1] <= (ev.map.h || 297) + 5;
        if (!inside) { flush(); continue; }
        if (cur.length && M.dist(cur[cur.length - 1], p) * mPerMm > jump) flush();
        cur.push(p);
      }
      flush();
    }
  }
  if (!lines.length) { E.toast(bad.length ? t("trc.bg.trackBad", { list: bad.join(", ") }) : t("trc.bg.trackOutside"), 7000); return; }
  const colour = TRACK_COLOURS.find(([k]) => k === v.colour)?.[1] || TRACK_COLOURS[0][1];
  const ids = [];
  E.change((x) => {
    for (const pts of lines) {
      const id = M.addSpecial(x, "line", pts, { lineKind: "single", lineWidth: Math.max(0.1, Math.min(2, num(v.w) || 0.35)), gapSize: 0, dashSize: 0, color: colour, track: true });
      if (!v.all) { x.specials[id].all = false; x.specials[id].courses = [{ course: 0, part: -1 }]; }
      ids.push(id);
    }
  }, t("trc.bg.trackUndo"));
  const all = lines.flat(), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  if (!v.all && E.cd.course) E.setCourse(0);
  E.fitBox?.([Math.min(...xs) - 5, Math.min(...ys) - 5, Math.max(...xs) + 5, Math.max(...ys) + 5], 40);
  E.toast(`${tn("trc.bg.trackDone", lines.length, { km: (all.length ? lines.reduce((s, l) => s + M.pathLength(l), 0) * mPerMm / 1000 : 0).toFixed(1) })}${bad.length ? ` ${t("trc.bg.trackBad", { list: bad.join(", ") })}` : ""}`, 7000);
}

// ---- « Voir ici sur… » ---------------------------------------------------------------------------------------------------------
const SITES = [
  ["osm", "OpenStreetMap", (la, lo) => `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=18/${la}/${lo}`],
  ["gmaps", "Google Maps", (la, lo) => `https://www.google.com/maps/@?api=1&map_action=map&center=${la},${lo}&zoom=19&basemap=satellite`],
  ["street", "Google Street View", (la, lo) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${la},${lo}`],
  // the sites' own names (i18n-ignore-next 2)
  ["geoportail", "Géoportail (IGN)", (la, lo) => `https://www.geoportail.gouv.fr/carte?c=${lo},${la}&z=18&l0=ORTHOIMAGERY.ORTHOPHOTOS::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`, "FR"],
  ["remonter", "Remonter le temps (IGN)", (la, lo) => `https://remonterletemps.ign.fr/comparer?lon=${lo}&lat=${la}&z=17&layer1=10&layer2=19&mode=split-h`, "FR"],
  ["swisstopo", "map.geo.admin.ch", (la, lo) => `https://map.geo.admin.ch/#/map?lang=fr&center=${lo},${la}&z=11&crs=4326`, "CH"],
  ["mapycz", "Mapy.cz", (la, lo) => `https://mapy.cz/turisticka?x=${lo}&y=${la}&z=18`],
  ["mapillary", "Mapillary", (la, lo) => `https://www.mapillary.com/app/?lat=${la}&lng=${lo}&z=18`],
];
/** The clicked point (map mm) opened in another map service: a small menu at the mouse. */
export async function lookHere(E, p, cx, cy) {
  const ev = E.ev;
  if (!hasGeo(ev)) { E.toast(t("trc.bg.lookNeedGeo", { where: where("georef") }), 6000); return; }
  const [lat, lon] = toLatLon(ev, p[0], p[1]), la = lat.toFixed(6), lo = lon.toFixed(6);
  let cc = null;
  try { cc = (await import("../trace/terrain.js")).countryAt(lat, lon); } catch (e) { cc = null; }
  const list = SITES.filter((s) => !s[3] || s[3] === cc);
  popupMenu(E, cx, cy, [...list.map(([k, name]) => [k, name, "globe"]), "-", ["copy", t("trc.bg.lookCopy", { la, lo }), "copy"]], async (k) => {
    if (k === "copy") { try { await navigator.clipboard.writeText(`${la}, ${lo}`); E.toast(t("trc.bg.lookCopied")); } catch (e) { E.toast(`${la}, ${lo}`, 8000); } return; }
    const s = SITES.find((x) => x[0] === k);
    if (s) window.open(s[2](la, lo), "_blank", "noopener");
  });
}
