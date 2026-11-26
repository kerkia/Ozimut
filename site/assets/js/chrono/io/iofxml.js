// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// IOF XML 3.0 (and what 2.0.3 shares with it): entries, start lists, courses and results, read into a set and written
// from a view (docs/design.md). Clock times are read as written — the wall clock of the event —, whatever the offset.

import { parseXml, decodeText, kid, kids, txt, x, XML_HEAD } from "../xml.js";

const NS = "http://www.orienteering.org/datastandard/3.0";
const STATUS_IN = { ok: "ok", finished: "ok", missingpunch: "mp", mispunch: "mp", disqualified: "dsq", didnotfinish: "dnf", sportingwithdrawal: "dnf",
  overtime: "ot", didnotstart: "dns", didnotenter: "dns", cancelled: "dns", notcompeting: "nc", active: "run", inactive: "wait" };
const STATUS_OUT = { ok: "OK", mp: "MissingPunch", dnf: "DidNotFinish", dns: "DidNotStart", dsq: "Disqualified", ot: "OverTime", nc: "NotCompeting", run: "Active", wait: "Inactive" };
const num = (s) => (s !== "" && s != null && Number.isFinite(Number(String(s).replace(",", "."))) ? Number(String(s).replace(",", ".")) : null);

/** « 2026-11-17T10:02:00+01:00 » as seconds after the event day's midnight (`day`: "YYYY-MM-DD"; later days add 24 h). */
export function clockOf(text, day = null) {
  const m = /(?:(\d{4}-\d{2}-\d{2})T)?(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/.exec(text || "");
  if (!m) return null;
  let s = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] || 0);
  if (m[1] && day && m[1] !== day) s += Math.round((Date.parse(`${m[1]}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000) * 86400;
  return s;
}
function person(el) {
  const p = kid(el, "Person"), org = kid(el, "Organisation");
  const ids = kids(p, "Id").map((i) => i.text.trim()).filter(Boolean);
  const sex = (p?.attrs.sex || "").toUpperCase();
  return {
    family: txt(p, "Name", "Family") || txt(p, "PersonName", "Family"), given: txt(p, "Name", "Given") || txt(p, "PersonName", "Given"),
    lic: ids[0] || "", sex: sex === "F" ? "F" : sex === "M" ? "M" : "", birth: (txt(p, "BirthDate") || "").slice(0, 4), nat: kid(p, "Nationality")?.attrs.code || "",
    club: txt(org, "Name") || txt(org, "ShortName"), clubCode: txt(org, "Id") || "",
  };
}
const cardOf = (el) => num(kids(el, "ControlCard").map((c) => c.text.trim()).find(Boolean) || kids(el, "CCard").map((c) => txt(c, "CCardId")).find(Boolean) || "");

/** Any IOF XML file → `{ kind: "entries"|"starts"|"courses"|"results"|"classes"|"people", set }`, or null. */
export function readIof(input) {
  const root = parseXml(decodeText(input));
  if (!root) return null;
  const ev = kid(root, "Event");
  const day = (txt(ev, "StartTime", "Date") || txt(ev, "StartDate", "Date") || "").slice(0, 10) || null;
  const set = { event: ev ? { name: txt(ev, "Name"), date: day } : null, clubs: [], courses: [], classes: [], runners: [] };
  const classSeen = new Map();
  const cls = (name, patch = {}) => { if (!name) return; const was = classSeen.get(name); if (was) Object.assign(was, patch); else { const c = { name, ...patch }; classSeen.set(name, c); set.classes.push(c); } };
  const courseOf = (el) => { const c = kid(el, "Course"); return c ? { name: txt(c, "Name"), length: num(txt(c, "Length")), climb: num(txt(c, "Climb")) } : null; };

  switch (root.name) {
    case "EntryList":
      for (const e of kids(root, "PersonEntry")) {
        const name = txt(kid(e, "Class"), "Name") || txt(e, "Class", "ShortName");
        cls(name);
        set.runners.push({ ...person(e), cls: name, card: cardOf(e), bib: txt(e, "BibNumber") || undefined });
      }
      return { kind: "entries", set };
    case "CompetitorList":
      for (const e of kids(root, "Competitor")) set.runners.push({ ...person(e), card: cardOf(e), cls: txt(e, "Class", "Name") || undefined });
      return { kind: "people", set };
    case "ClassList":
      for (const c of kids(root, "Class")) cls(txt(c, "Name") || txt(c, "ShortName"));
      return { kind: "classes", set };
    case "StartList":
      for (const cs of kids(root, "ClassStart")) {
        const name = txt(cs, "Class", "Name"), course = courseOf(cs);
        cls(name, course?.name ? { course: course.name } : {});
        if (course?.name) set.courses.push(course);
        for (const ps of kids(cs, "PersonStart")) {
          const st = kid(ps, "Start");
          set.runners.push({ ...person(ps), cls: name, card: cardOf(st), bib: txt(st, "BibNumber") || undefined, start: clockOf(txt(st, "StartTime"), day) ?? undefined });
        }
      }
      return { kind: "starts", set };
    case "CourseData": {
      const rc = kid(root, "RaceCourseData") || root;
      set.controls = [];
      for (const c of kids(rc, "Control")) { const code = num(txt(c, "Id")); if (code) set.controls.push({ code }); }
      for (const c of kids(rc, "Course")) {
        const controls = kids(c, "CourseControl").filter((cc) => (cc.attrs.type || "Control") === "Control").map((cc) => num(txt(cc, "Control"))).filter(Boolean);
        set.courses.push({ name: txt(c, "Name"), length: num(txt(c, "Length")), climb: num(txt(c, "Climb")), controls });
      }
      for (const a of kids(rc, "ClassCourseAssignment")) cls(txt(a, "ClassName"), { course: txt(a, "CourseName") });
      return { kind: "courses", set };
    }
    case "ResultList": {
      set.reads = [];
      for (const cr of kids(root, "ClassResult")) {
        const name = txt(cr, "Class", "Name"), course = courseOf(cr);
        let codes = null;
        const people = kids(cr, "PersonResult");
        for (const pr of people) {
          const res = kid(pr, "Result");
          if (!res) continue;
          const status = STATUS_IN[txt(res, "Status").toLowerCase()] || "";
          const start = clockOf(txt(res, "StartTime"), day), finish = clockOf(txt(res, "FinishTime"), day), time = num(txt(res, "Time"));
          const splits = kids(res, "SplitTime").filter((s) => (s.attrs.status || "").toLowerCase() !== "additional");
          const all = kids(res, "SplitTime").map((s) => [num(txt(s, "ControlCode")), (s.attrs.status || "").toLowerCase() === "missing" ? null : num(txt(s, "Time"))]);
          if (!codes && status === "ok" && splits.length) codes = splits.map((s) => num(txt(s, "ControlCode")));
          const at = set.runners.length;
          set.runners.push({ ...person(pr), cls: name, card: cardOf(res), bib: txt(res, "BibNumber") || undefined, start: start ?? undefined,
            status: ["dns", "dsq", "nc"].includes(status) ? status : undefined });
          const t0 = start ?? (finish != null && time != null ? finish - time : null);
          if (t0 != null && (finish != null || all.some((p) => p[1] != null))) {
            set.reads.push({ card: cardOf(res) || 0, start: null, finish: finish ?? (time != null && ["ok", "mp", "ot", "nc"].includes(status) ? t0 + time : null),
              punches: all.filter((p) => p[0] && p[1] != null).sort((a, b) => a[1] - b[1]).map(([c, t]) => [c, t0 + t]), of: at });
          }
        }
        const cname = course?.name || (codes ? name : "");
        if (cname) { set.courses.push({ name: cname, length: course?.length ?? null, climb: course?.climb ?? null, ...(codes ? { controls: codes } : {}) }); cls(name, { course: cname }); } else cls(name);
      }
      return { kind: "results", set };
    }
    default: return null;
  }
}

// ---- writing ---------------------------------------------------------------------------------------------------------
const two = (n) => String(n).padStart(2, "0");
function offsetOf(day) {
  const d = new Date(`${day || "2000-01-01"}T12:00:00`), o = -d.getTimezoneOffset();
  return Number.isFinite(o) ? `${o < 0 ? "-" : "+"}${two(Math.floor(Math.abs(o) / 60))}:${two(Math.abs(o) % 60)}` : "+00:00";
}
/** Seconds after the event day's midnight as an ISO time with the place's offset. */
export function isoOf(s, day, tz = offsetOf(day)) {
  if (s == null) return null;
  const d = new Date(Date.parse(`${day || "2000-01-01"}T00:00:00Z`) + Math.floor(s / 86400) * 86400000), r = ((s % 86400) + 86400) % 86400;
  return `${d.toISOString().slice(0, 10)}T${two(Math.floor(r / 3600))}:${two(Math.floor((r % 3600) / 60))}:${two(Math.floor(r % 60))}${tz}`;
}
const head = (name, opt, body) => XML_HEAD + x(name, { xmlns: NS, iofVersion: "3.0", createTime: new Date(opt.at || Date.now()).toISOString(), creator: opt.creator || "Chronoz", ...(opt.attrs || {}) }, body);
const eventX = (ev) => x("Event", [x("Name", ev.name || ""), ev.date ? x("StartTime", [x("Date", ev.date)]) : null]);
const sexOut = (s) => (/^(f|d|w)/i.test(s || "") ? "F" : s ? "M" : null);
const personX = (r) => x("Person", { sex: sexOut(r.sex) }, [r.lic ? x("Id", r.lic) : null, x("Name", [x("Family", r.family), x("Given", r.given)]), r.birth ? x("BirthDate", `${String(r.birth).slice(0, 4)}-01-01`) : null]);
const orgX = (r) => (r.club ? x("Organisation", [r.clubCode ? x("Id", r.clubCode) : null, x("Name", r.club)]) : null);
const courseX = (c) => (c ? x("Course", [x("Name", c.name), c.length != null ? x("Length", Math.round(c.length)) : null, c.climb != null ? x("Climb", Math.round(c.climb)) : null]) : null);

/** A view (design.md) as an IOF XML ResultList; `status`: "Complete" | "Snapshot". */
export function writeResults(view, opt = {}) {
  const day = view.event.date, tz = opt.tz;
  const splitsX = (r) => r.splits.map((s) => (s.t == null ? x("SplitTime", { status: "Missing" }, [x("ControlCode", s.code)]) : x("SplitTime", [x("ControlCode", s.code), x("Time", Math.round(s.t))])));
  // a relay: each team with its legs; a leg's overall result is the team's so far, the last leg's carries the team's place
  const teamX = (tm) => {
    let sum = 0, fine = true;
    return x("TeamResult", [x("Name", tm.name || ""), tm.club ? x("Organisation", [tm.clubCode ? x("Id", tm.clubCode) : null, x("Name", tm.club)]) : null,
      tm.bib !== "" && tm.bib != null ? x("BibNumber", tm.bib) : null,
      ...tm.legs.map((r, i) => {
        if (!r) { fine = false; return null; }
        if (r.status === "ok" && r.time != null) sum += r.time; else fine = false;
        const last = i === tm.legs.length - 1;
        return x("TeamMemberResult", [personX(r), x("Result", [x("Leg", i + 1),
          r.start != null ? x("StartTime", isoOf(r.start, day, tz)) : null, r.finish != null ? x("FinishTime", isoOf(r.finish, day, tz)) : null,
          r.time != null ? x("Time", Math.round(r.time)) : null, x("Status", STATUS_OUT[r.status] || "Inactive"),
          x("OverallResult", [fine ? x("Time", Math.round(sum)) : null, last && tm.status === "ok" && tm.behind != null ? x("TimeBehind", Math.round(tm.behind)) : null,
            last && tm.place ? x("Position", tm.place) : null, x("Status", fine ? "OK" : STATUS_OUT[last ? tm.status : r.status] || "Inactive")]),
          ...splitsX(r), r.card ? x("ControlCard", r.card) : null])]);
      })]);
  };
  return head("ResultList", { ...opt, attrs: { status: opt.status || "Complete" } }, [eventX(view.event), ...view.classes.map((k) => x("ClassResult", [
    x("Class", [x("Name", k.name)]), k.teams ? null : courseX(k.course),
    ...(k.teams ? k.teams.map(teamX) : []),
    ...(k.teams ? [] : k.rows).map((r) => x("PersonResult", [personX(r), orgX(r), x("Result", [
      r.bib !== "" && r.bib != null ? x("BibNumber", r.bib) : null,
      r.start != null ? x("StartTime", isoOf(r.start, day, tz)) : null, r.finish != null ? x("FinishTime", isoOf(r.finish, day, tz)) : null,
      r.time != null ? x("Time", Math.round(r.time)) : null,
      r.status === "ok" && r.time != null && k.rows[0]?.time != null ? x("TimeBehind", Math.round(r.time - k.rows[0].time)) : null,
      r.place ? x("Position", r.place) : null, x("Status", STATUS_OUT[r.status] || "Inactive"),
      r.points != null ? x("Score", { type: "Points" }, r.points) : null,
      ...r.splits.map((s) => (s.t == null ? x("SplitTime", { status: "Missing" }, [x("ControlCode", s.code)]) : x("SplitTime", [x("ControlCode", s.code), x("Time", Math.round(s.t))]))),
      r.card ? x("ControlCard", r.card) : null,
    ])])),
  ]))]);
}

/** A view as an IOF XML StartList. */
export function writeStarts(view, opt = {}) {
  const day = view.event.date, tz = opt.tz;
  return head("StartList", opt, [eventX(view.event), ...view.classes.map((k) => x("ClassStart", [
    x("Class", [x("Name", k.name)]), courseX(k.course),
    ...[...k.rows].sort((a, b) => (a.start ?? 1e9) - (b.start ?? 1e9)).map((r) => x("PersonStart", [personX(r), orgX(r), x("Start", [
      r.bib !== "" && r.bib != null ? x("BibNumber", r.bib) : null, r.start != null ? x("StartTime", isoOf(r.start, day, tz)) : null, r.card ? x("ControlCard", r.card) : null,
    ])])),
  ]))]);
}

/** A view as an IOF XML EntryList. */
export function writeEntries(view, opt = {}) {
  return head("EntryList", opt, [eventX(view.event), ...view.classes.flatMap((k) => k.rows.map((r) => x("PersonEntry", [
    personX(r), orgX(r), r.card ? x("ControlCard", r.card) : null, x("Class", [x("Name", k.name)]),
  ])))]);
}

/** The state's courses as IOF XML CourseData. */
export function writeCourses(st, opt = {}) {
  const codes = new Set(Object.values(st.courses).flatMap((c) => c.controls || []));
  return head("CourseData", opt, [eventX(st.event), x("RaceCourseData", [
    x("Control", { type: "Start" }, [x("Id", "S1")]), x("Control", { type: "Finish" }, [x("Id", "F1")]),
    ...[...codes].sort((a, b) => a - b).map((c) => x("Control", [x("Id", c)])),
    ...Object.values(st.courses).map((c) => x("Course", [x("Name", c.name), c.length != null ? x("Length", Math.round(c.length)) : null, c.climb != null ? x("Climb", Math.round(c.climb)) : null,
      x("CourseControl", { type: "Start" }, [x("Control", "S1")]), ...(c.controls || []).map((code) => x("CourseControl", { type: "Control" }, [x("Control", code)])),
      x("CourseControl", { type: "Finish" }, [x("Control", "F1")])])),
    ...Object.values(st.classes).filter((k) => st.courses[k.course]).map((k) => x("ClassCourseAssignment", [x("ClassName", k.name), x("CourseName", st.courses[k.course].name)])),
  ])]);
}
