// The Tracer's event model (Organisation › Tracer): a course-setting event shaped as Purple Pen's (.ppen) so that a
// .ppen file comes in and goes out without loss — the event, its controls (the « Tous les postes » collection), its
// courses, each a linked list of course controls (forks and loops as Purple Pen's splits), the legs that carry bends,
// gaps or flagging, and the special objects (descriptions, texts, out-of-bounds areas…). Coordinates are Purple Pen's:
// millimetres on the map sheet at the map's scale, origin at the sheet's bottom left, y up. The rules (numbering, parts
// between map exchanges, variations, lengths, loads, insertion of a control) follow Purple Pen's QueryEvent,
// CourseView and ChangeEvent (BSD licence, assets/tracer/LICENSE-PurplePen.txt).
//
// The event is plain data (JSON): `ev.controls`, `ev.courses`, `ev.courseControls`, `ev.legs`, `ev.specials` map ids to
// objects; `ev.next` holds the last id of each. The functions below read it (queries) or change it in place (changes);
// the editor snapshots it for undo.
//
// The advanced level (owner, 2026-10-24, after the Condes study; administrators for now) adds what a .ppen cannot hold, all
// optional, absent in an event that does not use it (ppen.js ppenLosses lists what an export leaves out):
// - diamond (phi) loops: a fork of two branches from an entry X to an exit Y, run one after the other with a branch back from Y
//   to X between them (Condes's « diamond »): X.phi, X.phiMid = the course control of Y's first passage, whose next starts the
//   way back (its last course control's next is 0: it returns to the other branch's head);
// - random-order sections: course controls marked rnd, taken in any order (no leg lines to, between or from them);
// - a course's form (course.form "string" | "trail", legLines), discipline (course.discipline, else ev.discipline: "foot",
//   "mtbo", "ski", "trail"), rogaine scoring (course.rogaine: points = code / 10) and « all controls » (course.allControls),
//   a finish drawn on the start (the finish control's atStart: the start control it follows);
// - classes as data (ev.classes: name, course, expected entries), control units and locks (control.units, control.locked),
//   trail-O flags and answers (control.trail), a second symbol in a box (control.dual), several routes per leg (leg.alts);
// - more maps (ev.maps, a course part's map: course.partMaps) and more special objects (MTB-O symbols, enlarged sections,
//   masks); see the modules that draw them.

import { syncExercises } from "./exercise.js";

/** The event model's version: 2 since 2026-10-24 (the advanced level's fields; nothing to convert from 1). */
export const VERSION = 2;

// ---- geometry, in map millimetres --------------------------------------------------------------------------------
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const samePt = (a, b) => Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
export function pathLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }
/** The point at a length along a polyline (clamped to its ends). */
export function pointAt(pts, len) {
  if (len <= 0) return pts[0].slice();
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (len <= d && d > 0) { const f = len / d; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
    len -= d;
  }
  return pts[pts.length - 1].slice();
}
/** The closest point of a polyline to p: { d, at, len (along the line), seg }. */
export function nearest(pts, p) {
  let best = { d: Infinity, at: pts[0], len: 0, seg: 0 }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    const q = [a[0] + dx * t, a[1] + dy * t], d = dist(p, q);
    if (d < best.d) best = { d, at: q, len: acc + Math.sqrt(L2) * t, seg: i - 1 };
    acc += Math.sqrt(L2);
  }
  return best;
}
/** Insert a point into a polyline at the segment closest to it (Purple Pen's Util.AddPointToArray). */
export function insertPoint(pts, p) {
  const { seg } = nearest(pts, p);
  return [...pts.slice(0, seg + 1), p, ...pts.slice(seg + 1)];
}
/** The angle of a vector in degrees (counter-clockwise from +x, y up). */
export const angleDeg = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;

// ---- standards and sizes (Purple Pen's NormalCourseAppearance) ----------------------------------------------------
export const LINE = 0.35;                                  // mm: legs, circles, triangle
export const SIZES = {
  "2000": { control: 6.0, finishOut: 7.0, finishIn: 5.0, start: 4.04 },
  "2017": { control: 5.35, finishOut: 6.35, finishIn: 4.35, start: 3.46 },
  "Spr2019": { control: 6.35, finishOut: 7.35, finishIn: 5.35, start: 4.04 },
  // ISSkiOM 2019 (revision 3) and ISMTBOM 2022 (revision 2), read in the specifications on 2026-11-16: the control circle 5.5 to
  // 6.0 mm (ski) and 6.0 mm (MTB-O) between line centres, the finish 5.0 and 7.0 mm, the start a triangle of 7.0 mm, drawn with
  // lines of 0.5 mm (ski) and 0.6 mm (MTB-O) — outer sizes here, as the others'
  "Ski2019": { control: 6.25, finishOut: 7.5, finishIn: 5.5, start: 4.04 },
  "Mtbo2022": { control: 6.6, finishOut: 7.6, finishIn: 5.6, start: 4.04 },
};
const STD_LINE = { Ski2019: 0.5, Mtbo2022: 0.6 };
/** The course's line width in a map standard, mm at 1:15 000: 0.35 (ISOM, ISSprOM), 0.5 (ISSkiOM), 0.6 (ISMTBOM). */
export const lineBase = (ev) => STD_LINE[ev?.appearance?.mapStandard] || LINE;
/** Ski and MTB-O maps: their course symbols are enlarged to 150 % at 1:10 000 and larger, no more (ISSkiOM 3.2, ISMTBOM 3.3). */
export const isWheelsOrSkis = (ev) => ev?.appearance?.mapStandard === "Ski2019" || ev?.appearance?.mapStandard === "Mtbo2022";
/** The control's centre (focus) dot, mm: the event's choice; ISSkiOM requires one of 0.65 mm. */
export const centerDotOf = (ev) => ev.appearance.centerDot || (ev.appearance.mapStandard === "Ski2019" ? 0.65 : 0);
/** The description standard whose symbols a standard uses: ISCD 2024 is ISCD 2018 with the railway and the map flip. */
export const descBase = (std) => (std === "2024" ? "2018" : std || "2018");
export const CROSSING_RADIUS = 2.5, ISSUE_LENGTH = 2.5, ISSUE_WIDTH = 0.6;
export const NUMBER_HEIGHT = 4.0, NUMBER_DISTANCE = 1.825, CODE_DISTANCE = 0.325, CODE_HEIGHT = 3.0;
export const PURPLE = [0.35, 0.85, 0, 0];                  // CMYK, ISOM 2017 appendix
export const sizes = (ev) => SIZES[ev.appearance.mapStandard] || SIZES["2017"];

/** Ratio of course objects' size to the map: Purple Pen's CourseView.CourseObjRatio. */
export function objRatio(ev, printScale) {
  const a = ev.appearance, ms = ev.map.scale || 10000;
  if (a.itemScaling === "RelativeToMap") return 1;
  if (a.itemScaling === "RelativeTo15000") return isWheelsOrSkis(ev) ? Math.min(1.5, 15000 / ms) : 15000 / ms;
  const r = (printScale || ms) / ms;
  return r > 0.99999 && r < 1.00001 ? 1 : r;
}
/** The scale circle gaps are stored at (CourseView.CircleGapScale). */
export function gapScale(ev, printScale) {
  const a = ev.appearance;
  if (a.itemScaling === "RelativeToMap") return ev.map.scale;
  if (a.itemScaling === "RelativeTo15000") return 15000;
  return printScale || ev.map.scale;
}
export const controlRadius = (ev) => (sizes(ev).control * ev.appearance.controlCircleSize) / 2;
export const finishRadius = (ev) => (sizes(ev).finishOut * ev.appearance.controlCircleSize) / 2;
export const startRadius = (ev) => sizes(ev).start * ev.appearance.controlCircleSize;

// ---- a new event ---------------------------------------------------------------------------------------------------
export const DEFAULT_APPEARANCE = {
  controlCircleSize: 1, lineWidth: 1, numberHeight: 1, centerDot: 0, numberBold: false, numberFont: "Roboto",
  numberOutline: 0, autoLegGap: 3.5, blend: "blend", lowerPurpleLayer: 0, purple: null /* [c,m,y,k] in 0..1, null = default */,
  descriptionsPurple: false, ocadOverprint: false, mapStandard: "2017", itemScaling: "RelativeTo15000",
};
export const DEFAULT_PRINT_AREA = () => ({ auto: true, restrict: true, rect: null, pageW: 827, pageH: 1169, margins: 0, landscape: false });

/** A new event. map: { kind: "bitmap"|"pdf"|"ocad"|"none", file, scale, dpi (bitmap), w, h (mm of the sheet), ox, oy (ocad) }. */
export function newEvent({ title = "", map = { kind: "none", scale: 10000 }, standard = "2017", descStandard = "2024", lang = "fr", firstCode = 31 } = {}) {
  return {
    v: VERSION, title, notes: "",
    map: { kind: map.kind || "none", file: map.file || "", scale: map.scale || 10000, dpi: map.dpi || 0, w: map.w || 0, h: map.h || 0,
      ...(map.kind === "ocad" ? { ox: map.ox || 0, oy: map.oy || 0 } : {}) },
    descStandard, lang, allControls: { printScale: map.scale || 10000, descKind: "symbols" }, printArea: DEFAULT_PRINT_AREA(),
    numbering: { start: firstCode, noInvertible: true }, punchCard: { rows: 3, cols: 8, ltr: true, ttb: false },
    appearance: { ...DEFAULT_APPEARANCE, mapStandard: standard }, customText: {}, customKey: {}, livelox: null,
    controls: {}, courses: {}, courseControls: {}, legs: {}, specials: {},
    next: { control: 0, course: 0, courseControl: 0, leg: 0, special: 0 },
  };
}
const STORE = { control: "controls", course: "courses", courseControl: "courseControls", leg: "legs", special: "specials", class: "classes", map: "maps" };
export function addObj(ev, kind, obj) {
  ev[STORE[kind]] = ev[STORE[kind]] || {};
  const id = (ev.next[kind] = (ev.next[kind] || 0) + 1);
  ev[STORE[kind]][id] = obj;
  return id;
}
export const clone = (ev) => JSON.parse(JSON.stringify(ev));

