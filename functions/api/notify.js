// Called by update.py (Authorization: Bearer NOTIFY_SECRET), never by the browser.
//
// Every alert goes by e-mail, by push notification (functions/_lib/push.js; 2026-10-18), or both, as each account chose
// (users.notify / push_results, agenda_alert / push_agenda, deadline_alert / push_deadline; the start times by push only,
// push_starts). Push needs a device (push_subs); every alert e-mail needs the administrator's right (users.alerts_allowed;
// the results' too since 2026-10-21, owner: the right allows or refuses all of them).
//
//   GET  /api/notify            -> { licences: [...] } licences with at least one account told of its results (e-mail
//        or push), `push`: those with the start times by push
//   POST /api/notify { items: [{ lic, races: [{ id, alias?, prov?, title, date, location }] }] }
//        queues one digest per subscribed account (races it was not told about yet), by e-mail and/or push,
//        then sends what fits in today's quota. { items: [] } just drains the backlog (e-mails and pushes).
//        A race comes with every id it is known by (FFCO's competition id, its key on « Résultats »: `alias`):
//        it is announced once, by whichever source published first (owner, 2026-10-17); `prov` = the race's key
//        on « Résultats » when the results are an organiser's (the e-mail links there).
//   -> { queued, sent, remaining, budget, pushSent, pushLeft }: pushes go out a few a call (push_queue, flushPush);
//        update.py calls again while some are left
//   POST /api/notify { starts: [{ lic, key, name, date, place, start_s, cls }] } (2026-10-18): the start times of the
//        coming races' published start lists; each account with push_starts and a device gets its own, once, and
//        again when it changes (push_sent); by e-mail too for the accounts that chose it (users.starts_alert, a right the
//        administrator grants). -> { startsQueued, pushSent, pushLeft, … }
//
// update.py computes who ran which new competition (it has the database); this side only
// knows who subscribed, so the server stays small.

import { alertsAllowed, json, jsonList, readBody } from "../_lib/api.js";
import { sha256hex } from "../_lib/crypto.js";
import { flushQueue, queueStatement } from "../_lib/mail.js";
import { flushPush, pushReady, queuePush } from "../_lib/push.js";
import { agendaMail, agendaPush, digestMail, resultsPush, startMail, startPush } from "../_lib/templates.js";

async function authorised(request, env) {
  const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const ok = !!env.NOTIFY_SECRET && !!given && (await sha256hex(given)) === (await sha256hex(env.NOTIFY_SECRET));
  // each call's outcome, counted by the hour in the rate table (k « notify:ok », « notify:no-secret » — the caller sent
  // none —, « notify:wrong-secret »): whether the update runs reach the site at all is visible in D1 (their logs need a login)
  const outcome = ok ? "ok" : !given ? "no-secret" : !env.NOTIFY_SECRET ? "site-has-no-secret" : "wrong-secret";
  try {
    await env.DB.prepare("INSERT INTO rate (k, window, n) VALUES (?, ?, 1) ON CONFLICT (k, window) DO UPDATE SET n = n + 1")
      .bind(`notify:${outcome}`, Math.floor(Date.now() / 3600e3) * 3600).run();      // (seconds, like allow(): kept a day)
  } catch (e) { /* counting must not stop the call */ }
  return ok;
}

const ACTIVE = "u.email_verified = 1 AND u.status = 'active'";
// a device that takes notifications: a browser's Web Push subscription, or the Ozimut app on a phone (app_push, migration
// 0032, docs/app/design.md — counted once the table exists: `devices`, at the start of each request)
const WEB_PUSH = "EXISTS (SELECT 1 FROM push_subs s WHERE s.user_id = u.id)";
let HAS_PUSH = WEB_PUSH, devicesKnown = false;
async function devices(env) {
  if (devicesKnown) return;
  try {
    await env.DB.prepare("SELECT 1 FROM app_push LIMIT 1").first();
    HAS_PUSH = `(${WEB_PUSH} OR EXISTS (SELECT 1 FROM app_push a WHERE a.user_id = u.id))`;
    devicesKnown = true;
  } catch (e) { /* before migration 0032: the browsers' subscriptions alone */ }
}
// told of their results: by e-mail (a right the administrator grants), or by push on a device
const MAIL_RESULTS = "(u.notify = 1 AND u.alerts_allowed = 1)";
const subscribed = (env) => (pushReady(env) ? `${ACTIVE} AND (${MAIL_RESULTS} OR (u.push_results = 1 AND ${HAS_PUSH}))` : `${ACTIVE} AND ${MAIL_RESULTS}`);
// told of their start times: by push on a device, or by e-mail (a right the administrator grants, users.starts_alert)
const startsWho = (env) => `${ACTIVE} AND ((u.starts_alert = 1 AND u.alerts_allowed = 1)${pushReady(env) ? ` OR (u.push_starts = 1 AND ${HAS_PUSH})` : ""})`;

