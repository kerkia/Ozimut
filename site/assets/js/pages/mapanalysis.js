// « Analyse de carte » (owner, 2026-11-04, second design: « the first thing the page must show is the list of open events »):
// Coach's GPS analyses start from the events whose organisers opened a map analysis — competitions and trainings —, listed
// with the usual filters (period, country, type, organising club, a search) beside the country's map (agendamap.js, as the
// Agenda's), each row's map shown as a thumbnail under the mouse. An event chosen offers three ways in: watch it with every
// runner (pages/shared.js), add one's own track and compare it with the others (the same page, `ajout=1`: its drop opens at
// once), or add one's track and replay it alone on the organiser's map, nothing sent (« Analyse solo » in its organiser's
// mode, pages/analysis.js route analysisOrga). « Ajouter mon propre événement » opens « Analyse solo » on one's own map and
// track (#/analyse-solo). The tiles of 2026-11-01 are gone (`?choix=` addresses lead here); a race's analysis with its
// published times (#/analyse?course=) stays Arena's.

import { appKey } from "../appbridge.js";
// (the wordings appKey chooses, named here for the per-page texts of a deploy: front_build reads the keys written as strings)
export const APP_KEYS = ["ma.guest.account.app", "ma.guest.club.app", "ma.guest.locked.app", "ma.go.account.app"];
import { html, raw, esc, $, $$, fmt, fmtDate, normalise } from "../util.js";
import { t, tn, has } from "../i18n.js";
import * as auth from "../auth.js";
import * as country from "../country.js";
import * as agendaMap from "../agendamap.js";
import { getProv, clock } from "./provisional.js";
import { replaceQuery } from "../app.js";
import * as SK from "../trace/solokeep.js";
import { confirmBox } from "../askbox.js";

// the page's address since 2026-11-07 (owner: « Analyse » has been its name since the 5th); #/analyse-carte still opens it
const HOME = "#/analyses";
/** Where a published event opens: its analysis with every runner (`add`: its track drop at once), or « Analyse solo » on its map. */
export const multiHref = (a, add = false) => `${a.kind === "race" ? "#/analyse-competition" : "#/analyse-club"}?id=${a.id}${add ? "&ajout=1" : ""}`;
export const orgaHref = (id) => `#/analyse-orga?id=${id}`;
/** A club's analysis to a non-member (owner, 2026-11-07): whose it is, and to ask its organiser for the code (`code`: one is
 *  set, to be typed below), else to ask them for one. `club` the club's name, `name` the organiser's. */
export const clubAsk = (code, club, name) => t(code ? "ma.club.code" : "ma.club.nocode",
  { club: club || t("ma.club.club0"), who: name ? t("ma.club.who", { name }) : t("ma.club.who0") });
/** The line back to this page, at the top of every analysis it leads to. */
export const backLine = () => html`<p class="ma-crumb"><a href="${HOME}">‹ ${t("ma.title")}</a></p>`;

async function api(path, { blob = false, key = "" } = {}) {
  const r = await fetch(`api/analyses${auth.session() ? "" : "/v"}${path}`, { credentials: "same-origin", headers: key ? { "X-Analysis-Key": key } : {} });
  if (blob && r.ok) return r.blob();
  const d = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(d?.error || `http ${r.status}`), { code: d?.error });
  return d;
}
const keyOf = (id) => { try { return sessionStorage.getItem(`ocn.an.key.${id}`) || ""; } catch (e) { return ""; } };
const setKey = (id, k) => { try { sessionStorage.setItem(`ocn.an.key.${id}`, k); } catch (e) { /* this visit only */ } };

// the periods offered: an event's day on or after today less so many months
const PERIODS = { 3: 3, 12: 12, all: null };
const since = (months) => {
  if (!months) return "";
  const d = new Date(); d.setMonth(d.getMonth() - months);
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
};
/** A club as the results write it (« 0109 - O'BUGEY ») without its number. */
const clubName = (s) => String(s || "").replace(/^\s*\d{3,4}\s*-\s*/, "").trim();

