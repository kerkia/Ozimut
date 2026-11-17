// node tools/chrono/t_engine.mjs — the engine: log, times, model, judging, lists, draw. Invented runners only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { unwrap, normaliseRead, clock, span, parseClock, parseSpan } from "../../site/assets/js/chrono/times.js";
import { importSet, takeRead, assignRead, searchRunners, lookups } from "../../site/assets/js/chrono/model.js";
import { judge, match, guessCourse } from "../../site/assets/js/chrono/judge.js";
import { buildView, problems, toLive, exportView } from "../../site/assets/js/chrono/view.js";
import { draw, checkStarts, separate, rng } from "../../site/assets/js/chrono/draw.js";
import { rulesOf, packFor } from "../../site/assets/js/chrono/rules/index.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;

// ---- times
eq(unwrap({ t: H(1, 5), half: true }, H(12, 50)), H(13, 5), "12-hour time after noon");
eq(unwrap({ t: H(11, 59), half: true }, H(11, 30)), H(11, 59), "12-hour time before noon");
eq(unwrap({ t: H(0, 10) }, H(23, 50)), H(24, 10), "past midnight");
eq(clock(H(10, 42, 7)), "10:42:07", "clock");
eq(span(3735), "1:02:15", "span hours");
eq(span(2467), "41:07", "span minutes");
eq(parseClock("10h42"), H(10, 42), "parse 10h42");
eq(parseClock("10:42:07"), H(10, 42, 7), "parse clock");
eq(parseSpan("41:07"), 2467, "parse span");
eq(parseSpan("x"), null, "parse span junk");
const nr = normaliseRead({ card: 8001234, start: { t: H(10, 0), half: true }, finish: { t: H(0, 20), half: true }, check: { t: H(9, 50), half: true }, clear: null,
  punches: [{ code: 31, t: H(10, 5), half: true }, { code: 32, t: H(11, 58), half: true }, { code: 33, t: H(0, 2), half: true }] }, H(10, 0));
eq([nr.start, nr.punches.map((p) => p[1]), nr.finish], [H(10, 0), [H(10, 5), H(11, 58), H(12, 2)], H(12, 20)], "a card across noon");

// ---- log: two stations converge whatever the order of arrival
let now = 1_000_000;
const A = new Log("aaaaaa", [], () => now), B = new Log("bbbbbb", [], () => now);
A.add("ev", { p: { name: "Test", date: "2026-11-17", zero: H(10), startMode: "list" } }, "x");
A.add("put", { c: "runners", id: "r1", p: { family: "Durand", given: "Alix" } });
now += 5; B.add("put", { c: "runners", id: "r1", p: { given: "Alex", card: 12 } });
now += 5; A.add("put", { c: "runners", id: "r1", p: { card: 34 } });
now += 5; B.add("put", { c: "runners", id: "r2", p: { family: "Petit" } });
B.merge(A.since(B.have())); A.merge(B.since(A.have()));
eq(A.state, B.state, "two stations, same state");
eq(A.state.runners.r1, { id: "r1", family: "Durand", given: "Alex", card: 34 }, "last writer wins by field");
eq(A.since(B.have()).length, 0, "nothing left to send");
const C = new Log("cccccc", [...A.ops].reverse());
eq(C.state, A.state, "a log read in any order");
ok(A.merge(B.ops).length === 0, "an operation taken twice changes nothing");
B.add("put", { c: "runners", id: "r2", p: null });
A.merge(B.since(A.have()));
ok(!A.state.runners.r2, "a row deleted");