// ---- control codes (QueryEvent) -----------------------------------------------------------------------------------
const UPSIDE_DOWN = new Set([61, 66, 68, 81, 86, 89, 98, 99, 106, 108, 109, 116, 118, 119, 161, 166, 168, 169, 186, 188, 189, 191, 196, 198,
  199, 601, 606, 608, 611, 616, 618, 661, 666, 668, 669, 681, 686, 688, 691, 696, 698, 699, 801, 806, 809, 811, 816, 819, 861, 866, 868, 869,
  881, 886, 889, 891, 896, 898, 899, 901, 908, 909, 911, 918, 919, 961, 966, 968, 969, 981, 988, 989, 991, 996, 998, 999]);
/** "" if the code is fine, else why not ("length", "space": illegal; "zero", "upside": legal, not preferred). */
export function codeProblem(ev, code) {
  if (!code || code.length > 3) return "length";
  if (/\s/.test(code)) return "space";
  if (/^\d+$/.test(code)) {
    if (code[0] === "0") return "zero";
    if (ev.numbering.noInvertible && UPSIDE_DOWN.has(Number(code))) return "upside";
  }
  return "";
}
export const findCode = (ev, code) => { for (const [id, c] of Object.entries(ev.controls)) if (c.code === code) return Number(id); return 0; };
export function nextCode(ev) {
  let n = ev.numbering.start || 31, wrapped = false;
  for (;;) {
    const code = String(n);
    if (!findCode(ev, code) && !codeProblem(ev, code)) return code;
    if (++n === 1000) { if (wrapped) return "XX"; wrapped = true; n = 31; }
  }
}
/** Codes in Purple Pen's order: numbers numerically, then text. */
export function compareCodes(a, b) {
  a = a ?? ""; b = b ?? "";
  const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
const KIND_ORDER = { "map-issue": 1, start: 2, "map-exchange": 3, normal: 4, finish: 5, crossing: 6 };
export function compareControls(ev, id1, id2) {
  const a = ev.controls[id1], b = ev.controls[id2];
  return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || compareCodes(a.code, b.code) || id1 - id2;
}

// ---- courses -------------------------------------------------------------------------------------------------------
/** Course ids by their order (the course tabs). */
export function courseIds(ev, includeHidden = true) {
  return Object.keys(ev.courses).map(Number).filter((id) => includeHidden || !ev.courses[id].hideFromReports)
    .sort((a, b) => ev.courses[a].order - ev.courses[b].order);
}
export const isScore = (ev, courseId) => ev.courses[courseId]?.kind === "score";
export const cdAll = () => ({ course: 0, part: -1, path: null });           // « Tous les postes »
export const cdCourse = (course, part = -1, path = null, extra = {}) => ({ course, part, path, ...extra });

/**
 * The course controls of a course designator, in order, with the share of variations that visit each
 * (QueryEvent.EnumCourseControlIdsWithPercent). cd: { course, part (-1 all), path (variation choices or null) }.
 */
export function enumCC(ev, cd) {
  const course = ev.courses[cd.course];
  if (!course) return [];
  return enumToJoin(ev, cd, course.first || 0, 0, cd.path ? cd.path.slice() : null, false, { part: 0 }, 1);
}
function enumToJoin(ev, cd, start, join, choices, ignoreFirstSplit, state, frac) {
  const out = [];
  let id = start, first = true, guard = 0;
  while (id && id !== join && guard++ < 10000) {
    let cc = ev.courseControls[id];
    if (!cc) break;
    // a diamond (phi) loop: one branch to the exit, the way back, the other branch to the exit (the choice: the branch run first)
    if (cc.split && cc.phi && !(first && ignoreFirstSplit)) {
      const heads = cc.splitCCs, end = cc.splitEnd;
      let a = heads[0];
      if (choices && choices.length) a = choices.shift();
      const b = heads.find((h) => h !== a) || heads[0];
      out.push(...enumToJoin(ev, cd, a, end, choices, true, state, frac));
      for (const x of phiBack(ev, cc)) if (cd.part < 0 || state.part === cd.part) out.push({ cc: x, frac });
      out.push(...enumToJoin(ev, cd, b, end, choices, true, state, frac));
      id = end;
      if (!id || id === join) break;
      first = false;
      continue;
    }
    if (cc.split && !(first && ignoreFirstSplit)) {
      if (choices && choices.length) {
        id = choices.shift();
        cc = ev.courseControls[id];
      } else {
        const nf = cc.loop ? frac : frac / cc.splitCCs.length;
        for (const s of cc.splitCCs) if (s !== id) out.push(...enumToJoin(ev, cd, s, cc.splitEnd, choices, true, state, nf));
        if (!cc.loop) {
          out.push(...enumToJoin(ev, cd, id, cc.splitEnd, choices, true, state, nf));
          id = cc.splitEnd;
          if (!id || id === join) break;
          first = false;
          continue;
        }
      }
    }
    if (cd.part < 0 || state.part === cd.part) out.push({ cc: id, frac });
    if (cc.exchange) {
      state.part++;
      if (cd.part >= 0 && state.part === cd.part) out.push({ cc: id, frac });
    }
    id = cc.next || 0;
    first = false;
  }
  return out;
}
export const ccIds = (ev, cd) => enumCC(ev, cd).map((x) => x.cc);
/** A diamond loop's way back: the exit's first passage (phiMid), then the course controls that lead back to the entry. */
export function phiBack(ev, cc) {
  const out = [];
  let id = cc?.phiMid || 0, guard = 0;
  while (id && ev.courseControls[id] && guard++ < 1000) { out.push(id); id = ev.courseControls[id].next || 0; }
  return out;
}
/** The course controls that end a diamond loop's way back, each with the entry it returns to: Map(ccId -> entry head). */
export function phiReturns(ev, courseId) {
  const out = new Map();
  for (const id of ccIds(ev, cdCourse(courseId))) {
    const cc = ev.courseControls[id];
    if (!cc.phi || id !== cc.splitCCs[0]) continue;
    const back = phiBack(ev, cc);
    if (back.length) out.set(back[back.length - 1], id);
  }
  return out;
}
/** The course controls of a course's random-order sections: [[ccIds]] (runs of rnd course controls, in order). */
export function randomSections(ev, cd) {
  const out = [];
  let cur = null;
  for (const id of ccIds(ev, cd)) {
    if (ev.courseControls[id]?.rnd) { if (!cur) out.push(cur = []); cur.push(id); } else cur = null;
  }
  return out;
}
/** A course's discipline: its own, else the event's ("foot" by default; "mtbo", "ski", "trail"). */
export const disciplineOf = (ev, courseId) => (courseId && ev.courses[courseId]?.discipline) || ev.discipline || "foot";
export const ctrlOf = (ev, ccId) => ev.controls[ev.courseControls[ccId]?.control];
export const kindOfCC = (ev, ccId) => ctrlOf(ev, ccId)?.kind;

export function hasVariations(ev, courseId) {
  const c = ev.courses[courseId];
  if (!c || c.kind === "score") return false;
  return ccIds(ev, cdCourse(courseId)).some((id) => ev.courseControls[id].split);
}
/** The letter of each branch (QueryEvent.GetVariantCodeMapping): the loop's way out gets none. */
export function variantLetters(ev, courseId) {
  const map = new Map();
  let code = 65;
  for (const id of ccIds(ev, cdCourse(courseId))) {
    const cc = ev.courseControls[id];
    if (!cc.split) continue;
    cc.splitCCs.forEach((s, i) => {
      if (cc.loop && i === 0) return;
      if (!map.has(s)) { map.set(s, String.fromCharCode(code)); code = code === 90 ? 97 : code + 1; }
    });
  }
  return map;
}
/** Every variation of a course: [{ code: "ACE", path: [ccIds] }], sorted by code (QueryEvent.GetAllVariations). */
export function allVariations(ev, courseId) {
  const letters = variantLetters(ev, courseId), visited = new Set();
  const vars = variationsFrom(ev, ev.courses[courseId].first || 0, visited);
  if (vars.length === 1 && !vars[0].length) return [];
  // a diamond loop's choice says both branches, in the order run: « AB » or « BA »
  const code = (s) => { const cc = ev.courseControls[s]; if (!cc?.phi) return letters.get(s) || ""; const o = cc.splitCCs.find((h) => h !== s); return (letters.get(s) || "") + (letters.get(o) || ""); };
  return vars.map((path) => ({ code: path.map(code).join(""), path }))
    .sort((a, b) => a.code.localeCompare(b.code, "en", { sensitivity: "base" }));
}
function variationsFrom(ev, start, visited) {
  const out = [];
  let id = start, guard = 0;
  while (id && guard++ < 10000) {
    const cc = ev.courseControls[id];
    if (cc.split && cc.phi) {
      // either branch first, then the course on from the exit
      for (const s of cc.splitCCs) for (const tail of variationsFrom(ev, cc.splitEnd, visited)) out.push([s, ...tail]);
      break;
    }
    if (cc.split) {
      let allLoops = true;
      if (cc.loop) for (let i = 1; i < cc.splitCCs.length; i++) if (!visited.has(cc.splitCCs[i])) allLoops = false;
      for (let i = allLoops ? 0 : 1; i < cc.splitCCs.length; i++) {
        const s = cc.splitCCs[i], after = ev.courseControls[s].next;
        if (after && !visited.has(s)) {
          visited.add(s);
          for (const tail of variationsFrom(ev, after, visited)) out.push([s, ...tail]);
          visited.delete(s);
        }
      }
      break;
    }
    id = cc.next || 0;
  }
  if (!out.length) out.push([]);
  return out;
}
export function countParts(ev, cd) {
  if (!cd.course) return 1;
  const all = { ...cd, part: -1 };
  if (hasVariations(ev, cd.course) && !cd.path) return 1;
  let parts = 0;
  for (const id of ccIds(ev, all)) if (ev.courseControls[id].exchange) parts++;
  return parts + 1;
}
export function partOptions(ev, cd) {
  const c = ev.courses[cd.course];
  const o = { showFinish: false, ...(c?.partOptions?.[cd.part] || {}) };
  if (cd.part === countParts(ev, cd) - 1) o.showFinish = true;
  return o;
}
/** The first and last course controls of a part (inclusive). */
export function partBounds(ev, cd) {
  const ids = ccIds(ev, cd);
  return ids.length ? [ids[0], ids[ids.length - 1]] : [0, 0];
}
export function findKind(ev, courseId, kind) {
  for (const id of ccIds(ev, cdCourse(courseId))) if (kindOfCC(ev, id) === kind) return id;
  return 0;
}
export function lastCC(ev, courseId, notFinish) {
  let last = 0;
  for (const id of ccIds(ev, cdCourse(courseId))) if (!notFinish || kindOfCC(ev, id) !== "finish") last = id;
  return last;
}
export const hasFinish = (ev, courseId) => { const l = lastCC(ev, courseId, false); return !!l && kindOfCC(ev, l) === "finish"; };

// ---- legs ----------------------------------------------------------------------------------------------------------
export function findLeg(ev, c1, c2) {
  for (const [id, l] of Object.entries(ev.legs)) if (l.c1 === c1 && l.c2 === c2) return Number(id);
  return 0;
}
/** The leg's points: the two controls and its bends (QueryEvent.GetLegPath). */
export function legPoints(ev, c1, c2) {
  const a = ev.controls[c1], b = ev.controls[c2], leg = ev.legs[findLeg(ev, c1, c2)];
  return [[a.x, a.y], ...(leg?.bends || []), [b.x, b.y]];
}
export const legLengthM = (ev, c1, c2) => pathLength(legPoints(ev, c1, c2)) * ev.map.scale / 1000;
/** A leg's routes: the expected one (leg.route) and the others drawn (leg.alts: [{ pts, name }]), each as points from c1 to c2. */
export function legRoutes(ev, c1, c2) {
  const leg = ev.legs[findLeg(ev, c1, c2)], a = ev.controls[c1], b = ev.controls[c2];
  const out = [];
  if (leg?.route?.length) out.push({ name: "", pts: [[a.x, a.y], ...leg.route, [b.x, b.y]], main: true });
  for (const r of leg?.alts || []) if (r.pts?.length) out.push({ name: r.name || "", pts: [[a.x, a.y], ...r.pts, [b.x, b.y]] });
  return out;
}
/** A leg's length for a course: along the shortest route drawn when the course is measured so (course.lengthBy "route", the
 *  default for MTB-O, where riders follow the tracks), else as Purple Pen measures it (straight, through its bends). */
export function legLengthFor(ev, courseId, c1, c2) {
  const course = courseId ? ev.courses[courseId] : null;
  // along the leg's main route (lengthBy "main": a sprint's « ideal route », the route analyzer's fastest route kept on each leg)
  if (course?.lengthBy === "main") { const leg = ev.legs[findLeg(ev, c1, c2)]; if (leg?.route?.length) return pathLength(legRoutePoints(ev, c1, c2)) * ev.map.scale / 1000; return legLengthM(ev, c1, c2); }
  const byRoute = course && (course.lengthBy === "route" || (!course.lengthBy && disciplineOf(ev, courseId) === "mtbo"));
  if (byRoute) { const rs = legRoutes(ev, c1, c2); if (rs.length) return Math.min(...rs.map((r) => pathLength(r.pts))) * ev.map.scale / 1000; }
  return legLengthM(ev, c1, c2);
}
export const mmToM = (ev, mm) => mm * ev.map.scale / 1000;
/** The leg's flagging (QueryEvent.GetLegFlagging): "none", "all", "begin", "end", "issue-middle". */
export function legFlagging(ev, c1, c2) {
  const leg = ev.legs[findLeg(ev, c1, c2)];
  let f = leg?.flagging || "none";
  const a = ev.controls[c1], b = ev.controls[c2];
  if (b.kind === "finish" && b.symbols?.[0] === "14.1") f = "all";
  if (b.kind === "map-exchange") f = "all";
  if (a.kind === "map-issue") f = "all";
  return f;
}
/** The length of a leg's flagged part in metres (QueryEvent.ComputeFlaggedLegLength). */
export function flaggedLengthM(ev, c1, c2) {
  const leg = ev.legs[findLeg(ev, c1, c2)], pts = legPoints(ev, c1, c2);
  if (!leg?.bends) return mmToM(ev, pathLength(pts));
  let i0 = 0, i1 = pts.length - 1;
  const k = pts.findIndex((p) => leg.flag && samePt(p, leg.flag));
  if (leg.flagging === "begin" && k >= 0) i1 = k;
  if (leg.flagging === "end" && k >= 0) i0 = k;
  return mmToM(ev, pathLength(pts.slice(i0, i1 + 1)));
}
/** The legs of a course designator: [{ cc1, cc2, frac }] (QueryEvent.EnumLegs). */
export function enumLegs(ev, cd) {
  if (!cd.course || isScore(ev, cd.course)) return [];
  const out = [];
  const returns = phiReturns(ev, cd.course);
  enumCC(ev, cd).forEach(({ cc, frac }, i) => {
    const c = ev.courseControls[cc], next = c.next || returns.get(cc);
    if (i === 0 || cd.part < 0 || !c.exchange) if (next) out.push({ cc1: cc, cc2: next, frac });
  });
  return out;
}

// ---- the course view (CourseView): what a course shows and its statistics -------------------------------------------
/**
 * The view of a course designator: { kind: "normal"|"all"|"score"|"variations", name, controls: [{ ordinal (0 start,
 * -1 none), control, ccs, legTo (indices), legLen (m), join, hidden, exchangeStart }], specials, descriptions, extra,
 * printScale, scoreColumn, lengths and counts }. Purple Pen's rules: a normal course numbers its normal controls from its
 * first control number; a part keeps the numbers of the whole course; « Tous les postes » sorts by kind then code; a
 * score course by kind, points and code.
 */
export function view(ev, cd, { specials = true, descriptions = true } = {}) {
  let v;
  if (!cd.course) v = allControlsView(ev);
  else if (isScore(ev, cd.course)) v = scoreView(ev, cd);
  else if (hasVariations(ev, cd.course) && !cd.path) v = allVariationsView(ev, cd);
  else v = standardView(ev, cd);
  finishView(ev, cd, v);
  for (const [sid, sp] of Object.entries(ev.specials)) {
    const id = Number(sid);
    if (!containsSpecial(ev, cd, id)) continue;
    if (sp.kind === "descriptions") { if (descriptions) v.descriptions.push(id); }
    else if (specials) v.specials.push(id);
  }
  return v;
}
const blankView = (kind, name) => ({ kind, name, controls: [], specials: [], descriptions: [], extra: [], scoreColumn: -1 });
function allControlsView(ev) {
  const v = blankView("all", "");
  const ids = Object.keys(ev.controls).map(Number).sort((a, b) => compareControls(ev, a, b));
  for (const id of ids) v.controls.push({ ordinal: -1, control: id, ccs: [0], legTo: null, join: -1 });
  return v;
}
function standardView(ev, cd) {
  const course = ev.courses[cd.course];
  const v = blankView("normal", course.name);
  let ordinal = course.firstNumber || 1;
  const all = ccIds(ev, { ...cd, part: -1 });
  let first, last = 0;
  if (cd.part < 0) first = all[0] || 0;
  else [first, last] = partBounds(ev, cd);
  let i = 0;
  while (i < all.length && all[i] !== first) { if (kindOfCC(ev, all[i]) === "normal") ordinal++; i++; }
  for (; i < all.length; i++) {
    const id = all[i], cc = ev.courseControls[id], ctrl = ev.controls[cc.control];
    const cv = { ordinal: ctrl.kind === "normal" ? ordinal++ : ctrl.kind === "start" || ctrl.kind === "map-exchange" ? 0 : -1,
      control: cc.control, ccs: [id], legTo: null, join: -1 };
    if (id === last && cd.part >= 0 && ctrl.kind === "map-exchange") cv.hidden = true;
    if (cc.exchange && id !== last) cv.exchangeStart = true;
    if (i < all.length - 1 && id !== last) cv.legTo = [all[i + 1]];
    v.controls.push(cv);
    if (id === last) break;
  }
  if (cd.part >= 0 && cd.part !== countParts(ev, cd) - 1 && partOptions(ev, cd).showFinish && hasFinish(ev, cd.course))
    v.extra.push(lastCC(ev, cd.course, false));
  return v;
}
function allVariationsView(ev, cd) {
  const course = ev.courses[cd.course];
  const v = blankView("variations", course.name);
  const returns = phiReturns(ev, cd.course), mids = new Set();
  for (const id of ccIds(ev, cd)) { const cc = ev.courseControls[id]; if (cc.phi && cc.phiMid) mids.add(cc.phiMid); }
  for (const id of ccIds(ev, cd)) {
    const cc = ev.courseControls[id];
    if (cc.split && v.controls.some((x) => x.ccs.includes(id))) continue;
    const cv = { ordinal: -1, control: cc.control, ccs: cc.split ? cc.splitCCs.slice() : [id], legTo: null, join: -1 };
    if (mids.has(id)) cv.ghost = true;                   // a diamond's exit passed the first time: drawn once, at the exit
    if (cc.split) {
      if (cc.next) cv.legTo = cv.ccs.map((s) => ev.courseControls[s].next);
      cv.join = cc.loop ? id : cc.splitEnd;
    } else if (cc.next) cv.legTo = [cc.next];
    else if (returns.has(id)) cv.legTo = [returns.get(id)];  // the way back's last leg, to the entry
    if (cc.exchange) cv.exchangeStart = true;
    v.controls.push(cv);
  }
  return v;
}
function scoreView(ev, cd) {
  const course = ev.courses[cd.course];
  const v = blankView("score", course.name);
  v.scoreColumn = course.scoreColumn ?? 0;
  let id = course.first || 0, guard = 0;
  while (id && guard++ < 10000) {
    const cc = ev.courseControls[id];
    v.controls.push({ ordinal: -1, control: cc.control, ccs: [id], legTo: null, join: -1 });
    id = cc.next || 0;
  }
  v.controls.sort((a, b) => {
    const ka = KIND_ORDER[ev.controls[a.control].kind], kb = KIND_ORDER[ev.controls[b.control].kind];
    if (ka !== kb) return ka - kb;
    const pa = ev.courseControls[a.ccs[0]].points || 0, pb = ev.courseControls[b.ccs[0]].points || 0;
    if (pa !== pb) return pa - pb;
    return compareCodes(ev.controls[a.control].code, ev.controls[b.control].code) || a.control - b.control;
  });
  const showOrdinals = v.scoreColumn !== 0 && ["sequence", "sequence-and-code", "sequence-and-score"].includes(course.labels);
  if (showOrdinals) {
    let n = course.firstNumber || 1;
    for (const c of v.controls) if (ev.controls[c.control].kind === "normal") c.ordinal = n++;
  }
  if (v.controls.length >= 2 && ev.controls[v.controls[0].control].kind === "map-issue" && ev.controls[v.controls[1].control].kind === "start")
    v.controls[0].legTo = [v.controls[1].ccs[0]];
  return v;
}
function finishView(ev, cd, v) {
  v.mapScale = ev.map.scale;
  v.printScale = cd.course ? ev.courses[cd.course].printScale : ev.allControls.printScale;
  // legTo: course control ids -> indices; leg lengths
  for (const cv of v.controls) {
    if (!cv.legTo) continue;
    cv.legLen = [];
    cv.legTo = cv.legTo.map((ccId) => {
      // the first occurrence after this one (a control met twice: a butterfly's centre, a diamond's entry and exit)
      const i0 = v.controls.indexOf(cv);
      let j = v.controls.findIndex((x, k) => k > i0 && x.ccs.includes(ccId));
      if (j < 0) j = v.controls.findIndex((x) => x.ccs.includes(ccId));
      cv.legLen.push(j >= 0 ? legLengthFor(ev, cd.course, cv.control, v.controls[j].control) : 0);
      return j;
    });
    if (cv.join > 0) cv.join = v.controls.findIndex((x) => x.ccs.includes(cv.join));
  }
  // statistics
  const course = cd.course ? ev.courses[cd.course] : null;
  v.climb = course ? course.climb : -1;
  let points = 0, normal = 0, len = 0;
  for (const cv of v.controls) {
    if (ev.controls[cv.control].kind === "normal") normal++;
    if (cv.ccs[0] && ev.controls[cv.control].kind === "normal") points += ev.courseControls[cv.ccs[0]].points || 0;
    if (cv.legTo?.length) len += cv.legLen[0];
  }
  v.points = points; v.normalControls = normal; v.partLength = len;
  if (!cd.course || cd.part < 0 && !(hasVariations(ev, cd.course) && !cd.path)) v.minLength = v.maxLength = len;
  else if (hasVariations(ev, cd.course) && !cd.path) {
    const vars = allVariations(ev, cd.course).map((x) => view(ev, cdCourse(cd.course, -1, x.path), { specials: false, descriptions: false }));
    v.minLength = Math.min(...vars.map((x) => x.minLength)); v.maxLength = v.partLength = Math.max(...vars.map((x) => x.maxLength));
    v.minNormal = Math.min(...vars.map((x) => x.normalControls)); v.maxNormal = Math.max(...vars.map((x) => x.normalControls));
  } else {
    const whole = view(ev, { ...cd, part: -1 }, { specials: false, descriptions: false });
    v.minLength = whole.minLength; v.maxLength = whole.maxLength;
  }
  if (v.minNormal == null) v.minNormal = v.maxNormal = normal;
  v.totalMin = course?.length != null ? course.length * 1000 : v.minLength;
  v.totalMax = course?.length != null ? course.length * 1000 : v.maxLength;
}
/** The view's next control index from an index (the first branch of a split), or -1. */
export const nextIndex = (v, i) => (v.controls[i]?.legTo?.length ? v.controls[i].legTo[0] : -1);

// ---- specials -----------------------------------------------------------------------------------------------------
/** Does a course designator show a special (QueryEvent.CourseContainsSpecial)? */
export function containsSpecial(ev, cd, sid) {
  const sp = ev.specials[sid];
  if (!sp) return false;
  if (sp.all) return true;
  const course = cd.course || 0, part = cd.part ?? -1;
  if (part < 0 && sp.kind !== "descriptions") return sp.courses.some((x) => x.course === course);
  return sp.courses.some((x) => x.course === course && ((x.part ?? -1) === part || (x.part ?? -1) < 0));
}

// ---- uses and loads --------------------------------------------------------------------------------------------------
export const courseUses = (ev, cd, controlId) => ccIds(ev, cd).some((id) => ev.courseControls[id].control === controlId);
export const coursesUsing = (ev, controlId, includeHidden = true) => courseIds(ev, includeHidden).filter((c) => courseUses(ev, cdCourse(c), controlId));
export const coursesUsingLeg = (ev, c1, c2, includeHidden = true) => courseIds(ev, includeHidden).filter((c) =>
  enumLegs(ev, cdCourse(c)).some((l) => ev.courseControls[l.cc1].control === c1 && ev.courseControls[l.cc2].control === c2));
/** Competitors through a control (QueryEvent.GetControlLoad), or -1 when no course using it has a load. */
export function controlLoad(ev, controlId) {
  let any = false, total = 0;
  for (const c of coursesUsing(ev, controlId, false)) {
    const load = ev.courses[c].load;
    if (load == null || load < 0) continue;
    any = true;
    if (hasVariations(ev, c)) {
      let f = 0;
      for (const x of enumCC(ev, cdCourse(c))) {
        const cc = ev.courseControls[x.cc];
        if (cc.control !== controlId) continue;
        f = Math.max(f, cc.split && !cc.loop ? x.frac * cc.splitCCs.length : x.frac);
      }
      total += Math.ceil(f * load);
    } else total += load;
  }
  return any ? total : -1;
}
export function legLoad(ev, c1, c2) {
  let any = false, total = 0;
  for (const c of coursesUsingLeg(ev, c1, c2, false)) {
    const load = ev.courses[c].load;
    if (load == null || load < 0) continue;
    any = true;
    if (hasVariations(ev, c)) {
      let f = 0;
      for (const l of enumLegs(ev, cdCourse(c))) if (ev.courseControls[l.cc1].control === c1 && ev.courseControls[l.cc2].control === c2) f = Math.max(f, l.frac);
      total += Math.ceil(f * load);
    } else total += load;
  }
  return any ? total : -1;
}
export function unusedControls(ev, includeHidden = true) {
  return Object.keys(ev.controls).map(Number).filter((id) => !coursesUsing(ev, id, includeHidden).length);
}

// ---- insertion point of a new control (QueryEvent.FindControlInsertionPoint) -----------------------------------------
/** Where a control goes: after cc1 / before cc2 (either may be 0); returns { cc1, cc2, loc: "normal"|"presplit"|"postjoin" }. */
export function insertionPoint(ev, cd, cc1 = 0, cc2 = 0) {
  const courseId = cd.course;
  let loc = "normal";
  if (cc1 && cc2) {
    const a = ev.courseControls[cc1];
    if (a.next !== cc2) {
      if (isScore(ev, courseId)) return insertionPoint(ev, cd, cc1, 0);
      cc2 = a.next;
    }
  } else {
    if (!cc1 || kindOfCC(ev, cc1) === "finish") cc1 = lastCC(ev, courseId, true);
    if (!cc1) { cc2 = ev.courses[courseId].first || 0; loc = "normal"; }
    else {
      const before = ev.courseControls[cc1];
      cc2 = before.next || 0;
      loc = before.split && !before.loop ? "presplit" : "normal";
    }
  }
  if (cc1 && cc2 && kindOfCC(ev, cc1) === "map-issue" && kindOfCC(ev, cc2) === "start") return insertionPoint(ev, cd, cc2, 0);
  return { cc1, cc2, loc };
}

// ---- changes (ChangeEvent) ---------------------------------------------------------------------------------------------
/** A new control point (not in any course). kind: "normal", "start", "finish", "crossing", "map-issue", "map-exchange". */
export function addControl(ev, kind, pt, { code = null, orientation = 0, issueKind = "beginning" } = {}) {
  const c = { kind, code: kind === "normal" ? (code || nextCode(ev)) : null, x: pt[0], y: pt[1],
    symbols: ["normal", "start", "map-exchange"].includes(kind) ? [null, null, null, null, null, null] : [null], colF: null };
  if (kind === "finish") c.symbols[0] = "14.3";
  if (kind === "crossing") { c.orientation = orientation; c.stretch = 0; c.symbols[0] = "13.3"; }
  if (kind === "map-issue") c.issueKind = issueKind;
  return addObj(ev, "control", c);
}
const newCC = (control, next = 0) => ({ control, next });
/** Put a control into a course after cc1 / before cc2 at loc (from insertionPoint). Returns the new course control. */
export function addCourseControl(ev, controlId, courseId, cc1, cc2, loc = "normal") {
  if (!cc1) {
    const course = ev.courses[courseId];
    const id = addObj(ev, "courseControl", newCC(controlId, course.first || 0));
    course.first = id;
    return id;
  }
  if (loc === "presplit") {
    const before = ev.courseControls[cc1], ids = before.splitCCs.slice(), idx = ids.indexOf(cc1);
    const fresh = ids.map((s) => addObj(ev, "courseControl", newCC(controlId, ev.courseControls[s].next || 0)));
    for (const f of fresh) Object.assign(ev.courseControls[f], { split: true, loop: !!before.loop, splitCCs: fresh.slice(), splitEnd: before.splitEnd,
      ...(before.phi ? { phi: true, phiMid: before.phiMid } : {}) });
    const head = ev.courseControls[ids[0]];
    Object.assign(head, { split: false, loop: false, next: fresh[0] });
    delete head.splitCCs; delete head.splitEnd; delete head.phi; delete head.phiMid;
    for (let i = 1; i < ids.length; i++) { repoint(ev, courseId, ids[i], ids[0]); delete ev.courseControls[ids[i]]; }
    return fresh[idx];
  }
  const before = ev.courseControls[cc1];
  const id = addObj(ev, "courseControl", newCC(controlId, before.next || 0));
  before.next = id;
  if (loc === "postjoin") repoint(ev, courseId, cc2, id);
  return id;
}
/** Course controls of a course pointing (next / splitEnd) to idOld point to idNew instead. */
function repoint(ev, courseId, idOld, idNew) {
  for (const id of ccIds(ev, cdCourse(courseId))) {
    const cc = ev.courseControls[id];
    if (id === idNew) continue;
    if (cc.next === idOld) cc.next = idNew;
    if (cc.splitEnd === idOld) cc.splitEnd = idNew;
  }
}
/** A start or map issue point at the head of a course (replacing one already there); « others »: in every course lacking one. */
export function addStartOrIssue(ev, controlId, courseId, others = false) {
  const kind = ev.controls[controlId].kind;
  const existing = findKind(ev, courseId, kind);
  let id;
  if (existing) { ev.courseControls[existing].control = controlId; id = existing; }
  else if (kind === "start" && findKind(ev, courseId, "map-issue")) {
    const p = insertionPoint(ev, cdCourse(courseId), findKind(ev, courseId, "map-issue"), 0);
    id = addCourseControl(ev, controlId, courseId, p.cc1, p.cc2, p.loc);
  } else id = addCourseControl(ev, controlId, courseId, 0, ev.courses[courseId].first || 0);
  const f = ev.courseControls[ev.courses[courseId].first];
  const s = f?.next ? ev.courseControls[f.next] : null;
  if (f && s && ev.controls[f.control].kind === "map-issue" && ev.controls[s.control].kind === "start" && ev.controls[f.control].issueKind === "middle")
    setFlagging(ev, f.control, s.control, "issue-middle");
  if (others) for (const c of courseIds(ev)) if (c !== courseId && !findKind(ev, c, kind)) addStartOrIssue(ev, controlId, c, false);
  return id;
}
export function addFinish(ev, controlId, courseId, others = false) {
  const last = lastCC(ev, courseId, false);
  let id;
  if (!last) { id = addObj(ev, "courseControl", newCC(controlId)); ev.courses[courseId].first = id; }
  else if (kindOfCC(ev, last) === "finish") { ev.courseControls[last].control = controlId; id = last; }
  else { id = addObj(ev, "courseControl", newCC(controlId)); ev.courseControls[last].next = id; }
  if (others) for (const c of courseIds(ev)) if (c !== courseId && !hasFinish(ev, c)) addFinish(ev, controlId, c, false);
  return id;
}
/** Remove one course control from a course (and what a removed split orphans). Returns the controls it used. */
export function removeCourseControl(ev, courseId, rm) {
  const course = ev.courses[courseId];
  // a diamond loop's entry or exit, or its exit passed the first time: the diamond goes first (its branches stay as a fork's)
  for (const id of ccIds(ev, cdCourse(courseId))) {
    const cc = ev.courseControls[id];
    if (cc?.phi && id === cc.splitCCs[0] && (cc.splitCCs.includes(rm) || cc.splitEnd === rm || cc.phiMid === rm)) { deleteVariation(ev, cdCourse(courseId), id); break; }
  }
  if (!ev.courseControls[rm]) return [];
  const all = ccIds(ev, cdCourse(courseId));
  const ccRm = ev.courseControls[rm], kindRm = ev.controls[ccRm.control]?.kind;
  let after = ccRm.next || 0;
  if (ccRm.split && !ccRm.loop) after = ccRm.splitCCs[0] === rm ? ccRm.splitCCs[1] : ccRm.splitCCs[0];
  for (const id of all) {
    const cc = ev.courseControls[id];
    if (cc.next === rm) cc.next = after;
    if (cc.split && cc.splitEnd === rm) {
      cc.splitEnd = after;
      if (!after) { cc.split = false; delete cc.splitCCs; }
    }
    if (cc.split && cc.splitCCs?.includes(rm)) {
      cc.splitCCs = cc.splitCCs.filter((x) => x !== rm);
      if (cc.splitCCs.length < 2) { cc.split = false; cc.loop = false; delete cc.splitCCs; cc.splitEnd = 0; }
    }
  }
  if (course.first === rm) course.first = after;
  const kept = new Set(ccIds(ev, cdCourse(courseId))), removed = new Set();
  for (const id of all) if (!kept.has(id)) { removed.add(ev.courseControls[id].control); delete ev.courseControls[id]; }
  if (kindRm === "start" && course.first && kindOfCC(ev, course.first) === "map-issue")
    for (const c of removeCourseControl(ev, courseId, course.first)) removed.add(c);
  return [...removed];
}
/** Remove a control from the event: from every course, its legs, and itself. */
export function removeControl(ev, controlId) {
  for (const c of coursesUsing(ev, controlId)) {
    let id;
    while ((id = ccIds(ev, cdCourse(c)).find((x) => ev.courseControls[x].control === controlId))) removeCourseControl(ev, c, id);
  }
  for (const [id, l] of Object.entries(ev.legs)) if (l.c1 === controlId || l.c2 === controlId) delete ev.legs[id];
  delete ev.controls[controlId];
}
/** Move a control; gaps on its legs follow (ChangeEvent.ChangeControlLocation). */
export function moveControl(ev, controlId, pt) {
  const before = Object.entries(ev.legs).filter(([, l]) => (l.c1 === controlId || l.c2 === controlId) && l.gaps?.length)
    .map(([id, l]) => [Number(id), legPoints(ev, l.c1, l.c2)]);
  Object.assign(ev.controls[controlId], { x: pt[0], y: pt[1] });
  for (const [id, oldPath] of before) {
    const l = ev.legs[id];
    setLegGaps(ev, l.c1, l.c2, moveGaps(l.gaps, oldPath, legPoints(ev, l.c1, l.c2)));
  }
}
function vacuous(l) { return (!l.flagging || l.flagging === "none") && !l.bends?.length && !l.gaps?.length && !l.route?.length && !l.alts?.length; }
/** The other routes drawn on a leg (the advanced level): [{ pts (between the controls), name }], or null to clear. */
export function setLegAlts(ev, c1, c2, alts) {
  const [id, leg] = legFor(ev, c1, c2);
  if (alts?.length) leg.alts = alts.map((r) => ({ name: r.name || "", pts: r.pts.map((p) => p.slice()) })); else delete leg.alts;
  putLeg(ev, id, leg);
}
function legFor(ev, c1, c2) {
  const id = findLeg(ev, c1, c2);
  return id ? [id, ev.legs[id]] : [0, { c1, c2, flagging: "none" }];
}
function putLeg(ev, id, leg) {
  if (vacuous(leg)) { if (id) delete ev.legs[id]; return; }
  if (id) ev.legs[id] = leg; else addObj(ev, "leg", leg);
}
/** The route the setter expects on a leg (Ozimut's, not in .ppen): the points between the two controls, or null. */
export function setLegRoute(ev, c1, c2, pts) {
  const [id, leg] = legFor(ev, c1, c2);
  if (pts?.length) leg.route = pts.map((p) => p.slice()); else { delete leg.route; delete leg.rinfo; }
  if (pts?.length) delete leg.rinfo;                   // another route: the facts of the one before no longer hold
  putLeg(ev, id, leg);
}
// ---- a leg's routes, as the route analyzer keeps them (owner, 2026-11-16, after OCAD's Route Analyzer) -------------------------
// The main route is leg.route (what the lengths, the climb and the prints use), its facts in leg.rinfo; the others are leg.alts,
// each with its own facts. Facts: { name, calc (computed by the engine, not drawn by hand), hidden, m: { len (m), up, down (m),
// t (the model's time: seconds at 1 s per metre of white forest on the flat; × the pace), cross } }.
/** A leg's routes: [{ i (-1: the main one, else its place in leg.alts), main, name, pts (from c1 to c2), calc, hidden, m }]. */
export function legRouteList(ev, c1, c2) {
  const leg = ev.legs[findLeg(ev, c1, c2)], a = ev.controls[c1], b = ev.controls[c2], out = [];
  if (!leg || !a || !b) return out;
  const full = (pts) => [[a.x, a.y], ...pts, [b.x, b.y]];
  if (leg.route?.length) out.push({ i: -1, main: true, name: leg.rinfo?.name || "", pts: full(leg.route), calc: !!leg.rinfo?.calc, hidden: !!leg.rinfo?.hidden, m: leg.rinfo?.m || null });
  (leg.alts || []).forEach((r, i) => { if (r.pts?.length) out.push({ i, main: false, name: r.name || "", pts: full(r.pts), calc: !!r.calc, hidden: !!r.hidden, m: r.m || null }); });
  return out;
}
const cleanInfo = (o) => { const x = {}; if (o.name) x.name = String(o.name).slice(0, 60); if (o.calc) x.calc = 1; if (o.hidden) x.hidden = 1; if (o.m) x.m = o.m; return x; };
/** Add a route to a leg: pts between the two controls; main: it becomes the main route (the one before joins the others). */
export function addLegRoute(ev, c1, c2, { pts, name = "", calc = false, m = null, main = false, hidden = false }) {
  const [id, leg] = legFor(ev, c1, c2);
  const inner = pts.map((p) => p.slice());
  if (main || !leg.route?.length) {
    if (leg.route?.length) leg.alts = [...(leg.alts || []), { pts: leg.route, ...cleanInfo(leg.rinfo || {}) }];
    leg.route = inner;
    const info = cleanInfo({ name, calc, m, hidden });
    if (Object.keys(info).length) leg.rinfo = info; else delete leg.rinfo;
  } else leg.alts = [...(leg.alts || []), { pts: inner, ...cleanInfo({ name, calc, m, hidden }) }];
  putLeg(ev, id, leg);
}
/** Change a route's facts (name, hidden, m): i as legRouteList gives it. */
export function setRouteInfo(ev, c1, c2, i, patch) {
  const id = findLeg(ev, c1, c2), leg = ev.legs[id];
  if (!leg) return;
  if (i < 0) { if (!leg.route?.length) return; const info = cleanInfo({ ...(leg.rinfo || {}), ...patch }); if (Object.keys(info).length) leg.rinfo = info; else delete leg.rinfo; }
  else if (leg.alts?.[i]) leg.alts[i] = { pts: leg.alts[i].pts, ...cleanInfo({ ...leg.alts[i], ...patch }) };
}
/** Remove a route; the main one gone, the fastest of the others (the first when none has a time) takes its place. */
export function removeLegRoute(ev, c1, c2, i) {
  const id = findLeg(ev, c1, c2), leg = ev.legs[id];
  if (!leg) return;
  if (i >= 0) { leg.alts = (leg.alts || []).filter((_, k) => k !== i); if (!leg.alts.length) delete leg.alts; }
  else {
    delete leg.route; delete leg.rinfo;
    if (leg.alts?.length) {
      let best = 0;
      leg.alts.forEach((r, k) => { if (r.m?.t > 0 && !(leg.alts[best].m?.t > 0 && leg.alts[best].m.t <= r.m.t)) best = k; });
      const r = leg.alts[best];
      leg.route = r.pts; const info = cleanInfo(r); if (Object.keys(info).length) leg.rinfo = info;
      leg.alts = leg.alts.filter((_, k) => k !== best); if (!leg.alts.length) delete leg.alts;
    }
  }
  putLeg(ev, id, leg);
}
/** Make another route the leg's main one (the main one before joins the others, in its place). */
export function setMainRoute(ev, c1, c2, i) {
  const leg = ev.legs[findLeg(ev, c1, c2)];
  if (!leg?.alts?.[i]) return;
  const r = leg.alts[i], old = leg.route?.length ? { pts: leg.route, ...cleanInfo(leg.rinfo || {}) } : null;
  leg.route = r.pts; const info = cleanInfo(r); if (Object.keys(info).length) leg.rinfo = info; else delete leg.rinfo;
  if (old) leg.alts[i] = old; else { leg.alts = leg.alts.filter((_, k) => k !== i); if (!leg.alts.length) delete leg.alts; }
}
/** Remove the computed routes of a leg (those drawn by hand stay); all: every route. */
export function clearLegRoutes(ev, c1, c2, all = false) {
  const id = findLeg(ev, c1, c2), leg = ev.legs[id];
  if (!leg) return;
  const keep = legRouteList(ev, c1, c2).filter((r) => !all && !r.calc);
  delete leg.route; delete leg.rinfo; delete leg.alts;
  const inner = (r) => r.pts.slice(1, -1);
  keep.forEach((r, k) => {
    if (!k) { leg.route = inner(r); const info = cleanInfo(r); if (Object.keys(info).length) leg.rinfo = info; }
    else leg.alts = [...(leg.alts || []), { pts: inner(r), ...cleanInfo(r) }];
  });
  putLeg(ev, id, leg);
}
/** The leg as run: the drawn route when there is one, else the leg itself (with its bends). */
export function legRoutePoints(ev, c1, c2) {
  const leg = ev.legs[findLeg(ev, c1, c2)];
  if (!leg?.route?.length) return legPoints(ev, c1, c2);
  const a = ev.controls[c1], b = ev.controls[c2];
  return [[a.x, a.y], ...leg.route, [b.x, b.y]];
}
export function setLegGaps(ev, c1, c2, gaps) {
  const [id, leg] = legFor(ev, c1, c2);
  leg.gaps = gaps?.length ? gaps.map((g) => g.slice()) : null;
  putLeg(ev, id, leg);
}
/** Flagging of a leg (ChangeEvent.ChangeFlagging): partial flagging needs a bend where it starts or stops. */
export function setFlagging(ev, c1, c2, flagging) {
  const [id, leg] = legFor(ev, c1, c2);
  if (leg.flagging === "issue-middle" && flagging !== "issue-middle") return;
  leg.flagging = flagging;
  if (["begin", "end", "issue-middle"].includes(flagging)) {
    if (leg.bends?.length) leg.flag = (flagging === "begin" ? leg.bends[leg.bends.length - 1] : leg.bends[0]).slice();
    else {
      const a = ev.controls[c1], b = ev.controls[c2];
      leg.flag = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      leg.bends = [leg.flag.slice()];
    }
  } else delete leg.flag;
  putLeg(ev, id, leg);
  const b = ev.controls[c2];
  if (b.kind === "finish" && (flagging === "none" || flagging === "begin") && b.symbols[0] === "14.1") b.symbols[0] = "14.3";
}
export function addBend(ev, c1, c2, pt) {
  const [id, leg] = legFor(ev, c1, c2), old = legPoints(ev, c1, c2);
  const pts = insertPoint(old, pt);
  leg.bends = pts.slice(1, -1);
  putLeg(ev, id, leg);
  if (leg.gaps) setLegGaps(ev, c1, c2, moveGaps(leg.gaps, old, legPoints(ev, c1, c2)));
}
export function moveBend(ev, c1, c2, oldPt, newPt) {
  const id = findLeg(ev, c1, c2), leg = ev.legs[id], old = legPoints(ev, c1, c2);
  if (!leg) return;
  leg.bends = leg.bends.map((b) => (samePt(b, oldPt) ? newPt.slice() : b));
  if (leg.flag && samePt(leg.flag, oldPt)) leg.flag = newPt.slice();
  if (leg.gaps) leg.gaps = moveGaps(leg.gaps, old, legPoints(ev, c1, c2));
}
export function removeBend(ev, c1, c2, pt) {
  const id = findLeg(ev, c1, c2), leg = ev.legs[id];
  if (!leg?.bends) return;
  const old = legPoints(ev, c1, c2);
  let refl = null;
  if (["begin", "end", "issue-middle"].includes(leg.flagging) && leg.flag && samePt(leg.flag, pt)) {
    if (leg.bends.length === 1) refl = leg.flagging === "issue-middle" ? "issue-middle" : "all";
    else {
      const i = leg.bends.findIndex((b) => samePt(b, pt));
      leg.flag = ((i === 0 || leg.flagging === "end") && i !== leg.bends.length - 1 ? leg.bends[i + 1] : leg.bends[i - 1]).slice();
    }
  }
  leg.bends = leg.bends.filter((b) => !samePt(b, pt));
  if (!leg.bends.length) leg.bends = null;
  if (refl) { leg.flagging = "none"; delete leg.flag; }
  putLeg(ev, id, leg);
  if (refl) setFlagging(ev, c1, c2, refl);
  const gaps = ev.legs[findLeg(ev, c1, c2)]?.gaps;
  if (gaps) setLegGaps(ev, c1, c2, moveGaps(gaps, old, legPoints(ev, c1, c2)));
}

// ---- leg gaps (LegGap): [start, length] in mm from the start control's centre --------------------------------------------
export function simplifyGaps(gaps, len) {
  if (!gaps?.length) return null;
  let g = gaps.map(([s, l]) => {
    if (s + l > len) l = len - s;
    if (s < 0) { l += s; s = 0; }
    return [s, l];
  }).filter(([, l]) => l > 0).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < g.length - 1;) {
    if (g[i][0] + g[i][1] >= g[i + 1][0]) {
      if (g[i][0] + g[i][1] < g[i + 1][0] + g[i + 1][1]) g[i] = [g[i][0], g[i + 1][1] + (g[i + 1][0] - g[i][0])];
      g.splice(i + 1, 1);
    } else i++;
  }
  return g.length ? g : null;
}
export function addLegGap(ev, c1, c2, p1, p2) {
  const pts = legPoints(ev, c1, c2), a = nearest(pts, p1).len, b = nearest(pts, p2).len;
  const gaps = [...(ev.legs[findLeg(ev, c1, c2)]?.gaps || []), [Math.min(a, b), Math.abs(b - a)]];
  setLegGaps(ev, c1, c2, simplifyGaps(gaps, pathLength(pts)));
}
export function removeLegGap(ev, c1, c2, p) {
  const pts = legPoints(ev, c1, c2), at = nearest(pts, p).len;
  const gaps = (ev.legs[findLeg(ev, c1, c2)]?.gaps || []).filter(([s, l]) => !(s <= at && s + l >= at));
  setLegGaps(ev, c1, c2, simplifyGaps(gaps, pathLength(pts)));
}
export function moveGaps(gaps, oldPath, newPath) {
  gaps = simplifyGaps(gaps, pathLength(oldPath));
  if (!gaps) return null;
  const out = [];
  for (const [s, l] of gaps) {
    const a = nearest(newPath, pointAt(oldPath, s)), b = nearest(newPath, pointAt(oldPath, s + l));
    if (a.d + b.d <= 2 * l) out.push(a.len < b.len ? [a.len, b.len - a.len] : [b.len, a.len - b.len]);
  }
  return simplifyGaps(out, pathLength(newPath));
}

