// In the Ozimut app (docs/app/design.md): what the phone itself can give an analysis — the map through the system's document
// scanner (its edges found, the page straightened: a photographed map is skewed, and the calibration likes it flat), and on an
// iPhone the routes its watch wrote into Apple Health. The race analysed in the arena: the map scanned, the track taken from
// the watch, minutes after the finish. In a browser this module draws nothing.

import { html, $, $$, fmtDate } from "./util.js";
import { t, locale } from "./i18n.js";
import * as bridge from "./appbridge.js";
import { alertBox } from "./askbox.js";

/** The app's own buttons, drawn into `box` (emptied in a browser). `map`: a map is wanted too (not on an organiser's map);
 *  `onFiles(files)`: what the page does with dropped files. */
export async function appRow(box, { map = true, onFiles }) {
  if (!box) return;
  box.innerHTML = "";
  if (!bridge.inApp()) return;
  const feats = (await bridge.info())?.features || [];
  const scan = map && feats.includes("scan"), health = feats.includes("health");
  if (!scan && !health) return;
  box.innerHTML = html`<div class="an-cam-row">
    ${scan ? html`<button type="button" class="btn btn-primary" data-app="scan">${t("appf.scan")}</button>` : ""}
    ${health ? html`<button type="button" class="btn${scan ? "" : " btn-primary"}" data-app="health">${t("appf.health")}</button>` : ""}
    <span class="muted">${t(scan && health ? "appf.hint.both" : scan ? "appf.hint.scan" : "appf.hint.health")}</span></div>`;
  $("[data-app=scan]", box)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { const f = await bridge.scanMap(); if (f) onFiles([f]); } catch (x) { await alertBox(t("appf.scan.fail")); }
    e.target.disabled = false;
  });
  $("[data-app=health]", box)?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { const f = await pickHealth(); if (f) onFiles([f]); } catch (x) { await alertBox(t("appf.health.none")); }
    e.target.disabled = false;
  });
}

/** The workouts with a route of the last 30 days, one chosen. -> its GPX as a File, or null */
async function pickHealth() {
  const list = await bridge.call("healthRoutes", { days: 30 }, { timeout: 60000 });
  if (!list?.length) { await alertBox(t("appf.health.none")); return null; }
  const when = (ms) => new Date(ms).toLocaleString(locale(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const km = (m) => (m ? `${(m / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} km` : "");
  const d = document.createElement("dialog");
  d.className = "ask-dlg appf-dlg";
  d.innerHTML = html`<p class="ask-msg">${t("appf.health.pick")}</p>
    <div class="appf-list">${list.slice(0, 40).map((w) => html`<button type="button" class="btn appf-item" data-id="${w.id}">
      <b>${when(w.start)}</b><span class="muted">${[km(w.distance), w.source].filter(Boolean).join(" · ")}</span></button>`)}</div>
    <div class="ask-btns"><button type="button" class="btn" data-cancel>${t("dlg.cancel")}</button></div>`;
  document.body.append(d);
  try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
  const id = await new Promise((ok) => {
    d.addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]");
      if (b) ok(b.dataset.id); else if (e.target.closest("[data-cancel]")) ok(null);
    });
    d.addEventListener("cancel", () => ok(null));
  });
  try { d.close(); } catch (e) { /* closed */ }
  d.parentNode?.removeChild(d);
  if (!id) return null;
  const r = await bridge.call("healthRoute", { id }, { timeout: 60000 });
  return r?.gpx ? new File([r.gpx], `${r.name || "sortie"}.gpx`, { type: "application/gpx+xml" }) : null;
}
