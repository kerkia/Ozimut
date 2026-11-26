// Orga › an event › « Inscriptions et départs » (tab key `departs`; owner, 2026-11-22, docs/clubs/design.md §3): the event's
// entries and start list in three steps. 1. Inscriptions — the entry form's settings (open, closing, late entries, places, the
// classes and their courses, the prices with a preview of three typical entrants, the fields asked, how to pay, the refund
// rule, the note), the entries (filters, counts by class and club, changes, cancellations, payments marked one by one, by
// reference or in bulk), an import read in the browser (any CSV with a heading row, OE's, IOF XML EntryList, a Google Sheet),
// entries by hand and the exports; 2. Horaires — none, booked by the runners on a grid (the booking of 2026-11-03), drawn here
// (Chronoz's draw run on the entries, checked by startchecks.js) or a start-list file matched to the entries; 3. Liste de
// départ — publication (an organiser's deposit, then the results run), the start's O Checklist file, the exports; and, for a
// competition without entries on Ozimut, the start-list deposit of before (pages/orgstarts.js).

import { html, raw, $, $$, fmt, fmtDate, fmtCat, normalise } from "../util.js";
import { t, tn, loadArea, locale, lang } from "../i18n.js";
import { confirmBox, alertBox } from "../askbox.js";
import { call, hm, parseHm, parseStep, fmtStep, slotsOf, clubLabel, clubList, runnerForm, bindRunnerForm, takenMap, clashes, partsText } from "../bookingcore.js";
import { priceOf, cleanRules, fmtMoney, parseMoney, moneyField, typical, CURRENCIES } from "../entryprice.js";
import { packFor } from "../chrono/rules/index.js";
import { draw as chronoDraw } from "../chrono/draw.js";
import { readCsv } from "../chrono/io/oecsv.js";
import { readIof } from "../chrono/io/iofxml.js";
import { parse as readStarts } from "../localstart.js";
import { check as drawChecks, oChecklist, saveOChecklist } from "../startchecks.js";

