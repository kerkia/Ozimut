// « Orga » (#/orga, owner 2026-11-12: Orga is the organiser's events, « Gérer » of 2026-11-11 gone as a word; #/gerer still opens it; functions/api/events/[[path]].js, migration 0026): an organiser's events, one
// race or one training each, held by a team whose members all have the same rights. The page opens on the account's events,
// laid out as Arena's competitions (periods, months, today's line); each row carries its tabs as chips, each opening the
// event on that tab. An event: its head (« ✎ Modifier »: the description, the calendar link, deletion), then its tabs —
// Départs (the booking and the start list: pages/orgstarts.js, bookingorg.js), Direct (orgdirect.js), Résultats (deposit.js),
// Analyse (shared.js's organisers' page), Équipe — by its type (TABS). Nobody is added to a team: people ask to join
// (« Rejoindre une équipe », or the event's own address), any member answers. Addresses: ?ev=<id>&onglet=<tab>, ?nouveau=1,
// ?rejoindre=1, ?course=<key> (a competition's event, from the pages of before: orga-horaires, orga-resultats…).

import { html, raw, $, $$, fmtDate, addDays, normalise } from "../util.js";
import { t, tn, loadArea, locale } from "../i18n.js";
import * as auth from "../auth.js";
import * as data from "../data.js";
import * as country from "../country.js";
import { getProv } from "./provisional.js";
import { confirmBox, alertBox } from "../askbox.js";
import { dateWords } from "../datewords.js";
import { betaTag, betaNote } from "../beta.js";

export const BASE = "#/orga";
// an event's kind and form (owner, 2026-11-18): a competition (individual, score / rogaine, relay), a public training (open to
// all, often paid and timed) or a club training, each of these individual or score — score only in that the controls are taken
// in any order. The server keeps both in one stored type (functions/_lib/events.js: « individual », « score », « relay »,
// « public », « public-score », « training », « training-score »).
const KINDS = { competition: ["individual", "score", "relay"], public: ["individual", "score"], training: ["individual", "score"] };
const kindOf = (type) => (/^training/.test(type || "") ? "training" : /^public/.test(type || "") ? "public" : "competition");
const formOf = (type) => (/score$/.test(type || "") ? "score" : type === "relay" ? "relay" : "individual");
// « Tracé » first (owner, 2026-11-12: course setting is the event's too — its own team and secrecy kept, the Tracer's)
const ALL_TABS = ["trace", "departs", "direct", "resultats", "analyse", "equipe"];
// the tabs of each type (a relay's results and start list wait for « Résultats » to take relays; a club training has no race
// page; a public training, often timed, has a competition's)
const tabsOf = (ev) => (formOf(ev.type) === "relay" ? ["trace", "direct", "analyse", "equipe"] : kindOf(ev.type) === "training" ? ["trace", "analyse", "equipe"] : ALL_TABS);
// the steps offered once an event is created: its own tabs (owner, 2026-11-21: a competition's Départs, Direct and Résultats too)
const nextOf = (kind, form) => tabsOf({ type: kind === "competition" ? form : kind === "public" ? (form === "score" ? "public-score" : "public") : "training" });
const TERRAINS = ["Forêt", "Sprint", "VTT", "Ski"];                    // the data's values (i18n-ignore)
const FORMATS = ["MD", "LD", "Sprint", "Nuit", "Autre"];                // (i18n-ignore)
const today = () => new Date().toLocaleDateString("sv-SE");
/** A time in the reader's language, short: « 22 nov., 20:00 ». */
const fmtWhen = (iso) => new Date(iso).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const href = (q) => `${BASE}?${new URLSearchParams(q)}`;

