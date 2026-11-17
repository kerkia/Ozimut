// MeOS's event file (.meosxml, root <meosdata>), read and written from its format alone (docs/chrono/meos.md: element
// names, units and numbers learnt from MeOS's source, none of its code).
//
// Times. Every time of the file counts from <ZeroTime> (itself seconds after midnight) and is written in SECONDS: whole
// seconds up to MeOS 3.8, and from MeOS 3.9 — which counts in tenths — seconds with one decimal when the time is not whole
// (« 3723.4 »; a build counting hundredths writes two). The file never holds bare tenths, so the two are told apart by the
// text itself, not by the version; `info.tenths` says whether a fraction was met. A bare « -1 » is « no time » (minus one
// second is « -1.0 »), and a start or finish of 0 is « none ». Here they become seconds after midnight (tenths kept).
//
// readMeos(text) → { set, oracle, info }
//   set     the importers' set (docs/chrono/design.md, as model.importSet takes it), with what MeOS adds:
//           event { name, date, zero, meosZero, tenths? } — `zero` is Chrono's, the first start (the earliest start time
//             of the runners, else MeOS's zero time + 1 h, the margin MeOS itself takes); `meosZero` the file's own;
//             `tenths` when a start or a finish holds tenths, which is when MeOS itself ranks on them;
//           controls [{ code, any? [the control's other codes], name?, kind? (bad | multiple | start | finish | score |
//             notiming | optional | scorereq | check), pts?, radio?, timeAdjust?, minTime? }];
//           courses [… , score?, limit?]; classes [… , pool? | legs? (course names), first?, step?, fee?];
//           runners [{ key, … , course? (their own), startNo?, adj?, parent? (the runner whose further race this is) }]
//             — `status` only when MeOS's is one no card gives (dns, dsq, nc): the rest is the oracle's, for Chrono to
//             judge by itself;
//           teams [{ name, club, cls, bib, start, finish, status, runners [by leg: the runner's place in `runners` | null] }];
//           reads [{ card, start, finish, check, punches [[code, s]…], runnerKey (a runner's `key`, null: no owner),
//             of (the same runner's place in `runners`), rent?, mv? }];
//           radio [{ code, card, s, kind? (start | finish | check when the code is 1 | 2 | 3) }]
//   oracle  MeOS's stored verdict, a row per runner: { key, family, given, card, cls, status (ok mp dnf dns dsq ot nc |
//           null), time, start, finish, adj? } — time = finish - start + the runner's time adjustment, as MeOS counts it;
//           start is the runner's own, else their card's start punch
//   info    { version, tenths, vacant (vacant places of the start list, left out of the set) }
//
// writeMeos(state, view) → an event file for MeOS: controls, courses, classes, clubs, runners with start, finish, status
// and card, their cards with the punches (corrections made by hand applied; an Emit card's times, which count from the
// card's own zero, put on the clock from the runner's start), other cards, radio punches. The view — view.js's buildView,
// or the exporters' view — gives each runner's verdict: rows matched by `row.id`, the runner's id (the one thing asked of
// the exporters' view beyond design.md), else by card and name; without a view the start list and the cards alone are
// written. <ZeroTime> is `event.meosZero`, else an hour before the first start, and always before every time written. The
// version said is the oldest MeOS reading the file as meant: 3.8, or 3.9 with tenths.
// Left out (MeOS takes its defaults): NameId, Annotation, the event's own oData (fees, organiser…), every <Updated> stamp,
// <Legs>, a card's ReadId / Voltage / BatteryDate, InputTime / InputStatus / InputPoint / InputPlace, MultiR, AltName,
// lists, maps, images, machines; fees and payments, rented cards; a score race's penalty (only its time limit is written);
// relays — no TeamList, MultiCourse legs nor LegMethod: a relay's runners are written as runners of their class.

import { parseXml, kid, kids, txt, x, XML_HEAD } from "../xml.js";

