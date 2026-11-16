// What applies to the selection: the ribbon's contextual tab (ribbon.js) and the right-click menu (actions.js contextMenu) are
// both drawn from ribbon-data.js CONTEXT, so that they always offer the same commands (owner, 2026-10-17). The menu words them
// for the spot clicked (« Ajouter un coude ici »), and knows the handle under the mouse (« Retirer ce coude »).

import * as M from "./model.js";
import { CONTEXT, isPro } from "./ribbon-data.js";
import { hasGeo } from "./geo.js";
import { t } from "./lang.js";

/** The kind of the selection's tab: "drawing" (a line, an area or a route under way), "control", "leg", "special", or null. */
export function ctxKind(E) {
  if (E.blank) return null;
  if (E.pending) return "drawing";
  const s = E.sel;
  if (!s) return null;
  if ((s.kind === "control" || s.kind === "number") && E.ev.controls[s.control]) return "control";
  if (s.kind === "leg" && E.ev.controls[s.c1] && E.ev.controls[s.c2]) return "leg";
  if (s.kind === "special" && E.ev.specials[s.id]) return "special";
  return null;
}

const FRAMES = ["text", "image", "rectangle", "ellipse", "descriptions", "qr"];
/** Whether a contextual command applies to the selection. at.menu: for the right-click menu, at.handle the handle under the mouse. */
export function applies(E, act, kind, at = {}) {
  const s = E.sel, ev = E.ev;
  const c = s?.control ? ev.controls[s.control] : null, cc = s?.cc ? ev.courseControls[s.cc] : null;
  const sp = s?.kind === "special" ? ev.specials[s.id] : null;
  const leg = s?.kind === "leg" ? ev.legs[M.findLeg(ev, s.c1, s.c2)] : null;
  const inCourse = !!(E.cd.course && s?.cc);
  const corners = sp && !M.POINT_SPECIALS.includes(sp.kind) && !FRAMES.includes(sp.kind);
  switch (act) {
    case "control-props": return !!c && (c.kind === "normal" || c.kind === "start");
    case "toggle-exchange": return inCourse && c?.kind === "normal";
    case "toggle-flip": return inCourse && c?.kind === "normal" && ev.descStandard !== "2004";
    case "var-fork": case "var-loop": case "var-phi": return kind !== "control" || inCourse;
    case "random-section": return inCourse && c?.kind === "normal" && !M.isScore(ev, E.cd.course);
    case "control-lock": return !!c;
    case "var-delete": return kind !== "control" || !!cc?.split;
    case "points": return inCourse && c?.kind === "normal" && M.isScore(ev, E.cd.course);
    case "text-before": case "text-after": return inCourse;
    case "gap-add-circle": return !!c && (c.kind === "normal" || c.kind === "finish");
    case "number-auto": return s?.kind === "number" || !!cc?.number;
    case "rotate": return kind === "control" ? c?.kind === "crossing" : M.ORIENTED_SPECIALS.includes(sp?.kind);
    case "stretch": return kind === "control" ? c?.kind === "crossing" : sp?.kind === "optional-crossing-point";
    case "special-props": return !!sp && ["text", "line", "rectangle", "ellipse", "descriptions", "inset", "qr"].includes(sp.kind);
    case "mask-hole": return sp?.kind === "mask";
    case "mask-holes-clear": return sp?.kind === "mask" && !!sp.holes?.length;
    case "corner-add": return !!corners;
    case "corner-remove": return !!corners && (!at.menu || at.handle?.type === "corner");
    case "bend-remove": return !!leg?.bends?.length && (!at.menu || at.handle?.type === "bend");
    case "gap-remove-leg": return !!leg?.gaps?.length;
    case "route-clear": return !!(leg?.route?.length || leg?.alts?.length);
    case "routes-alt-clear": return !!leg?.alts?.length;
    default: return true;
  }
}