async function api(path = "", { method = "GET", body } = {}) {
  const r = await fetch(`api/events${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || String(r.status)), { code: j.error || String(r.status), status: r.status, data: j });
  return j;
}
const errText = (e) => { const k = `mg.err.${String(e?.code || "").replace(/\s+/g, "_")}`; return t(k) !== k ? t(k) : t("mg.err.other"); };
const kindLabel = (k) => t(`mg.kind.${k}`);
const formLabel = (f) => t(`mg.form.${f}`);
/** « Compétition », « Entraînement de club · Score / rogaine »: the kind, and the form when not individual. */
const typeLabel = (type) => [kindLabel(kindOf(type)), formOf(type) !== "individual" ? formLabel(formOf(type)) : ""].filter(Boolean).join(" · ");
const tabLabel = (k) => t(`mg.tab.${k}`);
// the course setting is still in beta (owner, 2026-11-12): « bêta » after its tab's name
const tabBeta = (k) => (k === "trace" ? html`<sup class="nav-beta" title="${t("beta.mark.tip")}">${t("beta.mark")}</sup>` : "");
// the data's discipline and format, in the reader's language
const terrainLabel = (x) => (x ? t(`mg.terrain.${x === TERRAINS[0] ? "For" : x}`) : "");
const formatLabel = (x) => (FORMATS.includes(x) ? t(`mg.format.${x}`) : x || "");
/** The tab an event opens on: the one that fits its day. */
/** The tab an event opens on: the one its day calls for; but when that tab holds nothing yet and another does (with S, the chips'
 *  states), the first that does (owner, 2026-11-12: a coming training with its analysis open and no course setting opened on Tracé). */
const defaultTab = (ev, S = null) => {
  const tabs = tabsOf(ev), d = ev.date, now = today();
  const want = kindOf(ev.type) === "training" ? (d > now ? "trace" : "analyse") : d > now ? "departs" : d === now ? "direct" : "resultats";
  const pick = tabs.includes(want) ? want : tabs[0];
  if (!S) return pick;
  const busy = (k) => k !== "equipe" && !!stateOf(ev, k, S).cls;
  return busy(pick) ? pick : tabs.find(busy) || pick;
};

export async function render(main, r) {
  await loadArea("manage");
  const q = r.query || {};
  main.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  try {
    if (q.nouveau) await createPage(main, q);
    else if (q.rejoindre) await joinPage(main);
    else if (q.ev) await eventPage(main, q.ev, q);
    else if (q.course) await byCourse(main, q);
    else await listPage(main, q);
  } catch (e) {
    main.innerHTML = html`<div class="card"><div class="empty">${e.status === 503 ? t("mg.notReady") : errText(e)}</div></div>`;
  }
  return { title: t("mg.title") };
}

// ---- the states shown on the chips: Résultats' index, the bookings, the live broadcasts ---------------------------------
async function states() {
  const [idx, bk, bc, tr, an] = await Promise.all([
    getProv("index.json").catch(() => null),
    fetch("api/booking", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("api/live/broadcasts", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("api/tracer", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("api/analyses", { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
  return { prov: new Map((idx?.races || []).map((x) => [x.key, x])), booking: new Map((bk?.events || []).map((x) => [x.key, x])),
    live: (bc?.broadcasts || []).filter((b) => b.race), tracer: tr?.events || [], analyses: new Map((an?.analyses || []).map((a) => [a.id, a])) };
}
/** What a tab of an event holds, for its chip: { note, cls } (cls empty: nothing yet). */
function stateOf(ev, k, S) {
  const p = ev.race ? S.prov.get(ev.race) : null;
  let note = "", cls = "";
  if (k === "trace") {
    if (S.tracer.some((x) => x.event === ev.id || (ev.race && x.race === ev.race))) { note = "✓"; cls = "ok"; }
  } else if (k === "departs") {
    const b = S.booking.get(ev.race);
    if (b?.status === "open") { note = t("mg.chip.bookOpen"); cls = "on"; }
    else if (p?.startlist) { note = t("mg.chip.startlist"); cls = "ok"; }
  } else if (k === "direct") {
    const b = S.live.find((x) => x.race === ev.race);
    if (b?.last && Date.now() - b.last < 30 * 60e3) { note = "●"; cls = "live"; }
  } else if (k === "resultats") {
    if (p?.docs && !p.soon) { note = tn("mg.chip.runners", p.runners || 0, { n: p.runners || 0 }); cls = "ok"; }
  } else if (k === "analyse") {
    // published, a draft, or a draft opening by itself at a time set (owner, 2026-11-16)
    const a = ev.analysis ? S.analyses.get(ev.analysis) : null;
    if (a?.draft && a.openAt) { note = t("mg.chip.anLater", { when: fmtWhen(a.openAt) }); cls = "later"; }
    else if (a?.draft) { note = t("mg.chip.anDraft"); cls = "draft"; }
    else if (a) { note = t("mg.chip.anLive"); cls = "ok"; }
    else if (ev.analysis) { note = "✓"; cls = "ok"; }
  } else if (k === "equipe") {
    note = String(ev.members || 1);
    if (ev.asks) { note += ` · ${tn("mg.chip.asks", ev.asks, { n: ev.asks })}`; cls = "ask"; }
  }
  return { note, cls };
}
function chipOf(ev, k, S) {
  const { note, cls } = stateOf(ev, k, S);
  return html`<a class="mg-chip ${cls}" href="${href({ ev: ev.id, onglet: k })}">${tabLabel(k)}${tabBeta(k)}${note ? html` <span>${note}</span>` : ""}</a>`;
}
const isLinked = (ev) => !!ev.race && !/^d/.test(ev.race);
const linkTag = (ev) => (ev.linkState === "pending" ? html`<span class="tag mg-wait">${t("mg.link.pendingShort")}</span>`
  : isLinked(ev) ? html`<span class="tag tag-in">${t("mg.link.linked")}</span>` : "");

// ---- the list ----------------------------------------------------------------------------------------------------------
const FKEY = "ocn.mg.filters";
const filters = () => { try { return { when: ["today", "soon", "past"], kind: "", ...JSON.parse(sessionStorage.getItem(FKEY) || "{}") }; } catch (e) { return { when: ["today", "soon", "past"], kind: "" }; } };
const saveFilters = (f) => { try { sessionStorage.setItem(FKEY, JSON.stringify(f)); } catch (e) { /* this visit only */ } };

async function listPage(main, q) {
  // an administrator's « Tous les événements » is remembered (owner, 2026-11-12: a draft of another organiser seemed lost)
  const ALL_KEY = "ocn.mg.all";
  let kept = false;
  try { kept = localStorage.getItem(ALL_KEY) === "1"; } catch (e) { /* this visit only */ }
  const all = q.tous ? q.tous === "1" : kept;
  const [D, S] = await Promise.all([api(all ? "?all=1" : ""), states()]);
  const f = filters();
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("mg.title")}</h1><p class="lede">${t("mg.lede")}</p></div>
      <div class="page-actions"><a class="btn btn-sm" href="${href({ rejoindre: 1 })}">${t("mg.join.btn")}</a>
        <a class="btn btn-sm btn-primary" href="${href({ nouveau: 1 })}">+ ${t("mg.new.btn")}</a></div></div>
    <div class="filters mg-filters">
      ${[["today", "agd.when.today"], ["soon", "agd.when.coming"], ["past", "mg.when.past"]].map(([k, l]) => html`<label class="check"><input type="checkbox" data-when="${k}" ${raw(f.when.includes(k) ? "checked" : "")}> ${t(l)}</label>`)}
      <label class="field"><span>${t("mg.f.type")}</span><select id="mg-type"><option value="">${t("mg.f.all")}</option>
        ${Object.keys(KINDS).map((x) => html`<option value="${x}" ${raw(f.kind === x ? "selected" : "")}>${kindLabel(x)}</option>`)}</select></label>
      <label class="field"><span>${t("mg.f.search")}</span><input id="mg-q" style="width:200px"></label>
      ${D.admin ? html`<label class="check" style="margin-left:auto"><input type="checkbox" id="mg-all" ${raw(all ? "checked" : "")}> ${t("mg.f.allEvents")}</label>` : ""}
    </div>
    <section class="card"><div id="mg-list" class="mg-list"></div></section>
    <div id="mg-mine"></div>`;
  const draw = () => {
    const now = today(), s = normalise($("#mg-q").value || "");
    const period = (e) => (e.date === now ? "today" : e.date > now ? "soon" : "past");
    const list = D.events.filter((e) => f.when.includes(period(e)) && (!f.kind || kindOf(e.type) === f.kind)
      && (!s || normalise(`${e.name} ${e.club} ${e.place}`).includes(s))).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    if (!list.length) {
      $("#mg-list").innerHTML = html`<div class="empty">${D.events.length ? t("mg.none.filtered") : t("mg.none")}</div>`;
      return;
    }
    let month = "", line = false;
    const rows = [];
    for (const e of list) {
      const m = e.date.slice(0, 7);
      if (!line && e.date >= now && f.when.includes("past")) { rows.push(html`<div class="mg-now">${t("mg.today", { d: fmtDate(now) })}</div>`); line = true; }
      if (m !== month) { month = m; rows.push(html`<div class="mg-month">${new Date(`${m}-15T12:00:00`).toLocaleDateString(locale(), { month: "long", year: "numeric" })}</div>`); }
      const d = new Date(`${e.date}T12:00:00`);
      rows.push(html`<div class="mg-ev mg-${period(e)}" data-ev="${e.id}" tabindex="0">
        <div class="mg-day"><b>${d.getDate()}</b><span>${d.toLocaleDateString(locale(), { weekday: "short" })}</span></div>
        <div class="mg-name"><a href="${href({ ev: e.id, onglet: defaultTab(e, S) })}"><b>${e.name}</b></a>
          <div class="muted">${[typeLabel(e.type), terrainLabel(e.terrain), e.epreuve !== e.terrain ? formatLabel(e.epreuve) : "", e.club, e.place].filter(Boolean).join(" · ")} ${linkTag(e)}
            ${D.admin && !e.me ? html`<span class="tag">${t("mg.notMember")}</span>` : ""}</div></div>
        <div class="mg-chips">${tabsOf(e).map((k) => chipOf(e, k, S))}</div></div>`);
    }
    if (!line && f.when.includes("past")) rows.push(html`<div class="mg-now">${t("mg.today", { d: fmtDate(now) })}</div>`);
    $("#mg-list").innerHTML = html`${rows}`;
    $$(".mg-ev").forEach((el) => {
      const go = () => { const e = D.events.find((x) => x.id === el.dataset.ev); location.hash = href({ ev: e.id, onglet: defaultTab(e, S) }); };
      el.addEventListener("click", (ev) => { if (!ev.target.closest("a")) go(); });
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.target.closest("a")) go(); });
    });
  };
  $$("[data-when]").forEach((c) => c.addEventListener("change", () => { f.when = $$("[data-when]").filter((x) => x.checked).map((x) => x.dataset.when); saveFilters(f); draw(); }));
  $("#mg-type").addEventListener("change", (e) => { f.kind = e.target.value; saveFilters(f); draw(); });
  $("#mg-q").addEventListener("input", draw);
  $("#mg-all")?.addEventListener("change", (e) => {
    try { localStorage.setItem(ALL_KEY, e.target.checked ? "1" : "0"); } catch (err) { /* this visit only */ }
    location.hash = href({ tous: e.target.checked ? 1 : 0 });
  });
  draw();
  // the requests the account sent, still waiting
  if (D.requests.length) {
    $("#mg-mine").innerHTML = html`<section class="card" style="margin-top:16px"><div class="card-head"><h2>${t("mg.sent.title")}</h2></div>
      <div class="card-body">${D.requests.map((r) => html`<div class="row mg-sent" style="gap:10px;align-items:center;margin:4px 0">
        <span>${fmtDate(r.date, "short")} · <b>${r.name}</b> <span class="muted">${t("mg.sent.at", { d: fmtDate(r.at.slice(0, 10), "short") })}</span></span>
        <button type="button" class="btn btn-sm" data-withdraw="${r.id}" data-event="${r.event}">${t("mg.sent.withdraw")}</button></div>`)}</div></section>`;
    $$("[data-withdraw]").forEach((b) => b.addEventListener("click", async () => {
      try { await api(`/${b.dataset.event}/requests/${b.dataset.withdraw}`, { method: "POST", body: { withdraw: true } }); b.closest(".mg-sent").remove(); }
      catch (e) { alertBox(errText(e)); }
    }));
  }
}

