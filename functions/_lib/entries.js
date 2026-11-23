// Entries, merged with start times (docs/clubs/design.md §3-4; owner, 2026-11-22; migration 0031). What the API
// (api/entries/[[path]].js), the page views' hook (api/track.js: entriesSoon), the account's confirmation (api/account/verify.js:
// confirmPending) and its deletion (api/account/delete.js: forgetAccount) share: an event's entry form (its rules, classes,
// prices, how start times are given), the entries made from it — one per person and event —, the prices fixed on them
// (site/assets/js/entryprice.js), who pays (_lib/clubpolicy.js payerFor) and the payer's reference, the club rule between two
// starts of a club (enforced in SQL, as the booking of 2026-11-03 did), the start list published from the entries (an
// organiser's deposit, functions/api/upload.js's storage, then a run of the provisional results), and the runners' alert « Mes
// horaires » (a start moved, an entry cancelled by the organisers, the reminder the day before). Every payment is made outside
// Ozimut: the organisers mark what was paid.

import { allow, isAdmin, nowIso, userLang } from "./api.js";
import { queueStatement, flushQueue } from "./mail.js";
import { queuePush, flushPush, pushReady } from "./push.js";
import { bookingMail, bookingPush } from "./templates.js";
import { startRun } from "../api/upload.js";
import { declaredRace, findRace, organises, orgCode } from "./club.js";
import { isMember } from "./events.js";
import { randomBytes } from "./crypto.js";
import { clean, clubKey, clubOf, norm, parisDay, parisNow, personOf } from "./booking.js";
import { payerFor } from "./clubpolicy.js";
import { capFamily, cleanRules, priceOf } from "../../site/assets/js/entryprice.js";
import { packFor } from "../../site/assets/js/chrono/rules/index.js";
import { toChrono } from "./entrychrono.js";

export { clean, clubKey, clubOf, norm, parisDay, parisNow, personOf };
export const MAX_ITEMS = 30;              // the entries one request makes
export const MAX_PER_ACCOUNT = 40;        // the entries one account makes for an event (the organisers apart)
export const MAX_CLASSES = 80;
export const MAX_SLOTS = 400;             // a course's starts on the booking grid
export const MAX_ROWS = 3000;             // an import's rows
export const PENDING_DAYS = 3;            // a pending entry (an e-mail never confirmed) is cancelled after it
export const STATES = ["draft", "open", "closed"];
export const PAY_STATES = ["due", "paid", "waived"];
export const PAY_HOW = ["transfer", "cash", "cheque", "card", "club", "other"];
export const START_MODES = ["none", "booking", "draw", "deposit"];
const WHEN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const j = (s, d) => { try { const v = JSON.parse(s || ""); return v ?? d; } catch (e) { return d; } };

/** Is the table there (migration 0031)? */
export const missing = (e) => /no such (table|column)/i.test(String(e?.message || e));

// ---- the event and its form ---------------------------------------------------------------------------------------------
export const loadEvent = (env, id) => env.DB.prepare("SELECT * FROM events WHERE id = ? AND status = 'active'").bind(String(id)).first();
/** The event holding a competition (its race key). */
export const eventByRace = (env, key) => env.DB.prepare("SELECT * FROM events WHERE race_key = ? AND status = 'active'").bind(String(key)).first();

/** A form's row with its JSON read. */
export function readForm(row) {
  if (!row) return null;
  return { ...row, classes: j(row.classes, []), prices: cleanRules(j(row.prices, {})), fields: { card: "ask", birth: false, note: false, ...j(row.fields, {}) },
    starts: { mode: "none", circuits: [], gap: 0, max: 10, blocked: {}, ...j(row.starts, {}) }, pay: { transfer: true, desk: false, ...j(row.pay, {}) },
    chrono_seen: j(row.chrono_seen, {}) };
}
export const loadForm = async (env, eventId) => readForm(await env.DB.prepare("SELECT * FROM entry_forms WHERE event_id = ?").bind(eventId).first());

/** The course an entry of a class runs (its start grid's key): the class's course, else the class itself. */
export const courseOf = (form, classId) => { const c = form.classes.find((x) => x.id === classId); return c ? clean(c.course || c.name, 60) : ""; };
export const classOf = (form, classId) => form.classes.find((x) => x.id === classId) || null;

/**
 * May runners enter now? -> { open, late, soon } — open: the form is open, before its closing (or after it until `late_until`,
 * late: true), and before the race's day is over; soon: open but not yet (`opens` to come).
 */
export function openState(form, ev, now = parisNow()) {
  const out = { open: false, late: false, soon: false };
  if (!form || form.state !== "open" || !ev || ev.date < parisDay()) return out;
  if (form.opens && now < form.opens) return { ...out, soon: true };
  if (form.closes && now > form.closes) {
    if (form.late_until && now <= form.late_until) return { ...out, open: true, late: true };
    return out;
  }
  return { ...out, open: true };
}

