// Cartographier's symbol editor (owner, 2026-11-06): a symbol's OCAD record edited field by field, by its kind — a point's
// elements (lines, areas, circles, dots, in mm around the point); a line's colour, width, ends, dashes, double line, framing line,
// shortened ends and the symbols repeated along it; an area's fill, hatching, pattern of a point's elements and border line; a
// text's font, size, colour, alignment and frame — with a preview drawn by the map's own engine as it is typed. A new symbol starts
// from a copy of another or blank; a symbol renumbered takes its objects with it; one no object uses can be deleted. Lengths are
// shown in mm (the record keeps hundredths), angles in degrees (tenths), font sizes in points (tenths).

import * as G from "./geom.js";
import { makeContext, compileSymbol, compileObject } from "../tracer/vmap/ocad.js";
import { CanvasTarget } from "../tracer/vmap/target.js";
import { Matrix } from "../tracer/vmap/geom.js";
import { modal, num } from "../tracer/dialogs.js";
import { symName, numLabel } from "./panels.js";
import { t } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "rawAt" ? undefined : v)));
const MM = (v) => Math.round((v || 0)) / 100;
const KIND = { 1: "point", 2: "line", 3: "area", 4: "text", 6: "text", 5: "rect", 7: "rect" };
const kindOf = (s) => (s.otp === 2 && s.symTp === 1 ? "linetext" : KIND[s.otp] || "point");
const ENDS = [[0, "map.sym.ends.flat"], [1, "map.sym.ends.round"], [4, "map.sym.ends.miter"], [2, "map.sym.ends.pointed"], [3, "map.sym.ends.pointedRound"]];
const ELT = [[1, "map.sym.elt.line"], [2, "map.sym.elt.area"], [3, "map.sym.elt.circle"], [4, "map.sym.elt.dot"]];

/** The fields of a kind: [key, label key, unit] — unit "mm" (hundredths kept), "deg" (tenths), "pt" (tenths), "int", "color", "bool". */
const FIELDS = {
  line: [["lineColor", "map.sym.color", "color"], ["lineWidth", "map.sym.width", "mm"], ["lineEnds", "map.sym.ends", "ends"],
    ["mainLength", "map.sym.dash", "mm"], ["mainGap", "map.sym.gap", "mm"], ["endLength", "map.sym.endDash", "mm"], ["secGap", "map.sym.secGap", "mm"], ["endGap", "map.sym.endGap", "mm"],
    ["minSym", "map.sym.minSym", "int"], ["distFromStart", "map.sym.fromStart", "mm"], ["distToEnd", "map.sym.toEnd", "mm"],
    ["dblMode", "map.sym.dblMode", "dbl"], ["dblWidth", "map.sym.dblWidth", "mm"], ["dblLeftColor", "map.sym.dblLeft", "color"], ["dblLeftWidth", "map.sym.dblLeftWidth", "mm"],
    ["dblRightColor", "map.sym.dblRight", "color"], ["dblRightWidth", "map.sym.dblRightWidth", "mm"], ["dblFillColor", "map.sym.dblFill", "color"], ["dblFlags", "map.sym.dblFillOn", "bool"],
    ["dblLength", "map.sym.dblDash", "mm"], ["dblGap", "map.sym.dblGap", "mm"],
    ["frColor", "map.sym.frame", "color"], ["frWidth", "map.sym.frameWidth", "mm"],
    ["nPrimSym", "map.sym.nPrim", "int"], ["primSymDist", "map.sym.primDist", "mm"]],
  area: [["fillOn", "map.sym.fillOn", "bool"], ["fillColor", "map.sym.fill", "color"], ["hatchMode", "map.sym.hatchMode", "hatch"], ["hatchColor", "map.sym.hatchColor", "color"],
    ["hatchLineWidth", "map.sym.hatchWidth", "mm"], ["hatchDist", "map.sym.hatchDist", "mm"], ["hatchAngle1", "map.sym.hatchAngle1", "deg"], ["hatchAngle2", "map.sym.hatchAngle2", "deg"],
    ["structMode", "map.sym.structMode", "struct"], ["structWidth", "map.sym.structWidth", "mm"], ["structHeight", "map.sym.structHeight", "mm"], ["structAngle", "map.sym.structAngle", "deg"],
    ["borderOn", "map.sym.borderOn", "bool"], ["borderSym", "map.sym.border", "linesym"]],
  text: [["fontName", "map.sym.font", "font"], ["fontSize", "map.sym.size", "pt"], ["fontColor", "map.sym.color", "color"], ["weight", "map.sym.bold", "bold"], ["italic", "map.sym.italic", "bool"],
    ["alignment", "map.sym.align", "align"], ["lineSpace", "map.sym.lineSpace", "int"], ["frMode", "map.sym.frMode", "frmode"], ["frColor", "map.sym.frame", "color"], ["frWidth", "map.sym.frameWidth", "mm"]],
  linetext: [["fontName", "map.sym.font", "font"], ["fontSize", "map.sym.size", "pt"], ["fontColor", "map.sym.color", "color"], ["weight", "map.sym.bold", "bold"], ["italic", "map.sym.italic", "bool"]],
  rect: [["lineColor", "map.sym.color", "color"], ["lineWidth", "map.sym.width", "mm"], ["radius", "map.sym.radius", "mm"]],
  point: [],
};
/** The element lists a kind has: point `elts`; line prim/sec/corner/start/end; area `elts` (its pattern's glyph). */
const ELISTS = { point: ["elts"], line: ["prim", "sec", "corner", "start", "end"], area: ["elts"] };
const FONTS = ["Arial", "Arial Narrow", "Roboto", "Roboto Condensed", "Helvetica", "Times New Roman", "Courier New", "Verdana"];

