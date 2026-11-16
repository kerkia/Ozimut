// Purple Pen's event files (.ppen) in and out of the Tracer's model (tracer/model.js), element for element as Purple
// Pen's EventDB reads and writes them (BSD licence, assets/tracer/LICENSE-PurplePen.txt): what Purple Pen saves comes
// back unchanged, and a file the Tracer writes opens in Purple Pen. The map itself is a separate file; the .ppen names
// it (relative name and absolute path), and the Tracer keeps that name.
//
// A small XML reader and writer of their own (no DOM): the same code runs in the browser and in node for tests.

import { newEvent, sanitize, fileOffset, shiftToFile } from "./model.js";

// ---- XML ---------------------------------------------------------------------------------------------------------------
const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m);
/** Parse XML text into { name, attrs, children, text } (text = the element's own character data, concatenated). */
export function parseXml(src) {
  src = src.replace(/^﻿/, "");
  const root = { name: "#doc", attrs: {}, children: [], text: "" }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/\s*([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {};
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = unescape(a[2] ?? a[3]);
      const el = { name: m[3], attrs, children: [], text: "" };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] != null) top.text += unescape(m[6]);
  }
  return root;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A writer producing Purple Pen's layout: two-space indentation, one element per line. */
class Writer {
  constructor() { this.out = ['﻿<?xml version="1.0" encoding="utf-8"?>']; this.depth = 0; }
  el(name, attrs = {}, body) {
    const a = Object.entries(attrs).filter(([, v]) => v != null && v !== "").map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
    const pad = "  ".repeat(this.depth);
    if (body == null) this.out.push(`${pad}<${name}${a} />`);
    else if (typeof body === "string") this.out.push(`${pad}<${name}${a}>${esc(body)}</${name}>`);
    else { this.out.push(`${pad}<${name}${a}>`); this.depth++; body(); this.depth--; this.out.push(`${pad}</${name}>`); }
  }
  toString() { return this.out.join("\r\n") + "\r\n"; }
}
// XmlConvert's formats
const num = (v) => {
  if (v == null || !Number.isFinite(v)) return "0";
  const s = String(Math.fround(v));
  return Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential().replace("e", "E") : String(Number(Number(s).toPrecision(9)));
};
const bool = (b) => (b ? "true" : "false");
const kids = (el, name) => el.children.filter((c) => c.name === name);
const kid = (el, name) => el.children.find((c) => c.name === name);
const f = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };
const i = (v, d = 0) => { const x = parseInt(v, 10); return Number.isFinite(x) ? x : d; };
const b = (v, d = false) => (v == null ? d : String(v).trim().toLowerCase() === "true" || v === "1");
const loc = (el) => [f(el.attrs.x), f(el.attrs.y)];

// ---- reading ------------------------------------------------------------------------------------------------------------
function readPrintArea(el) {
  if (!el) return null;
  const a = el.attrs;
  const has = ["left", "top", "right", "bottom"].every((k) => a[k] != null);
  return { auto: has ? b(a.automatic) : true, restrict: b(a["restrict-to-page-size"]),
    // the rectangle in map mm [left, bottom, right, top] (Purple Pen's « top » attribute is the larger y)
    rect: has && !(b(a.automatic) && [a.left, a.top, a.right, a.bottom].every((v) => f(v) === 0)) ? [f(a.left), f(a.bottom), f(a.right), f(a.top)] : null,
    pageW: i(a["page-width"], -1), pageH: i(a["page-height"], -1), margins: i(a["page-margins"], 0), landscape: b(a["page-landscape"]) };
}
const DESC_KIND = { symbols: "symbols", text: "text", "symbols-and-text": "symbols-and-text" };
const SCORE_COL = { A: 0, B: 1, H: 7, NONE: -1 };