/** The settings checked and cleaned; { error } when one does not hold. `before`: the form as it was (its classes in use). */
export function cleanForm(b, before = null) {
  if (!b || typeof b !== "object") return { error: "bad request" };
  const pick = (k, d) => (b[k] !== undefined ? b[k] : before ? before[k] : d);
  const state = STATES.includes(pick("state", "draft")) ? pick("state", "draft") : "draft";
  const when = (k) => { const v = pick(k, null); return v && WHEN.test(String(v)) ? String(v) : null; };
  const placesN = Math.round(Number(pick("places", null)));
  const places = Number.isFinite(placesN) && placesN > 0 && placesN <= 100000 ? placesN : null;
  const ids = new Set(), classes = [];
  for (const c of (Array.isArray(pick("classes", [])) ? pick("classes", []) : []).slice(0, MAX_CLASSES)) {
    const id = clean(c?.id, 16), name = clean(c?.name, 60);
    if (!/^[\w-]{1,16}$/.test(id) || ids.has(id) || !name) return { error: "classes" };
    ids.add(id);
    const o = { id, name, course: clean(c?.course, 60) };
    const n = Math.round(Number(c?.places));
    if (Number.isFinite(n) && n > 0) o.places = Math.min(n, 100000);
    if (Array.isArray(c?.cats)) { const cats = c.cats.map((x) => clean(x, 12)).filter(Boolean).slice(0, 30); if (cats.length) o.cats = cats; }
    if (c?.sex === "F" || c?.sex === "M") o.sex = c.sex;
    for (const k of ["minAge", "maxAge"]) { const a = Math.round(Number(c?.[k])); if (c?.[k] !== "" && c?.[k] != null && Number.isFinite(a) && a >= 0 && a <= 120) o[k] = a; }
    classes.push(o);
  }
  const f = pick("fields", {}) || {};
  const fields = { card: ["no", "ask", "require"].includes(f.card) ? f.card : "ask", birth: f.birth === true, note: f.note === true };
  const s = pick("starts", {}) || {};
  const mode = START_MODES.includes(s.mode) ? s.mode : "none";
  const cids = new Set(), circuits = [];
  for (const x of (Array.isArray(s.circuits) ? s.circuits : []).slice(0, MAX_CLASSES)) {
    const id = clean(x?.id, 60), name = clean(x?.name || x?.id, 60);
    const first = Math.round(Number(x?.first)), last = Math.round(Number(x?.last)), step = Math.round(Number(x?.step));
    if (!id || cids.has(id)) return { error: "circuits" };
    if (![first, last, step].every(Number.isFinite) || first < 0 || last >= 86400 || last < first || step < 10 || step > 3600) return { error: "circuits", name };
    if ((last - first) / step + 1 > MAX_SLOTS) return { error: "circuits", name };
    cids.add(id);
    circuits.push({ id, name, first, last, step });
  }
  const blocked = {};
  for (const [id, list] of Object.entries(s.blocked || {})) {
    if (!cids.has(id) || !Array.isArray(list)) continue;
    blocked[id] = [...new Set(list.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x < 86400))].slice(0, MAX_SLOTS);
  }
  const gap = Math.round(Number(s.gap) || 0), max = Math.round(Number(s.max) || 10);
  if (gap < 0 || gap > 3600 || max < 1 || max > MAX_PER_ACCOUNT) return { error: "starts" };
  const starts = { mode, circuits, gap, max, blocked, note: clean(s.note, 600), ...(Number.isInteger(s.seed) ? { seed: s.seed } : {}) };
  const p = pick("pay", {}) || {};
  const iban = String(p.iban || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 34);
  const pay = { transfer: p.transfer !== false, desk: p.desk === true, before: DAY.test(String(p.before || "")) ? p.before : "", note: clean(p.note, 600),
    ...(iban ? { iban, holder: clean(p.holder, 80), bic: String(p.bic || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) } : {}) };
  const out = { state, opens: when("opens"), closes: when("closes"), late_until: when("late_until"), places, classes,
    prices: cleanRules(pick("prices", {})), fields, starts, pay, refund_rule: clean(pick("refund_rule", ""), 600), note: clean(pick("note", ""), 1000) };
  if (out.late_until && out.closes && out.late_until < out.closes) out.late_until = null;
  return { form: out };
}

/** May the account act for the event's team? An administrator; for an event holding a competition, its organisers
 *  (_lib/club.js organises → _lib/events.js canManage); else a member of the event's team. */
export async function teamMay(env, request, user, ev) {
  if (!user || !ev) return false;
  if (isAdmin(env, user)) return true;
  if (ev.race_key) {
    const race = (await findRace(env, request, ev.race_key).catch(() => null)) || { key: ev.race_key, org: ev.club };
    if (await organises(env, request, user, race)) return true;
  }
  return isMember(env, ev.id, user.id);
}