// ---- model: an import, twice
const L = new Log("s1", [], () => now);
const set = {
  event: { name: "Régionale test", date: "2026-11-17" },
  courses: [{ name: "A", length: 5200, climb: 150, controls: [31, 32, 33, 34] }, { name: "B", length: 3100, climb: 80, controls: [31, 35, 34] },
    { name: "Score", controls: [41, 42, 43, 44], score: true }],
  classes: [{ name: "H21", course: "A" }, { name: "D21", course: "B" }, { name: "H40", course: "B" }, { name: "Open", course: "Score" }],
  runners: [
    { family: "Martin", given: "Camille", club: "CO Test", clubCode: "9901", cls: "H21", card: 1001, lic: "100" },
    { family: "Bernard", given: "Lou", club: "CO Test", clubCode: "9901", cls: "H21", card: 1002, lic: "101" },
    { family: "Roux", given: "Sacha", club: "Balise 99", clubCode: "9902", cls: "H21", card: 1003 },
    { family: "Petit", given: "Noa", club: "Balise 99", clubCode: "9902", cls: "H21", card: 1004 },
    { family: "Moreau", given: "Élie", club: "Balise 99", clubCode: "9902", cls: "D21", card: 1005 },
    { family: "Simon", given: "Maé", club: "CO Test", clubCode: "9901", cls: "H40", card: 1006 },
    { family: "Leroy", given: "Yaël", club: "", cls: "Open", card: 1007 },
  ],
};
const did = importSet(L, set);
eq([did.clubs, did.courses, did.classes, did.added, did.updated], [2, 3, 4, 7, 0], "import counts");
const again = importSet(L, set);
eq([again.clubs, again.courses, again.classes, again.added, again.updated], [0, 0, 0, 0, 7], "import twice doubles nothing");
eq(Object.keys(L.state.runners).length, 7, "seven runners");
eq(Object.keys(L.state.controls).map(Number).sort((a, b) => a - b), [31, 32, 33, 34, 35, 41, 42, 43, 44], "controls from the courses");
eq(L.state.event.name, "Régionale test", "event named by the import");
const lk = lookups(L.state), R = (lic) => L.state.runners[lk.lic.get(lic)];
ok(searchRunners(L.state, "mart cam")[0]?.family === "Martin", "search by name parts");
ok(searchRunners(L.state, "1005")[0]?.family === "Moreau", "search by card");

// ---- draw
L.add("ev", { p: { zero: H(10), startMode: "list", close: H(13), rules: "fr" } });
const d = draw(L.state, { first: H(10), step: 120, by: "course", gap: 1, seed: 7 });
L.add("many", { rows: d.rows });
eq(checkStarts(L.state, { gap: 1 }).filter((x) => x.kind !== "club").length, 0, "every runner a start, none shared on a course");
const h21 = Object.values(L.state.runners).filter((r) => L.state.classes[r.cls].name === "H21").sort((a, b) => a.start - b.start);
ok(h21.every((r, i) => !i || r.club !== h21[i - 1].club), "clubs alternate on course A");
const same = draw(L.state, { first: H(10), step: 120, by: "course", gap: 1, seed: 7 });
eq(same.rows, d.rows, "the same seed, the same draw");
const sep = separate([..."aaaabbc"].map((c, i) => ({ id: i, club: c })), 1, rng(3));
ok(sep.every((r, i) => !i || r.club !== sep[i - 1].club), "separate: 4-2-1 without neighbours of one club");

// ---- reads and judging
const P = (codes, t0, step = 300) => codes.map((c, i) => ({ code: c, t: t0 + (i + 1) * step }));
const card = (n, start, codes, finish, extra = {}) => ({ sys: "si", card: n, start: null, finish: finish == null ? null : { t: finish }, check: { t: start - 300 }, clear: null,
  punches: P(codes, start), at: now++, ...extra });
const s = (lic) => R(lic).start;
const t1 = takeRead(L, card(1001, s("100"), [31, 32, 33, 34], s("100") + 1500));
ok(t1.runner === R("100").id && !t1.dup, "a card goes to its holder");
ok(takeRead(L, card(1001, s("100"), [31, 32, 33, 34], s("100") + 1500)).dup, "the same card read twice is one read");
takeRead(L, card(1002, s("101"), [31, 33, 34], s("101") + 1400));                         // 32 missing
const roux = Object.values(L.state.runners).find((r) => r.family === "Roux"), petit = Object.values(L.state.runners).find((r) => r.family === "Petit");
takeRead(L, card(1003, roux.start, [31, 99, 32, 33, 34], roux.start + 1800));             // an extra control
takeRead(L, card(1004, petit.start, [31, 32, 33, 34], null));                             // no finish
const moreau = Object.values(L.state.runners).find((r) => r.family === "Moreau"), simon = Object.values(L.state.runners).find((r) => r.family === "Simon");
takeRead(L, card(1005, moreau.start, [31, 35, 34], moreau.start + 1000));
takeRead(L, card(1006, simon.start, [31, 35, 34], simon.start + 1000));
const unknown = takeRead(L, card(4242, H(10, 30), [31, 35, 34], H(11)));
ok(!unknown.runner, "an unknown card is given to nobody");
eq(guessCourse(L.state, unknown.read)[0].name, "B", "an unknown card's course guessed");
eq(match(L.state, [31, 32, 31, 33], [[31, 1], [31, 2], [32, 3], [31, 4], [33, 5]]).at, [0, 2, 3, 4], "a control visited twice: the earliest fit");

