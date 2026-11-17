// node tools/chrono/t_io.mjs — the formats: IOF XML and the delimited layouts, there and back. Invented runners only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { importSet, takeRead } from "../../site/assets/js/chrono/model.js";
import { buildView, exportView } from "../../site/assets/js/chrono/view.js";
import { readIof, writeResults, writeStarts, writeEntries, writeCourses, clockOf, isoOf } from "../../site/assets/js/chrono/io/iofxml.js";
import { readCsv, writeOeCsv, latin1, preflight, parseDelimited } from "../../site/assets/js/chrono/io/oecsv.js";
import { parseXml, decodeText } from "../../site/assets/js/chrono/xml.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { fails++; console.log("FAIL", what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
let now = 1;

function race() {
  const L = new Log("io", [], () => now++);
  importSet(L, {
    event: { name: "Régionale d'essai", date: "2026-11-15" },
    courses: [{ name: "A", length: 5200, climb: 150, controls: [31, 32, 33] }, { name: "B", length: 3100, climb: 80, controls: [31, 35] }],
    classes: [{ name: "H21", course: "A" }, { name: "D21", course: "B" }],
    runners: [
      { family: "Martin", given: "Camille", club: "CO Essai", clubCode: "9901", cls: "H21", card: 1001, lic: "100", sex: "M", birth: 1990, start: H(10) },
      { family: "Bernard", given: "Lou", club: "CO Essai", clubCode: "9901", cls: "H21", card: 1002, lic: "101", sex: "M", birth: 1995, start: H(10, 2) },
      { family: "Roux", given: "Sacha", club: "Balise 99", clubCode: "9902", cls: "H21", card: 1003, lic: "102", sex: "M", birth: 2001, start: H(10, 4) },
      { family: "Moreau", given: "Élie", club: "Balise 99", clubCode: "9902", cls: "D21", card: 1005, lic: "103", sex: "F", birth: 1998, start: H(10) },
      { family: "Œuvrard", given: "Zoé", club: "Balise 99", clubCode: "9902", cls: "D21", card: 1006, sex: "F", birth: 2000, start: H(10, 2) },
    ],
  });
  L.add("ev", { p: { zero: H(10), startMode: "list" } });
  const rd = (card, start, codes, t, fin) => takeRead(L, { card, start: null, finish: fin == null ? null : { t: start + fin }, punches: codes.map((c, i) => ({ code: c, t: start + t[i] })), at: now++ });
  rd(1001, H(10), [31, 32, 33], [300, 700, 1100], 1300);
  rd(1002, H(10, 2), [31, 33], [320, 900], 1250);                // 32 missing
  rd(1003, H(10, 4), [31, 32, 33], [280, 650, 1000], null);     // no finish
  rd(1005, H(10), [31, 35], [400, 800], 1000);
  return L;
}
const sum = (L) => [...buildView(L.state, { now: H(12) }).byRunner.values()].map((r) => [r.family, r.clsName, r.status, r.time, r.place, r.splits.map((s) => s.t)]).sort();

// ---- xml basics
const el = parseXml('<?xml version="1.0"?><a:R x="1 &amp; 2"><!-- c --><B>t&#233;<![CDATA[<raw>]]></B><C/></a:R>');
eq([el.name, el.attrs.x, el.kids[0].text, el.kids.length], ["R", "1 & 2", "té<raw>", 2], "xml reader");
eq(decodeText(new Uint8Array([0x45, 0xE9])), "Eé", "latin bytes read");
eq(clockOf("2026-11-16T00:10:00+01:00", "2026-11-15"), H(24, 10), "a time past midnight");
ok(/^2026-11-15T10:02:00[+-]\d\d:\d\d$/.test(isoOf(H(10, 2), "2026-11-15")), "iso time");

// ---- IOF XML: results there and back
const L = race(), v = buildView(L.state, { now: H(12) });
const xml = writeResults(exportView(v), { status: "Complete" });
ok(xml.includes('iofVersion="3.0"') && xml.includes("<Status>MissingPunch</Status>") && xml.includes('<SplitTime status="Missing">'), "result list written");
const back = readIof(xml);
eq(back.kind, "results", "result list recognised");
const L2 = new Log("io2", [], () => now++);
importSet(L2, back.set);
L2.add("ev", { p: { zero: H(10), startMode: "list" } });
eq(sum(L2), sum(L), "results: IOF XML there and back");
eq(L2.state.event.date, "2026-11-15", "the event's day read");

// start list, entries, courses
const sl = readIof(writeStarts(exportView(v)));
eq([sl.kind, sl.set.runners.length, sl.set.runners.find((r) => r.family === "Roux").start, sl.set.classes.find((k) => k.name === "H21").course], ["starts", 5, H(10, 4), "A"], "start list there and back");
const en = readIof(writeEntries(exportView(v)));
eq([en.kind, en.set.runners.map((r) => r.card).sort(), en.set.runners.find((r) => r.family === "Moreau").sex], ["entries", [1001, 1002, 1003, 1005, 1006], "F"], "entries there and back");
const cd = readIof(writeCourses(L.state));
eq([cd.kind, cd.set.courses.map((c) => [c.name, c.length, c.controls]), cd.set.classes.map((k) => [k.name, k.course]).sort()],
  ["courses", [["A", 5200, [31, 32, 33]], ["B", 3100, [31, 35]]], [["D21", "B"], ["H21", "A"]]], "courses there and back");
