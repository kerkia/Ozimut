// « Mon club › Comptes » (docs/clubs/design.md §4 « Club accounts »; owner, 2026-11-22): the club's accounts, drawn by
// pages/monclub.js as render(panel, org, me). Every payment is made outside Ozimut: the page says who owes what to whom, keeps
// what the treasurer marks, and draws up the statements (printed, or as a PDF made in the browser with pdf-lib).
//   - a member sees their own balance with the club (what it carried for them, what they paid back, a year-end bill's reference);
//   - a treasurer (managers and treasurers) sees « À recevoir » (the visiting clubs carrying their runners at this club's events,
//     and this club's events' amounts due), « À payer » (what it owes the organisers of the events it carries its members at),
//     « Membres » (the ledger, repayments, the year-end bills e-mailed in the club's name), « Compensation » (netting with the
//     clubs both sides accepted), « Prise en charge » (the events its policy carries, ticked one by one) and « Journal » (CSV);
//     the bank's statement file is read in the browser (../bankstatement.js) and only the lines matched are sent.
// API: functions/api/accounts/[[path]].js. Texts: the i18n area « accounts ».

import { html, raw, $, $$, fmtDate } from "../util.js";
import { t, tn, loadArea, locale, lang } from "../i18n.js";
import { confirmBox, alertBox } from "../askbox.js";
import { fmtMoney, parseMoney, moneyField } from "../entryprice.js";
import { openBankDialog } from "../bankstatement.js";
import { PDFLIB } from "../vendor.js";

