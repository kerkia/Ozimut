// « Tournée des postes » (owner, 2026-11-07): the fastest way through a chosen set of controls — by default all of them —, for
// the controller who must visit every control, and for those who place and collect them. The route engine of the analyses'
// computed routes (trace/routechoice.js, in its worker) reads the event's map — an OCAD or Mapper map by its symbols, any other
// by its colours —, the setter's out-of-bounds areas and boundaries closed over it, the ground's heights from the georeference
// when there is one (trace/terrain.js; flat otherwise). Then:
//  1. the costs between the controls: from each, one search stopped once its 8 nearest controls are reached; a pair not reached
//     is estimated from the straight line;
//  2. the order (tsp.js): exact up to 13 points, else a local search; a leg of the order only estimated is computed and the
//     order searched again, until every leg of it is a real one;
//  3. each leg's best route, its length, climb and time at the pace chosen, plus the time spent at each control.
// The tour is drawn over the map (numbered, a leg lit from the list) for the visit, and exported as GPX (with a georeference),
// a PNG of the map with the tour, or CSV. « Créer le circuit » makes it a course of the event (a test course, out of the reports)
// with its controls in the tour's order, whose course map, description sheet and punch card the panel then prints. Nothing is sent anywhere but the heights' coordinates (as the 3D view).

