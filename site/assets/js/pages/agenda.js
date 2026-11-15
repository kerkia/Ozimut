// Agenda: the upcoming events of the FFCO agenda (built daily by ffco_scraper/agenda.py) in one
// long scrolling table, with filters, and the details of the chosen event on the right —
// including the online-registration deadline and the number of registrants. On a computer, the country's map above the
// details (agendamap.js; owner, 2026-10-25): the event under the mouse, and the one selected, shown on it.

import { html, raw, $, $$, fmt, fmtDate, isoDay, fmtFormat, fmtRegion, fmtManif, normalise } from "../util.js";
import { t, tn, locale, has } from "../i18n.js";
import * as data from "../data.js";
import { replaceQuery } from "../app.js";
import { getProv } from "./provisional.js";
import * as country from "../country.js";
import { sees } from "../auth.js";
import { LIVE } from "../livesplits.js";
import * as tracking from "../tracking.js";
import * as agendaMap from "../agendamap.js";
import { probe } from "../livesplits.js";
import { raceFilters } from "../racefilters.js";

const KINDS = ["c", "e", "f"].map((k) => [k, t(`agd.kind.${k}`)]);
const GROUP_ORDER = ["A", "B1", "B2", "C1", "C2", "D"];
// today's, the coming and the past competitions (the last 60 days'), all three at first (owner, 2026-10-30): the list opens on today
const WHEN = ["today", "coming", "past"], WHEN_DEFAULT = ["today", "coming", "past"];

/** Merge of FFCO's "discipline" and "format": Forêt MD, Forêt LD, Sprint, Nuit, VTT MD, Ski, … (the data's French
 *  values compared, shown in the site's language) */
export function typeLabel(e) {
  const sp = e.spec || "", ep = e.epr || "";
  const FOOT = "Pédestre";                                             // the agenda's value (i18n-ignore)
  if (e.kind === "e") return sp && sp !== FOOT ? t("agd.type.trainingIn", { x: fmtFormat(sp) }) : t("agd.type.training");
  if (e.kind === "f") return t("agd.type.workshop");
  if (sp === FOOT) return ep === "MD" || ep === "LD" ? t("agd.type.forest", { x: ep }) : fmtFormat(ep) || t("agd.type.foot");
  if (sp === "VTT" || sp === "Ski") return fmtFormat(ep ? `${sp} ${ep}` : sp);
  if (sp.startsWith("Raid")) return fmtFormat(sp);
  return fmtFormat(ep ? `${sp} ${ep}` : sp) || "—";
}

const groupOf = (e) => (e.kind === "c" ? (e.groupe || "").replace(/^Groupe\s+/i, "") : "");
/** Only http(s) links are made clickable. */
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);
const longDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const keyOf = (e, i) => (e.id != null ? String(e.id) : `x${i}`);
// a competition its organiser declared (« d<id> », a race of the provisional index) as an event of the agenda: the agenda's
// discipline (« Pédestre ») and format from the race's terrain and format
const SPEC = { "Forêt": "Pédestre", Sprint: "Pédestre", VTT: "VTT", Ski: "Ski" };      // the data's values (i18n-ignore)
// a past competition of « Résultats » (the last 60 days of the provisional index) as a row of the list: a click opens its
// results page (owner, 2026-10-30: today's, the coming and the past competitions in one list, three boxes to choose)
const pastEvent = (r) => ({ kind: "c", id: `r:${r.key}`, past: r.key, date: r.date_iso, name: r.name, place: r.place, org: r.org,
  region: r.region || "", country: r.country, cn: !!r.cn, spec: SPEC[r.terrain] || "", epr: r.terrain === "Sprint" ? "Sprint" : r.epreuve || "",
  docs: r.docs || 0, results: !!r.results, splits: !!r.splits, official: !!r.ffco_id, lics: r.lics || [], pos: r.pos || null });
const declaredEvent = (r) => ({ kind: "c", id: r.key, declared: true, date: r.date_iso, name: r.name, place: r.place, org: r.org,
  country: r.country, site: r.url || null, spec: SPEC[r.terrain] || "", epr: r.terrain === "Sprint" ? "Sprint" : r.epreuve || "" });

// Where the list was when the page was left for a race (a row, a link of the details): coming back to the list — the race
// page's « ‹ Compétitions », the browser's Back, the module's name — finds it there, with its periods, instead of on today
// (owner, 2026-10-30), within the hour and in the same country; an address naming an event or the past ones opens as asked
let memo = null;

