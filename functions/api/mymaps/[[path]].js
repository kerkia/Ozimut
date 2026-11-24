// /api/mymaps — « Mes cartes » (Coach; owner, 2026-11-01): each account's archive of its maps and the routes it ran on them.
// D1 (migration 0019): mymaps, mymap_runs, mymap_links. R2 (cn-state, binding BUCKET; the keys in _lib/mymaps.js):
// mymaps-o/<user>/<map> (the image as it came; mymaps/<user>/<map>/map before 2026-11-06), mymaps/<user>/<map>/view (its
// viewing copy, 2 560 px at most) and …/thumb (both small WebP or JPEG the browser made), …/runs/<run>.json (a run as drawn
// on the map: positions in the map's pixels and times, the personal channels only when the runner kept them). A library
// holds 1 GB at most (originals and runs; env MYMAPS_QUOTA_MB; the administrators have none): 413 { error: "quota" }. Everything is read and written in the
// browser; the server keeps, lists and serves. Private: only the account, unless it made a link (the whole archive, or one
// map), which anyone holding it reads — a visitor without an account too (with the guest pass: _middleware.js GUEST); the
// personal channels are never served through a link.
//
//   GET    /api/mymaps                          { maps: [map + runs], links: { archive, maps: { id: link }, sets: [link + maps] }, name,
//                                               quota: { used, limit (null: none) } }
//                                               (a link: { token, traces })
//   POST   /api/mymaps/maps                     the image as the body, X-Meta (URI-encoded JSON: sha, title, day, place,
//                                               notes, w, h, geo, country, region, dept, pos) -> { map, existed } (the same
//                                               image again: the map kept, its place given if it had none;
//                                               placed: false while migration 0024 is not applied)
//   PUT    /api/mymaps/maps/<id>                { title, day, place, notes, geo, country, region, dept, pos, private } -> { map }
//                                               (private, migration 0025: « Carte privée », kept from the administrators too;
//                                               also in POST's X-Meta)
//                                               (country, region, dept: migration 0024, left out before it; pos: [lat, lon]
//                                               of a map without a georeference — a GPS track's first point)
//   DELETE /api/mymaps/maps/<id>                the map, its runs, its link
//   PUT    /api/mymaps/maps/<id>/thumb | /view  the thumbnail, the viewing copy, as the body
//   GET    /api/mymaps/maps/<id>/map | /thumb | /view
//   POST   /api/mymaps/maps/<id>/runs           { title, day, start, dur, dist, source, note, rec, replace } -> { run, replaced }
//                                               (owner, 2026-11-24: the run replaces the one named `replace` — « Analyse solo »
//                                               calibrated again — and any run of the same race on this map, its start within 2 s:
//                                               an analysis saved again, or saved by itself, is never kept twice; an empty title
//                                               keeps the replaced run's)
//   POST   /api/mymaps/from-solo                -> { moved, ids: { <old id>: <run id> }, left } — the solo analyses kept in
//                                               /api/solo (2026-11-05 to 24) moved into the library, 20 a call: one store
//                                               (owner, 2026-11-24); their maps once per account, « Carte privée » kept
//                                               (every account's are also moved without it: moveAllSolo, from /api/track every
//                                               15 minutes an isolate, and at once when an administrator lists every library)
//   GET    /api/mymaps/runs/<id>                the run's record
//   PUT    /api/mymaps/runs/<id>                { title?, note? } -> { run };  DELETE /api/mymaps/runs/<id>
//                                               (note: the run's comment, migration 0022; 503 « not ready » before it)
//   POST   /api/mymaps/link                     { map: id | null | maps: [ids] | token, on: true | false, traces } -> { token | null, traces }
//                                               (maps: a selection, one link per set of maps; token: that link; traces: the
//                                               routes shared with the maps, else the maps alone; changed on the link kept)
//   GET    /api/mymaps/s/<token>                { name, archive, traces, maps } of a link (the archive's: every map; a map's: that one; a
//                                               selection's: those still kept;
//                                               a link of the maps alone lists no runs and serves none)
//   GET    /api/mymaps/s/<token>/maps/<id>/map | /thumb | /view,  GET /api/mymaps/s/<token>/runs/<id>
//
// A library shared with chosen accounts (owner, 2026-11-24; migration 0033, mymap_grants and mymap_invites; 503 « not ready » before
// it): the whole library, read only, its maps marked « Carte privée » left out, the personal channels never served. An account is
// added only by an invitation it accepts — a link the owner hands to one person, used once, valid 7 days (owner, the same day: no
// looking accounts up by name, which would tell who has an account); only its token's SHA-256 is kept.
//   GET    /api/mymaps/shares                   { to: [{ uid, name, club, traces }] (whom one shares with), from: [{ uid, name, traces }],
//                                               invites: [{ id, traces, created, expires }] (those still valid) }
//   POST   /api/mymaps/shares                   { uid, on: false } (the owner stops sharing with uid) | { uid, on: true, traces } (changes
//                                               what an account already holding it sees) | { owner, leave: true } (one stops seeing a
//                                               library shared with one) -> as GET
//   POST   /api/mymaps/invites                  { traces } -> { token, invites } (20 waiting at most)
//   DELETE /api/mymaps/invites/<id>             -> { invites }
//   POST   /api/mymaps/invites/accept           { token } -> { owner, name } (410 used, cancelled or expired; 400 « self »; 403 « demo »)
//   GET    /api/mymaps/u/<owner>                as /s/<token>, for an account the owner shares with
//   GET    /api/mymaps/u/<owner>/maps/<id>/map | /thumb | /view,  GET /api/mymaps/u/<owner>/runs/<id>

