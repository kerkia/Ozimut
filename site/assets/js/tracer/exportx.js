// Files for other programs, the advanced level (owner, 2026-10-24, after Condes's export menu): a georeferenced TIFF of each course
// (GeoTIFF, WGS 84), SVG with each object named (controls, legs, numbers, descriptions), a KMZ with the map under the courses
// (Google Earth, O-Track), MapRun's KML (start S1, finish F1), OCAD's text of the courses for event software, IOF XML 2.0.3 with
// each variation as a course of its own (timing programs that know no variations), and a package for Livelox's import page
// (the IOF XML with the map image, its world file and projection: Livelox's direct upload needs an agreement with Livelox).

import * as M from "./model.js";
import { layoutCourse } from "./layout.js";
import { itemsFor, drawItems, cmykToRgb, SCREEN } from "./draw.js";
import { modal, download, fileName, field, sel, num, saveFiles } from "./dialogs.js";
import { hasGeo, toLatLon } from "./geo.js";
import { courseImage, iofXmlText } from "./exports.js";
import { printBox } from "./pdf.js";
import { paintMap, paintCourse, purpleOverride, syncMap } from "./appear.js";
import { where } from "./ribbon-data.js";
import { FFLATE } from "../vendor.js";
import { t } from "./lang.js";

const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enc = (s) => new TextEncoder().encode(s);
async function fflate() {
  if (!window.fflate) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = FFLATE; s.onload = res; s.onerror = () => rej(new Error("fflate")); document.head.appendChild(s); });
  return window.fflate;
}
const needGeo = (E) => { if (hasGeo(E.ev)) return true; E.toast(t("trc.exp.noGeo", { where: where("georef") }), 6000); return false; };
/** The designators to export: each course (and « Tous les postes » when asked), a variation each when it has some. */
function designators(ev, ids, { vars = true } = {}) {
  const out = [];
  for (const id of ids) {
    if (!id) { out.push({ cd: M.cdAll(), name: t("trc.exp.allControls") }); continue; }
    const c = ev.courses[id];
    if (vars && M.hasVariations(ev, id)) for (const v of M.allVariations(ev, id)) out.push({ cd: M.cdCourse(id, -1, v.path), name: `${c.name} ${v.code}`, variation: v.code });
    else out.push({ cd: M.cdCourse(id), name: c.name });
  }
  return out;
}
async function pick(E, title, extra = "", { all = false } = {}) {
  const ev = E.ev, ids = M.courseIds(ev);
  return modal(E, { title, wide: true, ok: t("trc.exp.create"), body: `<div class="tr-checks">${(all ? [0, ...ids] : ids).map((id) => `<label class="tr-check"><input type="checkbox" name="c${id}" ${id ? "checked" : ""}> ${x(id ? ev.courses[id].name : t("trc.exp.allControls"))}</label>`).join("")}</div>${extra}` });
}
const chosen = (E, v, all = false) => (all ? [0, ...M.courseIds(E.ev)] : M.courseIds(E.ev)).filter((id) => v[`c${id}`]);