export async function render(main, { query }) {
  // « IOF WRE » (countries/wre.py; owner, 2026-11-04): the IOF's World Ranking Events, a list of their own (the site's country
  // XW) and in their host country's: its row of the same event tagged « WRE » (the match the build made, `same`), the others
  // added as rows of their own — a country whose calendar Ozimut cannot read has those alone
  const WRE = country.WRE, inWre = country.current() === WRE;
  const W = inWre ? null : await data.countryJson(WRE, "agenda.json").catch(() => null);
  const wres = (W?.events || []).filter((w) => w.host === country.current());
  let A = await data.agenda();
  if (!A && wres.length) A = { events: [], regions: [], depts: {}, specs: [], generated: W.generated, sources: W.sources, wreOnly: true };
  if (A && wres.length) {                    // (the file as loaded is the cache's: copied, never changed)
    const of = new Map(wres.filter((w) => w.same).map((w) => [String(w.same), w]));
    const hit = new Set();
    const rows = A.events.map((e) => {
      const w = e.id != null && of.get(String(e.id));
      if (!w) return e;
      hit.add(w.id);
      return { ...e, wre: true, wc: e.wc || w.wc, src: { ...(e.src || {}), eventor: w.src?.eventor, iof: w.src?.iof } };
    });
    for (const w of wres) if (!hit.has(w.id)) rows.push({ ...w, country: country.current() });
    A = { ...A, events: rows, specs: [...new Set([...(A.specs || []), ...wres.map((w) => w.spec).filter(Boolean)])] };
  }
  if (!A) {
    main.innerHTML = html`<div class="page-head"><div><h1>${t("nav.agenda")}</h1></div></div>
      <div class="card"><div class="empty">${t("agd.unavailable")}</div></div>`;
    return { title: t("nav.agenda") };
  }
  const today = isoDay(new Date());
  // the coming races whose organiser has published a start list (shown on « Récemment »): agenda id -> race key; and the
  // competitions declared by their organisers outside France (functions/api/declared.js), published with the provisional results
  const starts = new Map(), declared = [];
  // the live competitions tied to an event (the provisional index's `live`: liveresultat's number, a broadcast's, a
  // MeOSDjango site's « host/<n> »), and the event of a race key (the organisers' broadcasts name their competition's)
  const liveIds = new Map(), eventOf = new Map();
  // the event's race on « Résultats » once an organiser's list of results is there: its results page (Arena's race page)
  const resultsKey = new Map();
  // the runners each event's lists name (start lists, results; the full index only): the runner filter (owner, 2026-10-30)
  const licsOf = new Map();
  const past = [], pastIds = new Set();
  // the competitions whose start times their organisers opened to booking (api/booking; 2026-11-03): race key -> status
  const bookingP = fetch("api/booking", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // the announcement and the start-time booking found on the organiser's own site (prov/links.json, run.site_links;
  // 2026-11-11: COLE's linked both from its post, FFCO's page neither): event id -> { ann, book }
  const siteLinksP = getProv("links.json").then((x) => x?.events || {}).catch(() => ({}));
  try {
    for (const r of (await getProv("index.json"))?.races || []) {
      const id = String(r.agenda_id || r.key.replace(/^a/, ""));
      eventOf.set(r.key, id);
      if (r.live) liveIds.set(id, r.live);
      if (r.docs && !r.soon) resultsKey.set(id, r.key);
      if (r.lics?.length) licsOf.set(id, r.lics);
      if (r.startlist && r.date_iso >= today) starts.set(id, r.key);
      if (/^d/.test(r.key) && r.date_iso >= today) declared.push(declaredEvent(r));
      if (!r.soon && r.date_iso < today) { past.push(pastEvent(r)); if (r.agenda_id) pastIds.add(String(r.agenda_id)); }
    }
  } catch (e) { /* no start lists then */ }
  const bookings = new Map(((await bookingP)?.events || []).map((x) => [x.key, x]));
  const siteLinks = await siteLinksP;
  // a day's races by département number (2A and 2B after 20, overseas after 95), those known by their region only last
  const depOrder = (d) => (!d ? 1e6 : /^2A$/i.test(d) ? 20.1 : /^2B$/i.test(d) ? 20.2 : parseFloat(d) || 9e5);
  // the site's country's events (country.js; France's alone until another country's agenda is read)
  // (an event of the agenda's last days that « Résultats » has is its past row)
  const events = [...A.events.filter((e) => !(e.date < today && pastIds.has(String(e.id)))), ...declared, ...past]
    .map((e, i) => ({ ...e, key: keyOf(e, i) })).filter((e) => country.of(e) === country.current())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || depOrder(a.dep) - depOrder(b.dep)
      || String(a.name || "").localeCompare(String(b.name || ""), "fr"));
  const byKey = new Map(events.map((e) => [e.key, e]));
  const fr = country.current() === "FR";        // France's CN and FFCO's own pages
  // the country's places, when its agenda has them (France: regions and départements; Spain: communities and provinces)
  const places = (A.regions || []).length > 0;
  const deptName = (c) => A.depts[c] || c;
  // an event FFCO lists without a name of its own carries its type as its name (« Régionale Sprint (sans qualif) »):
  // shown in the reader's language, as the type is
  const nameOf = (e) => (e.manif && e.name === e.manif ? fmtManif(e.name) : e.name);
  // a unit's code and name (« 35 · Ille-et-Vilaine », « TI · Ticino »), its name alone where the name is its code
  const deptLabel = (c) => (deptName(c) === c ? c : `${c} · ${deptName(c)}`);
  // beside a place: a short code in brackets, a name after a dot; nothing when the place already says it (« Val Canali (TN) »)
  const deptTag = (e) => (!e.dep || (e.place || "").includes(e.dep) ? "" : e.dep.length <= 3 ? `(${e.dep})` : `· ${deptName(e.dep)}`);
  // the levels' names in the country (« Canton », « Bezirk »…), else the generic ones
  const cc = country.current();
  const levelName = (lvl) => (fr ? t(`agd.${lvl}`) : has(`agd.${lvl}.${cc}`) ? t(`agd.${lvl}.${cc}`) : t(`agd.${lvl}.other`));
  const regionOfDept = new Map(A.regions.flatMap((r) => r.depts.map((d) => [d, r.name])));
  const allDepts = A.regions.flatMap((r) => r.depts);
  const everyPlace = () => st.regions.size === A.regions.length && st.depts.size === allDepts.length;
  const checkAllPlaces = () => { st.regions = new Set(A.regions.map((r) => r.name)); st.depts = new Set(allDepts); };

  const st = {
    kinds: new Set(["c"]), cnOnly: false, from: "", to: "", spec: "",
    // today's, the coming and the past competitions (an old « Résultats » address: the past ones)
    when: new Set(query.periode === "passees" ? ["past"] : WHEN_DEFAULT),
    regions: new Set(A.regions.map((r) => r.name)), depts: new Set(A.regions.flatMap((r) => r.depts)),
    groups: new Set(), selected: query.id && byKey.has(String(query.id)) ? String(query.id) : null,
  };
  const returning = !query.periode && query.id == null && memo && memo.cc === cc && Date.now() - memo.at < 3600e3 ? memo : null;
  // another country picked from this list: its periods and the filters that are not places go with it (owner, 2026-11-05: they
  // were lost); the places are the other country's
  const carried = !returning && !query.periode && query.id == null && memo?.carry && memo.cc !== cc && Date.now() - memo.at < 60e3 ? memo : null;
  memo = null;
  // the filters too (2026-11-05: a phone's reader came back from a race to the periods kept and every other filter reset)
  if (returning) Object.assign(st, { when: new Set(returning.when), ...(returning.f ? { kinds: new Set(returning.f.kinds), cnOnly: returning.f.cnOnly,
    from: returning.f.from, to: returning.f.to, spec: returning.f.spec, regions: new Set(returning.f.regions), depts: new Set(returning.f.depts),
    groups: new Set(returning.f.groups) } : {}) });
  if (carried) Object.assign(st, { when: new Set(carried.when), kinds: new Set(carried.f.kinds), cnOnly: carried.f.cnOnly,
    from: carried.f.from, to: carried.f.to, spec: carried.f.spec, groups: new Set(carried.f.groups) });
  const groupsPresent = [...new Set(events.map(groupOf).filter(Boolean))]
    .sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

  main.innerHTML = html`<div class="agenda-page" id="agenda-page">
    <div class="page-head"><div><h1>${t("nav.agenda")}</h1>
      <p class="lede">${t("agd.lede", { updated: A.generated ? t("agd.updated", { d: fmtDate(A.generated.slice(0, 10)) }) : "" })}</p></div></div>
    <div class="agenda-layout">
      <div class="agenda-main">
      <section class="card agenda-when" id="when"></section>
      <div class="agenda-bar">
      <details class="filters-fold" id="fold">
        <summary><span>${t("agd.filters")}</span><span class="badge" id="fold-badge" hidden></span></summary>
        <section class="card agenda-filters"><div id="filters"></div><div id="ag-rf"></div></section>
      </details>
      ${country.hint([...Object.entries(data.site()?.countries || {}).filter(([, v]) => v.agenda).map(([cc]) => cc), ...(data.site()?.countries?.[WRE]?.hosts || [])])}
      </div>
      <section class="card" id="list-card"><div class="card-head"><h2 id="count"></h2></div><div class="agenda-table" id="table"></div></section>
      </div>
      <div class="agenda-side"><section class="card agenda-map" id="agmap" hidden></section>
        <section class="card agenda-detail" id="detail"></section></div>
    </div></div>`;
  const page = $("#agenda-page");
  // filters: always open on a wide screen, folded behind a "Filtres" bar on a phone
  const phone = window.matchMedia("(max-width: 980px)");
  const mobile = () => phone.matches;
  const syncFold = () => { if (!phone.matches) $("#fold").open = true; };
  syncFold();
  phone.addEventListener("change", syncFold);

  // today's, a coming or a past competition (an event under way is today's); the list opens on today (toToday)
  const periodOf = (e) => ((e.end || e.date) < today ? "past" : e.date > today ? "coming" : "today");
  let toToday = !returning;
  // a runner: one's own competitions or another runner's, as on the other lists of races (racefilters.js; France's members):
  // the events whose start list or results name them
  const RF = await raceFilters({ id: "agr", races: events, address: false, fields: ["runner"], bare: true,
    facts: (e) => ({ spec: null, region: "", lics: e.lics || licsOf.get(String(e.id)) || [], text: "" }), onChange: () => drawTable() });
  if (RF.withRunner) { $("#ag-rf").innerHTML = RF.html; RF.bind(); }

  // ---- filtering -------------------------------------------------------------------------------
  function visible() {
    const places = everyPlace();
    return events.filter((e) => {
      if (!st.kinds.has(e.kind)) return false;
      if (!st.when.has(periodOf(e))) return false;
      if ((st.from && (e.end || e.date) < st.from) || (st.to && e.date > st.to)) return false;      // a multi-day event under way stays
      if (st.cnOnly && !e.cn) return false;
      if (st.spec && e.spec !== st.spec) return false;
      if (!places) {                                        // some places are unchecked
        if (e.dep) { if (!st.depts.has(e.dep)) return false; }
        else if (e.region) { if (!st.regions.has(e.region)) return false; }
        else return false;                                  // no known place
      }
      if (st.groups.size && !st.groups.has(groupOf(e))) return false;
      return RF.keep(e);
    });
  }

  // ---- filter bar ----------------------------------------------------------------------------------
  const opt = (id, value, label, state) => html`<label><input type="checkbox" data-multi="${id}" value="${value}" data-state="${state}" ${raw(state === "on" ? "checked" : "")}>${label}</label>`;
  const multi = (id, summary, body) => html`<details class="multi" id="${id}">
      <summary><span>${summary}</span></summary>
      <div class="multi-panel">
        <div class="multi-actions"><button type="button" class="clear" data-all="${id}">${t("agd.checkAll")}</button><button type="button" class="clear" data-none="${id}">${t("agd.uncheckAll")}</button></div>
        ${body}
      </div></details>`;
  const summary = (n, total, all, none) => (n === total ? all : n === 0 ? none : t("agd.nOf", { n, total }));
  const regionSummary = () => {
    const states = A.regions.map(regionState);
    const on = states.filter((x) => x === "on").length, part = states.filter((x) => x === "part").length;
    if (on === states.length) return t("agd.allF");
    if (on + part === 0) return t("agd.noneF");
    return part ? tn("agd.partial", part, { on, total: states.length }) : t("agd.nOf", { n: on, total: states.length });
  };
  const regionState = (r) => {
    if (!r.depts.length) return st.regions.has(r.name) ? "on" : "off";
    const n = r.depts.filter((d) => st.depts.has(d)).length;
    return n === r.depts.length ? "on" : n === 0 ? "off" : "part";
  };

  function drawFilters() {
    const openIds = $$("details.multi[open]", main).map((d) => d.id);          // keep an open list open while it redraws
    // today's, the coming and the past competitions: a box of their own, always shown, on a phone too (owner, 2026-10-30)
    $("#when").innerHTML = html`<div class="frow">${WHEN.map((w) => html`<label class="checkline"><input type="checkbox" data-when="${w}" ${raw(st.when.has(w) ? "checked" : "")}><i class="when-sw" data-p="${w}"></i>${t(`agd.when.${w}`)}</label>`)}</div>`;
    $("#filters").innerHTML = html`
      <div class="frow">
        ${KINDS.map(([k, label]) => html`<label class="checkline"><input type="checkbox" data-kind="${k}" ${raw(st.kinds.has(k) ? "checked" : "")}>${label}</label>`)}
        ${sees("FR") && fr ? html`<label class="checkline"><input type="checkbox" id="cn-only" ${raw(st.cnOnly ? "checked" : "")}>${t("agd.cnOnly")}</label>` : ""}
      </div>
      <div class="frow">
        <label class="field"><span>${t("agd.from")}</span><input type="date" id="f-from" value="${st.from}"></label>
        <label class="field"><span>${t("agd.to")}</span><input type="date" id="f-to" value="${st.to}" min="${st.from}"></label>
        <label class="field"><span>${t("agd.spec")}</span><select id="f-spec"><option value="">${t("agd.allF")}</option>
          ${A.specs.map((s) => html`<option value="${s}" ${raw(st.spec === s ? "selected" : "")}>${fmtFormat(s)}</option>`)}</select></label>
        ${places ? html`<div class="field field-wide"><span>${levelName("region")}</span>${multi("m-regions", regionSummary(),
          A.regions.map((r) => opt("m-regions", r.name, fmtRegion(r.name), regionState(r))))}</div>
        ${allDepts.length ? html`<div class="field field-wide"><span>${levelName("dept")}</span>${multi("m-depts", summary(st.depts.size, allDepts.length, t("agd.allM"), t("agd.noneM")),
          A.regions.filter((r) => r.depts.length).map((r) => html`<div class="multi-group">${fmtRegion(r.name)}</div>
            ${r.depts.map((d) => opt("m-depts", d, deptLabel(d), st.depts.has(d) ? "on" : "off"))}`))}</div>` : ""}` : ""}
        <button type="button" class="btn btn-sm" id="f-reset">${t("agd.reset")}</button>
      </div>
      ${groupsPresent.length ? html`<div class="frow"><div class="field"><span>${t("agd.group")}</span>
        <div class="chips" role="group" aria-label="${t("agd.groupAria")}">${groupsPresent.map((g) => html`<button type="button" class="chip toggle" data-group="${g}" aria-pressed="${st.groups.has(g)}"><span class="tick" aria-hidden="true"></span>${g}</button>`)}
        </div></div></div>` : ""}`;
    openIds.forEach((id) => { const d = $(`#${id}`); if (d) d.open = true; });
    $$('input[data-state="part"]', main).forEach((i) => { i.indeterminate = true; });   // region with only some departments checked
  }

  // the filter bar is rebuilt on each change, so its events are delegated once
  const onFilterChange = (e) => {
    const el = e.target;
    if (el.dataset.when) { el.checked ? st.when.add(el.dataset.when) : st.when.delete(el.dataset.when); toToday = true; }
    else if (el.dataset.kind) { el.checked ? st.kinds.add(el.dataset.kind) : st.kinds.delete(el.dataset.kind); }
    else if (el.id === "cn-only") st.cnOnly = el.checked;
    else if (el.id === "f-from") { st.from = el.value || ""; if (st.to && st.from && st.to < st.from) st.to = st.from; }
    else if (el.id === "f-to") st.to = el.value;
    else if (el.id === "f-spec") st.spec = el.value;
    else if (el.dataset.multi === "m-regions") {
      const r = A.regions.find((x) => x.name === el.value);
      const on = el.checked;                                   // a region carries all its departments with it
      on ? st.regions.add(r.name) : st.regions.delete(r.name);
      r.depts.forEach((d) => (on ? st.depts.add(d) : st.depts.delete(d)));
    } else if (el.dataset.multi === "m-depts") {
      el.checked ? st.depts.add(el.value) : st.depts.delete(el.value);
      const r = A.regions.find((x) => x.name === regionOfDept.get(el.value));
      if (r) (r.depts.some((d) => st.depts.has(d)) ? st.regions.add(r.name) : st.regions.delete(r.name));
    }
    else return;
    drawFilters(); drawTable();
  };
  $("#filters").addEventListener("change", onFilterChange);
  $("#when").addEventListener("change", onFilterChange);
  $("#filters").addEventListener("click", (e) => {
    const g = e.target.closest("button[data-group]");          // (not <body data-group>, the menu group's colour)
    if (g) { st.groups.has(g.dataset.group) ? st.groups.delete(g.dataset.group) : st.groups.add(g.dataset.group); drawFilters(); drawTable(); return; }
    const all = e.target.closest("[data-all]"), none = e.target.closest("[data-none]");
    if (all) { checkAllPlaces(); drawFilters(); drawTable(); return; }
    if (none) { st.regions.clear(); st.depts.clear(); drawFilters(); drawTable(); return; }
    if (e.target.closest("#f-reset")) {
      Object.assign(st, { kinds: new Set(["c"]), cnOnly: false, from: "", to: "", spec: "", groups: new Set(), when: new Set(WHEN_DEFAULT) });
      toToday = true;
      checkAllPlaces();
      drawFilters(); drawTable();
    }
  });
  document.addEventListener("click", closeMulti);
  function closeMulti(e) {
    if (!e.target.closest?.(".multi")) $$("details.multi[open]", main).forEach((d) => (d.open = false));
    // on a phone the filters open over the list (2026-10-31): a tap beside them closes them
    const fold = $("#fold", main);
    if (fold?.open && mobile() && !e.target.closest?.("#fold")) fold.open = false;
  }

  // ---- table ------------------------------------------------------------------------------------------------
  let shown = [];
  function activeFilters() {
    return [st.kinds.size !== 1 || !st.kinds.has("c"), st.cnOnly, !!st.from, !!st.to, !!st.spec, !everyPlace(), st.groups.size > 0]
      .filter(Boolean).length;
  }
  // ---- sorting (owner, 2026-11-04: « just make the list sortable by any column, including multiple columns », in place of a
  // country filter for IOF WRE; as the admin's usage tables): a click on a heading sorts by that column alone (again: the other
  // way); Shift + click adds it as a further key, then turns it the other way, then takes it out. The date's own order (and
  // the day's by département, then name) is the default; it breaks every tie. Kept for the visit.
  const SORT_KEY = "ocn.agd.sort", DEFAULT_SORT = [{ key: "date", dir: 1 }];
  let sortBy = (() => { try { const v = JSON.parse(sessionStorage.getItem(SORT_KEY) || "null"); return Array.isArray(v) && v.length ? v : null; } catch (e) { return null; } })() || DEFAULT_SORT;
  const firstDir = (k) => (k === "cn" ? -1 : 1);                 // the CN's races first; dates and texts from the start
  const coll = new Intl.Collator(locale(), { sensitivity: "base", numeric: true });
  const sortVal = (e, k) => (k === "date" ? e.date : k === "cn" ? (e.cn ? 1 : 0) : k === "event" ? nameOf(e) || null
    : k === "place" ? (inWre && e.host ? `${country.name(e.host)} ${e.place || ""}` : e.place || null)
    : k === "region" ? fmtRegion(e.region) || null : k === "type" ? typeLabel(e) || null : null);
  const byDefault = () => sortBy.length === 1 && sortBy[0].key === "date" && sortBy[0].dir === 1;
  const rank = new Map(events.map((e, i) => [e.key, i]));
  function sortedList(list) {
    if (byDefault()) return list;
    return [...list].sort((a, b) => {
      for (const { key, dir } of sortBy) {
        const x = sortVal(a, key), y = sortVal(b, key);
        if (x == null && y == null) continue;
        if (x == null) return 1;                                 // the empty ones last, whichever way
        if (y == null) return -1;
        const c = typeof x === "number" ? x - y : key === "date" ? (x < y ? -1 : x > y ? 1 : 0) : coll.compare(x, y);
        if (c) return c * dir;
      }
      return rank.get(a.key) - rank.get(b.key);
    });
  }
  function sortHead(key, label) {
    const i = sortBy.findIndex((o) => o.key === key);
    const mark = i < 0 ? "" : html`<span class="arrow">${sortBy[i].dir > 0 ? "▲" : "▼"}${sortBy.length > 1 ? html`<sup>${i + 1}</sup>` : ""}</span>`;
    return html`<th scope="col" class="sortable" data-sort="${key}" title="${t("agd.sortHint")}"
      aria-sort="${i === 0 ? (sortBy[0].dir > 0 ? "ascending" : "descending") : "none"}">${label}${mark}</th>`;
  }
  $("#table").addEventListener("click", (ev) => {
    const th = ev.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort, i = sortBy.findIndex((o) => o.key === key);
    if (!ev.shiftKey) sortBy = [{ key, dir: i === 0 && sortBy.length === 1 ? -sortBy[0].dir : i === 0 ? sortBy[0].dir : firstDir(key) }];
    else if (i < 0) sortBy = [...sortBy, { key, dir: firstDir(key) }];
    else if (sortBy[i].dir === firstDir(key) || sortBy.length === 1) sortBy = sortBy.map((o, j) => (j === i ? { ...o, dir: -o.dir } : o));
    else sortBy = sortBy.filter((_, j) => j !== i);
    try { sessionStorage.setItem(SORT_KEY, JSON.stringify(sortBy)); } catch (e) { /* this page only */ }
    drawTable();
  });

  function drawTable() {
    shown = sortedList(visible());
    const n = activeFilters();
    $("#fold-badge").hidden = !n;
    $("#fold-badge").textContent = n;
    $("#count").textContent = tn("agd.count", shown.length);
    map?.show(shown, st.selected, (e) => periodOf(e) !== "coming");      // today's and past ones: only on hover
    // a redraw (live races, start lists found later) keeps the row at the list's top where it was: rows above it may have grown
    const box0 = $("#table"), top0 = box0.getBoundingClientRect().top;
    const anchor = !toToday && box0.scrollTop > 0 ? $$("#table tbody tr").find((r) => r.getBoundingClientRect().bottom > top0 + 1) : null;
    const at0 = anchor ? anchor.getBoundingClientRect().top - top0 : 0, key0 = anchor?.dataset.key;
    $("#table").innerHTML = shown.length ? html`<table class="data"><thead><tr>
        ${sortHead("date", t("agd.col.date"))}${sees("FR") && fr ? sortHead("cn", t("agd.col.cn")) : ""}${sortHead("event", t("agd.col.event"))}${sortHead("place", t(inWre ? "agd.col.country" : "agd.col.place"))}${places ? sortHead("region", levelName("region")) : ""}${sortHead("type", t("agd.col.type"))}</tr></thead>
      <tbody>${shown.map((e) => html`<tr data-key="${e.key}" data-period="${periodOf(e)}" tabindex="0" class="${e.key === st.selected ? "selected" : ""} ${e.cancelled ? "cancelled" : ""} ${e.past ? "past" : ""}">
        <td class="num nowrap d">${fmtDate(e.date, "short")}${e.end ? html`<span class="dim d-end"> → ${fmtDate(e.end, "short")}</span>` : ""}${(e.natcal?.alt || []).map((d) => html`<span class="dim d-end"> ${t("agd.nat.or")} ${fmtDate(d, "short")}</span>`)}</td>
        ${sees("FR") && fr ? html`<td class="c">${e.natcal ? html`<span class="dim" title="${t("agd.nat.cnTip")}">—</span>` : e.cn ? html`<span class="tag tag-in"><span class="m-only">CN</span><span class="d-only">${t("agd.yes")}</span></span>` : html`<span class="dim"><span class="m-only">${t("agd.notCn")}</span><span class="d-only">${t("agd.no")}</span></span>`}</td>` : ""}
        <td class="n">${nameOf(e)}${wreTags(e)}${natTag(e)}${e.cancelled ? html` <span class="tag">${t("agd.cancelled")}</span>` : ""}${starts.has(String(e.id)) ? html` <span class="tag" style="color:var(--accent)" title="${t("agd.startsTip")}">${t("agd.starts")}</span>` : ""}${lives.get(String(e.id))?.now ? html` <a class="lv-badge" href="#/direct/${lives.get(String(e.id)).id}" title="${t("agd.liveTip")}">${t("lv.badge")}</a>` : ""}${trackOf(e) ? html` <span class="tag" title="${t("trk.tagTip")}">${t("trk.tag")}</span>` : ""}${e.past ? pastTags(e) : ""}</td>
        <td class="p">${inWre && e.host ? html`<span class="nowrap">${country.flagImg(e.host)} ${country.name(e.host)}</span>${e.place ? html` <span class="dim">· ${e.place}</span>` : ""}`
          : html`${e.place || ""}${deptTag(e) ? html` <span class="dim">${deptTag(e)}</span>` : ""}`}</td>
        ${places ? html`<td class="r">${fmtRegion(e.region)}</td>` : ""}
        <td class="nowrap t">${typeLabel(e)}</td></tr>`)}</tbody></table>` : html`<div class="empty">${t("agd.empty")}</div>`;
    const back = key0 && $(`#table tr[data-key="${CSS.escape(key0)}"]`);
    if (back) box0.scrollTop += back.getBoundingClientRect().top - top0 - at0;
    // past competitions above today's: the list opens on today (after a change of the three boxes), the last past competition
    // still in sight above it (owner, 2026-10-31: the past ones are there, one scroll up). The list scrolls in its own box, on a
    // phone too since 2026-10-31 (owner: the filters stay in sight); else the page goes there, under the bar
    if (toToday && !byDefault()) { toToday = false; $("#table").scrollTop = 0; }     // (another order: its top)
    if (toToday) {
      toToday = false;
      const box = $("#table");
      const first = st.when.has("past") && $('#table tr[data-period="today"], #table tr[data-period="coming"]');
      const prev = first?.previousElementSibling?.dataset.period === "past" ? first.previousElementSibling : null;
      const head = $("#table thead")?.offsetHeight || 0;
      // placed again once the box has settled (fit.js frames it, which narrows it and wraps its rows anew), unless the reader
      // has scrolled since
      let set = -1;
      const place = () => {
        if (set >= 0 && box.scrollTop !== set) return;
        box.scrollTop = first ? Math.max(0, box.scrollTop + (prev || first).getBoundingClientRect().top - box.getBoundingClientRect().top - head) : 0;
        set = box.scrollTop;
      };
      if (box.scrollHeight > box.clientHeight + 1) { place(); requestAnimationFrame(place); setTimeout(place, 400); setTimeout(place, 1200); }
      else setTimeout(() => {
        // without past competitions, the list's top — only when the page is below it (after a box ticked off)
        const bar = document.querySelector(".topbar")?.offsetHeight || 0;
        const y = Math.max(0, (prev || first || box).getBoundingClientRect().top + window.scrollY - bar - 8);
        if (first || window.scrollY > y) window.scrollTo({ top: y, behavior: "instant" });
      }, 0);
    }
  }
  /** A World Ranking Event's tags: « WRE » in its host country's list (the WRE list is all of them), « Coupe du monde ». */
  // FFCO's national calendars (ffco_scraper/natcal.py; owner, 2026-11-05): a competition they list that the agenda does not yet
  const natTag = (e) => (e.natcal ? html` <span class="tag" title="${t("agd.nat.tip")}">${t(e.natcal.prov ? "agd.nat.tag" : "agd.nat.tagFinal")}</span>` : "");
  const natNote = (e) => {
    const n = e.natcal;
    if (!n) return "";
    const d = n.printed ? fmtDate(n.printed) : "—";
    return html`<div class="reg closed"><div class="dim">${t(n.prov ? "agd.nat.noteProv" : "agd.nat.note", { year: n.year, d })}${
      n.expertise ? html` ${t("agd.nat.expertise")}` : ""}${n.pending ? html` ${t("agd.nat.pending")}` : ""}</div>
      ${safeUrl(n.url) ? html`<p style="margin:6px 0 0"><a class="btn btn-sm" href="${n.url}" target="_blank" rel="noopener">${t("agd.nat.pdf")}</a></p>` : ""}</div>`;
  };
  const wreTags = (e) => html`${e.wre && !inWre ? html` <span class="tag tag-wre" title="${t("agd.wre.tip")}">WRE</span>` : ""}${
    e.wc ? html` <span class="tag tag-wre" title="${t("agd.wc.tip")}">${t("agd.wc")}</span>` : ""}${
    e.prelim ? html` <span class="tag" title="${t("agd.prelim.tip")}">${t("agd.prelim")}</span>` : ""}`;
  /** What « Résultats » found of a past competition: the organisers' results, split times, the official results. */
  const pastTags = (e) => html`${e.results ? html` <span class="tag">${t("agd.past.results")}</span>` : ""}${e.splits ? html` <span class="tag">${t("agd.past.splits")}</span>` : ""}${
    e.official ? html` <span class="tag" title="${t("prov.ffcoResults")}">${t("agd.past.official")}</span>` : ""}`;
  // Wide screen: list and details side by side. Phone: one at a time. Opening an event adds a history
  // entry, so the phone's own Back button (or the one in the details) returns to the list where it was.
  // (the list's own box loses its scroll while hidden: listBox keeps it)
  let pushed = false, listY = 0, listBox = 0;
  function showDetail(key, scroll) {
    st.selected = key;
    $$("#table tr.selected").forEach((r) => r.classList.remove("selected"));
    const row = key && $(`#table tr[data-key="${CSS.escape(key)}"]`);
    row?.classList.add("selected");
    map?.select(key);
    drawDetail();
    page.classList.toggle("detail-open", !!key);
    if (mobile()) { window.scrollTo(0, key ? 0 : listY); if (!key) $("#table").scrollTop = listBox; }
    else if (key && scroll) row?.scrollIntoView({ block: "center" });
  }
  function select(key) {
    const e = byKey.get(key);
    // a past competition: its results page, whose tabs are the analysis's views
    if (e?.past) { location.hash = `#/resultats?course=${encodeURIComponent(e.past)}`; return; }
    if (mobile()) {
      listY = window.scrollY;
      listBox = $("#table").scrollTop;
      pushed = true;
      location.hash = `#/agenda?id=${encodeURIComponent(key)}`;      // the router calls onQuery below
    } else {
      showDetail(key);
      replaceQuery({ id: e && e.id != null ? e.id : null });
    }
  }
  function back() {
    if (pushed) { pushed = false; history.back(); }
    else { history.replaceState(null, "", "#/agenda"); showDetail(null); }
  }
  /** The address changed within the page (Back / Forward, or a tap): follow it without redrawing the page. */
  function onQuery(q) {
    const k = q.id != null && byKey.has(String(q.id)) ? String(q.id) : null;
    if (!k) pushed = false;
    if (k !== st.selected) showDetail(k);
  }
  $("#detail").addEventListener("click", (e) => { if (e.target.closest("[data-back]")) back(); });
  $("#table").addEventListener("click", (e) => { const r = e.target.closest("tr[data-key]"); if (r && !e.target.closest("a")) select(r.dataset.key); });
  // ---- the map (a computer only, agendamap.js): the event under the mouse in the table shown on it, and the reverse
  let map = null;
  async function mountMap() {
    if (map || mobile()) return;
    map = await agendaMap.mount($("#agmap"), cc, {
      levels: { dept: levelName("dept").toLowerCase(), region: levelName("region").toLowerCase() },
      // (the WREs the IOF's calendar alone gives are placed at their country's centre when their name gives no town)
      area: inWre || A.wreOnly ? "agd.map.areaCountry" : "agd.map.area",
      onPick: (key) => { select(key); $(`#table tr[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" }); },
      onHover: (key) => {
        $$("#table tr.map-hover").forEach((r) => r.classList.remove("map-hover"));
        if (key) $(`#table tr[data-key="${CSS.escape(key)}"]`)?.classList.add("map-hover");
      },
    });
    map?.show(shown, st.selected, (e) => periodOf(e) !== "coming");      // today's and past ones: only on hover
  }
  phone.addEventListener("change", mountMap);
  $("#table").addEventListener("mouseover", (e) => { const r = e.target.closest("tr[data-key]"); if (r) map?.hover(r.dataset.key); });
  $("#table").addEventListener("mouseleave", () => map?.hover(null));
  $("#table").addEventListener("focusin", (e) => { const r = e.target.closest("tr[data-key]"); if (r) map?.hover(r.dataset.key); });
  $("#table").addEventListener("keydown", (e) => {
    const r = e.target.closest("tr[data-key]");
    if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(r.dataset.key); }
  });

  // ---- live results -------------------------------------------------------------------------------------------
  // The events under way today with a live competition the relay lists (liveresultat, a MeOSDjango site) or an organiser's
  // broadcast tied to them: event id -> { id: the « En direct » number, now: a punch within the relay's « live » time }.
  // Read once the list is drawn; nothing when none is today.
  const lives = new Map();
  // a live race of today the agenda's ids do not tie takes the event of today whose name fits
  const words = (s) => normalise(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^(19|20)\d\d$/.test(w));
  const fits = (a, b) => { const x = words(a), y = words(b); const n = x.filter((w) => y.includes(w)).length; return n >= Math.min(2, x.length, y.length) && n > 0; };
  async function findLive() {
    const on = events.filter((e) => e.date <= today && (e.end || e.date) >= today && !e.cancelled);
    const ids = new Set(on.map((e) => String(e.id)));
    const set = (ev, id, now) => { const o = lives.get(ev); if (ids.has(ev) && (!o || (now && !o.now))) lives.set(ev, { id, now }); };
    const [list, bc] = await Promise.all([
      fetch(`${LIVE}/api/live/list`, { cache: "no-cache" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/live/broadcasts", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({}))]);
    const liveS = list.liveS || 1800;
    // the relay numbers a SPORTident Center event from 600 000 000, an O'Live race from 700 000 000 and a MeOSDjango site's
    // from 800 000 000 (the site's address last in the row)
    const keyOfComp = (c) => (c[0] >= 6e8 && c[0] < 9e8 ? `${c[7]}/${c[0] % 1e6}` : c[0]);
    const comps = new Map((list.comps || []).map((c) => [keyOfComp(c), c]));
    for (const [ev, xs] of liveIds) for (const x of xs) {
      const c = comps.get(x);
      if (c) set(ev, c[0], c[6] != null && c[6] <= liveS);
    }
    for (const b of bc.broadcasts || []) {
      const ev = b.race && (eventOf.get(b.race) || b.race.replace(/^a/, ""));
      if (ev && b.last) set(ev, b.id, Date.now() - b.last <= liveS * 1000);
    }
    const tied = new Set([...lives.values()].map((l) => String(l.id)));
    const cc = country.current();
    for (const c of list.comps || []) {
      if (tied.has(String(c[0])) || c[3] !== today || ((c[5] || cc) !== cc)) continue;
      const ev = on.find((e) => fits(e.name || "", c[1]));
      if (ev) set(String(ev.id), c[0], c[6] != null && c[6] <= liveS);
    }
    if (!lives.size) return;
    drawTable();
    if (st.selected) drawDetail();
  }
  // the live GPS tracking an organiser linked to their competition (« Organisation › Direct », tracking.js): event id -> link;
  // France's competitions by their agenda id (a race of « Résultats » by the event it is), declared ones by their key
  const tracks = new Map();
  async function findTracking() {
    for (const [k, l] of await tracking.links()) tracks.set(eventOf.get(k) || k.replace(/^a/, ""), l);
    if (!tracks.size) return;
    drawTable();
    if (st.selected) drawDetail();
  }
  const trackOf = (e) => (e.kind === "c" && (e.declared || country.of(e) === "FR") ? tracks.get(String(e.id)) || null : null);

  // ---- details ------------------------------------------------------------------------------------------------
  const link = (u, label) => (safeUrl(u) ? html`<a href="${u}" target="_blank" rel="noopener">${label || u}</a>` : (u || ""));
  const row = (label, value) => (value ? html`<dt>${label}</dt><dd>${value}</dd>` : "");
  const when = (iso) => {
    const n = Math.round((new Date(iso + "T00:00:00") - new Date(today + "T00:00:00")) / 86400e3);
    return n === 0 ? t("agd.today") : n === 1 ? t("agd.tomorrow") : n > 1 ? t("agd.inDays", { n }) : n === -1 ? t("agd.yesterday") : t("agd.daysAgo", { n: -n });
  };



  const probes = new Map();
  async function liveSplits(id) {
    if (!probes.has(id)) probes.set(id, probe(id).catch(() => false));
    if (!(await probes.get(id))) return;
    const box = document.querySelector(`[data-lsplits="${id}"]`);
    if (box) box.innerHTML = html`<a class="btn btn-sm" href="#/analyse-course?course=direct-${id}">${t("agd.live.results")}</a>`.toString();
  }

  function registration(e) {
    if (e.kind !== "c" || e.declared || e.natcal) return "";    // a declared competition: its organiser's own registration
    const r = e.reg;
    // (an agenda read from a calendar that does not tell the entries — `sources`, the other countries' — says nothing)
    if (!r && (A.sources || e.host)) return "";
    if (!r) return html`<div class="reg closed"><div class="reg-title">${t("agd.reg")}</div><div class="dim">${t("agd.reg.none")}</div></div>`;
    const closed = r.closed || (r.close && r.close < today);
    const dates = r.close || r.mods || r.count != null;
    return html`<div class="reg ${closed ? "closed" : "open"}">
      <div class="reg-title">${t("agd.reg.online", { state: closed ? t("agd.reg.closed") : t("agd.reg.open") })}</div>
      ${dates ? html`<dl>
        ${row(t("agd.reg.close"), r.close ? html`<b>${fmtDate(r.close)}</b> <span class="dim">(${when(r.close)})</span>` : "")}
        ${row(t("agd.reg.mods"), r.mods ? html`${fmtDate(r.mods)} <span class="dim">(${when(r.mods)})</span>` : "")}
        ${row(t("agd.reg.count"), r.count != null ? html`<b>${fmt(r.count)}</b>${r.teams != null ? html` <span class="dim">(${tn("agd.reg.teams", r.teams)})</span>` : ""}` : "")}
      </dl>` : html`<div class="dim">${t("agd.reg.noDates")}</div>`}
      ${r.circuits && r.circuits.length ? html`<div class="reg-circ-box">
        <div class="reg-circ-h">${t(fr ? "agd.reg.byCircuit" : "agd.reg.byCat")}</div>
        <table class="reg-circ">${r.circuits.map(([c, n]) => html`<tr><td>${c}</td><td class="num">${fmt(n)}</td></tr>`)}</table>
      </div>` : ""}

      ${r.url ? html`<p style="margin:10px 0 0"><a class="btn btn-primary btn-sm" href="${r.url}" target="_blank" rel="noopener">${t("agd.reg.link")}</a></p>` : ""}
    </div>`;
  }

  // access: the "accès" section of the announcement, and the buttons that start a GPS app
  const gmaps = (g) => `https://www.google.com/maps/dir/?api=1&destination=${g[0]},${g[1]}&travelmode=driving`;
  const waze = (g) => `https://waze.com/ul?ll=${g[0]},${g[1]}&navigate=yes`;
  const apple = (g) => `https://maps.apple.com/?daddr=${g[0]},${g[1]}&dirflg=d`;
  const onApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  /** The way there: the event's spot on Apple's maps on an Apple device, else Google Maps; its route or its place without one. */
  function accessUrl(e) {
    const fl = e.flechage || "";
    const approx = `${fl && !safeUrl(fl) ? `${fl}, ` : ""}${e.place || ""}${e.dep ? ` ${e.dep}` : ""}`.trim();
    return e.gps ? (onApple ? apple(e.gps) : gmaps(e.gps)) : safeUrl(e.mapUrl) ? e.mapUrl
      : approx ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(approx)}` : "";
  }
  /** What the announcement says of the access, the signs, the coordinates: a line of the details. */
  function accessText(e) {
    const fl = e.flechage || "";
    if (!e.access && !fl && !e.gps) return "";
    return html`${e.access ? html`<span class="access-text">${e.access}</span> <span class="dim access-src">${t("agd.access.src")}</span>` : ""}
      ${fl && !(e.access || "").includes(fl) ? html`<div>${raw(t("agd.signs", { x: link(fl) }))}</div>` : ""}
      ${e.gps ? html`<div class="dim">${t("agd.coords", { x: `${e.gps[0]}, ${e.gps[1]}` })}</div>` : ""}`;
  }
  /** The event's actions, one row of buttons at the top of its details (owner, 2026-10-30). */
  function actions(e) {
    const l = lives.get(String(e.id)), key = resultsKey.get(String(e.id)), sk = starts.get(String(e.id)), go = accessUrl(e);
    const bk = bookings.get(/^d/.test(String(e.id)) ? String(e.id) : `a${e.id}`);
    // (FFCO's announcement first; the organiser's site's when FFCO links none; Ozimut's own booking before a sheet's)
    const sl = (e.id != null && siteLinks[String(e.id)]) || {};
    const ann = safeUrl(e.invitation) ? e.invitation : safeUrl(sl.ann) ? sl.ann : null;
    const pdf = ann && /\.pdf(?:$|[?#])/i.test(ann);
    if (l && !key) setTimeout(() => liveSplits(l.id), 0);
    const b = [
      bk ? html`<a class="btn btn-sm ${bk.status === "open" ? "btn-primary" : ""}" href="#/horaire?course=${encodeURIComponent(bk.key)}">${t(bk.status === "open" ? "agd.book" : "agd.booked")}</a>` : "",
      !bk && safeUrl(sl.book) ? html`<a class="btn btn-sm btn-primary" href="${sl.book}" target="_blank" rel="noopener" title="${t("agd.fromSite")}">${t("agd.bookSite")}</a>` : "",
      ann ? html`<a class="btn btn-sm" href="${ann}" target="_blank" rel="noopener"${ann !== e.invitation ? html` title="${t("agd.fromSite")}"` : ""}>${t(pdf || ann === e.invitation ? "agd.invitation" : "agd.invitationPage")}</a>` : "",
      l ? html`<a class="btn btn-sm btn-primary" href="#/direct/${l.id}">${l.now ? html`<span class="lv-dot" aria-hidden="true"></span>` : ""}${t("agd.live.go")}</a>` : "",
      key ? html`<a class="btn btn-sm" href="#/resultats?course=${encodeURIComponent(key)}">${t("agd.live.results")}</a>` : l ? html`<span data-lsplits="${l.id}"></span>` : "",
      tracking.button(trackOf(e)),
      sk && sk !== key ? html`<a class="btn btn-sm" href="#/resultats?course=${encodeURIComponent(sk)}">${t("agd.startTimes")}</a>` : "",
      go ? html`<a class="btn btn-sm" href="${go}" target="_blank" rel="noopener">${t("agd.access")} ↗</a>` : "",
    ].filter(Boolean);
    return b.length ? html`<div class="agd-actions">${b}</div>` : "";
  }

  // where an event of another country comes from: its federation's page (Spain: SICO), its results platform (O-Replay)
  // (the other countries' agendas name their sources in the file, `sources`: key -> the site's name, the value a link)
  const SOURCES = { sico: ["SICO", (v) => v], oreplay: ["O-Replay", (v) => `https://www.oreplay.es/competitions/${v.split("/")[0]}`],
    eventor: ["IOF Eventor", (v) => (safeUrl(v) ? v : "")], iof: ["IOF World Ranking", (v) => (safeUrl(v) ? v : "")],
    ...Object.fromEntries(Object.entries(A.sources || {}).map(([k, name]) => [k, [name, (v) => (safeUrl(v) ? v : "")]])) };
  const sourceLinks = (e) => {
    const out = Object.entries(e.src || {}).filter(([k, v]) => SOURCES[k] && v && SOURCES[k][1](v))
      .map(([k, v]) => html`<a class="btn btn-sm" href="${SOURCES[k][1](v)}" target="_blank" rel="noopener">${t("agd.src", { site: SOURCES[k][0] })}</a>`);
    return out.length ? html`<p class="row" style="margin:0;gap:8px;flex-wrap:wrap">${out}</p>` : "";
  };

  function drawDetail() {
    const e = st.selected && byKey.get(st.selected);
    const box = $("#detail");
    const backBtn = html`<button type="button" class="btn btn-sm detail-back" data-back>${t("agd.back")}</button>`;
    if (!e) { box.innerHTML = html`<div class="empty">${t("agd.pick")}</div>`; return; }
    const region = e.region || (e.dep && regionOfDept.get(e.dep)) || "";
    box.innerHTML = html`
      <div class="detail-nav">${backBtn}</div>
      <div class="card-head"><div><h2>${nameOf(e)}</h2>
        <div class="hint">${e.end ? t("agd.range", { a: longDate(e.date), b: longDate(e.end) }) : longDate(e.date)}${e.cancelled ? ` · ${t("agd.cancelled")}` : ""}</div></div></div>
      <div class="card-body stack" style="gap:14px">
        <div class="row" style="gap:6px">${!sees("FR") || !fr || e.natcal ? "" : e.cn ? html`<span class="tag tag-in">${t("agd.inCn")}</span>` : html`<span class="tag">${t("agd.outCn")}</span>`}
          <span class="tag">${typeLabel(e)}</span>${groupOf(e) ? html`<span class="tag">${t("agd.groupTag", { g: groupOf(e) })}</span>` : ""}</div>
        ${actions(e)}
        ${natNote(e)}
        ${registration(e)}
        <dl>
          ${row(t("agd.nat.dates"), e.natcal?.alt ? [e.date, ...e.natcal.alt].map((d) => fmtDate(d)).join(` ${t("agd.nat.or")} `) : "")}
          ${row(t("agd.access"), accessText(e))}
          ${row(t("agd.d.manif"), fmtManif(e.manif))}
          ${row(t("agd.d.league"), e.league)}
          ${row(t("agd.d.level"), e.level)}
          ${row(t("agd.d.country"), inWre && e.host ? html`${country.flagImg(e.host)} ${country.name(e.host)}` : "")}
          ${row(t("agd.d.place"), e.place ? html`${e.place}${e.dep ? html` (${deptLabel(e.dep)})` : ""}` : e.dep ? deptLabel(e.dep) : "")}
          ${row(t("agd.d.region"), fmtRegion(region))}
          ${row(t("agd.d.spec"), fmtFormat(e.spec))}
          ${row(t("agd.d.epr"), fmtFormat(e.epr))}
          ${row(t("agd.d.org"), e.org)}
          ${row(t("agd.d.referee"), e.referee)}
          ${row(t("agd.d.referee2"), e.referee2)}
          ${row(t("agd.d.controller"), e.controller)}
          ${row(t("agd.d.delegate"), e.delegate)}
          ${row(t("agd.d.monitor"), e.monitor)}
          ${row(t("agd.d.site"), e.site ? link(e.site) : "")}
          ${row(t("agd.d.contact"), e.contact)}
          ${row(t("agd.d.phone"), e.phone ? html`<a href="tel:${e.phone.replace(/\s+/g, "")}">${e.phone}</a>` : "")}
          ${row(t("agd.d.email"), e.email ? html`<a href="mailto:${e.email}">${e.email}</a>` : "")}
          ${(e.extra || []).map(([l, v]) => row(l, v))}
          ${row(t("agd.d.obs"), e.obs ? html`<span style="white-space:pre-line">${e.obs}</span>` : "")}
        </dl>
        ${fr && e.id != null && !e.declared && !e.host ? html`<p style="margin:0"><a class="btn btn-sm" href="https://api.ffcorientation.fr/iframe/courses/${e.id}/" target="_blank" rel="noopener">${t("agd.ffco")}</a></p>` : ""}
        ${sourceLinks(e)}
        <div class="detail-nav">${backBtn}</div>
      </div>`;
  }

  drawFilters();
  drawTable();
  mountMap();
  if (returning) setTimeout(() => {
    const box = $("#table");
    if (box.scrollHeight > box.clientHeight + 1) box.scrollTop = returning.box;
    else window.scrollTo({ top: returning.y, behavior: "instant" });
  }, 0);
  const keep = () => ({ cc, when: [...st.when], f: { kinds: [...st.kinds], cnOnly: st.cnOnly, from: st.from, to: st.to, spec: st.spec,
    regions: [...st.regions], depts: [...st.depts], groups: [...st.groups] }, box: $("#table").scrollTop, y: window.scrollY, at: Date.now() });
  page.addEventListener("click", (e) => { if (e.target.closest("tr[data-key], a[href]")) memo = keep(); }, true);
  // a change of country builds the page again (app.pickCountry): what it keeps is noted before
  const onCountry = () => { memo = { ...keep(), carry: true }; };
  window.addEventListener("ocn:country", onCountry);
  findLive();
  findTracking();
  if (st.selected) {
    // a linked event outside the default filters (past date, other kind) must still be visible
    const e = byKey.get(st.selected);
    if (e && !shown.includes(e)) { st.kinds.add(e.kind); if (e.date < st.from) st.from = e.date; drawFilters(); drawTable(); }
    showDetail(st.selected, true);
  } else drawDetail();
  return { title: t("nav.agenda"), onQuery, cleanup: () => { document.removeEventListener("click", closeMulti); phone.removeEventListener("change", syncFold);
    window.removeEventListener("ocn:country", onCountry);
    phone.removeEventListener("change", mountMap); map?.destroy(); } };
}
