// Cartographier in the field (« Terrain »): the phone's or tablet's GPS on the map (its accuracy as a circle), the map following
// it, its track recorded and kept as a background, the map turned to the compass, photos and notes pinned where they were taken,
// and the map kept on this device to work without the network (IndexedDB « ocn-mapper »: the document, its OCAD source and its
// backgrounds; saves made offline wait there and go when the network returns, with the usual version check).

import * as S from "./store.js";
import { modal, field } from "../tracer/dialogs.js";
import { t, locale } from "./lang.js";
import { catalogueFiles } from "../i18n.js";

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
  "data/frame", "data/contours", "data/osm", "data/lidar"].map((m) => new URL(`./${m}.js`, import.meta.url).href);   // (beside this module: a deploy's copy of the code has its own folder)
/** The site's files this page needs, kept by the service worker (network first: online nothing changes). */
async function prepareSite() {
  if (!("serviceWorker" in navigator) || !window.caches) throw new Error(t("map.off.noSupport"));
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const reg = await navigator.serviceWorker.ready;
  const loaded = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => { try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith("/assets/"); } catch (e) { return false; } });
  const urls = [...new Set([location.origin + "/", new URL("../pages/mapper.js", import.meta.url).href, ...MODULES, ...catalogueFiles("mapper", ["mapper", "tracer"]), ...loaded])];
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
const dist = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
const ORIENT = typeof window !== "undefined" && "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
function fieldOf(E) {
  if (E.field) return E.field;
  const F = E.field = { on: false, follow: false, recording: false, pos: null, ll: null, acc: 0, track: [], length: 0, watch: null, heading: null };
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
  /** What shows the GPS's state: « Ma position » over the zoom buttons, its line in the status bar (the accuracy, the length
   *  recorded: no message at each position — owner, 2026-11-17), and, when the state itself changes, the ribbon's buttons. */
  F.sync = () => {
    const b = E.$("#mp-locate");
    if (b) { b.setAttribute("aria-pressed", String(F.on)); b.classList.toggle("follow", F.on && F.follow); }
    const el = E.$("#mp-gps");
    if (el) {
      el.hidden = !F.on; el.classList.toggle("rec", F.recording);
      el.textContent = !F.on ? "" : !F.pos ? t("map.field.waiting") : t("map.field.gps", { m: Math.round(F.acc) }) + (F.recording ? ` · ● ${dist(F.length)}` : "");
    }
    const sig = `${F.on}${F.follow}${F.recording}${!!F.onOrient}`;
    if (sig !== F.sig) { F.sig = sig; E.status?.(); E.ribbon?.draw(); }
    E.view.overlay();
  };
  // the screen kept on while the position is shown: a phone that sleeps stops giving it
  F.awake = async () => { try { F.wake = (await navigator.wakeLock?.request("screen")) || null; } catch (e) { F.wake = null; } };
  F.onVisible = () => { if (F.on && document.visibilityState === "visible") F.awake(); };
  F.stop = () => {
    if (F.watch != null) navigator.geolocation.clearWatch(F.watch);
    F.watch = null; F.on = false; F.follow = false; F.pos = null;
    F.wake?.release?.().catch(() => {}); F.wake = null;
    document.removeEventListener("visibilitychange", F.onVisible);
    F.sync();
  };
  /** The editor closes: a track being recorded is kept, the GPS and the compass let go. */
  F.close = async () => { if (F.recording) await track(E).catch(() => {}); F.stop(); northOff(E); };
  return F;
}
/** How far a position is from what the map draws, in metres on the ground (0: on it, or the map is still empty). */
function offMap(E, at) {
  if (!E.doc.objects.length) return 0;
  const b = E.live.bounds(), dx = Math.max(b[0] - at[0], 0, at[0] - b[2]), dy = Math.max(b[1] - at[1], 0, at[1] - b[3]);
  return (Math.hypot(dx, dy) * E.doc.scale) / 1000;
}
async function gps(E) {
  const F = fieldOf(E);
  if (F.on) { if (F.recording) await track(E); F.stop(); return; }
  if (!E.frame?.geo) { E.say(t("map.field.needGeo"), "bad"); return; }
  if (!navigator.geolocation) { E.say(t("map.field.noGps"), "bad"); return; }
  F.on = true; F.follow = true; F.pos = null;
  F.awake(); document.addEventListener("visibilitychange", F.onVisible);
  F.sync();
  F.watch = navigator.geolocation.watchPosition((p) => {
    const { latitude: lat, longitude: lon, accuracy } = p.coords;
    let at; try { at = E.frame.fromLatLon(lat, lon); } catch (e) { return; }
    const first = !F.pos;
    F.pos = at; F.ll = [lat, lon]; F.acc = accuracy || 0;
    // the track: a point when one has moved (2 m, and not within the position's own uncertainty: standing still draws no knot)
    if (F.recording && F.acc <= 60) {
      const l = F.track[F.track.length - 1], d = l ? (Math.hypot(at[0] - l[0], at[1] - l[1]) * E.doc.scale) / 1000 : Infinity;
      if (d >= Math.max(2, Math.min(F.acc / 2, 8))) { if (l) F.length += d; F.track.push([at[0], at[1], Date.now(), lat, lon]); }
    }
    // a position off the map: said once, and the view stays on the map
    if (first) { const far = offMap(E, at); if (far > 30) { F.follow = false; E.say(t("map.field.outside", { d: dist(far) })); } }
    if (F.follow) E.view.centreOn(...at);
    F.sync();
  }, (err) => {
    // refused: nothing more will come. No position for now (under trees, indoors): the watch goes on
    if (err.code === 1) { E.say(t("map.field.denied"), "bad"); F.stop(); } else if (!F.pos) E.say(t("map.field.noFix"), "bad");
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
}
/** « Ma position », over the zoom buttons: shows it and follows it; a view moved since comes back to it; else lets it go. */
async function locate(E) {
  const F = fieldOf(E);
  if (!F.on) return gps(E);
  if (!F.follow) { F.follow = true; if (F.pos) E.view.centreOn(...F.pos); F.sync(); return; }
  if (F.recording) { E.say(t("map.field.recBusy")); return; }
  return gps(E);
}
function northOff(E) {
  const F = E.field;
  if (!F?.onOrient) return;
  window.removeEventListener(ORIENT, F.onOrient, true); F.onOrient = null; clearTimeout(F.orientWait);
  E.view.rot = 0; E.view.changedView(); E.view.clearTiles(); F.sync();
}
async function north(E) {
  const F = fieldOf(E);
  if (F.onOrient) { northOff(E); return; }
  if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) { try { if (await DeviceOrientationEvent.requestPermission() !== "granted") { E.say(t("map.field.noCompass"), "bad"); return; } } catch (e) { /* not asked */ } }
  let got = false;
  F.onOrient = (ev) => {
    // iOS gives the compass heading itself; elsewhere the absolute orientation's alpha (Android: « deviceorientationabsolute »)
    const h = ev.webkitCompassHeading ?? (ev.absolute && ev.alpha != null ? 360 - ev.alpha : null);
    if (h == null) return;
    got = true;
    const decl = E.doc.declination || 0, grid = E.doc.realWorld?.angle || 0;
    // the map turned so that the direction the device faces is up (magnetic heading → the map's north)
    const want = ((h + decl - grid) * Math.PI) / 180;
    if (Math.abs(want - E.view.rot) > 0.03) { E.view.rot = want; E.view.changedView(); }
  };
  window.addEventListener(ORIENT, F.onOrient, true);
  // a device without a compass says nothing: not left pressed for nothing
  F.orientWait = setTimeout(() => { if (F.onOrient && !got) { northOff(E); E.say(t("map.field.noCompass"), "bad"); } }, 4000);
  F.sync();
}
async function track(E) {
  const F = fieldOf(E);
  if (!F.recording) {
    if (!F.on) { await gps(E); if (!F.on) return; }
    F.recording = true; F.length = 0; F.track = F.pos && F.ll ? [[F.pos[0], F.pos[1], Date.now(), F.ll[0], F.ll[1]]] : [];
    E.say(t("map.field.recording")); F.sync(); return;
  }
  F.recording = false;
  if (F.track.length < 2) { F.track = []; E.say(t("map.field.trackShort")); F.sync(); return; }
  // kept as a GPX background
  const gpx = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Ozimut" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(t("map.field.trackName"))}</name><trkseg>${F.track.map(([, , ms, la, lo]) => `<trkpt lat="${la}" lon="${lo}"><time>${new Date(ms).toISOString()}</time></trkpt>`).join("")}</trkseg></trk></gpx>`;
  const file = new File([gpx], `${t("map.field.trackName")} ${new Date().toISOString().slice(0, 16).replace("T", " ")}.gpx`, { type: "application/gpx+xml" });
  const kept = dist(F.length);
  const B = await import("./backgrounds.js"); await B.addFiles(E, [file]);
  F.track = []; F.sync();
  E.say(t("map.field.trackKept", { d: kept }));
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
  const url = URL.createObjectURL(blob);
  try { await addComment(E, at, { photo: pid }, url); } finally { URL.revokeObjectURL(url); }
}
async function addComment(E, at, extra = {}, preview = "") {
  const v = await modal(E, { title: t("map.comment.title"), ok: t("map.ok.add"),
    body: (preview ? `<p><img src="${preview}" alt="" class="mp-photo"></p>` : "") + field(t("map.comment.text"), `<textarea name="text" rows="3" maxlength="1000"></textarea>`) });
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
  const back = () => { E.tool = prev.tool; E.toolName = prev.name; E.say(""); E.status?.(); };
  E.tool = { name: "comment", cursor: "crosshair", down: (ev, p) => { back(); addComment(E, p); },
    key: (ev) => { if (ev.key === "Escape") { back(); return true; } return false; },
    touch: () => [{ k: "cancel", icon: "close", label: t("map.touch.cancel") }], touchDo: back };
  E.status?.();
}

export async function act(E, act) {
  if (act === "gps") return gps(E);
  if (act === "locate") return locate(E);
  if (act === "gps-follow") { const F = fieldOf(E); if (!F.on) return gps(E); F.follow = !F.follow; if (F.follow && F.pos) E.view.centreOn(...F.pos); F.sync(); return; }
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
