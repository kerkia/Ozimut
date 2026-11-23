// Chrono's welcome desk linked to the entries (docs/clubs/design.md §5): Ozimut is a server station `ozimut` of an Orga
// event's Chrono log (« e<event id> », R2 chrono/<log>/, _lib/chronolog.js). It writes the event's entries there as runners
// (toChrono) and reads back what the desk did to them (fromChrono); both are one pass, `link`.
//
// Written: one runner per entry, id `entries.chrono_id` (« oz<entry id> » when Ozimut made it), fields { family, given, club,
// cls, cat, card, lic, birth, sex, rent, fee (the price in the currency's units), paid (1 when nothing is to be collected at
// the desk: paid, waived, or carried by a club), start, status, oz (the entry's id), payClub (the club that carries it) };
// classes and clubs put when missing, matched by name (a club by its number first) to those Chrono already has. An entry
// cancelled, or marked absent, is a runner with status « dns »: Chrono reads IOF's « Cancelled » the same way
// (io/iofxml.js), its desk and lists leave such runners aside, and a read or a note the desk tied to the runner stays.
// An entry deleted for good removes its runner. A pending entry (an e-mail never confirmed) is not written.
// Only the fields whose value changed since Ozimut last agreed with Chrono are written (`oz.json` `rec`), so what the desk
// changed and the entries cannot hold (a class the form does not have, a fee) is never written over.
//
// Read back: the other stations' operations since the last pass (`oz.json` `have`, mirrored in entry_forms.chrono_seen), on
// runners of entries: paid (pay_state paid, paid_how « cash » — the desk takes cash on the day; a payment the desk takes
// back undoes only its own), card, rented card, class (by name), names, start, status « dns » (the entry absent, and back),
// the runner deleted (the entry cancelled). A runner added at the desk (a `put` with a name, not an import's `many`) becomes
// an entry of origin « desk », its fee its price.
//
// Written after every change of entries (_lib/entries.js entriesChanged) once the event has a log, or when the team asks
// (POST /api/entries/<event>/chrono); read back when the team opens the entries and after a station's sync
// (api/chrono/[[path]].js). Never a loop: Ozimut's own appends start no read.

import { nowIso } from "./api.js";
import { append, opsSince, readMeta } from "./chronolog.js";
import { birthOk, categoryOf, clean, clubKey, clubOf, courseOf, insertEntry, loadEvent, loadForm, norm, personOf, sexOk } from "./entries.js";

export const STATION = "ozimut";
const BY = "Ozimut";
const FIELDS = ["family", "given", "club", "cls", "cat", "card", "lic", "birth", "sex", "rent", "fee", "paid", "start", "status", "oz", "payClub"];
const ROWS = 400;
const A = "abcdefghjkmnpqrstuvwxyz23456789";
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => A[b % A.length]).join("");
const cmp = (a, b) => a.t - b.t || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0) || a.n - b.n;

export const logOf = (eventId) => `e${eventId}`;
const ozKey = (log) => `chrono/${log}/oz.json`;
const blank = () => ({ have: {}, t: 0, cls: {}, clubs: {}, rec: {}, gone: {}, desk: {} });

