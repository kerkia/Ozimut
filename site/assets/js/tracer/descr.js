// Control description sheets (« définitions de postes »), as Purple Pen's DescriptionFormatter and DescriptionRenderer
// make them (BSD licence, assets/tracer/LICENSE-PurplePen.txt): the lines of a course (title, header, one line per
// control with columns A to H, directives for the finish, marked routes and map exchanges, text lines, the key of custom
// symbols), then their drawing on a grid of square cells — symbols, text, symbols and text — as paths and texts in
// millimetres from the sheet's top left corner (y down), drawn alike on screen and in the PDFs.

import * as M from "./model.js";
import { symbol, symbolPaths, symbolText } from "./symbols.js";
import { textifier } from "./textify.js";
import { textWidth, wrapText, CAP_HEIGHT, fontsReady } from "./fonts.js";

// a random-order section's line, in the sheet's language (the event's description language, not the interface's; English else)
const RANDOM = {                                                  // i18n-ignore-next 8
  fr: "Postes {a} à {b} dans l'ordre de votre choix", en: "Controls {a}–{b} in any order", de: "Posten {a}–{b} in beliebiger Reihenfolge",
  es: "Controles {a}–{b} en cualquier orden", it: "Lanterne {a}–{b} in qualsiasi ordine", sv: "Kontroller {a}–{b} i valfri ordning",
  nb: "Poster {a}–{b} i valgfri rekkefølge", da: "Poster {a}–{b} i valgfri rækkefølge", fi: "Rastit {a}–{b} vapaassa järjestyksessä",
  cs: "Kontroly {a}–{b} v libovolném pořadí", pl: "Punkty {a}–{b} w dowolnej kolejności", pt: "Pontos {a}–{b} por qualquer ordem",
  hu: "{a}–{b}. pont tetszőleges sorrendben", ro: "Posturile {a}–{b} în orice ordine", et: "Punktid {a}–{b} vabas järjekorras",
};
// the variations' header, in the sheet's language (English else; i18n-ignore-next 2)
const VARIATIONS = { fr: "Toutes variantes", en: "All variations", de: "Alle Varianten", es: "Todas las variantes" };
const variationsText = (lang) => VARIATIONS[lang] || VARIATIONS[String(lang).split("-")[0]] || VARIATIONS.en;
const randomText = (lang, a, b) => (RANDOM[lang] || RANDOM[String(lang).split("-")[0]] || RANDOM.en).replace("{a}", a).replace("{b}", b);
const km = (m) => `${(m / 1000).toFixed(1).replace(".", ",")} km`;
const lengthText = (min, max) => (Math.abs(max - min) < 50 ? km(min) : `${(min / 1000).toFixed(1).replace(".", ",")}–${km(max)}`);
const round10 = (m) => `${Math.round(m / 10) * 10} m`;

