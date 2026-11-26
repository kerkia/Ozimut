// Pixel › Entraînement › « Terrain imaginaire » (owner, 2026-11-12): forests that exist nowhere, made in the browser from a seed
// (games/vgen.js in a worker, games/vgenpack.js), map and terrain from one model.
// - « Carte du jour »: one seed a day (Paris), its terrain type in turn, the same world and six courses for everyone; each runner's
//   runs are training (owner, 2026-11-14: « Carte du jour remains a training, hence no result »: a palmarès of each runner's best
//   time, as the maps'; the first runs were ranked from 2026-11-12 to 14); the runs are kept under the race « day-YYYYMMDD »
//   with the courses' signature as their event (functions/api/virtual: today's and yesterday's only). Not counted in the virtual
//   index (it counts competitions alone).
// - « Terrain libre »: a terrain type, a number, sliders (size, detail, relief, vegetation, paths); played, never kept.
// The same for sprint (owner, 2026-11-26): invented towns (games/vtowngen.js, ISSprOM 2019-2 at 1:4000), « Carte du jour — sprint »
// (race « day-YYYYMMDD-s ») and « Terrain libre — sprint » (a number, a size, how built-up, gardens, parks); the page's tile chosen
// says which pair is drawn (ctx.kind).
// The worlds made stay in memory for the visit (a second visit to the tab finds them).

import { html, raw, $, $$, fmt, pct, displayName } from "../util.js";
import { t, locale } from "../i18n.js";
import { TYPES } from "../games/vgen.js";

const state = { free: { type: "moraine", seed: 1 + Math.floor(Math.random() * 99999), size: 1200, detail: 0.5, relief: 0.5, green: 0.5, paths: 0.5 },
  sfree: { seed: 1 + Math.floor(Math.random() * 99999), size: 700, buildings: 0.5, gardens: 0.5, parks: 0.5 },
  made: { day: null, free: null, sday: null, sfree: null }, busy: { day: null, free: null, sday: null, sfree: null }, sel: { day: null, free: null, sday: null, sfree: null } };
// the section's element and the page's helpers: the latest drawing's (the page draws Training again on each choice of map, and a
// world still being made finishes into the section shown then)
const V = { el: null, ctx: null };
const SLIDERS = ["detail", "relief", "green", "paths"], SSLIDERS = ["buildings", "gardens", "parks"];
const PREFS = "ocn.vt.gen", SPREFS = "ocn.vt.gens";
try { Object.assign(state.free, JSON.parse(localStorage.getItem(PREFS) || "{}")); } catch (e) { /* defaults */ }
try { Object.assign(state.sfree, JSON.parse(localStorage.getItem(SPREFS) || "{}")); } catch (e) { /* defaults */ }
const keep = () => { try { localStorage.setItem(PREFS, JSON.stringify(state.free)); localStorage.setItem(SPREFS, JSON.stringify(state.sfree)); } catch (e) { /* not kept */ } };

