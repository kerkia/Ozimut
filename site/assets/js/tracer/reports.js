// The Tracer's reports (menu Rapports): Purple Pen's five — course summary, leg lengths, cross-reference, competitor load,
// event audit (Reports.cs) — with the same rows and rules, shown as tables in a dialog and saved as CSV. The event audit
// adds Ozimut's checks after Purple Pen's: controls too close for the discipline (IOF: 30 m, 15 m in sprint; closer than
// 60 m / 30 m only on clearly different features), controls in out-of-bounds or dangerous areas, legs across them or across
// an uncrossable boundary, legs passing through another control's circle, dog-legs, very short legs, codes below 31 or
// readable upside down as another code. After OCAD's consistency check (owner, 2026-11-16): courses with the same controls in
// the same order, a sprint's controls under 25 m apart (the rule's running distance; 15 m in a straight line), a second feature
// in column E without the crossing, junction or « between » that calls for one, punching units used twice or equal to
// another control's code, description boxes on the map outside ISCD's 5 to 7 mm.

import * as M from "./model.js";
import { inPoly } from "./layout.js";
import { symbol } from "./symbols.js";
import { modal, download, fileName, saveFiles } from "./dialogs.js";
import { where } from "./ribbon-data.js";
import { t, tn, lang, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const km = (a, b) => (Math.abs(a - b) < 50 ? `${nf(a / 1000, 1)} km` : `${nf(a / 1000, 1)}–${nf(b / 1000, 1)} km`);
const range = (a, b) => (a === b ? String(a) : `${a}–${b}`);
const climbText = (c) => (c >= 0 ? `${Math.round(c / 5) * 5} m` : "");
const KIND_NAME = { start: t("trc.rep.kStart"), finish: t("trc.rep.kFinish"), crossing: t("trc.rep.kCrossing"), "map-exchange": t("trc.rep.kMapExchange"), "map-issue": t("trc.rep.kMapIssue") };
// a row's tag (row.tag) and a section's id (section.id) name what they hold whatever the language (« Vérifier » reads them)
const tagged = (cells, tag) => Object.assign(cells, { tag });
/** A control's name as Purple Pen's NameStyle.Medium: the code, or the kind. */
export const ctrlName = (ev, id) => { const c = ev.controls[id]; return !c ? "?" : c.kind === "normal" ? c.code : KIND_NAME[c.kind] || c.kind; };
const sortedCourses = (ev) => M.courseIds(ev, false);
const designators = (ev, id) => (M.hasVariations(ev, id) ? M.allVariations(ev, id).map((x) => ({ cd: M.cdCourse(id, -1, x.path), code: x.code })) : [{ cd: M.cdCourse(id), code: "" }]);
const isSprint = (ev) => ev.appearance?.mapStandard === "Spr2019" || ev.map.scale <= 5000;

// ---- the reports, as data: { title, intro?, sections: [{ title?, text?, head, align, rows, foot? }] } ----------------------
export function courseSummary(ev) {
  const rows = [];
  for (const id of sortedCourses(ev)) {
    for (const d of [{ cd: M.cdCourse(id), code: "" }, ...(M.hasVariations(ev, id) ? designators(ev, id) : [])]) {
      const v = M.view(ev, d.cd, { specials: false, descriptions: false }), c = ev.courses[id], score = v.kind === "score";
      rows.push([d.code ? `    ${d.code}` : c.name, range(v.minNormal, v.maxNormal), score ? "" : km(v.totalMin, v.totalMax), score ? "" : climbText(c.climb),
        d.code ? "" : c.load >= 0 ? String(c.load) : "", d.code ? "" : `1:${nf(c.printScale || ev.map.scale)}`]);
    }
  }
  return { title: t("trc.rep.summaryTitle"), sections: [{ head: [t("trc.rep.course"), t("trc.rep.controls"), t("trc.rep.length"), t("trc.rep.climb"), t("trc.rep.load"), t("trc.rep.printScale")], align: "lrrrrr", rows }] };
}
export function legLengths(ev) {
  const sections = [];
  for (const id of sortedCourses(ev)) {
    const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false });
    if (v.kind === "score") continue;
    const c = ev.courses[id], rows = [];
    let n = 1, total = 0;
    v.controls.forEach((cv, ci) => {
      if (!cv.legTo) return;
      cv.legTo.forEach((_, li) => {
        if (ev.controls[cv.control].kind === "crossing" && cv.legTo.length <= 1) return;
        // through crossing points with a single way on (Reports.WriteLegLengthRow)
        let i = ci, l = li, dist = 0, next, flagged = 0;
        for (;;) {
          const x = v.controls[i];
          next = x.legTo[l]; dist += x.legLen[l];
          if (next >= 0) { const a = x.control, b = v.controls[next].control, f = M.legFlagging(ev, a, b); if (f !== "none") flagged += f === "all" ? x.legLen[l] : M.flaggedLengthM(ev, a, b); }
          if (next < 0) break;
          const nx = v.controls[next];
          if (ev.controls[nx.control].kind !== "crossing" || !nx.legTo || nx.legTo.length !== 1) break;
          i = next; l = 0;
        }
        if (dist > 0 && next >= 0) {
          rows.push([v.kind === "normal" ? String(n) : "", `${ctrlName(ev, cv.control)}–${ctrlName(ev, v.controls[next].control)}`, `${Math.round(dist)} m`, flagged > 0 ? `${Math.round(flagged)} m` : ""]);
          total += dist; n++;
        }
      });
    });
    sections.push({ title: tn("trc.rep.legsTitle", v.maxNormal, { name: c.name, range: range(v.minNormal, v.maxNormal), km: km(v.totalMin, v.totalMax), climb: c.climb >= 0 ? `, ${climbText(c.climb)}` : "" }),
      head: [t("trc.rep.leg"), t("trc.rep.controls"), t("trc.rep.length"), t("trc.rep.flagged")], align: "llrr", rows, foot: n > 1 ? [t("trc.rep.average"), "", `${Math.round(total / (n - 1))} m`, ""] : null });
  }
  return { title: t("trc.rep.legLengthsTitle"), sections };
}
export function crossRef(ev) {
  const courses = sortedCourses(ev);
  const ctrls = Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === "normal").sort((a, b) => M.compareCodes(ev.controls[a].code, ev.controls[b].code));
  const cell = new Map();
  courses.forEach((cid, col) => {
    for (const d of designators(ev, cid)) for (const cv of M.view(ev, d.cd, { specials: false, descriptions: false }).controls) {
      const k = `${cv.control}:${col}`;
      if (!cell.has(k)) cell.set(k, new Set());
      cell.get(k).add(cv.ordinal);
    }
  });
  const str = (s) => (!s ? "" : [...s].sort((a, b) => a - b).map((i) => (i < 0 ? "*" : String(i))).join(","));
  const rows = ctrls.map((id) => [ev.controls[id].code, ...courses.map((_, col) => str(cell.get(`${id}:${col}`))), String(courses.filter((_, col) => cell.has(`${id}:${col}`)).length)]);
  return { title: t("trc.rep.crossRefTitle"), intro: t("trc.rep.crossRefIntro"),
    sections: [{ head: [t("trc.rep.control"), ...courses.map((c) => ev.courses[c].name), t("trc.rep.courses")], align: `l${"r".repeat(courses.length + 1)}`, rows, rule3: true }] };
}
/** Visits of a control: a butterfly's twice (QueryEvent.GetControlVisitLoad). */
function visitLoad(ev, id) {
  let any = false, total = 0;
  for (const c of M.coursesUsing(ev, id, false)) {
    const load = ev.courses[c].load;
    if (load == null || load < 0) continue;
    any = true;
    let f = 0;
    if (M.hasVariations(ev, c)) {
      const vars = M.allVariations(ev, c);
      for (const x of vars) f += M.ccIds(ev, M.cdCourse(c, -1, x.path)).filter((cc) => ev.courseControls[cc].control === id).length / vars.length;
    } else f = M.ccIds(ev, M.cdCourse(c)).filter((cc) => ev.courseControls[cc].control === id).length;
    total += Math.ceil(f * load);
  }
  return any ? total : -1;
}
export function loadReport(ev) {
  const courses = sortedCourses(ev), intro = [];
  if (!courses.every((c) => ev.courses[c].load >= 0)) intro.push(t("trc.rep.loadMissingAll", { where: where("load") }));
  if (courses.some((c) => M.hasVariations(ev, c))) intro.push(t("trc.rep.loadVariations"));
  const infos = Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === "normal").map((id) => ({
    id, name: ctrlName(ev, id), n: M.coursesUsing(ev, id, false).length, load: M.controlLoad(ev, id), visits: visitLoad(ev, id) }));
  infos.sort((a, b) => b.load - a.load || b.visits - a.visits || b.n - a.n || M.compareCodes(a.name, b.name) || a.id - b.id);
  const multi = infos.some((x) => x.visits > x.load);
  if (multi) intro.push(t("trc.rep.loadButterflies"));
  const legs = new Map();
  for (const cid of Object.keys(ev.courses).map(Number)) for (const l of M.enumLegs(ev, M.cdCourse(cid))) {
    const a = ev.courseControls[l.cc1].control, b = ev.courseControls[l.cc2].control, k = `${a}:${b}`;
    if (!legs.has(k)) legs.set(k, { text: `${ctrlName(ev, a)}–${ctrlName(ev, b)}`, n: M.coursesUsingLeg(ev, a, b, false).length, load: M.legLoad(ev, a, b) });
  }
  const legRows = [...legs.values()].filter((x) => x.n > 1).sort((a, b) => b.load - a.load || b.n - a.n || a.text.localeCompare(b.text));
  return { title: t("trc.rep.loadTitle"), intro: intro.join("\n"), sections: [
    { title: t("trc.rep.courses"), head: [t("trc.rep.course"), t("trc.rep.load")], align: "lr", rows: courses.map((c) => [ev.courses[c].name, ev.courses[c].load >= 0 ? String(ev.courses[c].load) : ""]) },
    { title: t("trc.rep.controls"), head: multi ? [t("trc.rep.control"), t("trc.rep.courses"), t("trc.rep.load"), t("trc.rep.visits")] : [t("trc.rep.control"), t("trc.rep.courses"), t("trc.rep.load")], align: multi ? "lrrr" : "lrr",
      rows: infos.map((x) => [x.name, String(x.n), x.load >= 0 ? String(x.load) : "", ...(multi ? [x.visits >= 0 ? String(x.visits) : ""] : [])]) },
    { title: t("trc.rep.legs"), text: t("trc.rep.legsShared"), head: [t("trc.rep.leg"), t("trc.rep.courses"), t("trc.rep.load")], align: "lrr", rows: legRows.map((x) => [x.text, String(x.n), x.load >= 0 ? String(x.load) : ""]) }] };
}

