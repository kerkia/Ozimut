// « Virtually » (Coach; owner, 2026-11-11 — a tab of « Jeux » the day before): virtual orienteering in a 3D forest made from
// a real map, a page of four tabs. Administrators only for now (app.js: the menu entry and the address).
// - Entraînement: the maps as thumbnails (their package's thumb.webp, tools/virtually/thumb.mjs), a map chosen lists its six
//   courses (tools/virtually/course.py: Bleu, Jaune, Orange MD, Orange LD, Violet court, Violet long), « Commencer » once both
//   are chosen runs the game (games/virtually.js) in place; the run finished is kept on the server (/api/virtual/runs).
// - Résultats: a map, then a circuit, its runs as Stats' race results: place, runner, time, gap, the runner's virtual index and
//   the run's virtual score with its gap (games/vindex.js: the Ozimut method's rules on the virtual runs, explained there).
// - Classement: the runners by their virtual index (competitions only: owner, 2026-11-11).
// - Analyse: one's own run replayed on the map, its legs (time lost as « Analyse de course » counts it, trace/legs.js), the
//   pace under the map (trace/pacestrip.js), other runners of the same circuit beside it. A virtual run is a perfect trace
//   in the map's frame: no calibration.
// - Orga: the organisers' events (pages/virtuallyorga.js): a training or a competition made from their own OCAD map (an
//   administrator also from the LiDAR alone), built on GitHub; the published ones are offered in Entraînement beside the maps,
//   their runs kept by api/virtual/events (a competition once per account and course) and read here as the maps' runs.
// - Avatar: the runner seen in the race — woman or man, skin, hair, shorts or long legs, the kit's colours (games/vavatar.js,
//   kept in this browser), shown turning in a small scene.
// The tab in the address (?onglet=resultats|classement|analyse|avatar|orga), the map and course too (?carte=, ?circuit=, ?run=).

import { html, raw, $, $$, fmt, fmtDate, displayName } from "../util.js";
import { t, tn, loadArea } from "../i18n.js";
import { pageTabs, tabFrom, bindPageTabs, dataTable, scoreCell, subHead } from "../ui.js";
import * as auth from "../auth.js";
import { betaNote } from "../beta.js";
import * as data from "../data.js";
import { envText } from "../games/vweather.js";
import { LAYERS, mapOptOf, mapOptText, imageMap, savedOpt, saveOpt, moOf } from "../games/vmapopt.js";

const API = "/api/virtual/";
// a sprint has no violet nor middle and long distances: its orange courses are short and long (orange_s, orange_l)
export const LEVELS = ["blue", "yellow", "orange_s", "orange_l", "orange_md", "orange_ld", "violet_md", "violet_ld"];
const LEVEL_COLOUR = { blue: "#2b6fd6", yellow: "#e2bd12", orange_s: "#f08a1c", orange_l: "#f08a1c", orange_md: "#f08a1c", orange_ld: "#f08a1c", violet_md: "#8e3fbf", violet_ld: "#8e3fbf" };

