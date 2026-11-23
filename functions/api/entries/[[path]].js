// /api/entries — entries, merged with start times (docs/clubs/design.md §3-4; owner, 2026-11-22; migration 0031, _lib/entries.js).
// An event (« Orga », api/events) opens an entry form: its classes, prices, fields, how start times are given (none, booked by
// the runners on a grid, drawn, a file deposited); runners enter from Arena (#/inscription?ev=) — signed in for themselves,
// « Mes coureurs » and their child accounts, or not signed in through a registration blended with the entry —; the event's
// team (its organisers) follow, import, change, mark what was paid, draw, publish the start list and export for the timing
// software. One entry per person and event; a slot and the club rule as the booking of 2026-11-03 had them. Every payment is
// made outside Ozimut: an entry's price is fixed when it is made; the payer (the runner, or the runner's club under its policy:
// _lib/clubpolicy.js) owes it under one reference per payer and event.
//
//   GET    /api/entries/open                      { forms: [{ key (race key), event, name, date, state, closes }] } the coming
//                                                 events whose form is open or closed (the Agenda's « S'inscrire »; visitors too)
//   GET    /api/entries/mine                      { entries: [...] } « Mes inscriptions »: what the account entered and its own
//                                                 entries, to come and past, with amounts, references and the organisers' bank
//   GET    /api/entries/team                      { forms: [{ event, state, n, pending, unpaid }] } the forms of the account's teams
//   GET    /api/entries/runners                   { runners, children, last } « Mes coureurs », the account's child accounts, and
//                                                 each one's last entered fields (year of birth, sex, club, card)
//   POST   /api/entries/runners                   { first_name, last_name, licence?, club_*, card? } -> { runner }
//   PUT    /api/entries/runners/<id>              the same -> { runner };  DELETE /api/entries/runners/<id>
//   POST   /api/entries/children                  { first_name, last_name, birth_year, licence?, club_* } -> { child } a child account
//                                                 (users.child, a guardian row: _lib/track.js createChild), whatever TRACK_OPEN says
//   GET    /api/entries/<event>                   { event, form, grid?, mine, team, bank? } the form for runners (a draft: its team
//                                                 only); grid: the booking's starts taken; bank: shown to those who entered
//   GET    /api/entries/<event>/public            { event, entries: [{ n, club, cc, cls, s }] } the list of entrants (entered only;
//                                                 no licence, card, year, amount or payment state; visitors too)
//   POST   /api/entries/<event>                   { entries: [{ self | runner | child | person, class_id, card?, rent?, options?,
//                                                 start?, birth_year?, sex?, note? }] } -> { results: [{ ok, id, price, ref } | { error }] }
//   POST   /api/entries/<event>/guest             { email, password, first, last, birthYear, club_*, licence?, consent, lang,
//                                                 turnstile, website, entries: [...] } a new account (_lib/signup.js) and its
//                                                 entries, pending until its e-mail is confirmed (api/account/verify.js)
//   PATCH  /api/entries/<event>/<id>             { class_id?, card?, rent?, options?, start?, note? } one's entry, until the closing
//   DELETE /api/entries/<event>/<id>             one's entry cancelled, until the closing
//   GET    /api/entries/<event>/form              the team: { event, form (null before its first save), counts, bank, courses }
//   PUT    /api/entries/<event>/form              the team: the settings (_lib/entries.js cleanForm)
//   GET    /api/entries/<event>/list              the team: { entries (every field), refs }
//   POST   /api/entries/<event>/rows              the team: { rows: [{ first_name, last_name, licence?, birth_year?, sex?, category?,
//                                                 club_*, class_id | class, card?, rent?, start?, note?, paid? }], origin: file|hand,
//                                                 force? } -> { results: [{ ok, id, merged } | { error }] } (merged on the person)
//   PATCH  /api/entries/<event>/rows/<id>        the team: any field (class_id, card, rent, start, course, price, pay_state, state,
//                                                 note, names, club…), `force` past the club rule; the runner told of a start moved
//   DELETE /api/entries/<event>/rows/<id>        the team: the entry cancelled (?hard=1: deleted); the runner told
//   POST   /api/entries/<event>/pay              the team: { ids | ref, state (paid|due|waived), how } -> { changed }
//   POST   /api/entries/<event>/starts           the team: { draw: [[id, start_s, course?]], by?: drawn|deposited|hand, clear? }
//   POST   /api/entries/<event>/publish          the team: the start list published now (also done at the closing)
//   GET    /api/entries/<event>/export?f=iofxml|oecsv|csv[&starts=1]   the team: a file for the timing software
//   POST   /api/entries/<event>/chrono            the team: the entries written to the event's Chrono log, started if need be
//                                                 (_lib/entrychrono.js; afterwards every change of entries follows) -> { wrote, changed }

import { allow, currentUser, isAdmin, json, nowIso, readBody } from "../../_lib/api.js";
import { clubOf as accountClub } from "../../_lib/club.js";
import { showModule } from "../../_lib/modules.js";
import { childrenOf, createChild, isGuardian } from "../../_lib/track.js";
import { createAccount } from "../../_lib/signup.js";
import * as E from "../../_lib/entries.js";
import { carriersOf } from "../../_lib/clubpolicy.js";
import { fromChrono, toChrono } from "../../_lib/entrychrono.js";

const ID = /^[a-z0-9]{6,20}$/;
const no = (code, status = 400, more = {}) => json({ error: code, ...more }, status);

