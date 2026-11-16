// The event's elevation model (owner, 2026-11-16, after the OCAD study): one grid of heights over the whole map, shared by
// everything that needs the ground's relief — the climb of the courses (between the controls' heights, along the legs, along
// the routes), the profile of a leg or a course, the route analyzer, the control tour, the relief shading and the slope
// layer. It comes from the best source for the place (trace/terrain.js: IGN's RGE ALTI — LiDAR HD where flown — in France,
// swisstopo, USGS 3DEP, NRCan, LINZ, else the world's terrain tiles), or from one's own file (a GeoTIFF with its
// georeference, an ESRI ASCII grid: a LiDAR model of the club's, a national model downloaded). The map must be georeferenced.
// The grid is kept with the event (R2 tracer/<id>/dem, « OZD1 »: a small header, then the heights in decimetres, row deltas,
// deflated — the Ozimut file carries it too): the whole team gets the same figures, offline included, and nothing is asked
// again. A control's height can be corrected by hand (control.z), which every figure then uses.
//
// The grid: nx × ny nodes over the map frame [0, w] × [0, h] mm, row by row from the map's top, as trace/terrain.js's.

import * as M from "./model.js";
import * as S from "./store.js";
import { hasGeo, toLatLon } from "./geo.js";
import { modal, field, num } from "./dialogs.js";
import { ctrlName } from "./reports.js";
import { where } from "./ribbon-data.js";
import { t, tn, locale } from "./lang.js";
import { bar, setBar } from "../waitbar.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const MAGIC = "OZD1";
const LIMITS = { maxNodes: 120000, minStep: 3, maxSide: 480 };          // the event's grid: finer than a view's (terrain.js gridPlan)
const FILE_LIMITS = { maxNodes: 250000, minStep: 2, maxSide: 640 };     // one's own file is read on the device: finer still

/** The georeference and frame a grid was made for: another georeference, another map → the grid no longer fits. */
export const keyOf = (ev) => (hasGeo(ev) ? `${["a", "b", "c", "d", "e", "f"].map((k) => Number(ev.geo[k]).toPrecision(8)).join(",")}|${Math.round(ev.map.w)}x${Math.round(ev.map.h)}` : "");
const mPerMm = (ev) => (ev.map.scale || 10000) / 1000;

// ---- the grid ---------------------------------------------------------------------------------------------------------------
/** The height (m) at a map point (mm), bilinear; the edge's height outside the map. */
export function zAt(R, x, y) {
  const fx = Math.max(0, Math.min(R.nx - 1.0001, (x / R.w) * (R.nx - 1))), fy = Math.max(0, Math.min(R.ny - 1.0001, ((R.h - y) / R.h) * (R.ny - 1)));
  const i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j, k = j * R.nx + i, z = R.z;
  return (1 - ay) * ((1 - ax) * z[k] + ax * z[k + 1]) + ay * ((1 - ax) * z[k + R.nx] + ax * z[k + R.nx + 1]);
}
/** A control's height: the one typed for it (control.z), else the model's. */
export const heightOf = (ev, R, id) => { const c = ev.controls[id]; return Number.isFinite(c?.z) ? c.z : zAt(R, c.x, c.y); };
/** The grid over a part of the map (box in mm), as trace/terrain.js's grids (for the route engine, the 3D view): its nodes
 *  about the model's step apart. */
export function subGrid(R, box) {
  const wm = (box[2] - box[0]) * R.mPerMm, hm = (box[3] - box[1]) * R.mPerMm;
  const nx = Math.max(2, Math.min(640, Math.round(wm / R.step) + 1)), ny = Math.max(2, Math.min(640, Math.round(hm / R.step) + 1));
  const z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z[j * nx + i] = zAt(R, box[0] + (i / (nx - 1)) * (box[2] - box[0]), box[3] - (j / (ny - 1)) * (box[3] - box[1]));
  return { z, nx, ny, step: R.step, source: R.source };
}
function make(ev, g, extra = {}) {
  return { z: g.z, nx: g.nx, ny: g.ny, step: g.step, source: g.source || "tiles", w: ev.map.w, h: ev.map.h, mPerMm: mPerMm(ev), key: keyOf(ev), at: Date.now(), ...extra };
}
/** Holes (NaN) filled from their neighbours; false when a whole region stays empty. */
function fill(z, nx, ny) {
  for (let pass = 0; pass < 80; pass++) {
    let left = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!Number.isNaN(z[k])) continue;
      let s = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && !Number.isNaN(z[b * nx + a])) { s += z[b * nx + a]; n++; } }
      if (n) z[k] = s / n; else left++;
    }
    if (!left) return true;
  }
  return false;
}
const nodes = (ev, plan) => { const out = []; for (let j = 0; j < plan.ny; j++) for (let i = 0; i < plan.nx; i++) out.push(toLatLon(ev, (i / (plan.nx - 1)) * ev.map.w, ev.map.h - (j / (plan.ny - 1)) * ev.map.h)); return out; };