export const clock = (s) => {
  if (s == null || !Number.isFinite(s)) return "—";
  s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`;
};
const gapClock = (s) => (s == null || Math.round(s) <= 0 ? "" : `+${clock(s)}`);
const EVENTS = new Map();                 // the events' records, by id (an event is played as a map)
/** A map's name: an event's own, its catalogue entry, else its id. */
const mapName = (id) => { if (EVENTS.has(id)) return EVENTS.get(id).name; const k = `vt.map.${id}`, v = t(k); return v === k ? id : v; };
/** A course's name: its level's, else its own. */
const courseName = (c) => (LEVELS.includes(c.id) ? t(`vt.lvl.${c.id}`) : c.name || c.id);
const swatch = (id) => html`<span class="vtp-sw" style="background:${LEVEL_COLOUR[id] || "#888"}"></span>`;

// ---- the server ---------------------------------------------------------------------------------------------------------
let RACES = null;
const runsCache = new Map();
async function getJson(url, opts) {
  const r = await fetch(url, { credentials: "same-origin", cache: "no-store", ...opts });
  if (!r.ok) throw Object.assign(new Error(`${url}: ${r.status}`), { status: r.status });
  return r.json();
}
/** The maps, then the published events (as maps: { id, event, race: { courses, … } }). */
const races = async () => (RACES ||= (async () => {
  const [maps, evs] = await Promise.all([getJson(`${API}races`).then((d) => d.races), getJson(`${API}events`).then((d) => d.events).catch(() => [])]);
  const list = evs.filter((e) => e.published && e.courses.length);
  for (const e of list) EVENTS.set(e.id, e);
  return maps.concat(list.map((e) => ({ id: e.id, event: e, thumb: e.thumb,
    race: { id: e.id, scale: e.scale, std: e.std, source: e.source === "lidar" ? "lidaronly" : "lidar", lonlat: e.lonlat, courses: e.courses } })));
})());
async function runsOf(race) {
  if (!runsCache.has(race)) runsCache.set(race, getJson(`${API}runs?race=${encodeURIComponent(race)}`).then((d) => d.runs.map((r) => ({ ...r, race }))));
  return runsCache.get(race);
}
/** Every map's runs with the virtual index computed over all of them (games/vindex.js). */
async function allRuns() {
  const list = await races();
  const runs = (await Promise.all(list.map((r) => runsOf(r.id).catch(() => [])))).flat();
  const { compute } = await import("../games/vindex.js");
  return compute(runs);
}

// ---- the ghosts (owner, 2026-11-12: « a user could select a number of ghosts to run with, in training for now ») -------------
const GHOSTS_KEY = "ocn.vt.ghosts", GHOSTS_MAX = 5;
// the view the race starts in (owner, 2026-11-14: « autoriser le choix avant le début »): behind the runner or through their eyes;
// V still switches during the race; kept in this browser
const VIEW_KEY = "ocn.vt.view";
const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === "first" ? "first" : "third"; } catch (e) { return "third"; } };
const ghostCount = () => { try { const n = Number(localStorage.getItem(GHOSTS_KEY)); return n >= 0 && n <= GHOSTS_MAX ? n : 0; } catch (e) { return 0; } };
/** The n ghosts of a run: training runs of the whole map (a competition's never, nor one shown « Ma position »), each runner once.
 *  The course's own runs first — one's own best, the fastest, then the runners nearest one's own best time (else the field's
 *  median) —, taken in turn with the map's other courses' runners (owner, 2026-11-14: « runners who did the same map »): each one's
 *  best run on the course nearest this one in length, nearest one's own pace; those carry their course's name (`course`).
 *  Their routes read one by one. */
async function pickGhosts(race, courseId, n, courses, courseLabel) {
  if (!n) return [];
  const runs = (await runsOf(race.id)).filter((r) => r.kind !== "competition" && !r.help && r.t > 0);
  const lenOf = new Map((courses || []).map((c) => [c.id, c.length]));
  const here = lenOf.get(courseId) || 0;
  const best = new Map(), elsewhere = new Map(), dl = (x) => Math.abs((lenOf.get(x.course) || 0) - here);
  for (const r of runs) {
    if (r.course === courseId) { const b = best.get(r.u); if (!b || r.t < b.t) best.set(r.u, r); continue; }
    const b = elsewhere.get(r.u);
    if (!b || dl(r) < dl(b) || (dl(r) === dl(b) && r.t < b.t)) elsewhere.set(r.u, r);
  }
  const all = [...best.values()].sort((a, b) => a.t - b.t), mine = all.find((r) => r.mine), others = all.filter((r) => !r.mine);
  const ref = mine ? mine.t : others[Math.floor(others.length / 2)]?.t;
  const same = [mine, others[0], ...others.slice(1).sort((a, b) => Math.abs(a.t - ref) - Math.abs(b.t - ref))].filter(Boolean);
  // the other courses' runners not already here, nearest one's own pace on this course (seconds a km), else the fastest first
  const pace = (r) => r.t / ((lenOf.get(r.course) || 1000) / 1000), refPace = ref && here ? ref / (here / 1000) : null;
  const other = [...elsewhere.values()].filter((r) => !best.has(r.u))
    .sort((a, b) => (refPace ? Math.abs(pace(a) - refPace) - Math.abs(pace(b) - refPace) : pace(a) - pace(b)));
  const out = [];
  for (let i = 0; out.length < n && (i < same.length || i < other.length); i++) {
    if (i < same.length) out.push(same[i]);
    if (out.length < n && i < other.length) out.push(other[i]);
  }
  const got = await Promise.all(out.map((r) => getJson(`${API}runs/${encodeURIComponent(race.id)}/${r.id}`)
    .then((d) => ({ name: r.mine ? t("vt.gh.me") : displayName(r.name), t: r.t, mine: !!r.mine, route: d.route || [],
      course: r.course === courseId ? null : courseLabel(r.course) })).catch(() => null)));
  return got.filter((g) => g && g.route.length > 1);
}

/** The account's own Ozimut forest index today, the seed of their virtual index (games/vindex.js), or null. */
async function mySeed() {
  try {
    const me = auth.myId();
    if (!me || !data.isPrivateLoaded()) return null;
    return (await data.cnAt("top6w", "For", data.latestMonth())).get(String(me)) || null;
  } catch (e) { return null; }
}