import { allow, currentUser, isAdmin, json, nowIso, readBody } from "../../_lib/api.js";
import { clubLabel } from "../../_lib/club.js";
import { newToken, randomBytes, sha256hex } from "../../_lib/crypto.js";
import { key, origKey, getOrig, quota, used } from "../../_lib/mymaps.js";

const MAX_MAP = 80 * 1024 * 1024;                     // as the shared analyses' maps (Cloudflare takes 100 MB a request)
const MAX_THUMB = 600 * 1024;
const MAX_VIEW = 6 * 1024 * 1024;
const PARTS = ["map", "thumb", "view"];
const MAX_RUN = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
const newId = (n = 12) => Array.from(randomBytes(n), (b) => ALPHA[b % 32]).join("");
const ID = /^[a-z2-9]{8,40}$/;
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const cleanDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : null);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
/** A run's comment: plain text, its lines kept. */
const cleanNote = (s) => String(s ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);
/** A run's comment written; false when the column is not there yet (migration 0022 not applied). */
async function setNote(env, id, note) {
  try { await env.DB.prepare("UPDATE mymap_runs SET note = ? WHERE id = ?").bind(note, id).run(); return true; }
  catch (e) { if (/no such column/i.test(String(e?.message))) return false; throw e; }
}
function cleanGeo(g) {
  if (!g || typeof g !== "object") return null;
  const o = {};
  for (const k of ["a", "b", "c", "d", "e", "f"]) { if (!Number.isFinite(g[k])) return null; o[k] = g[k]; }
  return Math.abs(o.a * o.e - o.b * o.d) > 1e-9 ? o : null;
}
/** The map's centre in longitude/latitude, from its georeference. */
function centre(geo, w, h) {
  if (!geo) return [null, null];
  const det = geo.a * geo.e - geo.b * geo.d, x = w / 2 - geo.c, y = h / 2 - geo.f;
  return [(geo.a * y - geo.d * x) / det, (geo.e * x - geo.b * y) / det];       // [lat, lon]
}
const cleanCc = (s) => (/^[A-Za-z]{2}$/.test(String(s || "")) ? String(s).toUpperCase() : "");
/** [lat, lon] of a map without a georeference, when the browser gives one (a track's first point). */
const cleanPos = (p) => (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 ? [Number(p[0]), Number(p[1])] : null);
/** « Carte privée » written (migration 0025); nothing before it. */
async function setPrivate(env, id, on) {
  try { await env.DB.prepare("UPDATE mymaps SET private = ? WHERE id = ?").bind(on ? 1 : 0, id).run(); }
  catch (e) { if (!/no such column/i.test(String(e?.message))) throw e; }
}
/** The map's place written (migration 0024): false when the columns are not there yet (the browser's folder import then stops). */
async function setPlace(env, id, b, m = {}) {
  const v = (k, n) => (k in b ? (k === "country" ? cleanCc(b[k]) : clean(b[k], n)) : m[k] ?? "");
  try { await env.DB.prepare("UPDATE mymaps SET country = ?, region = ?, dept = ? WHERE id = ?").bind(v("country"), v("region", 120), v("dept", 120), id).run(); return true; }
  catch (e) { if (!/no such column/i.test(String(e?.message))) throw e; return false; }
}

const mapOut = (m) => ({ id: m.id, sha: m.sha, title: m.title, day: m.day, place: m.place, notes: m.notes, type: m.type, bytes: m.bytes,
  w: m.w, h: m.h, geo: m.geo ? JSON.parse(m.geo) : null, lat: m.lat ?? null, lon: m.lon ?? null, country: m.country || "", region: m.region || "",
  dept: m.dept || "", private: !!m.private, thumb: !!m.thumb, created: m.created_at, updated: m.updated_at });
const runOut = (r, shared = false) => ({ id: r.id, map: r.map_id, title: r.title, day: r.day, start: r.start_ms, dur: r.dur, dist: r.dist,
  source: r.source, personal: shared ? false : !!r.personal, bytes: shared ? undefined : r.bytes, note: r.note || "" });

// A link's maps (mymap_links.map_id): NULL every map of the account; a map's id that map; « set:<id>,<id>… » a selection (owner,
// 2026-11-01: « Partager la sélection »), its ids sorted, so that the same selection again finds the same link.
const SET = "set:";
const scopeOf = (mapId) => (!mapId ? null : mapId.startsWith(SET) ? mapId.slice(SET.length).split(",").filter((x) => ID.test(x)) : [mapId]);
const inScope = (mapId, id) => { const s = scopeOf(mapId); return !s || s.includes(id); };
async function mapsOf(env, uid, only = null) {
  const q = only ? env.DB.prepare(`SELECT * FROM mymaps WHERE user_id = ? AND id IN (${only.map(() => "?").join(",") || "''"}) ORDER BY day DESC, created_at DESC`).bind(uid, ...only)
    : env.DB.prepare("SELECT * FROM mymaps WHERE user_id = ? ORDER BY day DESC, created_at DESC").bind(uid);
  const [{ results: maps }, { results: runs }] = await Promise.all([q.all(),
    env.DB.prepare("SELECT * FROM mymap_runs WHERE user_id = ? ORDER BY start_ms").bind(uid).all()]);
  return { maps, runs };
}
const listed = (maps, runs, shared = false) => maps.map((m) => ({ ...mapOut(m), runs: runs.filter((r) => r.map_id === m.id).map((r) => runOut(r, shared)) }));
const nameOf = (u) => `${String(u.first_name || "").trim()} ${String(u.last_name || "").trim()}`.trim() || u.display_name || "";