const STATUS = { 1: "ok", 2: "nc", 3: "mp", 4: "dnf", 5: "dsq", 6: "ot", 15: "nc", 20: "dns", 21: "dns", 99: "nc" };
const STATUS_OUT = { ok: 1, mp: 3, dnf: 4, dsq: 5, ot: 6, dns: 20 };          // nc: 15 with a finish, 99 without
const CONTROL = { 1: "bad", 2: "multiple", 4: "start", 5: "finish", 6: "score", 7: "notiming", 8: "optional", 9: "bad", 10: "scorereq", 11: "check" };
const P_START = 1, P_FINISH = 2, P_CHECK = 3, P_RENTED = 11111, SPECIAL = { 1: "start", 2: "finish", 3: "check" };
const BY_HAND = new Set(["dns", "dsq", "nc"]);                                // what no card says: these go with the runner
const VACANT = /^(vakant|vacant|vacante|ledig)$/i;
const DATE = /^\d{4}-\d\d-\d\d$/;

const int = (s) => { const n = parseInt(s, 10); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] == null) delete o[k]; return o; };
const least = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);

/** A time as MeOS writes it, in seconds: « 3723 », « 3723.4 », « -12.5 »; null for none (empty, or the bare « -1 »). */
export function meosTime(s) {
  const t = String(s ?? "").trim(), c = /^(\d+):(\d\d)(?::(\d\d(?:[.,]\d+)?))?$/.exec(t);
  if (c) return int(c[1]) * 3600 + int(c[2]) * 60 + Number((c[3] || "0").replace(",", "."));      // a clock, in a file edited by hand
  const m = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(t);
  if (!m || (m[1] && m[2] === "1" && m[3] == null)) return null;
  const v = Number(m[2]) + (m[3] ? Number(m[3]) / 10 ** m[3].length : 0);
  return m[1] ? -v : v;
}
/** Seconds as MeOS's text: whole seconds bare, else one decimal; minus one second « -1.0 ». */
export function meosTimeText(s) {
  const t = Math.round(s * 10), a = Math.abs(t);
  return a % 10 ? `${t < 0 ? "-" : ""}${Math.floor(a / 10)}.${a % 10}` : t === -10 ? "-1.0" : String(t / 10);
}
/** « Family, Given » as stored; without a comma MeOS takes the first word as the given name. One word: the family name. */
function nameOf(s) {
  const t = String(s).trim().replace(/\s+/g, " "), c = t.indexOf(","), w = t.indexOf(" ");
  if (c >= 0) return { family: t.slice(0, c).trim(), given: t.slice(c + 1).trim() };
  return w < 0 ? { family: t, given: "" } : { family: t.slice(w + 1), given: t.slice(0, w) };
}
/** A card's punch string, « type-time[@unit][#origin]; » each: [{ type, t (relative seconds | null) }]. */
function punchList(s, time) {
  const out = [];
  for (const p of String(s || "").split(";")) {
    const m = /^\s*(\d+)(?:-(-?\d+(?:\.\d+)?))?/.exec(p);
    if (m) out.push({ type: int(m[1]), t: m[2] == null ? 0 : time(m[2]) });
  }
  return out;
}

