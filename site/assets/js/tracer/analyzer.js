// The Tracer's route analyzer (owner, 2026-11-16, after the OCAD study: « the main need »). For each leg of a course, the
// fastest route and its alternatives — computed by the route engine of the analyses (trace/routechoice.js, in its worker), on
// the event's map: an OCAD or Mapper map by its symbols (with the Tracer's table per symbol), any other by its colours; the
// setter's out-of-bounds areas and boundaries closed; the ground's heights from the event's elevation model (relief.js) —, and
// the routes the setter draws by hand (the route tool), measured on the same model and, if wished, laid on the map's paths.
// Everything is kept with the event (model.js: leg.route, the main route; leg.alts, the others; their length, climb and model
// time), so the whole team sees the same routes and nothing is computed twice.
//
// One panel (« Vérifier › Itinéraires »), docked over the map's right side: compute (the leg chosen, the course, every
// course), draw, the list of the routes leg by leg — show, hide, rename, delete, make one the main route —, the labels
// « length | climb | time » on the map, the course's figures along its main routes, « Appliquer au circuit » (the climb
// along the routes; the length along them: a sprint's ideal route), the report of every leg and course, an image.
// The times are the model's: minutes per km of white forest on the flat (the course's pace), slower or faster by the ground
// and the slope; they compare routes, they do not predict a winner (« Temps de course » does).

