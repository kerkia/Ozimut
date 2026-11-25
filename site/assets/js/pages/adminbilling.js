// The admin page's tab « Abonnements » (docs/billing/design.md §8; owner, 2026-11-25): Ozimut's own plans seen by the
// administrators — the overview and the health of the set-up, the packaging (« Formules »: what each plan holds, the prices,
// the seller, the public « Ce qui change » entries), the subscriptions, the access given (grants, federation and league
// agreements, codes), the invoices by bank transfer and Stripe's events. functions/api/admin/billing.js (its header lists
// the views and the actions). Drawn only while the account's session says billing is on (pages/admin.js); its texts are the
// administrators' `ad.bill.*` (the purchase gate's `bill.*` are not used here). An invoice's PDF is drawn by the purchase
// gate (offers.js) when it offers it; the button is not shown otherwise.

import { html, raw, $, $$, fmt, fmtDate } from "../util.js";
import { t, has, LANGS, LANG_NAMES, lang } from "../i18n.js";
import { dataTable, seg, tile } from "../ui.js";
import { replaceQuery } from "../app.js";
import { confirmBox, alertBox } from "../askbox.js";
import { bar } from "../waitbar.js";
import * as offers from "../offers.js";

const API = "api/admin/billing";
const VIEWS = [["apercu", "overview"], ["formules", "config"], ["abonnements", "subs"], ["acces", "access"], ["factures", "invoices"], ["stripe", "events"]];
const PLAN_COLS = ["free", "plus", "club", "member", "participant", "u21"];
// the European Union's members (the buyers' countries against the VAT thresholds)
const EU = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" "));

class ApiError extends Error {
  constructor(status, body) { super(body?.error || String(status)); this.status = status; this.body = body || {}; }
}
async function get(view, extra = "") {
  const r = await fetch(`${API}?view=${view}${extra}`, { credentials: "same-origin", cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j);
  return j;
}
async function post(op, body = {}) {
  const r = await fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j);
  return j;
}

/** An API error in plain words: the switch off, the migration missing, what the server names, else its own word. */
function errorText(e) {
  if (e?.status === 503) return t("ad.bill.err.notReady");
  if (e?.status === 404 && e.message === "off") return t("ad.bill.err.off");
  if (e?.status === 403) return t("ad.forbidden");
  if (e?.message === "early") return t("ad.bill.err.early", { date: e.body?.date ? day(e.body.date) : "—" });
  const k = `ad.bill.err.${String(e?.message || "").replace(/[^a-z0-9]+/gi, "_")}`;
  const more = e?.body?.field || "";
  return (has(k) ? t(k) : t("ad.bill.err.other", { error: String(e?.message || e) })) + (more ? ` (${more})` : "");
}
const errorHtml = (e) => html`<div class="notice">${errorText(e)}${e?.status === 503 ? html`<br><code class="ab-cmd">npx wrangler d1 migrations apply ocn --remote</code>` : ""}</div>`;
const waitHtml = () => html`<div class="ab-wait">${raw(bar())}<span class="muted">${t("misc.loading")}</span></div>`;

// amounts are kept in cents, shown in euros
const money = (c, cur = "eur") => (c == null || c === "" ? "—"
  : new Intl.NumberFormat(document.documentElement.lang || lang(), { style: "currency", currency: String(cur || "eur").toUpperCase() }).format(c / 100));
const euros = (c) => (c == null || c === "" ? "" : String(Math.round(c) / 100));
const toCents = (v) => { const s = String(v ?? "").trim().replace(",", "."); if (s === "") return null; const n = Number(s); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };
const day = (iso) => (iso ? fmtDate(String(iso).slice(0, 10), "short") : "—");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const planName = (p) => (has(`ad.bill.plan.${p}`) ? t(`ad.bill.plan.${p}`) : p || "—");
const reasonName = (r) => (has(`ad.bill.reason.${r}`) ? t(`ad.bill.reason.${r}`) : r || "—");
const statusName = (s) => (has(`ad.bill.status.${s}`) ? t(`ad.bill.status.${s}`) : s || "—");
const kindName = (k) => (has(`ad.bill.kind.${k}`) ? t(`ad.bill.kind.${k}`) : k || "—");
const capName = (k) => (has(`ad.bill.cap.${k}`) ? t(`ad.bill.cap.${k}`) : k);
const colName = (c) => t(`ad.bill.col.${c}`);
const pill = (ok, text) => html`<span class="ab-pill ${ok === true ? "ab-ok" : ok === false ? "ab-warn" : "ab-na"}">${text}</span>`;
let countryNames = null;
const countryName = (cc) => { try { countryNames ||= new Intl.DisplayNames([lang()], { type: "region" }); return countryNames.of(cc) || cc; } catch (e) { return cc || "—"; } };

/** A subject in words: an account, a club, an event, a federation, a league (the server's name first). */
function subjectText(s, name) {
  const m = /^(fo|[uoef])(.+)$/.exec(String(s || ""));
  const kind = m ? t(`ad.bill.subject.${m[1]}`, { id: m[2] }) : String(s || "—");
  return name ? html`<b>${name}</b><br><span class="muted">${kind}</span>` : html`${kind}`;
}

/** A form in a dialog. `fields`: [{ k, label, type, value, options, hint, required, attrs }]; resolves the values, null when given up.
 *  `check(values)` may return an error text that keeps the dialog open. */
