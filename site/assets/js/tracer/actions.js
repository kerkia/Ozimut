// The editor's actions (tracer/editor.js): what a click, a drag or a key does with each tool, as in Purple Pen —
// placing controls, the start, the finish, crossing points, map issue points and map exchanges; bends, gaps and flagging
// on legs; special objects; moving, deleting; handles; the right-click menu; the selected object's pane.

import * as M from "./model.js";
import { layoutCourse } from "./layout.js";
import { itemsFor } from "./draw.js";
import { widthInCells } from "./descr.js";
import * as D from "./dialogs.js";
import { menuItems } from "./context.js";
import { autoFill, dragDir, dirWord } from "./autodesc.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const m0 = (v) => `${Math.round(v)} m`;
const dec = (v, d) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const km = (v) => `${dec(v / 1000, 2)} km`;
const KIND_NAME = { normal: t("trc.act.kindNormal"), start: t("trc.act.kindStart"), finish: t("trc.act.kindFinish"), crossing: t("trc.act.kindCrossing"),
  "map-issue": t("trc.act.kindIssue"), "map-exchange": t("trc.act.kindExchange") };
export const SPECIAL_NAME = { "first-aid": t("trc.act.spFirstAid"), water: t("trc.act.spWater"), "optional-crossing-point": t("trc.act.spOptional"), "forbidden-route": t("trc.act.spForbidden"),
  "registration-mark": t("trc.act.spRegMark"), boundary: t("trc.act.spBoundary"), line: t("trc.act.spLine"), "out-of-bounds": t("trc.act.spOob"), "dangerous-area": t("trc.act.spDanger"),
  "temporary-construction": t("trc.act.spConstruction"), "white-out": t("trc.act.spWhiteOut"), text: t("trc.act.spText"), image: t("trc.act.spImage"), rectangle: t("trc.act.spRect"),
  ellipse: t("trc.act.spEllipse"), descriptions: t("trc.act.spDescr"), qr: t("trc.act.spQr"),
  // the advanced level
  "mtbo-oneway": t("trc.act.spMtboOneway"), "mtbo-forbidden-route": t("trc.act.spMtboForbiddenRoute"), "mtbo-danger": t("trc.act.spMtboDanger"),
  "mtbo-obstacle": t("trc.act.spMtboObstacle"), "mtbo-forbidden-pass": t("trc.act.spMtboForbiddenPass"), inset: t("trc.act.spInset"), mask: t("trc.act.spMask") };
const MOVE_WARN_M = 75;                                        // Purple Pen: moving a shared control further asks first

// ---- adding --------------------------------------------------------------------------------------------------------------
/** Where a new control goes in the current course: after the selected control, into the selected leg, or the closest leg. */
function insertionFor(E, p) {
  const ev = E.ev, cd = E.cdDraw || E.cd;
  if (E.sel?.kind === "control" && E.sel.cc && M.ccIds(ev, cd).includes(E.sel.cc)) return M.insertionPoint(ev, cd, E.sel.cc, 0);
  if (E.sel?.kind === "leg" && E.sel.cc1 && E.sel.cc2) return M.insertionPoint(ev, cd, E.sel.cc1, E.sel.cc2);
  // the closest leg (QueryEvent.FindClosestLeg)
  let best = null, bestD = Infinity;
  for (const l of M.enumLegs(ev, cd)) {
    const pts = M.legPoints(ev, ev.courseControls[l.cc1].control, ev.courseControls[l.cc2].control);
    const d = M.nearest(pts, p).d;
    if (d < bestD) { bestD = d; best = l; }
  }
  return M.insertionPoint(ev, cd, best?.cc1 || 0, best?.cc2 || 0);
}
const KIND_OF_TOOL = { control: "normal", start: "start", finish: "finish", crossing: "crossing", issue: "map-issue", exchange: "map-exchange" };
function placeControl(E, tool, p, sx, sy, extra = {}) {
  const kind = KIND_OF_TOOL[tool];
  const courseId = E.cd.course;
  const hit = E.hitAt(sx, sy, { includeOthers: true });
  const existing = hit && (hit.kind === "control") && E.ev.controls[hit.control]?.kind === kind ? hit.control : 0;
  // map exchange at a control of the course
  if (tool === "exchange" && hit?.kind === "control" && hit.cc && E.ev.controls[hit.control].kind === "normal") {
    return E.change((ev) => {
      const ids = M.ccIds(ev, M.cdCourse(courseId)).filter((id) => ev.courseControls[id].control === hit.control);
      for (const id of ids) ev.courseControls[id].exchange = !ev.courseControls[id].exchange;
    }, t("trc.act.exchangeAt"));
  }
  if (!courseId) {
    // « Tous les postes »: a new control in the collection only
    if (existing) { E.select({ kind: "control", control: existing, cc: 0 }); return true; }
    let id;
    E.change((ev) => { id = M.addControl(ev, kind, p); autoFill(E, ev, id, extra.dir ?? null); }, t("trc.act.newKind", { kind: KIND_NAME[kind].toLowerCase() }));
    E.select({ kind: "control", control: id, cc: 0 });
    return true;
  }
  if (kind === "map-issue" && !existing) {
    D.issueKind(E, (issueKind) => {
      let cc;
      E.change((ev) => { const id = M.addControl(ev, kind, p, { issueKind }); cc = M.addStartOrIssue(ev, id, courseId, false); }, KIND_NAME["map-issue"]);
      E.select({ kind: "control", control: E.ev.courseControls[cc]?.control, cc });
    });
    return true;
  }
  let ccNew = 0;
  const ok = E.change((ev) => {
    if (M.isScore(ev, courseId) && kind === "normal" && existing && M.courseUses(ev, M.cdCourse(courseId), existing)) return false;
    if (kind === "start" || kind === "map-issue") {
      const id = existing || M.addControl(ev, kind, p);
      ccNew = M.addStartOrIssue(ev, id, courseId, !existing);
      return true;
    }
    if (kind === "finish") {
      const id = existing || M.addControl(ev, kind, p);
      ccNew = M.addFinish(ev, id, courseId, !existing);
      return true;
    }
    const ins = insertionFor(E, p);
    let id = existing;
    // clicking a neighbour of the insertion point makes a new control there (Purple Pen)
    if (id && [ins.cc1, ins.cc2].some((c) => c && ev.courseControls[c]?.control === id)) id = 0;
    // a new control's description read from the map under it (autodesc.js), the drag's direction its column G
    if (!id) { id = M.addControl(ev, kind, p); autoFill(E, ev, id, extra.dir ?? null); }
    ccNew = M.addCourseControl(ev, id, courseId, ins.cc1, ins.cc2, ins.loc);
    if (kind === "map-exchange") { ev.courseControls[ccNew].exchange = true; }
    return true;
  }, existing ? t("trc.act.addControl", { code: E.ev.controls[existing]?.code || "" }) : t("trc.act.newKind", { kind: KIND_NAME[kind].toLowerCase() }));
  if (ok && ccNew) E.select({ kind: "control", control: E.ev.courseControls[ccNew]?.control, cc: ccNew });
  return ok;
}

