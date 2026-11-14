// « Analyse multi » (owner, 2026-10-15; « Analyse club » / « Analyse compétition » before): for the runners, under
// « Entrainement » (#/analyse-club: training events) and « Courses » (#/analyse-competition: competitions), the events
// their organisers have set up — pick one, add one's trace, compare; one's own curves (heart rate, cadence…) beside the
// map, from one's own file kept on this device, never sent and never shown to others. For the organisers, under
// « Orga › Analyses de carte » (#/orga-analyses; owner, 2026-11-04: one list for the competitions of their club, one
// analysis each, and their training events — #/orga-competitions and #/orga-entrainements before, still opened), the
// same pages manage them. An organiser sets up one or more circuits — the map, its georeference (a KMZ/KML, a world file, an IOF
// XML with coordinates, or the organiser's own GPS trace laid over the controls read on the map), the controls in
// order — and chooses who may open the analysis (every logged-in account, the members of the organiser's club, or a
// password). Each runner then adds their own trace (positions and times only, cropped to the map's area), and the
// traces are replayed together as Livelox does: clock time, mass start, a mass start from any control, or waiting at
// every control; follow everyone, one runner or no one; a leg view (every runner's route on one leg, with time,
// distance, pace and rank) stepped leg by leg; the splits table, against a chosen runner (the duel). For a
// competition, the runners' published results stand beside their traces, and their published split times give the
// passes. After World of O's 2DRerun (2026-10-24): routes coloured by pace, leg time or route choice; the runners' paces
// under the map; under the replay one runner's legs, the gaps along the race, the route choices of a leg, a training's
// corridor and compass exercises (pages/sharedviews.js); a headcam video in step (pages/sharedvideo.js); the replay's
// state in the address. Stored by /api/analyses (R2). Other sources (owner, 2026-11-14): Pixel's runs (pages/virtuallysrc.js) are
// served to the same page through `useSource` — an analysis « px~<race> », read only (`readonly`: no trace added, no comment).

import { html, raw, $, $$, fmt, fmtDate, traceAccept, touchScreen } from "../util.js";
import { t, tn, locale } from "../i18n.js";
import * as auth from "../auth.js";
import { pageTabs, tabFrom, bindPageTabs, dataTable } from "../ui.js";
import { getProv, clock } from "./provisional.js";
import * as declare from "../declare.js";
import * as country from "../country.js";
import { parseTrace, isTraceName, indexAt, posAt, cumAt, cumClimb } from "../trace/track.js";
import { pxToLatLon } from "../trace/drawroute.js";
import { measureTool } from "../trace/measure.js";
import { toPx, toM, fitSimilarity } from "../trace/geom.js";
import * as RC from "../trace/routeplan.js";
import { panelHtml, bindPanel, bindSplitter, PAN_ICON, drawers, stripArrow, iconLabel, floatBar, clearHandle, ICONS, legPickHtml, bindLegPick, legArrows, mapOnlyButton, bindMapOnly, leaveMapOnly } from "../trace/sidepanel.js";
import { keyHtml } from "../trace/legend.js";
import { drawCourse } from "../trace/coursedraw.js";
import { readVector, throughGeo, cover } from "../trace/vectorroutes.js";
import { gridPlan, loadGrid, heightAt, CREDIT } from "../trace/terrain.js";
import { detectCourse } from "../trace/course.js";
import { alignTrack, visitOrder, passesInOrder } from "../trace/align.js";
import { readZip, parseKml, fitFromKml, isWorldFileName, parseWorldFile, crsFromWkt, guessCrs, fitFromWorld, parseIofCourse, projector } from "../trace/georef.js";
import { readMap, isImage, imageBlob } from "../trace/mapfile.js";
import { encodeTrace, decodeTrace, cropToMap, geoFromFit, fitFromGeo, frameAt, validGeo, coursePasses, scorePasses } from "../trace/share.js";
import { mapView } from "../trace/mapview.js";
import { drawCurves, curveRows } from "../trace/curves.js";
import { paceRange, paceColour, paceLegend, rampColour, rampLegend, colourOf, legendHtml, gapSpeed } from "../trace/pacecolour.js";
import { legVariants, resample, VARIANT_COLOURS } from "../trace/routes.js";
import { deviations, corridorScore, bearingError } from "../trace/corridor.js";
import { drawPaceStrip, stripSamples, stripFraction, graphName, isPaceGraph } from "../trace/pacestrip.js";
import { views as bottomViews, legsPanel, TABS } from "./sharedviews.js";
import { videoPanel } from "./sharedvideo.js";
import { matchControls, publishedTaus, publishedPasses, startOnTrace, classLegs } from "../trace/published.js";
import { buttons as fwButtons, bindFull, setFull, leaveFull, inOwnTab } from "../fullwin.js";
import { bar, setBar } from "../waitbar.js";
import * as phone from "../phonelink.js";
import { replaceQuery } from "../app.js";
import { clubAsk } from "./mapanalysis.js";
import { takeInbox } from "../pwa.js";
import { dateWords } from "../datewords.js";
import { confirmBox, alertBox } from "../askbox.js";

const ORG_ROUTE = "#/orga-analyses";                     // the organisers' page: competitions and trainings in one list
/** The club number (4 digits) of a race's organiser ("0109 - O'BUGEY"), as the server's _lib/club.js. */
const orgCode = (org) => { const m = /^\s*(\d{3,4})\b/.exec(String(org || "")); return m ? m[1].padStart(4, "0") : null; };
// one's own file, kept on this device for one's own curves (the same IndexedDB as « Analyse solo »)
const IDB = "ocn-analyse", STORE = "files";
const idb = (mode, fn) => new Promise((res, rej) => {
  const q = indexedDB.open(IDB, 1);
  q.onupgradeneeded = () => q.result.createObjectStore(STORE);
  q.onerror = () => rej(q.error);
  q.onsuccess = () => { const db = q.result, tx = db.transaction(STORE, mode), r = fn(tx.objectStore(STORE)); tx.oncomplete = () => { db.close(); res(r?.result); }; tx.onerror = () => { db.close(); rej(tx.error); }; };
});
const ownKey = (id, n) => `own:${id}:${n}`;
const ownGet = (k) => idb("readonly", (s) => s.get(k)).catch(() => null);
const ownPut = (k, v) => idb("readwrite", (s) => s.put(v, k)).catch(() => null);
const ownDel = (k) => idb("readwrite", (s) => s.delete(k)).catch(() => null);
const COLOURS = ["#e6194b", "#1f77b4", "#2ca02c", "#ff7f0e", "#17becf", "#8c564b", "#d62728", "#bcbd22", "#0b3d91", "#f032e6", "#008080", "#7f7f7f"];
// the trace colours offered for one runner shown, as Solo's (analysis.js TRACE_PRESETS)
const TRACE_PRESETS = ["#3b0764", "#c8102e", "#0b3d91", "#111111", "#ff6a00"];
const SPEEDS = [1, 2, 5, 10, 20, 40, 60, 80, 100];        // every x20 past x20 (owner, 2026-10-15)
const TAILS = [30, 60, 120, 300, 0];
const COURSE = "#a626a4";
// the altitude and the slope from the terrain model's heights under each route (owner, 2026-11-05: « Analyse solo »'s colourings
// that apply here — the shared traces keep no altitude, heart rate or cadence)
const COLOUR_BY = ["runner", "pace", "gap", "ele", "slope", "legtime", "variant"];        // the last two in a leg's view only
const HEIGHT_BY = ["gap", "ele", "slope"];          // from the relief: the pace corrected for the slope, the altitude, the slope
const LEG_ONLY = ["legtime", "variant"];
// what the graph under the map can draw (owner, 2026-11-08: « Graphique »): the pace, then the terrain's measures, as the Trace menu
const GRAPHS = ["speed", "gap", "ele", "slope"];
const MODES = ["clock", "mass", "from", "wait", "waitpause"];
// the start modes' icons (owner, 2026-11-05: the bar fits over the map, the mode a menu of icon and name), 16 px line drawings
// the map's panning button, a crosshair (owner, 2026-11-05)
const MODE_ICON = {
  clock: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.2V8l2.6 1.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  mass: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 3.5v9" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 4.5h7m-2-2 2 2-2 2M4.5 11.5h7m-2-2 2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  from: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="4.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 5h5m-2-2 2 2-2 2M8.5 11h5m-2-2 2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  wait: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 2h8M4 14h8M5 2c0 3.5 6 4 6 6s-6 2.5-6 6M11 2c0 3.5-6 4-6 6s6 2.5 6 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  waitpause: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2h6M2 14h6M3 2c0 3.5 4 4 4 6s-4 2.5-4 6M7 2c0 3.5-4 4-4 6s4 2.5 4 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M10.5 4.5v7M13.5 4.5v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const TOL = 25;                                           // metres: a control reached
const MAX_MAP = 80 * 1024 * 1024;                         // bytes: a map file at most (the server's limit)
const WIDTHS = [[1, "an.width.thin"], [1.6, "an.width.normal"], [2.4, "an.width.thick"], [3.5, "an.width.thicker"]];   // × 2 px
const PREFS_KEY = "ocn.sh.prefs";                         // the replay's display settings, kept on the device
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { return {}; } };
const signed = (s) => (s == null ? "—" : `${s >= 0 ? "+" : "−"}${clock(Math.abs(s))}`);
const pace = (v) => (v > 0.05 ? `${Math.floor(1000 / v / 60)}'${String(Math.round((1000 / v) % 60)).padStart(2, "0")}` : "—");
const hms = (sec) => new Date(sec * 1000).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const today = () => new Date().toISOString().slice(0, 10);
const keyOf = (id) => { try { return sessionStorage.getItem(`ocn.an.key.${id}`) || ""; } catch (e) { return ""; } };
const setKey = (id, k) => { try { sessionStorage.setItem(`ocn.an.key.${id}`, k); } catch (e) { /* this visit only */ } };

// analyses served by the browser itself: id → { api(path, opts) } (Pixel's runs: pages/virtuallysrc.js)
const SOURCES = new Map();
/** Serves an analysis from the browser (its id, its api); returns the function that forgets it. */
export function useSource(src) { SOURCES.set(src.id, src); return () => SOURCES.delete(src.id); }
/** Coach's analysis page for an analysis of another source (the page that holds it gives its element and the address's state). */
export const openSourced = (main, id, query = {}) => eventPage(main, "club", id, false, query);

async function api(path, { method = "GET", body, type, key } = {}) {
  const src = SOURCES.get(/^\/([^/?]+)/.exec(path)?.[1]);
  if (src) return src.api(path, { method, body });
  // a visitor without an account (owner, 2026-11-02): read only, the analyses their organiser opened to visitors
  if (!auth.session() && method === "GET") path = `/v${path}`;
  const headers = {};
  if (key) headers["X-Analysis-Key"] = key;
  let payload;
  if (body instanceof Blob) { payload = body; headers["Content-Type"] = type || body.type || "application/octet-stream"; }
  else if (body != null) { payload = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
  const r = await fetch(`api/analyses${path}`, { method, headers, body: payload, credentials: "same-origin" });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json().catch(() => null) : r.ok ? await r.blob() : null;
  if (!r.ok) { const e = new Error(data?.error || `http ${r.status}`); e.status = r.status; e.code = data?.error; e.data = data; throw e; }
  return data;
}
const errText = (e) => t(`sh.err.${e?.code}`) !== `sh.err.${e?.code}` ? t(`sh.err.${e.code}`) : `${t("sh.err.other")} (${e?.code || e?.message || ""})`;


export async function render(main, r) {
  bindFull(); bindMapOnly();
  if (inOwnTab()) setFull(true);                         // a tab opened alone by « ↗ »: the map page without the site's bar
  const org = r.route === "orgAnalyses";
  const kind = r.route === "analysisRace" ? "race" : "club";
  // the organisers' page: an analysis's kind is its own (read with it)
  if (org) return r.query.id ? eventPage(main, null, r.query.id, true, r.query) : orgListPage(main, r.query);
  // the runners' lists are « Analyse de carte »'s since 2026-11-01 (pages/mapanalysis.js: competitions and trainings in one
  // list, a map beside it); an address of before without an event goes there
  if (!r.query.id) { location.replace("#/analyses"); return { title: t("ma.title") }; }
  return eventPage(main, kind, r.query.id, false, r.query);
}

// ---- the organisers' page: four tabs for its four jobs (owner, 2026-11-04: « create a competition, create a training, open an
// existing event, manage an opened one »; the list of opened analyses by default) ----------------------------------------
// (a fifth, « Analyses solo », for the administrators: owner, 2026-11-08 — every account's kept solo analyses, to know that they
// exist; neither their maps nor their traces, which stay their owner's)
const ORG_TABS = (admin) => [["ouvertes", t("sh.org.tab.opened")], ["ouvrir", t("sh.org.tab.open")],
  ["competition", t("sh.org.tab.newRace")], ["entrainement", t("sh.org.tab.newTraining")], ...(admin ? [["solo", t("sh.org.tab.solo")]] : [])];

async function orgListPage(main, query = {}) {
  const me = auth.session();
  const tabs = ORG_TABS(!!me?.admin), tab = tabFrom(tabs, query);
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("sh.org.title")}</h1><p class="lede">${t("sh.org.lede")}</p></div></div>
    ${raw(pageTabs(tabs, tab))}
    <div data-panel="ouvertes" ${raw(tab === "ouvertes" ? "" : "hidden")}>
      <div class="sh-pick-bar"><label class="field"><span>${t("sh.org.filter")}</span><input id="sh-f-opened" placeholder="${t("sh.org.filter.ph")}" style="width:240px"></label>
        <span class="sh-pick-act"><span class="muted" id="sh-sel-opened">${t("sh.org.pick.opened")}</span>
          <button type="button" class="btn btn-primary" id="sh-go-opened" disabled>${t("sh.org.manageSel")}</button></span></div>
      <section class="card"><div class="table-wrap" id="sh-list-opened"><div class="empty">${t("misc.loading")}</div></div></section>
    </div>
    <div data-panel="ouvrir" ${raw(tab === "ouvrir" ? "" : "hidden")}>
      <p class="hint sh-tab-intro">${t("sh.org.open.intro")}</p>
      <div class="notice" id="sh-open-note" hidden style="margin:0 0 10px"></div>
      <div class="sh-pick-bar"><label class="field"><span>${t("sh.org.filter")}</span><input id="sh-f-open" placeholder="${t("sh.org.filter.ph")}" style="width:240px"></label>
        <span class="sh-pick-act"><span class="muted" id="sh-sel-open">${t("sh.org.pick.open")}</span>
          <button type="button" class="btn btn-primary" id="sh-go-open" disabled>${t("sh.org.activate")}</button></span></div>
      <section class="card"><div class="table-wrap" id="sh-list-open"><div class="empty">${t("misc.loading")}</div></div></section>
    </div>
    <div data-panel="competition" ${raw(tab === "competition" ? "" : "hidden")}>
      <p class="hint sh-tab-intro">${t("sh.org.newRace.intro")}</p>
      <div id="dc-card"></div>
    </div>
    <div data-panel="entrainement" ${raw(tab === "entrainement" ? "" : "hidden")}>
      <section class="card sh-create" id="sh-create"></section>
    </div>
    ${me?.admin ? html`<div data-panel="solo" ${raw(tab === "solo" ? "" : "hidden")}>
      <p class="hint sh-tab-intro">${t("sh.solo.intro")}</p>
      <div class="sh-pick-bar"><label class="field"><span>${t("sh.org.filter")}</span><input id="sh-f-solo" placeholder="${t("sh.solo.filter.ph")}" style="width:240px"></label>
        <span class="sh-pick-act muted" id="sh-solo-sum"></span></div>
      <section class="card"><div id="sh-list-solo"><div class="empty">${t("misc.loading")}</div></div></section>
    </div>` : ""}
    <p class="muted" style="font-size:12.5px;margin:6px 2px 0" id="sh-storage"></p>`;
  const show = bindPageTabs(main, tabs, tab);
  let data;
  try { data = await api(""); }
  catch (e) { $("#sh-list-opened").innerHTML = $("#sh-list-open").innerHTML = html`<div class="empty">${errText(e)}</div>`; return { title: t("sh.org.title") }; }
  const club = data.club;
  createForm($("#sh-create"), club);
  const day0 = today();
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  // the analyses one manages here: those one opened oneself, every organiser's for an administrator (owner, 2026-11-04: « besides
  // admins, users should only see the events they have created »); a competition opened by a club-mate is not offered again
  const own = data.analyses.filter((a) => a.organiser && (me?.admin || a.mine));
  const byRace = new Map(data.analyses.filter((a) => a.kind === "race" && a.organiser).map((a) => [a.race, a]));
  // the competitions that may be opened: those of the last 60 days organised by one's club (all of them for an administrator)
  // and those the account created outside France (declare.js), whatever their day: an organiser may prepare the map before
  const races = ((await getProv("index.json"))?.races || []).filter((x) => x.docs && !x.soon && x.date_iso <= day0);
  let created = [];
  const toOpen = () => {
    const keys = new Set(created.map((d) => d.key));
    const listed = me?.admin ? races : races.filter((x) => (club && orgCode(x.org) === club) || keys.has(x.key));
    const all = [...listed, ...created.filter((d) => !listed.some((x) => x.key === d.key)).map(declare.asRace)];
    return all.filter((x) => !byRace.has(x.key)).map((x) => ({ key: x.key, date: x.date_iso, name: x.name, place: x.place, org: x.org }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name, "fr"));
  };
  // the opened analyses: the competitions' and the trainings'
  const opened = own.map((a) => {
    const x = a.kind === "race" ? races.find((r) => r.key === a.race) : null;
    return { id: a.id, kind: a.kind, date: a.date, name: a.title, place: x?.place, org: a.kind === "race" ? x?.org : a.ownerName, a };
  }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.name.localeCompare(b.name, "fr"));

  // who opened each analysis, when and from where (owner, 2026-11-04: « who did this? »): its organisers see the name, the
  // administrators the account's e-mail too
  const byLine = (a) => html`${a.ownerName || t("sh.by.gone")}${a.created ? html` <span class="muted">· ${fmtDate(a.created.slice(0, 10), "short")}</span>` : ""}${a.via ? html`<div class="muted sh-by-via">${t(`sh.via.${a.via}`)}</div>` : ""}`;
  const byTitle = (a) => [a.ownerEmail, a.via ? t(`sh.via.${a.via}`) : t("sh.via.unknown")].filter(Boolean).join(" · ");
  const nameCell = (x) => html`<td class="cut" title="${x.place ? `${x.name} · ${x.place}` : x.name}">${x.name}${x.place ? html` <span class="muted">· ${x.place}</span>` : ""}</td>`;
  const empty = (msg, ...links) => html`<div class="empty">${msg}${links.length ? html`<div class="row" style="gap:8px;justify-content:center;margin-top:10px">${links.map(([k, label]) =>
    html`<button type="button" class="btn btn-sm" data-to-tab="${k}">${label}</button>`)}</div>` : ""}</div>`;

  // a list to choose from, and its one button (owner: « a selection from the list and a button »): a click on a row chooses it,
  // a double click or Enter acts on it. Its columns sort as the Agenda's (owner, 2026-11-04: « multi-sorting on the tables »): a
  // click on a heading sorts by it alone (again: the other way), Shift + click adds it as a further key, then turns it, then
  // takes it out; kept for the visit
  const coll = new Intl.Collator(locale(), { sensitivity: "base", numeric: true });
  const picker = ({ list, box, filter, label, go, rows, colgroup, cols, none, act, sortKey }) => {
    let sel = null;
    const DEF = [{ key: "date", dir: -1 }];
    let sortBy = (() => { try { const v = JSON.parse(sessionStorage.getItem(sortKey) || "null"); return Array.isArray(v) && v.length ? v : null; } catch (e) { return null; } })() || DEF;
    const colOf = (k) => cols.find((c) => c.key === k);
    const firstDir = (k) => colOf(k)?.dir || 1;
    const sorted = (xs) => {
      const at = new Map(xs.map((x, i) => [x.key, i]));
      return [...xs].sort((a, b) => {
        for (const { key, dir } of sortBy) {
          const c = colOf(key); if (!c) continue;
          const x = c.val(a), y = c.val(b);
          if ((x == null || x === "") && (y == null || y === "")) continue;
          if (x == null || x === "") return 1;                     // the empty ones last, whichever way
          if (y == null || y === "") return -1;
          const d = typeof x === "number" ? x - y : coll.compare(String(x), String(y));
          if (d) return d * dir;
        }
        return at.get(a.key) - at.get(b.key);
      });
    };
    const head = () => html`<thead><tr><th></th>${cols.map((c) => {
      const i = sortBy.findIndex((o) => o.key === c.key);
      const mark = i < 0 ? "" : html`<span class="arrow">${sortBy[i].dir > 0 ? "▲" : "▼"}${sortBy.length > 1 ? html`<sup>${i + 1}</sup>` : ""}</span>`;
      return html`<th scope="col" class="sortable" data-sort="${c.key}" title="${c.tip ? `${c.tip} — ${t("agd.sortHint")}` : t("agd.sortHint")}"
        aria-sort="${i === 0 ? (sortBy[0].dir > 0 ? "ascending" : "descending") : "none"}">${c.label}${mark}</th>`; })}</tr></thead>`;
    const mark = () => {
      $$(`#${box} tr[data-k]`).forEach((tr) => { const on = tr.dataset.k === sel; tr.classList.toggle("sh-sel", on); const r = $("input", tr); if (r) r.checked = on; });
      const x = list().find((y) => y.key === sel);
      $(`#${go}`).disabled = !x;
      $(`#${label}`).textContent = x ? x.name : t(label === "sh-sel-opened" ? "sh.org.pick.opened" : "sh.org.pick.open");
    };
    const draw = () => {
      const q = norm($(`#${filter}`).value);
      const all = list(), shown = sorted(q ? all.filter((x) => norm(`${x.name} ${x.org || ""} ${x.place || ""} ${x.a?.ownerName || ""} ${x.a?.ownerEmail || ""} ${t(`sh.org.type.${x.kind || "race"}`)}`).includes(q)) : all);
      if (sel && !shown.some((x) => x.key === sel)) sel = null;
      $(`#${box}`).innerHTML = shown.length ? html`<table class="data compact sh-orglist" data-freeze="1" data-freeze-phone="1">${raw(colgroup)}${raw(head())}
        <tbody>${shown.map((x) => html`<tr data-k="${x.key}" tabindex="-1"><td class="c-sel"><input type="radio" name="${box}" value="${x.key}" aria-label="${x.name}"></td>${raw(rows(x))}</tr>`)}</tbody></table>`
        : q ? html`<div class="empty">${t("lv.find.none")}</div>` : none();
      $$(`#${box} tr[data-k]`).forEach((tr) => {
        tr.addEventListener("click", () => { sel = tr.dataset.k; mark(); });
        tr.addEventListener("dblclick", () => { sel = tr.dataset.k; mark(); act(list().find((y) => y.key === sel)); });
      });
      $$(`#${box} input[type=radio]`).forEach((r) => {
        r.addEventListener("change", () => { sel = r.value; mark(); });
        r.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const x = list().find((y) => y.key === r.value); if (x) act(x); } });
      });
      $$(`#${box} [data-to-tab]`).forEach((b) => b.addEventListener("click", () => show(b.dataset.toTab)));
      mark();
    };
    $(`#${filter}`).addEventListener("input", draw);
    $(`#${go}`).addEventListener("click", () => { const x = list().find((y) => y.key === sel); if (x) act(x); });
    $(`#${box}`).addEventListener("click", (ev) => {
      const th = ev.target.closest("th[data-sort]");
      if (!th) return;
      const key = th.dataset.sort, i = sortBy.findIndex((o) => o.key === key);
      if (!ev.shiftKey) sortBy = [{ key, dir: i === 0 && sortBy.length === 1 ? -sortBy[0].dir : i === 0 ? sortBy[0].dir : firstDir(key) }];
      else if (i < 0) sortBy = [...sortBy, { key, dir: firstDir(key) }];
      else if (sortBy[i].dir === firstDir(key) || sortBy.length === 1) sortBy = sortBy.map((o, j) => (j === i ? { ...o, dir: -o.dir } : o));
      else sortBy = sortBy.filter((_, j) => j !== i);
      try { sessionStorage.setItem(sortKey, JSON.stringify(sortBy)); } catch (e) { /* this page only */ }
      draw();
    });
    // a row chosen from outside (a competition just created): shown, chosen, brought into view
    const select = (k) => { sel = k; draw(); $(`#${box} tr[data-k="${CSS.escape(k)}"]`)?.scrollIntoView({ block: "center" }); };
    return { draw, select };
  };

  // 1. the opened analyses, to manage
  const openedRows = opened.map((x) => ({ ...x, key: x.id }));
  picker({ list: () => openedRows, box: "sh-list-opened", filter: "sh-f-opened", label: "sh-sel-opened", go: "sh-go-opened", sortKey: "ocn.sh.sort.opened",
    colgroup: html`<colgroup><col class="c-sel"><col class="c-date"><col class="c-type"><col><col class="c-org"><col class="c-status"><col class="c-by"></colgroup>`,
    cols: [{ key: "date", label: t("f.date"), dir: -1, val: (x) => x.date || "" },
      { key: "type", label: t("sh.org.col.type"), val: (x) => t(`sh.org.type.${x.kind}`) },
      { key: "event", label: t("sh.org.col.event"), val: (x) => x.name },
      { key: "org", label: t("sh.org.col.org"), val: (x) => x.org || "" },
      { key: "state", label: t("sh.org.col.state"), val: (x) => (x.a.draft ? 0 : 1000) + (Number(x.a.courses) || 0) },
      { key: "by", label: t("sh.org.col.by"), tip: t("sh.org.col.by.tip"), val: (x) => `${x.a.ownerName || ""} ${x.a.created || ""}` }],
    rows: (x) => html`<td class="num">${x.date ? fmtDate(x.date, "short") : "—"}</td><td><span class="tag">${t(`sh.org.type.${x.kind}`)}</span></td>${raw(nameCell(x))}
      <td class="muted cut" title="${x.org || ""}">${x.org || "—"}</td>
      <td class="cut"><span class="tag ${x.a.draft ? "sh-m-draft" : "sh-m-live"}">${t(x.a.draft ? "sh.m.state.draft" : "sh.m.state.live")}</span> <span class="muted">${tn("ma.courses", x.a.courses)}${x.kind === "club" ? ` · ${t(`sh.vis.${x.a.vis}`)}` : ""}</span></td>
      <td class="cut" title="${byTitle(x.a)}">${raw(byLine(x.a))}</td>`,
    none: () => empty(t("sh.org.opened.none"), ["ouvrir", t("sh.org.tab.open")], ["entrainement", t("sh.org.tab.newTraining")]),
    act: (x) => { location.hash = `${ORG_ROUTE}?id=${x.id}`; } }).draw();

  // 2. the competitions not opened yet, to open
  const openList = picker({ list: toOpen, box: "sh-list-open", filter: "sh-f-open", label: "sh-sel-open", go: "sh-go-open", sortKey: "ocn.sh.sort.open",
    colgroup: html`<colgroup><col class="c-sel"><col class="c-date"><col><col class="c-org"></colgroup>`,
    cols: [{ key: "date", label: t("f.date"), dir: -1, val: (x) => x.date || "" },
      { key: "event", label: t("sh.org.type.race"), val: (x) => x.name },
      { key: "org", label: t("sh.org.col.org"), val: (x) => x.org || "" }],
    rows: (x) => html`<td class="num">${x.date ? fmtDate(x.date, "short") : "—"}</td>${raw(nameCell(x))}<td class="muted cut" title="${x.org || ""}">${x.org || "—"}</td>`,
    none: () => club || me?.admin ? empty(t("sh.org.open.none", { club: club || "—" }), ["competition", t("sh.org.tab.newRace")])
      : !auth.sees("FR") ? empty(t("sh.org.open.noCountry"), ["competition", t("sh.org.tab.newRace")]) : empty(t("sh.org.noclub")),
    act: async (x) => {
      const b = $("#sh-go-open");
      b.disabled = true;
      try { const r = await api("", { method: "POST", body: { kind: "race", race: x.key, title: x.name, date: x.date, vis: "public", via: "list" } }); location.hash = `${ORG_ROUTE}?id=${r.id}`; }
      catch (e) { b.disabled = false; alertBox(errText(e)); }
    } });
  openList.draw();

  // 3. a competition created by its organiser (outside France: France's come from the federation's calendar): the form at once,
  // nothing listed (owner, 2026-11-04: « this page is not there to list competitions created »); once created, it is chosen in 2
  declare.card($("#dc-card"), { formOnly: true, onCreated: (c) => {
    created = [c, ...created.filter((d) => d.key !== c.key)];
    show("ouvrir");
    openList.select(c.key);
    const note = $("#sh-open-note");
    note.textContent = t("sh.org.created", { name: c.name });
    note.hidden = false;
  } });
  declare.load().then((D) => { created = D.competitions || []; openList.draw(); });

  if (me?.admin) {
    const mb = (b) => (b >= 1e9 ? t("unit.gb", { n: fmt(b / 1e9, 2) }) : t("unit.mb", { n: fmt(b / 1e6, 1) }));
    api("?stats=1").then((st) => { $("#sh-storage").textContent = t("sh.storage", { used: mb(st.bytes), an: mb(st.analyses), maps: st.maps, traces: st.traces }); }).catch(() => {});
    soloAdminList(mb);
  }
  return { title: t("sh.org.title") };
}

/** The administrators' tab « Analyses solo »: every account's kept solo analyses (GET /api/solo?all=1), listed only — no link
 *  opens one, the map and the run being their owner's. */
async function soloAdminList(mb) {
  const box = $("#sh-list-solo");
  if (!box) return;
  let d;
  try {
    const r = await fetch("api/solo?all=1", { credentials: "same-origin" });
    d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  } catch (e) { box.innerHTML = html`<div class="empty">${t("sh.err.other")} (${e.message})</div>`; return; }
  const all = d.analyses || [];
  const byUid = new Map((d.accounts || []).map((a) => [a.uid, a]));
  $("#sh-solo-sum").textContent = t("sh.solo.sum", { n: fmt(all.length), accounts: fmt((d.accounts || []).length), size: mb(d.bytes || 0) });
  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const who = (a) => a.name || t("sh.solo.account", { n: a.uid });
  const draw = () => {
    const q = norm($("#sh-f-solo").value);
    const rows = q ? all.filter((a) => norm(`${a.title} ${a.name} ${a.email}`).includes(q)) : all;
    if (!rows.length) { box.innerHTML = html`<div class="empty">${t(all.length ? "lv.find.none" : "sh.solo.none")}</div>`; return; }
    dataTable(box, {
      rows, sortKey: "created", sortDir: -1, compact: true, freeze: [0, 0],
      columns: [
        { key: "created", label: t("sh.solo.col.saved"), cls: "num", sort: (a) => a.created || "",
          render: (a) => (a.created ? fmtDate(a.created.slice(0, 10), "short") : "—") },
        { key: "day", label: t("f.date"), cls: "num", sort: (a) => a.day || "", render: (a) => (a.day ? fmtDate(a.day, "short") : "—") },
        { key: "title", label: t("sh.solo.col.title"), cls: "cut", sort: (a) => norm(a.title), defaultDir: 1,
          render: (a) => html`${a.title || t("ma.solo.untitled")}${a.priv ? html` <span class="tag" title="${t("sh.solo.priv.tip")}">${t("sh.solo.priv")}</span>` : ""}` },
        { key: "kind", label: t("sh.org.col.type"), sort: (a) => a.source, defaultDir: 1,
          render: (a) => html`<span class="tag">${t(`sh.solo.src.${a.source === "drawn" || a.source === "orga" ? a.source : "solo"}`)}</span>` },
        { key: "dist", label: t("sh.solo.col.dist"), align: "r", cls: "num", sort: (a) => a.dist, render: (a) => (a.dist ? `${fmt(a.dist / 1000, 2)} km` : "—") },
        { key: "dur", label: t("sh.solo.col.dur"), align: "r", cls: "num", sort: (a) => a.dur, render: (a) => (a.dur ? clock(a.dur) : "—") },
        { key: "who", label: t("sh.solo.col.who"), cls: "cut", sort: (a) => norm(who(a)), defaultDir: 1,
          render: (a) => html`<span title="${a.email || ""}">${who(a)}</span>${a.email ? html` <span class="muted">· ${a.email}</span>` : ""}` },
        { key: "acc", label: t("sh.solo.col.acc"), align: "r", cls: "num", sort: (a) => byUid.get(a.uid)?.bytes || 0,
          render: (a) => { const u = byUid.get(a.uid); return u ? html`<span title="${t("sh.solo.acc.tip", { n: fmt(u.analyses), maps: fmt(u.maps) })}">${mb(u.bytes)}</span>` : "—"; } },
      ],
    });
  };
  $("#sh-f-solo").addEventListener("input", draw);
  draw();
}