async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`api/${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("cnx:unauthorised"));
  if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error || String(r.status), status: r.status, data: j });
  return j;
}
const errText = (e) => { const k = `acc.err.${String(e?.code || "").replace(/\s+/g, "_")}`; return t(k) !== k ? t(k) : t("acc.err.other"); };
const money = (c, cur = "EUR") => fmtMoney(c, cur, locale());
/** A total by currency ({ EUR: 1200 }) in words: « 12 € », several currencies joined. */
const sums = (o) => { const e = Object.entries(o || {}).filter(([, v]) => v); return e.length ? e.map(([c, v]) => money(v, c)).join(" + ") : money(0); };
const iban = (s) => String(s || "").replace(/(.{4})/g, "$1 ").trim();
const thisYear = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }).slice(0, 4);
const KEEP = "ocn.acc.view";

export async function render(panel, org, me) {
  await loadArea("accounts");
  const R = org.rights || {};
  if (!R.member && !R.treasure) { panel.innerHTML = html`<div class="notice info">${t("acc.notMember")}</div>`; return; }
  const st = { season: thisYear(), view: "receive", D: null, member: null };
  try { st.view = sessionStorage.getItem(KEEP) || "receive"; } catch (e) { /* none */ }
  if (!R.treasure) return memberView(panel, org, st);
  return treasurerView(panel, org, st);
}

// ---- a member's own account ---------------------------------------------------------------------------------------------
async function memberView(panel, org, st, box = null) {
  const root = box || panel;
  root.innerHTML = html`<div class="spinner"></div>`;
  let M;
  try { M = await api(`accounts/${org.id}/me?season=${st.season}`); }
  catch (e) { root.innerHTML = html`<div class="notice">${e.status === 503 ? t("acc.notReady") : errText(e)}</div>`; return; }
  const seasons = [...new Set([thisYear(), String(Number(thisYear()) - 1), st.season])].sort().reverse();
  root.innerHTML = html`<section class="card ac-me"><div class="card-head"><div><h2>${t("acc.me.title")}</h2><div class="hint">${t(`acc.me.mode.${M.mode || "self"}`)}</div></div>
      <label class="field ac-season"><span>${t("acc.season")}</span><select data-season>${seasons.map((y) => html`<option ${y === st.season ? "selected" : ""}>${y}</option>`)}</select></label></div>
    <div class="card-body">
    ${M.lines.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("acc.col.date")}</th><th>${t("acc.col.event")}</th><th>${t("acc.col.runner")}</th>
        <th class="r">${t("acc.col.amount")}</th></tr></thead><tbody>${M.lines.map((l) => html`<tr><td class="num">${fmtDate(l.date, "short")}</td><td>${l.event}</td><td>${l.runner}</td>
        <td class="r num">${money(l.amount, M.cur)}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t("acc.me.none")}</div>`}
    <dl class="ac-sums"><dt>${t("acc.carried")}</dt><dd>${money(M.carried, M.cur)}</dd>
      ${M.recover ? html`<dt>${t("acc.repaid")}</dt><dd>${money(M.repaid + M.adjust, M.cur)}</dd><dt>${t("acc.balance")}</dt><dd><b>${money(M.balance, M.cur)}</b></dd>` : ""}</dl>
    ${M.recover && M.balance > 0 ? html`<div class="ac-pay"><p>${t("acc.me.pay")}</p><p>${t("acc.ref")} <b class="ac-ref">${M.ref}</b></p>
      ${M.bank ? html`<dl class="en-bank"><dt>${t("acc.holder")}</dt><dd>${M.bank.holder || "—"}</dd><dt>IBAN</dt><dd class="num">${iban(M.bank.iban)}</dd>${M.bank.bic ? html`<dt>BIC</dt><dd class="num">${M.bank.bic}</dd>` : ""}</dl>` : html`<p class="muted ac-small">${t("acc.me.noBank")}</p>`}</div>`
      : !M.recover && M.lines.length ? html`<p class="muted ac-small">${t("acc.me.noRecover")}</p>` : ""}
    ${M.bills.length ? html`<p class="muted ac-small">${t("acc.me.bills", { list: M.bills.map((b) => fmtDate(b.at.slice(0, 10), "short")).join(", ") })}</p>` : ""}
    </div></section>`;
  $("[data-season]", root).addEventListener("change", (e) => { st.season = e.target.value; memberView(panel, org, st, box); });
}

// ---- the treasurer ---------------------------------------------------------------------------------------------------------
const VIEWS = ["receive", "pay", "members", "netting", "policy", "journal", "me"];
async function treasurerView(panel, org, st) {
  panel.innerHTML = html`<div class="spinner"></div>`;
  try { st.D = await api(`accounts/${org.id}?season=${st.season}`); }
  catch (e) { panel.innerHTML = html`<div class="notice">${e.status === 503 ? t("acc.notReady") : errText(e)}</div>`; return; }
  const D = st.D;
  if (!VIEWS.includes(st.view)) st.view = "receive";
  const seasons = [...new Set([thisYear(), ...D.seasons])].sort().reverse();
  panel.innerHTML = html`<div class="ac-wrap">
    <div class="ac-top"><div class="chips ac-views" role="tablist">${VIEWS.map((v) => html`<button type="button" class="chip" role="tab" data-view="${v}" aria-pressed="${v === st.view}">${t(`acc.view.${v}`)}${badge(D, v)}</button>`)}</div>
      <div class="row ac-tools"><label class="field ac-season"><span>${t("acc.season")}</span><select data-season>${seasons.map((y) => html`<option ${y === st.season ? "selected" : ""}>${y}</option>`)}</select></label>
        <button type="button" class="btn btn-sm" data-bank="1">${t("acc.bank.open")}</button></div></div>
    <div id="ac-body"></div></div>`;
  $("[data-season]", panel).addEventListener("change", (e) => { st.season = e.target.value; treasurerView(panel, org, st); });
  $(".ac-views", panel).addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    st.view = b.dataset.view;
    try { sessionStorage.setItem(KEEP, st.view); } catch (err) { /* none */ }
    $$("[data-view]", panel).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    drawView(panel, org, st);
  });
  $("[data-bank]", panel).addEventListener("click", () => bankDialog(panel, org, st));
  drawView(panel, org, st);
}
function badge(D, v) {
  const n = v === "receive" ? D.receive.filter((x) => Object.values(x.due).some(Boolean)).length
    : v === "pay" ? D.pay.filter((x) => Object.values(x.due).some(Boolean)).length
      : v === "members" ? D.members.filter((m) => m.balance > 0).length : v === "netting" ? D.netting.length : 0;
  return n ? html` <span class="ac-badge">${n}</span>` : "";
}
function drawView(panel, org, st) {
  const box = $("#ac-body", panel);
  const draw = { receive: receiveView, pay: payView, members: membersView, netting: nettingView, policy: policyView, journal: journalView,
    me: () => memberView(panel, org, st, box) }[st.view];
  draw(box, org, st, panel);
}
const reload = (panel, org, st) => treasurerView(panel, org, st);

// « À recevoir »
function receiveView(box, org, st, panel) {
  const D = st.D;
  box.innerHTML = html`
    <section class="card"><div class="card-head"><div><h2>${t("acc.rec.title")}</h2><div class="hint">${t("acc.rec.hint")}</div></div></div>
      ${D.receive.length ? html`<div class="table-wrap"><table class="data ac-table"><thead><tr><th>${t("acc.col.club")}</th><th>${t("acc.col.events")}</th>
          <th class="r">${t("acc.col.total")}</th><th class="r">${t("acc.col.due")}</th><th></th></tr></thead><tbody>
        ${D.receive.map((g) => html`<tr><td><b>${g.org.name}</b>${g.netting ? html` <span class="tag">${t("acc.net.tag")}</span>` : ""}</td>
          <td>${g.events.map((e) => html`<div class="ac-evline">${fmtDate(e.date, "short")} · ${e.name} · ${tn("acc.entries", e.n, { n: e.n })} · <span class="num">${e.ref}</span>
            ${e.due ? html`<span class="tag tag-warn">${t("acc.st.due")}</span>` : html`<span class="tag tag-in" title="${e.how ? t(`acc.how.${e.how}`) : ""}">${t("acc.st.paid")}</span>`}</div>`)}</td>
          <td class="r num">${sums(g.total)}</td><td class="r num">${sums(g.due)}</td>
          <td class="r ac-acts"><button type="button" class="btn btn-sm" data-stmt="${g.org.id}">${t("acc.stmt.open")}</button>
            ${Object.values(g.due).some(Boolean) ? html`<button type="button" class="btn btn-sm btn-primary" data-markpaid="${g.org.id}">${t("acc.rec.markPaid")}</button>`
              : html`<button type="button" class="btn btn-sm btn-ghost" data-markdue="${g.org.id}">${t("acc.rec.markDue")}</button>`}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t("acc.rec.none")}</div>`}</section>
    <section class="card"><div class="card-head"><div><h2>${t("acc.ev.title")}</h2><div class="hint">${t("acc.ev.hint")}</div></div>
      ${D.events.some((e) => e.due) ? html`<button type="button" class="btn btn-sm" data-remind="all">${t("acc.remind.all")}</button>` : ""}</div>
      ${D.events.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("acc.col.date")}</th><th>${t("acc.col.event")}</th><th class="r">${t("acc.col.entries")}</th>
          <th class="r">${t("acc.col.paid")}</th><th class="r">${t("acc.col.due")}</th><th></th></tr></thead><tbody>
        ${D.events.map((e) => html`<tr><td class="num">${fmtDate(e.date, "short")}</td><td><a href="#/orga?ev=${encodeURIComponent(e.id)}&onglet=departs">${e.name}</a></td>
          <td class="r num">${e.n}</td><td class="r num">${money(e.paid, e.cur)}</td><td class="r num">${money(e.due, e.cur)}${e.unpaid ? html` <span class="muted">(${tn("acc.ev.unpaid", e.unpaid, { n: e.unpaid })})</span>` : ""}</td>
          <td class="r">${e.due ? html`<button type="button" class="btn btn-sm" data-remind="${e.id}">${t("acc.remind")}</button>` : ""}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${t("acc.ev.none")}</div>`}
      <div id="ac-rem-msg"></div></section>
    <div id="ac-stmt"></div>`;
  box.onclick = async (e) => {
    const b = (a) => e.target.closest(`[${a}]`);
    if (b("data-stmt")) return showStatement($("#ac-stmt", box), org.id, Number(b("data-stmt").dataset.stmt), st, "receive");
    if (b("data-markpaid") || b("data-markdue")) {
      const paid = !!b("data-markpaid"), other = Number((b("data-markpaid") || b("data-markdue")).dataset[paid ? "markpaid" : "markdue"]);
      const g = st.D.receive.find((x) => x.org.id === other);
      if (!(await confirmBox(t(paid ? "acc.rec.markPaid.confirm" : "acc.rec.markDue.confirm", { club: g?.org.name || "", x: sums(paid ? g.due : g.paid) }), { ok: t(paid ? "acc.rec.markPaid" : "acc.rec.markDue") }))) return;
      try { await api(`accounts/${org.id}/mark`, { method: "POST", body: { payer: other, season: st.season, state: paid ? "paid" : "due", how: "transfer" } }); reload(panel, org, st); }
      catch (err) { alertBox(errText(err)); }
      return;
    }
    if (b("data-remind")) {
      const v = b("data-remind").dataset.remind;
      if (!(await confirmBox(t(v === "all" ? "acc.remind.all.confirm" : "acc.remind.confirm"), { ok: t("acc.remind.send") }))) return;
      b("data-remind").disabled = true;
      try {
        const y = await api(`accounts/${org.id}/remind?season=${st.season}`, { method: "POST", body: v === "all" ? {} : { events: [v] } });
        $("#ac-rem-msg", box).innerHTML = html`<div class="notice ok">${tn("acc.remind.done", y.told, { n: y.told })}</div>`;
      } catch (err) { $("#ac-rem-msg", box).innerHTML = html`<div class="notice">${errText(err)}</div>`; }
    }
  };
}