// ---- circle gaps: { scale: [[startDeg, stopDeg], ...] } on a control ---------------------------------------------------
export function circleGaps(ev, controlId, scale) {
  const g = ev.controls[controlId]?.gaps;
  return g?.[Math.round(scale)] || null;
}
export function setCircleGaps(ev, controlId, scale, gaps) {
  const c = ev.controls[controlId];
  const k = Math.round(scale);
  if (!gaps?.length) { if (c.gaps) { delete c.gaps[k]; if (!Object.keys(c.gaps).length) delete c.gaps; } return; }
  c.gaps = { ...(c.gaps || {}), [k]: gaps.map((x) => x.slice()) };
}
/** Two angles in gap order (CircleGap.OrderGapAngles): stop in 0..360, start before it, the gap at most 180°. */
export function orderGapAngles(a1, a2) {
  const rem = (a) => a - 360 * Math.round(a / 360);
  a1 = rem(a1); a2 = rem(a2);
  if (Math.abs(a2 - a1) > 180) { if (a1 < a2) a1 += 360; else a2 += 360; }
  if (a1 > a2) [a1, a2] = [a2, a1];
  if (a2 < 0) { a1 += 360; a2 += 360; }
  return [a1, a2];
}
/** Gaps sorted and merged (CircleGap.SimplifyGaps): stop in 0..360, start in -360..stop. */
export function simplifyCircleGaps(gaps) {
  if (!gaps?.length) return null;
  const g = [];
  for (const [s0, e0] of gaps) {
    if (e0 <= s0) continue;
    let e = e0 % 360; if (e < 0) e += 360;
    let s = s0 % 360; if (s < 0) s += 360;
    if (s > e) s -= 360;
    g.push([s, e]);
  }
  g.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < g.length - 1;) {
    if (g[i][1] >= g[i + 1][0]) { if (g[i][1] < g[i + 1][1]) g[i] = [g[i][0], g[i + 1][1]]; g.splice(i + 1, 1); } else i++;
  }
  while (g.length >= 2 && g[0][0] < g[g.length - 1][1] - 360) { g[0] = [g[g.length - 1][0] - 360, g[0][1]]; g.pop(); }
  return g.length ? g : null;
}
/** Add a gap between two points seen from the circle's centre (ChangeEvent.AddGap). */
export function addCircleGap(ev, controlId, scale, p1, p2) {
  const c = ev.controls[controlId], ctr = [c.x, c.y];
  if (samePt(ctr, p1) || samePt(ctr, p2)) return;
  const [a1, a2] = orderGapAngles(angleDeg(ctr, p1), angleDeg(ctr, p2));
  setCircleGaps(ev, controlId, scale, simplifyCircleGaps([...(circleGaps(ev, controlId, scale) || []), [a1, a2]]));
}
/** Remove the gap at the angle of a point (CircleGap.RemoveGap). */
export function removeCircleGap(ev, controlId, scale, p) {
  const c = ev.controls[controlId];
  let a = angleDeg([c.x, c.y], p) % 360; if (a < 0) a += 360;
  const g = (simplifyCircleGaps(circleGaps(ev, controlId, scale)) || []).filter(([s, e]) => !((s <= a && e >= a) || (s <= a - 360 && e >= a - 360)));
  setCircleGaps(ev, controlId, scale, g);
}