// 4. a training event: its analysis created at once (a draft, its organiser's alone until « Publier »)
function createForm(box, club) {
  box.innerHTML = html`<div class="card-body"><p class="hint" style="margin:0 0 10px">${t("sh.org.newTraining.intro")}</p>
    <div class="filters" style="align-items:flex-end">
      <label class="field"><span>${t("sh.col.title")}</span><input id="sh-title" style="width:280px" maxlength="120"></label>
      <label class="field"><span>${t("f.date")}</span><input type="date" id="sh-date" value="${today()}"></label></div>
    <fieldset class="sh-vis"><legend>${t("sh.col.access")}</legend>
      <label><input type="radio" name="sh-vis" value="public" checked> ${t("sh.vis.public.long")}</label>
      <label><input type="radio" name="sh-vis" value="club" ${raw(club ? "" : "disabled")}> ${t("sh.vis.club.long")}${club ? "" : html` <span class="muted">(${t("sh.noclub")})</span>`}</label>
      <label class="sh-code-row" hidden title="${t("sh.code.tip")}" style="margin-left:24px"><input type="checkbox" id="sh-code"> ${t("sh.code")} <input type="text" id="sh-code-v" placeholder="${t("sh.pw.ph")}" style="width:160px" autocomplete="off"></label>
      <label><input type="radio" name="sh-vis" value="password"> ${t("sh.vis.password.long")} <input type="text" id="sh-pw" placeholder="${t("sh.pw.ph")}" style="width:180px" autocomplete="off"></label></fieldset>
    <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn btn-primary" id="sh-create-go">${t("sh.org.createTraining")}</button><span class="muted" id="sh-create-note"></span></div></div>`;
  $("#sh-title").value = t("sh.club.default", { d: fmtDate(today()) });
  dateWords($("#sh-date"));                                  // the day in words: the browser orders the field its own way
  // the club's access may also take a code for its invitees (owner, 2026-11-07)
  const codeRow = () => { $(".sh-code-row").hidden = $("input[name=sh-vis]:checked").value !== "club"; };
  $$("input[name=sh-vis]").forEach((r) => r.addEventListener("change", codeRow));
  $("#sh-code-v").addEventListener("input", (e) => { if (e.target.value) $("#sh-code").checked = true; });
  $("#sh-create-go").addEventListener("click", async () => {
    const vis = $("input[name=sh-vis]:checked").value, code = vis === "club" && $("#sh-code").checked;
    const body = { kind: "club", title: $("#sh-title").value, date: $("#sh-date").value, vis, code,
      password: code ? $("#sh-code-v").value : $("#sh-pw").value, country: country.current() };
    if (code && body.password.length < 2) { $("#sh-create-note").textContent = t("ma.code.short"); return; }
    try { const r = await api("", { method: "POST", body: { ...body, via: "form" } }); if (vis === "password") setKey(r.id, ""); location.hash = `${ORG_ROUTE}?id=${r.id}`; }
    catch (e) { $("#sh-create-note").textContent = errText(e); }
  });
}