// ---- France's agenda: the competitions an event may be linked to ----------------------------------------------------------
let agendaMemo = null;
const frAgenda = () => (agendaMemo ||= data.countryJson("FR", "agenda.json").catch(() => null));
const asForm = (e) => (/relais/i.test(e.epr || "") ? "relay" : /score|rogaine/i.test(e.epr || "") ? "score" : "individual");
const terrainOf = (e) => e.terrain || (/vtt/i.test(e.spec || "") ? "VTT" : /ski/i.test(e.spec || "") ? "Ski" : /sprint/i.test(e.epr || "") ? "Sprint" : "Forêt");
/**
 * The calendar's competitions of a day, the account's club first, with the events holding them: the agenda's, and — the agenda
 * dropping a race once run — those « Résultats » keeps from FFCO's calendar (its own keys: an organiser may come after the race).
 */
async function candidates(day) {
  const [A, idx] = await Promise.all([frAgenda(), getProv("index.json").catch(() => null)]), club = auth.myClub();
  const code = (o) => { const m = /^\s*(\d{3,4})\b/.exec(String(o || "")); return m ? m[1].padStart(4, "0") : null; };
  const seen = new Set();
  const fromAgenda = (A?.events || []).filter((e) => e.kind === "c" && e.id && !e.cancelled && (e.date === day || (e.end && e.date <= day && e.end >= day)))
    .map((e) => (seen.add(`a${e.id}`), { key: `a${e.id}`, e }));
  const fromProv = (idx?.races || []).filter((r) => r.date_iso === day && /^[afx]/.test(r.key) && !seen.has(r.key) && (r.country || "FR") === "FR")
    .map((r) => ({ key: r.key, e: { name: r.name, date: r.date_iso, place: r.place, org: r.org, epr: r.epreuve, terrain: r.terrain, site: r.site } }));
  const list = [...fromAgenda, ...fromProv].map((x) => ({ ...x, mine: !!club && code(x.e.org) === club }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.e.name.localeCompare(b.e.name));
  const keys = list.map((x) => x.key);
  const H = keys.length ? (await api(`/holders?keys=${keys.slice(0, 200).join(",")}`).catch(() => ({ holders: {} }))).holders : {};
  for (const x of list) x.holder = H[x.key] || null;
  return list;
}
/**
 * A country's known clubs as an event names its organiser (owner, 2026-11-16): France's from FFCO's directory (« 0109 -
 * O'BUGEY », as the agenda writes them), else the country's ranking's names, plus its agenda's organisers and the club the
 * account declared for it. -> { list, mine } (mine: the account's own club there, or "").
 */
const clubMemo = new Map();
function clubsOf(cc) {
  if (!cc) return Promise.resolve({ list: [], mine: "" });
  if (clubMemo.has(cc)) return clubMemo.get(cc);
  const p = (async () => {
    const get = (path) => data.countryJson(cc, path).catch(() => null);
    const [dir, meta, ag] = await Promise.all([cc === "FR" ? get("clubdir.json") : null, get("meta.json"), get("agenda.json")]);
    const names = new Set();
    for (const l of dir?.ligues || []) for (const d of l.depts || []) for (const c of d.clubs || []) names.add(`${c.code} - ${c.name}`);
    if (cc === "FR") { if (!names.size) for (const [k, v] of Object.entries(meta?.names?.clubs || {})) names.add(`${k} - ${v}`); }
    else for (const v of Object.values(meta?.names?.clubs || {})) names.add(String(v));
    for (const e of ag?.events || []) if (e.org && (cc !== "FR" || /^\d{4} - /.test(e.org))) names.add(String(e.org).trim());
    let mine = (auth.session()?.countries || []).find((c) => c.cc === cc && c.status === "ok")?.club?.trim() || "";
    if (cc === "FR") {
      const code = auth.myClub();
      if (code) mine = [...names].find((n) => n.startsWith(`${code} - `)) || (data.clubName(code) !== code ? `${code} - ${data.clubName(code)}` : code);
    }
    if (mine) names.add(mine);
    return { list: [...names].filter(Boolean).sort((a, b) => a.localeCompare(b, locale())), mine };
  })();
  clubMemo.set(cc, p);
  return p;
}
/** Fills a form's club list (and its field when empty, or still the default of before) with a country's clubs. */
async function fillClubs(root, cc, { setDefault = true } = {}) {
  const { list, mine } = await clubsOf(cc);
  const dl = $("datalist[data-clubs]", root), input = $("[data-f=club]", root);
  if (dl) dl.innerHTML = html`${list.map((n) => html`<option value="${n}"></option>`)}`;
  if (input && setDefault && (!input.value || input.value === input.dataset.auto)) { input.value = mine; input.dataset.auto = mine; }
  return mine;
}
const myCountries = () => {
  const s = auth.session();
  const own = (s?.countries || []).filter((c) => c.status === "ok").map((c) => c.cc);
  return s?.admin ? [...new Set([...own, ...country.MEMBERS])] : own.length ? own : s?.lic ? ["FR"] : [];
};

// ---- a new event -----------------------------------------------------------------------------------------------------------
async function createPage(main, q) {
  const cs = myCountries();
  let pre = null;
  if (/^[afx]/.test(q.course || "")) {
    pre = (await frAgenda())?.events?.find((e) => `a${e.id}` === q.course) || null;
    const p = pre ? null : (await getProv("index.json").catch(() => null))?.races?.find((r) => r.key === q.course);
    if (p) pre = { id: null, key: p.key, name: p.name, date: p.date_iso, epr: p.epreuve };
  }
  const st = { next: "", kind: "competition", form: pre ? asForm(pre) : "individual", cc: pre ? "FR" : cs.includes("FR") ? "FR" : cs[0] || "", day: pre?.date || "", pick: pre ? pre.key || `a${pre.id}` : "", list: [] };
  main.innerHTML = html`
    <a class="back-link" href="${BASE}">‹ ${t("mg.back")}</a>
    <div class="page-head"><div><h1>${t("mg.new.title")}</h1><p class="lede">${t("mg.new.lede")}</p></div></div>
    ${cs.length ? "" : html`<div class="notice">${t("mg.new.noCountry")}</div>`}
    <section class="card"><div class="card-head"><h2>${t("mg.new.s1")}</h2></div><div class="card-body">
      <div class="mg-types">${Object.keys(KINDS).map((x) => html`<label class="mg-type"><input type="radio" name="mg-kind" value="${x}" ${raw(st.kind === x ? "checked" : "")}>
        <b>${kindLabel(x)}</b><span class="muted">${t(`mg.kind.${x}.hint`)}</span></label>`)}</div>
      <div class="mg-forms"><h3>${t("mg.f.form")}</h3><div class="mg-types" id="mg-forms"></div></div>
      <div class="filters" style="margin-top:12px">
        <label class="field"><span>${t("mg.f.country")}</span><select id="mg-cc">${cs.map((c) => html`<option value="${c}" ${raw(c === st.cc ? "selected" : "")}>${country.name(c)}</option>`)}</select></label>
        <label class="field"><span>${t("mg.f.date")}</span><input type="date" id="mg-day" value="${st.day}"></label>
      </div></div></section>
    <section class="card" id="mg-cal" hidden><div class="card-head"><div><h2>${t("mg.new.s2")}</h2><div class="hint" id="mg-cal-hint"></div></div></div>
      <div class="card-body" id="mg-cands"></div></section>
    <section class="card" id="mg-desc" hidden><div class="card-head"><h2>${t("mg.new.s3")}</h2></div><div class="card-body">
      <div class="mg-form">${formFields({})}</div>
      <div class="mg-next" id="mg-next"><h3>${t("mg.next.title")}</h3><div class="mg-types" id="mg-next-list"></div></div>
      <div class="row" style="gap:10px;margin-top:12px;align-items:center"><button type="button" class="btn btn-primary" id="mg-create">${t("mg.new.create")}</button>
        <span class="muted" id="mg-create-msg"></span></div></div></section>`;
  dateWords($("#mg-day"));
  const linkable = () => st.cc === "FR" && st.kind === "competition" && !!st.day;
  /** The forms the kind offers (a relay only for a competition), the one chosen kept when the kind has it. */
  function drawForms() {
    if (!KINDS[st.kind].includes(st.form)) st.form = "individual";
    $("#mg-forms").innerHTML = html`${KINDS[st.kind].map((x) => html`<label class="mg-type"><input type="radio" name="mg-form" value="${x}" ${raw(st.form === x ? "checked" : "")}>
      <b>${formLabel(x)}</b><span class="muted">${t(`mg.form.${x}.hint`)}</span></label>`)}`;
    $$("input[name=mg-form]").forEach((r) => r.addEventListener("change", () => { st.form = r.value; drawNext(); }));
    drawNext();
  }
  /** « Et ensuite ? »: the event's own tabs, by its kind and form; the course setting by default, the analysis for a club training. */
  function drawNext() {
    const list = nextOf(st.kind, st.form);
    if (!list.includes(st.next)) st.next = "";
    const next = st.next || (st.kind === "training" ? "analyse" : "trace");
    $("#mg-next-list").innerHTML = html`${list.map((x) => html`<label class="mg-type"><input type="radio" name="mg-next" value="${x}" ${raw(x === next ? "checked" : "")}>
      <b>${t(`mg.next.${x}`)}</b><span class="muted">${t(`mg.next.${x}.hint`)}</span></label>`)}`;
    $$("input[name=mg-next]").forEach((r) => r.addEventListener("change", () => { st.next = r.value; }));
  }
  drawForms();
  async function refresh() {
    $("#mg-cal").hidden = !linkable();
    if (linkable()) {
      $("#mg-cands").innerHTML = html`<div class="spinner"></div>`;
      st.list = await candidates(st.day);
      if (st.pick && !st.list.some((x) => x.key === st.pick)) st.pick = "";
      drawCands();
    } else st.pick = "";
    drawDesc();
  }
  function drawCands() {
    $("#mg-cal-hint").textContent = t("mg.new.s2.hint", { d: fmtDate(st.day) });
    const opt = (x) => {
      const h = x.holder, state = h ? (h.mine ? t("mg.cand.yours") : h.pending ? t("mg.cand.pendingOther", { by: h.by }) : t("mg.cand.held", { by: h.by }))
        : x.mine ? t("mg.cand.club") : t("mg.cand.admin");
      return html`<label class="mg-opt ${st.pick === x.key ? "on" : ""}"><input type="radio" name="mg-pick" value="${x.key}" ${raw(st.pick === x.key ? "checked" : "")}>
        <div><b>${x.e.name}</b>${x.e.epr ? html` · ${x.e.epr}` : ""}<br><span class="muted">${[x.e.place, x.e.org].filter(Boolean).join(" · ")}</span><br>
        <span class="tag ${h ? "" : x.mine ? "tag-in" : "mg-wait"}">${state}</span></div></label>`;
    };
    $("#mg-cands").innerHTML = html`${st.list.length ? st.list.map(opt) : html`<p class="muted">${t("mg.new.noneThatDay")}</p>`}
      <label class="mg-opt ${st.pick === "none" ? "on" : ""}"><input type="radio" name="mg-pick" value="none" ${raw(st.pick === "none" ? "checked" : "")}>
        <div><b>${t("mg.cand.none")}</b><br><span class="muted">${t("mg.cand.none.hint")}</span></div></label>`;
    $$("input[name=mg-pick]").forEach((r) => r.addEventListener("change", () => { st.pick = r.value; drawCands(); drawDesc(); }));
  }
  function drawDesc() {
    const x = st.list.find((y) => y.key === st.pick);
    $("#mg-desc").hidden = !st.day || (linkable() && !st.pick);
    $$(".mg-form [data-f]").forEach((el) => { el.disabled = !!x; });
    const training = st.kind === "training", line = $(".mg-train-club");
    $("#mg-next").hidden = !!x?.holder;
    showFields($("#mg-desc"), training);
    line.hidden = !(training && st.myClub);
    line.textContent = st.myClub ? t("mg.new.trainingClub", { club: st.myClub }) : "";
    if (x) {
      setForm({ name: x.e.name, place: x.e.place, club: x.e.org, terrain: terrainOf(x.e), epreuve: FORMATS.includes(x.e.epr) ? x.e.epr : "", site: x.e.site });
      const h = x.holder;
      $("#mg-create").textContent = h && !h.mine ? t("mg.cand.ask") : h?.mine ? t("mg.cand.open") : t("mg.new.createLink");
    } else $("#mg-create").textContent = t("mg.new.create");
  }
  // the organising club: the account's own in the chosen country by default, the country's clubs offered
  const clubs = async () => { st.myClub = await fillClubs($("#mg-desc"), st.cc, { setDefault: !st.list.some((y) => y.key === st.pick) }); drawDesc(); };
  $$("input[name=mg-kind]").forEach((r) => r.addEventListener("change", () => { st.kind = r.value; drawForms(); refresh(); }));
  $("#mg-cc").addEventListener("change", (e) => { st.cc = e.target.value; refresh().then(clubs); });
  $("#mg-day").addEventListener("change", (e) => { st.day = e.target.value; refresh(); });
  $("#mg-create").addEventListener("click", async () => {
    const x = st.list.find((y) => y.key === st.pick), msg = $("#mg-create-msg");
    if (x?.holder?.mine) { location.hash = href({ ev: x.holder.id }); return; }
    if (x?.holder) {                      // claimed by another team: ask to join it
      try { await api(`/${x.holder.id}/join`, { method: "POST", body: {} }); msg.textContent = t("mg.join.sent"); }
      catch (e) { msg.textContent = errText(e); }
      return;
    }
    const body = { kind: st.kind, form: st.form, country: st.cc, date: st.day, ...readForm(), ...(x ? { link: x.key } : {}),
      ...(st.kind === "training" ? { club: st.myClub || "" } : {}) };
    try {
      const r = await api("", { method: "POST", body }), e = r.event;
      const next = $("input[name=mg-next]:checked")?.value || "equipe";
      // straight to the next step chosen (owner, 2026-11-16), the course setting in the Tracer; a link waiting for an
      // administrator: the event's tab chosen all the same, which says the tools wait (owner, 2026-11-21: not the team instead)
      if (next === "trace" && e.linkState !== "pending") location.hash = `#/orga-tracer?${new URLSearchParams({ ev: e.id, nouveau: "1" })}`;
      else location.hash = href({ ev: e.id, onglet: tabsOf(e).includes(next) ? next : "equipe" });
    } catch (e) { msg.textContent = e.code === "held" ? t("mg.err.held", { by: e.data?.holder?.by || "" }) : errText(e); }
  });
  await refresh();
  await clubs();
}
/**
 * An event's description. A competition's: name, place, organising club (a list of the country's clubs, still free to type),
 * discipline, format, website; a training's: its name alone (owner, 2026-11-16: its club is its creator's). The competition's
 * fields carry `mg-comp`, hidden for a training: hidden fields are not read (readForm).
 */
let formSeq = 0;
function formFields(v) {
  const dl = `mg-clubs-${++formSeq}`;
  return html`<div class="filters" style="margin:0">
    <label class="field" style="flex:2;min-width:240px"><span>${t("mg.f.name")}</span><input data-f="name" value="${v.name || ""}" maxlength="120"></label>
    <label class="field mg-comp"><span>${t("mg.f.place")}</span><input data-f="place" value="${v.place || ""}" maxlength="80"></label>
    <label class="field mg-comp" style="flex:2;min-width:260px"><span>${t("mg.f.club")}</span><input data-f="club" value="${v.club || ""}" maxlength="80"
      list="${dl}" autocomplete="off" placeholder="${t("mg.f.club.ph")}"><datalist id="${dl}" data-clubs></datalist></label>
    <label class="field mg-comp"><span>${t("mg.f.terrain")}</span><select data-f="terrain"><option value=""></option>
      ${TERRAINS.map((x) => html`<option value="${x}" ${raw(v.terrain === x ? "selected" : "")}>${t(`mg.terrain.${x === "Forêt" ? "For" : x}`)}</option>`)}</select></label>
    <label class="field mg-comp"><span>${t("mg.f.format")}</span><select data-f="epreuve"><option value=""></option>
      ${FORMATS.map((x) => html`<option value="${x}" ${raw(v.epreuve === x ? "selected" : "")}>${t(`mg.format.${x}`)}</option>`)}</select></label>
    <label class="field mg-comp" style="flex:2;min-width:240px"><span>${t("mg.f.site")}</span><input data-f="site" type="url" value="${v.site || ""}" placeholder="https://"></label>
  </div>
  <p class="muted mg-train-club" hidden></p>`;
}
/** Shows a training's fields or a competition's. */
function showFields(root, training) {
  $$(".mg-comp", root).forEach((el) => { el.hidden = training; });
}
const readForm = (root = document) => Object.fromEntries($$("[data-f]", root).filter((el) => !el.closest("[hidden]")).map((el) => [el.dataset.f, el.value.trim()]));
const setForm = (v, root = document) => $$("[data-f]", root).forEach((el) => { if (v[el.dataset.f] !== undefined) el.value = v[el.dataset.f] || ""; });

// ---- asking to join a team ---------------------------------------------------------------------------------------------
async function joinPage(main) {
  const D = await api("/find");
  main.innerHTML = html`
    <a class="back-link" href="${BASE}">‹ ${t("mg.back")}</a>
    <div class="page-head"><div><h1>${t("mg.join.title")}</h1><p class="lede">${t("mg.join.lede")}</p></div></div>
    <div class="filters"><label class="field"><span>${t("mg.f.search")}</span><input id="mg-jq" style="width:260px" placeholder="${t("mg.join.ph")}"></label></div>
    <section class="card"><div class="table-wrap" id="mg-jlist"></div></section>`;
  const draw = () => {
    const s = normalise($("#mg-jq").value || "");
    const list = D.events.filter((e) => !s || normalise(`${e.name} ${e.club} ${e.place}`).includes(s));
    $("#mg-jlist").innerHTML = list.length ? html`<table class="data compact"><thead><tr><th>${t("mg.f.date")}</th><th>${t("mg.col.event")}</th>
        <th>${t("mg.f.type")}</th><th>${t("mg.f.club")}</th><th class="r">${t("mg.col.team")}</th><th></th></tr></thead><tbody>
      ${list.map((e) => html`<tr><td class="num">${fmtDate(e.date, "short")}</td><td><b>${e.name}</b>${e.place ? html` <span class="muted">· ${e.place}</span>` : ""}
        ${e.country !== country.current() ? html` ${raw(country.flagImg(e.country))}` : ""}${e.linked ? html` <span class="tag tag-in">${t("mg.link.linked")}</span>` : ""}</td>
        <td>${typeLabel(e.type)}</td><td class="muted">${e.club || "—"}</td><td class="r num">${e.members}</td>
        <td class="r">${e.asked ? html`<span class="muted">${t("mg.join.sentShort")}</span>` : html`<a class="btn btn-sm" href="${href({ ev: e.id })}">${t("mg.join.ask")}</a>`}</td></tr>`)}
      </tbody></table>` : html`<div class="empty">${t("mg.join.none")}</div>`;
  };
  $("#mg-jq").addEventListener("input", draw);
  draw();
}
/** What someone outside a team sees of its event: who runs it, and a way to ask to join. */
function joinScreen(main, D) {
  const ev = D.event;
  main.innerHTML = html`
    <a class="back-link" href="${BASE}">‹ ${t("mg.back")}</a>
    <div class="page-head"><div><h1>${ev.name}</h1><p class="lede meta"><span>${fmtDate(ev.date)}</span><span>${typeLabel(ev.type)}</span>${ev.club ? html`<span>${ev.club}</span>` : ""}${ev.place ? html`<span>${ev.place}</span>` : ""}</p></div></div>
    <section class="card"><div class="card-body">
      <p>${t("mg.join.heldBy", { by: D.holder.by, n: D.holder.n })}</p>
      ${D.asked ? html`<p class="muted">${t("mg.join.sent")}</p><button type="button" class="btn btn-sm" id="mg-withdraw">${t("mg.sent.withdraw")}</button>`
      : html`<label class="field"><span>${t("mg.join.msg")}</span><input id="mg-jmsg" maxlength="300" style="width:min(520px,100%)" placeholder="${t("mg.join.msg.ph")}"></label>
        <div class="row" style="gap:10px;margin-top:10px;align-items:center"><button type="button" class="btn btn-primary" id="mg-jgo">${t("mg.join.ask")}</button>
        <span class="muted" id="mg-jnote"></span></div>`}
    </div></section>`;
  $("#mg-jgo")?.addEventListener("click", async () => {
    try { await api(`/${ev.id}/join`, { method: "POST", body: { message: $("#mg-jmsg").value } }); $("#mg-jnote").textContent = t("mg.join.sent"); $("#mg-jgo").disabled = true; }
    catch (e) { $("#mg-jnote").textContent = errText(e); }
  });
  $("#mg-withdraw")?.addEventListener("click", async () => {
    try { await api(`/${ev.id}/requests/${D.asked}`, { method: "POST", body: { withdraw: true } }); location.hash = BASE; }
    catch (e) { alertBox(errText(e)); }
  });
}

// ---- a competition's event, from an address of before ------------------------------------------------------------------
async function byCourse(main, q) {
  const H = (await api(`/holders?keys=${encodeURIComponent(q.course)}`)).holders[q.course];
  const tab = q.resa ? "departs" : q.onglet;
  if (H && !H.pending) { location.replace(href({ ev: H.id, ...(tab ? { onglet: tab } : {}), ...(q.resa ? { resa: 1 } : {}) })); return; }
  // nobody holds it: create its event (France's agenda), else the list
  if (/^[afx]/.test(q.course)) { location.replace(href({ nouveau: 1, course: q.course })); return; }
  main.innerHTML = html`<div class="notice">${t("mg.course.none")}</div>`;
  await listPage(main.appendChild(document.createElement("div")), {});
}

// ---- one event ---------------------------------------------------------------------------------------------------------
async function eventPage(main, id, q) {
  const [D, mine] = await Promise.all([api(`/${id}`), api("").catch(() => ({ events: [] }))]);
  if (!D.member && !D.admin) return joinScreen(main, D);
  const ev = D.event, tabs = [...tabsOf(ev)];
  // « Chrono » (2026-11-17, owner: Ozimut's race timing, administrators only while it is being tried), before « Équipe »
  if (auth.session()?.admin) tabs.splice(tabs.indexOf("equipe"), 0, "chrono");
  const tab = tabs.includes(q.onglet) ? q.onglet : defaultTab(ev);
  const others = mine.events.filter((e) => e.me || e.id === ev.id).sort((a, b) => b.date.localeCompare(a.date));
  const pending = ev.linkState === "pending";
  // no title of its own (owner, 2026-11-12: the event chooser says it): the way back, the chooser, the actions; the tabs go to the
  // bar, empty in Orga (app.placeBarTabs)
  main.innerHTML = html`
    <div class="row mg-top"><a class="back-link" href="${BASE}" style="margin:0">‹ ${t("mg.back")}</a>
      ${others.length > 1 ? html`<select id="mg-switch" class="mg-switch" aria-label="${t("mg.switch")}">${others.map((e) => html`<option value="${e.id}" ${raw(e.id === ev.id ? "selected" : "")}>${fmtDate(e.date, "short")} · ${e.name}</option>`)}</select>`
        : html`<b class="mg-one">${fmtDate(ev.date, "short")} · ${ev.name}</b>`}
      <span class="mg-meta muted">${[typeLabel(ev.type), ev.terrain ? terrainLabel(ev.terrain) : "", ev.epreuve && ev.epreuve !== ev.terrain ? formatLabel(ev.epreuve) : "", ev.club, ev.place].filter(Boolean).join(" · ")}</span>
      <span class="mg-acts">${linkTag(ev)}${!D.member ? html`<span class="tag">${t("mg.notMember")}</span>` : ""}<button type="button" class="btn btn-sm" id="mg-edit">✎ ${t("mg.edit")}</button></span></div>
    ${pending ? html`<div class="notice">${t("mg.link.pending", { name: D.competition?.name || "" })}</div>` : ""}
    <div data-bar-tabs><nav class="page-tabs mg-tabs" role="tablist">${tabs.map((k) => html`<a role="tab" aria-selected="${k === tab}" href="${href({ ev: ev.id, onglet: k })}">${tabLabel(k)}${tabBeta(k)}${k === "equipe" && D.requests.length ? html` <span class="mg-badge">${D.requests.length}</span>` : ""}</a>`)}</nav></div>
    <div id="mg-panel" class="mg-panel"></div>`;
  $("#mg-switch")?.addEventListener("change", (e) => { const o = others.find((x) => x.id === e.target.value); location.hash = href({ ev: o.id, onglet: tabsOf(o).includes(tab) ? tab : defaultTab(o) }); });
  $("#mg-edit").addEventListener("click", () => editDialog(D));
  const panel = $("#mg-panel");
  if (tab === "equipe") return teamTab(panel, D);
  if (tab === "trace") return traceTab(panel, D);
  if (tab === "chrono") return (await import("./chrono.js")).render(panel, { event: ev });
  if (pending && tab !== "analyse") { panel.innerHTML = html`<div class="card"><div class="empty">${t("mg.link.waitTools")}</div></div>`; return; }
  if (tab === "analyse") return analysisTab(panel, D, q);
  const race = await raceOf(ev);
  if (tab === "departs") {
    if (ev.date < today()) { panel.innerHTML = html`<div class="card"><div class="empty">${t("mg.departs.past")}</div></div>`; return; }
    const S = await import("./orgstarts.js");
    return q.resa ? (await import("./bookingorg.js")).renderBooking(panel, race, { base: href({ ev: ev.id, onglet: "departs" }) })
      : S.deposit(panel, race, { base: href({ ev: ev.id, onglet: "departs" }) });
  }
  if (tab === "direct") return (await import("./orgdirect.js")).render(panel, { event: { key: ev.race, name: ev.name, date: ev.date, org: ev.club } });
  if (tab === "resultats") {
    if (ev.date > today()) { panel.innerHTML = html`<div class="card"><div class="empty">${t("mg.results.later", { d: fmtDate(ev.date) })}</div></div>`; return; }
    return (await import("./deposit.js")).render(panel, { query: { ...q, course: ev.race, orga: "1" }, embedded: true,
      organiser: { key: ev.race, name: ev.name, date_iso: ev.date, place: ev.place, org: ev.club, country: ev.country } });
  }
}
/** The competition as the organisers' tools take it ({ key, e: the agenda's shape, p: Résultats' race }). */
async function raceOf(ev) {
  const [A, idx] = await Promise.all([/^a\d+$/.test(ev.race || "") ? frAgenda() : null, getProv("index.json").catch(() => null)]);
  const a = A?.events?.find((e) => `a${e.id}` === ev.race);
  return { key: ev.race, e: a || { name: ev.name, date: ev.date, place: ev.place, org: ev.club }, p: (idx?.races || []).find((r) => r.key === ev.race) || null };
}

// ---- Analyse: the event's map analysis, opened here ------------------------------------------------------------------------
async function analysisTab(panel, D, q) {
  const ev = D.event;
  if (ev.analysis) {
    const shared = await import("./shared.js");
    try { return await shared.render(panel, { route: "orgAnalyses", query: { ...q, id: ev.analysis, embed: "1" } }); }
    catch (e) { /* drawn below */ }
  }
  const pending = ev.linkState === "pending";
  // none yet: opened at once for a member (owner, 2026-11-16: a page with one button to click was no use; it stays a draft,
  // seen by the team alone, until published), the button below only when that fails
  if (!pending && D.member) {
    panel.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    let err = null;
    try { await openAnalysis(ev); location.reload(); return; } catch (e) { err = e; }
    q = { ...q, err };
  }
  panel.innerHTML = html`<section class="card"><div class="card-body">
    <p>${t(kindOf(ev.type) === "training" ? "mg.an.training" : "mg.an.race")}</p>
    <div class="row" style="gap:10px;align-items:center"><button type="button" class="btn btn-primary" id="mg-an-open" ${raw(pending ? "disabled" : "")}>${t("mg.an.open")}</button>
      <span class="muted" id="mg-an-msg">${pending ? t("mg.link.waitTools") : q.err ? errText(q.err) : ""}</span></div></div></section>`;
  $("#mg-an-open").addEventListener("click", async () => {
    try { await openAnalysis(ev); location.reload(); } catch (e) { $("#mg-an-msg").textContent = errText(e); }
  });
}
/** The event's map analysis created (a competition's own, or a training's) and kept with the event. */
async function openAnalysis(ev) {
  const body = kindOf(ev.type) === "training" || !ev.race
    ? { kind: "club", title: ev.name, date: ev.date, vis: "public", country: ev.country, via: "gerer" }
    : { kind: "race", race: ev.race, title: ev.name, date: ev.date, vis: "public", via: "gerer" };
  const r = await fetch("api/analyses", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw Object.assign(new Error(j.error || r.status), { code: j.error || "other" });
  await api(`/${ev.id}`, { method: "PUT", body: { analysis: j.id } });
}

// ---- Tracé: the event's course setting, in the Tracer (its own team: the courses are theirs until the race) ----------------
async function traceTab(panel, D) {
  const ev = D.event;
  panel.innerHTML = html`<div class="spinner"></div>`;
  const get = (u) => fetch(u, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [T, A] = await Promise.all([get(`api/tracer?event=${encodeURIComponent(ev.id)}`), ev.analysis ? get(`api/analyses/${encodeURIComponent(ev.analysis)}`) : null]);
  const list = T?.events || [];
  // the analysis keeps each circuit as a picture (the map with its course printed), its controls and georeference — never the
  // OCAD or Purple Pen files it was made from: the course setting takes those same files (owner, 2026-11-12)
  const circuits = (A?.analysis?.courses || []).length;
  // the files the analysis kept (its OCAD import's « rendre disponibles pour le tracé »)
  const kept = circuits ? ((await get(`api/analyses/${encodeURIComponent(ev.analysis)}/source`))?.files || []) : [];
  const open = (x) => `#/orga-tracer?${new URLSearchParams({ id: x.id, ev: ev.id })}`;
  const startHref = `#/orga-tracer?${new URLSearchParams({ ev: ev.id, nouveau: "1" })}`;
  const importHref = `#/orga-tracer?${new URLSearchParams({ ev: ev.id, importer: "1" })}`;
  const fromHref = `#/orga-tracer?${new URLSearchParams({ ev: ev.id, depuis: "analyse" })}`;
  const pending = ev.linkState === "pending";
  panel.innerHTML = html`<section class="card"><div class="card-head"><div><h2>${t("mg.tr.title")} ${raw(betaTag())}</h2><div class="hint">${t("mg.tr.hint")}</div></div></div>
    <div class="card-body">
      ${raw(betaNote("tracer"))}
      ${list.length ? html`<div class="mg-trlist">${list.map((x) => html`<div class="mg-tr">
          <div><b>${x.title}</b>${x.encrypted ? html` <span class="tag">${t("mg.tr.encrypted")}</span>` : ""}<div class="muted">${t("mg.tr.by", { by: x.by, n: x.team })}</div></div>
          ${x.member ? html`<a class="btn btn-primary btn-sm" href="${open(x)}">${t("mg.tr.open")}</a>`
            : html`<span class="muted mg-tr-closed">${t("mg.tr.secret", { by: x.by })}</span>`}</div>`)}</div>`
        : html`<p>${t(pending ? "mg.link.waitTools" : "mg.tr.none")}</p>${pending || !circuits ? "" : kept.length ? html`<p class="notice">${tn("mg.tr.kept", circuits, { n: circuits, files: kept.map((x) => x.name).join(", ") })}</p>`
          : html`<p class="notice">${tn("mg.tr.fromAnalysis", circuits, { n: circuits })}</p>`}`}
      ${pending ? "" : html`<div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">
        ${!list.length && kept.length ? html`<a class="btn btn-primary" href="${fromHref}">${t("mg.tr.fromFiles")}</a>` : ""}
        <a class="btn ${list.length || circuits ? "" : "btn-primary"}" href="${startHref}">${t(list.length ? "mg.tr.another" : "mg.tr.start")}</a>
        <a class="btn ${!list.length && circuits && !kept.length ? "btn-primary" : ""}" href="${importHref}" title="${t("mg.tr.importTip")}">${t("mg.tr.import")}</a></div>`}
    </div></section>`;
}

// ---- Équipe ------------------------------------------------------------------------------------------------------------------
function teamTab(panel, D) {
  const ev = D.event, addr = `${location.origin}${location.pathname}${href({ ev: ev.id })}`;
  panel.innerHTML = html`
    ${D.requests.length ? html`<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${t("mg.team.requests")}</h2></div><div class="card-body">
      ${D.requests.map((r) => html`<div class="mg-req" data-req="${r.id}"><div><b>${r.name}</b>${r.club ? html` <span class="muted">· ${r.club}</span>` : ""}
          <span class="muted"> · ${fmtDate(r.at.slice(0, 10), "short")}</span>${r.message ? html`<div class="mg-msg">${r.message}</div>` : ""}</div>
        <div class="row" style="gap:6px"><button type="button" class="btn btn-sm btn-primary" data-accept="1">${t("mg.team.accept")}</button>
          <button type="button" class="btn btn-sm" data-accept="0">${t("mg.team.decline")}</button></div></div>`)}</div></section>` : ""}
    <section class="card"><div class="card-head"><div><h2>${t("mg.team.title")}</h2><div class="hint">${t("mg.team.hint")}</div></div></div>
      <div class="table-wrap"><table class="data compact"><thead><tr><th>${t("mg.team.member")}</th><th>${t("mg.col.club")}</th><th>${t("mg.team.since")}</th><th></th></tr></thead><tbody>
      ${D.team.map((m) => html`<tr><td><b>${m.name}</b>${m.you ? html` <span class="tag">${t("mg.team.you")}</span>` : ""}${m.creator ? html` <span class="muted">${t("mg.team.created")}</span>` : ""}</td>
        <td class="muted">${m.club || "—"}</td><td class="num">${fmtDate(m.joined.slice(0, 10), "short")}</td>
        <td class="r">${D.team.length > 1 ? html`<button type="button" class="btn btn-sm" data-remove="${m.uid}" data-you="${m.you ? 1 : 0}">${t(m.you ? "mg.team.leave" : "mg.team.remove")}</button>` : ""}</td></tr>`)}
      </tbody></table></div>
      <div class="card-body">
        <!-- the event's address to send to whoever should join (owner, 2026-11-16: the way in was a sentence to select) -->
        <div class="row mg-share"><input type="text" id="mg-addr" readonly value="${addr}" aria-label="${t("mg.team.addr")}">
          <button type="button" class="btn btn-sm btn-primary" id="mg-copy">${t("mg.team.copy")}</button><span class="muted" id="mg-copied" aria-live="polite"></span></div>
        <p class="muted" style="margin:8px 0 0">${t("mg.team.how")}</p></div></section>`;
  $("#mg-addr").addEventListener("focus", (e) => e.target.select());
  $("#mg-copy").addEventListener("click", async () => {
    const say = $("#mg-copied");
    const field = $("#mg-addr");
    try { await navigator.clipboard.writeText(addr); say.textContent = `✓ ${t("mg.team.copied")}`; return; } catch (e) { /* refused: the older way */ }
    field.focus(); field.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* none */ }
    say.textContent = ok ? `✓ ${t("mg.team.copied")}` : t("mg.team.copyHand");          // else selected: Ctrl+C
  });
  $$("[data-req] [data-accept]").forEach((b) => b.addEventListener("click", async () => {
    try { await api(`/${ev.id}/requests/${b.closest("[data-req]").dataset.req}`, { method: "POST", body: { accept: b.dataset.accept === "1" } }); location.reload(); }
    catch (e) { alertBox(errText(e)); }
  }));
  $$("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
    const you = b.dataset.you === "1", m = D.team.find((x) => String(x.uid) === b.dataset.remove);
    if (!(await confirmBox(you ? t("mg.team.leave.q") : t("mg.team.remove.q", { name: m.name }), { ok: t(you ? "mg.team.leave" : "mg.team.remove") }))) return;
    try { await api(`/${ev.id}/members/${b.dataset.remove}`, { method: "DELETE" }); if (you) location.hash = BASE; else location.reload(); }
    catch (e) { alertBox(errText(e)); }
  }));
}

