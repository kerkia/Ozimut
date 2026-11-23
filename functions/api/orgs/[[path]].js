// /api/orgs — clubs as entities (owner, 2026-11-22; docs/clubs/design.md §1, migration 0030, functions/_lib/orgs.js): an org's
// members and their roles, who manages it, its settings and the clubs it nets with. France's clubs come from the federation's
// tree (made the first time anyone needs one) and their members from the licences (syncFederation); elsewhere a club is declared
// by a member. A club's officer (président(e), secrétaire, trésorier / trésorière in the federation's directory) becomes its
// manager at once; anyone else's claim waits for an administrator. Signed-in accounts only (the login gate).
//   GET    /api/orgs                          my orgs with my roles; the clubs I could claim or join (France: my licence's
//                                             club; elsewhere: the clubs of my countries, Réglages › Mes pays)
//   GET    /api/orgs/find?cc=&q=              orgs to pick (France: the directory; elsewhere the declared ones)
//   GET    /api/orgs/pending                  administrators: the claims waiting, and the claimed clubs with their managers
//   POST   /api/orgs/claim                    { cc, kind, code } (France) or { cc, name } (a declared club): an officer manages
//                                             at once, anyone else waits for an administrator -> { org, state: manager|pending }
//   POST   /api/orgs/join-link                { token } an invitation link -> { org }
//   GET    /api/orgs/<id>                     the card (name, kind, country, code, state, parent, members); to its members the
//                                             members with their roles (pending rows to its managers); the settings to its
//                                             managers and treasurers
//   POST   /api/orgs/<id>/join                a membership request (declared: pending until a manager accepts)
//   POST   /api/orgs/<id>/approve             administrators: { user, ok } a claim confirmed or refused
//   PUT    /api/orgs/<id>/members/<uid>       managers: { roles?, state?: "ok", until? } (never the club without a manager)
//   DELETE /api/orgs/<id>/members/<uid>       managers, or oneself (the last manager names another first)
//   GET    /api/orgs/<id>/invites             managers: the links still valid (their tokens' hashes only)
//   POST   /api/orgs/<id>/invites             managers: { roles, until?, days? } -> { link, expires }
//   DELETE /api/orgs/<id>/invites/<hash>      managers: a link revoked (its hash's first characters)
//   GET    /api/orgs/<id>/settings            managers and treasurers
//   PUT    /api/orgs/<id>/settings            managers: everything; treasurers: entry_policy, iban, holder, bic
//   GET    /api/orgs/<id>/netting             managers and treasurers: the clubs it accepts and those that accept it
//   PUT    /api/orgs/<id>/netting/<other>     managers and treasurers: accepted (<other> an org id, or « FR-0109 » for a French club)
//   DELETE /api/orgs/<id>/netting/<other>     the same, withdrawn
// Every route answers 503 { error: "not ready" } before migration 0030.

import { allow, isAdmin, json, nowIso, parisToday, readBody, siteUrl, withUser } from "../../_lib/api.js";
import { clubOf } from "../../_lib/club.js";
import { memberships } from "../../_lib/countries.js";
import { newToken, sha256hex } from "../../_lib/crypto.js";
import {
  DEFAULTS, POLICIES, ROLES, declaredOrg, directory, inForce, isOfficer, managersOf, notReady, orgById, orgByCode, orgsOf,
  ready, rightsOf, roleList, roleSet, rolesOf, saveSettings, settingsOf,
} from "../../_lib/orgs.js";
import { nameKey } from "../../_middleware.js";
import { showModule } from "../../_lib/modules.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const nameOf = (u) => u.display_name || `${u.first_name || ""} ${u.last_name || ""}`.trim();
const orgView = (o) => ({ id: o.id, cc: o.cc, kind: o.kind, code: o.code, name: o.name, state: o.state, source: o.source, claimed: o.claimed_at || null });
const realRoles = (set) => [...set].filter((r) => ROLES.includes(r));
/** A role given is new work: the module it uses is shown to the account (_lib/modules.js showModule; owner, 2026-11-12). */
async function shown(env, uid, roles) {
  const set = roles instanceof Set ? roles : new Set(roles || []);
  if (["manager", "organiser", "treasurer"].some((r) => set.has(r))) await showModule(env, uid, "orga").catch(() => {});
  if (set.has("mapper")) await showModule(env, uid, "carto").catch(() => {});
}

