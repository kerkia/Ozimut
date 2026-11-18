// node tools/chrono/t_formats.mjs — the race formats beyond one individual race: relay restarts, pairs and patrols,
// knockout rounds, totals over several days and the chase start. Invented runners only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { importSet, takeRead } from "../../site/assets/js/chrono/model.js";
import { buildView, problems, exportView } from "../../site/assets/js/chrono/view.js";
import { writeResults } from "../../site/assets/js/chrono/io/iofxml.js";
import { draw, checkStarts } from "../../site/assets/js/chrono/draw.js";
import { snake, planRound, qualified, koTree, koRanking, dropRound } from "../../site/assets/js/chrono/knockout.js";
import { stageOf, stageFromSet, stagesOf, totals, chaseStarts, personKey } from "../../site/assets/js/chrono/series.js";

let fails = 0, n = 0, now = 1e12;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
const read = (log, card, punches, finish, start = null) => takeRead(log, { card, start: start == null ? null : { t: start }, finish: finish == null ? null : { t: finish }, punches: punches.map(([code, t]) => ({ code, t })), at: now++ });

const P_EMPTY = new Log("p0", [], () => now++);
importSet(P_EMPTY, { courses: [{ name: "A", controls: [31] }], classes: [{ name: "Duo", course: "A", team: { size: 2 } }], runners: [{ family: "A", given: "a", cls: "Duo" }, { family: "B", given: "b", cls: "Duo" }], teams: [{ name: "T", cls: "Duo", runners: [0, 1] }] });

// ---- a relay of three legs, the late teams' last leg sent off together at 11:00
const R = new Log("r1", [], () => now++);
importSet(R, { courses: [{ name: "L1", controls: [31] }, { name: "L2", controls: [32] }, { name: "L3", controls: [33] }],
  classes: [{ name: "Relais", legs: [{ course: "L1" }, { course: "L2" }, { course: "L3", mass: H(11) }], first: H(10) }],
  runners: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ family: `R${i}`, given: "x", cls: "Relais", card: 100 + i })),
  teams: [{ name: "Vite", cls: "Relais", bib: 1, runners: [0, 1, 2] }, { name: "Lent", cls: "Relais", bib: 2, runners: [3, 4, 5] }, { name: "Encore", cls: "Relais", bib: 3, runners: [6, 7, 8] }] });
