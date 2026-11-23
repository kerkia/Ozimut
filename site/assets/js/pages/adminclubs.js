// The admin page's tab « Clubs » (docs/clubs/design.md §1, owner 2026-11-22): the claims to manage a club waiting for an
// administrator — the account, the club, whether its name is among the club's officers in the federation's directory — to confirm
// or refuse, and the clubs managed on Ozimut with their managers. functions/api/orgs/[[path]].js (pending, approve).

import { html, $, $$, fmtDate } from "../util.js";
import { t, loadArea } from "../i18n.js";
import * as country from "../country.js";
import { alertBox } from "../askbox.js";

async function call(path, body) {
  const r = await fetch(`api/orgs${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { status: r.status });
  return j;
}

/** Draws the tab in `box`. */
export async function draw(box) {
  await loadArea("club");
  box.innerHTML = html`<div class="empty">${t("misc.loading")}</div>`;
  let d;
  try { d = await call("/pending"); }
  catch (e) { box.innerHTML = html`<div class="notice">${e.status === 503 ? t("mc.notReady") : String(e.message)}</div>`; return; }
  const where = (o) => [o.code, country.name(o.cc)].filter(Boolean).join(" · ");
  box.innerHTML = html`
    <section class="card"><div class="card-head"><div><h2>${t("mc.ad.claims")}</h2><div class="hint">${t("mc.ad.claims.hint")}</div></div></div>
      ${d.claims.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("mc.col.club")}</th><th>${t("mc.col.account")}</th>
        <th>${t("mc.ad.check")}</th><th>${t("mc.col.since")}</th><th></th></tr></thead><tbody>${d.claims.map((c) => html`<tr data-org="${c.org.id}" data-user="${c.user.uid}">
          <td><b>${c.org.name}</b><br><span class="muted">${where(c.org)}${c.org.state === "claimed" ? ` · ${t("mc.state.claimed")}` : ""}</span></td>
          <td>${c.user.name}<br><span class="muted">${c.user.email}${c.user.licence ? ` · ${c.user.licence}` : ""}</span></td>
          <td>${c.officer ? html`<span class="mc-ok">${t("mc.ad.officer")}</span>` : html`<span class="muted">${t("mc.ad.notOfficer")}</span>`}
            ${c.member ? html`<br><span class="muted">${t("mc.ad.member")}</span>` : ""}
            ${c.user.club ? html`<br><span class="muted">${t("mc.ad.licClub", { code: c.user.club })}</span>` : ""}</td>
          <td class="num">${fmtDate(String(c.since).slice(0, 10), "short")}</td>
          <td class="r" style="white-space:nowrap"><button type="button" class="btn btn-sm btn-primary" data-ok="1">${t("mc.ad.confirm")}</button>
            <button type="button" class="btn btn-sm" data-ok="0">${t("mc.ad.refuse")}</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t("mc.ad.none")}</div>`}</section>
    <section class="card"><div class="card-head"><div><h2>${t("mc.ad.clubs")}</h2></div></div>
      ${d.clubs.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("mc.col.club")}</th><th class="r">${t("mc.col.members")}</th>
        <th>${t("mc.ad.managers")}</th></tr></thead><tbody>${d.clubs.map((o) => html`<tr><td><b>${o.name}</b><br><span class="muted">${where(o)}</span></td>
          <td class="r num">${o.members}</td><td>${o.managers.map((m) => html`${m.name} <span class="muted">${m.email}</span><br>`)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t("mc.ad.noClubs")}</div>`}</section>`;
  $$("[data-ok]", box).forEach((b) => b.addEventListener("click", async () => {
    const tr = b.closest("tr");
    b.disabled = true;
    try { await call(`/${tr.dataset.org}/approve`, { user: Number(tr.dataset.user), ok: b.dataset.ok === "1" }); draw(box); }
    catch (e) { b.disabled = false; alertBox(String(e.message)); }
  }));
}