export const onRequest = withUser(async (ctx, user) => {
  const { env } = ctx;
  if (!(await ready(env))) return json({ error: "not ready" }, 503);
  try { return await route(ctx, user); }
  catch (e) { if (notReady(e)) return json({ error: "not ready" }, 503); throw e; }
});

async function route({ request, env, params }, user) {
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method, url = new URL(request.url);
  const admin = isAdmin(env, user);
  const writing = method !== "GET";
  if (writing && user.demo_until) return json({ error: "demo" }, 403);
  if (writing && !(await allow(env, `orgs:${user.id}`, 300, 86400))) return json({ error: "too many" }, 429);

  // ---- lists ------------------------------------------------------------------------------------------------------------
  if (!parts.length && method === "GET") return json(await mine(env, request, user, admin));
  if (parts[0] === "find" && method === "GET") {
    if (!(await allow(env, `orgfind:${user.id}`, 600, 3600))) return json({ error: "too many" }, 429);
    return json({ orgs: await find(env, request, String(url.searchParams.get("cc") || "FR").toUpperCase(), String(url.searchParams.get("q") || "")) });
  }
  if (parts[0] === "pending" && method === "GET") {
    if (!admin) return json({ error: "forbidden" }, 403);
    return json(await pendingClaims(env, request));
  }
  if (parts[0] === "claim" && method === "POST") return claim(env, request, user, (await readBody(request)) || {});
  if (parts[0] === "join-link" && method === "POST") {
    if (!(await allow(env, `orgjoinlink:${user.id}`, 30, 3600))) return json({ error: "too many" }, 429);
    const b = (await readBody(request)) || {};
    const h = b.token ? await sha256hex(String(b.token).slice(0, 100)) : "";
    const inv = h ? await env.DB.prepare("SELECT * FROM org_invites WHERE token_hash = ?").bind(h).first() : null;
    if (!inv || inv.expires_at < nowIso()) return json({ error: "invite" }, 410);
    const had = await rolesOf(env, user.id, inv.org_id);
    const roles = roleSet(inv.roles);
    if (had && had.state !== "left") {
      // already there: the link's roles added; a full member's row keeps no end day, a guest's takes the link's
      for (const r of had.roles) roles.add(r);
      await env.DB.prepare("UPDATE org_members SET roles = ?, state = 'ok', until = CASE WHEN source = 'invited' THEN ? ELSE until END WHERE org_id = ? AND user_id = ?")
        .bind(roleList(roles), inv.until || null, inv.org_id, user.id).run();
    } else {
      await env.DB.prepare(`INSERT INTO org_members (org_id, user_id, roles, source, state, until, since, added_by) VALUES (?, ?, ?, 'invited', 'ok', ?, ?, ?)
        ON CONFLICT (org_id, user_id) DO UPDATE SET roles = excluded.roles, source = 'invited', state = 'ok', until = excluded.until, since = excluded.since, added_by = excluded.added_by`)
        .bind(inv.org_id, user.id, roleList(roles), inv.until || null, nowIso(), inv.created_by).run();
    }
    await env.DB.prepare("UPDATE org_invites SET uses = uses + 1 WHERE token_hash = ?").bind(h).run();
    await shown(env, user.id, roles);
    return json({ ok: true, org: inv.org_id });
  }

  // ---- one org ----------------------------------------------------------------------------------------------------------
  const id = Number(parts[0]);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "not found" }, 404);
  const org = await orgById(env, id);
  if (!org) return json({ error: "not found" }, 404);
  const me = await rolesOf(env, user.id, id);
  const R = admin ? { member: true, manage: true, organise: true, map: true, treasure: true } : rightsOf(me);
  const sub = parts[1] || "";

  if (!sub && method === "GET") return json(await card(env, request, user, org, me, R, admin));

  if (sub === "join" && method === "POST") {
    if (me && inForce(me)) return json({ ok: true, state: "ok" });
    if (!(await allow(env, `orgjoin:${user.id}`, 20, 86400))) return json({ error: "too many" }, 429);
    // France: the licence's club joins at once (as syncFederation would)
    const fed = org.cc === "FR" && org.kind === "club" && (await clubOf(env, request, user.licence)) === org.code;
    await env.DB.prepare(`INSERT INTO org_members (org_id, user_id, roles, source, state, since) VALUES (?, ?, '', ?, ?, ?)
      ON CONFLICT (org_id, user_id) DO UPDATE SET state = excluded.state, source = CASE WHEN source = 'claim' THEN source ELSE excluded.source END`)
      .bind(id, user.id, fed ? "federation" : "declared", fed ? "ok" : "pending", nowIso()).run();
    return json({ ok: true, state: fed ? "ok" : "pending" });
  }

  if (sub === "approve" && method === "POST") {
    if (!admin) return json({ error: "forbidden" }, 403);
    const b = (await readBody(request)) || {};
    const uid = Number(b.user);
    const row = await rolesOf(env, uid, id);
    if (!row || !row.roles.has("claim")) return json({ error: "not pending" }, 409);
    const roles = new Set(row.roles);
    roles.delete("claim");
    if (b.ok === true) {
      roles.add("manager");
      await env.DB.batch([
        env.DB.prepare("UPDATE org_members SET roles = ?, state = 'ok', until = NULL, added_by = ? WHERE org_id = ? AND user_id = ?").bind(roleList(roles), user.id, id, uid),
        env.DB.prepare("UPDATE orgs SET state = 'claimed', claimed_at = COALESCE(claimed_at, ?) WHERE id = ?").bind(nowIso(), id),
      ]);
      await shown(env, uid, roles);
    } else if (row.state === "pending" && row.source === "claim") {
      await env.DB.prepare("DELETE FROM org_members WHERE org_id = ? AND user_id = ?").bind(id, uid).run();
    } else {
      await env.DB.prepare("UPDATE org_members SET roles = ? WHERE org_id = ? AND user_id = ?").bind(roleList(roles), id, uid).run();
    }
    return json({ ok: true });
  }

  if (sub === "members" && parts[2]) {
    const uid = Number(parts[2]);
    const row = await rolesOf(env, uid, id);
    if (!row || row.state === "left") return json({ error: "not found" }, 404);
    const self = uid === user.id;
    if (method === "PUT") {
      if (!R.manage) return json({ error: "forbidden" }, 403);
      const b = (await readBody(request)) || {};
      const roles = new Set(row.roles);
      if (Array.isArray(b.roles)) {
        for (const r of ROLES) roles.delete(r);
        for (const r of b.roles) if (ROLES.includes(r)) roles.add(r);
        if (roles.has("manager")) roles.delete("claim");
      }
      const state = b.state === "ok" ? "ok" : row.state;
      const until = b.until === undefined ? row.until : b.until && DAY.test(String(b.until)) ? String(b.until) : null;
      if (row.roles.has("manager") && !roles.has("manager") && (await lastManager(env, id, uid))) return json({ error: "last_manager" }, 409);
      await env.DB.prepare("UPDATE org_members SET roles = ?, state = ?, until = ?, added_by = COALESCE(added_by, ?) WHERE org_id = ? AND user_id = ?")
        .bind(roleList(roles), state, until, user.id, id, uid).run();
      if (roles.has("manager") && org.state !== "claimed") {
        await env.DB.prepare("UPDATE orgs SET state = 'claimed', claimed_at = COALESCE(claimed_at, ?) WHERE id = ?").bind(nowIso(), id).run();
      }
      await shown(env, uid, roles);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      if (!R.manage && !self) return json({ error: "forbidden" }, 403);
      if (row.roles.has("manager") && (await lastManager(env, id, uid))) {
        // the last manager: not while other members remain (they name another first)
        const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND user_id != ? AND state = 'ok'").bind(id, uid).first();
        if (Number(others?.n) > 0) return json({ error: "last_manager" }, 409);
        await env.DB.prepare("UPDATE orgs SET state = 'unclaimed' WHERE id = ?").bind(id).run();
      }
      // a federation member who leaves (or is removed) stays out: the daily check does not bring the row back
      if (row.source === "federation") await env.DB.prepare("UPDATE org_members SET state = 'left', roles = '', until = NULL WHERE org_id = ? AND user_id = ?").bind(id, uid).run();
      else await env.DB.prepare("DELETE FROM org_members WHERE org_id = ? AND user_id = ?").bind(id, uid).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "invites") {
    if (!R.manage) return json({ error: "forbidden" }, 403);
    if (method === "GET") {
      const { results } = await env.DB.prepare(`SELECT i.token_hash, i.roles, i.until, i.expires_at, i.created_at, i.uses, u.display_name, u.first_name, u.last_name
        FROM org_invites i LEFT JOIN users u ON u.id = i.created_by WHERE i.org_id = ? AND i.expires_at > ? ORDER BY i.created_at DESC`).bind(id, nowIso()).all();
      return json({ invites: results.map((x) => ({ h: x.token_hash.slice(0, 12), roles: realRoles(roleSet(x.roles)), until: x.until, expires: x.expires_at,
        created: x.created_at, uses: x.uses, by: nameOf(x) })) });
    }
    if (method === "POST") {
      if (!(await allow(env, `orginvite:${user.id}`, 40, 86400))) return json({ error: "too many" }, 429);
      const b = (await readBody(request)) || {};
      const roles = (Array.isArray(b.roles) ? b.roles : []).filter((r) => ROLES.includes(r));
      const until = b.until && DAY.test(String(b.until)) && String(b.until) >= parisToday() ? String(b.until) : null;
      const days = Math.max(1, Math.min(60, Number(b.days) || 14));
      const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM org_invites WHERE org_id = ? AND expires_at > ?").bind(id, nowIso()).first();
      if (Number(live?.n) >= 30) return json({ error: "too many" }, 429);
      const token = newToken(), h = await sha256hex(token);
      const expires = new Date(Date.now() + days * 86400e3).toISOString();
      await env.DB.prepare(`INSERT INTO org_invites (token_hash, org_id, roles, until, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(h, id, roles.join(","), until, expires, user.id, nowIso()).run();
      await env.DB.prepare("DELETE FROM org_invites WHERE expires_at < ?").bind(new Date(Date.now() - 7 * 86400e3).toISOString()).run();
      const base = siteUrl(env) || url.origin;
      return json({ ok: true, link: `${base}/#/monclub?invite=${encodeURIComponent(token)}`, expires, h: h.slice(0, 12) });
    }
    if (method === "DELETE" && /^[0-9a-f]{8,64}$/.test(parts[2] || "")) {
      await env.DB.prepare("DELETE FROM org_invites WHERE org_id = ? AND token_hash LIKE ?").bind(id, `${parts[2]}%`).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "settings") {
    if (!R.manage && !R.treasure) return json({ error: "forbidden" }, 403);
    const s = await settingsOf(env, id);
    if (method === "GET") return json({ settings: s, may: { manage: R.manage, treasure: R.treasure } });
    if (method === "PUT") {
      const b = (await readBody(request)) || {};
      const next = { ...s };
      if (R.manage) {
        if (b.events_by !== undefined) next.events_by = b.events_by === "members" ? "members" : "organisers";
        if (b.default_team !== undefined) next.default_team = !!b.default_team;
        if (b.contact !== undefined) next.contact = clean(b.contact, 300);
      }
      if (b.entry_policy !== undefined) {
        const p = b.entry_policy || {};
        const ids = (a) => (Array.isArray(a) ? a.map((x) => clean(x, 40)).filter((x) => /^[a-z0-9]{6,20}$/.test(x)).slice(0, 300) : []);
        next.entry_policy = { mode: POLICIES.includes(p.mode) ? p.mode : "self", except: ids(p.except), include: ids(p.include), recover: !!p.recover };
      }
      if (b.iban !== undefined) {
        const iban = String(b.iban || "").replace(/\s+/g, "").toUpperCase();
        if (iban && !ibanOk(iban)) return json({ error: "iban" }, 400);
        next.iban = iban;
      }
      if (b.bic !== undefined) {
        const bic = String(b.bic || "").replace(/\s+/g, "").toUpperCase();
        if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return json({ error: "bic" }, 400);
        next.bic = bic;
      }
      if (b.holder !== undefined) next.holder = clean(b.holder, 100);
      const keep = DEFAULTS();
      for (const k of Object.keys(next)) if (!(k in keep)) delete next[k];
      await saveSettings(env, id, next, user.id);
      return json({ ok: true, settings: next });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "netting") {
    if (!R.manage && !R.treasure) return json({ error: "forbidden" }, 403);
    if (method === "GET" && !parts[2]) {
      const { results: a } = await env.DB.prepare(`SELECT n.other_id AS id, n.since, o.name, o.cc, o.code FROM org_netting n JOIN orgs o ON o.id = n.other_id WHERE n.org_id = ?`).bind(id).all();
      const { results: b } = await env.DB.prepare(`SELECT n.org_id AS id, n.since, o.name, o.cc, o.code FROM org_netting n JOIN orgs o ON o.id = n.org_id WHERE n.other_id = ?`).bind(id).all();
      const as = new Set(a.map((x) => x.id)), bs = new Set(b.map((x) => x.id));
      return json({ accepts: a.map((x) => ({ ...x, mutual: bs.has(x.id) })), acceptedBy: b.map((x) => ({ ...x, mutual: as.has(x.id) })) });
    }
    if (!parts[2]) return json({ error: "method" }, 405);
    let other = null;
    const fr = /^FR-(\d{3,4})$/i.exec(parts[2]);
    if (fr) other = await orgByCode(env, request, "FR", "club", fr[1], { create: true });
    else if (/^\d+$/.test(parts[2])) other = await orgById(env, Number(parts[2]));
    if (!other || other.id === id) return json({ error: "not found" }, 404);
    if (method === "PUT") {
      await env.DB.prepare("INSERT OR IGNORE INTO org_netting (org_id, other_id, since, by_user) VALUES (?, ?, ?, ?)").bind(id, other.id, nowIso(), user.id).run();
      return json({ ok: true, other: orgView(other) });
    }
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM org_netting WHERE org_id = ? AND other_id = ?").bind(id, other.id).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }
  return json({ error: "method" }, 405);
}

/** IBAN's own check: the country and check digits, then mod 97. */
function ibanOk(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const s = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of s) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

/** Is `uid` the org's only manager in force? */
async function lastManager(env, orgId, uid) {
  const m = await managersOf(env, orgId);
  return m.length <= 1 && m.includes(uid);
}

/** GET /api/orgs: my orgs, and the clubs I could claim or join. */
async function mine(env, request, user, admin) {
  const rows = await orgsOf(env, user.id);
  const counts = new Map();
  if (rows.length) {
    const ids = rows.map((r) => r.org.id);
    const { results } = await env.DB.prepare(`SELECT org_id, COUNT(*) AS n FROM org_members WHERE state = 'ok' AND org_id IN (${ids.map(() => "?").join(",")}) GROUP BY org_id`).bind(...ids).all();
    for (const r of results) counts.set(r.org_id, r.n);
  }
  const orgs = rows.map((m) => ({ ...orgView(m.org), members: counts.get(m.org.id) || 0, roles: realRoles(m.roles), claim: m.roles.has("claim"),
    mstate: m.state, msource: m.source, until: m.until, rights: rightsOf(m) }));
  // the clubs I could claim or join: France my licence's club; elsewhere the clubs of my countries (Réglages › Mes pays)
  const candidates = [];
  const code = /^\d+$/.test(String(user.licence || "")) ? await clubOf(env, request, user.licence) : null;
  if (code) {
    const d = (await directory(env, request)).get(`club:${code}`);
    const org = await orgByCode(env, request, "FR", "club", code);
    if (d || org) {
      candidates.push({ cc: "FR", kind: "club", code, name: org?.name || d.name, org: org?.id || null, state: org?.state || "unclaimed",
        officer: await isOfficer(env, request, user, { cc: "FR", kind: "club", code }) });
    }
  }
  for (const m of await memberships(env, user.id)) {
    if (m.country === "FR" || m.status !== "ok" || !clean(m.club, 120)) continue;
    const org = await declaredOrg(env, m.country, m.club);
    candidates.push({ cc: m.country, kind: "club", code: "", name: org?.name || clean(m.club, 120), org: org?.id || null, state: org?.state || "unclaimed", officer: false });
  }
  return { orgs, candidates: candidates.filter((c) => !orgs.some((o) => o.id === c.org && o.mstate === "ok" && o.roles.includes("manager"))), admin };
}

/** GET /api/orgs/<id>: what the account may see of an org. */
async function card(env, request, user, org, me, R, admin) {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND state = 'ok'").bind(org.id).first();
  const parent = org.parent ? await orgById(env, org.parent) : null;
  const out = { org: { ...orgView(org), members: Number(n?.n) || 0, parent: parent ? { id: parent.id, name: parent.name, kind: parent.kind } : null },
    me: me && me.state !== "left" ? { roles: realRoles(me.roles), claim: me.roles.has("claim"), state: me.state, source: me.source, until: me.until, since: me.since } : null,
    rights: R, admin };
  if (R.member) {
    const { results } = await env.DB.prepare(`SELECT m.user_id, m.roles, m.source, m.state, m.since, m.until, u.display_name, u.first_name, u.last_name
      FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.state IN ('ok', 'pending') ORDER BY u.last_name, u.first_name`).bind(org.id).all();
    out.members = results.filter((m) => m.state === "ok" || R.manage).map((m) => ({ uid: m.user_id, name: nameOf(m), roles: realRoles(roleSet(m.roles)),
      claim: R.manage && roleSet(m.roles).has("claim"), source: m.source, state: m.state, since: m.since, until: m.until, you: m.user_id === user.id,
      expired: !!m.until && m.until < parisToday() }));
  }
  if (R.manage || R.treasure) out.settings = await settingsOf(env, org.id);
  return out;
}

/** POST /api/orgs/claim. */
async function claim(env, request, user, b) {
  if (!(await allow(env, `orgclaim:${user.id}`, 10, 86400))) return json({ error: "too many" }, 429);
  const cc = String(b.cc || "").toUpperCase();
  let org = null;
  if (cc === "FR" && b.code) org = await orgByCode(env, request, "FR", b.kind || "club", b.code, { create: true });
  else if (b.name) org = await declaredOrg(env, cc, b.name, { create: true });
  if (!org) return json({ error: "not found" }, 404);
  const row = await rolesOf(env, user.id, org.id);
  if (row && inForce(row) && row.roles.has("manager")) return json({ ok: true, org: org.id, state: "manager" });
  const now = nowIso();
  if (await isOfficer(env, request, user, org)) {
    const roles = row && row.state !== "left" ? new Set(row.roles) : new Set();
    roles.delete("claim"); roles.add("manager");
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO org_members (org_id, user_id, roles, source, state, since) VALUES (?, ?, ?, 'claim', 'ok', ?)
        ON CONFLICT (org_id, user_id) DO UPDATE SET roles = excluded.roles, state = 'ok', until = NULL,
          source = CASE WHEN source = 'federation' AND state = 'ok' THEN source ELSE 'claim' END`).bind(org.id, user.id, roleList(roles), now),
      env.DB.prepare("UPDATE orgs SET state = 'claimed', claimed_at = COALESCE(claimed_at, ?) WHERE id = ?").bind(now, org.id),
    ]);
    await shown(env, user.id, roles);
    return json({ ok: true, org: org.id, state: "manager" });
  }
  // a claim waiting for an administrator: the pseudo-role « claim » on the account's row (a member stays one meanwhile)
  if (row && row.state !== "left") {
    const roles = new Set(row.roles); roles.add("claim");
    await env.DB.prepare("UPDATE org_members SET roles = ? WHERE org_id = ? AND user_id = ?").bind(roleList(roles), org.id, user.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO org_members (org_id, user_id, roles, source, state, since) VALUES (?, ?, 'claim', 'claim', 'pending', ?)
      ON CONFLICT (org_id, user_id) DO UPDATE SET roles = 'claim', source = 'claim', state = 'pending', until = NULL`).bind(org.id, user.id, now).run();
  }
  return json({ ok: true, org: org.id, state: "pending" });
}

/** GET /api/orgs/find: orgs to pick, by name or number. */
async function find(env, request, cc, q) {
  const key = nameKey(q), num = /^\d{3,4}$/.test(q.trim()) ? q.trim().padStart(4, "0") : null;
  const out = [];
  if (cc === "FR") {
    const dir = await directory(env, request);
    const { results } = await env.DB.prepare("SELECT id, kind, code, state FROM orgs WHERE cc = 'FR' AND code != ''").all();
    const known = new Map(results.map((r) => [`${r.kind}:${r.code}`, r]));
    for (const [k, d] of dir) {
      if (d.kind !== "club") continue;
      if (key || num) {
        const nk = nameKey(d.name);
        if (!(num && d.code === num) && !(key && key.split(" ").every((w) => nk.includes(w)))) continue;
      }
      const row = known.get(k);
      out.push({ cc: "FR", kind: d.kind, code: d.code, name: d.name, org: row?.id || null, state: row?.state || "unclaimed" });
      if (out.length >= 40) break;
    }
    return out;
  }
  const { results } = await env.DB.prepare("SELECT id, cc, kind, code, name, state FROM orgs WHERE cc = ? ORDER BY name LIMIT 2000").bind(cc).all();
  for (const o of results) {
    if (key && !key.split(" ").every((w) => nameKey(o.name).includes(w))) continue;
    out.push({ cc: o.cc, kind: o.kind, code: o.code, name: o.name, org: o.id, state: o.state });
    if (out.length >= 40) break;
  }
  return out;
}

/** GET /api/orgs/pending: the claims waiting (is the account an officer?), and the claimed orgs with their managers. */
async function pendingClaims(env, request) {
  const { results } = await env.DB.prepare(`SELECT m.org_id, m.user_id, m.state, m.since, u.display_name, u.first_name, u.last_name, u.email, u.licence,
      o.cc, o.kind, o.code, o.name, o.state AS ostate
    FROM org_members m JOIN users u ON u.id = m.user_id JOIN orgs o ON o.id = m.org_id
    WHERE (',' || m.roles || ',') LIKE '%,claim,%' ORDER BY m.since`).all();
  const claims = [];
  for (const r of results) {
    const org = { id: r.org_id, cc: r.cc, kind: r.kind, code: r.code, name: r.name };
    const u = { id: r.user_id, first_name: r.first_name, last_name: r.last_name };
    claims.push({ org: { ...org, state: r.ostate }, user: { uid: r.user_id, name: nameOf(r), email: r.email, licence: r.licence || "",
      club: r.licence ? await clubOf(env, request, r.licence) : null }, member: r.state === "ok", since: r.since,
      officer: await isOfficer(env, request, u, org) });
  }
  const { results: cl } = await env.DB.prepare(`SELECT o.id, o.cc, o.kind, o.code, o.name, o.claimed_at,
      (SELECT COUNT(*) FROM org_members x WHERE x.org_id = o.id AND x.state = 'ok') AS n
    FROM orgs o WHERE o.state = 'claimed' ORDER BY o.cc, o.name LIMIT 1000`).all();
  const { results: mg } = await env.DB.prepare(`SELECT m.org_id, m.user_id, m.until, u.display_name, u.first_name, u.last_name, u.email
    FROM org_members m JOIN users u ON u.id = m.user_id JOIN orgs o ON o.id = m.org_id
    WHERE o.state = 'claimed' AND m.state = 'ok' AND (',' || m.roles || ',') LIKE '%,manager,%'`).all();
  const clubs = cl.map((o) => ({ ...orgView(o), members: o.n, managers: mg.filter((m) => m.org_id === o.id && (!m.until || m.until >= parisToday()))
    .map((m) => ({ uid: m.user_id, name: nameOf(m), email: m.email })) }));
  return { claims, clubs };
}
