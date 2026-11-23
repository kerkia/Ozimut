// « Mon club » (#/monclub, route myClub; owner, 2026-11-22; docs/clubs/design.md §1, functions/api/orgs/[[path]].js): the club as
// an entity — its members and their roles (manager, organiser, mapper, treasurer), its events, its maps, its accounts and its
// settings. Outside the modules, as Réglages. In France the club comes from the licence (its members join by themselves, the
// federation's tree giving the clubs); elsewhere the club of one's country (Réglages › Mes pays) is declared. A club's officer
// listed by the federation manages it at once; anyone else's request waits for an administrator.
// Addresses: ?org=<id> (an account in several clubs), ?onglet=membres|evenements|cartes|comptes|reglages, ?invite=<token>.
// The tabs « Cartes » and « Comptes » are other modules' (./clubmaps.js, ./clubaccounts.js: render(panel, org, me)), drawn when
// they exist.

import { html, raw, $, $$, fmtDate } from "../util.js";
import { t, tn, loadArea } from "../i18n.js";
import * as auth from "../auth.js";
import * as country from "../country.js";
import { pageTabs, tabFrom, bindPageTabs } from "../ui.js";
import { confirmBox, alertBox } from "../askbox.js";

const BASE = "#/monclub";
const ROLES = ["manager", "organiser", "mapper", "treasurer"];
const MODES = ["self", "champ", "all", "case"];