async function readOz(env, log) {
  const o = await env.BUCKET.get(ozKey(log));
  if (!o) return { oz: blank(), etag: null };
  let oz;
  try { oz = { ...blank(), ...(await o.json()) }; } catch (e) { oz = blank(); }
  return { oz, etag: o.etag };
}
async function writeOz(env, log, oz, etag) {
  const r = await env.BUCKET.put(ozKey(log), JSON.stringify(oz), { httpMetadata: { contentType: "application/json" },
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" } });
  return !!r;
}

/** The entry a runner of the log is (Ozimut's « oz<id> », or a runner the desk added). */
const entryOf = (oz, rid) => { const m = /^oz(\d+)$/.exec(rid); return m ? Number(m[1]) : oz.desk[rid] ?? null; };

/**
 * The log's operations folded into what the link keeps: the classes' and clubs' names, Ozimut's own rows (`rec`, when its
 * record was lost), and the other stations' changes on the entries' runners and the runners they added.
 */
function fold(oz, ops) {
  const changes = new Map(), added = new Map();
  for (const o of ops.sort(cmp)) {
    if (o.t > oz.t) oz.t = o.t;
    const rows = o.k === "put" ? [[o.c, o.id, o.p]] : o.k === "many" && Array.isArray(o.rows) ? o.rows : [];
    for (const row of rows) {
      if (!Array.isArray(row) || row[1] == null) continue;
      const [c, id0, p] = row, id = String(id0);
      if (p !== null && typeof p !== "object") continue;
      if (c === "classes") { if (p === null) delete oz.cls[id]; else if (p.name != null) oz.cls[id] = String(p.name); continue; }
      if (c === "clubs") {
        if (p === null) { delete oz.clubs[id]; continue; }
        const was = oz.clubs[id] || { n: "", c: "" };
        oz.clubs[id] = { n: "name" in p ? String(p.name ?? "") : was.n, c: "code" in p ? String(p.code ?? "") : was.c };
        continue;
      }
      if (c !== "runners") continue;
      const eid = entryOf(oz, id);
      if (o.s === STATION) {                              // Ozimut's own (seen again only when its record was lost)
        if (eid == null) continue;
        if (p === null) { delete oz.rec[eid]; continue; }
        const rec = oz.rec[eid] || (oz.rec[eid] = { _r: id });
        for (const [k, v] of Object.entries(p)) if (FIELDS.includes(k)) { if (v == null) delete rec[k]; else rec[k] = v; }
        continue;
      }
      if (eid != null) {
        const ch = changes.get(eid) || { rid: id, p: {}, gone: false };
        if (p === null) { ch.gone = true; ch.p = {}; oz.gone[id] = 1; } else { ch.gone = false; delete oz.gone[id]; Object.assign(ch.p, p); }
        changes.set(eid, ch);
      } else if (p === null) added.delete(id);
      else if (o.k === "put" && (added.has(id) || p.family || p.given)) added.set(id, { ...(added.get(id) || {}), ...p });
    }
  }
  return { changes, added };
}

const card = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? String(n) : ""; };
const second = (v) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n < 2 * 86400 ? n : undefined; };

