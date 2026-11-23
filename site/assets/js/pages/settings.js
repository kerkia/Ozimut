// Settings: the alerts — each by e-mail and/or push notification (2026-10-18; the agenda's e-mails a right the administrator
// grants, push open to all) —, this device's notifications, the language, password change, account deletion (e-mail
// accounts only).

import { html, $, $$, displayName, fmtDate, fmtRegion } from "../util.js";
import { t, tn, lang, setLang, OPEN, LANGS, LANG_NAMES } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import * as store from "../store.js";
import { link, MODULES, CREATOR_MODULES } from "../app.js";
import { methodShort } from "../ui.js";
import * as pwa from "../pwa.js";
import { inApp, call as appCall } from "../appbridge.js";
import { name as countryName, membershipFields, bindMembershipFields, readMembership, flagImg } from "../country.js";

// The alerts of the table: the user's field for each channel (publicUser, /api/account/settings); `gated`: the e-mail
// needs the administrator's right (users.alerts_allowed) and is not offered at all without it — every alert's e-mail since
// 2026-10-21 (owner: the right allows or refuses all the alert e-mails, the account's own e-mails apart); no `mail`: by
// notification only.
// `lic`: tied to one's FFCO licence (one's own results and start times), offered once France is joined
const ALERTS = [
  { key: "results", mail: "notify", push: "pushResults", gated: true, lic: true },
  { key: "starts", mail: "startsAlert", push: "pushStarts", gated: true, lic: true },
  { key: "agenda", mail: "agendaAlert", push: "pushAgenda", gated: true },
  { key: "deadline", mail: "deadlineAlert", push: "pushDeadline", gated: true },
  // a new article in « Nutrition »: to the accounts that read it (auth.nutritionReads; owner, 2026-11-01)
  { key: "nutrition", mail: "nutMail", push: "pushNut", gated: true, nut: true },
  // « Mes horaires réservés »: a start the organisers moved or cancelled, the day before's reminder (owner, 2026-11-03)
  { key: "booking", mail: "bookMail", push: "pushBook", gated: true },
];

// Same names as the regions of the Agenda page (ffco_scraper/agenda.py).
// the agenda values, proper names (i18n-ignore-next 3)
const REGIONS = ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire", "Corse", "Grand Est",
  "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur", "Outre-mer"];