async function api(path = "", { method = "GET", body } = {}) {
  const r = await fetch(`api/${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("cnx:unauthorised"));
  if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error || String(r.status), status: r.status, data: j });
  return j;
}
const errText = (e) => { const k = `mc.err.${String(e?.code || "").replace(/\s+/g, "_")}`; return t(k) !== k ? t(k) : t("mc.err.other"); };
const roleLabel = (r) => t(`mc.role.${r}`);
const kindLabel = (k) => t(`mc.kind.${k}`);
const where = (o) => [kindLabel(o.kind), o.cc ? country.name(o.cc) : "", o.code ? `${t("mc.code")} ${o.code}` : ""].filter(Boolean).join(" · ");

export async function render(main, r) {
  await loadArea("club");
  const q = r.query || {};
  main.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  // a club's map shared by a link (?carte=<token>, the library's « lien de partage »): that map alone (pages/clubmaps.js)
  if (q.carte) return (await import("./clubmaps.js")).sharedPage(main, q.carte);
  // an invitation link: joined, then the club opened
  if (q.invite) {
    try {
      const j = await api("orgs/join-link", { method: "POST", body: { token: q.invite } });
      location.replace(`${BASE}?org=${j.org}`);
      alertBox(t("mc.inv.joined"));
      return { title: t("mc.title") };
    } catch (e) {
      main.innerHTML = html`<div class="page-head"><div><h1>${t("mc.title")}</h1></div></div><div class="notice">${errText(e)}</div>`;
      return { title: t("mc.title") };
    }
  }
  let mine;
  try { mine = await api("orgs"); }
  catch (e) {
    main.innerHTML = html`<div class="page-head"><div><h1>${t("mc.title")}</h1></div></div>
      <div class="notice">${e.status === 503 ? t("mc.notReady") : errText(e)}</div>`;
    return { title: t("mc.title") };
  }
  const orgs = mine.orgs || [];
  const shown = orgs.filter((o) => o.mstate === "ok" || o.claim || o.mstate === "pending");
  const pick = shown.find((o) => String(o.id) === String(q.org)) || shown.find((o) => o.mstate === "ok") || shown[0];
  if (!pick) return nonePage(main, mine);
  return clubPage(main, pick, shown, mine, q);
}

// ---- no club yet: the clubs one could claim or join, a search --------------------------------------------------------------
function nonePage(main, mine) {
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("mc.title")}</h1><p class="lede">${t("mc.none.lede")}</p></div></div>
    <div class="stack mc-wrap">
      ${candidatesCard(mine.candidates || [])}
      <section class="card"><div class="card-head"><h2>${t("mc.find.title")}</h2></div><div class="card-body stack" style="gap:10px">
        <div class="row">
          <label class="field"><span>${t("mc.find.country")}</span><select id="mc-cc">${country.MEMBERS.map((c) => html`<option value="${c}" ${c === country.current() ? "selected" : ""}>${country.name(c)}</option>`)}</select></label>
          <label class="field" style="flex:1 1 240px"><span>${t("mc.find.q")}</span><input type="search" id="mc-q" autocomplete="off"></label></div>
        <div id="mc-found"></div>
        <p class="muted mc-rule">${t("mc.cand.rule")}</p>
      </div></section>
    </div>`;
  bindCandidates(main);
  let timer;
  const search = async () => {
    const cc = $("#mc-cc").value, qq = $("#mc-q").value.trim();
    const box = $("#mc-found");
    if (qq.length < 2) { box.innerHTML = ""; return; }
    try {
      const { orgs } = await api(`orgs/find?${new URLSearchParams({ cc, q: qq })}`);
      box.innerHTML = orgs.length ? html`<ul class="mc-list">${orgs.map((o) => html`<li><span><b>${o.name}</b> <span class="muted">${where(o)}</span>
          ${o.state === "claimed" ? html`<span class="tag">${t("mc.state.claimed")}</span>` : ""}</span>
          <span class="row" style="gap:6px">${o.org && o.state === "claimed" ? html`<button type="button" class="btn btn-sm" data-join="${o.org}">${t("mc.cand.join")}</button>` : ""}
          <button type="button" class="btn btn-sm" data-claim="${JSON.stringify(o.code ? { cc: o.cc, kind: o.kind, code: o.code } : { cc: o.cc, name: o.name })}">${t("mc.cand.claim")}</button></span></li>`)}</ul>`
        : html`<div class="empty">${t("mc.find.none")}</div>`;
      bindCandidates(box);
    } catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; }
  };
  $("#mc-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 300); });
  $("#mc-cc").addEventListener("change", search);
  return { title: t("mc.title") };
}

/** The clubs the account could claim (« Gérer mon club ») or join. */
function candidatesCard(cands) {
  if (!cands.length) return html`<div class="notice info">${t("mc.none.nothing")}</div>`;
  return html`<section class="card"><div class="card-head"><h2>${t("mc.cand.title")}</h2></div><div class="card-body stack" style="gap:10px">
    <ul class="mc-list">${cands.map((c) => html`<li><span><b>${c.name}</b> <span class="muted">${where(c)}</span>
        ${c.state === "claimed" ? html`<span class="tag">${t("mc.state.claimed")}</span>` : html`<span class="tag">${t("mc.state.unclaimed")}</span>`}
        ${c.officer ? html`<br><span class="mc-ok">${t("mc.cand.officer")}</span>` : ""}</span>
      <span class="row" style="gap:6px">${c.org && c.cc !== "FR" ? html`<button type="button" class="btn btn-sm" data-join="${c.org}">${t("mc.cand.join")}</button>` : ""}
        <button type="button" class="btn btn-sm btn-primary" data-claim="${JSON.stringify(c.code ? { cc: c.cc, kind: c.kind, code: c.code } : { cc: c.cc, name: c.name })}">${t("mc.cand.claim")}</button></span></li>`)}</ul>
    <p class="muted mc-rule">${t("mc.cand.rule")}</p></div></section>`;
}
function bindCandidates(root) {
  $$("[data-claim]", root).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const j = await api("orgs/claim", { method: "POST", body: JSON.parse(b.dataset.claim) });
      await alertBox(t(j.state === "manager" ? "mc.claim.done" : "mc.claim.pending"));
      location.hash = `${BASE}?org=${j.org}`;
    } catch (e) { b.disabled = false; alertBox(errText(e)); }
  }));
  $$("[data-join]", root).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const j = await api(`orgs/${b.dataset.join}/join`, { method: "POST" });
      if (j.state !== "ok") await alertBox(t("mc.join.pending"));
      location.hash = `${BASE}?org=${b.dataset.join}`;
    } catch (e) { b.disabled = false; alertBox(errText(e)); }
  }));
}