// « À payer »
function payView(box, org, st) {
  const D = st.D;
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("acc.pay.title")}</h2><div class="hint">${t("acc.pay.hint")}</div></div></div>
    ${D.pay.length ? html`<div class="stack ac-cards">${D.pay.map((g) => html`<div class="ac-owe">
        <div class="ac-owe-head"><b>${g.org?.name || g.club || "—"}</b>${g.netting ? html` <span class="tag">${t("acc.net.tag")}</span>` : ""}
          <span class="ac-owe-sum">${t("acc.col.due")} <b>${sums(g.due)}</b> <span class="muted">/ ${sums(g.total)}</span></span></div>
        <div class="table-wrap"><table class="data compact"><tbody>${g.events.map((e) => html`<tr><td class="num">${fmtDate(e.date, "short")}</td><td>${e.name}</td><td class="r">${tn("acc.entries", e.n, { n: e.n })}</td>
          <td class="r num">${money(e.total, e.cur)}</td><td class="num"><b class="ac-ref">${e.ref}</b></td>
          <td>${e.due ? html`<span class="tag tag-warn">${t("acc.st.due")}</span>` : html`<span class="tag tag-in">${t("acc.st.paid")}</span>`}</td></tr>`)}</tbody></table></div>
        ${g.bank ? html`<dl class="en-bank"><dt>${t("acc.holder")}</dt><dd>${g.bank.holder || "—"}</dd><dt>IBAN</dt><dd class="num">${iban(g.bank.iban)}</dd>${g.bank.bic ? html`<dt>BIC</dt><dd class="num">${g.bank.bic}</dd>` : ""}</dl>`
          : html`<p class="muted ac-small">${t("acc.pay.noBank")}</p>`}
        <p class="muted ac-small">${t("acc.pay.howTo")}</p>
        ${g.org ? html`<button type="button" class="btn btn-sm" data-stmt="${g.org.id}">${t("acc.stmt.open")}</button>` : ""}</div>`)}</div>`
      : html`<div class="empty">${t("acc.pay.none")}</div>`}</section><div id="ac-stmt"></div>`;
  box.onclick = (e) => {
    const b = e.target.closest("[data-stmt]");
    if (b) showStatement($("#ac-stmt", box), Number(b.dataset.stmt), org.id, st, "pay");
  };
}

/** A statement between two clubs, drawn under the list, with « Imprimer » and « PDF ». */
async function showStatement(box, from, to, st) {
  box.innerHTML = html`<div class="spinner"></div>`;
  let S;
  try { S = await api(`accounts/${st.D.org.id}/statement?from=${from}&to=${to}&season=${st.season}`); }
  catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  const cur = S.lines[0]?.cur || "EUR";
  const refs = [...new Set(S.lines.map((l) => l.ref))];
  box.innerHTML = html`<section class="card ac-stmt"><div class="card-head"><div><h2>${t("acc.stmt.title", { from: S.from?.name || "", to: S.to?.name || "" })}</h2>
      <div class="hint">${t("acc.stmt.hint", { season: S.season })}</div></div>
      <div class="row"><button type="button" class="btn btn-sm" data-print="1">${t("acc.print")}</button><button type="button" class="btn btn-sm btn-primary" data-pdf="1">${t("acc.pdf")}</button>
        <button type="button" class="icon-btn" data-x="1" aria-label="${t("acc.close")}">✕</button></div></div>
    <div class="card-body">${raw(statementHtml(S, cur, refs))}</div></section>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  box.onclick = async (e) => {
    if (e.target.closest("[data-x]")) { box.innerHTML = ""; return; }
    if (e.target.closest("[data-print]")) printHtml(t("acc.stmt.title", { from: S.from?.name || "", to: S.to?.name || "" }), statementHtml(S, cur, refs));
    if (e.target.closest("[data-pdf]")) {
      const bytes = await pdfDoc({ club: S.from?.name || "", title: t("acc.stmt.pdfTitle", { season: S.season }), to: S.to?.name || "",
        lines: S.lines.map((l) => [l.date, l.event, `${l.runner}${l.cls ? ` (${l.cls})` : ""}`, l.amount, l.state === "paid" ? t("acc.st.paid") : ""]), cur,
        totals: [[t("acc.col.total"), sumOf(S.total)], [t("acc.col.due"), sumOf(S.due)]], ref: sumOf(S.due) ? refs.join(", ") : "", bank: S.bank });
      saveBytes(bytes, `${slug(S.from?.name)}-${slug(S.to?.name)}-${S.season}.pdf`);
    }
  };
}
const sumOf = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
function statementHtml(S, cur, refs) {
  return String(html`<p>${t("acc.stmt.from")} <b>${S.from?.name || ""}</b> · ${t("acc.stmt.to")} <b>${S.to?.name || ""}</b> · ${t("acc.season")} ${S.season}</p>
    <table class="data compact"><thead><tr><th>${t("acc.col.date")}</th><th>${t("acc.col.event")}</th><th>${t("acc.col.runner")}</th><th>${t("acc.col.class")}</th>
      <th class="r">${t("acc.col.amount")}</th><th>${t("acc.ref")}</th><th>${t("acc.col.state")}</th></tr></thead><tbody>
      ${S.lines.map((l) => html`<tr><td class="num">${fmtDate(l.date, "short")}</td><td>${l.event}</td><td>${l.runner}</td><td>${l.cls}</td><td class="r num">${money(l.amount, l.cur)}</td>
        <td class="num">${l.ref}</td><td>${l.state === "paid" ? t("acc.st.paid") : l.state === "waived" ? t("acc.st.waived") : t("acc.st.due")}</td></tr>`)}</tbody></table>
    <dl class="ac-sums"><dt>${t("acc.col.total")}</dt><dd>${sums(S.total)}</dd><dt>${t("acc.col.due")}</dt><dd><b>${sums(S.due)}</b></dd></dl>
    ${sumOf(S.due) ? html`<p>${t("acc.stmt.transfer", { ref: refs.join(", ") })}</p>
      ${S.bank ? html`<dl class="en-bank"><dt>${t("acc.holder")}</dt><dd>${S.bank.holder || "—"}</dd><dt>IBAN</dt><dd>${iban(S.bank.iban)}</dd>${S.bank.bic ? html`<dt>BIC</dt><dd>${S.bank.bic}</dd>` : ""}</dl>` : ""}` : ""}
    <p class="muted ac-small">${t("acc.stmt.foot", { cur })}</p>`);
}

