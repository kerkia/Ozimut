// The purchase gate (docs/app/design.md, docs/billing/design.md §9; owner, 2026-11-23 and 2026-11-25). With the modules of
// billing/ — which only this module loads, and only when billing is on for the visitor — the ONE code that may draw anything
// about prices, plans or buying: the home page's « Tarifs » table, the rules' sentence on features that may become paid, the
// pricing page, the plan sheets, « Réglages › Abonnement », « Mon club › Formule », the mark on a feature an account lacks,
// every link to a checkout. Inside the Ozimut app (appbridge.inApp) it draws nothing about buying: the app never shows an
// invitation to buy (Apple 3.1.3(f), Google Play's consumption-only apps) — only the plan an account already has. Its texts
// are the catalogue area « billing » (keys bill.*), which only this module loads, and never in the app; the few neutral words
// of the plan's state (« plan », keys plan.*) are an area of their own, read in the app too. tools/offer_check.mjs (the
// pre-commit hook) refuses a bill.* key, the area, a checkout host, /api/billing or an import of billing/ anywhere else; the
// server refuses the app's requests to /api/billing (functions/_middleware.js).
//
// While billing is not on for the visitor (BILLING "off", or "test" for an account that is not a tester: auth.billing() false;
// signed out: /api/account/status without `billing`) every function added on 2026-11-25 is a no-op: nothing drawn, nothing
// of billing/ loaded, no request under /api/billing — the site as it was.

import { html } from "./util.js";
import { t, loadArea } from "./i18n.js";
import { inApp } from "./appbridge.js";
import * as auth from "./auth.js";

/** May this page show anything about buying? Never in the app. */
export const selling = () => !inApp();

// ---- is billing on for this visitor? ------------------------------------------------------------------------------------
let live = null;                       // signed out: /api/account/status `billing` (the public pricing page), read once
let liveP = null;
const readLive = () => (liveP ||= fetch("api/account/status").then((r) => r.json()).then((s) => { live = !!s.billing; }, () => { live = false; }));
const account = () => !!auth.session();
const accountOn = () => { try { return typeof auth.billing === "function" && !!auth.billing(); } catch (e) { return false; } };
/** Billing is on for this visitor (never in the app). Signed out, known once `ready()` has settled. */
export function on() {
  const yes = selling() && (account() ? accountOn() : live === true);
  if (yes && loaded) warm();              // (the account may be read after this module: the marks' needs are asked then)
  return yes;
}

let texts = null;
/** The gate's texts, loaded once — never in the app. Await it before a drawing function of this module is called. */
export const ready = () => (selling()
  ? (texts ||= Promise.all([loadArea("billing"), account() ? null : readLive()]).then(() => true, () => { texts = null; return false; }))
  : Promise.resolve(false));
let loaded = false;
ready().then((ok) => { loaded = ok; on(); });
const can = () => selling() && loaded;

// the modules of billing/: loaded only from here, and only when something of theirs is to be drawn
const core = () => import("./billing/core.js");
const sheet = () => import("./billing/sheet.js");
/** What the marks need (which plan holds an option), asked once billing is known to be on. */
let offer = null;
function warm() {
  if (offer !== null) return;
  offer = false;
  core().then((m) => m.offer()).then((o) => { offer = o || false; }, () => { offer = false; });
  // a mark is clicked: the sheet, never the option under it
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-bl-mark]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    sheet().then((m) => m.open(b.dataset.blMark, { from: "mark" })).catch(() => {});
  }, true);
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-bl-mark]")) { e.preventDefault(); e.target.click(); }
  });
  // an Orga event's « Ouvrir pour cet événement » (eventNote): the event bought by the unit
  document.addEventListener("click", async (e) => {
    const b = e.target.closest?.("[data-bl-event]");
    if (!b || b.disabled) return;
    e.preventDefault();
    b.disabled = true;
    try {
      if (await (await import("./billing/club.js")).buyEvent(b.dataset.blEvent)) {
        window.dispatchEvent(new CustomEvent("ocn:plan", { detail: { event: b.dataset.blEvent } }));
        const line = b.closest(".bl-note");
        if (line) line.hidden = true;
      }
    } finally { b.disabled = false; }
  });
}

/** The home page's bar: the link to the pricing table, or null. */
export const navItem = () => (can() ? ["home-features", "#/?s=features", t("bill.eyebrow")] : null);

/** The home page's « Tarifs »: the modules as columns, the access levels as rows, in each cell what that level adds.
 *  `MODS`, `LEVELS`, `CAPS`: tour.js's own tables. Once billing is live, a link to the plans under it. */