// ---- courses: create, delete, duplicate, variations --------------------------------------------------------------------
export function createCourse(ev, { kind = "normal", name = "", printScale = ev.map.scale, climb = -1, length = null, descKind = "symbols",
  labels = null, firstNumber = 1, secondary = null, hideFromReports = false, scoreColumn = null, addStartFinish = true } = {}) {
  const order = Math.max(0, ...Object.values(ev.courses).map((c) => c.order)) + 1;
  const id = addObj(ev, "course", { kind, name, order, labels: labels || (kind === "score" ? "code" : "sequence"), secondary, printScale, climb,
    length, load: -1, firstNumber, scoreColumn: kind === "score" ? (scoreColumn ?? 0) : -1, hideFromReports, descKind,
    printArea: JSON.parse(JSON.stringify(ev.printArea)), partAreas: {}, partOptions: {}, relay: { first: 1, teams: 0, legs: 1, branches: {} },
    hideVariations: false, first: 0 });
  if (addStartFinish) {
    const unique = (k) => { const ids = Object.keys(ev.controls).filter((c) => ev.controls[c].kind === k); return ids.length === 1 ? Number(ids[0]) : 0; };
    const s = unique("start"), m = unique("map-issue"), f = unique("finish");
    if (s) addStartOrIssue(ev, s, id);
    if (m) addStartOrIssue(ev, m, id);
    if (f) addFinish(ev, f, id);
  }
  return id;
}
export function deleteCourse(ev, courseId) {
  const ccs = ccIds(ev, cdCourse(courseId));
  delete ev.courses[courseId];
  for (const id of ccs) delete ev.courseControls[id];
  for (const k of Object.values(ev.classes || {})) if (k.course === courseId) k.course = 0;
  for (const [sid, sp] of Object.entries(ev.specials)) {
    if (sp.all || !sp.courses.some((x) => x.course === courseId)) continue;
    sp.courses = sp.courses.filter((x) => x.course !== courseId);
    if (!sp.courses.length) delete ev.specials[sid];
  }
}
export function duplicateCourse(ev, courseId, name) {
  const old = ev.courses[courseId], order = old.order + 1;
  for (const c of Object.values(ev.courses)) if (c.order >= order) c.order++;
  const map = new Map();
  const ids = ccIds(ev, cdCourse(courseId));
  for (const id of ids) map.set(id, addObj(ev, "courseControl", {}));
  const copy = JSON.parse(JSON.stringify(old));
  Object.assign(copy, { name, order, first: old.first ? map.get(old.first) : 0 });
  const newId = addObj(ev, "course", copy);
  for (const id of ids) {
    const cc = JSON.parse(JSON.stringify(ev.courseControls[id]));
    if (cc.next) cc.next = map.get(cc.next);
    if (cc.splitEnd) cc.splitEnd = map.get(cc.splitEnd);
    if (cc.splitCCs) cc.splitCCs = cc.splitCCs.map((x) => map.get(x));
    if (cc.phiMid) cc.phiMid = map.get(cc.phiMid);
    ev.courseControls[map.get(id)] = cc;
  }
  for (const sp of Object.values(ev.specials)) {
    if (sp.all) continue;
    const add = sp.courses.filter((x) => x.course === courseId).map((x) => ({ course: newId, part: x.part ?? -1 }));
    if (add.length) sp.courses = [...sp.courses, ...add];
  }
  return newId;
}
/** Can a variation start at this course control? "" if so, else why not (QueryEvent.CanAddVariation). kind "phi": a diamond
 *  loop also needs a normal control next (its exit), outside any other variation. */
