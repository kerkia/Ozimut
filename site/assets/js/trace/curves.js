// The curves of a trace — pace and the file's channels (heart rate, cadence, altitude, temperature, power) — stacked
// on one canvas over a race's time, each with its scale (owner, 2026-10-15: unusable without): the name and unit, round
// ticks on a value axis, the value at the cursor, a shared race-time axis below. Used by « Analyse solo » (the strip
// beside the map) and by « Analyse multi » (one's own curves, never the others').

import { fmt } from "../util.js";
import { t } from "../i18n.js";
import { cumAt, meanBetween, valueAt } from "./track.js";

export const CHANNEL_LABEL = { hr: "an.ch.hr", cad: "an.ch.cad", ele: "an.ch.ele", temp: "an.ch.temp", pw: "an.ch.pw" };
export const CHANNEL_UNIT = { hr: "bpm", cad: "", ele: "m", temp: "°C", pw: "W" };
export const CHANNEL_COLOUR = { hr: "#d6336c", cad: "#1c80bb", ele: "#2f9e44", temp: "#e0a800", pw: "#e8590c" };   // the curves' order
// the curves' colours, readable on the light themes and on the dark ones (owner, 2026-10-14: the pace in the trace's
// dark purple vanished on Sous-bois); altitude in green, apart from the power's orange (2026-10-15); temperature gold
const CURVE_LIGHT = { pace: "#6d28d9", hr: "#d6336c", cad: "#1c7ed6", ele: "#2f9e44", temp: "#c99700", pw: "#e8590c" };
const CURVE_DARK = { pace: "#b197fc", hr: "#ff6b9a", cad: "#4dabf7", ele: "#69db7c", temp: "#ffd43b", pw: "#ffa94d" };
/** Whether the current theme is dark: the luminance of its surface colour. */
export function isDark() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  let r, g, b;
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else { const q = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v); if (!q) return false; [r, g, b] = q.slice(1).map(Number); }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}
export const curveColour = (c) => (isDark() ? CURVE_DARK : CURVE_LIGHT)[c] || "#888888";
/** min/km from m/s. */
export const pace = (v) => { if (!(v > 0.05)) return "—"; const s = Math.round(1000 / v); return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}`; };
const clock = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
/** The rows a track can show, in their order: the pace, then its channels. */
export const curveRows = (track) => ["pace", ...Object.keys(CHANNEL_COLOUR).filter((c) => track.ch[c])];
export const CURVE_MARGIN = { top: 14, left: 40, bottom: 18 };    // the control numbers, the value axis, the time axis

/**
 * The curves on `canvas` (its CSS size, the device's pixel ratio). track: the trace with its channels; t0: the
 * track's seconds at the race's time 0; total: the race's length shown (s); rows: the curves ("pace", "hr"…); cursor:
 * the race's time now (s) or null; units: { cad } the cadence's unit when it was converted; marks: [{ t, label }] lines
 * at race times (the controls' passes; a label drawn at the top); shade: [{ t0, t1 }] stretches shaded (mistakes).
 */
export function drawCurves(canvas, { track, t0, total, rows, cursor = null, units = {}, marks = [], shade = [], zero = 0 }) {
  const g = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!track || !(total > 0) || !w || !h) return;
  const { top: TOP, left: LEFT, bottom: BOTTOM } = CURVE_MARGIN;
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink-3").trim() || "#888";
  const grid = getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "#ddd";
  const plotW = Math.max(40, w - LEFT - 6), X = (s) => LEFT + (s / total) * plotW, step = Math.max(1, Math.floor(total / plotW));
  const bottomAxis = h - BOTTOM, ROW = Math.max(26, (bottomAxis - TOP) / Math.max(1, rows.length));
  // a round step giving about n ticks over a span, from a list of steps
  const niceStep = (span, n, steps) => steps.find((s) => span / s <= n) ?? steps[steps.length - 1];
  const NUM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  const label = (txt, x, y, align, colr, bold) => { g.font = `${bold ? "600 " : ""}10px system-ui, sans-serif`; g.textAlign = align; g.fillStyle = colr; g.fillText(txt, x, y); };
  const tNow = cursor == null ? null : Math.max(0, Math.min(total, cursor));
  rows.forEach((c, r) => {
    const top = TOP + r * ROW + 14, bottom = TOP + (r + 1) * ROW - 4;            // 14 px for the row's title
    if (r) { g.strokeStyle = grid; g.lineWidth = 1; g.beginPath(); g.moveTo(0, TOP + r * ROW); g.lineTo(w, TOP + r * ROW); g.stroke(); }
    for (const l of shade) { g.fillStyle = "rgba(198,40,40,0.12)"; g.fillRect(X(l.t0), top, X(l.t1) - X(l.t0), bottom - top); }
    // each point is the mean over the time a pixel spans (a point sample aliased into spikes), at least 6 s
    const colr = curveColour(c), win = Math.max(step, c === "pace" ? 15 : 6), vals = [];       // the pace over 15 s at least
    // as many round values as the row has room for: one every ~16 px, 3 at least (owner, 2026-10-15: « 0 and 100 » was too few)
    const nTicks = Math.max(3, Math.floor((bottom - top) / 16));
    // the values a scale is made from: for the pace, the cadence and the power, the moments in motion only (above 40 % of
    // the median) - a stop at a control (speed and cadence 0) would otherwise stretch the scale down to it
    const scaleOf = (arr) => {
      const v = arr.filter((x) => x != null && !Number.isNaN(x)).sort((p, q) => p - q);
      const med = v[Math.floor(v.length / 2)] || 0;
      return c === "pace" || c === "cad" || c === "pw" ? v.filter((x) => x >= 0.4 * med) : v;
    };
    let lo, hi, ticks = [], fmtV, unit, now = "—";
    if (c === "pace") {
      for (let q = 0; q <= total; q += step) vals.push((cumAt(track, t0 + q + win / 2) - cumAt(track, t0 + q - win / 2)) / win);
      const sorted = scaleOf(vals);
      // the slow end stops at 20 min/km: a stop (map reading at a control) would flatten everything else
      lo = Math.max(1000 / 1200, sorted[Math.floor(sorted.length * 0.02)] || 0); hi = Math.max(lo + 0.1, sorted[Math.floor(sorted.length * 0.98)] || 1);
      // the ticks at round paces (min/km), drawn where those speeds fall: the scale reaches the round paces around the
      // race's, and every round pace between is offered (a speed scale crowds the slow ones: the rule below thins them)
      const PACES = [150, 180, 210, 240, 270, 300, 330, 360, 420, 480, 540, 600, 720, 900, 1200];
      const pFast = [...PACES].reverse().find((p) => p <= 1000 / hi) ?? PACES[0], pSlow = PACES.find((p) => p >= 1000 / lo) ?? 1200;
      hi = 1000 / pFast; lo = 1000 / pSlow;
      for (const p of PACES) if (p >= pFast && p <= pSlow) ticks.push(1000 / p);
      fmtV = pace; unit = t("an.unit.pace");
      if (tNow != null) { const win30 = Math.min(30, tNow); if (win30 >= 5) now = pace((cumAt(track, t0 + tNow) - cumAt(track, t0 + tNow - win30)) / win30); }
    } else {
      for (let q = 0; q <= total; q += step) vals.push(meanBetween(track, c, t0 + q - win / 2, t0 + q + win / 2));
      // the range without the extremes (a stop's zero cadence, a spike): the 2nd to the 98th percentile, then to round ticks
      const ok = scaleOf(vals);
      lo = ok.length ? ok[Math.floor(ok.length * 0.02)] : 0; hi = ok.length ? ok[Math.min(ok.length - 1, Math.floor(ok.length * 0.98))] : 1;
      if (!(hi > lo)) { lo -= 1; hi = lo + 2; }
      const dec = c === "temp" ? 1 : 0, s = niceStep(hi - lo, nTicks, NUM);
      lo = Math.floor(lo / s) * s; hi = Math.ceil(hi / s) * s;
      for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) ticks.push(v);
      fmtV = (v) => fmt(v, s < 1 ? 1 : dec); unit = (c === "cad" && units.cad) || CHANNEL_UNIT[c] || "/min";
      if (tNow != null) { const v = valueAt(track, c, t0 + tNow); if (v != null && !Number.isNaN(v)) now = fmt(v, dec); }
    }
    const Y = (v) => bottom - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (bottom - top);
    // the value axis: round ticks, faint lines across; from the bottom up, labels never overlapping
    g.lineWidth = 1;
    let lastY = -Infinity;
    for (const v of [...ticks].sort((a, b) => Y(b) - Y(a))) {
      const y = Y(v);
      if (Math.abs(y - lastY) < 12) continue;
      lastY = y;
      g.strokeStyle = grid; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(LEFT, y); g.lineTo(LEFT + plotW, y); g.stroke(); g.globalAlpha = 1;
      label(fmtV(v), LEFT - 4, y + 3, "right", ink, false);
    }
    g.beginPath();
    vals.forEach((v, k) => { const x = X(k * step), y = Y(v); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.strokeStyle = colr; g.lineWidth = 1.6; g.stroke();
    if (c === "pace") { g.lineTo(X((vals.length - 1) * step), bottom); g.lineTo(LEFT, bottom); g.closePath(); g.fillStyle = colr; g.globalAlpha = 0.18; g.fill(); g.globalAlpha = 1; }
    // the row's title — name and unit — and the value at the cursor
    label(`${t(c === "pace" ? "an.ch.pace" : CHANNEL_LABEL[c])} (${unit})`, LEFT, TOP + r * ROW + 11, "left", colr, true);
    label(now, LEFT + plotW, TOP + r * ROW + 11, "right", colr, true);
  });
  // the time axis: race time, a round step; `zero`: the race's start on it (the trace's time before it kept, negative)
  const ts = niceStep(total, Math.max(2, Math.floor(plotW / 60)), [60, 120, 300, 600, 900, 1200, 1800, 3600]);
  g.strokeStyle = grid; g.lineWidth = 1; g.beginPath(); g.moveTo(LEFT, bottomAxis); g.lineTo(LEFT + plotW, bottomAxis); g.stroke();
  for (let v = Math.ceil(-zero / ts) * ts; v + zero <= total; v += ts) { const s = v + zero, x = X(s); g.beginPath(); g.moveTo(x, bottomAxis); g.lineTo(x, bottomAxis + 3); g.stroke(); label(v < 0 ? `−${clock(-v)}` : clock(v), x, bottomAxis + 12, s ? "center" : "left", ink, false); }
  // the controls' passes (numbered when given a label)
  g.font = "10px system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 1;
  for (const m of marks) { if (m.t == null) continue; const x = X(m.t); g.globalAlpha = 0.45; g.beginPath(); g.moveTo(x, TOP); g.lineTo(x, bottomAxis); g.stroke(); g.globalAlpha = 1; if (m.label) g.fillText(m.label, x, 9); }
  if (tNow != null) { g.strokeStyle = "#e8641c"; g.lineWidth = 2; g.beginPath(); g.moveTo(X(tNow), 0); g.lineTo(X(tNow), bottomAxis); g.stroke(); }
}
/** The race time under a pointer on the curves (s), for a click that seeks. */
export const curveTimeAt = (canvas, offsetX, total) => {
  const plotW = Math.max(40, canvas.clientWidth - CURVE_MARGIN.left - 6);
  return Math.max(0, Math.min(1, (offsetX - CURVE_MARGIN.left) / plotW)) * total;
};