// « Membres »
function membersView(box, org, st, panel) {
  const D = st.D, rec = D.policy.recover;
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("acc.mem.title")}</h2><div class="hint">${t(rec ? "acc.mem.hint" : "acc.mem.hintInfo")}</div></div>
      ${D.members.length ? html`<button type="button" class="btn btn-sm" data-billall="1">${t(rec ? "acc.bill.all" : "acc.bill.allInfo")}</button>` : ""}</div>
    ${D.members.length ? html`<div class="table-wrap"><table class="data ac-table" data-freeze="1"><thead><tr><th>${t("acc.col.member")}</th><th class="r">${t("acc.col.entries")}</th>
        <th class="r">${t("acc.carried")}</th>${rec ? html`<th class="r">${t("acc.repaid")}</th><th class="r">${t("acc.balance")}</th>` : ""}<th>${t("acc.col.bill")}</th><th></th></tr></thead><tbody>
      ${D.members.map((m) => html`<tr><td><b>${m.name || m.person}</b>${m.licence ? html` <span class="muted">${m.licence}</span>` : ""}</td><td class="r num">${m.n}</td>
        <td class="r num">${money(m.carried, m.cur)}</td>${rec ? html`<td class="r num">${money(m.repaid + m.adjust, m.cur)}</td><td class="r num"><b>${money(m.balance, m.cur)}</b></td>` : ""}
        <td class="muted">${m.lastBill ? fmtDate(m.lastBill.at.slice(0, 10), "short") : "—"}</td>
        <td class="r"><button type="button" class="btn btn-sm" data-mem="${m.person}">${t("acc.mem.open")}</button></td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t("acc.mem.none")}</div>`}<div id="ac-msg"></div></section><div id="ac-mem"></div>`;
  box.onclick = async (e) => {
    const m = e.target.closest("[data-mem]");
    if (m) return memberCard($("#ac-mem", box), org, st, m.dataset.mem, panel);
    if (e.target.closest("[data-billall]")) {
      const list = st.D.members.filter((x) => (rec ? x.balance > 0 : x.carried > 0));
      if (!list.length) { $("#ac-msg", box).innerHTML = html`<div class="notice">${t("acc.bill.nobody")}</div>`; return; }
      if (!(await confirmBox(tn("acc.bill.all.confirm", list.length, { n: list.length }), { ok: t("acc.bill.send") }))) return;
      const b = e.target.closest("[data-billall]"); b.disabled = true;
      let sent = 0, none = 0;
      for (const [i, x] of list.entries()) {
        $("#ac-msg", box).innerHTML = html`<div class="notice info">${t("acc.bill.progress", { i: i + 1, n: list.length })}</div>`;
        try { const y = await sendBill(org, st, x.person); if (y.sent === "none") none++; else sent++; } catch (err) { none++; }
      }
      $("#ac-msg", box).innerHTML = html`<div class="notice ok">${t("acc.bill.allDone", { sent, none })}</div>`;
      b.disabled = false;
    }
  };
}