R.add("ev", { p: { zero: H(10), type: "relay" } });
// Vite: handovers at 10:20 and 10:45, in at 11:10 (the third leg left at its handover, before the mass start)
read(R, 101, [[31, H(10, 10)]], H(10, 20)); read(R, 102, [[32, H(10, 30)]], H(10, 45)); read(R, 103, [[33, H(11)]], H(11, 10));
// Lent: second leg in at 11:20, after the third leg was sent off at 11:00; third leg in at 11:40
read(R, 104, [[31, H(10, 20)]], H(10, 40)); read(R, 105, [[32, H(11)]], H(11, 20)); read(R, 106, [[33, H(11, 20)]], H(11, 40));
// Encore: second leg still out
read(R, 107, [[31, H(10, 15)]], H(10, 30));
let v = buildView(R.state, { now: H(11, 5) });
let tm = v.classes[0].teams;
eq(tm.map((x) => [x.name, x.status, x.time, x.place, !!x.restart]), [["Vite", "ok", 4200, 1, false], ["Lent", "ok", 7200, 2, true], ["Encore", "run", null, null, true]], "relay: the restarted team after the others");
eq(tm[1].legs.map((r) => [r.start, r.time, r.restart]), [[H(10), 2400, false], [H(10, 40), 2400, false], [H(11), 2400, true]], "relay: the leg sent off with the late teams starts at the mass time");
eq(v.byRunner.get(tm[2].legs[2].id).status, "run", "relay: a leg sent off is out though its handover never came");
eq(buildView(R.state, { now: H(10, 50) }).byRunner.get(tm[2].legs[2].id).status, "wait", "relay: before the mass start it waits");
// a fast restarted team never passes a team that was not
const R2 = new Log("r2", R.ops, () => now++);
read(R2, 108, [[32, H(10, 40)]], H(11, 1)); read(R2, 109, [[33, H(11, 2)]], H(11, 3));
tm = buildView(R2.state, { now: H(12) }).classes[0].teams;
eq(tm.map((x) => [x.name, x.place, x.time]), [["Vite", 1, 4200], ["Encore", 2, 3840], ["Lent", 3, 7200]], "relay: restarted teams ranked among themselves, behind");
// a handover before the mass time is a handover
eq(buildView(R.state, { now: H(12) }).classes[0].teams[0].legs[2].start, H(10, 45), "relay: the handover before the mass start counts");
// the relay written as IOF XML: teams, their legs, the team's place on the last leg
const rx = writeResults(exportView(buildView(R2.state, { now: H(12) }), "class"));
eq([(rx.match(/<TeamResult>/g) || []).length, (rx.match(/<TeamMemberResult>/g) || []).length, (rx.match(/<PersonResult>/g) || []).length], [3, 9, 0], "relay export: team results, no person results");
ok(/<TeamResult><Name>Vite<\/Name>.*?<Leg>3<\/Leg>.*?<OverallResult><Time>4200<\/Time>.*?<Position>1<\/Position><Status>OK<\/Status><\/OverallResult>/s.test(rx.replace(/>\s+</g, "><")), "relay export: the last leg carries the team's time and place");
ok(!exportView(buildView(P_EMPTY.state), "class").classes.some((k) => k.teams), "export: only relay classes carry teams");
// the first leg's own mass start
const R3 = new Log("r3", [], () => now++);
importSet(R3, { courses: [{ name: "L1", controls: [31] }], classes: [{ name: "Rel", legs: [{ course: "L1", mass: H(9, 30) }, { course: "L1" }] }], runners: [{ family: "A", given: "a", cls: "Rel", card: 1 }, { family: "B", given: "b", cls: "Rel", card: 2 }], teams: [{ name: "T", cls: "Rel", runners: [0, 1] }] });
read(R3, 1, [[31, H(9, 40)]], H(9, 50));
eq(buildView(R3.state).classes[0].teams[0].legs[0].time, 1200, "relay: the first leg's start time");

// ---- pairs: both members' cards, the team's time is the slower one's
const P = new Log("p1", [], () => now++);
importSet(P, { courses: [{ name: "A", controls: [31, 32] }], classes: [{ name: "Duo", course: "A", team: { size: 2 } }, { name: "Solo", course: "A" }],
  runners: [["Un", 201], ["Deux", 202], ["Trois", 203], ["Quatre", 204], ["Cinq", 205], ["Six", 206]].map(([family, card]) => ({ family, given: "x", cls: "Duo", club: "Club", card })).concat([{ family: "Seul", given: "x", cls: "Solo", club: "Club", card: 207 }]),
  teams: [{ name: "Les uns", cls: "Duo", bib: 1, runners: [0, 1] }, { name: "Les trois", cls: "Duo", bib: 2, runners: [2, 3] }, { name: "Les cinq", cls: "Duo", bib: 3, runners: [4, 5] }] });
