// node tools/chrono/t_mop_live.mjs — the MOP documents Chrono writes (io/mop.js), read by the live relay's reader
// (live/src/mop.js): the whole race, a diff where a runner finishes, a runner removed, as « En direct » shows them.
// The relay is not open source: these checks stay here, the open repository checks the XML itself. Invented names only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { importSet } from "../../site/assets/js/chrono/model.js";
import { buildView } from "../../site/assets/js/chrono/view.js";
import { mopComplete, mopDiff, mopNum } from "../../site/assets/js/chrono/io/mop.js";
import { parseXml as liveXml, apply, emptyHead, emptyClass, compactClass } from "../../live/src/mop.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) fails++; console.log(cond ? "ok  " : "FAIL", what); };
const eq = (a, b, what) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? what : `${what}: ${x} != ${y}`); };
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
let now = 1;

// ---- a made-up event: 2 courses, 3 classes, 8 runners (as test/t_meos.mjs of the open repository)
const START = { Alder: H(10), Birch: H(10, 2), Cedar: H(10), Dorn: H(10, 2), Elm: H(10), Fenn: H(10, 2), Gale: H(10, 4), Holt: H(10, 4) };
const SET = {
  event: { name: "Chrono & MeOS <test>", date: "2026-11-21", zero: H(10) },
  controls: [{ code: 32, any: [132] }, { code: 33, radio: true }],
  clubs: [{ name: "Northwood OK", code: "NOK" }, { name: "Riverbend Orienteers", code: "RBO" }],
  courses: [{ name: "Long", length: 5200, climb: 180, controls: [31, 32, 33, 34, 35] }, { name: "Short", length: 2900, climb: 90, controls: [31, 36, 35] }],
  classes: [{ name: "M21", course: "Long", first: H(10), step: 120 }, { name: "W21", course: "Long" }, { name: "Open", course: "Short" }],
  runners: [
    { family: "Alder", given: "Marek", club: "Northwood OK", clubCode: "NOK", cls: "M21", card: 500001, start: START.Alder, sex: "M", birth: 1990, bib: "1", lic: "70001" },
    { family: "Birch", given: "Tomas", club: "Riverbend Orienteers", clubCode: "RBO", cls: "M21", card: 500002, start: START.Birch, sex: "M", birth: 1996, bib: "2" },
    { family: "Cedar", given: "Iris", club: "Northwood OK", clubCode: "NOK", cls: "W21", card: 500003, start: START.Cedar, sex: "F", birth: 1999, bib: "3" },
    { family: "Dorn", given: "Lena", club: "Riverbend Orienteers", clubCode: "RBO", cls: "W21", card: 500004, start: START.Dorn, sex: "F", birth: 2001, bib: "4" },
    { family: "Elm", given: "Otto", club: "Northwood OK", clubCode: "NOK", cls: "Open", card: 500005, start: START.Elm, sex: "M", birth: 1975, bib: "5", status: "dns" },
    { family: "Fenn", given: "Ada", club: "Riverbend Orienteers", clubCode: "RBO", cls: "Open", card: 500006, start: START.Fenn, sex: "F", birth: 1984, bib: "6" },
    { family: "Gale", given: "Nils", club: "Northwood OK", clubCode: "NOK", cls: "M21", card: 500007, start: START.Gale, sex: "M", birth: 1993, bib: "7" },
    { family: "Holt", given: "Vera", club: "Riverbend Orienteers", clubCode: "RBO", cls: "Open", card: 500008, start: START.Holt, sex: "F", birth: 2008, bib: "8", status: "nc" },
  ],
};
const rd = (of, card, start, codes, t, fin) => ({ of, card, at: now++, check: start - 300, start: null, finish: fin == null ? null : start + fin,
  punches: codes.map((c, i) => [c, start + t[i]]) });