/** The desk's changes made to the entries. -> { changed, agree: Map(entry id -> Set of fields Chrono and the entry now agree on) } */
async function applyDesk(env, ev, form, oz, changes, added) {
  const agree = new Map(), now = nowIso();
  let changed = 0;
  const byName = new Map(form.classes.map((k) => [norm(k.name), k]));
  const classNamed = (cid) => (cid && oz.cls[cid] ? byName.get(norm(oz.cls[cid])) : null);
  // the runners added at the desk: entries of their own
  for (const [rid, p] of added) {
    if (oz.desk[rid] != null) { changes.set(oz.desk[rid], { rid, p, gone: false }); continue; }
    const had = await env.DB.prepare("SELECT id FROM entries WHERE event_id = ? AND chrono_id = ?").bind(ev.id, rid).first();
    if (had) { oz.desk[rid] = had.id; changes.set(had.id, { rid, p, gone: false }); continue; }
    const cl = p.club && oz.clubs[p.club] ? oz.clubs[p.club] : null;
    const club = cl ? clubOf({ club_country: ev.country, club_code: cl.c, club_name: cl.n || cl.c }) : { club_country: "", club_code: "", club_name: "" };
    const k = classNamed(p.cls);
    const birth = birthOk(p.birth), sex = sexOk(p.sex), ck = clubKey(club);
    const price = Math.max(0, Math.round(Number(p.fee) * 100) || 0), start = second(p.start) ?? null;
    const row = { event_id: ev.id, first_name: clean(p.given, 60), last_name: clean(p.family, 60), licence: /^\d{1,9}$/.test(String(p.lic || "")) ? String(p.lic) : "",
      birth_year: birth, sex, category: clean(p.cat, 12) || categoryOf(ev.country, birth, sex, Number(String(ev.date).slice(0, 4))), ...club, club_key: ck,
      org_id: null, runner_id: null, user_id: null, by_user: null, class_id: k?.id || "", course: k ? courseOf(form, k.id) : "", card: card(p.card), rent: p.rent ? 1 : 0,
      options: "[]", price, price_rule: "[]", payer: "runner", payer_org: null, payer_user: null, order_ref: "",
      pay_state: p.paid ? "paid" : price ? "due" : "waived", start_s: start, start_by: start != null ? "desk" : "", state: p.status === "dns" ? "dns" : "entered",
      origin: "desk", note: "" };
    if (!row.first_name && !row.last_name) continue;
    row.person = personOf(row, ck);
    let res = await insertEntry(env, form, row, { force: true });
    if (res.error === "taken") res = await insertEntry(env, form, { ...row, start_s: null, start_by: "" }, { force: true });
    if (res.ok) {
      await env.DB.prepare("UPDATE entries SET chrono_id = ?, paid_at = ?, paid_how = ? WHERE id = ?").bind(rid, p.paid ? now : null, p.paid ? "cash" : "", res.id).run();
      oz.desk[rid] = res.id;
      agree.set(res.id, new Set(FIELDS.filter((f) => f !== "oz" && f !== "cat")));            // the desk's values stand; the entry's id and category added
      changed++;
    } else if (res.error === "twice") {
      // the person was entered already: the desk's runner is that entry (adopted when Ozimut had not written it yet)
      const same = await env.DB.prepare("SELECT id, chrono_id FROM entries WHERE event_id = ? AND person = ? AND state != 'cancelled'").bind(ev.id, row.person).first();
      if (!same) continue;
      oz.desk[rid] = same.id;
      if (!same.chrono_id) await env.DB.prepare("UPDATE entries SET chrono_id = ? WHERE id = ? AND chrono_id IS NULL").bind(rid, same.id).run();
      changes.set(same.id, { rid, p, gone: false });
    }
  }
  if (!changes.size) return { changed, agree };
  const ids = [...changes.keys()];
  const rows = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT * FROM entries WHERE event_id = ? AND id IN (${part.map(() => "?").join(",")})`).bind(ev.id, ...part).all();
    for (const r of results) rows.set(r.id, r);
  }
  for (const [eid, ch] of changes) {
    const e = rows.get(eid);
    if (!e || e.chrono_id && e.chrono_id !== ch.rid) continue;        // another runner of the log is that entry's
    const set = {}, p = ch.p;
    if (ch.gone) { if (e.state !== "cancelled") set.state = "cancelled"; }
    else {
      agree.set(eid, new Set([...(agree.get(eid) || []), ...Object.keys(p).filter((k) => FIELDS.includes(k))]));
      if ("paid" in p) {
        if (p.paid && e.pay_state === "due") Object.assign(set, { pay_state: "paid", paid_how: "cash", paid_at: now, paid_by: null });
        else if (!p.paid && e.pay_state === "paid" && e.paid_how === "cash" && e.paid_by == null) Object.assign(set, { pay_state: "due", paid_how: "", paid_at: null });
      }
      if ("card" in p && card(p.card) !== e.card) set.card = card(p.card);
      if ("rent" in p && (p.rent ? 1 : 0) !== e.rent) set.rent = p.rent ? 1 : 0;
      if ("cls" in p) { const k = classNamed(p.cls); if (k && k.id !== e.class_id) { set.class_id = k.id; set.course = courseOf(form, k.id); } }
      if ("family" in p && clean(p.family, 60) && clean(p.family, 60) !== e.last_name) set.last_name = clean(p.family, 60);
      if ("given" in p && clean(p.given, 60) && clean(p.given, 60) !== e.first_name) set.first_name = clean(p.given, 60);
      if ("status" in p) { if (p.status === "dns" && e.state === "entered") set.state = "dns"; else if (p.status !== "dns" && e.state === "dns") set.state = "entered"; }
      if ("start" in p) { const s = second(p.start); if (s !== undefined && s !== e.start_s) { set.start_s = s; set.start_by = s == null ? "" : "desk"; } }
    }
    if (!e.chrono_id) set.chrono_id = ch.rid;
    if (!Object.keys(set).length) continue;
    const run = (x) => env.DB.prepare(`UPDATE entries SET ${Object.keys(x).map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...Object.values(x), now, eid).run();
    // a start taken on the course by another entry (a new start, or a class whose course holds that start already): the
    // entry keeps what it had there, the rest all the same; Chrono keeps the desk's values (agreed above)
    let done = false;
    for (const drop of [[], ["start_s", "start_by"], ["start_s", "start_by", "class_id", "course"]]) {
      for (const k of drop) delete set[k];
      if (!Object.keys(set).length) break;
      try { await run(set); done = true; break; } catch (err) { if (!/UNIQUE|constraint/i.test(String(err?.message || err))) throw err; }
    }
    if (!done) continue;
    if (Object.keys(set).some((k) => k !== "chrono_id")) changed++;
  }
  return { changed, agree };
}