/** A map's centre [lat, lon] from its georeference (pixels of a w × h image), or null. */
function centreOf(m) {
  const g = m.geo;
  if (!g || !m.w || !m.h) return null;
  const det = g.a * g.e - g.b * g.d, x = m.w / 2 - g.c, y = m.h / 2 - g.f;
  return det ? [(g.a * y - g.d * x) / det, (g.e * x - g.b * y) / det] : null;
}

export async function render(main, r) {
  const me = auth.session(), q0 = r.query;
  // an address of before: written as today's, its query kept
  if (location.hash.startsWith("#/analyse-carte")) history.replaceState(history.state, "", location.hash.replace("#/analyse-carte", HOME));
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("ma.title")}</h1><p class="lede">${t("ma.lede")}</p></div>
      <div class="page-actions"><a class="btn" href="#/analyse-solo" title="${t("ma.own.tip")}">＋ ${t("ma.own")}</a></div></div>
    <div id="ma-filters"></div>
    <div class="ma-pick">
      <section class="card ma-list"><div class="table-wrap" id="ma-table"><div class="empty">${t("misc.loading")}</div></div></section>
      <aside class="ma-side"><section class="card ma-detail" id="ma-detail"></section><div class="ma-map" id="ma-map" hidden></div></aside>
    </div>
    <div class="ma-pop" id="ma-pop" hidden><img alt=""></div>`;

  // ---- the events: every analysis with a circuit this account (or visitor) may open
  const idx = await getProv("index.json").catch(() => null);
  const races = idx?.races || [];
  const raceOf = (k) => (k ? races.find((x) => x.key === k) || null : null);
  let data = null;
  try { data = await api(""); } catch (e) { $("#ma-table").innerHTML = html`<div class="empty">${t("ma.err")}</div>`; return { title: t("ma.title") }; }
  // a draft is never listed here, not even to its organisers or an administrator (owner, 2026-11-19: Orga's list is where they
  // see it; an analysis taken back to draft leaves Coach's list at once)
  const all = data.analyses.filter((a) => a.courses > 0 && !a.draft).map((a) => {
    const rc = raceOf(a.race);
    return { key: a.id, a, name: a.title, date: a.date, kind: a.kind, place: rc?.place || "", pos: a.pos || rc?.pos || null,
      cc: a.cc || (rc ? country.of(rc) : ""), org: a.orgSet ? a.orgName || "" : a.orgName || rc?.org || "",       // (as the organisers set it, none included)
      courses: a.courses, runners: a.runners || 0,
      locked: a.access === "locked", clubOnly: a.vis === "club", organiser: !!a.organiser, thumb: a.thumb ?? null,
      // a club's analysis this account is not a member of (owner, 2026-11-07: listed to all, its code asked of its organiser)
      shut: a.access === "club", code: !!a.code,
      // a visitor without an account sees every published event too (owner, 2026-11-21), those open to accounts only said so
      needs: a.access === "account" };
  });
  // the account's kept solo analyses (owner, 2026-11-05: « Analyse solo »'s « Enregistrer l'analyse », trace/solokeep.js — runs of
  // « Mes cartes » since 2026-11-24), seen
  // by their owner alone, replayed or deleted here — in every country's list
  if (me && !me.demo) {
    try {
      for (const a of await SK.list()) {
        all.push({ key: `s:${a.id}`, solo: a, name: a.title || t("ma.solo.untitled"), date: a.day || "", kind: "solo",
          place: "", pos: centreOf(a), cc: "", org: "", courses: null, runners: null, thumb: "solo" });
      }
    } catch (e) { console.warn(e); }                     // the events alone
  }
  // the site's country's events; another country picked takes its own in place (onCountry: nothing else moves)
  let cc, items, byKey, clubs;
  const forCountry = () => {
    cc = country.current();
    // an event without a country (a training of before): in every country's list
    items = all.filter((e) => !e.cc || e.cc === cc || cc === country.ALL).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name));
    byKey = new Map(items.map((e) => [e.key, e]));
    clubs = [...new Set(items.map((e) => e.org).filter(Boolean))].sort((a, b) => clubName(a).localeCompare(clubName(b)));
  };
  forCountry();

  // ---- the filters, kept in the address
  const st = {
    per: Object.hasOwn(PERIODS, q0.per) ? q0.per : "12",
    type: ["race", "club", "solo"].includes(q0.type) ? q0.type : "all",
    club: clubs.includes(q0.club) ? q0.club : "",
    q: q0.q || "",
  };
  let selected = byKey.has(q0.id) ? q0.id : null;
  // an event its organisers opened to their club's members only (owner, 2026-11-05: said in the list)
  const clubTag = (e) => (e.clubOnly ? html` <span class="tag ma-club-only" title="${clubName(e.org) ? t("ma.clubOnly.tip", { club: clubName(e.org) }) : t("ma.clubOnly.tip0")}">${t("ma.clubOnly")}</span>`
    : e.needs ? html` <span class="tag ma-club-only" title="${t("ma.accOnly.tip")}">${t("ma.accOnly")}</span>` : "");
  // a visitor without an account on an event they cannot open: why, and the two ways to an account
  const guestAsk = (e) => raw(t(appKey(e.needs ? "ma.guest.account" : e.shut ? "ma.guest.club" : "ma.guest.locked"),
    { club: esc(clubName(e.org) || t("ma.club.club0")), a: `<a href="#/compte/inscription">`, b: "</a>", c: `<a href="#/?s=login">`, d: "</a>" }));
  const seg = (name, list, cur) => html`<div class="seg" role="group" aria-label="${t(`ma.${name}`)}">${list.map(([k, l]) =>
    html`<button type="button" class="seg-btn${k === cur ? " on" : ""}" data-${name}="${k}" aria-pressed="${k === cur}">${l}</button>`)}</div>`;
  $("#ma-filters").innerHTML = html`<div class="filters ma-filters">
      <div class="field"><span>${t("ma.per")}</span>${seg("per", [["3", t("ma.per.3")], ["12", t("ma.per.12")], ["all", t("ma.per.all")]], st.per)}</div>
      <div class="field"><span>${t("ma.type")}</span>${seg("type", [["all", t("ma.kind.all")], ["race", t("ma.kinds.race")], ["club", t("ma.kinds.club")], ...(me && !me.demo ? [["solo", t("ma.kinds.solo")]] : [])], st.type)}</div>
      <label class="field"><span>${t("ma.club")}</span><select id="ma-club"></select></label>
      <label class="field"><span>${t("ma.search")}</span><input type="search" id="ma-q" value="${st.q}" placeholder="${t("ma.search.ph")}" style="width:220px"></label></div>
    <div id="ma-hint"></div>`;
  const clubOptions = () => {
    $("#ma-club").innerHTML = html`<option value="">${t("ma.club.all")}</option>${clubs.map((c) => html`<option value="${c}" ${raw(c === st.club ? "selected" : "")}>${clubName(c)}</option>`)}`;
  };
  const hintLine = () => { $("#ma-hint").innerHTML = country.hint(all.map((e) => e.cc).filter(Boolean)); };
  clubOptions();
  hintLine();
  for (const name of ["per", "type"]) {
    $$(`#ma-filters [data-${name}]`).forEach((b) => b.addEventListener("click", () => {
      st[name] = b.dataset[name];
      $$(`#ma-filters [data-${name}]`).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
      draw();
    }));
  }
  $("#ma-club").addEventListener("change", (e) => { st.club = e.target.value; draw(); });
  $("#ma-q").addEventListener("input", (e) => { st.q = e.target.value; draw(); });
  const keep = (e) => {
    const from = since(PERIODS[st.per]);
    return (!from || (e.date || "") >= from) && (st.type === "all" || e.kind === st.type) && (!st.club || e.org === st.club)
      && (!st.q || normalise(`${e.name} ${e.place} ${clubName(e.org)}`).includes(normalise(st.q)));
  };
  const address = () => replaceQuery({ per: st.per !== "12" ? st.per : null, type: st.type !== "all" ? st.type : null, club: st.club || null, q: st.q || null, id: selected || null });

  // ---- the list
  let shown = [];
  function draw() {
    shown = items.filter(keep);
    if (selected && !shown.some((e) => e.key === selected)) selected = null;
    // each event on two lines (owner, 2026-11-05: no sideways scrollbar): date over type, name over place and club, circuits over runners
    $("#ma-table").innerHTML = shown.length ? html`<table class="data compact ma-table ma-two"><thead><tr>
        <th>${t("f.date")}<div class="ma-l2">${t("ma.col.kind")}</div></th><th>${t("ma.col.event")}<div class="ma-l2">${t("agd.col.place")} · ${t("ma.club")}</div></th>
        <th class="r">${t("sh.col.courses")}<div class="ma-l2" title="${t("ma.col.runners.tip")}">${t("ma.col.runners")}</div></th></tr></thead>
      <tbody>${shown.map((e) => html`<tr data-key="${e.key}" tabindex="0" class="${e.key === selected ? "sel" : ""}">
        <td class="num ma-when">${fmtDate(e.date, "short")}<div class="ma-l2"><span class="tag">${t(`ma.kind.${e.kind}`)}</span></div></td>
        <td class="ma-name"><b class="ma-ev">${e.name}</b>${e.locked ? html` <span title="${t("ma.locked")}">🔒</span>` : ""}${clubTag(e)}<div class="muted ma-sub ma-l2">${[e.place, clubName(e.org)].filter(Boolean).join(" · ") || "—"}</div></td>
        <td class="r num">${e.courses ?? "—"}<div class="ma-l2 muted">${e.runners ?? "—"}</div></td></tr>`)}</tbody></table>`
      : html`<div class="empty">${t(items.length ? "ra.emptyFilter" : "ma.events.none")}</div>`;
    // no event of this country but events elsewhere (owner, 2026-11-22: with « IOF WRE » chosen only the solos were left, and the
    // events seemed gone): said above the list, with the countries that have some
    if (st.type !== "solo" && !shown.some((e) => !e.solo)) {
      const per = new Map();
      for (const e of all) if (!e.solo && e.cc && !byKey.has(e.key) && keep(e)) per.set(e.cc, (per.get(e.cc) || 0) + 1);
      const ccs = [...per.keys()].sort((a, b) => per.get(b) - per.get(a)).slice(0, 4);
      if (ccs.length) {
        const btn = (k, label) => html`<button type="button" class="btn btn-sm" data-ma-cty="${k}">${country.flagImg(k)} ${label}</button>`;
        $("#ma-table").insertAdjacentHTML("afterbegin", html`<p class="ma-elsewhere">${t("ma.elsewhere", { country: country.name(cc) })}
          ${ccs.map((k) => btn(k, `${country.name(k)} (${per.get(k)})`))}${per.size > 1 ? btn(country.ALL, country.name(country.ALL)) : ""}</p>`);
      }
    }
    // where an event comes from (named, not linked: no page leads into another module)
    $("#ma-table").insertAdjacentHTML("beforeend", html`<p class="hint ma-how">${t("ma.events.how", { path: t("mod.orga") })}</p>`);
    map?.show(shown, selected);
    detail();
    address();
  }

  // ---- a circuit's thumbnail (the organiser's map with its course drawn), read once a visit
  const thumbs = new Map();
  const thumbOf = (e) => {
    if (e.solo) return Promise.resolve(SK.thumbUrl(e.solo));
    if (e.thumb == null || e.needs || ((e.locked || e.shut) && !keyOf(e.key))) return Promise.resolve(null);
    if (!thumbs.has(e.key)) thumbs.set(e.key, api(`/${e.key}/thumb/${e.thumb}`, { blob: true, key: keyOf(e.key) }).then((b) => URL.createObjectURL(b)).catch(() => null));
    return thumbs.get(e.key);
  };

  // ---- the event chosen: its facts, its map, and the three ways in
  function detail() {
    const e = byKey.get(selected), box = $("#ma-detail");
    if (!e) { box.innerHTML = html`<div class="card-body"><p class="muted">${t("ma.pick.hint")}</p></div>`; return; }
    if (e.solo) { soloDetail(e, box); return; }
    const a = e.a, locked = e.locked && !keyOf(e.key), shut = e.shut && !keyOf(e.key);
    const facts = [fmtDate(e.date), e.place, clubName(e.org)].filter(Boolean);
    const way = (href, label, hint, primary = false) => html`<a class="btn ${primary ? "btn-primary" : ""} ma-go" href="${href}"><b>${label}</b><span>${hint}</span></a>`;
    const codeRow = (ph) => html`<div class="row" style="gap:8px"><input type="password" id="ma-pw" placeholder="${ph}" autocomplete="off" style="width:180px">
        <button type="button" class="btn btn-primary" id="ma-unlock">${t("ma.unlock")}</button></div><p class="muted" id="ma-pw-note"></p>`;
    box.innerHTML = html`<div class="card-body">
      <h2 class="ma-d-title">${e.name}</h2><p class="muted">${facts.join(" · ")}</p>
      <p><span class="tag">${t(`ma.kind.${e.kind}`)}</span>${clubTag(e)} ${tn("ma.courses", e.courses)} · ${tn("ma.runners", e.runners)}</p>
      ${!me && (e.needs || shut || locked) ? html`<p class="ma-club-ask">${guestAsk(e)}</p>`
      : shut ? html`<p class="ma-club-ask">${clubAsk(e.code, clubName(e.org), a.ownerName)}</p>${e.code ? codeRow(t("ma.code")) : ""}`
      : locked ? html`<p class="muted">${t("ma.locked.ask")}</p>${codeRow(t("sh.pw"))}`
      : html`<div class="ma-ways">
        ${way(multiHref(a), t("ma.go.view"), t("ma.go.view.hint"), !me)}
        ${me && a.upload !== false ? way(multiHref(a, true), t("ma.go.add"), t("ma.go.add.hint"), true) : ""}
        ${me && a.solo !== false ? way(orgaHref(a.id), t("ma.go.solo"), t("ma.go.solo.hint")) : ""}
        ${!me ? html`<p class="muted">${raw(t(appKey("ma.go.account"), { a: `<a href="#/compte/inscription">`, b: "</a>", c: `<a href="#/?s=login">`, d: "</a>" }))}</p>`
          : a.upload === false && !a.organiser ? html`<p class="muted">${t("ma.go.closed")}</p>` : ""}</div>`}
      <div class="ma-d-thumb" id="ma-d-thumb" hidden><img alt="${t("ma.thumb.alt", { name: e.name })}"></div></div>`;
    thumbOf(e).then((url) => { const b = $("#ma-d-thumb"); if (url && b && selected === e.key) { $("img", b).src = url; b.hidden = false; } });
    const go = async () => {
      try {
        const r = await fetch(`api/analyses/${e.key}/unlock`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#ma-pw").value }) });
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error);
        setKey(e.key, d.key); thumbs.delete(e.key); detail();
      } catch (err) { $("#ma-pw-note").textContent = t(shut ? "ma.code.wrong" : "ma.pw.wrong"); }
    };
    $("#ma-unlock")?.addEventListener("click", go);
    $("#ma-pw")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
  }
  /** A kept solo analysis chosen: what it is, and a box « Analyse » with « Rejouer » (straight to its playback), « Renommer »
   *  and « Supprimer » (owner, 2026-11-05: small buttons side by side). */
  function soloDetail(e, box) {
    const a = e.solo;
    const facts = [fmtDate(e.date), a.dist ? `${fmt(a.dist / 1000, 2)} km` : "", a.dur ? clock(a.dur) : ""].filter(Boolean);
    box.innerHTML = html`<div class="card-body">
      <h2 class="ma-d-title">${e.name}</h2><p class="muted">${facts.join(" · ")}</p>
      <p><span class="tag">${t("ma.kind.solo")}</span> <span class="muted">${t("ma.solo.mine")}</span></p>
      <fieldset class="ma-solo-box"><legend>${t("ma.solo.box")}</legend>
        <div class="ma-solo-acts"><a class="btn btn-sm btn-primary" href="#/analyse-solo?analyse=${a.id}" title="${t("ma.solo.replay.hint")}">${t("ma.solo.replay")}</a>
          <button type="button" class="btn btn-sm" id="ma-solo-ren">${t("ma.solo.rename")}</button>
          <button type="button" class="btn btn-sm" id="ma-solo-del" title="${t("ma.solo.delete.hint")}">${t("ma.solo.delete")}</button></div>
        <form class="ma-solo-name" id="ma-solo-form" hidden><input type="text" id="ma-solo-title" maxlength="200" value="${e.name}" aria-label="${t("an.keep.name")}">
          <button type="submit" class="btn btn-sm btn-primary">${t("sh.save")}</button><button type="button" class="btn btn-sm" id="ma-solo-cancel">${t("sh.cancel")}</button></form>
        <p class="muted" id="ma-solo-note"></p></fieldset>
      <div class="ma-d-thumb" id="ma-d-thumb" hidden><img alt="${t("ma.thumb.alt", { name: e.name })}"></div></div>`;
    thumbOf(e).then((url) => { const b = $("#ma-d-thumb"); if (url && b && selected === e.key) { $("img", b).src = url; b.hidden = false; } });
    const form = $("#ma-solo-form"), input = $("#ma-solo-title");
    $("#ma-solo-ren").addEventListener("click", () => { form.hidden = false; input.focus(); input.select(); });
    $("#ma-solo-cancel").addEventListener("click", () => { form.hidden = true; input.value = e.name; });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const title = input.value.trim();
      if (!title || title === e.name) { form.hidden = true; return; }
      $$("button", form).forEach((x) => { x.disabled = true; });
      try {
        await SK.rename(a.id, title);
        a.title = title; e.name = title;
        draw();                                              // the list and this card again, the event still chosen
      } catch (err) { console.error(err); $("#ma-solo-note").textContent = t("ma.solo.renErr"); $$("button", form).forEach((x) => { x.disabled = false; }); }
    });
    $("#ma-solo-del").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      if (!(await confirmBox(t("ma.solo.delete.confirm", { name: e.name })))) return;
      btn.disabled = true;
      try {
        await SK.remove(a.id);
        all.splice(all.indexOf(e), 1);
        selected = null;
        await onCountry();
      } catch (err) { console.error(err); $("#ma-solo-note").textContent = t("ma.solo.delErr"); $("#ma-solo-del").disabled = false; }
    });
  }
  function select(key) {
    selected = key;
    $$("#ma-table tr[data-key]").forEach((r) => r.classList.toggle("sel", r.dataset.key === key));
    map?.select(key);
    detail();
    address();
  }

  // ---- the thumbnail beside the row under the mouse (a mouse only: on a touch screen the chosen event's card shows it)
  const pop = $("#ma-pop"), hover = matchMedia("(hover: hover)");
  let popKey = null, popTimer = 0;
  const hidePop = () => { clearTimeout(popTimer); popKey = null; pop.hidden = true; };
  const placePop = (ev) => {
    const w = pop.offsetWidth || 260, h = pop.offsetHeight || 200;
    let x = ev.clientX + 18, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 18;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    pop.style.left = `${Math.max(8, x)}px`; pop.style.top = `${Math.max(8, y)}px`;
  };
  const table = $("#ma-table");
  // a country with events, offered when the one chosen has none: the site's country changes (the header's too)
  table.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ma-cty]");
    if (b) window.dispatchEvent(new CustomEvent("ocn:country", { detail: b.dataset.maCty }));
  });
  table.addEventListener("mousemove", (ev) => {
    if (!hover.matches) return;
    const r = ev.target.closest("tr[data-key]"), e = r && byKey.get(r.dataset.key);
    if (!e || e.thumb == null) { hidePop(); return; }
    if (popKey === e.key) { if (!pop.hidden) placePop(ev); return; }
    hidePop(); popKey = e.key;
    popTimer = setTimeout(async () => {
      const url = await thumbOf(e);
      if (popKey !== e.key || !url) return;
      const img = $("img", pop);
      img.src = url; img.alt = t("ma.thumb.alt", { name: e.name });
      pop.hidden = false; placePop(ev);
    }, 180);
  });

  // ---- the map (a computer only, as the Agenda's): the event under the mouse in the list shown on it, and the reverse
  let map = null;
  const wide = matchMedia("(min-width: 980px)");
  async function mountMap() {
    if (map || !wide.matches) return;
    map = await agendaMap.mount($("#ma-map"), cc, {
      levels: Object.fromEntries(["dept", "region"].map((l) => [l, (cc === "FR" ? t(`agd.${l}`) : has(`agd.${l}.${cc}`) ? t(`agd.${l}.${cc}`) : t(`agd.${l}.other`)).toLowerCase()])),
      onPick: (key) => { select(key); $(`#ma-table tr[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" }); },
      onHover: (key) => {
        $$("#ma-table tr.map-hover").forEach((r) => r.classList.remove("map-hover"));
        if (key) $(`#ma-table tr[data-key="${CSS.escape(key)}"]`)?.classList.add("map-hover");
      },
    });
    map?.show(shown, selected);
  }
  wide.addEventListener("change", mountMap);
  // a row chosen shows its card (the three ways in); nothing in the list opens an analysis by itself (owner, 2026-11-05)
  const reveal = () => { if (!wide.matches) $("#ma-detail").scrollIntoView({ behavior: "smooth", block: "start" }); };
  table.addEventListener("click", (e) => { const r = e.target.closest("tr[data-key]"); if (r) { select(r.dataset.key); reveal(); } });
  table.addEventListener("mouseover", (e) => { const r = e.target.closest("tr[data-key]"); if (r) map?.hover(r.dataset.key); });
  table.addEventListener("mouseleave", () => { map?.hover(null); hidePop(); });
  table.addEventListener("keydown", (e) => {
    const r = e.target.closest("tr[data-key]");
    if (r && e.key === "Enter") { e.preventDefault(); select(r.dataset.key); reveal(); $("#ma-detail .ma-go")?.focus({ preventScroll: true }); }
  });
  draw();
  mountMap();
  if (selected) map?.select(selected);
  // another country (owner, 2026-11-05: the page was built again): its events, clubs and map, the other filters kept
  async function onCountry() {
    forCountry();
    if (!clubs.includes(st.club)) st.club = "";
    if (selected && !byKey.has(selected)) selected = null;
    clubOptions();
    hintLine();
    map?.destroy?.(); map = null;
    $("#ma-map").innerHTML = ""; $("#ma-map").hidden = true;
    draw();
    await mountMap();
    if (selected) map?.select(selected);
  }
  return { title: t("ma.title"), onCountry, cleanup: () => {
    wide.removeEventListener("change", mountMap); map?.destroy?.(); hidePop();
    for (const p of thumbs.values()) p.then((u) => u && URL.revokeObjectURL(u));
  } };
}