async function memberCard(box, org, st, person, panel) {
  box.innerHTML = html`<div class="spinner"></div>`;
  let A;
  try { A = await api(`accounts/${org.id}/member?person=${encodeURIComponent(person)}&season=${st.season}`); }
  catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  const cur = A.cur;
  box.innerHTML = html`<section class="card ac-member"><div class="card-head"><div><h2>${A.name || person}</h2><div class="hint">${t("acc.season")} ${A.season} · ${t("acc.ref")} <b class="ac-ref">${A.ref}</b></div></div>
      <button type="button" class="icon-btn" data-x="1" aria-label="${t("acc.close")}">✕</button></div>
    <div class="card-body stack" style="gap:12px">
      ${A.lines.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("acc.col.date")}</th><th>${t("acc.col.event")}</th><th>${t("acc.col.runner")}</th>
        <th class="r">${t("acc.col.amount")}</th></tr></thead><tbody>${A.lines.map((l) => html`<tr><td class="num">${fmtDate(l.date, "short")}</td><td>${l.event}</td><td>${l.runner}</td>
        <td class="r num">${money(l.amount, cur)}</td></tr>`)}</tbody></table></div>` : html`<div class="empty">${t("acc.me.none")}</div>`}
      ${A.ledger.length ? html`<div><b class="ac-h3">${t("acc.led.title")}</b><div class="table-wrap"><table class="data compact"><tbody>${A.ledger.map((l) => html`<tr><td class="num">${fmtDate(l.at.slice(0, 10), "short")}</td>
        <td>${t(`acc.led.${l.kind}`)}${l.note && l.note !== "info" ? html` <span class="muted">· ${l.note}</span>` : ""}</td><td class="r num">${l.kind === "bill" && l.note === "info" ? "—" : money(l.amount, cur)}</td>
        <td class="r">${l.kind !== "bill" ? html`<button type="button" class="btn btn-sm btn-ghost" data-ldel="${l.id}">${t("acc.led.del")}</button>` : ""}</td></tr>`)}</tbody></table></div></div>` : ""}
      <dl class="ac-sums"><dt>${t("acc.carried")}</dt><dd>${money(A.carried, cur)}</dd>${A.recover ? html`<dt>${t("acc.repaid")}</dt><dd>${money(A.repaid + A.adjust, cur)}</dd>
        <dt>${t("acc.balance")}</dt><dd><b>${money(A.balance, cur)}</b></dd>` : ""}</dl>
      ${A.recover ? html`<div class="row ac-led-form"><label class="field"><span>${t("acc.led.kind")}</span><select id="ac-lk"><option value="repaid">${t("acc.led.repaid")}</option><option value="adjust">${t("acc.led.adjust")}</option></select></label>
        <label class="field"><span>${t("acc.col.amount")}</span><input id="ac-la" inputmode="decimal" style="width:100px" value="${A.balance > 0 ? moneyField(A.balance) : ""}"></label>
        <label class="field" style="flex:1 1 200px"><span>${t("acc.led.note")}</span><input id="ac-ln" maxlength="200"></label>
        <button type="button" class="btn btn-sm" data-ladd="1">${t("acc.led.add")}</button></div>
        <p class="muted ac-small">${t("acc.led.hint")}</p>` : html`<p class="muted ac-small">${t("acc.mem.noRecover")}</p>`}
      <div class="row"><button type="button" class="btn btn-sm" data-bpdf="1">${t("acc.bill.pdf")}</button>
        <button type="button" class="btn btn-sm btn-primary" data-bsend="1" ${A.reachable ? "" : "disabled"} title="${A.reachable ? "" : t("acc.bill.noAccount")}">${t("acc.bill.mail")}</button>
        ${A.reachable ? "" : html`<span class="muted ac-small">${t("acc.bill.noAccount")}</span>`}</div>
      <div id="ac-bmsg"></div></div></section>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
  box.onclick = async (e) => {
    if (e.target.closest("[data-x]")) { box.innerHTML = ""; return; }
    const del = e.target.closest("[data-ldel]");
    if (del) {
      if (!(await confirmBox(t("acc.led.del.confirm"), { ok: t("acc.led.del") }))) return;
      try { await api(`accounts/${org.id}/ledger/${del.dataset.ldel}`, { method: "DELETE" }); await refreshMembers(panel, org, st, person); } catch (err) { alertBox(errText(err)); }
      return;
    }
    if (e.target.closest("[data-ladd]")) {
      const amount = parseMoney($("#ac-la", box).value), kind = $("#ac-lk", box).value;
      if (!amount) { alertBox(t("acc.err.amount")); return; }
      try {
        await api(`accounts/${org.id}/ledger`, { method: "POST", body: { person, kind, amount, season: st.season, note: $("#ac-ln", box).value } });
        await refreshMembers(panel, org, st, person);
      } catch (err) { alertBox(errText(err)); }
      return;
    }
    if (e.target.closest("[data-bpdf]")) { saveBytes(await billPdf(org, A), `${A.ref}-${A.season}.pdf`); return; }
    if (e.target.closest("[data-bsend]")) {
      if (!(await confirmBox(t("acc.bill.confirm", { name: A.name }), { ok: t("acc.bill.send") }))) return;
      e.target.disabled = true;
      try {
        const y = await sendBill(org, st, person, A);
        $("#ac-bmsg", box).innerHTML = html`<div class="notice ok">${t(`acc.bill.sent.${y.sent}`)}</div>`;
      } catch (err) { $("#ac-bmsg", box).innerHTML = html`<div class="notice">${errText(err)}</div>`; }
      e.target.disabled = false;
    }
  };
}
async function refreshMembers(panel, org, st, person) {
  st.D = await api(`accounts/${org.id}?season=${st.season}`);
  const box = $("#ac-body", panel);
  membersView(box, org, st, panel);
  memberCard($("#ac-mem", box), org, st, person, panel);
}
/** The year-end bill: its PDF made here, sent with the request; the server records it and e-mails it in the club's name. */
async function sendBill(org, st, person, A = null) {
  A = A || await api(`accounts/${org.id}/member?person=${encodeURIComponent(person)}&season=${st.season}`);
  const bytes = await billPdf(org, A);
  return api(`accounts/${org.id}/bill`, { method: "POST", body: { person, season: st.season, send: true, pdf: b64(bytes) } });
}
function billPdf(org, A) {
  return pdfDoc({ club: org.name, title: t(A.recover ? "acc.bill.pdfTitle" : "acc.bill.pdfTitleInfo", { season: A.season }), to: A.name, cur: A.cur,
    lines: A.lines.map((l) => [l.date, l.event, l.runner, l.amount, ""]),
    totals: A.recover ? [[t("acc.carried"), A.carried], [t("acc.repaid"), A.repaid + A.adjust], [t("acc.balance"), A.balance]] : [[t("acc.carried"), A.carried]],
    ref: A.recover && A.balance > 0 ? A.ref : "", bank: A.recover && A.balance > 0 ? A.bank : null, note: A.recover ? "" : t("acc.bill.pdfInfo") });
}

