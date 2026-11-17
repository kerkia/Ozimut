// node tools/chrono/t_meos.mjs — compatibility with MeOS at the level of files and protocols: its event file there and
// back (and read by hand-written files in both ways MeOS writes times), MOP written here and read by this project's own
// reader (live/src/mop.js), SIRAP packets. Invented names only.
import { Log } from "../../site/assets/js/chrono/log.js";
import { importSet } from "../../site/assets/js/chrono/model.js";
import { buildView, exportView } from "../../site/assets/js/chrono/view.js";
import { readMeos, writeMeos, meosTime, meosTimeText } from "../../site/assets/js/chrono/io/meosxml.js";
import { mopComplete, mopDiff, mopNum } from "../../site/assets/js/chrono/io/mop.js";
import { SirapDecoder, parseSirap, buildPunch, buildCard, SIRAP_PORT } from "../../site/assets/js/chrono/io/sirap.js";
import { parseXml as liveXml, apply, emptyHead, emptyClass, compactClass } from "../../live/src/mop.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) fails++; console.log(cond ? "ok  " : "FAIL", what); };
const eq = (a, b, what) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? what : `${what}: ${x} != ${y}`); };
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
const byFamily = (a, b) => a.family.localeCompare(b.family);
let now = 1;

// ---- a made-up event: 2 courses, 3 classes, 8 runners
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
const rd = (of, card, start, codes, t, fin, more = {}) => ({ of, card, at: now++, check: start - 300, start: null, finish: fin == null ? null : start + fin,
  punches: codes.map((c, i) => [c, start + t[i]]), ...more });
SET.reads = [
  rd(0, 500001, START.Alder, [31, 32, 33, 34, 35], [300, 700, 900, 1500, 1900], 2000),          // ok
  rd(1, 500002, START.Birch, [31, 132, 33, 34, 35], [320, 760, 1000, 1600, 2050], 2160),        // ok: 132 stands for 32
  rd(2, 500003, START.Cedar, [31, 32, 34, 35], [400, 900, 1700, 2200], 2300),                   // 33 missing
  rd(3, 500004, START.Dorn, [31, 32, 33], [450, 1000, 1400], null),                             // no finish
  rd(5, 500006, START.Fenn, [31, 36, 35], [500, 1100, 1500], 1600),                             // ok
  rd(7, 500008, START.Holt, [31, 36, 35], [600, 1300, 1800], 1950),                             // ok, not competing
  rd(null, 999001, H(10, 30), [31, 36], [200, 500], 900),                                       // nobody's
];
function race() {
  const L = new Log("meos", [], () => now++);
  importSet(L, JSON.parse(JSON.stringify(SET)));
  L.add("punch", { p: { code: 33, card: 500007, s: H(10, 20), at: 1, src: "test" } });
  return L;
}
const L = race(), view = buildView(L.state, { now: H(11) });
const verdicts = (v) => [...v.byRunner.values()].sort(byFamily).map((r) => [r.family, r.status, r.time]);
const WANT = [["Alder", "ok", 2000], ["Birch", "ok", 2160], ["Cedar", "mp", 2300], ["Dorn", "dnf", null], ["Elm", "dns", null], ["Fenn", "ok", 1600],
  ["Gale", "run", null], ["Holt", "nc", 1950]];
eq(verdicts(view), WANT, "the made-up race as the engine judges it");

// ---- times as MeOS writes them
eq(["3723", "3723.4", "-12.5", "-1.0", "-1", "", "0", "3723.45", "9:00:00"].map(meosTime), [3723, 3723.4, -12.5, -1, null, null, 0, 3723.45, 32400], "meosTime: seconds, decimals, the -1 mark");
eq([3723, 3723.4, -12.5, -1, 0, -2, 0.04].map(meosTimeText), ["3723", "3723.4", "-12.5", "-1.0", "0", "-2", "0"], "meosTimeText");

