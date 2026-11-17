// Working without the network (owner, 2026-10-15: the field, the arena): an event kept on this device opens and is edited
// offline; its saves wait in IndexedDB (idb.js « pending ») and go to the server when the network returns, with the usual
// version check (a conflict asks which version to keep). Kept per event, on the user's choice (Fichier › Travailler hors
// ligne): the event and its map are stored as the server gives them to the team, encrypted again with the event's key when
// the team encrypted it; the site's page, code, libraries and fonts are kept by a service worker (/sw.js, network first: online
// nothing changes). The copies are dropped when the user stops working offline, and at logout unless changes still wait.

import * as IDB from "./idb.js";
import * as S from "./store.js";
import { FONT_CSS } from "./fonts.js";
import { PDFLIB, FFLATE, FONTKIT, PDFJS, PDFJS_WORKER, PROJ4, FONT_PKG } from "../vendor.js";
import { t, tn } from "./lang.js";
import { provDir } from "../auth.js";
import { catalogueFiles } from "../i18n.js";

const CACHE = "ocn-offline-v1";
const enc = new TextEncoder(), dec = new TextDecoder();
const FLAG = (id) => `ocn.tr.offline.${id}`;
export const isKept = (id) => { try { return localStorage.getItem(FLAG(id)) === "1"; } catch (e) { return false; } };
const TRACER = ["actions", "appear", "calage", "descr", "dialogs", "draw", "editor", "exports", "extras", "fonts", "geo", "gif", "icons", "idb", "layout", "mapsrc", "model", "offline", "ribbon", "ribbon-data",
  "panes", "pdf", "ppen", "race", "relay", "reports", "store", "symbols", "team", "textify", "tiff",
  "vmap/geom", "vmap/georef", "vmap/map", "vmap/ocad", "vmap/ocadwrite", "vmap/oom", "vmap/oomwrite", "vmap/symdefs", "vmap/sympath", "vmap/target", "coursefiles", "ocnfile", "context", "lang",
  // the routes, the elevation model, the backgrounds' panel, the descriptions read from the map, the presets, the QR codes (2026-11-16)
  "analyzer", "routedraw", "relief", "backdrop", "autodesc", "canvases", "qr"].map((m) => new URL(`./${m}.js`, import.meta.url).href)   // (beside this module: a deploy's copy of the code has its own folder)
  .concat(["onlinemaps", "waitbar", "trace/routeplan", "trace/routechoice", "trace/routeworker", "trace/vectorroutes", "trace/terrain", "trace/contours"].map((m) => new URL(`../${m}.js`, import.meta.url).href));
const LIBS = [PDFLIB, FFLATE, FONTKIT, PDFJS, PDFJS_WORKER, PROJ4,
  `${FONT_PKG.Roboto}/files/roboto-latin-400-normal.woff`, `${FONT_PKG.Roboto}/files/roboto-latin-700-normal.woff`,
  `${FONT_PKG["Roboto Condensed"]}/files/roboto-condensed-latin-400-normal.woff`, `${FONT_PKG["Roboto Condensed"]}/files/roboto-condensed-latin-700-normal.woff`,
  ...FONT_CSS];
// (the texts: the files this build reads them from, i18n.catalogueFiles)
const CODE = [new URL("../pages/tracer.js", import.meta.url).href, ...catalogueFiles("tracer", ["tracer"])];
const PAGES = ["/", "/assets/tracer/symbols.json", "/assets/tracer/symbol-texts.json", "/assets/tracer/crs.json", "/data/fr/agenda.json"];

/** The service worker and the page's files, for opening the Tracer without the network. */
async function prepareSite() {
  if (!("serviceWorker" in navigator) || !window.caches) throw new Error(t("trc.off.noSupport"));
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });     // registered by app.js already: the same worker
  const reg = await navigator.serviceWorker.ready;
  // what this visit loaded (the site's own modules, the data it opened with), the Tracer's modules and libraries
  const loaded = performance.getEntriesByType("resource").map((e) => e.name)
    .filter((u) => { try { const x = new URL(u); return x.origin === location.origin && (x.pathname.startsWith("/assets/") || /^\/data\/(meta|runners|competitions)\.json$/.test(x.pathname)); } catch (e) { return false; } })
    .filter((u) => !u.includes("/assets/build.txt"));
  // (the provisional index this account reads: the full one or the copy without CNs)
  const urls = [...new Set([...[...PAGES, `/${provDir()}index.json`].map((p) => location.origin + p), ...TRACER, ...CODE, ...LIBS, ...loaded])];
  const c = await caches.open(CACHE);
  tell(reg, true);
  let ok = 0;
  await Promise.all(urls.map(async (u) => {
    try { const r = await fetch(u, { credentials: "same-origin", mode: u.startsWith(location.origin) ? "same-origin" : "cors" }); if (r.ok) { await c.put(u, r); ok++; } } catch (e) { /* kept when next used */ }
  }));
  return { ok, total: urls.length };
}