/** The sheet's lines for a course designator (DescriptionFormatter.CreateDescription). */
export function describe(ev, cd, { purpose = "map", createKey = false, variationName = "" } = {}) {
  const std = ev.descStandard || "2018", lang = ev.lang || "fr";
  const S = (id) => symbol(id, std);
  const tx = textifier(ev, lang);
  const v = M.view(ev, cd, { specials: false, descriptions: false });
  const kind = v.kind;
  const lines = [];
  const course = cd.course ? ev.courses[cd.course] : null;
  // the event's date after its title (the advanced level: ev.dateInHeader, Condes's header)
  const date = ev.dateInHeader && ev.date ? new Date(`${ev.date}T12:00:00`).toLocaleDateString(lang, { day: "numeric", month: "numeric", year: "numeric" }) : "";
  String(ev.title || "").split("|").forEach((t, i, a) => { const s = date && i === a.length - 1 ? `${t} ${date}`.trim() : t; lines.push({ kind: "title", boxes: [s], textual: s }); });
  if (course?.secondary != null) for (const t of course.secondary.split("|")) lines.push({ kind: "secondary", boxes: [t], textual: t });
  const fullName = (() => {
    let n = course?.name || "";
    if (cd.path && variationName && !(purpose === "map" && course?.hideVariations)) n += ` ${variationName}`;
    if (cd.course && cd.part >= 0) n += `-${cd.part + 1}`;
    return n;
  })();
  const fmt = (p, ...a) => String(p ?? "").replace(/\{(\d)\}/g, (m, k) => a[k] ?? "");
  if (kind === "normal") {
    const len = lengthText(v.totalMin, v.totalMax);
    const climb = v.climb >= 0 ? `${Math.round(v.climb / 5) * 5} m` : null;
    lines.push({ kind: "header3", boxes: [fullName, len, climb],
      textual: climb ? fmt(symbolText(S("course_length_climb"), lang), len, climb) : fmt(symbolText(S("course_length"), lang), len) });
  } else if (kind === "all") {
    const n = fmt(symbolText(S("number_controls"), lang), v.normalControls);
    lines.push({ kind: "header2", boxes: [symbolText(S("all_controls"), lang), n], textual: n });
  } else if (kind === "variations") {
    const n = fmt(symbolText(S("number_controls"), lang), v.normalControls);
    lines.push({ kind: "header2", boxes: [variationsText(lang), n], textual: n });
  } else {
    const n = v.points > 0 ? fmt(symbolText(S("number_points"), lang), v.points) : fmt(symbolText(S("number_controls"), lang), v.normalControls);
    lines.push({ kind: "header2", boxes: [fullName, n], textual: n });
  }
  const key = {};
  const textLines = (text, cc, control, textKind) => {
    if (!text) return;
    for (const t of text.split("|")) lines.push({ kind: "text", boxes: [t], textual: t, cc, control, textKind });
  };
  const ctl = (cv) => ev.controls[cv.control];
  // random-order sections: a line before each, « Controls 3–6 in any order »
  const sections = kind === "normal" ? M.randomSections(ev, cd) : [];
  const sectionStart = new Map(sections.map((s) => [s[0], s]));
  const form = course?.form || "";
  for (let i = 0; i < v.controls.length; i++) {
    const cv = v.controls[i], c = ctl(cv), cc = cv.ccs[0] ? ev.courseControls[cv.ccs[0]] : null;
    if (cv.ghost) continue;                                       // a diamond's exit passed the first time: its line is the exit's
    const sec = sectionStart.get(cv.ccs[0]);
    if (sec) {
      const ord = (id) => v.controls.find((x) => x.ccs[0] === id)?.ordinal ?? "";
      const s = randomText(lang, ord(sec[0]), ord(sec[sec.length - 1]));
      lines.push({ kind: "text", boxes: [s], textual: s, cc: cv.ccs[0], control: cv.control, textKind: "random" });
    }
    const prev = i > 0 ? ctl(v.controls[i - 1]) : null, next = i < v.controls.length - 1 ? ctl(v.controls[i + 1]) : null;
    let show = true;
    if (kind === "normal" || kind === "variations") {
      if (c.kind === "crossing" && prev?.kind === "crossing") show = false;
      if (c.kind === "map-exchange" && !next) show = false;
    } else if (kind === "score") show = ["normal", "start", "map-issue"].includes(c.kind);
    if (show) {
      textLines(c.before, cv.ccs[0], cv.control, "beforeControl");
      if (cc) textLines(cc.before, cv.ccs[0], cv.control, "beforeCourseControl");
      if (["finish", "crossing", "map-issue"].includes(c.kind)) lines.push(directiveLine(ev, tx, S, kind, v, i));
      else lines.push(regularLine(ev, tx, S, kind, v.scoreColumn, cv, key, lang, form));
      if (cc) textLines(cc.after, cv.ccs[0], cv.control, "afterCourseControl");
      textLines(c.after, cv.ccs[0], cv.control, "afterControl");
    }
    if (kind === "normal" || kind === "variations") {
      if (next?.kind === "map-exchange" && cv.legTo?.length) {
        const dist = round10(cv.legLen[0]);
        lines.push({ kind: "directive", boxes: [S("13.5"), dist], textual: tx.directive("13.5", dist), isLeg: true, cc: cv.ccs[0], cc2: v.controls[cv.legTo[0]].ccs[0], control: cv.control });
      } else if (cc?.exchange && c.kind !== "map-exchange" && prev) {
        if (cc.flip && std !== "2004") lines.push({ kind: "directive", boxes: [S("15.6"), null], textual: tx.directive("15.6", ""), cc: cv.ccs[0], control: cv.control });
        else lines.push({ kind: "directive", boxes: [S("13.5control"), "0 m"], textual: tx.directive("13.5control", "0 m"), cc: cv.ccs[0], control: cv.control });
      }
    }
    if (cv.legTo?.length) {
      const to = ctl(v.controls[cv.legTo[0]]), legId = M.findLeg(ev, cv.control, v.controls[cv.legTo[0]].control), leg = ev.legs[legId];
      const markable = leg && leg.flagging && leg.flagging !== "none" && leg.flagging !== "end" && to.kind !== "finish" && to.kind !== "map-exchange" && c.kind !== "map-issue";
      if (markable) {
        const dist = round10(M.flaggedLengthM(ev, leg.c1, leg.c2)), id = leg.flagging === "begin" ? "13.1" : "13.2";
        lines.push({ kind: "directive", boxes: [S(id), dist], textual: tx.directive(id, dist), isLeg: true, cc: cv.ccs[0], cc2: v.controls[cv.legTo[0]].ccs[0], control: cv.control });
      }
    }
  }
  if (createKey) for (const [id, text] of Object.entries(key)) lines.push({ kind: "key", boxes: [S(id), text], textual: text });
  return lines;
}
function regularLine(ev, tx, S, kind, scoreColumn, cv, key, lang, form = "") {
  const c = ev.controls[cv.control], cc = cv.ccs[0] ? ev.courseControls[cv.ccs[0]] : null;
  const boxes = new Array(8).fill(null);
  if (c.kind === "start" || c.kind === "map-exchange") boxes[0] = S("start");
  else if (kind !== "all" && cv.ordinal > 0) boxes[0] = String(cv.ordinal);
  if (c.kind === "normal") boxes[1] = String(c.code ?? "");
  // ISCD 2024: « codes for the start, e.g. S1, S2, can be used in column B when appropriate »
  else if (c.kind === "start" && c.code && ev.descStandard === "2024") boxes[1] = String(c.code);
  // trail-O: column B gives the flags (« A–E ») rather than the code
  if (form === "trail" && c.trail?.flags) boxes[1] = c.trail.flags.replace("-", "–");
  for (let i = 2; i < 8; i++) {
    const id = c.symbols[i - 2];
    const s = id && S(id);
    // two symbols in one box (the advanced level: control.dual)
    const s2 = c.dual?.[i - 2] && S(c.dual[i - 2]);
    if (s && s2) { boxes[i] = { dual: [s, s2] }; continue; }
    if (s) {
      boxes[i] = s;
      if (ev.customKey?.[id] && ev.customText?.[id]?.some((x) => x.lang === lang)) key[id] = symbolText(s, lang, { custom: ev.customText[id] });
    }
  }
  if (c.colF != null) boxes[5] = c.colF;
  if (c.kind === "normal" && scoreColumn >= 0 && cc) boxes[scoreColumn] = cc.points > 0 ? String(cc.points) : null;
  return { kind: "normal", boxes, textual: tx.control(cv.control, ""), control: cv.control, cc: cv.ccs[0] };
}
function directiveLine(ev, tx, S, kind, v, i) {
  const cv = v.controls[i], c = ev.controls[cv.control], prev = i > 0 ? v.controls[i - 1] : null;
  let dist = NaN;
  if (c.kind === "map-issue") { if (cv.legLen) dist = cv.legLen[0]; }
  else if (prev?.legLen) dist = prev.legLen[0];
  const dText = Number.isFinite(dist) ? round10(dist) : "";
  let id = c.symbols[0];
  if (c.kind === "finish" && (kind === "normal" || kind === "variations") && prev) {
    const f = M.legFlagging(ev, prev.control, cv.control);
    if (f === "all") id = "14.1"; else if (f === "end") id = "14.2";
  }
  return { kind: "directive", boxes: [S(id), c.kind === "finish" || c.kind === "map-issue" ? dText : null], textual: tx.directive(id, dText),
    control: cv.control, cc: cv.ccs[0] };
}