// ---- « Mes coureurs » and the runner's identity ------------------------------------------------------------------------
/** A runner's fields from a body (« Mes coureurs », the organisers' rows), checked; null when the names are missing. */
export function runnerFields(b) {
  const first = clean(b?.first_name, 60), last = clean(b?.last_name, 60);
  if (!first || !last) return null;
  const club = clubOf(b);
  return { first_name: first, last_name: last, licence: /^\d{1,9}$/.test(String(b?.licence || "").trim()) ? String(b.licence).trim().replace(/^0+(?=\d)/, "") : "",
    ...club, card: /^\d{1,10}$/.test(String(b?.card || "").trim()) ? String(b.card).trim() : "" };
}
export const pubRunner = (r) => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, licence: r.licence, club_country: r.club_country,
  club_code: r.club_code, club_name: r.club_name, card: r.card, self: !!r.self });
/** The year of birth and sex as accepted. */
export const birthOk = (y) => { const n = Math.round(Number(y)), now = new Date().getUTCFullYear(); return Number.isInteger(n) && n >= now - 110 && n <= now ? n : null; };
export const sexOk = (s) => (/^(f|d|w)/i.test(String(s || "")) ? "F" : /^(m|h)/i.test(String(s || "")) ? "M" : "");

/** The category the country's rules give (the pack of Chrono's rules: France's H/D, the IOF's M/W), '' when unknown. */
export function categoryOf(cc, birth, sex, year) {
  if (!birth || !sex) return "";
  try { return packFor(cc).catOf(birth, sex === "F" ? "F" : "M", Number(year)) || ""; } catch (e) { return ""; }
}

/** The runner's club as an org (migration 0030), when it is known there; null otherwise. */
export async function orgIdOf(env, c) {
  if (!c.club_country) return null;
  try {
    const r = c.club_code
      ? await env.DB.prepare("SELECT id FROM orgs WHERE cc = ? AND kind = 'club' AND code = ?").bind(c.club_country, c.club_code).first()
      : await env.DB.prepare("SELECT id FROM orgs WHERE cc = ? AND kind = 'club' AND lower(name) = lower(?)").bind(c.club_country, c.club_name).first();
    return r?.id ?? null;
  } catch (e) { return null; }
}

/** The organising club's bank details (its settings, migration 0030) — shown only to those who entered or owe it. */
export async function orgBank(env, ev, form) {
  let s = null;
  if (ev?.org_id) {
    try { s = j((await env.DB.prepare("SELECT json FROM org_settings WHERE org_id = ?").bind(ev.org_id).first())?.json, null); } catch (e) { s = null; }
  }
  if (s?.iban) return { iban: s.iban, holder: s.holder || "", bic: s.bic || "", from: "club" };
  if (form?.pay?.iban) return { iban: form.pay.iban, holder: form.pay.holder || "", bic: form.pay.bic || "", from: "form" };
  return null;
}

// ---- references --------------------------------------------------------------------------------------------------------
const REF_ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** The payer's reference for an event, made the first time (« OZ-7K3F », unique across Ozimut). `payer`: « u<id> », « o<id> ». */
export async function refFor(env, eventId, payer) {
  const had = await env.DB.prepare("SELECT ref FROM entry_refs WHERE event_id = ? AND payer = ?").bind(eventId, payer).first();
  if (had) return had.ref;
  for (let i = 0; i < 8; i++) {
    const ref = `OZ-${Array.from(randomBytes(4), (b) => REF_ALPHA[b % REF_ALPHA.length]).join("")}`;
    try {
      await env.DB.prepare("INSERT INTO entry_refs (ref, event_id, payer, created_at) VALUES (?, ?, ?, ?)").bind(ref, eventId, payer, nowIso()).run();
      return ref;
    } catch (e) {
      const again = await env.DB.prepare("SELECT ref FROM entry_refs WHERE event_id = ? AND payer = ?").bind(eventId, payer).first();
      if (again) return again.ref;          // made meanwhile by another request
    }
  }
  return "";
}

// ---- making an entry -------------------------------------------------------------------------------------------------
/**
 * The price, the payer and the reference of a runner about to be entered. `p`: the entry's fields so far (licence, birth_year,
 * club_*, org_id, user_id, by_user, class_id, rent, options); `ctx`: { now, late } -> { price, price_rule, payer, payer_org,
 * payer_user, order_ref, pay_state }.
 */
