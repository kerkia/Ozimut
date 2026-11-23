// Push notifications on this device (owner, 2026-10-18: a runner's start time on their phone as soon as the start list is
// published, on by default; then every alert of Réglages by e-mail, push or both, push open to everyone). The account's
// choices are users.push_* (Réglages › Alertes); each
// device must still allow notifications, which a browser asks only after a click: `offer` shows a small card once
// (again 14 days after « Plus tard ») while the device has not answered. The worker is /sw-push.js on its own scope; the
// server side is functions/api/push and functions/_lib/push.js. iPhones and iPads receive notifications only from the site
// added to the home screen (Safari › Partager › Sur l'écran d'accueil), opened from its icon.

import { html } from "./util.js";
import { t } from "./i18n.js";
import * as auth from "./auth.js";
import { inApp, call } from "./appbridge.js";

const SCOPE = "/push/";
const SNOOZE = "ocn.push.later";                 // localStorage: the card not offered again before this time
const SYNCED = "ocn.push.synced";
const NATIVE = "ocn.push.native";               // localStorage, in the Ozimut app: the device's token as the server holds it                // sessionStorage: this device's subscription sent to the server this visit

export const supported = () => !!inApp() || webPush();
const webPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
export const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

let config = null;
/** { ready, key, devices, enabled } from the server, or null (signed out, or no server). */
export async function getConfig(force = false) {
  if (config && !force) return config;
  try {
    const r = await fetch("api/push", { credentials: "same-origin", cache: "no-store" });
    config = r.ok ? await r.json() : null;
  } catch (e) {
    config = null;
  }
  return config;
}

const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const sameKey = (a, b) => !!a && !!b && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

/** A short name for this device, kept beside its subscription (« Chrome · Android »). */
function label() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /Android/.test(ua) ? "Android" : isIos() ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

/** The worker, registered and active (a subscription needs an active worker). */
async function worker() {
  const reg = await navigator.serviceWorker.register("/sw-push.js", { scope: SCOPE });
  if (reg.active) return reg;
  const w = reg.installing || reg.waiting;
  await new Promise((res) => {
    const done = () => { if (w.state === "activated") res(); };
    w.addEventListener("statechange", done);
    done();
    setTimeout(res, 8000);
  });
  return reg;
}

/** This device's subscription (made or renewed with the site's key), sent to the server. -> true when done. */
async function subscribe(cfg) {
  const reg = await worker();
  const key = keyBytes(cfg.key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }   // the site's key changed
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const res = await auth.api("api/push/subscribe", { subscription: sub.toJSON(), label: label() });
  if (res.ok) { try { sessionStorage.setItem(SYNCED, "1"); } catch (e) { /* once more next time */ } }
  return res.ok;
}

/** What this device does: "unsupported", "ios-install" (an iPhone outside the home screen app), "off-server" (the
 *  site has no keys yet), "denied", "on" or "off". */
// ---- the Ozimut app (docs/app/design.md « Native notifications »): the shell asks the system and gives the device's token,
// this page sends it to the server with its session ----
const nativeToken = () => { try { return localStorage.getItem(NATIVE) || ""; } catch (e) { return ""; } };
const systemState = async () => { try { return (await call("pushState", {}, { timeout: 8000 }))?.state || "unavailable"; } catch (e) { return "unavailable"; } };
async function nativeState() {
  const cfg = await getConfig();
  if (!cfg?.native) return "off-server";
  const st = await systemState();
  return st === "unavailable" ? "unsupported" : st === "denied" ? "denied" : st === "on" && nativeToken() ? "on" : "off";
}
/** The system asked (once), the token sent to the server. -> true when this device now receives the account's notifications */
async function nativeRegister() {
  const r = await call("pushRegister", {}, { timeout: 120000 }).catch(() => null);
  if (!r?.ok || !r.token) return false;
  const res = await auth.api("api/push/native", { kind: r.kind, token: r.token, env: r.env || "prod", label: `Ozimut · ${inApp().platform === "ios" ? "iPhone" : "Android"}` });
  if (!res.ok) return false;
  try { localStorage.setItem(NATIVE, r.token); sessionStorage.setItem(SYNCED, "1"); } catch (e) { /* asked again next visit */ }
  return true;
}
async function nativeOff() {
  const token = nativeToken();
  if (token) await auth.api("api/push/native-off", { token }).catch(() => {});
  await call("pushOff", {}, { timeout: 8000 }).catch(() => {});      // the shell forgets its token too (a shell without the call: nothing)
  try { localStorage.removeItem(NATIVE); sessionStorage.removeItem(SYNCED); } catch (e) { /* none */ }
}

