// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Chrono outside Ozimut's pages: the page the desktop app's hub serves — to its own window, to the arena's other computers
// and to phones. It lists the hub's events, opens one (or makes one), and runs the same window as the Orga tab, linked to
// the hub that served it. `?ev=<id>` opens an event at once, `?role=start|desk|finish|speaker|referee` keeps to that post,
// `?k=<token>` is the hub's key for another computer.

import { t, lang, setLang, LANGS, LANG_NAMES } from "../lib/i18n.js";
import { html } from "./kit.js";
import { newId } from "../log.js";
import { listEvents } from "../store.js";
import { formDialog, field, values } from "./kit.js";
import { mountChrono } from "./app.js";

/** The page's themes, ozimut.com's five (css/base.css); the one in use was set by the page before anything was drawn. */
const THEMES = ["light", "clearing", "forest", "undergrowth", "dark"];
const theme = () => document.documentElement.dataset.theme || "light";

export async function standalone(root) {
  document.title = "Chronoz";
  const q = new URLSearchParams(location.search), k = q.get("k") || "", role = q.get("role") || "all";
  const hubUrl = location.protocol.startsWith("http") ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/hub${k ? `?k=${encodeURIComponent(k)}` : ""}` : "";
  const open = (ev, seed = null) => { history.replaceState(null, "", `?${new URLSearchParams({ ...Object.fromEntries(q), ev })}`); return mountChrono(root, { ev, seed, hubUrl, role, user: "" }); };
  if (q.get("ev")) return open(q.get("ev"));

  let hub = [], network = [];
  const ask = async () => { try { const r = await fetch(`/hub/info${k ? `?k=${encodeURIComponent(k)}` : ""}`); if (r.ok) { const j = await r.json(); hub = j.events || []; network = j.peers?.network || []; } } catch (e) { /* no hub: this browser's own events */ } };
  await ask();
  const mine = await listEvents().catch(() => []);
  const seen = new Set(), all = [...hub, ...mine].filter((e) => !seen.has(e.ev) && seen.add(e.ev));
  root.innerHTML = html`<div class="chr-home"><h1><span class="brand-o">O</span>zimut Chrono</h1><p class="lede">${t("chr.home.lede")}</p>
    <div class="chr-card"><h3>${t("chr.home.events")}</h3>${all.length ? html`<div class="chr-picks">${all.map((e) => html`<button type="button" class="chr-pick" data-ev="${e.ev}"><b>${e.name || t("chr.untitled")}</b><span>${e.date || ""}</span></button>`)}</div>`
      : html`<p class="chr-empty">${t("chr.home.none")}</p>`}</div>
    <div class="chr-card"><h3>${t("chr.home.new")}</h3><form id="chr-new" class="chr-grid"><label class="chr-f"><span>${t("chr.ev.name")}</span><input name="name" required></label>
      <label class="chr-f"><span>${t("chr.ev.date")}</span><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label class="chr-f"><span>${t("chr.ev.rules")}</span><select name="country"><option value="FR">${t("chr.rules.fr")}</option><option value="CA">${t("chr.rules.ca")}</option><option value="">${t("chr.rules.iof")}</option></select></label>
      <button type="submit" class="btn btn-primary">${t("chr.create")}</button></form></div>
    <div class="chr-card" id="chr-network"></div>
    <p class="chr-home-doc"><a href="doc.html" target="_blank" rel="noopener">${t("chr.home.doc")}</a>
      <label>${t("chr.home.theme")} <select id="chr-theme">${THEMES.map((th) => html`<option value="${th}" ${th === theme() ? "selected" : ""}>${t(`chr.theme.${th}`)}</option>`)}</select></label>
      <label>${t("chr.home.lang")} <select id="chr-lang">${LANGS.map((l) => html`<option value="${l}" ${l === lang() ? "selected" : ""}>${LANG_NAMES[l]}</option>`)}</select></label></p></div>`.toString();
  root.querySelector("#chr-theme").addEventListener("change", (e) => { document.documentElement.dataset.theme = e.target.value; try { localStorage.setItem("chronoz.theme", e.target.value); } catch (err) { /* this visit only */ } });
  root.querySelector("#chr-lang").addEventListener("change", (e) => setLang(e.target.value));
  root.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => { clearInterval(tick); open(b.dataset.ev); }));
  // the events other computers of the arena hold (their app says so on the network): one is joined with its code, once
  const local = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(location.host);
  const drawNet = () => {
    const box = root.querySelector("#chr-network");
    if (!box) return false;
    box.hidden = !local;
    box.innerHTML = html`<h3>${t("chr.home.network")}</h3>${network.length ? html`<div class="chr-picks">${network.map((e) => html`<button type="button" class="chr-pick" data-join="${e.ev}"><b>${e.name || t("chr.untitled")}</b><span>${e.date || ""}</span><span>${t("chr.home.from", { names: e.from.join(", ") })}</span></button>`)}</div>`
      : html`<p class="chr-empty">${t("chr.home.networkNone")}</p>`}<p class="chr-dim">${t("chr.home.networkHint")}</p>`.toString();
    box.querySelectorAll("[data-join]").forEach((b) => b.addEventListener("click", () => join(network.find((e) => e.ev === b.dataset.join))));
    return true;
  };
  async function join(e) {
    if (!e) return;
    const ev = await formDialog({ title: t("chr.home.joinTitle", { name: e.name || t("chr.untitled") }), ok: t("chr.home.join"),
      body: html`<p>${t("chr.home.codeAsk", { from: e.from.join(", ") })}</p>${field(t("chr.lan.code"), html`<input name="code" class="chr-lan-in" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" required autofocus>`)}`,
      async onOk(dlg) {
        const code = values(dlg).code.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length < 4) return false;
        dlg.fail(t("chr.home.joining"));
        const r = await fetch(`/hub/join?${new URLSearchParams({ ev: e.ev, code })}`).then((x) => x.json()).catch(() => ({ result: "unreachable" }));
        if (r.result === "ok") return e.ev;
        dlg.fail(t(r.result === "code" ? "chr.home.codeBad" : "chr.home.unreachable"));
        return false;
      } });
    if (ev) { clearInterval(tick); open(ev); }
  }
  drawNet();
  const tick = setInterval(async () => { if (!root.querySelector("#chr-network")) { clearInterval(tick); return; } const was = JSON.stringify(network); await ask(); if (JSON.stringify(network) !== was) drawNet(); }, 3000);
  root.querySelector("#chr-new").addEventListener("submit", (e) => {
    e.preventDefault();
    clearInterval(tick);
    const f = new FormData(e.target);
    open(newId() + newId().slice(0, 3), { name: String(f.get("name")).trim(), date: f.get("date"), country: f.get("country") || "", type: "individual" });
  });
  return null;
}