function selHtml(name, opts, cur) { return `<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`; }
function input(E, s, [key, label, unit]) {
  const v = s[key];
  const cols = E.doc.colors.slice().reverse().map((c) => [c.num, c.name]);
  let ctl;
  switch (unit) {
    case "mm": ctl = `<input name="${key}" type="number" step="0.01" value="${MM(v)}" class="mp-num"> mm`; break;
    case "deg": ctl = `<input name="${key}" type="number" step="0.1" value="${(v || 0) / 10}" class="mp-num"> °`; break;
    case "pt": ctl = `<input name="${key}" type="number" step="0.1" value="${(v || 0) / 10}" class="mp-num"> pt`; break;
    case "int": ctl = `<input name="${key}" type="number" step="1" value="${v || 0}" class="mp-num">`; break;
    case "bool": ctl = `<input name="${key}" type="checkbox" ${v ? "checked" : ""}>`; break;
    case "color": ctl = selHtml(key, [["-1", t("map.sym.none")], ...cols], v ?? -1); break;
    case "ends": ctl = selHtml(key, ENDS.map(([n, k]) => [n, t(k)]), (v || 0) & 7); break;
    case "dbl": ctl = selHtml(key, [[0, t("map.sym.dbl.0")], [1, t("map.sym.dbl.1")], [2, t("map.sym.dbl.2")], [3, t("map.sym.dbl.3")], [4, t("map.sym.dbl.4")]], v || 0); break;
    case "hatch": ctl = selHtml(key, [[0, t("map.sym.hatch.0")], [1, t("map.sym.hatch.1")], [2, t("map.sym.hatch.2")]], v || 0); break;
    case "struct": ctl = selHtml(key, [[0, t("map.sym.struct.0")], [1, t("map.sym.struct.1")], [2, t("map.sym.struct.2")]], v || 0); break;
    case "linesym": ctl = selHtml(key, [[0, t("map.sym.none")], ...E.doc.symbols.filter((x) => x.otp === 2 && !x.symTp).map((x) => [x.sym, `${numLabel(x.sym)} ${symName(x)}`])], v || 0); break;
    case "font": ctl = `<input name="${key}" list="mp-fonts" value="${esc(v || "Arial")}"><datalist id="mp-fonts">${FONTS.map((f) => `<option value="${f}">`).join("")}</datalist>`; break;
    case "bold": ctl = `<input name="${key}" type="checkbox" ${(v || 400) >= 600 ? "checked" : ""}>`; break;
    case "align": ctl = selHtml(key, [[0, t("map.sym.align.left")], [1, t("map.sym.align.center")], [2, t("map.sym.align.right")], [3, t("map.sym.align.justify")]], (v || 0) & 3); break;
    case "frmode": ctl = selHtml(key, [[0, t("map.sym.fr.0")], [1, t("map.sym.fr.1")], [2, t("map.sym.fr.2")]], v || 0); break;
    default: ctl = "";
  }
  return `<label class="mp-symf"><span>${esc(t(label))}</span><span>${ctl}</span></label>`;
}
function readField(form, s, [key, , unit]) {
  const el = form.elements[key];
  if (!el) return;
  const n = num(el.value);
  switch (unit) {
    case "mm": s[key] = Math.round((Number.isFinite(n) ? n : 0) * 100); break;
    case "deg": case "pt": s[key] = Math.round((Number.isFinite(n) ? n : 0) * 10); break;
    case "int": case "color": case "ends": case "dbl": case "hatch": case "struct": case "linesym": case "align": case "frmode": s[key] = Math.round(Number.isFinite(n) ? n : 0); break;
    case "bool": s[key] = key === "dblFlags" ? (el.checked ? (s[key] | 1) : (s[key] & ~1)) : el.checked; break;
    case "bold": s[key] = el.checked ? 700 : 400; break;
    case "font": s[key] = el.value.trim() || "Arial"; break;
  }
}
/** An element list as text: one element a line — kind, colour, width, diameter, then its points « x y; x y » in mm. */
function eltsHtml(E, s, list) {
  const els = s[list] || [];
  const cols = E.doc.colors.slice().reverse().map((c) => [c.num, c.name]);
  return `<fieldset class="mp-elts" data-list="${list}"><legend>${esc(t(`map.sym.list.${list}`))}</legend>
    ${els.map((e, i) => `<div class="mp-elt" data-i="${i}">${selHtml(`${list}_t${i}`, ELT.map(([n, k]) => [n, t(k)]), e.type)}${selHtml(`${list}_c${i}`, cols, e.color)}
      <label>${esc(t("map.sym.width"))} <input name="${list}_w${i}" type="number" step="0.01" value="${MM(e.lineWidth)}" class="mp-num"></label>
      <label>${esc(t("map.sym.diameter"))} <input name="${list}_d${i}" type="number" step="0.01" value="${MM(e.diameter)}" class="mp-num"></label>
      <input name="${list}_p${i}" value="${esc((e.coords || []).map((c) => `${G.mmX(c)} ${G.mmY(c)}${G.flags(c) & 3 ? `*${G.flags(c) & 3}` : ""}`).join("; "))}" class="mp-pts" aria-label="${esc(t("map.sym.points"))}" title="${esc(t("map.sym.pointsHint"))}">
      <button type="button" class="tr-icon" data-edel="${list}:${i}" title="${esc(t("map.col.delete"))}">✕</button></div>`).join("")}
    <button type="button" class="btn btn-sm" data-eadd="${list}">${esc(t("map.sym.addElt"))}</button></fieldset>`;
}
function readElts(form, s, list) {
  const els = s[list] || [];
  s[list] = els.map((e, i) => {
    if (!form.elements[`${list}_t${i}`]) return e;
    const coords = String(form.elements[`${list}_p${i}`].value || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
      const m = /^(-?[\d.,]+)\s+(-?[\d.,]+)(?:\s*\*\s*(\d))?$/.exec(x);
      return m ? G.pt(num(m[1]) || 0, num(m[2]) || 0, Number(m[3] || 0)) : null;
    }).filter(Boolean);
    return { ...e, type: Number(form.elements[`${list}_t${i}`].value), color: Number(form.elements[`${list}_c${i}`].value),
      lineWidth: Math.round((num(form.elements[`${list}_w${i}`].value) || 0) * 100), diameter: Math.round((num(form.elements[`${list}_d${i}`].value) || 0) * 100),
      coords: coords.length ? coords : [G.pt(0, 0)], nPoly: coords.length || 1, flags: e.flags || 0 };
  });
}

