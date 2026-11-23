// Who pays an entry: the runner, or the runner's club under its policy (docs/clubs/design.md §4 « Who pays »; owner,
// 2026-11-22). The club's settings (org_settings.json, _lib/orgs.js settingsOf) hold `entry_policy`:
//   mode: self (members pay their own entries; the default) · champ (the club carries championships: an event whose name says
//         « Championnat », national or league) · all (carries everything but the `except` events) · case (carries only the
//         `include` events, ticked by the treasurer);
//   recover: what the club carries goes on each member's year-end bill (functions/api/accounts).
// A club carries only runners it recognises — France: the club of the runner's licence (_lib/club.js clubOf, the club of its
// latest race) is the org; elsewhere: the runner's own account is a member of the org in force (an invited guest apart) — and
// only once claimed (it has someone to settle its accounts). Its own events are left to the runners (they pay their own club,
// or enter free when the form says so: entryprice.js own_free). The runner chooses nothing; the form says « pris en charge par
// votre club » or the amount. Used by _lib/entries.js billOf (each entry when it is made), api/entries (the form's hint) and
// api/accounts (an event ticked by the treasurer, applied to the entries still due).

import { clubOf, orgCode } from "./club.js";

const CHAMP = /\b(championnats?|championships?|meisterschaft(en)?|campeonatos?|campionat[oi]|kampioenschap(pen)?|mistrovstv[ií])\b/i;
const j = (s, d) => { try { const v = JSON.parse(s || ""); return v ?? d; } catch (e) { return d; } };

/** The policy as stored, every field filled. */
export function policyOf(settings) {
  const p = settings?.entry_policy || {};
  return { mode: ["self", "champ", "all", "case"].includes(p.mode) ? p.mode : "self",
    except: Array.isArray(p.except) ? p.except.map(String) : [], include: Array.isArray(p.include) ? p.include.map(String) : [], recover: p.recover === true };
}

/** Does the policy carry this event (its id and name)? */
export function carriesEvent(policy, ev) {
  const p = policy?.mode ? policy : policyOf({ entry_policy: policy });
  const id = String(ev?.id || "");
  if (p.mode === "self") return false;
  if (p.except.includes(id)) return false;
  if (p.include.includes(id)) return true;
  if (p.mode === "all") return true;
  if (p.mode === "champ") return CHAMP.test(String(ev?.name || "").normalize("NFKD").replace(/[̀-ͯ]/g, ""));
  return false;
}

/** The runner's club as an org row (its id from the entry, else its number in France, else its name), or null. */
async function runnerOrg(env, entry) {
  try {
    if (entry.org_id) return await env.DB.prepare("SELECT id, cc, kind, code, name, state FROM orgs WHERE id = ?").bind(Number(entry.org_id)).first();
    const cc = String(entry.club_country || "").toUpperCase();
    if (!cc) return null;
    if (cc === "FR" && entry.club_code) {
      return await env.DB.prepare("SELECT id, cc, kind, code, name, state FROM orgs WHERE cc = 'FR' AND kind = 'club' AND code = ?")
        .bind(String(entry.club_code).padStart(4, "0")).first();
    }
    if (entry.club_name) {
      return await env.DB.prepare("SELECT id, cc, kind, code, name, state FROM orgs WHERE cc = ? AND kind = 'club' AND lower(name) = lower(?)")
        .bind(cc, String(entry.club_name)).first();
    }
  } catch (e) { /* before migration 0030 */ }
  return null;
}

/**
 * Does the club recognise this runner as its own? France: the licence's club (the club of its latest race) is the org — and,
 * for a runner without licence, its account is a member in force; elsewhere the runner's account is a member in force (an
 * invited guest apart).
 */
export async function recognises(env, request, org, entry) {
  if (!org) return false;
  if (org.cc === "FR" && org.code && /^\d+$/.test(String(entry.licence || ""))) {
    return (await clubOf(env, request, entry.licence)) === org.code;
  }
  if (!entry.user_id) return false;
  try {
    const m = await env.DB.prepare("SELECT state, source, until FROM org_members WHERE org_id = ? AND user_id = ?").bind(org.id, Number(entry.user_id)).first();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
    return !!m && m.state === "ok" && m.source !== "invited" && (!m.until || m.until >= today);
  } catch (e) { return false; }
}

/** The org's policy (from org_settings; the default « self » when none is stored). */
export async function policyFor(env, orgId) {
  try {
    const r = await env.DB.prepare("SELECT json FROM org_settings WHERE org_id = ?").bind(Number(orgId)).first();
    return policyOf(j(r?.json, {}));
  } catch (e) { return policyOf({}); }
}

/** Is the event the org's own (its organising club)? */
const ownEvent = (org, ev) => (ev?.org_id && Number(ev.org_id) === Number(org.id))
  || (org.cc === "FR" && org.code && (ev?.country || "FR") === "FR" && orgCode(ev?.club) === org.code);

/**
 * The payer of an entry. `entry`: { licence, user_id, org_id, club_country, club_code, club_name }; `ev`: the events row.
 * -> { payer: "club", org } | { payer: "runner" }
 */
export async function payerFor(env, request, entry, ev) {
  const runner = { payer: "runner" };
  if (!entry || !ev) return runner;
  const org = await runnerOrg(env, entry);
  if (!org || org.kind !== "club" || org.state !== "claimed" || ownEvent(org, ev)) return runner;
  if (!carriesEvent(await policyFor(env, org.id), ev)) return runner;
  if (!(await recognises(env, request, org, entry))) return runner;
  return { payer: "club", org: org.id };
}

/**
 * The clubs whose policy carries an event (for the form's hint « pris en charge par votre club »): [{ id, cc, code, name }],
 * every claimed club whose stored policy is not « self ». The server decides for each entry (recognises).
 */
export async function carriersOf(env, ev) {
  try {
    const { results } = await env.DB.prepare(`SELECT o.id, o.cc, o.code, o.name, o.kind, o.state, s.json FROM org_settings s JOIN orgs o ON o.id = s.org_id
      WHERE o.state = 'claimed' AND o.kind = 'club' AND COALESCE(json_extract(s.json, '$.entry_policy.mode'), 'self') != 'self'`).all();
    return results.filter((o) => !ownEvent(o, ev) && carriesEvent(policyOf(j(o.json, {})), ev)).map((o) => ({ id: o.id, cc: o.cc, code: o.code, name: o.name }));
  } catch (e) { return []; }
}