import * as M from "./model.js";
import { hasGeo } from "./geo.js";
import { modal, field, num, download, fileName } from "./dialogs.js";
import { ctrlName, csv } from "./reports.js";
import { svg } from "./icons.js";
import { where } from "./ribbon-data.js";
import { t, tn, locale } from "./lang.js";
import { bar, setBar } from "../waitbar.js";
import { pctN } from "../util.js";
import { rankedRoutes, paintRoutes, paceOf, timeOf, clock, isSprintEv, labelOf } from "./routedraw.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const OOB_AREAS = ["out-of-bounds", "dangerous-area"], NO_CROSS = ["boundary", "mtbo-forbidden-route"];
const MAX_PX = 5e6;
const SPEED_KEYS = ["track", "path", "small", "open", "rough", "g1", "g2", "g3", "marsh", "paved", "grey", "shallow", "slow1", "slow2", "slow3"];
const paceText = (p) => { const s = Math.round(p * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** « 5:30 », « 5,5 » or « 5.5 » → minutes per km. */
const readPace = (v) => { const s = String(v || "").trim(), m = /^(\d+)[:′'](\d{1,2})$/.exec(s); const x = m ? Number(m[1]) + Number(m[2]) / 60 : num(s); return x >= 2 && x <= 30 ? x : NaN; };

// ---- the legs of a course -----------------------------------------------------------------------------------------------------
/** The legs of a course (all its branches), each once, in the course's order: [[c1, c2]…]. */
export function legsOf(ev, courseId) {
  const out = [], seen = new Set();
  if (!courseId || M.isScore(ev, courseId)) return out;
  for (const l of M.enumLegs(ev, M.cdCourse(courseId))) {
    const a = ev.courseControls[l.cc1]?.control, b = ev.courseControls[l.cc2]?.control, k = `${a}:${b}`;
    if (!a || !b || a === b || seen.has(k)) continue;
    seen.add(k); out.push([a, b]);
  }
  return out;
}
const lineCourses = (ev) => M.courseIds(ev, false).filter((id) => ev.courses[id].kind !== "score");
/** A course's figures along its main routes — the steepest of its variations —: { straight (m), along (m, the main route of
 *  each leg, the leg itself where it has none), up, t (model seconds), legs, routed (legs with a route), measured }. */
export function courseFigures(ev, courseId) {
  const des = M.hasVariations(ev, courseId) ? M.allVariations(ev, courseId).slice(0, 24).map((x) => M.cdCourse(courseId, -1, x.path)) : [M.cdCourse(courseId)];
  let best = null;
  for (const cd of des) {
    const seq = M.ccIds(ev, cd).map((cc) => ev.courseControls[cc].control);
    const f = { straight: 0, along: 0, up: 0, t: 0, legs: 0, routed: 0, measured: 0 };
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i], b = seq[i + 1], st = M.legLengthM(ev, a, b), main = M.legRouteList(ev, a, b).find((r) => r.main);
      f.legs++; f.straight += st;
      if (main) { f.routed++; f.along += main.m?.len > 0 ? main.m.len : M.mmToM(ev, M.pathLength(main.pts)); if (main.m) { f.measured++; f.up += main.m.up || 0; f.t += main.m.t || 0; } }
      else f.along += st;
    }
    if (!best || f.along > best.along) best = f;
  }
  return best || { straight: 0, along: 0, up: 0, t: 0, legs: 0, routed: 0, measured: 0 };
}

// ---- the engine ---------------------------------------------------------------------------------------------------------------
/** The engine's settings for the event: the defaults, the event's own (ev.routing), never the device's (the team shares them). */
async function engineSettings(ev) {
  const { DEFAULTS } = await import("../trace/routechoice.js"), r = ev.routing || {};
  return { ...DEFAULTS, map: isSprintEv(ev) ? "sprint" : "forest", black: "auto", pace: 0, calib: false,
    risk: r.risk ?? DEFAULTS.risk, climb: r.climb ?? DEFAULTS.climb, variants: r.variants ?? 3, extra: r.extra ?? DEFAULTS.extra, cross: r.cross ?? DEFAULTS.cross,
    speeds: { ...DEFAULTS.speeds, ...(r.speeds || {}) } };
}
const plannerKey = (E, s) => JSON.stringify([E.ev.map.file, E.ev.map.scale, E.map?.kind, E.ev.routing?.table || null, s, E.ev.geo || null, E.relief?.at || 0]);
/**
 * The planner over the points P (map mm) — kept while the panel is open, made again when the map, the table per symbol, the
 * settings or the elevation model change, or when the points leave its frame. say(message, fraction).
 */
async function plannerFor(E, P, say) {
  const ev = E.ev, ra = (E.ra ||= {});
  const s = await engineSettings(ev), key = plannerKey(E, s);
  const cur = ra.planner;
  if (cur && cur.key === key && P.every(([x, y]) => x >= cur.box[0] + cur.pad && x <= cur.box[2] - cur.pad && y >= cur.box[1] + cur.pad && y <= cur.box[3] - cur.pad)) return cur;
  cur?.pl.destroy(); ra.planner = null;
  const sprint = isSprintEv(ev), scale = ev.map.scale || 10000, mPerMm = scale / 1000;
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const pad = Math.max((sprint ? 150 : 300) / mPerMm, 0.15 * span), mw = ev.map.w || 210, mh = ev.map.h || 297;
  const box = [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(mw, Math.max(...xs) + pad), Math.min(mh, Math.max(...ys) + pad)];
  const vector = E.map.kind === "vector" && !!E.map.vmap, imgK = E.map.pxW / mw;
  let k = mPerMm / (sprint ? 1.02 : 1.5);                                // a cell of about 1 m in sprint, 1.5 m in forest
  if (!vector && E.map.kind !== "pdf") k = Math.min(k, imgK);            // an image is read at its own resolution at most
  const area = (box[2] - box[0]) * (box[3] - box[1]) * k * k;
  if (area > MAX_PX) k *= Math.sqrt(MAX_PX / area);
  const W = Math.max(8, Math.round((box[2] - box[0]) * k)), H = Math.max(8, Math.round((box[3] - box[1]) * k));
  const px = ([x, y]) => [(x - box[0]) * k, (box[3] - y) * k], mm = ([a, b]) => [box[0] + a / k, box[3] - b / k];
  const toM = (a, b) => [(a / k) * mPerMm, (b / k) * mPerMm];
  const RP = await import("../trace/routeplan.js");
  say(t("trc.ra.stMap"), null);
  let pl;
  if (vector) {
    const { layers } = await import("../trace/vectorroutes.js");
    const src = E.map, T = { a: k, b: 0, c: -(src.ox + box[0]) * k, d: 0, e: -k, f: (box[3] + src.oy) * k };
    const L = layers({ map: src.vmap }, T, W, H, null, ev.routing?.table || null);
    L.w = W; L.h = H;
    pl = RP.planner({ width: W, height: H }, toM, { layers: L, name: ev.map.file || "" }, { map: s.map });
  } else {
    let img;
    if (E.map.kind === "pdf" && E.map.renderRegion) img = await E.map.renderRegion(box, k);
    else {
      img = document.createElement("canvas"); img.width = W; img.height = H;
      const g = img.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.drawImage(E.map.image, box[0] * imgK, (mh - box[3]) * imgK, (box[2] - box[0]) * imgK, (box[3] - box[1]) * imgK, 0, 0, W, H);
    }
    pl = RP.planner(img, toM, null, { map: s.map, onProgress: (f) => say(t("trc.ra.stRead"), f) });
  }
  try {
    await pl.ready;
    await pl.settings(s);
    // the heights, from the event's elevation model
    let relief = "flat";
    if (hasGeo(ev) || E.relief) {
      try {
        const RL = await import("./relief.js");
        say(t("trc.ra.stRelief"), 0);
        const R = await RL.ensureRelief(E, { onProgress: (f) => say(t("trc.ra.stRelief"), f) });
        if (R) { await pl.dem(RL.subGrid(R, box)); relief = R.by === "file" ? "file" : R.source; }
      } catch (err) { console.error(err); relief = "failed"; }
    }
    ra.planner = { pl, key: plannerKey(E, s), box, pad: Math.min(pad, 20 / mPerMm), k, px, mm, relief, forbidKey: "" };
    return ra.planner;
  } catch (err) { pl.destroy(); throw err; }
}
/** The setter's out-of-bounds areas and boundaries shown on a course: closed to its routes. */
async function forbidFor(E, P, courseId) {
  const ev = E.ev, areas = [], lines = [], ids = [];
  for (const [sid, sp] of Object.entries(ev.specials || {})) {
    if (!Array.isArray(sp.pts) || (courseId && !M.containsSpecial(ev, M.cdCourse(courseId), Number(sid)))) continue;
    if (OOB_AREAS.includes(sp.kind) && sp.pts.length >= 3) { areas.push(sp.pts.map(P.px)); ids.push(sid); }
    else if (NO_CROSS.includes(sp.kind) && sp.pts.length >= 2) { lines.push(sp.pts.map(P.px)); ids.push(sid); }
  }
  const key = JSON.stringify([ids, areas, lines]);
  if (key === P.forbidKey) return;
  await P.pl.forbid(areas, lines);
  P.forbidKey = key;
}
/** A line of map mm made lighter (Douglas-Peucker, tol mm). */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) { const d = M.nearest([pts[a], pts[b]], pts[i]).d; if (d > fd) { fd = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const factsOf = (r) => ({ len: Math.round(r.len), up: Math.round((r.up || 0) * 10) / 10, down: Math.round((r.down || 0) * 10) / 10, t: Math.round(r.time * 10) / 10 });
/** One measure of climb everywhere: the route's rise and fall read on the event's elevation model as the profile and « Dénivelée »
 *  read them (relief.profileOf), in the place of the engine's own count cell by cell, which the ground's small bumps inflate.
 *  way: the whole route in map mm, its two controls included. */
function onRelief(E, RL, m, way) {
  if (!m || !E.relief || !RL || way.length < 2) return m;
  const p = RL.profileOf(E.relief, way);
  return { ...m, up: Math.round(p.up * 10) / 10, down: Math.round(p.down * 10) / 10 };
}

/**
 * Compute routes. scope: "leg" (the leg chosen), "course" (the course shown), "all" (every line course). The computed routes
 * of each leg are replaced; those drawn by hand stay, measured again; a leg flagged all the way is its own route.
 */
export async function compute(E, scope = "course") {
  const ev = E.ev;
  if (E.readOnly) { E.toast(t("trc.ra.readOnly")); return; }
  if (!E.map) { E.toast(t("trc.ra.needMap")); return; }
  let jobs = [];                                          // [{ course, legs }]
  if (scope === "leg") {
    const s = E.sel?.kind === "leg" ? E.sel : E.ra?.leg;
    if (!s) { E.toast(t("trc.ra.needLeg")); return; }
    jobs = [{ course: E.cd.course || 0, legs: [[s.c1, s.c2]] }];
  } else if (scope === "course") {
    if (!E.cd.course || M.isScore(ev, E.cd.course)) { E.toast(t("trc.ra.needCourse")); return; }
    jobs = [{ course: E.cd.course, legs: legsOf(ev, E.cd.course) }];
  } else jobs = lineCourses(ev).map((id) => ({ course: id, legs: legsOf(ev, id) }));
  jobs = jobs.filter((j) => j.legs.length);
  if (!jobs.length) { E.toast(t("trc.ra.noLegs")); return; }
  const panel = openPanel(E);
  const ra = E.ra;
  if (ra.busy) return;
  ra.busy = true; ra.stop = false;
  const say = (msg, frac = null) => panel.progress(msg, frac);
  const results = new Map();                             // "c1:c2" → { routes, hand }
  try {
    const pts = jobs.flatMap((j) => j.legs.flat()).map((id) => [ev.controls[id].x, ev.controls[id].y]);
    const P = await plannerFor(E, pts, say);
    const RL = E.relief ? await import("./relief.js") : null;      // the climb of each route, read as « Dénivelée » reads it
    const total = new Set(jobs.flatMap((j) => j.legs.map((l) => l.join(":")))).size;
    let done = 0;
    for (const job of jobs) {
      await forbidFor(E, P, job.course);
      for (const [c1, c2] of job.legs) {
        const key = `${c1}:${c2}`;
        if (results.has(key)) continue;
        if (ra.stop) throw new Error("stopped");
        say(t("trc.ra.stLegs", { i: done + 1, n: total, leg: `${ctrlName(ev, c1)} → ${ctrlName(ev, c2)}` }), done / total);
        const a = ev.controls[c1], b = ev.controls[c2], A = P.px([a.x, a.y]), B = P.px([b.x, b.y]);
        const whole = (inner) => [[a.x, a.y], ...inner, [b.x, b.y]];
        let routes = null;
        if (M.legFlagging(ev, c1, c2) === "all") {
          // a leg flagged all the way: the marked route is the route
          const line = M.legPoints(ev, c1, c2).map(P.px), m = await P.pl.line(line);
          if (m) routes = [{ ...m, pts: line, marked: true }];
        } else routes = await P.pl.leg(A, B);
        const hand = [];
        for (const r of M.legRouteList(ev, c1, c2).filter((x) => !x.calc)) { const m = await P.pl.line(r.pts.map(P.px)).catch(() => null); hand.push({ i: r.i, m: m ? onRelief(E, RL, factsOf(m), r.pts) : null }); }
        results.set(key, { c1, c2, routes: (routes || []).map((r) => { const pts = simplify(r.pts.map(P.mm), 0.12).slice(1, -1); return { pts, m: onRelief(E, RL, factsOf(r), whole(pts)), marked: !!r.marked }; }), hand, none: !routes?.length });
        done++;
      }
    }
    const missing = [...results.values()].filter((r) => r.none);
    E.change((x) => {
      for (const r of results.values()) {
        // the hand-drawn routes' facts first (their places hold until the computed ones are replaced)
        for (const h of r.hand) if (h.m) M.setRouteInfo(x, r.c1, r.c2, h.i, { m: h.m });
        M.clearLegRoutes(x, r.c1, r.c2);
        const kept = M.legRouteList(x, r.c1, r.c2);
        r.routes.forEach((c, q) => {
          // the fastest computed route is the main one, unless the setter drew a route of their own on this leg
          M.addLegRoute(x, r.c1, r.c2, { pts: c.pts.length ? c.pts : [midPoint(x, r.c1, r.c2)], calc: true, m: c.m, main: q === 0 && !kept.length, name: c.marked ? t("trc.ra.marked") : "" });
        });
      }
    }, t("trc.ra.undoCompute"));
    panel.note = [P.relief === "flat" ? t("trc.ra.noRelief", { where: where("georef") }) : P.relief === "failed" ? t("trc.ra.reliefFailed") : "",
      missing.length ? tn("trc.ra.missing", missing.length, { list: missing.slice(0, 6).map((r) => `${ctrlName(ev, r.c1)} → ${ctrlName(ev, r.c2)}`).join(", ") }) : ""].filter(Boolean).join(" ");
    E.status(tn("trc.ra.done", done), "ok");
  } catch (err) {
    if (err.message !== "stopped") { console.error(err); E.toast(t("trc.ra.failed", { err: err.message || String(err) }), 7000); }
  } finally { ra.busy = false; panel.show(); }
}
const midPoint = (ev, c1, c2) => { const a = ev.controls[c1], b = ev.controls[c2]; return [(a.x + b.x) / 2, (a.y + b.y) / 2]; };

/**
 * A route just drawn by hand on a leg (actions.js finishPending): measured on the model and, when the setter wishes (« Coller mes
 * tracés aux chemins »), laid on the map — the model's fastest way within a corridor round the line drawn (30 m in forest, 15 m in
 * sprint): the sketch says where, the map says exactly how. Only when the panel's planner is there (no map is read for a sketch).
 */
export async function afterDraw(E, c1, c2) {
  const ra = E.ra, ev = E.ev;
  if (!ra?.planner || E.readOnly) return;
  const list = M.legRouteList(ev, c1, c2), r = list.filter((x) => !x.calc).pop();
  if (!r) return;
  const P = ra.planner;
  if (!r.pts.every(([x, y]) => x >= P.box[0] && x <= P.box[2] && y >= P.box[1] && y <= P.box[3])) return;
  try {
    const line = r.pts.map(P.px);
    let pts = null, m = null;
    if (snapOn()) {
      const got = await P.pl.match(line[0], line[line.length - 1], line, isSprintEv(ev) ? 15 : 30, []);
      if (got?.pts?.length > 1 && got.snapped !== false) { pts = simplify(got.pts.map(P.mm), 0.12).slice(1, -1); m = factsOf(got); }
    }
    if (!m) { const got = await P.pl.line(line); if (got) m = factsOf(got); }
    if (!m) return;
    { const a = ev.controls[c1], b = ev.controls[c2]; m = onRelief(E, E.relief ? await import("./relief.js") : null, m, pts?.length ? [[a.x, a.y], ...pts, [b.x, b.y]] : r.pts); }
    E.change((x) => {
      const leg = x.legs[M.findLeg(x, c1, c2)];
      if (!leg) return false;
      if (pts?.length) { if (r.i < 0) leg.route = pts; else if (leg.alts?.[r.i]) leg.alts[r.i].pts = pts; }
      M.setRouteInfo(x, c1, c2, r.i, { m });
      return true;
    }, t("trc.ra.undoMeasure"));
    ra.panel?.show();
  } catch (err) { console.error(err); }
}
const PREFS = "ocn.tr.prefs";
const pref = (k, d) => { try { const v = JSON.parse(localStorage.getItem(PREFS) || "{}")[k]; return v ?? d; } catch (e) { return d; } };
const setPref = (k, v) => { try { const o = JSON.parse(localStorage.getItem(PREFS) || "{}"); o[k] = v; localStorage.setItem(PREFS, JSON.stringify(o)); } catch (e) { /* this visit */ } };
const snapOn = () => pref("raSnap", true) !== false;
export const labelsMode = () => { const v = pref("raLabels", "main"); return ["main", "all", "none"].includes(v) ? v : "main"; };

// ---- the panel ----------------------------------------------------------------------------------------------------------------
/** « Itinéraires »: the panel opened, or closed when it is open (the ribbon's button). */
export function toggle(E) {
  if (E.ra?.panel) { E.ra.panel.close(); return; }
  if (E.blank) { E.toast(t("trc.ed.needEvent")); E.onStart?.(); return; }
  openPanel(E).show();
}
function openPanel(E) {
  const ra = (E.ra ||= {});
  if (ra.panel) return ra.panel;
  const wrap = E.root.querySelector(".tr-mapwrap");
  const el = document.createElement("div");
  el.className = "tr-tour tr-ra";
  el.setAttribute("role", "region"); el.setAttribute("aria-label", t("trc.ra.title"));
  el.innerHTML = `<div class="tr-tour-head"><b>${esc(t("trc.ra.title"))}</b>
      <button type="button" class="tr-icon" data-t="fold" title="${esc(t("trc.ra.fold"))}" aria-expanded="true">${svg("minus", 16)}</button>
      <button type="button" class="tr-icon" data-t="close" title="${esc(t("trc.ra.close"))}">${svg("close", 16)}</button></div>
    <div class="tr-tour-body"></div>`;
  wrap.appendChild(el);
  const body = el.querySelector(".tr-tour-body");
  const api = {
    el, note: "",
    progress(msg, frac) {
      let p = body.querySelector(".tr-tour-prog");
      if (!p) { body.innerHTML = `<div class="tr-tour-prog">${bar(frac)}<span></span><button type="button" class="btn btn-sm" data-t="stop">${esc(t("trc.ra.stop"))}</button></div>`; p = body.querySelector(".tr-tour-prog"); p.querySelector("[data-t=stop]").addEventListener("click", () => { ra.stop = true; }); }
      setBar(p.querySelector("progress"), frac);
      p.querySelector("span").textContent = msg;
    },
    show() { if (!ra.busy) drawBody(E, body); },
    close() {
      ra.stop = true;
      ra.planner?.pl.destroy(); ra.planner = null;
      el.remove(); ra.panel = null; ra.lit = null;
      E.redraw(); E.ribbon?.update();
    },
  };
  el.querySelector('[data-t="close"]').addEventListener("click", () => api.close());
  el.querySelector('[data-t="fold"]').addEventListener("click", (e) => { const folded = el.classList.toggle("folded"); e.currentTarget.setAttribute("aria-expanded", String(!folded)); });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.target.closest("input")) { e.stopPropagation(); api.close(); } });
  E.closeHooks?.push(() => { ra.planner?.pl.destroy(); ra.planner = null; el.remove(); ra.panel = null; });
  ra.panel = api;
  // the panel follows the course shown and every change (the editor's refresh)
  ra.onRefresh = () => api.show();
  E.ribbon?.update();
  return api;
}
/** Called by the editor after each refresh: the panel follows the course and the routes. */
export function refreshed(E) { if (E.ra?.panel && !E.ra.busy) E.ra.panel.show(); }