// ---- event audit ----------------------------------------------------------------------------------------------------------
const segX = (p1, p2, q1, q2) => {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};
const segDist = (p, a, b) => M.nearest([a, b], p).d;
/** Upside-down reading of a code (SI cards are punched any way round): 6↔9, 0 1 8 stay, others unreadable. */
const flipCode = (code) => { const m = { 0: "0", 1: "1", 6: "9", 8: "8", 9: "6" }; if (!/^\d+$/.test(code)) return null; let s = ""; for (const ch of [...code].reverse()) { if (!(ch in m)) return null; s += m[ch]; } return s.replace(/^0+/, ""); };

export function audit(ev) {
  const sections = [], courses = sortedCourses(ev);
  const name = (c) => ev.courses[c].name;
  // Purple Pen: missing items in courses
  const missing = [], checkLoad = courses.some((c) => ev.courses[c].load >= 0);
  for (const c of courses) {
    const ids = M.ccIds(ev, M.cdCourse(c)), kinds = ids.map((id) => M.kindOfCC(ev, id));
    if (ev.courses[c].kind === "score") { if (!kinds.includes("start")) missing.push(tagged([name(c), t("trc.rep.kStart"), t("trc.rep.noStartScore")], "start")); }
    else {
      if (!kinds.includes("start")) missing.push(tagged([name(c), t("trc.rep.kStart"), t("trc.rep.noStart")], "start"));
      if (!kinds.includes("finish")) missing.push(tagged([name(c), t("trc.rep.kFinish"), t("trc.rep.noFinish")], "finish"));
      if (!(ev.courses[c].climb >= 0)) missing.push(tagged([name(c), t("trc.rep.climb"), t("trc.rep.noClimb", { where: where("rep-climb") })], "climb"));
    }
    if (checkLoad && !(ev.courses[c].load >= 0)) missing.push(tagged([name(c), t("trc.rep.load"), t("trc.rep.noLoad")], "load"));
  }
  if (missing.length) sections.push({ id: "missing", title: t("trc.rep.missingTitle"), head: [t("trc.rep.course"), t("trc.rep.item"), t("trc.rep.reason")], align: "lll", rows: missing });
  // Purple Pen: repeated controls
  const rep = [];
  for (const c of courses) for (const d of designators(ev, c)) {
    const ctl = M.ccIds(ev, d.cd).map((id) => ev.courseControls[id].control), score = ev.courses[c].kind === "score";
    ctl.forEach((x, i) => {
      const dup = score ? ctl.indexOf(x) < i : i > 0 && ctl[i - 1] === x;
      if (dup && !rep.some((r) => r.c === c && r.x === x)) rep.push({ c, x, score });
    });
  }
  if (rep.length) sections.push({ id: "repeated", title: t("trc.rep.repeatedTitle"), head: [t("trc.rep.course"), t("trc.rep.control"), t("trc.rep.problem")], align: "lll",
    rows: rep.map((r) => [name(r.c), ctrlName(ev, r.x), r.score ? t("trc.rep.twiceScore") : t("trc.rep.twiceInRow")]) });
  // courses with the same controls in the same order (one of them is not needed, or a control was forgotten)
  const seqs = new Map();
  for (const c of courses) {
    if (ev.courses[c].kind === "score") continue;
    for (const d of designators(ev, c)) {
      const key = M.ccIds(ev, d.cd).map((id) => ev.courseControls[id].control).join(">");
      if (!key.includes(">")) continue;
      if (!seqs.has(key)) seqs.set(key, new Set());
      seqs.get(key).add(c);
    }
  }
  const same = [...seqs.values()].filter((x) => x.size > 1).map((x) => [[...x].map(name).join(", "), t("trc.rep.identical")]);
  if (same.length) sections.push({ id: "identical", title: t("trc.rep.identicalTitle"), head: [t("trc.rep.courses"), t("trc.rep.remark")], align: "ll", rows: same });
  // Purple Pen: close-together controls (100 m), with the discipline's IOF limits (Ozimut)
  const sprint = isSprint(ev), minD = sprint ? 15 : 30, sameD = sprint ? 30 : 60;
  const normal = Object.keys(ev.controls).map(Number).filter((id) => ev.controls[id].kind === "normal");
  const near = [];
  for (const a of normal) for (const b of normal) {
    if (b <= a) continue;
    const d = M.mmToM(ev, M.dist([ev.controls[a].x, ev.controls[a].y], [ev.controls[b].x, ev.controls[b].y]));
    if (d >= 100.4999) continue;
    const sa = ev.controls[a].symbols?.[1] || null, sb = ev.controls[b].symbols?.[1] || null, same = !!(sa && sb && sa === sb);
    const codes = [ev.controls[a].code, ev.controls[b].code].sort(M.compareCodes);
    near.push({ d, row: [codes.join(", "), `${Math.round(d)} m`, same ? t("trc.rep.yes") : t("trc.rep.no"), d < minD ? (sprint ? t("trc.rep.tooCloseSprint", { m: minD }) : t("trc.rep.tooClose", { m: minD })) : sprint && d < 25 ? t("trc.rep.sprint25") : d <sameD && same ? t("trc.rep.sameFeature", { m: sameD }) : ""] });
  }
  near.sort((x, y) => x.d - y.d);
  if (near.length) sections.push({ id: "near", title: t("trc.rep.nearTitle"), text: sprint ? t("trc.rep.nearTextSprint", { min: minD, same: sameD }) : t("trc.rep.nearText", { min: minD, same: sameD }),
    head: [t("trc.rep.controls"), t("trc.rep.distance"), t("trc.rep.sameSymbol"), t("trc.rep.rule")], align: "lrll", rows: near.map((x) => x.row) });
  // Purple Pen: legs run both ways
  const fwd = new Map();
  for (const c of courses) {
    if (ev.courses[c].kind === "score") continue;
    for (const l of M.enumLegs(ev, M.cdCourse(c))) {
      const k = `${ev.courseControls[l.cc1].control}:${ev.courseControls[l.cc2].control}`;
      if (!fwd.has(k)) fwd.set(k, []);
      if (!fwd.get(k).includes(c)) fwd.get(k).push(c);
    }
  }
  const both = [], seen = new Set();
  for (const [k, cs] of fwd) {
    const [a, b] = k.split(":").map(Number), back = fwd.get(`${b}:${a}`);
    if (!back || seen.has(`${b}:${a}`) || a === b) continue;
    seen.add(k);
    both.push([`${ctrlName(ev, a)} → ${ctrlName(ev, b)}`, cs.map(name).join(", ")], [`${ctrlName(ev, b)} → ${ctrlName(ev, a)}`, back.map(name).join(", ")]);
  }
  if (both.length) sections.push({ id: "both", title: t("trc.rep.bothWaysTitle"), head: [t("trc.rep.leg"), t("trc.rep.courses")], align: "ll", rows: both });
  // Purple Pen: unused controls
  const unused = M.unusedControls(ev, false).sort((a, b) => M.compareControls(ev, a, b));
  if (unused.length) sections.push({ id: "unused", title: t("trc.rep.unusedTitle"), text: t("trc.rep.unusedText", { where: where("remove-unused") }), head: [t("trc.rep.control"), t("trc.rep.position")], align: "ll",
    rows: unused.map((id) => [ctrlName(ev, id), `(${Math.round(ev.controls[id].x)}, ${Math.round(ev.controls[id].y)})`]) });
  // Purple Pen: missing description boxes
  const boxes = [];
  for (const id of Object.keys(ev.controls).map(Number).sort((a, b) => M.compareControls(ev, a, b))) {
    if (unused.includes(id)) continue;
    const c = ev.controls[id];
    if (c.kind !== "normal" && c.kind !== "start") continue;
    const s = c.symbols || [];
    if (c.kind === "start" && !s.some(Boolean)) continue;
    const combo = s[3] === "10.1" || s[3] === "10.2", between = s[4] === "11.15" || s[4] === "11.15single";
    if (!s[1]) boxes.push([ctrlName(ev, id), "D", t("trc.rep.emptyD")]);
    else if (combo && !s[2]) boxes.push([ctrlName(ev, id), "E", t("trc.rep.crossingE")]);
    else if (s[4] === "11.15" && !s[2]) boxes.push([ctrlName(ev, id), "E", t("trc.rep.betweenE")]);
    // a second feature in column E says two features: column F (crossing, junction) or G (between) must say how they meet
    else if (s[2] && symbol(s[2], ev.descStandard)?.k === "D" && !combo && !between) boxes.push([ctrlName(ev, id), "F / G", t("trc.rep.secondFeature")]);
  }
  if (boxes.length) sections.push({ id: "descr", title: t("trc.rep.descTitle"), head: [t("trc.rep.control"), t("trc.rep.column"), t("trc.rep.reason")], align: "lll", rows: boxes });
  // punching units (the advanced level: a control's other units): one number on two controls, a unit equal to another control's code
  const unitOf = new Map(), unitRows = [];
  for (const id of normal) {
    const c = ev.controls[id], list = [c.code, ...(c.units || [])].map((x) => String(x || "").trim()).filter(Boolean);
    list.forEach((u, i) => {
      if (list.indexOf(u) < i) { unitRows.push([ctrlName(ev, id), u, t("trc.rep.unitTwiceSame")]); return; }
      const other = unitOf.get(u);
      if (other != null && other !== id) unitRows.push([`${ctrlName(ev, other)}, ${ctrlName(ev, id)}`, u, i === 0 || ev.controls[other].code === u ? t("trc.rep.unitIsCode") : t("trc.rep.unitTwice")]);
      else unitOf.set(u, id);
    });
  }
  if (unitRows.length) sections.push({ id: "units", title: t("trc.rep.unitsTitle"), head: [t("trc.rep.controls"), t("trc.rep.unit"), t("trc.rep.problem")], align: "lll", rows: unitRows });
  // Purple Pen: missing punch patterns (only when some control has one)
  const punched = normal.filter((id) => !unused.includes(id));
  if (punched.some((id) => /1/.test(ev.controls[id].punch?.dots || ""))) {
    const rows = punched.filter((id) => !/1/.test(ev.controls[id].punch?.dots || "")).sort((a, b) => M.compareControls(ev, a, b)).map((id) => [ctrlName(ev, id), t("trc.rep.noPunch")]);
    if (rows.length) sections.push({ id: "punches", title: t("trc.rep.punchTitle"), head: [t("trc.rep.control"), t("trc.rep.reason")], align: "ll", rows });
  }
  // Purple Pen: missing scores
  const scores = [];
  for (const c of courses) {
    if (ev.courses[c].kind !== "score") continue;
    const here = [];
    let any = false;
    for (const id of M.ccIds(ev, M.cdCourse(c))) {
      const cc = ev.courseControls[id];
      if (ev.controls[cc.control].kind !== "normal") continue;
      if (!(cc.points > 0)) here.push([name(c), ctrlName(ev, cc.control), t("trc.rep.noPoints")]); else any = true;
    }
    if (any) scores.push(...here);
  }
  if (scores.length) sections.push({ id: "scores", title: t("trc.rep.pointsTitle"), head: [t("trc.rep.course"), t("trc.rep.control"), t("trc.rep.reason")], align: "lll", rows: scores });

  // ---- Ozimut's further checks ----
  const more = [];
  const areas = Object.values(ev.specials).filter((s) => ["out-of-bounds", "dangerous-area"].includes(s.kind) && s.pts?.length >= 3);
  const bounds = Object.values(ev.specials).filter((s) => s.kind === "boundary" && s.pts?.length >= 2);
  const forbid = Object.values(ev.specials).filter((s) => s.kind === "forbidden-route" && s.pts?.length);
  const oob = (s) => s.kind === "out-of-bounds";
  for (const id of normal) {
    if (unused.includes(id)) continue;
    const c = ev.controls[id];
    for (const s of areas) if (inPoly(s.pts, [c.x, c.y])) more.push(tagged(["", ctrlName(ev, id), oob(s) ? t("trc.rep.inOob") : t("trc.rep.inDanger")], "in-area"));
    const code = c.code;
    if (/^\d+$/.test(code) && Number(code) < 31) more.push(tagged(["", code, t("trc.rep.codeBelow31")], "code"));
    const flip = flipCode(code);
    if (flip && flip !== code && normal.some((o) => o !== id && ev.controls[o].code === flip) && M.compareCodes(code, flip) < 0) more.push(tagged(["", `${code}, ${flip}`, t("trc.rep.codesFlip")], "flip"));
  }
  const R = M.controlRadius(ev) * M.objRatio(ev, ev.allControls.printScale);
  for (const c of courses) {
    if (ev.courses[c].kind === "score") continue;
    const legsDone = new Set();
    for (const d of designators(ev, c)) {
      const ids = M.ccIds(ev, d.cd), ctl = ids.map((id) => ev.courseControls[id].control);
      const tag = name(c);
      for (let i = 0; i + 1 < ctl.length; i++) {
        const a = ctl[i], b = ctl[i + 1], key = `${a}:${b}`;
        if (legsDone.has(key)) continue;
        legsDone.add(key);
        const pts = M.legPoints(ev, a, b), legName = `${ctrlName(ev, a)}–${ctrlName(ev, b)}`, flag = M.legFlagging(ev, a, b);
        const len = M.legLengthM(ev, a, b);
        if (ev.controls[a].kind === "normal" && ev.controls[b].kind === "normal" && len < (sprint ? 30 : 60)) more.push(tagged([tag, legName, t("trc.rep.shortLeg", { m: Math.round(len) })], "short"));
        for (let k = 0; k + 1 < pts.length; k++) {
          for (const s of areas) {
            const poly = [...s.pts, s.pts[0]];
            if (flag !== "all" && poly.some((q, j) => j + 1 < poly.length && segX(pts[k], pts[k + 1], q, poly[j + 1]))) { more.push(tagged([tag, legName, oob(s) ? t("trc.rep.crossOob") : t("trc.rep.crossDanger")], "cross-area")); break; }
          }
          for (const s of bounds) if (s.pts.some((q, j) => j + 1 < s.pts.length && segX(pts[k], pts[k + 1], q, s.pts[j + 1]))) { more.push(tagged([tag, legName, t("trc.rep.crossBoundary")], "boundary")); break; }
          for (const s of forbid) if (segDist(s.pts[0], pts[k], pts[k + 1]) < R * 0.6) { more.push(tagged([tag, legName, t("trc.rep.forbiddenRoute")], "forbidden")); break; }
        }
        // through another control of the course
        for (const o of new Set(ctl)) {
          if (o === a || o === b || ev.controls[o].kind !== "normal") continue;
          const p = [ev.controls[o].x, ev.controls[o].y];
          if (M.nearest(pts, p).d < R) { more.push(tagged([tag, legName, t("trc.rep.throughCircle", { code: ctrlName(ev, o) })], "circle")); }
        }
      }
      // dog-legs: the way out within 20° of the way in, at a normal control
      for (let i = 1; i + 1 < ctl.length; i++) {
        const b = ctl[i];
        if (ev.controls[b].kind !== "normal" || ctl.indexOf(b) !== ctl.lastIndexOf(b) || legsDone.has(`dog:${b}`)) continue;
        const pin = M.legPoints(ev, ctl[i - 1], b), pout = M.legPoints(ev, b, ctl[i + 1]);
        const u = pin[pin.length - 2], w = pout[1], c0 = [ev.controls[b].x, ev.controls[b].y];
        const a1 = Math.atan2(u[1] - c0[1], u[0] - c0[0]), a2 = Math.atan2(w[1] - c0[1], w[0] - c0[0]);
        let diff = Math.abs(a1 - a2) * 180 / Math.PI; if (diff > 180) diff = 360 - diff;
        if (diff < 20) legsDone.add(`dog:${b}`);
        if (diff < 20) more.push(tagged([tag, ctrlName(ev, b), t("trc.rep.dogLeg", { deg: Math.round(diff) })], "dog-leg"));
      }
    }
  }
  // courses that leave one start for the same first control (runners of one course lead those of the other), or for first
  // controls in nearly the same direction (2026-10-22, after MeOSDjango's draw checker; a reminder)
  const firsts = new Map();                 // start -> first control -> the courses
  for (const c of courses) {
    if (ev.courses[c].kind === "score") continue;
    for (const d of designators(ev, c)) {
      const ctl = M.ccIds(ev, d.cd).map((id) => ev.courseControls[id].control);
      const i = ctl.findIndex((x) => ev.controls[x].kind === "normal");
      if (i < 0) continue;
      const st = i > 0 && ev.controls[ctl[i - 1]].kind === "start" ? ctl[i - 1] : null;
      if (!firsts.has(st)) firsts.set(st, new Map());
      const m = firsts.get(st);
      if (!m.has(ctl[i])) m.set(ctl[i], []);
      if (!m.get(ctl[i]).includes(c)) m.get(ctl[i]).push(c);
    }
  }
  for (const [st, m] of firsts) {
    for (const [x, cs] of m) if (cs.length > 1) more.push(tagged([cs.map(name).join(", "), ctrlName(ev, x), t("trc.rep.sameFirst")], "first"));
    if (st == null) continue;
    const s0 = [ev.controls[st].x, ev.controls[st].y], dirs = [...m.keys()].map((x) => {
      const pts = M.legPoints(ev, st, x), q = pts[1] || [ev.controls[x].x, ev.controls[x].y];
      return { x, a: Math.atan2(q[1] - s0[1], q[0] - s0[0]) };
    });
    for (let i = 0; i < dirs.length; i++) for (let j = i + 1; j < dirs.length; j++) {
      let diff = Math.abs(dirs[i].a - dirs[j].a) * 180 / Math.PI; if (diff > 180) diff = 360 - diff;
      if (diff >= 15) continue;
      const set = new Set([...m.get(dirs[i].x), ...m.get(dirs[j].x)]);
      if (set.size < 2) continue;                       // one course's variations
      const cs = [...set].map(name).join(", ");
      more.push(tagged([cs, `${ctrlName(ev, dirs[i].x)}, ${ctrlName(ev, dirs[j].x)}`, t("trc.rep.firstSameWay", { deg: Math.round(diff) })], "first-dir"));
    }
  }
  // the description sheets placed on the maps: ISCD's boxes are 5 to 7 mm square once printed
  for (const sp of Object.values(ev.specials)) {
    if (sp.kind !== "descriptions" || !(sp.pts?.length >= 2)) continue;
    const cell = Math.abs(sp.pts[1][0] - sp.pts[0][0]);
    for (const x of sp.all ? courses.map((c) => ({ course: c })) : sp.courses) {
      const c = ev.courses[x.course];
      if (!c || c.hideFromReports) continue;
      const printed = cell * (ev.map.scale / (c.printScale || ev.map.scale));
      if (printed < 4.95 || printed > 7.05) more.push(tagged([name(x.course), t("trc.rep.descSheet"), t("trc.rep.descBox", { mm: nf(printed, 1) })], "desc-box"));
    }
  }
  if (more.length) sections.push({ id: "more", title: t("trc.rep.moreTitle"), text: t("trc.rep.moreText"), head: [t("trc.rep.course"), t("trc.rep.object"), t("trc.rep.remark")], align: "lll", rows: more });
  return { title: t("trc.rep.auditTitle"), intro: sections.length ? "" : t("trc.rep.noProblem"), sections };
}

