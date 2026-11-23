// POST /api/account/register { email, password, first, last, birthYear, countries: [{ country, club, id }], consent, website, lang, creator (orga before),
//   turnstile } — `licence` alone (the form of before) stands for France.
//
// Every country asked is checked by its policy (_lib/countries.js): France's only if (first name, last name, licence)
// matches a licensee in the FFCO index, as registration always required; a mismatch refuses the whole registration, so
// that one does not end up without the country one meant. Until WORLD_OPEN is "1" France is required (the site's access
// does not follow the countries yet). The account then waits for the e-mail confirmation; it cannot log in before.
// The work itself is _lib/signup.js createAccount, shared with the entry form's registration (api/entries, 2026-11-22).

import { json, readBody } from "../../_lib/api.js";
import { createAccount, sendVerification } from "../../_lib/signup.js";

export { sendVerification };

export async function onRequestPost({ request, env }) {
  const r = await createAccount(env, request, await readBody(request));
  if (r.error) return json({ error: r.error, ...(r.country ? { country: r.country } : {}) }, r.status || 400);
  return json(r.mail ? { ok: true, mail: r.mail } : { ok: true });
}
