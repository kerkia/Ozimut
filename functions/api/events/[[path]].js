// /api/events — « Orga › Gérer » (owner, 2026-11-11; migration 0026, functions/_lib/events.js): the events organisers run on
// Ozimut. One event is one race or one training, held by a team whose members all have the same rights; people join only by
// asking (a request any member accepts: nobody is looked up or added by name, licence or e-mail). In France an event may be
// linked to a competition of the agenda (« a<id> »): at once when the account is a member of its organising club, else once an
// administrator approves; a competition is held by one event at most. Every organiser action on a competition asks the team
// (_lib/club.js organises → _lib/events.js canManage).
//   GET    /api/events                     the account's events, its requests waiting, and (to its teams) the requests to answer
//   GET    /api/events?all=1               every active event (administrators)
//   GET    /api/events?org=<id>            a club's events (its members; docs/clubs/design.md §1)
//   GET    /api/events/find                the events of others one may ask to join (60 days back to 400 ahead)
//   GET    /api/events/holders?keys=a1,a2  which events hold these competitions { key: { id, name, by, mine } }
//   GET    /api/events/pending             the links waiting for an administrator (administrators)
//   GET    /api/events/pending?org=<id>    the links waiting for that club's managers (its managers; docs/clubs/design.md §1)
//   POST   /api/events                     { kind, form (or type), country, name, date, place, club, terrain, epreuve, site, link? } a new event
//   POST   /api/events/migrate             administrators: events made from what organisers did before (idempotent)
//   GET    /api/events/<id>                members: the event, its team and requests; others: what the join screen needs
//   PUT    /api/events/<id>                members: the description, { analysis } its map analysis
//   DELETE /api/events/<id>                members: removed, with the map analysis it holds (2026-11-22); its start list and
//                                          results in Arena stay for a linked competition, an unlinked one's go
//   POST   /api/events/<id>/link           members: { key } linked (or a request to the administrators), { key: null } detached
//   POST   /api/events/<id>/approve        administrators: { ok } a waiting link approved or refused; a link waiting for the
//                                          club's managers (link_state « club »): those managers too
//   POST   /api/events/<id>/join           anyone but members: { message? } a request to join the team
//   POST   /api/events/<id>/requests/<rid> members: { accept } — the request's author: { withdraw: true }
//   DELETE /api/events/<id>/members/<uid>  members: a member removed, or oneself (never the last one: delete the event instead)

import { allow, isAdmin, json, nowIso, parisToday, readBody, withUser } from "../../_lib/api.js";
import { DECLARED, agendaRace, clubLabel, clubOf, findRace, orgCode, raceOf } from "../../_lib/club.js";
import { acceptedCountries, memberships, validCountry } from "../../_lib/countries.js";
import { TYPES, dropAnalyses, eventOf, formOf, kindOf, linked, mirror, newId, racing, ready, shortName, typeOf } from "../../_lib/events.js";
import { flushPush, queuePush } from "../../_lib/push.js";
import { eventPush } from "../../_lib/templates.js";
import { broadcasts } from "../../_lib/live.js";
import { startRun } from "../upload.js";
import { showModule } from "../../_lib/modules.js";
import { can, clubTeam, creatorOrg, orgByCode, ready as orgsReady, rightsIndex, rightsOf, rolesOf, settingsOf } from "../../_lib/orgs.js";

const TERRAINS = ["Forêt", "Sprint", "VTT", "Ski"];
const FORMATS = ["Sprint", "MD", "LD", "Nuit", "Autre"];
const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[a-z0-9]{6,20}$/, KEY = /^[a-z][a-z0-9-]{1,40}$/;
const PAST_DAYS = 60, AHEAD_DAYS = 400;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

/** The fields of an event, checked; { error } when one is wrong. `before`: the event being changed. */
function fields(b, countries, admin, before = null) {
  const country = String(b.country ?? before?.country ?? "").toUpperCase();
  if (!validCountry(country) || (!admin && country !== before?.country && !countries.includes(country))) return { error: "country" };
  // the kind and form (competition | public | training; individual | score | relay), else a stored type, else as it was
  const type = b.kind ? typeOf(b.kind, b.form) : TYPES.includes(b.type) ? b.type : before?.type || "individual";
  const name = clean(b.name ?? before?.name, 120), date = String(b.date ?? before?.date ?? "");
  if (name.length < 3) return { error: "name" };
  const today = parisToday();
  if (!DAY.test(date) || ((date < addDays(today, -PAST_DAYS) || date > addDays(today, AHEAD_DAYS)) && date !== before?.date)) return { error: "date" };
  const site = clean(b.site ?? before?.site, 300);
  if (site && !/^https?:\/\/[^\s]+$/i.test(site)) return { error: "site" };
  const terrain = b.terrain ?? before?.terrain ?? "", epreuve = b.epreuve ?? before?.epreuve ?? "";
  return { type, country, name, date, site, place: clean(b.place ?? before?.place, 80), club: clean(b.club ?? before?.club, 80),
    terrain: TERRAINS.includes(terrain) ? terrain : "", epreuve: FORMATS.includes(epreuve) ? epreuve : "" };
}