// ---- the advanced level's reports (Condes's controls spreadsheet, the trail-O answers) --------------------------------------------
/** Every control: its code, other units, lock, courses, its nearest control (Condes's « distance to nearest » column), trail-O flags. */
export function controlsList(ev) {
  const ids = Object.keys(ev.controls).map(Number).sort((a, b) => M.compareControls(ev, a, b));
  const rows = ids.map((id) => {
    const c = ev.controls[id];
    let best = null, d = Infinity;
    for (const o of ids) if (o !== id && ev.controls[o].kind === "normal") { const x = M.mmToM(ev, M.dist([c.x, c.y], [ev.controls[o].x, ev.controls[o].y])); if (x < d) { d = x; best = o; } }
    return [ctrlName(ev, id), (c.units || []).join(", "), c.locked ? "✓" : "", M.coursesUsing(ev, id).map((x) => ev.courses[x].name).join(", "),
      best ? `${nf(d)} m (${ctrlName(ev, best)})` : "", c.trail?.flags || "", c.trail?.answer || ""];
  });
  return { title: t("trc.rep.controlsTitle"), sections: [{ head: [t("trc.rep.control"), t("trc.rep.units"), t("trc.rep.locked"), t("trc.rep.courses"), t("trc.rep.nearest"), t("trc.rep.flags"), t("trc.rep.answer")], align: "lllllll", rows }] };
}
/** The trail-O courses' answers, control by control (for the jury, kept away from the maps). */
export function trailAnswers(ev) {
  const sections = [];
  for (const id of sortedCourses(ev)) {
    const c = ev.courses[id];
    if (c.form !== "trail" && M.disciplineOf(ev, id) !== "trail") continue;
    const v = M.view(ev, M.cdCourse(id), { specials: false, descriptions: false });
    const rows = v.controls.filter((cv) => ev.controls[cv.control].kind === "normal")
      .map((cv) => { const k = ev.controls[cv.control]; return [String(cv.ordinal > 0 ? cv.ordinal : ""), k.code, (k.trail?.flags || "").replace("-", "–"), k.trail?.answer || "?"]; });
    sections.push({ title: c.name, head: [t("trc.rep.number"), t("trc.rep.control"), t("trc.rep.flags"), t("trc.rep.answer")], align: "rlll", rows });
  }
  return { title: t("trc.rep.trailTitle"), intro: sections.length ? "" : t("trc.rep.trailNone"), sections };
}
export const controlsReport = (E) => show(E, controlsList(E.ev), t("trc.rep.slugControls"));
export const trailReport = (E) => show(E, trailAnswers(E.ev), t("trc.rep.slugTrail"));