/** The symbol drawn on a canvas, in a context of its own (the map's other symbols compiled beside it, for a border line). */
function preview(E, s, canvas) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  let ctx;
  try {
    ctx = makeContext(E.live.version, E.doc.colors);
    for (const x of E.doc.symbols) if (x.otp === 2 && x.sym !== s.sym) compileSymbol(x, ctx);
    compileSymbol(s, ctx);
  } catch (e) { return String(e.message || e); }
  const k = s.otp === 1 ? Math.min(W, H) / Math.max(2, (s.extent || 300) / 100 * 2.4) : W / 30;
  const w = W / k, h = H / k;
  const o = s.otp === 1 ? { sym: s.sym, otp: 1, ang: 0, coords: [G.pt(0, 0)] }
    : s.otp === 3 ? { sym: s.sym, otp: 3, ang: 0, coords: [[-w * 0.4, -h * 0.35], [w * 0.4, -h * 0.35], [w * 0.4, h * 0.35], [-w * 0.4, h * 0.35]].map(([x, y]) => G.pt(x, y)) }
    : s.otp === 4 || s.otp === 6 || (s.otp === 2 && s.symTp === 1) ? { sym: s.sym, otp: s.otp === 2 ? 2 : 4, ang: 0, coords: s.otp === 2 ? [G.pt(-w * 0.4, 0), G.pt(w * 0.4, 0)] : [G.pt(-w * 0.4, -h * 0.1)], text: "Abc 123" }
    : { sym: s.sym, otp: s.otp === 5 || s.otp === 7 ? s.otp : 2, ang: 0, coords: G.coordsOf([{ pts: G.smoothCurve([[-w * 0.42, -h * 0.25, 0], [-w * 0.1, h * 0.3, 0], [w * 0.15, -h * 0.3, G.F.CORNER], [w * 0.42, h * 0.2, 0]]), hole: false }]) };
  let inst;
  try { inst = compileObject({ objIndex: 0 }, o, ctx); } catch (e) { return String(e.message || e); }
  if (!inst) return t("map.sym.noPreview");
  const tg = new CanvasTarget(g, new Matrix(k, 0, 0, -k, W / 2, H / 2), { minRes: 1 / k });
  ctx.map.draw(tg, [-w / 2, -h / 2, w / 2, h / 2], { minRes: 1 / k });
  tg.flush?.();
  return "";
}

