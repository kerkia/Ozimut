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
//   POST   /api/mymaps/maps/<id>/runs           { title, day, start, dur, dist, source, note, rec } -> { run }
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
// A library shared with chosen accounts (owner, 2026-11-24; migration 0033, mymap_grants; 503 « not ready » before it): the whole
// library, read only, its maps marked « Carte privée » left out, the personal channels never served.
//   GET    /api/mymaps/shares                   { to: [{ uid, name, club, traces }] (whom one shares with), from: [{ uid, name, traces }] }
//   POST   /api/mymaps/shares                   { uid, on, traces } -> { to }
//   GET    /api/mymaps/people?q=                { people: [{ uid, name, club }] } (accounts whose name has every word typed; 3 letters
//                                               at least, 10 answers, oneself, demo, unconfirmed and disabled accounts left out)
//   GET    /api/mymaps/u/<owner>                as /s/<token>, for an account the owner shares with
//   GET    /api/mymaps/u/<owner>/maps/<id>/map | /thumb | /view,  GET /api/mymaps/u/<owner>/runs/<id>

import { allow, currentUser, isAdmin, json, nowIso, readBody } from "../../_lib/api.js";
import { clubLabel } from "../../_lib/club.js";
import { randomBytes } from "../../_lib/crypto.js";
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
/** The club shown beside an account's name (homonyms): its federation club, else the club typed for a country it joined. */
async function clubOfUser(env, request, u) {
  if (u.licence) { const c = await clubLabel(env, request, u.licence).catch(() => null); if (c) return c; }
  const r = await env.DB.prepare("SELECT club FROM user_countries WHERE user_id = ? AND club <> '' ORDER BY added_at LIMIT 1").bind(u.id).first().catch(() => null);
  return r?.club || "";
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

    // ---- shared with chosen accounts (migration 0033)
    if (parts[0] === "shares" && parts.length === 1) {
      if (method === "GET") {
        const { results } = await env.DB.prepare(`SELECT g.owner_id, g.traces, u.first_name, u.last_name, u.display_name FROM mymap_grants g
          JOIN users u ON u.id = g.owner_id WHERE g.grantee_id = ? AND u.status = 'active' ORDER BY u.last_name, u.first_name`).bind(uid).all();
        return json({ to: await grantsTo(env, request, uid), from: results.map((r) => ({ uid: r.owner_id, name: nameOf(r), traces: r.traces !== 0 })) });
      }
      if (method === "POST") {
        const b = await readBody(request);
        const to = Number(b?.uid);
        if (!Number.isInteger(to) || to <= 0 || to === uid) return json({ error: "fields" }, 400);
        if (!b.on) await env.DB.prepare("DELETE FROM mymap_grants WHERE owner_id = ? AND grantee_id = ?").bind(uid, to).run();
        else {
          if (!(await allow(env, `mmgrant:${uid}`, 200, 86400))) return json({ error: "rate" }, 429);
          const u = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND status = 'active' AND email_verified = 1 AND demo_until IS NULL").bind(to).first();
          if (!u) return json({ error: "not found" }, 404);
          const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM mymap_grants WHERE owner_id = ?").bind(uid).first();
          const traces = b.traces === false ? 0 : 1;
          const old = await env.DB.prepare("SELECT 1 AS ok FROM mymap_grants WHERE owner_id = ? AND grantee_id = ?").bind(uid, to).first();
          if (old) await env.DB.prepare("UPDATE mymap_grants SET traces = ? WHERE owner_id = ? AND grantee_id = ?").bind(traces, uid, to).run();
          else if ((n?.n || 0) >= 200) return json({ error: "too many" }, 409);
          else await env.DB.prepare("INSERT INTO mymap_grants (owner_id, grantee_id, traces, created_at) VALUES (?, ?, ?, ?)").bind(uid, to, traces, nowIso()).run();
        }
        return json({ to: await grantsTo(env, request, uid) });
      }
      return json({ error: "method" }, 405);
    }
    if (parts[0] === "people" && parts.length === 1 && method === "GET") {
      const words = String(new URL(request.url).searchParams.get("q") || "").replace(/[%_\\]/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4);
      if (words.join("").length < 3) return json({ people: [] });
      if (!(await allow(env, `mmpeople:${uid}`, 300, 3600))) return json({ error: "rate" }, 429);
      const { results } = await env.DB.prepare(`SELECT id, first_name, last_name, display_name, licence FROM users
        WHERE id <> ? AND status = 'active' AND email_verified = 1 AND demo_until IS NULL AND ${words.map(() => "(first_name || ' ' || last_name) LIKE ?").join(" AND ")}
        ORDER BY last_name, first_name LIMIT 10`).bind(uid, ...words.map((w) => `%${w}%`)).all();
      return json({ people: await Promise.all(results.map(async (u) => ({ uid: u.id, name: nameOf(u), club: await clubOfUser(env, request, u) }))) });
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
        const body = JSON.stringify(rec), rid = newId(), day = cleanDay(b.day);
        await env.BUCKET.put(key(uid, id, `runs/${rid}.json`), body, { httpMetadata: { contentType: "application/json" } });
        await env.DB.prepare(`INSERT INTO mymap_runs (id, map_id, user_id, title, day, start_ms, dur, dist, source, personal, bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(rid, id, uid, clean(b.title, 200), day, num(b.start), num(b.dur), num(b.dist),
          clean(b.source, 20), rec.ch ? 1 : 0, body.length, nowIso()).run();
        if (!m.day && day) await env.DB.prepare("UPDATE mymaps SET day = ? WHERE id = ?").bind(day, id).run();
        if (cleanNote(b.note)) await setNote(env, rid, cleanNote(b.note));
        return json({ run: runOut(await env.DB.prepare("SELECT * FROM mymap_runs WHERE id = ?").bind(rid).first()) });
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