// ---- the stored form ---------------------------------------------------------------------------------------------------------
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
/** The grid as bytes to keep with the event (« OZD1 »). */
export async function pack(R) {
  let lo = Infinity, hi = -Infinity;
  for (const v of R.z) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const q = Math.max(0.1, (hi - lo) / 60000), n = R.nx * R.ny, d = new Int16Array(n);
  for (let j = 0; j < R.ny; j++) { let prev = 0; for (let i = 0; i < R.nx; i++) { const k = j * R.nx + i, v = Math.round((R.z[k] - lo) / q); d[k] = v - prev; prev = v; } }
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, nx: R.nx, ny: R.ny, step: R.step, source: R.source, name: R.name || "", by: R.by || "auto", w: R.w, h: R.h, key: R.key, at: R.at, lo, q }));
  const body = await pipe(new Uint8Array(d.buffer), new CompressionStream("deflate-raw"));
  const out = new Uint8Array(8 + head.length + body.length);
  out.set(new TextEncoder().encode(MAGIC), 0); new DataView(out.buffer).setUint32(4, head.length, true);
  out.set(head, 8); out.set(body, 8 + head.length);
  return out;
}
/** The stored grid read back, or null (not this format). */
export async function unpack(bytes, ev) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12 || new TextDecoder().decode(u8.subarray(0, 4)) !== MAGIC) return null;
  const hl = new DataView(u8.buffer, u8.byteOffset).getUint32(4, true);
  let head;
  try { head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl))); } catch (e) { return null; }
  const raw = await pipe(u8.subarray(8 + hl), new DecompressionStream("deflate-raw")), n = head.nx * head.ny;
  if (raw.length !== 2 * n) return null;
  const d = new Int16Array(raw.buffer, raw.byteOffset, n), z = new Float32Array(n);
  for (let j = 0; j < head.ny; j++) { let prev = 0; for (let i = 0; i < head.nx; i++) { const k = j * head.nx + i; prev += d[k]; z[k] = head.lo + prev * head.q; } }
  return { z, nx: head.nx, ny: head.ny, step: head.step, source: head.source, name: head.name || "", by: head.by || "auto", w: head.w, h: head.h, mPerMm: mPerMm(ev), key: head.key, at: head.at, stored: true };
}

// ---- getting the model ---------------------------------------------------------------------------------------------------------
/**
 * The event's elevation model, or null when there is none to be had (no georeference: the caller says so). In order: the one
 * in memory, the one kept with the event, the source online (then kept with the event when the user may edit it).
 * onProgress(fraction, stage "stored" | "online").
 */
export async function ensureRelief(E, { onProgress = null, fresh = false } = {}) {
  const ev = E.ev, key = keyOf(ev);
  if (!fresh && E.relief && (E.relief.key === key || E.relief.by === "file")) return E.relief;
  if (E._reliefP && !fresh) return E._reliefP;
  E._reliefP = (async () => {
    // kept with the event
    if (!fresh && E.meta?.id && !E.blank) {
      onProgress?.(null, "stored");
      const bytes = (E.offline ? null : await S.loadDem(E.meta.id, E.key).catch(() => null)) || E.localDem || null;   // offline: the device's copy
      const R = bytes ? await unpack(bytes, ev).catch(() => null) : null;
      // a model for another georeference no longer fits; one's own file stays (it was placed with the georeference of its day)
      if (R && (R.key === key || R.by === "file") && Math.abs(R.w - ev.map.w) < 2 && Math.abs(R.h - ev.map.h) < 2) { E.relief = R; return R; }
    }
    if (!key) return null;
    const { gridPlan, loadGrid } = await import("../trace/terrain.js");
    const k = mPerMm(ev), plan = gridPlan(ev.map.w, ev.map.h, (x, y) => [x * k, y * k], LIMITS);
    const grid = await loadGrid({ key: `trev:${key}`, nx: plan.nx, ny: plan.ny, step: plan.step, fresh,
      node: (i, j) => toLatLon(ev, (i / (plan.nx - 1)) * ev.map.w, ev.map.h - (j / (plan.ny - 1)) * ev.map.h), onProgress: (f) => onProgress?.(f, "online") });
    E.relief = make(ev, grid, { by: "auto" });
    keep(E).catch(() => {});
    return E.relief;
  })();
  try { return await E._reliefP; } finally { E._reliefP = null; }
}
/** The model kept with the event (those who may edit it; an offline or blank editor keeps nothing). */
async function keep(E) {
  if (!E.relief || E.readOnly || E.blank || !E.meta?.id || E.offline) return false;
  await S.saveDem(E.meta.id, await pack(E.relief), E.key);
  E.relief.stored = true;
  return true;
}
/** One's own file as the event's model: its heights read at the grid's nodes. Throws "geo" (no georeference), "epsg" (the
 *  file's grid is not known), "format", "outside" (the file does not cover the map). */