/** Edit a symbol (sym), or make a new one (from a copy of `from`, else blank of `kind`). */
export async function editSymbol(E, sym = null, { from = null, kind = null } = {}) {
  const orig = sym != null ? E.live.symbol(sym) : null;
  const base = orig || (from != null ? E.live.symbol(from) : null);
  let s = base ? clone(base) : blankOf(kind || "line", E);
  if (!orig) s.sym = freeNumber(E, s.sym);
  const k = kindOf(s), fields = FIELDS[k === "linetext" ? "linetext" : k] || [];
  const lists = ELISTS[k] || [];
  const body = () => `<div class="mp-symed">
      <div class="mp-symed-l">
        <div class="mp-row"><label class="mp-symf"><span>${esc(t("map.sym.number"))}</span><span><input name="number" value="${esc(numLabel(s.sym))}" class="mp-num" required></span></label>
        <label class="mp-symf"><span>${esc(t("map.sym.name"))}</span><span><input name="description" value="${esc(s.description || "")}" maxlength="60"></span></label></div>
        <div class="mp-row">${k === "point" ? `<label><input type="checkbox" name="rotatable" ${s.flags & 1 ? "checked" : ""}> ${esc(t("map.sym.rotatable"))}</label>` : ""}
          <label><input type="checkbox" name="hidden" ${s.status & 2 ? "checked" : ""}> ${esc(t("map.sym.hidden"))}</label></div>
        <div class="mp-symfields">${fields.map((f) => input(E, s, f)).join("")}</div>
        ${lists.map((l) => eltsHtml(E, s, l)).join("")}
      </div>
      <div class="mp-symed-r"><canvas id="mp-symprev" width="320" height="200" aria-label="${esc(t("map.sym.preview"))}"></canvas><p class="mp-hint" id="mp-symerr"></p>
        <p class="mp-hint">${esc(t(`map.sym.kind.${k}`))}</p></div></div>`;
  const read = (form) => {
    for (const f of fields) readField(form, s, f);
    for (const l of lists) readElts(form, s, l);
    s.description = form.elements.description.value;
    if (form.elements.rotatable) s.flags = form.elements.rotatable.checked ? (s.flags | 1) : (s.flags & ~1);
    s.status = form.elements.hidden.checked ? ((s.status || 0) | 2) : ((s.status || 0) & ~2);
    if (k === "line") {
      const has = (l) => (s[l] || []).length > 0;
      s.useSymbolFlags = (has("end") ? 1 : 0) | (has("start") ? 2 : 0) | (has("corner") ? 4 : 0) | (has("sec") ? 8 : 0);
      s.dblFlags = s.dblFlags || 0;
    }
    if (k === "area") s.borderOn = !!s.borderOn && !!s.borderSym;
  };
  const draw = (form) => {
    read(form);
    s.extent = extentOf(s);
    const err = preview(E, s, form.querySelector("#mp-symprev"));
    form.querySelector("#mp-symerr").textContent = err;
  };
  const v = await modal(E, { title: orig ? t("map.sym.edit", { n: numLabel(orig.sym) }) : t("map.sym.new"), wide: true, ok: t("map.dlg.save"),
    body: `<div id="mp-symbody">${body()}</div>`,
    onOpen: (form) => {
      draw(form);
      form.addEventListener("input", () => draw(form));
      form.addEventListener("change", () => draw(form));
      form.addEventListener("click", (ev) => {
        const add = ev.target.closest("[data-eadd]"), del = ev.target.closest("[data-edel]");
        if (!add && !del) return;
        read(form);
        if (add) (s[add.dataset.eadd] ||= []).push({ type: 3, flags: 0, color: E.doc.colors[E.doc.colors.length - 1]?.num ?? 0, lineWidth: 15, diameter: 60, coords: [G.pt(0, 0)], nPoly: 1 });
        else { const [l, i] = del.dataset.edel.split(":"); s[l].splice(Number(i), 1); }
        form.querySelector("#mp-symbody").innerHTML = body(); draw(form);
      });
    },
    validate: (x, form) => {
      read(form);
      const n = parseNumber(x.number);
      if (n == null) return t("map.sym.badNumber");
      if (n !== (orig?.sym ?? -1) && E.live.symbol(n)) return t("map.sym.taken", { n: numLabel(n) });
      s.sym = n;
      return null;
    } });
  if (!v) return null;
  s.extent = extentOf(s);
  s.dirty = true;
  E.live.transact(orig ? t("map.undo.symbolEdit") : t("map.undo.symbolNew"), () => {
    if (orig && s.sym !== orig.sym) {
      // renumbered: the symbol added under its new number, its objects moved to it, the old one removed
      E.live.addSymbol(s);
      for (const o of E.doc.objects.filter((x) => x.sym === orig.sym)) E.live.update(o.id, { sym: s.sym });
      removeSymbol(E, orig.sym);
    } else if (orig) E.live.updateSymbol(orig.sym, s);
    else E.live.addSymbol(s);
  });
  E.live.compile(); E.view.setLive(E.live); await E.live.map.ready; E.view.clearTiles();
  E.symbol = s.sym;
  const P = await import("./panels.js"); P.drawLeft(E);
  return s;
}
/** Remove a symbol no object uses (undoable through the document's colours-and-symbols path: compile again). */
export function removeSymbol(E, sym) {
  const i = E.doc.symbols.findIndex((x) => x.sym === sym);
  if (i < 0) return false;
  const before = JSON.parse(JSON.stringify(E.doc.symbols));
  E.doc.symbols.splice(i, 1);
  E.live.record({ kind: "field", field: "symbols", before, after: JSON.parse(JSON.stringify(E.doc.symbols)) }, null);
  return true;
}
export async function deleteSymbol(E, sym) {
  if (E.doc.objects.some((o) => o.sym === sym)) { E.say(t("map.sym.inUse"), "bad"); return; }
  if (E.doc.symbols.some((s) => s.borderSym === sym && s.borderOn)) { E.say(t("map.sym.isBorder"), "bad"); return; }
  E.live.transact(t("map.undo.symbolDelete"), () => removeSymbol(E, sym));
  E.live.compile(); E.view.setLive(E.live); E.view.clearTiles();
  if (E.symbol === sym) E.symbol = null;
  const P = await import("./panels.js"); P.drawLeft(E);
}
const parseNumber = (txt) => { const m = /^\s*(\d{1,5})(?:\.(\d{1,3}))?\s*$/.exec(String(txt || "")); return m ? Number(m[1]) * 1000 + Number(m[2] || 0) : null; };
function freeNumber(E, sym) { let n = sym; while (E.live.symbol(n)) n++; return n; }
/** How far the symbol reaches from its object (0.01 mm), for the index's boxes. */
function extentOf(s) {
  let r = 0;
  const walk = (els) => { for (const e of els || []) for (const c of e.coords || []) r = Math.max(r, Math.hypot(c.x >> 8, c.y >> 8) + (e.lineWidth || 0) / 2 + (e.diameter || 0) / 2); };
  walk(s.elts); walk(s.prim); walk(s.sec); walk(s.corner); walk(s.start); walk(s.end);
  if (s.otp === 2) r = Math.max(r, (s.lineWidth || 0) / 2, (s.dblWidth || 0) / 2 + Math.max(s.dblLeftWidth || 0, s.dblRightWidth || 0), (s.frWidth || 0) / 2);
  return Math.round(r);
}
function blankOf(kind, E) {
  const black = E.doc.colors.slice().reverse().find((c) => c.cmyk[3] > 0.9)?.num ?? E.doc.colors[0]?.num ?? 0;
  const head = { sym: 900000, symTp: 0, flags: 0, extent: 0, status: 0, description: t("map.sym.newName"), nColors: 1 };
  if (kind === "point") return { ...head, otp: 1, elts: [{ type: 3, flags: 0, color: black, lineWidth: 15, diameter: 60, coords: [G.pt(0, 0)], nPoly: 1 }] };
  if (kind === "area") return { ...head, otp: 3, borderSym: 0, fillColor: black, hatchMode: 0, hatchColor: black, hatchLineWidth: 10, hatchDist: 50, hatchAngle1: 450, hatchAngle2: 1350,
    fillOn: true, borderOn: false, structMode: 0, structDraw: 0, structWidth: 100, structHeight: 100, structAngle: 0, irrX: 0, irrY: 0, irrMin: 0, elts: [] };
  if (kind === "text") return { ...head, otp: 4, fontName: "Arial", fontColor: black, fontSize: 100, weight: 400, italic: false, charSpace: 0, wordSpace: 100, alignment: 0, lineSpace: 100,
    paraSpace: 0, indentFirst: 0, indentOther: 0, nTabs: 0, tabs: [], lbOn: false, lbColor: black, lbWidth: 0, lbDist: 0, frMode: 0, frFlags: 0, frName: "", frColor: black, frSize: 0,
    frWeight: 400, frItalic: false, frOfX: 0, frOfY: 0, frLeft: 0, frTop: 0, frRight: 0, frBottom: 0, frWidth: 0, pointSymOn: false, pointSym: 0 };
  return { ...head, otp: 2, lineColor: black, lineWidth: 18, lineEnds: 0, distFromStart: 0, distToEnd: 0, mainLength: 0, endLength: 0, mainGap: 0, secGap: 0, endGap: 0, minSym: 0,
    nPrimSym: 1, primSymDist: 0, dblMode: 0, dblFlags: 0, dblFillColor: black, dblLeftColor: black, dblRightColor: black, dblWidth: 0, dblLeftWidth: 0, dblRightWidth: 0, dblLength: 0, dblGap: 0,
    decMode: 0, decLast: 0, decSymbolDistance: true, decSymbolWidth: false, frColor: black, frWidth: 0, frStyle: 0, useSymbolFlags: 0, prim: [], sec: [], corner: [], start: [], end: [] };
}
/** « Nouveau symbole »: a copy of the current symbol, or a blank point, line, area or text. */
export async function newSymbol(E) {
  const cur = E.currentSymbol();
  const v = await modal(E, { title: t("map.sym.new"), ok: t("map.ok.create"), body: `<fieldset class="mp-choice"><legend>${esc(t("map.sym.startFrom"))}</legend>
    ${cur ? `<label><input type="radio" name="k" value="copy" checked> ${esc(t("map.sym.copyOf", { s: `${numLabel(cur.sym)} ${symName(cur)}` }))}</label>` : ""}
    ${["point", "line", "area", "text"].map((k, i) => `<label><input type="radio" name="k" value="${k}" ${!cur && !i ? "checked" : ""}> ${esc(t(`map.sym.blank.${k}`))}</label>`).join("")}</fieldset>` });
  if (!v) return null;
  return v.k === "copy" ? editSymbol(E, null, { from: cur.sym }) : editSymbol(E, null, { kind: v.k });
}
export async function act(E, act) {
  if (act === "symbol-edit") { const s = E.currentSymbol() || (E.selected()[0] && E.live.symbol(E.selected()[0].sym)); if (!s) { E.say(t("map.why.noSymbol"), "bad"); return; } return editSymbol(E, s.sym); }
  if (act === "symbol-new") return newSymbol(E);
  if (act === "symbol-delete") { const s = E.currentSymbol(); if (!s) { E.say(t("map.why.noSymbol"), "bad"); return; } return deleteSymbol(E, s.sym); }
}
