// The countries an account joins (D1 user_countries, migration 0014; owner, 2026-10-20: Ozimut open to every orienteer).
// A country is its ISO 3166-1 alpha-2 code (the browser names it in the reader's language with Intl.DisplayNames). Its
// policy says how a membership is accepted:
//   "ffco"  — France: first name + last name + licence against the licensee index (site/auth, as registration always did).
//             The index holds only the licensees with a result in FFCO's rankings: one not found may ask for a check
//             (`review`, owner 2026-11-25: Françoise Py, a licensee who had never run a ranked race) — the membership is then
//             'pending', opens nothing and sets no licence on the account until an administrator accepts it (_lib/licencecheck.js);
//   "open"  — accepted as declared (no federation data here yet: the membership opens nothing but records the club);
//   "manual" — waits for an administrator ('pending'); none yet.
// Only a membership with status 'ok' counts (rights, the session's `cc`); a club typed by the user grants nothing by itself.

import { checkLicensee, cleanLicence, licenseeName, nowIso, publicUser, sessionCookie } from "./api.js";
import { autoShow } from "./modules.js";
import { entCaps } from "./plans.js";

// The IOF's member federations (2026), by ISO code; France first. A code outside this list is refused.
export const COUNTRIES = ["FR",
  "AR", "AT", "AU", "AZ", "BA", "BE", "BG", "BR", "BY", "CA", "CH", "CL", "CN", "CO", "CY", "CZ", "DE", "DK", "EC", "EE",
  "ES", "FI", "GB", "GE", "GR", "HK", "HR", "HU", "IE", "IL", "IN", "IS", "IT", "JP", "KE", "KR", "KZ", "LT", "LU", "LV",
  "MA", "MD", "ME", "MK", "MN", "MT", "MX", "MY", "NL", "NO", "NZ", "PH", "PK", "PL", "PT", "RO", "RS", "RU", "SE", "SG",
  "SI", "SK", "TH", "TN", "TR", "TW", "UA", "US", "UY", "UZ", "VN", "XK", "ZA"];
const KNOWN = new Set(COUNTRIES);

/** policy: how a membership is accepted; idRequired: the member id must be given; idPattern: what it looks like. */
const POLICY = {
  FR: { policy: "ffco", idRequired: true, idPattern: /^\d{1,8}$/ },
};
export const policyOf = (cc) => POLICY[cc] || { policy: "open", idRequired: false, idPattern: /^[\p{L}\p{N} ._\/-]{1,30}$/u };

export const cleanCountry = (c) => String(c || "").trim().toUpperCase();
export const validCountry = (cc) => KNOWN.has(cc);

/**
 * Check one membership as asked: { country, club, id, review } of a person named first + last.
 * -> { ok: true, row: { country, club, member_id, status, checked_at }, display? } (display: the name as FFCO publishes it;
 *    none for a France membership left 'pending' by `review`) or { ok: false, error: "country" | "id" | "mismatch", reason? }
 *    (a France mismatch's reason: "unknown", the licence is in no ranked result since 2010, or "name", it is under another name).
 */
export async function checkMembership(env, request, { country, club, id, review }, first, last) {
  const cc = cleanCountry(country);
  if (!validCountry(cc)) return { ok: false, error: "country" };
  const p = policyOf(cc);
  const mid = cc === "FR" ? cleanLicence(id) : String(id || "").trim().slice(0, 30);
  if ((p.idRequired && !mid) || (mid && !p.idPattern.test(mid))) return { ok: false, error: "id" };
  const row = { country: cc, club: String(club || "").trim().slice(0, 80), member_id: mid, status: "ok", checked_at: null };
  if (p.policy === "ffco") {
    const display = await checkLicensee(env, request, first, last, mid);
    if (!display) {
      if (review === true) return { ok: true, row: { ...row, status: "pending" } };
      return { ok: false, error: "mismatch", reason: (await licenseeName(env, request, mid).catch(() => null)) ? "name" : "unknown" };
    }
    return { ok: true, row: { ...row, checked_at: nowIso() }, display };
  }
  if (p.policy === "manual") row.status = "pending";
  return { ok: true, row };
}

/** Store a checked membership (replacing the account's former one in that country). */
export const saveMembership = (env, uid, row) => env.DB.prepare(
  `INSERT INTO user_countries (user_id, country, club, member_id, status, added_at, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT (user_id, country) DO UPDATE SET club = excluded.club, member_id = excluded.member_id, status = excluded.status,
     checked_at = excluded.checked_at`,
).bind(uid, row.country, row.club, row.member_id, row.status, nowIso(), row.checked_at);

/**
 * An account's memberships in the order they were joined: the first accepted one is the site's default country (owner,
 * 2026-10-20). Without the table (migration not applied): none.
 */
export async function memberships(env, uid) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT country, club, member_id, status, added_at, checked_at FROM user_countries WHERE user_id = ?
       ORDER BY added_at, rowid`).bind(uid).all();
    return results || [];
  } catch (e) { return []; }
}

/** The countries whose data the account may see: its accepted memberships' codes. */
export const acceptedCountries = (rows) => rows.filter((r) => r.status === "ok").map((r) => r.country);

/**
 * The countries a session carries: the accepted memberships; a demo account, which joins none, sees France (the
 * administrator's grant, as before the countries).
 */
export const sessionCountries = (user, rows) => (user.demo_until ? ["FR"] : acceptedCountries(rows));

/** The logged-in view of an account and its fresh session cookie: what login, hand-off and a change of country answer. */
export async function accountView(env, user) {
  user = await autoShow(env, user);            // its existing work shows its creators' modules (_lib/modules.js)
  const rows = await memberships(env, user.id);
  // with its entitlements (_lib/plans.js entCaps), as /api/account/me
  return { body: { ...publicUser(env, user, rows), ...(await entCaps(env, user)) }, cookie: await sessionCookie(env, user, sessionCountries(user, rows)) };
}