export function pricingSection({ MODS, LEVELS, CAPS }) {
  if (!can()) return "";
  const cell = (m, l) => {
    const keys = CAPS[m][l];
    const star = (k) => (k.includes(".fed.") ? html`<span class="tour-star" title="${t("tour.feat.star")}">*</span>` : "");
    return html`<td data-mod="${m}"><span class="tour-feat-m">${t(`mod.${m}`)}</span>${keys.length ? html`<ul>${keys.map((k) => html`<li>${t(`tour.f.${k}`)}${star(k)}</li>`)}</ul>`
      : html`<span class="tour-no">${t(`tour.f.none.${l}`)}</span>`}</td>`;
  };
  return html`<section class="tour-sec tour-features" id="mod-features">
    <div class="tour-eyebrow">${t("bill.eyebrow")}</div><h2>${t("bill.title")}</h2><p class="tour-lede">${t("tour.feat.lede")}</p>
    <div class="tour-feat-grid"><table class="tour-feat-table"><thead><tr><th></th>${MODS.map((M) => html`<th data-mod="${M.id}">${t(`mod.${M.id}`)}<span>${t(M.id === "coach" ? "mod.coach.tag" : `mod.${M.id}.tag`)}</span></th>`)}</tr></thead>
      <tbody>${LEVELS.map((l) => html`<tr><th scope="row"><b>${t(`tour.lvl.${l}`)}</b><em class="tour-free">${t("bill.free")}</em><span>${t(`tour.lvl.${l}.sub`)}</span></th>${MODS.map((M) => cell(M.id, l))}</tr>`)}</tbody></table></div>
    <p class="tour-feat-note tour-feat-later">${t("bill.later")}</p>
    ${on() ? html`<p class="tour-feat-note bl-home-link"><a class="btn btn-primary" href="#/tarifs">${t("bill.home.plans")}</a></p>` : ""}
    <p class="muted tour-feat-note"><span class="tour-star">*</span> ${t("tour.feat.note")}</p><p class="muted tour-feat-note">${t("tour.note")}</p></section>`;
}

/** The rules page's paragraph on features that may become paid (plain text), or "" — the app's rules say nothing of it. */
export const rulesLater = (site) => (can() ? t("bill.rules.later", { site }) : "");

// ---- capabilities (docs/billing/design.md §3, §9) -----------------------------------------------------------------------
/** May the account use the capability (here: `opened`, what an event's or an analysis's organiser opens to participants)?
 *  The entitlements' own answer (auth.can); true on a server that sends none (before the plans). */
export function has(key, opened) {
  try { return typeof auth.can === "function" ? !!auth.can(key, opened) : true; } catch (e) { return true; }
}
/** Should the option be drawn at all? What the account has; and, where buying may be shown, what it lacks — drawn marked. */
export const shown = (key, opened) => has(key, opened) || (on() && can());
/** The plan that holds an option the account lacks: "plus" or "club". */
const needOf = (key) => {
  const P = offer && Array.isArray(offer.plans) ? offer.plans : [];
  const free = P.find((p) => p.id === "free")?.caps || {};
  const better = (v, f) => (v === true && f !== true) || (v === null && f !== null && f !== undefined && f !== true) || (typeof v === "number" && typeof f === "number" && v > f) || (typeof v === "number" && (f === undefined || f === false));
  for (const id of ["plus", "club"]) { const c = P.find((p) => p.id === id)?.caps; if (c && key in c && better(c[key], free[key])) return id; }
  return offer?.need?.[key] || "plus";
};
/** The mark beside an option the account lacks (« Plus », « Club »: it opens the sheet), « offert par … » when a club, a
 *  federation or an event's organiser opened it, "" otherwise. */
export function mark(key, opened) {
  if (!can() || !on()) return "";
  if (has(key, opened)) {
    let w = null;
    try { w = auth.capWhy?.(key) || null; } catch (e) { w = null; }
    const by = opened?.caps?.includes?.(key) && opened.by ? opened.by : w && w.scope && !["person", "user", "free"].includes(w.scope) && w.name ? w.name : "";
    return by ? html`<span class="bl-gift" title="${t("bill.gift.tip", { name: by })}">${t("bill.gift", { name: by })}</span>` : "";
  }
  const need = needOf(key);
  return html`<span class="bl-mark" role="button" tabindex="0" data-bl-mark="${key}" data-bl-plan="${need}" title="${t(`bill.mark.tip.${need}`)}">${t(`bill.mark.${need}`)}</span>`;
}
/** To call when an option is used: true to go on; else — where buying may be shown — the sheet opens in place (what the
 *  option does, the plan, the price, the trial) and this resolves false, unless a trial started there opened the option. */
