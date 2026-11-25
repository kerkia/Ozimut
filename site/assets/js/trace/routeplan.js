// Route choices on the analyses' maps (a prototype, 2026-10-24; every account's since 2026-11-04): the page's side of trace/routechoice.js
// — the worker that reads the map and searches the legs, the settings panel shared by « Analyse solo » and « Analyse
// multi » (with the reading's progress, a warning when the reading looks wrong, the terrain's legend), the routes and the
// decision map drawn over the map, the reference pace from a runner's own legs.

import { html, raw, $, fmt, pct, pctN } from "../util.js";
import { t } from "../i18n.js";
import { replaced } from "../front.js";
import * as offers from "../offers.js";
import { DEFAULTS, LEGEND, A, CROSS_PACE } from "./routechoice.js";
import { layers, resampleLayers, LAYER_KEYS, OPTIONAL_KEYS, VECTOR_ACCEPT } from "./vectorroutes.js";

const PREFS = "ocn.rc.prefs";                        // the settings, kept on the device (the map's kind apart: the race's)
const MAX_PX = 9e6;                                  // a larger map is read at a reduced size (memory, time)
const SRC_PX = 30e6;                                 // the pixels handed to the worker at most (120 MB)
export const ROUTE_COLOURS = ["#00a651", "#f7941d", "#0072bc", "#e0218a"];
export const LETTERS = ["A", "B", "C", "D"];
const SPEED_KEYS = ["track", "path", "small", "open", "rough", "g1", "g2", "g3", "marsh", "paved", "grey", "shallow"];
const VECTOR_SPEEDS = ["slow1", "slow2", "slow3"];         // an OCAD or Mapper map's stony or sandy ground: shown with one only

/** The settings: the saved ones over the defaults; the map's kind from the race (`map`), unless changed this visit. */
export function loadSettings(map = "forest", opened = null) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { /* defaults */ }
  // what Ozimut decides itself, never the user (owner, 2026-11-05): the black lines read automatically, the relief from the map's
  // own contour lines (the model where too few are read), their interval the standard's — 2.5 m in sprint, 5 m in forest
  const s = { ...DEFAULTS, ...saved, map, black: "auto", relief: "contours", speeds: { ...DEFAULTS.speeds, ...(saved.speeds || {}) } };
  // the speeds adjusted on the runners' own times are a capability (docs/billing/design.md, routesOwnSpeeds; `opened`: what a map
  // analysis's organiser opens to its participants): an account without it computes unadjusted, its saved choice kept as it is
  const lack = !offers.has(OWN_SPEEDS, opened);
  CAP.set(s, { opened, lack, wish: !!s.calib });
  if (lack) s.calib = false;
  return s;
}
const OWN_SPEEDS = "routesOwnSpeeds", CAP = new WeakMap();
function saveSettings(s) {
  const { map, ...rest } = s;
  if (CAP.get(s)?.lack) rest.calib = CAP.get(s).wish;
  try { localStorage.setItem(PREFS, JSON.stringify(rest)); } catch (e) { /* this visit only */ }
}
/** Whether a race reads as a sprint (its discipline, else its name). */
export const isSprint = (race) => /sprint/i.test(`${race?.terrain || ""} ${race?.format || ""} ${race?.name || ""}`);

/**
 * The planner of one map: image (an ImageBitmap or canvas), toM(px, py) the metres of a map pixel (any affine frame); vector:
 * an OCAD or Mapper map of it ({ v: trace/vectorroutes.js readVector's, T: the affine from its mm to the image's pixels }, or the
 * layers already drawn from one on the image's pixels: { layers: unpackLayers's, name }), whose symbols are read instead of the
 * image's colours; opts: { map (the map's kind), onProgress(f) (the reading's) }.
 * Returns { ready (Promise of the reading's facts), dem(grid), settings(s, onProgress) (the new facts when the map was read
 * again, else null), controls(pts) (the course's controls), leg(a, b), decision(a, b), line(pts), picture(), destroy(), and for a
 * tour through many controls forbid(areas, lines), tour(pts, k), path(a, b) }; points in the map's own pixels.
 */