const pp = readIof('<CourseData xmlns="http://www.orienteering.org/datastandard/3.0"><RaceCourseData><Control><Id>31</Id></Control><Course><Name>Long</Name><Length>4200</Length>'
  + '<CourseControl type="Start"><Control>S1</Control></CourseControl><CourseControl type="Control"><Control>31</Control></CourseControl><CourseControl type="Finish"><Control>F1</Control></CourseControl></Course></RaceCourseData></CourseData>');
eq(pp.set.courses, [{ name: "Long", length: 4200, climb: null, controls: [31] }], "a course setter's file");

// ---- OE 2003: written as the federation reads it, read back
const csv = writeOeCsv(exportView(v), { lang: "fr" });
const lines = csv.trim().split("\r\n");
ok(lines[0].startsWith("N° dép.;Puce;Ident. base de données;Nom;Prénom;Né;S;Plage;nc;Départ;Arrivée;Temps;Evaluation;N° club;Nom;Ville;Nat;N° cat.;Court;Long;"), "the federation's headings");
const cells = parseDelimited(csv).rows, martin = cells.find((r) => r[3] === "Martin");
eq([martin[1], martin[2], martin[5], martin[6], martin[9], martin[10], martin[11], martin[12], martin[13], martin[15], martin[18], martin[39], martin[40], martin[41], martin[42], martin[43]],
  ["1001", "100", "90", "H", "10:00:00", "10:21:40", "21:40", "0", "9901", "CO Essai", "H21", "A", "5.200", "150", "3", "1"], "a runner's line");
eq(martin.slice(46, 52), ["31", "5:00", "32", "11:40", "33", "18:20"], "controls and times from the start");
eq(cells.find((r) => r[3] === "Bernard")[12], "3", "a missing punch: evaluation 3");
ok(latin1("Œuvrard Zoé — ok").length === 17 && [...latin1("é")][0] === 0xE9, "written in windows-1252");
const rc = readCsv(latin1(csv));
eq([rc.layout, rc.rows, rc.results], ["oe2003", 5, true], "read back: layout");
const L3 = new Log("io3", [], () => now++);
importSet(L3, rc.set);
L3.add("ev", { p: { zero: H(10), startMode: "list" } });
const key = (x) => x.map((r) => [r[0].replace("Œ", "OE"), r[1], r[2] === "run" ? "dns" : r[2], r[3], r[4], r[5]]).sort();   // the layout has no « still out »
eq(key(sum(L3)), key(sum(L)), "results: OE 2003 there and back");
eq(Object.values(L3.state.courses).find((c) => c.name === "A").length, 5200, "the course's length read");
const noHead = readCsv(lines.slice(1).join("\r\n"));
eq([noHead?.layout, noHead?.rows], ["oe2003", 5], "the same file without its headings");

// ---- a spreadsheet of entries
const tb = readCsv("Nom,Prénom,Club,Catégorie,Puce,Licence,Départ\nDURAND,Alix,CO Essai,H21,2001,555,10:30\n\"Petit, Noa\",,Balise 99,D21,2002,,\n");
eq(tb.set.runners.map((r) => [r.family, r.given, r.club, r.cls, r.card, r.lic, r.start]), [["DURAND", "Alix", "CO Essai", "H21", 2001, "555", H(10, 30)], ["Petit, Noa", "", "Balise 99", "D21", 2002, undefined, undefined]], "a table of entries");
const one = readCsv("Name;Club;Class;Card\nDURAND Alix;CO Essai;H21;2001\nAlix Durand;CO Essai;H21;2003\n");
eq(one.set.runners.map((r) => [r.family, r.given]), [["DURAND", "Alix"], ["Durand", "Alix"]], "one name column");
const en2 = readCsv("Stno;SI card;Database Id;Surname;First name;YB;S;Block;nc;Start;Finish;Time;Classifier;Club no.;Cl.name;City;Nat;Cl. no.;Short;Long\n12;3003;77;Smith;Robin;88;M;;0;;;;0;5;OOC;Ottawa OC;CAN;1;M21;Men 21\n");
eq(en2.set.runners.map((r) => [r.bib, r.card, r.lic, r.family, r.given, r.birth, r.sex, r.clubCode, r.club, r.nat, r.cls]), [["12", 3003, "77", "Smith", "Robin", 1988, "M", "5", "Ottawa OC", "CAN", "M21"]], "OE headings in English");

// ---- before sending to a federation
const pf = preflight(v, { licence: /^\d{1,7}$/ });
eq(pf.map((p) => p.kind).sort(), ["nolic", "out"].sort(), "preflight: no licence, still out");

console.log(fails ? `${fails} of ${n} checks failed` : `io: ${n} checks passed`);
process.exit(fails ? 1 : 0);
