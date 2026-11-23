// « S'inscrire » (Arena, #/inscription?ev=<event>; owner, 2026-11-22, docs/clubs/design.md §3): an event's entry form, opened by
// its organisers (Orga › « Inscriptions et départs »). Signed in, an account enters itself, « Mes coureurs » (adults it enters,
// no proof asked) and its child accounts (a child added here is an account of its own, managed by its parents); not signed in,
// the registration is blended with the entry (the account is made as the registration page makes it, the entries wait for the
// e-mail's confirmation). Each runner: a class proposed from their category, the card or a rented one, the options, a start on
// the grid when the organisers open start times to booking, the amount; then the reference and how to pay (a transfer to the
// organising club, or at the desk) — every payment is made outside Ozimut. The list of entrants is public (its tab).
// « Mes inscriptions » (#/mes-inscriptions): to come and past, the amounts, what is paid, changes until the closing.
// The start-time booking's address of before (#/horaire?course=<race key>) leads to the event holding the race.

import { inApp } from "../appbridge.js";
import { html, raw, $, $$, fmt, fmtDate, fmtCat, normalise } from "../util.js";
import { t, tn, loadArea, lang, locale } from "../i18n.js";
import * as auth from "../auth.js";
import * as country from "../country.js";
import { confirmBox } from "../askbox.js";
import { loadTurnstile } from "../turnstile.js";
import { call, hm, slotsOf, clubKey, clubLabel, runnerForm, bindRunnerForm, takenMap, clashes, partsText } from "../bookingcore.js";
import { priceOf, capFamily, fmtMoney } from "../entryprice.js";
import { packFor } from "../chrono/rules/index.js";

await loadArea("entries");

const money = (c, cur) => fmtMoney(c, cur, locale());
const whenText = (w) => { if (!w) return ""; const [d, h] = w.split("T"); return t("ent.at", { date: fmtDate(d, "long"), time: h }); };
const errText = (code, X = {}) => {
  const k = `ent.err.${String(code || "").replace(/\s+/g, "_")}`;
  return t(k, X) !== k ? t(k, X) : t("ent.err.other");
};

export async function render(main, r) {
  const q = r.query || {};
  if (r.route === "myEntries") return minePage(main);
  if (!q.ev && q.course) {                       // the booking's address of before: the event holding the race
    const x = await call("GET", "/open");
    const f = (x.data.forms || []).find((y) => y.key === q.course);
    if (f) { location.replace(`#/inscription?ev=${encodeURIComponent(f.event)}`); return { title: t("ent.title") }; }
    main.innerHTML = html`<div class="card"><div class="empty">${t("ent.err.none")}</div></div>`;
    return { title: t("ent.title") };
  }
  if (!q.ev) return minePage(main);
  return formPage(main, q.ev, q);
}

// ---- the category, the class proposed ----------------------------------------------------------------------------------
function catOf(cc, birth, sex, year) {
  if (!birth || !sex) return "";
  try { return packFor(cc).catOf(birth, sex, year) || ""; } catch (e) { return ""; }
}
/** The class a runner of this category, age and sex fits best: one naming the category, else one whose name is it, else one
 *  whose bounds fit, else none. */
export function proposeClass(classes, cat, age, sex) {
  const f = (s) => normalise(String(s || "")).replace(/\s+/g, "");
  if (cat) {
    const a = classes.find((c) => (c.cats || []).some((x) => f(x) === f(cat)));
    if (a) return a;
    const b = classes.find((c) => f(c.name) === f(cat));
    if (b) return b;
  }
  return classes.find((c) => (c.sex || c.minAge != null || c.maxAge != null) && (!c.sex || c.sex === sex)
    && (c.minAge == null || (age != null && age >= c.minAge)) && (c.maxAge == null || (age != null && age <= c.maxAge))) || null;
}
const fits = (c, cat, age, sex) => (!c.cats?.length || !cat || c.cats.some((x) => normalise(x) === normalise(cat)))
  && (!c.sex || !sex || c.sex === sex) && (c.minAge == null || age == null || age >= c.minAge) && (c.maxAge == null || age == null || age <= c.maxAge);

