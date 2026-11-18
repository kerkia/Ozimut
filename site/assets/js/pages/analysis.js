// « Analyse » (#/analyse, menu « Courses »; administrators only for now — owner, 2026-10-13): a runner's GPS trace on
// their own map, for a race of « Résultats », played back as Livelox does.
// 1. The race (one with results), the circuit and the runner — the logged-in one by default.
// 2. The files, all read in the browser and never sent: the map (an image, a PDF's first page, or a KMZ), the trace
//    (GPX, TCX or FIT — with heart rate, cadence, altitude…), and if there are any a world file (+ .prj) or a KML for
//    the map's georeferencing, and an IOF XML CourseData (Purple Pen, OCAD, Condes) for the course.
// 3. The calibration, automatic: the course is read on the map (trace/course.js: the purple circles, the start
//    triangle, the finish's double circle); if the map is georeferenced, the trace's place on it follows; else the
//    trace is laid over the controls (trace/align.js: the similarity that makes it run through most of them, no
//    split times needed) and the controls are ordered by the trace's passes. The runner's published split times,
//    when there are any, refine the result (each click/circle pairs with the trace point of its time: least-squares
//    similarity plus the trace's clock offset — the start time is often unknown). The user can correct anything by
//    hand (clicks snap to the circles found).
// 4. The playback: the trace, plain or coloured by pace, the runner moving with a tail, play / pause / speed, jumps
//    by control, « suivre le coureur »; under the map the pace and the file's channels along the race; a table of
//    the legs (times and ranks when published, else the trace's own times; time lost by the split-times page's
//    rule; the trace's length against the straight line; pace; mean heart rate and cadence).
// Only the calibration (the controls' positions) is kept, in localStorage, per race, circuit, runner and image.

import { html, raw, $, $$, fmt, fmtDate, pctN, fileAccept, traceAccept, touchScreen, dateFormat } from "../util.js";
import { backLine, multiHref, orgaHref } from "./mapanalysis.js";
import { fitFromGeo, geoFromFit, frameAt, validGeo } from "../trace/share.js";
import { anchorsOf, straightPx, timeline, ownGeo, toGpx, drawingOf, parseClock, pxToLatLon } from "../trace/drawroute.js";
import { measureTool } from "../trace/measure.js";
import { t, tn, locale } from "../i18n.js";
import * as auth from "../auth.js";
import { getProv, clock } from "./provisional.js";
import { raceFilters } from "../racefilters.js";
import * as country from "../country.js";
import { replaceQuery } from "../app.js";
import { parseTrace, isTraceName, indexAt, posAt, cumAt, speedAt, valueAt, meanBetween, toLocal, cutTrack, cumClimb } from "../trace/track.js";
import { fitSimilarity, fitAffine, toPx, toM, registerPoints, simplify } from "../trace/geom.js";
import { isVectorName, readVector, renderVector, latLonOf, ownImage, throughGeo, cover, VECTOR_ACCEPT } from "../trace/vectorroutes.js";
import { detectCourse, READER } from "../trace/course.js";
import { CHANNEL_LABEL, CHANNEL_UNIT, CHANNEL_COLOUR, curveColour, pace, drawCurves, curveTimeAt } from "../trace/curves.js";
import { alignTrack, visitOrder, passesInOrder } from "../trace/align.js";
import { colourModes, seriesOf, rangeOf, colourOf, legendOf, legendHtml, PACE_COLOURS } from "../trace/pacecolour.js";
import { bestLegs, refLegs, legLoss } from "../trace/legs.js";
import { parisOffsetMs, matchControls } from "../trace/published.js";
import { readZip, parseKml, fitFromKml, kmlCorners, isWorldFileName, parseWorldFile, crsFromWkt, guessCrs, fitFromWorld, parseIofCourse } from "../trace/georef.js";
import { readMap, isImage } from "../trace/mapfile.js";
import { buttons as fwButtons, bindFull, setFull, leaveFull, inOwnTab, setTabParams } from "../fullwin.js";
import { takeInbox, handOver } from "../pwa.js";
import { gridPlan, loadGrid, CREDIT } from "../trace/terrain.js";
import { bar, setBar } from "../waitbar.js";
import * as phone from "../phonelink.js";
import * as LM from "../trace/lidarmap.js";
import * as RC from "../trace/routeplan.js";
import { panelHtml, bindPanel, bindSplitter, PAN_ICON, drawers, stripArrow, floatBar, clearHandle, ICONS, legPickHtml, bindLegPick, legArrows, mapOnlyButton, bindMapOnly, leaveMapOnly } from "../trace/sidepanel.js";
import { keyHtml } from "../trace/legend.js";
import { exHtml, bindEx } from "../trace/ex3dbtn.js";
import { drawPaceStrip, stripSamples, stripFraction, graphName, isPaceGraph } from "../trace/pacestrip.js";
import { drawCourse } from "../trace/coursedraw.js";
import { videoPanel } from "./sharedvideo.js";

const SPEEDS = [1, 2, 5, 10, 20, 40, 60, 80, 100];        // every x20 past x20 (owner, 2026-10-15)
const TAILS = [30, 60, 120, 300, 0];                   // seconds of trace behind the runner; 0: all of it
const TOL = 20;                                        // metres: a control is "reached" within this of the trace
const CAL_KEY = "ocn.an.cal";                          // localStorage: the positions, per race / circuit / runner / image
const TRACE = "#3b0764";                               // the trace's default colour: a dark purple (owner, 2026-10-14)
const TRACE_PRESETS = ["#3b0764", "#c8102e", "#0b3d91", "#111111", "#ff6a00"];
const WIDTHS = [[1, "an.width.thin"], [1.6, "an.width.normal"], [2.4, "an.width.thick"], [3.5, "an.width.thicker"]];   // × the trace's base widths
const PREFS_KEY = "ocn.an.prefs";                      // the playback's settings, kept on the device
function loadPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {}; } catch (e) { return {}; } }
const signed = (s) => (s == null ? "—" : `${s >= 0 ? "+" : "−"}${clock(Math.abs(s))}`);
const detour = (dist, straight) => { const p = (100 * dist) / straight - 100; return `${p >= 0 ? "+" : "−"}${pctN(Math.abs(p))}`; };
const tick = () => new Promise((r) => setTimeout(r, 30));

// ---- the precise calibration, with split times -----------------------------------------------------------------------
/**
 * pairs [{ tau (race seconds), px, py }] -> the similarity and the clock offset (the trace time of the race start).
 * guess: the offset already estimated (the results' start time, the trace's own passes); the search covers ± 15 min
 * around it, else the whole trace. fixed: an affine transform already known (a georeferenced map): then only the
 * offset is searched. Two pairs without a fixed geometry: the offset is the guess (or 0).
 */