export function planner(image, toM, vector = null, opts = {}) {
  // (a scanned PDF's page: the scan's own pixels, mapfile.js `native` — the points stay the map's as shown)
  const W0 = image.width, H0 = image.height, src = image.native || image, ws = src.width, hs = src.height;
  const ks = ws * hs > MAX_PX ? Math.sqrt(MAX_PX / (ws * hs)) : 1;
  const W = Math.round(ws * ks), H = Math.round(hs * ks), sc = W / W0;
  const o = toM(0, 0), ex = toM(1, 0), ey = toM(0, 1);
  // metres of one pixel of the image read, in x and y: columns of J
  const J = [[(ex[0] - o[0]) / sc, (ey[0] - o[0]) / sc], [(ex[1] - o[1]) / sc, (ey[1] - o[1]) / sc]];
  const worker = new Worker(new URL("./routeworker.js", import.meta.url), { type: "module" });
  let seq = 0;
  const waiting = new Map();
  worker.onmessage = (e) => {
    const p = waiting.get(e.data.id);
    if (!p) return;
    if (e.data.progress != null) { p.progress?.(e.data.progress); return; }
    waiting.delete(e.data.id);
    if (e.data.ok) p.ok(e.data); else p.ko(new Error(e.data.error));
  };
  // a page opened before a deploy asks for the worker of the build before, gone with it (owner, 2026-11-23: « Itinéraires »
  // computed nothing): said as such, the page to be reloaded
  worker.onerror = async (e) => {
    const gone = await replaced(), err = Object.assign(new Error(gone ? t("rc.st.updated") : e.message || "worker"), { updated: gone });
    for (const p of waiting.values()) p.ko(err);
    waiting.clear();
  };
  const ask = (op, body = {}, transfer = [], progress = null) => new Promise((ok, ko) => { const id = ++seq; waiting.set(id, { ok, ko, progress }); worker.postMessage({ id, op, ...body }, transfer); });
  let ready;
  if (vector) {
    const T = vector.T, L = vector.layers ? resampleLayers(vector.layers, W, H)
      : layers(vector.v, { a: T.a * sc, b: T.b * sc, c: T.c * sc, d: T.d * sc, e: T.e * sc, f: T.f * sc }, W, H);
    // sent to the worker, not copied: a copy of layers kept by the page (they serve the planner made after a change)
    const planes = {};
    for (const k of LAYER_KEYS) planes[k] = (L[k] ? (L === vector.layers ? L[k].slice() : L[k]) : new Uint8Array(W * H)).buffer;
    for (const k of OPTIONAL_KEYS) if (L[k]) planes[k] = (L === vector.layers ? L[k].slice() : L[k]).buffer;      // a table per symbol's speeds
    ready = ask("layers", { ...planes, w: W, h: H, J }, Object.values(planes))
      .then((r) => ({ ...r, vector: { counts: L.counts, ms: L.ms, name: vector.name || vector.v.name } }));
  } else {
    // the image's own pixels go to the worker, which brings them to W × H itself (routechoice.js resample, condition): a
    // canvas's drawImage shrinks each browser's way, and the reading of a scan followed it (2026-11-24); beyond SRC_PX the
    // canvas makes a first reduction
    const k0 = ws * hs > SRC_PX ? Math.sqrt(SRC_PX / (ws * hs)) : 1, w0 = Math.max(W, Math.round(ws * k0)), h0 = Math.max(H, Math.round(hs * k0));
    const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w0, h0) : Object.assign(document.createElement("canvas"), { width: w0, height: h0 });
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, w0, h0);
    const rgba = g.getImageData(0, 0, w0, h0).data.buffer;
    ready = ask("init", { rgba, sw: w0, sh: h0, w: W, h: H, J, map: opts.map }, [rgba], opts.onProgress);
  }
  const cache = new Map(), decs = new Map();
  let skey = "", ckey = "";
  const S = (p) => [p[0] * sc, p[1] * sc], U = (p) => [p[0] / sc, p[1] / sc];
  return {
    ready,
    scale: sc,
    /** The ground's heights (trace/terrain.js's grid over the whole map). */
    async dem(grid) { await ready; await ask("dem", { grid: { z: grid.z, nx: grid.nx, ny: grid.ny } }); cache.clear(); decs.clear(); },
    async settings(s, onProgress) {
      await ready;
      skey = JSON.stringify(s);
      const r = await ask("settings", { s }, [], onProgress);
      if (r.reread) { cache.clear(); decs.clear(); return r.facts; }
      return null;
    },
    /** The routes of a leg, the best first (null: none found). */
    async leg(a, b) {
      const k = `${skey}|${a.map((v) => v.toFixed(1))}|${b.map((v) => v.toFixed(1))}`;
      if (!cache.has(k)) cache.set(k, ready.then(() => ask("leg", { a: S(a), b: S(b) })).then((r) => (r.routes ? r.routes.map((x) => ({ ...x, pts: x.pts.map(U) })) : null)));
      return cache.get(k);
    },
    /** The course's controls (map px), in its order, and its circles' radius (px, optional): the overprint around them is the
     *  course's own (circles, numbers, legs), not out of bounds, nor its lines walls or paths. */
    async controls(pts, r = 0) {
      const k = JSON.stringify(pts.map((p) => p.map((v) => Math.round(v)))) + `|${Math.round(r)}`;
      if (k === ckey) return;
      await ready; ckey = k;
      await ask("controls", { pts: pts.map(S), r: r * sc });
      cache.clear(); decs.clear();
    },
    /** The decision map of a leg: { canvas (one pixel a cell), x, y (its corner, map px), cell (map px a cell) }, or null. */
    decision(a, b) {
      const k = `${skey}|${a.map((v) => v.toFixed(1))}|${b.map((v) => v.toFixed(1))}`;
      if (!decs.has(k)) {
        decs.set(k, this.leg(a, b).then(() => ask("decision", { a: S(a), b: S(b) })).then((r) => {
          if (!r.rgba) return null;
          const c = document.createElement("canvas"); c.width = r.rw; c.height = r.rh;
          c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.rgba), r.rw, r.rh), 0, 0);
          return { canvas: c, x: (r.i0 * r.cs) / sc, y: (r.j0 * r.cs) / sc, cell: r.cs / sc };
        }));
        while (decs.size > 12) decs.delete(decs.keys().next().value);
      }
      return decs.get(k);
    },
    /** A route drawn by a runner measured on the same model. */
    async line(pts) { await ready; return (await ask("line", { pts: pts.map(S) })).route; },
    /** The model's heights at points (map px), for support. */
    async profile(pts) { await ready; const r = await ask("profile", { pts: pts.map(S) }); return { z: r.z, f: r.f }; },
    /** A runner's route on the leg a → b as the model runs it, within tol metres of their trace, and its share along each of
     *  the leg's routes (trace/routechoice.js matchRoute). */
    async match(a, b, pts, tol, routes) {
      await ready;
      const r = (await ask("match", { a: S(a), b: S(b), pts: pts.map(S), tol, routes: (routes || []).map((x) => x.pts.map(S)) })).route;
      return r && { ...r, pts: r.pts.map(U) };
    },
    /** The setter's out-of-bounds areas (rings) and boundaries (lines), map px: closed whatever the map says (the Tracer). */
    async forbid(areas, lines) {
      await ready;
      await ask("forbid", { areas: areas.map((r) => r.map(S)), lines: lines.map((l) => l.map(S)) });
      cache.clear(); decs.clear();
    },
    /** A tour's costs between controls (map px): from each, its k nearest reached; { cost, time } flat n × n (Infinity: not
     *  reached; time in s at 1 s/m, cost with the caution). */
    async tour(pts, k, onProgress) { await ready; const r = await ask("tour", { pts: pts.map(S), k }, [], onProgress); return { cost: r.cost, time: r.time }; },
    /** One leg's best route alone: { pts (map px), time, cost, len, up, down, onPath } or null. */
    async path(a, b) {
      await ready;
      const r = (await ask("path", { a: S(a), b: S(b) })).route;
      return r && { ...r, pts: r.pts.map(U) };
    },
    /** The terrain as read, a canvas of one pixel a cell, and the cell's size in map pixels. */
    async picture() {
      await ready;
      const r = await ask("picture");
      const pc = document.createElement("canvas"); pc.width = r.nx; pc.height = r.ny;
      pc.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(r.rgba), r.nx, r.ny), 0, 0);
      return { canvas: pc, cell: r.cs / sc };
    },
    destroy() { worker.terminate(); for (const p of waiting.values()) p.ko(new Error("closed")); waiting.clear(); },
  };
}