// ---- « ✎ Modifier »: the description, the calendar link, deletion ----------------------------------------------------------
async function editDialog(D) {
  const ev = D.event, linked = isLinked(ev), canLink = kindOf(ev.type) === "competition" && ev.country === "FR";
  const kind0 = kindOf(ev.type), form0 = formOf(ev.type);
  const dlg = document.createElement("dialog");
  dlg.className = "mg-dialog";
  dlg.innerHTML = html`<form method="dialog" class="mg-dlg">
    <h2>${t("mg.edit.title")}</h2>
    <div class="filters" style="margin:0">
      <label class="field"><span>${t("mg.f.type")}</span><select data-f="kind">${Object.keys(KINDS)
        .map((x) => html`<option value="${x}" ${raw(kind0 === x ? "selected" : "")}>${kindLabel(x)}</option>`)}</select></label>
      <label class="field"><span>${t("mg.f.form")}</span><select data-f="form"></select></label>
      <label class="field"><span>${t("mg.f.date")}</span><input type="date" data-f="date" value="${ev.date}" ${raw(linked ? "disabled" : "")}></label>
    </div>
    <p class="muted" id="mg-dl-kind" hidden></p>
    ${formFields(ev)}
    ${canLink ? html`<div class="mg-sec"><h3>${t("mg.edit.calendar")}</h3><div id="mg-dl-link"></div></div>` : ""}
    <div class="mg-sec row" style="justify-content:space-between;align-items:center;gap:10px">
      <button type="button" class="btn btn-sm mg-danger" id="mg-del">${t("mg.edit.delete")}</button>
      <span class="row" style="gap:8px"><span class="muted" id="mg-dl-msg"></span><button type="button" class="btn btn-sm" id="mg-dl-cancel">${t("dlg.cancel")}</button>
        <button type="button" class="btn btn-sm btn-primary" id="mg-dl-save">${t("mg.edit.save")}</button></span></div></form>`;
  document.body.append(dlg);
  dlg.showModal();
  dateWords($("[data-f=date]", dlg));
  // the kind chosen: its forms, its fields, and a word on what changes (a club training holds no competition)
  const kindSel = $("[data-f=kind]", dlg), formSel = $("[data-f=form]", dlg), note = $("#mg-dl-kind", dlg);
  const syncKind = () => {
    const k = kindSel.value, f = formSel.value || form0;
    formSel.innerHTML = html`${KINDS[k].map((x) => html`<option value="${x}" ${raw(x === f ? "selected" : "")}>${formLabel(x)}</option>`)}`;
    showFields(dlg, k === "training");
    if (k !== "training") fillClubs(dlg, ev.country, { setDefault: false });
    const change = k !== kind0 ? (k === "training" ? "toTraining" : kind0 === "training" ? "fromTraining" : "") : "";
    note.hidden = !change;
    note.textContent = change ? t(`mg.edit.kind.${change}`) : "";
  };
  kindSel.addEventListener("change", syncKind);
  syncKind();
  dlg.addEventListener("close", () => dlg.remove());
  $("#mg-dl-cancel", dlg).addEventListener("click", () => dlg.close());
  const say = (s) => { $("#mg-dl-msg", dlg).textContent = s; };
  // the calendar link: linked (detach), waiting, or a competition of its day to link
  async function drawLink() {
    const box = $("#mg-dl-link", dlg);
    if (!box) return;
    if (linked || ev.linkState === "pending") {
      box.innerHTML = html`<p>${t(linked ? "mg.edit.linkedTo" : "mg.edit.pendingTo", { name: D.competition?.name || "" })}</p>
        <button type="button" class="btn btn-sm" id="mg-unlink">${t("mg.edit.unlink")}</button>`;
      $("#mg-unlink", dlg).addEventListener("click", async () => {
        dlg.close();                       // the question in the page, not behind the dialog
        if (!(await confirmBox(t("mg.edit.unlink.q"), { ok: t("mg.edit.unlink") }))) return;
        try { await api(`/${ev.id}/link`, { method: "POST", body: { key: null } }); location.reload(); } catch (e) { alertBox(errText(e)); }
      });
      return;
    }
    const list = (await candidates(ev.date)).filter((x) => !x.holder || x.holder.mine);
    box.innerHTML = list.length ? html`<label class="field"><span>${t("mg.edit.linkTo")}</span><select id="mg-linksel"><option value=""></option>
        ${list.map((x) => html`<option value="${x.key}">${x.e.name}${x.e.org ? ` · ${x.e.org}` : ""}</option>`)}</select></label>
      <button type="button" class="btn btn-sm" id="mg-link" style="margin-top:6px">${t("mg.edit.link")}</button>`
      : html`<p class="muted">${t("mg.edit.noLink", { d: fmtDate(ev.date) })}</p>`;
    $("#mg-link", dlg)?.addEventListener("click", async () => {
      const key = $("#mg-linksel", dlg).value;
      if (!key) return;
      try { await api(`/${ev.id}/link`, { method: "POST", body: { key } }); location.reload(); } catch (e) { say(errText(e)); }
    });
  }
  drawLink();
  $("#mg-dl-save", dlg).addEventListener("click", async () => {
    const body = { ...readForm(dlg), country: ev.country };
    if (linked) delete body.date;
    try { await api(`/${ev.id}`, { method: "PUT", body }); dlg.close(); location.reload(); } catch (e) { say(errText(e)); }
  });
  $("#mg-del", dlg).addEventListener("click", async () => {
    dlg.close();
    if (!(await confirmBox(t(/^d/.test(ev.race || "") ? "mg.edit.delete.qOwn" : "mg.edit.delete.q", { name: ev.name }), { ok: t("mg.edit.delete") }))) return;
    try { await api(`/${ev.id}`, { method: "DELETE" }); location.hash = BASE; } catch (e) { alertBox(errText(e)); }
  });
}
