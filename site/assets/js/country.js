// The site's country (owner, 2026-10-20): one choice for the whole site, beside the language, as the method is. The pages
// that depend on a country (Agenda, Résultats, En direct, the organisers' pickers; the rankings once another country has data)
// show that country's. One place to choose it, the header's menu (owner, 2026-10-21: the Agenda's « Pays » field and En direct's
// repeated it): the countries whose data the site reads (meta.json `countries`; France alone until then) and those the
// account has joined, whose competitions their organisers declare (functions/api/declared.js) — no other (owner, 2026-10-24:
// a country without data showed empty lists; « En direct »'s search still finds any country's live races). Default: the first
// country the account joined successfully, else the first with data. Kept on the device (localStorage ocn.country). Countries are ISO alpha-2 codes, named in the reader's language by the browser.

import { html } from "./util.js";
import { t, lang } from "./i18n.js";
import * as data from "./data.js";
import * as auth from "./auth.js";
import { flag } from "./vendor.js";

const KEY = "ocn.country";
// « IOF WRE » (countries/wre.py; owner, 2026-11-04): the IOF's World Ranking Events of every country, listed as a country of its
// own (XW: ISO 3166's user-assigned range), first after the account's own countries; the countries its events take place in
// (its index's `hosts`) are offered too — their own lists show their WREs, a country whose calendar Ozimut cannot read its WREs alone
export const WRE = "XW";
// « Tous les pays » (countries/world.py; owner, 2026-11-21: « adding a "all countries" to the list of countries, at the top with the
// home country and WRE »): every country's competitions in one list, on the world's map — the countries' own calendars, the WREs no
// host's list holds and OrienteeringOnline's competitions; listed as a country of its own (XA). The lists of races (Résultats,
// En direct, Analyse) show every country's there (`here`)
export const ALL = "XA";
// the countries of the races « En direct » offers (the live relay's list: liveresultat's, every country's), kept on the device
// for LIVE_TTL (owner, 2026-10-29: Sweden, whose agenda Ozimut cannot read, had left the menu with its live races)
const LIVE_KEY = "ocn.liveCountries", LIVE_TTL = 6 * 3600e3;
const liveKept = () => { try { return JSON.parse(localStorage.getItem(LIVE_KEY) || "null"); } catch (e) { return null; } };
/** Note the countries of the live relay's list (`comps`, the country 6th): the menu offers them; « ocn:countries » when they change. */
export function noteLive(comps) {
  const cc = [...new Set((comps || []).map((c) => c[5]).filter((c) => /^[A-Z]{2}$/.test(c || "")))].sort();
  const was = liveKept()?.cc || [];
  try { localStorage.setItem(LIVE_KEY, JSON.stringify({ at: Date.now(), cc })); } catch (e) { /* this visit only */ }
  if (cc.join() !== was.join()) window.dispatchEvent(new Event("ocn:countries"));
}
/** Read the live relay's list once LIVE_TTL has passed (a signed-in visit: the list is behind the login). */
export function refreshLive(base = "") {
  const k = liveKept();
  if (k && Date.now() - k.at < LIVE_TTL) return;
  fetch(`${base}/api/live/list`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => j && noteLive(j.comps)).catch(() => { /* next visit */ });
}
/** The countries the site offers: those whose data it holds, those with races « En direct » carries, then those the account has
 *  joined (their organisers' competitions). */