function drawBody(E, body) {
  const ev = E.ev, ra = E.ra, id = E.cd.course, ro = E.readOnly;
  const scroll = body.querySelector(".tr-ra-list")?.scrollTop || 0;
  if (!id || M.isScore(ev, id)) {
    body.innerHTML = `<p class="tr-hint">${esc(t(id ? "trc.ra.scoreCourse" : "trc.ra.chooseCourse"))}</p>
      <div class="tr-tour-btns"><button type="button" class="btn btn-sm btn-primary" data-t="all" ${ro ? "disabled" : ""}>${esc(t("trc.ra.computeAll"))}</button>
      <button type="button" class="btn btn-sm" data-t="report">${esc(t("trc.ra.report"))}</button><button type="button" class="btn btn-sm" data-t="settings">${esc(t("trc.ra.settings"))}</button></div>`;
    bindTop(E, body);
    return;
  }
  const c = ev.courses[id], legs = legsOf(ev, id), pace = paceOf(ev, id), F = courseFigures(ev, id), sprint = isSprintEv(ev);
  const any = legs.some(([a, b]) => M.legRouteList(ev, a, b).length);
  const extra = F.along - F.straight;
  const sum = !any ? `<p class="tr-hint">${esc(t("trc.ra.none"))}</p>` : `<p class="tr-tour-sum"><b>${esc(t("trc.ra.sum", { km: nf(F.along / 1000, 2), extra: nf(Math.round(extra)), pct: nf(F.straight ? (100 * extra) / F.straight : 0) }))}</b>
      <br><small>${esc(F.measured ? t("trc.ra.sumDetail", { up: Math.round(F.up), time: clock(F.t * ((pace * 60) / 1000)), straight: nf(F.straight / 1000, 2) }) : t("trc.ra.sumNoModel", { straight: nf(F.straight / 1000, 2) }))}
      ${F.routed < F.legs ? ` ${esc(tn("trc.ra.sumPartial", F.legs - F.routed))}` : ""}</small></p>`;
  const applied = c.lengthBy === "main";
  body.innerHTML = `
    <div class="tr-tour-btns tr-ra-top">
      <span class="tr-ra-split"><button type="button" class="btn btn-sm btn-primary" data-t="course" ${ro ? "disabled" : ""}>${esc(t("trc.ra.compute"))}</button><button type="button" class="btn btn-sm btn-primary tr-ra-more" data-t="more" aria-haspopup="menu" aria-label="${esc(t("trc.ra.computeMore"))}" ${ro ? "disabled" : ""}>▾</button></span>
      <button type="button" class="btn btn-sm" data-t="draw" ${ro ? "disabled" : ""} title="${esc(t("trc.ra.drawTip"))}">${svg("route", 14)} ${esc(t("trc.ra.draw"))}</button>
      <button type="button" class="btn btn-sm" data-t="report">${esc(t("trc.ra.report"))}</button>
      <button type="button" class="tr-icon" data-t="settings" title="${esc(t("trc.ra.settings"))}">${svg("sliders", 16)}</button>
    </div>
    ${sum}
    ${ra.panel.note ? `<p class="tr-hint tr-warn">${esc(ra.panel.note)}</p>` : ""}
    <div class="tr-ra-row"><label>${esc(t("trc.ra.pace"))} <input data-t="pace" value="${paceText(pace)}" size="5" inputmode="decimal" ${ro ? "disabled" : ""} title="${esc(t("trc.ra.paceTip"))}"> min/km</label>
      <label>${esc(t("trc.ra.labels"))} <select data-t="labels">${["main", "all", "none"].map((k) => `<option value="${k}" ${labelsMode() === k ? "selected" : ""}>${esc(t(`trc.ra.labels.${k}`))}</option>`).join("")}</select></label></div>
    ${any ? `<div class="tr-tour-course-box"><button type="button" class="btn btn-sm${applied ? "" : " btn-primary"}" data-t="apply" ${ro ? "disabled" : ""}>${esc(t("trc.ra.apply"))}</button>
      <small>${esc(applied ? t("trc.ra.applied") : sprint ? t("trc.ra.applyHintSprint") : t("trc.ra.applyHint"))}</small></div>` : ""}
    <div class="tr-ra-list">${legs.map(([a, b], n) => legBlock(E, a, b, n, pace)).join("")}</div>
    <p class="tr-hint">${esc(t("trc.ra.how"))}</p>`;
  bindTop(E, body);
  const list = body.querySelector(".tr-ra-list");
  list.scrollTop = scroll;
  // the leg chosen on the map comes into view in the list, once per choice (the reader's own scrolling is left alone)
  const on = list.querySelector(".tr-ra-block.on"), key = on?.dataset.leg || "";
  if (on && key !== ra.shown) { const r = on.getBoundingClientRect(), l = list.getBoundingClientRect(); if (r.top < l.top || r.bottom > l.bottom) list.scrollTop += r.top - l.top - 4; }
  ra.shown = key;
  const legOf = (el) => { const b = el.closest("[data-leg]"); const [c1, c2] = b.dataset.leg.split(":").map(Number); return { c1, c2 }; };
  const lit = (v) => { ra.lit = v; E.redraw(); };
  list.querySelectorAll(".tr-ra-leg").forEach((h) => {
    h.addEventListener("click", () => { const l = legOf(h); selectLeg(E, l.c1, l.c2); });
    h.addEventListener("keydown", (e) => { if (e.key === "Enter") h.click(); });
  });
  list.querySelectorAll("tr[data-i]").forEach((tr) => {
    const l = legOf(tr), i = Number(tr.dataset.i);
    tr.addEventListener("mouseenter", () => lit({ ...l, i }));
    tr.addEventListener("mouseleave", () => lit(null));
    tr.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (!b) { selectLeg(E, l.c1, l.c2); return; }
      if (ro) { E.toast(t("trc.ra.readOnly")); return; }
      const r = M.legRouteList(ev, l.c1, l.c2).find((x) => x.i === i);
      if (!r) return;
      if (b.dataset.r === "main") E.change((x) => M.setMainRoute(x, l.c1, l.c2, i), t("trc.ra.undoMain"));
      else if (b.dataset.r === "eye") E.change((x) => M.setRouteInfo(x, l.c1, l.c2, i, { hidden: !r.hidden }), t(r.hidden ? "trc.ra.undoShow" : "trc.ra.undoHide"));
      else if (b.dataset.r === "del") { ra.lit = null; E.change((x) => M.removeLegRoute(x, l.c1, l.c2, i), t("trc.ra.undoDelete")); }
      else if (b.dataset.r === "name") rename(E, l.c1, l.c2, i, r);
    });
  });
}
function legBlock(E, a, b, n, pace) {
  const ev = E.ev, rs = rankedRoutes(ev, a, b), straight = M.legLengthM(ev, a, b), best = rs.find((r) => r.m?.t > 0);
  const sel = (E.sel?.kind === "leg" && E.sel.c1 === a && E.sel.c2 === b) || (E.ra.leg?.c1 === a && E.ra.leg?.c2 === b);
  const row = (r) => {
    const tm = timeOf(r, pace), d = best && r !== best && r.m?.t > 0 ? `+${clock((r.m.t - best.m.t) * ((pace * 60) / 1000))}` : "";
    return `<tr data-i="${r.i}" class="${r.hidden ? "tr-ra-hidden" : ""}"><td><i class="tr-ra-sw${r.calc ? "" : " hand"}" style="--c:${r.colour}">${r.letter}</i></td>
      <td class="tr-ra-name">${esc(r.name || (r.calc ? t("trc.ra.calcRoute") : t("trc.ra.handRoute")))}${r.main ? ` <span class="tr-ra-main" title="${esc(t("trc.ra.mainTip"))}">★</span>` : ""}</td>
      <td class="r">${nf(Math.round(r.len))} m</td><td class="r">${r.m ? `+${Math.round(r.m.up || 0)}` : "—"}</td><td class="r" title="${esc(d)}">${tm != null ? clock(tm) : "—"}</td>
      <td class="tr-ra-acts">${r.main ? "" : `<button type="button" class="tr-icon" data-r="main" title="${esc(t("trc.ra.makeMain"))}">☆</button>`}<button type="button" class="tr-icon" data-r="eye" title="${esc(t(r.hidden ? "trc.ra.showRoute" : "trc.ra.hideRoute"))}">${svg(r.hidden ? "eyeoff" : "view", 14)}</button><button type="button" class="tr-icon" data-r="name" title="${esc(t("trc.ra.rename"))}">${svg("pencil", 14)}</button><button type="button" class="tr-icon" data-r="del" title="${esc(t("trc.ra.delete"))}">${svg("trash", 14)}</button></td></tr>`;
  };
  return `<div class="tr-ra-block${sel ? " on" : ""}" data-leg="${a}:${b}"><div class="tr-ra-leg" tabindex="0"><b>${n + 1}</b> <span>${esc(ctrlName(ev, a))} → ${esc(ctrlName(ev, b))}</span><small>${nf(Math.round(straight))} m</small></div>
    ${rs.length ? `<table class="tr-table tr-ra-table"><tbody>${rs.map(row).join("")}</tbody></table>` : ""}</div>`;
}
function selectLeg(E, c1, c2) {
  const ev = E.ev, l = E.layout?.objs.find((o) => o.t === "leg" && o.control === c1 && o.control2 === c2);
  E.ra.leg = { c1, c2 };
  E.select({ kind: "leg", c1, c2, cc1: l?.cc || 0, cc2: l?.cc2 || 0 });
  const pts = [...M.legPoints(ev, c1, c2), ...M.legRouteList(ev, c1, c2).flatMap((r) => r.pts)];
  fitPts(E, pts, isSprintEv(ev) ? 120 : 250);
}
/** The view fitted on points (at least minM metres across), in the part of the map the panel leaves free. */
function fitPts(E, pts, minM = 0) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), b = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const half = minM / 2 / ((E.ev.map.scale || 10000) / 1000), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const box = [Math.min(b[0], cx - half), Math.min(b[1], cy - half), Math.max(b[2], cx + half), Math.max(b[3], cy + half)];
  const panel = E.ra?.panel?.el, cw = E.canvas?.clientWidth || 0;
  const pw = panel && !panel.classList.contains("folded") && cw > 700 ? panel.offsetWidth + 16 : 0;
  if (pw) box[2] += ((box[2] - box[0]) * pw) / (cw - pw);
  E.fitBox?.(box, 50);
}
async function rename(E, c1, c2, i, r) {
  const v = await modal(E, { title: t("trc.ra.rename"), body: field(t("trc.ra.routeName"), `<input name="n" value="${esc(r.name)}" maxlength="60" placeholder="${esc(t("trc.ra.routeNamePh"))}">`) });
  if (v) E.change((x) => M.setRouteInfo(x, c1, c2, i, { name: v.n.trim() }), t("trc.ra.rename"));
}
function bindTop(E, body) {
  const ev = E.ev, q = (s) => body.querySelector(`[data-t="${s}"]`);
  q("course")?.addEventListener("click", () => compute(E, "course"));
  q("all")?.addEventListener("click", () => compute(E, "all"));
  q("more")?.addEventListener("click", async (e) => {
    const r = e.currentTarget.getBoundingClientRect(), D = await import("./dialogs.js");
    const leg = E.sel?.kind === "leg" || E.ra.leg;
    D.popupMenu(E, r.left, r.bottom + 2, [...(leg ? [["leg", t("trc.ra.computeLeg"), "route"]] : []), ["course", t("trc.ra.computeCourse"), "course"], ["all", t("trc.ra.computeAll"), "routes"], "-",
      ["image", t("trc.ra.image"), "image"], "-", ["clear", t("trc.ra.clearCalc"), "trash"], ["clearAll", t("trc.ra.clearAll"), "trash"]], (act) => {
      if (act === "image") exportImage(E);
      else if (act === "clear" || act === "clearAll") { const legs = legsOf(ev, E.cd.course); E.change((x) => { for (const [a, b] of legs) M.clearLegRoutes(x, a, b, act === "clearAll"); }, t("trc.ra.undoClear")); }
      else compute(E, act);
    });
  });
  q("draw")?.addEventListener("click", () => drawOn(E));
  q("report")?.addEventListener("click", () => reportDialog(E));
  q("settings")?.addEventListener("click", () => settingsDialog(E));
  q("apply")?.addEventListener("click", () => applyDialog(E, [E.cd.course]));
  q("labels")?.addEventListener("change", (e) => { setPref("raLabels", e.target.value); E.redraw(); });
  q("pace")?.addEventListener("change", (e) => {
    const p = readPace(e.target.value), id = E.cd.course;
    if (!(p > 0)) { e.target.value = paceText(paceOf(ev, id)); E.toast(t("trc.ra.badPace")); return; }
    E.change((x) => { x.routing = { ...(x.routing || {}), paces: { ...(x.routing?.paces || {}), [id]: Math.round(p * 100) / 100 } }; }, t("trc.ra.undoPace"));
  });
}
/** Draw a route by hand on the leg chosen (the route tool, the leg already picked), else on the leg clicked next. */
export function drawOn(E) {
  if (E.readOnly) { E.toast(t("trc.ra.readOnly")); return; }
  const s = E.sel?.kind === "leg" ? E.sel : E.ra?.leg;
  E.setTool("route");
  if (s && E.ev.controls[s.c1] && E.ev.controls[s.c2] && E.layout?.objs.some((o) => o.t === "leg" && o.control === s.c1 && o.control2 === s.c2)) {
    const a = E.ev.controls[s.c1];
    E.pending = { kind: "route", c1: s.c1, c2: s.c2, pts: [[a.x, a.y]] };
    E.ghost = { pts: E.pending.pts.slice() };
    E.help(t("trc.ra.drawHelp"));
    E.redraw();
  } else E.help(t("trc.ra.drawHelpLeg"));
}