/** The entries as the log should hold them, and the operations that bring it there. */
async function writeAll(env, ev, form, oz, agree, { fresh }) {
  const { results: entries } = await env.DB.prepare("SELECT * FROM entries WHERE event_id = ? ORDER BY id").bind(ev.id).all();
  const orgIds = [...new Set(entries.filter((e) => e.payer === "club" && e.payer_org).map((e) => e.payer_org))];
  const orgName = new Map();
  if (orgIds.length) {
    try {
      const { results } = await env.DB.prepare(`SELECT id, name FROM orgs WHERE id IN (${orgIds.map(() => "?").join(",")})`).bind(...orgIds).all();
      for (const r of results) orgName.set(r.id, r.name);
    } catch (e) { /* before migration 0030 */ }
  }
  const rows = [];
  const clubCode = new Map(), clubName = new Map(), clsName = new Map();
  for (const [id, c] of Object.entries(oz.clubs)) { if (c.c) clubCode.set(String(c.c).toUpperCase(), id); if (c.n) clubName.set(norm(c.n), id); }
  for (const [id, n] of Object.entries(oz.cls)) clsName.set(norm(n), id);
  const clubId = (e) => {
    const name = e.club_name || e.club_code, code = e.club_code ? String(e.club_code).toUpperCase() : "";
    if (!name) return null;
    let id = (code && clubCode.get(code)) || clubName.get(norm(name));
    if (!id) {
      id = newId();
      rows.push(["clubs", id, e.club_code ? { name, code: e.club_code } : { name }]);
      oz.clubs[id] = { n: name, c: e.club_code || "" };
      if (code) clubCode.set(code, id);
    }
    clubName.set(norm(name), id);
    return id;
  };
  const clsId = (e) => {
    const k = form.classes.find((x) => x.id === e.class_id), name = k?.name || "";
    if (!name) return null;
    let id = clsName.get(norm(name));
    if (!id) { id = newId(); rows.push(["classes", id, { name }]); oz.cls[id] = name; clsName.set(norm(name), id); }
    return id;
  };
  const runners = [], named = [], present = new Set();
  for (const e of entries) {
    present.add(String(e.id));
    const rid = e.chrono_id || `oz${e.id}`;
    let rec = oz.rec[e.id];
    if (!rec && (e.state === "pending" || e.state === "cancelled")) continue;
    if (oz.gone[rid]) {
      if (e.state === "cancelled") continue;
      delete oz.gone[rid];                                // taken back after the desk deleted it: written whole again
      rec = oz.rec[e.id] = { _r: rid };
    }
    const exp = {
      family: e.last_name || null, given: e.first_name || null, club: clubId(e), cls: clsId(e), cat: e.category || null,
      card: Number(e.card) || null, lic: e.licence || null, birth: e.birth_year || null, sex: e.sex || null, rent: e.rent ? 1 : null,
      fee: (e.price || 0) / 100, paid: e.pay_state === "paid" || e.pay_state === "waived" || e.payer === "club" ? 1 : null,
      start: e.start_s ?? null, status: e.state === "dns" || e.state === "cancelled" ? "dns" : null, oz: e.id,
      payClub: e.payer === "club" ? orgName.get(e.payer_org) || e.club_name || "club" : null,
    };
    const isNew = !rec;
    if (isNew) rec = oz.rec[e.id] = { _r: rid };
    for (const f of agree.get(e.id) || []) { if (exp[f] == null) delete rec[f]; else rec[f] = exp[f]; }
    const p = {};
    for (const f of FIELDS) { const v = exp[f] ?? null; if ((rec[f] ?? null) !== v && !(isNew && v === null)) p[f] = v; }
    if (Object.keys(p).length) {
      runners.push(["runners", rid, p]);
      for (const [f, v] of Object.entries(p)) { if (v == null) delete rec[f]; else rec[f] = v; }
    }
    if (!e.chrono_id) named.push([e.id, rid]);
  }
  // entries deleted for good: their runners go
  for (const [eid, rec] of Object.entries(oz.rec)) {
    if (present.has(eid)) continue;
    if (!oz.gone[rec._r]) runners.push(["runners", rec._r, null]);
    delete oz.rec[eid];
  }
  const all = rows.concat(runners), items = [];
  if (fresh) {
    // a log Ozimut starts: the event described as Chrono's Orga tab would (ui/app.js), so that every station opens it alike
    const type = /score$/.test(ev.type || "") ? "score" : ev.type === "relay" ? "relay" : "individual";
    items.push({ k: "ev", p: { id: logOf(ev.id), name: ev.name || "", date: ev.date || "", country: ev.country || "FR", rules: String(ev.country || "fr").toLowerCase(), type,
      club: ev.club || "", place: ev.place || "", race: ev.race_key || null, timing: "si", startMode: "list", zero: 36000 } });
  }
  if (all.length === 1 && all[0][2] !== undefined) items.push({ k: "put", c: all[0][0], id: all[0][1], p: all[0][2] });
  else for (let i = 0; i < all.length; i += ROWS) items.push({ k: "many", rows: all.slice(i, i + ROWS) });
  if (!items.length) return { wrote: 0, named };
  const got = await append(env, logOf(ev.id), STATION, items, { by: BY, from: form.chrono_n || 0, t0: oz.t });
  if (!got) throw new Error("chrono busy");
  oz.have = { ...oz.have, [STATION]: got.have[STATION] };
  oz.t = got.ops[got.ops.length - 1].t;
  return { wrote: all.length, named, n: got.have[STATION] };
}

