// Administration (the administrator only), in tabs. « Comptes »: every account, duplicates by licence
// flagged, rights, disable / re-enable / delete, and the administrator's own e-mail at each new account.
// « Inscrits » (2026-10-15): the registered and active accounts (a visit in the last 21 days), today and day by day.
// « Utilisation »: how much the site is used over any period — visits, page views, active days, per account
// and per page. « Démo » (2026-10-18): the demo accounts — read-only, tied to no licence, for a set time — made for a
// federation, a league or a club that wants to see the site. The server enforces the role; this page only reads and acts.

import { html, raw, $, $$, normalise, fmt, fmtDate, pctN } from "../util.js";
import { t, LANGS, LANG_NAMES, locale, loadArea } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import { tile, seg, chartCard, bindChartCard, legend, setLede } from "../ui.js";
import { columnChart, timeChart, css } from "../charts.js";
import { link, replaceQuery } from "../app.js";
import { draw as drawPerf } from "./adminperf.js";

const PRESETS = ["7", "30", "90", "365", "all"];
const isoDay = (d) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });     // YYYY-MM-DD, Paris
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ACTIVE_DAYS = 21;         // « active »: used the site at least once in the last 21 days (owner, 2026-10-15)
const parisDay = (iso) => isoDay(new Date(iso));
const spanDays = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3) + 1;

/** The label of a page counted by api/track. */
function pageName(k) {
  const NAMES = { overview: "nav.overview", ranking: "nav.ranking", runner: "nav.runner", compare: "nav.compare", clubs: "nav.clubs",
    club: "ad.pg.club", clubcompare: "ad.pg.clubcompare", courses: "nav.courses", agenda: "nav.agenda", methods: "nav.methods",
    settings: "st.link", contact: "ct.title", admin: "ad.title", provisional: "prov.title", splits: "spl.title",
    deposit: "dep.title", live: "lv.title", relays: "rl.title", analysis: "nav.analysis.long", games: "nav.games", vma: "nav.vma",
    analysisPerso: "nav.analysisPerso.long", analysisClub: "nav.analysisClub.long", analysisRace: "nav.analysisRace.long", mapAnalysis: "nav.mapAnalysis", myMaps: "nav.myMaps", analysisOrga: "an.orga.title",
    orgAnalyses: "nav.orgAnalyses", orgRace: "nav.orgAnalyses", orgTraining: "nav.orgAnalyses", orgResults: "or.title", orgStarts: "os.title", orgDirect: "nav.orgDirect", orgManage: "nav.orgManage", ask: "nav.ask", orgTracer: "nav.orgTracer", orgMapper: "nav.orgMapper", categories: "cg.title", relayHistory: "rh.title", needCountry: "cty.need.title",
    descriptions: "nav.descriptions", mapkey: "nav.mapkey", learn: "nav.learn", nutrition: "nav.nutrition", nutritionWrite: "nav.nutritionWrite", hub: "mod.pick", modtiles: "ad.modtiles" };
  if (k.startsWith("network:")) {
    const v = k.slice(8);
    return v === "ego" || v === "leaders" ? t(`nw.mode.${v}`) : `${t("nav.network")} · ${t(`nw.mode.${v}`)}`;
  }
  return NAMES[k] ? t(NAMES[k]) : k;
}