let v = buildView(L.state, { now: H(12) });
const cls = (name) => v.classes.find((k) => k.name === name), row = (k, fam) => k.rows.find((r) => r.family === fam);
eq([row(cls("H21"), "Martin").status, row(cls("H21"), "Martin").time, row(cls("H21"), "Martin").place], ["ok", 1500, 1], "ok, timed, first");
eq([row(cls("H21"), "Bernard").status, row(cls("H21"), "Bernard").missing], ["mp", [32]], "a control missing");
eq([row(cls("H21"), "Roux").status, row(cls("H21"), "Roux").extra.map((p) => p[0]), row(cls("H21"), "Roux").place], ["ok", [99], 2], "an extra control does no harm");
eq(row(cls("H21"), "Petit").status, "dnf", "no finish");
eq(cls("H21").rows.map((r) => r.status), ["ok", "ok", "mp", "dnf"], "the list's order");
eq(row(cls("H21"), "Martin").splits.map((x) => [x.code, x.t, x.leg, x.p]), [[31, 300, 300, 1], [32, 600, 300, 1], [33, 900, 300, 2], [34, 1200, 300, 2]], "splits and places (Bernard, who skipped 32, is ahead at 33)");
const B_ = v.courses.find((c) => c.name === "B");
eq(B_.rows.map((r) => [r.family, r.place]).sort(), [["Moreau", 1], ["Simon", 1]], "equal times share a place, classes merged on a course");
eq(row(cls("Open"), "Leroy").status, "run", "started, no card yet: out");
let pb = problems(L.state, v, { now: H(12) });
eq(pb.filter((p) => p.level === "stop").map((p) => p.kind).sort(), ["nofinish", "unknown"], "what stops");
ok(pb.some((p) => p.kind === "mp"), "a missing punch waits to be checked");

// give the unknown card to nobody, a status by hand, a corrected punch, the closing time
assignRead(L, unknown.read.id, 0);
L.add("put", { c: "runners", id: petit.id, p: { status: "dnf" } });
const bern = R("101"), br = Object.values(L.state.reads).find((x) => x.runner === bern.id);
L.add("edit", { id: br.id, e: { punches: [[31, bern.start + 300], [32, bern.start + 500], [33, bern.start + 600], [34, bern.start + 900]] } }, "referee");
v = buildView(L.state, { now: H(13, 30) });
eq([row(cls("H21"), "Bernard").status, row(cls("H21"), "Bernard").place], ["ok", 1], "a punch added by hand: classified");
pb = problems(L.state, v, { now: H(13, 30) });
eq(pb.filter((p) => p.level === "stop").map((p) => p.kind), ["out"], "after closing: who is still out");
L.add("edit", { id: br.id, e: null });
ok(buildView(L.state).byRunner.get(bern.id).status === "mp", "the correction undone");

// over time by the closing hour
const late = takeRead(L, card(1007, H(10), [41, 43, 41, 42], H(13, 5)));
v = buildView(L.state, { now: H(13, 30) });
eq(row(cls("Open"), "Leroy").status, "ot", "back after the closing time");
L.add("ev", { p: { close: null, score: { limit: 3600, penalty: 2, per: 60 } } });
L.add("put", { c: "controls", id: "43", p: { pts: 5 } });
v = buildView(L.state);
eq([row(cls("Open"), "Leroy").points, row(cls("Open"), "Leroy").gross, row(cls("Open"), "Leroy").penalty], [0, 7, 250], "score: points less the penalty, never under 0");
L.add("ev", { p: { score: { limit: 4 * 3600, penalty: 2, per: 60 } } });
eq(buildView(L.state).byRunner.get(late.runner).points, 7, "score: each control once, its own points");

// start by punch and mass start
const S = new Log("s2", [], () => now);
importSet(S, { courses: [{ name: "A", controls: [31, 32] }], classes: [{ name: "X", course: "A" }], runners: [{ family: "Un", given: "A", cls: "X", card: 1 }, { family: "Deux", given: "B", cls: "X", card: 2 }] });
S.add("ev", { p: { startMode: "punch", zero: H(9) } });
takeRead(S, { card: 1, start: { t: H(9, 3) }, finish: { t: H(9, 33) }, punches: [{ code: 31, t: H(9, 10) }, { code: 32, t: H(9, 20) }], at: 1 });
takeRead(S, { card: 2, start: null, finish: { t: H(9, 40) }, punches: [{ code: 31, t: H(9, 10) }, { code: 32, t: H(9, 20) }], at: 2 });
let sv = buildView(S.state);
eq(sv.classes[0].rows.map((r) => [r.family, r.time]), [["Un", 1800], ["Deux", null]], "start punch: the card's own start");
ok(problems(S.state, sv).some((p) => p.kind === "nostart"), "no start punch: a problem");
S.add("ev", { p: { startMode: "mass" } });
sv = buildView(S.state);
eq(sv.classes[0].rows.map((r) => [r.family, r.time, r.place]), [["Un", 1980, 1], ["Deux", 2400, 2]], "mass start: from the first start");

