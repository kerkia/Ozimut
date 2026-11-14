// Coach › Virtually › Analyse (pages/virtually.js): one's own virtual run replayed on the map, as the real map analyses do — the
// route on the map with the runner moving along it (play, speed, a time slider, the map dragged and zoomed), the legs' table
// (time, rank and best of the circuit, the time lost and the mistakes as « Analyse de course » counts them: trace/legs.js, the
// distance run against the straight line, the pace), the pace under the map (trace/pacestrip.js); other runners of the same
// circuit shown beside it, each in their colour. A virtual run is a perfect trace in the map's own frame: nothing to calibrate.
// Every account's since 2026-11-14 (owner: « every training open to both multi and solo analyses, as regular trainings would be »):
// « Seul » shows one's own run alone, « Avec tous » every other runner of the circuit (each one's first run); a competition's other
// runs once its event is over (canSee, the server's rule); a « Carte du jour »'s run on its forest made again in the browser.

import { html, raw, $, $$, fmt, fmtDate, displayName } from "../util.js";
import { t, tn } from "../i18n.js";
import { refLegs, legLoss, bestLegs } from "../trace/legs.js";
import { drawPaceStrip, stripSamples, stripFraction } from "../trace/pacestrip.js";
import { clock } from "./virtually.js";
import { mapOptText, moOf } from "../games/vmapopt.js";

