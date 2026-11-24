// /api/admin/maplib — the administrators' map collection and « Mes cartes »' use (owner, 2026-11-06; _lib/maplib.js says
// what the collection holds). Administrators only.
//
//   GET  /api/admin/maplib                  (first moves up to 30 solo analyses still in /api/solo into their accounts' libraries)
//   GET  /api/admin/maplib                  { collection: [{ etag, size, type, thumb, view, meta }], gone, library: [a map of an
//                                           account's « Mes cartes » + uid, runs], people: { uid: { name, email, club } } }
//   GET  /api/admin/maplib?usage=1          « Mes cartes »' use: { users: [{ uid, name, email, maps, runs, bytes, updated }],
//                                           limit (bytes), collection: { count, bytes, gone } }
//   POST /api/admin/maplib                  { op: "sync", budget? } -> { copied, left, gone } (a step: called until left is 0)
//   GET  /api/admin/maplib/c/<etag>/map | thumb | view   a map of the collection;  PUT …/thumb | view  (the browser's)
//   GET  /api/admin/maplib/u/<map>/map | thumb | view    a map of an account's library;  PUT …/thumb | view
import { json, withUser } from "../../../_lib/api.js";
import { clubLabel } from "../../../_lib/club.js";
import { keys, listAll, syncStep, PFX } from "../../../_lib/maplib.js";
import { key as mmKey, getOrig, quota } from "../../../_lib/mymaps.js";
import { moveAllSolo } from "../../mymaps/[[path]].js";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = { thumb: 600 * 1024, view: 6 * 1024 * 1024 };
const ETAG = /^[0-9a-f]{32}(-\d+)?$/, ID = /^[a-z2-9]{8,40}$/;
const tail = (k) => k.slice(k.lastIndexOf("/") + 1);
const nameOf = (u) => `${String(u.first_name || "").trim()} ${String(u.last_name || "").trim()}`.trim() || u.display_name || "";

async function serve(obj) {
  if (!obj) return json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
}
async function put(env, request, k, part) {
  const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!TYPES.includes(type)) return json({ error: "type" }, 415);
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX[part]) return json({ error: "size" }, 413);
  await env.BUCKET.put(k, buf, { httpMetadata: { contentType: type } });
  return json({ ok: true });
}

