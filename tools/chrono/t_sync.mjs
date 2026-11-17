// node tools/chrono/t_sync.mjs — stations exchanging their logs (through a hub, through the cloud), the receipt, the lists.
import { Log } from "../../site/assets/js/chrono/log.js";
import { link, cloudSync, answerSync } from "../../site/assets/js/chrono/sync.js";
import { importSet, takeRead } from "../../site/assets/js/chrono/model.js";
import { buildView } from "../../site/assets/js/chrono/view.js";
import { receipt, escpos, receiptHtml, receiptText } from "../../site/assets/js/chrono/print/receipt.js";
import { resultsHtml, startsHtml, minutesHtml, clubsHtml } from "../../site/assets/js/chrono/print/lists.js";
import { toFile, fromFile } from "../../site/assets/js/chrono/store.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
let now = 1000;
const mk = (s) => new Log(s, [], () => now++);

// a wire between two logs: messages queued, delivered by pump(); cut() drops what is in flight
function wire(a, b, ev = "e1") {
  const q = [];
  let up = true;
  const la = link(a, (m) => up && q.push(["b", JSON.parse(JSON.stringify(m))]), { ev });
  const lb = link(b, (m) => up && q.push(["a", JSON.parse(JSON.stringify(m))]), { ev });
  const pump = () => { while (q.length) { const [to, m] = q.shift(); (to === "a" ? la : lb).receive(m); } };
  return { open() { la.open(); lb.open(); pump(); }, pump, cut() { up = false; q.length = 0; la.close(); lb.close(); }, la, lb };
}

// hub with two stations: what one adds reaches the other through the hub
const hub = mk("hub"), s1 = mk("st1"), s2 = mk("st2");
s1.add("ev", { p: { name: "Essai" } });
const w1 = wire(s1, hub), w2 = wire(s2, hub);
w1.open(); w2.open();
s1.add("put", { c: "runners", id: "a", p: { family: "Un" } }); w1.pump(); w2.pump();
s2.add("put", { c: "runners", id: "b", p: { family: "Deux" } }); w2.pump(); w1.pump();
eq([hub.state, s2.state], [s1.state, s1.state], "three logs, one state, through a hub");
eq([hub.ops.length, s1.ops.length, s2.ops.length], [3, 3, 3], "no operation doubled");
// a station cut off works on, then catches up
w2.cut();
s2.add("put", { c: "runners", id: "b", p: { card: 7 } });
s1.add("put", { c: "runners", id: "a", p: { card: 9 } }); w1.pump();
const w3 = wire(s2, hub); w3.open(); w1.pump(); w3.pump();
eq([s1.state.runners, s2.state.runners], [hub.state.runners, hub.state.runners], "back after a cut: all agree");
eq(hub.state.runners.b.card, 7, "the cut-off station's work is there");
const other = mk("xx"); let fault = null;
const lx = link(other, () => {}, { ev: "e2", onFault: (w) => { fault = w; } });
lx.receive({ t: "hello", ev: "e1", station: "zz", have: {} });
eq(fault, "event", "another event's station is refused");

// the cloud: a store of operations answering requests
let held = [];
const post = async (body) => { const { fresh, answer } = answerSync(held, JSON.parse(JSON.stringify(body))); held = held.concat(fresh); return answer; };
const c1 = mk("c1"), c2 = mk("c2"), m1 = {}, m2 = {};
c1.add("ev", { p: { name: "Nuage" } }); c1.add("put", { c: "clubs", id: "k", p: { name: "CO" } });
eq(await cloudSync(c1, post, m1), { sent: 2, got: 0, more: false }, "first push");
c2.add("put", { c: "clubs", id: "k2", p: { name: "B" } });
eq(await cloudSync(c2, post, m2), { sent: 1, got: 2, more: false }, "a second station pushes and pulls");
eq(await cloudSync(c1, post, m1), { sent: 0, got: 1, more: false }, "the first pulls");
eq(c1.state, c2.state, "both agree through the cloud");
eq((await cloudSync(c1, post, m1)).got, 0, "nothing twice");
ok(answerSync(held, { ops: [{ s: 1, n: 1 }, null, { s: "q", n: "x" }] }).fresh.length === 0, "malformed operations are left out");