const STEPS = ["inscriptions", "horaires", "depart"];
const uid = () => `k${Math.random().toString(36).slice(2, 8)}`;
const money = (c, cur) => fmtMoney(c, cur, locale());
const courseKey = (c) => String(c.course || c.name || "").trim().slice(0, 60);
const split = (w) => (w ? w.split("T") : ["", ""]);
const errText = (code, X = {}) => { const k = `ent.err.${String(code || "").replace(/\s+/g, "_")}`; return t(k, X) !== k ? t(k, X) : t("ent.err.other"); };
async function download(path, name) {
  const r = await fetch(`api/entries${path}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
  if (!r?.ok) return alertBox(t("ent.err.other"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob());
  a.download = (/filename="([^"]+)"/.exec(r.headers.get("content-disposition") || "") || [])[1] || name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** `ev`: the event (api/events view), `D`: its page's data, `q`: the address's query; `base` the tab's address, `race` the
 *  competition as the organisers' tools take it (orgstarts.js deposit). */
export async function render(panel, ev, D, q, { base, race } = {}) {
  await loadArea("entries");
  const step = STEPS.includes(q.etape) ? q.etape : "inscriptions";
  const id = encodeURIComponent(ev.id);
  panel.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  const st = { form: null, entries: [], bank: null, step, filter: { cls: "", club: "", origin: "", unpaid: false, nocard: false, nostart: false, pending: false, gone: false, q: "" },
    sel: new Set(), editing: null, imported: null, circuit: null, drawn: null };
  async function load() {
    const [f, l] = await Promise.all([call("GET", `/${id}/form`), call("GET", `/${id}/list`)]);
    if (!f.ok) throw Object.assign(new Error("load"), { status: f.status, code: f.data.error });
    st.form = f.data.form; st.bank = f.data.bank; st.ev = f.data.event;
    st.entries = l.ok ? l.data.entries : [];
  }
  try { await load(); } catch (e) {
    panel.innerHTML = html`<div class="card"><div class="empty">${e.status === 503 ? t("ent.err.not_ready") : errText(e.code)}</div></div>`;
    return;
  }
  const F = () => st.form;
  const cur = () => F()?.prices?.currency || "EUR";
  const live = () => st.entries.filter((e) => e.state !== "cancelled");
  const year = Number(String(ev.date).slice(0, 4));
  const past = ev.date < new Date().toLocaleDateString("sv-SE");
  const href = (s) => `${base}&etape=${s}`;
  const share = `${location.origin}${location.pathname}#/inscription?ev=${id}`;

  panel.innerHTML = html`
    <nav class="en-steps" aria-label="${t("ent.org.steps")}">${STEPS.map((s, i) => html`<a href="${href(s)}" class="${s === step ? "on" : ""}" ${raw(s === step ? 'aria-current="step"' : "")}>
      <span class="en-step-n">${i + 1}</span> ${t(`ent.org.step.${s}`)}</a>`)}</nav>
    <div id="eo-state"></div>
    <div id="eo-body"></div>`;
  function drawState() {
    const f = F(), n = live().filter((e) => e.state === "entered").length, p = live().filter((e) => e.state === "pending").length;
    $("#eo-state").innerHTML = !f ? html`<div class="notice info"><div>${t("ent.org.none")}</div></div>`
      : html`<div class="notice ${f.state === "open" ? "info" : ""} en-org-state"><div><b>${t(`ent.org.st.${f.open ? "open" : f.state}`)}</b>
        ${f.closes ? html` · ${t("ent.org.closes", { when: `${fmtDate(split(f.closes)[0])} ${split(f.closes)[1]}` })}` : ""}
        · ${tn("ent.org.count", n, { n: fmt(n) })}${p ? ` · ${tn("ent.org.pendingN", p, { n: p })}` : ""}
        ${f.state !== "draft" ? html` · <a href="#/inscription?ev=${id}" target="_blank" rel="noopener">${t("ent.org.see")} ↗</a>` : ""}</div></div>`;
  }
  drawState();
  const box = $("#eo-body");

  // =========================================================================================================================
  // 1. Inscriptions
  // =========================================================================================================================
  async function stepEntries() {
    box.innerHTML = html`
      <section class="card" style="margin-bottom:16px"><details id="eo-set-d" ${!F() || F().state === "draft" ? "open" : ""}><summary class="card-head en-sum"><h2>${t("ent.org.settings")}</h2></summary>
        <div class="card-body" id="eo-settings"></div></details></section>
      <section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("ent.org.list")}</h2><div class="hint" id="eo-counts"></div></div>
        <div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-dl="csv">${t("ent.org.dl.csv")}</button>
          <button type="button" class="btn btn-sm" data-dl="oecsv">${t("ent.org.dl.oe")}</button><button type="button" class="btn btn-sm" data-dl="iofxml">${t("ent.org.dl.iof")}</button>
          <button type="button" class="btn btn-sm" data-chrono title="${t("ent.org.chrono.tip")}">${t("ent.org.chrono")}</button></div></div>
        <div class="card-body" id="eo-filters"></div><div class="table-wrap" id="eo-table"></div><div class="card-body" id="eo-bulk"></div></section>
      <section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("ent.org.import")}</h2><div class="hint">${t("ent.org.import.hint")}</div></div></div>
        <div class="card-body" id="eo-import"></div></section>
      <section class="card"><div class="card-head"><h2>${t("ent.org.hand")}</h2></div><div class="card-body" id="eo-hand"></div></section>`;
    drawSettings(); drawList(); drawImport(); drawHand();
    box.addEventListener("click", (e) => { const d = e.target.closest("[data-dl]"); if (d) download(`/${id}/export?f=${d.dataset.dl}`, `entries.${d.dataset.dl === "iofxml" ? "xml" : "csv"}`); });
    // the entries in the event's Chrono log (its welcome desk), then at every change (functions/_lib/entrychrono.js)
    box.querySelector("[data-chrono]")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      const r = await call("POST", `/${id}/chrono`);
      b.disabled = false;
      if (!r.ok) { alertBox(errText(r.data.error)); return; }
      alertBox(t("ent.org.chrono.done", { n: fmt(r.data.wrote || 0) }));
      await load(); drawState(); drawList();
    });
  }

  // ---- the settings ----
  let cfg = null;
  function startCfg() {
    const f = F();
    if (f) return JSON.parse(JSON.stringify({ state: f.state, opens: f.opens, closes: f.closes, late_until: f.late_until, places: f.places, classes: f.classes, prices: f.prices,
      fields: f.fields, pay: f.pay, refund_rule: f.refund_rule, note: f.note, starts: f.starts }));
    const close = new Date(Date.parse(`${ev.date}T12:00:00Z`) - 5 * 86400e3).toISOString().slice(0, 10);
    return { state: "draft", opens: null, closes: `${close}T23:59`, late_until: null, places: null, classes: [],
      prices: cleanRules({ currency: ev.country === "CH" ? "CHF" : ev.country === "GB" ? "GBP" : ev.country === "CA" ? "CAD" : "EUR" }),
      fields: { card: "ask", birth: false, note: false }, pay: { transfer: true, desk: true }, refund_rule: "", note: "", starts: { mode: "none", circuits: [], gap: 0, max: 10, blocked: {} } };
  }
  function drawSettings() {
    cfg = cfg || startCfg();
    const c = cfg, P = c.prices;
    const [od, oh] = split(c.opens), [cd, ch] = split(c.closes), [ld, lh] = split(c.late_until);
    const n = (k) => live().filter((e) => e.class_id === k).length;
    $("#eo-settings").innerHTML = html`
      <div class="bo-status" role="radiogroup" aria-label="${t("ent.org.state")}">${["draft", "open", "closed"].map((s) => html`<label class="check">
        <input type="radio" name="eo-state" value="${s}" ${c.state === s ? "checked" : ""}> <b>${t(`ent.org.st.${s}`)}</b> <span class="muted">${t(`ent.org.st.${s}.hint`)}</span></label>`)}</div>
      <div class="filters bo-fields">
        <label class="field"><span>${t("ent.org.opens")}</span><span class="row" style="gap:6px"><input type="date" id="eo-od" value="${od}" max="${ev.date}"><input type="time" id="eo-oh" value="${oh || "00:00"}"></span></label>
        <label class="field"><span>${t("ent.org.closesAt")}</span><span class="row" style="gap:6px"><input type="date" id="eo-cd" value="${cd}" max="${ev.date}"><input type="time" id="eo-ch" value="${ch || "23:59"}"></span></label>
        <label class="field"><span>${t("ent.org.late")}</span><span class="row" style="gap:6px"><input type="date" id="eo-ld" value="${ld}" max="${ev.date}"><input type="time" id="eo-lh" value="${lh || "23:59"}"></span></label>
        <label class="field"><span>${t("ent.org.places")}</span><input id="eo-places" type="number" min="1" value="${c.places || ""}" style="width:90px" placeholder="${t("ent.org.nolimit")}"></label>
      </div>
      <h3 class="bo-h">${t("ent.org.classes")}</h3>
      <div class="table-wrap"><table class="data compact eo-classes"><thead><tr><th>${t("ent.org.c.name")}</th><th>${t("ent.org.c.course")}</th><th>${t("ent.org.c.cats")}</th>
        <th>${t("ent.org.c.places")}</th><th>${t("ent.org.c.price")}</th><th class="r">${t("ent.org.c.n")}</th><th></th></tr></thead>
        <tbody>${c.classes.map((k, i) => html`<tr data-i="${i}"><td><input data-f="name" value="${k.name}" maxlength="60" style="width:130px"></td>
          <td><input data-f="course" value="${k.course || ""}" maxlength="60" style="width:110px" placeholder="${k.name}"></td>
          <td><input data-f="cats" value="${(k.cats || []).join(", ")}" style="width:140px" placeholder="H21, H35"></td>
          <td><input data-f="places" type="number" min="1" value="${k.places || ""}" style="width:70px"></td>
          <td><input data-f="price" value="${P.classes[k.id] != null ? moneyField(P.classes[k.id]) || "0" : ""}" style="width:70px" inputmode="decimal"></td>
          <td class="r num">${fmt(n(k.id))}</td>
          <td class="r">${n(k.id) ? "" : html`<button type="button" class="icon-btn" data-cdel="${i}" title="${t("ent.org.c.del")}" aria-label="${t("ent.org.c.del")}">✕</button>`}</td></tr>`)}</tbody></table></div>
      <p class="muted bk-small">${t("ent.org.c.hint")}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:8px 0 14px"><button type="button" class="btn btn-sm" id="eo-c-add">+ ${t("ent.org.c.add")}</button>
        <button type="button" class="btn btn-sm" data-sugg="courses">${t("ent.org.c.fromCourses")}</button>
        ${packFor(ev.country).courses?.length ? html`<button type="button" class="btn btn-sm" data-sugg="colours">${t("ent.org.c.colours")}</button>` : ""}
        <button type="button" class="btn btn-sm" data-sugg="cats">${t("ent.org.c.cats.add")}</button></div>
      <h3 class="bo-h">${t("ent.org.prices")}</h3>
      <div class="filters bo-fields">
        <label class="field"><span>${t("ent.org.currency")}</span><select id="eo-cur">${CURRENCIES.map((x) => html`<option ${x === P.currency ? "selected" : ""}>${x}</option>`)}</select></label>
        <label class="field"><span>${t("ent.org.rent")}</span><input id="eo-rent" value="${moneyField(P.rent)}" style="width:80px" inputmode="decimal"></label>
        <label class="field"><span>${t("ent.org.lateFee")}</span><input id="eo-latefee" value="${moneyField(P.late)}" style="width:80px" inputmode="decimal"></label>
        <label class="field"><span>${t("ent.org.cap")}</span><input id="eo-cap" value="${moneyField(P.family_cap)}" style="width:80px" inputmode="decimal" placeholder="${t("ent.org.nolimit")}"></label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-ownfree" ${P.own_free ? "checked" : ""}> ${t("ent.org.ownFree")}</label>
      </div>
      <div class="table-wrap"><table class="data compact eo-bands"><thead><tr><th>${t("ent.org.b.label")}</th><th>${t("ent.org.b.min")}</th><th>${t("ent.org.b.max")}</th>
        <th>${t("ent.org.b.lic")}</th><th>${t("ent.org.b.amount")}</th><th></th></tr></thead>
        <tbody>${P.bands.map((b, i) => html`<tr data-i="${i}"><td><input data-f="label" value="${b.label}" maxlength="40" style="width:140px"></td>
          <td><input data-f="minAge" type="number" min="0" max="120" value="${b.minAge ?? ""}" style="width:60px"></td><td><input data-f="maxAge" type="number" min="0" max="120" value="${b.maxAge ?? ""}" style="width:60px"></td>
          <td><select data-f="licensed"><option value="">${t("ent.org.b.any")}</option><option value="1" ${b.licensed === true ? "selected" : ""}>${t("ent.org.b.yes")}</option>
            <option value="0" ${b.licensed === false ? "selected" : ""}>${t("ent.org.b.no")}</option></select></td>
          <td><input data-f="amount" value="${moneyField(b.amount) || "0"}" style="width:70px" inputmode="decimal"></td>
          <td class="r"><button type="button" class="icon-btn" data-bdel="${i}" aria-label="${t("ent.org.c.del")}">✕</button></td></tr>`)}</tbody></table></div>
      <p class="muted bk-small">${t("ent.org.b.hint")}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0"><button type="button" class="btn btn-sm" id="eo-b-add">+ ${t("ent.org.b.add")}</button></div>
      <div class="table-wrap"><table class="data compact eo-opts"><thead><tr><th>${t("ent.org.o.label")}</th><th>${t("ent.org.b.amount")}</th><th></th></tr></thead>
        <tbody>${P.options.map((o, i) => html`<tr data-i="${i}" data-id="${o.id}"><td><input data-f="label" value="${o.label}" maxlength="60" style="width:200px"></td>
          <td><input data-f="amount" value="${moneyField(o.amount) || "0"}" style="width:70px" inputmode="decimal"></td>
          <td class="r"><button type="button" class="icon-btn" data-odel="${i}" aria-label="${t("ent.org.c.del")}">✕</button></td></tr>`)}</tbody></table></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0 10px"><button type="button" class="btn btn-sm" id="eo-o-add">+ ${t("ent.org.o.add")}</button></div>
      <div class="en-preview" id="eo-preview">${raw(previewHtml())}</div>
      <h3 class="bo-h">${t("ent.org.fields")}</h3>
      <div class="filters bo-fields">
        <label class="field"><span>${t("ent.org.f.card")}</span><select id="eo-card">${["no", "ask", "require"].map((x) => html`<option value="${x}" ${c.fields.card === x ? "selected" : ""}>${t(`ent.org.f.card.${x}`)}</option>`)}</select></label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-birth" ${c.fields.birth ? "checked" : ""}> ${t("ent.org.f.birth")}</label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-fnote" ${c.fields.note ? "checked" : ""}> ${t("ent.org.f.note")}</label></div>
      <h3 class="bo-h">${t("ent.org.pay")}</h3>
      <div class="filters bo-fields">
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-transfer" ${c.pay.transfer !== false ? "checked" : ""}> ${t("ent.org.pay.transfer")}</label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-desk" ${c.pay.desk ? "checked" : ""}> ${t("ent.org.pay.desk")}</label>
        <label class="field"><span>${t("ent.org.pay.before")}</span><input type="date" id="eo-before" value="${c.pay.before || ""}" max="${ev.date}"></label></div>
      ${st.bank?.from === "club" ? html`<p class="muted bk-small">${t("ent.org.pay.club", { holder: st.bank.holder || "—", iban: st.bank.iban })}</p>`
        : html`<p class="muted bk-small">${t("ent.org.pay.noClub")}</p><div class="filters bo-fields">
          <label class="field"><span>${t("ent.pay.holder")}</span><input id="eo-holder" value="${c.pay.holder || ""}" maxlength="80" style="width:200px"></label>
          <label class="field"><span>IBAN</span><input id="eo-iban" value="${c.pay.iban || ""}" maxlength="42" style="width:260px"></label>
          <label class="field"><span>BIC</span><input id="eo-bic" value="${c.pay.bic || ""}" maxlength="11" style="width:110px"></label></div>`}
      <label class="field" style="margin:4px 0 10px"><span>${t("ent.org.pay.note")}</span><input id="eo-paynote" value="${c.pay.note || ""}" maxlength="600"></label>
      <label class="field" style="margin:4px 0 10px"><span>${t("ent.org.refund")}</span><input id="eo-refund" value="${c.refund_rule || ""}" maxlength="600" placeholder="${t("ent.org.refund.ph")}"></label>
      <label class="field" style="margin:4px 0 14px"><span>${t("ent.org.note")}</span><textarea id="eo-note" rows="2" maxlength="1000" placeholder="${t("bk.org.note.ph")}">${c.note || ""}</textarea></label>
      <div id="eo-s-err"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-primary" id="eo-save">${t("ent.org.save")}</button></div>
      ${F() && F().state !== "draft" ? html`<div class="notice info" style="margin-top:14px"><div>${t("ent.org.share")}
        <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap"><input readonly value="${share}" id="eo-link" style="flex:1;min-width:240px">
        <button type="button" class="btn btn-sm" id="eo-copy">${t("bk.org.copy")}</button></div></div></div>` : ""}`;
  }
  /** The prices of three typical entrants under the grid as typed (the first class without a price of its own). */
  function previewHtml() {
    const P = cfg.prices, typ = typical(year), firstCls = cfg.classes.find((x) => P.classes[x.id] == null)?.id || cfg.classes[0]?.id;
    return html`<b>${t("ent.org.preview")}</b>${firstCls ? html`<ul>${typ.map((x) => { const p = priceOf(P, { ...x, class_id: firstCls }, { year });
      return html`<li>${t("ent.org.typ.line", { who: t(`ent.org.typ.${x.key}`), x: money(p.cents, P.currency) })} <span class="muted">${partsText(p.parts, P.currency)}</span></li>`; })}</ul>`
      : html` <span class="muted">${t("ent.org.preview.none")}</span>`}`;
  }
  /** What the settings' fields hold now, into cfg (even half typed); -> an error's text or null. */
  function keep() {
    const c = cfg, P = c.prices;
    const v = (sel) => $(sel)?.value ?? "";
    const when = (d, h) => (v(d) ? `${v(d)}T${v(h) || "23:59"}` : null);
    c.state = $("input[name=eo-state]:checked")?.value || c.state;
    c.opens = when("#eo-od", "#eo-oh"); c.closes = when("#eo-cd", "#eo-ch"); c.late_until = when("#eo-ld", "#eo-lh");
    c.places = Number(v("#eo-places")) || null;
    let err = null;
    for (const tr of $$(".eo-classes tbody tr")) {
      const k = c.classes[Number(tr.dataset.i)], g = (f) => $(`[data-f=${f}]`, tr).value.trim();
      k.name = g("name"); k.course = g("course");
      k.cats = g("cats").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
      if (!k.cats.length) delete k.cats;
      k.places = Number(g("places")) || undefined;
      const pr = g("price");
      if (pr === "") delete P.classes[k.id];
      else { const m = parseMoney(pr); if (m == null) err = t("ent.org.err.amount"); else P.classes[k.id] = m; }
    }
    P.bands = $$(".eo-bands tbody tr").map((tr) => {
      const g = (f) => $(`[data-f=${f}]`, tr).value.trim(), am = parseMoney(g("amount"));
      if (am == null) err = t("ent.org.err.amount");
      return { label: g("label"), ...(g("minAge") !== "" ? { minAge: Number(g("minAge")) } : {}), ...(g("maxAge") !== "" ? { maxAge: Number(g("maxAge")) } : {}),
        ...(g("licensed") ? { licensed: g("licensed") === "1" } : {}), amount: am || 0 };
    });
    P.options = $$(".eo-opts tbody tr").map((tr) => {
      const g = (f) => $(`[data-f=${f}]`, tr).value.trim(), am = parseMoney(g("amount"));
      if (am == null) err = t("ent.org.err.amount");
      return { id: tr.dataset.id, label: g("label"), amount: am || 0 };
    });
    P.currency = v("#eo-cur") || P.currency;
    for (const [sel, k] of [["#eo-rent", "rent"], ["#eo-latefee", "late"], ["#eo-cap", "family_cap"]]) { const m = parseMoney(v(sel)); if (m == null) err = t("ent.org.err.amount"); else P[k] = m; }
    P.own_free = !!$("#eo-ownfree")?.checked;
    c.fields = { card: v("#eo-card") || "ask", birth: !!$("#eo-birth")?.checked, note: !!$("#eo-fnote")?.checked };
    c.pay = { ...c.pay, transfer: !!$("#eo-transfer")?.checked, desk: !!$("#eo-desk")?.checked, before: v("#eo-before"), note: v("#eo-paynote").trim(),
      ...($("#eo-iban") ? { iban: v("#eo-iban").trim(), holder: v("#eo-holder").trim(), bic: v("#eo-bic").trim() } : {}) };
    c.refund_rule = v("#eo-refund").trim(); c.note = v("#eo-note").trim();
    return err;
  }
  async function saveCfg(msgBox = "#eo-s-err") {
    const err = keep();
    const say = (m, ok = false) => { const b = $(msgBox); if (b) b.innerHTML = html`<div class="notice ${ok ? "ok" : ""}" style="margin-bottom:10px">${m}</div>`; };
    if (err) return say(err);
    if (cfg.classes.some((k) => !k.name)) return say(t("ent.org.err.className"));
    if (new Set(cfg.classes.map((k) => k.name.toLowerCase())).size < cfg.classes.length) return say(t("ent.org.err.twice"));
    if (cfg.state === "open" && !cfg.classes.length) return say(t("ent.org.err.noClass"));
    const y = await call("PUT", `/${id}/form`, cfg);
    if (!y.ok) return say(errText(y.data.error, { name: y.data.name || "" }));
    st.form = y.data.form; st.bank = y.data.bank; cfg = null;
    drawState(); drawSettings();
    say(t("ent.org.saved"), true);
    return true;
  }
  /** The class suggestions: the event's map analysis's circuits (else Résultats' registration circuits), the country's colour
   *  courses, its categories. */
  async function suggest(kind) {
    const have = new Set(cfg.classes.map((k) => k.name.toLowerCase()));
    const add = (name, extra = {}) => { if (!name || have.has(name.toLowerCase())) return; have.add(name.toLowerCase()); cfg.classes.push({ id: uid(), name, course: "", ...extra }); };
    if (kind === "courses") {
      let names = [];
      if (D.event.analysis) {
        const r = await fetch(`api/analyses/${encodeURIComponent(D.event.analysis)}`, { credentials: "same-origin", cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        names = (r?.courses || r?.analysis?.courses || []).map((c) => c.name).filter(Boolean);
      }
      if (!names.length) names = (race?.e?.reg?.circuits || []).map((c) => c[0]).filter(Boolean);
      if (!names.length) return alertBox(t("ent.org.c.noCourses"));
      names.forEach((n) => add(n));
    } else if (kind === "colours") packFor(ev.country).courses.forEach((n) => add(n));
    else {
      const p = packFor(ev.country);
      for (const s of p.sexes) for (const a of p.ages) { const name = `${s}${a}`; add(name, { cats: [name] }); }
    }
    drawSettings();
  }
  box.addEventListener("click", async (e) => {
    const q = (a) => e.target.closest(`[${a}]`);
    if (!e.target.closest("#eo-settings")) return;
    if (e.target.id === "eo-c-add") { keep(); cfg.classes.push({ id: uid(), name: "", course: "" }); drawSettings(); $$(".eo-classes [data-f=name]").at(-1)?.focus(); }
    else if (q("data-cdel")) { keep(); const k = cfg.classes.splice(Number(q("data-cdel").dataset.cdel), 1)[0]; delete cfg.prices.classes[k.id]; drawSettings(); }
    else if (q("data-sugg")) { keep(); await suggest(q("data-sugg").dataset.sugg); }
    else if (e.target.id === "eo-b-add") { keep(); cfg.prices.bands.push({ label: "", amount: 0 }); drawSettings(); }
    else if (q("data-bdel")) { keep(); cfg.prices.bands.splice(Number(q("data-bdel").dataset.bdel), 1); drawSettings(); }
    else if (e.target.id === "eo-o-add") { keep(); cfg.prices.options.push({ id: uid(), label: "", amount: 0 }); drawSettings(); }
    else if (q("data-odel")) { keep(); cfg.prices.options.splice(Number(q("data-odel").dataset.odel), 1); drawSettings(); }
    else if (e.target.id === "eo-save") { e.target.disabled = true; await saveCfg(); const b = $("#eo-save"); if (b) b.disabled = false; drawList(); }
    else if (e.target.id === "eo-copy") navigator.clipboard?.writeText(share).then(() => { e.target.textContent = t("bk.org.copied"); }).catch(() => $("#eo-link").select());
  });
  // the preview follows the prices as they are typed
  box.addEventListener("change", (e) => { if (cfg && e.target.closest("#eo-settings") && $("#eo-preview")) { keep(); $("#eo-preview").innerHTML = previewHtml(); } });

  // ---- the list ----
  const clsName = (cid) => F()?.classes?.find((k) => k.id === cid)?.name || cid;
  function filtered() {
    const f = st.filter;
    return st.entries.filter((e) => (f.gone ? true : e.state !== "cancelled") && (!f.cls || e.class_id === f.cls) && (!f.club || (e.club_key || "") === f.club)
      && (!f.origin || e.origin === f.origin) && (!f.unpaid || (e.pay_state === "due" && e.payer === "runner")) && (!f.nocard || (!e.card && !e.rent))
      && (!f.nostart || e.start_s == null) && (!f.pending || e.state === "pending")
      && (!f.q || normalise(`${e.first_name} ${e.last_name} ${e.club_name} ${e.licence} ${e.order_ref}`).includes(normalise(f.q))));
  }
  function drawList() {
    if (!$("#eo-table")) return;
    if (!F()) { $("#eo-table").innerHTML = html`<div class="empty">${t("ent.org.saveFirst")}</div>`; $("#eo-filters").innerHTML = ""; $("#eo-bulk").innerHTML = ""; $("#eo-counts").textContent = ""; return; }
    const L = live(), f = st.filter, c = cur();
    const byCls = new Map(), byClub = new Map();
    for (const e of L) { byCls.set(e.class_id, (byCls.get(e.class_id) || 0) + 1); const k = e.club_key || ""; byClub.set(k, { n: (byClub.get(k)?.n || 0) + 1, e }); }
    const due = L.filter((e) => e.pay_state === "due" && e.payer === "runner").reduce((s, e) => s + e.price, 0);
    const paid = L.filter((e) => e.pay_state === "paid").reduce((s, e) => s + e.price, 0);
    $("#eo-counts").innerHTML = html`${tn("ent.org.count", L.length, { n: fmt(L.length) })} · ${t("ent.org.money", { paid: money(paid, c), due: money(due, c) })}`;
    $("#eo-filters").innerHTML = html`<div class="filters" style="margin:0;padding:0;border:0;background:none;flex-wrap:wrap;gap:8px">
      <label class="field"><span>${t("ent.col.class")}</span><select data-flt="cls"><option value="">${t("ent.all")}</option>${F().classes.map((k) => html`<option value="${k.id}" ${f.cls === k.id ? "selected" : ""}>${k.name} (${byCls.get(k.id) || 0})</option>`)}</select></label>
      <label class="field"><span>${t("rk.col.club")}</span><select data-flt="club"><option value="">${t("ent.all")}</option>${[...byClub].sort((a, b) => b[1].n - a[1].n).map(([k, x]) => html`<option value="${k}" ${f.club === k ? "selected" : ""}>${k ? clubLabel(x.e, ev.country) : t("bk.noClub")} (${x.n})</option>`)}</select></label>
      <label class="field"><span>${t("ent.org.origin")}</span><select data-flt="origin"><option value="">${t("ent.all")}</option>${["form", "guest", "file", "hand", "desk"].map((o) => html`<option value="${o}" ${f.origin === o ? "selected" : ""}>${t(`ent.origin.${o}`)}</option>`)}</select></label>
      <label class="field"><span>${t("ent.search")}</span><input data-flt="q" value="${f.q}" style="width:160px"></label>
      ${["unpaid", "nocard", "nostart", "pending", "gone"].map((k) => html`<label class="check" style="align-self:flex-end"><input type="checkbox" data-flt="${k}" ${f[k] ? "checked" : ""}> ${t(`ent.org.flt.${k}`)}</label>`)}</div>`;
    const rows = filtered();
    $("#eo-table").innerHTML = rows.length ? html`<table class="data compact eo-list" data-freeze="2" data-freeze-phone="1"><thead><tr><th><input type="checkbox" id="eo-all" aria-label="${t("ent.all")}"></th>
        <th>${t("bk.col.runner")}</th><th>${t("rk.col.club")}</th><th>${t("ent.col.class")}</th><th>${t("os.c.card")}</th><th class="r">${t("bk.col.start")}</th>
        <th class="r">${t("ent.col.amount")}</th><th>${t("ent.ref")}</th><th>${t("ent.col.pay")}</th><th>${t("ent.col.state")}</th><th></th></tr></thead>
      <tbody>${rows.map((e) => st.editing === e.id ? editRow(e) : html`<tr class="${e.state === "cancelled" ? "en-gone" : ""}"><td><input type="checkbox" data-sel="${e.id}" ${st.sel.has(e.id) ? "checked" : ""}></td>
        <td><b>${e.last_name}</b> ${e.first_name}${e.licence ? html` <span class="muted">${e.licence}</span>` : ""}${e.birth_year ? html` <span class="muted">· ${e.birth_year}</span>` : ""}${e.category ? html` <span class="muted">· ${fmtCat(e.category)}</span>` : ""}
          ${e.note ? html`<div class="muted en-small">${e.note}</div>` : ""}</td>
        <td class="muted">${e.club_country ? clubLabel(e, ev.country) : ""}</td><td>${e.class}</td>
        <td class="num">${e.rent ? html`<span class="tag">${t("ent.rented")}</span>` : e.card}</td><td class="r num">${hm(e.start_s)}</td>
        <td class="r num" title="${partsText(e.parts, c)}">${money(e.price, c)}</td><td class="num">${e.order_ref}</td>
        <td>${e.payer === "club" ? html`<span class="tag">${t("ent.byClub")}</span> ` : ""}${e.pay_state === "paid" ? html`<span class="tag tag-in" title="${e.paid_how ? t(`ent.how.${e.paid_how}`) : ""}">${t("ent.pay.paid")}</span>`
          : e.pay_state === "waived" ? html`<span class="tag">${t("ent.pay.waived")}</span>` : html`<button type="button" class="btn btn-sm" data-paid="${e.id}">${t("ent.org.markPaid")}</button>`}</td>
        <td>${e.state === "pending" ? html`<span class="tag tag-warn" title="${t("ent.pending.tip")}">${t("ent.st.pending")}</span>` : e.state === "cancelled" ? html`<span class="tag">${t("ent.st.cancelled")}</span>`
          : e.state === "dns" ? html`<span class="tag">${t("ent.st.dns")}</span>` : ""} <span class="muted en-small">${t(`ent.origin.${e.origin}`)}${e.by_name && ["form", "guest"].includes(e.origin) ? ` · ${e.by_name}` : ""}</span></td>
        <td class="r" style="white-space:nowrap">${e.state !== "cancelled" ? html`<button type="button" class="btn btn-sm" data-edit="${e.id}">${t("ent.org.edit")}</button>
          <button type="button" class="btn btn-sm" data-rm="${e.id}">${t("bk.cancel")}</button>` : html`<button type="button" class="btn btn-sm" data-back="${e.id}">${t("ent.org.restore")}</button>`}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ent.list.none")}</div>`;
    $("#eo-bulk").innerHTML = html`<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
      <label class="field"><span>${t("ent.org.how")}</span><select id="eo-how">${["transfer", "cash", "cheque", "card", "club", "other"].map((h) => html`<option value="${h}">${t(`ent.how.${h}`)}</option>`)}</select></label>
      <button type="button" class="btn btn-sm" id="eo-paysel" ${st.sel.size ? "" : "disabled"}>${tn("ent.org.paySel", st.sel.size, { n: st.sel.size })}</button>
      <button type="button" class="btn btn-sm" id="eo-duesel" ${st.sel.size ? "" : "disabled"}>${t("ent.org.dueSel")}</button>
      <label class="field"><span>${t("ent.ref")}</span><input id="eo-ref" placeholder="OZ-XXXX" style="width:110px"></label>
      <button type="button" class="btn btn-sm" id="eo-payref">${t("ent.org.payRef")}</button>
      <button type="button" class="btn btn-sm" id="eo-bank" title="${t("ent.org.bank.tip")}">${t("ent.org.bank")}</button></div>
      <div id="eo-bulk-msg"></div>`;
  }
  function editRow(e) {
    const f = F();
    return html`<tr class="bk-mine"><td></td><td colspan="10"><b>${e.first_name} ${e.last_name}</b>
      <div class="en-pick" style="margin-top:6px">
        <label class="field"><span>${t("bk.f.first")}</span><input data-e="first_name" value="${e.first_name}" maxlength="60"></label>
        <label class="field"><span>${t("bk.f.last")}</span><input data-e="last_name" value="${e.last_name}" maxlength="60"></label>
        <label class="field"><span>${t("ent.col.class")}</span><select data-e="class_id">${f.classes.map((k) => html`<option value="${k.id}" ${k.id === e.class_id ? "selected" : ""}>${k.name}</option>`)}</select></label>
        <label class="field en-narrow"><span>${t("ent.f.birth")}</span><input data-e="birth_year" type="number" value="${e.birth_year || ""}"></label>
        <label class="field en-card"><span>${t("os.c.card")}</span><input data-e="card" value="${e.card}" inputmode="numeric" maxlength="10"></label>
        <label class="check"><input type="checkbox" data-e="rent" ${e.rent ? "checked" : ""}> ${t("ent.f.rent")}</label>
        <label class="field en-narrow"><span>${t("bk.col.start")}</span><input data-e="start" value="${hm(e.start_s)}" placeholder="10:32"></label>
        <label class="field en-narrow"><span>${t("ent.col.amount")}</span><input data-e="price" value="${moneyField(e.price) || "0"}" inputmode="decimal"></label>
        <label class="field"><span>${t("ent.col.state")}</span><select data-e="state">${["entered", "pending", "dns"].map((s) => html`<option value="${s}" ${e.state === s ? "selected" : ""}>${t(`ent.st.${s}`)}</option>`)}</select></label>
        <label class="field"><span>${t("ent.f.note")}</span><input data-e="note" value="${e.note}" maxlength="300"></label>
        <label class="check"><input type="checkbox" data-e="force"> ${t("bk.org.force")}</label>
        <button type="button" class="btn btn-sm btn-primary" data-esave="${e.id}">${t("bk.save")}</button><button type="button" class="btn btn-sm" data-estop="1">${t("bk.back")}</button></div>
      <div id="eo-e-err"></div></td></tr>`;
  }
  async function reloadList() {
    const l = await call("GET", `/${id}/list`);
    if (l.ok) st.entries = l.data.entries;
    drawState(); drawList();
  }
  box.addEventListener("change", (e) => {
    const fl = e.target.dataset.flt;
    if (fl) { st.filter[fl] = e.target.type === "checkbox" ? e.target.checked : e.target.value; drawList(); return; }
    if (e.target.dataset.sel) { const i = Number(e.target.dataset.sel); if (e.target.checked) st.sel.add(i); else st.sel.delete(i); drawList(); return; }
    if (e.target.id === "eo-all") { filtered().forEach((x) => (e.target.checked ? st.sel.add(x.id) : st.sel.delete(x.id))); drawList(); }
  });
  box.addEventListener("input", (e) => { if (e.target.dataset.flt === "q") { st.filter.q = e.target.value; clearTimeout(box._q); box._q = setTimeout(() => { drawList(); const i = $("[data-flt=q]"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 300); } });
  box.addEventListener("click", async (e) => {
    const q = (a) => e.target.closest(`[${a}]`);
    if (!e.target.closest("#eo-table, #eo-bulk")) return;
    if (q("data-edit")) { st.editing = Number(q("data-edit").dataset.edit); drawList(); return; }
    if (q("data-estop")) { st.editing = null; drawList(); return; }
    if (q("data-esave")) {
      const eid = Number(q("data-esave").dataset.esave), tr = q("data-esave").closest("tr"), g = (k) => $(`[data-e=${k}]`, tr);
      const s = g("start").value.trim(), start = s === "" ? null : parseHm(s), price = parseMoney(g("price").value);
      if (s !== "" && start == null) { $("#eo-e-err").innerHTML = html`<div class="notice">${t("ent.org.err.time")}</div>`; return; }
      if (price == null) { $("#eo-e-err").innerHTML = html`<div class="notice">${t("ent.org.err.amount")}</div>`; return; }
      const was = st.entries.find((x) => x.id === eid);
      const body = { first_name: g("first_name").value, last_name: g("last_name").value, class_id: g("class_id").value, birth_year: g("birth_year").value || null,
        card: g("card").value, rent: g("rent").checked, state: g("state").value, note: g("note").value, ...(price !== was.price ? { price } : {}),
        ...(start !== was.start_s ? { start } : {}), force: g("force").checked };
      const y = await call("PATCH", `/${id}/rows/${eid}`, body);
      if (!y.ok) { $("#eo-e-err").innerHTML = html`<div class="notice">${errText(y.data.error, { min: "" })}</div>`; return; }
      st.editing = null;
      return reloadList();
    }
    if (q("data-rm")) {
      const x = st.entries.find((y) => y.id === Number(q("data-rm").dataset.rm));
      if (!(await confirmBox(t("ent.org.rm.confirm", { name: `${x.first_name} ${x.last_name}` }), { ok: t("ent.cancel.ok") }))) return;
      await call("DELETE", `/${id}/rows/${x.id}`);
      return reloadList();
    }
    if (q("data-back")) { await call("PATCH", `/${id}/rows/${Number(q("data-back").dataset.back)}`, { state: "entered" }); return reloadList(); }
    if (q("data-paid")) { await call("POST", `/${id}/pay`, { ids: [Number(q("data-paid").dataset.paid)], state: "paid", how: $("#eo-how")?.value || "other" }); return reloadList(); }
    const bulkSay = (m, ok) => { $("#eo-bulk-msg").innerHTML = html`<div class="notice ${ok ? "ok" : ""}" style="margin-top:8px">${m}</div>`; };
    if (e.target.id === "eo-paysel" || e.target.id === "eo-duesel") {
      const y = await call("POST", `/${id}/pay`, { ids: [...st.sel], state: e.target.id === "eo-paysel" ? "paid" : "due", how: $("#eo-how").value });
      st.sel.clear(); await reloadList();
      return bulkSay(y.ok ? tn("ent.org.payDone", y.data.changed, { n: y.data.changed }) : errText(y.data.error), y.ok);
    }
    if (e.target.id === "eo-bank") {
      // the bank's statement file, read in the browser (../bankstatement.js): only the references matched and ticked are sent
      const { openBankDialog } = await import("../bankstatement.js");
      const open = new Map();
      for (const x of st.entries.filter((y) => y.state !== "cancelled" && y.pay_state === "due" && y.price > 0)) {
        const k = x.order_ref;
        if (!open.has(k)) open.set(k, { kind: "entry", ref: k, due: 0, names: new Set(), eventName: ev.name });
        const o = open.get(k);
        o.due += x.price; o.names.add(`${x.first_name} ${x.last_name}`); if (x.by_name) o.names.add(x.by_name);
      }
      const sent = await openBankDialog({ cur: cur(), load: async () => [...open.values()].map((o) => ({ ...o, names: [...o.names] })),
        send: async (picked) => {
          let n = 0;
          for (const p of picked) { const y = await call("POST", `/${id}/pay`, { ref: p.candidate.ref, state: "paid", how: "transfer" }); if (y.ok) n += y.data.changed || 0; }
          return { ok: true, text: t("acc.bank.doneEvent", { n }) };
        } });
      if (sent) await reloadList();
      return;
    }
    if (e.target.id === "eo-payref") {
      const y = await call("POST", `/${id}/pay`, { ref: $("#eo-ref").value, state: "paid", how: $("#eo-how").value });
      await reloadList();
      return bulkSay(y.ok ? tn("ent.org.payDone", y.data.changed, { n: y.data.changed }) : t("ent.org.err.ref"), y.ok && y.data.changed > 0);
    }
  });

  // ---- the import ----
  function drawImport() {
    $("#eo-import").innerHTML = !F() ? html`<div class="empty">${t("ent.org.saveFirst")}</div>` : html`<div class="filters" style="margin:0;padding:0;border:0;background:none;gap:10px;flex-wrap:wrap">
        <label class="btn btn-sm" style="align-self:flex-end">${t("bk.org.i.file")}<input type="file" id="eo-file" accept=".csv,.txt,.xml" hidden></label>
        <label class="field" style="flex:1;min-width:240px"><span>${t("os.sheet")}</span><input type="url" id="eo-sheet" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
        <button type="button" class="btn btn-sm" id="eo-sheet-read" style="align-self:flex-end">${t("os.sheet.read")}</button></div>
      <div id="eo-i-res" style="margin-top:10px"></div>`;
  }
  const iErr = (m) => { $("#eo-i-res").innerHTML = html`<div class="notice">${m}</div>`; };
  /** A file's runners as rows for /rows: France's clubs by their number (named from the federation's list), others by name. */
  async function toRows(set) {
    const ffco = new Map(((await clubList("FR")) || []).map((c) => [c.code, c.name]));
    return set.runners.map((r) => {
      const code = String(r.clubCode || "").trim(), club = String(r.club || "").trim();
      const fr = /^\d{3,4}$/.test(code) ? code.padStart(4, "0") : /^\d{3,4}$/.test(club) ? club.padStart(4, "0") : "";
      return { first_name: r.given || "", last_name: r.family || "", licence: /^\d{1,9}$/.test(String(r.lic || "")) ? String(r.lic) : "", class: r.cls || "",
        card: r.card ? String(r.card) : "", birth_year: r.birth || null, sex: r.sex || "", rent: !!r.rent, paid: !!r.paid, start: r.start ?? null,
        ...(fr ? { club_country: "FR", club_code: fr, club_name: ffco.get(fr) || club } : club ? { club_country: r.nat && /^[A-Z]{2}$/.test(r.nat) ? r.nat : ev.country || "FR", club_name: club } : {}) };
    });
  }
  async function took(set) {
    if (!set?.runners?.length) return iErr(t("ent.org.i.none"));
    const rows = await toRows(set);
    st.imported = rows;
    const known = new Map(F().classes.map((k) => [normalise(k.name), k]));
    const names = [...new Set(rows.map((r) => r.class))];
    const missing = names.filter((n) => !known.has(normalise(n)));
    $("#eo-i-res").innerHTML = html`<div class="notice info"><div>${t("ent.org.i.read", { n: fmt(rows.length), c: names.length })}
      ${missing.length ? html`<div>${t("ent.org.i.missing", { list: missing.map((m) => m || "—").join(", ") })}</div>` : ""}</div></div>
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap">${missing.length ? html`<button type="button" class="btn btn-sm" id="eo-i-cls">${tn("ent.org.i.addClasses", missing.length, { n: missing.length })}</button>` : ""}
        <button type="button" class="btn btn-sm btn-primary" id="eo-i-go">${t("ent.org.i.go", { n: fmt(rows.filter((r) => known.has(normalise(r.class))).length) })}</button></div>`;
  }
  async function readFile(f) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let set = null;
    try { set = /\.xml$/i.test(f.name) ? readIof(bytes)?.set : readCsv(bytes)?.set; } catch (e) { set = null; }
    took(set);
  }
  box.addEventListener("change", (e) => { if (e.target.id === "eo-file" && e.target.files[0]) readFile(e.target.files[0]); });
  box.addEventListener("click", async (e) => {
    if (e.target.id === "eo-sheet-read") {
      const url = $("#eo-sheet").value.trim();
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(url)) return iErr(t("os.sheet.bad"));
      e.target.disabled = true;
      const r = await fetch(`api/sheet?url=${encodeURIComponent(url)}`, { credentials: "same-origin", cache: "no-store" }).catch(() => null);
      e.target.disabled = false;
      if (!r?.ok) { const j = r ? await r.json().catch(() => ({})) : {}; return iErr(j.error === "not shared" ? t("os.sheet.private") : t("os.sheet.fail")); }
      let set = null;
      try { set = readCsv(new Uint8Array(await r.arrayBuffer()))?.set; } catch (x) { set = null; }
      return took(set);
    }
    if (e.target.id === "eo-i-cls") {
      cfg = startCfg();
      const have = new Set(cfg.classes.map((k) => normalise(k.name)));
      for (const n of new Set(st.imported.map((r) => r.class))) if (n && !have.has(normalise(n))) { have.add(normalise(n)); cfg.classes.push({ id: uid(), name: n, course: "" }); }
      const y = await call("PUT", `/${id}/form`, cfg);
      if (!y.ok) return iErr(errText(y.data.error));
      st.form = y.data.form; cfg = null; drawSettings();
      return tookRows(st.imported);
    }
    if (e.target.id === "eo-i-go") {
      e.target.disabled = true;
      const known = new Set(F().classes.map((k) => normalise(k.name)));
      const rows = st.imported.filter((r) => known.has(normalise(r.class)));
      let ok = 0, merged = 0, bad = 0;
      for (let i = 0; i < rows.length; i += 400) {
        const y = await call("POST", `/${id}/rows`, { origin: "file", rows: rows.slice(i, i + 400) });
        for (const x of y.data.results || []) { if (x.ok && x.merged) merged++; else if (x.ok) ok++; else bad++; }
        if (!y.ok) { bad += rows.slice(i, i + 400).length; }
      }
      $("#eo-i-res").innerHTML = html`<div class="notice ${ok + merged ? "ok" : ""}">${t("ent.org.i.done", { ok: fmt(ok), merged: fmt(merged), bad: fmt(bad + st.imported.length - rows.length) })}</div>`;
      st.imported = null;
      await reloadList();
    }
  });
  // (after classes were added: the same rows, now all known)
  function tookRows(rows) { st.imported = rows; const k = new Set(F().classes.map((x) => normalise(x.name)));
    $("#eo-i-res").innerHTML = html`<div class="notice info"><div>${t("ent.org.i.read", { n: fmt(rows.length), c: new Set(rows.map((r) => r.class)).size })}</div></div>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-sm btn-primary" id="eo-i-go">${t("ent.org.i.go", { n: fmt(rows.filter((r) => k.has(normalise(r.class))).length) })}</button></div>`; }

  // ---- by hand ----
  function drawHand() {
    if (!F()) { $("#eo-hand").innerHTML = html`<div class="empty">${t("ent.org.saveFirst")}</div>`; return; }
    $("#eo-hand").innerHTML = html`${raw(runnerForm("eo-new", {}, { card: true }))}
      <div class="bk-form-row"><label class="field"><span>${t("ent.col.class")}</span><select id="eo-new-cls">${F().classes.map((k) => html`<option value="${k.id}">${k.name}</option>`)}</select></label>
        <label class="field"><span>${t("ent.f.birth")}</span><input id="eo-new-birth" type="number" min="${year - 110}" max="${year}"></label>
        <label class="field"><span>${t("ent.f.sex")}</span><select id="eo-new-sex"><option value="">—</option><option value="F">${t("ent.sex.F")}</option><option value="M">${t("ent.sex.M")}</option></select></label>
        <label class="field"><span>${t("bk.col.start")}</span><input id="eo-new-start" placeholder="10:32"></label></div>
      <label class="check"><input type="checkbox" id="eo-new-rent"> ${t("ent.f.rent")}</label> <label class="check"><input type="checkbox" id="eo-new-paid"> ${t("ent.org.alreadyPaid")}</label>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-sm btn-primary" id="eo-new-save">${t("bk.org.add")}</button></div><div id="eo-new-msg"></div>`;
    const form = bindRunnerForm($("#eo-new"), { known: st.entries.map((x) => ({ cc: x.club_country, name: x.club_name })) });
    $("#eo-new-save").onclick = async () => {
      const f = form.read();
      if (!f) return;
      const s = $("#eo-new-start").value.trim(), start = s ? parseHm(s) : null;
      if (s && start == null) { $("#eo-new-msg").innerHTML = html`<div class="notice">${t("ent.org.err.time")}</div>`; return; }
      const y = await call("POST", `/${id}/rows`, { origin: "hand", force: true, rows: [{ ...f, class_id: $("#eo-new-cls").value, birth_year: Number($("#eo-new-birth").value) || null,
        sex: $("#eo-new-sex").value, start, rent: $("#eo-new-rent").checked, paid: $("#eo-new-paid").checked }] });
      const r0 = y.data.results?.[0];
      if (!y.ok || !r0?.ok) { $("#eo-new-msg").innerHTML = html`<div class="notice">${errText(r0?.error || y.data.error)}</div>`; return; }
      drawHand();
      $("#eo-new-msg").innerHTML = html`<div class="notice ok">${t(r0.merged ? "ent.org.hand.merged" : "ent.org.hand.done", { name: `${f.first_name} ${f.last_name}` })}</div>`;
      await reloadList();
    };
  }

  // =========================================================================================================================
  // 2. Horaires
  // =========================================================================================================================
  async function stepStarts() {
    if (!F()) { box.innerHTML = html`<div class="card"><div class="empty">${t("ent.org.saveFirst")} <a href="${href("inscriptions")}">${t("ent.org.step.inscriptions")}</a></div></div>`; return; }
    const mode = F().starts.mode;
    const L = live(), n = L.filter((e) => e.start_s != null).length;
    box.innerHTML = html`
      <section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("ent.org.starts")}</h2><div class="hint">${t("ent.org.starts.count", { n: fmt(n), all: fmt(L.length) })}</div></div></div>
        <div class="card-body"><div class="bo-status" role="radiogroup">${["none", "booking", "draw", "deposit"].map((m) => html`<label class="check">
          <input type="radio" name="eo-mode" value="${m}" ${mode === m ? "checked" : ""}> <b>${t(`ent.org.mode.${m}`)}</b> <span class="muted">${t(`ent.org.mode.${m}.hint`)}</span></label>`)}</div>
          <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-sm btn-primary" id="eo-mode-save">${t("ent.org.mode.save")}</button>
            ${n ? html`<button type="button" class="btn btn-sm" id="eo-clear">${t("ent.org.clear")}</button>` : ""}</div><div id="eo-mode-msg"></div></div></section>
      <div id="eo-mode-body"></div>`;
    $("#eo-mode-save").onclick = async () => {
      cfg = startCfg(); cfg.starts.mode = $("input[name=eo-mode]:checked")?.value || "none";
      if (cfg.starts.mode === "booking" && !cfg.starts.circuits.length) cfg.starts.circuits = gridCircuits();
      const y = await call("PUT", `/${id}/form`, cfg); cfg = null;
      if (!y.ok) { $("#eo-mode-msg").innerHTML = html`<div class="notice">${errText(y.data.error, { name: y.data.name || "" })}</div>`; return; }
      st.form = y.data.form; stepStarts();
    };
    $("#eo-clear")?.addEventListener("click", async () => {
      if (!(await confirmBox(t("ent.org.clear.confirm", { n }), { ok: t("ent.org.clear") }))) return;
      await call("POST", `/${id}/starts`, { clear: true });
      await reloadQuiet(); stepStarts();
    });
    const mb = $("#eo-mode-body");
    if (mode === "booking") drawBookingGrid(mb);
    else if (mode === "draw") drawDraw(mb);
    else if (mode === "deposit") drawDeposit(mb);
    else mb.innerHTML = html`<div class="card"><div class="empty">${t("ent.org.mode.none.more")}</div></div>`;
  }
  async function reloadQuiet() { const l = await call("GET", `/${id}/list`); if (l.ok) st.entries = l.data.entries; const f = await call("GET", `/${id}/form`); if (f.ok) st.form = f.data.form; drawState(); }
  /** The courses of the classes, each a circuit of the grid (one start every 2 minutes, from 10:00 to 12:00 by default). */
  function gridCircuits() {
    const have = F().starts.circuits || [];
    const keys = [...new Set(F().classes.map(courseKey))];
    return keys.map((k) => have.find((c) => c.id === k) || { id: k, name: k, first: 10 * 3600, last: 12 * 3600, step: packFor(ev.country).step?.[/sprint/i.test(ev.terrain || "") ? "sprint" : "forest"] || 120 });
  }

  // ---- booking: the grid's settings and the starts taken ----
  function drawBookingGrid(mb) {
    const S = F().starts, circuits = gridCircuits();
    mb.innerHTML = html`<section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("ent.org.grid")}</h2><div class="hint">${t("ent.org.grid.hint")}</div></div></div>
      <div class="card-body"><div class="filters bo-fields">
        <label class="field"><span>${t("bk.org.gap")}</span><input id="eo-gap" value="${fmtStep(S.gap || 0)}" style="width:80px" inputmode="decimal"></label>
        <label class="field"><span>${t("bk.org.max")}</span><input id="eo-max" type="number" min="1" max="40" value="${S.max || 10}" style="width:80px"></label></div>
        <div class="table-wrap"><table class="data compact eo-grid"><thead><tr><th>${t("bk.org.c.name")}</th><th>${t("bk.org.c.first")}</th><th>${t("bk.org.c.last")}</th>
          <th>${t("bk.org.c.step")}</th><th class="r">${t("bk.org.c.slots")}</th><th class="r">${t("bk.org.c.booked")}</th></tr></thead>
          <tbody>${circuits.map((c) => html`<tr data-c="${c.id}"><td>${c.name}</td><td><input data-f="first" value="${hm(c.first)}" style="width:70px"></td>
            <td><input data-f="last" value="${hm(c.last)}" style="width:70px"></td><td><input data-f="step" value="${fmtStep(c.step)}" style="width:60px"></td>
            <td class="r num">${fmt(slotsOf(c).length)}</td><td class="r num">${fmt(live().filter((e) => e.course === c.id && e.start_s != null).length)}</td></tr>`)}</tbody></table></div>
        <p class="muted bk-small">${t("bk.org.c.hint")}</p>
        <label class="field" style="margin:4px 0 10px"><span>${t("bk.org.note")}</span><input id="eo-gnote" value="${S.note || ""}" maxlength="600"></label>
        <button type="button" class="btn btn-sm btn-primary" id="eo-g-save">${t("ent.org.save")}</button><div id="eo-g-msg"></div></div></section>
      <section class="card"><div class="card-head"><div><h2>${t("bk.grid")}</h2></div>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>${t("col.circuit")}</span><select id="eo-gc">${(S.circuits || []).map((c) => html`<option value="${c.id}" ${c.id === st.circuit ? "selected" : ""}>${c.name}</option>`)}</select></label></div>
        <div class="table-wrap" id="eo-gt"></div></section>`;
    $("#eo-g-save").onclick = async () => {
      const gap = parseStep($("#eo-gap").value), max = Number($("#eo-max").value);
      const msg = (m) => { $("#eo-g-msg").innerHTML = html`<div class="notice">${m}</div>`; };
      if (gap == null || gap > 3600) return msg(t("bk.org.err.gap"));
      const cs = [];
      for (const tr of $$(".eo-grid tbody tr")) {
        const c = circuits.find((x) => x.id === tr.dataset.c), g = (f) => $(`[data-f=${f}]`, tr).value;
        const first = parseHm(g("first")), last = parseHm(g("last")), step = parseStep(g("step"));
        if (first == null || last == null || !step || step < 10 || last < first) return msg(t("bk.org.err.circuit", { name: c.name }));
        if ((last - first) / step + 1 > 400) return msg(t("bk.org.err.many", { name: c.name }));
        cs.push({ id: c.id, name: c.name, first, last, step });
      }
      cfg = startCfg(); cfg.starts = { ...cfg.starts, circuits: cs, gap, max: Math.min(40, Math.max(1, max || 10)), note: $("#eo-gnote").value.trim() };
      const y = await call("PUT", `/${id}/form`, cfg); cfg = null;
      if (!y.ok) return msg(errText(y.data.error, { name: y.data.name || "" }));
      st.form = y.data.form; drawBookingGrid(mb);
      $("#eo-g-msg").innerHTML = html`<div class="notice ok">${t("ent.org.saved")}</div>`;
    };
    const drawT = () => {
      const S2 = F().starts, c = (S2.circuits || []).find((x) => x.id === st.circuit) || S2.circuits?.[0];
      if (!c) { $("#eo-gt").innerHTML = html`<div class="empty">${t("ent.org.grid.saveFirst")}</div>`; return; }
      st.circuit = c.id;
      const grid = live().filter((e) => e.start_s != null).map((e) => ({ c: e.course, s: e.start_s, ck: e.club_key, id: e.id, e }));
      const tk = takenMap(grid);
      $("#eo-gt").innerHTML = html`<table class="data compact" data-freeze="1"><thead><tr><th class="r">${t("bk.col.start")}</th><th>${t("bk.col.runner")}</th><th>${t("rk.col.club")}</th><th>${t("ent.col.class")}</th><th></th></tr></thead>
        <tbody>${raw(slotsOf(c).map((s) => {
          const b = tk.get(`${c.id}|${s}`), blocked = (S2.blocked?.[c.id] || []).includes(s);
          if (!b) return html`<tr class="${blocked ? "bk-blocked" : "bk-free"}"><td class="r num">${hm(s)}</td><td class="muted" colspan="3">${t(blocked ? "bk.blocked" : "bk.free")}</td>
            <td class="r"><button type="button" class="btn btn-sm" data-block="${s}">${t(blocked ? "bk.org.unblock" : "bk.org.block")}</button></td></tr>`;
          const clash = clashes(grid, b.ck, s, S2.gap, b.id);
          return html`<tr><td class="r num">${hm(s)}</td><td>${b.e.first_name} ${b.e.last_name}${clash ? html` <span class="tag tag-warn">${t("bk.clash")}</span>` : ""}${b.e.state === "pending" ? html` <span class="tag tag-warn">${t("ent.st.pending")}</span>` : ""}</td>
            <td class="muted">${b.e.club_country ? clubLabel(b.e, ev.country) : ""}</td><td>${b.e.class}</td><td></td></tr>`;
        }).join(""))}</tbody></table>`;
    };
    $("#eo-gc").onchange = (e) => { st.circuit = e.target.value; drawT(); };
    $("#eo-gt").onclick = async (e) => {
      const b = e.target.closest("[data-block]");
      if (!b) return;
      const s = Number(b.dataset.block), list = new Set(F().starts.blocked?.[st.circuit] || []);
      if (list.has(s)) list.delete(s); else list.add(s);
      cfg = startCfg(); cfg.starts.blocked = { ...(cfg.starts.blocked || {}), [st.circuit]: [...list] };
      const y = await call("PUT", `/${id}/form`, cfg); cfg = null;
      if (y.ok) { st.form = y.data.form; drawT(); }
    };
    drawT();
  }

  // ---- the draw ----
  function asStartList(list) {
    const by = new Map();
    for (const e of list) (by.get(e.course) || by.set(e.course, []).get(e.course)).push(e);
    return { by: "circuit", nostart: [], classes: [...by].map(([c, rs]) => ({ name: c, runners: rs.map((e) => ({ name: `${e.first_name} ${e.last_name}`, club: e.club_name || e.club_code,
      club_code: e.club_key || null, clubName: e.club_name, category: e.category || e.class, start_s: e.start_s, card: e.card || null, bib: null, _e: e })) })) };
  }
  function drawDraw(mb) {
    const pack = packFor(ev.country);
    const step0 = pack.step?.[/sprint/i.test(ev.terrain || "") ? "sprint" : "forest"] || 120;
    mb.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("ent.org.draw")}</h2><div class="hint">${t("ent.org.draw.hint")}</div></div></div>
      <div class="card-body"><div class="filters bo-fields">
        <label class="field"><span>${t("bk.org.c.first")}</span><input id="eo-d-first" value="10:00" style="width:70px"></label>
        <label class="field"><span>${t("bk.org.c.step")}</span><input id="eo-d-step" value="${fmtStep(step0)}" style="width:60px"></label>
        <label class="field"><span>${t("ent.org.draw.by")}</span><select id="eo-d-by"><option value="course" ${pack.drawBy === "course" ? "selected" : ""}>${t("ent.org.draw.byCourse")}</option>
          <option value="class" ${pack.drawBy !== "course" ? "selected" : ""}>${t("ent.org.draw.byClass")}</option></select></label>
        <label class="field"><span>${t("ent.org.draw.gap")}</span><input id="eo-d-gap" type="number" min="0" max="5" value="${pack.clubGap ?? 1}" style="width:60px"></label>
        <label class="field"><span>${t("ent.org.draw.vacant")}</span><input id="eo-d-vac" type="number" min="0" max="20" value="0" style="width:60px"></label>
        <label class="check" style="align-self:flex-end"><input type="checkbox" id="eo-d-keep"> ${t("ent.org.draw.keep")}</label></div>
        <div class="row" style="gap:8px"><button type="button" class="btn btn-sm btn-primary" id="eo-d-go">${t("ent.org.draw.go")}</button>
          <button type="button" class="btn btn-sm" id="eo-d-save" ${st.drawn ? "" : "disabled"}>${t("ent.org.draw.save")}</button></div>
        <div id="eo-d-res" style="margin-top:12px"></div></div></section>`;
    $("#eo-d-go").onclick = () => {
      const first = parseHm($("#eo-d-first").value), step = parseStep($("#eo-d-step").value);
      if (first == null || !step) return ($("#eo-d-res").innerHTML = html`<div class="notice">${t("ent.org.err.time")}</div>`);
      const keepOld = $("#eo-d-keep").checked;
      const state = { event: { zero: first }, classes: {}, runners: {}, teams: {}, courses: {} };
      for (const k of F().classes) { state.classes[k.id] = { id: k.id, name: k.name, course: courseKey(k) }; state.courses[courseKey(k)] = { name: courseKey(k) }; }
      for (const e of live()) state.runners[e.id] = { id: String(e.id), cls: e.class_id, club: e.club_key || null, status: e.state === "dns" ? "dns" : "", start: keepOld ? e.start_s : null };
      const res = chronoDraw(state, { first, step, by: $("#eo-d-by").value, gap: Number($("#eo-d-gap").value) || 0, vacant: Number($("#eo-d-vac").value) || 0, keep: keepOld, seed: Date.now() % 2147483647 });
      st.drawn = res.rows.map(([, rid, p]) => [Number(rid), p.start, state.classes[state.runners[rid].cls]?.course || null]);
      const after = live().map((e) => { const d = st.drawn.find((x) => x[0] === e.id); return d ? { ...e, start_s: d[1] } : e; });
      const C = drawChecks(asStartList(after.filter((e) => e.start_s != null)));
      $("#eo-d-res").innerHTML = html`<div class="notice ${C.warn.length ? "" : "info"}"><div>${t("ent.org.draw.done", { n: fmt(st.drawn.length), last: hm(res.last) })}
        ${C.warn.length ? html`<ul>${C.warn.map((w) => html`<li>${t(`os.w.${w.code}`, { n: fmt(w.items.length) })}</li>`)}</ul>` : html` · ${t("os.w.none")}`}</div></div>
        <div class="table-wrap" style="max-height:340px"><table class="data compact"><thead><tr><th>${t("bk.org.c.name")}</th><th class="r">${t("bk.org.c.first")}</th><th class="r">${t("bk.org.c.last")}</th><th class="r">${t("ent.org.c.n")}</th></tr></thead>
          <tbody>${res.blocks.map((b) => html`<tr><td>${b.name}</td><td class="r num">${hm(b.first)}</td><td class="r num">${hm(b.last)}</td><td class="r num">${fmt(b.n)}</td></tr>`)}</tbody></table></div>`;
      $("#eo-d-save").disabled = !st.drawn.length;
    };
    $("#eo-d-save").onclick = async () => {
      if (!st.drawn?.length) return;
      $("#eo-d-save").disabled = true;
      const y = await call("POST", `/${id}/starts`, { draw: st.drawn, by: "drawn" });
      st.drawn = null;
      await reloadQuiet();
      $("#eo-d-res").innerHTML = html`<div class="notice ${y.ok ? "ok" : ""}">${y.ok ? t("ent.org.draw.saved", { n: fmt(y.data.set), bad: fmt(y.data.errors?.length || 0) }) : errText(y.data.error)}</div>`;
    };
  }

  // ---- a start-list file matched to the entries ----
  function drawDeposit(mb) {
    mb.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("ent.org.dep")}</h2><div class="hint">${t("ent.org.dep.hint")}</div></div></div>
      <div class="card-body"><label class="btn btn-sm">${t("bk.org.i.file")}<input type="file" id="eo-dep-file" accept=".xml,.csv,.txt,.html,.htm,.pdf" hidden></label>
        <div id="eo-dep-res" style="margin-top:10px"></div></div></section>`;
    $("#eo-dep-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      let d = null;
      try { d = await readStarts(new Uint8Array(await f.arrayBuffer()), f.name); } catch (x) { d = null; }
      if (!d) { $("#eo-dep-res").innerHTML = html`<div class="notice">${t("os.err.read")}</div>`; return; }
      // matched by the name (words in any order), the club deciding between two of a name
      const key = (s) => normalise(s).split(" ").filter(Boolean).sort().join(" ");
      const byName = new Map();
      for (const x of live()) { const k = key(`${x.first_name} ${x.last_name}`); (byName.get(k) || byName.set(k, []).get(k)).push(x); }
      const draw = [], miss = [];
      for (const k of d.classes) for (const r of k.runners) {
        if (r.start_s == null) continue;
        const c = byName.get(key(r.name)) || [];
        const one = c.length === 1 ? c[0] : c.find((x) => normalise(x.club_name) === normalise(r.club) || x.club_code === r.club);
        if (one) draw.push([one.id, Math.round(r.start_s), null]); else miss.push(r.name);
      }
      $("#eo-dep-res").innerHTML = html`<div class="notice info"><div>${t("ent.org.dep.read", { n: fmt(draw.length), miss: fmt(miss.length) })}
        ${miss.length ? html`<details><summary>${t("ent.org.dep.miss")}</summary><p class="muted en-small">${miss.slice(0, 200).join(", ")}</p></details>` : ""}</div></div>
        ${draw.length ? html`<button type="button" class="btn btn-sm btn-primary" id="eo-dep-go">${t("ent.org.dep.go", { n: fmt(draw.length) })}</button>` : ""}`;
      $("#eo-dep-go")?.addEventListener("click", async () => {
        const y = await call("POST", `/${id}/starts`, { draw, by: "deposited" });
        await reloadQuiet();
        $("#eo-dep-res").innerHTML = html`<div class="notice ${y.ok ? "ok" : ""}">${y.ok ? t("ent.org.draw.saved", { n: fmt(y.data.set), bad: fmt(y.data.errors?.length || 0) }) : errText(y.data.error)}</div>`;
      });
    };
  }

  // =========================================================================================================================
  // 3. Liste de départ
  // =========================================================================================================================
  async function stepPublish() {
    const f = F(), L = live().filter((e) => e.state === "entered"), withStart = L.filter((e) => e.start_s != null);
    const C = withStart.length ? drawChecks(asStartList(withStart)) : { warn: [], info: [] };
    box.innerHTML = html`
      ${f ? html`<section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${t("ent.org.pub")}</h2>
          <div class="hint">${f.published ? t("bk.org.pub.last", { date: fmtDate(f.published.slice(0, 10)), time: f.published.slice(11, 16) }) : t("bk.org.pub.never")}
            ${f.published && f.changed && f.changed > f.published ? html` · <span class="tag tag-warn">${t("ent.org.pub.changed")}</span>` : ""}</div></div></div>
        <div class="card-body"><p class="muted" style="margin-top:0">${t("ent.org.pub.how", { n: fmt(withStart.length), all: fmt(L.length) })}</p>
          ${C.warn.length ? html`<div class="notice"><div>${t("os.w.title")}<ul>${C.warn.map((w) => html`<li>${t(`os.w.${w.code}`, { n: fmt(w.items.length) })}</li>`)}</ul></div></div>` : ""}
          <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn btn-primary" id="eo-pub" ${withStart.length && ev.race && !past ? "" : "disabled"}>${t("bk.org.pub.now")}</button>
            <button type="button" class="btn btn-sm" id="eo-oc" ${withStart.length ? "" : "disabled"}>${t("os.oc.dl")}</button>
            <button type="button" class="btn btn-sm" data-dl2="iofxml" ${withStart.length ? "" : "disabled"}>${t("bk.org.dl.xml")}</button>
            <button type="button" class="btn btn-sm" data-dl2="csv">${t("ent.org.dl.csv")}</button></div>
          ${!ev.race ? html`<p class="muted bk-small">${t("ent.org.pub.noRace")}</p>` : ""}
          <div id="eo-pub-msg" style="margin-top:10px"></div></div></section>` : ""}
      ${race?.key ? html`<section class="card en-deposit"><details ${f ? "" : "open"}><summary class="card-head en-sum"><div><h2>${t("ent.org.oldDeposit")}</h2>
        <div class="hint">${t("ent.org.oldDeposit.hint")}</div></div></summary><div class="card-body" id="eo-old"></div></details></section>` : ""}`;
    $("#eo-pub")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      const y = await call("POST", `/${id}/publish`);
      e.target.disabled = false;
      $("#eo-pub-msg").innerHTML = html`<div class="notice ${y.ok ? "ok" : ""}">${y.ok ? t(y.data.soon ? "os.done.soon" : "os.done.later") : errText(y.data.error)}</div>`;
      if (y.ok) { await reloadQuiet(); }
    });
    $("#eo-oc")?.addEventListener("click", () => saveOChecklist(ev.name, oChecklist(asStartList(withStart), { cls: "list", club: (r) => r.clubName || r.club || "" })));
    box.addEventListener("click", (e) => { const d = e.target.closest("[data-dl2]"); if (d) download(`/${id}/export?f=${d.dataset.dl2}${d.dataset.dl2 === "iofxml" ? "&starts=1" : ""}`, "startlist.xml"); });
    if (race?.key && $("#eo-old")) (await import("./orgstarts.js")).deposit($("#eo-old"), race, { base });
  }

  // (the step drawn once every function and state above is defined)
  if (step === "inscriptions") await stepEntries();
  else if (step === "horaires") await stepStarts();
  else await stepPublish();
}