export async function render(main, { query = {} } = {}) {
  const r = await fetch("api/admin/users", { credentials: "same-origin", cache: "no-store" });
  if (r.status === 401) { window.dispatchEvent(new Event("cnx:unauthorised")); return null; }
  if (!r.ok) {
    main.innerHTML = html`<div class="notice">${t("ad.forbidden")}</div>`;
    return { title: t("ad.title") };
  }
  let { users, duplicates, queued, me } = await r.json();
  let tab = { inscrits: "members", utilisation: "usage", consommation: "conso", depots: "uploads", sites: "sites", anonymises: "anon", demo: "demo", cartes: "mymaps", evenements: "events", vitesse: "perf" }[query.onglet] || "accounts";
  await loadArea("manage");          // « Événements » (Orga › Gérer, 2026-11-11): its texts are the page's

  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("ad.title")}</h1><p class="lede" id="page-lede"></p></div>
      <div class="row" style="gap:8px"><div id="ad-tabs"></div></div></div>
    <div data-panel="accounts" hidden>
      <div class="tiles tiles-compact" id="ad-tiles" style="margin-bottom:14px"></div>
      <div class="filters">
        <label class="field"><span>${t("ad.search")}</span><input type="search" id="ad-q" style="width:260px"></label>
        <label class="check" style="align-self:flex-end;height:34px;align-items:center"><input type="checkbox" id="ad-dups"><span>${t("ad.onlyDups")}</span></label>
        <label class="check" style="align-self:flex-end;height:34px;align-items:center;margin-left:auto"><input type="checkbox" id="ad-signup"
          ${raw(me?.signupAlert ? "checked" : "")}><span>${t("ad.signupAlert")}</span></label>
      </div>
      <section class="card"><div class="table-wrap" id="ad-table"></div></section>
    </div>
    <div data-panel="members" hidden>
      <div class="filters"><label class="check" style="height:34px;align-items:center"><input type="checkbox" id="m-noadmins" checked>
        <span>${t("ad.u.noAdmins")}</span></label></div>
      <div class="tiles" id="m-tiles" style="margin-bottom:16px"></div>
      ${chartCard({ id: "m-chart", title: t("ad.m.chart"), hint: t("ad.m.chart.hint", { n: ACTIVE_DAYS }) })}
      <p class="muted" id="m-note" style="font-size:12.5px;margin:10px 2px 0"></p>
    </div>
    <div data-panel="usage" hidden>
      <div class="filters" id="u-filters"></div>
      <div class="tiles" id="u-tiles" style="margin-bottom:16px"></div>
      ${chartCard({ id: "u-chart", title: t("ad.u.chart"), hint: t("ad.u.chart.hint"), short: true })}
      <div class="grid grid-main-side" style="margin-top:16px;align-items:start">
        <section class="card"><div class="card-head"><div><h2>${t("ad.u.byUser")}</h2><div class="hint">${t("ad.u.byUser.hint")}</div></div></div>
          <div class="table-wrap" id="u-users"></div></section>
        <section class="card"><div class="card-head"><h2>${t("ad.u.byPage")}</h2></div><div class="table-wrap" id="u-pages"></div></section>
      </div>
      <p class="muted" style="font-size:12.5px;margin:10px 2px 0">${t("ad.u.sortHint")}</p>
      <p class="muted" style="font-size:12.5px;margin:6px 2px 0">${t("ad.u.def")}</p>
    </div>
    <div data-panel="sites" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.st.lede")}</p>
      <section class="card"><div class="table-wrap" id="st-list"></div></section>
    </div>
    <div data-panel="anon" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.an.lede")}</p>
      <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${t("ad.an.add")}</h2></div>
        <div class="card-body">
          <div class="filters" style="margin:0 0 10px;padding:0;border:0;background:none">
            <label class="field"><span>${t("ad.an.search")}</span><input type="search" id="an-q" style="width:260px" autocomplete="off"></label>
            <label class="field"><span>${t("ad.an.note")}</span><input type="text" id="an-note" maxlength="200" style="width:300px"></label>
          </div>
          <div id="an-found"></div>
          <p class="muted" id="an-msg" style="font-size:12.5px;margin:8px 0 0"></p>
        </div></section>
      <section class="card"><div class="card-head"><h2 id="an-title">${t("ad.an.list")}</h2></div><div class="table-wrap" id="an-list"></div></section>
    </div>
    <div data-panel="demo" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.dm.lede")}</p>
      <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${t("ad.dm.new")}</h2></div>
        <div class="card-body">
          <form id="dm-form" class="filters" style="margin:0;padding:0;border:0;background:none;align-items:flex-end">
            <label class="field"><span>${t("ad.dm.label")}</span><input id="dm-label" required maxlength="80" style="width:240px"
              placeholder="${t("ad.dm.label.ph")}"></label>
            <label class="field"><span>${t("ad.dm.email")}</span><input id="dm-email" type="email" maxlength="120" style="width:240px"
              placeholder="${t("ad.dm.email.ph")}"></label>
            <label class="field"><span>${t("ad.dm.days")}</span><input id="dm-days" type="number" min="1" max="365" value="30" style="width:90px"></label>
            <label class="field"><span>${t("st.lang")}</span><select id="dm-lang">${LANGS.map((l) => html`<option value="${l}">${LANG_NAMES[l]}</option>`)}</select></label>
            <button class="btn btn-primary" type="submit">${t("ad.dm.create")}</button>
          </form>
          <div id="dm-made" style="margin-top:12px"></div>
        </div></section>
      <section class="card"><div class="card-head"><h2>${t("ad.dm.list")}</h2></div><div class="table-wrap" id="dm-list"></div></section>
    </div>
    <div data-panel="mymaps" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.mm.lede")} <a href="#/mes-cartes?vue=toutes">${t("ad.mm.open")}</a></p>
      <div class="tiles" id="mm-tiles"></div>
      <section class="card"><div class="table-wrap" id="mm-users"><div class="empty">${t("misc.loading")}</div></div></section>
    </div>
    <div data-panel="events" hidden>
      <section class="card"><div class="card-head"><div><h2>${t("mg.ad.pending")}</h2><div class="hint">${t("mg.ad.pending.hint")}</div></div></div>
        <div class="table-wrap" id="ev-pending"><div class="empty">${t("misc.loading")}</div></div></section>
      <section class="card"><div class="card-body"><h2 style="margin:0 0 6px">${t("mg.ad.migrate")}</h2>
        <p class="muted" style="margin:0 0 10px">${t("mg.ad.migrate.hint")}</p>
        <button type="button" class="btn" id="ev-migrate">${t("mg.ad.migrate.go")}</button> <span class="muted" id="ev-migrate-out"></span></div></section>
    </div>
    <div data-panel="uploads" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.up.lede")}</p>
      <section class="card"><div class="table-wrap" id="up-list"></div></section>
    </div>
    <div data-panel="perf" hidden><div id="pf-body"></div></div>
    <div data-panel="conso" hidden>
      <p class="muted" style="margin:0 2px 12px">${t("ad.co.lede")}</p>
      <div id="co-note"></div>
      <section class="card"><div class="table-wrap" id="co-list"><div class="empty">${t("misc.loading")}</div></div></section>
      <section class="card"><div class="card-body">
        <h2 style="margin:0 0 6px">${t("ad.mt.title")}</h2>
        <p class="muted" style="margin:0 0 10px">${t("ad.mt.lede")}</p>
        <form id="mt-form" style="display:grid;gap:8px;max-width:680px;margin-bottom:10px" onsubmit="return false">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label class="field" style="flex:1 1 220px"><span>${t("ad.mt.from")}</span><input id="mt-from" type="email" maxlength="120" required></label>
            <label class="field" style="flex:1 1 220px"><span>${t("ad.mt.to")}</span><input id="mt-to" type="email" maxlength="120" required></label></div>
          <label class="field"><span>${t("ad.mt.subject")}</span><input id="mt-subject" type="text" maxlength="200" minlength="10" required></label>
          <label class="field"><span>${t("ad.mt.text")}</span><textarea id="mt-text" rows="7" maxlength="5000" required
            style="padding:8px 10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--ink);font:inherit;font-size:14px;resize:vertical"></textarea></label>
        </form>
        <div class="mt-btns" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" type="button" data-mail-test="resend">${t("ad.mt.resend")}</button>
          <button class="btn" type="button" data-mail-test="tem">${t("ad.mt.tem")}</button>
          <button class="btn btn-ghost" type="button" id="mt-reset">${t("ad.mt.reset")}</button></div>
        <div id="mt-out" style="margin-top:10px"></div></div></section>
      <section class="card rb-card"><div class="card-body">
        <div class="rb-head"><h2>${t("ad.rb.title")}</h2>
          <label class="field rb-period"><span>${t("ad.rb.period")}</span><select id="rb-days">${[30, 90, 365].map((n) => html`<option value="${n}">${t("ad.rb.days", { n })}</option>`)}</select></label></div>
        <p class="muted rb-lede">${t("ad.rb.lede")}</p>
        <div id="rb-body"><div class="empty">${t("misc.loading")}</div></div></div></section>
    </div>`;

  function showTab() {
    $("#ad-tabs").innerHTML = seg("adtab", [["accounts", t("ad.tab.accounts")], ["members", t("ad.tab.members")], ["usage", t("ad.tab.usage")], ["conso", t("ad.tab.conso")], ["uploads", t("ad.tab.uploads")],
      ["sites", t("ad.tab.sites")], ["anon", t("ad.tab.anon")], ["demo", t("ad.tab.demo")], ["mymaps", t("ad.tab.mymaps")], ["events", t("mg.ad.tab")], ["perf", t("ad.tab.perf")]], tab);
    $$('[data-seg="adtab"]').forEach((b) => b.addEventListener("click", () => { tab = b.dataset.value; showTab(); }));
    $$("[data-panel]", main).forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    setLede(t(`ad.lede.${tab}`));       // the head says what the tab shows (one line: the tabs' own paragraphs say more)
    if (tab === "usage") saveUsage(); else replaceQuery({ members: { onglet: "inscrits" }, conso: { onglet: "consommation" }, uploads: { onglet: "depots" }, sites: { onglet: "sites" }, anon: { onglet: "anonymises" }, demo: { onglet: "demo" }, mymaps: { onglet: "cartes" }, events: { onglet: "evenements" }, perf: { onglet: "vitesse" } }[tab] || {});   // the address keeps the usage filters
    if (tab === "usage" && !usageStarted) { usageStarted = true; startUsage(); }
    if (tab === "members") drawMembers();
    if (tab === "uploads") drawUploads();
    if (tab === "sites") drawSites();
    if (tab === "anon") drawAnon();
    if (tab === "demo") drawDemo();
    if (tab === "conso") drawConso();
    if (tab === "perf" && !$("#pf-body").firstChild) drawPerf($("#pf-body"));     // how fast the site is (adminperf.js)
    if (tab === "mymaps") drawMymaps();
    if (tab === "events") drawEvents();
  }

  // « Consommation » (owner, 2026-10-20): the site's use of its free plans, each measure against its limit, the last 30 days
  // drawn as bars under a dashed line at the limit (functions/api/admin/consumption.js)
  const bytes = (n) => (n >= 1024 ** 3 ? `${fmt(n / 1024 ** 3, 2)} ${t("ad.co.gb")}` : `${fmt(n / 1024 ** 2, 1)} ${t("ad.co.mb")}`);
  function spark(values, limit) {
    const w = 150, h = 34, max = Math.max(limit || 0, ...values, 1), bw = w / values.length;
    const y = (v) => h - (v / max) * (h - 2);
    return html`<svg class="co-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      ${values.map((v, i) => raw(`<rect x="${(i * bw + 0.5).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(h - y(v)).toFixed(1)}" fill="${limit && v >= limit * 0.8 ? "var(--bad)" : "var(--accent)"}" opacity=".75"></rect>`))}
      ${limit ? raw(`<line x1="0" x2="${w}" y1="${y(limit).toFixed(1)}" y2="${y(limit).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="3 3"></line>`) : ""}</svg>`;
  }
  const level = (v, limit) => {
    if (!limit) return "";
    const p = (100 * v) / limit;
    return html`<span class="co-pct" style="color:${raw(p >= 100 ? "var(--bad)" : p >= 80 ? "var(--warn, #c77700)" : "var(--good)")}">${pctN(p, p < 10 ? 1 : 0)}</span>`;
  };
  // « Essai d'envoi » (owner, 2026-11-03): one e-mail through Resend or Scaleway, whatever the quotas — to check a provider's
  // key and domain (functions/api/admin/mailtest.js). The form starts with the site's sender, one's own address and a generic
  // test e-mail in one's language, all of which may be changed (the sender within the site's domain)
  let mtDefaults = null;
  const mtFill = (d) => { $("#mt-from").value = d.from || ""; $("#mt-to").value = d.to || ""; $("#mt-subject").value = d.subject || ""; $("#mt-text").value = d.text || ""; };
  (async () => {
    const r = await fetch("api/admin/mailtest", { credentials: "same-origin", cache: "no-store" });
    if (r.ok) { mtDefaults = await r.json(); mtFill(mtDefaults); }
  })();
  $("#mt-reset").addEventListener("click", () => { if (mtDefaults) mtFill(mtDefaults); $("#mt-out").innerHTML = ""; });
  $$("[data-mail-test]", main).forEach((b) => b.addEventListener("click", async () => {
    const out = $("#mt-out"), name = t(`ad.mt.name.${b.dataset.mailTest}`);
    if (!$("#mt-form").reportValidity()) return;
    $$("[data-mail-test]", main).forEach((x) => { x.disabled = true; });
    out.innerHTML = html`<span class="muted">${t("ad.mt.sending", { name })}</span>`;
    const res = await auth.api("api/admin/mailtest", { provider: b.dataset.mailTest, from: $("#mt-from").value,
      to: $("#mt-to").value, subject: $("#mt-subject").value, text: $("#mt-text").value });
    $$("[data-mail-test]", main).forEach((x) => { x.disabled = false; });
    const d = res.data || {};
    if (res.ok && d.ok) {
      out.innerHTML = html`<div class="notice ok">${t("ad.mt.sent", { name, to: d.to })}</div>`;
      consoLoaded = false;          // the counts include it
      drawConso();
    } else {
      const why = res.status === 429 ? t("ad.mt.rate") : d.error === "from" ? t("ad.mt.badFrom", { domain: d.domain })
        : d.error === "to" ? t("ad.mt.badTo") : d.error === "subject" ? t("ad.mt.shortSubject") : d.error === "text" ? t("ad.mt.noText")
        : d.detail === "missing" ? t("ad.mt.missing", { name }) : d.detail ? t("ad.mt.refused", { name, e: d.detail }) : t("err.load");
      out.innerHTML = html`<div class="notice">${why}</div>`;
    }
  }));

  let consoLoaded = false;
  async function drawConso() {
    if (consoLoaded) return;
    consoLoaded = true;
    const r = await fetch("api/admin/consumption", { credentials: "same-origin", cache: "no-store" });
    const d = r.ok ? await r.json() : null;
    if (!d) { $("#co-list").innerHTML = html`<div class="empty">${t("err.load")}</div>`; consoLoaded = false; return; }
    const L = d.limits, cf = d.cloudflare || {}, lastOf = (a) => (Array.isArray(a) ? a[a.length - 1] : null);
    const rows = [];
    const row = (key, value, limit, { daily = null, fmtv = fmt, note = "", error = null, dayLimit = limit } = {}) =>
      rows.push({ key, value, limit, daily, fmtv, note, error, dayLimit });
    row("mail", lastOf(d.mail.daily), d.mail.dayLimit, { daily: d.mail.daily,
      note: t("ad.co.mail.note", { month: fmt(d.mail.month), monthLimit: fmt(d.mail.monthLimit), queued: fmt(d.mail.queued) }) });
    // Scaleway TEM, beyond Resend's free plan: this month's count against the site's own cap (TEM_MONTHLY_LIMIT)
    const tem = d.mail.tem;
    if (tem) row("mailTem", tem.month, tem.monthLimit, { daily: tem.daily, dayLimit: null,
      note: tem.on ? t("ad.co.mailTem.note", { cost: fmt(Math.max(0, tem.month - 300) * 0.25 / 1000, 2) }) : t("ad.co.mailTem.off") });
    const cfRow = (key, v, limit, opts = {}) => (v?.error ? row(key, null, limit, { error: v.error }) : row(key, opts.value ? opts.value(v) : lastOf(v), limit, { daily: Array.isArray(v) ? v : null, ...opts }));
    if (!cf.error) {
      cfRow("requests", cf.requests, L.requests, { note: cf.requestsNote ? t("ad.co.partial", { e: cf.requestsNote }) : "" });
      cfRow("durable", cf.durable, L.durable);
      cfRow("neurons", cf.neurons, L.neurons);
      if (cf.d1?.error) row("d1Read", null, L.d1Read, { error: cf.d1.error });
      else { cfRow("d1Read", cf.d1.read, L.d1Read); cfRow("d1Write", cf.d1.written, L.d1Write); }
      if (cf.d1size?.error) row("d1Size", null, L.d1Size, { error: cf.d1size.error });
      else for (const db of cf.d1size) row("d1Size", db.bytes, L.d1Size, { fmtv: bytes, note: db.name });
      cfRow("r2Size", cf.r2size, L.r2Size, { fmtv: bytes });
      if (cf.r2ops?.error) row("r2A", null, L.r2A, { error: cf.r2ops.error });
      else { row("r2A", cf.r2ops.a, L.r2A, { note: t("ad.co.thisMonth") }); row("r2B", cf.r2ops.b, L.r2B, { note: t("ad.co.thisMonth") }); }
      if (cf.deploys?.error) row("deploys", null, L.deploys, { error: cf.deploys });
      else row("deploys", cf.deploys, L.deploys, { note: t("ad.co.thisMonth") });
    }
    row("accounts", d.accounts.confirmed, null, { note: t("ad.co.accounts.note", { n: fmt(d.accounts.recent) }) });
    $("#co-note").innerHTML = cf.error ? html`<div class="notice info" style="margin-bottom:12px">${t(cf.error === "no token" ? "ad.co.noToken" : "ad.co.cfError", { e: cf.error })}</div>` : "";
    $("#co-list").innerHTML = html`<table class="data compact"><thead><tr><th>${t("ad.co.col.what")}</th><th class="r">${t("ad.co.col.now")}</th>
      <th class="r">${t("ad.co.col.limit")}</th><th class="r">${t("ad.co.col.share")}</th><th>${t("ad.co.col.days", { n: d.days.length })}</th></tr></thead>
      <tbody>${rows.map((x) => html`<tr>
        <td><b>${t(`ad.co.${x.key}`)}</b>${x.note ? html`<div class="muted" style="font-size:12px">${x.note}</div>` : ""}</td>
        <td class="r num">${x.error ? html`<span class="muted" title="${x.error}">${t("ad.co.unavailable")}</span>` : x.value == null ? "—" : x.fmtv(x.value)}</td>
        <td class="r num">${x.limit ? x.fmtv(x.limit) : "—"}</td>
        <td class="r num">${x.error || x.value == null ? "" : level(x.value, x.limit)}</td>
        <td>${x.daily ? spark(x.daily, x.dayLimit) : ""}</td></tr>`)}</tbody></table>`;
    drawRobots();
  }

  // « Robots » (owner, 2026-11-01): the AI bots Cloudflare blocked or let through and the visits without an account, from
  // Ozimut's own copy kept 13 months (functions/api/admin/robots.js, _lib/robots.js)
  let rbBound = false;
  async function drawRobots() {
    const sel = $("#rb-days");
    if (!rbBound) { rbBound = true; sel.addEventListener("change", drawRobots); }
    const box = $("#rb-body");
    const r = await fetch(`api/admin/robots?days=${sel.value}`, { credentials: "same-origin", cache: "no-store" });
    const d = r.ok ? await r.json() : null;
    if (!d) { box.innerHTML = html`<div class="empty">${t("err.load")}</div>`; return; }
    if (!d.tables) { box.innerHTML = html`<div class="notice info">${t("ad.rb.noTables")}</div>`; return; }
    const s = d.sync || {}, when = (ms) => new Date(ms).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const notes = [];
    if (s.error === "no token") notes.push(html`<div class="notice info">${t("ad.rb.noToken")}</div>`);
    else {
      notes.push(html`<p class="muted rb-sync">${s.last && s.through ? t("ad.rb.sync", { when: when(s.last), through: fmtDate(s.through) }) : t("ad.rb.never")}
        ${s.through && !s.done ? t("ad.rb.filling") : ""}</p>`);
      if (s.error) notes.push(html`<div class="notice">${t("ad.rb.error", { e: s.error })}</div>`);
      if (s.approx) notes.push(html`<p class="muted rb-sync">${t("ad.rb.approx")}</p>`);
      if (s.allowedErr) notes.push(html`<p class="muted rb-sync">${t("ad.rb.allowedErr", { e: s.allowedErr })}</p>`);
    }
    const lines = [["blocked", d.blocked], ["allowed", d.allowed, t("ad.rb.allowed.note")], ["other", d.other],
      ["passes", d.guests.passes], ["failed", d.guests.failed], ["refused", d.guests.refused]];
    const bots = d.bots.length ? html`<h3>${t("ad.rb.bots")}</h3><div class="table-wrap"><table class="data compact">
        <thead><tr><th>${t("ad.rb.col.bot")}</th><th class="r">${t("ad.rb.col.blocked")}</th><th class="r">${t("ad.rb.col.allowed")}</th><th>${t("ad.rb.col.last")}</th></tr></thead>
        <tbody>${d.bots.map((b) => html`<tr><td><b>${b.bot}</b></td><td class="r num">${fmt(b.blocked)}</td><td class="r num">${fmt(b.allowed)}</td><td>${b.last ? fmtDate(b.last) : "—"}</td></tr>`)}</tbody></table></div>
      ${d.sources.length ? html`<p class="muted rb-sync">${t("ad.rb.sources", { list: d.sources.map((x) => `${x.source || "?"} ${fmt(x.n)}`).join(" · ") })}</p>` : ""}`
      : html`<p class="muted">${t("ad.rb.none")}</p>`;
    const recent = d.recent.length ? html`<details class="rb-recent"><summary>${t("ad.rb.recent", { n: d.recent.length })}</summary><div class="table-wrap"><table class="data compact">
        <thead><tr><th>${t("ad.rb.col.when")}</th><th>${t("ad.rb.col.bot")}</th><th>${t("ad.rb.col.action")}</th><th>${t("ad.rb.col.path")}</th><th>${t("ad.rb.col.country")}</th></tr></thead>
        <tbody>${d.recent.map((x) => html`<tr><td class="num">${when(x.ts)}</td><td>${x.bot}</td><td>${x.action}</td><td class="rb-path">${x.path}</td><td>${x.country}</td></tr>`)}</tbody></table></div></details>` : "";
    box.innerHTML = html`${notes}
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("ad.co.col.what")}</th><th class="r">${t("ad.rb.col.total")}</th><th>${t("ad.rb.col.days")}</th></tr></thead>
        <tbody>${lines.map(([k, v, note]) => html`<tr><td><b>${t(`ad.rb.${k}`)}</b>${note ? html`<div class="muted" style="font-size:12px">${note}</div>` : ""}</td>
          <td class="r num">${fmt(sum(v))}</td><td>${spark(v, 0)}</td></tr>`)}</tbody></table></div>
      ${bots}${recent}
      ${d.since ? html`<p class="muted rb-sync">${t("ad.rb.since", { d: fmtDate(d.since) })}</p>` : ""}`;
  }

  // « Démo »: the demo accounts. A password is shown once, when made or renewed: to be sent with the address and the site's link
  // ---- « Événements » (Orga › Gérer, 2026-11-11): the calendar links waiting for an administrator, the events made from before
  let eventsBound = false;
  async function drawEvents() {
    const call = async (path, body) => {
      const r = await fetch(`api/events${path}`, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      return j;
    };
    if (!eventsBound) {
      eventsBound = true;
      $("#ev-migrate").addEventListener("click", async (e) => {
        e.target.disabled = true;
        try { const r = await call("/migrate", {}); $("#ev-migrate-out").textContent = t("mg.ad.migrate.done", { c: r.competitions, d: r.declared, t: r.trainings, s: r.skipped.length }); }
        catch (err) { $("#ev-migrate-out").textContent = String(err.message); }
        e.target.disabled = false;
      });
    }
    let list;
    try { list = (await call("/pending")).pending; } catch (e) { $("#ev-pending").innerHTML = html`<div class="empty">${String(e.message)}</div>`; return; }
    $("#ev-pending").innerHTML = list.length ? html`<table class="data compact"><thead><tr><th>${t("mg.f.date")}</th><th>${t("mg.col.event")}</th><th>${t("mg.ad.asked")}</th>
        <th>${t("mg.ad.by")}</th><th></th></tr></thead><tbody>${list.map((e) => html`<tr data-ev="${e.id}"><td class="num">${fmtDate(e.date, "short")}</td>
        <td><a href="#/orga?ev=${e.id}">${e.name}</a></td>
        <td>${e.competition ? html`${e.competition.name}<br><span class="muted">${e.competition.org || ""}</span>` : "—"}${e.held ? html`<br><span class="tag">${t("mg.ad.heldBy", { name: e.held })}</span>` : ""}</td>
        <td>${e.byName}<br><span class="muted">${e.byEmail}${e.byClub ? ` · ${e.byClub}` : ""}</span></td>
        <td class="r" style="white-space:nowrap"><button type="button" class="btn btn-sm btn-primary" data-ok="1">${t("mg.ad.approve")}</button>
          <button type="button" class="btn btn-sm" data-ok="0">${t("mg.ad.refuse")}</button></td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("mg.ad.none")}</div>`;
    $$("#ev-pending [data-ok]").forEach((b) => b.addEventListener("click", async () => {
      try { await call(`/${b.closest("[data-ev]").dataset.ev}/approve`, { ok: b.dataset.ok === "1" }); drawEvents(); }
      catch (e) { b.closest("td").append(` ${e.message}`); }
    }));
  }

  let demoBound = false;
  function showMade(email, password) {
    const text = t("ad.dm.message", { site: location.origin, email, password });
    $("#dm-made").innerHTML = html`<div class="notice ok" style="white-space:pre-line">${text}</div>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-sm" id="dm-copy">${t("ad.dm.copy")}</button>
        <span class="muted" style="font-size:12.5px">${t("ad.dm.once")}</span></div>`;
    $("#dm-copy").addEventListener("click", (e) => navigator.clipboard?.writeText(text).then(() => { e.target.textContent = t("ad.dm.copied"); }));
  }
  async function drawDemo() {
    if (!demoBound) {
      demoBound = true;
      $("#dm-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const res = await auth.api("api/admin/demo", { label: $("#dm-label").value, email: $("#dm-email").value || undefined,
          days: Number($("#dm-days").value), lang: $("#dm-lang").value });
        if (!res.ok) {
          $("#dm-made").innerHTML = html`<div class="notice">${t(res.data?.error === "exists" ? "ad.dm.err.exists" : res.data?.error === "email" ? "ad.dm.err.email" : "ac.err.generic")}</div>`;
          return;
        }
        e.target.reset();
        showMade(res.data.account.email, res.data.password);
        drawDemo();
      });
    }
    const box = $("#dm-list");
    const r = await fetch("api/admin/demo", { credentials: "same-origin", cache: "no-store" });
    const { accounts = [], today = "" } = r.ok ? await r.json() : {};
    box.innerHTML = accounts.length ? html`<table class="data compact"><thead><tr><th>${t("ad.dm.label")}</th><th>${t("ad.dm.email")}</th>
      <th>${t("ad.dm.until")}</th><th>${t("ad.dm.last")}</th><th></th></tr></thead>
      <tbody>${accounts.map((a) => {
        const over = a.until < today, off = a.status !== "active";
        return html`<tr>
          <td>${a.label}</td><td style="font-size:12.5px">${a.email}</td>
          <td class="num">${fmtDate(a.until)} ${over ? html`<span class="tag">${t("ad.dm.expired")}</span>` : off ? html`<span class="tag">${t("ad.dm.off")}</span>` : ""}</td>
          <td class="num" style="font-size:12.5px">${a.lastLogin ? fmtDate(a.lastLogin.slice(0, 10), "short") : "—"}</td>
          <td><div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-sm" data-dm="extend" data-id="${a.id}">${t("ad.dm.extend")}</button>
            <button type="button" class="btn btn-sm" data-dm="password" data-id="${a.id}" data-email="${a.email}">${t("ad.dm.password")}</button>
            <button type="button" class="btn btn-sm" data-dm="${off ? "enable" : "disable"}" data-id="${a.id}">${t(off ? "ad.dm.enable" : "ad.dm.disable")}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-dm="delete" data-id="${a.id}" style="color:var(--bad)">${t("ad.dm.delete")}</button>
          </div></td></tr>`;
      })}</tbody></table>` : html`<div class="empty">${t("ad.dm.none")}</div>`;
    $$("[data-dm]", box).forEach((btn) => btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id), act = btn.dataset.dm;
      if (act === "delete" && !confirm(t("ad.dm.confirm"))) return;
      btn.disabled = true;
      const res = act === "extend" || act === "password" ? await auth.api("api/admin/demo", { id, action: act, days: 30 })
        : await auth.api("api/admin/user", { id, action: act });
      if (res.ok && act === "password") showMade(btn.dataset.email, res.data.password);
      drawDemo();
    }));
  }

  // « Sites »: the organisers' sites to follow up with — robots.txt forbids what the collection reads all the same, or
  // the site actively refuses robots (never worked around) — from site/data/prov/blocked.json (administrators only)
  async function drawSites() {
    const box = $("#st-list");
    const r = await fetch("data/prov/blocked.json", { credentials: "same-origin", cache: "no-store" });
    const sites = r.ok && (r.headers.get("content-type") || "").includes("json") ? (await r.json()).sites : [];
    const day = (iso) => (iso ? fmtDate(iso.slice(0, 10), "short") : "—");
    const race = (c) => (c.name
      ? html`<div><a href="#/resultats?course=${encodeURIComponent(c.key)}">${c.name}</a> <span class="muted">${fmtDate(c.date, "short")}</span></div>`
      : html`<div class="muted">${c.key}</div>`);
    box.innerHTML = sites.length ? html`<table class="data compact"><thead><tr><th>${t("ad.st.site")}</th><th>${t("ad.st.kind")}</th>
      <th>${t("ad.st.races")}</th><th class="r">${t("ad.st.hits")}</th><th>${t("ad.st.seen")}</th></tr></thead>
      <tbody>${sites.map((x) => html`<tr>
        <td style="white-space:normal;max-width:260px"><a href="https://${x.host}/" target="_blank" rel="noopener">${x.host}</a>
          <div class="muted" style="font-size:12px;overflow-wrap:anywhere">${x.example || ""}</div></td>
        <td style="white-space:normal;min-width:150px"><span class="tag">${t(`ad.st.kind.${x.kind}`)}</span>
          <div class="muted" style="font-size:12px">${t(`ad.st.kind.${x.kind}.hint`)}</div></td>
        <td style="white-space:normal;max-width:300px;font-size:12.5px">${x.races.length ? html`${x.races.slice(0, 5).map(race)}
          ${x.races.length > 5 ? html`<details><summary class="muted">${t("ad.st.more", { n: x.races.length - 5 })}</summary>
            ${x.races.slice(5).map(race)}</details>` : ""}` : html`<span class="muted">—</span>`}</td>
        <td class="r num">${fmt(x.hits)}</td>
        <td class="num" style="font-size:12.5px">${day(x.first)} → ${day(x.last)}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.st.none")}</div>`;
  }

  // « Dépôts »: the results files uploaded on « Récemment » (api/admin/uploads), each one removable
  async function drawUploads() {
    const box = $("#up-list");
    const r = await fetch("api/admin/uploads", { credentials: "same-origin", cache: "no-store" });
    const list = r.ok ? (await r.json()).uploads : [];
    const raceOf = (u) => {
      if (u.race_key) return html`<a href="#/resultats?course=${encodeURIComponent(u.race_key)}">${u.race}</a>`;
      let n = {};
      try { n = JSON.parse(u.race); } catch (e) { /* a label */ }
      return html`${n.name || u.race} <span class="muted">(${n.date ? fmtDate(n.date, "short") : ""} · ${t("ad.up.added")})</span>`;
    };
    box.innerHTML = list.length ? html`<table class="data compact"><thead><tr><th>${t("ad.up.when")}</th><th>${t("ad.up.race")}</th>
      <th>${t("ad.up.file")}</th><th>${t("ad.up.who")}</th><th></th></tr></thead>
      <tbody>${list.map((u) => html`<tr${raw(u.status === "removed" ? ' style="opacity:.55"' : "")}>
        <td class="num">${fmtDate(u.created_at.slice(0, 10), "short")} ${u.created_at.slice(11, 16)}</td>
        <td style="white-space:normal;max-width:320px">${raceOf(u)}</td>
        <td style="white-space:normal;max-width:260px">${u.filename} <span class="muted">· ${t("unit.kb", { n: fmt(Math.max(1, Math.round(u.size / 1024))) })}</span></td>
        <td style="white-space:normal">${u.email ? html`${u.first_name} ${u.last_name}<div class="muted" style="font-size:12px">${u.email} · ${u.licence}</div>` : "—"}</td>
        <td>${u.status === "removed" ? html`<span class="tag">${t("ad.up.removed")}</span>`
          : html`<button type="button" class="btn btn-sm" data-up-remove="${u.id}">${t("ad.up.remove")}</button>`}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.up.none")}</div>`;
    $$("[data-up-remove]", box).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(t("ad.up.confirm"))) return;
      b.disabled = true;
      await auth.api("api/admin/uploads", { id: Number(b.dataset.upRemove) });
      drawUploads();
    }));
  }
  let usageStarted = false;

  // « Mes cartes » (owner, 2026-11-06): what each account's library holds against its quota, and the administrators' collection
  // of every map sent to Ozimut (api/admin/maplib, _lib/maplib.js)
  async function drawMymaps() {
    const box = $("#mm-users");
    const r = await fetch("api/admin/maplib?usage=1", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) { box.innerHTML = html`<div class="empty">${t(r.status === 503 ? "ad.mm.notReady" : "ad.mm.error")}</div>`; return; }
    const d = await r.json();
    const mb = (b) => (b >= 1073741824 ? t("ad.mm.gb", { n: fmt(b / 1073741824, 1) }) : t("ad.mm.mb", { n: fmt(b / 1048576, b < 10 * 1048576 ? 1 : 0) }));
    const sum = (k) => d.users.reduce((s, u) => s + u[k], 0);
    $("#mm-tiles").innerHTML = [tile(t("ad.mm.accounts"), fmt(d.users.length)), tile(t("ad.mm.maps"), fmt(sum("maps"))), tile(t("ad.mm.runs"), fmt(sum("runs"))),
      tile(t("ad.mm.size"), mb(sum("bytes")), t("ad.mm.limit", { n: mb(d.limit) })),
      tile(t("ad.mm.collection"), fmt(d.collection.count), t("ad.mm.collSub", { size: mb(d.collection.bytes), n: fmt(d.collection.gone) }))].join("");
    box.innerHTML = d.users.length ? html`<table class="data compact"><thead><tr><th>${t("ad.mm.who")}</th><th class="num">${t("ad.mm.maps")}</th>
      <th class="num">${t("ad.mm.runs")}</th><th class="num">${t("ad.mm.size")}</th><th class="num">${t("ad.mm.quota")}</th><th>${t("ad.mm.updated")}</th></tr></thead>
      <tbody>${d.users.map((u) => html`<tr><td style="white-space:normal">${u.name || `#${u.uid}`}<div class="muted" style="font-size:12px">${u.email}</div></td>
        <td class="num">${fmt(u.maps)}</td><td class="num">${fmt(u.runs)}</td><td class="num">${mb(u.bytes)}</td>
        <td class="num">${pctN((100 * u.bytes) / d.limit)}</td><td class="num">${u.updated ? fmtDate(u.updated.slice(0, 10), "short") : "—"}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.mm.none")}</div>`;
  }

  // « Anonymisés »: the licensees whose name and licence the published site replaces by a pseudonym (on request: not to be
  // shown, a minor's representative, erasure of results data), from api/admin/anonymized (R2, privacy/anonymized.json);
  // the next run of the update rebuilds the site with the list (privacy.py). Reversible: « Rétablir ».
  let anonList = null;
  const anonAs = (p) => `${t("ad.an.label")} ${Number(p.pseudo) - 90000000}`;
  async function anonCall(method, body) {
    const r = await fetch("api/admin/anonymized", { method, credentials: "same-origin", cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    let j = null;
    try { j = await r.json(); } catch (e) { /* none */ }
    return { ok: r.ok, status: r.status, data: j };
  }
  async function drawAnon() {
    if (!anonList) {
      const r = await anonCall("GET");
      anonList = r.ok ? r.data : null;
    }
    const people = anonList?.people || [];
    $("#an-title").textContent = people.length ? t("ad.an.count", { n: fmt(people.length) }) : t("ad.an.list");
    $("#an-list").innerHTML = !anonList ? html`<div class="empty">${t("ad.an.error")}</div>`
      : people.length ? html`<table class="data compact"><thead><tr><th>${t("ad.an.col.name")}</th><th>${t("ad.an.col.lic")}</th>
          <th>${t("ad.an.col.as")}</th><th>${t("ad.an.col.since")}</th><th>${t("ad.an.col.note")}</th><th></th></tr></thead>
        <tbody>${[...people].reverse().map((p) => html`<tr><td>${p.name}</td><td class="num">${p.lic}</td><td>${anonAs(p)}</td>
          <td class="num">${fmtDate(p.since, "short")}</td><td style="white-space:normal;max-width:300px">${p.note || ""}</td>
          <td class="r"><button type="button" class="btn btn-sm" data-an-restore="${p.lic}">${t("ad.an.restore")}</button></td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.an.none")}</div>`;
    $$("[data-an-restore]").forEach((b) => b.addEventListener("click", async () => {
      const p = people.find((x) => String(x.lic) === b.dataset.anRestore);
      if (!p || !confirm(t("ad.an.restoreConfirm", { name: p.name }))) return;
      b.disabled = true;
      const r = await anonCall("DELETE", { lic: p.lic });
      if (r.ok) anonList = r.data;
      $("#an-msg").textContent = r.ok ? t("ad.an.pending") : t("ad.an.error");
      drawAnon();
    }));
    drawAnonFound();
  }
  // the runners matching the search (name or licence), each with its button; a licence absent from the data can be typed
  function drawAnonFound() {
    const q = normalise($("#an-q").value.trim()), box = $("#an-found");
    if (!q || q.length < 2) { box.innerHTML = ""; return; }
    const listed = new Set((anonList?.people || []).map((p) => String(p.lic)));
    const found = data.runners().list.filter((r) => !data.isAnon(r.lic) && (String(r.lic) === q || normalise(r.nom).includes(q))).slice(0, 8);
    const digits = /^\d{1,7}$/.test(q);
    box.innerHTML = html`${found.length ? html`<div class="table-wrap"><table class="data compact"><tbody>${found.map((r) => html`<tr>
        <td>${r.nom}</td><td class="num">${r.lic}</td><td>${data.clubName(r.club)}</td><td class="num">${fmtDate(r.last, "short")}</td>
        <td class="r">${listed.has(String(r.lic)) ? html`<span class="tag">${t("ad.an.already")}</span>`
          : html`<button type="button" class="btn btn-sm btn-primary" data-an-add="${r.lic}">${t("ad.an.do")}</button>`}</td></tr>`)}</tbody></table></div>`
      : html`<div class="muted" style="font-size:13px">${t("ad.an.noMatch")}</div>`}
      <div class="filters" style="margin:10px 0 0;padding:0;border:0;background:none">
        <span class="muted" style="font-size:12.5px;align-self:center">${t("ad.an.manual")}</span>
        <label class="field"><span>${t("ad.an.col.lic")}</span><input type="text" id="an-lic" inputmode="numeric" maxlength="7" style="width:100px" value="${digits ? q : ""}"></label>
        <label class="field"><span>${t("ad.an.col.name")}</span><input type="text" id="an-name" maxlength="80" style="width:220px"></label>
        <button type="button" class="btn btn-sm" id="an-manual" style="align-self:flex-end">${t("ad.an.do")}</button>
      </div>`;
    const add = async (lic, name) => {
      if (!confirm(t("ad.an.confirm", { name }))) return;
      const r = await anonCall("POST", { lic, name, note: $("#an-note").value });
      if (r.ok) { anonList = r.data; $("#an-q").value = ""; $("#an-note").value = ""; }
      $("#an-msg").textContent = r.ok ? t("ad.an.pending") : r.status === 409 ? t("ad.an.already") : t("ad.an.error");
      drawAnon();
    };
    $$("[data-an-add]", box).forEach((b) => b.addEventListener("click", () => {
      const r = data.runner(b.dataset.anAdd);
      if (r) add(String(r.lic), r.nom);
    }));
    $("#an-manual").addEventListener("click", () => {
      const lic = $("#an-lic").value.trim(), name = $("#an-name").value.trim();
      if (!/^\d{1,7}$/.test(lic) || !name) { $("#an-msg").textContent = t("ad.an.manualHelp"); return; }
      add(lic, name);
    });
  }
  $("#an-q").addEventListener("input", drawAnonFound);

  // « Inscrits »: registered accounts (confirmed, not disabled, by sign-up day) and active ones (seen on at least one day
  // of the last 21) from api/admin/members, day by day since the first account. An account deleted leaves no trace.
  let members = null, mNoAdmins = true;
  bindChartCard(main, "m-chart");
  $("#m-noadmins").addEventListener("change", (e) => { mNoAdmins = e.target.checked; drawMembers(); });
  async function drawMembers() {
    if (!members) {
      const r = await fetch("api/admin/members", { credentials: "same-origin", cache: "no-store" });
      members = r.ok ? await r.json() : { error: true };
    }
    if (members.error) { $("#m-tiles").innerHTML = html`<div class="notice">${t("ad.u.error")}</div>`; return; }
    const keep = members.users.filter((u) => !(mNoAdmins && u.admin));
    const ids = new Set(keep.map((u) => u.id));
    const today = isoDay(new Date());
    const counted = keep.filter((u) => u.verified && u.status !== "disabled");
    const start = counted.length ? counted.map((u) => parisDay(u.created)).sort()[0] : today;
    const n = spanDays(start, today), idx = (d) => spanDays(start, d) - 1;
    const days = Array.from({ length: n }, (_, i) => addDays(start, i));
    // registered: confirmed accounts by the day they signed up
    const fresh = new Array(n).fill(0);
    for (const u of counted) fresh[Math.max(0, idx(parisDay(u.created)))]++;
    const reg = [];
    fresh.reduce((s, x, i) => (reg[i] = s + x), 0);
    // active: an account counts from each day it was seen to 20 days later; its spans merged, then summed day by day
    const delta = new Array(n + 1).fill(0), byUser = new Map();
    for (const [uid, d] of members.seen) if (ids.has(uid)) { if (!byUser.has(uid)) byUser.set(uid, []); byUser.get(uid).push(idx(d)); }
    for (const list of byUser.values()) {
      let a = null, b = null;
      for (const i of list.sort((x, y) => x - y)) {
        if (a != null && i <= b + 1) { b = Math.max(b, i + ACTIVE_DAYS - 1); continue; }
        if (a != null) { delta[Math.max(0, a)]++; delta[Math.min(n, b + 1)]--; }
        a = i; b = i + ACTIVE_DAYS - 1;
      }
      if (a != null) { delta[Math.max(0, a)]++; delta[Math.min(n, b + 1)]--; }
    }
    const act = [];
    delta.slice(0, n).reduce((s, x, i) => (act[i] = s + x), 0);
    const tracked = members.first || today;                  // visits are counted since this day
    const fullFrom = addDays(tracked, ACTIVE_DAYS - 1);       // the first day whose window is wholly tracked
    const activeAt = (i) => (days[i] < tracked ? null : act[i]);
    const last = n - 1, since = addDays(today, -(ACTIVE_DAYS - 1));
    const newRecent = counted.filter((u) => parisDay(u.created) >= since).length;
    const pending = keep.filter((u) => !u.verified).length, disabled = keep.filter((u) => u.verified && u.status === "disabled").length;
    const pct = reg[last] ? Math.round((100 * act[last]) / reg[last]) : null;
    $("#m-tiles").innerHTML = html`
      ${tile(t("ad.m.registered"), fmt(reg[last] || 0), [pending ? t("ad.m.pending", { n: fmt(pending) }) : "", disabled ? t("ad.m.disabled", { n: fmt(disabled) }) : ""].filter(Boolean).join(" · "))}
      ${tile(t("ad.m.active", { n: ACTIVE_DAYS }), fmt(act[last] || 0), pct != null ? t("ad.m.share", { p: fmt(pct) }) : "")}
      ${tile(t("ad.m.new", { n: ACTIVE_DAYS }), fmt(newRecent), t("ad.m.since", { d: fmtDate(since, "short") }))}`;
    $("#m-note").textContent = today < fullFrom
      ? t("ad.m.partial", { d: fmtDate(tracked), full: fmtDate(fullFrom), n: ACTIVE_DAYS })
      : t("ad.m.def", { n: ACTIVE_DAYS });
    const cReg = css("--s1"), cAct = css("--s2");
    $("#m-chart-legend").innerHTML = legend([{ color: cReg, label: t("ad.m.registered") }, { color: cAct, label: t("ad.m.active", { n: ACTIVE_DAYS }) }]);
    timeChart($("#m-chart"), {
      yName: t("ad.m.accounts"), yMin: 0, zoom: n > 120 ? undefined : false,
      series: [
        { name: t("ad.m.registered"), color: cReg, step: true, data: days.map((d, i) => [d, reg[i]]) },
        { name: t("ad.m.active", { n: ACTIVE_DAYS }), color: cAct, data: days.map((d, i) => [d, activeAt(i)]).filter((p) => p[1] != null) },
      ],
    });
    $("#m-chart-table").innerHTML = html`<table class="data compact"><thead><tr><th>${t("f.date")}</th><th class="r">${t("ad.m.registered")}</th>
      <th class="r">${t("ad.m.newDay")}</th><th class="r">${t("ad.m.active", { n: ACTIVE_DAYS })}</th></tr></thead>
      <tbody>${days.map((d, i) => i).reverse().map((i) => html`<tr><td class="num">${fmtDate(days[i])}</td><td class="r num">${fmt(reg[i])}</td>
        <td class="r num">${fresh[i] ? fmt(fresh[i]) : ""}</td><td class="r num">${activeAt(i) == null ? "—" : fmt(activeAt(i))}</td></tr>`)}</tbody></table>`;
  }

  // ======================================================================================================
  // Comptes
  // ======================================================================================================
  let q = "", onlyDups = false;
  const dupSet = () => new Set(duplicates);
  const status = (u) => (u.status === "disabled" ? t("ad.st.disabled") : u.email_verified ? t("ad.st.active") : t("ad.st.unverified"));

  function draw() {
    const dups = dupSet();
    $("#ad-tiles").innerHTML = html`
      ${tile(t("ad.accounts"), fmt(users.length))}
      ${tile(t("ad.confirmed"), fmt(users.filter((u) => u.email_verified).length))}
      ${tile(t("ad.dups"), fmt(dups.size))}
      ${tile(t("ad.queue"), fmt(queued))}`;
    const qn = normalise(q);
    const rows = users.filter((u) => (!onlyDups || (dups.has(u.licence) && u.email_verified))
      && (!qn || normalise(`${u.email} ${u.first_name} ${u.last_name} ${u.licence}`).includes(qn)));
    $("#ad-table").innerHTML = rows.length ? html`<table class="data compact"><thead><tr>
      <th>${t("ad.col.email")}</th><th>${t("ad.col.name")}</th><th>${t("ad.col.lic")}</th><th>${t("ad.col.countries")}</th><th>${t("ad.col.status")}</th>
      <th>${t("ad.col.created")}</th><th>${t("ad.col.login")}</th><th>${t("ad.col.notify")}</th>
      <th title="${t("ad.col.alerts.hint")}">${t("ad.col.alerts")}</th>
      <th title="${t("ad.col.nutrition.hint")}">${t("nav.nutrition")}</th>
      <th>${t("ad.col.actions")}</th></tr></thead>
      <tbody>${rows.map((u) => html`<tr>
        <td>${u.email}</td>
        <td>${u.licence ? html`<a href="${link.runner(u.licence)}">${u.display_name}</a>` : u.display_name}<div class="muted" style="font-size:12px">${u.first_name} ${u.last_name}</div></td>
        <td class="num">${u.licence || "—"}${u.licence && dups.has(u.licence) && u.email_verified ? html` <span class="tag" style="color:var(--bad)">${t("ad.dup")}</span>` : ""}</td>
        <td>${(u.countries || []).map((c) => html`<span class="tag" title="${c.status}"${raw(c.status === "ok" ? "" : ' style="opacity:.6"')}>${c.cc}</span> `)}</td>
        <td>${status(u)}</td>
        <td class="num">${fmtDate(u.created_at.slice(0, 10), "short")}</td>
        <td class="num">${u.last_login ? fmtDate(u.last_login.slice(0, 10), "short") : "—"}</td>
        <td>${u.notify ? "✓" : ""}</td>
        <td class="c"><input type="checkbox" data-right="alerts" data-id="${u.id}" ${u.alerts_allowed ? "checked" : ""} aria-label="${t("ad.col.alerts")}">
          ${u.agenda_alert || u.deadline_alert ? html`<div class="muted" style="font-size:11.5px">${[u.agenda_alert ? t("ad.alert.new") : "", u.deadline_alert ? t("ad.alert.deadline") : ""].filter(Boolean).join(" · ")}</div>` : ""}</td>
        <td>${u.admin ? html`<span class="muted" title="${t("ad.nut.adminHint")}">${t("ad.nut.author")}</span>` : u.nutrition === undefined ? "—"
          : html`<select data-nut="${u.id}" aria-label="${t("nav.nutrition")}">${[["", "ad.nut.none"], ["reader", "ad.nut.reader"], ["author", "ad.nut.author"]]
            .map(([v, k]) => html`<option value="${v}" ${(u.nutrition || "") === v ? "selected" : ""}>${t(k)}</option>`)}</select>`}</td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap">
          <button type="button" class="btn btn-sm" data-act="${u.status === "disabled" ? "enable" : "disable"}" data-id="${u.id}">${u.status === "disabled" ? t("ad.enable") : t("ad.disable")}</button>
          <button type="button" class="btn btn-sm" data-act="delete" data-id="${u.id}" style="color:var(--bad)">${t("ad.delete")}</button>
        </div></td></tr>`)}</tbody></table>` : html`<div class="empty">${t("ad.none")}</div>`;
    $$("[data-act]", $("#ad-table")).forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.act === "delete" && !confirm(t("ad.delete.confirm"))) return;
      b.disabled = true;
      const res = await auth.api("api/admin/user", { id: Number(b.dataset.id), action: b.dataset.act });
      if (!res.ok) { b.disabled = false; return; }
      const fresh = await (await fetch("api/admin/users", { credentials: "same-origin", cache: "no-store" })).json();
      ({ users, duplicates, queued } = fresh);
      draw();
    }));
    // the right to the agenda alerts by e-mail, saved at each click
    $$("[data-right]", $("#ad-table")).forEach((box) => box.addEventListener("change", async () => {
      box.disabled = true;
      const res = await auth.api("api/admin/user", { id: Number(box.dataset.id), action: "right", right: box.dataset.right, on: box.checked });
      box.disabled = false;
      if (!res.ok) { box.checked = !box.checked; return; }
      const u = users.find((x) => x.id === Number(box.dataset.id));
      if (u) u.alerts_allowed = box.checked ? 1 : 0;
    }));
    // « Nutrition » (migration 0017): reads it, writes in it, or neither; saved at each change
    $$("[data-nut]", $("#ad-table")).forEach((sel) => sel.addEventListener("change", async () => {
      const u = users.find((x) => x.id === Number(sel.dataset.nut)), before = u?.nutrition || "";
      sel.disabled = true;
      const res = await auth.api("api/admin/user", { id: Number(sel.dataset.nut), action: "nutrition", value: sel.value });
      sel.disabled = false;
      if (!res.ok) { sel.value = before; return; }
      if (u) u.nutrition = sel.value;
    }));
  }
  $("#ad-q").addEventListener("input", (e) => { q = e.target.value; draw(); });
  $("#ad-dups").addEventListener("change", (e) => { onlyDups = e.target.checked; draw(); });
  // the administrator's own e-mail at each new account, saved at once
  $("#ad-signup").addEventListener("change", async (e) => {
    const box = e.target;
    box.disabled = true;
    const res = await auth.api("api/admin/prefs", { signupAlert: box.checked });
    box.disabled = false;
    if (!res.ok) box.checked = !box.checked;
  });
  draw();

  // ======================================================================================================
  // Utilisation
  // ======================================================================================================
  const today = isoDay(new Date());
  let preset = PRESETS.includes(query.per) ? query.per : "30";
  let to = /^\d{4}-\d{2}-\d{2}$/.test(query.au || "") ? query.au : today;
  let from = /^\d{4}-\d{2}-\d{2}$/.test(query.du || "") ? query.du : preset === "all" ? "" : addDays(to, 1 - Number(preset));
  if (query.du || query.au) preset = "";
  let account = query.compte || "", noAdmins = query.admins !== "1";
  let usage = null;

  async function loadUsage() {
    const qs = new URLSearchParams({ ...(from ? { from } : {}), to });
    const res = await fetch(`api/admin/usage?${qs}`, { credentials: "same-origin", cache: "no-store" });
    usage = res.ok ? await res.json() : null;
  }
  function saveUsage() {
    replaceQuery({ onglet: "utilisation", per: preset && preset !== "30" ? preset : null, du: preset ? null : from || null,
      au: preset ? null : to, compte: account || null, admins: noAdmins ? null : "1" });
  }

  function drawUsageFilters() {
    const accounts = (usage?.users || []).filter((u) => !noAdmins || !u.admin)
      .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "", "fr"));
    if (account && !accounts.some((u) => String(u.user_id) === account)) account = "";
    $("#u-filters").innerHTML = html`
      <div class="field"><span>${t("ad.u.period")}</span>${seg("uper", PRESETS.map((p) => [p, t(`ad.u.per.${p}`)]), preset)}</div>
      <label class="field"><span>${t("ad.u.from")}</span><input type="date" id="u-from" value="${from || usage?.first || ""}" max="${today}"></label>
      <label class="field"><span>${t("ad.u.to")}</span><input type="date" id="u-to" value="${to}" max="${today}"></label>
      <label class="field"><span>${t("ad.u.account")}</span><select id="u-account" style="max-width:280px">
        <option value="">${t("ad.u.allAccounts")}</option>
        ${accounts.map((u) => html`<option value="${u.user_id}" ${raw(String(u.user_id) === account ? "selected" : "")}>${u.display_name || t("ad.u.deleted")}</option>`)}</select></label>
      <label class="check" style="align-self:flex-end;height:34px;align-items:center"><input type="checkbox" id="u-noadmins" ${raw(noAdmins ? "checked" : "")}>
        <span>${t("ad.u.noAdmins")}</span></label>`;
    $$('[data-seg="uper"]').forEach((b) => b.addEventListener("click", async () => {
      preset = b.dataset.value;
      to = today;
      from = preset === "all" ? "" : addDays(to, 1 - Number(preset));
      await reload();
    }));
    const dates = async () => {
      const f = $("#u-from").value, tt = $("#u-to").value;
      if (!tt || (f && f > tt)) return;
      preset = ""; from = f; to = tt;
      await reload();
    };
    $("#u-from").addEventListener("change", dates);
    $("#u-to").addEventListener("change", dates);
    $("#u-account").addEventListener("change", (e) => { account = e.target.value; saveUsage(); drawUsage(); });
    $("#u-noadmins").addEventListener("change", (e) => { noAdmins = e.target.checked; saveUsage(); drawUsageFilters(); drawUsage(); });
  }
  async function reload() { await loadUsage(); saveUsage(); drawUsageFilters(); drawUsage(); }

  // Sorting the usage tables (owner, 2026-11-03: by any column, several at once). A click on a heading sorts by that column
  // alone (again: the other way); Shift + click adds it as a further key, then turns it the other way, then takes it out.
  // Texts start from A, numbers and dates from the largest. Kept for the visit.
  const usageSort = { time: [{ key: "bucket", dir: -1 }], users: [{ key: "views", dir: -1 }, { key: "visits", dir: -1 }],
    pages: [{ key: "views", dir: -1 }] };
  const TEXT_COLS = new Set(["name", "top", "page"]);
  const firstDir = (key) => (TEXT_COLS.has(key) ? 1 : -1);
  function sortRows(rows, table, value) {
    const coll = new Intl.Collator(locale(), { sensitivity: "base", numeric: true });
    return [...rows].sort((a, b) => {
      for (const { key, dir } of usageSort[table]) {
        const x = value(a, key), y = value(b, key);
        if (x == null && y == null) continue;
        if (x == null) return 1;                      // the empty ones last, whichever way
        if (y == null) return -1;
        const c = typeof x === "string" ? coll.compare(x, y) : x - y;
        if (c) return c * dir;
      }
      return 0;
    });
  }
  function sortHead(table, key, label, cls = "") {
    const order = usageSort[table], i = order.findIndex((o) => o.key === key);
    const mark = i < 0 ? "" : html`<span class="arrow">${order[i].dir > 0 ? "▲" : "▼"}${order.length > 1 ? html`<sup>${i + 1}</sup>` : ""}</span>`;
    return html`<th scope="col" class="sortable ${cls}" data-usort="${table}" data-key="${key}" title="${t("ad.u.sortHint")}"
      aria-sort="${i === 0 ? (order[0].dir > 0 ? "ascending" : "descending") : "none"}">${label}${mark}</th>`;
  }
  function bindSort(box) {
    $$("th[data-usort]", box).forEach((th) => th.addEventListener("click", (e) => {
      const table = th.dataset.usort, key = th.dataset.key, order = usageSort[table], i = order.findIndex((o) => o.key === key);
      if (!e.shiftKey) usageSort[table] = [{ key, dir: i === 0 ? -order[0].dir : firstDir(key) }];
      else if (i < 0) order.push({ key, dir: firstDir(key) });
      else if (order[i].dir === firstDir(key) || order.length === 1) order[i].dir = -order[i].dir;
      else order.splice(i, 1);
      drawUsage();
    }));
  }

  function drawUsage() {
    if (!usage) { $("#u-tiles").innerHTML = html`<div class="notice">${t("ad.u.error")}</div>`; return; }
    const admins = new Set(usage.users.filter((u) => u.admin).map((u) => u.user_id));
    const keep = (uid) => (!noAdmins || !admins.has(uid)) && (!account || String(uid) === account);
    const days = usage.days.filter((d) => keep(d.user_id));
    const pages = usage.pages.filter((p) => keep(p.user_id));
    const people = usage.users.filter((u) => keep(u.user_id));
    const visits = days.reduce((n, d) => n + d.visits, 0), views = days.reduce((n, d) => n + d.views, 0);
    const start = from || usage.first || to;
    const span = spanDays(start, to);

    $("#u-tiles").innerHTML = html`
      ${tile(t("ad.u.active"), fmt(people.length), `${fmtDate(start, "short")} – ${fmtDate(to, "short")}`)}
      ${tile(t("ad.u.visits"), fmt(visits), `${fmt(visits / span, 1)} ${t("ad.u.perDay")}`)}
      ${tile(t("ad.u.views"), fmt(views), `${fmt(views / span, 1)} ${t("ad.u.perDay")}`)}
      ${tile(t("ad.u.viewsPerVisit"), visits ? fmt(views / visits, 1) : "—")}`;

    // the chart: by day up to 3 months, by week up to 2 years, by month beyond
    const unit = span <= 92 ? "day" : span <= 730 ? "week" : "month";
    const bucketOf = (iso) => {
      if (unit === "day") return iso;
      if (unit === "month") return iso.slice(0, 7);
      const d = new Date(`${iso}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));                // the Monday of its week
      return d.toISOString().slice(0, 10);
    };
    const buckets = [];
    for (let d = start; d <= to; d = addDays(d, 1)) { const b = bucketOf(d); if (buckets[buckets.length - 1] !== b) buckets.push(b); }
    const agg = new Map(buckets.map((b) => [b, { views: 0, visits: 0, users: new Set() }]));
    for (const d of days) {
      const a = agg.get(bucketOf(d.day));
      if (!a) continue;
      a.views += d.views; a.visits += d.visits;
      if (d.views || d.visits) a.users.add(d.user_id);
    }
    const label = (b) => (unit === "month" ? fmtDate(`${b}-01`, "month") : unit === "week" ? `${t("ad.u.weekOf")} ${fmtDate(b, "short")}` : fmtDate(b, "short"));
    const series = [
      { name: t("ad.u.views"), color: css("--s1"), data: buckets.map((b) => agg.get(b).views) },
      { name: t("ad.u.visits"), color: css("--s3"), data: buckets.map((b) => agg.get(b).visits) },
      { name: t("ad.u.active"), color: css("--s2"), data: buckets.map((b) => agg.get(b).users.size) },
    ];
    $("#u-chart-legend").innerHTML = legend(series.map((s) => ({ label: s.name, color: s.color })));
    $("#u-chart-title").textContent = `${t("ad.u.chart")} · ${t(`ad.u.unit.${unit}`)}`;
    columnChart($("#u-chart"), { categories: buckets.map(label), series });
    const SERIES_KEYS = ["views", "visits", "active"];
    const rowsT = sortRows(buckets.map((b, i) => ({ b, v: series.map((s) => s.data[i]) })), "time",
      (r, key) => (key === "bucket" ? r.b : r.v[SERIES_KEYS.indexOf(key)]));
    $("#u-chart-table").innerHTML = html`<table class="data compact"><thead><tr>${sortHead("time", "bucket", t(`ad.u.unit.${unit}`))}
      ${series.map((s, k) => sortHead("time", SERIES_KEYS[k], s.name, "r"))}</tr></thead>
      <tbody>${rowsT.map((r) => html`<tr><td>${label(r.b)}</td>${r.v.map((v) => html`<td class="r num">${fmt(v)}</td>`)}</tr>`)}</tbody></table>`;
    bindSort($("#u-chart-table"));

    // per account: visits, views, active days, last activity, the page they open most
    const per = new Map(people.map((u) => [u.user_id, { ...u, visits: 0, views: 0, top: null }]));
    for (const d of days) { const p = per.get(d.user_id); if (p) { p.visits += d.visits; p.views += d.views; } }
    const topOf = new Map();
    for (const p of pages) {
      if (p.page === "_visit") continue;
      const cur = topOf.get(p.user_id);
      if (!cur || p.views > cur.views) topOf.set(p.user_id, p);
    }
    const topName = (u) => (topOf.has(u.user_id) ? pageName(topOf.get(u.user_id).page) : null);
    const rowsU = sortRows([...per.values()], "users", (u, key) => (key === "name" ? u.display_name || null
      : key === "top" ? topName(u) : key === "last" ? u.last || null : u[key]));
    $("#u-users").innerHTML = rowsU.length ? html`<table class="data compact"><thead><tr>${sortHead("users", "name", t("ad.col.name"))}
      ${sortHead("users", "visits", t("ad.u.visits"), "r")}${sortHead("users", "views", t("ad.u.views"), "r")}${sortHead("users", "days", t("ad.u.days"), "r")}
      ${sortHead("users", "last", t("ad.u.last"))}${sortHead("users", "top", t("ad.u.top"))}</tr></thead>
      <tbody>${rowsU.map((u) => html`<tr data-uid="${u.user_id}" style="cursor:pointer" title="${t("ad.u.pick")}">
        <td>${u.display_name || t("ad.u.deleted")}${u.admin ? html` <span class="tag">${t("ad.u.admin")}</span>` : ""}
          <div class="muted" style="font-size:12px">${u.email || ""}</div></td>
        <td class="r num">${fmt(u.visits)}</td><td class="r num">${fmt(u.views)}</td><td class="r num">${fmt(u.days)}</td>
        <td class="num">${fmtDate(u.last, "short")}</td><td>${topName(u) ?? "—"}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.u.none")}</div>`;
    bindSort($("#u-users"));
    $$("[data-uid]", $("#u-users")).forEach((tr) => tr.addEventListener("click", () => {
      account = account === tr.dataset.uid ? "" : tr.dataset.uid;
      saveUsage(); drawUsageFilters(); drawUsage();
    }));

    // per page: views, accounts, share of the views
    const byPage = new Map();
    for (const p of pages) {
      if (p.page === "_visit") continue;
      const a = byPage.get(p.page) || { views: 0, users: new Set() };
      a.views += p.views; a.users.add(p.user_id);
      byPage.set(p.page, a);
    }
    const rowsP = sortRows([...byPage], "pages", ([k, a], key) => (key === "page" ? pageName(k) : key === "accounts" ? a.users.size : a.views));
    const top = Math.max(1, ...rowsP.map(([, a]) => a.views));
    $("#u-pages").innerHTML = rowsP.length ? html`<table class="data compact"><thead><tr>${sortHead("pages", "page", t("ad.u.page"))}
      ${sortHead("pages", "views", t("ad.u.views"), "r")}${sortHead("pages", "share", "%", "r")}${sortHead("pages", "accounts", t("ad.u.accounts"), "r")}</tr></thead>
      <tbody>${rowsP.map(([k, a]) => html`<tr><td>${pageName(k)}
          <div style="height:4px;border-radius:2px;background:var(--s1);opacity:.55;margin-top:4px;width:${(100 * a.views) / top}%"></div></td>
        <td class="r num">${fmt(a.views)}</td><td class="r num">${fmt((100 * a.views) / (views || 1), 1)}</td>
        <td class="r num">${fmt(a.users.size)}</td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t("ad.u.none")}</div>`;
    bindSort($("#u-pages"));
  }

  async function startUsage() {
    bindChartCard(main, "u-chart");
    await loadUsage();
    drawUsageFilters();
    drawUsage();
  }

  showTab();
  return { title: t("ad.title") };
}