export async function billOf(env, request, ev, form, p, { late = false, payerUser = null } = {}) {
  const ownKey = ev.country === "FR" && orgCode(ev.club) ? `FR:${orgCode(ev.club)}` : ev.club ? `${ev.country}:${norm(ev.club)}` : "";
  const own = (ev.org_id && p.org_id === ev.org_id) || (!!ownKey && p.club_key === ownKey);
  const pr = priceOf(form.prices, { birth_year: p.birth_year, licence: p.licence, class_id: p.class_id, rent: p.rent, options: p.options, own },
    { year: Number(String(ev.date).slice(0, 4)), late });
  let who = { payer: "runner" };
  try { who = (await payerFor(env, request, p, ev)) || who; } catch (e) { /* the runner then */ }
  let price = pr.cents, parts = pr.parts;
  const payer_user = who.payer === "club" ? null : payerUser ?? p.by_user ?? p.user_id ?? null;
  // the family cap: this payer's entries for the event, the new one last
  if (form.prices.family_cap && who.payer !== "club" && payer_user) {
    const { results } = await env.DB.prepare("SELECT price FROM entries WHERE event_id = ? AND payer = 'runner' AND payer_user = ? AND state != 'cancelled' ORDER BY id")
      .bind(ev.id, payer_user).all();
    const spread = capFamily(form.prices, [...results.map((x) => ({ cents: x.price, fixed: true })), { cents: price }]);
    const cut = spread.at(-1).cut;
    if (cut) { price -= cut; parts = [...parts, ["@cap", -cut]]; }
  }
  const payer = who.payer === "club" && who.org ? `o${who.org}` : payer_user ? `u${payer_user}` : `p${p.person}`.slice(0, 120);
  return { price, price_rule: JSON.stringify(parts), payer: who.payer === "club" && who.org ? "club" : "runner",
    payer_org: who.payer === "club" && who.org ? who.org : null, payer_user, order_ref: await refFor(env, ev.id, payer), pay_state: price ? "due" : "waived" };
}

const COLS = ["event_id", "person", "first_name", "last_name", "licence", "birth_year", "sex", "category", "club_country", "club_code", "club_name",
  "club_key", "org_id", "runner_id", "user_id", "by_user", "class_id", "course", "card", "rent", "options", "price", "price_rule", "payer",
  "payer_org", "payer_user", "order_ref", "pay_state", "start_s", "start_by", "state", "origin", "note", "created_at", "updated_at"];
const errOf = (e) => (/start_s/.test(String(e?.message)) ? "taken" : /person/.test(String(e?.message)) ? "twice" : null);

/**
 * Inserts one entry under the event's and the class's places and, when it has a start, the club rule (unless `force`).
 * `row`: every column of COLS but the times. -> { ok, id } | { error: full | classFull | club | taken | twice }.
 */
