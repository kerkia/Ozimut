// Cartographier in the field (« Terrain »): the phone's or tablet's GPS on the map (its accuracy as a circle), the map following
// it, its track recorded and kept as a background, the map turned to the compass, photos and notes pinned where they were taken,
// and the map kept on this device to work without the network (IndexedDB « ocn-mapper »: the document, its OCAD source and its
// backgrounds; saves made offline wait there and go when the network returns, with the usual version check).

import * as S from "./store.js";
import { modal, field } from "../tracer/dialogs.js";
import { t, tn } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---- this device's copies ---------------------------------------------------------------------------------------------------------
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open("ocn-mapper", 1);
    r.onupgradeneeded = () => { for (const s of ["maps", "pending", "photos"]) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const x = d.transaction(store, mode), s = x.objectStore(store); let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; }; x.oncomplete = () => res(out); x.onerror = x.onabort = () => rej(x.error); }); };
export const idbGet = (s, k) => tx(s, "readonly", (o) => o.get(k)).catch(() => undefined);
export const idbPut = (s, k, v) => tx(s, "readwrite", (o) => o.put(v, k));
export const idbDel = (s, k) => tx(s, "readwrite", (o) => o.delete(k)).catch(() => {});
export const idbKeys = (s) => tx(s, "readonly", (o) => o.getAllKeys()).catch(() => []);

const MODULES = ["doc", "editor", "geom", "view", "tools", "ribbon", "panels", "store", "boolean", "backgrounds", "dataui", "field", "checks", "layout", "io", "team", "lang", "ocadout", "fromomap", "toomap",
  "data/frame", "data/contours", "data/osm", "data/lidar"].map((m) => `/assets/js/mapper/${m}.js`);
/** The site's files this page needs, kept by the service worker (network first: online nothing changes). */
async function prepareSite() {
  if (!("serviceWorker" in navigator) || !window.caches) throw new Error(t("map.off.noSupport"));
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith("/assets/"); } catch (e) { return false; } });
  const urls = [...new Set([location.origin + "/", location.origin + "/assets/js/pages/mapper.js", ...MODULES.map((p) => location.origin + p), ...["fr", "en", "de", "es"].map((l) => `${location.origin}/assets/js/i18n/mapper.${l}.js`), ...loaded])];
  const c = await caches.open("ocn-offline-v1");
  (reg.active || navigator.serviceWorker.controller)?.postMessage({ type: "ocn-offline", on: true });
  await Promise.all(urls.map(async (u) => { try { const r = await fetch(u, { credentials: "same-origin" }); if (r.ok) await c.put(u, r); } catch (e) { /* later */ } }));
}
export async function keepMap(E) {
  await prepareSite();
  await idbPut("maps", E.id, { card: E.card, role: E.role, doc: E.live.toJSON(), version: E.version, source: E.source, files: await filesOf(E), at: Date.now() });
  try { localStorage.setItem(`ocn.mp.offline.${E.id}`, "1"); } catch (e) { /* the copy stays */ }
}
async function filesOf(E) {
  const out = {};
  for (const b of E.doc.backgrounds || []) if (b.file) { const f = E.files[b.file] || (await S.loadFile(E.id, b.file).catch(() => null)); if (f) out[b.file] = f; }
  return out;
}
export const keptMap = (id) => idbGet("maps", id);
export const isKept = (id) => { try { return localStorage.getItem(`ocn.mp.offline.${id}`) === "1"; } catch (e) { return false; } };
export async function savePending(E) { await idbPut("pending", E.id, { doc: E.live.toJSON(), base: E.version, at: Date.now() }); }
export const pendingOf = (id) => idbGet("pending", id);
export const clearPending = (id) => idbDel("pending", id);
export async function keptMaps() { const ks = await idbKeys("maps"); const out = []; for (const k of ks) { const m = await idbGet("maps", k); if (m) out.push({ id: k, title: m.card?.title || m.doc?.title || "", at: m.at, offline: true }); } return out; }