// ---- GeoTIFF ----------------------------------------------------------------------------------------------------------------------
/** An RGB TIFF, Deflate-compressed, georeferenced by an affine of its pixels to (lon, lat) in WGS 84 (ModelTransformation). */
export async function geotiff(rgba, W, H, affine) {
  const ff = await fflate();
  const rows = Math.max(1, Math.floor(262144 / (W * 3))), strips = [];
  for (let y = 0; y < H; y += rows) {
    const n = Math.min(rows, H - y), raw = new Uint8Array(n * W * 3);
    for (let i = 0, j = y * W * 4; i < raw.length; i += 3, j += 4) { raw[i] = rgba[j]; raw[i + 1] = rgba[j + 1]; raw[i + 2] = rgba[j + 2]; }
    strips.push(ff.zlibSync(raw, { level: 6 }));
  }
  const [a, b, c, d, e, f] = affine;                     // lon = a·i + b·j + c, lat = d·i + e·j + f
  const model = [a, b, 0, c, d, e, 0, f, 0, 0, 0, 0, 0, 0, 0, 1];
  const keys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
  // the file: header, strips, then the IFD and its arrays
  const parts = [], dataStart = 8;
  let pos = dataStart;
  const offsets = strips.map((s) => { const o = pos; pos += s.length + (s.length & 1); return o; });
  const extra = [];                                       // [tag, type, count, bytes]
  const add = (tag, type, values) => {
    const size = { 3: 2, 4: 4, 12: 8 }[type], buf = new ArrayBuffer(values.length * size), dv = new DataView(buf);
    values.forEach((v, i) => (type === 3 ? dv.setUint16(i * 2, v, true) : type === 4 ? dv.setUint32(i * 4, v, true) : dv.setFloat64(i * 8, v, true)));
    extra.push([tag, type, values.length, new Uint8Array(buf)]);
  };
  add(256, 4, [W]); add(257, 4, [H]); add(258, 3, [8, 8, 8]); add(259, 3, [8]); add(262, 3, [2]); add(273, 4, offsets); add(277, 3, [3]);
  add(278, 4, [rows]); add(279, 4, strips.map((s) => s.length)); add(284, 3, [1]); add(34264, 12, model); add(34735, 3, keys);
  extra.sort((p, q) => p[0] - q[0]);
  const ifdPos = pos, ifdSize = 2 + extra.length * 12 + 4;
  let arr = ifdPos + ifdSize;
  const head = new DataView(new ArrayBuffer(8));
  head.setUint8(0, 0x49); head.setUint8(1, 0x49); head.setUint16(2, 42, true); head.setUint32(4, ifdPos, true);
  parts.push(new Uint8Array(head.buffer));
  for (const s of strips) { parts.push(s); if (s.length & 1) parts.push(new Uint8Array(1)); }
  const ifd = new DataView(new ArrayBuffer(ifdSize)), arrays = [];
  ifd.setUint16(0, extra.length, true);
  extra.forEach(([tag, type, count, bytes], i) => {
    const o = 2 + i * 12;
    ifd.setUint16(o, tag, true); ifd.setUint16(o + 2, type, true); ifd.setUint32(o + 4, count, true);
    if (bytes.length <= 4) new Uint8Array(ifd.buffer).set(bytes, o + 8);
    else { ifd.setUint32(o + 8, arr, true); arrays.push(bytes); if (bytes.length & 1) arrays.push(new Uint8Array(1)); arr += bytes.length + (bytes.length & 1); }
  });
  ifd.setUint32(2 + extra.length * 12, 0, true);
  parts.push(new Uint8Array(ifd.buffer), ...arrays);
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let k = 0; for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}
/** The affine from an image's pixel corners to (lon, lat): exact at three corners of the box. */
function pixelAffine(ev, box, pxPerMm) {
  const at = (i, j) => { const [lat, lon] = toLatLon(ev, box[0] + i / pxPerMm, box[3] - j / pxPerMm); return [lon, lat]; };
  const p0 = at(0, 0), p1 = at(1000, 0), p2 = at(0, 1000);
  return [(p1[0] - p0[0]) / 1000, (p2[0] - p0[0]) / 1000, p0[0], (p1[1] - p0[1]) / 1000, (p2[1] - p0[1]) / 1000, p0[1]];
}
export async function geotiffDialog(E) {
  if (!needGeo(E)) return;
  const v = await pick(E, t("trc.ex.geotiffTitle"), `<div class="tr-grid2">${field(t("trc.exp.dpi"), '<input name="dpi" value="200" inputmode="numeric">')}</div><p class="tr-hint">${x(t("trc.ex.geotiffHint"))}</p>`, { all: true });
  if (!v) return;
  E.status(t("trc.exp.busy"), "busy");
  const files = {};
  for (const d of designators(E.ev, chosen(E, v, true), { vars: false })) {
    const { canvas, box, pxPerMm } = await courseImage(E, d.cd, Math.max(50, Math.min(600, num(v.dpi) || 200)));
    const img = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    files[`${fileName(d.name)}.tif`] = await geotiff(img.data, canvas.width, canvas.height, pixelAffine(E.ev, box, pxPerMm));
  }
  await save(E, files, "GeoTIFF");
}