// ---- one club ----------------------------------------------------------------------------------------------------------
async function clubPage(main, pick, shown, mine, q) {
  let D;
  try { D = await api(`orgs/${pick.id}`); }
  catch (e) { main.innerHTML = html`<div class="notice">${errText(e)}</div>`; return { title: t("mc.title") }; }
  const org = D.org, R = D.rights || {}, me = D.me;
  const tabs = [["membres", t("mc.tab.membres")], ["evenements", t("mc.tab.evenements")], ["cartes", t("mc.tab.cartes")], ["comptes", t("mc.tab.comptes")]];
  if (R.manage || R.treasure) tabs.push(["reglages", t("mc.tab.reglages")]);
  const tab = tabFrom(tabs, q);
  const myRoles = me?.roles || [];
  main.innerHTML = html`
    <div class="page-head"><div><h1>${org.name}</h1>
      <div class="lede meta"><span>${where(org)}</span>${org.parent ? html`<span>${org.parent.name}</span>` : ""}
        <span>${tn("mc.members", org.members)}</span>
        <span>${org.state === "claimed" ? t("mc.state.claimed") : t("mc.state.unclaimed")}</span></div></div>
      ${shown.length > 1 ? html`<label class="field"><span>${t("mc.pick")}</span><select id="mc-pick">${shown.map((o) => html`<option value="${o.id}" ${o.id === org.id ? "selected" : ""}>${o.name}</option>`)}</select></label>` : ""}
    </div>
    ${me?.state === "pending" && !me.claim ? html`<div class="notice">${t("mc.join.pending")}</div>` : ""}
    ${me?.claim ? html`<div class="notice">${t("mc.claimPending")}</div>` : ""}
    ${R.member ? html`<div class="mc-me row"><span class="muted">${t("mc.myRoles")}</span>${myRoles.length ? myRoles.map((r) => html`<span class="tag mc-role">${roleLabel(r)}</span>`) : html`<span class="tag">${t("mc.role.member")}</span>`}
      ${me?.until ? html`<span class="muted">${t("mc.guestUntil", { date: fmtDate(me.until) })}</span>` : ""}</div>` : ""}
    ${org.state !== "claimed" && !me?.claim ? html`<div class="notice info row" style="justify-content:space-between">${t("mc.noManager")}
      <button type="button" class="btn btn-sm btn-primary" data-claim="${JSON.stringify(org.code ? { cc: org.cc, kind: org.kind, code: org.code } : { cc: org.cc, name: org.name })}">${t("mc.cand.claim")}</button></div>` : ""}
    ${pageTabs(tabs, tab)}
    ${tabs.map(([k]) => html`<div data-panel="${k}" ${raw(k === tab ? "" : "hidden")} class="mc-panel"></div>`)}`;
  bindCandidates(main);
  $("#mc-pick")?.addEventListener("change", (e) => { location.hash = `${BASE}?org=${e.target.value}`; });
  const drawn = new Set();
  const draw = (k) => {
    if (drawn.has(k)) return;
    drawn.add(k);
    const panel = $(`[data-panel="${k}"]`, main);
    const ctx = { org, D, R, me, redraw: () => { drawn.clear(); clubPage(main, pick, shown, mine, { ...q, onglet: k }); } };
    if (k === "membres") membersTab(panel, ctx);
    else if (k === "evenements") eventsTab(panel, ctx);
    else if (k === "cartes") otherModule(panel, ctx, () => import("./clubmaps.js"));
    else if (k === "comptes") otherModule(panel, ctx, () => import("./clubaccounts.js"));
    else if (k === "reglages") settingsTab(panel, ctx);
  };
  bindPageTabs(main, tabs, tab, draw);
  draw(tab);
  return { title: `${t("mc.title")} · ${org.name}` };
}