/** A map's part as the response: its original (map), viewing copy (view) or thumbnail. */
const servePart = (env, uid, id, part) => (part === "map" ? serve(env, null, { obj: getOrig(env, uid, id) }) : serve(env, key(uid, id, part)));
/** An R2 object as the response (an image cached a year: a map never changes under its id). */
async function serve(env, k, { cache = "private, max-age=31536000, immutable", strip = false, obj: given = null } = {}) {
  const obj = given ? await given : await env.BUCKET.get(k);
  if (!obj) return json({ error: "not found" }, 404);
  if (strip) {                                         // a run through a link: its personal channels left out
    const rec = await obj.json().catch(() => null);
    if (!rec) return json({ error: "not found" }, 404);
    delete rec.ch;
    return json(rec, 200, { "Cache-Control": "private, max-age=300" });
  }
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": cache } });
}
async function dropPrefix(env, prefix) {
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    if (r.objects.length) await env.BUCKET.delete(r.objects.map((o) => o.key));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
}
/** The runs a new one replaces: the one named, and those of the same race on map `mapId` (their start within 2 s). */
async function sameRace(env, uid, mapId, start, named) {
  const { results } = await env.DB.prepare(`SELECT * FROM mymap_runs WHERE user_id = ? AND (id = ? OR (map_id = ? AND ? IS NOT NULL
    AND start_ms IS NOT NULL AND ABS(start_ms - ?) < 2000))`).bind(uid, named, mapId, start, start).all();
  return results;
}
/** A run kept: its record in R2, its row -> its id. */
async function addRun(env, uid, mapId, rec, { title, day, start, dur, dist, source, note }) {
  const body = JSON.stringify(rec), rid = newId();
  await env.BUCKET.put(key(uid, mapId, `runs/${rid}.json`), body, { httpMetadata: { contentType: "application/json" } });
  await env.DB.prepare(`INSERT INTO mymap_runs (id, map_id, user_id, title, day, start_ms, dur, dist, source, personal, bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(rid, mapId, uid, title, day, start, dur, dist, source, rec.ch ? 1 : 0, body.length, nowIso()).run();
  if (note) await setNote(env, rid, note);
  return rid;
}
async function dropRuns(env, uid, runs) {
  for (const o of runs) {
    await env.BUCKET.delete(key(uid, o.map_id, `runs/${o.id}.json`));
    await env.DB.prepare("DELETE FROM mymap_runs WHERE id = ?").bind(o.id).run();
  }
}
/** The solo analyses of /api/solo moved into the library (owner, 2026-11-24: « the same store »), `n` at a time. */
const SOLO_KINDS = ["solo", "drawn", "orga"];
async function fromSolo(env, uid, n = 20) {
  const listed = await env.BUCKET.list({ prefix: `solo/${uid}/a/`, limit: 1000, include: ["customMetadata"] });
  const ids = {};
  for (const o of listed.objects.slice(0, n)) {
    const oldId = o.key.slice(o.key.lastIndexOf("/") + 1).replace(/\.json$/, "");
    const obj = await env.BUCKET.get(o.key);
    let a = null;
    try { a = obj ? await obj.json() : null; } catch (e) { a = null; }
    let title = a?.title || "";
    try { title = JSON.parse(o.customMetadata?.s || "null")?.title ?? title; } catch (e) { /* the record's own */ }
    const sha = String(a?.map?.sha || ""), rec = a?.rec;
    if (!/^[0-9a-f]{64}$/.test(sha) || !rec || rec.v !== 1 || !Array.isArray(rec.x)) {
      if (obj) await env.BUCKET.put(`solo/${uid}/bad/${oldId}.json`, JSON.stringify(a));        // kept aside, never lost
      await env.BUCKET.delete(o.key);
      continue;
    }
    let m = await env.DB.prepare("SELECT * FROM mymaps WHERE user_id = ? AND sha = ?").bind(uid, sha).first();
    if (!m) {
      const img = await env.BUCKET.get(`solo/${uid}/m/${sha}`);
      if (!img) { await env.BUCKET.put(`solo/${uid}/bad/${oldId}.json`, JSON.stringify(a)); await env.BUCKET.delete(o.key); continue; }
      const buf = await img.arrayBuffer(), type = img.httpMetadata?.contentType || a.map.type || "image/jpeg";
      const geo = cleanGeo(a.geo), w = Math.round(num(a.map.w) || 0), h = Math.round(num(a.map.h) || 0), mid = newId(), now = nowIso();
      const [lat, lon] = geo ? centre(geo, w, h) : [null, null];
      await env.BUCKET.put(origKey(uid, mid), buf, { httpMetadata: { contentType: type } });
      await env.DB.prepare(`INSERT INTO mymaps (id, user_id, sha, title, day, place, notes, type, bytes, w, h, geo, lat, lon, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(mid, uid, sha, clean(title, 200), cleanDay(a.day), type, buf.byteLength, w, h,
        geo ? JSON.stringify(geo) : null, lat, lon, now, now).run();
      const th = await env.BUCKET.get(`solo/${uid}/m/${sha}.thumb`);
      if (th) {
        await env.BUCKET.put(key(uid, mid, "thumb"), await th.arrayBuffer(), { httpMetadata: { contentType: th.httpMetadata?.contentType || "image/webp" } });
        await env.DB.prepare("UPDATE mymaps SET thumb = 1 WHERE id = ?").bind(mid).run();
      }
      if (a.priv) await setPrivate(env, mid, true);
      m = await env.DB.prepare("SELECT * FROM mymaps WHERE id = ?").bind(mid).first();
    }
    delete rec.ch;                                             // (never kept by /api/solo)
    const olds = await sameRace(env, uid, m.id, num(a.start), "");
    ids[oldId] = await addRun(env, uid, m.id, rec, { title: clean(title, 200), day: cleanDay(a.day), start: num(a.start), dur: num(a.dur), dist: num(a.dist),
      source: SOLO_KINDS.includes(a.source) ? a.source : a.orga ? "orga" : "solo", note: "" });
    await dropRuns(env, uid, olds);
    await env.BUCKET.delete(o.key);
  }
  const left = Math.max(0, listed.objects.length - n) + (listed.truncated ? 1 : 0);
  if (!left) await dropPrefix(env, `solo/${uid}/m/`);           // the maps, now in the library
  return { moved: Object.keys(ids).length, ids, left };
}
/**
 * Every account's solo analyses still in /api/solo moved, `budget` analyses at most (owner, 2026-11-24: an account that has not
 * opened « Analyse » or « Mes cartes » since kept its analyses out of the library, and out of the administrators' view and of the
 * libraries it shares). Accounts that no longer exist are left alone (their maps wait for the collection's hand-over).
 */