export function withData() {
  const read = Object.keys(data.site()?.countries || {});
  if (!read.length) read.push("FR");
  read.push(...(data.site()?.countries?.[WRE]?.hosts || []), ...(data.site()?.countries?.[ALL]?.hosts || []));
  const mine = (auth.session()?.countries || []).filter((c) => c.status === "ok").map((c) => c.cc);
  return [...new Set([...read, ...(liveKept()?.cc || []), ...mine])];
}
/** A country's name in the site's language. */
export function name(cc) {
  if (cc === WRE) return t("cty.wre");
  if (cc === ALL) return t("cty.all");
  try { return new Intl.DisplayNames([lang()], { type: "region" }).of(cc) || cc; } catch (e) { return cc; }
}
/** The site's country now. */
export function current() {
  const ok = withData();
  let kept = null;
  try { kept = localStorage.getItem(KEY); } catch (e) { /* none */ }
  if (ok.includes(kept) || MEMBERS.includes(kept)) return kept;
  const mine = (auth.session()?.countries || []).filter((c) => c.status === "ok").map((c) => c.cc);
  return mine.find((cc) => ok.includes(cc)) || ok[0];
}
export function pick(cc) {
  try { localStorage.setItem(KEY, cc); } catch (e) { /* this visit only: the default again next time */ }
}
/** An event or race of a country (the data's `country`; France when it has none, as everything before 2026-10-20). */
export const of = (x) => x?.country || "FR";
/** Is an event or race of the site's country — any, under « Tous les pays »? */
export const here = (x, cur = current()) => cur === ALL || of(x) === cur;
/** A pseudo-country (« IOF WRE », « Tous les pays »): no federation, no ranking, its lists gather several countries. */
export const isGroup = (cc) => cc === WRE || cc === ALL;
/** What the site has of a country (data/meta.json `countries`): { access, federation, ranking, agenda, methods… }, or null. */
export const info = (cc = current()) => data.site()?.countries?.[cc] || null;
/** Who may read a country's data: "members" (France) or "all" (Spain); a country the site has no data for: null. */
export const access = (cc) => info(cc)?.access || null;
/** Does the site rank a country's runners (its runners, ranking, clubs… pages)? A ranking only the administrators see
 *  (Canada, access « admins ») is none for the others. */
export const ranks = (cc = current()) => !!info(cc)?.ranking && (info(cc)?.access !== "admins" || auth.sees(cc));

/** A country's flag (owner, 2026-10-22: beside every country choice), or nothing for an unknown one. */
export const flagImg = (cc, cls = "cty-flag") => (cc === WRE ? wreMark(cls) : cc === ALL ? allMark(cls) : cc && /^[A-Z]{2}$/.test(cc)
  ? html`<img class="${cls}" src="${flag(cc)}" alt="" width="18" height="13" loading="lazy" decoding="async">` : "");

/** « IOF WRE »'s mark in place of a flag: a globe, the world's (no federation's emblem). */
const wreMark = (cls) => html`<svg class="${cls} cty-wre" width="18" height="13" viewBox="0 0 18 13" aria-hidden="true"><rect width="18" height="13" rx="1.5" fill="#1f5f9e"/><g fill="none" stroke="#fff" stroke-width="1"><circle cx="9" cy="6.5" r="4.6"/><ellipse cx="9" cy="6.5" rx="2" ry="4.6"/><path d="M4.4 6.5h9.2M5.1 4.1h7.8M5.1 8.9h7.8"/></g></svg>`;

/** « Tous les pays »' mark: four flags' colours in a square, no country's. */
const allMark = (cls) => html`<svg class="${cls} cty-all" width="18" height="13" viewBox="0 0 18 13" aria-hidden="true"><rect width="18" height="13" rx="1.5" fill="#e8743b"/><rect x="9" width="9" height="6.5" fill="#2e7d4f"/><rect y="6.5" width="9" height="6.5" fill="#1f5f9e"/><rect x="9" y="6.5" width="9" height="6.5" fill="#f2c230"/><circle cx="9" cy="6.5" r="3.4" fill="#fff"/><circle cx="9" cy="6.5" r="1.6" fill="#e8743b"/></svg>`;
/** A country's code as the header's button writes it. */
export const shortName = (cc) => (cc === WRE ? "WRE" : cc === ALL ? t("cty.allShort") : cc);

/** The header's menu, beside the language's: every country — the account's own first, then a line and the countries Ozimut
 *  has data for, then a line and every other IOF member (owner, 2026-10-29: a country is never left out of this menu; a page's
 *  own « Choisir un autre pays » offers only the countries it has something for, `hint`). */