// ---- the tools' clicks and drags --------------------------------------------------------------------------------------------
export function click(E, p, sx, sy, e) {
  const tool = E.tool;
  if (tool === "select") { const hit = E.hitAt(sx, sy); E.select(hit && !hit.other ? hit : null); return; }
  if (E.readOnly) return;
  if (KIND_OF_TOOL[tool]) { placeControl(E, tool, p, sx, sy); if (!e.shiftKey && tool !== "control") E.setTool("select"); return; }
  if (tool === "bend") {
    const hit = E.hitAt(sx, sy);
    const bend = handleAt(E, sx, sy);
    if (bend?.type === "bend") { E.change((ev) => M.removeBend(ev, bend.c1, bend.c2, bend.pt), t("trc.act.bendRemoved")); return; }
    if (hit?.kind === "leg") {
      E.change((ev) => M.addBend(ev, hit.c1, hit.c2, M.nearest(M.legPoints(ev, hit.c1, hit.c2), p).at), t("trc.act.bendAdded"));
      E.select(hit);
    }
    return;
  }
  if (tool === "route") {
    // the route expected on a leg (for the climb): the leg first, then its points, a double-click ends it
    if (!E.pending) {
      const hit = E.hitAt(sx, sy);
      if (hit?.kind !== "leg") { E.toast(t("trc.act.clickLegFirst")); return; }
      const a = E.ev.controls[hit.c1];
      E.pending = { kind: "route", c1: hit.c1, c2: hit.c2, pts: [[a.x, a.y]] };
      E.select(hit);
    } else E.pending.pts.push(p);
    E.ghost = { pts: E.pending.pts.slice() };
    E.help(tn("trc.act.routeHelp", E.pending.pts.length - 1));
    E.redraw();
    return;
  }
  if (tool === "gap") {
    const hit = E.hitAt(sx, sy);
    if (hit?.kind === "leg") E.change((ev) => M.removeLegGap(ev, hit.c1, hit.c2, p), t("trc.act.gapClosed"));
    else if (hit?.kind === "control") E.change((ev) => M.removeCircleGap(ev, hit.control, gapScale(E), p), t("trc.act.gapClosed"));
    return;
  }
  if (tool.startsWith("special:")) {
    const kind = tool.slice(8);
    if (M.POINT_SPECIALS.includes(kind)) {
      let id;
      E.change((ev) => { id = M.addSpecial(ev, kind, [p], kind === "optional-crossing-point" ? { orientation: 0 } : {}); }, SPECIAL_NAME[kind]);
      E.select({ kind: "special", id });
      if (!e.shiftKey) E.setTool("select");
      return;
    }
    if (M.LINE_SPECIALS.includes(kind) || M.AREA_SPECIALS.includes(kind)) {
      E.pending = E.pending || { kind, pts: [] };
      E.pending.pts.push(p);
      E.ghost = { pts: E.pending.pts.slice(), closed: M.AREA_SPECIALS.includes(kind) };
      E.help(tn("trc.act.shapeHelp", E.pending.pts.length, { name: SPECIAL_NAME[kind] }));
      E.redraw();
    }
  }
}
export function doubleClick(E, p) {
  if (E.pending && (E.tool.startsWith("special:") || E.pending.kind === "route")) { finishPending(E); return true; }
  if (E.tool === "select" && E.sel?.kind === "special") {
    const sp = E.ev.specials[E.sel.id];
    if (sp?.kind === "text" || sp?.kind === "descriptions") { D.specialProps(E, E.sel.id); return true; }
  }
  if (E.tool === "select" && E.sel?.kind === "control" && E.cd.course) { D.controlProps?.(E, E.sel.control); return !!D.controlProps; }
  void p;
  return false;
}
export function finishPending(E) {
  const pend = E.pending;
  if (!pend) return;
  // the double-click's second click added a point at the same place
  const pts = pend.pts.filter((q, i) => i === 0 || M.dist(q, pend.pts[i - 1]) > 0.05);
  if (pend.kind === "route") {
    E.pending = null; E.ghost = null;
    const inner = pts.slice(1);
    // a route drawn by hand: the leg's main route when it has none yet, else another route beside it (the route analyzer's
    // list: analyzer.js); with the analyzer's panel open it is measured on the model, and laid on the map's paths if wished
    if (inner.length) {
      E.change((ev) => M.addLegRoute(ev, pend.c1, pend.c2, { pts: inner }), t("trc.act.routeDrawn"));
      if (E.ra?.planner) import("./analyzer.js").then((R) => R.afterDraw(E, pend.c1, pend.c2));
    }
    E.setTool("select");
    return;
  }
  const min = M.AREA_SPECIALS.includes(pend.kind) || pend.kind === "mask-hole" ? 3 : 2;
  E.pending = null; E.ghost = null;
  if (pts.length < min) { E.toast(t("trc.act.minPoints", { n: min })); E.redraw(); return; }
  // a hole in a mask (the advanced level)
  if (pend.kind === "mask-hole") { E.change((ev) => { const m = ev.specials[pend.mask]; if (m) m.holes = [...(m.holes || []), pts]; }, t("trc.act.maskHole")); E.select({ kind: "special", id: pend.mask }); E.setTool("select"); return; }
  if (pend.kind === "line") {
    D.lineAppearance(E, null, (look) => { let id; E.change((ev) => { id = M.addSpecial(ev, "line", pts, look); }, SPECIAL_NAME.line); E.select({ kind: "special", id }); E.setTool("select"); });
    return;
  }
  let id;
  E.change((ev) => { id = M.addSpecial(ev, pend.kind, pts); }, SPECIAL_NAME[pend.kind]);
  E.select({ kind: "special", id });
  E.setTool("select");
}
/** A tool that works by dragging: returns the drag's state, or null to let the click happen. */
export function toolDown(E, p, sx, sy) {
  const t = E.tool;
  if (t === "gap") {
    const hit = E.hitAt(sx, sy);
    if (hit?.kind === "leg" || hit?.kind === "control") return { kind: "gap", hit, start: p };
    return null;
  }
  // a control placed by a drag (descriptions read from the map on): the drag says on which side of the feature the flag is
  if (t === "control" && E.opts.autoDesc && E.map?.kind === "vector" && !E.hitAt(sx, sy, { includeOthers: true })) return { kind: "newctl", start: p };
  if (t === "descr" || ["special:text", "special:image", "special:rectangle", "special:ellipse", "special:inset", "special:qr"].includes(t)) return { kind: "rect", tool: t, start: p };
  return null;
}
export function dragMove(E, d, p, sx, sy, e) {
  if (d.kind === "rect") { E.dragRect = [d.start, p]; E.redraw(); return; }
  if (d.kind === "gap") { E.ghost = { pts: [d.start, p] }; E.redraw(); return; }
  if (d.kind === "newctl") {
    const dir = dragDir(d.start, p);
    E.ghost = { pts: [d.start, p], ring: 3 * (E.layout?.ratio || 1), label: dir == null ? "" : dirWord(dir) };
    E.help(dir == null ? t("trc.ad.dragHelp") : t("trc.ad.dragDir", { dir: dirWord(dir) })); E.redraw(); return;
  }
  if (d.kind === "move" || d.kind === "handle") {
    d.last = p;
    E.ghost = moveGhost(E, d, p, e);
    E.redraw();
  }
}
export function dragEnd(E, d, p, sx, sy, e) {
  E.ghost = null; E.dragRect = null;
  if (d.kind === "rect") {
    if (!d.moved) { E.redraw(); return; }
    const [l, b, r, t] = [Math.min(d.start[0], p[0]), Math.min(d.start[1], p[1]), Math.max(d.start[0], p[0]), Math.max(d.start[1], p[1])];
    if (r - l < 1 || t - b < 1) { E.redraw(); return; }
    if (d.tool === "descr") { placeDescriptions(E, [l, t], r - l); return; }
    const kind = d.tool.slice(8);
    if (kind === "text") D.textProps(E, null, (look) => { let id; E.change((ev) => { id = M.addSpecial(ev, "text", [[l, t], [r, b]], look); }, SPECIAL_NAME.text); E.select({ kind: "special", id }); E.setTool("select"); });
    else if (kind === "inset") import("./layoutx.js").then((X) => X.newInset(E, [l, b, r, t]));
    // a QR code: a square in the frame drawn, leading to the address chosen (qr.js)
    else if (kind === "qr") import("./qr.js").then((Q) => Q.qrProps(E, null, (look) => { const side = Math.min(r - l, t - b); let id; E.change((ev) => { id = M.addSpecial(ev, "qr", [[l, t], [l + side, t - side]], look); }, SPECIAL_NAME.qr); E.select({ kind: "special", id }); E.setTool("select"); }));
    else if (kind === "image") D.imageFile(E, (image) => { let id; E.change((ev) => { id = M.addSpecial(ev, "image", [[l, t], [r, b]], image); }, SPECIAL_NAME.image); E.select({ kind: "special", id }); E.setTool("select"); });
    else D.lineAppearance(E, kind, (look) => { let id; E.change((ev) => { id = M.addSpecial(ev, kind, [[l, t], [r, b]], look); }, SPECIAL_NAME[kind]); E.select({ kind: "special", id }); E.setTool("select"); });
    return;
  }
  if (d.kind === "gap") {
    if (!d.moved) { click(E, p, sx, sy, e); return; }
    const h = d.hit;
    if (h.kind === "leg") E.change((ev) => M.addLegGap(ev, h.c1, h.c2, d.start, p), t("trc.act.gap"));
    else E.change((ev) => M.addCircleGap(ev, h.control, gapScale(E), d.start, p), t("trc.act.circleGap"));
    return;
  }
  if (d.kind === "newctl") { E.help(); placeControl(E, "control", d.start, d.sx, d.sy, { dir: d.moved ? dragDir(d.start, p) : null }); return; }
  if (d.kind === "move") { if (d.moved) applyMove(E, d.hit, d.start, p, e); else E.redraw(); return; }
  if (d.kind === "handle") { if (d.moved) applyHandle(E, d.handle, p); else if (E.tool === "bend" || e.altKey) click(E, p, sx, sy, e); else E.redraw(); }
}
const gapScale = (E) => M.gapScale(E.ev, (E.cd.course ? E.ev.courses[E.cd.course].printScale : E.ev.allControls.printScale));