// ---- SVG ---------------------------------------------------------------------------------------------------------------------------
/** A course as SVG in millimetres: each drawing item a path or a text, grouped and named by what it draws (class, data-code). */
export function courseSvg(ev, cd, box, { map = null, purple = SCREEN.upper } = {}) {
  const layout = layoutCourse(ev, cd), items = itemsFor(ev, layout);
  const W = box[2] - box[0], H = box[3] - box[1], X = (px) => (px - box[0]).toFixed(3), Y = (py) => (box[3] - py).toFixed(3);
  const col = (c) => (Array.isArray(c) ? cmykToRgb(c) : c === "upper" || c === "lower" ? purple : c === "purple50" ? "#d38bcd" : c === "white" ? "#ffffff" : "#000000");
  const dOf = (d) => d.map((c) => (c[0] === "Z" ? "Z" : `${c[0]}${c.slice(1).map((v, i) => (i % 2 ? Y(v) : X(v))).join(" ")}`)).join("");
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${H.toFixed(2)}mm" viewBox="0 0 ${W.toFixed(3)} ${H.toFixed(3)}">`,
    `<title>${x(ev.title)} — ${x(cd.course ? ev.courses[cd.course].name : t("trc.exp.allControls"))}</title>`];
  if (map) out.push(`<image class="map" x="0" y="0" width="${W.toFixed(3)}" height="${H.toFixed(3)}" href="data:image/png;base64,${map}" preserveAspectRatio="none"/>`);
  let clip = 0;
  for (const it of items) {
    const o = it.obj || {}, code = o.control ? ev.controls[o.control]?.code : "";
    const attrs = `class="${x(o.t || "item")}${o.kind ? ` ${x(o.kind)}` : ""}"${code ? ` data-code="${x(code)}"` : ""}${it.color === "upper" || it.color === "lower" ? ` style="mix-blend-mode:multiply"` : ""}`;
    if (it.t === "path") out.push(`<path ${attrs} d="${dOf(it.d)}" ${it.fill ? `fill="${col(it.color)}" fill-rule="evenodd"` : 'fill="none"'} ${it.stroke ? `stroke="${col(it.color)}" stroke-width="${it.stroke.toFixed(3)}" stroke-linecap="${it.cap || "butt"}" stroke-linejoin="${it.join || "miter"}"` : ""}/>`);
    else if (it.t === "text") out.push(`<text ${attrs} x="${X(it.x)}" y="${Y(it.y)}" font-family="${x(it.family || "Roboto")}, Arial, sans-serif" font-size="${it.size.toFixed(3)}" ${it.bold ? 'font-weight="700"' : ""} ${it.italic ? 'font-style="italic"' : ""} text-anchor="${it.align === "center" ? "middle" : "start"}" fill="${col(it.color)}">${x(it.text)}</text>`);
    else if (it.t === "hatch") {
      const id = `h${++clip}`, xs = [], ys = [];
      for (const c of it.d) for (let i = 1; i < c.length; i += 2) { xs.push(c[i]); ys.push(c[i + 1]); }
      const l = Math.min(...xs), r = Math.max(...xs), b = Math.min(...ys), tp = Math.max(...ys), R = Math.hypot(r - l, tp - b), cx = (l + r) / 2, cy = (b + tp) / 2, lines = [];
      for (const a of it.angles) { const dx = Math.cos(a * Math.PI / 180), dy = Math.sin(a * Math.PI / 180); for (let s = -R; s <= R; s += it.spacing) lines.push(`M${X(cx - dy * s - dx * R)} ${Y(cy + dx * s - dy * R)}L${X(cx - dy * s + dx * R)} ${Y(cy + dx * s + dy * R)}`); }
      out.push(`<clipPath id="${id}"><path d="${dOf(it.d)}"/></clipPath><path ${attrs} clip-path="url(#${id})" d="${lines.join("")}" stroke="${col(it.color)}" stroke-width="${it.width.toFixed(3)}" fill="none"/>`);
    } else if (it.t === "image" && it.image?.data) out.push(`<image ${attrs} x="${X(it.box[0])}" y="${Y(it.box[3])}" width="${(it.box[2] - it.box[0]).toFixed(3)}" height="${(it.box[3] - it.box[1]).toFixed(3)}" href="data:image/${(it.image.format || "png").replace("jpg", "jpeg")};base64,${it.image.data}" preserveAspectRatio="none"/>`);
  }
  out.push("</svg>");
  return out.join("\n");
}
export async function svgDialog(E) {
  const v = await pick(E, t("trc.ex.svgTitle"), `<div class="tr-grid2">${field(t("trc.exp.content"), sel("content", [["course", t("trc.exp.contentCourse")], ["map", t("trc.exp.contentMap")]], "course"))}</div><p class="tr-hint">${x(t("trc.ex.svgHint"))}</p>`, { all: true });
  if (!v) return;
  E.status(t("trc.exp.busy"), "busy");
  const ev = E.ev, files = {}, pc = purpleOverride(ev, E.map), purple = pc ? cmykToRgb(pc) : SCREEN.upper;
  for (const d of designators(ev, chosen(E, v, true), { vars: false })) {
    const layout = layoutCourse(ev, d.cd), { box } = printBox(E, d.cd, layout);
    let map = null;
    if (v.content === "map" && E.map) {
      const pxPerMm = 8, W = Math.round((box[2] - box[0]) * pxPerMm), H = Math.round((box[3] - box[1]) * pxPerMm), c = document.createElement("canvas");
      c.width = W; c.height = H; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      await syncMap(ev, E.map); await paintMap(g, ev, E.map, box, pxPerMm, W, H, "all", M.mapHideFor(ev, d.cd.course || 0));
      map = c.toDataURL("image/png").split(",")[1];
    }
    files[`${fileName(d.name)}.svg`] = enc(courseSvg(ev, d.cd, box, { map, purple }));
  }
  await save(E, files, "SVG");
}

