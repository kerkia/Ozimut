// Chrono outside Ozimut's pages: the page the desktop app's hub serves — to its own window, to the arena's other computers
// and to phones. It lists the hub's events, opens one (or makes one), and runs the same window as the Orga tab, linked to
// the hub that served it. `?ev=<id>` opens an event at once, `?role=start|desk|finish|speaker|referee` keeps to that post,
// `?k=<token>` is the hub's key for another computer.

import { t, loadArea } from "../../i18n.js";
import { html } from "./kit.js";
import { newId } from "../log.js";
import { listEvents } from "../store.js";
import { mountChrono } from "./app.js";

export async function standalone(root) {
  await loadArea("chrono");
  document.title = "Ozimut Chrono";
  const q = new URLSearchParams(location.search), k = q.get("k") || "", role = q.get("role") || "all";
  const hubUrl = location.protocol.startsWith("http") ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/hub${k ? `?k=${encodeURIComponent(k)}` : ""}` : "";
  const open = (ev, seed = null) => { history.replaceState(null, "", `?${new URLSearchParams({ ...Object.fromEntries(q), ev })}`); return mountChrono(root, { ev, seed, hubUrl, role, user: "" }); };
  if (q.get("ev")) return open(q.get("ev"));

  let hub = [];
  try { const r = await fetch(`/hub/info${k ? `?k=${encodeURIComponent(k)}` : ""}`); if (r.ok) hub = (await r.json()).events || []; } catch (e) { /* no hub: this browser's own events */ }
  const mine = await listEvents().catch(() => []);
  const seen = new Set(), all = [...hub, ...mine].filter((e) => !seen.has(e.ev) && seen.add(e.ev));
  root.innerHTML = html`<div class="chr-home"><h1><span class="brand-o">O</span>zimut Chrono</h1><p class="lede">${t("chr.home.lede")}</p>
    <div class="chr-card"><h3>${t("chr.home.events")}</h3>${all.length ? html`<div class="chr-picks">${all.map((e) => html`<button type="button" class="chr-pick" data-ev="${e.ev}"><b>${e.name || t("chr.untitled")}</b><span>${e.date || ""}</span></button>`)}</div>`
      : html`<p class="chr-empty">${t("chr.home.none")}</p>`}</div>
    <div class="chr-card"><h3>${t("chr.home.new")}</h3><form id="chr-new" class="chr-grid"><label class="chr-f"><span>${t("chr.ev.name")}</span><input name="name" required></label>
      <label class="chr-f"><span>${t("chr.ev.date")}</span><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label class="chr-f"><span>${t("chr.ev.rules")}</span><select name="country"><option value="FR">${t("chr.rules.fr")}</option><option value="CA">${t("chr.rules.ca")}</option><option value="">${t("chr.rules.iof")}</option></select></label>
      <button type="submit" class="btn btn-primary">${t("chr.create")}</button></form></div>
    <p class="chr-home-doc"><a href="doc.html" target="_blank" rel="noopener">${t("chr.home.doc")}</a></p></div>`.toString();
  root.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => open(b.dataset.ev)));
  root.querySelector("#chr-new").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    open(newId() + newId().slice(0, 3), { name: String(f.get("name")).trim(), date: f.get("date"), country: f.get("country") || "", type: "individual" });
  });
  return null;
}
