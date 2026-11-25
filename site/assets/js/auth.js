// Accounts: e-mail + password (functions/api/account/*). The server sets a signed, HttpOnly
// session cookie and the middleware refuses every data file without it, so the data really
// is private. The session kept here in localStorage is just who the visitor is, for the UI.

import * as local from "./local.js";
import { adoptLang, storedLang } from "./i18n.js";
import * as data from "./data.js";
import { normalise, nameParts } from "./util.js";

const KEY = "cnx.session";
const DAYS = 30;

/** "Marie-Anne  DUPONT" and "dupont marie anne" give the same key. */
export function nameKey(name) {
  return (name || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).sort().join(" ");
}
/** The club number (4 digits) of the logged-in runner, from their latest race. */
export function myClub() {
  const r =myId() && data.isPrivateLoaded() ? data.runner(myId()) : null;     // France's licence, in France's data
  return r ? data.clubParts(r.club).code : null;
}
export const cleanLicence = (lic) => String(lic || "").replace(/\s+/g, "").replace(/^0+(?=\d)/, "");

// « Définitions de postes » and « Symboles de carte » are shown only to the accounts named Le Helloco for now (owner,
// 2026-10-31): their pages, and every text that names them (the home page, the modules page, Coach's documentation)
export const owner = () => normalise(nameParts(session()?.nom || "").last) === "le helloco";
/** « Nutrition » (Coach; owner, 2026-11-01): who reads it (the accounts given the right, its authors, the administrators), who
 *  writes (its authors and the administrators). The server checks the same (functions/_lib/api.js `nutritionRole`). */
export const nutritionReads = () => !!session()?.nutrition;
export const nutritionWrites = () => ["admin", "author"].includes(session()?.nutrition);
/** The key of a text naming those pages, or its version without them for everyone else. */
// (ownerKey, the « .lim » texts for everyone but the owner, gone on 2026-11-10: « Apprendre » is everyone's)
export function session() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    // (a demo account has no licence, nor an account that has not joined France)
    if (s && (s.uid || s.lic || s.demo) && s.until > Date.now()) return s;
  } catch (e) {}
  return null;
}
/**
 * May the signed-in account see a country's data? By the country's rule (data/meta.json `countries`, functions/_lib/access.js):
 * "all" — every account (Spain) —, else an accepted membership (migration 0014; a demo account sees France). The login gate
 * refuses the rest (_middleware.js `needs`). A session kept before the countries: its licence is France.
 */
export function sees(cc) {
  // a country whose results are all public (Spain): everyone, signed in or not (owner, 2026-10-30)
  const rule = data.site()?.countries?.[cc]?.access;
  if (rule === "all") return true;
  if (rule === "admins") return !!session()?.admin;      // (Canada for now: its results for the administrators; owner, 2026-11-11)
  const s = session();
  if (!s) return false;
  if (s.demo) return cc === "FR";
  return Array.isArray(s.countries) ? s.countries.some((c) => c.cc === cc && c.status === "ok") : cc === "FR" && !!s.lic;
}
/**
 * A visit without an account (owner, 2026-10-30: « Entrer sans compte »): the public data only — Arena, Coach but « Analyse
 * multi », Stats over the period the federation publishes openly. Kept on this device until one signs in or leaves it from
 * the modules page; nothing on the server.
 */
const GUEST = "ocn.guest";
export const guest = () => { try { return !session() && localStorage.getItem(GUEST) === "1"; } catch (e) { return false; } };
export function setGuest(on) {
  try { if (on) localStorage.setItem(GUEST, "1"); else localStorage.removeItem(GUEST); } catch (e) { /* not kept */ }
}
/** The signed-in runner's number in the loaded country's files (their FFCO licence in France), or null. */
export const myId = () => (data.loadedCountry() === "FR" && session()?.lic) || null;
/**
 * The provisional results' folder for this account: the full files for France's members, else the copy without CNs, scores
 * or licences (prov/pub/, ffco_scraper/prov/run.py `public_copy`; the login gate serves the full ones to France only).
 */
export const provDir = () => (sees("FR") ? "data/prov/" : "data/prov/pub/");
function keep(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
}
export function forget() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

/** POST JSON to a server endpoint -> { ok, status, data }. status 0: the server has no such endpoint. */
export async function api(path, body) {
  try {
    const r = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}), credentials: "same-origin",
    });
    let data = null;
    try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: data ? r.status : 0, data };
  } catch (e) {
    return { ok: false, status: 0, data: null };
  }
}

