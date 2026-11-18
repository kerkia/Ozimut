// node tools/chrono/t_lists.mjs — the lists an organiser composes and the invoices by club. Invented runners only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { importSet, takeRead } from "../../site/assets/js/chrono/model.js";
import { buildView } from "../../site/assets/js/chrono/view.js";
import { COLUMNS, KINDS, columnsOf, defaultList, normalise, savedLists, listRows, listHtml, listCsv } from "../../site/assets/js/chrono/print/designer.js";
import { feeOf, invoiceData, invoicesHtml, invoicesCsv, invoiceLinesCsv, csvCell } from "../../site/assets/js/chrono/print/invoices.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
const count = (text, part) => text.split(part).length - 1;

// ---- an event: two courses, three classes, three clubs, a runner without a club, a hostile name
let now = 1_000_000;
const L = new Log("s1", [], () => now);
importSet(L, {
  event: { name: "Régionale <test>", date: "2026-11-17" },
  courses: [{ name: "A", length: 5200, climb: 150, controls: [31, 32, 33] }, { name: "B", length: 3100, climb: 80, controls: [31, 34] }],
  classes: [{ name: "H21", course: "A", fee: 8 }, { name: "D21", course: "B", fee: 8 }, { name: "H40", course: "B" }],
  runners: [
    { family: "Martin", given: "Camille", club: "CO Test", clubCode: "9901", cls: "H21", card: 1001, lic: "100", start: H(10, 0), bib: 1 },
    { family: "Bernard", given: "Lou", club: "CO Test", clubCode: "9901", cls: "H21", card: 1002, lic: "101", start: H(10, 2), bib: 2, fee: 5, rent: 1 },
    { family: "Roux", given: "Sacha", club: "Balise 99", clubCode: "9902", cls: "H21", card: 1003, lic: "102", start: H(10, 4), bib: 3, paid: 1 },
    { family: "Petit", given: "Noa", club: "Balise 99", clubCode: "9902", cls: "H21", card: 1004, lic: "103", start: H(10, 6), bib: 4, rent: 1, paid: 1 },
    { family: "Moreau", given: "Élie", club: "Balise 99", clubCode: "9902", cls: "D21", card: 1005, lic: "104", start: H(10, 0), bib: 5, status: "dns" },
    { family: "Simon", given: "Maé", club: "CO Test", clubCode: "9901", cls: "H40", card: 1006, lic: "105", start: H(10, 2), bib: 6, fee: 10.005, note: "à voir; \"vite\"" },
    { family: "O'Neil & Co</b>", given: "<b>Zed", club: "=SUM(A1)", clubCode: "9903", cls: "D21", card: 1007, lic: "106", start: H(10, 4), bib: 7 },
    { family: "Leroy", given: "Yaël", club: "", cls: "H40", card: 1008, lic: "107", start: H(10, 6), bib: 8, fee: 0.1 },
  ],
});
L.add("ev", { p: { zero: H(10), startMode: "list" } });
const lic = (x) => Object.values(L.state.runners).find((r) => r.lic === x);
const card = (num, start, codes, finish) => ({ sys: "si", card: num, start: null, finish: finish == null ? null : { t: finish }, check: { t: start - 300 }, clear: null,
  punches: codes.map((c, i) => ({ code: c, t: start + (i + 1) * 300 })), at: now++ });
takeRead(L, card(1001, H(10, 0), [31, 32, 33], H(10, 25)));          // Martin 1500
takeRead(L, card(1002, H(10, 2), [31, 33], H(10, 22)));              // Bernard: 32 missing
takeRead(L, card(1003, H(10, 4), [31, 32, 33], H(10, 24)));          // Roux 1200: first
takeRead(L, card(1004, H(10, 6), [31, 32, 33], H(10, 36)));          // Petit 1800
takeRead(L, card(1006, H(10, 2), [31, 34], H(10, 20)));              // Simon 1080
takeRead(L, card(1007, H(10, 4), [31, 34], H(10, 19)));              // Zed 900
// a copy for a knockout round: in the lists, never billed
L.add("put", { c: "runners", id: "copy1", p: { family: "Roux", given: "Sacha", club: lic("102").club, cls: lic("102").cls, of: lic("102").id, fee: 8 } });
const st = L.state, view = buildView(st, { now: H(12) });
const kid = (name) => Object.values(st.classes).find((k) => k.name === name).id;