// « Compensation »
function nettingView(box, org, st, panel) {
  const D = st.D;
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("acc.net.title")}</h2><div class="hint">${t("acc.net.hint")}</div></div>
      <a class="btn btn-sm" href="#/monclub?org=${org.id}&onglet=reglages">${t("acc.net.settings")}</a></div>
    ${D.netting.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th>${t("acc.col.club")}</th><th class="r">${t("acc.net.theyOwe")}</th><th class="r">${t("acc.net.weOwe")}</th>
        <th class="r">${t("acc.net.net")}</th><th></th></tr></thead><tbody>
      ${D.netting.map((n) => { const net = sumOf(n.net), cur = Object.keys(n.net)[0] || "EUR";
        return html`<tr><td><b>${n.org?.name || ""}</b></td><td class="r num">${sums(n.theyOwe)}</td><td class="r num">${sums(n.weOwe)}</td>
        <td class="r num"><b>${money(Math.abs(net), cur)}</b><div class="muted ac-small">${net > 0 ? t("acc.net.theyPay", { club: n.org?.name || "" }) : net < 0 ? t("acc.net.wePay", { club: n.org?.name || "" }) : t("acc.net.even")}</div></td>
        <td class="r">${sumOf(n.theyOwe) || sumOf(n.weOwe) ? html`<button type="button" class="btn btn-sm btn-primary" data-settle="${n.org.id}">${t("acc.net.settle")}</button>` : ""}</td></tr>`; })}</tbody></table></div>`
      : html`<div class="empty">${t("acc.net.none")}</div>`}<p class="muted ac-small">${t("acc.net.rule")}</p></section>`;
  box.onclick = async (e) => {
    const b = e.target.closest("[data-settle]");
    if (!b) return;
    const n = D.netting.find((x) => x.org.id === Number(b.dataset.settle));
    if (!(await confirmBox(t("acc.net.settle.confirm", { club: n.org.name, x: money(Math.abs(sumOf(n.net)), Object.keys(n.net)[0] || "EUR") }), { ok: t("acc.net.settle") }))) return;
    try { await api(`accounts/${org.id}/settle`, { method: "POST", body: { other: n.org.id, season: st.season } }); reload(panel, org, st); }
    catch (err) { alertBox(errText(err)); }
  };
}

// « Prise en charge »: the events its policy carries
async function policyView(box, org, st) {
  box.innerHTML = html`<div class="spinner"></div>`;
  let E;
  try { E = await api(`accounts/${org.id}/events?season=${st.season}`); } catch (e) { box.innerHTML = html`<div class="notice">${errText(e)}</div>`; return; }
  const p = E.policy, can = p.mode !== "self";
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("acc.pol.title")}</h2>
      <div class="hint">${t(`acc.pol.mode.${p.mode}`)} ${p.recover ? t("acc.pol.recover") : t("acc.pol.noRecover")}</div></div>
      <a class="btn btn-sm" href="#/monclub?org=${org.id}&onglet=reglages">${t("acc.pol.change")}</a></div>
    ${!can ? html`<div class="notice info">${t("acc.pol.self")}</div>` : ""}
    ${E.events.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr><th>${t("acc.col.date")}</th><th>${t("acc.col.event")}</th><th>${t("acc.col.organiser")}</th>
        <th class="r">${t("acc.pol.ours")}</th><th class="r">${t("acc.pol.carried")}</th><th>${t("acc.pol.carries")}</th></tr></thead><tbody>
      ${E.events.map((e) => html`<tr class="${e.past ? "mc-past" : ""}"><td class="num">${fmtDate(e.date, "short")}</td><td>${e.name}</td><td class="muted">${e.club || ""}</td>
        <td class="r num">${e.n}</td><td class="r num">${e.carried}</td>
        <td><label class="check"><input type="checkbox" data-carry="${e.id}" ${e.carries ? "checked" : ""} ${can ? "" : "disabled"}> ${e.carries ? t("acc.pol.yes") : t("acc.pol.no")}</label>
          ${can && e.dueRunner && e.carries ? html`<button type="button" class="btn btn-sm" data-apply="${e.id}">${tn("acc.pol.apply", e.dueRunner, { n: e.dueRunner })}</button>` : ""}
          ${can && !e.carries && e.carried ? html`<button type="button" class="btn btn-sm" data-apply="${e.id}">${t("acc.pol.unapply")}</button>` : ""}</td></tr>`)}</tbody></table></div>`
      : html`<div class="empty">${t("acc.pol.none")}</div>`}
    <p class="muted ac-small">${t("acc.pol.rule")}</p></section>`;
  box.onchange = async (e) => {
    const id = e.target.dataset.carry;
    if (!id) return;
    const pol = { ...p, except: [...p.except], include: [...p.include] };
    const on = e.target.checked;
    pol.except = pol.except.filter((x) => x !== id); pol.include = pol.include.filter((x) => x !== id);
    const ev = E.events.find((x) => x.id === id);
    const byMode = p.mode === "all" || (p.mode === "champ" && /championnat|championship|meisterschaft|campeonato|campionat/i.test(ev?.name || ""));
    if (on && !byMode) pol.include.push(id);
    if (!on && byMode) pol.except.push(id);
    try { await api(`orgs/${org.id}/settings`, { method: "PUT", body: { entry_policy: pol } }); policyView(box, org, st); }
    catch (err) { alertBox(errText(err)); e.target.checked = !on; }
  };
  box.onclick = async (e) => {
    const b = e.target.closest("[data-apply]");
    if (!b) return;
    b.disabled = true;
    try { const y = await api(`accounts/${org.id}/apply`, { method: "POST", body: { event: b.dataset.apply } }); await alertBox(tn("acc.pol.applied", y.changed, { n: y.changed })); policyView(box, org, st); }
    catch (err) { b.disabled = false; alertBox(errText(err)); }
  };
}