function calibrate(tr, pairs, guess, fixed = null) {
  if (pairs.length < (fixed ? 1 : 2)) return null;
  const evaluate = fixed
    ? (d) => { let ss = 0; for (const p of pairs) { const [px, py] = toPx(fixed, ...posAt(tr, d + p.tau)); ss += (px - p.px) ** 2 + (py - p.py) ** 2; } return { ...fixed, rms: Math.sqrt(ss / pairs.length) }; }
    : (d) => fitSimilarity(pairs.map((p) => posAt(tr, d + p.tau)), pairs.map((p) => [p.px, p.py]));
  if (!fixed && pairs.length === 2) { const d = guess ?? 0; const f = evaluate(d); return f && { fit: f, offset: d, rms: f.rms }; }
  const last = Math.max(...pairs.map((p) => p.tau));
  const lo = guess != null ? guess - 900 : Math.min(0, tr.dur - last) - 60, hi = guess != null ? guess + 900 : Math.max(0, tr.dur - last) + 60;
  let best = null;
  for (let d = lo; d <= hi; d += 1) { const f = evaluate(d); if (f && (!best || f.rms < best.rms)) best = { fit: f, offset: d, rms: f.rms }; }
  if (!best) return null;
  for (let d = best.offset - 1; d <= best.offset + 1; d += 0.1) { const f = evaluate(d); if (f && f.rms < best.rms) best = { fit: f, offset: d, rms: f.rms }; }
  return best;
}
/** Two increasing time sequences matched by dynamic programming (gaps allowed): pairs [i, j] with |Δt| ≤ 240 s. */
function matchTimes(det, off, P = 120) {
  const m = det.length, n = off.length;
  const M = Array.from({ length: m + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const B = Array.from({ length: m + 1 }, () => new Int8Array(n + 1));
  M[0][0] = 0;
  for (let i = 1; i <= m; i++) { M[i][0] = i * P; B[i][0] = 1; }
  for (let j = 1; j <= n; j++) { M[0][j] = j * P; B[0][j] = 2; }
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = off[j - 1] == null ? Infinity : Math.abs(det[i - 1] - off[j - 1]);
    const d = M[i - 1][j - 1] + c, u = M[i - 1][j] + P, l = M[i][j - 1] + P;
    if (d <= u && d <= l) { M[i][j] = d; B[i][j] = 0; } else if (u <= l) { M[i][j] = u; B[i][j] = 1; } else { M[i][j] = l; B[i][j] = 2; }
  }
  const pairs = [];
  for (let i = m, j = n; i > 0 || j > 0;) {
    const b = B[i][j];
    if (b === 0) { if (Math.abs(det[i - 1] - off[j - 1]) <= 240) pairs.push([i - 1, j - 1]); i--; j--; } else if (b === 1) i--; else j--;
  }
  return pairs.reverse();
}

const parisDay = (ms) => dateFormat({ timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }, "fr-CA").format(new Date(ms));

// ---- the files ------------------------------------------------------------------------------------------------------
const ACCEPT = `.png,.jpg,.jpeg,.webp,.gif,.bmp,.pdf,.kmz,.kml,.gpx,.tcx,.fit,.xml,.jgw,.pgw,.tfw,.gfw,.bpw,.wld,.prj,${VECTOR_ACCEPT},image/*,application/pdf`;

// ---- the memory between visits ---------------------------------------------------------------------------------------
// The files and the work stay while the site is open: a visit to another page and back finds the map, the trace and the
// course read on it as they were (memo, in memory). The files themselves are also kept in the browser's IndexedDB for
// the tab's session (a tag in sessionStorage: a reload recovers them, a new tab does not), never sent; « Oublier les
// fichiers » drops them. The calibration (the controls' positions, the geometry found) is in localStorage, so a finished
// calibration comes back as it was left rather than being redone — the controls placed by hand included.
const memos = {};                                       // per mode: "race" (Courses) and "perso" (Entrainement)
const DB = "ocn-analyse", STORE = "files";
function idbOpen() {
  return new Promise((res, rej) => {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(STORE);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbWrite(value, key = "files") {
  const db = await idbOpen();
  await new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); if (value) tx.objectStore(STORE).put(value, key); else tx.objectStore(STORE).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}
async function idbRead(key = "files") {
  const db = await idbOpen();
  const v = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  db.close();
  return v;
}
function sessionTag() {
  try {
    let tag = sessionStorage.getItem("ocn.an.tag");
    if (!tag) { tag = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("ocn.an.tag", tag); }
    return tag;
  } catch (e) { return null; }
}

// ---- the page -------------------------------------------------------------------------------------------------------
export async function render(main, { query = {}, route } = {}) {
  const me = auth.session();
  bindFull(); bindMapOnly();
  if (inOwnTab()) setFull(true);                         // a tab opened alone by « ↗ »: the map page without the site's bar
  // « ↗ » during the playback: the new tab gets this tab's files (their key in IndexedDB, as the address says, whether or
  // not the browser copied this tab's session) and goes on with the playback instead of stopping on the files
  if (query.tag && /^[a-z0-9]{6,40}$/.test(query.tag)) { try { sessionStorage.setItem("ocn.an.tag", query.tag); } catch (e) { /* this visit */ } }
  let autoPlay = query.play === "1";
  // a kept analysis replayed (« Analyse de carte »'s « Rejouer l'analyse », trace/solokeep.js): opened straight on the playback
  const keptId = /^[a-z2-9]{8,40}$/.test(query.analyse || "") ? query.analyse : null;
  let openedKept = null;                                   // { id, title } of the kept analysis being played
  setTabParams(() => ({ tag: sessionTag(), play: document.body.classList.contains("an-theatre") ? "1" : null, d3: v3on ? "1" : null }));
  let autoV3 = query.d3 === "1";
  // « Analyse solo » (menu « Entrainement »): the same page with no race — a training, a map and one's trace
  // « Analyse solo » on an organiser's published map and circuits (owner, 2026-11-01; route analysisOrga, #/analyse-orga?id=):
  // the map, the circuit and its georeferencing are the organiser's, one drops one's trace only, nothing sent; a competition's
  // published results give the runner's split times as on « Une compétition » (the runner found in them: the account's row,
  // else the run that fits the trace; « — » for none), a training is read on the trace alone
  const orgaMode = route === "analysisOrga";
  const perso = route === "analysisPerso" || orgaMode;
  const pageMode = orgaMode ? "orga" : perso ? "perso" : "race", fileKey = orgaMode ? "files:orga" : perso ? "files:perso" : "files";
  const titleKey = orgaMode ? "an.orga.title" : perso ? "an.perso.title" : "an.title";
  let orga = null, orgaErr = "", orgaN = null, orgaGo = false;
  if (orgaMode) {
    const id = String(query.id || "");
    try {
      const k = (() => { try { return sessionStorage.getItem(`ocn.an.key.${id}`) || ""; } catch (e) { return ""; } })();
      // `for=solo`: this read is not counted as a visit of the multi analysis (the replay counts itself: soloSeen)
      const r = /^[a-z0-9-]{4,64}$/i.test(id) ? await fetch(`api/analyses/${id}?for=solo`, { credentials: "same-origin", headers: k ? { "X-Analysis-Key": k } : {} }) : null;
      const d = r ? await r.json().catch(() => null) : null;
      if (!r || !r.ok) orgaErr = d?.error === "locked" ? "an.orga.locked" : d?.error === "club" ? "an.orga.club" : d?.error === "draft" ? "an.orga.draft" : "an.orga.err";
      else if (!(d.analysis.courses || []).length) orgaErr = "an.orga.noCourse";
      // the organisers may close « Analyse solo » on their map (owner, 2026-11-04); they still open it themselves
      else if (d.analysis.opts?.solo === false && !d.you?.organiser) orgaErr = "an.orga.closed";
      else { orga = { id, A: d.analysis, key: k, organiser: !!d.you?.organiser }; orgaN = d.analysis.courses.some((c) => String(c.n) === String(query.c)) ? Number(query.c) : d.analysis.courses[0].n; }
    } catch (e) { orgaErr = "an.orga.err"; }
  }
  const orgaRace = orga?.A?.kind === "race" && orga.A.race ? orga.A.race : null;
  // the organisers' switches on their map (api/analyses OPTS): the computed routes (every account's since 2026-11-04, on by default;
  // the administrators always), the 3D view, saving the run in « Mes cartes »
  const orgaOpt = (k, d) => (orgaMode && orga ? (typeof orga.A.opts?.[k] === "boolean" ? orga.A.opts[k] : d) : true);
  const routesOk = !!me?.admin || orgaOpt("routes", true);
  /** A replay on the organiser's map counted for its organisers (once a visit and circuit; never who: api/analyses stats). */
  const soloSeen = () => {
    if (!orgaMode || !orga || orga.organiser) return;
    const k = `ocn.an.solo.${orga.id}.${orgaN}`;
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch (e) { /* counted again */ }
    fetch(`api/analyses/${orga.id}/solo/${orgaN}`, { method: "POST", credentials: "same-origin", headers: orga.key ? { "X-Analysis-Key": orga.key } : {} }).catch(() => {});
  };
  let withTimes = !perso;                                  // published times to read: a race, or an organiser's competition with results
  const idx = perso ? null : await getProv("index.json");
  const races = (idx?.races || []).filter((r) => r.docs && !r.soon).sort((a, b) => b.date_iso.localeCompare(a.date_iso));
  // the list offers the site's country's races (country.js, as « Analyse de course »); a race of another country named in
  // the address, or found from a trace's day, still opens
  const here = races.filter((r) => country.of(r) === country.current());
  // the race's list narrowed by the lists of races' filters (racefilters.js, as on Résultats); the address is the race's own
  const RF = perso || !here.length ? null : await raceFilters({ id: "anf", races: here, address: false, onChange: () => pickers() });
  main.innerHTML = html`
    ${backLine()}
    <div class="page-head"><div><h1>${t(titleKey)}</h1><p class="lede">${t(orgaMode ? "an.orga.lede" : perso ? "an.perso.lede" : "an.lede")}</p></div></div>
    <ol class="dep-steps" id="an-steps"></ol>
    <div class="an-brief" id="an-brief" hidden></div>
    <div id="an-rf">${RF ? RF.html : ""}${perso ? "" : country.hint(races.map(country.of))}</div>
    <div class="filters" id="an-pick"></div>
    <section class="card" id="an-files"></section>
    <section class="card an-opening" id="an-opening" hidden><div class="card-body"><span class="an-spin" aria-hidden="true"></span> ${t("an.opening")}</div></section>
    <div class="an-dropall" id="an-dropall" hidden>${t("an.dropAll")}</div>
    <div id="an-work" hidden>
      <div class="sh-top sh-top3 an-top" id="an-top" hidden></div>
      <div class="an-layout" id="an-layout">
        ${raw(panelHtml({ id: "an-left", side: "left", cls: "an-left", tabs: [{ key: "graphs", label: t("an.tab.graphs"), tip: t("an.tab.graphs.tip") }, { key: "legs", label: t("an.tab.legs"), tip: t("an.tab.legs.tip") },
          ...(routesOk ? [{ key: "routes", label: t("an.tab.routes"), tip: t("an.tab.routes.tip") }] : [])],
          inner: { graphs: html`<div class="an-chips" id="an-chips"></div><canvas id="an-strip"></canvas>`, legs: html`<div id="an-legs"></div>`, routes: html`<div class="rc-busy" id="an-rc-busy" hidden></div><div id="an-rc"></div>` } }))}
        <div class="an-split" id="an-split-g" title="${t("an.split")}" hidden></div>
        <div class="an-mapcol"><div class="an-bar sh-bar" id="an-bar" hidden></div>
        <div class="an-map"><div class="an-3d" id="an-3d-host" hidden></div><canvas id="an-canvas"></canvas>
          <div class="an-tools"><button type="button" class="btn btn-sm an-3d-btn" id="an-3d" aria-pressed="false" title="${t("an.v3.hint")}" hidden>3D</button>${exHtml("an")}<button type="button" class="btn btn-sm" id="an-zin" title="${t("lg.zin.t")}" aria-label="${t("lg.zin.t")}">+</button><button type="button" class="btn btn-sm" id="an-zout" title="${t("lg.zout.t")}" aria-label="${t("lg.zout.t")}">−</button>
            <button type="button" class="btn btn-sm" id="an-fit" title="${t("an.fitTrace")}" aria-label="${t("an.fitTrace")}">${raw(ICONS.fit)}</button><button type="button" class="btn btn-sm" id="an-map" title="${t("an.fitMap")}">▭</button>
            <button type="button" class="btn btn-sm an-measure" id="an-measure" aria-pressed="false" title="${t("an.measure.hint")}" hidden>📏</button><button type="button" class="btn btn-sm" id="an-video-btn" title="${t("sh.video.add")}" hidden>🎥</button><input type="file" id="an-video-file" accept="video/*" hidden></div>
          <div class="an-legchip" id="an-legchip" hidden><span id="an-legchip-t"></span><button type="button" class="btn btn-sm ico-btn" id="an-leg-all" hidden title="${t("lg.whole")}" aria-label="${t("lg.whole")}">${raw(ICONS.course)}</button></div><div class="an-measure-out" id="an-measure-out" hidden></div><div class="an-northarrow" id="an-northarrow" hidden title="${t("an.orient.n")}"><span>N</span></div><div class="an-legend" id="an-legend" hidden></div><div class="an-3d-credit" id="an-3d-credit" hidden></div><div class="an-gen-credit" id="an-gen-credit" hidden></div></div>
        <div class="sh-bottom"><div class="sh-stripbar" id="an-stripbar" hidden><button type="button" class="sh-strip-tog" id="an-ps-tog" aria-expanded="true" title="${t("an.strip.fold")}">▾ ${graphName("speed")}</button><span class="an-bar-stats" id="an-stats"></span></div>
        <canvas class="sh-strip" id="an-ps" hidden></canvas></div></div>
        <div class="an-split" id="an-split-s" title="${t("an.split")}" hidden></div>
        <aside class="an-side" id="an-side"></aside>
        ${raw(panelHtml({ id: "an-right", side: "right", cls: "an-right", tabs: [{ key: "display", label: t("an.tab.display"), tip: t("an.tab.display.tip") }, ...(routesOk ? [{ key: "compute", label: t("an.tab.compute"), tip: t("an.tab.compute.tip") }] : []),
          { key: "export", label: t("an.tab.export"), tip: t("an.tab.export.tip") }, { key: "legend", label: t("lg.tab"), tip: t("lg.tab.tip") }],
          inner: { legend: keyHtml({ video: true }) } }))}
      </div>
    </div>`;
  if (!perso && !here.length && !races.some((r) => r.key === query.course)) {
    $("#an-pick").innerHTML = html`<div class="empty">${t("an.none")}</div>`;
    return { title: t("an.title") };
  }
  if (orgaMode && !orga) {
    $("#an-pick").innerHTML = html`<div class="empty">${t(orgaErr)} <a href="#/analyses">${t("an.orga.back")}</a></div>`;
    $("#an-files").hidden = true;
    return { title: t(titleKey) };
  }
  RF?.bind();

  // ---- state
  // the race, circuit and runner of the last visit (the menu's link carries no query): the tab's session remembers them
  const selKey = "ocn.an.sel";
  if (!perso && !query.course) { try { const sel = JSON.parse(sessionStorage.getItem(selKey) || "null"); if (sel?.course && here.some((r) => r.key === sel.course)) query = { ...sel, ...query }; } catch (e) { /* none */ } }
  let key = orgaMode ? `orga.${orga.id}.${orgaN}` : perso ? "perso" : races.some((r) => r.key === query.course) ? query.course : (here.find((r) => (r.lics || []).includes(me?.lic)) || here[0]).key;
  let race = null, docs = [], di = 0, ci = 0, ri = 0;
  let map = null, track = null;
  let traceFull = null;                                 // the trace as read; `track` is it, or its part kept (« Couper la trace »)
  // { name, note, ... } per role; an OCAD or Mapper map is the map itself (files.map.vec) when no image of it is given, else read
  // for the computed routes only (files.vector)
  const files = { map: null, trace: null, geo: null, world: null, prj: null, iof: null, vector: null };
  let iofIndex = 0, restoredFiles = false;
  let course = null, courseCache = null, geoFit = null, geoHow = "", auto = null, prepToken = 0, status = "";
  let targets = [], cur = 0, fit = null, offset = null, rmsM = null, calibrated = false, mode = "auto", notes = [];
  let mapOrdered = false;                                                  // the targets in the course's order read on the map
  // a route drawn by hand (owner, 2026-11-02, after RouteGadget: the runners without a GPS track): the drawing under way, else null
  // — { d: { pts, kind, at } (trace/drawroute.js), step: "draw" | "times", force (the next point a control), km, day, startS, err }
  let drawing = null;
  let olderReading = false;                                                // the calibration restored was made by an earlier reading
  const prefs = loadPrefs();
  // « Suivre » on at every opening, the view still until the race is played or its time moved by the reader (owner, 2026-11-05: as
  // « Analyse de carte »); `opening` keeps the whole map fitted while the panels settle, until the reader moves it
  let still = true, opening = false, video = null;           // video: the headcam (pages/sharedvideo.js), made with the map's tools
  let view = { k: 1, ox: 0, oy: 0 }, follow = true, colour = typeof prefs.colour === "string" ? prefs.colour : "plain", marks = true, tail = TAILS.includes(prefs.tail) ? prefs.tail : 60, speed = 10, playing = false, tNow = 0;
  // the trace's thickness, × the base: thick by default, as « Analyse de carte » (owner, 2026-11-05: a width saved before is reset once)
  let width = prefs.wv === 2 && WIDTHS.some(([w]) => w === prefs.width) ? prefs.width : 2.4;
  let future = prefs.future === "faint" ? "faint" : "hide";            // the trace still to run: hidden, or faded
  // the map turned so that the leg being run points up (owner, 2026-11-02, after RouteGadget), else north up; `rot` the angle
  // (radians, clockwise on the screen) about the canvas's centre, after the view — the view itself stays north up
  let orient = prefs.orient === "leg" ? "leg" : "north", rot = 0, shownUp = 0;
  let traceColour = /^#[0-9a-f]{6}$/i.test(prefs.traceColour || "") ? prefs.traceColour : TRACE;
  // the curves: all of the file's by default — there is room for them (owner, 2026-10-15); the former default (pace and
  // heart rate) counts as no choice made
  const oldDefault = Array.isArray(prefs.chans) && prefs.chans.length === 2 && prefs.chans.includes("pace") && prefs.chans.includes("hr");
  let chans = new Set(Array.isArray(prefs.chans) && !oldDefault ? prefs.chans : ["pace", ...Object.keys(CHANNEL_COLOUR)]);
  const pct = (v, d) => (Number.isFinite(v) && v >= 10 && v <= 100 ? v : d);
  let mapAlpha = pct(prefs.mapAlpha, 100), traceAlpha = pct(prefs.traceAlpha, 100);     // the map's and the trace's opacity, %
  let graph = typeof prefs.graph === "string" ? prefs.graph : "speed";   // the graph under the map (owner, 2026-11-08: « Graphique »)
  let showStrip = prefs.strip !== false && !drawers();     // (a phone: slid down at the opening)                   // the pace under the map, as « Analyse de carte »'s (owner, 2026-11-05)
  // « Parcours sur la carte » (owner, 2026-11-05, as « Analyse de carte »): the course drawn over the map, by default only where
  // the map does not show it already — an organiser's circuit printed, or a course read on the map; the choice kept for each kind
  let courseOn = prefs.showCourse !== false, courseOver = prefs.courseOver === true, showCourse = false;
  const coursePrinted = () => (orgaMode ? files.orga?.printed !== false : !!course?.controls?.length);
  // the picture exported (« Exporter une image »): the race's part of the map or all of it, PNG or JPEG, with the title and legend
  const shot = { zone: ["view", "map"].includes(prefs.shotZone) ? prefs.shotZone : "race", type: prefs.shotType === "jpeg" ? "jpeg" : "png", legend: prefs.shotLegend !== false };
  // the 3D view (trace/view3d.js, a prototype): off at each visit; its vertical exaggeration and relief kept
  let v3 = null, v3on = false, v3token = 0, v3grid = null, v3info = null, v3refined = {};
  // a map generated from IGN's LiDAR HD for a trace without one (trace/lidarmap.js, a prototype, administrators): its progress
  let gen = null, genToken = 0, genStyle = "";
  let v3relief = prefs.relief3d === "contours" ? "contours" : "dem", v3interval = prefs.interval3d === 2.5 ? 2.5 : 5;
  let v3ex = Number.isFinite(prefs.ex3d) && prefs.ex3d >= 1 && prefs.ex3d <= 3 ? prefs.ex3d : 1.5;
  let exCtl = null;                                            // trace/ex3dbtn.js, bound with the map's tools
  // the playback's layout (owner, 2026-11-01: the map always whole in the window): the controls above the map, a panel of tabs
  // on each side of it (curves, legs, computed routes; display, computing), each resized by its splitter and folded to a rail
  const px = (v, lo, hi, d) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : d);
  let gw = px(prefs.gw, 160, 1400, Math.round(Math.min(440, Math.max(260, innerWidth * 0.22)))), sw = px(prefs.sw, 200, 700, 280);
  // both panels unfolded at every opening, « Inter-postes » and « Affichage » (owner, 2026-11-04); their widths stay remembered
  const lp = { tab: "legs", collapsed: false };
  const rp = { tab: "display", collapsed: false };
  const savePrefs = () => { try { if (calibrated && traceSig()) localStorage.setItem(`ocn.an.lay.${traceSig()}`, JSON.stringify({ gw, sw })); localStorage.setItem(PREFS_KEY, JSON.stringify({ follow, colour, tail, width, wv: 2, strip: showStrip, graph, showCourse: courseOn, courseOver, future, chans: [...chans], mapAlpha, traceAlpha, traceColour, gw, sw, gcol: lp.collapsed, rcol: rp.collapsed, ltab: lp.tab, rtab: rp.tab, ex3d: v3ex, relief3d: v3relief, interval3d: v3interval,
    shotZone: shot.zone, shotType: shot.type, shotLegend: shot.legend, orient })); } catch (e) { /* not kept */ } };
  /** Whether the sequence of controls is known complete: the published split times or a course file give it. A course
   *  read on the map alone may miss controls, and legs numbered from what was found would mislead. */
  // the controls' order is known: published splits, an IOF course, the organiser's, a drawing, or the course's legs followed on
  // the map (course.js `order`, since 2026-11-01; owner 2026-11-04: « Inter-postes » for the trainings read on their map too)
  const sequenceKnown = () => !!officialTaus() || !!(files.iof?.data?.courses[iofIndex]) || !!files.orga || drawnHere() || mapOrdered;
  let legs = [], total = 0, raf = 0, last = 0, pxs = null, pys = null, fullPath = null, scrubbing = false;
  // a leg opened from « Inter-postes » (owner, 2026-11-07: as « Analyse de carte »): the time line and the playback on it alone,
  // ⏮ ⏭ from leg to leg, the way back to the whole course beside the leg's name on the map; -1 = the whole course
  let legSel = -1;
  let vLo = 0, vHi = 1, vSet = false;                 // the colours' range (rangeOf: the pace's 10-90 %, the other channels' 5-95 %)
  const canvas = $("#an-canvas"), ctx = canvas.getContext("2d");
  const layoutEl = $("#an-layout");
  let lastBox = null;                                   // the map's box when the view was last set (its centre kept on a resize)
  const strip = $("#an-strip");

  const steps = (n) => {
    const labels = perso ? [t("an.s2"), t("an.s3"), t("an.s4")] : [t("an.s1"), t("an.s2"), t("an.s3"), t("an.s4")];
    if (perso) n = Math.max(1, n - 1);                    // no race to choose: three steps
    $("#an-steps").innerHTML = html`${labels.map((s, i) => html`<li class="${i + 1 < n ? "done" : i + 1 === n ? "now" : ""}"><b>${i + 1}</b> ${s}</li>`)}`;
  };
  const stage = () => (!map || !track ? 2 : calibrated ? 4 : 3);
  // an organiser's competition read without a runner of the results (« — »): one with no published times, as a training's
  const nobody = { name: "", status: null };
  const runner = () => (ri < 0 ? nobody : docs[di]?.classes[ci]?.runners[ri]), klass = () => docs[di]?.classes[ci];
  /** The runner's official sequence of race times: start, the controls, the finish (null where unknown), or null. */
  const officialTaus = () => { const r = runner(); if (!r?.splits || !timesApply()) return null; return [0, ...r.splits, r.status === "ok" && r.time_s != null ? r.time_s : null]; };
  const totalOfficial = () => { const r = runner(); return r && r.status === "ok" && r.time_s != null && timesApply() ? r.time_s : null; };
  /**
   * The selected runner's published times are this trace's: the trace is of the race's day, and their start, when
   * published, falls within the trace. Else they are another race's or another runner's — the account's sprint of the
   * next day (25:01) ended Nadejda's night race at 25:01, then started it at control 7 (owner, 2026-10-15) — and the
   * page reads the race on the trace alone.
   */
  function timesApply() {
    if (!withTimes || ri < 0) return false;
    const r = docs[di]?.classes[ci]?.runners[ri];
    if (!r || !track || !race?.date_iso) return !!r;
    if (parisDay(track.ms0) !== race.date_iso) return false;
    const s = startOf(r), t0 = traceStartS();
    return s == null || (s >= t0 - 300 && s <= t0 + track.dur);
  }
  /** Why the selected runner's times are not used, said on the calibration and on the display. */
  function timesNote() {
    if (!withTimes || ri < 0 || !track || !race?.date_iso || timesApply()) return "";
    const day = parisDay(track.ms0);
    return day !== race.date_iso ? t("an.st.otherDay", { d1: fmtDate(day), d2: fmtDate(race.date_iso) }) : t("an.st.otherRunner", { r: runner()?.name || "" });
  }
  let matchedNote = "";
  let likely = null;                                       // « Analyse solo »: the race or the map analysis a track seems to be of

  // ---- 1. the race, the circuit, the runner
  async function loadRace() {
    if (orgaMode) await loadOrgaMap();
    if (orgaRace && await loadOrgaRace()) return;
    if (perso) {                                          // no race: one runner, the account's
      race = { key: "perso", name: orgaMode ? orga.A.title : t("an.perso.title"), date_iso: null, docs: [] };
      docs = [{ source: "", title: "", classes: [{ name: "", controls: null, runners: [{ name: me?.nom || "", status: null }] }] }];
      di = 0; ci = 0; ri = 0;
      return;
    }
    race = await getProv(`${encodeURIComponent(key)}.json`);
    docs = (race?.docs || []).filter((d) => d.classes?.length && d.by !== "category");
    const rank = (d) => (d.classes.some((k) => k.runners.some((r) => r.splits)) ? 1e9 : 0) + (d.prio ?? 0);
    docs.sort((a, b) => rank(b) - rank(a));
    const wanted = query.r || null;
    const pick = (test, only = null) => { for (let i = 0; i < docs.length; i++) { if (only != null && i !== only) continue;
      for (let j = 0; j < docs[i].classes.length; j++) { const n = docs[i].classes[j].runners.findIndex(test); if (n >= 0) return [i, j, n]; } } return null; };
    // a runner named in the address is looked for in the document it names first (a reload, a tab opened by « ↗ »: the
    // same document, so the same calibration), then in every document
    const qd = Number.isInteger(Number(query.doc)) && docs[Number(query.doc)] ? Number(query.doc) : null;
    [di, ci, ri] = (wanted && qd != null && pick((r) => r.name === wanted, qd)) || (wanted && pick((r) => r.name === wanted))
      || (me && pick((r) => r.lic && r.lic === me.lic)) || [0, 0, 0];
    if (Number.isInteger(Number(query.doc)) && docs[Number(query.doc)] && !wanted) { di = Number(query.doc); ci = Math.min(Number(query.c) || 0, docs[di].classes.length - 1); ri = 0; }
    if (query.r && docs[di]?.classes[ci]) { const n = docs[di].classes[ci].runners.findIndex((r) => r.name === query.r); if (n >= 0) ri = n; }
  }
  /** An organiser's competition: its published results, the runner in them (the address's, the account's row — in the
   *  circuit's class with split times first —, else the run that fits the trace, else none: ri −1). False without results. */
  async function loadOrgaRace() {
    let data = null;
    try { data = await getProv(`${encodeURIComponent(orgaRace)}.json`); } catch (e) { data = null; }
    const list = (data?.docs || []).filter((d) => d.classes?.length && d.by !== "category");
    withTimes = list.length > 0;
    if (!withTimes) return false;
    race = data; docs = list;
    const rank = (d) => (d.classes.some((k) => k.runners.some((r) => r.splits)) ? 1e9 : 0) + (d.prio ?? 0);
    docs.sort((a, b) => rank(b) - rank(a));
    pickOrgaRunner(query.r || null);
    return true;
  }
  /** The class of the organiser's circuit (by its name), with split times first: [di, ci], or null. */
  function circuitClass() {
    const c = orga.A.courses.find((x) => x.n === orgaN), name = c?.circuit || c?.name || "";
    let best = null;
    docs.forEach((d, i) => d.classes.forEach((k, j) => { if (k.name === name && (!best || (!best.sp && k.runners.some((x) => x.splits)))) best = { di: i, ci: j, sp: k.runners.some((x) => x.splits) }; }));
    return best ? [best.di, best.ci] : null;
  }
  function pickOrgaRunner(name) {
    const hits = [];
    docs.forEach((d, i) => d.classes.forEach((k, j) => k.runners.forEach((x, n) => hits.push({ x, k, at: [i, j, n] }))));
    const cc = circuitClass(), better = (a, b) => (a.x.splits ? 2 : 0) + (cc && a.at[0] === cc[0] && a.at[1] === cc[1] ? 1 : 0) - ((b.x.splits ? 2 : 0) + (cc && b.at[0] === cc[0] && b.at[1] === cc[1] ? 1 : 0));
    const best = (test) => hits.filter(test).sort((a, b) => better(b, a))[0] || null;
    let h = (name && best((q) => q.x.name === name)) || (me?.lic && best((q) => q.x.lic && String(q.x.lic) === String(me.lic))) || null;
    if (!h && track) {
      let sc = null;
      for (const q of hits) { if (q.x.status === "dns") continue; const v = runFit(startOf(q.x), q.x); if (v != null && (sc == null || v < sc)) { sc = v; h = q; } }
    }
    if (h) [di, ci, ri] = h.at;
    else { [di, ci] = cc || [0, 0]; ri = -1; }
  }
  /** The organiser's circuit `orgaN`: its map (the stored image, never re-encoded), its controls and georeferencing. */
  async function loadOrgaMap() {
    const c = orga.A.courses.find((x) => x.n === orgaN);
    if (files.orga?.n === c.n && map) return;
    const r = await fetch(`api/analyses/${orga.id}/map/${c.n}?v=${c.map?.v || 0}`, { credentials: "same-origin", headers: orga.key ? { "X-Analysis-Key": orga.key } : {} });
    if (!r.ok) { map = null; files.map = { name: c.name, note: t("an.orga.err") }; return; }
    map = await createImageBitmap(await r.blob());
    files.map = { name: c.name, detail: `${t("an.orga.map")} · ${map.width} × ${map.height}` };
    files.orga = { n: c.n, geo: c.geo, r: c.r || 20, controls: c.controls || [], printed: typeof c.printed === "boolean" ? c.printed : orga.A.via === "tracer" };
    // the route choices' layers drawn from the organiser's OCAD map at its publication (owner, 2026-11-05)
    if (c.layers?.map && c.layers.map === c.map?.v) {
      try {
        const lr = await fetch(`api/analyses/${orga.id}/layers/${c.n}?v=${c.map.v}`, { credentials: "same-origin", headers: orga.key ? { "X-Analysis-Key": orga.key } : {} });
        const L = lr.ok ? await (await import("../trace/vectorroutes.js")).unpackLayers(await lr.arrayBuffer()) : null;
        if (L && L.w === map.width && L.h === map.height) files.orga.layers = L;
      } catch (e) { console.warn(e); }
    }
    courseCache = null;
    key = `orga.${orga.id}.${c.n}`;
  }
  function pickers() {
    if (orgaMode) {
      const A = orga.A;
      $("#an-pick").innerHTML = html`<div class="field"><span>${t("an.orga.event")}</span><b class="an-orga-ev">${A.title}</b>
          <span class="muted">${[fmtDate(A.date), A.ownerName].filter(Boolean).join(" · ")}</span></div>
        <label class="field"><span>${t("prov.circuit")}</span><select id="an-oc">${A.courses.map((c) => html`<option value="${c.n}" ${raw(c.n === orgaN ? "selected" : "")}>${c.name}</option>`)}</select></label>
        ${withTimes ? runnerFields(true) : ""}`;
      $("#an-oc").addEventListener("change", async (e) => {
        orgaN = Number(e.target.value); await loadOrgaMap();
        if (withTimes && ri < 0) { const cc = circuitClass(); if (cc) [di, ci] = cc; }
        pickers(); filesCard(); setup();
      });
      if (withTimes) bindRunnerFields(true);
      replaceQuery({ id: orga.id, c: orgaN, r: withTimes && ri >= 0 ? runner()?.name : null });
      return;
    }
    if (perso) { $("#an-pick").hidden = true; return; }
    $("#an-pick").innerHTML = html`
      <label class="field"><span>${t("prov.race")}</span><select id="an-race" style="max-width:420px">${races.filter((r) => r.key === key || (country.of(r) === country.current() && (!RF || RF.keep(r)))).map((r) => html`<option value="${r.key}" ${raw(r.key === key ? "selected" : "")}>${fmtDate(r.date_iso, "short")} · ${r.name}${r.splits ? "" : ` (${t("an.noSplitsShort")})`}</option>`)}</select></label>
      ${docs.length ? runnerFields(false) : html`<div class="field"><span></span><span class="muted">${t("an.noList")}</span></div>`}`;
    // a choice by hand: the race found from the trace is no longer the one shown
    $("#an-race").addEventListener("change", async (e) => { key = e.target.value; query = {}; matchedNote = ""; await loadRace(); pickers(); setup(); });
    bindRunnerFields(false);
    replaceQuery({ course: key, doc: di || null, c: ci || null, r: runner()?.name || null });
    try { sessionStorage.setItem(selKey, JSON.stringify({ course: key, doc: di || null, c: ci || null, r: runner()?.name || null })); } catch (e) { /* not kept */ }
  }

  /** The results' document, class and runner selects (an organiser's competition: « — », no runner, first). */
  function runnerFields(none) {
    const k = klass();
    return html`${docs.length > 1 ? html`<label class="field"><span>${t("prov.doc")}</span><select id="an-doc" style="max-width:320px">${docs.map((d, i) => html`<option value="${i}" ${raw(i === di ? "selected" : "")}>${d.source} · ${d.title || decodeURIComponent((d.url || "").split("/").pop())}</option>`)}</select></label>` : ""}
      <label class="field"><span>${t(none ? "an.orga.class" : "prov.circuit")}</span><select id="an-c">${docs[di].classes.map((x, i) => html`<option value="${i}" ${raw(i === ci ? "selected" : "")}>${x.name} (${x.runners.length})</option>`)}</select></label>
      <label class="field"><span>${t("prov.runner")}</span><select id="an-r" style="max-width:300px">${none ? html`<option value="-1" ${raw(ri < 0 ? "selected" : "")}>${t("an.orga.noRunner")}</option>` : ""}${k.runners.map((r, i) => html`<option value="${i}" ${raw(i === ri ? "selected" : "")}>${r.place ? `${r.place}. ` : ""}${r.name}${r.club ? ` (${r.club})` : ""}${r.splits ? "" : ` — ${t("an.noSplitsShort")}`}</option>`)}</select></label>`;
  }
  function bindRunnerFields(none) {
    const first = none ? -1 : 0;
    $("#an-doc")?.addEventListener("change", (e) => { di = Number(e.target.value); ci = 0; ri = first; matchedNote = ""; pickers(); setup(); });
    $("#an-c")?.addEventListener("change", (e) => { ci = Number(e.target.value); ri = first; matchedNote = ""; pickers(); setup(); });
    $("#an-r")?.addEventListener("change", (e) => { ri = Number(e.target.value); matchedNote = ""; pickers(); setup(); });
  }

  // ---- 2. the files
  function filesCard() {
    const row = (role, f, extra = "") => html`<tr><th>${t(`an.role.${role}`)}</th><td>${f ? html`<b>${f.name}</b>${f.detail ? html` <span class="muted">· ${f.detail}</span>` : ""}` : html`<span class="muted">${t(`an.role.${role}.none`)}</span>`}${extra}
      ${f?.note ? html`<div class="notice" style="margin-top:4px">${f.note}</div>` : ""}</td></tr>`;
    const iof = files.iof;
    const courseSel = iof?.data?.courses?.length > 1 ? html` <select id="an-iof-course" style="margin-left:8px">${iof.data.courses.map((c, i) => html`<option value="${i}" ${raw(i === iofIndex ? "selected" : "")}>${c.name || `#${i + 1}`}${c.length ? ` · ${fmt(c.length / 1000, 1)} km` : ""}</option>`)}</select>` : "";
    $("#an-files").innerHTML = html`<div class="card-body">
      ${touchScreen()
        // a phone (owner, 2026-11-06): a button opens its file picker — nothing is dropped there; on the organiser's map a trace
        // only, so no photos (traceAccept)
        ? html`<label class="btn btn-primary an-pick" id="an-drop"><input type="file" id="an-in" multiple hidden accept="${orgaMode ? traceAccept() : fileAccept(ACCEPT)}">${t(orgaMode ? "an.orga.pick" : "an.pick")}</label>
          <p class="muted an-pick-hint">${t(orgaMode ? "an.orga.drop.hint" : "an.drop.hint")}</p>`
        : html`<label class="dropzone an-drop" id="an-drop"><input type="file" id="an-in" multiple hidden accept="${orgaMode ? traceAccept() : fileAccept(ACCEPT)}">
        <strong>${t(orgaMode ? "an.orga.drop" : "an.drop")}</strong><span class="muted">${t(orgaMode ? "an.orga.drop.hint" : "an.drop.hint")}</span></label>`}
      ${matchMedia("(pointer: coarse)").matches && !orgaMode ? html`<div class="an-cam-row"><label class="btn btn-primary an-cam"><input type="file" id="an-cam" accept="image/*" capture="environment" hidden>${t("an.cam")}</label>
        <span class="muted">${t("an.cam.hint")}</span></div>` : ""}
      ${phone.offered() ? html`<div class="an-cam-row">${phone.button("an-phone")}<span class="muted">${t(orgaMode ? "ph.hint.trace" : "ph.hint.any")}</span></div>` : ""}
      <p class="hint an-fit-tip">${t("an.fitTip")}</p>
      <table class="data compact an-filelist"><tbody>
        ${row("map", files.map)}${row("trace", files.trace)}${orgaMode ? "" : html`${row("geo", files.geo || files.world, files.world && files.prj ? html` <span class="muted">+ ${files.prj.name}</span>` : "")}${row("iof", files.iof, courseSel)}`}${files.vector ? row("vector", files.vector) : ""}
      </tbody></table>
      ${likelyBlock()}
      ${drawBlock()}
      ${cutBlock()}
      ${genBlock()}
      ${orgaMode ? html`<div style="margin-top:8px">${keepBox()}</div>` : ""}
      <p class="muted" style="font-size:13px;margin:10px 0 0">${t("an.private")}${restoredFiles ? html` <span class="pill">${t("an.files.kept")}</span>` : ""}
        ${(files.map && !orgaMode) || files.trace ? html` <button type="button" class="btn btn-sm" id="an-forget" style="margin-left:8px">${t("an.forget")}</button>` : ""}</p>
      <details class="an-formats" ${raw(orgaMode ? "hidden" : "")}><summary>${t("an.formats")}</summary><ul>
        <li>${t("an.formats.map")}</li><li>${t("an.formats.trace")}</li><li>${t("an.formats.geo")}</li><li>${t("an.formats.iof")}</li><li>${t("an.formats.ocad")}</li></ul></details>
      </div>`;
    $("#an-in").addEventListener("change", (e) => { take([...e.target.files]); e.target.value = ""; });
    bindKeepBox($("#an-files"));
    $("#an-cam")?.addEventListener("change", (e) => { take([...e.target.files]); e.target.value = ""; });
    phone.bind("an-phone", { kind: orgaMode ? "trace" : "any", multiple: !orgaMode, onFiles: (f) => take(f) });
    $("#an-forget")?.addEventListener("click", () => {
      stop(); prepToken++;                                  // a calibration under way stops with its files
      for (const role of Object.keys(files)) if (!(orgaMode && (role === "map" || role === "orga"))) files[role] = null;   // the organiser's map stays
      if (!orgaMode) map = null;
      track = traceFull = null; courseCache = null; course = null; restoredFiles = false; memos[pageMode] = null;
      idbWrite(null, fileKey).catch(() => {});
      filesCard(); setup();
    });
    const drop = $("#an-drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take([...e.dataTransfer.files]); });
    $("#an-iof-course")?.addEventListener("change", (e) => { iofIndex = Number(e.target.value); setup(); });
    $("#an-gen")?.addEventListener("click", () => genMap());
    $("#an-draw-go")?.addEventListener("click", () => startDraw());
    $("#an-draw-gpx")?.addEventListener("click", () => downloadDrawn());
    bindCut();
    bindLikely();
  }
  // ---- the race a track seems to be of (owner, 2026-11-04: « Une compétition » left « Analyse de carte »'s first page): on one's own
  // map, a track whose day and place fit a race of « Résultats » — one the account is listed in, or within 40 km — or an event
  // whose organiser opened a map analysis — its map within 25 km — is offered there: the race with its published times
  // (#/analyse, the files handed over), the event with the other runners or alone on the organiser's map (the track handed over)
  const distKm = (a, b) => {
    const k = Math.PI / 180, dLat = (b[0] - a[0]) * k, dLon = (b[1] - a[1]) * k;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  async function findLikely(tr) {
    likely = null;
    const day = parisDay(tr.ms0), here = [tr.lat0, tr.lon0];
    const all = idx ? races : ((await getProv("index.json").catch(() => null))?.races || []).filter((r) => r.docs && !r.soon);   // « Analyse solo » reads none at first
    const rcs = all.filter((r) => r.date_iso === day).map((r) => ({ r, d: r.pos ? distKm(here, r.pos) : null, mine: !!me?.lic && (r.lics || []).includes(me.lic) }))
      .filter((x) => x.mine || (x.d != null && x.d <= 40)).sort((a, b) => (b.mine - a.mine) || (a.d ?? 99) - (b.d ?? 99)).slice(0, 2);
    let ans = [];
    try {
      const res = await fetch(`api/analyses${me ? "" : "/v"}`, { credentials: "same-origin" });
      const d = res.ok ? await res.json() : null;
      ans = (d?.analyses || []).filter((a) => a.date === day && a.courses > 0 && !a.draft && a.pos && distKm(here, a.pos) <= 25)
        .sort((a, b) => distKm(here, a.pos) - distKm(here, b.pos)).slice(0, 2);
    } catch (e) { /* the races alone */ }
    if (traceFull !== tr) return;                          // another track since
    if (rcs.length || ans.length) likely = { races: rcs.map((x) => x.r), analyses: ans };
    filesCard();
  }
  function likelyBlock() {
    if (!likely || !perso || orgaMode) return "";
    const rows = [
      ...likely.analyses.map((a) => html`<div class="an-likely-row"><div><b>${a.title}</b> <span class="muted">· ${fmtDate(a.date)} · ${t("an.likely.map")}</span></div>
        <div class="an-likely-acts">${me && a.upload !== false ? html`<button type="button" class="btn btn-sm btn-primary" data-likely-multi="${a.id}">${t("ma.go.add")}</button>` : ""}
          ${me && a.solo !== false ? html`<button type="button" class="btn btn-sm" data-likely-solo="${a.id}">${t("an.likely.orgaMap")}</button>` : ""}
          ${!me ? html`<a class="btn btn-sm" href="${multiHref(a)}">${t("ma.go.view")}</a>` : ""}</div></div>`),
      ...likely.races.filter((r) => !likely.analyses.some((a) => a.race === r.key)).map((r) => html`<div class="an-likely-row"><div><b>${r.name}</b> <span class="muted">· ${[fmtDate(r.date_iso), r.place].filter(Boolean).join(" · ")} · ${t(r.splits ? "an.likely.splits" : "an.likely.results")}</span></div>
        <div class="an-likely-acts"><button type="button" class="btn btn-sm btn-primary" data-likely-race="${r.key}">${t("an.likely.times")}</button></div></div>`),
    ];
    if (!rows.length) return "";
    return html`<div class="notice an-likely"><p class="an-likely-h"><b>${t("an.likely.title")}</b>
      <button type="button" class="btn btn-sm an-likely-x" id="an-likely-x" title="${t("an.likely.dismiss")}" aria-label="${t("an.likely.dismiss")}">×</button></p>${rows}</div>`;
  }
  function bindLikely() {
    $("#an-likely-x")?.addEventListener("click", () => { likely = null; filesCard(); });
    const all = () => Object.values(files).map((f) => f?.file).filter(Boolean);
    const traceFile = () => (files.trace?.file ? [files.trace.file] : []);
    $$("[data-likely-race]").forEach((b) => b.addEventListener("click", () => handOver([...new Set(all())], `#/analyse?course=${encodeURIComponent(b.dataset.likelyRace)}`)));
    $$("[data-likely-multi]").forEach((b) => b.addEventListener("click", () => {
      const a = likely.analyses.find((x) => x.id === b.dataset.likelyMulti);
      handOver(traceFile(), multiHref(a, true));
    }));
    $$("[data-likely-solo]").forEach((b) => b.addEventListener("click", () => handOver(traceFile(), orgaHref(b.dataset.likelySolo))));
  }
  // ---- « Couper la trace » (owner, 2026-11-01, after QuickRoute): the trace's start and end left out — a warm-up, the walk
  // back — kept per trace on this device (`ocn.an.cut.<the whole trace's signature>`: seconds from its first point); the part
  // kept is in the whole trace's frame, so that a calibration made before the cut still holds (its record follows the cut)
  const CUT_KEY = "ocn.an.cut";
  const sigOf = (tr) => `${Math.round(tr.ms0 / 1000)}:${tr.n}`;
  function savedCut(full) { try { const c = JSON.parse(localStorage.getItem(`${CUT_KEY}.${sigOf(full)}`) || "null"); return c && c.s1 > c.s0 ? c : null; } catch (e) { return null; } }
  /** The trace with its saved cut, else the whole of it. */
  function withCut(full) {
    const c = full && savedCut(full);
    return c && (c.s0 > 0 || c.s1 < full.dur) ? cutTrack(full, c.s0, c.s1) : full;
  }
  function traceDetail() {
    const others = Object.keys(track.ch).filter((c) => c !== "ele");
    return [t(`an.src.${track.source}`), `${fmt(track.n)} ${t("an.points")}`, clock(track.dur), ...(others.length ? [others.map((c) => t(CHANNEL_LABEL[c])).join(", ")] : []),
      ...(track.cut ? [t("an.cut.done", { a: clock(track.cut.s0), b: clock(traceFull.dur - track.cut.s1) })] : [])].join(" · ");
  }
  const timeOfDay = (full, s) => dateFormat({ hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(full.ms0 + s * 1000));
  /** The files card's block: two sliders over the whole trace's pace, the parts left out shaded. */
  function cutBlock() {
    if (traceFull?.drawn) return "";
    if (!traceFull) return "";
    const D = Math.floor(traceFull.dur), a = track.cut ? Math.round(track.cut.s0) : 0, b = track.cut ? Math.round(track.cut.s1) : D;
    return html`<details class="an-cut" ${raw(track.cut ? "open" : "")}><summary>✂ ${t("an.cut.title")}${track.cut ? html` <span class="an-cut-now">· ${t("an.cut.done", { a: clock(track.cut.s0), b: clock(traceFull.dur - track.cut.s1) })}</span>` : ""}</summary>
      <div class="an-cut-acts" id="an-cut-ends"></div>
      <canvas class="an-cut-prof" id="an-cut-prof" height="44"></canvas>
      <div class="an-cut-row"><label><span>${t("an.cut.start")}</span><input type="range" id="an-cut-a" min="0" max="${D}" step="1" value="${a}"></label><span class="an-cut-v" id="an-cut-a-v"></span></div>
      <div class="an-cut-row"><label><span>${t("an.cut.end")}</span><input type="range" id="an-cut-b" min="0" max="${D}" step="1" value="${b}"></label><span class="an-cut-v" id="an-cut-b-v"></span></div>
      <div class="an-cut-acts"><button type="button" class="btn btn-sm btn-primary" id="an-cut-apply">${t("an.cut.apply")}</button>
        <button type="button" class="btn btn-sm" id="an-cut-reset" ${raw(track.cut ? "" : "disabled")}>${t("an.cut.whole")}</button></div>
      <p class="muted an-cut-hint">${t("an.cut.hint")}</p></details>`;
  }
  function bindCut() {
    const A = $("#an-cut-a"), B = $("#an-cut-b"), prof = $("#an-cut-prof");
    if (!A || !traceFull) return;
    const full = traceFull, D = full.dur;
    const show = () => {
      const a = Number(A.value), b = Number(B.value);
      $("#an-cut-a-v").textContent = `${timeOfDay(full, a)} · +${clock(a)}`;
      $("#an-cut-b-v").textContent = `${timeOfDay(full, b)} · −${clock(D - b)}`;
      // the pace over the whole trace (its speed, capped at 6 m/s), the parts left out greyed
      const dpr = window.devicePixelRatio || 1, w = prof.clientWidth, h = prof.clientHeight;
      if (!w) return;
      prof.width = Math.round(w * dpr); prof.height = Math.round(h * dpr);
      const g = prof.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const X = (s) => (s / D) * w, top = Math.max(1, ...Array.from(full.v, (v) => Math.min(6, v)));
      g.beginPath(); g.moveTo(0, h);
      for (let i = 0; i < full.n; i++) g.lineTo(X(full.t[i]), h - (Math.min(6, full.v[i]) / top) * (h - 4));
      g.lineTo(w, h); g.closePath();
      g.fillStyle = curveColour("pace"); g.fill();
      g.fillStyle = "rgba(128, 128, 128, 0.55)";
      g.fillRect(0, 0, X(a), h); g.fillRect(X(b), 0, w - X(b), h);
    };
    const keep = (who) => { if (Number(B.value) - Number(A.value) < 60) { if (who === A) A.value = Math.max(0, Number(B.value) - 60); else B.value = Math.min(D, Number(A.value) + 60); } show(); };
    A.addEventListener("input", () => keep(A)); B.addEventListener("input", () => keep(B));
    $(".an-cut").addEventListener("toggle", show);
    $("#an-cut-apply").addEventListener("click", () => applyCut(Number(A.value), Number(B.value)));
    $("#an-cut-reset").addEventListener("click", () => applyCut(0, D));
    show();
    cutEnds();
  }
  /**
   * The race's start and finish on the whole trace's clock, when the calibration found them (owner, 2026-11-01: « cut before
   * the start and after the finish when those are detected », from the files card): the start's departure, else the published
   * start; the finish's arrival, else the start plus the published time. null for an end not known.
   */
  function raceEnds() {
    if (!fit || offset == null || !traceFull) return { start: null, finish: null };
    const base = track.cut ? track.cut.s0 : 0;
    const st = targets.find((g) => g.kind === "start"), fin = targets.find((g) => g.kind === "finish"), tot = totalOfficial();
    const start = (st?.pos && st.tEst != null) || guessOffset() != null ? base + offset : null;
    const finish = fin?.pos && fin.tEst != null ? base + fin.tEst : tot != null ? base + offset + tot : null;
    return { start, finish: finish != null && (start == null || finish > start + 60) ? finish : null };
  }
  const CUT_MARGIN = 10;                                // seconds kept before the start and after the finish
  /** The files card's buttons: cut before the start, after the finish, as the calibration found them. */
  function cutEnds() {
    const box = $("#an-cut-ends");
    if (!box || !traceFull) return;
    const { start, finish } = raceEnds(), full = traceFull;
    const s0 = track.cut ? track.cut.s0 : 0, s1 = track.cut ? track.cut.s1 : full.dur;
    const a = start != null ? Math.max(0, start - CUT_MARGIN) : null, b = finish != null ? Math.min(full.dur, finish + CUT_MARGIN) : null;
    const offA = a != null && a > s0 + 1, offB = b != null && b < s1 - 1;          // something left to cut there
    box.innerHTML = start == null && finish == null ? html`<span class="muted">${t("an.cut.noEnds")}</span>`
      : html`${start != null ? html`<button type="button" class="btn btn-sm" id="an-cut-start" ${raw(offA ? "" : "disabled")}>${t("an.cut.atStart", { t: timeOfDay(full, start) })}</button>` : ""}
        ${finish != null ? html`<button type="button" class="btn btn-sm" id="an-cut-finish" ${raw(offB ? "" : "disabled")}>${t("an.cut.atFinish", { t: timeOfDay(full, finish) })}</button>` : ""}
        ${offA && offB ? html`<button type="button" class="btn btn-sm btn-primary" id="an-cut-both">${t("an.cut.both")}</button>` : ""}`;
    $("#an-cut-start")?.addEventListener("click", () => applyCut(a, s1));
    $("#an-cut-finish")?.addEventListener("click", () => applyCut(s0, b));
    $("#an-cut-both")?.addEventListener("click", () => applyCut(a, b));
  }
  /** The cut set: the trace taken again from the whole one, the calibration carried over, the page redone (back to the
   *  playback when it was on). s0, s1: seconds of the whole trace. */
  function applyCut(s0, s1) {
    if (!traceFull) return;
    const full = traceFull, whole = s0 <= 0 && s1 >= full.dur - 0.5;
    const oldSig = traceSig(), rec = savedPositions();
    try { if (whole) localStorage.removeItem(`${CUT_KEY}.${sigOf(full)}`); else localStorage.setItem(`${CUT_KEY}.${sigOf(full)}`, JSON.stringify({ s0, s1 })); } catch (e) { /* not kept */ }
    const back = calibrated;
    track = withCut(full);
    if (files.trace) files.trace.detail = traceDetail();
    // the calibration's geometry is in the whole trace's metres: it holds for the part kept. The one in hand is saved for the
    // new trace — the record kept during the automatic calibration has no geometry yet, and the part kept alone was laid
    // afresh (a cut at mid-race turned the map 29°) —, else a record of this trace follows it
    if (fit && targets.some((g) => g.pos)) savePositions(calibrated);
    else if (rec && rec.trace === oldSig && traceSig() !== oldSig) { rec.trace = traceSig(); try { localStorage.setItem(calKey(), JSON.stringify(rec)); } catch (e) { /* not kept */ } }
    autoPlay = back;
    filesCard(); setup();
  }

  // ---- a map generated from IGN's LiDAR HD and OpenStreetMap (trace/lidarmap.js; a prototype, administrators only)
  const genCredit = () => { const c = LM.creditOf(files.map?.name); return raw(t("an.gen.credit", { ign: html`<a href="${c.url}" target="_blank" rel="noopener">${c.text}</a>`,
    osm: html`<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${t("an.gen.osm")}</a>` })); };
  /** The files card's block: the credit of a generated map shown, else, for a trace without a map, the offer to make one. */
  function genBlock() {
    if (LM.isGenerated(files.map?.name)) return html`<p class="muted an-gen-credit-line">${genCredit()}${gen?.msg ? html` <b>${gen.msg}</b>` : ""}</p>`;
    if (!me?.admin || !track || (map && !gen?.busy)) return "";
    const style = genStyle || (/sprint/i.test(`${race?.epreuve || ""} ${race?.name || ""}`) ? "sprint" : "forest");
    return html`<div class="an-gen"><b>${t("an.gen.title")}</b>
      <label class="an-gen-style">${t("an.gen.style")} <select id="an-gen-style" ${raw(gen?.busy ? "disabled" : "")}>
        <option value="forest" ${raw(style === "forest" ? "selected" : "")}>${t("an.gen.forest")}</option>
        <option value="sprint" ${raw(style === "sprint" ? "selected" : "")}>${t("an.gen.sprint")}</option></select></label>
      <button type="button" class="btn btn-sm btn-primary" id="an-gen" ${raw(gen?.busy ? "disabled" : "")}>${t("an.gen.btn")}</button>
      ${gen?.msg ? html`<span class="an-gen-state${gen.busy ? " busy" : ""}" role="status">${gen.busy ? raw(bar(gen.frac)) : ""}<span class="an-gen-msg">${gen.msg}</span>${gen.ask ? html` <a href="${gen.ask}" target="_blank" rel="noopener">${t("an.gen.ask")}</a>` : ""}</span>` : ""}
      <p class="muted">${t("an.gen.hint")}</p></div>`;
  }
  async function genMap() {
    if (!track || gen?.busy) return;
    const style = $("#an-gen-style")?.value === "sprint" ? "sprint" : "forest";
    genStyle = style;
    // the wait shown: its line and bar updated in place while it lasts (every 2 s), the card drawn again when it starts or ends
    const say = (msg, busy = true, frac = null) => {
      if (my !== genToken) return;
      const el = $(".an-gen-state.busy");
      if (busy && gen?.busy && el) { gen = { busy, msg, frac }; el.querySelector(".an-gen-msg").textContent = msg; setBar(el.querySelector("progress"), frac); return; }
      gen = { busy, msg, frac }; filesCard();
    };
    const my = ++genToken;
    if (!LM.covered(track.lat0, track.lon0)) {
      // no open LiDAR read for that country yet: the way to ask Ozimut for it (whatever the account's own countries)
      const where = `${track.lat0.toFixed(4)}, ${track.lon0.toFixed(4)}`;
      gen = { busy: false, msg: t("an.gen.outside"), ask: `#/contact?${new URLSearchParams({ sujet: t("an.gen.askSubject", { where }), from: location.hash || "#/" })}` };
      filesCard(); return;
    }
    const area = LM.areaOf(track);
    if (area.ids.length > LM.MAX_TILES) return say(t("an.gen.tooBig", { n: fmt(area.km2, 1), max: LM.MAX_TILES }), false);
    try {
      const made = await LM.make(area, style, (key, vars, frac) => say(t(key, vars), true, frac), () => my !== genToken);
      if (!made) return;
      gen = made.partial ? { busy: false, msg: t("an.gen.partial") } : null;
      for (const role of ["map", "geo", "world", "prj"]) files[role] = null;
      await take(made.files);
    } catch (e) {
      console.error(e);
      say(t(e.message === "none" ? "an.gen.none" : "an.gen.failed"), false);
    }
  }
  /** An image of the map replaces an OCAD or Mapper map shown: the vector map is kept for the computed routes. */
  function keepVector() {
    const m = files.map;
    if (!m?.vec) return;
    files.vector = { name: m.name, file: m.file, detail: m.detail.replace(/^\d+ × \d+ · /, ""), note: m.vec.v.geo ? "" : t("an.vec.noGeoRoutes"), vec: { v: m.vec.v } };
    if (files.geo?.kind === "vector") files.geo = null;
  }
  async function take(list, { remember = true } = {}) {
    let newTrace = false;
    if (orgaMode) list = list.filter((f) => isTraceName(f.name));          // the map and its course are the organiser's
    for (const f of list) {
      const name = f.name, low = name.toLowerCase();
      for (const role of Object.keys(files)) if (files[role]?.file === f) files[role] = null;
      try {
        if (isTraceName(name)) {
          newTrace = true;
          files.trace = { name, note: "" };
          filesCard();
          traceFull = parseTrace(name, await f.arrayBuffer());
          track = withCut(traceFull);
          // a run replayed from « Mes cartes » brings its own georeference and controls: a visit's other files go
          if (traceFull.drawn?.replay) for (const role of Object.keys(files)) if (role !== "map" && role !== "trace") files[role] = null;
          files.trace.detail = traceDetail();
          if (race?.date_iso) { const day = parisDay(track.ms0); if (day !== race.date_iso) files.trace.note = t("an.date.diff", { d1: fmtDate(day), d2: fmtDate(race.date_iso) }); }
        } else if (low.endsWith(".kmz")) {
          files.geo = { name, note: t("an.reading") }; filesCard();
          const entries = await readZip(await f.arrayBuffer());
          const kml = entries.find((e) => /\.kml$/i.test(e.name));
          const ovs = kml ? parseKml(new TextDecoder().decode(kml.data)) : [];
          if (!ovs.length) throw new Error("kmz");
          const ov = ovs[0], img = entries.find((e) => e.name.toLowerCase() === ov.href.toLowerCase().replace(/^\.\//, "")) || entries.find((e) => /\.(png|jpe?g|webp|gif)$/i.test(e.name));
          files.geo = { name, kind: "kmz", overlay: ov, note: "", detail: ov.quad ? "LatLonQuad" : `LatLonBox${ov.box.rot ? ` · ${fmt(ov.box.rot, 1)}°` : ""}` };
          if (img) { keepVector(); map = await createImageBitmap(new Blob([img.data])); files.map = { name: `${name} › ${img.name}`, note: "", detail: `${map.width} × ${map.height}` }; courseCache = null; }
          else files.geo.note = t("an.kmz.noImage");
        } else if (low.endsWith(".kml")) {
          const ovs = parseKml(await f.text());
          if (!ovs.length) throw new Error("kml");
          files.geo = { name, kind: "kml", overlay: ovs[0], note: "", detail: ovs[0].href ? `→ ${ovs[0].href}` : "" };
        } else if (isWorldFileName(name)) {
          const wf = parseWorldFile(await f.text());
          if (!wf) throw new Error("world");
          files.world = { name, wf, note: "" }; files.geo = null;
        } else if (low.endsWith(".prj")) {
          const crs = crsFromWkt(await f.text());
          files.prj = { name, crs, note: crs ? "" : t("an.prj.unknown"), detail: crs?.name || "" };
        } else if (low.endsWith(".xml")) {
          const text = await f.text();
          const data = parseIofCourse(text);
          if (data) { files.iof = { name, data, note: data.courses.length ? "" : t("an.iof.noCourse"), detail: `${data.courses.length} ${t("an.iof.courses")} · ${data.controls.size} ${t("prov.controls")}${[...data.controls.values()].some((c) => c.lat != null) ? ` · ${t("an.iof.geo")}` : ""}` }; iofIndex = pickCourse(data); }
          else if (/<gpx[\s>]/.test(text)) { files.trace = { name, note: "" }; traceFull = parseTrace(name, new TextEncoder().encode(text).buffer); track = withCut(traceFull); files.trace.detail = traceDetail(); }
          else throw new Error("xml");
        } else if (isVectorName(name)) {
          const bytes = new Uint8Array(await f.arrayBuffer()), asMap = !map || !!files.map?.vec;
          if (asMap) { files.map = { name, note: t("an.reading") }; filesCard(); }
          const v = await readVector(bytes, name);
          const kind = `${v.format === "ocad" ? `OCAD ${v.version}` : "OpenOrienteering Mapper"} · 1:${fmt(v.scale)}`;
          if (asMap) {
            const r = await renderVector(bytes, name);
            map = r.image; courseCache = null;
            files.map = { name, note: "", detail: `${map.width} × ${map.height} · ${kind}`, vec: { v, k: r.k } };
            if (files.geo?.kind === "vector") files.geo = null;
            // the map's own georeferencing: the image's corners on the globe
            const ll = latLonOf(v);
            if (ll && !files.geo && !files.world) files.geo = { name, kind: "vector", detail: v.geoName, corners: [[0, 0], [map.width, 0], [map.width, map.height], [0, map.height]].map(([x, y]) => ll(x / r.k, v.h - y / r.k)) };
            if (!ll) files.map.note = t("an.vec.noGeo");
          } else files.vector = { name, note: v.geo ? "" : t("an.vec.noGeoRoutes"), detail: kind, vec: { v } };
        } else if (isImage(f)) {
          keepVector();
          files.map = { name, note: t("an.reading") }; filesCard();
          map = await readMap(f); courseCache = null;
          files.map = { name, note: "", detail: `${map.width} × ${map.height}` };
        } else { notes.push(t("an.err.type", { f: name })); }
      } catch (e) {
        e.__role = true;
        const msg = { time: "an.err.time", gpx: "an.err.gpx", pdf: "an.err.pdf", map: "an.err.map", kmz: "an.err.kmz", kml: "an.err.kml", world: "an.err.world", xml: "an.err.xml" }[e.message] || "an.err.gpx";
        if (isTraceName(name) || e.message === "time" || e.message === "gpx") { track = traceFull = null; files.trace = { name, note: t(msg) }; }
        else if (low.endsWith(".kmz") || low.endsWith(".kml")) files.geo = { name, note: t(msg) };
        else if (isWorldFileName(name)) files.world = { name, note: t(msg) };
        else if (low.endsWith(".xml")) files.iof = { name, note: t(msg) };
        else if (isVectorName(name)) { console.error(e); if (files.map?.name === name && !files.map.vec) { map = null; files.map = { name, note: t("rc.vec.failed") }; } else files.vector = { name, note: t("rc.vec.failed") }; }
        else { map = null; files.map = { name, note: t(msg) }; }
      }
      // the file itself, with its role (a KMZ gives both the map and its georeferencing)
      for (const role of Object.keys(files)) { const rec = files[role]; if (rec && !rec.file && (rec.name === name || rec.name?.startsWith(`${name} › `))) rec.file = f; }
    }
    if (remember) rememberFiles();
    // the race of the trace, for a trace just dropped only: files read back (a reload, a tab opened by « ↗ ») keep the race,
    // circuit and runner chosen with them — matching again could pick another race or runner than the one chosen by hand,
    // whose calibration is not the one kept, and the new tab stopped at the calibration instead of playing (owner, 2026-10-18)
    if (newTrace && track && remember) {
      matchedNote = "";
      if (await matchRace() && files.trace) files.trace.note = race?.date_iso && parisDay(track.ms0) !== race.date_iso ? t("an.date.diff", { d1: fmtDate(parisDay(track.ms0)), d2: fmtDate(race.date_iso) }) : "";
    }
    if (newTrace && traceFull) { cadence(traceFull); track = withCut(traceFull); }
    if (newTrace && perso && !orgaMode && remember && traceFull && !traceFull.drawn) findLikely(traceFull);
    if (newTrace && orgaMode && remember) { if (withTimes && ri < 0) { pickOrgaRunner(null); pickers(); } orgaGo = true; }                    // a trace just dropped: straight to its playback   // once the race is known (a VTT race: pedal turns)
    filesCard();
    setup();
  }
  /**
   * The race of the trace's day and its runner, when the race chosen is not the trace's (another day, or a runner whose
   * published start is not in the trace — the page opens on the account's latest race): the runner whose published
   * start falls at the trace's beginning, else the account's own run that day, else that day's race with the account.
   */
  async function matchRace() {
    if (perso || !track || timesApply()) return false;
    const day = parisDay(track.ms0), t0 = traceStartS(), sameDay = races.filter((r) => r.date_iso === day);
    // the race chosen first, then the day's others — none when the address names it (« Analyse solo » handed the files over to it)
    const pinned = sameDay.filter((r) => r.key === key);
    let best = null;
    for (const pool of !pinned.length ? [sameDay] : query.course === key ? [pinned] : [pinned, sameDay.filter((r) => r.key !== key)]) {
    if (best) break;
    for (const rc of pool) {
      let data = null;
      try { data = await getProv(`${encodeURIComponent(rc.key)}.json`); } catch (e) { continue; }
      // a runner's start from any list of the race (liveresultat's gives it when the organiser's does not)
      const starts = new Map();
      const nk = (n) => (n || "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").sort().join(" ");
      for (const d of data?.docs || []) for (const k of d.classes || []) for (const x of k.runners || []) if (x.start_s != null) starts.set(nk(x.name), x.start_s);
      for (const d of data?.docs || []) for (const k of d.classes || []) for (const x of k.runners || []) {
        if (x.status === "dns") continue;
        const s = x.start_s ?? starts.get(nk(x.name)) ?? null;
        let score = runFit(s, x);
        if (score == null && me?.lic && x.lic === me.lic && s == null) score = 20000;              // one's own run that day
        if (score != null && (!best || score < best.score)) best = { key: rc.key, name: x.name, score, race: rc.name };
      }
    }
    }
    if (!best && sameDay.length) { const rc = pinned[0] || sameDay.find((r) => (r.lics || []).includes(me?.lic)) || sameDay[0]; best = { key: rc.key, name: null, race: rc.name }; }
    if (!best) return false;
    key = best.key; query = best.name ? { r: best.name } : {};
    await loadRace(); pickers();
    matchedNote = t("an.st.matched", { race: best.race, r: runner()?.name || "" });
    return true;
  }
  /**
   * The cadence as runners read it (owner, 2026-10-15): watches record one foot's strides a minute, or a bike's pedal
   * turns. On foot it is doubled to steps a minute (« pas/min », 160-190 running); on a bike it stays in « tr/min ». The
   * activity the file names decides; a file naming none is on foot unless the race chosen is a VTT one. Once per track.
   */
  function cadence(tr) {
    if (!tr.ch.cad || tr.cadUnit) return;
    const bike = tr.activity === "bike" || (!tr.activity && /\bvtt\b|v[ée]lo|mtb/i.test(race?.name || ""));
    if (!bike) for (let i = 0; i < tr.ch.cad.length; i++) tr.ch.cad[i] *= 2;
    tr.cadUnit = t(bike ? "an.unit.rpm" : "an.unit.spm");
  }
  const unitOf = (c) => (c === "cad" ? track?.cadUnit || t("an.unit.spm") : CHANNEL_UNIT[c]);
  /** The files kept for the tab's session, in IndexedDB (never sent). */
  function rememberFiles() {
    const tag = sessionTag();
    if (!tag) return;
    const seen = new Set(), entries = [];
    for (const role of Object.keys(files)) { const f = files[role]?.file; if (f && !seen.has(f)) { seen.add(f); entries.push({ role, name: f.name, type: f.type, blob: f }); } }
    idbWrite(entries.length ? { tag, at: Date.now(), entries } : null, fileKey).catch(() => {});
  }
  /** The files of the last visit of this tab, read again. */
  async function restoreFromIdb() {
    const tag = sessionTag();
    let rec = null;
    try { rec = await idbRead(fileKey); } catch (e) { return; }
    if (!rec || rec.tag !== tag || !rec.entries?.length || (map && !orgaMode) || track) return;
    restoredFiles = true;
    await take(rec.entries.map((e) => new File([e.blob], e.name, { type: e.type })), { remember: false });
  }
  /** The course of the IOF file to use: the one named like the circuit, else the first. */
  function pickCourse(data) {
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const want = norm(klass()?.name);
    const i = want ? data.courses.findIndex((c) => norm(c.name) === want || (norm(c.name) && want.includes(norm(c.name)))) : -1;
    return i >= 0 ? i : 0;
  }

  // ---- 3. the calibration ------------------------------------------------------------------------------------------
  function setup() {
    stop();
    calibrated = false; fit = null; offset = null; rmsM = null; auto = null; mode = "auto"; targets = []; cur = 0; tNow = 0;
    vSet = false;
    hideResults();
    const r = runner();
    const work = $("#an-work");
    if (drawing && map) { work.hidden = false; steps(3); size(); fitView(); drawSide(); draw(); return; }
    endDraw();
    work.hidden = !(map && track && r);
    steps(stage());
    if (work.hidden) return;
    size();
    fitView();
    prepare();
  }
  const hideResults = () => {
    video?.close(); $("#an-video-btn").hidden = true;
    close3d(); $("#an-3d").hidden = true; rcReset(); measure.stop(); $("#an-measure").hidden = true;
    $("#an-legs").innerHTML = ""; $("#an-left").hidden = true; $("#an-right").hidden = true; $("#an-bar").hidden = true; $("#an-side").hidden = false;
    $("#an-split-g").hidden = true; $("#an-split-s").hidden = true;
    $("#an-legend").hidden = true; $("#an-legchip").hidden = true; $("#an-top").hidden = true; $("#an-stripbar").hidden = true; $("#an-ps").hidden = true;
    leaveMapOnly(); showPanels(true); document.body.classList.remove("an-theatre"); fitHeight();
  };
  /** The playback's layout as set: the panels' widths (a rail when folded), the height. */
  function applyLayout() {
    layoutEl.dataset.lcol = lp.collapsed ? "1" : "0";
    layoutEl.dataset.rcol = rp.collapsed ? "1" : "0";
    layoutEl.style.setProperty("--an-lw", `${lp.collapsed ? 34 : gw}px`);
    layoutEl.style.setProperty("--an-rw", `${rp.collapsed ? 34 : sw}px`);
    fitHeight();
  }
  /** During the playback the layout fills the window below its top: no scrollbar on a desktop screen. */
  function fitHeight() {
    if (!document.body.classList.contains("an-theatre")) { layoutEl.style.removeProperty("--an-h"); return; }
    const top = layoutEl.getBoundingClientRect().top + window.scrollY;
    layoutEl.style.setProperty("--an-h", `${Math.max(drawers() ? 200 : 380, Math.floor(innerHeight - top - 18))}px`);
  }
  const leftP = bindPanel($("#an-left"), lp, { onChange: () => { savePrefs(); applyLayout(); }, onShow: (k) => { if (k === "graphs") { sizeStrip(); drawStrip(); } else if (k === "routes") rcCurrent(true); } });
  const rightP = bindPanel($("#an-right"), rp, { onChange: () => { savePrefs(); applyLayout(); } });
  bindSplitter($("#an-split-g"), layoutEl, "left", (w, rect) => { gw = Math.round(Math.min(rect.width - (rp.collapsed ? 34 : sw) - 300, Math.max(180, w))); if (lp.collapsed) leftP.fold(false, true); applyLayout(); }, savePrefs);
  bindSplitter($("#an-split-s"), layoutEl, "right", (w, rect) => { sw = Math.round(Math.min(rect.width - (lp.collapsed ? 34 : gw) - 300, Math.max(220, w))); if (rp.collapsed) rightP.fold(false, true); applyLayout(); }, savePrefs);
  $("#an-left").hidden = true; $("#an-right").hidden = true;
  const onWinResize = () => fitHeight();
  window.addEventListener("resize", onWinResize);
  /** During the playback the race's pickers and the files card give way to the map (owner, 2026-11-05: no line about the race
   *  and the files any more — they are the step before; files dropped on the page still replace them). */
  function showPanels(on) {
    $("#an-pick").hidden = (perso && !orgaMode) || !on; $("#an-rf").hidden = perso || !on; $("#an-files").hidden = !on;
    $("#an-brief").hidden = true;
  }
  // a computation under way is shown with a bar (owner, 2026-11-17: the page showed nothing while the map was read):
  // `busy` false = none, null = of unknown length, a number = the share done (course.js says it step by step)
  let busy = false;
  const setStatus = (s, wait = false) => { status = s; busy = wait; side(); };
  const readingProgress = (redraw) => (f, pass) => {
    const text = t(pass === 2 ? "an.st.reading2" : "an.st.reading"), el = document.querySelector(".an-prog");
    busy = f;
    if (text !== status || !el) { status = text; redraw(); } else setBar(el, f);
  };
  const busyBlock = () => (busy !== false && status ? html`<div class="an-busy"><div>${status}</div>${raw(bar(busy, "an-prog"))}</div>` : "");
  const calKey = () => `${CAL_KEY}.${key}.${di}.${ci}.${runner()?.name}.${map?.width}x${map?.height}`;
  // the trace a calibration was made with: its geometry is in that trace's own metres, and another trace (the complete
  // file after a cut one, 2026-10-15) has other passes — it starts afresh
  const traceSig = () => (track ? `${Math.round(track.ms0 / 1000)}:${track.n}` : null);
  function savePositions(done = calibrated) {
    const rec = { v: 2, done, trace: traceSig(), mapOrdered, reader: READER, items: targets.map((g) => ({ kind: g.kind, code: g.code || "", pos: g.pos || null })),
      fit: fit && !geoFit ? { kind: fit.kind, m11: fit.m11, m12: fit.m12, m21: fit.m21, m22: fit.m22, tx: fit.tx, ty: fit.ty, scale: fit.scale, rotation: fit.rotation } : null };
    try { localStorage.setItem(calKey(), JSON.stringify(rec)); } catch (e) { /* not kept */ }
  }
  function savedPositions() { try { const r = JSON.parse(localStorage.getItem(calKey()) || "null"); return r && r.v === 2 && Array.isArray(r.items) ? r : null; } catch (e) { return null; } }
  /** The offset the results' start time gives: the trace's time at the race start (seconds), if the start is known. */
  /** A runner's published start (seconds after midnight, Paris), from any list of the race (liveresultat's gives it
   *  when the organiser's does not), or null. */
  function startOf(r) {
    if (!r) return null;
    if (r.start_s != null) return r.start_s;
    const key = (n) => (n || "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").sort().join(" ");
    let startS = null;
    for (const d of race?.docs || []) for (const k of d.classes || []) for (const x of k.runners) if (x.start_s != null && key(x.name) === key(r.name)) startS = x.start_s;
    return startS;
  }
  function guessOffset() {
    const r = runner(), startS = startOf(r);
    if (startS == null || !race?.date_iso || !timesApply()) return null;
    const startMs = Date.parse(`${race.date_iso}T00:00:00Z`) - parisOffsetMs(race.date_iso) + startS * 1000;
    return (startMs - track.ms0) / 1000;
  }
  /** The trace's first point as a Paris time of day (seconds after midnight). */
  const traceStartS = () => { const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date(track.ms0)); const g = (x) => +p.find((q) => q.type === x).value; return g("hour") * 3600 + g("minute") * 60 + g("second"); };
  const hhmm = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  /** Whose trace is this? The selected runner, unless they did not start or their published start does not fit the
   *  trace's beginning (the watch starts a few minutes before the gun at most): then the classified runner whose
   *  start fits best, if any — the trace of a relative dropped under one's own name (owner, 2026-10-14). */
  function whoseTrace() {
    if (!track || !race) return null;
    const t0 = traceStartS(), r = runner(), fits = (s) => s != null && s - t0 >= -120 && s - t0 <= 900;
    const mine = startOf(r);
    if (r?.status !== "dns" && (mine == null || fits(mine))) return null;
    let best = null;
    docs.forEach((d, i) => d.classes.forEach((k, j) => k.runners.forEach((x, n) => {
      if (x.status !== "ok" || x === r) return;
      const s = startOf(x), sc = runFit(s, x);
      if (sc == null || (best && sc >= best.score)) return;
      best = { name: x.name, di: i, ci: j, ri: n, start: s, score: sc };
    })));
    return { t0, mine, dns: r?.status === "dns", other: best };
  }
  /**
   * How well a published run fits the trace — the seconds of slack at both ends (the watch started before the start,
   * stopped after the finish) — or null when it cannot be this trace's: the trace covers the start (started 5 min late
   * at most) and the finish (2 min). Runners start a minute apart: the start alone took Romane for Nadejda, whose
   * finish falls 2 s before the trace ends where Romane's falls 50 min after it (2026-10-15).
   */
  function runFit(s, x) {
    if (s == null || !track) return null;
    const t0 = traceStartS(), end = t0 + track.dur;
    if (s < t0 - 300 || s > end) return null;
    if (x.status !== "ok" || x.time_s == null) return 3600 + Math.max(0, s - t0);         // no finish to check: weaker
    const f = s + x.time_s;
    return f > end + 120 ? null : Math.max(0, s - t0) + Math.max(0, end - f);
  }
  const ptsOf = (gs) => gs.map((g) => ({ x: g.pos[0], y: g.pos[1], kind: g.kind }));

  /** The automatic calibration: read the course, place the trace, order the controls, refine with the split times. */
  async function prepare({ fresh = false } = {}) {
    const my = ++prepToken;
    notes = [];
    mode = "auto";
    mapOrdered = false;
    olderReading = false;
    if (fresh) { try { localStorage.removeItem(calKey()); } catch (e) { /* nothing kept */ } }
    setStatus(t("an.st.reading"), 0);
    await tick();
    if (!files.orga && (!courseCache || courseCache.image !== map)) {
      let c = null;
      try { c = await detectCourse(map, { progress: readingProgress(side) }); } catch (e) { console.error(e); }
      busy = false;
      courseCache = { image: map, course: c };
    }
    if (my !== prepToken) return;
    course = files.orga ? null : courseCache.course;
    if (!course && !files.orga && !drawnHere()) notes.push(t("an.st.noCourse"));
    // the georeferencing
    geoFit = null; geoHow = "";
    const W = map.width, H = map.height;
    if (drawnHere()) { geoFit = fitFromGeo(track.drawn.geo, track); notes.push(t(track.drawn.replay ? (track.drawn.nogeo ? "an.replay.geoOwn" : "an.replay.geo") : track.drawn.nogeo ? "an.draw.geoOwn" : "an.draw.geoHow")); }
    else if (files.orga) { geoFit = fitFromGeo(files.orga.geo, track); geoHow = t("an.orga.geo"); }
    else if (files.geo?.overlay) { geoFit = fitFromKml(files.geo.overlay, W, H, track); geoHow = files.geo.kind.toUpperCase(); }
    else if (files.geo?.corners) { geoFit = fitAffine(files.geo.corners.map(([lat, lon]) => toLocal(track, lat, lon)), [[0, 0], [W, 0], [W, H], [0, H]]); geoHow = `OCAD/Mapper${files.geo.detail ? ` · ${files.geo.detail}` : ""}`; }
    else if (files.world?.wf) {
      const crs = files.prj?.crs || guessCrs(files.world.wf[4], files.world.wf[5], track.lon0);
      if (!crs) notes.push(t("an.geo.noCrs"));
      else { geoFit = fitFromWorld(files.world.wf, crs, W, H, track); geoHow = `${t("an.geo.world")} · ${crs.name}`; }
    }
    if (geoFit) {
      const [mx, my_] = toM(geoFit, W / 2, H / 2);
      if (Math.hypot(mx - track.x[0], my_ - track.y[0]) > 30000) { notes.push(t("an.geo.far")); geoFit = null; geoHow = ""; }
    }
    // a calibration kept from an earlier visit: back as it was left, the controls placed by hand included
    const kept = fresh ? null : savedPositions();
    if (kept && kept.items.some((s) => s.pos) && kept.trace === traceSig()) {
      const taus = officialTaus();
      if (taus) { targets = officialTargets(null); if (kept.items.length === targets.length) kept.items.forEach((s, i) => { targets[i].pos = s.pos; }); }
      else targets = kept.items.map((s, i) => ({ i, kind: s.kind, code: s.code || "", pos: s.pos, tau: null, tEst: null, label: s.kind === "start" ? t("an.start") : s.kind === "finish" ? t("an.finish") : "" }));
      mapOrdered = !!kept.mapOrdered && !taus;                             // kept in the map's order, timed again in it
      const geometry = geoFit || (kept.fit ? { ...kept.fit } : null);
      notes.push(t("an.st.restored"));
      // made by an earlier reading of the map: « Refaire le calage automatique » reads it again (owner, 2026-11-01: the
      // calibration of before came back without the controls the new reading finds)
      olderReading = (kept.reader || 0) < READER && !files.iof;
      if (olderReading) notes.push(t("an.st.newReader"));
      recompute({ geometry });
      cur = nextTarget(0);
      side(); draw();
      // ready, not played: the page opens on the files and the calibration (« Voir la course » plays it), so that new
      // files can be dropped — it went straight to the playback, and the files could no longer be changed (owner, 2026-10-15);
      // except in a tab opened by « ↗ » during the playback, which goes on with it
      if ((autoPlay || orgaGo) && fit && offset != null) { autoPlay = false; orgaGo = false; finish(); }
      return;
    }
    // the course's points
    const pts = [];
    const iofData = files.orga ? null : files.iof?.data, iofCourse = iofData?.courses[iofIndex] || null;
    const r = files.orga ? files.orga.r : course?.r || null;
    // the organiser's course: its controls placed on the map, in its order
    // a drawn route: its controls as the runner pointed them, in that order (on the organiser's map, the organiser's own)
    const orgaPts = files.orga ? files.orga.controls.map((c) => ({ kind: c.kind, code: c.code || "", pos: [c.x, c.y] }))
      : drawnHere() ? anchorsOf(track.drawn).map((a) => ({ kind: a.k, code: "", pos: track.drawn.pts[a.i] })) : null;
    if (orgaPts) pts.push(...orgaPts);
    else if (iofCourse) {
      const seq = iofCourse.controls.map((cc) => ({ ...(iofData.controls.get(cc.id) || { id: cc.id }), type: cc.type }));
      const circles = [...(course?.controls || []).map((c) => [c.x, c.y]), ...(course?.start ? [[course.start.x, course.start.y]] : []), ...(course?.finish ? [[course.finish.x, course.finish.y]] : [])];
      const withMm = seq.filter((c) => c.mx != null && c.my != null);
      let mmFit = null;
      if (withMm.length >= 3 && circles.length >= 3) {
        const src = withMm.map((c) => [c.mx, -c.my]);
        const ext = (A, k) => Math.max(...A.map((p) => p[k])) - Math.min(...A.map((p) => p[k]));
        const s0 = Math.hypot(ext(circles, 0), ext(circles, 1)) / Math.max(1e-6, Math.hypot(ext(src, 0), ext(src, 1)));
        const reg = registerPoints(src, circles, Math.max(8, 0.7 * (r || 20)), { scaleRange: [s0 / 3, s0 * 3], rotRange: (15 * Math.PI) / 180, minInliers: Math.max(3, Math.ceil(0.5 * withMm.length)) });
        if (reg) mmFit = reg.fit;
      }
      if (!mmFit && iofData.map.tl && iofData.map.br) {      // the image is the whole map
        const [lx, ty] = iofData.map.tl, [rx, by] = iofData.map.br;
        if (rx !== lx && ty !== by) mmFit = { m11: W / (rx - lx), m12: 0, m21: 0, m22: H / (ty - by), tx: (-W * lx) / (rx - lx), ty: (H * ty) / (ty - by), scale: W / (rx - lx) };
      }
      if (!mmFit) notes.push(t("an.iof.noPlace"));
      for (const c of seq) {
        let pos = mmFit && c.mx != null ? toPx(mmFit, c.mx, -c.my) : null;
        if (pos && r) { const near = circles.map((q) => [Math.hypot(q[0] - pos[0], q[1] - pos[1]), q]).sort((a, b) => a[0] - b[0])[0]; if (near && near[0] <= 0.8 * r) pos = near[1]; }
        pts.push({ kind: c.type === "Start" ? "start" : c.type === "Finish" ? "finish" : "control", code: c.type === "Control" ? c.id : "", pos, lat: c.lat, lon: c.lon });
      }
      const geo = pts.filter((p) => p.pos && p.lat != null && p.lon != null);
      if (!geoFit && geo.length >= 3) { geoFit = fitSimilarity(geo.map((p) => toLocal(track, p.lat, p.lon)), geo.map((p) => p.pos)); geoHow = "IOF XML"; }
    } else if (course) {
      if (course.start) pts.push({ kind: "start", code: "", pos: [course.start.x, course.start.y] });
      for (const c of course.controls) pts.push({ kind: "control", code: "", pos: [c.x, c.y] });
      if (course.finish) pts.push({ kind: "finish", code: "", pos: [course.finish.x, course.finish.y] });
    }
    // the geometry
    let located = pts.filter((p) => p.pos);
    let geometry = geoFit;
    auto = null;
    if (!geometry && located.length >= 3) {
      setStatus(t("an.st.aligning"), null);
      await tick();
      if (my !== prepToken) return;
      auto = alignTrack(track, ptsOf(located), { rStar: r, tol: TOL });
      geometry = auto?.fit || null;
      busy = false;
      if (!auto) notes.push(t("an.st.noAlign"));
    } else if (!geometry) notes.push(t("an.st.fewPoints", { n: located.length }));
    // the rings the first pass missed: where the trace turns sharply and no control is placed, look again
    if (geometry && course?.probe && !iofCourse) {
      const added = probeTurns(geometry, located).filter((a) => !pts.some((p) => p.pos && Math.hypot(p.pos[0] - a.pos[0], p.pos[1] - a.pos[1]) < 1.5 * r));
      if (added.length) {
        pts.push(...added);
        located = pts.filter((p) => p.pos);
        if (!geoFit) { const again = alignTrack(track, ptsOf(located), { rStar: r, tol: TOL }); if (again && again.inliers > (auto?.inliers || 0)) { auto = again; geometry = again.fit; } }
        notes.push(t("an.st.probed", { n: added.length }));
      }
    }
    // the finish not read (its colours lost over water or yellow, a line across it): looked for where the trace ends
    if (geometry && course?.probeFinish && !iofCourse && !pts.some((p) => p.kind === "finish" && p.pos)) {
      const k = track.n - 1, [ex, ey] = toPx(geometry, track.x[k], track.y[k]);
      const sc = geometry.scale || Math.sqrt(Math.abs(geometry.m11 * geometry.m22 - geometry.m12 * geometry.m21));
      const hit = ex >= 0 && ey >= 0 && ex <= map.width && ey <= map.height ? course.probeFinish(ex, ey, 50 * sc) : null;
      if (hit) {
        for (let i = pts.length - 1; i >= 0; i--) if (pts[i].kind === "finish") pts.splice(i, 1);
        pts.push({ kind: "finish", code: "", pos: [hit.x, hit.y], probed: true });
        located = pts.filter((p) => p.pos);
        notes.push(t("an.st.finishFound"));
      }
    }
    // the targets: in the course's order (IOF), else in the trace's visiting order
    const saved = savedPositions();
    if (!geometry) {
      targets = iofCourse || orgaPts ? pts.map((p, i) => ({ i, label: p.kind === "start" ? t("an.start") : p.kind === "finish" ? t("an.finish") : String(pts.slice(0, i).filter((q) => q.kind === "control").length + 1), ...p, tau: null, tEst: null }))
        : officialTargets(null);
      if (saved) restorePositions(saved);
      mode = "manual"; cur = nextTarget(0);
      recompute();
      side(); draw();
      return;
    }
    // the course's order as the map prints it — its legs, followed from the start (course.js `order`) — the trace only
    // timing it (owner, 2026-11-01: the trace's own order had numbered 8 before 5, 6, 7); else the trace's order
    const mapOrder = !iofCourse ? courseOrder(geometry, located) : null;
    mapOrdered = !!mapOrder;
    if (mapOrder) located = mapOrder;
    const passes = () => (mapOrder || orgaPts ? passesInOrder(track, geometry, ptsOf(located), TOL) : visitOrder(track, geometry, ptsOf(located), TOL, { leg: course?.leg }));
    let vo = passes();
    const passOf = (p) => { const i = located.indexOf(p); return i >= 0 && vo.pass.has(i) ? vo.pass.get(i) : null; };
    // a start the map's reading did not give (a photo without its colours: the triangle is not told from the town's
    // lines): looked for where the runner waited on the leg printed into the first control (course.js `probeStart`)
    if (!iofCourse && !orgaPts && course?.probeStart && !pts.some((q) => q.kind === "start" && q.pos)) {
      const timed = located.filter((q) => q.kind === "control" && passOf(q) != null);
      const first = mapOrder ? timed[0] : timed.sort((a, b) => passOf(a) - passOf(b))[0];
      const t1 = first ? passOf(first) : null, before = [];
      for (let i = 0; t1 != null && i < track.n && track.t[i] < t1; i++) before.push([...toPx(geometry, track.x[i], track.y[i]), track.t[i]]);
      const st = first ? course.probeStart(first.pos, before) : null;
      if (st) {
        const sp = { kind: "start", code: "", pos: [st.x, st.y], probed: true };
        for (let i = pts.length - 1; i >= 0; i--) if (pts[i].kind === "start") pts.splice(i, 1);
        pts.unshift(sp);
        located = [sp, ...located.filter((q) => q.kind !== "start")];
        vo = passes();
        notes.push(t(st.triangle ? "an.st.startTriangle" : "an.st.startFound"));
      }
    }
    // two circles passed within 15 s are not two controls (a leg takes longer): the second is a phantom
    let prevT = -Infinity;
    const visited = vo.order.map((i) => located[i]).map((p) => { const tp = passOf(p); const ok = tp == null || tp - prevT >= 15; if (ok && tp != null) prevT = tp; return ok ? p : { ...p, missed: true }; });
    const slot = (kind) => pts.find((p) => p.kind === kind) || { kind, code: "", pos: null };
    const ordered = iofCourse || orgaPts ? pts
      : mapOrder ? located.map((p) => (p.kind === "control" && !visited.includes(p) ? { ...p, missed: true } : p))
      : [slot("start"), ...visited, ...located.filter((p, i) => p.kind === "control" && !vo.order.includes(i)).map((p) => ({ ...p, missed: true })), slot("finish")];
    if (mapOrder && !ordered.some((p) => p.kind === "start")) ordered.unshift(slot("start"));
    if (mapOrder && !ordered.some((p) => p.kind === "finish")) ordered.push(slot("finish"));
    // in the map's order a control keeps its number even if the trace missed it
    let seqTargets = ordered.map((p, i) => ({ i, kind: p.kind, code: p.code, pos: p.pos, tEst: passOf(p), tau: null, missed: !!p.missed,
      label: p.kind === "start" ? t("an.start") : p.kind === "finish" ? t("an.finish")
        : mapOrder ? String(ordered.slice(0, i).filter((q) => q.kind === "control").length + 1)
        : p.missed ? "?" : String(ordered.slice(0, i).filter((q) => q.kind === "control" && !q.missed).length + 1) }));
    const taus = officialTaus();
    // the organiser's course on a competition: its controls matched to the class's published sequence by their codes in
    // order, else by their number (trace/published.js); the class's controls the course lacks are left out
    const offT = taus && orgaPts ? officialTargets(null) : null;
    const orgaMap = offT ? matchControls(orgaPts, klass()?.controls || [], offT.length - 2) : null;
    if (orgaMap) {
      targets = offT;
      orgaMap.forEach((j, i) => { if (j != null && targets[j]) { targets[j].pos = seqTargets[i].pos; targets[j].tEst = seqTargets[i].tEst; } });
      for (const g of targets) if (!g.pos) g.missed = true;
    } else if (taus) {
      // the official sequence, each control placed by the detected one that passed at its time
      const off = [], det = seqTargets.filter((g) => g.kind === "control" && g.tEst != null);
      const startT = vo.startT ?? (vo.finishT != null && totalOfficial() ? vo.finishT - totalOfficial() : null);
      const ctrlTaus = taus.slice(1, -1);
      const shift = startT != null ? startT : (det.length && ctrlTaus.some((x) => x != null) ? median(det.map((g) => g.tEst)) - median(ctrlTaus.filter((x) => x != null)) : 0);
      for (const g of seqTargets) if (g.kind === "control") off.push(g);
      // the pairs, with the clock shift re-estimated twice from the pairs themselves (a phantom circle passed early
      // would otherwise hijack a control), then the pairs far from the shift dropped
      let pairs = matchTimes(det.map((g) => g.tEst - shift), ctrlTaus), sh = shift;
      for (let it = 0; it < 2 && pairs.length >= 3; it++) {
        sh = sh + median(pairs.map(([a, b]) => det[a].tEst - sh - ctrlTaus[b]));
        pairs = matchTimes(det.map((g) => g.tEst - sh), ctrlTaus);
      }
      if (pairs.length >= 3) { const res = pairs.map(([a, b]) => det[a].tEst - sh - ctrlTaus[b]), md = median(res); pairs = pairs.filter((p, i) => Math.abs(res[i] - md) <= 60); }
      targets = officialTargets(null);
      for (const [a, b] of pairs) { targets[b + 1].pos = det[a].pos; targets[b + 1].tEst = det[a].tEst; }
      const st = seqTargets.find((g) => g.kind === "start"), fi = seqTargets.find((g) => g.kind === "finish");
      if (st?.pos) { targets[0].pos = st.pos; targets[0].tEst = st.tEst; }
      if (fi?.pos) { targets[targets.length - 1].pos = fi.pos; targets[targets.length - 1].tEst = fi.tEst; }
      if (!pairs.length && !st?.pos && !fi?.pos) notes.push(t("an.st.noMatch"));
    } else targets = seqTargets;
    savePositions();
    recompute({ geometry, vo });
    cur = nextTarget(0);
    side(); draw();
    if (fit && !notes.length && targets.filter((g) => g.pos).length >= 3) steps(3);
    // the organiser's map: placed by its own georeferencing, nothing to check by hand — a trace just dropped plays at once
    // and a run replayed from « Mes cartes » (its georeference and controls kept): played at once too
    const replayGo = autoPlay && !!track?.drawn?.replay && drawnHere();
    if ((orgaGo || replayGo) && fit && offset != null && targets.filter((g) => g.pos && g.tEst != null).length >= 2) { orgaGo = false; autoPlay = false; finish(); }
    else if (replayGo) openShown(false);
  }
  const median = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : 0; };
  /** The trace's sharp turns (over 50°) with no control placed nearby, probed on the map for a ring: the rings found. */
  function probeTurns(geometry, located) {
    const r = course.r, V = simplify(track.x, track.y, track.n, 10), out = [];
    const diff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
    for (let k = 1; k < V.length - 1 && out.length < 40; k++) {
      const i = V[k], a = V[k - 1], b = V[k + 1];
      const ang = Math.abs(diff(Math.atan2(track.y[i] - track.y[a], track.x[i] - track.x[a]), Math.atan2(track.y[b] - track.y[i], track.x[b] - track.x[i])));
      if (ang < (50 * Math.PI) / 180) continue;
      const [px, py] = toPx(geometry, track.x[i], track.y[i]);
      if (px < 0 || py < 0 || px > map.width || py > map.height) continue;
      if (located.some((p) => Math.hypot(p.pos[0] - px, p.pos[1] - py) < 2.5 * r) || out.some((p) => Math.hypot(p.pos[0] - px, p.pos[1] - py) < 2.5 * r)) continue;
      const hit = course.probe(px, py, 2.5 * r);
      if (hit) out.push({ kind: "control", code: "", pos: [hit.x, hit.y], probed: true });
    }
    return out;
  }
  /** The course in the map's order (course.js `order`, with the finish where the page placed it): the points placed, in
   *  that order, those the legs led to added; a course the map reads both ways (the start drawn in the finish) the way
   *  the trace runs; the controls no leg reaches (found where the trace turns) after the course's last control passed
   *  before them. Null when the map gives no order. */
  function courseOrder(geometry, located) {
    if (!course?.order) return null;
    const fin = located.find((p) => p.kind === "finish");
    const seq = course.order({ finish: fin ? fin.pos : null });
    if (!seq || seq.points.filter((q) => q.kind === "control").length < 2) return null;
    const r0 = course.r || 20;
    const take = (q) => located.find((p) => p.kind === q.kind && Math.hypot(p.pos[0] - q.x, p.pos[1] - q.y) < 1.2 * r0) || { kind: q.kind, code: "", pos: [q.x, q.y], legs: true };
    let list = seq.points.map(take);
    if (seq.reversible) {
      const rev = [...list.filter((p) => p.kind === "start"), ...list.filter((p) => p.kind === "control").reverse(), ...list.filter((p) => p.kind === "finish")];
      const a = passesInOrder(track, geometry, ptsOf(list), TOL), b = passesInOrder(track, geometry, ptsOf(rev), TOL);
      if (b.count > a.count || (b.count === a.count && b.cost < a.cost)) list = rev;
    }
    const extra = located.filter((p) => p.kind === "control" && !list.includes(p));
    if (extra.length) {
      const vo = passesInOrder(track, geometry, ptsOf(list), TOL), tOf = new Map(list.map((p, i) => [p, vo.pass.get(i)]));
      const beforeFinish = () => list.length - (list[list.length - 1].kind === "finish" ? 1 : 0);
      // their passes chosen together, by the legs printed between them: a control run past again later (the first
      // control, on the way from 21 to 22: 2026-11-17) keeps the pass that puts it next to the controls its legs join
      const ve = extra.length > 1 ? visitOrder(track, geometry, ptsOf(extra), TOL, { leg: course?.leg }) : null;
      for (const [j, p] of extra.entries()) {
        const t0 = ve ? ve.pass.get(j) : visitOrder(track, geometry, ptsOf([p]), TOL).pass.get(0);
        let at = t0 == null ? -1 : list.findIndex((q) => q.kind === "control" && tOf.get(q) != null && tOf.get(q) > t0);
        if (at < 0) at = beforeFinish();
        list.splice(at, 0, p); tOf.set(p, t0);
      }
    }
    notes.push(t("an.st.mapOrder"));
    return list;
  }
  /** The official sequence of targets (start, the controls with their codes, the finish), positions from a saved set. */
  function officialTargets(saved) {
    const k = klass(), r = runner();
    const codes = k?.controls || [], n = Math.max(codes.length, r?.splits?.length || 0);
    const taus = officialTaus();
    const out = [{ i: 0, kind: "start", label: t("an.start"), code: "", tau: 0, tEst: null, pos: null }];
    for (let i = 0; i < n; i++) out.push({ i: i + 1, kind: "control", label: `${i + 1}`, code: codes[i] || "", tau: taus?.[i + 1] ?? null, tEst: null, pos: null });
    out.push({ i: n + 1, kind: "finish", label: t("an.finish"), code: "", tau: taus ? taus[n + 1] : null, tEst: null, pos: null });
    if (saved) restorePositions(saved, out);
    return out;
  }
  function restorePositions(saved, gs = targets) { if (saved?.items?.length === gs.length) saved.items.forEach((s, i) => { if (s?.pos) gs[i].pos = s.pos; }); }
  const nextTarget = (from) => { for (let i = from; i < targets.length; i++) if (!targets[i].pos && !targets[i].missed) return i; return -1; };
  /** The race time of a target: published, else the trace's own. */
  const timeOf = (g) => (g.tau != null ? g.tau : g.tEst != null && offset != null ? g.tEst - offset : null);

  /** The geometry and the clock from the targets as they stand: the split times when published, else the trace. */
  function recompute({ geometry = null, vo = null } = {}) {
    window.anDebug = () => ({ fit, offset, geoFit, targets, course, auto, view, mode, legs, total, place: placeClick, manual: () => { mode = "manual"; cur = nextTarget(0); if (cur < 0) cur = 0; side(); draw(); } });   // for support, in the console
    const located = targets.filter((g) => g.pos && !g.missed);
    const taus = officialTaus();
    fit = null; offset = null; rmsM = null;
    if (taus) {
      const pairs = targets.filter((g) => g.tau != null && g.pos && !g.missed).map((g) => ({ tau: g.tau, px: g.pos[0], py: g.pos[1] }));
      const guess = vo?.startT ?? guessOffset() ?? (geometry && located.length ? visitOrder(track, geometry, ptsOf(located), TOL, { leg: course?.leg }).startT : null);
      const c = pairs.length >= (geoFit ? 1 : 2) ? calibrate(track, pairs, guess, geoFit) : null;
      if (c) { fit = c.fit; offset = c.offset; rmsM = c.rms / fit.scale; }
      else if (geoFit) { fit = geoFit; offset = guess; }
      if (fit && offset == null) { const v = visitOrder(track, fit, ptsOf(located), TOL, { leg: course?.leg }); offset = v.startT; }
    } else {
      if (geoFit) fit = geoFit;
      else if (geometry) fit = geometry;
      else if (auto?.fit) fit = auto.fit;                                   // placed by hand: the geometry found stays
      else if (located.length >= 3) { auto = alignTrack(track, ptsOf(located), { rStar: course?.r || null, tol: TOL, min: 3 }); fit = auto?.fit || null; }
      if (fit) {
        // the course's order read on the map stays, the trace timing it; else the trace's own visiting order. In the
        // map's order a control added by hand goes where the trace passes it, among the others
        if (mapOrdered) {
          for (const g of targets.filter((x) => x.added && x.pos)) {
            const tg = visitOrder(track, fit, ptsOf([g]), TOL).pass.get(0);
            if (tg == null) continue;
            targets.splice(targets.indexOf(g), 1);
            const at = targets.findIndex((x) => x.kind === "finish" || (x.kind === "control" && x.tEst != null && x.tEst > tg));
            targets.splice(at < 0 ? targets.length : at, 0, g);
          }
          located.sort((a, b) => targets.indexOf(a) - targets.indexOf(b));
        }
        const v = mapOrdered ? passesInOrder(track, fit, ptsOf(located), TOL) : visitOrder(track, fit, ptsOf(located), TOL, { leg: course?.leg });
        located.forEach((g, i) => { g.tEst = v.pass.has(i) ? v.pass.get(i) : null; });
        if (mapOrdered) {
          let n = 0;
          targets.forEach((g, i) => { g.i = i; if (g.kind === "control") g.label = String(++n); });
        } else {
          // the controls in the trace's visiting order, the unreached ones after, then renumbered
          const ctrls = targets.filter((g) => g.kind === "control");
          const byTime = ctrls.filter((g) => g.pos && g.tEst != null && !g.missed).sort((a, b) => a.tEst - b.tEst);
          // two points passed within 15 s are one control (a leg takes longer): the second is set aside
          const reached = byTime.filter((g, i) => !i || g.tEst - byTime[i - 1].tEst >= 15), rest = ctrls.filter((g) => !reached.includes(g));
          targets = [...targets.filter((g) => g.kind === "start"), ...reached, ...rest, ...targets.filter((g) => g.kind === "finish")];
          let n = 0;
          targets.forEach((g, i) => { g.i = i; if (g.kind === "control") g.label = reached.includes(g) ? String(++n) : g.pos ? "?" : "+"; });
        }
        const tot = totalOfficial();
        const passT = located.filter((g) => g.kind === "control" && g.tEst != null).map((g) => g.tEst);
        const firstPass = passT.length ? Math.min(...passT) : null;           // the earliest pass (the list is not in time order)
        // the published start time first (the clock the results keep); else the start symbol's departure; else the
        // finish's arrival less the published total time; else the trace's own beginning when the first control comes
        // within 10 minutes (the watch started at the start), else the first control's pass; nothing on the map at all (a
        // generated map, a map without its course): the whole trace
        let published = guessOffset();
        if (published != null && (runner()?.status === "dns" || (firstPass != null && (firstPass < published || firstPass - published > 1800)))) published = null;
        offset = published ?? v.startT ?? (v.finishT != null && tot ? v.finishT - tot : null) ?? (firstPass != null && firstPass <= 600 ? 0 : firstPass) ?? (located.length ? null : 0);
        rmsM = auto ? auto.rms / fit.scale : null;
      }
    }
    if (fit && drawnHere()) {                                               // a drawn route begins at the start, its controls timed by
      offset = 0;                                                           // the drawing itself (not by the closest approach)
      const D = track.drawn, T = timeline(D), A = anchorsOf(D), used = new Set();
      if (T) for (const g of targets) {
        if (!g.pos) continue;
        const a = A.find((q) => !used.has(q.i) && q.k === g.kind && Math.hypot(D.pts[q.i][0] - g.pos[0], D.pts[q.i][1] - g.pos[1]) < 1);
        if (a) { used.add(a.i); g.tEst = T[a.i]; }
      }
    }
    if (fit) {
      pxs = new Float64Array(track.n); pys = new Float64Array(track.n);
      fullPath = new Path2D();
      for (let i = 0; i < track.n; i++) {
        const [px, py] = toPx(fit, track.x[i], track.y[i]);
        pxs[i] = px; pys[i] = py;
        if (i) fullPath.lineTo(px, py); else fullPath.moveTo(px, py);
      }
      computeLegs();
    } else { pxs = pys = fullPath = null; legs = []; total = 0; legSel = -1; }
    cutEnds();
  }
  /** The race in legs: times and ranks from the class's splits when published, else the trace's; lengths from the trace. */
  function computeLegs() {
    const k = klass(), r = runner();
    const times = targets.map(timeOf);
    const tot = totalOfficial();
    const lastT = [...times].reverse().find((x) => x != null);
    // the race ends at the published time, else at the finish's arrival; with neither (a finish not read on the map,
    // no published time), the trace's end — never the last control found, which cut the race short (owner, 2026-10-14)
    const finT = targets[targets.length - 1]?.kind === "finish" ? times[times.length - 1] : null;
    total = tot ?? finT ?? Math.max(lastT ?? 0, track.dur - (offset || 0));
    const n = targets.length - 1;
    const taus = officialTaus();
    let best = [], ref = [], all = [], mine = [];
    if (taus) {
      const cumOf = (x) => Array.from({ length: n }, (_, i) => (i < n - 1 ? x.splits?.[i] ?? null : x.status === "ok" ? x.time_s : null));
      const legsOf = (x) => { const c = cumOf(x); return c.map((v, i) => (v != null && (i === 0 || c[i - 1] != null) ? v - (i ? c[i - 1] : 0) : null)); };
      all = k.runners.filter((x) => x.splits).map(legsOf);
      best = bestLegs(all, n);
      ref = refLegs(all, n);                // (the time lost: trace/legs.js, as « Analyse de course »)
      mine = legsOf(r);
    } else mine = times.slice(1).map((v, i) => (v != null && times[i] != null ? v - times[i] : null));     // per leg
    legs = []; legSel = -1;
    const loss = taus ? legLoss(mine, ref) : [];
    for (let i = 0; i < n; i++) {
      const from = targets[i], to = targets[i + 1], t0 = times[i], t1 = times[i + 1];
      const leg = { n: i + 1, code: to.code || "", label: to.label, t0, t1, time: mine[i], best: best[i] ?? null, rank: null, lost: null, mistake: false, dist: null, straight: null, v: null, hr: null, cad: null, estimated: !taus };
      if (taus && leg.time != null) leg.rank = 1 + all.filter((l) => l[i] != null && l[i] < leg.time).length;
      if (taus && leg.time != null && loss[i].lost != null) { leg.lost = loss[i].lost; leg.mistake = loss[i].mistake; }
      if (fit && t0 != null && t1 != null && offset != null) {
        leg.dist = cumAt(track, offset + t1) - cumAt(track, offset + t0);
        const a = from.pos ? toM(fit, ...from.pos) : posAt(track, offset + t0), b = to.pos ? toM(fit, ...to.pos) : posAt(track, offset + t1);
        leg.straight = Math.hypot(a[0] - b[0], a[1] - b[1]);
        leg.v = leg.time > 0 ? leg.dist / leg.time : null;
        leg.hr = meanBetween(track, "hr", offset + t0, offset + t1);
        leg.cad = meanBetween(track, "cad", offset + t0, offset + t1);
      }
      legs.push(leg);
    }
  }

  function side() {
    steps(stage());
    if (calibrated) return;
    const taus = officialTaus(), r = runner();
    const placed = targets.filter((g) => g.pos && !g.missed).length, want = targets.filter((g) => !g.missed).length;
    const summary = [];
    if (status && !targets.length && busy === false) summary.push(status);
    if (course) summary.push(t("an.st.found", { n: course.controls.length, s: course.start ? "✓" : "—", f: course.finish ? "✓" : "—" }));
    if (geoHow) summary.push(`${t("an.st.geo")} ${geoHow}`);
    else if (auto) summary.push(t("an.st.aligned", { m: targets.filter((g) => g.pos && !g.missed && g.tEst != null).length, n: placed, r: fmt(auto.rotationDeg, 1) }));
    if (taus) summary.push(t("an.st.official", { n: targets.filter((g) => g.pos && g.tau != null).length, t: targets.filter((g) => g.tau != null).length }));
    else if (r && withTimes && ri >= 0 && !timesNote()) summary.push(totalOfficial() ? t("an.st.totalOnly") : t("an.st.noTimes"));
    const short = traceShortNote();
    if (short) summary.push(short);
    if (matchedNote) summary.push(matchedNote);
    const tn = timesNote();
    if (tn) summary.push(tn);
    const whose = whoseTrace();
    const whoseNote = !whose ? "" : html`<div class="notice" style="margin-bottom:6px">${t("an.st.whose", { t: hhmm(whose.t0), r: runner()?.name || "", rs: whose.dns ? t("an.st.whose.dns") : whose.mine != null ? t("an.st.whose.start", { s: hhmm(whose.mine) }) : t("an.st.whose.noStart") })}
      ${whose.other ? html` ${t("an.st.other", { o: whose.other.name, os: hhmm(whose.other.start) })} <span class="muted">${t("an.switch.hint")}</span>` : ""}</div>`;
    const need = mode === "manual" ? Math.max(0, (taus ? (guessOffset() != null || geoFit ? 2 : 3) : 3) - placed) : 0;
    // the text scrolls in the panel; every action sits in a bar under it that never scrolls away (owner, 2026-10-25:
    // « Voir la course » was out of sight at the bottom of the panel's text) — on a phone, fixed at the window's bottom
    $("#an-side").classList.add("an-cal");
    $("#an-side").innerHTML = html`<div class="an-side-body"><div class="an-side-title">${t(mode === "manual" ? "an.cal.title" : "an.cal.auto")}</div>
      ${busyBlock()}
      ${summary.length ? html`<ul class="an-summary">${summary.map((s) => html`<li>${s}</li>`)}</ul>` : ""}
      ${whoseNote}${notes.map((n) => html`<div class="notice" style="margin-bottom:6px">${n}</div>`)}
      ${mode === "manual" ? html`<p class="hint">${t("an.cal.help")}</p>${taus ? "" : html`<p class="hint">${t("an.cal.noSplits")}</p>`}` : ""}
      <div class="an-targets">${targets.map((g) => html`<button type="button" class="an-target${g.i === cur && mode === "manual" ? " now" : ""}${g.pos ? " done" : ""}${g.missed ? " missed" : ""}" data-target="${g.i}" title="${g.missed ? t("an.missed") : ""}">
        <b>${g.label}</b>${g.code ? html`<span class="muted">${g.code}</span>` : html`<span></span>`}<span class="num">${g.tau != null ? clock(g.tau) : timeOf(g) != null ? html`<span class="muted">~${clock(timeOf(g))}</span>` : "—"}</span>
        <span class="an-mark">${g.pos ? "✓" : g.i === cur && mode === "manual" ? "▶" : ""}</span></button>`)}</div>
      <div class="an-fitbox">${fit ? html`${rmsM != null ? html`<div><span class="muted">${t("an.cal.fit")}</span> <b>${fmt(rmsM)} m</b> <span class="muted" title="${t("an.cal.fit.hint")}">ⓘ</span></div>` : ""}
          ${offset != null && guessOffset() != null ? html`<div><span class="muted">${t("an.cal.offset")}</span> <b>${signed(offset - guessOffset())}</b> <span class="muted" title="${t("an.cal.offset.hint")}">ⓘ</span></div>` : ""}
          ${offset == null ? html`<div class="notice">${t("an.cal.noStart")}</div>` : ""}`
        : html`<div class="muted">${mode === "manual" ? t("an.cal.need", { n: need }) : busy === false ? status : ""}</div>`}</div>
      </div>
      <div class="an-actions">
        <button type="button" class="btn btn-primary" id="an-done" ${raw(fit && offset != null ? "" : "disabled")}>${t("an.cal.done")}</button>${keepBox()}
        ${whose?.other ? html`<button type="button" class="btn btn-sm" id="an-switch" data-di="${whose.other.di}" data-ci="${whose.other.ci}" data-ri="${whose.other.ri}" title="${t("an.switch.hint")}">${t("an.switch", { o: whose.other.name })}</button>` : ""}
        ${mode === "manual" ? html`${taus ? "" : html`<button type="button" class="btn btn-sm" id="an-add">${t("an.cal.add")}</button>`}
          <button type="button" class="btn btn-sm" id="an-skip">${t("an.cal.skip")}</button>
          <button type="button" class="btn btn-sm" id="an-undo">${t("an.cal.undo")}</button>
          <button type="button" class="btn btn-sm" id="an-clear">${t("an.cal.clear")}</button>
          <button type="button" class="btn btn-sm" id="an-auto">${t("an.cal.backAuto")}</button>`
        : html`<button type="button" class="btn btn-sm" id="an-manual">${t("an.cal.manual")}</button>${olderReading ? html`<button type="button" class="btn btn-sm" id="an-auto">${t("an.cal.backAuto")}</button>` : ""}`}</div>`;
    $$("[data-target]").forEach((b) => b.addEventListener("click", () => { cur = Number(b.dataset.target); if (mode !== "manual") { mode = "manual"; } side(); draw(); }));
    $("#an-switch")?.addEventListener("click", (e) => { const d = e.currentTarget.dataset; di = Number(d.di); ci = Number(d.ci); ri = Number(d.ri); pickers(); setup(); });
    $("#an-skip")?.addEventListener("click", () => { if (cur >= 0) cur = nextTarget(cur + 1); side(); draw(); });
    $("#an-add")?.addEventListener("click", () => {
      // a new control before the finish (or at the end), then the controls renumbered
      const fi = targets.findIndex((g) => g.kind === "finish"), at = fi >= 0 ? fi : targets.length;
      targets.splice(at, 0, { kind: "control", label: "", code: "", tau: null, tEst: null, pos: null, added: true });
      let n = 0;
      targets.forEach((g, i) => { g.i = i; if (g.kind === "control") g.label = String(++n); });
      cur = at; side(); draw();
    });
    $("#an-undo")?.addEventListener("click", () => {
      const done = targets.filter((g) => g.pos).map((g) => g.i);
      if (done.length) { const lastI = Math.max(...done); targets[lastI].pos = null; targets[lastI].tEst = null; cur = lastI; savePositions(); recompute(); side(); draw(); }
    });
    $("#an-clear")?.addEventListener("click", () => { targets.forEach((g) => { g.pos = null; g.tEst = null; }); cur = 0; savePositions(); recompute(); side(); draw(); });
    $("#an-done").addEventListener("click", finish);
    bindKeepBox($("#an-side"));
    $("#an-manual")?.addEventListener("click", () => { mode = "manual"; cur = nextTarget(0); if (cur < 0) cur = 0; side(); draw(); });
    $("#an-auto")?.addEventListener("click", () => prepare({ fresh: true }));
  }
  /** A click on the map in manual mode: the current target goes there (snapped to a circle found nearby). */
  function placeClick(px, py) {
    if (cur < 0 || mode !== "manual") return;
    let pos = [Math.round(px * 10) / 10, Math.round(py * 10) / 10];
    if (course?.r) {
      const all = [...course.controls, ...(course.start ? [course.start] : []), ...(course.finish ? [course.finish] : [])];
      const near = all.map((c) => [Math.hypot(c.x - px, c.y - py), c]).sort((a, b) => a[0] - b[0])[0];
      if (near && near[0] <= 1.2 * course.r) pos = [near[1].x, near[1].y];
      else if (course.probe && targets[cur].kind === "control") {                  // a ring the first pass missed, right here?
        const hit = course.probe(px, py, 1.2 * course.r, { loose: true });
        if (hit) pos = [hit.x, hit.y];
      }
    }
    targets[cur].pos = pos; targets[cur].missed = false;
    cur = nextTarget(cur + 1);
    savePositions();
    recompute();
    side();
    draw();
  }

  // ---- a route drawn by hand ------------------------------------------------------------------------------------------
  // (owner, 2026-11-02, after RouteGadget): no GPS track — the runner clicks the route on the map, control to control, and the
  // controls' times make it run (trace/drawroute.js). The result is a GPX made here and taken as a dropped trace: everything
  // after (the legs, the curves, the image, Mes cartes) works as for a watch's file.
  /** The trace is a route drawn on this map (its drawing kept in the GPX, for a map of the same size). */
  function drawnHere() { return !!(track?.drawn && map && track.drawn.w === map.width && track.drawn.h === map.height && validGeo(track.drawn.geo)); }
  function drawBlock() {
    if (!map || (track && !track.drawn) || track?.drawn?.replay) return "";       // a run replayed from « Mes cartes » is not edited
    const own = !!track?.drawn;
    return html`<div class="an-drawbox"><b>${t(own ? "an.draw.own" : "an.draw.box")}</b>
      <button type="button" class="btn btn-sm${own ? "" : " btn-primary"}" id="an-draw-go">✎ ${t(own ? "an.draw.edit" : "an.draw.go")}</button>
      ${own && !track.drawn.nogeo ? html`<button type="button" class="btn btn-sm" id="an-draw-gpx">⤓ ${t("an.draw.gpx")}</button>` : ""}
      <span class="muted">${t("an.draw.hint")}</span></div>`;
  }
  /** The circles the drawing snaps to: the organiser's controls, else those read on the map. */
  function snapPts() {
    if (files.orga) return files.orga.controls.map((c) => ({ kind: c.kind, x: c.x, y: c.y }));
    if (!course) return [];
    return [...(course.start ? [{ kind: "start", x: course.start.x, y: course.start.y }] : []), ...course.controls.map((c) => ({ kind: "control", x: c.x, y: c.y })),
      ...(course.finish ? [{ kind: "finish", x: course.finish.x, y: course.finish.y }] : [])];
  }
  const snapR = () => 1.3 * (files.orga?.r || course?.r || 20);
  const today = () => parisDay(Date.now());
  async function startDraw() {
    if (!map) return;
    stop(); prepToken++;
    const m = drawnHere() ? track.drawn : null;
    const pub = withTimes && ri >= 0 ? startOf(runner()) : null;
    const dayOf = (ms) => parisDay(ms), secOf = (ms) => Math.round((ms - (Date.parse(`${dayOf(ms)}T00:00:00Z`) - parisOffsetMs(dayOf(ms)))) / 1000);
    drawing = { d: m ? drawingOf(m) : { pts: [], kind: [], at: {} }, step: m ? "times" : "draw", force: false, km: m?.km ?? null,
      day: m ? dayOf(m.start) : race?.date_iso || today(), startS: m ? secOf(m.start) : pub ?? 36000, err: "", pubNote: "" };
    calibrated = false; hideResults();
    $("#an-work").hidden = false;
    steps(3); size(); fitView();
    if (!files.orga && (!courseCache || courseCache.image !== map)) {
      status = t("an.st.reading"); busy = 0; drawSide(); draw(); await tick();
      let c = null;
      try { c = await detectCourse(map, { progress: readingProgress(drawSide) }); } catch (e) { console.error(e); }
      busy = false;
      courseCache = { image: map, course: c };
    }
    course = files.orga ? null : courseCache?.course || null;
    status = "";
    window.anDebugDraw = () => ({ drawing, view, snap: snapPts(), click: (x, y, free) => drawClick(x, y, free) });     // support, in the console
    if (drawing) { drawSide(); draw(); }
  }
  /** A click while drawing: the start first, then the route's points; one near a control's circle points it. */
  function drawClick(x, y, free) {
    const d = drawing.d, n = d.pts.length, R = snapR();
    const near = free ? null : snapPts().map((p) => [Math.hypot(p.x - x, p.y - y), p]).filter(([v]) => v <= R).sort((a, b) => a[0] - b[0])[0]?.[1] || null;
    if (!n) {
      d.pts.push(near ? [near.x, near.y] : [x, y]); d.kind.push("start");
    } else {
      let k = "", p = [x, y];
      if (near && near.kind !== "start") { p = [near.x, near.y]; k = near.kind; }
      else if (near?.kind === "start" && n > 2) { p = [near.x, near.y]; k = "finish"; }        // the finish drawn round the start
      if (drawing.force) { k = "control"; drawing.force = false; }
      if (k && Math.hypot(p[0] - d.pts[n - 1][0], p[1] - d.pts[n - 1][1]) < 1) return;   // the same circle again
      d.pts.push(p); d.kind.push(k);
      drawing.raw = null; drawing.snapNote = "";
      if (k === "finish") toTimes();
    }
    drawing.err = ""; drawSide(); draw();
  }
  function toTimes() {
    const d = drawing.d;
    if (d.pts.length < 2) { drawing.err = t("an.draw.err.points"); return; }
    if (d.kind[d.kind.length - 1] !== "finish") {
      if (d.kind[d.kind.length - 1] === "") d.kind[d.kind.length - 1] = "finish";
      else { d.pts.push([...d.pts[d.pts.length - 1]]); d.kind.push("finish"); }
    }
    // the published split times, when the race has them for as many controls as the drawing points
    const x = withTimes && ri >= 0 ? runner() : null;
    const taus = x?.splits ? [0, ...x.splits, x.status === "ok" ? x.time_s : null] : null;
    const A = anchorsOf(d);
    drawing.pubNote = "";
    if (taus && !Object.keys(d.at).length) {
      if (taus.length === A.length) { A.forEach((a, j) => { if (j && taus[j] != null) d.at[a.i] = taus[j]; }); drawing.pubNote = t("an.draw.published", { r: x.name || "" }); }
      else drawing.pubNote = t("an.draw.publishedCount", { n: taus.length - 2, m: A.length - 2 });
    } else if (!taus && x?.status === "ok" && x.time_s != null && !Number.isFinite(d.at[A[A.length - 1].i])) d.at[A[A.length - 1].i] = x.time_s;
    if (drawing.km == null && withTimes && klass()?.length_m) drawing.km = klass().length_m / 1000;
    drawing.step = "times";
  }
  const hm = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  function drawSide() {
    if (!drawing) return;
    const d = drawing.d, A = anchorsOf(d), ctl = A.filter((a) => a.k === "control").length, side = $("#an-side");
    side.hidden = false; side.classList.add("an-cal");
    const labelOf = (a) => (a.k === "start" ? t("an.start") : a.k === "finish" ? t("an.finish") : String(A.filter((b) => b.k === "control" && b.i <= a.i).length));
    if (drawing.step === "draw") {
      side.innerHTML = html`<div class="an-side-body"><div class="an-side-title">✎ ${t("an.draw.title")}</div>
        ${busy !== false ? busyBlock() : status ? html`<p class="muted">${status}</p>` : ""}
        <p class="hint">${t(d.pts.length ? "an.draw.help" : "an.draw.help0")}</p>
        <p class="muted">${t("an.draw.count", { n: d.pts.length, c: ctl })}${course || files.orga || status ? "" : html` · ${t("an.draw.noCircles")}`}</p>
        ${drawing.err ? html`<div class="notice">${drawing.err}</div>` : ""}${snapBox()}</div>
        <div class="an-actions">
          <button type="button" class="btn btn-primary" id="an-dr-fin" ${raw(d.pts.length >= 2 ? "" : "disabled")}>${t("an.draw.finishHere")}</button>
          <button type="button" class="btn btn-sm" id="an-dr-force" aria-pressed="${drawing.force}" ${raw(d.pts.length ? "" : "disabled")}>◎ ${t("an.draw.force")}</button>
          <button type="button" class="btn btn-sm" id="an-dr-undo" ${raw(d.pts.length ? "" : "disabled")}>↶ ${t("an.draw.undo")}</button>
          <button type="button" class="btn btn-sm" id="an-dr-clear" ${raw(d.pts.length ? "" : "disabled")}>${t("an.draw.clear")}</button>
          <button type="button" class="btn btn-sm" id="an-dr-cancel">${t("an.draw.cancel")}</button></div>`;
      $("#an-dr-fin").addEventListener("click", () => { toTimes(); drawSide(); draw(); });
      $("#an-dr-force").addEventListener("click", () => { drawing.force = !drawing.force; drawSide(); });
      $("#an-dr-undo").addEventListener("click", () => drawUndo());
      $("#an-dr-clear").addEventListener("click", () => { d.pts = []; d.kind = []; d.at = {}; drawSide(); draw(); });
      $("#an-dr-cancel").addEventListener("click", () => cancelDraw());
      bindSnap();
      return;
    }
    const pub = withTimes && ri >= 0 && race?.date_iso && startOf(runner()) != null;
    const georef = !!mapGeo();
    side.innerHTML = html`<div class="an-side-body"><div class="an-side-title">✎ ${t("an.draw.times")}</div>
      <p class="hint">${t("an.draw.times.help")}</p>
      ${drawing.pubNote ? html`<p class="muted">${drawing.pubNote}</p>` : ""}
      <div class="an-dr-times">${A.slice(1).map((a) => html`<label><b>${labelOf(a)}</b><input type="text" inputmode="numeric" data-at="${a.i}" placeholder="${a.k === "finish" ? "52:10" : "—"}" value="${Number.isFinite(d.at[a.i]) ? clock(d.at[a.i]) : ""}"></label>`)}</div>
      ${pub ? "" : html`<div class="an-dr-when"><label><span>${t("an.draw.day")}</span><input type="date" id="an-dr-day" value="${drawing.day}"></label>
        <label><span>${t("an.draw.start")}</span><input type="time" id="an-dr-start" value="${hm(drawing.startS)}"></label></div>`}
      ${georef ? "" : html`<label class="an-dr-km"><span>${t("an.draw.km")}</span><input type="text" inputmode="decimal" id="an-dr-km" value="${drawing.km != null ? fmt(drawing.km, 2) : ""}" placeholder="4,5"></label>
        <p class="hint">${t("an.draw.km.hint")}</p>`}
      ${drawing.err ? html`<div class="notice">${drawing.err}</div>` : ""}${snapBox()}</div>
      <div class="an-actions"><button type="button" class="btn btn-primary" id="an-dr-ok">${t("an.draw.ok")}</button>
        <button type="button" class="btn btn-sm" id="an-dr-back">✎ ${t("an.draw.back")}</button>
        <button type="button" class="btn btn-sm" id="an-dr-cancel">${t("an.draw.cancel")}</button></div>`;
    const read = () => {
      let bad = false;
      $$("[data-at]", side).forEach((el) => { const v = parseClock(el.value); if (Number.isNaN(v)) bad = true; if (v == null || Number.isNaN(v)) delete d.at[el.dataset.at]; else d.at[el.dataset.at] = v; });
      const day = $("#an-dr-day")?.value, st = $("#an-dr-start")?.value;
      if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) drawing.day = day;
      if (st && /^\d{1,2}:\d{2}/.test(st)) { const [h, m] = st.split(":").map(Number); drawing.startS = h * 3600 + m * 60; }
      if ($("#an-dr-km")) { const km = Number(String($("#an-dr-km").value).replace(",", ".")); drawing.km = Number.isFinite(km) && km > 0 ? km : null; }
      return !bad;
    };
    $$("input", side).forEach((el) => el.addEventListener("change", read));
    $("#an-dr-ok").addEventListener("click", () => { if (!read()) { drawing.err = t("an.draw.err.times"); drawSide(); return; } buildDrawn(); });
    $("#an-dr-back").addEventListener("click", () => { read(); drawing.step = "draw"; drawing.err = ""; drawSide(); draw(); });
    $("#an-dr-cancel").addEventListener("click", () => cancelDraw());
    bindSnap(read);
  }
  function drawUndo() {
    if (!drawing) return;
    const d = drawing.d;
    if (drawing.step === "times") drawing.step = "draw";
    else if (d.pts.length) { delete d.at[d.pts.length - 1]; d.pts.pop(); d.kind.pop(); }
    drawSide(); draw();
  }
  function cancelDraw() { endDraw(); filesCard(); setup(); }
  /** The drawing ends: its map reader (the snapping's) goes with it. */
  function endDraw() { drawing?.plan?.destroy(); drawing = null; }
  /** The map's georeference (lon, lat -> px) from the files given, for a route drawn on it: { geo }, or null. */
  function mapGeo() {
    if (!map) return null;
    const W = map.width, H = map.height;
    try {
      if (files.orga?.geo && validGeo(files.orga.geo)) return { geo: files.orga.geo };
      let F = frameAt(46.5, 2.5), fitG = null;
      if (files.geo?.overlay) { const c = kmlCorners(files.geo.overlay)[0]; F = frameAt(c[0], c[1]); fitG = fitFromKml(files.geo.overlay, W, H, F); }
      else if (files.geo?.corners) { F = frameAt(...files.geo.corners[0]); fitG = fitAffine(files.geo.corners.map(([lat, lon]) => toLocal(F, lat, lon)), [[0, 0], [W, 0], [W, H], [0, H]]); }
      else if (files.world?.wf) { const crs = files.prj?.crs || guessCrs(files.world.wf[4], files.world.wf[5], F.lon0); if (crs) fitG = fitFromWorld(files.world.wf, crs, W, H, F); }
      const g = fitG ? geoFromFit(fitG, F) : null;
      return validGeo(g) ? { geo: g } : null;
    } catch (e) { console.error(e); return null; }
  }
  /** A map without georeference: its pixels a metre — the course's length the runner gives (else the class's) over the course
   *  drawn from control to control; else the circles' size, 7.5 mm across at 1:10 000 in forest, 6 mm at 1:4 000 in sprint. */
  function ownScale(d) {
    const sp = straightPx(d), rr = files.orga?.r || course?.r || null, sprint = /sprint/i.test(`${race?.name || ""} ${klass()?.name || ""}`);
    return drawing.km > 0 && sp > 0 ? sp / (drawing.km * 1000) : rr ? rr / (sprint ? 12 : 37.5) : 1;
  }

  // ---- « Coller aux chemins » (owner, 2026-11-02): each leg of the sketch laid on the way the map's reading runs nearest to it —
  // the computed routes' engine (trace/routeplan.js, routechoice.js matchRoute: the fastest way within a corridor round the line
  // drawn, widened once when it crosses what reads impassable) —, the controls kept where they are; « Revenir à mon dessin »
  // brings the sketch back. The map is read once per drawing, in a worker.
  async function snapDrawing() {
    const d = drawing.d, A = anchorsOf(d);
    if (A.length < 2 || drawing.snapping) return;
    const W = map.width, H = map.height, g = mapGeo()?.geo || ownGeo(ownScale(d), W, H);
    const [la0, lo0] = pxToLatLon(g, W / 2, H / 2), F = frameAt(la0, lo0);
    const toMp = (x, y) => { const [la, lo] = pxToLatLon(g, x, y); return [(lo - lo0) * F.kx, -(la - la0) * F.ky]; };
    const sprint = RC.isSprint(race) || /sprint/i.test(klass()?.name || "");
    const say = (text, frac = null) => { if (!drawing) return; drawing.snapping = text; drawing.snapProg = frac; drawSide(); };
    const me = drawing;
    try {
      say(t("an.draw.snap.reading"), 0);
      if (!me.plan) me.plan = RC.planner(map, toMp, null, { map: sprint ? "sprint" : "forest", onProgress: (f) => { if (drawing === me) say(t("an.draw.snap.reading"), f); } });
      await me.plan.ready;
      await me.plan.controls(A.map((a) => d.pts[a.i]));
      if (drawing !== me) return;
      const raw0 = me.raw || { pts: d.pts.map((p) => [...p]), kind: [...d.kind], at: { ...d.at } };
      const out = { pts: [[...d.pts[A[0].i]]], kind: [A[0].k], at: {} }, tol = sprint ? 15 : 30;
      let done = 0;
      for (let j = 1; j < A.length; j++) {
        say(t("an.draw.snap.leg", { n: j, t: A.length - 1 }), (j - 1) / (A.length - 1));
        const a = A[j - 1].i, b = A[j].i, inner = d.pts.slice(a + 1, b);
        const r = await me.plan.match(d.pts[a], d.pts[b], inner, tol, []);
        if (drawing !== me) return;
        const mid = r?.snapped && r.pts.length > 2 ? r.pts.slice(1, -1) : inner;
        if (r?.snapped) done++;
        for (const p of mid) { out.pts.push([p[0], p[1]]); out.kind.push(""); }
        out.pts.push([...d.pts[b]]); out.kind.push(A[j].k);
        if (Number.isFinite(d.at[b])) out.at[out.pts.length - 1] = d.at[b];
      }
      for (let i = A[A.length - 1].i + 1; i < d.pts.length; i++) { out.pts.push([...d.pts[i]]); out.kind.push(d.kind[i]); }    // after the last control
      me.raw = raw0; me.d = out;
      me.snapNote = t("an.draw.snap.done", { n: done, t: A.length - 1 });
    } catch (e) { console.error(e); me.snapNote = t("an.draw.snap.failed"); }
    if (drawing === me) { me.snapping = ""; me.snapProg = null; drawSide(); draw(); }
  }
  /** The sketch as drawn before the snapping, the times typed since kept for its controls. */
  function unsnapDrawing() {
    if (!drawing?.raw) return;
    const cur = drawing.d, raw0 = drawing.raw, A = anchorsOf(cur), R = anchorsOf(raw0);
    if (A.length === R.length) A.forEach((a, j) => { if (Number.isFinite(cur.at[a.i])) raw0.at[R[j].i] = cur.at[a.i]; else delete raw0.at[R[j].i]; });
    drawing.d = raw0; drawing.raw = null; drawing.snapNote = "";
    drawSide(); draw();
  }
  /** The snapping's line in the drawing's panel: its button, or where it is, and what it does. */
  function snapBox() {
    if (anchorsOf(drawing.d).length < 2) return "";
    return html`<div class="an-dr-snap">${drawing.snapping
      ? html`<div class="muted">${drawing.snapping}</div>${raw(drawing.snapProg == null ? "<progress></progress>" : `<progress max="1" value="${drawing.snapProg}"></progress>`)}`
      : html`<div class="an-dr-snap-btns"><button type="button" class="btn btn-sm" id="an-dr-snap">⤳ ${t("an.draw.snap")}</button>
        ${drawing.raw ? html`<button type="button" class="btn btn-sm" id="an-dr-unsnap">↶ ${t("an.draw.unsnap")}</button>` : ""}</div>`}
      <p class="hint">${drawing.snapNote || t("an.draw.snap.hint")}</p></div>`;
  }
  const bindSnap = (before = null) => {
    $("#an-dr-snap")?.addEventListener("click", () => { before?.(); snapDrawing(); });
    $("#an-dr-unsnap")?.addEventListener("click", () => { before?.(); unsnapDrawing(); });
  };
  /** The drawing made a GPX, then taken as a trace dropped on the page. */
  async function buildDrawn() {
    const d = drawing.d, T = timeline(d);
    if (!T) { drawing.err = t("an.draw.err.times"); drawSide(); return; }
    const W = map.width, H = map.height, mg = mapGeo();
    let geo = mg?.geo || null, nogeo = false;
    if (!geo) { geo = ownGeo(ownScale(d), W, H); nogeo = true; }
    const pub = withTimes && ri >= 0 && race?.date_iso ? startOf(runner()) : null;
    const day = pub != null ? race.date_iso : drawing.day;
    const startMs = Date.parse(`${day}T00:00:00Z`) - parisOffsetMs(day) + (pub ?? drawing.startS) * 1000;
    const name = [race?.name, withTimes && ri >= 0 ? runner()?.name : ""].filter(Boolean).join(" · ") || t("an.draw.name");
    const gpx = toGpx({ d, T, geo, nogeo, startMs, w: W, h: H, name, km: drawing.km });
    const file = new File([gpx], `ozimut-${day}-${t("an.draw.file")}.gpx`, { type: "application/gpx+xml" });
    endDraw();
    orgaGo = true;                                                   // placed by its own making: straight to its playback
    await take([file]);
  }
  function downloadDrawn() {
    const f = files.trace?.file;
    if (!f) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  /** The drawing on the map: the circles it snaps to, its line, its points, the controls pointed numbered. */
  function paintDrawing(lw) {
    const d = drawing.d, R = snapR();
    ctx.strokeStyle = "rgba(166, 38, 164, 0.5)"; ctx.lineWidth = lw(1.5);
    for (const p of snapPts()) { ctx.beginPath(); ctx.arc(p.x, p.y, R / 1.3, 0, Math.PI * 2); ctx.stroke(); }
    if (!d.pts.length) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = lw(6); ctx.beginPath(); d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = "#e8641c"; ctx.lineWidth = lw(3); ctx.stroke();
    ctx.font = `${lw(13)}px system-ui, sans-serif`; ctx.textBaseline = "middle";
    let n = 0;
    d.pts.forEach(([x, y], i) => {
      const k = d.kind[i];
      if (!k) { ctx.beginPath(); ctx.arc(x, y, lw(3), 0, Math.PI * 2); ctx.fillStyle = "#e8641c"; ctx.fill(); return; }
      ctx.beginPath(); ctx.arc(x, y, lw(10), 0, Math.PI * 2); ctx.strokeStyle = "#a626a4"; ctx.lineWidth = lw(3); ctx.stroke();
      const label = k === "start" ? t("an.start") : k === "finish" ? t("an.finish") : String(++n);
      ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = lw(3); ctx.strokeText(label, x + lw(13), y);
      ctx.fillStyle = "#a626a4"; ctx.fillText(label, x + lw(13), y);
    });
  }
  const onDrawKey = (e) => {
    if (!drawing || e.target.closest?.("input, textarea, select")) return;
    if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") { e.preventDefault(); drawUndo(); }
    else if (e.key === "Escape" && drawing.step === "draw" && drawing.force) { drawing.force = false; drawSide(); }
  };
  document.addEventListener("keydown", onDrawKey);

  // ---- 4. the playback ----------------------------------------------------------------------------------------------
  function finish() {
    if (!fit || offset == null) return;
    openShown(false);
    calibrated = true; marks = false; tNow = 0;
    savePositions(true);
    steps(4);
    $("#an-side").classList.remove("an-cal");
    document.body.classList.add("an-theatre");           // the page head and the steps give way to the map; the menus stay
    window.scrollTo(0, 0);
    const avail = Object.keys(track.ch).filter((c) => CHANNEL_LABEL[c]);
    const known = sequenceKnown();
    const short = [traceShortNote(), timesNote()].filter(Boolean);
    const stat = (label, id, sub = "") => html`<span class="an-stat"><span class="muted">${label}</span> <b id="${id}">—</b>${sub ? raw(sub) : ""}</span>`;
    // the controls above the map: the race's line, play, the time slider, and what the trace says now
    // the top line as « Analyse de carte »'s (owner, 2026-11-05): what is played, and on an organiser's map who may open it
    const rc0 = races.find((x) => x.key === key), day0 = parisDay(track.ms0 + offset * 1000);
    $("#an-top").innerHTML = html`<span class="sh-top-l">${orgaMode ? html`<b class="sh-title">${orga.A.title}</b><span class="muted">${[orga.A.date ? fmtDate(orga.A.date) : "", t(orga.A.kind === "race" ? "ma.kind.race" : "sh.kind.club")].filter(Boolean).join(" · ")}</span>`
        : perso ? html`<b class="sh-title">${openedKept?.title || t("an.perso.title")}</b><span class="muted">${fmtDate(day0)}</span>`
        : html`<b class="sh-title">${rc0?.name || race?.name || ""}</b><span class="muted">${[fmtDate(day0), klass()?.name, withTimes ? runner()?.name : ""].filter(Boolean).join(" · ")}</span>`}</span>
      <span></span><span class="sh-top-r">${orgaMode ? html`<span class="muted sh-access">${t(`sh.access.${orga.A.vis === "public" && orga.A.visitors ? "all" : orga.A.vis === "club" && orga.A.code ? "clubCode" : orga.A.vis}`)}</span>` : ""}<span class="muted an-kept" id="an-kept"></span><span class="fw-btns">${raw(mapOnlyButton())}${raw(fwButtons({ tab: false }))}</span></span>`;
    $("#an-top").hidden = false;
    // the controls over the map's column, as « Analyse de carte »'s: follow, the transport, the speed, the time
    $("#an-bar").innerHTML = html`
      <div class="an-bar-row">
        <span id="an-legpick-slot"></span>
        <span class="an-transport">
          <button type="button" class="btn btn-sm sh-pan${follow ? " on" : ""}" id="an-follow" aria-pressed="${follow}" aria-label="${t(follow ? "sh.pan.stop" : "sh.pan.start")}" title="${t("an.follow.hint")}">${raw(PAN_ICON)}</button>
          <button type="button" class="btn btn-sm" id="an-prev" title="${t("an.prevLeg")}">⏮</button>
          <button type="button" class="btn btn-sm btn-primary" id="an-play" title="${t("an.play")}">▶</button>
          <button type="button" class="btn btn-sm" id="an-next" title="${t("an.nextLeg")}">⏭</button>
          <select id="an-speed" aria-label="${t("an.speed")}" title="${t("an.speed")}">${SPEEDS.map((v) => html`<option value="${v}" ${raw(v === speed ? "selected" : "")}>×${v}</option>`)}</select></span>
        <input type="range" class="an-bar-time" id="an-time" min="0" max="${Math.ceil(total)}" step="0.5" value="0" aria-label="${t("an.time")}">
        <span class="sh-clock"><b id="an-t"></b> <span class="muted" id="an-t-sub"></span></span></div>`;
    // what the trace says now: in the pace's bar under the map (owner, 2026-11-05)
    $("#an-stats").innerHTML = html`
        ${stat(t(known ? "an.leg" : "an.legNear"), "an-leg", html` <span class="muted" id="an-leg-sub"></span>`)}
        ${stat(t("an.pace"), "an-pace", html` <span class="muted">${t("an.pace.short")}</span>`)}
        ${stat(t("an.dist"), "an-dist", html` <span class="muted" id="an-dist-sub"></span>`)}
        ${avail.filter((c) => c !== "ele").map((c) => stat(t(CHANNEL_LABEL[c]), `an-ch-${c}`, html` <span class="muted">${unitOf(c)}</span>`))}
        ${track.ch.ele ? html`<span class="an-stat" title="${t("an.climbSo.tip")}"><span class="muted">${t("an.climbSo")}</span> <b id="an-climb">—</b> <span class="muted">m</span></span>` : ""}
        ${short.map((x) => html`<span class="an-warn" title="${x}">⚠ ${x}</span>`)}`;
    $("#an-stripbar").hidden = false; $("#an-ps").hidden = !showStrip;
    $("#an-ps-tog").setAttribute("aria-expanded", String(showStrip)); $("#an-ps-tog").textContent = `${stripArrow(showStrip)} ${graphName(graphBy())}`;
    showPanels(false);
    $("#an-bar").hidden = false; $("#an-side").hidden = true; $("#an-left").hidden = false; $("#an-right").hidden = false;
    // the right panel: the display, and (administrators) the computed routes' settings
    rightP.pane("display").innerHTML = html`
      <div class="an-opts">
          <label><span>${t("an.width")}</span><select id="an-width">${WIDTHS.map(([w, k]) => html`<option value="${w}" ${raw(w === width ? "selected" : "")}>${t(k)}</option>`)}</select></label>
          <label><span>${t("an.colour")}</span><select id="an-colour">${["plain", ...colourModes(track)].map((c) => html`<option value="${c}" ${raw(c === (colourBy() || "plain") ? "selected" : "")} title="${c === "gap" ? t("an.colour.gap.tip") : ""}">${t(`an.colour.${c}`)}</option>`)}</select></label>
          <label id="an-colour-row" ${raw(colourBy() ? "hidden" : "")}><span>${t("an.traceColour")}</span><span class="an-swatches">${TRACE_PRESETS.map((c) => html`<button type="button" class="an-swatch" data-colour="${c}" style="background:${c}" aria-pressed="${c === traceColour}" title="${c}"></button>`)}<input type="color" id="an-colour-pick" value="${traceColour}" title="${t("an.traceColour.any")}"></span></label>
          <label title="${t("an.graph.tip")}"><span>${t("an.graph")}</span><select id="an-graph">${colourModes(track).map((c) => html`<option value="${c}" ${raw(c === graphBy() ? "selected" : "")}>${graphName(c)}</option>`)}</select></label>
          <label><span>${t("an.orient")}</span><select id="an-orient"><option value="north" ${raw(orient === "north" ? "selected" : "")}>${t("an.orient.north")}</option><option value="leg" ${raw(orient === "leg" ? "selected" : "")}>${t("an.orient.leg")}</option></select></label>
          <label><span>${t("an.future")}</span><select id="an-future"><option value="hide" ${raw(future === "hide" ? "selected" : "")}>${t("an.future.hide")}</option><option value="faint" ${raw(future === "faint" ? "selected" : "")}>${t("an.future.faint")}</option></select></label>
          <label><span>${t("an.tail")}</span><select id="an-tail">${TAILS.map((v) => html`<option value="${v}" ${raw(v === tail ? "selected" : "")}>${v ? clock(v) : t("an.tail.all")}</option>`)}</select></label>
          <label><span>${t("an.mapAlpha")}</span><input type="range" id="an-map-alpha" min="10" max="100" step="5" value="${mapAlpha}"></label>
          <label><span>${t("an.traceAlpha")}</span><input type="range" id="an-trace-alpha" min="10" max="100" step="5" value="${traceAlpha}"></label>
          <label><span>${t("sh.course.show")}</span><input type="checkbox" id="an-course-on" ${raw((coursePrinted() ? courseOver : courseOn) ? "checked" : "")}></label>
        </div><div id="an-3d-opts" hidden></div>
      ${short.map((x) => html`<div class="notice" style="margin-top:8px">${x}</div>`)}
      ${rmsM != null || geoHow ? html`<div class="an-fitbox muted">${rmsM != null ? html`${t("an.cal.fit")} ${fmt(rmsM)} m` : ""}${geoHow ? html`${rmsM != null ? " · " : ""}${t("an.st.geo")} ${geoHow}` : ""}</div>` : ""}`;
    // the third tab (owner, 2026-11-05): what leaves the page — an image of the map, the map and the run into « Mes cartes »
    rightP.pane("export").innerHTML = html`
      <div class="an-opts an-shot"><b>${t("an.shot.title")}</b>
        <label><span>${t("an.shot.zone")}</span><select id="an-shot-zone"><option value="view" ${raw(shot.zone === "view" ? "selected" : "")}>${t("sh.shot.zone.view")}</option><option value="race" ${raw(shot.zone === "race" ? "selected" : "")}>${t("an.shot.zone.race")}</option><option value="map" ${raw(shot.zone === "map" ? "selected" : "")}>${t("an.shot.zone.map")}</option></select></label>
        <label><span>${t("an.shot.type")}</span><select id="an-shot-type"><option value="png" ${raw(shot.type === "png" ? "selected" : "")}>PNG</option><option value="jpeg" ${raw(shot.type === "jpeg" ? "selected" : "")}>JPEG</option></select></label>
        <label><span>${t("an.shot.legend")}</span><input type="checkbox" id="an-shot-legend" ${raw(shot.legend ? "checked" : "")}></label>
        <button type="button" class="btn btn-sm btn-primary" id="an-shot">⤓ ${t("an.shot.save")}</button><span class="muted an-shot-state" id="an-shot-state"></span></div><div id="an-mymaps"></div>`;
    if (routesOk) rightP.pane("compute").innerHTML = html`<div id="rc-host"></div>`;
    sliderSpan();
    $("#an-play").addEventListener("click", () => (playing ? stop() : play()));
    $("#an-prev").addEventListener("click", () => jumpLeg(-1));
    $("#an-next").addEventListener("click", () => jumpLeg(1));
    $("#an-speed").addEventListener("change", (e) => { speed = Number(e.target.value); });
    const slider = $("#an-time");
    slider.addEventListener("input", (e) => { moved(); seek(Number(e.target.value)); });
    slider.addEventListener("pointerdown", () => { scrubbing = true; });
    slider.addEventListener("pointerup", () => { scrubbing = false; });
    $("#an-follow").addEventListener("click", () => { setFollow(!follow); if (follow) moved(); draw(); });
    $("#an-course-on").addEventListener("change", (e) => { showCourse = e.target.checked; if (coursePrinted()) courseOver = showCourse; else courseOn = showCourse; savePrefs(); draw(); });
    $("#an-ps-tog").onclick = () => setStrip(!showStrip);
    // a click or a drag on the pace seeks, as on « Analyse de carte »
    const ps = $("#an-ps");
    let psDrag = false;
    const psSeek = (e) => { stop(); moved(); seek(stripFraction(ps, e.offsetX) * total); };
    ps.onpointerdown = (e) => { psDrag = true; try { ps.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } psSeek(e); };
    ps.onpointermove = (e) => { if (psDrag) psSeek(e); };
    ps.onpointerup = ps.onpointercancel = () => { psDrag = false; };
    applyLayout();
    // the trace's colour applies to the plain trace only: hidden while it is coloured by a measure
    $("#an-graph").addEventListener("change", (e) => { graph = e.target.value; savePrefs(); $("#an-ps-tog").textContent = `${stripArrow(showStrip)} ${graphName(graphBy())}`; paceStrip(); });
    $("#an-colour").addEventListener("change", (e) => { colour = e.target.value; vSet = false; $("#an-colour-row").hidden = colour !== "plain"; savePrefs(); paceLegend(); draw(); });
    const shotSet = () => { shot.zone = $("#an-shot-zone").value; shot.type = $("#an-shot-type").value; shot.legend = $("#an-shot-legend").checked; savePrefs(); };
    ["#an-shot-zone", "#an-shot-type", "#an-shot-legend"].forEach((s) => $(s).addEventListener("change", shotSet));
    $("#an-shot").addEventListener("click", () => exportImage());
    // an organiser's map lent, not given (their switch « export », owner 2026-11-16): no image of it from here
    if (!orgaOpt("export", true) && !orga?.organiser) rightP.pane("export").querySelector(".an-shot").innerHTML = html`<b>${t("an.shot.title")}</b><p class="hint" style="margin:0">${t("sh.export.closed")}</p>`;
    // « Enregistrer dans Mes cartes » (owner, 2026-11-01): the map and the run as drawn here (trace/mymapsave.js)
    // a run replayed from « Mes cartes » is there already; a kept analysis replayed may go there
    if (!orgaOpt("mymaps", true) || (track?.drawn?.replay && !openedKept)) $("#an-mymaps").hidden = true;
    else import("../trace/mymapsave.js").then((M) => M.mount($("#an-mymaps"), mmState)).catch((e) => console.error(e));
    keepAnalysis();
    $("#an-width").addEventListener("change", (e) => { width = Number(e.target.value); savePrefs(); draw(); });
    $("#an-map-alpha").addEventListener("input", (e) => { mapAlpha = Number(e.target.value); savePrefs(); draw(); });
    $("#an-trace-alpha").addEventListener("input", (e) => { traceAlpha = Number(e.target.value); savePrefs(); draw(); });
    $("#an-tail").addEventListener("change", (e) => { tail = Number(e.target.value); savePrefs(); draw(); });
    $("#an-future").addEventListener("change", (e) => { future = e.target.value; savePrefs(); draw(); });
    $("#an-orient").addEventListener("change", (e) => { orient = e.target.value; savePrefs(); draw(); });
    const setColour = (c) => { traceColour = c; savePrefs(); $$(".an-swatch").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.colour === c))); $("#an-colour-pick").value = c; draw(); drawChips(); };
    $$(".an-swatch").forEach((b) => b.addEventListener("click", () => setColour(b.dataset.colour)));
    $("#an-colour-pick").addEventListener("input", (e) => setColour(e.target.value));
    // the curves under the map: the pace and the file's channels, any number of them, one above the other
    const chipsBox = $("#an-chips");
    const drawChips = () => {
      chipsBox.innerHTML = html`${["pace", ...avail].map((c) => html`<button type="button" class="an-chip" data-ch="${c}" aria-pressed="${chans.has(c)}" style="--chip:${curveColour(c)}">${t(c === "pace" ? "an.ch.pace" : CHANNEL_LABEL[c])}</button>`)}`;
      $$("[data-ch]", chipsBox).forEach((b) => b.addEventListener("click", () => { const c = b.dataset.ch; if (chans.has(c)) chans.delete(c); else chans.add(c); savePrefs(); drawChips(); sizeStrip(); drawStrip(); }));
    };
    drawChips();
    redrawChips = drawChips;
    $("#an-split-g").hidden = false; $("#an-split-s").hidden = false;
    leftP.setTab("legs", known);                          // the panel opens on it when offered, else on the curves
    applyLayout();
    if (known) legsTable(); else $("#an-legs").innerHTML = "";
    sizeStrip();
    paceLegend();
    // the panels' widths this analysis had (owner, 2026-11-05: remembered per analysis — per trace, a replay of a kept one too)
    try { const l = JSON.parse(localStorage.getItem(`ocn.an.lay.${traceSig()}`) || "null"); if (l) { gw = px(l.gw, 160, 1400, gw); sw = px(l.sw, 200, 700, sw); applyLayout(); } } catch (e) { /* the last ones */ }
    // the whole map, as « Analyse de carte » opens (owner, 2026-11-05); the runner followed once played
    still = true; opening = true;
    showCourse = coursePrinted() ? courseOver : courseOn;
    const sc = $("#an-course-on"); if (sc) sc.checked = showCourse;
    fitView();
    seek(0);
    $("#an-3d").hidden = !orgaOpt("view3d", true); $("#an-measure").hidden = false; $("#an-video-btn").hidden = !orgaOpt("video", true);
    soloSeen();
    const gc = $("#an-gen-credit");
    gc.hidden = !LM.isGenerated(files.map?.name);
    if (!gc.hidden) gc.innerHTML = t("an.gen.short", { src: LM.SOURCE_SHORT[LM.gridOfName(files.map?.name).country] || "", osm: html`<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">${t("an.gen.osm")}</a>` });
    if (autoV3) { autoV3 = false; if (orgaOpt("view3d", true)) toggle3d(); }
    rcPanel();
    if (rcs.on) rcStart();
  }
  /** A trace that ends before the race does — before the published time, or far from the finish placed on the map —
   *  was cut short (a file synced before the end, a watch stopped early): said plainly, nothing can show the rest. */
  function traceShortNote() {
    if (!track || !fit || offset == null) return "";
    const end = track.dur - offset, tot = totalOfficial();
    if (tot && end < tot - 60) return t("an.st.short", { t: clock(Math.max(0, end)), T: clock(tot) });
    const fin = targets.find((g) => g.kind === "finish" && g.pos);
    if (!fin) return "";
    const [fx, fy] = toM(fit, fin.pos[0], fin.pos[1]), d = Math.hypot(track.x[track.n - 1] - fx, track.y[track.n - 1] - fy);
    return d > 200 ? t("an.st.shortFar", { t: clock(Math.max(0, end)), d: fmt(Math.round(d / 10) * 10) }) : "";
  }
  /** The view on the race: the whole trace, as large as the box allows (restored: lost in c00a655). */
  function fitTrace() {
    if (!fit || offset == null || !pxs) return;
    const a = indexAt(track, offset), b = indexAt(track, offset + total);
    // measured as the map is shown (a sideways photo is turned upright), its centre turned back
    const r = upTurn(), rc = Math.cos(r), rs = Math.sin(r);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = a; i <= b; i++) { const u = rc * pxs[i] - rs * pys[i], v = rs * pxs[i] + rc * pys[i]; x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); }
    const { w, h } = box();
    if (!w || !h) { pendingFit = fitTrace; return; }
    if (x1 <= x0) return;
    pendingFit = null;
    const top = topReserved(), hh = Math.max(60, h - top);
    const k = Math.min(w / (x1 - x0 + 60), hh / (y1 - y0 + 60), 8), uc = (x0 + x1) / 2, vc = (y0 + y1) / 2;
    view = viewAt(rc * uc + rs * vc, -rs * uc + rc * vc, k, r);
    lastBox = { w, h };
  }
  function setFollow(on) {
    follow = on; savePrefs();
    const b = $("#an-follow");
    if (b) { b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on); b.setAttribute("aria-label", t(on ? "sh.pan.stop" : "sh.pan.start")); }
  }
  // ---- the analysis kept in the account (owner, 2026-11-05, second rule: « Voir is not saving »): « Enregistrer l'analyse », a
  // box beside « Voir la course » (ticked by default, `ocn.an.keep`; in the files card on an organiser's map, where a trace plays at
  // once), sends the map and the run as drawn to /api/solo (trace/solokeep.js) — positions and times only —, listed in « Analyse
  // de carte » as a solo analysis, seen by its owner alone, replayed or deleted there; not « Mes cartes » (« Export » saves there).
  // A calibration made again replaces the analysis kept for that trace; never a replay; the organiser's « Mes cartes » switch
  // decides for a copy of their map. Unticked, the top line offers « Enregistrer l'analyse » during the playback.
  function keepable() { const me = auth.session(); return !!me && !me.demo && orgaOpt("mymaps", true) && !track?.drawn?.replay; }
  function keepOn() { try { return localStorage.getItem("ocn.an.keep") !== "0"; } catch (e) { return true; } }
  function setKeepOn(on) { try { localStorage.setItem("ocn.an.keep", on ? "1" : "0"); } catch (e) { /* this visit */ } }
  // « Carte privée » (owner, 2026-11-06): one's own map left out of the administrators' collection (_lib/maplib.js); off by
  // default, the last choice kept for this browser; not offered on an organiser's map (theirs, published to their runners)
  function privOn() { try { return localStorage.getItem("ocn.an.keepPriv") === "1"; } catch (e) { return false; } }
  function setPrivOn(on) { try { localStorage.setItem("ocn.an.keepPriv", on ? "1" : "0"); } catch (e) { /* this visit */ } }
  /** The box « Enregistrer l'analyse », with what it keeps in its tooltip, and the analysis's name (owner, 2026-11-05: named before
   *  it is saved; renamed later in « Analyse de carte »): the name typed this visit, else the one it was kept under, else the race's. */
  let keepName = null;
  const nameNow = () => keepName ?? keptOf()?.title ?? keepTitle();
  const keepBox = () => (keepable() ? html`<label class="an-keep" title="${t("an.keep.hint")}"><input type="checkbox" class="an-keep-cb" ${raw(keepOn() ? "checked" : "")}> ${t("an.keep")}</label>
    <label class="an-keep-name"><span>${t("an.keep.name")}</span><input type="text" class="an-keep-title" maxlength="200" value="${nameNow()}" placeholder="${t("an.keep.name.ph")}" ${raw(keepOn() ? "" : "disabled")}></label>
    ${orgaMode ? "" : html`<label class="an-keep an-keep-priv" title="${t("an.keep.privTip")}"><input type="checkbox" class="an-keep-pv" ${raw(privOn() ? "checked" : "")}> ${t("an.keep.priv")}</label>`}` : "");
  const bindKeepBox = (root) => {
    $$(".an-keep-cb", root).forEach((cb) => cb.addEventListener("change", () => { setKeepOn(cb.checked); $$(".an-keep-title", root).forEach((x) => { x.disabled = !cb.checked; }); }));
    $$(".an-keep-title", root).forEach((x) => x.addEventListener("input", () => { keepName = x.value.trim(); }));
    $$(".an-keep-pv", root).forEach((cb) => cb.addEventListener("change", () => setPrivOn(cb.checked)));
  };
  /** What the playback draws of this analysis: what « Mes cartes » and the analysis kept take (trace/mymapsave.js). */
  function mmState() {
    return { file: files.map?.file || null, image: map, track, pxs, pys, offset, total, geo: fit ? geoFromFit(fit, track) : null, title: keepTitle(),
      controls: targets.filter((g) => g.pos).map((g) => ({ k: g.kind, x: g.pos[0], y: g.pos[1], t: timeOf(g) })) };
  }
  function keepTitle() {
    if (openedKept) return openedKept.title || "";
    if (orgaMode) return [orga.A.title, orga.A.courses.length > 1 ? orga.A.courses.find((c) => c.n === orgaN)?.name : ""].filter(Boolean).join(" · ");
    // the map file's own name (a KMZ's image named after the KMZ: « carte.kmz › files/carte.png » → « carte »)
    if (perso) return (files.map?.name || "").split("›")[0].replace(/\.[a-z0-9]+\s*$/i, "").replace(/[_-]+/g, " ").trim();
    return [races.find((x) => x.key === key)?.name || race?.name, klass()?.name, withTimes ? runner()?.name : ""].filter(Boolean).join(" · ");
  }
  const keptKey = () => `ocn.an.kept.${traceSig()}`;
  function keptOf() { try { const k = JSON.parse(localStorage.getItem(keptKey()) || "null"); return k?.id ? k : null; } catch (e) { return null; } }
  function forgetKept() { try { localStorage.removeItem(keptKey()); } catch (e) { /* nothing kept */ } }
  /** The calibration's own mark: another one (the controls moved, the clock shifted) is another analysis to keep. */
  const calMark = () => JSON.stringify([fit && [fit.m11, fit.m12, fit.m21, fit.m22, fit.tx, fit.ty].map((v) => Math.round(v * 1e4) / 1e4), Math.round((offset || 0) * 10), Math.round(total || 0),
    targets.filter((g) => g.pos).map((g) => g.pos.map(Math.round))]);
  /** The top line: kept (or being kept), else a button that keeps it. */
  function keptNote(state) {
    const el = $("#an-kept");
    if (!el) return;
    if (!state && keepable() && map && pxs) {
      el.innerHTML = html`<button type="button" class="btn btn-sm" id="an-keep-now" title="${t("an.keep.hint")}">${t("an.keep")}</button>`;
      $("#an-keep-now").addEventListener("click", () => keepAnalysis(true));
      el.title = "";
      return;
    }
    el.textContent = state ? t(`an.kept.${state}`) : "";
    el.title = state === "done" ? t("an.kept.tip") : "";
  }
  let keeping = null;
  async function keepAnalysis(asked = false) {
    if (openedKept) { keptNote("done"); return; }
    if (!keepable() || !map || !pxs) { keptNote(""); return; }
    const SK = await import("../trace/solokeep.js");
    const mark = calMark();
    let was = keptOf();
    // kept already, unless deleted meanwhile (« Analyse de carte », or another device)
    if (was && !(await SK.list().catch(() => null))?.some((a) => a.id === was.id)) { forgetKept(); was = null; }
    if (was?.cal === mark && keepName == null) { keptNote("done"); return; }
    if (!asked && !keepOn()) { keptNote(""); return; }
    if (keeping) return;
    keptNote("saving");
    try {
      // the name typed; else, saved again, the name it has (the server keeps it, a rename since included); else the race's
      const title = keepName || (was ? "" : keepTitle());
      keeping = SK.save(mmState(), { id: was?.id || null, title, source: orgaMode ? "orga" : track.source === "drawn" ? "drawn" : "solo",
        orga: orgaMode ? { id: orga.id, n: orgaN } : null, priv: !orgaMode && privOn() });
      const res = await keeping;
      try { localStorage.setItem(keptKey(), JSON.stringify({ id: res.id, cal: mark, title: title || was?.title || "" })); } catch (e) { /* this visit */ }
      keepName = null;
      keptNote("done");
    } catch (e) { console.warn(e); keptNote("err"); }
    finally { keeping = null; }
  }
  /** The pace under the map, shown or folded (the bar with the figures stays). */
  function setStrip(on) {
    showStrip = on; savePrefs();
    $("#an-ps").hidden = !on;
    const b = $("#an-ps-tog"); if (b) { b.setAttribute("aria-expanded", String(on)); b.textContent = `${stripArrow(on)} ${graphName(graphBy())}`; }
    fitHeight(); paceStrip();
  }
  // the race's pace over its own time, smoothed over a few seconds to half a minute, the controls marked (made once per width)
  let psCache = null;
  function paceStrip() {
    const cv = $("#an-ps");
    if (!cv || cv.hidden || !cv.clientWidth || !track || !(total > 0)) return;
    const by = graphBy(), K = stripSamples(cv), sig = `${K}|${offset}|${total}|${track.n}|${by}`;
    if (psCache?.sig !== sig) {
      // the pace from the distance run, any other measure its mean over the window (cadence and power when moving only)
      const half = Math.max(3, Math.min(15, total / 80)), vals = new Array(K).fill(null), arr = by === "speed" ? null : seriesOf(track, by);
      const moving = by === "cad" || by === "pw";
      for (let k = 0; k < K; k++) {
        const s = offset + (k / (K - 1)) * total, a = Math.max(offset, s - half), b = Math.min(offset + total, s + half);
        if (b - a < 2) continue;
        if (!arr) { vals[k] = (cumAt(track, b) - cumAt(track, a)) / (b - a); continue; }
        let sum = 0, n = 0;
        for (let i = indexAt(track, a), i1 = indexAt(track, b); i <= i1; i++) { const v = arr[i]; if (Number.isFinite(v) && (!moving || (v > 0 && track.v[i] > 0.5))) { sum += v; n++; } }
        vals[k] = n ? sum / n : null;
      }
      psCache = { sig, vals };
    }
    const step = [30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => total / s <= Math.max(2, cv.clientWidth / 90)) || 3600;
    const ticks = [];
    for (let x = 0; x <= total; x += step) ticks.push({ f: x / total, label: clock(x) });
    const marks = sequenceKnown() ? legs.slice(0, -1).filter((l) => l.t1 != null).map((l) => ({ f: l.t1 / total, label: l.label || String(l.n) })) : [];
    drawPaceStrip(cv, { series: [{ colour: colourBy() ? "#1c5fd6" : traceColour, vals: psCache.vals, bold: true }], cursor: tNow / total, ticks, marks, by, unit: isPaceGraph(by) ? "" : unitOf(by) });
  }
  /** The map's turn: the leg being run up (its controls from one to the other), else north up; kept between legs it cannot read. */
  let lastTurn = 0;
  /** Leg j's turn (its first control to its second up), or null when they are not both placed. */
  function turnOf(j) {
    const a = targets[j]?.pos, b = targets[j + 1]?.pos;
    return a && b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1 ? -Math.PI / 2 - Math.atan2(b[1] - a[1], b[0] - a[0]) : null;
  }
  /** A map photographed sideways or upside down, shown upright (owner, 2026-11-17): the quarter turns that bring the north
   *  the calibration found nearest the top; none for a map within 45° of north up, nor before the trace is laid. */
  function upTurn() {
    const f = fit || auto?.fit || geoFit;
    if (!f || drawing) return 0;
    const q = Math.round((-Math.PI / 2 - Math.atan2(-f.m22, -f.m12)) / (Math.PI / 2));
    return (((q % 4) + 6) % 4 - 2) * (Math.PI / 2) || 0;
  }
  /** The view that puts the map's point (cx, cy) at the middle of the map's area (below the bar) at zoom k, the map turned by r. */
  function viewAt(cx, cy, k, r) {
    const { w, h } = box(), d = topReserved() / 2;
    return { k, ox: w / 2 + d * Math.sin(r) - cx * k, oy: h / 2 + d * Math.cos(r) - cy * k };
  }
  function mapTurn() {
    if (orient !== "leg" || !calibrated || drawing) return upTurn();
    lastTurn = turnOf(Math.max(0, legAt(tNow))) ?? lastTurn;
    return lastTurn;
  }
  const legAt = (s) => { let j = -1; for (let i = 0; i < legs.length; i++) if (legs[i].t0 != null && s >= legs[i].t0) j = i; return j; };
  /** The reader moved the race's time: the runner followed from now on. */
  function moved() { still = false; opening = false; }
  /** The race's time span shown: the leg opened, else the whole race. */
  function span() {
    const l = legs[legSel];
    if (!l || l.t0 == null) return [0, total];
    return [l.t0, Math.max(l.t0 + 1, l.t1 ?? legs[legSel + 1]?.t0 ?? total)];
  }
  function sliderSpan() {
    const s = $("#an-time"); if (!s) return;
    const [a, b] = span(); s.min = String(Math.floor(a)); s.max = String(Math.ceil(b)); s.value = String(tNow);
  }
  /** A leg opened (j) or the whole course again (-1): the map framed on it, the time at its start, the time line on it alone. */
  // the whole course as it was left when a leg was opened — its view, time and whether it was still —, found again on the way back
  // (owner, 2026-11-08: « when back to the whole parcours, settings go back »)
  let wholeWas = null;
  function setLegView(j) {
    const l = legs[j];
    if (j >= 0 && (!l || l.t0 == null)) return;
    if (j >= 0 && legSel < 0) wholeWas = { view: { ...view }, t: tNow, still };
    const back = j < 0 && legSel >= 0 ? wholeWas : null;
    stop(); moved();
    legSel = j;
    if (l) { zoomTo(l); tNow = l.t0; }
    else if (back) { wholeWas = null; view = back.view; tNow = back.t; still = back.still; }
    else if (fit) { fitTrace(); still = true; }
    sliderSpan(); legsTable(); seek(tNow);
  }
  // ← → from leg to leg while one is open
  const offArrows = legArrows((dir) => { if (legSel < 0) return false; jumpLeg(dir); });
  function jumpLeg(dir) {
    moved();
    if (legSel >= 0) {                                     // a leg opened: the next or previous one
      let k = legSel + dir;
      while (legs[k] && legs[k].t0 == null) k += dir;
      if (legs[k]) setLegView(k);
      return;
    }
    const j = legAt(tNow);
    // the whole course shown: ⏮ opens the leg run now, ⏭ the next one (owner, 2026-11-08: as the map analysis's, the leg menu
    // then saying it)
    if (legItems().length) {
      let k = dir < 0 ? Math.max(0, j) : j + 1;
      while (legs[k] && legs[k].t0 == null) k += dir < 0 ? -1 : 1;
      if (legs[k]) setLegView(k);
      return;
    }
    const target = dir < 0 ? (j >= 0 && tNow - legs[j].t0 > 2 ? legs[j].t0 : legs[Math.max(0, j - 1)]?.t0 ?? 0) : legs[j + 1]?.t0 ?? total;
    seek(target ?? 0);
  }
  function seek(s) {
    const [a, b] = span();
    tNow = Math.max(a, Math.min(b, s));
    hud();
    draw();
    drawStrip();
  }
  // the clock runs on a timer, not on requestAnimationFrame: browsers pause the latter for a hidden or background
  // pane, which left the runner frozen (owner, 2026-10-14); a throttled timer still advances by the time elapsed
  function play() {
    moved();
    const [a, b] = span();
    if (tNow >= b - 0.01 || tNow < a) tNow = a;
    playing = true; last = performance.now();
    $("#an-play").textContent = "⏸";
    if (raf) clearInterval(raf);
    raf = setInterval(() => {
      if (!playing) return;
      if (!main.isConnected) { stop(); return; }
      const now = performance.now();
      tNow = Math.min(b, tNow + ((now - last) / 1000) * speed);
      last = now;
      hud(); draw(); drawStrip();
      if (tNow >= b) stop();
    }, 40);
  }
  function stop() {
    playing = false;
    if (raf) clearInterval(raf);
    raf = 0;
    const b = $("#an-play"); if (b) b.textContent = "▶";
    video?.sync(true);
  }
  function hud() {
    if (!calibrated) return;
    const s = offset + tNow, j = legAt(tNow), leg = legs[j];
    const slider = $("#an-time"); if (slider && !scrubbing) slider.value = String(tNow);
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set("#an-t", clock(tNow)); set("#an-t-sub", total ? `${t("an.of")} ${clock(total)}` : "");
    set("#an-leg", leg ? `${leg.n}${leg.code ? ` (${leg.code})` : ""}` : "—");
    // the leg the runner is on, at the map's bottom left (owner, 2026-11-07)
    const chip = $("#an-legchip"), cj = legSel >= 0 ? legSel : j, cl = legs[cj];
    if (chip) { $("#an-legchip-t").textContent = cl?.label ? `${cj ? legs[cj - 1].label : t("an.start")} → ${cl.label}` : ""; chip.hidden = !cl?.label; $("#an-leg-all").hidden = legSel < 0; }
    set("#an-leg-sub", leg ? `${leg.time != null ? `${leg.estimated ? "~" : ""}${clock(leg.time)}` : ""}${leg.dist != null ? ` · ${fmt(leg.dist)} m` : ""}${leg.rank ? ` · ${t("an.rankShort")} ${leg.rank}` : ""}`.replace(/^ · /, "") : "");
    const win = Math.min(30, tNow);
    set("#an-pace", win >= 5 ? pace((cumAt(track, s) - cumAt(track, s - win)) / win) : "—");
    const d = cumAt(track, s) - cumAt(track, offset);
    set("#an-dist", `${fmt(d >= 1000 ? d / 1000 : d, d >= 1000 ? 2 : 0)} ${d >= 1000 ? "km" : "m"}`);
    const len = klass()?.length_m;
    set("#an-dist-sub", len ? `${t("an.course.len")} ${fmt(len / 1000, 1)} km` : "");
    for (const c of Object.keys(track.ch)) { const v = valueAt(track, c, s); set(`#an-ch-${c}`, v == null || Number.isNaN(v) ? "—" : fmt(v, c === "temp" ? 1 : 0)); }
    // the climb since the start, from the watch's altitude (owner, 2026-11-08), at the bar's end
    if (track.ch.ele) { const cu = (track.climb ||= cumClimb(track, track.ch.ele)); set("#an-climb", fmt(Math.max(0, cu[indexAt(track, s)] - cu[indexAt(track, offset)]))); }
    paceStrip(); video?.sync();
    if (rcs.on) rcCurrent();
  }
  /** The legs a leg's view opens: those timed, when the course's sequence is known ([index, « 2 → 3 »]). */
  const legItems = () => (sequenceKnown() ? legs.map((l, i) => [i, l]).filter(([, l]) => l.t0 != null && l.label).map(([i, l]) => [i, `${i ? legs[i - 1].label : t("an.start")} → ${l.label}`]) : []);
  /** The leg menu at the bar's left (owner, 2026-11-08), drawn again whenever the leg shown changes. */
  function legPick() {
    const slot = $("#an-legpick-slot"); if (!slot) return;
    const items = legItems();
    slot.innerHTML = items.length ? legPickHtml("an-legpick", items, legSel) : "";
    if (items.length) bindLegPick($("#an-legpick"), (v) => setLegView(v));
  }
  function legsTable() {
    legPick();
    const k = klass(), r = runner(), est = !officialTaus();
    const hasHr = !!track.ch.hr, hasCad = !!track.ch.cad;
    const sum = legs.reduce((a, l) => ({ dist: a.dist + (l.dist || 0), straight: a.straight + (l.straight || 0), lost: a.lost + (l.mistake ? l.lost : 0), n: a.n + (l.mistake ? 1 : 0) }), { dist: 0, straight: 0, lost: 0, n: 0 });
    $("#an-legs").innerHTML = html`<div class="table-wrap" title="${t(est ? "an.legs.hint.est" : "an.legs.hint")}"><table class="data compact"><thead><tr><th>${t("an.col.leg")}</th><th class="r">${t("an.col.time")}${est ? html`<div class="th-sub">${t("an.col.est")}</div>` : ""}</th>${est ? "" : html`<th class="r">${t("an.col.best")}</th>
        <th class="r">${t("an.col.rank")}</th><th class="r">${t("an.col.lost")}</th>`}<th class="r">${t("an.col.trace")}</th><th class="r">${t("an.col.straight")}</th><th class="r">${t("an.col.detour")}</th><th class="r">${t("an.col.pace")}</th>
        ${hasHr ? html`<th class="r">${t("an.col.hr")}</th>` : ""}${hasCad ? html`<th class="r" title="${unitOf("cad")}">${t("an.col.cad")} <span class="muted">${unitOf("cad")}</span></th>` : ""}</tr></thead>
      <tbody><tr data-leg="-1" class="an-legs-all${legSel < 0 ? " cur" : ""}" style="cursor:pointer"><td colspan="${(est ? 6 : 9) + (hasHr ? 1 : 0) + (hasCad ? 1 : 0)}">${t("sh.leg.all")}</td></tr>
      ${legs.map((l, i) => html`<tr data-leg="${i}" class="${l.mistake ? "an-mistake" : ""}${i === legSel ? " cur" : ""}" style="cursor:pointer">
        <td>${l.label}${l.code ? html` <span class="muted">${l.code}</span>` : ""}</td>
        <td class="r num">${l.time != null ? clock(l.time) : "—"}</td>${est ? "" : html`<td class="r num">${l.best != null ? clock(l.best) : "—"}</td>
        <td class="r num">${l.rank ?? "—"}</td><td class="r num${l.mistake ? " an-lost" : ""}">${l.lost != null ? signed(Math.round(l.lost)) : "—"}</td>`}
        <td class="r num">${l.dist != null ? `${fmt(l.dist)} m` : "—"}</td><td class="r num">${l.straight != null ? `${fmt(l.straight)} m` : "—"}</td>
        <td class="r num">${l.dist != null && l.straight ? detour(l.dist, l.straight) : "—"}</td>
        <td class="r num">${l.v != null ? pace(l.v) : "—"}</td>
        ${hasHr ? html`<td class="r num">${l.hr != null ? fmt(l.hr) : "—"}</td>` : ""}${hasCad ? html`<td class="r num">${l.cad != null ? fmt(l.cad) : "—"}</td>` : ""}</tr>`)}
      <tr class="an-total"><td>${t("an.total")}</td><td class="r num">${r.status === "ok" && r.time_s != null ? clock(r.time_s) : total ? `~${clock(total)}` : "—"}</td>${est ? "" : html`<td></td><td class="r num">${r.place ?? "—"}</td>
        <td class="r num">${sum.n ? `${signed(Math.round(sum.lost))} (${sum.n})` : "—"}</td>`}<td class="r num">${fmt(sum.dist)} m</td>
        <td class="r num">${sum.straight ? `${fmt(sum.straight)} m` : "—"}${k.length_m ? html`<div class="muted" style="font-size:11.5px">${t("an.course.len")} ${fmt(k.length_m)} m</div>` : ""}</td>
        <td class="r num">${sum.straight ? detour(sum.dist, sum.straight) : "—"}</td>
        <td class="r num">${total && sum.dist ? pace(sum.dist / total) : "—"}</td>
        ${hasHr ? html`<td class="r num">${fmt(meanBetween(track, "hr", offset, offset + total))}</td>` : ""}${hasCad ? html`<td class="r num">${fmt(meanBetween(track, "cad", offset, offset + total))}</td>` : ""}</tr></tbody></table></div>`;
    $$("#an-legs tr[data-leg]").forEach((tr) => tr.addEventListener("click", () => setLegView(Number(tr.dataset.leg))));
  }
  /** The view on one leg: its trace, with a margin. */
  /** The control circles' radius on the map (px): the organiser's, else the median of those read, else a share of the map. */
  function circleR() {
    const rs = (course?.controls || []).map((q) => q.r).sort((p, q) => p - q);
    return orgaMode ? files.orga?.r || 20 : rs.length ? rs[rs.length >> 1] : Math.max(12, Math.min(map.width, map.height) / 120);
  }
  function zoomTo(l, margin = 1.3, pad = 40) {
    const j = legs.indexOf(l), end = l.t1 ?? legs[j + 1]?.t0 ?? total;
    if (!fit || l.t0 == null || end == null) return;
    const a = indexAt(track, offset + l.t0), b = indexAt(track, offset + end);
    // the map turned to this leg: its extent measured as it will be on the screen, its centre turned back
    const r = orient === "leg" ? turnOf(legs.indexOf(l)) ?? lastTurn : upTurn(), rc = Math.cos(r), rs = Math.sin(r);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { const u = rc * x - rs * y, v = rs * x + rc * y; x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); };
    for (let i = a; i <= b; i++) add(pxs[i], pys[i]);
    // the leg's two controls whole, their circles included (owner, 2026-11-08: « the full leg in view »)
    const R = circleR() * 1.3;
    for (const g of [targets[j], targets[j + 1]]) if (g?.pos) { add(g.pos[0] - R, g.pos[1] - R); add(g.pos[0] + R, g.pos[1] + R); add(g.pos[0] - R, g.pos[1] + R); add(g.pos[0] + R, g.pos[1] - R); }
    const { w, h } = box();
    // a map without a size yet (being laid out) would give a zoom of 0, which no zooming could undo: done once it has one
    if (!w || !h || !(x1 >= x0)) { pendingFit = () => zoomTo(l, margin, pad); return; }
    pendingFit = null;
    const top = topReserved(), hh = Math.max(60, h - top);
    const k = Math.min(w / Math.max(60, (x1 - x0) * margin + pad), hh / Math.max(60, (y1 - y0) * margin + pad), 5);
    const uc = (x0 + x1) / 2, vc = (y0 + y1) / 2, cx = rc * uc + rs * vc, cy = -rs * uc + rc * vc;
    view = { k, ox: w / 2 - cx * k, oy: top + hh / 2 - cy * k };
    lastBox = { w, h };
    still = true; opening = false;
  }

  // ---- the map canvas: pan, zoom, click
  const box = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });
  let pendingFit = null;                                // the view to set once the map has a size
  /** The map's top band the control bar (laid over the map on a computer, owner 2026-11-07) or the race's line covers during the
   *  playback: the views fitted and the runner followed keep below it. */
  let barInset = 0;                                      // that bar's height (floatBar, below), 0 on a phone
  const topReserved = () => { const b = $("#an-brief"); return barInset + (b && !b.hidden && b.closest(".an-map") ? b.offsetHeight + 8 : 0); };
  function size() {
    const dpr = window.devicePixelRatio || 1, { w, h } = box();
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  function fitView() {
    const { w, h } = box();
    const top = topReserved(), hh = Math.max(60, h - top);
    // the map as it is shown: a sideways photo turned upright takes its height across
    const r = upTurn(), c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r)), mw = c * map.width + s * map.height, mh = s * map.width + c * map.height;
    const k = w && h ? Math.min(w / mw, hh / mh) : 1;                      // a hidden box has no size
    view = viewAt(map.width / 2, map.height / 2, k, r);
    shownUp = r;
    lastBox = { w, h };
  }
  function zoomBy(f, cx, cy) {
    opening = false;
    const { w, h } = box();
    if (!(view.k > 0) || !Number.isFinite(view.k)) { if (calibrated) fitTrace(); else fitView(); if (!(view.k > 0)) return; }
    if (cx == null) { cx = w / 2; cy = h / 2; }
    const k = Math.max(0.02, Math.min(12, view.k * f));
    view = { k, ox: cx - ((cx - view.ox) / view.k) * k, oy: cy - ((cy - view.oy) / view.k) * k };
    draw();
  }
  /** A point of the canvas as it would be with the map north up. */
  const unrot = (sx, sy) => { if (!rot) return [sx, sy]; const { w, h } = box(), c = Math.cos(rot), s = Math.sin(rot), x = sx - w / 2, y = sy - h / 2; return [c * x + s * y + w / 2, -s * x + c * y + h / 2]; };
  const toImg = (sx0, sy0) => { const [sx, sy] = unrot(sx0, sy0); return [(sx - view.ox) / view.k, (sy - view.oy) / view.k]; };
  let drag = null, pinch = null;
  const pointers = new Map();
  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, unrot(e.offsetX, e.offsetY));
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { const [x, y] = unrot(e.offsetX, e.offsetY); drag = { x, y, ox: view.ox, oy: view.oy, moved: false }; }
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: view.k }; drag = null; }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, unrot(e.offsetX, e.offsetY));
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const k = Math.max(0.02, Math.min(12, (pinch.k * d) / pinch.d));
      view = { k, ox: cx - ((cx - view.ox) / view.k) * k, oy: cy - ((cy - view.oy) / view.k) * k };
      draw();
    } else if (drag) {
      const [ux, uy] = unrot(e.offsetX, e.offsetY), dx = ux - drag.x, dy = uy - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { opening = false; view = { ...view, ox: drag.ox + dx, oy: drag.oy + dy }; if (follow) setFollow(false); draw(); }
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && measure.on) measure.click(...toImg(e.offsetX, e.offsetY));
    else if (drag && !drag.moved && drawing) { if (drawing.step === "draw") drawClick(...toImg(e.offsetX, e.offsetY), e.shiftKey || e.altKey); }
    else if (drag && !drag.moved && !calibrated) placeClick(...toImg(e.offsetX, e.offsetY));
    if (!pointers.size) drag = null;
  };
  canvas.addEventListener("pointerup", up);
  // « Mesurer »: a line clicked on the map, its length in metres by the calibration (trace/measure.js)
  const measure = measureTool($("#an-measure"), { redraw: () => draw(), out: $("#an-measure-out"),
    metres: (a, b) => { if (!fit) return null; const p = toM(fit, a[0], a[1]), q = toM(fit, b[0], b[1]); return Math.hypot(p[0] - q[0], p[1] - q[1]); } });
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015), ...unrot(e.offsetX, e.offsetY)); }, { passive: false });
  canvas.addEventListener("dblclick", (e) => zoomBy(1.6, ...unrot(e.offsetX, e.offsetY)));
  $("#an-zin").addEventListener("click", () => (v3 ? v3.zoom(1.4) : zoomBy(1.4)));
  $("#an-zout").addEventListener("click", () => (v3 ? v3.zoom(1 / 1.4) : zoomBy(1 / 1.4)));
  $("#an-fit").addEventListener("click", () => { if (!map) return; opening = false; if (v3) { setFollow(false); v3.setFollow(false); v3.fitTrace(); return; } if (calibrated) { fitTrace(); setFollow(false); } else fitView(); draw(); });
  $("#an-map").addEventListener("click", () => { opening = false; if (v3) { setFollow(false); v3.setFollow(false); v3.fitMap(); return; } if (map) { fitView(); draw(); } });
  $("#an-3d").addEventListener("click", () => toggle3d());
  // the exaggeration on the 3D view itself, in step with « Affichage »'s slider
  exCtl = bindEx($("#an-ex3d"), { get: () => v3ex, set: (k) => {
    v3ex = k; v3?.setExaggeration(k); savePrefs();
    const r = $("#an-ex"); if (r) { r.value = String(k); $("#an-ex-v").textContent = `× ${fmt(k, 2)}`; }
  } });
  // a headcam video in step with the race (pages/sharedvideo.js, as « Analyse de carte »'s; owner, 2026-11-05): a file of this
  // device, never sent; its offset kept on this device per trace
  const SOLO = { uid: 0, get name() { return (withTimes && runner()?.name) || t("an.perso.title"); } };
  video = videoPanel($(".an-map"), { runners: [SOLO], get key() { return `ocn.an.video.${traceSig() || "none"}`; }, playing: () => playing, speed: () => speed,
    pick: () => SOLO, raceTime: () => (calibrated ? tNow : null) });
  $("#an-video-btn").addEventListener("click", () => $("#an-video-file").click());
  $("#an-video-file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { video.open(f); video.sync(true); } e.target.value = ""; });
  const ro = new ResizeObserver(() => {
    if (!map) return;
    const b = box();
    if (pendingFit && b.w && b.h) pendingFit();
    else if (opening && calibrated && b.w && b.h) fitView();     // the whole map while the panels settle
    if (lastBox && b.w && b.h && (b.w !== lastBox.w || b.h !== lastBox.h)) {
      view = { ...view, ox: view.ox + (b.w - lastBox.w) / 2, oy: view.oy + (b.h - lastBox.h) / 2 };
      lastBox = b;
    }
    size(); sizeStrip(); draw(); drawStrip();
  });
  ro.observe(canvas); ro.observe(strip);
  // the control bar over the map's top edge on a computer: the whole map fitted again under it while the panels settle
  // the leg chip's way back to the whole course (the map's markup may be laid out again: one listener on the page)
  main.addEventListener("click", (e) => { if (e.target.closest?.("#an-leg-all")) setLegView(-1); });
  const handleClear = clearHandle(() => $("#an-layout"), () => $(".an-map .an-tools"));     // on a phone, the right drawer's handle under the map's tools
  const barFloat = floatBar($("#an-bar").parentElement, $("#an-bar"), (h) => { barInset = h; if (map && opening && calibrated) { fitView(); draw(); } });
  let redrawChips = null;
  const themeWatch = new MutationObserver(() => { redrawChips?.(); drawStrip(); v3?.theme(); });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // the pace colours (trace/pacecolour.js): from the fastest (blue) through green to the slowest (red), on the trace's own 10-90 % range
  /** What the trace is coloured by now: null (plain), "speed", or a measure the file has (else the pace). */
  const colourBy = () => (!track || colour === "plain" ? null : colourModes(track).includes(colour) ? colour : "speed");
  /** The measure the graph under the map draws: the one chosen when the file has it, else the pace. */
  const graphBy = () => (track && colourModes(track).includes(graph) ? graph : "speed");
  /** The race's points, for the colours' range: from the start to the finish when the race is known. */
  const raceSpan = () => (offset == null ? [0, track.n - 1] : [Math.max(0, indexAt(track, offset)), indexAt(track, offset + total)]);
  function paceScale() { vSet = true; [vLo, vHi] = rangeOf(track, colourBy() || "speed", ...raceSpan()); }
  /** The legend of the trace coloured by pace (owner, 2026-10-15: the colours said nothing without it): the colours
   *  from the fastest to the slowest, each with the pace it starts at, in the map's bottom right corner. */
  function paceLegend() {
    const el = $("#an-legend");
    if (!el) return;
    el.hidden = !(calibrated && colourBy());
    if (el.hidden) return;
    if (!vSet) paceScale();
    el.innerHTML = legendHtml(colourBy(), vLo, vHi, { cad: unitOf("cad") });
  }
  /** The colour of point i, coloured by the measure chosen. */
  const pointColour = (i, series = seriesOf(track, colourBy())) => colourOf(colourBy(), series[i], vLo, vHi);

  // ---- « Exporter une image » (owner, 2026-11-01, after QuickRoute): the map with the race's trace as the display draws it —
  // plain or coloured by its measure, its width and opacities —, at the map's own resolution (40 Mpx at most), the race's part
  // of the map or all of it, with a title (the race, the runner, the day, the time, the distance) and the colours' legend.
  // Made in the browser and saved on the device: nothing is sent.
  function exportImage() {
    if (!map || !fit || offset == null || !pxs) return;
    const W = map.width, H = map.height;
    const i0 = Math.max(0, indexAt(track, offset)), i1 = indexAt(track, offset + total);
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (shot.zone === "race") {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      const add = (x, y) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); };
      for (let i = i0; i <= i1; i++) add(pxs[i], pys[i]);
      for (const g of targets) if (g.pos) add(g.pos[0], g.pos[1]);
      const m = Math.max(40, 0.06 * Math.max(c - a, d - b));
      const box = [Math.max(0, Math.floor(a - m)), Math.max(0, Math.floor(b - m)), Math.min(W, Math.ceil(c + m)), Math.min(H, Math.ceil(d + m))];
      if (box[2] - box[0] > 20 && box[3] - box[1] > 20) [x0, y0, x1, y1] = box;          // else (the trace off the map) the whole map
    } else if (shot.zone === "view") {                  // the part of the map in view (north up)
      const { w, h } = box(), cs = [[0, 0], [w, 0], [w, h], [0, h]].map(([a, b]) => toImg(a, b));
      const bx = [Math.max(0, Math.floor(Math.min(...cs.map((p) => p[0])))), Math.max(0, Math.floor(Math.min(...cs.map((p) => p[1])))),
        Math.min(W, Math.ceil(Math.max(...cs.map((p) => p[0])))), Math.min(H, Math.ceil(Math.max(...cs.map((p) => p[1]))))];
      if (bx[2] - bx[0] > 20 && bx[3] - bx[1] > 20) [x0, y0, x1, y1] = bx;
    }
    const k = Math.min(1, Math.sqrt(40e6 / ((x1 - x0) * (y1 - y0))));
    const cw = Math.round((x1 - x0) * k), ch = Math.round((y1 - y0) * k);
    const cv = document.createElement("canvas");
    cv.width = cw; cv.height = ch;
    const g = cv.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, cw, ch);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.globalAlpha = mapAlpha / 100; g.drawImage(map, 0, 0); g.globalAlpha = traceAlpha / 100;
    // the line in the map's millimetres: one from the control circles read (6 mm across), else the sheet's long side as an A4's
    const rs = (course?.controls || []).map((q) => q.r).sort((p, q) => p - q);
    const mm = rs.length ? rs[rs.length >> 1] / 3 : Math.max(W, H) / 297;
    g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = Math.max(1.5 / k, 0.4 * mm * width);
    const by = colourBy();
    if (by) {
      if (!vSet) paceScale();
      const s = seriesOf(track, by);
      for (let i = i0 + 1; i <= i1; i++) { g.strokeStyle = colourOf(by, s[i], vLo, vHi); g.beginPath(); g.moveTo(pxs[i - 1], pys[i - 1]); g.lineTo(pxs[i], pys[i]); g.stroke(); }
    } else {
      g.strokeStyle = traceColour; g.beginPath(); g.moveTo(pxs[i0], pys[i0]);
      for (let i = i0 + 1; i <= i1; i++) g.lineTo(pxs[i], pys[i]);
      g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    const rc = races.find((x) => x.key === key), day = parisDay(track.ms0 + offset * 1000);
    const title = orgaMode ? orga.A.title : perso ? t("an.perso.title") : rc?.name || race?.name || "";
    if (shot.legend) {
      const fs = Math.max(12, Math.min(40, Math.round(Math.min(cw, ch) / 42))), pad = Math.round(fs * 0.6);
      const panel = (x, y, w, h) => { g.fillStyle = "rgba(255, 255, 255, 0.9)"; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, pad); else g.rect(x, y, w, h); g.fill(); };
      const font = (px, bold) => { g.font = `${bold ? "650 " : ""}${px}px system-ui, sans-serif`; };
      // the title, top left
      const dist = cumAt(track, offset + total) - cumAt(track, offset);
      const lines = [[title, true], [[withTimes ? runner()?.name : "", fmtDate(day)].filter(Boolean).join(" · "), false],
        [[clock(total), `${fmt(dist / 1000, 2)} km`, `${pace(dist / total)} ${t("an.unit.pace")}`, klass()?.name].filter(Boolean).join(" · "), false]].filter(([s]) => s);
      g.textBaseline = "top";
      let tw = 0;
      for (const [s, b] of lines) { font(fs, b); tw = Math.max(tw, g.measureText(s).width); }
      font(Math.round(fs * 0.7)); tw = Math.max(tw, g.measureText("ozimut.com").width);
      const lh = Math.round(fs * 1.3), th = lines.length * lh + Math.round(fs * 0.9);
      panel(pad, pad, Math.min(cw - 2 * pad, tw + 2 * pad), th + pad);
      g.fillStyle = "#1d1d1d";
      lines.forEach(([s, b], n) => { font(fs, b); g.fillText(s, 2 * pad, 1.5 * pad + n * lh, cw - 4 * pad); });
      font(Math.round(fs * 0.7)); g.fillStyle = "#e8641c"; g.fillText("ozimut.com", 2 * pad, 1.5 * pad + lines.length * lh);
      // the colours' legend, bottom right
      if (by) {
        const L = legendOf(by, vLo, vHi, { cad: unitOf("cad") }), bw = fs * 12, bh = Math.round(fs * 0.7), sf = Math.round(fs * 0.75);
        font(fs, true); const lw2 = Math.max(bw, g.measureText(L.title).width);
        const w = lw2 + 2 * pad, h = fs + bh + 2 * sf + 3 * pad, x = cw - w - pad, y = ch - h - pad;
        panel(x, y, w, h);
        g.fillStyle = "#1d1d1d"; g.fillText(L.title, x + pad, y + pad);
        const by0 = y + pad + fs * 1.15;
        PACE_COLOURS.forEach((c, n) => { g.fillStyle = c; g.fillRect(x + pad + (n * bw) / PACE_COLOURS.length, by0, bw / PACE_COLOURS.length + 0.5, bh); });
        font(sf); g.fillStyle = "#1d1d1d";
        const ty = by0 + bh + pad * 0.4;
        g.textAlign = "left"; g.fillText(L.ticks[0], x + pad, ty); g.textAlign = "center"; g.fillText(L.ticks[1], x + pad + bw / 2, ty); g.textAlign = "right"; g.fillText(L.ticks[2], x + pad + bw, ty);
        g.fillStyle = "#666666"; g.textAlign = "left"; g.fillText(L.ends[0], x + pad, ty + sf * 1.15); g.textAlign = "right"; g.fillText(L.ends[1], x + pad + bw, ty + sf * 1.15);
        g.textAlign = "left";
      }
    }
    const slug = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const type = shot.type === "jpeg" ? "jpeg" : "png", name = `ozimut-${day}${slug(title) ? `-${slug(title)}` : ""}${withTimes && runner()?.name ? `-${slug(runner().name)}` : ""}.${type === "jpeg" ? "jpg" : "png"}`;
    const state = $("#an-shot-state");
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

  function draw() {
    if (!map) return;
    if (v3on) { sync3d(); return; }                    // the 3D view draws itself, on the same clock
    const dpr = window.devicePixelRatio || 1, { w, h } = box();
    if (calibrated && follow && fit && !still) {     // the runner kept at the centre, once played
      const [px, py] = toPx(fit, ...posAt(track, offset + tNow));
      const top = topReserved();
      view = { ...view, ox: w / 2 - px * view.k, oy: top + (h - top) / 2 - py * view.k };
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#e9e6dc"; ctx.fillRect(0, 0, w, h);
    // the photo found sideways once the trace is laid: the whole map shown again, upright
    const up = upTurn();
    if (up !== shownUp) { shownUp = up; if (!calibrated) fitView(); }
    rot = mapTurn();
    const na = $("#an-northarrow");
    if (na) { na.hidden = Math.abs(rot - up) < 1e-6; na.style.transform = `rotate(${rot - up}rad)`; }
    const rc = Math.cos(rot), rs = Math.sin(rot), RX = view.ox - w / 2, RY = view.oy - h / 2;
    ctx.setTransform(dpr * view.k * rc, dpr * view.k * rs, -dpr * view.k * rs, dpr * view.k * rc, dpr * (rc * RX - rs * RY + w / 2), dpr * (rs * RX + rc * RY + h / 2));
    ctx.imageSmoothingEnabled = view.k < 1;
    ctx.globalAlpha = calibrated ? mapAlpha / 100 : 1;
    ctx.drawImage(map, 0, 0);
    ctx.globalAlpha = 1;
    const ta = calibrated ? traceAlpha / 100 : 1;
    const lw = (px) => px / view.k;
    if (calibrated && rcs.on) {                       // the route choices computed (administrators, a prototype)
      if (rcs.pic) { ctx.globalAlpha = 0.6; ctx.imageSmoothingEnabled = false; ctx.drawImage(rcs.pic.canvas, 0, 0, rcs.pic.canvas.width * rcs.pic.cell, rcs.pic.canvas.height * rcs.pic.cell); ctx.globalAlpha = 1; }
      RC.drawDecision(ctx, rcDecision(Math.max(0, legAt(tNow))));
      RC.drawRoutes(ctx, rcs.routes[Math.max(0, legAt(tNow))], lw, rcPace(), clock);
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (fit && fullPath && offset != null && !drawing) {
      // a leg opened: its route drawn whole at once, the runner's dot moving along it, nothing else of the race (owner,
      // 2026-11-08: « the full trace shown right away »); the tail and the trace to come apply again on the whole course
      const legOn = calibrated && legSel >= 0, ls = legOn ? span() : null;
      const s = offset + (calibrated ? tNow : total), iNow = indexAt(track, s), i0 = Math.max(0, indexAt(track, offset + (legOn ? ls[0] : 0)));
      const iDraw = legOn ? indexAt(track, offset + ls[1]) : iNow;
      // the whole trace, faint; the part run so far, full; the tail, thicker
      const bySpeed = calibrated && !!colourBy(), series = bySpeed ? seriesOf(track, colourBy()) : null;
      if (!bySpeed && !legOn && (!calibrated || future === "faint")) { ctx.globalAlpha = (calibrated ? 0.45 : 0.85) * ta; ctx.strokeStyle = traceColour; ctx.lineWidth = lw(2.5 * width); ctx.stroke(fullPath); }
      ctx.globalAlpha = ta;
      if (calibrated) {
        const iTail = tail && !legOn ? Math.max(i0, indexAt(track, s - tail)) : i0;
        if (bySpeed) {                                   // the whole race coloured by pace (or a measure), the part to come faint
          if (!vSet) paceScale();
          const iEnd = legOn ? iDraw : future === "faint" ? indexAt(track, offset + total) : iNow;
          for (let i = i0 + 1; i <= iEnd; i++) {
            ctx.globalAlpha = (i <= iNow || legOn ? 1 : 0.45) * ta;
            ctx.strokeStyle = pointColour(i, series); ctx.lineWidth = lw((i > iTail && i <= iNow ? 5 : 3) * width);
            ctx.beginPath(); ctx.moveTo(pxs[i - 1], pys[i - 1]); ctx.lineTo(pxs[i], pys[i]); ctx.stroke();
          }
          ctx.globalAlpha = ta;
        } else {
          const part = (from, to, width) => { if (to <= from) return; ctx.lineWidth = lw(width); ctx.beginPath(); ctx.moveTo(pxs[from], pys[from]);
            for (let i = from + 1; i <= to; i++) ctx.lineTo(pxs[i], pys[i]); ctx.stroke(); };
          ctx.strokeStyle = traceColour;
          if (legOn) part(i0, iDraw, 3 * width);
          else { part(i0, Math.min(iNow, iTail), 3 * width); part(iTail, iNow, 5 * width); }
        }
        const [px, py] = toPx(fit, ...posAt(track, s));
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(px, py, lw(9), 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, lw(6.5), 0, Math.PI * 2); ctx.fillStyle = "#e8641c"; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // the course over the map, its controls as placed (the start's triangle, the circles numbered, the finish), as « Analyse de carte »
    if (calibrated && showCourse && sequenceKnown()) {
      const pts = targets.filter((g) => g.pos).map((g) => ({ x: g.pos[0], y: g.pos[1], kind: g.kind === "start" || g.kind === "finish" ? g.kind : "control" }));
      ctx.globalAlpha = 1; drawCourse(ctx, pts, circleR(), lw, 0.75);
    }
    measure.paint(ctx, lw);
    if (drawing) paintDrawing(lw);
    else if (marks || !calibrated) {
      // the circles read on the map, faint
      if (course && !calibrated) {
        ctx.strokeStyle = "rgba(166, 38, 164, 0.45)"; ctx.lineWidth = lw(1.5);
        for (const c of course.controls) { ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 1.15, 0, Math.PI * 2); ctx.stroke(); }
      }
      // the targets placed: a ring and the number
      ctx.font = `${lw(13)}px system-ui, sans-serif`; ctx.textBaseline = "middle";
      for (const g of targets) {
        const c = g.pos;
        if (!c) continue;
        const now = g.i === cur && mode === "manual" && !calibrated;
        ctx.beginPath(); ctx.arc(c[0], c[1], lw(now ? 11 : 9), 0, Math.PI * 2);
        ctx.strokeStyle = now ? "#e8641c" : g.missed ? "#999999" : "#a626a4"; ctx.lineWidth = lw(now ? 3 : 2); ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = lw(3); ctx.strokeText(g.label, c[0] + lw(13), c[1]);
        ctx.fillStyle = g.missed ? "#999999" : "#a626a4"; ctx.fillText(g.label, c[0] + lw(13), c[1]);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- the route choices computed (trace/routeplan.js; administrators only, a prototype — 2026-10-24) ---------------------
  // each leg's fastest routes on the map as read, the route the runner took measured on the same model
  const rcs = { s: RC.loadSettings(), mapSet: false, pic: null, picOn: false, plan: null, planFor: "", planMap: null, dem: null, info: null,
    routes: [], mine: [], auto: null, token: 0, status: "", prog: null, warn: "", decOn: RC.decisionOn(), dec: null, decAsk: "",
    on: routesOk && (() => { try { return localStorage.getItem("ocn.rc.on") !== "0"; } catch (e) { return true; } })() };
  const rcPace = () => RC.paceOf(rcs.s, rcs.auto);
  const rcStatus = (text, frac = null) => { rcs.status = text; rcs.prog = frac; RC.setStatus(text, frac); rcBusyPane(); };
  /** While the routes are computed, « Itinéraires » says so (owner, 2026-11-01: it stayed empty a minute): what is done now,
   *  a progress bar (moving without a measure while the relief is read), and what the computation does. */
  function rcBusy(on) { rcs.busy = on; rcBusyPane(); }
  function rcBusyPane() {
    const box = $("#an-rc-busy"), list = $("#an-rc");
    if (!box) return;
    box.hidden = !rcs.busy;
    if (list) list.hidden = !!rcs.busy;
    if (!rcs.busy) return;
    box.innerHTML = html`<b>${t("rc.busy.title")}</b>
      <div class="muted rc-busy-now">${rcs.status}</div>
      ${raw(rcs.prog == null ? `<progress class="rc-prog"></progress>` : `<progress class="rc-prog" max="1" value="${rcs.prog}"></progress>`)}
      <p class="hint">${t("rc.busy.hint")}</p>`;
  }
  /** The reading's facts: kept, and the warning when the map as read looks wrong. */
  const rcFacts = (facts) => { rcs.info = { ...rcs.info, ...facts }; rcs.warn = RC.readingWarning(rcs.info, rcs.s); RC.setWarning(rcs.warn); };
  const rcReading = (f) => rcStatus(t("rc.st.readingPct", { p: Math.round(100 * f) }), f);
  /** The decision map of leg i, asked of the worker once (null until it has come: the map is drawn again then). */
  function rcDecision(i) {
    if (!rcs.decOn || !rcs.plan || !rcs.routes[i]) return null;
    const a = targets[i]?.pos, b = targets[i + 1]?.pos, key = `${rcs.token}|${i}`;
    if (!a || !b) return null;
    if (rcs.dec?.key === key) return rcs.dec;
    if (rcs.decAsk !== key) {
      rcs.decAsk = key;
      rcs.plan.decision(a, b).then((d) => { if (rcs.decAsk === key && d) { rcs.dec = { key, ...d }; draw(); } }).catch((e) => console.warn(e));
    }
    return null;
  }
  function rcReset() { rcs.token++; rcs.routes = []; rcs.mine = []; rcs.auto = null; const c = $("#an-rc"); if (c) c.innerHTML = ""; rcBusy(false); }
  function rcPanel() {
    const host = $("#rc-host");
    if (!host) return;
    const vr = rcVector(), vrec = files.map?.vec ? files.map : files.vector || (vr?.layers ? { name: t("rc.vec.stored"), detail: t("rc.vec.storedDetail"), stored: true } : null);
    host.innerHTML = RC.panelHtml(rcs.s, { on: rcs.on, picture: rcs.picOn, decision: rcs.decOn, status: rcs.status, progress: rcs.prog, warn: rcs.warn, auto: rcs.auto,
      calib: RC.calibNote(rcs.s, rcs.calib, false),
      vector: vrec ? { name: vrec.name, detail: vrec.detail, used: !!vr, fixed: !!files.map?.vec || !!vrec.stored, note: vr ? "" : t(vrec.vec?.v?.geo ? "rc.vec.elsewhere" : "an.vec.noGeoRoutes") } : null });
    RC.showFitted(rcs.s, rcs.calib);
    RC.bindPanel(host, rcs.s, async (s, what, file) => {
      if (what === "vector" || what === "vector-clear") {
        if (what === "vector") {
          // beside the map shown, for the routes only: no new calibration
          try { const v = await readVector(new Uint8Array(await file.arrayBuffer()), file.name); files.vector = { name: file.name, file, note: v.geo ? "" : t("an.vec.noGeoRoutes"), detail: `${v.format === "ocad" ? `OCAD ${v.version}` : "OpenOrienteering Mapper"} · 1:${fmt(v.scale)}`, vec: { v } }; }
          catch (e) { console.error(e); rcStatus(t("rc.vec.failed")); return; }
        } else files.vector = null;
        rememberFiles(); filesCard();
        rcs.planFor = ""; rcPanel(); if (rcs.on) rcStart();
        return;
      }
      if (what === "on" || what === "off") {
        rcs.on = what === "on";
        try { localStorage.setItem("ocn.rc.on", rcs.on ? "1" : "0"); } catch (e) { /* this visit */ }
        if (rcs.on) rcStart(); else { rcReset(); draw(); }
      } else if (what === "picture-on") { rcs.picOn = true; rcPicture(); }
      else if (what === "picture-off") { rcs.picOn = false; rcs.pic = null; draw(); }
      else if (what === "decision-on" || what === "decision-off") { rcs.decOn = what === "decision-on"; rcs.dec = null; rcs.decAsk = ""; draw(); }
      else if (what === "pace") { rcTable(); draw(); }
      else {
        if (what === "map") rcs.mapSet = true;
        if (what === "reset") rcPanel();
        if (what === "relief" || what === "reset") { rcs.dem = null; rcStart(); } else rcRun();
      }
    });
  }
  /** The OCAD or Mapper map the routes read: the map shown (exactly placed), or one given beside its image, placed through its
   *  georeferencing and the calibration; null without either. */
  function rcVector() {
    if (files.map?.vec) { const { v, k } = files.map.vec; return { v, T: ownImage(v, k) }; }
    if (files.orga?.layers && !files.vector) return { layers: files.orga.layers, name: t("rc.vec.storedIn") };
    const v = files.vector?.vec?.v;
    if (!v?.geo || !fit || !track) return null;
    const T = throughGeo(v, (lat, lon) => toPx(fit, ...toLocal(track, lat, lon)));
    return T && cover(v, T, map.width, map.height) >= 0.2 ? { v, T } : null;
  }
  async function rcStart() {
    if (!rcs.on || !calibrated || !fit || !map) return;
    if (!rcs.mapSet) { rcs.s.map = !perso && RC.isSprint(race) ? "sprint" : "forest"; const sel = $("#rc-map"); if (sel) sel.value = rcs.s.map; }
    const my = ++rcs.token;
    const vr = rcVector();
    const sig = [map.width, map.height, fit.m11, fit.m12, fit.m21, fit.m22, fit.tx, fit.ty].map((v) => Number(v).toFixed(5)).join(",") + (vr ? `|${vr.name || vr.v.name}` : "");
    if (!rcs.plan || rcs.planFor !== sig || rcs.planMap !== map) {
      rcs.plan?.destroy();
      rcs.plan = RC.planner(map, (x, y) => toM(fit, x, y), vr, { map: rcs.s.map, onProgress: (f) => { if (my === rcs.token) rcReading(f); } });
      rcs.planFor = sig; rcs.planMap = map; rcs.dem = null; rcs.pic = null;
    }
    rcBusy(true);
    rcStatus(t("rc.st.reading"), 0);
    try {
      rcs.info = null;
      rcFacts(await rcs.plan.ready);
      if (my !== rcs.token) return;
      if (!rcs.dem) {
        rcStatus(t("rc.st.relief"), 0);
        try {
          const g = await heights((f) => { if (my === rcs.token) rcStatus(t("rc.st.reliefPct", { p: Math.round(100 * f) }), f); });
          if (my !== rcs.token) return;
          if (rcs.s.relief !== "dem") rcStatus(t("rc.st.contoursReading"));
          const r = await RC.reliefGrid(map, g, (x, y) => toM(fit, x, y), rcs.s);
          if (my !== rcs.token) return;
          await rcs.plan.dem(r.grid); rcs.dem = g.source; rcs.pieces = r.pieces;
        }
        catch (e) { console.warn(e); rcs.dem = "none"; }
        if (my !== rcs.token) return;
      }
      if (rcs.picOn) rcPicture();
      await rcRun();
    } catch (e) { console.error(e); if (my === rcs.token) { rcBusy(false); rcStatus(t("rc.st.failed")); } }
  }
  async function rcRun() {
    if (!rcs.plan || !rcs.on || !rcs.info) return;
    const my = ++rcs.token;
    rcBusy(true);
    rcs.routes = []; rcs.mine = []; rcs.auto = null; rcs.dec = null; rcs.decAsk = ""; rcs.calib = null; RC.setCalib("", rcs.s, null);
    try {
      const facts = await rcs.plan.settings(rcs.s, (f) => { if (my === rcs.token) rcReading(f); });
      if (my !== rcs.token) return;
      if (facts) { rcFacts(facts); if (rcs.picOn) rcPicture(); }
      await rcs.plan.controls(targets.filter((g) => g.pos && !g.missed).map((g) => g.pos));
      if (my !== rcs.token) return;
      if (rcs.picOn) rcPicture();
      const n = targets.length - 1, now = Math.max(0, legAt(tNow));
      const order = [...Array(Math.max(0, n)).keys()].sort((x, y) => (x === now ? -1 : y === now ? 1 : x - y));
      const t0 = performance.now(), twice = !!rcs.s.calib;
      // every leg: its routes, the runner's route laid on the map and matched (`label`, the progress from `from` over `span`)
      const pass = async (label, from, span) => {
        let done = 0;
        for (const i of order) {
          rcStatus(t(label, { n: done, t: n }), n ? from + (span * done) / n : null);
          const a = targets[i]?.pos, b = targets[i + 1]?.pos;
          if (a && b && !targets[i].missed && !targets[i + 1].missed) {
            const routes = await rcs.plan.leg(a, b);
            if (my !== rcs.token) return false;
            rcs.routes[i] = routes;
            const l = legs[i];
            if (routes && l?.t0 != null && l.t1 != null && offset != null) {
              const i0 = indexAt(track, offset + l.t0), i1 = indexAt(track, offset + l.t1), pts = [];
              for (let k = i0; k <= i1; k++) pts.push([pxs[k], pys[k]]);
              if (pts.length > 1) {
                const m = await rcs.plan.match(a, b, pts, RC.matchTol(rmsM), routes);
                if (my !== rcs.token) return false;
                rcs.mine[i] = { ...m, ...RC.chosen(m, routes), actual: l.time };
              }
            }
            if (i === Math.max(0, legAt(tNow))) draw();
          }
          done++;
        }
        return true;
      };
      if (!(await pass("rc.st.legs", 0, twice ? 0.5 : 1))) return;
      // the runner's own speeds on paths and climb from their legs (their routes as laid on the map), then the routes again
      if (twice) {
        const c = RC.calibrate(rcs.mine.map((m) => (m && m.snapped !== false ? { who: 0, actual: m.actual, parts: m.parts } : null)).filter(Boolean));
        rcs.calib = c;
        if (c.ok) {
          await rcs.plan.settings(RC.calibrated(rcs.s, c));
          if (my !== rcs.token) return;
          rcs.routes = []; rcs.mine = [];
          if (!(await pass("rc.st.calib", 0.5, 0.5))) return;
        }
        RC.setCalib(RC.calibNote(rcs.s, c, false), rcs.s, c);
      }
      rcs.auto = rcs.calib?.ok ? rcs.calib.pace[0] : RC.autoPace(rcs.mine.filter(Boolean).map((m) => ({ actual: m.actual, model: m.time })));
      const found = rcs.routes.filter(Boolean).length;
      rcBusy(false);
      rcStatus(t("rc.st.done", { n: found, t: n, s: fmt((performance.now() - t0) / 1000, 1), c: fmt(rcs.info.mpc, 1),
        r: rcs.dem && rcs.dem !== "none" ? RC.reliefNote(CREDIT[rcs.dem]?.text || rcs.dem, rcs.pieces) : t("rc.st.flat") }) + (rcs.info.vector ? ` · ${t("rc.st.symbols", { f: rcs.info.vector.name })}` : "")
        + (rcs.info.north ? ` · ${tn("rc.st.north", rcs.info.north)}` : ""));
      const p = $("#rc-pace"); if (p && rcs.auto) p.placeholder = RC.minKm(rcs.auto);
      rcTable(); draw();
    } catch (e) { console.error(e); if (my === rcs.token) { rcBusy(false); rcStatus(t("rc.st.failed")); } }
  }
  window.anDebugRoutes = () => ({ on: rcs.on, info: rcs.info, dem: rcs.dem, routes: rcs.routes, mine: rcs.mine, auto: rcs.auto, settings: rcs.s, calib: rcs.calib });
  async function rcPicture() {
    if (!rcs.plan) return;
    try { rcs.pic = await rcs.plan.picture(); } catch (e) { rcs.pic = null; }
    if (!rcs.picOn) rcs.pic = null;
    draw();
  }
  /** The legs' routes, leg by leg (the left panel's « Itinéraires »): each variant's time at the pace, length and climb, and
   *  the runner's own route measured on the same model, with what the choice and the running cost. The current leg marked. */
  function rcTable() {
    const el = $("#an-rc");
    if (!el) return;
    const rows = legs.map((l, i) => ({ l, i, routes: rcs.routes[i], mine: rcs.mine[i] })).filter((x) => x.routes?.length);
    if (!rcs.on || !rows.length) { el.innerHTML = html`<p class="hint sp-hint">${t(rcs.on ? "rc.tab.wait" : "rc.tab.off")}</p>`; return; }
    const pace = rcPace();
    const how = rcs.s.pace > 0 ? "rc.pace.typed" : rcs.calib?.ok ? "rc.pace.calib" : rcs.auto ? "rc.pace.auto" : "rc.pace.default";
    const dot = (n) => html`<span class="rc-dot" style="background:${n >= 0 ? RC.ROUTE_COLOURS[n] : "#999"}"></span>`;
    el.innerHTML = html`<p class="hint sp-hint">${t("rc.table.hint", { p: RC.minKm(pace), how: t(how) })}</p>
      ${rows.map(({ l, i, routes, mine }) => html`<div class="rc-lb" data-leg="${i}">
        <div class="rc-lb-head"><b>${l.label}</b>${l.code ? html` <span class="muted">${l.code}</span>` : ""}</div>
        ${routes.map((r, n) => html`<div class="rc-lb-row">${dot(n)}<b>${RC.LETTERS[n]}</b> <span class="num">${RC.routeFacts(r, pace, clock)}</span> <span class="muted">· ${RC.sideLabel(r)}</span></div>`)}
        ${mine ? html`<div class="rc-lb-row rc-lb-mine">${dot(mine.variant)}<b>${t("rc.col.mine")}</b>
            <span class="muted">${mine.matched ? RC.LETTERS[mine.variant] : RC.sharesLabel(mine) || t("rc.other")}</span>
            <span class="num">${RC.routeFacts(mine.facts, pace, clock)}</span></div>
          <div class="rc-lb-gaps">${l.time != null ? html`<span title="${t("rc.col.actual.hint")}">${t("rc.col.actual")} <b class="num">${clock(l.time)}</b></span>` : ""}
            <span title="${t("rc.col.choice.hint")}">${t("rc.col.choice")} <b class="num">${signed(Math.round((mine.time - routes[0].time) * pace))}</b></span>
            ${mine.actual != null ? html`<span title="${t("rc.col.exec.hint")}">${t("rc.col.exec")} <b class="num">${signed(Math.round(mine.actual - mine.time * pace))}</b></span>` : ""}</div>`
          : l.time != null ? html`<div class="rc-lb-gaps">${l.time != null ? html`<span title="${t("rc.col.actual.hint")}">${t("rc.col.actual")} <b class="num">${clock(l.time)}</b></span>` : ""}</div>` : ""}
      </div>`)}`;
    $$("#an-rc .rc-lb").forEach((b) => b.addEventListener("click", () => {
      const l = legs[Number(b.dataset.leg)];
      if (l?.t0 == null) return;
      stop(); zoomTo(l); seek(l.t0);
    }));
    rcLegShown = -2;
    rcCurrent(true);
  }
  let rcLegShown = -2;
  /** The current leg's block marked in « Itinéraires », brought into view when the tab shows. */
  function rcCurrent(force) {
    const j = Math.max(0, legAt(tNow));
    if (j === rcLegShown && !force) return;
    rcLegShown = j;
    let cur = null;
    $$("#an-rc .rc-lb").forEach((b) => { const on = Number(b.dataset.leg) === j; b.classList.toggle("cur", on); if (on) cur = b; });
    if (cur && !lp.collapsed && lp.tab === "routes") cur.scrollIntoView({ block: "nearest" });
  }

  // ---- the 3D view (a prototype, 2026-10-24): the map over the ground's heights, on the playback's own clock --------------
  /** The trace's time now: between two ticks of the playback's timer the 3D view moves on smoothly. */
  const clockNow = () => offset + (playing ? Math.min(total, tNow + ((performance.now() - last) / 1000) * speed) : tNow);
  /** A map pixel's [lat, lon], through the calibration (the trace's metres): only the map's area is asked of the services. */
  const pxLatLon = (px, py) => { const [mx, my] = toM(fit, px, py); return [track.lat0 - my / track.ky, track.lon0 + mx / track.kx]; };
  /** The heights under the map (trace/terrain.js), kept for the visit and in IndexedDB. */
  async function heights(onProgress) {
    const W = map.width, H = map.height, plan = gridPlan(W, H, (a, b) => toM(fit, a, b));
    const key = `${W}x${H}:${[[0, 0], [W, 0], [W, H], [0, H]].map(([a, b]) => pxLatLon(a, b).map((v) => v.toFixed(5)).join(",")).join(";")}`;
    if (v3grid?.key === key) return v3grid;
    v3refined = {};
    if (LM.isGenerated(files.map?.name) && files.world?.wf) {
      const g = await LM.lidarGrid({ wf: files.world.wf, W, H, ...plan, name: files.map.name });
      v3grid = { ...g, key, plan };
      return v3grid;
    }
    const g = await loadGrid({ key, ...plan, node: (i, j) => pxLatLon((i / (plan.nx - 1)) * W, (j / (plan.ny - 1)) * H), onProgress });
    v3grid = { ...g, key, plan };
    return v3grid;
  }
  const v3note = (text) => { const el = $("#an-3d-credit"); el.hidden = !text; el.innerHTML = text || ""; };
  async function toggle3d() {
    if (v3on) { close3d(); draw(); return; }
    if (!fit || offset == null || !track) return;
    const my = ++v3token;
    v3on = true;
    $("#an-3d").setAttribute("aria-pressed", "true");
    $("#an-3d-host").hidden = false; canvas.hidden = true;
    v3note(`${bar()} ${t("an.v3.loading")}`);
    try {
      const g = await heights((f) => { if (my === v3token) v3note(`${bar(f)} ${t("an.v3.loadingPct", { p: Math.round(100 * f) })}`); });
      if (my !== v3token) return;
      const { open3d } = await import("../trace/view3d.js");
      if (my !== v3token) return;
      const v = await open3d($("#an-3d-host"), { image: map, W: map.width, H: map.height, grid: g, toM: (x, y) => toM(fit, x, y), toPx: (x, y) => toPx(fit, x, y),
        track, i0: indexAt(track, offset), i1: indexAt(track, offset + total), now: clockNow, onUserMove: () => setFollow(false) });
      if (my !== v3token) { v.dispose(); return; }
      v3 = v; v3info = g;
      v3.setExaggeration(v3ex); exCtl?.show(true);
      if (v3relief === "contours") applyRelief();
      const c = g.source === "lidar" ? g.credit || LM.creditOf(files.map?.name) : CREDIT[g.source];
      v3note(html`${t("an.v3.relief")} <a href="${c.url}" target="_blank" rel="noopener">${c.text}</a>`);
      opts3d(); sync3d();
    } catch (e) {
      console.error(e);
      if (my !== v3token) return;
      close3d(); draw();
      v3note(t(e.message === "webgl" ? "an.v3.noWebgl" : "an.v3.failed"));
      setTimeout(() => { if (!v3on) v3note(""); }, 8000);
    }
  }
  function close3d() {
    v3token++;
    if (v3) { v3.dispose(); v3 = null; }
    if (!v3on) return;
    v3on = false;
    $("#an-3d").setAttribute("aria-pressed", "false"); exCtl?.show(false);
    $("#an-3d-host").hidden = true; canvas.hidden = false; v3note("");
    const o = $("#an-3d-opts"); if (o) o.hidden = true;
  }
  /** The 2D's display settings passed on: the trace's colour or pace colours, width, the part to come, the tail. */
  function sync3d() {
    if (!v3) return;
    if (!vSet) paceScale();
    const by = colourBy(), series = by ? seriesOf(track, by) : null;
    v3.setStyle({ colourOf: (i) => (by ? pointColour(i, series) : traceColour), colourKey: by ? `${by}:${vLo}:${vHi}` : traceColour, width, future, tail: legSel >= 0 ? 0 : tail, mapAlpha });
    v3.setFollow(follow);
  }
  /** The 3D view's own settings, under « Affichage »: the vertical exaggeration, the relief's source. */
  function opts3d() {
    const el = $("#an-3d-opts");
    if (!el || !v3info) return;
    const g = v3info;
    el.hidden = false;
    el.innerHTML = html`<div class="an-3d-head">${t("an.v3.title")}</div><div class="an-opts">
      <label><span>${t("an.v3.ex")}</span><span class="an-3d-ex"><input type="range" id="an-ex" min="1" max="3" step="0.25" value="${v3ex}"><b id="an-ex-v">× ${fmt(v3ex, 2)}</b></span></label></div>
      <label><span>${t("an.v3.relief.choice")}</span><select id="an-relief"><option value="dem" ${raw(v3relief === "dem" ? "selected" : "")}>${t("an.v3.relief.dem")}</option><option value="contours" ${raw(v3relief === "contours" ? "selected" : "")}>${t("an.v3.relief.contours")}</option></select></label>
      <label id="an-interval-row" ${raw(v3relief === "contours" ? "" : "hidden")}><span>${t("an.v3.interval")}</span><select id="an-interval"><option value="5" ${raw(v3interval === 5 ? "selected" : "")}>5 m</option><option value="2.5" ${raw(v3interval === 2.5 ? "selected" : "")}>${fmt(2.5, 1)} m</option></select></label></div>
      <p class="muted an-3d-info">${t(g.source === "tiles" ? "an.v3.info.tiles" : g.source === "lidar" ? "an.v3.info.lidar" : "an.v3.info.ign", { nx: g.nx, ny: g.ny, step: fmt(g.step, 1), s: g.cached ? t("an.v3.cached") : `${fmt(g.ms / 1000, 1)} s` })}</p>
      <p class="muted an-3d-info" id="an-relief-info"></p>`;
    $("#an-ex").addEventListener("input", (e) => { v3ex = Number(e.target.value); $("#an-ex-v").textContent = `× ${fmt(v3ex, 2)}`; v3?.setExaggeration(v3ex); savePrefs(); exCtl?.sync(); });
    $("#an-relief").addEventListener("change", (e) => { v3relief = e.target.value; $("#an-interval-row").hidden = v3relief !== "contours"; savePrefs(); applyRelief(); });
    $("#an-interval").addEventListener("change", (e) => { v3interval = Number(e.target.value); savePrefs(); applyRelief(); });
    reliefInfo();
  }
  /** The relief the view shows: the model alone, or with the map's own contour lines (trace/contours.js, an experiment). */
  async function applyRelief() {
    if (!v3 || !v3grid) return;
    if (v3relief !== "contours") { v3.setGrid(v3grid); reliefInfo(); return; }
    let r = v3refined[v3interval];
    if (r === undefined) {
      const el = $("#an-relief-info"); if (el) el.textContent = t("an.v3.contours.reading");
      await tick();
      const { refineGrid } = await import("../trace/contours.js");
      const mPerPx = Math.hypot(...[0, 1].map((k) => toM(fit, map.width, 0)[k] - toM(fit, 0, 0)[k])) / map.width;
      try { r = refineGrid(map, v3grid, map.width, map.height, mPerPx, { interval: v3interval }); } catch (e) { console.error(e); r = null; }
      v3refined[v3interval] = r;
      if (!v3 || v3relief !== "contours") return;
    }
    v3.setGrid(r || v3grid);
    reliefInfo();
  }
  function reliefInfo() {
    const el = $("#an-relief-info");
    if (!el) return;
    const r = v3refined[v3interval];
    el.textContent = v3relief !== "contours" ? "" : !r ? t("an.v3.contours.none")
      : `${t("an.v3.contours.info", { n: r.contours.pieces, s: fmt(r.contours.ms / 1000, 1) })} ${t(v3grid?.source === "tiles" ? "an.v3.contours.tiles" : "an.v3.contours.ign")}`;
  }
  window.anDebug3d = () => ({ on: v3on, grid: v3info && { nx: v3info.nx, ny: v3info.ny, step: v3info.step, source: v3info.source, ms: v3info.ms, cached: v3info.cached, zoom: v3info.zoom, tiles: v3info.tiles }, view: v3?.stats(), contours: v3refined[v3interval]?.contours });

  // ---- the curves under the map: one row per curve chosen, the same time axis, the controls' passes when the sequence is known
  const stripRows = () => ["pace", ...Object.keys(CHANNEL_COLOUR)].filter((c) => chans.has(c) && (c === "pace" || track.ch[c]));
  function sizeStrip() {
    const dpr = window.devicePixelRatio || 1;
    strip.width = Math.round(strip.clientWidth * dpr); strip.height = Math.round(strip.clientHeight * dpr);
  }
  function drawStrip() {
    if (!calibrated || !total) return;
    if (!vSet) paceScale();
    const known = sequenceKnown();
    drawCurves(strip, { track, t0: offset, total, rows: stripRows(), cursor: tNow, units: { cad: unitOf("cad") },
      marks: targets.map((g, i) => { const tt = timeOf(g); return tt == null || !i ? null : { t: tt, label: known ? g.label : "" }; }).filter(Boolean),
      shade: known ? legs.filter((l) => l.mistake && l.t1 != null).map((l) => ({ t0: l.t0, t1: l.t1 })) : [] });
  }
  const scrub = (e) => { if (!calibrated) return; stop(); seek(curveTimeAt(strip, e.offsetX, total)); };
  strip.addEventListener("pointerdown", (e) => { scrub(e); strip.setPointerCapture(e.pointerId); strip.dataset.down = "1"; });
  strip.addEventListener("pointermove", (e) => { if (strip.dataset.down) scrub(e); });
  const stripUp = () => { delete strip.dataset.down; };
  strip.addEventListener("pointerup", stripUp); strip.addEventListener("pointercancel", stripUp);

  // files dropped anywhere on the page — on the map during the playback too — replace the current ones
  const dropAll = $("#an-dropall");
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const onDragOver = (e) => { if (!hasFiles(e)) return; e.preventDefault(); dropAll.hidden = false; };
  const onDragLeave = (e) => { if (!e.relatedTarget) dropAll.hidden = true; };
  const onDrop = (e) => {
    dropAll.hidden = true;
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    if (e.target.closest?.("#an-drop")) return;                     // the drop zone takes its own
    take([...e.dataTransfer.files]);
  };
  window.addEventListener("dragover", onDragOver); window.addEventListener("dragleave", onDragLeave); window.addEventListener("drop", onDrop);

  // ---- go
  /** Opening straight on the playback (a kept analysis, a run replayed, a tab opened by « ↗ »): the files and the calibration
   *  stay out of sight until it plays, or for 20 s at most (then whatever the page shows). */
  let openTimer = 0;
  function openShown(on) {
    main.classList.toggle("an-opening-on", on);
    $("#an-opening").hidden = !on;
    clearTimeout(openTimer);
    if (on) openTimer = setTimeout(() => openShown(false), 20000);
  }
  if (keptId || autoPlay) openShown(true);
  steps(1);
  await loadRace();
  pickers();
  const memo = !keptId && memos[pageMode] && (!orgaMode || memos[pageMode].orgaKey === key) ? memos[pageMode] : null;
  // files opened with the installed app or shared to it (pwa.js): they join the files of the visit, as if dropped
  const received = await takeInbox();
  if (memo) {
    ({ map, track, courseCache, iofIndex, restoredFiles } = memo);
    Object.assign(files, memo.files);
    memos[pageMode] = null;
    filesCard(); setup();
  } else {
    filesCard(); setup();
    if (keptId) {
      try {
        const { a, files: fl } = await (await import("../trace/solokeep.js")).load(keptId);
        openedKept = { id: keptId, title: a.title || "" };
        autoPlay = true;
        await take(fl, { remember: false });
      } catch (e) {
        console.error(e);
        openShown(false);
        $("#an-files").insertAdjacentHTML("afterbegin", html`<div class="notice" style="margin:12px">${t("ma.solo.err")}</div>`.toString());
      }
    } else if (received.length) await restoreFromIdb(); else restoreFromIdb();
  }
  if (received.length) take(received);
  const onInbox = async () => { const got = await takeInbox(); if (got.length) take(got); };
  window.addEventListener("ocn:inbox", onInbox);
  return { title: t(titleKey), cleanup: () => {
    document.body.classList.remove("an-theatre");      // the site's menus come back on every other page
    clearTimeout(openTimer); main.classList.remove("an-opening-on");
    leaveFull(); leaveMapOnly();
    window.removeEventListener("resize", onWinResize);
    window.removeEventListener("dragover", onDragOver); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("drop", onDrop);
    window.removeEventListener("ocn:inbox", onInbox);
    document.removeEventListener("keydown", onDrawKey); offArrows(); measure.destroy(); video?.close();
    themeWatch.disconnect();
    stop(); ro.disconnect(); barFloat.destroy(); handleClear.destroy(); prepToken++; close3d(); rcs.token++; rcs.plan?.destroy();
    if (map || track) memos[pageMode] = { map, track, courseCache, iofIndex, restoredFiles: true, files: { ...files }, orgaKey: orgaMode ? key : null };
  } };
}
