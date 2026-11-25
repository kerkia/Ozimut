// The plan an account has, as the Ozimut app shows it in Réglages (docs/billing/design.md §9, docs/app/design.md): its name
// and who opened it — no price, no button, no link, nothing about buying. Loaded only through ../offers.js. Its few words are
// the area « plan » (keys plan.*), which holds no selling word and is the only catalogue of the gate the app reads.

import { html, fmtDate } from "../util.js";
import { t, has, loadArea } from "../i18n.js";
import * as auth from "../auth.js";

/** Draws into `box` (a hidden .card), shown only when the account holds a plan or something is opened for it. */
export async function draw(box) {
  await loadArea("plan");
  const s = auth.session() || {};
  let S = null;
  try {
    const r = await fetch("api/billing", { credentials: "same-origin", cache: "no-store" });      // the app gets { plan, why } only
    if (r.ok) S = await r.json();
  } catch (e) { S = null; }
  const plan = S?.plan || s.plan || "free", why = S?.why || s.ent?.why || {};
  const by = [];
  for (const w of Object.values(why)) {
    if (!w?.name || ["person", "user", "free"].includes(w.scope)) continue;
    if (!by.some((x) => x.name === w.name)) by.push(w);
  }
  if (plan === "free" && !by.length) return;
  const name = (p) => (has(`plan.name.${p}`) ? t(`plan.name.${p}`) : p);
  box.innerHTML = html`<div class="card-head"><h2>${t("plan.title")}</h2></div><div class="card-body stack" style="gap:6px">
    ${plan !== "free" ? html`<div><b>${name(plan)}</b></div>` : ""}
    ${by.map((w) => html`<div class="soft">${t("plan.opened", { name: w.name })}${w.until ? html` <span class="muted">· ${t("plan.until", { date: fmtDate(String(w.until).slice(0, 10)) })}</span>` : ""}</div>`)}
  </div>`;
  box.hidden = false;
}