// ---- KMZ with the map, MapRun ------------------------------------------------------------------------------------------------------
export async function kmzDialog(E) {
  if (!needGeo(E)) return;
  const v = await pick(E, t("trc.ex.kmzTitle"), `<div class="tr-grid2">${field(t("trc.exp.dpi"), '<input name="dpi" value="150" inputmode="numeric">')}</div><p class="tr-hint">${x(t("trc.ex.kmzHint"))}</p>`);
  if (!v) return;
  E.status(t("trc.exp.busy"), "busy");
  const ev = E.ev, files = {}, folders = [];
  const ll = (px, py) => { const [lat, lon] = toLatLon(ev, px, py); return `${lon.toFixed(7)},${lat.toFixed(7)},0`; };
  let first = true;
  for (const d of designators(ev, chosen(E, v), { vars: false })) {
    const { canvas, box } = await courseImage(E, d.cd, Math.max(50, Math.min(300, num(v.dpi) || 150)));
    const img = `files/${fileName(d.name)}.jpg`;
    files[img] = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88))).arrayBuffer());
    const quad = [ll(box[0], box[1]), ll(box[2], box[1]), ll(box[2], box[3]), ll(box[0], box[3])].join(" ");
    const vw = M.view(ev, d.cd, { specials: false, descriptions: false });
    const marks = vw.controls.map((cv) => { const c = ev.controls[cv.control]; return `<Placemark><name>${x(cv.ordinal > 0 ? cv.ordinal : c.code || c.kind)}</name><Point><coordinates>${ll(c.x, c.y)}</coordinates></Point></Placemark>`; });
    folders.push(`<Folder><name>${x(d.name)}</name><visibility>${first ? 1 : 0}</visibility><GroundOverlay><name>${x(d.name)}</name><visibility>${first ? 1 : 0}</visibility><Icon><href>${x(img)}</href></Icon>
<gx:LatLonQuad><coordinates>${quad}</coordinates></gx:LatLonQuad></GroundOverlay>${marks.join("")}</Folder>`);
    first = false;
  }
  files["doc.kml"] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${x(ev.title)}</name>\n${folders.join("\n")}\n</Document></kml>\n`);
  const ff = await fflate();
  download(`${fileName(ev.title)}.kmz`, ff.zipSync(files, { level: 0 }), "application/vnd.google-earth.kmz");
  E.status(t("trc.exp.done"), "ok");
}
/** MapRun's KML: one file a course, its start « S1 », its finish « F1 », the controls by their number on a line course and by their
 *  code on a score course (MapRun reads the points from it). */
export async function maprunDialog(E) {
  if (!needGeo(E)) return;
  const v = await pick(E, t("trc.ex.maprunTitle"), `<p class="tr-hint">${x(t("trc.ex.maprunHint"))}</p>`);
  if (!v) return;
  const ev = E.ev, files = {};
  const ll = (c) => { const [lat, lon] = toLatLon(ev, c.x, c.y); return `${lon.toFixed(7)},${lat.toFixed(7)},0`; };
  for (const d of designators(ev, chosen(E, v))) {
    const vw = M.view(ev, d.cd, { specials: false, descriptions: false }), score = vw.kind === "score", seen = new Set();
    const marks = [];
    for (const cv of vw.controls) {
      const c = ev.controls[cv.control];
      let name = c.kind === "start" ? "S1" : c.kind === "finish" ? "F1" : c.kind === "normal" ? (score ? c.code : String(cv.ordinal)) : null;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      marks.push(`<Placemark><name>${x(name)}</name><Point><coordinates>${ll(c)}</coordinates></Point></Placemark>`);
    }
    files[`${fileName(d.name)}.kml`] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(d.name)}</name><Folder><name>${x(d.name)}</name>\n${marks.join("\n")}\n</Folder></Document></kml>\n`);
  }
  await save(E, files, "MapRun");
}

