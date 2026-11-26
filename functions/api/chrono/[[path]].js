// /api/chrono/<event>/… — Chronoz's cloud side (owner, 2026-11-17; administrators only while it is being tried):
// the copy of a timed race's operations, so that another computer can take the race over and nothing is lost if the
// timing computer dies. R2 only (no D1 table): `chrono/<event>/meta.json` (what is held of each station, the batches) and
// `chrono/<event>/b/<key>.json` (batches of operations, appended as they come). github.com/kerkia/Chronoz docs/design.md.
//   POST …/sync   { station, have: { station: n }, ops: […] } → { ops (what the caller lacks), have, more }
//   POST …/token  → { token }: a key for the event's stations that are not signed in (the desktop app, a phone); it is
//                 an HMAC of the event's id, so nothing is stored, and it only opens this event's sync and live
//   POST …/live   { name, date, club, race, live } → { id }: the lists in liveresultat's compact form, passed on to the
//                 event's broadcast on « En direct » (opened at the first call, as « Orga › Direct » would)
//   GET  …        → { have, ops (count), updated }
// Who: an administrator's session, or the event's token in `X-Chrono-Token` (CORS open for it: the app's page is served
// from the hub's own address). The operations hold the entries of a race — names, clubs, licence and card numbers, start
// times, punches: nothing here is public. An Orga event's log (« e<event id> ») also opens to the event's team (docs/clubs/
// design.md §5), whose entries the server station `ozimut` writes to it and reads the desk back from (_lib/entrychrono.js).

import { currentUser, isAdmin, json, readBody, allow } from "../../_lib/api.js";
import { broadcasts, liveDir, newMopKey } from "../../_lib/live.js";
import { readMeta, writeMeta, sync } from "../../_lib/chronolog.js";
import { loadEvent, teamMay } from "../../_lib/entries.js";
import { fromChrono } from "../../_lib/entrychrono.js";

const EV = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 4 * 1024 * 1024;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Chrono-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const out = (body, status = 200) => json(body, status, CORS);

async function tokenOf(env, ev) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${env.SESSION_SECRET}|chrono`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ev)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 40);
}
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

/** An Orga event's log (« e<event id> », pages/chrono.js): the event's id. */
const orgaEvent = (ev) => (/^e[a-z0-9]{6,20}$/.test(ev) ? ev.slice(1) : null);

/** Who asks: `{ user }` (an administrator's session, or one of the Orga event's team), `{ token: true }`, or null. */
async function who(request, env, ev) {
  const tok = request.headers.get("X-Chrono-Token");
  if (tok) return env.SESSION_SECRET && same(tok, await tokenOf(env, ev)) ? { token: true } : null;
  if (!env.DB) return null;
  const user = await currentUser(request, env);
  if (!user) return null;
  if (isAdmin(env, user)) return { user };
  // the event's team (docs/clubs/design.md §5): its members, or the organisers of the competition it holds
  const id = orgaEvent(ev);
  if (!id) return null;
  try {
    const e = await loadEvent(env, id);
    return e && (await teamMay(env, request, user, e)) ? { user } : null;
  } catch (e) { return null; }
}

async function live(env, ev, body, asker, waitUntil) {
  if (!env.LIVE_RACE || !env.LIVE_DIR) return out({ error: "live server not bound" }, 500);
  const text = JSON.stringify(body?.live || {});
  if (text.length > 3 * 1024 * 1024) return out({ error: "too large" }, 413);
  let { meta, etag } = await readMeta(env, ev);
  if (!meta.bc) {
    const name = String(body?.name || "").replace(/\s+/g, " ").trim().slice(0, 160), date = String(body?.date || "");
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return out({ error: "name and date required" }, 400);
    const by = asker.user?.id || meta.owner || 0;
    const race = /^[a-z][a-z0-9-]{1,40}$/.test(String(body?.race || "")) ? String(body.race) : null;
    const r = await liveDir(env).fetch("https://ocn-live/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "new", name, date, organizer: String(body?.club || "").trim().slice(0, 160), key: `chrono-${ev}`.slice(0, 40), mop: newMopKey(), by, race }) });
    const made = await r.json().catch(() => ({}));
    if (!r.ok || !made.id) return out({ error: made.error || "no broadcast" }, 502);
    meta = { ...meta, bc: made.id, race };
    if (!(await writeMeta(env, ev, meta, etag))) { const again = await readMeta(env, ev); await writeMeta(env, ev, { ...again.meta, bc: made.id, race }, again.etag); }
  }
  const id = String(meta.bc);
  const r = await env.LIVE_RACE.get(env.LIVE_RACE.idFromName(id)).fetch(`https://ocn-live/push?comp=${id}`, { method: "POST",
    headers: { "Content-Type": "application/json", "X-Race": meta.race || "" }, body: text });
  if (r.ok) waitUntil(liveDir(env).fetch("https://ocn-live/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "touch", id: Number(id) }) }).catch(() => {}));
  return out({ ok: r.ok, id: Number(id) }, r.ok ? 200 : 502);
}

export async function onRequest({ request, env, params, waitUntil }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.BUCKET) return out({ error: "server not configured" }, 500);
  const [ev, act] = Array.isArray(params.path) ? params.path : [params.path];
  if (!EV.test(ev || "")) return out({ error: "bad event" }, 400);
  const asker = await who(request, env, ev);
  if (!asker) return out({ error: "login required" }, 401);
  if (request.method === "GET" && !act) {
    const { meta } = await readMeta(env, ev);
    return out({ have: meta.have, ops: meta.n || 0, updated: meta.updated || null, live: meta.bc || null });
  }
  if (request.method !== "POST") return out({ error: "method" }, 405);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return out({ error: "too large" }, 413);
  if (env.DB && !(await allow(env, `chrono:${ev}`, 3000, 3600))) return out({ error: "too many requests" }, 429);
  const body = await readBody(request);
  if (act === "token") return asker.user ? out({ token: await tokenOf(env, ev) }) : out({ error: "forbidden" }, 403);
  if (act === "sync") {
    // the server station `ozimut` is Ozimut's own (_lib/entrychrono.js): what a station sends of it is held already
    if (Array.isArray(body?.ops)) body.ops = body.ops.filter((o) => o?.s !== "ozimut");
    const r = await sync(env, ev, body, asker.user?.id);
    if (!r) return out({ error: "busy" }, 503);
    // a station's operations taken: those of the desk read back into the event's entries (_lib/entrychrono.js), after the answer
    const id = orgaEvent(ev);
    if (id && r.stored && env.DB) waitUntil(fromChrono(env, id).catch(() => {}));
    const { stored, ...answer } = r;
    return out(answer);
  }
  if (act === "live") return live(env, ev, body, asker, waitUntil);
  return out({ error: "unknown" }, 404);
}
