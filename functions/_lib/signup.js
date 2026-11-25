// An account created: what POST /api/account/register does, shared with the entry form's registration blended with the entry
// (POST /api/entries/<event>/guest, docs/clubs/design.md §3; owner, 2026-11-22) — the honeypot, the rate limit by address,
// Cloudflare Turnstile, the fields, the countries checked by their policy (_lib/countries.js: France's licence against the FFCO
// index), the year of birth's rule, then the e-mail confirmation. The account cannot log in before its e-mail is confirmed.

import { allow, cleanEmail, clientIp, LANGS, nowIso, pause, validEmail } from "./api.js";
import { checkMembership, cleanCountry, saveMembership } from "./countries.js";
import { keepNote } from "./licencecheck.js";
import { turnstileOk } from "./turnstile.js";
import { hashPassword, newToken, sha256hex } from "./crypto.js";
import { sendOrQueue } from "./mail.js";
import { verifyMail } from "./templates.js";

const DAY = 86400e3;

/**
 * A fresh e-mail confirmation link for `user`; returns "sent" | "queued". The link is valid for 24 h from the
 * moment the e-mail is sent (the mailer resets the expiry then), and replaces an older one still waiting.
 */
export async function sendVerification(env, user) {
  const token = newToken(), hash = await sha256hex(token);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tokens WHERE user_id = ? AND kind = 'verify'").bind(user.id),
    env.DB.prepare("DELETE FROM mail_queue WHERE to_email = ? AND kind = 'verify'").bind(user.email),
    env.DB.prepare("INSERT INTO tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, 'verify', ?)")
      .bind(hash, user.id, Date.now() + DAY),
  ]);
  return sendOrQueue(env, { to: user.email, ...verifyMail(env, token, user.first_name, user.lang), kind: "verify", priority: 1,
    token: { hash, ttl: DAY } });
}

/**
 * Creates an account from a registration's body `b` ({ email, password, first, last, birthYear, countries, consent, website,
 * lang, creator, turnstile }; `licence` alone stands for France). -> { ok: true, user, mail } (a new account, waiting for its
 * confirmation), { ok: true, bot: true } (the honeypot: nothing made), { ok: true, resent: true, user } (an address never
 * confirmed: its link sent again), or { error, status, country? }.
 */
export async function createAccount(env, request, b) {
  if (!env.SESSION_SECRET || !env.DB) return { error: "server not configured", status: 500 };
  if (env.REGISTRATION_OPEN !== "1") return { error: "closed", status: 503 };
  if (!b) return { error: "bad request", status: 400 };
  if (b.website) return { ok: true, bot: true };                         // honeypot: bots fill every field
  if (!(await allow(env, `reg:${clientIp(request)}`, 8, 3600))) return { error: "rate", status: 429 };
  if (!(await turnstileOk(env, b.turnstile, clientIp(request)))) return { error: "robot", status: 422 };

  const email = cleanEmail(b.email);
  const first = String(b.first || "").trim().slice(0, 60), last = String(b.last || "").trim().slice(0, 60);
  const asked = Array.isArray(b.countries) ? b.countries.slice(0, 10) : b.licence ? [{ country: "FR", id: b.licence }] : [];
  const password = String(b.password || "");
  if (!validEmail(email)) return { error: "email", status: 422 };
  if (password.length < 6 || password.length > 200 || password.toLowerCase() === email) return { error: "password", status: 422 };
  if (!first || !last) return { error: "fields", status: 422 };
  if (new Set(asked.map((c) => cleanCountry(c?.country))).size !== asked.length) return { error: "country", status: 422 };
  if (env.WORLD_OPEN !== "1" && !asked.some((c) => cleanCountry(c?.country) === "FR")) return { error: "fields", status: 422 };
  if (b.consent !== true) return { error: "consent", status: 422 };
  // the year of birth (docs/track/design.md, « The registration rule »): asked by the form; with TRACK_OPEN "1" nobody under 15
  // registers alone — a parent creates a child account (« Famille », or the entry form's « Ajouter un enfant »)
  const year = new Date().getUTCFullYear(), birth = Number(b.birthYear) || null;
  if (birth != null && (!Number.isInteger(birth) || birth < year - 110 || birth > year)) return { error: "birthYear", status: 422 };
  if (env.TRACK_OPEN === "1" && (birth == null || year - birth < 15)) return { error: birth == null ? "birthYear" : "under15", status: 422 };

  const rows = [];
  let display = `${first} ${last}`, licence = "";
  for (const c of asked) {
    // `review` (the form's « Mes informations sont exactes ») : a France licence the index does not know waits for an
    // administrator instead of refusing the registration; the account has no licence until then (_lib/licencecheck.js)
    const chk = await checkMembership(env, request, { ...(c || {}), review: b.review === true }, first, last);
    if (!chk.ok) {
      if (chk.error === "mismatch") await pause(600);
      return { error: chk.error, status: 422, country: cleanCountry(c?.country), ...(chk.reason ? { reason: chk.reason } : {}) };
    }
    rows.push(chk.row);
    if (chk.row.country === "FR" && chk.row.status === "ok") { display = chk.display; licence = chk.row.member_id; }
  }

  const existing = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (existing?.email_verified) return { error: "email_taken", status: 409 };
  if (existing) {                                                         // never confirmed: just resend the link
    if (await allow(env, `resend:${email}`, 3, 3600)) await sendVerification(env, existing);
    return { ok: true, resent: true, user: existing };
  }
  const pw = await hashPassword(password, env);
  const row = await env.DB.prepare(
    `INSERT INTO users (email, pw_hash, pw_salt, pw_iter, first_name, last_name, licence, display_name, consent_at, created_at, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(email, pw.hash, pw.salt, pw.iter, first, last, licence, display, nowIso(), nowIso(), LANGS.includes(b.lang) ? b.lang : "fr").first();
  if (rows.length) await env.DB.batch(rows.map((r) => saveMembership(env, row.id, r)));
  // the person's word to the administrators who will check the licence (sent with their e-mail at the confirmation)
  const pending = rows.some((r) => r.country === "FR" && r.status === "pending");
  if (pending) await keepNote(env, row.id, b.note);
  // « J'organise des courses ou je fais des cartes » (one optional box, owner 2026-11-12): the creators' modules, Orga and
  // Carto (migrations 0016, 0027; `orga` the form of before). A new account has no work to look at (_lib/modules.js autoShow).
  // under 15 (possible only while TRACK_OPEN is "0"): the account waits for a parent to be attached (« Suivi GPS »)
  if (birth) { try { await env.DB.prepare("UPDATE users SET birth_year = ?, guardian_wanted = ? WHERE id = ?").bind(birth, year - birth < 15 ? 1 : 0, row.id).run(); } catch (e) { /* before 0029 */ } }
  const creator = b.creator === true || b.orga === true;
  try { await env.DB.prepare(`UPDATE users SET modules_checked = 1${creator ? ", orga = 1, carto = 1" : ""} WHERE id = ?`).bind(row.id).run(); }
  catch (e) { if (creator) { try { await env.DB.prepare("UPDATE users SET orga = 1 WHERE id = ?").bind(row.id).run(); } catch (e2) { /* no column yet */ } } }
  const mail = await sendVerification(env, row);
  return { ok: true, user: { ...row, birth_year: birth }, mail, ...(pending ? { pending: true } : {}) };
}