/** Read a .ppen text into a Tracer event. Throws "ppen" if it is not one. */
export function readPpen(text) {
  const doc = parseXml(text), root = kid(doc, "course-scribe-event");
  if (!root) throw new Error("ppen");
  const ev = newEvent();
  ev.appearance.blend = "none";                         // Purple Pen: no blending unless the file says so
  ev.descStandard = "2004"; ev.appearance.mapStandard = "2000";
  const evEl = kid(root, "event");
  if (evEl) readEvent(ev, evEl);
  for (const el of kids(root, "control")) ev.controls[i(el.attrs.id)] = readControl(el);
  for (const el of kids(root, "course")) ev.courses[i(el.attrs.id)] = readCourse(el, ev);
  for (const el of kids(root, "course-control")) ev.courseControls[i(el.attrs.id)] = readCourseControl(el);
  for (const el of kids(root, "leg")) ev.legs[i(el.attrs.id)] = readLeg(el);
  for (const el of kids(root, "special-object")) ev.specials[i(el.attrs.id)] = readSpecial(el);
  // older files: gaps saved without a scale belong to every scale in use (EventDB.FixControlPointGaps)
  for (const c of Object.values(ev.controls)) if (c.gaps?.[0]) {
    const g = c.gaps[0]; delete c.gaps[0];
    c.gaps[Math.round(ev.map.scale)] = g;
    for (const co of Object.values(ev.courses)) c.gaps[Math.round(co.printScale)] = g;
  }
  // gaps stored at the course's print scale by old versions while sizes scaled with the map (Fix 2)
  if (!ev.appearance.gapsScaled && ["RelativeTo15000", "RelativeToMap"].includes(ev.appearance.itemScaling)) {
    const to = ev.appearance.itemScaling === "RelativeTo15000" ? 15000 : Math.round(ev.map.scale);
    for (const c of Object.values(ev.controls)) if (c.gaps && Object.keys(c.gaps).length && !c.gaps[to]) c.gaps[to] = c.gaps[Math.max(...Object.keys(c.gaps).map(Number))];
  }
  delete ev.appearance.gapsScaled;
  // courses without an order: by name (EventDB.FixCourseSortOrders)
  if (Object.values(ev.courses).some((c) => !(c.order > 0)))
    Object.values(ev.courses).sort((a, z) => a.name.localeCompare(z.name, "fr", { sensitivity: "base" })).forEach((c, k) => { c.order = k + 1; });
  return sanitize(ev);
}

function readEvent(ev, el) {
  let printArea = null;
  for (const c of el.children) {
    const a = c.attrs;
    switch (c.name) {
      case "title": ev.title = c.text; break;
      case "notes": ev.notes = c.text; break;
      case "standards": ev.appearance.mapStandard = a.map || "2000"; ev.descStandard = a.description || "2004"; break;
      case "map": {
        const kind = { none: "none", OCAD: "ocad", bitmap: "bitmap", PDF: "pdf" }[a.kind] || "none";
        ev.map = { ...ev.map, kind, scale: f(a.scale, 10000), dpi: kind === "bitmap" ? f(a.dpi, 0) : 0, file: (c.text || "").trim(),
          absolute: a["absolute-path"] || "", ignoreMissingFonts: b(a["ignore-missing-fonts"]) };
        break;
      }
      case "all-controls": ev.allControls = { printScale: f(a["print-scale"], 0), descKind: DESC_KIND[a["description-kind"]] || "symbols" }; break;
      case "numbering": ev.numbering = { start: i(a.start, 31), noInvertible: b(a["disallow-invertible"], true) }; break;
      case "punch-card": ev.punchCard = { rows: i(a.rows, 3), cols: i(a.columns, 8), ltr: b(a["left-to-right"], true), ttb: b(a["top-to-bottom"], false) }; break;
      case "course-appearance": {
        const ap = ev.appearance;
        ap.controlCircleSize = f(a["control-circle-size-ratio"], 1); ap.lineWidth = f(a["line-width-ratio"], 1);
        ap.centerDot = f(a["center-dot-diameter"], 0); ap.numberHeight = f(a["number-size-ratio"], 1);
        ap.itemScaling = ["None", "RelativeToMap", "RelativeTo15000"].includes(a["scale-sizes"]) ? a["scale-sizes"] : "None";
        ap.gapsScaled = b(a["scale-sizes-circle-gaps"]);
        ap.numberBold = b(a["number-bold"]); ap.numberFont = (a["number-font"] || "Roboto") === "Roboto" ? "Roboto" : "Arial";
        ap.numberOutline = f(a["number-outline-width"], 0); ap.autoLegGap = f(a["auto-leg-gap-size"], 3.5);
        const bp = a["blend-purple"] || "false", bs = a["blend-style"] || "blend";
        ap.blend = bp === "true" ? (bs === "layer" ? "layer" : "blend") : "none";
        ap.lowerPurpleLayer = i(a["lower-purple-layer"], 0);
        const cmyk = ["purple-cyan", "purple-magenta", "purple-yellow", "purple-black"].map((k) => f(a[k], -1));
        ap.purple = cmyk.some((x) => x < 0) ? null : cmyk;
        break;
      }
      case "print-area": printArea = readPrintArea(c); break;
      case "descriptions": ev.lang = a.lang || "en"; ev.appearance.descriptionsPurple = String(a.color || "black").toLowerCase() === "purple"; break;
      case "ocad": ev.appearance.ocadOverprint = b(a["overprint-colors"]); break;
      case "custom-symbol-text": {
        const id = a["iof-2004-ref"];
        ev.customKey[id] = b(a["show-key"]);
        const texts = kids(c, "text").map((t) => ({ lang: t.attrs.lang, plural: b(t.attrs.plural), gender: t.attrs.gender || "",
          case: t.attrs.case || "", modCase: t.attrs["modified-case"] || t.attrs["case-of-modified"] || "", text: t.text }));
        if (!texts.length && c.text.trim()) texts.push({ lang: "en", plural: false, gender: "", case: "", modCase: "", text: id.startsWith("8.") ? `${c.text} {0}` : c.text });
        ev.customText[id] = texts;
        break;
      }
      case "livelox": ev.livelox = a["importable-event-id"] || null; break;
      default: break;
    }
  }
  if (!ev.allControls.printScale) ev.allControls.printScale = ev.map.scale;
  ev.printArea = printArea || { auto: true, restrict: true, rect: null, pageW: -1, pageH: -1, margins: 0, landscape: false };
}