const LBL = { title: "Liste", status: { ok: "OK", mp: "PM", dnf: "Abandon", dns: "Absent", dsq: "Disq.", ot: "HD", nc: "NC", run: "En course", wait: "Pas parti" },
  runners: "coureurs", km: "km", climb: "m", controls: "postes", printed: "Imprimé", splits: "Inter", empty: "Personne", noClub: "Sans club",
  cols: Object.fromEntries(Object.keys(COLUMNS).map((k) => [k, `col-${k}`])), money: (x) => `${x.toFixed(2)} €` };

// ---- every column renders for each kind
for (const kind of KINDS) {
  const d = { ...defaultList(kind, `Tout ${kind}`), cols: columnsOf(kind), splits: true };
  let page = "", csv = "";
  try { page = listHtml(st, view, d, LBL); csv = listCsv(st, view, d, LBL); } catch (err) { ok(false, `${kind}: ${err.stack}`); }
  ok(page.startsWith("<!doctype html>") && page.includes("</table>"), `${kind}: a page`);
  ok(columnsOf(kind).every((k) => page.includes(`col-${k}`)), `${kind}: every column's heading`);
  ok(csv.split("\r\n")[0].split(";").length >= columnsOf(kind).length, `${kind}: a header row`);
  ok(!page.includes("undefined") && !page.includes("NaN") && !csv.includes("undefined") && !csv.includes("NaN"), `${kind}: nothing undefined`);
  ok(!page.includes("<b>Zed") && page.includes("&lt;b&gt;Zed O'Neil &amp; Co&lt;/b&gt;"), `${kind}: a name's markup escaped`);
  ok(page.includes("Régionale &lt;test&gt;"), `${kind}: the event's name escaped`);
}
ok(!columnsOf("starts").includes("place") && !columnsOf("entries").includes("time") && columnsOf("results").includes("behind"), "columns by kind");
eq(Object.keys(COLUMNS).length, 26, "the columns");

// ---- defaults and groups
const res = defaultList("results", "R");
let g = listRows(st, view, res, LBL);
eq(g.map((x) => x.name), ["D21", "H21", "H40"], "by class");
eq(g[1].rows.map((r) => [r.family, r.place]), [["Roux", 1], ["Martin", 2], ["Petit", 3], ["Bernard", null], ["Roux", null]], "a class in rank order");
ok(g[1].sub.includes("5.2 km") && g[1].sub.includes("3 postes"), "a group's course");
g = listRows(st, view, { ...res, by: "course" }, LBL);
eq(g.map((x) => [x.name, x.rows.length]), [["A", 5], ["B", 4]], "by course");
eq(g[1].rows.slice(0, 2).map((r) => [r.given, r.place]), [["<b>Zed", 1], ["Maé", 2]], "a course's own ranking, classes merged");
g = listRows(st, view, { ...res, by: "club" }, LBL);
eq(g.map((x) => x.name), ["=SUM(A1)", "Balise 99", "CO Test", "Sans club"], "by club, the runners without a club last");
eq(g[1].rows.map((r) => r.clsName), ["D21", "H21", "H21", "H21"], "a club: by class, then rank");
g = listRows(st, view, { ...res, by: "none" }, LBL);
eq([g.length, g[0].name, g[0].rows.length], [1, "", 9], "no grouping: one group");
eq(g[0].rows.slice(0, 5).map((r) => r.time), [900, 1080, 1200, 1500, 1800], "no grouping: the classified by time");
g = listRows(st, view, defaultList("starts"), LBL);
eq(g.find((x) => x.name === "H21").rows.map((r) => r.start).slice(0, 4), [H(10, 0), H(10, 2), H(10, 4), H(10, 6)], "starts: by start time");
g = listRows(st, view, { ...defaultList("entries"), by: "none" }, LBL);
eq(g[0].rows.map((r) => r.family).slice(0, 3), ["Bernard", "Leroy", "Martin"], "entries: by name");