// ---- drawing -------------------------------------------------------------------------------------------------------------
const THICK = 5, THIN = 2.5;                                    // per 100 units of a cell
// fonts (Purple Pen's DescriptionAppearance): em height per 100 units of a cell, bold, family, and the height Purple Pen
// uses when Roboto Condensed is missing and Arial stands in (here: without the network)
const RC = "Roboto Condensed", RO = "Roboto";
const F = { title: [63, true, RC, 56], colA: [63, true, RO], colB: [63, false, RC, 56], colF: [50, false, RO], colF2: [45, false, RC, 42],
  directive: [63, true, RC, 56], text: [43, false, RC, 40], key: [52, false, RO], textLine: [56, true, RC, 50] };
const fontOf = (name) => { const [em, bold, fam, emNo] = F[name]; return [fam === RC && !fontsReady() ? emNo : em, bold, fontsReady() ? fam : RO]; };
export const widthInCells = (descKind) => (descKind === "symbols-and-text" ? 13 : 8);
const noBoundary = (a, b) => a.kind === b.kind && (a.kind === "title" || a.kind === "secondary" || (a.kind === "text" && a.textKind === b.textKind));
function columnAndRow(n, columns, line) {
  if (columns === 1) return [line, 0];
  const len = Math.ceil(n / columns);
  let longCols = n % columns || columns, col = 0;
  while (line >= (col < longCols ? len : len - 1)) { line -= col < longCols ? len : len - 1; col++; }
  return [line, col];
}
/** The sheet's size in mm. */
export function sheetSize(lines, descKind, cell, columns = 1) {
  const w = widthInCells(descKind) * cell, gap = cell * 0.6;
  return { w: w * columns + gap * (columns - 1), h: Math.ceil(lines.length / columns) * cell };
}
/**
 * The sheet as drawing items, its top left corner at (x0, y0), y down: { t: "path", d, stroke, fill, cap, join } and
 * { t: "text", text, x, y (baseline), size, bold, align }; colour is the caller's (black, or purple on the map).
 */
