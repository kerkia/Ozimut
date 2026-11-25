// The purchase gate's shared helpers (docs/billing/design.md §5, §9; loaded only through ../offers.js, never in the app):
// the calls to /api/billing, the offer (prices, plans, seller, « Ce qui change »), how an amount, a limit or a plan is
// written, and the gate's dialog. Amounts are cents; they come from the server and are written through the reader's locale.

import { html, raw, fmt, fmtDate } from "../util.js";
import { t, has as hasText, locale, lang } from "../i18n.js";
import * as auth from "../auth.js";

export class ApiError extends Error {
  constructor(code, status, data) { super(code); this.code = code; this.status = status; this.data = data || {}; }
}
/** A call under /api/billing: its JSON, or an ApiError (code = the server's `error`, else the status). */
export async function api(path = "", { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch(`api/billing${path ? `/${path}` : ""}`, { method, credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new ApiError("network", 0); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && auth.session()) window.dispatchEvent(new Event("cnx:unauthorised"));
  if (!r.ok) throw new ApiError(String(j.error || r.status).replace(/\s+/g, "_"), r.status, j);
  return j;
}
/** An error's sentence: its own text when the catalogue has one, else the general one. */
export const errText = (e) => (hasText(`bill.err.${e?.code}`) ? t(`bill.err.${e.code}`) : t("bill.err.other"));

let offerP = null;
/** What is on offer (public when live): { prices, plans: [{ id, caps }], seller, changes, … }; null when it cannot be read. */
export const offer = () => (offerP ||= api("offer").catch(() => { offerP = null; return null; }));
/** The account's own state (GET /api/billing), never kept. */
export const state = () => api("");
/** The funnel's counts (no account kept): a step seen. */
// (the steps the server counts: functions/api/billing/[[path]].js STEPS; the others are not sent)
const STEPS = new Set(["sheet", "pricing", "checkout", "trial", "cancel"]);
export const seen = (step, k = "") => {
  if (!STEPS.has(step)) return;
  api("seen", { method: "POST", body: { step, k: String(k || "").replace(/[^\w-]/g, "").slice(0, 32) } }).catch(() => {});
};

// ---- how things are written ---------------------------------------------------------------------------------------------
/** Cents as an amount in the reader's locale (« 29 € », « 29,50 € », "€29"). */
export function money(cents, currency = "eur") {
  const n = (Number(cents) || 0) / 100;
  try { return new Intl.NumberFormat(locale(), { style: "currency", currency: String(currency || "eur").toUpperCase(), minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n); }
  catch (e) { return `${fmt(n, n % 1 ? 2 : 0)} ${String(currency).toUpperCase()}`; }
}
export const day = (iso, style = "long") => (iso ? fmtDate(String(iso).slice(0, 10), style) : "—");
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
export const planName = (id) => (hasText(`bill.plan.${id}`) ? t(`bill.plan.${id}`) : String(id || ""));
export const capName = (key) => (hasText(`bill.cap.${key}.name`) ? t(`bill.cap.${key}.name`) : key);
/** A limit's plain name, for the free plan's column (« Mes cartes », not « Mes cartes : plus de place »). */
export const capShort = (key) => (hasText(`bill.cap.${key}.short`) ? t(`bill.cap.${key}.short`) : capName(key));
export const capWhat = (key) => (hasText(`bill.cap.${key}.what`) ? t(`bill.cap.${key}.what`) : "");
/** A capability's value as words: « illimité », « 25 Go », « 20 par jour »; "" for a flag. */
export function capVal(key, v) {
  if (v === true || v === false || v === undefined) return "";
  if (v === null) return t("bill.val.unlimited");
  if (/MB$/.test(key)) return v >= 1024 ? t("bill.val.gb", { n: fmt(v / 1024, v % 1024 ? 1 : 0) }) : t("bill.val.mb", { n: fmt(v) });
  if (/PerDay$/.test(key)) return t("bill.val.day", { n: fmt(v) });
  if (/Month$/.test(key)) return t("bill.val.km2", { n: fmt(v) });
  return fmt(v);
}
/** Is `v` more than `f` for a capability? (true over false, null = unlimited over a number, the larger number.) */
export const more = (v, f) => (v === true && f !== true) || (v === null && f !== null && f !== true) || (typeof v === "number" && (typeof f !== "number" ? f !== null && f !== true : v > f));
const capsOf = (O, id) => O?.plans?.find((p) => p.id === id)?.caps || {};
/** The capabilities a plan adds to the free one: [{ key, v, free }]. */
export function adds(O, id) {
  const free = capsOf(O, "free"), c = capsOf(O, id);
  return Object.keys(c).filter((k) => more(c[k], free[k])).map((k) => ({ key: k, v: c[k], free: free[k] }));
}
/** The plan an option belongs to: "plus" or "club". */
export function needOf(O, key) {
  if (O?.need?.[key]) return O.need[key] === "club" ? "club" : "plus";
  for (const id of ["plus", "club"]) if (adds(O, id).some((a) => a.key === key)) return id;
  return "plus";
}
/** What a club's plan opens to everyone taking part in its events and analyses: capability keys. */
export function participantCaps(O) {
  // (GET /api/billing/offer lists the pack's columns as plans: free, plus, club, member, participant, u21)
  const free = capsOf(O, "free"), p = capsOf(O, "participant");
  return Object.keys(p).filter((k) => more(p[k], free[k]));
}
/** The individual plan's yearly price today: { amount, full, founder: bool, until }. */
export function plusPrice(P) {
  const p = P?.plus || {};
  // (the server sends the founders' price only while it applies: functions/_lib/billing.js displayPrices)
  const founder = p.founder != null && p.founder < p.year && !!p.founderUntil && today() <= p.founderUntil;
  return { amount: founder ? p.founder : p.year, full: p.year, founder, until: founder ? p.founderUntil : "", ready: p.ready !== false };
}
/** A club's yearly price for its number of members. */
export function clubPrice(P, members) {
  const c = P?.club || {};
  return c.small && c.smallMax && members != null && members <= c.smallMax ? c.small : c.year;
}
export const cur = (P) => P?.currency || "eur";

// ---- the gate's dialog --------------------------------------------------------------------------------------------------
/**
 * A dialog drawn in the page (never the browser's confirm/alert): `fill(body, close)` draws it and may draw it again (a
 * second step); resolves with what `close(value)` was given — undefined for Escape, ✕ or a click beside it.
 */
export function dialog(fill, { cls = "" } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = `bl-dlg ${cls}`;
    d.innerHTML = html`<button type="button" class="bl-x" data-bl-x aria-label="${t("bill.close")}" title="${t("bill.close")}">✕</button><div class="bl-dlg-body"></div>`;
    let done = false;
    const close = (v) => { if (done) return; done = true; try { d.close(); } catch (e) { /* closed */ } d.remove(); resolve(v); };
    d.addEventListener("click", (e) => {
      if (e.target.closest("[data-bl-x]")) return close(undefined);
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(undefined);
      }
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); close(undefined); });
    document.body.append(d);
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
    fill(d.querySelector(".bl-dlg-body"), close);
  });
}
/** A message in the gate's dialog, acknowledged. */
export const say = (message) => dialog((body, close) => {
  body.innerHTML = html`<p class="bl-msg"></p><div class="bl-btns"><button type="button" class="btn btn-primary" data-ok>${t("dlg.ok")}</button></div>`;
  body.querySelector(".bl-msg").textContent = message;
  body.querySelector("[data-ok]").addEventListener("click", () => close(true));
});
/** A button busy while its action runs; an error shown in `note`. */
export async function run(btn, note, fn) {
  if (btn.disabled) return undefined;
  btn.disabled = true;
  if (note) note.hidden = true;
  try { return await fn(); }
  catch (e) { if (note) { note.textContent = errText(e); note.className = "notice"; note.hidden = false; } return undefined; }
  finally { btn.disabled = false; }
}
/** The account's entitlements read again (a trial started, a plan activated): the pages then show what it opens. */
export const refreshAccount = () => auth.refresh().catch(() => null);
export const terms = () => html`<a href="#/conditions-de-vente" target="_blank" rel="noopener">${t("bill.terms.link")}</a>`;
export { html, raw, lang, t };