// « Journal »
function journalView(box, org, st) {
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("acc.jr.title")}</h2><div class="hint">${t("acc.jr.hint")}</div></div></div>
    <div class="card-body row"><button type="button" class="btn btn-sm" data-jr="event">${t("acc.jr.byEvent")}</button><button type="button" class="btn btn-sm" data-jr="member">${t("acc.jr.byMember")}</button></div></section>`;
  box.onclick = async (e) => {
    const b = e.target.closest("[data-jr]");
    if (!b) return;
    let J;
    try { J = await api(`accounts/${org.id}/journal?season=${st.season}`); } catch (err) { alertBox(errText(err)); return; }
    const sep = lang() === "fr" ? ";" : ",", dec = (c) => { const s = ((c || 0) / 100).toFixed(2); return lang() === "fr" ? s.replace(".", ",") : s; };
    const cell = (v) => { const s = v == null ? "" : String(v); return new RegExp(`[${sep}"\\n]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const state = (x) => (x === "paid" ? t("acc.st.paid") : x === "waived" ? t("acc.st.waived") : t("acc.st.due"));
    let head, rows;
    if (b.dataset.jr === "event") {
      head = [t("acc.col.date"), t("acc.col.event"), t("acc.jr.side"), t("acc.col.runner"), t("acc.col.club"), t("acc.jr.payer"), t("acc.col.amount"), t("acc.jr.cur"), t("acc.col.state"), t("acc.jr.how"), t("acc.ref")];
      rows = J.rows.map((r) => [r.date, r.event, t(`acc.jr.${r.side}`), r.runner, r.club, r.payer, dec(r.amount), r.cur, state(r.state), r.how ? t(`acc.how.${r.how}`) : "", r.ref]);
    } else {
      head = [t("acc.col.member"), t("acc.col.date"), t("acc.jr.what"), t("acc.col.event"), t("acc.col.amount"), t("acc.ref")];
      const carried = J.rows.filter((r) => r.side === "carried");
      const nameOf = new Map(carried.map((r) => [r.person, r.runner]));
      rows = [...carried.map((r) => [r.runner, r.date, t("acc.carried"), r.event, dec(r.amount), ""]),
        ...J.ledger.map((l) => [nameOf.get(l.person) || l.person, l.at.slice(0, 10), t(`acc.led.${l.kind}`), l.note === "info" ? "" : l.note, dec(l.kind === "bill" ? 0 : l.amount), l.ref])]
        .sort((a, c) => String(a[0]).localeCompare(String(c[0])) || String(a[1]).localeCompare(String(c[1])));
    }
    const text = `﻿${[head, ...rows].map((r) => r.map(cell).join(sep)).join("\r\n")}\r\n`;
    saveBytes(new TextEncoder().encode(text), `${slug(org.name)}-${b.dataset.jr === "event" ? t("acc.jr.fileEvent") : t("acc.jr.fileMember")}-${st.season}.csv`, "text/csv");
  };
}

// ---- the bank statement, across the club's events ---------------------------------------------------------------------------
function bankDialog(panel, org, st) {
  const cur = st.D?.events?.[0]?.cur || "EUR";
  openBankDialog({ cur, title: t("acc.bank.titleClub"),
    load: async () => (await api(`accounts/${org.id}/refs`)).refs,
    send: async (picked) => {
      const items = picked.filter((x) => x.candidate.kind === "entry").map((x) => ({ ref: x.candidate.ref }));
      const bills = picked.filter((x) => x.candidate.kind === "bill").map((x) => ({ ref: x.candidate.ref, amount: x.line.amount, date: x.line.date, label: x.line.label.slice(0, 120) }));
      const y = await api(`accounts/${org.id}/pay`, { method: "POST", body: { items, bills, how: "transfer" } });
      return { ok: true, text: t("acc.bank.done", { entries: y.entries, repaid: y.repaid }) };
    } }).then((sent) => { if (sent) reload(panel, org, st); });
}