/** « Cartes », « Comptes »: another module's, when it exists. */
async function otherModule(panel, { org, D }, load) {
  let mod = null;
  try { mod = await load(); } catch (e) { mod = null; }
  if (!mod?.render) { panel.innerHTML = html`<div class="card"><div class="empty">${t("mc.soon")}</div></div>`; return; }
  try { await mod.render(panel, { ...org, rights: D.rights, settings: D.settings }, D.me); }
  catch (e) { panel.innerHTML = html`<div class="notice">${errText(e)}</div>`; }
}

// ---- Membres et rôles --------------------------------------------------------------------------------------------------
function membersTab(panel, { org, D, R, me, redraw }) {
  const list = D.members || [];
  const ok = list.filter((m) => m.state === "ok"), waiting = list.filter((m) => m.state === "pending");
  const chips = (m) => (R.manage
    ? html`<span class="chips">${ROLES.map((r) => html`<button type="button" class="chip toggle" data-role="${r}" data-uid="${m.uid}" aria-pressed="${m.roles.includes(r)}" title="${t(`mc.role.${r}.hint`)}"><span class="tick"></span>${roleLabel(r)}</button>`)}</span>`
    : m.roles.length ? m.roles.map((r) => html`<span class="tag mc-role">${roleLabel(r)}</span> `) : html`<span class="muted">—</span>`);
  panel.innerHTML = html`
    ${!R.member ? html`<div class="notice info">${t("mc.notMember")}</div>` : ""}
    ${R.manage && waiting.length ? html`<section class="card"><div class="card-head"><div><h2>${t("mc.pending.title")}</h2></div></div>
      <div class="table-wrap"><table class="data compact"><tbody>${waiting.map((m) => html`<tr data-uid="${m.uid}"><td><b>${m.name}</b></td>
        <td class="muted">${m.claim ? t("mc.pending.claim") : t(`mc.src.${m.source}`)}</td><td class="num">${fmtDate(String(m.since).slice(0, 10), "short")}</td>
        <td class="r" style="white-space:nowrap"><button type="button" class="btn btn-sm btn-primary" data-accept="${m.uid}">${t("mc.accept")}</button>
          <button type="button" class="btn btn-sm" data-remove="${m.uid}">${t("mc.refuse")}</button></td></tr>`)}</tbody></table></div></section>` : ""}
    ${R.member ? html`<section class="card"><div class="card-head"><div><h2>${t("mc.members.title")}</h2><div class="hint">${t(R.manage ? "mc.members.hintManage" : "mc.members.hint")}</div></div></div>
      <div class="table-wrap"><table class="data mc-members" data-freeze="1" data-freeze-phone="1"><thead><tr><th>${t("mc.col.name")}</th><th>${t("mc.col.roles")}</th><th>${t("mc.col.source")}</th>
        <th>${t("mc.col.since")}</th><th></th></tr></thead>
      <tbody>${ok.map((m) => html`<tr data-uid="${m.uid}" class="${m.you ? "me" : ""}"><td><b>${m.name}</b>${m.you ? html` <span class="muted">(${t("mc.you")})</span>` : ""}
          ${m.until ? html`<br><span class="muted">${m.expired ? t("mc.expired") : t("mc.guestUntil", { date: fmtDate(m.until) })}</span>` : ""}
          ${m.claim ? html`<br><span class="muted">${t("mc.pending.claim")}</span>` : ""}</td>
        <td>${chips(m)}</td><td class="muted">${t(`mc.src.${m.source}`)}</td><td class="num">${fmtDate(String(m.since).slice(0, 10), "short")}</td>
        <td class="r">${m.you ? html`<button type="button" class="btn btn-sm" data-leave="1">${t("mc.leave")}</button>`
          : R.manage ? html`<button type="button" class="btn btn-sm btn-ghost" data-remove="${m.uid}">${t("mc.remove")}</button>` : ""}</td></tr>`)}</tbody></table></div></section>` : ""}
    ${R.manage ? html`<section class="card"><div class="card-head"><div><h2>${t("mc.inv.title")}</h2><div class="hint">${t("mc.inv.hint")}</div></div></div>
      <div class="card-body stack" style="gap:10px">
        <div class="row" style="align-items:flex-end">
          <div class="field"><span>${t("mc.inv.roles")}</span><span class="chips">${ROLES.map((r) => html`<button type="button" class="chip toggle" data-inv-role="${r}" aria-pressed="false"><span class="tick"></span>${roleLabel(r)}</button>`)}</span></div>
          <label class="field"><span>${t("mc.inv.until")}</span><input type="date" id="mc-inv-until"></label>
          <label class="field"><span>${t("mc.inv.days")}</span><input type="number" id="mc-inv-days" min="1" max="60" value="14" style="width:80px"></label>
          <button type="button" class="btn btn-primary" id="mc-inv-make">${t("mc.inv.make")}</button></div>
        <div id="mc-inv-new"></div>
        <div id="mc-inv-list"></div></div></section>` : ""}
    ${!R.member && !me ? html`<div class="row"><button type="button" class="btn" data-join="${org.id}">${t("mc.cand.join")}</button></div>` : ""}`;
  bindCandidates(panel);
  // roles: a chip toggled saves the member's roles at once
  $$("[data-role]", panel).forEach((b) => b.addEventListener("click", async () => {
    const uid = b.dataset.uid;
    const was = b.getAttribute("aria-pressed") === "true";
    b.setAttribute("aria-pressed", String(!was));
    const roles = $$(`[data-role][data-uid="${uid}"]`, panel).filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.role);
    try { await api(`orgs/${org.id}/members/${uid}`, { method: "PUT", body: { roles } }); }
    catch (e) { b.setAttribute("aria-pressed", String(was)); alertBox(errText(e)); }
  }));
  $$("[data-accept]", panel).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try { await api(`orgs/${org.id}/members/${b.dataset.accept}`, { method: "PUT", body: { state: "ok" } }); redraw(); }
    catch (e) { b.disabled = false; alertBox(errText(e)); }
  }));
  $$("[data-remove]", panel).forEach((b) => b.addEventListener("click", async () => {
    const m = list.find((x) => String(x.uid) === b.dataset.remove);
    if (!(await confirmBox(t("mc.remove.confirm", { name: m?.name || "" }), { ok: t("mc.remove") }))) return;
    try { await api(`orgs/${org.id}/members/${b.dataset.remove}`, { method: "DELETE" }); redraw(); }
    catch (e) { alertBox(errText(e)); }
  }));
  $$("[data-leave]", panel).forEach((b) => b.addEventListener("click", async () => {
    const fed = me?.source === "federation";
    if (!(await confirmBox(`${t("mc.leave.confirm", { club: org.name })}${fed ? ` ${t("mc.leave.fed")}` : ""}`, { ok: t("mc.leave") }))) return;
    try { await api(`orgs/${org.id}/members/${auth.session()?.uid}`, { method: "DELETE" }); location.hash = BASE; }
    catch (e) { alertBox(errText(e)); }
  }));
  if (!R.manage) return;
  // invitation links
  $$("[data-inv-role]", panel).forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"))));
  const drawLinks = async () => {
    const box = $("#mc-inv-list", panel);
    try {
      const { invites } = await api(`orgs/${org.id}/invites`);
      box.innerHTML = invites.length ? html`<h3 class="mc-h3">${t("mc.inv.list")}</h3><ul class="mc-list">${invites.map((x) => html`<li><span>${x.roles.length ? x.roles.map(roleLabel).join(", ") : t("mc.role.member")}
          ${x.until ? html` · ${t("mc.guestUntil", { date: fmtDate(x.until) })}` : ""}
          <span class="muted"> · ${t("mc.inv.expires", { date: fmtDate(x.expires.slice(0, 10)) })} · ${tn("mc.inv.uses", x.uses)}${x.by ? ` · ${x.by}` : ""}</span></span>
          <button type="button" class="btn btn-sm btn-ghost" data-revoke="${x.h}">${t("mc.inv.revoke")}</button></li>`)}</ul>` : "";
      $$("[data-revoke]", box).forEach((b) => b.addEventListener("click", async () => {
        b.disabled = true;
        try { await api(`orgs/${org.id}/invites/${b.dataset.revoke}`, { method: "DELETE" }); drawLinks(); } catch (e) { b.disabled = false; alertBox(errText(e)); }
      }));
    } catch (e) { box.innerHTML = ""; }
  };
  drawLinks();
  $("#mc-inv-make", panel).addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const roles = $$("[data-inv-role]", panel).filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.invRole);
      const j = await api(`orgs/${org.id}/invites`, { method: "POST", body: { roles, until: $("#mc-inv-until", panel).value || null, days: Number($("#mc-inv-days", panel).value) || 14 } });
      const box = $("#mc-inv-new", panel);
      box.innerHTML = html`<div class="row"><input type="text" readonly id="mc-link" value="${j.link}" style="flex:1 1 320px">
        <button type="button" class="btn btn-sm" id="mc-copy">${t("mc.inv.copy")}</button></div><p class="muted mc-rule">${t("mc.inv.once")}</p>`;
      $("#mc-copy", box).addEventListener("click", async (ev) => {
        try { await navigator.clipboard.writeText(j.link); ev.target.textContent = t("mc.inv.copied"); } catch (err) { $("#mc-link", box).select(); }
      });
      drawLinks();
    } catch (err) { alertBox(errText(err)); }
    e.target.disabled = false;
  });
}

