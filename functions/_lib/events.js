// The events organisers run on Ozimut (« Orga › Gérer », owner 2026-11-11; migration 0026, functions/api/events/[[path]].js).
// One event is one race (or one training), held by a team whose members all have the same rights. Every organiser action
// on a competition — its start list, booking, live broadcast, GPS link, results, courses, map analysis — asks canManage():
// an administrator; else, when an event holds the competition, a member of its team; else (EVENTS_STRICT "1") nobody, or
// (the flag off, or before migration 0026 is applied) the rule of before: a member of the organising club.
// A competition of the calendar held by an event has been « claimed »: runners may no longer deposit its results (upload.js).
// An unlinked competition (race key « d<id> ») is mirrored to R2 declared/<id>.json, which the results run reads
// (ffco_scraper/prov/sources/declared.py), as the declared competitions of before were.

import { isAdmin } from "./api.js";
import { DECLARED, clubOf, orgCode, raceOf } from "./club.js";
import { randomBytes } from "./crypto.js";

// An event's kind and form (owner, 2026-11-18): a competition (individual, score / rogaine or relay), a public training (open
// to all, often paid and timed: individual or score) or a club training (individual or score); score differs from individual
// only in that the controls are taken in any order. Stored in the one column `type` of migration 0026, its values kept: a
// competition « individual » | « score » | « relay », a public training « public » | « public-score », a club training
// « training » | « training-score ». A club training holds no competition (no race key); a public training has its own
// « d<id> » as an unlinked competition (start list, live, results), never linked to the calendar.
export const KINDS = { competition: ["individual", "score", "relay"], public: ["individual", "score"], training: ["individual", "score"] };
export const kindOf = (type) => (/^training/.test(type || "") ? "training" : /^public/.test(type || "") ? "public" : "competition");
export const formOf = (type) => (/score$/.test(type || "") ? "score" : type === "relay" ? "relay" : "individual");
/** The stored type of a kind and form (a form the kind has not: individual). */
export const typeOf = (kind, form) => {
  const k = KINDS[kind] ? kind : "competition", f = KINDS[k].includes(form) ? form : "individual";
  return k === "competition" ? f : f === "score" ? `${k}-score` : k;
};
export const TYPES = Object.entries(KINDS).flatMap(([k, fs]) => fs.map((f) => typeOf(k, f)));
/** Does an event of this type hold a competition of its own (start list, live, results)? */
export const racing = (type) => kindOf(type) !== "training";
export const strict = (env) => String(env.EVENTS_STRICT || "") === "1";
export const newId = () => Array.from(randomBytes(10), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
/** « Camille M. »: how people outside a team see its members. */
export const shortName = (u) => {
  const f = String(u?.first_name || "").trim(), l = String(u?.last_name || "").trim();
  return f ? `${f}${l ? ` ${l[0].toUpperCase()}.` : ""}` : String(u?.display_name || "").split(/\s+/)[0] || "";
};

// is migration 0026 applied? (asked once per isolate; a database without the tables keeps the rule of before)
let READY = null;
export async function ready(env) {
  if (READY !== null) return READY;
  try { await env.DB.prepare("SELECT 1 FROM events LIMIT 1").first(); READY = true; } catch (e) { READY = false; }
  return READY;
}

/** The calendar competition a race key stands for: « a<id> » itself, or a race of « Résultats » tied to the agenda. */
async function agendaKeyOf(env, request, key) {
  if (/^[ad]/.test(key)) return key;
  const r = await raceOf(env, request, key);
  return r?.agenda_id ? `a${r.agenda_id}` : key;
}

/** The active event holding a competition (its key, or the agenda competition a race of « Résultats » is), or null. */
export async function eventOf(env, request, key) {
  if (!key || !(await ready(env))) return null;
  const q = (k) => env.DB.prepare("SELECT * FROM events WHERE race_key = ? AND status = 'active'").bind(k).first();
  let ev = await q(key);
  if (!ev) {
    const k2 = await agendaKeyOf(env, request, key);
    if (k2 !== key) ev = await q(k2);
  }
  return ev || null;
}

export const isMember = async (env, eventId, userId) =>
  !!(await env.DB.prepare("SELECT 1 FROM event_members WHERE event_id = ? AND user_id = ?").bind(eventId, userId).first());

/** The rule before the events: a member of the organising club; a declared competition's declarer. */
async function clubRule(env, request, user, race, club) {
  if (/^d/.test(race.key || "")) return Number(race.owner) === user.id;
  const code = orgCode(race.org);
  return !!code && (club !== undefined ? club : await clubOf(env, request, user.licence)) === code;
}

/** May the account act as the organiser of this competition (a race from _lib/club.js findRace)? */
export async function canManage(env, request, user, race, club) {
  if (!race || !user) return false;
  if (isAdmin(env, user)) return true;
  if (!(await ready(env))) return clubRule(env, request, user, race, club);
  const ev = await eventOf(env, request, race.key);
  if (ev) return isMember(env, ev.id, user.id);
  return strict(env) ? false : clubRule(env, request, user, race, club);
}

/**
 * What the account's teams hold, for checks over many items (the map analyses' list): `held` every active event's race key
 * and analysis id, `mine` those of the account's events; null before migration 0026.
 */
export async function teamIndex(env, user) {
  if (!(await ready(env))) return null;
  const { results } = await env.DB.prepare(`SELECT e.race_key, e.analysis, EXISTS (SELECT 1 FROM event_members m
    WHERE m.event_id = e.id AND m.user_id = ?) AS me FROM events e WHERE e.status = 'active'`).bind(user.id).all();
  const held = new Set(), mine = new Set();
  for (const r of results) for (const k of [r.race_key, r.analysis]) if (k) { held.add(k); if (r.me) mine.add(k); }
  return { held, mine };
}

/**
 * Is the map analysis held by a score / rogaine event (owner, 2026-11-20: the event's variant decides; a track run in another
 * order than the circuit's printed one lost its first controls in the analysis)? Its event: the one whose `analysis` it is,
 * else the one holding its competition. Read each time the analysis is read, so a change of the event's type follows.
 */
export async function scoreEvent(env, meta) {
  if (!meta?.id || !(await ready(env))) return false;
  try {
    let ev = await env.DB.prepare("SELECT type FROM events WHERE analysis = ? AND status = 'active'").bind(meta.id).first();
    if (!ev && meta.race) ev = await env.DB.prepare("SELECT type FROM events WHERE race_key = ? AND status = 'active'").bind(meta.race).first();
    return !!ev && formOf(ev.type) === "score";
  } catch (e) { return false; }
}
/** The analysis's circuits as read: every one a score course when its event is (scoreEvent). */
export const withScore = (meta, score) => (score ? { ...meta, courses: (meta.courses || []).map((c) => ({ ...c, score: true })), eventScore: true } : meta);

/** Is an event's race key a calendar competition (not its own « d<id> »)? */
export const linked = (key) => !!key && !/^d/.test(key);

/** Is the competition claimed by an event linked to the calendar (runners' results deposits are then refused)? */
export async function claimed(env, request, key) {
  const ev = await eventOf(env, request, key);
  return !!ev && linked(ev.race_key);
}

/** Writes (or retires) the R2 mirror of an unlinked competition, read by the results run as a declared competition. */
export async function mirror(env, ev) {
  if (!env.BUCKET) return;
  // a relay is not taken by the results run yet (ffco_scraper/prov/races.py drops relays): not mirrored; a club training holds
  // no competition (one that was a public training or a competition before has its mirror retired)
  const own = racing(ev.type) && ev.race_key === `d${ev.id}` && ev.status === "active" && formOf(ev.type) !== "relay";
  const was = await env.BUCKET.head(`${DECLARED}${ev.id}.json`);
  if (!own && !was) return;
  const d = { id: ev.id, key: `d${ev.id}`, country: ev.country, club: ev.club, name: ev.name, date: ev.date, place: ev.place,
    terrain: ev.terrain, epreuve: ev.epreuve, site: ev.site, owner: ev.created_by, event: ev.id, type: formOf(ev.type), kind: kindOf(ev.type),
    status: own ? "active" : "removed", created: ev.created_at, updated: ev.updated_at };
  await env.BUCKET.put(`${DECLARED}${ev.id}.json`, JSON.stringify(d), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { id: d.id, owner: String(d.owner), country: d.country, date: d.date, status: d.status },
  });
}