// the event file
const f = fromFile(toFile(c1, "ev123"));
eq([f.ev, f.ops.length, new Log("n", f.ops).state], ["ev123", 3, c1.state], "the event file there and back");
eq(fromFile(c1.ops.map((o) => JSON.stringify(o)).join("\n") + '\n{"s":"c1","n":9,"t":').ops.length, 3, "a journal cut mid-line keeps what is whole");
let err = null; try { fromFile('{"format":"ozimut-chrono","version":99,"ops":[]}'); } catch (e) { err = e.message; }
eq(err, "version", "a newer file is refused");

// the receipt and the lists
const H = (h, m = 0) => h * 3600 + m * 60, R = mk("r");
importSet(R, { event: { name: "Régionale d'essai", date: "2026-11-15" }, courses: [{ name: "A", length: 5000, climb: 100, controls: [31, 32] }], classes: [{ name: "H21", course: "A" }],
  runners: [{ family: "Martin", given: "Camille", club: "CO Essai", cls: "H21", card: 1001, start: H(10) }, { family: "Roux", given: "Sacha", club: "Balise 99", cls: "H21", card: 1002, start: H(10, 2) }] });
takeRead(R, { card: 1001, start: null, finish: { t: H(10, 25) }, punches: [{ code: 31, t: H(10, 5) }, { code: 32, t: H(10, 15) }], at: 1 });
takeRead(R, { card: 1002, start: null, finish: { t: H(10, 30) }, punches: [{ code: 31, t: H(10, 9) }], at: 2 });
const v = buildView(R.state), course = v.courses[0];
const L = { card: "Puce", start: "Départ", finish: "Arrivée", time: "Temps", place: "Place", behind: "Écart", pace: "Allure", missing: "Manquant :", extra: "En plus :", points: "Points", penalty: "Pénalité",
  status: { ok: "OK", mp: "PM" }, cols: ["#", "Code", "Temps", "Inter", "Pl"], finishRow: "Arr.", footer: ["ozimut.com"], rent: "Puce louée : à rendre" };
const lines = receipt(course.rows[0], { event: v.event, course, of: 1, labels: L }, 32), text = receiptText(lines, 32);
ok(text.includes("Camille Martin") && text.includes("Temps 25:00") && text.includes("Place 1 / 1") && text.includes("Allure 5:00 /km"), "receipt: the result");
ok(text.split("\n").every((l) => l.length <= 32), "receipt: fits 32 characters");
ok(/^1 {2}31 +5:00 +5:00 +1$/m.test(text) && /Arr\. +25:00 +10:00/.test(text), "receipt: the controls");
const mp = receiptText(receipt(course.rows[1], { event: v.event, course, labels: L }, 32), 32);
ok(mp.includes("PM") && mp.includes("Manquant : 32") && mp.includes("-----"), "receipt: a missing punch");
const bytes = escpos(lines, 32);
ok(bytes[0] === 0x1B && bytes[1] === 0x40 && bytes.includes(0xE9) && bytes[bytes.length - 4] === 0x1D && bytes[bytes.length - 3] === 0x56, "ESC/POS: initialised, accents in windows-1252, cut at the end");
ok(receiptHtml(lines).includes("Camille Martin"), "receipt as a page");
const LL = { title: "Résultats", place: "Pl.", name: "Nom", club: "Club", cat: "Cat.", time: "Temps", behind: "Écart", start: "Départ", card: "Puce", bib: "Doss.", status: { mp: "PM" }, runners: "coureurs", km: "km", climb: "m", controls: "postes", printed: "", points: "Points" };
const html = resultsHtml(v, v.classes, LL, { splits: true });
ok(html.includes("H21") && html.includes("25:00") && html.includes(">PM<") && html.includes("5.0 km"), "results page");
ok(startsHtml(v, v.classes, LL).includes("10:02:00") && minutesHtml(v, LL).includes("10:00:00") && clubsHtml(v, LL).includes("Balise 99"), "start lists and clubs pages");

console.log(fails ? `${fails} of ${n} checks failed` : `sync: ${n} checks passed`);
process.exit(fails ? 1 : 0);