export function readMeos(text) {
  const root = parseXml(text);
  if (!root || root.name !== "meosdata") throw new Error("not a MeOS event file");
  let tenths = false, ranked = false, vacant = 0;
  const time = (s) => { const v = meosTime(s); if (v != null && v % 1) tenths = true; return v; };
  const zero = time(txt(root, "ZeroTime")) ?? 0, factor = int(txt(root, "oData", "CurrencyFactor")) || 1;
  const abs = (t) => (t == null ? null : r2(zero + t));
  const day = (t) => (t != null && t > 0 ? abs(t) : null);                 // a start, a finish: 0 is none
  const money = (s) => (int(s) ? int(s) / factor : null);
  const list = (name, item) => kids(kid(root, name), item);
  const once = (map, el) => { const id = int(txt(el, "Id")); return id > 0 && !map.has(id) ? id : 0; };     // MeOS skips the others

  const ctl = new Map();
  for (const c of list("ControlList", "Control")) {
    const id = once(ctl, c), d = kid(c, "oData");
    if (!id) continue;
    let nums = txt(c, "Numbers").split(/[;, ]+/).map(Number).filter((n) => n >= 1 && n <= 1023).slice(0, 32);
    if (!nums.length) nums = [int(txt(c, "Number")) || id];
    ctl.set(id, clean({ code: nums[0], any: nums.length > 1 ? nums.slice(1) : null, name: txt(c, "Name") || null, kind: CONTROL[int(txt(c, "Status"))],
      pts: int(txt(d, "Rogaining")) || null, radio: int(txt(d, "Radio")) === 1 ? true : null, timeAdjust: time(txt(d, "TimeAdjust")) || null,
      minTime: time(txt(d, "MinTime")) || null }));
  }
  const crs = new Map();
  for (const c of list("CourseList", "Course")) {
    const id = once(crs, c), d = kid(c, "oData");
    if (!id) continue;
    const ids = txt(c, "Controls").split(/[;, ]+/).filter(Boolean).map(int), limit = time(txt(d, "RTimeLimit")) || null;
    crs.set(id, { name: txt(c, "Name"), length: int(txt(c, "Length")) || null, climb: int(txt(d, "Climb")) || null,
      controls: ids.map((i) => ctl.get(i)?.code ?? i),
      ...clean({ limit, score: limit || int(txt(d, "RPointLimit")) || ids.some((i) => /^score/.test(ctl.get(i)?.kind)) ? true : null }) });
  }
  const cls = new Map();
  for (const c of list("ClassList", "Class")) {
    const id = once(cls, c), d = kid(c, "oData"), multi = txt(c, "MultiCourse");
    if (!id) continue;
    const legs = multi && multi !== "@" ? multi.split(";").map((leg) => leg.trim().split(/\s+/).map((i) => crs.get(int(i))?.name).filter(Boolean)) : [];
    const one = legs.length === 1 ? legs[0] : null;
    cls.set(id, { name: txt(c, "Name"), course: crs.get(int(txt(c, "Course")))?.name ?? (one?.length === 1 ? one[0] : null), ...clean({
      pool: one?.length > 1 ? one : null, legs: legs.length > 1 ? legs.map((l) => (l.length > 1 ? { pool: l } : { course: l[0] ?? null })) : null,
      first: day(time(txt(d, "FirstStart"))), step: time(txt(d, "StartInterval")) || null, fee: money(txt(d, "ClassFee")) }) });
  }
  const clubs = new Map();
  for (const c of list("ClubList", "Club")) {
    const id = once(clubs, c), d = kid(c, "oData"), ext = txt(d, "ExtId");
    if (id) clubs.set(id, { name: txt(c, "Name"), code: txt(d, "ShortName") || (int(ext) ? ext : null), ...clean({ nat: txt(d, "Nationality") || null }) });
  }

  const runners = [], reads = [], oracle = [], seen = new Set(), kept = new Map();       // kept: a runner's Id → their place in `runners`
  const readOf = (c, runnerKey, of = null) => {
    const r = { card: int(txt(c, "CardNo")), start: null, finish: null, check: null, punches: [], runnerKey, of };
    for (const p of punchList(txt(c, "Punches"), time)) {
      if (p.type === P_START) r.start = abs(p.t); else if (p.type === P_FINISH) r.finish = abs(p.t); else if (p.type === P_CHECK) r.check = abs(p.t);
      else if (p.type === P_RENTED) r.rent = 1; else r.punches.push([p.type, abs(p.t)]);
    }
    if (int(txt(c, "Voltage")) > 0) r.mv = int(txt(c, "Voltage"));
    reads.push(r);
    return r;
  };
  const runner = (r, parent) => {
    const id = int(txt(r, "Id")), d = kid(r, "oData"), card = kid(r, "Card"), cardNo = int(txt(r, "CardNo")) || null;
    if (id <= 0 || seen.has(id)) { if (card) readOf(card, null); return; }            // MeOS drops the runner, keeps the card
    seen.add(id);
    if (!cardNo && !card && VACANT.test(txt(r, "Name"))) { vacant++; return; }
    kept.set(id, runners.length);
    const key = `r${id}`, n = nameOf(txt(r, "Name")), club = clubs.get(int(txt(r, "Club"))), read = card ? readOf(card, key, runners.length) : null;
    const start = day(time(txt(r, "Start"))), finish = day(time(txt(r, "Finish"))), adj = time(txt(d, "TimeAdjust")) || null;
    const birth = txt(d, "BirthYear"), sex = txt(d, "Sex")[0] || "", ext = txt(d, "ExtId"), className = cls.get(int(txt(r, "Class")))?.name ?? null;
    const status = STATUS[int(txt(r, "Status"))] ?? null;
    if ((start ?? 0) % 1 || (finish ?? 0) % 1) ranked = true;
    runners.push({ key, family: n.family, given: n.given, club: club?.name ?? null, cls: className, card: cardNo, start, ...clean({
      clubCode: club?.code, bib: txt(d, "Bib") || null, birth: DATE.test(birth) ? birth : int(birth) || null,
      sex: /[FKW]/i.test(sex) ? "F" : /[MH]/i.test(sex) ? "M" : null, lic: int(ext) ? ext : null, nat: txt(d, "Nationality") || null,
      rent: int(txt(d, "CardFee")) || read?.rent ? 1 : null, fee: money(txt(d, "Fee")), paid: money(txt(d, "Paid")), adj,
      course: crs.get(int(txt(r, "Course")))?.name, startNo: int(txt(r, "StartNo")) || null, parent, status: BY_HAND.has(status) ? status : null }) });
    const from = start ?? read?.start ?? null;
    oracle.push({ key, family: n.family, given: n.given, card: cardNo, cls: className, status,
      time: from != null && finish != null ? Math.max(0, r2(finish - from + (adj || 0))) : null, start: from, finish, ...clean({ adj }) });
    for (const more of kids(r, "Runner")) runner(more, key);
  };
  for (const r of list("RunnerList", "Runner")) runner(r, null);
  for (const c of list("CardList", "Card")) readOf(c, null);

  const teams = list("TeamList", "Team").filter((t) => int(txt(t, "Id")) > 0).map((t) => clean({ name: txt(t, "Name"),
    club: clubs.get(int(txt(t, "Club")))?.name ?? null, cls: cls.get(int(txt(t, "Class")))?.name ?? null,
    bib: txt(t, "oData", "Bib") || null, start: day(time(txt(t, "Start"))), finish: day(time(txt(t, "Finish"))), status: STATUS[int(txt(t, "Status"))],
    runners: txt(t, "Runners").replace(/[;,]\s*$/, "").split(/[;,]/).filter((s, i, a) => a.length > 1 || s.trim() !== "")
      .map((i) => kept.get(int(i)) ?? null) }));
  const radio = list("PunchList", "Punch").map((p) => {
    const code = int(txt(p, "Type"));
    return clean({ code, card: int(txt(p, "CardNo")), s: abs(time(txt(p, "Time"))), kind: SPECIAL[code] });
  });

  const starts = runners.map((r) => r.start).filter((s) => s != null), date = txt(root, "Date");
  return { set: { event: { name: txt(root, "Name"), date: DATE.test(date) ? date : null, zero: starts.length ? least(starts) : zero + 3600, meosZero: zero,
    ...(ranked ? { tenths: true } : {}) },
  controls: [...ctl.values()], clubs: [...clubs.values()], courses: [...crs.values()], classes: [...cls.values()], runners, teams, reads, radio },
  oracle, info: { version: root.attrs.version || null, tenths, vacant } };
}

