// Orga › an event › « Chrono » (owner, 2026-11-17; administrators only for now): Ozimut's race timing, in the event's
// tab. The screens and the engine are in site/assets/js/chrono/ (docs/chrono/design.md); this page loads them for the
// event shown and stops them when the tab is left.

import { t, loadArea } from "../i18n.js";
import { html } from "../util.js";
import * as auth from "../auth.js";

let running = null;

function style() {
  if (document.getElementById("chrono-css")) return Promise.resolve();
  return new Promise((ok) => {
    const l = document.createElement("link");
    l.id = "chrono-css"; l.rel = "stylesheet"; l.href = "/assets/chrono.css";
    l.onload = l.onerror = ok;
    document.head.append(l);
  });
}

/** `event`: the Orga event `{ id, name, date, country, type, club, race, place }`. */
export async function render(panel, { event }) {
  await Promise.all([loadArea("chrono"), style()]);
  if (running) { try { await running.stop(); } catch (e) { /* gone */ } running = null; }
  const me = auth.session();
  if (!me?.admin) { panel.innerHTML = html`<p class="note">${t("chr.adminOnly")}</p>`.toString(); return; }
  panel.innerHTML = html`<p class="chr-beta">${t("chr.beta")}</p><div id="chrono-root" class="chr-in-tab"></div>`.toString();
  const root = panel.querySelector("#chrono-root");
  const { mountChrono } = await import("../chrono/ui/app.js");
  // the event's id in Chrono is the Orga event's: every member's browser opens the same log
  const mine = await mountChrono(root, { ev: `e${event.id}`, seed: event, session: true, user: me.name || me.nom || "" });
  running = mine;
  // the tab left (another tab, another page): the readers are released and the last operations written
  const watch = new MutationObserver(() => { if (!root.isConnected) { watch.disconnect(); if (running === mine) running = null; mine.stop(); } });
  watch.observe(document.getElementById("main") || document.body, { childList: true, subtree: true });
}
