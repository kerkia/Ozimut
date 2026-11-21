// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// MeOS's online results (MOP, « MeOS Online Protocol » 2.0) written by Chrono: what MeOS's « Online results » service posts
// to a live results server — the whole race (<MOPComplete>), then what changed (<MOPDiff>). Written from the protocol as
// MeOS emits it and as ozimut.com's live results read it (docs/meos.md); none of MeOS's code.
//   <competition date organizer homepage zerotime>name</competition>
//   <ctrl id>name</ctrl>                          a radio control
//   <cls id ord radio="31,32">name</cls>          a class and its radio controls (« ; » between a relay's legs)
//   <org id>name</org>                            a club
//   <cmp id card competing="true">                a runner
//     <base org cls stat st rt bib prel="true">Given Family</base>     st, rt: tenths of a second; st after midnight, -1 none
//     <radio>31,1234;32,2345</radio>              running time at each radio control, tenths
//     <input it tstat/>                           earlier stages: none here
//   <tm id><base …>name</base><r>12;13,14;0</r></tm>     a relay team: its runners by leg
// In a diff `<cmp id delete="true"/>` (org, tm alike) takes one away; a class or a radio control gone is not said that way:
// as MeOS does, the whole race is sent again.
//
// What the view must carry beyond docs/design.md:
//   row.id       the runner's id — the <cmp> number comes from it (without it: the card and the name, which may change)
//   row.radio    [{ code, t }] — t in seconds since the runner's start, in the order passed — the passings to send
//   row.clubId   (optional) the club's id; else the club's code, else its name, gives the <org> number
//   row.prel     (optional) true: a finish not yet confirmed by the card
//   cls.teams    (optional) [{ id, name, club, clubCode, clubId, bib, status, start, time, runners: [id | [ids] | null] }]
//                — or view.js's own teams, whose `legs` are the runners' rows
// view.js's buildView gives all of it but `radio`; its exportView drops `id` and `clubId` (to be added there).
//   event.club / organizer, event.homepage (optional)
// Numbers are stable from one call to the next: an id made of digits is its own number, any other a 30-bit hash of it.

import { x, XML_HEAD } from "../xml.js";

const NS = "http://www.melin.nu/mop";
const STAT = { ok: 1, mp: 3, dnf: 4, dsq: 5, ot: 6, dns: 20, nc: 99 };      // anything else (run, wait): 0, unknown
const REPEAT = 100000;                             // a control passed again on a course: its code + 100000 a time
const KINDS = ["ctrl", "cls", "org", "tm", "cmp"];

/** The number MOP gets for an id: itself when it is 1 to 9 digits, else a hash in 2^30 … 2^31 - 1. */
export function mopNum(id) {
  const s = String(id ?? "");
  if (/^[1-9]\d{0,8}$/.test(s)) return Number(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return 0x40000000 + (h >>> 2);
}
/** key → number; two keys hashed alike are told apart in the keys' order. */
function numbering(keys) {
  const out = new Map(), used = new Set();
  for (const k of [...new Set(keys.map(String))].sort()) {
    let n = mopNum(k);
    while (used.has(n)) n = n >= 0x7fffffff ? 0x40000000 : n + 1;
    used.add(n);
    out.set(k, n);
  }
  return out;
}

const tenths = (s) => Math.round(s * 10);
const clock = (s) => [s / 3600, (s / 60) % 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, "0")).join(":");
const rowKey = (r) => String(r.id ?? `c${r.card || ""}|${r.family || ""}|${r.given || ""}`);
const clubKey = (r) => { const k = r.clubId ?? (r.clubCode || r.club); return k == null || k === "" ? null : String(k); };
/** [{ code, t }] → [{ id, code, n, t }]: the n-th passing at a code is the control's n-th visit. */
function passes(list) {
  const seen = new Map();
  return (list || []).map((p) => {
    const code = Number(p.code), n = (seen.get(code) || 0) + 1;
    seen.set(code, n);
    return { id: code + REPEAT * (n - 1), code, n, t: p.t };
  });
}

/** A class's radio controls, in the course's order: all of the course, those asked for, or those its runners carry. */
function slots(c, want, source) {
  const course = passes((c.course?.controls || []).map((code) => ({ code })));
  if (want === "all") return course;
  const ids = new Set();
  if (Array.isArray(want)) {
    const codes = new Set(want.map(Number));
    for (const s of course) if (codes.has(s.code)) ids.add(s.id);
    if (!course.length) for (const p of passes(want.map((code) => ({ code })))) ids.add(p.id);
  } else for (const r of c.rows || []) for (const p of passes(source(r))) ids.add(p.id);
  const known = new Set(course.map((s) => s.id));
  return [...course.filter((s) => ids.has(s.id)),
    ...[...ids].filter((id) => !known.has(id)).sort((a, b) => a - b).map((id) => ({ id, code: id % REPEAT, n: Math.floor(id / REPEAT) + 1 }))];
}