import * as M from "./model.js";
import { hasGeo, toLatLon } from "./geo.js";
import { modal, download, fileName } from "./dialogs.js";
import { ctrlName, csv } from "./reports.js";
import { svg } from "./icons.js";
import { where } from "./ribbon-data.js";
import { t, tn, locale } from "./lang.js";
import { bar, setBar } from "../waitbar.js";
import { solveTour } from "./tsp.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const num = (v) => { const x = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : NaN; };
const hm = (s) => { const m = Math.round(s / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const COLOUR = "#0a6cff", LIT = "#ff7a00";
const OOB_AREAS = ["out-of-bounds", "dangerous-area"], NO_CROSS = ["boundary", "mtbo-forbidden-route"];
const MAX_PX = 4e6;                                      // the grid read: 1.5 m a pixel, coarser beyond 4 Mpx (a whole map at 1:15 000)
const NEAREST = 8;                                       // the costs from each control to its 8 nearest (the others when the order needs them)
const PREFS = "ocn.tr.tour";                             // the pace and the time at each control, kept on the device
const keptPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { return {}; } };

const isSprint = (ev) => ev.appearance?.mapStandard === "Spr2019" || (ev.map.scale || 10000) <= 5000;
const byCode = (ev) => (a, b) => { const x = String(ev.controls[a].code || ""), y = String(ev.controls[b].code || ""); return (Number(x) - Number(y)) || x.localeCompare(y); };

/** The controls a course visits (all its branches). */
function controlsOf(ev, courseId) {
  const out = new Set();
  for (const cc of M.ccIds(ev, M.cdCourse(courseId))) { const c = ev.courseControls[cc]?.control; if (ev.controls[c]?.kind === "normal") out.add(c); }
  return out;
}

/** The dialog: which controls, from where to where, the pace and the time at each control; then the tour computed. */
export async function tourDialog(E) {
  const ev = E.ev;
  if (!E.map) { E.toast(t("trc.tour.needMap")); return; }
  const ids = (k) => Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === k);
  const normal = ids("normal").sort(byCode(ev)), starts = ids("start"), finishes = ids("finish");
  if (!normal.length) { E.toast(t("trc.tour.noControls")); return; }
  const prev = E.tour?.opts, kept = keptPrefs();
  const chosen = prev ? new Set(prev.ids) : new Set(normal);
  const label = (id) => {
    const c = ev.controls[id];
    if (c.kind === "normal") return t("trc.tour.ctl", { code: ctrlName(ev, id) });
    const same = ids(c.kind);
    return same.length > 1 ? `${ctrlName(ev, id)} ${same.indexOf(id) + 1}` : ctrlName(ev, id);
  };
  const ends = [...starts, ...finishes, ...normal];
  const fromDef = prev ? prev.from : starts[0] ?? "free", toDef = prev ? prev.to : finishes[0] ?? (starts[0] != null ? "back" : "free");
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`;
  const courses = M.courseIds(ev, false).filter((id) => ev.courses[id].kind !== "score" || controlsOf(ev, id).size);
  const sprint = isSprint(ev);
  const v = await modal(E, { title: t("trc.tour.title"), wide: true, ok: t("trc.tour.compute"), body: `
    <p>${esc(t("trc.tour.intro"))}</p>
    <div class="tr-grid2">
      <label class="tr-field"><span>${esc(t("trc.tour.from"))}</span><select name="from">${opt("free", t("trc.tour.fromFree"), fromDef)}${ends.map((id) => opt(id, label(id), fromDef)).join("")}</select></label>
      <label class="tr-field"><span>${esc(t("trc.tour.to"))}</span><select name="to">${opt("back", t("trc.tour.toBack"), toDef)}${opt("free", t("trc.tour.toFree"), toDef)}${ends.map((id) => opt(id, label(id), toDef)).join("")}</select></label>
    </div>
    <h3 class="tr-h3">${esc(t("trc.tour.controls"))} <small id="tr-tour-n"></small></h3>
    <div class="tr-tour-quick"><button type="button" class="btn btn-sm" data-q="all">${esc(t("trc.tour.all"))}</button><button type="button" class="btn btn-sm" data-q="none">${esc(t("trc.tour.none"))}</button>
      ${courses.length ? `<select class="tr-tour-course" aria-label="${esc(t("trc.tour.ofCourse"))}"><option value="">${esc(t("trc.tour.ofCourse"))}</option>${courses.map((id) => `<option value="${id}">${esc(ev.courses[id].name)}</option>`).join("")}</select>` : ""}</div>
    <div class="tr-tour-grid">${normal.map((id) => `<label class="tr-check"><input type="checkbox" name="c${id}" ${chosen.has(id) ? "checked" : ""}> ${esc(ctrlName(ev, id))}</label>`).join("")}</div>
    <div class="tr-grid2">
      <label class="tr-field"><span>${esc(t("trc.tour.pace"))}</span><input name="pace" value="${prev ? prev.pace : kept.pace || (sprint ? 8 : 10)}" inputmode="decimal"><small>${esc(t("trc.tour.paceHint"))}</small></label>
      <label class="tr-field"><span>${esc(t("trc.tour.stop"))}</span><input name="stop" value="${prev ? prev.stop : kept.stop ?? 2}" inputmode="decimal"><small>${esc(t("trc.tour.stopHint"))}</small></label>
    </div>
    <p class="tr-hint">${esc(hasGeo(ev) ? t("trc.tour.reliefYes") : t("trc.tour.reliefNo", { where: where("georef") }))}</p>`,
  onOpen: (f) => {
    const boxes = [...f.querySelectorAll(".tr-tour-grid input")];
    const count = () => { f.querySelector("#tr-tour-n").textContent = t("trc.tour.nChosen", { n: boxes.filter((b) => b.checked).length, of: boxes.length }); };
    f.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { boxes.forEach((x) => { x.checked = b.dataset.q === "all"; }); count(); }));
    f.querySelector(".tr-tour-course")?.addEventListener("change", (e) => {
      if (!e.target.value) return;
      const set = controlsOf(ev, Number(e.target.value));
      boxes.forEach((x) => { x.checked = set.has(Number(x.name.slice(1))); });
      e.target.value = ""; count();
    });
    boxes.forEach((b) => b.addEventListener("change", count));
    count();
  },
  validate: (o) => {
    const n = normal.filter((id) => o[`c${id}`]).length;
    if (!n) return t("trc.tour.needOne");
    if (!(num(o.pace) > 0)) return t("trc.tour.needPace");
    return null;
  } });
  if (!v) return;
  const opts = { ids: normal.filter((id) => v[`c${id}`]), from: v.from === "free" ? "free" : Number(v.from),
    to: ["free", "back"].includes(v.to) ? v.to : Number(v.to), pace: num(v.pace), stop: Math.max(0, num(v.stop) || 0) };
  try { localStorage.setItem(PREFS, JSON.stringify({ pace: opts.pace, stop: opts.stop })); } catch (e) { /* this visit only */ }
  await run(E, opts);
}

// ---- the computation ----------------------------------------------------------------------------------------------------------
async function run(E, opts) {
  const ev = E.ev, panel = showPanel(E);
  let live = true;
  panel.onClose = () => { live = false; };
  const say = (msg, frac = null) => { if (live) panel.progress(msg, frac); };
  let pl = null;
  try {
    // the points: the controls chosen, and the ends asked for (a start, a finish, a control not chosen)
    const nodes = [...opts.ids];
    for (const e of [opts.from, opts.to]) if (typeof e === "number" && ev.controls[e] && !nodes.includes(e)) nodes.push(e);
    const P = nodes.map((id) => [ev.controls[id].x, ev.controls[id].y]);
    // the frame: the points with a margin (300 m, or 15 % of their extent), within the map
    const scale = ev.map.scale || 10000, mPerMm = scale / 1000;
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const pad = Math.max(300 / mPerMm, 0.15 * span), mw = ev.map.w || 210, mh = ev.map.h || 297;
    const box = [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(mw, Math.max(...xs) + pad), Math.min(mh, Math.max(...ys) + pad)];
    const vector = E.map.kind === "vector" && !!E.map.vmap;
    const imgK = E.map.pxW / mw;
    let k = mPerMm / 1.5;
    if (!vector && E.map.kind !== "pdf") k = Math.min(k, imgK);                  // an image is read at its own resolution at most
    const area = (box[2] - box[0]) * (box[3] - box[1]) * k * k;
    if (area > MAX_PX) k *= Math.sqrt(MAX_PX / area);
    const W = Math.max(8, Math.round((box[2] - box[0]) * k)), H = Math.max(8, Math.round((box[3] - box[1]) * k));
    const px = ([x, y]) => [(x - box[0]) * k, (box[3] - y) * k], mm = ([a, b]) => [box[0] + a / k, box[3] - b / k];
    const toM = (a, b) => [(a / k) * mPerMm, (b / k) * mPerMm];
    const RP = await import("../trace/routeplan.js");
    const s = { ...RP.loadSettings(isSprint(ev) ? "sprint" : "forest"), pace: 0 };
    say(t("trc.tour.stMap"), null);
    if (vector) {
      const { layers } = await import("../trace/vectorroutes.js");
      const src = E.map, T = { a: k, b: 0, c: -(src.ox + box[0]) * k, d: 0, e: -k, f: (box[3] + src.oy) * k };
      const L = layers({ map: src.vmap }, T, W, H);
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
      pl = RP.planner(img, toM, null, { map: s.map, onProgress: (f) => say(t("trc.tour.stRead"), f) });
    }
    if (!live) return;
    await pl.ready;
    await pl.settings(s);
    // the setter's out-of-bounds areas and boundaries, whatever course shows them: closed to the tour too
    const areas = [], lines = [];
    for (const sp of Object.values(ev.specials || {})) {
      if (!Array.isArray(sp.pts)) continue;
      if (OOB_AREAS.includes(sp.kind) && sp.pts.length >= 3) areas.push(sp.pts.map(px));
      else if (NO_CROSS.includes(sp.kind) && sp.pts.length >= 2) lines.push(sp.pts.map(px));
    }
    if (areas.length || lines.length) await pl.forbid(areas, lines);
    // the heights, when the map is georeferenced
    let relief = "flat";
    if (hasGeo(ev)) {
      try {
        const { gridPlan, loadGrid } = await import("../trace/terrain.js");
        const ll = (a, b) => toLatLon(ev, box[0] + a / k, box[3] - b / k), plan = gridPlan(W, H, toM);
        const key = `tour:${W}x${H}:${[[0, 0], [W, 0], [W, H], [0, H]].map(([a, b]) => ll(a, b).map((x) => x.toFixed(5)).join(",")).join(";")}`;
        say(t("trc.tour.stRelief"), 0);
        const grid = await loadGrid({ key, ...plan, node: (i, j) => ll((i / (plan.nx - 1)) * W, (j / (plan.ny - 1)) * H), onProgress: (f) => say(t("trc.tour.stRelief"), f) });
        if (!live) return;
        await pl.dem(grid);
        relief = grid.source || "dem";
      } catch (err) { console.error(err); relief = "failed"; }
    }
    // 1. the costs between the points
    const n = nodes.length, Q = P.map(px);
    let C = null, Tm = null;
    if (n > 1) {
      say(t("trc.tour.stCosts"), 0);
      const r = await pl.tour(Q, Math.min(n - 1, NEAREST), (f) => say(t("trc.tour.stCosts"), f));
      C = Float64Array.from(r.cost); Tm = Float64Array.from(r.time);
    }
    if (!live) return;
    // 2. the order; a leg only estimated in it is computed, then the order searched again
    const fi = typeof opts.from === "number" ? nodes.indexOf(opts.from) : -1;
    const loop = opts.to === "back" || (fi >= 0 && opts.to === opts.from);
    const ti = typeof opts.to === "number" && !loop ? nodes.indexOf(opts.to) : -1;
    const legs = new Map();                                // "i,j" → the leg's route (null: none found)
    const metres = (i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) * mPerMm;
    let order = [0];
    if (n > 1) {
      say(t("trc.tour.stOrder"), null);
      for (let round = 0; round < 8; round++) {
        // estimates: the straight line × the median cost a metre of the pairs reached, × 1.5 (a guess must not look cheap)
        const ratios = [];
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && Number.isFinite(C[i * n + j]) && metres(i, j) > 1) ratios.push(C[i * n + j] / metres(i, j));
        ratios.sort((a, b) => a - b);
        const ratio = ratios.length ? ratios[ratios.length >> 1] : 2;
        const D = new Float64Array(n * n);
        for (let i = 0; i < n * n; i++) D[i] = Number.isFinite(C[i]) ? C[i] : metres(Math.floor(i / n), i % n) * ratio * 1.5 + 60;
        order = solveTour(D, n, { from: fi, to: ti, loop, budgetMs: Math.min(3000, 200 + 15 * n) }).order;
        const pairs = order.slice(1).map((b, q) => [order[q], b]);
        if (loop) pairs.push([order[order.length - 1], order[0]]);
        const guessed = pairs.filter(([a, b]) => !Number.isFinite(C[a * n + b]) && !legs.has(`${a},${b}`));
        if (!guessed.length) break;
        for (const [a, b] of guessed) {
          const r = await pl.path(Q[a], Q[b]);
          legs.set(`${a},${b}`, r);
          C[a * n + b] = r ? r.cost : Infinity;
          if (r) Tm[a * n + b] = r.time;
          if (!live) return;
        }
        // a pair with no way at all keeps its estimate (drawn straight, flagged)
        for (const [a, b] of guessed) if (!legs.get(`${a},${b}`)) C[a * n + b] = metres(a, b) * ratio * 3 + 600;
      }
    }
    // 3. each leg's route
    const pairs = order.slice(1).map((b, q) => [order[q], b]);
    if (loop && n > 1) pairs.push([order[order.length - 1], order[0]]);
    const out = [];
    for (let q = 0; q < pairs.length; q++) {
      const [a, b] = pairs[q];
      say(t("trc.tour.stRoutes", { i: q + 1, n: pairs.length }), q / pairs.length);
      let r = legs.has(`${a},${b}`) ? legs.get(`${a},${b}`) : await pl.path(Q[a], Q[b]);
      if (!live) return;
      const missing = !r;
      if (!r) r = { pts: [Q[a], Q[b]], time: metres(a, b) * 2, len: metres(a, b), up: 0, down: 0 };
      out.push({ a: nodes[a], b: nodes[b], pts: r.pts.map(mm), time: r.time, len: r.len, up: r.up || 0, down: r.down || 0, missing });
    }
    const chosen = new Set(opts.ids);
    E.tour = { opts, result: { order: order.map((i) => nodes[i]), legs: out, loop, chosen, relief, sPerM: (opts.pace * 60) / 1000, stop: opts.stop * 60, box } };
    if (live) { panel.show(); addOverlay(E); fitTour(E); }
  } catch (err) {
    console.error(err);
    if (live) panel.fail(t("trc.tour.failed", { err: err.message || String(err) }));
  } finally { pl?.destroy(); }
}

// ---- the panel and the map ----------------------------------------------------------------------------------------------------
/** The tour's figures: per row (the departure, then each leg's arrival) the leg's length, climb and time, and the clock. */
function rows(E) {
  const ev = E.ev, R = E.tour.result, out = [];
  let clock = 0, len = 0, up = 0, stops = 0;
  const first = R.order[0];
  out.push({ leg: -1, n: R.chosen.has(first) ? 1 : 0, id: first, clock: 0 });
  if (R.chosen.has(first)) { clock += R.stop; stops++; }
  let k = R.chosen.has(first) ? 1 : 0;
  R.legs.forEach((l, i) => {
    const last = R.loop && i === R.legs.length - 1;
    const counts = R.chosen.has(l.b) && !last;
    const tm = l.time * R.sPerM;
    clock += tm; len += l.len; up += l.up;
    if (counts) k++;
    out.push({ leg: i, n: counts ? k : 0, id: l.b, len: l.len, up: l.up, time: tm, clock, missing: l.missing, back: last });
    if (counts) { clock += R.stop; stops++; }
  });
  return { rows: out, total: clock, len, up, stops, visits: k, ev };
}

function showPanel(E) {
  E.root.querySelector(".tr-tour")?.remove();
  const wrap = E.root.querySelector(".tr-mapwrap");
  const el = document.createElement("div");
  el.className = "tr-tour";
  el.setAttribute("role", "region");
  el.setAttribute("aria-label", t("trc.tour.title"));
  el.innerHTML = `<div class="tr-tour-head"><b>${esc(t("trc.tour.title"))}</b>
      <button type="button" class="tr-icon" data-t="fold" title="${esc(t("trc.tour.fold"))}" aria-expanded="true">${svg("minus", 16)}</button>
      <button type="button" class="tr-icon" data-t="close" title="${esc(t("trc.tour.close"))}">${svg("close", 16)}</button></div>
    <div class="tr-tour-body"></div>`;
  wrap.appendChild(el);
  const body = el.querySelector(".tr-tour-body");
  const api = {
    onClose: null,
    progress(msg, frac) {
      let p = body.querySelector(".tr-tour-prog");
      if (!p) { body.innerHTML = `<div class="tr-tour-prog">${bar(frac)}<span></span></div>`; p = body.querySelector(".tr-tour-prog"); }
      setBar(p.querySelector("progress"), frac);
      p.querySelector("span").textContent = msg;
    },
    fail(msg) { body.innerHTML = `<p class="tr-err">${esc(msg)}</p>`; },
    show() { drawBody(E, body); },
  };
  const close = () => { api.onClose?.(); el.remove(); removeOverlay(E); E.tour && (E.tour.result = null); };
  el.querySelector('[data-t="close"]').addEventListener("click", close);
  el.querySelector('[data-t="fold"]').addEventListener("click", (e) => {
    const folded = el.classList.toggle("folded");
    e.currentTarget.setAttribute("aria-expanded", String(!folded));
  });
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  E.closeHooks?.push(() => el.remove());
  return api;
}

function drawBody(E, body) {
  const ev = E.ev, R = E.tour.result, F = rows(E);
  const reliefNote = R.relief === "flat" ? t("trc.tour.noRelief") : R.relief === "failed" ? t("trc.tour.reliefFailed") : "";
  const miss = R.legs.filter((l) => l.missing).length;
  body.innerHTML = `<p class="tr-tour-sum"><b>${esc(tn("trc.tour.sum", F.visits, { km: nf(F.len / 1000, 1), up: nf(F.up), time: hm(F.total) }))}</b>
      <br><small>${esc(t("trc.tour.sumDetail", { pace: nf(E.tour.opts.pace, 1), stops: hm(F.stops * R.stop) }))}</small></p>
    ${reliefNote ? `<p class="tr-hint">${esc(reliefNote)}</p>` : ""}
    ${miss ? `<p class="tr-hint tr-warn">${esc(tn("trc.tour.missing", miss))}</p>` : ""}
    <div class="tr-tour-btns"><button type="button" class="btn btn-sm" data-t="again">${esc(t("trc.tour.again"))}</button>
      ${hasGeo(ev) ? '<button type="button" class="btn btn-sm" data-t="gpx">GPX</button>' : ""}
      <button type="button" class="btn btn-sm" data-t="png">${esc(t("trc.tour.image"))}</button><button type="button" class="btn btn-sm" data-t="csv">CSV</button></div>
    ${courseBlock(E)}
    <div class="tr-tour-list"><table class="tr-table"><thead><tr><th class="r">#</th><th>${esc(t("trc.tour.thControl"))}</th><th class="r">${esc(t("trc.tour.thDist"))}</th><th class="r">${esc(t("trc.tour.thUp"))}</th><th class="r">${esc(t("trc.tour.thTime"))}</th><th class="r">${esc(t("trc.tour.thClock"))}</th></tr></thead>
    <tbody>${F.rows.map((r) => `<tr data-leg="${r.leg}" tabindex="0"${r.missing ? ' class="tr-tour-miss"' : ""}><td class="r">${mark(r)}</td>
      <td>${esc(ctrlName(ev, r.id))}${r.missing ? ` <span title="${esc(t("trc.tour.missTip"))}">⚠</span>` : ""}</td>
      <td class="r">${r.leg < 0 ? "" : `${nf(r.len)} m`}</td><td class="r">${r.leg < 0 ? "" : nf(r.up)}</td><td class="r">${r.leg < 0 ? "" : hm(r.time)}</td><td class="r">${hm(r.clock)}</td></tr>`).join("")}</tbody></table></div>
    <p class="tr-hint">${esc(t("trc.tour.how"))}</p>`;
  body.querySelector('[data-t="again"]').addEventListener("click", () => tourDialog(E));
  body.querySelector('[data-t="gpx"]')?.addEventListener("click", () => exportGpx(E));
  body.querySelector('[data-t="png"]').addEventListener("click", () => exportPng(E));
  body.querySelector('[data-t="csv"]').addEventListener("click", () => exportCsv(E));
  body.querySelector('[data-t="course"]')?.addEventListener("click", () => { if (makeCourse(E)) drawBody(E, body); });
  const made = () => { const id = E.tour.courseId; if (!E.ev.courses[id]) { drawBody(E, body); return 0; } return id; };
  body.querySelector('[data-t="pdf"]')?.addEventListener("click", async () => { const id = made(); if (id) (await import("./pdf.js")).coursesDialog(E, { only: id }); });
  body.querySelector('[data-t="descr"]')?.addEventListener("click", async () => { const id = made(); if (id) (await import("./pdf.js")).descriptionsDialog(E, { only: id }); });
  body.querySelector('[data-t="punch"]')?.addEventListener("click", async () => { const id = made(); if (id) (await import("./pdf.js")).punchDialog(E, { only: id }); });
  body.querySelector('[data-t="show"]')?.addEventListener("click", () => { const id = made(); if (id) { E.setCourse(id); E.fitCourse(); } });
  body.querySelectorAll("tr[data-leg]").forEach((tr) => {
    const leg = Number(tr.dataset.leg);
    const lit = (on) => { E.tour.lit = on ? leg : null; E.redraw(); };
    tr.addEventListener("mouseenter", () => lit(true));
    tr.addEventListener("mouseleave", () => lit(false));
    tr.addEventListener("focus", () => lit(true));
    tr.addEventListener("blur", () => lit(false));
    tr.addEventListener("click", () => { if (leg >= 0) fitLeg(E, leg); else { const c = ev.controls[E.tour.result.order[0]]; fitPts(E, [[c.x, c.y]], 120); } });
    tr.addEventListener("keydown", (e) => { if (e.key === "Enter") tr.click(); });
  });
}

/** A row's mark: the visit's number, ▶ the departure (not a control chosen), ↩ the way back. */
const mark = (r) => (r.n ? String(r.n) : r.leg < 0 ? "▶" : r.back ? "↩" : "");
const boxOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
/** The view fitted on points (at least minM metres across), in the part of the map the panel leaves free (its left). */
function fitPts(E, pts, minM = 0) {
  const b = boxOf(pts), half = minM / 2 / ((E.ev.map.scale || 10000) / 1000);
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const box = [Math.min(b[0], cx - half), Math.min(b[1], cy - half), Math.max(b[2], cx + half), Math.max(b[3], cy + half)];
  const panel = E.root.querySelector(".tr-tour"), cw = E.canvas?.clientWidth || 0;
  const pw = panel && !panel.classList.contains("folded") && cw > 700 ? panel.offsetWidth + 16 : 0;
  if (pw) box[2] += ((box[2] - box[0]) * pw) / (cw - pw);
  E.fitBox?.(box, 50);
}
const fitLeg = (E, i) => fitPts(E, E.tour.result.legs[i].pts, 250);
const fitTour = (E) => { const R = E.tour.result; const all = R.legs.flatMap((l) => l.pts); if (all.length) fitPts(E, all); else { const c = E.ev.controls[R.order[0]]; fitPts(E, [[c.x, c.y]], 300); } };

/** The tour drawn: each leg's route (cased, dashed where no way was found), an arrow at its middle, the visits numbered. */
function paint(g, R, T, ev, { lit = null, scale = 1 } = {}) {
  g.save(); g.lineJoin = "round"; g.lineCap = "round";
  const line = (pts, w, colour, dash) => { g.setLineDash(dash ? dash.map((d) => d * scale) : []); g.lineWidth = w * scale; g.strokeStyle = colour; g.beginPath(); pts.forEach((p, i) => { const [x, y] = T(...p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  R.legs.forEach((l, i) => {
    const on = lit === i;
    line(l.pts, on ? 7 : 5, "rgba(255,255,255,0.85)", null);
    line(l.pts, on ? 4 : 2.6, on ? LIT : COLOUR, l.missing ? [6, 5] : null);
    // the arrow at the middle of the leg's length
    const sp = l.pts.map((p) => T(...p));
    let L = 0; for (let q = 1; q < sp.length; q++) L += Math.hypot(sp[q][0] - sp[q - 1][0], sp[q][1] - sp[q - 1][1]);
    if (L < 40 * scale) return;
    let acc = 0;
    for (let q = 1; q < sp.length; q++) {
      const d = Math.hypot(sp[q][0] - sp[q - 1][0], sp[q][1] - sp[q - 1][1]);
      if (acc + d >= L / 2 && d > 0) {
        const f = (L / 2 - acc) / d, x = sp[q - 1][0] + f * (sp[q][0] - sp[q - 1][0]), y = sp[q - 1][1] + f * (sp[q][1] - sp[q - 1][1]);
        const a = Math.atan2(sp[q][1] - sp[q - 1][1], sp[q][0] - sp[q - 1][0]), s = 7 * scale;
        g.setLineDash([]); g.fillStyle = on ? LIT : COLOUR; g.strokeStyle = "#fff"; g.lineWidth = 1.2 * scale;
        g.beginPath(); g.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); g.lineTo(x + s * Math.cos(a + 2.5), y + s * Math.sin(a + 2.5)); g.lineTo(x + s * Math.cos(a - 2.5), y + s * Math.sin(a - 2.5)); g.closePath(); g.fill(); g.stroke();
        break;
      }
      acc += d;
    }
  });
  // the visits' numbers, beside each control
  const seen = new Set();
  let k = 0;
  R.order.forEach((id) => {
    if (!R.chosen.has(id) || seen.has(id)) return;
    seen.add(id); k++;
    const c = ev.controls[id], [x, y] = T(c.x, c.y), r = 8 * scale, ox = x + 13 * scale, oy = y - 13 * scale;
    g.setLineDash([]); g.fillStyle = COLOUR; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * scale;
    g.beginPath(); g.arc(ox, oy, r + (k > 9 ? 2 : 0) * scale, 0, 2 * Math.PI); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.font = `bold ${Math.round(10 * scale)}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(String(k), ox, oy + 0.5 * scale);
  });
  g.restore();
}
function addOverlay(E) {
  removeOverlay(E);
  const f = (g, T) => { if (E.tour?.result) paint(g, E.tour.result, T, E.ev, { lit: E.tour.lit }); };
  f.key = "tour";
  E.overlays.push(f);
  E.redraw();
}
function removeOverlay(E) {
  const i = E.overlays.findIndex((f) => f.key === "tour");
  if (i >= 0) { E.overlays.splice(i, 1); E.redraw(); }
}