const CTRL_KIND = { normal: "normal", start: "start", "map-issue": "map-issue", finish: "finish", "crossing-point": "crossing", "map-exchange": "map-exchange" };
const BOX = { all: 0, C: 0, D: 1, E: 2, F: 3, G: 4, H: 5 };
/** Purple Pen's first gap format: 32 bits, a 0 per 11.25° gap. */
function bitsToGaps(text) {
  const g = parseInt(text, 2) >>> 0;
  if (g === 0xffffffff) return null;
  if (g === 0) return [[-360, 0]];
  const bit = (k) => ((g >>> (((k % 32) + 32) % 32)) & 1) === 1;
  let first = 0;
  for (let k = 0; k < 32; k++) if (!bit(k) && bit(k - 1)) { first = k; break; }
  const out = [];
  let start = first;
  for (let k = first; k < first + 32; k++) {
    if (bit(k) && !bit(k - 1)) out.push([start * 360 / 32, k * 360 / 32]);
    if (!bit(k) && bit(k - 1)) start = k;
  }
  return out;
}
const decodeGaps = (t) => t.split(",").map((x) => x.split(":").map(Number)).filter((x) => x.length === 2 && x.every(Number.isFinite));

function readControl(el) {
  const a = el.attrs, kind = CTRL_KIND[a.kind] || "normal";
  const c = { kind, code: null, x: 0, y: 0, symbols: ["normal", "start", "map-exchange"].includes(kind) ? [null, null, null, null, null, null] : [null], colF: null };
  if (a.gaps) c.gaps = { 0: bitsToGaps(a.gaps) };
  if (a["all-controls-code-angle"] != null) c.codeAngle = f(a["all-controls-code-angle"]);
  if (kind === "crossing") { c.orientation = f(a.orientation); c.stretch = f(a.stretch, 0); }
  if (kind === "map-issue") c.issueKind = a["map-issue-location"] || "beginning";
  for (const s of el.children) {
    switch (s.name) {
      case "code": c.code = s.text.trim(); break;
      case "location": [c.x, c.y] = loc(s); break;
      case "description": {
        const k = BOX[s.attrs.box];
        if (k == null) break;
        const idx = c.symbols.length === 1 ? 0 : k;
        if (s.attrs["iof-2004-ref"]) c.symbols[idx] = s.attrs["iof-2004-ref"];
        if (s.attrs.box === "F" && s.text) c.colF = s.text;
        break;
      }
      case "gaps": {
        const sc = i(s.attrs.scale, 0), t = s.text.trim();
        if (!t) break;
        c.gaps = c.gaps || {};
        if (t.includes(":")) c.gaps[sc] = decodeGaps(t);
        else if (!c.gaps[sc]) c.gaps[sc] = bitsToGaps(t);
        break;
      }
      case "circle-gaps": { const t = s.text.trim(); if (t.includes(":")) { c.gaps = c.gaps || {}; c.gaps[i(s.attrs.scale, 0)] = decodeGaps(t); } break; }
      case "punch-pattern": c.punch = { size: i(s.attrs.size, 0), dots: s.text.replace(/[^01]/g, "") }; break;
      case "description-text": c.descText = s.text; break;
      case "description-text-line": if (s.attrs.location === "before") c.before = s.text; else if (s.attrs.location === "after") c.after = s.text; break;
      default: break;
    }
  }
  if (c.gaps) for (const [k, v] of Object.entries(c.gaps)) if (!v) delete c.gaps[k];
  return c;
}