export async function reliefFromFile(E, file, epsg = 0) {
  const ev = E.ev;
  if (!hasGeo(ev)) throw new Error("geo");
  const { gridPlan, fileHeights } = await import("../trace/terrain.js");
  const { gridOf } = await import("./vmap/georef.js");
  const k = mPerMm(ev), plan = gridPlan(ev.map.w, ev.map.h, (x, y) => [x * k, y * k], FILE_LIMITS);
  const r = await fileHeights(new Uint8Array(await file.arrayBuffer()), file.name, nodes(ev, plan), { epsg, defOf: async (code) => (await gridOf({ epsg: code }))?.proj4 || null });
  let nan = 0;
  for (const v of r.z) if (Number.isNaN(v)) nan++;
  if (nan > 0.5 * r.z.length) throw new Error("outside");
  if (nan && !fill(r.z, plan.nx, plan.ny)) throw new Error("outside");
  E.relief = make(ev, { z: r.z, nx: plan.nx, ny: plan.ny, step: plan.step, source: "file" }, { by: "file", name: file.name, res: r.info.res, epsg: r.info.epsg });
  await keep(E).catch(() => {});
  return E.relief;
}
/** Back to the online source: the kept model dropped, a new one read. */
export async function reliefReset(E, onProgress) {
  E.relief = null;
  if (E.meta?.id && !E.readOnly && !E.blank) await S.deleteDem(E.meta.id).catch(() => {});
  return ensureRelief(E, { onProgress, fresh: true });
}
/** The model with a busy line in the status bar; a toast and null when it cannot be had. */
export async function reliefFor(E) {
  if (E.relief && (E.relief.key === keyOf(E.ev) || E.relief.by === "file")) return E.relief;
  if (!hasGeo(E.ev) && !E.meta?.id) { E.toast(t("trc.dem.needGeo", { where: where("georef") }), 6000); return null; }
  E.status(t("trc.dem.loading"), "busy");
  try {
    const R = await ensureRelief(E, { onProgress: (f) => E.status(t("trc.dem.loading"), "busy", f) });
    E.status(t("trc.dem.ready"), "ok");
    if (!R) E.toast(t("trc.dem.needGeo", { where: where("georef") }), 6000);
    return R;
  } catch (err) { console.error(err); E.status(t("trc.dem.failed"), "bad"); E.toast(t("trc.dem.failedWhy", { why: err.message || String(err) }), 7000); return null; }
}
export const sourceName = (R) => (R.by === "file" ? t("trc.dem.srcFile", { name: R.name || "" }) : t(`trc.dem.src.${String(R.source).replace("+tiles", "")}`));

// ---- climbs and profiles -------------------------------------------------------------------------------------------------------
/** The profile along a polyline of map mm: { d (m from the start), z, up, down, min, max, len, marks (d of each vertex) }; the
 *  heights lightly smoothed (a median then a mean of 3: the model's noise makes false rises). */
