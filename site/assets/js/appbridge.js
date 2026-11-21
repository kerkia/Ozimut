// The Ozimut app (Android and iPhone, track/android, track/ios): a native shell whose web view loads this site, with the GPS
// tracker beside it (docs/track/design.md « The site ↔ app bridge »). In a browser everything here answers « not in the app ».
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

/** Native → site events (`file`, `tracker`, `push`). -> a function that stops listening */
export function on(type, fn) {
  const h = (e) => { if (!type || e.detail?.type === type) fn(e.detail); };
  window.addEventListener("ozimut-app", h);
  return () => window.removeEventListener("ozimut-app", h);
}

/** Once at start: files opened with the app go to « Analyse solo » as the PWA's inbox does; a notification's link is followed. */
export function boot() {
  if (!UA) return;
  on("file", async (d) => {
    try {
      const bytes = Uint8Array.from(atob(d.data || ""), (c) => c.charCodeAt(0));
      const { toSolo } = await import("./pwa.js");
      await toSolo([new File([bytes], d.name || "trace.gpx", { type: d.mime || "application/octet-stream" })]);
    } catch (e) { /* not a file the analyses read */ }
  });
  on("push", (d) => { if (d?.url && /^\/?#\//.test(d.url)) location.hash = d.url.replace(/^\/?/, "").slice(1); });
  // the notifications by the app itself once it is paired to an account (the native side asks the permission once)
  info().then((i) => i?.paired && call("pushRegister", {}, { timeout: 20000 })).catch(() => {});
}