/** The matching's tolerance, metres: the GPS's error and the calibration's together (its fit, metres), 12 to 25 m. */
export const matchTol = (rms) => Math.max(12, Math.min(25, 8 + (Number.isFinite(rms) ? rms : 6)));
/**
 * What a runner chose on a leg: the computed route their route follows for 80 % of its length — that route's time counts, so
 * the choice of A costs nothing —, else their route itself as the model runs it. Returns { variant (-1: none named), share,
 * matched, time (s at 1 s/m), facts (the route whose time, length and climb are shown) }.
 */
export function chosen(m, routes) {
  let n = -1, sh = 0;
  (m.shares || []).forEach((v, i) => { if (v > sh) { sh = v; n = i; } });
  if (n >= 0 && sh >= 0.8 && routes?.[n]) return { variant: n, share: sh, matched: true, time: routes[n].time, facts: routes[n] };
  return { variant: sh >= 0.5 ? n : -1, share: sh, matched: false, time: m.time, facts: m };
}
/** The routes a runner's route follows, by share: « A 62 % · B 31 % » (10 % or more). */
export const sharesLabel = (m) => (m.shares || []).map((v, i) => [v, i]).filter(([v]) => v >= 0.1).sort((x, y) => y[0] - x[0]).map(([v, i]) => `${LETTERS[i]} ${pct(v)}`).join(" · ");
// ---- the calibration on the runners' own legs (owner, 2026-11-01) -------------------------------------------------------------
/** The fit's constants: legs needed, the residual (log) beyond which a leg is set aside, the prior's weight and spreads; the
 *  crossings needed (and the legs holding them) before their time is fitted. */