const one = (env, id) => env.DB.prepare("SELECT * FROM events WHERE id = ? AND status = 'active'").bind(id).first();
const members = async (env, id) => (await env.DB.prepare(`SELECT m.user_id, m.joined_at, u.first_name, u.last_name, u.display_name, u.licence
  FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = ? ORDER BY m.joined_at`).bind(id).all()).results;
const isMember = async (env, id, uid) => !!(await env.DB.prepare("SELECT 1 FROM event_members WHERE event_id = ? AND user_id = ?").bind(id, uid).first());
const view = (e) => ({ id: e.id, type: e.type, kind: kindOf(e.type), form: formOf(e.type), country: e.country, name: e.name, date: e.date, place: e.place, club: e.club, terrain: e.terrain,
  epreuve: e.epreuve, site: e.site, race: e.race_key || null, link: e.link_key || null,
  // a link waiting for the club's managers (« club ») reads as one waiting, `linkWait` saying who decides
  linkState: e.link_state === "club" ? "pending" : e.link_state, linkWait: e.link_state === "club" ? "club" : e.link_state === "pending" ? "admin" : null,
  org: e.org_id || null, analysis: e.analysis || null, created: e.created_at, updated: e.updated_at });

// a competition of the federation's calendar: the agenda's « a<id> » (coming, and kept by « Résultats » after the race), or a
// race FFCO published that the agenda never had (« f<id> », « x<…> ») — never a declared « d » nor an uploaded « u » one
const CAL = /^[afx][a-z0-9]{1,30}$/;
/** The calendar competition a key names (the agenda's, else « Résultats »'s), and the event already holding it (or null). */
async function calendarOf(env, request, key) {
  const race = CAL.test(String(key || "")) ? await findRace(env, request, key) : null;
  const held = race ? await eventOf(env, request, race.key) : null;
  return { race, held };
}
/** Who holds it, as people outside its team see it. */
async function holderOf(env, ev, uid) {
  const team = await members(env, ev.id);
  return { id: ev.id, name: ev.name, by: team.slice(0, 2).map(shortName).join(", "), n: team.length, mine: team.some((m) => m.user_id === uid) };
}
/** Does the account belong to the competition's organising club (the club of its latest race)? */
async function inClub(env, request, user, race) {
  const code = orgCode(race?.org);
  return !!code && (await clubOf(env, request, user.licence)) === code;
}
/**
 * How a link to a calendar competition starts (docs/clubs/design.md §1): « verified » for an administrator and an organiser of
 * the competition's organising club; a member of that club too, unless the club, claimed, keeps its events to its organisers
 * (settings.events_by) — then « club », waiting for its managers; anyone else « pending », waiting for an administrator.
 * Without a claimed club the rule of before: a member of the organising club (the club of its latest race).
 */
async function linkStateFor(env, request, user, race, admin) {
  if (admin) return { state: "verified", org: null };
  const code = orgCode(race?.org);
  const org = code && (await orgsReady(env)) ? await orgByCode(env, request, "FR", "club", code, { create: true }).catch(() => null) : null;
  if (org && org.state === "claimed") {
    const R = rightsOf(await rolesOf(env, user.id, org.id));
    if (R.organise) return { state: "verified", org };
    if (R.member || (await inClub(env, request, user, race))) {
      return { state: (await settingsOf(env, org.id)).events_by === "members" ? "verified" : "club", org };
    }
    return { state: "pending", org };
  }
  return { state: (await inClub(env, request, user, race)) ? "verified" : "pending", org };
}
/** The events made before migration 0030 take their French club by its number, once a club's events are asked for. */
async function backfillOrg(env, orgId) {
  try {
    const o = await env.DB.prepare("SELECT cc, kind, code FROM orgs WHERE id = ?").bind(orgId).first();
    if (o?.cc !== "FR" || o.kind !== "club" || !/^\d{4}$/.test(o.code)) return;
    await env.DB.prepare("UPDATE events SET org_id = ? WHERE org_id IS NULL AND country = 'FR' AND (club = ? OR club GLOB ?)")
      .bind(orgId, o.code, `${o.code}[^0-9]*`).run();
  } catch (e) { /* before migration 0030 */ }
}
/** Stores an event's club (migration 0030; nothing before it). */
async function setOrg(env, id, orgId) {
  if (!orgId) return;
  try { await env.DB.prepare("UPDATE events SET org_id = ? WHERE id = ?").bind(orgId, id).run(); } catch (e) { /* before migration 0030 */ }
}
/** Has anything been published under an unlinked event's own key (it could not follow the event to another key)? */
async function published(env, key) {
  const up = await env.DB.prepare("SELECT 1 FROM uploads WHERE race_key = ? AND status = 'active' LIMIT 1").bind(key).first();
  // its entries (migration 0031; the booking of 0023 before them)
  const bk = await env.DB.prepare(`SELECT 1 FROM entries x JOIN events e ON e.id = x.event_id WHERE e.race_key = ? AND x.state != 'cancelled' LIMIT 1`)
    .bind(key).first().catch(() => null);
  return !!(up || bk);
}