function formBox(title, fields, { ok = t("ad.bill.save"), intro = "", wide = false, check } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = `ask-dlg ab-dlg${wide ? " ab-wide" : ""}`;
    const input = (f) => (f.type === "select"
      ? html`<select name="${f.k}">${f.options.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(f.value ?? "") ? "selected" : "")}>${l}</option>`)}</select>`
      : f.type === "textarea" ? html`<textarea name="${f.k}" rows="${f.rows || 3}" ${raw(f.attrs || "")}>${f.value ?? ""}</textarea>`
        : f.type === "check" ? html`<input type="checkbox" name="${f.k}" ${raw(f.value ? "checked" : "")}>`
          : html`<input type="${f.type || "text"}" name="${f.k}" value="${f.value ?? ""}" ${raw(f.required ? "required" : "")} ${raw(f.attrs || "")}>`);
    d.innerHTML = html`<form method="dialog" class="ab-form"><h3>${title}</h3>${intro ? html`<p class="muted ab-intro">${intro}</p>` : ""}
      <div class="ab-fields">${fields.map((f) => (f.type === "check"
        ? html`<label class="check ab-f-wide">${input(f)}<span>${f.label}</span></label>`
        : html`<label class="field ${f.wide || f.type === "textarea" ? "ab-f-wide" : ""}"><span>${f.label}</span>${input(f)}${f.hint ? html`<small class="muted">${f.hint}</small>` : ""}</label>`))}</div>
      <p class="ab-form-err" hidden></p>
      <div class="ask-btns"><button type="button" class="btn" data-no>${t("dlg.cancel")}</button><button type="submit" class="btn btn-primary">${ok}</button></div></form>`;
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { d.close(); } catch (e) { /* closed */ } d.remove(); resolve(v); };
    $("[data-no]", d).addEventListener("click", () => finish(null));
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(null); });
    $("form", d).addEventListener("submit", (e) => {
      e.preventDefault();
      const v = {};
      for (const f of fields) { const el = d.querySelector(`[name="${f.k}"]`); v[f.k] = f.type === "check" ? el.checked : el.value.trim(); }
      const bad = check?.(v);
      if (bad) { const p = $(".ab-form-err", d); p.textContent = bad; p.hidden = false; return; }
      finish(v);
    });
    document.body.append(d);
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
    d.querySelector("input, select, textarea")?.focus();
  });
}

/** Something shown once (a code just made), with a copy button. */
function onceBox(title, value, note) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "ask-dlg ab-dlg";
    d.innerHTML = html`<h3>${title}</h3><p class="ab-once"><code>${value}</code></p><p class="muted ab-intro">${note}</p>
      <div class="ask-btns"><button type="button" class="btn" data-copy>${t("ad.bill.copy")}</button><button type="button" class="btn btn-primary" data-ok>${t("dlg.ok")}</button></div>`;
    const finish = () => { try { d.close(); } catch (e) { /* closed */ } d.remove(); resolve(); };
    $("[data-ok]", d).addEventListener("click", finish);
    d.addEventListener("cancel", (e) => { e.preventDefault(); finish(); });
    $("[data-copy]", d).addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(value); } catch (err) {
        const r = document.createRange(); r.selectNodeContents($("code", d)); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand("copy"); } catch (e2) { /* the code stays selected: Ctrl+C */ }
      }
      e.target.textContent = t("ad.bill.copied");
    });
    document.body.append(d);
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
  });
}

/** Runs an action: the button off meanwhile, a failure said in a box; true when it went through. */
async function act(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); return true; }
  catch (e) { await alertBox(errorText(e)); return false; }
  finally { if (btn?.isConnected) btn.disabled = false; }
}

// =============================================================================================================================
/** Draws the tab in `box`; `query.vue` the sub-view asked for. */
export async function draw(box, { query = {} } = {}) {
  const keys = VIEWS.map(([k]) => k);
  let vue = keys.includes(query.vue) ? query.vue : "apercu";
  box.innerHTML = html`<div class="ab-tabs" id="ab-tabs"></div><div id="ab-view"></div>`;
  const show = (k) => {
    vue = k;
    box.dataset.vue = k === "apercu" ? "" : k;
    $("#ab-tabs", box).innerHTML = seg("abvue", VIEWS.map(([v, n]) => [v, t(`ad.bill.view.${n}`)]), k);
    $$('[data-seg="abvue"]', box).forEach((b) => b.addEventListener("click", () => show(b.dataset.value)));
    replaceQuery({ onglet: "abonnements", vue: box.dataset.vue || null });
    const view = $("#ab-view", box);
    view.innerHTML = waitHtml();
    const redraw = () => { if (vue === k) show(k); };
    DRAW[k](view, redraw).catch((e) => { if (vue === k) view.innerHTML = errorHtml(e); });
  };
  show(vue);
}

const DRAW = { apercu: drawOverview, formules: drawConfig, abonnements: drawSubs, acces: drawAccess, factures: drawInvoices, stripe: drawEvents };

// ---- Vue d'ensemble ---------------------------------------------------------------------------------------------------------
async function drawOverview(view) {
  const [hl, sm] = await Promise.all([get("health"), get("summary").catch((e) => e)]);
  const healthCard = html`<section class="card ab-card-pad ab-health-card"><h2>${t("ad.bill.h.title")}</h2><p class="muted">${t("ad.bill.h.hint")}</p>${healthList(hl)}</section>`;
  if (sm instanceof Error) { view.innerHTML = html`${errorHtml(sm)}<div class="ab-grid">${healthCard}</div>`; return; }
  const active = sm.subs.filter((r) => r.status === "active").reduce((a, r) => a + r.n, 0);
  const grantsN = sm.grants.reduce((a, r) => a + r.n, 0);
  const conv = sm.trials.started ? Math.round(100 * sm.trials.converted / sm.trials.started) : null;
  // the funnel: 30 days, summed by step and what it was about
  const fun = new Map();
  for (const r of sm.funnel) { const k = `${r.step}|${r.k || ""}`; fun.set(k, { step: r.step, k: r.k || "", n: (fun.get(k)?.n || 0) + r.n }); }
  const funnel = [...fun.values()].sort((a, b) => b.n - a.n);
  const countries = sm.countries.map((c) => ({ ...c, zone: !c.country ? "" : c.country === "FR" ? "fr" : EU.has(c.country) ? "eu" : "out" }));
  const table = (heads, rows, empty) => (rows.length ? html`<div class="table-wrap"><table class="data compact"><thead><tr>${heads.map(([h, cls]) => html`<th class="${cls || ""}">${h}</th>`)}</tr></thead>
    <tbody>${rows}</tbody></table></div>` : html`<div class="empty">${empty}</div>`);
  view.innerHTML = html`
    <div class="tiles ab-tiles">
      ${raw(tile(t("ad.bill.t.mode"), t(`ad.bill.mode.${sm.mode}`), t(`ad.bill.mode.${sm.mode}.sub`)))}
      ${raw(tile(t("ad.bill.t.arr"), money(sm.arr), t("ad.bill.t.arr.sub")))}
      ${raw(tile(t("ad.bill.t.active"), fmt(active), sm.pastDue ? t("ad.bill.t.pastDue", { n: fmt(sm.pastDue) }) : ""))}
      ${raw(tile(t("ad.bill.t.trials"), fmt(sm.trials.started), t("ad.bill.t.trials.sub", { n: fmt(sm.trials.converted), p: conv == null ? "—" : fmt(conv) })))}
      ${raw(tile(t("ad.bill.t.grants"), fmt(grantsN), ""))}
      ${raw(tile(t("ad.bill.t.overdue"), fmt(sm.overdue.n), money(sm.overdue.total)))}
      ${raw(tile(t("ad.bill.t.failed"), fmt(sm.failedEvents || 0), sm.failedEvents ? t("ad.bill.t.failed.sub") : ""))}
    </div>
    <div class="ab-ov">${healthCard}<div class="ab-grid">
      <section class="card ab-card-pad"><h2>${t("ad.bill.o.subs")}</h2>
        ${table([[t("ad.bill.c.plan")], [t("ad.bill.c.status")], [t("ad.bill.c.source")], [t("ad.bill.c.n"), "r"], [t("ad.bill.c.amount"), "r"]],
          sm.subs.map((r) => html`<tr><td>${planName(r.plan)}</td><td>${statusName(r.status)}</td><td>${t(`ad.bill.source.${r.source}`)}</td><td class="r num">${fmt(r.n)}</td><td class="r num">${money(r.amount)}</td></tr>`), t("ad.bill.o.noSubs"))}</section>
      <section class="card ab-card-pad"><h2>${t("ad.bill.o.grants")}</h2>
        ${table([[t("ad.bill.c.reason")], [t("ad.bill.c.plan")], [t("ad.bill.c.n"), "r"]],
          sm.grants.map((r) => html`<tr><td>${reasonName(r.reason)}</td><td>${planName(r.plan)}</td><td class="r num">${fmt(r.n)}</td></tr>`), t("ad.bill.o.noGrants"))}</section>
      <section class="card ab-card-pad"><h2>${t("ad.bill.o.invoices")}</h2>
        ${table([[t("ad.bill.c.kind")], [t("ad.bill.c.status")], [t("ad.bill.c.n"), "r"], [t("ad.bill.c.total"), "r"]],
          sm.invoices.map((r) => html`<tr><td>${kindName(r.kind)}</td><td>${statusName(r.status)}</td><td class="r num">${fmt(r.n)}</td><td class="r num">${money(r.total)}</td></tr>`), t("ad.bill.o.noInvoices"))}</section>
      <section class="card ab-card-pad"><h2>${t("ad.bill.o.funnel")}</h2><p class="muted">${t("ad.bill.o.funnel.hint")}</p>
        ${table([[t("ad.bill.c.step")], [t("ad.bill.c.about")], [t("ad.bill.c.n"), "r"]],
          funnel.map((r) => html`<tr><td>${has(`ad.bill.step.${r.step}`) ? t(`ad.bill.step.${r.step}`) : r.step}</td><td>${r.k || "—"}</td><td class="r num">${fmt(r.n)}</td></tr>`), t("ad.bill.o.noFunnel"))}</section>
      <section class="card ab-card-pad"><h2>${t("ad.bill.o.countries")}</h2>
        ${table([[t("ad.bill.c.country")], [t("ad.bill.c.zone")], [t("ad.bill.c.buyers"), "r"]],
          countries.map((r) => html`<tr><td>${r.country ? countryName(r.country) : "—"}</td><td>${r.zone ? t(`ad.bill.zone.${r.zone}`) : "—"}</td><td class="r num">${fmt(r.n)}</td></tr>`), t("ad.bill.o.noCountries"))}
        <p class="ab-note">${t("ad.bill.o.vat")}</p></section>
    </div></div>`;
}

/** The set-up's health: each line its state and what to do. */
function healthList(h) {
  const line = (ok, label, what) => html`<li>${pill(ok, ok === true ? t("ad.bill.h.ok") : ok === false ? t("ad.bill.h.todo") : t("ad.bill.h.info"))}<span>${label}${what ? html`<small>${what}</small>` : ""}</span></li>`;
  const sec = (name) => line(!!h.secrets?.[name], html`<code>${name}</code> — ${t(h.secrets?.[name] ? "ad.bill.h.present" : "ad.bill.h.missing")}`,
    h.secrets?.[name] ? "" : html`${t("ad.bill.h.secretDo")} <code class="ab-cmd">npx wrangler pages secret put ${name}</code>`);
  const price = (k) => line(!!h.stripePrices?.[k], html`${t("ad.bill.h.price")} <code>${k}</code> — ${t(h.stripePrices?.[k] ? "ad.bill.h.present" : "ad.bill.h.missing")}`,
    h.stripePrices?.[k] ? "" : t("ad.bill.h.priceDo"));
  return html`<ul class="ab-health">
    ${line(null, t("ad.bill.h.mode", { mode: t(`ad.bill.mode.${h.mode}`) }), t(`ad.bill.h.mode.${h.mode}`))}
    ${line(!!h.migration, t(h.migration ? "ad.bill.h.migration.ok" : "ad.bill.h.migration.no"), h.migration ? "" : html`<code class="ab-cmd">npx wrangler d1 migrations apply ocn --remote</code>`)}
    ${sec("STRIPE_SECRET_KEY")}${sec("STRIPE_WEBHOOK_SECRET")}
    ${h.stripeApiOverride ? line(null, html`<code>STRIPE_API</code> — ${t("ad.bill.h.override")}`, t("ad.bill.h.overrideDo")) : ""}
    ${price("plus.year")}${price("plus.founder")}${price("mapPack")}
    ${line(!!h.seller?.complete, t(h.seller?.complete ? "ad.bill.h.seller.ok" : "ad.bill.h.seller.no"),
      h.seller?.complete ? "" : t("ad.bill.h.sellerDo", { fields: (h.seller?.missing || []).map((f) => t(`ad.bill.s.${f}`)).join(", ") }))}
    ${line(!!h.seller?.iban, t(h.seller?.iban ? "ad.bill.h.iban.ok" : "ad.bill.h.iban.no"), h.seller?.iban ? "" : t("ad.bill.h.ibanDo"))}
    ${line(null, t("ad.bill.h.sell", { v: t(`ad.bill.sell.${h.sell}`) }), t("ad.bill.h.sellDo"))}
    ${line(null, t("ad.bill.h.pack", { v: t(`ad.bill.base.${h.pack}`) }), t("ad.bill.h.packDo"))}
    ${line(!!h.mail, t(h.mail ? "ad.bill.h.mail.ok" : "ad.bill.h.mail.no"), h.mail ? "" : t("ad.bill.h.mailDo"))}
  </ul>`;
}

// ---- Formules ----------------------------------------------------------------------------------------------------------------
async function drawConfig(view, redraw) {
  const c = await get("config");
  const cols = c.columns || PLAN_COLS;
  const rows = c.pack.rows;
  // the work in hand: the base and the overrides, saved together
  let base = c.pack.base;
  const work = JSON.parse(JSON.stringify(c.pack.set || {}));
  const same = (a, b) => (a === undefined ? undefined : a) === (b === undefined ? undefined : b);
  // the server sends each base resolved (plans.js resolvePack: plus and club as free, u21 as plus when left out); a column equal
  // to the one it follows is taken as left out, so that it follows a change of that one as the server will
  const rawBase = (row) => {
    const b = row[base] || {};
    return { free: b.free, plus: same(b.plus, b.free) ? undefined : b.plus, club: same(b.club, b.free) ? undefined : b.club,
      u21: same(b.u21, b.plus) ? undefined : b.u21, member: b.member, participant: b.participant };
  };
  const resolve = (row, over) => {
    const o = { ...rawBase(row), ...over };
    if (o.free === undefined) o.free = row.kind === "flag" ? false : 0;
    if (o.plus === undefined) o.plus = o.free;
    if (o.club === undefined) o.club = o.free;
    if (o.u21 === undefined) o.u21 = o.plus;
    return o;
  };
  const valueOf = (row, col) => resolve(row, work[row.key] || {})[col];
  const own = (row, col) => !!(work[row.key] && col in work[row.key]);
  /** The value without this cell's own override. */
  const without = (row, col) => { const o = { ...(work[row.key] || {}) }; delete o[col]; return resolve(row, o)[col]; };
  const follows = (row, col) => !own(row, col) && rawBase(row)[col] === undefined;

  const cell = (row, col) => {
    const v = valueOf(row, col), was = row.values[col];
    const cls = `ab-cell${own(row, col) ? " ab-diff" : ""}${same(v, was) ? "" : " ab-dirty"}${follows(row, col) ? " ab-absent" : ""}`;
    const tip = follows(row, col) ? t("ad.bill.f.absent") : own(row, col) ? t("ad.bill.f.own") : t("ad.bill.f.base");
    if (row.kind === "flag") return html`<td class="${cls}" title="${tip}"><input type="checkbox" data-cap="${row.key}" data-col="${col}" ${raw(v === true ? "checked" : "")} aria-label="${capName(row.key)} · ${colName(col)}"></td>`;
    return html`<td class="${cls}" title="${tip}"><input type="number" min="0" step="1" data-cap="${row.key}" data-col="${col}" value="${typeof v === "number" ? v : ""}" placeholder="—" ${raw(v === null ? "disabled" : "")} aria-label="${capName(row.key)} · ${colName(col)}">
      <label class="ab-unl"><input type="checkbox" data-unl="${row.key}" data-col="${col}" ${raw(v === null ? "checked" : "")}>${t("ad.bill.f.unlimited")}</label></td>`;
  };
  const rowHtml = (row) => html`<tr data-row="${row.key}"><th scope="row" class="ab-cap">${capName(row.key)}<small>${t(`ad.bill.kind2.${row.kind}`)}${row.unit ? ` · ${t(`ad.bill.unit.${row.unit}`)}` : ""} · ${t(`ad.bill.mod.${row.module}`)}</small></th>
    ${cols.map((col) => cell(row, col))}
    <td class="r"><button type="button" class="btn btn-sm" data-reset="${row.key}" ${raw(work[row.key] ? "" : "disabled")}>${t("ad.bill.f.reset")}</button></td></tr>`;

  // what changes, for whom: each cell whose value in force would change
  const changes = () => {
    const out = [];
    for (const row of rows) for (const col of cols) {
      const now = row.values[col], next = valueOf(row, col);
      if (!same(now, next)) out.push(`• ${capName(row.key)} — ${t(`ad.bill.whom.${col}`)} : ${shown(row, now)} → ${shown(row, next)}`);
    }
    return out;
  };
  const shown = (row, v) => (v === undefined ? t("ad.bill.f.nothing") : row.kind === "flag" ? t(v ? "misc.yes" : "misc.no") : v === null ? t("ad.bill.f.unlimited") : fmt(v));

  const p = c.prices || {}, s = c.seller || {}, sell = c.sell || { individuals: "none", mor: {} };
  view.innerHTML = html`
    <section class="card ab-card-pad"><h2>${t("ad.bill.f.title")}</h2><p class="muted">${t("ad.bill.f.hint")}</p>
      <div class="ab-toolbar"><label class="field"><span>${t("ad.bill.f.baseLabel")}</span><select id="ab-base">${(c.bases || ["launch", "v1"]).map((b) => html`<option value="${b}" ${raw(b === base ? "selected" : "")}>${t(`ad.bill.base.${b}`)}</option>`)}</select></label>
        <span class="muted ab-basehint" id="ab-basehint">${t(`ad.bill.base.${base}.hint`)}</span></div>
      <div class="table-wrap" style="max-height:none"><table class="data compact ab-pack"><thead><tr><th>${t("ad.bill.c.cap")}</th>${cols.map((col) => html`<th class="ab-cell" title="${t(`ad.bill.whom.${col}`)}">${colName(col)}</th>`)}<th></th></tr></thead>
        <tbody id="ab-pack-body">${rows.map(rowHtml)}</tbody></table></div>
      <p class="ab-note">${t("ad.bill.f.legend")}</p>
      <div class="ab-savebar"><button type="button" class="btn btn-primary" id="ab-pack-save">${t("ad.bill.save")}</button><span class="muted" id="ab-pack-state"></span></div>
    </section>

    <section class="card ab-card-pad" style="margin-top:16px"><h2>${t("ad.bill.p.title")}</h2><p class="muted">${t("ad.bill.p.hint")}</p>
      <form id="ab-prices"><h3 class="ab-sub">${t("ad.bill.plan.plus")}</h3><div class="ab-fields">
        ${num("plus.year", t("ad.bill.p.year"), euros(p.plus?.year), "0.01")}${num("plus.founder", t("ad.bill.p.founder"), euros(p.plus?.founder), "0.01")}
        ${txt("plus.founderUntil", t("ad.bill.p.founderUntil"), p.plus?.founderUntil || "", "date")}${num("trialDays", t("ad.bill.p.trialDays"), p.trialDays ?? "", "1")}
        ${txt("plus.stripe.year", t("ad.bill.p.stripeYear"), p.plus?.stripe?.year || "", "text", "price_…")}${txt("plus.stripe.founder", t("ad.bill.p.stripeFounder"), p.plus?.stripe?.founder || "", "text", "price_…")}</div>
        <h3 class="ab-sub">${t("ad.bill.plan.club")}</h3><div class="ab-fields">
        ${num("club.year", t("ad.bill.p.year"), euros(p.club?.year), "0.01")}${num("club.small", t("ad.bill.p.small"), euros(p.club?.small), "0.01")}${num("club.smallMax", t("ad.bill.p.smallMax"), p.club?.smallMax ?? "", "1")}</div>
        <h3 class="ab-sub">${t("ad.bill.p.fed")}</h3><div class="ab-fields">
        ${num("fed.clubs", t("ad.bill.p.fedClubs"), euros(p.fed?.clubs), "0.01")}${num("fed.all", t("ad.bill.p.fedAll"), euros(p.fed?.all), "0.01")}</div>
        <h3 class="ab-sub">${t("ad.bill.p.event")}</h3><div class="ab-fields">
        ${num("event.perEntry", t("ad.bill.p.perEntry"), euros(p.event?.perEntry), "0.01")}${num("event.cap", t("ad.bill.p.cap"), euros(p.event?.cap), "0.01", t("ad.bill.p.capHint"))}</div>
        <h3 class="ab-sub">${t("ad.bill.p.mapPack")}</h3><div class="ab-fields">
        ${num("mapPack.km2", t("ad.bill.p.km2"), p.mapPack?.km2 ?? "", "1")}${num("mapPack.amount", t("ad.bill.p.amount"), euros(p.mapPack?.amount), "0.01")}${txt("mapPack.stripe", t("ad.bill.p.stripeMap"), p.mapPack?.stripe || "", "text", "price_…")}</div>
        <p class="ab-note">${t("ad.bill.p.currency", { cur: String(p.currency || "eur").toUpperCase() })}</p>
        <div class="ab-actions"><button type="submit" class="btn btn-primary">${t("ad.bill.save")}</button></div></form>
    </section>

    <div class="ab-grid">
      <section class="card ab-card-pad"><h2>${t("ad.bill.sell.title")}</h2><p class="muted">${t("ad.bill.sell.hint")}</p>
        <form id="ab-sell"><div class="ab-fields">
          <label class="field ab-f-wide"><span>${t("ad.bill.sell.individuals")}</span><select name="individuals">${["none", "fr", "eu", "all"].map((v) => html`<option value="${v}" ${raw(sell.individuals === v ? "selected" : "")}>${t(`ad.bill.sell.${v}`)}</option>`)}</select></label>
          <h3 class="ab-sub ab-f-wide">${t("ad.bill.mor.title")}</h3><p class="muted ab-f-wide ab-intro">${t("ad.bill.mor.hint")}</p>
          <label class="check ab-f-wide"><input type="checkbox" name="morOn" ${raw(sell.mor?.on ? "checked" : "")}><span>${t("ad.bill.mor.on")}</span></label>
          <label class="field ab-f-wide"><span>${t("ad.bill.mor.countries")}</span><input name="morCountries" value="${(sell.mor?.countries || []).join(", ")}" placeholder="US, CA, CH"></label>
          <label class="field ab-f-wide"><span>${t("ad.bill.mor.params")}</span><textarea name="morParams" rows="3" class="ab-json">${JSON.stringify(sell.mor?.params || {}, null, 1)}</textarea></label>
        </div><div class="ab-actions"><button type="submit" class="btn btn-primary">${t("ad.bill.save")}</button></div></form></section>

      <section class="card ab-card-pad"><h2>${t("ad.bill.s.title")}</h2><p class="muted">${t("ad.bill.s.hint")}</p>
        <form id="ab-seller"><div class="ab-fields">
          ${["name", "form", "capital", "siren", "siret", "rcs", "country", "email", "iban", "bic", "mediator", "mediatorUrl"].map((k) => txt(k, t(`ad.bill.s.${k}`), s[k] ?? "", k === "email" ? "email" : k === "mediatorUrl" ? "url" : "text"))}
          ${num("vat", t("ad.bill.s.vat"), s.vat ?? 0, "0.01", t("ad.bill.s.vatHint"))}
          <label class="field ab-f-wide"><span>${t("ad.bill.s.address")}</span><textarea name="address" rows="3">${s.address || ""}</textarea></label>
          <label class="field ab-f-wide"><span>${t("ad.bill.s.vatNote")}</span><input name="vatNote" value="${s.vatNote || ""}" placeholder="${t("ad.bill.s.vatNotePh")}"></label>
        </div><div class="ab-actions"><button type="submit" class="btn btn-primary">${t("ad.bill.save")}</button></div></form></section>
    </div>

    <section class="card ab-card-pad" style="margin-top:16px"><h2>${t("ad.bill.ch.title")}</h2><p class="muted">${t("ad.bill.ch.hint")}</p>
      <div class="ab-changes" id="ab-changes"></div>
      <div class="ab-actions" style="justify-content:space-between;margin-top:12px"><button type="button" class="btn" id="ab-ch-add">${t("ad.bill.ch.add")}</button>
        <button type="button" class="btn btn-primary" id="ab-ch-save">${t("ad.bill.save")}</button></div>
    </section>

    <section class="card ab-card-pad" style="margin-top:16px"><h2>${t("ad.bill.tx.title")}</h2><p class="muted">${t("ad.bill.tx.hint")}</p>
      <form id="ab-texts"><div class="ab-fields"><label class="field ab-f-wide"><span>JSON</span><textarea name="texts" rows="6" class="ab-json">${JSON.stringify(c.texts || {}, null, 2)}</textarea></label></div>
        <div class="ab-actions"><button type="submit" class="btn btn-primary">${t("ad.bill.save")}</button></div></form></section>`;

  // ---- the pack's table
  const body = $("#ab-pack-body", view), state = $("#ab-pack-state", view);
  const refreshRow = (key) => {
    const row = rows.find((r) => r.key === key), tr = $(`tr[data-row="${key}"]`, body);
    const tmp = document.createElement("tbody");
    tmp.innerHTML = rowHtml(row);
    tr.replaceWith(tmp.firstElementChild);
  };
  const refreshState = () => { const n = changes().length; state.textContent = n ? t("ad.bill.f.pending", { n: fmt(n) }) : t("ad.bill.f.none"); };
  const drop = (key, col) => { if (work[key]) { delete work[key][col]; if (!Object.keys(work[key]).length) delete work[key]; } };
  /** A cell set to `v` (undefined: its own value dropped); a value equal to what it would be anyway is no override. */
  const setCell = (key, col, v) => {
    const row = rows.find((r) => r.key === key);
    if (v === undefined || same(v, without(row, col))) drop(key, col);
    else (work[key] ||= {})[col] = v;
    refreshRow(key); refreshState();
  };
  body.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.unl) {
      const inp = $(`input[type="number"][data-cap="${el.dataset.unl}"][data-col="${el.dataset.col}"]`, body);
      const b = without(rows.find((r) => r.key === el.dataset.unl), el.dataset.col);
      setCell(el.dataset.unl, el.dataset.col, el.checked ? null : inp.value !== "" ? Number(inp.value) : b === null ? 0 : undefined);
    } else if (el.dataset.cap && el.type === "checkbox") setCell(el.dataset.cap, el.dataset.col, el.checked);
    else if (el.dataset.cap) {
      const v = el.value.trim();
      setCell(el.dataset.cap, el.dataset.col, v === "" ? undefined : Math.max(0, Number(v) || 0));
    }
  });
  body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-reset]");
    if (!b) return;
    delete work[b.dataset.reset];
    refreshRow(b.dataset.reset); refreshState();
  });
  $("#ab-base", view).addEventListener("change", (e) => {
    base = e.target.value;
    $("#ab-basehint", view).textContent = t(`ad.bill.base.${base}.hint`);
    // an override equal to the new base is no override
    for (const row of rows) for (const col of Object.keys(work[row.key] || {})) if (same(work[row.key][col], without(row, col))) drop(row.key, col);
    body.innerHTML = rows.map(rowHtml).join("");
    refreshState();
  });
  refreshState();
  $("#ab-pack-save", view).addEventListener("click", async (e) => {
    const list = changes();
    const baseMoved = base !== c.pack.base;
    if (!list.length && !baseMoved) { await alertBox(t("ad.bill.f.none")); return; }
    const msg = [baseMoved ? t("ad.bill.f.confirmBase", { from: t(`ad.bill.base.${c.pack.base}`), to: t(`ad.bill.base.${base}`) }) : "",
      list.length ? t("ad.bill.f.confirm", { n: fmt(list.length) }) : "", ...list.slice(0, 40), list.length > 40 ? `… (${fmt(list.length - 40)})` : "",
      t(c.mode === "live" ? "ad.bill.f.confirmLive" : "ad.bill.f.confirmTest")].filter(Boolean).join("\n");
    if (!(await confirmBox(msg, { ok: t("ad.bill.save") }))) return;
    if (await act(e.currentTarget, () => post("config.pack", { base, set: work }))) redraw();
  });

  // ---- prices
  $("#ab-prices", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, v = (k) => f.querySelector(`[name="${k}"]`).value.trim();
    const amounts = ["plus.year", "plus.founder", "club.year", "club.small", "fed.clubs", "fed.all", "event.perEntry", "mapPack.amount"];
    const out = { plus: { stripe: {} }, club: {}, fed: {}, event: {}, mapPack: {} };
    const put = (path, val) => { const ks = path.split("."); let o = out; for (const k of ks.slice(0, -1)) o = o[k] ||= {}; o[ks[ks.length - 1]] = val; };
    for (const k of amounts) { const c2 = toCents(v(k)); if (c2 === null || Number.isNaN(c2)) { await alertBox(t("ad.bill.err.amount", { field: k })); return; } put(k, c2); }
    const cap = toCents(v("event.cap"));
    if (Number.isNaN(cap)) { await alertBox(t("ad.bill.err.amount", { field: "event.cap" })); return; }
    put("event.cap", cap);
    put("club.smallMax", Math.max(0, Math.round(Number(v("club.smallMax")) || 0)));
    put("mapPack.km2", Math.max(1, Number(v("mapPack.km2")) || 1));
    out.trialDays = Math.max(0, Math.round(Number(v("trialDays")) || 0));
    put("plus.founderUntil", v("plus.founderUntil"));
    put("plus.stripe.year", v("plus.stripe.year")); put("plus.stripe.founder", v("plus.stripe.founder")); put("mapPack.stripe", v("mapPack.stripe"));
    if (await act($("button[type=submit]", f), () => post("config.prices", { prices: out }))) say(f, t("ad.bill.saved"));
  });

  // ---- what may be sold, to whom
  $("#ab-sell", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    let params;
    try { params = JSON.parse(f.morParams.value.trim() || "{}"); } catch (err) { await alertBox(t("ad.bill.err.json")); return; }
    const countries = f.morCountries.value.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (countries.some((x) => !/^[A-Z]{2}$/.test(x))) { await alertBox(t("ad.bill.err.countries")); return; }
    if (await act($("button[type=submit]", f), () => post("config.sell", { sell: { individuals: f.individuals.value, mor: { on: f.morOn.checked, countries, params } } }))) say(f, t("ad.bill.saved"));
  });

  // ---- the seller
  $("#ab-seller", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, seller = {};
    for (const k of ["name", "form", "capital", "siren", "siret", "rcs", "country", "email", "iban", "bic", "mediator", "mediatorUrl", "address", "vatNote"]) seller[k] = f.querySelector(`[name="${k}"]`).value.trim();
    seller.vat = Number(String(f.querySelector('[name="vat"]').value || "0").replace(",", ".")) || 0;
    if (await act($("button[type=submit]", f), () => post("config.seller", { seller }))) say(f, t("ad.bill.saved"));
  });

  // ---- the public « Ce qui change » entries, four languages each
  const changesBox = $("#ab-changes", view);
  const entries = (Array.isArray(c.changes) ? c.changes : []).map((x) => ({ ...x }));
  const loc = (v) => (typeof v === "string" ? { fr: v } : v && typeof v === "object" ? v : {});
  const drawChanges = () => {
    changesBox.innerHTML = entries.length ? entries.map((x, i) => html`<div class="ab-change" data-i="${i}">
      <div class="ab-change-head"><label class="field"><span>${t("ad.bill.ch.date")}</span><input type="date" data-k="date" value="${x.date || ""}"></label>
        <span class="ab-spacer" style="flex:1"></span><button type="button" class="btn btn-sm" data-del="${i}">${t("ad.bill.ch.remove")}</button></div>
      <div class="ab-change-langs">${LANGS.map((l) => html`<label>${LANG_NAMES[l]} — ${t("ad.bill.ch.titleF")}<input data-k="title" data-l="${l}" value="${loc(x.title)[l] || ""}"></label>`)}</div>
      <div class="ab-change-langs">${LANGS.map((l) => html`<label>${LANG_NAMES[l]} — ${t("ad.bill.ch.text")}<textarea rows="3" data-k="text" data-l="${l}">${loc(x.text)[l] || ""}</textarea></label>`)}</div>
    </div>`).join("") : html`<div class="empty">${t("ad.bill.ch.none")}</div>`;
  };
  drawChanges();
  changesBox.addEventListener("input", (e) => {
    const el = e.target, box2 = el.closest("[data-i]");
    if (!box2) return;
    const x = entries[Number(box2.dataset.i)];
    if (el.dataset.k === "date") x.date = el.value;
    else { x[el.dataset.k] = { ...loc(x[el.dataset.k]) }; x[el.dataset.k][el.dataset.l] = el.value; }
  });
  changesBox.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-del]");
    if (b && await confirmBox(t("ad.bill.ch.removeQ"), { ok: t("ad.bill.ch.remove") })) { entries.splice(Number(b.dataset.del), 1); drawChanges(); }
  });
  $("#ab-ch-add", view).addEventListener("click", () => { entries.unshift({ date: today(), title: {}, text: {} }); drawChanges(); });
  $("#ab-ch-save", view).addEventListener("click", async (e) => {
    const clean = entries.map((x) => {
      const o = { ...x };
      for (const k of ["title", "text"]) { const m = Object.fromEntries(Object.entries(loc(o[k])).map(([l, s2]) => [l, String(s2).trim()]).filter(([, s2]) => s2)); if (Object.keys(m).length) o[k] = m; else delete o[k]; }
      return o;
    });
    if (clean.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.date || ""))) { await alertBox(t("ad.bill.ch.needDate")); return; }
    const missing = clean.filter((x) => x.text && LANGS.some((l) => !x.text[l])).length;
    if (missing && !(await confirmBox(t("ad.bill.ch.missingLang", { n: fmt(missing) }), { ok: t("ad.bill.save") }))) return;
    const btn = e.currentTarget;
    if (await act(btn, () => post("config.changes", { changes: clean }))) say(btn.parentElement, t("ad.bill.saved"));
  });

  // ---- free texts (JSON)
  $("#ab-texts", view).addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    let texts;
    try { texts = JSON.parse(f.texts.value.trim() || "{}"); } catch (err) { await alertBox(t("ad.bill.err.json")); return; }
    if (!texts || typeof texts !== "object" || Array.isArray(texts)) { await alertBox(t("ad.bill.err.json")); return; }
    if (await act($("button[type=submit]", f), () => post("config.texts", { texts }))) say(f, t("ad.bill.saved"));
  });
}
const num = (k, label, value, step, hint = "") => html`<label class="field"><span>${label}</span><input type="number" min="0" step="${step}" name="${k}" value="${value ?? ""}">${hint ? html`<small class="muted">${hint}</small>` : ""}</label>`;
const txt = (k, label, value, type = "text", ph = "") => html`<label class="field"><span>${label}</span><input type="${type}" name="${k}" value="${value ?? ""}" ${raw(ph ? `placeholder="${ph}"` : "")}></label>`;
/** A line « Enregistré » after a form, gone after a while. */
function say(where, text) {
  let p = $(".ab-said", where);
  if (!p) { p = document.createElement("p"); p.className = "ab-said ab-note"; where.append(p); }
  p.textContent = `✓ ${text}`;
  clearTimeout(p._t); p._t = setTimeout(() => p.remove(), 4000);
}

// ---- Abonnements ------------------------------------------------------------------------------------------------------------
async function drawSubs(view) {
  const { subs } = await get("subs");
  view.innerHTML = html`<p class="muted ab-lede">${t("ad.bill.sub.hint")}</p><div id="ab-subs"></div>`;
  dataTable($("#ab-subs", view), {
    rows: subs, sortKey: "updated_at", compact: true, emptyText: t("ad.bill.sub.none"),
    rowClass: (r) => (r.status === "past_due" ? "ab-fail" : ""),
    columns: [
      { key: "name", label: t("ad.bill.c.who"), sort: (r) => r.name || r.subject,
        render: (r) => (/^u\d+$/.test(r.subject) && r.name ? html`<a href="#" data-acct="${r.name}">${subjectText(r.subject, r.name)}</a>` : subjectText(r.subject, r.name)) },
      { key: "plan", label: t("ad.bill.c.plan"), sort: (r) => r.plan, render: (r) => planName(r.plan) },
      { key: "status", label: t("ad.bill.c.status"), sort: (r) => r.status, render: (r) => html`${statusName(r.status)}${r.cancel_at_end ? html`<br><span class="muted">${t("ad.bill.sub.ending")}</span>` : ""}` },
      { key: "source", label: t("ad.bill.c.source"), sort: (r) => r.source, render: (r) => t(`ad.bill.source.${r.source}`) },
      { key: "current_end", label: t("ad.bill.c.period"), sort: (r) => r.current_end, render: (r) => html`${day(r.current_start)} → ${day(r.current_end)}` },
      { key: "amount", label: t("ad.bill.c.amount"), align: "r", sort: (r) => r.amount, render: (r) => money(r.amount, r.currency) },
      { key: "first_paid_at", label: t("ad.bill.c.firstPaid"), sort: (r) => r.first_paid_at, render: (r) => day(r.first_paid_at) },
      { key: "ref", label: t("ad.bill.c.ref"), render: (r) => (r.stripe_sub ? html`<code>${r.stripe_sub}</code>` : r.invoice_id ? t("ad.bill.sub.invoice", { id: r.invoice_id }) : "—") },
      { key: "updated_at", label: t("ad.bill.c.updated"), sort: (r) => r.updated_at, render: (r) => day(r.updated_at) },
    ],
    onRender: (root) => $$("[data-acct]", root).forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      a.dispatchEvent(new CustomEvent("ab:account", { bubbles: true, detail: a.dataset.acct }));
    })),
  });
}

// ---- Accès offerts: grants, agreements, codes ------------------------------------------------------------------------------
async function drawAccess(view, redraw) {
  const all = view.dataset.all === "1";
  const [g, a, c] = await Promise.all([get("grants", all ? "&all=1" : ""), get("agreements"), get("codes")]);
  const until = (r) => (r.until ? day(r.until) : t("ad.bill.g.noEnd"));
  view.innerHTML = html`
    <section class="card ab-card-pad"><h2>${t("ad.bill.g.title")}</h2><p class="muted">${t("ad.bill.g.hint")}</p>
      <div class="ab-toolbar"><button type="button" class="btn btn-primary" id="ab-g-add">${t("ad.bill.g.add")}</button>
        <label class="check"><input type="checkbox" id="ab-g-all" ${raw(all ? "checked" : "")}><span>${t("ad.bill.g.all")}</span></label></div>
      <div id="ab-grants"></div></section>
    <section class="card ab-card-pad" style="margin-top:16px"><h2>${t("ad.bill.a.title")}</h2><p class="muted">${t("ad.bill.a.hint")}</p>
      <div class="ab-toolbar"><button type="button" class="btn btn-primary" id="ab-a-add">${t("ad.bill.a.add")}</button></div>
      <div id="ab-agreements"></div></section>
    <section class="card ab-card-pad" style="margin-top:16px"><h2>${t("ad.bill.k.title")}</h2><p class="muted">${t("ad.bill.k.hint")}</p>
      <div class="ab-toolbar"><button type="button" class="btn btn-primary" id="ab-k-add">${t("ad.bill.k.add")}</button></div>
      <div id="ab-codes"></div></section>`;

  const grantCols = (endOp) => [
    { key: "name", label: t("ad.bill.c.who"), sort: (r) => r.name || r.subject, render: (r) => subjectText(r.subject, r.name) },
    { key: "plan", label: t("ad.bill.c.plan"), sort: (r) => r.plan, render: (r) => planName(r.plan) },
    { key: "reason", label: t("ad.bill.c.reason"), sort: (r) => r.reason, render: (r) => html`${reasonName(r.reason)}${r.note ? html`<br><span class="muted">${r.note}</span>` : ""}` },
    { key: "until", label: t("ad.bill.c.until"), sort: (r) => r.until || "9999", render: until },
    { key: "created_at", label: t("ad.bill.c.since"), sort: (r) => r.created_at, render: (r) => day(r.created_at) },
    { key: "live", label: t("ad.bill.c.state"), sort: (r) => (r.live ? 1 : 0), render: (r) => pill(r.live ? true : null, r.live ? t("ad.bill.g.live") : r.ended_at ? t("ad.bill.g.ended", { d: day(r.ended_at) }) : t("ad.bill.g.past")) },
    { key: "act", label: "", align: "r", render: (r) => html`${r.reason === "event" && /^e/.test(r.subject) ? html`<button type="button" class="btn btn-sm" data-bill-event="${r.subject.slice(1)}">${t("ad.bill.i.event")}</button> ` : ""}${r.live
      ? html`<button type="button" class="btn btn-sm" data-end="${r.id}" data-op="${endOp}">${t("ad.bill.g.end")}</button>` : ""}` },
  ];
  const bindEnd = (root) => {
    $$("[data-end]", root).forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmBox(t("ad.bill.g.endQ"), { ok: t("ad.bill.g.end") }))) return;
      if (await act(b, () => post(b.dataset.op, { id: Number(b.dataset.end) }))) redraw();
    }));
    $$("[data-bill-event]", root).forEach((b) => b.addEventListener("click", () => billEvent(b, b.dataset.billEvent, redraw)));
  };
  dataTable($("#ab-grants", view), { rows: g.grants, sortKey: "created_at", compact: true, emptyText: t("ad.bill.g.none"), columns: grantCols("grant.end"), onRender: bindEnd });
  dataTable($("#ab-agreements", view), { rows: a.agreements, sortKey: "created_at", compact: true, emptyText: t("ad.bill.a.none"), columns: grantCols("agreement.end"), onRender: bindEnd });
  dataTable($("#ab-codes", view), {
    rows: c.codes, sortKey: "created_at", compact: true, emptyText: t("ad.bill.k.none"),
    columns: [
      { key: "hash", label: t("ad.bill.k.code"), render: (r) => html`<code title="${r.hash}">${r.hash.slice(0, 10)}…</code>${r.note ? html`<br><span class="muted">${r.note}</span>` : ""}` },
      { key: "plan", label: t("ad.bill.c.plan"), sort: (r) => r.plan, render: (r) => planName(r.plan) },
      { key: "days", label: t("ad.bill.k.days"), align: "r", sort: (r) => r.days, render: (r) => fmt(r.days) },
      { key: "uses", label: t("ad.bill.k.uses"), align: "r", sort: (r) => r.uses, render: (r) => `${fmt(r.uses)} / ${fmt(r.max_uses)}` },
      { key: "reason", label: t("ad.bill.c.reason"), sort: (r) => r.reason, render: (r) => reasonName(r.reason) },
      { key: "expires", label: t("ad.bill.k.expires"), sort: (r) => r.expires || "9999", render: (r) => (r.expires ? day(r.expires) : t("ad.bill.g.noEnd")) },
      { key: "created_at", label: t("ad.bill.c.since"), sort: (r) => r.created_at, render: (r) => day(r.created_at) },
      { key: "live", label: t("ad.bill.c.state"), sort: (r) => (r.live ? 1 : 0), render: (r) => pill(r.live ? true : null, r.live ? t("ad.bill.g.live") : t("ad.bill.g.past")) },
      { key: "act", label: "", align: "r", render: (r) => (r.live ? html`<button type="button" class="btn btn-sm" data-code-end="${r.hash}">${t("ad.bill.g.end")}</button>` : "") },
    ],
    onRender: (root) => $$("[data-code-end]", root).forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmBox(t("ad.bill.k.endQ"), { ok: t("ad.bill.g.end") }))) return;
      if (await act(b, () => post("code.end", { hash: b.dataset.codeEnd }))) redraw();
    })),
  });

  $("#ab-g-all", view).addEventListener("change", (e) => { view.dataset.all = e.target.checked ? "1" : ""; redraw(); });
  const plans = (g.plans || ["plus", "club", "fed-clubs", "fed-all"]).map((p) => [p, planName(p)]);
  const reasons = (g.reasons || []).map((r) => [r, reasonName(r)]);
  $("#ab-g-add", view).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const v = await formBox(t("ad.bill.g.add"), [
      { k: "subject", label: t("ad.bill.g.subject"), required: true, hint: t("ad.bill.g.subjectHint"), wide: true },
      { k: "plan", label: t("ad.bill.c.plan"), type: "select", options: plans, value: "plus" },
      { k: "reason", label: t("ad.bill.c.reason"), type: "select", options: reasons, value: "gift" },
      { k: "until", label: t("ad.bill.c.until"), type: "date", hint: t("ad.bill.g.untilHint") },
      { k: "note", label: t("ad.bill.c.note"), type: "textarea", rows: 2 },
    ], { ok: t("ad.bill.g.addOk"), check: (x) => (/^(u\d+|o\d+|e[\w-]+|f[A-Z]{2}|fo\d+)$/.test(x.subject) ? "" : t("ad.bill.g.subjectBad")) });
    if (v && await act(btn, () => post("grant.add", { subject: v.subject, plan: v.plan, reason: v.reason, until: v.until || null, note: v.note }))) redraw();
  });
  $("#ab-a-add", view).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const v = await formBox(t("ad.bill.a.add"), [
      { k: "who", label: t("ad.bill.a.who"), required: true, hint: t("ad.bill.a.whoHint"), wide: true },
      { k: "plan", label: t("ad.bill.c.plan"), type: "select", options: [["fed-clubs", planName("fed-clubs")], ["fed-all", planName("fed-all")]], value: "fed-clubs" },
      { k: "until", label: t("ad.bill.c.until"), type: "date", hint: t("ad.bill.g.untilHint") },
      { k: "note", label: t("ad.bill.c.note"), type: "textarea", rows: 2 },
      { k: "invOrg", label: t("ad.bill.a.invOrg"), type: "number", attrs: 'min="1"', hint: t("ad.bill.a.invOrgHint") },
      { k: "lines", label: t("ad.bill.i.lines"), type: "textarea", rows: 3, hint: t("ad.bill.i.linesHint"), attrs: 'placeholder="Convention 2027 ; 1 ; 3000"' },
      { k: "mail", label: t("ad.bill.a.mail"), type: "check", value: false },
    ], { ok: t("ad.bill.a.addOk"), wide: true, check: (x) => (/^\d+$/.test(x.who) || /^[A-Za-z]{2}$/.test(x.who) ? (x.invOrg && !parseLines(x.lines) ? t("ad.bill.err.lines") : "") : t("ad.bill.a.whoBad")) });
    if (!v) return;
    const body = { plan: v.plan, until: v.until || null, note: v.note, mail: v.mail };
    if (/^\d+$/.test(v.who)) body.org = Number(v.who); else body.cc = v.who.toUpperCase();
    if (v.invOrg) body.invoice = { org: Number(v.invOrg), lines: parseLines(v.lines) };
    await act(btn, async () => {
      const r = await post("agreement.add", body);
      const parts = [t("ad.bill.a.done", { subject: r.subject })];
      if (r.invoice) parts.push(t("ad.bill.i.issued", { number: r.invoice.number, total: money(r.invoice.total, r.invoice.currency) }));
      if (r.invoiceError) parts.push(errorText({ message: r.invoiceError }));
      if (r.mailed) parts.push(t("ad.bill.mailed", { n: fmt(r.mailed) }));
      await alertBox(parts.join("\n"));
      redraw();
    });
  });
  $("#ab-k-add", view).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const v = await formBox(t("ad.bill.k.add"), [
      { k: "days", label: t("ad.bill.k.days"), type: "number", value: 365, attrs: 'min="1" max="3660"', required: true },
      { k: "maxUses", label: t("ad.bill.k.maxUses"), type: "number", value: 1, attrs: 'min="1" max="100000"', required: true },
      { k: "expires", label: t("ad.bill.k.expires"), type: "date", hint: t("ad.bill.g.untilHint") },
      { k: "reason", label: t("ad.bill.c.reason"), type: "select", options: ["gift", "founder", "pilot", "staff"].map((r) => [r, reasonName(r)]), value: "gift" },
      { k: "note", label: t("ad.bill.c.note"), type: "textarea", rows: 2 },
    ], { ok: t("ad.bill.k.addOk"), intro: t("ad.bill.k.plusOnly") });
    if (!v) return;
    await act(btn, async () => {
      const r = await post("code.make", { plan: "plus", days: Number(v.days), maxUses: Number(v.maxUses), expires: v.expires || null, reason: v.reason, note: v.note });
      await onceBox(t("ad.bill.k.made"), r.code, t("ad.bill.k.once"));
      redraw();
    });
  });
}

/** Free invoice lines typed one a line: « label ; quantity ; unit price in euros » (the quantity may be left out). null when none or one is wrong. */
function parseLines(text) {
  const out = [];
  for (const ln of String(text || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
    const p = ln.split(";").map((x) => x.trim());
    const label = p[0], qty = p.length >= 3 ? Number(p[1].replace(",", ".")) : 1, unit = toCents(p.length >= 3 ? p[2] : p[1]);
    if (!label || !(qty > 0) || unit === null || Number.isNaN(unit)) return null;
    out.push({ label, qty, unit });
  }
  return out.length ? out : null;
}

/** « Facturer » an event bought by the unit. */
async function billEvent(btn, eventId, redraw) {
  const v = eventId ? { event: eventId, mail: false } : await formBox(t("ad.bill.i.event"), [
    { k: "event", label: t("ad.bill.i.eventId"), required: true, hint: t("ad.bill.i.eventHint") },
    { k: "mail", label: t("ad.bill.i.mail"), type: "check", value: false },
  ], { ok: t("ad.bill.i.eventOk") });
  if (!v) return;
  if (eventId && !(await confirmBox(t("ad.bill.i.eventQ", { id: eventId }), { ok: t("ad.bill.i.eventOk") }))) return;
  try {
    btn && (btn.disabled = true);
    const r = await post("invoice.event", { event: String(v.event), mail: !!v.mail });
    await alertBox([t("ad.bill.i.issued", { number: r.invoice.number, total: money(r.invoice.total, r.invoice.currency) }), r.mailed ? t("ad.bill.mailed", { n: fmt(r.mailed) }) : ""].filter(Boolean).join("\n"));
    redraw();
  } catch (e) {
    await alertBox(e?.status === 409 && e.body?.invoice ? t("ad.bill.i.exists", { number: e.body.invoice.number || `#${e.body.invoice.id}` }) : errorText(e));
  } finally { if (btn?.isConnected) btn.disabled = false; }
}