function placeDescriptions(E, topLeft, width) {
  const cd = E.cd;
  const descKind = cd.course ? E.ev.courses[cd.course].descKind : E.ev.allControls.descKind;
  const cell = width / widthInCells(descKind);
  let id;
  E.change((ev) => {
    // one description block per course: an existing one for this course moves
    const old = Object.entries(ev.specials).find(([, s]) => s.kind === "descriptions" && !s.all && s.courses.some((x) => x.course === cd.course && (x.part ?? -1) === cd.part));
    if (old) { ev.specials[old[0]].pts = [topLeft, [topLeft[0] + cell, topLeft[1]]]; id = Number(old[0]); return; }
    id = M.addSpecial(ev, "descriptions", [topLeft, [topLeft[0] + cell, topLeft[1]]], { all: false, courses: [{ course: cd.course, part: cd.part }], columns: 1 });
  }, SPECIAL_NAME.descriptions);
  E.select({ kind: "special", id });
  E.setTool("select");
}

// ---- moving ----------------------------------------------------------------------------------------------------------------
// a locked control (the advanced level: control.locked) stays where it is; its number still moves
export const movable = (E, hit) => ["control", "number", "special"].includes(hit.kind) && !(hit.kind === "control" && E.ev.controls[hit.control]?.locked && (E.toast(t("trc.act.locked")), true));
function moveGhost(E, d, p, e) {
  const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
  if (d.kind === "handle") {
    const h = d.handle;
    if (h.type === "descr") return { pts: [[h.topLeft[0], h.topLeft[1]], [p[0], h.topLeft[1]], [p[0], p[1]], [h.topLeft[0], p[1]]], closed: true };
    return { pts: [h.pt, p] };
  }
  const hit = d.hit;
  if (hit.kind === "control") {
    const c = E.ev.controls[hit.control];
    const ev2 = M.clone(E.ev);
    M.moveControl(ev2, hit.control, snap(E, [c.x + dx, c.y + dy], e));
    return { items: itemsFor(ev2, layoutCourse(ev2, E.cdDraw || E.cd, { numbers: false, specials: false, descriptions: false })) };
  }
  if (hit.kind === "number") return { pts: [d.start, p] };
  if (hit.kind === "special") {
    const sp = E.ev.specials[hit.id];
    const pts = sp.pts.map(([x, y]) => [x + dx, y + dy]);
    if (sp.kind === "descriptions") {
      const o = E.layout.objs.find((x) => x.special === hit.id);
      if (o?.size) { const [x0, y0] = pts[0]; return { pts: [[x0, y0], [x0 + o.size[0], y0], [x0 + o.size[0], y0 - o.size[1]], [x0, y0 - o.size[1]]], closed: true }; }
    }
    if (["text", "image", "rectangle", "ellipse", "qr"].includes(sp.kind)) {
      const [a, b] = pts; return { pts: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]], closed: true };
    }
    return { pts, closed: M.AREA_SPECIALS.includes(sp.kind) };
  }
  return null;
}
/** Shift held: snap to the nearest other control (to merge positions exactly). */
function snap(E, p, e) {
  if (!e?.shiftKey) return p;
  let best = null, bd = 3;
  for (const c of Object.values(E.ev.controls)) { const d = M.dist([c.x, c.y], p); if (d < bd) { bd = d; best = [c.x, c.y]; } }
  return best || p;
}
function applyMove(E, hit, start, p, e) {
  const dx = p[0] - start[0], dy = p[1] - start[1];
  if (hit.kind === "control") {
    const c = E.ev.controls[hit.control], to = snap(E, [c.x + dx, c.y + dy], e);
    const others = E.cd.course ? M.coursesUsing(E.ev, hit.control).filter((x) => x !== E.cd.course) : [];
    const far = M.mmToM(E.ev, M.dist([c.x, c.y], to)) >= MOVE_WARN_M;
    if (c.kind === "normal" && others.length && far && hit.cc) {
      D.sharedMove(E, hit, others, to);
      return;
    }
    E.change((ev) => M.moveControl(ev, hit.control, to), t("trc.act.controlMoved", { name: c.code || KIND_NAME[c.kind] }));
    return;
  }
  if (hit.kind === "number") {
    const c = E.ev.controls[hit.control];
    const o = E.layout.objs.find((x) => (x.t === "number" || x.t === "code") && x.control === hit.control);
    if (!o) return;
    const ctr = [o.ctr[0] + dx, o.ctr[1] + dy];
    // dropped on its circle: back to automatic
    const auto = M.dist(ctr, [c.x, c.y]) < M.controlRadius(E.ev) * E.layout.ratio;
    if (hit.cc) E.change((ev) => { const cc = ev.courseControls[hit.cc]; if (auto) delete cc.number; else cc.number = [ctr[0] - c.x, ctr[1] - c.y]; }, t("trc.act.numberMoved"));
    else E.change((ev) => { if (auto) delete ev.controls[hit.control].codeAngle; else ev.controls[hit.control].codeAngle = M.angleDeg([c.x, c.y], ctr); }, t("trc.act.codeMoved"));
    return;
  }
  if (hit.kind === "special") E.change((ev) => { const sp = ev.specials[hit.id]; sp.pts = sp.pts.map(([x, y]) => [x + dx, y + dy]); }, t("trc.act.specialMoved", { name: SPECIAL_NAME[E.ev.specials[hit.id].kind] }));
}