export const CAL = { minLegs: 5, trim: 0.25, prior: 0.12, sdPath: 0.2, sdClimb: 0.4, sdCross: 0.7, minCross: 5, minCrossLegs: 3 };
/**
 * The model calibrated on legs whose route is known (the runner's route laid on the map, trace/routechoice.js matchRoute):
 * samples [{ who, actual (s), parts { path, off, up, down, cross, xn } (the route's model time at 1 s/m, split as segment does;
 * cross: the time its xn crossings of passable lines add) }].
 * A leg's time is taken as pace(who) × (path × α + off + up × γ + down + cross × κ): α scales the time on paths (a runner faster
 * on tracks than the model has α < 1), γ the climb's cost, κ a crossing's (owner, 2026-11-10: 10 s by default, calibrated when
 * possible), each runner has their own pace. α and γ are searched on a grid of their logarithms, each runner's log pace being the
 * median of their legs' log residuals, the score the sum of the absolute residuals plus a prior holding α, γ and κ at 1 (with few
 * legs they move little). α is fitted only when two legs run mostly on paths and two mostly off them, γ when the climb is 4 % of
 * the model's time over six legs or more, κ when the routes cross passable lines 5 times or more over 3 legs or more — κ on its
 * own grid, α and γ fitted again at the κ found, three rounds. Then the legs over 25 % off the fit (a mistake, a stop, a map
 * misread) are set aside and the fit made again. Returns { ok (enough legs), n (legs kept), total, alpha, gamma, kappa, fitPath,
 * fitClimb, fitCross, crosses (the crossings of the legs kept), pace { who: s/m }, runners }.
 */