export function profileOf(R, pts, stepM = 0) {
  const k = R.mPerMm, step = Math.max(2, stepM || Math.min(10, R.step)), d = [], z = [], marks = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]) * k, n = Math.max(1, Math.ceil(L / step));
    for (let s = i === 1 ? 0 : 1; s <= n; s++) { const f = s / n; d.push(acc + L * f); z.push(zAt(R, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)); }
    acc += L; marks.push(acc);
  }
  if (!z.length) return { d: [0], z: [pts[0] ? zAt(R, pts[0][0], pts[0][1]) : 0], up: 0, down: 0, min: 0, max: 0, len: 0, marks };
  const m = z.map((_, i) => { const w = z.slice(Math.max(0, i - 1), i + 2).sort((p, q) => p - q); return w[Math.floor(w.length / 2)]; });
  const s = m.map((_, i) => { const w = m.slice(Math.max(0, i - 1), i + 2); return w.reduce((p, q) => p + q, 0) / w.length; });
  let up = 0, down = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < s.length; i++) { if (i) { const dz = s[i] - s[i - 1]; if (dz > 0) up += dz; else down -= dz; } if (s[i] < min) min = s[i]; if (s[i] > max) max = s[i]; }
  return { d, z: s, up, down, min, max, len: acc, marks };
}
/** The controls of a designator, in order (their ids). */
const seqOf = (ev, cd) => M.ccIds(ev, cd).map((cc) => ev.courseControls[cc].control);
/** A leg's main route when it has one (the controls and its points), else the leg as drawn (its bends). */
export const legWay = (ev, a, b) => M.legRoutePoints(ev, a, b);
/**
 * A designator's climbs by the three methods: { len (m, along the legs), between (the net ascent between the controls'
 * heights: the rises from one control to the next), legs (the rises along the legs as drawn), routes (along each leg's
 * route, the leg itself where it has none), hasRoutes (some leg has a route), lenRoutes }.
 */
export function climbsOf(ev, R, cd) {
  const seq = seqOf(ev, cd);
  let between = 0, legs = 0, routes = 0, len = 0, lenRoutes = 0, hasRoutes = false;
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = seq[i], b = seq[i + 1];
    between += Math.max(0, heightOf(ev, R, b) - heightOf(ev, R, a));
    const pl = profileOf(R, M.legPoints(ev, a, b));
    legs += pl.up; len += pl.len;
    const way = legWay(ev, a, b), leg = ev.legs[M.findLeg(ev, a, b)];
    if (leg?.route?.length) { hasRoutes = true; const pr = profileOf(R, way); routes += pr.up; lenRoutes += pr.len; } else { routes += pl.up; lenRoutes += pl.len; }
  }
  return { len, between, legs, routes, hasRoutes, lenRoutes };
}
const lineCourses = (ev) => M.courseIds(ev, false).filter((id) => ev.courses[id].kind !== "score");
const designators = (ev, id) => (M.hasVariations(ev, id) ? M.allVariations(ev, id).slice(0, 12).map((x) => ({ cd: M.cdCourse(id, -1, x.path), code: x.code })) : [{ cd: M.cdCourse(id), code: "" }]);

/**
 * « Dénivelé »: each course's climb by the three methods — between the controls' heights (OCAD's), along the legs as drawn,
 * along the routes (the IOF's « shortest sensible route »: the routes kept on the legs, the leg itself where there is none) —,
 * the one chosen copied to the courses; and the controls' heights, each corrected by hand if the model is off there.
 */