SET.reads = [
  rd(0, 500001, START.Alder, [31, 32, 33, 34, 35], [300, 700, 900, 1500, 1900], 2000),
  rd(1, 500002, START.Birch, [31, 132, 33, 34, 35], [320, 760, 1000, 1600, 2050], 2160),
  rd(2, 500003, START.Cedar, [31, 32, 34, 35], [400, 900, 1700, 2200], 2300),
  rd(3, 500004, START.Dorn, [31, 32, 33], [450, 1000, 1400], null),
  rd(5, 500006, START.Fenn, [31, 36, 35], [500, 1100, 1500], 1600),
  rd(7, 500008, START.Holt, [31, 36, 35], [600, 1300, 1800], 1950),
  rd(null, 999001, H(10, 30), [31, 36], [200, 500], 900),
];
const L = new Log("meos", [], () => now++);
importSet(L, JSON.parse(JSON.stringify(SET)));
L.add("punch", { p: { code: 33, card: 500007, s: H(10, 20), at: 1, src: "test" } });
const withRadio = (v) => {
  for (const r of v.byRunner.values()) { if (r.family === "Alder") r.radio = [{ code: 33, t: 900 }]; if (r.family === "Gale") r.radio = [{ code: 33, t: 960 }]; }
  return v;
};
const view = withRadio(buildView(L.state, { now: H(11) })), xml = mopComplete(view);

// the relay's reader takes the whole race
const head = emptyHead(), store = {}, getCls = async (id) => store[id] || (store[id] = emptyClass());
const fold = async (text) => { const r = await apply(liveXml(text), head, getCls); for (const id of r.touched) head.cnt[id] = Object.keys(store[id]?.r || {}).length; return r; };
const done = await fold(xml), m21 = String(mopNum(view.classes.find((c) => c.name === "M21").id));
eq([done.runners, head.comp.name, head.comp.date, Object.keys(head.cls).length, Object.keys(head.org).length], [8, SET.event.name, "2026-11-21", 3, 2], "live/src/mop.js applies it: 8 runners, 3 classes, 2 clubs");
const live = () => compactClass(head, m21, store[m21]), row = (c, name) => c.rows.find((r) => r[1] === name);
eq(live().controls, [["33", "33"]], "live page: the class's radio control");
eq(row(live(), "Marek Alder"), [1, "Marek Alder", "Northwood OK", 200000, 0, 0, null, 3600000, [[90000, 1, 0]], 0], "live page: the winner's row, in hundredths");
eq([row(live(), "Tomas Birch").slice(0, 6), row(live(), "Nils Gale").slice(3, 5), row(live(), "Nils Gale")[8]], [[2, "Tomas Birch", "Riverbend Orienteers", 216000, 0, 16000], [null, 9], [[96000, 2, 6000]]],
  "live page: second place and gap; a runner out, with a radio time");

// a diff: one runner finishes
const gale = Object.values(L.state.runners).find((r) => r.family === "Gale");
L.add("read", { r: { id: "galeread1", card: 500007, sys: "si", at: now++, check: null, start: null, finish: START.Gale + 1890, runner: gale.id,
  punches: [31, 32, 33, 34, 35].map((c, i) => [c, START.Gale + [280, 640, 960, 1400, 1800][i]]) } });
const viewB = withRadio(buildView(L.state, { now: H(11) }));
await fold(mopDiff(view, viewB));
eq(live().rows.filter((r) => r[4] === 0).map((r) => [r[0], r[1], r[3]]).sort((x, y) => x[0] - y[0]), [[1, "Nils Gale", 189000], [2, "Marek Alder", 200000], [3, "Tomas Birch", 216000]], "the reader after the diff: a new leader");

// one goes
L.add("put", { c: "runners", id: gale.id, p: null });
const viewC = withRadio(buildView(L.state, { now: H(11) }));
await fold(mopDiff(viewB, viewC));
eq(live().rows.length, 2, "the reader drops them");

console.log(`${n} checks, ${fails} failed`);
if (fails) process.exit(1);
