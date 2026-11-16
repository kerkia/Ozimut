// A course's drawing, as Purple Pen's CourseFormatter lays it out (BSD licence, assets/tracer/LICENSE-PurplePen.txt):
// from a course view, the objects to draw in map millimetres (y up) — control circles, the start triangle, the finish,
// crossing points, map issue points and exchanges, legs cut at the circles with their bends, gaps and flagging, the
// control numbers placed where they stay clearest of everything else, the special objects and the description
// sheets — with the circles cut where they overlap and the later leg cut where two legs cross. Each object keeps what it
// belongs to (control, course control, leg, special) for selection in the editor.

import * as M from "./model.js";
import { textWidth, CAP_HEIGHT, family } from "./fonts.js";

const DEG = Math.PI / 180;
const rot = (p, deg) => { const a = deg * DEG, c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
/** Purple Pen's symbol orientation (Geometry.RadiansToDegrees): degrees from straight up, counter-clockwise. */
const orient = (rad) => { let r = rad - Math.PI / 2; if (r < 0) r += 2 * Math.PI; return r / DEG; };

/**
 * The course designator's drawing: { objs, ratio, view }. opts: { numbers (true), descriptions (true), specials (true),
 * layer ("course"), variationName }.
 */
export function layoutCourse(ev, cd, opts = {}) {
  const v = M.view(ev, cd, { specials: opts.specials !== false, descriptions: opts.descriptions !== false });
  const ap = ev.appearance, std = ap.mapStandard;
  const ratio = M.objRatio(ev, v.printScale);
  const gapScale = M.gapScale(ev, v.printScale);
  const lw = M.lineBase(ev) * ap.lineWidth * ratio;
  const Z = M.sizes(ev);
  const objs = [];
  const add = (o) => { objs.push(o); return o; };

  // specials first (they influence the numbers' places)
  // masks first: they hide the map, never the other special objects (texts, images, out-of-bounds areas)
  const sids = [...v.specials].sort((a, b) => (ev.specials[a]?.kind === "mask" ? 0 : 1) - (ev.specials[b]?.kind === "mask" ? 0 : 1));
  for (const sid of sids) { const o = specialObj(ev, sid, ratio, std, cd, opts); if (o) add(o); }
  for (const sid of v.descriptions) add({ t: "descriptions", special: sid, cd, ...descRect(ev.specials[sid]) });

  const startAngleOut = (() => {
    for (let i = 0; i < v.controls.length; i++) if (ev.controls[v.controls[i].control].kind === "start") return angleOut(ev, v, i);
    return NaN;
  })();
  // the advanced level: a course's form (a string course, trail-O: leg lines or not), random-order sections (no lines to,
  // between or from their controls), a control met twice drawn once (a diamond's exit and entry), ski-O's centre dot
  const course = cd.course ? ev.courses[cd.course] : null;
  const legLines = !(course?.form && course.legLines === false);
  const rnd = (cv) => cv.ccs.some((id) => ev.courseControls[id]?.rnd);
  const drawn = new Set();
  const ski = cd.course && M.disciplineOf(ev, cd.course) === "ski";
  // controls and legs
  v.controls.forEach((cv, i) => {
    const key = `${cv.control}`;
    if (!cv.hidden && !cv.ghost && !(drawn.has(key) && ev.controls[cv.control].kind === "normal")) {
      const o = pointObj(ev, v, cv, i, ratio, gapScale, lw, Z, std);
      if (o) { if (ski && o.t === "control" && !o.dot) o.dot = 0.3 * ratio; add(o); drawn.add(key); }
    }
    if (legLines && (v.kind === "normal" || v.kind === "variations" || (v.kind === "score" && ev.controls[cv.control].kind === "map-issue")) && cv.legTo) {
      cv.legTo.forEach((j, k) => {
        if (j < 0 || rnd(cv) || rnd(v.controls[j])) return;
        for (const o of legObjs(ev, v, cv, v.controls[j], cv.ccs[k] || cv.ccs[0], ratio, lw, startAngleOut)) add(o);
      });
    }
  });
  // a string course: the string followed from the start to the finish, along the routes drawn (or straight between controls)
  if (course?.form === "string" && v.kind === "normal") {
    const pts = [];
    for (let i = 0; i >= 0 && i < v.controls.length; i = M.nextIndex(v, i)) {
      const j = M.nextIndex(v, i);
      if (j < 0) break;
      const seg = M.legRoutePoints(ev, v.controls[i].control, v.controls[j].control);
      pts.push(...(pts.length ? seg.slice(1) : seg));
    }
    if (pts.length >= 2) objs.unshift({ t: "string", pts, lw: 0.5 * ratio * ap.lineWidth, ratio, cc: 0, control: 0 });
  }
  for (const ccId of v.extra) {
    const cc = ev.courseControls[ccId];
    const o = pointObj(ev, v, { control: cc.control, ccs: [ccId], ordinal: -1 }, -1, ratio, gapScale, lw, Z, std);
    if (o) add(o);
  }
  // numbers: custom places first, then the others where they are clearest
  if (opts.numbers !== false) {
    const custom = (cv) => (cv.ccs[0] && ev.courseControls[cv.ccs[0]]?.number) || (!cv.ccs[0] && ev.controls[cv.control].codeAngle != null);
    for (const pass of [true, false]) v.controls.forEach((cv) => {
      if (cv.hidden || custom(cv) !== pass) return;
      const o = v.kind === "all" ? codeObj(ev, cv, ratio, objs) : numberObj(ev, v, cv, v.kind === "variations" ? "code" : labelKind(ev, cd), ratio, objs);
      if (o) add(o);
    });
  }
  if (v.kind !== "all") { autoCutCircles(objs); autoCutLegs(ev, cd, objs, ap); }
  return { objs, ratio, view: v, lw };
}
const labelKind = (ev, cd) => (cd.course ? ev.courses[cd.course].labels : "code");

/** The direction (radians) out of control index i towards the next one (or its first bend). */
function angleOut(ev, v, i) {
  const c = ev.controls[v.controls[i].control], n = M.nextIndex(v, i);
  if (n < 0) return Math.PI / 2;
  const nc = ev.controls[v.controls[n].control];
  let p2 = [nc.x, nc.y];
  const leg = ev.legs[M.findLeg(ev, v.controls[i].control, v.controls[n].control)];
  if (leg?.bends?.length) p2 = leg.bends[0];
  return Math.atan2(p2[1] - c.y, p2[0] - c.x);
}

function pointObj(ev, v, cv, i, ratio, gapScale, lw, Z, std) {
  const c = ev.controls[cv.control], ap = ev.appearance, cs = ap.controlCircleSize;
  const ctr = [c.x, c.y], base = { control: cv.control, cc: cv.ccs[0] || 0, ctr };
  const gaps = M.circleGaps(ev, cv.control, gapScale);
  const ao = i >= 0 ? angleOut(ev, v, i) : NaN;
  switch (c.kind) {
    case "map-issue": {
      const style = c.issueKind === "beginning" ? (v.kind === "all" ? "tail" : "plain") : "none";
      return { t: "issue", ...base, orientation: Number.isNaN(ao) ? 0 : orient(ao), style, ratio, radius: M.ISSUE_LENGTH * 0.6 * ratio * cs, apparent: 0 };
    }
    case "start": case "map-exchange": {
      const R = (std === "2017" ? 3.464 : 4.041) * ratio * cs;
      return { t: "start", ...base, orientation: Number.isNaN(ao) ? 0 : orient(ao), size: std === "2017" ? "2017" : "2000", ratio: ratio * cs, lw,
        radius: (std === "2017" ? Z.start : M.SIZES["2000"].start) * ratio * cs, apparent: (std === "2017" ? Z.start : M.SIZES["2000"].start) * ratio * cs - lw / 2, R };
    }
    case "finish": {
      const out = Z.finishOut * cs * ratio, inn = ((Z.finishIn + M.lineBase(ev)) * cs - ap.lineWidth * M.lineBase(ev)) * ratio;
      return { t: "finish", ...base, rOut: (out - lw) / 2, rIn: (inn - lw) / 2, lw, gaps, radius: out / 2, apparent: out / 2 - lw / 2 };
    }
    case "normal": {
      const d = Z.control * cs * ratio;
      const o = { t: "control", ...base, r: (d - lw) / 2, lw, gaps, dot: M.centerDotOf(ev) > 0 ? M.centerDotOf(ev) * ratio : 0, radius: d / 2, apparent: d / 2 - lw / 2 };
      if (cv.exchangeStart && std !== "2000") o.exchangeTriangle = Number.isNaN(ao) ? 0 : orient(ao);
      return o;
    }
    case "crossing": {
      const r = (std === "Spr2019" ? 1.82 : 1.72) + (c.stretch || 0) / 2;
      return { t: "crossing", ...base, orientation: c.orientation || 0, stretch: c.stretch || 0, ratio: ratio * cs, lw, wide: std === "Spr2019", radius: r * ratio * cs, apparent: r * ratio * cs - lw / 2 };
    }
    default: return null;
  }
}

/** The radius at which a leg starts or ends at a control of a kind (CourseFormatter.GetLegRadius). */
function legRadius(ev, kind, ratio) {
  const ap = ev.appearance, Z = M.sizes(ev);
  switch (kind) {
    case "crossing": return ratio * M.CROSSING_RADIUS * ap.controlCircleSize;
    case "normal": return ratio * ((Z.control * ap.controlCircleSize) / 2 - (M.lineBase(ev) * ap.lineWidth) / 2);
    case "finish": return ratio * ((Z.finishOut * ap.controlCircleSize) / 2 - (M.lineBase(ev) * ap.lineWidth) / 2);
    case "start": case "map-exchange": return ratio * (ap.mapStandard === "2017" ? Z.start : M.SIZES["2000"].start) * ap.controlCircleSize;
    default: return 0;
  }
}
/** The triangle's radius along a line coming in at angleIn when it points to angleOut (StartTriangleRadiusAdjustment). */
function triangleAdjust(angleIn, angleOutRad) {
  if (Number.isNaN(angleIn) || Number.isNaN(angleOutRad)) return 1;
  const third = Math.PI * 2 / 3;
  const rem = (a, b) => a - b * Math.round(a / b);
  const net = Math.abs(rem(angleOutRad - angleIn, third));
  const ray = [2 * Math.cos(net), 2 * Math.sin(net)], e1 = [Math.cos(third / 2), Math.sin(third / 2)], e2 = [e1[0], -e1[1]];
  const hit = segIntersect(e1, e2, [0, 0], ray);
  return hit ? Math.hypot(hit[0], hit[1]) : 1;
}
function segIntersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
function crossingEnd(ev, controlId, other, ratio) {
  const c = ev.controls[controlId];
  if (c.kind !== "crossing" || !(c.stretch > 0)) return [c.x, c.y];
  const a = ((c.orientation || 0) + 90) * DEG, d = ratio * (c.stretch / 2);
  const p1 = [c.x + Math.cos(a) * d, c.y + Math.sin(a) * d], p2 = [c.x - Math.cos(a) * d, c.y - Math.sin(a) * d];
  return M.dist(p1, other) < M.dist(p2, other) ? p1 : p2;
}
/** A leg's path cut at its controls' symbols, and its gaps along it (CourseFormatter.GetLegPath). */
export function legPath(ev, c1, c2, kind1, kind2, ratio, startAngleOut) {
  const leg = ev.legs[M.findLeg(ev, c1, c2)];
  const bends = leg?.bends || [];
  let gaps = leg?.gaps ? leg.gaps.map((g) => g.slice()) : null;
  let p1 = [ev.controls[c1].x, ev.controls[c1].y], p2 = [ev.controls[c2].x, ev.controls[c2].y];
  let r1 = legRadius(ev, kind1, ratio), r2 = legRadius(ev, kind2, ratio);
  if (kind1 === "crossing") p1 = crossingEnd(ev, c1, p2, ratio);
  if (kind2 === "crossing") p2 = crossingEnd(ev, c2, p1, ratio);
  if (kind2 === "start" && !Number.isNaN(startAngleOut)) {
    const from = bends.length ? bends[bends.length - 1] : p1;
    r2 *= triangleAdjust(Math.atan2(p2[1] - from[1], p2[0] - from[0]), startAngleOut);
  }
  if (M.dist(p1, p2) <= r1 + r2) return null;
  const along = (a, b, d) => { const L = M.dist(a, b) || 1; return [a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]; };
  const pts = [along(p1, bends[0] || p2, r1), ...bends.map((b) => b.slice()), along(p2, bends[bends.length - 1] || p1, r2)];
  if (gaps) gaps = gaps.map(([s, l]) => [s - r1, l]);
  return { pts, gaps, flag: leg?.flag || null };
}
function legObjs(ev, v, cvFrom, cvTo, ccId, ratio, lw, startAngleOut) {
  const k1 = cvFrom.hidden ? "none" : ev.controls[cvFrom.control].kind, k2 = cvTo.hidden ? "none" : ev.controls[cvTo.control].kind;
  const lp = legPath(ev, cvFrom.control, cvTo.control, k1, k2, ratio, startAngleOut);
  if (!lp) return [];
  const flagging = M.legFlagging(ev, cvFrom.control, cvTo.control);
  const base = { t: "leg", control: cvFrom.control, control2: cvTo.control, cc: ccId, cc2: cvTo.ccs[0], lw, ratio };
  const out = [];
  if ((flagging === "begin" || flagging === "end") && lp.flag) {
    const at = M.nearest(lp.pts, lp.flag);
    const head = [...lp.pts.slice(0, at.seg + 1), at.at], tail = [at.at, ...lp.pts.slice(at.seg + 1)];
    out.push({ ...base, pts: head, gaps: lp.gaps, flagged: flagging === "begin" });
    out.push({ ...base, pts: tail, gaps: lp.gaps ? lp.gaps.map(([s, l]) => [s - M.pathLength(head), l]) : null, flagged: flagging === "end" });
  } else out.push({ ...base, pts: lp.pts, gaps: lp.gaps, flagged: flagging === "all" });
  if (flagging === "issue-middle" && lp.flag) {
    // the map issue point drawn across the marked route at its place
    const at = M.nearest(lp.pts, lp.flag), a = lp.pts[at.seg], b = lp.pts[at.seg + 1];
    const tangent = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
    out.push({ t: "issue", ctr: lp.flag.slice(), orientation: tangent + 90, style: "plain", ratio, radius: 0, apparent: 0, control: 0, cc: 0 });
  }
  return out;
}

// ---- control numbers (CourseFormatter.GetTextLocation) -------------------------------------------------------------------
const NUMBER_EM = (M.NUMBER_HEIGHT / CAP_HEIGHT);       // em height giving 4 mm digits
function labelText(ev, v, cv, kind) {
  const c = ev.controls[cv.control];
  const same = v.controls.filter((x) => x.control === cv.control);
  if (same.length > 1 && same[0] !== cv) return "";
  let t = "";
  if (["sequence", "sequence-and-code", "sequence-and-score"].includes(kind)) t += [cv.ordinal, ...same.slice(1).map((x) => x.ordinal)].join("/");
  if (kind === "sequence-and-code") t += "-";
  if (["sequence-and-code", "code", "code-and-score"].includes(kind)) t += c.code ?? "";
  if (["code-and-score", "sequence-and-score", "score"].includes(kind)) {
    const pts = cv.ccs[0] ? ev.courseControls[cv.ccs[0]].points || 0 : 0;
    if (pts > 0) t += kind === "score" ? String(pts) : `(${pts})`;
  }
  return t;
}
function numberObj(ev, v, cv, kind, ratio, objs) {
  const c = ev.controls[cv.control];
  if (c.kind !== "normal") return null;
  const ap = ev.appearance, text = labelText(ev, v, cv, kind);
  const em = NUMBER_EM * ratio * ap.numberHeight, bold = !!ap.numberBold;
  const cc = cv.ccs[0] ? ev.courseControls[cv.ccs[0]] : null;
  let ctr;
  if (cc?.number) ctr = [c.x + cc.number[0], c.y + cc.number[1]];
  else {
    const dist = ((M.sizes(ev).control * ap.controlCircleSize) / 2 + M.NUMBER_DISTANCE * ap.controlCircleSize) * ratio;
    ctr = textLocation([c.x, c.y], dist, text, em, bold, objs, family(ap.numberFont));
  }
  return { t: "number", control: cv.control, cc: cv.ccs[0] || 0, text, ctr, em, bold, font: ap.numberFont, outline: ap.numberOutline * ratio,
    upper: ap.mapStandard === "Spr2019" || ap.numberOutline > 0, ...textBox(text, em, bold, ctr, family(ap.numberFont)) };
}
function codeObj(ev, cv, ratio, objs) {
  const c = ev.controls[cv.control];
  if (c.kind !== "normal") return null;
  const ap = ev.appearance, text = c.code ?? "", em = (M.CODE_HEIGHT / CAP_HEIGHT) * ratio * ap.numberHeight;
  const dist = ((M.sizes(ev).control * ap.controlCircleSize) / 2 + M.CODE_DISTANCE * ap.controlCircleSize) * ratio;
  let ctr;
  const RC = "Roboto Condensed";
  if (c.codeAngle != null) ctr = rectCenter([c.x, c.y], dist, c.codeAngle * DEG, textSize(text, em, true, RC));
  else ctr = textLocation([c.x, c.y], dist, text, em, true, objs, RC);
  return { t: "code", control: cv.control, cc: 0, text, ctr, em, bold: true, condensed: true, outline: ap.numberOutline * ratio, ...textBox(text, em, true, ctr, RC) };
}
const textSize = (text, em, bold, fam) => [textWidth(text, bold, fam) * em, CAP_HEIGHT * em];
function textBox(text, em, bold, ctr, fam) { const [w, h] = textSize(text, em, bold, fam); return { w, h, box: [ctr[0] - w / 2, ctr[1] - h / 2, ctr[0] + w / 2, ctr[1] + h / 2] }; }
function textLocation(ctr, dist, text, em, bold, objs, fam) {
  const size = textSize(text, em, bold, fam);
  const near = objs.filter((o) => !(o.t === "control" && M.samePt(o.ctr, ctr)) && distFrom(o, ctr) <= dist * 4);
  let best = null, bestD = -1;
  for (let a = Math.PI / 6; a < Math.PI / 6 + 2 * Math.PI - 1e-9; a += Math.PI / 16) {
    const p = rectCenter(ctr, dist, a, size);
    const d = near.length ? Math.min(...near.map((o) => distFrom(o, p))) : 0;
    if (d > bestD) { best = p; bestD = d; }
  }
  return best;
}
/** The centre of a w x h box touching a circle of radius r around c at an angle (CourseFormatter.GetRectangleCenter). */
function rectCenter(c, r, angle, [w, h]) {
  const w2 = w / 2, h2 = h / 2, tan = Math.tan(angle);
  let x, y;
  if (w2 === 0 && h2 === 0) { x = Math.cos(angle) * r; y = Math.sin(angle) * r; }
  else if (w2 > 0 && Math.abs(tan) >= (h2 + r) / w2) { x = (h2 + r) / tan; y = h2 + r; if (Math.sin(angle) < 0) { x = -x; y = -y; } }
  else if (Math.abs(tan) <= h2 / (w2 + r)) { x = r + w2; y = (r + w2) * tan; if (Math.cos(angle) < 0) { x = -x; y = -y; } }
  else {
    const na = Math.atan2(Math.abs(Math.sin(angle)), Math.abs(Math.cos(angle))), ar = Math.atan2(h2, w2), rr = Math.hypot(h2, w2);
    const beta = Math.asin(Math.max(-1, Math.min(1, (Math.sin(na - ar) / r) * rr)));
    const at = na + beta;
    x = Math.cos(at) * r + w2; y = Math.sin(at) * r + h2;
    if (Math.cos(angle) < 0) x = -x;
    if (Math.sin(angle) < 0) y = -y;
  }
  return [c[0] + x, c[1] + y];
}
/** Distance from an object to a point (CourseObj.DistanceFromPoint), 0 when it covers it. */
export function distFrom(o, p) {
  switch (o.t) {
    case "control": case "finish": case "start": case "crossing": case "issue": case "point":
      return Math.max(0, M.dist(p, o.ctr) - (o.radius || 0));
    case "leg": case "line": return Math.max(0, M.nearest(o.pts, p).d - (o.lw || 0) / 2);
    case "area": return inPoly(o.pts, p) ? 0 : M.nearest([...o.pts, o.pts[0]], p).d;
    case "number": case "code": case "text": case "rect": case "descriptions": case "image": case "qr": {
      if (!o.box) return Infinity;                             // a description block is measured when drawn (draw.js)
      const [l, b, r, t] = o.box;
      if (p[0] >= l && p[0] <= r && p[1] >= b && p[1] <= t) return 0;
      return M.nearest([[l, b], [r, b], [r, t], [l, t], [l, b]], p).d;
    }
    default: return Infinity;
  }
}
export function inPoly(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- automatic cuts ----------------------------------------------------------------------------------------------------
function autoCutCircles(objs) {
  for (const a of objs) {
    if (a.t !== "control" && a.t !== "finish") continue;
    for (const b of objs) {
      if (b === a || !["control", "finish", "start", "crossing", "issue", "point"].includes(b.t)) continue;
      const rc = a.apparent, ro = b.apparent ?? 0, d = M.dist(a.ctr, b.ctr);
      if (d < (rc + ro) * 0.9 && d > (rc + ro) * 0.35) {
        const cosv = (rc * rc + d * d - ro * ro) / (2 * rc * d);
        if (Math.abs(cosv) < 1) {
          const half = Math.acos(cosv) / DEG, ang = M.angleDeg(a.ctr, b.ctr);
          a.gaps = M.simplifyCircleGaps([...(a.gaps || []), [ang - half, ang + half]]);
        }
      }
    }
  }
}
function autoCutLegs(ev, cd, objs, ap) {
  if (!(ap.autoLegGap > 0)) return;
  const order = new Map(M.ccIds(ev, cd).map((id, i) => [id, i]));
  const legs = objs.filter((o) => o.t === "leg");
  for (const leg of legs) {
    for (const other of legs) {
      if (other === leg) continue;
      // only the later leg is cut
      if (!((order.get(other.cc) ?? -1) < (order.get(leg.cc) ?? -1))) continue;
      for (const p of polyIntersections(leg.pts, other.pts)) cutAt(leg, p, leg.ratio * (ap.autoLegGap / 2));
    }
    for (const o of objs) {
      if (!["control", "finish", "start", "crossing", "point"].includes(o.t) || !o.apparent) continue;
      const ro = o.apparent + ap.lineWidth * M.lineBase(ev) * 2;
      const n = M.nearest(leg.pts, o.ctr);
      if (n.d < ro && M.dist(n.at, leg.pts[0]) > 0.5 && M.dist(n.at, leg.pts[leg.pts.length - 1]) > 0.5)
        cutAt(leg, n.at, Math.sqrt(ro * ro - n.d * n.d) + ap.autoLegGap / 2);
    }
  }
}
function cutAt(leg, p, r) {
  const at = M.nearest(leg.pts, p).len;
  leg.gaps = M.simplifyGaps([...(leg.gaps || []), [at - r, 2 * r]], M.pathLength(leg.pts));
}
function polyIntersections(a, b) {
  const out = [];
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p = segIntersect(a[i - 1], a[i], b[j - 1], b[j]);
    if (p) out.push(p);
  }
  return out;
}

// ---- specials ------------------------------------------------------------------------------------------------------------
function rectOf(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
/** A description sheet's place: its top-left corner (the first point) and its cell size (the distance to the second). */
function descRect(sp) {
  const cell = M.dist(sp.pts[0], sp.pts[1]);
  return { topLeft: sp.pts[0].slice(), cell, columns: sp.columns || 1, box: null };
}
function specialObj(ev, sid, ratio, std, cd, opts) {
  const sp = ev.specials[sid], base = { special: sid };
  const cs = ev.appearance.controlCircleSize;
  switch (sp.kind) {
    case "first-aid": return { t: "point", kind: sp.kind, ...base, ctr: sp.pts[0], ratio: ratio * cs, std, radius: (std === "2000" ? 1.5 : 2.0) * ratio * cs, apparent: (std === "2000" ? 1.5 : 2.0) * ratio * cs };
    case "water": return { t: "point", kind: sp.kind, ...base, ctr: sp.pts[0], ratio: ratio * cs, std, radius: (std === "2000" ? 2.0 : 1.5) * ratio * cs, apparent: (std === "2000" ? 2.0 : 1.5) * ratio * cs, lwBase: M.lineBase(ev) * ev.appearance.lineWidth };
    case "forbidden-route": return { t: "point", kind: sp.kind, ...base, ctr: sp.pts[0], ratio: ratio * cs, radius: 1.5 * ratio * cs, apparent: 1.5 * ratio * cs };
    case "registration-mark": return { t: "point", kind: sp.kind, ...base, ctr: sp.pts[0], ratio: ratio * cs, radius: 2 * ratio * cs, apparent: 2 * ratio * cs, lw: 0.1 * ratio * ev.appearance.lineWidth };
    case "optional-crossing-point": {
      const r = (std === "Spr2019" ? 1.82 : 1.72) + (sp.stretch || 0) / 2;
      return { t: "crossing", ...base, ctr: sp.pts[0], orientation: sp.orientation || 0, stretch: sp.stretch || 0, ratio: ratio * cs, lw: M.lineBase(ev) * ev.appearance.lineWidth * ratio,
        wide: std === "Spr2019", radius: r * ratio * cs, apparent: r * ratio * cs, control: 0, cc: 0 };
    }
    case "boundary": return { t: "line", kind: sp.kind, ...base, pts: sp.pts, lw: (std === "Spr2019" ? 1.0 : 0.7) * ev.appearance.lineWidth * ratio };
    case "line": return { t: "line", kind: sp.kind, ...base, pts: sp.pts, lw: sp.lineWidth || 0.35, lineKind: sp.lineKind || "single", gap: sp.gapSize || 0, dash: sp.dashSize || 0, color: sp.color };
    case "out-of-bounds": case "dangerous-area": case "temporary-construction": case "white-out":
      return { t: "area", kind: sp.kind, ...base, pts: sp.pts, ratio, std };
    case "rectangle": case "ellipse": return { t: "rect", kind: sp.kind, ...base, box: rectOf(sp.pts), lw: sp.lineWidth || 0.35, lineKind: sp.lineKind || "single", gap: sp.gapSize || 0,
      dash: sp.dashSize || 0, radiusCorner: sp.radius || 0, color: sp.color };
    case "text": return { t: "text", ...base, box: rectOf(sp.pts), text: M.expandText(ev, cd, sp.text || "", { variation: opts.variationName || "", team: opts.team, leg: opts.leg }),
      font: sp.font || { name: "Arial", bold: false, italic: false, height: -1 }, color: sp.color };
    case "image": return { t: "image", ...base, box: rectOf(sp.pts), image: sp.image, name: sp.text || "" };
    case "qr": return { t: "qr", ...base, box: rectOf(sp.pts), text: sp.text || "" };
    // MTB-O's course symbols (the advanced level): drawn after ISMTBOM 2022's descriptions, upper purple
    case "mtbo-obstacle": case "mtbo-forbidden-pass":
      return { t: "point", kind: sp.kind, ...base, ctr: sp.pts[0], orientation: sp.orientation || 0, ratio: ratio * cs, radius: 1.5 * ratio * cs, apparent: 1.5 * ratio * cs };
    // an enlarged section of the map (inset: its frame, the part of the map it shows, the factor) and a mask (white, with holes)
    case "inset": return { t: "inset", ...base, box: rectOf(sp.pts), src: sp.src || null, factor: sp.factor || 2 };
    case "mask": return { t: "area", kind: "mask", ...base, pts: sp.pts, holes: sp.holes || [], ratio, std };
    case "mtbo-oneway": case "mtbo-forbidden-route": case "mtbo-danger":
      return { t: "line", kind: sp.kind, ...base, pts: sp.pts, lw: 0.35 * ev.appearance.lineWidth * ratio, ratio: ratio * cs };
    default: return null;
  }
}