// ---- one analysis -------------------------------------------------------------------------------------------------
async function eventPage(main, kind, id, org = false, query = {}) {
  const homeTitle = t(org ? "nav.orgAnalyses" : "ma.title");
  main.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
  let data;
  try { data = await api(`/${id}`, { key: keyOf(id) }); }
  catch (e) {
    if (e.code === "locked") return unlockPage(main, kind, id);
    if (e.code === "club") return unlockPage(main, kind, id, e.data);
    main.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`;
    return { title: homeTitle };
  }
  const A = data.analysis, organiser = data.you.organiser;
  kind = kind || A.kind;                                  // the organisers' page opens either kind
  if (org && !organiser) {
    main.innerHTML = html`<div class="card"><div class="empty">${t("sh.org.notOrg")}</div></div>`;
    return { title: homeTitle };
  }
  let race = null;
  if (kind === "race" && A.race) race = await getProv(`${encodeURIComponent(A.race)}.json`);
  if (org) return managePage(main, id, data, race, query.embed === "1");
  // the circuit, and the replay's state, from the address (a link reopens the same view)
  let courseN = A.courses.some((c) => String(c.n) === query.c) ? Number(query.c) : A.courses[0]?.n ?? null, viewer = null, initial = query;
  main.innerHTML = html`
    <div class="sh-top sh-top3"><span class="sh-top-l">
      <b class="sh-title">${A.title}</b><span class="muted">${fmtDate(A.date)} · ${t(A.via === "pixel" ? "sh.kind.pixel" : A.kind === "race" ? "ma.kind.race" : "sh.kind.club")}</span>
      </span><span class="sh-tabs" id="sh-tabs"></span><span class="sh-top-r">
      ${organiser && A.draft ? html`<span class="tag sh-m-draft" title="${t("sh.m.draft.tip")}">${t("sh.m.state.draft")}</span>` : ""}
      <span class="sh-top-add" id="sh-top-add"></span>
      <span class="muted sh-access">${t(`sh.access.${A.vis === "public" && A.visitors ? "all" : A.vis === "club" && A.code ? "clubCode" : A.vis}`)}</span>
      <span class="fw-btns">${raw(mapOnlyButton())}${raw(fwButtons({ tab: false }))}</span></span></div>
    <div id="sh-viewer"></div>
    <div id="sh-splits" class="sh-splits" hidden></div>
    <div class="sh-fresh" id="sh-fresh" role="status" hidden><span id="sh-fresh-t"></span>
      <button type="button" class="btn btn-sm btn-primary" id="sh-fresh-go">${t("sh.fresh.go")}</button>
      <button type="button" class="sh-fresh-x" id="sh-fresh-x" title="${t("sh.fresh.close")}" aria-label="${t("sh.fresh.close")}">×</button></div>`;
  // two views of the analysis (owner, 2026-11-04): the map (the replay, its panels) and Arena's split analysis of the times the
  // tracks give at the controls, in the map's place. The circuit is chosen in the left panel's « Circuits » tab (chips by the
  // title would not scale). The split times keep the map's layout (owner, 2026-11-05: the page seemed to change): the circuit
  // and runners in the left panel, the views in the middle, their settings in the right panel
  let pane = query.vue === "temps" ? "splits" : "map", splitsKey = "", splitsView = null, splitsCourse = null;
  const sp = { lp: { tab: "runners", collapsed: false }, rp: { tab: "settings", collapsed: false }, lw: 320, rw: 270 };
  const spFit = () => { const el = $("#sh-sp-layout"); if (!el || pane !== "splits") return; const top = el.getBoundingClientRect().top + window.scrollY; el.style.height = `${Math.max(drawers() ? 200 : 380, Math.floor(innerHeight - top - 16))}px`; };
  window.addEventListener("resize", spFit);
  function splitsLayout() {
    if ($("#sh-sp-layout")) return;
    const P = loadPrefs(), px = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
    sp.lw = px(P.lw, 200, 1400, 320); sp.rw = px(P.rw, 200, 700, 270);
    $("#sh-splits").innerHTML = html`<div class="sh-layout sh-sp-layout" id="sh-sp-layout">
      ${raw(panelHtml({ id: "sh-sp-lp", side: "left", cls: "sh-lp", tabs: [{ key: "runners", label: t("sh.tab.circuits"), tip: t("sh.tab.circuits.tip") }], inner: { runners: html`<div id="sh-sp-left"></div>` } }))}
      <div class="an-split" id="sh-sp-split-l" title="${t("an.split")}"></div>
      <div class="sh-sp-center" id="sh-sp-center"></div>
      <div class="an-split" id="sh-sp-split-r" title="${t("an.split")}"></div>
      ${raw(panelHtml({ id: "sh-sp-rp", side: "right", cls: "sh-rp", tabs: [{ key: "settings", label: t("sh.tab.settings"), tip: t("sh.tab.settings.tip") }], inner: { settings: html`<div id="sh-sp-right"></div>` } }))}</div>`;
    const el = $("#sh-sp-layout");
    const apply = () => {
      el.dataset.lcol = sp.lp.collapsed ? "1" : "0"; el.dataset.rcol = sp.rp.collapsed ? "1" : "0";
      el.style.setProperty("--sh-lw", `${sp.lp.collapsed ? 34 : sp.lw}px`); el.style.setProperty("--sh-rw", `${sp.rp.collapsed ? 34 : sp.rw}px`);
      spFit(); window.dispatchEvent(new Event("resize"));              // (the charts take their new width)
    };
    // the widths shared with the map's panels (its preferences)
    const save = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), lw: sp.lw, rw: sp.rw })); } catch (e) { /* not kept */ } };
    const L = bindPanel($("#sh-sp-lp"), sp.lp, { onChange: apply }), Rp = bindPanel($("#sh-sp-rp"), sp.rp, { onChange: apply });
    bindSplitter($("#sh-sp-split-l"), el, "left", (w, rect) => { sp.lw = Math.round(Math.min(rect.width - (sp.rp.collapsed ? 34 : sp.rw) - 300, Math.max(180, w))); if (sp.lp.collapsed) L.fold(false, true); apply(); }, save);
    bindSplitter($("#sh-sp-split-r"), el, "right", (w, rect) => { sp.rw = Math.round(Math.min(rect.width - (sp.lp.collapsed ? 34 : sp.lw) - 300, Math.max(200, w))); if (sp.rp.collapsed) Rp.fold(false, true); apply(); }, save);
    apply();
  }
  const drawTabs = () => {
    $("#sh-tabs").innerHTML = A.courses.length ? html`<nav class="sh-viewtabs" role="tablist">${[["map", t("sh.pane.map"), "map"], ["splits", t("sh.pane.splits"), "times"]].map(([k, l, ic]) =>
      html`<button type="button" role="tab" data-pane="${k}" aria-selected="${k === pane}" title="${l}" aria-label="${l}">${raw(iconLabel(ic, l))}</button>`)}</nav>` : "";
    $$("#sh-tabs [data-pane]").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));
  };
  async function showPane(p) {
    pane = p;
    drawTabs();
    const onMap = p === "map";
    $("#sh-viewer").hidden = !onMap; $("#sh-splits").hidden = onMap;
    document.body.classList.toggle("an-theatre", !!viewer);     // (both views fill the window, the site's menus kept)
    if (!onMap) viewer?.pause?.();                        // (pausing writes the replay's state into the address: before ours)
    const q = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
    if (onMap) delete q.vue; else q.vue = "temps";
    replaceQuery(q);
    if (onMap) {
      // the circuit chosen among the split times, on the map too
      if (splitsCourse != null && splitsCourse !== courseN) { courseN = splitsCourse; openViewer(); }
      window.dispatchEvent(new Event("resize")); return;
    }
    splitsLayout();
    spFit();
    // the times at the controls of every circuit's tracks (once per set of tracks), on the circuit the map shows
    const key = data.traces.map((x) => `${x.course}:${x.uid}:${x.updated}`).join("|");
    if (key === splitsKey && splitsView && splitsCourse === courseN) return;
    splitsKey = key; splitsCourse = courseN;
    const box = $("#sh-sp-center"), side = { left: $("#sh-sp-left"), right: $("#sh-sp-right") };
    const say = (h) => { box.innerHTML = h; side.left.innerHTML = ""; side.right.innerHTML = ""; };
    say(html`<div class="boot"><div class="spinner"></div></div>`);
    try {
      const doc = await splitsDoc({ A, id, traces: data.traces });
      if (pane !== "splits") { splitsKey = ""; return; }
      if (!doc.classes.length) { say(html`<div class="card"><div class="empty">${t("sh.pane.none")}</div></div>`); return; }
      const shownName = A.courses.find((x) => x.n === courseN)?.name;             // the circuit the map shows, first
      splitsView = await (await import("./splits.js")).renderEmbedded(box, { key: `multi:${id}`, c: Math.max(0, doc.classes.findIndex((k) => k.name === shownName)),
        race: { name: A.title, docs: [doc] }, slots: side, onClass: (name) => { const c = A.courses.find((x) => x.name === name); if (c) splitsCourse = c.n; } });
    } catch (e) { console.error(e); splitsKey = ""; say(html`<div class="card"><div class="empty">${errText(e)}</div></div>`); }
  }
  const pickCourse = (n) => { if (n !== courseN && A.courses.some((x) => x.n === n)) { courseN = n; openViewer(); } };
  const openViewer = async () => {
    viewer?.destroy();
    viewer = null;
    const fb = $("#sh-fresh"); if (fb) fb.hidden = true;     // (the traces read again: the next check says what is still new)
    const c = A.courses.find((x) => x.n === courseN);
    if (!c) {
      document.body.classList.remove("an-theatre");
      $("#sh-viewer").innerHTML = html`<div class="card"><div class="empty">${t(organiser ? "sh.noCourse.org" : "sh.notReady")}</div></div>`;
      return;
    }
    const init = initial; initial = {};                    // the address's state for the first circuit opened only
    viewer = await replay($("#sh-viewer"), { A, id, course: c, race, init, traces: data.traces.filter((x) => x.course === c.n), allTraces: data.traces, you: data.you, reload: async (n) => {
      data = await api(`/${id}`, { key: keyOf(id) });
      if (n != null && n !== courseN && A.courses.some((x) => x.n === n)) { courseN = n; drawTabs(); }     // a track sent to its own circuit
      openViewer(); }, onCourse: pickCourse });
  };
  drawTabs();
  await openViewer();
  if (pane === "splits") showPane("splits");
  // the other runners' new traces (owner, 2026-11-08): the list asked again every minute while this page is open and its browser
  // tab in front, never drawn in under the reader's eyes — a notice offers « Actualiser », which reopens the replay where it was
  const POLL_MS = 60000, sigOf = (list) => new Map(list.map((x) => [`${x.course}:${x.uid}`, x.updated || ""]));
  let polled = Date.now(), freshSig = "", dismissed = "";
  const notice = () => {
    const box = $("#sh-fresh");
    if (!box) return;
    const was = sigOf(data.traces), now = freshSig ? new Map(JSON.parse(freshSig)) : null;
    const added = now ? [...now.keys()].filter((k) => !was.has(k)).length : 0;
    box.hidden = !now || freshSig === dismissed;
    $("#sh-fresh-t").textContent = added ? tn("sh.fresh.added", added) : t("sh.fresh.changed");
  };
  const poll = async () => {
    if (!document.contains(main) || document.visibilityState !== "visible" || Date.now() - polled < POLL_MS - 1000) return;
    polled = Date.now();
    let list;
    try { list = (await api(`/${id}?poll=1`, { key: keyOf(id) })).traces || []; } catch (e) { return; }
    const was = sigOf(data.traces), now = sigOf(list);
    const same = was.size === now.size && [...now].every(([k, u]) => was.get(k) === u);
    freshSig = same ? "" : JSON.stringify([...now].sort());
    notice();
  };
  const pollTimer = setInterval(poll, 15000);
  document.addEventListener("visibilitychange", poll);
  $("#sh-fresh-x").addEventListener("click", () => { dismissed = freshSig; notice(); });
  $("#sh-fresh-go").addEventListener("click", async () => {
    viewer?.pause?.();                                     // (pausing writes the replay's state into the address)
    const q = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
    const before = new Set(data.traces.map((x) => `${x.course}:${x.uid}`));
    try { data = await api(`/${id}`, { key: keyOf(id) }); } catch (e) { alertBox(errText(e)); return; }
    // the runners shown kept, the new ones shown too
    if (q.show) q.show = [q.show, ...data.traces.filter((x) => x.course === courseN && !before.has(`${x.course}:${x.uid}`)).map((x) => x.uid)].join(",");
    freshSig = ""; polled = Date.now(); notice();
    initial = q;
    await openViewer();
    if (pane === "splits") showPane("splits");
  });
  // the first visit: the offer to add one's track (owner, 2026-11-04) — to an account allowed to add one, with none in this
  // analysis yet; once per analysis and browser, closed or not
  const you = data.you || {};
  const allowed = !you.visitor && (you.organiser || (A.opts || {}).upload !== false);
  const asked = query.ajout === "1";
  if (asked) { const q = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || "")); delete q.ajout; replaceQuery(q); }
  // a track handed over by « Analyse solo » (its suggestion of the event a track is of): taken by the offer at once
  const handed = asked ? (await takeInbox()).find((f) => isTraceName(f.name)) || null : null;
  if (allowed && A.courses.length && (asked || (!data.traces.some((x) => x.uid === you.uid) && !offered(id)))) {
    Promise.resolve().then(() => { if (document.contains(main) && !document.querySelector(".tr-modal")) offerTrack({ A, id, initial: handed, onDone: async (n) => {
      data = await api(`/${id}`, { key: keyOf(id) }); courseN = n; drawTabs(); openViewer();
    } }); });
  }
  return { title: A.title, cleanup: () => { clearInterval(pollTimer); document.removeEventListener("visibilitychange", poll); viewer?.destroy(); window.removeEventListener("resize", spFit); document.body.classList.remove("an-theatre"); leaveFull(); leaveMapOnly(); document.querySelector(".sh-offer")?.remove(); } };
}

// ---- « Temps intermédiaires »: the tracks' times at the controls as a results document (owner, 2026-11-04) ---------------
// one class per circuit, a runner per track: the passes as « Analyse multi » reads them (the first visit within 25 m after the
// previous control, the start's departure, the finish's arrival), the split times from the start, the place among those who
// passed every control and finished; the start's clock time (Paris) for « Passages », « Groupes » and « Autonomie »
const parisSec = (unix) => { const d = new Date(unix * 1000); const [h, m, s] = d.toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour12: false }).split(":").map(Number); return h * 3600 + m * 60 + s; };
async function splitsDoc({ A, id, traces }) {
  const classes = [];
  for (const c of A.courses) {
    if (c.score || !validGeo(c.geo) || !traces.some((x) => x.course === c.n)) continue;
    let recs = [];
    try { recs = await api(`/${id}/traces/${c.n}`, { key: keyOf(id) }); } catch (e) { recs = []; }
    const P = c.controls, si = P.findIndex((p) => p.kind === "start"), fi = P.findIndex((p) => p.kind === "finish");
    const mids = P.map((p, j) => j).filter((j) => P[j].kind === "control");
    const runners = [];
    for (const rec of recs) {
      const tr = decodeTrace(rec);
      if (!tr) continue;
      const passes = coursePasses(tr, fitFromGeo(c.geo, tr), P, TOL);
      const start = si >= 0 ? passes[si] ?? tr.t[0] : tr.t[0];
      const splits = mids.map((j) => (passes[j] != null ? Math.round(passes[j] - start) : null));
      const fin = fi >= 0 && passes[fi] != null ? Math.round(passes[fi] - start) : null;
      const ok = fin != null && splits.every((v) => v != null);
      // a mispunched runner keeps their finish time (no place): their legs up to the finish are still shown (owner, 2026-11-11)
      runners.push({ name: rec.name, lic: rec.lic || null, club: "", status: ok ? "ok" : fin == null ? "dnf" : "mp", time_s: fin,
        splits, start_s: parisSec(tr.ms0 / 1000 + start) });
    }
    if (!runners.length) continue;
    const okOnes = runners.filter((r) => r.status === "ok").sort((a, b) => a.time_s - b.time_s);
    okOnes.forEach((r, i) => { r.place = i && r.time_s === okOnes[i - 1].time_s ? okOnes[i - 1].place : i + 1; });
    classes.push({ name: c.name, controls: mids.map((j, i) => P[j].code || String(i + 1)), runners });
  }
  return { source: "gps", title: A.title, url: "", classes };
}

// ---- the offer to add one's track, at the first visit of an analysis (owner, 2026-11-04) -------------------------------
// the file read here, in the browser; the circuit found by the controls the track passes in the circuit's order; asked when
// two circuits fit as well or none fits well; then the usual consent, and the trace sent as « Ajouter ma trace » sends it
const OFFER_KEY = (id) => `ocn.sh.offered.${id}`;
const offered = (id) => { try { return localStorage.getItem(OFFER_KEY(id)) === "1"; } catch (e) { return false; } };
const markOffered = (id) => { try { localStorage.setItem(OFFER_KEY(id), "1"); } catch (e) { /* not kept */ } };

/** How well a track fits each circuit: [{ course, k (controls passed), n (controls), crop }], best first. A circuit is passed in
 *  its order (a score course in any order); a track that never comes on a circuit's map fits none of its controls. */
export function matchCircuits(track, courses) {
  const out = [];
  for (const c of courses) {
    const n = (c.controls || []).filter((p) => p.kind === "control").length;
    if (!n || !validGeo(c.geo)) { out.push({ course: c, k: 0, n, crop: null }); continue; }
    const crop = cropToMap(track, c.geo, c.map.w, c.map.h);
    if (!crop) { out.push({ course: c, k: 0, n, crop: null }); continue; }
    const fit = fitFromGeo(c.geo, track);
    const passes = (c.score ? scorePasses : coursePasses)(track, fit, c.controls, 25);
    const k = c.controls.reduce((s, p, j) => s + (p.kind === "control" && passes[j] != null ? 1 : 0), 0);
    out.push({ course: c, k, n, crop });
  }
  return out.sort((a, b) => b.k / (b.n || 1) - a.k / (a.n || 1) || b.n - a.n);
}
/** The circuit a track surely belongs to, or null: the only one passed at 90 % of its controls — or, several so passed (a short
 *  circuit run inside a long one), the longest passed at 95 % — or the best at 60 % with 20 points over the next. */
export function sureCircuit(fits) {
  const r = (f) => f.k / (f.n || 1);
  const high = fits.filter((f) => f.crop && r(f) >= 0.9);
  if (high.length === 1) return high[0];
  if (high.length > 1) {
    const longest = [...high].sort((a, b) => b.n - a.n);
    return r(longest[0]) >= 0.95 && longest[0].n > longest[1].n ? longest[0] : null;
  }
  const [a, b] = fits;
  return a?.crop && r(a) >= 0.6 && (!b || r(a) - r(b) >= 0.2) ? a : null;
}

/** A phone: the trace's file picker at once (owner, 2026-11-06: no window with a drop zone first; the tap that asked still counts). */
function pickTrace(onFile) {
  const i = document.createElement("input");
  i.type = "file"; i.accept = traceAccept(); i.hidden = true;
  document.body.append(i);
  i.addEventListener("change", () => { const f = i.files[0]; i.remove(); if (f) onFile(f); });
  i.addEventListener("cancel", () => i.remove());
  i.click();
}

function offerTrack({ A, id, onDone, initial = null }) {
  const m = document.createElement("div");
  m.className = "tr-modal sh-offer";
  let file = null, track = null, fits = [];
  const close = () => { markOffered(id); m.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  const first = () => {
    // a phone (owner, 2026-11-06): nothing is dropped there, a button opens its file picker (no photos for a track), and « voir
    // tous les fichiers » one with no filter, for a picker that would hide the file
    const touch = touchScreen();
    m.innerHTML = html`<div class="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-offer-t"><h2 id="sh-offer-t">${t("sh.offer.title")}</h2>
      <div class="tr-form"><p>${t(touch ? "sh.offer.body.touch" : "sh.offer.body")}</p>
        ${touch ? html`<div class="sh-pick-row"><label class="btn btn-primary"><input type="file" id="sh-offer-in" accept="${traceAccept()}" hidden>${t("sh.offer.pick")}</label>
            <label class="sh-pick-any"><input type="file" hidden>${t("sh.pick.any")}</label></div>
          <p class="hint">${t("sh.fitTip")}</p>`
        : html`<label class="dropzone an-drop sh-offer-drop"><input type="file" id="sh-offer-in" accept="${traceAccept()}" hidden>
          <strong>${t("sh.offer.drop")}</strong><span class="muted">${t("sh.fitTip")}</span></label>`}
        <p class="notice" id="sh-offer-note" hidden></p>
        <div class="tr-dlg-btns"><button type="button" class="btn" data-close>${t("sh.offer.later")}</button></div></div></div>`;
    const drop = $(".sh-offer-drop", m);
    $$("input[type=file]", m).forEach((i) => i.addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) take(f); }));
    drop?.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop?.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer?.files?.[0]; if (f) take(f); });
    $("[data-close]", m).addEventListener("click", close);
  };
  const note = (text) => { const p = $("#sh-offer-note", m); if (p) { p.textContent = text; p.hidden = !text; } };
  async function take(f) {
    note(t("sh.offer.reading", { name: f.name }));
    try { track = parseTrace(f.name, await f.arrayBuffer()); } catch (e) { note(t(e.message === "time" ? "an.err.time" : "an.err.gpx")); return; }
    if (track.source === "drawn") { note(t("sh.trace.drawn")); return; }
    fits = matchCircuits(track, A.courses);
    if (!fits.some((x) => x.crop)) { note(t("sh.trace.offMap")); return; }
    file = f;
    confirmStep(sureCircuit(fits));
  }
  function confirmStep(sure) {
    const pick = sure || fits.find((x) => x.crop);
    m.innerHTML = html`<div class="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-offer-t"><h2 id="sh-offer-t">${t("sh.offer.title")}</h2>
      <div class="tr-form"><p>${sure ? t("sh.offer.found", { course: sure.course.name, k: sure.k, n: sure.n }) : t("sh.offer.choose")}</p>
        <label class="field"><span>${t("sh.offer.course")}</span><select id="sh-offer-c">${fits.filter((x) => x.crop).map((x) => html`<option value="${x.course.n}" ${raw(x === pick ? "selected" : "")}>${t("sh.offer.opt", { course: x.course.name, k: x.k, n: x.n })}</option>`)}</select></label>
        <p class="muted" id="sh-offer-span"></p>
        <label class="an-opt"><input type="checkbox" id="sh-offer-consent"> ${t("sh.trace.consent")}</label>
        ${A.visitors ? html`<label class="an-opt"><input type="checkbox" id="sh-offer-vis"> ${t("sh.visitors.mine")}</label>` : ""}
        <p class="notice" id="sh-offer-note" hidden></p>
        <div class="tr-dlg-btns"><button type="button" class="btn" data-close>${t("sh.offer.later")}</button>
          <button type="button" class="btn btn-primary" id="sh-offer-send" disabled>${t("sh.trace.send")}</button></div></div></div>`;
    const sel = $("#sh-offer-c", m), send = $("#sh-offer-send", m);
    const fitOf = () => fits.find((x) => String(x.course.n) === sel.value);
    const span = () => {
      const x = fitOf(), enc = encodeTrace(track, x.crop[0], x.crop[1]), t1 = enc.t0 + enc.dt.reduce((s, v) => s + v, 0);
      $("#sh-offer-span", m).textContent = t("sh.trace.confirm", { a: hms(enc.t0), b: hms(t1), n: enc.dt.length });
      return enc;
    };
    span();
    sel.addEventListener("change", span);
    $("#sh-offer-consent", m).addEventListener("change", (e) => { send.disabled = !e.target.checked; });
    $("[data-close]", m).addEventListener("click", close);
    send.addEventListener("click", async () => {
      const x = fitOf();
      send.disabled = true;
      try {
        await api(`/${id}/trace/${x.course.n}`, { method: "PUT", body: { consent: true, trace: span(), note: "", visitors: !!$("#sh-offer-vis", m)?.checked }, key: keyOf(id) });
        await ownPut(ownKey(id, x.course.n), file);
        close();
        onDone(x.course.n);
      } catch (e) { note(errText(e)); send.disabled = false; }
    });
  }
  first();
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(m);
  $(".sh-offer-drop", m)?.focus();
  if (initial) take(initial);
}

/** A password's analysis, or a club's to a non-member (`club`: the server's answer — the club, its organiser, whether a code
 *  for invitees opens it; owner, 2026-11-07). */
function unlockPage(main, kind, id, club = null) {
  const clubName = (s) => String(s || "").replace(/^\s*\d{3,4}\s*-\s*/, "").trim();
  const entry = !club || club.code;
  main.innerHTML = html`<section class="card account-card" style="max-width:460px"><div class="card-body">
      <p>${club ? clubAsk(club.code, clubName(club.org), club.owner) : t("sh.locked")}</p>
      ${entry ? html`<label class="field"><span>${t(club ? "ma.code" : "sh.pw")}</span><input type="password" id="sh-unlock-pw" autocomplete="off"></label>
      <div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn btn-primary" id="sh-unlock">${t("sh.unlock")}</button><span class="muted" id="sh-unlock-note"></span></div>` : ""}</div></section>`;
  const go = async () => {
    try { const r = await api(`/${id}/unlock`, { method: "POST", body: { password: $("#sh-unlock-pw").value } }); setKey(id, r.key); eventPage(main, kind, id); }
    catch (e) { $("#sh-unlock-note").textContent = club && e.code === "invalid" ? t("ma.code.wrong") : errText(e); }
  };
  $("#sh-unlock")?.addEventListener("click", go);
  $("#sh-unlock-pw")?.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  return { title: t(kind ? `sh.${kind}.title` : "sh.org.title") };
}

// ---- the organisers' page of one analysis (owner, 2026-11-04: « this is not a page to do analyses, this is a page to manage the
// publishing and setting, and ultimately removal, of the analysis »): the circuits listed with the map of the one chosen beside
// them, to check what the runners will get; its publication and access; the runners' features switched on or off; what the
// runners did with it (counts only, never who). The replay is the runners' page (« Voir comme les coureurs »), where the
// organisers also draw the exercises and share the route choices.
const OPT_KEYS = ["upload", "solo", "mymaps", "notes", "variants", "view3d", "video", "routes"];
/** A circuit's length as the crow flies from control to control, in metres, from its georeference (null when unknown). */
function courseLength(c) {
  const g = c.geo, P = c.controls || [];
  if (c.score || P.length < 2 || !g) return null;
  const det = g.a * g.e - g.b * g.d;
  if (!det) return null;
  const ll = (p) => { const x = p.x - g.c, y = p.y - g.f; return [(g.e * x - g.b * y) / det, (-g.d * x + g.a * y) / det]; };
  let m = 0;
  for (let i = 1; i < P.length; i++) {
    const [lo1, la1] = ll(P[i - 1]), [lo2, la2] = ll(P[i]), k = Math.cos(((la1 + la2) / 2) * Math.PI / 180);
    m += Math.hypot((lo2 - lo1) * 111320 * k, (la2 - la1) * 110540);
  }
  return Number.isFinite(m) && m > 0 ? m : null;
}
/** A circuit's length as the runners know it (owner, 2026-11-08): the published class's length and climb when the race gives
 *  them, else as the crow flies from its georeference — the way course lengths are measured, so said plainly unless `crow` names
 *  the words that say so; "" when neither is known. */
function courseLenText(c, race, crow = "sh.len.km") {
  const k = race ? (race.docs || []).flatMap((d) => d.classes || []).find((x) => x.name === c.circuit && x.length_m) : null;
  if (k) return [t("sh.len.km", { km: fmt(k.length_m / 1000, 1) }), k.climb_m ? t("sh.len.climb", { m: fmt(k.climb_m) }) : ""].filter(Boolean).join(" · ");
  const m = courseLength(c);
  return m ? t(crow, { km: fmt(m / 1000, 1) }) : "";
}

// `embed` (« Orga › Gérer », 2026-11-11): drawn in an event's « Analyse » tab, under the event's own head: no way back to a list
async function managePage(main, id, data, race, embed = false) {
  const A = data.analysis, kind = A.kind;
  const runnersHref = `${kind === "race" ? "#/analyse-competition" : "#/analyse-club"}?id=${id}`;
  let sel = A.courses[0]?.n ?? null, stats = null, preview = null;
  main.innerHTML = html`
    <div class="sh-top">
      ${embed ? "" : html`<a class="btn btn-sm" href="${ORG_ROUTE}">← ${t("nav.orgAnalyses")}</a>`}
      <!-- in an event's tab, the event's chooser above names it (owner, 2026-11-12): no title, day or type again -->
      <b class="sh-title" ${raw(embed ? "hidden" : "")}>${A.title}</b><span class="muted" id="sh-m-facts" ${raw(embed ? "hidden" : "")}></span>
      <span class="tag" id="sh-m-state"></span><span class="muted sh-m-by" id="sh-m-by"></span>
      <a class="btn btn-sm" href="${runnersHref}" target="_blank" rel="opener" title="${t("sh.m.asRunner.hint")}" style="margin-left:auto">${t("sh.org.asRunner")} ↗</a></div>
    <div id="sh-editor"></div>
    <div class="sh-m" id="sh-m">
      <div class="sh-m-grid">
        <div class="sh-m-left">
          <!-- the circuits first, then their publication: the order of the work (owner, 2026-11-11) -->
          <section class="card" id="sh-m-courses"></section>
          <section class="card" id="sh-m-pub"></section>
        </div>
        <section class="card sh-m-mapcard"><div class="sh-map sh-m-map"><canvas id="sh-m-canvas"></canvas>
            <div class="an-tools"><button type="button" class="btn btn-sm" id="sh-m-zin">+</button><button type="button" class="btn btn-sm" id="sh-m-zout">−</button><button type="button" class="btn btn-sm" id="sh-m-fit" title="${t("an.fitMap")}">▭</button></div>
            <div class="empty sh-m-nomap" id="sh-m-nomap" hidden>${t("sh.m.noMap")}</div></div>
          <div class="sh-m-cap muted" id="sh-m-cap"></div></section>
      </div>
      <div class="sh-m-grid2">
        <section class="card" id="sh-m-stats"></section>
        <section class="card" id="sh-m-opts"></section>
      </div>
      <section class="card sh-m-danger"><div class="card-body row" style="gap:10px;align-items:center">
        <span class="muted">${t("sh.m.delete.hint")}</span>
        <button type="button" class="btn btn-sm" id="sh-delete" style="margin-left:auto">${t("sh.delete")}</button></div></section>
    </div>`;

  // ---- the map of the circuit chosen, its course drawn as the runners will see it
  const images = new Map();
  let shown = null;
  const mv = mapView($("#sh-m-canvas"), { onDraw: (g, view, lw) => { if (shown) drawCourse(g, shown.controls, shown.r || 20, lw, 1, 0, !shown.score); } });
  $("#sh-m-zin").addEventListener("click", () => mv.zoomBy(1.4));
  $("#sh-m-zout").addEventListener("click", () => mv.zoomBy(1 / 1.4));
  $("#sh-m-fit").addEventListener("click", () => { mv.fitAll(); mv.draw(); });
  async function showMap() {
    const c = A.courses.find((x) => x.n === sel) || null;
    shown = c;
    $("#sh-m-nomap").hidden = !!c;
    $("#sh-m-nomap").textContent = t(A.courses.length ? "sh.m.noMap" : "sh.m.courses.none");
    if (!c) { $("#sh-m-cap").textContent = ""; mv.draw(); return; }
    const ctrl = c.controls.filter((p) => p.kind === "control").length;
    $("#sh-m-cap").textContent = [c.name, c.circuit, tn("sh.m.ctrls", ctrl), courseLenText(c, race, "sh.m.len"), c.score ? t("sh.score") : ""].filter(Boolean).join(" · ");
    const token = (preview = {});
    let img = images.get(`${c.n}:${c.map?.v}`);
    if (!img) {
      try { img = await createImageBitmap(await api(`/${id}/map/${c.n}?v=${c.map?.v || 0}`, { key: keyOf(id) })); images.set(`${c.n}:${c.map?.v}`, img); }
      catch (e) { if (token === preview) { $("#sh-m-nomap").hidden = false; $("#sh-m-nomap").textContent = errText(e); } return; }
    }
    if (token !== preview) return;
    mv.setImage(img);
    // the course in view, with a margin
    const P = c.controls, r = c.r || 20;
    if (P.length) mv.fitPoints(P.map((p) => p.x), P.map((p) => p.y), 30 + r * 2);
    mv.draw();
  }

  // ---- the head: its facts and its state
  function head() {
    $(".sh-title").textContent = A.title;
    $("#sh-m-facts").textContent = [fmtDate(A.date), t(`sh.org.type.${kind}`)].filter(Boolean).join(" · ");
    // who opened it, when, from where; the administrators see the account's e-mail
    const by = $("#sh-m-by");
    by.textContent = t(A.created ? "sh.m.by" : "sh.m.by.noDate", { name: A.ownerName || t("sh.by.gone"), date: A.created ? fmtDate(A.created.slice(0, 10)) : "" })
      + (A.via ? ` (${t(`sh.via.${A.via}`)})` : "") + (data.ownerEmail ? ` · ${data.ownerEmail}` : "");
    const st = $("#sh-m-state");
    st.textContent = t(A.draft ? "sh.m.state.draft" : "sh.m.state.live");
    st.className = `tag ${A.draft ? "sh-m-draft" : "sh-m-live"}`;
  }

  // ---- publication and access
  function pubCard() {
    const box = $("#sh-m-pub"), ready = A.courses.length > 0;
    box.innerHTML = html`<div class="card-body">
      <h2 class="sh-m-h">${t("sh.m.pub")}</h2>
      <div class="sh-m-status ${A.draft ? "draft" : "live"}">
        <p>${t(A.draft ? (ready ? "sh.m.draft.ready" : "sh.m.draft.empty") : `sh.m.live.${A.vis === "club" && A.code ? "clubCode" : A.vis}`, { where: t("sh.m.where") })}</p>
        ${A.draft ? html`<button type="button" class="btn btn-primary" id="sh-m-publish" ${raw(ready ? "" : "disabled")}>${t("sh.m.publish")}</button>`
          : html`<button type="button" class="btn btn-sm" id="sh-m-unpublish">${t("sh.m.unpublish")}</button>`}</div>
      <!-- three rows (owner, 2026-11-07): the title and the date, the club shown under them, the access and what it adds -->
      <div class="filters sh-m-fields">
        <div class="sh-s-row sh-s-titlerow"><label class="field sh-s-titlef"><span>${t("sh.col.title")}</span><input type="text" id="sh-s-title" value="${A.title}" maxlength="120"></label>
        <label class="field"><span>${t("f.date")}</span><input type="date" id="sh-s-date" value="${A.date}"></label></div>
        <div class="sh-s-row"><label class="field sh-s-orgf" title="${t("sh.s.org.tip")}"><span>${t("sh.s.org")}</span><input type="text" id="sh-s-org" value="${A.orgName || ""}" maxlength="80" placeholder="${t("sh.s.org.ph")}"></label></div>
        <div class="sh-s-row sh-s-accrow"><div class="field sh-s-access"><span>${t("sh.col.access")}</span><select id="sh-s-vis" aria-label="${t("sh.col.access")}">${["public", "club", "password"].map((v) => html`<option value="${v}" ${raw(v === A.vis ? "selected" : "")}>${t(`sh.vis.${v}.long`)}</option>`)}</select>
          <!-- what the access chosen may add, just below it (owner, 2026-11-07): the club's code for its invitees on one line -->
          <div class="sh-s-sub sh-s-code" ${raw(A.vis === "club" ? "" : "hidden")}><label class="an-opt" title="${t("sh.code.tip")}"><input type="checkbox" id="sh-s-code" ${raw(A.vis === "club" && A.code ? "checked" : "")}> ${t("sh.code")}</label>
            <input type="text" id="sh-s-codev" style="width:160px" autocomplete="off" aria-label="${t("ma.code")}" placeholder="${A.code ? t("sh.pw.keep") : t("sh.pw.ph")}"></div>
          <div class="sh-s-sub sh-s-visitors" ${raw(A.vis === "public" ? "" : "hidden")}><label class="an-opt" title="${t("sh.visitors.hint")}"><input type="checkbox" id="sh-s-visitors" ${raw(A.visitors && A.vis === "public" ? "checked" : "")}> ${t("sh.visitors")}</label></div></div>
        <label class="field" id="sh-s-pwf" ${raw(A.vis === "password" ? "" : "hidden")}><span>${t("sh.pw.new")}</span><input type="text" id="sh-s-pw" style="width:160px" autocomplete="off" placeholder="${A.vis === "password" ? t("sh.pw.keep") : ""}"></label></div></div>
      <div class="row sh-s-saverow"><button type="button" class="btn btn-sm" id="sh-s-save">${t("sh.save")}</button><span class="muted" id="sh-s-note"></span></div></div>`;
    // the card is drawn again with what the server kept, then « Enregistré » said in it (owner, 2026-11-11: it was written before
    // the card was drawn again, and so never seen)
    const put = async (body, note) => {
      const btn = note ? $("#sh-s-save") : null;
      if (btn) { btn.disabled = true; $(note).textContent = t("sh.saving"); $(note).classList.remove("sh-saved"); }
      try {
        const r = await api(`/${id}`, { method: "PUT", body, key: keyOf(id) });
        Object.assign(A, r.analysis); head(); pubCard(); optsCard(); statsCard();
        if (note) { const el = $(note); el.textContent = `✓ ${t("sh.saved")}`; el.classList.add("sh-saved"); }
      } catch (e) {
        if (btn) btn.disabled = false;
        const el = note ? $(note) : null; if (el) el.textContent = errText(e); else alertBox(errText(e));
      }
    };
    $("#sh-m-publish")?.addEventListener("click", () => put({ draft: false }));
    $("#sh-m-unpublish")?.addEventListener("click", async () => { if (await confirmBox(t("sh.m.unpublish.confirm"), { ok: t("sh.m.unpublish") })) put({ draft: true }); });
    $("#sh-s-save").addEventListener("click", () => {
      const body = { title: $("#sh-s-title").value, date: $("#sh-s-date").value, vis: $("#sh-s-vis").value, visitors: $("#sh-s-vis").value === "public" && $("#sh-s-visitors").checked };
      const org = $("#sh-s-org").value.trim();
      if (org !== (A.orgName || "")) body.orgName = org;                                // the club shown, changed or cleared
      if (body.vis === "password" && $("#sh-s-pw").value) body.password = $("#sh-s-pw").value;
      // the club's code for its invitees: a new one typed, else the one set kept
      if (body.vis === "club") {
        body.code = $("#sh-s-code").checked;
        if (body.code && $("#sh-s-codev").value) body.password = $("#sh-s-codev").value;
        if (body.code && ((!A.code && !body.password) || (body.password && body.password.length < 2))) { $("#sh-s-note").textContent = t("ma.code.short"); return; }
      }
      put(body, "#sh-s-note");
    });
    dateWords($("#sh-s-date"));
    $("#sh-s-vis").addEventListener("change", (e) => {
      const v = e.target.value;
      $(".sh-s-visitors").hidden = v !== "public"; if (v !== "public") $("#sh-s-visitors").checked = false;
      $("#sh-s-pwf").hidden = v !== "password";
      $(".sh-s-code").hidden = v !== "club";
    });
    // a code typed ticks its box
    $("#sh-s-codev").addEventListener("input", (e) => { if (e.target.value) $("#sh-s-code").checked = true; });
  }

  // ---- the circuits: a row chosen shows its map; one drop zone for every way in (owner, 2026-11-04): an OCAD course-setting
  // project gives every circuit at once, a map (with its georeference, course file or one's trace) one circuit in the editor,
  // which takes the page's width while it is open
  const editing = (on) => { $("#sh-m").hidden = on; if (!on) $("#sh-editor").innerHTML = ""; };
  const ctx = { A, id, kind, race, onChange: () => reload(), done: () => editing(false), ocad: (list) => take(list) };

  // ---- an OCAD course-setting project, read in place (owner, 2026-11-11: « this should all happen in one page »): the files
  // dropped on the circuits card, the courses they hold listed there, each shown on the map card as it will be published — the
  // first at once, so a missing background map shows before anything is sent —, then added with one button. Nothing is sent
  // before « Ajouter ». The state lives here, so the card can be drawn again (the counts arriving) without losing a tick.
  const isVec = (f) => /\.(ocd|omap|xmap)$/i.test(f.name);
  const nm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const raceCircuits = race ? [...new Set((race.docs || []).filter((d) => d.by !== "category").flatMap((d) => (d.classes || []).map((k) => k.name)))] : [];
  const imp = { got: [], read: null, err: "", busy: false, note: "", frac: null, on: new Map(), circ: new Map(), renders: new Map(), prev: null, consent: false, keep: true, token: null };
  const clearImp = () => { Object.assign(imp, { got: [], read: null, err: "", busy: false, note: "", frac: null, prev: null, token: null }); imp.on.clear(); imp.circ.clear(); imp.renders.clear(); };
  const picked = () => (imp.read ? imp.read.designs.map((d, i) => ({ d, i })).filter(({ i }) => imp.on.get(i)) : []);
  async function take(list) {
    list = [...(list || [])].filter(isVec);
    if (!list.length || imp.busy) return;
    imp.got = [...imp.got.filter((g) => !list.some((f) => f.name === g.name)), ...list];   // a file of the same name replaces it
    const token = (imp.token = {});
    Object.assign(imp, { read: null, err: "", note: "", prev: null }); imp.on.clear(); imp.circ.clear(); imp.renders.clear();
    coursesCard();
    const f = imp.got.map((x) => x.name).join(", ");
    try {
      const C = await import("../tracer/circuits.js");
      const r = await C.readCourseFiles(imp.got);
      for (const d of r.designs) d.nCtrl = C.controlCount(r.E.ev, d);
      if (token !== imp.token) return;
      imp.read = { ...r, C };
      // ticked: those replacing a circuit of the same name, then the others while the analysis's 12 have room
      const taken = new Set(A.courses.map((c) => nm(c.name)));
      let room = 12 - A.courses.length;
      r.designs.forEach((d, i) => {
        imp.on.set(i, taken.has(nm(d.name)) || room-- > 0);
        const k = raceCircuits.find((c) => nm(c) === nm(d.name) || nm(c).split(" ")[0] === nm(d.name).split(" ")[0]);
        if (k) imp.circ.set(i, k);
      });
    } catch (e) {
      if (token !== imp.token) return;
      const code = e.code === "needMap" && !e.name ? "needMapAny" : e.code;
      imp.err = ["unreadable", "noCourses", "noGeo", "needMap", "needMapAny"].includes(code) ? t(`sh.ocad.err.${code}`, { f, map: e.name || "?" }) : `${f} — ${e.message || e}`;
    }
    coursesCard();
    if (imp.read?.designs.length) showPending(0);
  }
  /** A course of the project drawn on the map card as it will be published (rendered once, kept for « Ajouter »). */
  async function renderOf(i) {
    let r = imp.renders.get(i);
    if (!r) {
      r = await imp.read.C.circuitOf(imp.read.E, imp.read.designs[i], 150);
      r.img = await createImageBitmap(r.blob);
      r.blank = nearlyBlank(r.img);
      imp.renders.set(i, r);
    }
    return r;
  }
  async function showPending(i) {
    if (!imp.read) return;
    imp.prev = i;
    const d = imp.read.designs[i], box = $("#sh-m-courses");
    $$("tr[data-n]", box).forEach((row) => row.classList.remove("sel"));
    $$("tr[data-i]", box).forEach((row) => row.classList.toggle("sel", Number(row.dataset.i) === i));
    const token = (preview = {}), read = imp.read;
    shown = null;                                                         // the course is printed on the image itself
    $("#sh-m-cap").textContent = t("sh.imp.preview", { name: d.name, n: d.nCtrl });
    $("#sh-m-nomap").hidden = false; $("#sh-m-nomap").textContent = t("sh.imp.rendering");
    let r;
    try { r = await renderOf(i); } catch (e) { if (token === preview) $("#sh-m-nomap").textContent = errText(e); return; }
    if (token !== preview || read !== imp.read) return;
    $("#sh-m-nomap").hidden = true;
    mv.setImage(r.img);
    if (r.controls.length) mv.fitPoints(r.controls.map((p) => p.x), r.controls.map((p) => p.y), 30 + r.r * 2);
    mv.draw();
    // a white sheet with the overprint alone: said before anything is sent, and nothing can be added
    if (r.blank && !imp.err) { imp.err = t("sh.ocad.err.blank"); coursesCard(); }
  }
  async function addImport() {
    const note = (s, frac = null) => { imp.note = s; imp.frac = frac; const el = $("#sh-imp-note"); if (el) el.textContent = s; const b = $("#sh-imp-bar"); if (b) { b.hidden = frac == null; setBar(b.querySelector("progress"), frac); } };
    const pick = picked();
    if (!pick.length) return note(t("sh.ocad.none"));
    if (!imp.consent) return note(t("sh.e.consentNeeded"));
    const byName = new Map(A.courses.map((c) => [nm(c.name), c]));
    if (A.courses.length + pick.filter(({ d }) => !byName.has(nm(d.name))).length > 12) return note(t("sh.ocad.max"));
    imp.busy = true; coursesCard();
    const read = imp.read;
    try {
      let next = Math.max(-1, ...A.courses.map((c) => c.n)) + 1;
      const out = [];
      for (let j = 0; j < pick.length; j++) {
        const { d, i } = pick[j];
        note(t("sh.ocad.busy", { i: j + 1, n: pick.length, name: d.name }), j / pick.length);
        const old = byName.get(nm(d.name)), n = old ? old.n : next++;
        const c = await renderOf(i);
        if (c.blank) throw Object.assign(new Error(t("sh.ocad.err.blank")), { shown: true });
        if (c.blob.size > MAX_MAP) throw Object.assign(new Error(t("sh.e.tooBig", { mb: Math.round(MAX_MAP / 1048576) })), { shown: true });
        await api(`/${id}/map/${n}`, { method: "PUT", body: c.blob, type: "image/png", key: keyOf(id) });
        // the route choices' layers from the OCAD map's symbols (owner, 2026-11-05: exact, where the image's colours only suggest)
        const mvv = Date.now();
        let layers = null;
        try {
          note(t("sh.ocad.layers", { i: j + 1, n: pick.length, name: d.name }), (j + 0.5) / pick.length);
          const lb = await read.C.circuitLayers(read.E, d, c);
          if (lb) { await api(`/${id}/layers/${n}`, { method: "PUT", body: lb, key: keyOf(id) }); layers = { map: mvv, src: read.E.map.format }; }
        } catch (e) { console.warn(e); }                    // the routes then read the image's colours
        out.push({ n, name: d.name.slice(0, 60), circuit: imp.circ.get(i) || old?.circuit || "", r: c.r,
          map: { w: c.w, h: c.h, type: "image/png", v: mvv }, geo: c.geo, controls: c.controls, printed: true, ...(layers ? { layers } : {}),
          ...(old?.variants ? { variants: old.variants } : {}), ...(old?.exercises ? { exercises: old.exercises } : {}),
          ...(read.E.ev.courses[d.id]?.kind === "score" ? { score: true } : {}) });
      }
      const courses = [...A.courses.filter((c) => !out.some((o) => o.n === c.n)), ...out].sort((a, b) => a.n - b.n);
      await api(`/${id}`, { method: "PUT", body: { courses }, key: keyOf(id) });
      // the files themselves, for the event's course setting (owner, 2026-11-12: no second upload); the organisers' alone.
      // The circuits are in: a failure here is said, not undone
      if (imp.keep) {
        const used = [...new Set([read.info.courses, read.info.map])].map((n) => imp.got.find((g) => g.name === n)).filter((g) => g && /\.(ocd|omap|xmap)$/i.test(g.name));
        try {
          note(t("sh.imp.keeping"), 0.98);
          await api(`/${id}/source`, { method: "DELETE", key: keyOf(id) });
          for (let k = 0; k < used.length; k++) await api(`/${id}/source/${k}?name=${encodeURIComponent(used[k].name)}`, { method: "PUT", body: used[k], type: "application/octet-stream", key: keyOf(id) });
        } catch (e) { console.warn(e); await alertBox(t("sh.imp.keepFailed", { err: errText(e) })); }
      }
      clearImp();
      sel = out[0]?.n ?? sel;
      reload();
    } catch (e) {
      imp.busy = false; imp.note = e.shown ? e.message : errText(e); imp.frac = null;
      coursesCard();
    }
  }
  function impHtml() {
    if (!imp.got.length) return "";
    const files = imp.got.map((f) => f.name).join(", ");
    if (!imp.read) {
      return html`<div class="sh-imp">${imp.err ? html`<p class="sh-imp-err">${imp.err}</p>` : html`<p class="muted">${t("sh.ocad.reading", { f: files })}</p>`}
        <div class="row sh-imp-go"><button type="button" class="btn btn-sm" id="sh-imp-cancel">${t("sh.cancel")}</button></div></div>`;
    }
    const { designs, info } = imp.read, taken = new Set(A.courses.map((c) => nm(c.name))), n = picked().length, dis = imp.busy ? "disabled" : "";
    return html`<div class="sh-imp">
      <div class="sh-imp-h"><b>${tn("sh.imp.found", designs.length)}</b>
        <span class="muted">${t("sh.ocad.info", { f: info.courses, map: info.map, format: info.format === "oom" ? "OpenOrienteering Mapper" : `OCAD ${info.version}`, scale: fmt(info.scale), n: designs.length, geo: info.geo || "—" })}</span></div>
      <div class="table-wrap"><table class="data compact sh-m-table sh-imp-table"><thead><tr><th></th><th>${t("sh.ocad.col.course")}</th><th class="r">${t("sh.m.col.ctrls")}</th>
          ${raceCircuits.length ? html`<th>${t("sh.course.circuit")}</th>` : ""}</tr></thead>
        <tbody>${designs.map((d, i) => html`<tr data-i="${i}" tabindex="0" class="${imp.prev === i ? "sel" : ""}">
          <td><input type="checkbox" data-o="${i}" aria-label="${d.name}" ${raw(imp.on.get(i) ? "checked" : "")} ${raw(dis)}></td>
          <td><b>${d.name}</b>${taken.has(nm(d.name)) ? html` <span class="tag" title="${t("sh.ocad.replaces")}">${t("sh.imp.replaces")}</span>` : ""}</td>
          <td class="r num">${d.nCtrl}</td>
          ${raceCircuits.length ? html`<td><select data-k="${i}" ${raw(dis)}><option value="">—</option>${raceCircuits.map((c) => html`<option ${raw(imp.circ.get(i) === c ? "selected" : "")}>${c}</option>`)}</select></td>` : ""}</tr>`)}</tbody></table></div>
      ${imp.err ? html`<p class="sh-imp-err">${imp.err}</p>` : html`<p class="hint">${t("sh.imp.hint")}</p>`}
      <label class="an-opt"><input type="checkbox" id="sh-imp-ok" ${raw(imp.consent ? "checked" : "")} ${raw(dis)}> ${t("sh.e.consent")}</label>
      <label class="an-opt" title="${t("sh.imp.keep.tip")}"><input type="checkbox" id="sh-imp-keep" ${raw(imp.keep ? "checked" : "")} ${raw(dis)}> ${t("sh.imp.keep")}</label>
      <div class="row sh-imp-go"><button type="button" class="btn btn-primary" id="sh-imp-add" ${raw(imp.busy || imp.err || !n ? "disabled" : "")}>${n ? tn("sh.imp.add", n) : t("sh.ocad.none")}</button>
        <button type="button" class="btn btn-sm" id="sh-imp-cancel" ${raw(dis)}>${t("sh.cancel")}</button><span class="muted" id="sh-imp-note">${imp.note}</span></div>
      <div id="sh-imp-bar" ${raw(imp.frac == null ? "hidden" : "")}>${raw(bar(imp.frac))}</div></div>`;
  }
  function bindImp(box) {
    $("#sh-imp-cancel", box)?.addEventListener("click", () => { clearImp(); coursesCard(); showMap(); });
    $("#sh-imp-add", box)?.addEventListener("click", addImport);
    $("#sh-imp-keep", box)?.addEventListener("change", (e) => { imp.keep = e.target.checked; });
    $("#sh-imp-ok", box)?.addEventListener("change", (e) => { imp.consent = e.target.checked; if (imp.consent && imp.note === t("sh.e.consentNeeded")) { imp.note = ""; $("#sh-imp-note").textContent = ""; } });
    $$("[data-o]", box).forEach((cb) => cb.addEventListener("change", () => {
      imp.on.set(Number(cb.dataset.o), cb.checked);
      const n = picked().length, b = $("#sh-imp-add");
      if (b) { b.textContent = n ? tn("sh.imp.add", n) : t("sh.ocad.none"); b.disabled = imp.busy || !!imp.err || !n; }
    }));
    $$("[data-k]", box).forEach((s) => s.addEventListener("change", () => imp.circ.set(Number(s.dataset.k), s.value)));
    $$("tr[data-i]", box).forEach((row) => {
      const go = (e) => { if (!e.target.closest("input, select, button")) showPending(Number(row.dataset.i)); };
      row.addEventListener("click", go);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") go(e); });
    });
  }

  function coursesCard() {
    const box = $("#sh-m-courses"), per = new Map((stats?.courses || []).map((c) => [c.n, c]));
    box.innerHTML = html`<div class="card-body">
      <h2 class="sh-m-h">${t("sh.courses")}</h2>
      ${A.courses.length ? html`<div class="table-wrap"><table class="data compact sh-m-table"><thead><tr><th>${t("sh.m.col.course")}</th><th class="r">${t("sh.m.col.ctrls")}</th><th class="r">${t("sh.m.col.len")}</th>
          <th class="r" title="${t("sh.m.col.traces.tip")}">${t("sh.m.col.traces")}</th><th class="r" title="${t("sh.m.col.solo.tip")}">${t("sh.m.col.solo")}</th><th></th></tr></thead>
        <tbody>${A.courses.map((c) => { const s = per.get(c.n), len = courseLength(c); return html`<tr data-n="${c.n}" tabindex="0" class="${c.n === sel && imp.prev == null ? "sel" : ""}">
          <td><b>${c.name}</b>${c.circuit ? html` <span class="muted">· ${c.circuit}</span>` : ""}${c.score ? html` <span class="tag">${t("sh.score")}</span>` : ""}</td>
          <td class="r num">${c.controls.filter((p) => p.kind === "control").length}</td>
          <td class="r num">${len ? fmt(len / 1000, 1) : "—"}</td>
          <td class="r num">${s ? html`${s.traces}${s.tests ? html` <span class="muted">${tn("sh.m.plusTests", s.tests)}</span>` : ""}` : "…"}</td><td class="r num">${s ? s.solo : "…"}</td>
          <td class="r sh-m-act"><button type="button" class="btn btn-sm" data-edit="${c.n}">${t("sh.edit")}</button> <button type="button" class="btn btn-sm" data-del="${c.n}">${t("sh.remove")}</button></td></tr>`; })}</tbody></table></div>
        ${imp.got.length ? "" : html`<p class="hint">${t("sh.m.courses.hint")}</p>`}` : imp.got.length ? "" : html`<p class="muted">${t("sh.m.courses.none")}</p>`}
      ${raw(impHtml())}
      <label class="dropzone an-drop" id="sh-drop" style="margin-top:10px" ${raw(imp.busy ? "hidden" : "")}><input type="file" id="sh-drop-in" multiple hidden accept=".ocd,.omap,.xmap,.png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.kmz,.kml,.jgw,.pgw,.tfw,.gfw,.wld,.prj,.xml,.gpx,.tcx,.fit,image/*,application/pdf">
        <strong>${t(imp.got.length ? "sh.drop.imp" : A.courses.length ? "sh.drop.more" : "sh.drop")}</strong><span class="muted">${t(imp.got.length ? "sh.drop.imp.hint" : "sh.drop.hint")}</span></label></div>`;
    bindImp(box);
    const pick = (n) => {
      sel = n; imp.prev = null;
      $$("tr[data-i]", box).forEach((r) => r.classList.remove("sel"));
      $$("tr[data-n]", box).forEach((r) => r.classList.toggle("sel", Number(r.dataset.n) === n)); showMap();
    };
    $$("tr[data-n]", box).forEach((r) => {
      r.addEventListener("click", (e) => { if (!e.target.closest("button")) pick(Number(r.dataset.n)); });
      r.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.target.closest("button")) pick(Number(r.dataset.n)); });
    });
    $$("[data-del]", box).forEach((b) => b.addEventListener("click", async () => {
      const n = Number(b.dataset.del), s = per.get(n);
      if (!(await confirmBox(s?.traces ? tn("sh.m.remove.traces", s.traces) : t("sh.course.remove.confirm"), { ok: t("sh.remove") }))) return;
      try { await api(`/${id}`, { method: "PUT", body: { courses: A.courses.filter((c) => c.n !== n) }, key: keyOf(id) }); reload(); }
      catch (e) { alertBox(errText(e)); }
    }));
    const zone = $("#sh-drop", box);
    const open = (list) => {
      list = [...(list || [])];
      if (!list.length) return;
      // an OCAD or Mapper project is read here, in the card; a map image goes to the circuit editor (its controls placed by hand)
      if (list.some(isVec)) return take(list);
      editing(true);
      editor($("#sh-editor"), { ...ctx, course: null, files: list });
    };
    $("#sh-drop-in").addEventListener("change", (e) => { open(e.target.files); e.target.value = ""; });
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("over"); open(e.dataTransfer.files); });
    $$("[data-edit]", box).forEach((b) => b.addEventListener("click", () => {
      editing(true);
      editor($("#sh-editor"), { ...ctx, course: A.courses.find((c) => c.n === Number(b.dataset.edit)) });
    }));
  }

  // ---- the runners' features, each switched on or off at once (the server keeps them: api/analyses OPTS)
  function optsCard() {
    const box = $("#sh-m-opts"), o = A.opts || {};
    const keys = OPT_KEYS;
    box.innerHTML = html`<div class="card-body">
      <h2 class="sh-m-h">${t("sh.m.opts")}</h2><p class="muted sh-m-sub">${t("sh.m.opts.lede")}</p>
      <ul class="sh-m-opts">${keys.map((k) => html`<li><label class="sh-m-opt"><input type="checkbox" data-opt="${k}" ${raw(o[k] ? "checked" : "")}>
        <span><b>${t(`sh.opt.${k}`)}</b><span class="muted">${t(`sh.opt.${k}.hint`)}</span></span></label></li>`)}</ul>
      <p class="muted" id="sh-m-opts-note"></p></div>`;
    $$("[data-opt]", box).forEach((cb) => cb.addEventListener("change", async () => {
      const note = $("#sh-m-opts-note");
      note.textContent = t("sh.saving");
      try { const r = await api(`/${id}`, { method: "PUT", body: { opts: { [cb.dataset.opt]: cb.checked } }, key: keyOf(id) }); Object.assign(A, r.analysis); note.textContent = t("sh.saved"); }
      catch (e) { cb.checked = !cb.checked; note.textContent = errText(e); }
    }));
  }

  // ---- what the runners did with it: counts only
  function statsCard() {
    const box = $("#sh-m-stats");
    if (!stats) { box.innerHTML = html`<div class="card-body"><h2 class="sh-m-h">${t("sh.m.stats")}</h2><p class="muted">${t("misc.loading")}</p></div>`; return; }
    // an administrator's test traces (« Traces de test ») are counted apart: they are no runner's (owner, 2026-11-04: « I still see 0
    // traces »)
    const S = stats, tests = S.courses.reduce((s, c) => s + c.tests, 0);
    const tile = (label, value, sub = "") => html`<div class="tile"><div class="tile-label">${label}</div><div class="tile-value num">${value}</div>${sub ? html`<div class="tile-sub">${sub}</div>` : ""}</div>`;
    const day = (iso) => (iso ? fmtDate(String(iso).slice(0, 10), "short") : "—");
    box.innerHTML = html`<div class="card-body">
      <h2 class="sh-m-h">${t("sh.m.stats")}</h2>
      <div class="tiles tiles-compact sh-m-tiles">
        ${tile(t("sh.m.s.viewers"), S.viewers, S.viewers ? t("sh.m.s.viewers.sub", { n: S.recent, last: day(S.lastView) }) : "")}
        ${tile(t("sh.m.s.runners"), S.runners, [S.viewers ? t("sh.m.s.runners.sub", { p: Math.round((100 * S.runners) / Math.max(S.viewers, S.runners)) }) : S.lastTrace ? t("sh.m.s.last", { d: day(S.lastTrace) }) : "", tests ? tn("sh.m.s.tests", tests) : ""].filter(Boolean).join(" · "))}
        ${tile(t("sh.m.s.solo"), S.soloOnly, t("sh.m.s.solo.sub", { n: S.solo }))}
        ${A.visitors ? tile(t("sh.m.s.guests"), S.guests) : ""}</div>
      ${S.courses.length ? html`<div class="table-wrap" style="margin-top:10px"><table class="data compact"><thead><tr><th>${t("sh.m.col.course")}</th>
          <th class="r" title="${t("sh.m.col.traces.tip")}">${t("sh.m.col.traces")}</th><th class="r">${t("sh.m.col.notes")}</th>${A.visitors ? html`<th class="r" title="${t("sh.m.col.vis.tip")}">${t("sh.m.col.vis")}</th>` : ""}
          <th class="r" title="${t("sh.m.col.solo.tip")}">${t("sh.m.col.solo")}</th><th class="r" title="${t("sh.m.col.soloOnly.tip")}">${t("sh.m.col.soloOnly")}</th><th class="r">${t("sh.m.col.last")}</th>${tests ? html`<th class="r" title="${t("sh.m.col.tests.tip")}">${t("sh.m.col.tests")}</th>` : ""}</tr></thead>
        <tbody>${S.courses.map((c) => html`<tr><td>${c.name}</td><td class="r num">${c.traces}</td><td class="r num">${c.notes}</td>${A.visitors ? html`<td class="r num">${c.visitors}</td>` : ""}
          <td class="r num">${c.solo}</td><td class="r num">${c.soloOnly}</td><td class="r num">${day(c.last)}</td>${tests ? html`<td class="r num">${c.tests}</td>` : ""}</tr>`)}</tbody></table></div>` : ""}
      <p class="hint">${t("sh.m.stats.note")}</p></div>`;
  }
  async function loadStats() {
    try { stats = await api(`/${id}/stats`, { key: keyOf(id) }); } catch (e) { stats = null; $("#sh-m-stats").innerHTML = html`<div class="card-body"><h2 class="sh-m-h">${t("sh.m.stats")}</h2><p class="muted">${errText(e)}</p></div>`; return; }
    statsCard(); coursesCard();
  }

  async function reload() {
    try { data = await api(`/${id}`, { key: keyOf(id) }); } catch (e) { alertBox(errText(e)); return; }
    Object.assign(A, data.analysis);
    if (!A.courses.some((c) => c.n === sel)) sel = A.courses[A.courses.length - 1]?.n ?? null;
    editing(false); head(); pubCard(); coursesCard(); optsCard(); statsCard(); showMap(); loadStats(); thumbsDue();
  }
  // « Analyse de carte » shows each event's first circuit as a thumbnail (owner, 2026-11-04): the server cannot draw one, so the
  // organisers' page makes those missing — a circuit new or whose map or controls changed (the server dropped its thumbnail)
  let thumbing = false;
  async function thumbsDue() {
    if (thumbing || !Array.isArray(data.thumbs)) return;
    thumbing = true;
    try {
      for (const c of A.courses) {
        if (data.thumbs.includes(c.n)) continue;
        try {
          let img = images.get(`${c.n}:${c.map?.v}`);
          if (!img) { img = await createImageBitmap(await api(`/${id}/map/${c.n}?v=${c.map?.v || 0}`, { key: keyOf(id) })); images.set(`${c.n}:${c.map?.v}`, img); }
          const blob = await courseThumb(img, c);
          if (blob) { await api(`/${id}/thumb/${c.n}`, { method: "PUT", body: blob, type: blob.type, key: keyOf(id) }); data.thumbs.push(c.n); }
        } catch (e) { console.warn("thumbnail", c.n, e); }
      }
    } finally { thumbing = false; }
  }
  $("#sh-delete").addEventListener("click", async () => {
    if (!(await confirmBox(t("sh.delete.confirm"), { ok: t("sh.delete") }))) return;
    try { await api(`/${id}`, { method: "DELETE", key: keyOf(id) }); location.hash = ORG_ROUTE; } catch (e) { alertBox(errText(e)); }
  });
  head(); pubCard(); coursesCard(); optsCard(); statsCard(); showMap(); loadStats(); thumbsDue();
  return { title: A.title, cleanup: () => mv.destroy() };
}

/** A circuit: its map, its georeference, its controls in order. */
async function editor(box, ctx) {
  const { A, id, race, course, onChange } = ctx;
  const circuits = race ? [...new Set((race.docs || []).filter((d) => d.by !== "category").flatMap((d) => (d.classes || []).map((k) => k.name)))] : [];
  const st = { name: course?.name || "", circuit: course?.circuit || "", image: null, mapFile: null, mapType: course?.map?.type || "image/jpeg",
    detect: null, geo: course?.geo || null, geoHow: course ? t("sh.geo.kept") : "", controls: course?.controls?.map((p) => ({ ...p })) || [], r: course?.r || 20,
    track: null, files: {}, iof: null, clicking: false, notes: [] };
  box.innerHTML = html`<div class="sh-editor">
    <h2 style="font-size:16px;margin:14px 0 8px">${course ? t("sh.course.edit", { c: course.name }) : t("sh.course.add")}</h2>
    <div class="filters" style="align-items:flex-end">
      <label class="field"><span>${t("sh.course.name")}</span><input id="sh-e-name" value="${st.name}" style="width:200px" maxlength="60"></label>
      ${circuits.length ? html`<label class="field"><span>${t("sh.course.circuit")}</span><select id="sh-e-circuit"><option value="">—</option>${circuits.map((c) => html`<option ${raw(c === st.circuit ? "selected" : "")}>${c}</option>`)}</select></label>` : ""}
      <label class="an-opt" title="${t("sh.score.hint")}"><input type="checkbox" id="sh-e-score" ${raw(course?.score ? "checked" : "")}> ${t("sh.score")}</label></div>
    <label class="dropzone an-drop" id="sh-e-drop"><input type="file" id="sh-e-in" multiple hidden accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.kmz,.kml,.jgw,.pgw,.tfw,.gfw,.wld,.prj,.xml,.gpx,.tcx,.fit,.ocd,.omap,.xmap,image/*,application/pdf">
      <strong>${t("sh.e.drop")}</strong><span class="muted">${t("sh.e.drop.hint")}</span></label>
    ${phone.offered() ? html`<div class="an-cam-row">${phone.button("sh-e-phone")}<span class="muted">${t("ph.hint.any")}</span></div>` : ""}
    <div class="muted" id="sh-e-files" style="font-size:13px;margin:6px 0"></div>
    <div class="sh-e-work"><div class="sh-map sh-e-map"><canvas id="sh-e-canvas"></canvas>
        <div class="an-tools"><button type="button" class="btn btn-sm" id="sh-e-zin">+</button><button type="button" class="btn btn-sm" id="sh-e-zout">−</button><button type="button" class="btn btn-sm" id="sh-e-fit">▭</button></div></div>
      <aside class="sh-panel" id="sh-e-side"></aside></div>
    <label class="an-opt" style="margin-top:8px"><input type="checkbox" id="sh-e-consent"> ${t("sh.e.consent")}</label>
    <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="btn btn-primary" id="sh-e-save">${t("sh.course.save")}</button>
      <button type="button" class="btn btn-sm" id="sh-e-cancel">${t("sh.cancel")}</button><span class="muted" id="sh-e-note"></span></div></div>`;
  const mv = mapView($("#sh-e-canvas"), {
    onDraw: (g, view, lw) => {
      if (st.track && validGeo(st.geo)) {
        const f = fitFromGeo(st.geo, st.track);
        g.strokeStyle = "#c8102e"; g.globalAlpha = 0.8; g.lineWidth = lw(2.5); g.beginPath();
        for (let i = 0; i < st.track.n; i += 1) { const [x, y] = toPx(f, st.track.x[i], st.track.y[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke(); g.globalAlpha = 1;
      }
      if (st.detect && !st.controls.length) { g.strokeStyle = "rgba(166,38,164,0.5)"; g.lineWidth = lw(1.5); for (const c of st.detect.controls) { g.beginPath(); g.arc(c.x, c.y, c.r * 1.15, 0, 2 * Math.PI); g.stroke(); } }
      drawCourse(g, st.controls, st.r, lw, 1);
    },
    onClick: (x, y) => {
      if (!st.clicking) return;
      // a click snaps to a circle read on the map
      const all = st.detect ? [...st.detect.controls, ...(st.detect.start ? [st.detect.start] : []), ...(st.detect.finish ? [st.detect.finish] : [])] : [];
      const near = all.map((c) => [Math.hypot(c.x - x, c.y - y), c]).sort((a, b) => a[0] - b[0])[0];
      const p = near && near[0] <= 1.3 * st.r ? { x: near[1].x, y: near[1].y } : { x, y };
      st.controls.push({ kind: "control", code: "", ...p });
      relabel(); labels(); side(); mv.draw();
    },
  });
  $("#sh-e-zin").addEventListener("click", () => mv.zoomBy(1.4));
  $("#sh-e-zout").addEventListener("click", () => mv.zoomBy(1 / 1.4));
  $("#sh-e-fit").addEventListener("click", () => { mv.fitAll(); mv.draw(); });
  // the clicks in order: the first is the start, the last the finish (the read course keeps its own kinds: a control is
  // never made the start or the finish — the races ended at the last control found, owner 2026-10-14)
  const relabel = () => st.controls.forEach((p, i) => { p.kind = i === 0 ? "start" : i === st.controls.length - 1 && st.controls.length > 1 ? "finish" : "control"; });
  function side() {
    const ok = validGeo(st.geo), nCtrl = st.controls.filter((p) => p.kind === "control").length;
    $("#sh-e-side").innerHTML = html`
      <div class="an-side-title">${t("sh.e.state")}</div>
      <ul class="an-summary">
        <li>${st.image ? t("sh.e.map", { w: st.image.width, h: st.image.height }) : t("sh.e.noMap")}</li>
        <li>${ok ? t("sh.e.geo", { how: st.geoHow }) : t("sh.e.noGeo")}</li>
        <li>${st.controls.length ? t("sh.e.ctrls", { n: nCtrl, s: st.controls[0]?.kind === "start" ? t("sh.e.ctrls.s") : t("sh.e.ctrls.noS"), f: st.controls[st.controls.length - 1]?.kind === "finish" ? t("sh.e.ctrls.f") : t("sh.e.ctrls.noF") }) : t("sh.e.noCtrls")}</li></ul>
      ${st.notes.map((n) => html`<div class="notice" style="margin-bottom:6px">${n}</div>`)}
      <p class="hint">${t(st.clicking ? "sh.e.clicking" : "sh.e.order.hint")}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-sm${st.clicking ? " btn-primary" : ""}" id="sh-e-click">${t(st.clicking ? "sh.e.clickDone" : "sh.e.click")}</button>
        <button type="button" class="btn btn-sm" id="sh-e-undo">${t("an.cal.undo")}</button>
        <button type="button" class="btn btn-sm" id="sh-e-clear">${t("an.cal.clear")}</button></div>
      <ol class="sh-e-list">${st.controls.map((p) => html`<li>${p.kind === "start" ? t("an.start") : p.kind === "finish" ? t("an.finish") : p.label}${p.code ? html` <span class="muted">${p.code}</span>` : ""}</li>`)}</ol>`;
    $("#sh-e-click").addEventListener("click", async () => { st.clicking = !st.clicking; if (st.clicking && !(await confirmClear())) st.clicking = false; side(); });
    $("#sh-e-undo").addEventListener("click", () => { st.controls.pop(); if (st.clicking) relabel(); labels(); side(); mv.draw(); });
    $("#sh-e-clear").addEventListener("click", () => { st.controls = []; side(); mv.draw(); });
  }
  const confirmClear = async () => { if (st.controls.length && !(await confirmBox(t("sh.e.clear.confirm")))) return false; st.controls = []; mv.draw(); return true; };
  const labels = () => { let k = 0; st.controls.forEach((p) => { p.label = p.kind === "control" ? String(++k) : ""; }); };
  const files = () => { $("#sh-e-files").textContent = Object.values(st.files).filter(Boolean).join(" · "); };

  // an existing circuit: its stored map
  if (course) {
    try { const b = await api(`/${id}/map/${course.n}?v=${course.map.v}`, { key: keyOf(id) }); st.image = await createImageBitmap(b); mv.setImage(st.image); }
    catch (e) { st.notes.push(errText(e)); }
  }
  labels(); side();
  if (ctx.files?.length) queueMicrotask(() => take(ctx.files));   // the files dropped on the analysis's zone

  async function take(list) {
    const vec = [...list].find((f) => /\.(ocd|omap|xmap)$/i.test(f.name));
    // an OCAD or Mapper project goes to the circuits card, where its courses are listed (managePage's take)
    if (vec) { mv.destroy(); box.innerHTML = ""; ctx.done?.(); return ctx.ocad?.(list); }
    for (const f of list) {
      const low = f.name.toLowerCase();
      try {
        if (isTraceName(f.name)) { st.track = parseTrace(f.name, await f.arrayBuffer()); st.files.trace = f.name; }
        else if (low.endsWith(".kmz")) {
          const entries = await readZip(await f.arrayBuffer());
          const kml = entries.find((e) => /\.kml$/i.test(e.name)), ovs = kml ? parseKml(new TextDecoder().decode(kml.data)) : [];
          if (!ovs.length) throw new Error("kmz");
          st.overlay = ovs[0]; st.files.geo = f.name;
          const img = entries.find((e) => e.name.toLowerCase() === ovs[0].href.toLowerCase().replace(/^\.\//, "")) || entries.find((e) => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
          if (img) { const blob = new Blob([img.data], { type: /\.png$/i.test(img.name) ? "image/png" : "image/jpeg" }); st.mapFile = new File([blob], img.name, { type: blob.type }); st.image = await createImageBitmap(blob); st.files.map = `${f.name} › ${img.name}`; }
        } else if (low.endsWith(".kml")) { const ovs = parseKml(await f.text()); if (!ovs.length) throw new Error("kml"); st.overlay = ovs[0]; st.files.geo = f.name; }
        else if (isWorldFileName(f.name)) { st.world = parseWorldFile(await f.text()); if (!st.world) throw new Error("world"); st.files.geo = f.name; }
        else if (low.endsWith(".prj")) { st.crs = crsFromWkt(await f.text()); st.files.prj = f.name; }
        else if (low.endsWith(".xml")) { st.iof = parseIofCourse(await f.text()); if (!st.iof) throw new Error("xml"); st.files.iof = f.name; }
        else if (isImage(f)) { st.image = await readMap(f); st.mapFile = f; st.files.map = f.name; }
        else throw new Error("type");
      } catch (e) { st.notes = [t(`an.err.${e.message}`, { f: f.name }) || f.name]; }
    }
    files();
    if (st.image) { mv.setImage(st.image); await auto(); } else side();     // a file refused said so in the panel (it was silent)
  }
  /** The circuit read automatically: the circles, the georeference, the controls in order. */
  async function auto() {
    st.notes = [];
    $("#sh-e-note").textContent = t("an.st.reading");
    await new Promise((r) => setTimeout(r, 20));
    try { st.detect = await detectCourse(st.image); } catch (e) { st.detect = null; }
    if (st.detect?.r) st.r = st.detect.r;
    const W = st.image.width, H = st.image.height;
    // the georeference: a ground overlay, a world file, an IOF XML with coordinates, else the organiser's trace
    st.geo = null;
    if (st.overlay) {
      const pts = st.overlay.quad ? st.overlay.quad.map(([lon, lat]) => [lat, lon]) : [[st.overlay.box.n, st.overlay.box.w], [st.overlay.box.s, st.overlay.box.e]];
      const fr = frameAt(pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length);
      const f = fitFromKml(st.overlay, W, H, fr);
      if (f) { st.geo = geoFromFit(f, fr); st.geoHow = "KML"; }
    } else if (st.world) {
      const crs = st.crs || guessCrs(st.world[4], st.world[5], st.track?.lon0 ?? 2);
      if (crs) {
        const [a, d, b, e, c, f0] = st.world, X = a * W / 2 + b * H / 2 + c, Y = d * W / 2 + e * H / 2 + f0;
        const [lat, lon] = projector(crs)(X, Y), fr = frameAt(lat, lon), f = fitFromWorld(st.world, crs, W, H, fr);
        if (f) { st.geo = geoFromFit(f, fr); st.geoHow = `${t("an.geo.world")} · ${crs.name}`; }
      } else st.notes.push(t("an.geo.noCrs"));
    }
    const circles = st.detect ? [...st.detect.controls] : [];
    const pts = [...(st.detect?.start ? [{ x: st.detect.start.x, y: st.detect.start.y, kind: "start" }] : []), ...circles.map((c) => ({ x: c.x, y: c.y, kind: "control" })),
      ...(st.detect?.finish ? [{ x: st.detect.finish.x, y: st.detect.finish.y, kind: "finish" }] : [])];
    const iofCourse = st.iof ? (st.iof.courses.find((c) => norm(c.name) === norm($("#sh-e-name").value) || norm(c.name) === norm(st.circuit)) || st.iof.courses[0]) : null;
    if (!st.geo && iofCourse) {
      // the IOF controls with coordinates, matched to the circles read: the georeference by least squares
      const seq = iofCourse.controls.map((cc) => st.iof.controls.get(cc.id)).filter((c) => c?.lat != null);
      if (seq.length >= 3 && circles.length >= 3) {
        const fr = frameAt(seq[0].lat, seq[0].lon), src = seq.map((c) => [(c.lon - fr.lon0) * fr.kx, -(c.lat - fr.lat0) * fr.ky]);
        // pair by the trace-free route: try every similarity from two pairs, keep the one that places most controls on circles
        let best = null;
        for (let i = 0; i < src.length; i++) for (let j = i + 1; j < src.length; j++) for (const a of circles) for (const b of circles) {
          if (a === b) continue;
          const f = fitSimilarity([src[i], src[j]], [[a.x, a.y], [b.x, b.y]]);
          if (!f || f.scale <= 0) continue;
          let hit = 0;
          for (const p of src) { const [x, y] = toPx(f, p[0], p[1]); if (circles.some((c) => Math.hypot(c.x - x, c.y - y) < 0.8 * st.r)) hit++; }
          if (!best || hit > best.hit) best = { f, hit };
          if (best.hit === src.length) break;
        }
        if (best && best.hit >= Math.max(3, 0.6 * src.length)) { st.geo = geoFromFit(best.f, fr); st.geoHow = "IOF XML"; }
      }
    }
    if (!st.geo && st.track && pts.length >= 3) {
      const al = alignTrack(st.track, pts, { rStar: st.detect?.r || null, northUp: true, tol: 20 });
      if (al) { st.geo = geoFromFit(al.fit, st.track); st.geoHow = t("sh.geo.trace", { m: Math.round(al.rms / al.fit.scale) }); }
      else st.notes.push(t("an.st.noAlign"));
    }
    if (!st.geo) st.notes.push(t("sh.e.needGeo"));
    // the finish not read (its colours lost over water or yellow, a line across it): looked for where the trace ends
    if (!iofCourse && st.track && validGeo(st.geo) && st.detect?.probeFinish && !pts.some((p) => p.kind === "finish")) {
      const f = fitFromGeo(st.geo, st.track), k = st.track.n - 1, [ex, ey] = toPx(f, st.track.x[k], st.track.y[k]);
      const hit = ex >= 0 && ey >= 0 && ex <= W && ey <= H ? st.detect.probeFinish(ex, ey, 50 * f.scale) : null;
      if (hit) pts.push({ x: hit.x, y: hit.y, kind: "finish" });
    }
    // the controls in order: the IOF course, else the map's own (its legs, followed from the start: course.js `order`),
    // else the trace's visiting order, else as read (to be checked)
    st.controls = [];
    const fin = pts.find((p) => p.kind === "finish");
    const seq = !iofCourse && st.detect?.order ? st.detect.order({ finish: fin ? [fin.x, fin.y] : null }) : null;
    if (seq && seq.points.filter((q) => q.kind === "control").length >= 2) {
      let list = seq.points;
      if (seq.reversible && st.track && validGeo(st.geo)) {
        const rev = [...list.filter((q) => q.kind === "start"), ...list.filter((q) => q.kind === "control").reverse(), ...list.filter((q) => q.kind === "finish")];
        const f = fitFromGeo(st.geo, st.track), a = passesInOrder(st.track, f, list, 20), b = passesInOrder(st.track, f, rev, 20);
        if (b.count > a.count || (b.count === a.count && b.cost < a.cost)) list = rev;
      }
      st.controls = list.map((q) => ({ kind: q.kind, code: "", x: q.x, y: q.y }));
      if (fin && !list.some((q) => q.kind === "finish")) st.controls.push({ ...fin });
      const off = pts.filter((p) => p.kind === "control" && !list.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1.2 * st.r));
      if (off.length || !seq.complete) { st.controls.splice(st.controls.length - (st.controls[st.controls.length - 1].kind === "finish" ? 1 : 0), 0, ...off.map((p) => ({ ...p }))); st.notes.push(t("sh.e.checkOrder")); }
    } else if (iofCourse && validGeo(st.geo)) {
      for (const cc of iofCourse.controls) {
        const c = st.iof.controls.get(cc.id);
        if (c?.lat == null) continue;
        let x = st.geo.a * c.lon + st.geo.b * c.lat + st.geo.c, y = st.geo.d * c.lon + st.geo.e * c.lat + st.geo.f;
        const near = circles.map((q) => [Math.hypot(q.x - x, q.y - y), q]).sort((a, b) => a[0] - b[0])[0];
        if (near && near[0] < 1.3 * st.r) { x = near[1].x; y = near[1].y; }
        st.controls.push({ kind: "control", code: cc.type === "Control" ? cc.id : "", x, y });
      }
    } else if (st.track && validGeo(st.geo) && pts.length) {
      const vo = visitOrder(st.track, fitFromGeo(st.geo, st.track), pts, 20, { leg: st.detect?.leg });
      const start = pts.find((p) => p.kind === "start"), finish = pts.find((p) => p.kind === "finish");
      st.controls = [...(start ? [{ ...start }] : []), ...vo.order.filter((i) => pts[i].kind === "control").map((i) => ({ ...pts[i] })), ...(finish ? [{ ...finish }] : [])];
      if (!start || !finish) st.notes.push(t("sh.e.checkEnds"));
    } else if (pts.length) { st.controls = pts.map((p) => ({ ...p })); st.notes.push(t("sh.e.checkOrder")); }
    labels();
    $("#sh-e-note").textContent = "";
    side(); mv.draw();
  }
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  $("#sh-e-in").addEventListener("change", (e) => { take([...e.target.files]); e.target.value = ""; });
  phone.bind("sh-e-phone", { kind: "any", onFiles: (f) => take(f) }, box);
  const drop = $("#sh-e-drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take([...e.dataTransfer.files]); });
  $("#sh-e-circuit")?.addEventListener("change", (e) => { st.circuit = e.target.value; if (!$("#sh-e-name").value) $("#sh-e-name").value = st.circuit; });
  $("#sh-e-cancel").addEventListener("click", () => { mv.destroy(); box.innerHTML = ""; ctx.done?.(); });
  $("#sh-e-save").addEventListener("click", async () => {
    const note = $("#sh-e-note");
    labels();
    if (!st.image) return (note.textContent = t("sh.e.noMap"));
    if ((st.mapFile || !course) && nearlyBlank(st.image)) return (note.textContent = t("sh.e.blankMap"));
    if (!validGeo(st.geo)) return (note.textContent = t("sh.e.needGeo"));
    if (st.controls.length < 2) return (note.textContent = t("sh.e.noCtrls"));
    if (st.mapFile && !$("#sh-e-consent").checked) return (note.textContent = t("sh.e.consentNeeded"));
    const n = course?.n ?? Math.max(-1, ...A.courses.map((c) => c.n)) + 1;
    // the course printed on the map: most of its controls on circles read there (the replay then does not draw it again)
    const rings = st.detect?.controls || [], ctl = st.controls.filter((p) => p.kind === "control");
    const printed = st.detect ? ctl.length > 0 && ctl.filter((p) => rings.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < (c.r || st.r))).length >= 0.6 * ctl.length
      : st.mapFile || !course ? false : course.printed;
    note.textContent = t("sh.saving");
    try {
      // the map kept as it came, at its full resolution (a PDF's page as a lossless PNG)
      let type = st.mapType;
      if (st.mapFile || !course) {
        const blob = await imageBlob(st.mapFile, st.image);
        if (blob.size > MAX_MAP) return (note.textContent = t("sh.e.tooBig", { mb: Math.round(MAX_MAP / 1048576) }));
        type = blob.type || "image/jpeg";
        await api(`/${id}/map/${n}`, { method: "PUT", body: blob, type, key: keyOf(id) });
      }
      const entry = { n, name: $("#sh-e-name").value || st.circuit || t("sh.course.default", { n: n + 1 }), circuit: $("#sh-e-circuit")?.value || st.circuit || "", r: st.r,
        map: { w: st.image.width, h: st.image.height, type, v: st.mapFile || !course ? Date.now() : course.map.v }, geo: st.geo,
        controls: st.controls.map(({ kind, code, x, y }) => ({ kind, code: code || "", x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })),
        // what the runners share besides (the route choices…) goes on with the circuit
        ...(course?.variants ? { variants: course.variants } : {}), ...(course?.exercises ? { exercises: course.exercises } : {}),
        ...($("#sh-e-score").checked ? { score: true } : {}), ...(typeof printed === "boolean" ? { printed } : {}) };
      const courses = [...A.courses.filter((c) => c.n !== n), entry].sort((a, b) => a.n - b.n);
      await api(`/${id}`, { method: "PUT", body: { courses }, key: keyOf(id) });
      mv.destroy(); box.innerHTML = "";
      onChange();
    } catch (e) { note.textContent = errText(e); }
  });
}

