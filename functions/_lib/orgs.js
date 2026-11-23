// Clubs as entities (owner, 2026-11-22; docs/clubs/design.md §1, migration 0030): an org is a club, a committee, a league or
// a federation; its members hold roles (manager, organiser, mapper, treasurer), its settings say who creates its events, who
// is on their teams by default, who pays its members' entries, its bank details and the clubs it nets with. France's orgs
// mirror the federation's tree (site/data/fr/clubdir.json), a row made lazily the first time anyone needs it; elsewhere an
// org is declared by a member. functions/api/orgs/[[path]].js, the page « Mon club » (#/monclub).
//
// A pending claim to manage an org is kept on the account's row as the pseudo-role « claim » (the row stays « ok » when the
// account is already a member, « pending » otherwise): it grants nothing until an administrator turns it into « manager ».

import { isAdmin, nowIso, parisToday } from "./api.js";
import { clubOf, orgCode } from "./club.js";
import { nameKey } from "../_middleware.js";

export const ROLES = ["manager", "organiser", "mapper", "treasurer"];
export const RIGHTS = { manage: ["manager"], organise: ["manager", "organiser"], map: ["manager", "mapper"], treasure: ["manager", "treasurer"] };
export const KINDS = ["club", "committee", "league", "federation"];
export const POLICIES = ["self", "champ", "all", "case"];
export const DEFAULTS = () => ({ events_by: "organisers", default_team: true,
  entry_policy: { mode: "self", except: [], include: [], recover: false }, iban: "", holder: "", bic: "", contact: "" });

/** The comma list of roles as a Set (the pseudo-role « claim » kept). */
export const roleSet = (s) => new Set(String(s || "").split(",").map((x) => x.trim()).filter((x) => x === "claim" || ROLES.includes(x)));
export const roleList = (set) => [...set].filter((x) => x === "claim" || ROLES.includes(x)).join(",");

// ---- is migration 0030 applied? (asked once per isolate; a « no » asked again after a minute) -------------------------------
let READY = null, READY_AT = 0;
export async function ready(env) {
  if (READY === true || (READY === false && Date.now() - READY_AT < 60e3)) return READY;
  try { await env.DB.prepare("SELECT (SELECT 1 FROM orgs LIMIT 1), (SELECT org_checked FROM users LIMIT 1), (SELECT org_id FROM events LIMIT 1)").first(); READY = true; }
  catch (e) { READY = false; }
  READY_AT = Date.now();
  return READY;
}
/** A D1 error that says the migration is missing (the routes then answer 503 « not ready »). */
export const notReady = (e) => /no such (table|column)/i.test(String(e?.message || e));

// ---- France's federation tree (site/data/fr/clubdir.json: ligues → départements → clubs) ------------------------------------
let DIR = null, DIR_AT = 0;
/** The directory as a Map "kind:code" -> { kind, code, name, parent: "kind:code"|null, site }; cached ten minutes. */
export async function directory(env, request) {
  if (DIR && Date.now() - DIR_AT < 600e3) return DIR;
  const out = new Map();
  try {
    const res = await env.ASSETS.fetch(new URL("/data/fr/clubdir.json", request.url));
    const d = res.ok ? await res.json() : null;
    for (const l of d?.ligues || []) {
      const lk = `league:${String(l.code).toUpperCase()}`;
      out.set(lk, { kind: "league", code: String(l.code).toUpperCase(), name: l.name, parent: null, site: l.site || "" });
      for (const dp of l.depts || []) {
        // a département without a committee (« cdco » false): its clubs hang from the league
        const dk = dp.cdco ? `committee:${dp.code}` : null;
        if (dk) out.set(dk, { kind: "committee", code: String(dp.code), name: dp.name, parent: lk, site: dp.site || "" });
        for (const c of dp.clubs || []) {
          if (!/^\d{4}$/.test(String(c.code || ""))) continue;
          out.set(`club:${c.code}`, { kind: "club", code: String(c.code), name: c.name, parent: dk || lk, site: c.site || "", dept: String(dp.code), league: String(l.code).toUpperCase() });
        }
      }
    }
    DIR = out; DIR_AT = Date.now();
  } catch (e) { if (!DIR) return out; }
  return DIR || out;
}

const ORG_COLS = "id, cc, kind, code, name, parent, state, source, created_at, claimed_at";
/** An org by its id, or null. */
export async function orgById(env, id) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) return null;
  return (await env.DB.prepare(`SELECT ${ORG_COLS} FROM orgs WHERE id = ?`).bind(Number(id)).first()) || null;
}