// ---- the GPS -------------------------------------------------------------------------------------------------------------------------
function fieldOf(E) {
  if (E.field) return E.field;
  const F = E.field = { on: false, follow: false, recording: false, pos: null, acc: 0, track: [], watch: null, heading: null };
  F.overlay = (g) => {
    const m = E.view.matrix(), dpr = E.view.dpr;
    if (F.track.length > 1) {
      g.beginPath(); F.track.forEach(([x, y], i) => (i ? g.lineTo(m.x(x, y), m.y(x, y)) : g.moveTo(m.x(x, y), m.y(x, y))));
      g.strokeStyle = "rgba(229,0,126,.85)"; g.lineWidth = 2.5 * dpr; g.stroke();
    }
    if (!F.pos) return;
    const px = m.x(...F.pos), py = m.y(...F.pos), r = Math.max(6 * dpr, (F.acc * 1000 / E.doc.scale) * E.view.k);
    g.beginPath(); g.arc(px, py, r, 0, 7); g.fillStyle = "rgba(21,101,192,.15)"; g.fill(); g.strokeStyle = "rgba(21,101,192,.6)"; g.lineWidth = dpr; g.stroke();
    g.beginPath(); g.arc(px, py, 7 * dpr, 0, 7); g.fillStyle = "#1565c0"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2.5 * dpr; g.stroke();
  };
  F.stop = () => { if (F.watch != null) navigator.geolocation.clearWatch(F.watch); F.watch = null; F.on = false; window.removeEventListener("deviceorientation", F.onOrient, true); };
  return F;
}
async function gps(E) {
  const F = fieldOf(E);
  if (F.on) { F.stop(); E.view.overlay(); return; }
  if (!E.frame?.geo) { E.say(t("map.field.needGeo"), "bad"); return; }
  if (!navigator.geolocation) { E.say(t("map.field.noGps"), "bad"); return; }
  F.on = true; F.follow = true;
  E.say(t("map.field.waiting"), "busy");
  F.watch = navigator.geolocation.watchPosition((p) => {
    const { latitude: lat, longitude: lon, accuracy } = p.coords;
    try { F.pos = E.frame.fromLatLon(lat, lon); } catch (e) { return; }
    F.acc = accuracy || 0;
    if (F.recording) F.track.push([...F.pos, Date.now(), lat, lon]);
    if (F.follow) E.view.centreOn(...F.pos); else E.view.overlay();
    E.say(t("map.field.acc", { m: Math.round(F.acc) }));
  }, (err) => { E.say(err.code === 1 ? t("map.field.denied") : t("map.field.noFix"), "bad"); F.stop(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
}
async function north(E) {
  const F = fieldOf(E);
  if (F.onOrient) { window.removeEventListener("deviceorientation", F.onOrient, true); F.onOrient = null; E.view.rot = 0; E.view.changedView(); E.view.clearTiles(); return; }
  if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) { try { if (await DeviceOrientationEvent.requestPermission() !== "granted") { E.say(t("map.field.noCompass"), "bad"); return; } } catch (e) { /* not asked */ } }
  F.onOrient = (ev) => {
    const h = ev.webkitCompassHeading ?? (ev.absolute && ev.alpha != null ? 360 - ev.alpha : null);
    if (h == null) return;
    const decl = E.doc.declination || 0, grid = E.doc.realWorld?.angle || 0;
    // the map turned so that the direction the device faces is up (magnetic heading → the map's north)
    const want = ((h + decl - grid) * Math.PI) / 180;
    if (Math.abs(want - E.view.rot) > 0.03) { E.view.rot = want; E.view.changedView(); }
  };
  window.addEventListener("deviceorientation", F.onOrient, true);
}
async function track(E) {
  const F = fieldOf(E);
  if (!F.recording) { if (!F.on) await gps(E); F.recording = true; F.track = []; E.say(t("map.field.recording")); return; }
  F.recording = false;
  if (F.track.length < 2) { E.say(t("map.field.trackShort")); return; }
  // kept as a GPX background
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Ozimut" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(t("map.field.trackName"))}</name><trkseg>${F.track.map(([, , ms, la, lo]) => `<trkpt lat="${la}" lon="${lo}"><time>${new Date(ms).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
  const file = new File([gpx], `${t("map.field.trackName")} ${new Date().toISOString().slice(0, 16).replace("T", " ")}.gpx`, { type: "application/gpx+xml" });
  const B = await import("./backgrounds.js"); await B.addFiles(E, [file]);
  F.track = []; E.view.overlay();
}

// ---- photos and notes pinned on the map -----------------------------------------------------------------------------------------
async function photo(E) {
  const i = document.createElement("input"); i.type = "file"; i.accept = "image/*"; i.capture = "environment";
  const f = await new Promise((res) => { i.onchange = () => res(i.files[0] || null); i.click(); });
  if (!f) return;
  const im = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(im.width, im.height));
  const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
  const pid = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const at = E.field?.pos || [E.view.cx, E.view.cy];
  try { await S.savePhoto(E.id, pid, blob); } catch (e) { await idbPut("photos", `${E.id}:${pid}`, blob); }
  await addComment(E, at, { photo: pid });
}
async function addComment(E, at, extra = {}) {
  const v = await modal(E, { title: t("map.comment.title"), ok: t("map.ok.add"), body: field(t("map.comment.text"), `<textarea name="text" rows="3" maxlength="1000"></textarea>`) });
  if (!v && !extra.photo) return;
  const list = await S.comments(E.id).catch(() => E.comments || []);
  list.push({ id: `c${Date.now().toString(36)}`, x: at[0], y: at[1], text: v?.text || "", by: E.you?.name || "", at: new Date().toISOString(), done: false, ...extra });
  E.comments = list;
  await S.saveComments(E.id, list).catch(() => E.say(t("map.comment.later"), "bad"));
  E.view.overlay();
}
function pickComment(E) {
  E.say(t("map.comment.where"));
  const prev = { tool: E.tool, name: E.toolName };
  E.tool = { name: "comment", cursor: "crosshair", down: (ev, p) => { E.tool = prev.tool; E.toolName = prev.name; addComment(E, p); } };
}

export async function act(E, act) {
  if (act === "gps") return gps(E);
  if (act === "gps-follow") { const F = fieldOf(E); F.follow = !F.follow; if (F.follow && F.pos) E.view.centreOn(...F.pos); return; }
  if (act === "gps-track") return track(E);
  if (act === "gps-north") return north(E);
  if (act === "photo") return photo(E);
  if (act === "comment") return pickComment(E);
  if (act === "offline") {
    if (!E.id) { E.say(t("map.why.notSaved"), "bad"); return; }
    E.say(t("map.off.preparing"), "busy");
    try { await keepMap(E); E.say(t("map.off.kept")); } catch (e) { E.say(e.message, "bad"); }
  }
}