/** Whether a map image is nearly blank: under 3 % of its pixels neither paper white nor the course's purple (owner, 2026-11-11:
 *  circuits made from an OCAD courses file without its background map were white sheets with the overprint — 0.3-0.7 % of other
 *  ink; the club's Desquinemarre map with its course 19-24 %). Read at 1600 px at most. */
function nearlyBlank(img) {
  const w0 = img.width, h0 = img.height;
  if (!w0 || !h0) return true;
  const k = Math.min(1, 1600 / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);                            // transparent counts as paper
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (Math.min(r, gg, b) > 225) continue;                               // paper
    if ((r + b) / 2 - gg > 15 && Math.abs(r - b) < 70) continue;           // the course's purple and its soft edges
    ink++;
  }
  return ink < 0.03 * w * h;
}

/** The course drawn over the map: the start triangle, the circles, the finish's double circle, the legs, the numbers. */

/** A circuit's thumbnail: its course and a margin cut out of the map, the course drawn over it, 480 px on its longer side, as
 *  WebP (else JPEG); null when nothing comes out under the server's 400 KB. */
export async function courseThumb(img, c, side = 480) {
  const P = c.controls || [], r = c.r || 20;
  let x0 = 0, y0 = 0, x1 = img.width, y1 = img.height;
  if (P.length) {
    const xs = P.map((p) => p.x), ys = P.map((p) => p.y), pad = r * 3 + 0.06 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    x0 = Math.max(0, Math.min(...xs) - pad); y0 = Math.max(0, Math.min(...ys) - pad);
    x1 = Math.min(img.width, Math.max(...xs) + pad); y1 = Math.min(img.height, Math.max(...ys) + pad);
  }
  // a little wider than tall, as the list's pop-up (the course's own shape when far from it)
  const w = x1 - x0, h = y1 - y0, k = side / Math.max(w, h);
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  const g = cv.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
  g.drawImage(img, 0, 0);
  drawCourse(g, P, r, (v) => (v * 0.7) / k, 0.9, 0, !c.score);
  const out = (type, q) => new Promise((ok) => cv.toBlob((b) => ok(b && b.type === type ? b : null), type, q));
  for (const [type, q] of [["image/webp", 0.8], ["image/jpeg", 0.8], ["image/jpeg", 0.6]]) {
    const b = await out(type, q);
    if (b && b.size <= 400 * 1024) return b;
  }
  return null;
}