export async function onRequestGet({ request, env }) {
  await devices(env);
  if (!(await authorised(request, env))) return json({ error: "forbidden" }, 403);
  const { results } = await env.DB.prepare(`SELECT DISTINCT licence FROM users u WHERE ${subscribed(env)}`).all();
  const starts = (await env.DB.prepare(`SELECT DISTINCT licence FROM users u WHERE ${startsWho(env)}`).all()).results.map((r) => r.licence);
  // v 2 (2026-10-17): races with `alias` and `prov` understood — update.py sends the organisers' results only then;
  // v 3 (2026-10-18): `starts` understood (push notifications; `push`, the licences told of their start times, by push or
  // e-mail since the same evening)
  return json({ licences: results.map((r) => r.licence), push: starts, v: 3 });
}

/**
 * The courses of the agenda (all the upcoming ones, sent each morning) -> one digest for each account that
 * asked to be alerted about new courses in its regions. A course is announced once (agenda_announced).
 * The very first call only records what is already there, so nobody receives the whole agenda.
 */
async function announceAgenda(env, list) {
  const str = (v, n) => String(v ?? "").trim().slice(0, n);
  const url = (v) => (/^https?:\/\//i.test(String(v || "")) ? str(v, 400) : "");
  const events = list.slice(0, 1000).filter((e) => e && e.id != null).map((e) => ({
    id: str(e.id, 20), name: str(e.name, 200), date: str(e.date, 10), place: str(e.place, 100), dep: str(e.dep, 4),
    depName: str(e.depName, 60), region: str(e.region, 60), type: str(e.type, 60), cn: !!e.cn, groupe: str(e.groupe, 30),
    manif: str(e.manif, 100), org: str(e.org, 150), referee: str(e.referee, 80), referee2: str(e.referee2, 80),
    controller: str(e.controller, 80), delegate: str(e.delegate, 80), contact: str(e.contact, 150), phone: str(e.phone, 40),
    email: /^[^\s@<>]+@[^\s@<>]+$/.test(String(e.email || "")) ? str(e.email, 120) : "",
    monitor: str(e.monitor, 80), access: str(e.access, 1600), mapUrl: url(e.mapUrl),
    gps: Array.isArray(e.gps) && e.gps.length === 2 && e.gps.every((n) => Number.isFinite(Number(n))) ? e.gps.map(Number) : null,
    site: url(e.site), flechage: str(e.flechage, 400), invitation: url(e.invitation), obs: str(e.obs, 800),
    reg: e.reg && url(e.reg.url) ? {
      url: url(e.reg.url), close: str(e.reg.close, 10), mods: str(e.reg.mods, 10),
      count: Number.isInteger(e.reg.count) ? e.reg.count : null, teams: Number.isInteger(e.reg.teams) ? e.reg.teams : null,
    } : null,
  }));
  if (!events.length) return { queued: 0, events };
  const first = (await env.DB.prepare("SELECT COUNT(*) AS n FROM agenda_announced").first()).n === 0;
  const fresh = [];
  for (let i = 0; i < events.length; i += 45) {                     // 2 bound values per row, at most 100 per statement
    const part = events.slice(i, i + 45);
    const { results } = await env.DB.prepare(
      `INSERT OR IGNORE INTO agenda_announced (event_id, seen_at) VALUES ${part.map(() => "(?, ?)").join(",")} RETURNING event_id`,
    ).bind(...part.flatMap((e) => [e.id, Date.now()])).all();
    const added = new Set(results.map((r) => r.event_id));
    fresh.push(...part.filter((e) => added.has(e.id)));
  }
  if (first || !fresh.length) return { queued: 0, events };
  const { results: users } = await env.DB.prepare(
    `SELECT u.*, ${HAS_PUSH} AS has_push FROM users u WHERE ${ACTIVE} AND (u.agenda_alert = 1 OR u.push_agenda = 1)`).all();
  const stmts = [];
  for (const u of users) {
    const mail = !!u.agenda_alert && alertsAllowed(env, u);           // e-mail: a right the administrator grants
    const push = !!u.push_agenda && !!u.has_push && pushReady(env);  // push: everyone
    const regions = new Set(jsonList(u.agenda_regions));
    const mine = fresh.filter((e) => regions.has(e.region));
    if (!mine.length) continue;
    if (mail) stmts.push(queueStatement(env, { to: u.email, ...agendaMail(env, u, mine), kind: "agenda", priority: 0 }));
    if (push) stmts.push(queuePush(env, u.id, "agenda", agendaPush(u.lang, mine, "new"), { hours: 48 }));
  }
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  return { queued: stmts.length, events };
}

const DEADLINE_DAYS = 8;
/** Today in Paris, and a number of days later, as YYYY-MM-DD. */
const parisDay = (plus = 0) => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};

