// The Ozimut app (Android and iPhone, app/android, app/ios; the contract: docs/app/design.md): a native shell whose web view
// loads this site, plus what a page cannot do — native notifications, files opened with or shared to the app, the document
// scanner, the watch's routes from Apple Health, saving a file. A companion: it never shows an invitation to buy (offers.js),
// creates and deletes no account, and its settings are the phone's only. In a browser everything here answers « not in the app ».
// Android exposes window.OzimutNative.call(id, name, argsJson); iOS window.webkit.messageHandlers.ozimut.postMessage({ id,
// name, args }); both answer through window.__ozApp.resolve(id, json) / reject(id, message), and send their own events through
// window.__ozApp.event({ type, … }), which this module turns into CustomEvent("ozimut-app", { detail }).

const UA = /OzimutApp\/([\d.]+)\s*\((android|ios)\)/i.exec(navigator.userAgent);
/** In the Ozimut app? -> { version, platform } or null */
export const inApp = () => (UA ? { version: UA[1], platform: UA[2].toLowerCase() } : null);

let seq = 0;
const waiting = new Map();
if (UA && !window.__ozApp) {
  window.__ozApp = {
    resolve(id, value) {
      const w = waiting.get(id);
      if (!w) return;
      waiting.delete(id);
      let v = value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { /* a plain string */ } }
      w.ok(v);
    },
    reject(id, message) { const w = waiting.get(id); if (w) { waiting.delete(id); w.ko(new Error(String(message || "app"))); } },
    event(e) {
      let d = e;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (x) { return; } }
      window.dispatchEvent(new CustomEvent("ozimut-app", { detail: d }));
    },
  };
}

/** A call to the native side. -> a promise of its answer (rejected outside the app or after `timeout` ms). */
export function call(name, args = {}, { timeout = 60000 } = {}) {
  if (!UA) return Promise.reject(new Error("not in app"));
  const id = `c${++seq}`;
  return new Promise((ok, ko) => {
    waiting.set(id, { ok, ko });
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); ko(new Error("timeout")); } }, timeout);
    try {
      if (window.OzimutNative?.call) window.OzimutNative.call(id, name, JSON.stringify(args));
      else if (window.webkit?.messageHandlers?.ozimut) window.webkit.messageHandlers.ozimut.postMessage({ id, name, args });
      else { waiting.delete(id); ko(new Error("no bridge")); }
    } catch (e) { waiting.delete(id); ko(e); }
  });
}

/** The app's description (features, pairing), or null in a browser. */
let infoP = null;
export const info = () => (UA ? (infoP ||= call("info", {}, { timeout: 5000 }).catch(() => (infoP = null))) : Promise.resolve(null));
export const has = async (feature) => !!(await info())?.features?.includes(feature);

/** Native → site events (`files`, `push`). -> a function that stops listening */
export function on(type, fn) {
  const h = (e) => { if (!type || e.detail?.type === type) fn(e.detail); };
  window.addEventListener("ozimut-app", h);
  return () => window.removeEventListener("ozimut-app", h);
}

/** A text's key in the app: `<key>.app` (the wording without « créez un compte »), the key itself in a browser. */
export const appKey = (key) => (UA ? `${key}.app` : key);

const fromB64 = (s) => Uint8Array.from(atob(s || ""), (c) => c.charCodeAt(0));
const toB64 = async (blob) => {
  const b = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(out);
};
/** A file the shell handed over ({ name, mime, data }) as a File. */
export const asFile = (d, fallback = "file") => new File([fromB64(d.data)], d.name || fallback, { type: d.mime || "application/octet-stream" });

/** A file the site makes, handed to the shell's share / save sheet (a web view ignores download links). -> true when handed */
export async function saveFile(name, blob) {
  if (!UA) return false;
  try { return !!(await call("saveFile", { name: name || "ozimut", mime: blob.type || "application/octet-stream", data: await toB64(blob) }, { timeout: 120000 }))?.ok; }
  catch (e) { return false; }
}
// Every export of the site is an <a download> clicked by code, on a blob: or data: address: caught here, once, for all of them.
function catchDownloads() {
  const take = (a) => {
    const href = a.getAttribute("href") || "";
    if (!a.hasAttribute("download") || !/^(blob|data):/.test(href)) return false;
    fetch(href).then((r) => r.blob()).then((b) => saveFile(a.getAttribute("download") || "ozimut", b)).catch(() => {});
    return true;
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (!take(this)) click.call(this); };
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[download]");
    if (a && e.isTrusted && take(a)) e.preventDefault();
  }, true);
}

/** The system's document scanner on the map (edges found, page straightened). -> a File, or null when given up */
export async function scanMap() {
  const d = await call("scanMap", {}, { timeout: 600000 });
  return d?.data ? asFile(d, "carte.jpg") : null;
}

if (UA) document.documentElement.classList.add("in-app", `in-app-${UA[2].toLowerCase()}`);

/** Once at start: files opened with or shared to the app go to « Analyse solo » as the PWA's inbox does; a notification's
 *  link is followed; the site's exports go to the shell. */
export function boot() {
  if (!UA) return;
  catchDownloads();
  const take = async (list) => {
    try {
      const { toSolo } = await import("./pwa.js");
      await toSolo(list.map((d) => asFile(d, "trace.gpx")));
    } catch (e) { /* not files the analyses read */ }
  };
  on("files", (d) => take(d.files || []));
  on("file", (d) => take([d]));                    // (a shell of before the contract's `files`)
  on("push", (d) => { if (d?.url && /^\/?#\//.test(d.url)) location.hash = d.url.replace(/^\/?/, "").slice(1); });
  info().catch(() => {});                          // « the page is ready »: the shell then sends what started it
}