export const onRequest = async (ctx) => {
  const { request, env, params } = ctx;
  if (!env.DB) return no("server not configured", 500);
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method;
  // the closings, publications and reminders (_lib/entries.js entriesSoon, at most every 10 minutes an isolate): from here too,
  // not only from /api/track's page views
  E.entriesSoon(ctx);
  try {
    const user = await currentUser(request, env);
    const top = parts[0] || "";
    if (top === "open" && method === "GET") return await openList(env);
    if (top === "mine" && method === "GET") return await (user ? mine(env, user) : no("login required", 401));
    if (top === "team" && method === "GET") return await (user ? team(env, user) : no("login required", 401));
    if (top === "runners") return await (user ? runners(ctx, user, parts[1] ? Number(parts[1]) : null) : no("login required", 401));
    if (top === "children" && method === "POST") return await (user ? child(ctx, user) : no("login required", 401));
    if (!ID.test(top)) return await no("not found", 404);
    const ev = await E.loadEvent(env, top);
    if (!ev) return await no("not found", 404);
    const sub = parts[1] || "";
    if (!sub && method === "GET") return await formForRunners(ctx, user, ev);
    if (sub === "public" && method === "GET") return await publicList(env, ev);
    if (sub === "guest" && method === "POST") return await guest(ctx, ev);
    if (!user) return await no("login required", 401);
    if (!sub && method === "POST") return await enter(ctx, user, ev);
    if (/^\d+$/.test(sub) && (method === "PATCH" || method === "DELETE")) return await changeMine(ctx, user, ev, Number(sub));
    // the team's routes
    if (!(await E.teamMay(env, request, user, ev))) return await no("forbidden", 403);
    if (sub === "form" && method === "GET") return await formForTeam(ctx, user, ev);
    if (sub === "form" && method === "PUT") return await saveForm(ctx, user, ev);
    const form = await E.loadForm(env, ev.id);
    if (!form) return await no("no form", 404);
    if (sub === "list" && method === "GET") return await list(env, ev, form);
    if (sub === "rows" && !parts[2] && method === "POST") return await rows(ctx, user, ev, form);
    if (sub === "rows" && /^\d+$/.test(parts[2] || "") && (method === "PATCH" || method === "DELETE")) return await rowChange(ctx, user, ev, form, Number(parts[2]));
    if (sub === "pay" && method === "POST") return await pay(ctx, user, ev);
    if (sub === "starts" && method === "POST") return await starts(ctx, user, ev, form);
    if (sub === "publish" && method === "POST") return await publishNow(ctx, user, ev, form);
    if (sub === "export" && method === "GET") return await exportNow(ctx, ev, form);
    if (sub === "chrono" && method === "POST") return await json({ ok: true, ...(await toChrono(env, ev.id, { force: true })) });
  } catch (e) {
    if (E.missing(e)) return no("not ready", 503);         // before migration 0031
    throw e;
  }
  return no("not found", 404);
};

const evView = (ev) => ({ id: ev.id, name: ev.name, date: ev.date, place: ev.place, club: ev.club, country: ev.country, race: ev.race_key || null,
  type: ev.type, terrain: ev.terrain, epreuve: ev.epreuve, site: ev.site });
/** The form as runners see it. */
function formView(form, ev, counts = null) {
  const st = E.openState(form, ev);
  return { state: form.state, open: st.open, late: st.late, soon: st.soon, opens: form.opens, closes: form.closes, late_until: form.late_until,
    places: form.places, classes: form.classes, prices: form.prices, fields: form.fields, pay: { transfer: form.pay.transfer, desk: form.pay.desk,
      before: form.pay.before, note: form.pay.note }, refund_rule: form.refund_rule, note: form.note,
    starts: { mode: form.starts.mode, ...(form.starts.mode === "booking" ? { circuits: form.starts.circuits, gap: form.starts.gap, max: form.starts.max,
      blocked: form.starts.blocked, note: form.starts.note } : {}) },
    ...(counts ? { counts } : {}) };
}
async function countsOf(env, ev) {
  const { results } = await env.DB.prepare("SELECT class_id, COUNT(*) AS n FROM entries WHERE event_id = ? AND state != 'cancelled' GROUP BY class_id").bind(ev.id).all();
  const byClass = Object.fromEntries(results.map((r) => [r.class_id, r.n]));
  return { total: results.reduce((s, r) => s + r.n, 0), byClass };
}
/** The entry as its runner and the account that made it see it. */
const entryView = (r, form) => ({ id: r.id, first_name: r.first_name, last_name: r.last_name, licence: r.licence, birth_year: r.birth_year, sex: r.sex,
  category: r.category, club_country: r.club_country, club_code: r.club_code, club_name: r.club_name, class_id: r.class_id,
  class: form ? E.classOf(form, r.class_id)?.name || r.class_id : r.class_id, course: r.course, card: r.card, rent: !!r.rent, options: JSON.parse(r.options || "[]"),
  price: r.price, parts: JSON.parse(r.price_rule || "[]"), payer: r.payer, ref: r.order_ref, pay_state: r.pay_state, paid_how: r.paid_how, start: r.start_s,
  state: r.state, origin: r.origin, note: r.note, runner_id: r.runner_id, user_id: r.user_id, mine: true });

// ---- the coming forms (the Agenda) --------------------------------------------------------------------------------------
async function openList(env) {
  const { results } = await env.DB.prepare(`SELECT f.event_id, f.state, f.opens, f.closes, f.late_until, e.race_key, e.name, e.date FROM entry_forms f
    JOIN events e ON e.id = f.event_id WHERE e.status = 'active' AND e.date >= ? AND f.state IN ('open', 'closed') ORDER BY e.date`).bind(E.parisDay()).all();
  const now = E.parisNow();
  const forms = results.map((r) => {
    const st = E.openState(r, { date: r.date }, now);
    return { key: r.race_key || null, event: r.event_id, name: r.name, date: r.date, state: st.open ? "open" : st.soon ? "soon" : "closed",
      opens: r.opens, closes: r.late_until || r.closes };
  });
  return json({ forms }, 200, { "Cache-Control": "private, max-age=60" });
}

// ---- « Mes inscriptions » -------------------------------------------------------------------------------------------------
async function mine(env, user) {
  const kids = (await childrenOf(env, user.id).catch(() => [])).map((k) => k.id);
  const ids = [user.id, ...kids];
  const { results } = await env.DB.prepare(`SELECT x.*, e.name AS ev_name, e.date AS ev_date, e.place AS ev_place, e.club AS ev_club, e.country AS ev_country,
      e.race_key AS ev_race, e.org_id AS ev_org FROM entries x JOIN events e ON e.id = x.event_id
    WHERE (x.by_user = ? OR x.user_id IN (${ids.map(() => "?").join(",")})) AND x.state != 'cancelled' ORDER BY e.date DESC, x.id`).bind(user.id, ...ids).all();
  const forms = new Map(), banks = new Map(), out = [];
  for (const r of results) {
    if (!forms.has(r.event_id)) forms.set(r.event_id, await E.loadForm(env, r.event_id));
    const form = forms.get(r.event_id), ev = { id: r.event_id, date: r.ev_date, org_id: r.ev_org };
    if (!banks.has(r.event_id)) banks.set(r.event_id, await E.orgBank(env, ev, form));
    const st = form ? E.openState(form, ev) : { open: false };
    out.push({ ...entryView(r, form), event: { id: r.event_id, name: r.ev_name, date: r.ev_date, place: r.ev_place, club: r.ev_club, country: r.ev_country,
      race: r.ev_race }, open: st.open, bank: r.payer === "runner" && r.pay_state === "due" ? banks.get(r.event_id) : null,
      desk: !!form?.pay?.desk, payNote: form?.pay?.note || "", before: form?.pay?.before || "", currency: form?.prices?.currency || "EUR" });
  }
  return json({ entries: out });
}