/**
 * The courses whose registrations close within DEADLINE_DAYS -> one digest for each account that asked for this
 * alert, about the ones in its regions it has not been told about yet (deadline_announced), soonest first.
 */
async function announceDeadlines(env, events) {
  const today = parisDay(), until = parisDay(DEADLINE_DAYS);
  const soon = events.filter((e) => e.reg?.close && e.reg.close >= today && e.reg.close <= until);
  if (!soon.length) return 0;
  const { results: users } = await env.DB.prepare(
    `SELECT u.*, ${HAS_PUSH} AS has_push FROM users u WHERE ${ACTIVE} AND (u.deadline_alert = 1 OR u.push_deadline = 1)`).all();
  const stmts = [];
  for (const u of users) {
    const mail = !!u.deadline_alert && alertsAllowed(env, u), push = !!u.push_deadline && !!u.has_push && pushReady(env);
    if (!mail && !push) continue;                     // not marked told: an alert turned on later still gets them
    const regions = new Set(jsonList(u.agenda_regions));
    const mine = soon.filter((e) => regions.has(e.region)).slice(0, 90);
    if (!mine.length) continue;
    const res = await env.DB.batch(mine.map((e) => env.DB.prepare(
      "INSERT OR IGNORE INTO deadline_announced (user_id, event_id, seen_at) VALUES (?, ?, ?)").bind(u.id, e.id, Date.now())));
    const fresh = mine.filter((_, i) => res[i].meta.changes).sort((a, b) => a.reg.close.localeCompare(b.reg.close));
    if (!fresh.length) continue;
    if (mail) stmts.push(queueStatement(env, { to: u.email, ...agendaMail(env, u, fresh, "deadline"), kind: "deadline", priority: 0 }));
    if (push) stmts.push(queuePush(env, u.id, "deadline", agendaPush(u.lang, fresh, "deadline"), { hours: 48 }));
  }
  for (let i = 0; i < stmts.length; i += 40) await env.DB.batch(stmts.slice(i, i + 40));
  return stmts.length;
}