P.add("ev", { p: { zero: H(10) } });
const d = draw(P.state, { first: H(10), step: 120, by: "class", seed: 7 });
P.add("many", { rows: d.rows });
const ps = P.state, teamOf = (name) => Object.values(ps.teams).find((t) => t.name === name);
ok(Object.values(ps.teams).every((t) => ps.runners[t.runners[0]].start === ps.runners[t.runners[1]].start), "pairs: the two leave together");
eq(new Set(Object.values(ps.teams).map((t) => ps.runners[t.runners[0]].start)).size, 3, "pairs: each pair its own minute");
eq(checkStarts(ps, { gap: 1 }).filter((b) => b.kind === "same").length, 0, "pairs: two team-mates on one minute are no fault");
const s1 = ps.runners[teamOf("Les uns").runners[0]].start, s3 = ps.runners[teamOf("Les trois").runners[0]].start;
read(P, 201, [[31, s1 + 300], [32, s1 + 600]], s1 + 900); read(P, 202, [[31, s1 + 310], [32, s1 + 620]], s1 + 960);
read(P, 203, [[31, s3 + 200], [32, s3 + 400]], s3 + 700); read(P, 204, [[31, s3 + 200]], s3 + 720);
v = buildView(P.state, { now: H(12) });
const duo = v.classes.find((k) => k.name === "Duo");
eq(duo.teams.map((x) => [x.name, x.status, x.time, x.place]), [["Les uns", "ok", 960, 1], ["Les trois", "mp", null, null], ["Les cinq", "run", null, null]], "pairs: the slower member's time; a missing control takes the pair");
eq(duo.teams[0].kind, "group", "pairs: the team's kind");
ok(!v.classes.find((k) => k.name === "Solo").teams, "pairs: other classes have no teams");
// a patrol of three where two count
const Q = new Log("p2", [], () => now++);
importSet(Q, { courses: [{ name: "A", controls: [31] }], classes: [{ name: "Patrouille", course: "A", team: { size: 3, count: 2 } }],
  runners: [301, 302, 303].map((card) => ({ family: `P${card}`, given: "x", cls: "Patrouille", card, start: H(10) })), teams: [{ name: "Pat", cls: "Patrouille", runners: [0, 1, 2] }] });
read(Q, 301, [[31, H(10, 5)]], H(10, 10)); read(Q, 302, [[31, H(10, 6)]], H(10, 14)); read(Q, 303, [], H(10, 30));
eq(buildView(Q.state).classes[0].teams.map((x) => [x.status, x.time]), [["ok", 840]], "patrol: the second member's time, the third's missing control forgiven");

// ---- a knockout: a qualification of 12, two semi-finals of 6, a final of 6
eq(snake([1, 2, 3, 4, 5, 6, 7], 3), [[1, 6, 7], [2, 5], [3, 4]], "snake seeding");
const K = new Log("k1", [], () => now++);
importSet(K, { courses: [{ name: "Q", controls: [31, 32] }, { name: "KO", controls: [33] }], classes: [{ name: "H21", course: "Q" }],
  runners: Array.from({ length: 12 }, (_, i) => ({ family: `K${String(i + 1).padStart(2, "0")}`, given: "x", cls: "H21", club: `C${i % 3}`, card: 400 + i + 1, start: H(10) + i * 60 })) });