// ---- handles ---------------------------------------------------------------------------------------------------------------
/** The selected object's handles: [{ type, pt, … }]. */
export function handles(E) {
  const s = E.sel, ev = E.ev, out = [];
  if (!s) return out;
  if (s.kind === "leg" && ev.controls[s.c1] && ev.controls[s.c2]) {
    const leg = ev.legs[M.findLeg(ev, s.c1, s.c2)];
    for (const b of leg?.bends || []) out.push({ type: "bend", pt: b, c1: s.c1, c2: s.c2 });
    const pts = M.legPoints(ev, s.c1, s.c2);
    for (const [st, len] of leg?.gaps || []) {
      out.push({ type: "legGap", pt: M.pointAt(pts, st), c1: s.c1, c2: s.c2, round: true });
      out.push({ type: "legGap", pt: M.pointAt(pts, st + len), c1: s.c1, c2: s.c2, round: true });
    }
  }
  if (s.kind === "control" && ev.controls[s.control]) {
    const c = ev.controls[s.control], r = M.controlRadius(ev) * (E.layout?.ratio || 1);
    for (const [a, b] of M.circleGaps(ev, s.control, gapScale(E)) || []) for (const ang of [a, b])
      out.push({ type: "circleGap", pt: [c.x + r * Math.cos(ang * Math.PI / 180), c.y + r * Math.sin(ang * Math.PI / 180)], control: s.control, round: true });
  }
  if (s.kind === "special" && ev.specials[s.id]) {
    const sp = ev.specials[s.id];
    if (sp.kind === "descriptions") {
      const o = E.layout?.objs.find((x) => x.special === s.id);
      if (o?.size) out.push({ type: "descr", pt: [sp.pts[0][0] + o.size[0], sp.pts[0][1] - o.size[1]], id: s.id, topLeft: sp.pts[0], cells: o.widthCells });
    } else if (["text", "image", "rectangle", "ellipse", "qr"].includes(sp.kind)) {
      sp.pts.forEach((pt, i) => out.push({ type: "corner", pt, id: s.id, i }));
    } else if (!M.POINT_SPECIALS.includes(sp.kind)) sp.pts.forEach((pt, i) => out.push({ type: "corner", pt, id: s.id, i }));
  }
  return out;
}
export function handleAt(E, sx, sy) {
  for (const h of handles(E)) { const [x, y] = E.toScreen(...h.pt); if (Math.hypot(x - sx, y - sy) <= 7) return h; }
  return null;
}
function applyHandle(E, h, p) {
  if (h.type === "bend") E.change((ev) => M.moveBend(ev, h.c1, h.c2, h.pt, p), t("trc.act.bendMoved"));
  else if (h.type === "legGap") E.change((ev) => {
    const pts = M.legPoints(ev, h.c1, h.c2), leg = ev.legs[M.findLeg(ev, h.c1, h.c2)];
    const at = M.nearest(pts, h.pt).len, to = M.nearest(pts, p).len;
    const gaps = leg.gaps.map(([s, l]) => (Math.abs(s - at) < 0.01 ? [to, l - (to - s)] : Math.abs(s + l - at) < 0.01 ? [s, to - s] : [s, l]));
    M.setLegGaps(ev, h.c1, h.c2, M.simplifyGaps(gaps, M.pathLength(pts)));
  }, t("trc.act.gapChanged"));
  else if (h.type === "circleGap") E.change((ev) => {
    const c = ev.controls[h.control], ang0 = M.angleDeg([c.x, c.y], h.pt), ang1 = M.angleDeg([c.x, c.y], p);
    const near = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180) < 0.5;
    const gaps = (M.circleGaps(ev, h.control, gapScale(E)) || []).map(([a, b]) => (near(a, ang0) ? M.orderGapAngles(ang1, b) : near(b, ang0) ? M.orderGapAngles(a, ang1) : [a, b]));
    M.setCircleGaps(ev, h.control, gapScale(E), M.simplifyCircleGaps(gaps));
  }, t("trc.act.circleGapChanged"));
  else if (h.type === "corner") E.change((ev) => { ev.specials[h.id].pts[h.i] = p.slice(); }, t("trc.act.cornerMoved"));
  else if (h.type === "descr") E.change((ev) => {
    const sp = ev.specials[h.id], w = Math.max(5, p[0] - h.topLeft[0]), cell = w / h.cells;
    sp.pts = [sp.pts[0], [sp.pts[0][0] + cell, sp.pts[0][1]]];
  }, t("trc.act.descrSize"));
}

