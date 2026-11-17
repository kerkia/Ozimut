// Chrono's model: what the screens and the formats do to the log (docs/chrono/design.md). Rows are found by what people
// know them by — a licence, a name and a club, a class's or a course's name —, never by ids, which only the log makes.

import { newId } from "./log.js";
import { normaliseRead } from "./times.js";
import { ownerOf } from "./judge.js";

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameKey = (family, given, club) => `${norm(family)}|${norm(given)}|${club || ""}`;
const filled = (v) => v !== undefined && v !== null && v !== "";

/** Maps from names to ids, for one pass over the state. */
export function lookups(st) {
  const L = { club: new Map(), clubCode: new Map(), cls: new Map(), course: new Map(), lic: new Map(), name: new Map(), card: new Map() };
  for (const c of Object.values(st.clubs)) { L.club.set(norm(c.name), c.id); if (c.code) L.clubCode.set(String(c.code).toUpperCase(), c.id); }
  for (const c of Object.values(st.classes)) L.cls.set(norm(c.name), c.id);
  for (const c of Object.values(st.courses)) L.course.set(norm(c.name), c.id);
  for (const r of Object.values(st.runners)) {
    if (r.lic) L.lic.set(String(r.lic), r.id);
    L.name.set(nameKey(r.family, r.given, r.club), r.id);
    if (r.card) L.card.set(Number(r.card), r.id);
  }
  return L;
}

const RUNNER_FIELDS = ["family", "given", "card", "lic", "cat", "sex", "birth", "bib", "start", "nat", "rent", "fee", "paid", "kind", "status", "note", "leg"];

/**
 * A set read from a file (design.md) as operations. Rows already there — the same licence, else the same name in the same
 * club; the same class, course or club name — are updated, never doubled. Returns what it did.
 */
export function importSet(log, set, { by = "", event = true } = {}) {
  const st = log.state, L = lookups(st), rows = [];
  const did = { clubs: 0, courses: 0, classes: 0, added: 0, updated: 0, reads: 0, controls: 0 };
  const seenCodes = new Set(Object.keys(st.controls).map(Number));
  const control = (code, p = {}) => {
    const n = Number(code);
    if (!Number.isFinite(n) || n <= 0) return;
    if (!seenCodes.has(n) || Object.keys(p).length) { rows.push(["controls", String(n), p]); if (!seenCodes.has(n)) did.controls++; seenCodes.add(n); }
  };
  for (const c of set.controls || []) control(c.code, Object.fromEntries(Object.entries(c).filter(([k, v]) => k !== "code" && filled(v))));

  const clubId = (name, code) => {
    const key = code ? String(code).toUpperCase() : "", nk = norm(name);
    let id = (key && L.clubCode.get(key)) || (nk && L.club.get(nk)) || null;
    if (!id && !nk && !key) return null;
    const p = {};
    if (!id) { id = newId(); did.clubs++; p.name = name || key; if (key) p.code = code; }
    else { const was = st.clubs[id]; if (was && key && !was.code) p.code = code; }
    if (Object.keys(p).length) rows.push(["clubs", id, p]);
    if (nk) L.club.set(nk, id);
    if (key) L.clubCode.set(key, id);
    return id;
  };
  const courseId = (name, c = null) => {
    const nk = norm(name);
    if (!nk) return null;
    let id = L.course.get(nk);
    const p = {};
    if (!id) { id = newId(); did.courses++; p.name = name; p.controls = []; L.course.set(nk, id); }
    if (c) {
      for (const k of ["length", "climb", "score"]) if (filled(c[k])) p[k] = c[k];
      if (Array.isArray(c.controls)) { p.controls = c.controls.map(Number).filter((n) => n > 0); for (const code of p.controls) control(code); }
    }
    if (Object.keys(p).length) rows.push(["courses", id, p]);
    return id;
  };
  const classId = (name, c = null) => {
    const nk = norm(name);
    if (!nk) return null;
    let id = L.cls.get(nk);
    const p = {};
    if (!id) { id = newId(); did.classes++; p.name = name; L.cls.set(nk, id); }
    if (c) {
      if (filled(c.course)) p.course = courseId(c.course);
      if (Array.isArray(c.pool)) p.pool = c.pool.map((n) => courseId(n)).filter(Boolean);
      if (Array.isArray(c.legs)) p.legs = c.legs.map((l) => ({ ...(l.course ? { course: courseId(l.course) } : {}), ...(l.pool ? { pool: l.pool.map((n) => courseId(n)).filter(Boolean) } : {}), ...(filled(l.mass) ? { mass: l.mass } : {}) }));
      for (const k of ["first", "step", "nc", "fee", "maxTime"]) if (filled(c[k])) p[k] = c[k];
    }
    if (Object.keys(p).length) rows.push(["classes", id, p]);
    return id;
  };

  for (const c of set.clubs || []) clubId(c.name, c.code);
  for (const c of set.courses || []) courseId(c.name, c);
  for (const c of set.classes || []) classId(c.name, c);

  const ids = [];
  for (const r of set.runners || []) {
    const club = clubId(r.club, r.clubCode), cls = classId(r.cls);
    let id = (r.lic && L.lic.get(String(r.lic))) || L.name.get(nameKey(r.family, r.given, club)) || null;
    const p = {};
    for (const k of RUNNER_FIELDS) if (filled(r[k])) p[k] = k === "card" ? Number(r[k]) || null : r[k];
    if (club) p.club = club;
    if (cls) p.cls = cls;
    if (filled(r.course)) p.course = courseId(r.course);
    if (id) did.updated++; else { id = newId(); did.added++; }
    if (r.lic) L.lic.set(String(r.lic), id);
    L.name.set(nameKey(r.family, r.given, club), id);
    rows.push(["runners", id, p]);
    ids.push(id);
  }
  for (const tm of set.teams || []) {
    const cls = classId(tm.cls), club = clubId(tm.club, tm.clubCode), id = newId();
    const members = (tm.runners || []).map((i) => ids[i]).filter(Boolean);
    rows.push(["teams", id, { name: tm.name, bib: tm.bib, cls, club, runners: members }]);
    members.forEach((rid, i) => rows.push(["runners", rid, { team: id, leg: i + 1 }]));
  }

  if (event && set.event) {
    const p = {};
    for (const [k, v] of Object.entries(set.event)) if (filled(v) && !filled(st.event[k])) p[k] = v;
    if (Object.keys(p).length) log.add("ev", { p }, by);
  }
  for (let i = 0; i < rows.length; i += 400) log.add("many", { rows: rows.slice(i, i + 400) }, by);
  for (const x of set.reads || []) {
    const r = { id: newId(), card: Number(x.card) || 0, sys: x.sys || "file", at: x.at || Date.now(), start: x.start ?? null, finish: x.finish ?? null,
      check: x.check ?? null, clear: x.clear ?? null, punches: (x.punches || []).map(([c, s]) => [Number(c), s]) };
    if (x.rel) r.rel = 1;
    if (x.of != null && ids[x.of]) r.runner = ids[x.of];
    log.add("read", { r }, by);
    did.reads++;
  }
  return did;
}