/** Log in with e-mail and password. Resolves to the session; rejects with { code, message }. */
export async function accountLogin(email, password) {
  const r = await api("api/account/login", { email, password });
  if (r.ok) {
    const u = r.data;
    const s = { ...fromUser(u), until: Date.now() + DAYS * 86400e3 };
    keep(s);
    setGuest(false);
    // the language: one chosen on this device (the menu, before signing in) becomes the account's; else the account's
    // own is taken on a device that has none
    const mine = storedLang();
    if (mine && mine !== u.lang) api("api/account/settings", { lang: mine }).catch(() => {});
    else if (adoptLang(u.lang)) setTimeout(() => location.reload(), 0);
    return s;
  }
  const code = r.status === 0 ? "unavailable" : r.status === 429 ? "rate" : r.data?.error || "generic";
  const err = new Error(code);
  err.code = ["invalid", "rate", "unverified", "disabled", "unavailable"].includes(code) ? code : "generic";
  throw err;
}

/** The move to ozimut.com (bridge.js): the old address's one-time token exchanged for a session here. -> the session or null. */
export async function handoffLogin(token) {
  const r = await api("api/account/handoff", { token });
  if (!r.ok || !r.data) return null;
  const s = { ...fromUser(r.data), until: Date.now() + DAYS * 86400e3 };
  keep(s);
  return s;
}

/** What the browser keeps of the account (the rights decide what the pages show). */
const fromUser = (u) => ({ uid: u.uid, lic: String(u.lic || ""), nom: u.nom, email: u.email, admin: !!u.admin, demo: u.demo || null,
  agendaAllowed: !!u.agendaAllowed, movedNotice: !!u.movedNotice, preview: Array.isArray(u.preview) ? u.preview : [], orga: !!u.orga,
  // the Carto module and the consumers' modules hidden (migration 0027; app.moduleShown); a server of before sends no carto: Orga's
  carto: u.carto === undefined ? !!u.orga : !!u.carto, hiddenModules: Array.isArray(u.hiddenModules) ? u.hiddenModules : [],
  nutrition: ["admin", "author", "reader"].includes(u.nutrition) ? u.nutrition : "",
  countries: Array.isArray(u.countries) ? u.countries : null,     // { cc, club, id, status }: `sees`
  // the tracking (migration 0029): a child account managed by its parents, an under-15's own account waiting for one, the flag
  child: !!u.child, guardianWanted: !!u.guardianWanted, trackOpen: !!u.trackOpen,
  // what the account may use (functions/_lib/plans.js): `ent` { caps, why }; null from a server of before
  ent: u.ent && typeof u.ent === "object" && u.ent.caps ? { caps: u.ent.caps, why: u.ent.why || {} } : null,
  billing: !!u.billing, plan: u.plan || "", trial: u.trial || null });
/**
 * May the account use the capability `key` (docs/billing/design.md §3)? `opened`: what an event's or an analysis's organiser
 * opened to everyone there ({ caps: [keys], by }, from its API). A session that says nothing of it (kept from before, a
 * visitor) answers true: nothing disappears.
 */
export function can(key, opened) {
  if (Array.isArray(opened?.caps) && opened.caps.includes(key)) return true;
  const caps = session()?.ent?.caps;
  return !caps || !(key in caps) ? true : caps[key] !== false && caps[key] !== 0;
}
/** The capability's limit for the account: a number, or null — none, or not known. */
export function limit(key) {
  const v = session()?.ent?.caps?.[key];
  return typeof v === "number" ? v : null;
}
/** Where the account's value of a capability comes from: { scope, plan, name, until }, or null (its own, plain value). */
export function capWhy(key) { return session()?.ent?.why?.[key] || null; }
/** Has the server switched the plans on for this account? */
export function billing() { return !!session()?.billing; }
/** Re-read the account from the server: rights granted or withdrawn by the administrator apply at once. */
export async function refresh() {
  const s = session();
  if (!s) return null;
  try {
    const r = await fetch("api/account/me", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return s;
    const n = { ...s, ...fromUser(await r.json()) };
    keep(n);
    return n;
  } catch (e) {
    return s;
  }
}
export async function logout() {
  forget();
  setGuest(false);
  local.clear();                  // the results file read on « Déposer »
  // the Tracer's offline copies (tracer/offline.js), unless changes still wait for the network
  try { await (await import("./tracer/offline.js")).dropCopies(); } catch (e) { /* none */ }
  // the keys of the Tracer's encrypted events (tracer/store.js), kept for the tab
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith("ocn.tr.key.")) sessionStorage.removeItem(k); } catch (e) { /* nothing kept */ }
  // the API key « IA » may use (askbyok.js), even one remembered on this device
  for (const s of ["sessionStorage", "localStorage"]) { try { window[s].removeItem("ocn.ia.byok"); } catch (e) { /* nothing kept */ } }
  // this device's push notifications (push.js), while the session still lets it tell the server
  try { await (await import("./push.js")).disable(); } catch (e) { /* none */ }
  try { await fetch("api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {}
}