// ---- filters
g = listRows(st, view, { ...res, classes: [kid("H40")] }, LBL);
eq(g.map((x) => x.name), ["H40"], "one class");
eq(listRows(st, view, { ...res, classes: [] }, LBL), [], "no class: nothing");
g = listRows(st, view, { ...res, statuses: ["mp", "dns"] }, LBL);
eq(g.flatMap((x) => x.rows.map((r) => r.family)), ["Moreau", "Bernard"], "by status");
g = listRows(st, view, { ...res, top: 2 }, LBL);
eq(g.map((x) => x.rows.map((r) => r.place)), [[1], [1, 2], [1]], "the first two of each class");
eq(listRows(st, view, { ...res, by: "club", top: 1, classes: [kid("H21")] }, LBL).map((x) => x.name), ["Balise 99"], "filters together");
ok(listHtml(st, view, { ...res, classes: [] }, LBL).includes("Personne"), "an empty list says so");

// ---- sort
g = listRows(st, view, { ...res, by: "none", sort: "name" }, LBL);
eq(g[0].rows.map((r) => r.family)[0], "Bernard", "sorted by name: the family name first");
g = listRows(st, view, { ...res, by: "none", sort: "time", desc: true }, LBL);
eq(g[0].rows.map((r) => COLUMNS.time.get(r)).slice(0, 6), [1800, 1500, 1200, 1080, 900, null], "descending, those without a time last");
g = listRows(st, view, { ...res, by: "none", sort: "bib", desc: true }, LBL);
eq(g[0].rows.map((r) => r.bib).slice(0, 3), [8, 7, 6], "numbers sort as numbers");
g = listRows(st, view, { ...res, by: "none", sort: "fee" }, LBL);
eq(g[0].rows.map((r) => COLUMNS.fee.get(r, st)), [0.1, 5, 8, 8, 8, 8, 8, 10.01, null], "a column of the entry (the fee), a copy last");
g = listRows(st, view, { ...defaultList("starts"), by: "none", desc: true }, LBL);
eq([g[0].rows[0].start, g[0].rows.at(-1).start], [H(10, 6), null], "the natural order reversed, no start time still last");
eq(listRows(st, view, { ...res, sort: "place", desc: true }, LBL)[1].rows.map((r) => r.place), [3, 2, 1, null, null], "rank descending");

// ---- the page
let page = listHtml(st, view, { ...res, splits: true, breaks: true, size: "l", landscape: true, head: "Jury : <A>\nligne 2", foot: "Fin & suite" }, LBL);
ok(page.includes("@page{size:A4 landscape}") && page.includes('<body class="l">'), "landscape, large");
eq(count(page, 'class="pb"'), 2, "a page a group, but the first");
ok(page.includes("Jury : &lt;A&gt;\nligne 2") && page.includes("Fin &amp; suite"), "free lines, escaped");
ok(page.includes("1(31) 5:00") && count(page, 'class="sp"') === 6, "split times under the runners whose card was read");
ok(page.includes('class="n st">PM<'), "a status in place of the time");
page = listHtml(st, view, { ...res, cols: ["name", "sign"] }, LBL);
ok(count(page, '<td class="box"></td>') === 9 && !page.includes("@page"), "a box to sign, portrait");
ok(listHtml(st, view, { ...res, cols: ["name", "fee", "paid", "rent", "note"] }, LBL).includes("10.01 €"), "money through the caller's format");