export function calibrate(samples) {
  const S = samples.filter((x) => x.actual > 0 && x.parts && x.parts.path + x.parts.off > 0);
  const out = { ok: false, n: S.length, total: S.length, alpha: 1, gamma: 1, kappa: 1, fitPath: false, fitClimb: false, fitCross: false, crosses: 0, pace: {}, runners: 0 };
  if (S.length < CAL.minLegs) return out;
  const share = (x) => x.parts.path / (x.parts.path + x.parts.off);
  const model = (x, a, g, k = 1) => Math.max(1, x.parts.path * a + x.parts.off + x.parts.up * g + x.parts.down + (x.parts.cross || 0) * k);
  const crossings = (set) => set.reduce((n, x) => n + (x.parts.xn || 0), 0);
  const median = (v) => { const s = [...v].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const grid = (lo, hi, st) => { const v = []; for (let x = Math.log(lo); x <= Math.log(hi) + 1e-9; x += st) v.push(x); return v; };
  const fit = (set) => {
    const fitPath = set.filter((x) => share(x) >= 0.3).length >= 2 && set.filter((x) => share(x) < 0.3).length >= 2;
    const tot = set.reduce((s, x) => s + model(x, 1, 1), 0), up = set.reduce((s, x) => s + x.parts.up, 0);
    const fitClimb = set.length >= 6 && up >= 0.04 * tot;
    const fitCross = crossings(set) >= CAL.minCross && set.filter((x) => x.parts.xn > 0).length >= CAL.minCrossLegs;
    const score = (la, lg, lk) => {
      const a = Math.exp(la), g = Math.exp(lg), k = Math.exp(lk), by = new Map();
      for (const x of set) { const r = Math.log(x.actual / model(x, a, g, k)); if (!by.has(x.who)) by.set(x.who, []); by.get(x.who).push(r); }
      let sc = CAL.prior * ((la / CAL.sdPath) ** 2 + (lg / CAL.sdClimb) ** 2 + (lk / CAL.sdCross) ** 2);
      const lp = new Map();
      for (const [w, rs] of by) { const m = median(rs); lp.set(w, m); for (const r of rs) sc += Math.abs(r - m); }
      return { sc, la, lg, lk, a, g, k, lp };
    };
    let best = null, lk = 0;
    for (let round = 0; round < (fitCross ? 3 : 1); round++) {
      best = null;
      for (const la of fitPath ? grid(0.6, 1.6, 0.02) : [0]) for (const lg of fitClimb ? grid(0.4, 2.5, 0.05) : [0]) {
        const r = score(la, lg, lk);
        if (!best || r.sc < best.sc) best = r;
      }
      if (!fitCross) break;
      for (const l of grid(0.1, 5, 0.1)) { const r = score(best.la, best.lg, l); if (r.sc < best.sc) best = r; }
      lk = best.lk;
    }
    return { ...best, fitPath, fitClimb, fitCross };
  };
  let f = fit(S);
  const kept = S.filter((x) => Math.abs(Math.log(x.actual / model(x, f.a, f.g, f.k)) - f.lp.get(x.who)) <= CAL.trim);
  if (kept.length >= CAL.minLegs) f = fit(kept);
  const pace = {};
  for (const [w, l] of f.lp) pace[w] = Math.max(0.18, Math.min(1.2, Math.exp(l)));
  return { ok: kept.length >= CAL.minLegs, n: kept.length, total: S.length, alpha: f.a, gamma: f.g, kappa: f.k, fitPath: f.fitPath, fitClimb: f.fitClimb,
    fitCross: f.fitCross, crosses: crossings(kept.length >= CAL.minLegs ? kept : S), pace, runners: f.lp.size };
}
/** The settings with a calibration applied: the paths' speeds divided by α, the climb's cost multiplied by γ, a crossing's by κ. */
export function calibrated(s, c) {
  if (!c?.ok) return s;
  const sp = { ...DEFAULTS.speeds, ...(s.speeds || {}) }, k = (v) => Math.max(5, Math.round(v / c.alpha));
  const cross = Math.round((s.cross ?? DEFAULTS.cross) * (c.kappa || 1));
  return { ...s, speeds: { ...sp, track: k(sp.track), path: k(sp.path), small: k(sp.small) }, climb: Math.round(s.climb * c.gamma * 10) / 10, cross };
}
/** The calibration's line under the settings: what it found and on how many legs, or why it did not. */
export function calibNote(s, c, multi) {
  if (!s.calib || !c) return "";
  if (!c.ok) return t("rc.cal.few", { n: c.n, m: CAL.minLegs });
  const e = calibrated(s, c), def = ` ${t("rc.cal.default")}`;
  const vals = { s: `${pctN(e.speeds.path)}${c.fitPath ? "" : def}`, c: `${fmt(e.climb, 1)} m${c.fitClimb ? "" : def}`, n: c.n, r: c.runners };
  // the crossings' time, once the runners' routes crossed passable lines (an OCAD map's)
  const x = c.crosses ? t("rc.cal.cross", { x: `${e.cross} s${c.fitCross ? "" : def}`, k: c.crosses }) : "";
  return (multi ? t("rc.cal.doneMulti", vals) : t("rc.cal.done", { ...vals, p: minKm(Object.values(c.pace)[0] || 0.36) })) + x;
}
export const setCalib = (text, s = null, c = null) => { const el = $("#rc-cal"); if (el) { el.textContent = text; el.hidden = !text; } if (s) showFitted(s, c); };
/** The values the calibration fitted, shown in the fields it rules (greyed while it is on; owner, 2026-11-05): the runners' median
 *  pace, the climb and the terrain speeds; without a calibration that holds, the user's own values back. */
export function showFitted(s, c) {
  const box = $("#rc-box");
  if (!box) return;
  const on = !!(s.calib && c?.ok), e = on ? calibrated(s, c) : s;
  const put = (id, v, unit) => { const el = $(`#${id}`, box); if (!el) return; el.value = v; const o = $(`#${id}-v`, box); if (o) o.textContent = `${fmt(v, v % 1 ? 1 : 0)}${unit}`; };
  put("rc-climb", e.climb, " m");
  put("rc-cross", e.cross ?? DEFAULTS.cross, " s");
  for (const k of [...SPEED_KEYS, ...VECTOR_SPEEDS]) put(`rc-sp-${k}`, e.speeds[k], " %");
  const p = $("#rc-pace", box);
  if (p) {
    const v = on ? Object.values(c.pace || {}).filter(Number.isFinite).sort((a, b) => a - b) : [];
    p.value = v.length ? minKm(v[v.length >> 1]) : s.pace > 0 ? minKm(s.pace / 1000) : "";
  }
}
/** A runner's reference pace (seconds per metre of white forest on the flat): the median of their legs' actual time over
 *  the model's time of the route they chose (`chosen`), kept between 3 and 20 min/km. */
export function autoPace(pairs) {
  const r = pairs.filter((p) => p.actual > 0 && p.model > 0).map((p) => p.actual / p.model).sort((a, b) => a - b);
  if (!r.length) return null;
  const m = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
  return Math.max(0.18, Math.min(1.2, m));
}
/** The pace in use, seconds per metre: the one typed, else the automatic one, else 6:00 min/km. */
export const paceOf = (s, auto) => (s.pace > 0 ? s.pace / 1000 : auto || 0.36);
export const minKm = (sPerM) => { const v = Math.round(sPerM * 1000); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };

/**
 * The settings panel (a <details> for the side panels). s: the settings; info: { status, pace (auto, s/m), picture }.
 * The panel's controls call onChange(s, what) after each change ("on", "picture", "pace" redraw only; others search again).
 */
export function panelHtml(s, { on, picture, decision = false, status = "", progress = null, warn = "", auto = null, vector = null, calib = "" } = {}) {
  const range = (id, v, lo, hi, step, label, unit = "") => html`<label><span>${label}</span><span class="rc-range"><input type="range" id="${id}" min="${lo}" max="${hi}" step="${step}" value="${v}"><b id="${id}-v">${v}${unit}</b></span></label>`;
  const cap = CAP.get(s), own = offers.shown(OWN_SPEEDS, cap?.opened);      // not drawn where the account lacks it and nothing is offered (the app)
  return html`<details class="an-settings rc-box" id="rc-box" open><summary>${t("rc.title")}</summary>
    <label class="rc-on"><input type="checkbox" id="rc-on" ${raw(on ? "checked" : "")}> ${t("rc.on")}</label>
    <div class="muted rc-status" id="rc-status" ${raw(progress == null ? "hidden" : "")}>${status}</div>
    <progress class="rc-prog" id="rc-prog" max="1" value="${progress ?? 0}" ${raw(progress == null ? "hidden" : "")}></progress>
    <div class="notice rc-warn" id="rc-warn" ${raw(warn ? "" : "hidden")}>${warn}</div>
    <div ${raw(on ? "" : "hidden")} id="rc-opts">
      <div class="an-opts">
        <label><span>${t("rc.map")}</span><select id="rc-map"><option value="forest" ${raw(s.map === "forest" ? "selected" : "")}>${t("rc.map.forest")}</option><option value="sprint" ${raw(s.map === "sprint" ? "selected" : "")}>${t("rc.map.sprint")}</option></select></label>
        ${own ? html`<label class="rc-on" title="${t("rc.calib.hint")}"><input type="checkbox" id="rc-calib" ${raw(s.calib ? "checked" : "")}> ${t("rc.calib")} ${offers.mark(OWN_SPEEDS, cap?.opened)}</label>` : ""}
        <div class="muted rc-cal" id="rc-cal" ${raw(calib ? "" : "hidden")}>${calib || ""}</div>
        <fieldset class="rc-calgroup" id="rc-calgroup" ${raw(s.calib ? "disabled" : "")}>
          <label><span>${t("rc.pace")}</span><span class="rc-range"><input id="rc-pace" inputmode="numeric" placeholder="${auto ? minKm(auto) : "6:00"}" value="${s.pace > 0 ? minKm(s.pace / 1000) : ""}" style="width:70px"> <span class="muted">${t("rc.pace.unit")}</span></span></label>
          ${range("rc-climb", s.climb, 0, 20, 1, t("rc.climb"), " m")}
          ${vector ? html`<span title="${t("rc.cross.hint", { p: minKm(CROSS_PACE) })}">${range("rc-cross", s.cross ?? DEFAULTS.cross, 0, 60, 1, t("rc.cross"), " s")}</span>` : ""}
          <details class="rc-speeds"><summary>${t("rc.speeds")}</summary><div class="an-opts">
            ${[...SPEED_KEYS, ...(vector ? VECTOR_SPEEDS : [])].map((k) => range(`rc-sp-${k}`, s.speeds[k], 5, 200, 5, t(`rc.sp.${k}`), " %"))}</div></details></fieldset>
        ${range("rc-risk", s.risk, 0, 100, 5, t("rc.risk"), " %")}
        <label><span>${t("rc.variants")}</span><select id="rc-variants">${[1, 2, 3, 4].map((n) => html`<option value="${n}" ${raw(n === s.variants ? "selected" : "")}>${n}</option>`)}</select></label>
        ${range("rc-extra", s.extra, 5, 60, 5, t("rc.extra"), " %")}
      </div>
      <label class="rc-on" title="${t("rc.decision.hint")}"><input type="checkbox" id="rc-dec" ${raw(decision ? "checked" : "")}> ${t("rc.decision")}</label>
      <div class="rc-dec-key" id="rc-dec-key" ${raw(decision ? "" : "hidden")}><span class="rc-dec-ramp"></span><span class="muted">${t("rc.decision.key", { p: s.extra })}</span></div>
      <label class="rc-on"><input type="checkbox" id="rc-pic" ${raw(picture ? "checked" : "")}> ${t("rc.picture")}</label>
      <div class="rc-legend" id="rc-legend" ${raw(picture ? "" : "hidden")}>${LEGEND.filter(([, , only]) => !only || vector).map(([k, c]) => html`<span><i style="background:rgb(${c.join(",")})"></i>${t(`rc.cls.${k}`)}</span>`)}</div>
      <p class="hint rc-hint">${t("rc.hint", { d: 50 })} <button type="button" class="btn btn-sm" id="rc-reset">${t("rc.reset")}</button></p>
    </div></details>`;
}
export function bindPanel(root, s, onChange) {
  const box = $("#rc-box", root);
  if (!box) return;
  const set = (what) => { saveSettings(s); onChange(s, what); };
  $("#rc-on", box).addEventListener("change", (e) => { $("#rc-opts", box).hidden = !e.target.checked; onChange(s, e.target.checked ? "on" : "off"); });
  $("#rc-pic", box).addEventListener("change", (e) => { $("#rc-legend", box).hidden = !e.target.checked; onChange(s, e.target.checked ? "picture-on" : "picture-off"); });
  $("#rc-dec", box).addEventListener("change", (e) => {
    $("#rc-dec-key", box).hidden = !e.target.checked;
    try { localStorage.setItem("ocn.rc.dec", e.target.checked ? "1" : "0"); } catch (err) { /* this visit */ }
    onChange(s, e.target.checked ? "decision-on" : "decision-off");
  });
  $("#rc-map", box).addEventListener("change", (e) => { s.map = e.target.value; set("map"); });
  $("#rc-variants", box).addEventListener("change", (e) => { s.variants = Number(e.target.value); set("search"); });
  // calibrated: the pace, the climb and the terrain speeds come from the times run, their own controls greyed (a typed pace dropped)
  $("#rc-calib", box)?.addEventListener("change", async (e) => {
    const cap = CAP.get(s);
    if (cap?.lack && e.target.checked) {                      // the account lacks it: the box stays unticked unless the capability comes
      e.target.checked = false;
      if (!(await offers.guard(OWN_SPEEDS, { opened: cap.opened, el: e.target }))) return;
      cap.lack = false; e.target.checked = true;
    }
    s.calib = e.target.checked; $("#rc-calgroup", box).disabled = s.calib;
    if (s.calib && s.pace) { s.pace = 0; $("#rc-pace", box).value = ""; }
    if (!s.calib) showFitted(s, null);                       // the user's own values back
    set("search");
  });
  const slide = (id, apply) => {
    const el = $(`#${id}`, box);
    if (!el) return;                                          // shown with an OCAD or Mapper map only
    el.addEventListener("input", () => { const v = $(`#${id}-v`, box); if (v) v.textContent = v.textContent.replace(/^[\d.]+/, el.value); });
    el.addEventListener("change", () => { apply(Number(el.value)); set("search"); });
  };
  slide("rc-risk", (v) => { s.risk = v; });
  slide("rc-climb", (v) => { s.climb = v; });
  slide("rc-cross", (v) => { s.cross = v; });
  slide("rc-extra", (v) => { s.extra = v; });
  for (const k of [...SPEED_KEYS, ...VECTOR_SPEEDS]) slide(`rc-sp-${k}`, (v) => { s.speeds = { ...s.speeds, [k]: v }; });
  $("#rc-pace", box).addEventListener("change", (e) => {
    const m = /^\s*(\d{1,2})(?:[:.,h'](\d{1,2}))?\s*$/.exec(e.target.value);
    s.pace = m ? Number(m[1]) * 60 + Number(m[2] || 0) : 0;
    if (s.pace && (s.pace < 150 || s.pace > 1500)) s.pace = 0;
    e.target.value = s.pace ? minKm(s.pace / 1000) : "";
    set("pace");
  });
  $("#rc-reset", box).addEventListener("click", () => { Object.assign(s, { ...DEFAULTS, map: s.map, speeds: { ...DEFAULTS.speeds } }); const cap = CAP.get(s); if (cap?.lack) { cap.wish = !!s.calib; s.calib = false; } set("reset"); });
}
/** The status line, and the progress bar under it (frac 0-1; null hides it). */
export const setStatus = (text, frac = null) => {
  const el = $("#rc-status"); if (el) { el.textContent = text; el.hidden = frac == null; }      // while computing only (owner, 2026-11-05)
  const bar = $("#rc-prog"); if (bar) { bar.hidden = frac == null; if (frac != null) bar.value = Math.max(0, Math.min(1, frac)); }
};
/**
 * The heights the routes climb: the model's grid (trace/terrain.js) refined by the map's own contour lines (trace/contours.js:
 * each line set at its level from the model, the model filling between them), on nodes ~2 m apart — or the model alone
 * (s.relief "dem"). toM(px, py): a map pixel's metres. Returns { grid, pieces } (pieces: the contour pieces read; 0 too few,
 * the model kept; null not asked).
 */
export async function reliefGrid(image, grid, toM, s) {
  if (s.relief === "dem") return { grid, pieces: null };
  await new Promise((r) => setTimeout(r, 30));          // the status drawn before the page's thread is busy
  const { refineGrid } = await import("./contours.js");
  const W = image.width, H = image.height, o = toM(0, 0), e = toM(W, 0), mPerPx = Math.hypot(e[0] - o[0], e[1] - o[1]) / W;
  let step = 2, nx, ny;
  do { nx = Math.ceil((W * mPerPx) / step) + 1; ny = Math.ceil((H * mPerPx) / step) + 1; step *= 1.2; } while (nx * ny > 4e6);
  let r = null;
  try { r = refineGrid(image, grid, W, H, mPerPx, { interval: s.map === "sprint" ? 2.5 : 5, size: { nx, ny } }); } catch (err) { console.error(err); }
  return r ? { grid: r, pieces: r.contours.pieces } : { grid, pieces: 0 };
}
/** The relief's words for the status: the model's credit, and what the map's contours added. */
export const reliefNote = (credit, pieces) => (pieces > 0 ? t("rc.st.contours", { r: credit, n: pieces }) : pieces === 0 ? `${credit} · ${t("rc.st.contours.none")}` : credit);
/** Whether the decision map was last asked for (kept on the device). */
export const decisionOn = () => { try { return localStorage.getItem("ocn.rc.dec") === "1"; } catch (e) { return false; } };
const CLS_KEYS = ["white", "open", "rough", "g1", "g2", "g3", "water", "shallow", "paved", "oob", "building", "grey", "marsh"];
/** A warning when the map as read looks wrong: much of it bare rock or buildings on a forest map (a photo's grey paper, a
 *  scan's shade), one terrain other than white forest over two thirds of it, no path at all on a forest map of some size. */
export function readingWarning(info, s) {
  if (!info?.counts || info.vector) return "";
  // a photo too coarse for the reading: a town's lanes, walls and fences, a forest's paths are a pixel or two, blurred into what
  // lies beside them, and the routes cross them or miss them whatever the reading does (the Morbihan sprint photos sent through a
  // messaging app, about 1.1 px a metre: 2026-11-18). About 150 dpi of the map at its usual scale (1:4 000, 1:10 000) is needed
  const mpp = info.cs ? info.mpc / info.cs : 0, need = s.map === "sprint" ? 1.5 : 0.6;
  if (mpp > 0 && 1 / mpp < need) return t("rc.warn.coarse", { r: fmt(1 / mpp, 1), need: fmt(need, 1) });
  const n = info.counts.reduce((a, b) => a + b, 0) || 1, pct = (v) => Math.round((100 * v) / n);
  if (s.map !== "sprint" && (info.counts[A.GREY] + info.counts[A.BUILDING]) / n > 0.2) return t("rc.warn.grey", { p: pct(info.counts[A.GREY] + info.counts[A.BUILDING]) });
  for (let c = 1; c < info.counts.length; c++) if (info.counts[c] / n > 0.66) return t("rc.warn.one", { p: pct(info.counts[c]), c: t(`rc.cls.${CLS_KEYS[c]}`) });
  if (s.map !== "sprint" && info.paths && !(info.paths[1] + info.paths[2] + info.paths[3]) && n * info.mpc * info.mpc > 2e5) return t("rc.warn.nopath");
  return "";
}
export const setWarning = (text) => { const el = $("#rc-warn"); if (el) { el.textContent = text; el.hidden = !text; } };
/** The decision map over the map, under the routes. */
export function drawDecision(g, d) {
  if (!d?.canvas) return;
  g.save(); g.globalAlpha = 0.55; g.imageSmoothingEnabled = true;
  g.drawImage(d.canvas, d.x, d.y, d.canvas.width * d.cell, d.canvas.height * d.cell);
  g.restore();
}

/** The routes of a leg over the map: each in its colour over a white casing, dashed, its letter and time at its middle. */
export function drawRoutes(g, routes, lw, pace, clock) {
  if (!routes?.length) return;
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  for (let n = routes.length - 1; n >= 0; n--) {
    const r = routes[n], col = ROUTE_COLOURS[n % ROUTE_COLOURS.length];
    const path = new Path2D();
    r.pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    g.globalAlpha = 0.9; g.setLineDash([]); g.strokeStyle = "#ffffff"; g.lineWidth = lw(7); g.stroke(path);
    g.setLineDash([lw(10), lw(6)]); g.strokeStyle = col; g.lineWidth = lw(4); g.stroke(path);
  }
  g.setLineDash([]); g.globalAlpha = 1;
  g.font = `700 ${lw(12)}px system-ui, sans-serif`; g.textBaseline = "middle"; g.textAlign = "center";
  routes.forEach((r, n) => {
    const p = midpoint(r.pts), text = `${LETTERS[n]} ${clock(r.time * pace)}`, w = g.measureText(text).width + lw(10);
    g.fillStyle = ROUTE_COLOURS[n % ROUTE_COLOURS.length];
    g.beginPath(); g.roundRect ? g.roundRect(p[0] - w / 2, p[1] - lw(9), w, lw(18), lw(9)) : g.rect(p[0] - w / 2, p[1] - lw(9), w, lw(18)); g.fill();
    g.fillStyle = "#ffffff"; g.fillText(text, p[0], p[1]);
  });
  g.restore();
}
/** The point halfway along a polyline. */
function midpoint(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let d = L / 2;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= s) { const f = s ? d / s : 0; return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])]; }
    d -= s;
  }
  return pts[0];
}