/**
 * One pass of the link for an Orga event: the desk read back, then (`write`, or when the desk changed an entry) the entries
 * written. Nothing when the event has no log yet, unless `force` (the team's « Envoyer à Chrono »), which starts it.
 * -> { skipped } | { changed (entries changed by the desk), wrote (rows written) }
 */
export async function link(env, eventId, { write = true, force = false } = {}) {
  if (!env.BUCKET || !env.DB) return { skipped: "server" };
  const log = logOf(eventId);
  const { meta } = await readMeta(env, log);
  const fresh = !((meta.n || 0) > 0);
  if (fresh && !force) return { skipped: "nolog" };
  const [ev, form] = await Promise.all([loadEvent(env, eventId), loadForm(env, eventId)]);
  if (!ev || !form) return { skipped: "noform" };
  const { oz, etag } = await readOz(env, log);
  let changed = 0, agree = new Map();
  if (!fresh) {
    const { ops, have } = await opsSince(env, log, oz.have);
    const { changes, added } = fold(oz, ops);
    oz.have = { ...oz.have, ...have };
    ({ changed, agree } = await applyDesk(env, ev, form, oz, changes, added));
  }
  let out = { wrote: 0, named: [] };
  if (write || changed || force) out = await writeAll(env, ev, form, oz, agree, { fresh });
  await writeOz(env, log, oz, etag).catch(() => false);        // lost to a pass running together: the next one does it again
  const seen = Object.fromEntries(Object.entries(oz.have).filter(([s]) => s !== STATION));
  const stmts = out.named.map(([id, rid]) => env.DB.prepare("UPDATE entries SET chrono_id = ? WHERE id = ? AND chrono_id IS NULL").bind(rid, id));
  stmts.push(env.DB.prepare(`UPDATE entry_forms SET chrono_seen = ?, chrono_n = max(chrono_n, ?)${changed ? ", changed_at = ?" : ""} WHERE event_id = ?`)
    .bind(JSON.stringify(seen), out.n || oz.have[STATION] || 0, ...(changed ? [nowIso()] : []), eventId));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { changed, wrote: out.wrote };
}

/** The entries written to the event's log (after a change of entries; `force`: the team asks, the log started if need be). */
export const toChrono = (env, eventId, opt = {}) => link(env, eventId, { write: true, ...opt });
/** The desk read back (the team opens the entries; a station synced). */
export const fromChrono = (env, eventId) => link(env, eventId, { write: false });