// ---- the table
let csv = listCsv(st, view, { ...defaultList("entries"), by: "club", cols: ["name", "cls", "fee", "paid", "rent", "note"] }, LBL);
let rows = csv.trim().split("\r\n");
eq(rows[0], "col-club;col-name;col-cls;col-fee;col-paid;col-rent;col-note", "the group's column first");
ok(rows.some((r) => r.startsWith("'=SUM(A1);")), "a club's name that would be a formula is disarmed");
ok(rows.some((r) => r.includes('"à voir; ""vite"""')), "a cell with the separator and quotes");
ok(rows.some((r) => r.startsWith("Balise 99;Noa Petit;H21;8.00 €;1;1;")), "ticks as 1");
csv = listCsv(st, view, { ...res, cols: ["place", "cls", "name", "time", "behind"], splits: true }, LBL);
rows = csv.trim().split("\r\n");
eq(rows[0], "col-place;col-cls;col-name;col-time;col-behind;Inter", "no group column when the list has it");
ok(rows.includes("2;H21;Camille Martin;25:00;+5:00;1(31) 5:00 2(32) 10:00 3(33) 15:00"), "a result with its split times");
eq([csvCell("a;b"), csvCell(' x'), csvCell('say "hi"'), csvCell("+5:00"), csvCell("-12"), csvCell("+cmd"), csvCell("@x"), csvCell("=1", false), csvCell(null)],
  ['"a;b"', '" x"', '"say ""hi"""', "+5:00", "-12", "'+cmd", "'@x", "=1", ""], "cells quoted and disarmed");

// ---- a hostile definition
const bad = normalise(JSON.parse('{"__proto__":{"polluted":1},"id":"../x","name":["a"],"kind":"sql","by":{"a":1},"cols":["place","constructor","__proto__","nope",5,"place","time",{"k":1}],'
  + '"sort":"toString","desc":"yes","classes":"all","statuses":["ok","hack",null],"top":"-3","splits":"1","breaks":1,"size":"xxl","landscape":{},"head":{"x":1},"foot":12,"extra":"<script>"}'));
eq([bad.kind, bad.by, bad.cols, bad.sort, bad.desc, bad.classes, bad.statuses, bad.top, bad.splits, bad.breaks, bad.size, bad.landscape, bad.head, bad.foot, bad.name],
  ["results", "class", ["place", "time"], "", false, null, ["ok"], null, false, true, "m", false, "", "12", ""], "a hostile definition made safe");
ok(/^[a-z0-9]{9}$/.test(bad.id) && !("extra" in bad) && !("polluted" in bad) && ({}).polluted === undefined, "no unknown field, nothing reaches the prototype");
for (const junk of [null, undefined, 5, "x", [], [1]]) ok(normalise(junk).cols.length === 5 && normalise(junk).kind === "results", `normalise(${JSON.stringify(junk)})`);
eq(normalise({ kind: "starts", cols: ["place", "time", "finish"], sort: "time", top: 3, splits: true }).cols, ["start", "bib", "name", "club", "card"], "columns of another kind dropped: the kind's own");
eq([normalise({ kind: "starts", sort: "time", top: 3, splits: true }).sort, normalise({ kind: "starts", top: 3 }).top, normalise({ kind: "starts", splits: true }).splits], ["", null, false], "what only results have");
eq([normalise({ top: 2.7 }).top, normalise({ top: "4" }).top, normalise({ top: [5] }).top, normalise({ top: 5000 }).top, normalise({ top: true }).top], [2, 4, null, 999, null], "the first N");
eq(normalise(normalise(res)), normalise(res), "normalise twice changes nothing");
ok(listHtml(st, view, { cols: ["__proto__"], by: "constructor" }, LBL).includes("col-place"), "a page from a hostile definition");