// ---- hover: a preview of what a click would add ------------------------------------------------------------------------------
export function hover(E, p, sx, sy) {
  const t = E.tool;
  if (E.pending) { E.ghost = { pts: E.pending.pts.slice(), cursor: p, closed: M.AREA_SPECIALS.includes(E.pending.kind) }; E.redraw(); return; }
  if (KIND_OF_TOOL[t] || (t.startsWith("special:") && M.POINT_SPECIALS.includes(t.slice(8)))) {
    const hit = KIND_OF_TOOL[t] ? E.hitAt(sx, sy, { includeOthers: true }) : null;
    const kind = KIND_OF_TOOL[t];
    const at = hit?.kind === "control" && E.ev.controls[hit.control]?.kind === kind ? [E.ev.controls[hit.control].x, E.ev.controls[hit.control].y] : p;
    const ev2 = M.clone(E.ev);
    if (kind) M.addControl(ev2, kind === "map-exchange" ? "normal" : kind, at);
    else M.addSpecial(ev2, t.slice(8), [at]);
    const lay = layoutCourse(ev2, M.cdAll(), { numbers: false, descriptions: false, specials: !kind });
    const last = kind ? lay.objs.filter((o) => o.control === Math.max(...Object.keys(ev2.controls).map(Number))) : lay.objs.filter((o) => o.special === Math.max(...Object.keys(ev2.specials).map(Number)));
    E.ghost = { items: itemsFor(ev2, { objs: last }) };
    E.redraw();
    return;
  }
  if (E.ghost) { E.ghost = null; E.redraw(); }
}