// ---- the tour as a course ---------------------------------------------------------------------------------------------------------
/** The panel's block: « Créer le circuit », or the course made and its prints (course map, description sheet, punch card). */
function courseBlock(E) {
  const id = E.tour.courseId, c = id ? E.ev.courses[id] : null;
  if (!c) return `<div class="tr-tour-course-box"><button type="button" class="btn btn-sm btn-primary" data-t="course"${E.readOnly ? " disabled" : ""}>${esc(t("trc.tour.makeCourse"))}</button>
    <small>${esc(E.readOnly ? t("trc.tour.makeReadOnly") : t("trc.tour.makeHint"))}</small></div>`;
  return `<div class="tr-tour-course-box"><p>${esc(t("trc.tour.made", { name: c.name }))}</p>
    <div class="tr-tour-btns"><button type="button" class="btn btn-sm" data-t="show">${esc(t("trc.tour.showCourse"))}</button><button type="button" class="btn btn-sm" data-t="pdf">${esc(t("trc.tour.pdfCourse"))}</button>
      <button type="button" class="btn btn-sm" data-t="descr">${esc(t("trc.tour.pdfDescr"))}</button><button type="button" class="btn btn-sm" data-t="punch">${esc(t("trc.tour.pdfPunch"))}</button></div></div>`;
}
/**
 * A course in the event with the tour's controls in its order (owner, 2026-11-07: a circuit of its own, with its description sheet and
 * punch card): the start when the tour leaves from one, the finish when it ends at one — a tour back to its start ends at the finish
 * within 100 m of it, if any; back to a control, at that control again —, its length and climb the tour's (the climb unknown without
 * relief), a test course (out of the
 * reports), its print area automatic. One change: undone as any other. Returns the course's id, or 0.
 */