/** Which of the routes a runner's route follows: the nearest by mean distance (map px) under `tol`, else -1. */
export function nearestRoute(routes, pts, tol) {
  const sample = (p, n) => {
    const cum = [0];
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    const L = cum[cum.length - 1] || 1, out = [];
    for (let k = 0, i = 1; k < n; k++) {
      const d = (k / (n - 1)) * L;
      while (i < p.length - 1 && cum[i] < d) i++;
      const s = cum[i] - cum[i - 1] || 1, f = Math.max(0, Math.min(1, (d - cum[i - 1]) / s));
      out.push([p[i - 1][0] + f * (p[i][0] - p[i - 1][0]), p[i - 1][1] + f * (p[i][1] - p[i - 1][1])]);
    }
    return out;
  };
  const a = sample(pts, 24);
  let best = -1, bd = tol;
  routes.forEach((r, n) => {
    const b = sample(r.pts, 24);
    const d = a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;
    if (d < bd) { bd = d; best = n; }
  });
  return best;
}

/** A route's facts for a table cell: time at the pace, length, climb and descent (« ↑ » / « ↓ » in every language, owner 2026-11-08: a bare
 *  « +25 m » did not say what it was), each left out under a metre. */
export function routeFacts(r, pace, clock) {
  const h = (k, v) => (v >= 1 ? ` · ${t(k, { m: fmt(Math.round(v)) })}` : "");
  return `${clock(r.time * pace)} · ${fmt(Math.round(r.len / 10) * 10)} m${h("rc.up", r.up)}${h("rc.down", r.down)}`;
}
export const sideLabel = (r) => t(r.side < 0 ? "rc.side.left" : r.side > 0 ? "rc.side.right" : "rc.side.straight");
