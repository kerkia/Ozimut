// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// i18n-ignore-file: column headings of other programs' files, in the languages they are written in — data, not UI text.
// Delimited text files: SportSoftware's OE layouts (the 2003 one the French federation's archive and ranking files use, and
// the newer OE2010/OE12 ones) and any table with a heading row — entries from a spreadsheet. Columns are found by their
// headings, in French, English or German, so a layout with columns added or moved still reads; a file without a heading
// row that looks like OE 2003 is read by position. Written: the OE 2003 layout, the one the federation takes.

import { decodeText } from "../xml.js";
import { parseClock, parseSpan, clock, span } from "../times.js";

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Rows of cells; the separator is the one the first line uses most (« ; », tab or « , »). */
export function parseDelimited(text) {
  const src = String(text).replace(/^﻿/, ""), first = src.slice(0, src.indexOf("\n") < 0 ? src.length : src.indexOf("\n"));
  const sep = [";", "\t", ","].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  return { rows, sep };
}

// heading (folded) → field; a heading met twice takes the next field of its list (« Nom »: the runner's, then the club's)
const HEAD = {
  bib: ["stno", "n dep", "doss", "dossard", "startnr", "stnr", "bib", "start no"],
  card: ["chip", "chipno", "puce", "nr puce", "n puce", "si card", "sicard", "chipnr", "card", "ecard", "si", "carte", "brikke"],
  lic: ["database id", "ident base de donnees", "datenbank id", "licence", "license", "n licence", "numero de licence", "id", "member id"],
  family: ["surname", "nom", "nachname", "family", "last name", "family name", "name"],
  given: ["first name", "prenom", "vorname", "given", "given name", "firstname"],
  birth: ["yb", "ne", "jg", "an", "year", "annee", "birth", "naissance", "jahrgang", "born"],
  sex: ["s", "g", "sex", "sexe", "gender", "geschlecht"],
  block: ["block", "plage"],
  nc: ["nc", "ak"],
  start: ["start", "depart", "heure", "start time", "heure de depart", "startzeit"],
  finish: ["finish", "arrivee", "ziel"],
  time: ["time", "temps", "zeit"],
  status: ["classifier", "evaluation", "wertung", "status", "statut"],
  clubCode: ["club no", "n club", "club nr", "nr club", "club number", "numero club"],
  clubShort: ["cl name", "abk"],
  club: ["city", "ville", "ort", "club", "club name", "verein", "organisation", "organization", "team"],
  nat: ["nat", "nation", "country", "pays"],
  clsNo: ["cl no", "n cat", "katnr", "kat nr"],
  clsShort: ["short", "court", "kurz", "class", "classe", "categorie", "category", "cat", "kategorie", "klasse"],
  clsLong: ["long", "lang"],
  rent: ["rented", "louee", "gemietet", "location", "rental"],
  fee: ["start fee", "engagement", "startgeld", "fee", "tarif", "prix"],
  paid: ["paid", "paye", "bezahlt"],
  courseNo: ["course no", "circuit n", "bahnnr", "bahn nr"],
  course: ["course", "circuit", "bahn", "parcours"],
  km: ["km"],
  climb: ["m", "hm", "climb", "denivele"],
  nControls: ["course controls", "postes du circuit", "bahn posten", "controls"],
  place: ["pl", "place", "platz", "rang", "position"],
  startPunch: ["start punch", "poincon de depart", "start stempel"],
  finishPunch: ["finish punch", "arrivee p", "ziel stempel"],
};
const SECOND = { family: "clubShort", club: "town" };            // « Nom … Nom », « Ville … Ville »: the second is another column
const BY_HEAD = new Map();
for (const [f, names] of Object.entries(HEAD)) for (const n of names) if (!BY_HEAD.has(n)) BY_HEAD.set(n, f);
const OE2003 = ["bib", "card", "lic", "family", "given", "birth", "sex", "block", "nc", "start", "finish", "time", "status", "clubCode", "clubShort", "club", "nat",
  "clsNo", "clsShort", "clsLong", "", "", "", "", "", "", "", "", "", "", "town", "", "", "", "", "rent", "fee", "paid", "courseNo", "course", "km", "climb", "nControls", "place", "startPunch", "finishPunch"];

