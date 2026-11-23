// The purchase gate (docs/app/design.md; owner, 2026-11-23). The ONE module that may draw anything about prices, plans or
// buying: the home page's « Tarifs » table, the rules' sentence on features that may become paid, and — when plans exist — the
// pricing page, the plan sheets, « Réglages › Abonnement », the mark on a feature an account lacks, every link to a checkout.
// Inside the Ozimut app (appbridge.inApp) it draws nothing: the app never shows an invitation to buy (Apple 3.1.3(f), Google
// Play's consumption-only apps). Its texts are the catalogue area « billing » (keys bill.*), which only this module loads, and
// never in the app. tools/offer_check.mjs (the pre-commit hook) refuses a bill.* key, the area, a checkout host or
// /api/billing named anywhere else; the server refuses the app's requests to /api/billing (functions/_middleware.js).

import { html } from "./util.js";
import { t, loadArea } from "./i18n.js";
import { inApp } from "./appbridge.js";

/** May this page show anything about buying? Never in the app. */
export const selling = () => !inApp();

let texts = null;
/** The gate's texts, loaded once — never in the app. Await it before a drawing function of this module is called. */
export const ready = () => (selling() ? (texts ||= loadArea("billing").then(() => true, () => { texts = null; return false; })) : Promise.resolve(false));
let loaded = false;
ready().then((ok) => { loaded = ok; });
const can = () => selling() && loaded;

/** The home page's bar: the link to the pricing table, or null. */
export const navItem = () => (can() ? ["home-features", "#/?s=features", t("bill.eyebrow")] : null);

/** The home page's « Tarifs »: the modules as columns, the access levels as rows, in each cell what that level adds.
 *  `MODS`, `LEVELS`, `CAPS`: tour.js's own tables. */
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
    <p class="muted tour-feat-note"><span class="tour-star">*</span> ${t("tour.feat.note")}</p><p class="muted tour-feat-note">${t("tour.note")}</p></section>`;
}

/** The rules page's paragraph on features that may become paid (plain text), or "" — the app's rules say nothing of it. */
export const rulesLater = (site) => (can() ? t("bill.rules.later", { site }) : "");