/** Tells accounts by push (each in its language), now for a few, queued for the rest. */
async function tell(env, waitUntil, uids, msgOf) {
  if (!uids.length) return;
  const { results } = await env.DB.prepare(`SELECT id, lang FROM users WHERE id IN (${uids.map(() => "?").join(",")})`).bind(...uids).all();
  if (!results.length) return;
  await env.DB.batch(results.map((u) => queuePush(env, u.id, "event", msgOf(u.lang))));
  waitUntil(flushPush(env, 8).catch(() => {}));
}

export const onRequest = withUser(async ({ request, env, params, waitUntil }, user) => {
  if (!(await ready(env))) return json({ error: "not ready" }, 503);
  const admin = isAdmin(env, user);
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method, url = new URL(request.url), now = nowIso();

  // ---- lists ----------------------------------------------------------------------------------------------------
  // a club's events (« Mon club › Événements »: its members; docs/clubs/design.md §1)
  if (!parts.length && method === "GET" && url.searchParams.get("org")) {
    const orgId = Number(url.searchParams.get("org")) || 0;
    if (!(await orgsReady(env)) || !(await can(env, user, orgId, "member"))) return json({ error: "forbidden" }, 403);
    await backfillOrg(env, orgId);
    const team = await clubTeam(env, request, user, { org_id: orgId });
    const { results } = await env.DB.prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_members x WHERE x.event_id = e.id) AS n,
        EXISTS (SELECT 1 FROM event_members x WHERE x.event_id = e.id AND x.user_id = ?) AS me
      FROM events e WHERE e.status = 'active' AND e.org_id = ? ORDER BY e.date DESC LIMIT 1000`).bind(user.id, orgId).all();
    return json({ events: results.map((e) => ({ ...view(e), members: e.n, me: !!e.me || team || admin })) });
  }
  if (!parts.length && method === "GET") {
    const all = admin && url.searchParams.get("all") === "1";
    const { results } = await env.DB.prepare(`SELECT e.*,
        (SELECT COUNT(*) FROM event_members x WHERE x.event_id = e.id) AS n,
        (SELECT COUNT(*) FROM event_requests r WHERE r.event_id = e.id AND r.status = 'pending') AS asks,
        EXISTS (SELECT 1 FROM event_members x WHERE x.event_id = e.id AND x.user_id = ?) AS me
      FROM events e WHERE e.status = 'active' ${all ? "" : "AND EXISTS (SELECT 1 FROM event_members x WHERE x.event_id = e.id AND x.user_id = ?)"}
      ORDER BY e.date DESC LIMIT 1000`).bind(...(all ? [user.id] : [user.id, user.id])).all();
    const mine = (await env.DB.prepare(`SELECT r.id, r.event_id, r.created_at, e.name, e.date FROM event_requests r JOIN events e ON e.id = r.event_id
      WHERE r.user_id = ? AND r.status = 'pending' AND e.status = 'active'`).bind(user.id).all()).results;
    // the events of the clubs whose organisers are on their teams by default (docs/clubs/design.md §1), as the account's own
    const viaClub = new Set();
    if (!all && (await orgsReady(env))) {
      const orgIds = [];
      for (const [oid, R] of await rightsIndex(env, user)) if (R.organise && (await settingsOf(env, oid)).default_team) orgIds.push(oid);
      if (orgIds.length) {
        for (const oid of orgIds) await backfillOrg(env, oid);
        const have = new Set(results.map((e) => e.id));
        const { results: more } = await env.DB.prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_members x WHERE x.event_id = e.id) AS n,
            (SELECT COUNT(*) FROM event_requests r WHERE r.event_id = e.id AND r.status = 'pending') AS asks
          FROM events e JOIN orgs o ON o.id = e.org_id WHERE e.status = 'active' AND o.state = 'claimed'
            AND e.org_id IN (${orgIds.map(() => "?").join(",")}) ORDER BY e.date DESC LIMIT 500`).bind(...orgIds).all();
        for (const e of more) if (!have.has(e.id)) { viaClub.add(e.id); results.push({ ...e, me: 1 }); }
        results.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      }
    }
    return json({ events: results.map((e) => ({ ...view(e), members: e.n, asks: e.me ? e.asks : 0, me: !!e.me, ...(viaClub.has(e.id) ? { club: true } : {}) })),
      requests: mine.map((r) => ({ id: r.id, event: r.event_id, name: r.name, date: r.date, at: r.created_at })), admin });
  }
  if (parts[0] === "find" && method === "GET") {
    const today = parisToday();
    const { results } = await env.DB.prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_members x WHERE x.event_id = e.id) AS n,
        EXISTS (SELECT 1 FROM event_requests r WHERE r.event_id = e.id AND r.user_id = ? AND r.status = 'pending') AS asked
      FROM events e WHERE e.status = 'active' AND e.date BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM event_members x WHERE x.event_id = e.id AND x.user_id = ?)
      ORDER BY e.date LIMIT 500`).bind(user.id, addDays(today, -PAST_DAYS), addDays(today, AHEAD_DAYS), user.id).all();
    return json({ events: results.map((e) => ({ id: e.id, type: e.type, kind: kindOf(e.type), form: formOf(e.type), country: e.country, name: e.name, date: e.date, place: e.place,
      club: e.club, linked: linked(e.race_key), members: e.n, asked: !!e.asked })) });
  }
  if (parts[0] === "holders" && method === "GET") {
    const keys = String(url.searchParams.get("keys") || "").split(",").filter((k) => KEY.test(k)).slice(0, 200);
    const out = {};
    if (keys.length) {
      const { results } = await env.DB.prepare(`SELECT * FROM events WHERE status = 'active' AND (race_key IN (${keys.map(() => "?").join(",")})
        OR (link_state IN ('pending', 'club') AND link_key IN (${keys.map(() => "?").join(",")})))`).bind(...keys, ...keys).all();
      for (const e of results) {
        const k = e.race_key && keys.includes(e.race_key) ? e.race_key : e.link_key;
        if (!out[k] || e.race_key === k) out[k] = { ...(await holderOf(env, e, user.id)), pending: e.race_key !== k };
      }
    }
    return json({ holders: out });
  }
  if (parts[0] === "pending" && method === "GET") {
    // ?org=<id>: the links waiting for that club's managers (« Mon club › Événements »)
    const orgId = Number(url.searchParams.get("org")) || 0;
    if (orgId ? !(await can(env, user, orgId, "manage")) : !admin) return json({ error: "forbidden" }, 403);
    const { results } = await (orgId
      ? env.DB.prepare(`SELECT e.*, u.display_name AS by_name, u.email AS by_email, u.licence AS by_licence FROM events e
        JOIN users u ON u.id = e.created_by WHERE e.status = 'active' AND e.link_state = 'club' AND e.org_id = ? ORDER BY e.date`).bind(orgId)
      : env.DB.prepare(`SELECT e.*, u.display_name AS by_name, u.email AS by_email, u.licence AS by_licence FROM events e
        JOIN users u ON u.id = e.created_by WHERE e.status = 'active' AND e.link_state = 'pending' ORDER BY e.date`)).all();
    const out = [];
    for (const e of results) {
      const { race, held } = await calendarOf(env, request, e.link_key);
      out.push({ ...view(e), byName: e.by_name, byEmail: orgId ? "" : e.by_email, byClub: await clubOf(env, request, e.by_licence),
        competition: race ? { name: race.name, date: race.date_iso, org: race.org, place: race.place } : null, held: held ? held.name : null });
    }
    return json({ pending: out });
  }
  if (parts[0] === "migrate" && method === "POST") {
    if (!admin) return json({ error: "forbidden" }, 403);
    return json(await migrate(env, request));
  }

  // ---- a new event --------------------------------------------------------------------------------------------------
  if (!parts.length && method === "POST") {
    const b = await readBody(request);
    if (!b) return json({ error: "bad request" }, 400);
    if (!(await allow(env, `event:${user.id}`, 20, 86400))) return json({ error: "too many" }, 429);
    // a calendar competition gives its name, day and place (France); only a competition is linked to one
    let cal = null;
    if (b.link && kindOf(b.kind ? typeOf(b.kind, b.form) : b.type) === "competition") {
      cal = await calendarOf(env, request, b.link);
      if (!cal.race) return json({ error: "unknown competition" }, 404);
      if (cal.held) return json({ error: "held", holder: await holderOf(env, cal.held, user.id) }, 409);
      Object.assign(b, { country: "FR", date: cal.race.date_iso, name: b.name || cal.race.name, place: b.place || cal.race.place || "",
        club: b.club || cal.race.org || "" });
    }
    const mships = cal ? null : await memberships(env, user.id);
    const f = fields(b, cal ? ["FR"] : acceptedCountries(mships), admin);
    if (f.error) return json(f, 400);
    // a training is its creator's club's (owner, 2026-11-16: the form no longer asks)
    if (kindOf(f.type) === "training" && !f.club) {
      f.club = (f.country === "FR" ? await clubLabel(env, request, user.licence) : null)
        || clean((mships || []).find((m) => m.country === f.country && m.status === "ok")?.club, 80) || "";
    }
    const id = newId();
    let race_key = racing(f.type) ? `d${id}` : null, link_key = null, link_state = "none", org = null;
    if (cal) {
      link_key = cal.race.key;
      const L = await linkStateFor(env, request, user, cal.race, admin);
      org = L.org;
      link_state = L.state;
      race_key = link_state === "verified" ? cal.race.key : null;
    }
    // the event's club (migration 0030): France's organising club by its number, else the creator's club membership
    if (!org && (await orgsReady(env))) {
      const code = f.country === "FR" ? orgCode(f.club) : null;
      org = (code ? await orgByCode(env, request, "FR", "club", code, { create: true }).catch(() => null) : null)
        || (await creatorOrg(env, user.id, f.country, f.club).catch(() => null));
    }
    const ev = { id, ...f, race_key, link_key, link_state, analysis: null, status: "active", created_by: user.id, created_at: now, updated_at: now };
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO events (id, type, country, name, date, place, club, terrain, epreuve, site, race_key, link_key, link_state,
        status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`)
        .bind(id, f.type, f.country, f.name, f.date, f.place, f.club, f.terrain, f.epreuve, f.site, race_key, link_key, link_state, user.id, now, now),
      env.DB.prepare("INSERT INTO event_members (event_id, user_id, joined_at) VALUES (?, ?, ?)").bind(id, user.id, now),
    ]);
    await setOrg(env, id, org?.id);
    ev.org_id = org?.id || null;
    await mirror(env, ev);
    await showModule(env, user.id, "orga");          // what the account starts here shows its module (_lib/modules.js, owner 2026-11-12)
    return json({ ok: true, event: view(ev), soon: race_key === `d${id}` ? await startRun(env) : false });
  }

  // ---- one event ----------------------------------------------------------------------------------------------------
  const id = parts[0];
  if (!ID.test(id)) return json({ error: "not found" }, 404);
  const ev = await one(env, id);
  if (!ev) return json({ error: "not found" }, 404);
  // the event's club's organisers are on its team when its settings say so (docs/clubs/design.md §1; resolved at read time)
  const own = await isMember(env, id, user.id), viaClub = !own && (await clubTeam(env, request, user, ev));
  const member = own || viaClub, may = member || admin;
  const sub = parts[1] || "";

  if (!sub && method === "GET") {
    if (!may) {
      const asked = await env.DB.prepare("SELECT id FROM event_requests WHERE event_id = ? AND user_id = ? AND status = 'pending'").bind(id, user.id).first();
      return json({ event: { id: ev.id, type: ev.type, kind: kindOf(ev.type), form: formOf(ev.type), name: ev.name, date: ev.date, place: ev.place, club: ev.club, country: ev.country },
        member: false, holder: await holderOf(env, ev, user.id), asked: asked?.id || null });
    }
    const team = await members(env, id);
    const { results: reqs } = await env.DB.prepare(`SELECT r.id, r.user_id, r.message, r.created_at, u.first_name, u.last_name, u.display_name, u.licence
      FROM event_requests r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.status = 'pending' ORDER BY r.created_at`).bind(id).all();
    const club = async (lic) => (lic ? await clubOf(env, request, lic) : null);
    const link = ev.link_key ? (await calendarOf(env, request, ev.link_key)).race : null;
    return json({ event: view(ev), member, admin, ...(viaClub ? { viaClub: true } : {}),
      competition: link ? { key: link.key, name: link.name, date: link.date_iso, org: link.org, place: link.place } : null,
      team: await Promise.all(team.map(async (m) => ({ uid: m.user_id, name: m.display_name || `${m.first_name} ${m.last_name}`,
        club: await club(m.licence), joined: m.joined_at, you: m.user_id === user.id, creator: m.user_id === ev.created_by }))),
      requests: await Promise.all(reqs.map(async (r) => ({ id: r.id, uid: r.user_id, name: r.display_name || `${r.first_name} ${r.last_name}`,
        club: await club(r.licence), message: r.message, at: r.created_at }))) });
  }

  if (sub === "join" && method === "POST") {
    if (member) return json({ ok: true, member: true });
    if (user.demo_until) return json({ error: "demo" }, 403);
    if (!(await allow(env, `eventjoin:${user.id}`, 20, 86400))) return json({ error: "too many" }, 429);
    const b = (await readBody(request)) || {};
    const had = await env.DB.prepare("SELECT id FROM event_requests WHERE event_id = ? AND user_id = ? AND status = 'pending'").bind(id, user.id).first();
    if (had) return json({ ok: true, request: had.id });
    const r = await env.DB.prepare(`INSERT INTO event_requests (event_id, user_id, message, created_at) VALUES (?, ?, ?, ?) RETURNING id`)
      .bind(id, user.id, clean(b.message, 300), now).first();
    const who = user.display_name || `${user.first_name} ${user.last_name}`;
    await tell(env, waitUntil, (await members(env, id)).map((m) => m.user_id), (lang) => eventPush(lang, "request", ev, who));
    return json({ ok: true, request: r.id });
  }

  if (sub === "requests" && parts[2] && method === "POST") {
    const rq = await env.DB.prepare("SELECT * FROM event_requests WHERE id = ? AND event_id = ? AND status = 'pending'").bind(Number(parts[2]), id).first();
    if (!rq) return json({ error: "not found" }, 404);
    const b = (await readBody(request)) || {};
    if (b.withdraw) {
      if (rq.user_id !== user.id) return json({ error: "forbidden" }, 403);
      await env.DB.prepare("UPDATE event_requests SET status = 'withdrawn', answered_at = ? WHERE id = ?").bind(now, rq.id).run();
      return json({ ok: true });
    }
    if (!may) return json({ error: "forbidden" }, 403);
    const accept = b.accept === true;
    const st = [env.DB.prepare("UPDATE event_requests SET status = ?, answered_at = ?, answered_by = ? WHERE id = ?")
      .bind(accept ? "accepted" : "declined", now, user.id, rq.id)];
    if (accept) st.push(env.DB.prepare("INSERT OR IGNORE INTO event_members (event_id, user_id, joined_at, added_by) VALUES (?, ?, ?, ?)").bind(id, rq.user_id, now, user.id));
    await env.DB.batch(st);
    if (accept) await showModule(env, rq.user_id, "orga");     // a member of the team now: Orga shows (_lib/modules.js)
    await tell(env, waitUntil, [rq.user_id], (lang) => eventPush(lang, accept ? "accepted" : "declined", ev));
    return json({ ok: true });
  }

  if (sub === "members" && parts[2] && method === "DELETE") {
    if (!may) return json({ error: "forbidden" }, 403);
    const uid = Number(parts[2]);
    const team = await members(env, id);
    if (!team.some((m) => m.user_id === uid)) return json({ error: "not found" }, 404);
    if (team.length === 1) return json({ error: "last" }, 409);
    await env.DB.prepare("DELETE FROM event_members WHERE event_id = ? AND user_id = ?").bind(id, uid).run();
    return json({ ok: true });
  }

  if (sub === "approve" && method === "POST") {
    // an administrator; for a link waiting for its club (« club »), that club's managers too
    if (!(admin || (ev.link_state === "club" && ev.org_id && (await can(env, user, ev.org_id, "manage"))))) return json({ error: "forbidden" }, 403);
    if (ev.link_state !== "pending" && ev.link_state !== "club") return json({ error: "not pending" }, 409);
    const b = (await readBody(request)) || {};
    let next;
    if (b.ok === true) {
      const { race, held } = await calendarOf(env, request, ev.link_key);
      if (!race) return json({ error: "unknown competition" }, 404);
      if (held) return json({ error: "held", holder: await holderOf(env, held, user.id) }, 409);
      next = { ...ev, race_key: race.key, link_state: "approved", updated_at: now };
    } else {
      next = { ...ev, race_key: racing(ev.type) ? `d${ev.id}` : null, link_key: null, link_state: "none", updated_at: now };
    }
    await env.DB.prepare("UPDATE events SET race_key = ?, link_key = ?, link_state = ?, updated_at = ? WHERE id = ?")
      .bind(next.race_key, next.link_key, next.link_state, now, id).run();
    await mirror(env, next);
    await tell(env, waitUntil, (await members(env, id)).map((m) => m.user_id), (lang) => eventPush(lang, b.ok === true ? "approved" : "refused", ev));
    return json({ ok: true, event: view(next) });
  }

  if (!may) return json({ error: "forbidden" }, 403);

  if (!sub && method === "PUT") {
    const b = await readBody(request);
    if (!b) return json({ error: "bad request" }, 400);
    if (!(await allow(env, `event-edit:${user.id}`, 200, 86400))) return json({ error: "too many" }, 429);
    const f = fields(b, acceptedCountries(await memberships(env, user.id)), admin, ev);
    if (f.error) return json(f, 400);
    // a change of kind (owner, 2026-11-18: the type may be changed once the event exists): a competition held from the calendar
    // (or waiting for it) is detached first; one that published under its own key cannot become a club training
    let keys = { race_key: ev.race_key, link_key: ev.link_key, link_state: ev.link_state };
    const was = kindOf(ev.type), will = kindOf(f.type);
    if (was !== will) {
      if (will !== "competition" && (linked(ev.race_key) || ev.link_state === "pending")) return json({ error: "linked" }, 409);
      if (will === "training") {
        if (ev.race_key && (await published(env, ev.race_key))) return json({ error: "type published" }, 409);
        keys = { race_key: null, link_key: null, link_state: "none" };
      } else if (was === "training") keys = { race_key: `d${ev.id}`, link_key: null, link_state: "none" };
    }
    let analysis = ev.analysis;
    if (b.analysis !== undefined) {
      // its map analysis: one the account may manage (its own, or the competition's), never another's
      analysis = b.analysis ? String(b.analysis) : null;
      if (analysis) {
        const o = /^[a-z0-9]{8,16}$/.test(analysis) && env.BUCKET ? await env.BUCKET.get(`analyses-meta/${analysis}.json`) : null;
        const m = o ? await o.json().catch(() => null) : null;
        if (!m || !(admin || m.owner === user.id || (m.kind === "race" && m.race && m.race === ev.race_key))) return json({ error: "analysis" }, 403);
      }
    }
    const next = { ...ev, ...f, ...keys, analysis, updated_at: now };
    await env.DB.prepare(`UPDATE events SET type = ?, country = ?, name = ?, date = ?, place = ?, club = ?, terrain = ?, epreuve = ?, site = ?,
      race_key = ?, link_key = ?, link_state = ?, analysis = ?, updated_at = ? WHERE id = ?`).bind(f.type, f.country, f.name, f.date, f.place, f.club,
      f.terrain, f.epreuve, f.site, keys.race_key, keys.link_key, keys.link_state, analysis, now, id).run();
    await mirror(env, next);
    return json({ ok: true, event: view(next), soon: next.race_key === `d${id}` || ev.race_key === `d${id}` ? await startRun(env) : false });
  }

  if (sub === "link" && method === "POST") {
    const b = (await readBody(request)) || {};
    if (kindOf(ev.type) !== "competition") return json({ error: "type" }, 400);
    let next;
    if (!b.key) {                                  // detached: the competition goes back to nobody, the event to its own key
      next = { ...ev, race_key: `d${ev.id}`, link_key: null, link_state: "none", updated_at: now };
    } else {
      if (ev.race_key === `d${ev.id}` && (await published(env, ev.race_key))) return json({ error: "published" }, 409);
      const { race, held } = await calendarOf(env, request, b.key);
      if (!race) return json({ error: "unknown competition" }, 404);
      if (held && held.id !== ev.id) return json({ error: "held", holder: await holderOf(env, held, user.id) }, 409);
      const L = await linkStateFor(env, request, user, race, admin);
      const ok = L.state === "verified";
      next = { ...ev, race_key: ok ? race.key : null, link_key: race.key, link_state: L.state, country: "FR", updated_at: now };
      if (L.org) await setOrg(env, id, L.org.id);
    }
    await env.DB.prepare("UPDATE events SET race_key = ?, link_key = ?, link_state = ?, country = ?, updated_at = ? WHERE id = ?")
      .bind(next.race_key, next.link_key, next.link_state, next.country, now, id).run();
    await mirror(env, next);
    return json({ ok: true, event: view(next), soon: await startRun(env) });
  }

  if (!sub && method === "DELETE") {
    await env.DB.batch([
      env.DB.prepare("UPDATE events SET status = 'removed', updated_at = ? WHERE id = ?").bind(now, id),
      env.DB.prepare("UPDATE event_requests SET status = 'withdrawn', answered_at = ? WHERE event_id = ? AND status = 'pending'").bind(now, id),
    ]);
    await mirror(env, { ...ev, status: "removed" });
    // its map analysis goes with it (owner, 2026-11-22: it stayed in Coach › Analyse, nowhere to manage it)
    const analyses = await dropAnalyses(env, ev);
    return json({ ok: true, analyses, soon: ev.race_key === `d${id}` ? await startRun(env) : false });
  }
  return json({ error: "method" }, 405);
});

