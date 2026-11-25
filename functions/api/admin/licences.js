// The France licences waiting for an administrator's check (_lib/licencecheck.js; owner, 2026-11-25).
//   GET                      -> { pending: [{ id, first, last, email, verified, created, asked, licence, club, known, taken, note }] }
//                               (note: the person's word; known: the name the licensee index gives that licence, or null; taken: other confirmed
//                               accounts holding it)
//   POST { id, ok: bool }   -> accept (the account gets the licence and France's access) or refuse; the person is told
import { json, readBody, withUser } from "../../_lib/api.js";
import { decide, pendingList } from "../../_lib/licencecheck.js";

export const onRequestGet = withUser(async ({ request, env }) => {
  try { return json({ pending: await pendingList(env, request) }); }
  catch (e) { return json({ pending: [] }); }                // before migration 0014: nothing to check
}, { admin: true });

export const onRequestPost = withUser(async ({ request, env }) => {
  const b = await readBody(request);
  const id = Number(b?.id);
  if (!Number.isInteger(id) || typeof b?.ok !== "boolean") return json({ error: "bad request" }, 400);
  const r = await decide(env, request, id, b.ok);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status || 400);
}, { admin: true });