export function variationProblem(ev, cd, ccId, kind = "") {
  if (!cd.course) return "all";
  if (isScore(ev, cd.course)) return "score";
  if (!ccId) return "none";
  if (kindOfCC(ev, ccId) === "finish" || lastCC(ev, cd.course, false) === ccId) return "finish";
  if (ev.courseControls[ccId].split) return "exists";
  if (inPhi(ev, cd.course, ccId)) return "phi";
  if (kind === "phi") {
    const nx = ev.courseControls[ccId].next;
    if (!nx || kindOfCC(ev, nx) !== "normal") return "exit";
    if (!ccIds(ev, cdCourse(cd.course)).every((id) => !ev.courseControls[id].split || ev.courseControls[id].splitEnd !== nx || id === ccId)) return "exit";
  }
  return "";
}
/** Is a course control inside a diamond loop (on a branch or the way back)? No other variation goes there. */
function inPhi(ev, courseId, ccId) {
  for (const id of ccIds(ev, cdCourse(courseId))) {
    const cc = ev.courseControls[id];
    if (!cc.phi || id !== cc.splitCCs[0]) continue;
    if (phiBack(ev, cc).includes(ccId)) return true;
    for (const h of cc.splitCCs) { let x = ev.courseControls[h].next, g = 0; while (x && x !== cc.splitEnd && g++ < 1000) { if (x === ccId) return true; x = ev.courseControls[x]?.next; } }
  }
  return false;
}
/** A diamond (phi) loop from a course control X to the next one (its exit Y): two branches X → Y, run one after the other with
 *  the way back Y → X between them (Condes's « diamond »). The branches and the way back are filled by adding controls to them. */