// ---- Événements ---------------------------------------------------------------------------------------------------------
async function eventsTab(panel, { org, R }) {
  panel.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  let events = [], waiting = [];
  try { events = (await api(`events?org=${org.id}`)).events || []; } catch (e) { panel.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  if (R.manage) { try { waiting = (await api(`events/pending?org=${org.id}`)).pending || []; } catch (e) { waiting = []; } }
  const today = new Date().toLocaleDateString("sv-SE");
  const row = (e) => html`<tr class="${e.date < today ? "mc-past" : ""}"><td class="num">${fmtDate(e.date, "short")}</td>
    <td>${e.me ? html`<a href="#/orga?ev=${e.id}">${e.name}</a>` : e.name}${e.linkWait === "club" ? html` <span class="tag">${t("mc.ev.waitTag")}</span>` : ""}</td>
    <td class="muted">${t(`mc.ev.kind.${/^training/.test(e.type) ? "training" : /^public/.test(e.type) ? "public" : "competition"}`)}</td>
    <td class="r num">${e.members}</td></tr>`;
  panel.innerHTML = html`
    ${R.manage ? html`<section class="card"><div class="card-head"><div><h2>${t("mc.ev.wait.title")}</h2><div class="hint">${t("mc.ev.wait.hint")}</div></div></div>
      ${waiting.length ? html`<div class="table-wrap"><table class="data compact"><tbody>${waiting.map((e) => html`<tr data-ev="${e.id}"><td class="num">${fmtDate(e.date, "short")}</td>
        <td><b>${e.name}</b>${e.competition ? html`<br><span class="muted">${e.competition.name}</span>` : ""}</td><td class="muted">${t("mc.ev.by", { name: e.byName || "" })}</td>
        <td class="r" style="white-space:nowrap"><button type="button" class="btn btn-sm btn-primary" data-ok="1">${t("mc.ev.approve")}</button>
          <button type="button" class="btn btn-sm" data-ok="0">${t("mc.ev.refuse")}</button></td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t("mc.ev.wait.none")}</div>`}</section>` : ""}
    <section class="card"><div class="card-head"><div><h2>${t("mc.ev.title")}</h2><div class="hint">${t("mc.ev.hint")}</div></div>
      ${R.organise || R.member ? html`<a class="btn btn-sm" href="#/orga?nouveau=1">${t("mc.ev.new")}</a>` : ""}</div>
      ${events.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th>${t("mc.col.date")}</th><th>${t("mc.col.event")}</th><th>${t("mc.col.type")}</th>
        <th class="r">${t("mc.col.team")}</th></tr></thead><tbody>${events.map(row)}</tbody></table></div>` : html`<div class="empty">${t("mc.ev.none")}</div>`}</section>`;
  $$("[data-ev] [data-ok]", panel).forEach((b) => b.addEventListener("click", async () => {
    const id = b.closest("[data-ev]").dataset.ev;
    b.disabled = true;
    try { await api(`events/${id}/approve`, { method: "POST", body: { ok: b.dataset.ok === "1" } }); eventsTab(panel, { org, R }); }
    catch (e) { b.disabled = false; alertBox(errText(e)); }
  }));
}

// ---- Réglages -----------------------------------------------------------------------------------------------------------
async function settingsTab(panel, { org, D, R }) {
  const s = D.settings || {};
  const p = s.entry_policy || { mode: "self" };
  const M = R.manage;
  panel.innerHTML = html`<div class="stack mc-wrap">
    ${M ? html`<section class="card"><div class="card-head"><h2>${t("mc.set.events")}</h2></div><div class="card-body stack" style="gap:8px">
      <b class="mc-h3">${t("mc.set.eventsBy")}</b>
      ${["organisers", "members"].map((v) => html`<label class="check"><input type="radio" name="events_by" value="${v}" ${s.events_by === v ? "checked" : ""}><span>${t(`mc.set.eventsBy.${v}`)}</span></label>`)}
      <label class="check"><input type="checkbox" id="mc-team" ${s.default_team ? "checked" : ""}><span>${t("mc.set.defaultTeam")}</span></label>
      <label class="field"><span>${t("mc.set.contact")}</span><input type="text" id="mc-contact" maxlength="300" value="${s.contact || ""}"></label>
    </div></section>` : ""}
    <section class="card"><div class="card-head"><div><h2>${t("mc.set.entry")}</h2><div class="hint">${t("mc.set.entry.hint")}</div></div></div><div class="card-body stack" style="gap:8px">
      ${MODES.map((v) => html`<label class="check"><input type="radio" name="mode" value="${v}" ${p.mode === v ? "checked" : ""}><span>${t(`mc.set.mode.${v}`)}</span></label>`)}
      <label class="check"><input type="checkbox" id="mc-recover" ${p.recover ? "checked" : ""}><span>${t("mc.set.recover")}</span></label>
    </div></section>
    <section class="card"><div class="card-head"><div><h2>${t("mc.set.bank")}</h2><div class="hint">${t("mc.set.bank.hint")}</div></div></div><div class="card-body stack" style="gap:8px">
      <label class="field"><span>${t("mc.set.holder")}</span><input type="text" id="mc-holder" maxlength="100" value="${s.holder || ""}"></label>
      <div class="row"><label class="field" style="flex:2 1 260px"><span>${t("mc.set.iban")}</span><input type="text" id="mc-iban" maxlength="42" value="${s.iban || ""}" autocomplete="off" spellcheck="false"></label>
        <label class="field" style="flex:1 1 140px"><span>${t("mc.set.bic")}</span><input type="text" id="mc-bic" maxlength="11" value="${s.bic || ""}" autocomplete="off" spellcheck="false"></label></div>
    </div></section>
    <div class="row"><button type="button" class="btn btn-primary" id="mc-save">${t("mc.set.save")}</button><span class="muted" id="mc-saved"></span></div>
    <section class="card"><div class="card-head"><div><h2>${t("mc.net.title")}</h2><div class="hint">${t("mc.net.hint")}</div></div></div>
      <div class="card-body stack" style="gap:10px" id="mc-net"><div class="spinner"></div></div></section>
  </div>`;
  $("#mc-save", panel).addEventListener("click", async (e) => {
    const body = {
      entry_policy: { ...p, mode: $('[name="mode"]:checked', panel)?.value || "self", recover: $("#mc-recover", panel).checked },
      holder: $("#mc-holder", panel).value, iban: $("#mc-iban", panel).value, bic: $("#mc-bic", panel).value,
      ...(M ? { events_by: $('[name="events_by"]:checked', panel)?.value || "organisers", default_team: $("#mc-team", panel).checked, contact: $("#mc-contact", panel).value } : {}),
    };
    e.target.disabled = true;
    try { await api(`orgs/${org.id}/settings`, { method: "PUT", body }); $("#mc-saved", panel).textContent = `✓ ${t("mc.set.saved")}`; }
    catch (err) { alertBox(errText(err)); }
    e.target.disabled = false;
  });
  drawNetting($("#mc-net", panel), org);
}

async function drawNetting(box, org) {
  let N;
  try { N = await api(`orgs/${org.id}/netting`); } catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  const item = (x, del) => html`<li><span><b>${x.name}</b> <span class="muted">${x.code ? `${t("mc.code")} ${x.code}` : country.name(x.cc)}</span>
    ${x.mutual ? html`<span class="tag mc-mutual">${t("mc.net.mutual")}</span>` : ""}</span>
    ${del ? html`<button type="button" class="btn btn-sm btn-ghost" data-unnet="${x.id}">${t("mc.net.remove")}</button>` : html`${x.mutual ? "" : html`<button type="button" class="btn btn-sm" data-net="${x.id}">${t("mc.net.accept")}</button>`}`}</li>`;
  box.innerHTML = html`
    <b class="mc-h3">${t("mc.net.accepts")}</b>
    ${N.accepts.length ? html`<ul class="mc-list">${N.accepts.map((x) => item(x, true))}</ul>` : html`<span class="muted">${t("mc.net.none")}</span>`}
    <b class="mc-h3">${t("mc.net.acceptedBy")}</b>
    ${N.acceptedBy.length ? html`<ul class="mc-list">${N.acceptedBy.map((x) => item(x, false))}</ul>` : html`<span class="muted">${t("mc.net.none")}</span>`}
    <label class="field"><span>${t("mc.net.search")}</span><input type="search" id="mc-net-q" autocomplete="off" style="max-width:360px"></label>
    <div id="mc-net-found"></div>`;
  const bind = (root) => {
    $$("[data-net]", root).forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api(`orgs/${org.id}/netting/${b.dataset.net}`, { method: "PUT" }); drawNetting(box, org); } catch (e) { b.disabled = false; alertBox(errText(e)); }
    }));
    $$("[data-unnet]", root).forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api(`orgs/${org.id}/netting/${b.dataset.unnet}`, { method: "DELETE" }); drawNetting(box, org); } catch (e) { b.disabled = false; alertBox(errText(e)); }
    }));
  };
  bind(box);
  let timer;
  $("#mc-net-q", box).addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const qq = e.target.value.trim(), out = $("#mc-net-found", box);
      if (qq.length < 2) { out.innerHTML = ""; return; }
      try {
        const { orgs } = await api(`orgs/find?${new URLSearchParams({ cc: org.cc, q: qq })}`);
        const list = orgs.filter((o) => o.org !== org.id && !(o.code && o.code === org.code && o.cc === org.cc));
        out.innerHTML = list.length ? html`<ul class="mc-list">${list.map((o) => html`<li><span><b>${o.name}</b> <span class="muted">${o.code ? `${t("mc.code")} ${o.code}` : ""}</span></span>
          <button type="button" class="btn btn-sm" data-net="${o.code && o.cc === "FR" ? `FR-${o.code}` : o.org}">${t("mc.net.accept")}</button></li>`)}</ul>`
          : html`<div class="empty">${t("mc.find.none")}</div>`;
        bind(out);
      } catch (err) { out.innerHTML = ""; }
    }, 300);
  });
}