const FLAG_MENU = [["flag-none", t("trc.ctx.flagNone")], ["flag-all", t("trc.ctx.flagAll")], ["flag-begin", t("trc.ctx.flagBegin")], ["flag-end", t("trc.ctx.flagEnd")]];
/** A command's words in the right-click menu (the ribbon's are shorter). */
function menuLabel(E, act, kind, label) {
  const cc = E.sel?.cc ? E.ev.courseControls[E.sel.cc] : null, sp = E.sel?.kind === "special" ? E.ev.specials[E.sel.id] : null;
  switch (act) {
    case "control-props": return t("trc.ctx.controlProps");
    case "toggle-exchange": return cc?.exchange ? t("trc.ctx.exchangeRemove") : t("trc.ctx.exchangeAdd");
    case "toggle-flip": return cc?.flip ? t("trc.ctx.flipRemove") : t("trc.ctx.flipAdd");
    case "var-fork": return t("trc.ctx.fork");
    case "var-loop": return t("trc.ctx.loop");
    case "var-phi": return t("trc.ctx.phi");
    case "random-section": return E.sel?.cc && E.ev.courseControls[E.sel.cc]?.rnd ? t("trc.ctx.randomOff") : t("trc.ctx.randomOn");
    case "control-lock": return E.ev.controls[E.sel?.control]?.locked ? t("trc.ctx.unlock") : t("trc.ctx.lock");
    case "text-before": return t("trc.ctx.textBefore");
    case "text-after": return t("trc.ctx.textAfter");
    case "gap-add-circle": return t("trc.ctx.gapCircle");
    case "number-auto": return t("trc.ctx.numberAuto");
    case "bend-add": return t("trc.ctx.bendAdd");
    case "bend-remove": return t("trc.ctx.bendRemove");
    case "gap-add-leg": return t("trc.ctx.gapLeg");
    case "gap-remove-leg": return t("trc.ctx.gapRemove");
    case "route-draw": return t("trc.ctx.routeDraw");
    case "corner-add": return t("trc.ctx.cornerAdd");
    case "corner-remove": return t("trc.ctx.cornerRemove");
    case "displayed-courses": return t("trc.ctx.displayedCourses");
    case "special-props": return sp?.kind === "text" ? t("trc.ctx.text") : sp?.kind === "descriptions" ? t("trc.ctx.columns") : t("trc.ctx.appearance");
    case "delete": return kind === "control" ? (E.cd.course && E.sel?.cc ? t("trc.ctx.removeFromCourse") : t("trc.ctx.deleteControl")) : t("trc.ctx.delete");
    default: return label;
  }
}
/** The right-click menu for the selection: its tab's commands, group by group, then « Tout le circuit » when nothing is chosen. */
export function menuItems(E, at = {}) {
  const kind = ctxKind(E);
  // « Voir ici sur… » (backdrop.js): the spot clicked in other map services, when the map is georeferenced
  const look = hasGeo(E.ev) && at.p ? ["-", ["look-here", t("trc.ctx.lookHere")]] : [];
  if (!kind) return [["view-course", t("trc.ctx.wholeCourse")], ["view-map", t("trc.ctx.wholeMap")], ...look];
  const out = [];
  for (const g of CONTEXT[kind].groups) {
    if (isPro(g) && !E.pro) continue;
    const here = [];
    const walk = (items) => items.forEach((it) => {
      if (isPro(it) && !E.pro) return;                           // the advanced level (E.pro: every account's since 2026-11-08)
      if (it.t === "stack") walk(it.items);
      else if (it.t === "modes" && it.id === "flag") here.push("-", ...FLAG_MENU);
      else if (it.act && applies(E, it.act, kind, { ...at, menu: true })) here.push([it.act, menuLabel(E, it.act, kind, it.label)]);
    });
    walk(g.items);
    if (here.length) { if (out.length && here[0] !== "-") out.push("-"); out.push(...here); }
  }
  if (kind !== "drawing") out.push(...look);
  return out;
}