export function addPhi(ev, cd, ccId) {
  if (variationProblem(ev, cd, ccId, "phi")) return false;
  const base = ev.courseControls[ccId], exit = base.next;
  const mid = addObj(ev, "courseControl", { control: ev.courseControls[exit].control, next: 0 });
  Object.assign(base, { split: true, loop: false, phi: true, splitEnd: exit, phiMid: mid });
  const other = addObj(ev, "courseControl", JSON.parse(JSON.stringify(base)));
  for (const id of [ccId, other]) ev.courseControls[id].splitCCs = [ccId, other];
  return true;
}
/** A fork (n branches) or a loop (n loops) from a course control (ChangeEvent.AddVariation). */
export function addVariation(ev, cd, ccId, loop, n) {
  if (variationProblem(ev, cd, ccId)) return false;
  const base = ev.courseControls[ccId];
  Object.assign(base, { split: true, loop: !!loop, splitEnd: loop ? ccId : base.next });
  const extra = loop ? n : n - 1, ids = [ccId];
  for (let i = 0; i < extra; i++) {
    const c = JSON.parse(JSON.stringify(base));
    if (loop) c.next = ccId;
    ids.push(addObj(ev, "courseControl", c));
  }
  for (const id of ids) ev.courseControls[id].splitCCs = ids.slice();
  return true;
}
export function deleteVariation(ev, cd, ccId) {
  let cc = ev.courseControls[ccId];
  if (!cc?.split) return;
  if (cc.phi) {
    // a diamond loop: its way back goes, then its second branch as a fork's
    const head = ev.courseControls[cc.splitCCs[0]];
    for (const x of phiBack(ev, head)) delete ev.courseControls[x];
    for (const h of cc.splitCCs) if (ev.courseControls[h]) { delete ev.courseControls[h].phi; delete ev.courseControls[h].phiMid; }
    ccId = cc.splitCCs[0]; cc = ev.courseControls[ccId];
  }
  for (const s of cc.splitCCs.slice(1)) if (ev.courseControls[s]) removeCourseControl(ev, cd.course, s);
}