/** A time of day in Paris, in seconds. */
const parisClock = () => {
  const [h, m, s] = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Paris", hour12: false }).split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

/** The start times of the coming races -> for each account told of them whose time is new or changed (push_sent), a
 *  notification queued (kept until the race's day is over) and/or an e-mail. -> the number of start times told */
async function queueStarts(env, list) {
  const today = parisDay(), now = parisClock();
  const str = (v, n) => String(v ?? "").trim().slice(0, n);
  const items = list.slice(0, 2000).map((s) => ({
    lic: str(s?.lic, 12), key: str(s?.key, 40), name: str(s?.name, 120), date: str(s?.date, 10), place: str(s?.place, 80),
    cls: str(s?.cls, 40), start_s: Number(s?.start_s),
  })).filter((s) => s.lic && /^[A-Za-z0-9_-]+$/.test(s.key) && /^\d{4}-\d\d-\d\d$/.test(s.date) && Number.isInteger(s.start_s)
    && s.start_s >= 0 && s.start_s < 86400 * 2 && (s.date > today || (s.date === today && s.start_s > now)));
  if (!items.length) return 0;
  const byLic = new Map();
  for (const s of items) { if (!byLic.has(s.lic)) byLic.set(s.lic, []); byLic.get(s.lic).push(s); }
  const lics = [...byLic.keys()], users = [];
  for (let i = 0; i < lics.length; i += 90) {
    const part = lics.slice(i, i + 90);
    users.push(...(await env.DB.prepare(`SELECT u.*, ${HAS_PUSH} AS has_push FROM users u WHERE ${startsWho(env)}
      AND u.licence IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results);
  }
  const stmts = [];
  let told_n = 0;
  for (const u of users) {
    const mail = !!u.starts_alert && alertsAllowed(env, u), push = !!u.push_starts && !!u.has_push && pushReady(env);
    if (!mail && !push) continue;
    const mine = byLic.get(u.licence) || [];
    const { results: sent } = await env.DB.prepare(`SELECT race_key, start_s FROM push_sent WHERE user_id = ? AND race_key IN
      (${mine.map(() => "?").join(",")})`).bind(u.id, ...mine.map((s) => s.key)).all();
    const told = new Map(sent.map((r) => [r.race_key, r.start_s]));
    for (const s of mine) {
      if (told.get(s.key) === s.start_s) continue;
      const hours = Math.max(1, (Date.parse(`${s.date}T23:59:59Z`) - Date.now()) / 3600e3);
      if (push) stmts.push(queuePush(env, u.id, "start", startPush(u.lang, s, told.has(s.key)), { topic: `start-${s.key}`, hours }));
      if (mail) stmts.push(queueStatement(env, { to: u.email, ...startMail(env, u, s, told.has(s.key)), kind: "start", priority: 0 }));
      told_n++;
      stmts.push(env.DB.prepare(`INSERT INTO push_sent (user_id, race_key, start_s, sent_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (user_id, race_key) DO UPDATE SET start_s = excluded.start_s, sent_at = excluded.sent_at`)
        .bind(u.id, s.key, s.start_s, Date.now()));
    }
  }
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
  return told_n;
}

export async function onRequestPost({ request, env }) {
  await devices(env);
  if (!(await authorised(request, env))) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const startsQueued = Array.isArray(b?.starts) ? await queueStarts(env, b.starts) : 0;
  let agendaQueued = 0, deadlineQueued = 0;
  if (Array.isArray(b?.agenda)) {
    const r = await announceAgenda(env, b.agenda);
    agendaQueued = r.queued;
    deadlineQueued = await announceDeadlines(env, r.events);
  }
  const items = Array.isArray(b?.items) ? b.items.slice(0, 100) : [];
  let queued = 0;
  if (items.length) {
    const ID = /^[A-Za-z0-9_-]{1,40}$/;
    const race = (r) => ({
      id: String(r?.id ?? ""), alias: (Array.isArray(r?.alias) ? r.alias : []).map(String).filter((x) => ID.test(x)).slice(0, 3),
      prov: ID.test(String(r?.prov || "")) ? String(r.prov) : "", title: String(r?.title || "").slice(0, 200),
      date: String(r?.date || "").slice(0, 10), location: String(r?.location || "").slice(0, 120),
    });
    const byLic = new Map(items.map((i) => [String(i.lic), (i.races || []).slice(0, 30).map(race).filter((r) => ID.test(r.id))]));
    const lics = [...byLic.keys()];
    const { results: users } = await env.DB.prepare(
      `SELECT u.*, ${HAS_PUSH} AS has_push FROM users u WHERE ${subscribed(env)} AND u.licence IN (${lics.map(() => "?").join(",")})`).bind(...lics).all();
    // announce each (account, race) once, whatever id it comes with: the ids already told, then those of the new races
    const todo = users.map((u) => [u, byLic.get(u.licence) || []]).filter(([, rs]) => rs.length);
    const pushes = [];
    if (todo.length) {
      const told = await env.DB.batch(todo.map(([u, rs]) => {
        const ids = [...new Set(rs.flatMap((r) => [r.id, ...r.alias]))];
        return env.DB.prepare(`SELECT course_id FROM notified WHERE user_id = ? AND course_id IN (${ids.map(() => "?").join(",")})`).bind(u.id, ...ids);
      }));
      const marks = [], stmts = [];
      todo.forEach(([u, rs], i) => {
        const seen = new Set((told[i].results || []).map((x) => String(x.course_id)));
        const fresh = rs.filter((r) => ![r.id, ...r.alias].some((x) => seen.has(x)));
        for (const r of fresh) for (const x of [r.id, ...r.alias]) {
          marks.push(env.DB.prepare("INSERT OR IGNORE INTO notified (user_id, course_id) VALUES (?, ?)").bind(u.id, x));
        }
        if (fresh.length && u.notify && alertsAllowed(env, u)) stmts.push(queueStatement(env, { to: u.email, ...digestMail(env, u, fresh), kind: "digest", priority: 0 }));
        if (fresh.length && u.push_results && u.has_push && pushReady(env)) pushes.push(queuePush(env, u.id, "results", resultsPush(u.lang, fresh), { hours: 72 }));
      });
      for (let i = 0; i < marks.length; i += 80) await env.DB.batch(marks.slice(i, i + 80));
      if (stmts.length) await env.DB.batch(stmts);
      for (let i = 0; i < pushes.length; i += 80) await env.DB.batch(pushes.slice(i, i + 80));
      queued = stmts.length + pushes.length;
    }
  }
  const mail = await flushQueue(env);
  return json({ queued, agendaQueued, deadlineQueued, startsQueued, ...mail, ...(await flushPush(env)) });
}