function columns(header) {
  const map = {}, seen = new Set();
  let first = -1;
  header.forEach((h, i) => {
    const k = fold(h), m = /^(?:control|poste|posten|nr|no)\s*(\d+)$/.exec(k);
    if (m && first < 0 && Number(m[1]) === 1) { first = i; return; }
    let f = BY_HEAD.get(k);
    if (!f) return;
    if (seen.has(f)) f = SECOND[f] || null;
    if (f && !seen.has(f)) { seen.add(f); map[f] = i; }
  });
  return { map, first, known: seen.size };
}

const STATUS = { 0: "ok", 1: "dns", 2: "dnf", 3: "mp", 4: "dsq", 5: "ot" };
const WORDS = { ok: "ok", pm: "mp", mp: "mp", abandon: "dnf", dnf: "dnf", abs: "dns", absent: "dns", dns: "dns", dsq: "dsq", disq: "dsq", hd: "ot", ot: "ot", nc: "nc" };

/**
 * A delimited file → `{ set, layout "oe2003"|"oe"|"table", rows (count), results (true when it holds times) }`, or null.
 * Club: the name column, else the short name; class: the short name; course with its length, climb and controls when given.
 */
export function readCsv(input) {
  const { rows } = parseDelimited(decodeText(input));
  if (!rows.length) return null;
  let { map, first, known } = columns(rows[0]);
  let body = rows.slice(1), layout = /^oe\d/i.test(rows[0][0] || "") ? "oe" : "table";
  if (known < 3) {
    // no heading row: OE 2003 by position when the cells look like it (a year, a clock time)
    if (rows[0].length < 20 || !/^\d{0,4}$/.test(rows[0][5] || "")) return null;
    map = Object.fromEntries(OE2003.map((f, i) => [f, i]).filter(([f]) => f)); first = 46; body = rows; layout = "oe2003";
  } else if (map.startPunch != null && map.finishPunch != null && map.clsNo != null && layout === "table") layout = "oe2003";
  if (map.family == null) return null;
  const set = { clubs: [], courses: [], classes: [], runners: [], reads: [] };
  const courses = new Map(), classes = new Map();
  let results = false;
  for (const r of body) {
    const g = (f) => (map[f] != null ? (r[map[f]] ?? "").trim() : "");
    let family = g("family"), given = g("given");
    if (!family && !given) continue;
    if (map.given == null && family.includes(" ")) {                                   // one « name » column: « DURAND Alix » or « Alix Durand »
      const parts = family.split(/\s+/), caps = parts.filter((p) => p.length > 1 && p === p.toUpperCase());
      if (caps.length && caps.length < parts.length) { family = caps.join(" "); given = parts.filter((p) => !caps.includes(p)).join(" "); }
      else { given = parts[0]; family = parts.slice(1).join(" "); }
    }
    const cls = g("clsShort") || g("clsLong"), course = g("course");
    const club = g("club") || g("clubShort"), clubCode = g("clubCode");
    if (cls && !classes.has(cls)) { const c = { name: cls, ...(course ? { course } : {}) }; classes.set(cls, c); set.classes.push(c); }
    const start = parseClock(g("start")) ?? parseClock(g("startPunch")), finish = parseClock(g("finish")) ?? parseClock(g("finishPunch")), time = parseSpan(g("time"));
    const sv = g("status"), status = sv === "" ? "" : STATUS[sv] ?? WORDS[fold(sv)] ?? "";
    const yb = g("birth"), year = /^\d{2}$/.test(yb) ? (Number(yb) > (new Date().getFullYear() % 100) ? 1900 : 2000) + Number(yb) : /^\d{4}/.test(yb) ? Number(yb.slice(0, 4)) : "";
    const sx = g("sex").toUpperCase(), fee = Number(g("fee").replace(",", "."));
    const at = set.runners.length;
    set.runners.push({ family, given, club, clubCode, cls, card: Number(g("card")) || undefined, lic: g("lic") || undefined, sex: sx ? (/^(F|D|W)/.test(sx) ? "F" : "M") : undefined,
      birth: year || undefined, bib: g("bib") || undefined, nat: g("nat") || undefined, start: start ?? undefined, rent: /^(x|1|oui|yes|ja)$/i.test(g("rent")) ? 1 : undefined,
      fee: fee > 0 ? fee : undefined, paid: /^(x|1|oui|yes|ja)$/i.test(g("paid")) ? 1 : undefined,
      status: ["dns", "dsq"].includes(status) || /^(x|1)$/i.test(g("nc")) ? (status === "ok" || !status ? "nc" : status) : undefined });
    // the controls and the times at them
    const pairs = [];
    if (first >= 0) for (let i = first; i + 1 < r.length; i += 2) { const code = Number(r[i]); if (code > 0) pairs.push([code, parseSpan((r[i + 1] || "").trim())]); }
    if (course && !courses.has(course)) {
      const km = Number(g("km").replace(",", ".")), up = Number(g("climb")), n = Number(g("nControls"));
      const c = { name: course, length: km > 0 ? Math.round(km * 1000) : null, climb: up > 0 ? up : null };
      courses.set(course, c); set.courses.push(c);
      c.n = n > 0 ? n : null;
    }
    const c = courses.get(course);
    if (c && !c.controls && pairs.length && (status === "ok" || (c.n && pairs.length === c.n))) c.controls = pairs.map((p) => p[0]);
    const t0 = start ?? (finish != null && time != null ? finish - time : time != null || pairs.some((p) => p[1] != null) ? 0 : null);
    if (t0 != null && (finish != null || time != null || pairs.some((p) => p[1] != null))) {
      results = true;
      const clockTimes = start != null && pairs.some((p) => p[1] != null && p[1] >= start);     // punches written as clock times, not from the start
      set.reads.push({ card: Number(g("card")) || 0, start: null, finish: finish ?? (time != null && status !== "dnf" ? t0 + time : null),
        punches: pairs.filter((p) => p[1] != null).map(([code, t]) => [code, clockTimes ? t : t0 + t]).sort((a, b) => a[1] - b[1]), of: at });
    }
  }
  for (const c of set.courses) delete c.n;
  if (!set.reads.length) delete set.reads;
  return { set, layout, rows: set.runners.length, results };
}

