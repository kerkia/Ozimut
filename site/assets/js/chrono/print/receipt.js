// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A runner's receipt — the strip printed at the finish: who, the result, each control with the time from the start, the leg
// and the place there. One layout for the thermal printer (ESC/POS bytes), for a page printer (HTML) and for the screen.
// No text of its own: the labels come from the caller (the catalogues), `L` below.

import { clock, span } from "../times.js";
import { latin1 } from "../io/oecsv.js";

const pad = (s, w, right = false) => { s = String(s ?? ""); return s.length >= w ? s.slice(0, w) : right ? s.padStart(w) : s.padEnd(w); };
const both = (l, r, w) => { l = String(l ?? ""); r = String(r ?? ""); return l.length + r.length + 1 > w ? `${l.slice(0, Math.max(0, w - r.length - 1))} ${r}` : l + " ".repeat(w - l.length - r.length) + r; };

/**
 * The receipt as lines `{ t, a? "c"|"r", b? (bold), s? (2 = double size), rule?, feed?, cut? }`, `width` characters wide
 * (32 on 58 mm paper, 48 on 80 mm). `row`: a row of the view (by course, so that places are the course's); `ctx`:
 * `{ event, course, of (classified so far on the course), labels: L }` with L = { card, start, finish, time, place, behind,
 * pace, missing, extra, status: { ok, mp, … }, cols: [n, code, time, leg, place], finishRow, points, penalty, footer, rent }.
 */
export function receipt(row, ctx, width = 32) {
  const L = ctx.labels, c = ctx.course, out = [];
  const rule = () => out.push({ rule: 1 });
  out.push({ t: ctx.event.name || "", a: "c", b: 1 });
  if (ctx.event.date) out.push({ t: ctx.event.date, a: "c" });
  rule();
  out.push({ t: `${row.given} ${row.family}`.trim(), b: 1, s: width >= 40 ? 2 : 1 });
  out.push({ t: both(row.club, [row.clsName, c?.name].filter((x, i, a) => x && a.indexOf(x) === i).join(" / "), width) });
  out.push({ t: both(`${L.card} ${row.card ?? ""}`, row.bib !== "" && row.bib != null ? `#${row.bib}` : "", width) });
  out.push({ t: both(`${L.start} ${clock(row.start)}`, `${L.finish} ${clock(row.finish)}`, width) });
  rule();
  const w = width >= 40 ? [4, 6, 10, 10, 8] : [3, 5, 8, 8, 6];
  const line = (cells) => cells.map((x, i) => pad(x, w[i], i > 1)).join("") ;
  out.push({ t: line(L.cols), b: 1 });
  let prev = 0;
  row.splits.forEach((s, i) => {
    if (s.t == null) { out.push({ t: line([i + 1, s.code, "-----", "", ""]) }); return; }
    out.push({ t: line([i + 1, s.code, span(s.t), s.leg != null ? span(s.leg) : "", s.lp ? `${s.lp}` : ""]) });
    prev = s.t;
  });
  if (row.time != null) out.push({ t: line(["", L.finishRow, span(row.time), span(row.time - prev - (row.adj || 0)), ""]), b: 1 });
  rule();
  out.push({ t: both(`${L.time} ${row.time != null ? span(row.time) : "—"}`, L.status[row.status] || row.status, width), b: 1, s: width >= 40 ? 2 : 1 });
  if (row.points != null) out.push({ t: both(`${L.points} ${row.points}`, row.penalty ? `${L.penalty} -${row.penalty}` : "", width), b: 1 });
  if (row.place) out.push({ t: both(`${L.place} ${row.place}${ctx.of ? ` / ${ctx.of}` : ""}`, row.behind ? `+${span(row.behind)}` : "", width) });
  if (row.time != null && c?.length > 0 && row.status === "ok") out.push({ t: `${L.pace} ${span(row.time / (c.length / 1000))} /km` });
  if (row.missing?.length) out.push({ t: `${L.missing} ${row.missing.join(", ")}`, b: 1 });
  if (row.extra?.length) out.push({ t: `${L.extra} ${row.extra.map((p) => p[0]).join(", ")}`.slice(0, width * 2) });
  if (row.rent) out.push({ t: L.rent, a: "c", b: 1 });
  rule();
  for (const t of [].concat(L.footer || [])) out.push({ t, a: "c" });
  out.push({ feed: 3 }, { cut: 1 });
  return out;
}

/** Lines as ESC/POS bytes (Epson's commands, which nearly every thermal printer takes), text in windows-1252. */
export function escpos(lines, width = 32) {
  const out = [0x1B, 0x40, 0x1B, 0x74, 16];                                   // initialise, code page WPC1252
  const text = (s) => out.push(...latin1(s));
  for (const l of lines) {
    if (l.cut) { out.push(0x1D, 0x56, 66, 0); continue; }
    if (l.feed) { out.push(0x1B, 0x64, l.feed); continue; }
    if (l.rule) { text("-".repeat(width)); out.push(0x0A); continue; }
    out.push(0x1B, 0x61, l.a === "c" ? 1 : l.a === "r" ? 2 : 0, 0x1B, 0x45, l.b ? 1 : 0, 0x1D, 0x21, l.s === 2 ? 0x11 : 0);
    text(l.s === 2 ? String(l.t).slice(0, Math.floor(width / 2)) : l.t);
    out.push(0x0A);
  }
  return new Uint8Array(out);
}

const escHtml = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
/** Lines as a small HTML page, for a page printer or the app's silent printing. */
export function receiptHtml(lines, width = 32) {
  const body = lines.map((l) => {
    if (l.cut || l.feed) return "";
    if (l.rule) return `<div class="r">${"-".repeat(width)}</div>`;
    return `<div style="${l.a === "c" ? "text-align:center;" : l.a === "r" ? "text-align:right;" : ""}${l.b ? "font-weight:700;" : ""}${l.s === 2 ? "font-size:1.5em;" : ""}">${escHtml(l.t) || "&nbsp;"}</div>`;
  }).join("");
  return `<!doctype html><meta charset="utf-8"><style>@page{margin:4mm}body{margin:0;font:11px/1.25 ui-monospace,Consolas,"Courier New",monospace;white-space:pre;width:${width}ch}</style>${body}`;
}

/** Lines as plain text (the screen's preview, a log). */
export const receiptText = (lines, width = 32) => lines.filter((l) => !l.cut && !l.feed).map((l) => (l.rule ? "-".repeat(width)
  : l.a === "c" ? " ".repeat(Math.max(0, Math.floor((width - String(l.t).length) / 2))) + l.t : l.t)).join("\n");