const LABELS = ["sequence", "code", "sequence-and-code", "sequence-and-score", "code-and-score", "score"];
function readCourse(el, ev) {
  const a = el.attrs, kind = a.kind === "score" ? "score" : "normal";
  const c = { kind, name: "", order: i(a.order, 0), labels: kind === "score" ? "code" : "sequence", secondary: null, printScale: 15000,
    climb: -1, length: null, load: -1, firstNumber: 1, scoreColumn: kind === "score" ? 0 : -1, hideFromReports: false, descKind: "symbols",
    printArea: null, partAreas: {}, partOptions: {}, relay: { first: 1, teams: 0, legs: 1, branches: {} }, hideVariations: false, first: 0 };
  for (const s of el.children) {
    const sa = s.attrs;
    switch (s.name) {
      case "name": c.name = s.text; c.hideVariations = b(sa["hide-variations-on-map"]); break;
      case "secondary-title": c.secondary = s.text; break;
      case "first": c.first = i(sa["course-control"]); c.firstNumber = i(sa["control-number"], 1); break;
      case "print-area": { const pa = readPrintArea(s), part = i(sa.part, -1); if (part < 0) c.printArea = pa; else c.partAreas[part] = pa; break; }
      case "options": {
        c.printScale = f(sa["print-scale"], 15000); c.climb = f(sa.climb, -1); c.load = i(sa.load, -1);
        if (kind === "score") c.scoreColumn = SCORE_COL[String(sa["score-column"] || "").trim().toUpperCase()] ?? 0;
        c.descKind = DESC_KIND[sa["description-kind"]] || "symbols";
        c.hideFromReports = b(sa["hide-from-reports"]);
        const len = f(sa["course-length"], -1);
        c.length = len > 0 ? len : null;
        break;
      }
      case "part-options": { const part = i(sa.part, -1); if (part >= 0) c.partOptions[part] = { showFinish: b(sa["show-finish"]) }; break; }
      case "labels": c.labels = LABELS.includes(sa["label-kind"]) ? sa["label-kind"] : "sequence"; break;
      case "relay": c.relay.first = i(sa["first-team"], 1); c.relay.teams = i(sa.teams, 0); c.relay.legs = i(sa.legs, 1); break;
      case "relay-branch": { const br = sa.branch || "", leg = i(sa.leg, -1); if (br.length === 1 && leg >= 1) (c.relay.branches[br] ||= []).push(leg - 1); break; }
      default: break;
    }
  }
  if (!c.printArea) c.printArea = { auto: true, restrict: true, rect: null, pageW: -1, pageH: -1, margins: 0, landscape: false };
  void ev;
  return c;
}

function readCourseControl(el) {
  const a = el.attrs;
  const cc = { control: i(a.control), next: 0 };
  if (a.variation === "fork" || a.variation === "loop") { cc.split = true; cc.loop = a.variation === "loop"; cc.splitEnd = i(a["variation-end"]); }
  if (b(a["map-exchange"])) { cc.exchange = true; if (b(a["map-flip"])) cc.flip = true; }
  if (a.points) cc.points = i(a.points);
  const vars = [];
  for (const s of el.children) {
    switch (s.name) {
      case "next": cc.next = i(s.attrs["course-control"]); break;
      case "variation": vars.push(i(s.attrs["course-control"])); break;
      case "number-location": cc.number = [f(s.attrs.x), f(s.attrs.y)]; break;
      case "description-text-line": if (s.attrs.location === "before") cc.before = s.text; else if (s.attrs.location === "after") cc.after = s.text; break;
      default: break;
    }
  }
  if (cc.split) cc.splitCCs = vars;
  return cc;
}

const FLAG = { none: "none", "beginning-part": "begin", "end-part": "end", "map-issue-middle": "issue-middle", all: "all" };
function readLeg(el) {
  const l = { c1: i(el.attrs["start-control"]), c2: i(el.attrs["end-control"]), flagging: "none" };
  for (const s of el.children) {
    if (s.name === "flagging") {
      l.flagging = FLAG[s.attrs.kind] || "none";
      if (["begin", "end", "issue-middle"].includes(l.flagging)) l.flag = loc(s);
    } else if (s.name === "bends") l.bends = kids(s, "location").map(loc);
    else if (s.name === "gaps") l.gaps = kids(s, "gap").map((g) => [f(g.attrs.start), f(g.attrs.length)]);
  }
  if (!l.bends?.length) l.bends = null;
  if (!l.gaps?.length) l.gaps = null;
  return l;
}

