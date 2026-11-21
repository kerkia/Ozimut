// POST /api/account/register { email, password, first, last, birthYear, countries: [{ country, club, id }], consent, website, lang, creator (orga before),
//   turnstile } — `licence` alone (the form of before) stands for France.
//
// Every country asked is checked by its policy (_lib/countries.js): France's only if (first name, last name, licence)
// matches a licensee in the FFCO index, as registration always required; a mismatch refuses the whole registration, so
// that one does not end up without the country one meant. Until WORLD_OPEN is "1" France is required (the site's access
// does not follow the countries yet). The account then waits for the e-mail confirmation; it cannot log in before.

import { allow, cleanEmail, clientIp, json, LANGS, nowIso, pause, readBody, validEmail } from "../../_lib/api.js";
import { checkMembership, cleanCountry, saveMembership } from "../../_lib/countries.js";
import { turnstileOk } from "../../_lib/turnstile.js";
import { hashPassword, newToken, sha256hex } from "../../_lib/crypto.js";
import { sendOrQueue } from "../../_lib/mail.js";
import { verifyMail } from "../../_lib/templates.js";

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

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET || !env.DB) return json({ error: "server not configured" }, 500);
  if (env.REGISTRATION_OPEN !== "1") return json({ error: "closed" }, 503);
  const b = await readBody(request);
  if (!b) return json({ error: "bad request" }, 400);
  if (b.website) return json({ ok: true });                              // honeypot: bots fill every field
  if (!(await allow(env, `reg:${clientIp(request)}`, 8, 3600))) return json({ error: "rate" }, 429);
  if (!(await turnstileOk(env, b.turnstile, clientIp(request)))) return json({ error: "robot" }, 422);

  const email = cleanEmail(b.email);
  const first = String(b.first || "").trim().slice(0, 60), last = String(b.last || "").trim().slice(0, 60);
  const asked = Array.isArray(b.countries) ? b.countries.slice(0, 10) : b.licence ? [{ country: "FR", id: b.licence }] : [];
  const password = String(b.password || "");
  if (!validEmail(email)) return json({ error: "email" }, 422);
  if (password.length < 6 || password.length > 200 || password.toLowerCase() === email) return json({ error: "password" }, 422);
  if (!first || !last) return json({ error: "fields" }, 422);
  if (new Set(asked.map((c) => cleanCountry(c?.country))).size !== asked.length) return json({ error: "country" }, 422);
  if (env.WORLD_OPEN !== "1" && !asked.some((c) => cleanCountry(c?.country) === "FR")) return json({ error: "fields" }, 422);
  if (b.consent !== true) return json({ error: "consent" }, 422);
  // the year of birth (docs/track/design.md, « The registration rule »): asked by the form; with TRACK_OPEN "1" nobody under 15
  // registers alone — a parent creates a child account (« Famille »)
  const year = new Date().getUTCFullYear(), birth = Number(b.birthYear) || null;
  if (birth != null && (!Number.isInteger(birth) || birth < year - 110 || birth > year)) return json({ error: "birthYear" }, 422);
  if (env.TRACK_OPEN === "1" && (birth == null || year - birth < 15)) return json({ error: birth == null ? "birthYear" : "under15" }, 422);

  const rows = [];
  let display = `${first} ${last}`, licence = "";
  for (const c of asked) {
    const chk = await checkMembership(env, request, c || {}, first, last);
    if (!chk.ok) {
      if (chk.error === "mismatch") await pause(600);
      return json({ error: chk.error, country: cleanCountry(c?.country) }, 422);
    }
    rows.push(chk.row);
    if (chk.row.country === "FR") { display = chk.display; licence = chk.row.member_id; }
  }

  const existing = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (existing?.email_verified) return json({ error: "email_taken" }, 409);
  if (existing) {                                                         // never confirmed: just resend the link
    if (await allow(env, `resend:${email}`, 3, 3600)) await sendVerification(env, existing);
    return json({ ok: true });
  }
  const pw = await hashPassword(password, env);
  const row = await env.DB.prepare(
    `INSERT INTO users (email, pw_hash, pw_salt, pw_iter, first_name, last_name, licence, display_name, consent_at, created_at, lang)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(email, pw.hash, pw.salt, pw.iter, first, last, licence, display, nowIso(), nowIso(), LANGS.includes(b.lang) ? b.lang : "fr").first();
  if (rows.length) await env.DB.batch(rows.map((r) => saveMembership(env, row.id, r)));
  // « J'organise des courses ou je fais des cartes » (one optional box, owner 2026-11-12): the creators' modules, Orga and
  // Carto (migrations 0016, 0027; `orga` the form of before). A new account has no work to look at (_lib/modules.js autoShow).
  // under 15 (possible only while TRACK_OPEN is "0"): the account waits for a parent to be attached (« Suivi GPS »)
  if (birth) { try { await env.DB.prepare("UPDATE users SET birth_year = ?, guardian_wanted = ? WHERE id = ?").bind(birth, year - birth < 15 ? 1 : 0, row.id).run(); } catch (e) { /* before 0029 */ } }
  const creator = b.creator === true || b.orga === true;
  try { await env.DB.prepare(`UPDATE users SET modules_checked = 1${creator ? ", orga = 1, carto = 1" : ""} WHERE id = ?`).bind(row.id).run(); }
  catch (e) { if (creator) { try { await env.DB.prepare("UPDATE users SET orga = 1 WHERE id = ?").bind(row.id).run(); } catch (e2) { /* no column yet */ } } }
  const mail = await sendVerification(env, row);
  return json({ ok: true, mail });
}