export async function render(main, { query }) {
  await loadArea("virtually");
  if (location.hash.startsWith("#/jeux")) history.replaceState(null, "", "#/virtually");     // « Jeux »'s tab of before
  const tabs = [["entrainement", t("vt.tab.training")], ["resultats", t("vt.tab.results")], ["classement", t("vt.tab.ranking")], ["analyse", t("vt.tab.analysis")],
    ["avatar", t("vt.tab.avatar")], ...(auth.session()?.orga !== false ? [["orga", t("vt.tab.orga")]] : [])]
    // every account sees Pixel since 2026-11-12, the administrators alone its other tabs (owner: Entraînement and Avatar for all)
    .filter(([k]) => auth.session()?.admin || k === "entrainement" || k === "avatar");
  const tab = tabFrom(tabs, query);
  const sel = { race: query.carte || null, course: query.circuit || null, run: query.run || null };
  main.innerHTML = html`
    <div class="page-head"><div><h1>${t("nav.virtually")}</h1><p class="lede">${t("vtp.lede")}</p></div></div>
    ${raw(betaNote("pixel"))}
    ${pageTabs(tabs, tab)}
    ${tabs.map(([k]) => html`<div data-panel="${k}" class="vtp-panel" hidden></div>`)}`;
  let game = null, drawn = new Set(), stopAn = null, stopOrga = null, stopAvatar = null, trainingPlay = null;
  const panel = (k) => $(`[data-panel="${k}"]`, main);
  const setQuery = (q) => {
    const [path, qs] = location.hash.split("?"), p = new URLSearchParams(qs || "");
    for (const [k, v] of Object.entries(q)) (v ? p.set(k, v) : p.delete(k));
    const next = `${path}${p.toString() ? `?${p}` : ""}`;
    if (next !== location.hash) history.replaceState(null, "", next);
  };
  const draw = async (k) => {
    if (k !== "analyse") { stopAn?.(); stopAn = null; }
    try {
      if (k === "entrainement") await training(panel(k));
      else if (k === "resultats") await results(panel(k));
      else if (k === "classement") await ranking(panel(k));
      else if (k === "avatar") { stopAvatar?.(); stopAvatar = await (await import("../games/vavatar.js")).renderAvatar(panel(k)); }
      else if (k === "orga") { stopOrga?.(); stopOrga = await (await import("./virtuallyorga.js")).renderOrga(panel(k), { onPlay: (ev, c) => tryEvent(ev, c), onChange: listsChanged }); }
      else stopAn = await analysis(panel(k));
    } catch (e) {
      console.error(e);
      panel(k).innerHTML = html`<div class="card"><div class="empty">${t(e.status === 403 ? "vt.forbidden" : "vt.error")}<br><span class="muted">${String(e.message || e)}</span></div></div>`;
    }
  };
  const show = bindPageTabs(main, tabs, tab, (k) => { if (!drawn.has(k) || (k !== "entrainement" && k !== "orga")) { drawn.add(k); draw(k); } });
  /** The organisers try their event (the Orga tab) in the training tab: their own runs are trainings. */
  const tryEvent = async (ev, course) => {
    EVENTS.set(ev.id, ev); RACES = null;
    game?.stop(); game = null; show("entrainement");
    if (!trainingPlay) { drawn.add("entrainement"); await draw("entrainement"); }
    await trainingPlay({ id: ev.id, event: ev, race: { courses: ev.courses } }, course);
  };
  const goTab = (k) => { game?.stop(); game = null; show(k); };
  /** An event published, withdrawn, changed or deleted in « Orga »: the maps and their results are read again when next shown,
   *  Training drawn afresh unless a race is under way there. */
  function listsChanged() {
    RACES = null; runsCache.clear();
    if (!game) drawn.delete("entrainement");
  }

  // ---- Entraînement ------------------------------------------------------------------------------------------------------
  /** The map options under « Commencer » (owner, 2026-11-12): a map's training, the runner's choice kept in this browser; an event,
   *  its creator's, said and not changed; a map from the LiDAR alone (an image) offers « map at the controls only » alone. */
  function moChooser(race) {
    if (race.event) {
      const txt = mapOptText(t, race.event.mapOpt);
      return txt ? html`<p class="vtp-mo muted"><b>${t("vt.mo.label")}</b> ${txt} — ${t("vt.mo.fixed")}</p>` : "";
    }
    const o = savedOpt(), img = imageMap(race.race);
    return html`<div class="vtp-mo" title="${t("vt.mo.tip")}"><b>${t("vt.mo.label")}</b>
      ${img ? html`<span class="muted">${t("vt.mo.imageOnly")}</span>` : html`<label>${t("vt.mo.layer")} <select id="vtp-layer">${LAYERS.map((l) => html`<option value="${l}" ${raw(l === o.layer ? "selected" : "")}>${t(`vt.mo.l.${l}`)}</option>`)}</select></label>`}
      <label class="vtp-mo-mem"><input type="checkbox" id="vtp-memory" ${raw(o.memory ? "checked" : "")}> ${t("vt.mo.memory")}</label></div>`;
  }
  async function training(el) {
    if (game) return;
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    const list = await races();
    if (!list.some((r) => r.id === sel.race)) sel.race = null;
    const drawChooser = () => {
      const race = list.find((r) => r.id === sel.race), courses = race?.race.courses || [];
      if (!courses.some((c) => c.id === sel.course)) sel.course = null;
      // on a phone the chosen map's circuits and « Commencer » come right under that map, not under the whole list (owner, 2026-11-12)
      const inline = !!race && matchMedia("(max-width: 640px)").matches;
      el.innerHTML = html`<p class="muted vtp-intro">${t(auth.session()?.admin ? "vt.tr.intro" : "vt.tr.introAll")}</p>
        <h2 class="vtp-h">${t("vt.tr.maps")}</h2>
        <div class="vtp-maps">${list.map((r) => html`<button type="button" class="vtp-map card" data-race="${r.id}" aria-pressed="${r.id === sel.race}">
          ${r.thumb ? html`<img src="${r.event ? `${API}events/${r.id}/pkg/` : `${API}${r.id}/`}thumb.webp" alt="" loading="lazy">` : html`<span class="vtp-nothumb"></span>`}
          <b>${mapName(r.id)}</b><span class="muted">${t("vt.tr.mapLine", { scale: fmt(r.race.scale), std: r.race.std || "", n: r.race.courses.length })}</span>
          ${/* a map card names no organiser, and a training says nothing: this is the training page (owner, 2026-11-12); a
              competition, played once, keeps its tag */ ""}
          ${r.event?.type === "competition" ? html`<span><span class="tag vo-comp">${t("vo.type.competition")}</span></span>` : ""}
          ${r.event && envText(t, r.event.env) ? html`<span class="vtp-env">${envText(t, r.event.env)}</span>` : ""}
          ${r.event && mapOptText(t, r.event.mapOpt) ? html`<span class="vtp-env">${mapOptText(t, r.event.mapOpt)}</span>` : ""}
          <span class="muted">${t(`vt.src.${r.race.source}`, { authors: (r.race.photoAuthors || []).join(", ") || "—" })}</span></button>${inline && r.id === race.id ? raw('<div class="vtp-inline"></div>') : ""}`)}</div>
        <div class="vtp-below">${race ? html`<h2 class="vtp-h vtp-h-row"><span>${t("vt.tr.courses", { map: mapName(race.id) })}</span>
          <button type="button" class="btn btn-sm" id="vtp-palm" title="${t("vt.palm.tip")}">🏆 ${t("vt.palm.btn")}</button></h2>
          ${race.event?.type === "competition" ? html`<p class="muted">${t(race.event.open ? "vo.compRule" : "vo.compClosed")}</p>` : ""}
          <div class="vtp-courses">${courses.map((c) => html`<button type="button" class="vtp-course" data-course="${c.id}" aria-pressed="${c.id === sel.course}"
            ${raw(race.event?.type === "competition" && !race.event.mine && (race.event.played?.includes(c.id) || !race.event.open) ? "disabled" : "")}>
            ${swatch(c.id)}<b>${courseName(c)}</b><span>${t("vt.tr.courseLine", { km: fmt(c.length / 1000, 1), climb: fmt(c.climb || 0), n: c.controls.length - 2 })}</span>
            <span class="muted">${race.event?.played?.includes(c.id) ? t("vo.played") : t(`vt.lvlHint.${LEVELS.includes(c.id) ? c.id : "other"}`)}</span></button>`)}</div>` : ""}
        <div class="vtp-go"><button type="button" class="btn btn-primary" id="vtp-go" ${raw(race && sel.course ? "" : "disabled")}>${t("vt.tr.start")}</button>
          ${race && sel.course && race.event?.type !== "competition" ? html`<label class="vtp-ghosts" title="${t("vt.gh.tip")}">${t("vt.gh.label")}
            <select id="vtp-ghosts">${Array.from({ length: GHOSTS_MAX + 1 }, (_, i) => html`<option value="${i}" ${raw(i === ghostCount() ? "selected" : "")}>${i ? fmt(i) : t("vt.gh.none")}</option>`)}</select></label>` : ""}
          ${race && sel.course ? html`<label class="vtp-ghosts" title="${t("vt.view.tip")}">${t("vt.view.label")}
            <select id="vtp-view">${["third", "first"].map((v) => html`<option value="${v}" ${raw(v === savedView() ? "selected" : "")}>${t(`vt.view.opt.${v}`)}</option>`)}</select></label>` : ""}
          <span class="muted">${!race ? t("vt.tr.needMap") : !sel.course ? t("vt.tr.needCourse") : t("vt.tr.ready", { course: courseName(courses.find((c) => c.id === sel.course)), map: mapName(race.id) })}</span></div>
          ${race && sel.course ? moChooser(race) : ""}</div>
        <div class="vtp-gen" id="vtp-gen"></div>`;
      // invented terrain (pages/virtuallygen.js): the « Carte du jour » and the « Terrain libre », played by `play` as any map
      const genHost = $("#vtp-gen", el);
      import("./virtuallygen.js").then((m) => { if (genHost.isConnected) m.renderGen(genHost, { play, runsOf, courseName, swatch }); }).catch((e) => console.error(e));
      if (inline) $(".vtp-inline", el).append($(".vtp-below", el));
      const into = (q) => requestAnimationFrame(() => $(q, el)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      $$(".vtp-map", el).forEach((b) => b.addEventListener("click", () => { sel.race = b.dataset.race; sel.course = null; setQuery({ carte: sel.race, circuit: null }); drawChooser(); into(".vtp-below"); }));
      $$(".vtp-course", el).forEach((b) => b.addEventListener("click", () => { sel.course = b.dataset.course; setQuery({ circuit: sel.course }); drawChooser(); into("#vtp-go"); }));
      $("#vtp-palm", el)?.addEventListener("click", () => palmares(race, sel.course));
      $("#vtp-ghosts", el)?.addEventListener("change", (e) => { try { localStorage.setItem(GHOSTS_KEY, e.target.value); } catch (x) { /* not kept */ } });
      $("#vtp-view", el)?.addEventListener("change", (e) => { try { localStorage.setItem(VIEW_KEY, e.target.value); } catch (x) { /* not kept */ } });
      const moSave = () => saveOpt({ layer: $("#vtp-layer", el)?.value || savedOpt().layer, memory: !!$("#vtp-memory", el)?.checked });
      $("#vtp-layer", el)?.addEventListener("change", moSave);
      $("#vtp-memory", el)?.addEventListener("change", moSave);
      $("#vtp-go", el)?.addEventListener("click", () => play(race, courses.find((c) => c.id === sel.course)));
    };
    const play = async (race, course) => {
      const name = race.name || mapName(race.id);              // an invented terrain names itself (pages/virtuallygen.js)
      el.innerHTML = html`<p class="vtp-back"><button type="button" class="btn btn-sm" id="vtp-back">${t("vt.tr.back")}</button>
        <b>${name} · ${courseName(course)}</b></p><div class="g-root card vtp-game"><div class="card-body"></div></div>`;
      const seed = mySeed();
      const { mount } = await import("../games/virtually.js");
      const ev = race.event;
      game = mount($(".vtp-game .card-body", el), race.id, {
        course: course.id, title: `${name} · ${courseName(course)}`, base: ev ? `/api/virtual/events/${ev.id}/pkg/` : undefined, race: race.race, load: race.load,
        // the ghosts: in training only, never in a competition nor on invented terrain (the day's first runs are ranked blind)
        ghosts: ev?.type === "competition" || race.gen ? [] : pickGhosts(race, course.id, ghostCount(), race.race?.courses || [], (id) => courseName((race.race?.courses || []).find((c) => c.id === id) || { id })),
        env: ev?.env,
        // the map options: an event's, fixed by its creator; a map's training, the runner's choice (games/vmapopt.js)
        // (the « Carte du jour »'s ranked runs: the whole map for everyone)
        map: ev ? mapOptOf(ev.mapOpt) : race.day ? null : savedOpt(),
        view: savedView(),                                  // the runner's own choice, an event's races included
        onFinish: async (run) => {
          const note = () => $("#vt-saved", el);
          if (race.noSave) { if (note()) note().textContent = t("vtg.notKept"); return; }       // a « Terrain libre »: played, not kept
          try {
            // an event's runs go to its own address, which decides their kind (a competition: once per account and course)
            const r = await fetch(ev ? `/api/virtual/events/${ev.id}/runs` : `${API}runs`, { method: "POST", credentials: "same-origin",
              headers: { "Content-Type": "application/json" }, body: JSON.stringify({ race: race.id, kind: "training", event: race.sig || "", ...run, seed: await seed }) });
            if (r.status === 409) { if (note()) note().textContent = t("vo.already"); return; }
            if (!r.ok) throw new Error(String(r.status));
            if (ev?.type === "competition" && !ev.mine) { ev.played = [...(ev.played || []), course.id]; RACES = null; }
            const saved = await r.json();
            runsCache.delete(race.id); sel.run = saved.id; drawn.delete("resultats"); drawn.delete("classement"); drawn.delete("analyse");
            if (note()) note().textContent = t("vt.saved");
          } catch (e) { if (note()) note().textContent = t("vt.notSaved"); }
        },
        // an invented terrain's results are on the training tab itself (the day's), not in « Résultats »
        onNav: (k) => { if (race.gen) { game?.stop(); game = null; drawChooser(); return; } setQuery({ run: sel.run }); goTab(k === "results" ? "resultats" : "analyse"); },
      });
      $("#vtp-back", el).addEventListener("click", () => { game?.stop(); game = null; drawChooser(); });
    };
    trainingPlay = play;
    drawChooser();
  }

  /** A map's training palmarès (owner, 2026-11-12: beside its circuits, a pop-up as the games' palmarès): for one circuit, the 20
   *  best training times, each runner's best; the circuit chosen above the table. */
  async function palmares(race, courseId) {
    const courses = race.race.courses || [];
    let cur = courses.find((c) => c.id === courseId)?.id || courses[0]?.id;
    const dlg = document.createElement("dialog");
    dlg.className = "g-palm vtp-palm";
    dlg.innerHTML = String(html`<div class="g-palm-head"><h2>${t("g.palm")} <span class="muted">· ${mapName(race.id)}</span></h2>
      <button type="button" class="btn btn-sm" data-close>${t("g.palm.close")}</button></div>
      <div class="seg vtp-palm-seg" role="group">${courses.map((c) => html`<button type="button" data-c="${c.id}" aria-pressed="${c.id === cur}">${swatch(c.id)} ${courseName(c)}</button>`)}</div>
      <div class="g-palm-body"><div class="boot"><div class="spinner"></div></div></div>`);
    document.body.append(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) close(); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    dlg.showModal();
    let runs = null;
    try { runs = await runsOf(race.id); } catch (e) { runs = null; }
    const body = $(".g-palm-body", dlg);
    const drawTop = () => {
      $$(".vtp-palm-seg button", dlg).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.c === cur)));
      if (!runs) { body.innerHTML = String(html`<p class="muted">${t("g.palm.err")}</p>`); return; }
      const best = new Map();
      for (const r of runs) if (r.course === cur && r.kind !== "competition" && !r.event && (!best.has(r.u) || r.t < best.get(r.u).t)) best.set(r.u, r);
      const top = [...best.values()].sort((a, b) => a.t - b.t).slice(0, 20);
      body.innerHTML = String(top.length ? html`<p class="muted">${t("vt.palm.hint")}</p><table class="data g-palm-t"><thead><tr><th class="num">${t("vt.col.place")}</th>
          <th>${t("vt.col.runner")}</th><th class="num">${t("vt.col.time")}</th><th>${t("vt.col.date")}</th></tr></thead>
        <tbody>${top.map((r, i) => html`<tr class="${r.mine ? "g-palm-me" : ""}"><td class="num">${i + 1}</td><td>${displayName(r.name)}${r.mine ? html` <span class="tag">${t("vt.me")}</span>` : ""}</td>
          <td class="num"><b>${clock(r.t)}</b></td><td>${fmtDate(String(r.at).slice(0, 10))}</td></tr>`)}</tbody></table>`
        : html`<p class="muted">${t("vt.res.none")}</p>`);
    };
    $$(".vtp-palm-seg button", dlg).forEach((b) => b.addEventListener("click", () => { cur = b.dataset.c; drawTop(); }));
    drawTop();
  }

  // ---- Résultats ---------------------------------------------------------------------------------------------------------
  async function results(el) {
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    const [list, all] = await Promise.all([races(), allRuns()]);
    if (!list.length) { el.innerHTML = html`<div class="card"><div class="empty">${t("vt.noMaps")}</div></div>`; return; }
    if (!list.some((r) => r.id === sel.race)) sel.race = list[0].id;
    const drawIt = () => {
      const race = list.find((r) => r.id === sel.race);
      const runs = all.runs.filter((r) => r.race === race.id);
      // the circuits: each course of the map as a training, and every (event, course, kind) a run names
      const circ = new Map();
      for (const c of race.race.courses) circ.set(`${race.id}||${c.id}|t`, { course: c.id, event: "", kind: "training" });
      for (const r of runs) { const k = all.circuitKey(r); if (!circ.has(k)) circ.set(k, { course: r.course, event: r.event || "", kind: r.kind }); }
      const keys = [...circ.keys()];
      let cur = keys.find((k) => circ.get(k).course === sel.course && (sel.event == null || circ.get(k).event === sel.event)) || keys[0];
      const ci = circ.get(cur), course = race.race.courses.find((c) => c.id === ci.course) || { id: ci.course, controls: [], length: 0 };
      const mine = runs.filter((r) => all.circuitKey(r) === cur);
      const firstOf = new Set();
      [...mine].sort((a, b) => a.at.localeCompare(b.at)).forEach((r) => { const k = r.u; if (!firstOf.has(k) && !r.help) firstOf.add(k), (r._first = true); });
      const ranked = mine.filter((r) => (ci.kind === "competition" ? r.why === "" : r._first)).sort((a, b) => a.t - b.t);
      const others = mine.filter((r) => !ranked.includes(r)).sort((a, b) => a.t - b.t);
      const best = ranked[0]?.t;
      ranked.forEach((r, i) => { r._place = i && r.t === ranked[i - 1].t ? ranked[i - 1]._place : i + 1; });
      el.innerHTML = html`
        <div class="vtp-pick"><div class="seg" role="group">${list.map((r) => html`<button type="button" data-race="${r.id}" aria-pressed="${r.id === race.id}">${mapName(r.id)}</button>`)}</div>
          <select id="vtp-circ" aria-label="${t("vt.res.circuit")}">${keys.map((k) => { const c = circ.get(k), co = race.race.courses.find((x) => x.id === c.course);
            return html`<option value="${k}" ${raw(k === cur ? "selected" : "")}>${co ? courseName(co) : c.course}${c.kind === "competition" ? ` · ${t("vt.kind.competition")}${c.event ? ` ${c.event}` : ""}` : ` · ${t("vt.kind.training")}`}</option>`; })}</select></div>
        <p class="muted vtp-cline">${swatch(course.id)} ${t("vt.res.line", { km: fmt((course.length || 0) / 1000, 1), climb: fmt(course.climb || 0), n: Math.max(0, course.controls.length - 2), runners: ranked.length })}
${ci.kind === "training" ? html` · <span class="tag">${t("vt.res.trainingTag")}</span>` : ""}</p>
        <div id="vtp-table"></div>
        ${others.length ? html`<h3 class="vtp-h3">${t("vt.res.others")}</h3><div id="vtp-others"></div>` : ""}
        <details class="vtp-how"><summary>${t("vt.how.title")}</summary>${raw(t("vt.how.body", { seed: fmt(3500), share: "90 %" }))}</details>`;
      const idxOf = (r) => all.runners.get(r.u)?.index;
      const cols = (place) => [
        { key: "place", label: t("vt.col.place"), align: "num", render: (r) => (place ? r._place : html`<span class="dim">${t(`vt.why.${r.why === "" ? "again" : r.why === "training" ? (r.help ? "help" : "again") : r.why}`)}</span>`), sort: (r) => (place ? r._place : null) },
        { key: "name", label: t("vt.col.runner"), render: (r) => html`${displayName(r.name)}${r.mine ? html` <span class="tag">${t("vt.me")}</span>` : ""}${r.mo && ci.kind === "training" ? html` <span class="tag vtp-motag" title="${t("vt.mo.label")}">${mapOptText(t, moOf(r.mo))}</span>` : ""}`, sort: (r) => r.name },
        { key: "time", label: t("vt.col.time"), align: "num", render: (r) => clock(r.t), sort: (r) => r.t },
        { key: "gap", label: t("vt.col.gap"), align: "num", render: (r) => gapClock(best != null ? r.t - best : null), sort: (r) => r.t },
        { key: "idx", label: subHead(t("vt.col.index"), t("vt.col.indexSub")), align: "num", render: (r) => (idxOf(r) ? fmt(idxOf(r)) : "—"), sort: (r) => idxOf(r) },
        { key: "score", label: t("vt.col.score"), align: "num", render: (r) => scoreCell(r.score, idxOf(r)), sort: (r) => (r.score && idxOf(r) ? r.score - idxOf(r) : null) },
        { key: "at", label: t("vt.col.date"), render: (r) => fmtDate(String(r.at).slice(0, 10)), sort: (r) => r.at },
        { key: "an", label: "", render: (r) => (r.mine ? html`<a href="#" data-an="${r.id}">${t("vt.res.analyse")}</a>` : "") },
      ];
      dataTable($("#vtp-table", el), { columns: cols(true), rows: ranked, sortKey: "place", sortDir: 1, rowClass: (r) => (r.mine ? "vtp-me" : ""),
        emptyText: t("vt.res.none"), compact: true });
      if (others.length) dataTable($("#vtp-others", el), { columns: cols(false), rows: others, sortKey: "time", sortDir: 1, rowClass: (r) => (r.mine ? "vtp-me" : ""), compact: true });
      $$(".vtp-pick [data-race]", el).forEach((b) => b.addEventListener("click", () => { sel.race = b.dataset.race; sel.course = null; sel.event = null; setQuery({ carte: sel.race, circuit: null }); drawIt(); }));
      $("#vtp-circ", el).addEventListener("change", (e) => { const c = circ.get(e.target.value); sel.course = c.course; sel.event = c.event; setQuery({ circuit: sel.course }); drawIt(); });
      el.addEventListener("click", (e) => { const a = e.target.closest("[data-an]"); if (!a) return; e.preventDefault(); sel.run = a.dataset.an; setQuery({ run: sel.run }); drawn.delete("analyse"); show("analyse"); });
    };
    drawIt();
  }

  // ---- Classement --------------------------------------------------------------------------------------------------------
  async function ranking(el) {
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    const all = await allRuns();
    const people = [...all.runners.values()];
    const ranked = people.filter((p) => !p.provisional).sort((a, b) => b.index - a.index);
    ranked.forEach((p, i) => { p._rank = i && p.index === ranked[i - 1].index ? ranked[i - 1]._rank : i + 1; });
    const waiting = people.filter((p) => p.provisional && p.counted > 0).length;
    const myU = all.runs.find((r) => r.mine)?.u;
    el.innerHTML = html`<p class="muted">${t("vt.rk.intro")}</p><div id="vtp-rk"></div>
      ${waiting ? html`<p class="muted">${tn("vt.rk.waiting", waiting)}</p>` : ""}
      <details class="vtp-how"><summary>${t("vt.how.title")}</summary>${raw(t("vt.how.body", { seed: fmt(3500), share: "90 %" }))}</details>`;
    dataTable($("#vtp-rk", el), {
      columns: [
        { key: "rank", label: t("vt.col.rank"), align: "num", render: (p) => p._rank, sort: (p) => p._rank },
        { key: "name", label: t("vt.col.runner"), render: (p) => html`${displayName(p.name)}${p.u === myU ? html` <span class="tag">${t("vt.me")}</span>` : ""}`, sort: (p) => p.name },
        { key: "idx", label: t("vt.col.index"), align: "num", render: (p) => fmt(p.index), sort: (p) => p.index },
        { key: "n", label: t("vt.col.counted"), align: "num", render: (p) => fmt(p.counted), sort: (p) => p.counted },
        { key: "seed", label: t("vt.col.seed"), align: "num", render: (p) => html`${fmt(p.seed)}${p.ownSeed ? "" : html` <span class="dim" title="${t("vt.rk.defaultSeed")}">*</span>`}`, sort: (p) => p.seed },
        { key: "last", label: t("vt.col.last"), render: (p) => fmtDate(String(p.last).slice(0, 10)), sort: (p) => p.last },
      ],
      rows: ranked, sortKey: "rank", sortDir: 1, rowClass: (p) => (p.u === myU ? "vtp-me" : ""), emptyText: t("vt.rk.none"), compact: true,
    });
  }

  // ---- Analyse -----------------------------------------------------------------------------------------------------------
  async function analysis(el) {
    el.innerHTML = html`<div class="boot"><div class="spinner"></div></div>`;
    const [list, all] = await Promise.all([races(), allRuns()]);
    const mineRuns = all.runs.filter((r) => r.mine).sort((a, b) => b.at.localeCompare(a.at));
    if (!mineRuns.length) { el.innerHTML = html`<div class="card"><div class="empty">${t("vt.an.none")}</div></div>`; return null; }
    const run = mineRuns.find((r) => r.id === sel.run) || mineRuns[0];
    sel.run = run.id;
    const race = list.find((r) => r.id === run.race), course = race?.race.courses.find((c) => c.id === run.course);
    if (!race || !course) { el.innerHTML = html`<div class="card"><div class="empty">${t("vt.an.gone")}</div></div>`; return null; }
    const mod = await import("./virtuallyan.js");
    return mod.drawAnalysis(el, { run, race, course, all, mineRuns, list, mapName, courseName, onRun: (id) => { sel.run = id; setQuery({ run: id }); draw("analyse"); } });
  }

  return { title: t("nav.virtually"), cleanup: () => { game?.stop(); stopAn?.(); stopOrga?.(); } };
}

