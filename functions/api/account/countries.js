// The countries the logged-in account has joined (migration 0014; owner, 2026-10-20).
//   GET                              -> { countries }
//   POST   { country, club, id }     -> join a country, or change one's club or id there; France checks the name + licence
//   DELETE { country }               -> leave it (also POST { country, leave: true }: the site's api() posts)
// POST and DELETE answer the account's view with a fresh session cookie: the session's countries (`cc`) change at once.
// France's membership is the account's licence (users.licence): joining sets it, leaving clears it, and with it everything
// the site reads by licence (one's page, the results alerts, the organiser's rights); relay runners added are dropped.
// `review: true` with France: a licence the index does not know waits for an administrator ('pending', no licence set;
// _lib/licencecheck.js), who is told by e-mail.

import { allow, json, readBody, withUser } from "../../_lib/api.js";
import { accountView, checkMembership, cleanCountry, memberships, saveMembership } from "../../_lib/countries.js";
import { askAdmins, keepNote } from "../../_lib/licencecheck.js";

const plainName = (u) => `${u.first_name} ${u.last_name}`.trim();

async function answer(env, uid) {
  const fresh = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first();
  const view = await accountView(env, fresh);
  return json(view.body, 200, { "Set-Cookie": view.cookie });
}

export const onRequestGet = withUser(async ({ env }, user) => json({ countries: (await memberships(env, user.id)) }));

export const onRequestPost = withUser(async ({ request, env }, user) => {
  const b = await readBody(request);
  if (!b) return json({ error: "bad request" }, 400);
  if (b.leave === true) return leave(env, user, b);
  if (!(await allow(env, `cty:${user.id}`, 12, 3600))) return json({ error: "rate" }, 429);
  const chk = await checkMembership(env, request, b, user.first_name, user.last_name);
  if (!chk.ok) return json({ error: chk.error, ...(chk.reason ? { reason: chk.reason } : {}) }, 422);
  const steps = [saveMembership(env, user.id, chk.row)];
  if (chk.row.country === "FR" && chk.row.status === "ok") {
    steps.push(env.DB.prepare("UPDATE users SET licence = ?, display_name = ? WHERE id = ?").bind(chk.row.member_id, chk.display, user.id));
  } else if (chk.row.country === "FR") {
    // waiting for a check: whatever licence the account held goes until then (another number asked for)
    steps.push(env.DB.prepare("UPDATE users SET licence = '', display_name = ? WHERE id = ?").bind(plainName(user), user.id));
  }
  await env.DB.batch(steps);
  if (chk.row.status === "pending") {
    await keepNote(env, user.id, b.note);
    await askAdmins(env, request, user, chk.row.member_id);
  }
  return answer(env, user.id);
});

export const onRequestDelete = withUser(async ({ request, env }, user) => leave(env, user, await readBody(request)));

async function leave(env, user, b) {
  const cc = cleanCountry(b?.country);
  if (!cc) return json({ error: "bad request" }, 400);
  const steps = [env.DB.prepare("DELETE FROM user_countries WHERE user_id = ? AND country = ?").bind(user.id, cc)];
  if (cc === "FR") {
    steps.push(env.DB.prepare("UPDATE users SET licence = '', display_name = ? WHERE id = ?").bind(plainName(user), user.id));
  }
  await env.DB.batch(steps);
  if (cc === "FR") { try { await env.DB.prepare("DELETE FROM relay_runners WHERE user_id = ?").bind(user.id).run(); } catch (e) { /* no table */ } }
  return answer(env, user.id);
}