export async function moveAllSolo(env, budget = 10) {
  let cursor, moved = 0;
  do {
    const r = await env.BUCKET.list({ prefix: "solo/", delimiter: "/", cursor, limit: 1000 });
    for (const pre of r.delimitedPrefixes || []) {
      const uid = Number(pre.split("/")[1]);
      if (!Number.isInteger(uid) || uid <= 0) continue;
      const any = await env.BUCKET.list({ prefix: `solo/${uid}/a/`, limit: 1 });
      if (!any.objects.length) continue;
      if (!(await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(uid).first())) continue;
      const res = await fromSolo(env, uid, budget - moved);
      moved += res.moved;
      if (moved >= budget) return moved;
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return moved;
}
let lastSweep = 0;
/** From a signed-in page view (/api/track): the sweep above, at most every 15 minutes an isolate. */
export function soloSweepSoon(ctx) {
  if (!ctx.env.BUCKET || !ctx.env.DB || Date.now() - lastSweep < 15 * 60e3) return;
  lastSweep = Date.now();
  ctx.waitUntil(moveAllSolo(ctx.env, 10).catch((e) => console.error("solo sweep", e)));
}
/** The club shown beside an account's name (homonyms): its federation club, else the club typed for a country it joined. */
async function clubOfUser(env, request, u) {
  if (u.licence) { const c = await clubLabel(env, request, u.licence).catch(() => null); if (c) return c; }
  const r = await env.DB.prepare("SELECT club FROM user_countries WHERE user_id = ? AND club <> '' ORDER BY added_at LIMIT 1").bind(u.id).first().catch(() => null);
  return r?.club || "";
}
const INVITE_DAYS = 7, MAX_INVITES = 20;
const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;
/** One's invitations still valid. */
async function invitesOf(env, uid) {
  const { results } = await env.DB.prepare("SELECT id, traces, created_at, expires_at FROM mymap_invites WHERE owner_id = ? AND expires_at > ? ORDER BY created_at")
    .bind(uid, nowIso()).all();
  return results.map((r) => ({ id: r.id, traces: r.traces !== 0, created: r.created_at, expires: r.expires_at }));
}
/** What the sharing dialog and the tabs show: whom one shares with, who shares with one, the invitations waiting. */
async function sharesOf(env, request, uid) {
  const { results } = await env.DB.prepare(`SELECT g.owner_id, g.traces, u.first_name, u.last_name, u.display_name FROM mymap_grants g
    JOIN users u ON u.id = g.owner_id WHERE g.grantee_id = ? AND u.status = 'active' ORDER BY u.last_name, u.first_name`).bind(uid).all();
  return { to: await grantsTo(env, request, uid), from: results.map((r) => ({ uid: r.owner_id, name: nameOf(r), traces: r.traces !== 0 })),
    invites: await invitesOf(env, uid) };
}
/** The accounts one shares one's library with. */
async function grantsTo(env, request, uid) {
  const { results } = await env.DB.prepare(`SELECT g.grantee_id, g.traces, u.id, u.first_name, u.last_name, u.display_name, u.licence FROM mymap_grants g
    JOIN users u ON u.id = g.grantee_id WHERE g.owner_id = ? ORDER BY u.last_name, u.first_name`).bind(uid).all();
  return Promise.all(results.map(async (r) => ({ uid: r.id, name: nameOf(r), club: await clubOfUser(env, request, r), traces: r.traces !== 0 })));
}
/** The body, up to `max` bytes (null beyond). */
async function bodyBytes(request, max) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > max) return null;
  const buf = await request.arrayBuffer();
  return buf.byteLength > max || !buf.byteLength ? null : buf;
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB || !env.BUCKET) return json({ error: "server not configured" }, 500);
  const parts = [].concat(params.path || []).map(String);
  const method = request.method;
  try {
    // ---- a link: anyone who holds it (the login gate lets a visitor's GET through, with the guest pass)
    if (parts[0] === "s") {
      if (method !== "GET") return json({ error: "method" }, 405);
      const token = parts[1] || "";
      if (!ID.test(token)) return json({ error: "not found" }, 404);
      const link = await env.DB.prepare("SELECT * FROM mymap_links WHERE token = ?").bind(token).first();
      if (!link) return json({ error: "not found" }, 404);
      const uid = link.user_id;
      if (parts.length === 2) {
        const u = await env.DB.prepare("SELECT first_name, last_name, display_name FROM users WHERE id = ?").bind(uid).first();
        const { maps, runs } = await mapsOf(env, uid, scopeOf(link.map_id));
        const traces = link.traces !== 0;
        return json({ name: u ? nameOf(u) : "", archive: !link.map_id || link.map_id.startsWith(SET), traces, maps: listed(maps, traces ? runs : [], true) },
          200, { "Cache-Control": "private, max-age=60" });
      }
      if (parts[2] === "maps" && ID.test(parts[3] || "") && PARTS.includes(parts[4]) && parts.length === 5) {
        if (!inScope(link.map_id, parts[3])) return json({ error: "not found" }, 404);
        const m = await env.DB.prepare("SELECT id FROM mymaps WHERE id = ? AND user_id = ?").bind(parts[3], uid).first();
        return m ? servePart(env, uid, m.id, parts[4]) : json({ error: "not found" }, 404);
      }
      if (parts[2] === "runs" && ID.test(parts[3] || "") && parts.length === 4) {
        const r = await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ? AND user_id = ?").bind(parts[3], uid).first();
        if (!r || link.traces === 0 || !inScope(link.map_id, r.map_id)) return json({ error: "not found" }, 404);
        return serve(env, key(uid, r.map_id, `runs/${r.id}.json`), { strip: true });
      }
      return json({ error: "not found" }, 404);
    }

    // ---- the account's own
    const user = await currentUser(request, env);
    if (!user) return json({ error: "login required" }, 401);
    const uid = user.id;
    const limit = isAdmin(env, user) ? null : quota(env);
    /** Would `more` bytes go beyond the account's quota? -> the 413 to answer, or null. */
    const over = async (more) => {
      if (limit == null) return null;
      const u = await used(env, uid);
      return u + more > limit ? json({ error: "quota", used: u, limit }, 413) : null;
    };

    if (parts[0] === "from-solo" && parts.length === 1 && method === "POST") {
      if (user.demo_until) return json({ moved: 0, ids: {}, left: 0 });
      if (!(await allow(env, `mmfromsolo:${uid}`, 200, 3600))) return json({ error: "rate" }, 429);
      return json(await fromSolo(env, uid));
    }

    // ---- shared with chosen accounts (migration 0033)
    if (parts[0] === "shares" && parts.length === 1) {
      if (method === "GET") return json(await sharesOf(env, request, uid));
      if (method !== "POST") return json({ error: "method" }, 405);
      const b = await readBody(request);
      if (b?.leave) {                                          // one no longer wants to see a library shared with one
        const owner = Number(b.owner);
        if (!Number.isInteger(owner) || owner <= 0) return json({ error: "fields" }, 400);
        await env.DB.prepare("DELETE FROM mymap_grants WHERE owner_id = ? AND grantee_id = ?").bind(owner, uid).run();
        return json(await sharesOf(env, request, uid));
      }
      const to = Number(b?.uid);
      if (!Number.isInteger(to) || to <= 0 || to === uid) return json({ error: "fields" }, 400);
      if (!b.on) await env.DB.prepare("DELETE FROM mymap_grants WHERE owner_id = ? AND grantee_id = ?").bind(uid, to).run();
      else {                                                   // only what an account that accepted an invitation sees
        const r = await env.DB.prepare("UPDATE mymap_grants SET traces = ? WHERE owner_id = ? AND grantee_id = ?").bind(b.traces === false ? 0 : 1, uid, to).run();
        if (!r.meta?.changes) return json({ error: "not found" }, 404);
      }
      return json(await sharesOf(env, request, uid));
    }
    if (parts[0] === "invites") {
      if (parts[1] === "accept" && parts.length === 2 && method === "POST") {
        const b = await readBody(request);
        const token = String(b?.token || "");
        if (!TOKEN.test(token)) return json({ error: "invite" }, 410);
        if (!(await allow(env, `mminvacc:${uid}`, 60, 3600))) return json({ error: "rate" }, 429);
        if (user.demo_until) return json({ error: "demo" }, 403);
        const inv = await env.DB.prepare(`SELECT i.id, i.owner_id, i.traces, u.first_name, u.last_name, u.display_name FROM mymap_invites i
          JOIN users u ON u.id = i.owner_id WHERE i.token_hash = ? AND i.expires_at > ? AND u.status = 'active'`).bind(await sha256hex(token), nowIso()).first();
        if (!inv) return json({ error: "invite" }, 410);
        if (inv.owner_id === uid) return json({ error: "self" }, 400);
        await env.DB.batch([
          env.DB.prepare(`INSERT INTO mymap_grants (owner_id, grantee_id, traces, created_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (owner_id, grantee_id) DO UPDATE SET traces = excluded.traces`).bind(inv.owner_id, uid, inv.traces, nowIso()),
          env.DB.prepare("DELETE FROM mymap_invites WHERE id = ?").bind(inv.id),
        ]);
        return json({ owner: inv.owner_id, name: nameOf(inv) });
      }
      if (parts.length === 1 && method === "POST") {
        const b = await readBody(request);
        if (user.demo_until) return json({ error: "demo" }, 403);
        if (!(await allow(env, `mminvite:${uid}`, 40, 86400))) return json({ error: "rate" }, 429);
        await env.DB.prepare("DELETE FROM mymap_invites WHERE owner_id = ? AND expires_at <= ?").bind(uid, nowIso()).run();
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM mymap_invites WHERE owner_id = ?").bind(uid).first();
        if ((n?.n || 0) >= MAX_INVITES) return json({ error: "too many" }, 409);
        const token = newToken(), now = new Date();
        await env.DB.prepare("INSERT INTO mymap_invites (id, token_hash, owner_id, traces, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(newId(10), await sha256hex(token), uid, b?.traces === false ? 0 : 1, now.toISOString(), new Date(now.getTime() + INVITE_DAYS * 86400e3).toISOString()).run();
        return json({ token, invites: await invitesOf(env, uid) });
      }
      if (parts.length === 2 && ID.test(parts[1]) && method === "DELETE") {
        await env.DB.prepare("DELETE FROM mymap_invites WHERE id = ? AND owner_id = ?").bind(parts[1], uid).run();
        return json({ invites: await invitesOf(env, uid) });
      }
      return json({ error: "not found" }, 404);
    }
    if (parts[0] === "u" && /^\d{1,12}$/.test(parts[1] || "")) {
      if (method !== "GET") return json({ error: "method" }, 405);
      const owner = Number(parts[1]);
      const g = await env.DB.prepare(`SELECT g.traces, u.first_name, u.last_name, u.display_name FROM mymap_grants g JOIN users u ON u.id = g.owner_id
        WHERE g.owner_id = ? AND g.grantee_id = ? AND u.status = 'active'`).bind(owner, uid).first();
      if (!g) return json({ error: "not found" }, 404);
      const traces = g.traces !== 0;
      const shown = async (id) => { const m = await env.DB.prepare("SELECT * FROM mymaps WHERE id = ? AND user_id = ?").bind(id, owner).first(); return m && !m.private ? m : null; };
      if (parts.length === 2) {
        const { maps, runs } = await mapsOf(env, owner);
        return json({ name: nameOf(g), archive: true, traces, maps: listed(maps.filter((m) => !m.private), traces ? runs : [], true) });
      }
      if (parts[2] === "maps" && ID.test(parts[3] || "") && PARTS.includes(parts[4]) && parts.length === 5) {
        const m = await shown(parts[3]);
        return m ? servePart(env, owner, m.id, parts[4]) : json({ error: "not found" }, 404);
      }
      if (parts[2] === "runs" && ID.test(parts[3] || "") && parts.length === 4) {
        const r = await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ? AND user_id = ?").bind(parts[3], owner).first();
        if (!r || !traces || !(await shown(r.map_id))) return json({ error: "not found" }, 404);
        return serve(env, key(owner, r.map_id, `runs/${r.id}.json`), { strip: true });
      }
      return json({ error: "not found" }, 404);
    }

    if (!parts.length) {
      if (method !== "GET") return json({ error: "method" }, 405);
      const [{ maps, runs }, { results: links }] = await Promise.all([mapsOf(env, uid),
        env.DB.prepare("SELECT token, map_id, traces FROM mymap_links WHERE user_id = ?").bind(uid).all()]);
      const out = { archive: null, maps: {}, sets: [] };
      for (const l of links) {
        const v = { token: l.token, traces: l.traces !== 0 };
        if (!l.map_id) out.archive = v;
        else if (l.map_id.startsWith(SET)) out.sets.push({ ...v, maps: scopeOf(l.map_id) });
        else out.maps[l.map_id] = v;
      }
      // « Carte privée » is offered only once its column exists (migration 0025): a box ticked in vain would mislead
      const privateReady = !!(await env.DB.prepare("SELECT 1 AS ok FROM pragma_table_info('mymaps') WHERE name = 'private'").first().catch(() => null));
      return json({ maps: listed(maps, runs), links: out, name: nameOf(user), quota: { used: await used(env, uid), limit }, privateReady });
    }

    if (parts[0] === "link" && parts.length === 1 && method === "POST") {
      const b = await readBody(request);
      if (!b) return json({ error: "fields" }, 400);
      let mid = null;                                         // the link's map_id: null (every map), a map's id, a selection
      if (b.token) {
        const l = await env.DB.prepare("SELECT map_id FROM mymap_links WHERE token = ? AND user_id = ?").bind(String(b.token), uid).first();
        if (!l) return json({ error: "not found" }, 404);
        mid = l.map_id;
      } else {
        const ids = [...new Set(Array.isArray(b.maps) ? b.maps.map(String) : b.map ? [String(b.map)] : [])];
        if (ids.length > 1000 || ids.some((x) => !ID.test(x))) return json({ error: "fields" }, 400);
        if (ids.length) {
          const { results } = await env.DB.prepare(`SELECT id FROM mymaps WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`).bind(uid, ...ids).all();
          const mine = results.map((r) => r.id).sort();
          if (mine.length !== ids.length) return json({ error: "not found" }, 404);
          mid = mine.length === 1 ? mine[0] : SET + mine.join(",");
        }
      }
      const cond = mid ? ["user_id = ? AND map_id = ?", uid, mid] : ["user_id = ? AND map_id IS NULL", uid];
      if (!b.on) { await env.DB.prepare(`DELETE FROM mymap_links WHERE ${cond[0]}`).bind(...cond.slice(1)).run(); return json({ token: null, traces: true }); }
      const old = await env.DB.prepare(`SELECT token, traces FROM mymap_links WHERE ${cond[0]}`).bind(...cond.slice(1)).first();
      const traces = "traces" in b ? (b.traces ? 1 : 0) : old ? old.traces : 1;
      if (old) {
        if (old.traces !== traces) await env.DB.prepare("UPDATE mymap_links SET traces = ? WHERE token = ?").bind(traces, old.token).run();
        return json({ token: old.token, traces: traces !== 0 });
      }
      const token = newId(20);
      await env.DB.prepare("INSERT INTO mymap_links (token, user_id, map_id, traces, created_at) VALUES (?, ?, ?, ?, ?)").bind(token, uid, mid, traces, nowIso()).run();
      return json({ token, traces: traces !== 0 });
    }

    if (parts[0] === "maps") {
      if (parts.length === 1 && method === "POST") {
        if (!(await allow(env, `mymaps:${uid}`, 2000, 3600))) return json({ error: "rate" }, 429);
        let meta;
        try { meta = JSON.parse(decodeURIComponent(request.headers.get("X-Meta") || "")); } catch (e) { return json({ error: "meta" }, 400); }
        const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
        const sha = String(meta?.sha || "");
        if (!TYPES.includes(type) || !/^[0-9a-f]{64}$/.test(sha)) return json({ error: "type" }, 415);
        const old = await env.DB.prepare("SELECT * FROM mymaps WHERE user_id = ? AND sha = ?").bind(uid, sha).first();
        if (old) {
          // a map kept before without its place (Analyse solo's) takes the one now given (a folder's import)
          let placed = "country" in old;
          if (placed && !old.country && cleanCc(meta.country)) { placed = await setPlace(env, old.id, meta); Object.assign(old, { country: cleanCc(meta.country), region: clean(meta.region, 120), dept: clean(meta.dept, 120) }); }
          return json({ map: mapOut(old), existed: true, placed });
        }
        const full = await over(Number(request.headers.get("Content-Length") || 0));
        if (full) return full;
        const buf = await bodyBytes(request, MAX_MAP);
        if (!buf) return json({ error: "size" }, 413);
        const d = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
        if ([...d].map((x) => x.toString(16).padStart(2, "0")).join("") !== sha) return json({ error: "sha" }, 400);
        const w = Math.round(num(meta.w) || 0), h = Math.round(num(meta.h) || 0);
        if (!(w > 0 && h > 0 && w <= 40000 && h <= 40000)) return json({ error: "size" }, 400);
        const geo = cleanGeo(meta.geo), id = newId(), now = nowIso();
        const [lat, lon] = geo ? centre(geo, w, h) : cleanPos(meta.pos) || [null, null];
        await env.BUCKET.put(origKey(uid, id), buf, { httpMetadata: { contentType: type } });
        await env.DB.prepare(`INSERT INTO mymaps (id, user_id, sha, title, day, place, notes, type, bytes, w, h, geo, lat, lon, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, uid, sha, clean(meta.title, 200), cleanDay(meta.day), clean(meta.place, 200),
          clean(meta.notes, 4000), type, buf.byteLength, w, h, geo ? JSON.stringify(geo) : null, lat, lon, now, now).run();
        const placed = await setPlace(env, id, meta);
        if (meta.private) await setPrivate(env, id, true);
        const m = await env.DB.prepare("SELECT * FROM mymaps WHERE id = ?").bind(id).first();
        return json({ map: mapOut(m), existed: false, placed });
      }
      const id = parts[1] || "";
      if (!ID.test(id)) return json({ error: "not found" }, 404);
      const m = await env.DB.prepare("SELECT * FROM mymaps WHERE id = ? AND user_id = ?").bind(id, uid).first();
      if (!m) return json({ error: "not found" }, 404);
      if (parts.length === 2 && method === "PUT") {
        const b = await readBody(request);
        if (!b) return json({ error: "fields" }, 400);
        const geo = "geo" in b ? cleanGeo(b.geo) : m.geo ? JSON.parse(m.geo) : null;
        const [lat, lon] = geo ? centre(geo, m.w, m.h) : "pos" in b ? cleanPos(b.pos) || [null, null] : [m.lat, m.lon];
        await env.DB.prepare("UPDATE mymaps SET title = ?, day = ?, place = ?, notes = ?, geo = ?, lat = ?, lon = ?, updated_at = ? WHERE id = ?")
          .bind("title" in b ? clean(b.title, 200) : m.title, "day" in b ? cleanDay(b.day) : m.day, "place" in b ? clean(b.place, 200) : m.place,
            "notes" in b ? clean(b.notes, 4000) : m.notes, geo ? JSON.stringify(geo) : null, lat, lon, nowIso(), id).run();
        if ("country" in b || "region" in b || "dept" in b) await setPlace(env, id, b, m);
        if ("private" in b) await setPrivate(env, id, !!b.private);
        return json({ map: mapOut(await env.DB.prepare("SELECT * FROM mymaps WHERE id = ?").bind(id).first()) });
      }
      if (parts.length === 2 && method === "DELETE") {
        await dropPrefix(env, `mymaps/${uid}/${id}/`);
        await env.BUCKET.delete(origKey(uid, id));
        await env.DB.batch([env.DB.prepare("DELETE FROM mymap_runs WHERE map_id = ?").bind(id),
          env.DB.prepare("DELETE FROM mymap_links WHERE map_id = ?").bind(id), env.DB.prepare("DELETE FROM mymaps WHERE id = ?").bind(id)]);
        return json({ ok: true });
      }
      if (parts.length === 3 && (parts[2] === "thumb" || parts[2] === "view") && method === "PUT") {
        const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
        if (!TYPES.includes(type)) return json({ error: "type" }, 415);
        const buf = await bodyBytes(request, parts[2] === "view" ? MAX_VIEW : MAX_THUMB);
        if (!buf) return json({ error: "size" }, 413);
        await env.BUCKET.put(key(uid, id, parts[2]), buf, { httpMetadata: { contentType: type } });
        if (parts[2] === "thumb") await env.DB.prepare("UPDATE mymaps SET thumb = 1 WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
      if (parts.length === 3 && PARTS.includes(parts[2]) && method === "GET") return servePart(env, uid, id, parts[2]);
      if (parts.length === 3 && parts[2] === "runs" && method === "POST") {
        if (!(await allow(env, `mymaps:${uid}`, 2000, 3600))) return json({ error: "rate" }, 429);
        const text = await request.text();
        if (text.length > MAX_RUN) return json({ error: "size" }, 413);
        const full = await over(text.length);
        if (full) return full;
        let b;
        try { b = JSON.parse(text); } catch (e) { return json({ error: "fields" }, 400); }
        const rec = b?.rec;
        if (!rec || rec.v !== 1 || !Array.isArray(rec.x) || rec.x.length < 2 || rec.x.length !== rec.y?.length) return json({ error: "run" }, 400);
        if (rec.ch && !b.personal) delete rec.ch;                 // kept only when the runner ticked it
        const day = cleanDay(b.day);
        const olds = await sameRace(env, uid, id, num(b.start), ID.test(String(b.replace || "")) ? String(b.replace) : "");
        const named = olds.find((o) => o.id === b.replace) || olds[0];
        const rid = await addRun(env, uid, id, rec, { title: clean(b.title, 200) || named?.title || "", day, start: num(b.start), dur: num(b.dur), dist: num(b.dist),
          source: clean(b.source, 20), note: cleanNote(b.note) || named?.note || "" });
        await dropRuns(env, uid, olds);
        if (!m.day && day) await env.DB.prepare("UPDATE mymaps SET day = ? WHERE id = ?").bind(day, id).run();
        return json({ run: runOut(await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ?").bind(rid).first()), replaced: olds.length });
      }
      return json({ error: "not found" }, 404);
    }

    if (parts[0] === "runs" && parts.length === 2 && ID.test(parts[1])) {
      const r = await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ? AND user_id = ?").bind(parts[1], uid).first();
      if (!r) return json({ error: "not found" }, 404);
      const k = key(uid, r.map_id, `runs/${r.id}.json`);
      if (method === "GET") return serve(env, k, { cache: "private, max-age=31536000, immutable" });
      if (method === "PUT") {
        const b = await readBody(request);
        if (b && "title" in b) await env.DB.prepare("UPDATE mymap_runs SET title = ? WHERE id = ?").bind(clean(b.title, 200), r.id).run();
        if (b && "note" in b && !(await setNote(env, r.id, cleanNote(b.note)))) return json({ error: "not ready" }, 503);
        return json({ run: runOut(await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ?").bind(r.id).first()) });
      }
      if (method === "DELETE") {
        await env.BUCKET.delete(k);
        await env.DB.prepare("DELETE FROM mymap_runs WHERE id = ?").bind(r.id).run();
        return json({ ok: true });
      }
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (/no such table/i.test(String(e?.message))) return json({ error: "not ready" }, 503);     // migration 0019 not applied
    throw e;
  }
}