export const onRequest = withUser(async ({ request, env, params }) => {
  if (!env.BUCKET) return json({ error: "server not configured" }, 500);
  const parts = [].concat(params.path || []).map(String), method = request.method;
  try {
    // a map of the collection
    if (parts[0] === "c" && ETAG.test(parts[1] || "") && ["map", "thumb", "view"].includes(parts[2]) && parts.length === 3) {
      const k = keys[parts[2]](parts[1]);
      if (method === "GET") return serve(await env.BUCKET.get(k));
      if (method === "PUT" && parts[2] !== "map") return put(env, request, k, parts[2]);
      return json({ error: "method" }, 405);
    }
    // a map of an account's library
    if (parts[0] === "u" && ID.test(parts[1] || "") && ["map", "thumb", "view"].includes(parts[2]) && parts.length === 3) {
      const m = await env.DB.prepare("SELECT id, user_id FROM mymaps WHERE id = ?").bind(parts[1]).first();
      if (!m) return json({ error: "not found" }, 404);
      if (method === "GET") return serve(parts[2] === "map" ? await getOrig(env, m.user_id, m.id) : await env.BUCKET.get(mmKey(m.user_id, m.id, parts[2])));
      if (method === "PUT" && parts[2] !== "map") return put(env, request, mmKey(m.user_id, m.id, parts[2]), parts[2]);
      return json({ error: "method" }, 405);
    }
    if (parts.length) return json({ error: "not found" }, 404);

    if (method === "POST") {
      const b = await request.json().catch(() => null);
      if (b?.op !== "sync") return json({ error: "fields" }, 400);
      return json(await syncStep(env, request, { budget: Math.min(8, Math.max(1, Number(b.budget) || 4)) }));
    }
    if (method !== "GET") return json({ error: "method" }, 405);
    const url = new URL(request.url);

    if (url.searchParams.get("usage")) {
      const [maps, runs, users] = await env.DB.batch([
        env.DB.prepare("SELECT user_id, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b, MAX(updated_at) AS u FROM mymaps GROUP BY user_id"),
        env.DB.prepare("SELECT user_id, COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM mymap_runs GROUP BY user_id"),
        env.DB.prepare("SELECT id, first_name, last_name, display_name, email FROM users WHERE id IN (SELECT DISTINCT user_id FROM mymaps)"),
      ]);
      const R = new Map(runs.results.map((r) => [r.user_id, r])), U = new Map(users.results.map((u) => [u.id, u]));
      const held = await listAll(env, `${PFX}m/`, false), gone = await listAll(env, `${PFX}x/`, false), extra = await listAll(env, `${PFX}t/`, false);
      const views = await listAll(env, `${PFX}v/`, false);
      return json({ limit: quota(env),
        users: maps.results.map((m) => ({ uid: m.user_id, name: U.has(m.user_id) ? nameOf(U.get(m.user_id)) : "", email: U.get(m.user_id)?.email || "",
          maps: m.n, runs: R.get(m.user_id)?.n || 0, bytes: m.b + (R.get(m.user_id)?.b || 0), updated: m.u })).sort((a, b) => b.bytes - a.bytes),
        collection: { count: held.length, bytes: [...held, ...extra, ...views].reduce((s, o) => s + o.size, 0), gone: gone.length } });
    }

    // every account's solo analyses still kept apart moved into its library first, so that the view shows them (2026-11-24)
    await moveAllSolo(env, 30).catch((e) => console.error("solo sweep", e));
    const [held, thumbs, views, gone] = await Promise.all([listAll(env, `${PFX}m/`), listAll(env, `${PFX}t/`, false), listAll(env, `${PFX}v/`, false), listAll(env, `${PFX}x/`, false)]);
    const T = new Set(thumbs.map((o) => tail(o.key))), V = new Set(views.map((o) => tail(o.key)));
    const collection = held.map((o) => ({ etag: tail(o.key), size: o.size, type: o.httpMetadata?.contentType || "", thumb: T.has(tail(o.key)), view: V.has(tail(o.key)), meta: o.customMetadata || {} }));
    const [maps, runs] = await env.DB.batch([env.DB.prepare("SELECT * FROM mymaps ORDER BY created_at DESC"),
      env.DB.prepare("SELECT map_id, COUNT(*) AS n FROM mymap_runs GROUP BY map_id")]);
    const nRuns = new Map(runs.results.map((r) => [r.map_id, r.n]));
    // a map its owner marked « Carte privée » is not shown (migration 0025)
    const library = maps.results.filter((m) => !m.private).map((m) => ({ id: m.id, uid: m.user_id, title: m.title, day: m.day, place: m.place, notes: m.notes, country: m.country || "", region: m.region || "",
      dept: m.dept || "", lat: m.lat, lon: m.lon, w: m.w, h: m.h, bytes: m.bytes, thumb: !!m.thumb, runs: nRuns.get(m.id) || 0, created: m.created_at }));
    // who: the accounts behind the libraries and the collection's maps, with their club (France's licensees)
    const uids = [...new Set([...library.map((m) => m.uid), ...collection.map((c) => Number(c.meta.uid)).filter(Boolean)])];
    const people = {};
    if (uids.length) {
      const { results } = await env.DB.prepare(`SELECT id, first_name, last_name, display_name, email, licence FROM users WHERE id IN (${uids.map(() => "?").join(",")})`).bind(...uids).all();
      for (const u of results) people[u.id] = { name: nameOf(u), email: u.email, club: u.licence ? (await clubLabel(env, request, u.licence).catch(() => null)) || "" : "" };
    }
    return json({ collection, gone: gone.length, library, people });
  } catch (e) {
    if (/no such (table|column)/i.test(String(e?.message))) return json({ error: "not ready" }, 503);
    throw e;
  }
}, { admin: true });
