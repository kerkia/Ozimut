// Cartographier's backgrounds (« Fonds »): what the mapper draws over — a scan or photo of an old map, a PDF page, a GeoTIFF or
// an image with its world file, a GPS track, aerial photos and IGN's maps online. Each is kept once on the server by its SHA-256
// (an online layer is fetched again, never stored), placed by a pixel → map mm affine `toMap` [a, b, c, d, e, f] (x = a·px + c·py
// + e, y = b·px + d·py + f): from its georeference through the map's, else at the screen's middle at the map's scale, then
// adjusted by pairs of points (« Caler »: a point of the background, then where it belongs on the map; two pairs or more).

import * as S from "./store.js";
import * as G from "./geom.js";
import { modal, field, sel, num } from "../tracer/dialogs.js";
import { t, tn } from "./lang.js";
import { ONLINE, LINZ_KEY } from "../onlinemaps.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const ACCEPT = "image/*,.pdf,.tif,.tiff,.gpx,.kml,.kmz,.pgw,.jgw,.tfw,.wld,.prj";
// The online layers, all Web Mercator tiles: one list for Cartographier and the Tracer (../onlinemaps.js).
export { ONLINE, LINZ_KEY };

/** The map's georeference as functions (data/frame.js), or null when the map has none. */
async function frame(E) {
  try {
    const F = await import("./data/frame.js"), f = await F.frameOf(E.doc);
    if (!f || !f.geo) return null;
    f.worldToMm ||= (X, Y) => f.fromReal(X, Y);
    return f;
  } catch (e) { return null; }
}
const latLonToMm = (f, lat, lon) => (f.fromLatLon ? f.fromLatLon(lat, lon) : f.latLonToMm(lat, lon));
const mmToLatLon = (f, x, y) => (f.toLatLon ? f.toLatLon(x, y) : f.mmToLatLon(x, y));

// ---- decoding ----------------------------------------------------------------------------------------------------------------
async function decode(bytes, type, name) {
  const u8 = new Uint8Array(bytes);
  if (/pdf/.test(type) || /\.pdf$/i.test(name)) {
    const { PDFJS, PDFJS_WORKER } = await import("../vendor.js");
    const lib = await import(PDFJS); lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const doc = await lib.getDocument({ data: u8.slice() }).promise, page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 }), s = Math.min(6, 8000 / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale: s }), c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    return { image: c, mmPerPx: 25.4 / 72 / s };
  }
  const T = await import("../tracer/tiff.js");
  if (T.isTiff(u8)) {
    const im = await T.decodeTiff(u8);
    return { image: im.canvas, mmPerPx: 25.4 / (im.dpi || 254), geotiff: im.world || null };
  }
  const { imageDpi } = await import("../tracer/mapsrc.js");
  const image = await createImageBitmap(new Blob([u8], { type: type || "image/png" }));
  return { image, mmPerPx: 25.4 / (imageDpi(u8) || 254) };
}

/** Put back the document's backgrounds (at opening). */
export async function restore(E) {
  E.view.backgrounds = [];
  for (const b of E.doc.backgrounds || []) {
    const entry = { ...b, image: null };
    E.view.backgrounds.push(entry);
    if (b.kind === "online") { online(E, entry).catch(() => {}); continue; }
    if (b.kind === "url") { fromUrl(E, entry); continue; }
    const f = E.files[b.file] || (E.id ? await S.loadFile(E.id, b.file).catch(() => null) : null);
    if (!f) continue;
    decode(f.bytes, b.type || f.type, b.name).then((d) => { entry.image = d.image; E.view.request(); }).catch(() => {});
  }
}
function persist(E) {
  const list = E.view.backgrounds.map(({ image, ...b }) => b);
  E.live.transact(t("map.undo.bg"), () => E.live.setDocField("backgrounds", list));
}