/** A read as it counts: the corrections made by hand applied (`ed`, or design.md's `edits`), its times moved by `off`. */
function cardOf(read, off = 0) {
  const ed = read.ed || {}, at = (s) => (s == null ? null : s + off);
  let p = (ed.punches || read.punches || []).map((q) => (Array.isArray(q) ? [q[0], q[1]] : [q.code, q.s ?? q.t]));
  if (!ed.punches && read.edits) { for (const e of read.edits) p[e[0]] = e[1] == null ? null : [e[1], e[2]]; p = Array.from(p).filter(Boolean); }
  return { card: read.card || 0, check: at(read.check), start: read.rel ? null : at(ed.start ?? read.start), finish: read.rel ? null : at(ed.finish ?? read.finish),
    punches: p.map(([code, s]) => [code, at(s)]) };
}

export function writeMeos(state, view) {
  const ev = state?.event || {}, vals = (o) => (Array.isArray(o) ? o : Object.values(o || {}));
  const verdict = new Map(), who = (r) => `${r.card || ""}|${r.family || ""}|${r.given || ""}`;
  for (const c of view?.classes || []) for (const r of c.rows || []) verdict.set(r.id != null ? `#${r.id}` : who(r), r);
  const runners = vals(state.runners), classes = vals(state.classes), courses = vals(state.courses), clubs = vals(state.clubs), radio = vals(state.radio);
  const reads = vals(state.reads).slice().sort((a, b) => (a.at || 0) - (b.at || 0)), own = new Map(), cards = new Map();
  for (const r of reads) if (r.runner && state.runners?.[r.runner]) own.set(String(r.runner), r);          // a runner's card: their latest read
  const people = runners.map((r) => {
    const v = verdict.get(`#${r.id}`) || verdict.get(who(r)), read = own.get(String(r.id)), off = read?.rel ? r.start ?? ev.zero ?? 0 : 0;
    if (read) cards.set(read, cardOf(read, off));
    const finish = v ? (v.finish != null ? v.finish + off : null) : cards.get(read)?.finish;
    return { r, read, start: read?.rel ? off : v?.start ?? r.start ?? null, finish: finish ?? null, status: v?.status ?? r.status };
  });
  for (const r of reads) if (!cards.has(r)) cards.set(r, cardOf(r, r.rel ? ev.zero ?? 0 : 0));

  // the zero time: an hour before the first start unless the event kept MeOS's own, and before every time written
  const starts = people.map((p) => p.start).filter((s) => s != null), all = [...starts, ...people.map((p) => p.finish), ...radio.map((p) => p.s),
    ...classes.map((c) => c.first), ...[...cards.values()].flatMap((c) => [c.start, c.finish, c.check, ...c.punches.map((p) => p[1])])].filter((s) => s != null);
  const first = Math.min(ev.zero ?? Infinity, least(starts));
  let zero = ev.meosZero ?? (Number.isFinite(first) ? first - 3600 : 0), tenths = false;
  if (least(all) <= zero) zero = least(all) - 60;
  zero = Math.max(0, Math.floor(zero));
  const T = (s) => { const t = meosTimeText(s - zero); if (t.includes(".") && t !== "-1.0") tenths = true; return t; };
  const el = (name, v) => (v == null || v === "" ? null : x(name, v));
  const data = (...fields) => { const f = fields.filter(Boolean); return f.length ? x("oData", f) : null; };
  const block = (name, items) => (items.length ? `<${name}>\n${items.join("\n")}\n</${name}>` : `<${name}/>`);
  const ids = (rows) => new Map(rows.map((r, i) => [String(r.id), i + 1]));

  // controls: MeOS's courses name them by Id — here the code itself; a control scores only where no ordinary course has it
  const score = new Set(), plain = new Set(), codes = new Map();
  for (const c of vals(state.controls)) codes.set(Number(c.code), c);
  for (const c of courses) for (const k of c.controls || []) { (c.score ? score : plain).add(Number(k)); if (!codes.has(Number(k))) codes.set(Number(k), { code: k }); }
  const controlEls = [...codes.entries()].sort((a, b) => a[0] - b[0]).map(([code, c]) => {
    const pts = c.pts && score.has(code) && !plain.has(code) ? c.pts : 0;
    return x("Control", [x("Id", code), x("Numbers", [code, ...(c.any || [])].join(";")), x("Status", pts ? 6 : 0),
      data(pts ? x("Rogaining", pts) : null, c.radio ? x("Radio", 1) : null)]);
  });

  const courseId = ids(courses), classId = ids(classes), clubId = ids(clubs), runnerId = ids(runners);
  const courseEls = courses.map((c) => x("Course", [x("Id", courseId.get(String(c.id))), x("Name", c.name || ""), x("Length", Math.round(c.length || 0)),
    x("Controls", (c.controls || []).map((k) => `${k};`).join("")),
    data(c.climb ? x("Climb", Math.round(c.climb)) : null, c.score && ev.score?.limit ? x("RTimeLimit", meosTimeText(ev.score.limit)) : null)]));
  const classEls = classes.map((c, i) => {
    const pool = (c.pool || []).map((id) => courseId.get(String(id))).filter(Boolean), course = courseId.get(String(c.course)) ?? (pool.length === 1 ? pool[0] : null);
    const many = pool.length > 1 && !course;                              // a pool: one leg of several courses, MeOS finds whose
    return x("Class", [x("Id", classId.get(String(c.id))), x("Name", c.name || ""), el("Course", course), many ? x("MultiCourse", pool.join(" ")) : null,
      data(x("SortIndex", (i + 1) * 10), c.first != null ? x("FirstStart", T(c.first)) : null, c.step ? x("StartInterval", meosTimeText(c.step)) : null,
        many ? x("HasPool", 1) : null)]);
  });
  const clubEls = clubs.map((c) => x("Club", [x("Id", clubId.get(String(c.id))), x("Name", c.name || ""), data(el("ShortName", c.code))]));

  let cardId = 0;
  const P = (type, s) => `${type}-${s == null ? -1 : T(s)};`;
  const card = (read) => {
    const c = cards.get(read);
    return x("Card", [x("CardNo", c.card), x("Punches", [c.check != null ? P(P_CHECK, c.check) : "", c.start != null ? P(P_START, c.start) : "",
      ...c.punches.map(([code, s]) => P(code, s)), c.finish != null ? P(P_FINISH, c.finish) : ""].join("")), x("Id", ++cardId)]);
  };
  const runnerEls = people.map(({ r, read, start, finish, status }) => {
    const sex = /^[MH]/i.test(r.sex || "") ? "M" : /^[FDWK]/i.test(r.sex || "") ? "F" : null;
    return x("Runner", [x("Id", runnerId.get(String(r.id))), x("Name", r.given ? `${r.family || ""}, ${r.given}` : r.family || ""),
      start != null ? x("Start", T(start)) : null, finish != null ? x("Finish", T(finish)) : null,
      x("Status", STATUS_OUT[status] ?? (status === "nc" ? (finish != null ? 15 : 99) : 0)), x("CardNo", r.card || read?.card || 0),
      /^\d+$/.test(String(r.bib ?? "")) ? x("StartNo", Number(r.bib)) : null, el("Club", clubId.get(String(r.club))), el("Class", classId.get(String(r.cls))),
      read ? card(read) : null,
      data(el("BirthYear", r.birth), el("Sex", sex), el("Bib", r.bib), /^\d{1,18}$/.test(String(r.lic ?? "")) ? x("ExtId", r.lic) : null, el("Nationality", r.nat),
        r.adj ? x("TimeAdjust", meosTimeText(r.adj)) : null)]);
  });
  const mine = new Set(own.values());
  const cardEls = reads.filter((r) => !mine.has(r)).map((r) => card(r));
  const punchEls = radio.map((p, i) => x("Punch", [x("CardNo", p.card || 0), x("Time", p.s == null ? -1 : T(p.s)), x("Type", p.code), x("Id", i + 1)]));

  return `${XML_HEAD}<meosdata version="${tenths ? "3.9" : "3.8"}">\n${[el("Name", ev.name), el("Date", ev.date), x("ZeroTime", meosTimeText(zero)),
    block("ControlList", controlEls), block("CourseList", courseEls), block("ClassList", classEls), block("ClubList", clubEls), block("RunnerList", runnerEls),
    block("TeamList", []), block("PunchList", punchEls), block("CardList", cardEls)].filter(Boolean).join("\n")}\n</meosdata>\n`;
}