export async function guard(key, { opened } = {}) {
  if (has(key, opened)) return true;
  // never rejects (the tools call it without a catch): a module or a request that fails is « no »
  try {
    if (!on() || !(await ready())) return false;
    return !!(await (await sheet()).open(key, { opened, from: "guard" }));
  } catch (e) { return false; }
}
/** The quiet line near a limit (80 %), the explanation at it — `used` in the limit's own unit. "" below, or without a limit. */
export function limitNote(key, used) {
  if (!can() || !on()) return "";
  let lim = null;
  try { lim = auth.limit?.(key); } catch (e) { lim = null; }
  if (typeof lim !== "number" || !(lim > 0) || !(used >= 0.8 * lim)) return "";
  const full = used >= lim;
  return html`<p class="bl-limit ${full ? "bl-limit-full" : ""}">${t(full ? "bill.limit.full" : "bill.limit.near", { pct: Math.min(100, Math.round(100 * used / lim)) })} ${mark(key) || ""}</p>`;
}
/** To call with a refusal's body (`402 { error: "plan", cap }`, `413 { error: "quota", cap }`): explains and offers the
 *  sheet. Resolves true when it was shown (the caller then says nothing more). */
export async function refused(error) {
  try {
    const e = error?.data || error || {};
    if (!["plan", "quota"].includes(e.error) || !e.cap || !on() || !(await ready())) return false;
    (await sheet()).open(e.cap, { refusal: e, from: "refused" }).catch(() => {});
    return true;
  } catch (err) { return false; }        // never rejects, as guard
}

// ---- « Réglages › Abonnement » ------------------------------------------------------------------------------------------
const planState = () => import("./billing/planstate.js");
/** The section's place in Réglages: "" when there is nothing to show. In the app: the plan the account has, nothing else. */
export function settingsSection() {
  if (!account()) return "";
  if (inApp()) return accountOn() ? html`<section class="card bl-settings" id="st-billing" hidden></section>` : "";
  return on() && can() ? html`<section class="card bl-settings" id="st-billing"><div class="card-head"><h2>${t("bill.st.title")}</h2></div><div class="card-body"><div class="boot"><div class="spinner"></div></div></div></section>` : "";
}
export async function bindSettings(root = document) {
  const box = root.querySelector("#st-billing");
  if (!box) return;
  if (inApp()) { (await planState()).draw(box); return; }
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  if (q.get("onglet") === "abonnement") box.scrollIntoView({ block: "start" });
  (await import("./billing/account.js")).draw(box, { back: q.get("retour") === "1" });
}

// ---- « Mon club › Formule » ---------------------------------------------------------------------------------------------
/** The tab's name, or null when there is none (billing not on, the app). */
export const clubTab = () => (on() && can() ? t("bill.club.tab") : null);
export const clubSection = (org) => (on() && can() && org ? html`<div class="bl-club" data-bl-org="${org.id}"><div class="boot"><div class="spinner"></div></div></div>` : "");
export async function bindClub(root, org) {
  const box = root?.querySelector?.("[data-bl-org]");
  if (box && on()) (await import("./billing/club.js")).draw(box, org);
}

/** An Orga event's line about timing a competition with Chrono (`ev.opened`: what its organiser's plan opens; `form`: the
 *  event's kind and variant). "" when nothing is to be said. */
export function eventNote(ev, form) {
  if (!can() || !on()) return "";
  const kind = form?.kind || ev?.kind || "";
  if (kind && kind !== "competition") return "";
  const key = "chronoCompetition";
  if (has(key, ev?.opened)) { const m = mark(key, ev?.opened); return m ? html`<p class="bl-note">${t("bill.event.has")} ${m}</p>` : ""; }
  return html`<p class="bl-note">${t("bill.event.lacks")} ${mark(key, ev?.opened)}${ev?.id ? html` <button type="button" class="btn btn-sm" data-bl-event="${ev.id}">${t("bill.event.buy")}</button>` : ""}</p>`;
}

// ---- an invoice's PDF (the admin page's « Abonnements » too) ------------------------------------------------------------------
/**
 * The PDF of an invoice, a credit note or a quote of Ozimut's, drawn in the browser from its stored record (the record of
 * GET /api/billing/org/<id>/invoice/<n>, or of the admin API: functions/_lib/invoices.js `parsed`). Never in the app.
 * `save` (default true): handed to the reader as « <number>.pdf ». -> Promise<Uint8Array> (null in the app).
 */
export async function invoicePdf(rec, { save = true } = {}) {
  if (!selling() || !rec || !(await ready())) return null;
  const m = await import("./billing/invoicepdf.js");
  return save ? m.save(rec) : m.make(rec);
}
/** The file name an invoice's PDF is saved under. */
export const invoicePdfName = async (rec) => { await ready(); return (await import("./billing/invoicepdf.js")).fileName(rec); };

// ---- the pages: #/tarifs, #/conditions-de-vente, #/changements ----------------------------------------------------------
/** Do the gate's pages exist for this visitor? (The router asks before opening one; else the address is unknown.) */
export const pageOn = async () => (await ready()) && on();
/** One of the gate's pages (pages/offer.js hands the router's call over). */
export async function page(main, r) {
  if (!(await pageOn())) { location.replace("#/"); return null; }
  return (await import("./billing/pages.js")).render(main, r);
}