// ---- events made from what organisers did before « Gérer » ------------------------------------------------------------
/**
 * One event per competition someone already acted on as its organiser, its team the accounts that did (the earliest its
 * creator): the declared competitions (their ids and « d<id> » keys kept), the organisers' deposits (results, start lists,
 * courses), the bookings, the live broadcasts tied to a race, the competitions' map analyses; the trainings' map analyses
 * become training events. A competition already held is left as it is; run it again safely.
 */
async function migrate(env, request) {
  const now = nowIso(), seen = await env.DB.prepare("SELECT race_key, analysis FROM events WHERE status = 'active'").all();
  const held = new Set(seen.results.flatMap((r) => [r.race_key, r.analysis]).filter(Boolean));
  const byKey = new Map();                       // key -> { users: Map(uid -> first time), info }
  const add = (key, uid, at, info = null) => {
    if (!key || !uid || held.has(key)) return;
    const x = byKey.get(key) || { users: new Map(), info: null };
    if (!x.users.has(uid) || at < x.users.get(uid)) x.users.set(uid, at || now);
    if (info && !x.info) x.info = info;
    byKey.set(key, x);
  };
  const out = { declared: 0, competitions: 0, trainings: 0, skipped: [] };
  const list = async (prefix) => {
    const objs = [];
    let cursor;
    do {
      const p = await env.BUCKET.list({ prefix, cursor, include: ["customMetadata"] });
      objs.push(...p.objects);
      cursor = p.truncated ? p.cursor : undefined;
    } while (cursor);
    return objs;
  };

  // the declared competitions: their own events, ids kept
  for (const o of await list(DECLARED)) {
    const d = await (await env.BUCKET.get(o.key))?.json().catch(() => null);
    if (!d || d.status !== "active" || d.event || held.has(`d${d.id}`)) continue;
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO events (id, type, country, name, date, place, club, terrain, epreuve, site, race_key, link_state,
        status, created_by, created_at, updated_at) VALUES (?, 'individual', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', 'active', ?, ?, ?)`)
        .bind(d.id, d.country, d.name, d.date, d.place || "", d.club || "", d.terrain || "", d.epreuve || "", d.site || "", `d${d.id}`, d.owner, d.created || now, now),
      env.DB.prepare("INSERT OR IGNORE INTO event_members (event_id, user_id, joined_at) VALUES (?, ?, ?)").bind(d.id, d.owner, d.created || now),
    ]);
    held.add(`d${d.id}`);
    await mirror(env, { id: d.id, type: "individual", country: d.country, name: d.name, date: d.date, place: d.place || "", club: d.club || "",
      terrain: d.terrain || "", epreuve: d.epreuve || "", site: d.site || "", race_key: `d${d.id}`, status: "active", created_by: d.owner,
      created_at: d.created || now, updated_at: now });
    out.declared++;
  }

  // the organisers' deposits (their label says so), the bookings
  const ups = (await env.DB.prepare(`SELECT user_id, race_key, created_at FROM uploads WHERE race_key IS NOT NULL AND user_id IS NOT NULL
    AND status = 'active' AND (race LIKE '% — par l''organisateur' OR race LIKE '% — horaires de départ' OR race LIKE '% — circuits du traceur')`).all()).results;
  for (const u of ups) add(u.race_key, u.user_id, u.created_at);
  try {
    for (const b of (await env.DB.prepare("SELECT race_key, created_by, created_at, name, race_date, org, place, country FROM booking_events").all()).results) {
      add(b.race_key, b.created_by, b.created_at, { name: b.name, date: b.race_date, club: b.org, place: b.place, country: b.country });
    }
  } catch (e) { /* bookings not migrated yet */ }
  try { for (const b of await broadcasts(env)) if (b.race && b.by) add(b.race, b.by, b.created || now); } catch (e) { /* no relay */ }

  // the map analyses: a competition's to its event, a training's an event of its own
  for (const o of await list("analyses-meta/")) {
    const m = o.customMetadata || {};
    if (!m.id || held.has(m.id)) continue;
    if (m.kind === "race" && m.race) { add(m.race, Number(m.owner), m.created || now); continue; }
    if (m.kind !== "club" || !Number(m.owner) || !DAY.test(m.date || "")) continue;
    const eid = newId();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO events (id, type, country, name, date, place, club, analysis, link_state, status, created_by, created_at, updated_at)
        VALUES (?, 'training', ?, ?, ?, '', ?, ?, 'none', 'active', ?, ?, ?)`)
        .bind(eid, m.cc || "FR", m.title || "Entraînement", m.date, m.orgName || "", m.id, Number(m.owner), m.created || now, now),
      env.DB.prepare("INSERT INTO event_members (event_id, user_id, joined_at) VALUES (?, ?, ?)").bind(eid, Number(m.owner), m.created || now),
    ]);
    held.add(m.id);
    out.trainings++;
  }

  // a competition's description: the agenda's, else « Résultats »'s, else what the booking said
  for (const [key, x] of byKey) {
    if (held.has(key) || /^d/.test(key)) { if (/^d/.test(key) && !held.has(key)) out.skipped.push(key); continue; }
    const a = /^a\d+$/.test(key) ? await agendaRace(env, request, key) : null;
    const r = a ? null : await raceOf(env, request, key);
    const info = a ? { name: a.name, date: a.date_iso, club: a.org || "", place: a.place || "", country: "FR" }
      : r ? { name: r.name, date: r.date_iso, club: r.org || "", place: r.place || "", country: r.country || "FR", terrain: r.terrain, epreuve: r.epreuve }
        : x.info;
    if (!info?.name || !DAY.test(info.date || "")) { out.skipped.push(key); continue; }
    const users = [...x.users].sort((p, q) => String(p[1]).localeCompare(String(q[1])));
    const eid = newId(), creator = users[0][0];
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO events (id, type, country, name, date, place, club, terrain, epreuve, race_key, link_key, link_state, status,
        created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'active', ?, ?, ?)`)
        .bind(eid, /score/i.test(`${info.epreuve || ""} ${info.name}`) ? "score" : "individual", info.country || "FR", info.name, info.date,
          info.place || "", info.club || "", TERRAINS.includes(info.terrain) ? info.terrain : "", FORMATS.includes(info.epreuve) ? info.epreuve : "",
          key, key, creator, users[0][1] || now, now),
      ...users.map(([uid, at]) => env.DB.prepare("INSERT OR IGNORE INTO event_members (event_id, user_id, joined_at) VALUES (?, ?, ?)").bind(eid, uid, at || now)),
    ]);
    held.add(key);
    out.competitions++;
  }
  // the competitions' analyses, now held by their events, are named on them
  for (const o of await list("analyses-meta/")) {
    const m = o.customMetadata || {};
    if (m.kind === "race" && m.race && m.id) {
      await env.DB.prepare("UPDATE events SET analysis = ? WHERE race_key = ? AND status = 'active' AND analysis IS NULL").bind(m.id, m.race).run();
    }
  }
  // every team member made here sees Orga (_lib/modules.js; before migration 0027 or 0016, nothing)
  try { await env.DB.prepare("UPDATE users SET orga = 1 WHERE orga = 0 AND id IN (SELECT user_id FROM event_members)").run(); } catch (e) { /* no column yet */ }
  return out;
}