// ---- deleting --------------------------------------------------------------------------------------------------------------
export function deleteSelection(E) {
  const s = E.sel;
  if (!s || E.readOnly) return;
  if (s.kind === "special") { E.change((ev) => { delete ev.specials[s.id]; }, t("trc.act.itemDeleted")); E.select(null); return; }
  if (s.kind === "leg") { E.toast(t("trc.act.legNoDelete")); return; }
  if (s.kind === "control" || s.kind === "number") {
    const c = E.ev.controls[s.control];
    if (E.cd.course && s.cc) {
      // from this course only; the control stays in « Tous les postes »
      E.change((ev) => { M.removeCourseControl(ev, E.cd.course, s.cc); }, t("trc.act.removedFromCourse", { kind: KIND_NAME[c.kind], code: c.code || "" }));
    } else {
      const used = M.coursesUsing(E.ev, s.control);
      if (used.length) { D.confirm(E, tn("trc.act.usedIn", used.length, { names: used.map((x) => E.ev.courses[x].name).join(", ") }), t("trc.act.delete"), () => { E.change((ev) => M.removeControl(ev, s.control), t("trc.act.controlDeleted")); E.select(null); }); return; }
      E.change((ev) => M.removeControl(ev, s.control), t("trc.act.controlDeleted"));
    }
    E.select(null);
  }
}