K.add("ev", { p: { zero: H(10) } });
const base = Object.values(K.state.classes)[0].id, koCourse = Object.values(K.state.courses).find((c) => c.name === "KO").id;
for (let i = 0; i < 12; i++) read(K, 401 + i, [[31, H(10) + i * 60 + 100], [32, H(10) + i * 60 + 200]], H(10) + i * 60 + 300 + i * 10);     // K01 the fastest … K12 the slowest
v = buildView(K.state);
eq(qualified(K.state, v, { from: [base] }).map((r) => r.family).slice(0, 3), ["K01", "K02", "K03"], "knockout: the qualification's order");
let plan = planRound(K.state, v, { base, round: 1, label: "Demi", from: [base], heats: 2, size: 6, up: 3, course: koCourse, first: H(14), gap: 600 });
eq(plan.heats.map((h) => h.map((r) => r.family)), [["K01", "K04", "K05", "K08", "K09", "K12"], ["K02", "K03", "K06", "K07", "K10", "K11"]], "knockout: the heats in a snake");
K.add("many", { rows: plan.rows });
v = buildView(K.state);
let tree = koTree(K.state, v);
eq([tree.length, tree[0].rounds.length, tree[0].rounds[0].heats.map((h) => [h.name, h.rows.length, h.first])], [1, 1, [["H21 Demi 1", 6, H(14)], ["H21 Demi 2", 6, H(14, 10)]]], "knockout: the heats' classes");
eq(problems(K.state, v).filter((p) => p.kind === "dupcard").length, 0, "knockout: a runner's copies sharing a card are no fault");
ok(dropRound(K.state, base, 1)?.length === 14, "knockout: a round nobody ran can be taken away");
// the semi-finals are run: the card goes to the copy that has no read yet
const semi = (card, t, heatStart) => read(K, card, [[33, heatStart + t - 20]], heatStart + t);
[[401, 200], [404, 210], [405, 220], [408, 230], [409, 240], [412, 250]].forEach(([c, t]) => semi(c, t, H(14)));
[[402, 205], [403, 215], [406, 225], [407, 235], [410, 245], [411, 255]].forEach(([c, t]) => semi(c, t, H(14, 10)));
v = buildView(K.state);
tree = koTree(K.state, v);
eq(tree[0].rounds[0].heats[0].rows.map((r) => [r.family, r.place, r.time]).slice(0, 3), [["K01", 1, 200], ["K04", 2, 210], ["K05", 3, 220]], "knockout: a heat's result, from its mass start");
eq(v.classes.find((k) => k.id === base).rows[0].time, 300, "knockout: the qualification's results stay");
ok(dropRound(K.state, base, 1) === null, "knockout: a round with cards read is kept");
plan = planRound(K.state, v, { base, round: 2, label: "Finale", prev: 1, heats: 1, size: 6, up: 0, course: koCourse, first: H(15) });
eq(plan.heats[0].map((r) => r.family), ["K01", "K02", "K04", "K03", "K05", "K06"], "knockout: the final from the heats' first three");
K.add("many", { rows: plan.rows });
ok(Object.values(K.state.runners).filter((r) => r.cls && K.state.classes[r.cls].ko?.round === 2).every((r) => K.state.runners[r.of] && !K.state.runners[r.of].of), "knockout: a copy of a copy stands for the entry");
[[402, 190], [401, 195], [403, 200], [404, 205], [405, 210]].forEach(([c, t]) => semi(c, t, H(15)));
v = buildView(K.state);
const final = koRanking(K.state, v, base);
eq(final.slice(0, 7).map((r) => [r.place, r.family, r.round]), [[1, "K02", 2], [2, "K01", 2], [3, "K03", 2], [4, "K04", 2], [5, "K05", 2], [6, "K06", 2], [7, "K08", 1]], "knockout: the final ranking — the finalists, then the semi-finals' fourths");
eq(final.length, 12, "knockout: everyone of the first round is ranked");
eq(qualified(K.state, v, { base, prev: 1, lucky: 2 }).length, 8, "knockout: the fastest losers added");

// ---- two days: totals by time and by points, the chase start
const day = (name, date, rows) => ({ event: { name, date }, classes: [{ name: "H21" }], runners: rows.map(([family, lic, time, status]) => ({ family, given: "x", club: "Club", cls: "H21", lic, start: H(10) })),
  reads: rows.map(([, , time], i) => (time ? { card: 0, start: null, finish: H(10) + time, punches: [], of: i } : null)).filter(Boolean) });
const st1 = stageFromSet(day("Jour 1", "2026-05-01", [["Alpha", "1", 1800], ["Bravo", "2", 1900], ["Charlie", "3", 2000], ["Delta", "", 2100]]), { id: "a" });
eq(st1.classes[0].rows.map((r) => [r.family, r.status, r.time]), [["Alpha", "ok", 1800], ["Bravo", "ok", 1900], ["Charlie", "ok", 2000], ["Delta", "ok", 2100]], "stage: a day's results from a file's content");
eq(personKey({ lic: "12", family: "X" }), "l:12", "stage: a person's key is their licence");
const S = new Log("s1", [], () => now++);
importSet(S, { courses: [{ name: "A", controls: [31] }], classes: [{ name: "H21", course: "A" }],
  runners: [["Alpha", "1", 501], ["Bravo", "2", 502], ["Charlie", "3", 503], ["Delta", "", 504], ["Echo", "5", 505]].map(([family, lic, card]) => ({ family, given: "x", club: "Club", cls: "H21", lic, card })) });