// ---- writeMeos → readMeos
const file = writeMeos(L.state, view), back = readMeos(file);
ok(file.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<meosdata version="3.8">'), "whole seconds: the file says version 3.8");
ok(file.includes("<Name>Chrono &amp; MeOS &lt;test&gt;</Name>") && file.includes("<ZeroTime>32400</ZeroTime>"), "name escaped, zero time an hour before the first start");
ok(file.includes("<Name>Alder, Marek</Name>") && file.includes("<Controls>31;32;33;34;35;</Controls>") && file.includes("<Numbers>32;132</Numbers>"), "names, courses and controls in MeOS's forms");
ok(/<Punches>3-3300;31-3900;32-4300;33-4500;34-5100;35-5500;2-5600;<\/Punches>/.test(file), "a card's punch string: check, controls, finish, from the zero time");
eq(back.set.event, { name: SET.event.name, date: SET.event.date, zero: H(10), meosZero: H(9) }, "event: name, date, first start, MeOS's zero");
eq(back.info, { version: "3.8", tenths: false, vacant: 0 }, "info");
eq(back.set.courses.map((c) => [c.name, c.length, c.climb, c.controls]), SET.courses.map((c) => [c.name, c.length, c.climb, c.controls]), "courses");
eq(back.set.classes.map((c) => [c.name, c.course, c.first ?? null, c.step ?? null]).sort(), SET.classes.map((c) => [c.name, c.course, c.first ?? null, c.step ?? null]).sort(), "classes: course, first start, interval");
eq(back.set.clubs.map((c) => [c.name, c.code]).sort(), SET.clubs.map((c) => [c.name, c.code]).sort(), "clubs");
eq(back.set.controls.find((c) => c.code === 32), { code: 32, any: [132] }, "a control of two codes: the first, the other in `any`");
eq(back.set.controls.find((c) => c.code === 33), { code: 33, radio: true }, "a radio control");
eq(back.set.controls.map((c) => c.code), [31, 32, 33, 34, 35, 36], "every control of the courses");
const person = (r) => [r.family, r.given, r.club, r.clubCode, r.cls, r.card, r.start, r.sex, r.birth, String(r.bib), r.lic ?? null, r.status ?? null];
eq(back.set.runners.slice().sort(byFamily).map(person), SET.runners.map(person), "8 runners: name, club, class, card, start, sex, birth, bib, licence; dns and nc kept");
const cardOf = (r) => [r.card, r.check, r.start, r.finish, r.punches];
eq(back.set.reads.filter((r) => r.of != null).map((r) => [back.set.runners[r.of].family, ...cardOf(r)]).sort(),
  SET.reads.filter((r) => r.of != null).map((r) => [SET.runners[r.of].family, ...cardOf(r)]).sort(), "6 cards with their punches, each with its runner");
ok(back.set.reads.every((r) => (r.of == null ? r.runnerKey == null : back.set.runners[r.of].key === r.runnerKey)), "runnerKey and `of` name the same runner");
eq(back.set.reads.filter((r) => r.of == null).map(cardOf), [cardOf(SET.reads[6])], "the card of nobody: in the CardList, no owner");
eq(back.set.radio, [{ code: 33, card: 500007, s: H(10, 20) }], "a radio punch");
eq(back.oracle.slice().sort(byFamily).map((o) => [o.family, o.status, o.time]), WANT.map(([f, s, t]) => [f, s === "run" ? null : s, s === "ok" || s === "mp" || s === "nc" ? t : null]),
  "oracle: ok, ok, mp, dnf, dns, ok, none yet, nc — with the times");
eq(back.oracle.find((o) => o.family === "Alder"), { key: back.set.runners.find((r) => r.family === "Alder").key, family: "Alder", given: "Marek", card: 500001, cls: "M21",
  status: "ok", time: 2000, start: H(10), finish: H(10) + 2000 }, "an oracle row whole");

// the set read back, judged again by the engine: the same verdicts, and MeOS's stored ones agree where a card decides
const L2 = new Log("back", [], () => now++);
importSet(L2, back.set);
for (const p of back.set.radio) L2.add("punch", { p: { ...p, at: 1, src: "file" } });        // importSet leaves the radio punches to its caller
const view2 = buildView(L2.state, { now: H(11) });
eq(verdicts(view2), WANT, "file → set → engine: the same verdicts as before the file");
eq(L2.state.event.meosZero, H(9), "MeOS's own zero time kept with the event");
eq(back.oracle.filter((o) => o.status && view2.classes.some((c) => c.rows.some((r) => r.family === o.family && r.read))).map((o) => [o.family, o.status, o.time]).sort(),
  [...view2.byRunner.values()].filter((r) => r.read).map((r) => [r.family, r.status, r.time]).sort(), "the engine's judgment against the oracle, card by card");
ok(writeMeos(L2.state, view2) === file, "written again from what was read: the same file, byte for byte");

// tenths, a correction by hand, no view
const st = JSON.parse(JSON.stringify(L.state)), find = (card) => Object.values(st.reads).find((r) => r.card === card);
find(500002).finish += 0.4;
find(500002).punches[0][1] += 0.5;
find(500004).ed = { finish: START.Dorn + 1500, punches: [...find(500004).punches, [34, START.Dorn + 1450.3]] };
const file2 = writeMeos(st, buildView(st, { now: H(11) })), back2 = readMeos(file2);
ok(file2.includes('<meosdata version="3.9">') && file2.includes("<Finish>5880.4</Finish>") && file2.includes("31-4040.5;"), "tenths: decimals in the file, which says version 3.9");
eq([back2.info.tenths, back2.set.event.tenths, back2.oracle.find((o) => o.family === "Birch").time], [true, true, 2160.4], "tenths read back, and the event ranks on them");
eq(back2.set.reads.find((r) => r.card === 500002).punches[0], [31, START.Birch + 320.5], "a punch with tenths");
eq(cardOf(back2.set.reads.find((r) => r.card === 500004)).slice(3), [START.Dorn + 1500, [[31, START.Dorn + 450], [32, START.Dorn + 1000], [33, START.Dorn + 1400], [34, START.Dorn + 1450.3]]],
  "a card corrected by hand is written as corrected");
const bare = readMeos(writeMeos(L.state));
eq(bare.oracle.slice().sort(byFamily).map((o) => o.status), ["ok", "ok", "ok", "ok", "dns", "ok", null, "nc"].map((s, i) => (WANT[i][1] === "dnf" ? null : s === "ok" ? null : s)),
  "without a view: only the statuses set by hand are written");
eq(bare.set.runners.length + bare.set.reads.length, 15, "without a view: the start list and the cards all the same");
eq(readMeos(writeMeos(L.state, exportView(view))).oracle.slice().sort(byFamily).map((o) => o.status), back.oracle.slice().sort(byFamily).map((o) => o.status),
  "the exporters' view (no ids): rows found by card and name");

// ---- hand-written files, both ways MeOS writes times
const OLD = `<?xml version="1.0" encoding="ISO-8859-1"?>


<meosdata version="3.8">
<Name>Whole seconds</Name><Date>2021-05-09</Date><ZeroTime>32400</ZeroTime><NameId>meos_20210509_101010_1A</NameId>
<oData><CardFee>30</CardFee><Organizer>Pinewood OC</Organizer></oData>
<ControlList>
<Control><Id>31</Id><Updated>20210509101010</Updated><Name></Name><Numbers>31</Numbers><Status>0</Status></Control>
<Control><Id>32</Id><Numbers>32;132</Numbers><Status>0</Status><oData><TimeAdjust>0</TimeAdjust><Radio>1</Radio></oData></Control>
<Control><Id>50</Id><Numbers>77</Numbers><Status>1</Status></Control>
</ControlList>
<CourseList><Course><Id>4</Id><Name>Course 1</Name><Length>3100</Length><Controls>31;32;50;</Controls><Legs>900;1200;700;300</Legs><oData><Climb>75</Climb></oData></Course></CourseList>
<ClassList><Class><Id>2</Id><Name>Open</Name><Course>4</Course><oData><FirstStart>3600</FirstStart><StartInterval>120</StartInterval></oData></Class></ClassList>
<ClubList><Club><Id>7</Id><Name>Pinewood OC</Name><oData><ShortName>PWD</ShortName></oData></Club></ClubList>
<RunnerList>
<Runner><Id>1</Id><Updated>20210509101010</Updated><Name>Quill, Rosa</Name><Start>3600</Start><Finish>5523</Finish><Status>1</Status><CardNo>801234</CardNo><StartNo>12</StartNo>
<Club>7</Club><Class>2</Class>
<Card><CardNo>801234</CardNo><Punches>3-3500;1-3600;31-4100;32-4800;77-5200;2-5523;</Punches><ReadId>12345</ReadId><Id>1</Id></Card>
<oData><BirthYear>1988</BirthYear><Sex>F</Sex><Bib>12</Bib><ExtId>4455</ExtId><CardFee>30</CardFee></oData></Runner>
<Runner><Id>2</Id><Name>Sten Tarn</Name><Start>3720</Start><Finish>0</Finish><Status>20</Status><CardNo>801235</CardNo><Class>2</Class></Runner>
<Runner><Id>3</Id><Name>Vakant</Name><Start>3840</Start><Status>0</Status><CardNo>0</CardNo><Class>2</Class></Runner>
<Runner><Id>4</Id><Name>Ulla Marie Voss</Name><Status>3</Status><CardNo>801237</CardNo><Class>2</Class>
<Card><CardNo>801237</CardNo><Punches>1-3900;31-4500;2-5000;</Punches><Id>3</Id></Card></Runner>
</RunnerList>
<TeamList><Team><Id>1</Id><StartNo>1</StartNo><Name>Pinewood 1</Name><Status>0</Status><Runners>1;0;4;</Runners><Club>7</Club><Class>2</Class></Team></TeamList>
<PunchList><Punch><CardNo>801236</CardNo><Time>4000</Time><Type>32</Type><Id>1</Id></Punch><Punch><CardNo>801235</CardNo><Time>6000</Time><Type>2</Type><Id>2</Id></Punch></PunchList>
<CardList><Card><CardNo>777</CardNo><Punches>31-4200;2--1;</Punches><Id>2</Id></Card></CardList>
</meosdata>`;
const a = readMeos(OLD), Z = 32400;
eq(a.info, { version: "3.8", tenths: false, vacant: 1 }, "MeOS 3.8, whole seconds: version, no tenths, a vacant place left out");
eq(a.set.event, { name: "Whole seconds", date: "2021-05-09", zero: Z + 3600, meosZero: Z }, "3.8: the zero time and the first start");
eq(a.set.controls, [{ code: 31 }, { code: 32, any: [132], radio: true }, { code: 77, kind: "bad" }], "3.8: controls — codes, a radio control, one marked bad");
eq(a.set.courses, [{ name: "Course 1", length: 3100, climb: 75, controls: [31, 32, 77] }], "3.8: a course lists control Ids: read as their codes");
eq(a.set.classes, [{ name: "Open", course: "Course 1", first: Z + 3600, step: 120 }], "3.8: the class");
eq(a.set.runners, [
  { key: "r1", family: "Quill", given: "Rosa", club: "Pinewood OC", cls: "Open", card: 801234, start: Z + 3600, clubCode: "PWD", bib: "12", birth: 1988, sex: "F", lic: "4455", rent: 1, startNo: 12 },
  { key: "r2", family: "Tarn", given: "Sten", club: null, cls: "Open", card: 801235, start: Z + 3720, status: "dns" },
  { key: "r4", family: "Marie Voss", given: "Ulla", club: null, cls: "Open", card: 801237, start: null }], "3.8: runners — « Family, Given », else the first word given");
eq(a.set.reads, [
  { card: 801234, start: Z + 3600, finish: Z + 5523, check: Z + 3500, punches: [[31, Z + 4100], [32, Z + 4800], [77, Z + 5200]], runnerKey: "r1", of: 0 },
  { card: 801237, start: Z + 3900, finish: Z + 5000, check: null, punches: [[31, Z + 4500]], runnerKey: "r4", of: 2 },
  { card: 777, start: null, finish: null, check: null, punches: [[31, Z + 4200]], runnerKey: null, of: null }], "3.8: cards — types 1, 2, 3 are start, finish, check; « 2--1 » no finish time");
eq(a.oracle.map((o) => [o.family, o.status, o.time, o.start, o.finish]), [["Quill", "ok", 1923, Z + 3600, Z + 5523], ["Tarn", "dns", null, Z + 3720, null],
  ["Marie Voss", "mp", null, Z + 3900, null]], "3.8: oracle — a finish of 0 is none; a start from the card's start punch");
eq(a.set.teams, [{ name: "Pinewood 1", club: "Pinewood OC", cls: "Open", runners: [0, null, 2] }], "3.8: a team's runners by leg, as places in the runners' list");
eq(a.set.radio, [{ code: 32, card: 801236, s: Z + 4000 }, { code: 2, card: 801235, s: Z + 6000, kind: "finish" }], "3.8: free punches, a finish among them");

const NEW = `<?xml version="1.0" encoding="UTF-8"?>
<meosdata version="5.0">
<Name>Tenths</Name><Date>2026-03-14</Date><ZeroTime>32400</ZeroTime>
<ControlList><Control><Id>31</Id><Numbers>31</Numbers><Status>0</Status></Control></ControlList>
<CourseList><Course><Id>1</Id><Name>Sprint</Name><Length>2100</Length><Controls>31;</Controls></Course></CourseList>
<ClassList><Class><Id>1</Id><Name>Elite</Name><Course>1</Course></Class></ClassList>
<RunnerList>
<Runner><Id>1</Id><Name>Wren, Ines</Name><Start>3600</Start><Finish>4450.7</Finish><Status>1</Status><CardNo>8001234</CardNo><Class>1</Class>
<Card><CardNo>8001234</CardNo><Punches>3--1.0;1-3600.2@1;31-4100.5@31#17;2-4450.7#9;</Punches><Voltage>2980</Voltage><Id>1</Id></Card>
<oData><TimeAdjust>-30</TimeAdjust><BirthYear>2001-06-30</BirthYear><Sex>K</Sex></oData></Runner>
<Runner><Id>2</Id><Name>Yew, Karl</Name><Start>3660</Start><Finish>4500</Finish><Status>5</Status><CardNo>8001235</CardNo><Class>1</Class></Runner>
<Runner><Id>3</Id><Name>Zorn, Mila</Name><Start>3720</Start><Finish>4699.95</Finish><Status>6</Status><CardNo>8001236</CardNo><Class>1</Class></Runner>
</RunnerList>
<PunchList><Punch><CardNo>8001236</CardNo><Time>4100.3</Time><Type>31</Type><Unit>31</Unit><Origin>5</Origin><Id>1</Id></Punch></PunchList>
</meosdata>`;
const b = readMeos(NEW);
eq(b.info, { version: "5.0", tenths: true, vacant: 0 }, "MeOS 3.9 and later, tenths as decimals: found by the text");
eq(b.set.event, { name: "Tenths", date: "2026-03-14", zero: Z + 3600, meosZero: Z, tenths: true }, "tenths: a finish with tenths makes the event rank on them");
eq(b.set.reads, [{ card: 8001234, start: Z + 3600.2, finish: Z + 4450.7, check: Z - 1, punches: [[31, Z + 4100.5]], runnerKey: "r1", of: 0, mv: 2980 }],
  "tenths: « 31-4100.5@31#17 » — unit and origin dropped; « 3--1.0 » is one second before the zero time");
eq(b.oracle.map((o) => [o.family, o.status, o.time, o.finish, o.adj ?? 0]), [["Wren", "ok", 820.7, Z + 4450.7, -30], ["Yew", "dsq", 840, Z + 4500, 0], ["Zorn", "ot", 979.95, Z + 4699.95, 0]],
  "tenths: oracle — the time counts the runner's adjustment; hundredths kept too");
eq(b.set.runners.map((r) => [r.family, r.birth ?? null, r.sex ?? null, r.adj ?? null, r.status ?? null]), [["Wren", "2001-06-30", "F", -30, null], ["Yew", null, null, null, "dsq"], ["Zorn", null, null, null, null]],
  "tenths: a birth date, MeOS's letters for the sex, a disqualification kept with the runner");
eq(b.set.radio, [{ code: 31, card: 8001236, s: Z + 4100.3 }], "tenths: a radio punch");
let threw = false;
try { readMeos("<EventList/>"); } catch (e) { threw = true; }
ok(threw, "another XML file is refused");

// ---- MOP: written here, read by live/src/mop.js
const withRadio = (v) => {
  for (const r of v.byRunner.values()) { if (r.family === "Alder") r.radio = [{ code: 33, t: 900 }]; if (r.family === "Gale") r.radio = [{ code: 33, t: 960 }]; }
  return v;
};
withRadio(view);
const xml = mopComplete(view), doc = liveXml(xml), names = (d) => d.kids.map((k) => k.name).join(" ");
eq([doc.name, doc.attrs.xmlns], ["MOPComplete", "http://www.melin.nu/mop"], "MOPComplete and its namespace");
eq(names(doc), ["competition", "ctrl", "cls", "cls", "cls", "org", "org", ...Array(8).fill("cmp")].join(" "), "the elements in MeOS's order");
eq([doc.kids[0].attrs.date, doc.kids[0].attrs.zerotime, doc.kids[0].text], ["2026-11-21", "10:00:00", SET.event.name], "competition: date, zero time, name");
eq([doc.kids[1].attrs.id, doc.kids[1].text], ["33", "33"], "ctrl: the radio control");
const clsEls = doc.kids.filter((k) => k.name === "cls"), orgEls = doc.kids.filter((k) => k.name === "org"), cmpEls = doc.kids.filter((k) => k.name === "cmp");
eq(clsEls.map((k) => [k.text, k.attrs.id, k.attrs.radio, k.attrs.ord]), view.classes.map((c, i) => [c.name, String(mopNum(c.id)), c.name === "M21" ? "33" : "", String((i + 1) * 10)]),
  "cls: name, a number from the class's id, its radio controls, its order");
eq(orgEls.map((k) => k.text).sort(), ["Northwood OK", "Riverbend Orienteers"], "org: the clubs");
const STAT = { ok: 1, mp: 3, dnf: 4, dsq: 5, ot: 6, dns: 20, nc: 99, run: 0, wait: 0 };
const orgOf = Object.fromEntries(orgEls.map((k) => [k.text, k.attrs.id]));
const wantCmp = (r, c) => ({ id: String(mopNum(r.id)), card: String(r.card), competing: r.status === "run" ? "true" : undefined, name: `${r.given} ${r.family}`, org: orgOf[r.club],
  cls: String(mopNum(c.id)), stat: String(STAT[r.status]), st: String(r.start * 10), rt: String(STAT[r.status] && r.status !== "dns" && r.time ? r.time * 10 : 0), bib: String(r.bib),
  radio: r.radio ? r.radio.map((p) => `${p.code},${p.t * 10}`).join(";") : undefined, input: "0" });
const gotCmp = (k) => { const base = k.kids.find((e) => e.name === "base"); return { id: k.attrs.id, card: k.attrs.card, competing: k.attrs.competing, name: base.text, org: base.attrs.org,
  cls: base.attrs.cls, stat: base.attrs.stat, st: base.attrs.st, rt: base.attrs.rt, bib: base.attrs.bib, radio: k.kids.find((e) => e.name === "radio")?.text, input: k.kids.find((e) => e.name === "input")?.attrs.it }; };
const allRows = (v) => v.classes.flatMap((c) => c.rows.map((r) => wantCmp(r, c)));
allRows(view).forEach((w, i) => eq(gotCmp(cmpEls[i]), w, `cmp ${w.name}: stat ${w.stat}, st ${w.st}, rt ${w.rt}${w.radio ? `, radio ${w.radio}` : ""}${w.competing ? ", competing" : ""}`));
ok(new Set(cmpEls.map((k) => k.attrs.id)).size === 8 && cmpEls.every((k) => /^\d+$/.test(k.attrs.id) && Number(k.attrs.id) < 2 ** 31), "cmp numbers: whole, distinct, 31 bits");
eq([mopNum("17"), mopNum("abc") === mopNum("abc"), mopNum("abc") !== mopNum("abd"), mopNum("0123") >= 2 ** 30], [17, true, true, true], "numbers: digits stay, anything else hashed the same every time");
ok(mopComplete(buildView(race().state, { now: H(11) })).length > 0 && mopComplete(withRadio(buildView(L.state, { now: H(11) }))) === xml, "the same race gives the same document");

// the project's reader takes it
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
const viewB = withRadio(buildView(L.state, { now: H(11) })), diff = liveXml(mopDiff(view, viewB));
eq([diff.name, names(diff)], ["MOPDiff", "cmp"], "a runner finishes: a MOPDiff of one cmp");
eq(gotCmp(diff.kids[0]), { ...wantCmp(viewB.byRunner.get(gale.id), viewB.classes.find((c) => c.name === "M21")), competing: undefined }, "the diff's cmp: stat 1, rt 18900, no longer competing");
eq([gotCmp(diff.kids[0]).stat, gotCmp(diff.kids[0]).rt], ["1", "18900"], "… its figures");
await fold(mopDiff(view, viewB));
eq(live().rows.filter((r) => r[4] === 0).map((r) => [r[0], r[1], r[3]]).sort((x, y) => x[0] - y[0]), [[1, "Nils Gale", 189000], [2, "Marek Alder", 200000], [3, "Tomas Birch", 216000]], "the reader after the diff: a new leader");
eq(names(liveXml(mopDiff(viewB, viewB))), "", "nothing changed: an empty diff");
ok(mopDiff(null, view) === xml, "no earlier view: the whole race");
// one goes, a class goes
L.add("put", { c: "runners", id: gale.id, p: null });
const viewC = withRadio(buildView(L.state, { now: H(11) })), gone = liveXml(mopDiff(viewB, viewC));
eq([gone.name, gone.kids.map((k) => [k.name, k.attrs.id, k.attrs.delete])], ["MOPDiff", [["cmp", String(mopNum(gale.id)), "true"]]], "a runner removed: <cmp id delete=\"true\"/>");
await fold(mopDiff(viewB, viewC));
eq(live().rows.length, 2, "the reader drops them");
const fewer = { ...viewC, classes: viewC.classes.filter((c) => c.name !== "W21") };
eq(liveXml(mopDiff(viewC, fewer)).name, "MOPComplete", "a class gone: the whole race again, as MeOS does");

// every control as a radio control; a control passed twice; the exporters' view
const all = liveXml(mopComplete(view, { radio: "all" }));
eq(all.kids.filter((k) => k.name === "cls").map((k) => k.attrs.radio).sort(), ["31,32,33,34,35", "31,32,33,34,35", "31,36,35"].sort(), "radio \"all\": each course's controls");
eq(all.kids.find((k) => k.name === "cmp" && k.kids[0].text === "Iris Cedar").kids.find((e) => e.name === "radio").text, "31,4000;32,9000;34,17000;35,22000", "radio \"all\": the splits of a card, the missing control left out");
eq(liveXml(mopComplete(view, { radio: [33, 35] })).kids.filter((k) => k.name === "cls").map((k) => k.attrs.radio).sort(), ["33,35", "33,35", "35"], "radio by codes: those of each course");
const loop = liveXml(mopComplete({ event: { name: "Loop", date: "2026-11-21" }, classes: [{ id: 5, name: "Butterfly", course: { controls: [31, 32, 31] },
  rows: [{ id: 9, family: "Ash", given: "Bo", club: "Northwood OK", card: 1, start: H(10), time: 600, status: "ok", splits: [{ code: 31, t: 100 }, { code: 32, t: 300 }, { code: 31, t: 500 }] }] }] }, { radio: "all" }));
eq([loop.kids.filter((k) => k.name === "ctrl").map((k) => [k.attrs.id, k.text]), loop.kids.find((k) => k.name === "cls").attrs, loop.kids.find((k) => k.name === "cmp").kids[1].text],
  [[["31", "31"], ["32", "32"], ["100031", "31-2"]], { id: "5", ord: "10", radio: "31,32,100031" }, "31,1000;32,3000;100031,5000"], "a control passed twice: a second number, « 31-2 »");
const plain = liveXml(mopComplete(exportView(view)));
eq([plain.kids.filter((k) => k.name === "cmp").length, new Set(plain.kids.filter((k) => k.name === "cmp").map((k) => k.attrs.id)).size], [8, 8], "the exporters' view (no ids): numbers from card and name");
const relay = liveXml(mopComplete({ event: {}, classes: [{ id: "rel", name: "Relay", rows: [{ id: "a", family: "Ash", given: "Bo", status: "ok", time: 600, start: H(10) }, { id: "b", family: "Bay", given: "Cy", status: "run", start: H(10, 10) }],
  teams: [{ id: "t1", name: "Northwood 1", club: "Northwood OK", status: "run", start: H(10), runners: ["a", "b", null] }] }] }));
eq([names(relay), relay.kids.find((k) => k.name === "tm").kids.map((k) => k.name), relay.kids.find((k) => k.name === "tm").kids[1].text],
  ["competition cls org tm cmp cmp", ["base", "r"], `${mopNum("a")};${mopNum("b")};0`], "a relay team: <tm> with its runners by leg");

// ---- SIRAP
eq(SIRAP_PORT, 10000, "SIRAP: MeOS's default port");
const pk = buildPunch({ code: 33, card: 500007, t: H(10, 20) + 0.5 });
eq([...pk], [0, 33, 0, 0x27, 0xa1, 0x07, 0x00, 0, 0, 0, 0, 0x25, 0xad, 0x05, 0x00], "a punch: 15 bytes — type 0, code, card, code day 0, tenths after midnight, little-endian");
eq(parseSirap(pk), [{ kind: "punch", code: 33, card: 500007, t: 37200.5 }], "build → parse: { kind, code, card, t }");
eq(parseSirap(buildPunch({ code: 1023, card: 16777215 + 5, t: 86399.9 })), [{ kind: "punch", code: 1023, card: 16777220, t: 86399.9 }], "the largest code, a 4-byte card number, the day's last tenth");
const cardPk = buildCard({ card: 8001234, check: H(9, 50), start: H(10), finish: H(10, 31, 12.3), punches: [[31, H(10, 5)], { code: 32, t: H(10, 12, 30.5) }] });
eq([cardPk.length, cardPk[0], cardPk[1], cardPk[2]], [15 + 8 * 5, 64, 5, 0], "a whole card: type 64, the number of records, 8 bytes each");
const wantCard = { kind: "card", card: 8001234, start: H(10), finish: 37872.3, check: H(9, 50), punches: [{ code: 31, t: H(10, 5) }, { code: 32, t: 36750.5 }] };
eq(parseSirap(cardPk), [wantCard], "a card parsed: codes 1, 2, 3 are start, finish, check");
const stream = new Uint8Array([...pk, ...cardPk, ...buildPunch({ code: 45, card: 12, t: 1 })]), wantAll = [{ kind: "punch", code: 33, card: 500007, t: 37200.5 }, wantCard, { kind: "punch", code: 45, card: 12, t: 1 }];
eq(parseSirap(stream), wantAll, "three packets in one buffer");
for (const size of [1, 4, 7, 16, 33]) {
  const dec = new SirapDecoder(), got = [];
  for (let i = 0; i < stream.length; i += size) got.push(...dec.push(stream.subarray(i, i + size)));
  ok(JSON.stringify(got) === JSON.stringify(wantAll) && dec.pending === 0, `a stream cut in chunks of ${size}: the same messages, nothing left`);
}
const dec = new SirapDecoder();
eq([dec.push(stream.subarray(0, 20)).length, dec.pending, dec.push(stream.subarray(20).buffer.slice(stream.byteOffset + 20)).length], [1, 5, 2], "a packet cut in two waits for its end (an ArrayBuffer is taken too)");
eq(parseSirap(buildPunch({ code: 1, card: 9, t: 0, type: 64 })), [{ kind: "punch", code: 1, card: 9, t: 0, type: 64 }], "type 64 with one record is no card: a punch, as MeOS takes it");
let range = false;
try { buildCard({ card: 1, finish: 10 }); } catch (e) { range = e instanceof RangeError; }
ok(range, "a card of one record cannot be sent");

console.log(`${n} checks, ${fails} failed`);
if (fails) process.exit(1);