export function sheetItems(lines, descKind, cell, { columns = 1, columnHScore = false, x0 = 0, y0 = 0, white = true } = {}) {
  const items = [], k = cell / 100, W = widthInCells(descKind);
  const { w: totalW, h: totalH } = sheetSize(lines, descKind, cell, columns);
  if (white) items.push({ t: "path", d: [["M", x0, y0], ["L", x0 + totalW, y0], ["L", x0 + totalW, y0 + totalH], ["L", x0, y0 + totalH], ["Z"]], fill: true, white: true });
  let thickCounter = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const [row, col] = columnAndRow(lines.length, columns, li);
    const [nrow, ncol] = columnAndRow(lines.length, columns, li + 1);
    void nrow;
    if (col > 0 && row === 0) thickCounter = 0;
    const ox = x0 + col * (W + 0.6) * cell, oy = y0 + row * cell;
    const X = (u) => ox + u * k, Y = (u) => oy + u * k;
    const seg = (x1, y1, x2, y2, w) => items.push({ t: "path", d: [["M", X(x1), Y(y1)], ["L", X(x2), Y(y2)]], stroke: w * k, cap: "butt", join: "miter" });
    const last = li === lines.length - 1 || ncol !== col;
    const thick = thickCounter === 0 || li === 0;
    const noTop = li !== 0 && noBoundary(line, lines[li - 1]);
    const full = W * 100;
    if (!noTop) seg(0, 0, full, 0, line.kind !== "normal" || thick ? THICK : THIN);
    if (last) seg(0, 100, full, 100, THICK);
    const top = -THICK / 2, bot = 100 + THICK / 2;
    seg(0, top, 0, bot, THICK);
    if (!(descKind === "symbols-and-text" && ["title", "secondary", "text"].includes(line.kind))) seg(800, top, 800, bot, THICK);
    if (descKind === "symbols-and-text") seg(1300, top, 1300, bot, THICK);
    const text1 = (font, s, l, t, r, b, align = "center") => {
      if (s == null || s === "") return;
      const [em, bold, fam] = fontOf(font);
      let size = em * k;
      const width = textWidth(s, bold, fam) * size, room = (r - l) * k;
      if (width > room) size *= (room / width) * 0.95;
      const cy = Y((t + b) / 2) + (CAP_HEIGHT * size) / 2;
      const x = align === "center" ? X((l + r) / 2) : X(l);
      items.push({ t: "text", text: s, x, y: cy, size, bold, align, family: fam });
    };
    const wrapped = (font, s, l, t, r, b) => {
      if (!s) return;
      const [em, bold, fam] = fontOf(font);
      let size = em * k;
      const room = (r - l) * k, height = (b - t) * k;
      let ls;
      for (let n = 0; n < 40; n++) {
        ls = wrapText(s, size, room, bold, fam);
        if (ls.length * size * 1.05 <= height && ls.every((x) => textWidth(x, bold, fam) * size <= room)) break;
        size *= 0.95;
      }
      const lh = size * 1.05, top0 = Y((t + b) / 2) - (ls.length * lh) / 2;
      ls.forEach((x, n) => items.push({ t: "text", text: x, x: X(l), y: top0 + n * lh + lh * 0.5 + (CAP_HEIGHT * size) / 2, size, bold, align: "left", family: fam }));
    };
    const sym = (s, l, t, r, b) => {
      if (!s || typeof s !== "object") return;
      // two symbols in one box: side by side, each in half the box, a thin slash between them
      if (s.dual) { const m = (l + r) / 2, h = (b - t) / 4; sym(s.dual[0], l, t + h, m, b - h); sym(s.dual[1], m, t + h, r, b - h); seg(m + 8, t + 20, m - 8, b - 20, THIN); return; }
      for (const p of symbolPaths(s, X(l), Y(t), (r - l) * k, (b - t) * k)) items.push({ t: "path", ...p });
    };
    switch (line.kind) {
      case "title": case "secondary": text1("title", line.boxes[0], 0, 0, full, 100); break;
      case "header2":
        seg(300, top, 300, bot, THICK);
        text1("title", line.boxes[0], 0, 0, 300, 100); text1("title", line.boxes[1], 300, 0, 800, 100);
        break;
      case "header3":
        seg(300, top, 300, bot, THICK); seg(600, top, 600, bot, THICK);
        text1("title", line.boxes[0], 0, 0, 300, 100); text1("title", line.boxes[1], 300, 0, 600, 100); text1("title", line.boxes[2], 600, 0, 800, 100);
        break;
      case "directive":
        if (descKind === "text") wrapped("text", line.textual, 15, 0, 785, 100);
        else {
          sym(line.boxes[0], 0, 0, 800, 100);
          text1("directive", line.boxes[1], 300, 0, 500, 100);
          if (descKind === "symbols-and-text") wrapped("text", line.textual, 815, 0, 1285, 100);
        }
        break;
      case "normal": {
        let show = () => true;
        if (descKind === "text") {
          seg(100, top, 100, bot, THIN); seg(200, top, 200, bot, THICK);
          if (columnHScore) seg(700, top, 700, bot, THICK);
          wrapped("text", line.textual, 215, 0, columnHScore ? 685 : 785, 100);
          show = columnHScore ? (i) => i < 2 || i === 7 : (i) => i < 2;
        } else {
          for (const [x, w] of [[100, THIN], [200, THIN], [300, THICK], [400, THIN], [500, THIN], [600, THICK], [700, THIN]]) seg(x, top, x, bot, w);
          if (descKind === "symbols-and-text") wrapped("text", line.textual, 815, 0, 1285, 100);
        }
        for (let i = 0; i < 8; i++) {
          if (!show(i)) continue;
          const b = line.boxes[i];
          if (b && typeof b === "object") sym(b, i * 100, 0, i * 100 + 100, 100);
          else if (typeof b === "string") {
            if (i === 5) colF(items, b, X, Y, k, text1, seg);
            else text1(i === 0 ? "colA" : "colB", b, i * 100, 0, i * 100 + 100, 100);
          }
        }
        break;
      }
      case "key":
        sym(line.boxes[0], 100, 0, 200, 100);
        text1("key", `= ${line.boxes[1]}`, 200, 0, 800, 100, "left");
        break;
      case "text": wrapped("textLine", line.boxes[0], 20, 0, full, 100); break;
      default: break;
    }
    // thick lines every three normal lines, and after the start
    if (line.kind === "normal") {
      if (line.boxes[0] && typeof line.boxes[0] === "object") thickCounter = 0;
      else { thickCounter++; if (thickCounter === 3) thickCounter = 0; }
    } else thickCounter = 0;
  }
  return items;
}
function colF(items, s, X, Y, k, text1, seg) {
  s = s.replace(/x/g, "×");
  let i = s.indexOf("|");
  if (i >= 0) {
    text1("colF2", s.slice(0, i), 500, 0, 600, 50);
    text1("colF2", s.slice(i + 1), 500, 50, 600, 100);
    return;
  }
  i = s.indexOf("/");
  if (i >= 0) {
    seg(600, 0, 500, 100, THIN);
    text1("colF2", s.slice(0, i), 500, 0, 563, 50);
    text1("colF2", s.slice(i + 1), 537, 50, 600, 100);
    return;
  }
  text1("colF", s, 500, 0, 600, 100);
}