async function team(env, user) {
  const admin = isAdmin(env, user);
  const { results } = await env.DB.prepare(`SELECT f.event_id, f.state, f.closes, f.late_until,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = f.event_id AND x.state = 'entered') AS n,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = f.event_id AND x.state = 'pending') AS pending,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = f.event_id AND x.state != 'cancelled' AND x.pay_state = 'due') AS unpaid
    FROM entry_forms f ${admin ? "" : "WHERE EXISTS (SELECT 1 FROM event_members m WHERE m.event_id = f.event_id AND m.user_id = ?)"}`)
    .bind(...(admin ? [] : [user.id])).all();
  return json({ forms: results.map((r) => ({ event: r.event_id, state: r.state, closes: r.late_until || r.closes, n: r.n, pending: r.pending, unpaid: r.unpaid })) });
}

// ---- « Mes coureurs », children ------------------------------------------------------------------------------------------
/** The account's holder as a runner: their names, their FFCO club from the data, else the club typed for another country. */
async function holder({ request, env }, user) {
  const out = { first_name: E.clean(user.first_name, 60) || E.clean(user.display_name, 60), last_name: E.clean(user.last_name, 60),
    licence: /^\d+$/.test(String(user.licence || "")) ? String(user.licence) : "", club_country: "", club_code: "", club_name: "" };
  const code = out.licence ? await accountClub(env, request, out.licence) : null;
  if (code) {
    out.club_country = "FR"; out.club_code = code;
    try {
      const r = await env.ASSETS.fetch(new URL("/data/fr/pub/meta.json", request.url));
      out.club_name = (r.ok ? (await r.json()).names?.clubs?.[code] : "") || "";
    } catch (e) { /* the page names it */ }
    return out;
  }
  try {
    const m = await env.DB.prepare("SELECT country, club FROM user_countries WHERE user_id = ? AND status = 'ok' AND club != '' ORDER BY added_at LIMIT 1")
      .bind(user.id).first();
    if (m) Object.assign(out, E.clubOf({ club_country: m.country, club_name: m.club }));
  } catch (e) { /* none then */ }
  return out;
}
/** « Mes coureurs », the holder added the first time. */
async function runnerList(ctx, user) {
  const { env } = ctx;
  let { results } = await env.DB.prepare("SELECT * FROM booking_runners WHERE user_id = ? ORDER BY self DESC, id").bind(user.id).all();
  if (!results.length && !user.child) {
    const self = await holder(ctx, user);
    const r = await env.DB.prepare(`INSERT INTO booking_runners (user_id, first_name, last_name, licence, club_country, club_code, club_name, card, self, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '', 1, ?) RETURNING *`).bind(user.id, self.first_name, self.last_name, self.licence, self.club_country,
      self.club_code, self.club_name, nowIso()).first();
    results = [r];
  }
  return results;
}
const MAX_RUNNERS = 40;
async function runners(ctx, user, id) {
  const { request, env } = ctx;
  const method = request.method;
  if (method === "GET" && !id) {
    const rs = await runnerList(ctx, user);
    const kids = await childrenOf(env, user.id).catch(() => []);
    // each one's last entry: what the form asks again (year of birth, sex, a child's club, the card)
    const { results: lastRows } = await env.DB.prepare(`SELECT runner_id, user_id, birth_year, sex, club_country, club_code, club_name, card, licence FROM entries
      WHERE by_user = ? AND id IN (SELECT MAX(id) FROM entries WHERE by_user = ? GROUP BY COALESCE(runner_id, -user_id))`).bind(user.id, user.id).all();
    const last = {};
    for (const r of lastRows) {
      const k = r.runner_id ? `r${r.runner_id}` : r.user_id ? `u${r.user_id}` : null;
      if (k) last[k] = { birth_year: r.birth_year, sex: r.sex, club_country: r.club_country, club_code: r.club_code, club_name: r.club_name, card: r.card, licence: r.licence };
    }
    return json({ runners: rs.map(E.pubRunner), me: { id: user.id, birth_year: user.birth_year || null, child: user.child === 1 },
      children: kids.map((k) => ({ id: k.id, first_name: k.first_name, last_name: k.last_name, licence: k.licence || "", birth_year: k.birth_year || null })), last });
  }
  if (method === "POST" && !id) {
    const f = E.runnerFields(await readBody(request));
    if (!f) return no("bad request");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM booking_runners WHERE user_id = ?").bind(user.id).first();
    if (n.n >= MAX_RUNNERS) return no("too many");
    const r = await env.DB.prepare(`INSERT INTO booking_runners (user_id, first_name, last_name, licence, club_country, club_code, club_name, card, self, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING *`).bind(user.id, f.first_name, f.last_name, f.licence, f.club_country, f.club_code,
      f.club_name, f.card, nowIso()).first();
    return json({ runner: E.pubRunner(r) });
  }
  if (id && method === "PUT") {
    const f = E.runnerFields(await readBody(request));
    if (!f) return no("bad request");
    const r = await env.DB.prepare(`UPDATE booking_runners SET first_name = ?, last_name = ?, licence = ?, club_country = ?, club_code = ?,
      club_name = ?, card = ? WHERE id = ? AND user_id = ? RETURNING *`).bind(f.first_name, f.last_name, f.licence, f.club_country, f.club_code,
      f.club_name, f.card, id, user.id).first();
    return r ? json({ runner: E.pubRunner(r) }) : no("not found", 404);
  }
  if (id && method === "DELETE") {
    await env.DB.prepare("DELETE FROM booking_runners WHERE id = ? AND user_id = ? AND self = 0").bind(id, user.id).run();
    return json({ ok: true });
  }
  return no("not found", 404);
}
async function child({ request, env }, user) {
  if (user.demo_until) return no("demo", 403);
  if (!(await allow(env, `tchild:${user.id}`, 10, 86400))) return no("rate", 429);
  const b = (await readBody(request)) || {};
  const r = await createChild(env, user, { first: b.first_name, last: b.last_name, birthYear: b.birth_year, licence: b.licence, lang: user.lang });
  if (r.error) return no(r.error, r.status);
  const c = r.child;
  return json({ child: { id: c.id, first_name: c.first_name, last_name: c.last_name, licence: c.licence || "", birth_year: c.birth_year }, club: E.clubOf(b) });
}