// ---- saved with the event
L.add("ev", { p: { "list.bbb": { ...res, id: "zzz", name: "Podiums", top: 3 }, "list.aaa": { kind: "starts", name: "Appel" }, "list.../x": { name: "no" }, "list.ccc": "text", "list.ddd": null, listing: 1 } });
const saved = savedLists(L.state);
eq(saved.map((d) => [d.id, d.name, d.kind, d.top]), [["aaa", "Appel", "starts", null], ["bbb", "Podiums", "results", 3]], "the saved lists, by name, their id their key's");
L.add("ev", { p: { "list.bbb": null } });
eq(savedLists(L.state).map((d) => d.id), ["aaa"], "a list deleted");
eq(savedLists({ event: {} }), [], "no list");

// ---- invoices
const I = invoiceData(st, { rent: 2.5, noClub: "Sans club" });
eq(I.clubs.map((c) => [c.name, c.code, c.n, c.rank]), [["=SUM(A1)", "9903", 1, 1], ["Balise 99", "9902", 3, 2], ["CO Test", "9901", 3, 3], ["Sans club", "", 1, 4]], "clubs by name, no club last, the copy left out");
const club = (name) => I.clubs.find((c) => c.name === name), ln = (c, fam) => c.lines.find((l) => l.family === fam);
eq([ln(club("CO Test"), "Martin").fee, ln(club("CO Test"), "Bernard").fee, ln(club("CO Test"), "Simon").fee, ln(club("Sans club"), "Leroy").fee], [8, 5, 10.01, 0.1], "the runner's fee over the class's, to the cent");
eq([ln(club("CO Test"), "Bernard").rent, ln(club("CO Test"), "Bernard").total, ln(club("CO Test"), "Martin").rent], [2.5, 7.5, 0], "a rented card");
eq([ln(club("Balise 99"), "Petit").paid, ln(club("Balise 99"), "Petit").due, ln(club("Balise 99"), "Roux").paid, ln(club("Balise 99"), "Moreau").due], [10.5, 0, 8, 8], "paid: the whole of a runner's amount");
eq([club("CO Test").fees, club("CO Test").rent, club("CO Test").total, club("CO Test").paid, club("CO Test").due], [23.01, 2.5, 25.51, 0, 25.51], "a club's totals");
eq([club("Balise 99").total, club("Balise 99").paid, club("Balise 99").due], [26.5, 18.5, 8], "paid and due");
eq(I.total, { n: 8, fees: 55.11, rent: 5, total: 60.11, paid: 18.5, due: 41.61 }, "the grand total");
eq(club("CO Test").lines.map((l) => [l.cls, l.family]), [["H21", "Bernard"], ["H21", "Martin"], ["H40", "Simon"]], "lines by class, then name");
eq(I.event, { name: "Régionale <test>", date: "2026-11-17" }, "the event");
ok(!I.clubs.some((c) => c.lines.some((l) => l.runner === "copy1")), "a knockout copy is never billed");
eq([feeOf(st, st.runners.copy1), feeOf(st, lic("100")), feeOf(st, lic("101")), feeOf(st, lic("105")), feeOf(st, null), feeOf({ classes: {} }, { fee: "x" })], [0, 8, 5, 10.01, 0, 0], "feeOf");
const I2 = invoiceData(st, { rent: 2.5, skipDns: true });
eq([I2.clubs.find((c) => c.code === "9902").n, I2.total.n, I2.total.due], [2, 7, 33.61], "without the absent");
eq(invoiceData(st).total.rent, 0, "no price for a rented card: nothing");
// rounding: thirty fees of 0.1 are 3.00, not 3.0000000000000004
const many = { event: {}, clubs: { c: { id: "c", name: "C" } }, classes: {}, runners: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`r${i}`, { id: `r${i}`, family: `F${i}`, club: "c", fee: 0.1 }])) };
eq([invoiceData(many).total.fees, invoiceData(many).clubs[0].due, invoiceData({ event: {}, runners: {}, clubs: {}, classes: {} }).clubs.length], [3, 3, 0], "sums in cents");