// ---- numbering ---------------------------------------------------------------------------------------------------------
/** Renumber every normal control from the event's first code (ChangeEvent.AutoRenumberControls). */
export function autoRenumber(ev) {
  const normal = Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === "normal");
  const fresh = [];
  let n = ev.numbering.start || 31;
  for (let i = 0; i < normal.length; i++) {
    fresh.push(String(n));
    do { n++; if (n >= 1000) n = 31; } while (codeProblem(ev, String(n)));
  }
  const freshSet = new Set(fresh);
  const keep = new Set(normal.filter((id) => freshSet.has(ev.controls[id].code)).map((id) => ev.controls[id].code));
  const toAssign = fresh.filter((c) => !keep.has(c)).sort(compareCodes);
  const toChange = normal.filter((id) => !keep.has(ev.controls[id].code)).sort((a, b) => compareCodes(ev.controls[a].code, ev.controls[b].code));
  toChange.forEach((id, i) => { ev.controls[id].code = toAssign[i]; });
}
export function removeUnused(ev) { const u = unusedControls(ev); for (const id of u) removeControl(ev, id); return u.length; }

/** An OCAD or Mapper map's own millimetres are the Tracer's moved by the map's origin (ev.map.ox, oy: mapsrc.openVector);
 *  .ppen and IOF XML files keep the map's own, as Purple Pen does. */
export const fileOffset = (ev) => (ev.map?.kind === "ocad" ? [Number(ev.map.ox) || 0, Number(ev.map.oy) || 0] : [0, 0]);
/** The event moved into (sign 1) or out of (sign -1) the map file's frame. */
export function shiftToFile(ev, sign = 1) {
  const [ox, oy] = fileOffset(ev);
  if (ox || oy) transformAll(ev, [1, 0, 0, 1, sign * ox, sign * oy]);
  return ev;
}

// ---- move every object (Event › Move All Controls): an affine [a, b, c, d, e, f], x' = a x + b y + e, y' = c x + d y + f ----
export function transformAll(ev, m) {
  const T = ([x, y]) => [m[0] * x + m[1] * y + m[4], m[2] * x + m[3] * y + m[5]];
  const rot = Math.atan2(m[2], m[0]) * 180 / Math.PI, scale = Math.hypot(m[0], m[2]);
  for (const c of Object.values(ev.controls)) {
    [c.x, c.y] = T([c.x, c.y]);
    if (c.kind === "crossing") c.orientation = (c.orientation || 0) + rot;
  }
  for (const l of Object.values(ev.legs)) {
    if (l.bends) l.bends = l.bends.map(T);
    if (l.route) l.route = l.route.map(T);
    if (l.alts) for (const r of l.alts) r.pts = r.pts.map(T);
    if (l.flag) l.flag = T(l.flag);
    if (l.gaps) l.gaps = l.gaps.map(([s, len]) => [s * scale, len * scale]);
  }
  for (const s of Object.values(ev.specials)) {
    s.pts = s.pts.map(T);
    if (s.holes) s.holes = s.holes.map((h) => h.map(T));
    if (s.src) { const [l, b, r, tt] = s.src, [cx, cy] = T([(l + r) / 2, (b + tt) / 2]), w = (r - l) * scale / 2, h = (tt - b) * scale / 2; s.src = [cx - w, cy - h, cx + w, cy + h]; }
    if (ORIENTED_SPECIALS.includes(s.kind)) s.orientation = (s.orientation || 0) + rot;
  }
  for (const cc of Object.values(ev.courseControls)) if (cc.number) cc.number = [cc.number[0] * scale, cc.number[1] * scale];
  const moveArea = (pa) => {
    if (!pa || pa.auto || !pa.rect) return;
    const [l, b, r, t] = pa.rect, [cx, cy] = T([(l + r) / 2, (b + t) / 2]), w = (r - l) * scale / 2, h = (t - b) * scale / 2;
    pa.rect = [cx - w, cy - h, cx + w, cy + h];
  };
  moveArea(ev.printArea);
  for (const c of Object.values(ev.courses)) { moveArea(c.printArea); for (const p of Object.values(c.partAreas || {})) moveArea(p); }
}