// ---- the form for runners ------------------------------------------------------------------------------------------------
async function formForRunners(ctx, user, ev) {
  const { request, env } = ctx;
  const form = await E.loadForm(env, ev.id);
  const isTeam = user ? await E.teamMay(env, request, user, ev) : false;
  if (!form || (form.state === "draft" && !isTeam)) return no("not found", 404, { team: isTeam });
  const counts = await countsOf(env, ev);
  let grid = null, mineList = [];
  if (form.starts.mode === "booking") {
    const { results } = await env.DB.prepare(`SELECT id, course, start_s, first_name, last_name, club_name, club_code, club_country, club_key, state, by_user, user_id
      FROM entries WHERE event_id = ? AND state != 'cancelled' AND start_s IS NOT NULL ORDER BY start_s`).bind(ev.id).all();
    grid = results.map((b) => ({ c: b.course, s: b.start_s, n: b.state === "pending" ? "" : `${b.first_name} ${b.last_name}`.trim(),
      club: b.club_name || b.club_code, code: b.club_code, cc: b.club_country, ck: b.club_key, ...(user && (b.by_user === user.id || b.user_id === user.id) ? { id: b.id, mine: true } : {}) }));
  }
  let bank = null;
  if (user) {
    const kids = (await childrenOf(env, user.id).catch(() => [])).map((k) => k.id);
    const ids = [user.id, ...kids];
    const { results } = await env.DB.prepare(`SELECT * FROM entries WHERE event_id = ? AND state != 'cancelled' AND (by_user = ? OR user_id IN (${ids.map(() => "?").join(",")}))
      ORDER BY id`).bind(ev.id, user.id, ...ids).all();
    mineList = results.map((r) => entryView(r, form));
    if (results.some((r) => r.payer === "runner" && r.pay_state === "due")) bank = await E.orgBank(env, ev, form);
  }
  // the clubs whose policy carries this event (the form says « pris en charge par votre club »: _lib/clubpolicy.js)
  const carriers = user ? await carriersOf(env, ev) : [];
  return json({ event: evView(ev), form: formView(form, ev, counts), grid, mine: mineList, team: isTeam, bank, signedIn: !!user, carriers }, 200, { "Cache-Control": "no-store" });
}

async function publicList(env, ev) {
  const form = await E.loadForm(env, ev.id);
  if (!form || form.state === "draft") return no("not found", 404);
  const { results } = await env.DB.prepare(`SELECT first_name, last_name, club_name, club_code, club_country, class_id, start_s FROM entries
    WHERE event_id = ? AND state = 'entered' ORDER BY class_id, last_name, first_name`).bind(ev.id).all();
  const entries = results.map((r) => ({ n: `${r.first_name} ${r.last_name}`.trim(), club: r.club_name || r.club_code, cc: r.club_country,
    cls: E.classOf(form, r.class_id)?.name || r.class_id, s: r.start_s }));
  return json({ event: evView(ev), entries, classes: form.classes.map((c) => ({ id: c.id, name: c.name })) }, 200, { "Cache-Control": "private, max-age=30" });
}

// ---- entering -------------------------------------------------------------------------------------------------------------
/**
 * One item's runner, resolved: { fields } (the entry's identity: names, licence, birth, sex, club, runner_id, user_id) or { error }.
 * `self`: the account itself; `runner`: one of « Mes coureurs »; `child`: a child account it manages; `person`: someone new, added
 * to « Mes coureurs » on the way.
 */
async function runnerOf(ctx, user, it, cache) {
  const { env } = ctx;
  const birth = it.birth_year != null && it.birth_year !== "" ? E.birthOk(it.birth_year) : null, sex = E.sexOk(it.sex);
  const club = (x) => E.clubOf(x);
  if (it.self) {
    const h = cache.holder || (cache.holder = await holder(ctx, user));
    const selfRow = (await runnerList(ctx, user)).find((r) => r.self);
    return { first_name: h.first_name, last_name: h.last_name, licence: h.licence, ...club(it.club_country ? it : h), birth_year: birth ?? user.birth_year ?? null,
      sex, runner_id: selfRow?.id ?? null, user_id: user.id };
  }
  if (it.child != null) {
    const id = Number(it.child);
    if (!(await isGuardian(env, user.id, id))) return { error: "runner" };
    const k = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND child = 1 AND status = 'active'").bind(id).first();
    if (!k) return { error: "runner" };
    return { first_name: k.first_name, last_name: k.last_name, licence: /^\d{1,9}$/.test(k.licence || "") ? k.licence : "", ...club(it), birth_year: k.birth_year ?? birth,
      sex, runner_id: null, user_id: k.id };
  }
  let r = null;
  if (it.runner != null) {
    r = await env.DB.prepare("SELECT * FROM booking_runners WHERE id = ? AND user_id = ?").bind(Number(it.runner), user.id).first();
    if (!r) return { error: "runner" };
  } else if (it.person) {
    const f = E.runnerFields(it.person);
    if (!f) return { error: "runner" };
    const had = await env.DB.prepare("SELECT * FROM booking_runners WHERE user_id = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) AND licence = ?")
      .bind(user.id, f.first_name, f.last_name, f.licence).first();
    r = had || await env.DB.prepare(`INSERT INTO booking_runners (user_id, first_name, last_name, licence, club_country, club_code, club_name, card, self, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING *`).bind(user.id, f.first_name, f.last_name, f.licence, f.club_country, f.club_code, f.club_name, f.card, nowIso()).first();
    if (!it.card && f.card) it.card = f.card;
  } else return { error: "runner" };
  return { first_name: r.first_name, last_name: r.last_name, licence: r.licence, ...club(r), birth_year: birth, sex, runner_id: r.id, user_id: r.self ? user.id : null,
    card0: r.card };
}

/**
 * The entries of one account (signed in, or just registered: `state` pending), item by item. -> [{ ok, id, price, ref } | { error }]
 */