// a forked class: the course the card fits
const F = new Log("s3", [], () => now);
importSet(F, { courses: [{ name: "AB", controls: [31, 32, 34] }, { name: "BA", controls: [31, 33, 34] }], classes: [{ name: "Relais", pool: ["AB", "BA"] }],
  runners: [{ family: "Fourche", given: "Z", cls: "Relais", card: 9, start: H(10) }] });
takeRead(F, { card: 9, start: null, finish: { t: H(10, 20) }, punches: [{ code: 31, t: H(10, 5) }, { code: 33, t: H(10, 10) }, { code: 34, t: H(10, 15) }], at: 3 });
const fr = [...buildView(F.state).byRunner.values()][0];
eq([fr.status, F.state.courses[fr.course].name], ["ok", "BA"], "forks: the variant run");

// a relay of two legs: the second starts when the first comes in
const Y = new Log("s4", [], () => now);
importSet(Y, { courses: [{ name: "L1", controls: [31] }, { name: "L2", controls: [32] }], classes: [{ name: "Relais", legs: [{ course: "L1" }, { course: "L2" }], first: H(10) }],
  runners: [{ family: "A", given: "a", cls: "Relais", card: 21 }, { family: "B", given: "b", cls: "Relais", card: 22 }, { family: "C", given: "c", cls: "Relais", card: 23 }, { family: "D", given: "d", cls: "Relais", card: 24 }],
  teams: [{ name: "Équipe 1", cls: "Relais", bib: 1, runners: [0, 1] }, { name: "Équipe 2", cls: "Relais", bib: 2, runners: [2, 3] }] });
Y.add("ev", { p: { zero: H(10), type: "relay" } });
const rd = (c, code, t, f) => takeRead(Y, { card: c, start: null, finish: { t: f }, punches: [{ code, t }], at: now++ });
rd(21, 31, H(10, 10), H(10, 20)); rd(22, 32, H(10, 30), H(10, 45)); rd(23, 31, H(10, 10), H(10, 18));
const yv = buildView(Y.state, { now: H(11) }), tms = yv.classes[0].teams;
eq(tms.map((x) => [x.name, x.status, x.time, x.place]), [["Équipe 1", "ok", 2700, 1], ["Équipe 2", "run", null, null]], "relay teams");
eq(yv.classes[0].teams[0].legs.map((r) => r.time), [1200, 1500], "leg times: the handover is the start");

// ---- the live form and the export view
v = buildView(L.state, { now: H(12) });
const live = toLive(v, "course");
eq(live.order, ["A", "B", "Score"], "live: by course");
eq(live.classes.A.controls, [["31", "1"], ["32", "2"], ["33", "3"], ["34", "4"]], "live: controls");
const lm = live.classes.A.rows.find((r) => r[1] === "Camille Martin");
eq([lm[0], lm[3], lm[4], lm[5], lm[8][0]], [1, 150000, 0, 0, [30000, 1, 0]], "live: a row in hundredths");
const xv = exportView(v, "class");
ok(xv.classes.find((k) => k.name === "H21").rows[0].splits.length === 4 && xv.classes.every((k) => k.rows.length), "export view by class");

// ---- rules
eq([packFor("FR").catOf(2012, "D", 2026), packFor("FR").catOf(1990, "H", 2026), packFor("FR").catOf(1984, "F", 2026), packFor("FR").catOf(1930, "H", 2026)], ["D14", "H35", "D40", "H80"], "FFCO categories");
eq([packFor("CA").catOf(2008, "F", 2026), packFor("CA").catOf(1975, "M", 2026)], ["F17-20", "M45+"], "Canada's classes");
eq(rulesOf({ event: { country: "CH" } }).id, "iof", "a country without a pack: the neutral one");

console.log(fails ? `${fails} of ${n} checks failed` : `engine: ${n} checks passed`);
process.exit(fails ? 1 : 0);
