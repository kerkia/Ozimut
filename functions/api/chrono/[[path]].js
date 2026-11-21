// /api/chrono/<event>/… — Ozimut Chrono's cloud side (owner, 2026-11-17; administrators only while it is being tried):
// the copy of a timed race's operations, so that another computer can take the race over and nothing is lost if the
// timing computer dies. R2 only (no D1 table): `chrono/<event>/meta.json` (what is held of each station, the batches) and
// `chrono/<event>/b/<key>.json` (batches of operations, appended as they come). github.com/kerkia/ChronOzimut docs/design.md.
//   POST …/sync   { station, have: { station: n }, ops: […] } → { ops (what the caller lacks), have, more }
//   POST …/token  → { token }: a key for the event's stations that are not signed in (the desktop app, a phone); it is
//                 an HMAC of the event's id, so nothing is stored, and it only opens this event's sync and live
//   POST …/live   { name, date, club, race, live } → { id }: the lists in liveresultat's compact form, passed on to the
//                 event's broadcast on « En direct » (opened at the first call, as « Orga › Direct » would)
//   GET  …        → { have, ops (count), updated }
// Who: an administrator's session, or the event's token in `X-Chrono-Token` (CORS open for it: the app's page is served
// from the hub's own address). The operations hold the entries of a race — names, clubs, licence and card numbers, start
// times, punches: nothing here is public, and the event's team alone should reach it once it opens beyond administrators.

import { currentUser, isAdmin, json, readBody, allow } from "../../_lib/api.js";
import { broadcasts, liveDir, newMopKey } from "../../_lib/live.js";

const EV = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_OPS = 2000, MAX_BODY = 4 * 1024 * 1024, READS = 30, SMALL = 250;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Chrono-Token", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const out = (body, status = 200) => json(body, status, CORS);

async function tokenOf(env, ev) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${env.SESSION_SECRET}|chrono`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ev)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 40);
}
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

/** Who asks: `{ user }` (an administrator's session), `{ token: true }`, or null. */
async function who(request, env, ev) {
  const tok = request.headers.get("X-Chrono-Token");
  if (tok) return env.SESSION_SECRET && same(tok, await tokenOf(env, ev)) ? { token: true } : null;
  if (!env.DB) return null;
  const user = await currentUser(request, env);
  return user && isAdmin(env, user) ? { user } : null;
}

const metaKey = (ev) => `chrono/${ev}/meta.json`;
async function readMeta(env, ev) {
  const o = await env.BUCKET.get(metaKey(ev));
  if (!o) return { meta: { have: {}, batches: [], n: 0 }, etag: null };
  return { meta: await o.json(), etag: o.etag };
}
async function writeMeta(env, ev, meta, etag) {
  const body = JSON.stringify({ ...meta, updated: Date.now() });
  // only if nobody wrote meanwhile: a station's sync and another's may arrive together
  const r = await env.BUCKET.put(metaKey(ev), body, { httpMetadata: { contentType: "application/json" }, onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" } });
  return !!r;
}
const okOp = (o) => o && typeof o === "object" && typeof o.s === "string" && /^[\w-]{1,40}$/.test(o.s) && Number.isInteger(o.n) && o.n > 0 && Number.isFinite(o.t) && typeof o.k === "string" && o.k.length <= 12;

async function sync(env, ev, body, by) {
  const ops = Array.isArray(body?.ops) ? body.ops.filter(okOp).slice(0, MAX_OPS) : [];
  const theirs = body?.have && typeof body.have === "object" ? body.have : {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const { meta, etag } = await readMeta(env, ev);
    // taken: each station's operations in sequence, nothing beyond a gap (it will come again once the gap is filled)
    const have = { ...meta.have }, fresh = [];
    for (const o of [...ops].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : a.n - b.n))) if (o.n === (have[o.s] || 0) + 1) { have[o.s] = o.n; fresh.push(o); }
    let batches = meta.batches, drop = null, made = null;
    if (fresh.length) {
      const last = batches[batches.length - 1];
      let all = fresh;
      if (last && last.n < SMALL) {                         // a small last batch is rewritten with the new operations, under a new key
        const o = await env.BUCKET.get(`chrono/${ev}/b/${last.k}.json`);
        if (o) { all = (await o.json()).concat(fresh); drop = last.k; batches = batches.slice(0, -1); }
      }
      const r = {};
      for (const o of all) { const x = r[o.s] || (r[o.s] = [o.n, o.n]); if (o.n < x[0]) x[0] = o.n; if (o.n > x[1]) x[1] = o.n; }
      made = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      await env.BUCKET.put(`chrono/${ev}/b/${made}.json`, JSON.stringify(all), { httpMetadata: { contentType: "application/json" } });
      batches = batches.concat([{ k: made, n: all.length, r }]);
      const next = { ...meta, have, batches, n: (meta.n || 0) + fresh.length, owner: meta.owner || by || null };
      if (!(await writeMeta(env, ev, next, etag))) { await env.BUCKET.delete(`chrono/${ev}/b/${made}.json`); continue; }
      if (drop) await env.BUCKET.delete(`chrono/${ev}/b/${drop}.json`);
    }
    // given back: what the caller lacks, a few batches a call
    const need = batches.filter((b) => Object.entries(b.r).some(([s, [, max]]) => max > (theirs[s] || 0)) && b.k !== made);
    const give = [];
    for (const b of need.slice(0, READS)) {
      const o = await env.BUCKET.get(`chrono/${ev}/b/${b.k}.json`);
      if (o) for (const op of await o.json()) if (op.n > (theirs[op.s] || 0)) give.push(op);
    }
    return { ops: give, have, more: need.length > READS };
  }
  return null;
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
  if (act === "sync") { const r = await sync(env, ev, body, asker.user?.id); return r ? out(r) : out({ error: "busy" }, 503); }
  if (act === "live") return live(env, ev, body, asker, waitUntil);
  return out({ error: "unknown" }, 404);
}