async function makeEntries(ctx, user, ev, form, items, { state = "entered", origin = "form", isTeam = false } = {}) {
  const { request, env } = ctx;
  const st = E.openState(form, ev);
  const had = (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND by_user = ? AND state != 'cancelled'").bind(ev.id, user.id).first()).n;
  let count = had;
  const limit = form.starts.mode === "booking" ? Math.min(form.starts.max || 10, E.MAX_PER_ACCOUNT) : E.MAX_PER_ACCOUNT;
  const cache = {}, results = [], year = Number(String(ev.date).slice(0, 4));
  for (const it of items) {
    const who = await runnerOf(ctx, user, it || {}, cache);
    if (who.error) { results.push({ error: who.error }); continue; }
    if (count >= limit && !isTeam) { results.push({ error: "max" }); continue; }
    const cls = E.classOf(form, String(it.class_id || ""));
    if (!cls) { results.push({ error: "class" }); continue; }
    const course = E.courseOf(form, cls.id);
    let card = /^\d{1,10}$/.test(String(it.card ?? "").trim()) ? String(it.card).trim() : who.card0 || "";
    const rent = it.rent === true && form.fields.card !== "no";
    if (form.fields.card === "no") card = "";
    if (form.fields.card === "require" && !card && !rent) { results.push({ error: "card" }); continue; }
    if (form.fields.birth && !who.birth_year) { results.push({ error: "birth" }); continue; }
    let start = null;
    if (it.start != null && it.start !== "" && form.starts.mode === "booking") {
      start = Number(it.start);
      if (!E.slotOk(form.starts, course, start)) { results.push({ error: "slot" }); continue; }
    }
    const options = (Array.isArray(it.options) ? it.options : []).map(String).filter((o) => form.prices.options.some((x) => x.id === o));
    const ck = E.clubKey(who), org_id = await E.orgIdOf(env, who);
    const category = E.clean(it.category, 12) || E.categoryOf(ev.country, who.birth_year, who.sex, year);
    const row = { event_id: ev.id, person: E.personOf(who, ck), first_name: who.first_name, last_name: who.last_name, licence: who.licence,
      birth_year: who.birth_year, sex: who.sex, category, club_country: who.club_country, club_code: who.club_code, club_name: who.club_name, club_key: ck,
      org_id, runner_id: who.runner_id, user_id: who.user_id, by_user: user.id, class_id: cls.id, course, card, rent: rent ? 1 : 0, options: JSON.stringify(options),
      start_s: start, start_by: start != null ? "booked" : "", state, origin, note: form.fields.note ? E.clean(it.note, 300) : "" };
    Object.assign(row, await E.billOf(env, request, ev, form, { ...row, options }, { late: st.late, payerUser: user.id }));
    const res = await E.insertEntry(env, form, row);
    if (res.ok) {
      count++;
      if (card && who.runner_id && card !== who.card0) await env.DB.prepare("UPDATE booking_runners SET card = ? WHERE id = ? AND user_id = ?").bind(card, who.runner_id, user.id).run();
      results.push({ ok: true, id: res.id, price: row.price, ref: row.order_ref, payer: row.payer, name: `${row.first_name} ${row.last_name}` });
    } else results.push({ ...res, name: `${row.first_name} ${row.last_name}` });
  }
  if (results.some((x) => x.ok)) await E.touch(env, ev.id);
  return results;
}

async function enter(ctx, user, ev) {
  const { request, env } = ctx;
  if (user.demo_until) return no("demo", 403);
  if (user.child) return no("forbidden", 403);
  const form = await E.loadForm(env, ev.id);
  if (!form || form.state === "draft") return no("not found", 404);
  const isTeam = await E.teamMay(env, request, user, ev);
  if (!E.openState(form, ev).open && !isTeam) return no("closed");
  if (!(await allow(env, `ent:${user.id}`, 120, 3600))) return no("too many", 429);
  const b = await readBody(request);
  const items = Array.isArray(b?.entries) ? b.entries.slice(0, E.MAX_ITEMS) : null;
  if (!items?.length) return no("bad request");
  return json({ results: await makeEntries(ctx, user, ev, form, items, { isTeam }) });
}

/** Registration blended with the entry (docs/clubs/design.md §3): the account made as /api/account/register makes it, its
 *  entries pending until its e-mail is confirmed. An address that has an account is asked to sign in. */
async function guest(ctx, ev) {
  const { request, env } = ctx;
  const form = await E.loadForm(env, ev.id);
  if (!form || !E.openState(form, ev).open) return no("closed");
  const b = await readBody(request);
  if (!b) return no("bad request");
  const items = Array.isArray(b.entries) ? b.entries.slice(0, E.MAX_ITEMS) : [];
  if (!items.length && !b.website) return no("bad request");
  // the club given becomes the country joined (France: its licence, checked against the federation's index)
  const club = E.clubOf(b), lic = String(b.licence || "").replace(/\s+/g, "");
  const countries = club.club_country === "FR" && lic ? [{ country: "FR", id: lic }]
    : club.club_country && club.club_country !== "FR" ? [{ country: club.club_country, club: club.club_name }] : [];
  const r = await createAccount(env, request, { ...b, countries, birthYear: b.birthYear ?? b.birth_year });
  if (r.error) return no(r.error, r.status || 400, r.country ? { country: r.country } : {});
  if (r.bot) return json({ ok: true, results: [] });
  if (r.resent) return no("email_pending", 409);
  const user = r.user;
  // its own « Mes coureurs » row: the runner as typed (the FFCO club, or the club of another country)
  const f = E.runnerFields({ first_name: user.first_name, last_name: user.last_name, licence: user.licence, ...club, card: b.card });
  if (f) {
    await env.DB.prepare(`INSERT INTO booking_runners (user_id, first_name, last_name, licence, club_country, club_code, club_name, card, self, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).bind(user.id, f.first_name, f.last_name, f.licence, f.club_country, f.club_code, f.club_name, f.card, nowIso()).run();
  }
  const results = await makeEntries(ctx, user, ev, form, items.map((x) => (x.self ? { ...x, club_country: club.club_country, club_code: club.club_code,
    club_name: club.club_name, birth_year: x.birth_year ?? b.birthYear } : x)), { state: "pending", origin: "guest" });
  return json({ ok: true, mail: r.mail, results });
}

// ---- one's own entry -------------------------------------------------------------------------------------------------------
async function ownsEntry(env, user, r) {
  if (r.by_user === user.id || r.user_id === user.id) return true;
  return !!r.user_id && (await isGuardian(env, user.id, r.user_id));
}
async function changeMine(ctx, user, ev, id) {
  const { request, env } = ctx;
  const form = await E.loadForm(env, ev.id);
  const r = form ? await env.DB.prepare("SELECT * FROM entries WHERE id = ? AND event_id = ? AND state != 'cancelled'").bind(id, ev.id).first() : null;
  if (!r || !(await ownsEntry(env, user, r))) return no("not found", 404);
  const st = E.openState(form, ev);
  if (!st.open) return no("closed", 403);
  if (request.method === "DELETE") {
    await env.DB.prepare("UPDATE entries SET state = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    await E.touch(env, ev.id);
    return json({ ok: true });
  }
  const b = (await readBody(request)) || {};
  const next = { ...r };
  if (b.class_id !== undefined) {
    const cls = E.classOf(form, String(b.class_id));
    if (!cls) return no("class");
    if (cls.places && cls.id !== r.class_id) {
      const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND class_id = ? AND state != 'cancelled'").bind(ev.id, cls.id).first()).n;
      if (n >= cls.places) return no("classFull", 409);
    }
    next.class_id = cls.id;
    if (E.courseOf(form, cls.id) !== r.course) { next.course = E.courseOf(form, cls.id); next.start_s = null; }
  }
  if (b.card !== undefined) next.card = form.fields.card === "no" ? "" : /^\d{1,10}$/.test(String(b.card ?? "").trim()) ? String(b.card).trim() : "";
  if (b.rent !== undefined) next.rent = b.rent === true ? 1 : 0;
  if (Array.isArray(b.options)) next.options = JSON.stringify(b.options.map(String).filter((o) => form.prices.options.some((x) => x.id === o)));
  if (b.note !== undefined && form.fields.note) next.note = E.clean(b.note, 300);
  if (form.fields.card === "require" && !next.card && !next.rent) return no("card");
  // the price again, while nothing was paid (its grid of now; a paid entry keeps its price)
  if (r.pay_state === "due" && (next.class_id !== r.class_id || next.rent !== r.rent || next.options !== r.options)) {
    const bill = await E.billOf(env, request, ev, form, { ...next, options: JSON.parse(next.options || "[]") }, { late: st.late, payerUser: r.payer_user });
    next.price = bill.price; next.price_rule = bill.price_rule; next.pay_state = bill.pay_state;
  }
  await env.DB.prepare(`UPDATE entries SET class_id = ?, course = ?, start_s = ?, card = ?, rent = ?, options = ?, note = ?, price = ?, price_rule = ?, pay_state = ?,
    updated_at = ? WHERE id = ?`).bind(next.class_id, next.course, next.start_s, next.card, next.rent, next.options, next.note, next.price, next.price_rule,
    next.pay_state, nowIso(), id).run();
  if (b.start !== undefined && form.starts.mode === "booking") {
    const s = b.start === null || b.start === "" ? null : Number(b.start);
    if (s != null && !E.slotOk(form.starts, next.course, s)) return no("slot");
    const m = await E.moveStart(env, form, { ...r, ...next }, next.course, s, { by: "booked" });
    if (m.error) return no(m.error, 409);
  }
  await E.touch(env, ev.id);
  return json({ ok: true });
}

// ---- the team: the settings -------------------------------------------------------------------------------------------------
async function formForTeam(ctx, user, ev) {
  const { env } = ctx;
  const form = await E.loadForm(env, ev.id);
  const counts = form ? await countsOf(env, ev) : { total: 0, byClass: {} };
  return json({ event: { ...evView(ev), org_id: ev.org_id ?? null }, form: form ? { ...formView(form, ev, counts), pay: form.pay, starts: form.starts,
    changed: form.changed_at, published: form.published_at } : null, bank: await E.orgBank(env, ev, form), admin: isAdmin(env, user) }, 200, { "Cache-Control": "no-store" });
}
async function saveForm(ctx, user, ev) {
  const { request, env } = ctx;
  if (user.demo_until) return no("demo", 403);
  const before = await E.loadForm(env, ev.id);
  const c = E.cleanForm(await readBody(request), before);
  if (c.error) return no(c.error, 400, c.name ? { name: c.name } : {});
  const f = c.form;
  if (before) {         // a class taken away, or a course of the grid, keeps its entries only if none: the organisers move them first
    const gone = before.classes.filter((x) => !f.classes.some((y) => y.id === x.id)).map((x) => x.id);
    if (gone.length) {
      const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND state != 'cancelled' AND class_id IN (${gone.map(() => "?").join(",")})`)
        .bind(ev.id, ...gone).first();
      if (n.n) return no("class in use", 409);
    }
  }
  const now = nowIso(), J = JSON.stringify;
  await env.DB.prepare(`INSERT INTO entry_forms (event_id, state, opens, closes, late_until, places, classes, prices, fields, starts, pay, refund_rule, note,
      created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (event_id) DO UPDATE SET state = excluded.state, opens = excluded.opens, closes = excluded.closes, late_until = excluded.late_until,
      places = excluded.places, classes = excluded.classes, prices = excluded.prices, fields = excluded.fields, starts = excluded.starts, pay = excluded.pay,
      refund_rule = excluded.refund_rule, note = excluded.note, updated_at = excluded.updated_at`)
    .bind(ev.id, f.state, f.opens, f.closes, f.late_until, f.places, J(f.classes), J(f.prices), J(f.fields), J(f.starts), J(f.pay), f.refund_rule, f.note,
      user.id, now, now).run();
  // a class's course changed: its entries follow (their start kept only on the same course)
  if (before) {
    for (const cl of f.classes) {
      const was = before.classes.find((x) => x.id === cl.id);
      const c1 = E.clean(cl.course || cl.name, 60), c0 = was ? E.clean(was.course || was.name, 60) : null;
      if (was && c1 !== c0) await env.DB.prepare("UPDATE entries SET course = ?, start_s = NULL, start_by = '' WHERE event_id = ? AND class_id = ?").bind(c1, ev.id, cl.id).run();
    }
  }
  await showModule(env, user.id, "orga");
  await E.touch(env, ev.id);
  return formForTeam(ctx, user, ev);
}