export async function insertEntry(env, form, row, { force = false } = {}) {
  const now = nowIso(), r = { ...row, created_at: now, updated_at: now };
  const cls = classOf(form, row.class_id);
  const gap = force || !row.club_key || row.start_s == null ? 0 : form.starts.gap || 0;
  const places = force ? null : form.places, cplaces = force ? null : cls?.places ?? null;
  try {
    const got = await env.DB.prepare(`INSERT INTO entries (${COLS.join(", ")}) SELECT ${COLS.map(() => "?").join(", ")}
      WHERE (? IS NULL OR (SELECT COUNT(*) FROM entries WHERE event_id = ? AND state != 'cancelled') < ?)
        AND (? IS NULL OR (SELECT COUNT(*) FROM entries WHERE event_id = ? AND class_id = ? AND state != 'cancelled') < ?)
        AND (? = 0 OR NOT EXISTS (SELECT 1 FROM entries WHERE event_id = ? AND club_key = ? AND state != 'cancelled' AND start_s IS NOT NULL
          AND abs(start_s - ?) < ?)) RETURNING id`)
      .bind(...COLS.map((c) => r[c] ?? (["rent", "price"].includes(c) ? 0 : c === "options" ? "[]" : ["birth_year", "org_id", "runner_id", "user_id", "by_user",
        "payer_org", "payer_user", "start_s"].includes(c) ? null : "")),
      places, row.event_id, places, cplaces, row.event_id, row.class_id, cplaces, gap, row.event_id, row.club_key, row.start_s ?? 0, gap).first();
    if (got) return { ok: true, id: got.id };
  } catch (e) {
    const code = errOf(e);
    if (code) return { error: code };
    throw e;
  }
  if (places != null && (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND state != 'cancelled'").bind(row.event_id).first()).n >= places) return { error: "full" };
  if (cplaces != null && (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND class_id = ? AND state != 'cancelled'").bind(row.event_id, row.class_id).first()).n >= cplaces) return { error: "classFull" };
  return { error: "club" };
}

/** Moves an entry's start (and course) under the club rule unless `force`. -> { ok, row } | { error: club | taken }. */
export async function moveStart(env, form, entry, course, s, { force = false, by = "booked" } = {}) {
  const gap = force || !entry.club_key || s == null ? 0 : form.starts.gap || 0;
  try {
    const r = await env.DB.prepare(`UPDATE entries SET course = ?, start_s = ?, start_by = ?, reminded = 0, updated_at = ? WHERE id = ?
      AND (? = 0 OR NOT EXISTS (SELECT 1 FROM entries WHERE event_id = ? AND club_key = ? AND id != ? AND state != 'cancelled'
        AND start_s IS NOT NULL AND abs(start_s - ?) < ?)) RETURNING *`)
      .bind(course, s, s == null ? "" : by, nowIso(), entry.id, gap, entry.event_id, entry.club_key, entry.id, s ?? 0, gap).first();
    return r ? { ok: true, row: r } : { error: "club" };
  } catch (e) {
    const code = errOf(e);
    if (code) return { error: code };
    throw e;
  }
}

/** Is `s` one of the course's starts on the booking grid, and not kept back by the organisers? */
export function slotOk(starts, course, s) {
  const c = (starts.circuits || []).find((x) => x.id === course);
  if (!c || !Number.isInteger(s) || s < c.first || s > c.last || (s - c.first) % c.step) return false;
  return !(starts.blocked?.[course] || []).includes(s);
}

/**
 * The hook after every change of an event's entries (docs/clubs/design.md §5, « Chrono's welcome desk »): the desk's operations
 * read back, then the entries written to the event's Chrono log as the server station `ozimut` (_lib/entrychrono.js) — only
 * once the event has a log (Chrono opened for it, or the team's « Envoyer les inscriptions à Chrono »). Every change of
 * entries calls it through touch().
 */
export async function entriesChanged(env, eventId) {
  await toChrono(env, eventId);
}

/** The entries changed: noted on the form (the closing's publication follows it), then the Chrono hook. */
export async function touch(env, eventId) {
  await env.DB.prepare("UPDATE entry_forms SET changed_at = ? WHERE event_id = ?").bind(nowIso(), eventId).run();
  try { await entriesChanged(env, eventId); } catch (e) { /* the entries are saved all the same */ }
}

// ---- the runners told: « Mes horaires » -------------------------------------------------------------------------------
const hm = (s) => (s == null ? "" : `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}${s % 60 ? `:${String(s % 60).padStart(2, "0")}` : ""}`);
const courseName = (form, id) => form?.starts?.circuits?.find((c) => c.id === id)?.name || id || "";
const raceOf = (ev) => ({ key: ev.race_key || "", name: ev.name, date: ev.date, place: ev.place, url: `/#/inscription?ev=${encodeURIComponent(ev.id)}` });

/**
 * Tell the accounts that entered: kind "moved" | "cancelled" | "reminder"; items: entries rows (a moved one with its new start).
 * The account that made the change is not told (`actor`); an entry the organisers made themselves tells nobody.
 */
export async function tellRunners(env, ev, form, kind, items, actor = 0) {
  const byUser = new Map();
  for (const b of items) {
    const to = b.by_user || b.user_id;
    if (!to || to === actor || ["file", "hand", "desk"].includes(b.origin)) continue;
    if (!byUser.has(to)) byUser.set(to, []);
    byUser.get(to).push({ name: `${b.first_name} ${b.last_name}`.trim(), circuit: courseName(form, b.course), start: hm(b.start_s) });
  }
  if (!byUser.size) return 0;
  const ids = [...byUser.keys()];
  const { results: users } = await env.DB.prepare(
    `SELECT * FROM users WHERE id IN (${ids.map(() => "?").join(",")}) AND status = 'active' AND demo_until IS NULL`).bind(...ids).all();
  const race = raceOf(ev);
  const stmts = [], push = pushReady(env);
  for (const u of users) {
    const list = byUser.get(u.id);
    if (u.book_mail === 1 && u.alerts_allowed && u.email_verified && !/\.invalid$/.test(u.email)) {
      const m = bookingMail(env, u, race, list, kind);
      stmts.push(queueStatement(env, { to: u.email, subject: m.subject, html: m.html, text: m.text, kind: "booking", priority: kind === "reminder" ? 1 : 0 }));
    }
    if (u.book_push !== 0 && push) {
      stmts.push(queuePush(env, u.id, "booking", bookingPush(userLang(u), race, list, kind), { topic: `ent-${ev.id}`.slice(0, 32), hours: 36 }));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await Promise.allSettled([flushQueue(env, 10), flushPush(env, 8)]);
  return stmts.length;
}

// ---- the start list from the entries ---------------------------------------------------------------------------------
const field = (v) => { const s = String(v ?? "").replace(/[\r\n]+/g, " ").trim(); return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const hms = (s) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
/** The entries with a start as the CSV both start-list readers take (site/assets/js/sheettabs.js toCsv: Heure;Nom;Club;Circuit;Puce). */
export function startCsv(form, rows) {
  const lines = rows.filter((b) => b.start_s != null).sort((a, b) => a.start_s - b.start_s || String(a.course).localeCompare(String(b.course))).map((b) => [
    hms(b.start_s), `${b.first_name} ${b.last_name}`.trim(),
    // France's clubs by their number (the site names them), the others by their name
    b.club_country === "FR" && b.club_code ? b.club_code : b.club_name, courseName(form, b.course), b.card].map(field).join(";"));
  return ["Heure;Nom;Club;Circuit;Puce", ...lines].join("\r\n") + "\r\n";      // i18n-ignore (the file's headings)
}

/**
 * Publish the entries' starts as the race's start list: an organiser's deposit (functions/api/upload.js's storage, kind
 * "startlist", `booking: true`), then a run of the provisional results. -> { ok, id, soon } or { error }.
 */
export async function publish(env, ev, form, userId) {
  if (!env.BUCKET) return { error: "storage" };
  if (!ev.race_key) return { error: "no race" };
  const { results: rows } = await env.DB.prepare("SELECT * FROM entries WHERE event_id = ? AND state = 'entered' AND start_s IS NOT NULL").bind(ev.id).all();
  if (!rows.length) return { error: "empty" };
  const race = /^d/.test(ev.race_key) ? await declaredRace(env, ev.race_key).catch(() => null) : null;
  const text = startCsv(form, rows), now = nowIso();
  const filename = `horaires-${ev.race_key}.csv`, label = `${ev.name} (${ev.date}) — horaires des inscriptions sur Ozimut`;      // i18n-ignore (the administrators' record)
  const size = new TextEncoder().encode(text).length;
  const row = await env.DB.prepare(
    "INSERT INTO uploads (user_id, race_key, race, filename, size, r2_key, created_at) VALUES (?, ?, ?, ?, ?, '', ?) RETURNING id")
    .bind(userId, ev.race_key, label, filename, size, now).first();
  const id = row.id, r2Key = `uploads/${id}/${filename}`;
  await env.BUCKET.put(r2Key, text, { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
  const meta = { id, created: now, user: userId, race: ev.race_key, new_race: null, filename, stored: filename, size, status: "active",
    organiser: true, kind: "startlist", booking: true, event: ev.id, ...(race?.declared ? { declared: race.declared } : {}) };
  await env.BUCKET.put(`uploads/${id}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" } });
  await env.DB.batch([env.DB.prepare("UPDATE uploads SET r2_key = ? WHERE id = ?").bind(r2Key, id),
    env.DB.prepare("UPDATE entry_forms SET published_at = ? WHERE event_id = ?").bind(now, ev.id)]);
  return { ok: true, id, soon: await startRun(env) };
}

// ---- the page views' hook: the closings, the publications, the reminders ----------------------------------------------
let lastCheck = 0;
/**
 * What time brings, at most every 10 minutes an isolate (api/track.js, ctx.waitUntil): an open form past its closing (and its
 * late entries) closes; a closed one whose entries changed since its last publication publishes its start list; the day before
 * the race, the accounts that entered are reminded of their runners' starts; a pending entry never confirmed goes.
 */
export function entriesSoon(ctx, { now = false } = {}) {
  if (!now && Date.now() - lastCheck < 10 * 60e3) return;
  lastCheck = Date.now();
  ctx.waitUntil(entriesDue(ctx.env).catch(() => 0));
}
export async function entriesDue(env) {
  if (!env.DB) return 0;
  const today = parisDay(), tomorrow = parisDay(1), nowP = parisNow();
  let rows;
  try {
    ({ results: rows } = await env.DB.prepare(`SELECT f.*, e.id AS ev_id, e.name AS ev_name, e.date AS ev_date, e.place AS ev_place, e.race_key AS ev_race
      FROM entry_forms f JOIN events e ON e.id = f.event_id WHERE e.status = 'active' AND e.date >= ? AND f.state IN ('open', 'closed')`).bind(today).all());
  } catch (e) { return 0; }          // before migration 0031
  let done = 0;
  // the entries of accounts that never confirmed their e-mail
  try {
    const old = new Date(Date.now() - PENDING_DAYS * 86400e3).toISOString();
    const { results: gone } = await env.DB.prepare("UPDATE entries SET state = 'cancelled', updated_at = ? WHERE state = 'pending' AND created_at < ? RETURNING event_id")
      .bind(nowIso(), old).all();
    for (const id of new Set(gone.map((x) => x.event_id))) await touch(env, id);
  } catch (e) { /* next time */ }
  for (const row of rows) {
    const form = readForm(row), ev = { id: row.ev_id, name: row.ev_name, date: row.ev_date, place: row.ev_place, race_key: row.ev_race };
    const end = form.late_until || form.closes;
    // the closing: taken by this request alone (the UPDATE says whether it changed the row)
    if (form.state === "open" && end && nowP > end) {
      const r = await env.DB.prepare("UPDATE entry_forms SET state = 'closed', updated_at = ? WHERE event_id = ? AND state = 'open'").bind(nowIso(), ev.id).run();
      if (r.meta?.changes) { form.state = "closed"; form.published_at = null; }
    }
    if (form.state === "closed" && ev.race_key && form.changed_at && (!form.published_at || form.changed_at > form.published_at)
      && (await allow(env, `ent:auto:${ev.id}`, 1, 600))) {
      const has = await env.DB.prepare("SELECT 1 FROM entries WHERE event_id = ? AND state = 'entered' AND start_s IS NOT NULL LIMIT 1").bind(ev.id).first();
      if (has) { await publish(env, ev, form, form.created_by).catch(() => null); done++; }
    }
    if (ev.date === tomorrow) {
      const { results: due } = await env.DB.prepare(`UPDATE entries SET reminded = 1 WHERE event_id = ? AND reminded = 0 AND state = 'entered'
        AND start_s IS NOT NULL RETURNING user_id, by_user, origin, first_name, last_name, course, start_s`).bind(ev.id).all();
      if (due.length) { await tellRunners(env, ev, form, "reminder", due); done++; }
    }
  }
  return done;
}

// ---- the account's life ----------------------------------------------------------------------------------------------
/** The account's e-mail confirmed (api/account/verify.js): its pending entries are entered. */
export async function confirmPending(env, userId) {
  try {
    const { results } = await env.DB.prepare("UPDATE entries SET state = 'entered', updated_at = ? WHERE by_user = ? AND state = 'pending' RETURNING event_id")
      .bind(nowIso(), userId).all();
    for (const id of new Set(results.map((x) => x.event_id))) await touch(env, id);
    return results.length;
  } catch (e) { return 0; }            // before migration 0031
}

/**
 * An account deleted (api/account/delete.js): its entries to come — its own, and those it made for others — are cancelled
 * (their places and starts free again); its past entries keep the names for the organisers' records, no longer the account.
 */
export async function forgetAccount(env, uid) {
  try {
    const today = parisDay(), now = nowIso();
    const { results } = await env.DB.prepare(`UPDATE entries SET state = 'cancelled', updated_at = ? WHERE (user_id = ? OR by_user = ?) AND state IN ('entered', 'pending')
      AND event_id IN (SELECT id FROM events WHERE date >= ?) RETURNING event_id`).bind(now, uid, uid, today).all();
    await env.DB.batch([
      env.DB.prepare("UPDATE entries SET user_id = NULL WHERE user_id = ?").bind(uid),
      env.DB.prepare("UPDATE entries SET by_user = NULL WHERE by_user = ?").bind(uid),
      env.DB.prepare("UPDATE entries SET payer_user = NULL WHERE payer_user = ?").bind(uid),
      env.DB.prepare("DELETE FROM booking_runners WHERE user_id = ?").bind(uid),
    ]);
    for (const id of new Set(results.map((x) => x.event_id))) await touch(env, id);
  } catch (e) { /* before migration 0031 */ }
}

// ---- exports for the timing software -------------------------------------------------------------------------------------
const xml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TZ = { FR: "Europe/Paris", ES: "Europe/Madrid", CH: "Europe/Zurich", BE: "Europe/Brussels", IT: "Europe/Rome", DE: "Europe/Berlin",
  GB: "Europe/London", CA: "America/Toronto", AT: "Europe/Vienna", LU: "Europe/Luxembourg", PT: "Europe/Lisbon" };
function offsetOn(day, cc) {
  const tz = TZ[cc];
  if (!tz) return "";
  const d = new Date(`${day}T12:00:00Z`), p = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const m = Math.round((p - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 60000);
  return `${m < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m) / 60)).padStart(2, "0")}:${String(Math.abs(m) % 60).padStart(2, "0")}`;
}
/** A file of the entries: f "iofxml" (an IOF XML 3.0 EntryList, or StartList when `starts`), "oecsv" (OE's CSV), "csv". */
export function exportFile(ev, form, rows, f, { starts = false } = {}) {
  const list = rows.filter((r) => r.state === "entered" || r.state === "pending");
  const clsName = (id) => classOf(form, id)?.name || id || "";
  const slug = String(ev.name || "event").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "event";
  if (f === "iofxml") {
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z"), off = offsetOn(ev.date, ev.country);
    const tm = (s) => `${ev.date}T${hms(s)}${off}`;
    const person = (r) => `<Person${r.sex ? ` sex="${r.sex}"` : ""}>${r.licence ? `<Id>${xml(r.licence)}</Id>` : ""}<Name><Family>${xml(r.last_name)}</Family><Given>${xml(r.first_name)}</Given></Name>${r.birth_year ? `<BirthDate>${r.birth_year}-01-01</BirthDate>` : ""}</Person>`;
    const org = (r) => (r.club_name || r.club_code ? `<Organisation>${r.club_code ? `<Id>${xml(r.club_code)}</Id>` : ""}<Name>${xml(r.club_name || r.club_code)}</Name>${r.club_country ? `<Country code="${xml(r.club_country)}"></Country>` : ""}</Organisation>` : "");
    const head = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    const evx = `  <Event><Name>${xml(ev.name)}</Name><StartTime><Date>${ev.date}</Date></StartTime></Event>\n`;
    if (starts) {
      const by = new Map();
      for (const r of list.filter((x) => x.start_s != null)) (by.get(r.class_id) || by.set(r.class_id, []).get(r.class_id)).push(r);
      const cls = [...by].map(([id, rs]) => `  <ClassStart>\n    <Class><Name>${xml(clsName(id))}</Name></Class>\n    <Course><Name>${xml(courseName(form, rs[0].course))}</Name></Course>\n${rs.sort((a, b) => a.start_s - b.start_s).map((r) => `    <PersonStart>${person(r)}${org(r)}<Start><StartTime>${tm(r.start_s)}</StartTime>${r.card ? `<ControlCard>${xml(r.card)}</ControlCard>` : ""}</Start></PersonStart>\n`).join("")}  </ClassStart>\n`).join("");
      return { name: `startlist-${slug}.xml`, type: "application/xml",
        body: `${head}<StartList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0" createTime="${now}" creator="Ozimut">\n${evx}${cls}</StartList>\n` };
    }
    const es = list.map((r) => `  <PersonEntry>${person(r)}${org(r)}${r.card ? `<ControlCard>${xml(r.card)}</ControlCard>` : ""}<Class><Name>${xml(clsName(r.class_id))}</Name></Class></PersonEntry>\n`).join("");
    return { name: `entries-${slug}.xml`, type: "application/xml",
      body: `${head}<EntryList xmlns="http://www.orienteering.org/datastandard/3.0" iofVersion="3.0" createTime="${now}" creator="Ozimut">\n${evx}${es}</EntryList>\n` };
  }
  if (f === "oecsv") {
    // OE's own layout (OE2003/OE12 « Entries » CSV, its French headings: the federation's software reads them), windows-1252
    const head = "N° dép.;Puce;Ident. base de données;Nom;Prénom;Né;S;Plage;nc;Départ;Arrivée;Temps;Evaluation;N° club;Nom;Ville;Nat;N° cat.;Court;Long;Num1;Num2;Num3;Text1;Text2;Text3;Adr. nom;Rue;Ligne2;Code Post.;Ville;Tél.;Fax;E-mail;Id/Club;Louée;Engagement;Payé;Circuit N°;Circuit";      // i18n-ignore (the format's headings)
    const ci = new Map(form.classes.map((c, i) => [c.id, i + 1]));
    const courses = [...new Set(list.map((r) => r.course).filter(Boolean))];
    const cell = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = list.map((r) => [r.id, r.card, r.licence, r.last_name, r.first_name, r.birth_year || "", r.sex === "F" ? "F" : r.sex === "M" ? "H" : "", "", "",
      r.start_s != null ? hms(r.start_s) : "", "", "", "", r.club_country === "FR" ? r.club_code : "", r.club_name, "", r.club_country || "",
      ci.get(r.class_id) || "", clsName(r.class_id), clsName(r.class_id), "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
      r.rent ? "X" : "", (r.price / 100).toFixed(2).replace(".", ","), r.pay_state === "due" ? "" : "X", courses.indexOf(r.course) + 1 || "", courseName(form, r.course)].map(cell).join(";"));
    const text = [head, ...lines].join("\r\n") + "\r\n";
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); bytes[i] = c < 256 ? c : c === 0x20ac ? 0x80 : 0x3f; }
    return { name: `oe-${slug}.csv`, type: "text/csv; charset=windows-1252", body: bytes };
  }
  // a plain table, every field the organisers keep (keys in English: a file for spreadsheets, any language)
  const keys = ["id", "state", "origin", "last_name", "first_name", "licence", "birth_year", "sex", "category", "club_country", "club_code", "club_name",
    "class", "course", "card", "rent", "options", "price", "order_ref", "payer", "pay_state", "paid_how", "start", "note", "created_at"];
  const cell = (v) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = list.concat(rows.filter((r) => r.state === "cancelled")).map((r) => keys.map((k) => cell(k === "class" ? clsName(r.class_id)
    : k === "start" ? (r.start_s != null ? hms(r.start_s) : "") : k === "price" ? (r.price / 100).toFixed(2) : k === "options" ? j(r.options, []).join(" ")
      : k === "payer" ? (r.payer === "club" ? `club ${r.payer_org}` : "runner") : r[k])).join(";"));
  return { name: `entries-${slug}.csv`, type: "text/csv; charset=utf-8", body: `﻿${[keys.join(";"), ...lines].join("\r\n")}\r\n` };
}