const COLOR = (s) => (s === "black" || s === "purple" || s === "lower-purple" ? s : (s || "").split(",").map(Number).length === 4 ? s.split(",").map(Number) : "purple");
function readSpecial(el) {
  const a = el.attrs;
  const sp = { kind: a.kind, pts: [], all: true, courses: [] };
  if (a.kind === "optional-crossing-point") { sp.orientation = f(a.orientation); sp.stretch = f(a.stretch, 0); }
  if (["text", "line", "rectangle", "ellipse"].includes(a.kind)) sp.color = "purple";
  for (const s of el.children) {
    const sa = s.attrs;
    switch (s.name) {
      case "text": sp.text = s.text; break;
      case "image-data": sp.image = { format: sa.format || "", data: s.text.replace(/\s+/g, "") }; break;
      case "font": sp.font = { name: sa.name || "Arial", bold: b(sa.bold), italic: b(sa.italic), height: f(sa.height, -1) }; break;
      case "location": sp.pts.push(loc(s)); break;
      case "appearance":
        sp.columns = i(sa.columns, 1);
        if (sa.color) sp.color = COLOR(sa.color);
        if (sa["line-kind"]) sp.lineKind = sa["line-kind"];
        sp.lineWidth = f(sa["line-width"], 0); sp.gapSize = f(sa["gap-size"], 0); sp.dashSize = f(sa["dash-size"], 0);
        if (a.kind === "rectangle") sp.radius = f(sa["corner-radius"], 0);
        break;
      case "courses":
        sp.all = b(sa.all);
        if (!sp.all) sp.courses = kids(s, "course").map((x) => ({ course: i(x.attrs.course), part: i(x.attrs.part, -1) }));
        break;
      default: break;
    }
  }
  if (sp.kind === "descriptions" && !sp.columns) sp.columns = 1;
  return sp;
}

// ---- writing ------------------------------------------------------------------------------------------------------------
function writePrintArea(w, pa, part = -1) {
  if (!pa) return;
  const r = pa.rect || [0, 0, 0, 0];
  w.el("print-area", { part: part >= 0 ? String(part) : null, automatic: bool(pa.auto), "restrict-to-page-size": bool(pa.restrict),
    left: num(r[0]), top: num(r[3]), right: num(r[2]), bottom: num(r[1]),
    ...(pa.pageW > 0 && pa.pageH > 0 ? { "page-width": String(pa.pageW), "page-height": String(pa.pageH), "page-margins": String(pa.margins || 0),
      "page-landscape": bool(pa.landscape) } : {}) });
}
const KIND_OUT = { normal: "normal", start: "start", "map-issue": "map-issue", finish: "finish", crossing: "crossing-point", "map-exchange": "map-exchange" };
const FLAG_OUT = { begin: "beginning-part", end: "end-part", "issue-middle": "map-issue-middle", all: "all" };
/** The approximate first gap format (32 bits), kept by Purple Pen for old versions. */
function gapsToBits(gaps) {
  let bits = 0xffffffff >>> 0;
  for (const [s, e] of gaps || []) for (let k = 0; k < 32; k++) {
    const a = (k + 0.5) * 360 / 32;
    if ((a >= s && a <= e) || (a - 360 >= s && a - 360 <= e)) bits = (bits & ~(1 << k)) >>> 0;
  }
  return bits.toString(2).padStart(32, "0");
}
const ids = (o) => Object.keys(o).map(Number).sort((a, z) => a - z);

// ---- what a .ppen cannot hold: the advanced level (model.js; owner, 2026-10-24) ------------------------------------------------
/** The special objects Purple Pen knows. */
export const PP_SPECIALS = new Set(["first-aid", "water", "optional-crossing-point", "forbidden-route", "registration-mark", "boundary", "line",
  "out-of-bounds", "dangerous-area", "temporary-construction", "white-out", "text", "descriptions", "image", "rectangle", "ellipse"]);