// ---- applying the routes to the courses ---------------------------------------------------------------------------------------
/** « Appliquer au circuit »: the climb along the main routes, and — a sprint's rule, offered in forest too — the length along
 *  them (the ideal route) in the place of the straight line. */
export async function applyDialog(E, ids) {
  const ev = E.ev, sprint = isSprintEv(ev);
  const rows = ids.filter((id) => ev.courses[id] && !M.isScore(ev, id)).map((id) => ({ id, f: courseFigures(ev, id) })).filter((r) => r.f.routed);
  if (!rows.length) { E.toast(t("trc.ra.none")); return; }
  const v = await modal(E, { title: t("trc.ra.applyTitle"), wide: rows.length > 1, ok: t("trc.ra.applyOk"), body: `
    <table class="tr-table"><thead><tr><th>${esc(t("trc.ra.thCourse"))}</th><th class="r">${esc(t("trc.ra.thStraight"))}</th><th class="r">${esc(t("trc.ra.thAlong"))}</th><th class="r">${esc(t("trc.ra.thExtra"))}</th><th class="r">${esc(t("trc.ra.thClimb"))}</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(ev.courses[r.id].name)}${r.f.routed < r.f.legs ? ` <small>${esc(tn("trc.ra.sumPartial", r.f.legs - r.f.routed))}</small>` : ""}</td><td class="r">${nf(r.f.straight / 1000, 2)} km</td><td class="r">${nf(r.f.along / 1000, 2)} km</td>
      <td class="r">+${nf(Math.round(r.f.along - r.f.straight))} m</td><td class="r">${r.f.measured ? `${Math.round(r.f.up)} m` : "—"}</td></tr>`).join("")}</tbody></table>
    <label class="tr-check"><input type="checkbox" name="len" ${sprint ? "checked" : ""}> ${esc(t("trc.ra.applyLen"))}</label>
    <p class="tr-hint">${esc(sprint ? t("trc.ra.applyLenSprint") : t("trc.ra.applyLenForest"))}</p>
    <label class="tr-check"><input type="checkbox" name="climb" ${rows.some((r) => r.f.measured) ? "checked" : "disabled"}> ${esc(t("trc.ra.applyClimb"))}</label>
    <p class="tr-hint">${esc(t("trc.ra.applyClimbHint"))}</p>` });
  if (!v) return;
  E.change((x) => {
    for (const r of rows) {
      const c = x.courses[r.id];
      if (v.len) { c.lengthBy = "main"; c.length = null; } else if (c.lengthBy === "main") c.lengthBy = null;
      if (v.climb && r.f.measured) c.climb = Math.round(r.f.up / 5) * 5;
    }
  }, t("trc.ra.undoApply"));
  E.toast(tn("trc.ra.appliedToast", rows.length));
}

// ---- the report ---------------------------------------------------------------------------------------------------------------
/** The routes of every line course as a report (reports.js's shape): a summary, then each course leg by leg. */
export function routesReport(ev) {
  const sections = [], sum = [];
  for (const id of lineCourses(ev)) {
    const c = ev.courses[id], legs = legsOf(ev, id), pace = paceOf(ev, id), k = (pace * 60) / 1000, F = courseFigures(ev, id);
    if (!legs.some(([a, b]) => M.legRouteList(ev, a, b).length)) continue;
    const rows = [];
    legs.forEach(([a, b], n) => {
      const rs = rankedRoutes(ev, a, b), st = M.legLengthM(ev, a, b), name = `${ctrlName(ev, a)} → ${ctrlName(ev, b)}`;
      if (!rs.length) { rows.push([String(n + 1), name, `${Math.round(st)} m`, "", "", "", "", "", ""]); return; }
      const best = rs.find((r) => r.m?.t > 0);
      rs.forEach((r, q) => rows.push([q ? "" : String(n + 1), q ? "" : name, q ? "" : `${Math.round(st)} m`, `${r.letter}${r.main ? " ★" : ""}${r.name ? ` ${r.name}` : r.calc ? "" : ` (${t("trc.ra.handShort")})`}`,
        `${Math.round(r.len)} m`, st > 0 ? `+${pctN((100 * (r.len - st)) / st)}` : "", r.m ? `${Math.round(r.m.up || 0)} m` : "", r.m?.t > 0 ? clock(r.m.t * k) : "",
        best && r !== best && r.m?.t > 0 ? `+${clock((r.m.t - best.m.t) * k)}` : ""]));
    });
    sections.push({ title: t("trc.ra.repCourse", { name: c.name, pace: paceText(pace) }),
      head: [t("trc.ra.thLeg"), t("trc.ra.thControls"), t("trc.ra.thStraight"), t("trc.ra.thRoute"), t("trc.ra.thLength"), t("trc.ra.thMore"), t("trc.ra.thClimb"), t("trc.ra.thTime"), t("trc.ra.thBehind")], align: "llrlrrrrr", nowrap: true, rows,
      foot: ["", t("trc.ra.total"), `${nf(F.straight / 1000, 2)} km`, "★", `${nf(F.along / 1000, 2)} km`, F.straight ? `+${pctN((100 * (F.along - F.straight)) / F.straight)}` : "", F.measured ? `${Math.round(F.up)} m` : "", F.measured ? clock(F.t * k) : "", ""] });
    sum.push([c.name, String(F.legs), `${F.routed}/${F.legs}`, `${nf(F.straight / 1000, 2)} km`, `${nf(F.along / 1000, 2)} km`, `+${nf(Math.round(F.along - F.straight))} m`, F.measured ? `${Math.round(F.up)} m` : "", c.climb >= 0 ? `${c.climb} m` : "",
      F.measured ? clock(F.t * k) : "", paceText(pace), c.lengthBy === "main" ? t("trc.ra.yes") : ""]);
  }
  if (sum.length) sections.unshift({ title: t("trc.ra.repSummary"), text: t("trc.ra.repSummaryText"), nowrap: true,
    head: [t("trc.ra.thCourse"), t("trc.ra.thLegs"), t("trc.ra.thRouted"), t("trc.ra.thStraight"), t("trc.ra.thAlong"), t("trc.ra.thExtra"), t("trc.ra.thClimbRoutes"), t("trc.ra.thClimbNow"), t("trc.ra.thTime"), t("trc.ra.thPace"), t("trc.ra.thApplied")],
    align: "lrrrrrrrrrl", rows: sum });
  return { title: t("trc.ra.repTitle"), intro: sections.length ? t("trc.ra.repIntro") : t("trc.ra.repNone", { where: where("routes") }), sections };
}
/** « Rapport des itinéraires »: shown, printed or saved as CSV; from it, the routes applied to every course at once. */
export async function reportDialog(E) {
  const rep = routesReport(E.ev), R = await import("./reports.js");
  const ids = lineCourses(E.ev).filter((id) => courseFigures(E.ev, id).routed);
  await R.showReport(E, rep, t("trc.ra.repSlug"), {
    extra: ids.length && !E.readOnly ? `<button type="button" class="btn" data-apply>${esc(t("trc.ra.applyAll"))}</button>` : "",
    onOpen: (f, done) => f.querySelector("[data-apply]")?.addEventListener("click", () => { done(null); applyDialog(E, ids); }) });
}

// ---- the settings ---------------------------------------------------------------------------------------------------------------
/** « Réglages des itinéraires »: the model's dials for this event — the pace, the climb's cost, the caution away from handrails,
 *  the alternatives, a crossing's time, the speeds by kind of ground —, each back to its default with « Réinitialiser ». */
export async function settingsDialog(E) {
  const ev = E.ev, { DEFAULTS } = await import("../trace/routechoice.js"), r = ev.routing || {}, sprint = isSprintEv(ev);
  const s = await engineSettings(ev), vector = E.map?.kind === "vector";
  const sp = (k) => `<label class="tr-ra-speed"><span>${esc(t(`trc.ra.sp.${k}`))}</span><input name="sp_${k}" value="${s.speeds[k]}" size="4" inputmode="numeric" data-fresh data-def="${DEFAULTS.speeds[k]}"> %</label>`;
  const v = await modal(E, { title: t("trc.ra.settingsTitle"), wide: true, ok: t("trc.ra.save"), extra: `<button type="button" class="btn" data-reset>${esc(t("trc.ra.reset"))}</button>`, body: `
    <p>${esc(t("trc.ra.settingsIntro"))}</p>
    <div class="tr-grid2">
      ${field(t("trc.ra.paceDefault"), `<input name="pace" value="${paceText(r.pace || (sprint ? 4 : 6))}" inputmode="decimal" data-fresh data-def="${paceText(sprint ? 4 : 6)}">`, t("trc.ra.paceDefaultHint"))}
      ${field(t("trc.ra.variants"), `<input name="variants" type="number" min="1" max="4" value="${s.variants}" data-fresh data-def="3">`, t("trc.ra.variantsHint"))}
      ${field(t("trc.ra.climbCost"), `<input name="climb" value="${s.climb}" inputmode="decimal" data-fresh data-def="${DEFAULTS.climb}">`, t("trc.ra.climbCostHint"))}
      ${field(t("trc.ra.extra"), `<input name="extra" value="${s.extra}" inputmode="numeric" data-fresh data-def="${DEFAULTS.extra}">`, t("trc.ra.extraHint"))}
      ${field(t("trc.ra.risk"), `<input name="risk" value="${s.risk}" inputmode="numeric" data-fresh data-def="${DEFAULTS.risk}">`, t("trc.ra.riskHint"))}
      ${vector ? field(t("trc.ra.cross"), `<input name="cross" value="${s.cross}" inputmode="numeric" data-fresh data-def="${DEFAULTS.cross}">`, t("trc.ra.crossHint")) : '<input type="hidden" name="cross" value="">'}
    </div>
    <h3>${esc(t("trc.ra.speeds"))}</h3>
    <p class="tr-hint">${esc(t("trc.ra.speedsHint"))}</p>
    <div class="tr-ra-speeds">${SPEED_KEYS.filter((k) => vector || !/^slow/.test(k)).map(sp).join("")}</div>
    <label class="tr-check"><input type="checkbox" name="snap" ${snapOn() ? "checked" : ""} data-fresh> ${esc(t("trc.ra.snap"))}</label>
    ${vector ? `<p class="tr-hint">${esc(t("trc.ra.tableHint", { where: where("route-table") }))}</p>` : ""}`,
  onOpen: (f) => f.querySelector("[data-reset]").addEventListener("click", () => { for (const el of f.querySelectorAll("[data-def]")) el.value = el.dataset.def; }),
  validate: (o) => (!(readPace(o.pace) > 0) ? t("trc.ra.badPace") : null) });
  if (!v) return;
  setPref("raSnap", !!v.snap);
  const clampN = (x, lo, hi, d) => { const n = num(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const speeds = {};
  for (const k of SPEED_KEYS) { if (v[`sp_${k}`] == null) continue; const n = Math.round(clampN(v[`sp_${k}`], 1, 300, DEFAULTS.speeds[k])); if (n !== DEFAULTS.speeds[k]) speeds[k] = n; }
  const next = { ...(ev.routing || {}), pace: Math.round(readPace(v.pace) * 100) / 100, variants: Math.round(clampN(v.variants, 1, 4, 3)), climb: clampN(v.climb, 0, 40, DEFAULTS.climb),
    extra: Math.round(clampN(v.extra, 0, 100, DEFAULTS.extra)), risk: Math.round(clampN(v.risk, 0, 100, DEFAULTS.risk)), speeds };
  if (v.cross !== "") next.cross = Math.round(clampN(v.cross, 0, 120, DEFAULTS.cross));
  if (JSON.stringify(next) === JSON.stringify(ev.routing || {})) return;
  E.change((x) => { x.routing = next; }, t("trc.ra.undoSettings"));
  E.toast(t("trc.ra.settingsSaved"));
}

// ---- the table per symbol -------------------------------------------------------------------------------------------------------
/**
 * « Vitesses par symbole » (an OCAD or Mapper map): every area and line symbol of the map with what the routes read it as —
 * its kind of ground or of line, its speed in % of white forest — and, for each, another kind or another speed for this event
 * (ev.routing.table). « Réinitialiser » puts every symbol back to what Ozimut reads.
 */
export async function tableDialog(E) {
  const ev = E.ev;
  if (E.map?.kind !== "vector" || !E.map.vmap) { E.toast(t("trc.ra.tableVector")); return; }
  const VR = await import("../trace/vectorroutes.js"), s = await engineSettings(ev);
  const syms = VR.symbolRoles(E.map.vmap), table = JSON.parse(JSON.stringify(ev.routing?.table || {}));
  const areaRoles = [...Object.keys(VR.AREA_ROLES), "slow1", "slow2", "slow3", "none"], lineRoles = VR.LINE_ROLES;
  const roleName = (k) => t(`trc.ra.role.${k}`);
  const speedOf = (role) => { const v = VR.roleSpeed(role, s.speeds); return v == null ? (["water", "building", "oob", "block"].includes(role) ? "0" : "") : String(v); };
  const row = (d) => {
    const ov = table[d.id] || {}, roles = d.kind === "area" ? areaRoles : lineRoles, eff = ov.role || d.role;
    return `<tr data-id="${esc(d.id)}" class="${ov.role || ov.speed != null ? "tr-rt-changed" : ""}"><td><i class="tr-rt-sw ${d.kind}" style="--c:${d.rgb ? `rgb(${d.rgb.join(",")})` : "transparent"}"></i></td>
      <td class="r">${esc(d.id.replace(/\.0+$/, ""))}</td><td>${esc(d.name)}</td><td class="r">${d.n}</td>
      <td><select data-k="role"><option value="">${esc(t("trc.ra.roleAuto", { role: roleName(d.role) }))}</option>${roles.filter((k) => k !== d.role).map((k) => `<option value="${k}" ${ov.role === k ? "selected" : ""}>${esc(roleName(k))}</option>`).join("")}</select></td>
      <td class="r"><input data-k="speed" value="${ov.speed != null ? ov.speed : ""}" placeholder="${esc(speedOf(eff) || "—")}" size="4" inputmode="numeric"> %</td>
      <td><button type="button" class="tr-icon" data-k="reset" title="${esc(t("trc.ra.resetRow"))}" ${ov.role || ov.speed != null ? "" : "hidden"}>${svg("undo", 14)}</button></td></tr>`;
  };
  const body = (q = "", kind = "") => syms.filter((d) => (!kind || d.kind === kind) && (!q || `${d.id} ${d.name}`.toLowerCase().includes(q))).map(row).join("") || `<tr><td colspan="7"><small>${esc(t("trc.ra.tableEmpty"))}</small></td></tr>`;
  const v = await modal(E, { title: t("trc.ra.tableTitle"), wide: true, ok: t("trc.ra.save"), extra: `<button type="button" class="btn" data-reset>${esc(t("trc.ra.reset"))}</button>`, body: `
    <p>${esc(t("trc.ra.tableIntro"))}</p>
    <div class="tr-rt-bar"><input type="search" id="tr-rt-q" placeholder="${esc(t("trc.ra.tableSearch"))}" data-fresh>
      <select id="tr-rt-kind" data-fresh><option value="">${esc(t("trc.ra.kindAll"))}</option><option value="area">${esc(t("trc.ra.kindArea"))}</option><option value="line">${esc(t("trc.ra.kindLine"))}</option></select>
      <span class="tr-hint" id="tr-rt-n"></span></div>
    <div class="table-wrap tr-rt-wrap"><table class="tr-table tr-rt"><thead><tr><th></th><th class="r">${esc(t("trc.ra.thNumber"))}</th><th>${esc(t("trc.ra.thSymbol"))}</th><th class="r">${esc(t("trc.ra.thObjects"))}</th><th>${esc(t("trc.ra.thReadAs"))}</th><th class="r">${esc(t("trc.ra.thSpeed"))}</th><th></th></tr></thead>
      <tbody id="tr-rt-body">${body()}</tbody></table></div>
    <p class="tr-hint">${esc(t("trc.ra.tableFoot"))}</p>`,
  onOpen: (f) => {
    const tb = f.querySelector("#tr-rt-body"), count = () => { f.querySelector("#tr-rt-n").textContent = tn("trc.ra.tableChanged", Object.keys(table).length); };
    const redraw = () => { tb.innerHTML = body(f.querySelector("#tr-rt-q").value.trim().toLowerCase(), f.querySelector("#tr-rt-kind").value); count(); };
    f.querySelector("#tr-rt-q").addEventListener("input", redraw);
    f.querySelector("#tr-rt-kind").addEventListener("change", redraw);
    f.querySelector("[data-reset]").addEventListener("click", () => { for (const k of Object.keys(table)) delete table[k]; redraw(); });
    tb.addEventListener("change", (e) => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      const id = tr.dataset.id, o = { ...(table[id] || {}) }, role = tr.querySelector('[data-k="role"]').value, sv = tr.querySelector('[data-k="speed"]').value.trim();
      if (role) o.role = role; else delete o.role;
      const n = sv === "" ? NaN : num(sv);
      if (Number.isFinite(n)) o.speed = Math.max(0, Math.min(250, Math.round(n))); else delete o.speed;
      if (Object.keys(o).length) table[id] = o; else delete table[id];
      redraw();
    });
    tb.addEventListener("click", (e) => { const b = e.target.closest('[data-k="reset"]'); if (!b) return; delete table[b.closest("tr").dataset.id]; redraw(); });
    count();
  } });
  if (!v) return;
  if (JSON.stringify(table) === JSON.stringify(ev.routing?.table || {})) return;
  E.change((x) => { x.routing = { ...(x.routing || {}) }; if (Object.keys(table).length) x.routing.table = table; else delete x.routing.table; }, t("trc.ra.undoTable"));
  E.toast(t("trc.ra.tableSaved"), 6000);
}

// ---- an image of the course with its routes ---------------------------------------------------------------------------------
export async function exportImage(E) {
  const ev = E.ev, id = E.cd.course;
  if ((await import("./dialogs.js")).lentStop(E)) return;
  if (!id) { E.toast(t("trc.ra.needCourse")); return; }
  E.status(t("trc.ra.imgBusy"), "busy");
  try {
    const { courseImage } = await import("./exports.js");
    const { canvas, box, pxPerMm } = await courseImage(E, E.cdDraw || E.cd, 250, { withMap: true });
    const g = canvas.getContext("2d"), sc = Math.max(1, pxPerMm / 6);
    paintRoutes(g, (x, y) => [(x - box[0]) * pxPerMm, (box[3] - y) * pxPerMm], ev, legsOf(ev, id), { labels: "all", pace: paceOf(ev, id), scale: sc, nf: (v) => nf(v) });
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    download(`${fileName(ev.title)} - ${fileName(ev.courses[id].name)} - ${t("trc.ra.imgSlug")}.png`, blob, "image/png");
    E.status(t("trc.ra.imgDone"), "ok");
  } catch (err) { console.error(err); E.status(t("trc.ra.failed", { err: err.message || String(err) }), "bad"); }
}
void csv; void labelOf;