export async function climbDialog(E) {
  const ev = E.ev, ids = lineCourses(ev);
  if (!ids.length) { E.toast(t("trc.dem.noLineCourse")); return; }
  const R = await reliefFor(E);
  if (!R) return;
  const zs = new Map();                                    // the corrections typed in the dialog, before they are saved
  const evNow = () => { if (!zs.size) return ev; const x = { ...ev, controls: { ...ev.controls } }; for (const [id, v] of zs) x.controls[id] = { ...x.controls[id], z: v ?? undefined }; return x; };
  const figures = () => ids.map((id) => {
    let best = null;
    for (const d of designators(ev, id)) { const c = climbsOf(evNow(), R, d.cd); if (!best || c.routes > best.routes) best = { ...c, code: d.code }; }
    return { id, ...best };
  });
  let rows = figures();
  const anyRoutes = rows.some((r) => r.hasRoutes);
  const last = (() => { try { return JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}").climbBy || ""; } catch (e) { return ""; } })();
  let by = ["between", "legs", "routes"].includes(last) ? last : "routes";
  const r5 = (v) => Math.round(v / 5) * 5;
  const used = Object.keys(ev.controls).map(Number).filter((id) => ["normal", "start", "finish"].includes(ev.controls[id].kind)).sort((a, b) => M.compareControls(ev, a, b));
  const table = () => `<div class="table-wrap"><table class="tr-table tr-climb"><thead><tr><th></th><th>${esc(t("trc.dem.thCourse"))}</th><th class="r">${esc(t("trc.dem.thLength"))}</th>
      ${["between", "legs", "routes"].map((k) => `<th class="r${by === k ? " tr-on" : ""}"><button type="button" class="tr-thbtn" data-by="${k}" aria-pressed="${by === k}" title="${esc(t(`trc.dem.${k}Tip`))}">${esc(t(`trc.dem.${k}`))}</button></th>`).join("")}
      <th class="r">${esc(t("trc.dem.thCurrent"))}</th><th class="r">${esc(t("trc.dem.thNew"))}</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><input type="checkbox" name="u${r.id}" checked aria-label="${esc(t("trc.dem.copy"))}"></td><td>${esc(ev.courses[r.id].name)}${r.code ? ` <small>${esc(t("trc.dem.steepest", { code: r.code }))}</small>` : ""}</td>
      <td class="r">${nf(r.len / 1000, 2)} km</td>${["between", "legs", "routes"].map((k) => `<td class="r${by === k ? " tr-on" : ""}">${Math.round(r[k])} m${k === "routes" && !r.hasRoutes ? ' <small title="' + esc(t("trc.dem.noRouteTip")) + '">*</small>' : ""}</td>`).join("")}
      <td class="r">${ev.courses[r.id].climb >= 0 ? `${ev.courses[r.id].climb} m` : "—"}</td><td class="r"><input name="c${r.id}" value="${r5(r[by])}" size="5" inputmode="numeric" data-fresh> m</td></tr>`).join("")}</tbody></table></div>`;
  const v = await modal(E, { title: t("trc.dem.climbTitle"), wide: true, ok: t("trc.dem.climbOk"), body: `
    <p>${esc(t("trc.dem.climbIntro"))}</p>
    <div id="tr-climb-table">${table()}</div>
    <p class="tr-hint">${anyRoutes ? "" : `${esc(t("trc.dem.noRoutes", { where: where("routes") }))} `}${esc(t("trc.dem.modelLine", { source: sourceName(R), step: nf(R.step, R.step < 10 ? 1 : 0) }))}
      <button type="button" class="btn btn-sm" data-dem>${esc(t("trc.dem.change"))}</button></p>
    <details class="tr-details"><summary>${esc(t("trc.dem.heights"))}</summary>
      <p class="tr-hint">${esc(t("trc.dem.heightsHint"))}</p>
      <div class="tr-heights">${used.map((id) => `<label><span>${esc(ctrlName(ev, id))}</span><small>${nf(zAt(R, ev.controls[id].x, ev.controls[id].y), 1)} m</small>
        <input name="z${id}" value="${Number.isFinite(ev.controls[id].z) ? ev.controls[id].z : ""}" size="5" inputmode="decimal" placeholder="${esc(t("trc.dem.modelPh"))}" data-fresh></label>`).join("")}</div></details>`,
  onOpen: (f, done) => {
    const box = f.querySelector("#tr-climb-table");
    const redraw = () => {
      const keepv = new Map([...f.querySelectorAll('input[type="checkbox"]')].map((c) => [c.name, c.checked]));
      box.innerHTML = table();
      for (const c of f.querySelectorAll('input[type="checkbox"]')) if (keepv.has(c.name)) c.checked = keepv.get(c.name);
    };
    f.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-by]");
      if (b) { by = b.dataset.by; redraw(); return; }
      if (e.target.closest("[data-dem]")) { done(null); demDialog(E); }
    });
    f.querySelector(".tr-heights")?.addEventListener("change", (e) => {
      const el = e.target.closest("input[name^=z]"); if (!el) return;
      const id = Number(el.name.slice(1)), x = el.value.trim() === "" ? null : num(el.value);
      zs.set(id, Number.isFinite(x) ? x : null);
      rows = figures(); redraw();
    });
  } });
  if (!v) return;
  try { const o = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}"); o.climbBy = by; localStorage.setItem("ocn.tr.prefs", JSON.stringify(o)); } catch (e) { /* this visit */ }
  E.change((x) => {
    for (const [id, z] of zs) { if (!x.controls[id]) continue; if (z == null) delete x.controls[id].z; else x.controls[id].z = Math.round(z * 10) / 10; }
    for (const r of rows) if (v[`u${r.id}`]) { const c = Math.round(num(v[`c${r.id}`])); if (c >= 0) x.courses[r.id].climb = c; }
  }, t("trc.dem.undoClimb"));
}

// ---- the model's dialog ------------------------------------------------------------------------------------------------------
/** « Modèle d'altitude »: what the event uses, one's own file in its place, the online source again. */
export async function demDialog(E) {
  const ev = E.ev;
  if (!hasGeo(ev) && !E.relief) {
    const R0 = E.meta?.id ? await ensureRelief(E).catch(() => null) : null;
    if (!R0) { E.toast(t("trc.dem.needGeo", { where: where("georef") }), 6000); return; }
  }
  let R = E.relief || (await reliefFor(E));
  const info = () => (!R ? `<p class="tr-warn">${esc(t("trc.dem.none"))}</p>` : `<dl class="tr-dl tr-demdl"><dt>${esc(t("trc.dem.source"))}</dt><dd>${esc(sourceName(R))}</dd>
      <dt>${esc(t("trc.dem.grid"))}</dt><dd>${esc(t("trc.dem.gridVal", { nx: R.nx, ny: R.ny, step: nf(R.step, R.step < 10 ? 1 : 0) }))}</dd>
      <dt>${esc(t("trc.dem.range"))}</dt><dd>${(() => { let lo = Infinity, hi = -Infinity; for (const z of R.z) { if (z < lo) lo = z; if (z > hi) hi = z; } return esc(t("trc.dem.rangeVal", { lo: nf(lo), hi: nf(hi) })); })()}</dd>
      <dt>${esc(t("trc.dem.kept"))}</dt><dd>${esc(R.stored ? t("trc.dem.keptYes") : E.readOnly ? t("trc.dem.keptReadOnly") : t("trc.dem.keptNo"))}</dd></dl>`);
  await modal(E, { title: t("trc.dem.title"), wide: true, ok: null, cancel: t("trc.dem.close"), body: `
    <p>${esc(t("trc.dem.intro"))}</p>
    <div id="tr-dem-info">${info()}</div>
    <div class="tr-dem-acts">
      <button type="button" class="btn" data-a="file" ${E.readOnly ? "disabled" : ""}>${esc(t("trc.dem.useFile"))}</button>
      <button type="button" class="btn" data-a="online" ${E.readOnly || !hasGeo(ev) ? "disabled" : ""}>${esc(t("trc.dem.useOnline"))}</button>
      <label class="tr-field tr-dem-epsg"><span>${esc(t("trc.dem.epsg"))}</span><input name="epsg" size="6" inputmode="numeric" placeholder="2154"><small>${esc(t("trc.dem.epsgHint"))}</small></label>
    </div>
    <input type="file" id="tr-dem-file" accept=".tif,.tiff,.asc,image/tiff" hidden>
    <p class="tr-dem-busy" id="tr-dem-busy" hidden></p>
    <p class="tr-hint">${esc(t("trc.dem.fileHint"))}</p>`,
  onOpen: (f) => {
    const busy = f.querySelector("#tr-dem-busy"), file = f.querySelector("#tr-dem-file");
    const say = (msg, frac = null) => { busy.hidden = !msg; busy.innerHTML = msg ? `${bar(frac)} <span>${esc(msg)}</span>` : ""; };
    const done = () => { say(""); f.querySelector("#tr-dem-info").innerHTML = info(); E.redraw(); window.dispatchEvent(new CustomEvent("tr-relief")); };
    f.querySelector('[data-a="file"]').addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const fl = file.files[0]; if (!fl) return;
      say(t("trc.dem.readingFile", { name: fl.name }));
      try { R = await reliefFromFile(E, fl, Math.round(num(f.elements.epsg.value)) || 0); done(); E.toast(t("trc.dem.fileDone")); }
      catch (err) { say(""); E.toast(t(["geo", "epsg", "format", "outside"].includes(err.message) ? `trc.dem.err.${err.message}` : "trc.dem.err.other", { why: err.message, where: where("georef") }), 8000); }
      file.value = "";
    });
    f.querySelector('[data-a="online"]').addEventListener("click", async () => {
      say(t("trc.dem.loading"), 0);
      try { R = await reliefReset(E, (p) => { const pr = busy.querySelector("progress"); if (pr) setBar(pr, p); }); done(); }
      catch (err) { say(""); E.toast(t("trc.dem.failedWhy", { why: err.message || String(err) }), 7000); }
    });
  } });
}

// ---- profiles ------------------------------------------------------------------------------------------------------------------
const COLOURS = ["#7c3aed", "#00a651", "#f7941d", "#0072bc", "#e0218a", "#8b5a2b"];
/** An SVG chart of profiles: lines [{ name, colour, p (profileOf's), dashed }], marks [{ d, label }] on the first line. */
function chart(lines, marks, { w = 860, h = 260 } = {}) {
  const L = 46, Rm = 12, T = 14, B = 30, len = Math.max(...lines.map((l) => l.p.len), 1);
  let lo = Math.min(...lines.map((l) => l.p.min)), hi = Math.max(...lines.map((l) => l.p.max));
  if (hi - lo < 10) { const m = (hi + lo) / 2; lo = m - 5; hi = m + 5; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const X = (d) => L + (d / len) * (w - L - Rm), Y = (z) => T + (1 - (z - lo) / (hi - lo)) * (h - T - B);
  const stepZ = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => (hi - lo) / s <= 6) || 500;
  const stepD = [50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => len / s <= 9) || 10000;
  let g = "";
  for (let z = Math.ceil(lo / stepZ) * stepZ; z <= hi; z += stepZ) g += `<line x1="${L}" x2="${w - Rm}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" class="tr-pf-grid"/><text x="${L - 6}" y="${(Y(z) + 4).toFixed(1)}" text-anchor="end" class="tr-pf-ax">${Math.round(z)}</text>`;
  for (let d = 0; d <= len + 1; d += stepD) g += `<text x="${X(d).toFixed(1)}" y="${h - 10}" text-anchor="middle" class="tr-pf-ax">${d >= 1000 || stepD >= 1000 ? `${nf(d / 1000, stepD < 1000 ? 1 : 0)} km` : `${d} m`}</text>`;
  for (const m of marks || []) g += `<line x1="${X(m.d).toFixed(1)}" x2="${X(m.d).toFixed(1)}" y1="${T}" y2="${h - B}" class="tr-pf-mark"/><text x="${X(m.d).toFixed(1)}" y="${T - 3}" text-anchor="middle" class="tr-pf-lab">${esc(m.label)}</text>`;
  lines.forEach((l, q) => {
    const pts = l.p.d.map((d, i) => `${X(d).toFixed(1)},${Y(l.p.z[i]).toFixed(1)}`).join(" ");
    if (!q) g += `<polygon points="${X(0).toFixed(1)},${h - B} ${pts} ${X(l.p.len).toFixed(1)},${h - B}" fill="${l.colour}" opacity="0.10"/>`;
    g += `<polyline points="${pts}" fill="none" stroke="${l.colour}" stroke-width="${q ? 1.6 : 2}"${l.dashed ? ' stroke-dasharray="5 4"' : ""}/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" class="tr-pf" role="img" aria-label="${esc(t("trc.dem.profile"))}">${g}<line x1="${L}" x2="${w - Rm}" y1="${h - B}" y2="${h - B}" class="tr-pf-base"/></svg>`;
}
/**
 * « Profil »: the altitude along the leg chosen — the leg as drawn and each of its routes — or, with no leg chosen, along the
 * course (the legs as drawn, and the routes where the course has some), the controls marked.
 */