/** What a click at (x, y) mm from the sheet's corner touches: { line, box (0-7 or -1), kind: "title"|"secondary"|"header"|"box"|"text"|"directive"|"key" }. */
export function hitTest(lines, descKind, cell, x, y) {
  const W = widthInCells(descKind);
  if (x < 0 || y < 0 || x >= W * cell || y >= lines.length * cell) return null;
  const li = Math.floor(y / cell), col = Math.floor(x / cell), line = lines[li];
  switch (line.kind) {
    case "title": return { line: li, box: 0, kind: "title" };
    case "secondary": return { line: li, box: 0, kind: "secondary" };
    case "header2": return col < 3 ? { line: li, box: 0, kind: "header" } : col < 8 ? { line: li, box: 1, kind: "header" } : null;
    case "header3": return col < 3 ? { line: li, box: 0, kind: "header" } : col < 6 ? { line: li, box: 1, kind: "header" } : col < 8 ? { line: li, box: 2, kind: "header" } : null;
    case "normal":
      if (descKind === "symbols-and-text" && col >= 8) return { line: li, box: -1, kind: "normalText" };
      if (descKind === "text" && col >= 2) return { line: li, box: -1, kind: "normalText" };
      return { line: li, box: col, kind: "box" };
    case "directive": return { line: li, box: descKind === "symbols" ? 0 : -1, kind: "directive" };
    case "text": return { line: li, box: 0, kind: "text" };
    case "key": return { line: li, box: 0, kind: "key" };
    default: return null;
  }
}