/** Keep (or refresh) the event's copy: its card, the team's role, the event and its map, encrypted with the event's key. */
export async function keepEvent(E) {
  const seal = async (bytes) => (E.key ? S.encryptBytes(E.key, bytes) : bytes);
  const evBytes = await seal(enc.encode(JSON.stringify(E.ev)));
  // the elevation model too (relief.js): the one in memory, else the one this copy already holds
  const prev = await IDB.get("events", E.meta.id).catch(() => null);
  const dem = E.relief ? await seal(await (await import("./relief.js")).pack(E.relief)) : prev?.dem || null;
  await IDB.put("events", E.meta.id, { meta: E.meta, role: E.role, you: E.you, version: E.version, ev: evBytes, dem, at: Date.now() });
  if (!(await IDB.get("maps", E.meta.id))) {
    const m = await S.loadMap(E.meta.id, E.key);
    if (m) await IDB.put("maps", E.meta.id, { bytes: await seal(m.bytes), type: m.type });
  }
}
/** The copy kept on this device: { meta, role, you, version, ev, map: { bytes, type } } (decrypted with the key), or null. */
export async function localEvent(id, key) {
  const rec = await IDB.get("events", id);
  if (!rec) return null;
  const open = async (bytes) => (S.isEncrypted(bytes) ? (key ? S.decryptBytes(key, bytes) : null) : bytes);
  const evBytes = await open(rec.ev);
  if (!evBytes) return { ...rec, locked: true };
  const pend = await IDB.get("pending", id);
  const map = await IDB.get("maps", id);
  const pendBytes = pend ? await open(pend.ev) : null;
  const ev = JSON.parse(dec.decode(pendBytes || evBytes));
  return { ...rec, ev, map: map ? { bytes: await open(map.bytes), type: map.type } : null, dem: rec.dem ? await open(rec.dem) : null, pending: !!pend, baseVersion: pend?.baseVersion ?? rec.version };
}
/** Events kept on this device (cards only). */
export async function keptEvents() {
  const ids = await IDB.keys("events");
  const out = [];
  for (const id of ids) { const r = await IDB.get("events", id); if (r) out.push({ ...r.meta, pending: !!(await IDB.get("pending", id)) }); }
  return out;
}
/** A save that could not reach the server: kept here until it can. */
export async function savePending(E, ev, baseVersion) {
  const bytes = enc.encode(JSON.stringify(ev));
  await IDB.put("pending", E.meta.id, { ev: E.key ? await S.encryptBytes(E.key, bytes) : bytes, baseVersion, at: Date.now() });
}
export async function pendingOf(id, key) {
  const p = await IDB.get("pending", id);
  if (!p) return null;
  const bytes = S.isEncrypted(p.ev) ? (key ? await S.decryptBytes(key, p.ev) : null) : p.ev;
  return bytes ? { ev: JSON.parse(dec.decode(bytes)), baseVersion: p.baseVersion, at: p.at } : null;
}
export const clearPending = (id) => IDB.del("pending", id);

/** Fichier › Travailler hors ligne. */
export async function offlineDialog(E) {
  const { modal } = await import("./dialogs.js");
  const kept = isKept(E.meta.id);
  const v = await modal(E, { title: t("trc.off.title"), ok: kept ? t("trc.off.stopKeeping") : t("trc.off.keep"), body: kept
    ? `<p>${t("trc.off.keptBody")}</p>
      <p class="tr-hint">${t("trc.off.keptHint")}</p>`
    : `<p>${t("trc.off.keepBody")}</p>
      <p class="tr-hint">${t("trc.off.keepHint")}${E.key ? ` ${t("trc.off.encrypted")}` : ""}</p>` });
  if (!v) return;
  if (kept) {
    try { localStorage.removeItem(FLAG(E.meta.id)); } catch (e) { /* not kept */ }
    await IDB.del("events", E.meta.id); await IDB.del("maps", E.meta.id);
    await dropSiteIfUnused();
    E.toast(t("trc.off.dropped"));
    return;
  }
  E.status(t("trc.off.preparing"), "busy");
  try {
    const site = await prepareSite();
    await keepEvent(E);
    try { localStorage.setItem(FLAG(E.meta.id), "1"); } catch (e) { /* the copy stays, the flag not */ }
    E.status(t("trc.off.ready"), "ok");
    E.toast(tn("trc.off.kept", site.ok), 7000);
  } catch (err) {
    E.status(t("trc.off.ready"), "ok");
    E.toast(t("trc.off.failed", { err: err.message }), 7000);
  }
}
/** The service worker told whether the copy exists (it copies what passes only then). */
function tell(reg, on) { try { (reg?.active || navigator.serviceWorker?.controller)?.postMessage({ type: "ocn-offline", on }); } catch (e) { /* it reads the cache itself when it starts */ } }
/** No event kept any more: the copy of the site goes too (the worker stays: app.js registers it for the installed app). */
async function dropSiteIfUnused() {
  if ((await IDB.keys("events")).length) return;
  try { if (window.caches) await caches.delete(CACHE); } catch (e) { /* none */ }
  try { tell(await navigator.serviceWorker?.getRegistration("/"), false); } catch (e) { /* none */ }
}
/** An event deleted: its copy on this device goes, its waiting changes too. */
export async function dropEvent(id) {
  for (const store of ["events", "maps", "pending"]) await IDB.del(store, id).catch(() => {});
  try { localStorage.removeItem(FLAG(id)); } catch (e) { /* none */ }
  await dropSiteIfUnused();
}
/** At logout: the copies go, except those whose changes still wait for the network. */
export async function dropCopies() {
  try {
    for (const id of await IDB.keys("events")) {
      if (await IDB.get("pending", id)) continue;
      await IDB.del("events", id); await IDB.del("maps", id);
      try { localStorage.removeItem(FLAG(id)); } catch (e) { /* none */ }
    }
    await dropSiteIfUnused();
  } catch (e) { /* nothing kept */ }
}
