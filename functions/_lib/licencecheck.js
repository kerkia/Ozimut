// France memberships an administrator checks (owner, 2026-11-25: Françoise Py, a licensee who had never run a ranked race,
// could not register). The licensee index (site/auth) holds only the licensees with a result in FFCO's rankings; one it does
// not know may ask for a check (`review` in registration and Réglages › Mes pays, _lib/countries.js checkMembership): their
// France membership is 'pending' — it opens nothing (only 'ok' memberships count) and sets no licence on the account — until
// an administrator accepts it (status 'ok', users.licence set) or refuses it ('refused'; the person may ask again with
// another number). The administrators are told by e-mail when the request is made (the account confirmed, for a
// registration), the person when it is decided. The person may add a word for the administrators (`note`, 1 000 characters:
// « I have never raced a ranked race », a new licence…), kept in R2 `licencecheck/<account>.json` until the decision — no D1
// column needed — and sent with their e-mail.

import { adminEmails, licenseeName, nowIso } from "./api.js";
import { sendOrQueue } from "./mail.js";
import { licenceCheckMail, licenceDecisionMail } from "./templates.js";

const noteKey = (uid) => `licencecheck/${uid}.json`;
/** Keep (or, empty, drop) the person's word to the administrators. Never throws. */
export async function keepNote(env, uid, note) {
  const text = String(note || "").replace(/\r\n?/g, "\n").trim().slice(0, 1000);
  try {
    if (!env.BUCKET) return;
    if (text) await env.BUCKET.put(noteKey(uid), JSON.stringify({ note: text, at: nowIso() }), { httpMetadata: { contentType: "application/json" } });
    else await env.BUCKET.delete(noteKey(uid));
  } catch (e) { /* the request stands without it */ }
}
/** The person's word, or "". */
export async function readNote(env, uid) {
  try { const o = env.BUCKET && await env.BUCKET.get(noteKey(uid)); return o ? String((await o.json()).note || "") : ""; }
  catch (e) { return ""; }
}
export const dropNote = (env, uid) => (env.BUCKET ? env.BUCKET.delete(noteKey(uid)).catch(() => {}) : Promise.resolve());

/** E-mail every active administrator: `user` waits for the check of France licence `licence`. Never throws. */
export async function askAdmins(env, request, user, licence) {
  try {
    const admins = adminEmails(env).filter((e) => e !== user.email);
    if (!admins.length) return;
    const { results: to } = await env.DB.prepare(
      `SELECT email, lang FROM users WHERE email_verified = 1 AND status = 'active' AND email IN (${admins.map(() => "?").join(", ")})`)
      .bind(...admins).all();
    const known = await licenseeName(env, request, licence).catch(() => null), note = await readNote(env, user.id);
    for (const a of to) await sendOrQueue(env, { to: a.email, ...licenceCheckMail(env, user, licence, known, a.lang, note), kind: "alert", priority: 1 });
  } catch (e) { /* the request is kept all the same: the admin page lists it */ }
}

/** The France memberships waiting for a check, with their accounts and what the index says of each licence. */
export async function pendingList(env, request) {
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.email_verified, u.created_at, c.member_id, c.club, c.added_at
     FROM user_countries c JOIN users u ON u.id = c.user_id
     WHERE c.country = 'FR' AND c.status = 'pending' AND u.status = 'active' ORDER BY c.added_at`).all();
  const out = [];
  for (const r of results || []) {
    const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE licence = ? AND id <> ? AND email_verified = 1")
      .bind(r.member_id, r.id).first();
    out.push({ id: r.id, first: r.first_name, last: r.last_name, email: r.email, verified: !!r.email_verified,
      created: r.created_at, asked: r.added_at, licence: r.member_id, club: r.club,
      known: await licenseeName(env, request, r.member_id).catch(() => null), taken: others?.n || 0, note: await readNote(env, r.id) });
  }
  return out;
}

/**
 * An administrator's decision on account `uid`'s pending France membership. -> { ok: true } or { error, status }.
 * Accepted: the membership 'ok', the licence and FFCO's display name (else « NOM Prénom ») on the account.
 */
export async function decide(env, request, uid, accept) {
  const row = await env.DB.prepare(
    "SELECT member_id FROM user_countries WHERE user_id = ? AND country = 'FR' AND status = 'pending'").bind(uid).first();
  if (!row) return { error: "not found", status: 404 };
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first();
  if (!user) return { error: "not found", status: 404 };
  const steps = [env.DB.prepare("UPDATE user_countries SET status = ?, checked_at = ? WHERE user_id = ? AND country = 'FR'")
    .bind(accept ? "ok" : "refused", nowIso(), uid)];
  if (accept) {
    const display = (await licenseeName(env, request, row.member_id).catch(() => null))
      || `${String(user.last_name).toUpperCase()} ${user.first_name}`.trim();
    steps.push(env.DB.prepare("UPDATE users SET licence = ?, display_name = ? WHERE id = ?").bind(row.member_id, display, uid));
  }
  await env.DB.batch(steps);
  await dropNote(env, uid);
  // the account's sessions take the change at their next hourly check (_middleware.js), or at once by Réglages
  if (user.email_verified) {
    try { await sendOrQueue(env, { to: user.email, ...licenceDecisionMail(env, user, row.member_id, accept), kind: "account", priority: 1 }); }
    catch (e) { /* decided all the same */ }
  }
  return { ok: true };
}