// ---- one event's form ----------------------------------------------------------------------------------------------------
async function formPage(main, id, q) {
  const me = auth.session();
  main.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  const r = await call("GET", `/${encodeURIComponent(id)}`);
  if (!r.ok) {
    main.innerHTML = html`<div class="card"><div class="empty">${r.status === 503 ? t("ent.err.not_ready") : r.status === 404 ? t("ent.err.none") : t("ent.err.load")}
      ${r.data.team ? html`<p><a class="btn btn-sm btn-primary" href="#/orga?ev=${encodeURIComponent(id)}&onglet=departs">${t("ent.org.manage")}</a></p>` : ""}</div></div>`;
    return { title: t("ent.title") };
  }
  const st = { D: r.data, runners: [], children: [], last: {}, me: null, sel: new Map(), active: null, adding: null, msg: "",
    tab: q.onglet === "inscrits" ? "list" : "form", circuit: null, free: false };
  const ev = st.D.event, F = st.D.form, cur = F.prices.currency || "EUR", year = Number(String(ev.date).slice(0, 4));
  const booking = F.starts.mode === "booking";

  main.innerHTML = html`
    <div class="page-head"><div><h1>${ev.name}</h1>
      <p class="lede meta"><span>${fmtDate(ev.date)}</span>${ev.place ? html`<span>${ev.place}</span>` : ""}${ev.club ? html`<span>${ev.club}</span>` : ""}</p></div>
      ${st.D.team ? html`<div class="page-actions"><a class="btn btn-sm" href="#/orga?ev=${encodeURIComponent(ev.id)}&onglet=departs">${t("ent.org.manage")}</a></div>` : ""}</div>
    <nav class="page-tabs" role="tablist"><a role="tab" href="#/inscription?ev=${encodeURIComponent(ev.id)}" aria-selected="${st.tab === "form"}">${t("ent.tab.form")}</a>
      <a role="tab" href="#/inscription?ev=${encodeURIComponent(ev.id)}&onglet=inscrits" aria-selected="${st.tab === "list"}">${t("ent.tab.list")}${F.counts ? html` <span class="muted">(${fmt(F.counts.total)})</span>` : ""}</a></nav>
    <div id="en-status"></div>
    <div id="en-body"></div>`;
  if (st.tab === "list") { await publicTab($("#en-body"), ev, F); drawStatus(); return { title: `${t("ent.tab.list")} · ${ev.name}` }; }

  function drawStatus() {
    const s = F.open ? html`<div class="notice info"><div><b>${t(F.late ? "ent.st.late" : "ent.st.open")}</b>${F.closes ? html` · ${whenText(F.late ? F.late_until : F.closes)}` : ""}
        ${F.late && F.prices.late ? html`<div class="muted">${t("ent.st.lateFee", { x: money(F.prices.late, cur) })}</div>` : ""}</div></div>`
      : F.soon ? html`<div class="notice"><div><b>${t("ent.st.soon")}</b> · ${whenText(F.opens)}</div></div>`
        : F.state === "draft" ? html`<div class="notice"><div><b>${t("ent.st.draft")}</b> · ${t("ent.st.draft.hint")}</div></div>`
          : html`<div class="notice"><div><b>${t("ent.st.closed")}</b> · ${t("ent.st.closed.hint")}</div></div>`;
    $("#en-status").innerHTML = html`${s}${F.note ? html`<div class="notice en-note"><div>${F.note}</div></div>` : ""}${st.msg ? raw(st.msg) : ""}`;
  }

  const body = $("#en-body");
  const circuitOf = (cid) => (F.starts.circuits || []).find((c) => c.id === cid);
  const courseOf = (clsId) => { const c = F.classes.find((x) => x.id === clsId); return c ? String(c.course || c.name).trim().slice(0, 60) : ""; };
  const clsName = (clsId) => F.classes.find((x) => x.id === clsId)?.name || clsId;
  const left = (c) => (c.places ? c.places - (F.counts?.byClass?.[c.id] || 0) : null);

  // the runners one may enter: oneself (« Mes coureurs »'s first row), the others kept, the children
  const keyOf = (c) => (c.child ? `c${c.id}` : `r${c.id}`);
  function candidates() {
    return [...st.runners.map((x) => ({ ...x, kind: x.self ? "self" : "runner" })),
      ...st.children.map((x) => ({ ...x, kind: "child", child: true, ...(st.last[`u${x.id}`] || {}), birth_year: x.birth_year }))];
  }
  const lastOf = (c) => (c.child ? st.last[`u${c.id}`] : st.last[`r${c.id}`]) || {};
  const entryOf = (c) => st.D.mine.find((m) => (c.child ? m.user_id === c.id : c.self ? m.user_id === st.me?.id || m.runner_id === c.id : m.runner_id === c.id));
  function defaults(c) {
    const L = lastOf(c);
    const birth = c.birth_year || L.birth_year || (c.self ? st.me?.birth_year : null) || null, sex = L.sex || "";
    const cat = catOf(ev.country, birth, sex, year), age = birth ? year - birth : null;
    const cls = proposeClass(F.classes, cat, age, sex) || F.classes.find((x) => left(x) == null || left(x) > 0) || F.classes[0];
    return { class_id: cls?.id || "", birth_year: birth, sex, card: c.card || L.card || "", rent: false, options: new Set(), start: null, note: "",
      club_country: c.club_country || L.club_country || "", club_code: c.club_code || L.club_code || "", club_name: c.club_name || L.club_name || "" };
  }
  /** The starts a runner may take on a course: free, not kept back, within the club rule (the other picks too). */
  function choices(c, course) {
    const cir = circuitOf(course);
    if (!cir) return [];
    const tk = takenMap(st.D.grid || []), ck = clubKey(pickClub(c)), own = entryOf(c);
    const picked = [...st.sel].filter(([k]) => k !== keyOf(c)).map(([k, x]) => ({ ...x, course: courseOf(x.class_id), ck: clubKey(x) }));
    return slotsOf(cir).filter((s) => (!tk.has(`${course}|${s}`) || (own && own.start === s && own.course === course)) && !(F.starts.blocked?.[course] || []).includes(s)
      && !clashes(st.D.grid || [], ck, s, F.starts.gap, own?.id) && !picked.some((p) => (p.course === course && p.start === s) || (ck && F.starts.gap && p.ck === ck && Math.abs(p.start - s) < F.starts.gap)));
  }
  const pickClub = (c) => { const p = st.sel.get(keyOf(c)); return p && c.child ? p : c; };

  /** Will the runner's club carry this entry (its policy, docs/clubs/design.md §4)? The clubs carrying the event come with the
   *  form (`carriers`); France's carry only their licensees. The server decides when the entry is made. */
  function byClub(c, p) {
    const club = c.child ? { ...c, ...p } : c;
    return (st.D.carriers || []).some((o) => o.cc === club.club_country && (o.cc === "FR" ? !!c.licence && o.code === club.club_code
      : normalise(o.name) === normalise(club.club_name || "")));
  }
  function priceFor(c, p) {
    return priceOf(F.prices, { birth_year: p.birth_year, licence: c.licence, class_id: p.class_id, rent: p.rent, options: [...p.options] }, { year, late: F.late });
  }

  // ---- drawing ----
  function draw() {
    drawStatus();
    const mine = st.D.mine;
    const due = mine.filter((m) => m.payer === "runner" && m.pay_state === "due");
    body.innerHTML = html`
      ${mine.length ? html`<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${t("ent.mine.here")}</h2></div>
        <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("bk.col.runner")}</th><th>${t("ent.col.class")}</th>${booking || mine.some((m) => m.start != null) ? html`<th class="r">${t("bk.col.start")}</th>` : ""}
          <th class="r">${t("ent.col.amount")}</th><th>${t("ent.col.state")}</th><th></th></tr></thead>
        <tbody>${mine.map((m) => html`<tr><td>${m.first_name} ${m.last_name}</td><td>${m.class}</td>${booking || mine.some((x) => x.start != null) ? html`<td class="r num">${hm(m.start)}</td>` : ""}
          <td class="r num" title="${partsText(m.parts, cur)}">${m.payer === "club" ? html`<span class="muted">${t("ent.byClub")}</span>` : money(m.price, cur)}</td>
          <td>${stateTag(m)}</td>
          <td class="r" style="white-space:nowrap">${F.open ? html`<button type="button" class="btn btn-sm" data-cancel="${m.id}">${t("bk.cancel")}</button>` : ""}</td></tr>`)}</tbody></table></div>
        ${due.length ? raw(payBox(due, st.D.bank, F, cur)) : ""}</section>` : ""}
      ${F.open ? html`<div class="${booking ? "bk-layout" : ""}"><section class="card bk-book" id="en-book"></section>
        ${booking ? html`<section class="card bk-grid"><div class="card-head"><div><h2>${t("bk.grid")}</h2><div class="hint" id="bk-grid-hint"></div></div>
          <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><label class="field" style="flex-direction:row;align-items:center;gap:8px">
            <span>${t("col.circuit")}</span><select id="bk-circuit"></select></label>
            <label class="check"><input type="checkbox" id="bk-free"> ${t("bk.freeOnly")}</label></div></div>
          <div class="table-wrap" id="bk-table"></div></section>` : ""}</div>` : ""}
      ${F.refund_rule || F.pay.note ? html`<p class="muted en-small">${F.refund_rule ? html`<b>${t("ent.refund")}</b> ${F.refund_rule}` : ""}${F.pay.note ? html` ${F.pay.note}` : ""}</p>` : ""}`;
    if (F.open) { me ? drawBook() : drawGuest(); if (booking) drawGrid(); }
  }
  const stateTag = (m) => (m.state === "pending" ? html`<span class="tag tag-warn" title="${t("ent.pending.tip")}">${t("ent.st.pending")}</span>`
    : m.pay_state === "paid" ? html`<span class="tag tag-in">${t("ent.pay.paid")}</span>` : m.pay_state === "waived" ? html`<span class="tag">${t("ent.pay.waived")}</span>`
      : m.payer === "club" ? html`<span class="tag">${t("ent.byClub")}</span>` : html`<span class="tag tag-warn">${t("ent.pay.due")}</span>`);

  function drawBook() {
    const box = $("#en-book");
    const list = candidates();
    const known = (st.D.grid || []).map((b) => ({ cc: b.cc, name: b.club }));
    const row = (c) => {
      const k = keyOf(c), own = entryOf(c), p = st.sel.get(k);
      let right = "";
      if (own) right = html`<span class="tag tag-in">${t("ent.entered")} · ${own.class}${own.start != null ? ` · ${hm(own.start)}` : ""}</span>`;
      else if (p) {
        const birth = p.birth_year, age = birth ? year - birth : null, cat = catOf(ev.country, birth, p.sex, year);
        const cls = F.classes.find((x) => x.id === p.class_id);
        const course = courseOf(p.class_id), opts = booking ? choices(c, course) : [];
        if (booking && p.start != null && !opts.includes(p.start)) p.start = null;
        const pr = priceFor(c, p);
        right = html`<div class="en-pick">
          <label class="field"><span>${t("ent.col.class")}</span><select data-f="class_id" data-k="${k}">${F.classes.map((x) => {
            const l = left(x);
            return html`<option value="${x.id}" ${x.id === p.class_id ? "selected" : ""} ${l != null && l <= 0 ? "disabled" : ""}>${x.name}${l != null ? ` (${l <= 0 ? t("ent.full") : tn("ent.left", l, { n: l })})` : ""}</option>`;
          })}</select></label>
          ${!c.child || !c.birth_year ? html`<label class="field en-narrow"><span>${t("ent.f.birth")}</span><input data-f="birth_year" data-k="${k}" type="number" inputmode="numeric" min="${year - 110}" max="${year}" value="${birth || ""}"></label>` : ""}
          <label class="field en-narrow"><span>${t("ent.f.sex")}</span><select data-f="sex" data-k="${k}"><option value="">—</option>
            <option value="F" ${p.sex === "F" ? "selected" : ""}>${t("ent.sex.F")}</option><option value="M" ${p.sex === "M" ? "selected" : ""}>${t("ent.sex.M")}</option></select></label>
          ${F.fields.card !== "no" ? html`<label class="field en-card"><span>${t(F.fields.card === "require" ? "ent.f.cardReq" : "bk.f.card")}</span>
            <input data-f="card" data-k="${k}" value="${p.card || ""}" inputmode="numeric" maxlength="10" ${p.rent ? "disabled" : ""}></label>
            <label class="check"><input type="checkbox" data-f="rent" data-k="${k}" ${p.rent ? "checked" : ""}> ${t("ent.f.rent")}${F.prices.rent ? ` (${money(F.prices.rent, cur)})` : ""}</label>` : ""}
          ${F.prices.options.map((o) => html`<label class="check"><input type="checkbox" data-opt="${o.id}" data-k="${k}" ${p.options.has(o.id) ? "checked" : ""}> ${o.label} (${money(o.amount, cur)})</label>`)}
          ${booking ? html`<label class="field"><span>${t("bk.col.start")}</span><select data-f="start" data-k="${k}"><option value="">${t("ent.f.noStart")}</option>
            ${opts.map((s) => html`<option value="${s}" ${s === p.start ? "selected" : ""}>${hm(s)}</option>`)}</select></label>` : ""}
          ${F.fields.note ? html`<label class="field"><span>${t("ent.f.note")}</span><input data-f="note" data-k="${k}" value="${p.note || ""}" maxlength="300"></label>` : ""}
          <div class="en-line">${cat ? html`<span class="muted">${t("ent.cat", { cat: fmtCat(cat) })}</span>` : ""}
            ${cls && !fits(cls, cat, age, p.sex) ? html`<span class="tag tag-warn">${t("ent.notFit")}</span>` : ""}
            ${byClub(c, p) ? html`<span class="en-price muted">${t("ent.byClub")}</span>` : html`<span class="en-price" title="${partsText(pr.parts, cur)}">${money(pr.cents, cur)}</span>`}</div></div>`;
      }
      return html`<li class="bk-runner ${st.active === k ? "active" : ""}" data-runner="${k}">
        <label class="bk-who">${!own ? html`<input type="checkbox" data-pick="${k}" ${p ? "checked" : ""}>` : ""}
          <span><b>${c.first_name} ${c.last_name}</b>${c.self ? html` <span class="muted">(${t("bk.me")})</span>` : c.child ? html` <span class="tag">${t("ent.child")}</span>` : ""}
          <span class="muted bk-club">${c.child ? (lastOf(c).club_name ? clubLabel(lastOf(c), ev.country) : "") : clubLabel(c, ev.country)}${c.licence ? ` · ${c.licence}` : ""}</span></span></label>
        <div class="bk-side">${!c.self && !c.child && !own ? html`<button type="button" class="icon-btn" data-rdel="${c.id}" title="${t("bk.r.del")}" aria-label="${t("bk.r.del")}">✕</button>` : ""}</div>
        ${p && !own ? html`<div class="bk-rform">${raw(right)}</div>` : own ? html`<div class="bk-side">${raw(right)}</div>` : ""}</li>`;
    };
    const picks = [...st.sel].map(([k, p]) => ({ c: list.find((x) => keyOf(x) === k), p })).filter((x) => x.c);
    const prices = picks.map(({ c, p }) => (byClub(c, p) ? 0 : priceFor(c, p).cents));
    const fixed = st.D.mine.filter((m) => m.payer === "runner").map((m) => ({ cents: m.price, fixed: true }));
    const capped = capFamily(F.prices, [...fixed, ...prices.map((x) => ({ cents: x }))]).slice(fixed.length);
    const total = capped.reduce((s, x) => s + x.cents, 0), cut = capped.reduce((s, x) => s + x.cut, 0);
    box.innerHTML = html`<div class="card-head"><div><h2>${t("ent.who")}</h2><div class="hint">${t("ent.who.hint")}</div></div></div>
      <div class="card-body">
        <ul class="bk-runners">${raw(list.map(row).join(""))}</ul>
        ${st.adding === "person" ? html`<div class="bk-rform">${raw(runnerForm("en-new", {}, { card: F.fields.card !== "no" }))}
          <div class="row" style="gap:8px"><button type="button" class="btn btn-sm btn-primary" id="en-add-save">${t("bk.r.add")}</button>
          <button type="button" class="btn btn-sm" data-stop="1">${t("bk.back")}</button></div></div>`
        : st.adding === "child" ? html`<div class="bk-rform">${raw(runnerForm("en-kid", { last_name: st.me?.last || "" }, { card: false }))}
          <div class="bk-form-row"><label class="field"><span>${t("ent.f.birth")}</span><input id="en-kid-birth" type="number" inputmode="numeric" min="${year - 25}" max="${year}"></label></div>
          <p class="muted en-small">${t("ent.child.hint")}</p>
          <div class="row" style="gap:8px"><button type="button" class="btn btn-sm btn-primary" id="en-kid-save">${t("ent.child.add")}</button>
          <button type="button" class="btn btn-sm" data-stop="1">${t("bk.back")}</button></div></div>`
        : html`<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="en-add">+ ${t("bk.r.new")}</button>
            <button type="button" class="btn btn-sm" id="en-addkid">+ ${t("ent.child.new")}</button></div>
          <p class="muted bk-small">${t("bk.r.hint")}</p>`}
        ${picks.length ? html`<div class="en-total"><span>${t("ent.total")}</span><b>${money(total, cur)}</b>${cut ? html` <span class="muted">${t("ent.capped", { x: money(cut, cur) })}</span>` : ""}</div>
          <p class="muted en-small">${t("ent.total.hint")}</p>` : ""}
        <div class="row bk-go"><button type="button" class="btn btn-primary" id="en-go" ${picks.length ? "" : "disabled"}>${picks.length ? tn("ent.go", picks.length, { n: picks.length }) : t("ent.go.none")}</button></div>
      </div>`;
    if (st.adding === "person") { st.form = bindRunnerForm($("#en-new"), { known }); st.form.focus(); }
    if (st.adding === "child") { st.form = bindRunnerForm($("#en-kid"), { known }); st.form.focus(); }
  }

  // ---- the booking grid ----
  function drawGrid() {
    const sel = $("#bk-circuit"), grid = st.D.grid || [];
    const cs = F.starts.circuits || [];
    if (!cs.some((c) => c.id === st.circuit)) st.circuit = cs[0]?.id;
    sel.innerHTML = cs.map((c) => html`<option value="${c.id}" ${c.id === st.circuit ? "selected" : ""}>${c.name} (${grid.filter((b) => b.c === c.id).length}/${slotsOf(c).length})</option>`).join("");
    const c = circuitOf(st.circuit);
    if (!c) { $("#bk-table").innerHTML = html`<div class="empty">${t("bk.noCircuit")}</div>`; return; }
    const tk = takenMap(grid), act = candidates().find((x) => keyOf(x) === st.active), p = act && st.sel.get(st.active);
    const ack = act ? clubKey(pickClub(act)) : "", fitCourse = p && courseOf(p.class_id) === c.id;
    $("#bk-grid-hint").textContent = act && p ? (fitCourse ? t("bk.grid.for", { name: `${act.first_name} ${act.last_name}` }) : t("ent.grid.otherCourse")) : t("bk.grid.hint");
    const rows = slotsOf(c).map((s) => {
      const b = tk.get(`${c.id}|${s}`);
      if (b) return st.free ? "" : html`<tr class="${b.mine ? "bk-mine" : ""}"><td class="r num">${hm(s)}</td><td>${b.n || html`<span class="muted">${t("ent.st.pending")}</span>`}${b.mine ? html` <span class="tag tag-in">${t("bk.yours")}</span>` : ""}</td>
        <td class="muted">${b.n ? clubLabel({ club_country: b.cc, club_name: b.club, club_code: b.code }, ev.country) : ""}</td><td></td></tr>`;
      if ((F.starts.blocked?.[c.id] || []).includes(s)) return st.free ? "" : html`<tr class="bk-blocked"><td class="r num">${hm(s)}</td><td class="muted" colspan="3">${t("bk.blocked")}</td></tr>`;
      const can = fitCourse && choices(act, c.id).includes(s), clash = fitCourse && clashes(grid, ack, s, F.starts.gap);
      return html`<tr class="bk-free"><td class="r num">${hm(s)}</td><td class="muted">${p?.start === s && fitCourse ? html`<b>${act.first_name}</b>` : t("bk.free")}</td>
        <td>${clash ? html`<span class="tag tag-warn" title="${t("bk.clash.tip", { min: gapWords(F.starts.gap) })}">${t("bk.clash")}</span>` : ""}</td>
        <td class="r">${can ? html`<button type="button" class="btn btn-sm" data-take="${s}">${t("bk.take")}</button>` : ""}</td></tr>`;
    }).join("");
    $("#bk-table").innerHTML = html`<table class="data compact bk-table" data-freeze="1" data-freeze-phone="1"><thead><tr><th class="r">${t("bk.col.start")}</th>
      <th>${t("bk.col.runner")}</th><th>${t("rk.col.club")}</th><th></th></tr></thead><tbody>${raw(rows)}</tbody></table>`;
  }
  function gapWords(s) { return s % 60 ? t("bk.secs", { s }) : tn("bk.mins", s / 60, { n: s / 60 }); }

  // ---- not signed in: the registration blended with the entry ----
  let ts = { token: "", widget: null, key: null, world: true };
  async function drawGuest() {
    const box = $("#en-book");
    try { const s = await (await fetch("api/account/status")).json(); ts.key = s.turnstile || null; ts.world = !!s.world; ts.open = !!s.registration; } catch (e) { ts.open = false; }
    const cls = F.classes;
    // the Ozimut app makes no account (docs/app/design.md): signing in is asked first
    if (inApp()) {
      box.innerHTML = html`<div class="card-head"><div><h2>${t("ent.guest.title")}</h2><div class="hint">${t("ent.guest.app")}</div></div></div>
        <div class="card-body"><a class="btn btn-sm btn-primary" href="#/?s=login" data-after="1">${t("hub.login")}</a></div>`;
      return;
    }
    box.innerHTML = html`<div class="card-head"><div><h2>${t("ent.guest.title")}</h2><div class="hint">${t("ent.guest.hint")}</div></div></div>
      <div class="card-body">
        <p class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-sm btn-primary" href="#/?s=login" data-after="1">${t("hub.login")}</a>
          <span class="muted">${t("ent.guest.or")}</span></p>
        ${!ts.open ? html`<div class="notice">${t("ac.reg.closed")}</div>` : html`<form id="en-guest" class="stack" style="gap:10px" autocomplete="on">
          ${raw(runnerForm("en-gclub", {}, { card: false }))}
          <div class="bk-form-row"><label class="field"><span>${t("ent.f.birth")}</span><input name="birth" type="number" inputmode="numeric" required min="${year - 110}" max="${year}" autocomplete="bday-year"></label>
            <label class="field"><span>${t("ent.f.sex")}</span><select name="sex"><option value="">—</option><option value="F">${t("ent.sex.F")}</option><option value="M">${t("ent.sex.M")}</option></select></label></div>
          <div class="bk-form-row"><label class="field"><span>${t("ent.col.class")}</span><select name="class_id">${cls.map((x) => html`<option value="${x.id}" ${left(x) != null && left(x) <= 0 ? "disabled" : ""}>${x.name}</option>`)}</select></label>
            ${F.fields.card !== "no" ? html`<label class="field"><span>${t(F.fields.card === "require" ? "ent.f.cardReq" : "bk.f.card")}</span><input name="card" inputmode="numeric" maxlength="10"></label>` : ""}</div>
          ${F.fields.card !== "no" ? html`<label class="check"><input type="checkbox" name="rent"> ${t("ent.f.rent")}${F.prices.rent ? ` (${money(F.prices.rent, cur)})` : ""}</label>` : ""}
          ${F.prices.options.map((o) => html`<label class="check"><input type="checkbox" name="opt-${o.id}"> ${o.label} (${money(o.amount, cur)})</label>`)}
          ${booking ? html`<label class="field"><span>${t("bk.col.start")}</span><select name="start"></select></label>` : ""}
          <div class="en-total"><span>${t("ent.total")}</span><b id="en-g-price"></b></div>
          <label class="field"><span>${t("ac.email")}</span><input name="email" type="email" required maxlength="254" autocomplete="email"></label>
          <div class="bk-form-row"><label class="field"><span>${t("ac.password")} <span class="muted">· ${t("ent.guest.pw")}</span></span><input name="password" type="password" required minlength="6" maxlength="200" autocomplete="new-password"></label>
            <label class="field"><span>${t("ac.password2")}</span><input name="password2" type="password" required minlength="6" maxlength="200" autocomplete="new-password"></label></div>
          <div class="hp" aria-hidden="true"><label>Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label></div>
          <label class="check"><input name="consent" type="checkbox" required><span>${t(ts.world ? "ac.reg.consent.world" : "ac.reg.consent")} <a href="#/compte/confidentialite">${t("ac.reg.privacy")}</a></span></label>
          ${ts.key ? html`<div id="en-ts"></div>` : ""}
          <div class="notice" hidden id="en-g-err"></div>
          <button class="btn btn-primary" type="submit">${t("ent.guest.go")}</button></form>`}
      </div>`;
    const form = $("#en-guest");
    if (!form) return;
    const club = bindRunnerForm($("#en-gclub"), {});
    const year0 = year;
    const fill = () => {
      const f = new FormData(form), cid = f.get("class_id");
      const p = { class_id: cid, birth_year: Number(f.get("birth")) || null, rent: f.get("rent") === "on", options: F.prices.options.filter((o) => f.get(`opt-${o.id}`) === "on").map((o) => o.id) };
      const lic = ($("[name=licence]", form)?.value || "").trim();
      $("#en-g-price").textContent = money(priceOf(F.prices, { ...p, licence: lic }, { year: year0, late: F.late }).cents, cur);
      const sel = $("[name=start]", form);
      if (sel) {
        const course = courseOf(cid), cir = circuitOf(course), tk = takenMap(st.D.grid || []), was = sel.value;
        const v = { club_country: $("[name=club_country]", form).value, club_code: "", club_name: $("[name=club]", form).value };
        const ck = clubKey(v);
        const opts = cir ? slotsOf(cir).filter((s) => !tk.has(`${course}|${s}`) && !(F.starts.blocked?.[course] || []).includes(s) && !clashes(st.D.grid || [], ck, s, F.starts.gap)) : [];
        sel.innerHTML = html`<option value="">${t("ent.f.noStart")}</option>${opts.map((s) => html`<option value="${s}" ${String(s) === was ? "selected" : ""}>${hm(s)}</option>`)}`;
      }
    };
    form.addEventListener("input", fill); form.addEventListener("change", fill); fill();
    // the class proposed from the year and sex typed
    form.addEventListener("change", (e) => {
      if (!["birth", "sex"].includes(e.target.name)) return;
      const f = new FormData(form), b = Number(f.get("birth")) || null, s = f.get("sex");
      const c = proposeClass(F.classes, catOf(ev.country, b, s, year), b ? year - b : null, s);
      if (c) { form.elements.class_id.value = c.id; fill(); }
    });
    if (ts.key) {
      loadTurnstile().then((T) => {
        ts.widget = T.render("#en-ts", { sitekey: ts.key, language: lang(), action: "register", callback: (x) => { ts.token = x; }, "expired-callback": () => { ts.token = ""; } });
      }).catch(() => {});
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#en-g-err"), f = new FormData(form), say = (m) => { err.hidden = false; err.textContent = m; };
      err.hidden = true;
      const c = club.read();
      if (!c) return;
      if (f.get("password") !== f.get("password2")) return say(t("ac.reg.err.password2"));
      if (ts.key && !ts.token) return say(t("ac.reg.err.robotWait"));
      const item = { self: true, class_id: f.get("class_id"), card: (f.get("card") || "").trim(), rent: f.get("rent") === "on",
        options: F.prices.options.filter((o) => f.get(`opt-${o.id}`) === "on").map((o) => o.id), sex: f.get("sex"), birth_year: Number(f.get("birth")) || null,
        ...(f.get("start") ? { start: Number(f.get("start")) } : {}) };
      const btn = $("button[type=submit]", form);
      btn.disabled = true;
      const x = await call("POST", `/${encodeURIComponent(ev.id)}/guest`, { first: c.first_name, last: c.last_name, birthYear: Number(f.get("birth")) || null,
        email: f.get("email"), password: f.get("password"), consent: f.get("consent") === "on", website: f.get("website"), lang: lang(), turnstile: ts.token,
        club_country: c.club_country, club_code: c.club_code, club_name: c.club_name, licence: c.licence, card: item.card, entries: [item] });
      btn.disabled = false;
      if (ts.widget !== null) { try { window.turnstile.reset(ts.widget); } catch (x2) { /* gone */ } ts.token = ""; }
      if (!x.ok) return say(x.data.error === "email_taken" ? t("ent.guest.taken") : x.data.error === "email_pending" ? t("ent.guest.pending")
        : t(`ac.reg.err.${x.data.error}`) !== `ac.reg.err.${x.data.error}` ? t(`ac.reg.err.${x.data.error}`) : errText(x.data.error));
      const res = x.data.results?.[0];
      if (!res?.ok) return say(errText(res?.error, { min: gapWords(F.starts.gap), n: F.starts.max }));
      box.innerHTML = html`<div class="card-body"><div class="notice ok"><div>${t("ent.guest.done", { email: f.get("email") })}</div></div>
        <p>${t("ent.guest.done2", { x: money(res.price, cur), ref: res.ref })}</p></div>`;
    });
  }

  // ---- events ----
  body.addEventListener("click", async (e) => {
    const q = (a) => e.target.closest(`[${a}]`);
    if (q("data-after")) { try { sessionStorage.setItem("ocn.after", location.hash); } catch (x) { /* the modules page then */ } return; }
    if (q("data-cancel")) {
      const m = st.D.mine.find((x) => x.id === Number(q("data-cancel").dataset.cancel));
      if (!(await confirmBox(t("ent.cancel.confirm", { name: `${m.first_name} ${m.last_name}` }), { ok: t("ent.cancel.ok") }))) return;
      const x = await call("DELETE", `/${encodeURIComponent(ev.id)}/${m.id}`);
      say(x.ok ? t("ent.cancelled", { name: `${m.first_name} ${m.last_name}` }) : errText(x.data.error), !x.ok);
      return reload();
    }
    if (q("data-take")) {
      const s = Number(q("data-take").dataset.take), p = st.sel.get(st.active);
      if (p) { p.start = s; drawBook(); drawGrid(); $("#en-book").scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    const li = e.target.closest("[data-runner]");
    if (li && !e.target.closest("select,input,button,a") && li.dataset.runner !== st.active) { st.active = li.dataset.runner; drawBook(); if (booking) drawGrid(); }
    if (q("data-stop")) { st.adding = null; drawBook(); return; }
    if (e.target.id === "en-add") { st.adding = "person"; drawBook(); return; }
    if (e.target.id === "en-addkid") { st.adding = "child"; drawBook(); return; }
    if (e.target.id === "en-add-save") {
      const f = st.form.read();
      if (!f) return;
      const x = await call("POST", "/runners", f);
      if (!x.ok) return say(t(x.data.error === "too many" ? "bk.err.runners" : "bk.err.save"), true);
      st.runners.push(x.data.runner); st.adding = null;
      pick({ ...x.data.runner, kind: "runner" });
      drawBook(); if (booking) drawGrid();
      return;
    }
    if (e.target.id === "en-kid-save") {
      const f = st.form.read(), b = Number($("#en-kid-birth").value) || null;
      if (!f) return;
      if (!b) return say(t("ent.err.birth"), true);
      const x = await call("POST", "/children", { ...f, birth_year: b });
      if (!x.ok) return say(errText(x.data.error), true);
      st.children.push(x.data.child);
      st.last[`u${x.data.child.id}`] = { ...x.data.club, birth_year: b };
      st.adding = null;
      pick({ ...x.data.child, kind: "child", child: true });
      drawBook(); if (booking) drawGrid();
      return;
    }
    if (q("data-rdel")) {
      const id = Number(q("data-rdel").dataset.rdel), r0 = st.runners.find((x) => x.id === id);
      if (!(await confirmBox(t("bk.r.del.confirm", { name: `${r0.first_name} ${r0.last_name}` }), { ok: t("bk.r.del") }))) return;
      await call("DELETE", `/runners/${id}`);
      st.runners = st.runners.filter((x) => x.id !== id); st.sel.delete(`r${id}`);
      drawBook(); if (booking) drawGrid();
      return;
    }
    if (e.target.id === "en-go") return go();
  });
  function pick(c) { const k = keyOf(c); st.sel.set(k, defaults(c)); st.active = k; }
  body.addEventListener("change", (e) => {
    const k = e.target.dataset.k;
    if (e.target.closest("[data-pick]")) {
      const key = e.target.dataset.pick, c = candidates().find((x) => keyOf(x) === key);
      if (e.target.checked) pick(c); else st.sel.delete(key);
      st.active = key;
      drawBook(); if (booking) drawGrid();
      return;
    }
    if (e.target.id === "bk-circuit") { st.circuit = e.target.value; drawGrid(); return; }
    if (e.target.id === "bk-free") { st.free = e.target.checked; drawGrid(); return; }
    const p = k && st.sel.get(k);
    if (!p) return;
    const f = e.target.dataset.f, o = e.target.dataset.opt;
    if (o) { if (e.target.checked) p.options.add(o); else p.options.delete(o); }
    else if (f === "rent") p.rent = e.target.checked;
    else if (f === "start") p.start = e.target.value === "" ? null : Number(e.target.value);
    else if (f === "birth_year") p.birth_year = Number(e.target.value) || null;
    else if (f) p[f] = e.target.value;
    if (f === "birth_year" || f === "sex") {
      const c = proposeClass(F.classes, catOf(ev.country, p.birth_year, p.sex, year), p.birth_year ? year - p.birth_year : null, p.sex);
      if (c) p.class_id = c.id;
    }
    if (f === "class_id") { p.start = null; st.circuit = courseOf(p.class_id); }
    st.active = k;
    if (f !== "card" && f !== "note") { drawBook(); if (booking) drawGrid(); }
  });
  function say(text, bad = false, list = []) {
    st.msg = html`<div class="notice ${bad ? "" : "ok"} bk-msg" role="status"><div>${text}${list.length ? html`<ul>${list.map((x) => html`<li>${raw(x)}</li>`)}</ul>` : ""}</div></div>`;
    drawStatus();
    $("#en-status").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function go() {
    const list = candidates();
    const items = [...st.sel].map(([k, p]) => {
      const c = list.find((x) => keyOf(x) === k);
      if (!c) return null;
      const who = c.child ? { child: c.id, club_country: p.club_country, club_code: p.club_code, club_name: p.club_name } : c.self ? { self: true } : { runner: c.id };
      return { ...who, class_id: p.class_id, birth_year: p.birth_year, sex: p.sex, card: p.card, rent: p.rent, options: [...p.options], note: p.note,
        ...(p.start != null ? { start: p.start } : {}) };
    }).filter(Boolean);
    if (!items.length) return;
    $("#en-go").disabled = true;
    const x = await call("POST", `/${encodeURIComponent(ev.id)}`, { entries: items });
    if (!x.ok) { say(errText(x.data.error), true); $("#en-go").disabled = false; return; }
    const res = x.data.results || [], done = res.filter((y) => y.ok), bad = res.filter((y) => !y.ok);
    const lines = [...done.map((y) => html`<b>${y.name}</b> · ${y.payer === "club" ? t("ent.byClub") : money(y.price, cur)} · ${t("ent.ref")} <b>${y.ref}</b>`),
      ...bad.map((y) => html`<b>${y.name || "?"}</b> · ${errText(y.error, { min: gapWords(F.starts.gap), n: F.starts.max })}`)];
    st.sel.clear();
    say(done.length ? (bad.length ? t("ent.done.some") : tn("ent.done", done.length, { n: done.length })) : t("ent.done.none"), !done.length, lines);
    await reload();
  }
  async function reload() {
    const y = await call("GET", `/${encodeURIComponent(ev.id)}`);
    if (y.ok) { st.D = y.data; Object.assign(F, y.data.form); }
    draw();
  }

  if (me) {
    const x = await call("GET", "/runners");
    if (x.ok) {
      st.runners = x.data.runners || []; st.children = x.data.children || []; st.last = x.data.last || {};
      st.me = { ...x.data.me, last: st.runners.find((r0) => r0.self)?.last_name || "" };
    }
  }
  draw();
  return { title: `${t("ent.title")} · ${ev.name}` };
}

/** How to pay what is due: the total by reference, the organising club's holder and IBAN, at the desk. */
export function payBox(due, bank, F, cur) {
  const byRef = new Map();
  for (const m of due) byRef.set(m.ref, (byRef.get(m.ref) || 0) + m.price);
  const before = F.pay?.before || F.before;
  return html`<div class="en-pay">${[...byRef].map(([ref, c]) => html`<div class="en-total"><span>${t("ent.pay.toPay")}</span><b>${fmtMoney(c, cur, locale())}</b>
      <span class="muted">${t("ent.ref")}</span> <b class="en-ref">${ref}</b></div>`)}
    ${F.pay?.transfer !== false && bank ? html`<p>${t("ent.pay.transfer")}</p><dl class="en-bank"><dt>${t("ent.pay.holder")}</dt><dd>${bank.holder || "—"}</dd>
      <dt>IBAN</dt><dd class="num">${String(bank.iban).replace(/(.{4})/g, "$1 ").trim()}</dd>${bank.bic ? html`<dt>BIC</dt><dd class="num">${bank.bic}</dd>` : ""}
      <dt>${t("ent.pay.label")}</dt><dd><b>${[...byRef.keys()].join(", ")}</b></dd></dl>${before ? html`<p class="muted en-small">${t("ent.pay.before", { date: fmtDate(before, "long") })}</p>` : ""}` : ""}
    ${F.pay?.desk || F.desk ? html`<p class="muted en-small">${t(bank && F.pay?.transfer !== false ? "ent.pay.orDesk" : "ent.pay.desk")}</p>` : ""}
    ${!bank && !(F.pay?.desk || F.desk) ? html`<p class="muted en-small">${t("ent.pay.ask")}</p>` : ""}</div>`;
}

// ---- the list of entrants ---------------------------------------------------------------------------------------------------
async function publicTab(box, ev, F) {
  box.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  const x = await call("GET", `/${encodeURIComponent(ev.id)}/public`);
  if (!x.ok) { box.innerHTML = html`<div class="card"><div class="empty">${t("ent.err.load")}</div></div>`; return; }
  const list = x.data.entries || [];
  const st = { cls: "", q: "" };
  const drawList = () => {
    const rows = list.filter((r) => (!st.cls || r.cls === st.cls) && (!st.q || normalise(`${r.n} ${r.club}`).includes(normalise(st.q))));
    $("#en-pl").innerHTML = rows.length ? html`<table class="data compact" data-freeze="1"><thead><tr><th>${t("bk.col.runner")}</th><th>${t("rk.col.club")}</th>
        <th>${t("ent.col.class")}</th>${list.some((r) => r.s != null) ? html`<th class="r">${t("bk.col.start")}</th>` : ""}</tr></thead>
      <tbody>${rows.map((r) => html`<tr><td>${r.n}</td><td class="muted">${r.club ? clubLabel({ club_country: r.cc, club_name: r.club }, ev.country) : ""}</td><td>${r.cls}</td>
        ${list.some((y) => y.s != null) ? html`<td class="r num">${hm(r.s)}</td>` : ""}</tr>`)}</tbody></table>` : html`<div class="empty">${t("ent.list.none")}</div>`;
  };
  const counts = new Map();
  for (const r of list) counts.set(r.cls, (counts.get(r.cls) || 0) + 1);
  box.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${tn("ent.list.count", list.length, { n: fmt(list.length) })}</h2>
      <div class="hint">${t("ent.list.hint")}</div></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>${t("ent.col.class")}</span>
        <select id="en-pl-cls"><option value="">${t("ent.all")}</option>${[...counts].map(([c, n]) => html`<option value="${c}">${c} (${n})</option>`)}</select></label>
        <input id="en-pl-q" placeholder="${t("ent.search")}" style="width:180px"></div></div>
    <div class="table-wrap" id="en-pl"></div></section>`;
  $("#en-pl-cls").addEventListener("change", (e) => { st.cls = e.target.value; drawList(); });
  $("#en-pl-q").addEventListener("input", (e) => { st.q = e.target.value; drawList(); });
  drawList();
}

// ---- « Mes inscriptions » ---------------------------------------------------------------------------------------------------
async function minePage(main) {
  main.innerHTML = html`<div class="page-head"><div><h1>${t("ent.mine.title")}</h1><p class="lede">${t("ent.mine.lede")}</p></div></div><div id="en-mine"><div class="boot"><div class="spinner"></div></div></div>`;
  const box = $("#en-mine");
  if (!auth.session()) { box.innerHTML = html`<div class="card"><div class="empty">${t("ent.mine.login")}</div></div>`; return { title: t("ent.mine.title") }; }
  const x = await call("GET", "/mine");
  if (!x.ok) { box.innerHTML = html`<div class="card"><div class="empty">${t(x.status === 503 ? "ent.err.not_ready" : "ent.err.load")}</div></div>`; return { title: t("ent.mine.title") }; }
  const today = new Date().toLocaleDateString("sv-SE");
  const byEv = new Map();
  for (const e of x.data.entries || []) (byEv.get(e.event.id) || byEv.set(e.event.id, []).get(e.event.id)).push(e);
  const block = (list) => {
    const ev = list[0].event, cur = list[0].currency, due = list.filter((m) => m.payer === "runner" && m.pay_state === "due");
    return html`<section class="card en-mine-ev"><div class="card-head"><div><h2><a href="#/inscription?ev=${encodeURIComponent(ev.id)}">${ev.name}</a></h2>
        <div class="hint">${fmtDate(ev.date)}${ev.place ? ` · ${ev.place}` : ""}${ev.club ? ` · ${ev.club}` : ""}</div></div>
        ${list[0].open ? html`<a class="btn btn-sm" href="#/inscription?ev=${encodeURIComponent(ev.id)}">${t("ent.mine.change")}</a>` : ""}</div>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("bk.col.runner")}</th><th>${t("ent.col.class")}</th><th class="r">${t("bk.col.start")}</th>
        <th class="r">${t("ent.col.amount")}</th><th>${t("ent.col.state")}</th><th>${t("ent.ref")}</th></tr></thead>
      <tbody>${list.map((m) => html`<tr><td>${m.first_name} ${m.last_name}</td><td>${m.class}</td><td class="r num">${hm(m.start)}</td>
        <td class="r num" title="${partsText(m.parts, cur)}">${m.payer === "club" ? html`<span class="muted">${t("ent.byClub")}</span>` : fmtMoney(m.price, cur, locale())}</td>
        <td>${m.state === "pending" ? html`<span class="tag tag-warn">${t("ent.st.pending")}</span>` : m.pay_state === "paid" ? html`<span class="tag tag-in">${t("ent.pay.paid")}</span>`
          : m.pay_state === "waived" ? html`<span class="tag">${t("ent.pay.waived")}</span>` : m.payer === "club" ? html`<span class="tag">${t("ent.byClub")}</span>` : html`<span class="tag tag-warn">${t("ent.pay.due")}</span>`}</td>
        <td class="num">${m.ref}</td></tr>`)}</tbody></table></div>
      ${due.length && list[0].event.date >= today ? raw(payBox(due, due[0].bank, { pay: { transfer: true, desk: list[0].desk, before: list[0].before } }, cur)) : ""}</section>`;
  };
  const groups = [...byEv.values()];
  const coming = groups.filter((l) => l[0].event.date >= today).sort((a, b) => a[0].event.date.localeCompare(b[0].event.date));
  const past = groups.filter((l) => l[0].event.date < today);
  box.innerHTML = html`<h2 class="en-h">${t("ent.mine.coming")}</h2>${coming.length ? raw(coming.map(block).join("")) : html`<div class="card"><div class="empty">${t("ent.mine.none")}</div></div>`}
    ${past.length ? html`<h2 class="en-h">${t("ent.mine.past")}</h2>${raw(past.map(block).join(""))}` : ""}`;
  return { title: t("ent.mine.title") };
}
