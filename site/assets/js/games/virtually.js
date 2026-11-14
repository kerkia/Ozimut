// « Virtually » (Coach › Virtually's Training tab, pages/virtually.js; a tab of « Jeux » on 2026-11-10; administrators only for
// now): a virtual race in a 3D forest built from a real
// orienteering map — after Catching Features and Virtual-O. The runner is seen from behind (or through their own eyes), the
// orienteering map with the course is in the bottom left corner with the compass beside it (owner, 2026-11-11), the runner's
// position hidden unless « Ma position » is pressed (10 s shown, 20 s added to the time), the runner's pace and the pause at
// the top right; the flags
// stand at the controls, lit up when within reach, punched with the space bar in the course's order; the finish gives the
// time, the splits and the route run drawn on the map. Each race is a package made offline (work's racebuild.py: the OCAD
// map, the worldwide relief, a national LiDAR where there is one) served by functions/api/virtual to administrators.
import { html, raw, $, pct } from "../util.js";
import { t, tn, loadArea, lang } from "../i18n.js";
import { THREE as THREE_URL } from "../vendor.js";
import { loadRace, World, runnerFigure } from "./vworld.js";
import { loadAvatar } from "./vavatar.js";
import { applyEnv, envOf, envText } from "./vweather.js";
import { mapOptOf, plainMap, imageMap, usable, mapOptText, moCode, MEM_R, MEM_S } from "./vmapopt.js";

await loadArea("virtually");

const BASE = "/api/virtual/";
const RUN = 3.7;                    // m/s on flat open ground (about 4:30 a km)
// The runner's speed (owner, 2026-11-14: « les flèches bas/haut contrôlent la vitesse ; le coureur garde sa vitesse si aucune
// touche n'est pressée ; de 0 à 3 par 0,5 »): a cruise level L set with ↑ / ↓ and kept, the runner going forward on their own.
// L is how many times faster than a real runner the play goes: over the ground L × the real speed (RUN × the ground's factor ×
// the slope's, a good club runner's), the race clock max(L, 1) × the wall clock. So from ×1 up every metre costs the same race
// time — a real runner's on that ground —, a higher level only shortens the play (less time to read the map on the way); ×0.5
// costs twice as much race time a metre (walking); standing still, the clock runs as the wall clock (real time spent reading).
// The best strategy is no longer the top speed. Measured on Autrans' six courses (2026-11-14, perfect routes on a 2 m grid with
// this model): violet long 71 race min, so 36 min of play at ×2 and 24 at ×3; violet middle 38 min, 19 at ×2.
const LEVELS = [0, 0.5, 1, 1.5, 2, 2.5, 3];
// The stamina of 2026-11-12 (the fast levels empty an energy bar, the slow ones fill it; empty, back to ×2): off for now (owner,
// 2026-11-14: « enlever le simulateur de perte d'énergie, au moins pour le moment »); true brings it back.
const STAMINA = false;
const VIEW_ICONS = [
  ["scene", '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 20 9 8l4 6 3-4 6 10Z" fill="currentColor"/><circle cx="17" cy="6" r="2" fill="currentColor"/></svg>'],
  ["map", '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2Z"/><path d="M9 4v14M15 6v14"/></svg>'],
  ["desc", '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="1"/><path d="M2.5 12h19M8 5v14M13 5v14M17.5 5v14"/></svg>'],
];
const DRAIN = { 2.5: 240, 3: 60 }, REFILL = { 0.5: 60, 1: 120, 1.5: 200, 2: 300, still: 90 }, REST = 0.1, TIRED = 2;
const REACH = 6;                    // m: a control within reach (its cue, the punch)
const PURPLE = "rgba(181, 23, 158, 0.9)";
const fmt = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; };
const num = (v, d = 1) => v.toLocaleString(lang(), { minimumFractionDigits: d, maximumFractionDigits: d });

/** A map's course: race.json's `courses` (six levels, tools/virtually/course.py), or the single `course` of before. */
export const coursesOf = (race) => race.courses || (race.course ? [{ id: "course", ...race.course }] : []);

// ---- the commands, before the start, at the pause and at any time of the race (« ? » or H; owner, 2026-11-12) ------------------
const touchScreen = () => matchMedia("(hover: none) and (pointer: coarse)").matches;
const KEYS = ["move", "turn", "strafe", "look", "punch", "map", "views", "sheet", "orient", "compline", "view", "help", "pause", "pos", "speed", ...(STAMINA ? ["energy"] : [])];
const TOUCH_KEYS = ["touch.move", "touch.look", "touch.punch", "touch.map", "touch.views", "touch.pause", "pos", "speed", ...(STAMINA ? ["energy"] : [])];
const keysHtml = () => html`<ul class="vt-keys">${(touchScreen() ? TOUCH_KEYS : KEYS).map((k) => html`<li>${t(`vt.keys.${k}`)}</li>`)}</ul>`;

/** The course's description sheet before the world is built (the briefing): the features' symbols, no direction read from a town. */
function briefSheet(course, title, cd) {
  const cs = course.controls, sym = (id) => (cd && id ? cd.symbol(id, "2018") : null);
  const cell = (id) => { const s = sym(id); return s ? html`<td title="${cd.name(s)}">${cd.svg(s, 40, "vt-cds")}</td>` : html`<td></td>`; };
  const fin = cs[cs.length - 1], before = cs[cs.length - 2], toFin = Math.round(Math.hypot(fin.x - before.x, fin.z - before.z) / 10) * 10;
  const finSym = sym("14.3");
  return html`<table class="vt-cd"><tbody>
    <tr class="vt-cdtitle"><td colspan="8">${title}</td></tr>
    <tr class="vt-cdtitle"><td colspan="4">${num((course.length || 0) / 1000)} km</td><td colspan="4">${course.climb ? `${Math.round(course.climb)} m` : ""}</td></tr>
    <tr class="vt-cdstart"><td>${sym("start") ? cd.svg(sym("start"), 40, "vt-cds") : "▷"}</td><td colspan="7"></td></tr>
    ${cs.slice(1, -1).map((c, i) => { const f = FEATURE_CD[c.feature] || [], words = c.feature ? t(`vt.f.${c.feature}`) : "";
      return html`<tr title="${words}"><td class="vt-cdn">${i + 1}</td><td class="vt-cdc">${c.code || ""}</td><td></td>${cd && f[0]
        ? html`${cell(f[0])}${cell(f[1])}${cell(f[2])}<td></td>` : html`<td colspan="4" class="vt-cdw">${words}</td>`}<td></td></tr>`; })}
    <tr class="vt-cdfin"><td colspan="8">${finSym ? html`<span class="vt-cdfinw">${cd.svg(finSym, 40, "vt-cds")}<b>${toFin} m</b></span>` : t("vt.sheet.finish")}</td></tr>
  </tbody></table>`;
}

/** The card before the start (owner, 2026-11-12: shown while the race loads): the course, its descriptions, the commands, « Partir »
 *  once everything is ready. `race`/`course` null while unknown, `sheet` null while the symbols load. */
function briefCard({ race, course, title, sheet, ready, env, mapOpt, msg = "", ghosts = 0, ghostsOther = 0 }) {
  const cond = envText(t, env), night = envOf(env).time === "night";
  return html`<div class="vt-card vt-brief"><h2>${title}</h2>
    ${cond ? html`<p class="vt-env"><b>${t("vt.env.label")}</b> ${cond}${night ? html`<br><span class="muted">${t("vt.env.nightRule")}</span>` : ""}</p>` : ""}
    ${moLine(mapOpt, race)}
    ${race && course ? html`<p>${t("vt.info", { n: course.controls.length - 2, km: num(course.length / 1000), scale: (race.scale || 0).toLocaleString(lang()) })}</p>
      <p class="muted">${t(`vt.src.${race.source}`, { authors: (race.photoAuthors || []).join(", ") || "—" })}</p>
      ${race.photoCredits?.length ? html`<details class="muted vt-photos"><summary>${t("vt.src.photos", { n: race.photoCredits.length })}</summary>
        <p>${race.photoCredits.map((c, i) => html`${i ? ", " : ""}<a href="${c.url}" target="_blank" rel="noopener">${c.id.slice(0, 8)}</a> (${c.author})`)}</p></details>` : ""}` : ""}
    ${ghostsLine(ghosts, ghostsOther)}
    <div class="vt-brief-cols">
      <section><h3>${t("vt.brief.cd")}</h3><div class="vt-bsheet" id="vt-bsheet">${sheet || html`<div class="spinner vt-spin"></div>`}</div></section>
      <section><h3>${t("vt.brief.keys")}</h3>${keysHtml()}</section>
    </div>
    <div class="vt-brief-go"><button type="button" class="btn btn-primary" id="vt-go" ${raw(ready ? "" : "disabled")}>${t("vt.go")}</button>
      <span class="vt-brief-msg">${ready ? "" : html`<span class="spinner vt-spin" id="vt-wait"></span>`}<span id="vt-msg">${msg}</span></span></div>
    ${race?.std ? html`<p class="muted vt-credit">${t("vt.credit", { std: race.std })}</p>` : ""}</div>`;
}

/** The briefing's line on the map options (games/vmapopt.js): what the map shows, the rule of « map at the controls only », and
 *  what this map cannot leave out (a race from the LiDAR alone: its map is an image, without symbols). */
function moLine(o, race) {
  const v = mapOptOf(o);
  if (plainMap(v)) return "";
  const u = usable(v, race), lost = race && imageMap(race) && v.layer !== "full";
  return html`<p class="vt-mo"><b>${t("vt.mo.label")}</b> ${mapOptText(t, u) || t("vt.mo.l.full")}
    ${u.memory ? html`<br><span class="muted">${t("vt.mo.memRule", { m: MEM_R, s: MEM_S })}</span>` : ""}
    ${lost ? html`<br><span class="muted">${t("vt.mo.noLayer", { layer: t(`vt.mo.l.${v.layer}`) })}</span>` : ""}</p>`;
}

/** The briefing's line on the ghosts running with one: how many, and where they show. */
const ghostsLine = (n, other = 0) => (n ? html`<p class="vt-gh-brief">${tn("vt.gh.brief", n)}${other ? html` ${tn("vt.gh.briefOther", other)}` : ""}</p>` : "");

/**
 * Mount the game for map `raceId` in `root` (Coach › Virtually's Training tab); returns { stop }.
 * opts: course (its id), title (the course's name as the page writes it), onFinish(run) once the finish is punched —
 * run { course, t (the race time, « Ma position »'s penalties included), sp (cumulative splits, s, the same), d (m run),
 * route [[t, x, z]] (the clock's time) } —, onNav("results" | "analysis") the finish card's buttons, navs those offered (both by default); base the package's address
 * when it is not a built-in map's (an event's: /api/virtual/events/<id>/pkg/); race the map's race.json as the page's list has it
 * (the briefing shows the course and its descriptions while the package loads); ghosts (owner, 2026-11-12: training only) a list,
 * or a promise of one, of runs replayed beside the runner — { name, t (race time), route [[t, x, z]], mine } —, translucent, named,
 * never in the way, on the map only while « Ma position » shows (and on the finish's map), their times on the finish card;
 * env an event's conditions { weather, time, lamp } (games/vweather.js; none: a clear day); map the map options { layer, memory }
 * (games/vmapopt.js; none: the whole map) — the run given to onFinish carries them as `mo`.
 * load (an invented terrain, games/vgenpack.js) a function giving the package's data as loadRace does, instead of fetching it.
 */