const sigOf = (r) => `${r.start ?? ""}|${r.finish ?? ""}|${(r.punches || []).map((p) => p.join(":")).join(",")}`;

/** A card just read by a reader: kept (once), and given to its holder when there is no doubt. */
export function takeRead(log, raw, by = "") {
  const st = log.state, r = normaliseRead(raw, st.event.zero);
  const sig = sigOf(r);
  const same = Object.values(st.reads).find((x) => x.card === r.card && sigOf(x) === sig);
  if (same) return { read: same, dup: true, runner: same.runner || null };
  r.id = newId();
  const owner = ownerOf(st, r.card);
  if (owner) r.runner = owner;
  log.add("read", { r }, by);
  return { read: log.state.reads[r.id], dup: false, runner: owner };
}

/** A read given to a runner (their card number follows it), or set aside (`runner` 0), or freed (null). */
export function assignRead(log, readId, runner, by = "") {
  const st = log.state, read = st.reads[readId];
  if (!read) return;
  log.add("assign", { id: readId, runner: runner ?? null }, by);
  const r = runner ? st.runners[runner] : null;
  if (r && read.card && Number(r.card) !== read.card) log.add("put", { c: "runners", id: r.id, p: { card: read.card } }, by);
}

export const put = (log, c, id, p, by = "") => log.add("put", { c, id, p }, by);
export function addRunner(log, fields, by = "") { const id = newId(); log.add("put", { c: "runners", id, p: fields }, by); return id; }
export function addRow(log, c, fields, by = "") { const id = c === "controls" ? String(fields.code) : newId(); log.add("put", { c, id, p: fields }, by); return id; }

/** The club of that name (made if new): its id. */
export function clubFor(log, name, code = "", by = "") {
  const L = lookups(log.state);
  const id = (code && L.clubCode.get(String(code).toUpperCase())) || L.club.get(norm(name));
  if (id || !norm(name)) return id || null;
  return addRow(log, "clubs", code ? { name, code } : { name }, by);
}

/** Free search over the entries: name, club, bib, card, licence; the best first. */
export function searchRunners(st, q, limit = 12) {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const r of Object.values(st.runners)) {
    const hay = `${norm(r.family)} ${norm(r.given)} ${norm(st.clubs[r.club]?.name)} ${r.bib ?? ""} ${r.card ?? ""} ${r.lic ?? ""}`;
    let score = 0;
    for (const w of words) { const at = hay.indexOf(w); if (at < 0) { score = -1; break; } score += at === 0 || hay[at - 1] === " " ? 2 : 1; }
    if (score > 0) out.push([score, r]);
  }
  return out.sort((a, b) => b[0] - a[0] || norm(a[1].family).localeCompare(norm(b[1].family))).slice(0, limit).map((x) => x[1]);
}

/** Seconds after the event day's local midnight, now. */
export function nowS(st, at = Date.now()) {
  const d = new Date(at), day = st?.event?.date ? new Date(`${st.event.date}T00:00:00`) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((d - day) / 100) / 10;
}