function items() {
  const ok = withData();
  const cur = current();
  const mine = byName((auth.session()?.countries || []).filter((c) => c.status === "ok").map((c) => c.cc));
  // the account's own countries, « Tous les pays » and « IOF WRE » on top (owner, 2026-11-04, 2026-11-21); a visitor's own country
  // is the site's: the one in use, when it is a real one
  const home = mine.length ? mine : isGroup(cur) ? [] : [cur];
  const top = [...home, ...[ALL, WRE].filter((cc) => ok.includes(cc))];
  const known = byName(ok.filter((cc) => !top.includes(cc)));
  const rest = byName(MEMBERS.filter((cc) => !top.includes(cc) && !ok.includes(cc)));
  const item = (cc) => html`<button type="button" role="menuitemradio" aria-checked="${String(cc === cur)}" data-country-pick="${cc}">${flagImg(cc)}${name(cc)}</button>`;
  return html`${[top, known, rest].filter((l) => l.length).map((l, i) => html`${i ? html`<div class="cty-sep" role="separator"></div>` : ""}${l.map(item)}`)}`;
}
export function menu() {
  const cur = current();
  return html`<div class="nav-group lang-menu" data-group="country">
    <button class="icon-btn nav-top" type="button" aria-expanded="false" aria-haspopup="menu" title="${t("cty.menu")}" aria-label="${t("cty.menu")}">
      <span class="tool-label" aria-hidden="true">${t("cty.menu")}</span>
      ${flagImg(cur) || html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>`}
      <span class="lang-code">${shortName(cur)}</span>
    </button>
    <div class="nav-menu cty-menu" role="menu">${items()}</div>
  </div>`;
}
/** On a phone the country is chosen in the top-right menu (owner, 2026-10-31: room in the bar for the page's menu): a section
 *  that opens in place, the current country on its line. */
export function subMenu() {
  const cur = current();
  return html`<details class="menu-sub" data-sub="country"><summary>${t("cty.menu")}<span class="menu-sub-cur">${flagImg(cur)}${name(cur)}</span></summary>
    <div class="menu-sub-list cty-menu" role="menu">${items()}</div></details>`;
}

/** A line above a list of the site's country's (Agenda, Résultats, En direct, Analyse de course): whose list it is, and
 *  « Choisir un autre pays » (owner, 2026-10-23: « Courses en 🇫🇷 France · Choisir un autre pays »). Its list: the countries
 *  the page has something for, `list` (owner, 2026-10-29: the Agenda's those with an agenda, En direct's those with live races…;
 *  `hintList` when the page learns them later), then « Tous les pays » to the header's menu; without a list, the header's menu. */
let hintCcs = null;
export function hint(list = null) {
  hintCcs = list ? [...new Set(list)] : null;
  const cur = current();
  // the country itself opens the choice too: on a phone it is drawn as a drop-down and « Choisir un autre pays » goes (owner,
  // 2026-10-31)
  return html`<p class="cty-hint"><span class="cty-in">${t("cty.hint.races", { in: t(`cty.in.${prepOf(cur)}`) })}</span>
    <button type="button" class="cty-cur" data-cty-open aria-haspopup="menu" aria-expanded="false" title="${t("cty.hint.other")}">${flagImg(cur)}<b>${name(cur)}</b><span class="cty-caret" aria-hidden="true">▾</span></button>
    <button type="button" class="cty-other" data-cty-open aria-haspopup="menu" aria-expanded="false" title="${t("cty.hint.tip")}">${t("cty.hint.other")}</button><span class="cty-pop" role="menu" hidden></span></p>`;
}
/** The page's countries for its « Choisir un autre pays », once it knows them. */
export function hintList(list) { hintCcs = [...new Set(list)]; }
// « in » before a country's name, by the IOF members' names in each language: French « en France », « au Portugal », « aux
// Pays-Bas », « à Malte »; English « in France », « in the Netherlands »; German « in Frankreich », « in den Niederlanden »,
// « in der Schweiz »; Spanish « en Francia » (cty.in.* in the catalogues)
const PREP = {
  fr: { au: ["BR", "CA", "CL", "DK", "JP", "KE", "KZ", "LU", "MA", "ME", "MX", "PK", "PT", "GB", "UY", "VN", "XK"],
    aux: ["US", "NL", "PH"], a: ["SG", "MT", "CY", "TW"] },
  en: { aux: ["US", "NL", "PH", "GB"] },
  de: { aux: ["US", "NL", "PH"], au: ["CH", "TR", "SK", "UA", "MN", "CZ"] },
};
const prepOf = (cc) => cc === WRE ? "wre" : cc === ALL ? "all" : Object.entries(PREP[lang()] || {}).find(([, l]) => l.includes(cc))?.[0] || "en";
const openHeaderMenu = () => {
  let b = document.querySelector('.nav-group[data-group="country"] > .nav-top');
  const sub = !b?.offsetParent && document.querySelector('.nav-group[data-group="me"] .menu-sub[data-sub="country"]');
  if (sub) b = sub.closest(".nav-group").querySelector(".nav-top");
  if (!b) return;
  window.scrollTo({ top: 0 });
  // after this click has run its course: the document's own listener (app.js) closes the menus on a click outside them
  setTimeout(() => {
    if (!b.parentElement.classList.contains("open")) b.click();
    if (sub) sub.open = true;
    b.focus({ preventScroll: true });
  });
};
document.addEventListener("click", (e) => {
  const pick = e.target.closest?.(".cty-pop [data-cty-pick]");
  if (pick) { window.dispatchEvent(new CustomEvent("ocn:country", { detail: pick.dataset.ctyPick })); return; }
  if (e.target.closest?.(".cty-pop [data-cty-all]")) { e.target.closest(".cty-pop").hidden = true; openHeaderMenu(); return; }
  const open = e.target.closest?.("[data-cty-open]");
  const popOf = (el) => el.closest(".cty-hint")?.querySelector(".cty-pop");
  const shut = (p) => { p.hidden = true; p.closest(".cty-hint")?.querySelectorAll("[data-cty-open]").forEach((b) => b.setAttribute("aria-expanded", "false")); };
  document.querySelectorAll(".cty-pop:not([hidden])").forEach((p) => { if (!open || popOf(open) !== p) shut(p); });
  if (!open) return;
  if (!hintCcs) { openHeaderMenu(); return; }
  const pop = popOf(open), cur = current();
  if (!pop.hidden) { shut(pop); return; }
  const others = byName(hintCcs.filter((cc) => cc !== cur && !isGroup(cc) && /^[A-Z]{2}$/.test(cc || "")));
  // « Tous les pays » and « IOF WRE » on top, a line under them, as in the header's menu (owner, 2026-11-04: sorted by name, it
  // was lost among the I's)
  const groups = [ALL, WRE].filter((cc) => hintCcs.includes(cc) && cc !== cur);
  const pickBtn = (cc) => html`<button type="button" role="menuitem" data-cty-pick="${cc}">${flagImg(cc)}${name(cc)}</button>`;
  pop.innerHTML = html`${groups.length ? html`${groups.map(pickBtn)}${others.length ? html`<div class="cty-sep" role="separator"></div>` : ""}` : ""}${others.length ? others.map(pickBtn)
    : groups.length ? "" : html`<span class="cty-pop-none">${t("cty.hint.none")}</span>`}<button type="button" role="menuitem" class="cty-pop-all" data-cty-all>${t("cty.hint.all")}</button>`;
  pop.hidden = false;
  open.setAttribute("aria-expanded", "true");
});

// The IOF's member countries (2026), as functions/_lib/countries.js `COUNTRIES` — keep the two in step.
export const MEMBERS = ["FR",
  "AR", "AT", "AU", "AZ", "BA", "BE", "BG", "BR", "BY", "CA", "CH", "CL", "CN", "CO", "CY", "CZ", "DE", "DK", "EC", "EE",
  "ES", "FI", "GB", "GE", "GR", "HK", "HR", "HU", "IE", "IL", "IN", "IS", "IT", "JP", "KE", "KR", "KZ", "LT", "LU", "LV",
  "MA", "MD", "ME", "MK", "MN", "MT", "MX", "MY", "NL", "NO", "NZ", "PH", "PK", "PL", "PT", "RO", "RS", "RU", "SE", "SG",
  "SI", "SK", "TH", "TN", "TR", "TW", "UA", "US", "UY", "UZ", "VN", "XK", "ZA"];
/** Countries by their name in the site's language, France first (owner, 2026-10-23: the header's menu listed the countries
 *  with data by code, Switzerland among the C's). */
const byName = (ccs) => [...ccs].sort((a, b) => (b === "FR") - (a === "FR") || name(a).localeCompare(name(b), lang()));
/** The member countries by name in the site's language, France first; `except` left out. */
export const sortedMembers = (except = []) => byName(MEMBERS).filter((cc) => !except.includes(cc));

/**
 * One membership's fields (registration, Réglages › Mes pays): country, club, member id — the id is France's FFCO licence
 * (required, checked), elsewhere optional. `fixed`: the country cannot be changed (registration while only France is open,
 * a membership being edited). `row`: { cc, club, id }.
 */
export function membershipFields(prefix, { row = {}, fixed = false, except = [], allowNone = false } = {}) {
  const cc = row.cc || (allowNone ? "" : "FR");
  return html`<div class="cty-fields" data-cty="${prefix}">
    <label class="field"><span>${t("cty.field.country")}</span><span class="cty-pick"><span class="cty-pick-flag">${flagImg(cc)}</span>
      <select name="${prefix}-cc" ${fixed ? "disabled" : ""}>
        ${allowNone ? html`<option value="" ${cc ? "" : "selected"}>${t("cty.field.none")}</option>` : ""}
        ${sortedMembers(except.filter((x) => x !== cc)).map((c) => html`<option value="${c}" ${c === cc ? "selected" : ""}>${name(c)}</option>`)}
      </select></span></label>
    <div class="row cty-more" style="gap:12px;flex-wrap:wrap" ${cc ? "" : "hidden"}>
      <label class="field" style="flex:1;min-width:160px"><span>${t("cty.field.club")}</span>
        <input name="${prefix}-club" type="text" maxlength="80" value="${row.club || ""}" autocomplete="off"></label>
      <label class="field" style="flex:1;min-width:160px"><span class="cty-id-label">${t(cc === "FR" ? "cty.field.id.FR" : "cty.field.id")}</span>
        <input name="${prefix}-id" type="text" maxlength="30" value="${row.id || ""}" autocomplete="off" ${cc === "FR" ? 'inputmode="numeric" required' : ""}></label>
    </div>
  </div>`;
}
/** Wire the fields drawn by `membershipFields` inside `root`: the id's label and need follow the country. */
export function bindMembershipFields(root) {
  for (const box of root.querySelectorAll("[data-cty]")) {
    const sel = box.querySelector("select"), more = box.querySelector(".cty-more"), id = box.querySelector(`[name$="-id"]`);
    const sync = () => {
      const fr = sel.value === "FR";
      box.querySelector(".cty-pick-flag").innerHTML = flagImg(sel.value);
      more.hidden = !sel.value;
      box.querySelector(".cty-id-label").textContent = t(fr ? "cty.field.id.FR" : "cty.field.id");
      id.required = fr && !!sel.value;
      if (fr) id.setAttribute("inputmode", "numeric"); else id.removeAttribute("inputmode");
    };
    sel.addEventListener("change", sync);
    sync();
  }
}
/** The membership a form holds under `prefix`: { country, club, id }, or null when no country is chosen. */
export function readMembership(form, prefix) {
  const cc = form.querySelector(`[name="${prefix}-cc"]`)?.value;
  if (!cc) return null;
  return { country: cc, club: form.querySelector(`[name="${prefix}-club"]`)?.value || "", id: form.querySelector(`[name="${prefix}-id"]`)?.value || "" };
}