S.add("ev", { p: { name: "Jour 2", date: "2026-05-02", zero: H(10), "stage.a": st1, series: { mode: "time" } } });
eq(stagesOf(S.state).map((s) => [s.id, s.name]), [["a", "Jour 1"]], "series: the stages kept on the event");
const ch = chaseStarts(S.state, { first: H(10), cap: 240, step: 30 });
S.add("many", { rows: ch.rows });
const startOf = (f) => Object.values(S.state.runners).find((r) => r.family === f).start;
eq([startOf("Alpha"), startOf("Bravo"), startOf("Charlie"), startOf("Delta"), startOf("Echo")], [H(10), H(10, 1, 40), H(10, 3, 20), H(10, 4, 30), undefined], "chase: the leader first, the deficits, the cap, the unknown runner left");
eq([ch.chase, ch.late, ch.none], [3, 1, 1], "chase: counts");
// day 2: Bravo catches Alpha
for (const [f, card, t] of [["Alpha", 501, 2000], ["Bravo", 502, 1850], ["Charlie", 503, 1900], ["Delta", 504, 1900]]) read(S, card, [[31, startOf(f) + 100]], startOf(f) + t);
v = buildView(S.state);
let tot = totals(S.state, v);
eq(tot.stages.map((s) => s.name), ["Jour 1", "Jour 2"], "totals: the event's own race is the last stage");
eq(tot.classes[0].rows.map((r) => [r.family, r.total, r.place, r.behind, r.complete]), [["Bravo", 3750, 1, 0, true], ["Alpha", 3800, 2, 50, true], ["Charlie", 3900, 3, 150, true], ["Delta", 4000, 4, 250, true], ["Echo", null, null, null, false]], "totals by time: the times added, a runner short of a stage after");
// in a chase the first across the line leads the total
const order = [...v.classes[0].rows].filter((r) => r.finish != null).sort((a, b) => a.finish - b.finish).map((r) => r.family);
eq(order.slice(0, 3), ["Bravo", "Alpha", "Charlie"], "chase: the finish order is the total's (within the cap)");
S.add("ev", { p: { series: { mode: "points", best: 1 } } });
tot = totals(S.state, buildView(S.state));
eq(tot.classes[0].rows.map((r) => [r.family, r.total, r.place]).slice(0, 3), [["Alpha", 1000, 1], ["Bravo", 1000, 1], ["Charlie", 974, 3]], "totals by points: each one's best stage");
S.add("ev", { p: { series: { mode: "points", best: 0, cur: false } } });
eq(totals(S.state, buildView(S.state)).stages.length, 1, "totals: the event's race left out when asked");
// the same person with a licence one day and without the next is one person
const st2 = stageFromSet(day("Jour 0", "2026-04-30", [["Alpha", "", 1700], ["Bravo", "2", 1750]]), { id: "b" });
S.add("ev", { p: { "stage.b": st2, series: { mode: "time", cur: false } } });
tot = totals(S.state, null);
eq(tot.classes[0].rows.filter((r) => r.family === "Alpha").length, 1, "totals: a licence missing one day does not double the runner");
eq(tot.classes[0].rows.find((r) => r.family === "Alpha").total, 3500, "totals: both days counted for them");
S.add("ev", { p: { "stage.b": null } });
eq(stagesOf(S.state).length, 1, "series: a stage taken away");
// a view's own stage leaves the knockout heats and copies out
eq(stageOf(buildView(K.state)).classes.map((c) => [c.name, c.rows.length]), [["H21", 12]], "stage: knockout heats are not stages' classes");

console.log(fails ? `formats: ${fails} of ${n} checks FAILED` : `formats: ${n} checks passed`);
process.exit(fails ? 1 : 0);