// ---- display and CSV ----------------------------------------------------------------------------------------------------------
function html(rep) {
  return `${rep.intro ? rep.intro.split("\n").map((t) => `<p class="tr-hint">${esc(t)}</p>`).join("") : ""}${rep.sections.map((s) => `
    ${s.title ? `<h3>${esc(s.title)}</h3>` : ""}${s.text ? `<p class="tr-hint">${esc(s.text)}</p>` : ""}
    <div class="table-wrap"><table class="tr-table${s.nowrap ? " tr-nw" : ""}"><thead><tr>${s.head.map((h, i) => `<th class="${s.align[i] === "r" ? "r" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${s.rows.map((r, ri) => `<tr${s.rule3 && ri % 3 === 2 ? ' class="tr-rule"' : ""}>${r.map((c, i) => `<td class="${s.align[i] === "r" ? "r" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${s.head.length}"><small>${esc(t("trc.rep.nothing"))}</small></td></tr>`}
    ${s.foot ? `<tr class="tr-sum">${s.foot.map((c, i) => `<td class="${s.align[i] === "r" ? "r" : ""}">${esc(c)}</td>`).join("")}</tr>` : ""}</tbody></table></div>`).join("")}`;
}
const cq = (v) => { const s = String(v ?? "").trim(); return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/** CSV for the reader's spreadsheets: « ; » between columns in French (its decimal comma), « , » in English; UTF-8
 *  with its mark. */
export function csv(rep) {
  const sep = lang() === "en" ? "," : ";";
  const lines = [cq(rep.title), ...(rep.intro ? rep.intro.split("\n").map(cq) : [])];
  for (const s of rep.sections) {
    lines.push("");
    if (s.title) lines.push(cq(s.title));
    lines.push(s.head.map(cq).join(sep));
    for (const r of s.rows) lines.push(r.map(cq).join(sep));
    if (s.foot) lines.push(s.foot.map(cq).join(sep));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}
/** A report shown, with its CSV and print buttons; more: { extra (more buttons, html), onOpen(form, done) } (the routes' report). */
async function show(E, rep, slug, more = {}) {
  await modal(E, { title: `${rep.title} — ${E.ev.title.replace(/\|/g, " ")}`, wide: true, ok: null, cancel: t("trc.rep.close"),
    body: `<div class="tr-report">${html(rep)}</div>`,
    extra: `${more.extra || ""}<button type="button" class="btn" data-csv>CSV</button><button type="button" class="btn" data-print>${esc(t("trc.rep.print"))}</button>`,
    onOpen: (f, done) => {
      f.querySelector("[data-csv]").addEventListener("click", () => download(`${fileName(E.ev.title)} - ${slug}.csv`, csv(rep), "text/csv;charset=utf-8"));
      f.querySelector("[data-print]").addEventListener("click", () => printReport(rep, E.ev.title));
      more.onOpen?.(f, done);
    } });
}
export { show as showReport };
function printReport(rep, title) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(rep.title)}</title><style>body{font:12px system-ui,sans-serif;margin:16mm}table{border-collapse:collapse;margin-bottom:12px}
    th,td{border-bottom:1px solid #ccc;padding:3px 8px;text-align:left}td.r,th.r{text-align:right}h1{font-size:18px}h3{font-size:14px;margin:16px 0 6px}.tr-rule td{border-bottom:2px solid #555}</style>
    <h1>${esc(rep.title)} — ${esc(title.replace(/\|/g, " "))}</h1>${html(rep)}`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 200);
}
export const summary = (E) => show(E, courseSummary(E.ev), t("trc.rep.slugSummary"));
export const legLengthsReport = (E) => show(E, legLengths(E.ev), t("trc.rep.slugLegs"));
export const crossRefReport = (E) => show(E, crossRef(E.ev), t("trc.rep.slugCrossRef"));
export const loadReportDialog = (E) => show(E, loadReport(E.ev), t("trc.rep.slugLoad"));
export const auditReport = (E) => show(E, audit(E.ev), t("trc.rep.slugAudit"));
/** Every report, one CSV file each, in a zip. */
export async function csvAll(E) {
  const { zip } = await import("./pdf.js");
  const ev = E.ev, enc = new TextEncoder();
  const files = { [`${t("trc.rep.csvSummary")}.csv`]: courseSummary(ev), [`${t("trc.rep.csvLegs")}.csv`]: legLengths(ev), [`${t("trc.rep.csvCrossRef")}.csv`]: crossRef(ev),
    [`${t("trc.rep.csvLoad")}.csv`]: loadReport(ev), [`${t("trc.rep.csvAudit")}.csv`]: audit(ev) };
  const out = {};
  for (const [n, rep] of Object.entries(files)) out[n] = enc.encode(csv(rep));
  await saveFiles(E, out, `${t("trc.rep.zipName", { name: fileName(ev.title) })}.zip`);
}