/**
 * An org by its country, kind and code (France: the directory's key — a club « 0109 », a league « AR », a committee « 69 »).
 * With `create`, a French org the directory lists is made the first time (its parent too); null otherwise.
 */
export async function orgByCode(env, request, cc, kind, code, { create = false } = {}) {
  cc = String(cc || "").toUpperCase(); kind = KINDS.includes(kind) ? kind : "club";
  code = kind === "club" ? String(code || "").padStart(4, "0") : String(code || "").toUpperCase();
  if (!code || code === "0000") return null;
  const q = () => env.DB.prepare(`SELECT ${ORG_COLS} FROM orgs WHERE cc = ? AND kind = ? AND code = ?`).bind(cc, kind, code).first();
  let row = await q();
  if (row || !create || cc !== "FR") return row || null;
  const d = (await directory(env, request)).get(`${kind}:${code}`);
  if (!d) return null;
  let parent = null;
  if (d.parent) {
    const [pk, pc] = d.parent.split(":");
    parent = (await orgByCode(env, request, "FR", pk, pc, { create: true }))?.id || null;
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO orgs (cc, kind, code, name, parent, state, source, created_at)
    VALUES ('FR', ?, ?, ?, ?, 'unclaimed', 'directory', ?)`).bind(kind, code, String(d.name || code).slice(0, 120), parent, nowIso()).run();
  return (await q()) || null;
}

/** A declared org (outside France, or a club the directory does not list) by its country and name, made with `create`. */
export async function declaredOrg(env, cc, name, { create = false } = {}) {
  cc = String(cc || "").toUpperCase();
  const clean = String(name || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const key = nameKey(clean);
  if (!/^[A-Z]{2}$/.test(cc) || clean.length < 2 || !key) return null;
  const { results } = await env.DB.prepare(`SELECT ${ORG_COLS} FROM orgs WHERE cc = ? AND kind = 'club' LIMIT 2000`).bind(cc).all();
  const found = results.find((o) => nameKey(o.name) === key);
  if (found || !create) return found || null;
  return env.DB.prepare(`INSERT INTO orgs (cc, kind, code, name, state, source, created_at) VALUES (?, 'club', '', ?, 'unclaimed', 'declared', ?)
    RETURNING ${ORG_COLS}`).bind(cc, clean, nowIso()).first();
}

// ---- membership and rights --------------------------------------------------------------------------------------------
const today = () => parisToday();
/** Is a membership row in force today (state ok, a guest before its end)? */
export const inForce = (m) => !!m && m.state === "ok" && (!m.until || m.until >= today());

/** The account's orgs: [{ org, roles: Set, state, source, until, since }], every state (« left » apart). */
export async function orgsOf(env, userId) {
  const { results } = await env.DB.prepare(`SELECT m.roles, m.state AS mstate, m.source AS msource, m.until, m.since,
      o.id, o.cc, o.kind, o.code, o.name, o.parent, o.state, o.source, o.created_at, o.claimed_at
    FROM org_members m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = ? AND m.state != 'left' ORDER BY o.name`).bind(userId).all();
  return results.map((r) => ({ org: { id: r.id, cc: r.cc, kind: r.kind, code: r.code, name: r.name, parent: r.parent, state: r.state,
    source: r.source, created_at: r.created_at, claimed_at: r.claimed_at }, roles: roleSet(r.roles), state: r.mstate, source: r.msource,
    until: r.until || null, since: r.since }));
}

/** One account's row in one org: { roles: Set, state, source, until, since } or null. */
export async function rolesOf(env, userId, orgId) {
  const r = await env.DB.prepare("SELECT roles, state, source, until, since FROM org_members WHERE org_id = ? AND user_id = ?").bind(Number(orgId), userId).first();
  return r ? { roles: roleSet(r.roles), state: r.state, source: r.source, until: r.until || null, since: r.since } : null;
}

/** The rights a membership row gives: { member, manage, organise, map, treasure }. */
export function rightsOf(m) {
  const ok = inForce(m), out = { member: ok };
  for (const [k, roles] of Object.entries(RIGHTS)) out[k] = ok && roles.some((r) => m.roles.has(r));
  return out;
}

/** May the account use `right` (manage | organise | map | treasure | member) in the org? Administrators may everything. */
export async function can(env, user, orgId, right) {
  if (!user || !orgId) return false;
  if (isAdmin(env, user)) return true;
  try { return !!rightsOf(await rolesOf(env, user.id, orgId))[right]; } catch (e) { return false; }
}

/** The org's settings, every default filled. */
export async function settingsOf(env, orgId) {
  const d = DEFAULTS();
  let s = {};
  try {
    const r = await env.DB.prepare("SELECT json FROM org_settings WHERE org_id = ?").bind(Number(orgId)).first();
    s = r ? JSON.parse(r.json || "{}") : {};
  } catch (e) { s = {}; }
  return { ...d, ...s, entry_policy: { ...d.entry_policy, ...(s.entry_policy || {}) } };
}
export async function saveSettings(env, orgId, settings, userId) {
  await env.DB.prepare(`INSERT INTO org_settings (org_id, json, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (org_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(Number(orgId), JSON.stringify(settings), nowIso(), userId || null).run();
}

/** The managers of an org in force: [user_id]. */
export async function managersOf(env, orgId) {
  const { results } = await env.DB.prepare("SELECT user_id, roles, state, until FROM org_members WHERE org_id = ? AND state = 'ok'").bind(Number(orgId)).all();
  return results.filter((m) => inForce(m) && roleSet(m.roles).has("manager")).map((m) => m.user_id);
}

/**
 * France's automatic membership (contract §1 « Membership »): the club of the account's licence (its latest race) is its club,
 * a row `source = federation`; when the licence's club changed, the old federation rows go (roles with them). At most once a
 * Paris day (users.org_checked); returns at once otherwise, and before migration 0030.
 */
export async function syncFederation(env, request, user) {
  if (!user || user.org_checked === today() || user.demo_until) return;
  if (!(await ready(env))) return;
  try {
    const now = nowIso();
    const lic = String(user.licence || "");
    const code = /^\d+$/.test(lic) ? await clubOf(env, request, lic) : null;
    let keep = null;
    if (code) {
      const org = await orgByCode(env, request, "FR", "club", code, { create: true });
      if (org) {
        keep = org.id;
        await env.DB.prepare(`INSERT INTO org_members (org_id, user_id, roles, source, state, since) VALUES (?, ?, '', 'federation', 'ok', ?)
          ON CONFLICT (org_id, user_id) DO UPDATE SET state = CASE WHEN state = 'left' THEN state ELSE 'ok' END,
            until = CASE WHEN state = 'left' THEN until ELSE NULL END,
            source = CASE WHEN source IN ('declared', 'invited') AND state != 'left' THEN 'federation' ELSE source END`)
          .bind(org.id, user.id, now).run();
      }
    }
    // the old club's federation rows go: a licence's club changed (a licence gone too); a licence whose club the data cannot
    // say (no race yet, the file unread) keeps its rows
    if (keep || !lic) {
      await env.DB.prepare(`DELETE FROM org_members WHERE user_id = ? AND source = 'federation' AND org_id != ?
        AND org_id IN (SELECT id FROM orgs WHERE cc = 'FR')`).bind(user.id, keep || 0).run();
    }
    await env.DB.prepare("UPDATE users SET org_checked = ? WHERE id = ?").bind(today(), user.id).run();
  } catch (e) { /* tried again at the next visit */ }
}

/**
 * The org an event belongs to: events.org_id; else, resolved and stored, France's organising club by its number
 * (orgCode(ev.club)), or the creator's club membership in the event's country (its name, else its only one).
 */
export async function orgOfEvent(env, request, ev) {
  if (!ev) return null;
  if (ev.org_id) return orgById(env, ev.org_id);
  if (!(await ready(env))) return null;
  let org = null;
  const code = orgCode(ev.club);
  if ((ev.country || "FR") === "FR" && code) org = await orgByCode(env, request, "FR", "club", code, { create: true });
  if (!org && ev.created_by) org = await creatorOrg(env, ev.created_by, ev.country, ev.club);
  if (org && ev.id) await env.DB.prepare("UPDATE events SET org_id = ? WHERE id = ? AND org_id IS NULL").bind(org.id, ev.id).run().catch(() => {});
  return org;
}
/** The creator's club in a country: the membership whose name is the event's club, else its only one in force. */
export async function creatorOrg(env, userId, cc, clubName) {
  const mine = (await orgsOf(env, userId)).filter((m) => m.org.kind === "club" && m.org.cc === String(cc || "FR").toUpperCase() && inForce(m));
  const key = nameKey(String(clubName || "").replace(/^\s*\d{3,4}\s*-\s*/, ""));
  return (key && mine.find((m) => nameKey(m.org.name) === key)?.org) || (mine.length === 1 ? mine[0].org : null);
}

/**
 * Is the account on an event's team through its club (contract §1: the club's organisers when its settings' default_team is
 * on; resolved at read time, never copied into event_members)? Only a claimed org has organisers.
 */
export async function clubTeam(env, request, user, ev) {
  if (!user || !ev) return false;
  try {
    if (!(await ready(env))) return false;
    const org = await orgOfEvent(env, request, ev);
    if (!org || org.state !== "claimed") return false;
    if (!rightsOf(await rolesOf(env, user.id, org.id)).organise) return false;
    return !!(await settingsOf(env, org.id)).default_team;
  } catch (e) { return false; }
}

// ---- claiming --------------------------------------------------------------------------------------------------------
const OFFICER = /^(president|presidente|secretaire|tresorier|tresoriere)\b/;
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/**
 * Is the account an officer of a French org (contract « Claiming a club »): its first and last name match an officer listed
 * as président(e), secrétaire or trésorier / trésorière in fr/clubdir_contacts.json (names folded, word order free)?
 */
export async function isOfficer(env, request, user, org) {
  if (!user || !org || org.cc !== "FR" || !org.code) return false;
  try {
    const res = await env.ASSETS.fetch(new URL("/data/fr/clubdir_contacts.json", request.url));
    const c = res.ok ? await res.json() : null;
    const part = { club: "C", committee: "D", league: "L" }[org.kind];
    const bureau = part ? c?.[part]?.[org.code]?.bureau || [] : [];
    const me = nameKey(`${user.first_name || ""} ${user.last_name || ""}`);
    if (!me || !me.includes(" ")) return false;
    return bureau.some((b) => Array.isArray(b) && OFFICER.test(fold(b[1])) && nameKey(b[0]) === me);
  } catch (e) { return false; }
}

/** Have both clubs accepted netting with each other (two rows of org_netting)? */
export async function nettingAccepted(env, a, b) {
  if (!a || !b || Number(a) === Number(b)) return false;
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM org_netting WHERE (org_id = ? AND other_id = ?) OR (org_id = ? AND other_id = ?)`)
    .bind(Number(a), Number(b), Number(b), Number(a)).first();
  return Number(r?.n) === 2;
}

// ---- groups in the Tracer's and Cartographier's teams ------------------------------------------------------------------------
// meta.orgGroups: [{ org, role: "organiser" | "mapper" }]: « les organisateurs du club » / « les cartographes du club », resolved
// at read time — an org member holding that role gets the tool's editing role.
export const GROUP_ROLES = { organiser: "organise", mapper: "map" };
/** Does the account hold one of the groups' roles (the right each names)? */
export async function inGroups(env, user, groups) {
  if (!user || !Array.isArray(groups) || !groups.length) return false;
  try {
    if (!(await ready(env))) return false;
    for (const g of groups) if (GROUP_ROLES[g?.role] && rightsOf(await rolesOf(env, user.id, g.org))[GROUP_ROLES[g.role]]) return true;
  } catch (e) { /* none */ }
  return false;
}
/** The rights the account holds, by org: Map(org id -> rights, with `code` a French club's number) — for checks over many
 *  documents. */
export async function rightsIndex(env, user) {
  const out = new Map();
  try {
    if (await ready(env)) for (const m of await orgsOf(env, user.id)) {
      out.set(m.org.id, { ...rightsOf(m), code: m.org.cc === "FR" && m.org.kind === "club" ? m.org.code : "" });
    }
  } catch (e) { /* none */ }
  return out;
}
/** The groups as summarised in an R2 object's custom metadata (« 12:organiser,15:mapper ») and back. */
export const groupsText = (groups) => (Array.isArray(groups) ? groups.map((g) => `${g.org}:${g.role}`).join(",") : "");
export const groupsFrom = (text) => String(text || "").split(",").map((x) => x.split(":")).filter((x) => x.length === 2 && GROUP_ROLES[x[1]])
  .map(([org, role]) => ({ org: Number(org), role }));
/** Is the account in one of the summarised groups (with rightsIndex's map)? */
export const inGroupsIndexed = (idx, text) => groupsFrom(text).some((g) => idx.get(g.org)?.[GROUP_ROLES[g.role]]);
/**
 * The groups a team's PUT asks for, checked: at most five, each an org the account is a member of (an administrator: any), with
 * a known role; the groups already there and not asked for are dropped, those the account may not add kept as they were.
 */
export async function cleanGroups(env, user, asked, before = []) {
  if (!Array.isArray(asked)) return before;
  const out = [];
  for (const g of asked.slice(0, 5)) {
    const org = Number(g?.org), role = String(g?.role || "");
    if (!org || !GROUP_ROLES[role] || out.some((x) => x.org === org && x.role === role)) continue;
    const had = before.some((x) => Number(x.org) === org && x.role === role);
    if (had || (await can(env, user, org, "member"))) {
      const o = had ? null : await orgById(env, org);
      out.push({ org, role, name: had ? before.find((x) => Number(x.org) === org && x.role === role).name || "" : o?.name || "" });
    }
  }
  return out;
}