function makeCourse(E) {
  const ev = E.ev, R = E.tour.result, F = rows(E), mPerMm = (ev.map.scale || 10000) / 1000;
  const near = (id, kind) => {
    const c = ev.controls[id];
    let best = 0, bd = 100 / mPerMm;
    for (const [k, x] of Object.entries(ev.controls)) { const d = Math.hypot(x.x - c.x, x.y - c.y); if (x.kind === kind && d <= bd) { best = Number(k); bd = d; } }
    return best;
  };
  const seq = [...R.order];
  if (R.loop && seq.length > 1) seq.push(R.order[0]);
  if (seq.length > 1 && ev.controls[seq[seq.length - 1]].kind === "start") { const f = near(seq[seq.length - 1], "finish"); if (f) seq[seq.length - 1] = f; else seq.pop(); }
  const list = seq.filter((id, i) => { const k = ev.controls[id]?.kind; return k === "normal" || (k === "start" && i === 0) || (k === "finish" && i === seq.length - 1); });
  if (!list.some((id) => ev.controls[id].kind === "normal")) { E.toast(t("trc.tour.noControls")); return 0; }
  const names = new Set(Object.values(ev.courses).map((c) => c.name));
  let name = t("trc.tour.courseName"), n = 1;
  while (names.has(name)) name = `${t("trc.tour.courseName")} ${++n}`;
  let id = 0;
  const ok = E.change((x) => {
    id = M.createCourse(x, { name, addStartFinish: false, hideFromReports: true, climb: ["flat", "failed"].includes(R.relief) ? -1 : Math.round(F.up), length: Math.round(F.len / 10) / 100 });
    x.courses[id].printArea = { ...x.courses[id].printArea, auto: true, rect: null };
    let prev = 0;
    for (const c of list) prev = M.addCourseControl(x, c, id, prev, 0);
  }, t("trc.tour.makeUndo"));
  if (ok === false || !id) return 0;
  E.tour.courseId = id;
  E.setCourse(id);
  E.toast(t("trc.tour.madeToast", { name, where: where("course-delete") }), 8000);
  return id;
}