// ---- the right-click menu --------------------------------------------------------------------------------------------------
export function contextMenu(E, sx, sy, cx, cy) {
  const hit = E.hitAt(sx, sy) || (handleAt(E, sx, sy) ? E.sel : null);
  if (hit && !hit.other) E.select(hit);
  const p = E.toMap(sx, sy);
  // the commands of the selection's tab in the ribbon (context.js), worded for the spot clicked
  const items = menuItems(E, { p, sx, sy, handle: handleAt(E, sx, sy) });
  D.popupMenu(E, cx, cy, items, (act) => D.action(E, act, null, { p, sx, sy }));
}

// ---- the selected object's pane ---------------------------------------------------------------------------------------------
export function describeSelection(E) {
  const s = E.sel, ev = E.ev;
  if (!s) {
    if (!E.cd.course) return `<h3>${esc(t("trc.act.allControls"))}</h3><p>${esc(t("trc.act.allSummary", { controls: tn("trc.act.nControls", Object.values(ev.controls).filter((c) => c.kind === "normal").length), unused: tn("trc.act.nUnused", M.unusedControls(ev).length) }))}</p>`;
    const v = E.layout.view, c = E.course();
    return `<h3>${esc(c.name)}</h3><dl class="tr-dl"><dt>${esc(t("trc.act.length"))}</dt><dd>${v.totalMin === v.totalMax ? km(v.totalMin) : `${km(v.totalMin)} – ${km(v.totalMax)}`}</dd>
      <dt>${esc(t("trc.act.climb"))}</dt><dd>${c.climb >= 0 ? m0(c.climb) : "—"}</dd><dt>${esc(t("trc.act.controls"))}</dt><dd>${v.minNormal === v.maxNormal ? v.minNormal : `${v.minNormal} – ${v.maxNormal}`}</dd>
      <dt>${esc(t("trc.act.scale"))}</dt><dd>1:${new Intl.NumberFormat(locale()).format(c.printScale)}</dd>${c.load >= 0 ? `<dt>${esc(t("trc.act.competitors"))}</dt><dd>${c.load}</dd>` : ""}
      ${c.secondary ? `<dt>${esc(t("trc.act.classes"))}</dt><dd>${esc(c.secondary)}</dd>` : ""}</dl>
      <button type="button" class="btn btn-sm" data-act="course-props">${esc(t("trc.act.courseProps"))}</button>`;
  }
  if (s.kind === "control" || s.kind === "number") {
    const c = ev.controls[s.control];
    if (!c) return "";
    const used = M.coursesUsing(ev, s.control).map((x) => ev.courses[x].name);
    const load = M.controlLoad(ev, s.control);
    let legInfo = "";
    if (E.cd.course && s.cc) {
      const v = E.layout.view, i = v.controls.findIndex((x) => x.ccs.includes(s.cc));
      if (i >= 0 && v.controls[i].legLen?.length) legInfo = `<dt>${esc(t("trc.act.toNext"))}</dt><dd>${m0(v.controls[i].legLen[0])}</dd>`;
    }
    return `<h3>${esc(KIND_NAME[c.kind])}${c.code ? ` ${esc(c.code)}` : ""}</h3>
      <dl class="tr-dl">${c.kind === "normal" ? `<dt>${esc(t("trc.act.code"))}</dt><dd><input id="tr-code" value="${esc(c.code)}" size="4" maxlength="3" ${E.readOnly ? "disabled" : ""}></dd>` : ""}
      ${legInfo}<dt>${esc(t("trc.act.courses"))}</dt><dd>${used.length ? esc(used.join(", ")) : esc(t("trc.act.none"))}</dd>${load >= 0 ? `<dt>${esc(t("trc.act.load"))}</dt><dd>${esc(tn("trc.act.nCompetitors", load))}</dd>` : ""}
      <dt>${esc(t("trc.act.position"))}</dt><dd>${esc(t("trc.act.positionMm", { x: c.x.toFixed(1), y: c.y.toFixed(1) }))}</dd></dl>
      ${c.notes ? `<p class="tr-note">${esc(c.notes)}</p>` : ""}
      <div class="tr-btns">${c.kind === "normal" || c.kind === "start" ? `<button type="button" class="btn btn-sm" data-act="control-props">${esc(t("trc.act.description"))}</button>` : ""}
      <button type="button" class="btn btn-sm" data-act="delete">${esc(E.cd.course && s.cc ? t("trc.act.removeFromCourse") : t("trc.act.delete"))}</button></div>`;
  }
  if (s.kind === "leg") {
    const a = ev.controls[s.c1], b = ev.controls[s.c2];
    if (!a || !b) return "";
    const len = M.legLengthM(ev, s.c1, s.c2), straight = M.mmToM(ev, M.dist([a.x, a.y], [b.x, b.y]));
    const flag = M.legFlagging(ev, s.c1, s.c2), load = M.legLoad(ev, s.c1, s.c2);
    const used = M.coursesUsingLeg(ev, s.c1, s.c2).map((x) => ev.courses[x].name);
    return `<h3>${esc(t("trc.act.legTitle", { a: a.code || KIND_NAME[a.kind], b: b.code || KIND_NAME[b.kind] }))}</h3>
      <dl class="tr-dl"><dt>${esc(t("trc.act.length"))}</dt><dd>${m0(len)}${Math.abs(len - straight) > 1 ? ` ${esc(t("trc.act.straight", { m: m0(straight) }))}` : ""}</dd>
      <dt>${esc(t("trc.act.courses"))}</dt><dd>${esc(used.join(", ") || "—")}</dd>${load >= 0 ? `<dt>${esc(t("trc.act.load"))}</dt><dd>${esc(tn("trc.act.nCompetitors", load))}</dd>` : ""}
      <dt>${esc(t("trc.act.flagging"))}</dt><dd><select id="tr-flag" ${E.readOnly ? "disabled" : ""}>${[["none", t("trc.act.flagNone")], ["all", t("trc.act.flagAll")], ["begin", t("trc.act.flagBegin")], ["end", t("trc.act.flagEnd")]].map(([k, l]) =>
        `<option value="${k}" ${flag === k ? "selected" : ""}>${esc(l)}</option>`).join("")}${flag === "issue-middle" ? `<option selected value="issue-middle">${esc(t("trc.act.flagIssue"))}</option>` : ""}</select></dd></dl>
      ${(() => { const r = ev.legs[M.findLeg(ev, s.c1, s.c2)]?.route; return r?.length ? `<p class="tr-hint">${esc(t("trc.act.routeInfo", { m: m0(M.mmToM(ev, M.pathLength(M.legRoutePoints(ev, s.c1, s.c2)))) }))}</p>
        <div class="tr-btns"><button type="button" class="btn btn-sm" data-act="route-clear">${esc(t("trc.act.routeClear"))}</button></div>` : ""; })()}
      <p class="tr-hint">${esc(t("trc.act.legTools"))}</p>`;
  }
  if (s.kind === "special") {
    const sp = ev.specials[s.id];
    if (!sp) return "";
    const shown = sp.all ? t("trc.act.allCourses") : sp.courses.map((x) => (x.course ? ev.courses[x.course]?.name : t("trc.act.allControls")) + (x.part >= 0 ? ` ${t("trc.act.partN", { n: x.part + 1 })}` : "")).join(", ");
    const len = M.LINE_SPECIALS.includes(sp.kind) ? `<dt>${esc(t("trc.act.length"))}</dt><dd>${m0(M.mmToM(ev, M.pathLength(sp.pts)))}</dd>` : "";
    return `<h3>${esc(SPECIAL_NAME[sp.kind] || sp.kind)}</h3><dl class="tr-dl"><dt>${esc(t("trc.act.shownOn"))}</dt><dd>${esc(shown || t("trc.act.noCourse"))}</dd>${len}</dl>
      <div class="tr-btns"><button type="button" class="btn btn-sm" data-act="displayed-courses">${esc(t("trc.act.coursesBtn"))}</button>
      ${["text", "line", "rectangle", "ellipse", "descriptions", "qr"].includes(sp.kind) ? `<button type="button" class="btn btn-sm" data-act="special-props">${esc(t("trc.act.edit"))}</button>` : ""}
      <button type="button" class="btn btn-sm" data-act="delete">${esc(t("trc.act.delete"))}</button></div>`;
  }
  return "";
}
/** A control's new code, checked (the pane's field, the ribbon's): false when refused. */
export function changeCode(E, id, v) {
  const problem = M.codeProblem(E.ev, v), other = M.findCode(E.ev, v);
  if (problem === "length" || problem === "space") { E.toast(t("trc.act.codeLength")); return false; }
  if (other && other !== id) { E.toast(t("trc.act.codeTaken", { code: v })); return false; }
  if (v === E.ev.controls[id].code) return true;
  if (problem === "upside") E.toast(t("trc.act.codeUpside", { code: v }));
  return E.change((ev) => { ev.controls[id].code = v; }, t("trc.act.codeChanged"));
}
export function bindInfo(E, el) {
  const code = el.querySelector("#tr-code");
  code?.addEventListener("change", () => { if (!changeCode(E, E.sel.control, code.value.trim())) code.value = E.ev.controls[E.sel.control].code; });
  const flag = el.querySelector("#tr-flag");
  flag?.addEventListener("change", () => { const s = E.sel; E.change((ev) => M.setFlagging(ev, s.c1, s.c2, flag.value), t("trc.act.flagging")); });
}

/** A one-line summary of the event, for a version's card. */
export function summaryOf(ev) {
  const courses = M.courseIds(ev).map((id) => {
    const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false });
    return t("trc.act.sumCourse", { name: ev.courses[id].name, km: dec(v.totalMin / 1000, 1), n: v.minNormal });
  });
  return tn("trc.act.sumEvent", Object.values(ev.controls).filter((c) => c.kind === "normal").length, { courses: courses.join(", ") });
}