// ---- Factures ---------------------------------------------------------------------------------------------------------------
async function drawInvoices(view, redraw) {
  const f = { status: view.dataset.status || "", kind: view.dataset.kind || "" };
  const [{ invoices }, clubs] = await Promise.all([get("invoices", `${f.status ? `&status=${f.status}` : ""}${f.kind ? `&kind=${f.kind}` : ""}`), knownClubs()]);
  const pdf = typeof offers.invoicePdf === "function";
  view.innerHTML = html`<div class="ab-toolbar">
      <label class="field"><span>${t("ad.bill.c.status")}</span><select id="ab-i-status"><option value="">${t("ad.bill.i.all")}</option>${["issued", "paid", "cancelled", "draft"].map((s) => html`<option value="${s}" ${raw(f.status === s ? "selected" : "")}>${statusName(s)}</option>`)}</select></label>
      <label class="field"><span>${t("ad.bill.c.kind")}</span><select id="ab-i-kind"><option value="">${t("ad.bill.i.all")}</option>${["invoice", "credit", "quote"].map((k) => html`<option value="${k}" ${raw(f.kind === k ? "selected" : "")}>${kindName(k)}</option>`)}</select></label>
      <span class="ab-spacer"></span>
      <button type="button" class="btn" id="ab-i-event">${t("ad.bill.i.event")}</button>
      <button type="button" class="btn btn-primary" id="ab-i-new">${t("ad.bill.i.new")}</button></div>
    <p class="muted ab-lede">${t("ad.bill.i.hint")}${pdf ? "" : ` ${t("ad.bill.i.noPdf")}`}</p>
    <div id="ab-invoices"></div>
    <datalist id="ab-clubs">${clubs.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</datalist>`;
  const late = (r) => r.kind === "invoice" && r.status === "issued" && r.due_at && r.due_at < today();
  dataTable($("#ab-invoices", view), {
    rows: invoices, sortKey: "id", compact: true, emptyText: t("ad.bill.i.none"),
    rowClass: (r) => (late(r) ? "ab-fail" : ""),
    columns: [
      { key: "id", label: t("ad.bill.c.number"), sort: (r) => r.id, render: (r) => html`<b>${r.number || `#${r.id}`}</b><br><span class="muted">${kindName(r.kind)}${r.of_invoice ? ` · ${t("ad.bill.i.of", { id: r.of_invoice })}` : ""}</span>` },
      { key: "buyer", label: t("ad.bill.c.buyer"), sort: (r) => r.org || r.buyer, render: (r) => html`${r.org || r.buyer || subjectText(r.subject)}${r.label ? html`<br><span class="muted">${r.label}</span>` : ""}` },
      { key: "total", label: t("ad.bill.c.total"), align: "r", sort: (r) => r.total, render: (r) => money(r.total, r.currency) },
      { key: "status", label: t("ad.bill.c.status"), sort: (r) => r.status, render: (r) => html`${pill(r.status === "paid" ? true : late(r) ? false : null, statusName(r.status))}${late(r) ? html`<br><span class="muted">${t("ad.bill.i.late")}</span>` : ""}` },
      { key: "issued_at", label: t("ad.bill.c.issued"), sort: (r) => r.issued_at, render: (r) => day(r.issued_at) },
      { key: "due_at", label: t("ad.bill.c.due"), sort: (r) => r.due_at, render: (r) => day(r.due_at) },
      { key: "paid_at", label: t("ad.bill.c.paid"), sort: (r) => r.paid_at, render: (r) => (r.paid_at ? html`${day(r.paid_at)}${r.paid_how ? html`<br><span class="muted">${has(`ad.bill.how.${r.paid_how}`) ? t(`ad.bill.how.${r.paid_how}`) : r.paid_how}</span>` : ""}` : "—") },
      { key: "act", label: "", align: "r", render: (r) => html`<div class="ab-actions">
        ${r.kind === "invoice" && r.status === "issued" ? html`<button type="button" class="btn btn-sm btn-primary" data-inv="paid" data-id="${r.id}">${t("ad.bill.i.markPaid")}</button>` : ""}
        ${r.kind === "invoice" && r.status === "paid" ? html`<button type="button" class="btn btn-sm" data-inv="unpaid" data-id="${r.id}">${t("ad.bill.i.markUnpaid")}</button>` : ""}
        ${r.kind === "invoice" && ["issued", "paid"].includes(r.status) ? html`<button type="button" class="btn btn-sm" data-inv="credit" data-id="${r.id}">${t("ad.bill.i.credit")}</button>` : ""}
        <button type="button" class="btn btn-sm" data-inv="pdf" data-id="${r.id}" ${raw(pdf ? "" : "hidden")}>PDF</button></div>` },
    ],
    onRender: (root) => $$("[data-inv]", root).forEach((b) => b.addEventListener("click", () => invoiceAction(b, b.dataset.inv, Number(b.dataset.id), redraw))),
  });
  $("#ab-i-status", view).addEventListener("change", (e) => { view.dataset.status = e.target.value; redraw(); });
  $("#ab-i-kind", view).addEventListener("change", (e) => { view.dataset.kind = e.target.value; redraw(); });
  $("#ab-i-event", view).addEventListener("click", (e) => billEvent(e.currentTarget, "", redraw));
  $("#ab-i-new", view).addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const v = await formBox(t("ad.bill.i.new"), [
      { k: "org", label: t("ad.bill.i.org"), type: "number", required: true, attrs: 'min="1" list="ab-clubs"', hint: t("ad.bill.i.orgHint") },
      { k: "lines", label: t("ad.bill.i.lines"), type: "textarea", rows: 4, hint: t("ad.bill.i.linesHint"), attrs: 'placeholder="Ozimut Club 2027 ; 1 ; 120"' },
      { k: "club", label: t("ad.bill.i.isClub"), type: "check", value: false },
      { k: "periodFrom", label: t("ad.bill.i.from"), type: "date" },
      { k: "periodTo", label: t("ad.bill.i.to"), type: "date" },
      { k: "trust", label: t("ad.bill.i.trust"), type: "check", value: false },
      { k: "note", label: t("ad.bill.c.note"), type: "textarea", rows: 2 },
      { k: "mail", label: t("ad.bill.i.mail"), type: "check", value: false },
    ], { ok: t("ad.bill.i.issueOk"), wide: true, intro: t("ad.bill.i.issueIntro"), check: (x) => (parseLines(x.lines) ? "" : t("ad.bill.err.lines")) });
    if (!v) return;
    const lines = parseLines(v.lines), total = lines.reduce((a, l) => a + Math.round(l.qty * l.unit), 0);
    const club = clubs.find((o) => String(o.id) === v.org);
    if (!(await confirmBox(t("ad.bill.i.issueQ", { org: club ? `${club.name} (${v.org})` : `#${v.org}`, total: money(total) }), { ok: t("ad.bill.i.issueOk") }))) return;
    await act(btn, async () => {
      const body = { org: Number(v.org), lines, note: v.note, mail: v.mail };
      if (v.club) Object.assign(body, { plan: "club", trust: v.trust, periodFrom: v.periodFrom || undefined, periodTo: v.periodTo || undefined });
      const r = await post("invoice.issue", body);
      await alertBox([t("ad.bill.i.issued", { number: r.invoice.number, total: money(r.invoice.total, r.invoice.currency) }), r.mailed ? t("ad.bill.mailed", { n: fmt(r.mailed) }) : ""].filter(Boolean).join("\n"));
      redraw();
    });
  });
}
/** The clubs managed on Ozimut (the « Clubs » tab's list), to name the org of an invoice; [] when it cannot be read. */
async function knownClubs() {
  try {
    const r = await fetch("api/orgs/pending", { credentials: "same-origin", cache: "no-store" });
    const j = r.ok ? await r.json() : {};
    return (j.clubs || []).map((o) => ({ id: o.id, name: o.name })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (e) { return []; }
}
async function invoiceAction(btn, op, id, redraw) {
  if (op === "pdf") {
    await act(btn, async () => { const { invoice } = await get("invoice", `&id=${id}`); await offers.invoicePdf(invoice); });
    return;
  }
  if (op === "paid") {
    const v = await formBox(t("ad.bill.i.markPaid"), [
      { k: "at", label: t("ad.bill.i.paidOn"), type: "date", value: today(), required: true },
      { k: "how", label: t("ad.bill.i.how"), type: "select", options: ["transfer", "cheque", "cash", "card", "other"].map((h) => [h, t(`ad.bill.how.${h}`)]), value: "transfer" },
      { k: "mail", label: t("ad.bill.i.paidMail"), type: "check", value: true },
    ], { ok: t("ad.bill.i.markPaid") });
    if (v && await act(btn, () => post("invoice.paid", { id, at: v.at, how: v.how, mail: v.mail }))) redraw();
    return;
  }
  if (op === "unpaid") {
    if (await confirmBox(t("ad.bill.i.unpaidQ"), { ok: t("ad.bill.i.markUnpaid") }) && await act(btn, () => post("invoice.unpaid", { id }))) redraw();
    return;
  }
  if (op === "credit") {
    const v = await formBox(t("ad.bill.i.credit"), [{ k: "note", label: t("ad.bill.c.note"), type: "textarea", rows: 2 }], { ok: t("ad.bill.i.creditOk"), intro: t("ad.bill.i.creditIntro") });
    if (!v) return;
    await act(btn, async () => {
      const r = await post("invoice.credit", { id, note: v.note });
      await alertBox(t("ad.bill.i.credited", { number: r.credit?.number || "—" }));
      redraw();
    });
  }
}

// ---- Événements Stripe ------------------------------------------------------------------------------------------------------
async function drawEvents(view, redraw) {
  const { events } = await get("events");
  const fails = events.filter((e) => !e.ok).length;
  view.innerHTML = html`<div class="ab-toolbar"><p class="muted ab-lede" style="margin:0">${t("ad.bill.e.hint")}${fails ? ` ${t("ad.bill.e.fails", { n: fmt(fails) })}` : ""}</p>
      <span class="ab-spacer"></span><button type="button" class="btn btn-primary" id="ab-check">${t("ad.bill.e.check")}</button></div>
    <div id="ab-check-out"></div><div id="ab-events"></div>`;
  dataTable($("#ab-events", view), {
    rows: events, sortKey: "ok", sortDir: 1, compact: true, emptyText: t("ad.bill.e.none"),
    rowClass: (r) => (r.ok ? "" : "ab-fail"),
    columns: [
      { key: "ok", label: t("ad.bill.c.state"), sort: (r) => (r.ok ? 1 : 0), render: (r) => pill(r.ok ? true : false, r.ok ? t("ad.bill.e.ok") : t("ad.bill.e.failed")) },
      { key: "at", label: t("ad.bill.c.at"), sort: (r) => r.at, render: (r) => (r.at ? html`${day(r.at)} <span class="muted">${String(r.at).slice(11, 16)}</span>` : "—") },
      { key: "type", label: t("ad.bill.c.type"), sort: (r) => r.type, render: (r) => html`<code>${r.type}</code>` },
      { key: "event_id", label: t("ad.bill.c.event"), render: (r) => html`<code>${r.event_id}</code>${r.ref ? html`<br><span class="muted">${r.ref}</span>` : ""}` },
      { key: "note", label: t("ad.bill.c.note"), render: (r) => r.note || "" },
      { key: "act", label: "", align: "r", render: (r) => html`<button type="button" class="btn btn-sm" data-replay="${r.event_id}">${t("ad.bill.e.replay")}</button>` },
    ],
    onRender: (root) => $$("[data-replay]", root).forEach((b) => b.addEventListener("click", () => act(b, async () => {
      const r = await post("event.replay", { id: b.dataset.replay });
      await alertBox(`${r.ok ? t("ad.bill.e.replayed") : t("ad.bill.e.replayFailed")}${r.note ? `\n${r.note}` : ""}`);
      redraw();
    }))),
  });
  $("#ab-check", view).addEventListener("click", (e) => act(e.currentTarget, async () => {
    const out = $("#ab-check-out", view);
    out.innerHTML = waitHtml();
    try {
      const r = await post("check");
      const n = (x) => (Array.isArray(x) ? x.length : Number(x) || 0);
      out.innerHTML = html`<div class="notice ab-out">${t("ad.bill.e.checked", { repaired: fmt(n(r.repaired)), closed: fmt(n(r.closed)), trials: fmt(n(r.trialNotices)), renewals: fmt(n(r.renewalNotices)), reminders: fmt(n(r.invoiceReminders ?? r.reminders)) })}${
        Array.isArray(r.repaired) && r.repaired.length ? html`<br><code>${r.repaired.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n")}</code>` : ""}</div>`;
    } catch (err) { out.innerHTML = ""; throw err; }
  }));
}