// ---- specials ----------------------------------------------------------------------------------------------------------
// the advanced level adds MTB-O's course symbols (obstacle across the track, forbidden to pass: points, turned to the track; one-way
// compulsory, forbidden route, dangerous section: lines), enlarged map sections (« inset »: a frame) and masks (an area)
export const MTBO_POINTS = ["mtbo-obstacle", "mtbo-forbidden-pass"];
export const MTBO_LINES = ["mtbo-oneway", "mtbo-forbidden-route", "mtbo-danger"];
export const POINT_SPECIALS = ["first-aid", "water", "optional-crossing-point", "forbidden-route", "registration-mark", ...MTBO_POINTS];
export const LINE_SPECIALS = ["boundary", "line", ...MTBO_LINES];
export const AREA_SPECIALS = ["out-of-bounds", "dangerous-area", "temporary-construction", "white-out", "mask"];
export const RECT_SPECIALS = ["text", "descriptions", "image", "rectangle", "ellipse", "inset", "qr"];
/** Point specials turned by an orientation (rotate). */
export const ORIENTED_SPECIALS = ["optional-crossing-point", ...MTBO_POINTS];
export function addSpecial(ev, kind, pts, extra = {}) {
  const sp = { kind, pts: pts.map((p) => p.slice()), all: true, courses: [], ...extra };
  if (["text", "line", "rectangle", "ellipse"].includes(kind) && !sp.color) sp.color = "purple";
  if (ORIENTED_SPECIALS.includes(kind) && sp.orientation == null) sp.orientation = 0;
  return addObj(ev, "special", sp);
}
/** Show a special on some course designators only ([] = « Tous les postes » only); all of them = every course. */
export function setDisplayedCourses(ev, sid, cds) {
  const sp = ev.specials[sid];
  const all = courseIds(ev).every((c) => cds.some((x) => x.course === c && (x.part ?? -1) < 0)) && cds.some((x) => !x.course);
  if (all && sp.kind !== "descriptions") { sp.all = true; sp.courses = []; }
  else { sp.all = false; sp.courses = cds.map((x) => ({ course: x.course, part: x.part ?? -1 })); }
}
export function addSpecialCorner(ev, sid, pt) {
  const sp = ev.specials[sid];
  const closed = AREA_SPECIALS.includes(sp.kind);
  const pts = closed ? [...sp.pts, sp.pts[0]] : sp.pts;
  const out = insertPoint(pts, pt);
  sp.pts = closed ? out.slice(0, -1) : out;
}
export function removeSpecialCorner(ev, sid, pt) {
  const sp = ev.specials[sid];
  const min = AREA_SPECIALS.includes(sp.kind) ? 3 : 2;
  if (sp.pts.length <= min) return;
  sp.pts = sp.pts.filter((p) => !samePt(p, pt));
}

// ---- texts: $(…) fields (CourseFormatter.ExpandText) -------------------------------------------------------------------
export function expandText(ev, cd, text, { fileName = "", variation = "", team = null, leg = null } = {}) {
  const v = cd.course ? view(ev, cd, { specials: false, descriptions: false }) : null;
  const course = cd.course ? ev.courses[cd.course] : null;
  // numbers as the event's own language writes them (its description sheets'), not the interface's: « 4,2 km » / "4.2 km"
  let nf;
  try { nf = (d) => new Intl.NumberFormat(ev.lang || "fr", { minimumFractionDigits: d, maximumFractionDigits: d }); nf(0); } catch (e) { nf = (d) => new Intl.NumberFormat("fr", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  const km = (m) => nf(1).format(m / 1000);
  const len = v ? (Math.abs(v.totalMax - v.totalMin) < 1 ? `${km(v.totalMin)} km` : `${km(v.totalMin)}–${km(v.totalMax)} km`) : "";
  return String(text)
    .replaceAll("$(EventTitle)", ev.title.replace(/\|/g, " "))
    .replaceAll("$(CourseName)", course?.name || "")
    .replaceAll("$(CoursePart)", cd.course && cd.part >= 0 ? String(cd.part + 1) : "")
    .replaceAll("$(Variation)", variation)
    .replaceAll("$(RelayTeam)", team != null ? String(team) : "--")
    .replaceAll("$(RelayLeg)", leg != null ? String(leg) : "-")
    .replaceAll("$(CourseLength)", len)
    .replaceAll("$(CourseClimb)", course && course.climb >= 0 ? String(Math.round(course.climb / 5) * 5) : "")
    .replaceAll("$(PrintScale)", `1:${nf(0).format(v?.printScale || ev.map.scale)}`)
    .replaceAll("$(ClassList)", (course?.secondary || "").replace(/\|/g, " "))
    .replaceAll("$(FileName)", fileName)
    .replaceAll("$(MapFileName)", ev.map.file || "");
}

// ---- print areas ---------------------------------------------------------------------------------------------------------
/** The online layer printed under a course's map (or in its place when the event has none): the course's own choice (printBg,
 *  "" for none), else the event's (ev.printBg: « osm » for an event set on OpenStreetMap). tracer/backdrop.js draws it. */
export const printBgOf = (ev, courseId) => { const c = courseId ? ev.courses[courseId] : null; return (c && c.printBg != null ? c.printBg : ev.printBg) || ""; };
export function printAreaOf(ev, cd) {
  if (!cd.course) return ev.printArea;
  const c = ev.courses[cd.course];
  return (cd.part >= 0 && c.partAreas?.[cd.part]) || c.printArea;
}
/**
 * What of an OCAD or Mapper map a course leaves out (the advanced level; owner, 2026-11-05: training maps — contours only, no
 * paths): { colors: [colour ids], symbols: [symbol ids] }, the course's own choice (course.mapHide) else the event's
 * (ev.mapHidden, ev.mapHiddenSyms), which « Tous les postes » shows. courseId 0: the event's.
 */
export function mapHideFor(ev, courseId) {
  const own = courseId ? ev.courses[courseId]?.mapHide : null;
  if (own) return { colors: own.colors || [], symbols: own.symbols || [] };
  return { colors: ev.mapHidden || [], symbols: ev.mapHiddenSyms || [] };
}
/** The view's bounds in mm (controls ± 10 mm), or the map's when empty. */
export function viewBounds(ev, v) {
  const xs = [], ys = [];
  for (const cv of v.controls) { const c = ev.controls[cv.control]; xs.push(c.x); ys.push(c.y); }
  if (!xs.length) return [0, 0, ev.map.w || 210, ev.map.h || 297];
  return [Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) + 10, Math.max(...ys) + 10];
}

// ---- what follows from other data (the advanced level): kept in step after every change (editor.js change) ----------------
/** Classes of a course, from ev.classes: [{ id, name, est }] in the order they were added. */
export const classesOf = (ev, courseId) => Object.entries(ev.classes || {}).filter(([, k]) => k.course === courseId)
  .map(([id, k]) => ({ id: Number(id), ...k })).sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id));
/** Rogaine points (Condes's convention): the code rounded down to the ten (47 → 40). */
export const rogainePoints = (code) => (/^\d+$/.test(code || "") ? Math.floor(Number(code) / 10) * 10 : 0);
export function syncDerived(ev) {
  for (const [sid, course] of Object.entries(ev.courses)) {
    const id = Number(sid);
    // a score course « with all controls »: every normal control of the event in it
    if (course.kind === "score" && course.allControls) {
      const have = new Set(ccIds(ev, cdCourse(id)).map((x) => ev.courseControls[x].control));
      for (const [cid, c] of Object.entries(ev.controls)) {
        if (c.kind !== "normal" || have.has(Number(cid))) continue;
        const p = insertionPoint(ev, cdCourse(id));
        addCourseControl(ev, Number(cid), id, p.cc1, p.cc2, p.loc);
      }
    }
    if (course.kind === "score" && course.rogaine) for (const x of ccIds(ev, cdCourse(id))) {
      const cc = ev.courseControls[x], c = ev.controls[cc.control];
      if (c?.kind === "normal") cc.points = rogainePoints(c.code);
    }
    // classes as data: the course's class list (its secondary title, which .ppen and IOF XML carry) and its expected entries
    if (ev.classes && Object.values(ev.classes).some((k) => k.course === id)) {
      const ks = classesOf(ev, id);
      course.secondary = ks.map((k) => k.name).join(", ");
      if (ks.some((k) => k.est >= 0)) course.load = ks.reduce((s, k) => s + Math.max(0, k.est || 0), 0);
    }
  }
  // a finish drawn on its start: it stays there
  for (const c of Object.values(ev.controls)) if (c.kind === "finish" && c.atStart && ev.controls[c.atStart]) { c.x = ev.controls[c.atStart].x; c.y = ev.controls[c.atStart].y; }
  // a training map's corridor and windows follow their course (exercise.js)
  syncExercises(ev);
  return ev;
}

// ---- checks of an event read from a file (EventDB.Validate, lenient: fixes what can be fixed) -----------------------------
export function sanitize(ev) {
  for (const [id, cc] of Object.entries(ev.courseControls)) if (!ev.controls[cc.control]) delete ev.courseControls[id];
  for (const [id, l] of Object.entries(ev.legs)) if (!ev.controls[l.c1] || !ev.controls[l.c2]) delete ev.legs[id];
  for (const c of Object.values(ev.courses)) if (c.first && !ev.courseControls[c.first]) c.first = 0;
  for (const k of Object.values(ev.classes || {})) if (k.course && !ev.courses[k.course]) k.course = 0;
  const orders = new Set();
  for (const id of courseIds(ev)) { const c = ev.courses[id]; while (!(c.order > 0) || orders.has(c.order)) c.order = (c.order > 0 ? c.order : 0) + 1; orders.add(c.order); }
  for (const k of Object.keys(STORE)) ev.next[k] = Math.max(ev.next[k] || 0, ...Object.keys(ev[STORE[k]] || {}).map(Number), 0);
  return ev;
}
