// POST /api/account/verify { token } — confirms the e-mail address and activates the account.
// If other confirmed accounts claim the same licence, the administrator is alerted; the administrators who
// keep the new-account alert on (admin page) get an e-mail for each new account, and the account its welcome (WELCOME_MAIL).

import { adminEmails, json, readBody } from "../../_lib/api.js";
import { sha256hex } from "../../_lib/crypto.js";
import { sendOrQueue } from "../../_lib/mail.js";
import { duplicateAlert, newUserMail, welcomeMail } from "../../_lib/templates.js";
import { memberships } from "../../_lib/countries.js";
import { confirmPending } from "../../_lib/entries.js";

export async function onRequestPost({ request, env }) {
  const b = await readBody(request);
  if (!b?.token) return json({ error: "bad request" }, 400);
  const hash = await sha256hex(String(b.token));
  const t = await env.DB.prepare("SELECT * FROM tokens WHERE token_hash = ? AND kind = 'verify'").bind(hash).first();
  if (!t || t.used || t.expires_at < Date.now()) return json({ error: "invalid" }, 410);
  const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(t.user_id).first();
  if (!user) return json({ error: "invalid" }, 410);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(user.id),
    env.DB.prepare("UPDATE tokens SET used = 1 WHERE token_hash = ?").bind(hash),
  ]);
  // the entries made with the registration (the entry form's, api/entries guest): entered now (docs/clubs/design.md §3)
  await confirmPending(env, user.id);
  // (an account without France has no licence: nothing to compare)
  const { results } = user.licence
    ? await env.DB.prepare("SELECT * FROM users WHERE licence = ? AND email_verified = 1 ORDER BY id").bind(user.licence).all()
    : { results: [] };
  if (results.length > 1 && env.ALERT_EMAIL) {
    const to = await env.DB.prepare("SELECT lang FROM users WHERE email = ?").bind(env.ALERT_EMAIL).first().catch(() => null);
    await sendOrQueue(env, { to: env.ALERT_EMAIL, ...duplicateAlert(env, user.licence, results, to?.lang), kind: "alert", priority: 1 });
  }
  if (!user.email_verified) {                                          // a confirmed account is announced once
    await signupAlert(env, user);
    // the welcome (owner, 2026-10-21): what the site does, and where to send one's remarks; an account e-mail, not an alert
    // (the right to the alert e-mails does not apply), sent once; off until WELCOME_MAIL is "1"
    if (env.WELCOME_MAIL === "1") {
      try { await sendOrQueue(env, { to: user.email, ...welcomeMail(env, user, { fr: !!user.licence }), kind: "welcome", priority: 0 }); }
      catch (e) { /* the account is confirmed all the same */ }
    }
  }
  return json({ ok: true });
}

/** An e-mail to each administrator who keeps the new-account alert on (their own choice, on the admin page). */
async function signupAlert(env, user) {
  const admins = adminEmails(env).filter((e) => e !== user.email);
  if (!admins.length) return;
  const { results: to } = await env.DB.prepare(
    `SELECT email, lang FROM users WHERE email_verified = 1 AND status = 'active' AND signup_alert = 1
     AND email IN (${admins.map(() => "?").join(", ")})`).bind(...admins).all();
  if (!to.length) return;
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified = 1").first();
  const countries = (await memberships(env, user.id)).map((c) => [c.country, c.club].filter(Boolean).join(" "));
  for (const a of to) await sendOrQueue(env, { to: a.email, ...newUserMail(env, user, total.n, a.lang, countries), kind: "alert", priority: 1 });
}