/** What an export to .ppen leaves out: [{ key, n }] (key: a catalogue entry trc.pp.<key>, n: how many). */
export function ppenLosses(ev) {
  const out = [], add = (key, n) => { if (n > 0) out.push({ key, n }); };
  const ccs = Object.values(ev.courseControls), cs = Object.values(ev.controls), cos = Object.values(ev.courses), legs = Object.values(ev.legs);
  add("phi", ccs.filter((c) => c.phi && c.phiMid).length / 2);
  add("random", ccs.filter((c) => c.rnd).length);
  add("form", cos.filter((c) => c.form).length);
  add("discipline", cos.filter((c) => c.discipline && c.discipline !== "foot").length + (ev.discipline && ev.discipline !== "foot" ? 1 : 0));
  add("classes", Object.keys(ev.classes || {}).length);
  add("units", cs.filter((c) => c.units?.length).length);
  add("trail", cs.filter((c) => c.trail).length);
  add("dual", cs.filter((c) => c.dual && Object.keys(c.dual).length).length);
  add("symbols", Object.keys(ev.symbols || {}).length);
  add("routes", legs.filter((l) => l.route?.length || l.alts?.length).length);
  add("maps", Object.keys(ev.maps || {}).length);
  add("specials", Object.values(ev.specials).filter((s) => !PP_SPECIALS.has(s.kind)).length);
  add("teams", cos.filter((c) => c.relay?.table?.length || c.relay?.couple?.length).length);
  add("locks", cs.filter((c) => c.locked).length);
  add("mapfilter", cos.filter((c) => c.mapHide).length + (ev.mapHidden?.length || ev.mapHiddenSyms?.length ? 1 : 0));
  return out;
}
/** A copy of the event as Purple Pen can hold it: diamonds become forks, random-order sections ordinary controls, and what
 *  it has no place for left out. */
export function ppenFlatten(ev) {
  const x = JSON.parse(JSON.stringify(ev));
  for (const [id, cc] of Object.entries(x.courseControls)) {
    if (cc.phi && cc.phiMid && Number(id) === cc.splitCCs?.[0]) {
      let m = cc.phiMid, g = 0;
      while (m && x.courseControls[m] && g++ < 1000) { const n = x.courseControls[m].next; delete x.courseControls[m]; m = n; }
    }
  }
  for (const cc of Object.values(x.courseControls)) { delete cc.phi; delete cc.phiMid; delete cc.rnd; }
  for (const [id, s] of Object.entries(x.specials)) if (!PP_SPECIALS.has(s.kind)) delete x.specials[id];
  for (const s of Object.values(x.specials)) if (s.kind === "text") delete s.angle;
  return x;
}

/** The event as a .ppen text. mapPath: the absolute path to write (Purple Pen falls back to it). Only what Purple Pen knows is
 *  written (ppenFlatten; ppenLosses says what is left out). */