// ---- the team: the entries -----------------------------------------------------------------------------------------------
async function list(env, ev, form) {
  // what Chrono's desk did to the entries, read back first (_lib/entrychrono.js; nothing when the event has no log)
  try { await fromChrono(env, ev.id); } catch (e) { /* the list all the same */ }
  const { results } = await env.DB.prepare(`SELECT x.*, u.email AS by_email, u.display_name AS by_name FROM entries x LEFT JOIN users u ON u.id = x.by_user
    WHERE x.event_id = ? ORDER BY x.id`).bind(ev.id).all();
  const entries = results.map((r) => ({ ...r, options: JSON.parse(r.options || "[]"), parts: JSON.parse(r.price_rule || "[]"),
    by_email: /\.invalid$/.test(r.by_email || "") ? "" : r.by_email || "", by_name: r.by_name || "", class: E.classOf(form, r.class_id)?.name || r.class_id }));
  return json({ entries }, 200, { "Cache-Control": "no-store" });
}

async function rows(ctx, user, ev, form) {
  const { request, env } = ctx;
  const b = await readBody(request);
  const items = Array.isArray(b?.rows) ? b.rows.slice(0, E.MAX_ROWS) : null;
  if (!items?.length) return no("bad request");
  if (!(await allow(env, `entrows:${user.id}`, 60, 3600))) return no("too many", 429);
  const origin = ["file", "hand", "desk"].includes(b.origin) ? b.origin : "hand", force = b.force === true;
  const results = [], year = Number(String(ev.date).slice(0, 4));
  const byName = new Map(form.classes.map((c) => [E.norm(c.name), c]));
  for (const it of items) {
    const f = E.runnerFields(it);
    if (!f) { results.push({ error: "runner" }); continue; }
    const cls = E.classOf(form, String(it.class_id || "")) || byName.get(E.norm(it.class));
    if (!cls) { results.push({ error: "class", name: `${f.first_name} ${f.last_name}` }); continue; }
    const birth = E.birthOk(it.birth_year), sex = E.sexOk(it.sex), ck = E.clubKey(f);
    const course = E.courseOf(form, cls.id);
    const start = it.start != null && it.start !== "" && Number.isInteger(Number(it.start)) && Number(it.start) >= 0 && Number(it.start) < 86400 ? Number(it.start) : null;
    const person = E.personOf(f, ck);
    const had = await env.DB.prepare("SELECT * FROM entries WHERE event_id = ? AND person = ? AND state != 'cancelled'").bind(ev.id, person).first();
    const rent = it.rent === true || it.rent === 1 || it.rent === "1";
    const paid = it.paid === true;
    if (had) {
      // merged on the person: what the row gives replaces what the entry had
      await env.DB.prepare(`UPDATE entries SET class_id = ?, course = ?, card = COALESCE(NULLIF(?, ''), card), birth_year = COALESCE(?, birth_year),
        sex = COALESCE(NULLIF(?, ''), sex), category = COALESCE(NULLIF(?, ''), category), rent = ?, note = COALESCE(NULLIF(?, ''), note),
        pay_state = CASE WHEN ? THEN 'paid' ELSE pay_state END, updated_at = ? WHERE id = ?`)
        .bind(cls.id, course, f.card, birth, sex, E.clean(it.category, 12), rent ? 1 : had.rent, E.clean(it.note, 300), paid ? 1 : 0, nowIso(), had.id).run();
      if (start != null && start !== had.start_s) {
        const m = await E.moveStart(env, form, had, course, start, { force, by: origin === "file" ? "deposited" : "hand" });
        if (m.error) { results.push({ error: m.error, id: had.id, merged: true }); continue; }
      }
      results.push({ ok: true, id: had.id, merged: true });
      continue;
    }
    const org_id = await E.orgIdOf(env, f);
    const row = { event_id: ev.id, person, first_name: f.first_name, last_name: f.last_name, licence: f.licence, birth_year: birth, sex,
      category: E.clean(it.category, 12) || E.categoryOf(ev.country, birth, sex, year), club_country: f.club_country, club_code: f.club_code,
      club_name: f.club_name, club_key: ck, org_id, runner_id: null, user_id: null, by_user: user.id, class_id: cls.id, course, card: f.card, rent: rent ? 1 : 0,
      options: "[]", start_s: start, start_by: start != null ? (origin === "file" ? "deposited" : "hand") : "", state: "entered", origin, note: E.clean(it.note, 300) };
    // the organisers' entries: no account pays them through Ozimut (payer the person, or the club by its policy)
    Object.assign(row, await E.billOf(env, request, ev, form, { ...row, by_user: null, options: [] }, { payerUser: null }));
    if (paid) { row.pay_state = "paid"; }
    const res = await E.insertEntry(env, form, row, { force: true });
    if (res.ok && paid) await env.DB.prepare("UPDATE entries SET paid_at = ?, paid_by = ?, paid_how = 'other' WHERE id = ?").bind(nowIso(), user.id, res.id).run();
    results.push(res.ok ? { ok: true, id: res.id } : { ...res, name: `${f.first_name} ${f.last_name}` });
  }
  if (results.some((x) => x.ok)) await E.touch(env, ev.id);
  return json({ results });
}