// ---- the replay --------------------------------------------------------------------------------------------------
async function replay(box, { A, id, course, race, init = {}, traces, allTraces = [], you, reload, onCourse = null }) {
  document.body.classList.add("an-theatre");
  // a score course (owner, 2026-11-02): its controls in any order — no legs, each runner's visits timed wherever they come
  const score = !!course.score, ctrls = course.controls, legsN = score ? 0 : ctrls.length - 1;
  const modes = score ? MODES.filter((m) => m === "clock" || m === "mass") : MODES;
  const legName = (j) => (j < 1 ? t("sh.leg.all") : `${ctrlLabel(j - 1)} → ${ctrlLabel(j)}`);
  const lens = new Map(), lenOf = (c) => { if (!lens.has(c.n)) lens.set(c.n, courseLenText(c, race)); return lens.get(c.n); };
  // the circuit at the map's top left, under the bar (owner, 2026-11-08): its name, length and controls
  const courseInfo = [course.name, lenOf(course), score ? t("sh.score") : tn("sh.m.ctrls", ctrls.filter((p) => p.kind === "control").length)].filter(Boolean).join(" · ");
  const ctrlLabel = (i) => { const p = ctrls[i]; if (p.kind === "start") return t("an.start"); if (p.kind === "finish") return t("an.finish"); return String(ctrls.slice(0, i + 1).filter((q) => q.kind === "control").length); };
  // the display as on « Analyse solo » (owner, 2026-10-14: no curves per runner here — the map is what is compared)
  const prefs = loadPrefs(), pct = (v, d) => (Number.isFinite(v) && v >= 10 && v <= 100 ? v : d);
  let tail = TAILS.includes(prefs.tail) ? prefs.tail : 60, width = prefs.wv === 2 && WIDTHS.some(([w]) => w === prefs.width) ? prefs.width : 2.4;   // thick by default (owner, 2026-11-05)
  // the layout (owner, 2026-11-01, as « Analyse solo »'s): the controls above the map, a panel of tabs on each side of it (the
  // runners, the analyses, the computed routes, one's own curves; the display and the computing), resized and folded
  const px = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
  // the panels' widths: this analysis's own once moved (owner, 2026-11-05: remembered per analysis), else the last ones
  const LAY = `ocn.sh.lay.${id}`, lay = (() => { try { return JSON.parse(localStorage.getItem(LAY) || "null") || {}; } catch (e) { return {}; } })();
  let lw = px(lay.lw ?? prefs.lw, 200, 1400, 320), rw = px(lay.rw ?? prefs.rw, 200, 700, 270);
  // both panels unfolded at every opening, « Coureurs » and « Affichage » (owner, 2026-11-04: « Coureurs », where one adds one's
  // track, rather than « Inter-postes » chosen earlier that day); their widths stay remembered
  const lp = { tab: "runners", collapsed: false };
  const rp = { tab: "display", collapsed: false };
  // the course drawn over the map: by default only where the map does not show it already (owner, 2026-11-05) — a circuit printed
  // by the Tracer or the OCAD import, or whose controls were read on the map; the choice kept apart for each kind of map
  const printed = typeof course.printed === "boolean" ? course.printed : A.via === "tracer";
  let courseOn = prefs.showCourse !== false, courseOver = prefs.courseOver === true;
  let future = prefs.future === "faint" ? "faint" : "hide", showCourse = printed ? courseOver : courseOn;
  let orient = prefs.orient === "leg" ? "leg" : "north", lastTurn = 0;      // the map turned to the leg (as « Analyse solo »)
  let mapAlpha = pct(prefs.mapAlpha, 100), traceAlpha = pct(prefs.traceAlpha, 100);
  let colourBy = COLOUR_BY.includes(prefs.colourBy) ? prefs.colourBy : "runner";      // the routes' colours: each runner's, or the pace
  let graph = GRAPHS.includes(prefs.graph) ? prefs.graph : "speed";
  let showStrip = prefs.strip !== false && !drawers();     // the runners' paces under the map (a phone: slid down at the opening)
  let ex3d = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3].includes(prefs.ex3d) ? prefs.ex3d : 1.5;   // the 3D view's vertical exaggeration
  // the picture exported (« Export »): the part of the map in view or all of it, PNG or JPEG, with a title and the runners' colours
  const shot = { zone: ["race", "map"].includes(prefs.shotZone) ? prefs.shotZone : "view", type: prefs.shotType === "jpeg" ? "jpeg" : "png", legend: prefs.shotLegend !== false };
  const savePrefs = () => { try { localStorage.setItem(LAY, JSON.stringify({ lw, rw })); localStorage.setItem(PREFS_KEY, JSON.stringify({ shotZone: shot.zone, shotType: shot.type, shotLegend: shot.legend, tail, width, wv: 2, future, showCourse: courseOn, courseOver, mapAlpha, traceAlpha, colourBy, strip: showStrip, graph, lw, rw, ltab: lp.tab, rtab: rp.tab, lcol: lp.collapsed, rcol: rp.collapsed, ex3d, orient })); } catch (e) { /* not kept */ } };
  const int = (v, lo, hi, d) => { const n = Number(v); return v != null && v !== "" && Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
  const MODE0 = modes.includes("wait") ? "wait" : "mass";   // waiting at the controls by default (owner, 2026-11-05)
  let mode = modes.includes(init.m) ? init.m : MODE0, fromK = int(init.from, 0, Math.max(0, legsN - 1), 1), leg = int(init.leg, 0, legsN, 0), T = 0, speed = 10;
  // who is followed — « all » the runners shown or « sel » the runner marked (the ⌖ column) — and whether the map pans with them
  // (the bar's « Suivre » button, pan): apart since 2026-11-05 (owner), so a hand on the map stops the panning, one click resumes it
  let follow = init.f === "sel" ? "sel" : "all", pan = init.f !== "none" && init.p !== "0", playing = false, timer = 0, last = 0, sel = null;
  // the analysis opens on the whole map, filling its area (owner, 2026-11-05: it opened on the runners gathered at the start);
  // following starts with the replay — played, or its time moved —, and an address naming a time or a leg keeps its view
  let still = init.t == null && !leg;
  let v3 = null, v3on = false, v3token = 0, v3sig = "", v3list = [], v3leg = null;      // the 3D view (below)
  const admin = !!auth.session()?.admin;
  // the features the organisers switched (owner, 2026-11-04; api/analyses OPTS): the computed routes (every account's since the same
  // evening, on by default; the administrators always),
  // adding a trace (the organisers always), comments, route choices, the 3D view, a headcam video, saving one's run in « Mes cartes »
  const O = A.opts || {}, routesOn = admin || O.routes !== false, canAdd = !!you.organiser || O.upload !== false, notesOn = O.notes !== false,
    variantsOn = O.variants !== false, view3dOn = O.view3d !== false, videoOn = O.video !== false, mymapsOn = O.mymaps !== false;
  if (!variantsOn && colourBy === "variant") colourBy = "runner";
  box.innerHTML = html`
    <div class="sh-layout" id="sh-layout">
      ${raw(panelHtml({ id: "sh-lp", side: "left", cls: "sh-lp", tabs: [{ key: "runners", label: t("sh.tab.circuits"), tip: t("sh.tab.circuits.tip") }, { key: "legs", label: t("an.tab.legs"), tip: t("sh.tab.legs.tip") },
        { key: "views", label: t("sh.tab.views"), tip: t("sh.tab.views.tip") }, ...(routesOn ? [{ key: "routes", label: t("an.tab.routes"), tip: t("an.tab.routes.tip") }] : []),
        ...(you.visitor || A.readonly ? [] : [{ key: "own", label: t("an.tab.graphs"), tip: t("sh.tab.own.tip") }])],
        inner: { runners: html`<div id="sh-left"></div>`, legs: html`<div class="sh-views" id="sh-legs"></div>`, views: html`<div class="sh-views" id="sh-views"></div>`, routes: html`<div class="rc-leg" id="rc-leg"></div>`, own: html`<div class="sh-curves" id="sh-curves"></div>` } }))}
      <div class="an-split" id="sh-split-l" title="${t("an.split")}"></div>
      <div class="sh-mapcol"><div class="an-bar sh-bar" id="sh-bar"></div><div class="sh-map"><div class="an-3d" id="sh-3d-host" hidden></div><canvas id="sh-canvas"></canvas>
        <div class="an-tools">${view3dOn ? html`<button type="button" class="btn btn-sm an-3d-btn" id="sh-3d" aria-pressed="false" title="${t("an.v3.hint")}">3D</button>` : ""}<button type="button" class="btn btn-sm" id="sh-zin" title="${t("lg.zin.t")}" aria-label="${t("lg.zin.t")}">+</button><button type="button" class="btn btn-sm" id="sh-zout" title="${t("lg.zout.t")}" aria-label="${t("lg.zout.t")}">−</button>
          <button type="button" class="btn btn-sm" id="sh-fit" title="${t("sh.fit")}" aria-label="${t("sh.fit")}">${raw(ICONS.fit)}</button><button type="button" class="btn btn-sm" id="sh-fitmap" title="${t("an.fitMap")}">▭</button>
          <button type="button" class="btn btn-sm an-measure" id="sh-measure" aria-pressed="false" title="${t("an.measure.hint")}">📏</button>${videoOn ? html`<button type="button" class="btn btn-sm" id="sh-video-btn" title="${t("sh.video.add")}">🎥</button><input type="file" id="sh-video-file" accept="video/*" hidden>` : ""}</div>
        <div class="an-legchip" id="sh-legchip" hidden><span id="sh-legchip-t"></span><button type="button" class="btn btn-sm ico-btn" id="sh-leg-all" hidden title="${t("lg.whole")}" aria-label="${t("lg.whole")}">${raw(ICONS.course)}</button></div><div class="an-measure-out" id="sh-measure-out" hidden></div><div class="an-northarrow" id="sh-northarrow" hidden title="${t("an.orient.n")}"><span>N</span></div><div class="an-courseinfo" id="sh-courseinfo">${courseInfo}</div><div class="an-legend" id="sh-legend" hidden></div><div class="an-3d-credit" id="sh-3d-credit" hidden></div></div>
        <div class="sh-bottom"><div class="sh-stripbar"><button type="button" class="sh-strip-tog" id="sh-strip-tog" aria-expanded="${showStrip}" title="${t("sh.strip.fold")}">${stripArrow(showStrip)} ${graphName(graph)}</button><span class="an-bar-stats" id="sh-stats"></span></div>
        <canvas class="sh-strip" id="sh-strip" ${raw(showStrip ? "" : "hidden")}></canvas></div></div>
      <div class="an-split" id="sh-split-r" title="${t("an.split")}"></div>
      ${raw(panelHtml({ id: "sh-rp", side: "right", cls: "sh-rp", tabs: [{ key: "display", label: t("an.tab.display"), tip: t("an.tab.display.tip") }, ...(routesOn ? [{ key: "compute", label: t("an.tab.compute"), tip: t("an.tab.compute.tip") }] : []),
        { key: "export", label: t("an.tab.export"), tip: t("sh.tab.export.tip") }, { key: "legend", label: t("lg.tab"), tip: t("lg.tab.tip") }],
        inner: { legend: keyHtml({ multi: true, modes: MODES.map((m) => [MODE_ICON[m], m]), add: canAdd && !you.visitor, video: videoOn }) } }))}</div>`;
  const layEl = $("#sh-layout");
  /** The panels' widths (a rail when folded), the window's height below the top line. */
  function applyLayout() {
    layEl.dataset.lcol = lp.collapsed ? "1" : "0"; layEl.dataset.rcol = rp.collapsed ? "1" : "0";
    layEl.style.setProperty("--sh-lw", `${lp.collapsed ? 34 : lw}px`);
    layEl.style.setProperty("--sh-rw", `${rp.collapsed ? 34 : rw}px`);
    fit();
  }
  // « Itinéraires » opened: the routes computed at once (owner, 2026-11-04: nothing showed until a box of « Calcul » was ticked)
  const leftP = bindPanel($("#sh-lp"), lp, { onChange: () => { savePrefs(); applyLayout(); }, onShow: (k) => { if (k === "views" || k === "legs") bottom.draw(); else if (k === "own") drawOwn(); else if (k === "routes") { if (!rcm.on) rcmTurnOn(); else { if (!rcm.token) rcmLeg(); rcmList(); } } } });
  const rightP = bindPanel($("#sh-rp"), rp, { onChange: () => { savePrefs(); applyLayout(); } });
  bindSplitter($("#sh-split-l"), layEl, "left", (w, rect) => { lw = Math.round(Math.min(rect.width - (rp.collapsed ? 34 : rw) - 300, Math.max(180, w))); if (lp.collapsed) leftP.fold(false, true); applyLayout(); }, savePrefs);
  bindSplitter($("#sh-split-r"), layEl, "right", (w, rect) => { rw = Math.round(Math.min(rect.width - (lp.collapsed ? 34 : lw) - 300, Math.max(200, w))); if (rp.collapsed) rightP.fold(false, true); applyLayout(); }, savePrefs);
  const mv = mapView($("#sh-canvas"), { onDraw: drawOver, onClick: (x, y, e) => { if (measure?.click(x, y)) return; if (draft?.kind === "corridor") { draft.pts.push([x, y]); mv.draw(); bottom.draw(); } }, onUserMove: () => { if (playing && pan) { pan = false; followMarks(); } } });
  // the control bar over the map's top edge on a computer (owner, 2026-11-07): the views fitted keep below it
  let onBarChange = () => {};
  const barFloat = floatBar($("#sh-bar").parentElement, $("#sh-bar"), (h) => { mv.setInset(h); onBarChange(h); });
  $("#sh-leg-all").addEventListener("click", () => setLeg(0));                 // the leg chip's way back to the whole course
  const handleClear = clearHandle(() => $("#sh-layout"), () => $(".sh-map .an-tools"));      // on a phone, the right drawer's handle under the map's tools
  // « Mesurer »: a line clicked on the map, its length by the circuit's georeference (trace/measure.js)
  const RAD = Math.PI / 180;
  const measure = measureTool($("#sh-measure"), { redraw: () => mv.draw(), out: $("#sh-measure-out"), metres: (a, b) => {
    const [la1, lo1] = pxToLatLon(course.geo, a[0], a[1]), [la2, lo2] = pxToLatLon(course.geo, b[0], b[1]);
    const s = Math.sin(((la2 - la1) * RAD) / 2) ** 2 + Math.cos(la1 * RAD) * Math.cos(la2 * RAD) * Math.sin(((lo2 - lo1) * RAD) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(s));
  } });
  // the map (drawn once the runners are known: the view draws as soon as it has its image)
  let image, mapBlob = null;                                // the map as stored (« Mes cartes » keeps it as it came)
  try { mapBlob = await api(`/${id}/map/${course.n}?v=${course.map.v}`, { key: keyOf(id) }); image = await createImageBitmap(mapBlob); }
  catch (e) { box.innerHTML = html`<div class="card"><div class="empty">${errText(e)}</div></div>`; return { destroy() { mv.destroy(); } }; }
  // the traces
  let recs = [];
  try { recs = await api(`/${id}/traces/${course.n}`, { key: keyOf(id) }); } catch (e) { recs = []; }
  // a competition's published results: the runner's row — in the circuit's class with split times if there is one, else
  // any with split times, else the first found — and a start time from any list of the race
  const key = (n) => (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").sort().join(" ");
  const isHim = (x, rec) => (x.lic && String(x.lic) === String(rec.lic)) || key(x.name) === key(rec.name);
  const official = (rec) => {
    if (!race) return null;
    const hits = [];
    for (const d of race.docs || []) for (const k of d.classes || []) for (const x of k.runners || []) if (isHim(x, rec)) hits.push({ x, k });
    if (!hits.length) return null;
    const h = hits.find((q) => q.k.name === course.circuit && q.x.splits?.length) || hits.find((q) => q.x.splits?.length) || hits[0];
    const startS = hits.map((q) => q.x.start_s).find((v) => v != null) ?? null;
    return { time: h.x.time_s, place: h.x.place, status: h.x.status, circuit: h.k.name, row: h.x, klass: h.k, startS };
  };
  // the class whose split times rank the legs: the circuit's, else that of the first runner found with split times
  const pubClass = (() => {
    if (!race) return null;
    const all = (race.docs || []).flatMap((d) => d.classes || []).filter((k) => k.runners?.some((x) => x.splits?.length));
    return all.find((k) => k.name === course.circuit) || null;
  })();
  const splitsN = (k) => { const n = k?.runners?.map((x) => x.splits?.length || 0) || []; return n.length ? Math.max(...n) : 0; };
  // a route drawn by hand is never compared with real traces (owner, 2026-11-02): one shared while it was allowed is left out
  recs = recs.filter((rec) => !rec.drawn);
  let runners = recs.map((rec) => {
    const tr = decodeTrace(rec);
    if (!tr) return null;
    const fit = fitFromGeo(course.geo, tr), pxs = new Float32Array(tr.n), pys = new Float32Array(tr.n);
    for (let i = 0; i < tr.n; i++) { const [x, y] = toPx(fit, tr.x[i], tr.y[i]); pxs[i] = x; pys[i] = y; }
    const guess = score ? scorePasses(tr, fit, ctrls, TOL) : coursePasses(tr, fit, ctrls, TOL), off = official(rec);
    // a competition's published split times (trace/published.js): the passes from them rather than the trace's 25 m guesses
    let pub = null;
    if (off?.row?.splits?.length && !score) {
      const map = matchControls(ctrls, off.klass.controls || [], off.row.splits.length);
      const startT = off.startS != null && race?.date_iso ? startOnTrace(race.date_iso, off.startS, tr.ms0) : null;
      pub = publishedPasses(map, publishedTaus(off.row), guess, startT, tr.dur);
    }
    const passes = pub?.passes || guess;
    // a circuit without its start or its finish: the race from the trace's start, to the trace's end
    const si = ctrls.findIndex((p) => p.kind === "start"), fi = ctrls.findIndex((p) => p.kind === "finish");
    const start = si >= 0 ? passes[si] ?? tr.t[0] : tr.t[0], finish = fi >= 0 ? passes[fi] : null;
    return { uid: rec.uid, name: rec.name, lic: rec.lic, test: !!rec.test, tr, fit, pxs, pys, passes, start, finish, mine: rec.uid === you.uid, visible: true, official: off, abs0: tr.ms0 / 1000,
      published: !!pub, pubFrom: pub?.from || null, klass: off?.klass || null, note: rec.note || "", visitors: !!rec.visitors };
  }).filter(Boolean);
  const total = (r) => (r.finish != null ? r.finish - r.start : null);
  // a score course: a runner's controls visited, in the order run ({ j: the course's index, s: race seconds })
  const scoreN = ctrls.filter((p) => p.kind === "control").length;
  const visitsOf = (r) => ctrls.map((p, j) => ({ j, p })).filter(({ p, j }) => p.kind === "control" && r.passes[j] != null)
    .map(({ j }) => ({ j, s: r.passes[j] - r.start })).sort((a, b) => a.s - b.s);
  const visKey = `ocn.an.vis.${id}.${course.n}`;
  try { const hidden = JSON.parse(sessionStorage.getItem(visKey) || "[]"); runners.forEach((r) => { r.visible = !hidden.includes(r.uid); }); } catch (e) { /* all shown */ }
  const saveVis = () => { try { sessionStorage.setItem(visKey, JSON.stringify(runners.filter((r) => !r.visible).map((r) => r.uid))); } catch (e) { /* this visit only */ } };
  // the address's runners shown and followed win over the visit's
  const uidsOf = (v) => String(v || "").split(",").map(Number).filter((n) => Number.isInteger(n));
  if (init.show != null) { const show = uidsOf(init.show); runners.forEach((r) => { r.visible = show.includes(r.uid); }); }
  sel = runners.find((r) => r.uid === Number(init.sel)) || null;
  if (sel) sel.visible = true;
  runners.sort((a, b) => (total(a) ?? 1e9) - (total(b) ?? 1e9));
  // a runner's colour: the palette's by rank, else the one chosen for them in this browser (« Couleur de la trace » when one
  // runner is shown; owner, 2026-11-07, as Solo's), kept per analysis
  const colKey = `ocn.sh.col.${id}`;
  let colours = {};
  try { colours = JSON.parse(localStorage.getItem(colKey) || "{}") || {}; } catch (e) { /* none chosen */ }
  runners.forEach((r, i) => { r.colour = colours[r.uid] || COLOURS[i % COLOURS.length]; r.rank = total(r) != null ? i + 1 : null; });

  // ---- the clock of each mode: trace seconds of runner r at the display time T (null: not shown)
  const legTime = (r, j) => (r.passes[j - 1] != null && r.passes[j] != null ? r.passes[j] - r.passes[j - 1] : null);
  let waits = [];
  function range() {
    const shown = runners.filter((r) => r.visible), R = shown.length ? shown : runners;
    if (leg) return [0, Math.max(1, ...R.map((r) => legTime(r, leg) ?? 0))];
    if (mode === "clock") return [Math.min(...R.map((r) => r.abs0 + r.start)) - 30, Math.max(...R.map((r) => r.abs0 + (r.finish ?? r.tr.dur))) + 30];
    if (mode === "mass") return [0, Math.max(1, ...R.map((r) => (r.finish ?? r.tr.dur) - r.start))];
    if (mode === "from") {
      const S = R.filter((r) => r.passes[fromK] != null);
      return [-Math.max(0, ...S.map((r) => r.passes[fromK] - r.start)), Math.max(1, ...S.map((r) => (r.finish ?? r.tr.dur) - r.passes[fromK]))];
    }
    waits = [0];
    for (let j = 1; j <= legsN; j++) {
      let w = waits[j - 1] + Math.max(0, ...R.map((r) => legTime(r, j) ?? 0));
      // a runner who missed the controls before this one runs from their last control passed: the wait leaves them the time
      for (const r of R) { const k = lastPass(r, j - 1); if (r.passes[j] != null && k != null && k < j - 1) w = Math.max(w, waits[k] + r.passes[j] - r.passes[k]); }
      waits.push(w);
    }
    // a runner who never reached the finish runs on to their trace's end (owner, 2026-11-09: their trace vanished at the end)
    const tails = R.map((r) => { const k = lastPass(r, legsN); return k == null || k === legsN ? 0 : waits[k] + (r.finish ?? r.tr.dur) - r.passes[k]; });
    return [0, Math.max(1, waits[legsN], ...tails)];
  }
  /** The last control at or before j that runner r was seen passing (null: not even the start). */
  function lastPass(r, j) { for (let k = Math.min(j, legsN); k >= 0; k--) if (r.passes[k] != null) return k; return null; }
  function sAt(r, Td) {
    let s;
    if (leg) { const a = r.passes[leg - 1], d = legTime(r, leg); if (a == null || d == null) return null; s = a + Math.min(Math.max(Td, 0), d); }
    else if (mode === "clock") s = Td - r.abs0;
    else if (mode === "mass") s = r.start + Td;
    else if (mode === "from") { if (r.passes[fromK] == null) return null; s = r.passes[fromK] + Td; }
    else {
      let j = 1;
      while (j < legsN && Td >= waits[j]) j++;
      const a = r.passes[j - 1], d = legTime(r, j);
      if (a != null && d != null) s = a + Math.min(Math.max(Td - waits[j - 1], 0), d);
      else {
        // a control missed, or the finish never reached: the runner goes on from the last control they passed, at their own pace, up
        // to the next one they passed (or their finish, else their trace's end) — before, they had no position and their whole
        // trace left the map (owner, 2026-11-09)
        const k = lastPass(r, j - 1);
        if (k == null) return null;
        let m = j; while (m <= legsN && r.passes[m] == null) m++;
        const end = m <= legsN ? r.passes[m] : r.finish ?? r.tr.dur;
        s = r.passes[k] + Math.min(Math.max(Td - waits[k], 0), Math.max(0, end - r.passes[k]));
      }
    }
    return Math.max(r.tr.t[0], Math.min(r.tr.dur, s));
  }
  let [T0, T1] = range();
  T = init.t != null && Number.isFinite(Number(init.t)) ? Math.min(T1, Math.max(T0, Number(init.t))) : T0;

  // ---- drawing
  // the pace colours: one scale for every runner shown (their races' 10-90 % of speeds), so that colours compare
  let vLo = 0, vHi = 1;
  function paceScale() {
    const shown = runners.filter((r) => r.visible);
    [vLo, vHi] = paceRange(...shown.map((r) => r.tr.v.subarray(indexAt(r.tr, r.start), indexAt(r.tr, r.finish ?? r.tr.dur) + 1)));
    heightScale();
  }
  // the heights under the routes: the terrain model's grid (the 3D view's and the computed routes'), loaded when a colouring asks
  let hts, hLo = 0, hHi = 1;                                 // undefined: not asked; "loading", "failed", or the grid
  function hseries(r, m) {
    if (!hts?.z) return null;
    if (!r.hTr) {
      const W = image.width, H = image.height, ele = new Float32Array(r.tr.n);
      for (let i = 0; i < r.tr.n; i++) ele[i] = heightAt(hts, W, H, r.pxs[i], r.pys[i]);
      r.hTr = { ...r.tr, ch: { ...r.tr.ch, ele } };
    }
    if (m === "gap") { const sl = hseries(r, "slope"); return (r.hGap ||= Float32Array.from(r.tr.v, (v, i) => gapSpeed(v, sl[i]))); }
    return m === "ele" ? r.hTr.ch.ele : (r.hSlope ||= (() => { const s = new Float32Array(r.tr.n); const tr = r.hTr;
      for (let i = 0; i < tr.n; i++) { const a = indexAt(tr, tr.t[i] - 10), b = indexAt(tr, tr.t[i] + 10), d = tr.cum[b] - tr.cum[a]; s[i] = d >= 8 ? (100 * (tr.ch.ele[b] - tr.ch.ele[a])) / d : NaN; }
      return s; })());
  }
  function heightScale() {
    const m = cmode();
    if (!HEIGHT_BY.includes(m) || !hts?.z) return;
    const vs = [];
    for (const r of runners.filter((x) => x.visible)) {
      const s = hseries(r, m), i1 = indexAt(r.tr, r.finish ?? r.tr.dur);
      if (s) for (let i = indexAt(r.tr, r.start); i <= i1; i++) if (Number.isFinite(s[i])) vs.push(s[i]);
    }
    if (!vs.length) return;
    if (m === "gap") { [hLo, hHi] = paceRange(Float32Array.from(vs)); return; }
    vs.sort((a, b) => a - b);
    let lo = vs[Math.floor(vs.length * 0.05)], hi = vs[Math.floor(vs.length * 0.95)];
    if (m === "slope") { const k = Math.max(Math.abs(lo), Math.abs(hi), 2); lo = -k; hi = k; }
    [hLo, hHi] = hi > lo ? [lo, hi] : [lo - 1, hi + 1];
  }
  // the heights a colouring by altitude, slope or slope-corrected pace needs: IGN's (else the tiles'), a few seconds the first time
  // — their progress in the legend, and asked for as soon as the « Trace » list is opened (owner, 2026-11-07: « par allure
  // corrigée par la pente » took a while to show, the routes keeping their runner colours meanwhile)
  let hFrac = null;
  function needHeights(early = false) {
    if ((!early && !HEIGHT_BY.includes(cmode())) || hts !== undefined) return;
    hts = "loading";
    heights3d((f) => { hFrac = f; setBar($("#sh-legend .wait-bar"), f); }).then((g) => { hts = g?.z ? g : "failed"; }, (e) => { console.warn(e); hts = "failed"; })
      .then(() => { if (!box.isConnected) return; heightScale(); legend(); mv.draw(); sync3d(); stripCache = null; drawStrip(); });
  }
  /** The colours in use: a leg's colours only in a leg's view. */
  const cmode = () => (!leg && LEG_ONLY.includes(colourBy) ? "runner" : colourBy);
  function legend() {
    const el = $("#sh-legend");
    if (!el) return;
    const m = cmode();
    needHeights();
    el.hidden = m === "runner";
    if (m === "pace") el.innerHTML = paceLegend(vLo, vHi);
    else if (HEIGHT_BY.includes(m)) {
      if (hts?.z) { heightScale(); el.innerHTML = `${legendHtml(m, hLo, hHi)}<div class="muted sh-legend-note">${html`${t("sh.legend.model")}`}</div>`; }
      else el.innerHTML = `${html`<div class="an-legend-title">${t(hts === "failed" ? "sh.legend.noHeights" : "sh.legend.heightsLoading")}</div>`}${hts === "failed" ? "" : bar(hFrac)}`;
    }
    else if (m === "legtime") {
      const ts = legRanks().times;
      el.hidden = !ts.length;
      if (ts.length) el.innerHTML = rampLegend(t("sh.legend.legtime"), [clock(ts[0]), clock(ts[Math.floor((ts.length - 1) / 2)]), clock(ts[ts.length - 1])]);
    } else if (m === "variant") {
      const V = variantsOf(leg);
      el.innerHTML = html`<div class="an-legend-title">${t("sh.legend.variant")}</div>${V.list.map((v, i) => html`<div class="sh-vleg"><span class="sh-swatch" style="background:${VARIANT_COLOURS[i % VARIANT_COLOURS.length]}"></span> ${v.name || v.key} <span class="muted">· ${v.uids.length} · ${clock(v.best)}</span></div>`)}`;
    }
  }
  // a leg's times ranked among the runners shown: the ramp from the fastest to the slowest (owner's study of 2DRerun)
  function legRanks() {
    const shown = runners.filter((r) => r.visible && legTime(r, leg) != null), times = shown.map((r) => legTime(r, leg)).sort((a, b) => a - b);
    return { times, f: (r) => { const v = legTime(r, leg); if (v == null || times.length < 2) return 0; return times.filter((x) => x < v).length / (times.length - 1); } };
  }
  /** Runner r's route colour in the current mode (the pace's is drawn step by step). */
  function routeColour(r) {
    const m = cmode();
    if (m === "legtime") return rampColour(legRanks().f(r) * 0.999);
    if (m === "variant") { const V = variantsOf(leg), k = V.of.get(r.uid), i = V.list.findIndex((v) => v.key === k); return i < 0 ? r.colour : VARIANT_COLOURS[i % VARIANT_COLOURS.length]; }
    return r.colour;
  }
  /** Runner r's route from index a to b: one colour, or each step by its pace. */
  function stroke(g, r, a, b, lwPx, alpha, head = null) {
    if (b <= a) return;
    const m = cmode(), sv = m === "pace" ? r.tr.v : HEIGHT_BY.includes(m) ? hseries(r, m) : null;
    if (sv) {
      g.lineWidth = lwPx; g.globalAlpha = alpha;
      for (let i = a + 1; i <= b; i++) { g.strokeStyle = m === "pace" ? paceColour(sv[i], vLo, vHi) : colourOf(m, sv[i], hLo, hHi); g.beginPath(); g.moveTo(r.pxs[i - 1], r.pys[i - 1]); g.lineTo(r.pxs[i], r.pys[i]); g.stroke(); }
      if (head) { g.beginPath(); g.moveTo(r.pxs[b], r.pys[b]); g.lineTo(head[0], head[1]); g.stroke(); }
      return;
    }
    g.strokeStyle = routeColour(r); g.lineWidth = lwPx; g.globalAlpha = alpha;
    g.beginPath(); g.moveTo(r.pxs[a], r.pys[a]); for (let i = a + 1; i <= b; i++) g.lineTo(r.pxs[i], r.pys[i]);
    if (head) g.lineTo(head[0], head[1]);
    g.stroke();
  }
  function drawOver(g, view, lw) {
    drawExercise(g, lw);
    // the computed routes: the terrain as read over the whole map, the decision map of the leg shown — on the whole course, of the
    // leg the followed runner is on (owner, 2026-11-05: both boxes did nothing on the whole course, where « Itinéraires » now opens)
    if (rcm.on) {
      if (rcm.pic) { g.save(); g.globalAlpha = 0.6; g.imageSmoothingEnabled = false; g.drawImage(rcm.pic.canvas, 0, 0, rcm.pic.canvas.width * rcm.pic.cell, rcm.pic.canvas.height * rcm.pic.cell); g.restore(); }
      const j = leg || runLeg();
      if (j) RC.drawDecision(g, rcmDecision(j));
      if (leg) RC.drawRoutes(g, rcm.routes[leg], lw, rcmPace(), clock);
    }
    if (showCourse) drawCourse(g, leg ? ctrls.slice(leg - 1, leg + 1) : ctrls, course.r || 20, lw, 0.75, leg ? ctrls.slice(0, leg - 1).filter((p) => p.kind === "control").length : 0, !score);
    const shown = runners.filter((r) => r.visible), ta = traceAlpha / 100;
    g.lineCap = "round"; g.lineJoin = "round";
    for (const r of shown) {
      const s = sAt(r, T);
      if (s == null) continue;
      // a leg's routes are drawn whole, whatever the replay's time, the runner's dot moving along them (owner, 2026-11-08: « the
      // full trace of the selected runners shown right away »; before, only when coloured by variant or leg time) — the display's
      // own settings (tail, the trace to come) apply again on the whole course
      const whole = leg && r.passes[leg] != null;
      const lo = leg ? r.passes[leg - 1] : Math.max(r.start, tail && !leg ? s - tail : r.start), from = indexAt(r.tr, lo), to = indexAt(r.tr, whole ? Math.max(s, r.passes[leg]) : s);
      // the route still to run, faint, to its finish (or the leg's end) — hidden by default
      if (future === "faint" && !whole) {
        const a = indexAt(r.tr, leg ? r.passes[leg - 1] : r.start), b = indexAt(r.tr, leg ? r.passes[leg] ?? r.tr.dur : r.finish ?? r.tr.dur);
        stroke(g, r, a, b, lw(2 * width), 0.3 * ta);
      }
      if (mode === "clock" && !leg && s < r.start - 1) continue;           // not started yet
      const [mx, my] = posAt(r.tr, s), [x, y] = toPx(r.fit, mx, my);
      // the route joined to the dot only when drawn up to it: a leg drawn whole ends at its control, and the join made a straight
      // line from there back to the runner (owner, 2026-11-08)
      stroke(g, r, from, to, lw((r === sel ? 2.8 : 2) * width), (r === sel || !sel ? 1 : 0.75) * ta, whole && r.passes[leg] > s ? null : [x, y]);
      g.globalAlpha = 1; g.beginPath(); g.arc(x, y, lw(7), 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill();
      g.beginPath(); g.arc(x, y, lw(5), 0, 2 * Math.PI); g.fillStyle = r.colour; g.fill();
      if (shown.length > 1 || r === sel) {
        const label = initials(r);
        g.font = `700 ${lw(11)}px system-ui, sans-serif`; g.textBaseline = "middle";
        g.strokeStyle = "#fff"; g.lineWidth = lw(3); g.strokeText(label, x + lw(9), y); g.fillStyle = r.colour; g.fillText(label, x + lw(9), y);
      }
    }
    g.globalAlpha = 1;
    measure?.paint(g, lw);
    if (v3) sync3d();
  }
  const initials = (r) => (r.test ? `#${(r.uid - 1e9) % 1000}` : r.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3));   // a test runner: its number
  // who is followed, shown in the runners' list (owner, 2026-11-05: the « Suivre » drop-down repeated the list's ⌖ column; a ⌖ on the
  // « all the runners shown » row follows the group, on a runner that runner, none lit: the map stays where it is left)
  function followMarks() {
    $$("[data-follow]").forEach((b) => { const on = follow === "sel" && sel?.uid === Number(b.dataset.follow); b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    const a = $("[data-follow-all]");
    if (a) { a.classList.toggle("on", follow === "all"); a.setAttribute("aria-pressed", String(follow === "all")); }
    const p = $("#sh-pan");
    if (p) { p.classList.toggle("on", pan); p.setAttribute("aria-pressed", String(pan)); const l = t(pan ? "sh.pan.stop" : "sh.pan.start"); p.setAttribute("aria-label", l); p.title = `${l} — ${t("sh.pan.tip")}`; }
  }
  /** The pace strip shown or folded: the bar over it and « Affichage »'s box say the same (owner, 2026-11-05). */
  function setStrip(on) {
    showStrip = on; savePrefs();
    $("#sh-strip").hidden = !on;
    const b = $("#sh-strip-tog"); if (b) { b.setAttribute("aria-expanded", String(on)); b.textContent = `${stripArrow(on)} ${graphName(graph)}`; }
    const c = $("#sh-strip-on"); if (c) c.checked = on;
    drawStrip(); window.dispatchEvent(new Event("resize"));
  }
  function followView() {
    if (!pan || still) return;
    const pts = (follow === "sel" && sel ? [sel] : runners.filter((r) => r.visible)).map((r) => { const s = sAt(r, T); if (s == null) return null; return toPx(r.fit, ...posAt(r.tr, s)); }).filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1 || follow === "sel") { mv.centerOn(pts[0][0], pts[0][1]); return; }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const { w, h } = mv.box(), k = mv.view.k;
    if (x1 - x0 > (w - 160) / k || y1 - y0 > (h - 160) / k) mv.fitBox(x0, y0, x1, y1, 80, 4);
    else mv.centerOn((x0 + x1) / 2, (y0 + y1) / 2);
  }
  /** The map's turn: the leg shown up — a leg's view its leg, else the leg of the runner followed —, else north up. */
  function mapTurn() {
    if (orient !== "leg" || score) return 0;
    const j = leg || runLeg(true);
    const a = j ? ctrls[j - 1] : null, b = j ? ctrls[j] : null;
    if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 1) lastTurn = -Math.PI / 2 - Math.atan2(b.y - a.y, b.x - a.x);
    else if (!j) lastTurn = 0;
    return lastTurn;
  }
  /** The leg the followed runner (any: the runner marked, followed or not) is on at the replay's time; 0 when none. */
  function runLeg(any = false) {
    if (!sel || (!any && follow !== "sel")) return 0;
    const s = sAt(sel, T);
    if (s == null) return 0;
    let j = 1;
    while (j < legsN && sel.passes[j] != null && s >= sel.passes[j]) j++;
    return j;
  }
  function turn() { const r = mapTurn(); mv.setRotation(r); const na = $("#sh-northarrow"); if (na) { na.hidden = !r; na.style.transform = `rotate(${r}rad)`; } }
  function frame() { turn(); followView(); mv.draw(); hud(); drawOwn(); drawStrip(); video?.sync(); saveUrl(); }

  // ---- the runners' paces under the map (trace/pacestrip.js): over the replay's own time axis, smoothed over a few
  // seconds to half a minute (a leg's short view, the whole race), recomputed only when the axis or the runners change
  let stripCache = null;
  function stripSeries() {
    const cv = $("#sh-strip"), K = stripSamples(cv), shown = runners.filter((r) => r.visible);
    const sig = [K, T0, T1, mode, fromK, leg, shown.map((r) => r.uid).join(","), graph, hts?.z ? 1 : 0].join("|");
    if (stripCache?.sig === sig) return stripCache.series;
    const half = Math.max(3, Math.min(15, (T1 - T0) / 80));
    // the pace from the distance run; the terrain's measures their mean over the window (none until the heights are loaded)
    const series = shown.map((r) => {
      const vals = new Array(K).fill(null), end = r.finish ?? r.tr.dur, arr = graph === "speed" ? null : hseries(r, graph);
      if (graph !== "speed" && !arr) return { r, vals };
      for (let k = 0; k < K; k++) {
        const s = sAt(r, T0 + (k / (K - 1)) * (T1 - T0));
        if (s == null || s < r.start - 1 || s > end + 1) continue;
        const a = Math.max(r.start, s - half), b = Math.min(end, s + half);
        if (b - a < 2) continue;
        if (!arr) { vals[k] = (cumAt(r.tr, b) - cumAt(r.tr, a)) / (b - a); continue; }
        let sum = 0, n = 0;
        for (let i = indexAt(r.tr, a), i1 = indexAt(r.tr, b); i <= i1; i++) if (Number.isFinite(arr[i])) { sum += arr[i]; n++; }
        vals[k] = n ? sum / n : null;
      }
      return { r, vals };
    });
    stripCache = { sig, series };
    return series;
  }
  function drawStrip() {
    const cv = $("#sh-strip");
    if (!cv || cv.hidden || !cv.clientWidth) return;
    const span = Math.max(1, T1 - T0), f = (x) => (x - T0) / span;
    const fmtT = (x) => (mode === "clock" && !leg ? hms(x).slice(0, 5) : x < 0 ? `−${clock(-x)}` : clock(x));
    const step = [30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => span / s <= Math.max(2, cv.clientWidth / 90)) || 3600;
    const ticks = [];
    for (let x = Math.ceil(T0 / step) * step; x <= T1; x += step) ticks.push({ f: f(x), label: fmtT(x) });
    // in the waiting mode, every control is a moment of the axis; in a leg's view, its two ends
    const marks = !leg && (mode === "wait" || mode === "waitpause") ? waits.slice(1, -1).map((w, j) => ({ f: f(w), label: ctrlLabel(j + 1) })) : [];
    if (graph !== "speed") needHeights(true);
    drawPaceStrip(cv, { series: stripSeries().map(({ r, vals }) => ({ colour: r.colour, vals, bold: r === sel })), cursor: f(T), ticks, marks, by: graph, unit: isPaceGraph(graph) ? "" : graph === "ele" ? "m" : "" });
  }
  // ---- the replay's state in the address (owner's study of 2DRerun, 2026-10-23: a link reopens the same view): the circuit,
  // mode, time, leg, runners shown, followed runner, duel reference and view; written once the replay has been still 0.4 s
  let urlTimer = 0;
  function saveUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => {
      if (!box.isConnected) return;
      const q = { id };
      if (A.courses.length > 1 || course.n !== A.courses[0]?.n) q.c = course.n;
      if (mode !== MODE0) q.m = mode;
      if (mode === "from") q.from = fromK;
      if (leg) q.leg = leg;
      if (Math.round(T) !== Math.round(T0)) q.t = Math.round(T);
      if (runners.some((r) => !r.visible)) q.show = runners.filter((r) => r.visible).map((r) => r.uid).join(",");
      if (sel) q.sel = sel.uid;
      if (follow !== "all") q.f = follow;
      if (!pan) q.p = "0";
      if (state.ref) q.ref = state.ref.uid;
      if (state.tab !== TABS[0]) q.v = state.tab;
      if (state.legsOf != null) q.lo = state.legsOf;
      if (state.ex && state.tab === "exercises") q.ex = state.ex;
      Object.assign(q, X.extraQuery());
      replaceQuery(q);
    }, playing ? 1500 : 400);
  }

  // ---- one's own curves: from one's own file, kept on this device (the server keeps positions and times only, and
  // the others never see them); the panel folded to the left by default, a tab to open it
  const me = runners.find((r) => r.mine);
  let own = null;
  const prepOwn = (tr) => {
    // the cadence as runners read it: one foot's strides doubled on foot (« pas/min »), a bike's pedal turns kept
    if (tr.ch.cad && !tr.cadUnit) {
      const bike = tr.activity === "bike" || (!tr.activity && /\bvtt\b|v[ée]lo|mtb/i.test(`${race?.name || ""} ${A.title}`));
      if (!bike) for (let i = 0; i < tr.ch.cad.length; i++) tr.ch.cad[i] *= 2;
      tr.cadUnit = t(bike ? "an.unit.rpm" : "an.unit.spm");
    }
    return tr;
  };
  // the own file is the same run: it overlaps one's shared trace in time
  const overlaps = (tr) => me && tr.ms0 <= me.tr.ms0 + me.tr.dur * 1000 && tr.ms0 + tr.dur * 1000 >= me.tr.ms0;
  function drawOwn() {
    const cv = $("#sh-own-cv");
    if (!me || !own || !cv || lp.tab !== "own" || lp.collapsed) return;
    const delta = (me.tr.ms0 - own.ms0) / 1000, end = me.finish ?? me.tr.dur, s = sAt(me, T);
    drawCurves(cv, { track: own, t0: me.start + delta, total: Math.max(1, end - me.start), rows: curveRows(own), cursor: s == null ? null : s - me.start,
      units: { cad: own.cadUnit }, marks: me.passes.map((p, j) => (p == null || !j ? null : { t: p - me.start, label: ctrls[j].kind === "control" ? ctrlLabel(j) : "" })).filter(Boolean) });
  }
  function curvesPanel() {
    const el = $("#sh-curves");
    if (!el) return;
    leftP.setTab("own", !!me);
    if (!me) return;
    el.innerHTML = own ? html`<canvas class="sh-own-cv" id="sh-own-cv"></canvas>`
      : touchScreen() ? html`<label class="btn btn-primary"><input type="file" id="sh-own-file" accept="${traceAccept()}" hidden>${t("sh.own.pick")}</label><p class="muted" style="margin:6px 0 0">${t("sh.own.drop.hint")}</p>`
      : html`<label class="dropzone sh-own-drop"><input type="file" id="sh-own-file" accept="${traceAccept()}" hidden><strong>${t("sh.own.drop")}</strong><span class="muted">${t("sh.own.drop.hint")}</span></label>
          <p class="hint" style="margin:6px 0 0">${t("an.fitTip")}</p>
          <p class="notice" id="sh-own-note" hidden></p>`;
    $("#sh-own-file")?.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      let tr = null;
      try { tr = parseTrace(f.name, await f.arrayBuffer()); } catch (err) { tr = null; }
      const note = $("#sh-own-note");
      if (!tr || !overlaps(tr)) { note.hidden = false; note.textContent = t(tr ? "sh.own.mismatch" : "an.err.gpx"); return; }
      await ownPut(ownKey(id, course.n), f);
      own = prepOwn(tr); curvesPanel();
    });
    drawOwn();
  }
  if (me) {
    ownGet(ownKey(id, course.n)).then(async (f) => {
      if (f && !own) { try { const tr = parseTrace(f.name || "trace.fit", await f.arrayBuffer()); if (overlaps(tr)) own = prepOwn(tr); } catch (e) { /* unreadable: dropped again */ } }
      curvesPanel();
    });
  }
  const ownRo = new ResizeObserver(() => drawOwn());
  if ($("#sh-curves")) ownRo.observe($("#sh-curves"));                 // a visitor has no « Mes courbes »

  // ---- the panels
  const routeVar = (r) => { const V = variantsOf(leg), k = V.of.get(r.uid), i = V.list.findIndex((v) => v.key === k); return { key: k, name: V.list[i]?.name || k, c: VARIANT_COLOURS[Math.max(0, i) % VARIANT_COLOURS.length] }; };
  /** One's comment on one's race, seen by all who see the traces (owner, 2026-11-02, after RouteGadget). */
  async function saveNote(text) {
    const state = $("#sh-note-state");
    try {
      const r = await api(`/${id}/trace/${course.n}`, { method: "PATCH", body: { note: text }, key: keyOf(id) });
      const mine = runners.find((x) => x.mine && !x.test);
      if (mine) mine.note = r.note || "";
      if (state) state.textContent = t("sh.note.saved");
      left();
    } catch (e) { if (state) state.textContent = errText(e); }
  }

  function left() {
    const rowsL = leg ? [...runners].sort((a, b) => (legTime(a, leg) ?? 1e9) - (legTime(b, leg) ?? 1e9)) : runners;
    const bestLeg = leg ? Math.min(...runners.map((r) => legTime(r, leg) ?? 1e9)) : null;
    // the circuit, chosen here (owner, 2026-11-04: a row of chips by the title would not scale; as « En direct »'s course picker),
    // each with its number of tracks; the list's columns named by a header row rather than a sentence
    const nOn = (n) => (allTraces || []).filter((x) => x.course === n).length;
    // each circuit's length after its name (owner, 2026-11-08)
    const optName = (c) => [c.name, lenOf(c)].filter(Boolean).join(" · ");
    // (owner, 2026-11-05: no « Circuit » label under the tab of that name, no « n tracks shown of m » — the circuit's name gives
    // the count, the ticks show the rest)
    $("#sh-left").innerHTML = html`${A.courses.length > 1 ? html`<label class="field sh-course-pick"><select id="sh-course" aria-label="${t("prov.circuit")}">${A.courses.map((c) => html`<option value="${c.n}" ${raw(c.n === course.n ? "selected" : "")}>${tn("sh.course.opt", nOn(c.n), { c: optName(c) })}</option>`)}</select></label>` : ""}
      ${leg ? html`<div class="an-side-title">${legName(leg)}</div>` : ""}
      <div class="row" style="gap:4px;margin-bottom:4px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="sh-all">${t("sh.all")}</button><button type="button" class="btn btn-sm" id="sh-none">${t("sh.none")}</button>
        <button type="button" class="btn btn-sm" id="sh-invert">${t("sh.invert")}</button>${runners.some((r) => r.mine) ? html`<button type="button" class="btn btn-sm" id="sh-mine-only">${t("sh.meOnly")}</button>` : ""}</div>
      ${rowsL.length ? html`<div class="sh-runner sh-runner-head" aria-hidden="true"><span class="sh-h-show">${t("sh.col.show")}</span><span>${t("prov.runner")}</span><span class="sh-h-follow">${t("sh.col.follow")}</span><span>${t("prov.time")}</span></div>` : ""}
      ${rowsL.length ? html`<div class="sh-runner sh-runner-all" title="${t("sh.followAll.tip")}"><span></span><span></span><span class="sh-name">${t("sh.followAll")}</span>
        <button type="button" class="sh-follow-one${follow === "all" ? " on" : ""}" data-follow-all aria-pressed="${follow === "all"}" title="${t("sh.followAll.tip")}">⌖</button><span></span></div>` : ""}
      ${rowsL.length ? html`<div class="sh-runners">${rowsL.map((r) => {
        const lt = leg ? legTime(r, leg) : null, dist = leg && lt != null ? cumAt(r.tr, r.passes[leg]) - cumAt(r.tr, r.passes[leg - 1]) : null;
        return html`<div class="sh-runner${r === sel ? " sel" : ""}${r.visible ? "" : " off"}" data-uid="${r.uid}" role="checkbox" aria-checked="${r.visible}">
          <input type="checkbox" data-vis="${r.uid}" ${raw(r.visible ? "checked" : "")} tabindex="-1"><span class="sh-swatch" style="background:${r.colour}"></span>
          <span class="sh-name">${leg && legTime(r, leg) != null ? html`<span class="sh-vtag" style="--v:${routeVar(r).c}" title="${routeVar(r).name}">${routeVar(r).key}</span> ` : ""}${r.name}${r.mine ? html` <span class="tag">${t("sh.me")}</span>` : ""}${r.test ? html` <span class="tag">${t("sh.test.tag")}</span>` : ""}</span>
          <button type="button" class="sh-follow-one${r === sel && follow === "sel" ? " on" : ""}" data-follow="${r.uid}" aria-pressed="${r === sel && follow === "sel"}" title="${t("sh.followOne")}">⌖</button>
          <span class="num muted">${leg ? (lt != null ? html`${clock(lt)}${lt > bestLeg ? html` <span class="sh-behind">${signed(lt - bestLeg)}</span>` : ""}` : "—")
            : r.official?.time != null ? clock(r.official.time) : total(r) != null ? (A.via === "pixel" ? clock(total(r)) : html`<span class="sh-est" title="${t("sh.time.est")}">~${clock(total(r))}</span>`) : "—"}</span>
          ${score ? html`<span class="sh-sub muted">${t("sh.score.n", { n: visitsOf(r).length, m: scoreN })}</span>` : leg && dist != null ? html`<span class="sh-sub muted">${fmt(dist)} m · ${pace(dist / lt)}</span>` : r.official?.place ? html`<span class="sh-sub muted">${t("sh.place", { p: r.official.place })}</span>` : ""}
          ${notesOn && r.note ? html`<span class="sh-note" title="${t("sh.note.of", { r: r.name })}">${r.note}</span>` : ""}</div>`; })}</div>`
        : html`<div class="empty">${t("sh.noTraces")}</div>`}
      ${A.readonly ? "" : you.visitor ? html`<p class="hint sh-visitor">${t("sh.visitor.note")}</p>` : html`<div class="sh-mine">
        ${runners.some((r) => r.mine) ? html`<button type="button" class="btn btn-sm" id="sh-rm">${t("sh.trace.remove")}</button>` : ""}
        ${canAdd ? "" : html`<p class="hint" style="margin:6px 0 0">${t("sh.closed")}</p>`}</div>
      ${myRun() && (notesOn || A.visitors) ? html`<div class="sh-mine sh-note-box">${notesOn ? html`<label for="sh-note"><b>${t("sh.note.mine")}</b></label>
        <textarea id="sh-note" rows="3" maxlength="1000" placeholder="${t("sh.note.ph")}">${myRun().note || ""}</textarea>
        <div class="row" style="gap:6px;align-items:center"><button type="button" class="btn btn-sm" id="sh-note-save">${t("sh.note.save")}</button><span class="muted" id="sh-note-state"></span></div>
        <p class="hint" style="margin:0">${t("sh.note.hint")}</p>` : ""}
        ${A.visitors ? html`<label class="an-opt"><input type="checkbox" id="sh-mine-vis" ${raw(myRun().visitors ? "checked" : "")}> ${t("sh.visitors.mine")}</label>` : ""}</div>` : ""}
      ${auth.session()?.admin ? html`<div class="sh-mine"><b>${t("sh.test.title")}</b>
        <div class="row" style="gap:6px;margin-top:4px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="sh-test-add">${t("sh.test.add")}</button>
        ${myTests().length ? html`<button type="button" class="btn btn-sm" id="sh-test-rm">${t("sh.test.remove", { n: myTests().length })}</button>` : ""}</div>
        <input type="file" id="sh-test-file" accept="${traceAccept()}" multiple hidden>
        <p class="hint" style="margin:6px 0 0">${t("sh.test.hint")}</p></div>` : ""}`}
      <div id="sh-upload"></div>`;
    const shownChanged = () => {
      if (follow === "sel" && !sel) follow = "all";              // the runner followed hidden: the group again
      saveVis();
      const was = [T0, T1];
      [T0, T1] = range();
      if (T < T0 || T > T1 || (was[0] === T && T0 !== T)) T = Math.min(T1, Math.max(T0, T));
      paceScale(); legend();
      left(); right(); frame(); bottom.draw();
    };
    $$(".sh-runner").forEach((el) => el.addEventListener("click", (e) => {
      if (e.target.closest("[data-follow]")) return;
      const r = runners.find((x) => x.uid === Number(el.dataset.uid));
      r.visible = !r.visible;
      if (!r.visible && sel === r) sel = null;
      shownChanged();
    }));
    $$("[data-follow]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = runners.find((x) => x.uid === Number(b.dataset.follow));
      // lit: back to the group; else that runner — and the panning on
      if (sel === r && follow === "sel") { sel = null; follow = "all"; }
      else { sel = r; r.visible = true; follow = "sel"; }
      pan = true; still = false;
      shownChanged();
    }));
    $("[data-follow-all]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      follow = "all"; pan = true; still = false;
      sync3d();
      followMarks(); frame();
    });
    $("#sh-course")?.addEventListener("change", (e) => onCourse?.(Number(e.target.value)));
    $("#sh-all").addEventListener("click", () => { runners.forEach((r) => { r.visible = true; }); shownChanged(); });
    $("#sh-none").addEventListener("click", () => { runners.forEach((r) => { r.visible = false; }); sel = null; shownChanged(); });
    $("#sh-invert").addEventListener("click", () => { runners.forEach((r) => { r.visible = !r.visible; }); if (sel && !sel.visible) sel = null; shownChanged(); });
    $("#sh-mine-only")?.addEventListener("click", () => { runners.forEach((r) => { r.visible = r.mine; }); shownChanged(); });
    if (you.visitor) return;
    $("#sh-mine-vis")?.addEventListener("change", async (e) => {
      try { const r = await api(`/${id}/trace/${course.n}`, { method: "PATCH", body: { visitors: e.target.checked }, key: keyOf(id) }); myRun().visitors = !!r.visitors; }
      catch (err) { e.target.checked = !e.target.checked; alertBox(errText(err)); }
    });
    $("#sh-note-save")?.addEventListener("click", () => saveNote($("#sh-note").value));
    $("#sh-rm")?.addEventListener("click", async () => { if (!(await confirmBox(t("sh.trace.remove.confirm"), { ok: t("sh.remove") }))) return; try { await api(`/${id}/trace/${course.n}`, { method: "DELETE", key: keyOf(id) }); await ownDel(ownKey(id, course.n)); reload(); } catch (e) { alertBox(errText(e)); } });
    $("#sh-test-add")?.addEventListener("click", () => $("#sh-test-file").click());
    $("#sh-test-file")?.addEventListener("change", (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) uploadTests(fs); });
    $("#sh-test-rm")?.addEventListener("click", async () => {
      if (!(await confirmBox(t("sh.test.remove.confirm", { n: myTests().length }), { ok: t("sh.remove") }))) return;
      try { await api(`/${id}/trace/${course.n}/tests`, { method: "DELETE", key: keyOf(id) }); reload(); } catch (e) { alertBox(errText(e)); }
    });
  }
  // an administrator's test traces: uid 1e9 + account × 1000 + k (api/analyses), each file a runner « <name> #k »
  function myRun() { return runners.find((r) => r.mine && !r.test) || null; }
  function myTests() { return runners.filter((r) => r.uid > 1e9 && Math.floor((r.uid - 1e9) / 1000) === you.uid); }
  // adding (or replacing) one's track, from the top line only (owner, 2026-11-05: it was in « Circuits » too): a small window offers
  // this computer or, by a QR code, one's phone (a phone: its own files only), the FIT tip, and « Annuler »; the consent that follows
  // is in « Circuits », shown
  function addDialog() {
    const take = (f) => { if (!f) return; leftP.fold(false); leftP.show("runners"); upload(f); };
    if (touchScreen()) { pickTrace(take); return; }        // a phone: its file picker at once (owner, 2026-11-06)
    const m = document.createElement("div");
    m.className = "tr-modal sh-add-modal";
    const close = () => { m.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    m.innerHTML = html`<div class="tr-dialog" role="dialog" aria-modal="true" aria-labelledby="sh-add-t">
      <h2 id="sh-add-t">${t(runners.some((r) => r.mine) ? "sh.trace.replace" : "sh.trace.add")}</h2>
      <div class="tr-form"><div class="sh-add-ways"><button type="button" class="btn btn-primary" data-pc>💻 ${t("sh.add.pc")}</button>
        ${phone.offered() ? html`<button type="button" class="btn" data-phone title="${t("ph.btn.tip")}">📱 ${t("sh.add.phone")}</button>` : ""}</div>
        <input type="file" accept="${traceAccept()}" hidden>
        <p class="hint">${t("sh.fitTip")}</p>
        <div class="tr-dlg-btns"><button type="button" class="btn" data-close>${t("sh.cancel")}</button></div></div></div>`;
    document.body.append(m);
    document.addEventListener("keydown", onKey, true);
    m.addEventListener("click", (e) => { if (e.target === m) close(); });
    $("[data-close]", m).addEventListener("click", close);
    const input = $("input[type=file]", m);
    $("[data-pc]", m).addEventListener("click", () => input.click());
    input.addEventListener("change", () => { const f = input.files[0]; close(); take(f); });
    $("[data-phone]", m)?.addEventListener("click", () => { close(); phone.open({ kind: "trace", multiple: false, onFiles: (f) => take(f[0]) }); });
    $("[data-pc]", m).focus();
  }
  async function uploadTests(files) {
    const boxU = $("#sh-upload"), errs = [], placed = new Map();
    // each file goes to the circuit it runs (owner, 2026-11-04: test tracks all sent to the circuit shown left the others' analyses
    // empty), else to the circuit shown; its number after the account's test tracks already there
    const testsOn = (n) => (allTraces || []).filter((x) => x.course === n && x.uid > 1e9 && Math.floor((x.uid - 1e9) / 1000) === you.uid).map((x) => (x.uid - 1e9) % 1000);
    const next = new Map();
    let ok = 0;
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const [i, file] of files.entries()) {
      boxU.innerHTML = html`<div class="notice">${t("sh.test.progress", { i: i + 1, n: files.length })}</div>`;
      try {
        const tr = parseTrace(file.name, await file.arrayBuffer());
        if (tr.source === "drawn") throw Object.assign(new Error(t("sh.trace.drawn")), { local: true });
        const sure = A.courses.length > 1 ? sureCircuit(matchCircuits(tr, A.courses)) : null, to = sure?.course || course;
        const crop = sure ? sure.crop : cropToMap(tr, to.geo, to.map.w, to.map.h);
        if (!crop) throw Object.assign(new Error(t("sh.trace.offMap")), { local: true });
        if (!next.has(to.n)) next.set(to.n, Math.max(0, ...testsOn(to.n), ...(to.n === course.n ? myTests().map((r) => (r.uid - 1e9) % 1000) : [])));
        const k = next.get(to.n) + 1;
        if (k > 999) throw Object.assign(new Error(t("sh.test.full")), { local: true });
        await api(`/${id}/trace/${to.n}`, { method: "PUT", body: { consent: true, test: k, trace: encodeTrace(tr, crop[0], crop[1]) }, key: keyOf(id) });
        next.set(to.n, k); placed.set(to.name, (placed.get(to.name) || 0) + 1);
        ok++;
      } catch (e) { errs.push(`${t("ui.colon", { a: file.name })} ${e.code ? errText(e) : e.local ? e.message : t(e.message === "time" ? "an.err.time" : "an.err.gpx")}`); }
    }
    const elsewhere = [...placed].filter(([name]) => name !== course.name);
    if (errs.length || elsewhere.length) alertBox([t("sh.test.done", { ok, n: files.length }), ...[...placed].map(([name, n]) => t("sh.test.placed", { course: name, n })), ...errs].join("\n"));
    // none on the circuit shown: the page goes to the one that got most
    if (ok) reload(placed.has(course.name) ? undefined : A.courses.find((c) => c.name === [...placed].sort((a, b) => b[1] - a[1])[0][0])?.n);
    else boxU.innerHTML = "";
  }
  async function upload(file) {
    const boxU = $("#sh-upload");
    let tr;
    try { tr = parseTrace(file.name, await file.arrayBuffer()); } catch (e) { boxU.innerHTML = html`<div class="notice">${t(e.message === "time" ? "an.err.time" : "an.err.gpx")}</div>`; return; }
    // a route drawn by hand on Ozimut (its GPX says so): not compared with the others' GPS traces (owner, 2026-11-02)
    if (tr.source === "drawn") { boxU.innerHTML = html`<div class="notice">${t("sh.trace.drawn")}</div>`; return; }
    // the circuit the track runs, when it is surely another than the one shown: sent there, and said
    const sure = A.courses.length > 1 ? sureCircuit(matchCircuits(tr, A.courses)) : null, to = sure && sure.course.n !== course.n ? sure.course : course;
    const crop = to !== course ? sure.crop : cropToMap(tr, course.geo, course.map.w, course.map.h);
    if (!crop) { boxU.innerHTML = html`<div class="notice">${t("sh.trace.offMap")}</div>`; return; }
    const enc = encodeTrace(tr, crop[0], crop[1]), t0 = enc.t0, t1 = t0 + enc.dt.reduce((s, v) => s + v, 0);
    boxU.innerHTML = html`<div class="notice sh-consent">${to !== course ? html`<p><b>${t("sh.offer.other", { course: to.name, k: sure.k, n: sure.n })}</b></p>` : ""}<p>${t("sh.trace.confirm", { a: hms(t0), b: hms(t1), n: enc.dt.length })}</p>
      <label class="an-opt"><input type="checkbox" id="sh-consent"> ${t("sh.trace.consent")}</label>
      ${A.visitors ? html`<label class="an-opt"><input type="checkbox" id="sh-consent-vis" ${raw(myRun()?.visitors ? "checked" : "")}> ${t("sh.visitors.mine")}</label>` : ""}
      <div class="row" style="gap:6px;margin-top:6px"><button type="button" class="btn btn-sm btn-primary" id="sh-send">${t("sh.trace.send")}</button><button type="button" class="btn btn-sm" id="sh-cancel">${t("sh.cancel")}</button></div></div>`;
    $("#sh-cancel").addEventListener("click", () => { boxU.innerHTML = ""; });
    $("#sh-send").addEventListener("click", async () => {
      if (!$("#sh-consent").checked) return;
      try { await api(`/${id}/trace/${to.n}`, { method: "PUT", body: { consent: true, trace: enc, note: myRun()?.note || "", visitors: !!$("#sh-consent-vis")?.checked }, key: keyOf(id) }); await ownPut(ownKey(id, to.n), file); reload(to.n); }
      catch (e) { boxU.innerHTML = html`<div class="notice">${errText(e)}</div>`; }
    });
  }
  function right() {
    const fromOpts = ctrls.map((p, i) => [i, i ? ctrlLabel(i) : "▷"]).slice(0, legsN);
    // the bar stays the whole course's in a leg's view (owner, 2026-11-07: as « Analyse solo »): the time line on the leg, the leg
    // and the way back to the whole course on the map's bottom left (hud), a start mode chosen going back to the whole course too
    const modeHint = t(`sh.mode.${mode}.hint`);
    $("#sh-bar").innerHTML = html`
      <div class="an-bar-row">
        ${legsN ? raw(legPickHtml("sh-legpick", Array.from({ length: legsN }, (_, k) => [k + 1, legName(k + 1)]), leg || -1)) : ""}
        <span class="sh-bar-opts">${html`<span class="sh-mode-pick"><button type="button" class="btn btn-sm sh-mode-btn" id="sh-mode-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${t("sh.mode")}" title="${t(`sh.mode.${mode}`)} — ${modeHint}">${raw(MODE_ICON[mode])}<span class="sh-caret">▾</span></button>
            <span class="sh-mode-menu" id="sh-mode-menu" role="menu" hidden>${modes.map((m) => html`<button type="button" role="menuitemradio" aria-checked="${m === mode}" data-mode="${m}" title="${t(`sh.mode.${m}.hint`)}">${raw(MODE_ICON[m])}<span>${t(`sh.mode.${m}`)}</span></button>`)}</span></span>
          ${mode === "from" ? html`<select id="sh-from" aria-label="${t("sh.from")}" title="${t("lg.from")}">${fromOpts.map(([i, l]) => html`<option value="${i}" ${raw(i === fromK ? "selected" : "")}>${l}</option>`)}</select>` : ""}`}</span>
        <span class="an-transport">
          <button type="button" class="btn btn-sm sh-pan${pan ? " on" : ""}" id="sh-pan" aria-pressed="${pan}" aria-label="${t(pan ? "sh.pan.stop" : "sh.pan.start")}" title="${t(pan ? "sh.pan.stop" : "sh.pan.start")} — ${t("sh.pan.tip")}">${raw(PAN_ICON)}</button>
          <button type="button" class="btn btn-sm" id="sh-prev" title="${t("sh.leg.prev")}">⏮</button>
          <button type="button" class="btn btn-sm btn-primary" id="sh-play" title="${t("an.play")}" aria-label="${t("an.play")}">${playing ? "⏸" : "▶"}</button>
          <button type="button" class="btn btn-sm" id="sh-next" title="${t("sh.leg.next")}">⏭</button>
          <select id="sh-speed" aria-label="${t("an.speed")}" title="${t("an.speed")}">${SPEEDS.map((s) => html`<option value="${s}" ${raw(s === speed ? "selected" : "")}>×${s}</option>`)}</select></span>
        <input type="range" class="an-bar-time" id="sh-time" min="${Math.floor(T0)}" max="${Math.ceil(T1)}" step="1" value="${Math.round(T)}" aria-label="${t("an.time")}">
        <span class="sh-clock"><b id="sh-t"></b> <span class="muted" id="sh-t-sub"></span></span>
        </div>`;
    const topAdd = $("#sh-top-add");
    if (topAdd) topAdd.innerHTML = you.visitor || A.readonly ? "" : html`${!canAdd ? "" : runners.some((r) => r.mine) ? html`<button type="button" class="btn btn-sm ico-btn" id="sh-bar-add" title="${t("sh.trace.replace")}" aria-label="${t("sh.trace.replace")}">${raw(iconLabel("add", t("sh.trace.replace")))}</button>`
      : html`<button type="button" class="btn btn-sm btn-primary ico-btn" id="sh-bar-add" title="${t("sh.trace.add")}" aria-label="${t("sh.trace.add")}">${raw(iconLabel("add", t("sh.trace.add")))}</button>`}`;
    // the one runner shown, coloured by runner: their colour can be chosen (owner, 2026-11-07)
    const shownNow = runners.filter((r) => r.visible), one = cmode() === "runner" && shownNow.length === 1 ? shownNow[0] : null;
    rightP.pane("display").innerHTML = html`
        <div class="an-opts">
          <label><span>${t("an.width")}</span><select id="sh-width">${WIDTHS.map(([w, k]) => html`<option value="${w}" ${raw(w === width ? "selected" : "")}>${t(k)}</option>`)}</select></label>
          <label><span>${t("an.colour")}</span><select id="sh-colour-by">${COLOUR_BY.filter((c) => (leg || !LEG_ONLY.includes(c)) && (c !== "variant" || variantsOn)).map((c) => html`<option value="${c}" ${raw(c === cmode() ? "selected" : "")} title="${c === "gap" ? t("an.colour.gap.tip") : ""}">${t(`sh.colourBy.${c}`)}</option>`)}</select></label>
          ${one ? html`<label id="sh-colour-row"><span>${t("an.traceColour")}</span><span class="an-swatches">${TRACE_PRESETS.map((c) => html`<button type="button" class="an-swatch" data-colour="${c}" style="background:${c}" aria-pressed="${c === one.colour}" title="${c}"></button>`)}<input type="color" id="sh-colour-pick" value="${one.colour}" title="${t("an.traceColour.any")}"></span></label>` : ""}
          <label title="${t("an.graph.tip")}"><span>${t("an.graph")}</span><select id="sh-graph">${GRAPHS.map((g) => html`<option value="${g}" ${raw(g === graph ? "selected" : "")}>${graphName(g)}</option>`)}</select></label>
          <label><span>${t("an.orient")}</span><select id="sh-orient"><option value="north" ${raw(orient === "north" ? "selected" : "")}>${t("an.orient.north")}</option><option value="leg" ${raw(orient === "leg" ? "selected" : "")}>${t("sh.orient.leg")}</option></select></label>
          <label><span>${t("an.future")}</span><select id="sh-future"><option value="hide" ${raw(future === "hide" ? "selected" : "")}>${t("an.future.hide")}</option><option value="faint" ${raw(future === "faint" ? "selected" : "")}>${t("an.future.faint")}</option></select></label>
          ${leg ? "" : html`<label><span>${t("an.tail")}</span><select id="sh-tail">${TAILS.map((s) => html`<option value="${s}" ${raw(s === tail ? "selected" : "")}>${s ? clock(s) : t("an.tail.all")}</option>`)}</select></label>`}
          <label><span>${t("an.mapAlpha")}</span><input type="range" id="sh-map-alpha" min="10" max="100" step="5" value="${mapAlpha}"></label>
          <label><span>${t("sh.traceAlpha")}</span><input type="range" id="sh-trace-alpha" min="10" max="100" step="5" value="${traceAlpha}"></label>
          <label><span>${t("sh.course.show")}</span><input type="checkbox" id="sh-course-on" ${raw(showCourse ? "checked" : "")}></label></div>
        <div id="sh-3d-opts" hidden></div>`;
    if (routesOn) rightP.pane("compute").innerHTML = html`<div id="rc-host"></div>`;
    if (!rightP.pane("export").childElementCount) exportPane();
    // adding one's track from the top line (addDialog); an administrator's test tracks only at the bottom of « Circuits » (owner, 2026-11-05)
    $("#sh-bar-add")?.addEventListener("click", addDialog);
    $("#sh-play").addEventListener("click", () => (playing ? stop() : play()));
    $("#sh-pan").addEventListener("click", () => { pan = !pan; if (pan) still = false; followMarks(); frame(); });
    bindLegPick($("#sh-legpick"), (v) => setLeg(v < 0 ? 0 : v));
    $("#sh-prev").addEventListener("click", () => setLeg(Math.max(1, (leg || 1) - (leg ? 1 : 0))));
    $("#sh-next").addEventListener("click", () => setLeg(Math.min(legsN, leg + 1)));
    $("#sh-speed").addEventListener("change", (e) => { speed = Number(e.target.value); });
    $("#sh-time").addEventListener("input", (e) => { T = Number(e.target.value); still = false; frame(); });
    const mb = $("#sh-mode-btn"), menu = $("#sh-mode-menu");
    if (mb && menu) {
      const off = (e) => { if (!menu.contains(e.target) && !mb.contains(e.target)) close(); };
      const close = () => { menu.hidden = true; mb.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", off, true); };
      mb.addEventListener("click", () => {
        if (!menu.hidden) { close(); return; }
        menu.hidden = false; mb.setAttribute("aria-expanded", "true"); document.addEventListener("pointerdown", off, true);
        (menu.querySelector('[aria-checked="true"]') || menu.querySelector("button"))?.focus();
      });
      menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); mb.focus(); } });
      menu.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { close(); mode = b.dataset.mode; if (leg) setLeg(0, true); else reset(); }));
    }
    $("#sh-from")?.addEventListener("change", (e) => { fromK = Number(e.target.value); if (leg) setLeg(0, true); else reset(); });
    $("#sh-tail")?.addEventListener("change", (e) => { tail = Number(e.target.value); savePrefs(); mv.draw(); });
    $("#sh-width").addEventListener("change", (e) => { width = Number(e.target.value); savePrefs(); mv.draw(); });
    $("#sh-future").addEventListener("change", (e) => { future = e.target.value; savePrefs(); mv.draw(); });
    $("#sh-graph").addEventListener("change", (e) => {
      graph = e.target.value; savePrefs();
      const b = $("#sh-strip-tog"); if (b) b.textContent = `${stripArrow(showStrip)} ${graphName(graph)}`;
      stripCache = null; drawStrip();
    });
    $("#sh-orient").addEventListener("change", (e) => { orient = e.target.value; savePrefs(); if (leg) setLeg(leg); else frame(); });
    $("#sh-map-alpha").addEventListener("input", (e) => { mapAlpha = Number(e.target.value); mv.setAlpha(mapAlpha / 100); savePrefs(); mv.draw(); });
    $("#sh-trace-alpha").addEventListener("input", (e) => { traceAlpha = Number(e.target.value); savePrefs(); mv.draw(); });
    $("#sh-course-on").addEventListener("change", (e) => { showCourse = e.target.checked; if (printed) courseOver = showCourse; else courseOn = showCourse; savePrefs(); mv.draw(); });
    for (const ev of ["pointerdown", "focus"]) $("#sh-colour-by").addEventListener(ev, () => needHeights(true), { once: true });
    $("#sh-colour-by").addEventListener("change", (e) => { colourBy = e.target.value; savePrefs(); legend(); right(); mv.draw(); });
    if (one) {
      const setColour = (c) => {
        one.colour = c; colours[one.uid] = c;
        try { localStorage.setItem(colKey, JSON.stringify(colours)); } catch (e) { /* this visit only */ }
        $$("#sh-colour-row .an-swatch").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.colour === c)));
        $("#sh-colour-pick").value = c;
        left(); legend(); mv.draw(); bottom.draw();
      };
      $$("#sh-colour-row .an-swatch").forEach((b) => b.addEventListener("click", () => setColour(b.dataset.colour)));
      $("#sh-colour-pick").addEventListener("input", (e) => setColour(e.target.value));
    }
    rcmPanel(); opts3d();
  }
  /** « Export » (owner, 2026-11-05): an image of the map with what it shows, and one's own run with the map into « Mes cartes ». */
  function exportPane() {
    const pane = rightP.pane("export"), mine = myRun(), me = auth.session();
    pane.innerHTML = html`
      <div class="an-opts an-shot"><b>${t("an.shot.title")}</b>
        <label><span>${t("an.shot.zone")}</span><select id="sh-shot-zone"><option value="view" ${raw(shot.zone === "view" ? "selected" : "")}>${t("sh.shot.zone.view")}</option><option value="race" ${raw(shot.zone === "race" ? "selected" : "")}>${t("an.shot.zone.race")}</option><option value="map" ${raw(shot.zone === "map" ? "selected" : "")}>${t("an.shot.zone.map")}</option></select></label>
        <label><span>${t("an.shot.type")}</span><select id="sh-shot-type"><option value="png" ${raw(shot.type === "png" ? "selected" : "")}>PNG</option><option value="jpeg" ${raw(shot.type === "jpeg" ? "selected" : "")}>JPEG</option></select></label>
        <label><span>${t("an.shot.legend")}</span><input type="checkbox" id="sh-shot-legend" ${raw(shot.legend ? "checked" : "")}></label>
        <p class="hint" style="margin:0">${t("sh.shot.hint")}</p>
        <button type="button" class="btn btn-sm btn-primary" id="sh-shot">⤓ ${t("an.shot.save")}</button><span class="muted an-shot-state" id="sh-shot-state"></span></div>
      ${you.visitor || !mymapsOn || !me || me.demo ? "" : mine ? html`<div id="sh-mymaps"></div>`
        : html`<div class="an-opts"><b>${t("nav.myMaps")}</b><p class="hint" style="margin:0">${t("sh.mymaps.noRun")}</p></div>`}`;
    const set = () => { shot.zone = $("#sh-shot-zone").value; shot.type = $("#sh-shot-type").value; shot.legend = $("#sh-shot-legend").checked; savePrefs(); };
    ["#sh-shot-zone", "#sh-shot-type", "#sh-shot-legend"].forEach((s) => $(s).addEventListener("change", set));
    $("#sh-shot").addEventListener("click", exportImage);
    // « Enregistrer dans Mes cartes » (owner, 2026-11-04: an organiser's switch): one's run on the organiser's map, as « Analyse
    // solo » saves it (trace/mymapsave.js) — the map as stored, one's route in its pixels with its times
    if ($("#sh-mymaps")) import("../trace/mymapsave.js").then((M) => M.mount($("#sh-mymaps"), () => {
      const r = myRun(), ext = /png/.test(mapBlob?.type) ? "png" : /webp/.test(mapBlob?.type) ? "webp" : "jpg";
      return { file: mapBlob ? new File([mapBlob], `${course.name || "map"}.${ext}`, { type: mapBlob.type }) : null, image, track: r?.tr, pxs: r?.pxs, pys: r?.pys,
        offset: r?.start ?? null, total: r && r.finish != null ? r.finish - r.start : null, geo: course.geo, title: [A.title, course.name].filter(Boolean).join(" · "),
        controls: r ? ctrls.map((p, j) => ({ k: p.kind, x: p.x, y: p.y, t: r.passes[j] != null ? r.passes[j] - r.start : null })) : [] };
    })).catch((e) => console.error(e));
  }
  /** The map as the replay shows it now (the runners shown, the course, the routes…), at the map's own resolution, north up: the
   *  part in view or all of it; lines in the map's millimetres (a control circle is 6 mm across). */
  function exportImage() {
    if (!image) return;
    const W = image.width, H = image.height;
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (shot.zone === "view") {
      const { w, h } = mv.box(), cs = [[0, 0], [w, 0], [w, h], [0, h]].map(([a, b]) => mv.toImg(a, b));
      const bx = [Math.max(0, Math.floor(Math.min(...cs.map((p) => p[0])))), Math.max(0, Math.floor(Math.min(...cs.map((p) => p[1])))),
        Math.min(W, Math.ceil(Math.max(...cs.map((p) => p[0])))), Math.min(H, Math.ceil(Math.max(...cs.map((p) => p[1]))))];
      if (bx[2] - bx[0] > 20 && bx[3] - bx[1] > 20) [x0, y0, x1, y1] = bx;
    } else if (shot.zone === "race") {                  // the routes of the runners shown and the course, with a margin
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      const add = (x, y) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); };
      for (const r of runners.filter((x) => x.visible)) { const i1 = indexAt(r.tr, r.finish ?? r.tr.dur); for (let i = indexAt(r.tr, r.start); i <= i1; i++) add(r.pxs[i], r.pys[i]); }
      for (const p of ctrls) add(p.x, p.y);
      const m = Math.max(40, 0.06 * Math.max(c - a, d - b));
      const bx = [Math.max(0, Math.floor(a - m)), Math.max(0, Math.floor(b - m)), Math.min(W, Math.ceil(c + m)), Math.min(H, Math.ceil(d + m))];
      if (bx[2] - bx[0] > 20 && bx[3] - bx[1] > 20) [x0, y0, x1, y1] = bx;
    }
    const k = Math.min(1, Math.sqrt(40e6 / ((x1 - x0) * (y1 - y0))));
    const cw = Math.round((x1 - x0) * k), ch = Math.round((y1 - y0) * k);
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, cw, ch);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.globalAlpha = mapAlpha / 100; g.drawImage(image, 0, 0); g.globalAlpha = 1;
    g.lineCap = "round"; g.lineJoin = "round";
    const mm = (course.r || 20) / 3;
    drawOver(g, mv.view, (p) => Math.max(p * 0.2 * mm, 0.6 / k));
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    const shown = runners.filter((r) => r.visible);
    const title = [A.title, course.name].filter(Boolean).join(" · ");
    if (shot.legend) {
      const fs = Math.max(12, Math.min(40, Math.round(Math.min(cw, ch) / 42))), pad = Math.round(fs * 0.6);
      const panel = (x, y, w, h) => { g.fillStyle = "rgba(255, 255, 255, 0.9)"; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, pad); else g.rect(x, y, w, h); g.fill(); };
      const font = (px, bold) => { g.font = `${bold ? "650 " : ""}${px}px system-ui, sans-serif`; };
      const lines = [[title, true], [[A.date ? fmtDate(A.date) : "", leg ? legName(leg) : ""].filter(Boolean).join(" · "), false]].filter(([s]) => s);
      // the runners' colours, when each runner has their own (a dozen at most)
      const names = cmode() === "runner" && shown.length <= 12 ? shown.map((r) => [r.colour, r.test ? initials(r) : r.name]) : [];
      g.textBaseline = "top";
      let tw = 0;
      for (const [s, b] of lines) { font(fs, b); tw = Math.max(tw, g.measureText(s).width); }
      font(Math.round(fs * 0.85)); for (const [, n] of names) tw = Math.max(tw, g.measureText(n).width + fs * 1.3);
      font(Math.round(fs * 0.7)); tw = Math.max(tw, g.measureText("ozimut.com").width);
      const lh = Math.round(fs * 1.3), nh = Math.round(fs * 1.1), th = lines.length * lh + names.length * nh + Math.round(fs * 0.9);
      panel(pad, pad, Math.min(cw - 2 * pad, tw + 2 * pad), th + pad);
      g.fillStyle = "#1d1d1d";
      lines.forEach(([s, b], n) => { font(fs, b); g.fillText(s, 2 * pad, 1.5 * pad + n * lh, cw - 4 * pad); });
      let y = 1.5 * pad + lines.length * lh;
      font(Math.round(fs * 0.85));
      for (const [c, n] of names) { g.fillStyle = c; g.fillRect(2 * pad, y + fs * 0.2, fs * 0.9, fs * 0.5); g.fillStyle = "#1d1d1d"; g.fillText(n, 2 * pad + fs * 1.3, y, cw - 4 * pad - fs * 1.3); y += nh; }
      font(Math.round(fs * 0.7)); g.fillStyle = "#e8641c"; g.fillText("ozimut.com", 2 * pad, y);
    }
    const slug = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const type = shot.type === "jpeg" ? "jpeg" : "png", name = `ozimut-${A.date || "carte"}${slug(title) ? `-${slug(title)}` : ""}${leg ? `-${leg}` : ""}.${type === "jpeg" ? "jpg" : "png"}`;
    const state = $("#sh-shot-state");
    if (state) state.textContent = t("an.shot.making");
    cv.toBlob((blob) => {
      if (!blob) { if (state) state.textContent = t("an.shot.failed"); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      if (state) state.textContent = t("an.shot.done", { w: fmt(cw), h: fmt(ch) });
    }, `image/${type}`, 0.92);
  }
  function hud() {
    const sl = $("#sh-time"); if (sl) sl.value = String(Math.round(T));
    const label = mode === "clock" && !leg ? hms(T) : T < 0 ? `−${clock(-T)}` : clock(T);
    const tt = $("#sh-t"); if (tt) tt.textContent = label;
    // the leg at the map's bottom left (owner, 2026-11-07): the leg shown, with the way back to the whole course, or the leg the
    // runners wait at the end of; it was beside the time
    const legNow = leg ? legName(leg) : mode === "wait" || mode === "waitpause" ? (() => { let j = 1; while (j < legsN && T >= waits[j]) j++; return legName(j); })() : "";
    const chip = $("#sh-legchip");
    if (chip) { $("#sh-legchip-t").textContent = legNow; chip.hidden = !legNow; $("#sh-leg-all").hidden = !leg; }
    stats();
  }
  /** The runner followed, at the replay's time: their race time, leg, pace over the last 30 s and distance run (owner, 2026-11-05:
   *  as « Analyse solo » says of its trace), in the pace's bar under the map — the runner followed, else the one runner shown
   *  (owner, 2026-11-05: a runner chosen alone on the map showed nothing); nothing with several and none followed. */
  // the climb since the start (owner, 2026-11-08), from the terrain model's heights under the route (the shared traces keep no
  // altitude); « — » until they are loaded (asked 1.5 s after the opening)
  function climbSo(r, at) {
    const h = hseries(r, "ele");
    if (!h) return "—";
    const cu = (r.climb ||= cumClimb(r.tr, h));
    return fmt(Math.max(0, cu[indexAt(r.tr, at)] - cu[indexAt(r.tr, r.start)]));
  }
  function stats() {
    const el = $("#sh-stats");
    if (!el) return;
    const shown = runners.filter((x) => x.visible);
    const r = follow === "sel" && sel?.visible ? sel : shown.length === 1 ? shown[0] : null, s = r ? sAt(r, T) : null;
    if (!r || s == null) { if (el.textContent) el.innerHTML = ""; return; }
    const end = r.finish ?? r.tr.dur, at = Math.max(r.start, Math.min(end, s)), win = Math.min(30, at - r.start);
    let j = 0;
    while (j < legsN && r.passes[j + 1] != null && at >= r.passes[j + 1]) j++;
    const d = cumAt(r.tr, at) - cumAt(r.tr, r.start);
    const stat = (label, v) => html`<span class="an-stat"><span class="muted">${label}</span> <b>${v}</b></span>`;
    el.innerHTML = html`<span class="sh-stats-name"><span class="sh-swatch" style="background:${r.colour}"></span>${r.test ? initials(r) : r.name}</span>
      ${stat(t("an.time"), clock(Math.max(0, at - r.start)))}${score ? "" : stat(t("an.leg"), j < legsN ? legName(j + 1) : t("an.finish"))}
      ${stat(t("an.pace"), win >= 5 ? pace((cumAt(r.tr, at) - cumAt(r.tr, at - win)) / win) : "—")}
      ${stat(t("an.dist"), `${fmt(d >= 1000 ? d / 1000 : d, d >= 1000 ? 2 : 0)} ${d >= 1000 ? "km" : "m"}`)}
      ${html`<span class="an-stat" title="${t("an.climbSo.tip")}"><span class="muted">${t("an.climbSo")}</span> <b>${climbSo(r, at)}</b> <span class="muted">m</span></span>`}`.toString();
  }
  function reset() { stop(); [T0, T1] = range(); T = T0; right(); frame(); }
  // the whole course as it was left when a leg was opened — its view, time and whether it was still —, found again on the way back
  // (owner, 2026-11-08: « when back to the whole parcours, settings go back »); a change of start mode starts afresh
  let wholeWas = null;
  function setLeg(j, fresh = false) {
    if (j && !leg) wholeWas = { view: { ...mv.view }, T, still };
    const back = !j && leg && !fresh ? wholeWas : null;
    if (!j) wholeWas = null;
    leg = j; stop(); [T0, T1] = range(); T = T0;
    turn();                                                   // the map turned to the leg before it is fitted
    if (back) {
      mv.view = back.view; T = Math.min(T1, Math.max(T0, back.T)); still = back.still;
      legend(); left(); right(); frame(); bottom.draw();
      if (rcm.on) rcmLeg();
      return;
    }
    if (leg) {
      fitLeg();
    } else fitRoutes();
    // the view fitted stays until the replay is played or its time moved (owner, 2026-11-05: following, the map was centred on the
    // runners, all at the leg's first control)
    still = true;
    legend(); left(); right(); frame(); bottom.draw();
    if (rcm.on) rcmLeg();
  }
  /** The view on the leg shown: its two controls, their circles whole, and the shown runners' routes on it. */
  function fitLeg() {
    const R = (course.r || 20) * 1.3, xs = [], ys = [];
    for (const p of [ctrls[leg - 1], ctrls[leg]]) { xs.push(p.x - R, p.x + R); ys.push(p.y - R, p.y + R); }
    for (const r of runners) { if (!r.visible || legTime(r, leg) == null) continue; const a = indexAt(r.tr, r.passes[leg - 1]), b = indexAt(r.tr, r.passes[leg]); for (let i = a; i <= b; i++) { xs.push(r.pxs[i]); ys.push(r.pys[i]); } }
    mv.fitPoints(xs, ys, 60, 4);
  }
  function fitRoutes() {
    const xs = ctrls.map((p) => p.x), ys = ctrls.map((p) => p.y);
    mv.fitBox(Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 40, Math.max(...ys) + 40, 20, 4);
  }
  function play() {
    still = false;
    if (T >= T1 - 0.5) T = T0;
    playing = true; last = performance.now();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!box.isConnected) { stop(); return; }
      const now = performance.now();
      const was = T;
      T = Math.min(T1, T + ((now - last) / 1000) * speed); last = now;
      // waiting and pausing at the controls (owner, 2026-11-05): the replay stops where everyone sets off from a control
      if (!leg && mode === "waitpause") { const w = waits.slice(1, -1).find((x) => was < x && T >= x); if (w != null) { T = w; frame(); stop(); return; } }
      frame();
      if (T >= T1) stop();
    }, 40);
    const b = $("#sh-play"); if (b) b.textContent = "⏸";
  }
  function stop() { playing = false; clearInterval(timer); timer = 0; const b = $("#sh-play"); if (b) b.textContent = "▶"; video?.sync(true); saveUrl(); }

  // ---- route choices on a leg (trace/routes.js): the organiser's grouping shared on the server, with the circuit (every
  // runner sees it); anyone's own edits kept on their device (localStorage, per analysis and circuit), over the
  // organiser's — a runner's tags are theirs, need no right to write, and change nothing for the others
  const VAR_KEY = `ocn.sh.var.${id}.${course.n}`;
  let serverTags = course.variants && typeof course.variants === "object" ? course.variants : {};
  let localTags = (() => { try { return JSON.parse(localStorage.getItem(VAR_KEY) || "{}") || {}; } catch (e) { return {}; } })();
  const saveLocalTags = () => { try { localStorage.setItem(VAR_KEY, JSON.stringify(localTags)); } catch (e) { /* this visit only */ } };
  const pxPerM = runners[0]?.fit.scale || 1;
  const varCache = new Map();
  function variantsOf(j) {
    const tags = localTags[j] ?? serverTags[j] ?? null, ck = `${j}|${JSON.stringify(tags)}`;
    if (varCache.has(ck)) return varCache.get(ck);
    const a = ctrls[j - 1], b = ctrls[j], straight = Math.hypot(b.x - a.x, b.y - a.y) / pxPerM;
    const auto = Math.round(Math.max(30, Math.min(120, 0.2 * straight)));
    const items = runners.filter((r) => legTime(r, j) != null).map((r) => {
      const i0 = indexAt(r.tr, r.passes[j - 1]), i1 = indexAt(r.tr, r.passes[j]);
      return { uid: r.uid, time: legTime(r, j), len: cumAt(r.tr, r.passes[j]) - cumAt(r.tr, r.passes[j - 1]),
        pts: resample(r.pxs, r.pys, i0, Math.max(i0, i1), 32).map(([x, y]) => [x / pxPerM, y / pxPerM]) };
    });
    const V = { ...legVariants(items, Number.isFinite(tags?.th) ? tags.th : auto, tags), auto, items, local: localTags[j] != null, shared: serverTags[j] != null };
    V.list.forEach((v) => { const ls = items.filter((it) => v.uids.includes(it.uid)).map((it) => it.len); v.len = ls.reduce((s, x) => s + x, 0) / (ls.length || 1); });
    varCache.set(ck, V);
    return V;
  }
  async function shareVariants(j) {
    const next = { ...serverTags };
    if (localTags[j]) next[j] = localTags[j]; else delete next[j];
    await api(`/${id}/extras/${course.n}`, { method: "PUT", body: { variants: next }, key: keyOf(id) });
    serverTags = next; course.variants = next;
    delete localTags[j]; saveLocalTags(); varCache.clear();
  }

  // ---- corridor and compass exercises (trace/corridor.js), a training event's: stored with the circuit on the server
  // (the organiser's), a runner may try another width for themself (this visit only)
  let exercises = A.kind === "club" && Array.isArray(course.exercises) ? course.exercises : [], draft = null;
  const exW = {}, devCache = new Map();
  const exOf = (id2) => exercises.find((e) => e.id === id2) || null;
  const exWidth = (e) => exW[e.id] ?? e.w;
  /** An exercise's line in metres (the map's px over its scale): a corridor's drawn line, a compass leg's two controls. */
  const exLinePx = (e) => (e.kind === "compass" ? (e.leg && ctrls[e.leg] ? [[ctrls[e.leg - 1].x, ctrls[e.leg - 1].y], [ctrls[e.leg].x, ctrls[e.leg].y]] : []) : e.pts || []);
  const exLine = (e) => exLinePx(e).map(([x, y]) => [x / pxPerM, y / pxPerM]);
  /** Runner r's route for an exercise: its leg; on the whole course, the stretch from where the runner passes closest to the
   *  line's start to where they then pass closest to its end (owner, 2026-11-05: a corridor along one leg was scored against the
   *  whole race, 8 % inside); metres and trace seconds. */
  function exRoute(r, e, line) {
    const a = e.leg ? r.passes[e.leg - 1] : r.start, b = e.leg ? r.passes[e.leg] : r.finish ?? r.tr.dur;
    if (a == null || b == null || b <= a) return null;
    let i0 = indexAt(r.tr, a), i1 = indexAt(r.tr, b);
    if (!e.leg && line?.length >= 2) {
      const near = ([x, y], from) => { let bi = from, bd = Infinity; for (let i = from; i <= i1; i++) { const d = Math.hypot(r.pxs[i] / pxPerM - x, r.pys[i] / pxPerM - y); if (d < bd) { bd = d; bi = i; } } return bi; };
      const s = near(line[0], i0), f = near(line[line.length - 1], s);
      if (f > s) { i0 = s; i1 = f; }
    }
    const xs = [], ys = [], ts = [];
    for (let i = i0; i <= i1; i++) { xs.push(r.pxs[i] / pxPerM); ys.push(r.pys[i] / pxPerM); ts.push(r.tr.t[i]); }
    return xs.length >= 2 ? { xs, ys, ts } : null;
  }
  function exScores(e) {
    const line = exLine(e), w = exWidth(e);
    if (line.length < 2) return [];
    return runners.map((r) => {
      const ck = `${e.id}|${JSON.stringify(line)}|${e.leg}|${r.uid}`;
      if (!devCache.has(ck)) { const rt = exRoute(r, e, line); devCache.set(ck, rt ? deviations(rt, line) : null); }
      const D = devCache.get(ck);
      if (!D) return null;
      return { r, ...corridorScore(D, w), bearing: e.kind === "compass" ? bearingError(D.route, line[0], line[1]) : null };
    }).filter(Boolean);
  }
  function drawExercise(g, lw) {
    const e = draft || (bottom?.tab() === "exercises" ? exOf(state.ex) : null);
    if (!e) return;
    const L = exLinePx(e);
    if (!L.length) return;
    g.save(); g.strokeStyle = "#2b8a3e"; g.lineCap = "round"; g.lineJoin = "round";
    if (L.length >= 2) {
      g.globalAlpha = 0.2; g.lineWidth = exWidth(e) * pxPerM; g.beginPath(); L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.globalAlpha = 0.9; g.lineWidth = lw(1.5); g.setLineDash([lw(6), lw(4)]); g.beginPath(); L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
    }
    if (draft) { g.fillStyle = "#2b8a3e"; g.globalAlpha = 1; for (const [x, y] of L) { g.beginPath(); g.arc(x, y, lw(4), 0, 2 * Math.PI); g.fill(); } }
    g.restore();
  }
  async function saveExercises(list) {
    await api(`/${id}/extras/${course.n}`, { method: "PUT", body: { exercises: list }, key: keyOf(id) });
    exercises = list; course.exercises = list; devCache.clear();
  }

  // ---- the route choices computed (trace/routeplan.js; administrators only, a prototype — 2026-10-24): the leg shown's
  // fastest routes on the map as read, each runner's own route measured on the same model
  const rcm = { s: RC.loadSettings(RC.isSprint(race) ? "sprint" : "forest"), on: routesOn && (() => { try { return localStorage.getItem("ocn.rc.on") !== "0"; } catch (e) { return true; } })(),
    plan: null, ready: null, pic: null, picOn: false, routes: [], mine: [], auto: [], token: 0, status: "", prog: null, warn: "", dem: null, info: null,
    decOn: RC.decisionOn(), dec: null, decAsk: "", calib: null, calibKey: "", calibP: null,
    vec: null,                                          // an OCAD or Mapper map of the analysis's map, this visit only
    stored: course.layers?.map && course.layers.map === course.map?.v ? undefined : null };   // the circuit's own layers (loaded once)
  // the map's pixels to metres and to longitude and latitude, from its georeference
  const geoInv = (() => { const g = course.geo, det = g.a * g.e - g.b * g.d; return (x, y) => { const u = x - g.c, v = y - g.f; return [(g.e * u - g.b * v) / det, (g.a * v - g.d * u) / det]; }; })();
  const rcmFrame = runners[0]?.fit || (() => { const [lon, lat] = geoInv(image.width / 2, image.height / 2); return fitFromGeo(course.geo, frameAt(lat, lon)); })();
  const rcmPace = () => RC.paceOf(rcm.s, rcm.auto[leg]);
  const rcmStatus = (text, frac = null) => {
    rcm.status = text; rcm.prog = frac; RC.setStatus(text, frac);
    const w = $("#rc-leg .rc-wait");                       // the Itinéraires tab, while it has no route to show, says where the work is
    if (w) w.innerHTML = rcmWait();
  };
  const rcmWait = () => html`<p class="hint sp-hint">${rcm.status || t("rc.tab.wait")}</p>${raw(rcm.prog != null ? bar(rcm.prog) : "")}`;
  const rcmFacts = (facts) => { rcm.info = { ...rcm.info, ...facts }; rcm.warn = RC.readingWarning(rcm.info, rcm.s); RC.setWarning(rcm.warn); };
  const rcmReading = (f) => rcmStatus(t("rc.st.readingPct", { p: Math.round(100 * f) }), f);
  /** The decision map of the leg shown, asked of the worker once (null until it has come: the map is drawn again then). */
  function rcmDecision(j) {
    if (!rcm.decOn || !rcm.plan || !j || !rcm.routes[j]) return null;
    const a = ctrls[j - 1], b = ctrls[j], key = `${rcm.token}|${j}`;
    if (rcm.dec?.key === key) return rcm.dec;
    if (rcm.decAsk !== key) {
      rcm.decAsk = key;
      rcm.plan.decision([a.x, a.y], [b.x, b.y]).then((d) => { if (rcm.decAsk === key && d) { rcm.dec = { key, ...d }; mv.draw(); } }).catch((e) => console.warn(e));
    }
    return null;
  }
  function rcmPanel() {
    const host = $("#rc-host");
    if (!host) return;
    const vt = rcmVector();
    host.innerHTML = html`${raw(RC.panelHtml(rcm.s, { on: rcm.on, picture: rcm.picOn, decision: rcm.decOn, status: rcm.status, progress: rcm.prog, warn: rcm.warn, auto: rcm.auto[leg],
      vector: rcm.vec ? { name: rcm.vec.v.name, detail: rcm.vec.detail, used: !!vt, note: vt ? "" : t(rcm.vec.v.geo ? "rc.vec.elsewhere" : "an.vec.noGeoRoutes") }
        : rcm.stored ? { name: t("rc.vec.stored"), detail: t("rc.vec.storedDetail"), used: true, fixed: true } : null,
      calib: RC.calibNote(rcm.s, rcm.calib, true) }))}`;
    RC.showFitted(rcm.s, rcm.calib);
    RC.bindPanel(host, rcm.s, async (s, what, file) => {
      if (what === "vector" || what === "vector-clear") {
        if (what === "vector") {
          try { const v = await readVector(new Uint8Array(await file.arrayBuffer()), file.name); rcm.vec = { v, detail: `${v.format === "ocad" ? `OCAD ${v.version}` : "OpenOrienteering Mapper"} · 1:${fmt(v.scale)}` }; }
          catch (e) { console.error(e); rcmStatus(t("rc.vec.failed")); return; }
        } else rcm.vec = null;
        // the map read again, from the symbols (or the image's colours)
        rcm.token++; rcm.plan?.destroy(); rcm.plan = null; rcm.ready = null; rcm.pic = null; rcm.routes = []; rcm.mine = []; rcm.auto = [];
        rcmPanel(); mv.draw();
        if (rcm.on) rcmLeg();
        return;
      }
      if (what === "on" || what === "off") {
        rcm.on = what === "on";
        try { localStorage.setItem("ocn.rc.on", rcm.on ? "1" : "0"); } catch (e) { /* this visit */ }
        if (rcm.on) rcmLeg(); else { rcm.token++; mv.draw(); rcmList(); }
      } else if (what === "picture-on") { rcm.picOn = true; rcmPicture(); }
      else if (what === "picture-off") { rcm.picOn = false; rcm.pic = null; mv.draw(); }
      else if (what === "decision-on" || what === "decision-off") {
        rcm.decOn = what === "decision-on"; rcm.dec = null; rcm.decAsk = ""; mv.draw();
        if (rcm.decOn && !leg && !runLeg()) rcmStatus(t("rc.decision.pickLeg"));     // a leg's map: nothing to draw on the whole course yet
      }
      else if (what === "pace") { rcmList(); mv.draw(); }
      else { if (what === "reset") rcmPanel(); rcm.routes = []; rcm.mine = []; rcm.auto = []; rcmLeg(); }
    });
    rcmList();
  }
  /** The OCAD or Mapper map placed on the analysis's map through both georeferences, or null. */
  function rcmVector() {
    if (!rcm.vec) return null;
    const g = course.geo, T = throughGeo(rcm.vec.v, (lat, lon) => [g.a * lon + g.b * lat + g.c, g.d * lon + g.e * lat + g.f]);
    return T && cover(rcm.vec.v, T, image.width, image.height) >= 0.2 ? { v: rcm.vec.v, T } : null;
  }
  /** The layers the organiser's publication drew from the OCAD map of this circuit (owner, 2026-11-05), once; null without. */
  async function rcmStored() {
    if (rcm.stored !== undefined) return rcm.stored;
    rcmStatus(t("rc.st.layers"), 0);
    try {
      const { unpackLayers } = await import("../trace/vectorroutes.js");
      const L = await unpackLayers(await (await api(`/${id}/layers/${course.n}?v=${course.map.v}`, { key: keyOf(id) })).arrayBuffer());
      rcm.stored = L && L.w === image.width && L.h === image.height ? L : null;
    } catch (e) { console.warn(e); rcm.stored = null; }
    rcmPanel();
    return rcm.stored;
  }
  /** The map read, once: a file dropped in « Calcul », else the circuit's stored layers, else the image's colours. */
  function rcmPlan() {
    if (rcm.ready) return rcm.ready;
    rcm.demKey = null;
    rcm.ready = (async () => {
      const vt = rcmVector() || (await rcmStored().then((L) => (L ? { layers: L, name: t("rc.vec.storedIn") } : null)));
      rcm.plan = RC.planner(image, (x, y) => toM(rcmFrame, x, y), vt, { map: rcm.s.map, onProgress: rcmReading });
      rcmStatus(t("rc.st.reading"), 0);
      rcm.info = null;
      rcmFacts(await rcm.plan.ready);
    })();
    return rcm.ready;
  }
  /** The heights: the model's grid, once, refined by the map's contours as the settings ask (again when they change). */
  function rcmDem() {
    const key = `${rcm.s.relief}|${rcm.s.interval}`;
    if (rcm.demKey === key) return rcm.demP;
    rcm.demKey = key;
    rcm.demP = (async () => {
      if (rcm.grid === undefined) {
        rcmStatus(t("rc.st.relief"), 0);
        try { rcm.grid = await heights3d((f) => rcmStatus(t("rc.st.reliefPct", { p: Math.round(100 * f) }), f)); }
        catch (e) { console.warn(e); rcm.grid = null; }
      }
      if (!rcm.grid) { rcm.dem = "none"; return; }
      rcm.dem = rcm.grid.source;
      if (rcm.s.relief !== "dem") rcmStatus(t("rc.st.contoursReading"));
      const r = await RC.reliefGrid(image, rcm.grid, (x, y) => toM(rcmFrame, x, y), rcm.s);
      rcm.pieces = r.pieces;
      await rcm.plan.dem(r.grid);
    })();
    return rcm.demP;
  }
  /**
   * The group's calibration (owner, 2026-11-01): every leg of the circuit and every runner's route on it laid on the map, then
   * the speeds on paths and the climb's cost fitted on the whole group, a pace for each runner (routeplan.calibrate). Once per
   * settings, relief and map; the routes of the legs then follow the group's speeds.
   */
  function rcmCalibrate(my) {
    const key = JSON.stringify([rcm.s, rcm.demKey, !!rcm.vec]);
    if (rcm.calibKey === key) return rcm.calibP;
    rcm.calibKey = key;
    rcm.calibP = (async () => {
      const samples = [];
      await rcm.plan.settings(rcm.s);
      for (let j = 1; j <= legsN; j++) {
        if (my !== rcm.token) { rcm.calibKey = ""; return null; }
        rcmStatus(t("rc.st.calibGroup", { n: j - 1, t: legsN }), (j - 1) / legsN);
        const a = ctrls[j - 1], b = ctrls[j], routes = await rcm.plan.leg([a.x, a.y], [b.x, b.y]);
        if (!routes) continue;
        for (const r of runners) {
          const d = legTime(r, j);
          if (d == null) continue;
          const i0 = indexAt(r.tr, r.passes[j - 1]), i1 = indexAt(r.tr, r.passes[j]), pts = [];
          for (let i = i0; i <= i1; i++) pts.push([r.pxs[i], r.pys[i]]);
          if (pts.length < 2) continue;
          const m = await rcm.plan.match([a.x, a.y], [b.x, b.y], pts, RC.matchTol(null), routes);
          if (m?.snapped !== false) samples.push({ who: r.uid, actual: d, parts: m.parts });
        }
      }
      return RC.calibrate(samples);
    })();
    return rcm.calibP;
  }
  /** The settings the routes are searched with: the group's calibration applied when it holds. */
  const rcmSettings = () => (rcm.s.calib && rcm.calib?.ok ? RC.calibrated(rcm.s, rcm.calib) : rcm.s);
  /** The leg shown: its routes, and each runner's measured (their median pace when none is typed); the whole course shown, every
   *  leg in turn, listed as they come (owner, 2026-11-04: « I would expect to see the route choices calculated below »). */
  async function rcmLeg() {
    if (!rcm.on) return;
    const my = ++rcm.token;
    try {
      await rcmPlan();
      await rcmDem();
      if (my !== rcm.token) return;
      const facts = await rcm.plan.settings(rcm.s, rcmReading);
      if (my !== rcm.token) return;
      await rcm.plan.controls(ctrls.map((p) => [p.x, p.y]));
      if (my !== rcm.token) return;
      if (facts) { rcmFacts(facts); rcm.pic = null; }
      rcm.calib = rcm.s.calib ? await rcmCalibrate(my) : null;
      if (my !== rcm.token) return;
      RC.setCalib(RC.calibNote(rcm.s, rcm.calib, true), rcm.s, rcm.calib);
      await rcm.plan.settings(rcmSettings());
      if (my !== rcm.token) return;
      const t0 = performance.now();
      const todo = leg ? [leg] : Array.from({ length: legsN }, (_, i) => i + 1);
      for (const [i, j] of todo.entries()) {
        if (my !== rcm.token) return;
        if (rcm.routes[j] === undefined || !rcm.mine[j]) {
          rcmStatus(leg ? t("rc.st.computing") : t("rc.st.legsOf", { k: i + 1, n: todo.length }), leg ? 0.5 : i / todo.length);
          if (!(await rcmOne(j, my))) return;
        }
        if (!leg) rcmList();
      }
      rcmStatus(t("rc.st.leg", { s: fmt((performance.now() - t0) / 1000, 1), c: fmt(rcm.info.mpc, 1),
        r: rcm.dem && rcm.dem !== "none" ? RC.reliefNote(CREDIT[rcm.dem]?.text || rcm.dem, rcm.pieces) : t("rc.st.flat") }) + (rcm.info.vector ? ` · ${t("rc.st.symbols", { f: rcm.info.vector.name })}` : "")
        + (rcm.info.north ? ` · ${tn("rc.st.north", rcm.info.north)}` : ""));
      const p = $("#rc-pace"); if (p && rcm.auto[leg]) p.placeholder = RC.minKm(rcm.auto[leg]);
      if (rcm.picOn && !rcm.pic) rcmPicture();
      rcmList(); mv.draw();
    } catch (e) { console.error(e); if (my === rcm.token) rcmStatus(t("rc.st.failed")); }
  }
  /** The routes switched on (as « Calcul »'s box does), and computed. */
  function rcmTurnOn() {
    rcm.on = true;
    try { localStorage.setItem("ocn.rc.on", "1"); } catch (e) { /* this visit */ }
    rcmPanel();
    rcmLeg();
  }
  /** One leg's routes and the runners' own on it; false when a newer computation took over. */
  async function rcmOne(j, my) {
    {
      const a = ctrls[j - 1], b = ctrls[j], routes = await rcm.plan.leg([a.x, a.y], [b.x, b.y]);
      if (my !== rcm.token) return false;
      rcm.routes[j] = routes;
      const mine = new Map(), pairs = [];
      for (const r of runners) {
        const d = legTime(r, j);
        if (d == null || !routes) continue;
        const i0 = indexAt(r.tr, r.passes[j - 1]), i1 = indexAt(r.tr, r.passes[j]), pts = [];
        for (let i = i0; i <= i1; i++) pts.push([r.pxs[i], r.pys[i]]);
        if (pts.length < 2) continue;
        const m = await rcm.plan.match([a.x, a.y], [b.x, b.y], pts, RC.matchTol(null), routes);
        if (my !== rcm.token) return false;
        const c = RC.chosen(m, routes);
        mine.set(r.uid, { ...m, ...c, actual: d, pace: rcm.calib?.ok ? rcm.calib.pace[r.uid] : null });
        pairs.push({ actual: d, model: c.time });
      }
      rcm.mine[j] = mine;
      // the leg's pace shown: the runners' median, from the group's calibration when it holds
      const cp = rcm.calib?.ok ? [...mine.values()].map((m) => m.pace).filter(Boolean).sort((x, y) => x - y) : [];
      rcm.auto[j] = cp.length ? cp[cp.length >> 1] : RC.autoPace(pairs);
      return true;
    }
  }
  window.anDebugRoutes = () => ({ on: rcm.on, pic: rcm.pic, picOn: rcm.picOn, info: rcm.info, dem: rcm.dem, leg, routes: rcm.routes[leg], mine: rcm.mine[leg], settings: rcm.s, calib: rcm.calib });
  async function rcmPicture() {
    try { await rcmPlan(); rcm.pic = await rcm.plan.picture(); } catch (e) { rcm.pic = null; }
    if (!rcm.picOn) rcm.pic = null;
    mv.draw();
  }
  /** The left panel's « Itinéraires »: the leg's routes, then the runners shown with the route they took measured on the same
   *  model (time, length, climb), what their choice cost against A and what their running cost against the model. */
  function rcmList() {
    const el = $("#rc-leg");
    if (!el) return;
    // off (routes computed for administrators and where the organisers switched them on): a button here, not a box elsewhere
    if (!rcm.on) {
      el.innerHTML = html`<p class="hint sp-hint">${t("rc.tab.offHint")}</p><button type="button" class="btn btn-sm btn-primary" id="rc-go">${t("rc.tab.go")}</button>`;
      $("#rc-go").addEventListener("click", () => rcmTurnOn());
      return;
    }
    // every leg computed, as « Inter-postes » lists them: the one shown marked and brought into view, a click on a leg's name opens it
    const legs = Array.from({ length: legsN }, (_, i) => i + 1).filter((j) => rcm.routes[j]?.length);
    if (!legs.length || (leg && !rcm.routes[leg]?.length)) { el.innerHTML = html`<div class="rc-wait">${raw(rcmWait())}</div>`; return; }
    const signed = (v) => `${v >= 0 ? "+" : "−"}${clock(Math.abs(v))}`;
    const dot = (n) => html`<span class="rc-dot" style="background:${n >= 0 ? RC.ROUTE_COLOURS[n] : "#999"}"></span>`;
    const how = (j) => (rcm.s.pace > 0 ? t("rc.pace.typed") : rcm.calib?.ok ? t("rc.pace.calibMulti") : rcm.auto[j] ? t("rc.pace.median") : t("rc.pace.default"));
    // one leg: its routes, then the runners shown with the route they took
    const block = (j) => {
      const routes = rcm.routes[j], pace = RC.paceOf(rcm.s, rcm.auto[j]), mine = rcm.mine[j] || new Map();
      return html`<div class="rc-lb${j === leg ? " cur" : ""}" data-rc-block="${j}"><div class="rc-lb-head"><button type="button" class="rc-leg-go" data-rc-leg="${j}" title="${t("rc.leg.show")}"><b>${legName(j)}</b> ›</button></div>
        ${routes.map((r, n) => html`<div class="rc-lb-row">${dot(n)}<b>${RC.LETTERS[n]}</b> <span class="num">${RC.routeFacts(r, pace, clock)}</span> <span class="muted">· ${RC.sideLabel(r)}</span></div>`)}
        ${mine.size ? html`<p class="muted" style="margin:6px 0 2px">${t("rc.runners")}</p>
          ${runners.filter((r) => r.visible && mine.has(r.uid)).map((r) => { const m = mine.get(r.uid); return html`<div class="rc-lb-run">
            <div class="rc-lb-row">${dot(m.variant)}<b>${m.matched ? RC.LETTERS[m.variant] : RC.sharesLabel(m) || t("rc.other")}</b> ${r.name} · <span class="num">${clock(m.actual)}</span></div>
            <div class="rc-lb-gaps"><span class="num">${RC.routeFacts(m.facts, pace, clock)}</span>
              <span title="${t("rc.col.choice.hint")}">${t("rc.col.choice")} <b class="num">${signed(Math.round((m.time - routes[0].time) * (m.pace || pace)))}</b></span>
              <span title="${t("rc.col.exec.hint")}">${t("rc.col.exec")} <b class="num">${signed(Math.round(m.actual - m.time * (m.pace || pace)))}</b></span></div></div>`; })}` : ""}</div>`;
    };
    const first = leg || legs[0];
    el.innerHTML = html`<p class="hint sp-hint">${t("rc.list.hint", { p: RC.minKm(RC.paceOf(rcm.s, rcm.auto[first])), how: how(first) })}</p>
      ${legs.length < legsN ? html`<p class="muted">${t("rc.st.legsOf", { k: legs.length, n: legsN })}</p>` : ""}
      <button type="button" class="rc-leg-go rc-leg-all${leg ? "" : " cur"}" data-rc-leg="0">${t("sh.leg.all")}</button>
      ${legs.map(block)}`;
    // a leg's whole block opens it, as its name does (owner, 2026-11-05: a click beside the name did nothing)
    $$("[data-rc-leg]", el).forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); setLeg(Number(b.dataset.rcLeg)); }));
    $$("[data-rc-block]", el).forEach((b) => b.addEventListener("click", () => setLeg(Number(b.dataset.rcBlock))));
    el.querySelector(".rc-lb.cur")?.scrollIntoView({ block: "nearest" });
  }

  // ---- the 3D view (trace/view3d.js; 2026-11-01, as « Analyse solo »'s): the map over the ground's heights, every runner
  // shown on it, on the replay's own clock. The heights are the model's grid the computed routes use (one IGN or tiles request,
  // kept in IndexedDB); the runners' metres in one frame (rcmFrame), through the map's pixels.
  const v3note = (text) => { const el = $("#sh-3d-credit"); el.hidden = !text; el.innerHTML = text || ""; };
  // the map's heights, loaded once whoever asks first — the colours by relief (and their preload), the 3D view, the computed
  // routes —, each asker told of the progress
  const gridWatch = new Set();
  function heights3d(onProgress) {
    if (rcm.grid) return Promise.resolve(rcm.grid);
    if (onProgress) gridWatch.add(onProgress);
    if (!rcm.gridP) {
      const W = image.width, H = image.height, plan = gridPlan(W, H, (a, b) => toM(rcmFrame, a, b));
      const ll = (x, y) => { const [lon, lat] = geoInv(x, y); return [lat, lon]; };
      const gkey = `${W}x${H}:${[[0, 0], [W, 0], [W, H], [0, H]].map(([a, b]) => ll(a, b).map((v) => v.toFixed(5)).join(",")).join(";")}`;
      rcm.gridP = loadGrid({ key: gkey, ...plan, node: (i, j) => ll((i / (plan.nx - 1)) * W, (j / (plan.ny - 1)) * H), onProgress: (f) => gridWatch.forEach((fn) => fn(f)) })
        .then((g) => { if (!rcm.grid) rcm.grid = g; gridWatch.clear(); return g; }, (e) => { rcm.gridP = null; gridWatch.clear(); throw e; });
    }
    return rcm.gridP;
  }
  /** Runner r's trace in the 3D view's frame (its points through the map's pixels), made once. */
  function track3d(r) {
    if (!r.tr3) {
      const X = new Float32Array(r.tr.n), Y = new Float32Array(r.tr.n);
      for (let i = 0; i < r.tr.n; i++) { const [a, b] = toM(rcmFrame, r.pxs[i], r.pys[i]); X[i] = a; Y[i] = b; }
      r.tr3 = { ...r.tr, x: X, y: Y };
    }
    return r.tr3;
  }
  /** Each runner's part drawn: a leg's view its leg, else their race. */
  const range3d = (r) => (leg ? [r.passes[leg - 1], r.passes[leg]] : [r.start, r.finish ?? r.tr.dur]);
  function sync3d() {
    if (!v3) return;
    const list = runners.filter((r) => r.visible && range3d(r).every((v) => v != null));
    const sig = `${leg}|${list.map((r) => `${r.uid}:${r.colour}`).join(",")}`;
    if (sig !== v3sig) {
      v3sig = sig; v3list = list;
      v3.setTraces(list.map((r) => { const [a, b] = range3d(r); return { track: track3d(r), i0: indexAt(r.tr, a), i1: indexAt(r.tr, b), colour: r.colour, label: initials(r) }; }));
      if (leg !== v3leg) { v3leg = leg; leg ? v3.fitTrace() : v3.fitTrace(ctrlBox()); }   // another leg: the camera on it, as the 2D's
    }
    const m = cmode();
    if (m === "pace") paceScale();
    const hs = HEIGHT_BY.includes(m) && hts?.z;
    const key = `${sig}|${m}|${vLo}|${vHi}|${hs ? `${hLo}|${hHi}` : ""}|${m === "runner" || m === "pace" || hs ? "" : v3list.map(routeColour).join(",")}`;
    v3.setStyle({ colourOf: (i, k) => (m === "pace" ? paceColour(v3list[k].tr.v[i], vLo, vHi) : hs ? colourOf(m, hseries(v3list[k], m)[i], hLo, hHi) : routeColour(v3list[k])), colourKey: key,
      width, future: leg ? "whole" : future, tail: leg ? 0 : tail, mapAlpha, traceAlpha });
    const k = sel ? v3list.indexOf(sel) : -1;
    v3.setFollow(!pan ? false : follow === "sel" && k >= 0 ? "chase" : "group", Math.max(0, k));
  }
  /** Each runner's trace time now, null when not drawn (not shown, or not started yet at the clock's time). */
  const now3d = () => v3list.map((r) => {
    const s = sAt(r, playing ? Math.min(T1, T + ((performance.now() - last) / 1000) * speed) : T);
    return s == null || (mode === "clock" && !leg && s < r.start - 1) ? null : s;
  });
  async function toggle3d() {
    if (v3on) { close3d(); return; }
    const my = ++v3token;
    v3on = true;
    $("#sh-3d")?.setAttribute("aria-pressed", "true");
    $("#sh-3d-host").hidden = false; $("#sh-canvas").hidden = true;
    v3note(`${bar()} ${t("an.v3.loading")}`);
    try {
      const g = await heights3d((f) => { if (my === v3token) v3note(`${bar(f)} ${t("an.v3.loadingPct", { p: Math.round(100 * f) })}`); });
      if (my !== v3token) return;
      const { open3d } = await import("../trace/view3d.js");
      if (my !== v3token) return;
      v3sig = ""; v3list = []; v3leg = leg;
      const v = await open3d($("#sh-3d-host"), { image, W: image.width, H: image.height, grid: g, toM: (x, y) => toM(rcmFrame, x, y), toPx: (x, y) => toPx(rcmFrame, x, y),
        traces: [], now: now3d, onUserMove: () => { pan = false; followMarks(); } });
      if (my !== v3token) { v.dispose(); return; }
      v3 = v;
      v3.setExaggeration(ex3d);
      sync3d();
      leg ? v3.fitTrace() : v3.fitTrace(ctrlBox());
      const c = CREDIT[g.source];
      v3note(html`${t("an.v3.relief")} <a href="${c.url}" target="_blank" rel="noopener">${c.text}</a>`);
      opts3d();
    } catch (e) {
      console.error(e);
      if (my !== v3token) return;
      close3d();
      v3note(t(e.message === "webgl" ? "an.v3.noWebgl" : "an.v3.failed"));
      setTimeout(() => { if (!v3on) v3note(""); }, 8000);
    }
  }
  const ctrlBox = () => { const xs = ctrls.map((p) => p.x), ys = ctrls.map((p) => p.y); return [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 40, Math.max(...ys) + 40]; };
  function close3d() {
    v3token++;
    if (v3) { v3.dispose(); v3 = null; }
    if (!v3on) return;
    v3on = false;
    $("#sh-3d")?.setAttribute("aria-pressed", "false");
    $("#sh-3d-host").hidden = true; $("#sh-canvas").hidden = false; v3note("");
    opts3d(); mv.draw();
  }
  /** The 3D view's setting under « Affichage »: the vertical exaggeration, and where the heights come from. */
  function opts3d() {
    const el = $("#sh-3d-opts");
    if (!el) return;
    el.hidden = !v3;
    if (!v3) { el.innerHTML = ""; return; }
    const g = rcm.grid;
    el.innerHTML = html`<div class="an-3d-head">${t("an.v3.title")}</div><div class="an-opts">
      <label><span>${t("an.v3.ex")}</span><span class="an-3d-ex"><input type="range" id="sh-ex" min="1" max="3" step="0.25" value="${ex3d}"><b id="sh-ex-v">× ${fmt(ex3d, 2)}</b></span></label></div>
      ${g ? html`<p class="muted an-3d-info">${t(g.source === "tiles" ? "an.v3.info.tiles" : "an.v3.info.ign", { nx: g.nx, ny: g.ny, step: fmt(g.step, 1), s: g.cached ? t("an.v3.cached") : `${fmt((g.ms || 0) / 1000, 1)} s` })}</p>` : ""}`;
    $("#sh-ex").addEventListener("input", (e) => { ex3d = Number(e.target.value); $("#sh-ex-v").textContent = `× ${fmt(ex3d, 2)}`; v3?.setExaggeration(ex3d); savePrefs(); });
  }
  window.anDebug3d = () => ({ on: v3on, view: v3?.stats(), grid: rcm.grid && { nx: rcm.grid.nx, ny: rcm.grid.ny, source: rcm.grid.source } });

  // ---- the views under the replay (sharedviews.js): the splits against a reference, one runner's legs
  const state = { tab: TABS.includes(init.v) ? init.v : TABS[0], ref: runners.find((r) => r.uid === Number(init.ref)) || null, legsOf: int(init.lo, 0, 1e12, null),
    ex: /^[a-z0-9]{1,12}$/.test(init.ex || "") ? init.ex : null,
    gref: /^(superman|r\d+)$/.test(init.g || "") ? init.g : null, gx: init.gx === "dist" ? "dist" : null, gm: init.gm === "duel" ? "duel" : null, da: int(init.da, 0, 1e12, null),
    get sel() { return sel; } };
  const X = { runners, ctrls, legsN, ctrlLabel, legName, legTime, total, state, setLeg,
    // the field a leg time is ranked in, and its best legs: the class's published split times (every runner of the circuit),
    // else every runner with a trace
    fieldLegs: () => {
      const k = pubClass || runners.find((r) => r.published)?.klass;
      const all = k ? classLegs(k, matchControls(ctrls, k.controls || [], splitsN(k))) : [];
      if (all.filter((l) => l.some((v) => v != null)).length >= 2) return { source: "published", all };
      return { source: "traces", all: runners.map((r) => Array.from({ length: legsN }, (_, i) => legTime(r, i + 1))) };
    },
    refChanged: () => { bottom.draw(); saveUrl(); }, changed: () => saveUrl(),
    // the course's distance at each control (km, the straight legs), for the gaps against the distance
    courseKm: () => { const f = runners[0]?.fit; let acc = 0; return ctrls.map((p, i) => { if (i && f) { const a = toM(f, ctrls[i - 1].x, ctrls[i - 1].y), b = toM(f, p.x, p.y); acc += Math.hypot(a[0] - b[0], a[1] - b[1]) / 1000; } return acc; }); },
    // a point of the gaps (a runner at a control): the leg into that control, framed whole, that runner followed (owner,
    // 2026-11-05: it centred on the control itself)
    jump: (r, j) => {
      if (!j || r.passes[j] == null) return;
      r.visible = true; sel = r; follow = "sel"; pan = true;
      setLeg(j); saveUrl();
    },
    get leg() { return leg; }, organiser: !!you.organiser, VARIANT_COLOURS,
    tabOk: (k) => (score ? k === "splits" : k !== "legs" && (k !== "exercises" || A.kind === "club") && (k !== "variants" || variantsOn)), score, visitsOf, scoreN,
    exercises: () => exercises, exScores, exWidth, get draft() { return draft; },
    setDraft: (d) => { draft = d; mv.draw(); bottom.draw(); },
    setExWidth: (e, w, save) => { if (save) { saveExercises(exercises.map((x) => (x.id === e.id ? { ...x, w } : x))).then(() => { delete exW[e.id]; bottom.draw(); }).catch((err) => alertBox(errText(err))); } exW[e.id] = w; mv.draw(); },
    saveExercises: async (list) => { await saveExercises(list); mv.draw(); bottom.draw(); },
    pickExercise: (e) => {
      state.ex = e?.id || null;
      if (e?.leg && e.leg !== leg) setLeg(e.leg); else { mv.draw(); bottom.draw(); }
      // the exercise's line in full on the map, with room for its width (owner, 2026-11-05)
      const line = e ? exLinePx(e) : [];
      if (line.length > 1) { mv.fitPoints(line.map((p) => p[0]), line.map((p) => p[1]), 80, 4); still = true; mv.draw(); }
      saveUrl();
    },
    redrawMap: () => mv.draw(), errText,
    variants: () => (leg ? variantsOf(leg) : null),
    setTags: (j, tags) => { if (tags) localTags[j] = tags; else delete localTags[j]; saveLocalTags(); varCache.clear(); legend(); mv.draw(); left(); bottom.draw(); },
    shareTags: async (j) => { await shareVariants(j); legend(); mv.draw(); left(); bottom.draw(); },
    colourBy: () => cmode(), setColourBy: (c) => { colourBy = c; savePrefs(); legend(); right(); mv.draw(); },
    extraQuery: () => ({ ...(state.gref ? { g: state.gref } : {}), ...(state.gx ? { gx: state.gx } : {}), ...(state.gm ? { gm: state.gm } : {}), ...(state.da != null ? { da: state.da } : {}) }) };
  // the views under « Analyses », and one runner's legs in a tab of its own (« Inter-postes »; none for a score course)
  const views = bottomViews($("#sh-views"), X), legsTab = legsPanel($("#sh-legs"), X);
  const bottom = { draw: () => { views.draw(); legsTab.draw(); }, tab: () => views.tab() };
  leftP.setTab("legs", !score);

  // ---- the layout: the window's height below the top line
  function fit() { const el = $("#sh-layout"); if (!el) return; const top = el.getBoundingClientRect().top + window.scrollY; el.style.height = `${Math.max(drawers() ? 200 : 380, Math.floor(innerHeight - top - 16))}px`; }
  window.addEventListener("resize", fit);
  $("#sh-zin").addEventListener("click", () => mv.zoomBy(1.4));
  $("#sh-zout").addEventListener("click", () => mv.zoomBy(1 / 1.4));
  // a headcam video (sharedvideo.js): a file of this device, played in step with one runner's race
  const video = videoPanel($(".sh-map", box), { runners, key: `ocn.sh.video.${id}.${course.n}`, playing: () => playing, speed: () => speed,
    pick: () => sel || runners.find((r) => r.mine) || runners[0],
    raceTime: (r) => { const s = sAt(r, T); return s == null ? null : s - r.start; } });
  $("#sh-video-btn")?.addEventListener("click", () => $("#sh-video-file").click());
  $("#sh-video-file")?.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { video.open(f); video.sync(true); } e.target.value = ""; });
  // the strip: a click or a drag seeks
  const strip = $("#sh-strip");
  const scrub = (e) => { stop(); T = T0 + stripFraction(strip, e.clientX - strip.getBoundingClientRect().left) * (T1 - T0); frame(); };
  strip.addEventListener("pointerdown", (e) => { scrub(e); try { strip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } strip.dataset.down = "1"; });
  strip.addEventListener("pointermove", (e) => { if (strip.dataset.down) scrub(e); });
  const stripUp = () => { delete strip.dataset.down; };
  strip.addEventListener("pointerup", stripUp); strip.addEventListener("pointercancel", stripUp);
  const stripRo = new ResizeObserver(() => drawStrip());
  stripRo.observe(strip);
  $("#sh-fit").addEventListener("click", () => { pan = false; followMarks(); right(); if (v3) { v3.setFollow(false); v3.fitTrace(); } else { fitRoutes(); mv.draw(); } });
  $("#sh-strip-tog").addEventListener("click", () => setStrip(!showStrip));
  $("#sh-fitmap").addEventListener("click", () => { pan = false; followMarks(); right(); if (v3) { v3.setFollow(false); v3.fitMap(); } else { mv.fitAll(); mv.draw(); } });
  $("#sh-zin").addEventListener("click", () => v3?.zoom(1.4));
  $("#sh-zout").addEventListener("click", () => v3?.zoom(1 / 1.4));
  $("#sh-3d")?.addEventListener("click", () => toggle3d());
  window.scrollTo(0, 0);
  applyLayout();
  mv.setAlpha(mapAlpha / 100);
  mv.setImage(image);
  paceScale(); legend();
  left(); right(); bottom.draw(); rcmList();
  if (leg) { const t0 = T; setLeg(leg); T = Math.min(T1, Math.max(T0, t0)); } else if (still) mv.fitAll(); else fitRoutes();
  frame();
  // the panels and the window settle after the first draw: the whole map fitted again until the reader moves it
  let moved = false;
  $("#sh-canvas").addEventListener("pointerdown", () => { moved = true; });
  $("#sh-canvas").addEventListener("wheel", () => { moved = true; }, { passive: true });
  // the view fitted again while the panels and the bar settle, until the reader moves it: the whole map, or the leg opened
  const refit = () => (leg ? fitLeg() : mv.fitAll());
  const wholeRo = new ResizeObserver(() => { if (still && !moved) { refit(); mv.draw(); } });
  onBarChange = () => { if (still && !moved) refit(); mv.draw(); };
  wholeRo.observe($("#sh-canvas"));
  window.anShared = () => ({ runners, mode, leg, T, T0, T1, follow, pan, view: mv.view });   // for support, in the console
  curvesPanel();
  // the heights loaded in the background a moment after the opening (owner, 2026-11-07): altitude, slope and slope-corrected pace
  // then colour at once, and the 3D view and the computed routes find them ready (IGN's the first time, then this browser's copy)
  const preload = setTimeout(() => { if (box.isConnected) needHeights(true); }, 1500);
  // ← → from leg to leg while one is open, the map shown (not « Analyse des temps »)
  const offArrows = legArrows((dir) => { if (!leg) return false; const j = Math.max(1, Math.min(legsN, leg + dir)); if (j !== leg) setLeg(j); }, () => !!box.offsetParent);
  return { pause() { stop(); }, destroy() { offArrows(); clearTimeout(preload); measure.destroy(); stop(); close3d(); video.close(); rcm.token++; rcm.plan?.destroy(); mv.destroy(); barFloat.destroy(); handleClear.destroy(); wholeRo.disconnect(); ownRo.disconnect(); stripRo.disconnect(); window.removeEventListener("resize", fit); } };
}