// ---- OCAD's text of the courses, IOF XML 2.0.3 by variation, the Livelox package --------------------------------------------------
/** OCAD's courses as text, one course a line: name;length (km);climb (m);S1;31;32;…;F1 (OCAD's « Export courses (text) »). */
export function ocadText(ev) {
  const lines = [];
  for (const d of designators(ev, M.courseIds(ev))) {
    const vw = M.view(ev, d.cd, { specials: false, descriptions: false }), c = ev.courses[d.cd.course];
    const codes = vw.controls.map((cv) => { const k = ev.controls[cv.control]; return k.kind === "start" ? "S1" : k.kind === "finish" ? "F1" : k.kind === "normal" ? k.code : null; }).filter(Boolean);
    lines.push([d.name, (vw.totalMax / 1000).toFixed(1), c.climb >= 0 ? Math.round(c.climb) : "", ...codes].join(";"));
  }
  return `${lines.join("\r\n")}\r\n`;
}
/** The event with every variation as a course of its own (« A AB », « A BA »…): for IOF XML 2.0.3 to programs without variations. */
export function variationsAsCourses(ev) {
  const x2 = JSON.parse(JSON.stringify(ev));
  for (const id of M.courseIds(ev)) {
    if (!M.hasVariations(ev, id)) continue;
    const c = ev.courses[id];
    for (const v of M.allVariations(ev, id)) {
      const nid = M.createCourse(x2, { name: `${c.name} ${v.code}`, addStartFinish: false, climb: c.climb, printScale: c.printScale, secondary: c.secondary });
      let last = 0;
      for (const cc of M.ccIds(ev, M.cdCourse(id, -1, v.path))) {
        const control = ev.courseControls[cc].control, kind = ev.controls[control].kind;
        if (kind === "start" || kind === "map-issue") { last = M.addStartOrIssue(x2, control, nid); continue; }
        if (kind === "finish") { M.addFinish(x2, control, nid); continue; }
        const p = M.insertionPoint(x2, M.cdCourse(nid), last, 0);
        last = M.addCourseControl(x2, control, nid, p.cc1, p.cc2, p.loc);
      }
    }
    M.deleteCourse(x2, id);
  }
  return x2;
}
export function iof2Separate(E) { download(`${fileName(E.ev.title)} - IOF XML 2.0.3 (${t("trc.ex.byVariation")}).xml`, iofXmlText(variationsAsCourses(E.ev), 2), "application/xml"); }
export function ocadTextFile(E) { download(`${fileName(E.ev.title)} - OCAD.txt`, ocadText(E.ev), "text/plain;charset=utf-8"); }
/** Livelox's import page takes the courses (IOF XML 3.0) and the map as an image with its georeferencing. */
export async function liveloxPackage(E) {
  if (!needGeo(E)) return;
  const ev = E.ev;
  E.status(t("trc.exp.busy"), "busy");
  const dpi = Math.min(200, (8000 * 25.4) / Math.max(ev.map.w, ev.map.h)), pxPerMm = dpi / 25.4;
  const W = Math.round(ev.map.w * pxPerMm), H = Math.round(ev.map.h * pxPerMm), c = document.createElement("canvas");
  c.width = W; c.height = H; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  if (E.map) { await syncMap(ev, E.map); await paintMap(g, ev, E.map, [0, 0, ev.map.w, ev.map.h], pxPerMm, W, H); }
  const base = fileName(ev.title), box = [0, 0, ev.map.w, ev.map.h];
  const [a, b, cc, d, e, f] = pixelAffine(ev, box, pxPerMm);
  const files = { [`${base}.xml`]: enc(iofXmlText(ev, 3)), [`${base}.jpg`]: new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9))).arrayBuffer()),
    [`${base}.jgw`]: enc([a, d, b, e, cc + a / 2 + b / 2, f + d / 2 + e / 2].map((v) => v.toFixed(12)).join("\n") + "\n"),
    [`${base}.prj`]: enc('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]') };
  const ff = await fflate();
  download(`${base} - Livelox.zip`, ff.zipSync(files, { level: 0 }), "application/zip");
  E.status(t("trc.exp.done"), "ok");
  E.toast(t("trc.ex.liveloxDone"), 9000);
}
async function save(E, files, label) {
  const n = Object.keys(files).length;
  if (!n) { E.status(t("trc.exp.done"), "ok"); E.toast(t("trc.ex.nothing")); return; }
  if (n === 1) { const [name, bytes] = Object.entries(files)[0]; download(name, new Blob([bytes])); }
  else await saveFiles(E, files, `${fileName(E.ev.title)} - ${label}.zip`);
  E.status(t("trc.exp.done"), "ok");
}