// ---- printing and PDFs --------------------------------------------------------------------------------------------------------
const slug = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "club";
function saveBytes(bytes, name, type = "application/pdf") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
/** A statement printed through a page of its own (an iframe), the site's own styles left aside. */
function printHtml(title, body) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(f);
  const d = f.contentDocument;
  d.open();
  d.write(`<!doctype html><html lang="${lang()}"><head><meta charset="utf-8"><title>${String(html`${title}`)}</title><style>
    body{font:12px system-ui,Arial,sans-serif;color:#111;margin:18mm} h1{font-size:18px;margin:0 0 10px} table{border-collapse:collapse;width:100%;margin:8px 0}
    th,td{border-bottom:1px solid #ccc;padding:3px 6px;text-align:left} .r{text-align:right} dl{display:grid;grid-template-columns:max-content auto;gap:2px 12px}
    dt{color:#555} dd{margin:0} .muted{color:#666} .num{font-variant-numeric:tabular-nums}</style></head>
    <body><h1>${String(html`${title}`)}</h1>${body}</body></html>`);
  d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } finally { setTimeout(() => f.remove(), 60000); } }, 200);
}

let pdfLibP = null;
const pdfLib = () => (pdfLibP ||= new Promise((res, rej) => {
  if (window.PDFLib) return res(window.PDFLib);
  const s = document.createElement("script");
  s.src = PDFLIB; s.onload = () => res(window.PDFLib); s.onerror = () => { pdfLibP = null; rej(new Error("pdf-lib")); };
  document.head.append(s);
}));
// Helvetica writes Windows-1252 alone: other letters lose their accents, the rest becomes « ? »
const WIN = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");      // i18n-ignore (Windows-1252's characters above 127)
const winSafe = (s) => [...String(s ?? "").replace(/[  ]/g, " ")].map((c) => {
  const n = c.charCodeAt(0);
  if ((n >= 32 && n < 127) || (n >= 160 && n < 256) || WIN.has(c)) return c;
  const d = c.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return /^[\x20-\x7e]+$/.test(d) ? d : "?";
}).join("");
/**
 * A statement as a PDF (A4): the club, a title, to whom, the lines [date, event, runner, cents, state], the totals [[label, cents]],
 * the reference and the bank details to pay, a note. -> Uint8Array.
 */
async function pdfDoc({ club, title, to, lines, totals, ref, bank, cur, note = "" }) {
  const L = await pdfLib();
  const doc = await L.PDFDocument.create();
  const font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
  doc.setTitle(winSafe(`${title} — ${club}`)); doc.setCreator("Ozimut"); doc.setProducer("Ozimut (pdf-lib)");
  const W = 595.28, H = 841.89, M = 48, grey = L.rgb(0.35, 0.38, 0.42), line = L.rgb(0.8, 0.82, 0.85);
  let page = doc.addPage([W, H]), y = H - M;
  const text = (s, x, yy, { size = 10, f = font, color = L.rgb(0.1, 0.1, 0.1), right = false, max = 0 } = {}) => {
    let str = winSafe(s);
    if (max) while (str.length > 1 && f.widthOfTextAtSize(str, size) > max) str = `${str.slice(0, -2)}…`;
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: right ? x - w : x, y: yy, size, font: f, color });
  };
  const m = (c) => fmtMoney(c, cur, locale());
  const head = () => {
    text(club, M, y, { size: 16, f: bold }); y -= 22;
    text(title, M, y, { size: 12, f: bold, color: L.rgb(0.83, 0.34, 0.1) }); y -= 16;
    text(`${t("acc.pdf.date")} ${fmtDate(new Date().toLocaleDateString("en-CA"))}`, M, y, { size: 9, color: grey }); y -= 14;
    if (to) { text(`${t("acc.pdf.to")} ${to}`, M, y, { size: 10 }); y -= 20; }
    const cols = [[t("acc.col.date"), M], [t("acc.col.event"), M + 66], [t("acc.col.runner"), M + 300], [t("acc.col.amount"), W - M, true]];
    for (const [s, x, r] of cols) text(s, x, y, { size: 9, f: bold, color: grey, right: !!r });
    y -= 5; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: line }); y -= 13;
  };
  head();
  for (const [date, ev, who, cents, state] of lines) {
    if (y < M + 120) { page = doc.addPage([W, H]); y = H - M; head(); }
    text(fmtDate(date, "short"), M, y, { size: 9 });
    text(ev, M + 66, y, { size: 9, max: 228 });
    text(who, M + 300, y, { size: 9, max: state ? 120 : 140 });
    if (state) text(state, M + 425, y, { size: 8, color: grey, max: 50 });
    text(m(cents), W - M, y, { size: 9, right: true });
    y -= 14;
  }
  y -= 2; page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: line });
  for (const [label, cents] of totals) { text(label, W - M - 200, y - 4, { size: 10 }); text(m(cents), W - M, y - 4, { size: 10, f: bold, right: true }); y -= 15; }
  y -= 14;
  if (note) { text(note, M, y, { size: 9, color: grey, max: W - 2 * M }); y -= 16; }
  if (ref) {
    if (y < M + 90) { page = doc.addPage([W, H]); y = H - M; }
    text(t("acc.pdf.pay"), M, y, { size: 10, f: bold }); y -= 15;
    text(`${t("acc.ref")} ${ref}`, M, y, { size: 11, f: bold }); y -= 15;
    if (bank?.iban) {
      text(t("acc.pdf.holder", { x: bank.holder || "—" }), M, y, { size: 10 }); y -= 14;
      text(`IBAN ${iban(bank.iban)}${bank.bic ? `   BIC ${bank.bic}` : ""}`, M, y, { size: 10 }); y -= 14;
    }
  }
  for (const p of doc.getPages()) {
    page = p;
    text(t("acc.pdf.foot"), M, 28, { size: 8, color: grey });
  }
  return doc.save();
}