/** A demo account (admin page, « Démo »): what it is, until when; only the language here (on this device). */
function demoPage(main, user) {
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("st.title")}</h1></div></div>
    <div class="stack" style="max-width:640px">
      <section class="card"><div class="card-head"><h2>${t("st.account")}</h2></div><div class="card-body stack" style="gap:10px">
        <div><b>${user.nom}</b></div>
        <div class="notice info">${t("st.demo", { date: fmtDate(user.demo) })}</div>
        <label class="field"><span>${t("st.lang")}</span><select id="st-lang" style="max-width:220px">
          ${LANGS.map((l) => html`<option value="${l}" lang="${l}" ${l === lang() ? "selected" : ""}>${LANG_NAMES[l]}</option>`)}</select></label>
      </div></section>
      <p class="muted"><a href="#/compte/confidentialite">${t("pv.title")}</a></p>
    </div>`;
  $("#st-lang").addEventListener("change", (e) => setLang(e.target.value));
  return { title: t("st.title") };
}

export async function render(main, { query = {} } = {}) {
  const me = auth.session();
  if (!me.email) {                                  // signed in with name + licence: no account behind it
    main.innerHTML = html`<div class="page-head"><div><h1>${t("st.title")}</h1></div></div>
      <div class="notice info">${t("st.legacy")}</div><a class="btn" href="#/compte/inscription">${t("ac.register")}</a>`;
    return { title: t("st.title") };
  }
  const app = !!inApp();
  const r = await fetch("api/account/me", { credentials: "same-origin", cache: "no-store" });
  const user = r.ok ? await r.json() : null;
  // only an expired session signs out (owner, 2026-10-21: any failure did, a busy server included)
  if (r.status === 401) { window.dispatchEvent(new Event("cnx:unauthorised")); return null; }
  if (!user) throw new Error(`api/account/me: HTTP ${r.status}`);
  if (user.demo) return demoPage(main, user);

  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("st.title")}</h1><p class="lede">${t(app ? "st.lede.app" : "st.lede")}</p></div></div>
    <div class="stack" style="max-width:640px">
      <section class="card"><div class="card-head"><h2>${t("st.account")}</h2></div><div class="card-body stack" style="gap:10px">
        <div><span class="muted">${t("ac.email")}</span><br><b>${user.email}</b></div>
        ${user.lic ? html`<div><span class="muted">${t("st.licensee")}</span><br><a href="${link.runner(user.lic)}">${displayName(user.nom)}</a> · ${t("rn.licence")} ${user.lic}</div>`
          : html`<div><span class="muted">${t("st.name")}</span><br><b>${user.nom}</b></div>`}
        ${OPEN || user.admin ? html`<label class="field"><span>${t("st.lang")}</span><select id="st-lang" style="max-width:220px">
          ${LANGS.map((l) => html`<option value="${l}" lang="${l}" ${l === lang() ? "selected" : ""}>${LANG_NAMES[l]}</option>`)}</select>
          <span class="muted" style="font-size:12.5px">${t("st.lang.hint")}</span></label>` : ""}
      </div></section>

      <section class="card" data-web-only id="st-countries"><div class="card-head"><h2>${t("st.cty.title")}</h2></div><div class="card-body stack" style="gap:12px">
        <p class="soft" style="margin:0">${t("st.cty.hint")}</p>
        <div id="cty-list" class="stack" style="gap:8px"></div>
        <form id="cty-add" class="stack" style="gap:10px"></form>
      </div></section>

      <section class="card"><div class="card-head"><h2>${t("st.alerts.title")}</h2></div><div class="card-body stack" style="gap:10px">
        <table class="alerts-table">
          <thead><tr><th></th><th>${t("st.alerts.mail")}</th><th>${t("st.alerts.push")}</th></tr></thead>
          <tbody>${ALERTS.filter((a) => (!a.lic || user.lic) && (!a.nut || auth.nutritionReads())).map((a) => html`<tr>
            <td><b>${t(`st.alerts.${a.key}`)}</b><br><span class="muted">${t(`st.alerts.${a.key}.hint`)}</span></td>
            <td>${!a.mail ? html`<span class="muted" title="${t("st.alerts.pushOnly")}">—</span>`
              : a.gated && !user.agendaAllowed ? ""
              : html`<input type="checkbox" data-alert="${a.mail}" aria-label="${t(`st.alerts.${a.key}`)} · ${t("st.alerts.mail")}" ${user[a.mail] ? "checked" : ""}>`}</td>
            <td><input type="checkbox" data-alert="${a.push}" aria-label="${t(`st.alerts.${a.key}`)} · ${t("st.alerts.push")}" ${user[a.push] ? "checked" : ""}></td>
          </tr>`)}</tbody>
        </table>
        <div id="ag-regions" hidden>
          <div class="row" style="gap:8px;margin-bottom:8px"><b style="font-size:13.5px">${t("st.ag.regions")}</b>
            <button type="button" class="btn btn-ghost btn-sm" id="ag-all">${t("st.ag.all")}</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ag-none">${t("st.ag.clear")}</button></div>
          <div class="ag-grid">${REGIONS.map((r) => html`<label class="check"><input type="checkbox" data-region="${r}" ${user.agendaRegions.includes(r) ? "checked" : ""}><span>${fmtRegion(r)}</span></label>`)}</div>
        </div>
        <div class="notice" id="ag-hint" hidden>${t("st.ag.none")}</div>
        <div class="notice ok" id="alerts-ok" hidden>${t("st.saved")}</div>
      </div></section>

      <section class="card" data-web-only id="st-modules"><div class="card-head"><h2>${t("st.mod.title")}</h2></div><div class="card-body stack" style="gap:8px">
        <p class="muted" style="margin:0;font-size:12.5px">${t("st.mod.lede")}</p>
        <b class="st-mod-h">${t("st.mod.consumers")}</b>
        ${MODULES.filter((m) => !CREATOR_MODULES.includes(m) && (m !== "pixel" || user.admin)).map((m) => html`<label class="check"><input type="checkbox" data-mod-box="${m}" ${(user.hiddenModules || []).includes(m) ? "" : "checked"}><span><b>${t(`mod.${m}`)}</b> · ${t(`mod.${m}.tag`)}</span></label>`)}
        <b class="st-mod-h">${t("st.mod.creators")}</b>
        ${CREATOR_MODULES.map((m) => html`<label class="check"><input type="checkbox" data-mod-box="${m}" ${user[m] ? "checked" : ""}><span><b>${t(`mod.${m}`)}</b> · ${t(`mod.${m}.tag`)}</span></label>`)}
        <p class="muted" style="margin:0;font-size:12.5px">${t("st.mod.hint")}</p>
      </div></section>

      ${store.METHODS.every((m) => store.available().includes(m)) && auth.sees("FR") ? html`<section class="card" data-web-only><div class="card-head"><h2>${t("st.arenaM.title")}</h2></div><div class="card-body stack" style="gap:8px">
        <div class="seg" role="group" aria-label="${t("st.arenaM.title")}">${store.METHODS.map((m) => html`<button type="button" data-arena-m="${m}" aria-pressed="${String(store.arenaMethod() === m)}" title="${t(`m.${m}.tip`)}">${methodShort(m)}</button>`)}</div>
        <p class="muted" style="margin:0;font-size:12.5px">${t("st.arenaM.hint")}</p>
      </div></section>` : ""}

      <section class="card"><div class="card-head"><h2>${t("st.push.title")}</h2></div><div class="card-body stack" style="gap:8px">
        <p class="soft" style="margin:0">${t("st.push.hint")}</p>
        <div id="push-device" class="stack" style="gap:8px"></div>
      </div></section>

      <section class="card" data-web-only><div class="card-head"><h2>${t("st.app.title")}</h2></div><div class="card-body stack" style="gap:8px">
        <p class="soft" style="margin:0">${t("st.app.hint")}</p>
        <div id="app-device" class="stack" style="gap:8px"></div>
      </div></section>

      <section class="card" data-web-only><div class="card-head"><h2>${t("st.pw.title")}</h2></div><div class="card-body">
        <form id="pw" class="stack" style="gap:12px;max-width:360px">
          <label class="field"><span>${t("st.pw.old")}</span><input name="old" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>${t("st.pw.new")} <span class="muted">· ${t("ac.password.hint")}</span></span><input name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="200"></label>
          <div class="notice" hidden></div>
          <button class="btn" type="submit">${t("st.pw.submit")}</button>
        </form></div></section>

      <section class="card" data-web-only><div class="card-head"><h2>${t("st.del.title")}</h2></div><div class="card-body">
        <p class="soft" style="margin:0 0 12px">${t("st.del.lede")}</p>
        <form id="del" class="stack" style="gap:12px;max-width:360px">
          <label class="field"><span>${t("ac.password")}</span><input name="password" type="password" autocomplete="current-password" required></label>
          <div class="notice" hidden></div>
          <button class="btn" type="submit" style="color:var(--bad)">${t("st.del.submit")}</button>
        </form></div></section>

      ${app ? html`<div><button type="button" class="btn" id="st-logout">${t("auth.logout")}</button></div>` : ""}
      <p class="muted"><a href="#/compte/confidentialite">${t("pv.title")}</a></p>
    </div>`;
  // the Ozimut app is a companion (docs/app/design.md): the settings that belong to the phone — the alerts, its notifications,
  // the language, signing out; the account itself (password, countries, modules, deletion) is the website's
  if (app) $$("[data-web-only]", main).forEach((el) => el.parentNode.removeChild(el));
  $("#st-logout")?.addEventListener("click", async () => { await auth.logout(); location.hash = "#/"; location.reload(); });

  const flash = (el, text, ok) => { el.textContent = text; el.className = `notice${ok ? " ok" : ""}`; el.hidden = false; };

  // Arena's ranking method (owner, 2026-10-31), on this device as Stats' choice is
  $$("[data-arena-m]").forEach((b) => b.addEventListener("click", () => {
    store.setArenaMethod(b.dataset.arenaM);
    $$("[data-arena-m]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  // « Mes pays » (owner, 2026-10-20): the countries joined — club, member id, checked or declared —, each changed or left;
  // another joined. France is checked against FFCO's licensees with the account's own first name and surname. A change
  // of country changes what the site may show: the page starts again (the data loaded for France, or without it, goes).
  const countries = user.countries || [];
  const errText = (r) => (r.status === 429 ? t("ac.err.rate") : r.data?.error === "mismatch" ? t("st.cty.err.mismatch")
    : r.data?.error === "id" ? t("ac.reg.err.id") : r.data?.error === "country" ? t("ac.reg.err.country") : t("ac.err.generic"));
  const restart = async () => { await auth.refresh(); data.dropPrivate(); location.hash = "#/reglages?onglet=pays"; location.reload(); };
  function drawCountries(editing = null) {
    $("#cty-list").innerHTML = countries.length ? countries.map((c) => (c.cc === editing
      ? html`<form class="cty-row stack" style="gap:8px" data-edit="${c.cc}">${membershipFields("e", { row: c, fixed: true })}
          <div class="notice" hidden></div>
          <div class="row" style="gap:8px"><button class="btn btn-primary btn-sm" type="submit">${t("st.cty.save")}</button>
            <button class="btn btn-ghost btn-sm" type="button" data-cancel>${t("st.cty.cancel")}</button></div></form>`
      : html`<div class="cty-row row" style="gap:10px;flex-wrap:wrap;align-items:center">
          <b>${flagImg(c.cc)}${countryName(c.cc)}</b>
          <span class="muted">${[c.club, c.id && (c.cc === "FR" ? `${t("rn.licence")} ${c.id}` : c.id)].filter(Boolean).join(" · ")}</span>
          <span class="tag">${t(`st.cty.status.${c.status === "ok" ? (c.cc === "FR" ? "checked" : "declared") : c.status}`)}</span>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" type="button" data-edit-cc="${c.cc}">${t("st.cty.edit")}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-leave="${c.cc}" style="color:var(--bad)">${t("st.cty.leave")}</button></div>`)).join("")
      : html`<p class="muted" style="margin:0">${t("st.cty.none")}</p>`.toString();
    $("#cty-add").innerHTML = html`<b style="font-size:13.5px">${t("st.cty.addTitle")}</b>
      ${membershipFields("a", { allowNone: true, except: countries.map((c) => c.cc) })}
      <div class="notice" hidden></div>
      <div><button class="btn btn-primary btn-sm" type="submit">${t("st.cty.join")}</button></div>`;
    bindMembershipFields($("#st-countries"));
    $$("[data-edit-cc]").forEach((b) => b.addEventListener("click", () => drawCountries(b.dataset.editCc)));
    $("[data-cancel]")?.addEventListener("click", () => drawCountries());
    $$("[data-leave]").forEach((b) => b.addEventListener("click", async () => {
      const cc = b.dataset.leave;
      if (!confirm(t(cc === "FR" ? "st.cty.leaveFR" : "st.cty.leaveOne", { country: countryName(cc) }))) return;
      b.disabled = true;
      const res = await auth.api("api/account/countries", { country: cc, leave: true });
      if (res.ok) restart(); else { b.disabled = false; alert(errText(res)); }
    }));
    $("[data-edit]")?.addEventListener("submit", (e) => send(e, "e"));
    $("#cty-add").onsubmit = (e) => send(e, "a");
  }
  async function send(e, prefix) {
    e.preventDefault();
    const form = e.target, m = readMembership(form, prefix), err = $(".notice", form), btn = $("button[type=submit]", form);
    if (!m) { flash(err, t("st.cty.pick")); return; }
    btn.disabled = true;
    const res = await auth.api("api/account/countries", m);
    if (res.ok) restart(); else { btn.disabled = false; flash(err, errText(res)); }
  }
  if (!app) drawCountries();
  if (query.onglet === "pays") $("#st-countries")?.scrollIntoView({ block: "start" });
  if (query.onglet === "modules") $("#st-modules")?.scrollIntoView({ block: "start" });

  // the language: on the account (its e-mails), then on this device, the page drawn again in it
  $("#st-lang")?.addEventListener("change", (e) => {
    const l = e.target.value;
    auth.api("api/account/settings", { lang: l }).catch(() => {}).finally(() => setLang(l));
  });
  // the modules shown (migrations 0016, 0027; owner, 2026-11-12): each box saved as it changes, the bar drawn again — the
  // creators' modules by their own switch, the consumers' as the list of those unticked
  $$("[data-mod-box]").forEach((b) => b.addEventListener("change", async (e) => {
    const box = e.target, m = box.dataset.modBox;
    box.disabled = true;
    const res = await auth.api("api/account/settings", CREATOR_MODULES.includes(m) ? { [m]: box.checked }
      : { hiddenModules: $$("[data-mod-box]").filter((x) => !x.checked && !CREATOR_MODULES.includes(x.dataset.modBox)).map((x) => x.dataset.modBox) });
    box.disabled = false;
    if (!res.ok) { box.checked = !box.checked; return; }
    await auth.refresh();
    window.dispatchEvent(new Event("ocn:countries"));
  }));
  // the alerts: each box saved as it changes; the regions shown while an agenda alert is on, by either channel
  const agendaOn = () => $$("[data-alert]").some((i) => i.checked && /^(agendaAlert|deadlineAlert|pushAgenda|pushDeadline)$/.test(i.dataset.alert));
  const regions = () => $$("[data-region]").filter((i) => i.checked).map((i) => i.dataset.region);
  const showRegions = () => {
    $("#ag-regions").hidden = !agendaOn();
    $("#ag-hint").hidden = !(agendaOn() && !regions().length);
  };
  const saved = () => {
    $("#alerts-ok").hidden = false;
    setTimeout(() => { const n = $("#alerts-ok"); if (n) n.hidden = true; }, 2500);
  };
  showRegions();
  $$("[data-alert]").forEach((box) => box.addEventListener("change", async () => {
    box.disabled = true;
    const res = await auth.api("api/account/settings", { [box.dataset.alert]: box.checked });
    box.disabled = false;
    if (!res.ok) { box.checked = !box.checked; return; }
    showRegions();
    saved();
    if (box.dataset.alert.startsWith("push")) drawDevice();
  }));
  async function saveRegions() {
    showRegions();
    if ((await auth.api("api/account/settings", { agendaRegions: regions() })).ok) saved();
  }
  $$("[data-region]").forEach((i) => i.addEventListener("change", saveRegions));
  $("#ag-all").addEventListener("click", () => { $$("[data-region]").forEach((i) => (i.checked = true)); saveRegions(); });
  $("#ag-none").addEventListener("click", () => { $$("[data-region]").forEach((i) => (i.checked = false)); saveRegions(); });

  // this device: its notifications on or off (the browser asks first), a test
  const push = await import("../push.js");
  async function drawDevice(note = "") {
    const box = $("#push-device");
    if (!box) return;
    const [state, cfg] = await Promise.all([push.deviceState(), push.getConfig(true)]);
    const n = cfg?.devices || 0;
    const wanted = $$("[data-alert]").some((i) => i.checked && i.dataset.alert.startsWith("push"));
    box.innerHTML = html`<p style="margin:0"><b>${t("st.push.dev.title")}</b> ${t(app && state === "denied" ? "st.push.dev.denied.app" : app && state === "unsupported" ? "st.push.dev.unsupported.app" : `st.push.dev.${state}`)}</p>
      ${app && state === "denied" ? html`<div><button type="button" class="btn btn-sm" id="push-sys">${t("st.push.sys")}</button></div>` : ""}
      ${state === "on" ? html`<div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm" id="push-test">${t("st.push.test")}</button>
          <button type="button" class="btn btn-ghost btn-sm" id="push-off">${t("st.push.off")}</button></div>`
        : state === "off" ? html`<div><button type="button" class="btn btn-primary btn-sm" id="push-on">${t("st.push.on")}</button></div>` : ""}
      ${n ? html`<p class="muted" style="margin:0;font-size:12.5px">${tn("st.push.devices", n)}</p>` : ""}
      ${state === "on" && !wanted ? html`<p class="muted" style="margin:0;font-size:12.5px">${t("st.push.noneWanted")}</p>` : ""}
      ${note ? html`<div class="notice">${note}</div>` : ""}`;
    $("#push-sys")?.addEventListener("click", () => appCall("openSettings").catch(() => {}));
    $("#push-on")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      const s = await push.enable();
      drawDevice(s === "on" || s === "denied" ? "" : t("st.push.failed"));
    });
    $("#push-off")?.addEventListener("click", async (e) => { e.target.disabled = true; await push.disable(); drawDevice(); });
    $("#push-test")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      const r = await push.test();
      drawDevice(r === null ? t("st.push.test.fail") : r === 0 ? t("st.push.test.none") : tn("st.push.test.sent", r));
    });
  }
  drawDevice();

  // this device: the app installed, or how to install it (pwa.js)
  function drawApp() {
    const box = $("#app-device");
    if (!box) return;
    const state = pwa.installState();
    box.innerHTML = html`<p style="margin:0"><b>${t("st.push.dev.title")}</b> ${t(`st.app.${state}`)}</p>
      ${state === "ready" ? html`<div><button type="button" class="btn btn-primary btn-sm" id="app-install">${t("pwa.install")}</button></div>` : ""}`;
    $("#app-install")?.addEventListener("click", () => pwa.install());
  }
  drawApp();
  window.addEventListener("ocn:install", drawApp);

  $("#pw")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target), err = $(".notice", e.target);
    const res = await auth.api("api/account/password", { old: f.get("old"), password: f.get("password") });
    if (res.ok) { e.target.reset(); flash(err, t("st.pw.ok"), true); }
    else flash(err, res.status === 401 ? t("st.pw.bad") : res.status === 422 ? t("ac.reg.err.password") : res.status === 429 ? t("ac.err.rate") : t("ac.err.generic"));
  });

  $("#del")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!confirm(t("st.del.confirm"))) return;
    const err = $(".notice", e.target);
    const res = await auth.api("api/account/delete", { password: new FormData(e.target).get("password") });
    if (!res.ok) { flash(err, res.status === 401 ? t("st.pw.bad") : t("ac.err.generic")); return; }
    auth.forget();
    data.dropPrivate();
    store.set({ lastRunner: null, compare: [], clubs: [] });
    location.hash = "#/";
    location.reload();
  });
  return { title: t("st.title"), cleanup: () => window.removeEventListener("ocn:install", drawApp) };
}