// ---- adding files ----------------------------------------------------------------------------------------------------------------
export async function addFiles(E, files) {
  files = [...files];
  const world = files.find((f) => /\.(pgw|jgw|tfw|wld|gfw)$/i.test(f.name));
  const gpx = files.filter((f) => /\.(gpx|fit|tcx)$/i.test(f.name));
  for (const f of gpx) await addGpx(E, f);
  for (const f of files.filter((x) => /^image\//.test(x.type) || /\.(png|jpe?g|gif|bmp|webp|tiff?|pdf)$/i.test(x.name))) {
    E.say(t("map.bg.reading", { name: f.name }), "busy");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const d = await decode(bytes, f.type, f.name);
    let toMap = null;
    const fr = await frame(E);
    const wf = world ? (await world.text()).trim().split(/\s+/).map(Number) : d.geotiff?.wf || null;
    if (wf && fr && fr.worldToMm) {
      const w = wf;                                                         // A D B E C F
      const P = (px, py) => fr.worldToMm(w[0] * px + w[2] * py + w[4], w[1] * px + w[3] * py + w[5]);
      const o = P(0, 0), ax = P(1, 0), ay = P(0, 1);
      toMap = [ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]];
    }
    if (!toMap) {
      // at the screen's middle, the image's own millimetres taken as the map's (a scan at the map's scale)
      const w = d.image.width * d.mmPerPx, h = d.image.height * d.mmPerPx;
      toMap = [d.mmPerPx, 0, 0, -d.mmPerPx, E.view.cx - w / 2, E.view.cy + h / 2];
    }
    const sha = E.id ? await S.saveFile(E.id, bytes, f.type || "application/octet-stream") : await S.sha256(bytes);
    if (!E.id) E.files[sha] = { bytes, type: f.type };
    E.view.backgrounds.push({ id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: f.name, kind: "file", file: sha, type: f.type, toMap, opacity: 0.6, visible: true, image: d.image });
    persist(E);
    E.say(wf && fr ? t("map.bg.placedGeo") : t("map.bg.placedHint"));
  }
  E.view.request();
  const P = await import("./panels.js"); E._rtab = "bg"; P.drawRight(E);
}
/** A GPS track as a background: drawn once on an image in the map's frame (the map must be georeferenced). */
async function addGpx(E, file) {
  const fr = await frame(E);
  if (!fr) { E.say(t("map.bg.needGeo"), "bad"); return; }
  let pts = [];
  try {
    const { parseTrace } = await import("../trace/track.js");
    const tr = parseTrace(file.name, await file.arrayBuffer());
    for (let i = 0; i < tr.n; i++) pts.push([tr.lat0 - tr.y[i] / tr.ky, tr.lon0 + tr.x[i] / tr.kx]);
  } catch (e) { pts = []; }
  if (!pts.length) { const xml = new DOMParser().parseFromString(await file.text(), "application/xml"); pts = [...xml.querySelectorAll("trkpt,rtept,wpt")].map((n) => [Number(n.getAttribute("lat")), Number(n.getAttribute("lon"))]); }
  const mm = pts.filter((p) => Number.isFinite(p[0])).map(([la, lo]) => latLonToMm(fr, la, lo));
  if (mm.length < 2) { E.say(t("map.bg.gpxEmpty"), "bad"); return; }
  const b = G.bboxOf(mm), pad = 2, k = 10;                      // 10 px a mm
  const W = Math.ceil((b[2] - b[0] + 2 * pad) * k), H = Math.ceil((b[3] - b[1] + 2 * pad) * k);
  if (W * H > 60e6) { E.say(t("map.bg.gpxLarge"), "bad"); return; }
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"); g.strokeStyle = "#e5007e"; g.lineWidth = 0.35 * k; g.lineJoin = "round";
  g.beginPath(); mm.forEach(([x, y], i) => { const px = (x - b[0] + pad) * k, py = (b[3] + pad - y) * k; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.stroke();
  const blob = await new Promise((r) => c.toBlob(r, "image/png")), bytes = new Uint8Array(await blob.arrayBuffer());
  const sha = E.id ? await S.saveFile(E.id, bytes, "image/png") : await S.sha256(bytes);
  if (!E.id) E.files[sha] = { bytes, type: "image/png" };
  E.view.backgrounds.push({ id: `b${Date.now().toString(36)}`, name: file.name, kind: "file", file: sha, type: "image/png", toMap: [1 / k, 0, 0, -1 / k, b[0] - pad, b[3] + pad], opacity: 1, visible: true, image: c });
  persist(E);
}

// ---- online layers: aerial photos and national maps (France, Switzerland, the USA, New Zealand), OpenStreetMap ----------------
async function online(E, entry) {
  const fr = await frame(E);
  if (!fr) { E.say(t("map.bg.needGeo"), "bad"); return; }
  const L = ONLINE[entry.layer]; if (!L) return;
  const b = E.live.bounds(), corners = [[b[0], b[1]], [b[2], b[3]], [b[0], b[3]], [b[2], b[1]]].map(([x, y]) => mmToLatLon(fr, x, y));
  const lat0 = Math.min(...corners.map((c) => c[0])), lat1 = Math.max(...corners.map((c) => c[0])), lon0 = Math.min(...corners.map((c) => c[1])), lon1 = Math.max(...corners.map((c) => c[1]));
  // the zoom that gives about a tenth of a map mm per pixel, within the layer's levels and 400 tiles
  const mPerMm = E.doc.scale / 1000;
  let z = Math.min(L.max, Math.max(10, Math.round(Math.log2((156543 * Math.cos((lat0 * Math.PI) / 180)) / (mPerMm * 0.15)))));
  const tile = (lat, lon, zz) => { const n = 2 ** zz, x = ((lon + 180) / 360) * n, r = (lat * Math.PI) / 180, y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n; return [x, y]; };
  let a, c;
  for (;;) { a = tile(lat1, lon0, z); c = tile(lat0, lon1, z); if ((Math.floor(c[0]) - Math.floor(a[0]) + 1) * (Math.floor(c[1]) - Math.floor(a[1]) + 1) <= 400 || z <= 10) break; z--; }
  const x0 = Math.floor(a[0]), y0 = Math.floor(a[1]), x1 = Math.floor(c[0]), y1 = Math.floor(c[1]);
  const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  E.say(t("map.bg.loading"), "busy");
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const url = L.url.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    jobs.push(fetch(url, { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer" }).then((r) => (r.ok ? r.blob() : null)).then((bl) => (bl ? createImageBitmap(bl) : null))
      .then((im) => { if (im) g.drawImage(im, (x - x0) * 256, (y - y0) * 256); }).catch(() => {}));
  }
  await Promise.all(jobs);
  // the tile grid's corners in the map's mm: an affine through three of them (Web Mercator is near enough to it over a map)
  const ll = (px, py) => { const n = 2 ** z, lon = (px / n) * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / n))) * 180) / Math.PI; return [lat, lon]; };
  const P = (px, py) => latLonToMm(fr, ...ll(x0 + px / 256, y0 + py / 256));
  const o = P(0, 0), ax = P(W, 0), ay = P(0, H);
  entry.toMap = [(ax[0] - o[0]) / W, (ax[1] - o[1]) / W, (ay[0] - o[0]) / H, (ay[1] - o[1]) / H, o[0], o[1]];
  entry.image = cv;
  E.say(t(`map.bg.credit.${entry.layer}`));
  E.view.request();
}