const HEAD_FR = "N° dép.;Puce;Ident. base de données;Nom;Prénom;Né;S;Plage;nc;Départ;Arrivée;Temps;Evaluation;N° club;Nom;Ville;Nat;N° cat.;Court;Long;Num1;Num2;Num3;Text1;Text2;Text3;"
  + "Adr. nom;Rue;Ligne2;Code Post.;Ville;Tél.;Fax;E-mail;Id/Club;Louée;Engagement;Payé;Circuit N°;Circuit;km;m;Postes du circuit;Pl;Poinçon de départ;Arrivée (P)";
const HEAD_EN = "Stno;SI card;Database Id;Surname;First name;YB;S;Block;nc;Start;Finish;Time;Classifier;Club no.;Cl.name;City;Nat;Cl. no.;Short;Long;Num1;Num2;Num3;Text1;Text2;Text3;"
  + "Adr. name;Street;Line2;Zip;City;Phone;Fax;EMail;Id/Club;Rented;Start fee;Paid;Course no.;Course;km;m;Course controls;Pl;Start punch;Finish punch";
const CODE = { ok: 0, dns: 1, dnf: 2, mp: 3, dsq: 4, ot: 5, nc: 0, run: 1, wait: 1 };
const cellOut = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/**
 * A view (design.md) in the OE 2003 layout: one line a runner, the controls and the times from the start after the fixed
 * columns. `lang`: "fr" (the federation's headings) or "en"; `sexes`: how the file writes men and women (["H", "F"]).
 */