const API = "/api/virtual/";
const ME = "#d7191c", OTHERS = ["#1f6fd1", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#65a30d", "#475569"];
const SPEEDS = [1, 5, 10, 20, 50];
const mapCache = new Map(), routeCache = new Map();

async function getJson(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw Object.assign(new Error(`${url}: ${r.status}`), { status: r.status });
  return r.json();
}
const routeOf = (race, id) => {
  const k = `${race}/${id}`;
  if (!routeCache.has(k)) routeCache.set(k, getJson(`${API}runs/${race}/${id}`).then((d) => d.route || []));
  return routeCache.get(k);
};
/** The map drawn for the analysis, from the run's own package — a map's (/api/virtual/<id>/) or an event's
 *  (/api/virtual/events/<id>/pkg/) —: its race.json gives the frame (an event's list carries its courses only), then its OCAD
 *  file or, for an event made from the LiDAR alone (race.map "webp"), the generated map's image. { canvas, ppm, k }. */
async function mapOf(race) {
  if (!mapCache.has(race.id)) mapCache.set(race.id, (async () => {
    if (race.gen) {                                          // an invented forest: its package made in this browser
      const data = await race.load(), { drawMap } = await import("../games/virtually.js");
      return { ...(await drawMap(data)), k: data.race.k };
    }
    const base = race.event ? `${API}events/${race.id}/pkg/` : `${API}${race.id}/`;
    const get = async (f) => {
      const r = await fetch(base + f, { credentials: "same-origin" });
      if (!r.ok) throw Object.assign(new Error(`${f}: ${r.status}`), { status: r.status });
      return r;
    };
    const full = await (await get("race.json")).json();
    const { drawMap } = await import("../games/virtually.js");
    const m = full.map === "webp"
      ? await drawMap({ race: full, mapImage: await createImageBitmap(await (await get("map.webp")).blob()) })
      : await drawMap({ race: full, ocd: new Uint8Array(await (await ((full.gz || []).includes("map.ocd") && typeof DecompressionStream === "function"
        ? get("map.ocd.gz").then((r) => new Response(r.body.pipeThrough(new DecompressionStream("gzip")))) : get("map.ocd"))).arrayBuffer()) });   // gzipped when published so (tools/virtually/pkggz.py)
    return { ...m, k: full.k };
  })());
  return mapCache.get(race.id);
}

/** The position on a route ([[t, x, z]]) at time s, interpolated. */
function posAt(route, s) {
  if (!route.length) return null;
  if (s <= route[0][0]) return route[0];
  let lo = 0, hi = route.length - 1;
  if (s >= route[hi][0]) return route[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (route[m][0] <= s) lo = m; else hi = m; }
  const [ta, xa, za] = route[lo], [tb, xb, zb] = route[hi], f = (s - ta) / (tb - ta || 1);
  return [s, xa + (xb - xa) * f, za + (zb - za) * f];
}
/** The distance run (m) between times a and b. */
function runBetween(route, a, b) {
  let d = 0, prev = posAt(route, a);
  for (const p of route) { if (p[0] <= a) continue; if (p[0] >= b) break; d += Math.hypot(p[1] - prev[1], p[2] - prev[2]); prev = p; }
  const end = posAt(route, b);
  return d + Math.hypot(end[1] - prev[1], end[2] - prev[2]);
}
const legsOf = (sp) => sp.map((s, i) => s - (i ? sp[i - 1] : 0));
const paceTxt = (s, m) => (m > 0 ? clock((s / m) * 1000) : "—");

/** Draws the analysis of `run` in `el`; returns stop(). */
export async function drawAnalysis(el, { run, race, course, all, mineRuns, mapName, courseName, onRun, canSee = () => true }) {
  const ctl = course.controls, nL = ctl.length - 1;
  const circuit = all.runs.filter((r) => all.circuitKey(r) === all.circuitKey(run));
  // the field the legs are compared with: each runner's first run of the circuit (one's own run itself always), splits complete
  const first = new Map();
  for (const r of [...circuit].sort((a, b) => a.at.localeCompare(b.at))) if (!r.help && !first.has(r.u)) first.set(r.u, r);
  const field = [...first.values()].filter((r) => r.sp.length === nL);
  if (!field.includes(run) && run.sp.length === nL) field.push(run);
  const fieldLegs = field.map((r) => legsOf(r.sp));
  const ref = refLegs(fieldLegs, nL), best = bestLegs(fieldLegs, nL);
  const mine = legsOf(run.sp), loss = run.sp.length === nL ? legLoss(mine, ref) : mine.map(() => ({ lost: null, mistake: false }));
  const rankOf = (i) => (mine[i] == null ? null : 1 + fieldLegs.filter((l) => l[i] < mine[i]).length);
  const others = field.filter((r) => r !== run && r.u !== run.u && canSee(r)).sort((a, b) => a.t - b.t);
  const hidden = field.filter((r) => r !== run && r.u !== run.u && !canSee(r)).length;   // a competition not over yet
  const lost = loss.reduce((s, l) => s + (l.lost > 0 ? l.lost : 0), 0);

  el.innerHTML = html`<div class="vtp-anhead">
      <select id="vtp-run" aria-label="${t("vt.an.run")}">${mineRuns.map((r) => html`<option value="${r.id}" ${raw(r.id === run.id ? "selected" : "")}>${mapName(r.race)} · ${courseName({ id: r.course })} · ${fmtDate(String(r.at).slice(0, 10))} · ${clock(r.t)}</option>`)}</select>
      <span class="muted">${t("vt.an.summary", { time: clock(run.t), km: fmt((run.d || 0) / 1000, 2), lost: clock(lost) })}${run.help ? html` · <span class="tag">${t("vt.why.help")}</span>` : ""}${run.mo ? html` · <span class="tag" title="${t("vt.mo.label")}">${mapOptText(t, moOf(run.mo))}</span>` : ""}</span>
    </div>
    ${others.length ? html`<div class="vtp-cmp"><span class="vtp-mode" role="group" aria-label="${t("vt.an.modeLabel")}">
        <button type="button" class="btn btn-sm" id="vtp-solo" aria-pressed="true" title="${t("vt.an.soloTip")}">${t("vt.an.solo")}</button>
        <button type="button" class="btn btn-sm" id="vtp-multi" aria-pressed="false" title="${t("vt.an.multiTip")}">${t("vt.an.multi")}</button></span>
      <span class="muted">${t("vt.an.compare")}</span>${others.map((r, i) => html`<label class="vtp-chip"><input type="checkbox" data-other="${r.id}">
      <span class="vtp-sw" style="background:${OTHERS[i % OTHERS.length]}"></span>${displayName(r.name)} <span class="muted">${clock(r.t)}</span></label>`)}</div>`
      : hidden ? "" : html`<p class="muted vtp-cmp">${t("vt.an.alone")}</p>`}
    ${hidden ? html`<p class="muted vtp-cmp">${tn("vt.an.compHidden", hidden)}</p>` : ""}
    <div class="vtp-an">
      <div class="vtp-anmain">
        <div class="vtp-anmap"><canvas></canvas><div class="vtp-anbar"><button type="button" class="btn btn-sm" data-z="1.4" title="${t("vt.map.zoomIn")}">+</button>
          <button type="button" class="btn btn-sm" data-z="0.71" title="${t("vt.map.zoomOut")}">−</button><button type="button" class="btn btn-sm" id="vtp-fit" title="${t("vt.an.fit")}">⤢</button></div>
          <div class="vtp-anload muted">${t("vt.drawingMap")}</div></div>
        <div class="vtp-transport"><button type="button" class="btn btn-sm" id="vtp-play" title="${t("vt.an.play")}">▶</button>
          <select id="vtp-speed" aria-label="${t("vt.an.speed")}">${SPEEDS.map((s) => html`<option value="${s}" ${raw(s === 10 ? "selected" : "")}>×${s}</option>`)}</select>
          <input type="range" id="vtp-time" min="0" max="${Math.ceil(run.t)}" step="1" value="0" aria-label="${t("vt.an.time")}"><span id="vtp-clock">0:00</span></div>
        <canvas class="vtp-strip"></canvas>
      </div>
      <div class="vtp-legs"><div class="table-wrap"><table class="data compact" data-freeze="1"><thead><tr><th>${t("vt.col.leg")}</th><th class="num">${t("vt.col.split")}</th>
        <th class="num">${t("vt.col.rank")}</th><th class="num">${t("vt.col.best")}</th><th class="num" title="${t("vt.an.lostTip")}">${t("vt.col.lost")}</th>
        <th class="num" title="${t("vt.an.runTip")}">${t("vt.col.run")}</th><th class="num">${t("vt.col.pace")}</th></tr></thead>
        <tbody>${mine.map((v, i) => html`<tr data-leg="${i}" class="${loss[i].mistake ? "vtp-err" : ""}"><td>${i === 0 ? "S" : i}→${i === nL - 1 ? t("vt.finishShort") : i + 1}</td>
          <td class="num">${clock(v)}</td><td class="num">${rankOf(i) ?? "—"}</td><td class="num">${clock(best[i])}</td>
          <td class="num">${loss[i].lost == null ? "—" : Math.round(Math.abs(loss[i].lost)) === 0 ? "0:00" : `${loss[i].lost > 0 ? "+" : "−"}${clock(Math.abs(loss[i].lost))}`}</td>
          <td class="num" id="vtp-run-${i}">—</td><td class="num" id="vtp-pace-${i}">—</td></tr>`)}</tbody></table></div>
        <p class="muted vtp-legnote">${t("vt.an.legNote", { n: field.length })}</p></div>
    </div>`;
  $("#vtp-run", el).addEventListener("change", (e) => onRun(e.target.value));

  const box = $(".vtp-anmap", el), cv = $("canvas", box), strip = $(".vtp-strip", el), slider = $("#vtp-time", el);
  let img = null, stopped = false, playing = false, T = 0, raf = 0, lastNow = 0, legSel = null;
  const shown = new Map([[run.id, { colour: ME, route: [] }]]);
  const view = { cx: 0, cy: 0, z: 1, drag: null };
  const mPer = () => img.ppm / img.k;
  const fit = (pts) => {
    if (!img || !pts.length) return;
    const xs = pts.map((p) => p[0] * mPer()), ys = pts.map((p) => p[1] * mPer());
    const r = 4 * img.ppm;                                   // the control circles whole (3 mm and their line)
    const x0 = Math.min(...xs) - r, x1 = Math.max(...xs) + r, y0 = Math.min(...ys) - r, y1 = Math.max(...ys) + r, pad = 40;
    view.cx = (x0 + x1) / 2; view.cy = (y0 + y1) / 2;
    // no closer than the map was drawn for (2.5 screen px a map image px)
    view.z = Math.min(2.5, (box.clientWidth - pad) / Math.max(40, x1 - x0), (box.clientHeight - pad) / Math.max(40, y1 - y0));
  };
  const fitAll = () => fit([...ctl.map((c) => [c.x, c.z]), ...shown.get(run.id).route.map((p) => [p[1], p[2]])]);
  function drawMapView() {
    const w = box.clientWidth, h = box.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    if (!img) return;
    g.save(); g.translate(w / 2, h / 2); g.scale(view.z, view.z); g.translate(-view.cx, -view.cy);
    g.imageSmoothingQuality = "high"; g.drawImage(img.canvas, 0, 0);
    img.overprint(g);
    const k = mPer();
    for (const [id, s] of shown) {
      if (!s.route.length) continue;
      g.lineJoin = g.lineCap = "round";
      // the route run so far, the rest faint
      const now = T;
      g.strokeStyle = s.colour; g.globalAlpha = 0.25; g.lineWidth = 2.5 / view.z; g.beginPath();
      s.route.forEach(([, x, z], i) => (i ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k))); g.stroke();
      g.globalAlpha = 0.95; g.lineWidth = 3.2 / view.z; g.beginPath();
      let started = false;
      for (const [tt, x, z] of s.route) { if (tt > now) break; started ? g.lineTo(x * k, z * k) : g.moveTo(x * k, z * k); started = true; }
      const p = posAt(s.route, now);
      if (p && started) g.lineTo(p[1] * k, p[2] * k);
      g.stroke(); g.globalAlpha = 1;
      if (p) { g.fillStyle = s.colour; g.strokeStyle = "#fff"; g.lineWidth = 2 / view.z; g.beginPath(); g.arc(p[1] * k, p[2] * k, 6 / view.z, 0, 7); g.fill(); g.stroke(); }
    }
    g.restore();
  }
  function drawStrip() {
    const route = shown.get(run.id).route;
    if (!route.length) return;
    const n = stripSamples(strip), series = [];
    for (const [, s] of shown) {
      if (!s.route.length) continue;
      const vals = Array.from({ length: n }, (_, i) => {
        const tt = (i / (n - 1)) * run.t, a = posAt(s.route, tt - 5), b = posAt(s.route, tt + 5);
        return tt > s.route[s.route.length - 1][0] ? null : Math.hypot(b[1] - a[1], b[2] - a[2]) / Math.max(1, b[0] - a[0]);
      });
      series.push({ colour: s.colour, vals, bold: s.colour === ME });
    }
    const step = run.t > 3600 ? 900 : run.t > 1200 ? 300 : 120;
    const ticks = []; for (let s = 0; s <= run.t; s += step) ticks.push({ f: s / run.t, label: clock(s) });
    const marks = run.sp.slice(0, -1).map((s, i) => ({ f: s / run.t, label: String(i + 1) }));
    drawPaceStrip(strip, { series, cursor: T / run.t, ticks, marks });
  }
  const redraw = () => { drawMapView(); drawStrip(); slider.value = String(Math.round(T)); $("#vtp-clock", el).textContent = clock(T);
    const leg = run.sp.findIndex((s) => s >= T); $$("tr[data-leg]", el).forEach((tr) => tr.classList.toggle("vtp-cur", +tr.dataset.leg === (leg < 0 ? nL - 1 : leg))); };
  const seek = (s) => { T = Math.max(0, Math.min(run.t, s)); redraw(); };

  // the transport
  const playBtn = $("#vtp-play", el);
  const setPlay = (on) => { playing = on; playBtn.textContent = on ? "⏸" : "▶"; playBtn.title = t(on ? "vt.an.pause" : "vt.an.play"); if (on) { lastNow = performance.now(); raf = requestAnimationFrame(tick); } };
  function tick(now) {
    if (!playing || stopped) return;
    const dt = (now - lastNow) / 1000; lastNow = now;
    T += dt * +$("#vtp-speed", el).value;
    if (legSel != null && T >= run.sp[legSel]) { T = run.sp[legSel]; setPlay(false); }
    if (T >= run.t) { T = run.t; setPlay(false); }
    redraw();
    if (playing) raf = requestAnimationFrame(tick);
  }
  playBtn.addEventListener("click", () => { if (!playing && T >= run.t) T = 0; setPlay(!playing); });
  slider.addEventListener("input", () => { legSel = null; seek(+slider.value); });
  strip.addEventListener("click", (e) => { legSel = null; seek(stripFraction(strip, e.offsetX) * run.t); });
  // the map: drag, wheel, buttons
  cv.addEventListener("pointerdown", (e) => { view.drag = [e.clientX, e.clientY, view.cx, view.cy]; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => { if (!view.drag) return; view.cx = view.drag[2] - (e.clientX - view.drag[0]) / view.z; view.cy = view.drag[3] - (e.clientY - view.drag[1]) / view.z; drawMapView(); });
  cv.addEventListener("pointerup", () => (view.drag = null));
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const f = e.deltaY < 0 ? 1.2 : 1 / 1.2, rc = cv.getBoundingClientRect();
    const px = e.clientX - rc.left - rc.width / 2, py = e.clientY - rc.top - rc.height / 2;
    if (view.z * f > 6 || view.z * f < 0.02) return;
    view.cx += px / view.z - px / (view.z * f); view.cy += py / view.z - py / (view.z * f); view.z *= f; drawMapView(); }, { passive: false });
  $$("[data-z]", box).forEach((b) => b.addEventListener("click", () => { view.z *= +b.dataset.z; drawMapView(); }));
  $("#vtp-fit", el).addEventListener("click", () => { legSel = null; fitAll(); drawMapView(); });
  // a leg chosen: framed with its two controls, the time at its start, played to its end
  $$("tr[data-leg]", el).forEach((tr) => tr.addEventListener("click", () => {
    const i = +tr.dataset.leg, a = i ? run.sp[i - 1] : 0, b = run.sp[i];
    const pts = [[ctl[i].x, ctl[i].z], [ctl[i + 1].x, ctl[i + 1].z], ...shown.get(run.id).route.filter((p) => p[0] >= a && p[0] <= b).map((p) => [p[1], p[2]])];
    fit(pts); legSel = i; setPlay(false); seek(a);
  }));
  // the others: ticked one by one (multi), « Avec tous » every one, « Seul » none (solo)
  const modeMark = () => { const n = $$("[data-other]", el).filter((c) => c.checked).length;
    $("#vtp-solo", el)?.setAttribute("aria-pressed", String(n === 0)); $("#vtp-multi", el)?.setAttribute("aria-pressed", String(n === others.length)); };
  const showOther = async (cb, i) => {
    const r = others.find((x) => x.id === cb.dataset.other);
    if (!cb.checked) { shown.delete(r.id); redraw(); modeMark(); return; }
    shown.set(r.id, { colour: OTHERS[i % OTHERS.length], route: [] });
    modeMark();
    try { shown.get(r.id).route = await routeOf(r.race, r.id); } catch (e) { cb.checked = false; shown.delete(r.id); modeMark(); }
    redraw();
  };
  $$("[data-other]", el).forEach((cb, i) => cb.addEventListener("change", () => showOther(cb, i)));
  $("#vtp-solo", el)?.addEventListener("click", () => $$("[data-other]", el).forEach((cb, i) => { if (cb.checked) { cb.checked = false; showOther(cb, i); } }));
  $("#vtp-multi", el)?.addEventListener("click", () => $$("[data-other]", el).forEach((cb, i) => { if (!cb.checked) { cb.checked = true; showOther(cb, i); } }));
  const ro = new ResizeObserver(() => redraw()); ro.observe(box); ro.observe(strip);

  // the map and one's route
  try {
    const [m, route] = await Promise.all([mapOf(race), routeOf(run.race, run.id)]);
    if (stopped) return () => {};
    const { drawOverprint } = await import("../games/virtually.js");
    img = { ...m, overprint: (g) => drawOverprint(g, ctl, m.ppm / m.k, m.ppm) };
    shown.get(run.id).route = route;
    $(".vtp-anload", box).remove();
    run.sp.forEach((s, i) => {
      const a = i ? run.sp[i - 1] : 0, d = runBetween(route, a, s), straight = Math.hypot(ctl[i + 1].x - ctl[i].x, ctl[i + 1].z - ctl[i].z);
      const cell = $(`#vtp-run-${i}`, el); if (cell) { cell.textContent = `${fmt(d)} m`; cell.title = t("vt.an.runCell", { pct: fmt(straight ? (100 * d) / straight - 100 : 0) }); }
      const pc = $(`#vtp-pace-${i}`, el); if (pc) pc.textContent = paceTxt(s - a, d);
    });
    fitAll(); redraw();
  } catch (e) {
    console.error(e);
    const l = $(".vtp-anload", box); if (l) l.textContent = t("vt.error");
  }
  return () => { stopped = true; playing = false; cancelAnimationFrame(raf); ro.disconnect(); };
}