export function writePpen(ev, { mapPath = "" } = {}) {
  ev = ppenFlatten(ev);
  if (fileOffset(ev).some(Boolean)) ev = shiftToFile(ev);     // an OCAD or Mapper map: its own mm
  const w = new Writer(), ap = ev.appearance;
  w.el("course-scribe-event", {}, () => {
    w.el("event", { id: "1" }, () => {
      w.el("title", {}, ev.title || "");
      if (ev.notes) w.el("notes", {}, ev.notes);
      const kind = { none: "none", ocad: "OCAD", bitmap: "bitmap", pdf: "PDF" }[ev.map.kind] || "none";
      w.el("map", { kind, scale: num(ev.map.scale), dpi: kind === "bitmap" ? num(ev.map.dpi) : null,
        "ignore-missing-fonts": kind === "OCAD" ? bool(ev.map.ignoreMissingFonts) : null,
        "absolute-path": kind !== "none" ? (mapPath || ev.map.absolute || ev.map.file) : null }, kind !== "none" ? ev.map.file || "" : null);
      // Purple Pen knows the 2004 and 2018 descriptions (its 2018 holds ISCD 2024's symbols) and three map standards
      w.el("standards", { map: ["2000", "2017", "Spr2019"].includes(ap.mapStandard) ? ap.mapStandard : "2017", description: M.descBase(ev.descStandard) });
      w.el("all-controls", { "print-scale": num(ev.allControls.printScale), "description-kind": ev.allControls.descKind });
      writePrintArea(w, ev.printArea);
      w.el("numbering", { start: String(ev.numbering.start), "disallow-invertible": bool(ev.numbering.noInvertible) });
      w.el("punch-card", { rows: String(ev.punchCard.rows), columns: String(ev.punchCard.cols), "left-to-right": bool(ev.punchCard.ltr), "top-to-bottom": bool(ev.punchCard.ttb) });
      const ca = {};
      if (ap.controlCircleSize !== 1) ca["control-circle-size-ratio"] = num(ap.controlCircleSize);
      if (ap.lineWidth !== 1) ca["line-width-ratio"] = num(ap.lineWidth);
      if (ap.centerDot) ca["center-dot-diameter"] = num(ap.centerDot);
      if (ap.numberHeight !== 1) ca["number-size-ratio"] = num(ap.numberHeight);
      ca["scale-sizes"] = ap.itemScaling;
      ca["scale-sizes-circle-gaps"] = "true";
      if (ap.numberBold) ca["number-bold"] = "true";
      ca["number-font"] = ap.numberFont === "Arial" ? "Arial" : "Roboto";
      if (ap.numberOutline > 0) ca["number-outline-width"] = num(ap.numberOutline);
      ca["auto-leg-gap-size"] = num(ap.autoLegGap);
      if (ap.purple) Object.assign(ca, { "purple-cyan": num(ap.purple[0]), "purple-magenta": num(ap.purple[1]), "purple-yellow": num(ap.purple[2]), "purple-black": num(ap.purple[3]) });
      if (ap.blend === "none") ca["blend-purple"] = "false";
      else if (ap.blend === "layer") Object.assign(ca, { "blend-purple": "true", "blend-style": "layer", "lower-purple-layer": String(ap.lowerPurpleLayer || 0) });
      else Object.assign(ca, { "blend-purple": "true", "blend-style": "blend" });
      w.el("course-appearance", ca);
      w.el("descriptions", { lang: ev.lang, color: ap.descriptionsPurple ? "purple" : "black" });
      w.el("ocad", { "overprint-colors": bool(ap.ocadOverprint) });
      for (const [id, texts] of Object.entries(ev.customText || {})) {
        w.el("custom-symbol-text", { "iof-2004-ref": id, "show-key": bool(ev.customKey?.[id]) }, () => {
          for (const t of texts) w.el("text", { lang: t.lang, plural: t.plural ? "true" : null, gender: t.gender || null, case: t.case || null,
            "case-of-modified": t.case ? t.modCase || "" : null }, t.text);
        });
      }
      if (ev.livelox) w.el("livelox", { "importable-event-id": ev.livelox });
    });
    for (const id of ids(ev.controls)) {
      const c = ev.controls[id];
      w.el("control", { id: String(id), kind: KIND_OUT[c.kind], orientation: c.kind === "crossing" ? num(c.orientation || 0) : null,
        stretch: c.kind === "crossing" && c.stretch > 0 ? num(c.stretch) : null, "all-controls-code-angle": c.codeAngle != null ? num(c.codeAngle) : null,
        "map-issue-location": c.kind === "map-issue" ? c.issueKind || "beginning" : null }, () => {
        if (c.code != null) w.el("code", {}, c.code);
        w.el("location", { x: num(c.x), y: num(c.y) });
        c.symbols.forEach((s, k) => {
          const box = c.symbols.length === 1 ? "all" : "CDEFGH"[k];
          const ftext = c.colF != null && (box === "all" || box === "F") ? c.colF : null;
          if (s != null || ftext != null) w.el("description", { box, "iof-2004-ref": s }, ftext != null ? ftext : null);
        });
        if (c.punch && /1/.test(c.punch.dots)) {
          const n = c.punch.size, rows = [];
          for (let r = 0; r < n; r++) rows.push(c.punch.dots.slice(r * n, r * n + n));
          w.out.push(`${"  ".repeat(w.depth)}<punch-pattern size="${n}">\r\n${rows.join("\r\n")}\r\n</punch-pattern>`);
        }
        for (const [sc, g] of Object.entries(c.gaps || {})) {
          if (!g?.length) continue;
          w.el("gaps", { scale: String(sc) }, gapsToBits(g));
          w.el("circle-gaps", { scale: String(sc) }, g.map(([s, e]) => `${num(s)}:${num(e)}`).join(","));
        }
        if (c.descText != null) w.el("description-text", {}, c.descText);
        if (c.before) w.el("description-text-line", { location: "before" }, c.before);
        if (c.after) w.el("description-text-line", { location: "after" }, c.after);
      });
    }
    for (const id of ids(ev.courses)) {
      const c = ev.courses[id];
      w.el("course", { id: String(id), kind: c.kind, order: String(c.order) }, () => {
        w.el("name", { "hide-variations-on-map": c.hideVariations ? "true" : null }, c.name || "");
        if (c.secondary != null) w.el("secondary-title", {}, c.secondary);
        w.el("labels", { "label-kind": c.labels });
        if (c.first) w.el("first", { "course-control": String(c.first), "control-number": c.firstNumber !== 1 ? String(c.firstNumber) : null });
        writePrintArea(w, c.printArea);
        for (const [p, pa] of Object.entries(c.partAreas || {})) writePrintArea(w, pa, Number(p));
        const o = { "print-scale": num(c.printScale) };
        if (c.climb >= 0) o.climb = num(c.climb);
        if (c.load >= 0) o.load = String(c.load);
        if (c.length != null) o["course-length"] = num(c.length);
        o["hide-from-reports"] = bool(c.hideFromReports);
        if (c.kind === "score") { const sc = { 0: "A", 1: "B", 7: "H", "-1": "none" }[c.scoreColumn]; if (sc) o["score-column"] = sc; }
        o["description-kind"] = c.descKind;
        w.el("options", o);
        if (c.relay && (c.relay.teams > 0 || c.relay.legs > 1)) w.el("relay", { "first-team": String(c.relay.first), teams: String(c.relay.teams), legs: String(c.relay.legs) });
        for (const [br, legs] of Object.entries(c.relay?.branches || {})) for (const l of legs) w.el("relay-branch", { branch: br, leg: String(l + 1) });
        for (const [p, po] of Object.entries(c.partOptions || {})) w.el("part-options", { part: String(p), "show-finish": bool(po.showFinish) });
      });
    }
    for (const id of ids(ev.courseControls)) {
      const cc = ev.courseControls[id];
      w.el("course-control", { id: String(id), control: String(cc.control), variation: cc.split ? (cc.loop ? "loop" : "fork") : null,
        "variation-end": cc.split ? String(cc.splitEnd || 0) : null, "map-exchange": cc.exchange ? "true" : null, "map-flip": cc.exchange && cc.flip ? "true" : null,
        points: cc.points ? String(cc.points) : null }, (cc.next || cc.splitCCs || cc.number || cc.before || cc.after) ? () => {
        if (cc.next) w.el("next", { "course-control": String(cc.next) });
        for (const v of cc.splitCCs || []) w.el("variation", { "course-control": String(v) });
        if (cc.number) w.el("number-location", { x: num(cc.number[0]), y: num(cc.number[1]) });
        if (cc.before) w.el("description-text-line", { location: "before" }, cc.before);
        if (cc.after) w.el("description-text-line", { location: "after" }, cc.after);
      } : null);
    }
    for (const id of ids(ev.legs)) {
      const l = ev.legs[id];
      w.el("leg", { id: String(id), "start-control": String(l.c1), "end-control": String(l.c2) }, () => {
        if (l.flagging && l.flagging !== "none") w.el("flagging", { kind: FLAG_OUT[l.flagging], ...(l.flagging !== "all" && l.flag ? { x: num(l.flag[0]), y: num(l.flag[1]) } : {}) });
        if (l.bends?.length) w.el("bends", {}, () => { for (const p of l.bends) w.el("location", { x: num(p[0]), y: num(p[1]) }); });
        if (l.gaps?.length) w.el("gaps", {}, () => { for (const [s, len] of l.gaps) w.el("gap", { start: num(s), length: num(len) }); });
      });
    }
    for (const id of ids(ev.specials)) {
      const sp = ev.specials[id];
      w.el("special-object", { id: String(id), kind: sp.kind, orientation: sp.kind === "optional-crossing-point" ? num(sp.orientation || 0) : null,
        stretch: sp.kind === "optional-crossing-point" && sp.stretch > 0 ? num(sp.stretch) : null }, () => {
        if (sp.text != null) w.el("text", {}, sp.text);
        if (sp.image) w.el("image-data", { format: sp.image.format || "png" }, sp.image.data);
        if (sp.kind === "descriptions" && sp.columns > 1) w.el("appearance", { columns: String(sp.columns) });
        const col = Array.isArray(sp.color) ? sp.color.map((x) => Number(x).toFixed(2)).join(",") : sp.color || "purple";
        if (sp.kind === "text") {
          const fo = sp.font || { name: "Arial", bold: false, italic: false, height: -1 };
          w.el("font", { name: fo.name, bold: bool(fo.bold), italic: bool(fo.italic), height: fo.height > 0 ? num(fo.height) : null });
          w.el("appearance", { color: col });
        }
        if (["line", "rectangle", "ellipse"].includes(sp.kind)) {
          const lk = sp.lineKind || "single";
          w.el("appearance", { "line-kind": lk, color: col, "line-width": num(sp.lineWidth || 0), "gap-size": lk !== "single" ? num(sp.gapSize || 0) : null,
            "dash-size": lk === "dashed" ? num(sp.dashSize || 0) : null, "corner-radius": sp.kind === "rectangle" ? num(sp.radius || 0) : null });
        }
        for (const p of sp.pts) w.el("location", { x: num(p[0]), y: num(p[1]) });
        if (sp.all) w.el("courses", { all: "true" });
        else w.el("courses", {}, sp.courses.length ? () => { for (const x of sp.courses) w.el("course", { course: String(x.course), part: x.part >= 0 ? String(x.part) : null }); } : null);
      });
    }
  });
  return w.toString();
}