export function writeOeCsv(view, { lang = "fr", sexes = lang === "fr" ? ["H", "F"] : ["M", "F"] } = {}) {
  const most = Math.max(0, ...view.classes.flatMap((k) => k.rows.map((r) => r.splits.length)));
  const ctl = lang === "fr" ? ["Poste", "Poinçon"] : ["Control", "Punch"];
  const head = (lang === "fr" ? HEAD_FR : HEAD_EN) + ";" + Array.from({ length: Math.max(most, 1) }, (_, i) => `${ctl[0]}${i + 1};${ctl[1]}${i + 1}`).join(";") + ";";
  const lines = [head], courseNo = new Map(), clsNo = new Map();
  for (const k of view.classes) {
    const c = k.course || {};
    if (c.name && !courseNo.has(c.name)) courseNo.set(c.name, courseNo.size + 1);
    if (!clsNo.has(k.name)) clsNo.set(k.name, clsNo.size + 1);
    for (const r of k.rows) {
      const cat = r.cls || k.name, done = r.time != null && ["ok", "mp", "ot", "nc"].includes(r.status);
      const cells = [r.bib ?? "", r.card || "", r.lic || "", r.family, r.given, r.birth ? String(r.birth).slice(-2) : "", r.sex ? (/^(f|d|w)/i.test(r.sex) ? sexes[1] : sexes[0]) : "", "",
        r.status === "nc" ? "X" : "0", clock(r.start), clock(r.finish), done ? span(r.time) : "", CODE[r.status] ?? 0, r.clubCode || "", r.clubCode || "", r.club || "", r.nat || "",
        clsNo.get(cat) ?? clsNo.set(cat, clsNo.size + 1).get(cat), cat, cat, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", r.rent ? "X" : "0", "", "",
        c.name ? courseNo.get(c.name) : "", c.name || "", c.length != null ? (c.length / 1000).toFixed(3) : "", c.climb != null ? Math.round(c.climb) : "", (c.controls || r.splits).length,
        r.place ?? "", clock(r.start), clock(r.finish)];
      for (const s of r.splits) cells.push(s.code, s.t == null ? "-----" : span(s.t));
      lines.push(cells.map(cellOut).join(";") + ";");
    }
  }
  return lines.join("\r\n") + "\r\n";
}

const LATIN = { "Œ": "OE", "œ": "oe", "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "€": "EUR", " ": " " };
/** Text as windows-1252 bytes, the encoding these files are read in; what it cannot hold is written plainly. */
export function latin1(text) {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (const ch of text) {
    let s = ch;
    if (ch.codePointAt(0) > 255) s = LATIN[ch] ?? ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const c of s) out[n++] = c.codePointAt(0) > 255 ? 63 : c.codePointAt(0);
  }
  return out.subarray(0, n);
}

/**
 * Before a file goes to a federation: what it would refuse or misread. `[{ kind, level, runner?, n? }]` — nolic (no licence
 * number), noclub, nocard, nocat, out (still out), loose (cards given to nobody), nocourse (a class without a course).
 */
export function preflight(view, { licence = null, needLic = true } = {}) {
  const out = [];
  if (view.loose?.length) out.push({ kind: "loose", level: "stop", n: view.loose.length });
  for (const k of view.classes) {
    if (k.rows.length && !k.course && k.id) out.push({ kind: "nocourse", level: "stop", cls: k.name });
    for (const r of k.rows) {
      if (r.status === "run") out.push({ kind: "out", level: "stop", runner: r.id });
      if (r.status === "dns" || r.status === "wait") continue;
      if (needLic && !r.lic) out.push({ kind: "nolic", level: "warn", runner: r.id });
      else if (r.lic && licence && !licence.test(String(r.lic))) out.push({ kind: "badlic", level: "warn", runner: r.id });
      if (!r.club) out.push({ kind: "noclub", level: "info", runner: r.id });
      if (!r.cat && !r.clsName) out.push({ kind: "nocat", level: "warn", runner: r.id });
    }
  }
  return out;
}