const IL = { title: "Facture", number: "N°", date: "Date", club: "Club", code: "N° club", runner: "Coureur", cls: "Catégorie", fee: "Inscription", rent: "Puce louée", total: "Total", paid: "Déjà payé",
  due: "Reste à payer", runners: "coureurs", fees: "Inscriptions", rents: "Puces louées", lic: "Licence", status: LBL.status, dec: "," };
const eur = (x) => `${x.toFixed(2)} €`;
page = invoicesHtml(I, IL, { head: "CO <Org>\n1 rue du Bois", foot: "IBAN FR76 & co", num: "F26-", date: "17/11/2026", money: eur });
eq([count(page, '<section class="inv'), count(page, 'class="inv pb"')], [4, 3], "a page a club");
ok(page.includes("CO &lt;Org&gt;\n1 rue du Bois") && page.includes("IBAN FR76 &amp; co"), "the organiser's block and the footer, escaped");
ok(page.includes("N° F26-003") && page.includes("Date 17/11/2026") && page.includes("Régionale &lt;test&gt; — 2026-11-17"), "number, date, event");
ok(page.includes("&lt;b&gt;Zed O'Neil &amp; Co&lt;/b&gt;") && !page.includes("<b>Zed") && page.includes("<b>=SUM(A1)</b>"), "names escaped");
ok(page.includes("25.51 €") && page.includes("Total (3 coureurs)") && page.includes("<small>Absent</small>"), "totals and a status");
page = invoicesHtml(I, IL, { only: club("Balise 99").id, money: eur });
ok(count(page, '<section class="inv') === 1 && page.includes("Balise 99") && !page.includes("CO Test") && !page.includes("N° "), "one club, no number without a prefix");
eq(count(invoicesHtml(I, IL, { only: "" }), '<section class="inv'), 1, "the runners without a club alone");
eq(count(invoicesHtml(invoiceData(st, { rent: 0 }), IL, { dueOnly: true }), '<section class="inv'), 4, "only the clubs that owe");
L.add("many", { rows: club("CO Test").lines.map((l) => ["runners", l.runner, { paid: 1 }]) });
const I3 = invoiceData(L.state, { rent: 2.5 });
eq([I3.clubs.find((c) => c.code === "9901").due, count(invoicesHtml(I3, IL, { dueOnly: true }), '<section class="inv')], [0, 3], "a club marked paid owes nothing");
ok(invoicesHtml(I3, IL, { dueOnly: true, num: "F" }).includes("N° F004") && !invoicesHtml(I3, IL, { dueOnly: true, num: "F" }).includes("N° F003"), "a club keeps its number whatever is printed");

rows = invoicesCsv(I, IL).trim().split("\r\n");
eq(rows[0], "N° club;Club;coureurs;Inscriptions;Puces louées;Total;Déjà payé;Reste à payer", "summary: the header");
eq([rows.length, rows[1], rows[3], rows[5]], [6, "9903;'=SUM(A1);1;8,00;0,00;8,00;0,00;8,00", "9901;CO Test;3;23,01;2,50;25,51;0,00;25,51", ";Total;8;55,11;5,00;60,11;18,50;41,61"], "summary: a club a line, then the total");
rows = invoiceLinesCsv(I, IL).trim().split("\r\n");
eq([rows.length, rows[0].split(";").length], [9, 10], "lines: a runner a line");
ok(rows.includes("9901;CO Test;Lou Bernard;101;H21;5,00;2,50;7,50;0,00;7,50") && rows.some((r) => r.includes("<b>Zed O'Neil & Co</b>")), "lines: amounts and names as they are");
eq(invoicesCsv(I, { ...IL, dec: undefined }).split("\r\n")[3], "9901;CO Test;3;23.01;2.50;25.51;0.00;25.51", "a point when no decimal sign is given");

console.log(fails ? `${fails} of ${n} checks failed` : `lists: ${n} checks passed`);
process.exit(fails ? 1 : 0);