export async function profileDialog(E) {
  const ev = E.ev, s = E.sel;
  const leg = s?.kind === "leg" && ev.controls[s.c1] && ev.controls[s.c2] ? s : null;
  if (!leg && !E.cd.course) { E.toast(t("trc.dem.profileNeed")); return; }
  if (!leg && M.isScore(ev, E.cd.course)) { E.toast(t("trc.dem.noLineCourse")); return; }
  const R = await reliefFor(E);
  if (!R) return;
  const lines = [], marks = [];
  let title;
  if (leg) {
    title = t("trc.dem.profileLeg", { a: ctrlName(ev, leg.c1), b: ctrlName(ev, leg.c2) });
    lines.push({ name: t("trc.dem.lineLeg"), colour: COLOURS[0], p: profileOf(R, M.legPoints(ev, leg.c1, leg.c2)) });
    M.legRouteList(ev, leg.c1, leg.c2).forEach((r, i) => lines.push({ name: r.name || t("trc.dem.lineRoute", { n: String.fromCharCode(65 + i) }), colour: COLOURS[1 + (i % 5)], p: profileOf(R, r.pts), dashed: !r.main }));
  } else {
    const cd = E.cdDraw || E.cd, seq = seqOf(ev, cd), v = E.layout?.view;
    title = t("trc.dem.profileCourse", { name: ev.courses[cd.course].name });
    const straight = [], routed = [];
    let any = false, acc = 0;
    seq.forEach((id, i) => {
      const cv = v?.controls.find((x) => x.control === id), c = ev.controls[id];
      if (i) { const a = seq[i - 1], pl = M.legPoints(ev, a, id), way = legWay(ev, a, id); straight.push(...(straight.length ? pl.slice(1) : pl)); routed.push(...(routed.length ? way.slice(1) : way)); if (ev.legs[M.findLeg(ev, a, id)]?.route?.length) any = true; acc += M.pathLength(pl) * R.mPerMm; }
      marks.push({ d: acc, label: c.kind === "start" ? "▲" : c.kind === "finish" ? "◎" : cv?.ordinal > 0 ? String(cv.ordinal) : c.code || "" });
    });
    if (straight.length < 2) { E.toast(t("trc.dem.profileNeed")); return; }
    lines.push({ name: t("trc.dem.lineLegs"), colour: COLOURS[0], p: profileOf(R, straight) });
    if (any) lines.push({ name: t("trc.dem.lineRoutes"), colour: COLOURS[1], p: profileOf(R, routed), dashed: true });
  }
  const rowsHtml = lines.map((l) => `<tr><td><i class="tr-pf-sw" style="background:${l.colour}"></i>${esc(l.name)}</td><td class="r">${nf(l.p.len)} m</td><td class="r">+${Math.round(l.p.up)} m</td><td class="r">−${Math.round(l.p.down)} m</td>
    <td class="r">${Math.round(l.p.min)} – ${Math.round(l.p.max)} m</td></tr>`).join("");
  await modal(E, { title, wide: true, ok: null, cancel: t("trc.dem.close"), body: `
    <div class="tr-pf-box">${chart(lines, leg ? [] : marks)}</div>
    <table class="tr-table"><thead><tr><th>${esc(t("trc.dem.thLine"))}</th><th class="r">${esc(t("trc.dem.thLength"))}</th><th class="r">${esc(t("trc.dem.thUp"))}</th><th class="r">${esc(t("trc.dem.thDown"))}</th><th class="r">${esc(t("trc.dem.thAlt"))}</th></tr></thead><tbody>${rowsHtml}</tbody></table>
    <p class="tr-hint">${esc(t("trc.dem.modelLine", { source: sourceName(R), step: nf(R.step, R.step < 10 ? 1 : 0) }))}${leg ? "" : ` ${esc(t("trc.dem.profileLegHint"))}`}</p>` });
}

