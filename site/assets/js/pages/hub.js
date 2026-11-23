// The modules page (#/modules; owner, 2026-10-30): where one lands once signed in or entered without an account, and where
// the logo leads back. Ozimut's four modules — Arena, Stats, Coach, Orga — side by side, each opening on its first page; the
// session's own actions under them (sign out; for a visitor without an account: sign in, create an account, leave). Also
// the page an Orga address shows without an account, or on a phone (route « orgaOff »): signed in on a computer, it opens
// whether the module is shown or not (2026-11-12).

import { inApp } from "../appbridge.js";
import { html, raw, $, $$, nameParts } from "../util.js";
import { t } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import { visibleModules, moduleShown, CREATOR_MODULES, moduleMenus, moduleHome, isPhone, leaveGuest, modBeta, betaSup } from "../app.js";

// one drawing a module, in the module's colour (currentColor)
const ICONS = {
  arena: `<path d="M8 4v17" /><path d="M8 4h11v9H8" /><path d="M8 4l11 9" />`,
  stats: `<path d="M4 20h16" /><path d="M7 20v-7" /><path d="M12 20V6" /><path d="M17 20v-10" />`,
  coach: `<circle cx="12" cy="13" r="7" /><path d="M12 13l3-3" /><path d="M10 3h4" /><path d="M12 3v3" />`,
  orga: `<rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 10h6M9 14h6M9 18h3" />`,
  // Carto: contour lines and a pen; Pixel: a cube of three faces
  carto: `<path d="M3 17c3-4 6-1 9-4s4-6 9-6" /><path d="M3 12c3-3 5-1 8-3s4-4 7-4" /><path d="M14 21l6-6 1.5 1.5-6 6H14z" />`,
  pixel: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />`,
};
export const icon = (m) => raw(`<svg class="hub-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[m]}</svg>`);

/** Show a creator's module (Orga, Carto) to this account (owner, 2026-11-12: one click from the modules page). */
async function turnOn(btn, m) {
  btn.disabled = true;
  const r = await auth.api("api/account/settings", { [m]: true });
  if (!r.ok) { btn.disabled = false; btn.insertAdjacentHTML("afterend", html`<p class="notice">${t("hub.orga.err")}</p>`.toString()); return false; }
  await auth.refresh();
  return true;
}

/** What the Orga card says when it cannot open here — without an account, on a phone —, and its button; else null. Shown
 *  or not (app.moduleShown), Orga opens for any signed-in account on a computer (owner, 2026-11-12: hidden never blocks). */
function orgaState() {
  const me = auth.session();
  if (!me) return inApp() ? { note: t("hub.orga.guest.app") }      // (the Ozimut app makes no account: docs/app/design.md)
    : { note: t("hub.orga.guest"), action: html`<a class="btn btn-primary" href="#/compte/inscription">${t("hub.orga.register")}</a>` };
  if (isPhone()) return { note: t("hub.orga.phone") };
  return null;
}

/** Under the cards, one quiet line (owner, 2026-11-12): the creators' modules not shown, each a click away, and the consumers'
 *  modules hidden in Réglages. A visitor without an account is told they come with one. */
function quietLine() {
  const me = auth.session();
  if (!me) return html`<p class="hub-quiet muted">${t("hub.creators.guest")}</p>`;
  const off = CREATOR_MODULES.filter((m) => !moduleShown(m) && !(m === "orga" && isPhone()));
  const hidden = (me.hiddenModules || []).filter((m) => m !== "pixel" || me.admin);
  if (!off.length && !hidden.length) return "";
  return html`<div class="hub-quiet">
    ${off.length ? html`<span class="hub-quiet-ask">${t("hub.creators.ask")}</span>${off.map((m) => html`<button type="button" class="btn btn-sm" data-mod="${m}" data-show-mod="${m}" title="${t(`mod.${m}.tag`)}">${icon(m)}<span>${t("hub.creators.show", { mod: t(`mod.${m}`) })}</span></button>`)}` : ""}
    ${hidden.length ? html`<span class="muted hub-quiet-hidden">${t("hub.hidden", { mods: hidden.map((m) => t(`mod.${m}`)).join(", ") })} <a href="#/reglages?onglet=modules">${t("st.link")}</a></span>` : ""}
  </div>`;
}

// Arena is one page, the competitions: its card says what a competition chosen there offers (owner, 2026-10-30), not links
const ARENA_STEPS = ["agenda", "results", "live", "splits"];      // (the GPS analyses are Coach's, owner 2026-10-30)
// the modules of one page (owner, 2026-11-12): their cards say what they offer (hub.<module>.step.<key>)
const STEPS = { arena: ARENA_STEPS, orga: ["events", "trace", "race", "team"], carto: ["draw", "data", "field", "export"],
  pixel: ["maps", "race", "results", "analysis"] };
const TAB_KEY = "ocn.hub.tab";                                    // the module tab shown on a phone, for the visit

function card(m) {
  const items = moduleMenus()[m];
  const locked = m === "orga" ? orgaState() : null;
  const guest = !auth.session();
  // an open module's whole card leads into it (owner, 2026-10-31: as the documentation's cards); its own links and buttons
  // stay on top (app.css « .hub-card.go »)
  return html`<section class="hub-card${locked ? "" : " go"}" data-mod="${m}">
    <div class="hub-card-head">${icon(m)}<div><h2>${locked ? t(`mod.${m}`) : html`<a href="${moduleHome(m)}">${t(`mod.${m}`)}</a>`}${modBeta(m)}</h2><p>${t(m === "coach" ? "mod.coach.tag" : `mod.${m}.tag`)}</p></div></div>
    <p class="hub-text">${t(m === "coach" ? "hub.coach.text" : `hub.${m}.text`)}</p>
    ${guest && m === "stats" ? html`<p class="muted hub-note">${t("hub.stats.guest")}</p>` : ""}
    ${guest && m === "coach" ? html`<p class="muted hub-note">${t("hub.coach.guest")}</p>` : ""}
    ${locked ? html`<p class="muted hub-note">${locked.note}</p>${locked.action ? html`<div class="hub-actions">${locked.action}</div>` : ""}`
      : html`<ul class="hub-pages">${STEPS[m] ? STEPS[m].map((k) => html`<li><span>${t(`hub.${m}.step.${k}`)}${m === "orga" && k === "trace" ? betaSup() : ""}</span></li>`)
        : items.map(([, href, text]) => html`<li><a href="${href}">${text}</a></li>`)}</ul>
        <div class="hub-actions"><a class="btn btn-primary" href="${moduleHome(m)}">${t("hub.open", { mod: t(`mod.${m}`) })}</a></div>`}
  </section>`;
}

function session() {
  const me = auth.session();
  if (me) {
    return html`<div class="hub-session"><span>${t("hub.signedAs", { name: nameParts(me.nom).first || me.nom })}</span>
      <a href="#/reglages">${t("st.link")}</a><a href="#/documentation">${t("nav.docs")}</a>
      <button type="button" class="btn btn-sm" data-hub-logout>${t("auth.logout")}</button></div>`;
  }
  return html`<div class="hub-session"><span>${t("hub.guestAs")}</span>
    <a class="btn btn-sm btn-primary hub-login" href="#/?s=login">${t("hub.login")}</a>
    ${inApp() ? "" : html`<a class="btn btn-sm" href="#/compte/inscription">${t("hub.register")}</a>`}
    <button type="button" class="btn btn-sm btn-ghost" data-hub-leave>${t("hub.leave")}</button></div>`;
}

export async function render(main, r) {
  if (r.route === "orgaOff") return orgaOff(main);
  const me = auth.session();
  // the modules shown to this visitor (app.moduleShown: no Orga tile on a phone, the creators' to those who use them)
  const mods = visibleModules();
  // on a phone the modules are tabs over one card (owner, 2026-10-31: as a notebook's, every module in sight without
  // scrolling); app.css shows the tabs under 640 px only, the cards side by side above. The tab chosen is kept for the visit.
  let cur = null;
  try { cur = sessionStorage.getItem(TAB_KEY); } catch (e) {}
  if (!mods.includes(cur)) cur = mods[0];
  main.innerHTML = html`<div class="hub">
    <div class="hub-head"><h1>${me ? t("hub.hello", { name: nameParts(me.nom).first || me.nom }) : t("hub.welcome")}</h1>
      <p class="lede">${t("hub.lede")}</p></div>
    <div class="hub-tabs" role="tablist" aria-label="${t("mod.pick")}">${mods.map((m) => html`<button type="button" role="tab"
      data-hub-tab="${m}" data-mod="${m}" aria-selected="${String(m === cur)}">${icon(m)}<span>${t(`mod.${m}`)}${modBeta(m)}</span></button>`)}</div>
    <div class="hub-grid tabbed">${mods.map(card)}</div>
    ${quietLine()}
    ${session()}
  </div>`;
  const showTab = (m) => {
    $$("[data-hub-tab]", main).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.hubTab === m)));
    $$(".hub-grid.tabbed > .hub-card", main).forEach((c) => c.classList.toggle("tab-on", c.dataset.mod === m));
    try { sessionStorage.setItem(TAB_KEY, m); } catch (e) {}
  };
  showTab(cur);
  main.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-hub-tab]");
    if (tab) { showTab(tab.dataset.hubTab); return; }
    const on = e.target.closest("[data-show-mod]");
    if (on && (await turnOn(on, on.dataset.showMod))) { location.hash = moduleHome(on.dataset.showMod); return; }
    if (e.target.closest("[data-hub-logout]")) {
      await auth.logout();
      data.dropPrivate();
      location.hash = "#/";
    }
    if (e.target.closest("[data-hub-leave]")) leaveGuest();
  });
  return { title: t("mod.pick") };
}

/** An Orga page without an account, or on a phone: why. */
function orgaOff(main) {
  const st = orgaState() || { note: t("hub.orga.phone") };
  main.innerHTML = html`<div class="hub hub-narrow">
    <div class="hub-grid one">${card("orga")}</div>
    <p><a href="#/modules">${t("mod.back")}</a></p>
  </div>`;
  return { title: t("mod.orga"), note: st.note };
}