export function mount(root, raceId, opts = {}) {
  let stopped = false, raf = 0, cleanup = [];
  // the briefing at once, over the game's dark box: the course, its descriptions, the commands; « Partir » once all is loaded
  const courseIn = (r) => { const cs = coursesOf(r || {}); return cs.find((c) => c.id === opts.course) || cs[0] || null; };
  const brief = { race: opts.race || null, course: courseIn(opts.race), sheet: null, env: opts.env || null, mapOpt: mapOptOf(opts.map) };
  brief.title = opts.title || brief.course?.name || raceId;
  root.innerHTML = html`<div class="vt" tabindex="0" data-view="scene"><div class="vt-over" id="vt-over">${briefCard({ ...brief, msg: t("vt.loading") })}</div></div>`;
  const say = (k, v) => { const m = $("#vt-msg", root); if (m) m.textContent = t(k, v); };
  const cdLoaded = loadDescriptions();
  const fillSheet = async () => {
    if (!brief.course) return;
    const cd = await cdLoaded;
    if (stopped || brief.sheet) return;
    brief.sheet = briefSheet(brief.course, brief.title, cd);
    const el = $("#vt-bsheet", root); if (el) el.innerHTML = String(brief.sheet);
  };
  fillSheet();
  (async () => {
    try {
      const [THREE, data, cd, ghostRuns] = await Promise.all([import(THREE_URL), (opts.load ? opts.load() : loadRace(opts.base || `${BASE}${raceId}/`)), cdLoaded,
        Promise.resolve(opts.ghosts || []).catch(() => [])]);
      data.cd = cd;
      if (stopped) return;
      if (!brief.course) { brief.race = data.race; brief.course = courseIn(data.race); fillSheet(); }
      say("vt.drawingMap");
      const mapImg = await drawMap(data, usable(brief.mapOpt, data.race).layer);
      if (stopped) return;
      say("vt.preparing");
      await new Promise((r) => setTimeout(r, 60));   // the message shown before the world is built (no animation frame: a hidden tab has none)
      if (stopped) return;
      cleanup = start(root, THREE, data, mapImg, raceId, ghostRuns);
    } catch (e) {
      console.error(e);
      root.innerHTML = html`<div class="empty">${t(e.status === 404 ? "vt.noData" : e.status === 403 ? "vt.forbidden" : "vt.error")}<br><span class="muted">${String(e.message || e)}</span></div>`;
    }
  })();
  return { stop: () => { stopped = true; cancelAnimationFrame(raf); cleanup.forEach((f) => f()); } };

  // ---- the game ----------------------------------------------------------------------------------------------------------
  function start(root, T, data, mapImg, raceId, ghostRuns = []) {
    const race = data.race, cs = coursesOf(race), C0 = cs.find((c) => c.id === opts.course) || cs[0];
    race.course = { ...C0, name: opts.title || C0.name || race.id };
    const course = race.course.controls, nC = course.length - 2;
    $("#vt-over", root).insertAdjacentHTML("beforebegin", String(html`
      <canvas class="vt-view"></canvas>
      <div class="vt-hud"><b>${race.course.name}</b><span id="vt-time">0:00</span><span id="vt-pen" hidden></span><span id="vt-next"></span></div>
      <div class="vt-cue" id="vt-cue" hidden></div>
      <div class="vt-toast" id="vt-toast" hidden></div>
      <div class="vt-topbar">
        <span class="vt-views" role="group">${VIEW_ICONS.map(([v, svg]) => html`<button type="button" class="btn${v === "scene" ? " on" : ""}" data-view="${v}" title="${t(`vt.view.${v}`)}" aria-label="${t(`vt.view.${v}`)}">${raw(svg)}</button>`)}</span>
        <button type="button" class="btn" id="vt-pos" title="${t("vt.pos.tip")}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg><span class="vt-lbl" id="vt-poslbl">${t("vt.pos.btn")}</span></button>
        <span class="vt-pace"><button type="button" class="btn" id="vt-slower" title="${t("vt.pace.slower")}" aria-label="${t("vt.pace.slower")}">−</button><button type="button" class="btn" id="vt-speed" title="${t("vt.speed.tip")}"><span id="vt-pacelbl">×0</span><span class="vt-energy" aria-hidden="true" ${raw(STAMINA ? "" : "hidden")}><i></i></span></button><button type="button" class="btn" id="vt-faster" title="${t("vt.pace.faster")}" aria-label="${t("vt.pace.faster")}">+</button></span>
        <button type="button" class="btn" id="vt-help" title="${t("vt.help.tip")}" aria-label="${t("vt.help.title")}" aria-expanded="false">?</button>
        <button type="button" class="btn" id="vt-pause" title="${t("vt.pause.tip")}" aria-label="${t("vt.pause")}"><span aria-hidden="true">❚❚</span><span class="vt-lbl">${t("vt.pause")}</span></button>
        <button type="button" class="btn" id="vt-full" aria-pressed="false" title="${t("vt.full")}" aria-label="${t("vt.full")}">⤢</button>
      </div>
      <canvas class="vt-compass" width="180" height="180" title="${t("vt.compass")}"></canvas>
      <div class="vt-map" data-size="small">
        <canvas class="vt-mapc"></canvas>
        <div class="vt-mapbar">
          <button type="button" data-z="1.5" title="${t("vt.map.zoomIn")}">+</button><button type="button" data-z="0.67" title="${t("vt.map.zoomOut")}">−</button>
          <button type="button" id="vt-mnext" title="${t("vt.map.next")}">◎</button><button type="button" id="vt-msize" title="${t("vt.map.size")}">⤢</button>
          <button type="button" id="vt-orun" class="vt-morient"></button><button type="button" id="vt-oleg" class="vt-morient"></button>
          <button type="button" id="vt-mrotl" title="${t("vt.map.rotL")}" aria-label="${t("vt.map.rotL")}">↺</button><button type="button" id="vt-mrotr" title="${t("vt.map.rotR")}" aria-label="${t("vt.map.rotR")}">↻</button>
          <button type="button" id="vt-mcomp" class="vt-mcomp" title="${t("vt.map.compline")}" aria-label="${t("vt.map.compline")}"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 13 13 3M13 3H8.5M13 3v4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button><button type="button" id="vt-onorth" class="vt-morient" hidden></button>
        </div>
      </div>
      <div class="vt-sheet" id="vt-sheet"></div>
      <div class="vt-pad" id="vt-pad">
        <button type="button" data-k="ArrowLeft">◀</button><button type="button" data-lv="1" class="vt-padlv" title="${t("vt.pace.faster")}">+</button><button type="button" data-k="ArrowRight">▶</button>
        <button type="button" data-k="Space" class="vt-padpunch">${t("vt.punchBtn")}</button><button type="button" data-lv="-1" class="vt-padlv" title="${t("vt.pace.slower")}">−</button><button type="button" data-k="View" id="vt-padview">${t("vt.mapBtn")}</button>
      </div>
      <button type="button" class="btn btn-primary vt-back" id="vt-back">${t("vt.backToRace")}</button>
      <div class="vt-help" id="vt-helpbox" hidden><div class="vt-help-h"><b>${t("vt.help.title")}</b>
        <button type="button" id="vt-helpx" title="${t("vt.help.close")}" aria-label="${t("vt.help.close")}">✕</button></div>${keysHtml()}</div>`));
    const box = $(".vt", root), view = $(".vt-view", root), comp = $(".vt-compass", root), mapEl = $(".vt-map", root), mapC = $(".vt-mapc", root);
    // ---- renderer and scene ----
    const renderer = new T.WebGLRenderer({ canvas: view, antialias: true });
    renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    const scene = new T.Scene(), B = race.biome || {};
    const fogC = new T.Color(B.fog || "#cfd6da");
    scene.background = new T.Color(B.sky || "#c8d6e2"); scene.fog = new T.Fog(fogC, 30, 220);
    const camera = new T.PerspectiveCamera(65, 1, 0.2, 320);
    scene.add(new T.HemisphereLight(0xe8eef4, 0x6a5a42, 1.85));
    const sun = new T.DirectionalLight(0xfff3e0, 1.45); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 240 });
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; scene.add(sun, sun.target);
    const SUN = new T.Vector3(...(B.sun || [-0.5, 0.6, 0.6])).normalize();
    const world = new World(T, data, scene, renderer);
    world.addCourse(course);
    const ENV = applyEnv(T, opts.env, { scene, renderer, world, sun, camera });   // an event's weather, dusk or night (games/vweather.js)
    // the runner in the avatar's costume for the race's discipline: a sprint map (ISSprOM, or 1:5000 and larger) the sprint's
    const sprint = /ISSprOM/i.test(race.std || "") || (race.scale && race.scale <= 5000);
    const me = runnerFigure(T, opts.avatar || loadAvatar(sprint ? "sprint" : "forest")); scene.add(me);
    // the ghosts: each run as a translucent runner in a colour of its own, its name above it; nothing in the world knows them
    // (no collision, no shadow), their place read on the race's clock from their route
    const ghosts = ghostRuns.filter((g) => g.route?.length > 1).map((g, i) => {
      const colour = GHOST_COLOURS[i % GHOST_COLOURS.length], fig = runnerFigure(T, { shirt: colour, shorts: "#3a3f47", socks: colour, shoes: "#f2f2f2" });
      fig.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.42; o.material.depthWrite = false; o.castShadow = false; } });
      const tag = nameTag(T, g.course ? `${g.name} · ${g.course}` : g.name, colour); tag.position.y = 2.15; fig.add(tag);   // another course's: named
      fig.visible = false; scene.add(fig);
      return { ...g, colour, fig };
    });
    brief.ghosts = ghosts.length;
    brief.ghostsOther = ghosts.filter((g) => g.course).length;
    if (ghosts.length && !$(".vt-gh-brief", root)) $(".vt-brief-cols", root)?.insertAdjacentHTML("beforebegin", String(ghostsLine(ghosts.length, brief.ghostsOther)));
    // ---- the runner's state ----
    // the runner starts at the far end of the start's taped corridor, facing the triangle (vworld corridor), else on the triangle
    const START = world.startPos || { x: course[0].x, z: course[0].z, yaw: 0 };
    const st = { phase: "ready", t: 0, x: START.x, z: START.z, yaw: START.yaw, pitch: -0.08, next: 1, splits: [], track: [], dist: 0,
      view: opts.view === "first" ? "first" : "third", level: 0, energy: 1, paceT: {}, speed: 0, lastTrack: -1, msgUntil: 0,
      posLeft: 0, posN: 0, pen: 0, legPen: [] };       // « Ma position »: seconds still shown (real time), presses, penalty seconds, per leg
    const total = () => st.t + st.pen;                // the race time: the clock and the penalties
    const keys = new Set();
    /* Turning, the runner and the map alike (owner, 2026-11-12: « much more granularity », « similar for the runner and the map »):
       a press (a key, a button, a wheel notch) turns TURN_STEP; held past HOLD_S it goes on, from 45° a second up to 110° after
       a second more (`turnRate`). Before: the runner 109° a second from the first instant, the map 15° a press. */
    const TURN_STEP = Math.PI / 60, HOLD_S = 0.3;
    const pressAt = new Map();
    const turnRate = (since) => { const h = (performance.now() - since) / 1000 - HOLD_S; return h < 0 ? 0 : (Math.min(110, 45 + 65 * h) * Math.PI) / 180; };
    const heldSince = (codes) => Math.min(...codes.filter((c) => keys.has(c)).map((c) => pressAt.get(c) ?? 0));
    const LEFT = ["ArrowLeft", "KeyA"], RIGHT = ["ArrowRight", "KeyD"], MAPL = ["Comma"], MAPR = ["Period"];
    const resize = () => { const w = box.clientWidth, h = box.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); applyView(); drawMapPanel(); };
    // The runner in the middle of the room the enlarged map leaves (owner, 2026-11-14: « quand on agrandit la carte le mec reste
    // centré, ça serait mieux qu'il soit au centre de l'espace qui reste »): the camera stays where it is, its picture shifted
    // sideways (a view offset: the projection's centre moved), so that what it looks at — the runner, or the way ahead in the
    // first-person view — stands in the middle of the width left free, at the runner's height, by the map, the compass and the
    // pad; eased over a few frames as the map grows or shrinks; none with the small or hidden map, in the map's view or at the finish.
    let viewOff = 0, viewTarget = 0;
    function applyView() {
      const w = box.clientWidth, h = box.clientHeight;
      if (Math.abs(viewOff) < 0.5 || !w || !h) camera.clearViewOffset(); else camera.setViewOffset(w, h, -viewOff, 0, w, h);
    }
    function measureFree() {
      viewTarget = 0;
      if (box.dataset.map !== "large" || box.dataset.view !== "scene" || st.phase === "done") return;
      const b = box.getBoundingClientRect(), y0 = b.top + b.height * 0.4, y1 = b.top + b.height * 0.9, cx = b.left + b.width / 2;
      let L = b.left, R = b.right;
      for (const el of [mapEl, comp, $("#vt-pad", root)]) {
        if (!el || el.offsetParent === null) continue;               // not shown
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom < y0 || r.top > y1) continue;         // above or below the runner
        if (r.left + r.width / 2 < cx) L = Math.max(L, r.right); else R = Math.min(R, r.left);
      }
      if (R > L + 80) viewTarget = (L + R) / 2 - cx;
    }
    const ro = new ResizeObserver(resize); ro.observe(box);
    // ---- the map panel ----
    const ppm = mapImg.ppm, mPer = ppm / race.k;                    // map canvas px per world metre
    const mv = { cx: course[0].x * mPer, cy: course[0].z * mPer, zoom: 1, drag: null, ang: 0, free: 0, spin: null };
    // The map's orientation (owner, 2026-11-14: « juste le mode d'orientation manuel »): turned by hand only — ↺ ↻ on the map's bar,
    // Shift + wheel or the right button, two fingers, , and . —, as a real map in the hand. Two one-shot buttons turn it once, the way
    // the runner faces or the current leg up, and cost ORIENT_S of blank map (the time it takes to set a map by the compass); north up
    // only at the start (no cost), where the map first lies along the start corridor. The north-up, leg-up and run-up modes of
    // 2026-11-11 are gone. North up at the finish.
    const orient = "free", ORIENT_S = 3, START_R = 60;
    let blankUntil = 0;
    /** The canvas's turn (radians, clockwise on screen); north up at the finish. */
    const mapAngle = () => (st.phase === "done" ? 0 : mv.free);
    /** A shift on the screen (px) as a shift on the map's canvas (its px), the turn undone. */
    const unturn = (dx, dy) => { const c = Math.cos(-mv.ang), s = Math.sin(-mv.ang); return [(dx * c - dy * s) / mv.zoom, (dx * s + dy * c) / mv.zoom]; };
    const barW = () => $(".vt-mapbar", root)?.offsetWidth || 0;   // the map's buttons along its right edge
    const fitZoom = (metres) => { mv.zoom = Math.max(0.05, mapEl.clientWidth / (metres * mPer)); };
    function drawMapPanel() {
      const w = mapEl.clientWidth, h = mapEl.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (!w || !h) return;
      if (mapC.width !== Math.round(w * dpr)) { mapC.width = Math.round(w * dpr); mapC.height = Math.round(h * dpr); }
      const g = mapC.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      if (blankUntil && performance.now() < blankUntil) {            // the map being set by the compass: a blank sheet
        g.fillStyle = "#e7e3d8"; g.fillRect(0, 0, w, h); g.fillStyle = "#555"; g.textAlign = "center"; g.textBaseline = "middle";
        const free = Math.max(80, w - barW() - 8), fs = Math.max(11, Math.min(15, free / 12));
        g.font = `bold ${fs}px Arial`;
        const lines = [];                                          // the words wrapped in the part the buttons leave
        for (const word of t("vt.map.orienting").split(" ")) {
          const l = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
          if (lines.length && g.measureText(l).width <= free - 12) lines[lines.length - 1] = l; else lines.push(word);
        }
        lines.forEach((l, i) => g.fillText(l, free / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 1.3));
        return;
      }
      if (!(memoShown = mapShown())) {                              // « map at the controls only »: a blank sheet between them
        g.fillStyle = "#e7e3d8"; g.fillRect(0, 0, w, h); g.fillStyle = "#555"; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = `bold ${Math.max(11, Math.min(15, w / 18))}px Arial`; g.fillText(t("vt.mo.hidden"), w / 2, h / 2 - 9);
        g.font = `${Math.max(10, Math.min(13, w / 22))}px Arial`; g.fillText(t("vt.mo.hiddenSub", { m: MEM_R }), w / 2, h / 2 + 10);
        return;
      }
      mv.ang = mapAngle(); mv.yaw = st.yaw;
      g.save(); g.translate(w / 2, h / 2); g.rotate(mv.ang); g.scale(mv.zoom, mv.zoom); g.translate(-mv.cx, -mv.cy);
      g.imageSmoothingQuality = "high"; g.drawImage(mapImg.canvas, 0, 0);
      overprint(g);
      for (const gh of ghosts) {                                     // the ghosts: only while one's position shows, and at the finish
        if (st.phase === "done") {
          g.strokeStyle = gh.colour; g.globalAlpha = 0.75; g.lineWidth = 1.6 / mv.zoom; g.beginPath();
          gh.route.forEach(([, x, z], i) => (i ? g.lineTo(x * mPer, z * mPer) : g.moveTo(x * mPer, z * mPer))); g.stroke(); g.globalAlpha = 1;
        } else if (st.posLeft > 0 && st.phase === "run") {
          const p = ghostAt(gh.route, st.t);
          g.fillStyle = gh.colour; g.strokeStyle = "#fff"; g.lineWidth = 1.5 / mv.zoom; g.beginPath(); g.arc(p[0] * mPer, p[1] * mPer, 4 / mv.zoom, 0, 7); g.fill(); g.stroke();
        }
      }
      if (st.phase === "done") {
        g.strokeStyle = "rgba(220, 30, 30, 0.9)"; g.lineWidth = 2.2 / mv.zoom; g.beginPath();
        st.track.forEach(([, x, z], i) => (i ? g.lineTo(x * mPer, z * mPer) : g.moveTo(x * mPer, z * mPer))); g.stroke();
      }
      if ((st.posLeft > 0 && st.phase === "run") || st.phase === "done") {
        // the runner: an arrow pointing the way they face (owner, 2026-11-14: a line ahead read as a tail, the wrong way round)
        const x = st.x * mPer, y = st.z * mPer, ux = Math.sin(st.yaw), uy = -Math.cos(st.yaw), k = 1 / mv.zoom;
        const tip = [x + ux * 13 * k, y + uy * 13 * k], back = [x - ux * 7 * k, y - uy * 7 * k], notch = [x - ux * 2 * k, y - uy * 2 * k];
        g.beginPath(); g.moveTo(...tip); g.lineTo(back[0] - uy * 8 * k, back[1] + ux * 8 * k); g.lineTo(...notch);
        g.lineTo(back[0] + uy * 8 * k, back[1] - ux * 8 * k); g.closePath();
        g.fillStyle = "#e01e1e"; g.strokeStyle = "#fff"; g.lineWidth = 1.6 * k; g.lineJoin = "round"; g.fill(); g.stroke();
      }
      g.restore();
      if (compLine && st.phase === "run") compassLine(g, w, h);
      if (mv.ang) {                                                    // a north arrow when the map is turned (over the compass in the map's view)
        g.save(); g.translate(20, box.dataset.view === "map" ? h - (comp.clientHeight || 96) - 44 : 22); g.rotate(mv.ang);
        g.fillStyle = "rgba(255, 255, 255, 0.85)"; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
        g.fillStyle = "#1f3b8a"; g.beginPath(); g.moveTo(0, -11); g.lineTo(5, 3); g.lineTo(0, 0); g.lineTo(-5, 3); g.closePath(); g.fill();
        g.rotate(-mv.ang); g.font = "bold 10px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(t("vt.card.N"), -Math.sin(mv.ang) * 6.5, Math.cos(mv.ang) * 6.5);
        g.restore();
      }
    }
    function overprint(g) { drawOverprint(g, course, mPer, ppm); }
    // The compass's line (owner, 2026-11-14: « la ligne de la boussole… ça permet aux autres manières d'orienter la carte d'être
    // utile »): a black line across the map panel through its middle in the direction the runner faces, as the compass laid on
    // the map gives it — never the runner's position: one pans the map to put the line where one thinks one is. Its arrow at a
    // third of the way toward the heading. Shown unless turned off (its button, or B; kept in this browser).
    let compLine = true;
    try { compLine = localStorage.getItem("ocn.vt.compline") !== "0"; } catch (e) { /* on */ }
    function compassLine(g, w, h) {
      const a = st.yaw + mv.ang, ux = Math.sin(a), uy = -Math.cos(a), cx = w / 2, cy = h / 2, R = Math.hypot(w, h);
      g.save(); g.lineCap = "round";
      g.strokeStyle = "rgba(255, 255, 255, 0.7)"; g.lineWidth = 3.4;
      g.beginPath(); g.moveTo(cx - ux * R, cy - uy * R); g.lineTo(cx + ux * R, cy + uy * R); g.stroke();
      g.strokeStyle = "#111"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx - ux * R, cy - uy * R); g.lineTo(cx + ux * R, cy + uy * R); g.stroke();
      const r = Math.min(w, h) * 0.33, tx = cx + ux * r, ty = cy + uy * r, s = 7;
      g.fillStyle = "#111"; g.beginPath(); g.moveTo(tx + ux * s, ty + uy * s);
      g.lineTo(tx - ux * s - uy * s * 0.75, ty - uy * s + ux * s * 0.75); g.lineTo(tx - ux * s + uy * s * 0.75, ty - uy * s - ux * s * 0.75); g.closePath(); g.fill();
      g.restore();
    }
    const showComp = () => { const b = $("#vt-mcomp", root); b.classList.toggle("on", compLine); b.setAttribute("aria-pressed", String(compLine)); };
    const toggleComp = () => {
      compLine = !compLine; showComp(); drawMapPanel();
      try { localStorage.setItem("ocn.vt.compline", compLine ? "1" : "0"); } catch (e) { /* not kept */ }
      toast(t(compLine ? "vt.map.complineOn" : "vt.map.complineOff"));
    };
    $("#vt-mcomp", root).addEventListener("click", () => { toggleComp(); box.focus(); });
    showComp();
    // « map at the controls only » (games/vmapopt.js): shown within MEM_R m of the last control punched (the start first), for MEM_S
    // s of race after a punch, while « Ma position » shows, and before the start and after the finish; never during a pause
    const memo = usable(brief.mapOpt, race).memory, layered = mapImg.canvas;
    let memoShown = true;
    const mapShown = () => {
      if (!memo || st.phase === "ready" || st.phase === "done" || st.posLeft > 0 || st.t - st.punchT < MEM_S) return true;
      const c = course[Math.max(0, st.next - 1)];
      return Math.hypot(c.x - st.x, c.z - st.z) < MEM_R;
    };
    // ---- the control descriptions (owner, 2026-11-12): an IOF sheet at the bottom right — the next control's line, every line once
    // opened (its bar, a click on it, or C) —, and the whole screen's in the descriptions' view
    const cd = data.cd, sheet = $("#vt-sheet", root);
    let sheetOpen = false;
    const touch = matchMedia("(hover: none) and (pointer: coarse)").matches;
    try { sheetOpen = localStorage.getItem("ocn.vt.sheet") === "1"; } catch (e) { /* closed */ }
    const cdSym = (id) => cd && id ? cd.symbol(id, "2018") : null;
    function cdOf(c) {
      if (c.cd) return c.cd;
      const f = FEATURE_CD[c.feature] || [];
      let g = f[3] || null;
      if (g) { const side = sideOf(world.town, c.x, c.z, c.feature === "corner"); g = side ? g + side : null; }
      else if (c.foot) g = `11.14${c.foot}`;                      // a flag moved out of its rock: its foot's side (vworld footOf)
      return (c.cd = { d: f[0] || null, e: f[1] || null, f: f[2] || null, g });
    }
    const cell = (id) => { const s = cdSym(id); return s ? html`<td title="${cd.name(s)}">${cd.svg(s, 40, "vt-cds")}</td>` : html`<td></td>`; };
    function describe() {
      const last = course.length - 1, next = Math.min(st.next, last), lenKm = num((race.course.length || 0) / 1000);
      const open = sheetOpen && !touch;
      const fin = course[last], before = course[last - 1], toFin = Math.round(Math.hypot(fin.x - before.x, fin.z - before.z) / 10) * 10;
      const rows = course.slice(1, -1).map((c, i) => {
        const k = i + 1, s = cdOf(c), cls = k < st.next ? "done" : k === next ? "cur" : "";
        const words = c.feature ? t(`vt.f.${c.feature}`) : "";
        const tip = cd ? [s.d, s.e, s.f, s.g].map(cdSym).filter(Boolean).map((x) => cd.name(x)).join(" · ") || words : words;
        return html`<tr class="${cls}" title="${tip}"><td class="vt-cdn">${k}</td><td class="vt-cdc">${c.code || ""}</td><td></td>${cd && s.d
          ? html`${cell(s.d)}${cell(s.e)}${cell(s.f)}${cell(s.g)}` : html`<td colspan="4" class="vt-cdw">${words}</td>`}<td></td></tr>`;
      });
      const finSym = cdSym("14.3");
      const climb = race.course.climb ? `${Math.round(race.course.climb)} m` : "";
      sheet.innerHTML = html`<div class="vt-sheet-h"><span>${next >= last ? t("vt.sheet.finish") : t("vt.sheet.next", { n: next, of: nC })}</span>
        <button type="button" class="vt-sheet-tog" title="${t(open ? "vt.sheet.close" : touch ? "vt.view.desc" : "vt.sheet.open")}" aria-label="${t(open ? "vt.sheet.close" : touch ? "vt.view.desc" : "vt.sheet.open")}">${open ? "▾" : "▴"}</button></div>
        <table class="vt-cd"><tbody>
          <tr class="vt-cdtitle"><td colspan="8">${race.course.name}</td></tr>
          <tr class="vt-cdtitle"><td colspan="4">${lenKm} km</td><td colspan="4">${climb}</td></tr>
          <tr class="vt-cdstart"><td>${cdSym("start") ? cd.svg(cdSym("start"), 40, "vt-cds") : "▷"}</td><td colspan="7"></td></tr>
          ${rows}
          <tr class="vt-cdfin ${next >= last ? "cur" : ""}"><td colspan="8">${finSym ? html`<span class="vt-cdfinw">${cd.svg(finSym, 40, "vt-cds")}<b>${toFin} m</b></span>` : t("vt.sheet.finish")}</td></tr>
        </tbody></table>
        <button type="button" class="btn btn-primary vt-sheet-back">${t("vt.backToRace")}</button>`;
      sheet.classList.toggle("open", open);
    }
    const toggleSheet = () => {
      sheetOpen = !sheetOpen;
      try { localStorage.setItem("ocn.vt.sheet", sheetOpen ? "1" : "0"); } catch (e) { /* kept for the visit */ }
      describe();
    };
    // on a touch screen a tap on it opens the descriptions' view: a phone has no room for the whole sheet over the scene
    sheet.addEventListener("click", (e) => {
      if (e.target.closest(".vt-sheet-back")) setView("scene");      // the descriptions' view: back to the race (owner, 2026-11-12)
      else if (box.dataset.view !== "desc") (touch ? setView("desc") : toggleSheet());
      box.focus();
    });
    describe();
    // ---- what fills the screen (owner, 2026-11-12: « toggle very fast between the scene, the map and the descriptions »): the switch
    // at the top, Tab, the pad's map button, a tap on the small map ----
    const VIEWS = ["scene", "map", "desc"];
    // the map's and the descriptions' views say how to go back (owner, 2026-11-12: on a phone it was not clear): « Retour à la
    // course » on them, and the pad's « Carte » says « Retour » while either fills the screen
    function setView(v) {
      box.dataset.view = v;
      $$$(root, ".vt-views button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
      const pv = $("#vt-padview", root); if (pv) pv.textContent = t(v === "scene" ? "vt.mapBtn" : "vt.padBack");
      requestAnimationFrame(drawMapPanel);
    }
    $("#vt-back", root).addEventListener("click", () => { setView("scene"); box.focus(); });
    $$$(root, ".vt-views button").forEach((b) => b.addEventListener("click", () => {
      setView(b.dataset.view !== "scene" && box.dataset.view === b.dataset.view ? "scene" : b.dataset.view); box.focus();
    }));
    // sizes: small and large in the bottom left corner, the compass beside it (app.css), hidden, and « full » at the finish
    const mapSize = (s) => { mapEl.dataset.size = s; box.dataset.map = s; requestAnimationFrame(drawMapPanel); };
    $$$(root, ".vt-mapbar [data-z]").forEach((b) => b.addEventListener("click", () => { mv.zoom *= +b.dataset.z; drawMapPanel(); }));
    // ◎ frames the leg being run, its two controls whole (owner, 2026-11-14: « le bon niveau de zoom, pas que la direction »); pressed
    // again within 4 s, the next leg, then the current one again
    let legShown = { at: 0, k: 0 };
    function frameLeg(k) {
      const last = course.length - 1, i = Math.max(1, Math.min(k, last)), a = course[i - 1], b = course[i];
      // in the part of the panel the buttons leave free
      const W = mapEl.clientWidth || 300, bw = barW(), w = Math.max(60, W - bw), h = mapEl.clientHeight || 300;
      const ang = mapAngle(), c = Math.cos(ang), sn = Math.sin(ang);
      const dx = (b.x - a.x) * mPer, dy = (b.z - a.z) * mPer, rx = Math.abs(dx * c - dy * sn), ry = Math.abs(dx * sn + dy * c);
      const r = 4 * ppm, pad = 18;                                    // a control circle's radius on the canvas, and a margin
      mv.zoom = Math.max(0.05, Math.min((w - 2 * pad) / (rx + 2 * r), (h - 2 * pad) / (ry + 2 * r), 3));
      // the leg's middle at the free part's centre, -bw/2 from the canvas's: undo the turn and the zoom of that shift
      const ox = -bw / 2, ux = (ox * c) / mv.zoom, uy = (-ox * sn) / mv.zoom;
      mv.cx = ((a.x + b.x) / 2) * mPer - ux; mv.cy = ((a.z + b.z) / 2) * mPer - uy;
      legShown = { at: performance.now(), k: i };
      drawMapPanel();
    }
    const showLeg = () => {
      const cur = Math.min(st.next, course.length - 1), again = performance.now() - legShown.at < 4000;
      frameLeg(again && legShown.k === cur && cur < course.length - 1 ? cur + 1 : cur);
    };
    $("#vt-mnext", root).addEventListener("click", () => { showLeg(); box.focus(); });
    $("#vt-msize", root).addEventListener("click", () => { const big = st.phase === "done" ? "full" : "large"; mapSize(mapEl.dataset.size === big ? "small" : big); });
    const turning = () => st.phase !== "done";
    const turnBy = (d) => { if (!turning()) return; mv.free += d; drawMapPanel(); };

    const ptrs = new Map();
    let tap = null, twist = null;
    const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]), distOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    mapC.addEventListener("contextmenu", (e) => e.preventDefault());
    mapC.addEventListener("pointerdown", (e) => {
      mapC.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        twist = { ang: angOf(a, b), dist: distOf(a, b), zoom: mv.zoom, free: mv.free }; mv.drag = mv.spin = tap = null; return;
      }
      tap = { x: e.clientX, y: e.clientY, at: performance.now() };
      if ((e.button === 2 || e.shiftKey) && turning()) {
        const rc = mapC.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
        mv.spin = { cx, cy, a: Math.atan2(e.clientY - cy, e.clientX - cx), free: mv.free }; return;
      }
      mv.drag = [e.clientX, e.clientY, mv.cx, mv.cy];
    });
    mapC.addEventListener("pointermove", (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap = null;
      if (twist && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        mv.zoom = Math.max(0.05, (twist.zoom * distOf(a, b)) / Math.max(1, twist.dist));
        if (turning()) mv.free = twist.free + angOf(a, b) - twist.ang;
        drawMapPanel(); return;
      }
      if (mv.spin) { mv.free = mv.spin.free + Math.atan2(e.clientY - mv.spin.cy, e.clientX - mv.spin.cx) - mv.spin.a; drawMapPanel(); return; }
      if (!mv.drag) return;
      const [dx, dy] = unturn(e.clientX - mv.drag[0], e.clientY - mv.drag[1]); mv.cx = mv.drag[2] - dx; mv.cy = mv.drag[3] - dy; drawMapPanel();
    });
    const ptrUp = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) twist = null;
      if (tap && e.type === "pointerup" && performance.now() - tap.at < 400 && box.dataset.view === "scene" && st.phase === "run") setView("map");
      tap = null; mv.drag = null; mv.spin = null;
    };
    mapC.addEventListener("pointerup", ptrUp); mapC.addEventListener("pointercancel", ptrUp);
    mapC.addEventListener("wheel", (e) => { e.preventDefault();
      if (e.shiftKey && turning()) { turnBy(((e.deltaY || e.deltaX) < 0 ? -1 : 1) * TURN_STEP); return; }
      const f = e.deltaY < 0 ? 1.2 : 1 / 1.2, rc = mapC.getBoundingClientRect();
      const px = e.clientX - rc.left - rc.width / 2, py = e.clientY - rc.top - rc.height / 2;
      const [ux, uy] = unturn(px, py); mv.cx += ux - ux / f; mv.cy += uy - uy / f; mv.zoom *= f; drawMapPanel(); }, { passive: false });
    // the one-shot orientations (N at the start, O the way run, L the leg)
    const ORIENT_ICON = {
      north: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 17 15 12 12 7 15Z" fill="currentColor"/><text x="12" y="22.5" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor">N</text></svg>',
      leg: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="#f06ad8" stroke-width="2.2"><circle cx="12" cy="19" r="3.2"/><circle cx="12" cy="5" r="3.2"/><path d="M12 15.6V8.4"/></svg>',
      run: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3 18 19 12 15 6 19Z" fill="#ff5a4a"/></svg>',
      free: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3.5v4h-4"/></svg>',
    };
    for (const [id, dir] of [["#vt-mrotl", -1], ["#vt-mrotr", 1]]) {
      const b = $(id, root); let iv = 0;
      const stop = () => clearInterval(iv);
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); stop(); turnBy(dir * TURN_STEP); const t0 = performance.now(); let last = t0;
        iv = setInterval(() => { const n = performance.now(); turnBy((dir * turnRate(t0) * (n - last)) / 1000); last = n; }, 30); });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
    }
    const atStart = () => st.next === 1 && Math.hypot(st.x - course[0].x, st.z - course[0].z) < START_R;
    for (const [id, k] of [["#vt-onorth", "north"], ["#vt-orun", "run"], ["#vt-oleg", "leg"]]) {
      const b = $(id, root); b.innerHTML = ORIENT_ICON[k];
      b.title = t(`vt.map.orient.${k}`, { s: ORIENT_S }); b.setAttribute("aria-label", b.title);
      b.addEventListener("click", () => { orientOnce(k); box.focus(); });
    }
    const northBtn = $("#vt-onorth", root);
    let northShown = false;
    const showNorth = () => { const on = st.phase !== "done" && atStart(); if (on !== northShown) { northShown = on; northBtn.hidden = !on; } };
    /** Turn the map once: north up (the start only, free), the way the runner faces up or the leg up (ORIENT_S of blank map). */
    function orientOnce(k) {
      if (st.phase === "done") return;
      if (k === "north") {
        if (!atStart()) { toast(t("vt.map.orient.northOnly"), false); return; }
        mv.free = 0; drawMapPanel(); toast(t("vt.map.orient.set.north")); return;
      }
      if (st.phase !== "run") return;
      if (blankUntil && performance.now() < blankUntil) return;
      if (k === "run") mv.free = -st.yaw;
      else {
        const last = course.length - 1, a = course[Math.max(0, Math.min(st.next, last) - 1)], b = course[Math.min(st.next, last)];
        mv.free = a === b ? mv.free : -Math.atan2(b.x - a.x, -(b.z - a.z));
      }
      blankUntil = performance.now() + ORIENT_S * 1000;
      drawMapPanel(); toast(t(`vt.map.orient.set.${k}`, { s: ORIENT_S }));
    }
    // ---- the compass ----
    function drawCompass() {
      const g = comp.getContext("2d"), s = comp.width, c = s / 2, R = s * 0.42;
      g.clearRect(0, 0, s, s);
      g.fillStyle = "rgba(190, 220, 240, 0.35)"; g.strokeStyle = "rgba(20, 40, 60, 0.6)"; g.lineWidth = 2;
      g.beginPath(); g.roundRect(c - R * 0.55, 4, R * 1.1, s - 8, 12); g.fill(); g.stroke();                   // the baseplate
      g.strokeStyle = "rgba(200, 30, 30, 0.9)"; g.lineWidth = 3; g.beginPath(); g.moveTo(c, 6); g.lineTo(c, c - R - 2); g.stroke();   // direction of travel
      g.save(); g.translate(c, c); g.rotate(-st.yaw);                                                             // the dial turns with the world
      g.fillStyle = "rgba(255, 255, 255, 0.88)"; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.strokeStyle = "#333"; g.lineWidth = 1.5; g.stroke();
      for (let d = 0; d < 360; d += 10) {
        const a = (d * Math.PI) / 180, l = d % 90 === 0 ? 10 : d % 30 === 0 ? 7 : 4;
        g.beginPath(); g.moveTo(Math.sin(a) * R, -Math.cos(a) * R); g.lineTo(Math.sin(a) * (R - l), -Math.cos(a) * (R - l)); g.stroke();
      }
      g.fillStyle = "#222"; g.font = "bold 14px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
      [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(([l, d]) => { const a = (d * Math.PI) / 180; g.fillText(t(`vt.card.${l}`), Math.sin(a) * (R - 20), -Math.cos(a) * (R - 20)); });
      g.strokeStyle = "rgba(200, 30, 30, 0.5)"; g.lineWidth = 1; for (const dx of [-8, 8]) { g.beginPath(); g.moveTo(dx, -R + 14); g.lineTo(dx, R - 14); g.stroke(); }  // north lines
      g.fillStyle = "#d21f1f"; g.beginPath(); g.moveTo(0, -R + 12); g.lineTo(7, 0); g.lineTo(-7, 0); g.fill();                     // the needle: red end north
      g.fillStyle = "#f4f4f4"; g.strokeStyle = "#555"; g.beginPath(); g.moveTo(0, R - 12); g.lineTo(7, 0); g.lineTo(-7, 0); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = "#111"; g.font = "bold 13px Arial"; g.textAlign = "center";
      g.fillText(`${Math.round((((st.yaw * 180) / Math.PI) % 360 + 360) % 360)}°`, c, s - 12);
    }
    // ---- input ----
    const GAMEKEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space", "Tab", "Comma", "Period"]);
    const UP = ["ArrowUp", "KeyW", "KeyR"], DOWN = ["ArrowDown", "KeyS", "KeyF"];
    let lvAt = 0;
    /** A key or a pad button just pressed: its first step of turning, and when it was pressed. */
    const pressStep = (code) => {
      pressAt.set(code, performance.now());
      if (LEFT.includes(code)) st.yaw -= TURN_STEP;
      else if (RIGHT.includes(code)) st.yaw += TURN_STEP;
      else if (MAPL.includes(code)) turnBy(-TURN_STEP);
      else if (MAPR.includes(code)) turnBy(TURN_STEP);
    };
    const onKey = (e) => {
      if (!box.isConnected || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName)) return;
      if (e.type === "keydown") {
        if (e.code === "Escape" && !helpEl.hidden) { help(false); return; }
        if (e.code === "Escape" && st.phase === "run" && box.dataset.view !== "scene") { setView("scene"); return; }
        if (e.code === "Escape" && st.phase === "run") { pause(); return; }
        if (st.phase === "run" && GAMEKEYS.has(e.code)) e.preventDefault();
        // the cruise speed: ↑ / ↓ (W / S, Z / S on AZERTY; R / F too), held down it goes on a step every 0.15 s; 0 to 3 directly
        if (st.phase === "run" && (UP.includes(e.code) || DOWN.includes(e.code))) {
          const now = performance.now();
          if (!e.repeat || now - lvAt > 150) { lvAt = now; setLevel(UP.includes(e.code) ? 1 : -1); }
          return;
        }
        if (e.repeat) return;
        if ((e.code === "KeyH" || e.key === "?") && !e.ctrlKey && !e.metaKey && !e.altKey) { if (st.phase === "run") help(helpEl.hidden); return; }
        if (e.code === "Enter" && st.phase === "ready") { const go = $("#vt-go", root); if (go && !go.disabled) { e.preventDefault(); go.click(); } return; }
        if (st.phase === "run") pressStep(e.code);
        if (e.code === "Space" && st.phase === "run") punch();
        // M by its letter (owner, 2026-11-14: « M ça marche pas »: on an AZERTY keyboard M's key is « Semicolon », and KeyM is « , »)
        else if (e.key === "m" || e.key === "M") mapSize(mapEl.dataset.size === "small" ? "large" : mapEl.dataset.size === "large" ? "hidden" : "small");
        else if (e.code === "KeyO") orientOnce("run");
        else if (e.code === "KeyL") orientOnce("leg");
        else if (e.code === "KeyN") orientOnce("north");
        else if (e.code === "KeyB") toggleComp();
        else if (e.code === "Tab" && st.phase === "run") setView(VIEWS[(VIEWS.indexOf(box.dataset.view) + 1) % VIEWS.length]);
        else if (e.code === "KeyC") toggleSheet();
        else if (e.code === "KeyV") st.view = st.view === "third" ? "first" : "third";
        else if (/^(Digit|Numpad)[0-3]$/.test(e.code) && st.phase === "run") setLevel(0, +e.code.slice(-1));
        keys.add(e.code);
      } else keys.delete(e.code);
    };
    addEventListener("keydown", onKey); addEventListener("keyup", onKey);
    const onBlur = () => keys.clear(); addEventListener("blur", onBlur);
    const onVis = () => { if (document.hidden && st.phase === "run") pause(); };
    document.addEventListener("visibilitychange", onVis);
    let look = null;
    view.addEventListener("pointerdown", (e) => { look = [e.clientX, e.clientY, st.yaw, st.pitch]; view.setPointerCapture(e.pointerId); box.focus(); });
    view.addEventListener("pointermove", (e) => { if (!look) return; st.yaw = look[2] + (e.clientX - look[0]) * 0.006; st.pitch = Math.max(-0.7, Math.min(0.5, look[3] - (e.clientY - look[1]) * 0.004)); });
    view.addEventListener("pointerup", () => (look = null));
    $$$(root, "#vt-pad button").forEach((b) => {
      const k = b.dataset.k;
      if (b.dataset.lv) {                                   // + / −: the cruise speed, a step a tap
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); if (st.phase === "run") setLevel(+b.dataset.lv); });
        b.addEventListener("contextmenu", (e) => e.preventDefault());
        return;
      }
      // the finger held is captured, so that a thumb sliding off the button does not stop the runner
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* none */ }
        if (k === "Space") punch(); else if (k === "View") setView(box.dataset.view === "scene" ? "map" : "scene"); else { if (!keys.has(k)) pressStep(k); keys.add(k); } });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => keys.delete(k));
      b.addEventListener("contextmenu", (e) => e.preventDefault());
    });
    $("#vt-pause", root).addEventListener("click", () => (st.phase === "run" ? pause() : null));
    // full screen: the browser's own where it allows it, else the game fixed over the whole window (owner, 2026-11-12: the button did
    // nothing on a phone — an iPhone has no full screen but for videos); a touch screen enters it at « Partir ». Pressed while on, as
    // the site's other « ⤢ »; Échap or the button leaves it
    const fullBtn = $("#vt-full", root);
    const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
    const isFull = () => fsEl() === box || box.classList.contains("vt-fs");
    const onFs = () => {
      if (!fsEl()) { /* the browser's ended: nothing else to undo */ }
      const on = isFull(); fullBtn.setAttribute("aria-pressed", String(on)); fullBtn.textContent = on ? "⤡" : "⤢";
      fullBtn.title = t(on ? "vt.fullOff" : "vt.full"); fullBtn.setAttribute("aria-label", fullBtn.title);
      document.documentElement.classList.toggle("vt-fs-on", box.classList.contains("vt-fs"));
    };
    function full(on) {
      if (!on) { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {}); box.classList.remove("vt-fs"); onFs(); return; }
      const req = box.requestFullscreen || box.webkitRequestFullscreen;
      let p = null;
      try { p = req ? req.call(box, { navigationUI: "hide" }) : null; } catch (e) { p = null; }
      const fallback = () => { if (fsEl() !== box) { box.classList.add("vt-fs"); onFs(); } };
      if (p?.then) { p.then(onFs, fallback); setTimeout(fallback, 600); }   // a request refused, or never answered
      else fallback();
      box.focus();
    }
    fullBtn.addEventListener("click", () => full(!isFull()));
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);
    const helpEl = $("#vt-helpbox", root), helpBtn = $("#vt-help", root);
    const help = (on) => { helpEl.hidden = !on; helpBtn.classList.toggle("on", on); helpBtn.setAttribute("aria-expanded", String(on)); box.focus(); };
    helpBtn.addEventListener("click", () => help(helpEl.hidden));
    $("#vt-helpx", root).addEventListener("click", () => help(false));
    // the cruise speed, changed during the race: − and + (↓ ↑, W S, F R, 0 to 3); the button itself goes up, then round to 0
    const speedBtn = $("#vt-speed", root), paceLbl = $("#vt-pacelbl", root), bar = $(".vt-energy i", root);
    const paceText = (p) => `×${p.toLocaleString(lang())}`;
    const showSpeed = () => { paceLbl.textContent = paceText(st.level); speedBtn.classList.toggle("on", st.level > 2); speedBtn.classList.toggle("slow", st.level < 1); };
    let barShown = -1;
    const showEnergy = () => {
      const e = Math.round(st.energy * 100);
      if (e === barShown) return;
      barShown = e; bar.style.width = `${e}%`; bar.dataset.level = e < 20 ? "low" : e < 50 ? "mid" : "high";
    };
    function setLevel(d, to) {
      const i = LEVELS.indexOf(st.level);
      const p = to ?? (d === "cycle" ? LEVELS[(i + 1) % LEVELS.length] : LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + d))]);
      if (p === st.level) return;
      if (STAMINA && p > TIRED && st.energy < REST) { toast(t("vt.pace.rest"), false); return; }
      st.level = p; showSpeed();
      toast(p ? t("vt.level.set", { x: paceText(p) }) : t("vt.level.stop"));
    }
    speedBtn.addEventListener("click", () => { setLevel("cycle"); box.focus(); });
    $("#vt-slower", root).addEventListener("click", () => { setLevel(-1); box.focus(); });
    $("#vt-faster", root).addEventListener("click", () => { setLevel(+1); box.focus(); });
    // « Ma position »: the runner shown on the map for POS_S seconds of play, POS_PEN seconds added to the race time
    const POS_S = 10, POS_PEN = 30;   // 20 s until 2026-11-14 (owner: « la pénalité doit être plus grande »)
    const posBtn = $("#vt-pos", root), posLbl = $("#vt-poslbl", root);
    let posShown = -1;
    const showPosBtn = () => {
      const s = Math.ceil(st.posLeft);
      if (s === posShown) return;
      posShown = s; posBtn.classList.toggle("on", s > 0); posBtn.disabled = s > 0;
      posLbl.textContent = s > 0 ? t("vt.pos.left", { s }) : t("vt.pos.btn");
    };
    posBtn.addEventListener("click", () => {
      box.focus();
      if (st.phase !== "run" || st.posLeft > 0) return;
      st.posLeft = POS_S; st.posN++; st.pen += POS_PEN; st.legPen[st.next - 1] = (st.legPen[st.next - 1] || 0) + POS_PEN;
      if (mapEl.dataset.size === "hidden") mapSize("small");
      const c = [st.x * mPer, st.z * mPer], w = mapEl.clientWidth / 2, h = mapEl.clientHeight / 2;
      const ox = (c[0] - mv.cx) * mv.zoom, oy = (c[1] - mv.cy) * mv.zoom, a = mapAngle();
      const sx = ox * Math.cos(a) - oy * Math.sin(a), sy = ox * Math.sin(a) + oy * Math.cos(a);
      if (Math.abs(sx) > w * 0.8 || Math.abs(sy) > h * 0.8) { mv.cx = c[0]; mv.cy = c[1]; }   // brought into view
      showPosBtn(); drawMapPanel(); toast(t("vt.pos.used"), false);
    });
    // ---- messages and overlays ----
    const toast = (msg, ok = true) => { const e = $("#vt-toast", root); e.textContent = msg; e.className = `vt-toast ${ok ? "ok" : "bad"}`; e.hidden = false; st.msgUntil = performance.now() + 2600; };
    const over = (h) => { const o = $("#vt-over", root); o.innerHTML = h; o.hidden = !h; };
    // the briefing (mount's card, else drawn again after « Abandonner » or « Recommencer »): the race's own sheet, « Partir » enabled
    function startScreen() {
      brief.race = race; brief.course = race.course; brief.title = race.course.name;
      const full_ = $("table.vt-cd", sheet); if (full_) brief.sheet = raw(full_.outerHTML.replace(/ class="cur"/g, ""));
      let go = $("#vt-go", root);
      if (!go) { over(briefCard({ ...brief, ready: true })); go = $("#vt-go", root); }
      else {
        go.disabled = false; $("#vt-wait", root)?.remove(); $("#vt-msg", root).textContent = t("vt.brief.ready");
        const bs = $("#vt-bsheet", root); if (bs && brief.sheet) bs.innerHTML = String(brief.sheet);
      }
      go.addEventListener("click", () => {
        if (touchScreen() && !isFull()) full(true);
        st.phase = "run"; over(""); box.focus(); toast(t("vt.started"));
      });
      go.focus({ preventScroll: true });
    }
    function pause() {
      st.phase = "pause"; keys.clear(); help(false);
      over(html`<div class="vt-card"><h2>${t("vt.paused")}</h2><div class="vt-btns"><button type="button" class="btn btn-primary" id="vt-resume">${t("vt.resume")}</button>
        <button type="button" class="btn" id="vt-quit">${t("vt.quit")}</button></div>
        <h3 class="vt-pause-h">${t("vt.brief.keys")}</h3>${keysHtml()}</div>`);
      $("#vt-resume", root).addEventListener("click", () => { st.phase = "run"; over(""); box.focus(); });
      $("#vt-quit", root).addEventListener("click", () => { reset(); startScreen(); });
    }
    function reset() {
      if (mapImg.canvas !== layered) mapImg.canvas = layered;        // the finish drew the whole map
      Object.assign(st, { phase: "ready", t: 0, punchT: -1e9, x: START.x, z: START.z, yaw: START.yaw, next: 1, splits: [], track: [], dist: 0, lastTrack: -1,
        posLeft: 0, posN: 0, pen: 0, legPen: [], level: 0, energy: 1, paceT: {} });
      // the start corridor's way (the course's `startDir`, a heading as st.yaw, when the race has one), else toward the first control:
      // the runner faces it and the map lies along it (owner, 2026-11-14: « au départ carte orientée dans le sens du couloir de départ »)
      const s0 = course[0], c1 = course[1] || s0;
      st.yaw = Number.isFinite(C0.startDir) ? C0.startDir : Math.atan2(c1.x - s0.x, -(c1.z - s0.z));
      mv.free = -st.yaw; blankUntil = 0;
      showPosBtn(); showSpeed(); showEnergy(); setView("scene"); sheet.hidden = false; describe(); mapSize("small"); mv.cx = course[0].x * mPer; mv.cy = course[0].z * mPer; fitZoom(700); drawMapPanel(); showNorth();
    }
    function finished() {
      st.phase = "done"; keys.clear(); st.posLeft = 0; showPosBtn(); help(false);
      const legs = st.splits.map((s, i) => [s - (i ? st.splits[i - 1] : 0), s]);   // the splits hold the race time, penalties included
      const straight = race.course.length, T = total();
      const mo = usable(brief.mapOpt, race);
      opts.onFinish?.({ course: C0.id, t: T, sp: st.splits.slice(), d: st.dist, route: st.track.concat([[st.t, st.x, st.z]]), mo: moCode(mo) });
      if (mo.layer !== "full") drawMap(data).then((m) => { if (st.phase === "done") { mapImg.canvas = m.canvas; drawMapPanel(); } }).catch(() => {});  // the whole map to look back
      setView("scene"); sheet.hidden = true; mapSize("full");
      const all = st.track.map(([, x, z]) => [x, z]).concat(course.map((c) => [c.x, c.z])); const xs = all.map((p) => p[0]), zs = all.map((p) => p[1]);
      mv.cx = ((Math.min(...xs) + Math.max(...xs)) / 2) * mPer; mv.cy = ((Math.min(...zs) + Math.max(...zs)) / 2) * mPer;
      fitZoom((Math.max(...xs) - Math.min(...xs)) * 1.25 + 100);
      $("#vt-over", root).classList.add("side");
      over(html`<div class="vt-card vt-done"><h2>${t("vt.done")}</h2>
        <p class="vt-big">${fmt(T)}</p>
        ${st.posN ? html`<p class="vt-penline">${tn("vt.pen.done", st.posN, { s: st.pen })}</p>` : ""}
        ${mapOptText(t, mo) ? html`<p class="muted vt-mo-done">${t("vt.mo.done", { list: mapOptText(t, mo) })}</p>` : ""}
        <p>${t("vt.dist", { run: num(st.dist / 1000, 2), course: num(straight / 1000, 2) })}</p>
        ${paceLine()}
        <table class="data"><thead><tr><th>${t("vt.col.leg")}</th><th>${t("vt.col.code")}</th><th>${t("vt.col.split")}</th><th>${t("vt.col.total")}</th>${st.posN ? html`<th>${t("vt.col.pen")}</th>` : ""}</tr></thead>
        <tbody>${legs.map(([leg, tot], i) => html`<tr><td>${i + 1 <= nC ? i + 1 : t("vt.finish")}</td><td>${course[i + 1].code || ""}</td><td>${fmt(leg)}</td><td>${fmt(tot)}</td>${st.posN ? html`<td>${st.legPen[i] ? `+${st.legPen[i]} s` : ""}</td>` : ""}</tr>`)}</tbody></table>
        ${ghostTable(T)}
        <div class="vt-btns"><button type="button" class="btn btn-primary" id="vt-again">${t("vt.again")}</button>
          ${opts.onNav && (opts.navs || ["results"]).includes("results") ? html`<button type="button" class="btn" id="vt-to-res">${t("vt.toResults")}</button>` : ""}
          ${opts.onNav && (opts.navs || ["analysis"]).includes("analysis") ? html`<button type="button" class="btn" id="vt-to-an">${t("vt.toAnalysis")}</button>` : ""}</div>
        <p class="muted" id="vt-saved">${opts.onFinish ? t("vt.saving") : ""}</p></div>`);
      $("#vt-again", root).addEventListener("click", () => { $("#vt-over", root).classList.remove("side"); reset(); startScreen(); });
      $("#vt-to-res", root)?.addEventListener("click", () => opts.onNav("results"));
      $("#vt-to-an", root)?.addEventListener("click", () => opts.onNav("analysis"));
    }
    /** The ghosts' times against one's own, fastest first, for the finish card (the gap: theirs less one's own); the ghosts of the
     *  map's other courses below, under their own heading, their time on their course and no gap (another course, no comparison). */
    function ghostTable(T) {
      if (!ghosts.length) return "";
      const rows = ghosts.filter((g) => !g.course).map((g) => ({ name: g.name, t: g.t, colour: g.colour }))
        .concat([{ name: t("vt.gh.you"), t: T, me: true }]).sort((a, b) => a.t - b.t);
      const other = ghosts.filter((g) => g.course).sort((a, b) => a.t - b.t);
      const gap = (s) => { const r = Math.round(s); return r === 0 ? "±0:00" : `${r > 0 ? "+" : "−"}${fmt(Math.abs(r))}`; };
      const sw = (c) => html`<span class="vt-gh-sw" style="background:${c}"></span>`;
      return html`<h3 class="vt-gh-h">${t("vt.gh.done")}</h3><table class="data vt-gh-t"><thead><tr><th>${t("vt.col.runner")}</th><th>${t("vt.col.time")}</th>
        <th title="${t("vt.gh.gapTip")}">${t("vt.col.gap")}</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr class="${r.me ? "vt-gh-me" : ""}"><td>${r.me ? "" : sw(r.colour)}${r.name}</td>
          <td>${fmt(r.t)}</td><td>${r.me ? "" : gap(r.t - T)}</td></tr>`)}
        ${other.length ? html`<tr class="vt-gh-sub"><td colspan="3">${t("vt.gh.otherHead")}</td></tr>
          ${other.map((g) => html`<tr><td>${sw(g.colour)}${g.name} <span class="muted">· ${g.course}</span></td><td>${fmt(g.t)}</td>
            <td class="muted" title="${t("vt.gh.otherTip")}">—</td></tr>`)}` : ""}</tbody></table>`;
    }
    /** The share of the time spent moving at each pace, for the finish card. */
    function paceLine() {
      const all = Object.values(st.paceT).reduce((a, b) => a + b, 0);
      if (!all) return "";
      const parts = LEVELS.slice().reverse().filter((p) => st.paceT[p] / all >= 0.005).map((p) => `${p ? paceText(p) : t("vt.level.stopped")} ${pct(st.paceT[p] / all)}`);
      return html`<p class="muted">${t("vt.pace.done", { list: parts.join(" · ") })}</p>`;
    }
    function nearest() {
      let best = null;
      course.forEach((c, i) => { if (i === 0) return; const d = Math.hypot(c.x - st.x, c.z - st.z); if (d < REACH && (!best || d < best.d)) best = { i, d }; });
      return best;
    }
    function punch() {
      const n = nearest(); if (!n) return;
      const c = course[n.i], last = course.length - 1;
      if (n.i === st.next) {
        st.splits.push(total()); st.next++; st.punchT = st.t; describe(); beep(n.i === last ? 2 : 1);
        if (n.i === last) { finished(); return; }
        toast(t("vt.punched", { n: n.i, code: c.code }));
      } else if (n.i === last) toast(t("vt.finishNotYet", { n: last - st.next }), false);
      else if (n.i < st.next) toast(t("vt.already", { code: c.code }), false);
      else toast(t("vt.wrong", { code: c.code, n: st.next }), false);
    }
    let actx = null;
    function beep(kind) {
      try {
        actx ||= new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = kind === 2 ? 1320 : 2200; g.gain.value = 0.08;
        o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + (kind === 2 ? 0.5 : 0.12));
      } catch (e) { /* no sound */ }
    }
    // ---- the loop ----
    const MAX_FRAME = 0.25, SUB = 1 / 40;
    /** One sub-step of the race: `dt` seconds of real time (turning, the ground covered), `sdt` of race time (the clock). */
    function move(dt, sdt) {
      st.t += sdt;
      const tl = LEFT.some((c) => keys.has(c)), tr = RIGHT.some((c) => keys.has(c));
      if (tl !== tr) st.yaw += (tr ? 1 : -1) * turnRate(heldSince(tr ? RIGHT : LEFT)) * dt;
      const L = st.level;
      // a side step, held (A / E on AZERTY, Q / E on QWERTY), also while running on (owner, 2026-11-14: round a tree « quand Z est
      // appuyé »): at standstill at a walk's pace, while moving the way slants by up to 45°, the pace kept
      const side = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
      let v = 0;                                            // the ground covered a race second (the animation's speed)
      if (L > 0 || side) {
        const f = (world.terrainSpeed(st.x, st.z) || 0.3) * world.rough(st.x, st.z);
        const fw = L > 0 ? 1 : 0, sx = Math.sin(st.yaw) * fw + Math.cos(st.yaw) * side, sz = -Math.cos(st.yaw) * fw + Math.sin(st.yaw) * side;
        const ln = Math.hypot(sx, sz), dx0 = sx / ln, dz0 = sz / ln;
        const ahead = world.heightAt(st.x + dx0 * 2, st.z + dz0 * 2) - world.heightAt(st.x, st.z), grade = ahead / 2 / world.VX;   // the true grade (the 3D's relief is × VX)
        const slope = grade > 0 ? 1 / (1 + 7 * grade) : 1 / (1 + 2.5 * Math.max(0, -grade - 0.12));
        const d = RUN * f * slope * (L > 0 ? L : 0.5) * dt, nx = st.x + dx0 * d, nz = st.z + dz0 * d;   // a real runner's speed × L, over the wall clock
        const free = (x, z) => world.terrainSpeed(x, z) > 0 && !world.hits(x, z, 0.3);
        let moved = d;
        if (free(nx, nz)) { st.x = nx; st.z = nz; }
        else if (free(nx, st.z)) { moved = Math.abs(nx - st.x); st.x = nx; }
        else if (free(st.x, nz)) { moved = Math.abs(nz - st.z); st.z = nz; }
        else moved = 0;
        st.dist += moved;
        v = sdt > 0 ? moved / sdt : 0;
      }
      st.speed = v;
      // the stamina (STAMINA, off for now): the levels above TIRED empty it while moving, the others and the stops fill it
      if (STAMINA) {
        if (v > 0 && L > TIRED) {
          st.energy = Math.max(0, st.energy - sdt / DRAIN[L]);
          if (!st.energy) { st.level = TIRED; showSpeed(); toast(t("vt.pace.tired"), false); }
        } else st.energy = Math.min(1, st.energy + sdt / (v > 0 ? REFILL[L] : REFILL.still));
      }
      st.paceT[v > 0 ? L : 0] = (st.paceT[v > 0 ? L : 0] || 0) + sdt;
      if (st.t - st.lastTrack >= 1) { st.track.push([st.t, st.x, st.z]); st.lastTrack = st.t; }
    }
    let last = performance.now(), camPos = null, mapTick = 0, freeTick = 0;
    const step = (now) => {
      raf = requestAnimationFrame(step);
      // The game keeps real time whatever the frame rate (owner, 2026-11-11: « the speed does not seem to have changed »):
      // until then a frame counted 0.1 s at most, so under 10 fps the race ran slower than the clock. A frame now counts up to
      // MAX_FRAME s (a longer gap is a hiccup or a hidden tab), and the movement is done in sub-steps of SUB s of real time,
      // so that a fast frame at ×2 never jumps through a trunk.
      const dt = Math.min(MAX_FRAME, (now - last) / 1000); last = now;
      const run = st.phase === "run", sdt = dt * (run ? Math.max(1, st.level) : 1);   // the race clock: max(L, 1) × the wall clock
      if (run) {
        if (st.posLeft > 0) { st.posLeft = Math.max(0, st.posLeft - dt); showPosBtn(); if (!st.posLeft) drawMapPanel(); }
        const n = Math.max(1, Math.ceil(dt / SUB));
        for (let i = 0; i < n; i++) move(dt / n, sdt / n);
      }
      // the world around the runner
      world.update(st.x, st.z, dt < 0.03 ? 1 : 0);   // a chunk a frame at most, none when the frame was already slow
      const y = world.heightAt(st.x, st.z);
      me.position.set(st.x, y, st.z); me.rotation.y = -st.yaw + Math.PI; me.userData.animate(st.speed, sdt);
      me.visible = st.view === "third";
      for (const gh of ghosts) {
        const p = ghostAt(gh.route, st.t), q = ghostAt(gh.route, st.t + 1), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        gh.fig.position.set(p[0], world.heightAt(p[0], p[1]), p[1]);
        if (d > 0.05) gh.fig.rotation.y = -Math.atan2(q[0] - p[0], -(q[1] - p[1])) + Math.PI;
        gh.fig.userData.animate(st.phase === "run" ? d : 0, sdt);
        gh.fig.visible = Math.hypot(p[0] - st.x, p[1] - st.z) < 220;
      }
      const dx = Math.sin(st.yaw), dz = -Math.cos(st.yaw);
      let want;
      if (st.view === "first") want = new T.Vector3(st.x, y + 1.7, st.z);
      else { want = new T.Vector3(st.x - dx * 4.6, y + 2.5, st.z - dz * 4.6); want.y = Math.max(want.y, world.heightAt(want.x, want.z) + 1.2); }
      if (world.town && st.view === "third") { const f = world.town.clear(st.x, st.z, want.x, want.z); if (f < 1) { want.x = st.x + (want.x - st.x) * f; want.z = st.z + (want.z - st.z) * f; } }  // a town's walls: the camera stays in the street
      camPos = camPos && st.view === "third" ? camPos.lerp(want, Math.min(1, dt * 8)) : want.clone();
      camera.position.copy(camPos);
      const look = st.view === "first" ? 10 : 4;
      camera.lookAt(st.x + dx * look, y + (st.view === "first" ? 1.7 : 1.1) + Math.tan(st.pitch) * look, st.z + dz * look);
      sun.position.set(st.x + SUN.x * 120, y + SUN.y * 120, st.z + SUN.z * 120); sun.target.position.set(st.x, y, st.z);
      ENV?.update(now, st.x, y, st.z, st.yaw, st.pitch);
      // the controls' cues
      const n = nearest();
      course.forEach((c, i) => { if (i) world.cue(i, n && n.i === i ? 1 : Math.hypot(c.x - st.x, c.z - st.z) < 15 ? 0.25 : 0, now / 1000); });
      const cueEl = $("#vt-cue", root);
      if (n && st.phase === "run") {
        const c = course[n.i];
        cueEl.textContent = n.i === course.length - 1 ? t("vt.cueFinish") : t("vt.cue", { code: c.code });
        cueEl.hidden = false;
      } else cueEl.hidden = true;
      if (st.msgUntil && now > st.msgUntil) { $("#vt-toast", root).hidden = true; st.msgUntil = 0; }
      const ml = keys.has("Comma"), mr = keys.has("Period");
      if (run && ml !== mr) turnBy((mr ? 1 : -1) * turnRate(heldSince(mr ? MAPR : MAPL)) * dt);
      if (blankUntil && now >= blankUntil) { blankUntil = 0; drawMapPanel(); }
      if (freeTick % 15 === 0) showNorth();
      if (freeTick++ % 8 === 0) measureFree();
      if (viewTarget !== viewOff) {
        viewOff += (viewTarget - viewOff) * Math.min(1, dt * 6);
        if (Math.abs(viewTarget - viewOff) < 0.5) viewOff = viewTarget;
        applyView();
      }
      if (box.dataset.view !== "map") renderer.render(scene, camera);   // the map's view hides the scene: nothing to draw
      drawCompass();
      $("#vt-time", root).textContent = fmt(total());
      showEnergy();
      const penEl = $("#vt-pen", root); penEl.hidden = !st.pen; if (st.pen) penEl.textContent = t("vt.pen.hud", { s: st.pen });
      $("#vt-next", root).textContent = st.next >= course.length - 1 ? `→ ${t("vt.finish")}` : `→ ${st.next} (${course[st.next].code})`;
      if (memo && mapShown() !== memoShown) drawMapPanel();
      else if (st.posLeft > 0 && run && (mapTick++ % 6 === 0)) drawMapPanel();
      else if (mapEl.dataset.size !== "hidden") {
        const d = mapAngle() - mv.ang, dy = st.yaw - mv.yaw;        // the map turned, or the compass line with the runner
        if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > 0.004 || (compLine && Math.abs(Math.atan2(Math.sin(dy), Math.cos(dy))) > 0.004)) drawMapPanel();
      }
    };
    reset(); resize();
    window.vtDebug = { st, mv, course, world, ghosts };          // for support and scripted tests (the console)
    // build the chunks around the start before the first frame, then « Partir »
    while (world.update(st.x, st.z, 6) > 0) { /* all near chunks */ }
    startScreen();
    raf = requestAnimationFrame(step);
    return [() => { ro.disconnect(); removeEventListener("keydown", onKey); removeEventListener("keyup", onKey); removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis); document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs);
      if (document.fullscreenElement === box) document.exitFullscreen().catch(() => {}); document.documentElement.classList.remove("vt-fs-on");
      renderer.dispose(); renderer.forceContextLoss?.(); actx?.close?.(); }];
  }
}

const $$$ = (root, sel) => [...root.querySelectorAll(sel)];

// the ghosts' kit colours (their name tags and their marks on the map too)
const GHOST_COLOURS = ["#e8b21e", "#19a7a0", "#d64f9b", "#7a5cf0", "#4caf3c", "#e2703a"];
/** A route's place ([x, z]) at race time s, between its points; its first point before, its last after. */
function ghostAt(route, s) {
  if (s <= route[0][0]) return [route[0][1], route[0][2]];
  const n = route.length - 1;
  if (s >= route[n][0]) return [route[n][1], route[n][2]];
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (route[m][0] <= s) lo = m; else hi = m; }
  const [ta, xa, za] = route[lo], [tb, xb, zb] = route[hi], f = (s - ta) / (tb - ta || 1);
  return [xa + (xb - xa) * f, za + (zb - za) * f];
}
/** A name above a ghost: its own canvas, always facing the camera, readable through the leaves. */
function nameTag(T, text, colour) {
  const c = document.createElement("canvas"), g = c.getContext("2d"), font = "600 34px system-ui, sans-serif";
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 36;
  c.width = w; c.height = 56;
  g.font = font; g.fillStyle = "rgba(20, 24, 28, 0.62)"; g.beginPath(); g.roundRect(0, 4, w, 48, 24); g.fill();
  g.fillStyle = colour; g.beginPath(); g.arc(22, 28, 8, 0, 7); g.fill();
  g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(text, 36, 30);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(0.32 * w / 56, 0.32, 1); sp.renderOrder = 10;
  return sp;
}

/** Purple Pen's description symbols and their drawing (tracer/symbols.js, cdsymbol.js), or null: the sheet then says the words. */
async function loadDescriptions() {
  try {
    const [S, C] = await Promise.all([import("../tracer/symbols.js"), import("../cdsymbol.js")]);
    await S.loadSymbols();
    return { symbol: S.symbol, name: S.symbolName, svg: C.cdSymbolSvg };
  } catch (e) { console.warn("description symbols", e); return null; }
}

// A control's description from its feature (tools/virtually: course.py, course_sprint.py, filecourses.py): columns D, E, F, G
// as ISCD 2018 writes them (Purple Pen's ids); a G with a direction takes it from the town's buildings or walls round the flag
const FEATURE_CD = {
  boulder: ["2.4"], bigboulder: ["2.4"], cluster: ["2.6"], knoll: ["1.10"], eknoll: ["1.10"], mini: ["1.10"], depression: ["1.13"],
  pit: ["1.14"], rockpit: ["1.14", "8.6"], rockface: ["2.1"], cairn: ["5.17"], vegspec: ["6.1"], bigtree: ["4.9"], manmade: ["6.2"],
  tower: ["5.15"], waterhole: ["3.3"], cave: ["2.3"], landform: ["6.1"], junction: ["5.2", null, "10.2"], monument: ["5.20"],
  fountain: ["3.9"], bush: ["4.9"], stairs: ["5.24"], corner: ["5.11", null, null, "11.5"], wallend: ["5.8", null, null, "11.8"],
};
const SECTORS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** Which side of what blocks round (x, z) the flag stands on (a building's outside corner, a wall's end), or null. */
function sideOf(town, x, z, buildingsOnly) {
  if (!town) return null;
  let bx = 0, bz = 0, n = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8, sx = Math.sin(a), sz = -Math.cos(a);
    for (const r of [1.6, 2.6, 3.6]) if (town.hits(x + sx * r, z + sz * r, 0.15, buildingsOnly)) { bx += sx; bz += sz; n++; }
  }
  if (!n || Math.hypot(bx, bz) < 0.5) return null;
  const b = Math.atan2(-bx, bz);                                   // the bearing from what blocks to the flag (north 0, clockwise)
  return SECTORS[((Math.round(b / (Math.PI / 4)) % 8) + 8) % 8];
}

/** The course's overprint on a map canvas: `mPer` canvas px per world metre, `mm` canvas px per map mm (start triangle,
 *  numbered circles, the legs, the finish's double circle). Shared with Coach › Virtually's analysis. */
export function drawOverprint(g, course, mPer, mm) {
  const r = 3 * mm, lw = 0.35 * mm;
  g.strokeStyle = PURPLE; g.fillStyle = PURPLE; g.lineWidth = lw; g.lineCap = "round";
  const P = course.map((c) => [c.x * mPer, c.z * mPer]);
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, ay] = P[i], [bx, by] = P[i + 1], L = Math.hypot(bx - ax, by - ay);
    const ra = (i === 0 ? 4 * mm : r) + 0.5 * mm, rb = (i + 1 === P.length - 1 ? 3.6 * mm : r) + 0.5 * mm;
    if (L <= ra + rb) continue;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    g.beginPath(); g.moveTo(ax + ux * ra, ay + uy * ra); g.lineTo(bx - ux * rb, by - uy * rb); g.stroke();
  }
  P.forEach(([x, y], i) => {
    g.beginPath();
    if (i === 0) {
      const [nx, ny] = P[1], a = Math.atan2(ny - y, nx - x), s = 4 * mm;
      for (let k = 0; k < 3; k++) { const b = a + (k * 2 * Math.PI) / 3; k ? g.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s) : g.moveTo(x + Math.cos(b) * s, y + Math.sin(b) * s); }
      g.closePath(); g.stroke();
    } else if (i === P.length - 1) {
      g.arc(x, y, 2.4 * mm, 0, 7); g.stroke(); g.beginPath(); g.arc(x, y, 3.5 * mm, 0, 7); g.stroke();
    } else {
      g.arc(x, y, r, 0, 7); g.stroke();
      g.font = `${4 * mm}px Arial`; g.textBaseline = "middle"; g.fillText(String(i), x + r * 1.05, y - r * 1.05);
    }
  });
}

/** The orienteering map, drawn once from the OCAD file over the world's rectangle: { canvas, ppm }. The file's own course
 *  overprint (7xx symbols but the out-of-bounds 709) is left out; the game draws its course. `layer` one of the map options'
 *  (games/vmapopt.js: nopaths, noveg, relief, contours) leaves out its symbols too; a generated map (an image) is drawn whole. */
export async function drawMap(data, layer = "full") {
  if (data.mapImage) {                     // the generated map (a race from the LiDAR alone): its image over the world, mapPx m a pixel
    const c = document.createElement("canvas"); c.width = data.mapImage.width; c.height = data.mapImage.height;
    c.getContext("2d").drawImage(data.mapImage, 0, 0);
    return { canvas: c, ppm: data.race.k / data.race.mapPx };
  }
  const [{ readOcad }, { CanvasTarget }, { Matrix }] = await Promise.all([import("../tracer/vmap/ocad.js"), import("../tracer/vmap/target.js"), import("../tracer/vmap/geom.js")]);
  const { map } = readOcad(data.ocd);
  await map.ready;
  const r = data.race, wmm = r.W / r.k, hmm = r.H / r.k;
  const ppm = Math.min(12, 9000 / Math.max(wmm, hmm));
  const c = document.createElement("canvas"); c.width = Math.round(wmm * ppm); c.height = Math.round(hmm * ppm);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  const [X0, Y1] = r.mm0, l = X0, top = Y1, b = Y1 - hmm, rr = X0 + wmm;
  // the course's own symbols, and the mapper's helpers (900 and up: a boundary to confirm…), are not the race's map
  const skip = new Set(map.symdefs.map((d) => d.id).filter((id) => { const n = parseInt(id, 10); return (n >= 700 && n <= 799 && n !== 709) || n >= 900; }));
  if (layer !== "full") {
    const { presetSymbols } = await import("../tracer/vmap/presets.js");
    const syms = map.symdefs.filter((d) => d.kind !== "image" && d.id != null && d.id !== "").map((d) => ({ id: d.id, n: Math.floor(parseFloat(d.id)), kind: d.kind }));
    for (const id of presetSymbols(syms, layer)) skip.add(id);
  }
  map.draw(new CanvasTarget(g, new Matrix(ppm, 0, 0, -ppm, -l * ppm, top * ppm)), [l, b, rr, top], { minRes: 1 / ppm, hideSyms: skip });
  return { canvas: c, ppm };
}