// ---- shading and slope (the backgrounds' relief layers: tracer/backdrop.js) ----------------------------------------------------
/** The relief as an image over the map frame: "shade" (lit from the north-west, to multiply over the map) or "slope" (the
 *  steepness in colours: yellow from 10°, orange from 20°, red from 30°, purple from 40°). A canvas of nx × ny pixels. */
export function reliefImage(R, kind) {
  const { nx, ny, z } = R, c = document.createElement("canvas");
  c.width = nx; c.height = ny;
  const g = c.getContext("2d"), im = g.createImageData(nx, ny), d = im.data;
  const dx = (R.w * R.mPerMm) / (nx - 1), dy = (R.h * R.mPerMm) / (ny - 1);
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180, lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt), ex = 2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const gx = (z[j * nx + i1] - z[j * nx + i0]) / ((i1 - i0) * dx), gy = (z[j0 * nx + i] - z[j1 * nx + i]) / ((j1 - j0) * dy);     // east, north
    const o = 4 * (j * nx + i);
    if (kind === "slope") {
      const deg = (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
      const col = deg >= 40 ? [124, 58, 237, 150] : deg >= 30 ? [220, 38, 38, 140] : deg >= 20 ? [249, 115, 22, 120] : deg >= 10 ? [250, 204, 21, 95] : [0, 0, 0, 0];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3];
    } else {
      const nxv = -gx * ex, nyv = -gy * ex, nn = Math.hypot(nxv, nyv, 1);
      const v = Math.max(0, (nxv * lx + nyv * ly + lz) / nn), s = Math.round(255 * Math.min(1, 0.35 + 0.92 * v));
      d[o] = s; d[o + 1] = s; d[o + 2] = s; d[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return c;
}
void tn;