const dateText = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), 12)).toLocaleDateString(locale(), { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Draw the section in `el`. ctx: play(race, course) — the page's own (games/virtually.js mounted in place) —, runsOf(raceId),
 * courseName(course), swatch(levelId), offered(courses), kind ("forest" | "sprint": which pair of boxes).
 */
export async function renderGen(el, ctx) {
  V.el = el; V.ctx = ctx;
  const P = await import("../games/vgenpack.js");
  const dayKey = P.parisDay(), dayO = P.dayOpts(dayKey), sdayO = P.dayOpts(`${dayKey}-s`);
  const draw = () => {
    if (!V.el?.isConnected) return;                         // a race under way, or another tab: drawn again when Training is
    if (V.ctx.kind === "sprint") { drawSprint(); return; }
    const f = state.free;
    V.el.innerHTML = html`<h2 class="vtp-h">${t("vtg.h")} <span class="tag vtg-tag">${t("vtg.tag")}</span></h2>
      <p class="muted vtp-intro">${t("vtg.intro")}</p>
      <div class="vtg">
        <section class="card vtg-box" data-k="day">
          <h3>${t("vtg.day.h")} · ${dateText(dayKey)}</h3>
          <p class="muted">${t("vtg.day.line", { type: t(`vtg.type.${dayO.type}`) })}</p>
          ${made("day")}
        </section>
        <section class="card vtg-box" data-k="free">
          <h3>${t("vtg.free.h")}</h3>
          <p class="muted">${t("vtg.free.line")}</p>
          <div class="vtg-form">
            <label class="vtg-row"><span>${t("vtg.type")}</span><select id="vtg-type">${TYPES.map((k) => html`<option value="${k}" ${raw(k === f.type ? "selected" : "")}>${t(`vtg.type.${k}`)}</option>`)}</select></label>
            <p class="muted vtg-hint">${t(`vtg.typeHint.${f.type}`)}</p>
            <label class="vtg-row"><span>${t("vtg.seed")}</span><span class="vtg-seed"><input id="vtg-seed" type="number" min="1" max="999999" step="1" value="${f.seed}">
              <button type="button" class="btn btn-sm" id="vtg-rand" title="${t("vtg.randomTip")}">🎲 ${t("vtg.random")}</button></span></label>
            <label class="vtg-row"><span>${t("vtg.size")}</span><input id="vtg-size" type="range" min="800" max="1600" step="200" value="${f.size}"><output id="vtg-size-v">${t("vtg.km", { km: fmt(f.size / 1000, 1) })}</output></label>
            ${SLIDERS.map((k) => html`<label class="vtg-row" title="${t(`vtg.${k}Tip`)}"><span>${t(`vtg.${k}`)}</span><input data-sl="${k}" type="range" min="0" max="1" step="0.1" value="${f[k]}">
              <output>${pct(f[k])}</output></label>`)}
          </div>
          ${made("free")}
        </section>
      </div>`;
    bind();
  };
  // the sprint's pair: an invented town for the day, a town of one's own
  const drawSprint = () => {
    const f = state.sfree;
    V.el.innerHTML = html`<h2 class="vtp-h">${t("vtg.s.h")} <span class="tag vtg-tag">${t("vtg.tag")}</span></h2>
      <p class="muted vtp-intro">${t("vtg.s.intro")}</p>
      <div class="vtg">
        <section class="card vtg-box" data-k="sday">
          <h3>${t("vtg.sday.h")} · ${dateText(dayKey)}</h3>
          <p class="muted">${t("vtg.sday.line")}</p>
          ${made("sday")}
        </section>
        <section class="card vtg-box" data-k="sfree">
          <h3>${t("vtg.sfree.h")}</h3>
          <p class="muted">${t("vtg.sfree.line")}</p>
          <div class="vtg-form">
            <label class="vtg-row"><span>${t("vtg.seed")}</span><span class="vtg-seed"><input id="vtg-seed" type="number" min="1" max="999999" step="1" value="${f.seed}">
              <button type="button" class="btn btn-sm" id="vtg-rand" title="${t("vtg.s.randomTip")}">🎲 ${t("vtg.random")}</button></span></label>
            <label class="vtg-row"><span>${t("vtg.size")}</span><input id="vtg-size" type="range" min="500" max="1000" step="100" value="${f.size}"><output id="vtg-size-v">${t("vtg.km", { km: fmt(f.size / 1000, 1) })}</output></label>
            ${SSLIDERS.map((k) => html`<label class="vtg-row" title="${t(`vtg.s.${k}Tip`)}"><span>${t(`vtg.s.${k}`)}</span><input data-sl="${k}" type="range" min="0" max="1" step="0.1" value="${f[k]}">
              <output>${pct(f[k])}</output></label>`)}
          </div>
          ${made("sfree")}
        </section>
      </div>`;
    bind();
  };
  // a world's block: « Créer », the progress, then its courses, « Commencer » and (the day's) the results
  const isDay = (k) => k === "day" || k === "sday", isFree = (k) => k === "free" || k === "sfree";
  const makeLabel = (k) => t(k === "day" ? "vtg.day.make" : k === "sday" ? "vtg.sday.make" : k === "sfree" ? "vtg.s.make" : "vtg.make");
  const made = (k) => {
    const b = state.busy[k], m = state.made[k];
    if (b) return html`<div class="vtg-busy"><progress class="wait-bar" max="1" value="${b.f}"></progress><span class="muted">${t(`vtg.step.${b.step}`)}</span></div>`;
    if (b === false) return html`<p class="vtg-err">${t("vtg.err")}</p><button type="button" class="btn btn-primary" data-make="${k}">${makeLabel(k)}</button>`;
    if (!m || (isFree(k) && m.key !== freeKey(k))) return html`<button type="button" class="btn btn-primary" data-make="${k}">${makeLabel(k)}</button>
      ${m && isFree(k) ? html` <span class="muted">${t("vtg.changed")}</span>` : ""}`;
    const cs = V.ctx.offered(m.race.race.courses), sel = state.sel[k];
    if (!cs.length) return html`<p class="muted">${t("vtg.noCourse")}</p>`;
    return html`<p class="muted vtg-made">${t(k === "sday" || k === "sfree" ? "vtg.s.made" : "vtg.made", { s: fmt(m.ms / 1000, 1), km: fmt(m.size / 1000, 1) })}</p>
      ${checkLine(m.chk)}
      <div class="vtp-courses">${cs.map((c) => html`<button type="button" class="vtp-course" data-gk="${k}" data-course="${c.id}" aria-pressed="${c.id === sel}">
        ${V.ctx.swatch(c.id)}<b>${V.ctx.courseName(c)}</b><span>${t("vt.tr.courseLine", { km: fmt(c.length / 1000, 1), climb: fmt(c.climb || 0), n: c.controls.length - 2 })}</span></button>`)}</div>
      <div class="vtp-go"><button type="button" class="btn btn-primary" data-go="${k}" ${raw(sel ? "" : "disabled")}>${t("vt.tr.start")}</button>
        ${isFree(k) ? html`<span class="muted">${t("vtg.notKeptHint")}</span>` : html`<span class="muted">${t("vtg.day.notCounted")}</span>`}</div>
      ${isDay(k) ? html`<h4 class="vtg-rh">${t("vtg.day.results")}</h4><div class="vtg-results" data-rk="${k}"><div class="boot"><div class="spinner"></div></div></div>` : ""}`;
  };
  // the map's check against ISOM 2017-2 (games/vcheck.js): one line, the points left listed under it
  const checkLine = (chk) => {
    if (!chk) return "";
    const err = chk.findings.filter((f) => f.sev === "error"), warn = chk.findings.filter((f) => f.sev !== "error");
    const n = (fs) => fs.reduce((s, f) => s + f.n, 0);
    const head = !chk.findings.length ? t("vtg.chk.ok", { n: chk.checked.length })
      : err.length ? t("vtg.chk.err", { n: chk.checked.length, e: n(err), w: n(warn) }) : t("vtg.chk.warn", { n: chk.checked.length, w: n(warn) });
    if (!chk.findings.length) return html`<p class="muted vtg-chk ok">✓ ${head}</p>`;
    return html`<details class="vtg-chk ${raw(err.length ? "bad" : "")}"><summary>${err.length ? "✗" : "✓"} ${head}</summary><ul>
      ${chk.findings.map((f) => html`<li>${ruleText(f.id)} × ${f.n}${f.sev === "error" ? "" : html` <span class="muted">(${t("vtg.chk.warnTag")})</span>`}</li>`)}</ul></details>`;
  };
  const ruleText = (id) => {
    const m = /^fo\.min\.(\d+)\.(area|width|length)$/.exec(id);
    if (m) return t(`vtg.chk.min.${m[2]}`, { sym: m[1] });
    const k = `vtg.chk.r.${id.replace(/\./g, "_")}`, s = t(k);
    return s === k ? id : s;
  };
  const freeKey = (k = "free") => { const f = state[k]; return k === "sfree" ? ["s", f.seed, f.size, ...SSLIDERS.map((n) => f[n])].join("|")
    : [f.type, f.seed, f.size, ...SLIDERS.map((n) => f[n])].join("|"); };

  function bind() {
    const f = V.ctx.kind === "sprint" ? state.sfree : state.free, redraw = () => { keep(); draw(); };
    $("#vtg-type", V.el)?.addEventListener("change", (e) => { f.type = e.target.value; redraw(); });
    $("#vtg-seed", V.el)?.addEventListener("change", (e) => { const v = Math.round(+e.target.value); f.seed = v >= 1 && v <= 999999 ? v : f.seed; redraw(); });
    $("#vtg-rand", V.el)?.addEventListener("click", () => { f.seed = 1 + Math.floor(Math.random() * 999999); redraw(); });
    $("#vtg-size", V.el)?.addEventListener("input", (e) => { $("#vtg-size-v", V.el).textContent = t("vtg.km", { km: fmt(+e.target.value / 1000, 1) }); });
    $("#vtg-size", V.el)?.addEventListener("change", (e) => { f.size = +e.target.value; redraw(); });
    $$("[data-sl]", V.el).forEach((s) => {
      s.addEventListener("input", () => { s.nextElementSibling.textContent = pct(+s.value); });
      s.addEventListener("change", () => { f[s.dataset.sl] = +s.value; redraw(); });
    });
    $$("[data-make]", V.el).forEach((b) => b.addEventListener("click", () => make(b.dataset.make)));
    $$("[data-gk]", V.el).forEach((b) => b.addEventListener("click", () => { state.sel[b.dataset.gk] = b.dataset.course; draw(); }));
    $$("[data-go]", V.el).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.go, m = state.made[k], c = m.race.race.courses.find((x) => x.id === state.sel[k]);
      if (c) V.ctx.play(m.race, c);
    }));
    for (const box of $$(".vtg-results", V.el)) if (state.made[box.dataset.rk]) dayResults(box.dataset.rk);
  }

  async function make(k) {
    if (state.busy[k]) return;                              // already being made
    const o = k === "day" ? dayO : k === "sday" ? sdayO : k === "sfree" ? { sprint: true, ...state.sfree } : { ...state.free };
    state.busy[k] = { step: "relief", f: 0 }; draw();
    let last = 0;
    try {
      const res = await P.makeWorld(o, (step, f) => {
        state.busy[k] = { step, f: progressOf(step, f, !!o.sprint) };
        const now = performance.now(); if (now - last < 120) return; last = now;
        const box = $(`[data-k="${k}"] .vtg-busy`, V.el);
        if (box) { box.querySelector("progress").value = state.busy[k].f; box.querySelector("span").textContent = t(`vtg.step.${step}`); }
      });
      state.busy[k] = { step: "build", f: 0.97 }; draw();
      const id = k === "day" ? `day-${dayKey}` : k === "sday" ? `day-${dayKey}-s` : k === "sfree" ? `gen-sprint-${o.seed}` : `gen-${o.type}-${o.seed}`;
      const name = k === "day" ? t("vtg.name.day", { date: dateText(dayKey) }) : k === "sday" ? t("vtg.name.sday", { date: dateText(dayKey) })
        : k === "sfree" ? t("vtg.name.sfree", { seed: o.seed }) : t("vtg.name.free", { type: t(`vtg.type.${o.type}`), seed: o.seed });
      let data = null;
      const load = async () => (data ||= await P.packageOf(res, { id, title: name }));
      const raceJ = o.sprint ? { id, scale: 4000, std: "ISSprOM 2019", source: "gentown", courses: res.courses }
        : { id, scale: 10000, std: "ISOM 2017-2", source: "gen", courses: res.courses };
      const sig = P.courseSig(res.courses);
      state.made[k] = { key: isFree(k) ? freeKey(k) : dayKey, ms: res.ms, size: res.world.W, chk: res.world.check,
        race: { id, name, gen: true, day: isDay(k), sig, noSave: isFree(k), race: raceJ, load } };
      const cs = V.ctx.offered(res.courses);
      state.sel[k] = state.sel[k] && cs.some((c) => c.id === state.sel[k]) ? state.sel[k] : cs[2]?.id || cs[0]?.id || null;
      state.busy[k] = null;
    } catch (e) {
      console.error(e); state.busy[k] = false;
    }
    draw();
  }
  async function dayResults(k) {
    const m = state.made[k], box = V.el?.isConnected && $(`.vtg-results[data-rk="${k}"]`, V.el); if (!box) return;
    let runs;
    try { runs = (await V.ctx.runsOf(m.race.id)).filter((r) => r.event === m.race.sig); } catch (e) { box.innerHTML = String(html`<p class="muted">${t("g.palm.err")}</p>`); return; }
    const c = state.sel[k], mine = runs.filter((r) => r.course === c).sort((a, b) => a.at.localeCompare(b.at));
    // the palmarès: each runner's best time, the 20 best (a training: as many runs as one likes)
    const bestOf = new Map(); for (const r of mine) { const b = bestOf.get(r.u); if (!r.help && (!b || r.t < b.t)) bestOf.set(r.u, r); }
    const ranked = [...bestOf.values()].sort((a, b) => a.t - b.t).slice(0, 20), best = ranked[0]?.t;
    if (!box.isConnected) return;
    box.innerHTML = String(ranked.length ? html`<table class="data g-palm-t"><thead><tr><th class="num">${t("vt.col.place")}</th><th>${t("vt.col.runner")}</th>
        <th class="num">${t("vt.col.time")}</th><th class="num">${t("vt.col.gap")}</th></tr></thead>
      <tbody>${ranked.map((r, i) => html`<tr class="${r.mine ? "g-palm-me" : ""}"><td class="num">${i + 1}</td><td>${displayName(r.name)}${r.mine ? html` <span class="tag">${t("vt.me")}</span>` : ""}</td>
        <td class="num"><b>${clock(r.t)}</b></td><td class="num">${i ? `+${clock(r.t - best)}` : ""}</td></tr>`)}</tbody></table>`
      : html`<p class="muted">${t("vtg.day.none")}</p>`);
  }
  draw();
}
// the progress bar's share: each step's part of the whole (measured on the PC, 2026-11-12)
const STEPS = { relief: [0, 0.14], cover: [0.14, 0.28], classes: [0.28, 0.48], paths: [0.48, 0.58], ground: [0.58, 0.68], map: [0.68, 0.85], courses: [0.85, 0.95], build: [0.95, 1] };
// a town's (measured on the PC, 2026-11-26)
const SSTEPS = { relief: [0, 0.04], streets: [0.04, 0.12], buildings: [0.12, 0.24], classes: [0.24, 0.34], ground: [0.34, 0.47], map: [0.47, 0.66], town: [0.66, 0.68],
  courses: [0.68, 0.95], build: [0.95, 1] };
const progressOf = (step, f, sprint) => { const [a, b] = (sprint ? SSTEPS : STEPS)[step] || [0, 1]; return a + (b - a) * f; };
const clock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; };