const ROW_FIELDS = ["first_name", "last_name", "licence", "club_country", "club_code", "club_name", "category", "note"];
async function rowChange(ctx, user, ev, form, id) {
  const { request, env } = ctx;
  const r = await env.DB.prepare("SELECT * FROM entries WHERE id = ? AND event_id = ?").bind(id, ev.id).first();
  if (!r) return no("not found", 404);
  if (request.method === "DELETE") {
    const hard = new URL(request.url).searchParams.get("hard") === "1";
    if (hard) await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
    else await env.DB.prepare("UPDATE entries SET state = 'cancelled', updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
    await E.touch(env, ev.id);
    if (r.state !== "cancelled") await E.tellRunners(env, ev, form, "cancelled", [r], user.id);
    return json({ ok: true });
  }
  const b = (await readBody(request)) || {};
  const next = { ...r };
  for (const k of ROW_FIELDS) if (b[k] !== undefined) next[k] = E.clean(b[k], k === "note" ? 300 : 80);
  if (b.licence !== undefined) next.licence = /^\d{1,9}$/.test(String(b.licence).trim()) ? String(b.licence).trim().replace(/^0+(?=\d)/, "") : "";
  if (b.club_country !== undefined || b.club_code !== undefined || b.club_name !== undefined) Object.assign(next, E.clubOf(next));
  next.club_key = E.clubKey(next);
  if (!next.first_name || !next.last_name) return no("runner");
  next.person = E.personOf(next, next.club_key);
  if (b.birth_year !== undefined) next.birth_year = E.birthOk(b.birth_year);
  if (b.sex !== undefined) next.sex = E.sexOk(b.sex);
  if (b.class_id !== undefined) {
    const cls = E.classOf(form, String(b.class_id));
    if (!cls) return no("class");
    next.class_id = cls.id;
    const c = E.courseOf(form, cls.id);
    if (c !== r.course) { next.course = c; if (b.start === undefined) next.start_s = null; }
  }
  if (b.card !== undefined) next.card = /^\d{1,10}$/.test(String(b.card ?? "").trim()) ? String(b.card).trim() : "";
  if (b.rent !== undefined) next.rent = b.rent ? 1 : 0;
  if (b.price !== undefined && Number.isInteger(Number(b.price)) && Number(b.price) >= 0) { next.price = Number(b.price); next.price_rule = JSON.stringify([["@hand", next.price]]); }
  if (b.state !== undefined && ["entered", "cancelled", "dns", "pending"].includes(b.state)) next.state = b.state;
  if (b.pay_state !== undefined && E.PAY_STATES.includes(b.pay_state)) {
    next.pay_state = b.pay_state;
    next.paid_at = b.pay_state === "due" ? null : nowIso(); next.paid_by = b.pay_state === "due" ? null : user.id;
    next.paid_how = b.pay_state === "paid" && E.PAY_HOW.includes(b.how) ? b.how : b.pay_state === "due" ? "" : r.paid_how;
  }
  try {
    await env.DB.prepare(`UPDATE entries SET first_name = ?, last_name = ?, licence = ?, club_country = ?, club_code = ?, club_name = ?, club_key = ?, person = ?,
      birth_year = ?, sex = ?, category = ?, class_id = ?, course = ?, start_s = ?, card = ?, rent = ?, price = ?, price_rule = ?, state = ?, pay_state = ?,
      paid_at = ?, paid_by = ?, paid_how = ?, note = ?, updated_at = ? WHERE id = ?`)
      .bind(next.first_name, next.last_name, next.licence, next.club_country, next.club_code, next.club_name, next.club_key, next.person, next.birth_year,
        next.sex, next.category, next.class_id, next.course, next.start_s, next.card, next.rent, next.price, next.price_rule, next.state, next.pay_state,
        next.paid_at, next.paid_by, next.paid_how, next.note, nowIso(), id).run();
  } catch (e) {
    if (/person/.test(String(e?.message))) return no("twice", 409);
    if (/start_s/.test(String(e?.message))) return no("taken", 409);
    throw e;
  }
  let moved = false;
  if (b.start !== undefined) {
    const s = b.start === null || b.start === "" ? null : Number(b.start);
    if (s != null && (!Number.isInteger(s) || s < 0 || s >= 86400)) return no("slot");
    const course = b.course !== undefined ? E.clean(b.course, 60) || next.course : next.course;
    const m = await E.moveStart(env, form, next, course, s, { force: b.force === true, by: "hand" });
    if (m.error) return no(m.error, 409);
    moved = s !== r.start_s || course !== r.course;
    next.start_s = s; next.course = course;
  }
  await E.touch(env, ev.id);
  if (moved && r.state === "entered" && next.start_s != null) await E.tellRunners(env, ev, form, "moved", [{ ...r, ...next }], user.id);
  if (next.state === "cancelled" && r.state !== "cancelled") await E.tellRunners(env, ev, form, "cancelled", [r], user.id);
  return json({ ok: true });
}

async function pay(ctx, user, ev) {
  const { request, env } = ctx;
  const b = (await readBody(request)) || {};
  const state = E.PAY_STATES.includes(b.state) ? b.state : "paid";
  const how = state === "paid" ? (E.PAY_HOW.includes(b.how) ? b.how : "other") : "";
  const now = nowIso(), at = state === "due" ? null : now, by = state === "due" ? null : user.id;
  let r;
  if (Array.isArray(b.ids) && b.ids.length) {
    const ids = b.ids.map(Number).filter(Number.isInteger).slice(0, 2000);
    if (!ids.length) return no("bad request");
    const out = [];
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      r = await env.DB.prepare(`UPDATE entries SET pay_state = ?, paid_at = ?, paid_by = ?, paid_how = ?, updated_at = ? WHERE event_id = ?
        AND id IN (${part.map(() => "?").join(",")}) AND state != 'cancelled'`).bind(state, at, by, how, now, ev.id, ...part).run();
      out.push(r.meta?.changes || 0);
    }
    await E.touch(env, ev.id);
    return json({ ok: true, changed: out.reduce((s, x) => s + x, 0) });
  }
  const ref = String(b.ref || "").toUpperCase().replace(/\s+/g, "");
  if (!/^OZ-[A-Z0-9]{4}$/.test(ref)) return no("bad request");
  r = await env.DB.prepare(`UPDATE entries SET pay_state = ?, paid_at = ?, paid_by = ?, paid_how = ?, updated_at = ? WHERE event_id = ? AND order_ref = ?
    AND state != 'cancelled'`).bind(state, at, by, how, now, ev.id, ref).run();
  await E.touch(env, ev.id);
  return json({ ok: true, changed: r.meta?.changes || 0 });
}