export async function deviceState() {
  if (inApp()) return nativeState();
  if (!supported()) return isIos() && !standalone() ? "ios-install" : "unsupported";
  const cfg = await getConfig();
  if (!cfg?.ready) return "off-server";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  const sub = reg && (await reg.pushManager.getSubscription());
  return Notification.permission === "granted" && sub ? "on" : "off";
}

/** Ask the browser (after a click), then subscribe this device. -> the new state. */
export async function enable() {
  if (inApp()) { await nativeRegister(); await getConfig(true); return nativeState(); }
  const cfg = await getConfig();
  if (!supported() || !cfg?.ready) return deviceState();
  const p = await Notification.requestPermission();
  if (p !== "granted") return deviceState();
  try { await subscribe(cfg); } catch (e) { console.warn("push", e); }
  await getConfig(true);
  return deviceState();
}

/** This device no longer receives notifications (Réglages, and at logout). */
export async function disable() {
  if (inApp()) { await nativeOff(); config = null; return; }
  try {
    const reg = supported() ? await navigator.serviceWorker.getRegistration(SCOPE) : null;
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) {
      await auth.api("api/push/unsubscribe", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    if (reg) await reg.unregister();
    sessionStorage.removeItem(SYNCED);
  } catch (e) { /* nothing to drop */ }
  config = null;
}

/** A test notification to the account's devices. -> the number reached, or null on failure. */
export async function test() {
  const r = await auth.api("api/push/test", {});
  return r.ok ? r.data.reached : null;
}

// a tap on a notification when a tab is open: the worker controls no page, it asks the tab to go there
if ("serviceWorker" in navigator && !inApp()) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "ocn-open" && typeof e.data.url === "string") {
      const u = new URL(e.data.url, location.origin);
      if (u.origin === location.origin) location.href = u.href;
    }
  });
}

/** Signed in: renew this device's subscription once a visit (an account switch moves it), or offer it. */
export async function boot() {
  if (!auth.session()?.email || !supported()) return;
  const cfg = await getConfig(true);
  if (inApp()) {
    if (!cfg?.native) return;
    const st = await systemState();
    let done = false;
    try { done = !!sessionStorage.getItem(SYNCED); } catch (e) { /* no storage */ }
    // allowed: the token sent again once a visit (it changes now and then; an account switch moves it); never asked: offered
    if (st === "on" && nativeToken() && !done) await nativeRegister();
    else if ((st === "off" || (st === "on" && !nativeToken())) && cfg.enabled) offer();
    return;
  }
  if (!cfg?.ready) return;
  if (Notification.permission === "granted") {
    let done = false;
    try { done = !!sessionStorage.getItem(SYNCED); } catch (e) { /* no storage */ }
    const reg = await navigator.serviceWorker.getRegistration(SCOPE);
    if (!done && reg && cfg.enabled) { try { await subscribe(cfg); } catch (e) { /* next visit */ } }
    return;
  }
  if (Notification.permission === "default" && cfg.enabled) offer();
}

/** The card that asks for this device (the browser asks only after a click). */
function offer() {
  let later = 0;
  try { later = Number(localStorage.getItem(SNOOZE) || 0); } catch (e) { /* none */ }
  if (later > Date.now() || document.getElementById("push-offer")) return;
  const card = document.createElement("div");
  card.id = "push-offer";
  card.className = "push-offer";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", t("push.offer.title"));
  card.innerHTML = html`<div class="push-offer-text"><b>${t("push.offer.title")}</b><span>${t("push.offer.text")}</span></div>
    <div class="push-offer-btns"><button type="button" class="btn btn-primary btn-sm" data-act="on">${t("push.offer.on")}</button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="later">${t("push.offer.later")}</button></div>`;
  const close = (snoozeDays) => {
    try { localStorage.setItem(SNOOZE, String(Date.now() + snoozeDays * 86400e3)); } catch (e) { /* asked again */ }
    card.remove();
  };
  card.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "later") close(14);
    if (act === "on") {
      e.target.disabled = true;
      const s = await enable();
      close(s === "on" ? 3650 : 60);
    }
  });
  document.body.append(card);
}