// ---- Garmin custom maps -------------------------------------------------------------------------------------------------------------
const GARMIN_TILE = 1024, GARMIN_MAX = 100;
/**
 * A KMZ a Garmin device shows as a custom map (owner, 2026-11-16, after OCAD's export): the map — alone, or with a course drawn
 * on it — cut into JPEG tiles of 1024 × 1024 pixels at most, each a ground overlay placed by its box and the map's rotation
 * (Garmin reads boxes, not quadrilaterals), 100 tiles at most (what the older devices take: the resolution is lowered to keep
 * within it). The map alone covers the whole sheet; with a course, its print area.
 */
export async function garminDialog(E) {
  if (!needGeo(E)) return;
  const ev = E.ev, ids = M.courseIds(ev), sprint = ev.appearance?.mapStandard === "Spr2019" || (ev.map.scale || 10000) <= 5000;
  if (!E.map && !M.printBgOf(ev, 0)) { E.toast(t("trc.ex.garminNoMap")); return; }
  const v = await modal(E, { title: t("trc.ex.garminTitle"), ok: t("trc.exp.create"), remember: "garmin", body: `
    <p>${x(t("trc.ex.garminIntro"))}</p>
    <div class="tr-grid2">${field(t("trc.ex.garminWhat"), sel("what", [["map", t("trc.ex.garminMap")], ...ids.map((id) => [String(id), t("trc.ex.garminCourse", { name: ev.courses[id].name })])], "map"))}
    ${field(t("trc.ex.garminRes"), `<input name="res" value="${sprint ? "0.75" : "1.5"}" inputmode="decimal" data-fresh>`, t("trc.ex.garminResHint"))}</div>
    <p class="tr-hint">${x(t("trc.ex.garminHint"))}</p>`,
  validate: (o) => (!(num(o.res) >= 0.1 && num(o.res) <= 20) ? t("trc.ex.garminResErr") : null) });
  if (!v) return;
  E.status(t("trc.exp.busy"), "busy");
  try {
    const course = v.what === "map" ? 0 : Number(v.what), cd = course ? M.cdCourse(course) : M.cdAll();
    const mw = ev.map.w || 210, mh = ev.map.h || 297, layout = layoutCourse(ev, cd), items = course ? itemsFor(ev, layout) : [];
    let box = [0, 0, mw, mh];
    if (course) { const b = printBox(E, cd, layout).box; box = [Math.max(0, b[0]), Math.max(0, b[1]), Math.min(mw, b[2]), Math.min(mh, b[3])]; if (!(box[2] > box[0] && box[3] > box[1])) box = [0, 0, mw, mh]; }
    // the ground's metres per map mm along x and y, and the map's turn (its x axis against the east), at the box's middle
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, [la0, lo0] = toLatLon(ev, cx, cy), kx = 111320 * Math.cos((la0 * Math.PI) / 180), ky = 110540;
    const vec = (dx, dy) => { const [la, lo] = toLatLon(ev, cx + dx, cy + dy); return [(lo - lo0) * kx, (la - la0) * ky]; };
    const ex = vec(10, 0), ey = vec(0, 10), mx = Math.hypot(...ex) / 10, my = Math.hypot(...ey) / 10, rot = (Math.atan2(ex[1], ex[0]) * 180) / Math.PI;
    let res = num(v.res), W, H, nx, ny;
    for (;;) {
      W = Math.max(1, Math.round(((box[2] - box[0]) * mx) / res)); H = Math.max(1, Math.round(((box[3] - box[1]) * my) / res));
      nx = Math.ceil(W / GARMIN_TILE); ny = Math.ceil(H / GARMIN_TILE);
      if (nx * ny <= GARMIN_MAX) break;
      res *= 1.12;
    }
    const pxPerMm = W / (box[2] - box[0]);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const T = (xx, yy) => [(xx - box[0]) * pxPerMm, (box[3] - yy) * (H / (box[3] - box[1]))];
    const bgId = !E.map ? M.printBgOf(ev, course) : "";
    if (bgId) { const B = await import("./backdrop.js"), cv = await B.backdropCanvas(E, bgId, box, pxPerMm); if (cv) g.drawImage(cv, 0, 0, W, H); }
    const pc = purpleOverride(ev, E.map), purple = pc ? cmykToRgb(pc) : SCREEN.upper;
    await paintCourse(g, ev, E.map, box, pxPerMm, W, H, items, (list, blend) => drawItems(g, list, T, pxPerMm, { blend, purple }), { withMap: !!E.map, course });
    const files = {}, overlays = [], tw = Math.ceil(W / nx), th = Math.ceil(H / ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x0 = i * tw, y0 = j * th, w = Math.min(tw, W - x0), h = Math.min(th, H - y0);
      if (w <= 0 || h <= 0) continue;
      const tc = document.createElement("canvas"); tc.width = w; tc.height = h;
      tc.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, w, h);
      const name = `files/tile_${String(j + 1).padStart(2, "0")}_${String(i + 1).padStart(2, "0")}.jpg`;
      files[name] = new Uint8Array(await (await new Promise((r) => tc.toBlob(r, "image/jpeg", 0.85))).arrayBuffer());
      // the tile's middle on the ground, its width and height there, the map's turn
      const mxm = box[0] + (x0 + w / 2) / pxPerMm, mym = box[3] - (y0 + h / 2) / (H / (box[3] - box[1])), [lat, lon] = toLatLon(ev, mxm, mym);
      const hw = ((w / pxPerMm) * mx) / 2, hh = ((h / (H / (box[3] - box[1]))) * my) / 2, kxl = 111320 * Math.cos((lat * Math.PI) / 180);
      overlays.push(`<GroundOverlay><name>${x(`${j + 1}-${i + 1}`)}</name><drawOrder>50</drawOrder><Icon><href>${name}</href></Icon><LatLonBox><north>${(lat + hh / ky).toFixed(7)}</north><south>${(lat - hh / ky).toFixed(7)}</south><east>${(lon + hw / kxl).toFixed(7)}</east><west>${(lon - hw / kxl).toFixed(7)}</west><rotation>${rot.toFixed(4)}</rotation></LatLonBox></GroundOverlay>`);
    }
    const title = `${ev.title || "Ozimut"}${course ? ` — ${ev.courses[course].name}` : ""}`;
    files["doc.kml"] = enc(`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(title)}</name>\n${overlays.join("\n")}\n</Document></kml>\n`);
    const ff = await fflate();
    download(`${fileName(title)} - Garmin.kmz`, ff.zipSync(files, { level: 0 }), "application/vnd.google-earth.kmz");
    E.status(t("trc.exp.done"), "ok");
    E.toast(t("trc.ex.garminDone", { n: overlays.length, res: new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(res) }), 7000);
  } catch (err) { console.error(err); E.status(t("trc.exp.failed"), "bad"); E.toast(err.message || String(err)); }
}