async function starts(ctx, user, ev, form) {
  const { request, env } = ctx;
  const b = (await readBody(request)) || {};
  const by = ["drawn", "deposited", "hand"].includes(b.by) ? b.by : "drawn";
  const now = nowIso();
  if (b.clear === true) {
    await env.DB.prepare("UPDATE entries SET start_s = NULL, start_by = '', reminded = 0, updated_at = ? WHERE event_id = ?").bind(now, ev.id).run();
    await E.touch(env, ev.id);
    return json({ ok: true });
  }
  const draw = Array.isArray(b.draw) ? b.draw.slice(0, 5000) : null;
  if (!draw?.length) return no("bad request");
  const rowsIn = draw.map((x) => ({ id: Number(x?.[0]), s: x?.[1] == null ? null : Number(x[1]), course: x?.[2] != null ? E.clean(x[2], 60) : null }))
    .filter((x) => Number.isInteger(x.id) && (x.s == null || (Number.isInteger(x.s) && x.s >= 0 && x.s < 86400)));
  const ids = rowsIn.map((x) => x.id);
  // the starts drawn replace those of the same entries at once: cleared first, then set (the slots' unique key in between)
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    await env.DB.prepare(`UPDATE entries SET start_s = NULL WHERE event_id = ? AND id IN (${part.map(() => "?").join(",")})`).bind(ev.id, ...part).run();
  }
  const set = (x) => env.DB.prepare(`UPDATE entries SET start_s = ?, start_by = ?, reminded = 0, course = COALESCE(?, course), updated_at = ? WHERE id = ? AND event_id = ?`)
    .bind(x.s, x.s == null ? "" : by, x.course, now, x.id, ev.id);
  const errors = [];
  try {
    for (let i = 0; i < rowsIn.length; i += 80) await env.DB.batch(rowsIn.slice(i, i + 80).map(set));
  } catch (e) {
    // one by one, to say which could not take its start (another entry holds it)
    for (const x of rowsIn) {
      try { await set(x).run(); } catch (e2) { errors.push({ id: x.id, error: /start_s/.test(String(e2?.message)) ? "taken" : "error" }); }
    }
  }
  await E.touch(env, ev.id);
  return json({ ok: true, set: rowsIn.length - errors.length, errors });
}

async function publishNow(ctx, user, ev, form) {
  const { env } = ctx;
  if (ev.date < E.parisDay()) return no("past");
  if (!(await allow(env, `ent:pub:${ev.id}`, 6, 600))) return no("too many", 429);
  const r = await E.publish(env, ev, form, user.id);
  return r.ok ? json(r) : no(r.error);
}

async function exportNow(ctx, ev, form) {
  const { request, env } = ctx;
  const u = new URL(request.url), f = u.searchParams.get("f") || "csv";
  if (!["iofxml", "oecsv", "csv"].includes(f)) return no("bad request");
  const { results } = await env.DB.prepare("SELECT * FROM entries WHERE event_id = ? ORDER BY class_id, last_name, first_name").bind(ev.id).all();
  const x = E.exportFile(ev, form, results, f, { starts: u.searchParams.get("starts") === "1" });
  return new Response(x.body, { headers: { "Content-Type": x.type, "Content-Disposition": `attachment; filename="${x.name}"`, "Cache-Control": "no-store" } });
}