// ---- exports ------------------------------------------------------------------------------------------------------------------
const slug = (E) => `${fileName(E.ev.title)} - ${t("trc.tour.slug")}`;
function exportCsv(E) {
  const ev = E.ev, F = rows(E);
  const rep = { title: `${ev.title || ""} — ${t("trc.tour.title")}`, intro: tn("trc.tour.sum", F.visits, { km: nf(F.len / 1000, 1), up: nf(F.up), time: hm(F.total) }),
    sections: [{ head: ["#", t("trc.tour.thControl"), `${t("trc.tour.thDist")} (m)`, t("trc.tour.thUp"), t("trc.tour.thTime"), t("trc.tour.thClock")],
      rows: F.rows.map((r) => [mark(r), ctrlName(ev, r.id),
        r.leg < 0 ? "" : String(Math.round(r.len)), r.leg < 0 ? "" : String(Math.round(r.up)), r.leg < 0 ? "" : hm(r.time), hm(r.clock)]) }] };
  download(`${slug(E)}.csv`, "﻿" + csv(rep), "text/csv;charset=utf-8");
}
function exportGpx(E) {
  const ev = E.ev, R = E.tour.result;
  const x = (s) => esc(s).replace(/'/g, "&apos;");
  const pt = (tag, p, inner = "") => { const [lat, lon] = toLatLon(ev, p[0], p[1]); return `<${tag} lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${inner}</${tag}>`; };
  const seen = new Set();
  let k = 0;
  const wpts = R.order.filter((id) => R.chosen.has(id) && !seen.has(id) && seen.add(id)).map((id) => { k++; const c = ev.controls[id]; return pt("wpt", [c.x, c.y], `<name>${x(`${k} · ${ctrlName(ev, id)}`)}</name>`); });
  const trk = R.legs.flatMap((l, i) => (i ? l.pts.slice(1) : l.pts)).map((p) => pt("trkpt", p));
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ozimut" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${x(`${ev.title || ""} — ${t("trc.tour.title")}`)}</name></metadata>\n${wpts.join("\n")}\n<trk><name>${x(t("trc.tour.title"))}</name><trkseg>\n${trk.join("\n")}\n</trkseg></trk>\n</gpx>\n`;
  download(`${slug(E)}.gpx`, gpx, "application/gpx+xml");
}
async function exportPng(E) {
  if ((await import("./dialogs.js")).lentStop(E)) return;
  const ev = E.ev, R = E.tour.result, F = rows(E);
  E.status(t("trc.tour.imgBusy"), "busy");
  try {
    const { courseImage } = await import("./exports.js");
    const all = R.legs.flatMap((l) => l.pts), b = all.length ? boxOf(all) : R.box, m = 12;
    const clip = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    const { canvas, box, pxPerMm } = await courseImage(E, M.cdAll(), 250, { withMap: true, clip });
    const g = canvas.getContext("2d"), sc = Math.max(1, pxPerMm / 6);
    paint(g, R, (xx, yy) => [(xx - box[0]) * pxPerMm, (box[3] - yy) * pxPerMm], ev, { scale: sc });
    const text = `${t("trc.tour.title")} · ${tn("trc.tour.sum", F.visits, { km: nf(F.len / 1000, 1), up: nf(F.up), time: hm(F.total) })}`;
    g.font = `bold ${Math.round(14 * sc)}px sans-serif`; g.textBaseline = "top";
    const w = g.measureText(text).width;
    g.fillStyle = "rgba(255,255,255,0.9)"; g.fillRect(6 * sc, 6 * sc, w + 12 * sc, 22 * sc);
    g.fillStyle = "#111"; g.fillText(text, 12 * sc, 10 * sc);
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    download(`${slug(E)}.png`, blob, "image/png");
    E.status(t("trc.tour.imgDone"), "ok");
  } catch (err) { console.error(err); E.status(t("trc.tour.imgFailed"), "bad"); E.toast(err.message || String(err)); }
}
