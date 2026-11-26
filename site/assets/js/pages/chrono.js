// Orga › an event › « Chrono » (owner, 2026-11-17; administrators only for now): Ozimut's race timing, in the event's
// tab. Chrono itself is free software with a repository of its own (github.com/kerkia/Chronoz, MPL 2.0); the site
// carries a copy of it, site/assets/js/chrono/ (tools/chrono_sync.mjs — never edited here), with its own texts, helpers
// and stylesheet. This page is the site's side: it loads that copy for the event shown and stops it when the tab is left.
// Chrono takes its language from the page (<html lang>, which i18n.js sets) and its colours from the site's tokens.

import { html } from "../util.js";
import * as auth from "../auth.js";
import * as offers from "../offers.js";

let running = null;

function style() {
  if (document.getElementById("chrono-css")) return Promise.resolve();
  return new Promise((ok) => {
    const l = document.createElement("link");
    l.id = "chrono-css"; l.rel = "stylesheet"; l.href = new URL("../chrono/css/chrono.css", import.meta.url).href;
    l.onload = l.onerror = ok;
    document.head.append(l);
  });
}

/** `event`: the Orga event `{ id, name, date, country, type, club, race, place }`; `opened`: what its club's plan opens (the
 *  events API's answer) — the line about timing a competition is offers.js's (docs/billing/design.md, chronoCompetition). */
export async function render(panel, { event, opened = null }) {
  // Chrono's own texts (its catalogues, in the page's language)
  const [{ t: ct }] = await Promise.all([import("../chrono/lib/i18n.js"), style()]);
  if (running) { try { await running.stop(); } catch (e) { /* gone */ } running = null; }
  const me = auth.session();
  if (!me?.admin) { panel.innerHTML = html`<p class="note">${ct("chr.adminOnly")}</p>`.toString(); return; }
  panel.innerHTML = html`${offers.eventNote({ ...event, opened }, { kind: event.kind, form: event.form })}<p class="chr-beta">${ct("chr.beta")} <button type="button" class="btn btn-sm" id="chrono-app-dl">${ct("chr.app.get")}</button></p><div id="chrono-root" class="chr-in-tab"></div>`.toString();
  panel.querySelector("#chrono-app-dl").addEventListener("click", async () => (await import("../chrono/ui/prepare.js")).appDialog());
  const root = panel.querySelector("#chrono-root");
  const { mountChrono } = await import("../chrono/ui/app.js");
  // the event's id in Chrono is the Orga event's: every member's browser opens the same log
  const mine = await mountChrono(root, { ev: `e${event.id}`, seed: event, session: true, user: me.name || me.nom || "" });
  running = mine;
  // the tab left (another tab, another page): the readers are released and the last operations written
  const watch = new MutationObserver(() => { if (!root.isConnected) { watch.disconnect(); if (running === mine) running = null; mine.stop(); } });
  watch.observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
}