/** The view as MOP's elements, each kind by number. */
function model(view, opt = {}) {
  const ev = view?.event || {}, classes = view?.classes || [];
  const source = (r) => r.radio || (opt.radio === "all" ? r.splits : null);
  const m = { comp: x("competition", { date: /^\d{4}-\d\d-\d\d$/.test(ev.date || "") ? ev.date : null, organizer: ev.organizer || ev.club || "",
    homepage: ev.homepage || "", zerotime: ev.zero != null ? clock(ev.zero) : null }, ev.name || ""), ctrl: new Map(), cls: new Map(), org: new Map(),
  tm: new Map(), cmp: new Map() };
  const people = classes.flatMap((c) => [...(c.rows || []), ...(c.teams || [])]);
  const num = { cls: numbering(classes.map((c) => c.id)), org: numbering(people.map(clubKey).filter((k) => k != null)),
    cmp: numbering(classes.flatMap((c) => (c.rows || []).map(rowKey))), tm: numbering(classes.flatMap((c) => (c.teams || []).map((t) => t.id))) };
  const base = (p, cls, name) => {
    const club = clubKey(p), stat = STAT[p.status] ?? 0;
    if (club != null) m.org.set(num.org.get(club), x("org", { id: num.org.get(club) }, p.club || p.clubCode || ""));
    return [stat, x("base", { org: club != null ? num.org.get(club) : 0, cls, stat, prel: p.prel ? "true" : null,
      st: p.start != null ? tenths(p.start) : -1, rt: stat && stat !== 20 && p.time > 0 ? tenths(p.time) : 0, bib: p.bib != null && p.bib !== "" ? p.bib : null,
      nat: p.nat || null }, name)];
  };
  classes.forEach((c, i) => {
    const cls = num.cls.get(String(c.id)), radio = slots(c, opt.radio, source), have = new Set(radio.map((s) => s.id));
    for (const s of radio) m.ctrl.set(s.id, x("ctrl", { id: s.id }, s.n > 1 ? `${s.code}-${s.n}` : String(s.code)));
    m.cls.set(cls, x("cls", { id: cls, ord: (i + 1) * 10, radio: radio.map((s) => s.id).join(",") }, c.name || ""));
    for (const r of c.rows || []) {
      const id = num.cmp.get(rowKey(r)), [stat, b] = base(r, cls, [r.given, r.family].filter(Boolean).join(" "));
      const times = passes(source(r)).filter((p) => p.t > 0 && have.has(p.id)).map((p) => `${p.id},${tenths(p.t)}`).join(";");
      m.cmp.set(id, x("cmp", { id, card: r.card || 0, competing: r.status === "run" ? "true" : null },
        [b, times ? x("radio", times) : null, x("input", { it: 0, tstat: stat })]));
    }
    for (const t of c.teams || []) {
      const id = num.tm.get(String(t.id)), [, b] = base(t, cls, t.name || "");
      const legs = (t.runners || (t.legs || []).map((r) => r?.id ?? null))
        .map((leg) => (Array.isArray(leg) ? leg : [leg]).map((r) => (r == null ? 0 : num.cmp.get(String(r)) ?? 0)).join(","));
      m.tm.set(id, x("tm", { id }, [b, x("r", legs.join(";"))]));
    }
  });
  return m;
}

const doc = (root, parts) => `${XML_HEAD}<${root} xmlns="${NS}">\n${parts.map((p) => `${p}\n`).join("")}</${root}>\n`;
const whole = (m) => doc("MOPComplete", [m.comp, ...KINDS.flatMap((k) => [...m[k].values()])]);

/**
 * The whole race. `radio`: the radio controls to declare — a list of codes, "all" (every control of each course; a row
 * without `radio` then sends its `splits`, as MeOS's « send all punches after readout »), or nothing: those the rows carry.
 */
export function mopComplete(view, opt) {
  return whole(model(view, opt));
}

/**
 * What changed from one view to the next (same options as the whole race's): elements gone, then those new or changed,
 * each written whole. No earlier view, or a class or radio control gone: the whole race.
 */
export function mopDiff(prev, view, opt) {
  const b = model(view, opt);
  if (!prev) return whole(b);
  const a = model(prev, opt), out = [];
  if (["ctrl", "cls"].some((k) => [...a[k].keys()].some((id) => !b[k].has(id)))) return whole(b);
  for (const k of ["org", "tm", "cmp"]) for (const id of a[k].keys()) if (!b[k].has(id)) out.push(x(k, { id, delete: "true" }));
  if (a.comp !== b.comp) out.push(b.comp);
  for (const k of KINDS) for (const [id, el] of b[k]) if (a[k].get(id) !== el) out.push(el);
  return doc("MOPDiff", out);
}