// ---- an image the site serves (a LiDAR tile's vegetation or map), placed by its corners in map mm ------------------------------------
function fromUrl(E, entry) {
  return fetch(entry.url, { credentials: "same-origin" }).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? createImageBitmap(b) : null))
    .then((im) => { if (im) { entry.image = im; E.view.request(); } }).catch(() => {});
}
/** Add such images: [{ name, url, w, h, cornersMm: [top-left, top-right, bottom-right, bottom-left] }] (data/lidar.js backgrounds). */
export async function addUrls(E, list, opacity = 0.55) {
  for (const b of list) {
    const [c0, c1, , c3] = b.cornersMm;
    const entry = { id: `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: b.name, kind: "url", url: b.url,
      toMap: [(c1[0] - c0[0]) / b.w, (c1[1] - c0[1]) / b.w, (c3[0] - c0[0]) / b.h, (c3[1] - c0[1]) / b.h, c0[0], c0[1]], opacity, visible: true, image: null };
    E.view.backgrounds.push(entry);
    await fromUrl(E, entry);
  }
  persist(E);
}

// ---- adjusting by pairs of points ---------------------------------------------------------------------------------------------
/** The similarity (or affine with 3 pairs or more) taking points `from` (mm, the background's current place) onto `to`. */
function fitPairs(from, to) {
  const n = from.length;
  if (n >= 3) {
    // least-squares affine
    const A = [], bx = [], by = [];
    for (let i = 0; i < n; i++) { A.push([from[i][0], from[i][1], 1]); bx.push(to[i][0]); by.push(to[i][1]); }
    const solve = (b) => { const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atb = [0, 0, 0]; A.forEach((r, i) => { for (let j = 0; j < 3; j++) { Atb[j] += r[j] * b[i]; for (let k = 0; k < 3; k++) AtA[j][k] += r[j] * r[k]; } }); return gauss(AtA, Atb); };
    const [a, c, e] = solve(bx), [b, d, f] = solve(by);
    return [a, b, c, d, e, f];
  }
  const [p, q] = from, [P, Q] = to;
  const v = [q[0] - p[0], q[1] - p[1]], V = [Q[0] - P[0], Q[1] - P[1]], l = Math.hypot(...v) || 1, L = Math.hypot(...V);
  const s = L / l, r = Math.atan2(V[1], V[0]) - Math.atan2(v[1], v[0]), co = s * Math.cos(r), si = s * Math.sin(r);
  return [co, si, -si, co, P[0] - (co * p[0] - si * p[1]), P[1] - (si * p[0] + co * p[1])];
}
function gauss(M, b) {
  const n = b.length, a = M.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) { let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(a[k][i]) > Math.abs(a[m][i])) m = k; [a[i], a[m]] = [a[m], a[i]]; for (let k = i + 1; k < n; k++) { const f = a[k][i] / a[i][i]; for (let j = i; j <= n; j++) a[k][j] -= f * a[i][j]; } }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = a[i][n]; for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j]; x[i] = s / a[i][i]; }
  return x;
}
const compose = (m, t) => [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
function calage(E, entry) {
  const pairs = [];
  let first = null;
  const prev = { tool: E.tool, name: E.toolName };
  E.say(t("map.bg.calageStart"));
  E.tool = {
    name: "calage", cursor: "crosshair",
    down(ev, p) {
      if (!first) { first = p; E.say(t("map.bg.calageTo")); }
      else { pairs.push([first, p]); first = null; E.say(tn("map.bg.calagePairs", pairs.length)); }
      E.view.overlay();
    },
    key(ev) {
      if (ev.key === "Enter" && pairs.length >= 2) { const m = fitPairs(pairs.map((x) => x[0]), pairs.map((x) => x[1])); entry.toMap = compose(m, entry.toMap); persist(E); done(); return true; }
      if (ev.key === "Escape") { done(); return true; }
      return false;
    },
    overlay(g) {
      const m = E.view.matrix();
      for (const [a, b] of pairs) { g.strokeStyle = "#e65100"; g.lineWidth = 2 * E.view.dpr; g.beginPath(); g.moveTo(m.x(...a), m.y(...a)); g.lineTo(m.x(...b), m.y(...b)); g.stroke(); }
      if (first) { g.fillStyle = "#e65100"; g.beginPath(); g.arc(m.x(...first), m.y(...first), 5 * E.view.dpr, 0, 7); g.fill(); }
    },
  };
  const done = () => { E.tool = prev.tool; E.toolName = prev.name; E.say(""); E.view.request(); };
}

export async function paneAct(E, a, id, value) {
  const entry = E.view.backgrounds.find((b) => b.id === id);
  if (a === "add") return pick(E);
  if (a === "online") return addOnline(E);
  if (!entry) return;
  if (a === "toggle") { entry.visible = !entry.visible; persist(E); }
  else if (a === "opacity") { entry.opacity = value; E.view.request(); clearTimeout(E._bgop); E._bgop = setTimeout(() => persist(E), 600); return; }
  else if (a === "remove") { E.view.backgrounds.splice(E.view.backgrounds.indexOf(entry), 1); persist(E); }
  else if (a === "calage") calage(E, entry);
  E.view.request();
  const P = await import("./panels.js"); P.drawRight(E);
}
function pick(E) {
  const i = document.createElement("input"); i.type = "file"; i.multiple = true; i.accept = ACCEPT;
  i.onchange = () => addFiles(E, i.files); i.click();
}
/** The online layers offered for the map: those of the country at its middle and those of no country. */
async function onlineLayers(E) {
  let cc = null;
  const fr = await frame(E);
  if (fr) {
    try {
      const b = E.live.bounds(), [lat, lon] = mmToLatLon(fr, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
      cc = (await import("../trace/terrain.js")).countryAt(lat, lon);
    } catch (e) { cc = null; }
  }
  return Object.keys(ONLINE).filter((k) => !ONLINE[k].off && (!fr || !ONLINE[k].country || ONLINE[k].country === cc));
}
async function addOnline(E) {
  const keys = await onlineLayers(E);
  // no layer of the place's own country: what is missing there, and the way to ask for it (support.js)
  let note = "";
  if (!keys.some((k) => ONLINE[k].country)) {
    try {
      const fr = await frame(E);
      if (fr) { const b = E.live.bounds(), [lat, lon] = mmToLatLon(fr, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2), SP = await import("./support.js"); note = SP.noteHtml(await SP.at(lat, lon), lat, lon, ["backgrounds"]); }
    } catch (e) { note = ""; }
  }
  const v = await modal(E, { title: t("map.rib.bg-online"), body: field(t("map.bg.layer"), sel("layer", keys.map((k) => [k, t(`map.bg.layer.${k}`)]), keys[0])) + `<p class="mp-hint">${esc(t("map.bg.onlineHint"))}</p>` + note });
  if (!v) return;
  const entry = { id: `b${Date.now().toString(36)}`, name: t(`map.bg.layer.${v.layer}`), kind: "online", layer: v.layer, toMap: [1, 0, 0, -1, 0, 0], opacity: 0.6, visible: true, image: null };
  E.view.backgrounds.unshift(entry);
  await online(E, entry);
  persist(E);
  const P = await import("./panels.js"); E._rtab = "bg"; P.drawRight(E);
}

export async function act(E, act) {
  if (act === "bg-add") return pick(E);
  if (act === "bg-online") return addOnline(E);
  if (act === "bg-toggle") { const on = !E.view.backgrounds.some((b) => b.visible); for (const b of E.view.backgrounds) b.visible = on; persist(E); E.view.request(); return; }
  if (act === "map-fade") { E.view.mapOpacity = E.view.mapOpacity < 1 ? 1 : 0.45; E.view.request(); return; }
  if (act === "bg-calage") { const b = E.view.backgrounds.find((x) => x.visible && x.kind === "file"); if (b) calage(E, b); else E.say(t("map.bg.none")); return; }
  if (act === "bg-georef") { const P = await import("./panels.js"); return P.propsDialog(E); }
}
